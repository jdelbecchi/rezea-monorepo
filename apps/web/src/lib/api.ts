/**
 * Client API pour communiquer avec le backend FastAPI
 */
import axios, { AxiosInstance, AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

import { UserRole, PaymentStatus, BookingStatus, EventRegistrationStatus } from '../types/enums';

// Instance Axios configurée
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur pour ajouter le token JWT
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const url = config.url || '';
      // Utiliser le token sysadmin pour les routes sysadmin
      if (url.includes('/sysadmin')) {
        const sysToken = localStorage.getItem('sysadmin_token');
        if (sysToken) {
          config.headers.Authorization = `Bearer ${sysToken}`;
        }
      } else {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }

      // Injection automatique du X-Tenant-Slug depuis l'URL
      const segments = window.location.pathname.split('/');
      const slug = segments[1];
      // On évite d'injecter si c'est une route racine réservée (ex: /login, /dashboard)
      if (slug && !['login', 'register', 'sysadmin', 'dashboard', 'reset-password'].includes(slug)) {
        config.headers['X-Tenant-Slug'] = slug;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercepteur pour gérer les erreurs
// IMPORTANT : Ne redirige vers /login QUE si le serveur a explicitement
// répondu 401. Les erreurs réseau (backend down, timeout, 500) ne doivent
// PAS détruire la session de l'utilisateur.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // --- Cas 1 : Erreur réseau (serveur down, timeout, CORS) ---
    // error.response est undefined → le serveur n'a pas répondu du tout.
    // On ne touche PAS au token, on laisse la page gérer l'erreur.
    if (!error.response) {
      console.warn('[API] Erreur réseau — le serveur est probablement inaccessible.', error.message);
      return Promise.reject(error);
    }

    // --- Cas 2 : Le serveur a répondu avec un code d'erreur ---
    const status = error.response.status;
    const url = error.config?.url || '';

    // 401 = Token expiré ou invalide (réponse explicite du serveur)
    if (status === 401) {
      if (typeof window !== 'undefined') {
        const pathname = window.location.pathname;

        // Ne pas rediriger sur les endpoints de login (laisser la page afficher l'erreur)
        if (url.includes('/login')) {
          return Promise.reject(error);
        }

        // Pour les pages sysadmin, rediriger vers /sysadmin/login
        if (pathname.startsWith('/sysadmin') || url.includes('/sysadmin')) {
          localStorage.removeItem('sysadmin_token');
          window.location.href = '/sysadmin/login';
          return Promise.reject(error);
        }

        // Pour les pages normales, rediriger vers /login
        localStorage.removeItem('access_token');
        window.location.href = '/login';
      }
    }

    // 500+ = Erreur serveur. On ne touche pas au token.
    if (status >= 500) {
      console.error(`[API] Erreur serveur ${status} sur ${url}`);
    }

    return Promise.reject(error);
  }
);

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  tenant_id: string;
  phone?: string;
  street?: string;
  zip_code?: string;
  city?: string;
  birth_date?: string;
  instagram_handle?: string;
  facebook_handle?: string;
  is_active: boolean;
  is_active_member?: boolean;
  email_verified?: boolean;
  created_at?: string;
  last_login?: string;
  is_blacklisted?: boolean;
  blacklist_reason?: string;
  remind_before_session?: boolean;
  receive_marketing_emails?: boolean;
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  activity_type?: string;
  start_time: string;
  end_time: string;
  max_participants: number;
  current_participants: number;
  credits_required: number;
  available_spots: number;
  is_full: boolean;
  is_active: boolean;
  allow_waitlist: boolean;
  instructor_name?: string;
}

export interface Event {
  id: string;
  title: string;
  description?: string;
  event_date: string;
  event_time: string;
  duration_minutes: number;
  price_member_cents: number;
  price_external_cents: number;
  instructor_name: string;
  max_places: number;
  registrations_count: number;
  is_registered?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  banner_url?: string;
  primary_color: string;
  welcome_message?: string;
  cgv_url?: string;
  rules_url?: string;
  registration_limit_mins: number;
  cancellation_limit_mins: number;
  confirmation_email_body?: string;
  allow_pay_later: boolean;
  payment_redirect_link?: string;
  pay_now_instructions?: string;
  is_active: boolean;
  max_users: number;
  max_sessions_per_day: number;
  created_at: string;
}

