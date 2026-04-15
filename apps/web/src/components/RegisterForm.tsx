"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, Tenant } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RegisterFormProps {
  initialTenantSlug?: string;
  hideTenantField?: boolean;
}

export default function RegisterForm({ initialTenantSlug = "", hideTenantField = false }: RegisterFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"express" | "complet">("express");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    tenant_slug: initialTenantSlug,
    phone: "",
    street: "",
    zip_code: "",
    city: "",
    birth_date: "",
    instagram_handle: "",
    facebook_handle: "",
    remind_before_session: true,
    receive_marketing_emails: true,
    docs_accepted: false,
  });
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Debounce tenant lookup
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.tenant_slug && formData.tenant_slug.length > 2) {
        handleLookupTenant(formData.tenant_slug);
      } else {
          setTenant(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.tenant_slug]);

  const handleLookupTenant = async (slug: string) => {
    setLookupLoading(true);
    try {
      const data = await api.getTenantBySlug(slug);
      setTenant(data);
      setError("");
    } catch (err) {
      setTenant(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenant && !hideTenantField) {
        setError("Veuillez saisir un code établissement valide");
        return;
    }
    
    // Validation spécifique
    if (mode === "complet" && !formData.phone) {
        setError("Le numéro de téléphone est obligatoire pour un profil complet");
        return;
    }

    const hasDocs = tenant && (tenant.cgv_url || tenant.rules_url);
    if (hasDocs && !formData.docs_accepted) {
        setError("Vous devez accepter les conditions générales pour continuer");
        return;
    }

    setError("");
    setLoading(true);

    try {
      const dataToSave = { ...formData };
      (Object.keys(dataToSave) as Array<keyof typeof dataToSave>).forEach(key => {
          if (dataToSave[key] === "") {
              (dataToSave as any)[key] = null;
          }
      });

      await api.register(dataToSave);
      router.push(hideTenantField ? `/${formData.tenant_slug}?registered=true` : "/login?registered=true");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") {
          setError(detail);
      } else if (Array.isArray(detail)) {
          setError(detail.map((d: any) => d.msg).join(", "));
      } else {
          setError("Une erreur est survenue lors de l'inscription");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 md:p-10 w-full ${mode === "complet" ? "md:max-w-4xl" : "md:max-w-md"} relative z-10 transition-all duration-500`}>
        <div className="mb-6 text-center px-4">
            {tenant?.logo_url ? (
                <img src={`${API_URL}${tenant.logo_url}`} className="h-10 mx-auto mb-3 object-contain" alt="Logo" />
            ) : (
                <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2 uppercase">Rezea</h1>
            )}
            <h3 className="text-xl font-medium text-slate-800 tracking-tight">Créer votre compte</h3>
            {tenant && (
                <p className="text-slate-500 font-medium text-[11px] mt-1 uppercase tracking-widest leading-none">Rejoindre <span className="text-slate-900">{tenant.name}</span></p>
            )}
        </div>

        {/* Mode Selector */}
        <div className="flex p-1 bg-slate-100 rounded-2xl mb-6">
            <button 
                type="button"
                onClick={() => setMode("express")}
                className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold transition-all ${mode === "express" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
                Compte Express
                <span className="block text-[9px] font-normal opacity-60 mt-0.5 leading-tight">Inscription rapide pour<br className="md:hidden" /> des réservations ponctuelles</span>
            </button>
            <button 
                type="button"
                onClick={() => setMode("complet")}
                className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold transition-all ${mode === "complet" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
                Profil complet
                <span className="block text-[9px] font-normal opacity-60 mt-0.5 leading-tight">1 minute de plus pour<br className="md:hidden" /> de meilleurs échanges</span>
            </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
            <div className={`grid grid-cols-1 ${mode === "complet" ? "md:grid-cols-2" : ""} gap-x-12 gap-y-4`}>
                
                {/* Column 1 : Les Incontournables */}
                <div className="space-y-4">
                    {!hideTenantField && (
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-medium text-slate-500 px-1">Code de votre établissement <span className="text-rose-400">*</span></label>
                            <div className="relative group">
                                <input
                                    className="w-full p-2.5 pl-11 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                    placeholder="mon-club"
                                    value={formData.tenant_slug}
                                    onChange={e => setFormData({ ...formData, tenant_slug: e.target.value.toLowerCase() })}
                                    required
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 opacity-50 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                {lookupLoading && (
                                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                                        <div className="h-4 w-4 border-2 border-slate-600 border-t-transparent animate-spin rounded-full"></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-medium text-slate-500 px-1">Prénom <span className="text-rose-400">*</span></label>
                            <input
                                className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                placeholder="Jean"
                                value={formData.first_name}
                                onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-medium text-slate-500 px-1">Nom <span className="text-rose-400">*</span></label>
                            <input
                                className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                placeholder="Dupont"
                                value={formData.last_name}
                                onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-slate-500 px-1">Adresse email <span className="text-rose-400">*</span></label>
                        <div className="relative group">
                            <input
                                className="w-full p-2.5 pl-11 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                type="email"
                                placeholder="jean.dupont@email.com"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 opacity-50 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-slate-500 px-1">Mot de passe <span className="text-rose-400">*</span></label>
                        <div className="relative group">
                            <input
                                className="w-full p-2.5 pl-11 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                type="password"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                required
                            />
                            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 opacity-50 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Column 2 : Le Profil Complet */}
                {mode === "complet" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-slate-500 px-1">Téléphone <span className="text-rose-400">*</span></label>
                        <div className="relative group">
                            <input
                                className="w-full p-2.5 pl-11 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                placeholder="06 12 34 56 78"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                required
                            />
                            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 opacity-50 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                        </div>
                        </div>

                        <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-slate-500 px-1">Date de naissance</label>
                        <input
                            type="date"
                            className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                            value={formData.birth_date}
                            onChange={e => setFormData({ ...formData, birth_date: e.target.value })}
                        />
                        </div>

                        <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-slate-500 px-1">Adresse (Rue)</label>
                        <input
                            className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                            placeholder="12 rue de la Paix"
                            value={formData.street}
                            onChange={e => setFormData({ ...formData, street: e.target.value })}
                        />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-medium text-slate-500 px-1">Code Postal</label>
                            <input
                                className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                placeholder="75000"
                                value={formData.zip_code}
                                onChange={e => setFormData({ ...formData, zip_code: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-medium text-slate-500 px-1">Ville</label>
                            <input
                                className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                placeholder="Paris"
                                value={formData.city}
                                onChange={e => setFormData({ ...formData, city: e.target.value })}
                            />
                        </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-medium text-slate-500 px-1">Instagram</label>
                            <input
                                className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                placeholder="@username"
                                value={formData.instagram_handle}
                                onChange={e => setFormData({ ...formData, instagram_handle: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-medium text-slate-500 px-1">Facebook</label>
                            <input
                                className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                                placeholder="Nom Profil"
                                value={formData.facebook_handle}
                                onChange={e => setFormData({ ...formData, facebook_handle: e.target.value })}
                            />
                        </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Preferences & Infos */}
            <div className={`pt-6 border-t border-slate-100 flex flex-col ${mode === "complet" ? "md:flex-row md:items-center gap-x-12" : "gap-4"}`}>
                <div className="flex-1 space-y-3">
                    {mode === "complet" && (
                        <div className="space-y-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 transition-all cursor-pointer"
                                    checked={formData.remind_before_session}
                                    onChange={e => setFormData({ ...formData, remind_before_session: e.target.checked })}
                                />
                                <span className="text-[11px] text-slate-500 group-hover:text-slate-800 transition-colors">Recevoir des rappels par email la veille de mes séances</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 transition-all cursor-pointer"
                                    checked={formData.receive_marketing_emails}
                                    onChange={e => setFormData({ ...formData, receive_marketing_emails: e.target.checked })}
                                />
                                <span className="text-[11px] text-slate-500 group-hover:text-slate-800 transition-colors">Recevoir les actualités, les promos et les annonces d&apos;évènement</span>
                            </label>
                        </div>
                    )}

                    {tenant && (tenant.cgv_url || tenant.rules_url) && (
                        <label className="flex items-start gap-2.5 cursor-pointer group">
                            <input
                                type="checkbox"
                                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500 transition-all cursor-pointer"
                                checked={formData.docs_accepted}
                                onChange={e => setFormData({ ...formData, docs_accepted: e.target.checked })}
                            />
                            <span className="text-[10px] font-normal text-slate-400 group-hover:text-slate-600 transition-colors uppercase tracking-tight leading-normal">
                                J&apos;accepte les {tenant.cgv_url && (
                                    <a href={`${API_URL}${tenant.cgv_url}`} target="_blank" className="text-slate-900 hover:underline">conditions générales</a>
                                )}
                                {tenant.cgv_url && tenant.rules_url && " et le "}
                                {tenant.rules_url && (
                                    <a href={`${API_URL}${tenant.rules_url}`} target="_blank" className="text-slate-900 hover:underline">règlement intérieur</a>
                                )}
                            </span>
                        </label>
                    )}
                </div>

                {mode === "complet" && (
                    <div className="flex-1 flex items-start gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 mt-2 md:mt-0">
                        <div className="p-2 bg-white rounded-xl shadow-sm flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <p className="text-[11px] text-blue-700 leading-relaxed">
                            Vous pouvez à tout moment compléter ou mettre à jour vos informations dans <strong>Mon profil</strong>.
                        </p>
                    </div>
                )}
            </div>

            {error && (
                <div className="p-3 bg-rose-50 text-rose-700 text-[11px] font-medium rounded-xl border border-rose-100 animate-in shake duration-300">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                style={{ backgroundColor: 'var(--primary-color, #0f172a)' }}
                className="w-full text-white p-3 rounded-xl font-medium text-sm transition-all shadow-sm shadow-slate-200/50 disabled:opacity-50 active:scale-95 mt-4 hover:opacity-90"
            >
                {loading ? "Chargement..." : "Créer mon compte"}
            </button>
        </form>

        <p className="mt-8 text-center text-xs font-normal text-slate-400">
            Déjà inscrit ? <Link 
                href={hideTenantField ? `/${formData.tenant_slug}` : "/login"} 
                style={{ color: 'var(--primary-color, #2563eb)' }}
                className="hover:underline font-medium"
            >Connexion</Link>
        </p>

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
