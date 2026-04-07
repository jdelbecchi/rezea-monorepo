"""
Modèles SQLAlchemy pour REZEA
Tous les modèles incluent tenant_id pour l'isolation multi-tenant
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, String, Integer, DateTime, Boolean, ForeignKey,
    Numeric, Text, Enum as SQLEnum, Index, CheckConstraint, Date, Time
)
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.session import Base


# Enums
class UserRole(str, enum.Enum):
    OWNER = "owner"
    MANAGER = "manager"
    STAFF = "staff"
    USER = "user"


class BookingStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    SESSION_CANCELLED = "session_cancelled"
    ABSENT = "absent"


class EventRegistrationStatus(str, enum.Enum):
    PENDING_PAYMENT = "pending_payment"   # Inscrit, place bloquée, paiement en attente
    CONFIRMED = "confirmed"              # Inscrit et payé
    WAITING_LIST = "waiting_list"         # Sur liste d'attente (place non bloquée)
    CANCELLED = "cancelled"              # Annulé par le manager
    ABSENT = "absent"                    # Ne s'est pas présenté
    EVENT_DELETED = "event_deleted"       # L'événement a été supprimé


class CreditTransactionType(str, enum.Enum):
    PURCHASE = "purchase"
    BOOKING = "booking"
    REFUND = "refund"
    ADJUSTMENT = "adjustment"


class WaitlistStatus(str, enum.Enum):
    WAITING = "waiting"
    NOTIFIED = "notified"
    EXPIRED = "expired"


class OrderPaymentStatus(str, enum.Enum):
    PENDING = "a_valider"
    PAID = "paye"
    REFUNDED = "rembourse"
    WAITING = "en_attente"
    INSTALLMENT = "echelonne"
    ISSUE = "a_regulariser"


# Modèles
class Tenant(Base):
    """Organisation (Établissement sportif)"""
    __tablename__ = "tenants"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text)
    
    # Configuration
    is_active = Column(Boolean, default=True)
    max_users = Column(Integer, default=100)
    max_sessions_per_day = Column(Integer, default=10)
    
    # Personnalisation visuelle
    logo_url = Column(String(500), nullable=True)
    banner_url = Column(String(500), nullable=True)
    primary_color = Column(String(7), default="#7c3aed")
    welcome_message = Column(String(500), nullable=True)
    
    # Documents légaux
    cgv_url = Column(String(500), nullable=True)
    rules_url = Column(String(500), nullable=True)
    
    # Paramètres de gestion
    registration_limit_mins = Column(Integer, default=0, nullable=False)  # 0 = pas de limite
    cancellation_limit_mins = Column(Integer, default=45, nullable=False)
    
    # Emails
    confirmation_email_body = Column(Text, nullable=True)
    
    # Lieux et Espaces
    locations = Column(JSON, default=list) # Liste des noms de salles autorisées
    
    # Options de paiement
    allow_pay_later = Column(Boolean, default=True)
    payment_redirect_link = Column(String(500), nullable=True)
    pay_now_instructions = Column(Text, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="tenant", cascade="all, delete-orphan")
    email_templates = relationship("EmailTemplate", back_populates="tenant", cascade="all, delete-orphan")


class EmailTemplate(Base):
    """Modèle d'email pré-enregistré par le club"""
    __tablename__ = "email_templates"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    
    name = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    tenant = relationship("Tenant", back_populates="email_templates")

    __table_args__ = (
        Index("idx_email_templates_tenant", "tenant_id"),
    )


