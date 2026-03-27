"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, Session, User } from "@/lib/api";
import { format, startOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import Sidebar from "@/components/Sidebar";

export default function PlanningPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [bookingLoading, setBookingLoading] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userData, sessionsData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getSessions()
                ]);
                setUser(userData);
                setSessions(sessionsData);
            } catch (err) {
                console.error(err);
                router.push("/login");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    const handleBook = async (sessionId: string) => {
        setBookingLoading(sessionId);
        setMessage(null);
        try {
            await api.createBooking(sessionId);
            setMessage({ type: 'success', text: 'Réservation confirmée !' });
            const updatedSessions = await api.getSessions();
            setSessions(updatedSessions);
        } catch (err: any) {
            setMessage({
                type: 'error',
                text: err.response?.data?.detail || 'Erreur lors de la réservation.'
            });
        } finally {
            setBookingLoading(null);
        }
    };

    // Group sessions by date
    const getSessionsForDate = (date: Date) => {
        return sessions.filter(session =>
            isSameDay(parseISO(session.start_time), date)
        ).sort((a, b) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
    };

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement du planning...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            {/* Main Content */}
            <main className="flex-1 p-8 overflow-x-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    <header className="space-y-4">
                        <div className="flex justify-between items-start flex-wrap gap-4">
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Planning des séances</h1>
                                <p className="text-slate-500 mt-1">Réservez vos prochains cours de sport en un clic.</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
                                    className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                                >
                                    ← Précédente
                                </button>
                                <button
                                    onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                                >
                                    Aujourd'hui
                                </button>
                                <button
                                    onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
                                    className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                                >
                                    Suivante →
                                </button>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="flex items-center justify-center gap-6 text-sm text-slate-600 bg-white p-3 rounded-lg border border-gray-200">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                                <span>Places disponibles</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-gray-300 rounded"></div>
                                <span>Complet</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-50 border-2 border-blue-200 rounded"></div>
                                <span>Aujourd'hui</span>
                            </div>
                        </div>
                    </header>

                    {message && (
                        <div className={`p-4 rounded-lg border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                            {message.text}
                        </div>
                    )}

                    {/* Calendar Grid */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="grid grid-cols-7 border-b border-gray-200">
                            {weekDays.map((day, index) => {
                                const isToday = isSameDay(day, new Date());
                                const daysSessions = getSessionsForDate(day);
                                return (
                                    <div
                                        key={index}
                                        className={`p-4 text-center border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-blue-50' : ''}`}
                                    >
                                        <div className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                                            {format(day, 'EEE', { locale: fr })}
                                        </div>
                                        <div className={`text-2xl font-bold mt-1 ${isToday ? 'text-blue-600' : 'text-slate-900'}`}>
                                            {format(day, 'd')}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            {format(day, 'MMM', { locale: fr })}
                                        </div>
                                        {daysSessions.length > 0 && (
                                            <div className="mt-2 inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                                                {daysSessions.length}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Sessions by day */}
                        <div className="grid grid-cols-7">
                            {weekDays.map((day, dayIndex) => {
                                const daysSessions = getSessionsForDate(day);
                                const isToday = isSameDay(day, new Date());

                                return (
                                    <div
                                        key={dayIndex}
                                        className={`min-h-[400px] p-3 border-r border-gray-100 last:border-r-0 space-y-2 ${isToday ? 'bg-blue-50/30' : ''}`}
                                    >
                                        {daysSessions.length === 0 ? (
                                            <div className="text-center text-slate-300 text-sm mt-8">
                                                Aucun cours
                                            </div>
                                        ) : (
                                            daysSessions.map((session) => {
                                                const isFull = session.current_participants >= session.max_participants;
                                                return (
                                                    <div
                                                        key={session.id}
                                                        className={`p-3 rounded-lg border-l-4 ${isFull
                                                            ? 'bg-gray-50 border-gray-300'
                                                            : 'bg-white border-blue-500 hover:shadow-md'
                                                            } transition-shadow cursor-pointer group`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs font-bold text-blue-600 mb-1">
                                                                    {format(parseISO(session.start_time), 'HH:mm')} - {format(parseISO(session.end_time), 'HH:mm')}
                                                                </div>
                                                                <h4 className="font-bold text-sm text-slate-900 truncate" title={session.title}>
                                                                    {session.title}
                                                                </h4>
                                                                <div className="text-xs text-slate-500 mt-1">
                                                                    {session.activity_type}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-gray-100">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-1.5 py-0.5 rounded ${isFull ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'
                                                                    } font-bold`}>
                                                                    {session.current_participants}/{session.max_participants}
                                                                </span>
                                                                <span className="text-slate-600">{session.credits_required}💰</span>
                                                            </div>
                                                        </div>

                                                        <button
                                                            disabled={bookingLoading === session.id || isFull}
                                                            onClick={() => handleBook(session.id)}
                                                            className={`w-full mt-2 px-3 py-1.5 rounded text-xs font-bold transition-all ${isFull
                                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                                : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                                                                }`}
                                                        >
                                                            {bookingLoading === session.id ? "..." : isFull ? "Complet" : "Réserver"}
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
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
