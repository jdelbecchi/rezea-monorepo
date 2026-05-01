"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User, AdminBookingItem } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import MultiSelect from "@/components/MultiSelect";

const STATUS_LABELS: Record<string, string> = {
    confirmed: "Inscrit",
    pending: "Sur liste",
    cancelled: "Annulé",
    session_cancelled: "Séance annulée",
    absent: "Absent",
};

interface UserOption { id: string; first_name: string; last_name: string; }
interface SessionOption { id: string; title: string; start_time: string; max_participants: number; current_participants: number; }

export default function AdminBookingsPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [bookings, setBookings] = useState<AdminBookingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatuses, setFilterStatuses] = useState<string[]>(["confirmed"]);
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
            // Load all bookings for the session and filter in frontend for multi-select
            // Or if we want to be efficient, we can load everything without status filter
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
                    return true; // En cas d'erreur de date, on garde la séance par sécurité
                }
            });
            
            setSessions(filteredSessions);
        } catch (err) {
            console.error("Error loading form options:", err);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
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

    // Filtering
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
        // 1. Date (Décroissant)
        if (a.session_date !== b.session_date) return b.session_date.localeCompare(a.session_date);
        // 2. Heure (Décroissant)
        if (a.session_time !== b.session_time) return (b.session_time || "").localeCompare(a.session_time || "");
        // 3. Intitulé
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
        const base = "px-2 py-1 text-xs font-normal rounded-full border whitespace-nowrap";
        switch (booking.status) {
            case "confirmed": return <span className={`${base} bg-emerald-50 text-emerald-600 border-emerald-100`}>Validé</span>;
            case "pending": return <span className={`${base} bg-amber-50 text-amber-600 border-amber-100`}>Sur liste</span>;
            case "cancelled": return <span className={`${base} bg-rose-50 text-rose-600 border-rose-100`}>Annulé</span>;
            case "session_cancelled": return <span className={`${base} bg-rose-50 text-rose-600 border-rose-100`}>Séance annulée</span>;
            case "absent": return <span className={`${base} bg-slate-50 text-slate-600 border-slate-200`}>Absent</span>;
            default: return <span className={`${base} bg-gray-50 text-gray-500 border-gray-200`}>{booking.status}</span>;
        }
    };

    // Statuts disponibles dans l'édition (Flexibilité totale)
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
                            <p className="text-base font-normal text-slate-500 mt-1">Gestion des inscriptions aux séances de cours</p>
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
                                    placeholder="Toutes"
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

                    {(searchTerm || dateFrom || dateTo) && (
                        <div className="mt-2 text-xs text-slate-500">
                            {filteredBookings.length} inscription{filteredBookings.length > 1 ? "s" : ""} affichée{filteredBookings.length > 1 ? "s" : ""}
                        </div>
                    )}

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
                                            <td className="px-3 py-4 whitespace-nowrap">
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
                                                {searchTerm || dateFrom || dateTo || filterStatuses.length > 0
                                                    ? "Aucune inscription ne correspond aux filtres"
                                                    : "Aucune inscription pour le moment"}
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
                    <div className="bg-white rounded-3xl p-10 max-w-xl w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-semibold text-slate-900 mb-6 tracking-tight">➕ Nouvelle inscription</h3>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Utilisateur *</label>
                                <select required value={createForm.user_id} onChange={(e) => setCreateForm({ ...createForm, user_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="">Sélectionner...</option>
                                    {users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Séance *</label>
                                <select required value={createForm.session_id} onChange={(e) => setCreateForm({ ...createForm, session_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="">Sélectionner...</option>
                                    {sessions.map((s) => {
                                        const dt = new Date(s.start_time);
                                        const dateStr = dt.toLocaleDateString("fr-FR");
                                        const timeStr = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                                        const spotsLeft = s.max_participants - s.current_participants;
                                        return (
                                            <option key={s.id} value={s.id}>
                                                {dateStr} {timeStr} — {s.title} ({spotsLeft > 0 ? `${spotsLeft} place${spotsLeft > 1 ? "s" : ""}` : "complet"})
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                <textarea value={createForm.notes}
                                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" rows={2} />
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                                <button type="button" onClick={() => setShowCreate(false)}
                                    className="px-6 py-2.5 bg-gray-100 text-slate-600 rounded-xl font-medium hover:bg-gray-200 transition-colors">Annuler</button>
                                <button type="submit" disabled={saving}
                                    className="px-8 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50">
                                    {saving ? "Création..." : "Inscrire"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editBooking && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-10 max-w-xl w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-semibold text-slate-900 mb-6 tracking-tight">Modifier l&apos;inscription</h3>
                        <div className="mb-4 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                            <p><strong>Séance :</strong> {editBooking.session_title}</p>
                            <p><strong>Utilisateur :</strong> {editBooking.user_name}</p>
                            <p><strong>Date :</strong> {editBooking.session_date ? editBooking.session_date.split('-').reverse().join('/') : "—"} à {editBooking.session_time}</p>
                        </div>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                                <select value={editForm.status}
                                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    {getEditStatusOptions(editBooking.status).map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                <textarea value={editForm.notes}
                                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" rows={2} />
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                                <button type="button" onClick={() => setEditBooking(null)}
                                    className="px-6 py-2.5 bg-gray-100 text-slate-600 rounded-xl font-medium hover:bg-gray-200 transition-colors">Annuler</button>
                                <button type="submit"
                                    className="px-8 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors shadow-sm">Enregistrer</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deleteConfirmId && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-10 max-w-md mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-semibold text-slate-900 mb-2 tracking-tight">Confirmer la suppression</h3>
                        <p className="text-slate-500 mb-8 font-normal text-base leading-relaxed">Cette inscription sera définitivement supprimée et les crédits seront remboursés au membre.</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDeleteConfirmId(null)}
                                className="flex-1 px-4 py-3 bg-gray-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all">Annuler</button>
                            <button onClick={() => handleDelete(deleteConfirmId)}
                                className="flex-1 px-4 py-3 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-900/20">Supprimer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
