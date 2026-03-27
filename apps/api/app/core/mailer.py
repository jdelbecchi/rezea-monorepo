
import httpx
import structlog
from app.core.config import settings

logger = structlog.get_logger()

async def send_email(to_email: str, to_name: str, subject: str, html_content: str):
    """
    Envoie un email via MailerSend. 
    En mode développement (sans clé API), l'email est loggé dans la console.
    """
    if not settings.MAILERSEND_API_KEY:
        logger.info(
            "📧 [MODE DEV] Envoi d'email simulé",
            to=f"{to_name} <{to_email}>",
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
            "email": settings.MAILERSEND_FROM_EMAIL,
            "name": settings.MAILERSEND_FROM_NAME,
        },
        "to": [
            {
                "email": to_email,
                "name": to_name,
            }
        ],
        "subject": subject,
        "html": html_content,
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=data)
            response.raise_for_status()
            logger.info("✅ Email envoyé avec succès", to=to_email, subject=subject)
            return True
        except Exception as e:
            logger.error("❌ Erreur lors de l'envoi de l'email", error=str(e), to=to_email)
            return False

async def send_bulk_email(recipients: list[dict], subject: str, html_content: str):
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
            html_content=html_content
        )
        results.append(success)
    
    return all(results)
