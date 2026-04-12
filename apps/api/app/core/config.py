"""
Configuration de l'application avec Pydantic Settings
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Configuration centralisée de l'application"""
    
    # Environnement
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Application
    APP_NAME: str = "REZEA"
    API_V1_PREFIX: str = "/api"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://rezea:rezea_password@localhost:5432/rezea"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_ECHO: bool = False
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production-min-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 heures
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    # Email (MailerSend)
    MAILERSEND_API_KEY: str = ""
    MAILERSEND_FROM_EMAIL: str = "noreply@rezea.app"
    MAILERSEND_FROM_NAME: str = "REZEA"
    
    # Payment (HelloAsso)
    HELLOASSO_CLIENT_ID: str = ""
    HELLOASSO_CLIENT_SECRET: str = ""
    HELLOASSO_WEBHOOK_SECRET: str = ""
    HELLOASSO_API_URL: str = "https://api.helloasso-sandbox.com/v5"
    HELLOASSO_OAUTH_URL: str = "https://api.helloasso-sandbox.com/oauth2/token"
    HELLOASSO_ORGANIZATION_SLUG: str = ""
    HELLOASSO_RETURN_URL: str = "http://localhost:3000/dashboard/credits/callback"
    HELLOASSO_ERROR_URL: str = "http://localhost:3000/dashboard/credits/error"
    
    # Limits
    MAX_CREDITS_PER_PURCHASE: int = 100
    MAX_BOOKINGS_PER_USER: int = 50
    WAITLIST_CHECK_INTERVAL: int = 300  # 5 minutes
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Instance globale
settings = Settings()