export interface Offer {
  id: string;
  offer_code: string;
  name: string;
  category: string | null;
  description: string | null;
  price_lump_sum_cents: number | null;
  price_recurring_cents: number | null;
  recurring_count: number | null;
  featured_pricing: 'lump_sum' | 'recurring';
  period: string | null;
  classes_included: number | null;
  is_unlimited: boolean;
  validity_days: number | null;
  validity_unit: 'days' | 'months';
  deadline_date: string | null;
  is_validity_unlimited: boolean;
  is_unique: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  tenant_id: string;
  user_id: string;
  offer_id: string;
  start_date: string;
  end_date: string | null;
  is_validity_unlimited: boolean;
  credits_total: number | null;
  is_unlimited: boolean;
  price_cents: number;
  payment_status: PaymentStatus;
  comment: string | null;
  created_by_admin: boolean;
  created_at: string;
  updated_at: string | null;
  user_name: string;
  user_email: string;
  offer_code: string;
  offer_name: string;
  offer_period: string | null;
  offer_featured_pricing: 'lump_sum' | 'recurring' | null;
  offer_price_recurring_cents: number | null;
  offer_price_lump_sum_cents: number | null;
  offer_recurring_count: number | null;
  credits_used: number;
  balance: number | null;
  status: string;
  // Financial summary for installments
  received_cents: number;
  pending_cents: number;
  error_cents: number;
  // Snapshots contractuels
  offer_snap_name: string | null;
  offer_snap_description: string | null;
  offer_snap_validity_days: number | null;
  offer_snap_validity_unit: string | null;
  offer_snap_is_validity_unlimited: boolean;
}

export interface InstallmentItem {
  id: string;
  order_id: string;
  due_date: string;
  amount_cents: number;
  is_paid: boolean;
  is_error: boolean;
  marked_error_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AdminBookingItem {
  id: string;
  tenant_id: string;
  user_id: string;
  session_id: string;
  status: BookingStatus;
  credits_used: number;
  created_by_admin: boolean;
  cancellation_type: string | null;
  notes: string | null;
  created_at: string;
  cancelled_at: string | null;
  session_date: string;
  session_time: string;
  session_title: string;
  user_name: string;
  user_phone: string | null;
  instagram_handle: string | null;
  facebook_handle: string | null;
  has_pending_order: boolean;
}

export interface AdminEventRegistrationItem {
  id: string;
  tenant_id: string;
  user_id: string;
  event_id: string;
  status: EventRegistrationStatus;
  price_paid_cents: number;
  payment_status: PaymentStatus;
  created_by_admin: boolean;
  notes: string | null;
  created_at: string;
  cancelled_at: string | null;
  event_date: string;
  event_time: string;
  event_title: string;
  user_name: string;
  user_phone: string | null;
  instagram_handle: string | null;
  facebook_handle: string | null;
  has_pending_order: boolean;
}

export interface Booking {
  id: string;
  session_id: string;
  status: BookingStatus;
  credits_used: number;
  created_at: string;
  session?: Session;
}

export interface CreditAccount {
  balance: number;
  total_purchased: number;
  total_used: number;
}

// API Functions
export const api = {
  // Auth
  login: async (email: string, password: string, tenant_slug: string) => {
    const response = await apiClient.post('/api/auth/login', {
      email,
      password,
      tenant_slug,
    });
    return response.data;
  },

  register: async (userData: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    tenant_slug: string;
    phone?: string;
    docs_accepted?: boolean;
  }) => {
    const response = await apiClient.post('/api/auth/register', userData);
    return response.data;
  },

  forgotPassword: async (email: string, tenant_slug: string) => {
    const response = await apiClient.post('/api/auth/forgot-password', {
      email,
      tenant_slug,
    });
    return response.data;
  },

  resetPassword: async (token: string, new_password: string) => {
    const response = await apiClient.post('/api/auth/reset-password', {
      token,
      new_password,
    });
    return response.data;
  },

