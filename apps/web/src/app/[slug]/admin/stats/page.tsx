"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

export default function AdminStatsPage() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // Mock data for the "wow" effect
    const revenueData = [450, 620, 580, 890, 1100, 950, 1250];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
    
    const popularOffers = [
        { name: "Pack 10 Séances", count: 45, color: "bg-blue-500" },
        { name: "Abonnement Illimité", count: 32, color: "bg-indigo-500" },
        { name: "Séance Découverte", count: 28, color: "bg-emerald-500" },
        { name: "Stage Été", count: 12, color: "bg-amber-500" },
    ];

    useEffect(() => {
        const fetchData = async () => {
            try {
                const userData = await api.getCurrentUser();
                if (userData.role !== 'owner' && userData.role !== 'manager') {
                    router.push("/home");
                    return;
                }
                setUser(userData);
            } catch (err: any) {
                if (err.response?.status === 401) {
                    router.push(`/${params.slug}`);
                }
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement des analyses...</div>;

    const maxRevenue = Math.max(...revenueData);

    return (
        <div className="min-h-screen bg-white flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-8">
                <div className="max-w-6xl mx-auto space-y-10">
                    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight lowercase">statistiques</h1>
                            <p className="text-slate-500 mt-1 font-medium text-[12px] lowercase tracking-wide">analysez la croissance de votre club</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold border border-slate-100 hover:bg-slate-100 transition-all">30 derniers jours</button>
                            <button className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all">exporter les données</button>
                        </div>
                    </header>

                    {/* Top KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {[
                            { label: "revenu total", value: "4 250€", trend: "+12%", color: "text-emerald-500" },
                            { label: "nouveaux membres", value: "24", trend: "+8%", color: "text-emerald-500" },
                            { label: "taux d'occupation", value: "78%", trend: "-2%", color: "text-rose-500" },
                            { label: "séances réalisées", value: "156", trend: "+15%", color: "text-emerald-500" },
                        ].map((kpi, i) => (
                            <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">{kpi.label}</p>
                                <div className="flex items-baseline gap-3 mt-2">
                                    <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
                                    <span className={`text-[10px] font-bold ${kpi.color}`}>{kpi.trend}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Revenue Chart (CSS-based) */}
                    <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">évolution du chiffre d'affaires</h3>
                            <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    <span>2024</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-slate-200"></div>
                                    <span>2023</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="relative h-64 flex items-end justify-between gap-2 md:gap-4 px-2">
                            {/* Grid Lines */}
                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                                {[1, 2, 3, 4].map(line => (
                                    <div key={line} className="w-full border-t border-slate-50"></div>
                                ))}
                            </div>

                            {revenueData.map((val, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-3 group relative z-10">
                                    <div 
                                        className="w-full max-w-[40px] bg-blue-500/10 rounded-t-xl group-hover:bg-blue-500 transition-all duration-500 relative"
                                        style={{ height: `${(val / maxRevenue) * 100}%` }}
                                    >
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            {val}€
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{months[i]}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Popular Offers */}
                        <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-6">offres les plus vendues</h3>
                            <div className="space-y-6">
                                {popularOffers.map((offer, i) => (
                                    <div key={i} className="space-y-2">
                                        <div className="flex justify-between items-end">
                                            <span className="text-xs font-bold text-slate-700">{offer.name}</span>
                                            <span className="text-xs font-bold text-slate-400">{offer.count} ventes</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full ${offer.color} rounded-full transition-all duration-1000`} 
                                                style={{ width: `${(offer.count / popularOffers[0].count) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Recent Activity Mini-log */}
                        <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-6">activité récente</h3>
                            <div className="space-y-4">
                                {[
                                    { user: "Jean Dupont", action: "a acheté", item: "Pack 10 Séances", time: "il y a 2h" },
                                    { user: "Marie Curie", action: "s'est inscrite à", item: "Yoga Flow", time: "il y a 4h" },
                                    { user: "Thomas Pesquet", action: "a réservé", item: "Coaching Privé", time: "hier" },
                                    { user: "Sophie Germain", action: "a rejoint le club", item: "", time: "hier" },
                                ].map((log, i) => (
                                    <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                                {log.user.split(' ').map(n => n[0]).join('')}
                                            </div>
                                            <div className="flex flex-col">
                                                <p className="text-xs font-bold text-slate-800">
                                                    {log.user} <span className="font-normal text-slate-500">{log.action}</span> {log.item}
                                                </p>
                                                <span className="text-[10px] text-slate-400 font-medium">{log.time}</span>
                                            </div>
                                        </div>
                                        <div className="text-xs">➡️</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}