class SysAdmin(Base):
    """Super-administrateur global (hors-tenant)"""
    __tablename__ = "sysadmins"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class User(Base):
    """Utilisateur (membre d'un établissement)"""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    
    # Authentification
    email = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole, values_callable=lambda e: [x.value for x in e]), default=UserRole.USER, nullable=False)
    
    # Profil
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    phone = Column(String(20))
    
    # Adresse
    street = Column(String(255))
    zip_code = Column(String(20))
    city = Column(String(100))
    
    # Détails
    birth_date = Column(Date)
    instagram_handle = Column(String(100))
    facebook_handle = Column(String(100))
    
    # Statut
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)
    docs_accepted_at = Column(DateTime, nullable=True)
    
    # Blacklist / Red Flag
    is_blacklisted = Column(Boolean, default=False)
    is_suspended = Column(Boolean, default=False)  # Suspend credits (blocks bookings)
    blacklist_reason = Column(Text)
    
    # Préférences (Notifications & Marketing)
    remind_before_session = Column(Boolean, default=True)
    receive_marketing_emails = Column(Boolean, default=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime)
    
    # Relations
    tenant = relationship("Tenant", back_populates="users")
    credit_accounts = relationship("CreditAccount", back_populates="user")
    bookings = relationship("Booking", back_populates="user")
    waitlist_entries = relationship("WaitlistEntry", back_populates="user")
    orders = relationship("Order", back_populates="user")
    
    # Index pour RLS et performances
    __table_args__ = (
        Index("idx_users_tenant_email", "tenant_id", "email", unique=True),
        Index("idx_users_tenant_role", "tenant_id", "role"),
    )


class Session(Base):
    """Séance/Créneau sportif"""
    __tablename__ = "sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    
    # Informations
    title = Column(String(255), nullable=False)
    description = Column(Text)
    activity_type = Column(String(100))  # Ex: Tennis, Yoga, Fitness
    instructor_name = Column(String(255))  # Attribution / animateur
    location = Column(String(255))  # Salle / Lieu
    
    # Planning
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    recurrence_id = Column(UUID(as_uuid=True), index=True, nullable=True)
    
    # Capacité
    max_participants = Column(Integer, nullable=False)
    current_participants = Column(Integer, default=0, nullable=False)
    credits_required = Column(Numeric(10, 2), default=1.0, nullable=False)
    
    # Configuration
    allow_waitlist = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    tenant = relationship("Tenant", back_populates="sessions")
    bookings = relationship("Booking", back_populates="session")
    waitlist_entries = relationship("WaitlistEntry", back_populates="session")
    
    # Contraintes et index
    __table_args__ = (
        CheckConstraint("end_time > start_time", name="check_session_times"),
        CheckConstraint("max_participants > 0", name="check_max_participants"),
        CheckConstraint("credits_required >= 0", name="check_credits_positive"),
        CheckConstraint("current_participants >= 0", name="check_current_participants"),
        Index("idx_sessions_tenant_time", "tenant_id", "start_time"),
        Index("idx_sessions_tenant_active", "tenant_id", "is_active", "start_time"),
    )


class CreditAccount(Base):
    """Compte de crédits d'un utilisateur"""
    __tablename__ = "credit_accounts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Crédits
    balance = Column(Numeric(10, 2), default=0.0, nullable=False)
    total_purchased = Column(Numeric(10, 2), default=0.0, nullable=False)
    total_used = Column(Numeric(10, 2), default=0.0, nullable=False)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    user = relationship("User", back_populates="credit_accounts")
    transactions = relationship("CreditTransaction", back_populates="account")
    
    __table_args__ = (
        Index("idx_credit_accounts_tenant_user", "tenant_id", "user_id", unique=True),
        CheckConstraint("balance >= 0", name="check_balance_positive"),
    )


class CreditTransaction(Base):
    """Transaction de crédits (achat, utilisation, remboursement)"""
    __tablename__ = "credit_transactions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("credit_accounts.id"), nullable=False)
    
    # Transaction
    transaction_type = Column(SQLEnum(CreditTransactionType), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)  # Positif pour achat, négatif pour usage
    balance_after = Column(Numeric(10, 2), nullable=False)
    
    # Métadonnées
    description = Column(String(255))
    reference = Column(String(100))  # Ex: booking_id, payment_id
    
    # Paiement (pour les achats)
    payment_provider = Column(String(50))  # HelloAsso, Stripe
    payment_id = Column(String(255))
    payment_amount = Column(Numeric(10, 2))  # Montant en euros
    offer_id = Column(UUID(as_uuid=True), ForeignKey("offers.id"))  # Offre achetée
    
    # FIFO tracking (pour consommation)
    expires_at = Column(DateTime)  # Date d'expiration des crédits
    consumed_at = Column(DateTime)  # Date de consommation
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relations
    account = relationship("CreditAccount", back_populates="transactions")
    offer = relationship("Offer", back_populates="transactions")
    
    __table_args__ = (
        Index("idx_credit_transactions_tenant_account", "tenant_id", "account_id"),
        Index("idx_credit_transactions_fifo", "tenant_id", "account_id", "expires_at"),
        Index("idx_credit_transactions_offer", "offer_id"),
    )