  // Users
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/api/users/me');
    return response.data;
  },

  updateCurrentUser: async (data: Partial<User> & { password?: string }): Promise<User> => {
    const response = await apiClient.patch('/api/users/me', data);
    return response.data;
  },


  // Admin - User Management
  getAdminUsers: async (params?: {
    search?: string;
    role?: string;
    is_active?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<User[]> => {
    const response = await apiClient.get('/api/admin/users', { params });
    return response.data;
  },

  getAdminUsersCount: async (params?: {
    search?: string;
    role?: string;
    is_active?: boolean;
  }): Promise<{ count: number }> => {
    const response = await apiClient.get('/api/admin/users/count', { params });
    return response.data;
  },

  getAdminUser: async (userId: string): Promise<User> => {
    const response = await apiClient.get(`/api/admin/users/${userId}`);
    return response.data;
  },

  updateAdminUser: async (userId: string, data: Partial<User>): Promise<User> => {
    const response = await apiClient.patch(`/api/admin/users/${userId}`, data);
    return response.data;
  },

  createAdminUser: async (data: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    role?: string;
    phone?: string;
    street?: string;
    zip_code?: string;
    city?: string;
    birth_date?: string;
    instagram_handle?: string;
    facebook_handle?: string;
  }): Promise<User> => {
    const response = await apiClient.post('/api/admin/users', data);
    return response.data;
  },

  deleteAdminUser: async (userId: string): Promise<void> => {
    await apiClient.delete(`/api/admin/users/${userId}`);
  },

  // Planning
  getSessions: async (filters?: {
    start_date?: string;
    end_date?: string;
    activity_type?: string;
    available_only?: boolean;
    status?: string;
  }): Promise<Session[]> => {
    const params: Record<string, any> = { ...filters };
    if (filters?.available_only !== undefined) params.available_only = String(filters.available_only);
    
    const response = await apiClient.get('/api/planning', { params });
    return response.data;
  },

  getSession: async (sessionId: string): Promise<Session> => {
    const response = await apiClient.get(`/api/planning/${sessionId}`);
    return response.data;
  },

  cancelSession: async (sessionId: string): Promise<Session> => {
    const response = await apiClient.post(`/api/planning/${sessionId}/cancel`);
    return response.data;
  },

  reactivateSession: async (sessionId: string): Promise<Session> => {
    const response = await apiClient.post(`/api/planning/${sessionId}/reactivate`);
    return response.data;
  },

  duplicateSessions: async (data: { source_start: string, source_end: string, target_start: string }): Promise<{ count: number }> => {
    const response = await apiClient.post('/api/planning/duplicate', data);
    return response.data;
  },

  // Bookings
  createBooking: async (sessionId: string, notes?: string): Promise<Booking> => {
    const response = await apiClient.post('/api/bookings', {
      session_id: sessionId,
      notes,
    });
    return response.data;
  },

  getMyBookings: async (): Promise<Booking[]> => {
    const response = await apiClient.get('/api/bookings');
    // Le backend renvoie [{ booking: ..., session: ... }]
    // On l'aplatit pour rester compatible avec la logique frontend existante
    return response.data.map((item: any) => ({
      ...item.booking,
      session: item.session
    }));
  },

  cancelBooking: async (bookingId: string) => {
    await apiClient.delete(`/api/bookings/${bookingId}`);
  },

  // Credits
  getCreditAccount: async (): Promise<CreditAccount> => {
    const response = await apiClient.get('/api/credits/account');
    return response.data;
  },

  purchaseCredits: async (offerId: string, provider: 'helloasso' | 'stripe'): Promise<{
    transaction_id: string;
    amount: number;
    payment_url: string;
    payment_id: string;
  }> => {
    const response = await apiClient.post('/api/credits/purchase', {
      offer_id: offerId,
      payment_provider: provider
    });
    return response.data;
  },

  createShopOrder: async (offerId: string, payLater: boolean, startDate?: string): Promise<{
    order: any;
    message: string;
    redirect_url: string | null;
  }> => {
    const response = await apiClient.post('/api/shop/checkout', {
      offer_id: offerId,
      pay_later: payLater,
      start_date: startDate
    });
    return response.data;
  },

  getMyOrders: async (): Promise<any[]> => {
    const response = await apiClient.get('/api/shop/orders');
    return response.data;
  },

  // Offers
  getOffers: async (includeInactive: boolean = false): Promise<any[]> => {
    const response = await apiClient.get(`/api/offers?include_inactive=${includeInactive}`);
    return response.data;
  },

  createOffer: async (offerData: {
    offer_code: string;
    name: string;
    description?: string | null;
    price_cents: number;
    period?: string | null;
    classes_included?: number | null;
    is_unlimited?: boolean;
    validity_days?: number | null;
    deadline_date?: string | null;
    is_unique?: boolean;
    is_active?: boolean;
    category?: string | null;
    display_order?: number;
  }) => {
    const response = await apiClient.post('/api/offers', offerData);
    return response.data;
  },

  updateOffer: async (offerId: string, offerData: Partial<{
    offer_code: string;
    name: string;
    description: string | null;
    price_cents: number;
    period: string | null;
    classes_included: number | null;
    is_unlimited: boolean;
    validity_days: number | null;
    deadline_date: string | null;
    is_unique: boolean;
    is_active: boolean;
    display_order: number;
  }>) => {
    const response = await apiClient.patch(`/api/offers/${offerId}`, offerData);
    return response.data;
  },

  deleteOffer: async (offerId: string) => {
    const response = await apiClient.delete(`/api/offers/${offerId}`);
    return response.data;
  },

  // Admin - Sessions
  createSession: async (sessionData: {
    title: string;
    activity_type?: string;
    description?: string;
    start_time: string;
    end_time: string;
    max_participants: number;
    credits_required: number;
  }) => {
    const response = await apiClient.post('/api/planning', sessionData);
    return response.data;
  },

  updateSession: async (sessionId: string, sessionData: Partial<Session>) => {
    const response = await apiClient.patch(`/api/planning/${sessionId}`, sessionData);
    return response.data;
  },

  deleteSession: async (sessionId: string) => {
    const response = await apiClient.delete(`/api/planning/${sessionId}`);
    return response.data;
  },

  // Tenant Settings (admin club)
  getTenantSettings: async (): Promise<Tenant> => {
    const response = await apiClient.get('/api/tenants/current');
    return response.data;
  },

  updateTenantSettings: async (data: Partial<{
    name: string;
    description: string;
    banner_url: string;
    logo_url: string;
    primary_color: string;
    welcome_message: string;
    cgv_url: string;
    rules_url: string;
    registration_limit_mins: number;
    cancellation_limit_mins: number;
    confirmation_email_body: string;
    allow_pay_later: boolean;
    payment_redirect_link: string;
    pay_now_instructions: string;
  }>) => {
    const response = await apiClient.patch('/api/tenants/current/settings', data);
    return response.data;
  },

  uploadBanner: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/api/uploads/banner', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  uploadLogo: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/api/uploads/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  uploadDocument: async (file: File, docType: 'cgv' | 'rules') => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`/api/uploads/document?doc_type=${docType}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getTenantBySlug: async (slug: string): Promise<Tenant> => {
    const response = await apiClient.get(`/api/tenants/by-slug/${slug}`);
    return response.data;
  },

  // Admin - Events
  getAdminEvents: async (): Promise<any[]> => {
    const response = await apiClient.get('/api/admin/events');
    return response.data;
  },

  createAdminEvent: async (data: {
    event_date: string;
    event_time: string;
    title: string;
    duration_minutes: number;
    price_member_cents: number;
    price_external_cents: number;
    instructor_name: string;
    max_places: number;
    description?: string | null;
  }) => {
    const response = await apiClient.post('/api/admin/events', data);
    return response.data;
  },

  updateAdminEvent: async (eventId: string, data: Record<string, any>) => {
    const response = await apiClient.patch(`/api/admin/events/${eventId}`, data);
    return response.data;
  },

  deleteAdminEvent: async (eventId: string) => {
    const response = await apiClient.delete(`/api/admin/events/${eventId}`);
    return response.data;
  },

  exportAdminEvents: async () => {
    const response = await apiClient.get('/api/admin/events/export', {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'evenements.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Admin - Agenda
  getAdminAgenda: async (start: string, end: string, search?: string): Promise<{ sessions: any[]; events: any[] }> => {
    const params: Record<string, string> = { start, end };
    if (search) params.search = search;
    const response = await apiClient.get('/api/admin/agenda', { params });
    return response.data;
  },

  // ==================== Admin Orders ====================
  getAdminOrders: async (): Promise<OrderItem[]> => {
    const response = await apiClient.get('/api/admin/orders');
    return response.data;
  },
  getAdminOrderStatuses: async (): Promise<string[]> => {
    const response = await apiClient.get('/api/admin/orders/statuses');
    return response.data;
  },

  createAdminOrder: async (data: { user_id: string; offer_id: string; start_date: string; comment?: string }) => {
    const response = await apiClient.post('/api/admin/orders', data);
    return response.data;
  },

  updateAdminOrder: async (orderId: string, data: any) => {
    const response = await apiClient.patch(`/api/admin/orders/${orderId}`, data);
    return response.data;
  },

  deleteAdminOrder: async (orderId: string) => {
    await apiClient.delete(`/api/admin/orders/${orderId}`);
  },

  // Installments
  getInstallments: async (orderId: string): Promise<InstallmentItem[]> => {
    const response = await apiClient.get(`/api/admin/orders/${orderId}/installments`);
    return response.data;
  },

  markInstallmentError: async (orderId: string, installmentId: string) => {
    const response = await apiClient.patch(`/api/admin/orders/${orderId}/installments/${installmentId}/error`);
    return response.data;
  },

  resolveInstallment: async (orderId: string, installmentId: string) => {
    const response = await apiClient.patch(`/api/admin/orders/${orderId}/installments/${installmentId}/resolve`);
    return response.data;
  },
  payInstallment: async (orderId: string, installmentId: string) => {
    const response = await apiClient.patch(`/api/admin/orders/${orderId}/installments/${installmentId}/pay`);
    return response.data;
  },

  // User suspension
  toggleSuspendUser: async (userId: string) => {
    const response = await apiClient.patch(`/api/admin/orders/users/${userId}/suspend`);
    return response.data;
  },

  // ==================== Admin Bookings ====================
  getAdminSessions: async (): Promise<any[]> => {
    const response = await apiClient.get('/api/admin/bookings/sessions');
    return response.data;
  },

  getAdminBookings: async (filters?: string | { status?: string, session_id?: string }): Promise<AdminBookingItem[]> => {
    const params: Record<string, string> = {};
    if (typeof filters === 'string') {
      params.status = filters;
    } else if (filters) {
      if (filters.status) params.status = filters.status;
      if (filters.session_id) params.session_id = filters.session_id;
    }
    const response = await apiClient.get('/api/admin/bookings', { params });
    return response.data;
  },

  createAdminBooking: async (data: { user_id: string; session_id: string; notes?: string }) => {
    const response = await apiClient.post('/api/admin/bookings', data);
    return response.data;
  },

  updateAdminBooking: async (bookingId: string, data: any) => {
    const response = await apiClient.patch(`/api/admin/bookings/${bookingId}`, data);
    return response.data;
  },

  deleteAdminBooking: async (bookingId: string) => {
    await apiClient.delete(`/api/admin/bookings/${bookingId}`);
  },

  // ==================== Admin Event Registrations ====================
  getAdminEventRegistrations: async (filters?: { status?: string, payment?: string, event_id?: string }): Promise<AdminEventRegistrationItem[]> => {
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.payment) params.payment = filters.payment;
    if (filters?.event_id) params.event_id = filters.event_id;
    const response = await apiClient.get('/api/admin/event-registrations', { params });
    return response.data;
  },

  getAdminEventsForRegistrations: async (): Promise<any[]> => {
    const response = await apiClient.get('/api/admin/event-registrations/events');
    return response.data;
  },

  createAdminEventRegistration: async (data: {
    user_id: string;
    event_id: string;
    price_paid_cents: number;
    payment_status?: string;
    notes?: string;
  }) => {
    const response = await apiClient.post('/api/admin/event-registrations', data);
    return response.data;
  },

  updateAdminEventRegistration: async (registrationId: string, data: any) => {
    const response = await apiClient.patch(`/api/admin/event-registrations/${registrationId}`, data);
    return response.data;
  },

  deleteAdminEventRegistration: async (registrationId: string) => {
    await apiClient.delete(`/api/admin/event-registrations/${registrationId}`);
  },

  // ==================== Admin Emails ====================
  sendAdminEmail: async (data: { subject: string; content: string; recipient_type: string; selected_user_ids?: string[] }): Promise<{ message: string; count: number }> => {
    const response = await apiClient.post('/api/admin/emails/send', data);
    return response.data;
  },

  uploadImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/api/uploads/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Events (Member)
  getUpcomingEvents: async (): Promise<Event[]> => {
    const response = await apiClient.get('/api/events/upcoming');
    return response.data;
  },

  getEvent: async (eventId: string): Promise<Event> => {
    const response = await apiClient.get(`/api/events/${eventId}`);
    return response.data;
  },

  checkoutEvent: async (eventId: string, tariff: 'member' | 'external', payLater: boolean = false): Promise<{
    registration_id: string;
    message: string;
    price_cents: number;
  }> => {
    const response = await apiClient.post(`/api/events/${eventId}/checkout?tariff=${tariff}&pay_later=${payLater}`);
    return response.data;
  },
};
