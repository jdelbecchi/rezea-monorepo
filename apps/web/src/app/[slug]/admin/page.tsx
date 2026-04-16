"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, User } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

export default function AdminDashboardPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        activeOffers: 0,
        upcomingSessions: 0,
        totalUsers: 0
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Get user and check permissions BEFORE other data
                const userData = await api.getCurrentUser();
                if (userData.role !== 'owner' && userData.role !== 'manager') {
                    router.push("/home");
                    return;
                }
                setUser(userData);

                // 2. Fetch stats (non-critical, don't redirect to login if failed)
                try {
                    const [offers, sessions] = await Promise.all([
                        api.getOffers(false).catch(e => { console.warn("Failed to fetch offers stats", e); return []; }),
                        api.getSessions().catch(e => { console.warn("Failed to fetch sessions stats", e); return []; })
                    ]);

                    setStats({
                        activeOffers: offers.length,
                        upcomingSessions: sessions.filter((s: any) => new Date(s.start_time) > new Date()).length,
                        totalUsers: 0
                    });
                } catch (statsErr) {
                    console.error("Non-critical error while fetching admin stats:", statsErr);
                }
            } catch (err: any) {
                console.error("Critical error in admin dashboard (likely auth):", err);
                if (err.response?.status === 401) {
                    router.push(`/${params.slug}`);
                }
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement console admin...</div>;

    return (
        <div className="min-h-screen bg-white flex flex-col md:flex-row">
            <Sidebar user={user} />

            {/* Main Content */}
            <main className="flex-1 p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    <header>
                        <h1 className="text-2xl font-medium text-slate-900 tracking-tight lowercase">administration</h1>
                        <p className="text-slate-500 mt-1 font-medium text-[11px] lowercase">gérez votre plateforme rezea</p>
                    </header>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] text-slate-400 font-medium lowercase">offres actives</p>
                                    <p className="text-3xl font-semibold text-slate-900 mt-2">{stats.activeOffers}</p>
                                </div>
                                <div className="text-4xl">📦</div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] text-slate-400 font-medium lowercase">séances à venir</p>
                                    <p className="text-3xl font-semibold text-slate-900 mt-2">{stats.upcomingSessions}</p>
                                </div>
                                <div className="text-4xl">📅</div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] text-slate-400 font-medium lowercase">utilisateurs</p>
                                    <p className="text-3xl font-semibold text-slate-900 mt-2">{stats.totalUsers || '-'}</p>
                                </div>
                                <div className="text-4xl">👥</div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <section>
                        <h2 className="text-base font-medium text-slate-400 mb-4 lowercase px-1 tracking-widest">accès rapide</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Link
                                href={`/${params.slug}/admin/shop/offers`}
                                className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all group"
                            >
                                <div className="flex items-start space-x-4">
                                    <div className="text-5xl">📦</div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-medium text-slate-800 group-hover:text-blue-600 transition-colors lowercase">
                                            gestion des offres
                                        </h3>
                                        <p className="text-slate-500 mt-1 text-sm lowercase leading-tight">
                                            créez et gérez les forfaits disponibles à l&apos;achat
                                        </p>
                                        <div className="mt-4 text-blue-600 font-medium flex items-center">
                                            Gérer les offres
                                            <span className="ml-2">→</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>

                            <Link
                                href={`/${params.slug}/admin/planning/sessions`}
                                className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all group"
                            >
                                <div className="flex items-start space-x-4">
                                    <div className="text-5xl">📅</div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-medium text-slate-800 group-hover:text-blue-600 transition-colors lowercase">
                                            gestion des séances
                                        </h3>
                                        <p className="text-slate-500 mt-1 text-sm lowercase leading-tight">
                                            planifiez et organisez les cours de sport
                                        </p>
                                        <div className="mt-4 text-blue-600 font-medium flex items-center">
                                            Gérer les séances
                                            <span className="ml-2">→</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>

                            <Link
                                href={`/${params.slug}/admin/settings`}
                                className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:border-purple-200 hover:shadow-md transition-all group"
                            >
                                <div className="flex items-start space-x-4">
                                    <div className="text-5xl">🎨</div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-medium text-slate-800 group-hover:text-purple-600 transition-colors lowercase">
                                            personnalisation
                                        </h3>
                                        <p className="text-slate-500 mt-1 text-sm lowercase leading-tight">
                                            bannière, couleurs et message d&apos;accueil
                                        </p>
                                        <div className="mt-4 text-purple-600 font-medium text-sm flex items-center lowercase opacity-70 group-hover:opacity-100">
                                            personnaliser
                                            <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
