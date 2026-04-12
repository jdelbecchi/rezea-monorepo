"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [tenantSlug, setTenantSlug] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await api.forgotPassword(email, tenantSlug);
            setSubmitted(true);
        } catch (err: any) {
            setError(
                err.response?.data?.detail || "Une erreur est survenue. Veuillez réessayer."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden bg-[#fbfcfd] flex items-center justify-center p-4">
            {/* Background Abstract Shapes - Zen Blobs */}
            <div className="absolute top-[-5%] left-[-5%] w-[45%] h-[45%] bg-blue-400/30 rounded-full blur-[80px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-5%] w-[55%] h-[55%] bg-indigo-400/25 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
            <div className="absolute top-[30%] right-[10%] w-[25%] h-[25%] bg-emerald-300/20 rounded-full blur-[70px] animate-pulse" style={{ animationDelay: '4s' }}></div>

            <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 md:p-10 w-full max-w-sm relative z-10 transition-all">
                <div className="mb-8 text-center px-4">
                    <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-4 uppercase">Rezea</h1>
                    <h3 className="text-lg font-semibold text-slate-800 tracking-tight">Mot de passe oublié</h3>
                    <p className="text-slate-500 font-medium text-xs mt-2 leading-relaxed">
                        Entrez votre email et le code de votre établissement pour recevoir un lien de réinitialisation.
                    </p>
                </div>

                {submitted ? (
                    <div className="rounded-2xl bg-emerald-50/50 border border-emerald-100 p-6 text-center animate-in fade-in zoom-in duration-300">
                        <div className="h-12 w-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-base font-semibold text-emerald-900 mb-2">Demande envoyée !</h3>
                        <p className="text-xs text-emerald-700 mb-6 leading-relaxed">
                            Si un compte existe, un lien de réinitialisation a été envoyé. Vérifiez votre boîte de réception.
                        </p>
                        <Link href="/" className="text-sm font-medium text-slate-900 hover:underline">
                            Retour à la connexion
                        </Link>
                    </div>
                ) : (
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        {error && (
                            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-[11px] font-medium animate-in shake duration-300">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[13px] font-medium text-slate-500 px-1">Code de votre établissement</label>
                                <div className="relative group">
                                    <input
                                        required
                                        className="w-full p-3 pl-11 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                        placeholder="mon-club"
                                        value={tenantSlug}
                                        onChange={(e) => setTenantSlug(e.target.value)}
                                    />
                                    <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 opacity-50 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[13px] font-medium text-slate-500 px-1">Adresse email</label>
                                <div className="relative group">
                                    <input
                                        type="email"
                                        required
                                        className="w-full p-3 pl-11 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                        placeholder="votre@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                    <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 opacity-50 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-slate-900 text-white font-medium text-sm rounded-xl hover:bg-slate-800 transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 mt-2"
                        >
                            {loading ? "Envoi en cours..." : "Envoyer le lien"}
                        </button>

                        <div className="text-center pt-2">
                            <Link href="/" className="text-xs font-normal text-slate-400 hover:text-slate-600 transition-colors">
                                Retour à la connexion
                            </Link>
                        </div>
                    </form>
                )}
            </div>

            <style jsx>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-4px); }
                    75% { transform: translateX(4px); }
                }
                .shake { animation: shake 0.3s ease-in-out; }
            `}</style>
        </div>
    );
}
