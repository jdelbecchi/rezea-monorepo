"""Routes upload — gestion des fichiers (bannières, etc.)"""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import User, Tenant, UserRole
import structlog

logger = structlog.get_logger()
router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_DOC_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


async def get_admin_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Vérifie que l'utilisateur est admin du tenant"""
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    
    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs du club"
        )
    return user


@router.post("/banner")
async def upload_banner(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Upload d'une image bannière pour le club (admin only)"""
    # Vérifier l'extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format non supporté. Formats acceptés: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Lire et vérifier la taille
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fichier trop volumineux (max 5 Mo)"
        )
    
    # Créer le dossier tenant
    tenant_id = str(request.state.tenant_id)
    tenant_dir = os.path.join(UPLOAD_DIR, tenant_id)
    os.makedirs(tenant_dir, exist_ok=True)
    
    # Sauvegarder avec un nom unique
    filename = f"banner_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(tenant_dir, filename)
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    # Mettre à jour le tenant
    banner_url = f"/uploads/{tenant_id}/{filename}"
    
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if tenant:
        # Supprimer l'ancienne bannière si elle existe
        if tenant.banner_url:
            old_path = os.path.join(os.path.dirname(UPLOAD_DIR), tenant.banner_url.lstrip("/"))
            if os.path.exists(old_path):
                os.remove(old_path)
        
        tenant.banner_url = banner_url
        await db.commit()
    
    logger.info("Banner uploaded", tenant_id=tenant_id, filename=filename)
    
    return {"banner_url": banner_url, "message": "Bannière mise à jour avec succès"}


@router.post("/logo")
async def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Upload du logo pour le club (admin only)"""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format non supporté. Formats acceptés: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fichier trop volumineux (max 5 Mo)"
        )
    
    tenant_id = str(request.state.tenant_id)
    tenant_dir = os.path.join(UPLOAD_DIR, tenant_id)
    os.makedirs(tenant_dir, exist_ok=True)
    
    filename = f"logo_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(tenant_dir, filename)
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    logo_url = f"/uploads/{tenant_id}/{filename}"
    
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if tenant:
        if tenant.logo_url:
            old_path = os.path.join(os.path.dirname(UPLOAD_DIR), tenant.logo_url.lstrip("/"))
            if os.path.exists(old_path):
                os.remove(old_path)
        
        tenant.logo_url = logo_url
        await db.commit()
    
    logger.info("Logo uploaded", tenant_id=tenant_id, filename=filename)
    
    return {"logo_url": logo_url, "message": "Logo mis à jour avec succès"}


@router.post("/login-bg")
async def upload_login_bg(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Upload de l'image de fond pour le portail de connexion (admin only)"""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format non supporté. Formats acceptés: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    content = await file.read()
    if len(content) > MAX_FILE_SIZE * 2: # 10 MB for high-res backgrounds
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fichier trop volumineux (max 10 Mo)"
        )
    
    tenant_id = str(request.state.tenant_id)
    tenant_dir = os.path.join(UPLOAD_DIR, tenant_id)
    os.makedirs(tenant_dir, exist_ok=True)
    
    filename = f"login_bg_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(tenant_dir, filename)
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    login_bg_url = f"/uploads/{tenant_id}/{filename}"
    
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if tenant:
        if tenant.login_background_url:
            old_path = os.path.join(os.path.dirname(UPLOAD_DIR), tenant.login_background_url.lstrip("/"))
            if os.path.exists(old_path):
                os.remove(old_path)
        
        tenant.login_background_url = login_bg_url
        await db.commit()
    
    logger.info("Login background uploaded", tenant_id=tenant_id, filename=filename)
    
    return {"login_background_url": login_bg_url, "message": "Image de fond du portail mise à jour avec succès"}


@router.post("/document")
async def upload_document(
    request: Request,
    doc_type: str, # "cgv" or "rules"
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Upload d'un document légal (CGV ou Règlement)"""
    if doc_type not in ("cgv", "rules"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Type de document invalide"
        )

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_DOC_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format non supporté. Formats acceptés: {', '.join(ALLOWED_DOC_EXTENSIONS)}"
        )
    
    content = await file.read()
    if len(content) > MAX_FILE_SIZE * 2: # 10 MB for docs
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fichier trop volumineux (max 10 Mo)"
        )
    
    tenant_id = str(request.state.tenant_id)
    tenant_dir = os.path.join(UPLOAD_DIR, tenant_id, "docs")
    os.makedirs(tenant_dir, exist_ok=True)
    
    filename = f"{doc_type}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(tenant_dir, filename)
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    doc_url = f"/uploads/{tenant_id}/docs/{filename}"
    
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if tenant:
        if doc_type == "cgv":
            if tenant.cgv_url:
                old_path = os.path.join(os.path.dirname(UPLOAD_DIR), tenant.cgv_url.lstrip("/"))
                if os.path.exists(old_path): os.remove(old_path)
            tenant.cgv_url = doc_url
        else:
            if tenant.rules_url:
                old_path = os.path.join(os.path.dirname(UPLOAD_DIR), tenant.rules_url.lstrip("/"))
                if os.path.exists(old_path): os.remove(old_path)
            tenant.rules_url = doc_url
        
        await db.commit()
    
    logger.info("Document uploaded", tenant_id=tenant_id, filename=filename, doc_type=doc_type)
    
    return {"url": doc_url, "message": f"Document {doc_type} mis à jour avec succès"}


@router.post("/image")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Upload d'une image générique (pour emails, etc.)"""
    # Vérifier l'extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format non supporté. Formats acceptés: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Lire et vérifier la taille
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fichier trop volumineux (max 5 Mo)"
        )
    
    # Créer le dossier images pour ce tenant
    tenant_id = str(request.state.tenant_id)
    images_dir = os.path.join(UPLOAD_DIR, tenant_id, "images")
    os.makedirs(images_dir, exist_ok=True)
    
    # Sauvegarder avec un nom unique pour éviter les collisions
    filename = f"img_{uuid.uuid4().hex[:12]}{ext}"
    filepath = os.path.join(images_dir, filename)
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    # URL publique du fichier
    url = f"/uploads/{tenant_id}/images/{filename}"
    
    logger.info("Image uploaded", tenant_id=tenant_id, filename=filename, url=url)
    
    return {"url": url, "message": "Image uploadée avec succès"}
