"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, User, CreditAccount, Tenant, Booking, Event, OrderItem, EventRegistration } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
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
  const [loading, setLoading] = useState(true);
  
  const basePath = `/${slug}`;
  
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
        router.push(`/${slug}`);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router, slug]);

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
  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center overflow-x-hidden safe-top md:pb-0">
      
      {/* Main Responsive Container: Max width on Desktop, Full on Mobile */}
      <div className="w-full max-w-6xl mx-auto flex flex-col md:min-h-0 md:pt-16 bg-white lg:grid lg:grid-cols-2 lg:gap-24 lg:items-start px-0 md:px-12">
        
        {/* Left Column (Desktop) / Top Section (Mobile): Banner & Identity */}
        <div className="flex flex-col h-full">
            {/* 1. Header - Club identity + Credits */}
            <header className="px-5 py-3 flex items-center justify-between shrink-0 mb-3 md:mb-10">
                <div className="flex items-center gap-3">
                    {tenantSettings?.logo_url ? (
                        <img src={`${API_URL}${tenantSettings.logo_url}`} className="h-8 w-8 object-contain" alt="Logo" />
                    ) : (
                        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-[10px] font-medium text-white">
                            {tenantSettings?.name?.[0]?.toUpperCase() || 'R'}
                        </div>
                    )}
                    <span className="text-sm font-medium tracking-tight text-slate-800 truncate max-w-[200px]">
                        {tenantSettings?.name || "rezea"}
                    </span>
                </div>

                {/* Desktop Profile Access */}
                <Link href={`${basePath}/profile`} className="hidden md:flex items-center gap-3 group">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-600 transition-colors">Mon profil</span>
                    </div>
                    <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center shadow-sm border border-slate-200 group-hover:bg-white group-hover:shadow-md transition-all">
                        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 21C20 19.6044 20 18.9067 19.8278 18.3389C19.4405 17.0612 18.4388 16.0595 17.1611 15.6722C16.5933 15.5 15.8956 15.5 14.5 15.5H9.5C8.10442 15.5 7.40665 15.5 6.83886 15.6722C5.56116 16.0595 4.55953 17.0612 4.17224 18.3389C4 18.9067 4 19.6044 4 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <path d="M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                    </div>
                </Link>
            </header>

            {/* Admin Button - Black card style */}
            {(user?.role === "owner" || user?.role === "manager") && (
                <button 
                    onClick={() => router.push(`${basePath}/admin`)}
                    className="mx-5 mb-2 flex items-center justify-center gap-3 px-4 py-3.5 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all duration-300 hover:bg-slate-800"
                >
                    <span className="text-base">⚙️</span>
                    <span className="text-sm font-medium">Accès administration</span>
                </button>
            )}

            {/* Banner */}
            <div className="relative shrink-0 mb-0 md:mb-8 lg:mb-0">
                <div 
                    className="aspect-video w-full shadow-2xl shadow-blue-900/10 relative group bg-slate-50 border border-slate-100 overflow-hidden"
                    style={{ 
                        background: bannerUrl 
                            ? `url(${bannerUrl}) center/cover no-repeat` 
                            : `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}40)` 
                    }}
                >
                    {bannerUrl && <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-all duration-700" />}
                    {!bannerUrl && (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                            <span className="text-8xl opacity-20">✨</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Alert Hub - Full width below banner */}
            {allAlerts.length > 0 && (
                <button 
                    onClick={() => setIsAlertsExpanded(!isAlertsExpanded)}
                    className={`w-full flex items-center justify-center gap-3 py-3 px-6 transition-all
                        ${allAlerts[0].priority === 1 ? 'bg-orange-50' : 
                          allAlerts[0].priority === 2 ? 'bg-yellow-50/80' : 'bg-sky-50'}`}
                >
                    <span 
                        className={`text-sm shrink-0 transition-colors duration-300 ${
                            allAlerts[0].priority === 1 ? 'text-orange-500 [filter:drop-shadow(0_0_5px_rgba(249,115,22,0.4))]' : 
                            allAlerts[0].priority === 2 ? 'text-yellow-500' : 'text-sky-500'
                        }`}
                    >
                        🔔
                    </span>
                    <div className="flex items-center justify-center gap-4 flex-1 px-1 text-center">
                        <p className={`text-xs font-medium tracking-tight leading-tight
                            ${allAlerts[0].priority === 1 ? 'text-orange-800' : 
                            allAlerts[0].priority === 2 ? 'text-yellow-700' : 'text-sky-800'}`}
                        >
                            {allAlerts[0].message}
                        </p>
                        {allAlerts.length > 1 && (
                            <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold
                                ${allAlerts[0].priority === 1 ? 'bg-orange-200 text-orange-900' : 
                                allAlerts[0].priority === 2 ? 'bg-yellow-200/80 text-yellow-800' : 'bg-sky-200 text-sky-900'}`}
                            >
                                +{allAlerts.length - 1}
                            </span>
                        )}
                    </div>
                    <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className={`h-3.5 w-3.5 shrink-0 transition-transform duration-500 ${isAlertsExpanded ? 'rotate-180' : ''}
                            ${allAlerts[0].priority === 1 ? 'text-orange-300' : 
                              allAlerts[0].priority === 2 ? 'text-yellow-300' : 'text-sky-300'}`} 
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            )}

            {/* Expanded Alert List */}
            {isAlertsExpanded && allAlerts.length > 0 && (
                <div className={`px-5 pb-3 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-500 origin-top
                    ${allAlerts[0].priority === 1 ? 'bg-orange-50/50' : 
                      allAlerts[0].priority === 2 ? 'bg-yellow-50/50' : 'bg-sky-50/50'}`}
                >
                    {allAlerts.map(alert => (
                        <div key={alert.id} className="flex items-start gap-3 p-3 bg-white/90 backdrop-blur-sm rounded-xl hover:bg-white transition-all border border-black/5 shadow-sm active:scale-[0.99]">
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

        {/* Right Column (Desktop) / Bottom Section (Mobile): Menu Buttons */}
        <div className="flex flex-col flex-1 px-5 h-full pt-3 lg:pt-0">

            {/* Credits display */}
            {credits && (credits.balance > 0 || myOrders.length > 0) && (
                <div className="flex items-center justify-end gap-2 px-1 my-4">
                    <div className="w-px h-5 bg-slate-300" />
                    <span className="text-xs font-medium text-slate-900">Crédits</span>
                    <span className="text-sm">💎</span>
                    <p className="text-lg font-medium leading-none text-slate-900">{formatCredits(credits.balance)}</p>
                </div>
            )}

            {/* 5. Quick Actions Stack */}
            <div className="grid grid-cols-2 gap-2.5 mb-4 w-full mx-auto lg:mx-0 px-1 lg:px-0 lg:mt-28">

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

            </div>

            {/* 6. Footer Area */}
            <div className="w-full max-w-[500px] mx-auto lg:mx-0 px-1">
                <div className="pt-3 flex items-center justify-between pb-2 mb-14">
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
      
      {/* Bottom Navigation for Mobile PWA Experience */}
      <BottomNav userRole={user?.role} />

      {/* New Alerts Popup Modal */}
      {showNewAlertsPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-500">
          <div className="w-full max-w-sm bg-white rounded-[2rem] shadow-2xl shadow-black/20 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-700">
            <div className="p-8 flex flex-col items-center text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 animate-pulse
                ${newAlertsForPopup[0].priority === 1 ? 'bg-orange-50' : 
                  newAlertsForPopup[0].priority === 2 ? 'bg-yellow-50' : 'bg-sky-50'}`}
              >
                <span className="text-4xl">🔔</span>
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Nouvelle notification
              </h3>
              
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                {newAlertsForPopup.length === 1 
                  ? "Vous avez 1 nouveau message à consulter"
                  : `Vous avez ${newAlertsForPopup.length} nouveaux messages à consulter`}
              </p>

              <div className="w-full space-y-3 mb-8 max-h-[35vh] overflow-y-auto pr-2 no-scrollbar">
                {newAlertsForPopup.map(alert => (
                  <div key={alert.id} className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl text-left border border-slate-100 transition-colors hover:bg-slate-100/50">
                    <div className="mt-1 shrink-0">
                      {alert.priority === 1 && <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />}
                      {alert.priority === 2 && <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]" />}
                      {alert.priority === 3 && <div className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]" />}
                    </div>
                    <p className="text-xs font-semibold text-slate-800 leading-snug">{alert.message}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={markAlertsAsSeen}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all hover:bg-slate-800"
              >
                J'ai compris
              </button>
            </div>
          </div>
        </div>
      )}

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
