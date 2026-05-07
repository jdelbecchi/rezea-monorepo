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
    const [tenant, setTenant] = useState<Tenant | null>(null);
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
        featured_pricing: "lump_sum" as "lump_sum" | "recurring",
        price_recurring_cents: "",
        recurring_count: "",
        period: "",
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
        invoice_number: "", 
        invoice_date: "", 
        emitter: "", 
        recipient: "", 
        description: "", 
        amount_ht: "", 
        amount_ttc: "", 
        notes: "",
        is_acquitted: true,
        vat_mention: ""
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
            const [ordersData, statusesData, tenantData] = await Promise.all([
                api.getAdminOrders(),
                api.getAdminOrderStatuses(),
                api.getTenantSettings()
            ]);
            setOrders(ordersData);
            setDynamicStatuses(statusesData);
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
            featured_pricing: order.offer_featured_pricing || "lump_sum",
            price_recurring_cents: order.offer_price_recurring_cents ? (order.offer_price_recurring_cents / 100).toString() : (order.price_cents / 100).toString(),
            recurring_count: order.offer_recurring_count?.toString() || "1",
            period: order.offer_period || "/mois",
            credits_total: order.credits_total?.toString() || "",
            is_unlimited: order.is_unlimited,
            status: order.status,
            payment_status: order.payment_status,
            comment: order.comment || "",
            user_note: order.user_note || "",
        });
        const isStd = order.status === "active" || order.status === "termine" || order.status === "" || !order.status;
        setShowCustomStatus(!isStd);
        setShowErrors(false);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editOrder) return;

        // Validation
        const isLumpSum = editForm.featured_pricing === "lump_sum";
        const hasPrice = isLumpSum ? !!editForm.price_cents : (!!editForm.price_recurring_cents && !!editForm.recurring_count && !!editForm.period);
        const hasEndDate = editOrder.is_validity_unlimited || !!editForm.end_date;
        const hasCredits = editForm.is_unlimited || !!editForm.credits_total;

        if (!editForm.start_date || !hasEndDate || !hasPrice || !hasCredits || !editForm.status || !editForm.payment_status) {
            setShowErrors(true);
            return;
        }

        setSaving(true);
        try {
            const payload: any = {
                start_date: editForm.start_date,
                end_date: editForm.end_date || null,
                price_cents: isLumpSum ? Math.round(parseFloat(editForm.price_cents.replace(',', '.')) * 100) : Math.round(parseFloat(editForm.price_recurring_cents.replace(',', '.')) * 100),
                featured_pricing: editForm.featured_pricing,
                price_recurring_cents: !isLumpSum ? Math.round(parseFloat(editForm.price_recurring_cents.replace(',', '.')) * 100) : null,
                recurring_count: !isLumpSum ? parseInt(editForm.recurring_count) : null,
                period: !isLumpSum ? editForm.period : null,
                credits_total: editForm.is_unlimited ? null : parseInt(editForm.credits_total),
                is_unlimited: editForm.is_unlimited,
                status: editForm.status,
                payment_status: editForm.payment_status,
                comment: editForm.comment,
                user_note: editForm.user_note
            };

            await api.updateAdminOrder(editOrder.id, payload);
            setEditOrder(null);
            setMessage({ type: "success", text: "Commande modifiée avec succès !" });
            fetchData();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la modification." });
        } finally {
            setSaving(false);
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
        
        // Build recipient address string
        let recipientStr = order.user_name;
        const addrParts = [];
        if (order.user_street) addrParts.push(order.user_street);
        if (order.user_zip_code || order.user_city) {
            addrParts.push(`${order.user_zip_code || ""} ${order.user_city || ""}`.trim());
        }
        if (addrParts.length > 0) {
            recipientStr += "\n" + addrParts.join("\n");
        }

        setInvoiceData({
            invoice_number: `FAC-${Date.now().toString().slice(-6)}`,
            invoice_date: today,
            emitter: tenant?.legal_name || tenant?.name || "Mon Club",
            recipient: recipientStr,
            description: `${order.offer_name} (${order.offer_code})`,
            amount_ht: "",
            amount_ttc: (order.price_cents / 100).toFixed(2),
            notes: "",
            is_acquitted: true
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

        const emitterName = invoiceData.emitter;
        const legalForm = tenant?.legal_form || "";
        const emitterAddress = tenant?.legal_address || "";
        const siret = tenant?.legal_siret ? `SIRET : ${tenant.legal_siret}` : "";
        const vatNumber = tenant?.legal_vat_number ? `TVA : ${tenant.legal_vat_number}` : "";
        const vatMention = tenant?.legal_vat_mention || "";

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture ${invoiceData.invoice_number}</title>
<style>
    body{font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;max-width:800px;margin:40px auto;padding:40px;color:#334155;line-height:1.5;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:60px}
    .invoice-title{font-size:32px;font-weight:700;color:#0f172a;letter-spacing:-0.025em;margin:0}
    .emitter-info{font-size:13px;color:#64748b}
    .emitter-name{font-size:16px;font-weight:700;color:#0f172a;margin-bottom:4px}
    .details{display:flex;justify-content:space-between;margin-bottom:40px;gap:40px}
    .details-box{flex:1;padding:24px;background:#f8fafc;border-radius:16px}
    .details-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.05em;margin-bottom:8px}
    .details-value{font-size:14px;font-weight:500;white-space:pre-wrap}
    table{width:100%;border-collapse:collapse;margin:40px 0}
    th{padding:12px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc}
    td{padding:16px;font-size:14px;border-bottom:1px solid #f1f5f9}
    .totals{display:flex;flex-direction:column;align-items:flex-end;gap:8px;margin-top:20px}
    .total-row{display:flex;justify-content:space-between;width:200px;font-size:14px}
    .total-main{font-size:20px;font-weight:700;color:#0f172a;border-top:2px solid #e2e8f0;padding-top:12px;margin-top:8px}
    .vat-mention-inline{font-size:11px;color:#64748b;margin-bottom:4px;text-align:right}
    .acquitted-stamp{display:${invoiceData.is_acquitted ? "inline-block" : "none"};margin-top:12px;padding:6px 12px;border:2px solid #10b981;color:#10b981;font-size:14px;font-weight:700;text-transform:uppercase;transform:rotate(-5deg);border-radius:8px;opacity:0.9;background:rgba(255,255,255,0.8)}
    .notes{margin-top:40px;padding:20px;background:#fffaf0;border:1px solid #feebc8;border-radius:12px;font-size:13px}
    .footer{margin-top:80px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;font-size:11px;color:#94a3b8}
    @media print{body{margin:0;padding:20px}.acquitted-stamp{opacity:1}}
</style></head><body>
    <div class="header">
        <div>
            <h1 class="invoice-title">FACTURE</h1>
            <div style="margin-top:8px;font-size:14px;font-weight:600;color:#64748b">N° ${invoiceData.invoice_number}</div>
        </div>
        <div class="emitter-info" style="text-align:right">
            <div class="emitter-name">${emitterName}</div>
            ${legalForm ? `<div>${legalForm}</div>` : ""}
            ${emitterAddress ? `<div style="white-space:pre-wrap">${emitterAddress}</div>` : ""}
            <div>${siret}</div>
            ${vatNumber ? `<div>${vatNumber}</div>` : ""}
        </div>
    </div>

    <div class="details">
        <div class="details-box">
            <div class="details-label">Destinataire</div>
            <div class="details-value">${invoiceData.recipient}</div>
        </div>
        <div class="details-box" style="max-width:200px">
            <div class="details-label">Date d'émission</div>
            <div class="details-value">${new Date(invoiceData.invoice_date).toLocaleDateString("fr-FR")}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width:60%">Description</th>
                <th style="text-align:right">Total HT</th>
                <th style="text-align:right">Total TTC</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <div style="font-weight:600;color:#0f172a">${invoiceData.description}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:4px">Période : ${invoiceOrder?.start_date} au ${invoiceOrder?.end_date || "Illimité"}</div>
                </td>
                <td style="text-align:right">${invoiceData.amount_ht ? invoiceData.amount_ht + " €" : "-"}</td>
                <td style="text-align:right;font-weight:700;color:#0f172a">${invoiceData.amount_ttc} €</td>
            </tr>
        </tbody>
    </table>

    <div class="totals">
        ${invoiceData.amount_ht ? `<div class="total-row"><span>Total HT</span><span>${invoiceData.amount_ht} €</span></div>` : ""}
        <div class="total-row total-main"><span>Total TTC</span><span>${invoiceData.amount_ttc} €</span></div>
        <div class="acquitted-stamp">Acquittée le ${new Date(invoiceData.invoice_date).toLocaleDateString("fr-FR")}</div>
    </div>

    ${invoiceData.notes ? `<div class="notes"><strong>Notes complémentaires :</strong><br>${invoiceData.notes}</div>` : ""}

    <div class="footer">
        <div>${emitterName} ${legalForm ? " - " + legalForm : ""}</div>
        <div>${emitterAddress.replace(/\n/g, ", ")}</div>
        ${vatMention ? `<div style="margin-top:8px;font-style:italic;font-size:11px;opacity:0.9">${vatMention}</div>` : ""}
        <div style="margin-top:12px;opacity:0.6">Document généré par Rezea</div>
    </div>
</body></html>`;

        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        
        // Open in new tab for preview/printing
        const win = window.open("", "_blank");
        if (win) {
            win.document.write(html);
            win.document.close();
        }

        // Also trigger download
        const a = document.createElement("a");
        a.href = url;
        a.download = `facture_${invoiceData.invoice_number}.html`;
        a.click();
        
        // Revoke after a short delay to ensure download started
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
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
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
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
                                <thead className="bg-slate-100 border-b border-slate-200">
                                    <tr>
                                        <th className="px-3 py-[10px] text-left w-10 whitespace-nowrap text-xs uppercase tracking-widest">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length}
                                                onChange={() => toggleAll(filteredOrders)}
                                            />
                                        </th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden md:table-cell whitespace-nowrap">date</th>
                                        <th className="px-3 py-[10px] text-left text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">nom</th>
                                        <th className="px-3 py-[10px] text-left text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">offre</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden lg:table-cell whitespace-nowrap">début</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden lg:table-cell whitespace-nowrap">fin</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden sm:table-cell whitespace-nowrap">tarif</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden xl:table-cell whitespace-nowrap">crédits</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden sm:table-cell whitespace-nowrap">solde</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">paiement</th>
                                        <th className="w-8 py-[10px]"></th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden md:table-cell whitespace-nowrap">statut</th>
                                        <th className="px-3 py-[10px] text-right text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
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
                                            <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-3 py-2.5 w-10">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        checked={selectedOrderIds.has(order.id)}
                                                        onChange={() => toggleSelection(order.id)}
                                                    />
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700 hidden md:table-cell text-center">
                                                    {order.created_at ? new Date(order.created_at).toLocaleDateString("fr-FR") : "—"}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-sm">
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-medium text-slate-900">
                                                            {order.user_name}
                                                        </span>
                                                        {order.created_by_admin && (
                                                            <span title="Créé par le manager" className="text-amber-500">🛡️</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm font-medium text-slate-900">{order.offer_code}</span>
                                                        {order.comment && order.comment.trim().length > 0 && (
                                                            <span title={`Commentaire interne : ${order.comment}`} className="cursor-help text-sm">
                                                                📝
                                                            </span>
                                                        )}
                                                        {order.user_note && order.user_note.trim().length > 0 && (
                                                            <div title={`Note à l'utilisateur : ${order.user_note}`} className="text-slate-400 hover:text-slate-600 transition-colors cursor-help">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                                </svg>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700 hidden lg:table-cell text-center">
                                                    {new Date(order.start_date).toLocaleDateString("fr-FR")}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-sm hidden lg:table-cell text-center">
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
                                                <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 hidden sm:table-cell text-center">
                                                    {formatPrice(order)}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700 hidden xl:table-cell text-center">
                                                    {order.is_unlimited ? "∞" : order.credits_total}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap hidden sm:table-cell text-center">
                                                    {order.is_unlimited ? (
                                                        <div className={`flex items-center justify-center gap-1 text-sm ${order.user_is_suspended ? "text-red-600 font-semibold" : "text-slate-700 font-medium"}`}>
                                                            <span>∞</span>
                                                            {order.user_is_suspended && <span title="Crédits suspendus">🚫</span>}
                                                        </div>
                                                    ) : (
                                                        <div className={`flex items-center justify-center gap-1 text-sm ${order.user_is_suspended ? "text-red-600 font-semibold" :
                                                                (order.balance ?? 0) <= 0 ? "text-red-600" :
                                                                    (order.balance ?? 0) <= 2 ? "text-orange-600" :
                                                                        "text-slate-700"
                                                            }`}>
                                                            <span>{formatCredits(order.balance)}</span>
                                                            {order.user_is_suspended && <span title="Crédits suspendus">🚫</span>}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                                    <span className={`px-2 py-1 text-xs font-normal rounded-full border whitespace-nowrap ${paymentColors[order.payment_status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                                        {PAYMENT_LABELS[order.payment_status] || order.payment_status}
                                                    </span>
                                                </td>
                                                <td className="w-8 py-2.5 text-left">
                                                    {(order.payment_status === "echelonne" || order.payment_status === "a_regulariser") && (
                                                        <button onClick={() => openInstallments(order)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all hover:scale-105" title="Échéancier">📅</button>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap hidden md:table-cell text-center">
                                                    <span className={`px-2 py-1 text-xs font-normal rounded-full ${statusColors[order.status] || "bg-indigo-50 text-indigo-600 border border-indigo-100"}`}>
                                                        {STATUS_LABELS[order.status] || (order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : order.status)}
                                                    </span>
                                                </td>
                                                <td className="px-1 py-2.5 whitespace-nowrap flex items-center justify-end gap-0.5">
                                                    <button onClick={() => openEdit(order)} className="p-1 hover:bg-blue-50 text-blue-500 rounded-lg transition-all hover:scale-110" title="Modifier">✏️</button>
                                                    <div className="relative">
                                                        <button onClick={() => openInvoice(order)} className="p-1 hover:bg-slate-100 text-slate-500 rounded-lg transition-all hover:scale-110" title="Facture">🧾</button>
                                                        {order.invoice_number && (
                                                            <div className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full border-2 border-white shadow-sm pointer-events-none animate-in fade-in zoom-in duration-300"></div>
                                                        )}
                                                    </div>
                                                    <button onClick={() => setDeleteConfirmId(order.id)} className="p-1 hover:bg-rose-50 text-rose-500 rounded-lg transition-all hover:scale-110" title="Supprimer">🗑️</button>
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
                                <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">Nouvelle commande</h3>
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

                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
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
                                <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Modifier la commande</h3>
                            </div>
                            <button onClick={() => setEditOrder(null)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            <form id="editOrderForm" onSubmit={handleEditSubmit} className="space-y-8">
                                {/* Période */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && !editForm.start_date) ? 'text-red-500' : 'text-slate-700'}`}>Date de début *</label>
                                        <input type="date" value={editForm.start_date}
                                            onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                                            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all ${(showErrors && !editForm.start_date) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`} />
                                    </div>
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && !editForm.end_date && !editOrder.is_validity_unlimited) ? 'text-red-500' : 'text-slate-700'}`}>Date de fin {editOrder.is_validity_unlimited ? '' : '*'}</label>
                                        <input type="date" value={editForm.end_date}
                                            onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                                            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all enabled:hover:border-gray-300 disabled:bg-gray-50 disabled:text-slate-400 ${(showErrors && !editForm.end_date && !editOrder.is_validity_unlimited) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                            disabled={editOrder.is_validity_unlimited} />
                                    </div>
                                </div>

                                {/* Statuts & Paiement */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && !editForm.status) ? 'text-red-500' : 'text-slate-700'}`}>Statut *</label>
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
                                                className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all ${(showErrors && !editForm.status) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
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
                                                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none animate-in slide-in-from-top-1 duration-200 ${(showErrors && !editForm.status) ? 'border-red-300 bg-red-50' : 'border-blue-100 bg-blue-50'}`}
                                                    placeholder="Statut personnalisé..."
                                                    autoFocus
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && !editForm.payment_status) ? 'text-red-500' : 'text-slate-700'}`}>Paiement *</label>
                                        <select value={editForm.payment_status}
                                            onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value })}
                                            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all ${(showErrors && !editForm.payment_status) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                            <option value="a_valider">À valider</option>
                                            <option value="en_attente">En attente</option>
                                            <option value="echelonne">Échelonné</option>
                                            <option value="paye">Payé</option>
                                            <option value="a_regulariser">À régulariser</option>
                                            <option value="rembourse">Remboursé</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Tarification */}
                                <div className="space-y-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className={`text-[11px] font-semibold uppercase tracking-wider ${(showErrors && !((editForm.featured_pricing === 'lump_sum' && editForm.price_cents) || (editForm.featured_pricing === 'recurring' && editForm.price_recurring_cents && editForm.recurring_count && editForm.period))) ? 'text-red-500' : 'text-slate-400'}`}>
                                            Tarification *
                                        </label>
                                        <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
                                            <button
                                                type="button"
                                                onClick={() => setEditForm({ ...editForm, featured_pricing: "lump_sum" })}
                                                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${editForm.featured_pricing === "lump_sum" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-700"}`}
                                            >
                                                Unique
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditForm({ ...editForm, featured_pricing: "recurring" })}
                                                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${editForm.featured_pricing === "recurring" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-700"}`}
                                            >
                                                Échelonné
                                            </button>
                                        </div>
                                    </div>

                                    {editForm.featured_pricing === "lump_sum" ? (
                                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                            <label className="block text-xs font-medium text-slate-500 mb-1.5 ml-1">Prix unique (€)</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={editForm.price_cents}
                                                    onChange={(e) => setEditForm({ ...editForm, price_cents: e.target.value })}
                                                    className={`w-full pl-4 pr-12 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all ${showErrors && !editForm.price_cents ? "border-red-300 ring-2 ring-red-50" : "border-gray-200 hover:border-gray-300"}`}
                                                    placeholder="0.00"
                                                />
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">€</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="space-y-1.5">
                                                <label className="block text-xs font-medium text-slate-500 ml-1">Prix / échéance (€)</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={editForm.price_recurring_cents}
                                                        onChange={(e) => setEditForm({ ...editForm, price_recurring_cents: e.target.value })}
                                                        className={`w-full pl-4 pr-10 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all ${showErrors && !editForm.price_recurring_cents ? "border-red-300 ring-2 ring-red-50" : "border-gray-200 hover:border-gray-300"}`}
                                                        placeholder="0.00"
                                                    />
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</div>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="block text-xs font-medium text-slate-500 ml-1">Période</label>
                                                <select
                                                    value={editForm.period}
                                                    onChange={(e) => setEditForm({ ...editForm, period: e.target.value })}
                                                    className={`w-full px-4 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all ${showErrors && !editForm.period ? "border-red-300 ring-2 ring-red-50" : "border-gray-200 hover:border-gray-300"}`}
                                                >
                                                    <option value="/mois">/ mois</option>
                                                    <option value="/trimestre">/ trimestre</option>
                                                    <option value="/an">/ an</option>
                                                    <option value="/séance">/ séance</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="block text-xs font-medium text-slate-500 ml-1">Nb échéances</label>
                                                <input
                                                    type="number"
                                                    value={editForm.recurring_count}
                                                    onChange={(e) => setEditForm({ ...editForm, recurring_count: e.target.value })}
                                                    className={`w-full px-4 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all ${showErrors && !editForm.recurring_count ? "border-red-300 ring-2 ring-red-50" : "border-gray-200 hover:border-gray-300"}`}
                                                    placeholder="12"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Crédits */}
                                <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-32">
                                            <label className={`block text-sm font-medium mb-1 ${(showErrors && !editForm.is_unlimited && !editForm.credits_total) ? 'text-red-500' : 'text-slate-700'}`}>Crédits *</label>
                                            <input type="number" disabled={editForm.is_unlimited} value={editForm.credits_total}
                                                onChange={(e) => setEditForm({ ...editForm, credits_total: e.target.value })}
                                                className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all enabled:hover:border-gray-300 disabled:bg-gray-50 disabled:text-slate-400 ${(showErrors && !editForm.is_unlimited && !editForm.credits_total) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
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

                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 pb-8">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2 tracking-tight">Confirmer la suppression</h3>
                            <p className="text-slate-500 text-base leading-relaxed">Cette commande sera définitivement supprimée. Les crédits associés seront retirés du compte client.</p>
                        </div>
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center">
                                <button onClick={() => setDeleteConfirmId(null)}
                                    className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">
                                    Annuler
                                </button>
                                <button onClick={() => handleDelete(deleteConfirmId)}
                                    className="px-6 py-2.5 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition-all text-sm shadow-sm active:scale-95">
                                    Supprimer
                                </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Suspend Confirmation */}
            {showSuspendConfirm && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 pb-8">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2 tracking-tight">Confirmer la suspension/réactivation</h3>
                            <p className="text-slate-500 text-base leading-relaxed">
                                Vous allez suspendre ou réactiver les crédits de <strong>{selectedOrderIds.size}</strong> commande(s).
                                Les utilisateurs concernés ne pourront plus utiliser leurs crédits tant qu'ils sont suspendus.
                            </p>
                        </div>
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center">
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
            )}

            {/* Invoice Modal */}
            {invoiceOrder && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <div className="text-xl text-slate-400">🧾</div>
                                <h3 className="text-lg font-medium text-slate-900 tracking-tight">Générer une facture</h3>
                            </div>
                            <button onClick={() => setInvoiceOrder(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            <div className="space-y-10">
                                {/* Parties */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h4 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Émetteur</h4>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Nom / Raison sociale</label>
                                            <input type="text" value={invoiceData.emitter}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, emitter: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Destinataire</h4>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Identité & Adresse</label>
                                            <textarea value={invoiceData.recipient}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, recipient: e.target.value })}
                                                rows={3}
                                                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 resize-none" />
                                        </div>
                                    </div>
                                </div>

                                {/* Détails facture */}
                                <div className="space-y-6">
                                    <h4 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Contenu & Tarification</h4>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">N° Facture</label>
                                            <input type="text" value={invoiceData.invoice_number}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, invoice_number: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Date d'émission</label>
                                            <input type="date" value={invoiceData.invoice_date}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, invoice_date: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Description de la prestation</label>
                                            <input type="text" value={invoiceData.description}
                                                onChange={(e) => setInvoiceData({ ...invoiceData, description: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Montant HT <span className="text-slate-400 font-normal">(optionnel)</span></label>
                                            <div className="relative">
                                                <input type="text" value={invoiceData.amount_ht}
                                                    onChange={(e) => setInvoiceData({ ...invoiceData, amount_ht: e.target.value })}
                                                    placeholder="-"
                                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 pr-8" />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Montant TTC</label>
                                            <div className="relative">
                                                <input type="text" value={invoiceData.amount_ttc}
                                                    onChange={(e) => setInvoiceData({ ...invoiceData, amount_ttc: e.target.value })}
                                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 pr-8" />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700 text-sm">€</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 py-2">
                                        <input 
                                            type="checkbox"
                                            id="is_acquitted"
                                            checked={invoiceData.is_acquitted}
                                            onChange={(e) => setInvoiceData({ ...invoiceData, is_acquitted: e.target.checked })}
                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <label htmlFor="is_acquitted" className="text-sm font-medium text-slate-700">Apposer la mention "ACQUITTÉE"</label>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Notes</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes complémentaires</label>
                                        <textarea value={invoiceData.notes}
                                            onChange={(e) => setInvoiceData({ ...invoiceData, notes: e.target.value })}
                                            placeholder="Conditions de réglement, sommes déjà versées..."
                                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 resize-none"
                                            rows={2} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button onClick={() => setInvoiceOrder(null)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">
                                Annuler
                            </button>
                            <button onClick={downloadInvoice}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Générer la facture
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Installments Modal */}
            {installmentsOrder && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div>
                                    <h3 className="text-[17px] font-semibold text-slate-900 leading-tight tracking-tight">Échéancier de paiement</h3>
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

                        <div className="p-6 bg-white border-t border-gray-100 flex justify-end sticky bottom-0 z-10">
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
