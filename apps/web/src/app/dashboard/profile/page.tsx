"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { api, User } from "@/lib/api";

export default function ProfilePage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [formData, setFormData] = useState<Partial<User> & { password?: string }>({});

    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        api.getCurrentUser()
            .then((data) => {
                setUser(data);
                setFormData({
                    first_name: data.first_name,
                    last_name: data.last_name,
                    email: data.email,
                    phone: data.phone || "",
                    street: data.street || "",
                    zip_code: data.zip_code || "",
                    city: data.city || "",
                    birth_date: data.birth_date || "",
                    instagram_handle: data.instagram_handle || "",
                    facebook_handle: data.facebook_handle || "",
                });
            })
            .catch(() => {
                setMessage({ type: "error", text: "Erreur lors de la récupération du profil." });
            })
            .finally(() => setLoading(false));
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ type: "", text: "" });

        try {
            // Clean up data: convert empty strings to null and remove empty password
            const dataToSave: any = {};
            Object.entries(formData).forEach(([key, value]) => {
                if (key === 'password' && !value) return;
                dataToSave[key] = value === "" ? null : value;
            });

            const updatedUser = await api.updateCurrentUser(dataToSave);
            setUser(updatedUser);
            setMessage({ type: "success", text: "Profil mis à jour avec succès !" });
            // Clear password field
            setFormData(prev => ({ ...prev, password: "" }));
        } catch (err: any) {
            console.error("Update error:", err);
            let errorMsg = "Erreur lors de la mise à jour.";
            
            if (err.response?.data?.detail) {
                const detail = err.response.data.detail;
                if (typeof detail === 'string') {
                    errorMsg = detail;
                } else if (Array.isArray(detail)) {
                    errorMsg = detail.map((d: any) => `${d.loc.join('.')}: ${d.msg}`).join(', ');
                } else {
                    errorMsg = JSON.stringify(detail);
                }
            }
            setMessage({ type: "error", text: errorMsg });
        } finally {
            setSaving(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen bg-slate-50">
                <Sidebar user={user} />
                <main className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </main>
            </div>
        );
    }

    const ROLE_LABELS: Record<string, string> = {
        owner: "Propriétaire",
        manager: "Manager",
        staff: "Equipe",
        user: "Membre",
    };

    return (
        <div className="flex min-h-screen bg-[#F8FAFC]">
            <Sidebar user={user} />
            <main className="flex-1 p-4 md:p-8">
                <div className="max-w-4xl mx-auto space-y-8">
                    {/* Header Card */}
                    <div className="relative overflow-hidden bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-50 blur-2xl"></div>
                        <div className="relative flex items-center gap-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-blue-200">
                                <span className="text-white font-bold">
                                    {user?.first_name?.[0].toUpperCase()}
                                    {user?.last_name?.[0].toUpperCase()}
                                </span>
                            </div>
                            <div>
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                    {user?.first_name} {user?.last_name}
                                </h1>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-full border border-blue-100">
                                        {ROLE_LABELS[user?.role || "user"]}
                                    </span>
                                    {user?.is_active ? (
                                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider rounded-full border border-emerald-100">
                                            Actif
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 bg-rose-50 text-rose-700 text-xs font-bold uppercase tracking-wider rounded-full border border-rose-100">
                                            Inactif
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {message.text && (
                        <div className={`p-4 rounded-2xl flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-4 ${message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"}`}>
                            <span className="text-xl">{message.type === "success" ? "✨" : "⚠️"}</span>
                            <span className="font-medium">{message.text}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Identity Section */}
                        <section className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                                <span className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-sm">👤</span>
                                Identité
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Prénom</label>
                                    <input
                                        type="text"
                                        name="first_name"
                                        value={formData.first_name || ""}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Nom</label>
                                    <input
                                        type="text"
                                        name="last_name"
                                        value={formData.last_name || ""}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Date de naissance</label>
                                    <input
                                        type="date"
                                        name="birth_date"
                                        value={formData.birth_date || ""}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Contact Section */}
                        <section className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                                <span className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-sm">📧</span>
                                Contact
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Email</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email || ""}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Téléphone</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone || ""}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Address Section */}
                        <section className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                                <span className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-sm">📍</span>
                                Adresse
                            </h2>
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Rue</label>
                                    <input
                                        type="text"
                                        name="street"
                                        value={formData.street || ""}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 ml-1">Code postal</label>
                                        <input
                                            type="text"
                                            name="zip_code"
                                            value={formData.zip_code || ""}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 ml-1">Ville</label>
                                        <input
                                            type="text"
                                            name="city"
                                            value={formData.city || ""}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium"
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Social Section */}
                        <section className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                                <span className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-sm">📱</span>
                                Réseaux Sociaux
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Instagram (@pseudo)</label>
                                    <input
                                        type="text"
                                        name="instagram_handle"
                                        value={formData.instagram_handle || ""}
                                        onChange={handleChange}
                                        placeholder="@votre_pseudo"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Facebook</label>
                                    <input
                                        type="text"
                                        name="facebook_handle"
                                        value={formData.facebook_handle || ""}
                                        onChange={handleChange}
                                        placeholder="Lien ou pseudo"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Security Section */}
                        <section className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                                <span className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-sm">🔒</span>
                                Sécurité
                            </h2>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 ml-1">Nouveau mot de passe</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        name="password"
                                        value={formData.password || ""}
                                        onChange={handleChange}
                                        placeholder="Laisser vide pour ne pas modifier"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-slate-900 font-medium pr-12"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors p-1"
                                        title={showPassword ? "Masquer" : "Afficher"}
                                    >
                                        {showPassword ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88L4.62 4.62"></path><path d="M1 1l22 22"></path><path d="M9.06 13.94l-2.09 2.09"></path><path d="M11.72 11.72l-1.84 1.84"></path><path d="M13.07 13.07l-2.19 2.19"></path><path d="M14.78 14.78l-2.35 2.35"></path><path d="M17.29 17.29l-3.32 3.32"></path><path d="M20.41 20.41l-2.12 2.12"></path><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                        )}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400 ml-1">Huit caractères minimum, dont une majuscule et un chiffre.</p>
                            </div>
                        </section>

                        <div className="flex justify-end pt-4">
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold rounded-2xl shadow-xl shadow-blue-200 hover:shadow-blue-300 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Enregistrement...
                                    </>
                                ) : (
                                    <>💾 Enregistrer les modifications</>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}
