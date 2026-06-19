
# ==================== Finance / Treasury ====================

class FinanceCategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: Optional[FinanceTransactionType] = None
    color: Optional[str] = Field(None, max_length=20)
    default_vat_rate: Decimal = Decimal("0")
    is_default: bool = False

class FinanceCategoryCreate(FinanceCategoryBase):
    pass

class FinanceCategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[FinanceTransactionType] = None
    color: Optional[str] = None
    default_vat_rate: Optional[Decimal] = None

class FinanceCategoryResponse(FinanceCategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    created_at: datetime

class FinanceTransactionBase(BaseModel):
    date: date
    type: FinanceTransactionType
    category_id: Optional[UUID] = None
    amount_cents: int
    vat_amount_cents: int = 0
    vat_rate: Decimal = Decimal("0")
    description: str = Field(..., min_length=1, max_length=255)
    payment_method: FinancePaymentMethod = FinancePaymentMethod.OTHER
    order_id: Optional[UUID] = None
    registration_id: Optional[UUID] = None
    is_reconciled: bool = True
    receipt_url: Optional[str] = None

class FinanceTransactionCreate(FinanceTransactionBase):
    pass

class FinanceTransactionUpdate(BaseModel):
    date: Optional[date] = None
    type: Optional[FinanceTransactionType] = None
    category_id: Optional[UUID] = None
    amount_cents: Optional[int] = None
    vat_amount_cents: Optional[int] = None
    vat_rate: Optional[Decimal] = None
    description: Optional[str] = None
    payment_method: Optional[FinancePaymentMethod] = None
    is_reconciled: Optional[bool] = None
    receipt_url: Optional[str] = None

class FinanceTransactionResponse(FinanceTransactionBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    created_by_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    category_name: Optional[str] = None

class FinanceDashboardResponse(BaseModel):
    """Résumé pour le tableau de bord de trésorerie"""
    total_income_cents: int
    total_expense_cents: int
    net_balance_cents: int
    
    income_by_category: List[dict] # {category: str, amount: int, color: str}
    expense_by_category: List[dict]
    
    recent_transactions: List[FinanceTransactionResponse]
    
    # Évolution sur les derniers mois
    monthly_trend: List[dict] # {month: str, income: int, expense: int}
    
    # Prévisions (basées sur l'échéancier)
    projected_income_cents: int = 0
    overdue_income_cents: int = 0
    projected_trend: List[dict] = [] # {month: str, amount: int}
