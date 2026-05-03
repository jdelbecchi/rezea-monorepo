"""
Schémas Pydantic pour validation des requêtes/réponses
"""
from datetime import datetime, date
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from uuid import UUID

from app.models.models import UserRole, BookingStatus, CreditTransactionType, WaitlistStatus, OrderPaymentStatus


# ==================== Auth ====================
class TokenResponse(BaseModel):
    """Réponse de connexion"""
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    tenant_id: UUID
    role: UserRole


class LoginRequest(BaseModel):
    """Requête de connexion"""
    email: EmailStr
    password: str
    tenant_slug: str


class ForgotPasswordRequest(BaseModel):
    """Requête de mot de passe oublié"""
    email: EmailStr
    tenant_slug: str


class ResetPasswordRequest(BaseModel):
    """Requête de réinitialisation de mot de passe"""
    token: str
    new_password: str = Field(..., min_length=8)


# ==================== User ====================
class UserBase(BaseModel):
    """Base utilisateur"""
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    street: Optional[str] = Field(None, max_length=255)
    zip_code: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)
    birth_date: Optional[date] = None
    instagram_handle: Optional[str] = Field(None, max_length=100)
    facebook_handle: Optional[str] = Field(None, max_length=100)


class UserCreate(UserBase):
    """Création d'utilisateur"""
    password: str = Field(..., min_length=8)
    tenant_slug: str
    docs_accepted: bool = False
    remind_before_session: bool = True
    receive_marketing_emails: bool = True


class UserUpdate(BaseModel):
    """Mise à jour d'utilisateur"""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8)
    street: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None
    birth_date: Optional[date] = None
    instagram_handle: Optional[str] = None
    facebook_handle: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    is_active_override: Optional[bool] = None
    is_blacklisted: Optional[bool] = None
    blacklist_reason: Optional[str] = None
    remind_before_session: Optional[bool] = None
    receive_marketing_emails: Optional[bool] = None


class UserResponse(UserBase):
    """Réponse utilisateur"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    tenant_id: UUID
    role: UserRole
    is_active: bool
    is_active_override: Optional[bool] = False
    created_by_admin: bool = False
    is_active_member: bool = False
    balance: Optional[Decimal] = None
    email_verified: bool
    docs_accepted_at: Optional[datetime] = None
    created_at: datetime
    last_login: Optional[datetime] = None
    is_blacklisted: bool = False
    blacklist_reason: Optional[str] = None
    remind_before_session: bool = True
    receive_marketing_emails: bool = True

    @field_validator('is_active_override', 'created_by_admin', mode='before')
    @classmethod
    def validate_nullable_bools(cls, v):
        """Assure que None est transformé en False pour éviter les erreurs de validation"""
        return v if v is not None else False


# ==================== Tenant ====================
class TenantBase(BaseModel):
    """Base tenant"""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = None


class TenantCreate(TenantBase):
    """Création de tenant"""
    pass


class TenantSettingsUpdate(BaseModel):
    """Mise à jour des paramètres du tenant (admin club uniquement)"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    primary_color: Optional[str] = Field(None, pattern="^#[0-9a-fA-F]{6}$")
    login_primary_color: Optional[str] = Field(None, pattern="^#[0-9a-fA-FA-F]{6}$")
    login_background_url: Optional[str] = None
    login_description: Optional[str] = None
    welcome_message: Optional[str] = Field(None, max_length=2000)
    cgv_url: Optional[str] = None
    rules_url: Optional[str] = None
    registration_limit_mins: Optional[int] = Field(None, ge=0)
    cancellation_limit_mins: Optional[int] = Field(None, ge=0)
    confirmation_email_body: Optional[str] = None
    allow_pay_later: Optional[bool] = None
    payment_redirect_link: Optional[str] = None
    pay_now_instructions: Optional[str] = None
    locations: Optional[List[str]] = Field(default_factory=list)


class TenantResponse(TenantBase):
    """Réponse tenant"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    is_active: bool
    max_users: int
    max_sessions_per_day: int
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    primary_color: Optional[str] = "#7c3aed"
    login_primary_color: Optional[str] = None
    login_background_url: Optional[str] = None
    login_description: Optional[str] = None
    welcome_message: Optional[str] = None
    cgv_url: Optional[str] = None
    rules_url: Optional[str] = None
    registration_limit_mins: int = 0
    cancellation_limit_mins: int = 45
    confirmation_email_body: Optional[str] = None
    allow_pay_later: bool = True
    payment_redirect_link: Optional[str] = None
    pay_now_instructions: Optional[str] = None
    locations: Optional[List[str]] = Field(default_factory=list)
    created_at: datetime


# ==================== SysAdmin ====================
class SysAdminLogin(BaseModel):
    """Requête de connexion sysadmin"""
    email: EmailStr
    password: str


class SysAdminTokenResponse(BaseModel):
    """Réponse token sysadmin"""
    access_token: str
    token_type: str = "bearer"
    sysadmin_id: UUID
    role: str = "sysadmin"


class SysAdminResponse(BaseModel):
    """Réponse sysadmin"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    email: str
    name: str
    is_active: bool
    created_at: datetime




