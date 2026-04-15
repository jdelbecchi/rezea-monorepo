"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api, Tenant } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ClubSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load remembered club on mount
  useEffect(() => {
    const saved = localStorage.getItem("remembered_tenant_name");
    const savedSlug = localStorage.getItem("remembered_tenant_slug");
    const savedChoice = localStorage.getItem("remember_tenant_choice") === "true";
    
    if (savedChoice) {
      setRememberChoice(true);
      if (saved && savedSlug) {
        setQuery(saved);
      }
    }
  }, []);

  // Save remember preference whenever it changes
  useEffect(() => {
    localStorage.setItem("remember_tenant_choice", rememberChoice.toString());
    if (!rememberChoice) {
      localStorage.removeItem("remembered_tenant_slug");
      localStorage.removeItem("remembered_tenant_name");
    }
  }, [rememberChoice]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const tenants = await api.searchTenants(query);
        setResults(tenants);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (tenant: Tenant) => {
    setQuery(tenant.name);
    setSelectedTenant(tenant);
    setIsOpen(false);
  };

  const handleConfirm = () => {
    const tenant = selectedTenant || results.find(r => r.name.toLowerCase() === query.toLowerCase() || r.slug.toLowerCase() === query.toLowerCase());
    
    if (!tenant) return;

    if (rememberChoice) {
      localStorage.setItem("remembered_tenant_slug", tenant.slug);
      localStorage.setItem("remembered_tenant_name", tenant.name);
    } else {
      localStorage.removeItem("remembered_tenant_slug");
      localStorage.removeItem("remembered_tenant_name");
    }

    router.push(`/${tenant.slug}`);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 space-y-6 transition-all" ref={containerRef}>
      <div className="space-y-4">
        <h3 className="text-[11px] md:text-sm font-semibold text-slate-800 tracking-tight text-center md:text-left uppercase whitespace-nowrap">
          À quel établissement souhaitez-vous accéder ?
        </h3>

        <div className="relative group">
          <div className="relative">
            <input
              type="text"
              placeholder="Rechercher votre club..."
              className="w-full p-3 pl-11 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all font-medium text-slate-900 text-sm shadow-sm"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleConfirm();
                }
              }}
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 opacity-50 group-focus-within:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {loading && (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 border-2 border-slate-600 border-t-transparent animate-spin rounded-full"></div>
              </div>
            )}
          </div>

          {/* Results Dropdown */}
          {isOpen && (results.length > 0 || !loading) && query.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-100 shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              {results.length > 0 ? (
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {results.map((tenant) => (
                    <button
                      key={tenant.slug}
                      onClick={() => handleSelect(tenant)}
                      className="w-full flex items-center gap-3 p-2.5 hover:bg-slate-50 transition-colors rounded-lg text-left group"
                    >
                      <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                        {tenant.logo_url ? (
                          <img src={`${API_URL}${tenant.logo_url}`} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{tenant.slug.substring(0, 2)}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{tenant.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">rezea.fr/{tenant.slug}</p>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 text-xs">
                  Aucun établissement trouvé pour "{query}"
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-3 cursor-pointer group px-1">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 transition-all cursor-pointer"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
          />
          <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700 transition-colors">Se souvenir de mon choix</span>
        </label>

        <button
          onClick={handleConfirm}
          disabled={!query || results.length === 0}
          className="w-full py-2.5 bg-slate-900 text-white font-medium text-sm rounded-xl hover:bg-slate-800 transition-all active:scale-[0.98] shadow-sm disabled:opacity-50"
        >
          Confirmer
        </button>
      </div>
    </div>
  );
}
