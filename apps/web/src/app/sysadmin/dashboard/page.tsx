"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";

interface Tenant {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    is_active: boolean;
    max_users: number;
    max_sessions_per_day: number;
    created_at: string;
    client_first_name?: string | null;
    client_last_name?: string | null;
    client_email?: string | null;
    client_phone?: string | null;
    client_address?: string | null;
    sysadmin_notes?: string | null;
    invitation_token?: string | null;
    invitation_expires_at?: string | null;
    claimed_at?: string | null;
    email?: string | null;
    active_users_count?: number;
    total_users_count?: number;
}

const DEFAULT_NEW_TENANT = {
    client_first_name: "",
    client_last_name: "",
    client_email: "",
    client_phone: "",
    client_address: "",
    slug: "",
    name: "",
    email: "",
    sysadmin_notes: ""
};

export default function SysAdminDashboardPage() {
    const router = useRouter();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    
    const [newTenant, setNewTenant] = useState(DEFAULT_NEW_TENANT);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // États pour la modale d'import Excel
    const [importTenantId, setImportTenantId] = useState<string | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<{
        success: boolean;
        imported_users: number;
        imported_orders: number;
        errors: string[];
    } | null>(null);

    const sysadminClient = () => {
        const token = localStorage.getItem("sysadmin_token");
        if (!token) {
            router.push("/sysadmin/login");
            throw new Error("No sysadmin token");
        }
        return {
            headers: { Authorization: `Bearer ${token}` },
        };
    };

    const fetchTenants = async () => {
        try {
            const response = await apiClient.get("/api/sysadmin/tenants", sysadminClient());
            setTenants(response.data);
        } catch (err: any) {
            if (err.response?.status === 401 || err.response?.status === 403) {
                router.push("/sysadmin/login");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTenants();
    }, []);

    const getErrorText = (err: any, defaultMsg: string): string => {
        if (!err.response?.data?.detail) return defaultMsg;
        const detail = err.response.data.detail;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail.map((e: any) => {
                const path = e.loc ? e.loc.filter((x: any) => x !== 'body').join('.') : '';
                return `${path ? path + ': ' : ''}${e.msg}`;
            }).join(', ');
        }
        return JSON.stringify(detail);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setMessage(null);

        const payload: any = { ...newTenant };
        if (payload.client_email === "") payload.client_email = null;
        if (payload.email === "") payload.email = null;

        try {
            await apiClient.post("/api/sysadmin/tenants", payload, sysadminClient());
            setMessage({ type: "success", text: `Établissement créé avec le code "${newTenant.slug}" !` });
            setNewTenant(DEFAULT_NEW_TENANT);
            setShowCreate(false);
            await fetchTenants();
        } catch (err: any) {
            setMessage({ type: "error", text: getErrorText(err, "Erreur lors de la création") });
        } finally {
            setCreating(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTenant) return;
        setSaving(true);
        setMessage(null);

        const payload: any = { ...editingTenant };
        if (payload.client_email === "") payload.client_email = null;
        if (payload.email === "") payload.email = null;

        try {
            await apiClient.patch(
                `/api/sysadmin/tenants/${editingTenant.id}`,
                payload,
                sysadminClient()
            );
            setMessage({ type: "success", text: `Établissement "${editingTenant.slug}" mis à jour !` });
            setEditingTenant(null);
            await fetchTenants();
        } catch (err: any) {
            setMessage({ type: "error", text: getErrorText(err, "Erreur lors de la modification") });
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (tenantId: string, currentState: boolean) => {
        try {
            await apiClient.patch(
                `/api/sysadmin/tenants/${tenantId}`,
                { is_active: !currentState },
                sysadminClient()
            );
            await fetchTenants();
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la modification du statut" });
        }
    };

    const handleRegenerateToken = async (tenantId: string) => {
        try {
            await apiClient.post(
                `/api/sysadmin/tenants/${tenantId}/generate-token`,
                {},
                sysadminClient()
            );
            setMessage({ type: "success", text: "Lien d'accès régénéré avec succès !" });
            await fetchTenants();
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la régénération du token" });
        }
    };

    const copyToClipboard = (token: string, tenantId: string) => {
        const url = `${window.location.protocol}//${window.location.host}/claim?token=${token}`;
        navigator.clipboard.writeText(url);
        setCopiedId(tenantId);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleImport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importTenantId || !importFile) return;

        setImporting(true);
        setImportError(null);
        setImportResult(null);

        const formData = new FormData();
        formData.append("file", importFile);

        try {
            const clientConfig = sysadminClient();
            const response = await apiClient.post(
                `/api/sysadmin/tenants/${importTenantId}/import`,
                formData,
                {
                    headers: {
                        ...clientConfig.headers,
                        "Content-Type": "multipart/form-data",
                    },
                }
            );
            setImportResult(response.data);
            fetchTenants();
        } catch (err: any) {
            setImportError(err.response?.data?.detail || "Une erreur est survenue lors de l'importation");
        } finally {
            setImporting(false);
        }
    };
    const handleResetOwner = async (tenantId: string) => {
        if (!window.confirm("Êtes-vous sûr de vouloir réinitialiser le propriétaire de cet établissement ? L'ancien compte propriétaire sera rétrogradé en manager simple. Si le nouveau propriétaire s'enregistre avec la même adresse email, elle sera automatiquement reprise et mise à jour. Un nouveau lien d'accès sera généré pour permettre l'inscription.")) {
            return;
        }
        
        try {
            const response = await apiClient.post(
                `/api/sysadmin/tenants/${tenantId}/reset-owner`,
                {},
                sysadminClient()
            );
            setMessage({ type: "success", text: `Le propriétaire de l'établissement "${response.data.slug}" a été réinitialisé. Nouveau lien généré !` });
            setEditingTenant(null);
            await fetchTenants();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la réinitialisation du propriétaire" });
        }
    };

    const downloadTemplate = () => {
        const headers = ["Email", "Prénom", "Nom", "Téléphone", "Offre", "Prix", "Statut"];
        const exampleRow = ["jean.dupont@example.com", "Jean", "Dupont", "0612345678", "Abonnement Annuel", "350", "Payé"];
        
        // CSV au format français (séparateur point-virgule et encodage avec BOM pour Excel)
        const csvContent = "\ufeff" + [headers.join(";"), exampleRow.join(";")].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "template_import_rezea.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportCSV = () => {
        const headers = [
            "Code (slug)", "Nom Établissement", "Email Établissement", "Statut", 
            "Prenom Contact", "Nom Contact", "Email Contact", "Telephone Contact", 
            "Adresse Contact", "Date Creation", "Date Initialisation", "Notes Internes"
        ];
        
        const rows = tenants.map(t => [
            t.slug,
            t.name,
            t.email || "",
            t.is_active ? "Active" : "Desactivee",
            t.client_first_name || "",
            t.client_last_name || "",
            t.client_email || "",
            t.client_phone || "",
            t.client_address || "",
            new Date(t.created_at).toLocaleDateString("fr-FR"),
            t.claimed_at ? new Date(t.claimed_at).toLocaleDateString("fr-FR") : "Non initialisé",
            t.sysadmin_notes || ""
        ]);

        const csvContent = [headers, ...rows]
            .map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
            .join("\n");
            
        const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `rezea_tenants_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleLogout = () => {
        localStorage.removeItem("sysadmin_token");
        localStorage.removeItem("sysadmin_id");
        router.push("/sysadmin/login");
    };

    const autoSlug = (name: string) => {
        return name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-slate-400">Chargement...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Top Bar */}
            <header className="border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-[95%] mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shadow-lg">
                            <span className="text-lg">🛡️</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-medium text-white">REZEA Admin</h1>
                            <p className="text-xs text-slate-500 font-medium">Administration système</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleExportCSV}
                            className="px-4 py-2 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-lg transition-all flex items-center gap-2 font-medium"
                        >
                            📥 Exporter CSV
                        </button>
                        <button
                            onClick={handleLogout}
                            className="px-4 py-2 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-lg transition-all font-medium"
                        >
                            Déconnexion
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-[95%] mx-auto px-6 py-8 space-y-8">
                {/* Message */}
                {message && (
                    <div
                        className={`p-4 rounded-xl border flex justify-between items-center ${message.type === "success"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : "bg-red-500/10 border-red-500/20 text-red-400"
                            }`}
                    >
                        <span>{message.text}</span>
                        <button onClick={() => setMessage(null)} className="text-sm font-medium opacity-70 hover:opacity-100">✕</button>
                    </div>
                )}

                {/* Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
                        <p className="text-slate-500 text-sm font-medium">Total établissements</p>
                        <p className="text-3xl font-medium text-white mt-1">{tenants.length}</p>
                    </div>
                    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
                        <p className="text-slate-500 text-sm font-medium">Actifs</p>
                        <p className="text-3xl font-medium text-emerald-400 mt-1">
                            {tenants.filter((t) => t.is_active).length}
                        </p>
                    </div>
                    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
                        <p className="text-slate-500 text-sm font-medium">En attente d&apos;initialisation</p>
                        <p className="text-3xl font-medium text-amber-400 mt-1">
                            {tenants.filter((t) => !t.claimed_at).length}
                        </p>
                    </div>
                </div>

                {/* Header + Create Button */}
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-medium text-white">Établissements</h2>
                    <button
                        onClick={() => {
                            setEditingTenant(null);
                            setShowCreate(!showCreate);
                        }}
                        className="px-5 py-2.5 bg-white hover:bg-white/90 text-slate-900 font-medium rounded-xl transition-all text-sm shadow-md"
                    >
                        {showCreate ? "✕ Annuler" : "+ Créer un établissement"}
                    </button>
                </div>

                {/* Create Form */}
                {showCreate && (
                    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 space-y-4">
                        <h3 className="text-lg font-medium text-white mb-2">Nouvel établissement</h3>
                        <form onSubmit={handleCreate} className="space-y-6">
                            
                            {/* 1. CONTACT CLIENT */}
                            <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 space-y-4">
                                <h4 className="text-sm font-medium text-slate-300">1. Informations de contact client (Commercial)</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Prénom *</label>
                                        <input
                                            required
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                            placeholder="Jean"
                                            value={newTenant.client_first_name}
                                            onChange={(e) => setNewTenant({ ...newTenant, client_first_name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Nom *</label>
                                        <input
                                            required
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                            placeholder="Dupont"
                                            value={newTenant.client_last_name}
                                            onChange={(e) => setNewTenant({ ...newTenant, client_last_name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Email de contact *</label>
                                        <input
                                            required
                                            type="email"
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                            placeholder="jean.dupont@email.com"
                                            value={newTenant.client_email}
                                            onChange={(e) => setNewTenant({ ...newTenant, client_email: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Téléphone *</label>
                                        <input
                                            required
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                            placeholder="06 12 34 56 78"
                                            value={newTenant.client_phone}
                                            onChange={(e) => setNewTenant({ ...newTenant, client_phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1 font-medium">Adresse physique (optionnel)</label>
                                    <input
                                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                        placeholder="123 Rue de la Paix, 75002 Paris"
                                        value={newTenant.client_address}
                                        onChange={(e) => setNewTenant({ ...newTenant, client_address: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* 2. ETABLISSEMENT */}
                            <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 space-y-4">
                                <h4 className="text-sm font-medium text-slate-300">2. Configuration de l&apos;établissement</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Code établissement (slug) *</label>
                                        <input
                                            required
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all font-mono text-sm font-medium"
                                            placeholder="club-fitness-paris"
                                            value={newTenant.slug}
                                            onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Nom de l&apos;établissement *</label>
                                        <input
                                            required
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                            placeholder="Club de Fitness Paris"
                                            value={newTenant.name}
                                            onChange={(e) => {
                                                const name = e.target.value;
                                                setNewTenant({
                                                    ...newTenant,
                                                    name,
                                                    slug: newTenant.slug || autoSlug(name),
                                                });
                                            }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1 font-medium">Email de l&apos;établissement (optionnel)</label>
                                    <input
                                        type="email"
                                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                        placeholder="contact@nomclub.com"
                                        value={newTenant.email}
                                        onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* 3. SUIVI INTERNE */}
                            <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 space-y-4">
                                <h4 className="text-sm font-medium text-slate-300">3. Suivi Interne</h4>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1 font-medium">Notes Sysadmin (non visibles par le client)</label>
                                    <textarea
                                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-none text-sm font-medium"
                                        rows={3}
                                        placeholder="Commentaires, conditions commerciales, statut du dossier..."
                                        value={newTenant.sysadmin_notes}
                                        onChange={(e) => setNewTenant({ ...newTenant, sysadmin_notes: e.target.value })}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={creating}
                                className="px-6 py-3 bg-white hover:bg-white/90 text-slate-900 font-medium rounded-xl transition-all disabled:opacity-50 text-sm shadow-md"
                            >
                                {creating ? "Création..." : "Créer l'établissement"}
                            </button>
                        </form>
                    </div>
                )}

                {/* Edit Form */}
                {editingTenant && (
                    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 space-y-4">
                        <h3 className="text-lg font-medium text-white mb-2">Modifier l&apos;établissement : {editingTenant.slug}</h3>
                        <form onSubmit={handleUpdate} className="space-y-6">
                            
                            {/* 1. CONTACT CLIENT */}
                            <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 space-y-4">
                                <h4 className="text-sm font-medium text-slate-300">1. Informations de contact client (Commercial)</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Prénom *</label>
                                        <input
                                            required
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                            value={editingTenant.client_first_name || ""}
                                            onChange={(e) => setEditingTenant({ ...editingTenant, client_first_name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Nom *</label>
                                        <input
                                            required
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                            value={editingTenant.client_last_name || ""}
                                            onChange={(e) => setEditingTenant({ ...editingTenant, client_last_name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Email de contact *</label>
                                        <input
                                            required
                                            type="email"
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                            value={editingTenant.client_email || ""}
                                            onChange={(e) => setEditingTenant({ ...editingTenant, client_email: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Téléphone *</label>
                                        <input
                                            required
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                            value={editingTenant.client_phone || ""}
                                            onChange={(e) => setEditingTenant({ ...editingTenant, client_phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1 font-medium">Adresse physique (optionnel)</label>
                                    <input
                                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                        value={editingTenant.client_address || ""}
                                        onChange={(e) => setEditingTenant({ ...editingTenant, client_address: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* 2. ETABLISSEMENT */}
                            <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 space-y-4">
                                <h4 className="text-sm font-medium text-slate-300">2. Configuration de l&apos;établissement</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Code établissement (slug) - Non modifiable</label>
                                        <input
                                            disabled
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-500 font-mono cursor-not-allowed text-sm font-medium"
                                            value={editingTenant.slug}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1 font-medium">Nom de l&apos;établissement *</label>
                                        <input
                                            required
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                            value={editingTenant.name}
                                            onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1 font-medium">Email de l&apos;établissement (optionnel)</label>
                                    <input
                                        type="email"
                                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm font-medium"
                                        value={editingTenant.email || ""}
                                        onChange={(e) => setEditingTenant({ ...editingTenant, email: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* 3. SUIVI INTERNE */}
                            <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 space-y-4">
                                <h4 className="text-sm font-medium text-slate-300">3. Suivi Interne</h4>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1 font-medium">Notes Sysadmin</label>
                                    <textarea
                                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-none text-sm font-medium"
                                        rows={3}
                                        value={editingTenant.sysadmin_notes || ""}
                                        onChange={(e) => setEditingTenant({ ...editingTenant, sysadmin_notes: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-6 py-3 bg-white hover:bg-white/90 text-slate-900 font-medium rounded-xl transition-all disabled:opacity-50 text-sm shadow-md"
                                >
                                    {saving ? "Sauvegarde..." : "Enregistrer les modifications"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingTenant(null)}
                                    className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all text-sm font-medium"
                                >
                                    Annuler
                                </button>
                                {editingTenant.claimed_at && (
                                    <button
                                        type="button"
                                        onClick={() => handleResetOwner(editingTenant.id)}
                                        className="px-6 py-3 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 rounded-xl transition-all text-sm font-medium ml-auto"
                                    >
                                        ⚠️ Réinitialiser le Propriétaire
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                )}

                {/* Tenants Table */}
                <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl overflow-hidden">
                    {tenants.length === 0 ? (
                        <div className="p-12 text-center">
                            <p className="text-slate-500 text-lg">Aucun établissement pour le moment</p>
                            <p className="text-slate-600 text-sm mt-1 font-medium">Cliquez sur &quot;Créer un établissement&quot; pour commencer</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-white/5">
                                        <th className="text-left px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                                            Code (slug) & Établissement
                                        </th>
                                        <th className="text-left px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                                            Contact
                                        </th>
                                        <th className="text-left px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                                            Email Contact
                                        </th>
                                        <th className="text-center px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                                            Users
                                        </th>
                                        <th className="text-center px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                                            Statut
                                        </th>
                                        <th className="text-center px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                                            Lien d&apos;accès
                                        </th>
                                        <th className="text-center px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                                            Créé le
                                        </th>
                                        <th className="text-right px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {tenants.map((tenant) => (
                                        <tr key={tenant.id} className="hover:bg-white/[0.02] transition-colors">
                                            {/* Code & Etablissement */}
                                            <td className="px-6 py-4">
                                                <div>
                                                    <p className="text-base font-medium text-slate-100 font-mono">
                                                        {tenant.slug}
                                                    </p>
                                                    <p className="text-xs text-slate-400 mt-1 font-medium">
                                                        {tenant.name}
                                                    </p>
                                                </div>
                                            </td>
                                            
                                            {/* Contact Client */}
                                            <td className="px-6 py-4 text-sm whitespace-nowrap">
                                                {tenant.client_first_name || tenant.client_last_name ? (
                                                    <p className="text-white font-medium">
                                                        {tenant.client_first_name} {tenant.client_last_name}
                                                    </p>
                                                ) : (
                                                    <span className="text-slate-600 italic font-medium">Aucun contact</span>
                                                )}
                                            </td>

                                            {/* Email Contact */}
                                            <td className="px-6 py-4 text-sm font-mono text-slate-300 font-medium">
                                                {tenant.client_email || <span className="text-slate-600 italic">Non renseigné</span>}
                                            </td>

                                            {/* Users */}
                                            <td className="px-6 py-4 text-sm whitespace-nowrap text-center">
                                                <div className="flex items-baseline justify-center gap-0.5">
                                                    <span className="text-violet-400 font-bold text-base">
                                                        {tenant.active_users_count ?? 0}
                                                    </span>
                                                    <span className="text-slate-500 text-xs font-medium">
                                                        /{tenant.total_users_count ?? 0}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Statut */}
                                            <td className="px-6 py-4 text-sm whitespace-nowrap text-center">
                                                {(() => {
                                                    const isExpired = tenant.invitation_expires_at && new Date(tenant.invitation_expires_at) < new Date();
                                                    if (tenant.claimed_at) {
                                                        return (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                                                <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-emerald-400" />
                                                                Initialisé
                                                            </span>
                                                        );
                                                    } else if (tenant.invitation_token) {
                                                        if (isExpired) {
                                                            return (
                                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                                                                    <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-red-400" />
                                                                    Expiré
                                                                </span>
                                                            );
                                                        } else {
                                                            return (
                                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                                                                    <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-amber-400" />
                                                                    En attente
                                                                </span>
                                                            );
                                                        }
                                                    } else {
                                                        return (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                                                                <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-red-400" />
                                                                Lien non généré
                                                            </span>
                                                        );
                                                    }
                                                })()}
                                            </td>

                                            {/* Lien d'accès */}
                                            <td className="px-6 py-4 text-sm whitespace-nowrap text-center">
                                                {(() => {
                                                    const isExpired = tenant.invitation_expires_at && new Date(tenant.invitation_expires_at) < new Date();
                                                    if (tenant.claimed_at) {
                                                        return <span className="text-slate-500 font-mono">-</span>;
                                                    } else if (tenant.invitation_token) {
                                                        if (isExpired) {
                                                            return (
                                                                <button
                                                                    onClick={() => handleRegenerateToken(tenant.id)}
                                                                    className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 border border-white/20 text-slate-300 font-medium rounded-lg transition-all whitespace-nowrap"
                                                                >
                                                                    ⚡ Renouveler le lien
                                                                </button>
                                                            );
                                                        } else {
                                                            return (
                                                                <div className="flex gap-2 flex-nowrap justify-center">
                                                                    <button
                                                                        onClick={() => copyToClipboard(tenant.invitation_token!, tenant.id)}
                                                                        className="px-2.5 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg border border-white/10 font-medium transition-all whitespace-nowrap"
                                                                    >
                                                                        {copiedId === tenant.id ? "✅ Copié !" : "📋 Copier le lien"}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRegenerateToken(tenant.id)}
                                                                        className="px-2.5 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg border border-white/10 font-medium transition-all whitespace-nowrap"
                                                                        title="Régénérer le lien d'accès"
                                                                    >
                                                                        🔄 Régénérer
                                                                    </button>
                                                                </div>
                                                            );
                                                        }
                                                    } else {
                                                        return (
                                                            <button
                                                                onClick={() => handleRegenerateToken(tenant.id)}
                                                                className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 border border-white/20 text-slate-300 font-medium rounded-lg transition-all whitespace-nowrap"
                                                            >
                                                                ⚡ Générer un lien d&apos;accès
                                                            </button>
                                                        );
                                                    }
                                                })()}
                                            </td>

                                            {/* Créé le */}
                                            <td className="px-6 py-4 text-sm text-slate-300 font-mono font-medium text-center">
                                                {new Date(tenant.created_at).toLocaleDateString("fr-FR")}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-6 py-4 text-right whitespace-nowrap">
                                                <div className="flex justify-end gap-2 flex-nowrap">
                                                    <button
                                                        onClick={() => {
                                                            setImportTenantId(tenant.id);
                                                            setShowImportModal(true);
                                                            setImportFile(null);
                                                            setImportError(null);
                                                            setImportResult(null);
                                                        }}
                                                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 whitespace-nowrap"
                                                    >
                                                        📥 Importer
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setShowCreate(false);
                                                            setEditingTenant(tenant);
                                                        }}
                                                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 whitespace-nowrap"
                                                    >
                                                        Modifier
                                                    </button>
                                                    <button
                                                        onClick={() => toggleActive(tenant.id, tenant.is_active)}
                                                        className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${tenant.is_active
                                                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                                                            : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                                                            }`}
                                                    >
                                                        {tenant.is_active ? "Désactiver" : "Activer"}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Modal d'import Excel */}
                {showImportModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
                        <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-6">
                            
                            {/* Header */}
                            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    📥 Initialisation et Importation de données
                                </h3>
                                <button
                                    onClick={() => setShowImportModal(false)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Info text & Template download */}
                            <div className="space-y-3">
                                <p className="text-sm text-slate-300">
                                    Utilisez cet outil pour injecter une liste d&apos;utilisateurs et leurs commandes actives. Le système accepte les fichiers Excel (<strong>.xlsx</strong>) et CSV (<strong>.csv</strong>).
                                </p>
                                <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div>
                                        <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider">Modèle recommandé</p>
                                        <p className="text-sm text-slate-300 mt-1">Téléchargez le gabarit pré-rempli pour structurer vos colonnes.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={downloadTemplate}
                                        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg shadow transition-all whitespace-nowrap"
                                    >
                                        📋 Télécharger le Modèle
                                    </button>
                                </div>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleImport} className="space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1.5 font-medium">Sélectionnez le fichier *</label>
                                    <input
                                        required
                                        type="file"
                                        accept=".xlsx, .xls, .csv"
                                        onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all text-sm font-medium file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 file:cursor-pointer"
                                    />
                                </div>

                                {/* Status / Error / Success Message */}
                                {importError && (
                                    <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">
                                        ❌ {importError}
                                    </div>
                                )}

                                {importResult && (
                                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl space-y-2">
                                        <p className="font-semibold">✅ Importation terminée avec succès !</p>
                                        <ul className="list-disc list-inside text-xs text-emerald-300/90 space-y-1 mt-1">
                                            <li>Utilisateurs importés/créés : {importResult.imported_users}</li>
                                            <li>Commandes / Formules générées : {importResult.imported_orders}</li>
                                        </ul>
                                        {importResult.errors && importResult.errors.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-emerald-500/20">
                                                <p className="text-xs font-semibold text-amber-400">Alertes / Remarques :</p>
                                                <ul className="list-disc list-inside text-[11px] text-amber-300 space-y-1 mt-1 max-h-24 overflow-y-auto">
                                                    {importResult.errors.map((err: string, i: number) => (
                                                        <li key={i}>{err}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Action buttons */}
                                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                                    <button
                                        type="button"
                                        onClick={() => setShowImportModal(false)}
                                        className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-all"
                                    >
                                        Fermer
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={importing || !importFile}
                                        className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-950 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg shadow transition-all flex items-center gap-2"
                                    >
                                        {importing ? (
                                            <>
                                                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                Importation...
                                            </>
                                        ) : (
                                            "Lancer l'importation"
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
