"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";

interface Tenant {
    id: string;
    name: string;
    slug: string;
    description: string | null;
}

function ClaimPortalContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        confirmPassword: ""
    });
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!token) {
            setError("Jeton d'invitation manquant. Veuillez utiliser le lien d'accès complet qui vous a été transmis.");
            setLoading(false);
            return;
        }

        const verifyToken = async () => {
            try {
                const response = await apiClient.get(`/api/tenants/claim/verify?token=${token}`);
                setTenant(response.data);
            } catch (err: any) {
                setError(err.response?.data?.detail || "Ce lien d'accès est invalide, a expiré ou a déjà été utilisé.");
            } finally {
                setLoading(false);
            }
        };

        verifyToken();
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!token) return;

        // Validation
        if (formData.password.length < 8) {
            setFormError("Le mot de passe doit contenir au moins 8 caractères.");
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setFormError("Les mots de passe ne correspondent pas.");
            return;
        }

        setSubmitting(true);

        try {
            const response = await apiClient.post("/api/tenants/claim", {
                token: token,
                email: formData.email,
                password: formData.password,
                first_name: formData.first_name,
                last_name: formData.last_name
            });

            // Sauvegarder les informations de session pour le portail club
            localStorage.setItem("access_token", response.data.access_token);
            localStorage.setItem("user_id", response.data.user_id);
            localStorage.setItem("tenant_slug", tenant?.slug || "");
            localStorage.setItem("default_view", "admin");

            // Rediriger vers le tableau de bord d'administration du club
            router.push(`/${tenant?.slug}/admin`);
        } catch (err: any) {
            setFormError(err.response?.data?.detail || "Une erreur est survenue lors de l'initialisation du compte.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-400">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 border-4 border-slate-700 border-t-amber-500 animate-spin rounded-full"></div>
                    <p className="text-sm font-medium">Vérification de votre lien d&apos;invitation...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-center">
                <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl space-y-6 shadow-2xl">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-3xl">
                        ⚠️
                    </div>
                    <h1 className="text-2xl font-bold text-white">Lien invalide ou expiré</h1>
                    <p className="text-slate-400 text-sm leading-relaxed">{error}</p>
                    <div className="pt-4">
                        <button
                            onClick={() => router.push("/")}
                            className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-semibold transition-all text-sm"
                        >
                            Retourner à l&apos;accueil
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
            <div className="max-w-xl w-full">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mb-4 shadow-lg shadow-amber-500/20 text-2xl">
                        🚀
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Bienvenue sur REZEA</h1>
                    <p className="text-slate-400 mt-2 text-sm">
                        Initialisez votre espace d&apos;administration pour l&apos;établissement
                    </p>
                    <div className="mt-3 inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                        <span className="text-amber-400 text-sm font-semibold">{tenant?.name}</span>
                    </div>
                </div>

                {/* Form Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6">
                    <h2 className="text-lg font-bold text-white">Créez votre compte administrateur</h2>
                    
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {formError && (
                            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
                                {formError}
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Prénom</label>
                                <input
                                    required
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-sm"
                                    placeholder="Jean"
                                    value={formData.first_name}
                                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Nom</label>
                                <input
                                    required
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-sm"
                                    placeholder="Dupont"
                                    value={formData.last_name}
                                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Email administrateur (votre login)</label>
                            <input
                                type="email"
                                required
                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-sm"
                                placeholder="nom@etablissement.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Mot de passe</label>
                                <input
                                    type="password"
                                    required
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-sm"
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Confirmer le mot de passe</label>
                                <input
                                    type="password"
                                    required
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-sm"
                                    placeholder="••••••••"
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 text-sm mt-2"
                        >
                            {submitting ? "Initialisation..." : "Activer mon espace d'administration"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function ClaimPortal() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-400">
                <p className="text-sm">Chargement du portail d&apos;initialisation...</p>
            </div>
        }>
            <ClaimPortalContent />
        </Suspense>
    );
}
