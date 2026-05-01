"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User, OrderItem, InstallmentItem } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { formatCredits } from "@/lib/formatters";
import MultiSelect from "@/components/MultiSelect";

const PAYMENT_LABELS: Record<string, string> = {
    a_valider: "À valider",
    en_attente: "En attente",
    paye: "Payé",
    rembourse: "Remboursé",
    echelonne: "Échelonné",
    a_regulariser: "À régulariser",
};
const STATUS_LABELS: Record<string, string> = {
    active: "Active",
    termine: "Terminée",
    expiree: "Expirée",
    en_pause: "En pause",
    resiliee: "Résiliée",
};
interface OfferOption { id: string; offer_code: string; name: string; }
interface UserOption { id: string; first_name: string; last_name: string; }

function daysUntil(dateStr: string | null): number | null {
    if (!dateStr) return null;
    const end = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatPrice(order: OrderItem): React.ReactNode {
    const formatCents = (cents: number) => (cents % 100 === 0) ? (cents / 100).toString() : (cents / 100).toFixed(2).replace('.', ',');
    // Display the featured price from the offer
    if (order.offer_featured_pricing === "recurring" && order.offer_price_recurring_cents) {
        const amount = formatCents(order.offer_price_recurring_cents);
        const period = order.offer_period ? `/${order.offer_period}` : "";
        const count = order.offer_recurring_count ? ` x${order.offer_recurring_count}` : "";
        return (
            <div className="flex items-baseline gap-1">
                <span className="text-sm font-medium">{amount}€</span>
                <span className="text-[11px] text-slate-500 font-normal">{period}{count}</span>
            </div>
        );
    }
    if (order.offer_featured_pricing === "lump_sum" && order.offer_price_lump_sum_cents) {
        return <span className="text-sm font-medium">{formatCents(order.offer_price_lump_sum_cents)}€</span>;
    }
    return <span className="text-sm font-medium">{formatCents(order.price_cents)}€</span>;
}

export default function AdminShopOrdersPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [orders, setOrders] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Bulk selection
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
    const [dynamicStatuses, setDynamicStatuses] = useState<string[]>(["active", "termine"]);
    const [filterPayments, setFilterPayments] = useState<string[]>([]);
    const [filterExpiry, setFilterExpiry] = useState("");
    const [exportFrom, setExportFrom] = useState("");
    const [exportTo, setExportTo] = useState("");
    const [showCustomStatus, setShowCustomStatus] = useState(false);

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [offers, setOffers] = useState<OfferOption[]>([]);
    const [createForm, setCreateForm] = useState({ user_id: "", offer_id: "", start_date: "", comment: "", user_note: "" });
    const [saving, setSaving] = useState(false);
    const [showErrors, setShowErrors] = useState(false);

    // Edit modal
    const [editOrder, setEditOrder] = useState<OrderItem | null>(null);
    const [editForm, setEditForm] = useState({
        start_date: "",
        end_date: "",
        price_cents: "",
        credits_total: "",
        is_unlimited: false,
        status: "",
        payment_status: "",
        comment: "",
        user_note: ""
    });

    // Delete confirm
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Suspend confirm
    const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);

    // Invoice modal
    const [invoiceOrder, setInvoiceOrder] = useState<OrderItem | null>(null);
    const [invoiceData, setInvoiceData] = useState({
        invoice_number: "", invoice_date: "", emitter: "", recipient: "", description: "", amount: "", notes: "",
    });

    // Installments modal
    const [installmentsOrder, setInstallmentsOrder] = useState<OrderItem | null>(null);
    const [installments, setInstallments] = useState<InstallmentItem[]>([]);
    const [loadingInstallments, setLoadingInstallments] = useState(false);

    useEffect(() => {
        fetchData();
    }, [router]);

    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    const toggleSelection = (orderId: string) => {
        const newSelected = new Set(selectedOrderIds);
        if (newSelected.has(orderId)) {
            newSelected.delete(orderId);
        } else {
            newSelected.add(orderId);
        }
        setSelectedOrderIds(newSelected);
    };

    const toggleAll = (visibleOrders: OrderItem[]) => {
        if (selectedOrderIds.size === visibleOrders.length && visibleOrders.length > 0) {
            setSelectedOrderIds(new Set());
        } else {
            setSelectedOrderIds(new Set(visibleOrders.map(o => o.id)));
        }
    };

    const handleBulkEmail = () => {
        const emails = orders
            .filter(o => selectedOrderIds.has(o.id))
            .map(o => o.user_email)
            .filter(Boolean);
        if (emails.length > 0) {
            window.open(`mailto:?bcc=${Array.from(new Set(emails)).join(",")}`, "_blank");
            setSelectedOrderIds(new Set());
        }
    };

    const handleBulkSuspend = async () => {
        setShowSuspendConfirm(true);
    };

    const confirmBulkSuspend = async () => {
        setShowSuspendConfirm(false);
        setLoading(true);
        try {
            const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id));
            const uniqueUserIds = Array.from(new Set(selectedOrders.map(o => o.user_id)));
            for (const userId of uniqueUserIds) {
                await api.toggleSuspendUser(userId);
            }
            setMessage({ type: "success", text: `${uniqueUserIds.length} client(s) mis à jour avec succès` });
            setSelectedOrderIds(new Set());
            const updatedOrders = await api.getAdminOrders();
            setOrders(updatedOrders);
        } catch (error) {
            setMessage({ type: "error", text: "Erreur lors de la mise à jour des crédits" });
        } finally {
            setLoading(false);
        }
    };

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
            const [ordersData, statusesData] = await Promise.all([
                api.getAdminOrders(),
                api.getAdminOrderStatuses()
            ]);
            setOrders(ordersData);
            setDynamicStatuses(statusesData);
        } catch (err: any) {
            console.error(err);
            if (err.response?.status === 401) {
                router.push(`/${params.slug}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const loadFormOptions = async () => {
        try {
            const [usersData, offersData] = await Promise.all([
                api.getAdminUsers({}),
                api.getOffers(false),
            ]);
            setUsers(usersData);
            setOffers(offersData);
        } catch (err) {
            console.error("Error loading form options:", err);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!createForm.user_id || !createForm.offer_id || !createForm.start_date) {
            setShowErrors(true);
            return;
        }

        setSaving(true);
        try {
            await api.createAdminOrder({
                user_id: createForm.user_id,
                offer_id: createForm.offer_id,
                start_date: createForm.start_date,
                comment: createForm.comment || undefined,
                user_note: createForm.user_note || undefined,
            });
            setShowCreate(false);
            setCreateForm({ user_id: "", offer_id: "", start_date: "", comment: "", user_note: "" });
            setShowErrors(false);
            setMessage({ type: "success", text: "Commande créée avec succès !" });
            fetchData();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la création." });
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (order: OrderItem) => {
        setEditOrder(order);
        setEditForm({
            start_date: order.start_date,
            end_date: order.end_date || "",
            price_cents: (order.price_cents / 100).toString(),
            credits_total: order.credits_total?.toString() || "",
            is_unlimited: order.is_unlimited,
            status: order.status,
            payment_status: order.payment_status,
            comment: order.comment || "",
            user_note: order.user_note || "",
        });
        const isStd = order.status === "active" || order.status === "termine" || order.status === "" || !order.status;
        setShowCustomStatus(!isStd);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editOrder) return;
        try {
            await api.updateAdminOrder(editOrder.id, {
                start_date: editForm.start_date || undefined,
                end_date: editForm.end_date || undefined,
                price_cents: Math.round(parseFloat(editForm.price_cents.replace(',', '.')) * 100),
                credits_total: editForm.is_unlimited ? null : (editForm.credits_total ? parseInt(editForm.credits_total) : null),
                is_unlimited: editForm.is_unlimited,
                status: editForm.status || undefined,
                payment_status: editForm.payment_status as any || undefined,
                comment: editForm.comment,
                user_note: editForm.user_note,
            });
            setEditOrder(null);
            setMessage({ type: "success", text: "Commande modifiée avec succès !" });
            fetchData();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la modification." });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.deleteAdminOrder(id);
            setDeleteConfirmId(null);
            setMessage({ type: "success", text: "Commande supprimée." });
            const updated = await api.getAdminOrders();
            setOrders(updated);
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la suppression." });
        }
    };

    const openInvoice = (order: OrderItem) => {
        setInvoiceOrder(order);
        const today = new Date().toISOString().split("T")[0];
        setInvoiceData({
            invoice_number: `FAC-${Date.now().toString().slice(-6)}`,
            invoice_date: today,
            emitter: "Mon Club",
            recipient: order.user_name,
            description: `${order.offer_name} (${order.offer_code})`,
            amount: (order.price_cents / 100).toFixed(2),
            notes: "",
        });
    };

    const downloadInvoice = async () => {
        if (!invoiceOrder) return;
        try {
            await api.updateAdminOrder(invoiceOrder.id, {
                invoice_number: invoiceData.invoice_number
            });
            fetchData();
        } catch (err) {
            console.error("Error saving invoice info:", err);
        }

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
<h1>FACTURE</h1>
<div class="info"><div><strong>Émetteur</strong><br>${invoiceData.emitter}</div>
<div style="text-align:right"><strong>N° :</strong> ${invoiceData.invoice_number}<br><strong>Date :</strong> ${invoiceData.invoice_date}</div></div>
<div><strong>Destinataire :</strong> ${invoiceData.recipient}</div>
<table><thead><tr><th>Description</th><th>Période</th><th>Montant</th></tr></thead>
<tbody><tr><td>${invoiceData.description}</td><td>${invoiceOrder?.start_date} → ${invoiceOrder?.end_date || "Illimité"}</td><td>${invoiceData.amount} €</td></tr></tbody></table>
<div class="total">Total : ${invoiceData.amount} €</div>
${invoiceData.notes ? `<div class="notes"><strong>Notes :</strong><br>${invoiceData.notes}</div>` : ""}
<div style="margin-top:50px;text-align:center;font-size:0.8em;color:#999">Document généré le ${new Date().toLocaleDateString("fr-FR")}</div>
</body></html>`;
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `facture_${invoiceData.invoice_number}.html`;
        a.click();
        URL.revokeObjectURL(url);
        setInvoiceOrder(null);
    };

    // Installments
    const openInstallments = async (order: OrderItem) => {
        setInstallmentsOrder(order);
        setLoadingInstallments(true);
        try {
            const data = await api.getInstallments(order.id);
            setInstallments(data);
        } catch (err) {
            console.error("Error loading installments:", err);
            setInstallments([]);
        } finally {
            setLoadingInstallments(false);
        }
    };

    const handleMarkError = async (installmentId: string) => {
        if (!installmentsOrder) return;
        try {
            await api.markInstallmentError(installmentsOrder.id, installmentId);

            // Refresh data
            const [instData, ordersData] = await Promise.all([
                api.getInstallments(installmentsOrder.id),
                api.getAdminOrders()
            ]);

            setInstallments(instData);
            setOrders(ordersData);

            // Update the current modal order to refresh totals
            const updatedOrder = ordersData.find(o => o.id === installmentsOrder.id);
            if (updatedOrder) setInstallmentsOrder(updatedOrder);

            setMessage({ type: "success", text: "Échéance marquée en erreur." });
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors du signalement." });
        }
    };

    const handleResolve = async (installmentId: string) => {
        if (!installmentsOrder) return;
        try {
            await api.resolveInstallment(installmentsOrder.id, installmentId);

            // Refresh data
            const [instData, ordersData] = await Promise.all([
                api.getInstallments(installmentsOrder.id),
                api.getAdminOrders()
            ]);

            setInstallments(instData);
            setOrders(ordersData);

            // Update the current modal order to refresh totals
            const updatedOrder = ordersData.find(o => o.id === installmentsOrder.id);
            if (updatedOrder) setInstallmentsOrder(updatedOrder);

            setMessage({ type: "success", text: "Échéance régularisée." });
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la régularisation." });
        }
    };

    const handlePayInstallment = async (installmentId: string) => {
        if (!installmentsOrder) return;
        try {
            await api.payInstallment(installmentsOrder.id, installmentId);

            // Refresh data
            const [instData, ordersData] = await Promise.all([
                api.getInstallments(installmentsOrder.id),
                api.getAdminOrders()
            ]);

            setInstallments(instData);
            setOrders(ordersData);

            // Update the current modal order to refresh totals
            const updatedOrder = ordersData.find(o => o.id === installmentsOrder.id);
            if (updatedOrder) setInstallmentsOrder(updatedOrder);

            setMessage({ type: "success", text: "Échéance marquée comme payée." });
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors du marquage comme payé." });
        }
    };

    const handleResetInstallment = async (installmentId: string) => {
        if (!installmentsOrder) return;
        try {
            await api.resetInstallment(installmentsOrder.id, installmentId);

            // Refresh data
            const [instData, ordersData] = await Promise.all([
                api.getInstallments(installmentsOrder.id),
                api.getAdminOrders()
            ]);

            setInstallments(instData);
            setOrders(ordersData);

            // Update the current modal order to refresh totals
            const updatedOrder = ordersData.find(o => o.id === installmentsOrder.id);
            if (updatedOrder) setInstallmentsOrder(updatedOrder);

            setMessage({ type: "success", text: "Échéance remise à l'état initial." });
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la remise à zéro." });
        }
    };

    // Suspend user
    const handleSuspend = async (userId: string) => {
        try {
            const result = await api.toggleSuspendUser(userId);
            setMessage({ type: "success", text: result.is_suspended ? "Crédits suspendus." : "Crédits réactivés." });
            // Refresh orders to update icons and indicators
            const updatedOrders = await api.getAdminOrders();
            setOrders(updatedOrders);
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la suspension." });
        }
    };

    // Filtering
    const filteredOrders = orders.filter((o) => {
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            if (!o.user_name.toLowerCase().includes(q) && !o.offer_code.toLowerCase().includes(q) && !o.offer_name.toLowerCase().includes(q)) return false;
        }
        if (filterStatuses.length > 0 && !filterStatuses.includes(o.status)) return false;
        if (filterPayments.length > 0 && !filterPayments.includes(o.payment_status)) return false;
        if (filterExpiry) {
            const days = daysUntil(o.end_date);
            if (o.is_validity_unlimited) return false;
            if (filterExpiry === "7" && (days === null || days > 7)) return false;
            if (filterExpiry === "30" && (days === null || days > 30)) return false;
        }
        if (exportFrom && o.start_date < exportFrom) return false;
        if (exportTo && o.end_date && o.end_date > exportTo) return false;
        return true;
    });

    const handleExport = () => {
        const BOM = "\uFEFF";
        const header = "Date création;Nom;Offre;Date début;Date fin;Tarif (€);Crédits;Solde;Paiement;Statut;Commentaire;Créé par admin";
        const rows = filteredOrders.map((o) => [
            new Date(o.created_at).toLocaleDateString("fr-FR"),
            o.user_name,
            o.offer_code,
            new Date(o.start_date).toLocaleDateString("fr-FR"),
            o.end_date ? o.end_date.split('-').reverse().join('/') : "Illimité",
            (o.price_cents / 100).toFixed(2).replace('.', ','),
            o.is_unlimited ? "∞" : o.credits_total,
            o.is_unlimited ? "∞" : formatCredits(o.balance),
            PAYMENT_LABELS[o.payment_status],
            STATUS_LABELS[o.status] || o.status,
            (o.comment || "").replace(/[\n;]/g, " "),
            o.created_by_admin ? "Oui" : "Non",
        ].join(";"));
        const csv = BOM + header + "\n" + rows.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `commandes_${exportFrom || "debut"}_${exportTo || "fin"}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">🛍️ Gestion des commandes</h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Suivi des commandes et paiements</p>
                        </div>
                        <button
                            onClick={() => { setShowCreate(true); setShowErrors(false); loadFormOptions(); }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-sm text-sm"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Nouvelle commande
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
                            <div className="flex-1 min-w-[180px]">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input type="text" placeholder="Nom, code offre..."
                                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <MultiSelect
                                    label="Statut(s)"
                                    options={dynamicStatuses
                                        .filter(s => s !== "en_cours")
                                        .map(s => ({ id: s, label: STATUS_LABELS[s] || s }))}
                                    selected={filterStatuses}
                                    onChange={setFilterStatuses}
                                    placeholder="Tous"
                                />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <MultiSelect
                                    label="Paiement(s)"
                                    options={[
                                        { id: "a_valider", label: "À valider" },
                                        { id: "en_attente", label: "En attente" },
                                        { id: "echelonne", label: "Échelonné" },
                                        { id: "paye", label: "Payé" },
                                        { id: "a_regulariser", label: "À régulariser" },
                                        { id: "rembourse", label: "Remboursé" },
                                    ]}
                                    selected={filterPayments}
                                    onChange={setFilterPayments}
                                    placeholder="Tous"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">⏰ Échéance</label>
                                <select value={filterExpiry} onChange={(e) => setFilterExpiry(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                                    <option value="">Toutes</option>
                                    <option value="7">{"< 7 jours"}</option>
                                    <option value="30">{"< 30 jours"}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Du</label>
                                <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Au</label>
                                <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <button onClick={handleExport}
                                className="px-3 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg font-medium hover:bg-emerald-100 transition-colors text-sm whitespace-nowrap shadow-sm">
                                📥 Export Excel
                            </button>
                        </div>
                        {(searchTerm || filterStatuses.length > 0 || filterPayments.length > 0 || filterExpiry || exportFrom || exportTo) && (
                            <div className="mt-2 text-xs text-slate-500">
                                {filteredOrders.length} commande{filteredOrders.length > 1 ? "s" : ""} affichée{filteredOrders.length > 1 ? "s" : ""}
                            </div>
                        )}
                    </div>

                    {/* Bulk Actions Bar */}
                    {selectedOrderIds.size > 0 && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center gap-3">
                                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-md">{selectedOrderIds.size}</span>
                                <span className="text-sm font-medium text-blue-900">commande(s) sélectionnée(s)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={handleBulkEmail} className="px-3 py-1.5 bg-white text-blue-600 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors shadow-sm flex items-center gap-2">
                                    📧 Envoyer un email
                                </button>
                                <button onClick={handleBulkSuspend} className="px-3 py-1.5 bg-white text-orange-600 border border-orange-200 rounded-lg text-sm font-medium hover:bg-orange-50 transition-colors shadow-sm flex items-center gap-2">
                                    🚫 Suspendre/réactiver les crédits
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Orders Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-3 text-left w-10">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length}
                                                onChange={() => toggleAll(filteredOrders)}
                                            />
                                        </th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest hidden md:table-cell">date</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">nom</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">offre</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest hidden lg:table-cell">début</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest hidden lg:table-cell">fin</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest hidden sm:table-cell">tarif</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest hidden xl:table-cell">crédits</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest hidden sm:table-cell">solde</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">paiement</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest hidden md:table-cell">statut</th>
                                        <th className="px-3 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredOrders.map((order) => {
                                        const paymentColors: Record<string, string> = {
                                            a_valider: "bg-yellow-100 text-yellow-800",
                                            en_attente: "bg-orange-100 text-orange-800",
                                            paye: "bg-green-100 text-green-800",
                                            rembourse: "bg-gray-100 text-gray-600",
                                            echelonne: "bg-blue-100 text-blue-800",
                                            a_regulariser: "bg-red-100 text-red-800",
                                        };
                                        const statusColors: Record<string, string> = {
                                            active: "bg-emerald-50 text-emerald-600 border border-emerald-100",
                                            termine: "bg-slate-100 text-slate-600 border border-slate-200",
                                            expiree: "bg-orange-50 text-orange-600 border border-orange-100",
                                            en_pause: "bg-amber-50 text-amber-600 border border-amber-100",
                                            resiliee: "bg-red-50 text-red-500 border border-red-100",
                                        };
                                        const days = daysUntil(order.end_date);
                                        const expiryWarning = !order.is_validity_unlimited && days !== null && days <= 30;
                                        const expiryCritical = !order.is_validity_unlimited && days !== null && days <= 7;
                                        return (
                                            <tr key={order.id} className="hover:bg-gray-50">
                                                <td className="px-3 py-3 w-10">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        checked={selectedOrderIds.has(order.id)}
                                                        onChange={() => toggleSelection(order.id)}
                                                    />
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-700 hidden md:table-cell">
                                                    {order.created_at ? new Date(order.created_at).toLocaleDateString("fr-FR") : "—"}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-sm">
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-medium text-slate-900">
                                                            {order.user_name}
                                                        </span>
                                                        {order.created_by_admin && (
                                                            <span title="Créé par le manager" className="text-amber-500">🛡️</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm font-medium text-slate-900">{order.offer_code}</span>
                                                        {order.comment && order.comment.trim().length > 0 && (
                                                            <span title={`Commentaire interne : ${order.comment}`} className="text-blue-400 cursor-help">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                                </svg>
                                                            </span>
                                                        )}
                                                        {order.user_note && order.user_note.trim().length > 0 && (
                                                            <span title={`Note à l'utilisateur : ${order.user_note}`} className="text-slate-400 cursor-help">
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                                </svg>
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-700 hidden lg:table-cell">
                                                    {new Date(order.start_date).toLocaleDateString("fr-FR")}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-sm hidden lg:table-cell">
                                                    {order.is_validity_unlimited ? (
                                                        <span className="font-semibold text-purple-600">♾️ Illimité</span>
                                                    ) : order.end_date ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className={expiryCritical ? "text-red-600 font-bold" : expiryWarning ? "text-orange-600 font-medium" : "text-slate-700"}>
                                                                {new Date(order.end_date).toLocaleDateString("fr-FR")}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-slate-700 hidden sm:table-cell">
                                                    {formatPrice(order)}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-700 hidden xl:table-cell">
                                                    {order.is_unlimited ? "∞" : order.credits_total}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap hidden sm:table-cell">
                                                    {order.is_unlimited ? (
                                                        <div className={`flex items-center gap-1 text-sm ${order.user_is_suspended ? "text-red-600 font-semibold" : "text-slate-700 font-medium"}`}>
                                                            <span>∞</span>
                                                            {order.user_is_suspended && <span title="Crédits suspendus">🚫</span>}
                                                        </div>
                                                    ) : (
                                                        <div className={`flex items-center gap-1 text-sm ${order.user_is_suspended ? "text-red-600 font-semibold" :
                                                                (order.balance ?? 0) <= 0 ? "text-red-600" :
                                                                    (order.balance ?? 0) <= 2 ? "text-orange-600" :
                                                                        "text-slate-700"
                                                            }`}>
                                                            <span>{formatCredits(order.balance)}</span>
                                                            {order.user_is_suspended && <span title="Crédits suspendus">🚫</span>}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-1 text-xs font-normal rounded-full ${paymentColors[order.payment_status] || "bg-gray-100 text-gray-600"}`}>
                                                            {PAYMENT_LABELS[order.payment_status] || order.payment_status}
                                                        </span>
                                                        {(order.payment_status === "echelonne" || order.payment_status === "a_regulariser") && (
                                                            <button onClick={() => openInstallments(order)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all hover:scale-105" title="Échéancier">📅</button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap hidden md:table-cell">
                                                    <span className={`px-2 py-1 text-xs font-normal rounded-full ${statusColors[order.status] || "bg-indigo-50 text-indigo-600 border border-indigo-100"}`}>
                                                        {STATUS_LABELS[order.status] || (order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : order.status)}
                                                    </span>
                                                </td>
                                                <td className="px-1 py-3 whitespace-nowrap flex items-center justify-center gap-0">
                                                    <button onClick={() => openEdit(order)} className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-all hover:scale-105" title="Modifier">✏️</button>
                                                    <button onClick={() => openInvoice(order)} className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all hover:scale-105" title="Facture">🧾</button>
                                                    <button onClick={() => setDeleteConfirmId(order.id)} className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg transition-all hover:scale-105" title="Supprimer">🗑️</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredOrders.length === 0 && (
                                        <tr>
                                            <td colSpan={12} className="px-6 py-8 text-center text-slate-500">
                                                {searchTerm || filterStatuses.length > 0 || filterPayments.length > 0 || filterExpiry ? "Aucune commande ne correspond aux filtres" : "Aucune commande pour le moment"}
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <h3 className="text-lg font-semibold text-slate-900">Nouvelle commande</h3>
                            </div>
                            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            <form id="createOrderForm" onSubmit={handleCreate} className="space-y-8">
                                {/* Informations client */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && !createForm.user_id) ? 'text-red-500' : 'text-slate-700'}`}>Utilisateur *</label>
                                        <select value={createForm.user_id} onChange={(e) => setCreateForm({ ...createForm, user_id: e.target.value })}
                                            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all ${(showErrors && !createForm.user_id) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                            <option value="">Sélectionner un client...</option>
                                            {users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && !createForm.offer_id) ? 'text-red-500' : 'text-slate-700'}`}>Offre *</label>
                                        <select value={createForm.offer_id} onChange={(e) => setCreateForm({ ...createForm, offer_id: e.target.value })}
                                            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all ${(showErrors && !createForm.offer_id) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                            <option value="">Sélectionner une offre...</option>
                                            {offers.map((o) => <option key={o.id} value={o.id}>{o.offer_code} — {o.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Paramètres */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && !createForm.start_date) ? 'text-red-500' : 'text-slate-700'}`}>Date de début *</label>
                                        <input type="date" value={createForm.start_date}
                                            onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
                                            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all ${(showErrors && !createForm.start_date) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Commentaire interne</label>
                                    <textarea value={createForm.comment}
                                        onChange={(e) => setCreateForm({ ...createForm, comment: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                        rows={2}
                                        placeholder="Notes visibles uniquement par l'administration..." />
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <label className="block text-sm font-medium text-slate-700">Note à l'utilisateur</label>
                                        <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Commentaire visible dans les commandes de l'utilisateur</span>
                                        </div>
                                    </div>
                                    <textarea value={createForm.user_note}
                                        onChange={(e) => setCreateForm({ ...createForm, user_note: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                        rows={2}
                                        placeholder="Informations utiles à l'utilisateur (remise, prolongation, etc.)..." />
                                </div>
                            </form>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button type="button" onClick={() => setShowCreate(false)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">
                                Annuler
                            </button>
                            <button type="submit" form="createOrderForm" disabled={saving}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50 transition-all text-sm shadow-sm flex items-center gap-2">
                                {saving && <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                                {saving ? "Création..." : "Créer la commande"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editOrder && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                <h3 className="text-lg font-semibold text-slate-900">Modifier la commande</h3>
                            </div>
                            <button onClick={() => setEditOrder(null)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            <form id="editOrderForm" onSubmit={handleEditSubmit} className="space-y-8">
                                {/* Période & Statuts */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Date de début</label>
                                        <input type="date" value={editForm.start_date}
                                            onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Date de fin</label>
                                        <input type="date" value={editForm.end_date}
                                            onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all enabled:hover:border-gray-300 disabled:bg-gray-50 disabled:text-slate-400"
                                            disabled={editOrder.is_validity_unlimited} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Paiement</label>
                                        <select value={editForm.payment_status}
                                            onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all hover:border-gray-300">
                                            <option value="a_valider">À valider</option>
                                            <option value="en_attente">En attente</option>
                                            <option value="echelonne">Échelonné</option>
                                            <option value="paye">Payé</option>
                                            <option value="a_regulariser">À régulariser</option>
                                            <option value="rembourse">Remboursé</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                                        <div className="space-y-2">
                                            <select
                                                value={showCustomStatus ? "_custom" : (editForm.status || "active")}
                                                onChange={(e) => {
                                                    if (e.target.value === "_custom") {
                                                        setShowCustomStatus(true);
                                                        setEditForm({ ...editForm, status: "" });
                                                    } else {
                                                        setShowCustomStatus(false);
                                                        setEditForm({ ...editForm, status: e.target.value });
                                                    }
                                                }}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all hover:border-gray-300"
                                            >
                                                <option value="active">Active</option>
                                                <option value="termine">Terminée</option>
                                                <option value="expiree">Expirée</option>
                                                <option value="en_pause">En pause</option>
                                                <option value="resiliee">Résiliée</option>
                                                {dynamicStatuses.filter(s => !["active", "termine", "expiree", "en_pause", "resiliee", "Terminé", "terminé", "Résiliée", "Résilié"].includes(s)).map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                                <option value="_custom">+ Autre (saisie libre)...</option>
                                            </select>

                                            {showCustomStatus && (
                                                <input
                                                    type="text"
                                                    value={editForm.status}
                                                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                                    className="w-full px-4 py-2.5 border border-blue-100 bg-blue-50 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none animate-in slide-in-from-top-1 duration-200"
                                                    placeholder="Statut personnalisé..."
                                                    autoFocus
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Financier & Crédits */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Tarif (€)</label>
                                        <input type="number" step="0.01" value={editForm.price_cents}
                                            onChange={(e) => setEditForm({ ...editForm, price_cents: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de crédits</label>
                                            <input type="number" disabled={editForm.is_unlimited} value={editForm.credits_total}
                                                onChange={(e) => setEditForm({ ...editForm, credits_total: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all enabled:hover:border-gray-300 disabled:bg-gray-50 disabled:text-slate-400" />
                                        </div>
                                        <div className="pt-6">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={editForm.is_unlimited}
                                                    onChange={(e) => setEditForm({ ...editForm, is_unlimited: e.target.checked, credits_total: e.target.checked ? "" : editForm.credits_total })}
                                                    className="w-5 h-5 text-slate-900 border-gray-300 rounded-lg focus:ring-slate-500" />
                                                <span className="text-lg font-medium text-slate-700 group-hover:text-slate-900 transition-colors">∞</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Commentaire interne</label>
                                    <textarea value={editForm.comment}
                                        onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                        rows={2}
                                        placeholder="Notes visibles uniquement par l'administration..." />
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <label className="block text-sm font-medium text-slate-700">Note à l'utilisateur</label>
                                        <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Commentaire visible dans les commandes de l'utilisateur</span>
                                        </div>
                                    </div>
                                    <textarea value={editForm.user_note}
                                        onChange={(e) => setEditForm({ ...editForm, user_note: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                        rows={2}
                                        placeholder="Informations utiles à l'utilisateur (remise, prolongation, etc.)..." />
                                </div>
                            </form>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button type="button" onClick={() => setEditOrder(null)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">
                                Annuler
                            </button>
                            <button type="submit" form="editOrderForm"
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm">
                                Enregistrer les modifications
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2">Confirmer la suppression</h3>
                            <p className="text-slate-500 text-base leading-relaxed">Cette commande sera définitivement supprimée. Les crédits associés seront retirés du compte client.</p>
                            <div className="flex gap-3 justify-end items-center mt-8">
                                <button onClick={() => setDeleteConfirmId(null)}
                                    className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">
                                    Annuler
                                </button>
                                <button onClick={() => handleDelete(deleteConfirmId)}
                                    className="px-6 py-2.5 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition-all text-sm shadow-sm">
                                    Supprimer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Suspend Confirmation */}
            {showSuspendConfirm && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2">Confirmer la suspension/réactivation</h3>
                            <p className="text-slate-500 text-base leading-relaxed">
                                Vous allez suspendre ou réactiver les crédits de <strong>{selectedOrderIds.size}</strong> commande(s).
                                Les utilisateurs concernés ne pourront plus utiliser leurs crédits tant qu'ils sont suspendus.
                            </p>
                            <div className="flex gap-3 justify-end items-center mt-8">
                                <button onClick={() => setShowSuspendConfirm(false)}
                                    className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">
                                    Annuler
                                </button>
                                <button onClick={confirmBulkSuspend}
                                    className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-all text-sm shadow-sm">
                                    Confirmer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Invoice Modal */}
            {invoiceOrder && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <h3 className="text-lg font-semibold text-slate-900">Générer une facture</h3>
                            </div>
                            <button onClick={() => setInvoiceOrder(null)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            <div className="space-y-8">
                                {/* Parties */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b pb-1">Émetteur & Destinataire</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Émetteur</label>
                                            <input type="text" value={invoiceData.emitter}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, emitter: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Destinataire</label>
                                            <input type="text" value={invoiceData.recipient}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, recipient: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                        </div>
                                    </div>
                                </div>

                                {/* Détails facture */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b pb-1">Détails de la facture</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">N° Facture</label>
                                            <input type="text" value={invoiceData.invoice_number}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, invoice_number: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                                            <input type="date" value={invoiceData.invoice_date}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, invoice_date: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                            <input type="text" value={invoiceData.description}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, description: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Montant (€)</label>
                                            <input type="text" value={invoiceData.amount}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, amount: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes complémentaires</label>
                                        <textarea value={invoiceData.notes}
                                            onChange={(e) => setInvoiceData({ ...invoiceData, notes: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                            rows={2} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button onClick={() => setInvoiceOrder(null)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">
                                Annuler
                            </button>
                            <button onClick={downloadInvoice}
                                className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all text-sm shadow-sm flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Générer & Télécharger
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Installments Modal */}
            {installmentsOrder && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900 leading-tight">Échéancier de paiement</h3>
                                    <p className="text-sm text-slate-500 font-normal mt-0.5">
                                        {installmentsOrder.user_name} — {installmentsOrder.offer_name}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setInstallmentsOrder(null)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                                <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100">
                                    <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider mb-1">Perçu</div>
                                    <div className="text-xl font-bold text-emerald-900 border-t border-emerald-100/50 pt-2">
                                        {(installmentsOrder.received_cents / 100).toFixed(2)}€
                                    </div>
                                    <p className="text-[10px] text-emerald-600 mt-1">Confirmé + J+7 automatique</p>
                                </div>
                                <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100">
                                    <div className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider mb-1">À venir</div>
                                    <div className="text-xl font-bold text-blue-900 border-t border-blue-100/50 pt-2">
                                        {(installmentsOrder.pending_cents / 100).toFixed(2)}€
                                    </div>
                                    <p className="text-[10px] text-blue-600 mt-1">Échéances futures / en cours</p>
                                </div>
                                <div className="bg-rose-50/50 rounded-2xl p-4 border border-rose-100">
                                    <div className="text-[10px] text-rose-600 font-semibold uppercase tracking-wider mb-1">Impayés</div>
                                    <div className="text-xl font-bold text-rose-900 border-t border-rose-100/50 pt-2">
                                        {(installmentsOrder.error_cents / 100).toFixed(2)}€
                                    </div>
                                    <p className="text-[10px] text-rose-600 mt-1">Erreurs & rejets signalés</p>
                                </div>
                            </div>

                            {loadingInstallments ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                                    <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    <span className="text-sm">Chargement de l'échéancier...</span>
                                </div>
                            ) : installments.length === 0 ? (
                                <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                                    <p className="text-sm text-slate-500 font-medium">Aucune échéance enregistrée pour cette commande</p>
                                </div>
                            ) : (
                                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date prévue</th>
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Montant</th>
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Statut</th>
                                                <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Signaler impayé</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {installments.map((inst) => {
                                                const dueDate = new Date(inst.due_date);
                                                const graceDate = new Date(dueDate);
                                                graceDate.setDate(dueDate.getDate() + 7);
                                                const isPastGrace = graceDate <= new Date();

                                                return (
                                                    <tr key={inst.id} className={`group transition-colors ${inst.is_error ? "bg-rose-50/30" : "hover:bg-gray-50"}`}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">
                                                            {dueDate.toLocaleDateString("fr-FR")}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                                                            {(inst.amount_cents / 100).toFixed(2)}€
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            {inst.is_error ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-tight">
                                                                    <div className="w-1 h-1 rounded-full bg-rose-500" />
                                                                    Impayé
                                                                </span>
                                                            ) : (isPastGrace || inst.is_paid) ? (
                                                                <div className="flex flex-col">
                                                                    <button
                                                                        onClick={() => handleResetInstallment(inst.id)}
                                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-tight w-fit hover:bg-emerald-100 transition-colors"
                                                                        title="Cliquer pour repasser en 'À venir'"
                                                                    >
                                                                        <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                                                        Payé
                                                                    </button>
                                                                    {inst.is_paid && (
                                                                        <span className="text-[9px] text-slate-400 mt-1 ml-1">
                                                                            Saisie manuelle {inst.resolved_at && `le ${new Date(inst.resolved_at).toLocaleDateString("fr-FR")}`}
                                                                        </span>
                                                                    )}
                                                                    {!inst.is_paid && isPastGrace && (
                                                                        <span className="text-[9px] text-slate-400 mt-1 ml-1">Auto J+7</span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handlePayInstallment(inst.id)}
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-tight hover:bg-blue-100 transition-colors"
                                                                    title="Cliquer pour forcer le paiement manuel"
                                                                >
                                                                    <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                                                                    À venir
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                                            <input
                                                                type="checkbox"
                                                                checked={inst.is_error}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        handleMarkError(inst.id);
                                                                    } else {
                                                                        handleResolve(inst.id);
                                                                    }
                                                                }}
                                                                className="w-4 h-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                                                title={inst.is_error ? "Décocher pour régulariser" : "Cocher pour signaler un impayé"}
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end sticky bottom-0 z-10">
                            <button onClick={() => setInstallmentsOrder(null)}
                                className="px-6 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm shadow-sm">
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}


        </div>
    );
}
