"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, User, Offer, Tenant } from "@/lib/api";
import BottomNav from "@/components/BottomNav";
import DateInputZen from "@/components/DateInputZen";

export default function CheckoutPage() {
    const router = useRouter();
    const params = useParams();
    const offerId = params.id as string;

    const [user, setUser] = useState<User | null>(null);
    const [offer, setOffer] = useState<Offer | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [payLater, setPayLater] = useState(false);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successData, setSuccessData] = useState<{ message: string; redirect_url: string | null } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userData, offersData, tenantData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getOffers(true),
                    api.getTenantSettings()
                ]);
                setUser(userData);
                setTenant(tenantData);
                
                // If payment link is missing, force payLater
                if (!tenantData.payment_redirect_link) {
                    setPayLater(true);
                }

                const foundOffer = offersData.find((o: Offer) => o.id === offerId);
                if (!foundOffer) {
                    router.push("/dashboard/credits");
                    return;
                }
                setOffer(foundOffer);
            } catch (err) {
                console.error(err);
                router.push("/login");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [offerId, router]);

    const handleCheckout = async (payLaterValue: boolean) => {
        if (!offer) return;
        setProcessing(true);
        try {
            const res = await api.createShopOrder(offer.id, payLaterValue, startDate);
            setSuccessData(res);
            setShowSuccess(true);
        } catch (err: any) {
            alert(err.response?.data?.detail || "Une erreur est survenue lors de la commande.");
            setProcessing(false);
        }
    };

    const handleFinalRedirect = () => {
        if (successData?.redirect_url && tenant?.payment_redirect_link) {
            window.open(successData.redirect_url, '_blank');
            router.push("/dashboard");
        } else {
            router.push("/dashboard");
        }
    };

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;
    if (!offer) return null;

    return (
        <div className="min-h-screen bg-white flex flex-col md:flex-row pb-20 md:pb-0">
            {/* PWA Mobile Header */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 z-40 md:hidden safe-top shadow-sm">
                <Link href="/dashboard/credits" className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 active:scale-95 transition-all text-slate-400">
                    <span className="text-lg">←</span>
                </Link>
            </header>

            <main className="flex-1 px-5 pb-5 md:p-12 pt-16 md:pt-14">
                <div className="max-w-3xl mx-auto">
                    <header className="space-y-1 mb-4">
                        <div className="hidden md:flex items-center gap-2 mb-4">
                            <Link href="/dashboard/credits" className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group">
                                <span className="text-lg group-hover:-translate-x-1 transition-transform">←</span>
                                Retour à la boutique
                            </Link>
                        </div>
                        <h1 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight">Récapitulatif de votre commande</h1>
                    </header>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-6 md:p-8">
                            {/* Offer Details Summary */}
                            <div className="flex flex-col md:flex-row justify-between items-start gap-8 pb-6 border-b border-slate-100">
                                <div className="space-y-4">
                                    <div>
                                        <span className="text-[10px] font-semibold text-blue-600 capitalize bg-blue-50 px-3 py-1 rounded-full">{offer.category || "Offre"}</span>
                                        <h2 className="text-lg md:text-xl font-semibold text-slate-900 mt-2 capitalize tracking-tight">{offer.name}</h2>
                                    </div>
                                    <div className="space-y-1.5 mt-6">
                                        <div className="flex items-center gap-3 text-slate-700">
                                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-sm">💎</div>
                                            <span className="text-sm font-medium">{offer.is_unlimited ? "Crédits illimités" : `${offer.classes_included} crédits`}</span>
                                        </div>
                                        {offer.is_validity_unlimited ? (
                                            <div className="flex items-center gap-3 text-purple-700">
                                                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-sm">♾️</div>
                                                <span className="text-sm font-semibold">Validité illimitée</span>
                                            </div>
                                        ) : (offer.validity_days || offer.deadline_date) && (
                                            <div className="flex items-center gap-3 text-slate-700">
                                                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-sm">📅</div>
                                                <span className="text-sm font-medium">validité {offer.deadline_date ? `jusqu'au ${new Date(offer.deadline_date).toLocaleDateString()}` : `${offer.validity_days} ${offer.validity_unit === 'months' ? 'mois' : 'jours'}`}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="w-full md:w-auto text-center md:text-right space-y-2">
                                    <div className="space-y-1">
                                        <p className="text-xl md:text-2xl font-semibold text-slate-900 leading-none">
                                            {offer.featured_pricing === "recurring" && offer.price_recurring_cents 
                                                ? (offer.price_recurring_cents / 100).toFixed(2)
                                                : (offer.price_lump_sum_cents ? (offer.price_lump_sum_cents / 100).toFixed(2) : "0.00")
                                            }€
                                        </p>
                                        {offer.featured_pricing === "recurring" && offer.period && (
                                            <p className="text-slate-400 text-[10px] font-medium lowercase">/{offer.period}{offer.recurring_count ? ` x${offer.recurring_count}` : ""}</p>
                                        )}
                                        {((offer.featured_pricing === "recurring" && offer.price_lump_sum_cents) || 
                                        (offer.featured_pricing === "lump_sum" && offer.price_recurring_cents)) && (
                                            <p className="text-[10px] font-medium text-slate-400 italic">
                                                ou {offer.featured_pricing === "recurring" 
                                                    ? `${(offer.price_lump_sum_cents! / 100).toFixed(2)}€ en 1x` 
                                                    : `${(offer.price_recurring_cents! / 100).toFixed(2)}€ /${offer.period}${offer.recurring_count ? ` x${offer.recurring_count}` : ""}`
                                                }
                                            </p>
                                        )}
                                    </div>

                                    {offer.description && (
                                        <div className="pt-2">
                                            <p className="text-slate-400 italic leading-relaxed text-[11px] max-w-[200px] mx-auto md:ml-auto text-center md:text-right">{offer.description}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Payment Options */}
                            <div className="mt-4 space-y-6">
                                <div className="space-y-4">
                                    {/* Start Date Selection */}
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] md:text-[13px] font-semibold text-slate-700 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-2 text-center md:text-left">
                                            <span className="text-slate-400">🏁</span>
                                            <span>A quelle date souhaitez vous <br className="md:hidden" /> que votre offre débute ?</span>
                                        </label>
                                        <div className="max-w-xs mx-auto md:mx-0">
                                            <DateInputZen 
                                                value={startDate}
                                                onChange={setStartDate}
                                            />
                                            <p className="text-[10px] text-slate-400 italic mt-1.5 text-center md:text-left">Par défaut, l&apos;offre débute aujourd&apos;hui.</p>
                                        </div>
                                    </div>

                                    {tenant?.payment_redirect_link ? (
                                        <div className="space-y-4">
                                            <label className="flex items-center justify-center md:justify-start gap-3 cursor-pointer group mt-8 md:mt-4">
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
                                                        <strong>Attention !</strong> Si vous choisissez le paiement différé, vous n&apos;êtes pas redirigé vers le lien de paiement. Vos crédits sont disponibles dès maintenant pour réserver vos séances. Le règlement est à effectuer selon les conditions de l&apos;établissement.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
                                            <p className="text-xs text-blue-800 leading-relaxed text-center md:text-left">
                                                L&apos;établissement ne propose pas de règlement en ligne pour le moment. Votre commande sera validée immédiatement et le règlement sera à effectuer selon les modalités de l&apos;établissement.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => handleCheckout(payLater)}
                                    disabled={processing}
                                    className="w-full py-3.5 rounded-[1.5rem] bg-slate-900 text-white text-sm font-medium hover:bg-blue-600 shadow-xl shadow-slate-100 transition-all duration-300 disabled:opacity-50"
                                >
                                    {processing ? "Traitement..." : "Confirmer la commande"}
                                </button>
                            </div>
                        </div>
                        
                        <div className="bg-slate-50 p-6 border-t border-slate-100 flex items-center gap-4">
                            <div className="text-2xl">🛡️</div>
                            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
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
                    <div className="bg-white rounded-[2.5rem] max-w-sm w-full p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 text-center">
                        <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center text-3xl mx-auto">
                            ✓
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Commande validée !</h2>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                {successData?.message || "Votre commande a été enregistrée avec succès."}
                            </p>
                        </div>

                        <button
                            onClick={handleFinalRedirect}
                            className="w-full py-4 rounded-2xl bg-slate-900 text-white font-medium text-sm hover:bg-blue-600 transition-all duration-300 shadow-xl"
                        >
                            {(successData?.redirect_url && tenant?.payment_redirect_link) ? "Procéder au paiement" : "Retour à l'accueil"}
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
