"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, User, Offer, Tenant } from "@/lib/api";
import { formatPrice } from "@/lib/formatters";
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
    const [selectedPricingType, setSelectedPricingType] = useState<'lump_sum' | 'recurring'>('lump_sum');
    const [hasMultiplePrices, setHasMultiplePrices] = useState(false);
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
                    router.push(`/${params.slug}/credits`);
                    return;
                }
                setOffer(foundOffer);
                setHasMultiplePrices(!!(foundOffer.price_lump_sum_cents && foundOffer.price_recurring_cents));
                setSelectedPricingType(foundOffer.featured_pricing || 'lump_sum');
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
            const res = await api.createShopOrder(offer.id, payLaterValue, startDate, selectedPricingType);
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
            router.push(`/${params.slug}/home`);
        } else {
            router.push(`/${params.slug}/home`);
        }
    };

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;
    if (!offer) return null;

    return (
        <div className="min-h-screen bg-white flex flex-col md:flex-row pb-20 md:pb-0">
            {/* PWA Mobile Header */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 z-40 md:hidden safe-top shadow-sm">
                <Link href={`/${params.slug}/credits`} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 active:scale-95 transition-all text-slate-400">
                    <span className="text-lg">←</span>
                </Link>
            </header>

            <main className="flex-1 px-5 pb-5 md:p-12 pt-16 md:pt-14">
                <div className="max-w-3xl mx-auto">
                    <header className="space-y-1 mb-4">
                        <div className="hidden md:flex items-center gap-2 mb-4">
                            <Link href={`/${params.slug}/credits`} className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group">
                                <span className="text-lg group-hover:-translate-x-1 transition-transform">←</span>
                                Retour à la boutique
                            </Link>
                        </div>
                        <h1 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight text-center md:text-left">Récapitulatif de votre commande</h1>
                    </header>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-6 md:p-8">
                            {/* Offer Details Summary */}
                            <div className="flex flex-col items-center gap-4 pb-8 border-b border-slate-200">
                                <div className="space-y-4 text-center">
                                    <h2 className="text-xl md:text-2xl font-bold text-slate-900 capitalize tracking-tight">{offer.name}</h2>
                                    
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <div className="w-5 h-5 flex items-center justify-center text-xs">💎</div>
                                            <span className="text-sm font-medium">{offer.is_unlimited ? "Crédits illimités" : `${offer.classes_included || 0} crédit${(offer.classes_included || 0) > 1 ? 's' : ''}`}</span>
                                        </div>
                                        {offer.is_validity_unlimited ? (
                                            <div className="flex items-center gap-2 text-emerald-600">
                                                <div className="w-5 h-5 flex items-center justify-center text-xs">♾️</div>
                                                <span className="text-sm font-semibold">Validité illimitée</span>
                                            </div>
                                        ) : (offer.validity_days || offer.deadline_date) && (
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <div className="w-5 h-5 flex items-center justify-center text-sm">🕒</div>
                                                <span className="text-sm font-medium">Validité : {offer.deadline_date ? `jusqu'au ${new Date(offer.deadline_date).toLocaleDateString()}` : `${offer.validity_unit === 'months' ? Math.round((offer.validity_days || 0) / 30) : offer.validity_days} ${offer.validity_unit === 'months' ? 'mois' : 'jours'}`}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="w-full text-center space-y-4 mt-1">
                                    {offer.description && (
                                        <div className="pt-0">
                                            <p className="text-slate-400 italic leading-relaxed text-[11px] md:text-[13px] max-w-xl mx-auto text-center">{offer.description}</p>
                                        </div>
                                    )}

                                    {/* Pricing Selection if multiple */}
                                    {hasMultiplePrices ? (
                                        <div className="grid grid-cols-2 gap-4 md:gap-6 max-w-sm mx-auto pt-2">
                                            <button 
                                                onClick={() => setSelectedPricingType('lump_sum')}
                                                style={{ 
                                                    borderColor: selectedPricingType === 'lump_sum' ? `${tenant?.primary_color}cc` : `${tenant?.primary_color}1a`,
                                                    background: selectedPricingType === 'lump_sum' ? `linear-gradient(135deg, ${tenant?.primary_color}0D 0%, ${tenant?.primary_color}1A 100%)` : 'white',
                                                    boxShadow: selectedPricingType === 'lump_sum' 
                                                        ? `3px 4px 14px -2px ${tenant?.primary_color}35` 
                                                        : `3px 4px 10px -2px #0000000a`
                                                }}
                                                className={`p-4 md:p-6 rounded-2xl border transition-all flex flex-col items-center gap-1.5 active:scale-95 ${selectedPricingType === 'lump_sum' ? '' : 'opacity-60 hover:opacity-100'}`}
                                            >
                                                <span className={`text-lg md:text-xl font-semibold leading-none ${selectedPricingType === 'lump_sum' ? 'text-black' : 'text-slate-800'}`}>{formatPrice(offer.price_lump_sum_cents)}</span>
                                                <span className={`text-[10px] font-medium lowercase tracking-normal ${selectedPricingType === 'lump_sum' ? 'text-black' : 'text-slate-400'}`}>en une fois</span>
                                            </button>
                                            <button 
                                                onClick={() => setSelectedPricingType('recurring')}
                                                style={{ 
                                                    borderColor: selectedPricingType === 'recurring' ? `${tenant?.primary_color}cc` : `${tenant?.primary_color}1a`,
                                                    background: selectedPricingType === 'recurring' ? `linear-gradient(135deg, ${tenant?.primary_color}0D 0%, ${tenant?.primary_color}1A 100%)` : 'white',
                                                    boxShadow: selectedPricingType === 'recurring' 
                                                        ? `3px 4px 14px -2px ${tenant?.primary_color}35` 
                                                        : `3px 4px 10px -2px #0000000a`
                                                }}
                                                className={`p-4 md:p-6 rounded-2xl border transition-all flex flex-col items-center gap-1.5 active:scale-95 ${selectedPricingType === 'recurring' ? '' : 'opacity-60 hover:opacity-100'}`}
                                            >
                                                <span className={`text-lg md:text-xl font-semibold leading-none ${selectedPricingType === 'recurring' ? 'text-black' : 'text-slate-800'}`}>{formatPrice(offer.price_recurring_cents)}</span>
                                                <span className={`text-[10px] font-medium lowercase tracking-normal ${selectedPricingType === 'recurring' ? 'text-black' : 'text-slate-400'}`}>x {offer.recurring_count} échéances</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 pt-2">
                                            <p className="text-2xl md:text-3xl font-bold text-slate-900 leading-none">
                                                {selectedPricingType === "recurring" && offer.price_recurring_cents 
                                                    ? formatPrice(offer.price_recurring_cents)
                                                    : formatPrice(offer.price_lump_sum_cents || offer.price_recurring_cents)
                                                }
                                            </p>
                                            {selectedPricingType === "recurring" && offer.recurring_count && (
                                                <p className="text-slate-500 text-[11px] font-semibold">{offer.recurring_count} échéances</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Payment Options */}
                            <div className="mt-6 space-y-4">
                                {/* Start Date Selection */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-center gap-2 text-slate-700">
                                        <span className="text-[11px] md:text-[13px] font-medium leading-tight text-center">A quelle date souhaitez-vous débuter votre offre ?</span>
                                    </div>
                                    <div className="max-w-md mx-auto">
                                        <DateInputZen 
                                            value={startDate}
                                            onChange={setStartDate}
                                        />
                                        <p className="text-[10px] text-slate-400 italic mt-1.5 text-center">Par défaut, l&apos;offre débute aujourd&apos;hui.</p>
                                    </div>
                                </div>

                                {tenant?.payment_redirect_link ? (
                                    <div className="space-y-4">
                                        <label className="flex items-center justify-center gap-3 cursor-pointer group mt-8 md:mt-12">
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
                                                <p className="text-xs text-amber-800 leading-relaxed text-center">
                                                    <strong>Attention !</strong> Si vous choisissez le paiement différé, vous n&apos;êtes pas redirigé vers le lien de paiement. Vos crédits sont disponibles dès maintenant pour réserver vos séances. Le règlement est à effectuer selon les conditions de l&apos;établissement.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
                                        <p className="text-xs text-blue-800 leading-relaxed text-center">
                                            L&apos;établissement ne propose pas de règlement en ligne pour le moment. Votre commande sera validée immédiatement et le règlement sera à effectuer selon les modalités de l&apos;établissement.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="mt-8">
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
                            <p className="text-xs text-slate-500 leading-relaxed font-medium">
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
