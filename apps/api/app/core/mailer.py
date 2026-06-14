
import httpx
import structlog
from app.core.config import settings

logger = structlog.get_logger()

async def send_email(
    to_email: str = None,
    to_name: str = None,
    subject: str = None,
    html_content: str = None,
    from_email: str = None,
    from_name: str = None,
    **kwargs
):
    """
    Envoie un email via MailerSend. 
    En mode développement (sans clé API), l'email est loggé dans la console.
    """
    dest_email = to_email or kwargs.get("recipient_email")
    dest_name = to_name or kwargs.get("recipient_name") or ""
    
    if not dest_email:
        logger.error("❌ send_email: destinataire manquant")
        return False

    sender_email = from_email or settings.MAILERSEND_FROM_EMAIL
    sender_name = from_name or settings.MAILERSEND_FROM_NAME

    if not settings.MAILERSEND_API_KEY:
        logger.info(
            "📧 [MODE DEV] Envoi d'email simulé",
            to=f"{dest_name} <{dest_email}>",
            from_addr=f"{sender_name} <{sender_email}>",
            subject=subject,
            preview=html_content[:100] + "..." if len(html_content) > 100 else html_content
        )
        return True

    url = "https://api.mailersend.com/v1/email"
    headers = {
        "Authorization": f"Bearer {settings.MAILERSEND_API_KEY}",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
    }
    
    data = {
        "from": {
            "email": sender_email,
            "name": sender_name,
        },
        "to": [
            {
                "email": dest_email,
                "name": dest_name,
            }
        ],
        "subject": subject,
        "html": html_content,
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=data)
            response.raise_for_status()
            logger.info("✅ Email envoyé avec succès", to=dest_email, subject=subject)
            return True
        except Exception as e:
            logger.error("❌ Erreur lors de l'envoi de l'email", error=str(e), to=dest_email)
            return False

async def send_bulk_email(
    recipients: list[dict],
    subject: str,
    html_content: str,
    from_email: str = None,
    from_name: str = None
):
    """
    Envoie un email à une liste de destinataires.
    Chaque destinataire doit être un dict: {"email": "...", "name": "..."}
    """
    results = []
    for recipient in recipients:
        success = await send_email(
            to_email=recipient["email"],
            to_name=recipient["name"],
            subject=subject,
            html_content=html_content,
            from_email=from_email,
            from_name=from_name
        )
        results.append(success)
    
    return all(results)
