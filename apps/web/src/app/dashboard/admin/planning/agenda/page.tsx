"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

interface AgendaItem {
    id: string;
    type: "session" | "event";
    title: string;
    description?: string;
    activity_type?: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
    duration_minutes: number;
    start_time?: string;
    end_time?: string;
    // Session fields
    max_participants?: number;
    current_participants?: number;
    credits_required?: number;
    // Event fields
    instructor_name?: string;
    price_member_cents?: number;
    price_external_cents?: number;
    max_places?: number;
    registrations_count?: number;
    // Common
    registered_users: { first_name: string; last_name: string }[];
}

type RecurrenceType = "none" | "daily" | "weekly" | "monthly";

const emptyForm = {
    title: "",
    description: "",
    instructor_name: "",
    date: "",
    time: "",
    duration_minutes: 60,
    max_participants: 10,
    credits_required: 1,
    recurrence: "none" as RecurrenceType,
    recurrence_count: 4,
};

type ViewMode = "week" | "month";

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

function getMonday(d: Date): Date {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
}

function formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

export default function AdminPlanningAgendaPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<AgendaItem[]>([]);
    const [viewMode, setViewMode] = useState<ViewMode>("week");
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [search, setSearch] = useState("");
    const [selectedItem, setSelectedItem] = useState<AgendaItem | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<{ id: string; type: string } | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [duplicateData, setDuplicateData] = useState({
        source_start: "",
        source_end: "",
        target_start: "",
    });

    // Compute date range
    const { startDate, endDate, days } = useMemo(() => {
        if (viewMode === "week") {
            const monday = getMonday(currentDate);
            const sunday = addDays(monday, 6);
            const dArr: Date[] = [];
            for (let i = 0; i < 7; i++) dArr.push(addDays(monday, i));
            return { startDate: monday, endDate: sunday, days: dArr };
        } else {
            const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            // Extend to full weeks
            const startMonday = getMonday(first);
            const endSunday = addDays(getMonday(addDays(last, 6)), 6);
            const dArr: Date[] = [];
            let d = new Date(startMonday);
            while (d <= endSunday) {
                dArr.push(new Date(d));
                d = addDays(d, 1);
            }
            return { startDate: startMonday, endDate: endSunday, days: dArr };
        }
    }, [viewMode, currentDate]);

    const fetchData = useCallback(async () => {
        try {
            const userData = await api.getCurrentUser();
            if (userData.role !== "owner" && userData.role !== "manager") {
                router.push("/dashboard");
                return;
            }
            setUser(userData);

            const data = await api.getAdminAgenda(
                formatDate(startDate),
                formatDate(endDate),
                search || undefined
            );

            const allItems: AgendaItem[] = [
                ...data.sessions,
                ...data.events,
            ];
            setItems(allItems);
        } catch (err) {
            console.error(err);
            if (!user) router.push("/login");
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, search]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const navigate = (direction: number) => {
        if (viewMode === "week") {
            setCurrentDate(addDays(currentDate, direction * 7));
        } else {
            const d = new Date(currentDate);
            d.setMonth(d.getMonth() + direction);
            setCurrentDate(d);
        }
    };

    const goToday = () => setCurrentDate(new Date());

    const getItemsForDate = (dateStr: string) =>
        items.filter((it) => it.date === dateStr).sort((a, b) => a.time.localeCompare(b.time));

    const handleDeleteSession = async (id: string) => {
        try {
            await api.deleteSession(id);
            setDeleteConfirmId(null);
            setSelectedItem(null);
            await fetchData();
        } catch (err: any) {
            alert(err.response?.data?.detail || "Erreur lors de la suppression");
        }
    };

    const handleDeleteEvent = async (id: string) => {
        try {
            await api.deleteAdminEvent(id);
            setDeleteConfirmId(null);
            setSelectedItem(null);
            await fetchData();
        } catch (err: any) {
            alert(err.response?.data?.detail || "Erreur lors de la suppression");
        }
    };

    const handleDelete = () => {
        if (!deleteConfirmId) return;
        if (deleteConfirmId.type === "session") {
            handleDeleteSession(deleteConfirmId.id);
        } else {
            handleDeleteEvent(deleteConfirmId.id);
        }
    };

    const handleSaveSession = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);
        try {
            const startDt = new Date(`${formData.date}T${formData.time}:00`);
            const endDt = new Date(startDt.getTime() + formData.duration_minutes * 60000);

            // Create payload
            const payload = {
                title: formData.title,
                description: formData.description || "",
                instructor_name: formData.instructor_name || "",
                activity_type: "",
                start_time: startDt.toISOString(),
                end_time: endDt.toISOString(),
                max_participants: formData.max_participants,
                credits_required: formData.credits_required,
                allow_waitlist: true,
            };

            await api.createSession(payload);
            
            // Handle recurrence
            if (formData.recurrence !== "none" && formData.recurrence_count > 1) {
                for (let i = 1; i < formData.recurrence_count; i++) {
                    const rStart = new Date(startDt);
                    const rEnd = new Date(endDt);
                    if (formData.recurrence === "daily") {
                        rStart.setDate(rStart.getDate() + i);
                        rEnd.setDate(rEnd.getDate() + i);
                    } else if (formData.recurrence === "weekly") {
                        rStart.setDate(rStart.getDate() + i * 7);
                        rEnd.setDate(rEnd.getDate() + i * 7);
                    } else if (formData.recurrence === "monthly") {
                        rStart.setMonth(rStart.getMonth() + i);
                        rEnd.setMonth(rEnd.getMonth() + i);
                    }
                    await api.createSession({
                        ...payload,
                        start_time: rStart.toISOString(),
                        end_time: rEnd.toISOString(),
                    });
                }
            }

            setShowForm(false);
            setFormData({ ...emptyForm });
            setMessage({ type: "success", text: "Séance(s) créée(s) avec succès !" });
            await fetchData();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la création" });
        } finally {
            setSaving(false);
        }
    };

    const handleDuplicate = async () => {
        if (!duplicateData.source_start || !duplicateData.source_end || !duplicateData.target_start) {
            alert("Veuillez remplir tous les champs.");
            return;
        }
        try {
            const res = await api.duplicateSessions({
                source_start: `${duplicateData.source_start}T00:00:00`,
                source_end: `${duplicateData.source_end}T23:59:59`,
                target_start: `${duplicateData.target_start}T00:00:00`,
            });
            setShowDuplicateModal(false);
            setMessage({ type: "success", text: `${res.count} séances dupliquées avec succès !` });
            await fetchData();
        } catch (err: any) {
            alert("Erreur lors de la duplication.");
        }
    };

    // Header period display
    const periodLabel = useMemo(() => {
        if (viewMode === "week") {
            const mon = getMonday(currentDate);
            const sun = addDays(mon, 6);
            const monStr = mon.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
            const sunStr = sun.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
            return `${monStr} — ${sunStr}`;
        } else {
            return `${MONTHS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        }
    }, [viewMode, currentDate]);

    const todayStr = formatDate(new Date());

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-6 overflow-auto">
                <div className="max-w-full mx-auto space-y-4">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">📋 Agenda</h1>
                            <div className="flex items-center gap-4 mt-1">
                                <p className="text-slate-500">{periodLabel}</p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => { setShowDuplicateModal(true); setDuplicateData({ source_start: "", source_end: "", target_start: "" }); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-xs font-medium"
                                    >
                                        📋 Dupliquer
                                    </button>
                                    <button
                                        onClick={() => { setShowForm(true); setFormData({ ...emptyForm }); setMessage(null); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
                                    >
                                        ➕ Nouvelle séance
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            {/* Search */}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Rechercher..."
                                    className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-52"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                            </div>
                            {/* Navigation */}
                            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg">
                                <button onClick={() => navigate(-1)} className="px-3 py-2 hover:bg-gray-100 rounded-l-lg text-sm font-medium">←</button>
                                <button onClick={goToday} className="px-3 py-2 hover:bg-gray-100 text-sm font-medium">Aujourd&apos;hui</button>
                                <button onClick={() => navigate(1)} className="px-3 py-2 hover:bg-gray-100 rounded-r-lg text-sm font-medium">→</button>
                            </div>
                            {/* View toggle */}
                            <div className="flex bg-white border border-gray-200 rounded-lg">
                                <button
                                    onClick={() => setViewMode("week")}
                                    className={`px-4 py-2 text-sm font-medium rounded-l-lg transition-colors ${viewMode === "week" ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}
                                >
                                    Semaine
                                </button>
                                <button
                                    onClick={() => setViewMode("month")}
                                    className={`px-4 py-2 text-sm font-medium rounded-r-lg transition-colors ${viewMode === "month" ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}
                                >
                                    Mois
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span> Séance
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded-full bg-purple-500 inline-block"></span> Événement
                        </span>
                    </div>

                    {/* Calendar Grid */}
                    {viewMode === "week" ? (
                        <WeekView
                            days={days}
                            todayStr={todayStr}
                            getItemsForDate={getItemsForDate}
                            onSelectItem={setSelectedItem}
                        />
                    ) : (
                        <MonthView
                            days={days}
                            todayStr={todayStr}
                            currentMonth={currentDate.getMonth()}
                            getItemsForDate={getItemsForDate}
                            onSelectItem={setSelectedItem}
                        />
                    )}
                </div>
            </main>

            {/* Detail Panel */}
            {selectedItem && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedItem(null)}>
                    <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 text-xs font-bold rounded-full ${selectedItem.type === "session" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}`}>
                                    {selectedItem.type === "session" ? "🏋️ Séance" : "🎉 Événement"}
                                </span>
                            </div>
                            <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                        </div>

                        <h3 className="text-xl font-bold text-slate-900 mb-1">{selectedItem.title}</h3>
                        {selectedItem.description && (
                            <p className="text-slate-500 text-sm mb-3">{selectedItem.description}</p>
                        )}

                        <div className="space-y-2 text-sm text-slate-700 mb-4">
                            <div className="flex justify-between">
                                <span className="text-slate-500">📅 Date</span>
                                <span className="font-medium">{new Date(selectedItem.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">🕐 Heure</span>
                                <span className="font-medium">{selectedItem.time}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">⏱️ Durée</span>
                                <span className="font-medium">{selectedItem.duration_minutes} min</span>
                            </div>
                            {selectedItem.type === "session" && selectedItem.activity_type && (
                                <div className="flex justify-between">
                                    <span className="text-slate-500">🏷️ Type</span>
                                    <span className="font-medium">{selectedItem.activity_type}</span>
                                </div>
                            )}
                            {selectedItem.type === "session" && (
                                <div className="flex justify-between">
                                    <span className="text-slate-500">👥 Places</span>
                                    <span className="font-medium">{selectedItem.current_participants}/{selectedItem.max_participants}</span>
                                </div>
                            )}
                            {selectedItem.type === "event" && (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">👤 Animateur</span>
                                        <span className="font-medium">{selectedItem.instructor_name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">👥 Places</span>
                                        <span className="font-medium">{selectedItem.registrations_count}/{selectedItem.max_places}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">💰 Tarif membre</span>
                                        <span className="font-medium">{((selectedItem.price_member_cents || 0) / 100).toFixed(2)}€</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">💰 Tarif extérieur</span>
                                        <span className="font-medium">{((selectedItem.price_external_cents || 0) / 100).toFixed(2)}€</span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Registered users */}
                        {selectedItem.registered_users.length > 0 && (
                            <div className="mb-4">
                                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                    Inscrits ({selectedItem.registered_users.length})
                                </h4>
                                <div className="space-y-1">
                                    {selectedItem.registered_users.map((u, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                                            <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                                {u.first_name[0]}{u.last_name[0]}
                                            </span>
                                            {u.first_name} {u.last_name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {selectedItem.registered_users.length === 0 && (
                            <p className="text-sm text-slate-400 mb-4 italic">Aucun inscrit</p>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2 border-t border-gray-100">
                            <button
                                onClick={() => {
                                    setSelectedItem(null);
                                    if (selectedItem.type === "session") {
                                        router.push(`/dashboard/admin/planning/sessions?edit=${selectedItem.id}`);
                                    } else {
                                        router.push(`/dashboard/admin/events/programming?edit=${selectedItem.id}`);
                                    }
                                }}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm text-center"
                            >
                                ✏️ Modifier
                            </button>
                            <button
                                onClick={() => setDeleteConfirmId({ id: selectedItem.id, type: selectedItem.type })}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 text-sm text-center"
                            >
                                🗑️ Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                    <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Confirmer la suppression</h3>
                        <p className="text-slate-600 mb-4">
                            {deleteConfirmId.type === "session"
                                ? "Cette séance sera désactivée et n'apparaîtra plus dans l'agenda."
                                : "Cet événement sera définitivement supprimé."}
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Session Creation Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4 overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8 animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Nouvelle séance</h3>
                                <p className="text-xs text-slate-500 mt-1">Créez une séance individuelle ou une récurrence</p>
                            </div>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
                        </div>
                        
                        <form onSubmit={handleSaveSession}>
                            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                                {message && (
                                    <div className={`p-4 rounded-lg border ${message.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                                        {message.text}
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Intitulé *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Ex: Yoga Vinyasa, Cross-training..."
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20"
                                            placeholder="Détails de la séance..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Intervenant</label>
                                        <input
                                            type="text"
                                            value={formData.instructor_name}
                                            onChange={(e) => setFormData({ ...formData, instructor_name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Nom du coach"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                                            <input
                                                type="date"
                                                required
                                                value={formData.date}
                                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Heure *</label>
                                            <input
                                                type="time"
                                                required
                                                value={formData.time}
                                                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Durée (min) *</label>
                                        <input
                                            type="number"
                                            required
                                            min="5"
                                            value={formData.duration_minutes}
                                            onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Capacité *</label>
                                            <input
                                                type="number"
                                                required
                                                min="1"
                                                value={formData.max_participants}
                                                onChange={(e) => setFormData({ ...formData, max_participants: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Crédits *</label>
                                            <input
                                                type="number"
                                                required
                                                step="0.1"
                                                min="0"
                                                value={formData.credits_required}
                                                onChange={(e) => setFormData({ ...formData, credits_required: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-4">
                                    <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">🔄 Récurrence</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-blue-700 mb-1">Type de récurrence</label>
                                            <select
                                                value={formData.recurrence}
                                                onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as RecurrenceType })}
                                                className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                            >
                                                <option value="none">Aucune</option>
                                                <option value="daily">Quotidienne</option>
                                                <option value="weekly">Hebdomadaire</option>
                                                <option value="monthly">Mensuelle</option>
                                            </select>
                                        </div>
                                        {formData.recurrence !== "none" && (
                                            <div>
                                                <label className="block text-xs font-semibold text-blue-700 mb-1">Nombre d&apos;occurrences</label>
                                                <input
                                                    type="number"
                                                    min="2"
                                                    max="52"
                                                    value={formData.recurrence_count}
                                                    onChange={(e) => setFormData({ ...formData, recurrence_count: parseInt(e.target.value) || 2 })}
                                                    className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 border-t border-gray-100 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="px-4 py-2 bg-white text-slate-700 border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {saving ? "Création..." : "Créer la séance"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Duplication Modal */}
            {showDuplicateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Dupliquer des séances</h3>
                                <p className="text-xs text-slate-500 mt-1">Copier un planning vers une nouvelle période</p>
                            </div>
                            <button onClick={() => setShowDuplicateModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Période Source</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">Du</label>
                                        <input
                                            type="date"
                                            value={duplicateData.source_start}
                                            onChange={(e) => setDuplicateData({...duplicateData, source_start: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">Au</label>
                                        <input
                                            type="date"
                                            value={duplicateData.source_end}
                                            onChange={(e) => setDuplicateData({...duplicateData, source_end: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100 space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Destination</h4>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Date de début cible</label>
                                    <input
                                        type="date"
                                        value={duplicateData.target_start}
                                        onChange={(e) => setDuplicateData({...duplicateData, target_start: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-gray-100 flex gap-3">
                            <button
                                onClick={() => setShowDuplicateModal(false)}
                                className="flex-1 px-4 py-2 bg-white text-slate-700 border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleDuplicate}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
                            >
                                Dupliquer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


// ==================== WEEK VIEW ====================

function WeekView({
    days,
    todayStr,
    getItemsForDate,
    onSelectItem,
}: {
    days: Date[];
    todayStr: string;
    getItemsForDate: (d: string) => AgendaItem[];
    onSelectItem: (item: AgendaItem) => void;
}) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-7 divide-x divide-gray-100">
                {days.map((day) => {
                    const dateStr = formatDate(day);
                    const isToday = dateStr === todayStr;
                    const dayItems = getItemsForDate(dateStr);

                    return (
                        <div key={dateStr} className="min-h-[500px]">
                            {/* Day header */}
                            <div className={`px-2 py-3 text-center border-b border-gray-100 ${isToday ? "bg-blue-50" : "bg-gray-50"}`}>
                                <div className="text-xs font-medium text-slate-500 uppercase">{DAYS_FR[day.getDay() === 0 ? 6 : day.getDay() - 1]}</div>
                                <div className={`text-lg font-bold mt-0.5 ${isToday ? "text-blue-600 bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center mx-auto" : "text-slate-900"}`}>
                                    {day.getDate()}
                                </div>
                            </div>
                            {/* Items */}
                            <div className="p-1 space-y-1">
                                {dayItems.map((item) => (
                                    <AgendaCard key={`${item.type}-${item.id}`} item={item} onClick={() => onSelectItem(item)} compact={false} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


// ==================== MONTH VIEW ====================

function MonthView({
    days,
    todayStr,
    currentMonth,
    getItemsForDate,
    onSelectItem,
}: {
    days: Date[];
    todayStr: string;
    currentMonth: number;
    getItemsForDate: (d: string) => AgendaItem[];
    onSelectItem: (item: AgendaItem) => void;
}) {
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7));
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-7 divide-x divide-gray-100 bg-gray-50">
                {DAYS_FR.map((d) => (
                    <div key={d} className="px-2 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        {d}
                    </div>
                ))}
            </div>
            {/* Weeks */}
            {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 divide-x divide-gray-100 border-t border-gray-100">
                    {week.map((day) => {
                        const dateStr = formatDate(day);
                        const isToday = dateStr === todayStr;
                        const isCurrentMonth = day.getMonth() === currentMonth;
                        const dayItems = getItemsForDate(dateStr);

                        return (
                            <div key={dateStr} className={`min-h-[110px] p-1 ${!isCurrentMonth ? "bg-gray-50/50" : ""}`}>
                                <div className={`text-xs font-bold mb-1 text-right px-1 ${isToday ? "text-blue-600" : isCurrentMonth ? "text-slate-700" : "text-slate-300"}`}>
                                    {day.getDate()}
                                </div>
                                <div className="space-y-0.5">
                                    {dayItems.slice(0, 3).map((item) => (
                                        <AgendaCard key={`${item.type}-${item.id}`} item={item} onClick={() => onSelectItem(item)} compact={true} />
                                    ))}
                                    {dayItems.length > 3 && (
                                        <div className="text-[10px] text-slate-400 text-center">+{dayItems.length - 3} autres</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}


// ==================== AGENDA CARD ====================

function AgendaCard({
    item,
    onClick,
    compact,
}: {
    item: AgendaItem;
    onClick: () => void;
    compact: boolean;
}) {
    const isSession = item.type === "session";
    const bgColor = isSession ? "bg-blue-50 border-blue-200 hover:bg-blue-100" : "bg-purple-50 border-purple-200 hover:bg-purple-100";
    const icon = isSession ? "📌" : "🎉";
    const textColor = isSession ? "text-blue-800" : "text-purple-800";

    if (compact) {
        return (
            <button
                onClick={onClick}
                className={`w-full text-left px-1.5 py-1 rounded border text-[11px] ${bgColor} ${textColor} transition-colors`}
            >
                <div className="font-medium truncate">{icon} {item.time} {item.title}</div>
                <div className="flex items-center gap-1.5 opacity-60 truncate">
                    {item.instructor_name && <span>👤 {item.instructor_name}</span>}
                    {isSession && <span>👥 {item.current_participants}/{item.max_participants}</span>}
                    {item.type === "event" && item.max_places && <span>👥 {item.registrations_count || 0}/{item.max_places}</span>}
                </div>
            </button>
        );
    }

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-2 py-1.5 rounded-lg border ${bgColor} transition-colors`}
        >
            <div className={`text-xs font-bold ${textColor} flex items-center gap-1`}>
                <span>{icon}</span>
                <span>{item.time}</span>
                <span className="text-[10px] font-normal opacity-70">{item.duration_minutes}min</span>
            </div>
            <div className={`text-xs font-medium ${textColor} truncate`}>{item.title}</div>
            {item.instructor_name && (
                <div className="text-[10px] text-slate-500 truncate">👤 {item.instructor_name}</div>
            )}
            {isSession && (
                <div className="text-[10px] text-slate-500 truncate">
                    👥 {item.current_participants}/{item.max_participants} inscrits
                </div>
            )}
            {item.type === "event" && item.max_places && (
                <div className="text-[10px] text-slate-500 truncate">
                    👥 {item.registrations_count || 0}/{item.max_places} inscrits
                </div>
            )}
        </button>
    );
}
