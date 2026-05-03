"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User, AdminBookingItem } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import MultiSelect from "@/components/MultiSelect";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
    confirmed: "Inscrit",
    pending: "Sur liste",
    cancelled: "Annulé",
    session_cancelled: "Séance annulée",
    absent: "Absent",
};

interface UserOption { id: string; first_name: string; last_name: string; balance?: number; }
interface SessionOption { id: string; title: string; start_time: string; max_participants: number; current_participants: number; credits_required?: number; }

export default function AdminBookingsPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [bookings, setBookings] = useState<AdminBookingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
    const [locationFilter, setLocationFilter] = useState("all");
    const [tenant, setTenant] = useState<any>(null);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [sessions, setSessions] = useState<SessionOption[]>([]);
    const [createForm, setCreateForm] = useState({ user_id: "", session_id: "", notes: "" });
    const [saving, setSaving] = useState(false);

    // Edit modal
    const [editBooking, setEditBooking] = useState<AdminBookingItem | null>(null);
    const [editForm, setEditForm] = useState({ notes: "", status: "" });

    // Delete confirm
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, [router]);

    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    useEffect(() => {
        if (user) loadBookings();
    }, [filterStatuses]);

    const fetchData = async () => {
        try {
            // 1. Get user and check permissions BEFORE other data
            const userData = await api.getCurrentUser();
            if (userData.role !== "owner" && userData.role !== "manager") {
                router.push("/home");
                return;
            }
            setUser(userData);

            // 2. Fetch other data
            const [bookingsData, tenantData] = await Promise.all([
                api.getAdminBookings(undefined),
                api.getTenantSettings(),
            ]);
            setBookings(bookingsData);
            setTenant(tenantData);
        } catch (err: any) {
            console.error(err);
            if (err.response?.status === 401) {
                router.push(`/${params.slug}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const loadBookings = async () => {
        try {
            const data = await api.getAdminBookings(undefined);
            setBookings(data);
        } catch (err) {
            console.error(err);
        }
    };

    const loadFormOptions = async () => {
        try {
            const [usersData, sessionsData] = await Promise.all([
                api.getAdminUsers({}),
                api.getAdminSessions(),
            ]);
            setUsers(usersData);
            
            // On limite l'affichage des séances passées à 7 jours d'antériorité
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            
            const filteredSessions = (sessionsData || []).filter(s => {
                try {
                    return new Date(s.start_time) >= oneWeekAgo;
                } catch (e) {
                    return true;
                }
            });
            
            setSessions(filteredSessions);
        } catch (err) {
            console.error("Error loading form options:", err);
        }
    };

    const handleCreate = async (e: React.FormEvent | null) => {
        if (e) e.preventDefault();

        setSaving(true);
        try {
            await api.createAdminBooking({
                user_id: createForm.user_id,
                session_id: createForm.session_id,
                notes: createForm.notes || undefined,
            });
            setShowCreate(false);
            setCreateForm({ user_id: "", session_id: "", notes: "" });
            setMessage({ type: "success", text: "Inscription créée avec succès !" });
            await loadBookings();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la création." });
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (booking: AdminBookingItem) => {
        setEditBooking(booking);
        setEditForm({
            notes: booking.notes || "",
            status: booking.status,
        });
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editBooking) return;
        try {
            await api.updateAdminBooking(editBooking.id, {
                notes: editForm.notes || undefined,
                status: editForm.status || undefined,
            });
            setEditBooking(null);
            setMessage({ type: "success", text: "Inscription modifiée avec succès !" });
            await loadBookings();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la modification." });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.deleteAdminBooking(id);
            setDeleteConfirmId(null);
            setMessage({ type: "success", text: "Inscription supprimée." });
            await loadBookings();
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la suppression." });
        }
    };

    const filteredBookings = bookings.filter((b) => {
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            if (!b.user_name.toLowerCase().includes(q) && !b.session_title.toLowerCase().includes(q)) return false;
        }
        if (filterStatuses.length > 0 && !filterStatuses.includes(b.status)) return false;
        if (dateFrom && b.session_date < dateFrom) return false;
        if (dateTo && b.session_date > dateTo) return false;
        return true;
    }).sort((a, b) => {
        if (a.session_date !== b.session_date) return b.session_date.localeCompare(a.session_date);
        if (a.session_time !== b.session_time) return (b.session_time || "").localeCompare(a.session_time || "");
        return a.session_title.localeCompare(b.session_title);
    });

    const handleExport = () => {
        const BOM = "\uFEFF";
        const header = "Date;Heure;Intitulé;Nom;Statut;Crédits;Notes;Créé par admin";
        const rows = filteredBookings.map((b) => [
            b.session_date ? new Date(b.session_date).toLocaleDateString("fr-FR") : "",
            b.session_time || "",
            b.session_title,
            b.user_name,
            STATUS_LABELS[b.status] || b.status,
            b.credits_used,
            (b.notes || "").replace(/[\n;]/g, " "),
            b.created_by_admin ? "Oui" : "Non",
        ].join(";"));
        const csv = BOM + header + "\n" + rows.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `inscriptions_seances_${dateFrom || "debut"}_${dateTo || "fin"}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getStatusBadge = (booking: AdminBookingItem) => {
        const base = "inline-flex items-center justify-center px-2 py-1 text-xs font-normal rounded-full border whitespace-nowrap";
        switch (booking.status) {
            case "confirmed": return <span className={`${base} bg-emerald-50 text-emerald-600 border-emerald-100`}>{STATUS_LABELS.confirmed}</span>;
            case "pending": return <span className={`${base} bg-amber-50 text-amber-600 border-amber-100`}>{STATUS_LABELS.pending}</span>;
            case "cancelled": return <span className={`${base} bg-rose-50 text-rose-600 border-rose-100`}>{STATUS_LABELS.cancelled}</span>;
            case "session_cancelled": return <span className={`${base} bg-rose-50 text-rose-600 border-rose-100`}>{STATUS_LABELS.session_cancelled}</span>;
            case "absent": return <span className={`${base} bg-slate-50 text-slate-600 border-slate-200`}>{STATUS_LABELS.absent}</span>;
            default: return <span className={`${base} bg-gray-50 text-gray-500 border-gray-200`}>{booking.status}</span>;
        }
    };

    const getEditStatusOptions = (currentStatus: string) => {
        if (currentStatus === "session_cancelled") {
            return [
                { value: "session_cancelled", label: "🚫 Séance annulée" },
                { value: "confirmed", label: "✅ Re-confirmer" },
            ];
        }
        return [
            { value: "confirmed", label: "✅ Inscrit" },
            { value: "pending", label: "⏳ Sur liste" },
            { value: "cancelled", label: "🚫 Annulé" },
            { value: "absent", label: "❌ Absent" },
        ];
    };

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">📋 Inscriptions aux séances</h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Consultation et gestion des inscriptions aux séances</p>
                        </div>
                        <button
                            onClick={() => { setShowCreate(true); loadFormOptions(); }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-sm text-sm active:scale-95"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Nouvelle inscription
                        </button>
                    </div>

                    {/* Message */}
                    {message && (
                        <div className={`p-4 rounded-lg border ${message.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                            {message.text}
                        </div>
                    )}

                    {/* Search + Filters */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex flex-col md:flex-row gap-3 items-end flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input type="text" placeholder="Nom, séance, notes..."
                                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-normal" />
                            </div>
                            <div className="w-52">
                                <MultiSelect
                                    label="Statut(s)"
                                    options={[
                                        { id: "confirmed", label: "Inscrit" },
                                        { id: "pending", label: "Sur liste" },
                                        { id: "cancelled", label: "Annulé" },
                                        { id: "session_cancelled", label: "Séance annulée" },
                                        { id: "absent", label: "Absent" },
                                    ]}
                                    selected={filterStatuses}
                                    onChange={setFilterStatuses}
                                    placeholder="Tous"
                                />
                            </div>
                            {tenant && (tenant.locations || []).length > 1 && (
                                <div className="w-48">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Lieu</label>
                                    <select 
                                        value={locationFilter} 
                                        onChange={(e) => setLocationFilter(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-normal transition-all cursor-pointer"
                                    >
                                        <option value="all">Tous les lieux</option>
                                        {(tenant.locations || []).map((loc: string) => (
                                            <option key={loc} value={loc}>{loc}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="flex items-end gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1 text-left">Du</label>
                                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1 text-left">Au</label>
                                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                            </div>
                            <button onClick={handleExport}
                                className="px-3 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg font-medium hover:bg-emerald-100 transition-colors text-sm whitespace-nowrap shadow-sm">
                                📥 Export Excel
                            </button>
                        </div>
                    </div>

                    {/* Bookings Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Date</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Heure</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Intitulé</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Nom</th>
                                        <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">Statut</th>
                                        <th className="px-3 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredBookings.map((booking) => (
                                        <tr key={booking.id} className="hover:bg-gray-50 group transition-all">
                                            <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-700">
                                                {booking.session_date ? booking.session_date.split('-').reverse().join('/') : "—"}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                                                {booking.session_time || "—"}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-medium text-slate-900">{booking.session_title || "—"}</span>
                                                    {booking.notes && (
                                                        <span title={booking.notes} className="text-slate-400 cursor-help text-xs">📝</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-slate-900">{booking.user_name}</span>
                                                    {booking.created_by_admin && (
                                                        <span title="Créé par le manager" className="text-amber-500 text-xs">🛡️</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-center">
                                                {getStatusBadge(booking)}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-center flex items-center justify-center gap-0.5">
                                                <button onClick={() => openEdit(booking)} className="p-1 hover:bg-blue-50 text-blue-500 rounded-lg transition-all hover:scale-105" title="Modifier">✏️</button>
                                                <button onClick={() => setDeleteConfirmId(booking.id)} className="p-1 hover:bg-rose-50 text-rose-500 rounded-lg transition-all hover:scale-105" title="Supprimer">🗑️</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredBookings.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                                Aucune inscription trouvée.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {showCreate && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-xl w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden max-h-[90vh]">
                        {/* Header */}
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">Nouvelle inscription</h3>
                            </div>
                            <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-lg">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            <form onSubmit={(e) => handleCreate(e)} id="createBookingForm" className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Utilisateur *</label>
                                    <select required value={createForm.user_id} onChange={(e) => setCreateForm({ ...createForm, user_id: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all hover:border-gray-300">
                                        <option value="">Sélectionner...</option>
                                        {users.map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.first_name} {u.last_name} ({u.balance ?? 0} crédits)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Séance *</label>
                                    <select required value={createForm.session_id} onChange={(e) => setCreateForm({ ...createForm, session_id: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all hover:border-gray-300">
                                        <option value="">Sélectionner...</option>
                                        {sessions.map((s) => {
                                            const dt = new Date(s.start_time);
                                            const dateStr = dt.toLocaleDateString("fr-FR");
                                            const timeStr = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                                            const spotsLeft = s.max_participants - s.current_participants;
                                            const credits = s.credits_required ?? 0;
                                            return (
                                                <option key={s.id} value={s.id}>
                                                    {dateStr} {timeStr} — {s.title} ({spotsLeft > 0 ? `${spotsLeft} place${spotsLeft > 1 ? "s" : ""}` : "complet"} - {credits} crédits)
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Note interne</label>
                                    <textarea value={createForm.notes}
                                        onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all hover:border-gray-300" rows={2} />
                                </div>
                            </form>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button type="button" onClick={() => setShowCreate(false)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">Annuler</button>
                            <button type="submit" form="createBookingForm" disabled={saving}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95 disabled:opacity-50">
                                {saving ? "Création..." : "Valider l'inscription"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editBooking && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-xl w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">Modifier l&apos;inscription</h3>
                            </div>
                            <button onClick={() => setEditBooking(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-lg">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8">
                            <div className="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 opacity-5 text-4xl">🧘</div>
                                <div className="flex justify-between items-center group">
                                    <span className="text-sm font-medium text-slate-500">Séance</span>
                                    <span className="text-sm font-semibold text-slate-900">{editBooking.session_title}</span>
                                </div>
                                <div className="flex justify-between items-center group">
                                    <span className="text-sm font-medium text-slate-500">Utilisateur</span>
                                    <span className="text-sm font-bold text-emerald-600 px-2 py-1 bg-emerald-50 rounded-lg">{editBooking.user_name}</span>
                                </div>
                                <div className="flex justify-between items-start group">
                                    <span className="text-sm font-medium text-slate-500">Date & heure</span>
                                    <div className="text-right">
                                        <span className="text-sm font-semibold text-slate-900 block capitalize">
                                            {editBooking.session_date ? format(parseISO(editBooking.session_date), "eeee d MMMM", { locale: fr }) : "—"}
                                        </span>
                                        <span className="text-xs text-slate-500 font-medium">à {editBooking.session_time}</span>
                                    </div>
                                </div>
                            </div>
                            <form onSubmit={handleEditSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                                    <select value={editForm.status}
                                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all hover:border-gray-300">
                                        {getEditStatusOptions(editBooking.status).map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Note interne</label>
                                    <textarea value={editForm.notes}
                                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all hover:border-gray-300" rows={2} />
                                </div>
                                <div className="flex gap-3 justify-end items-center pt-4">
                                    <button type="button" onClick={() => setEditBooking(null)}
                                        className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">Annuler</button>
                                    <button type="submit"
                                        className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95">Enregistrer</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {deleteConfirmId && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2 tracking-tight">Confirmer la suppression</h3>
                            <p className="text-slate-500 text-base leading-relaxed">
                                Attention : cette action est irréversible. L'inscription sera définitivement supprimée.
                            </p>
                            <div className="mt-8 flex gap-3 justify-end items-center">
                                <button 
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm"
                                >
                                    Annuler
                                </button>
                                <button 
                                    onClick={() => handleDelete(deleteConfirmId)}
                                    className="px-6 py-2.5 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition-all text-sm shadow-sm active:scale-95"
                                >
                                    Confirmer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
