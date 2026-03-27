"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, User, CreditAccount, Tenant } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<CreditAccount | null>(null);
  const [tenantSettings, setTenantSettings] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userData, creditData, tenantData] = await Promise.all([
          api.getCurrentUser(),
          api.getCreditAccount(),
          api.getTenantSettings(),
        ]);
        setUser(userData);
        setCredits(creditData);
        setTenantSettings(tenantData);
      } catch (err) {
        console.error(err);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-slate-400">Chargement...</div>
      </div>
    );
  }

  const isAdmin = user?.role === "owner" || user?.role === "manager";
  const color = tenantSettings?.primary_color || "#7c3aed";
  const bannerUrl = tenantSettings?.banner_url ? `${API_URL}${tenantSettings.banner_url}` : null;
  const welcomeMsg = tenantSettings?.welcome_message || "Gérez vos cours et réservations";

  // Admin/Manager: show the full dashboard with sidebar
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
        <Sidebar user={user} tenant={tenantSettings ? { name: tenantSettings.name, logo_url: tenantSettings.logo_url || null, primary_color: tenantSettings.primary_color } : null} />
        <main className="flex-1 p-8">
          <div className="max-w-4xl mx-auto space-y-8">
            <header>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Accueil</h1>
              <p className="text-slate-500 mt-1">Bienvenue, {user?.first_name} {user?.last_name}</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm font-medium">Cours restants</p>
                    <p className="text-4xl font-bold mt-2">{credits?.balance || 0}</p>
                  </div>
                  <div className="text-4xl opacity-20">🎟️</div>
                </div>
                <Link
                  href="/dashboard/credits"
                  className="mt-4 block text-center bg-white/20 hover:bg-white/30 py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  Acheter un forfait
                </Link>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Votre Profil</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 block">Nom complet</label>
                    <p className="text-lg font-medium text-slate-900">{user?.first_name} {user?.last_name}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block">Email</label>
                    <p className="text-slate-600">{user?.email}</p>
                  </div>
                  <div className="inline-block px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase">
                    {user?.role}
                  </div>
                </div>
              </div>
            </div>

            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Actions Rapides</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link href="/dashboard/planning" className="p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all group">
                  <h3 className="font-bold text-slate-900 group-hover:text-blue-600">Réserver une séance</h3>
                  <p className="text-sm text-slate-500">Consultez le planning et inscrivez-vous.</p>
                </Link>
                <Link href="/dashboard/bookings" className="p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all group">
                  <h3 className="font-bold text-slate-900 group-hover:text-blue-600">Voir mes réservations</h3>
                  <p className="text-sm text-slate-500">Gérez vos cours à venir.</p>
                </Link>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  // Member: show the visual home page with navigation cards
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header Bar */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-sm">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <span className="font-semibold text-slate-800 text-sm">
            {user?.first_name} {user?.last_name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-xs font-bold">
            {credits?.balance || 0} cours
          </div>
          <button
            onClick={() => { localStorage.clear(); router.push("/login"); }}
            className="text-slate-400 hover:text-red-500 transition-colors p-1"
            title="Déconnexion"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Banner / Background */}
      <div
        className="relative h-56 overflow-hidden"
        style={{
          background: bannerUrl
            ? `url(${bannerUrl}) center/cover no-repeat`
            : `linear-gradient(135deg, ${color}, ${color}cc, ${color}99)`,
        }}
      >
        {/* Overlay for readability */}
        <div className={`absolute inset-0 ${bannerUrl ? 'bg-black/40' : 'bg-black/10'}`} />

        {/* Decorative pattern (only if no banner) */}
        {!bannerUrl && (
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-full h-full"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
              }}
            />
          </div>
        )}

        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4">
          <p className="text-white/70 text-xs uppercase tracking-widest font-semibold mb-1">Réservation via Rezea</p>
          <h2 className="text-white text-2xl font-bold mt-2">Bienvenue, {user?.first_name} !</h2>
          <p className="text-white/80 text-sm mt-2">
            {welcomeMsg}
          </p>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="flex-1 px-4 -mt-6 relative z-20">
        <div className="max-w-lg mx-auto grid grid-cols-2 gap-4">
          {/* Mon profil */}
          <Link
            href="/dashboard/planning"
            className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all flex flex-col items-center text-center group border border-gray-100 hover:border-purple-200"
          >
            <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mb-3 group-hover:bg-purple-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-800 group-hover:text-purple-700 transition-colors">
              Mon profil
            </span>
          </Link>

          {/* Calendrier des réservations */}
          <Link
            href="/dashboard/planning"
            className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all flex flex-col items-center text-center group border border-gray-100 hover:border-purple-200"
          >
            <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mb-3 group-hover:bg-purple-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-800 group-hover:text-purple-700 transition-colors">
              Calendrier des réservations
            </span>
          </Link>

          {/* Boutique */}
          <Link
            href="/dashboard/credits"
            className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all flex flex-col items-center text-center group border border-gray-100 hover:border-purple-200"
          >
            <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mb-3 group-hover:bg-purple-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-800 group-hover:text-purple-700 transition-colors">
              Boutique
            </span>
          </Link>

          {/* Mes commandes */}
          <Link
            href="/dashboard/bookings"
            className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all flex flex-col items-center text-center group border border-gray-100 hover:border-purple-200"
          >
            <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mb-3 group-hover:bg-purple-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-800 group-hover:text-purple-700 transition-colors">
              Mes commandes
            </span>
          </Link>
        </div>
      </div>

      {/* Footer / Legal Docs */}
      <div className="mt-8 px-4 pb-10">
        <div className="max-w-lg mx-auto space-y-3">
          {(tenantSettings as any)?.cgv_url && (
            <a 
              href={`${API_URL}${(tenantSettings as any).cgv_url}`} 
              target="_blank" 
              className="w-full block py-3 text-center bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all text-sm"
            >
              📄 Conditions Générales de Vente
            </a>
          )}
          {(tenantSettings as any)?.rules_url && (
            <a 
              href={`${API_URL}${(tenantSettings as any).rules_url}`} 
              target="_blank" 
              className="w-full block py-3 text-center bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all text-sm"
            >
              📜 Règlement Intérieur
            </a>
          )}
          <p className="text-center text-[10px] text-slate-400 font-medium pt-2">
            Plateforme propulsée par Rezea &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
}
