"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, Event, Tenant, User } from "@/lib/api";
import { formatPrice } from "@/lib/formatters";
import BottomNav from "@/components/BottomNav";

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
    const [error, setError] = useState<string | null>(null);
    const [payLater, setPayLater] = useState(true);

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
                
                // If payment link is missing, force payLater
                if (!tenantData.payment_redirect_link) {
                    setPayLater(true);
                }
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

    return (
        <div className="min-h-screen bg-white flex flex-col md:flex-row pb-20 md:pb-0 overflow-x-hidden">
            {/* PWA Mobile Header */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 z-40 md:hidden safe-top shadow-sm">
                <Link href={`/${params.slug}/planning`} className="flex items-center gap-2 group text-slate-400 active:scale-95 transition-all">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 ml-0.5" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-[13px] font-medium leading-none">Retour</span>
                </Link>
            </header>

            <main className="flex-1 px-5 pb-5 md:p-12 pt-16 md:pt-14">
                <div className="max-w-3xl mx-auto">
                    <header className="space-y-1 mb-4">
                        <div className="hidden md:flex items-center gap-2 mb-4">
                            <Link href={`/${params.slug}/planning`} className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group">
                                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 transition-transform group-hover:-translate-x-1" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span className="leading-none">Retour au planning</span>
                            </Link>
                        </div>
                        <h1 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight">Récapitulatif de votre inscription</h1>
                    </header>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden relative">
                        <div className="p-6 md:p-8">
                            {/* Événement Badge (Top Right) */}
                            <div 
                                className="absolute top-2 right-2 px-3 py-1 rounded-full text-[10px] font-bold shadow-sm"
                                style={{ 
                                    backgroundColor: `${(tenant?.primary_color || '#2563eb')}15`,
                                    color: tenant?.primary_color || '#2563eb'
                                }}
                            >
                                Événement
                            </div>

                            <div className="flex flex-col items-center text-center gap-6 pb-6 border-b border-slate-100">
                                <div className="mt-4 flex flex-col items-center">
                                    <h2 className="text-[22px] md:text-[26px] font-semibold text-slate-900 tracking-tight leading-tight">
                                        {event?.title}
                                    </h2>
                                    <p className="text-sm md:text-base font-normal text-slate-600 mt-1.5">
                                        par <span className="font-semibold" style={{ color: tenant?.primary_color || '#2563eb' }}>{event?.instructor_name || tenant?.name}</span>
                                    </p>
                                    
                                    <div className="w-24 h-px bg-slate-300 mx-auto mt-6"></div>

                                    {event?.description && (
                                        <p className="text-slate-600 text-xs md:text-sm font-normal leading-relaxed max-w-sm mx-auto mt-7">
                                            {event.description}
                                        </p>
                                    )}
                                </div>

                                <div className="w-full max-w-sm mx-auto mt-3 text-left relative pl-10 py-1">
                                    {/* Sidebar accent color - thinner and more subtle */}
                                    <div 
                                        className="absolute left-2 top-0 bottom-0 w-[3px] rounded-full"
                                        style={{ 
                                            background: `linear-gradient(to bottom, ${tenant?.primary_color || '#2563eb'}, ${(tenant?.primary_color || '#2563eb')}10)`,
                                            boxShadow: `0 0 10px ${(tenant?.primary_color || '#2563eb')}10`
                                        }}
                                    ></div>

                                    <div className="space-y-4">
                                        {/* Date Row */}
                                        <div className="flex items-center gap-5 group">
                                            <div className="w-10 h-10 rounded-xl bg-slate-50/50 flex items-center justify-center text-lg shadow-sm border border-slate-100/50 group-hover:scale-105 transition-transform duration-300">📅</div>
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.15em]">Date</p>
                                                <p className="text-[15px] font-medium text-slate-700 leading-tight">
                                                    {event?.event_date ? new Date(event.event_date).toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'long' }) : ""}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Time Row */}
                                        <div className="flex items-center gap-5 group">
                                            <div className="w-10 h-10 rounded-xl bg-slate-50/50 flex items-center justify-center text-lg shadow-sm border border-slate-100/50 group-hover:scale-105 transition-transform duration-300">🕒</div>
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.15em]">Horaire</p>
                                                <p className="text-[15px] font-medium text-slate-700 leading-tight">{event?.event_time}</p>
                                            </div>
                                        </div>

                                        {/* Location Row */}
                                        {event?.location && (
                                            <div className="flex items-center gap-5 group">
                                                <div className="w-10 h-10 rounded-xl bg-slate-50/50 flex items-center justify-center text-lg shadow-sm border border-slate-100/50 group-hover:scale-105 transition-transform duration-300">📍</div>
                                                <div className="space-y-0.5">
                                                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.15em]">Lieu</p>
                                                    <p className="text-[15px] font-medium text-slate-700 leading-tight">{event.location}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {event?.price_member_cents === event?.price_external_cents && (
                                    <div className="pt-2">
                                        <p className="text-2xl font-bold text-slate-900 leading-none">
                                            {formatPrice(event?.price_member_cents)}
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-medium mt-1.5 opacity-60">Tarif unique</p>
                                    </div>
                                )}
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
                                            className="p-4 rounded-2xl border transition-all flex items-center justify-center gap-4 h-16 shadow-sm"
                                            style={{ 
                                                borderColor: tariff === 'member' ? (tenant?.primary_color || '#2563eb') : '#f1f5f9',
                                                backgroundColor: tariff === 'member' ? `${(tenant?.primary_color || '#2563eb')}10` : '#ffffff',
                                                borderWidth: tariff === 'member' ? '1.5px' : '1px'
                                            }}
                                        >
                                            <p className={`text-[10px] font-semibold uppercase tracking-widest ${tariff === 'member' ? 'text-black' : 'text-slate-400'}`}>Tarif Membre</p>
                                            <div className="w-px h-4 bg-slate-200"></div>
                                            <p className={`text-base font-semibold ${tariff === 'member' ? 'text-black' : 'text-slate-900'}`}>{formatPrice(event?.price_member_cents)}</p>
                                        </button>

                                        <button
                                            onClick={() => setTariff('external')}
                                            className="p-4 rounded-2xl border transition-all flex items-center justify-center gap-4 h-16 shadow-sm"
                                            style={{ 
                                                borderColor: tariff === 'external' ? (tenant?.primary_color || '#2563eb') : '#f1f5f9',
                                                backgroundColor: tariff === 'external' ? `${(tenant?.primary_color || '#2563eb')}10` : '#ffffff',
                                                borderWidth: tariff === 'external' ? '1.5px' : '1px'
                                            }}
                                        >
                                            <p className={`text-[10px] font-semibold uppercase tracking-widest ${tariff === 'external' ? 'text-black' : 'text-slate-400'}`}>Tarif Extérieur</p>
                                            <div className="w-px h-4 bg-slate-200"></div>
                                            <p className={`text-base font-semibold ${tariff === 'external' ? 'text-black' : 'text-slate-900'}`}>{formatPrice(event?.price_external_cents)}</p>
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-400 italic px-2">
                                        Note : Le manager se réserve le droit de modifier le tarif si celui-ci ne correspond pas à votre statut réel.
                                    </p>
                                </div>
                            ) : null}

                            {/* Confirmation Section */}
                            <div className="mt-10 md:mt-16 space-y-6">
                                <div className="space-y-4">
                                    {tenant?.payment_redirect_link ? (
                                        <>
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
                                                        <span className="font-bold">Attention !</span> Si vous choisissez le paiement différé, vous n&apos;êtes pas redirigé vers le lien de paiement. Votre inscription est enregistrée et le règlement sera à effectuer selon les conditions de l&apos;établissement.
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
                                            <p className="text-xs text-blue-800 leading-relaxed text-center md:text-left">
                                                L&apos;établissement ne propose pas de règlement en ligne pour le moment. Votre inscription sera validée immédiatement et le règlement sera à effectuer selon les modalités de l&apos;établissement.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8 flex flex-col items-center">
                                    <button
                                        onClick={handleConfirm}
                                        disabled={submitting}
                                        className="w-full md:max-w-sm py-4 rounded-2xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 shadow-xl shadow-slate-100 transition-all active:scale-[0.98] disabled:opacity-50"
                                    >
                                        {submitting ? "Traitement..." : "Confirmez votre inscription"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 border-t border-slate-100 flex flex-col items-center justify-center gap-2 text-center">
                            <div className="text-xl opacity-50">🛡️</div>
                            <p className="text-xs text-slate-500 leading-relaxed font-medium max-w-sm">
                                En confirmant votre commande, vous acceptez nos conditions générales de vente.
                            </p>
                        </div>
                    </div>
                </div>
            </main>


            <BottomNav userRole={user?.role} />

            {/* Success Modal */}
            {showSuccess && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-6 animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 text-center">
                        <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center text-3xl mx-auto">
                            ✨
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">C'est validé !</h2>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                Votre inscription à l'événement <span className="font-semibold" style={{ color: tenant?.primary_color || "#2563eb" }}>{event?.title}</span> est bien enregistrée.
                            </p>
                            {!tenant?.payment_redirect_link && (
                                <p className="text-xs text-slate-400 mt-2 italic leading-relaxed">
                                    Le règlement sera à effectuer selon les modalités de l'établissement.
                                </p>
                            )}
                        </div>

                        <button
                            onClick={() => router.push(`/${params.slug}/planning`)}
                            className="w-full py-4 rounded-2xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition-all duration-300 shadow-xl"
                        >
                            {tenant?.payment_redirect_link ? "Retour au planning" : "Retour au planning"}
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
