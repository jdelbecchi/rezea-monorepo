
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy import select, func, and_, extract, desc, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.models.models import (
    User, UserRole, FinanceCategory, FinanceTransaction, 
    FinanceTransactionType, FinancePaymentMethod, Tenant,
    Order, Installment, OrderPaymentStatus, FinanceAccount,
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
    # 1. Catégories par défaut
    cat_ventes_res = await db.execute(select(FinanceCategory).where(FinanceCategory.tenant_id == tenant_id, FinanceCategory.name == "Ventes Offres"))
    cat_ventes = cat_ventes_res.scalar_one_or_none()
    
    cat_events_res = await db.execute(select(FinanceCategory).where(FinanceCategory.tenant_id == tenant_id, FinanceCategory.name == "Événements"))
    cat_events = cat_events_res.scalar_one_or_none()

    # --- 2. GESTION DES ÉCHÉANCES (Installments) ---
    inst_query = (
        select(Installment)
        .options(joinedload(Installment.order).joinedload(Order.user), joinedload(Installment.order).joinedload(Order.offer))
        .where(Installment.tenant_id == tenant_id, Installment.is_paid == True)
    )
    inst_res = await db.execute(inst_query)
    paid_installments = {inst.id: inst for inst in inst_res.scalars().all()}

    tx_inst_query = select(FinanceTransaction).where(FinanceTransaction.tenant_id == tenant_id, FinanceTransaction.installment_id != None)
    tx_inst_res = await db.execute(tx_inst_query)
    existing_tx_inst = {tx.installment_id: tx for tx in tx_inst_res.scalars().all()}

    for inst_id, inst in paid_installments.items():
        offer_code = inst.order.offer.offer_code if inst.order.offer.offer_code else inst.order.offer.name[:10]
        desc_text = f"Paiement échéance {offer_code}"
        if inst.order.user:
            desc_text += f" - {inst.order.user.first_name} {inst.order.user.last_name}"
            
        if inst_id in existing_tx_inst:
            tx = existing_tx_inst[inst_id]
            if tx.description != desc_text or tx.amount_cents != inst.amount_cents:
                tx.description = desc_text
                tx.amount_cents = inst.amount_cents
                tx.date = inst.due_date
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

    # --- 3. GESTION DES COMMANDES COMPTANT (Lump Sum) ---
    # Commandes payées qui n'ont PAS d'échéances associées
    order_query = (
        select(Order)
        .outerjoin(Installment, Order.id == Installment.order_id)
        .options(joinedload(Order.user), joinedload(Order.offer))
        .where(
            Order.tenant_id == tenant_id,
            Order.payment_status == OrderPaymentStatus.PAID,
            Installment.id == None # Pas d'échéances = paiement comptant
        )
    )
    order_res = await db.execute(order_query)
    paid_lump_orders = {o.id: o for o in order_res.scalars().all()}

    tx_order_query = select(FinanceTransaction).where(
        FinanceTransaction.tenant_id == tenant_id, 
        FinanceTransaction.order_id != None,
        FinanceTransaction.installment_id == None # Uniquement les commandes directes
    )
    tx_order_res = await db.execute(tx_order_query)
    existing_tx_order = {tx.order_id: tx for tx in tx_order_res.scalars().all()}

    for order_id, order in paid_lump_orders.items():
        offer_code = order.offer.offer_code if order.offer.offer_code else order.offer.name[:10]
        desc_text = f"Paiement commande {offer_code}"
        if order.user:
            desc_text += f" - {order.user.first_name} {order.user.last_name}"
            
        if order_id in existing_tx_order:
            tx = existing_tx_order[order_id]
            if tx.description != desc_text or tx.amount_cents != order.price_cents:
                tx.description = desc_text
                tx.amount_cents = order.price_cents
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
            # On ne supprime que si c'était une transaction auto-générée (non manuelle)
            # Pour l'instant on simplifie : on supprime
            await db.delete(tx)

    # --- 4. GESTION DES ÉVÉNEMENTS (Registrations) ---
    from app.models.models import EventRegistration
    reg_query = (
        select(EventRegistration)
        .options(joinedload(EventRegistration.user), joinedload(EventRegistration.event))
        .where(EventRegistration.tenant_id == tenant_id, EventRegistration.payment_status == OrderPaymentStatus.PAID)
    )
    reg_res = await db.execute(reg_query)
    paid_regs = {reg.id: reg for reg in reg_res.scalars().all()}

    tx_reg_query = select(FinanceTransaction).where(FinanceTransaction.tenant_id == tenant_id, FinanceTransaction.registration_id != None)
    tx_reg_res = await db.execute(tx_reg_query)
    existing_tx_reg = {tx.registration_id: tx for tx in tx_reg_res.scalars().all()}

    for reg_id, reg in paid_regs.items():
        desc_text = f"Inscription {reg.event.title}"
        if reg.user:
            desc_text += f" - {reg.user.first_name} {reg.user.last_name}"
            
        if reg_id in existing_tx_reg:
            tx = existing_tx_reg[reg_id]
            if tx.description != desc_text:
                tx.description = desc_text
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
        {"name": "Ventes Offres", "type": FinanceTransactionType.INCOME, "color": "#3b82f6"},
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

@router.get("/transactions", response_model=List[FinanceTransactionResponse])
async def list_transactions(
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
    
    # Map to response with category_name
    response = []
    for t in transactions:
        res = FinanceTransactionResponse.model_validate(t)
        if t.category:
            res.category_name = t.category.name
        if t.account:
            res.account_name = t.account.name
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
        .options(joinedload(FinanceTransaction.category), joinedload(FinanceTransaction.account))
    )
    t = result.scalar_one()
    res = FinanceTransactionResponse.model_validate(t)
    if t.category:
        res.category_name = t.category.name
    if t.account:
        res.account_name = t.account.name
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
        .options(joinedload(FinanceTransaction.category), joinedload(FinanceTransaction.account))
    )
    t = result.scalar_one()
    res = FinanceTransactionResponse.model_validate(t)
    if t.category:
        res.category_name = t.category.name
    if t.account:
        res.account_name = t.account.name
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
        recent_transactions=recent_trans,
        monthly_trend=sorted_trend,
        projected_income_cents=projected_income,
        overdue_income_cents=overdue_income,
        projected_trend=sorted_projected
    )
