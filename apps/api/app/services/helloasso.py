"""
Service HelloAsso pour l'intégration des paiements
"""
import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)


class HelloAssoService:
    """Service pour gérer les interactions avec l'API HelloAsso"""
    
    def __init__(self):
        self.api_url = settings.HELLOASSO_API_URL or "https://api.helloasso-sandbox.com/v5"
        self.oauth_url = settings.HELLOASSO_OAUTH_URL or "https://api.helloasso-sandbox.com/oauth2/token"
        self.return_url = settings.HELLOASSO_RETURN_URL or "http://localhost:3000/dashboard/credits/callback"
        self.error_url = settings.HELLOASSO_ERROR_URL or "http://localhost:3000/dashboard/credits/error"
        
        # Cache des tokens par client_id : {client_id: (token, expires_at)}
        self._tokens_cache: Dict[str, tuple[str, datetime]] = {}
    
    async def get_access_token(self, client_id: str, client_secret: str) -> str:
        """
        Obtient un token d'accès OAuth 2.0 pour un client_id / client_secret donné.
        Utilise le cache si le token est encore valide.
        """
        # Vérifier si le token en cache est encore valide
        if client_id in self._tokens_cache:
            token, expires_at = self._tokens_cache[client_id]
            if datetime.now() < expires_at - timedelta(minutes=5):
                return token
        
        # Obtenir un nouveau token
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.oauth_url,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "client_credentials"
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code != 200:
                logger.error(f"HelloAsso OAuth error: {response.text}")
                raise Exception(f"Failed to get HelloAsso access token: {response.status_code}")
            
            data = response.json()
            token = data["access_token"]
            expires_in = data.get("expires_in", 1800)  # Default 30 minutes
            expires_at = datetime.now() + timedelta(seconds=expires_in)
            
            self._tokens_cache[client_id] = (token, expires_at)
            
            logger.info("HelloAsso access token obtained successfully")
            return token
    
    async def create_checkout_intent(
        self,
        amount_cents: int,
        user_email: str,
        user_first_name: str,
        user_last_name: str,
        client_id: str,
        client_secret: str,
        organization_slug: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Crée une intention de paiement (checkout intent) avec les identifiants d'un tenant.
        
        Args:
            amount_cents: Montant en centimes (ex: 5000 pour 50€)
            user_email: Email de l'utilisateur
            user_first_name: Prénom
            user_last_name: Nom
            client_id: Client ID HelloAsso du tenant
            client_secret: Client Secret HelloAsso du tenant
            organization_slug: Slug de l'association HelloAsso
            metadata: Métadonnées additionnelles (ex: user_id, transaction_id)
        
        Returns:
            Dict contenant l'URL de redirection et l'ID du checkout
        """
        token = await self.get_access_token(client_id, client_secret)
        
        # Construire le payload
        payload = {
            "totalAmount": amount_cents,
            "initialAmount": amount_cents,
            "itemName": f"Achat de crédits REZEA",
            "backUrl": self.return_url,
            "errorUrl": self.error_url,
            "returnUrl": self.return_url,
            "containsDonation": False,
            "payer": {
                "email": user_email,
                "firstName": user_first_name,
                "lastName": user_last_name
            }
        }
        
        # Ajouter les métadonnées si fournies
        if metadata:
            payload["metadata"] = metadata
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.api_url}/organizations/{organization_slug}/checkout-intents",
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                timeout=30.0
            )
            
            if response.status_code not in [200, 201]:
                logger.error(f"HelloAsso checkout intent error: {response.text}")
                raise Exception(f"Failed to create checkout intent: {response.status_code} - {response.text}")
            
            data = response.json()
            logger.info(f"Checkout intent created: {data.get('id')}")
            
            return {
                "checkout_id": data["id"],
                "redirect_url": data["redirectUrl"],
                "expires_at": data.get("expiresAt")
            }
    
    def verify_webhook_signature(self, payload: str, signature: str, webhook_secret: Optional[str] = None) -> bool:
        """
        Vérifie la signature d'un webhook HelloAsso
        
        Args:
            payload: Corps de la requête (string)
            signature: Signature fournie dans le header
            webhook_secret: Secret de webhook spécifique au tenant
        
        Returns:
            True si la signature est valide
        """
        import hmac
        import hashlib
        
        # Priorité au secret du tenant, sinon fallback sur settings globale
        secret = webhook_secret or settings.HELLOASSO_WEBHOOK_SECRET
        
        if not secret:
            if settings.ENVIRONMENT == "production":
                logger.error("HELLOASSO_WEBHOOK_SECRET must be configured in production")
                return False
            logger.warning("HELLOASSO_WEBHOOK_SECRET not configured, skipping signature verification")
            return True
        
        expected_signature = hmac.new(
            secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_signature, signature)


# Instance globale du service
helloasso_service = HelloAssoService()
