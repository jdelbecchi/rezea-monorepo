
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List
import uuid

from app.db.session import get_db
from app.models.models import User, UserRole, EmailTemplate, Tenant
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

# ==================== Envoi d'Emails ====================

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

    # 1) Sélectionner les destinataires
    query = select(User).where(
        User.tenant_id == current_user.tenant_id,
        User.role == UserRole.MEMBER
    )
    
    if request_data.recipient_type == "active":
        query = query.where(User.is_active == True)
        if not request_data.force_operational:
            query = query.where(User.receive_marketing_emails == True)
    elif request_data.recipient_type == "all":
        if not request_data.force_operational:
            query = query.where(User.receive_marketing_emails == True)
    elif request_data.recipient_type == "selected":
        if not request_data.selected_user_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Liste d'utilisateurs vide pour le type 'selected'"
            )
        query = query.where(User.id.in_(request_data.selected_user_ids))
        if not request_data.force_operational:
            query = query.where(User.receive_marketing_emails == True)
    elif request_data.recipient_type == "segment":
        if not request_data.segment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Segment non spécifié"
            )
        from app.api.admin_users import get_segment_user_ids
        segment_uids = await get_segment_user_ids(db, current_user.tenant_id, request_data.segment.lower())
        query = query.where(User.id.in_(segment_uids))
        if not request_data.force_operational:
            query = query.where(User.receive_marketing_emails == True)
    
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
    
    # Charger les infos de l'établissement (tenant) pour la personnalisation
    tenant_stmt = select(Tenant).where(Tenant.id == current_user.tenant_id)
    tenant_res = await db.execute(tenant_stmt)
    tenant = tenant_res.scalar_one()

    # Logo personnalisé uniquement (plus gros) s'il existe, sinon nom textuel
    logo_html = ""
    if tenant.logo_url:
        logo_html = f"""
        <div class="email-logo-wrapper" style="text-align: center; margin-bottom: 6px; line-height: 1.2;">
            <img src="http://localhost:8000{tenant.logo_url}" alt="{tenant.name}" class="email-logo" style="max-height: 140px; max-width: 100%; width: auto; display: block; margin: 0 auto; vertical-align: middle;">
        </div>
        """
    else:
        logo_html = f'<div style="text-align: center; margin-bottom: 6px;"><span style="font-size: 24px; font-weight: 700; color: #0f172a; font-family: \'Livvic\', sans-serif; letter-spacing: -0.02em;">{tenant.name}</span></div>'

    # Liens sociaux du footer (sans adresse physique)
    links = []
    if tenant.website_url:
        links.append(f'<a href="{tenant.website_url}" style="text-decoration: none; color: #64748b; font-size: 13px; margin: 0 10px; font-weight: 500;">Notre Site</a>')
    if tenant.instagram_url:
        links.append(f'<a href="{tenant.instagram_url}" style="text-decoration: none; color: #64748b; font-size: 13px; margin: 0 10px; font-weight: 500;">Instagram</a>')
    if tenant.facebook_url:
        links.append(f'<a href="{tenant.facebook_url}" style="text-decoration: none; color: #64748b; font-size: 13px; margin: 0 10px; font-weight: 500;">Facebook</a>')
    links.append(f'<a href="http://localhost:3000/{tenant.slug}/unsubscribe" style="text-decoration: none; color: #64748b; font-size: 13px; margin: 0 10px; font-weight: 500;">Se désabonner</a>')
    socials_html = f'<div style="margin-bottom: 15px; text-align: center;">{" ".join(links)}</div>'

    # Post-traitement automatique du texte de l'éditeur riche
    import re
    processed_content = request_data.content
    primary_color = request_data.custom_color or tenant.primary_color or "#7c3aed"

    # A. Détecter et envelopper les codes promos (ex: MERCIAMIS) dans un cadre double filet ton-sur-ton, fond pastel et bords 4px
    def replace_promo(match):
        code = match.group(2)
        return f"""
        <div align="center" style="margin: 24px auto; max-width: 180px; border: 3px double #a7825d; background-color: #fbf2eb; padding: 10px 20px; border-radius: 4px; text-align: center;">
            <span class="email-promo" style="font-family: 'Livvic', sans-serif; font-size: 15px; font-weight: 700; color: #a7825d; letter-spacing: 0.1em;">{code}</span>
        </div>
        """
    processed_content = re.sub(r'<(strong|b)>([A-Z0-9_-]{4,15})</\1>', replace_promo, processed_content)

    # B. Détecter les liens isolés dans des paragraphes et les transformer en boutons d'action (fond noir, angles carrés 4px, marges internes réduites)
    def replace_button(match):
        attrs = match.group(1) or ""
        url = match.group(2)
        text = match.group(3)
        
        align = "center"
        if "align-left" in attrs or "text-align: left" in attrs:
            align = "left"
        elif "align-right" in attrs or "text-align: right" in attrs:
            align = "right"
            
        return f"""
        <div align="{align}" style="margin: 20px 0; text-align: {align};">
            <a href="{url}" class="email-button" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-family: 'Livvic', sans-serif; font-size: 14px; font-weight: 500; text-decoration: none; padding: 8px 18px; border-radius: 4px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); text-align: center;">{text}</a>
        </div>
        """
    processed_content = re.sub(r'<p([^>]*)>\s*<a href="([^"]+)"[^>]*>\s*([^<]+?)\s*</a>\s*</p>', replace_button, processed_content)

    # C. Détecter le message de salutation et le passer en semi-bold
    processed_content = re.sub(
        r'(Bonjour\s+[^,<\n\r]+,?)',
        r'<strong style="font-weight: 600; color: #0f172a;">\1</strong>',
        processed_content
    )

    # D. Détecter les images, les forcer à faire toute la largeur du cadre (marges négatives) et ajouter le slogan/phrase d'accroche au-dessus de la première image
    has_added_slogan = [False]
    def replace_image(match):
        img_tag = match.group(0)
        if 'style="' in img_tag:
            img_tag = re.sub(r'style="[^"]*"', 'style="width: 100%; height: auto; display: block;"', img_tag)
        else:
            img_tag = img_tag.replace('<img', '<img style="width: 100%; height: auto; display: block;"')
        
        slogan_html = ""
        if tenant.slogan and not has_added_slogan[0]:
            slogan_html = f"""
            <div class="email-divider" style="border-top: 1px solid #cbd5e1; margin: 10px auto 8px auto; width: 80px;"></div>
            <div class="email-slogan" style="text-align: center; font-size: 16px; font-weight: 300; color: #0f172a; margin-bottom: 8px; font-family: 'Livvic', sans-serif;">
                {tenant.slogan}
            </div>
            """
            has_added_slogan[0] = True
        return f'{slogan_html}<div class="full-width-image-wrapper" style="margin: 0 -24px 10px -24px;">{img_tag}</div>'
    
    processed_content = re.sub(r'<img[^>]+>', replace_image, processed_content)

    # Fallback si aucune image n'était présente dans l'e-mail pour afficher la phrase d'accroche/slogan
    if tenant.slogan and not has_added_slogan[0]:
        slogan_html = f"""
        <div class="email-divider" style="border-top: 1px solid #cbd5e1; margin: 10px auto 8px auto; width: 80px;"></div>
        <div class="email-slogan" style="text-align: center; font-size: 16px; font-weight: 300; color: #0f172a; margin-bottom: 10px; font-family: 'Livvic', sans-serif;">
            {tenant.slogan}
        </div>
        """
        processed_content = slogan_html + processed_content

    # Envelopper dans l'enveloppe HTML master
    html_envelope = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Livvic:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
            body, table, td, p, a, h2, div {{
                font-family: 'Livvic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
            }}
            p {{
                margin-top: 0;
                margin-bottom: 8px;
            }}
            @media only screen and (max-width: 480px) {{
                .email-body {{
                    padding: 8px !important;
                }}
                .email-container {{
                    padding: 8px 16px 16px 16px !important;
                    border-radius: 12px !important;
                }}
                .full-width-image-wrapper {{
                    margin-left: -16px !important;
                    margin-right: -16px !important;
                    margin-bottom: 8px !important;
                }}
                .email-logo {{
                    max-height: 90px !important;
                }}
                .email-logo-wrapper {{
                    margin-bottom: 2px !important;
                }}
                .email-divider {{
                    margin: 6px auto 6px auto !important;
                }}
                .email-slogan {{
                    font-size: 14px !important;
                }}
                .email-content {{
                    font-size: 14px !important;
                }}
                .email-promo {{
                    font-size: 13px !important;
                }}
                .email-button {{
                    font-size: 13px !important;
                    padding: 6px 14px !important;
                }}
            }}
        </style>
    </head>
    <body class="email-body" style="margin: 0; padding: 20px; background-color: #f8fafc;">
        <div class="email-container" style="font-family: 'Livvic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 16px 24px; border: 1px solid #e2e8f0; border-radius: 24px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            {logo_html}
            
            <div class="email-content" style="color: #334155; font-size: 16px; line-height: 1.6; font-weight: 300; text-align: center;">
                {processed_content}
            </div>
            
            <div style="border-top: 1px solid #f1f5f9; margin-top: 15px; padding-top: 10px; text-align: center;">
                {socials_html}
                <p style="font-family: 'Livvic', sans-serif; color: #94a3b8; font-size: 12px; font-weight: 500; margin: 0;">
                    © {tenant.name} - Propulsé par Rezea
                </p>
            </div>
        </div>
    </body>
    </html>
    """

    # 3) Envoi (asynchrone)
    success = await mailer.send_bulk_email(
        recipients=recipients,
        subject=request_data.subject,
        html_content=html_envelope
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

# ==================== Modèles d'Email ====================

@router.get("/templates", response_model=List[schemas.EmailTemplateResponse])
async def list_email_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    """Liste les modèles d'email du club"""
    result = await db.execute(
        select(EmailTemplate)
        .where(EmailTemplate.tenant_id == current_user.tenant_id)
        .order_by(EmailTemplate.created_at.desc())
    )
    return result.scalars().all()

@router.post("/templates", response_model=schemas.EmailTemplateResponse)
async def create_email_template(
    template_in: schemas.EmailTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    """Crée un nouveau modèle d'email"""
    template = EmailTemplate(
        **template_in.model_dump(),
        tenant_id=current_user.tenant_id
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template

@router.delete("/templates/{template_id}", response_model=dict)
async def delete_email_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    """Supprime un modèle d'email"""
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.tenant_id == current_user.tenant_id
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Modèle non trouvé"
        )
    
    await db.delete(template)
    await db.commit()
    return {"message": "Modèle supprimé avec succès"}
