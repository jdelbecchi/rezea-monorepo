from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings

# Utilise Redis en production/développement, et la mémoire locale en mode test
storage_uri = settings.REDIS_URL if settings.ENVIRONMENT != "test" else "memory://"

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=storage_uri
)

