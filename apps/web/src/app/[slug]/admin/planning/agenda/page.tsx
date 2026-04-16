"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User, Session } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { formatDuration, calculateDuration } from "@/lib/formatters";

type RecurrenceType = "none" | "daily" | "weekly" | "monthly";

const emptyForm = {
    title: "",
    description: "",
    instructor_name: "",
    date: "",
    time: "",
    duration_minutes: 60,
    max_participants: 10,
    credits_required: 1,
    location: "",
    allow_waitlist: true,
    recurrence: "none" as RecurrenceType,
    recurrence_count: 4,
};

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function AdminAgendaPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [locationFilter, setLocationFilter] = useState("all");
    const [view, setView] = useState<'week' | 'month'>('week');
    const [tenant, setTenant] = useState<any>(null);

    // Form states
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [editingSession, setEditingSession] = useState<any | null>(null);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [duplicateData, setDuplicateData] = useState({ source_start: "", source_end: "", target_start: "" });

    // Details state
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    // Confirmation Modal
    const [confirmModal, setConfirmModal] = useState<{
        show: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'danger' | 'warning' | 'info';
    }>({ show: false, title: "", message: "", onConfirm: () => {}, type: 'info' });

    const weekDays = useMemo(() => {
        const days = [];
        const start = new Date(currentDate);
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);

        for (let i = 0; i < 7; i++) {
            days.push(new Date(start));
            start.setDate(start.getDate() + 1);
        }
        return days;
    }, [currentDate]);

    const monthDays = useMemo(() => {
        const days = [];
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        
        // Find the Monday of the week containing the 1st of the month
        const firstDay = startOfMonth.getDay();
        const diff = startOfMonth.getDate() - firstDay + (firstDay === 0 ? -6 : 1);
        const start = new Date(startOfMonth);
        start.setDate(diff);

        // Fill 6 weeks (42 days) to ensure the grid is always complete
        for (let i = 0; i < 42; i++) {
            days.push(new Date(start));
            start.setDate(start.getDate() + 1);
        }
        return days;
    }, [currentDate]);

    const fetchData = useCallback(async () => {
        try {
            const start = view === 'week' ? weekDays[0].toISOString().split('T')[0] : monthDays[0].toISOString().split('T')[0];
            const end = view === 'week' ? weekDays[6].toISOString().split('T')[0] : monthDays[monthDays.length - 1].toISOString().split('T')[0];
            // 1. Get user and check permissions BEFORE other data
            const userData = await api.getCurrentUser();
            if (userData.role !== 'owner' && userData.role !== 'manager') {
                router.push("/home");
                return;
            }
            setUser(userData);

            // 2. Fetch other data
            const [agendaData, tenantData] = await Promise.all([
                api.getAdminAgenda(start, end),
                api.getTenantSettings()
            ]);
            setUser(userData);
            setTenant(tenantData);
            const flattenedItems = [
                ...agendaData.sessions.map((s: any) => {
                    const dt = new Date(s.start_time);
                    return {
                        ...s,
                        type: "session" as const,
                        // date local au format YYYY-MM-DD
                        date: dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, '0') + "-" + String(dt.getDate()).padStart(2, '0'),
                        time: dt.getHours().toString().padStart(2, '0') + ":" + dt.getMinutes().toString().padStart(2, '0')
                    };
                }),
                ...agendaData.events.map((e: any) => ({ 
                    ...e, 
                    type: "event" as const, 
                    date: e.event_date, 
                    time: e.event_time 
                }))
            ];
            setItems(flattenedItems);
            
            // Re-sync selected item if open
            if (selectedItem) {
                const updated = flattenedItems.find(i => i.id === selectedItem.id && i.type === selectedItem.type);
                if (updated) setSelectedItem(updated);
            }
        } catch (err: any) {
            console.error(err);
            if (err.response?.status === 401) {
                router.push(`/${params.slug}`);
            }
        } finally {
            setLoading(false);
        }
    }, [router, weekDays, monthDays, view]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const startDateTime = `${formData.date}T${formData.time}:00`;
            const startDate = new Date(startDateTime);
            const durationMs = formData.duration_minutes * 60 * 1000;

            const dates = [startDate];
            if (formData.recurrence !== "none" && formData.recurrence_count > 1) {
                for (let i = 1; i < formData.recurrence_count; i++) {
                    const d = new Date(startDate);
                    if (formData.recurrence === "daily") d.setDate(d.getDate() + i);
                    else if (formData.recurrence === "weekly") d.setDate(d.getDate() + i * 7);
                    else if (formData.recurrence === "monthly") d.setMonth(d.getMonth() + i);
                    dates.push(d);
                }
            }

            for (const d of dates) {
                const endD = new Date(d.getTime() + durationMs);
                await api.createSession({
                    title: formData.title,
                    instructor_name: formData.instructor_name || undefined,
                    start_time: d.toISOString(),
                    end_time: endD.toISOString(),
                    max_participants: formData.max_participants,
                    credits_required: formData.credits_required,
                    location: formData.location || undefined,
                    allow_waitlist: formData.allow_waitlist,
                });
            }

            await fetchData();
            setShowForm(false);
            setFormData({ ...emptyForm });
        } catch (err) { alert("Erreur lors de la création"); } 
        finally { setSaving(false); }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSession) return;
        setSaving(true);
        try {
            if (editingSession.type === 'event') {
                await api.updateAdminEvent(editingSession.id, {
                    title: formData.title,
                    instructor_name: formData.instructor_name || undefined,
                    event_date: formData.date,
                    event_time: formData.time,
                    duration_minutes: formData.duration_minutes,
                    max_places: formData.max_participants,
                    location: formData.location || undefined,
                    allow_waitlist: formData.allow_waitlist,
                });
            } else {
                const startDt = new Date(`${formData.date}T${formData.time}:00`);
                const endDt = new Date(startDt.getTime() + formData.duration_minutes * 60 * 1000);
                await api.updateSession(editingSession.id, {
                    title: formData.title,
                    instructor_name: formData.instructor_name || undefined,
                    start_time: startDt.toISOString(),
                    end_time: endDt.toISOString(),
                    max_participants: formData.max_participants,
                    credits_required: formData.credits_required,
                    location: formData.location || undefined,
                    allow_waitlist: formData.allow_waitlist,
                });
            }
            setEditingSession(null);
            setShowForm(false);
            setFormData({ ...emptyForm });
            await fetchData();
        } catch (err) { alert("Erreur lors de la modification"); } 
        finally { setSaving(false); }
    };

    const openEdit = (s: any) => {
        const isEvent = s.type === 'event';
        let startDt: Date, dur: number;

        if (isEvent) {
            startDt = new Date(s.event_date);
            dur = s.duration_minutes;
        } else {
            startDt = new Date(s.start_time);
            const endDt = new Date(s.end_time);
            dur = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
        }

        setEditingSession(s);
        setFormData({
            title: s.title,
            description: s.description || "",
            instructor_name: s.instructor_name || "",
            date: isEvent ? s.event_date : startDt.getFullYear() + "-" + String(startDt.getMonth() + 1).padStart(2, '0') + "-" + String(startDt.getDate()).padStart(2, '0'),
            time: isEvent ? s.event_time : startDt.getHours().toString().padStart(2, '0') + ":" + startDt.getMinutes().toString().padStart(2, '0'),
            duration_minutes: dur,
            max_participants: isEvent ? s.max_places : s.max_participants,
            credits_required: isEvent ? 0 : s.credits_required,
            location: s.location || "",
            allow_waitlist: s.allow_waitlist || true,
            recurrence: "none",
            recurrence_count: 1,
        });
        setShowDetails(false);
        setShowForm(true);
    };

    const handleDuplicate = async () => {
        try {
            await api.duplicateSessions({
                source_start: `${duplicateData.source_start}T00:00:00`,
                source_end: `${duplicateData.source_end}T23:59:59`,
                target_start: `${duplicateData.target_start}T00:00:00`,
            });
            setShowDuplicateModal(false);
            await fetchData();
        } catch (err) { alert("Erreur lors de la duplication"); }
    };

    const handleCancelItem = async (item: any) => {
        setConfirmModal({
            show: true,
            title: "Annuler l'activité ?",
            message: `Êtes-vous sûr de vouloir annuler "${item.title}" ? Les participants seront informés et remboursés le cas échéant.`,
            type: 'warning',
            onConfirm: async () => {
                try {
                    if (item.type === 'session') await api.cancelSession(item.id);
                    else await api.cancelAdminEvent(item.id);
                    await fetchData();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                } catch (err) { alert("Erreur lors de l'annulation"); }
            }
        });
    };

    const handleReactivateItem = async (item: any) => {
        setConfirmModal({
            show: true,
            title: "Réactiver l'activité ?",
            message: `Souhaitez-vous réactiver "${item.title}" ? Elle sera de nouveau visible et réservable.`,
            type: 'info',
            onConfirm: async () => {
                try {
                    if (item.type === 'session') await api.reactivateSession(item.id);
                    else await api.reactivateAdminEvent(item.id);
                    await fetchData();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                } catch (err) { alert("Erreur lors de la réactivation"); }
            }
        });
    };

    const handleDeleteItem = async (item: any) => {
        setConfirmModal({
            show: true,
            title: "Suppression définitive ?",
            message: `Attention : cette action est irréversible. Toutes les données associées à "${item.title}" seront supprimées.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    if (item.type === 'session') await api.deleteSession(item.id);
                    else await api.deleteAdminEvent(item.id);
                    setShowDetails(false);
                    await fetchData();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                } catch (err) { alert("Erreur lors de la suppression"); }
            }
        });
    };

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Chargement...</div>;

    return (
        <div className="flex min-h-screen bg-white font-sans text-slate-900 overflow-hidden">
            <Sidebar user={user} tenant={tenant} />

            <main className="flex-1 p-8 md:p-12 overflow-auto bg-[#fafafa]">
                <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
                    
                    {/* Header Image 2 Style */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <span className="text-3xl">📋</span>
                            <h1 className="text-4xl font-extrabold tracking-tight text-[#0f172a] font-sans">Agenda</h1>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</div>
                                <input 
                                    type="text" 
                                    placeholder="Rechercher..." 
                                    className="pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl w-64 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none transition-all"
                                />
                            </div>
                            <button 
                                onClick={() => setShowDuplicateModal(true)}
                                className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
                            >
                                ↺ Dupliquer
                            </button>
                            <button 
                                onClick={() => { setShowForm(true); setEditingSession(null); setFormData({ ...emptyForm }); }}
                                className="px-5 py-2.5 bg-[#0f172a] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                            >
                                + Nouvelle séance
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filtrer par Lieu :</span>
                            <select 
                                value={locationFilter}
                                onChange={(e) => setLocationFilter(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900 transition-all min-w-[150px]"
                            >
                                <option value="all">Tous les lieux</option>
                                {(tenant?.locations || []).map((loc: string) => (
                                    <option key={loc} value={loc}>{loc}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Navigation Bar Image 2 Style */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-6">
                        <div className="flex items-center gap-6">
                            <div className="text-base font-bold text-slate-800 tracking-tight">
                                {view === 'week' ? (
                                    <>
                                        {weekDays[0].toLocaleDateString("fr-FR", { day: 'numeric', month: 'short' })} — {weekDays[6].toLocaleDateString("fr-FR", { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </>
                                ) : (
                                    <>
                                        {currentDate.toLocaleDateString("fr-FR", { month: 'long', year: 'numeric' })}
                                    </>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center bg-white p-1 rounded-2xl border border-slate-200 shadow-sm transition-all focus-within:shadow-md">
                                    <button 
                                        onClick={() => {
                                            const newDate = new Date(currentDate);
                                            if (view === 'week') newDate.setDate(newDate.getDate() - 7);
                                            else newDate.setMonth(newDate.getMonth() - 1);
                                            setCurrentDate(newDate);
                                        }} 
                                        className="p-2 hover:bg-slate-50 rounded-xl transition-all"
                                    >
                                        ←
                                    </button>
                                    <button onClick={() => setCurrentDate(new Date())} className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors">Aujourd'hui</button>
                                    <button 
                                        onClick={() => {
                                            const newDate = new Date(currentDate);
                                            if (view === 'week') newDate.setDate(newDate.getDate() + 7);
                                            else newDate.setMonth(newDate.getMonth() + 1);
                                            setCurrentDate(newDate);
                                        }} 
                                        className="p-2 hover:bg-slate-50 rounded-xl transition-all"
                                    >
                                        →
                                    </button>
                                </div>
                                <div className="flex items-center bg-slate-900 p-1 rounded-2xl shadow-xl">
                                    <button 
                                        onClick={() => setView('week')}
                                        className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${view === 'week' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'}`}
                                    >
                                        Semaine
                                    </button>
                                    <button 
                                        onClick={() => setView('month')}
                                        className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${view === 'month' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'}`}
                                    >
                                        Mois
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2.5 group cursor-help">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] shadow-sm shadow-blue-200 transition-transform group-hover:scale-125"></span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Séance</span>
                            </div>
                            <div className="flex items-center gap-2.5 group cursor-help">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shadow-sm shadow-amber-200 transition-transform group-hover:scale-125"></span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Évènement</span>
                            </div>
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.02)] border border-slate-100 overflow-hidden">
                        <div className="grid grid-cols-7 border-b border-slate-100/50 bg-white shadow-[0_1px_0_0_rgba(15,23,42,0.02)]">
                            {DAYS_FR.map((day, idx) => (
                                <div key={idx} className="p-6 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
                                    {day}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100/50 bg-[#fafafa]/30">
                            {(view === 'week' ? weekDays : monthDays).map((date, idx) => {
                                const isToday = date.toDateString() === new Date().toDateString();
                                const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                                const dayStr = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, '0') + "-" + String(date.getDate()).padStart(2, '0');
                                const dayItems = items
                                    .filter(i => i.date === dayStr)
                                    .filter(i => locationFilter === "all" || i.location === locationFilter)
                                    .sort((a, b) => a.time.localeCompare(b.time));

                                return (
                                    <div 
                                        key={idx} 
                                        className={`p-4 min-h-[180px] space-y-3 transition-colors ${
                                            view === 'month' && !isCurrentMonth ? 'opacity-30 grayscale-[50%]' : ''
                                        } ${isToday ? 'bg-white shadow-inner' : ''}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className={`text-sm font-black transition-all h-8 w-8 flex items-center justify-center rounded-full ${
                                                isToday ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 group-hover:text-slate-900"
                                            }`}>
                                                {date.getDate()}
                                            </div>
                                            {dayItems.length > 0 && view === 'month' && (
                                                <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                                    {dayItems.length} {dayItems.length > 1 ? 'activités' : 'activité'}
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-3">
                                            {dayItems.map(item => {
                                                const isSession = item.type === "session";
                                                
                                                return (
                                                    <div 
                                                        key={item.id}
                                                        onClick={() => { setSelectedItem(item); setShowDetails(true); }}
                                                        className={`p-3 rounded-2xl border cursor-pointer transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] group/item ${
                                                            !item.is_active ? "opacity-40 grayscale" : ""
                                                        } ${
                                                            isSession 
                                                            ? "bg-white border-blue-50 text-blue-900 shadow-[0_4px_12px_rgba(59,130,246,0.04)]" 
                                                            : "bg-white border-amber-50 text-amber-900 shadow-[0_4px_12px_rgba(245,158,11,0.04)]"
                                                        }`}
                                                    >
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[9px] font-black tracking-tight">{item.time}</span>
                                                                <div className={`w-1.5 h-1.5 rounded-full ${isSession ? 'bg-blue-400' : 'bg-amber-400'}`}></div>
                                                            </div>
                                                            <div className="text-[10px] font-bold uppercase tracking-tight text-slate-900 truncate">
                                                                {item.title}
                                                            </div>
                                                            
                                                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                                                    <span>👤</span> {item.instructor_name || "N/A"}
                                                                </div>
                                                                {item.location && (
                                                                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                                        <span>📍</span> {item.location}
                                                                    </div>
                                                                )}
                                                                <div className="ml-auto text-[8px] font-black text-slate-300">
                                                                    {item.current_participants}/{item.max_participants} 👥
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </main>

            {/* Session Details Modal */}
            {showDetails && selectedItem && (
                <div className="fixed inset-0 bg-[#0f172a]/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in zoom-in duration-300">
                    <div className="bg-white rounded-3xl p-10 max-w-4xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-start mb-8">
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                        selectedItem.type === 'session' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                    }`}>
                                        {selectedItem.type === 'session' ? 'Séance' : 'Évènement'}
                                    </span>
                                    {!selectedItem.is_active && (
                                        <span className="bg-rose-50 text-rose-500 border border-rose-100 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                                            Annulé
                                        </span>
                                    )}
                                    <span className="text-slate-300 text-sm font-bold">{selectedItem.time}</span>
                                </div>
                                <h2 className={`text-4xl font-black text-slate-900 tracking-tight ${!selectedItem.is_active ? 'line-through opacity-50' : ''}`}>
                                    {selectedItem.title}
                                </h2>
                                <div className="flex items-center gap-6 text-slate-500 font-bold text-sm">
                                    <div className="flex items-center gap-2"><span>👤</span> {selectedItem.instructor_name || "N/A"}</div>
                                    <div className="flex items-center gap-2"><span>📍</span> {selectedItem.location || "Aucun lieu"}</div>
                                    <div className="flex items-center gap-2">
                                        <span>⏳</span> {selectedItem.type === 'event' ? formatDuration(selectedItem.duration_minutes) : formatDuration(calculateDuration(selectedItem.start_time, selectedItem.end_time))}
                                    </div>
                                    <div className="flex items-center gap-2"><span>👥</span> {selectedItem.current_participants}/{selectedItem.max_participants} inscrits</div>
                                </div>
                            </div>
                            <button onClick={() => setShowDetails(false)} className="h-12 w-12 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-full transition-all text-2xl flex items-center justify-center">×</button>
                        </div>

                        <div className="flex-1 overflow-auto bg-slate-50/50 rounded-2xl border border-slate-100 p-8 mb-8">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Liste d'émargement</h3>
                                {selectedItem.registered_users?.length > 0 && (
                                    <button 
                                        onClick={() => {
                                            const emails = selectedItem.registered_users.map((u: any) => u.email).join(',');
                                            window.location.href = `mailto:?bcc=${emails}&subject=Information sur votre séance : ${selectedItem.title}`;
                                        }}
                                        className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg transition-all"
                                    >
                                        📧 Email groupé
                                    </button>
                                )}
                            </div>
                            
                            {selectedItem.registered_users?.length > 0 ? (
                                <div className="space-y-3">
                                    {selectedItem.registered_users.map((u: any, idx: number) => (
                                        <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200/50 flex items-center justify-between shadow-sm">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center text-sm font-black text-slate-400">
                                                    {u.first_name[0]}{u.last_name[0]}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-black text-slate-900">{u.first_name} {u.last_name}</div>
                                                    <div className="text-xs font-bold text-slate-400">{u.email}</div>
                                                </div>
                                            </div>
                                            <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest px-3 py-1 bg-emerald-50 rounded-lg">Présent</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-400 font-bold italic">Aucun inscrit pour le moment.</div>
                            )}

                            {selectedItem.waitlist_users?.length > 0 && (
                                <div className="mt-12 pt-8 border-t border-slate-200">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                            <span>⏳</span> Liste d'attente
                                        </h3>
                                        <button 
                                            onClick={() => {
                                                const emails = selectedItem.waitlist_users.map((u: any) => u.email).join(',');
                                                window.location.href = `mailto:?bcc=${emails}&subject=Information sur votre séance : ${selectedItem.title} (Liste d'attente)`;
                                            }}
                                            className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                                        >
                                            📧 Email groupé (LA)
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {selectedItem.waitlist_users.map((u: any, idx: number) => (
                                            <div key={idx} className="bg-white/50 p-4 rounded-2xl border border-slate-200/50 flex items-center justify-between shadow-sm">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-10 bg-slate-200/50 rounded-full flex items-center justify-center text-sm font-black text-slate-400">
                                                        {u.first_name[0]}{u.last_name[0]}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-black text-slate-600">{u.first_name} {u.last_name}</div>
                                                        <div className="text-xs font-bold text-slate-400">{u.email}</div>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] font-black text-orange-500 uppercase tracking-widest px-3 py-1 bg-orange-50 rounded-lg">En attente</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4">
                            <button 
                                onClick={() => openEdit(selectedItem)}
                                className="flex-1 px-8 py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all shadow-sm"
                            >
                                ✏️ Modifier
                            </button>
                            {selectedItem.is_active ? (
                                <button 
                                    onClick={() => handleCancelItem(selectedItem)}
                                    className="px-8 py-4 bg-amber-50 text-amber-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-amber-100 transition-all border border-amber-100"
                                >
                                    🚫 Annuler
                                </button>
                            ) : (
                                <button 
                                    onClick={() => handleReactivateItem(selectedItem)}
                                    className="px-8 py-4 bg-emerald-50 text-emerald-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-100 transition-all border border-emerald-100"
                                >
                                    🔄 Réactiver
                                </button>
                            )}
                            <button 
                                onClick={() => handleDeleteItem(selectedItem)}
                                className="px-8 py-4 bg-rose-50 text-rose-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-rose-100 transition-all border border-rose-100"
                            >
                                🗑️ Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal.show && (
                <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl border border-slate-100">
                        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl mb-6 ${
                            confirmModal.type === 'danger' ? 'bg-rose-50 text-rose-500' : 
                            confirmModal.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                            {confirmModal.type === 'danger' ? '⚠️' : confirmModal.type === 'warning' ? '🚫' : '🔄'}
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">{confirmModal.title}</h3>
                        <p className="text-slate-500 font-bold text-sm leading-relaxed mb-8">{confirmModal.message}</p>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                                className="flex-1 px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={confirmModal.onConfirm}
                                className={`flex-1 px-6 py-4 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${
                                    confirmModal.type === 'danger' ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-200' : 
                                    confirmModal.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-200'
                                }`}
                            >
                                Confirmer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create/Edit Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-[#0f172a]/60 backdrop-blur-md flex items-center justify-center z-[110] p-4 animate-in fade-in zoom-in duration-300">
                    <div className="bg-white rounded-3xl p-10 max-w-2xl w-full shadow-2xl border border-slate-100 overflow-y-auto max-h-[90vh]">
                        <h2 className="text-3xl font-black text-slate-900 mb-8 tracking-tight">
                            {editingSession ? "Modifier la séance" : "Créer une séance"}
                        </h2>
                        <form onSubmit={editingSession ? handleEditSubmit : handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Intitulé *</label>
                                    <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Lieu / Salle</label>
                                    <select 
                                        value={formData.location} 
                                        onChange={e => setFormData({...formData, location: e.target.value})} 
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700"
                                    >
                                        <option value="">Aucun lieu spécifique</option>
                                        {(tenant?.locations || []).map((loc: string) => (
                                            <option key={loc} value={loc}>{loc}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Date *</label>
                                    <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Heure *</label>
                                    <input type="time" required value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Durée</label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 relative">
                                            <input 
                                                type="number" 
                                                min="0"
                                                placeholder="HH"
                                                value={Math.floor(formData.duration_minutes / 60) || ""} 
                                                onChange={e => {
                                                    const h = parseInt(e.target.value) || 0;
                                                    const m = formData.duration_minutes % 60;
                                                    setFormData({...formData, duration_minutes: h * 60 + m});
                                                }} 
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700 text-center" 
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300 pointer-events-none">H</span>
                                        </div>
                                        <div className="flex-1 relative">
                                            <input 
                                                type="number" 
                                                min="0"
                                                max="59"
                                                placeholder="MM"
                                                value={formData.duration_minutes % 60 || ""} 
                                                onChange={e => {
                                                    const m = Math.min(59, parseInt(e.target.value) || 0);
                                                    const h = Math.floor(formData.duration_minutes / 60);
                                                    setFormData({...formData, duration_minutes: h * 60 + m});
                                                }} 
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700 text-center" 
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300 pointer-events-none">MIN</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Attribution (Instructeur)</label>
                                    <input type="text" value={formData.instructor_name} onChange={e => setFormData({...formData, instructor_name: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700" placeholder="Nom de l'instructeur" />
                                </div>
                            
                            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <input 
                                    type="checkbox" 
                                    id="allow_waitlist" 
                                    checked={formData.allow_waitlist} 
                                    onChange={e => setFormData({...formData, allow_waitlist: e.target.checked})}
                                    className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                />
                                <label htmlFor="allow_waitlist" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                                    Autoriser la liste d'attente (Illimitée)
                                </label>
                            </div>
                            {!editingSession && (
                                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Récurrence</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <select value={formData.recurrence} onChange={e => setFormData({...formData, recurrence: e.target.value as any})} className="px-5 py-3.5 bg-white border border-slate-100 rounded-2xl font-bold text-slate-700">
                                            <option value="none">Une seule fois</option>
                                            <option value="daily">Quotidien</option>
                                            <option value="weekly">Hebdomadaire</option>
                                            <option value="monthly">Mensuel</option>
                                        </select>
                                        {formData.recurrence !== "none" && (
                                            <input type="number" min="2" max="52" value={formData.recurrence_count} onChange={e => setFormData({...formData, recurrence_count: parseInt(e.target.value)})} className="px-5 py-3.5 bg-white border border-slate-100 rounded-2xl font-bold text-slate-700" placeholder="Nombre d'occurrences" />
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all">Annuler</button>
                                <button type="submit" disabled={saving} className="flex-1 px-8 py-4 bg-[#0f172a] text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 disabled:opacity-50">
                                    {saving ? "Chargement..." : editingSession ? "Enregistrer" : "Créer"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Duplicate Modal */}
            {showDuplicateModal && (
                <div className="fixed inset-0 bg-[#0f172a]/60 backdrop-blur-md flex items-center justify-center z-[110] p-4">
                    <div className="bg-white rounded-3xl p-10 max-w-lg w-full shadow-2xl border border-slate-100">
                        <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Dupliquer des séances</h3>
                        <p className="text-slate-400 text-sm mb-8 font-medium italic">Copiez un bloc de séances vers une autre période</p>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Source : Du</label>
                                    <input type="date" value={duplicateData.source_start} onChange={e => setDuplicateData({...duplicateData, source_start: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Au</label>
                                    <input type="date" value={duplicateData.source_end} onChange={e => setDuplicateData({...duplicateData, source_end: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Cible : Nouvelle date de début</label>
                                <input type="date" value={duplicateData.target_start} onChange={e => setDuplicateData({...duplicateData, target_start: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700" />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowDuplicateModal(false)} className="flex-1 px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px]">Annuler</button>
                                <button onClick={handleDuplicate} className="flex-1 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-700 shadow-xl shadow-emerald-900/20">Confirmer</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
