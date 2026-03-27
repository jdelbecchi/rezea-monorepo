"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, User } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

export default function AdminDashboardPage() {
    const router = useRouter();
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
                const userData = await api.getCurrentUser();
                if (userData.role !== 'owner' && userData.role !== 'manager') {
                    router.push("/dashboard");
                    return;
                }
                setUser(userData);

                // Fetch stats
                const [offers, sessions] = await Promise.all([
                    api.getOffers(false),
                    api.getSessions()
                ]);

                setStats({
                    activeOffers: offers.length,
                    upcomingSessions: sessions.filter((s: any) => new Date(s.start_time) > new Date()).length,
                    totalUsers: 0 // TODO: Add API endpoint for user count
                });
            } catch (err) {
                console.error(err);
                router.push("/login");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement console admin...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            {/* Main Content */}
            <main className="flex-1 p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    <header>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Administration</h1>
                        <p className="text-slate-500 mt-1">Gérez votre plateforme REZEA</p>
                    </header>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-500 font-medium">Offres actives</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-2">{stats.activeOffers}</p>
                                </div>
                                <div className="text-4xl">📦</div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-500 font-medium">Séances à venir</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-2">{stats.upcomingSessions}</p>
                                </div>
                                <div className="text-4xl">📅</div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-500 font-medium">Utilisateurs</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-2">{stats.totalUsers || '-'}</p>
                                </div>
                                <div className="text-4xl">👥</div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-4">Accès rapide</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Link
                                href="/dashboard/admin/offers"
                                className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all group"
                            >
                                <div className="flex items-start space-x-4">
                                    <div className="text-5xl">📦</div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                            Gestion des Offres
                                        </h3>
                                        <p className="text-slate-500 mt-2">
                                            Créez et gérez les forfaits disponibles à l&apos;achat
                                        </p>
                                        <div className="mt-4 text-blue-600 font-medium flex items-center">
                                            Gérer les offres
                                            <span className="ml-2">→</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>

                            <Link
                                href="/dashboard/admin/sessions"
                                className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all group"
                            >
                                <div className="flex items-start space-x-4">
                                    <div className="text-5xl">📅</div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                            Gestion des Séances
                                        </h3>
                                        <p className="text-slate-500 mt-2">
                                            Planifiez et organisez les cours de sport
                                        </p>
                                        <div className="mt-4 text-blue-600 font-medium flex items-center">
                                            Gérer les séances
                                            <span className="ml-2">→</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>

                            <Link
                                href="/dashboard/admin/settings"
                                className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:border-purple-200 hover:shadow-md transition-all group"
                            >
                                <div className="flex items-start space-x-4">
                                    <div className="text-5xl">🎨</div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                                            Personnalisation
                                        </h3>
                                        <p className="text-slate-500 mt-2">
                                            Bannière, couleurs et message d&apos;accueil
                                        </p>
                                        <div className="mt-4 text-purple-600 font-medium flex items-center">
                                            Personnaliser
                                            <span className="ml-2">→</span>
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
