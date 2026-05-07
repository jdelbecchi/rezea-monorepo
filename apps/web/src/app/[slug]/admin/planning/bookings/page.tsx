"use client";

import { useEffect, useState, useMemo } from "react";
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
    }, [params.slug]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [userData, tenantData] = await Promise.all([
                api.getCurrentUser(),
                api.getTenantSettings(),
            ]);

            if (userData.role !== "owner" && userData.role !== "manager") {
                router.push("/home");
                return;
            }
            setUser(userData);
            setTenant(tenantData);

            const data = await api.getAdminBookings(undefined);
            setBookings(data || []);
            loadFormOptions();
        } catch (err: any) {
            console.error("Fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    const loadBookings = async () => {
        try {
            const data = await api.getAdminBookings(undefined);
            setBookings(data || []);
        } catch (err) {
            console.error(err);
        }
    };

    const loadFormOptions = async () => {
        try {
            const [usersList, sessionsList] = await Promise.all([
                api.getAdminUsers(),
                api.getAdminSessions(),
            ]);
            setUsers(usersList);
            setSessions(sessionsList);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createForm.user_id || !createForm.session_id) return;
        setSaving(true);
        try {
            await api.createAdminBooking(createForm);
            setMessage({ type: "success", text: "Inscription créée avec succès" });
            setShowCreate(false);
            setCreateForm({ user_id: "", session_id: "", notes: "" });
            loadBookings();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la création" });
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (booking: AdminBookingItem) => {
        setEditBooking(booking);
        setEditForm({ notes: booking.notes || "", status: booking.status });
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editBooking) return;
        setSaving(true);
        try {
            await api.updateAdminBooking(editBooking.id, editForm);
            setMessage({ type: "success", text: "Inscription mise à jour" });
            setEditBooking(null);
            loadBookings();
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la mise à jour" });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirmId) return;
        setSaving(true);
        try {
            await api.deleteAdminBooking(deleteConfirmId);
            setMessage({ type: "success", text: "Inscription supprimée" });
            setDeleteConfirmId(null);
            loadBookings();
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la suppression" });
        } finally {
            setSaving(false);
        }
    };

    const filteredBookings = useMemo(() => {
        if (!bookings || !Array.isArray(bookings)) return [];
        return bookings.filter(b => {
            if (!b) return false;
            if (searchTerm && searchTerm.length > 1) {
                const q = searchTerm.toLowerCase();
                if (!(b.user_name || "").toLowerCase().includes(q) && 
                    !(b.session_title || "").toLowerCase().includes(q)) return false;
            }
            if (filterStatuses.length > 0 && !filterStatuses.includes(b.status)) return false;
            if (locationFilter !== "all" && b.session_location !== locationFilter) return false;
            if (dateFrom && b.session_date && b.session_date < dateFrom) return false;
            if (dateTo && b.session_date && b.session_date > dateTo) return false;
            return true;
        }).sort((a, b) => {
            const dateA = a.session_date || "";
            const dateB = b.session_date || "";
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            return (b.session_time || "").localeCompare(a.session_time || "");
        });
    }, [bookings, searchTerm, filterStatuses, locationFilter, dateFrom, dateTo]);

    const getStatusBadge = (booking: AdminBookingItem) => {
        const status = booking.status;
        const base = "px-2 py-1 text-xs font-normal rounded-full border whitespace-nowrap";
        switch (status) {
            case "confirmed":
                return <span className={`${base} bg-emerald-50 text-emerald-600 border-emerald-100`}>Inscrit</span>;
            case "pending":
                return <span className={`${base} bg-amber-50 text-amber-600 border-amber-100`}>Sur liste</span>;
            case "cancelled":
                return <span className={`${base} bg-slate-50 text-slate-500 border-slate-200`}>Annulé</span>;
            case "absent":
                return <span className={`${base} bg-rose-50 text-rose-600 border-rose-100`}>Absent</span>;
            default:
                return <span className={`${base} bg-gray-50 text-gray-500 border-gray-200`}>{status}</span>;
        }
    };

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">
                                📋 Inscriptions aux séances
                            </h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Consultation et gestion des inscriptions aux séances</p>
                        </div>
                        <button
                            onClick={() => { setShowCreate(true); loadFormOptions(); }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-sm text-sm active:scale-95 tracking-tight"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Nouvelle inscription
                        </button>
                    </div>

                    {message && (
                        <div className={`p-4 rounded-2xl flex items-center justify-between animate-in slide-in-from-top-2 duration-300 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                            <span className="text-sm font-medium">{message.text}</span>
                            <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1">&times;</button>
                        </div>
                    )}

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
                                        { id: "absent", label: "Absent" },
                                    ]}
                                    selected={filterStatuses}
                                    onChange={setFilterStatuses}
                                    placeholder="Tous"
                                />
                            </div>
                            <div className="flex items-end gap-2">
                                {tenant && (tenant.locations || []).length > 1 && (
                                    <div className="w-48">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Lieu</label>
                                        <select 
                                            value={locationFilter} 
                                            onChange={(e) => setLocationFilter(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-normal transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="all">Tous les lieux</option>
                                            {(tenant.locations || []).map((loc: string) => (
                                                <option key={loc} value={loc}>{loc}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Du</label>
                                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Au</label>
                                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-100 border-b border-slate-200">
                                    <tr>
                                        <th className="pl-4 pr-0 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Date</th>
                                        <th className="pl-1 pr-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Heure</th>
                                        <th className="pl-4 pr-0 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Séance</th>
                                        <th className="pl-1 pr-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Lieu</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Utilisateur</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">Statut</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-widest">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {filteredBookings.map((booking) => (
                                        <tr key={booking.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="pl-4 pr-0 py-2.5 whitespace-nowrap">
                                                <span className="text-sm font-normal text-slate-700">
                                                    {booking.session_date ? booking.session_date.split('-').reverse().join('/') : "—"}
                                                </span>
                                            </td>
                                            <td className="pl-1 pr-4 py-2.5 whitespace-nowrap">
                                                <span className="text-sm font-medium text-slate-900">
                                                    {booking.session_time || "—"}
                                                </span>
                                            </td>
                                            <td className="pl-4 pr-0 py-2.5 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-slate-900">{booking.session_title}</span>
                                                    {booking.notes && (
                                                        <span title={booking.notes} className="text-blue-400 cursor-help">
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                            </svg>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="pl-1 pr-4 py-2.5 whitespace-nowrap">
                                                <span className="text-xs text-slate-400 font-normal">
                                                    {booking.session_location ? `📍 ${booking.session_location}` : "—"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-slate-900">{booking.user_name}</span>
                                                    {booking.has_pending_order && (
                                                        <span title="Paiement en attente (Commande non réglée)" className="flex-shrink-0 w-4 h-4 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center text-[10px] font-bold border border-amber-200 shadow-sm">!</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-center">
                                                {getStatusBadge(booking)}
                                            </td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-0.5">
                                                    <button onClick={() => openEdit(booking)} className="p-1 hover:bg-blue-50 text-blue-500 rounded-lg transition-all hover:scale-110" title="Modifier">✏️</button>
                                                    <button onClick={() => setDeleteConfirmId(booking.id)} className="p-1 hover:bg-rose-50 text-rose-500 rounded-lg transition-all hover:scale-110" title="Supprimer">🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredBookings.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-16 text-center text-slate-400 italic">
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

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Nouvelle inscription</h2>
                            <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleCreate} className="p-8 space-y-6">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Utilisateur</label>
                                <select
                                    required
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all text-sm appearance-none bg-white cursor-pointer"
                                    value={createForm.user_id}
                                    onChange={(e) => setCreateForm({ ...createForm, user_id: e.target.value })}
                                >
                                    <option value="">Sélectionner un utilisateur</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.balance || 0} crédits)</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Séance</label>
                                <select
                                    required
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all text-sm appearance-none bg-white cursor-pointer"
                                    value={createForm.session_id}
                                    onChange={(e) => setCreateForm({ ...createForm, session_id: e.target.value })}
                                >
                                    <option value="">Sélectionner une séance</option>
                                    {sessions.map(s => (
                                        <option key={s.id} value={s.id}>{format(parseISO(s.start_time), "dd/MM", { locale: fr })} - {s.title} ({s.current_participants}/{s.max_participants}) - {s.credits_required || 0} crédits</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Notes (interne)</label>
                                <textarea
                                    placeholder="Ajouter un commentaire sur cette inscription..."
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all text-sm min-h-[100px] resize-none"
                                    value={createForm.notes}
                                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-4 pt-2">
                                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 px-4 py-3 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all font-semibold text-sm">Annuler</button>
                                <button type="submit" disabled={saving} className="flex-1 px-4 py-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 disabled:opacity-50 transition-all font-semibold text-sm shadow-lg shadow-slate-200">
                                    {saving ? "Création..." : "Inscrire"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editBooking && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                            <div className="space-y-1">
                                <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Modifier l'inscription</h2>
                                <p className="text-sm text-slate-500 font-medium">{editBooking.user_name} — {editBooking.session_title}</p>
                            </div>
                            <button onClick={() => setEditBooking(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleUpdate} className="p-8 space-y-6">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Statut</label>
                                <select
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all text-sm appearance-none bg-white cursor-pointer"
                                    value={editForm.status}
                                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                >
                                    {Object.entries(STATUS_LABELS).map(([val, label]) => (
                                        <option key={val} value={val}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Notes (interne)</label>
                                <textarea
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all text-sm min-h-[100px] resize-none"
                                    value={editForm.notes}
                                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-4 pt-2">
                                <button type="button" onClick={() => setEditBooking(null)} className="flex-1 px-4 py-3 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all font-semibold text-sm">Annuler</button>
                                <button type="submit" disabled={saving} className="flex-1 px-4 py-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 disabled:opacity-50 transition-all font-semibold text-sm shadow-lg shadow-slate-200">
                                    {saving ? "Enregistrement..." : "Enregistrer"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full p-10 animate-in zoom-in-95 duration-200 border border-slate-100">
                        <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mb-8 mx-auto">
                            <span className="text-4xl">⚠️</span>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-3 text-center tracking-tight">Supprimer l'inscription ?</h2>
                        <p className="text-slate-500 mb-10 leading-relaxed text-center font-medium">
                            Cette action est irréversible. L'utilisateur sera retiré de la séance et ses crédits lui seront restitués si applicable.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="flex-1 px-6 py-4 border border-slate-200 rounded-2xl hover:bg-slate-50 text-slate-500 font-bold transition-all active:scale-95"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={saving}
                                className="flex-1 px-6 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-bold shadow-xl shadow-rose-200 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {saving ? "Suppression..." : "Supprimer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
