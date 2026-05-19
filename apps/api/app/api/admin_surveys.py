"""
API pour la gestion des enquêtes de satisfaction (Admin & Public Feedback)
"""
from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List, Optional
from uuid import UUID
import secrets
from datetime import datetime

from app.db.session import get_db
from app.models.models import (
    User, UserRole, SurveyCampaign, SurveyResponse, Booking, BookingStatus,
    EventRegistration, EventRegistrationStatus, Session, Event
)
from app.schemas.schemas import (
    SurveyCampaignCreate, SurveyCampaignResponse, SurveyResponseSubmit,
    SurveyResponsePublic
)
from app.api.admin_users import require_manager, get_segment_user_ids

router = APIRouter()


# ==================== ADMIN SURVEYS ====================

@router.post("/admin/surveys/campaigns", response_model=SurveyCampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_survey_campaign(
    request: Request,
    data: SurveyCampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Crée une nouvelle campagne d'enquête et génère des jetons individuels"""
    tenant_id = request.state.tenant_id

    # 1. Créer la campagne d'enquête
    campaign = SurveyCampaign(
        tenant_id=tenant_id,
        title=data.title,
        survey_type=data.survey_type,
        event_id=data.event_id,
        session_id=data.session_id
    )
    db.add(campaign)
    await db.flush()  # Récupérer l'id auto-généré

    # 2. Identifier l'audience cible
    target_user_ids = []

    if data.survey_type == "event":
        is_participants_only = True
        if data.target_segment:
            segments = [s.strip().lower() for s in data.target_segment.split(",") if s.strip()]
            if segments and segments != ["participants"]:
                is_participants_only = False
        
        if is_participants_only:
            if data.event_id:
                # Récupérer les inscrits confirmés ou présents à l'événement
                stmt = select(EventRegistration.user_id).where(
                    EventRegistration.tenant_id == tenant_id,
                    EventRegistration.event_id == data.event_id,
                    EventRegistration.status.in_([
                        EventRegistrationStatus.CONFIRMED,
                        EventRegistrationStatus.PENDING_PAYMENT
                    ])
                )
                res = await db.execute(stmt)
                target_user_ids = [row[0] for row in res.all()]
            elif data.session_id:
                # Récupérer les réservations confirmées de la séance
                stmt = select(Booking.user_id).where(
                    Booking.tenant_id == tenant_id,
                    Booking.session_id == data.session_id,
                    Booking.status == BookingStatus.CONFIRMED
                )
                res = await db.execute(stmt)
                target_user_ids = [row[0] for row in res.all()]
        else:
            segments = [s.strip().lower() for s in data.target_segment.split(",") if s.strip()]
            if "tous" in segments or "all" in segments:
                stmt = select(User.id).where(
                    User.tenant_id == tenant_id,
                    User.role == UserRole.MEMBER,
                    User.receive_marketing_emails == True
                )
                res = await db.execute(stmt)
                target_user_ids = [row[0] for row in res.all()]
            else:
                segment_uids = set()
                for seg in segments:
                    if seg == "participants":
                        if data.event_id:
                            stmt = select(EventRegistration.user_id).where(
                                EventRegistration.tenant_id == tenant_id,
                                EventRegistration.event_id == data.event_id,
                                EventRegistration.status.in_([
                                    EventRegistrationStatus.CONFIRMED,
                                    EventRegistrationStatus.PENDING_PAYMENT
                                ])
                            )
                            res = await db.execute(stmt)
                            segment_uids.update([row[0] for row in res.all()])
                        elif data.session_id:
                            stmt = select(Booking.user_id).where(
                                Booking.tenant_id == tenant_id,
                                Booking.session_id == data.session_id,
                                Booking.status == BookingStatus.CONFIRMED
                            )
                            res = await db.execute(stmt)
                            segment_uids.update([row[0] for row in res.all()])
                    else:
                        uids = await get_segment_user_ids(db, tenant_id, seg)
                        segment_uids.update(uids)
                target_user_ids = list(segment_uids)
    else:  # general
        if data.target_segment:
            segments = [s.strip().lower() for s in data.target_segment.split(",") if s.strip()]
            if "tous" in segments or "all" in segments:
                stmt = select(User.id).where(
                    User.tenant_id == tenant_id,
                    User.role == UserRole.MEMBER,
                    User.receive_marketing_emails == True
                )
                res = await db.execute(stmt)
                target_user_ids = [row[0] for row in res.all()]
            else:
                segment_uids = set()
                for seg in segments:
                    uids = await get_segment_user_ids(db, tenant_id, seg)
                    segment_uids.update(uids)
                target_user_ids = list(segment_uids)
        else:
            # Par défaut, cibler tous les membres ayant accepté le marketing
            stmt = select(User.id).where(
                User.tenant_id == tenant_id,
                User.role == UserRole.MEMBER,
                User.receive_marketing_emails == True
            )
            res = await db.execute(stmt)
            target_user_ids = [row[0] for row in res.all()]

    # Éviter tout doublon d'utilisateur dans la campagne
    target_user_ids = list(set(target_user_ids))

    if not target_user_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun utilisateur cible n'a été trouvé pour cette configuration de campagne."
        )

    # 3. Générer un jeton unique et une ligne SurveyResponse par utilisateur
    for uid in target_user_ids:
        token = secrets.token_urlsafe(32)
        response = SurveyResponse(
            tenant_id=tenant_id,
            campaign_id=campaign.id,
            user_id=uid,
            token=token
        )
        db.add(response)

    await db.commit()
    await db.refresh(campaign)

    # Remplir les statistiques dérivées pour la réponse API
    campaign.responses_count = len(target_user_ids)
    campaign.average_rating = None

    return campaign


@router.get("/admin/surveys/campaigns", response_model=List[SurveyCampaignResponse])
async def list_survey_campaigns(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Liste toutes les enquêtes créées par le club avec leurs statistiques résumées"""
    tenant_id = request.state.tenant_id

    stmt = (
        select(SurveyCampaign)
        .where(SurveyCampaign.tenant_id == tenant_id)
        .order_by(SurveyCampaign.created_at.desc())
    )
    res = await db.execute(stmt)
    campaigns = res.scalars().all()

    enriched_campaigns = []
    for camp in campaigns:
        # Total de réponses générées
        stmt_count = select(func.count(SurveyResponse.id)).where(
            SurveyResponse.campaign_id == camp.id
        )
        res_count = await db.execute(stmt_count)
        responses_count = res_count.scalar() or 0

        # Note moyenne des répondants
        stmt_avg = select(func.avg(SurveyResponse.rating)).where(
            SurveyResponse.campaign_id == camp.id,
            SurveyResponse.rating.isnot(None)
        )
        res_avg = await db.execute(stmt_avg)
        avg_rating = res_avg.scalar()

        camp.responses_count = responses_count
        camp.average_rating = float(avg_rating) if avg_rating is not None else None
        enriched_campaigns.append(camp)

    return enriched_campaigns


@router.get("/admin/surveys/campaigns/{campaign_id}")
async def get_survey_campaign_details(
    campaign_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Récupère les statistiques détaillées d'une enquête et l'historique des notes et avis"""
    tenant_id = request.state.tenant_id

    stmt_campaign = select(SurveyCampaign).where(
        SurveyCampaign.id == campaign_id,
        SurveyCampaign.tenant_id == tenant_id
    )
    res_campaign = await db.execute(stmt_campaign)
    campaign = res_campaign.scalar_one_or_none()

    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campagne d'enquête non trouvée"
        )

    # Récupérer les statistiques globales
    stmt_stats = (
        select(
            func.count(SurveyResponse.id),
            func.count(SurveyResponse.rating),
            func.avg(SurveyResponse.rating)
        ).where(SurveyResponse.campaign_id == campaign_id)
    )
    res_stats = await db.execute(stmt_stats)
    total_sent, total_votes, average_rating = res_stats.first() or (0, 0, None)

    # Récupérer l'historique des retours avec le nom de l'utilisateur
    stmt_responses = (
        select(SurveyResponse, User)
        .join(User, SurveyResponse.user_id == User.id)
        .where(SurveyResponse.campaign_id == campaign_id)
        .order_by(SurveyResponse.submitted_at.desc(), SurveyResponse.clicked_at.desc())
    )
    res_responses = await db.execute(stmt_responses)
    rows = res_responses.all()

    responses_list = []
    for resp, usr in rows:
        responses_list.append({
            "id": str(resp.id),
            "user_name": f"{usr.first_name} {usr.last_name}",
            "user_email": usr.email,
            "rating": resp.rating,
            "comment": resp.comment,
            "token": resp.token,
            "clicked_at": resp.clicked_at.isoformat() if resp.clicked_at else None,
            "submitted_at": resp.submitted_at.isoformat() if resp.submitted_at else None,
        })

    # Contexte descriptif de la séance / événement
    context_title = None
    if campaign.survey_type == "event" and campaign.event_id:
        stmt_ev = select(Event.title).where(Event.id == campaign.event_id)
        res_ev = await db.execute(stmt_ev)
        context_title = res_ev.scalar()
    elif campaign.survey_type == "event" and campaign.session_id:
        stmt_sess = select(Session.title).where(Session.id == campaign.session_id)
        res_sess = await db.execute(stmt_sess)
        context_title = res_sess.scalar()

    return {
        "id": str(campaign.id),
        "title": campaign.title,
        "survey_type": campaign.survey_type,
        "created_at": campaign.created_at.isoformat(),
        "context_title": context_title,
        "stats": {
            "total_sent": total_sent,
            "total_responses": total_votes,
            "response_rate": (total_votes / total_sent * 100) if total_sent > 0 else 0,
            "average_rating": float(average_rating) if average_rating is not None else None,
        },
        "responses": responses_list
    }


@router.post("/admin/surveys/campaigns/{campaign_id}/send")
async def send_survey_campaign_emails(
    campaign_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    """Envoie des e-mails personnalisés avec jetons 1-Click à toute la cible de l'enquête"""
    tenant_id = request.state.tenant_id

    # 1. Récupérer la campagne
    stmt_campaign = select(SurveyCampaign).where(
        SurveyCampaign.id == campaign_id,
        SurveyCampaign.tenant_id == tenant_id
    )
    res_campaign = await db.execute(stmt_campaign)
    campaign = res_campaign.scalar_one_or_none()

    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campagne non trouvée"
        )

    # 2. Récupérer tous les jetons générés pour cette campagne
    stmt_responses = (
        select(SurveyResponse, User)
        .join(User, SurveyResponse.user_id == User.id)
        .where(SurveyResponse.campaign_id == campaign_id)
    )
    res_responses = await db.execute(stmt_responses)
    rows = res_responses.all()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun destinataire n'a été généré pour cette campagne."
        )

    # Récupérer les infos du tenant pour construire l'URL de feedback
    from app.models.models import Tenant
    tenant_stmt = select(Tenant).where(Tenant.id == tenant_id)
    tenant_res = await db.execute(tenant_stmt)
    tenant = tenant_res.scalar_one()

    # 3. Envoyer les e-mails un par un de manière personnalisée (asynchrone)
    from app.core import mailer
    sent_count = 0
    
    # URL publique pour la page de destination (Next.js)
    # L'adresse pointe vers le portail client Rezea
    base_url = f"http://localhost:3000/{tenant.slug}/feedback"

    for resp, usr in rows:
        # Template HTML premium avec smileys cliquables et style Zen
        html_body = f"""
        <div style="font-family: 'Outfit', 'Helvetica Neue', Arial, sans-serif; max-width: 550px; margin: 0 auto; padding: 40px 30px; border: 1px solid #e2e8f0; border-radius: 24px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="text-align: center; margin-bottom: 30px;">
                <span style="font-size: 40px; display: inline-block; margin-bottom: 10px;">✨</span>
                <h2 style="color: #0f172a; font-size: 22px; font-weight: 600; margin: 0; tracking: -0.02em;">Votre avis nous intéresse !</h2>
            </div>
            
            <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 30px;">
                Bonjour {usr.first_name},<br><br>
                Nous aimerions beaucoup avoir votre retour concernant :<br>
                <strong style="color: #0f172a; font-size: 16px;">"{campaign.title}"</strong>.
            </p>
            
            <div style="background-color: #f8fafc; border-radius: 20px; padding: 30px 20px; margin-bottom: 30px; text-align: center;">
                <p style="color: #334155; font-size: 14px; font-weight: 600; margin: 0 0 20px 0; text-transform: uppercase; letter-spacing: 0.05em;">
                    Comment évaluez-vous votre expérience ?
                </p>
                
                <table align="center" style="margin: 0 auto;">
                    <tr>
                        <td style="padding: 0 8px;">
                            <a href="{base_url}?t={resp.token}&r=1" style="text-decoration: none; font-size: 38px; display: inline-block; transition: transform 0.2s;" title="Pas du tout satisfait">😠</a>
                        </td>
                        <td style="padding: 0 8px;">
                            <a href="{base_url}?t={resp.token}&r=2" style="text-decoration: none; font-size: 38px; display: inline-block; transition: transform 0.2s;" title="Peu satisfait">🙁</a>
                        </td>
                        <td style="padding: 0 8px;">
                            <a href="{base_url}?t={resp.token}&r=3" style="text-decoration: none; font-size: 38px; display: inline-block; transition: transform 0.2s;" title="Moyen">😐</a>
                        </td>
                        <td style="padding: 0 8px;">
                            <a href="{base_url}?t={resp.token}&r=4" style="text-decoration: none; font-size: 38px; display: inline-block; transition: transform 0.2s;" title="Satisfait">🙂</a>
                        </td>
                        <td style="padding: 0 8px;">
                            <a href="{base_url}?t={resp.token}&r=5" style="text-decoration: none; font-size: 38px; display: inline-block; transition: transform 0.2s;" title="Très satisfait">😍</a>
                        </td>
                    </tr>
                </table>
            </div>

            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0; line-height: 1.5;">
                Un clic sur un smiley valide automatiquement votre avis. Vous pourrez ensuite ajouter un commentaire libre si vous le souhaitez.<br>
                Cet e-mail automatique respecte votre vie privée et est sécurisé.
            </p>
            
            <div style="border-top: 1px solid #f1f5f9; margin-top: 30px; padding-top: 20px; text-align: center;">
                <p style="color: #64748b; font-size: 13px; font-weight: 500; margin: 0;">
                    {tenant.name}
                </p>
            </div>
        </div>
        """

        success = await mailer.send_email(
            recipient_email=usr.email,
            recipient_name=f"{usr.first_name} {usr.last_name}",
            subject=f"Votre avis sur : {campaign.title} ✨",
            html_content=html_body
        )
        if success:
            sent_count += 1

    return {
        "message": f"Campagne d'enquête diffusée avec succès à {sent_count} destinataires.",
        "count": sent_count
    }


