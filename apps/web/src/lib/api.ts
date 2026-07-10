/**
 * Client API pour communiquer avec le backend FastAPI
 */
import axios, { AxiosInstance, AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

import { UserRole, PaymentStatus, BookingStatus, EventRegistrationStatus } from '../types/enums';
import toast from 'react-hot-toast';

// Instance Axios configurée
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function getTenantSlug(): string {
  if (typeof window === 'undefined') return '';
  
  // 1. Extraction depuis le sous-domaine (ex: mon-club.rezea.com)
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  if (parts.length > 2 && parts[0] !== 'www' && parts[0] !== 'sysadmin') {
    return parts[0];
  }
  
  // 2. Extraction depuis les paramètres d'URL (?club=mon-club)
  const searchParams = new URLSearchParams(window.location.search);
  const querySlug = searchParams.get('club');
  if (querySlug) return querySlug;

  // 3. Fallback sur le localStorage
  const storedSlug = localStorage.getItem('tenant_slug');
  if (storedSlug) return storedSlug;
  
  // 4. Fallback sur le premier segment d'URL (compatibilité dev local)
  const segments = window.location.pathname.split('/');
  const pathSlug = segments[1];
  const reservedPaths = ['login', 'register', 'sysadmin', 'dashboard', 'reset-password', 'forgot-password', 'planning', 'bookings', 'admin', 'home', 'credits', 'profile', 'orders', 'feedback', 'contacts', 'gestion-inscriptions'];
  if (pathSlug && !reservedPaths.includes(pathSlug)) {
    return pathSlug;
  }
  
  return '';
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem("access_token");
  localStorage.removeItem("sysadmin_token");
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_role");
  localStorage.removeItem("default_view");
  localStorage.removeItem("seenAlerts");
  window.location.href = "/login";
}

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

      // Injection automatique du X-Tenant-Slug
      const slug = getTenantSlug();
      if (slug) {
        config.headers['X-Tenant-Slug'] = slug;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercepteur pour gérer les erreurs
// IMPORTANT : Ne redirige vers la racine QUE si le serveur a explicitement
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
      if (typeof window !== 'undefined') {
        toast.error('Erreur réseau : Impossible de contacter le serveur.');
      }
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

        // Pour les pages normales, rediriger vers le portail du club si possible
        localStorage.removeItem('access_token');

        const segments = window.location.pathname.split('/');
        const currentSlug = segments[1];
        const reservedPaths = ['login', 'register', 'sysadmin', 'dashboard', 'reset-password', 'forgot-password'];

        window.location.href = '/login';
      }
    }

    // 500+ = Erreur serveur. On ne touche pas au token.
    if (status >= 500) {
      console.error(`[API] Erreur serveur ${status} sur ${url}`);
      if (typeof window !== 'undefined') {
        toast.error('Une erreur interne est survenue sur le serveur.');
      }
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
  is_active_override: boolean;
  created_by_admin?: boolean;
  is_active_member?: boolean;
  email_verified?: boolean;
  balance?: number;
  has_unlimited_credits?: boolean;
  created_at?: string;
  last_login?: string;
  past_bookings_count?: number;
  is_blacklisted?: boolean;
  is_suspended?: boolean;
  is_archived?: boolean;
  status_override?: string | null;
  blacklist_reason?: string;
  remind_before_session?: boolean;
  receive_marketing_emails?: boolean;
  segment?: string;
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
  location?: string;
  waitlist_count?: number;
  waitlist_users?: { first_name: string; last_name: string; email: string }[];
  deleted_at?: string | null;
}

export interface EventRegistration {
  id: string;
  tenant_id: string;
  user_id: string;
  event_id: string;
  status: string;
  price_paid_cents: number;
  payment_status: string;
  created_at: string;
  event_title?: string;
  event_date?: string;
  event_time?: string;
  user_name?: string;
  has_pending_order?: boolean;
  instructor_name?: string;
}

