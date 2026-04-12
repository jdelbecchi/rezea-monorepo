"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, Tenant } from "@/lib/api";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    tenant_slug: "",
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
      // Don't show error yet, maybe they are still typing
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenant) {
        setError("Veuillez saisir un code établissement valide");
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
      await api.register(formData);
      router.push("/login?registered=true");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur d'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 font-sans">
      <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-xl shadow-slate-200 border border-slate-100">
        <div className="text-center mb-8">
            {tenant?.logo_url ? (
                <img src={`${API_URL}${tenant.logo_url}`} className="h-16 mx-auto mb-4 object-contain" alt="Logo" />
            ) : (
                <div className="text-4xl mb-2">🏗️</div>
            )}
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Inscription</h2>
            {tenant && (
                <p className="text-slate-500 font-bold mt-1">Rejoindre <span className="text-blue-600">{tenant.name}</span></p>
            )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="relative group">
            <input
                className={`w-full p-4 pl-12 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all font-medium border ${!formData.tenant_slug ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-200'}`}
                placeholder="Code Établissement *"
                value={formData.tenant_slug}
                onChange={e => setFormData({ ...formData, tenant_slug: e.target.value.toLowerCase() })}
                required
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🏢</span>
            {lookupLoading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent animate-spin rounded-full"></div>
                </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
                <input
                    className={`w-full p-4 pl-11 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all font-medium border ${!formData.first_name ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-200'}`}
                    placeholder="Prénom *"
                    value={formData.first_name}
                    onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                    required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg">👤</span>
            </div>
            <div className="relative">
                <input
                    className={`w-full p-4 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all font-medium border ${!formData.last_name ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-200'}`}
                    placeholder="Nom *"
                    value={formData.last_name}
                    onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                    required
                />
            </div>
          </div>

          <div className="relative">
            <input
                className={`w-full p-4 pl-12 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all font-medium border ${!formData.email ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-200'}`}
                type="email"
                placeholder="Email *"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                required
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">✉️</span>
          </div>

          <div className="relative">
            <input
                className={`w-full p-4 pl-12 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all font-medium border ${!formData.password ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-200'}`}
                type="password"
                placeholder="Mot de passe *"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                required
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔒</span>
          </div>

          {tenant && (tenant.cgv_url || tenant.rules_url) && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                          type="checkbox"
                          className="mt-1.5 h-5 w-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 transition-all"
                          checked={formData.docs_accepted}
                          onChange={e => setFormData({ ...formData, docs_accepted: e.target.checked })}
                      />
                      <span className="text-sm font-semibold text-slate-600 group-hover:text-slate-900 transition-colors">
                          J&apos;accepte les {tenant.cgv_url && (
                              <a href={`${API_URL}${tenant.cgv_url}`} target="_blank" className="text-blue-600 hover:underline">Conditions Générales de Vente</a>
                          )}
                          {tenant.cgv_url && tenant.rules_url && " et le "}
                          {tenant.rules_url && (
                              <a href={`${API_URL}${tenant.rules_url}`} target="_blank" className="text-blue-600 hover:underline">Règlement Intérieur</a>
                          )}
                      </span>
                  </label>
              </div>
          )}

          {error && (
              <div className="p-4 bg-rose-50 text-rose-700 text-sm font-bold rounded-2xl border border-rose-100 animate-in shake duration-300">
                  ⚠️ {error}
              </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white p-4 rounded-2xl font-black text-lg hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 active:scale-95"
          >
            {loading ? (
                <div className="flex items-center justify-center gap-2">
                     <div className="h-5 w-5 border-2 border-white border-t-transparent animate-spin rounded-full"></div>
                     Chargement...
                </div>
            ) : "Créer mon compte"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm font-bold text-slate-500">
          Déjà inscrit ? <Link href="/login" className="text-blue-600 hover:underline">Connexion</Link>
        </p>
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
