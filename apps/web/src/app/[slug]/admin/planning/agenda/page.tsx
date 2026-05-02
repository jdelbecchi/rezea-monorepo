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
    duration_minutes: "" as any,
    max_participants: "" as any,
    credits_required: "" as any,
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

    const [showDetails, setShowDetails] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [attendanceTab, setAttendanceTab] = useState<'registered' | 'waitlist' | 'cancelled' | 'edit'>('registered');
    const [contactUser, setContactUser] = useState<any>(null);
    const [includeWaitlistInEmail, setIncludeWaitlistInEmail] = useState(false);

    // Confirmation Modal
    const [confirmModal, setConfirmModal] = useState<{
        show: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'danger' | 'warning' | 'info';
    }>({ show: false, title: "", message: "", onConfirm: () => { }, type: 'info' });

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
                        endTime: dtEnd.getHours().toString().padStart(2, '0') + ":" + dtEnd.getMinutes().toString().padStart(2, '0')
                    };
                })
            ];
            setItems(flattenedItems);

            // Refresh the current item in the details modal if it's open
            if (showDetails && selectedItem) {
                const refreshedData = await api.getAdminAgenda(start, end);
                const refreshedFlattened = [
                    ...(refreshedData?.sessions || []).map((s: any) => {
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
                    ...(refreshedData?.events || []).map((e: any) => {
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
                            endTime: dtEnd.getHours().toString().padStart(2, '0') + ":" + dtEnd.getMinutes().toString().padStart(2, '0')
                        };
                    })
                ];
                const updated = refreshedFlattened.find(i => i.id === selectedItem.id && i.type === selectedItem.type);
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

    const handleToggleAttendance = async (participant: any) => {
        try {
            const newStatus = ['confirmed', 'confirmed_payment'].includes(participant.status) ? 'absent' : 'confirmed';
            if (selectedItem.type === 'session') {
                await api.updateAdminBooking(participant.id, { status: newStatus });
            } else {
                await api.updateAdminEventRegistration(participant.id, { status: newStatus });
            }
            // Trigger a silent background refresh
            await fetchData();
        } catch (err) {
            console.error("Error toggling attendance:", err);
        }
    };

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

                // Format manually to preserve local time and avoid UTC offset
                const formatISO = (date: Date) => {
                    const pad = (n: number) => n.toString().padStart(2, '0');
                    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
                };

                await api.createSession({
                    title: formData.title,
                    description: formData.description || undefined,
                    instructor_name: formData.instructor_name || undefined,
                    start_time: formatISO(d),
                    end_time: formatISO(endD),
                    max_participants: formData.max_participants,
                    credits_required: formData.credits_required,
                    location: formData.location || undefined,
                    allow_waitlist: formData.allow_waitlist,
                });
            }

            await fetchData();
            setShowForm(false);
            setEditingSession(null);

            // If we were editing in the detail modal, refresh is handled by fetchData background refresh in fetchData loop
            // but we might want to switch back to registered tab
            if (showDetails) {
                setAttendanceTab('registered');
            }
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
                    description: formData.description || undefined,
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

                const formatISO = (date: Date) => {
                    const pad = (n: number) => n.toString().padStart(2, '0');
                    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
                };

                await api.updateSession(editingSession.id, {
                    title: formData.title,
                    description: formData.description || undefined,
                    instructor_name: formData.instructor_name || undefined,
                    start_time: formatISO(startDt),
                    end_time: formatISO(endDt),
                    max_participants: formData.max_participants,
                    credits_required: formData.credits_required,
                    location: formData.location || undefined,
                    allow_waitlist: formData.allow_waitlist,
                });
            }
            setEditingSession(null);
            setShowForm(false);
            if (showDetails) {
                setShowDetails(false);
            }
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
            title: "Confirmer l'annulation",
            message: `Êtes-vous sûr de vouloir annuler "${item.title}" ? Les participants seront recrédités et recevront une notification.`,
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
            title: "Confirmer la suppression",
            message: `Attention : cette action est irréversible. Les inscriptions liées à "${item.title}" seront supprimées.`,
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
        <div className="flex min-h-screen bg-white text-slate-900 overflow-hidden">
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
                                className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl hover:bg-slate-50 transition-all font-medium shadow-sm text-sm"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Dupliquer
                            </button>
                            <button
                                onClick={() => { setShowForm(true); setEditingSession(null); setFormData({ ...emptyForm }); }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-sm text-sm tracking-tight active:scale-95"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Nouvelle séance
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
                                        className={`px-1 pt-1.5 pb-6 md:px-1.5 md:pt-1.5 md:pb-10 bg-white/50 min-h-[160px] border-r border-slate-100/50 space-y-2.5 transition-colors ${view === 'month' && !isCurrentMonth ? 'opacity-30 grayscale-[50%]' : ''
                                            } ${isToday ? 'bg-white shadow-inner' : ''}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className={`text-sm font-medium transition-all h-8 w-8 flex items-center justify-center rounded-full ${isToday ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 group-hover:text-slate-900"
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
                                                const accentColor = isSession ? "border-blue-600" : "border-[#FBC02D]";
                                                const cardBg = isSession ? "bg-white" : "bg-gradient-to-b from-[#FEECA8] to-white";
                                                const cardBorder = isSession ? "border-slate-200" : "border-[#FBC02D]/30";
                                                const titleBg = isSession ? "bg-slate-50" : "bg-white/60 backdrop-blur-sm";
                                                const titleBorder = isSession ? "border-slate-100" : "border-[#FBC02D]/50";
                                                const titleText = isSession ? "text-slate-900" : "text-yellow-900";
                                                const hoverBorder = isSession ? "group-hover/card:border-blue-200" : "group-hover/card:border-yellow-400";
                                                const hoverBg = isSession ? "group-hover/card:bg-blue-50/30" : "group-hover/card:bg-yellow-100/20";

                                                return (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => {
                                                            setSelectedItem(item);
                                                            setAttendanceTab('registered');
                                                            setEditingSession(item);
                                                            setFormData({
                                                                title: item.title,
                                                                description: item.description || "",
                                                                instructor_name: item.instructor_name || "",
                                                                date: item.date,
                                                                time: item.time,
                                                                duration_minutes: item.duration_minutes || 60,
                                                                max_participants: item.max_participants,
                                                                credits_required: item.credits_required,
                                                                location: item.location || "",
                                                                allow_waitlist: item.allow_waitlist || true,
                                                                recurrence: "none",
                                                                recurrence_count: 1,
                                                            });
                                                            setShowDetails(true);
                                                        }}
                                                        className={`${cardBg} border ${cardBorder} rounded-xl shadow-sm hover:shadow-xl hover:translate-y-[-2px] transition-all duration-300 border-l-[4px] ${accentColor} cursor-pointer p-2.5 flex flex-col gap-2.5 group/card ${item.is_active === false ? "opacity-40 grayscale" : ""
                                                            }`}
                                                    >
                                                        {/* Top Row: Time (Restored visibility) */}
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-slate-700 text-[11px] font-medium">
                                                                {item.time} — {item.endTime}
                                                            </span>
                                                            <div className="w-full mt-2">
                                                                <h4 className={`w-full ${titleBg} ${titleText} font-bold text-[13px] leading-snug px-3 py-2 rounded-xl border ${titleBorder} shadow-sm transition-all ${hoverBorder} ${hoverBg} text-center`}>
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

                                                                        const badgeStyle = (item.is_active === false || max === 0)
                                                                            ? "bg-slate-50 text-slate-400 border-slate-100"
                                                                            : current === 0
                                                                                ? "bg-slate-50 text-slate-400 border-slate-100"
                                                                                : percent >= 100
                                                                                    ? "bg-emerald-100 text-emerald-900 border-emerald-200 font-bold"
                                                                                    : percent > 70 
                                                                                        ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                                                                                        : percent >= 40 
                                                                                            ? "bg-blue-50 text-blue-500 border-blue-100"
                                                                                            : "bg-amber-50 text-amber-600 border-amber-100";

                                                                        return (
                                                                            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle}`}>
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

            {showDetails && selectedItem && (
                <div className="fixed inset-0 bg-[#0f172a]/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in zoom-in duration-300">
                    <div className="bg-white rounded-3xl p-10 max-w-4xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-8">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-6">
                                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${selectedItem.type === 'session' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                        }`}>
                                        {selectedItem.type === 'session' ? 'Séance' : 'Évènement'}
                                    </span>
                                    {selectedItem.is_active === false && (
                                        <span className="bg-rose-50 text-rose-500 border border-rose-100 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                                            Annulé
                                        </span>
                                    )}
                                    <span className="text-slate-500 text-sm font-medium">{selectedItem.time}-{selectedItem.endTime}</span>
                                </div>
                                <h2 className={`text-2xl font-semibold text-slate-900 tracking-tight mb-4 ${!selectedItem.is_active ? 'line-through opacity-50' : ''}`}>
                                    {selectedItem.title}
                                </h2>
                                <div className="flex items-center gap-5 text-slate-600 font-medium text-[13px] mt-8">
                                    <div className="flex items-center gap-2 whitespace-nowrap"><span>👤</span> {selectedItem.instructor_name || "N/A"}</div>
                                    <div className="flex items-center gap-2 whitespace-nowrap"><span>📍</span> {selectedItem.location || "Aucun lieu"}</div>
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <span>⏳</span> {selectedItem.type === 'event' ? formatDuration(selectedItem.duration_minutes) : formatDuration(calculateDuration(selectedItem.start_time, selectedItem.end_time))}
                                    </div>
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <span>👥</span> 
                                        {(() => {
                                            const current = selectedItem.current_participants ?? 0;
                                            const max = selectedItem.max_participants ?? 0;
                                            const percent = max > 0 ? (current / max) * 100 : 0;
                                            const badgeStyle = current === 0 
                                                ? "bg-slate-50 text-slate-400 border-slate-100" 
                                                : percent >= 100
                                                    ? "bg-emerald-100 text-emerald-900 border-emerald-200 font-black"
                                                    : percent > 70 
                                                        ? "bg-emerald-50 text-emerald-600 border-emerald-100 font-bold" 
                                                        : percent >= 40 
                                                            ? "bg-blue-50 text-blue-500 border-blue-100 font-bold"
                                                            : "bg-amber-50 text-amber-600 border-amber-100 font-bold";
                                            return (
                                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${badgeStyle}`}>
                                                    {current}/{max} inscrit{current > 1 ? 's' : ''}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <span>💎</span> {selectedItem.credits_required || (selectedItem.price_cents ? selectedItem.price_cents / 100 : 0)} crédits
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-4">
                                <button
                                    onClick={() => setAttendanceTab(attendanceTab === 'edit' ? 'registered' : 'edit')}
                                    className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-sm font-medium transition-all hover:bg-slate-800 flex items-center gap-2 shadow-xl shadow-slate-900/10 active:scale-95"
                                >
                                    <span>{attendanceTab === 'edit' ? '← Retour' : '⚙️ Modifier'}</span>
                                </button>
                                <button onClick={() => setShowDetails(false)} className="h-14 w-14 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-full transition-all text-3xl flex items-center justify-center shrink-0">×</button>
                            </div>
                        </div>

                        {/* Body - Tabs & Content */}
                        <div className="flex-1 overflow-auto bg-slate-50/50 rounded-2xl border border-slate-200 p-8 mb-4">
                            {attendanceTab !== 'edit' ? (
                                <>
                                    <div className="mb-8 border-b border-slate-100">
                                        <div className="flex gap-10">
                                            {(() => {
                                                const pts = selectedItem?.registered_users || [];
                                                const counts = {
                                                    registered: pts.filter((p: any) => ['confirmed', 'absent', 'confirmed_payment'].includes(p.status)).length,
                                                    waitlist: pts.filter((p: any) => ['pending', 'waiting_list', 'pending_payment'].includes(p.status)).length,
                                                    cancelled: pts.filter((p: any) => ['cancelled', 'session_cancelled', 'event_cancelled'].includes(p.status)).length,
                                                };
                                                return [
                                                    { id: 'registered', label: `Inscrits (${counts.registered})` },
                                                    { id: 'waitlist', label: `Liste d'attente (${counts.waitlist})` },
                                                    { id: 'cancelled', label: `Annulés (${counts.cancelled})` }
                                                ].map((tab) => (
                                                    <button
                                                        key={tab.id}
                                                        onClick={() => setAttendanceTab(tab.id as any)}
                                                        className={`pb-4 text-sm font-medium transition-all relative ${attendanceTab === tab.id ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
                                                            }`}
                                                    >
                                                        {tab.label}
                                                        {attendanceTab === tab.id && (
                                                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900 rounded-full" />
                                                        )}
                                                    </button>
                                                ));
                                            })()}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {(() => {
                                            const participants = selectedItem.registered_users || [];
                                            const filtered = participants.filter((p: any) => {
                                                if (attendanceTab === 'registered') return ['confirmed', 'absent', 'confirmed_payment'].includes(p.status);
                                                if (attendanceTab === 'waitlist') return ['pending', 'waiting_list', 'pending_payment'].includes(p.status);
                                                if (attendanceTab === 'cancelled') return ['cancelled', 'session_cancelled', 'event_cancelled'].includes(p.status);
                                                return false;
                                            });

                                            if (filtered.length === 0) {
                                                return <div className="text-center py-12 text-slate-400 font-normal italic text-sm">Aucun participant</div>;
                                            }

                                            return (
                                                <div className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                                                    {filtered.map((u: any) => (
                                                        <div key={u.id} className="px-6 py-3 flex items-center justify-between group hover:bg-slate-50 transition-all">
                                                            <div className="flex items-center gap-4 flex-1">
                                                                {attendanceTab === 'registered' ? (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleToggleAttendance(u); }}
                                                                        className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${['confirmed', 'confirmed_payment'].includes(u.status) ? 'text-emerald-500 hover:bg-emerald-50' : 'text-rose-500 hover:bg-rose-50'
                                                                            }`}
                                                                    >
                                                                        {['confirmed', 'confirmed_payment'].includes(u.status) ? (
                                                                            <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                                                        ) : (
                                                                            <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                                                                        )}
                                                                    </button>
                                                                ) : (
                                                                    <div className="h-9 w-9 flex items-center justify-center text-base">
                                                                        {attendanceTab === 'waitlist' ? '⏳' : '🚫'}
                                                                    </div>
                                                                )}
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-medium text-slate-900">{u.first_name} {u.last_name}</span>
                                                                        {u.has_pending_order && (
                                                                            <span title="Paiement à régulariser" className="text-amber-500 animate-pulse text-base">⚠️</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setContactUser(u); }}
                                                                    className="h-10 w-10 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-full flex items-center justify-center transition-all hover:scale-110"
                                                                >
                                                                    <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" /></svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-10 py-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    {/* Section: Détails */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Intitulé *</label>
                                            <input
                                                type="text"
                                                required
                                                value={formData.title}
                                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all hover:border-gray-300"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Lieu / Salle</label>
                                            <select
                                                value={formData.location}
                                                onChange={e => setFormData({ ...formData, location: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 appearance-none cursor-pointer"
                                            >
                                                <option value="">Aucun lieu spécifique</option>
                                                {(tenant?.locations || []).map((loc: string) => (
                                                    <option key={loc} value={loc}>{loc}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Informations</label>
                                            <textarea
                                                value={formData.description}
                                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                placeholder="Informations complémentaires visibles par les utilisateurs sur le planning..."
                                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 min-h-[80px] resize-none"
                                                rows={2}
                                            />
                                        </div>
                                    </div>

                                    {/* Section: Planification */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Date *</label>
                                            <input
                                                type="date"
                                                required
                                                value={formData.date}
                                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Heure *</label>
                                            <input
                                                type="time"
                                                required
                                                value={formData.time}
                                                onChange={e => setFormData({ ...formData, time: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Durée *</label>
                                            <input
                                                type="time"
                                                required
                                                value={formData.duration_minutes ? `${Math.floor(formData.duration_minutes / 60).toString().padStart(2, '0')}:${(formData.duration_minutes % 60).toString().padStart(2, '0')}` : ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    if (!val) return;
                                                    const [h, m] = val.split(':').map(Number);
                                                    setFormData({ ...formData, duration_minutes: (h || 0) * 60 + (m || 0) });
                                                }}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 appearance-none cursor-pointer"
                                            />
                                        </div>
                                    </div>

                                    {/* Section: Logistique */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Attribution (Intervenant)</label>
                                            <input
                                                type="text"
                                                value={formData.instructor_name}
                                                onChange={e => setFormData({ ...formData, instructor_name: e.target.value })}
                                                placeholder="Ex: Jean Expert"
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                            />
                                        </div>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-medium text-slate-700">Capacité *</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        required
                                                        value={formData.max_participants}
                                                        onChange={e => setFormData({ ...formData, max_participants: parseInt(e.target.value) || 0 })}
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-medium text-slate-700">Crédits *</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        required
                                                        value={formData.credits_required}
                                                        onChange={e => setFormData({ ...formData, credits_required: parseFloat(e.target.value) || 0 })}
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 pl-1">
                                                <input
                                                    type="checkbox"
                                                    id="allow_waitlist_edit"
                                                    checked={formData.allow_waitlist}
                                                    onChange={e => setFormData({ ...formData, allow_waitlist: e.target.checked })}
                                                    className="w-4 h-4 rounded-md border-gray-300 text-slate-900 focus:ring-slate-500 cursor-pointer"
                                                />
                                                <label htmlFor="allow_waitlist_edit" className="text-xs font-medium text-slate-500 cursor-pointer select-none">
                                                    Autoriser la liste d'attente
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="">
                            {/* Email Section */}
                            {attendanceTab !== 'edit' && (selectedItem.registered_users || []).length > 0 && (
                                <div className="flex items-center justify-end gap-6 mb-8 pr-4">
                                    <div className="text-right">
                                        <div className="text-[11px] font-medium text-slate-400 italic mb-1">Envoyer un e-mail groupé</div>
                                        <label className="flex items-center gap-2 cursor-pointer group justify-end">
                                            <input
                                                type="checkbox"
                                                checked={includeWaitlistInEmail}
                                                onChange={(e) => setIncludeWaitlistInEmail(e.target.checked)}
                                                className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                                            />
                                            <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-600 transition-colors">Inclure la liste d'attente</span>
                                        </label>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const participants = selectedItem.registered_users || [];
                                            let targetUsers = participants.filter((p: any) => p.status === 'confirmed');
                                            if (includeWaitlistInEmail) {
                                                const wl = participants.filter((p: any) => ['pending', 'waiting_list', 'pending_payment'].includes(p.status));
                                                targetUsers = [...targetUsers, ...wl];
                                            }
                                            const emails = targetUsers.map((u: any) => u.email).join(',');
                                            window.location.href = `mailto:?bcc=${emails}&subject=Information sur votre séance : ${selectedItem.title}`;
                                        }}
                                        className="h-12 w-12 bg-white shadow-lg shadow-slate-200/50 border border-slate-100 rounded-full flex items-center justify-center text-blue-500 hover:scale-110 transition-all hover:shadow-xl active:scale-95"
                                        title="Envoyer l'email groupé"
                                    >
                                        <div className="relative">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black mt-0.5 ml-0.5">E</span>
                                        </div>
                                    </button>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex items-end justify-between">
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400 ml-1">
                                        Déprogrammer {selectedItem.type === 'session' ? 'la séance' : "l'évènement"} ?
                                    </h4>
                                    <div className="flex gap-3">
                                        {selectedItem.is_active ? (
                                            <button
                                                onClick={() => handleCancelItem(selectedItem)}
                                                className="px-4 py-2.5 bg-white text-amber-600 border border-amber-100 rounded-xl font-medium text-sm hover:bg-amber-50 transition-all"
                                            >
                                                Annuler
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleReactivateItem(selectedItem)}
                                                className="px-4 py-2.5 bg-white text-emerald-600 border border-emerald-100 rounded-xl font-medium text-sm hover:bg-emerald-50 transition-all"
                                            >
                                                Réactiver
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDeleteItem(selectedItem)}
                                            className="px-4 py-2.5 bg-white text-rose-600 border border-rose-100 rounded-xl font-medium text-sm hover:bg-rose-50 transition-all"
                                        >
                                            Supprimer
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={handleEditSubmit}
                                    disabled={saving}
                                    className="px-8 py-2.5 bg-slate-900 border border-transparent text-white rounded-xl font-medium text-sm hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95 disabled:opacity-50"
                                >
                                    {saving ? "Chargement..." : "Enregistrer"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {confirmModal.show && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2">{confirmModal.title}</h3>
                            <p className="text-slate-500 text-base leading-relaxed">{confirmModal.message}</p>
                            <div className="mt-8 flex gap-3 justify-end items-center">
                                <button
                                    onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                                    className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={confirmModal.onConfirm}
                                    className={`px-6 py-2.5 text-white rounded-xl font-medium transition-all text-sm shadow-sm ${confirmModal.type === 'danger' ? 'bg-rose-600 hover:bg-rose-700' :
                                            confirmModal.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-900 hover:bg-slate-800'
                                        }`}
                                >
                                    Confirmer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Create/Edit Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                {editingSession ? (
                                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                )}
                                <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">
                                    {editingSession ? "Modifier la séance" : "Nouvelle séance"}
                                </h3>
                            </div>
                            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-10">
                            <form id="sessionForm" onSubmit={editingSession ? handleEditSubmit : handleSubmit} className="space-y-10">

                                {/* Section: Détails */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Intitulé *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.title}
                                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="Ex: Yoga Vinyasa, Cross-Training..."
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all hover:border-gray-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Lieu / Salle</label>
                                        <select
                                            value={formData.location}
                                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 appearance-none cursor-pointer"
                                        >
                                            <option value="">Aucun lieu spécifique</option>
                                            {(tenant?.locations || []).map((loc: string) => (
                                                <option key={loc} value={loc}>{loc}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2 space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Informations</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Informations complémentaires visibles par les utilisateurs sur le planning..."
                                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 min-h-[80px] resize-none"
                                            rows={2}
                                        />
                                    </div>
                                </div>

                                {/* Section: Planification */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Date *</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.date}
                                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Heure *</label>
                                        <input
                                            type="time"
                                            required
                                            value={formData.time}
                                            onChange={e => setFormData({ ...formData, time: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Durée *</label>
                                        <input
                                            type="time"
                                            required
                                            value={formData.duration_minutes ? `${Math.floor(formData.duration_minutes / 60).toString().padStart(2, '0')}:${(formData.duration_minutes % 60).toString().padStart(2, '0')}` : ""}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (!val) {
                                                    setFormData({ ...formData, duration_minutes: "" as any });
                                                    return;
                                                }
                                                const [h, m] = val.split(':').map(Number);
                                                setFormData({ ...formData, duration_minutes: (h || 0) * 60 + (m || 0) });
                                            }}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>

                                {/* Section: Logistique */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Attribution (Intervenant)</label>
                                        <input
                                            type="text"
                                            value={formData.instructor_name}
                                            onChange={e => setFormData({ ...formData, instructor_name: e.target.value })}
                                            placeholder="Ex: Jean Expert"
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                        />
                                    </div>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-sm font-medium text-slate-700">Capacité *</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    required
                                                    value={formData.max_participants}
                                                    onChange={e => setFormData({ ...formData, max_participants: e.target.value === "" ? "" : parseInt(e.target.value) })}
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                                    placeholder="12"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-sm font-medium text-slate-700">Crédits *</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    required
                                                    value={formData.credits_required}
                                                    onChange={e => setFormData({ ...formData, credits_required: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                                    placeholder="1"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 pl-1">
                                            <input
                                                type="checkbox"
                                                id="allow_waitlist"
                                                checked={formData.allow_waitlist}
                                                onChange={e => setFormData({ ...formData, allow_waitlist: e.target.checked })}
                                                className="w-4 h-4 rounded-md border-gray-300 text-slate-900 focus:ring-slate-500 cursor-pointer"
                                            />
                                            <label htmlFor="allow_waitlist" className="text-xs font-medium text-slate-500 cursor-pointer select-none">
                                                Autoriser la liste d'attente
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Récurrence (Création uniquement) */}
                                {!editingSession && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Fréquence</label>
                                            <select
                                                value={formData.recurrence}
                                                onChange={e => setFormData({ ...formData, recurrence: e.target.value as any })}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 appearance-none cursor-pointer"
                                            >
                                                <option value="none">Une seule fois</option>
                                                <option value="daily">Quotidien</option>
                                                <option value="weekly">Hebdomadaire</option>
                                                <option value="monthly">Mensuel</option>
                                            </select>
                                        </div>
                                        {formData.recurrence !== "none" && (
                                            <div className="space-y-1.5 animate-in zoom-in-95 duration-200">
                                                <label className="text-sm font-medium text-slate-700">Nombre d'occurrences</label>
                                                <input
                                                    type="number"
                                                    min="2"
                                                    max="52"
                                                    value={formData.recurrence_count}
                                                    onChange={e => setFormData({ ...formData, recurrence_count: parseInt(e.target.value) })}
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                                    placeholder="Nombre d'occurrences"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </form>
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm"
                            >
                                Annuler
                            </button>
                            <button
                                type="submit"
                                form="sessionForm"
                                disabled={saving}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50 transition-all text-sm shadow-sm flex items-center gap-2"
                            >
                                {saving && (
                                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                {saving ? "Enregistrement..." : editingSession ? "Enregistrer les modifications" : "Créer la séance"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Duplicate Modal */}
            {showDuplicateModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <h3 className="text-lg font-semibold text-slate-900">Dupliquer des séances</h3>
                            </div>
                            <button onClick={() => setShowDuplicateModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-10 space-y-8">
                            <p className="text-slate-500 text-sm font-normal">Copiez un bloc de séances vers une autre période pour gagner du temps.</p>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Du</label>
                                    <input type="date" value={duplicateData.source_start} onChange={e => setDuplicateData({ ...duplicateData, source_start: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Au</label>
                                    <input type="date" value={duplicateData.source_end} onChange={e => setDuplicateData({ ...duplicateData, source_end: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Cible : Nouvelle date de début</label>
                                <input type="date" value={duplicateData.target_start} onChange={e => setDuplicateData({ ...duplicateData, target_start: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                                <button type="button" onClick={() => setShowDuplicateModal(false)} className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">
                                    Annuler
                                </button>
                                <button onClick={handleDuplicate} className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all text-sm shadow-sm">
                                    Confirmer la duplication
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Contact Info Modal */}
            {contactUser && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 p-8">
                        <div className="mb-6">
                            <h3 className="text-xl font-medium text-slate-900 tracking-tight">Informations de contact</h3>
                            <p className="text-xs font-medium text-slate-400 mt-1">Pour {contactUser.first_name} {contactUser.last_name}</p>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[11px] font-medium text-slate-400 block mb-1.5 ml-1">Téléphone</label>
                                {contactUser.phone ? (
                                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between group transition-colors hover:bg-slate-50">
                                        <span className="text-sm font-medium text-slate-700">{contactUser.phone}</span>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(contactUser.phone);
                                            }}
                                            className="h-8 w-8 bg-white shadow-sm border border-slate-100 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all active:scale-90"
                                            title="Copier le numéro"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center py-4 bg-slate-50/30 rounded-xl border border-dashed border-slate-200 text-slate-300 font-medium italic text-xs">
                                        Non renseigné
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="text-[11px] font-medium text-slate-400 block mb-1.5 ml-1">Réseaux sociaux</label>
                                {contactUser.instagram_handle || contactUser.facebook_handle ? (
                                    <div className="grid grid-cols-1 gap-3">
                                        {contactUser.instagram_handle && (
                                            <div className="flex items-center gap-3 bg-slate-50/50 p-3.5 rounded-xl border border-slate-100 transition-colors hover:bg-slate-50">
                                                <span className="text-lg">📸</span>
                                                <span className="text-xs font-medium text-slate-600">@{contactUser.instagram_handle}</span>
                                            </div>
                                        )}
                                        {contactUser.facebook_handle && (
                                            <div className="flex items-center gap-3 bg-slate-50/50 p-3.5 rounded-xl border border-slate-100 transition-colors hover:bg-slate-50">
                                                <span className="text-base">👤</span>
                                                <span className="text-xs font-medium text-slate-600">{contactUser.facebook_handle}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center py-4 bg-slate-50/30 rounded-xl border border-dashed border-slate-200 text-slate-300 font-medium italic text-xs">
                                        Non renseigné
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 flex justify-center">
                                <button
                                    onClick={() => setContactUser(null)}
                                    className="px-10 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95"
                                >
                                    Fermer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
