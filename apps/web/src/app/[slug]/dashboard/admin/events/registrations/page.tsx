"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, User, AdminEventRegistrationItem } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import MultiSelect from "@/components/MultiSelect";

const STATUS_LABELS: Record<string, string> = {
    confirmed: "Inscrit",
    pending_payment: "Inscrit",
    waiting_list: "Sur liste",
    cancelled: "Annulé",
    absent: "Absent",
};

const PAYMENT_LABELS: Record<string, string> = {
    a_valider: "À valider",
    en_attente: "En attente",
    paye: "Payé",
    rembourse: "Remboursé",
};

interface UserOption { id: string; first_name: string; last_name: string; }
interface EventOption {
    id: string; title: string; event_date: string; event_time: string;
    max_places: number; registrations_count: number;
    price_member_cents: number; price_external_cents: number;
}

export default function AdminEventRegistrationsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [registrations, setRegistrations] = useState<AdminEventRegistrationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
    const [filterPayments, setFilterPayments] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [events, setEvents] = useState<EventOption[]>([]);
    const [createForm, setCreateForm] = useState({
        user_id: "", event_id: "", price_paid_cents: 0, payment_status: "a_valider", notes: "",
    });
    const [saving, setSaving] = useState(false);

    // Edit modal
    const [editReg, setEditReg] = useState<AdminEventRegistrationItem | null>(null);
    const [editForm, setEditForm] = useState({ notes: "", status: "", payment_status: "", price_paid_cents: 0 });

    // Delete confirm
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Invoice
    const [invoiceReg, setInvoiceReg] = useState<AdminEventRegistrationItem | null>(null);
    const [invoiceData, setInvoiceData] = useState({
        invoice_number: "",
        invoice_date: "",
        emitter: "Mon Club",
        recipient: "",
        description: "",
        amount: "0,00",
        notes: "",
    });

    useEffect(() => { fetchData(); }, [router]);
    useEffect(() => { if (user) loadRegistrations(); }, [filterStatuses, filterPayments]);

    const fetchData = async () => {
        try {
            const userData = await api.getCurrentUser();
            if (userData.role !== "owner" && userData.role !== "manager") {
                router.push("/dashboard");
                return;
            }
            setUser(userData);
            await loadRegistrations();
        } catch (err: any) {
            console.error(err);
            if (err.response?.status === 401) {
                router.push("/login");
            }
        } finally {
            setLoading(false);
        }
    };

    const loadRegistrations = async () => {
        try {
            // Load all and filter in frontend for multi-select flexibility
            const data = await api.getAdminEventRegistrations({});
            setRegistrations(data);
        } catch (err) {
            console.error(err);
        }
    };

    const loadFormOptions = async () => {
        try {
            const [usersData, eventsData] = await Promise.all([
                api.getAdminUsers({}),
                api.getAdminEventsForRegistrations(),
            ]);
            setUsers(usersData);
            setEvents(eventsData);
        } catch (err) {
            console.error("Error loading form options:", err);
        }
    };

    const onEventChange = (eventId: string) => {
        const evt = events.find(e => e.id === eventId);
        setCreateForm({
            ...createForm,
            event_id: eventId,
            price_paid_cents: evt ? evt.price_member_cents : 0,
        });
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.createAdminEventRegistration({
                user_id: createForm.user_id,
                event_id: createForm.event_id,
                price_paid_cents: createForm.price_paid_cents,
                payment_status: createForm.payment_status,
                notes: createForm.notes || undefined,
            });
            setShowCreate(false);
            setCreateForm({ user_id: "", event_id: "", price_paid_cents: 0, payment_status: "a_valider", notes: "" });
            setMessage({ type: "success", text: "Inscription créée avec succès !" });
            await loadRegistrations();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la création." });
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (reg: AdminEventRegistrationItem) => {
        setEditReg(reg);
        setEditForm({
            notes: reg.notes || "",
            status: reg.status,
            payment_status: reg.payment_status,
            price_paid_cents: reg.price_paid_cents
        });
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editReg) return;
        try {
            await api.updateAdminEventRegistration(editReg.id, {
                notes: editForm.notes || undefined,
                status: editForm.status || undefined,
                payment_status: editForm.payment_status || undefined,
                price_paid_cents: editForm.price_paid_cents,
            });
            setEditReg(null);
            setMessage({ type: "success", text: "Inscription modifiée avec succès !" });
            await loadRegistrations();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la modification." });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.deleteAdminEventRegistration(id);
            setDeleteConfirmId(null);
            setMessage({ type: "success", text: "Inscription supprimée." });
            await loadRegistrations();
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la suppression." });
        }
    };


    const openInvoice = (reg: AdminEventRegistrationItem) => {
        setInvoiceReg(reg);
        const today = new Date().toISOString().split("T")[0];
        setInvoiceData({
            invoice_number: `EVT-${Date.now().toString().slice(-6)}`,
            invoice_date: today,
            emitter: user?.tenant_id ? "Votre Club" : "Mon Club",
            recipient: reg.user_name,
            description: `Participation à l'événement: ${reg.event_title}`,
            amount: (reg.price_paid_cents / 100).toFixed(2).replace(".", ","),
            notes: "",
        });
    };

    const downloadInvoice = () => {
        if (!invoiceReg) return;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture ${invoiceData.invoice_number}</title>
<style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#333}
h1{color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:10px}
.info{display:flex;justify-content:space-between;margin:20px 0}
.info div{width:45%}
table{width:100%;border-collapse:collapse;margin:20px 0}
th,td{border:1px solid #ddd;padding:10px;text-align:left}
th{background:#f1f5f9}
.total{text-align:right;font-size:1.3em;font-weight:bold;margin:20px 0}
.notes{margin-top:30px;padding:15px;background:#f8fafc;border-radius:8px}
@media print{body{margin:0}}</style></head><body>
<h1>FACTURE (ÉVÉNEMENT)</h1>
<div class="info"><div><strong>Émetteur</strong><br>${invoiceData.emitter}</div>
<div style="text-align:right"><strong>N° :</strong> ${invoiceData.invoice_number}<br><strong>Date :</strong> ${invoiceData.invoice_date}</div></div>
<div><strong>Destinataire :</strong> ${invoiceData.recipient}</div>
<table><thead><tr><th>Description</th><th>Date</th><th>Montant</th></tr></thead>
<tbody><tr><td>${invoiceData.description}</td><td>${invoiceReg.event_date}</td><td>${invoiceData.amount} €</td></tr></tbody></table>
<div class="total">Total : ${invoiceData.amount} €</div>
        ${invoiceData.notes ? `<div class="notes"><strong>Notes :</strong><br>${invoiceData.notes}</div>` : ""}
</body></html>`;
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `facture_${invoiceData.invoice_number}.html`;
        a.click();
        URL.revokeObjectURL(url);
        setInvoiceReg(null);
    };

    const filteredRegistrations = registrations.filter((r) => {
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            if (!r.user_name.toLowerCase().includes(q) && !r.event_title.toLowerCase().includes(q)) return false;
        }
        if (filterStatuses.length > 0 && !filterStatuses.includes(r.status)) return false;
        if (filterPayments.length > 0 && !filterPayments.includes(r.payment_status)) return false;
        if (dateFrom && r.event_date < dateFrom) return false;
        if (dateTo && r.event_date > dateTo) return false;
        return true;
    });

    const formatPrice = (cents: number) => (cents / 100).toFixed(2).replace(".", ",") + " €";

    const handleExport = () => {
        const BOM = "\uFEFF";
        const header = "Date;Heure;Intitulé;Nom;Tarif;Paiement;Statut;Notes;Créé par admin";
        const rows = filteredRegistrations.map((r) => [
            r.event_date ? new Date(r.event_date).toLocaleDateString("fr-FR") : "",
            r.event_time || "",
            r.event_title,
            r.user_name,
            formatPrice(r.price_paid_cents),
            PAYMENT_LABELS[r.payment_status] || r.payment_status,
            STATUS_LABELS[r.status] || r.status,
            (r.notes || "").replace(/[\n;]/g, " "),
            r.created_by_admin ? "Oui" : "Non",
        ].join(";"));
        const csv = BOM + header + "\n" + rows.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `inscriptions_evenements_${dateFrom || "debut"}_${dateTo || "fin"}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getStatusBadge = (r: AdminEventRegistrationItem) => {
        switch (r.status) {
            case "confirmed":
            case "pending_payment":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">✅ Inscrit</span>;
            case "waiting_list":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800">⏳ Sur liste</span>;
            case "cancelled":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800">🚫 Annulé</span>;
            case "absent":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800">❌ Absent</span>;
            case "event_deleted":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-orange-100 text-orange-800">🗑️ Supprimée</span>;
            default:
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-600">{r.status}</span>;
        }
    };

    const getPaymentBadge = (r: AdminEventRegistrationItem) => {
        switch (r.payment_status) {
            case "a_valider":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800">⏳ À valider</span>;
            case "en_attente":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-800">📁 En attente</span>;
            case "paye":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">💰 Payé</span>;
            case "rembourse":
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800">↩️ Remboursé</span>;
            default:
                return <span className="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-600">{r.payment_status}</span>;
        }
    };

    const getEditStatusOptions = (currentStatus: string) => {
        if (currentStatus === "event_deleted") {
            return [{ value: "event_deleted", label: "🗑️ Supprimée" }];
        }
        return [
            { value: "confirmed", label: "✅ Inscrit" },
            { value: "waiting_list", label: "⏳ Sur liste" },
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
                            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">🎉 Inscriptions aux événements</h1>
                            <p className="text-slate-500 mt-1">Gestion des inscriptions aux événements</p>
                        </div>
                        <button onClick={() => { setShowCreate(true); loadFormOptions(); }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                            ➕ Nouvelle inscription
                        </button>
                    </div>

                    {/* Message */}
                    {message && (
                        <div className={`p-4 rounded-lg border ${message.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                            {message.text}
                        </div>
                    )}

                    {/* Filters */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex flex-col md:flex-row gap-3 items-end">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input type="text" placeholder="Nom, intitulé d'événement..."
                                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <MultiSelect
                                    label="Statut(s)"
                                    options={[
                                        { id: "confirmed", label: "Inscrit" },
                                        { id: "waiting_list", label: "Sur liste" },
                                        { id: "cancelled", label: "Annulé" },
                                        { id: "absent", label: "Absent" },
                                    ]}
                                    selected={filterStatuses}
                                    onChange={setFilterStatuses}
                                    placeholder="Toutes"
                                />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <MultiSelect
                                    label="Paiement(s)"
                                    options={[
                                        { id: "a_valider", label: "À valider" },
                                        { id: "en_attente", label: "En attente" },
                                        { id: "paye", label: "Payé" },
                                        { id: "rembourse", label: "Remboursé" },
                                    ]}
                                    selected={filterPayments}
                                    onChange={setFilterPayments}
                                    placeholder="Tous"
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
                        {(searchTerm || filterStatuses.length > 0 || filterPayments.length > 0 || dateFrom || dateTo) && (
                            <div className="mt-2 text-xs text-slate-500">
                                {filteredRegistrations.length} inscription{filteredRegistrations.length > 1 ? "s" : ""} affichée{filteredRegistrations.length > 1 ? "s" : ""}
                            </div>
                        )}
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Heure</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Intitulé</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarif</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paiement</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredRegistrations.map((reg) => (
                                        <tr key={reg.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                                {reg.event_date ? new Date(reg.event_date).toLocaleDateString("fr-FR") : "—"}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                                {reg.event_time || "—"}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-medium text-slate-900">{reg.event_title || "—"}</span>
                                                    {reg.notes && <span title={reg.notes} className="text-blue-400 cursor-help">📝</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-medium text-slate-900">{reg.user_name}</span>
                                                    {reg.created_by_admin && <span title="Créé par le manager" className="text-amber-500">🛡️</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-700">
                                                {formatPrice(reg.price_paid_cents)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {getPaymentBadge(reg)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {getStatusBadge(reg)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm space-x-2">
                                                {reg.status !== "event_deleted" && (
                                                    <>
                                                        <button onClick={() => openEdit(reg)} className="text-blue-600 hover:text-blue-800 font-medium" title="Modifier">✏️</button>
                                                        <button onClick={() => openInvoice(reg)} className="text-gray-600 hover:text-gray-800 font-medium" title="Facture">📄</button>
                                                        <button onClick={() => setDeleteConfirmId(reg.id)} className="text-red-600 hover:text-red-800 font-medium" title="Supprimer">🗑️</button>
                                                    </>
                                                )}
                                                {reg.status === "event_deleted" && (
                                                    <span className="text-slate-400 text-xs italic">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredRegistrations.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                                                {searchTerm || dateFrom || dateTo || filterStatuses.length > 0 || filterPayments.length > 0
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
                                <label className="block text-sm font-medium text-slate-700 mb-1">Événement *</label>
                                <select required value={createForm.event_id} onChange={(e) => onEventChange(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="">Sélectionner...</option>
                                    {events.map((ev) => {
                                        const dt = new Date(ev.event_date);
                                        const dateStr = dt.toLocaleDateString("fr-FR");
                                        const spotsLeft = ev.max_places - ev.registrations_count;
                                        return (
                                            <option key={ev.id} value={ev.id}>
                                                {dateStr} {ev.event_time} — {ev.title} ({spotsLeft > 0 ? `${spotsLeft} place${spotsLeft > 1 ? "s" : ""}` : "complet"})
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tarif (€)</label>
                                    <input type="number" step="0.01" min="0"
                                        value={(createForm.price_paid_cents / 100).toFixed(2)}
                                        onChange={(e) => setCreateForm({ ...createForm, price_paid_cents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Paiement</label>
                                    <select value={createForm.payment_status}
                                        onChange={(e) => setCreateForm({ ...createForm, payment_status: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                        <option value="a_valider">⏳ À valider</option>
                                        <option value="en_attente">📁 En attente</option>
                                        <option value="paye">💰 Payé</option>
                                    </select>
                                </div>
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
            {editReg && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Modifier l&apos;inscription</h3>
                        <div className="mb-4 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                            <p><strong>Événement :</strong> {editReg.event_title}</p>
                            <p><strong>Utilisateur :</strong> {editReg.user_name}</p>
                            <p><strong>Date :</strong> {editReg.event_date ? new Date(editReg.event_date).toLocaleDateString("fr-FR") : "—"} à {editReg.event_time}</p>
                            <p><strong>Tarif :</strong> {formatPrice(editReg.price_paid_cents)}</p>
                        </div>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                                    <select value={editForm.status}
                                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                        {getEditStatusOptions(editReg.status).map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tarif (€)</label>
                                    <input type="number" step="0.01" min="0"
                                        value={(editForm.price_paid_cents / 100).toFixed(2)}
                                        onChange={(e) => setEditForm({ ...editForm, price_paid_cents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Paiement</label>
                                    <select value={editForm.payment_status}
                                        onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                        <option value="a_valider">⏳ À valider</option>
                                        <option value="en_attente">📁 En attente</option>
                                        <option value="paye">💰 Payé</option>
                                        <option value="rembourse">↩️ Remboursé</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                <textarea value={editForm.notes}
                                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" rows={2} />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => setEditReg(null)}
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
                        <p className="text-slate-600 mb-4">Cette inscription sera définitivement supprimée et la place sera libérée.</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteConfirmId(null)}
                                className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300">Annuler</button>
                            <button onClick={() => handleDelete(deleteConfirmId)}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700">Supprimer</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Invoice Modal */}
            {invoiceReg && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Générer une facture</h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">N° Facture</label>
                                    <input type="text" value={invoiceData.invoice_number} onChange={(e) => setInvoiceData({ ...invoiceData, invoice_number: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                                    <input type="date" value={invoiceData.invoice_date} onChange={(e) => setInvoiceData({ ...invoiceData, invoice_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Émetteur</label>
                                <input type="text" value={invoiceData.emitter} onChange={(e) => setInvoiceData({ ...invoiceData, emitter: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Destinataire</label>
                                <input type="text" value={invoiceData.recipient} onChange={(e) => setInvoiceData({ ...invoiceData, recipient: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (visibles sur la facture)</label>
                                <textarea value={invoiceData.notes} onChange={(e) => setInvoiceData({ ...invoiceData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" rows={2} />
                            </div>
                            <div className="flex gap-2 justify-end mt-6">
                                <button onClick={() => setInvoiceReg(null)}
                                    className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300">Annuler</button>
                                <button onClick={downloadInvoice}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Télécharger (HTML)</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
