/**
 * Centralisation des Énumérations et Constantes (Audit REZEA)
 * 
 * Ce fichier garantit la cohérence des statuts entre le Backend et le Frontend.
 * Toute modification de statut côté API doit être reportée ici.
 */

export enum UserRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  STAFF = 'staff',
  USER = 'user'
}

export enum PaymentStatus {
  A_VALIDER = 'a_valider',
  PAYE = 'paye',
  REMBOURSE = 'rembourse',
  EN_ATTENTE = 'en_attente',
  ECHELONNE = 'echelonne',
  A_REGULARISER = 'a_regulariser'
}

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  SESSION_CANCELLED = 'session_cancelled',
  ABSENT = 'absent'
}

export enum EventRegistrationStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  ABSENT = 'absent',
  EVENT_DELETED = 'event_deleted',
  WAITING_LIST = 'waiting_list'
}
