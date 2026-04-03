
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List
import uuid

from app.db.session import get_db
from app.models.models import User, UserRole
from app.schemas import schemas
from app.core import mailer

router = APIRouter()

async def require_manager(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Vérifie que l'utilisateur connecté est owner ou manager"""
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id

    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()

    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux managers"
        )
    return user

@router.post("/send", response_model=dict)
async def send_admin_emails(
    request_data: schemas.EmailSendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    """
    Envoie un email groupé aux utilisateurs selon le type de destinataire.
    """
    if current_user.role not in [UserRole.OWNER, UserRole.MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seuls les administrateurs peuvent envoyer des emails"
        )

    tenant_id = request_data.tenant_id if hasattr(request_data, 'tenant_id') else current_user.tenant_id
    
    # 1) Sélectionner les destinataires
    query = select(User).where(User.tenant_id == current_user.tenant_id)
    
    if request_data.recipient_type == "active":
        query = query.where(User.is_active == True)
        # Filter by marketing consent
        query = query.where(User.receive_marketing_emails == True)
    elif request_data.recipient_type == "all":
        # Filter by marketing consent
        query = query.where(User.receive_marketing_emails == True)
    elif request_data.recipient_type == "selected":
        if not request_data.selected_user_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Liste d'utilisateurs vide pour le type 'selected'"
            )
        query = query.where(User.id.in_(request_data.selected_user_ids))
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    if not users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucun destinataire trouvé pour ces critères"
        )
    
    # 2) Préparer les données pour le mailer
    recipients = [
        {"email": u.email, "name": f"{u.first_name} {u.last_name}"}
        for u in users
    ]
    
    # 3) Envoi (asynchrone)
    success = await mailer.send_bulk_email(
        recipients=recipients,
        subject=request_data.subject,
        html_content=request_data.content
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Une erreur est survenue lors de l'envoi de certains emails"
        )
    
    return {
        "message": f"Email envoyé avec succès à {len(recipients)} destinataires",
        "count": len(recipients)
    }
