"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";

export default function SysAdminLoginPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({ email: "", password: "" });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await apiClient.post("/api/sysadmin/login", formData);
            localStorage.setItem("sysadmin_token", response.data.access_token);
            localStorage.setItem("sysadmin_id", response.data.sysadmin_id);
            router.push("/sysadmin/dashboard");
        } catch (err: any) {
            setError(err.response?.data?.detail || "Identifiants incorrects");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <div className="max-w-md w-full mx-4">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mb-4 shadow-lg shadow-amber-500/20">
                        <span className="text-2xl">🛡️</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">REZEA</h1>
                    <div className="mt-2 inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                        <span className="text-amber-400 text-sm font-semibold">Administration Système</span>
                    </div>
                </div>

                {/* Form Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                                Email administrateur
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
                                placeholder="admin@rezea.app"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                                Mot de passe
                            </label>
                            <input
                                id="password"
                                type="password"
                                required
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Connexion..." : "Se connecter"}
                        </button>
                    </form>
                </div>

                <p className="text-center text-slate-600 text-xs mt-6">
                    Accès réservé aux administrateurs système REZEA
                </p>
            </div>
        </div>
    );
}
