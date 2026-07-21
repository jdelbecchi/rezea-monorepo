"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, User, OrderItem, InstallmentItem, Tenant } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import { formatCredits } from "@/lib/formatters";
import MultiSelect from "@/components/MultiSelect";
import { getSessionFilter, setSessionFilter, updateLastActivity } from "@/lib/sessionFilters";

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
        const period = order.offer_period ? (order.offer_period.startsWith('/') ? order.offer_period : `/${order.offer_period}`) : "";
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

const COLORS_PALETTE = [
    "bg-sky-100 text-sky-700 border-sky-200/60",
    "bg-amber-100 text-amber-700 border-amber-200/60",
    "bg-pink-100 text-pink-700 border-pink-200/60",
    "bg-teal-100 text-teal-700 border-teal-200/60",
    "bg-indigo-100 text-indigo-700 border-indigo-200/60",
    "bg-orange-100 text-orange-700 border-orange-200/60",
    "bg-violet-100 text-violet-700 border-violet-200/60",
    "bg-lime-100 text-lime-700 border-lime-200/60",
    "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200/60",
];

const hashStringToInt = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
};

const getActivityStyle = (activityName: string) => {
    const name = activityName.toLowerCase().trim();
    const firstLetter = activityName.charAt(0).toUpperCase();
    const paletteIndex = hashStringToInt(name) % COLORS_PALETTE.length;
    return { bg: COLORS_PALETTE[paletteIndex], letter: firstLetter };
};

const getOrderActivities = (order: OrderItem): string[] => {
    const fromCredits = order.activity_credits ? Object.keys(order.activity_credits) : [];
    if (fromCredits.length > 0) return fromCredits;
    return order.allowed_activities || [];
};

