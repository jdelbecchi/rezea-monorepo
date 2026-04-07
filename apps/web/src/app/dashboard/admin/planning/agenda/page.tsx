"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function AdminAgendaPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [locationFilter, setLocationFilter] = useState("all");
    const [tenant, setTenant] = useState<any>(null);

    const weekDays = useMemo(() => {
        const days = [];
        const start = new Date(currentDate);
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);

        for (let i = 0; i < 7; i++) {
            days.push(new Date(start));
            start.setDate(start.getDate() + 1);
        }
        return days;
    }, [currentDate]);

    const fetchData = useCallback(async () => {
        try {
            const start = weekDays[0].toISOString().split('T')[0];
            const end = weekDays[6].toISOString().split('T')[0];
            const [userData, agendaData, tenantData] = await Promise.all([
                api.getCurrentUser(),
                api.getAdminAgenda(start, end),
                api.getTenantSettings()
            ]);
            setUser(userData);
            setTenant(tenantData);
            const flattenedItems = [
                ...agendaData.sessions.map((s: any) => ({ ...s, type: "session" as const, date: s.start_time.split('T')[0], time: s.start_time.split('T')[1].substring(0, 5) })),
                ...agendaData.events.map((e: any) => ({ ...e, type: "event" as const, date: e.event_date, time: e.event_time }))
            ];
            setItems(flattenedItems);
        } catch (err) {
            console.error(err);
            router.push("/login");
        } finally {
            setLoading(false);
        }
    }, [router, weekDays]);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Chargement...</div>;

    return (
        <div className="flex min-h-screen bg-white font-sans text-slate-900 overflow-hidden">
            <Sidebar user={user} />

            <main className="flex-1 p-8 md:p-12 overflow-auto bg-[#fafafa]">
                <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
                    
                    {/* Header Image 2 Style */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <span className="text-3xl">📋</span>
                            <h1 className="text-4xl font-extrabold tracking-tight text-[#0f172a] font-sans">Agenda</h1>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</div>
                                <input 
                                    type="text" 
                                    placeholder="Rechercher..." 
                                    className="pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl w-64 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none transition-all"
                                />
                            </div>
                            <button className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
                                ↺ Dupliquer
                            </button>
                            <button className="px-5 py-2.5 bg-[#0f172a] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                                + Nouvelle séance
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filtrer par Lieu :</span>
                            <select 
                                value={locationFilter}
                                onChange={(e) => setLocationFilter(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900 transition-all min-w-[150px]"
                            >
                                <option value="all">Tous les lieux</option>
                                {(tenant?.locations || []).map((loc: string) => (
                                    <option key={loc} value={loc}>{loc}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Navigation Bar Image 2 Style */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-6">
                        <div className="flex items-center gap-6">
                            <div className="text-base font-bold text-slate-800 tracking-tight">
                                {weekDays[0].toLocaleDateString("fr-FR", { day: 'numeric', month: 'short' })} — {weekDays[6].toLocaleDateString("fr-FR", { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center bg-white p-1 rounded-2xl border border-slate-200 shadow-sm transition-all focus-within:shadow-md">
                                    <button onClick={() => setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() - 7)))} className="p-2 hover:bg-slate-50 rounded-xl transition-all">←</button>
                                    <button onClick={() => setCurrentDate(new Date())} className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors">Aujourd'hui</button>
                                    <button onClick={() => setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() + 7)))} className="p-2 hover:bg-slate-50 rounded-xl transition-all">→</button>
                                </div>
                                <div className="flex items-center bg-slate-900 p-1 rounded-2xl shadow-xl">
                                    <button className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-white border-r border-slate-800">Semaine</button>
                                    <button className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Mois</button>
                                </div>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2.5 group cursor-help">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] shadow-sm shadow-blue-200 transition-transform group-hover:scale-125"></span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Séance</span>
                            </div>
                            <div className="flex items-center gap-2.5 group cursor-help">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shadow-sm shadow-amber-200 transition-transform group-hover:scale-125"></span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Évènement</span>
                            </div>
                        </div>
                    </div>

                    {/* Weekly Grid Image 2 Style */}
                    <div className="bg-white rounded-[3rem] shadow-[0_20px_60px_rgba(15,23,42,0.02)] border border-slate-100 overflow-hidden">
                        <div className="grid grid-cols-7 border-b border-slate-100/50 bg-white shadow-[0_1px_0_0_rgba(15,23,42,0.02)]">
                            {weekDays.map((date, idx) => {
                                const isToday = date.toDateString() === new Date().toDateString();
                                return (
                                    <div key={idx} className="p-8 text-center space-y-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
                                            {DAYS_FR[idx]}
                                        </div>
                                        <div className={`text-2xl font-black transition-all h-14 w-14 flex items-center justify-center mx-auto rounded-full ${
                                            isToday ? "bg-slate-900 text-white shadow-2xl shadow-slate-900/20 scale-110" : "text-slate-900"
                                        }`}>
                                            {date.getDate()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-7 min-h-[700px] divide-x divide-slate-100/50 bg-[#fafafa]/30">
                            {weekDays.map((date, dayIdx) => {
                                const dayStr = date.toISOString().split('T')[0];
                                const dayItems = items
                                    .filter(i => i.date === dayStr)
                                    .filter(i => locationFilter === "all" || i.location === locationFilter)
                                    .sort((a,b) => a.time.localeCompare(b.time));

                                return (
                                    <div key={dayIdx} className="p-5 space-y-5 min-h-[200px] group/day transition-colors">
                                        {dayItems.map(item => {
                                            const isSession = item.type === "session";
                                            
                                            return (
                                                <div 
                                                    key={item.id}
                                                    className={`p-5 rounded-[2rem] border cursor-pointer transition-all hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group/item ${
                                                        isSession 
                                                        ? "bg-white border-blue-50 text-blue-900 shadow-[0_10px_30px_rgba(59,130,246,0.02)]" 
                                                        : "bg-white border-amber-50 text-amber-900 shadow-[0_10px_30px_rgba(245,158,11,0.02)]"
                                                    }`}
                                                >
                                                    <div className="flex flex-col space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-xs font-black tracking-tight text-slate-900">
                                                                {item.time} <span className="ml-2 uppercase font-black tracking-widest text-[#64748b] text-[10px] group-hover/item:text-slate-900 transition-colors">{item.title}</span>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="space-y-3">
                                                            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                                                                <div className="flex items-center gap-1.5 min-w-[120px]">
                                                                    <span className="text-xs group-hover/item:scale-125 transition-all">👤</span> 
                                                                    {item.instructor_name || "N/A"}
                                                                </div>
                                                                {item.location && (
                                                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 text-slate-500 rounded-md border border-slate-100">
                                                                        <span className="text-[8px]">📍</span> {item.location}
                                                                    </div>
                                                                )}
                                                                <div className="ml-auto text-slate-300">
                                                                    {item.duration_minutes || 60} min
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-end">
                                                                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border shadow-sm ${
                                                                    isSession 
                                                                        ? "bg-blue-50/50 text-blue-600 border-blue-100/50" 
                                                                        : "bg-amber-100 text-amber-700 border-amber-200"
                                                                }`}>
                                                                    <span className="text-xs">👥</span> {item.current_participants || 0}/{item.max_participants || 10}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        
                                        <div className="absolute inset-x-5 bottom-5 opacity-0 group-hover/day:opacity-100 transition-all pointer-events-none">
                                            <div className="w-full h-12 rounded-3xl border border-dashed border-slate-200 bg-white/50"></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
