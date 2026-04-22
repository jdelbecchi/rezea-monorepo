"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
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
    const [locationFilter, setLocationFilter] = useState("all");
    const [tenant, setTenant] = useState<any>(null);

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
            
            const memberVal = memberPriceStr || externalPriceStr || "0";
            const externalVal = externalPriceStr || memberPriceStr || "0";

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
            } else {
                await api.createAdminEvent(data);
            }

            const updated = await api.getAdminEvents();
            setEvents(updated);
            resetForm();
        } catch (err: any) {
            alert(err.response?.data?.detail || "Erreur lors de la sauvegarde");
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
            title: "Annuler l'évènement ?",
            message: `Êtes-vous sûr de vouloir annuler "${event.title}" ? Les participants seront informés et remboursés le cas échéant.`,
            type: 'warning',
            onConfirm: async () => {
                try {
                    await api.cancelAdminEvent(event.id);
                    await fetchData();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                } catch (err) { alert("Erreur lors de l'annulation"); }
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
                } catch (err) { alert("Erreur lors de la réactivation"); }
            }
        });
    };

    const handleDeleteEvent = async (event: EventItem) => {
        setConfirmModal({
            show: true,
            title: "Suppression définitive ?",
            message: `Attention : cette action est irréversible. Toutes les données associées à "${event.title}" seront supprimées.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    await api.deleteAdminEvent(event.id);
                    await fetchData();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                } catch (err) { alert("Erreur lors de la suppression"); }
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
            if (locationFilter !== "all" && e.location !== locationFilter) return false;
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
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
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
                            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium shadow-sm"
                        >
                            ➕ Nouvel évènement
                        </button>
                    </div>

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
                                <div className="w-48">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Lieu</label>
                                    <select 
                                        value={locationFilter} 
                                        onChange={(e) => setLocationFilter(e.target.value)}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-normal transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="all">Tous les lieux</option>
                                        {(tenant.locations || []).map((loc: string) => (
                                            <option key={loc} value={loc}>{loc}</option>
                                        ))}
                                    </select>
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

                    {showForm && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <h2 className="text-xl font-bold text-slate-900 mb-4">
                                {editingId ? "Modifier l'événement" : "Créer un événement"}
                            </h2>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${!formData.event_date ? 'text-red-500' : 'text-slate-700'}`}>Date *</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.event_date}
                                            onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${!formData.event_date ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                                        />
                                    </div>
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${!formData.event_time ? 'text-red-500' : 'text-slate-700'}`}>Heure *</label>
                                        <input
                                            type="time"
                                            required
                                            value={formData.event_time}
                                            onChange={(e) => setFormData({ ...formData, event_time: e.target.value })}
                                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${!formData.event_time ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={`block text-sm font-medium mb-1 ${!formData.title ? 'text-red-500' : 'text-slate-700'}`}>Intitulé *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${!formData.title ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                                            placeholder="Ex: Cours de Yoga"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${!formData.duration_minutes || formData.duration_minutes === "0" ? 'text-red-500' : 'text-slate-700'}`}>Durée *</label>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 relative">
                                                <input 
                                                    type="number" 
                                                    min="0"
                                                    placeholder="HH"
                                                    value={Math.floor(parseInt(formData.duration_minutes || "0") / 60) || ""} 
                                                    onChange={e => {
                                                        const h = parseInt(e.target.value) || 0;
                                                        const m = parseInt(formData.duration_minutes || "0") % 60;
                                                        setFormData({...formData, duration_minutes: (h * 60 + m).toString()});
                                                    }} 
                                                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center ${!formData.duration_minutes || formData.duration_minutes === "0" ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} 
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300 pointer-events-none">H</span>
                                            </div>
                                            <div className="flex-1 relative">
                                                <input 
                                                    type="number" 
                                                    min="0"
                                                    max="59"
                                                    placeholder="MM"
                                                    value={parseInt(formData.duration_minutes || "0") % 60 || ""} 
                                                    onChange={e => {
                                                        const m = Math.min(59, parseInt(e.target.value) || 0);
                                                        const h = Math.floor(parseInt(formData.duration_minutes || "0") / 60);
                                                        setFormData({...formData, duration_minutes: (h * 60 + m).toString()});
                                                    }} 
                                                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center ${!formData.duration_minutes || formData.duration_minutes === "0" ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} 
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300 pointer-events-none">MIN</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Tarif Membre (€)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.price_member_cents}
                                            onChange={(e) => setFormData({ ...formData, price_member_cents: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Tarif Extérieur (€)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.price_external_cents}
                                            onChange={(e) => setFormData({ ...formData, price_external_cents: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="15"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${!formData.instructor_name ? 'text-red-500' : 'text-slate-700'}`}>Attribution (animateur) *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.instructor_name}
                                            onChange={(e) => setFormData({ ...formData, instructor_name: e.target.value })}
                                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${!formData.instructor_name ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                                            placeholder="Ex: Jean Dupont"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Lieu (Salle)</label>
                                        <input
                                            type="text"
                                            value={formData.location}
                                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Ex: Salle 1, Dojo..."
                                        />
                                    </div>
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${!formData.max_places ? 'text-red-500' : 'text-slate-700'}`}>places disponibles *</label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            value={formData.max_places}
                                            onChange={(e) => setFormData({ ...formData, max_places: e.target.value })}
                                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${!formData.max_places ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                                            placeholder="20"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                    <textarea
                                        rows={3}
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                        placeholder="Détails de l'évènement (affichés sur le récapitulatif d'inscription)..."
                                    />
                                </div>

                                <div>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                                    >
                                        {saving ? "Enregistrement..." : editingId ? "Mettre à jour" : "Créer l'événement"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="ml-2 px-6 py-2 bg-gray-200 text-slate-900 rounded-lg font-bold hover:bg-gray-300 transition-colors"
                                    >
                                        Annuler
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">date</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">heure</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest w-[300px]">intitulé</th>
                                        <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">durée</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">lieu</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">attribution</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">tarifs</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">inscriptions</th>
                                        <th className="px-3 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredEvents.map((event) => (
                                        <tr key={event.id} className={`hover:bg-gray-50 transition-all group ${!event.is_active ? 'opacity-50' : ''}`}>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-700">
                                                {new Date(event.event_date).toLocaleDateString("fr-FR")}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{event.event_time}</td>
                                            <td className="px-3 py-4 whitespace-nowrap max-w-[300px] truncate">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-medium text-slate-900 ${!event.is_active ? 'line-through text-slate-400' : ''}`}>{event.title}</span>
                                                    {event.description && event.description.length > 0 && <span title={event.description} className="text-slate-400 text-xs cursor-help">📝</span>}
                                                    <button onClick={() => handleEdit(event)} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">✏️</button>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-500 text-center">{formatDuration(event.duration_minutes)}</td>
                                            <td className="px-3 py-4 whitespace-nowrap">
                                                {event.location ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-600 rounded-lg text-xs font-normal border border-slate-100">
                                                        📍 {event.location}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 text-xs italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-4 text-sm font-normal text-slate-500 whitespace-nowrap">{event.instructor_name || "—"}</td>
                                            <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-700">
                                                <span className="font-medium text-slate-900">{(event.price_member_cents / 100).toFixed(2)}€</span>
                                                <span className="mx-1 text-slate-400">/</span>
                                                <span className="text-slate-500">{(event.price_external_cents / 100).toFixed(2)}€</span>
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap">
                                                <span className="text-sm font-medium text-slate-900">{event.registrations_count}/{event.max_places}</span>
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap text-center flex items-center justify-center gap-0.5">
                                                <button onClick={() => handleEdit(event)} className="p-1 hover:bg-blue-50 text-blue-500 rounded-lg transition-all hover:scale-105" title="Modifier">✏️</button>
                                                {event.is_active ? (
                                                    <button onClick={() => handleCancelEvent(event)} className="p-0.5 hover:bg-amber-50 text-amber-500 rounded-lg transition-all hover:scale-105" title="Annuler">🚫</button>
                                                ) : (
                                                    <button onClick={() => handleReactivateEvent(event)} className="p-0.5 hover:bg-emerald-50 text-emerald-500 rounded-lg transition-all hover:scale-105" title="Réactiver">🔄</button>
                                                )}
                                                <button onClick={() => handleDeleteEvent(event)} className="p-0.5 hover:bg-rose-50 text-rose-500 rounded-lg transition-all hover:scale-105" title="Supprimer">🗑️</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {confirmModal.show && (
                <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl border border-slate-100">
                        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl mb-6 ${
                            confirmModal.type === 'danger' ? 'bg-rose-50 text-rose-500' : 
                            confirmModal.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                            {confirmModal.type === 'danger' ? '⚠️' : confirmModal.type === 'warning' ? '🚫' : '🔄'}
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">{confirmModal.title}</h3>
                        <p className="text-slate-500 font-bold text-sm leading-relaxed mb-8">{confirmModal.message}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))} className="flex-1 px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Annuler</button>
                            <button onClick={confirmModal.onConfirm} className={`flex-1 px-6 py-4 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${
                                confirmModal.type === 'danger' ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-200' : 
                                confirmModal.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-200'
                            }`}>Confirmer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