# ==================== Session ====================
class SessionBase(BaseModel):
    """Base séance"""
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    activity_type: Optional[str] = Field(None, max_length=100)
    instructor_name: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    start_time: datetime
    end_time: datetime
    max_participants: int = Field(..., gt=0)
    credits_required: Decimal = Field(Decimal("1.0"), ge=0)
    allow_waitlist: bool = True


class SessionCreate(SessionBase):
    """Création de séance"""
    pass


class SessionUpdate(BaseModel):
    """Mise à jour de séance"""
    title: Optional[str] = None
    description: Optional[str] = None
    instructor_name: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    max_participants: Optional[int] = None
    credits_required: Optional[Decimal] = None
    is_active: Optional[bool] = None
    location: Optional[str] = None
    allow_waitlist: Optional[bool] = None


class SessionResponse(SessionBase):
    """Réponse séance"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    tenant_id: UUID
    current_participants: int
    is_active: bool
    created_at: datetime
    available_spots: int = 0
    is_full: bool = False
    waitlist_count: int = 0
    
    def model_post_init(self, __context):
        """Calcul des champs dérivés"""
        self.available_spots = self.max_participants - self.current_participants
        self.is_full = self.current_participants >= self.max_participants


# ==================== Booking ====================
class BookingCreate(BaseModel):
    """Création de réservation"""
    session_id: UUID
    notes: Optional[str] = None


class BookingResponse(BaseModel):
    """Réponse réservation"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    user_id: UUID
    session_id: UUID
    status: BookingStatus
    credits_used: Decimal
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class BookingListResponse(BaseModel):
    """Liste de réservations avec infos de séance"""
    booking: BookingResponse
    session: SessionResponse


# ==================== Credits ====================
class CreditAccountResponse(BaseModel):
    """Réponse compte de crédits"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    user_id: UUID
    balance: Decimal
    total_purchased: Decimal
    total_used: Decimal
    created_at: datetime


class CreditTransactionResponse(BaseModel):
    """Réponse transaction de crédits"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    transaction_type: CreditTransactionType
    amount: Decimal
    balance_after: Decimal
    description: Optional[str] = None
    payment_provider: Optional[str] = None
    created_at: datetime


class CreditPurchaseRequest(BaseModel):
    """Requête d'achat de crédits via une offre"""
    offer_id: UUID
    payment_provider: str = Field(..., pattern="^(helloasso|stripe)$")


class CreditPurchaseResponse(BaseModel):
    """Réponse d'achat de crédits"""
    transaction_id: UUID
    amount: Decimal  # Nombre de cours/crédits
    payment_url: str
    payment_id: str


# ==================== Offers ====================
class OfferBase(BaseModel):
    """Base offre"""
    offer_code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    price_lump_sum_cents: Optional[int] = Field(None, ge=0)
    price_recurring_cents: Optional[int] = Field(None, ge=0)
    recurring_count: Optional[int] = Field(None, ge=1)
    featured_pricing: str = "lump_sum"
    period: Optional[str] = Field(None, max_length=50)
    classes_included: Optional[int] = Field(None, gt=0)
    is_unlimited: bool = False
    validity_days: Optional[int] = Field(None, ge=0)
    validity_unit: str = "days"
    deadline_date: Optional[date] = None
    is_validity_unlimited: Optional[bool] = False
    is_unique: bool = False
    is_active: bool = True
    display_order: Optional[int] = 0
    category_display_order: Optional[int] = 0


class OfferCreate(OfferBase):
    """Création d'offre"""
    pass


class OfferUpdate(BaseModel):
    """Mise à jour d'offre"""
    offer_code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    price_lump_sum_cents: Optional[int] = Field(None, ge=0)
    price_recurring_cents: Optional[int] = Field(None, ge=0)
    recurring_count: Optional[int] = Field(None, ge=1)
    featured_pricing: Optional[str] = None
    period: Optional[str] = Field(None, max_length=50)
    classes_included: Optional[int] = Field(None, gt=0)
    is_unlimited: Optional[bool] = None
    validity_days: Optional[int] = None
    validity_unit: Optional[str] = None
    deadline_date: Optional[date] = None
    is_validity_unlimited: Optional[bool] = None
    is_unique: Optional[bool] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None
    category_display_order: Optional[int] = None


