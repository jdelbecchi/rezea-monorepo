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
        self.client_id = settings.HELLOASSO_CLIENT_ID
        self.client_secret = settings.HELLOASSO_CLIENT_SECRET
        self.organization_slug = settings.HELLOASSO_ORGANIZATION_SLUG
        self.return_url = settings.HELLOASSO_RETURN_URL or "http://localhost:3000/dashboard/credits/callback"
        self.error_url = settings.HELLOASSO_ERROR_URL or "http://localhost:3000/dashboard/credits/error"
        
        # Cache du token
        self._access_token: Optional[str] = None
        self._token_expires_at: Optional[datetime] = None
    
    async def get_access_token(self) -> str:
        """
        Obtient un token d'accès OAuth 2.0
        Utilise le cache si le token est encore valide
        """
        # Vérifier si le token en cache est encore valide
        if self._access_token and self._token_expires_at:
            if datetime.now() < self._token_expires_at - timedelta(minutes=5):
                return self._access_token
        
        # Obtenir un nouveau token
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.oauth_url,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "client_credentials"
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code != 200:
                logger.error(f"HelloAsso OAuth error: {response.text}")
                raise Exception(f"Failed to get HelloAsso access token: {response.status_code}")
            
            data = response.json()
            self._access_token = data["access_token"]
            expires_in = data.get("expires_in", 1800)  # Default 30 minutes
            self._token_expires_at = datetime.now() + timedelta(seconds=expires_in)
            
            logger.info("HelloAsso access token obtained successfully")
            return self._access_token
    
    async def create_checkout_intent(
        self,
        amount_cents: int,
        user_email: str,
        user_first_name: str,
        user_last_name: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Crée une intention de paiement (checkout intent)
        
        Args:
            amount_cents: Montant en centimes (ex: 5000 pour 50€)
            user_email: Email de l'utilisateur
            user_first_name: Prénom
            user_last_name: Nom
            metadata: Métadonnées additionnelles (ex: user_id, transaction_id)
        
        Returns:
            Dict contenant l'URL de redirection et l'ID du checkout
        """
        token = await self.get_access_token()
        
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
                f"{self.api_url}/organizations/{self.organization_slug}/checkout-intents",
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
    
    def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """
        Vérifie la signature d'un webhook HelloAsso
        
        Args:
            payload: Corps de la requête (string)
            signature: Signature fournie dans le header
        
        Returns:
            True si la signature est valide
        """
        # TODO: Implémenter la vérification de signature
        # HelloAsso utilise HMAC-SHA256 avec le webhook secret
        import hmac
        import hashlib
        
        if not settings.HELLOASSO_WEBHOOK_SECRET:
            logger.warning("HELLOASSO_WEBHOOK_SECRET not configured, skipping signature verification")
            return True
        
        expected_signature = hmac.new(
            settings.HELLOASSO_WEBHOOK_SECRET.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_signature, signature)


# Instance globale du service
helloasso_service = HelloAssoService()
