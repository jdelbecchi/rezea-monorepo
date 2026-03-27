"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token") || "";

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (newPassword !== confirmPassword) {
            setError("Les mots de passe ne correspondent pas.");
            return;
        }

        if (!token) {
            setError("Token de réinitialisation manquant.");
            return;
        }

        setLoading(true);

        try {
            await api.resetPassword(token, newPassword);
            setSuccess(true);
            setTimeout(() => router.push("/login"), 3000);
        } catch (err: any) {
            setError(
                err.response?.data?.detail || "Une erreur est survenue. Le lien a peut-être expiré."
            );
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
                <div className="max-w-md w-full text-center">
                    <div className="rounded-md bg-red-50 p-6">
                        <h3 className="text-lg font-medium text-red-800 mb-2">
                            Lien invalide
                        </h3>
                        <p className="text-sm text-red-700 mb-4">
                            Ce lien de réinitialisation est invalide ou a expiré.
                        </p>
                        <Link
                            href="/forgot-password"
                            className="font-medium text-blue-600 hover:text-blue-500"
                        >
                            Demander un nouveau lien
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Nouveau mot de passe
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Choisissez un nouveau mot de passe sécurisé
                    </p>
                </div>

                {success ? (
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
                            Mot de passe modifié !
                        </h3>
                        <p className="text-sm text-green-700 mb-4">
                            Votre mot de passe a été réinitialisé avec succès.
                            Redirection vers la page de connexion...
                        </p>
                        <Link
                            href="/login"
                            className="font-medium text-blue-600 hover:text-blue-500"
                        >
                            Se connecter maintenant
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
                                    htmlFor="new-password"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Nouveau mot de passe
                                </label>
                                <div className="relative">
                                    <input
                                        id="new-password"
                                        name="new-password"
                                        type={showPassword ? "text" : "password"}
                                        required
                                        minLength={8}
                                        className="appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        placeholder="Min. 8 caractères, 1 majuscule, 1 chiffre"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                        aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                    >
                                        {showPassword ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.72 11.72 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.72 11.72 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.243 4.243l2.829 2.829M6.343 6.343l11.314 11.314M14.121 14.121A3 3 0 009.879 9.879" />
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="confirm-password"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Confirmer le mot de passe
                                </label>
                                <input
                                    id="confirm-password"
                                    name="confirm-password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    minLength={8}
                                    className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    placeholder="Confirmez le mot de passe"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
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

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-gray-500">Chargement...</p>
            </div>
        }>
            <ResetPasswordForm />
        </Suspense>
    );
}