class Offer(Base):
    """Offre/Prestation configurable par l'admin"""
    __tablename__ = "offers"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    
    # Identification
    offer_code = Column(String(50), nullable=False)  # Code offre alphanumérique
    name = Column(String(100), nullable=False)  # Intitulé de l'offre
    category = Column(String(100))  # Rubrique / Catégorie
    description = Column(Text)
    
    # Tarif
    price_lump_sum_cents = Column(Integer)  # Prix unique en centimes
    price_recurring_cents = Column(Integer)  # Prix récurrent en centimes
    recurring_count = Column(Integer)  # Nombre d'échéances
    featured_pricing = Column(String(20), default="lump_sum")  # 'lump_sum' ou 'recurring'
    period = Column(String(50))  # Période tarifaire (ex: /mois, /an)
    
    # Crédits
    classes_included = Column(Integer, nullable=True)  # Nombre de crédits (null si illimité)
    is_unlimited = Column(Boolean, default=False)  # Crédits illimités
    
    # Validité (l'un des deux doit être renseigné)
    validity_days = Column(Integer)  # Durée de validité
    validity_unit = Column(String(20), default="days")  # 'days' ou 'months'
    deadline_date = Column(Date)  # Date d'échéance (date limite de commande)
    is_validity_unlimited = Column(Boolean, default=False)  # Durée illimitée
    
    # Options
    is_unique = Column(Boolean, default=False)  # Offre unique (une seule commande par utilisateur)
    
    # Configuration
    is_active = Column(Boolean, default=True)
    display_order = Column(Integer, default=0) # N° d'offre
    category_display_order = Column(Integer, default=0) # N° de rubrique
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relations
    transactions = relationship("CreditTransaction", back_populates="offer")
    orders = relationship("Order", back_populates="offer")
    
    __table_args__ = (
        Index("idx_offers_tenant_active", "tenant_id", "is_active"),
    )



class Booking(Base):
    """Réservation d'une séance"""
    __tablename__ = "bookings"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    
    # Statut
    status = Column(SQLEnum(BookingStatus), default=BookingStatus.PENDING, nullable=False)
    
    # Crédits
    credits_used = Column(Numeric(10, 2), nullable=False)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("credit_transactions.id"))
    
    # Admin flag
    created_by_admin = Column(Boolean, default=False)
    
    # Annulation
    cancellation_type = Column(String(20))  # 'user' ou 'session'
    
    # Metadata
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    cancelled_at = Column(DateTime)
    
    # Relations
    user = relationship("User", back_populates="bookings")
    session = relationship("Session", back_populates="bookings")
    
    __table_args__ = (
        Index("idx_bookings_tenant_user", "tenant_id", "user_id"),
        Index("idx_bookings_tenant_session", "tenant_id", "session_id"),
        Index("idx_bookings_status", "tenant_id", "status", "created_at"),
    )


class WaitlistEntry(Base):
    """Entrée en liste d'attente"""
    __tablename__ = "waitlist_entries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    
    # Statut
    status = Column(SQLEnum(WaitlistStatus), default=WaitlistStatus.WAITING, nullable=False)
    position = Column(Integer, nullable=False)  # Position dans la liste
    
    # Notifications
    notified_at = Column(DateTime)
    notification_expires_at = Column(DateTime)  # Date limite pour réserver
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    user = relationship("User", back_populates="waitlist_entries")
    session = relationship("Session", back_populates="waitlist_entries")
    
    __table_args__ = (
        Index("idx_waitlist_tenant_session", "tenant_id", "session_id", "position"),
        Index("idx_waitlist_status", "tenant_id", "status", "created_at"),
    )


class Event(Base):
    """Événement programmé par l'admin"""
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)

    # Programmation
    event_date = Column(Date, nullable=False)
    event_time = Column(Time, nullable=False)
    title = Column(String(255), nullable=False)
    duration_minutes = Column(Integer, nullable=False)

    # Tarification
    price_member_cents = Column(Integer, nullable=False, default=0)
    price_external_cents = Column(Integer, nullable=False, default=0)

    # Attribution
    instructor_name = Column(String(255), nullable=False)
    location = Column(String(255))  # Salle / Lieu

    # Capacité
    max_places = Column(Integer, nullable=False)
    registrations_count = Column(Integer, default=0)

    # Description
    description = Column(Text)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_events_tenant_date", "tenant_id", "event_date"),
    )

    # Relations
    registrations = relationship("EventRegistration", back_populates="event", cascade="all, delete-orphan")


