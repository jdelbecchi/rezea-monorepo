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

        loadSecondaryData();
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
    const alerts: { id: string; message: string; icon: string; priority: number }[] = [];
    const now = new Date();

    // 1. Issues (Priority 1 - High)
    myOrders.filter(o => o.payment_status === PaymentStatus.A_REGULARISER).forEach(o => {
      alerts.push({
        id: `issue-${o.id}`,
        message: `Vous avez une commande à régulariser : "${o.offer_name}"`,
        icon: "🚨",
        priority: 1
      });
    });

    // 2. Expiry (Priority 2 - Warning)
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
        icon: "⚠️",
        priority: 2
      });
    });

    // 3. Pending Payments (Priority 3 - Reminder)
    // - Pending Orders
    myOrders.filter(o => o.payment_status === PaymentStatus.A_VALIDER || o.payment_status === PaymentStatus.EN_ATTENTE).forEach(o => {
      alerts.push({
        id: `pending-order-${o.id}`,
        message: `Pensez à régler prochainement votre commande "${o.offer_name}"`,
        icon: "⏳",
        priority: 3
      });
    });
    // - Pending Event Registrations
    myEventRegistrations.filter(r => r.payment_status === PaymentStatus.A_VALIDER || r.payment_status === PaymentStatus.EN_ATTENTE).forEach(r => {
      alerts.push({
        id: `pending-event-${r.id}`,
        message: `Pensez à régler prochainement votre inscription à "${r.event_title}"`,
        icon: "✨",
        priority: 3
      });
    });

    // Sort by priority then by creation date (implicitly or explicitly if available)
    return alerts.sort((a, b) => a.priority - b.priority);
  }, [myOrders, myEventRegistrations]);

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-medium animate-pulse">Chargement de votre espace...</p>
        </div>
      </div>
    );
  }

  const isAdminOrStaff = user?.role === "owner" || user?.role === "manager" || user?.role === "staff";
  const color = tenantSettings?.primary_color || "#2563eb";
  const bannerUrl = tenantSettings?.banner_url ? `${API_URL}${tenantSettings.banner_url}` : null;


  // --- VIEW: PWA HOME (Default for everyone) ---
  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center overflow-x-hidden safe-top pb-20 md:pb-0">
      
      {/* Main Responsive Container: Max width on Desktop, Full on Mobile */}
      <div className="w-full max-w-6xl mx-auto flex flex-col min-h-screen md:min-h-0 md:pt-16 bg-white lg:grid lg:grid-cols-2 lg:gap-24 lg:items-start px-0 md:px-12">
        
        {/* Left Column (Desktop) / Top Section (Mobile): Banner & Identity */}
        <div className="flex flex-col h-full">
            {/* 1. Header Discreet - More Compact on Mobile */}
            <header className="px-5 py-3 flex items-center justify-between shrink-0 mb-1 md:mb-10">
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
                
                <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-slate-900 tracking-tight">
                        {user?.first_name}
                    </span>
                    <Link href={`${basePath}/profile`} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </Link>
                </div>
            </header>

            {/* 2. Banner (Editorial Style) - Reduced spacing on mobile */}
            <div className="relative shrink-0 mb-1 md:mb-8 lg:mb-0">
                <div 
                    className="aspect-video w-full shadow-2xl shadow-blue-900/10 relative group bg-slate-50 border border-slate-100 overflow-hidden"
                    style={{ 
                        background: bannerUrl 
                            ? `url(${bannerUrl}) center/cover no-repeat` 
                            : `linear-gradient(135deg, ${color}20, ${color}40)` 
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
        </div>

        {/* Right Column (Desktop) / Bottom Section (Mobile): Actions & Stats */}
        <div className="flex flex-col flex-1 px-5 h-full py-0 lg:py-0">
            {/* 3. Reporting Section - Compacted font and p on mobile */}
            <div className="flex flex-col gap-3 mb-6 w-full max-w-[440px] mx-auto lg:mx-0">
                {/* Status Row */}
                {/* Status Row - Balanced and Centered */}
                <div className="flex border border-transparent rounded-xl items-stretch w-full mb-1 px-6">
                    {/* Solde Crédits */}
                    {credits && (credits.balance > 0 || myOrders.length > 0) && (
                        <div className="w-[30%] py-1.5 shrink-0 flex flex-col">
                            <p className="text-[11px] font-medium text-blue-600 mb-0.5">Mon crédit</p>
                            <p className="text-xl font-bold text-slate-900 leading-none">{formatCredits(credits.balance)}</p>
                        </div>
                    )}
                    
                    {/* Vertical Divider */}
                    {credits && nextRDV && (
                        <div className="w-px bg-slate-100 self-stretch my-2 mx-1" />
                    )}

                    {/* Prochain RDV */}
                    {nextRDV && (
                        <div className="flex-1 py-1.5 px-3 min-w-0 flex flex-col">
                            <p className="text-[11px] font-medium text-blue-500 mb-0.5 truncate">
                                Prochain RDV le {nextRDV.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à {nextRDV.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-[15px] font-semibold text-slate-900 truncate leading-tight">{nextRDV.title}</p>
                        </div>
                    )}
                </div>
 
                {/* Unified Alert Hub */}
                {allAlerts.length > 0 && (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-right-4 duration-500">
                        {allAlerts.length === 1 ? (
                            // Single Alert: Direct display
                            <div className="bg-amber-50/40 border border-amber-100 p-3 rounded-xl flex items-center justify-center gap-3 shadow-sm">
                                <span className="text-sm shrink-0">{allAlerts[0].icon}</span>
                                <p className="text-[11px] font-medium text-slate-700 leading-snug">
                                    {allAlerts[0].message}
                                </p>
                            </div>
                        ) : (
                            // Multiple Alerts: Collapsible Hub
                            <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm transition-all duration-300">
                                <button 
                                    onClick={() => setIsAlertsExpanded(!isAlertsExpanded)}
                                    className="w-full p-3 flex items-center justify-between gap-3 hover:bg-slate-100/50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm shrink-0">⚠️</span>
                                        <p className="text-[11px] font-semibold text-slate-900 leading-none">
                                            {allAlerts.length} messages requièrent votre attention
                                        </p>
                                    </div>
                                    <svg 
                                        xmlns="http://www.w3.org/2000/svg" 
                                        className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${isAlertsExpanded ? 'rotate-180' : ''}`} 
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                
                                {isAlertsExpanded && (
                                    <div className="px-3 pb-3 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        {allAlerts.map(alert => (
                                            <div key={alert.id} className="flex items-center gap-3 p-2 bg-white/50 border border-slate-100 rounded-xl">
                                                <span className="text-xs shrink-0">{alert.icon}</span>
                                                <p className="text-[10px] font-medium text-slate-600 leading-snug">
                                                    {alert.message}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Horizontal Divider - Zen style */}
                {allAlerts.length === 0 && (
                    <div className="h-px bg-slate-100 w-full mt-2" />
                )}
            </div>
 
            {/* 4. Quick Actions Stack - Compact buttons on mobile */}
            <div className="flex flex-col gap-3 mb-8 w-full max-w-[440px] mx-auto lg:mx-0">
                {[
                    { path: `${basePath}/planning`, label: "Planning", icon: "📅", color: "bg-purple-50 text-purple-600" },
                    { path: `${basePath}/credits`, label: "Boutique", icon: "🛍️", color: "bg-pink-50 text-pink-600" },
                    { path: `${basePath}/orders`, label: "Mes commandes", icon: "📦", color: "bg-blue-50 text-blue-600" },
                    ...(user?.role === "owner" || user?.role === "manager" || user?.role === "staff" 
                        ? [{ path: `${basePath}/gestion-inscriptions`, label: "Gestion des inscriptions", icon: "📝", color: "bg-emerald-50 text-emerald-600" }] 
                        : []),
                ].map((item) => (
                    <Link 
                        key={item.path} 
                        href={item.path}
                        className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-600/30 hover:shadow-xl hover:shadow-blue-900/5 transition-all active:scale-[0.98] group shadow-sm"
                    >
                        <div className={`w-10 h-10 shrink-0 ${item.color} rounded-full flex items-center justify-center text-lg group-hover:scale-110 transition-transform shadow-sm`}>
                            {item.icon}
                        </div>
                        <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">{item.label}</span>
                        <span className="ml-auto text-slate-300 group-hover:text-blue-500 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                            </svg>
                        </span>
                    </Link>
                ))}
            </div>

            {/* 5. Admin & Footer Area */}
            <div className="mt-auto w-full max-w-[440px] mx-auto lg:mx-0">
                {/* Admin Toggle (Managers only) */}
                {(user?.role === "owner" || user?.role === "manager") && (
                    <button 
                        onClick={() => router.push(`${basePath}/admin`)}
                        className="w-full py-3.5 mb-8 bg-slate-900 text-white flex items-center justify-center gap-4 shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all hover:bg-slate-800"
                    >
                        <span className="text-base animate-pulse">⚙️</span>
                        <span className="text-sm font-medium">Accès administration</span>
                    </button>
                )}

                <footer className="pt-6 border-t border-slate-100 flex items-center justify-between pb-8">
                    <div className="flex gap-8">
                        {tenantSettings?.cgv_url && (
                            <a 
                                href={`${API_URL}${tenantSettings.cgv_url}`} 
                                target="_blank" 
                                className="text-[11px] font-medium transition-all text-slate-400 hover:text-blue-600"
                            >
                                CGV
                            </a>
                        )}
                        {tenantSettings?.rules_url && (
                            <a 
                                href={`${API_URL}${tenantSettings.rules_url}`} 
                                target="_blank" 
                                className="text-[11px] font-medium transition-all text-slate-400 hover:text-blue-600"
                            >
                                Règlement intérieur
                            </a>
                        )}
                    </div>
                    <div className="text-right">
                        <span className="text-[11px] font-medium text-slate-400 tracking-tighter">@rezea</span>
                    </div>
                </footer>
            </div>
        </div>
      </div>
      
      {/* Bottom Navigation for Mobile PWA Experience */}
      <BottomNav userRole={user?.role} />

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