class OfferResponse(OfferBase):
    """Réponse offre"""
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)



# ==================== Waitlist ====================
class WaitlistEntryCreate(BaseModel):
    """Création d'entrée en liste d'attente"""
    session_id: UUID


class WaitlistEntryResponse(BaseModel):
    """Réponse entrée en liste d'attente"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    user_id: UUID
    session_id: UUID
    status: WaitlistStatus
    position: int
    notified_at: Optional[datetime] = None
    created_at: datetime


# ==================== Planning ====================
class PlanningFilter(BaseModel):
    """Filtres pour le planning"""
    start_date: datetime
    end_date: datetime
    activity_type: Optional[str] = None
    available_only: bool = False


class PlanningDayResponse(BaseModel):
    """Planning pour une journée"""
    date: datetime
    sessions: List[SessionResponse]
    total_sessions: int


class SessionDuplicateRequest(BaseModel):
    """Requête de duplication de séances"""
    source_start: datetime
    source_end: datetime
    target_start: datetime


# ==================== Events ====================
class EventCreate(BaseModel):
    """Création d'événement"""
    event_date: date
    event_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    title: str = Field(..., min_length=1, max_length=255)
    duration_minutes: int = Field(..., gt=0)
    price_member_cents: int = Field(0, ge=0)
    price_external_cents: int = Field(0, ge=0)
    instructor_name: str = Field(..., min_length=1, max_length=255)
    max_places: int = Field(..., gt=0)
    location: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    allow_waitlist: bool = True


class EventUpdate(BaseModel):
    """Mise à jour d'événement"""
    event_date: Optional[date] = None
    event_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    duration_minutes: Optional[int] = Field(None, gt=0)
    price_member_cents: Optional[int] = Field(None, ge=0)
    price_external_cents: Optional[int] = Field(None, ge=0)
    instructor_name: Optional[str] = Field(None, min_length=1, max_length=255)
    max_places: Optional[int] = Field(None, gt=0)
    location: Optional[str] = None
    description: Optional[str] = None
    allow_waitlist: Optional[bool] = None
    is_active: Optional[bool] = None


class EventResponse(BaseModel):
    """Réponse événement"""
    id: UUID
    tenant_id: UUID
    event_date: date
    event_time: str
    title: str
    duration_minutes: int
    price_member_cents: int
    price_external_cents: int
    instructor_name: str
    max_places: int
    registrations_count: int
    waitlist_count: int = 0
    is_registered: Optional[bool] = False
    registration_status: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    allow_waitlist: bool = True
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== Orders ====================
class OrderCreate(BaseModel):
    """Création de commande par admin"""
    user_id: UUID
    offer_id: UUID
    start_date: date
    comment: Optional[str] = None
    user_note: Optional[str] = None


class OrderUpdate(BaseModel):
    """Mise à jour de commande"""
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    price_cents: Optional[int] = None
    credits_total: Optional[Decimal] = None
    is_unlimited: Optional[bool] = None
    status: Optional[str] = None
    payment_status: Optional[OrderPaymentStatus] = None
    comment: Optional[str] = None
    user_note: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_url: Optional[str] = None


class InstallmentResponse(BaseModel):
    """Réponse échéance pour la modale échéancier"""
    id: UUID
    order_id: UUID
    due_date: date
    amount_cents: int
    is_paid: bool = False
    is_error: bool = False
    marked_error_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    """Réponse commande pour la table admin"""
    id: UUID
    tenant_id: UUID
    user_id: UUID
    offer_id: UUID
    # Champs directs
    start_date: date
    end_date: Optional[date] = None
    is_validity_unlimited: bool = False
    credits_total: Optional[Decimal] = None
    is_unlimited: bool = False
    price_cents: int
    payment_status: OrderPaymentStatus
    comment: Optional[str] = None
    user_note: Optional[str] = None
    created_by_admin: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Facturation
    invoice_number: Optional[str] = None
    invoice_url: Optional[str] = None
    # Champs calculés / joints
    user_name: str = ""
    user_email: str = ""
    user_is_suspended: bool = False
    offer_code: str = ""
    offer_name: str = ""
    offer_period: Optional[str] = None
    offer_featured_pricing: Optional[str] = None
    offer_price_recurring_cents: Optional[int] = None
    offer_price_lump_sum_cents: Optional[int] = None
    offer_recurring_count: Optional[int] = None
    credits_used: Decimal = Decimal("0.0")
    balance: Optional[Decimal] = None
    status: str = "active"
    # Snapshots contractuels (Optionnels pour compatibilité avec anciennes commandes)
    offer_snap_name: Optional[str] = None
    offer_snap_description: Optional[str] = None
    offer_snap_validity_days: Optional[int] = None
    offer_snap_validity_unit: Optional[str] = None
    offer_snap_is_validity_unlimited: Optional[bool] = False
    # Financial summary for installments
    received_cents: int = 0
    pending_cents: int = 0
    error_cents: int = 0
    # Échéances
    installments: List[InstallmentResponse] = []

    model_config = ConfigDict(from_attributes=True)





