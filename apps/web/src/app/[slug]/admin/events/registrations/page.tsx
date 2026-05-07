"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User, AdminEventRegistrationItem, Tenant } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import MultiSelect from "@/components/MultiSelect";
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    eachDayOfInterval, 
    isSameDay, 
    addMonths, 
    subMonths,
    startOfToday,
    parseISO
} from "date-fns";
import { fr } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
    confirmed: "Inscrit",
    pending_payment: "Inscrit",
    waiting_list: "Sur liste",
    cancelled: "Annulé",
    absent: "Absent",
    event_deleted: "Évènement supprimé",
};

const PAYMENT_LABELS: Record<string, string> = {
    a_valider: "À valider",
    en_attente: "En attente",
    paye: "Payé",
    rembourse: "Remboursé",
};

interface UserOption { id: string; first_name: string; last_name: string; balance?: number; }
interface EventOption {
    id: string; title: string; event_date: string; event_time: string;
    max_places: number; registrations_count: number;
    price_member_cents: number; price_external_cents: number;
    location?: string;
}

export default function AdminEventRegistrationsPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [registrations, setRegistrations] = useState<AdminEventRegistrationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
    const [filterPayments, setFilterPayments] = useState<string[]>([]);
    
    // Calendar & Location state
    const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
    const [currentMonth, setCurrentMonth] = useState(startOfToday());
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [locationFilter, setLocationFilter] = useState<string[]>([]);
    const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [events, setEvents] = useState<EventOption[]>([]);
    const [createForm, setCreateForm] = useState({
        user_id: "", event_id: "", price_paid_cents: "", payment_status: "a_valider", notes: "",
        user_note: "", price_type: "member" as "member" | "external"
    });
    const [saving, setSaving] = useState(false);

    // Edit modal
    const [editReg, setEditReg] = useState<AdminEventRegistrationItem | null>(null);
    const [editForm, setEditForm] = useState({ notes: "", user_note: "", status: "", payment_status: "", price_paid_cents: "" as string });

    // Show errors
    const [showErrors, setShowErrors] = useState(false);

    // Delete confirm
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Invoice
    const [invoiceReg, setInvoiceReg] = useState<AdminEventRegistrationItem | null>(null);
    const [dateRange, setDateRange] = useState({ start: "", end: "" });
    const [invoiceData, setInvoiceData] = useState<any>({
        emitter: "Mon Club",
        recipient: "",
        invoice_number: "",
        invoice_date: "",
        description: "",
        amount_ht: "",
        amount_ttc: "0,00",
        notes: "",
        is_acquitted: true,
    });

    useEffect(() => { fetchData(); }, [router]);
    useEffect(() => { if (user) loadRegistrations(); }, [filterStatuses, filterPayments]);

    const handleSetDate = (date: Date) => {
        setSelectedDate(date);
    };

    const daysInMonth = useMemo(() => {
        return eachDayOfInterval({
            start: startOfMonth(currentMonth),
            end: endOfMonth(currentMonth)
        });
    }, [currentMonth]);

    const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

    const fetchData = async () => {
        try {
            // 1. Get user and check permissions BEFORE other data
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

            // 2. Fetch other data
            await Promise.all([
                loadRegistrations(),
                loadFormOptions(), // This loads users and events for filters/creation
            ]);
        } catch (err: any) {
            console.error(err);
            if (err.response?.status === 401) {
                router.push(`/${params.slug}`);
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
        let price = "0";
        if (evt) {
            price = ((createForm.price_type === "member" ? evt.price_member_cents : evt.price_external_cents) / 100).toString();
        }
        setCreateForm({
            ...createForm,
            event_id: eventId,
            price_paid_cents: price,
        });
    };

    const onPriceTypeChange = (type: "member" | "external") => {
        const evt = events.find(e => e.id === createForm.event_id);
        let price = createForm.price_paid_cents;
        if (evt) {
            const amount = (type === "member" ? evt.price_member_cents : evt.price_external_cents) / 100;
            price = (amount % 1 === 0 ? amount.toString() : amount.toFixed(2).replace('.', ','));
        }
        setCreateForm({
            ...createForm,
            price_type: type,
            price_paid_cents: price,
        });
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!createForm.user_id || !createForm.event_id || !createForm.payment_status) {
            setShowErrors(true);
            return;
        }

        setSaving(true);
        try {
            await api.createAdminEventRegistration({
                user_id: createForm.user_id,
                event_id: createForm.event_id,
                price_paid_cents: Math.round(parseFloat(createForm.price_paid_cents.toString().replace(',', '.') || "0") * 100),
                payment_status: createForm.payment_status,
                notes: createForm.notes || undefined,
                user_note: createForm.user_note || undefined,
            });
            setShowCreate(false);
            setCreateForm({ user_id: "", event_id: "", price_paid_cents: "", payment_status: "a_valider", notes: "", user_note: "", price_type: "member" });
            setShowErrors(false);
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
            user_note: reg.user_note || "",
            status: reg.status,
            payment_status: reg.payment_status,
            price_paid_cents: (reg.price_paid_cents / 100).toString()
        });
        setShowErrors(false);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editReg) return;

        if (!editForm.status || !editForm.payment_status || editForm.price_paid_cents === "") {
            setShowErrors(true);
            return;
        }

        setSaving(true);
        try {
            await api.updateAdminEventRegistration(editReg.id, {
                notes: editForm.notes || undefined,
                user_note: editForm.user_note || undefined,
                status: editForm.status || undefined,
                payment_status: editForm.payment_status || undefined,
                price_paid_cents: Math.round(parseFloat(editForm.price_paid_cents.toString().replace(',', '.') || "0") * 100),
            });
            setEditReg(null);
            setMessage({ type: "success", text: "Inscription modifiée avec succès !" });
            setShowErrors(false);
            await loadRegistrations();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la modification." });
        } finally {
            setSaving(false);
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
            invoice_number: `FAC-${Date.now().toString().slice(-6)}`,
            invoice_date: today,
            emitter: tenant?.legal_name || tenant?.name || "Votre Établissement",
            recipient: reg.user_name,
            description: `Participation à l'événement: ${reg.event_title}`,
            amount_ht: "",
            amount_ttc: (reg.price_paid_cents / 100).toFixed(2).replace(".", ","),
            notes: "",
            is_acquitted: reg.payment_status === "paye",
        });
    };

    const downloadInvoice = () => {
        if (!invoiceReg) return;
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
                    <div style="font-size:12px;color:#64748b;margin-top:4px">Date : ${invoiceReg.event_date ? new Date(invoiceReg.event_date).toLocaleDateString("fr-FR") : "—"}</div>
                </td>
                <td style="text-align:right">${invoiceData.amount_ht || "-"} ${invoiceData.amount_ht ? "€" : ""}</td>
                <td style="text-align:right;font-weight:700;color:#0f172a">${invoiceData.amount_ttc} €</td>
            </tr>
        </tbody>
    </table>

    <div class="totals">
        ${invoiceData.amount_ht ? `<div class="total-row"><span>Total HT</span><span>${invoiceData.amount_ht} €</span></div>` : ""}
        <div class="total-row total-main"><span>Total TTC</span><span>${invoiceData.amount_ttc} €</span></div>
        ${vatMention ? `<div class="vat-mention-inline">${vatMention}</div>` : ""}
        <div class="acquitted-stamp">Acquittée le ${new Date(invoiceData.invoice_date).toLocaleDateString("fr-FR")}</div>
    </div>

    ${invoiceData.notes ? `<div class="notes"><strong>Notes :</strong><br/>${invoiceData.notes.replace(/\n/g, "<br/>")}</div>` : ""}

    <div class="footer">
        <div>${emitterName} ${legalForm ? " - " + legalForm : ""}</div>
        <div>${emitterAddress.replace(/\n/g, ", ")}</div>
        ${vatMention ? `<div style="margin-top:8px;font-style:italic;font-size:11px;opacity:0.9">${vatMention}</div>` : ""}
        <div style="margin-top:12px;opacity:0.6">Document généré par Rezea</div>
    </div>
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
        if (filterStatuses.length > 0) {
            // "Inscrit" (confirmed) matches both confirmed and pending_payment
            const effectiveStatus = r.status === "pending_payment" ? "confirmed" : r.status;
            if (!filterStatuses.includes(effectiveStatus)) return false;
        }
        if (filterPayments.length > 0 && !filterPayments.includes(r.payment_status)) return false;
        
        // Filter by date range
        if (r.event_date) {
            const rDate = parseISO(r.event_date);
            if (dateRange.start && rDate < parseISO(dateRange.start)) return false;
            if (dateRange.end) {
                 const endLimit = new Date(dateRange.end);
                 endLimit.setHours(23, 59, 59, 999);
                 if (rDate > endLimit) return false;
            }
        }

        // Filter by location
        if (locationFilter.length > 0 && r.event_id) {
             const evt = events.find(e => e.id === r.event_id);
             if (evt && !locationFilter.includes(evt.location || "")) return false;
        }

        return true;
    }).sort((a, b) => {
        // 1. Date (Décroissant)
        const dateA = a.event_date || "";
        const dateB = b.event_date || "";
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        // 2. Heure (Décroissant)
        const timeA = a.event_time || "";
        const timeB = b.event_time || "";
        if (timeA !== timeB) return timeB.localeCompare(timeA);
        // 3. Intitulé
        return (a.event_title || "").localeCompare(b.event_title || "");
    });

    const formatPrice = (cents: number) => {
        if (cents === 0) return "Offert";
        const amount = cents / 100;
        return (amount % 1 === 0 ? amount.toString() : amount.toFixed(2).replace(".", ",")) + " €";
    };

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
        const dateStr = format(new Date(), "yyyy-MM-dd");
        a.download = `export_inscriptions_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getStatusBadge = (reg: AdminEventRegistrationItem) => {
        const base = "px-2 py-1 text-xs font-normal rounded-full border whitespace-nowrap";
        switch (reg.status) {
            case "confirmed": return <span className={`${base} bg-emerald-50 text-emerald-600 border-emerald-100`}>Inscrit</span>;
            case "waiting_list": return <span className={`${base} bg-amber-50 text-amber-600 border-amber-100`}>Sur liste</span>;
            case "cancelled": return <span className={`${base} bg-rose-50 text-rose-600 border-rose-100`}>Annulé</span>;
            case "absent": return <span className={`${base} bg-slate-50 text-slate-600 border-slate-200`}>Absent</span>;
            default: return <span className={`${base} bg-gray-50 text-gray-500 border-gray-200`}>{reg.status}</span>;
        }
    };

    const getPaymentBadge = (reg: AdminEventRegistrationItem) => {
        const base = "px-2 py-1 text-xs font-normal rounded-full border whitespace-nowrap";
        switch (reg.payment_status) {
            case "a_valider": return <span className={`${base} bg-yellow-100 text-yellow-800 border-yellow-200`}>À valider</span>;
            case "en_attente": return <span className={`${base} bg-orange-100 text-orange-800 border-orange-200`}>En attente</span>;
            case "paye": return <span className={`${base} bg-green-100 text-green-800 border-green-200`}>Payé</span>;
            case "rembourse": return <span className={`${base} bg-gray-100 text-gray-600 border-gray-200`}>Remboursé</span>;
            default: return <span className={`${base} bg-gray-100 text-gray-600 border-gray-200`}>{reg.payment_status}</span>;
        }
    };

    const getEditStatusOptions = (currentStatus: string) => {
        if (currentStatus === "event_deleted") {
            return [{ value: "event_deleted", label: "Supprimée" }];
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
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            <Sidebar user={user} />
            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">🎉 Inscriptions aux évènements</h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Suivi des inscriptions et paiements des évènements</p>
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
                        <div className={`p-4 rounded-lg border animate-in fade-in slide-in-from-top-2 ${message.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                            {message.text}
                        </div>
                    )}

                    {/* Search + Filters */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex flex-col md:flex-row gap-3 items-end flex-wrap">
                            <div className="flex-1 min-w-[180px]">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input type="text" placeholder="Nom, titre de l'évènement..."
                                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm placeholder:text-slate-400 trasition-all font-normal" />
                            </div>
                            <div className="w-44">
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
                                    placeholder="Tous"
                                />
                            </div>
                            <div className="w-44">
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
                            {tenant && (tenant.locations || []).length > 1 && (
                                <div className="w-32">
                                    <MultiSelect
                                        label="Lieu(x)"
                                        options={(tenant.locations || []).map(loc => ({ id: loc, label: loc }))}
                                        selected={locationFilter}
                                        onChange={setLocationFilter}
                                        placeholder="Tous"
                                    />
                                </div>
                            )}
                            <div className="flex items-end gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1 text-left">Du</label>
                                    <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-normal" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1 text-left">Au</label>
                                    <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-normal" />
                                </div>
                            </div>
                            <button onClick={handleExport}
                                className="px-3 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg font-medium hover:bg-emerald-100 transition-colors text-sm whitespace-nowrap shadow-sm">
                                📥 Export Excel
                            </button>
                        </div>
                    </div>

                    {/* Registrations Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-100 border-b border-slate-200">
                                    <tr>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Date & heure</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest w-[300px]">Évènement</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">NOM</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest text-center w-24">Tarif</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest text-center w-32">Paiement</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest text-center w-32">Statut</th>
                                        <th className="px-3 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {filteredRegistrations.map((reg) => (
                                        <tr key={reg.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-900 font-livvic">
                                                        {reg.event_date ? new Date(reg.event_date).toLocaleDateString("fr-FR") : "—"}
                                                    </span>
                                                    <span className="text-xs text-slate-500 font-livvic">{reg.event_time}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-slate-900 font-livvic tracking-tight truncate">{reg.event_title}</span>
                                                    {reg.notes && (
                                                        <span title={reg.notes} className="text-blue-400 cursor-help">
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                            </svg>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-sm font-livvic">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-slate-900">{reg.user_name}</span>
                                                    {reg.created_by_admin && <span title="Ajouté par un manager" className="text-amber-500 text-xs">🛡️</span>}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-center text-sm font-medium text-slate-900 font-livvic">
                                                {formatPrice(reg.price_paid_cents)}
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                                {getPaymentBadge(reg)}
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                                {getStatusBadge(reg)}
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-0.5">
                                                    {reg.status !== "event_deleted" && (
                                                        <>
                                                            <button onClick={() => openEdit(reg)} className="p-1 hover:bg-blue-50 text-blue-500 rounded-lg transition-all hover:scale-110" title="Modifier">✏️</button>
                                                            <button onClick={() => openInvoice(reg)} className="p-1 hover:bg-slate-50 text-slate-500 rounded-lg transition-all hover:scale-110" title="Facture">📄</button>
                                                            <button onClick={() => setDeleteConfirmId(reg.id)} className="p-1 hover:bg-rose-50 text-rose-500 rounded-lg transition-all hover:scale-110" title="Supprimer">🗑️</button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredRegistrations.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400 bg-slate-50/20 italic text-sm">
                                                Aucune inscription trouvée pour ces critères.
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden max-h-[90vh]">
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
                            <form onSubmit={handleCreate} id="createRegistrationForm" className="space-y-4">
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${(showErrors && !createForm.user_id) ? 'text-red-500' : 'text-slate-700'}`}>Utilisateur *</label>
                                    <select value={createForm.user_id} onChange={(e) => setCreateForm({ ...createForm, user_id: e.target.value })}
                                        className={`w-full px-4 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all ${(showErrors && !createForm.user_id) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <option value="">Sélectionner un utilisateur...</option>
                                        {users.map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.first_name} {u.last_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${(showErrors && !createForm.event_id) ? 'text-red-500' : 'text-slate-700'}`}>Événement *</label>
                                    <select value={createForm.event_id} onChange={(e) => onEventChange(e.target.value)}
                                        className={`w-full px-4 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all ${(showErrors && !createForm.event_id) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <option value="">Sélectionner un événement...</option>
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
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tarif *</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(() => {
                                            const selectedEvent = events.find(e => e.id === createForm.event_id);
                                            const formatBtnPrice = (cents: number) => {
                                                const amount = cents / 100;
                                                return (amount % 1 === 0 ? amount.toString() : amount.toFixed(2).replace('.', ','));
                                            };
                                            const memberPrice = selectedEvent ? formatBtnPrice(selectedEvent.price_member_cents) : "0";
                                            const externalPrice = selectedEvent ? formatBtnPrice(selectedEvent.price_external_cents) : "0";
                                            
                                            return (
                                                <>
                                                    <button 
                                                        type="button"
                                                        onClick={() => onPriceTypeChange("member")}
                                                        className={`px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${createForm.price_type === "member" ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 border border-gray-200 hover:bg-gray-50"}`}
                                                    >
                                                        Tarif membre ({memberPrice} €)
                                                    </button>
                                                    <button 
                                                        type="button"
                                                        onClick={() => onPriceTypeChange("external")}
                                                        className={`px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${createForm.price_type === "external" ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 border border-gray-200 hover:bg-gray-50"}`}
                                                    >
                                                        Tarif extérieur ({externalPrice} €)
                                                    </button>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Paiement</label>
                                    <select value={createForm.payment_status}
                                        onChange={(e) => setCreateForm({ ...createForm, payment_status: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all hover:border-gray-300">
                                        <option value="a_valider">À valider</option>
                                        <option value="en_attente">En attente</option>
                                        <option value="paye">Payé</option>
                                    </select>
                                </div>
                                <div className="space-y-4 pt-2">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Commentaire interne</label>
                                        <textarea value={createForm.notes} placeholder="Notes visibles uniquement par l'administration..."
                                            onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all hover:border-gray-300" rows={2} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <label className="text-sm font-medium text-slate-700">Note à l'utilisateur</label>
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-[10px] font-bold text-amber-600 border border-amber-100 uppercase tracking-wider">
                                                ⚠️ Commentaire visible dans les commandes de l'utilisateur
                                            </span>
                                        </div>
                                        <textarea value={createForm.user_note} placeholder="Informations à transmettre à l'utilisateur..."
                                            onChange={(e) => setCreateForm({ ...createForm, user_note: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all hover:border-gray-300" rows={2} />
                                    </div>
                                </div>
                            </form>
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button type="button" onClick={() => setShowCreate(false)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">Annuler</button>
                            <button type="submit" form="createRegistrationForm" disabled={saving}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95 disabled:opacity-50">
                                {saving ? "Envoi..." : "Valider l'inscription"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editReg && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">Modifier l&apos;inscription</h3>
                            </div>
                            <button onClick={() => setEditReg(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-lg">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 pb-4">
                            <div className="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 opacity-5 text-4xl">🎉</div>
                                <div className="flex justify-between items-center group">
                                    <span className="text-sm font-medium text-slate-500">Évènement</span>
                                    <span className="text-sm font-semibold text-slate-900">{editReg.event_title}</span>
                                </div>
                                <div className="flex justify-between items-center group">
                                    <span className="text-sm font-medium text-slate-500">Utilisateur</span>
                                    <span className="text-sm font-bold text-emerald-600 px-2 py-1 bg-emerald-50 rounded-lg">{editReg.user_name}</span>
                                </div>
                                <div className="flex justify-between items-start group">
                                    <span className="text-sm font-medium text-slate-500">Date & heure</span>
                                    <div className="text-right">
                                        <span className="text-sm font-semibold text-slate-900 block capitalize">
                                            {editReg.event_date ? format(parseISO(editReg.event_date), "eeee d MMMM", { locale: fr }) : "—"}
                                        </span>
                                        <span className="text-xs text-slate-500 font-medium">à {editReg.event_time}</span>
                                    </div>
                                </div>
                            </div>

                            <form id="editRegistrationForm" onSubmit={handleEditSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && !editForm.status) ? 'text-red-500' : 'text-slate-700'}`}>Statut *</label>
                                        <select value={editForm.status}
                                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                            className={`w-full px-4 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all ${(showErrors && !editForm.status) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                            {getEditStatusOptions(editReg.status).map((opt: any) => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && editForm.price_paid_cents === "") ? 'text-red-500' : 'text-slate-700'}`}>Tarif * (€)</label>
                                        <input type="number" step="0.01" min="0"
                                            value={editForm.price_paid_cents}
                                            onChange={(e) => setEditForm({ ...editForm, price_paid_cents: e.target.value })}
                                            className={`w-full px-4 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all ${(showErrors && editForm.price_paid_cents === "") ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className={`block text-sm font-medium mb-1 ${(showErrors && !editForm.payment_status) ? 'text-red-500' : 'text-slate-700'}`}>Paiement *</label>
                                        <select value={editForm.payment_status}
                                            onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value })}
                                            className={`w-full px-4 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all ${(showErrors && !editForm.payment_status) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                            <option value="a_valider">À valider</option>
                                            <option value="en_attente">En attente</option>
                                            <option value="paye">Payé</option>
                                            <option value="rembourse">Remboursé</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Commentaire interne</label>
                                    <textarea value={editForm.notes} placeholder="Notes visibles uniquement par l'administration..."
                                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all hover:border-gray-300" rows={2} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <label className="text-sm font-medium text-slate-700">Note à l'utilisateur</label>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-[10px] font-bold text-amber-600 border border-amber-100 uppercase tracking-wider">
                                            ⚠️ Commentaire visible dans les commandes de l'utilisateur
                                        </span>
                                    </div>
                                    <textarea value={editForm.user_note} placeholder="Informations à transmettre à l'utilisateur..."
                                        onChange={(e) => setEditForm({ ...editForm, user_note: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all hover:border-gray-300" rows={2} />
                                </div>
                            </form>
                        </div>
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button type="button" onClick={() => setEditReg(null)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm">
                                Annuler
                            </button>
                            <button type="submit" form="editRegistrationForm"
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95">
                                Enregistrer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteConfirmId && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 pb-8">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2 tracking-tight">Confirmer la suppression</h3>
                            <p className="text-slate-500 text-base leading-relaxed">
                                Attention : cette action est irréversible. L&apos;inscription sera définitivement supprimée.
                            </p>
                        </div>
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center">
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
            )}

            {/* Invoice Modal */}
            {invoiceReg && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <div className="text-xl text-slate-400">🧾</div>
                                <h3 className="text-lg font-medium text-slate-900 tracking-tight">Générer une facture</h3>
                            </div>
                            <button onClick={() => setInvoiceReg(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
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
                                            placeholder="Ex: Paiement effectué le..."
                                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 resize-none"
                                            rows={2} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button onClick={() => setInvoiceReg(null)}
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
            )}}}
        </div>
    );
}
