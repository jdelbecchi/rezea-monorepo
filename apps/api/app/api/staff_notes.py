"""
API Staff Notes — Notes du staff vers les managers
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import User, UserRole, StaffNote
from app.schemas.schemas import StaffNoteUpsert, StaffNoteOut

router = APIRouter()


# ---- Auth dependencies ----

async def require_staff(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Vérifie que l'utilisateur est au moins staff"""
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès refusé")
    return user


async def require_manager(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Vérifie que l'utilisateur est au moins manager"""
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux managers",
        )
    return user


# ---- Helpers ----

def _build_note_out(note: StaffNote) -> StaffNoteOut:
    author_name = ""
    if note.author:
        author_name = f"{note.author.first_name} {note.author.last_name}".strip()
    return StaffNoteOut(
        id=note.id,
        tenant_id=note.tenant_id,
        author_id=note.author_id,
        author_name=author_name,
        message=note.message,
        entity_type=note.entity_type,
        entity_id=note.entity_id,
        entity_label=note.entity_label,
        is_resolved=note.is_resolved,
        resolved_at=note.resolved_at,
        resolved_by=note.resolved_by,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


# ---- Routes ----

@router.post("", response_model=StaffNoteOut, status_code=status.HTTP_200_OK)
async def upsert_staff_note(
    data: StaffNoteUpsert,
    current_user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """
    Crée ou met à jour la note liée à une séance/event (upsert par entity_id).
    Pour les notes générales (entity_id=None), crée toujours une nouvelle note.
    Toute modification d'une note existante la remet en statut non-traitée.
    """
    tenant_id = current_user.tenant_id

    if data.entity_id:
        # Upsert : cherche une note existante pour cette entité
        result = await db.execute(
            select(StaffNote).where(
                StaffNote.tenant_id == tenant_id,
                StaffNote.entity_id == data.entity_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Mise à jour — remet is_resolved à False si le contenu change
            existing.message = data.message
            existing.entity_label = data.entity_label or existing.entity_label
            existing.author_id = current_user.id  # Mise à jour auteur
            existing.is_resolved = False
            existing.resolved_at = None
            existing.resolved_by = None
            existing.updated_at = datetime.utcnow()
            await db.commit()
            await db.refresh(existing)
            # Recharger les relations
            await db.refresh(existing, ["author"])
            return _build_note_out(existing)

    # Création
    note = StaffNote(
        tenant_id=tenant_id,
        author_id=current_user.id,
        message=data.message,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        entity_label=data.entity_label,
        is_resolved=False,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    await db.refresh(note, ["author"])
    return _build_note_out(note)


@router.get("/admin", response_model=List[StaffNoteOut])
async def get_unresolved_notes(
    include_resolved: bool = False,
    current_user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    """
    Retourne les notes du tenant.
    - include_resolved=false (défaut) : inbox manager, notes non traitées seulement
    - include_resolved=true : toutes les notes (pour afficher les icônes dans les tables)
    """
    conditions = [StaffNote.tenant_id == current_user.tenant_id]
    if not include_resolved:
        conditions.append(StaffNote.is_resolved == False)  # noqa: E712
    result = await db.execute(
        select(StaffNote).where(*conditions).order_by(StaffNote.updated_at.desc())
    )
    notes = result.scalars().all()
    for note in notes:
        await db.refresh(note, ["author"])
    return [_build_note_out(n) for n in notes]


@router.get("/entity/{entity_id}", response_model=Optional[StaffNoteOut])
async def get_entity_note(
    entity_id: UUID,
    current_user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Retourne la note liée à une séance/event (traitée ou non)"""
    result = await db.execute(
        select(StaffNote).where(
            StaffNote.tenant_id == current_user.tenant_id,
            StaffNote.entity_id == entity_id,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        return None
    await db.refresh(note, ["author"])
    return _build_note_out(note)


@router.patch("/admin/{note_id}/resolve", response_model=StaffNoteOut)
async def resolve_staff_note(
    note_id: UUID,
    current_user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    """Marque une note comme traitée (disparaît de l'inbox)"""
    result = await db.execute(
        select(StaffNote).where(
            StaffNote.id == note_id,
            StaffNote.tenant_id == current_user.tenant_id,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note introuvable")

    note.is_resolved = True
    note.resolved_at = datetime.utcnow()
    note.resolved_by = current_user.id
    await db.commit()
    await db.refresh(note)
    await db.refresh(note, ["author"])
    return _build_note_out(note)
