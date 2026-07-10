
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy import select, func, and_, extract, desc, case, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.models.models import (
    User, UserRole, FinanceCategory, FinanceTransaction, 
    FinanceTransactionType, FinancePaymentMethod, Tenant,
    Order, Offer, Installment, OrderPaymentStatus, FinanceAccount,
    Event, EventRegistration, EventRegistrationStatus
)
from app.schemas.schemas import (
    FinanceCategoryCreate, FinanceCategoryUpdate, FinanceCategoryResponse,
    FinanceAccountCreate, FinanceAccountUpdate, FinanceAccountResponse,
    FinanceTransactionCreate, FinanceTransactionUpdate, FinanceTransactionResponse,
    FinanceDashboardResponse
)

router = APIRouter()

# ---- Helper: Sync Revenues ----
async def sync_revenues_to_finance(db: AsyncSession, tenant_id: str):
    """Synchronise les paiements automatiques (échéances, événements, commandes comptant) vers le journal de trésorerie"""

    # ----------------------------------------------------------------
    # 1. Résolution des catégories système (INCOME offres + événements)
    # ----------------------------------------------------------------
    CANONICAL_OFFER_NAME = "Offres et forfaits de crédits"
    LEGACY_OFFER_NAMES   = {"Ventes Offres", "Offre de cours", "Offres", "Ventes", CANONICAL_OFFER_NAME}
    CANONICAL_EVENT_NAME = "Évènements"
    LEGACY_EVENT_NAMES   = {"Événements", "Évènements", "Evenements", "Events", "Evenement", "Événement", "Évènement"}

    # Cherche parmi tous les noms connus en une seule requête
    cats_res = await db.execute(
        select(FinanceCategory).where(
            FinanceCategory.tenant_id == tenant_id,
            FinanceCategory.type == FinanceTransactionType.INCOME,
            FinanceCategory.name.in_(LEGACY_OFFER_NAMES | LEGACY_EVENT_NAMES)
        )
    )
    all_sys_cats = cats_res.scalars().all()

    cat_ventes_list = [c for c in all_sys_cats if c.name in LEGACY_OFFER_NAMES]
    cat_events_list = [c for c in all_sys_cats if c.name in LEGACY_EVENT_NAMES]

    cat_ventes = next((c for c in cat_ventes_list if c.name == CANONICAL_OFFER_NAME), None)
    if not cat_ventes and cat_ventes_list:
        cat_ventes = cat_ventes_list[0]

    cat_events = next((c for c in cat_events_list if c.name == CANONICAL_EVENT_NAME), None)
    if not cat_events and cat_events_list:
        cat_events = cat_events_list[0]

    # Fallback cat_ventes : première catégorie INCOME non-événement
    if not cat_ventes:
        fb_res = await db.execute(
            select(FinanceCategory).where(
                FinanceCategory.tenant_id == tenant_id,
                FinanceCategory.type == FinanceTransactionType.INCOME,
                FinanceCategory.name.notin_(LEGACY_EVENT_NAMES)
            ).limit(1)
        )
        cat_ventes = fb_res.scalar_one_or_none()

    # Fallback cat_events : première catégorie INCOME qui contient "event" dans le nom
    if not cat_events:
        fb_res = await db.execute(
            select(FinanceCategory).where(
                FinanceCategory.tenant_id == tenant_id,
                FinanceCategory.type == FinanceTransactionType.INCOME,
                FinanceCategory.name.ilike("%event%")
            ).limit(1)
        )
        cat_events = fb_res.scalar_one_or_none()

    # Migration automatique des anciens noms et fusion des doublons
    if cat_ventes:
        if cat_ventes.name != CANONICAL_OFFER_NAME:
            cat_ventes.name = CANONICAL_OFFER_NAME
        for extra_cat in cat_ventes_list:
            if extra_cat.id != cat_ventes.id:
                await db.execute(
                    update(FinanceTransaction)
                    .where(FinanceTransaction.category_id == extra_cat.id)
                    .values(category_id=cat_ventes.id)
                )
                await db.delete(extra_cat)
        # Nettoyer all_sys_cats pour la suite de la fonction
        all_sys_cats = [c for c in all_sys_cats if c not in cat_ventes_list or c.id == cat_ventes.id]

    if cat_events:
        if cat_events.name != CANONICAL_EVENT_NAME:
            cat_events.name = CANONICAL_EVENT_NAME
        for extra_cat in cat_events_list:
            if extra_cat.id != cat_events.id:
                await db.execute(
                    update(FinanceTransaction)
                    .where(FinanceTransaction.category_id == extra_cat.id)
                    .values(category_id=cat_events.id)
                )
                await db.delete(extra_cat)
        all_sys_cats = [c for c in all_sys_cats if c not in cat_events_list or c.id == cat_events.id]

    # ----------------------------------------------------------------
    # 2. GESTION DES ÉCHÉANCES PAYÉES
    # ----------------------------------------------------------------
    inst_query = (
        select(Installment)
        .options(joinedload(Installment.order).joinedload(Order.user), joinedload(Installment.order).joinedload(Order.offer))
        .where(Installment.tenant_id == tenant_id, Installment.is_paid == True)
    )
    inst_res = await db.execute(inst_query)
    paid_installments = {inst.id: inst for inst in inst_res.scalars().all()}

    tx_inst_res = await db.execute(
        select(FinanceTransaction).where(
            FinanceTransaction.tenant_id == tenant_id,
            FinanceTransaction.installment_id != None
        ).order_by(FinanceTransaction.created_at.asc())
    )
    # Supprimer les doublons : garder uniquement la plus ancienne transaction par installment
    existing_tx_inst: dict = {}
    for tx in tx_inst_res.scalars().all():
        if tx.installment_id in existing_tx_inst:
            await db.delete(tx)  # doublon
        else:
            existing_tx_inst[tx.installment_id] = tx

    for inst_id, inst in paid_installments.items():
        offer_code = inst.order.offer.offer_code if inst.order.offer.offer_code else inst.order.offer.name[:10]
        desc_text = f"Paiement échéance {offer_code}"
        if inst.order.user:
            desc_text += f" - {inst.order.user.first_name} {inst.order.user.last_name}"

        if inst_id in existing_tx_inst:
            tx = existing_tx_inst[inst_id]
            tx.description = desc_text
            tx.amount_cents = inst.amount_cents
            tx.date = inst.due_date
            # Mise à jour de la catégorie si elle était None
            if tx.category_id is None and cat_ventes:
                tx.category_id = cat_ventes.id
        else:
            db.add(FinanceTransaction(
                tenant_id=tenant_id,
                date=inst.due_date,
                type=FinanceTransactionType.INCOME,
                category_id=cat_ventes.id if cat_ventes else None,
                amount_cents=inst.amount_cents,
                description=desc_text,
                order_id=inst.order_id,
                installment_id=inst_id,
                is_reconciled=True
            ))

    for inst_id, tx in existing_tx_inst.items():
        if inst_id not in paid_installments:
            await db.delete(tx)

    # ----------------------------------------------------------------
    # 3. GESTION DES COMMANDES COMPTANT (Lump Sum, PAID, sans échéances)
    # ----------------------------------------------------------------
    order_query = (
        select(Order)
        .outerjoin(Installment, Order.id == Installment.order_id)
        .options(joinedload(Order.user), joinedload(Order.offer))
        .where(
            Order.tenant_id == tenant_id,
            Order.payment_status == OrderPaymentStatus.PAID,
            Installment.id == None
        )
    )
    order_res = await db.execute(order_query)
    paid_lump_orders = {o.id: o for o in order_res.scalars().all()}

    # On ne prend que les transactions AUTO-générées (is_reconciled=True)
    # pour ne pas interférer avec les saisies manuelles
    tx_order_res = await db.execute(
        select(FinanceTransaction).where(
            FinanceTransaction.tenant_id == tenant_id,
            FinanceTransaction.order_id != None,
            FinanceTransaction.installment_id == None,
            FinanceTransaction.is_reconciled == True
        ).order_by(FinanceTransaction.created_at.asc())
    )
    # Supprimer les doublons : garder uniquement la plus ancienne transaction par commande
    existing_tx_order: dict = {}
    for tx in tx_order_res.scalars().all():
        if tx.order_id in existing_tx_order:
            await db.delete(tx)  # doublon
        else:
            existing_tx_order[tx.order_id] = tx

    for order_id, order in paid_lump_orders.items():
        offer_code = order.offer.offer_code if order.offer.offer_code else order.offer.name[:10]
        desc_text = f"Paiement commande {offer_code}"
        if order.user:
            desc_text += f" - {order.user.first_name} {order.user.last_name}"

        if order_id in existing_tx_order:
            tx = existing_tx_order[order_id]
            tx.description = desc_text
            tx.amount_cents = order.price_cents
            if tx.category_id is None and cat_ventes:
                tx.category_id = cat_ventes.id
        else:
            db.add(FinanceTransaction(
                tenant_id=tenant_id,
                date=order.created_at.date(),
                type=FinanceTransactionType.INCOME,
                category_id=cat_ventes.id if cat_ventes else None,
                amount_cents=order.price_cents,
                description=desc_text,
                order_id=order_id,
                is_reconciled=True
            ))

    for order_id, tx in existing_tx_order.items():
        if order_id not in paid_lump_orders:
            await db.delete(tx)

    # ----------------------------------------------------------------
    # 4. GESTION DES ÉVÉNEMENTS (Registrations payées)
    # ----------------------------------------------------------------
    from app.models.models import EventRegistration
    reg_query = (
        select(EventRegistration)
        .options(joinedload(EventRegistration.user), joinedload(EventRegistration.event))
        .where(EventRegistration.tenant_id == tenant_id, EventRegistration.payment_status == OrderPaymentStatus.PAID)
    )
    reg_res = await db.execute(reg_query)
    paid_regs = {reg.id: reg for reg in reg_res.scalars().all()}

    tx_reg_res = await db.execute(
        select(FinanceTransaction).where(
            FinanceTransaction.tenant_id == tenant_id,
            FinanceTransaction.registration_id != None
        ).order_by(FinanceTransaction.created_at.asc())
    )
    # Supprimer les doublons : garder uniquement la plus ancienne transaction par inscription
    existing_tx_reg: dict = {}
    for tx in tx_reg_res.scalars().all():
        if tx.registration_id in existing_tx_reg:
            await db.delete(tx)  # doublon
        else:
            existing_tx_reg[tx.registration_id] = tx

    for reg_id, reg in paid_regs.items():
        desc_text = f"Inscription {reg.event.title}"
        if reg.user:
            desc_text += f" - {reg.user.first_name} {reg.user.last_name}"

        if reg_id in existing_tx_reg:
            tx = existing_tx_reg[reg_id]
            tx.description = desc_text
            if tx.category_id is None and cat_events:
                tx.category_id = cat_events.id
        else:
            db.add(FinanceTransaction(
                tenant_id=tenant_id,
                date=reg.created_at.date(),
                type=FinanceTransactionType.INCOME,
                category_id=cat_events.id if cat_events else None,
                amount_cents=reg.price_paid_cents,
                description=desc_text,
                registration_id=reg_id,
                is_reconciled=True
            ))

    for reg_id, tx in existing_tx_reg.items():
        if reg_id not in paid_regs:
            await db.delete(tx)

    await db.commit()

