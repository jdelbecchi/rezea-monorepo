"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

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
    description: string | null;
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
    description: "",
};

export default function AdminEventsProgrammingPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [events, setEvents] = useState<EventItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [exportFrom, setExportFrom] = useState("");
    const [exportTo, setExportTo] = useState("");

    useEffect(() => {
        fetchData();
    }, [router]);

    const fetchData = async () => {
        try {
            const [userData, eventsData] = await Promise.all([
                api.getCurrentUser(),
                api.getAdminEvents(),
            ]);
            if (userData.role !== "owner" && userData.role !== "manager") {
                router.push("/dashboard");
                return;
            }
            setUser(userData);
            setEvents(eventsData);
        } catch (err) {
            console.error(err);
            router.push("/login");
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
            
            // Si l'un est vide, on prend la valeur de l'autre pour avoir un tarif unique
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
                description: formData.description || null,
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
            description: event.description || "",
        });
        setEditingId(event.id);
        setShowForm(true);
    };

    const handleDelete = async (eventId: string) => {
        try {
            await api.deleteAdminEvent(eventId);
            const updated = await api.getAdminEvents();
            setEvents(updated);
            setDeleteConfirmId(null);
        } catch (err: any) {
            alert(err.response?.data?.detail || "Erreur lors de la suppression");
        }
    };

    // Sort newest first and filter by search
    const filteredEvents = events
        .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
        .filter((e) => {
            if (!searchTerm) return true;
            const q = searchTerm.toLowerCase();
            return (
                e.title.toLowerCase().includes(q) ||
                (e.description || "").toLowerCase().includes(q) ||
                (e.instructor_name || "").toLowerCase().includes(q)
            );
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
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">🎉 Programmation des évènements</h1>
                            <p className="text-slate-500 mt-1">Planifiez et organisez vos évènements</p>
                        </div>
                        <button
                            onClick={() => { setShowForm(true); setEditingId(null); setFormData({ ...emptyForm }); }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            ➕ Nouveau
                        </button>
                    </div>

                    {/* Search + Export bar */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex flex-col md:flex-row gap-3 items-end">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input
                                    type="text"
                                    placeholder="Intitulé, attribution, description..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                />
                            </div>
                            <div className="flex gap-2 items-end">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Du</label>
                                    <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Au</label>
                                    <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                </div>
                                <button
                                    onClick={handleExport}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors text-sm whitespace-nowrap"
                                >
                                    📥 Exporter Excel
                                </button>
                            </div>
                        </div>
                        {(searchTerm || exportFrom || exportTo) && (
                            <div className="mt-2 text-xs text-slate-500">
                                {filteredEvents.length} événement{filteredEvents.length > 1 ? "s" : ""} affiché{filteredEvents.length > 1 ? "s" : ""}
                                {(exportFrom || exportTo) && (
                                    <span> · Export : {exportFrom || "…"} → {exportTo || "…"}</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Form (shown conditionally) */}
                    {showForm && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <h2 className="text-xl font-bold text-slate-900 mb-4">
                                {editingId ? "Modifier l'événement" : "Créer un événement"}
                            </h2>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Row 1: Date, Heure, Intitulé */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.event_date}
                                            onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Heure *</label>
                                        <input
                                            type="time"
                                            required
                                            value={formData.event_time}
                                            onChange={(e) => setFormData({ ...formData, event_time: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Intitulé *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Ex: Cours de Yoga"
                                        />
                                    </div>
                                </div>

                                {/* Row 2: Durée, Tarifs */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Durée (minutes) *</label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            value={formData.duration_minutes}
                                            onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="60"
                                        />
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

                                {/* Row 3: Attribution, Places */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Attribution (animateur) *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.instructor_name}
                                            onChange={(e) => setFormData({ ...formData, instructor_name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Ex: Jean Dupont"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">places disponibles *</label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            value={formData.max_places}
                                            onChange={(e) => setFormData({ ...formData, max_places: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="20"
                                        />
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        rows={2}
                                        placeholder="Description de l'événement (optionnel)..."
                                    />
                                </div>

                                {/* Buttons */}
                                <div className="flex gap-2">
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
                                        className="px-6 py-2 bg-gray-200 text-slate-900 rounded-lg font-bold hover:bg-gray-300 transition-colors"
                                    >
                                        Annuler
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Events Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Heure</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intitulé</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durée</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarif Membre</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarif Ext.</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attribution</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">places</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inscriptions</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredEvents.map((event) => (
                                        <tr key={event.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                                                {new Date(event.event_date).toLocaleDateString("fr-FR")}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                                                {event.event_time}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-sm font-medium text-slate-900">{event.title}</span>
                                                    {event.description && (
                                                        <span title={event.description} className="text-blue-400 cursor-help">📝</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                                {event.duration_minutes} min
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                                {(event.price_member_cents / 100).toFixed(2)}€
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                                {(event.price_external_cents / 100).toFixed(2)}€
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                                {event.instructor_name}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                                {event.max_places}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-xs font-bold rounded-full ${event.registrations_count >= event.max_places
                                                    ? "bg-red-100 text-red-800"
                                                    : event.registrations_count > 0
                                                        ? "bg-blue-100 text-blue-800"
                                                        : "bg-gray-100 text-gray-600"
                                                    }`}>
                                                    {event.registrations_count}/{event.max_places}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm space-x-1">
                                                <button
                                                    onClick={() => handleEdit(event)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Modifier"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirmId(event.id)}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Supprimer"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredEvents.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                                                {searchTerm ? "Aucun événement ne correspond à la recherche" : "Aucun événement programmé"}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Confirmer la suppression</h3>
                        <p className="text-slate-600 mb-4">
                            Êtes-vous sûr de vouloir supprimer cet événement ? Cette action est irréversible.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirmId)}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
