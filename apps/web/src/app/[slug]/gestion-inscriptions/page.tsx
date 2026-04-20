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
  isSameMonth,
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
    const [participantsMap, setParticipantsMap] = useState<Record<string, (AdminBookingItem | AdminEventRegistrationItem)[]>>({});
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
    const [modalParticipants, setModalParticipants] = useState<(AdminBookingItem | AdminEventRegistrationItem)[]>([]);
    const [locationFilter, setLocationFilter] = useState<string>('all');
    const [rawDayItems, setRawDayItems] = useState<{ sessions: Session[], events: any[] }>({ sessions: [], events: [] });

    // Modals & UX
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [showEditSessionModal, setShowEditSessionModal] = useState(false);
    const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(null);
    const [confirmingReactivateId, setConfirmingReactivateId] = useState<string | null>(null);
    const [restorationErrorUsers, setRestorationErrorUsers] = useState<string[] | null>(null);
    const [viewingContact, setViewingContact] = useState<AdminBookingItem | AdminEventRegistrationItem | null>(null);
    const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);

    // Form for editing session
    const [editFormData, setEditFormData] = useState({
        title: "",
        description: "",
        instructor_name: "",
        location: "",
        date: "",
        time: "",
        duration_h: 1,
        duration_m: 0,
        max_participants: 10,
    });
    const [includeWaitlist, setIncludeWaitlist] = useState(false);
    const [isLocationOpen, setIsLocationOpen] = useState(false);

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

            // Si le jour sélectionné est dans ce mois, on rafraîchit aussi ses données
            if (isSameMonth(selectedDate, date)) {
                const daySessions = sessionsData.filter((s: Session) => isSameDay(parseISO(s.start_time), selectedDate));
                const dayEvents = eventsData.filter((e: any) => isSameDay(parseISO(e.event_date), selectedDate));
                setRawDayItems({ sessions: daySessions, events: dayEvents });
            }
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
        // On capture les données du jour au moment du clic depuis le pool de données actuel du calendrier
        let daySessions = sessions.filter(s => isSameDay(parseISO(s.start_time), day));
        let dayEvents = events.filter(e => isSameDay(parseISO(e.event_date), day));
        setRawDayItems({ sessions: daySessions, events: dayEvents });
    };

    const loadParticipants = async (item: any, type: 'session' | 'event') => {
        setLoadingMap(prev => ({ ...prev, [item.id]: true }));
        try {
            if (type === 'session') {
                const regs = await api.getAdminBookings({ session_id: item.id });
                let filtered: AdminBookingItem[] = [];
                if (item.is_active === false) {
                    filtered = regs.filter(r => r.status === 'session_cancelled' || r.status === 'absent' || r.status === 'confirmed');
                } else {
                    filtered = regs.filter(r => r.status !== 'cancelled' && r.status !== 'session_cancelled');
                }
                setParticipantsMap(prev => ({ ...prev, [item.id]: filtered }));
            } else {
                const regs = await api.getAdminEventRegistrations({ event_id: item.id });
                const filtered = regs.filter(r => r.status !== 'cancelled' && r.status !== 'event_deleted');
                setParticipantsMap(prev => ({ ...prev, [item.id]: filtered }));
            }
        } catch (err) {
            console.error("Failed to load participants", err);
        } finally {
            setLoadingMap(prev => ({ ...prev, [item.id]: false }));
        }
    };

    const handleToggleParticipants = async (item: any, type: 'session' | 'event') => {
        const isCurrentlyExpanded = expandedIds.includes(item.id);
        
        if (isCurrentlyExpanded) {
            setExpandedIds(prev => prev.filter(id => id !== item.id));
        } else {
            setExpandedIds(prev => [...prev, item.id]);
            setSelectedItem({ type, data: item });
            // Ne charger que si on n'a pas déjà les données ou si on veut rafraîchir
            await loadParticipants(item, type);
        }
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
            date: format(start, "yyyy-MM-dd"),
            time: format(start, "HH:mm"),
            duration_h: Math.floor(duration / 60),
            duration_m: duration % 60,
            max_participants: s.max_participants,
        });

        // Charger les participants pour le bouton mail groupé si besoin (isolé dans modalParticipants)
        if (s.current_participants > 0) {
            try {
                const regs = await api.getAdminBookings({ session_id: s.id });
                setModalParticipants(regs.filter(r => r.status !== 'cancelled' && r.status !== 'session_cancelled'));
            } catch (err) {
                console.error("Failed to load participants for modal", err);
            }
        } else {
            setModalParticipants([]);
        }

        setShowEditSessionModal(true);
    };

    const handleUpdateSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem || selectedItem.type !== 'session') return;
        try {
            const startDt = new Date(`${editFormData.date}T${editFormData.time}:00`);
            const totalMinutes = (editFormData.duration_h * 60) + editFormData.duration_m;
            const endDt = new Date(startDt.getTime() + totalMinutes * 60 * 1000);

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
            if (expandedIds.includes(item.id)) {
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
                // Rafraîchir spécifiquement cette séance
                const s = sessions.find(s => s.id === participant.session_id);
                if (s) await loadParticipants(s, 'session');
            } else {
                await api.updateAdminEventRegistration(participant.id, { status: nextStatus });
                // Rafraîchir spécifiquement cet évènement
                const e = events.find(ev => ev.id === participant.event_id);
                if (e) await loadParticipants(e, 'event');
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

    // Filtrage des éléments du jour affiché par lieu
    const dayItems = useMemo(() => {
        let { sessions: s, events: e } = rawDayItems;
        if (locationFilter !== 'all') {
            s = s.filter(session => session.location === locationFilter);
            e = e.filter(event => event.location === locationFilter);
        }
        return { sessions: s, events: e };
    }, [rawDayItems, locationFilter]);

    const hasItems = dayItems.sessions.length > 0 || dayItems.events.length > 0;

    if (loading) {
        return (
            <div className="flex flex-col md:flex-row min-h-screen bg-white overflow-x-hidden pb-20 md:pb-0">
                <header className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 z-40 md:hidden safe-top shadow-sm">
                    <Link href={`/${params.slug}/home`} className="flex items-center gap-2 group text-slate-400 active:scale-95 transition-all">
                        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 ml-0.5" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-[13px] font-medium leading-none">Retour</span>
                    </Link>
                    <div className="w-10" />
                </header>
                
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-300 mb-4"></div>
                </div>
                <BottomNav userRole={user?.role} />
            </div>
        );
    }

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
                        <aside className="md:sticky md:top-14 space-y-6 mb-8 md:mb-0">
                            <header className="px-1 space-y-1">
                                <h1 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight flex items-center gap-2">
                                    <span className="text-2xl md:text-3xl">📝</span> Gestion des inscriptions
                                </h1>
                                <p className="text-slate-500 font-medium text-[11px] md:text-xs">Gérez vos séances et participants</p>
                            </header>

                            <div className="bg-white -mx-5 md:mx-0 rounded-none md:rounded-3xl shadow-xl shadow-blue-900/10 border-b md:border border-slate-200 p-4 md:p-2">
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
                                        const isSelected = isSameDay(day, selectedDate);
                                        const isToday = isSameDay(day, new Date());
                                        const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
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
                                                    backgroundColor: isSelected ? clubColor : undefined,
                                                    color: isSelected ? 'white' : (isToday ? clubColor : undefined)
                                                }}
                                            >
                                                <span>{day.getDate()}</span>
                                                {isToday && (
                                                    <div 
                                                        className={`absolute bottom-1 w-3 md:w-5 h-[2px] rounded-full ${isSelected ? 'bg-white' : ''}`}
                                                        style={{ backgroundColor: !isSelected ? clubColor : undefined }}
                                                    ></div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </aside>

                        {/* Colonne Droite: Activités du jour */}
                        <div className="space-y-4 pt-2 md:pt-1">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-4 px-1 mb-4">
                                    <h3 className="text-sm font-medium text-slate-400 lowercase whitespace-nowrap">
                                        {format(selectedDate, "eeee d MMMM", { locale: fr })}
                                    </h3>

                                    {tenant?.locations && tenant.locations.length > 1 && (
                                        <div className="relative inline-block w-auto shrink-0">
                                            <button 
                                                onClick={() => setIsLocationMenuOpen(!isLocationMenuOpen)}
                                                className="flex items-center justify-between bg-white border border-slate-100 text-slate-600 text-[11px] md:text-[12px] font-medium rounded-2xl px-3 md:px-4 py-2 md:py-2.5 outline-none transition-all cursor-pointer shadow-sm hover:shadow-md hover:border-slate-200 gap-2"
                                            >
                                                <span className="truncate max-w-[100px] md:max-w-[150px]">
                                                    {locationFilter === "all" ? "Tous les lieux" : locationFilter}
                                                </span>
                                                <svg className={`w-3 h-3 md:w-4 md:h-4 text-slate-400 transition-transform duration-200 ${isLocationMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>

                                            {isLocationMenuOpen && (
                                                <>
                                                    <div 
                                                        className="fixed inset-0 z-40" 
                                                        onClick={() => setIsLocationMenuOpen(false)}
                                                    />
                                                    <div className="absolute top-full right-0 mt-2 z-50 w-48 md:w-64 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-200/50 p-2 animate-in fade-in slide-in-from-top-2">
                                                        <button
                                                            onClick={() => {
                                                                setLocationFilter("all");
                                                                setIsLocationMenuOpen(false);
                                                            }}
                                                            className={`w-full text-left px-4 py-2.5 rounded-xl text-[12px] font-medium transition-colors ${
                                                                locationFilter === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                                                            }`}
                                                        >
                                                            Tous les lieux
                                                        </button>
                                                        {tenant.locations.map((loc) => (
                                                            <button
                                                                key={loc}
                                                                onClick={() => {
                                                                    setLocationFilter(loc);
                                                                    setIsLocationMenuOpen(false);
                                                                }}
                                                                className={`w-full text-left px-4 py-2.5 rounded-xl text-[12px] font-medium transition-colors mt-1 ${
                                                                    locationFilter === loc ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                                                                }`}
                                                            >
                                                                {loc}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {!hasItems ? (
                                <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-slate-200">
                                    <p className="text-slate-400 font-medium text-xs tracking-wide italic">Aucune activité au programme.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Séances */}
                                    {dayItems.sessions.map((session) => {
                                        const ratio = session.current_participants / session.max_participants;
                                        const isHighAttendance = ratio >= 0.6;
                                        const isExpanded = expandedIds.includes(session.id);
                                        const participants = participantsMap[session.id] || [];
                                        const loadingParticipants = loadingMap[session.id] || false;
                                        
                                        return (
                                            <div 
                                                key={session.id} 
                                                className={`bg-white rounded-2xl border transition-all duration-500 hover:shadow-xl overflow-hidden group ${!session.is_active ? 'opacity-50' : ''}`}
                                                style={{ 
                                                    boxShadow: `3px 4px 14px -2px ${(tenant?.primary_color || '#2563eb')}40`,
                                                    borderColor: `${(tenant?.primary_color || '#2563eb')}20`
                                                }}
                                            >
                                                {/* Entête Séance */}
                                                <div className="p-3 md:p-4">
                                                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                        {/* Ligne 1: Heure + Titre */}
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

                                                        {/* Ligne 2: Attribution + Salle + Actions */}
                                                        <div className="flex items-center justify-between gap-4 w-full mt-0.5">
                                                            <div className="flex items-center gap-2 text-slate-600 text-sm font-normal min-w-0">
                                                                <div className="flex items-center gap-1.5 truncate">
                                                                    <svg className="w-5 h-5 flex-shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                    </svg>
                                                                    <span className="truncate">{session.instructor_name || "Coach"}</span>
                                                                </div>
                                                                {session.location && (
                                                                    <>
                                                                        <span className="text-slate-300">•</span>
                                                                        <span className="truncate flex items-center gap-1">
                                                                            <span className="text-base opacity-60">📍</span> {session.location}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center">
                                                                {confirmingSessionId === session.id ? (
                                                                    <div className="flex items-center gap-3 shrink-0 animate-in fade-in slide-in-from-right-2 duration-300">
                                                                        <span className="text-[10px] font-medium text-rose-500 tracking-tight">Annuler ?</span>
                                                                        <div className="flex items-center gap-2">
                                                                            <button onClick={() => setConfirmingSessionId(null)} className="px-2 py-1 text-[10px] font-medium text-slate-400">Non</button>
                                                                            <button onClick={() => handleCancelSession(session)} className="px-3 py-1 bg-rose-500 text-white rounded-full text-[9px] font-medium transition-all shadow-sm active:scale-95">Oui</button>
                                                                        </div>
                                                                    </div>
                                                                ) : session.is_active ? (
                                                                    <div className="flex items-center gap-0 shrink-0">
                                                                        <button 
                                                                            onClick={() => handleOpenEditSession(session)}
                                                                            className="p-0.5 hover:bg-slate-50 rounded-lg text-slate-300 hover:text-slate-600 transition-colors"
                                                                            title="Modifier"
                                                                        >
                                                                            <span className="text-sm">✏️</span>
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleCancelSession(session)}
                                                                            className="p-0.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors"
                                                                            title="Annuler"
                                                                        >
                                                                            <span className="text-sm">🚫</span>
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center">
                                                                        {confirmingReactivateId === session.id ? (
                                                                            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-2 duration-300">
                                                                                <span className="text-[10px] font-medium text-violet-600 tracking-tight">Rétablir ?</span>
                                                                                <div className="flex items-center gap-2">
                                                                                    <button onClick={() => setConfirmingReactivateId(null)} className="text-[10px] font-medium text-slate-400">Non</button>
                                                                                    <button onClick={() => handleReactivateSession(session)} className="px-3 py-1 bg-violet-600 text-white rounded-full text-[9px] font-medium active:scale-95">Oui</button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <button 
                                                                                onClick={() => handleReactivateSession(session)}
                                                                                className="p-0.5 hover:bg-violet-50 rounded-lg text-slate-300 hover:text-violet-600 transition-colors"
                                                                                title="Rétablir la séance"
                                                                            >
                                                                                <span className="text-sm">🔄</span>
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Ligne 3: Inscriptions + Voir les participants */}
                                                        <div className="flex items-center justify-between gap-4 w-full mt-0.5">
                                                            <div className="flex items-center gap-3">
                                                                <span className={`font-bold text-sm md:text-base shrink-0 ${isHighAttendance ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                                    {session.current_participants}/{session.max_participants}
                                                                </span>
                                                                {isExpanded && participants.filter(p => p.status === 'pending' || (p as any).status === 'waiting_list').length > 0 && (
                                                                    <span className="text-xs text-slate-400 flex items-center gap-1 animate-in fade-in duration-500 bg-slate-100/50 px-1.5 py-0.5 rounded-md">
                                                                        ⏳ {participants.filter(p => p.status === 'pending' || (p as any).status === 'waiting_list').length}
                                                                    </span>
                                                                )}
                                                            </div>
 
                                                            <button 
                                                                onClick={() => handleToggleParticipants(session, 'session')}
                                                                className="px-3 py-1.5 rounded-xl text-[10px] md:text-[11px] font-medium transition-all active:scale-95 flex items-center gap-2 bg-slate-100 border border-slate-200/60 text-slate-600 hover:bg-slate-200 hover:border-slate-300"
                                                            >
                                                                <span>{isExpanded ? 'Masquer' : 'Voir les participants'}</span>
                                                                <span className="text-xs">{isExpanded ? '↑' : '↓'}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Inscriptions Inline fusionnées */}
                                                {isExpanded && (
                                                    <div className="animate-in slide-in-from-top-2 duration-300">
                                                        <div className="border-t border-slate-200/60" />
                                                        <div className="bg-slate-50/40 px-3 py-2 md:px-4 md:py-2.5 space-y-2">
                                                            {loadingParticipants ? (
                                                                <div className="py-8 text-center text-slate-300 font-medium text-[11px] animate-pulse tracking-widest">Récupération des inscrits...</div>
                                                            ) : (
                                                                <>
                                                                    {participants.length === 0 ? (
                                                                        <div className="py-8 text-center text-slate-300 text-[10px] font-medium italic">Aucun inscrit pour le moment.</div>
                                                                    ) : (
                                                                        <div className="space-y-1.5">
                                                                            {participants
                                                                                .filter(p => p.status !== 'cancelled' && p.status !== 'session_cancelled' && p.status !== 'pending' && (p as any).status !== 'waiting_list')
                                                                                .sort((a,b) => (a.user_name || '').localeCompare(b.user_name || ''))
                                                                                .map((p) => {
                                                                                    const hasWarning = p.has_pending_order;
                                                                                    const isAbsent = p.status === 'absent';
                                                                                    
                                                                                    return (
                                                                                        <div key={p.id} className="bg-white rounded-2xl border border-slate-100/50 p-2 pl-3 flex items-center justify-between group/p">
                                                                                            <div className="flex items-center gap-3 min-w-0">
                                                                                                {/* Appel (Présence) */}
                                                                                                <button 
                                                                                                    onClick={() => handleMarkAbsent(p, 'session')}
                                                                                                    className={`w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-95 ${isAbsent ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}
                                                                                                    title={isAbsent ? "Marquer présent" : "Signaler absent"}
                                                                                                >
                                                                                                    <span className="text-xs">{isAbsent ? '❌' : '✅'}</span>
                                                                                                </button>

                                                                                                <span className="truncate text-xs tracking-tight text-slate-600 font-medium">
                                                                                                    {p.user_name}
                                                                                                </span>
                                                                                            </div>
                                                                                            
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                {hasWarning && (
                                                                                                    <span className="text-sm cursor-help" title="Commande à régulariser">⚠️</span>
                                                                                                )}
                                                                                                <button 
                                                                                                    onClick={() => handleViewContact(p)}
                                                                                                    className="w-7 h-7 flex items-center justify-center bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-all hover:bg-slate-100 active:scale-95"
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
                                    {dayItems.events.map((event) => {
                                        const ratio = event.registrations_count / event.max_places;
                                        const isHighAttendance = ratio >= 0.6;
                                        const isExpanded = expandedIds.includes(event.id);
                                        const participants = participantsMap[event.id] || [];
                                        const loadingParticipants = loadingMap[event.id] || false;

                                        return (
                                            <div 
                                                key={event.id} 
                                                className={`bg-gradient-to-b from-amber-50/80 via-amber-50/40 to-white rounded-2xl border border-amber-200/50 transition-all duration-500 hover:shadow-xl overflow-hidden group ${event.cancelled_at ? 'opacity-50' : ''}`}
                                                style={{ 
                                                    boxShadow: `3px 4px 14px -2px #f59e0b30`,
                                                }}
                                            >
                                                {/* Entête Événement */}
                                                <div className="p-3 md:p-4">
                                                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                        {/* Ligne 1: Heure + Titre */}
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <span className="text-slate-900 font-semibold text-sm md:text-base shrink-0">
                                                                {event.event_time}
                                                            </span>
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className="text-sm shrink-0">✨</span>
                                                                <h4 className="font-medium text-sm md:text-base text-slate-800 first-letter:uppercase leading-tight">
                                                                    {event.title}
                                                                </h4>
                                                            </div>
                                                        </div>

                                                        {/* Ligne 2: Attribution + Salle */}
                                                        <div className="flex items-center justify-between gap-4 w-full mt-0.5">
                                                            <div className="flex items-center gap-2 text-slate-600 text-sm font-normal min-w-0">
                                                                <div className="flex items-center gap-1.5 truncate">
                                                                    <svg className="w-5 h-5 flex-shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                    </svg>
                                                                    <span className="truncate">{event.instructor_name || "Staff"}</span>
                                                                </div>
                                                                {event.location && (
                                                                    <>
                                                                        <span className="text-slate-300">•</span>
                                                                        <span className="truncate flex items-center gap-1">
                                                                            <span className="text-base opacity-60">📍</span> {event.location}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {/* Pas de boutons d'action d'administration pour les évènements pour le moment */}
                                                        </div>

                                                        <div className="flex items-center justify-between gap-4 w-full">
                                                            <div className="flex items-center gap-3">
                                                                <span className={`font-bold text-sm md:text-base shrink-0 ${isHighAttendance ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                                    {event.registrations_count}/{event.max_places}
                                                                </span>
                                                                {isExpanded && participants.filter(p => p.status === 'pending' || (p as any).status === 'waiting_list').length > 0 && (
                                                                    <span className="text-xs text-slate-400 flex items-center gap-1 animate-in fade-in duration-500 bg-slate-100/50 px-1.5 py-0.5 rounded-md">
                                                                        ⏳ {participants.filter(p => p.status === 'pending' || (p as any).status === 'waiting_list').length}
                                                                    </span>
                                                                )}
                                                            </div>
 
                                                            <button 
                                                                onClick={() => handleToggleParticipants(event, 'event')}
                                                                className="px-3 py-1.5 rounded-xl text-[10px] md:text-[11px] font-medium transition-all active:scale-95 flex items-center gap-2 bg-slate-100 border border-slate-200/60 text-slate-600 hover:bg-slate-200 hover:border-slate-300"
                                                            >
                                                                <span>{isExpanded ? 'Masquer' : 'Voir les participants'}</span>
                                                                <span className="text-xs">{isExpanded ? '↑' : '↓'}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Inscriptions Inline fusionnées (Events) */}
                                                {isExpanded && (
                                                    <div className="animate-in slide-in-from-top-2 duration-300">
                                                        <div className="border-t border-slate-200/60" />
                                                        <div className="bg-slate-50/40 px-3 py-2 md:px-4 md:py-2.5 space-y-2">
                                                            {loadingParticipants ? (
                                                                <div className="py-8 text-center text-slate-300 font-medium text-[11px] animate-pulse tracking-widest">Récupération des inscrits...</div>
                                                            ) : (
                                                                <>
                                                                    {participants.length === 0 ? (
                                                                        <div className="py-8 text-center text-slate-300 text-[10px] font-medium italic">Aucun inscrit pour le moment.</div>
                                                                    ) : (
                                                                        <div className="space-y-1.5">
                                                                            {participants
                                                                                .filter(p => p.status !== 'cancelled' && p.status !== 'session_cancelled' && p.status !== 'pending' && (p as any).status !== 'waiting_list')
                                                                                .sort((a,b) => (a.user_name || '').localeCompare(b.user_name || ''))
                                                                                .map((p) => {
                                                                                    const hasWarning = p.has_pending_order;
                                                                                    const isAbsent = p.status === 'absent';
                                                                                    
                                                                                    return (
                                                                                        <div key={p.id} className="bg-white rounded-2xl border border-slate-100/50 p-2 pl-3 flex items-center justify-between group/p">
                                                                                            <div className="flex items-center gap-3 min-w-0">
                                                                                                {/* Appel (Présence) */}
                                                                                                <button 
                                                                                                    onClick={() => handleMarkAbsent(p, 'event')}
                                                                                                    className={`w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-95 ${isAbsent ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}
                                                                                                    title={isAbsent ? "Marquer présent" : "Signaler absent"}
                                                                                                >
                                                                                                    <span className="text-xs">{isAbsent ? '❌' : '✅'}</span>
                                                                                                </button>

                                                                                                <span className="truncate text-xs tracking-tight text-slate-600 font-medium">
                                                                                                    {p.user_name}
                                                                                                </span>
                                                                                            </div>
                                                                                            
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                {hasWarning && (
                                                                                                    <span className="text-sm cursor-help" title="Commande à régulariser">⚠️</span>
                                                                                                )}
                                                                                                <button 
                                                                                                    onClick={() => handleViewContact(p)}
                                                                                                    className="w-7 h-7 flex items-center justify-center bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-all hover:bg-slate-100 active:scale-95"
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
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {showEditSessionModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80"
                     style={{ '--primary': tenant?.primary_color || '#6366f1' } as any}>
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 p-1">
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
                                    <label className="block text-xs md:text-sm font-semibold text-slate-500 mb-1.5 px-1">Titre</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={editFormData.title}
                                        onChange={(e) => setEditFormData({...editFormData, title: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all placeholder:text-slate-300 text-sm"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs md:text-sm font-semibold text-slate-500 mb-1.5 px-1">Date</label>
                                        <input 
                                            type="date" 
                                            required
                                            value={editFormData.date}
                                            onChange={(e) => setEditFormData({...editFormData, date: e.target.value})}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs md:text-sm font-semibold text-slate-500 mb-1.5 px-1">Heure de début</label>
                                        <input 
                                            type="time" 
                                            required
                                            value={editFormData.time}
                                            onChange={(e) => setEditFormData({...editFormData, time: e.target.value})}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs md:text-sm font-semibold text-slate-500 mb-1.5 px-1">Durée</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                min="0"
                                                required
                                                value={editFormData.duration_h}
                                                onChange={(e) => setEditFormData({...editFormData, duration_h: parseInt(e.target.value) || 0})}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm pr-8"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">hh</span>
                                        </div>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                min="0"
                                                max="59"
                                                required
                                                value={editFormData.duration_m}
                                                onChange={(e) => setEditFormData({...editFormData, duration_m: parseInt(e.target.value) || 0})}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm pr-8"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">mm</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs md:text-sm font-semibold text-slate-500 mb-1.5 px-1">Attribution</label>
                                        <input 
                                            type="text"
                                            placeholder="Coach" 
                                            value={editFormData.instructor_name}
                                            onChange={(e) => setEditFormData({...editFormData, instructor_name: e.target.value})}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs md:text-sm font-semibold text-slate-500 mb-1.5 px-1">Capacité</label>
                                        <input 
                                            type="number" 
                                            required
                                            value={editFormData.max_participants}
                                            onChange={(e) => setEditFormData({...editFormData, max_participants: parseInt(e.target.value)})}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="relative">
                                    <label className="block text-xs md:text-sm font-semibold text-slate-500 mb-2 px-1">Lieu</label>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setIsLocationOpen(!isLocationOpen)}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 font-normal focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm flex items-center justify-between"
                                        >
                                            <span className={!editFormData.location ? 'text-slate-400' : ''}>
                                                {editFormData.location || "Sélectionner un lieu..."}
                                            </span>
                                            <span className="text-slate-400 text-[10px] transform transition-transform duration-200" style={{ transform: isLocationOpen ? 'rotate(180deg)' : 'none' }}>
                                                ▼
                                            </span>
                                        </button>
                                        
                                        {isLocationOpen && (
                                            <>
                                                <div className="fixed inset-0 z-[120]" onClick={() => setIsLocationOpen(false)}></div>
                                                <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[130] max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <div 
                                                        className="p-4 hover:bg-slate-50 cursor-pointer text-sm text-slate-400 hover:text-slate-600 transition-colors border-b border-slate-50"
                                                        onClick={() => { setEditFormData({...editFormData, location: ""}); setIsLocationOpen(false); }}
                                                    >
                                                        Aucun lieu
                                                    </div>
                                                    {tenant?.locations?.map((loc) => (
                                                        <div 
                                                            key={loc}
                                                            className="p-4 hover:bg-slate-50 cursor-pointer text-sm font-medium flex items-center justify-between group transition-colors border-b border-slate-50 last:border-0"
                                                            style={editFormData.location === loc ? { color: tenant?.primary_color } : {}}
                                                            onClick={() => { setEditFormData({...editFormData, location: loc}); setIsLocationOpen(false); }}
                                                        >
                                                            <span>{loc}</span>
                                                            {editFormData.location === loc && (
                                                                <span className="text-[10px]">✓</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {(!tenant?.locations || tenant.locations.length === 0) && (
                                                        <div className="p-4">
                                                            <input 
                                                                type="text" 
                                                                placeholder="Saisir un lieu..."
                                                                value={editFormData.location}
                                                                autoFocus
                                                                onChange={(e) => setEditFormData({...editFormData, location: e.target.value})}
                                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-slate-900 font-normal focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-xs"
                                                                onKeyDown={(e) => e.key === 'Enter' && setIsLocationOpen(false)}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs md:text-sm font-semibold text-slate-500 mb-1.5 px-1">Description</label>
                                    <textarea 
                                        rows={2}
                                        value={editFormData.description}
                                        onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                                        className="w-full bg-slate-100/50 border border-slate-100 rounded-2xl p-4 text-slate-600 font-medium italic focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-xs"
                                    />
                                </div>
                            </div>

                            {modalParticipants.length > 0 && (
                                <div className="flex items-center justify-between px-2 mb-8 mt-4 border-t border-slate-50 pt-6">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-slate-400 italic">Envoyer un e-mail groupé</span>
                                        <label className="flex items-center gap-2 mt-1 cursor-pointer group">
                                            <input 
                                                type="checkbox" 
                                                checked={includeWaitlist} 
                                                onChange={(e) => setIncludeWaitlist(e.target.checked)} 
                                                className="w-3.5 h-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900" 
                                            />
                                            <span className="text-[10px] text-slate-400 font-medium group-hover:text-slate-600 transition-colors">Inclure la liste d'attente</span>
                                        </label>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const targets = includeWaitlist 
                                                ? modalParticipants 
                                                : modalParticipants.filter(p => p.status === 'confirmed' || p.status === 'absent');
                                            handleContactEmail(targets.map(p => p.user_id));
                                        }}
                                        className="w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-95 shadow-md bg-white border border-slate-100 hover:bg-slate-50 text-[11px]"
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
                                    className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-medium hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all text-xs"
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
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                        </svg>
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
                            className="px-12 py-3.5 mx-auto block mt-8 bg-slate-900 text-white rounded-2xl font-medium hover:bg-slate-800 transition-all active:scale-95 text-xs tracking-wide"
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
                            className="px-12 py-3.5 mx-auto block bg-rose-600 text-white rounded-2xl font-medium hover:bg-rose-700 transition-all active:scale-95 text-xs tracking-wide shadow-lg shadow-rose-100"
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
