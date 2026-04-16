"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

interface LoginFormProps {
  initialTenantSlug?: string;
  hideTenantField?: boolean;
}

export default function LoginForm({ initialTenantSlug = "", hideTenantField = false }: LoginFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    tenant_slug: initialTenantSlug,
    rememberMe: true,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Load remembered credentials on mount
  useEffect(() => {
    const savedRemember = localStorage.getItem("remember_login_choice");
    const savedEmail = localStorage.getItem("remembered_email");
    
    // Default to true if not set, otherwise use saved value
    const shouldRemember = savedRemember === null ? true : savedRemember === "true";
    
    setFormData(prev => ({
      ...prev,
      rememberMe: shouldRemember,
      email: shouldRemember && savedEmail ? savedEmail : prev.email
    }));
  }, []);

  // Persist remember choice whenever it changes
  useEffect(() => {
    localStorage.setItem("remember_login_choice", formData.rememberMe.toString());
    if (!formData.rememberMe) {
      localStorage.removeItem("remembered_email");
    }
  }, [formData.rememberMe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.login(
        formData.email,
        formData.password,
        formData.tenant_slug
      );

      localStorage.setItem("access_token", response.access_token);
      localStorage.setItem("user_id", response.user_id);
      localStorage.setItem("tenant_id", response.tenant_id);
      localStorage.setItem("tenant_slug", formData.tenant_slug);

      // Save email for next time if rememberMe is checked
      if (formData.rememberMe) {
        localStorage.setItem("remembered_email", formData.email);
      }

      router.push(`/${formData.tenant_slug}/home`);
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Erreur de connexion. Vérifiez vos identifiants."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100 px-8 py-6 md:px-10 md:py-8 w-full max-w-sm transition-all">
      <div className="mb-4 text-center md:text-left">
        <h3 className="text-lg font-semibold text-slate-800 tracking-tight">
          Accédez à votre espace
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-[11px] font-medium animate-in shake duration-300">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {!hideTenantField && (
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-500 px-1">Code de votre établissement</label>
              <div className="relative group">
                <input
                  type="text"
                  required
                  placeholder="mon-club"
                  className="w-full p-3 pl-11 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                  value={formData.tenant_slug}
                  onChange={(e) => setFormData({ ...formData, tenant_slug: e.target.value })}
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 opacity-50 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-slate-500 px-1">Adresse email</label>
            <div className="relative group">
              <input
                type="email"
                required
                placeholder="votre@email.com"
                className="w-full p-3 pl-11 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 opacity-50 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <div className="space-y-1.5 relative">
            <label className="text-[13px] font-medium text-slate-500 px-1">Mot de passe</label>
            <div className="relative group">
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                className="w-full p-3 pl-11 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 opacity-50 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.72 11.72 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.72 11.72 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.243 4.243l2.829 2.829M6.343 6.343l11.314 11.314M14.121 14.121A3 3 0 009.879 9.879" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <div className="flex justify-end mt-1 px-1">
              <Link href="/forgot-password" style={{ color: 'var(--primary-color, #2563eb)' }} className="text-[11px] font-medium hover:underline transition-colors">Mot de passe oublié ?</Link>
            </div>
          </div>
        </div>

        <div className="flex items-center px-1">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-slate-500 focus:ring-slate-500 transition-all cursor-pointer"
              checked={formData.rememberMe}
              onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
            />
            <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700 transition-colors">Rester connecté</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ backgroundColor: 'var(--primary-color, #0f172a)' }}
          className="w-full py-2.5 text-white font-medium text-sm rounded-xl transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 mt-1 hover:opacity-90"
        >
          {loading ? "Chargement..." : "Se connecter"}
        </button>

        <div className="text-center pt-0.5">
          <p className="text-xs font-normal text-slate-400">
            Pas encore de compte ?{" "}
            <Link 
              href={hideTenantField ? `/${formData.tenant_slug}/register` : "/register"} 
              style={{ color: 'var(--primary-color, #2563eb)' }}
              className="hover:underline font-medium"
            >
              S'inscrire
            </Link>
          </p>
        </div>
      </form>

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