# ==================== PUBLIC FEEDBACK (1-CLICK NATIVE) ====================

@router.get("/public/feedback/{token}", response_model=SurveyResponsePublic)
async def get_public_feedback(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Récupère les infos publiques pour la page de destination du client (1-Click)"""
    stmt = (
        select(SurveyResponse, SurveyCampaign)
        .join(SurveyCampaign, SurveyResponse.campaign_id == SurveyCampaign.id)
        .where(SurveyResponse.token == token)
    )
    res = await db.execute(stmt)
    row = res.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lien d'enquête invalide ou expiré."
        )

    response, campaign = row

    # Enregistrer la date du premier clic si non renseignée
    if not response.clicked_at:
        response.clicked_at = datetime.utcnow()
        await db.commit()
        await db.refresh(response)

    return SurveyResponsePublic(
        id=response.id,
        campaign_title=campaign.title,
        rating=response.rating,
        comment=response.comment
    )


@router.post("/public/feedback/{token}")
async def submit_public_feedback(
    token: str,
    data: SurveyResponseSubmit,
    db: AsyncSession = Depends(get_db),
):
    """Enregistre le vote (smileys/étoiles) et le commentaire optionnel écrit"""
    stmt = (
        select(SurveyResponse)
        .where(SurveyResponse.token == token)
    )
    res = await db.execute(stmt)
    response = res.scalar_one_or_none()

    if not response:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lien d'enquête invalide ou expiré."
        )

    # Mettre à jour les données
    response.rating = data.rating
    response.comment = data.comment
    
    if not response.clicked_at:
        response.clicked_at = datetime.utcnow()
        
    response.submitted_at = datetime.utcnow()

    await db.commit()

    return {"detail": "Merci pour votre retour ! Votre avis a bien été enregistré."}
