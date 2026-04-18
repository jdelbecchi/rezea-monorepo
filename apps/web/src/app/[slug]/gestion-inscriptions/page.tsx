"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User, Session, AdminBookingItem, AdminEventRegistrationItem, Tenant } from "@/lib/api";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  getDay,
  startOfWeek,
  endOfWeek,
  parseISO
} from "date-fns";
import { fr } from "date-fns/locale";

export default function GestionInscriptionsPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    
    // Data
    const [sessions, setSessions] = useState<Session[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedItem, setSelectedItem] = useState<{ type: 'session' | 'event', data: any } | null>(null);
    const [participants, setParticipants] = useState<(AdminBookingItem | AdminEventRegistrationItem)[]>([]);
    const [loadingParticipants, setLoadingParticipants] = useState(false);
    const [locationFilter, setLocationFilter] = useState<string>('all');

    // Modals & UX
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showEditSessionModal, setShowEditSessionModal] = useState(false);
    const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(null);
    const [confirmingReactivateId, setConfirmingReactivateId] = useState<string | null>(null);
    const [restorationErrorUsers, setRestorationErrorUsers] = useState<string[] | null>(null);
    const [viewingContact, setViewingContact] = useState<AdminBookingItem | AdminEventRegistrationItem | null>(null);

    // Form for editing session
    const [editFormData, setEditFormData] = useState({
        title: "",
        description: "",
        instructor_name: "",
        location: "",
        time: "",
        duration_minutes: 60,
        max_participants: 10,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userData, tenantData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getTenantSettings()
                ]);
                if (userData.role === "user") {
                    router.push(`/${params.slug}/home`);
                    return;
                }
                setUser(userData);
                setTenant(tenantData);
                await loadMonthData(currentMonth);
            } catch (err) {
                console.error(err);
                router.push("/login");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router, currentMonth]);

    const loadMonthData = async (date: Date) => {
        const start = format(startOfMonth(date), "yyyy-MM-dd") + "T00:00:00";
        const end = format(endOfMonth(date), "yyyy-MM-dd") + "T23:59:59";
        try {
            const [sessionsData, eventsData] = await Promise.all([
                api.getSessions({ 
                    start_date: start, 
                    end_date: end, 
                    status: 'all' 
                }),
                api.getAdminEvents()
            ]);
            setSessions(sessionsData);
            setEvents(eventsData.filter((e: any) => {
                const d = parseISO(e.event_date);
                return d >= startOfMonth(date) && d <= endOfMonth(date);
            }));
        } catch (err) {
            console.error("Failed to load month data", err);
        }
    };

    // Calendar logic
    const calendarDays = useMemo(() => {
        const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
        return eachDayOfInterval({ start, end });
    }, [currentMonth]);

    const itemsForDay = (day: Date) => {
        let daySessions = sessions.filter(s => isSameDay(parseISO(s.start_time), day));
        let dayEvents = events.filter(e => isSameDay(parseISO(e.event_date), day));
        
        if (locationFilter !== 'all') {
            daySessions = daySessions.filter(s => s.location === locationFilter);
            dayEvents = dayEvents.filter(e => e.location === locationFilter);
        }
        
        return { sessions: daySessions, events: dayEvents };
    };

    const handleSelectDay = (day: Date) => {
        setSelectedDate(day);
    };

    const loadParticipants = async (item: any, type: 'session' | 'event') => {
        setLoadingParticipants(true);
        try {
            if (type === 'session') {
                const regs = await api.getAdminBookings({ session_id: item.id });
                // En mode session annulée, on veut voir les "session_cancelled"
                // En mode session active, on les ignore pour ne pas polluer avec d'anciennes annulations
                if (item.is_active === false) {
                    setParticipants(regs.filter(r => r.status === 'session_cancelled' || r.status === 'absent' || r.status === 'confirmed'));
                } else {
                    setParticipants(regs.filter(r => r.status !== 'cancelled' && r.status !== 'session_cancelled'));
                }
            } else {
                const regs = await api.getAdminEventRegistrations({ event_id: item.id });
                setParticipants(regs.filter(r => r.status !== 'cancelled' && r.status !== 'event_deleted'));
            }
        } catch (err) {
            console.error("Failed to load participants", err);
        } finally {
            setLoadingParticipants(false);
        }
    };

    const handleToggleParticipants = async (item: any, type: 'session' | 'event') => {
        if (expandedId === item.id) {
            setExpandedId(null);
            return;
        }
        
        setExpandedId(item.id);
        setSelectedItem({ type, data: item });
        await loadParticipants(item, type);
    };

    const handleOpenEditSession = async (item: any) => {
        const s = item;
        setSelectedItem({ type: 'session', data: s });
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        const duration = Math.round((end.getTime() - start.getTime()) / 60000);
        
        setEditFormData({
            title: s.title,
            description: s.description || "",
            instructor_name: s.instructor_name || "",
            location: s.location || "",
            time: format(start, "HH:mm"),
            duration_minutes: duration,
            max_participants: s.max_participants,
        });

        // Charger les participants pour le bouton mail groupé si besoin
        if (s.current_participants > 0) {
            try {
                const regs = await api.getAdminBookings({ session_id: s.id });
                setParticipants(regs.filter(r => r.status !== 'cancelled' && r.status !== 'session_cancelled'));
            } catch (err) {
                console.error("Failed to load participants for modal", err);
            }
        } else {
            setParticipants([]);
        }

        setShowEditSessionModal(true);
    };

    const handleUpdateSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem || selectedItem.type !== 'session') return;
        try {
            const dateStr = format(new Date(selectedItem.data.start_time), "yyyy-MM-dd");
            const startDt = new Date(`${dateStr}T${editFormData.time}:00`);
            const endDt = new Date(startDt.getTime() + editFormData.duration_minutes * 60 * 1000);

            await api.updateSession(selectedItem.data.id, {
                title: editFormData.title,
                description: editFormData.description,
                instructor_name: editFormData.instructor_name,
                location: editFormData.location,
                start_time: startDt.toISOString(),
                end_time: endDt.toISOString(),
                max_participants: editFormData.max_participants,
            } as any);

            setShowEditSessionModal(false);
            await loadMonthData(currentMonth);
        } catch (err) {
            alert("Erreur lors de la modification");
        }
    };

    const handleCancelSession = async (item: any) => {
        // Au premier clic, on passe en mode confirmation inline
        if (confirmingSessionId !== item.id) {
            setConfirmingSessionId(item.id);
            return;
        }

        // Au second clic (confirmation), on effectue l'action
        try {
            await api.cancelSession(item.id);
            setConfirmingSessionId(null);
            await loadMonthData(currentMonth);
        } catch (err) {
            alert("Erreur lors de l'annulation");
        }
    };

    const handleReactivateSession = async (item: any) => {
        if (confirmingReactivateId !== item.id) {
            setConfirmingReactivateId(item.id);
            return;
        }

        try {
            await api.reactivateSession(item.id);
            setConfirmingReactivateId(null);
            
            // Recharger les données du mois
            await loadMonthData(currentMonth);
            
            // Vérifier s'il reste des gens en "session_cancelled" (échec de restauration)
            const regs = await api.getAdminBookings({ session_id: item.id });
            const failed = regs.filter(r => r.status === 'session_cancelled');
            if (failed.length > 0) {
                setRestorationErrorUsers(failed.map(f => f.user_name));
            }

            // Rafraîchir les participants affichés si besoin
            if (expandedId === item.id) {
                await loadParticipants(item, 'session');
            }
        } catch (err) {
            alert("Erreur lors du rétablissement de la séance");
        }
    };

    const handleContactEmail = (participantIds: string[]) => {
        router.push(`/${params.slug}/admin/emails?recipientIds=${participantIds.join(',')}`);
    };

    const handleMarkAbsent = async (participant: any, type: 'session' | 'event') => {
        try {
            const nextStatus = participant.status === 'absent' ? 'confirmed' : 'absent';
            if (type === 'session') {
                await api.updateAdminBooking(participant.id, { status: nextStatus });
            } else {
                await api.updateAdminEventRegistration(participant.id, { status: nextStatus });
            }
            // Refresh participants without toggling the whole UI
            if (selectedItem) {
                await loadParticipants(selectedItem.data, type);
            }
        } catch (err) {
            alert("Erreur lors de la mise à jour");
        }
    };

    const handleViewContact = (p: AdminBookingItem | AdminEventRegistrationItem) => {
        setViewingContact(p);
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-white text-slate-400">Chargement...</div>;

    const selectedDayItems = itemsForDay(selectedDate);
    const hasItems = selectedDayItems.sessions.length > 0 || selectedDayItems.events.length > 0;

    return (
        <div className="bg-white flex flex-col min-h-screen pb-20 md:pb-0 overflow-x-hidden">

            {/* Header Mobile - PWA Style */}
            <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center justify-between px-4 h-14 safe-top shadow-sm md:hidden">
                <Link href={`/${params.slug}/home`} className="flex items-center gap-2 group text-slate-400 active:scale-95 transition-all">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 ml-0.5" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-[13px] font-medium leading-none">Retour</span>
                </Link>
                <div className="w-10" /> {/* Spacer */}
            </header>

            <main className="flex-1 px-5 pb-5 md:p-12 pt-16 md:pt-14">
                <div className="max-w-6xl mx-auto">
                    {/* Header Desktop - Breadcrumb Style */}
                    <div className="hidden md:flex items-center justify-between mb-10">
                        <Link href={`/${params.slug}/home`} className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group">
                            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 transition-transform group-hover:-translate-x-1" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span className="leading-none">Retour</span>
                        </Link>
                    </div>

                    <div className="md:grid md:grid-cols-[320px_1fr] md:gap-10 items-start">
                        {/* Colonne Gauche: Calendrier */}
                        <aside className="md:sticky md:top-14 space-y-6">
                            <header className="px-1 space-y-1">
                                <h1 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight flex items-center gap-2">
                                    <span className="text-2xl md:text-3xl">📝</span> Gestion des inscriptions
                                </h1>
                                <p className="text-slate-500 font-medium text-[11px] md:text-xs">Gérez vos séances et participants</p>
                            </header>

                            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-1.5 md:p-2">
                                <div className="flex items-center justify-between mb-1 px-2">
                                    <h2 className="font-semibold text-slate-800 capitalize text-[13px] md:text-sm">
                                        {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                                    </h2>
                                    <div className="flex gap-1">
                                        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">←</button>
                                        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">→</button>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-7 gap-0.5 md:gap-1">
                                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => (
                                        <div key={i} className="text-center text-[9px] md:text-[10px] font-bold text-slate-400 py-1 uppercase tracking-tight">{day}</div>
                                    ))}
                                    {calendarDays.map((day, i) => {
                                        const { sessions: sCount, events: eCount } = itemsForDay(day);
                                        const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                                        const isToday = isSameDay(day, new Date());
                                        const isSelected = isSameDay(day, selectedDate);
                                        const clubColor = tenant?.primary_color;
                                        if (!clubColor && isToday && !isSelected) {
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => handleSelectDay(day)}
                                                    className="relative py-2 md:py-0 rounded-xl text-xs md:text-sm transition-all flex flex-col items-center justify-center md:aspect-square hover:bg-slate-50 text-slate-700 font-bold"
                                                >
                                                    <span>{day.getDate()}</span>
                                                    <div className="absolute bottom-1 w-3 md:w-5 h-[2px] rounded-full bg-slate-200" />
                                                </button>
                                            );
                                        }
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handleSelectDay(day)}
                                                className={`
                                                    relative py-2 md:py-0 rounded-xl text-xs md:text-sm transition-all flex flex-col items-center justify-center md:aspect-square
                                                    ${!isCurrentMonth ? 'opacity-20' : 'opacity-100'}
                                                    ${isSelected ? 'shadow-lg text-white font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'}
                                                `}
                                                style={{ 
                                                    backgroundColor: isSelected ? (clubColor || '#cbd5e1') : undefined,
                                                    color: isSelected ? 'white' : (isToday && !isSelected ? (clubColor || '#94a3b8') : undefined)
                                                }}
                                            >
                                                <span>{day.getDate()}</span>
                                                {isToday && (
                                                    <div className={`absolute bottom-1 w-3 md:w-5 h-[2px] rounded-full ${isSelected ? 'bg-white' : ''}`} 
                                                         style={{ backgroundColor: !isSelected ? (clubColor || '#cbd5e1') : undefined }}
                                                    />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </aside>

                        {/* Colonne Droite: Activités du jour */}
                        <div className="space-y-3 pt-4 md:pt-2">
                            <h3 className="text-sm font-medium text-slate-400 px-1">
                                {format(selectedDate, "eeee d MMMM", { locale: fr })}
                            </h3>

                            {/* Filtres par lieu (chips) */}
                            {tenant?.locations && tenant.locations.length > 1 && (
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                                    <button
                                        onClick={() => setLocationFilter('all')}
                                        className={`px-4 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all border ${
                                            locationFilter === 'all' 
                                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                                            : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'
                                        }`}
                                    >
                                        Toutes les salles
                                    </button>
                                    {tenant.locations.map((loc) => (
                                        <button
                                            key={loc}
                                            onClick={() => setLocationFilter(loc)}
                                            className={`px-4 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all border ${
                                                locationFilter === loc 
                                                ? 'bg-violet-600 text-white border-violet-600 shadow-sm' 
                                                : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'
                                            }`}
                                        >
                                            {loc}
                                        </button>
                                    ))}
                                </div>
                            )}
                            
                            {!hasItems ? (
                                <div className="bg-white rounded-3xl p-16 text-center border border-dashed border-slate-200">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                      <span className="text-3xl">🎈</span>
                                    </div>
                                    <p className="text-slate-400 font-medium text-xs tracking-wide">Aucune activité au programme.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Séances */}
                                    {selectedDayItems.sessions.map((session) => {
                                        const ratio = session.current_participants / session.max_participants;
                                        const isHighAttendance = ratio >= 0.6;
                                        const isExpanded = expandedId === session.id;
                                        
                                        return (
                                            <div 
                                                key={session.id} 
                                                className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden group transition-all hover:border-violet-100 ${!session.is_active ? 'opacity-50' : ''}`}
                                            >
                                                {/* Entête Séance */}
                                                <div className="p-4 md:p-5">
                                                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                        {/* Ligne 1: Heure + Titre + Actions (OU Confirmation Zen) */}
                                                        <div className="flex items-center justify-between gap-3 min-w-0 pr-2">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                 <span className="text-slate-900 font-semibold text-sm md:text-base shrink-0">
                                                                    {format(new Date(session.start_time), "HH:mm")}
                                                                </span>
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <h4 className="font-medium text-sm md:text-base text-slate-800 first-letter:uppercase leading-tight">
                                                                        {session.title}
                                                                    </h4>
                                                                    {!session.is_active && (
                                                                      <span className="text-[10px] bg-rose-50 text-rose-500 px-2 py-0.5 rounded-lg font-medium shrink-0 border border-rose-100">Annulée</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="flex items-center">
                                                                {confirmingSessionId === session.id ? (
                                                                    <div className="flex items-center gap-3 shrink-0 animate-in fade-in slide-in-from-right-2 duration-300">
                                                                        <span className="text-[10px] font-medium text-rose-500 tracking-tight">
                                                                            <span className="sm:hidden">Annuler ?</span>
                                                                            <span className="hidden sm:inline text-[11px]">Annuler cette séance ?</span>
                                                                        </span>
                                                                        <div className="flex items-center gap-2">
                                                                            <button 
                                                                                onClick={() => setConfirmingSessionId(null)}
                                                                                className="px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-slate-600 tracking-widest transition-colors"
                                                                            >
                                                                                Non
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => handleCancelSession(session)}
                                                                                className="px-3 py-1 bg-rose-500 text-white rounded-full text-[9px] font-medium tracking-widest hover:bg-rose-600 transition-all shadow-sm shadow-rose-100 active:scale-95"
                                                                            >
                                                                                Oui
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : session.is_active ? (
                                                                    <>
                                                                        <button 
                                                                            onClick={() => handleOpenEditSession(session)}
                                                                            className="p-1 hover:bg-slate-50 rounded-lg text-slate-300 hover:text-slate-600 transition-colors"
                                                                            title="Modifier"
                                                                        >
                                                                            <span className="text-xs">✏️</span>
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleCancelSession(session)}
                                                                            className="p-1 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors"
                                                                            title="Annuler"
                                                                        >
                                                                            <span className="text-xs">🚫</span>
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <div className="flex items-center">
                                                                        {confirmingReactivateId === session.id ? (
                                                                            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-2 duration-300">
                                                                                <span className="text-[10px] font-medium text-violet-600 tracking-tight">Rétablir ?</span>
                                                                                <div className="flex items-center gap-2">
                                                                                    <button onClick={() => setConfirmingReactivateId(null)} className="text-[10px] font-medium text-slate-400">Non</button>
                                                                                    <button 
                                                                                        onClick={() => handleReactivateSession(session)}
                                                                                        className="px-3 py-1 bg-violet-600 text-white rounded-full text-[9px] font-medium tracking-widest"
                                                                                    >
                                                                                        Oui
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <button 
                                                                                onClick={() => handleReactivateSession(session)}
                                                                                className="p-1 hover:bg-violet-50 rounded-lg text-slate-300 hover:text-violet-600 transition-colors"
                                                                                title="Rétablir la séance"
                                                                            >
                                                                                <span className="text-xs">🔄</span>
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Ligne 2: Attribution + Remplissage + Voir */}
                                                        <div className="flex items-center justify-between gap-4 text-[11px] md:text-sm font-medium pr-2 w-full">
                                                            <div className="flex items-center gap-4 min-w-0">
                                                                <span className="truncate text-slate-400 flex items-center gap-1.5 min-w-0">
                                                                    <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                    </svg>
                                                                    <span className="truncate">{session.instructor_name || "Coach"}</span>
                                                                    {session.location && (
                                                                        <>
                                                                            <span className="text-slate-200">•</span>
                                                                            <span className="truncate flex items-center gap-1">
                                                                                <span className="text-[10px]">📍</span> {session.location}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </span>
                                                                
                                                                <span className={`font-medium shrink-0 ${isHighAttendance ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                                  {session.current_participants}/{session.max_participants}
                                                                </span>
                                                            </div>

                                                            <button 
                                                                onClick={() => handleToggleParticipants(session, 'session')}
                                                                className="text-slate-700 italic font-medium hover:text-slate-900 transition-colors focus:outline-none shrink-0"
                                                            >
                                                                → {isExpanded ? 'Fermer la liste' : 'Voir les participants'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Inscriptions Inline fusionnées */}
                                                {isExpanded && (
                                                    <div className="animate-in slide-in-from-top-2 duration-300">
                                                        <div className="border-t border-slate-50" />
                                                        <div className="bg-slate-50/40 p-4 md:p-5 space-y-2">
                                                            {loadingParticipants ? (
                                                                <div className="py-8 text-center text-slate-300 font-medium text-[11px] animate-pulse tracking-widest">Récupération des inscrits...</div>
                                                            ) : (
                                                                <>
                                                                    {participants.length === 0 ? (
                                                                        <div className="py-8 text-center text-slate-300 text-[10px] font-medium italic">Aucun inscrit pour le moment.</div>
                                                                    ) : (
                                                                        <div className="space-y-1.5">
                                                                            {participants.sort((a,b) => (a.user_name || '').localeCompare(b.user_name || '')).map((p) => {
                                                                                const isWaitlist = p.status === 'pending' || (p as any).status === 'waiting_list';
                                                                                const hasWarning = p.has_pending_order;
                                                                                
                                                                                return (
                                                                                    <div key={p.id} className="bg-white/80 rounded-2xl border border-slate-100/50 p-2 pl-4 flex items-center justify-between group/p">
                                                                                        <div className="flex items-center gap-3 min-w-0">
                                                                                            <div className={`w-2 h-2 rounded-full shrink-0 ${hasWarning ? 'bg-orange-500' : (p.status === 'absent' ? 'bg-slate-300' : (isWaitlist ? 'bg-slate-300' : 'bg-emerald-500'))}`} />
                                                                                            <span className={`truncate text-xs tracking-tight ${isWaitlist ? 'text-slate-400 font-medium' : 'text-slate-700 font-bold'}`}>
                                                                                                {p.user_name}
                                                                                            </span>
                                                                                            {p.status === 'session_cancelled' && (
                                                                                                <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md font-medium">Session annulée</span>
                                                                                            )}
                                                                                        </div>
                                                                                        
                                                                                        <div className="flex items-center gap-1">
                                                                                            <button 
                                                                                                onClick={() => handleMarkAbsent(p, 'session')}
                                                                                                className={`w-7 h-7 flex items-center justify-center border rounded-full transition-all active:scale-95 ${p.status === 'absent' ? 'bg-rose-500 border-rose-500 text-white' : 'bg-slate-50 border-slate-100 text-slate-300 hover:text-rose-500 hover:bg-rose-50'}`}
                                                                                                title={p.status === 'absent' ? "Présent" : "Signaler absent"}
                                                                                            >
                                                                                                <span className="text-[10px]">{p.status === 'absent' ? '✖' : '👤'}</span>
                                                                                            </button>
                                                                                            <button 
                                                                                                onClick={() => handleViewContact(p)}
                                                                                                className="w-7 h-7 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-full text-slate-300 hover:text-slate-600 transition-all hover:bg-slate-100 active:scale-95"
                                                                                                title="Consulter le contact"
                                                                                            >
                                                                                                <span className="text-[10px]">📞</span>
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    
                                    {/* Événements */}
                                    {selectedDayItems.events.map((event) => {
                                        const ratio = event.registrations_count / event.max_places;
                                        const isHighAttendance = ratio >= 0.6;
                                        const isExpanded = expandedId === event.id;

                                        return (
                                            <div 
                                                key={event.id} 
                                                className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden group transition-all hover:border-amber-100 ${event.cancelled_at ? 'opacity-50' : ''}`}
                                            >
                                                {/* Entête Événement */}
                                                <div className="p-4 md:p-5">
                                                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                        {/* Ligne 1: Heure + Titre */}
                                                        <div className="flex items-center justify-between gap-3 min-w-0 pr-2">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                 <span className="text-slate-900 font-semibold text-sm md:text-base shrink-0">
                                                                    {event.event_time}
                                                                </span>
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <h4 className="font-medium text-sm md:text-base text-slate-800 first-letter:uppercase leading-tight">
                                                                        {event.title}
                                                                    </h4>
                                                                    <span className="text-sm shrink-0">✨</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Ligne 2: Attribution + Remplissage + Voir */}
                                                        <div className="flex items-center justify-between gap-4 text-[11px] md:text-sm font-medium pr-2 w-full">
                                                            <div className="flex items-center gap-4 min-w-0">
                                                                <span className="truncate text-slate-400 flex items-center gap-1.5 min-w-0">
                                                                    <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                    </svg>
                                                                    <span className="truncate">{event.instructor_name || "Staff"}</span>
                                                                    {event.location && (
                                                                        <>
                                                                            <span className="text-slate-200">•</span>
                                                                            <span className="truncate flex items-center gap-1">
                                                                                <span className="text-[10px]">📍</span> {event.location}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </span>
                                                                
                                                                <span className={`font-medium shrink-0 ${isHighAttendance ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                                  {event.registrations_count}/{event.max_places}
                                                                </span>
                                                            </div>

                                                            <button 
                                                                onClick={() => handleToggleParticipants(event, 'event')}
                                                                className="text-slate-700 italic font-medium hover:text-slate-900 transition-colors focus:outline-none shrink-0"
                                                            >
                                                                → {isExpanded ? 'Fermer la liste' : 'Voir les participants'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Inscriptions Inline fusionnées (Events) */}
                                                {isExpanded && (
                                                    <div className="animate-in slide-in-from-top-2 duration-300">
                                                        <div className="border-t border-slate-50" />
                                                        <div className="bg-slate-50/40 p-4 md:p-5 space-y-2">
                                                            {loadingParticipants ? (
                                                                <div className="py-8 text-center text-slate-300 font-medium text-[11px] animate-pulse tracking-widest">Récupération des inscrits...</div>
                                                            ) : (
                                                                <>
                                                                    {participants.length === 0 ? (
                                                                        <div className="py-8 text-center text-slate-300 text-[10px] font-medium italic">Aucun inscrit pour le moment.</div>
                                                                    ) : (
                                                                        <div className="space-y-1.5">
                                                                            {participants.sort((a,b) => (a.user_name || '').localeCompare(b.user_name || '')).map((p) => (
                                                                                <div key={p.id} className="bg-white/80 rounded-2xl border border-slate-100/50 p-2 pl-4 flex items-center justify-between group/p">
                                                                                    <div className="flex items-center gap-3 min-w-0">
                                                                                        <div className={`w-2 h-2 rounded-full shrink-0 ${p.status === 'absent' ? 'bg-slate-300' : 'bg-emerald-500'}`} />
                                                                                        <span className="text-slate-700 font-semibold text-xs tracking-tight truncate">
                                                                                            {p.user_name}
                                                                                        </span>
                                                                                    </div>
                                                                                    
                                                                                    <div className="flex items-center gap-1">
                                                                                        <button 
                                                                                            onClick={() => handleMarkAbsent(p, 'event')}
                                                                                            className={`w-7 h-7 flex items-center justify-center border rounded-full transition-all active:scale-95 ${p.status === 'absent' ? 'bg-rose-500 border-rose-500 text-white' : 'bg-slate-50 border-slate-100 text-slate-300 hover:text-rose-500 hover:bg-rose-50'}`}
                                                                                            title={p.status === 'absent' ? "Présent" : "Signaler absent"}
                                                                                        >
                                                                                            <span className="text-[10px]">{p.status === 'absent' ? '✖' : '👤'}</span>
                                                                                        </button>
                                                                                        <button 
                                                                                            onClick={() => handleViewContact(p)}
                                                                                            className="w-7 h-7 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-full text-slate-300 hover:text-slate-600 transition-all hover:bg-slate-100 active:scale-95"
                                                                                            title="Consulter le contact"
                                                                                        >
                                                                                            <span className="text-[10px]">📞</span>
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Modal Edit Session */}
            {showEditSessionModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 p-1 animate-in zoom-in duration-300">
                        <form onSubmit={handleUpdateSession} className="p-6 md:p-10">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight">Modifier la séance</h2>
                                </div>
                                <button 
                                    onClick={() => setShowEditSessionModal(false)}
                                    className="w-10 h-10 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-full flex items-center justify-center transition-colors -mt-2 -mr-2"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-4 mb-8">

                                <div>
                                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5 px-1">Titre</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={editFormData.title}
                                        onChange={(e) => setEditFormData({...editFormData, title: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-violet-500 outline-none transition-all placeholder:text-slate-300 text-sm"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1.5 px-1">Heure</label>
                                        <input 
                                            type="time" 
                                            required
                                            value={editFormData.time}
                                            onChange={(e) => setEditFormData({...editFormData, time: e.target.value})}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-violet-500 outline-none transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1.5 px-1">Durée (min)</label>
                                        <input 
                                            type="number" 
                                            required
                                            value={editFormData.duration_minutes}
                                            onChange={(e) => setEditFormData({...editFormData, duration_minutes: parseInt(e.target.value)})}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-violet-500 outline-none transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1.5 px-1">Attribution</label>
                                        <input 
                                            type="text"
                                            placeholder="Coach" 
                                            value={editFormData.instructor_name}
                                            onChange={(e) => setEditFormData({...editFormData, instructor_name: e.target.value})}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-violet-500 outline-none transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1.5 px-1">Lieu</label>
                                        {tenant?.locations && tenant.locations.length > 0 ? (
                                            <select 
                                                value={editFormData.location}
                                                onChange={(e) => setEditFormData({...editFormData, location: e.target.value})}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-violet-500 outline-none transition-all text-sm appearance-none"
                                            >
                                                <option value="">Aucun lieu</option>
                                                {tenant.locations.map(loc => (
                                                    <option key={loc} value={loc}>{loc}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input 
                                                type="text" 
                                                placeholder="Salle"
                                                value={editFormData.location}
                                                onChange={(e) => setEditFormData({...editFormData, location: e.target.value})}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-violet-500 outline-none transition-all text-sm"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1.5 px-1">Capacité</label>
                                        <input 
                                            type="number" 
                                            required
                                            value={editFormData.max_participants}
                                            onChange={(e) => setEditFormData({...editFormData, max_participants: parseInt(e.target.value)})}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-violet-500 outline-none transition-all text-sm"
                                        />
                                    </div>
                                    <div />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5 px-1">Description</label>
                                    <textarea 
                                        rows={2}
                                        value={editFormData.description}
                                        onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                                        className="w-full bg-slate-100/50 border border-slate-100 rounded-2xl p-4 text-slate-600 font-medium italic focus:ring-2 focus:ring-violet-500 outline-none transition-all text-xs"
                                    />
                                </div>
                            </div>

                            {participants.length > 0 && (
                                <div className="flex items-center justify-between px-2 mb-8 mt-4 border-t border-slate-50 pt-6">
                                    <span className="text-[11px] text-slate-400 italic">Envoyer un e-mail aux participants</span>
                                    <button 
                                        type="button"
                                        onClick={() => handleContactEmail(participants.map(p => p.user_id))}
                                        className="w-10 h-10 flex items-center justify-center bg-violet-50 text-violet-600 rounded-full hover:bg-violet-100 transition-all active:scale-95 shadow-sm shadow-violet-100/50"
                                    >
                                        <span className="text-xl">📧</span>
                                    </button>
                                </div>
                            )}

                            <div className="flex gap-4">
                                <button 
                                    type="button"
                                    onClick={() => setShowEditSessionModal(false)}
                                    className="flex-1 py-4 bg-slate-100 text-slate-400 rounded-2xl font-medium hover:bg-slate-200 transition-all text-xs"
                                >
                                    Annuler
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-medium hover:bg-violet-600 shadow-xl shadow-slate-200 transition-all text-xs"
                                >
                                    Enregistrer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <BottomNav userRole={user?.role} />

            {/* Fiche Contact Modal */}
            {viewingContact && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="absolute inset-0" onClick={() => setViewingContact(null)}></div>
                    <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 p-8 animate-in zoom-in-95 duration-200 relative">
                        <header className="mb-8">
                            <h2 className="text-xl font-medium text-slate-900 tracking-tight mb-1">Informations de contact</h2>
                            <p className="text-slate-400 font-medium text-xs">Pour {viewingContact.user_name}</p>
                        </header>

                        <div className="space-y-4">
                            {/* Téléphone */}
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between group">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-0.5">Téléphone</p>
                                    <p className="text-slate-800 font-medium text-sm">{viewingContact.user_phone || "Non renseigné"}</p>
                                </div>
                                {viewingContact.user_phone && (
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(viewingContact.user_phone!);
                                        }}
                                        className="w-8 h-8 rounded-full bg-white border border-slate-100 text-slate-400 flex items-center justify-center hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all active:scale-90"
                                        title="Copier le numéro"
                                    >
                                        <span className="text-xs">📋</span>
                                    </button>
                                )}
                            </div>

                            {/* Réseaux Sociaux */}
                            {(viewingContact.instagram_handle || viewingContact.facebook_handle) ? (
                                <div className="grid grid-cols-1 gap-3">
                                    {viewingContact.instagram_handle && (
                                        <a 
                                            href={`https://instagram.com/${viewingContact.instagram_handle.replace('@', '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-4 rounded-2xl bg-violet-50/50 border border-violet-100 flex items-center justify-between hover:bg-violet-50 transition-colors group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">📸</span>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-bold text-violet-300 uppercase tracking-widest mb-0.5">Instagram</p>
                                                    <p className="text-violet-600 font-medium text-sm truncate">{viewingContact.instagram_handle}</p>
                                                </div>
                                            </div>
                                            <span className="text-violet-300 group-hover:translate-x-1 transition-transform">→</span>
                                        </a>
                                    )}
                                    {viewingContact.facebook_handle && (
                                        <a 
                                            href={viewingContact.facebook_handle.startsWith('http') ? viewingContact.facebook_handle : `https://facebook.com/${viewingContact.facebook_handle}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 flex items-center justify-between hover:bg-blue-50 transition-colors group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">👤</span>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-0.5">Facebook</p>
                                                    <p className="text-blue-600 font-medium text-sm truncate">{viewingContact.facebook_handle}</p>
                                                </div>
                                            </div>
                                            <span className="text-blue-300 group-hover:translate-x-1 transition-transform">→</span>
                                        </a>
                                    )}
                                </div>
                            ) : (
                                <p className="text-center py-4 text-slate-300 italic text-[11px]">Aucun réseau social renseigné</p>
                            )}
                        </div>

                        <button 
                            onClick={() => setViewingContact(null)}
                            className="w-full py-4 mt-8 bg-slate-900 text-white rounded-2xl font-medium hover:bg-slate-800 transition-all active:scale-95 text-xs tracking-widest uppercase"
                        >
                            Fermer
                        </button>
                    </div>
                </div>
            )}

            {/* Alerte Erreur Restauration */}
            {restorationErrorUsers && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-rose-900/40 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-rose-100 p-8 animate-in zoom-in-95 duration-300">
                        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-6">
                            <span className="text-3xl">⚠️</span>
                        </div>
                        <h2 className="text-xl font-medium text-slate-900 tracking-tight mb-2">Restauration incomplète</h2>
                        <p className="text-slate-500 text-xs mb-6 leading-relaxed">
                            La séance a été rétablie, mais les personnes suivantes n'ont pas pu être réinscrites automatiquement (crédits insuffisants ou compte expiré) :
                        </p>
                        
                        <div className="bg-rose-50/50 rounded-2xl p-4 max-h-40 overflow-y-auto mb-8 border border-rose-100">
                            <ul className="space-y-2">
                                {restorationErrorUsers.map((name, idx) => (
                                    <li key={idx} className="text-rose-700 text-xs font-bold flex items-center gap-2">
                                        <div className="w-1 h-1 bg-rose-400 rounded-full" />
                                        {name}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <button 
                            onClick={() => setRestorationErrorUsers(null)}
                            className="w-full py-4 bg-rose-600 text-white rounded-2xl font-medium hover:bg-rose-700 transition-all active:scale-95 text-xs tracking-widest uppercase shadow-lg shadow-rose-100"
                        >
                            Compris
                        </button>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @supports (-webkit-touch-callout: none) {
                    .safe-top { padding-top: env(safe-area-inset-top); }
                    .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
                }
            `}</style>
        </div>
    );
}
