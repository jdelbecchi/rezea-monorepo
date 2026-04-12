"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
    const [user, setUser] = useState<User | null>(null);
    const [bookings, setBookings] = useState<AdminBookingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatuses, setFilterStatuses] = useState<string[]>(["confirmed"]);
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
            const userData = await api.getCurrentUser();
            if (userData.role !== "owner" && userData.role !== "manager") {
                router.push("/dashboard");
                return;
            }
            setUser(userData);
            await loadBookings();
        } catch (err) {
            console.error(err);
            router.push("/login");
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

    const getStatusBadge = (b: AdminBookingItem) => {
        switch (b.status) {
            case "confirmed":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">✅ Inscrit</span>;
            case "pending":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-800">⏳ Sur liste</span>;
            case "cancelled":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800">🚫 Annulé</span>;
            case "session_cancelled":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-orange-100 text-orange-800">🚫 Séance annulée</span>;
            case "absent":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800">❌ Absent</span>;
            default:
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-600">{b.status}</span>;
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
                            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">📋 Inscriptions aux séances</h1>
                            <p className="text-slate-500 mt-1">Gestion des inscriptions aux séances de cours</p>
                        </div>
                        <button
                            onClick={() => { setShowCreate(true); loadFormOptions(); }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            ➕ Nouvelle inscription
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
                        <div className="flex flex-col md:flex-row gap-3 items-end">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input type="text" placeholder="Nom, intitulé de séance..."
                                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                            </div>
                            <div className="flex-1 min-w-[200px]">
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
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Du</label>
                                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Au</label>
                                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <button onClick={handleExport}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors text-sm whitespace-nowrap">
                                📥 Export Excel
                            </button>
                        </div>
                        {(searchTerm || dateFrom || dateTo) && (
                            <div className="mt-2 text-xs text-slate-500">
                                {filteredBookings.length} inscription{filteredBookings.length > 1 ? "s" : ""} affichée{filteredBookings.length > 1 ? "s" : ""}
                            </div>
                        )}
                    </div>

                    {/* Bookings Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Heure</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Intitulé</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredBookings.map((booking) => (
                                        <tr key={booking.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                                {booking.session_date ? booking.session_date.split('-').reverse().join('/') : "—"}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                                {booking.session_time || "—"}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-medium text-slate-900">{booking.session_title || "—"}</span>
                                                    {booking.notes && (
                                                        <span title={booking.notes} className="text-blue-400 cursor-help">📝</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-medium text-slate-900">{booking.user_name}</span>
                                                    {booking.created_by_admin && (
                                                        <span title="Créé par le manager" className="text-amber-500">🛡️</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {getStatusBadge(booking)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm space-x-2">
                                                <button onClick={() => openEdit(booking)} className="text-blue-600 hover:text-blue-800 font-medium" title="Modifier">✏️</button>
                                                <button onClick={() => setDeleteConfirmId(booking.id)} className="text-red-600 hover:text-red-800 font-medium" title="Supprimer">🗑️</button>
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

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">➕ Nouvelle inscription</h3>
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
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => setShowCreate(false)}
                                    className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300">Annuler</button>
                                <button type="submit" disabled={saving}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                                    {saving ? "Création..." : "Inscrire"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editBooking && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Modifier l&apos;inscription</h3>
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
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => setEditBooking(null)}
                                    className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300">Annuler</button>
                                <button type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Enregistrer</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Confirmer la suppression</h3>
                        <p className="text-slate-600 mb-4">Cette inscription sera définitivement supprimée et les crédits seront remboursés.</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteConfirmId(null)}
                                className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300">Annuler</button>
                            <button onClick={() => handleDelete(deleteConfirmId)}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700">Supprimer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