# ==================== Admin Bookings ====================
class AdminBookingCreate(BaseModel):
    """Création d'inscription par admin"""
    user_id: UUID
    session_id: UUID
    notes: Optional[str] = None


class AdminBookingUpdate(BaseModel):
    """Mise à jour d'inscription"""
    notes: Optional[str] = None
    status: Optional[BookingStatus] = None


class AdminBookingResponse(BaseModel):
    """Réponse inscription pour la table admin"""
    id: UUID
    tenant_id: UUID
    user_id: UUID
    session_id: UUID
    status: BookingStatus
    credits_used: Decimal
    created_by_admin: bool = False
    cancellation_type: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    cancelled_at: Optional[datetime] = None
    # Champs joints
    session_date: str = ""        # date de la séance
    session_time: str = ""        # heure de la séance
    session_title: str = ""       # intitulé de la séance
    user_name: str = ""           # prénom + nom
    user_phone: Optional[str] = None
    instagram_handle: Optional[str] = None
    facebook_handle: Optional[str] = None
    has_pending_order: bool = False

    model_config = ConfigDict(from_attributes=True)


# ==================== Admin Event Registrations ====================
class EventRegistrationCreate(BaseModel):
    """Création d'inscription à un événement par admin"""
    user_id: UUID
    event_id: UUID
    price_paid_cents: int = 0
    payment_status: Optional[OrderPaymentStatus] = None
    notes: Optional[str] = None
    user_note: Optional[str] = None


class EventRegistrationUpdate(BaseModel):
    """Mise à jour d'inscription à un événement"""
    notes: Optional[str] = None
    status: Optional[str] = None
    payment_status: Optional[OrderPaymentStatus] = None
    user_note: Optional[str] = None


class EventRegistrationResponse(BaseModel):
    """Réponse inscription événement pour la table admin"""
    id: UUID
    tenant_id: UUID
    user_id: UUID
    event_id: UUID
    status: str
    price_paid_cents: int
    payment_status: str
    created_by_admin: bool = False
    notes: Optional[str] = None
    user_note: Optional[str] = None
    created_at: datetime
    cancelled_at: Optional[datetime] = None
    instructor_name: Optional[str] = None
    # Champs joints
    event_date: str = ""
    event_time: str = ""
    event_title: str = ""
    user_name: str = ""
    user_phone: Optional[str] = None
    instagram_handle: Optional[str] = None
    facebook_handle: Optional[str] = None
    has_pending_order: bool = False

    model_config = ConfigDict(from_attributes=True)


# ==================== Emails ====================
class EmailSendRequest(BaseModel):
    """Requête d'envoi d'email groupé"""
    subject: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1)
    recipient_type: str = Field(..., pattern="^(all|active|selected)$")
    selected_user_ids: Optional[List[UUID]] = None


class EmailTemplateBase(BaseModel):
    """Base pour les modèles d'email"""
    name: str = Field(..., min_length=1, max_length=255)
    subject: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1)


class EmailTemplateCreate(EmailTemplateBase):
    """Création d'un modèle d'email"""
    pass


class EmailTemplateResponse(EmailTemplateBase):
    """Réponse pour un modèle d'email"""
    id: UUID
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# ==================== Shop ====================
class ShopCheckoutRequest(BaseModel):
    """Requête de checkout boutique"""
    offer_id: UUID
    pay_later: bool = False
    start_date: Optional[date] = None
    pricing_type: str = "lump_sum" # 'lump_sum' or 'recurring'


class ShopCheckoutResponse(BaseModel):
    """Réponse de checkout boutique"""
    order: OrderResponse
    message: str
    redirect_url: Optional[str] = None

