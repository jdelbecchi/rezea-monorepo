"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, Event, Tenant, User } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function EventCheckoutPage() {
    const params = useParams();
    const router = useRouter();
    const eventId = params.id as string;

    const [event, setEvent] = useState<Event | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [tariff, setTariff] = useState<'member' | 'external'>('member');
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [payLater, setPayLater] = useState(true); // Default to true as per shop behavior

    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [eventData, tenantData, userData] = await Promise.all([
                    api.getEvent(eventId),
                    api.getTenantSettings(),
                    api.getCurrentUser()
                ]);
                setEvent(eventData);
                setTenant(tenantData);
                setUser(userData);
            } catch (err) {
                console.error(err);
                setError("Impossible de charger les détails de l'événement.");
            } finally {
                setLoading(false);
            }
        };
        if (eventId) fetchData();
    }, [eventId]);

    const handleConfirm = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await api.checkoutEvent(eventId, tariff, payLater);
            setShowSuccess(true);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Une erreur est survenue lors de l'inscription.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;

    const currentPrice = tariff === 'member' ? event?.price_member_cents : event?.price_external_cents;

    return (
        <div className="min-h-screen bg-white flex flex-col md:flex-row pb-20 md:pb-0 overflow-x-hidden">
            {/* PWA Mobile Header */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 z-40 md:hidden safe-top shadow-sm">
                <Link href="/dashboard/planning" className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 active:scale-95 transition-all text-slate-400">
                    <span className="text-lg">←</span>
                </Link>
            </header>

            <main className="flex-1 px-5 pb-5 md:p-12 pt-16 md:pt-14">
                <div className="max-w-3xl mx-auto">
                    <header className="space-y-1 mb-4">
                        <div className="hidden md:flex items-center gap-2 mb-4">
                            <Link href="/dashboard/planning" className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group">
                                <span className="text-lg group-hover:-translate-x-1 transition-transform">←</span>
                                Retour au planning
                            </Link>
                        </div>
                        <h1 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight">Récapitulatif de votre inscription</h1>
                    </header>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-6 md:p-8">
                            {/* Event Summary Section */}
                            <div className="flex flex-col md:flex-row justify-between items-start gap-8 pb-6 border-b border-slate-100">
                                <div className="space-y-4">
                                    <div>
                                        <span className="text-[10px] font-semibold text-blue-600 capitalize bg-blue-50 px-3 py-1 rounded-full">Événement</span>
                                        <h2 className="text-lg md:text-xl font-semibold text-slate-900 mt-2 uppercase tracking-tight">{event?.title}</h2>
                                    </div>
                                    <div className="space-y-3 mt-6">
                                        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                                            <div className="flex items-center gap-3 text-slate-700">
                                                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-sm">🕒</div>
                                                <span className="text-sm font-medium">{event?.event_time}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-700">
                                                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-sm">👤</div>
                                                <span className="text-sm font-medium">{event?.instructor_name}</span>
                                            </div>
                                        </div>

                                        {event?.description && (
                                            <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50 max-w-xl">
                                                <p className="text-slate-500 text-[11px] md:text-xs leading-relaxed italic">
                                                    {event.description}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="w-full md:w-auto text-center md:text-right space-y-2">
                                    {event?.price_member_cents === event?.price_external_cents ? (
                                        <>
                                            <p className="text-xl md:text-2xl font-semibold text-slate-900 leading-none">
                                                {(event?.price_member_cents || 0) / 100} €
                                            </p>
                                            <p className="text-[10px] text-slate-500 italic mt-1.5">Tarif unique</p>
                                        </>
                                    ) : null}
                                </div>
                            </div>

                            {/* Error Message if any */}
                            {error && (
                                <div className="mt-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                                    <span>⚠️</span> {error}
                                </div>
                            )}

                            {/* Tariff Selection (only if different) */}
                            {event?.price_member_cents !== event?.price_external_cents ? (
                                <div className="mt-8 space-y-4 animate-in fade-in duration-500">
                                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">Tarifs disponibles</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <button
                                            onClick={() => setTariff('member')}
                                            className={`p-4 rounded-2xl border transition-all flex items-center justify-center gap-4 h-16 shadow-sm ${
                                                tariff === 'member' 
                                                ? 'border-blue-600 bg-blue-50/30' 
                                                : 'border-slate-100 bg-white hover:border-slate-200'
                                            }`}
                                        >
                                            <p className={`text-[10px] font-semibold uppercase tracking-widest ${tariff === 'member' ? 'text-blue-600' : 'text-slate-400'}`}>Tarif Membre</p>
                                            <div className="w-px h-4 bg-slate-200"></div>
                                            <p className="text-base font-semibold text-slate-900">{(event?.price_member_cents || 0) / 100} €</p>
                                        </button>

                                        <button
                                            onClick={() => setTariff('external')}
                                            className={`p-4 rounded-2xl border transition-all flex items-center justify-center gap-4 h-16 shadow-sm ${
                                                tariff === 'external' 
                                                ? 'border-blue-600 bg-blue-50/30' 
                                                : 'border-slate-100 bg-white hover:border-slate-200'
                                            }`}
                                        >
                                            <p className={`text-[10px] font-semibold uppercase tracking-widest ${tariff === 'external' ? 'text-blue-600' : 'text-slate-400'}`}>Tarif Extérieur</p>
                                            <div className="w-px h-4 bg-slate-200"></div>
                                            <p className="text-base font-semibold text-slate-900">{(event?.price_external_cents || 0) / 100} €</p>
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-400 italic px-2">
                                        Note : Le manager se réserve le droit de modifier le tarif si celui-ci ne correspond pas à votre statut réel.
                                    </p>
                                </div>
                            ) : null}

                            {/* Confirmation Section */}
                            <div className="mt-10 space-y-6">
                                <div className="space-y-4">
                                    <label className="flex items-center justify-center md:justify-start gap-3 cursor-pointer group">
                                        <div className="relative flex items-center h-5">
                                            <input
                                                type="checkbox"
                                                checked={payLater}
                                                onChange={(e) => setPayLater(e.target.checked)}
                                                className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-slate-300 transition-all checked:border-slate-900 checked:bg-slate-900"
                                            />
                                            <span className="absolute text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity pointer-events-none">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" strokeWidth="1">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            </span>
                                        </div>
                                        <span className="text-sm font-semibold text-slate-700">Option &quot;Payer plus tard&quot;</span>
                                    </label>

                                    {payLater && (
                                        <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
                                            <p className="text-xs text-amber-800 leading-relaxed text-center md:text-left">
                                                <strong>Attention !</strong> Si vous choisissez le paiement différé, vous n&apos;êtes pas redirigé vers le lien de paiement. Votre inscription est enregistrée, mais le règlement est à effectuer selon les conditions de l&apos;établissement.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleConfirm}
                                    disabled={submitting}
                                    className="w-full py-4 rounded-2xl bg-slate-900 text-white text-sm font-medium hover:bg-blue-600 shadow-xl shadow-slate-100 transition-all active:scale-[0.98] disabled:opacity-50"
                                >
                                    {submitting ? "Traitement..." : "Confirmez votre inscription"}
                                </button>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 border-t border-slate-100 flex items-center gap-4">
                            <div className="text-2xl">🛡️</div>
                            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                                En confirmant, vous acceptez les Conditions Générales de Vente (CGV) et le règlement intérieur de l&apos;établissement.
                            </p>
                        </div>
                    </div>
                </div>
            </main>


            <BottomNav userRole={user?.role} />

            {/* Success Modal */}
            {showSuccess && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-6 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] max-w-sm w-full p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 text-center">
                        <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center text-3xl mx-auto">
                            ✨
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">C'est validé !</h2>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                Votre inscription à l'événement <span className="text-blue-600 font-bold">{event?.title}</span> est bien enregistrée.
                            </p>
                        </div>

                        <button
                            onClick={() => router.push('/dashboard/planning')}
                            className="w-full py-4 rounded-2xl bg-slate-900 text-white font-medium text-sm hover:bg-blue-600 transition-all duration-300 shadow-xl"
                        >
                            Retour au planning
                        </button>
                    </div>
                </div>
            )}

            {/* Global style for safe areas */}
            <style jsx global>{`
                @supports (-webkit-touch-callout: none) {
                    .safe-top { padding-top: env(safe-area-inset-top); }
                    .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
                }
            `}</style>
        </div>
    );
}