// Finance
export interface FinanceCategory {
  id: string;
  tenant_id: string;
  name: string;
  type?: "income" | "expense";
  color?: string;
  default_vat_rate: number;
  is_default: boolean;
}

export interface FinanceTransaction {
  id: string;
  tenant_id: string;
  date: string;
  type: "income" | "expense";
  category_id?: string;
  category_name?: string;
  amount_cents: number;
  vat_amount_cents: number;
  vat_rate: number;
  description: string;
  payment_method: string;
  order_id?: string;
  registration_id?: string;
  is_reconciled: boolean;
  receipt_url?: string;
  account_id?: string;
  account_name?: string;
  event_group_id?: string;
  event_group_title?: string;
  created_at: string;
}

export interface FinanceAccount {
  id: string;
  tenant_id: string;
  name: string;
  type?: string;
  color?: string;
  is_default: boolean;
  created_at: string;
}

export interface FinanceDashboard {
  total_income_cents: number;
  total_expense_cents: number;
  net_balance_cents: number;
  month_pending_cents: number;
  month_error_cents: number;
  month_refund_cents: number;
  income_by_category: Array<{category: string, amount: number, color: string}>;
  expense_by_category: Array<{category: string, amount: number, color: string}>;
  income_by_offer: Array<{rubrique: string, offer_name: string, amount: number}>;
  recent_transactions: FinanceTransaction[];
  monthly_trend: Array<{month: string, income: number, expense: number}>;
  projected_income_cents: number;
  overdue_income_cents: number;
  projected_trend: Array<{month: string, amount: number}>;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  created_at: string;
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
  registration_status?: string;
  location?: string;
  allow_waitlist: boolean;
  payment_link?: string | null;
  event_group?: {
    id: string;
    title: string;
    payment_link?: string | null;
  } | null;
  waitlist_count?: number;
  waitlist_users?: { first_name: string; last_name: string; email: string }[];
  created_at?: string;
  updated_at?: string;
}

export interface Vignette {
  id: string;
  image_url: string;
  title?: string;
  link_url?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  description?: string;
  email?: string;
  logo_url?: string;
  banner_url?: string;
  slogan?: string;
  primary_color: string;
  login_primary_color?: string;
  login_background_url?: string;
  login_description?: string;
  welcome_message?: string;
  website_url?: string;
  facebook_url?: string;
  instagram_url?: string;
  cgv_url?: string;
  rules_url?: string;
  legal_name?: string;
  legal_form?: string;
  legal_address?: string;
  legal_siret?: string;
  legal_vat_number?: string;
  legal_vat_mention?: string;
  registration_limit_mins: number;
  cancellation_limit_mins: number;
  grace_period_days?: number;
  grace_period_mode?: string;
  confirmation_email_body?: string;
  allow_pay_later_offers: boolean;
  allow_pay_later_events: boolean;
  payment_redirect_link?: string;
  pay_now_instructions?: string;
  locations?: string[];
  activity_types?: string[];
  is_active: boolean;
  max_users: number;
  max_sessions_per_day: number;
  show_logo?: boolean;
  show_name?: boolean;
  show_slogan?: boolean;
  user_header_show_logo?: boolean;
  user_header_show_name?: boolean;
  enable_review_prompts: boolean;
  google_review_url?: string;
  review_prompt_threshold: number;
  created_at: string;
  
  user_home_layout?: string;
  header_title?: string;
  header_subtitle?: string;
  header_text_color?: string;
  header_text_bg?: string;
  header_text_pos_y?: string;
  header_text_pos_x?: string;
  header_text_animation?: string;
  vignettes?: Vignette[];
  vignettes_title?: string;

