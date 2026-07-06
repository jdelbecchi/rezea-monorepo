"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, User, CreditAccount, Tenant, Booking, Event, OrderItem, EventRegistration, Vignette } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import ConfirmModal from "@/components/ConfirmModal";
import { formatCredits } from "@/lib/formatters";
import { PaymentStatus } from "@/types/enums";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function DashboardPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const slug = params.slug;
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<CreditAccount | null>(null);
  const [tenantSettings, setTenantSettings] = useState<Tenant | null>(null);
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [myOrders, setMyOrders] = useState<OrderItem[]>([]);
  const [myEventRegistrations, setMyEventRegistrations] = useState<EventRegistration[]>([]);
  const [isAlertsExpanded, setIsAlertsExpanded] = useState(false);
  const [showCreditDetails, setShowCreditDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const basePath = "";
  
  // Espace Client - PWA Home

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Charger l'utilisateur en priorité (critique pour l'auth)
        const userData = await api.getCurrentUser();
        setUser(userData);

        // 2. Charger le reste des données en parallèle (non critique)
        const loadSecondaryData = async () => {
          try {
            const [creditData, tenantData, bookingsData, eventsData, ordersData, eventRegsData] = await Promise.all([
              api.getCreditAccount().catch(e => { console.error("Crédits non chargés", e); return null; }),
              api.getTenantSettings().catch(e => { console.error("Paramètres non chargés", e); return null; }),
              api.getMyBookings().catch(e => { console.error("Réservations non chargées", e); return []; }),
              api.getUpcomingEvents().catch(e => { console.error("Événements non chargés", e); return []; }),
              api.getMyOrders().catch(e => { console.error("Commandes non chargées", e); return []; }),
              api.getMyEventRegistrations().catch(e => { console.error("Inscriptions événements non chargées", e); return []; }),
            ]);
            
            if (creditData) setCredits(creditData);
            if (tenantData) setTenantSettings(tenantData);
            setMyBookings(bookingsData);
            setUpcomingEvents(eventsData);
            setMyOrders(ordersData);
            setMyEventRegistrations(eventRegsData);
          } catch (secondaryErr) {
            console.warn("Certaines données n'ont pu être chargées:", secondaryErr);
          }
        };

        await loadSecondaryData();
      } catch (err) {
        console.error("Échec de l'authentification:", err);
        // On ne redirige QUE si le chargement du profil utilisateur a échoué
        router.push("/");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router]);

  // Logic: Find next RDV
  const nextRDV = useMemo(() => {
    const now = new Date();
    
    // 1. Next Session Booking
    const futureBookings = myBookings
      .filter((b: any) => b.status !== 'cancelled' && b.session)
      .map((b: any) => ({
        title: b.session.title,
        date: new Date(b.session.start_time),
      }))
      .filter(b => b.date > now);

    // 2. Registered Events
    const registeredEvents = upcomingEvents
      .filter(e => e.is_registered)
      .map(e => {
        // Parse "YYYY-MM-DD" and "HH:mm"
        const [year, month, day] = e.event_date.split('-').map(Number);
        const [hour, min] = e.event_time.split(':').map(Number);
        return {
          title: e.title,
          date: new Date(year, month - 1, day, hour, min)
        };
      })
      .filter(e => e.date > now);

    const all = [...futureBookings, ...registeredEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
    return all[0] || null;
  }, [myBookings, upcomingEvents]);

  // Logic: Unified Alert Center
  const allAlerts = useMemo(() => {
    const alerts: { id: string; message: string; iconType: string; priority: number }[] = [];
    const now = new Date();

    // 1. Alerte (Priority 1 - High) - Payment Failed
    myOrders.filter(o => o.payment_status === PaymentStatus.A_REGULARISER).forEach(o => {
      alerts.push({
        id: `issue-${o.id}`,
        message: `Action requise : paiement à régulariser pour votre "${o.offer_name}"`,
        iconType: "error",
        priority: 1
      });
    });

    // 2. Rappel (Priority 2 - Warning) - Pending Payments
    // - Pending Orders (only EN_ATTENTE)
    myOrders.filter(o => o.payment_status === PaymentStatus.EN_ATTENTE).forEach(o => {
      alerts.push({
        id: `pending-order-${o.id}`,
        message: `Pensez à finaliser le réglement de votre "${o.offer_name}"`,
        iconType: "warning",
        priority: 2
      });
    });
    // - Pending Event Registrations (only EN_ATTENTE)
    myEventRegistrations.filter(r => r.payment_status === PaymentStatus.EN_ATTENTE).forEach(r => {
      alerts.push({
        id: `pending-event-${r.id}`,
        message: `Pensez à finaliser le réglement de votre "${r.event_title}"`,
        iconType: "warning",
        priority: 2
      });
    });

    // 3. Information (Priority 3 - Info) - Expiry
    const threshold = new Date();
    threshold.setDate(now.getDate() + 30);
    myOrders.filter(o => {
      if (!o.end_date || o.status !== 'active') return false;
      const expiry = new Date(o.end_date);
      const expiryEndDay = new Date(expiry);
      expiryEndDay.setHours(23, 59, 59, 999);
      return expiryEndDay >= now && expiry <= threshold;
    }).forEach(o => {
      alerts.push({
        id: `expiry-${o.id}`,
        message: `Votre "${o.offer_name}" se termine le ${new Date(o.end_date!).toLocaleDateString('fr-FR')}`,
        iconType: "info",
        priority: 3
      });
    });

    // Sort by priority then by creation date
    return alerts.sort((a, b) => a.priority - b.priority);
  }, [myOrders, myEventRegistrations]);

  // Logic: One-time popup for new alerts
  const [showNewAlertsPopup, setShowNewAlertsPopup] = useState(false);
  const [newAlertsForPopup, setNewAlertsForPopup] = useState<any[]>([]);

  useEffect(() => {
    if (allAlerts.length > 0) {
      const seenAlerts = JSON.parse(localStorage.getItem('seenAlerts') || '[]');
      const newAlerts = allAlerts.filter(alert => !seenAlerts.includes(alert.id));
      
      if (newAlerts.length > 0) {
        setNewAlertsForPopup(newAlerts);
        setShowNewAlertsPopup(true);
      }
    }
  }, [allAlerts]);

  const markAlertsAsSeen = () => {
    const seenAlerts = JSON.parse(localStorage.getItem('seenAlerts') || '[]');
    const allIds = Array.from(new Set([...seenAlerts, ...allAlerts.map(a => a.id)]));
    localStorage.setItem('seenAlerts', JSON.stringify(allIds));
    setShowNewAlertsPopup(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("tenant_id");
    localStorage.removeItem("tenant_slug");
    localStorage.removeItem("default_view");
    localStorage.removeItem("user_role");
    localStorage.removeItem("seenAlerts");
    router.push("/");
  };

  const isAdminOrStaff = user?.role === "owner" || user?.role === "manager" || user?.role === "staff";
  const primaryColor = tenantSettings?.primary_color || "#2563eb";
  const bannerUrl = tenantSettings?.banner_url ? `${API_URL}${tenantSettings.banner_url}` : null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[100]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-300 mb-4"></div>
        <p className="text-slate-400 text-xs font-medium animate-pulse">Chargement...</p>
      </div>
    );
  }


  // --- VIEW: PWA HOME (Default for everyone) ---
  const showLogo = tenantSettings?.user_header_show_logo !== false;
  const showName = tenantSettings?.user_header_show_name !== false;
  const isLogoOnly = showLogo && !showName;

  // Personnalisation de l'accueil utilisateur
  const layout = tenantSettings?.user_home_layout || "both";
  const showHeader = layout === "both" || layout === "header";
  const showVignettes = layout === "both" || layout === "vignettes";
  const hasVisuals = showHeader || (showVignettes && !!tenantSettings?.vignettes?.length);

  const posY = tenantSettings?.header_text_pos_y || "center";
  const posX = tenantSettings?.header_text_pos_x || "center";
  const alignY = posY === "top" ? "justify-start" : posY === "bottom" ? "justify-end" : "justify-center";
  const alignX = posX === "left" ? "items-start text-left" : posX === "right" ? "items-end text-right" : "items-center text-center";
  const animation = tenantSettings?.header_text_animation || "none";

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center overflow-x-hidden safe-top md:pb-0">
      
      {/* Main Responsive Container: Max width on Desktop, Full on Mobile */}
      <div className="w-full max-w-6xl mx-auto flex flex-col md:min-h-0 md:pt-4 lg:pt-4 bg-white px-0 md:px-12">
        
        {/* 2-Column Grid for Content */}
        <div className={`w-full ${hasVisuals ? 'lg:grid lg:grid-cols-2 lg:gap-x-24 lg:gap-y-0 lg:items-start' : 'max-w-xl mx-auto'} px-0`}>
            
            {/* Desktop Header - Only on large screens (placed in col-2, row-1) */}
            <div className="hidden lg:flex flex-col items-center w-full mb-8 lg:col-start-2 lg:row-start-1">
                {/* Logo & Name */}
                <div className="flex items-center justify-center gap-4 mb-4">
                    {showLogo && (
                        tenantSettings?.logo_url ? (
                            <img src={`${API_URL}${tenantSettings.logo_url}`} className="h-20 w-20 object-contain" alt="Logo" />
                        ) : (
                            <div className="w-20 h-20 rounded-2xl bg-slate-900 flex items-center justify-center text-xl font-semibold text-white">
                                {tenantSettings?.name?.[0]?.toUpperCase() || 'R'}
                            </div>
                        )
                    )}
                    {showName && (
                        <span className="text-xl font-medium tracking-tight text-slate-800">
                            {tenantSettings?.name || "rezea"}
                        </span>
                    )}
                </div>

                {/* Notifications & Credits */}
                <div className="flex items-center justify-center gap-6 w-full">
                    {/* Alert Hub Pill */}
                    {allAlerts.length > 0 && (
                        <div className="relative">
                            <button 
                                onClick={() => setIsAlertsExpanded(!isAlertsExpanded)}
                                className={`inline-flex items-center gap-2 py-1.5 px-3.5 rounded-full border transition-all text-xs font-semibold shadow-sm active:scale-[0.98] select-none
                                    ${allAlerts[0].priority === 1 ? 'bg-orange-50/90 border-orange-200/60 text-orange-800 hover:bg-orange-100/90' : 
                                      allAlerts[0].priority === 2 ? 'bg-[#FFF2B9]/50 border-amber-200/50 text-amber-900 hover:bg-[#FFF2B9]/70' : 'bg-sky-50/90 border-sky-200/60 text-sky-800 hover:bg-sky-100/90'}`}
                            >
                                <span className="text-[13px] shrink-0 animate-pulse">🔔</span>
                                <span className="font-bold">
                                    {allAlerts.length === 1 
                                        ? "1 notification" 
                                        : `${allAlerts.length} notifications`}
                                </span>
                                <svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    className={`h-3 w-3 shrink-0 transition-transform duration-500 ${isAlertsExpanded ? 'rotate-180' : ''}`} 
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            
                            {isAlertsExpanded && (
                                <div className={`absolute top-10 left-1/2 -translate-x-1/2 w-80 max-w-xs mt-2 flex flex-col gap-2 p-3 border rounded-2xl animate-in fade-in zoom-in-95 duration-500 origin-top shadow-md z-[60]
                                    ${allAlerts[0].priority === 1 ? 'bg-orange-50/95 border-orange-200/80' : 
                                      allAlerts[0].priority === 2 ? 'bg-[#FFF2B9]/95 border-amber-200/80' : 'bg-sky-50/95 border-sky-200/80'}`}
                                >
                                    {allAlerts.map(alert => (
                                        <div key={alert.id} className="flex items-start gap-2.5 p-2 bg-white rounded-xl border border-slate-100 shadow-sm transition-all hover:shadow-md text-left">
                                            <div className="mt-0.5 shrink-0">
                                                {alert.priority === 1 && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                    </svg>
                                                )}
                                                {alert.priority === 2 && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                )}
                                                {alert.priority === 3 && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                )}
                                            </div>
                                            <p className="text-[11px] font-medium text-slate-700 leading-snug">
                                                {alert.message}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Credits display */}
                    {credits && (credits.balance > 0 || myOrders.length > 0) && (() => {
                        const activities = Object.entries(credits.balances_by_activity || {})
                            .filter(([_, bal]) => bal === null || Number(bal) > 0);
                        const sortedActivities = [...activities].sort(([a], [b]) => {
                            if (a === "Toutes activités") return -1;
                            if (b === "Toutes activités") return 1;
                            return a.localeCompare(b);
                        });
                        
                        if (sortedActivities.length === 0) return null;
                        
                        return (
                            <div className="flex flex-col items-center gap-1 relative">
                                <button 
                                    onClick={() => setShowCreditDetails(!showCreditDetails)}
                                    className="flex items-center gap-2 text-slate-800 hover:text-slate-900 focus:outline-none select-none transition-all active:scale-[0.98] py-1"
                                >
                                    <span className="text-sm font-medium text-slate-600">Mes crédits</span>
                                    <span className="text-base">💎</span>
                                    <p className="text-lg font-medium leading-none text-slate-900">{formatCredits(credits.balance)}</p>
                                    {sortedActivities.length > 0 && (
                                        <svg 
                                            xmlns="http://www.w3.org/2000/svg" 
                                            className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${showCreditDetails ? 'rotate-180' : ''}`} 
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    )}
                                </button>
                                
                                {showCreditDetails && (
                                    <div className="absolute top-10 left-1/2 -translate-x-1/2 flex flex-col gap-1.5 w-48 mt-2 animate-in fade-in slide-in-from-top-1 duration-200 z-50">
                                        {sortedActivities.map(([activity, bal]) => (
                                            <div key={activity} className="flex items-center justify-between text-[11px] text-slate-700 bg-white shadow-sm border border-slate-200/80 px-2.5 py-1 rounded-xl">
                                                <span className="text-slate-500 text-[10px] truncate max-w-[100px] capitalize">{activity}</span>
                                                <div className="flex items-center gap-1">
                                                    <span>💎</span>
                                                    <span className="font-bold text-slate-900">{bal === null ? "Illimité" : formatCredits(Number(bal))}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Left Column (Desktop) / Top Section (Mobile): Banner & Identity (placed in col-1, row-2) */}
            <div className="flex flex-col h-full lg:col-start-1 lg:row-start-2">
                {/* 1. Header - Club identity + Credits (Mobile Only) */}
                <header className={`px-5 py-3 flex items-center shrink-0 mb-2 md:mb-5 lg:hidden ${
                    isLogoOnly ? 'justify-center relative' : 'justify-between'
                }`}>
                <div className="flex items-center gap-3">
                    {showLogo && (
                        tenantSettings?.logo_url ? (
                            <img src={`${API_URL}${tenantSettings.logo_url}`} className="h-14 w-14 object-contain" alt="Logo" />
                        ) : (
                            <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-sm font-semibold text-white">
                                {tenantSettings?.name?.[0]?.toUpperCase() || 'R'}
                            </div>
                        )
                    )}
                    {showName && (
                        <span className="text-sm font-medium tracking-tight text-slate-800 truncate max-w-[200px]">
                            {tenantSettings?.name || "rezea"}
                        </span>
                    )}
                </div>

                <div className={isLogoOnly ? 'absolute right-5 flex items-center gap-2' : 'flex items-center gap-2'}>
                  {/* Desktop Profile Access */}
                  <Link href={`${basePath}/profile`} className="hidden md:flex items-center group">
                      <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center shadow-sm border border-slate-200 group-hover:bg-white group-hover:shadow-md transition-all">
                          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" xmlns="http://www.w3.org/2000/svg">
                              <path d="M20 21C20 19.6044 20 18.9067 19.8278 18.3389C19.4405 17.0612 18.4388 16.0595 17.1611 15.6722C16.5933 15.5 15.8956 15.5 14.5 15.5H9.5C8.10442 15.5 7.40665 15.5 6.83886 15.6722C5.56116 16.0595 4.55953 17.0612 4.17224 18.3389C4 18.9067 4 19.6044 4 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <path d="M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                      </div>
                  </Link>

                  {/* Logout Button */}
                  <button 
                      onClick={handleLogout}
                      className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all duration-300 active:scale-[0.95]"
                  >
                      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 15L15 12M15 12L12 9M15 12H4M9 20h9a2 2 0 002-2V6a2 2 0 00-2-2H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="text-xs font-semibold hidden md:inline">Se déconnecter</span>
                  </button>
                </div>
            </header>

            {/* Alert Hub - Compact centered pill layout (Mobile Only) */}
            {allAlerts.length > 0 && (
                <div className="flex flex-col items-center w-full px-5 mb-4 lg:hidden">
                    <button 
                        onClick={() => setIsAlertsExpanded(!isAlertsExpanded)}
                        className={`inline-flex items-center gap-2 py-1.5 px-4 rounded-full border transition-all text-xs font-semibold shadow-sm active:scale-[0.98]
                            ${allAlerts[0].priority === 1 ? 'bg-orange-50/90 border-orange-200/60 text-orange-800 hover:bg-orange-100/90' : 
                              allAlerts[0].priority === 2 ? 'bg-[#FFF2B9]/50 border-amber-200/50 text-amber-900 hover:bg-[#FFF2B9]/70' : 'bg-sky-50/90 border-sky-200/60 text-sky-800 hover:bg-sky-100/90'}`}
                    >
                        <span className="text-[13px] shrink-0 animate-pulse">🔔</span>
                        <span>
                            {allAlerts.length === 1 
                                ? "1 notification en attente" 
                                : `${allAlerts.length} notifications en attente`}
                        </span>
                        <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            className={`h-3 w-3 shrink-0 ml-1 transition-transform duration-500 ${isAlertsExpanded ? 'rotate-180' : ''}`} 
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    
                    {/* Expanded Alert List - Matches pill background color */}
                    {isAlertsExpanded && (
                        <div className={`w-full max-w-md mt-2 flex flex-col gap-2 p-3 border rounded-2xl animate-in fade-in zoom-in-95 duration-500 origin-top shadow-md
                            ${allAlerts[0].priority === 1 ? 'bg-orange-50/90 border-orange-200/60' : 
                              allAlerts[0].priority === 2 ? 'bg-[#FFF2B9]/50 border-amber-200/50' : 'bg-sky-50/90 border-sky-200/60'}`}
                        >
                            {allAlerts.map(alert => (
                                <div key={alert.id} className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
                                    <div className="mt-0.5 shrink-0">
                                        {alert.priority === 1 && (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        )}
                                        {alert.priority === 2 && (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        )}
                                        {alert.priority === 3 && (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        )}
                                    </div>
                                    <p className="text-xs font-medium text-slate-700 leading-snug">
                                        {alert.message}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 1. CSS styles override for animations & custom scrollbar */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes flashGlow {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.92; transform: scale(1.01); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.96); }
                    to { opacity: 1; transform: scale(1); }
                }
                .anim-fade { 
                    opacity: 0;
                    animation: fadeIn 0.8s ease-out forwards; 
                }
                .anim-flash { animation: flashGlow 2.5s ease-in-out infinite; }
                .anim-scale { 
                    opacity: 0;
                    animation: scaleIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            {/* Banner (conditional) */}
            {showHeader && (
                <div className="relative shrink-0 mb-0 md:mb-8 lg:mb-0 lg:rounded-3xl">
                    <div 
                        className="aspect-video w-full shadow-xl shadow-blue-900/10 relative group bg-slate-50 border border-slate-100 overflow-hidden lg:rounded-3xl"
                        style={{ 
                            background: bannerUrl 
                                ? `url(${bannerUrl}) center/cover no-repeat` 
                                : `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}40)` 
                        }}
                    >
                        {/* Background Overlay Styles */}
                        {tenantSettings?.header_text_bg === "dark_overlay" && (
                            <div className="absolute inset-0 bg-black/45" />
                        )}
                        {tenantSettings?.header_text_bg === "light_overlay" && (
                            <div className="absolute inset-0 bg-white/45" />
                        )}
                        {bannerUrl && tenantSettings?.header_text_bg !== "dark_overlay" && tenantSettings?.header_text_bg !== "light_overlay" && (
                            <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-all duration-700" />
                        )}

                        {/* Text Overlay Content */}
                        {(tenantSettings?.header_title || tenantSettings?.header_subtitle) && (
                            <div className={`absolute inset-0 p-6 flex flex-col ${alignY} ${alignX}`}>
                                {tenantSettings?.header_text_bg === "pill_dark" || tenantSettings?.header_text_bg === "pill_light" ? (
                                    <div className={`${
                                        tenantSettings.header_text_bg === "pill_dark"
                                            ? "bg-black/65 text-white border border-white/10"
                                            : "bg-white/85 text-slate-800 border border-slate-100 shadow-lg"
                                    } backdrop-blur-md px-6 py-4 rounded-3xl max-w-[90%] inline-flex flex-col gap-1 ${alignX}`}>
                                        {tenantSettings.header_title && (
                                            <h2 
                                                className={`text-base md:text-lg font-medium tracking-tight ${
                                                    animation === "fade" ? "anim-fade" : animation === "flash" ? "anim-flash" : animation === "scale" ? "anim-scale" : ""
                                                }`}
                                                style={{ color: tenantSettings.header_text_bg === "pill_dark" ? undefined : tenantSettings.header_text_color }}
                                            >
                                                {tenantSettings.header_title}
                                            </h2>
                                        )}
                                        {tenantSettings.header_subtitle && (
                                            <p className={`text-xs md:text-sm font-medium opacity-90 ${
                                                animation === "fade" ? "anim-fade" : animation === "flash" ? "anim-flash" : animation === "scale" ? "anim-scale" : ""
                                            }`}>
                                                {tenantSettings.header_subtitle}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className={`max-w-[90%] flex flex-col gap-1 ${alignX}`} style={{ color: tenantSettings.header_text_color || "#ffffff" }}>
                                        {tenantSettings.header_title && (
                                            <h2 
                                                className={`text-base md:text-lg font-medium tracking-tight ${
                                                    animation === "fade" ? "anim-fade" : animation === "flash" ? "anim-flash" : animation === "scale" ? "anim-scale" : ""
                                                }`}
                                            >
                                                {tenantSettings.header_title}
                                            </h2>
                                        )}
                                        {tenantSettings.header_subtitle && (
                                            <p className={`text-xs md:text-sm font-medium opacity-90 ${
                                                animation === "fade" ? "anim-fade" : animation === "flash" ? "anim-flash" : animation === "scale" ? "anim-scale" : ""
                                            }`}>
                                                {tenantSettings.header_subtitle}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {!bannerUrl && !(tenantSettings?.header_title || tenantSettings?.header_subtitle) && (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                                <span className="text-8xl opacity-20">✨</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Vignettes Carousel (conditional) */}
            {showVignettes && tenantSettings?.vignettes && tenantSettings.vignettes.length > 0 && (
                <div className="px-5 mt-4 mb-2 shrink-0">
                    <h3 className="text-sm font-semibold text-slate-800 mb-3 tracking-tight">{tenantSettings.vignettes_title || "À la une"}</h3>
                    <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-3 -mx-5 px-5">
                        {tenantSettings.vignettes.map((vig: Vignette) => {
                            const CardContent = (
                                <div className="relative w-full h-full">
                                    <img 
                                        src={`${API_URL}${vig.image_url}`} 
                                        alt={vig.title || "Vignette"} 
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                                    />
                                    {/* Dark overlay for text readability */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                    {vig.title && (
                                        <div className="absolute bottom-3 left-3 right-3 text-white">
                                            <p className="text-xs font-bold leading-tight tracking-tight">{vig.title}</p>
                                        </div>
                                    )}
                                </div>
                            );

                            return vig.link_url ? (
                                <Link 
                                    key={vig.id}
                                    href={vig.link_url}
                                    className="w-[42%] flex-shrink-0 snap-start aspect-[3/4] rounded-2xl overflow-hidden border border-slate-100 relative shadow-md shadow-blue-900/5 active:scale-[0.97] transition-all group"
                                >
                                    {CardContent}
                                </Link>
                            ) : (
                                <div 
                                    key={vig.id}
                                    className="w-[42%] flex-shrink-0 snap-start aspect-[3/4] rounded-2xl overflow-hidden border border-slate-100 relative shadow-md shadow-blue-900/5 transition-all group"
                                >
                                    {CardContent}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>

        {/* Right Column (Desktop) / Bottom Section (Mobile): Menu Buttons */}
        <div className="flex flex-col flex-1 px-5 h-full pt-3 lg:pt-0 lg:px-0 lg:col-start-2 lg:row-start-2">

            {/* Credits display */}
            {credits && (credits.balance > 0 || myOrders.length > 0) && (() => {
                const activities = Object.entries(credits.balances_by_activity || {})
                    .filter(([_, bal]) => bal === null || Number(bal) > 0);
                const sortedActivities = [...activities].sort(([a], [b]) => {
                    if (a === "Toutes activités") return -1;
                    if (b === "Toutes activités") return 1;
                    return a.localeCompare(b);
                });
                
                if (sortedActivities.length === 0) return null;
                
                return (
                    <div className="flex flex-col items-end gap-1 px-1 mt-1 mb-5 lg:hidden">
                        <button 
                            onClick={() => setShowCreditDetails(!showCreditDetails)}
                            className="flex items-center gap-2 text-slate-800 hover:text-slate-900 focus:outline-none select-none transition-all active:scale-[0.98] py-1"
                        >
                            <div className="w-px h-5 bg-slate-300 mr-1" />
                            <span className="text-sm font-medium text-slate-600">Mes crédits</span>
                            <span className="text-base">💎</span>
                            <p className="text-lg font-medium leading-none text-slate-900">{formatCredits(credits.balance)}</p>
                            {sortedActivities.length > 0 && (
                                <svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${showCreditDetails ? 'rotate-180' : ''}`} 
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            )}
                        </button>
                        
                        {showCreditDetails && (
                            <div className="flex flex-wrap justify-end gap-1.5 max-w-xs mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                {sortedActivities.map(([activity, bal]) => (
                                    <div key={activity} className="flex items-center gap-1 text-[11px] text-slate-700 bg-white shadow-sm border border-slate-200/80 px-2.5 py-1 rounded-xl">
                                        <span>💎</span>
                                        <span className="font-bold text-slate-900">{bal === null ? "Illimité" : formatCredits(Number(bal))}</span>
                                        <span className="text-slate-500 text-[10px] truncate max-w-[100px] capitalize">{activity}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* 5. Quick Actions Stack */}
            <div className="grid grid-cols-2 gap-2.5 mb-4 w-full mx-auto lg:mx-0 px-1 lg:px-0 lg:mt-0">

                {/* Staff: Gestion des inscriptions */}
                {isAdminOrStaff && (
                    <Link 
                        href={`${basePath}/gestion-inscriptions`}
                        className="col-span-2 relative flex items-center justify-between px-6 py-5 text-white rounded-2xl active:scale-[0.98] transition-all duration-300 group overflow-hidden"
                        style={{
                            background: `linear-gradient(135deg, ${primaryColor}cc, ${primaryColor}88, ${primaryColor}aa)`,
                            boxShadow: `3px 4px 14px -2px ${primaryColor}30`
                        }}
                    >
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="text-3xl">📋</div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-base font-medium leading-none">Gestion des inscriptions</span>
                                <span className="text-xs font-normal text-white/90">Profil Staff uniquement</span>
                            </div>
                        </div>
                    </Link>
                )}

                {/* Planning Hero Card */}
                <Link 
                    href={`${basePath}/planning`}
                    className="col-span-2 relative flex items-center justify-between px-6 py-6 bg-white border rounded-2xl hover:shadow-xl transition-all duration-500 active:scale-[0.98] group overflow-hidden"
                    style={{ 
                        boxShadow: `3px 4px 16px -2px ${primaryColor}40`,
                        borderColor: `${primaryColor}30`
                    }}
                >
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="text-3xl group-hover:scale-110 transition-transform duration-500">🗓️</div>
                        <div className="flex flex-col gap-1">
                            <span className="text-base font-medium text-slate-800 tracking-tight leading-none group-hover:text-slate-900 transition-colors">
                                Planning & réservations
                            </span>
                            {nextRDV ? (
                                <div className="flex items-center gap-2">
                                    <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50/80 px-2 py-0.5 rounded-full">
                                        Prochain RDV : {nextRDV.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à {nextRDV.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {nextRDV.title}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-xs font-normal text-slate-600">Réservez votre prochaine séance</span>
                            )}
                        </div>
                    </div>
                    <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full blur-3xl opacity-0 group-hover:opacity-[0.06] transition-opacity duration-700" style={{ backgroundColor: primaryColor }} />
                </Link>

                {/* Boutique Card */}
                <Link 
                    href={`${basePath}/credits`}
                    className="col-span-2 relative flex items-center justify-between px-6 py-5 bg-white border rounded-2xl hover:shadow-xl transition-all duration-500 active:scale-[0.98] group overflow-hidden"
                    style={{ 
                        boxShadow: `3px 4px 14px -2px ${primaryColor}35`,
                        borderColor: `${primaryColor}25`
                    }}
                >
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="text-3xl shrink-0 group-hover:scale-110 transition-transform duration-500">🛍️</div>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-base font-medium text-slate-800 group-hover:text-slate-900 transition-colors tracking-tight">Boutique</span>
                            <span className="text-xs font-normal text-slate-600">Créditez votre compte</span>
                        </div>
                    </div>
                    <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full blur-3xl opacity-0 group-hover:opacity-[0.04] transition-opacity duration-700" style={{ backgroundColor: primaryColor }} />
                </Link>

                {/* Commandes Card */}
                <Link 
                    href={`${basePath}/orders`}
                    className="col-span-2 relative flex items-center justify-between px-6 py-5 bg-white border rounded-2xl hover:shadow-xl transition-all duration-500 active:scale-[0.98] group overflow-hidden"
                    style={{ 
                        boxShadow: `3px 4px 14px -2px ${primaryColor}35`,
                        borderColor: `${primaryColor}25`
                    }}
                >
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="text-3xl shrink-0 group-hover:scale-110 transition-transform duration-500">📦</div>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-base font-medium text-slate-800 group-hover:text-slate-900 transition-colors tracking-tight">Commandes</span>
                            <span className="text-xs font-normal text-slate-600">Consultez vos offres et évènements</span>
                        </div>
                    </div>
                </Link>

                {/* Separator for Admin Section */}
                {(user?.role === "owner" || user?.role === "manager") && (
                    <div className="col-span-2 my-3 w-1/3 mx-auto border-t border-slate-300" />
                )}

                {/* Admin Button - Styled with slate-gray background and neutral border */}
                {(user?.role === "owner" || user?.role === "manager") && (
                    <Link 
                        href={`${basePath}/admin`}
                        className="col-span-2 mt-1 relative flex items-center justify-between px-6 py-3.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-300/80 rounded-2xl transition-all duration-500 active:scale-[0.98] group overflow-hidden"
                        style={{ 
                            boxShadow: '3px 4px 14px -2px rgba(100, 116, 139, 0.22)'
                        }}
                    >
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="text-3xl shrink-0 group-hover:scale-110 transition-transform duration-500">⚙️</div>
                            <span className="text-base font-medium text-slate-800 group-hover:text-slate-900 transition-colors tracking-tight">
                                Basculer sur l&apos;interface de gestion
                            </span>
                        </div>
                    </Link>
                )}

            </div>

            {/* 6. Footer Area */}
            <div className="w-full max-w-[500px] mx-auto lg:mx-0 px-1">
                <div className="pt-3 flex items-center justify-between pb-2 mb-20">
                    <div className="flex gap-8">
                        {tenantSettings?.cgv_url && (
                            <a 
                                href={`${API_URL}${tenantSettings.cgv_url}`} 
                                target="_blank" 
                                className="text-xs font-medium transition-all text-slate-400 hover:text-slate-600 focus:text-slate-600 outline-none"
                            >
                                CGV
                            </a>
                        )}
                        {tenantSettings?.rules_url && (
                            <a 
                                href={`${API_URL}${tenantSettings.rules_url}`} 
                                target="_blank" 
                                className="text-xs font-medium transition-all text-slate-400 hover:text-slate-600 focus:text-slate-600 outline-none"
                            >
                                Règlement intérieur
                            </a>
                        )}
                    </div>
                    <div className="text-right">
                        <span className="text-xs font-medium text-slate-400 tracking-tighter">@rezea</span>
                    </div>
                </div>
            </div>
        </div>
      </div>
      </div>
      
      {/* Bottom Navigation for Mobile PWA Experience */}
      <BottomNav userRole={user?.role} />

      {/* New Alerts Popup Modal */}
      <ConfirmModal
        isOpen={showNewAlertsPopup}
        title="Nouvelle notification"
        type="info"
        confirmLabel="J'ai compris"
        onConfirm={markAlertsAsSeen}
        message={
          <div className="space-y-4">
            <p className="text-slate-500 text-sm leading-relaxed -mt-1">
              {newAlertsForPopup.length === 1 
                ? "Vous avez 1 nouveau message à consulter"
                : `Vous avez ${newAlertsForPopup.length} nouveaux messages à consulter`}
            </p>
            <div className="w-full space-y-3 max-h-[35vh] overflow-y-auto pr-1 no-scrollbar">
              {newAlertsForPopup.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl text-left border border-slate-100 transition-colors hover:bg-slate-100/50">
                  <div className="mt-1 shrink-0">
                    {alert.priority === 1 && <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />}
                    {alert.priority === 2 && <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]" />}
                    {alert.priority === 3 && <div className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]" />}
                  </div>
                  <p className="text-xs font-medium text-slate-700 leading-snug">{alert.message}</p>
                </div>
              ))}
            </div>
          </div>
        }
      />

      {/* Global CSS fixes for PWA feel */}
      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @supports (-webkit-touch-callout: none) {
            .safe-top { padding-top: env(safe-area-inset-top); }
            .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
        }
      `}</style>
    </div>
  );
}