# ---- Auth Dependency ----
async def require_manager(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès réservé aux managers")
    return user

# ==================== CATEGORIES ====================

@router.get("/categories", response_model=List[FinanceCategoryResponse])
async def list_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id

    # Migration automatique des noms hérités vers les noms canoniques système
    RENAMES = {
        "Offre de cours": "Offres et forfaits de crédits",
        "Ventes Offres": "Offres et forfaits de crédits",
        "Evenements": "Évènements",
        "Événements": "Évènements",
    }
    for old_name, new_name in RENAMES.items():
        res = await db.execute(
            select(FinanceCategory).where(
                FinanceCategory.tenant_id == tenant_id,
                FinanceCategory.name == old_name
            )
        )
        cat = res.scalar_one_or_none()
        if cat:
            cat.name = new_name
    await db.commit()

    result = await db.execute(
        select(FinanceCategory)
        .where(FinanceCategory.tenant_id == tenant_id)
        .order_by(FinanceCategory.name.asc())
    )
    return result.scalars().all()

@router.post("/categories/seed", status_code=status.HTTP_201_CREATED)
async def seed_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    
    # Vérifier si des catégories existent déjà
    existing = await db.execute(
        select(FinanceCategory).where(FinanceCategory.tenant_id == tenant_id).limit(1)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Des catégories existent déjà pour cet établissement")
    
    defaults = [
        # Dépenses
        {"name": "Loyer & Charges", "type": FinanceTransactionType.EXPENSE, "color": "#ef4444"},
        {"name": "Salaires & Social", "type": FinanceTransactionType.EXPENSE, "color": "#ef4444"},
        {"name": "Marketing & Pub", "type": FinanceTransactionType.EXPENSE, "color": "#f59e0b"},
        {"name": "Petit matériel", "type": FinanceTransactionType.EXPENSE, "color": "#f59e0b"},
        {"name": "Stock (Boissons/Snacks)", "type": FinanceTransactionType.EXPENSE, "color": "#10b981"},
        {"name": "Frais bancaires", "type": FinanceTransactionType.EXPENSE, "color": "#64748b"},
        {"name": "Assurance", "type": FinanceTransactionType.EXPENSE, "color": "#64748b"},
        {"name": "Remboursement client", "type": FinanceTransactionType.EXPENSE, "color": "#ef4444"},
        
        # Recettes
        {"name": "Offres et forfaits de crédits", "type": FinanceTransactionType.INCOME, "color": "#3b82f6"},
        {"name": "Évènements", "type": FinanceTransactionType.INCOME, "color": "#8b5cf6"},
        {"name": "Ventes Boutique", "type": FinanceTransactionType.INCOME, "color": "#10b981"},
        {"name": "Subventions", "type": FinanceTransactionType.INCOME, "color": "#ec4899"},
    ]
    
    for d in defaults:
        db.add(FinanceCategory(tenant_id=tenant_id, **d))
    
    await db.commit()
    return {"message": "Catégories initialisées"}


# ==================== ACCOUNTS ====================

@router.get("/accounts", response_model=List[FinanceAccountResponse])
async def list_accounts(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(FinanceAccount)
        .where(FinanceAccount.tenant_id == tenant_id)
        .order_by(FinanceAccount.name)
    )
    return result.scalars().all()


@router.post("/accounts", response_model=FinanceAccountResponse)
async def create_account(
    request: Request,
    data: FinanceAccountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    account = FinanceAccount(
        **data.model_dump(),
        tenant_id=tenant_id
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.patch("/accounts/{account_id}", response_model=FinanceAccountResponse)
async def update_account(
    account_id: UUID,
    request: Request,
    data: FinanceAccountUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(FinanceAccount).where(FinanceAccount.id == account_id, FinanceAccount.tenant_id == tenant_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Compte non trouvé")
        
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(account, key, value)
        
    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(FinanceAccount).where(FinanceAccount.id == account_id, FinanceAccount.tenant_id == tenant_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Compte non trouvé")
        
    # Vérifier s'il y a des transactions liées
    tx_check = await db.execute(
        select(FinanceTransaction).where(FinanceTransaction.account_id == account_id).limit(1)
    )
    if tx_check.scalar_one_or_none():
        raise HTTPException(
            status_code=400, 
            detail="Impossible de supprimer ce compte car il contient des opérations (supprimez d'abord les opérations liées)"
        )
        
    await db.delete(account)
    await db.commit()
    return {"message": "Compte supprimé"}

@router.post("/categories", response_model=FinanceCategoryResponse)
async def create_category(
    data: FinanceCategoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    new_cat = FinanceCategory(
        tenant_id=tenant_id,
        **data.model_dump()
    )
    db.add(new_cat)
    await db.commit()
    await db.refresh(new_cat)
    return new_cat

@router.patch("/categories/{cat_id}", response_model=FinanceCategoryResponse)
async def update_category(
    cat_id: UUID,
    data: FinanceCategoryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(FinanceCategory).where(FinanceCategory.id == cat_id, FinanceCategory.tenant_id == tenant_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cat, key, value)
    
    await db.commit()
    await db.refresh(cat)
    return cat

@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    cat_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(FinanceCategory).where(FinanceCategory.id == cat_id, FinanceCategory.tenant_id == tenant_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    
    # Vérifier s'il y a des transactions liées
    tx_check = await db.execute(
        select(FinanceTransaction).where(FinanceTransaction.category_id == cat_id).limit(1)
    )
    if tx_check.scalar_one_or_none():
        raise HTTPException(
            status_code=400, 
            detail="Impossible de supprimer cette catégorie car elle est utilisée dans le journal (supprimez d'abord les opérations liées)"
        )
    
    await db.delete(cat)
    await db.commit()

# ==================== TRANSACTIONS ====================

@router.get("/transactions/export")
async def export_transactions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    type: Optional[FinanceTransactionType] = Query(None),
    category_id: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None),
    show_future: bool = Query(False)
):
    """Exporte les transactions du journal de trésorerie en Excel"""
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl non installé")

    tenant_id = request.state.tenant_id
    await sync_revenues_to_finance(db, tenant_id)

    query = (
        select(FinanceTransaction)
        .where(FinanceTransaction.tenant_id == tenant_id)
        .options(joinedload(FinanceTransaction.category), joinedload(FinanceTransaction.account))
        .order_by(FinanceTransaction.date.desc(), FinanceTransaction.created_at.desc())
    )

    if not show_future:
        query = query.where(FinanceTransaction.date <= date.today())

    if start_date:
        query = query.where(FinanceTransaction.date >= start_date)
    if end_date:
        query = query.where(FinanceTransaction.date <= end_date)
    if type:
        query = query.where(FinanceTransaction.type == type)
    if category_id:
        query = query.where(FinanceTransaction.category_id == category_id)
    if search:
        query = query.where(FinanceTransaction.description.ilike(f"%{search}%"))

    result = await db.execute(query)
    transactions = result.scalars().all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Journal de caisse"

    # Headers
    headers = [
        "Date", "Type", "Libellé", "Catégorie", "Compte / Banque",
        "Montant TTC (€)", "Taux TVA (%)", "Montant TVA (€)",
        "Moyen de paiement", "Pointé"
    ]
    ws.append(headers)

    # Style headers
    from openpyxl.styles import Font
    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.font = Font(bold=True)

    # Data
    for tx in transactions:
        tx_type_str = "Recette" if tx.type == FinanceTransactionType.INCOME else "Dépense"
        
        # Payment method mapping
        pm_map = {
            "card": "Carte bancaire",
            "transfer": "Virement",
            "cash": "Espèces",
            "check": "Chèque",
            "other": "Autre"
        }
        pm_str = pm_map.get(tx.payment_method.value if hasattr(tx.payment_method, 'value') else str(tx.payment_method), "Autre")
        
        ws.append([
            tx.date.strftime("%d/%m/%Y") if tx.date else "",
            tx_type_str,
            tx.description or "",
            tx.category.name if tx.category else "Non définie",
            tx.account.name if tx.account else "Non défini",
            tx.amount_cents / 100,
            tx.vat_rate,
            (tx.vat_amount_cents / 100) if tx.vat_amount_cents else 0.0,
            pm_str,
            "Oui" if tx.is_reconciled else "Non"
        ])

    # Auto-width
    for col in ws.columns:
        max_length = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_length + 2, 40)

    from io import BytesIO
    from fastapi.responses import StreamingResponse
    
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=journal_de_caisse.xlsx"}
    )

@router.get("/transactions", response_model=List[FinanceTransactionResponse])
async def list_transactions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    type: Optional[FinanceTransactionType] = Query(None),
    category_id: Optional[UUID] = Query(None),
    event_group_id: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None),
    show_future: bool = Query(False)
):
    tenant_id = request.state.tenant_id
    await sync_revenues_to_finance(db, tenant_id)
    
    query = (
        select(FinanceTransaction)
        .where(FinanceTransaction.tenant_id == tenant_id)
        .options(joinedload(FinanceTransaction.category), joinedload(FinanceTransaction.account), joinedload(FinanceTransaction.event_group))
        .order_by(FinanceTransaction.date.desc(), FinanceTransaction.created_at.desc())
    )
    
    if not show_future:
        query = query.where(FinanceTransaction.date <= date.today())
    
    if start_date:
        query = query.where(FinanceTransaction.date >= start_date)
    if end_date:
        query = query.where(FinanceTransaction.date <= end_date)
    if type:
        query = query.where(FinanceTransaction.type == type)
    if category_id:
        query = query.where(FinanceTransaction.category_id == category_id)
    if event_group_id:
        query = query.where(FinanceTransaction.event_group_id == event_group_id)
    if search:
        query = query.where(FinanceTransaction.description.ilike(f"%{search}%"))
    
    result = await db.execute(query)
    transactions = result.scalars().all()
    
    # Map to response with category_name, account_name, event_group_title
    response = []
    for t in transactions:
        res = FinanceTransactionResponse.model_validate(t)
        if t.category:
            res.category_name = t.category.name
        if t.account:
            res.account_name = t.account.name
        if t.event_group:
            res.event_group_title = t.event_group.title
        response.append(res)
    
    return response


@router.post("/transactions", response_model=FinanceTransactionResponse)
async def create_transaction(
    data: FinanceTransactionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    
    # Données de base (exclure les champs de récurrence qui ne sont pas dans le modèle)
    trans_data = data.model_dump(exclude={"is_recurring", "frequency", "recurring_count", "category_name", "account_name"})
    
    # Création de l'opération initiale
    new_trans = FinanceTransaction(
        tenant_id=tenant_id,
        created_by_id=current_user.id,
        **trans_data
    )
    db.add(new_trans)
    
    # Gérer la récurrence si demandée
    if data.is_recurring and data.recurring_count and data.recurring_count > 1:
        current_date = data.date
        for i in range(1, data.recurring_count):
            if data.frequency == "monthly":
                current_date = current_date + relativedelta(months=1)
            elif data.frequency == "weekly":
                current_date = current_date + timedelta(weeks=1)
            else:
                break
                
            future_trans = FinanceTransaction(
                tenant_id=tenant_id,
                created_by_id=current_user.id,
                **trans_data,
                date=current_date,
                is_reconciled=False # Les opérations futures ne sont pas encore pointées
            )
            db.add(future_trans)
            
    await db.commit()
    await db.refresh(new_trans)
    
    # Recharger avec les relations pour la réponse
    result = await db.execute(
        select(FinanceTransaction)
        .where(FinanceTransaction.id == new_trans.id)
        .options(joinedload(FinanceTransaction.category), joinedload(FinanceTransaction.account), joinedload(FinanceTransaction.event_group))
    )
    t = result.scalar_one()
    res = FinanceTransactionResponse.model_validate(t)
    if t.category:
        res.category_name = t.category.name
    if t.account:
        res.account_name = t.account.name
    if t.event_group:
        res.event_group_title = t.event_group.title
    return res

@router.patch("/transactions/{trans_id}", response_model=FinanceTransactionResponse)
async def update_transaction(
    trans_id: UUID,
    data: FinanceTransactionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(FinanceTransaction).where(FinanceTransaction.id == trans_id, FinanceTransaction.tenant_id == tenant_id)
    )
    trans = result.scalar_one_or_none()
    if not trans:
        raise HTTPException(status_code=404, detail="Transaction non trouvée")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(trans, key, value)
    
    await db.commit()
    await db.refresh(trans)
    
    result = await db.execute(
        select(FinanceTransaction)
        .where(FinanceTransaction.id == trans.id)
        .options(joinedload(FinanceTransaction.category), joinedload(FinanceTransaction.account), joinedload(FinanceTransaction.event_group))
    )
    t = result.scalar_one()
    res = FinanceTransactionResponse.model_validate(t)
    if t.category:
        res.category_name = t.category.name
    if t.account:
        res.account_name = t.account.name
    if t.event_group:
        res.event_group_title = t.event_group.title
    return res

@router.delete("/transactions/{trans_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    trans_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(FinanceTransaction).where(FinanceTransaction.id == trans_id, FinanceTransaction.tenant_id == tenant_id)
    )
    trans = result.scalar_one_or_none()
    if not trans:
        raise HTTPException(status_code=404, detail="Transaction non trouvée")
    
    await db.delete(trans)
    await db.commit()

# ==================== DASHBOARD ====================

@router.get("/dashboard", response_model=FinanceDashboardResponse)
async def get_finance_dashboard(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
    month_str: Optional[str] = Query(None, alias="month"),
    days: int = Query(30)
):
    tenant_id = request.state.tenant_id
    await sync_revenues_to_finance(db, tenant_id)
    
    today_dt = date.today()
    if month_str:
        try:
            year, month = map(int, month_str.split('-'))
            target_start_date = date(year, month, 1)
        except ValueError:
            target_start_date = date(today_dt.year, today_dt.month, 1)
    else:
        target_start_date = date(today_dt.year, today_dt.month, 1)

    # Calculate end of target month
    if target_start_date.month == 12:
        target_end_date = date(target_start_date.year + 1, 1, 1) - timedelta(days=1)
    else:
        target_end_date = date(target_start_date.year, target_start_date.month + 1, 1) - timedelta(days=1)
    
    # 1. Totaux du mois cible
    total_query = (
        select(
            FinanceTransaction.type,
            func.sum(FinanceTransaction.amount_cents)
        )
        .where(
            FinanceTransaction.tenant_id == tenant_id,
            FinanceTransaction.date >= target_start_date,
            FinanceTransaction.date <= target_end_date
        )
        .group_by(FinanceTransaction.type)
    )
    totals_res = await db.execute(total_query)
    totals = {row[0]: row[1] for row in totals_res.all()}
    
    income = totals.get(FinanceTransactionType.INCOME, 0)
    expense = totals.get(FinanceTransactionType.EXPENSE, 0)
    
    # 2. Indicateurs spécifiques au mois
    # 2.a En cours (à venir dans le mois) = commandes PENDING/WAITING et events PENDING_PAYMENT dont la date tombe dans le mois
    pending_orders_query = select(func.sum(Order.price_cents)).where(
        Order.tenant_id == tenant_id,
        Order.payment_status.in_([OrderPaymentStatus.PENDING, OrderPaymentStatus.WAITING]),
        Order.start_date >= target_start_date,
        Order.start_date <= target_end_date
    )
    pending_orders_res = await db.execute(pending_orders_query)
    month_pending = pending_orders_res.scalar() or 0

    pending_events_query = select(func.sum(EventRegistration.price_paid_cents)).join(Event).where(
        EventRegistration.tenant_id == tenant_id,
        EventRegistration.status == EventRegistrationStatus.PENDING_PAYMENT,
        Event.event_date >= target_start_date,
        Event.event_date <= target_end_date
    )
    pending_events_res = await db.execute(pending_events_query)
    month_pending += pending_events_res.scalar() or 0

    pending_installments_query = select(func.sum(Installment.amount_cents)).where(
        Installment.tenant_id == tenant_id,
        Installment.is_paid == False,
        Installment.is_error == False,
        Installment.due_date >= target_start_date,
        Installment.due_date <= target_end_date
    )
    pending_inst_res = await db.execute(pending_installments_query)
    month_pending += pending_inst_res.scalar() or 0

    # 2.b Impayés = paiements notés A régulariser par le manager (sur ce mois, ou globalement ?)
    # On va prendre ceux qui tombent dans le mois, comme demandé.
    error_orders_query = select(func.sum(Order.price_cents)).where(
        Order.tenant_id == tenant_id,
        Order.payment_status == OrderPaymentStatus.ISSUE,
        Order.start_date >= target_start_date,
        Order.start_date <= target_end_date
    )
    error_orders_res = await db.execute(error_orders_query)
    month_error = error_orders_res.scalar() or 0

    error_inst_query = select(func.sum(Installment.amount_cents)).where(
        Installment.tenant_id == tenant_id,
        Installment.is_error == True,
        Installment.resolved_at == None,
        Installment.due_date >= target_start_date,
        Installment.due_date <= target_end_date
    )
    error_inst_res = await db.execute(error_inst_query)
    month_error += error_inst_res.scalar() or 0

    # 2.c Remboursés = paiements notés Remboursés par le manager (tombant dans le mois)
    refund_orders_query = select(func.sum(Order.price_cents)).where(
        Order.tenant_id == tenant_id,
        Order.payment_status == OrderPaymentStatus.REFUNDED,
        Order.start_date >= target_start_date,
        Order.start_date <= target_end_date
    )
    refund_orders_res = await db.execute(refund_orders_query)
    month_refund = refund_orders_res.scalar() or 0

    # 3. Répartition par catégorie (pour le mois cible)
    cat_query = (
        select(
            FinanceTransaction.type,
            FinanceCategory.name,
            FinanceCategory.color,
            func.sum(FinanceTransaction.amount_cents)
        )
        .outerjoin(FinanceCategory, FinanceTransaction.category_id == FinanceCategory.id)
        .where(
            FinanceTransaction.tenant_id == tenant_id,
            FinanceTransaction.date >= target_start_date,
            FinanceTransaction.date <= target_end_date
        )
        .group_by(FinanceTransaction.type, FinanceCategory.name, FinanceCategory.color)
    )
    cat_res = await db.execute(cat_query)
    
    income_by_cat = []
    expense_by_cat = []
    for row in cat_res.all():
        cat_name = row[1] if row[1] else "Non définie"
        cat_color = row[2] if row[2] else "#94a3b8"
        item = {"category": cat_name, "amount": row[3], "color": cat_color}
        if row[0] == FinanceTransactionType.INCOME:
            income_by_cat.append(item)
        else:
            expense_by_cat.append(item)

    # 3b. Détail des recettes par rubrique et offre
    #     Deux sources de recettes offres :
    #       A) Commandes comptant payées (PAID, sans échéances)
    #       B) Échéances payées (is_paid=True), dont la due_date tombe dans le mois
    #     On lit directement les tables Order et Installment (sans passer par FinanceTransaction)
    #     pour être toujours synchronisé, même si sync_revenues_to_finance n'a pas encore tourné.

    # A) Commandes lump-sum payées dans le mois (start_date dans le mois, PAID, sans installments)
    lump_query = (
        select(
            Offer.category,
            Offer.name,
            func.sum(Order.price_cents)
        )
        .join(Offer, Order.offer_id == Offer.id)
        .outerjoin(Installment, Order.id == Installment.order_id)
        .where(
            Order.tenant_id == tenant_id,
            Order.payment_status == OrderPaymentStatus.PAID,
            Order.start_date >= target_start_date,
            Order.start_date <= target_end_date,
            Installment.id == None  # sans échéances = comptant
        )
        .group_by(Offer.category, Offer.name)
    )
    lump_res = await db.execute(lump_query)

    # B) Échéances payées dont la due_date tombe dans le mois
    inst_offer_query = (
        select(
            Offer.category,
            Offer.name,
            func.sum(Installment.amount_cents)
        )
        .join(Order, Installment.order_id == Order.id)
        .join(Offer, Order.offer_id == Offer.id)
        .where(
            Installment.tenant_id == tenant_id,
            Installment.is_paid == True,
            Installment.due_date >= target_start_date,
            Installment.due_date <= target_end_date
        )
        .group_by(Offer.category, Offer.name)
    )
    inst_offer_res = await db.execute(inst_offer_query)

    # Fusionner les deux sources dans un dict (rubrique, offer_name) → total
    offer_totals: dict[tuple, int] = {}
    for row in lump_res.all():
        key = (row[0] or "Sans rubrique", row[1])
        offer_totals[key] = offer_totals.get(key, 0) + (row[2] or 0)
    for row in inst_offer_res.all():
        key = (row[0] or "Sans rubrique", row[1])
        offer_totals[key] = offer_totals.get(key, 0) + (row[2] or 0)

    income_by_offer = [
        {
            "rubrique": rubrique,
            "offer_name": offer_name,
            "amount": total
        }
        for (rubrique, offer_name), total in sorted(offer_totals.items())
        if total > 0
    ]
            
    # 4. Transactions récentes (globales, sans filtrer par mois)
    recent_query = (
        select(FinanceTransaction)
        .where(FinanceTransaction.tenant_id == tenant_id)
        .options(joinedload(FinanceTransaction.category), joinedload(FinanceTransaction.account))
        .order_by(FinanceTransaction.date.desc(), FinanceTransaction.created_at.desc())
        .limit(10)
    )
    recent_res = await db.execute(recent_query)
    recent_trans = []
    for t in recent_res.scalars().all():
        res = FinanceTransactionResponse.model_validate(t)
        if t.category:
            res.category_name = t.category.name
        if t.account:
            res.account_name = t.account.name
        recent_trans.append(res)
        
    # 5. Évolution mensuelle (6 derniers mois, pour l'historique)
    months_query = (
        select(
            extract('year', FinanceTransaction.date).label('year'),
            extract('month', FinanceTransaction.date).label('month'),
            FinanceTransaction.type,
            func.sum(FinanceTransaction.amount_cents)
        )
        .where(FinanceTransaction.tenant_id == tenant_id)
        .group_by('year', 'month', FinanceTransaction.type)
        .order_by(desc('year'), desc('month'))
        .limit(24) # 12 mois * 2 types (on trie par date descendante pour avoir les plus récents)
    )
    months_res = await db.execute(months_query)
    
    monthly_data = {}
    # On itère sur les résultats récents
    for row in months_res.all():
        key = f"{int(row[0])}-{int(row[1]):02d}"
        if key not in monthly_data:
            monthly_data[key] = {"month": key, "income": 0, "expense": 0}
        
        if row[2] == FinanceTransactionType.INCOME:
            monthly_data[key]["income"] = row[3]
        else:
            monthly_data[key]["expense"] = row[3]

    # Ajouter les installments payés dans le trend mensuel (historique)
    inst_months_query = (
        select(
            extract('year', Installment.due_date).label('year'),
            extract('month', Installment.due_date).label('month'),
            func.sum(Installment.amount_cents)
        )
        .where(Installment.tenant_id == tenant_id, Installment.is_paid == True)
        .group_by('year', 'month')
        .order_by(desc('year'), desc('month'))
        .limit(12)
    )
    inst_months_res = await db.execute(inst_months_query)
    for row in inst_months_res.all():
        key = f"{int(row[0])}-{int(row[1]):02d}"
        if key not in monthly_data:
            monthly_data[key] = {"month": key, "income": 0, "expense": 0}
        monthly_data[key]["income"] += row[2]

    # Trier le trend mensuel par date croissante pour le graphique
    sorted_trend = sorted(monthly_data.values(), key=lambda x: x["month"])
            
    # 6. Prévisions (basées sur l'échéancier global)
    # Échéances à venir (non payées, non erreur)
    projected_query = (
        select(func.sum(Installment.amount_cents))
        .where(
            Installment.tenant_id == tenant_id,
            Installment.is_paid == False,
            Installment.is_error == False,
            Installment.due_date >= today_dt
        )
    )
    projected_res = await db.execute(projected_query)
    projected_income = projected_res.scalar() or 0
    
    # Échéances en retard / erreur
    overdue_query = (
        select(func.sum(Installment.amount_cents))
        .where(
            Installment.tenant_id == tenant_id,
            Installment.is_error == True,
            Installment.resolved_at == None
        )
    )
    overdue_res = await db.execute(overdue_query)
    overdue_income = overdue_res.scalar() or 0
    
    # Trend prévisionnel (prochains 6 mois)
    projected_months_query = (
        select(
            extract('year', Installment.due_date).label('year'),
            extract('month', Installment.due_date).label('month'),
            func.sum(Installment.amount_cents)
        )
        .where(
            Installment.tenant_id == tenant_id,
            Installment.is_paid == False,
            Installment.is_error == False,
            Installment.due_date >= today_dt
        )
        .group_by('year', 'month')
        .order_by('year', 'month')
        .limit(12)
    )
    proj_months_res = await db.execute(projected_months_query)
    projected_trend_data = {}
    for row in proj_months_res.all():
        key = f"{int(row[0])}-{int(row[1]):02d}"
        projected_trend_data[key] = row[2]
    
    # Ajouter les transactions manuelles futures (non pointées)
    manual_future_query = (
        select(
            extract('year', FinanceTransaction.date).label('year'),
            extract('month', FinanceTransaction.date).label('month'),
            func.sum(case((FinanceTransaction.type == FinanceTransactionType.INCOME, FinanceTransaction.amount_cents), else_=-FinanceTransaction.amount_cents))
        )
        .where(
            FinanceTransaction.tenant_id == tenant_id,
            FinanceTransaction.date >= today_dt,
            FinanceTransaction.is_reconciled == False
        )
        .group_by('year', 'month')
    )
    manual_future_res = await db.execute(manual_future_query)
    for row in manual_future_res.all():
        key = f"{int(row[0])}-{int(row[1]):02d}"
        if key not in projected_trend_data:
            projected_trend_data[key] = 0
        projected_trend_data[key] += row[2]

    # Convertir en liste triée
    sorted_projected = []
    for k in sorted(projected_trend_data.keys()):
        sorted_projected.append({
            "month": k,
            "amount": projected_trend_data[k]
        })
    # Limiter à 12 mois
    sorted_projected = sorted_projected[:12]

    return FinanceDashboardResponse(
        total_income_cents=income,
        total_expense_cents=expense,
        net_balance_cents=income - expense,
        month_pending_cents=month_pending,
        month_error_cents=month_error,
        month_refund_cents=month_refund,
        income_by_category=income_by_cat,
        expense_by_category=expense_by_cat,
        income_by_offer=income_by_offer,
        recent_transactions=recent_trans,
        monthly_trend=sorted_trend,
        projected_income_cents=projected_income,
        overdue_income_cents=overdue_income,
        projected_trend=sorted_projected
    )


# ---- EXPORT COMPTABLE & RESET ----

from fastapi.responses import StreamingResponse
import io
import csv

@router.get("/export-compta")
async def export_compta(
    request: Request,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    
    # Récupérer les commandes payées non exportées
    query = (
        select(Order)
        .options(joinedload(Order.user), joinedload(Order.offer))
        .where(
            Order.tenant_id == tenant_id,
            Order.payment_status == OrderPaymentStatus.PAID,
            Order.is_exported == False
        )
    )
    
    if start_date:
        query = query.where(Order.start_date >= datetime.strptime(start_date, "%Y-%m-%d").date())
    if end_date:
        query = query.where(Order.start_date <= datetime.strptime(end_date, "%Y-%m-%d").date())
        
    query = query.order_by(Order.created_at.asc())
    
    res = await db.execute(query)
    orders = res.scalars().all()
    
    # Génération du CSV en mémoire
    output = io.StringIO()
    # Utiliser le point-virgule comme séparateur (standard français Excel)
    writer = csv.writer(output, delimiter=';')
    
    # En-têtes du CSV
    writer.writerow([
        "ID Commande", "Date création", "Date début", "Nom Adhérent", "Email Adhérent",
        "Code Offre", "Intitulé Offre", "Montant TTC (EUR)", "Moyen de paiement", "Statut"
    ])
    
    for o in orders:
        user_name = f"{o.user.first_name} {o.user.last_name}" if o.user else "Utilisateur supprimé"
        user_email = o.user.email if (o.user and o.user.email) else ""
        offer_code = o.offer.offer_code if o.offer else ""
        offer_name = o.offer.name if o.offer else (o.offer_snap_name or "Offre inconnue")
        
        # Moyen de paiement
        payment_method = "Autre"
        if o.comment and "Stripe" in o.comment:
            payment_method = "Stripe"
        elif o.comment and "HelloAsso" in o.comment:
            payment_method = "HelloAsso"
            
        writer.writerow([
            str(o.id),
            o.created_at.strftime("%d/%m/%Y"),
            o.start_date.strftime("%d/%m/%Y"),
            user_name,
            user_email,
            offer_code,
            offer_name,
            f"{(o.price_cents / 100):.2f}".replace('.', ','),
            payment_method,
            "Payé"
        ])
        
        # Marquer comme exporté
        o.is_exported = True
        
    await db.commit()
    
    # Préparer la réponse en streaming avec BOM UTF-8 pour Excel
    csv_data = "\uFEFF" + output.getvalue()
    response = StreamingResponse(io.BytesIO(csv_data.encode("utf-8-sig")), media_type="text/csv")
    
    from_str = start_date or "debut"
    to_str = end_date or "fin"
    response.headers["Content-Disposition"] = f"attachment; filename=export_compta_{from_str}_{to_str}.csv"
    return response


@router.post("/reset-export")
async def reset_export(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager)
):
    tenant_id = request.state.tenant_id
    
    query = (
        update(Order)
        .where(
            Order.tenant_id == tenant_id,
            Order.payment_status == OrderPaymentStatus.PAID,
            Order.start_date >= datetime.strptime(start_date, "%Y-%m-%d").date(),
            Order.start_date <= datetime.strptime(end_date, "%Y-%m-%d").date()
        )
        .values(is_exported=False)
    )
    
    await db.execute(query)
    await db.commit()
    
    return {"message": "Statut d'export réinitialisé avec succès sur la période."}

