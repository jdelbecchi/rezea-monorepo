
import os
import structlog
from jinja2 import Environment, FileSystemLoader, select_autoescape
from app.core.mailer import send_email
from app.core.config import settings
from app.models.models import Tenant, User, Order

logger = structlog.get_logger()

# Base directory for templates
TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")

env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(['html', 'xml'])
)

class EmailService:
    @staticmethod
    async def _render_and_send(
        to_email: str,
        to_name: str,
        subject: str,
        template_name: str,
        tenant: Tenant,
        context: dict = {}
    ):
        """
        Renders a template and sends it via MailerSend.
        """
        try:
            template = env.get_template(template_name)
            
            # Base context shared by all templates
            base_context = {
                "tenant_name": tenant.name,
                "primary_color": tenant.primary_color,
                "logo_url": tenant.logo_url,
                "legal_address": tenant.legal_address,
                "instagram_handle": tenant.instagram_handle,
                "facebook_handle": tenant.facebook_handle,
                "dashboard_url": f"{settings.FRONTEND_URL}/{tenant.slug}/dashboard",
                "settings_url": f"{settings.FRONTEND_URL}/{tenant.slug}/profile"
            }
            
            full_context = {**base_context, **context}
            html_content = template.render(full_context)
            
            return await send_email(
                to_email=to_email,
                to_name=to_name,
                subject=f"[{tenant.name}] {subject}",
                html_content=html_content
            )
        except Exception as e:
            logger.error("❌ Erreur lors de la génération/envoi de l'email", error=str(e), template=template_name)
            return False

    @classmethod
    async def send_order_receipt(cls, user: User, tenant: Tenant, order: Order, offer_name: str):
        """
        Envoie un reçu de commande (Offres / Crédits).
        """
        price_fmt = f"{order.price_cents / 100:.2f}€".replace(".", ",")
        
        context = {
            "first_name": user.first_name,
            "offer_name": offer_name,
            "price": price_fmt,
            "payment_status": order.payment_status,
            "payment_link": tenant.payment_redirect_link
        }
        
        return await cls._render_and_send(
            to_email=user.email,
            to_name=f"{user.first_name} {user.last_name}",
            subject="Reçu de votre commande",
            template_name="order_receipt.html",
            tenant=tenant,
            context=context
        )

    @classmethod
    async def send_event_registration(cls, user: User, tenant: Tenant, event: any, registration: any):
        """
        Envoie une confirmation d'inscription à un évènement.
        """
        price_fmt = f"{registration.price_paid_cents / 100:.2f}€".replace(".", ",")
        
        # On utilise le lien de paiement spécifique de l'évènement s'il existe, sinon celui du tenant
        payment_link = getattr(event, "payment_link", None) or tenant.payment_redirect_link
        
        status_val = str(registration.status.value) if hasattr(registration.status, "value") else str(registration.status)
        is_waitlist = status_val == "waiting_list"
        
        context = {
            "first_name": user.first_name,
            "event_title": event.title,
            "event_date": event.event_date.strftime("%d/%m/%Y") if hasattr(event.event_date, "strftime") else event.event_date,
            "event_time": event.event_time.strftime("%H:%M") if hasattr(event.event_time, "strftime") else event.event_time,
            "price": price_fmt,
            "payment_status": registration.payment_status,
            "payment_link": payment_link,
            "is_waitlist": is_waitlist
        }
        
        subject = f"Inscription sur liste d'attente : {event.title}" if is_waitlist else f"Confirmation : {event.title}"
        
        return await cls._render_and_send(
            to_email=user.email,
            to_name=f"{user.first_name} {user.last_name}",
            subject=subject,
            template_name="event_registration.html",
            tenant=tenant,
            context=context
        )

    @classmethod
    async def send_bulk_event_cancellation(cls, users: list[User], tenant: Tenant, event: any):
        """
        Envoie un email d'annulation à une liste d'utilisateurs.
        """
        for user in users:
            context = {
                "first_name": user.first_name,
                "event_title": event.title,
                "event_date": event.event_date.strftime("%d/%m/%Y") if hasattr(event.event_date, "strftime") else event.event_date,
                "event_time": event.event_time.strftime("%H:%M") if hasattr(event.event_time, "strftime") else event.event_time,
            }
            await cls._render_and_send(
                to_email=user.email,
                to_name=f"{user.first_name} {user.last_name}",
                subject=f"Annulation : {event.title}",
                template_name="event_cancellation.html",
                tenant=tenant,
                context=context
            )

    @classmethod
    async def send_bulk_event_modification(cls, users: list[User], tenant: Tenant, event: any):
        """
        Envoie un email de modification à une liste d'utilisateurs.
        """
        for user in users:
            context = {
                "first_name": user.first_name,
                "event_title": event.title,
                "event_date": event.event_date.strftime("%d/%m/%Y") if hasattr(event.event_date, "strftime") else event.event_date,
                "event_time": event.event_time.strftime("%H:%M") if hasattr(event.event_time, "strftime") else event.event_time,
            }
            await cls._render_and_send(
                to_email=user.email,
                to_name=f"{user.first_name} {user.last_name}",
                subject=f"Modification : {event.title}",
                template_name="event_modification.html",
                tenant=tenant,
                context=context
            )

    @classmethod
    async def send_event_promotion(cls, user: User, tenant: Tenant, event: any, registration: any):
        """
        Envoie un email de promotion (liste d'attente -> confirmé).
        """
        payment_link = getattr(event, "payment_link", None) or tenant.payment_redirect_link
        
        context = {
            "first_name": user.first_name,
            "event_title": event.title,
            "event_date": event.event_date.strftime("%d/%m/%Y") if hasattr(event.event_date, "strftime") else event.event_date,
            "event_time": event.event_time.strftime("%H:%M") if hasattr(event.event_time, "strftime") else event.event_time,
            "payment_status": registration.payment_status,
            "payment_link": payment_link
        }
        
        return await cls._render_and_send(
            to_email=user.email,
            to_name=f"{user.first_name} {user.last_name}",
            subject=f"Une place s'est libérée ! {event.title}",
            template_name="event_promotion.html",
            tenant=tenant,
            context=context
        )

    @classmethod
    async def send_h24_reminder(cls, user: User, tenant: Tenant, title: str, start_time: datetime, location: str = None, is_event: bool = False):
        """
        Envoie un rappel 24h avant une séance ou un évènement.
        """
        context = {
            "first_name": user.first_name,
            "title": title,
            "date": start_time.strftime("%d/%m/%Y"),
            "time": start_time.strftime("%H:%M"),
            "location": location,
            "activity_type_label": "évènement" if is_event else "séance"
        }
        
        return await cls._render_and_send(
            to_email=user.email,
            to_name=f"{user.first_name} {user.last_name}",
            subject=f"Rappel : {title} demain !",
            template_name="reminder_h24.html",
            tenant=tenant,
            context=context
        )
