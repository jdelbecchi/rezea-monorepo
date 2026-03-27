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
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Mot de passe oublié
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Entrez votre email et le code de votre établissement pour recevoir un lien de réinitialisation.
                    </p>
                </div>

                {submitted ? (
                    <div className="rounded-md bg-green-50 p-6 text-center">
                        <svg
                            className="mx-auto h-12 w-12 text-green-400 mb-4"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        <h3 className="text-lg font-medium text-green-800 mb-2">
                            Demande envoyée !
                        </h3>
                        <p className="text-sm text-green-700 mb-4">
                            Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.
                            Vérifiez votre boîte de réception.
                        </p>
                        <Link
                            href="/login"
                            className="font-medium text-blue-600 hover:text-blue-500"
                        >
                            Retour à la connexion
                        </Link>
                    </div>
                ) : (
                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        {error && (
                            <div className="rounded-md bg-red-50 p-4">
                                <p className="text-sm text-red-800">{error}</p>
                            </div>
                        )}

                        <div className="rounded-md shadow-sm space-y-4">
                            <div>
                                <label
                                    htmlFor="tenant_slug"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Code de votre établissement
                                </label>
                                <input
                                    id="tenant_slug"
                                    name="tenant_slug"
                                    type="text"
                                    required
                                    className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    placeholder="mon-club"
                                    value={tenantSlug}
                                    onChange={(e) => setTenantSlug(e.target.value)}
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Email
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    placeholder="votre@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? "Envoi en cours..." : "Envoyer le lien"}
                            </button>
                        </div>

                        <div className="text-center">
                            <Link
                                href="/login"
                                className="font-medium text-blue-600 hover:text-blue-500"
                            >
                                Retour à la connexion
                            </Link>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
