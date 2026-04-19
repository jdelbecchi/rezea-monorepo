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
        
        // Filter by selected date
        if (selectedDate && !isSameDay(parseISO(r.event_date), selectedDate)) return false;

        // Filter by location
        if (locationFilter !== "all" && r.event_id) {
             // We need to find the event to check its location
             const evt = events.find(e => e.id === r.event_id);
             if (evt && evt.location !== locationFilter) return false;
        }

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
        const dateStr = format(selectedDate, "yyyy-MM-dd");
        a.download = `inscriptions_evenements_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getStatusBadge = (r: AdminEventRegistrationItem) => {
        switch (r.status) {
            case "confirmed":
            case "pending_payment":
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm">inscrit</span>;
            case "waiting_list":
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-blue-50 text-blue-600 border border-blue-100 shadow-sm">sur liste</span>;
            case "cancelled":
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-rose-50 text-rose-600 border border-rose-100 shadow-sm">annulé</span>;
            case "absent":
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-slate-50 text-slate-500 border border-slate-200 shadow-sm">absent</span>;
            case "event_deleted":
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-amber-50 text-amber-600 border border-amber-100 shadow-sm whitespace-nowrap">évènement supprimé</span>;
            default:
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-gray-50 text-gray-500 border border-gray-200 shadow-sm">{r.status}</span>;
        }
    };

    const getPaymentBadge = (r: AdminEventRegistrationItem) => {
        switch (r.payment_status) {
            case "a_valider":
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-amber-50 text-amber-600 border border-amber-100 shadow-sm">à valider</span>;
            case "en_attente":
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-slate-500 border border-slate-200 shadow-sm uppercase tracking-wider">en attente</span>;
            case "paye":
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm">payé</span>;
            case "rembourse":
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm">remboursé</span>;
            default:
                return <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-gray-50 text-gray-500 border border-gray-200 shadow-sm">{r.payment_status}</span>;
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

    const clubColor = tenant?.primary_color;

    return (
        <div className="min-h-screen bg-white flex flex-col md:flex-row overflow-x-hidden">
            <Sidebar user={user} />
            <main className="flex-1 px-5 pb-5 md:p-12 pt-8 md:pt-14">
                <div className="max-w-7xl mx-auto">
                    <div className="md:grid md:grid-cols-[320px_1fr] md:gap-10 items-start">
                        {/* Sidebar avec Calendrier et Filtres */}
                        <aside className="md:sticky md:top-14 space-y-6 mb-8 md:mb-0">
                            <header className="px-1 space-y-1">
                                <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                                    <span className="text-2xl">🎉</span> Inscriptions
                                </h1>
                                <p className="text-slate-500 font-medium text-[11px] md:text-xs uppercase tracking-wider">Gestion des inscrits aux évènements</p>
                            </header>

                            {/* Calendar Card */}
                            <div className="bg-white -mx-5 md:mx-0 rounded-none md:rounded-3xl shadow-xl shadow-slate-200/60 border-b md:border border-slate-100 p-4 md:p-2">
                                <div className="flex items-center justify-between mb-1 px-2">
                                    <h2 className="font-semibold text-slate-800 capitalize text-[13px] md:text-sm">
                                        {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                                    </h2>
                                    <div className="flex gap-1">
                                        <button onClick={handlePrevMonth} className="p-1.5 hover:bg-slate-50 rounded-full text-slate-400 transition-colors">←</button>
                                        <button onClick={handleNextMonth} className="p-1.5 hover:bg-slate-50 rounded-full text-slate-400 transition-colors">→</button>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-7 gap-0.5 md:gap-1">
                                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => (
                                        <div key={i} className="text-center text-[9px] md:text-[10px] font-bold text-slate-400 py-1 uppercase tracking-tight">{day}</div>
                                    ))}
                                    {(() => {
                                        const firstDay = startOfMonth(currentMonth).getDay();
                                        const offset = firstDay === 0 ? 6 : firstDay - 1;
                                        return Array.from({ length: offset }, (_, i) => (
                                            <div key={`empty-${i}`} className="p-1 md:p-2 md:aspect-square" />
                                        ));
                                    })()}
                                    {daysInMonth.map((day, i) => {
                                        const isSelected = isSameDay(day, selectedDate);
                                        const isToday = isSameDay(day, startOfToday());
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handleSetDate(day)}
                                                className={`
                                                    relative py-2 md:py-0 rounded-xl text-xs md:text-sm transition-all flex flex-col items-center justify-center md:aspect-square
                                                    ${isSelected ? 'shadow-lg text-white font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'}
                                                `}
                                                style={{ 
                                                    backgroundColor: isSelected ? clubColor : undefined,
                                                    color: isSelected ? 'white' : (isToday ? clubColor : undefined)
                                                }}
                                            >
                                                <span>{day.getDate()}</span>
                                                {isToday && (
                                                    <div 
                                                        className={`absolute bottom-1 w-3 md:w-5 h-[2px] rounded-full ${isSelected ? 'bg-white' : ''}`}
                                                        style={{ backgroundColor: !isSelected ? clubColor : undefined }}
                                                    ></div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Additional Filters Card */}
                            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4 shadow-sm">
                                <div className="space-y-4">
                                    <div className="flex-1">
                                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">🔍 Recherche</label>
                                        <input type="text" placeholder="Nom, évènement..."
                                            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full px-4 py-3 bg-white border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-200 focus:border-transparent text-sm shadow-sm transition-all" />
                                    </div>

                                    <div className="flex-1">
                                        <MultiSelect
                                            label="Statuts"
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

                                    <div className="flex-1">
                                        <MultiSelect
                                            label="Paiements"
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

                                    <div className="pt-2">
                                        <button onClick={() => { setShowCreate(true); loadFormOptions(); }}
                                            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all font-bold text-sm shadow-xl shadow-slate-200 active:scale-95">
                                            ➕ Inscrire quelqu'un
                                        </button>
                                    </div>

                                    <div className="pt-2">
                                        <button onClick={handleExport}
                                            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white border border-slate-100 text-slate-700 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm shadow-sm active:scale-95">
                                            📥 Export CSV
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </aside>

                        {/* Main Content Area */}
                        <div className="space-y-6 pt-2 md:pt-1">
                            {/* Message */}
                            {message && (
                                <div className={`p-4 rounded-2xl border animate-in fade-in slide-in-from-top-2 shadow-sm ${message.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                                    <div className="flex items-center gap-3">
                                        <span>{message.type === "success" ? "✅" : "⚠️"}</span>
                                        <span className="text-sm font-medium">{message.text}</span>
                                    </div>
                                </div>
                            )}

                            {/* Header avec Date et Location */}
                            <div className="flex items-center justify-between gap-4 px-1 mb-4">
                                <h3 className="font-medium text-slate-400 text-sm lowercase whitespace-nowrap">
                                    {format(selectedDate, 'eeee d MMMM', { locale: fr })}
                                </h3>
                                
                                {tenant && (tenant.locations || []).length > 0 && (
                                    <div className="relative inline-block w-auto shrink-0">
                                        <button 
                                            onClick={() => setIsLocationMenuOpen(!isLocationMenuOpen)}
                                            className="flex items-center justify-between bg-white border border-slate-100 text-slate-600 text-[11px] md:text-[12px] font-medium rounded-2xl px-3 md:px-4 py-2 md:py-2.5 outline-none transition-all cursor-pointer shadow-sm hover:shadow-md hover:border-slate-200 gap-2"
                                        >
                                            <span className="truncate max-w-[100px] md:max-w-[150px]">
                                                {locationFilter === "all" ? "Tous les lieux" : locationFilter}
                                            </span>
                                            <svg className={`w-3 h-3 md:w-4 md:h-4 text-slate-400 transition-transform duration-200 ${isLocationMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {isLocationMenuOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setIsLocationMenuOpen(false)} />
                                                <div className="absolute top-full right-0 mt-2 z-50 w-48 md:w-64 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-200/50 p-2 animate-in fade-in slide-in-from-top-2">
                                                    <button
                                                        onClick={() => { setLocationFilter("all"); setIsLocationMenuOpen(false); }}
                                                        className={`w-full text-left px-4 py-2.5 rounded-xl text-[12px] font-medium transition-colors ${locationFilter === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                                                    >
                                                        Tous les lieux
                                                    </button>
                                                    {(tenant.locations || []).map((loc) => (
                                                        <button
                                                            key={loc}
                                                            onClick={() => { setLocationFilter(loc); setIsLocationMenuOpen(false); }}
                                                            className={`w-full text-left px-4 py-2.5 rounded-xl text-[12px] font-medium transition-colors mt-1 ${locationFilter === loc ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                                                        >
                                                            {loc}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Cards List */}
                            <div className="space-y-4">
                                {filteredRegistrations.map((reg) => (
                                    <div 
                                        key={reg.id} 
                                        className="group bg-white rounded-3xl border transition-all duration-500 hover:shadow-xl flex flex-col overflow-hidden"
                                        style={{ 
                                            boxShadow: `3px 4px 14px -2px ${clubColor}30`,
                                            borderColor: `${clubColor}15`
                                        }}
                                    >
                                        <div className="px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className="text-sm font-bold text-slate-900">{reg.event_time}</span>
                                                    <h4 className="text-base font-bold text-slate-800 truncate">{reg.event_title}</h4>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium text-slate-600">{reg.user_name}</span>
                                                    {reg.created_by_admin && <span title="Ajouté par un manager" className="text-amber-500 text-xs">🛡️</span>}
                                                    {reg.user_phone && <span className="text-xs text-slate-400">📞 {reg.user_phone}</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {getStatusBadge(reg)}
                                                {getPaymentBadge(reg)}
                                                <div className="ml-2 font-bold text-slate-900 text-sm">
                                                    {formatPrice(reg.price_paid_cents)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="px-6 py-3 bg-slate-50/50 flex items-center justify-between border-t border-slate-100/50">
                                            <div className="flex items-center gap-4">
                                                {reg.notes && (
                                                    <div className="flex items-center gap-1.5 text-xs text-blue-500 font-medium bg-blue-50 px-2 py-1 rounded-lg">
                                                        <span>📝</span>
                                                        <span className="truncate max-w-[150px]">{reg.notes}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {reg.status !== "event_deleted" && (
                                                    <>
                                                        <button onClick={() => openEdit(reg)} className="w-9 h-9 flex items-center justify-center bg-white border border-slate-100 rounded-xl text-blue-500 hover:bg-blue-50 transition-all shadow-sm" title="Modifier">✏️</button>
                                                        <button onClick={() => openInvoice(reg)} className="w-9 h-9 flex items-center justify-center bg-white border border-slate-100 rounded-xl text-slate-500 hover:bg-slate-50 transition-all shadow-sm" title="Facture">📄</button>
                                                        <button onClick={() => setDeleteConfirmId(reg.id)} className="w-9 h-9 flex items-center justify-center bg-white border border-slate-100 rounded-xl text-rose-500 hover:bg-rose-50 transition-all shadow-sm" title="Supprimer">🗑️</button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {filteredRegistrations.length === 0 && (
                                    <div className="text-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                                        <div className="text-3xl mb-3">📭</div>
                                        <p className="text-slate-400 text-sm italic font-medium">
                                            Aucune inscription pour cette date et ces critères.
                                        </p>
                                    </div>
                                )}
                            </div>
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
