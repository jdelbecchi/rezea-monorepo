"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import MultiSelect from "@/components/MultiSelect";
import { formatDuration } from "@/lib/formatters";

interface EventItem {
    id: string;
    event_date: string;
    event_time: string;
    title: string;
    duration_minutes: number;
    price_member_cents: number;
    price_external_cents: number;
    instructor_name: string;
    max_places: number;
    registrations_count: number;
    waitlist_count: number;
    allow_waitlist: boolean;
    location: string | null;
    description: string | null;
    is_active: boolean;
}

const emptyForm = {
    event_date: "",
    event_time: "",
    title: "",
    duration_minutes: "",
    price_member_cents: "",
    price_external_cents: "",
    instructor_name: "",
    max_places: "",
    location: "",
    description: "",
    allow_waitlist: true,
};

const formatPrice = (cents: number) => {
    if (cents === 0) return "Offert";
    const amount = cents / 100;
    return (amount % 1 === 0 ? amount.toString() : amount.toFixed(2).replace(".", ",")) + "€";
};

export default function AdminEventsProgrammingPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [events, setEvents] = useState<EventItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [exportFrom, setExportFrom] = useState("");
    const [exportTo, setExportTo] = useState("");
    const [locationFilter, setLocationFilter] = useState<string[]>([]);
    const [tenant, setTenant] = useState<any>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Confirmation Modal
    const [confirmModal, setConfirmModal] = useState<{
        show: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'danger' | 'warning' | 'info';
    }>({ show: false, title: "", message: "", onConfirm: () => {}, type: 'info' });

    useEffect(() => {
        fetchData();
    }, [router]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Get user and check permissions BEFORE other data
            const userData = await api.getCurrentUser();
            if (userData.role !== "owner" && userData.role !== "manager") {
                router.push("/home");
                return;
            }
            setUser(userData);

            // 2. Fetch other data
            const [eventsData, tenantData] = await Promise.all([
                api.getAdminEvents(),
                api.getTenantSettings(),
            ]);
            setEvents(eventsData);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const memberPriceStr = formData.price_member_cents || "";
            const externalPriceStr = formData.price_external_cents || "";
            
            const memberVal = memberPriceStr.toString().replace(',', '.') || "0";
            const externalVal = externalPriceStr.toString().replace(',', '.') || "0";

            const data = {
                event_date: formData.event_date,
                event_time: formData.event_time,
                title: formData.title,
                duration_minutes: parseInt(formData.duration_minutes),
                price_member_cents: Math.round(parseFloat(memberVal) * 100),
                price_external_cents: Math.round(parseFloat(externalVal) * 100),
                instructor_name: formData.instructor_name,
                max_places: parseInt(formData.max_places),
                location: formData.location || null,
                description: formData.description || null,
                allow_waitlist: formData.allow_waitlist,
            };

            if (editingId) {
                await api.updateAdminEvent(editingId, data);
                setMessage({ type: 'success', text: "Évènement mis à jour avec succès !" });
            } else {
                await api.createAdminEvent(data);
                setMessage({ type: 'success', text: "Évènement créé avec succès !" });
            }

            const updated = await api.getAdminEvents();
            setEvents(updated);
            resetForm();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.response?.data?.detail || "Erreur lors de la sauvegarde" });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (event: EventItem) => {
        setFormData({
            event_date: event.event_date,
            event_time: event.event_time,
            title: event.title,
            duration_minutes: event.duration_minutes.toString(),
            price_member_cents: (event.price_member_cents / 100).toString(),
            price_external_cents: (event.price_external_cents / 100).toString(),
            instructor_name: event.instructor_name,
            max_places: event.max_places.toString(),
            location: event.location || "",
            description: event.description || "",
            allow_waitlist: event.allow_waitlist,
        });
        setEditingId(event.id);
        setShowForm(true);
    };

    const handleCancelEvent = async (event: EventItem) => {
        setConfirmModal({
            show: true,
            title: "Confirmer l'annulation",
            message: `Êtes-vous sûr de vouloir annuler votre évènement "${event.title}" ? Les inscriptions seront également annulées et les participants seront informés.`,
            type: 'warning',
            onConfirm: async () => {
                try {
                    await api.cancelAdminEvent(event.id);
                    await fetchData();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                    setMessage({ type: 'success', text: "Évènement annulé avec succès" });
                } catch (err) { setMessage({ type: 'error', text: "Erreur lors de l'annulation" }); }
            }
        });
    };

    const handleReactivateEvent = async (event: EventItem) => {
        setConfirmModal({
            show: true,
            title: "Réactiver l'évènement ?",
            message: `Souhaitez-vous réactiver "${event.title}" ? Il sera de nouveau visible et réservable.`,
            type: 'info',
            onConfirm: async () => {
                try {
                    await api.reactivateAdminEvent(event.id);
                    await fetchData();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                    setMessage({ type: 'success', text: "Évènement réactivé avec succès" });
                } catch (err) { setMessage({ type: 'error', text: "Erreur lors de la réactivation" }); }
            }
        });
    };

    const handleDeleteEvent = async (event: EventItem) => {
        setConfirmModal({
            show: true,
            title: "Confirmer la suppression",
            message: `Attention : cette action est irréversible. Toutes les données associées à "${event.title}" seront supprimées.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    await api.deleteAdminEvent(event.id);
                    await fetchData();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                    setMessage({ type: 'success', text: "Évènement supprimé avec succès" });
                } catch (err) { setMessage({ type: 'error', text: "Erreur lors de la suppression" }); }
            }
        });
    };

    const filteredEvents = events
        .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
        .filter((e) => {
            if (searchTerm) {
                const q = searchTerm.toLowerCase();
                if (!e.title.toLowerCase().includes(q) && 
                    !(e.description || "").toLowerCase().includes(q) && 
                    !(e.instructor_name || "").toLowerCase().includes(q)) return false;
            }
            if (locationFilter.length > 0 && !(e.location && locationFilter.includes(e.location))) return false;
            return true;
        });

    const handleExport = () => {
        let toExport = [...filteredEvents];
        if (exportFrom) {
            toExport = toExport.filter((e) => e.event_date >= exportFrom);
        }
        if (exportTo) {
            toExport = toExport.filter((e) => e.event_date <= exportTo);
        }
        const BOM = "\uFEFF";
        const header = "Date;Heure;Intitul\u00e9;Dur\u00e9e (min);Tarif Membre;Tarif Ext.;Attribution;Places;Inscrits;Description";
        const rows = toExport.map((e) => [
            new Date(e.event_date).toLocaleDateString("fr-FR"),
            e.event_time,
            e.title,
            e.duration_minutes,
            (e.price_member_cents / 100).toFixed(2),
            (e.price_external_cents / 100).toFixed(2),
            e.instructor_name,
            e.max_places,
            e.registrations_count,
            (e.description || "").replace(/[\n;]/g, " "),
        ].join(";"));
        const csv = BOM + header + "\n" + rows.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `evenements_${exportFrom || "debut"}_${exportTo || "fin"}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const resetForm = () => {
        setFormData({ ...emptyForm });
        setEditingId(null);
        setShowForm(false);
    };

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">🗓️ Programmation des évènements</h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Planifiez et organisez vos évènements</p>
                        </div>
                        <button
                            onClick={() => { setShowForm(true); setEditingId(null); setFormData({ ...emptyForm }); }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-sm text-sm active:scale-95 tracking-tight"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Nouvel évènement
                        </button>
                    </div>

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

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex flex-col md:flex-row gap-3 items-end flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input
                                    type="text"
                                    placeholder="Intitulé, attribution, description..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-normal transition-all placeholder:text-slate-400"
                                />
                            </div>
                            {tenant && (tenant.locations || []).length > 1 && (
                                <div className="flex-1 min-w-[200px]">
                                    <MultiSelect
                                        label="Lieu(x)"
                                        options={(tenant.locations || []).map((loc: string) => ({ id: loc, label: loc }))}
                                        selected={locationFilter}
                                        onChange={setLocationFilter}
                                        placeholder="Tous les lieux"
                                    />
                                </div>
                            )}
                            <div className="flex items-end gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1 text-left">Du</label>
                                    <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)}
                                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1 text-left">Au</label>
                                    <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)}
                                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-normal focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                            </div>
                            <button
                                onClick={handleExport}
                                className="px-3 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg font-medium hover:bg-emerald-100 transition-colors text-sm whitespace-nowrap shadow-sm"
                            >
                                📥 Export Excel
                            </button>
                        </div>
                    </div>



                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-100 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Date & Heure</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest w-[300px]">Évènement</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">Durée</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">Lieu</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">Attribution</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">Tarifs</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">Inscriptions</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {filteredEvents.map((event) => {
                                        const fillPercent = (event.registrations_count / event.max_places) * 100;
                                        return (
                                        <tr key={event.id} className={`hover:bg-slate-50 transition-colors group ${!event.is_active ? 'opacity-50' : ''}`}>
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-900">
                                                        {new Date(event.event_date).toLocaleDateString("fr-FR")}
                                                    </span>
                                                    <span className="text-xs text-slate-500 font-normal">
                                                        {event.event_time || "—"}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 whitespace-nowrap max-w-[300px] truncate">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-medium text-slate-900 ${!event.is_active ? 'line-through text-slate-400' : ''}`}>{event.title}</span>
                                                    {event.description && event.description.length > 0 && (
                                                        <span title={event.description} className="text-slate-400 hover:text-slate-600 transition-colors cursor-help">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                            </svg>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-500 text-center">{formatDuration(event.duration_minutes)}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-center">
                                                {event.location ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg text-xs font-normal border border-slate-100">
                                                        📍 {event.location}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 text-xs italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-sm font-normal text-slate-500 whitespace-nowrap text-center">{event.instructor_name || "—"}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-700 text-center">
                                                <span className="font-medium text-slate-900">{formatPrice(event.price_member_cents)}</span>
                                                <span className="mx-1 text-slate-400">/</span>
                                                <span className="text-slate-500">{formatPrice(event.price_external_cents)}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                                <span className={`inline-flex items-center justify-center px-4 py-1 rounded-full text-xs font-normal border ${
                                                    event.registrations_count === 0 
                                                        ? "bg-slate-50 text-slate-400 border-slate-100" 
                                                        : fillPercent >= 100
                                                            ? "bg-emerald-50 text-emerald-900 border-emerald-200 font-bold"
                                                            : fillPercent > 70 
                                                                ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                                                                : fillPercent >= 40 
                                                                    ? "bg-blue-50 text-blue-500 border-blue-100"
                                                                    : "bg-amber-50 text-amber-600 border-amber-100"
                                                }`}>
                                                    {event.registrations_count}/{event.max_places}
                                                    {event.allow_waitlist && (event.waitlist_count ?? 0) > 0 && (
                                                        <span className="flex items-center gap-0.5 ml-1 text-orange-600" title="Liste d'attente">
                                                            <span>⏳</span>
                                                            <span className="text-xs">({event.waitlist_count})</span>
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right flex items-center justify-end gap-0.5 whitespace-nowrap">
                                                <button onClick={() => handleEdit(event)} className="p-1 hover:bg-blue-50 text-blue-500 rounded-lg transition-all hover:scale-110" title="Modifier">✏️</button>
                                                {event.is_active ? (
                                                    <button onClick={() => handleCancelEvent(event)} className="p-1 hover:bg-amber-50 text-amber-500 rounded-lg transition-all hover:scale-110" title="Annuler">🚫</button>
                                                ) : (
                                                    <button onClick={() => handleReactivateEvent(event)} className="p-1 hover:bg-emerald-50 text-emerald-500 rounded-lg transition-all hover:scale-110" title="Réactiver">🔄</button>
                                                )}
                                                <button onClick={() => handleDeleteEvent(event)} className="p-1 hover:bg-rose-50 text-rose-500 rounded-lg transition-all hover:scale-110" title="Supprimer">🗑️</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {showForm && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                {editingId ? (
                                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                )}
                                <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">
                                    {editingId ? "Modifier l'évènement" : "Nouvel évènement"}
                                </h3>
                            </div>
                            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-slate-50 rounded-lg">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-8">
                            <form id="eventForm" onSubmit={handleSubmit} className="space-y-8">
                                {/* Section: Informations générales */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Intitulé *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.title}
                                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="Ex: Soirée Portes Ouvertes..."
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none transition-all hover:border-gray-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Lieu / Salle</label>
                                        <select
                                            value={formData.location}
                                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 appearance-none cursor-pointer"
                                        >
                                            <option value="">Aucun lieu spécifique</option>
                                            {(tenant?.locations || []).map((loc: string) => (
                                                <option key={loc} value={loc}>{loc}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2 space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Description</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Détails de l'évènement..."
                                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 min-h-[80px] resize-none"
                                            rows={2}
                                        />
                                    </div>
                                </div>

                                {/* Section: Planification */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Date *</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.event_date}
                                            onChange={e => setFormData({ ...formData, event_date: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Heure *</label>
                                        <input
                                            type="time"
                                            required
                                            value={formData.event_time}
                                            onChange={e => setFormData({ ...formData, event_time: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Durée *</label>
                                        <input
                                            type="time"
                                            required
                                            value={formData.duration_minutes ? `${Math.floor(formData.duration_minutes / 60).toString().padStart(2, '0')}:${(formData.duration_minutes % 60).toString().padStart(2, '0')}` : ""}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (!val) return;
                                                const [h, m] = val.split(':').map(Number);
                                                setFormData({ ...formData, duration_minutes: (h || 0) * 60 + (m || 0) });
                                            }}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300 appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>

                                {/* Section: Logistique */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Attribution (Intervenant)</label>
                                        <input
                                            type="text"
                                            value={formData.instructor_name}
                                            onChange={e => setFormData({ ...formData, instructor_name: e.target.value })}
                                            placeholder="Ex: Jean Expert"
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                        />
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Capacité *</label>
                                            <input
                                                type="number"
                                                min="1"
                                                required
                                                value={formData.max_places}
                                                onChange={e => setFormData({ ...formData, max_places: parseInt(e.target.value) || 0 })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                                placeholder="Capacité max"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 pl-1">
                                            <input
                                                type="checkbox"
                                                id="allow_waitlist"
                                                checked={formData.allow_waitlist}
                                                onChange={e => setFormData({ ...formData, allow_waitlist: e.target.checked })}
                                                className="w-4 h-4 rounded-md border-gray-300 text-slate-900 focus:ring-slate-500 cursor-pointer"
                                            />
                                            <label htmlFor="allow_waitlist" className="text-xs font-medium text-slate-500 cursor-pointer select-none">
                                                Autoriser la liste d'attente
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b pb-1">Tarification</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Tarif membre (€) *</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                required
                                                value={formData.price_member_cents}
                                                onChange={e => setFormData({ ...formData, price_member_cents: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700">Tarif extérieur (€) *</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                required
                                                value={formData.price_external_cents}
                                                onChange={e => setFormData({ ...formData, price_external_cents: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none transition-all hover:border-gray-300"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button
                                type="button"
                                onClick={resetForm}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm"
                            >
                                Annuler
                            </button>
                            <button
                                type="submit"
                                form="eventForm"
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm"
                            >
                                {editingId ? "Enregistrer les modifications" : "Créer l'évènement"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmModal.show && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 pb-8">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2 tracking-tight">{confirmModal.title}</h3>
                            <p className="text-slate-500 text-sm font-normal leading-relaxed">{confirmModal.message}</p>
                        </div>
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center">
                            <button 
                                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={confirmModal.onConfirm}
                                className={`px-6 py-2.5 text-white rounded-xl font-medium transition-all text-sm shadow-sm active:scale-95 ${
                                    confirmModal.type === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 
                                    confirmModal.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-900 hover:bg-slate-800'
                                }`}
                            >
                                Confirmer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