  // Configuration de paiement
  stripe_publishable_key?: string;
  stripe_secret_key?: string;
  helloasso_client_id?: string;
  helloasso_client_secret?: string;
  helloasso_organization_slug?: string;
  helloasso_webhook_secret?: string;
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
  validity_unit: 'days' | 'weeks' | 'months';
  deadline_date: string | null;
  is_validity_unlimited: boolean;
  is_unique: boolean;
  is_active: boolean;
  display_order: number;
  category_display_order?: number;
  engagement_type?: 'essai' | 'regulier' | 'ponctuel';
  allowed_activities?: string[];
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
  user_note: string | null;
  created_by_admin: boolean;
  created_at: string;
  updated_at: string | null;
  user_name: string;
  user_email: string;
  user_is_suspended?: boolean;
  user_street?: string;
  user_zip_code?: string;
  user_city?: string;
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
  allowed_activities?: string[];
  invoice_number?: string | null;
  is_blocked?: boolean | null;
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
  session_location: string;
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
  user_name: string;
  notes: string | null;
  user_note: string | null;
  created_at: string;
  cancelled_at: string | null;
  event_date: string;
  event_time: string;
  event_title: string;
  event_parent_title?: string | null;
  event_location?: string | null;
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
  balances_by_activity?: Record<string, number | null>;
  frozen_balance?: number;
  frozen_by_activity?: Record<string, number>;
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
    street?: string;
    zip_code?: string;
    city?: string;
    birth_date?: string;
    instagram_handle?: string;
    facebook_handle?: string;
    remind_before_session?: boolean;
    receive_marketing_emails?: boolean;
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
    include_deleted?: boolean;
  }): Promise<Session[]> => {
    const params: Record<string, any> = { ...filters };
    if (filters?.available_only !== undefined) params.available_only = String(filters.available_only);
    if (filters?.include_deleted !== undefined) params.include_deleted = String(filters.include_deleted);

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

  reactivateSession: async (sessionId: string): Promise<any> => {
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

  createShopOrder: async (offerId: string, payLater: boolean, startDate?: string, pricingType: 'lump_sum' | 'recurring' = 'lump_sum'): Promise<{
    order: any;
    message: string;
    redirect_url: string | null;
  }> => {
    const response = await apiClient.post('/api/shop/checkout', {
      offer_id: offerId,
      pay_later: payLater,
      start_date: startDate,
      pricing_type: pricingType
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
    price_lump_sum_cents?: number | null;
    price_recurring_cents?: number | null;
    recurring_count?: number | null;
    featured_pricing: 'lump_sum' | 'recurring';
    period?: string | null;
    classes_included?: number | null;
    is_unlimited?: boolean;
    validity_days?: number | null;
    validity_unit?: 'days' | 'months';
    deadline_date?: string | null;
    is_validity_unlimited?: boolean;
    is_unique?: boolean;
    is_active?: boolean;
    category?: string | null;
    display_order?: number;
    category_display_order?: number;
  }) => {
    const response = await apiClient.post('/api/offers', offerData);
    return response.data;
  },

  updateOffer: async (offerId: string, offerData: Partial<{
    offer_code: string;
    name: string;
    description: string | null;
    price_lump_sum_cents: number | null;
    price_recurring_cents: number | null;
    recurring_count: number | null;
    featured_pricing: 'lump_sum' | 'recurring';
    period: string | null;
    classes_included: number | null;
    is_unlimited: boolean;
    validity_days: number | null;
    validity_unit: 'days' | 'weeks' | 'months';
    deadline_date: string | null;
    is_validity_unlimited: boolean;
    is_unique: boolean;
    is_active: boolean;
    category: string | null;
    display_order: number;
    category_display_order: number;
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
    instructor_name?: string;
    location?: string;
    allow_waitlist?: boolean;
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
    legal_name: string;
    legal_form: string;
    legal_address: string;
    legal_siret: string;
    legal_vat_number: string;
    legal_vat_mention: string;
    registration_limit_mins: number;
    cancellation_limit_mins: number;
    grace_period_days?: number;
    grace_period_mode?: string;
    confirmation_email_body: string;
    allow_pay_later_offers: boolean;
    allow_pay_later_events: boolean;
    payment_redirect_link: string;
    pay_now_instructions: string;
    locations: string[];
    show_logo?: boolean;
    show_name?: boolean;
    show_slogan?: boolean;
    enable_review_prompts?: boolean;
    google_review_url?: string;
    review_prompt_threshold?: number;
  }>) => {
    const response = await apiClient.patch('/api/tenants/current/settings', data);
    return response.data;
  },

  verifyPaymentSettings: async (data: {
    provider: 'stripe' | 'helloasso';
    stripe_publishable_key?: string;
    stripe_secret_key?: string;
    helloasso_client_id?: string;
    helloasso_client_secret?: string;
    helloasso_organization_slug?: string;
  }): Promise<{ status: string; message: string }> => {
    const response = await apiClient.post('/api/tenants/current/settings/payment/verify', data);
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

  searchTenants: async (query: string): Promise<Tenant[]> => {
    const response = await apiClient.get(`/api/tenants/search`, {
      params: { q: query }
    });
    return response.data;
  },

  uploadLoginBackground: async (file: File): Promise<{ login_background_url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/api/uploads/login-bg', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getAdminEvents: async (params?: { include_inactive?: boolean, include_deleted?: boolean }): Promise<any[]> => {
    const response = await apiClient.get('/api/admin/events', { params });
    return response.data;
  },
  getAdminEventGroups: async (): Promise<any[]> => {
    const response = await apiClient.get('/api/admin/events/groups');
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
    location?: string | null;
    description?: string | null;
    allow_waitlist?: boolean;
    payment_link?: string | null;
  }) => {
    const response = await apiClient.post('/api/admin/events', data);
    return response.data;
  },

  createAdminEventBulk: async (data: {
    group_title: string;
    payment_link?: string | null;
    modules: Array<{
      event_date: string;
      event_time: string;
      title: string;
      duration_minutes: number;
      price_member_cents: number;
      price_external_cents: number;
      instructor_name: string;
      max_places: number;
      location?: string | null;
      description?: string | null;
      allow_waitlist?: boolean;
    }>;
  }) => {
    const response = await apiClient.post('/api/admin/events/bulk', data);
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

  // Finance / Treasury
  getFinanceCategories: async (): Promise<FinanceCategory[]> => {
    const response = await apiClient.get('/api/admin/finance/categories');
    return response.data;
  },
  createFinanceCategory: async (data: any): Promise<FinanceCategory> => {
    const response = await apiClient.post('/api/admin/finance/categories', data);
    return response.data;
  },
  updateFinanceCategory: async (id: string, data: any): Promise<FinanceCategory> => {
    const response = await apiClient.patch(`/api/admin/finance/categories/${id}`, data);
    return response.data;
  },
  deleteFinanceCategory: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/admin/finance/categories/${id}`);
  },
  seedFinanceCategories: async (): Promise<void> => {
    await apiClient.post('/api/admin/finance/categories/seed');
  },

  // Finance Accounts
  getFinanceAccounts: async (): Promise<FinanceAccount[]> => {
    const response = await apiClient.get('/api/admin/finance/accounts');
    return response.data;
  },
  createFinanceAccount: async (data: any): Promise<FinanceAccount> => {
    const response = await apiClient.post('/api/admin/finance/accounts', data);
    return response.data;
  },
  updateFinanceAccount: async (id: string, data: any): Promise<FinanceAccount> => {
    const response = await apiClient.patch(`/api/admin/finance/accounts/${id}`, data);
    return response.data;
  },
  deleteFinanceAccount: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/admin/finance/accounts/${id}`);
  },

  getFinanceTransactions: async (params?: { start_date?: string, end_date?: string, type?: string, category_id?: string, search?: string, show_future?: boolean }): Promise<FinanceTransaction[]> => {
    const response = await apiClient.get('/api/admin/finance/transactions', { params });
    return response.data;
  },
  createFinanceTransaction: async (data: any): Promise<FinanceTransaction> => {
    const response = await apiClient.post('/api/admin/finance/transactions', data);
    return response.data;
  },
  updateFinanceTransaction: async (id: string, data: any): Promise<FinanceTransaction> => {
    const response = await apiClient.patch(`/api/admin/finance/transactions/${id}`, data);
    return response.data;
  },
  deleteFinanceTransaction: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/admin/finance/transactions/${id}`);
  },
  getFinanceDashboard: async (month?: string, days: number = 30): Promise<FinanceDashboard> => {
    const params: any = { days };
    if (month) params.month = month;
    const response = await apiClient.get('/api/admin/finance/dashboard', { params });
    return response.data;
  },

  cancelAdminEvent: async (eventId: string) => {
    const response = await apiClient.post(`/api/admin/events/${eventId}/cancel`);
    return response.data;
  },

  reactivateAdminEvent: async (eventId: string) => {
    const response = await apiClient.post(`/api/admin/events/${eventId}/reactivate`);
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

  exportFinanceJournal: async (params?: { start_date?: string, end_date?: string, type?: string, category_id?: string, search?: string, show_future?: boolean }) => {
    const response = await apiClient.get('/api/admin/finance/transactions/export', {
      params,
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'journal_de_caisse.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  exportFinanceCompta: async (params: { start_date?: string, end_date?: string }) => {
    const response = await apiClient.get('/api/admin/finance/export-compta', {
      params,
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `export_compta_${params.start_date || 'debut'}_${params.end_date || 'fin'}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  resetFinanceExport: async (params: { start_date: string, end_date: string }) => {
    const response = await apiClient.post('/api/admin/finance/reset-export', null, { params });
    return response.data;
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

  createAdminOrder: async (data: { user_id: string; offer_id: string; start_date: string; comment?: string; user_note?: string }) => {
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
  resetInstallment: async (orderId: string, installmentId: string) => {
    const response = await apiClient.patch(`/api/admin/orders/${orderId}/installments/${installmentId}/reset`);
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

  getAdminBookings: async (filters?: string | { status?: string, session_id?: string, include_deleted?: boolean }): Promise<AdminBookingItem[]> => {
    const params: Record<string, string> = {};
    if (typeof filters === 'string') {
      params.status = filters;
    } else if (filters) {
      if (filters.status) params.status = filters.status;
      if (filters.session_id) params.session_id = filters.session_id;
      if (filters.include_deleted !== undefined) params.include_deleted = String(filters.include_deleted);
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
  getAdminEventRegistrations: async (filters?: { status?: string, payment?: string, event_id?: string, include_deleted?: boolean }): Promise<AdminEventRegistrationItem[]> => {
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.payment) params.payment = filters.payment;
    if (filters?.event_id) params.event_id = filters.event_id;
    if (filters?.include_deleted !== undefined) params.include_deleted = String(filters.include_deleted);
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
    user_note?: string;
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
  sendAdminEmail: async (data: { 
    subject: string; 
    content: string; 
    recipient_type: string; 
    selected_user_ids?: string[]; 
    segment?: string; 
    force_operational?: boolean; 
    custom_color?: string;
    custom_image_url?: string;
    campaign_type?: string;
  }): Promise<{ message: string; count: number }> => {
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

  getMyEventRegistrations: async (): Promise<EventRegistration[]> => {
    const response = await apiClient.get('/api/events/registrations');
    return response.data;
  },

  // Email Templates
  getEmailTemplates: async (): Promise<EmailTemplate[]> => {
    const response = await apiClient.get('/api/admin/emails/templates');
    return response.data;
  },

  saveEmailTemplate: async (data: { name: string; subject: string; content: string }): Promise<EmailTemplate> => {
    const response = await apiClient.post('/api/admin/emails/templates', data);
    return response.data;
  },

  deleteEmailTemplate: async (templateId: string): Promise<void> => {
    await apiClient.delete(`/api/admin/emails/templates/${templateId}`);
  },

  // ==================== Satisfaction Surveys & Segmentation ====================
  getSegmentsStats: async (): Promise<{
    prospect: number;
    decouverte_1: number;
    decouverte_2: number;
    post_essai: number;
    actif: number;
    occasionnel: number;
    distant: number;
    inactif: number;
    archive: number;
  }> => {
    const response = await apiClient.get('/api/admin/users/segments/stats');
    return response.data;
  },

  getSurveyCampaigns: async (): Promise<any[]> => {
    const response = await apiClient.get('/api/admin/surveys/campaigns');
    return response.data;
  },

  createSurveyCampaign: async (data: {
    title: string;
    description?: string;
    survey_type: 'general' | 'event';
    event_id?: string;
    session_id?: string;
    target_segment?: string;
  }): Promise<any> => {
    const response = await apiClient.post('/api/admin/surveys/campaigns', data);
    return response.data;
  },

  getSurveyCampaignDetails: async (campaignId: string): Promise<any> => {
    const response = await apiClient.get(`/api/admin/surveys/campaigns/${campaignId}`);
    return response.data;
  },

  sendSurveyCampaignEmails: async (campaignId: string): Promise<{ message: string; count: number }> => {
    const response = await apiClient.post(`/api/admin/surveys/campaigns/${campaignId}/send`);
    return response.data;
  },

  deleteSurveyCampaign: async (campaignId: string): Promise<void> => {
    await apiClient.delete(`/api/admin/surveys/campaigns/${campaignId}`);
  },

  getPublicFeedback: async (token: string): Promise<{
    id: string;
    campaign_title: string;
    campaign_description?: string | null;
    tenant_name?: string | null;
    rating: number | null;
    comment: string | null;
  }> => {
    const response = await apiClient.get(`/api/public/feedback/${token}`);
    return response.data;
  },

  submitPublicFeedback: async (token: string, data: { rating: number; comment?: string }): Promise<{ detail: string }> => {
    const response = await apiClient.post(`/api/public/feedback/${token}`, data);
    return response.data;
  },

  // ── Staff Notes ──────────────────────────────────────────────────────────

  /** Crée ou met à jour la note d'une séance/event (upsert). Remet is_resolved=false si modifiée. */
  upsertStaffNote: async (data: {
    message: string;
    entity_type: 'session' | 'event' | 'general';
    entity_id?: string | null;
    entity_label?: string | null;
  }): Promise<StaffNoteItem> => {
    const response = await apiClient.post('/api/staff-notes', data);
    return response.data;
  },

  /** Liste les notes (inbox manager). includeResolved=true pour toutes les notes y compris traitées */
  getAdminStaffNotes: async (includeResolved = false): Promise<StaffNoteItem[]> => {
    const response = await apiClient.get('/api/staff-notes/admin', {
      params: { include_resolved: includeResolved },
    });
    return response.data;
  },

  /** Retourne un Set des entity_id ayant un post-it (résolu ou non) — pour les icônes de table */
  getAllStaffNoteEntityIds: async (entityType: 'session' | 'event'): Promise<Set<string>> => {
    const response = await apiClient.get('/api/staff-notes/admin', {
      params: { include_resolved: true },
    });
    const notes: StaffNoteItem[] = response.data;
    return new Set(
      notes
        .filter(n => n.entity_type === entityType && n.entity_id)
        .map(n => n.entity_id as string)
    );
  },

  /** Retourne la note liée à une séance/event (traitée ou non), ou null */
  getEntityStaffNote: async (entityId: string): Promise<StaffNoteItem | null> => {
    const response = await apiClient.get(`/api/staff-notes/entity/${entityId}`);
    return response.data;
  },

  /** Marque une note comme traitée → disparaît de l'inbox */
  resolveStaffNote: async (noteId: string): Promise<StaffNoteItem> => {
    const response = await apiClient.patch(`/api/staff-notes/admin/${noteId}/resolve`);
    return response.data;
  },
};

// ── Staff Note type ───────────────────────────────────────────────────────
export interface StaffNoteItem {
  id: string;
  tenant_id: string;
  author_id: string;
  author_name: string;
  message: string;
  entity_type: 'session' | 'event' | 'general';
  entity_id: string | null;
  entity_label: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string | null;
}
