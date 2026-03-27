"""Routes utilisateurs"""
from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import UserResponse, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Récupère l'utilisateur connecté"""
    user_id = request.state.user_id
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )
    
    return user


@router.patch("/me", response_model=UserResponse)
async def update_current_user(
    update_data: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Met à jour l'utilisateur connecté"""
    user_id = request.state.user_id
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )
    
    # Mise à jour des champs autorisés (on exclut les champs sensibles)
    update_dict = update_data.model_dump(exclude_unset=True)
    
    # Champs interdits à la modification par l'utilisateur lui-même
    forbidden_fields = ["role", "is_active", "is_blacklisted", "blacklist_reason"]
    
    for field, value in update_dict.items():
        if field not in forbidden_fields:
            setattr(user, field, value)
    
    # Gestion spéciale du mot de passe
    if update_data.password:
        from app.core.security import get_password_hash
        user.hashed_password = get_password_hash(update_data.password)
    
    await db.commit()
    await db.refresh(user)
    
    return user
