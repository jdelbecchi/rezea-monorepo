"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
                const userData = await api.getCurrentUser();
                setUser(userData);
                const tenantData = await api.getTenantSettings();
                setTenant(tenantData);
                const data = await fetchSessions();
                const editId = searchParams.get("edit");
                if (editId) {
                    const target = data.find(s => s.id === editId);
                    if (target) openEdit(target);
                }
            } catch (err) {
                router.push("/login");
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
        <div className="flex min-h-screen bg-white font-sans text-slate-900">
            <Sidebar user={user} />

            <main className="flex-1 p-8 md:p-12 overflow-auto bg-[#fafafa]">
                <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
                    
                    {/* Header Image 2 Style */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-1">
                            <h1 className="text-3xl font-bold tracking-tight text-[#1e293b]">
                                Programmation des séances
                            </h1>
                            <p className="text-slate-500 text-sm font-medium">Planifiez et organisez vos activités</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => setShowDuplicateModal(true)}
                                className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
                            >
                                ↺ Dupliquer
                            </button>
                            <button 
                                onClick={() => { setShowForm(true); setEditingSession(null); setFormData({...emptyForm}); }}
                                className="px-6 py-2.5 bg-[#0f172a] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg"
                            >
                                <span className="text-lg">+</span> Nouveau
                            </button>
                        </div>
                    </div>

                    {/* Filter Bar Image 2 Style */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[300px]">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">🔍 Rechercher</label>
                            <input 
                                type="text"
                                placeholder="Intitulé, attribution, description..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all placeholder:text-slate-400 text-sm font-medium"
                            />
                        </div>
                        
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">Statut</label>
                            <select 
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900 transition-all min-w-[150px]"
                            >
                                <option value="active">Programmées</option>
                                <option value="cancelled">Annulées</option>
                                <option value="all">Toutes</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">Lieu</label>
                            <select 
                                value={locationFilter}
                                onChange={(e) => setLocationFilter(e.target.value)}
                                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900 transition-all min-w-[150px]"
                            >
                                <option value="all">Tous les lieux</option>
                                {(tenant?.locations || []).map((loc: string) => (
                                    <option key={loc} value={loc}>{loc}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="flex items-center gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">Du</label>
                                <div className="relative">
                                    <input type="text" placeholder="jj/mm/aaaa" className="pl-4 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm font-medium w-36 outline-none bg-white" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">📅</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">Au</label>
                                <div className="relative">
                                    <input type="text" placeholder="jj/mm/aaaa" className="pl-4 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm font-medium w-36 outline-none bg-white" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">📅</span>
                                </div>
                            </div>

                            <button className="px-4 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-2 border border-emerald-100/50">
                                📥 Exporter Excel
                            </button>
                        </div>
                    </div>

                    {/* Table Image 2 Style */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.02)] overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] uppercase font-black tracking-[0.2em] text-slate-400">
                                    <th className="px-8 py-6">Date</th>
                                    <th className="px-6 py-6">Heure</th>
                                    <th className="px-6 py-6">Intitulé</th>
                                    <th className="px-6 py-6 text-center">Durée</th>
                                    <th className="px-6 py-6">Lieu</th>
                                    <th className="px-6 py-6">Attribution</th>
                                    <th className="px-6 py-6 text-center">Inscriptions</th>
                                    <th className="px-6 py-6 text-center">Crédits</th>
                                    <th className="px-8 py-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50/50">
                                {filteredSessions.map(s => {
                                    const date = new Date(s.start_time);
                                    const fillPercent = (s.current_participants / s.max_participants) * 100;
                                    
                                    return (
                                        <tr key={s.id} className={`hover:bg-slate-50/80 transition-all group ${!s.is_active ? 'opacity-50' : ''}`}>
                                            <td className="px-8 py-5 text-sm font-medium text-slate-500">{format(date, "dd/MM/yyyy")}</td>
                                            <td className="px-6 py-5 text-sm font-black text-slate-900">{format(date, "HH:mm")}</td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-bold text-slate-900 ${!s.is_active ? 'line-through text-slate-400' : ''}`}>{s.title}</span>
                                                    <span className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">✏️</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-sm font-medium text-slate-500 text-center">{formatDuration(Math.round((new Date(s.end_time).getTime() - date.getTime())/60000))}</td>
                                            <td className="px-6 py-5">
                                                {s.location ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider border border-slate-100">
                                                        📍 {s.location}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 text-[10px] font-bold italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-5 text-sm font-black text-slate-700">{(s as any).instructor_name || "—"}</td>
                                            <td className="px-6 py-5 text-center">
                                                <span className={`inline-flex items-center justify-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm border ${
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
                                                            <span className="text-[10px]">({s.waitlist_count})</span>
                                                        </span>
                                                    )}
                                                    {s.allow_waitlist && (s.waitlist_count ?? 0) === 0 && (
                                                        <span className="ml-1 opacity-50" title="Liste d'attente autorisée">⏳</span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-center text-sm font-black text-slate-600">{s.credits_required}</td>
                                            <td className="px-8 py-5 text-right">
                                                <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button onClick={() => openEdit(s)} className="p-2 hover:bg-blue-50 text-blue-500 rounded-lg transition-all" title="Modifier">✏️</button>
                                                    {s.is_active ? (
                                                        <button 
                                                            onClick={() => handleCancelSession(s)}
                                                            className="p-2 hover:bg-amber-50 text-amber-500 rounded-lg transition-all" 
                                                            title="Annuler"
                                                        >
                                                            🚫
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => handleReactivateSession(s)}
                                                            className="p-2 hover:bg-emerald-50 text-emerald-500 rounded-lg transition-all" 
                                                            title="Réactiver"
                                                        >
                                                            🔄
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => handleDeleteSession(s)}
                                                        className="p-2 hover:bg-rose-100 text-rose-500 rounded-lg transition-all" 
                                                        title="Supprimer"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
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
                    <div className="bg-white rounded-[2.5rem] p-10 max-w-2xl w-full shadow-2xl border border-slate-100 overflow-y-auto max-h-[90vh]">
                        <h2 className="text-3xl font-black text-slate-900 mb-8 tracking-tight">
                            {editingSession ? "Modifier la séance" : "Créer une séance"}
                        </h2>
                        <form onSubmit={editingSession ? handleEditSubmit : handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${!formData.title ? 'text-red-500' : 'text-slate-400'}`}>Intitulé *</label>
                                    <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className={`w-full px-5 py-3.5 border rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700 ${!formData.title ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-100'}`} />
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
                                    <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${!formData.date ? 'text-red-500' : 'text-slate-400'}`}>Date *</label>
                                    <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className={`w-full px-5 py-3.5 border rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700 ${!formData.date ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-100'}`} />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${!formData.time ? 'text-red-500' : 'text-slate-400'}`}>Heure *</label>
                                    <input type="time" required value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className={`w-full px-5 py-3.5 border rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700 ${!formData.time ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-100'}`} />
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

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Attribution (Intervenant)</label>
                                    <input type="text" value={formData.instructor_name} onChange={e => setFormData({...formData, instructor_name: e.target.value})} placeholder="Ex: Jean Expert" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${!formData.max_participants && formData.max_participants !== 0 ? 'text-red-500' : 'text-slate-400'}`}>Capacité *</label>
                                        <input type="number" min="1" required value={formData.max_participants} onChange={e => setFormData({...formData, max_participants: parseInt(e.target.value)})} className={`w-full px-5 py-3.5 border rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700 ${!formData.max_participants && formData.max_participants !== 0 ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-100'}`} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${!formData.credits_required && formData.credits_required !== 0 ? 'text-red-500' : 'text-slate-400'}`}>Crédits *</label>
                                        <input type="number" min="0" step="0.5" required value={formData.credits_required} onChange={e => setFormData({...formData, credits_required: parseFloat(e.target.value)})} className={`w-full px-5 py-3.5 border rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-700 ${!formData.credits_required && formData.credits_required !== 0 ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-100'}`} />
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
                                <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
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
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-slate-200 transition-all">Annuler</button>
                                <button type="submit" disabled={saving} className="flex-1 px-8 py-4 bg-[#0f172a] text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 disabled:opacity-50">
                                    {saving ? "Chargement..." : editingSession ? "Enregistrer" : "Créer"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Duplicate Modal */}
            {showDuplicateModal && (
                <div className="fixed inset-0 bg-[#0f172a]/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl">
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
                                <button type="button" onClick={() => setShowDuplicateModal(false)} className="flex-1 px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px]">Annuler</button>
                                <button onClick={handleDuplicate} className="flex-1 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-emerald-700 shadow-xl shadow-emerald-900/20">Confirmer</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Confirmation Modal */}
            {confirmModal.show && (
                <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl border border-slate-100">
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
