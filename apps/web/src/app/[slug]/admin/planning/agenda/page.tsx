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
    const [searchTerm, setSearchTerm] = useState("");
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
            const start = (view === 'week' ? weekDays[0] : monthDays[0])?.toISOString()?.split('T')[0] || new Date().toISOString().split('T')[0];
            const end = (view === 'week' ? weekDays[6] : monthDays[monthDays.length - 1])?.toISOString()?.split('T')[0] || new Date().toISOString().split('T')[0];
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
                ...(agendaData?.sessions || []).map((s: any) => {
                    const dt = new Date(s.start_time);
                    const dtEnd = new Date(s.end_time);
                    return {
                        ...s,
                        type: "session" as const,
                        date: dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, '0') + "-" + String(dt.getDate()).padStart(2, '0'),
                        time: dt.getHours().toString().padStart(2, '0') + ":" + dt.getMinutes().toString().padStart(2, '0'),
                        endTime: dtEnd.getHours().toString().padStart(2, '0') + ":" + dtEnd.getMinutes().toString().padStart(2, '0')
                    };
                }),
                ...(agendaData?.events || []).map((e: any) => {
                    const timeStr = e?.event_time || e?.time || "00:00";
                    const parts = timeStr.includes(':') ? timeStr.split(':') : timeStr.includes('h') ? timeStr.split('h') : [timeStr, "0"];
                    const h = parseInt(parts[0]) || 0;
                    const m = parseInt(parts[1]) || 0;
                    const dt = new Date();
                    dt.setHours(h, m, 0, 0);
                    const dtEnd = new Date(dt.getTime() + (e.duration_minutes || 60) * 60000);
                    return { 
                        ...e, 
                        type: "event" as const, 
                        date: (e?.date || e?.event_date || "").split('T')[0], 
                        time: timeStr,
                        is_active: true,
                        endTime: dtEnd.getHours().toString().padStart(2, '0') + ":" + dtEnd.getMinutes().toString().padStart(2, '0')
                    };
                })
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

            <main className="flex-1 p-4 md:p-6 overflow-auto bg-[#fafafa]">
                <div className="max-w-full mx-auto space-y-6 animate-in fade-in duration-500 px-2">
                    
                    {/* Header Modernized */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-1">
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight flex items-center gap-3">
                                📅 Agenda
                            </h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Gérez votre planning et vos inscriptions</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => setShowDuplicateModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-medium shadow-sm"
                            >
                                ↺ Dupliquer
                            </button>
                            <button 
                                onClick={() => { setShowForm(true); setEditingSession(null); setFormData({ ...emptyForm }); }}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium shadow-sm"
                            >
                                ➕ Nouvelle séance
                            </button>
                        </div>
                    </div>

                    {/* Integrated Navigation and Filter Bar */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-6 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                            <div className="text-base font-bold text-slate-800 tracking-tight whitespace-nowrap min-w-[140px]">
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
                            
                            <div className="flex items-center gap-1.5">
                                <div className="flex items-center bg-slate-50 h-9 rounded-lg border border-slate-200">
                                    <button 
                                        onClick={() => {
                                            const newDate = new Date(currentDate);
                                            if (view === 'week') newDate.setDate(newDate.getDate() - 7);
                                            else newDate.setMonth(newDate.getMonth() - 1);
                                            setCurrentDate(newDate);
                                        }} 
                                        className="px-2.5 h-full hover:bg-white hover:shadow-sm transition-all text-slate-400 hover:text-slate-900"
                                    >
                                        ←
                                    </button>
                                    <button onClick={() => setCurrentDate(new Date())} className="px-3 h-full text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:bg-white hover:shadow-sm transition-all">Aujourd'hui</button>
                                    <button 
                                        onClick={() => {
                                            const newDate = new Date(currentDate);
                                            if (view === 'week') newDate.setDate(newDate.getDate() + 7);
                                            else newDate.setMonth(newDate.getMonth() + 1);
                                            setCurrentDate(newDate);
                                        }} 
                                        className="px-2.5 h-full hover:bg-white hover:shadow-sm transition-all text-slate-400 hover:text-slate-900"
                                    >
                                        →
                                    </button>
                                </div>

                                <div className="flex items-center bg-slate-100/50 p-1 h-9 rounded-lg border border-slate-200">
                                    <button 
                                        onClick={() => setView('week')}
                                        className={`px-3 h-full text-[10px] font-bold uppercase tracking-wider transition-all rounded-md flex items-center ${view === 'week' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
                                    >
                                        Semaine
                                    </button>
                                    <button 
                                        onClick={() => setView('month')}
                                        className={`px-3 h-full text-[10px] font-bold uppercase tracking-wider transition-all rounded-md flex items-center ${view === 'month' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
                                    >
                                        Mois
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-1 items-center gap-3 md:justify-end">
                            <select 
                                value={locationFilter}
                                onChange={(e) => setLocationFilter(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:ring-1 focus:ring-slate-900 transition-all min-w-[140px]"
                            >
                                <option value="all">Tous les lieux</option>
                                {(tenant?.locations || []).map((loc: string) => (
                                    <option key={loc} value={loc}>{loc}</option>
                                ))}
                            </select>

                            <div className="relative group flex-1 max-w-[240px]">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</div>
                                <input 
                                    type="text" 
                                    placeholder="Recherche" 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-8 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-slate-900 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.02)] border border-slate-100 overflow-hidden">
                        <div className="grid grid-cols-7 border-b border-slate-100/50 bg-slate-200 shadow-[0_1px_0_0_rgba(15,23,42,0.02)]">
                            {DAYS_FR.map((day, idx) => (
                                <div key={idx} className="p-4 text-center text-[10px] font-medium uppercase tracking-[0.3em] text-slate-900">
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
                                    .filter(i => {
                                        if (!searchTerm) return true;
                                        const q = searchTerm.toLowerCase();
                                        return (i.title || "").toLowerCase().includes(q) || 
                                               (i.instructor_name || "").toLowerCase().includes(q) || 
                                               (i.location || "").toLowerCase().includes(q);
                                    })
                                    .sort((a, b) => a.time.localeCompare(b.time));

                                return (
                                    <div 
                                        key={idx} 
                                        className={`px-1 pt-1.5 pb-6 md:px-1.5 md:pt-1.5 md:pb-10 bg-white/50 min-h-[160px] border-r border-slate-100/50 space-y-2.5 transition-colors ${
                                            view === 'month' && !isCurrentMonth ? 'opacity-30 grayscale-[50%]' : ''
                                        } ${isToday ? 'bg-white shadow-inner' : ''}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className={`text-sm font-medium transition-all h-8 w-8 flex items-center justify-center rounded-full ${
                                                isToday ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 group-hover:text-slate-900"
                                            }`}>
                                                {date.getDate()}
                                            </div>
                                            {dayItems.length > 0 && view === 'month' && (
                                                <div className="text-[9px] font-medium text-slate-500 lowercase tracking-tight italic pr-1.5">
                                                    {dayItems.length} {dayItems.length > 1 ? 'items' : 'item'}
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-3">
                                            {dayItems.map(item => {
                                                const isSession = item.type === "session";
                                                const fillPercent = (item.current_participants / item.max_participants) * 100;
                                                const accentColor = isSession ? "border-blue-500" : "border-orange-500";
                                                const hoverBorder = isSession ? "group-hover/card:border-blue-200" : "group-hover/card:border-orange-200";
                                                const hoverBg = isSession ? "group-hover/card:bg-blue-50/30" : "group-hover/card:bg-orange-50/30";
                                                const iconColor = isSession ? "text-blue-500/50" : "text-orange-500/50";
                                                
                                                return (
                                                    <div 
                                                        key={item.id}
                                                        onClick={() => { setSelectedItem(item); setShowDetails(true); }}
                                                        className={`bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-xl hover:translate-y-[-2px] hover:bg-slate-50 transition-all duration-300 border-l-[4px] ${accentColor} cursor-pointer p-2.5 flex flex-col gap-2.5 group/card ${
                                                            item.is_active === false ? "opacity-40 grayscale" : ""
                                                        }`}
                                                    >
                                                        {/* Top Row: Time (Restored visibility) */}
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-slate-700 text-[11px] font-medium">
                                                                {item.time} — {item.endTime}
                                                            </span>
                                                            <div className="w-full mt-2">
                                                                <h4 className={`w-full bg-slate-50 text-slate-900 font-bold text-[13px] leading-snug px-3 py-2 rounded-xl border border-slate-100 shadow-sm transition-all ${hoverBorder} ${hoverBg} text-center`}>
                                                                    {item.title}
                                                                </h4>
                                                            </div>
                                                        </div>

                                                        {/* Metadata and Capacity */}
                                                        <div className="space-y-1.5 border-t border-slate-50 pt-2">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2 text-[11px] text-slate-500/50 font-medium min-w-0">
                                                                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                    </svg>
                                                                    <span className="truncate text-slate-500 font-medium">{item.instructor_name || "Non assigné"}</span>
                                                                </div>
                                                                
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    {(() => {
                                                                        const current = item.current_participants ?? 0;
                                                                        const max = item.max_participants ?? 0;
                                                                        const percent = max > 0 ? (current / max) * 100 : 0;
                                                                        
                                                                        let badgeClass = "bg-slate-50 text-slate-400 border-slate-100"; // Gris par défaut (0/0 ou inactif)
                                                                        
                                                                        if (item.is_active !== false && max > 0) {
                                                                            if (percent >= 100) badgeClass = "bg-emerald-100 text-emerald-900 border-emerald-200";
                                                                            else if (percent > 70) badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-100";
                                                                            else if (percent >= 40) badgeClass = "bg-blue-50 text-blue-700 border-blue-100";
                                                                            else badgeClass = "bg-amber-50 text-amber-700 border-amber-100";
                                                                        }

                                                                        return (
                                                                            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}`}>
                                                                                {current}/{max}
                                                                            </div>
                                                                        );
                                                                    })()}

                                                                    {item.allow_waitlist && (item.waitlist_count > 0 || (item.waitlist_users || []).length > 0) && (
                                                                        <div className="flex items-center gap-1 text-[10px] font-bold animate-pulse">
                                                                            <span className="text-orange-600">⏳</span>
                                                                            <span className="text-slate-700">{item.waitlist_count || item.waitlist_users?.length}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {item.location && (
                                                                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 font-medium">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <span className="w-4 h-4 flex items-center justify-center opacity-70">📍</span>
                                                                        <span className="truncate">{item.location}</span>
                                                                    </div>
                                                                </div>
                                                            )}
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
