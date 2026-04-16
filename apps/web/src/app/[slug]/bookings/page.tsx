"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, Booking, User } from "@/lib/api";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Sidebar from "@/components/Sidebar";

// Extended Booking to include session details if available
interface ExtendedBooking extends Booking {
    session?: any;
}

export default function BookingsPage() {
    const router = useRouter();
    const params = useParams();
    const slug = params.slug;
    const [user, setUser] = useState<User | null>(null);
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const fetchBookings = async () => {
        try {
            const data = await api.getMyBookings();
            setBookings(data);
        } catch (err) {
            console.error("Error fetching bookings:", err);
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const userData = await api.getCurrentUser();
                setUser(userData);
                await fetchBookings();
            } catch (err) {
                console.error(err);
                router.push("/login");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    const handleCancel = async (bookingId: string) => {
        if (!confirm("Êtes-vous sûr de vouloir annuler cette réservation ? Vos crédits vous seront remboursés.")) return;

        setCancellingId(bookingId);
        setMessage(null);
        try {
            await api.cancelBooking(bookingId);
            setMessage({ type: 'success', text: 'Réservation annulée et crédits remboursés.' });
            await fetchBookings();
        } catch (err: any) {
            setMessage({
                type: 'error',
                text: err.response?.data?.detail || "Erreur lors de l'annulation."
            });
        } finally {
            setCancellingId(null);
        }
    };

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement de vos réservations...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            {/* Main Content */}
            <main className="flex-1 p-8">
                <div className="max-w-5xl mx-auto space-y-8">
                    <header>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Mes Réservations</h1>
                        <p className="text-slate-500 mt-1">Consultez et gérez vos prochaines séances.</p>
                    </header>

                    {message && (
                        <div className={`p-4 rounded-lg border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                            {message.text}
                        </div>
                    )}

                    <div className="space-y-4">
                        {bookings.length === 0 ? (
                            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-gray-300">
                                <p className="text-slate-400 mb-4">Vous n'avez pas encore de réservations.</p>
                                <Link href={`/${slug}/planning`} className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors">
                                    Voir le planning
                                </Link>
                            </div>
                        ) : (
                            bookings.map((item) => (
                                <div key={item.booking.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center space-x-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${item.booking.status === 'confirmed' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                                                }`}>
                                                {item.booking.status}
                                            </span>
                                            <h3 className="text-lg font-bold text-slate-900">{item.session.title}</h3>
                                        </div>
                                        <div className="text-sm text-slate-500 flex flex-wrap gap-x-4">
                                            <span>📅 {format(new Date(item.session.start_time), "dd/MM/yyyy")}</span>
                                            <span>🕒 {format(new Date(item.session.start_time), "HH:mm")}</span>
                                            <span>💰 {item.booking.credits_used} crédits</span>
                                        </div>
                                    </div>

                                    {item.booking.status === 'confirmed' && (
                                        <button
                                            disabled={cancellingId === item.booking.id}
                                            onClick={() => handleCancel(item.booking.id)}
                                            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                                        >
                                            {cancellingId === item.booking.id ? "Annulation..." : "Annuler la séance"}
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
