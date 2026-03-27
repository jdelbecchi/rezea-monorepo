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
}

export default function SysAdminDashboardPage() {
    const router = useRouter();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newTenant, setNewTenant] = useState({ name: "", slug: "", description: "" });
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setMessage(null);

        try {
            await apiClient.post("/api/sysadmin/tenants", newTenant, sysadminClient());
            setMessage({ type: "success", text: `Établissement "${newTenant.name}" créé avec succès !` });
            setNewTenant({ name: "", slug: "", description: "" });
            setShowCreate(false);
            await fetchTenants();
        } catch (err: any) {
            setMessage({ type: "error", text: err.response?.data?.detail || "Erreur lors de la création" });
        } finally {
            setCreating(false);
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
            setMessage({ type: "error", text: "Erreur lors de la modification" });
        }
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
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                            <span className="text-lg">🛡️</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white">REZEA Admin</h1>
                            <p className="text-xs text-slate-500">Administration système</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="px-4 py-2 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-lg transition-all"
                    >
                        Déconnexion
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* Message */}
                {message && (
                    <div
                        className={`p-4 rounded-xl border ${message.type === "success"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : "bg-red-500/10 border-red-500/20 text-red-400"
                            }`}
                    >
                        {message.text}
                    </div>
                )}

                {/* Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
                        <p className="text-slate-500 text-sm">Total établissements</p>
                        <p className="text-3xl font-bold text-white mt-1">{tenants.length}</p>
                    </div>
                    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
                        <p className="text-slate-500 text-sm">Actives</p>
                        <p className="text-3xl font-bold text-emerald-400 mt-1">
                            {tenants.filter((t) => t.is_active).length}
                        </p>
                    </div>
                    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
                        <p className="text-slate-500 text-sm">Désactivées</p>
                        <p className="text-3xl font-bold text-red-400 mt-1">
                            {tenants.filter((t) => !t.is_active).length}
                        </p>
                    </div>
                </div>

                {/* Header + Create Button */}
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">Établissements</h2>
                    <button
                        onClick={() => setShowCreate(!showCreate)}
                        className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all text-sm"
                    >
                        {showCreate ? "✕ Annuler" : "+ Créer un établissement"}
                    </button>
                </div>

                {/* Create Form */}
                {showCreate && (
                    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Nouvel établissement</h3>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Nom de l&apos;établissement</label>
                                    <input
                                        required
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                                        placeholder="Pole Dance Studio Paris"
                                        value={newTenant.name}
                                        onChange={(e) => {
                                            const name = e.target.value;
                                            setNewTenant({
                                                ...newTenant,
                                                name,
                                                slug: autoSlug(name),
                                            });
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Code établissement (slug)</label>
                                    <input
                                        required
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-mono"
                                        placeholder="pole-dance-paris"
                                        value={newTenant.slug}
                                        onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                                    />
                                    <p className="text-xs text-slate-600 mt-1">
                                        Les utilisateurs utiliseront ce code pour s&apos;inscrire
                                    </p>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Description (optionnelle)</label>
                                <textarea
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all resize-none"
                                    rows={2}
                                    placeholder="Description de l'établissement..."
                                    value={newTenant.description}
                                    onChange={(e) => setNewTenant({ ...newTenant, description: e.target.value })}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={creating}
                                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                            >
                                {creating ? "Création..." : "Créer l'établissement"}
                            </button>
                        </form>
                    </div>
                )}

                {/* Tenants Table */}
                <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl overflow-hidden">
                    {tenants.length === 0 ? (
                        <div className="p-12 text-center">
                            <p className="text-slate-500 text-lg">Aucun établissement pour le moment</p>
                            <p className="text-slate-600 text-sm mt-1">Cliquez sur &quot;Créer un établissement&quot; pour commencer</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-white/5">
                                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                            Établissement
                                        </th>
                                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                            Code (slug)
                                        </th>
                                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                            Statut
                                        </th>
                                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                            Date de création
                                        </th>
                                        <th className="text-right px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {tenants.map((tenant) => (
                                        <tr key={tenant.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-4">
                                                <div>
                                                    <p className="font-semibold text-white">{tenant.name}</p>
                                                    {tenant.description && (
                                                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">
                                                            {tenant.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <code className="text-sm text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                                                    {tenant.slug}
                                                </code>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span
                                                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tenant.is_active
                                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                                                        }`}
                                                >
                                                    <span
                                                        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${tenant.is_active ? "bg-emerald-400" : "bg-red-400"
                                                            }`}
                                                    />
                                                    {tenant.is_active ? "Active" : "Désactivée"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-400">
                                                {new Date(tenant.created_at).toLocaleDateString("fr-FR", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                })}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => toggleActive(tenant.id, tenant.is_active)}
                                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${tenant.is_active
                                                        ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                                                        : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                                                        }`}
                                                >
                                                    {tenant.is_active ? "Désactiver" : "Activer"}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
