"""
Gestion de la sécurité: JWT, hashing, validation
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status

from app.core.config import settings

# Context pour le hashing de mots de passe
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe contre son hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash un mot de passe"""
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Crée un JWT token
    
    Args:
        data: Données à encoder (doit contenir 'sub' pour user_id et 'tenant_id')
        expires_delta: Durée de validité optionnelle
    
    Returns:
        Token JWT encodé
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    
    return encoded_jwt


def verify_token(token: str) -> Dict[str, Any]:
    """
    Vérifie et décode un JWT token
    
    Args:
        token: Token JWT à vérifier
    
    Returns:
        Payload du token
    
    Raises:
        HTTPException: Si le token est invalide
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        
        user_id: str = payload.get("sub")
        tenant_id: str = payload.get("tenant_id")
        
        if user_id is None or tenant_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalide: données manquantes"
            )
        
        return payload
        
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token invalide: {str(e)}"
        )


def validate_password_strength(password: str) -> bool:
    """
    Valide la force d'un mot de passe
    
    Règles:
    - Minimum 8 caractères
    - Au moins une majuscule
    - Au moins un chiffre
    """
    if len(password) < 8:
        return False
    
    has_upper = any(c.isupper() for c in password)
    has_digit = any(c.isdigit() for c in password)
    
    return has_upper and has_digit


def create_sysadmin_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Crée un JWT token pour sysadmin (sans tenant_id)
    """
    to_encode = data.copy()
    to_encode["role"] = "sysadmin"
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_sysadmin_token(token: str) -> Dict[str, Any]:
    """
    Vérifie un JWT token sysadmin (role=sysadmin, pas de tenant_id)
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        
        if payload.get("role") != "sysadmin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Accès sysadmin requis"
            )
        
        return payload
        
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token sysadmin invalide: {str(e)}"
        )


def create_reset_token(user_id: str) -> str:
    """
    Crée un JWT token pour la réinitialisation de mot de passe.
    Durée de vie : 30 minutes.
    """
    expire = datetime.utcnow() + timedelta(minutes=30)
    to_encode = {
        "sub": user_id,
        "purpose": "password_reset",
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_reset_token(token: str) -> str:
    """
    Vérifie un token de réinitialisation de mot de passe.

    Returns:
        user_id (str)

    Raises:
        HTTPException si le token est invalide ou expiré
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )

        if payload.get("purpose") != "password_reset":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token invalide"
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token invalide"
            )

        return user_id

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token invalide ou expiré"
        )
