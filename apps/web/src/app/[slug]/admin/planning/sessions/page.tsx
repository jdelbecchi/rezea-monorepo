"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { api, User, Session } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import MultiSelect from "@/components/MultiSelect";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { formatDuration } from "@/lib/formatters";

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

function AdminSessionsContent() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const [user, setUser] = useState<User | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string[]>(["active"]);
    const [locationFilter, setLocationFilter] = useState<string[]>([]);
    const [tenant, setTenant] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [editingSession, setEditingSession] = useState<Session | null>(null);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [duplicateData, setDuplicateData] = useState({ source_start: "", source_end: "", target_start: "" });
    const [filterFrom, setFilterFrom] = useState("");
    const [filterTo, setFilterTo] = useState("");
    const [showErrors, setShowErrors] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Confirmation Modal
    const [confirmModal, setConfirmModal] = useState<{
        show: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'danger' | 'warning' | 'info';
    }>({ show: false, title: "", message: "", onConfirm: () => {}, type: 'info' });

    const fetchSessions = useCallback(async () => {
        try {
            const now = new Date();
            const start = `${now.getFullYear() - 1}-01-01T00:00:00`;
            const end = `${now.getFullYear() + 1}-12-31T23:59:59`;
            // Fetch all and filter in frontend for MultiSelect flexibility
            const data = await api.getSessions({
                start_date: start,
                end_date: end
            });
            setSessions(data);
            return data;
        } catch (err) {
            console.error(err);
            return [];
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                // 1. Get user and check permissions BEFORE other data
                const userData = await api.getCurrentUser();
                if (userData.role !== 'owner' && userData.role !== 'manager') {
                    router.push("/home");
                    return;
                }
                setUser(userData);

                // 2. Fetch other data
                const [tenantData, data] = await Promise.all([
                    api.getTenantSettings(),
                    fetchSessions()
                ]);
                setTenant(tenantData);
                
                const editId = searchParams.get("edit");
                if (editId) {
                    const target = data.find((s: any) => s.id === editId);
                    if (target) openEdit(target);
                }
            } catch (err: any) {
                if (err.response?.status === 401) {
                    router.push(`/${params.slug}`);
                }
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [router, searchParams, fetchSessions]);
    
    const resetForm = () => {
        setFormData({ ...emptyForm });
        setEditingSession(null);
        setShowForm(false);
        setShowErrors(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.title || !formData.date || !formData.time) {
            setShowErrors(true);
            return;
        }

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
                    description: formData.description,
                    instructor_name: formData.instructor_name,
                    start_time: formatISO(d),
                    end_time: formatISO(endD),
                    max_participants: formData.max_participants,
                    credits_required: formData.credits_required,
                    location: formData.location,
                    allow_waitlist: formData.allow_waitlist,
                });
            }

            await fetchSessions();
            resetForm();
            setMessage({ type: 'success', text: "Séance(s) créée(s) avec succès !" });
        } catch (err) {
            setMessage({ type: 'error', text: "Erreur lors de la création" });
        } finally {
            setSaving(false);
        }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSession) return;

        if (!formData.title || !formData.date || !formData.time) {
            setShowErrors(true);
            return;
        }

        setSaving(true);
        try {
            const startDt = new Date(`${formData.date}T${formData.time}:00`);
            const endDt = new Date(startDt.getTime() + formData.duration_minutes * 60 * 1000);
            
            const formatISO = (date: Date) => {
                const pad = (n: number) => n.toString().padStart(2, '0');
                return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
            };

            await api.updateSession(editingSession.id, {
                title: formData.title,
                description: formData.description,
                instructor_name: formData.instructor_name,
                start_time: formatISO(startDt),
                end_time: formatISO(endDt),
                max_participants: formData.max_participants,
                credits_required: formData.credits_required,
                location: formData.location,
                allow_waitlist: formData.allow_waitlist,
            });
            resetForm();
            await fetchSessions();
            setMessage({ type: 'success', text: "Séance mise à jour avec succès !" });
        } catch (err) {
            setMessage({ type: 'error', text: "Erreur lors de la modification" });
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (s: Session) => {
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        const dur = Math.round((end.getTime() - start.getTime()) / 60000);
        setEditingSession(s);
        setFormData({
            title: s.title,
            description: s.description || "",
            instructor_name: (s as any).instructor_name || "",
            date: start.toISOString().split("T")[0],
            time: start.toTimeString().slice(0, 5),
            duration_minutes: dur,
            max_participants: s.max_participants,
            credits_required: s.credits_required,
            location: s.location || "",
            allow_waitlist: s.allow_waitlist,
            recurrence: "none",
            recurrence_count: 1,
        });
        setShowForm(true);
    };

    const handleCancelSession = async (session: Session) => {
        setConfirmModal({
            show: true,
            title: "Confirmer l'annulation",
            message: `Êtes-vous sûr de vouloir annuler "${session.title}" ? Les participants seront recrédités et recevront une notification.`,
            type: 'warning',
            onConfirm: async () => {
                try {
                    await api.cancelSession(session.id);
                    await fetchSessions();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                    setMessage({ type: 'success', text: "Séance annulée avec succès" });
                } catch (err) { setMessage({ type: 'error', text: "Erreur lors de l'annulation" }); }
            }
        });
    };

    const handleReactivateSession = async (session: Session) => {
        setConfirmModal({
            show: true,
            title: "Réactiver la séance ?",
            message: `Souhaitez-vous réactiver "${session.title}" ? Elle sera de nouveau visible et réservable.`,
            type: 'info',
            onConfirm: async () => {
                try {
                    await api.reactivateSession(session.id);
                    await fetchSessions();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                    setMessage({ type: 'success', text: "Séance réactivée avec succès" });
                } catch (err) { setMessage({ type: 'error', text: "Erreur lors de la réactivation" }); }
            }
        });
    };

    const handleDeleteSession = async (session: Session) => {
        setConfirmModal({
            show: true,
            title: "Confirmer la suppression",
            message: `Attention : cette action est irréversible. Les inscriptions liées à "${session.title}" seront supprimées.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    await api.deleteSession(session.id);
                    await fetchSessions();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                    setMessage({ type: 'success', text: "Séance supprimée avec succès" });
                } catch (err) { setMessage({ type: 'error', text: "Erreur lors de la suppression" }); }
            }
        });
    };
    const handleDuplicate = async () => {
        try {
            await api.duplicateSessions({
                source_start: `${duplicateData.source_start}T00:00:00`,
                source_end: `${duplicateData.source_end}T23:59:59`,
                target_start: `${duplicateData.target_start}T00:00:00`,
            });
            setShowDuplicateModal(false);
            await fetchSessions();
            setMessage({ type: 'success', text: "Séances dupliquées avec succès !" });
        } catch (err) {
            setMessage({ type: 'error', text: "Erreur lors de la duplication" });
        }
    };

    
    const handleExport = () => {
        const BOM = "\uFEFF";
        const header = "Date;Heure;Intitulé;Durée;Lieu;Intervenant;Inscriptions;Crédits";
        const rows = filteredSessions.map((s) => {
            const date = new Date(s.start_time);
            return [
                format(date, "dd/MM/yyyy"),
                format(date, "HH:mm"),
                s.title,
                formatDuration(Math.round((new Date(s.end_time).getTime() - date.getTime())/60000)),
                s.location || "",
                (s as any).instructor_name || "",
                `${s.current_participants}/${s.max_participants}`,
                s.credits_required,
            ].join(";");
        });
        const csv = BOM + header + "\n" + rows.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const dateStr = format(new Date(), "yyyy-MM-dd");
        a.download = `export_programmation_seances_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const filteredSessions = sessions.filter(s => {
        const q = searchTerm.toLowerCase();
        const matchesSearch = s.title.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q) || ((s as any).instructor_name || "").toLowerCase().includes(q);
        const matchesLocation = locationFilter.length === 0 || (s.location && locationFilter.includes(s.location));
        const matchesStatus = statusFilter.length === 0 || (s.is_active ? statusFilter.includes("active") : statusFilter.includes("cancelled"));
        
        // Filter by date range
        if (filterFrom || filterTo) {
            const sDate = s.start_time.split('T')[0];
            if (filterFrom && sDate < filterFrom) return false;
            if (filterTo && sDate > filterTo) return false;
        }

        return matchesSearch && matchesLocation && matchesStatus;
    }).sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

    if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Chargement...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
                    
                    {/* Header Image 2 Style */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">
                                📅 Programmation des séances
                            </h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Planifiez et organisez vos activités</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => setShowDuplicateModal(true)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-medium shadow-sm text-sm"
                            >
                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Dupliquer
                            </button>
                            <button 
                                onClick={() => { setShowForm(true); setEditingSession(null); setFormData({ ...emptyForm }); }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-sm text-sm active:scale-95 tracking-tight"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Nouvelle séance
                            </button>
                        </div>
                    </div>

                    {message && (
                        <div className={`p-3 rounded-xl flex items-center justify-between border animate-in slide-in-from-top-2 duration-300 ${
                            message.type === 'success' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className="text-sm">
                                    {message.type === 'success' ? '✅' : '⚠️'}
                                </span>
                                <span className="text-sm font-normal text-slate-700 tracking-tight">
                                    {message.text}
                                </span>
                            </div>
                            <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-white/50 rounded-lg">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {/* Filter Bar */}
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="flex flex-col md:flex-row gap-3 items-end flex-wrap">
                            <div className="flex-1 min-w-[180px]">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input 
                                    type="text"
                                    placeholder="Intitulé, attribution..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400 text-sm font-normal"
                                />
                            </div>
                            
                            <div className="w-48">
                                <MultiSelect
                                    label="Statut(s)"
                                    options={[
                                        { id: "active", label: "Programmées" },
                                        { id: "cancelled", label: "Annulées" },
                                    ]}
                                    selected={statusFilter}
                                    onChange={setStatusFilter}
                                    placeholder="Toutes"
                                />
                            </div>

                            {(tenant?.locations || []).length > 1 && (
                                <div className="w-32">
                                    <MultiSelect
                                        label="Lieu(x)"
                                        options={(tenant?.locations || []).map((loc: string) => ({ id: loc, label: loc }))}
                                        selected={locationFilter}
                                        onChange={setLocationFilter}
                                        placeholder="Tous les lieux"
                                    />
                                </div>
                            )}

                            
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1 text-left">Du</label>
                                <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
                                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1 text-left">Au</label>
                                <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
                                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>

                            <button 
                                onClick={handleExport}
                                className="px-3 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg font-medium hover:bg-emerald-100 transition-colors text-sm whitespace-nowrap shadow-sm flex items-center gap-2"
                            >
                                📥 Export Excel
                            </button>
                        </div>
                    </div>

                    {/* Table Style Harmonized */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 border-b border-slate-200">
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">date</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">heure</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest w-[200px]">intitulé</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">durée</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">lieu</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">attribution</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">inscriptions</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">crédits</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSessions.map(s => {
                                    const date = new Date(s.start_time);
                                    const fillPercent = (s.current_participants / s.max_participants) * 100;
                                    
                                    return (
                                        <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700">{format(date, "dd/MM/yyyy")}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-sm font-medium text-slate-900 text-center">{format(date, "HH:mm")}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap max-w-[200px] truncate">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-medium text-slate-900 ${!s.is_active ? 'line-through text-slate-400' : ''}`}>{s.title}</span>
                                                    {s.description && s.description.trim().length > 0 && (
                                                        <span title={`Informations : ${s.description}`} className="text-blue-400 cursor-help">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                            </svg>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-sm font-normal text-slate-500 text-center">{formatDuration(Math.round((new Date(s.end_time).getTime() - date.getTime())/60000))}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                                {s.location ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-600 rounded-lg text-xs font-normal border border-slate-100 whitespace-nowrap">
                                                        📍 {s.location}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 text-xs italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-sm font-normal text-slate-500 whitespace-nowrap text-center">{(s as any).instructor_name || "—"}</td>
                                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                                <span className={`inline-flex items-center justify-center px-4 py-1 rounded-full text-xs font-normal border ${
                                                    !s.is_active ? "bg-slate-100 text-slate-400 border-slate-200" :
                                                    s.current_participants === 0 
                                                        ? "bg-slate-50 text-slate-400 border-slate-100" 
                                                        : fillPercent >= 100
                                                            ? "bg-emerald-100 text-emerald-900 border-emerald-200 font-bold"
                                                            : fillPercent > 70 
                                                                ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                                                                : fillPercent >= 40 
                                                                    ? "bg-blue-50 text-blue-500 border-blue-100"
                                                                    : "bg-amber-50 text-amber-600 border-amber-100"
                                                }`}>
                                                    {s.current_participants}/{s.max_participants}
                                                    {s.allow_waitlist && (s.waitlist_count ?? 0) > 0 && (
                                                        <span className="flex items-center gap-0.5 ml-1 text-orange-600" title="Liste d'attente">
                                                            <span>⏳</span>
                                                            <span className="text-xs">({s.waitlist_count})</span>
                                                        </span>
                                                    )}
                                                    {s.allow_waitlist && (s.waitlist_count ?? 0) === 0 && (
                                                        <span className="ml-1 opacity-50 text-xs" title="Liste d'attente autorisée">⏳</span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center text-sm font-medium text-slate-600 whitespace-nowrap">{s.credits_required}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-right flex items-center justify-end gap-0.5">
                                                <button onClick={() => openEdit(s)} className="p-1 hover:bg-blue-50 text-blue-500 rounded-lg transition-all hover:scale-105" title="Modifier">✏️</button>
                                                {s.is_active ? (
                                                    <button 
                                                        onClick={() => handleCancelSession(s)}
                                                        className="p-0.5 hover:bg-amber-50 text-amber-500 rounded-lg transition-all hover:scale-105" 
                                                        title="Annuler"
                                                    >
                                                        🚫
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleReactivateSession(s)}
                                                        className="p-0.5 hover:bg-emerald-50 text-emerald-500 rounded-lg transition-all hover:scale-105" 
                                                        title="Réactiver"
                                                    >
                                                        🔄
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => handleDeleteSession(s)}
                                                    className="p-0.5 hover:bg-rose-50 text-rose-500 rounded-lg transition-all hover:scale-105" 
                                                    title="Supprimer"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>


                </div>
            </main>

            {/* Modal Form Image 2 Style */}
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
                            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 transition-colors">
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
                                        <label className={`text-sm font-medium ${(showErrors && !formData.title) ? 'text-red-500' : 'text-slate-700'}`}>Intitulé *</label>
                                        <input 
                                            type="text" 
                                            required 
                                            value={formData.title} 
                                            onChange={e => setFormData({...formData, title: e.target.value})} 
                                            placeholder="Ex: Yoga Vinyasa, Cross-Training..."
                                            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all ${!formData.title && showErrors ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`} 
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Lieu / Salle</label>
                                        <select 
                                            value={formData.location} 
                                            onChange={e => setFormData({...formData, location: e.target.value})} 
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
                                            onChange={e => setFormData({...formData, description: e.target.value})} 
                                            placeholder="Informations complémentaires visibles par les utilisateurs sur le planning..." 
                                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 min-h-[80px] resize-none"
                                            rows={2}
                                        />
                                    </div>
                                </div>

                                {/* Section: Planification */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-1.5">
                                        <label className={`text-sm font-medium ${(showErrors && !formData.date) ? 'text-red-500' : 'text-slate-700'}`}>Date *</label>
                                        <input 
                                            type="date" 
                                            required 
                                            value={formData.date} 
                                            onChange={e => setFormData({...formData, date: e.target.value})} 
                                            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all ${!formData.date && showErrors ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`} 
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={`text-sm font-medium ${(showErrors && !formData.time) ? 'text-red-500' : 'text-slate-700'}`}>Heure *</label>
                                        <input 
                                            type="time" 
                                            required 
                                            value={formData.time} 
                                            onChange={e => setFormData({...formData, time: e.target.value})} 
                                            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all ${!formData.time && showErrors ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`} 
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
                                                    setFormData({...formData, duration_minutes: "" as any});
                                                    return;
                                                }
                                                const [h, m] = val.split(':').map(Number);
                                                setFormData({...formData, duration_minutes: (h || 0) * 60 + (m || 0)});
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
                                            onChange={e => setFormData({...formData, instructor_name: e.target.value})} 
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
                                                    onChange={e => setFormData({...formData, max_participants: e.target.value === "" ? "" : parseInt(e.target.value)})} 
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
                                                    onChange={e => setFormData({...formData, credits_required: e.target.value === "" ? "" : parseFloat(e.target.value)})} 
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
                                                onChange={e => setFormData({...formData, allow_waitlist: e.target.checked})}
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
                                                    onChange={e => setFormData({...formData, recurrence: e.target.value as any})} 
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
                                                        onChange={e => setFormData({...formData, recurrence_count: parseInt(e.target.value)})} 
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
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button 
                                type="button" 
                                onClick={resetForm} 
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Dupliquer des séances</h3>
                            </div>
                            <button onClick={() => setShowDuplicateModal(false)} className="text-gray-400 hover:text-gray-600">
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
                                    <input type="date" value={duplicateData.source_start} onChange={e => setDuplicateData({...duplicateData, source_start: e.target.value})} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Au</label>
                                    <input type="date" value={duplicateData.source_end} onChange={e => setDuplicateData({...duplicateData, source_end: e.target.value})} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Nouvelle date de début</label>
                                <input type="date" value={duplicateData.target_start} onChange={e => setDuplicateData({...duplicateData, target_start: e.target.value})} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                            </div>
                        </div>

                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center">
                            <button type="button" onClick={() => setShowDuplicateModal(false)} className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">
                                Annuler
                            </button>
                            <button onClick={handleDuplicate} className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all text-sm shadow-sm">
                                Confirmer la duplication
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Confirmation Modal */}
            {confirmModal.show && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 pb-8">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2 tracking-tight">{confirmModal.title}</h3>
                            <p className="text-slate-500 text-base leading-relaxed">{confirmModal.message}</p>
                        </div>
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center">
                            <button 
                                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={confirmModal.onConfirm}
                                className={`px-6 py-2.5 text-white rounded-xl font-medium transition-all text-sm shadow-sm active:scale-95 ${
                                    confirmModal.type === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 
                                    confirmModal.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-900 hover:bg-slate-800'
                                }`}
                            >
                                Confirmer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminSessionsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500 font-medium">Chargement...</div>}>
            <AdminSessionsContent />
        </Suspense>
    );
}
