"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, Session, User } from "@/lib/api";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Sidebar from "@/components/Sidebar";

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

function AdminSessionsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [user, setUser] = useState<User | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [editSession, setEditSession] = useState<Session | null>(null);
    const [editForm, setEditForm] = useState({
        title: "", description: "", instructor_name: "",
        date: "", time: "", duration_minutes: 60,
        max_participants: 10, credits_required: 1,
    });
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("active");
    const [exportFrom, setExportFrom] = useState("");
    const [exportTo, setExportTo] = useState("");
    const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
    const [reactivateConfirmId, setReactivateConfirmId] = useState<string | null>(null);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [duplicateData, setDuplicateData] = useState({
        source_start: "",
        source_end: "",
        target_start: "",
    });

    const fetchSessions = async (): Promise<Session[]> => {
        try {
            const now = new Date();
            const start = `${now.getFullYear() - 1}-01-01T00:00:00`;
            const end = `${now.getFullYear() + 1}-12-31T23:59:59`;
            const data = await api.getSessions({ 
                start_date: start, 
                end_date: end, 
                status: statusFilter 
            });
            setSessions(data);
            return data;
        } catch (err: any) {
            console.error("Error fetching sessions:", err?.response?.status, err?.response?.data);
            return [];
        }
    };

    useEffect(() => {
        fetchSessions();
    }, [statusFilter]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const userData = await api.getCurrentUser();
                if (userData.role !== "owner" && userData.role !== "manager") {
                    router.push("/dashboard");
                    return;
                }
                setUser(userData);
                const sessionsData = await fetchSessions();
                // Auto-open edit modal if ?edit=<id> is in URL
                const editId = searchParams.get("edit");
                if (editId && sessionsData) {
                    const target = sessionsData.find((s: Session) => s.id === editId);
                    if (target) openEdit(target);
                }
            } catch (err) {
                console.error(err);
                router.push("/login");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router, searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setSaving(true);

        try {
            // Build start_time and end_time from date + time + duration
            const startDateTime = `${formData.date}T${formData.time}:00`;
            const startDate = new Date(startDateTime);
            const endDate = new Date(startDate.getTime() + formData.duration_minutes * 60 * 1000);

            const sessionPayload = {
                title: formData.title,
                description: formData.description || null,
                activity_type: null,
                instructor_name: formData.instructor_name || null,
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                max_participants: formData.max_participants,
                credits_required: formData.credits_required,
            };

            // Handle recurrence
            const dates: Date[] = [startDate];

            if (formData.recurrence !== "none" && formData.recurrence_count > 1) {
                for (let i = 1; i < formData.recurrence_count; i++) {
                    const nextDate = new Date(startDate);
                    if (formData.recurrence === "daily") {
                        nextDate.setDate(nextDate.getDate() + i);
                    } else if (formData.recurrence === "weekly") {
                        nextDate.setDate(nextDate.getDate() + i * 7);
                    } else if (formData.recurrence === "monthly") {
                        nextDate.setMonth(nextDate.getMonth() + i);
                    }
                    dates.push(nextDate);
                }
            }

            // Create all sessions
            for (const d of dates) {
                const endD = new Date(d.getTime() + formData.duration_minutes * 60 * 1000);
                await api.createSession({
                    ...sessionPayload,
                    start_time: d.toISOString(),
                    end_time: endD.toISOString(),
                } as any);
            }

            const count = dates.length;
            setMessage({
                type: "success",
                text: count > 1 ? `${count} séances créées avec succès !` : "Séance créée avec succès !",
            });
            resetForm();
            await fetchSessions();
        } catch (err: any) {
            setMessage({
                type: "error",
                text: err.response?.data?.detail || "Erreur lors de la création.",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (sessionId: string) => {
        try {
            await api.deleteSession(sessionId);
            setDeleteConfirmId(null);
            setMessage({ type: "success", text: "Séance supprimée." });
            await fetchSessions();
        } catch (err: any) {
            alert("Erreur lors de la suppression.");
        }
    };

    const handleCancel = async (sessionId: string) => {
        try {
            await api.cancelSession(sessionId);
            setCancelConfirmId(null);
            setMessage({ type: "success", text: "Séance annulée et inscrits remboursés." });
            await fetchSessions();
        } catch (err: any) {
            alert("Erreur lors de l'annulation.");
        }
    };

    const handleReactivate = async (sessionId: string) => {
        try {
            await api.reactivateSession(sessionId);
            setReactivateConfirmId(null);
            setMessage({ type: "success", text: "Séance réactivée et inscriptions restaurées (selon crédits)." });
            await fetchSessions();
        } catch (err: any) {
            alert("Erreur lors de la réactivation.");
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
            await fetchSessions();
        } catch (err: any) {
            alert("Erreur lors de la duplication.");
        }
    };

    const openEdit = (session: Session) => {
        const start = new Date(session.start_time);
        const end = new Date(session.end_time);
        const dur = Math.round((end.getTime() - start.getTime()) / 60000);
        setEditSession(session);
        setEditForm({
            title: session.title,
            description: session.description || "",
            instructor_name: (session as any).instructor_name || "",
            date: start.toISOString().split("T")[0],
            time: start.toTimeString().slice(0, 5),
            duration_minutes: dur,
            max_participants: session.max_participants,
            credits_required: session.credits_required,
        });
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editSession) return;
        try {
            const startDt = new Date(`${editForm.date}T${editForm.time}:00`);
            const endDt = new Date(startDt.getTime() + editForm.duration_minutes * 60 * 1000);
            await api.updateSession(editSession.id, {
                title: editForm.title,
                description: editForm.description || undefined,
                instructor_name: editForm.instructor_name || undefined,
                start_time: startDt.toISOString(),
                end_time: endDt.toISOString(),
                max_participants: editForm.max_participants,
                credits_required: editForm.credits_required,
            } as any);
            setEditSession(null);
            setMessage({ type: "success", text: "Séance modifiée avec succès !" });
            await fetchSessions();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la modification." });
        }
    };

    const resetForm = () => {
        setFormData({ ...emptyForm });
        setShowForm(false);
    };

    const recurrenceLabel = (r: RecurrenceType) => {
        switch (r) {
            case "daily": return "Tous les jours";
            case "weekly": return "Toutes les semaines";
            case "monthly": return "Tous les mois";
            default: return "Aucune";
        }
    };

    // Sort newest first and filter by search
    const filteredSessions = sessions
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
        .filter((s) => {
            if (!searchTerm) return true;
            const q = searchTerm.toLowerCase();
            return (
                s.title.toLowerCase().includes(q) ||
                (s.description || "").toLowerCase().includes(q) ||
                ((s as any).instructor_name || "").toLowerCase().includes(q)
            );
        });

    const handleExport = () => {
        let toExport = filteredSessions;
        if (exportFrom) {
            const from = new Date(exportFrom + "T00:00:00");
            toExport = toExport.filter((s) => new Date(s.start_time) >= from);
        }
        if (exportTo) {
            const to = new Date(exportTo + "T23:59:59");
            toExport = toExport.filter((s) => new Date(s.start_time) <= to);
        }
        // Build CSV (Excel-compatible with BOM)
        const BOM = "\uFEFF";
        const header = "Date;Heure;Intitulé;Durée (min);Attribution;Places;Inscrits;Crédits;Description";
        const rows = toExport.map((s) => {
            const start = new Date(s.start_time);
            const end = new Date(s.end_time);
            const dur = Math.round((end.getTime() - start.getTime()) / 60000);
            return [
                format(start, "dd/MM/yyyy", { locale: fr }),
                format(start, "HH:mm"),
                s.title,
                dur,
                (s as any).instructor_name || "",
                s.max_participants,
                s.current_participants,
                s.credits_required,
                (s.description || "").replace(/[\n;]/g, " "),
            ].join(";");
        });
        const csv = BOM + header + "\n" + rows.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const fromLabel = exportFrom || "debut";
        const toLabel = exportTo || "fin";
        a.download = `seances_${fromLabel}_${toLabel}.csv`;
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
                            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">🗓️ Gestion des Séances</h1>
                            <p className="text-slate-500 mt-1">
                                Planifiez et organisez vos activités
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { setShowDuplicateModal(true); setDuplicateData({ source_start: "", source_end: "", target_start: "" }); }}
                                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                📋 Dupliquer
                            </button>
                            <button
                                onClick={() => { setShowForm(true); setFormData({ ...emptyForm }); setMessage(null); }}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                            >
                                ➕ Nouveau
                            </button>
                        </div>
                    </div>

                    {/* Message */}
                    {message && (
                        <div className={`p-4 rounded-lg border ${message.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                            {message.text}
                        </div>
                    )}

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
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Statut</label>
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                    >
                                        <option value="active">Programmées</option>
                                        <option value="cancelled">Annulées</option>
                                        <option value="all">Toutes</option>
                                    </select>
                                </div>
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
                                {filteredSessions.length} séance{filteredSessions.length > 1 ? "s" : ""} affichée{filteredSessions.length > 1 ? "s" : ""}
                                {(exportFrom || exportTo) && (
                                    <span> · Export : {exportFrom || "…"} → {exportTo || "…"}</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Creation Form */}
                    {showForm && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h2 className="text-xl font-bold text-slate-900 mb-4">Créer une nouvelle séance</h2>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Row 1: Intitulé + Attribution */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Intitulé *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Ex: Cours de Yoga, Réunion équipe..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Attribution</label>
                                        <input
                                            type="text"
                                            value={formData.instructor_name}
                                            onChange={(e) => setFormData({ ...formData, instructor_name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Ex: Jean Dupont"
                                        />
                                    </div>
                                </div>

                                {/* Row 2: Date, Heure, Durée */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Durée (min) *</label>
                                        <input
                                            type="number"
                                            required
                                            min="5"
                                            value={formData.duration_minutes}
                                            onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="60"
                                        />
                                    </div>
                                </div>

                                {/* Row 3: Places, Crédits */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de places disponibles *</label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            value={formData.max_participants}
                                            onChange={(e) => setFormData({ ...formData, max_participants: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="10"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Crédits requis *</label>
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            step="0.1"
                                            value={formData.credits_required}
                                            onChange={(e) => setFormData({ ...formData, credits_required: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="1"
                                        />
                                    </div>
                                </div>

                                {/* Row 4: Récurrence */}
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Récurrence</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Fréquence</label>
                                            <select
                                                value={formData.recurrence}
                                                onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as RecurrenceType })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="none">Aucune récurrence</option>
                                                <option value="daily">Tous les jours</option>
                                                <option value="weekly">Toutes les semaines</option>
                                                <option value="monthly">Tous les mois</option>
                                            </select>
                                        </div>
                                        {formData.recurrence !== "none" && (
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre d&apos;occurrences</label>
                                                <input
                                                    type="number"
                                                    min="2"
                                                    max="52"
                                                    value={formData.recurrence_count}
                                                    onChange={(e) => setFormData({ ...formData, recurrence_count: parseInt(e.target.value) || 2 })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {formData.recurrence_count} séances seront créées ({recurrenceLabel(formData.recurrence)})
                                                </p>
                                            </div>
                                        )}
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
                                        placeholder="Détails sur la séance..."
                                    />
                                </div>

                                {/* Submit */}
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                                    >
                                        {saving ? "Création..." : formData.recurrence !== "none" ? `Créer ${formData.recurrence_count} séances` : "Créer la séance"}
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

                    {/* Sessions Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Heure</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intitulé</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durée</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attribution</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Places</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inscriptions</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Crédits</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredSessions.map((session) => {
                                        const start = new Date(session.start_time);
                                        const end = new Date(session.end_time);
                                        const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
                                        const fillRatio = session.current_participants / session.max_participants;

                                        return (
                                            <tr key={session.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                                                    {format(start, "dd/MM/yyyy", { locale: fr })}
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                                                    {format(start, "HH:mm")} - {format(end, "HH:mm")}
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-1">
                                                        {!session.is_active && (
                                                            <span title="Séance annulée" className="text-red-500 mr-1">🚫</span>
                                                        )}
                                                        <span className={`font-medium ${!session.is_active ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                                            {session.title}
                                                        </span>
                                                        {session.description && (
                                                            <span title={session.description} className="text-blue-400 cursor-help ml-1">📝</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                                                    {durationMin} min
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                                                    {(session as any).instructor_name || "—"}
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                                                    {session.max_participants}
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap">
                                                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${fillRatio >= 1 ? "bg-red-100 text-red-800" :
                                                        fillRatio >= 0.7 ? "bg-orange-100 text-orange-800" :
                                                            "bg-green-100 text-green-800"
                                                        }`}>
                                                        {session.current_participants}/{session.max_participants}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                                                    {session.credits_required}
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm space-x-1">
                                                    <button
                                                        onClick={() => openEdit(session)}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Modifier"
                                                    >
                                                        ✏️
                                                    </button>
                                                    {session.is_active ? (
                                                        <button
                                                            onClick={() => setCancelConfirmId(session.id)}
                                                            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                                            title="Annuler la séance"
                                                        >
                                                            🚫
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => setReactivateConfirmId(session.id)}
                                                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                            title="Restaurer la séance"
                                                        >
                                                            🔄
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setDeleteConfirmId(session.id)}
                                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Supprimer définitivement"
                                                    >
                                                        🗑️
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredSessions.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                                                {searchTerm ? "Aucune séance ne correspond à la recherche" : "Aucune séance planifiée pour le moment"}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {/* Cancel Confirmation Modal */}
            {cancelConfirmId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
                        <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-2xl mb-4">🚫</div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Annuler la séance ?</h3>
                        <p className="text-slate-600 mb-4 text-sm">
                            La séance sera marquée comme annulée. Tous les inscrits seront informés et leurs crédits seront automatiquement remboursés.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setCancelConfirmId(null)}
                                className="px-4 py-2 bg-gray-100 text-slate-900 rounded-lg font-medium hover:bg-gray-200 text-sm"
                            >
                                Retour
                            </button>
                            <button
                                onClick={() => handleCancel(cancelConfirmId)}
                                className="px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 text-sm"
                            >
                                Confirmer l&apos;annulation
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reactivate Confirmation Modal */}
            {reactivateConfirmId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-2xl mb-4">🔄</div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Réactiver la séance ?</h3>
                        <p className="text-slate-600 mb-4 text-sm">
                            La séance sera de nouveau programmée. Les inscriptions précédemment annulées seront restaurées et les crédits seront de nouveau débités des comptes utilisateurs.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setReactivateConfirmId(null)}
                                className="px-4 py-2 bg-gray-100 text-slate-900 rounded-lg font-medium hover:bg-gray-200 text-sm"
                            >
                                Retour
                            </button>
                            <button
                                onClick={() => handleReactivate(reactivateConfirmId)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 text-sm"
                            >
                                Confirmer la réactivation
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Confirmer la suppression</h3>
                        <p className="text-slate-600 mb-4">
                            Cette séance sera désactivée et n&apos;apparaîtra plus dans le planning. Cette action est irréversible.
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
            {/* Edit Modal */}
            {editSession && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Modifier la séance</h3>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Intitulé *</label>
                                    <input type="text" required value={editForm.title}
                                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Attribution</label>
                                    <input type="text" value={editForm.instructor_name}
                                        onChange={(e) => setEditForm({ ...editForm, instructor_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                                    <input type="date" required value={editForm.date}
                                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Heure *</label>
                                    <input type="time" required value={editForm.time}
                                        onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Durée (min) *</label>
                                    <input type="number" required min="5" value={editForm.duration_minutes}
                                        onChange={(e) => setEditForm({ ...editForm, duration_minutes: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Places *</label>
                                    <input type="number" required min="1" value={editForm.max_participants}
                                        onChange={(e) => setEditForm({ ...editForm, max_participants: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Crédits requis *</label>
                                    <input type="number" required min="0" step="0.1" value={editForm.credits_required}
                                        onChange={(e) => setEditForm({ ...editForm, credits_required: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                <textarea value={editForm.description}
                                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows={2} />
                            </div>
                            <div className="flex gap-2 justify-end pt-4">
                                <button type="button" onClick={() => setEditSession(null)}
                                    className="px-6 py-2 bg-gray-200 text-slate-900 rounded-lg font-bold hover:bg-gray-300 transition-colors">
                                    Annuler
                                </button>
                                <button type="submit"
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors">
                                    Enregistrer les modifications
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            {/* Duplicate Modal */}
            {showDuplicateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                        <h3 className="text-xl font-bold text-slate-900 mb-4">Dupliquer des séances</h3>
                        <p className="text-sm text-slate-500 mb-6">
                            Copiez toutes les séances d&apos;une période donnée vers une nouvelle date de début.
                        </p>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Période source : Du</label>
                                    <input type="date" value={duplicateData.source_start} onChange={(e) => setDuplicateData({...duplicateData, source_start: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Au (inclus)</label>
                                    <input type="date" value={duplicateData.source_end} onChange={(e) => setDuplicateData({...duplicateData, source_end: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nouvelle date de début</label>
                                <input type="date" value={duplicateData.target_start} onChange={(e) => setDuplicateData({...duplicateData, target_start: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end mt-8">
                            <button onClick={() => setShowDuplicateModal(false)}
                                className="px-6 py-2 bg-gray-200 text-slate-900 rounded-lg font-bold hover:bg-gray-300 transition-colors">
                                Annuler
                            </button>
                            <button onClick={handleDuplicate}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors">
                                Dupliquer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminSessionsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>}>
            <AdminSessionsContent />
        </Suspense>
    );
}
