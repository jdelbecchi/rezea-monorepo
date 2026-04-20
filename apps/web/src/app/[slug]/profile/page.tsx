"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { api, User } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

export default function ProfilePage() {
    const params = useParams();
    const slug = params.slug;
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [formData, setFormData] = useState<Partial<User> & { password?: string }>({});
    const [tenantSettings, setTenantSettings] = useState<any>(null);
    const [showPassword, setShowPassword] = useState(false);

    const handleClose = () => {
        router.push(`/${slug}/home`);
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

    const primaryColor = tenantSettings?.primary_color || '#2563eb';
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    if (loading) {
        return (
            <div className="min-h-[100dvh] bg-white flex flex-col items-center overflow-x-hidden safe-top pb-24 md:pb-12">
                <header className="fixed top-0 left-0 right-0 z-40 w-full bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 h-14 safe-top shadow-sm md:hidden">
                    <Link href={`/${slug}/home`} className="flex items-center gap-2 group text-slate-400 active:scale-95 transition-all">
                        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 ml-0.5" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-[13px] font-medium leading-none">Retour</span>
                    </Link>
                </header>
                
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-300 mb-4"></div>
                </div>
                <BottomNav />
            </div>
        );
    }


    return (
        <div className="min-h-[100dvh] bg-white flex flex-col items-center overflow-x-hidden safe-top pb-24 md:pb-12">
            
            {/* Header Desktop - Branding & Context */}
            <header className="hidden md:flex fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-lg border-b border-slate-100 z-50 px-12 items-center justify-between">
                <div className="flex items-center gap-3">
                    {tenantSettings?.logo_url ? (
                        <img src={`${API_URL}${tenantSettings.logo_url}`} className="h-8 w-8 object-contain" alt="Logo" />
                    ) : (
                        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-[10px] font-medium text-white">
                            {tenantSettings?.name?.[0]?.toUpperCase() || 'R'}
                        </div>
                    )}
                    <span className="text-sm font-medium tracking-tight text-slate-800">
                        {tenantSettings?.name || "rezea"}
                    </span>
                </div>
            </header>

            {/* Header Mobile - Simple Back Button */}
            <header className="fixed top-0 left-0 right-0 z-40 w-full bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 h-14 safe-top shadow-sm md:hidden">
                <Link href={`/${slug}/home`} className="flex items-center gap-2 group text-slate-400 active:scale-95 transition-all">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 ml-0.5" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-[13px] font-medium leading-none">Retour</span>
                </Link>
            </header>

            {/* Main Content Centered */}
            <main className="w-full max-w-4xl mx-auto px-5 pb-5 md:p-12 pt-16 md:pt-24">
                <div className="pt-0">
                    {/* Header Desktop - Breadcrumb Style */}
                    <Link href={`/${slug}/home`} className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-900 transition-colors group mb-8">
                        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 transition-transform group-hover:-translate-x-1" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="leading-none">Retour</span>
                    </Link>

                    <div className="space-y-6">
                        {/* Header - Standardized Style restored with original icon and subtitle */}
                        <header className="space-y-1">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-50 rounded-xl md:rounded-2xl flex items-center justify-center p-2 md:p-3 border border-slate-100 shadow-sm shrink-0">
                                    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-slate-400" xmlns="http://www.w3.org/2000/svg">
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
                            <div className={`p-4 rounded-2xl flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-4 ${message.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-rose-50 text-rose-800 border border-rose-100"}`}>
                                <span className="text-xl">{message.type === "success" ? "✨" : "⚠️"}</span>
                                <span className="font-medium text-sm">{message.text}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Identity Section */}
                            <div className="space-y-1.5">
                                <div className="flex justify-end pr-2">
                                    <h2 className="text-[11px] font-bold text-slate-400 flex items-center gap-2 tracking-widest uppercase">
                                        Identité 👤
                                    </h2>
                                </div>
                                <section 
                                    className="bg-slate-50 p-5 md:p-6 rounded-3xl border transition-all duration-500"
                                    style={{ 
                                        boxShadow: `4px 6px 18px -2px ${primaryColor}45`,
                                        borderColor: `${primaryColor}20`
                                    }}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[13px] font-medium text-slate-500 ml-1">Prénom <span className="text-rose-400">*</span></label>
                                            <input
                                                type="text"
                                                name="first_name"
                                                value={formData.first_name || ""}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[13px] font-medium text-slate-500 ml-1">Nom <span className="text-rose-400">*</span></label>
                                            <input
                                                type="text"
                                                name="last_name"
                                                value={formData.last_name || ""}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium"
                                                required
                                            />
                                        </div>
                                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 md:col-span-2">
                                            <label className="text-[13px] font-medium text-slate-500 ml-1 md:min-w-[120px]">Date de naissance</label>
                                            <input
                                                type="date"
                                                name="birth_date"
                                                value={formData.birth_date || ""}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium max-w-sm"
                                            />
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Contact Section */}
                            <div className="space-y-1.5">
                                <div className="flex justify-end pr-2">
                                    <h2 className="text-[11px] font-bold text-slate-400 flex items-center gap-2 tracking-widest uppercase">
                                        Contact 📧
                                    </h2>
                                </div>
                                <section 
                                    className="bg-slate-50 p-5 md:p-6 rounded-3xl border transition-all duration-500"
                                    style={{ 
                                        boxShadow: `4px 6px 18px -2px ${primaryColor}45`,
                                        borderColor: `${primaryColor}20`
                                    }}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[13px] font-medium text-slate-500 ml-1">Email <span className="text-rose-400">*</span></label>
                                            <input
                                                type="email"
                                                name="email"
                                                value={formData.email || ""}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[13px] font-medium text-slate-500 ml-1">Téléphone</label>
                                            <input
                                                type="tel"
                                                name="phone"
                                                value={formData.phone || ""}
                                                onChange={handleChange}
                                                placeholder="06 00 00 00 00"
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium"
                                            />
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Address Section */}
                            <div className="space-y-1.5">
                                <div className="flex justify-end pr-2">
                                    <h2 className="text-[11px] font-bold text-slate-400 flex items-center gap-2 tracking-widest uppercase">
                                        Adresse 📍
                                    </h2>
                                </div>
                                <section 
                                    className="bg-slate-50 p-5 md:p-6 rounded-3xl border transition-all duration-500"
                                    style={{ 
                                        boxShadow: `4px 6px 18px -2px ${primaryColor}45`,
                                        borderColor: `${primaryColor}20`
                                    }}
                                >
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[13px] font-medium text-slate-500 ml-1">Rue</label>
                                            <input
                                                type="text"
                                                name="street"
                                                value={formData.street || ""}
                                                onChange={handleChange}
                                                placeholder="Ex: 12 rue de la Paix"
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[13px] font-medium text-slate-500 ml-1">Code postal</label>
                                                <input
                                                    type="text"
                                                    name="zip_code"
                                                    value={formData.zip_code || ""}
                                                    onChange={handleChange}
                                                    placeholder="75000"
                                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[13px] font-medium text-slate-500 ml-1">Ville</label>
                                                <input
                                                    type="text"
                                                    name="city"
                                                    value={formData.city || ""}
                                                    onChange={handleChange}
                                                    placeholder="Paris"
                                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Social Section */}
                            <div className="space-y-1.5">
                                <div className="flex justify-end pr-2">
                                    <h2 className="text-[11px] font-bold text-slate-400 flex items-center gap-2 tracking-widest uppercase">
                                        Réseaux sociaux 📱
                                    </h2>
                                </div>
                                <section 
                                    className="bg-slate-50 p-5 md:p-6 rounded-3xl border transition-all duration-500"
                                    style={{ 
                                        boxShadow: `4px 6px 18px -2px ${primaryColor}45`,
                                        borderColor: `${primaryColor}20`
                                    }}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[13px] font-medium text-slate-500 ml-1">Instagram</label>
                                            <input
                                                type="text"
                                                name="instagram_handle"
                                                value={formData.instagram_handle || ""}
                                                onChange={handleChange}
                                                placeholder="@pseudo"
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[13px] font-medium text-slate-500 ml-1">Facebook</label>
                                            <input
                                                type="text"
                                                name="facebook_handle"
                                                value={formData.facebook_handle || ""}
                                                onChange={handleChange}
                                                placeholder="Pseudo ou lien"
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium"
                                            />
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Security Section */}
                            <div className="space-y-1.5">
                                <div className="flex justify-end pr-2">
                                    <h2 className="text-[11px] font-bold text-slate-400 flex items-center gap-2 tracking-widest uppercase">
                                        Sécurité 🔒
                                    </h2>
                                </div>
                                <section 
                                    className="bg-slate-50 p-5 md:p-6 rounded-3xl border transition-all duration-500"
                                    style={{ 
                                        boxShadow: `4px 6px 18px -2px ${primaryColor}45`,
                                        borderColor: `${primaryColor}20`
                                    }}
                                >
                                    <div className="space-y-2">
                                        <label className="text-[13px] font-medium text-slate-500 ml-1">Modifier le mot de passe</label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                name="password"
                                                value={formData.password || ""}
                                                onChange={handleChange}
                                                placeholder="Laisser vide pour ne pas modifier"
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all outline-none text-slate-900 font-medium pr-12"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                                            >
                                                {showPassword ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Preferences Section */}
                            <div className="space-y-1.5">
                                <div className="flex justify-end pr-2">
                                    <h2 className="text-[11px] font-bold text-slate-400 flex items-center gap-2 tracking-widest uppercase">
                                        Préférences ⚙️
                                    </h2>
                                </div>
                                <section 
                                    className="bg-slate-50 p-2 md:p-4 rounded-3xl border transition-all duration-500"
                                    style={{ 
                                        boxShadow: `4px 6px 18px -2px ${primaryColor}45`,
                                        borderColor: `${primaryColor}20`
                                    }}
                                >
                                    <div className="space-y-1">
                                        <label className="flex items-center gap-4 py-2 px-4 rounded-2xl hover:bg-white transition-all cursor-pointer group">
                                            <input 
                                                type="checkbox"
                                                name="remind_before_session"
                                                checked={formData.remind_before_session}
                                                onChange={handleCheckboxChange}
                                                className="w-4 h-4 rounded border-slate-300 transition-all cursor-pointer"
                                                style={{ accentColor: primaryColor }}
                                            />
                                            <div className="flex flex-col text-left">
                                                <span className="text-sm font-medium text-slate-800">Rappels de réservation</span>
                                                <span className="text-[10px] text-slate-400 font-medium">Email la veille de mes séances</span>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-4 py-2 px-4 rounded-2xl hover:bg-white transition-all cursor-pointer group">
                                            <input 
                                                type="checkbox"
                                                name="receive_marketing_emails"
                                                checked={formData.receive_marketing_emails}
                                                onChange={handleCheckboxChange}
                                                className="w-4 h-4 rounded border-slate-300 transition-all cursor-pointer"
                                                style={{ accentColor: primaryColor }}
                                            />
                                            <div className="flex flex-col text-left">
                                                <span className="text-sm font-medium text-slate-800">Actualités & Offres</span>
                                                <span className="text-[10px] text-slate-400 font-medium">Nouveautés et évènements du club</span>
                                            </div>
                                        </label>
                                    </div>
                                </section>
                            </div>

                            <div className="flex flex-col gap-4 pt-2 pb-4">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="w-full max-w-md mx-auto px-8 py-3.5 bg-slate-900 text-white font-medium rounded-2xl shadow-xl shadow-slate-900/10 hover:bg-slate-800 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm font-semibold"
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
                                    onClick={handleClose}
                                    className="w-full max-w-md mx-auto px-8 py-3.5 bg-white border border-slate-200 text-slate-400 font-medium rounded-2xl hover:bg-slate-50 hover:text-slate-600 hover:border-slate-300 transition-all active:scale-[0.99] flex items-center justify-center gap-2 text-sm shadow-sm"
                                >
                                    Fermer
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