export default function AdminShopOrdersPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [orders, setOrders] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Custom tooltips state
    const [activeTooltip, setActiveTooltip] = useState<{
        text: string;
        x: number;
        y: number;
    } | null>(null);

    const handleShowTooltip = (text: string, e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setActiveTooltip({
            text,
            x: rect.left + rect.width / 2,
            y: rect.top - 8
        });
    };
    const handleHideTooltip = () => {
        setActiveTooltip(null);
    };

    // Bulk selection
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

    // Filters
    const [searchTerm, setSearchTerm] = useState(() => getSessionFilter("orders_search", ""));
    const [filterStatuses, setFilterStatuses] = useState<string[]>(() => getSessionFilter("orders_filterStatuses", []));
    const [dynamicStatuses, setDynamicStatuses] = useState<string[]>(() => getSessionFilter("orders_dynamicStatuses", ["active", "termine"]));
    const [filterPayments, setFilterPayments] = useState<string[]>(() => getSessionFilter("orders_filterPayments", []));
    const [filterExpiry, setFilterExpiry] = useState(() => getSessionFilter("orders_filterExpiry", ""));
    const [exportFrom, setExportFrom] = useState(() => getSessionFilter("orders_exportFrom", ""));
    const [exportTo, setExportTo] = useState(() => getSessionFilter("orders_exportTo", ""));
    const [showCustomStatus, setShowCustomStatus] = useState(false);

    // Sync filters to sessionStorage
    useEffect(() => {
        setSessionFilter("orders_search", searchTerm);
    }, [searchTerm]);

    useEffect(() => {
        setSessionFilter("orders_filterStatuses", filterStatuses);
    }, [filterStatuses]);

    useEffect(() => {
        setSessionFilter("orders_dynamicStatuses", dynamicStatuses);
    }, [dynamicStatuses]);

    useEffect(() => {
        setSessionFilter("orders_filterPayments", filterPayments);
    }, [filterPayments]);

    useEffect(() => {
        setSessionFilter("orders_filterExpiry", filterExpiry);
    }, [filterExpiry]);

    useEffect(() => {
        setSessionFilter("orders_exportFrom", exportFrom);
    }, [exportFrom]);

    useEffect(() => {
        setSessionFilter("orders_exportTo", exportTo);
    }, [exportTo]);

    // Handle global activity listener to update inactivity timestamp
    useEffect(() => {
        const handleActivity = () => {
            updateLastActivity();
        };
        window.addEventListener("click", handleActivity);
        window.addEventListener("keypress", handleActivity);
        return () => {
            window.removeEventListener("click", handleActivity);
            window.removeEventListener("keypress", handleActivity);
        };
    }, []);

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
        is_recurring_unlimited: false,
        period: "",
        credits_total: "",
        is_unlimited: false,
        limit_amount: "",
        limit_period: "mois",
        limit_rollover: false,
        comment: "",
        user_note: "",
        offer_snap_code: "",
        offer_snap_name: "",
        is_blocked: false,
        allowed_activities: [] as string[],
        activity_credits: {} as Record<string, string>,
        trigger_consumption_percent: "",
        status: "",
        payment_status: "",
    });

    const [modalError, setModalError] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Delete confirm
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);



    // Installments modal
    const [installmentsOrder, setInstallmentsOrder] = useState<OrderItem | null>(null);
    const [installments, setInstallments] = useState<InstallmentItem[]>([]);
    const [loadingInstallments, setLoadingInstallments] = useState(false);
    const [showPercentage, setShowPercentage] = useState(false);

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
                router.push("/login");
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
            setModalError(err.response?.data?.detail || "Erreur lors de la création.");
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (order: OrderItem) => {
        setEditOrder(order);
        setModalError(null);
        setEditForm({
            start_date: order.start_date,
            end_date: order.end_date || "",
            price_cents: (order.price_cents / 100).toString(),
            featured_pricing: order.offer_featured_pricing || "lump_sum",
            price_recurring_cents: order.offer_price_recurring_cents ? (order.offer_price_recurring_cents / 100).toString() : "",
            recurring_count: order.offer_recurring_count !== null && order.offer_recurring_count !== undefined ? order.offer_recurring_count.toString() : "",
            is_recurring_unlimited: order.offer_featured_pricing === "recurring" && (order.offer_recurring_count === null || order.offer_recurring_count === undefined),
            period: order.offer_period || "/mois",
            credits_total: order.credits_total ? Number(order.credits_total).toString() : "",
            is_unlimited: order.is_unlimited,
            limit_amount: order.limit_amount ? order.limit_amount.toString() : "",
            limit_period: order.limit_period || "mois",
            limit_rollover: order.limit_rollover || false,
            status: order.status,
            payment_status: order.payment_status,
            comment: order.comment || "",
            user_note: order.user_note || "",
            offer_snap_code: order.offer_snap_code || order.offer_code || "",
            offer_snap_name: order.offer_snap_name || order.offer_name || "",
            is_blocked: order.is_blocked === true || (order.is_blocked === null && ["expiree", "en_pause", "resiliee"].includes(order.status)),
            allowed_activities: order.allowed_activities || [],
            activity_credits: Object.fromEntries(
                Object.entries(order.activity_credits || {}).map(([act, val]) => [act, val?.toString() || ""])
            ),
            trigger_consumption_percent: (order as any).trigger_consumption_percent?.toString() || ""
        });
        const isStd = ["active", "termine", "expiree", "en_pause", "resiliee", "", null, undefined].includes(order.status);
        setShowCustomStatus(!isStd);
        setShowErrors(false);
    };

    const handleEditActivityCheckboxChange = (act: string, checked: boolean) => {
        let nextActs = [...(editForm.allowed_activities || [])];
        if (checked) {
            if (!nextActs.includes(act)) nextActs.push(act);
        } else {
            nextActs = nextActs.filter(a => a !== act);
        }
        
        const nextCredits = { ...editForm.activity_credits };
        if (!checked) {
            delete nextCredits[act];
        } else if (!nextCredits[act]) {
            nextCredits[act] = "";
        }

        let nextCreditsTotal = editForm.credits_total;
        const activeVals = Object.entries(nextCredits).filter(([a]) => nextActs.includes(a));
        const hasVals = activeVals.some(([_, v]) => v && v.trim() !== "");
        if (hasVals) {
            const sum = activeVals.reduce((acc, [_, v]) => acc + (parseFloat(v.replace(",", ".")) || 0), 0);
            nextCreditsTotal = sum > 0 ? sum.toString() : editForm.credits_total;
        }

        setEditForm({
            ...editForm,
            allowed_activities: nextActs,
            activity_credits: nextCredits,
            credits_total: nextCreditsTotal,
        });
    };

    const handleEditActivityCreditChange = (act: string, val: string) => {
        const nextCredits = { ...editForm.activity_credits, [act]: val };
        
        let nextCreditsTotal = editForm.credits_total;
        const activeVals = Object.entries(nextCredits).filter(([a]) => editForm.allowed_activities.includes(a));
        const hasVals = activeVals.some(([_, v]) => v && v.trim() !== "");
        if (hasVals) {
            const sum = activeVals.reduce((acc, [_, v]) => acc + (parseFloat(v.replace(",", ".")) || 0), 0);
            nextCreditsTotal = sum.toString();
        }

        setEditForm({
            ...editForm,
            activity_credits: nextCredits,
            credits_total: nextCreditsTotal,
        });
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editOrder) return;

        // Validation
        const isLumpSum = editForm.featured_pricing === "lump_sum";
        const hasPrice = isLumpSum ? !!editForm.price_cents : (!!editForm.price_recurring_cents && (editForm.is_recurring_unlimited || !!editForm.recurring_count) && !!editForm.period);
        const hasEndDate = editOrder.is_validity_unlimited || !!editForm.end_date;
        const hasCredits = editForm.is_unlimited || !!editForm.credits_total;

        if (!editForm.start_date || !hasEndDate || !hasPrice || !hasCredits || !editForm.status || !editForm.payment_status) {
            setShowErrors(true);
            return;
        }

        setSaving(true);
        try {
            const priceCentsStr = typeof editForm.price_cents === 'string' ? editForm.price_cents : String(editForm.price_cents ?? "");
            const priceRecurringCentsStr = typeof editForm.price_recurring_cents === 'string' ? editForm.price_recurring_cents : String(editForm.price_recurring_cents ?? "");
            
            const parsedPriceCents = parseFloat(priceCentsStr.replace(',', '.'));
            const parsedPriceRecurringCents = parseFloat(priceRecurringCentsStr.replace(',', '.'));

            const has_activity_credits = editForm.allowed_activities?.length > 1 && Object.keys(editForm.activity_credits || {}).some(k => editForm.activity_credits[k]?.trim() !== '');
            const activity_credits_payload = has_activity_credits
                ? Object.fromEntries(
                    Object.entries(editForm.activity_credits || {})
                        .filter(([act, val]) => editForm.allowed_activities.includes(act) && val && val.trim() !== '')
                        .map(([act, val]) => [act, parseFloat(val.toString().replace(',', '.'))])
                  )
                : null;

            const computed_credits_total = editForm.is_unlimited
                ? null
                : (activity_credits_payload
                    ? Object.values(activity_credits_payload).reduce((a, b) => a + b, 0)
                    : (parseFloat(editForm.credits_total) || 0));

            const payload: any = {
                start_date: editForm.start_date,
                end_date: editForm.end_date || null,
                price_cents: isLumpSum 
                    ? (isNaN(parsedPriceCents) ? 0 : Math.round(parsedPriceCents * 100)) 
                    : (isNaN(parsedPriceRecurringCents) ? 0 : Math.round(parsedPriceRecurringCents * 100)),
                featured_pricing: editForm.featured_pricing,
                price_recurring_cents: !isLumpSum 
                    ? (isNaN(parsedPriceRecurringCents) ? 0 : Math.round(parsedPriceRecurringCents * 100)) 
                    : null,
                recurring_count: !isLumpSum ? (editForm.period === '/seuil' || editForm.period === 'seuil' ? (editForm.trigger_consumption_percent.split(',').filter(x => x.trim()).length + 1) : (editForm.is_recurring_unlimited ? null : (parseInt(editForm.recurring_count) || 0))) : null,
                trigger_consumption_percent: (!isLumpSum && (editForm.period === '/seuil' || editForm.period === 'seuil')) ? editForm.trigger_consumption_percent : null,
                period: !isLumpSum ? editForm.period : null,
                credits_total: computed_credits_total,
                is_unlimited: editForm.is_unlimited,
                limit_amount: editForm.limit_amount ? parseFloat(editForm.limit_amount) : null,
                limit_period: editForm.limit_amount ? editForm.limit_period : null,
                limit_rollover: editForm.limit_amount ? editForm.limit_rollover : false,
                status: editForm.status,
                payment_status: editForm.payment_status,
                comment: editForm.comment,
                user_note: editForm.user_note,
                is_blocked: editForm.is_blocked,
                offer_snap_allowed_activities: editForm.allowed_activities,
                activity_credits: activity_credits_payload,
                offer_snap_activity_credits: activity_credits_payload
            };

            await api.updateAdminOrder(editOrder.id, payload);
            setEditOrder(null);
            setMessage({ type: "success", text: "Commande modifiée avec succès !" });
            fetchData();
        } catch (err: any) {
            setModalError(err.response?.data?.detail || "Erreur lors de la modification.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.deleteAdminOrder(id);
            setDeleteConfirmId(null);
            setDeleteError(null);
            setMessage({ type: "success", text: "Commande supprimée." });
            const updated = await api.getAdminOrders();
            setOrders(updated);
        } catch (err: any) {
            const detail = err.response?.data?.detail || "Erreur lors de la suppression.";
            setDeleteError(detail);
        }
    };

    const openReceipt = (order: OrderItem) => {
        const receiptNumber = order.invoice_number || `REC-${order.id.slice(-6).toUpperCase()}`;
        const receiptDate = new Date(order.created_at).toISOString().split("T")[0];
        
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

        const emitterName = tenant?.legal_name || tenant?.name || "Mon Club";
        const legalForm = tenant?.legal_form || "";
        const emitterAddress = tenant?.legal_address || "";
        const siret = tenant?.legal_siret ? `SIRET : ${tenant.legal_siret}` : "";

        // Calcul du montant total de l'offre
        const isRecurring = order.offer_featured_pricing === "recurring" && !!order.offer_price_recurring_cents && !!order.offer_recurring_count;
        const totalCents = isRecurring ? ((order.offer_price_recurring_cents || 0) * (order.offer_recurring_count || 0)) : order.price_cents;
        const amountTtc = (totalCents / 100).toFixed(2);
        
        // Calcul du montant payé et restant
        const paidCents = order.received_cents || (order.payment_status === "paye" ? totalCents : 0);
        const amountPaid = (paidCents / 100).toFixed(2);
        const remainingCents = Math.max(0, totalCents - paidCents);
        const amountRemaining = (remainingCents / 100).toFixed(2);

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Justificatif de paiement ${receiptNumber}</title>
<style>
    body{font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;max-width:800px;margin:40px auto;padding:40px;color:#334155;line-height:1.5;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:60px}
    .invoice-title{font-size:26px;font-weight:700;color:#0f172a;letter-spacing:-0.025em;margin:0}
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
    .total-row{display:flex;justify-content:space-between;width:240px;font-size:14px}
    .total-main{font-size:18px;font-weight:700;color:#0f172a;border-top:2px solid #e2e8f0;padding-top:12px;margin-top:8px}
    .acquitted-stamp{display:${order.payment_status === "paye" ? "inline-block" : "none"};margin-top:12px;padding:6px 12px;border:2px solid #10b981;color:#10b981;font-size:14px;font-weight:700;text-transform:uppercase;transform:rotate(-5deg);border-radius:8px;opacity:0.9;background:rgba(255,255,255,0.8)}
    .footer{margin-top:80px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;font-size:11px;color:#94a3b8}
    .disclaimer{margin-top:20px;padding:12px;background:#f1f5f9;border-radius:8px;font-size:11px;color:#64748b;text-align:center;font-weight:500}
    @media print{body{margin:0;padding:20px}.acquitted-stamp{opacity:1}}
</style></head><body>
    <div class="header">
        <div>
            <h1 class="invoice-title">JUSTIFICATIF DE PAIEMENT</h1>
            <div style="margin-top:8px;font-size:14px;font-weight:600;color:#64748b">N° ${receiptNumber}</div>
        </div>
        <div class="emitter-info" style="text-align:right">
            <div class="emitter-name">${emitterName}</div>
            ${legalForm ? `<div>${legalForm}</div>` : ""}
            ${emitterAddress ? `<div style="white-space:pre-wrap">${emitterAddress}</div>` : ""}
            <div>${siret}</div>
        </div>
    </div>

    <div class="details">
        <div class="details-box">
            <div class="details-label">Adhérent</div>
            <div class="details-value">${recipientStr}</div>
        </div>
        <div class="details-box" style="max-width:200px">
            <div class="details-label">Date d'émission</div>
            <div class="details-value">${new Date(receiptDate).toLocaleDateString("fr-FR")}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width:70%">Description</th>
                <th style="text-align:right">Total TTC</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <div style="font-weight:600;color:#0f172a">${order.offer_name} (${order.offer_code})</div>
                    <div style="font-size:12px;color:#64748b;margin-top:4px">Période : ${order.start_date} au ${order.end_date || "Illimité"}</div>
                </td>
                <td style="text-align:right;font-weight:700;color:#0f172a">${amountTtc} €</td>
            </tr>
        </tbody>
    </table>

    <div class="totals">
        <div class="total-row"><span>Montant total de l'offre</span><span>${amountTtc} €</span></div>
        <div class="total-row"><span>Règlements perçus</span><span>${amountPaid} €</span></div>
        <div class="total-row"><span>Reste à payer</span><span>${amountRemaining} €</span></div>
        <div class="total-row total-main"><span>Total payé</span><span>${amountPaid} €</span></div>
        <div class="acquitted-stamp">Réglé le ${new Date(receiptDate).toLocaleDateString("fr-FR")}</div>
    </div>

    <div class="disclaimer">
        Ce document est un justificatif de paiement à usage interne et ne constitue pas une facture fiscale.
    </div>

    <div class="footer">
        <div>${emitterName} ${legalForm ? " - " + legalForm : ""}</div>
        <div>${emitterAddress.replace(/\n/g, ", ")}</div>
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
        a.download = `justificatif_${receiptNumber}.html`;
        a.click();
        
        // Revoke after a short delay to ensure download started
        setTimeout(() => URL.revokeObjectURL(url), 100);
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
            const q = searchTerm.toLowerCase().trim();
            let matches = o.user_name.toLowerCase().includes(q) || 
                          o.offer_code.toLowerCase().includes(q) || 
                          o.offer_name.toLowerCase().includes(q);
            
            if (!matches) {
                if (showPercentage && o.credits_total && Number(o.credits_total) > 0 && !o.is_unlimited) {
                    const pctConsumed = Math.round(((Number(o.credits_total) - Number(o.balance || 0)) / Number(o.credits_total)) * 100);
                    const pctString = `${pctConsumed}%`;
                    const pctStringSpace = `${pctConsumed} %`;
                    if (pctString.includes(q) || pctStringSpace.includes(q) || String(pctConsumed).includes(q)) {
                        matches = true;
                    }
                } else if (!showPercentage && o.balance !== undefined) {
                    const balStr = String(o.balance).toLowerCase();
                    if (balStr.includes(q)) {
                        matches = true;
                    }
                }
            }
            if (!matches) return false;
        }
        if (filterStatuses.length > 0 && !filterStatuses.includes(o.status)) return false;
        if (filterPayments.length > 0 && !filterPayments.includes(o.payment_status)) return false;
        if (filterExpiry) {
            const days = daysUntil(o.end_date);
            if (o.is_validity_unlimited) return false;
            if (filterExpiry === "7" && (days === null || days < 0 || days > 7)) return false;
            if (filterExpiry === "30" && (days === null || days < 0 || days > 30)) return false;
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
            o.is_unlimited ? "∞" : formatCredits(o.credits_total),
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

            <main className="flex-1 p-8 overflow-auto min-w-0">
                <div className="max-w-[1600px] mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">🛍️ Gestion des commandes</h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Suivi des commandes et paiements</p>
                        </div>
                        <button
                            onClick={() => { setShowCreate(true); setShowErrors(false); setModalError(null); loadFormOptions(); }}
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
                        <div className={`p-3 rounded-xl flex items-center justify-between border animate-in slide-in-from-top-2 duration-300 ${
                            message.type === 'success' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className="text-sm">
                                    {message.type === 'success' ? '✅' : '⚠️'}
                                </span>
                                <span className="text-sm font-normal text-slate-700 tracking-tight">
                                    {message.text}
                                </span>
                            </div>
                            <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-white/50 rounded-lg">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
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



                    {/* Orders Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-100 border-b border-slate-200">
                                    <tr>
                                        <th className="pl-3 pr-0 py-[10px] text-left w-16 whitespace-nowrap text-xs uppercase tracking-widest">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length}
                                                    onChange={() => toggleAll(filteredOrders)}
                                                    title="Tout sélectionner"
                                                />
                                                <button
                                                    onClick={handleBulkEmail}
                                                    disabled={selectedOrderIds.size === 0}
                                                    className={`p-1 rounded-lg transition-all ${
                                                        selectedOrderIds.size > 0 
                                                            ? "hover:bg-blue-50 hover:scale-110 active:scale-95 cursor-pointer" 
                                                            : "cursor-not-allowed"
                                                    }`}
                                                    title={selectedOrderIds.size > 0 ? `Envoyer un e-mail aux ${selectedOrderIds.size} sélectionné(s)` : "Sélectionner des lignes pour envoyer un e-mail"}
                                                >
                                                    <svg className="w-5 h-5 select-none inline-block align-middle" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <rect x="2" y="4" width="20" height="16" rx="3" fill="#3B82F6" />
                                                        <path d="M2 7l10 6 10-6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        <circle cx="17" cy="15" r="5.5" fill="#1D4ED8" stroke="#FFFFFF" strokeWidth="1.5" />
                                                        <path d="M17 12.5c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5 1.5-.7 1.5-1.5v-.5c0-.4.3-.7.7-.7s.7.3.7.7v.5c0 1.8-1.4 3.2-3.2 3.2s-3.2-1.4-3.2-3.2 1.4-3.2 3.2-3.2c1 0 1.9.4 2.5 1.1" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </th>
                                        <th className="px-3 py-[10px] text-left text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">nom</th>
                                        <th className="px-3 py-[10px] text-left text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">offre</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">activités</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden lg:table-cell whitespace-nowrap">début</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden lg:table-cell whitespace-nowrap">fin</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden sm:table-cell whitespace-nowrap">tarif</th>
                                        <th className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden xl:table-cell whitespace-nowrap">crédits</th>
                                        <th 
                                            onClick={() => setShowPercentage(!showPercentage)}
                                            className="px-3 py-[10px] text-center text-xs font-medium text-slate-400 uppercase tracking-widest hidden sm:table-cell whitespace-nowrap cursor-pointer hover:text-slate-600 transition-colors select-none"
                                            title={showPercentage ? "Afficher en crédits restants" : "Afficher en % consommé"}
                                        >
                                            <div className="flex items-center justify-center gap-1.5">
                                                <span>solde</span>
                                                <span className="text-[9px] font-semibold text-slate-500 bg-slate-200/50 hover:bg-slate-200 hover:text-slate-700 px-1.5 py-0.5 rounded border border-slate-300/30 transition-all shadow-sm tracking-tight">{showPercentage ? "NB" : "%"}</span>
                                            </div>
                                        </th>
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
                                        const expiryWarning = !order.is_validity_unlimited && days !== null && days >= 0 && days <= 30;
                                        const expiryCritical = !order.is_validity_unlimited && days !== null && days >= 0 && days <= 7;
                                        return (
                                            <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="pl-3 pr-0 py-2.5 w-10">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        checked={selectedOrderIds.has(order.id)}
                                                        onChange={() => toggleSelection(order.id)}
                                                    />
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-sm">
                                                    <div className="flex items-center gap-1">
                                                        <Link 
                                                            href={`/admin/users?search=${encodeURIComponent(order.user_email || order.user_name)}`} 
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="font-medium text-slate-900 hover:text-blue-600 hover:underline transition-colors"
                                                        >
                                                            {order.user_name}
                                                        </Link>
                                                        {order.created_by_admin && (
                                                            <span title="Créé par le manager" className="text-amber-500">🛡️</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                     <div className="flex flex-col gap-0.5 justify-center">
                                                          <div className="flex items-center gap-1">
                                                              <span className="text-sm font-medium text-slate-900">{order.offer_code}</span>
                                                              {order.comment && order.comment.trim().length > 0 && (
                                                                  <span 
                                                                      onMouseEnter={(e) => handleShowTooltip(`Commentaire interne : ${order.comment}`, e)}
                                                                      onMouseLeave={handleHideTooltip}
                                                                      className="cursor-help text-sm"
                                                                  >
                                                                      📝
                                                                  </span>
                                                              )}
                                                              {order.user_note && order.user_note.trim().length > 0 && (
                                                                  <div 
                                                                      onMouseEnter={(e) => handleShowTooltip(`Note à l'utilisateur : ${order.user_note}`, e)}
                                                                      onMouseLeave={handleHideTooltip}
                                                                      className="text-slate-400 hover:text-slate-600 transition-colors cursor-help"
                                                                  >
                                                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                                      </svg>
                                                                  </div>
                                                              )}
                                                          </div>
                                                          {order.created_at && (
                                                              <span className="text-[10px] text-slate-400">
                                                                  Créé le {new Date(order.created_at).toLocaleDateString("fr-FR")}
                                                              </span>
                                                          )}
                                                     </div>
                                                 </td>
                                                 <td className="px-3 py-2.5 whitespace-nowrap">
                                                     <div className="flex items-center justify-center gap-1">
                                                         {(() => {
                                                             const acts = getOrderActivities(order);
                                                             return acts.length > 0 ? (
                                                                 acts.map((act) => {
                                                                     const style = getActivityStyle(act);
                                                                     return (
                                                                         <span 
                                                                             key={act}
                                                                             onMouseEnter={(e) => handleShowTooltip(act.charAt(0).toUpperCase() + act.slice(1), e)}
                                                                             onMouseLeave={handleHideTooltip}
                                                                             className={`w-5 h-5 rounded-full border text-[10px] font-bold flex items-center justify-center cursor-help transition-transform hover:scale-110 shadow-sm ${style.bg}`}
                                                                         >
                                                                             {style.letter}
                                                                         </span>
                                                                     );
                                                                 })
                                                             ) : (
                                                                 <span className="text-slate-400 text-xs">—</span>
                                                             );
                                                         })()}
                                                     </div>
                                                 </td>
                                                 <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700 hidden lg:table-cell text-center">
                                                     {new Date(order.start_date).toLocaleDateString("fr-FR")}
                                                 </td>
                                                 <td className="px-3 py-2.5 whitespace-nowrap text-sm hidden lg:table-cell text-center">
                                                     {order.is_validity_unlimited ? (
                                                         <span className="text-base select-none">♾️</span>
                                                     ) : order.end_date ? (
                                                         <div className="flex items-center gap-1 justify-center">
                                                             <span className={expiryCritical ? "text-red-600 font-bold" : expiryWarning ? "text-orange-600 font-medium" : "text-slate-700"}>
                                                                 {new Date(order.end_date).toLocaleDateString("fr-FR")}
                                                             </span>
                                                         </div>
                                                     ) : (
                                                         <span className="text-slate-400">—</span>
                                                     )}
                                                 </td>
                                                 <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 hidden sm:table-cell text-left">
                                                     {formatPrice(order)}
                                                 </td>
                                                 <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700 hidden xl:table-cell text-center">
                                                     <div className="flex flex-col items-center justify-center gap-0.5">
                                                         <span className="leading-none">{order.is_unlimited ? <span className="text-base select-none">♾️</span> : formatCredits(order.credits_total)}</span>
                                                         {order.limit_amount && (
                                                             <div className="text-[10px] text-slate-400 font-normal leading-tight">
                                                                 Plafond {formatCredits(order.limit_amount)}/{(order.limit_period || "mois").replace(/^\//, "")}
                                                             </div>
                                                         )}
                                                     </div>
                                                 </td>
                                                 <td className="px-3 py-2.5 whitespace-nowrap text-center hidden sm:table-cell">
                                                     {order.is_unlimited ? (
                                                         <div className={`flex items-center justify-center gap-1 text-sm ${order.user_is_suspended ? "text-red-600 font-semibold" : "text-slate-700 font-medium"}`}>
                                                             <span className="text-base select-none">♾️</span>
                                                             {order.is_blocked && <span title="Crédits bloqués" className="ml-0.5">🔒</span>}
                                                             {order.user_is_suspended && <span title="Crédits suspendus" className="ml-0.5">🚫</span>}
                                                         </div>
                                                     ) : (
                                                         <div 
                                                             className="flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                                                             onMouseEnter={(e) => {
                                                                 if (order.activity_credits && Object.keys(order.activity_credits).length > 0) {
                                                                     const text = `Soldes restants :\n` + Object.entries(order.activity_credits)
                                                                         .map(([act, val]) => {
                                                                             const used = order.activity_allocations?.[act] || 0;
                                                                             const init = Number(val) || 0;
                                                                             const rem = Math.max(0, init - used);
                                                                             return `• ${act.charAt(0).toUpperCase() + act.slice(1)} : ${rem}/${init}`;
                                                                         })
                                                                         .join("\n");
                                                                     handleShowTooltip(text, e);
                                                                 }
                                                             }}
                                                             onMouseLeave={handleHideTooltip}
                                                         >
                                                             <div className={`flex items-center justify-center gap-1 text-sm ${order.user_is_suspended ? "text-red-600 font-semibold" :
                                                                     (order.balance ?? 0) <= 0 ? "text-red-600" :
                                                                         (order.balance ?? 0) <= 2 ? "text-orange-600" :
                                                                             "text-slate-700 font-medium"
                                                                 }`}>
                                                                 <span>
                                                                     {showPercentage && order.credits_total && Number(order.credits_total) > 0 
                                                                         ? `${Math.round(((Number(order.credits_total) - Number(order.balance || 0)) / Number(order.credits_total)) * 100)} %` 
                                                                         : formatCredits(order.balance)
                                                                     }
                                                                 </span>
                                                                 {order.activity_credits && Object.keys(order.activity_credits).length > 0 && (
                                                                     <svg className="w-3.5 h-3.5 text-blue-500 hover:text-blue-700 transition-colors select-none shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h10" />
                                                                     </svg>
                                                                 )}
                                                                 {order.is_blocked && <span title="Crédits bloqués" className="ml-0.5">🔒</span>}
                                                                 {order.user_is_suspended && <span title="Crédits suspendus" className="ml-0.5">🚫</span>}
                                                             </div>
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
                                                <td className="px-3 py-2.5 whitespace-nowrap text-right">
                                                    <div className="flex items-center justify-end gap-0">
                                                        <button onClick={() => openEdit(order)} className="p-0.5 hover:bg-blue-50 text-blue-500 rounded-lg transition-all hover:scale-110" title="Modifier">✏️</button>
                                                        <div className="relative">
                                                            <button onClick={() => openReceipt(order)} className="p-0.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-all hover:scale-110" title="Justificatif">🧾</button>
                                                        </div>
                                                        <button onClick={() => setDeleteConfirmId(order.id)} className="p-0.5 hover:bg-rose-50 text-rose-500 rounded-lg transition-all hover:scale-110" title="Supprimer">🗑️</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredOrders.length === 0 && (
                                        <tr>
                                            <td colSpan={13} className="px-6 py-8 text-center text-slate-500 text-sm">
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
                            <button onClick={() => { setShowCreate(false); setModalError(null); }} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            {modalError && (
                                <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl flex items-start gap-2.5 text-sm animate-in slide-in-from-top-1 duration-200">
                                    <span className="text-lg leading-none">⚠️</span>
                                    <div className="flex-1 font-medium">{modalError}</div>
                                    <button type="button" onClick={() => setModalError(null)} className="text-rose-400 hover:text-rose-600 transition-colors">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            )}
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
                            <button type="button" onClick={() => { setShowCreate(false); setModalError(null); }}
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
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Modifier la commande</h3>
                            </div>
                            <button onClick={() => { setEditOrder(null); setModalError(null); }} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            {modalError && (
                                <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl flex items-start gap-2.5 text-sm animate-in slide-in-from-top-1 duration-200">
                                    <span className="text-lg leading-none">⚠️</span>
                                    <div className="flex-1 font-medium">{modalError}</div>
                                    <button type="button" onClick={() => setModalError(null)} className="text-rose-400 hover:text-rose-600 transition-colors">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                            <form id="editOrderForm" onSubmit={handleEditSubmit} className="space-y-8">
                                {/* Statuts & Paiement */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && !editForm.status) ? 'text-red-500' : 'text-slate-700'}`}>Statut *</label>
                                        <div className="space-y-2">
                                            <select
                                                value={showCustomStatus ? "_custom" : (editForm.status || "active")}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === "_custom") {
                                                        setShowCustomStatus(true);
                                                        setEditForm({ ...editForm, status: "" });
                                                    } else {
                                                        setShowCustomStatus(false);
                                                        const shouldBlock = ["en_pause", "resiliee", "expiree"].includes(val);
                                                        setEditForm({ 
                                                            ...editForm, 
                                                            status: val,
                                                            is_blocked: shouldBlock ? true : (val === "active" ? false : editForm.is_blocked)
                                                        });
                                                    }
                                                }}
                                                className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all ${(showErrors && !editForm.status) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
                                            >
                                                <option value="active">Active</option>
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

                                {/* Période (Dates) */}
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

                                {/* Notes et Suivi */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Commentaire interne</label>
                                        <textarea value={editForm.comment}
                                            onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                            rows={2}
                                            placeholder="Notes visibles uniquement par l'administration..." />
                                    </div>
                                    <div className="space-y-2">
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
                                </div>

                                {/* Contenu & Crédits */}
                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b pb-1">Contenu & crédits</h4>
                                    
                                    {/* Nombre de crédits inclus et bloquer le solde */}
                                    <div className="flex flex-wrap items-center justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3">
                                                <span className={`text-sm font-medium ${(showErrors && !editForm.is_unlimited && !editForm.credits_total) ? 'text-red-500' : 'text-slate-700'}`}>
                                                    Nombre de crédits inclus dans la commande
                                                </span>
                                                <input 
                                                    type="number" 
                                                    step="any" 
                                                    placeholder="Nombre" 
                                                    disabled={editForm.is_unlimited} 
                                                    value={editForm.credits_total} 
                                                    onChange={e => setEditForm({...editForm, credits_total: e.target.value})} 
                                                    className={`w-28 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:bg-slate-50 bg-white ${(showErrors && !editForm.is_unlimited && !editForm.credits_total) ? 'border-red-300 bg-red-50' : 'border-gray-300'} [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield]`} 
                                                />
                                            </div>
                                            <div className="pt-0.5">
                                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={editForm.is_unlimited} 
                                                        onChange={e => setEditForm({...editForm, is_unlimited: e.target.checked, ...(e.target.checked ? {credits_total: ''} : {})})} 
                                                        className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500" 
                                                    />
                                                    <span className="text-sm font-medium text-slate-700">Crédits illimités (♾️)</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Bloquer le solde switch */}
                                        <div className="flex items-center">
                                            {(() => {
                                                const isStatusBlocking = ["en_pause", "resiliee", "expiree"].includes(editForm.status);
                                                return (
                                                    <div className="space-y-1">
                                                        <label className={`flex items-center gap-2 group ${isStatusBlocking ? "cursor-not-allowed" : "cursor-pointer"}`}>
                                                            <input type="checkbox" checked={editForm.is_blocked}
                                                                disabled={isStatusBlocking}
                                                                onChange={(e) => setEditForm({ ...editForm, is_blocked: e.target.checked })}
                                                                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed" />
                                                            <span className={`text-sm font-medium flex items-center gap-1.5 transition-colors ${isStatusBlocking ? "text-slate-400 cursor-not-allowed" : "text-slate-700 group-hover:text-slate-900"}`}>
                                                                🔒 Bloquer le solde de crédits {isStatusBlocking && "(lié au statut)"}
                                                            </span>
                                                        </label>
                                                        {!isStatusBlocking && editForm.is_blocked && (
                                                            <p className="text-xs text-amber-600 mt-1 max-w-xs font-light">
                                                                ⚠️ Si vous bloquez les crédits manuellement, pensez à vérifier si l'utilisateur possède des réservations à venir.
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Grille d'activités */}
                                    {tenant?.activity_types && tenant.activity_types.length > 0 && (
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
                                            {/* Colonnes d'activités */}
                                            <div className="lg:col-span-12 grid grid-cols-2 gap-4 items-start">
                                                {/* Colonne 1: Types d'activités autorisés */}
                                                <div>
                                                    <div className="text-sm font-medium text-slate-700 mb-3">
                                                        Type d'activités autorisés <span className="font-normal text-slate-500">(<u>optionnel</u>)</span>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {tenant.activity_types.map(act => {
                                                            const isChecked = editForm.allowed_activities?.includes(act);
                                                            return (
                                                                <div key={`edit-chk-${act}`} className="h-9 flex items-center">
                                                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={isChecked} 
                                                                            onChange={e => handleEditActivityCheckboxChange(act, e.target.checked)} 
                                                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" 
                                                                        />
                                                                        <span className="text-sm text-slate-700 font-medium">{act}</span>
                                                                    </label>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Colonne 2: Nombre de crédits par type d'activité */}
                                                <div>
                                                    <div className="text-sm font-medium text-slate-700 mb-3">
                                                        Nombre de crédits par type d'activité <span className="font-normal text-slate-500">(<u>optionnel</u>)</span>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {tenant.activity_types.map(act => {
                                                            const isChecked = editForm.allowed_activities?.includes(act);
                                                            return (
                                                                <div key={`edit-val-${act}`} className="h-9 flex items-center">
                                                                    <input 
                                                                        type="number"
                                                                        disabled={!isChecked || editForm.is_unlimited}
                                                                        value={editForm.activity_credits[act] || ""}
                                                                        onChange={e => handleEditActivityCreditChange(act, e.target.value)}
                                                                        className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-center bg-white disabled:bg-slate-50 disabled:text-slate-400"
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Plafond de crédit périodique */}
                                    <div className="pt-4 border-t border-slate-100">
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Plafond de crédit périodique <span className="font-normal text-slate-500">(<u>optionnel</u>)</span>
                                        </label>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <input type="number" placeholder="Nombre" value={editForm.limit_amount} onChange={e => setEditForm({...editForm, limit_amount: e.target.value})} className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield] bg-white" />
                                            <span className="text-sm text-slate-500">par</span>
                                            <select value={editForm.limit_period} onChange={e => setEditForm({...editForm, limit_period: e.target.value})} className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                                                <option value="/semaine">semaine</option>
                                                <option value="/mois">mois</option>
                                                <option value="/bimestre">bimestre</option>
                                                <option value="/trimestre">trimestre</option>
                                                <option value="/an">an</option>
                                            </select>
                                            <label className="flex items-center gap-2 cursor-pointer ml-2 select-none">
                                                <input type="checkbox" checked={editForm.limit_rollover} onChange={e => setEditForm({...editForm, limit_rollover: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500" />
                                                <span className="text-xs text-slate-600 font-light">Autoriser le report des crédits non consommés sur la période suivante</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Tarification */}
                                 {(() => {
                                     const isPricingValid = editForm.featured_pricing === 'lump_sum' 
                                         ? !!editForm.price_cents 
                                         : (!!editForm.price_recurring_cents && (editForm.is_recurring_unlimited || !!editForm.recurring_count));

                                     return (
                                         <div className="space-y-4 pt-4 border-t border-slate-100">
                                             <div className="flex items-center justify-between mb-2">
                                                 <h4 className={`text-xs font-semibold uppercase tracking-wider flex items-baseline gap-2 ${(showErrors && !isPricingValid) ? 'text-red-500' : 'text-slate-400'}`}>
                                                     Tarification *
                                                 </h4>
                                                 <div className="flex bg-slate-100 p-1 rounded-xl border border-gray-200 shadow-sm">
                                                     <button
                                                         type="button"
                                                         onClick={() => setEditForm({ ...editForm, featured_pricing: "lump_sum" })}
                                                         className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${editForm.featured_pricing === "lump_sum" ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-500 hover:text-slate-700"}`}
                                                     >
                                                         Paiement unique
                                                     </button>
                                                     <button
                                                         type="button"
                                                         onClick={() => setEditForm({ ...editForm, featured_pricing: "recurring" })}
                                                         className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${editForm.featured_pricing === "recurring" ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-500 hover:text-slate-700"}`}
                                                     >
                                                         Paiement échelonné
                                                     </button>
                                                 </div>
                                             </div>
                                             
                                             <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                                                 {editForm.featured_pricing === 'lump_sum' ? (
                                                     /* Paiement Unique */
                                                     <div className="p-4 rounded-xl border-2 border-blue-600 bg-blue-50">
                                                         <div className="space-y-3">
                                                             <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                                                                 <span className="font-semibold text-slate-900">Paiement unique</span>
                                                                 <div className="flex items-center gap-2 flex-1 justify-end min-w-[200px]">
                                                                     <label className="text-xs text-slate-500 whitespace-nowrap">Montant TTC (€) :</label>
                                                                     <input type="number" step="0.01" value={editForm.price_cents} onChange={e => setEditForm({...editForm, price_cents: e.target.value})} className={`w-32 px-3 py-2 border rounded-lg focus:border-slate-400 outline-none bg-white ${(showErrors && editForm.featured_pricing === 'lump_sum' && !editForm.price_cents) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} placeholder="0.00" />
                                                                 </div>
                                                             </div>
                                                         </div>
                                                     </div>
                                                 ) : (
                                                     /* Abonnement */
                                                     <div className="p-4 rounded-xl border-2 border-amber-500 bg-amber-50">
                                                          <div className="space-y-4">
                                                              <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                                                                  <span className="font-semibold text-slate-900">Paiement échelonné / Abonnement</span>
                                                                  <div className="flex items-center gap-2 flex-1 justify-end min-w-[200px]">
                                                                      <label className="text-xs text-slate-500 whitespace-nowrap">Montant de l'échéance (€) :</label>
                                                                      <input type="number" step="0.01" value={editForm.price_recurring_cents} onChange={e => setEditForm({...editForm, price_recurring_cents: e.target.value})} className={`w-32 px-3 py-2 border rounded-lg focus:border-slate-400 outline-none bg-white text-sm ${(showErrors && editForm.featured_pricing === 'recurring' && !editForm.price_recurring_cents) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} placeholder="0.00" />
                                                                  </div>
                                                              </div>
                                                              
                                                              <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 md:gap-y-0 md:divide-x md:divide-gray-200 pt-4 border-t border-gray-150">
                                                                  {/* Colonne 1: Période */}
                                                                  <div className="md:pr-6 space-y-3">
                                                                      <label className="flex items-center gap-2 cursor-pointer mb-2 font-semibold text-slate-800" onClick={e => e.stopPropagation()}>
                                                                          <input 
                                                                              type="checkbox" 
                                                                              checked={editForm.period !== 'seuil' && !editForm.is_recurring_unlimited} 
                                                                              onChange={() => setEditForm({
                                                                                  ...editForm,
                                                                                  period: editForm.period === 'seuil' ? 'mois' : editForm.period,
                                                                                  is_recurring_unlimited: false
                                                                              })} 
                                                                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-0 focus:ring-offset-0"
                                                                          />
                                                                          <span className="text-xs">Période</span>
                                                                      </label>
                                                                      <select value={editForm.period} onChange={e => setEditForm({...editForm, period: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white" disabled={editForm.period === 'seuil' || editForm.is_recurring_unlimited}>
                                                                          <option value="/semaine">semaine</option>
                                                                          <option value="/mois">mois</option>
                                                                          <option value="/bimestre">bimestre</option>
                                                                          <option value="/trimestre">trimestre</option>
                                                                          <option value="/an">an</option>
                                                                      </select>
                                                                  </div>

                                                                  {/* Colonne 2: Échéances */}
                                                                  <div className="md:px-6 space-y-3">
                                                                      <label className="flex items-center gap-2 cursor-pointer mb-2 font-semibold text-slate-800" onClick={e => e.stopPropagation()}>
                                                                          <input 
                                                                              type="checkbox" 
                                                                              checked={!editForm.is_recurring_unlimited && editForm.period !== 'seuil'} 
                                                                              onChange={() => setEditForm({
                                                                                  ...editForm,
                                                                                  is_recurring_unlimited: false,
                                                                                  period: editForm.period === 'seuil' ? 'mois' : editForm.period
                                                                              })} 
                                                                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-0 focus:ring-offset-0"
                                                                          />
                                                                          <span className="text-xs">Nombre d'échéance défini</span>
                                                                      </label>
                                                                      <div className="flex items-center gap-4 w-full">
                                                                          <input type="number" min="1" disabled={editForm.is_recurring_unlimited} value={editForm.is_recurring_unlimited ? "" : editForm.recurring_count} onChange={e => setEditForm({...editForm, recurring_count: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 outline-none disabled:bg-gray-100 bg-white ${(showErrors && editForm.featured_pricing === 'recurring' && !editForm.is_recurring_unlimited && !editForm.recurring_count) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} placeholder="ex: 12" />
                                                                          <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                                              <input type="checkbox" checked={editForm.is_recurring_unlimited} onChange={e => setEditForm({...editForm, is_recurring_unlimited: e.target.checked, recurring_count: e.target.checked ? "" : editForm.recurring_count})} className="w-4 h-4 text-amber-500 rounded border-gray-300 focus:ring-amber-500" />
                                                                              <span className="text-xs font-medium text-slate-700">Illimité</span>
                                                                          </label>
                                                                      </div>
                                                                  </div>

                                                                  {/* Colonne 3: Seuil */}
                                                                  <div className="md:pl-6 space-y-3">
                                                                      <label className="flex items-center gap-2 cursor-pointer mb-2 font-semibold text-slate-800" onClick={e => e.stopPropagation()}>
                                                                          <input 
                                                                              type="checkbox" 
                                                                              checked={editForm.period === 'seuil' || editForm.period === '/seuil'} 
                                                                              onChange={() => setEditForm({
                                                                                  ...editForm,
                                                                                  period: 'seuil',
                                                                                  is_recurring_unlimited: false
                                                                              })} 
                                                                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-0 focus:ring-offset-0"
                                                                          />
                                                                          <span className="text-xs">Seuil de consommation</span>
                                                                      </label>
                                                                      <input 
                                                                          type="text" 
                                                                          placeholder="ex: 20, 40, 60" 
                                                                          disabled={editForm.period !== 'seuil' && editForm.period !== '/seuil'} 
                                                                          value={editForm.trigger_consumption_percent} 
                                                                          onChange={e => setEditForm({...editForm, trigger_consumption_percent: e.target.value})} 
                                                                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:bg-gray-100 bg-white ${(showErrors && editForm.featured_pricing === 'recurring' && (editForm.period === 'seuil' || editForm.period === '/seuil') && !editForm.trigger_consumption_percent) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} 
                                                                      />
                                                                  </div>
                                                              </div>
                                                          </div>
                                                      </div>
                                                 )}
                                             </div>
                                         </div>
                                     );
                                 })()}
                            </form>
                        </div>

                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button type="button" onClick={() => { setEditOrder(null); setModalError(null); }}
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

            <ConfirmModal
                isOpen={!!deleteConfirmId}
                title="Confirmer la suppression"
                message={
                    <>
                        <p>Cette commande sera définitivement supprimée. Les crédits associés seront retirés du compte client.</p>
                        {deleteError && (
                            <div className="mt-4 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl flex items-start gap-2.5 text-sm animate-in slide-in-from-top-1 duration-200">
                                <span className="text-lg leading-none">⚠️</span>
                                <div className="flex-1 font-medium">{deleteError}</div>
                                <button type="button" onClick={() => setDeleteError(null)} className="text-rose-400 hover:text-rose-600 transition-colors">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </>
                }
                type="danger"
                confirmLabel="Supprimer"
                cancelLabel="Annuler"
                onConfirm={() => {
                    if (deleteConfirmId) handleDelete(deleteConfirmId);
                }}
                onCancel={() => {
                    setDeleteConfirmId(null);
                    setDeleteError(null);
                }}
            />





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
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest w-24">Échéance</th>
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date prévue</th>
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Montant</th>
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Statut</th>
                                                <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Signaler impayé</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {installments.map((inst) => {
                                                const hasDueDate = !!inst.due_date;
                                                const dueDate = hasDueDate ? new Date(inst.due_date) : null;
                                                const graceDate = dueDate ? new Date(dueDate) : null;
                                                if (graceDate) graceDate.setDate(graceDate.getDate() + 7);
                                                const isPastGrace = graceDate ? graceDate <= new Date() : false;

                                                return (
                                                    <tr key={inst.id} className={`group transition-colors ${inst.is_error ? "bg-rose-50/30" : "hover:bg-gray-50"}`}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-xs font-light text-slate-500">
                                                            {inst.sequence_number !== undefined && inst.sequence_number !== null ? (
                                                                `${inst.sequence_number} / ${installmentsOrder?.offer_recurring_count || '∞'}`
                                                            ) : (
                                                                '-'
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">
                                                            {dueDate ? dueDate.toLocaleDateString("fr-FR") : `Au seuil (${inst.trigger_consumption_percent || installmentsOrder?.trigger_consumption_percent || 40}%)`}
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