class EventRegistration(Base):
    """Inscription à un événement"""
    __tablename__ = "event_registrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False)

    # Statut
    status = Column(
        SQLEnum(EventRegistrationStatus, values_callable=lambda e: [x.value for x in e]),
        default=EventRegistrationStatus.PENDING_PAYMENT,
        nullable=False
    )

    # Tarif payé (en cents)
    price_paid_cents = Column(Integer, nullable=False, default=0)

    # Paiement (iso commandes)
    payment_status = Column(
        SQLEnum(OrderPaymentStatus, values_callable=lambda e: [x.value for x in e]),
        default=OrderPaymentStatus.PENDING,
        nullable=False
    )

    # Admin flag
    created_by_admin = Column(Boolean, default=False)

    # Notes
    notes = Column(Text)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    cancelled_at = Column(DateTime)

    # Relations
    user = relationship("User")
    event = relationship("Event", back_populates="registrations")

    __table_args__ = (
        Index("idx_event_reg_tenant_user", "tenant_id", "user_id"),
        Index("idx_event_reg_tenant_event", "tenant_id", "event_id"),
        Index("idx_event_reg_status", "tenant_id", "status", "created_at"),
    )


class Order(Base):
    """Commande d'une offre par un utilisateur"""
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    offer_id = Column(UUID(as_uuid=True), ForeignKey("offers.id"), nullable=False)

    # Dates
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)  # None if unlimited validity
    is_validity_unlimited = Column(Boolean, default=False)

    # Crédits (copiés de l'offre à la création)
    credits_total = Column(Integer)  # null si illimité
    is_unlimited = Column(Boolean, default=False)

    # Tarif (copié de l'offre)
    price_cents = Column(Integer, nullable=False)

    # Paiement
    payment_status = Column(
        SQLEnum(OrderPaymentStatus, values_callable=lambda e: [x.value for x in e]),
        default=OrderPaymentStatus.PENDING,
        nullable=False
    )

    # Commentaire
    comment = Column(Text)

    # Statut manuel (Reporté, Pause, Expiré, Résilié, etc.)
    status = Column(String(50))

    # Flag: créé par un manager
    created_by_admin = Column(Boolean, default=False)

    # Snapshot des infos de l'offre au moment de l'achat (Contractuel)
    offer_snap_name = Column(String(100))
    offer_snap_description = Column(Text)
    offer_snap_validity_days = Column(Integer)
    offer_snap_validity_unit = Column(String(20))
    offer_snap_is_validity_unlimited = Column(Boolean, default=False)
    
    # Facturation
    invoice_number = Column(String(100), nullable=True)
    invoice_url = Column(String(500), nullable=True)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    user = relationship("User", back_populates="orders")
    offer = relationship("Offer", back_populates="orders")
    installments = relationship("Installment", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_orders_tenant_user", "tenant_id", "user_id"),
        Index("idx_orders_tenant_created", "tenant_id", "created_at"),
    )


class Installment(Base):
    """Échéance de paiement pour les commandes échelonnées"""
    __tablename__ = "installments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False)

    # Échéance
    due_date = Column(Date, nullable=False)  # Date d'anniversaire (le 8 du mois)
    amount_cents = Column(Integer, nullable=False)  # Montant de l'échéance

    # Gestion par défaut : À venir, sauf si marqué en erreur
    is_error = Column(Boolean, default=False)
    is_paid = Column(Boolean, default=False)  # Sera utilisé pour le pointage manuel optionnel
    marked_error_at = Column(DateTime, nullable=True)  # Date du signalement d'impayé
    resolved_at = Column(DateTime, nullable=True)  # Date de régularisation

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relations
    order = relationship("Order", back_populates="installments")

    __table_args__ = (
        Index("idx_installments_order", "order_id"),
        Index("idx_installments_tenant", "tenant_id"),
    )
