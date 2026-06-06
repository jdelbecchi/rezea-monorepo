"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, User, Session, OrderItem, Tenant, AdminEventRegistrationItem } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { PaymentStatus } from "@/types/enums";

// Helper to format currency
const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
    }).format(cents / 100);
};

export default function AdminDashboardPage() {
    const router = useRouter();
    const params = useParams();
    const slug = params.slug as string;
    
    const [user, setUser] = useState<User | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

    // Real DB data
    const [segments, setSegments] = useState<any>({ regulier: 0, endormi: 0, flexible: 0, explorateur: 0, decouverte: 0, ancien: 0 });
    const [sessions, setSessions] = useState<Session[]>([]);
    const [orders, setOrders] = useState<OrderItem[]>([]);
    const [eventRegistrations, setEventRegistrations] = useState<AdminEventRegistrationItem[]>([]);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [recentComments, setRecentComments] = useState<any[]>([]);

    // Custom range and Global View states
    const [isGlobalView, setIsGlobalView] = useState(false);
    
    const getFormattedDate = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const [customStartDate, setCustomStartDate] = useState(() => {
        const firstDayOfYear = new Date(new Date().getFullYear(), 0, 1);
        return getFormattedDate(firstDayOfYear);
    });

    const [customEndDate, setCustomEndDate] = useState(() => {
        return getFormattedDate(new Date());
    });

    // List of months for the dropdown selector
    const monthsList = [
        { value: 1, label: "Janvier" },
        { value: 2, label: "Février" },
        { value: 3, label: "Mars" },
        { value: 4, label: "Avril" },
        { value: 5, label: "Mai" },
        { value: 6, label: "Juin" },
        { value: 7, label: "Juillet" },
        { value: 8, label: "Août" },
        { value: 9, label: "Septembre" },
        { value: 10, label: "Octobre" },
        { value: 11, label: "Novembre" },
        { value: 12, label: "Décembre" },
    ];

    // List of years for the dropdown selector
    const yearsList = [
        selectedYear - 1,
        selectedYear,
        selectedYear + 1,
    ];

    // Fetch data from APIs
    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Authenticate user
                const userData = await api.getCurrentUser();
                if (userData.role !== 'owner' && userData.role !== 'manager') {
                    router.push("/home");
                    return;
                }
                setUser(userData);

                // 2. Fetch tenant settings
                const tenantData = await api.getTenantSettings().catch(() => null);
                if (tenantData) setTenant(tenantData);

                // Calculate range for sessions query based on view mode
                let start = "";
                let end = "";
                if (isGlobalView) {
                    start = customStartDate;
                    end = customEndDate;
                } else {
                    start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
                    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
                    end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                }

                // Fetch secondary stats in parallel
                const [segmentsData, sessionsData, ordersData, campaignsData, eventsData] = await Promise.all([
                    api.getSegmentsStats().catch(err => {
                        console.warn("Segments stats fetch failed:", err);
                        return { regulier: 0, endormi: 0, flexible: 0, explorateur: 0, decouverte: 0, ancien: 0 };
                    }),
                    api.getSessions({
                        start_date: `${start}T00:00:00`,
                        end_date: `${end}T23:59:59`
                    }).catch(err => {
                        console.warn("Sessions fetch failed:", err);
                        return [];
                    }),
                    api.getAdminOrders().catch(err => {
                        console.warn("Orders fetch failed:", err);
                        return [];
                    }),
                    api.getSurveyCampaigns().catch(err => {
                        console.warn("Surveys fetch failed:", err);
                        return [];
                    }),
                    api.getAdminEventRegistrations().catch(err => {
                        console.warn("Event registrations fetch failed:", err);
                        return [];
                    })
                ]);

                if (segmentsData) setSegments(segmentsData);
                if (sessionsData) setSessions(sessionsData);
                if (ordersData) setOrders(ordersData);
                if (campaignsData) setCampaigns(campaignsData);
                if (eventsData) setEventRegistrations(eventsData);

                // Fetch survey campaign comments
                if (campaignsData && campaignsData.length > 0) {
                    const topCampaigns = campaignsData.slice(0, 3);
                    const details = await Promise.all(
                        topCampaigns.map(c => 
                            api.getSurveyCampaignDetails(c.id).catch(() => null)
                        )
                    );
                    
                    const commentsList = details
                        .filter(Boolean)
                        .flatMap((d: any) => 
                            d.responses
                                .filter((r: any) => r.comment)
                                .map((r: any) => ({
                                    id: r.id,
                                    userName: r.user_name || "Membre Anonyme",
                                    rating: r.rating,
                                    comment: r.comment,
                                    campaignTitle: d.title,
                                    submittedAt: r.submitted_at || r.clicked_at
                                }))
                        );
                    commentsList.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
                    setRecentComments(commentsList);
                }
            } catch (err: any) {
                console.error("Critical error in dashboard fetch:", err);
                if (err.response?.status === 401) {
                    router.push(`/${params.slug}`);
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [router, selectedMonth, selectedYear, slug, isGlobalView, customStartDate, customEndDate]);

    const currentSegments = segments;
    const currentSessions = sessions;
    const currentOrders = orders;
    const currentComments = recentComments;

    // --- CALCULATED STATISTICS ---

    // Check if order overlaps/is active in the selected date range
    const isOrderActiveInSelectedRange = (order: OrderItem) => {
        if (order.status !== 'active') return false;
        
        const orderStart = new Date(order.start_date);
        const orderEnd = order.end_date ? new Date(order.end_date) : null;
        
        let rangeStart: Date;
        let rangeEnd: Date;
        
        if (isGlobalView) {
            rangeStart = new Date(customStartDate + "T00:00:00");
            rangeEnd = new Date(customEndDate + "T23:59:59");
        } else {
            rangeStart = new Date(selectedYear, selectedMonth - 1, 1, 0, 0, 0);
            rangeEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
        }
        
        if (orderStart > rangeEnd) return false;
        if (orderEnd && orderEnd < rangeStart) return false;
        
        return true;
    };

    // 2. Global Occupancy Rate (Past sessions)
    const occupancyStats = useMemo(() => {
        const now = new Date();
        const pastSessions = currentSessions.filter(s => new Date(s.start_time) < now);
        
        let totalCapacity = 0;
        let totalBookings = 0;
        
        pastSessions.forEach(s => {
            totalCapacity += s.max_participants || 0;
            totalBookings += s.current_participants || 0;
        });
        
        const rate = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0;
        
        return {
            rate,
            totalBookings,
            totalCapacity,
            count: pastSessions.length
        };
    }, [currentSessions]);

    // 3. Sessions & hours by instructor (Attribution)
    const instructorStats = useMemo(() => {
        const stats: Record<string, { sessionCount: number; totalHours: number }> = {};
        
        currentSessions.forEach(s => {
            const name = s.instructor_name || "Non assigné";
            const start = new Date(s.start_time);
            const end = new Date(s.end_time);
            const durationHours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
            
            if (!stats[name]) {
                stats[name] = { sessionCount: 0, totalHours: 0 };
            }
            stats[name].sessionCount += 1;
            stats[name].totalHours += durationHours;
        });
        
        return Object.entries(stats).map(([name, val]) => ({
            name,
            sessionsCount: val.sessionCount,
            hoursCount: Math.round(val.totalHours * 10) / 10
        })).sort((a, b) => b.hoursCount - a.hoursCount);
    }, [currentSessions]);

    // 4. Global view of active offers
    const activeOffersStats = useMemo(() => {
        const stats: Record<string, number> = {};
        
        currentOrders.forEach(o => {
            if (isOrderActiveInSelectedRange(o)) {
                const name = o.offer_name || o.offer_snap_name || "Offre personnalisée";
                stats[name] = (stats[name] || 0) + 1;
            }
        });
        
        return Object.entries(stats).map(([name, count]) => ({
            name,
            count
        })).sort((a, b) => b.count - a.count);
    }, [currentOrders, selectedMonth, selectedYear, isGlobalView, customStartDate, customEndDate]);

    // Total active offers count
    const totalActiveOffers = useMemo(() => {
        return activeOffersStats.reduce((sum, item) => sum + item.count, 0);
    }, [activeOffersStats]);

    // 5. Payments to regularize (all periods, combining orders and events)
    const regularizePayments = useMemo(() => {
        const orderItems = currentOrders
            .filter(o => o.payment_status === PaymentStatus.A_REGULARISER)
            .map(o => ({
                id: o.id,
                type: "offer" as const,
                userName: o.user_name || "Membre",
                itemName: o.offer_name || o.offer_snap_name || "Offre",
                priceCents: o.price_cents || 0,
                date: new Date(o.created_at || o.start_date),
            }));

        const eventItems = eventRegistrations
            .filter(r => r.payment_status === PaymentStatus.A_REGULARISER)
            .map(r => ({
                id: r.id,
                type: "event" as const,
                userName: r.user_name || "Membre",
                itemName: r.event_title || "Événement",
                priceCents: r.price_paid_cents || 0,
                date: new Date(r.created_at),
            }));

        return [...orderItems, ...eventItems].sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [currentOrders, eventRegistrations]);

    // 5b. Payments pending (all periods, combining orders and events)
    const pendingPayments = useMemo(() => {
        const orderItems = currentOrders
            .filter(o => o.payment_status === PaymentStatus.EN_ATTENTE)
            .map(o => ({
                id: o.id,
                type: "offer" as const,
                userName: o.user_name || "Membre",
                itemName: o.offer_name || o.offer_snap_name || "Offre",
                priceCents: o.price_cents || 0,
                date: new Date(o.created_at || o.start_date),
            }));

        const eventItems = eventRegistrations
            .filter(r => r.payment_status === PaymentStatus.EN_ATTENTE)
            .map(r => ({
                id: r.id,
                type: "event" as const,
                userName: r.user_name || "Membre",
                itemName: r.event_title || "Événement",
                priceCents: r.price_paid_cents || 0,
                date: new Date(r.created_at),
            }));

        return [...orderItems, ...eventItems].sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [currentOrders, eventRegistrations]);

    // 5c. Payments to validate (all periods, combining orders and events)
    const toValidatePayments = useMemo(() => {
        const orderItems = currentOrders
            .filter(o => o.payment_status === PaymentStatus.A_VALIDER)
            .map(o => ({
                id: o.id,
                type: "offer" as const,
                userName: o.user_name || "Membre",
                itemName: o.offer_name || o.offer_snap_name || "Offre",
                priceCents: o.price_cents || 0,
                date: new Date(o.created_at || o.start_date),
            }));

        const eventItems = eventRegistrations
            .filter(r => r.payment_status === PaymentStatus.A_VALIDER)
            .map(r => ({
                id: r.id,
                type: "event" as const,
                userName: r.user_name || "Membre",
                itemName: r.event_title || "Événement",
                priceCents: r.price_paid_cents || 0,
                date: new Date(r.created_at),
            }));

        return [...orderItems, ...eventItems].sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [currentOrders, eventRegistrations]);

    // 6. Refunded payments (current selected month or range, combining orders and events)
    const refundedPayments = useMemo(() => {
        const orderItems = currentOrders
            .filter(o => o.payment_status === PaymentStatus.REMBOURSE)
            .map(o => ({
                id: o.id,
                type: "offer" as const,
                userName: o.user_name || "Membre",
                itemName: o.offer_name || o.offer_snap_name || "Offre",
                priceCents: o.price_cents || 0,
                date: new Date(o.updated_at || o.created_at),
            }));

        const eventItems = eventRegistrations
            .filter(r => r.payment_status === PaymentStatus.REMBOURSE)
            .map(r => ({
                id: r.id,
                type: "event" as const,
                userName: r.user_name || "Membre",
                itemName: r.event_title || "Événement",
                priceCents: r.price_paid_cents || 0,
                date: new Date(r.created_at),
            }));

        const combined = [...orderItems, ...eventItems];

        return combined.filter(item => {
            const date = item.date;
            if (isGlobalView) {
                const rangeStart = new Date(customStartDate + "T00:00:00");
                const rangeEnd = new Date(customEndDate + "T23:59:59");
                return date >= rangeStart && date <= rangeEnd;
            } else {
                return date.getMonth() + 1 === selectedMonth && date.getFullYear() === selectedYear;
            }
        }).sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [currentOrders, eventRegistrations, selectedMonth, selectedYear, isGlobalView, customStartDate, customEndDate]);

    // 7. Average satisfaction score
    const avgSatisfaction = useMemo(() => {
        const votes = campaigns.filter(c => c.average_rating !== null);
        if (votes.length === 0) return null;
        const total = votes.reduce((sum, c) => sum + c.average_rating, 0);
        return Math.round((total / votes.length) * 10) / 10;
    }, [campaigns]);

    // 8. Recent Activities (Latest 5 orders or event registrations)
    const recentActivities = useMemo(() => {
        const orderItems = currentOrders.map(o => ({
            id: o.id,
            type: "offer" as const,
            userName: o.user_name || "Membre",
            itemName: o.offer_name || o.offer_snap_name || "Offre",
            date: new Date(o.created_at || o.start_date),
            priceCents: o.price_cents || 0,
            status: o.payment_status
        }));

        const eventItems = eventRegistrations.map(r => ({
            id: r.id,
            type: "event" as const,
            userName: r.user_name || "Membre",
            itemName: r.event_title || "Évènement",
            date: new Date(r.created_at),
            priceCents: r.price_paid_cents || 0,
            status: r.payment_status
        }));

        return [...orderItems, ...eventItems]
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, 5);
    }, [currentOrders, eventRegistrations]);

    // 9. Recent sent email campaigns (Simulated Newsletter/Infos)
    const recentEmailsMock = useMemo(() => {
        const today = new Date();
        const email1Date = new Date(today.getTime() - 9 * 24 * 60 * 60 * 1000); // 9 days ago
        const email2Date = new Date(today.getTime() - 18 * 24 * 60 * 60 * 1000); // 18 days ago
        
        return [
            { id: "e1", title: "Rentrée de printemps & planning de Juin", type: "Newsletter", date: email1Date },
            { id: "e2", title: "Horaires des jours fériés de Mai", type: "Infos pratiques", date: email2Date }
        ];
    }, []);

    const daysSinceLastEmail = useMemo(() => {
        if (recentEmailsMock.length === 0) return null;
        const lastEmailDate = recentEmailsMock[0].date;
        const diffTime = Math.abs(new Date().getTime() - lastEmailDate.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }, [recentEmailsMock]);

    // Marketing segment calculations for display
    const totalSegmentUsers = useMemo(() => {
        return Object.values(currentSegments).reduce((a: any, b: any) => a + b, 0) as number;
    }, [currentSegments]);

    const primaryColor = tenant?.primary_color || "#2563eb";

    if (loading) {
        return (
            <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-[100]">
                <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-slate-400 font-semibold text-xs tracking-wider uppercase animate-pulse">Chargement de la console d&apos;analyse...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            <Sidebar user={user} tenant={tenant} />

            <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                <div className="max-w-7xl mx-auto space-y-8">
                    
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-2">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
                                    📊 Tableau de bord
                                </h1>
                            </div>
                            <p className="text-base font-normal text-slate-500 mt-1">
                                Piloter l&apos;activité opérationnelle de votre établissement
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-3 flex-wrap">
                            {/* Period selectors based on view mode */}
                            {isGlobalView ? (
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200/50 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 pl-3 pr-1">Du</span>
                                    <input 
                                        type="date" 
                                        value={customStartDate} 
                                        onChange={(e) => setCustomStartDate(e.target.value)}
                                        className="bg-white text-xs font-semibold text-slate-700 px-2.5 py-1 rounded-xl focus:outline-none border border-slate-200/60 cursor-pointer"
                                    />
                                    <span className="text-[10px] uppercase font-bold text-slate-400 px-1">Au</span>
                                    <input 
                                        type="date" 
                                        value={customEndDate} 
                                        onChange={(e) => setCustomEndDate(e.target.value)}
                                        className="bg-white text-xs font-semibold text-slate-700 px-2.5 py-1 rounded-xl focus:outline-none border border-slate-200/60 cursor-pointer mr-1"
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200/50">
                                    <select 
                                        value={selectedMonth} 
                                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                        className="bg-transparent text-xs font-semibold text-slate-700 px-3 py-1.5 focus:outline-none cursor-pointer"
                                    >
                                        {monthsList.map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                    <div className="w-px h-4 bg-slate-300" />
                                    <select 
                                        value={selectedYear} 
                                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                        className="bg-transparent text-xs font-semibold text-slate-700 px-3 py-1.5 focus:outline-none cursor-pointer"
                                    >
                                        {yearsList.map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Vue Globale Toggle button */}
                            <button
                                onClick={() => setIsGlobalView(!isGlobalView)}
                                className={`px-4 py-2.5 text-xs font-bold rounded-2xl border transition-all active:scale-95 flex items-center gap-1.5 ${
                                    isGlobalView 
                                        ? "bg-slate-900 text-white border-slate-950 shadow-md shadow-slate-900/10 hover:bg-slate-800" 
                                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                }`}
                            >
                                <span>🌐</span>
                                {isGlobalView ? "Vue Mensuelle" : "Vue Globale (date à date)"}
                            </button>
                        </div>
                    </div>

                    {/* Offres, planning et activité */}
                    <div className="space-y-4">
                        <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest px-1">Offres, planning et activité</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Offres actives */}
                            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Offres actives</p>
                                    <p className="text-3xl font-bold text-slate-900">{totalActiveOffers}</p>
                                    <p className="text-[10px] text-slate-500 font-medium">
                                        {isGlobalView ? "En cours de validité sur la période" : "En cours de validité ce mois"}
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                    🏷️
                                </div>
                            </div>

                            {/* Séances programmées */}
                            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Séances programmées</p>
                                    <p className="text-3xl font-bold text-slate-900">{currentSessions.filter(s => s.is_active !== false).length}</p>
                                    <p className="text-[10px] text-slate-500 font-medium">Créneaux planifiés ce mois</p>
                                </div>
                                <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                    📅
                                </div>
                            </div>

                            {/* Taux d'occupation */}
                            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Taux d&apos;occupation</p>
                                    <p className="text-3xl font-bold text-slate-900">{occupancyStats.rate}%</p>
                                    <p className="text-[10px] text-slate-500 font-medium lowercase">
                                        {occupancyStats.totalBookings} réservations / {occupancyStats.totalCapacity} places
                                    </p>
                                </div>
                                <div className="relative w-16 h-16 flex items-center justify-center">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="32" cy="32" r="28" fill="transparent" stroke="#f1f5f9" strokeWidth="6" />
                                        <circle cx="32" cy="32" r="28" fill="transparent" stroke={primaryColor} strokeWidth="6" 
                                            strokeDasharray={2 * Math.PI * 28} 
                                            strokeDashoffset={2 * Math.PI * 28 * (1 - occupancyStats.rate / 100)} 
                                            strokeLinecap="round" 
                                            className="transition-all duration-1000"
                                        />
                                    </svg>
                                    <span className="absolute text-[10px] font-bold text-slate-700">📈</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Gestion de l'activité */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* Volume d'offres actives */}
                            <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                                <div className="space-y-2 mb-6">
                                    <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <span>🏷️</span> Volume d&apos;Offres Actives
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium">
                                        Répartition des forfaits en cours d&apos;utilisation sur la période
                                    </p>
                                </div>

                                {activeOffersStats.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 italic text-xs py-8">
                                        Aucune offre active trouvée sur cette période
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col gap-4 justify-center">
                                        {activeOffersStats.map((item, index) => {
                                            const pct = totalActiveOffers > 0 ? Math.round((item.count / totalActiveOffers) * 100) : 0;
                                            return (
                                                <div key={item.name} className="space-y-1">
                                                    <div className="flex justify-between items-end text-xs font-semibold">
                                                        <span className="text-slate-800 truncate max-w-[200px]">{item.name}</span>
                                                        <span className="text-slate-500 font-bold">{item.count} ({pct}%)</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full rounded-full transition-all duration-1000" 
                                                            style={{ 
                                                                width: `${pct}%`,
                                                                backgroundColor: index === 0 ? primaryColor : index === 1 ? "#6366f1" : index === 2 ? "#3b82f6" : "#a855f7" 
                                                            }} 
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>

                            {/* Charge des intervenants réguliers */}
                            <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
                                <div className="space-y-2 mb-6">
                                    <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <span>👤</span> Charge des Intervenants Réguliers
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium">
                                        Séances régulières animées sur la période (hors évènements)
                                    </p>
                                </div>

                                {instructorStats.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 italic text-xs py-8">
                                        Aucun cours programmé sur cette période
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    <th className="py-2">Intervenant</th>
                                                    <th className="py-2 text-center">Séances</th>
                                                    <th className="py-2 text-right">Heures</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {instructorStats.map((inst, i) => (
                                                    <tr key={inst.name} className="text-xs group hover:bg-slate-50 transition-colors">
                                                        <td className="py-3 font-semibold text-slate-800 flex items-center gap-2">
                                                            {i === 0 && <span title="Top intervenant">🏆</span>}
                                                            {inst.name}
                                                        </td>
                                                        <td className="py-3 text-center text-slate-600 font-medium">{inst.sessionsCount}</td>
                                                        <td className="py-3 text-right text-slate-900 font-bold">{inst.hoursCount}h</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>

                            {/* Activités récentes */}
                            <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
                                <div className="space-y-2 mb-6">
                                    <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <span>⚡</span> Activités récentes
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium">
                                        Les 5 dernières commandes d&apos;offres ou d&apos;évènements
                                    </p>
                                </div>

                                {recentActivities.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 italic text-xs py-8">
                                        Aucune activité récente enregistrée
                                    </div>
                                ) : (
                                    <div className="flex-1 space-y-3 justify-center flex flex-col">
                                        {recentActivities.map((act) => (
                                            <div key={act.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-2xl text-[11px]">
                                                <div className="space-y-0.5 truncate max-w-[170px]">
                                                    <p className="font-bold text-slate-800 truncate">{act.userName}</p>
                                                    <p className="text-slate-500 truncate">
                                                        {act.type === "offer" ? "🏷️ Offre" : "🎟️ Événement"} : <strong>{act.itemName}</strong>
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-extrabold text-slate-700">
                                                        {formatCurrency(act.priceCents)}
                                                    </span>
                                                    <p className="text-[8px] text-slate-400 mt-0.5">
                                                        {act.date.toLocaleDateString("fr-FR")}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>

                    {/* Suivi des paiements non perçus */}
                    <div className="space-y-4">
                        <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest px-1">Suivi des paiements non perçus</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            
                            {/* À régulariser */}
                            <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md transition-all">
                                <div className="border-b border-slate-100 pb-2 mb-2">
                                    <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">⚠️ À régulariser ({regularizePayments.length})</p>
                                </div>
                                <div className="flex-1 overflow-y-auto max-h-[100px] pr-1 no-scrollbar text-left">
                                    {regularizePayments.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-[10px] italic py-4">
                                            Aucun paiement en attente
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {regularizePayments.map(item => (
                                                <div key={item.id} className="flex items-center justify-between p-2 bg-rose-50/20 border border-rose-100 rounded-xl hover:bg-rose-50/50 transition-colors text-[10px]">
                                                    <div className="space-y-0.5 truncate max-w-[110px]">
                                                        <p className="font-bold text-slate-800 truncate">{item.userName}</p>
                                                        <p className="text-slate-400 truncate text-[9px]">{item.type === "offer" ? "🏷️ " : "🎟️ "}{item.itemName}</p>
                                                    </div>
                                                    <span className="font-extrabold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-lg border border-rose-100 shrink-0 text-[9px]">
                                                        {formatCurrency(item.priceCents)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* En attente de paiement */}
                            <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md transition-all">
                                <div className="border-b border-slate-100 pb-2 mb-2">
                                    <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">⏳ En attente ({pendingPayments.length})</p>
                                </div>
                                <div className="flex-1 overflow-y-auto max-h-[100px] pr-1 no-scrollbar text-left">
                                    {pendingPayments.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-[10px] italic py-4">
                                            Aucune attente de paiement
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {pendingPayments.map(item => (
                                                <div key={item.id} className="flex items-center justify-between p-2 bg-amber-50/20 border border-amber-100 rounded-xl hover:bg-amber-50/50 transition-colors text-[10px]">
                                                    <div className="space-y-0.5 truncate max-w-[110px]">
                                                        <p className="font-bold text-slate-800 truncate">{item.userName}</p>
                                                        <p className="text-slate-400 truncate text-[9px]">{item.type === "offer" ? "🏷️ " : "🎟️ "}{item.itemName}</p>
                                                    </div>
                                                    <span className="font-extrabold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-lg border border-amber-100 shrink-0 text-[9px]">
                                                        {formatCurrency(item.priceCents)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* À valider */}
                            <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md transition-all">
                                <div className="border-b border-slate-100 pb-2 mb-2">
                                    <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">📋 À valider ({toValidatePayments.length})</p>
                                </div>
                                <div className="flex-1 overflow-y-auto max-h-[100px] pr-1 no-scrollbar text-left">
                                    {toValidatePayments.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-[10px] italic py-4">
                                            Aucun paiement à valider
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {toValidatePayments.map(item => (
                                                <div key={item.id} className="flex items-center justify-between p-2 bg-indigo-50/20 border border-indigo-100 rounded-xl hover:bg-indigo-50/50 transition-colors text-[10px]">
                                                    <div className="space-y-0.5 truncate max-w-[110px]">
                                                        <p className="font-bold text-slate-800 truncate">{item.userName}</p>
                                                        <p className="text-slate-400 truncate text-[9px]">{item.type === "offer" ? "🏷️ " : "🎟️ "}{item.itemName}</p>
                                                    </div>
                                                    <span className="font-extrabold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-lg border border-indigo-100 shrink-0 text-[9px]">
                                                        {formatCurrency(item.priceCents)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Remboursés */}
                            <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md transition-all">
                                <div className="border-b border-slate-100 pb-2 mb-2">
                                    <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">🔄 Remboursés ({refundedPayments.length})</p>
                                </div>
                                <div className="flex-1 overflow-y-auto max-h-[100px] pr-1 no-scrollbar text-left">
                                    {refundedPayments.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-[10px] italic py-4">
                                            Aucun remboursement
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {refundedPayments.map(item => (
                                                <div key={item.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200/50 rounded-xl text-[10px]">
                                                    <div className="space-y-0.5 truncate max-w-[110px]">
                                                        <p className="font-bold text-slate-800 truncate">{item.userName}</p>
                                                        <p className="text-slate-400 truncate text-[9px]">{item.type === "offer" ? "🏷️ " : "🎟️ "}{item.itemName}</p>
                                                    </div>
                                                    <span className="font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-lg border border-slate-200 shrink-0 text-[9px]">
                                                        -{formatCurrency(item.priceCents)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>

                        </div>
                    </div>

                    {/* Suivi de la base utilisateur */}
                    <div className="space-y-4">
                        <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest px-1">Suivi de la base utilisateur</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* Left Column: Key User Indicators */}
                            <div className="flex flex-col gap-4 lg:col-span-1">
                                {/* Prospects card */}
                                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                                    <div>
                                        <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Prospects</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{currentSegments.explorateur || 0}</p>
                                        <p className="text-[10px] text-slate-500 font-medium">Nombre de personnes ayant créé un compte</p>
                                    </div>
                                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-lg">
                                        🔍
                                    </div>
                                </div>

                                {/* Découverte card */}
                                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                                    <div>
                                        <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Découvertes</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{currentSegments.decouverte || 0}</p>
                                        <p className="text-[10px] text-slate-500 font-medium">Nombre de personnes ayant passé une commande</p>
                                    </div>
                                    <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-lg">
                                        🏷️
                                    </div>
                                </div>

                                {/* Actifs card */}
                                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                                    <div>
                                        <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Actifs</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{currentSegments.regulier || 0}</p>
                                        <p className="text-[10px] text-slate-500 font-medium">Nombre de personnes ayant renouvelé une commande</p>
                                    </div>
                                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-lg">
                                        👥
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Répartition des utilisateurs (Cockpit) */}
                            <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-2 flex flex-col justify-between">
                                <div className="space-y-2 mb-6">
                                    <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <span>👥</span> Répartition des utilisateurs
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium">
                                        État comportemental de vos {totalSegmentUsers} membres enregistrés
                                    </p>
                                </div>

                                {/* Segmentation Visual representation */}
                                {totalSegmentUsers === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 italic text-xs py-8">
                                        Aucun membre enregistré
                                    </div>
                                ) : (
                                    <div className="space-y-4 flex-1 flex flex-col justify-center">
                                        {[
                                            { label: "Actif", key: "regulier", color: "bg-emerald-500", text: "text-emerald-600", desc: "Commande en cours - inscriptions régulières" },
                                            { label: "Visiteur", key: "flexible", color: "bg-blue-500", text: "text-blue-600", desc: "Aucune commande en cours - vient de temps en temps" },
                                            { label: "Distant", key: "endormi", color: "bg-rose-500", text: "text-rose-600", desc: "Commande en cours - absence prolongée (+21 jrs)" },
                                            { label: "Découverte", key: "decouverte", color: "bg-indigo-500", text: "text-indigo-600", desc: "Une commande passée - aucune réservation à venir" },
                                            { label: "Prospect", key: "explorateur", color: "bg-amber-500", text: "text-amber-600", desc: "Compte créé - aucune commande" },
                                            { label: "Inactif", key: "ancien", color: "bg-slate-400", text: "text-slate-400", desc: "N'a pas repris de commande depuis + de 60jrs" },
                                        ].map((segment) => {
                                            const value = currentSegments[segment.key] || 0;
                                            const pct = totalSegmentUsers > 0 ? Math.round((value / totalSegmentUsers) * 100) : 0;
                                            return (
                                                <div key={segment.key} className="space-y-1">
                                                    <div className="flex justify-between items-center text-xs font-semibold">
                                                        <span className="text-slate-700 flex items-center gap-1.5">
                                                            <span className={`w-2 h-2 rounded-full ${segment.color}`} />
                                                            {segment.label}
                                                            <span className="text-[10px] text-slate-400 font-normal">({segment.desc})</span>
                                                        </span>
                                                        <span className={segment.text}>{value} ({pct}%)</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                                                        <div className={`h-full ${segment.color} rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Smart Insight */}
                                <div className="mt-6 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-start gap-3">
                                    <span className="text-base mt-0.5">📢</span>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-blue-800">Fidélisation & Engagement</p>
                                        <p className="text-[10px] text-slate-600 leading-tight">
                                            Mobiliser et fédérer vos utilisateurs en leur envoyant des mails marketings ciblés.
                                        </p>
                                        <Link 
                                            href={`/${slug}/admin/emails`}
                                            className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1 mt-1"
                                        >
                                            Communication & marketing <span>→</span>
                                        </Link>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>

                    {/* Communication et retours */}
                    <div className="space-y-4">
                        <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest px-1">Communication et retours</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* Left Column: Sent custom emails */}
                            <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-2 flex flex-col justify-between">
                                <div className="space-y-2 mb-6">
                                    <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <span>📧</span> Derniers e-mails envoyés
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium">
                                        Historique des newsletters et informations pratiques
                                    </p>
                                </div>

                                <div className="flex-1 space-y-4 justify-center flex flex-col">
                                    {recentEmailsMock.map((email) => (
                                        <div key={email.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between text-xs">
                                            <div className="space-y-1 truncate max-w-[350px]">
                                                <p className="font-bold text-slate-800 truncate">{email.title}</p>
                                                <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                                                    {email.type}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-normal">
                                                Envoyé le {email.date.toLocaleDateString("fr-FR")}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Communication alert */}
                                {daysSinceLastEmail && daysSinceLastEmail > 7 && (
                                    <div className="mt-6 p-4 bg-amber-50/50 border border-amber-100 rounded-2xl flex items-start gap-3 animate-pulse">
                                        <span className="text-base mt-0.5">🔔</span>
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-amber-800">Manque de communication</p>
                                            <p className="text-[10px] text-slate-600 leading-tight">
                                                Vos utilisateurs n&apos;ont pas eu de vos nouvelles depuis {daysSinceLastEmail} jours, voulez-vous leur envoyer une communication ?
                                            </p>
                                            <Link 
                                                href={`/${slug}/admin/emails`}
                                                className="text-[10px] font-bold text-amber-600 hover:underline flex items-center gap-1 mt-1"
                                            >
                                                Envoyer une communication <span>→</span>
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* Right Column: Customer satisfaction */}
                            <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                                <div className="space-y-2 mb-4">
                                    <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <span>💬</span> Satisfaction & Retours
                                    </h3>
                                    <div className="flex items-center justify-between pt-1">
                                        <p className="text-[11px] text-slate-400 font-medium">Enquêtes de satisfaction</p>
                                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                            ⭐ {avgSatisfaction !== null ? `${avgSatisfaction}/5` : "—"}
                                        </span>
                                    </div>
                                </div>

                                {currentComments.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 italic text-xs py-8">
                                        Aucun commentaire de satisfaction récent
                                    </div>
                                ) : (
                                    <div className="flex-1 space-y-3 justify-center flex flex-col">
                                        {currentComments.slice(0, 3).map((c, i) => (
                                            <div key={c.id || i} className="p-2.5 bg-slate-50 rounded-2xl border border-slate-100 relative group hover:bg-slate-100/30 transition-colors">
                                                <div className="flex justify-between items-start mb-1 text-[10px]">
                                                    <span className="font-bold text-slate-800 truncate max-w-[120px]">{c.userName}</span>
                                                    <span className="text-amber-500 font-bold">{"★".repeat(c.rating)}</span>
                                                </div>
                                                <p className="text-[10px] text-slate-600 leading-snug italic font-normal line-clamp-2">
                                                    &ldquo;{c.comment}&rdquo;
                                                </p>
                                                <p className="text-[8px] text-slate-400 mt-1 text-right truncate">
                                                    {c.campaignTitle}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                        </div>
                    </div>

                </div>
            </main>

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
