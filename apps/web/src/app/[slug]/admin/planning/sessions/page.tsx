"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { api, User, Session } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
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
    duration_minutes: 60,
    max_participants: 12,
    credits_required: 1,
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
    const [statusFilter, setStatusFilter] = useState("active");
    const [locationFilter, setLocationFilter] = useState("all");
    const [tenant, setTenant] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [editingSession, setEditingSession] = useState<Session | null>(null);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [duplicateData, setDuplicateData] = useState({ source_start: "", source_end: "", target_start: "" });
    const [filterFrom, setFilterFrom] = useState("");
    const [filterTo, setFilterTo] = useState("");

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
            const data = await api.getSessions({
                start_date: start,
                end_date: end,
                status: statusFilter === "all" ? undefined : statusFilter
            });
            setSessions(data);
            return data;
        } catch (err) {
            console.error(err);
            return [];
        }
    }, [statusFilter]);

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
                    description: formData.description || undefined,
                    instructor_name: formData.instructor_name || undefined,
                    start_time: d.toISOString(),
                    end_time: endD.toISOString(),
                    max_participants: formData.max_participants,
                    credits_required: formData.credits_required,
                    location: formData.location || undefined,
                    allow_waitlist: formData.allow_waitlist,
                });
            }

            await fetchSessions();
            setShowForm(false);
            setFormData({ ...emptyForm });
        } catch (err) {
            alert("Erreur lors de la création");
        } finally {
            setSaving(false);
        }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSession) return;
        setSaving(true);
        try {
            const startDt = new Date(`${formData.date}T${formData.time}:00`);
            const endDt = new Date(startDt.getTime() + formData.duration_minutes * 60 * 1000);
            await api.updateSession(editingSession.id, {
                title: formData.title,
                description: formData.description || undefined,
                instructor_name: formData.instructor_name || undefined,
                start_time: startDt.toISOString(),
                end_time: endDt.toISOString(),
                max_participants: formData.max_participants,
                credits_required: formData.credits_required,
                location: formData.location || undefined,
                allow_waitlist: formData.allow_waitlist,
            });
            setEditingSession(null);
            setShowForm(false);
            setFormData({ ...emptyForm });
            await fetchSessions();
        } catch (err) {
            alert("Erreur lors de la modification");
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
            title: "Annuler la séance ?",
            message: `Êtes-vous sûr de vouloir annuler "${session.title}" ? Les participants seront remboursés et recevront une notification.`,
            type: 'warning',
            onConfirm: async () => {
                try {
                    await api.cancelSession(session.id);
                    await fetchSessions();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                } catch (err) { alert("Erreur lors de l'annulation"); }
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
                } catch (err) { alert("Erreur lors de la réactivation"); }
            }
        });
    };

    const handleDeleteSession = async (session: Session) => {
        setConfirmModal({
            show: true,
            title: "Supprimer définitivement ?",
            message: `Attention : cette action est irréversible. Les inscriptions liées à "${session.title}" seront supprimées.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    await api.deleteSession(session.id);
                    await fetchSessions();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                } catch (err) { alert("Erreur lors de la suppression"); }
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
        } catch (err) {
            alert("Erreur lors de la duplication");
        }
    };

    const filteredSessions = sessions.filter(s => {
        const q = searchTerm.toLowerCase();
        const matchesSearch = s.title.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q) || ((s as any).instructor_name || "").toLowerCase().includes(q);
        const matchesLocation = locationFilter === "all" || s.location === locationFilter;
        return matchesSearch && matchesLocation;
    }).sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

    if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Chargement...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row text-slate-900">
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
                                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-medium shadow-sm"
                            >
                                ↺ Dupliquer
                            </button>
                            <button 
                                onClick={() => { setEditingSession(null); setFormData({ ...emptyForm }); setShowForm(true); }}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium shadow-sm"
                            >
                                ➕ Nouvelle séance
                            </button>
                        </div>
                    </div>

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
                            
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Statut</label>
                                <select 
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none min-w-[140px] appearance-none cursor-pointer"
                                >
                                    <option value="active">Programmées</option>
                                    <option value="cancelled">Annulées</option>
                                    <option value="all">Toutes</option>
                                </select>
                            </div>

                            {(tenant?.locations || []).length > 1 && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Lieu</label>
                                    <select 
                                        value={locationFilter}
                                        onChange={(e) => setLocationFilter(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none min-w-[140px] appearance-none cursor-pointer"
                                    >
                                        <option value="all">Tous les lieux</option>
                                        {(tenant?.locations || []).map((loc: string) => (
                                            <option key={loc} value={loc}>{loc}</option>
                                        ))}
                                    </select>
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

                            <button className="px-3 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg font-medium hover:bg-emerald-100 transition-colors text-sm whitespace-nowrap shadow-sm flex items-center gap-2">
                                📥 Export Excel
                            </button>
                        </div>
                    </div>

                    {/* Table Image 2 Style */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.02)] overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-slate-100">
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">date</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">heure</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest w-[200px]">intitulé</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">durée</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">lieu</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">attribution</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">inscriptions</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">crédits</th>
                                    <th className="px-3 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50/50">
                                {filteredSessions.map(s => {
                                    const date = new Date(s.start_time);
                                    const fillPercent = (s.current_participants / s.max_participants) * 100;
                                    
                                    return (
                                        <tr key={s.id} className="hover:bg-gray-50 transition-all group">
                                            <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-700">{format(date, "dd/MM/yyyy")}</td>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{format(date, "HH:mm")}</td>
                                            <td className="px-3 py-4 whitespace-nowrap max-w-[200px] truncate">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-medium text-slate-900 ${!s.is_active ? 'line-through text-slate-400' : ''}`}>{s.title}</span>
                                                    <button onClick={() => openEdit(s)} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">✏️</button>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm font-normal text-slate-500 text-center">{formatDuration(Math.round((new Date(s.end_time).getTime() - date.getTime())/60000))}</td>
                                            <td className="px-3 py-4 whitespace-nowrap">
                                                {s.location ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-600 rounded-lg text-xs font-normal border border-slate-100 whitespace-nowrap">
                                                        📍 {s.location}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 text-xs italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-4 text-sm font-normal text-slate-500 whitespace-nowrap">{(s as any).instructor_name || "—"}</td>
                                            <td className="px-3 py-4 text-center whitespace-nowrap">
                                                <span className={`inline-flex items-center justify-center px-4 py-1 rounded-full text-xs font-normal border ${
                                                    !s.is_active ? "bg-slate-100 text-slate-400 border-slate-200" :
                                                    fillPercent >= 100 
                                                        ? "bg-rose-50 text-rose-600 border-rose-100" 
                                                        : fillPercent > 0 
                                                            ? "bg-amber-100 text-amber-700 border-amber-200" 
                                                            : "bg-blue-50 text-blue-500 border-blue-100"
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
                                            <td className="px-3 py-4 text-center text-sm font-medium text-slate-600 whitespace-nowrap">{s.credits_required}</td>
                                            <td className="px-3 py-4 text-center flex items-center justify-center gap-0.5 whitespace-nowrap">
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

                    {/* Footer Hint */}
                    <div className="pt-4 text-center">
                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-300">Gestion des séances de sport • Rezea Admin</p>
                    </div>
                </div>
            </main>

            {/* Modal Form Image 2 Style */}
            {showForm && (
                <div className="fixed inset-0 bg-[#0f172a]/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl p-10 max-w-2xl w-full shadow-2xl border border-slate-100 overflow-y-auto max-h-[90vh]">
                        <h2 className="text-2xl font-semibold text-slate-900 mb-8 tracking-tight">
                            {editingSession ? "✏️ Modifier la séance" : "➕ Créer une séance"}
                        </h2>
                        <form onSubmit={editingSession ? handleEditSubmit : handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className={`text-xs font-medium ml-1 ${!formData.title ? 'text-red-500' : 'text-slate-500'}`}>Intitulé *</label>
                                    <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-slate-900 outline-none font-medium text-slate-700 ${!formData.title ? 'border-red-300 bg-red-50' : 'bg-white border-slate-200'}`} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-500 ml-1">Lieu / Salle</label>
                                    <select 
                                        value={formData.location} 
                                        onChange={e => setFormData({...formData, location: e.target.value})} 
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 outline-none font-medium text-slate-700"
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
                                    <label className={`text-xs font-medium ml-1 ${!formData.date ? 'text-red-500' : 'text-slate-500'}`}>Date *</label>
                                    <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-slate-900 outline-none font-medium text-slate-700 ${!formData.date ? 'border-red-300 bg-red-50' : 'bg-white border-slate-200'}`} />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-medium ml-1 ${!formData.time ? 'text-red-500' : 'text-slate-500'}`}>Heure *</label>
                                    <input type="time" required value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-slate-900 outline-none font-medium text-slate-700 ${!formData.time ? 'border-red-300 bg-red-50' : 'bg-white border-slate-200'}`} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-500 ml-1">Durée</label>
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
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 outline-none font-medium text-slate-700 text-center" 
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-300 pointer-events-none">H</span>
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
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 outline-none font-medium text-slate-700 text-center" 
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-300 pointer-events-none">MIN</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-500 ml-1">Attribution (Intervenant)</label>
                                    <input type="text" value={formData.instructor_name} onChange={e => setFormData({...formData, instructor_name: e.target.value})} placeholder="Ex: Jean Expert" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 outline-none font-medium text-slate-700" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className={`text-xs font-medium ml-1 ${!formData.max_participants && formData.max_participants !== 0 ? 'text-red-500' : 'text-slate-500'}`}>Capacité *</label>
                                        <input type="number" min="1" required value={formData.max_participants} onChange={e => setFormData({...formData, max_participants: parseInt(e.target.value)})} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-slate-900 outline-none font-medium text-slate-700 ${!formData.max_participants && formData.max_participants !== 0 ? 'border-red-300 bg-red-50' : 'bg-white border-slate-200'}`} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={`text-xs font-medium ml-1 ${!formData.credits_required && formData.credits_required !== 0 ? 'text-red-500' : 'text-slate-500'}`}>Crédits *</label>
                                        <input type="number" min="0" step="0.5" required value={formData.credits_required} onChange={e => setFormData({...formData, credits_required: parseFloat(e.target.value)})} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-slate-900 outline-none font-medium text-slate-700 ${!formData.credits_required && formData.credits_required !== 0 ? 'border-red-300 bg-red-50' : 'bg-white border-slate-200'}`} />
                                    </div>
                                </div>
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
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition-all">Annuler</button>
                                <button type="submit" disabled={saving} className="flex-1 px-6 py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-all shadow-sm disabled:opacity-50">
                                    {saving ? "Chargement..." : editingSession ? "Enregistrer" : "Créer la séance"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Duplicate Modal */}
            {showDuplicateModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl p-10 max-w-lg w-full shadow-2xl">
                        <h3 className="text-2xl font-semibold text-slate-900 mb-2 tracking-tight">Dupliquer des séances</h3>
                        <p className="text-slate-500 text-sm mb-8 font-normal">Copiez un bloc de séances vers une autre période</p>
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
                                <button type="button" onClick={() => setShowDuplicateModal(false)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-lg font-medium">Annuler</button>
                                <button onClick={handleDuplicate} className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 shadow-sm">Confirmer la duplication</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Confirmation Modal */}
            {confirmModal.show && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-2xl border border-slate-100">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-6 ${
                            confirmModal.type === 'danger' ? 'bg-rose-50 text-rose-500' : 
                            confirmModal.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                            {confirmModal.type === 'danger' ? '⚠️' : confirmModal.type === 'warning' ? '🚫' : '🔄'}
                        </div>
                        <h3 className="text-2xl font-semibold text-slate-900 mb-2 tracking-tight">{confirmModal.title}</h3>
                        <p className="text-slate-500 font-normal text-sm leading-relaxed mb-8">{confirmModal.message}</p>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-all"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={confirmModal.onConfirm}
                                className={`flex-1 px-6 py-3 text-white rounded-lg text-sm font-medium transition-all shadow-sm ${
                                    confirmModal.type === 'danger' ? 'bg-rose-500 hover:bg-rose-600' : 
                                    confirmModal.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-500 hover:bg-blue-600'
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
