"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

export default function ProfilePage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [formData, setFormData] = useState<Partial<User> & { password?: string }>({});
    const [tenantSettings, setTenantSettings] = useState<any>(null);
    const [showPassword, setShowPassword] = useState(false);

    const handleLogout = () => {
        localStorage.clear();
        router.push("/login");
    };

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
                    remind_before_session: data.remind_before_session ?? true,
                    receive_marketing_emails: data.receive_marketing_emails ?? true,
                });
            })
            .catch(() => {
                setMessage({ type: "error", text: "Erreur lors de la récupération du profil." });
            })
            .finally(() => setLoading(false));
        
        api.getTenantSettings()
            .then(setTenantSettings)
            .catch(() => { });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFormData((prev) => ({ ...prev, [name]: checked }));
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
            <div className="flex min-h-screen bg-slate-50 items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
        <div className="min-h-[100dvh] bg-white flex flex-col items-center overflow-x-hidden safe-top pb-24 md:pb-12">
            
            {/* Header Mobile - PWA Style - Compact */}
            <header className="fixed top-0 left-0 right-0 z-40 w-full bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 h-14 safe-top shadow-sm md:hidden">
                <Link href="/dashboard" className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 active:scale-95 transition-all text-slate-400">
                    <span className="text-lg">←</span>
                </Link>
            </header>

            {/* Main Content Centered */}
            <main className="w-full max-w-4xl mx-auto px-5 pb-5 md:p-12 pt-14 md:pt-16">
                <div className="pt-2">
                    {/* Header Desktop - Breadcrumb Style */}
                    <Link href="/dashboard" className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-blue-600 transition-colors group">
                        <span className="text-lg group-hover:-translate-x-1 transition-transform">←</span>
                        Retour
                    </Link>

                <div className="space-y-6">
                    {/* Header - Standardized Style */}
                    <header className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-50/5 rounded-xl md:rounded-2xl flex items-center justify-center p-2 md:p-3 border border-blue-100/50 shadow-sm shrink-0">
                                <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-blue-500/80" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                    <path d="M5 20C5 17.2386 7.23858 15 10 15H14C16.7614 15 19 17.2386 19 20" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                    <path d="M15 5H21M15 8H21M15 11H18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
                            </div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight capitalize">
                                {user?.first_name} {user?.last_name}
                            </h1>
                        </div>
                        <p className="text-slate-500 font-medium text-xs md:text-sm px-1">Gérez vos informations de profil</p>
                    </header>

                    {message.text && (
                        <div className={`p-4 rounded-2xl flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-4 ${message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"}`}>
                            <span className="text-xl">{message.type === "success" ? "✨" : "⚠️"}</span>
                            <span className="font-medium">{message.text}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Identity Section */}
                        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100">
                            <h2 className="text-[11px] font-medium text-slate-400 mb-6 flex items-center gap-2 px-1 tracking-widest">
                                👤 Identité
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Prénom <span className="text-slate-900">*</span></label>
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
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Nom <span className="text-slate-900">*</span></label>
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
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Date de naissance <span className="text-slate-900">*</span></label>
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
                        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100">
                            <h2 className="text-[11px] font-medium text-slate-400 mb-6 flex items-center gap-2 px-1 tracking-widest">
                                📧 Contact
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Email <span className="text-slate-900">*</span></label>
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
                                    <label className="text-sm font-semibold text-slate-700 ml-1">Téléphone <span className="text-slate-900">*</span></label>
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
                        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100">
                            <h2 className="text-[11px] font-medium text-slate-400 mb-6 flex items-center gap-2 px-1 tracking-widest">
                                📍 Adresse
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
                                        <label className="text-sm font-semibold text-slate-700 ml-1">Ville <span className="text-slate-900">*</span></label>
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
                        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100">
                            <h2 className="text-[11px] font-medium text-slate-400 mb-6 flex items-center gap-2 px-1 tracking-widest">
                                📱 Réseaux sociaux
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
                        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100">
                            <h2 className="text-[11px] font-medium text-slate-400 mb-6 flex items-center gap-2 px-1 tracking-widest">
                                🔒 Sécurité
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

                        {/* Preferences Section */}
                        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 mt-6">
                            <h2 className="text-[11px] font-medium text-slate-400 mb-6 flex items-center gap-2 px-1 tracking-widest">
                                ⚙️ Préférences
                            </h2>
                            <div className="space-y-4">
                                <label className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-colors cursor-pointer group">
                                    <input 
                                        type="checkbox"
                                        name="remind_before_session"
                                        checked={formData.remind_before_session}
                                        onChange={handleCheckboxChange}
                                        className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                    />
                                    <div className="flex flex-col text-left">
                                        <span className="text-sm font-semibold text-slate-700">Rappels de réservation</span>
                                        <span className="text-[10px] text-slate-400">Recevoir un rappel email la veille de mes séances</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-colors cursor-pointer group border-t border-slate-50">
                                    <input 
                                        type="checkbox"
                                        name="receive_marketing_emails"
                                        checked={formData.receive_marketing_emails}
                                        onChange={handleCheckboxChange}
                                        className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                    />
                                    <div className="flex flex-col text-left">
                                        <span className="text-sm font-semibold text-slate-700">Actualités et promotions</span>
                                        <span className="text-[10px] text-slate-400">Recevoir les emails d'information de {tenantSettings?.name || "votre club"}</span>
                                    </div>
                                </label>
                            </div>
                        </section>

                        <div className="flex flex-col gap-4 pt-10 pb-6">
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full max-w-sm mx-auto px-8 py-3.5 bg-slate-900 text-white font-medium rounded-2xl shadow-xl shadow-slate-900/10 hover:bg-slate-800 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Enregistrement...
                                    </>
                                ) : (
                                    <>Enregistrer les modifications</>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={handleLogout}
                                className="w-full max-w-sm mx-auto px-8 py-3.5 bg-white border border-slate-200 text-slate-400 font-medium rounded-2xl hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-all active:scale-[0.99] flex items-center justify-center gap-2 text-sm shadow-sm"
                            >
                                Déconnexion
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </main>

            <BottomNav userRole={user?.role} />

            {/* Global style for safe areas */}
            <style jsx global>{`
                @supports (-webkit-touch-callout: none) {
                    .safe-top { padding-top: env(safe-area-inset-top); }
                    .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
                }
            `}</style>
        </div>
    );
}
