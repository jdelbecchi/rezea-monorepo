"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, Tenant } from "@/lib/api";
import LoginForm from "@/components/LoginForm";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function TenantPortal() {
  const { slug } = useParams();
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Auto-login check
    const token = localStorage.getItem("access_token");
    const savedSlug = localStorage.getItem("tenant_slug");
    
    if (token && savedSlug === slug) {
      router.push(`/${slug}/home`);
      return;
    }

    const fetchTenant = async () => {
      try {
        const data = await api.getTenantBySlug(slug as string);
        setTenant(data);
      } catch (err) {
        console.error("Error fetching tenant:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    if (slug) fetchTenant();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fbfcfd]">
        <div className="h-8 w-8 border-4 border-slate-200 border-t-slate-800 animate-spin rounded-full"></div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fbfcfd] p-4 text-center">
        <div className="space-y-4 max-w-sm">
          <h1 className="text-2xl font-bold text-slate-900">Oups !</h1>
          <p className="text-slate-500 font-medium">Nous n'avons pas trouvé cet établissement.</p>
          <button 
            onClick={() => router.push("/")}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-medium"
          >
            Retourner à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const primaryColor = tenant.login_primary_color || tenant.primary_color || "#0f172a";

  return (
    <main 
      className="min-h-screen relative flex flex-col md:flex-row bg-white overflow-x-hidden"
      style={{ "--primary-color": primaryColor } as React.CSSProperties}
    >
      {/* 1. BRANDING PANEL: White background on both Mobile and Desktop */}
      <div className="relative flex-shrink-0 md:flex-1 flex flex-col justify-center px-6 pt-10 pb-4 md:px-16 md:py-24 z-20 bg-white">
        
        {/* Decorative elements for when THERE IS NO image (to avoid empty white space) */}
        {!tenant.login_background_url && (
          <div className="absolute inset-0 z-0 opacity-10 overflow-hidden pointer-events-none">
            <div 
              className="absolute top-[-5%] left-[-5%] w-[60%] h-[60%] rounded-full blur-[100px]"
              style={{ backgroundColor: primaryColor }}
            ></div>
            <div 
              className="absolute bottom-[-10%] left-[-5%] w-[70%] h-[70%] rounded-full blur-[120px]"
              style={{ backgroundColor: primaryColor }}
            ></div>
          </div>
        )}

        {/* Branding Content: Always on white for max contrast */}
        <div className="relative z-30 max-w-2xl w-full mx-auto md:mx-0 space-y-6 md:space-y-10">
          {/* Logo & Name Header */}
          <div className="flex flex-col md:flex-row items-center md:items-center gap-4 md:gap-8 text-center md:text-left">
            {tenant.logo_url ? (
              <img 
                src={`${API_URL}${tenant.logo_url}`} 
                alt={tenant.name} 
                className="h-16 md:h-24 object-contain" 
              />
            ) : (
                <div 
                  className="h-16 w-16 md:h-20 md:w-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                    {tenant.name.substring(0, 2).toUpperCase()}
                </div>
            )}
            
            <h1 className="text-3xl md:text-5xl lg:text-7xl font-bold tracking-tight leading-none text-slate-900">
              {tenant.name}
            </h1>
          </div>

          {/* Points Clés / Description Area */}
          <div className="space-y-4 max-w-lg mx-auto md:mx-0">
            {tenant.login_description ? (
              <div 
                className="text-[15px] md:text-xl font-medium leading-relaxed portal-description text-slate-500 text-center md:text-left opacity-90"
                dangerouslySetInnerHTML={{ __html: tenant.login_description }}
              />
            ) : tenant.description ? (
              <p className="text-base md:text-xl font-medium leading-relaxed opacity-80 text-slate-500 text-center md:text-left">
                {tenant.description}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* 2. IMAGE & LOGIN PANEL: Cinematic Backdrop for the Form */}
      <div className="relative flex-1 md:w-[60%] flex flex-col items-center justify-center px-6 pb-6 pt-2 md:p-12 overflow-hidden bg-[#fbfcfd] md:bg-white md:border-l md:border-slate-100 min-h-[500px] md:min-h-screen">
        
        {/* Background Image Layer (Mobile: Bottom half / Desktop: Right half) */}
        {tenant.login_background_url && (
            <div className="absolute inset-0 z-0">
              <img 
                src={`${API_URL}${tenant.login_background_url}`} 
                className="w-full h-full object-cover grayscale-[10%]" 
                alt="Club Visual" 
              />
              {/* Fade/Overlay Logic */}
              {/* Fade from top on mobile / Fade from left on desktop */}
              <div className="absolute top-0 left-0 w-full h-80 md:h-full md:w-[400px] bg-gradient-to-b from-white via-white/50 to-transparent md:bg-gradient-to-r md:from-white md:via-white/50 md:to-transparent z-10 pointer-events-none"></div>
              
              {/* Subtle Darkening: Lightened for mobile visibility (20%) / Soft blur on Desktop */}
              <div className="absolute inset-0 bg-slate-950/[0.15] md:bg-slate-950/20 backdrop-blur-[1px] md:backdrop-blur-[2px]"></div>
            </div>
        )}

        <div className="relative z-10 w-full flex flex-col items-center">
            <div className="w-full max-w-sm drop-shadow-2xl">
                <LoginForm initialTenantSlug={slug as string} hideTenantField={true} />
            </div>
            
            {/* Brand Signature */}
            <div className="mt-8 md:mt-12 flex items-baseline justify-center gap-2.5 opacity-60">
               <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest leading-none ${tenant.login_background_url ? 'text-white/70' : 'text-slate-500'}`}>Propulsé par</span>
               <span className={`text-sm md:text-base font-bold tracking-tighter leading-none ${tenant.login_background_url ? 'text-white' : 'text-slate-900'}`}>Rezea</span>
            </div>
        </div>
      </div>

      <style jsx global>{`
        .portal-description p { margin-bottom: 1rem; }
        .portal-description h1 { font-size: 1.875rem; font-weight: 800; margin-bottom: 1rem; color: #0f172a; }
        .portal-description h2 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; color: #1e293b; }
        .portal-description h3 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; color: #334155; }
        .portal-description ul { 
          display: inline-block;
          text-align: left;
          list-style: none; 
          padding: 0;
          margin-bottom: 1rem; 
        }
        .portal-description li {
          position: relative;
          padding-left: 1.75rem;
          margin-bottom: 0.75rem;
        }
        .portal-description li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0.35em;
          width: 18px;
          height: 18px;
          background-color: var(--primary-color, #0f172a);
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
          mask-repeat: no-repeat;
          mask-size: 12px;
          mask-position: center;
          -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
          -webkit-mask-repeat: no-repeat;
          -webkit-mask-size: 12px;
          -webkit-mask-position: center;
          opacity: 0.8;
        }
        .portal-description strong { font-weight: 700; color: inherit; }
      `}</style>
    </main>
  );
}
