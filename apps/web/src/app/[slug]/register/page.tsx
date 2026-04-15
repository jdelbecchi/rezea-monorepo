"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, Tenant } from "@/lib/api";
import RegisterForm from "@/components/RegisterForm";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function TenantRegisterPage() {
  const { slug } = useParams();
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
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
      className="min-h-screen relative overflow-hidden bg-[#fbfcfd] flex items-center justify-center p-4 py-8 md:py-12"
      style={{ "--primary-color": primaryColor } as React.CSSProperties}
    >
      {/* Background Decor */}
      <div 
        className="absolute top-[-5%] left-[-5%] w-[45%] h-[45%] rounded-full blur-[100px] opacity-20"
        style={{ backgroundColor: primaryColor }}
      ></div>
      <div 
        className="absolute bottom-[-10%] right-[-5%] w-[55%] h-[55%] rounded-full blur-[120px] opacity-15"
        style={{ backgroundColor: primaryColor }}
      ></div>

      <div className="max-w-6xl w-full relative z-10 flex flex-col items-center gap-8">
        {/* Register Form */}
        <div className="w-full flex justify-center">
            <RegisterForm initialTenantSlug={slug as string} hideTenantField={true} />
        </div>

        {/* Brand Mention */}
        <div className="flex items-center gap-3 opacity-40">
           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Propulsé par</span>
           <span className="text-sm font-bold text-slate-900 tracking-tighter">Rezea</span>
        </div>
      </div>
    </main>
  );
}
