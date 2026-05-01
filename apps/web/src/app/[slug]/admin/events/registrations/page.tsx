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
    const [locationFilter, setLocationFilter] = useState("all");
    const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);

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
    const [dateRange, setDateRange] = useState({ start: "", end: "" });
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
        if (locationFilter !== "all" && r.event_id) {
             const evt = events.find(e => e.id === r.event_id);
             if (evt && evt.location !== locationFilter) return false;
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
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />
            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">🎉 Inscriptions aux évènements</h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Gestion des inscrits et des règlements</p>
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
                                <div className="min-w-[140px]">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Lieu</label>
                                    <select 
                                        value={locationFilter} 
                                        onChange={(e) => setLocationFilter(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-normal transition-all cursor-pointer"
                                    >
                                        <option value="all">Tous les lieux</option>
                                        {(tenant.locations || []).map(loc => (
                                            <option key={loc} value={loc}>{loc}</option>
                                        ))}
                                    </select>
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
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Date</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest w-[300px]">Évènement</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">NOM</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest text-center w-24">Tarif</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest text-center w-32">Paiement</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest text-center w-32">Statut</th>
                                        <th className="px-3 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {filteredRegistrations.map((reg) => (
                                        <tr key={reg.id} className="hover:bg-gray-50 transition-all group">
                                            <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-600 font-medium font-livvic">
                                                {reg.event_date ? new Date(reg.event_date).toLocaleDateString("fr-FR") : "—"}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-900 font-livvic tracking-tight truncate">{reg.event_title}</span>
                                                    <span className="text-xs text-slate-500 font-livvic">{reg.event_time}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm font-livvic">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-slate-900">{reg.user_name}</span>
                                                    {reg.created_by_admin && <span title="Ajouté par un manager" className="text-amber-500 text-xs">🛡️</span>}
                                                </div>
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-center text-sm font-medium text-slate-900 font-livvic">
                                                {formatPrice(reg.price_paid_cents)}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-center">
                                                {getPaymentBadge(reg)}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-center">
                                                {getStatusBadge(reg)}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-center">
                                                <div className="flex items-center justify-center gap-0.5">
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
                    <div className="bg-white rounded-3xl p-10 max-w-xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-2xl font-semibold text-slate-900 tracking-tight">➕ Nouvelle inscription</h3>
                            <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Utilisateur *</label>
                                    <select required value={createForm.user_id} onChange={(e) => setCreateForm({ ...createForm, user_id: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all">
                                        <option value="">Sélectionner un utilisateur...</option>
                                        {users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Événement *</label>
                                    <select required value={createForm.event_id} onChange={(e) => onEventChange(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all">
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
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tarif (€)</label>
                                        <input type="number" step="0.01" min="0" placeholder="0.00"
                                            value={(createForm.price_paid_cents / 100).toFixed(2)}
                                            onChange={(e) => setCreateForm({ ...createForm, price_paid_cents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Règlement</label>
                                        <select value={createForm.payment_status}
                                            onChange={(e) => setCreateForm({ ...createForm, payment_status: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all">
                                            <option value="a_valider">⏳ À valider</option>
                                            <option value="en_attente">📁 En attente</option>
                                            <option value="paye">💰 Payé</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Notes internes</label>
                                    <textarea value={createForm.notes} placeholder="Détails facultatifs..."
                                        onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all" rows={3} />
                                </div>
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                                <button type="button" onClick={() => setShowCreate(false)}
                                    className="px-6 py-2 text-slate-500 font-medium hover:text-slate-700 transition-colors">Annuler</button>
                                <button type="submit" disabled={saving}
                                    className="px-8 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-all shadow-lg active:scale-95 disabled:opacity-50">
                                    {saving ? "Envoi..." : "Inscrire le client"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editReg && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-10 max-w-xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-2xl font-semibold text-slate-900 tracking-tight">Modifier l&apos;inscription</h3>
                            <button onClick={() => setEditReg(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="mb-8 p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-1">
                            <div className="flex justify-between items-center text-sm font-medium">
                                <span className="text-slate-500">Événement</span>
                                <span className="text-slate-900">{editReg.event_title}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-medium">
                                <span className="text-slate-500">Utilisateur</span>
                                <span className="text-slate-900 font-bold">{editReg.user_name}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-medium">
                                <span className="text-slate-500">Date & Heure</span>
                                <span className="text-slate-900 capitalize">{editReg.event_date ? new Date(editReg.event_date).toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'long' }) : "—"} à {editReg.event_time}</span>
                            </div>
                        </div>

                        <form onSubmit={handleEditSubmit} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Statut</label>
                                    <select value={editForm.status}
                                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all">
                                        {getEditStatusOptions(editReg.status).map((opt: any) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tarif (€)</label>
                                    <input type="number" step="0.01" min="0"
                                        value={(editForm.price_paid_cents / 100).toFixed(2)}
                                        onChange={(e) => setEditForm({ ...editForm, price_paid_cents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Paiement</label>
                                    <select value={editForm.payment_status}
                                        onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all">
                                        <option value="a_valider">⏳ À valider</option>
                                        <option value="en_attente">📁 En attente</option>
                                        <option value="paye">💰 Payé</option>
                                        <option value="rembourse">↩️ Remboursé</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Notes internes</label>
                                <textarea value={editForm.notes}
                                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all" rows={2} />
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                                <button type="button" onClick={() => setEditReg(null)}
                                    className="px-6 py-2 text-slate-500 font-medium hover:text-slate-700 transition-colors">Annuler</button>
                                <button type="submit"
                                    className="px-8 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                                    Enregistrer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center">
                        <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6 text-rose-500 text-3xl">
                            🗑️
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-2">Supprimer l&apos;inscription ?</h3>
                        <p className="text-slate-500 mb-8 leading-relaxed">
                            Cette action est définitive. La place sera libérée pour d&apos;autres clients.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => setDeleteConfirmId(null)}
                                className="px-6 py-2 text-slate-500 font-medium hover:text-slate-700 transition-colors">Annuler</button>
                            <button onClick={() => handleDelete(deleteConfirmId)}
                                className="px-8 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-900/10 active:scale-95">
                                Oui, supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Invoice Modal */}
            {invoiceReg && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-10 max-w-xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-2xl font-semibold text-slate-900 tracking-tight">📄 Générer une facture</h3>
                            <button onClick={() => setInvoiceReg(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">N° Facture</label>
                                    <input type="text" value={invoiceData.invoice_number} onChange={(e) => setInvoiceData({ ...invoiceData, invoice_number: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Date</label>
                                    <input type="date" value={invoiceData.invoice_date} onChange={(e) => setInvoiceData({ ...invoiceData, invoice_date: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Émetteur</label>
                                <input type="text" value={invoiceData.emitter} onChange={(e) => setInvoiceData({ ...invoiceData, emitter: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Destinataire</label>
                                <input type="text" value={invoiceData.recipient} onChange={(e) => setInvoiceData({ ...invoiceData, recipient: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Notes (sur la facture)</label>
                                <textarea value={invoiceData.notes} onChange={(e) => setInvoiceData({ ...invoiceData, notes: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all" rows={2} />
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                                <button onClick={() => setInvoiceReg(null)}
                                    className="px-6 py-2 text-slate-500 font-medium hover:text-slate-700 transition-colors">Annuler</button>
                                <button onClick={downloadInvoice}
                                    className="px-8 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                                    Télécharger le PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
