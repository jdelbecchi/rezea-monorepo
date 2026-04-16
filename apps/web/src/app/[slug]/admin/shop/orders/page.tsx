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

function formatPrice(order: OrderItem): string {
    // Display the featured price from the offer
    if (order.offer_featured_pricing === "recurring" && order.offer_price_recurring_cents) {
        const amount = (order.offer_price_recurring_cents / 100).toFixed(2);
        const period = order.offer_period || "";
        return `${amount}€ ${period}`.trim();
    }
    if (order.offer_featured_pricing === "lump_sum" && order.offer_price_lump_sum_cents) {
        return `${(order.offer_price_lump_sum_cents / 100).toFixed(2)}€`;
    }
    return `${(order.price_cents / 100).toFixed(2)}€`;
}

export default function AdminShopOrdersPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [orders, setOrders] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
    const [createForm, setCreateForm] = useState({ user_id: "", offer_id: "", start_date: "", comment: "" });
    const [saving, setSaving] = useState(false);

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
        comment: ""
    });

    // Delete confirm
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
        setSaving(true);
        try {
            await api.createAdminOrder({
                user_id: createForm.user_id,
                offer_id: createForm.offer_id,
                start_date: createForm.start_date,
                comment: createForm.comment || undefined,
            });
            setShowCreate(false);
            setCreateForm({ user_id: "", offer_id: "", start_date: "", comment: "" });
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
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">🛍️ commandes</h1>
                            <p className="text-[11px] font-medium text-slate-400 lowercase mt-1">suivi des commandes et paiements</p>
                        </div>
                        <button
                            onClick={() => { setShowCreate(true); loadFormOptions(); }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            ➕ Nouvelle commande
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
                                className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors text-sm whitespace-nowrap">
                                📥 Export Excel
                            </button>
                        </div>
                        {(searchTerm || filterStatuses.length > 0 || filterPayments.length > 0 || filterExpiry || exportFrom || exportTo) && (
                            <div className="mt-2 text-xs text-slate-500">
                                {filteredOrders.length} commande{filteredOrders.length > 1 ? "s" : ""} affichée{filteredOrders.length > 1 ? "s" : ""}
                            </div>
                        )}
                    </div>

                    {/* Orders Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest hidden md:table-cell">date</th>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">nom</th>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">offre</th>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest hidden lg:table-cell">début</th>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest hidden lg:table-cell">fin</th>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest hidden sm:table-cell">tarif</th>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest hidden xl:table-cell">crédits</th>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest hidden sm:table-cell">solde</th>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">paiement</th>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest hidden md:table-cell">statut</th>
                                        <th className="px-3 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">actions</th>
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
                                                <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-700 hidden md:table-cell">
                                                    {order.created_at ? new Date(order.created_at).toLocaleDateString("fr-FR") : "—"}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-sm">
                                                    <div className="flex items-center gap-1">
                                                        <span className={`font-medium ${order.user_is_suspended ? "text-slate-400" : "text-slate-900"}`}>
                                                            {order.user_name}
                                                        </span>
                                                        {order.user_is_suspended && (
                                                            <span title="Crédits suspendus" className="text-red-400">🚫</span>
                                                        )}
                                                        {order.created_by_admin && (
                                                            <span title="Créé par le manager" className="text-amber-500">🛡️</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm font-medium text-slate-900">{order.offer_code}</span>
                                                        {order.comment && order.comment.trim().length > 0 && (
                                                            <span title={order.comment} className="text-blue-400 cursor-help">📝</span>
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
                                                <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-700 hidden sm:table-cell">
                                                    <div>
                                                        <span className="font-medium">{formatPrice(order)}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-700 hidden xl:table-cell">
                                                    {order.is_unlimited ? "∞" : order.credits_total}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap hidden sm:table-cell">
                                                    {order.is_unlimited ? (
                                                        <span className="px-2 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800">∞</span>
                                                    ) : (
                                                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                                                            (order.balance ?? 0) <= 0 ? "bg-red-100 text-red-800" :
                                                            (order.balance ?? 0) <= 2 ? "bg-orange-100 text-orange-800" :
                                                            "bg-green-100 text-green-800"
                                                        }`}>
                                                            {formatCredits(order.balance)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap">
                                                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${paymentColors[order.payment_status] || "bg-gray-100 text-gray-600"}`}>
                                                        {PAYMENT_LABELS[order.payment_status] || order.payment_status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap hidden md:table-cell">
                                                    <span className={`px-2 py-1 text-[10px] font-medium rounded-full lowercase tracking-tight ${statusColors[order.status] || "bg-indigo-50 text-indigo-600 border border-indigo-100"}`}>
                                                        {STATUS_LABELS[order.status] || order.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-sm space-x-1">
                                                    <button onClick={() => window.open(`mailto:${order.user_email}`, "_blank")} className="text-blue-500 hover:text-blue-700" title={`Email: ${order.user_email}`}>📧</button>
                                                    {(order.payment_status === "echelonne" || order.payment_status === "a_regulariser") && (
                                                        <button onClick={() => openInstallments(order)} className="text-indigo-500 hover:text-indigo-700" title="Échéancier">📅</button>
                                                    )}
                                                    <button onClick={() => openEdit(order)} className="text-blue-600 hover:text-blue-800 font-medium" title="Modifier">✏️</button>
                                                    <button onClick={() => openInvoice(order)} className="text-green-600 hover:text-green-800 font-medium" title="Facture">🧾</button>
                                                    {order.user_is_suspended ? (
                                                        <button onClick={() => handleSuspend(order.user_id)} className="text-slate-300 hover:text-slate-500" title="Réactiver les crédits">
                                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 inline-block align-middle"><path d="M8 5v14l11-7z" /></svg>
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => handleSuspend(order.user_id)} className="text-orange-500 hover:text-orange-700" title="Suspendre les crédits">
                                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 inline-block align-middle"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                                                        </button>
                                                    )}
                                                    <button onClick={() => setDeleteConfirmId(order.id)} className="text-red-600 hover:text-red-800 font-medium" title="Supprimer">🗑️</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredOrders.length === 0 && (
                                        <tr>
                                            <td colSpan={11} className="px-6 py-8 text-center text-slate-500">
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">➕ Nouvelle commande</h3>
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
                                <label className="block text-sm font-medium text-slate-700 mb-1">Offre *</label>
                                <select required value={createForm.offer_id} onChange={(e) => setCreateForm({ ...createForm, offer_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="">Sélectionner...</option>
                                    {offers.map((o) => <option key={o.id} value={o.id}>{o.offer_code} — {o.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Date de début *</label>
                                <input type="date" required value={createForm.start_date}
                                    onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Commentaire</label>
                                <textarea value={createForm.comment}
                                    onChange={(e) => setCreateForm({ ...createForm, comment: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" rows={2} />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => setShowCreate(false)}
                                    className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300">Annuler</button>
                                <button type="submit" disabled={saving}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                                    {saving ? "Création..." : "Créer"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editOrder && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Modifier la commande</h3>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date de début</label>
                                    <input type="date" value={editForm.start_date}
                                        onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date de fin</label>
                                    <input type="date" value={editForm.end_date}
                                        onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        disabled={editOrder.is_validity_unlimited} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tarif (€)</label>
                                    <input type="number" step="0.01" value={editForm.price_cents}
                                        onChange={(e) => setEditForm({ ...editForm, price_cents: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de crédits</label>
                                        <input type="number" disabled={editForm.is_unlimited} value={editForm.credits_total}
                                            onChange={(e) => setEditForm({ ...editForm, credits_total: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" />
                                    </div>
                                    <div className="pt-6">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={editForm.is_unlimited}
                                                onChange={(e) => setEditForm({ ...editForm, is_unlimited: e.target.checked, credits_total: e.target.checked ? "" : editForm.credits_total })}
                                                className="w-4 h-4 text-blue-600 rounded" />
                                            <span className="text-sm font-medium text-slate-700">∞</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Paiement</label>
                                    <select value={editForm.payment_status}
                                        onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
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
                                                } else {
                                                    setShowCustomStatus(false);
                                                    setEditForm({ ...editForm, status: e.target.value });
                                                }
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="active">Active</option>
                                            <option value="termine">Terminée</option>
                                            <option value="expiree">Expirée</option>
                                            <option value="en_pause">En pause</option>
                                            <option value="resiliee">Résiliée</option>
                                            {dynamicStatuses.filter(s => !["active", "termine", "expiree", "en_pause", "Terminé", "terminé"].includes(s)).map(s => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                            <option value="_custom">+ Autre (saisie libre)...</option>
                                        </select>
                                        
                                        {showCustomStatus && (
                                            <input 
                                                type="text"
                                                value={editForm.status}
                                                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                                className="w-full px-3 py-2 border border-blue-300 bg-blue-50 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                placeholder="Saisissez le nouveau statut..."
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Commentaire</label>
                                <textarea value={editForm.comment}
                                    onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" rows={2} />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => setEditOrder(null)}
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
                        <p className="text-slate-600 mb-4">Cette commande sera définitivement supprimée.</p>
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
            {invoiceOrder && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">🧾 Générer une facture</h3>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">N° Facture</label>
                                    <input type="text" value={invoiceData.invoice_number}
                                        onChange={(e) => setInvoiceData({ ...invoiceData, invoice_number: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                                    <input type="date" value={invoiceData.invoice_date}
                                        onChange={(e) => setInvoiceData({ ...invoiceData, invoice_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Émetteur</label>
                                <input type="text" value={invoiceData.emitter}
                                    onChange={(e) => setInvoiceData({ ...invoiceData, emitter: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Destinataire</label>
                                <input type="text" value={invoiceData.recipient}
                                    onChange={(e) => setInvoiceData({ ...invoiceData, recipient: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                                <input type="text" value={invoiceData.description}
                                    onChange={(e) => setInvoiceData({ ...invoiceData, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Montant (€)</label>
                                <input type="text" value={invoiceData.amount}
                                    onChange={(e) => setInvoiceData({ ...invoiceData, amount: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                                <textarea value={invoiceData.notes}
                                    onChange={(e) => setInvoiceData({ ...invoiceData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" rows={2} />
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end mt-4">
                            <button onClick={() => setInvoiceOrder(null)}
                                className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300">Annuler</button>
                            <button onClick={downloadInvoice}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">📥 Télécharger</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Installments Modal */}
            {installmentsOrder && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">📅 Échéancier</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            {installmentsOrder.user_name} — {installmentsOrder.offer_name} ({installmentsOrder.offer_code})
                        </p>

                        {/* Summary */}
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="bg-green-50 rounded-lg p-3 text-center">
                                <div className="text-[10px] text-green-600 font-medium uppercase">Perçu (Confirmé + J+7)</div>
                                <div className="text-lg font-bold text-green-900 border-t border-green-100 mt-1">
                                    {(installmentsOrder.received_cents / 100).toFixed(2)}€
                                </div>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-3 text-center">
                                <div className="text-[10px] text-blue-600 font-medium uppercase">À venir / En cours</div>
                                <div className="text-lg font-bold text-blue-900 border-t border-blue-100 mt-1">
                                    {(installmentsOrder.pending_cents / 100).toFixed(2)}€
                                </div>
                            </div>
                            <div className="bg-red-50 rounded-lg p-3 text-center">
                                <div className="text-[10px] text-red-600 font-medium uppercase">Impayés / Erreurs</div>
                                <div className="text-lg font-bold text-red-900 border-t border-red-100 mt-1">
                                    {(installmentsOrder.error_cents / 100).toFixed(2)}€
                                </div>
                            </div>
                        </div>

                        {loadingInstallments ? (
                            <div className="text-center py-4 text-slate-500">Chargement...</div>
                        ) : installments.length === 0 ? (
                            <div className="text-center py-4 text-slate-500">Aucune échéance enregistrée</div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {installments.map((inst) => {
                                        const dueDate = new Date(inst.due_date);
                                        const graceDate = new Date(dueDate);
                                        graceDate.setDate(dueDate.getDate() + 7);
                                        const isPastGrace = graceDate <= new Date();
                                        
                                        let statusBadge;
                                        if (inst.is_error) {
                                            statusBadge = <span className="px-2 py-1 text-[10px] font-bold rounded-full bg-red-100 text-red-800">❌ Impayé</span>;
                                        } else if (isPastGrace || inst.is_paid) {
                                            statusBadge = <span className="px-2 py-1 text-[10px] font-bold rounded-full bg-green-100 text-green-800">✅ Payé {inst.is_paid ? "(Manuel)" : "(Auto J+7)"}</span>;
                                        } else {
                                            statusBadge = (
                                                <span 
                                                    onClick={() => handlePayInstallment(inst.id)}
                                                    className="px-2 py-1 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200 transition-colors"
                                                    title="Marquer comme payé (manuel)"
                                                >
                                                    ⏳ À venir
                                                </span>
                                            );
                                        }

                                        return (
                                            <tr key={inst.id} className={inst.is_error ? "bg-red-50" : ""}>
                                                <td className="px-3 py-2 text-sm text-slate-700">
                                                    {dueDate.toLocaleDateString("fr-FR")}
                                                </td>
                                                <td className="px-3 py-2 text-sm font-medium text-slate-900">
                                                    {(inst.amount_cents / 100).toFixed(2)}€
                                                </td>
                                                <td className="px-3 py-2">
                                                    {statusBadge}
                                                    {inst.resolved_at && (
                                                        <div className="text-[9px] text-slate-400">
                                                            Régularisé le {new Date(inst.resolved_at).toLocaleDateString("fr-FR")}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-sm">
                                                    {inst.is_error ? (
                                                        <button onClick={() => handleResolve(inst.id)} className="text-green-600 hover:text-green-800 text-xs font-bold underline">Régulariser</button>
                                                    ) : (
                                                        <button onClick={() => handleMarkError(inst.id)} className="text-red-500 hover:text-red-700 text-xs font-medium italic">Signaler Impayé</button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}

                        <div className="flex justify-end mt-4">
                            <button onClick={() => setInstallmentsOrder(null)}
                                className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300">Fermer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
