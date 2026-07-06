"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, User, Offer, Tenant } from "@/lib/api";
import { formatPrice } from "@/lib/formatters";
import BottomNav from "@/components/BottomNav";
import DateInputZen from "@/components/DateInputZen";
import ConfirmModal from "@/components/ConfirmModal";

function CheckoutPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const offerId = searchParams.get('id') as string;

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
                const [userData, offersData, tenantData, myOrdersData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getOffers(true),
                    api.getTenantSettings(),
                    api.getMyOrders()
                ]);
                setUser(userData);
                setTenant(tenantData);
                
                // If payment link is missing, force payLater
                if (!tenantData.payment_redirect_link) {
                    setPayLater(true);
                }

                const foundOffer = offersData.find((o: Offer) => o.id === offerId);
                if (!foundOffer) {
                    router.push('/credits');
                    return;
                }

                // Check if user already purchased this unique offer
                if (foundOffer.is_unique && myOrdersData.some((order: any) => order.offer_id === foundOffer.id && order.status !== 'resiliee')) {
                    alert("Vous avez déjà commandé cette offre unique.");
                    router.push('/credits');
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
            let url = successData.redirect_url;
            if (!/^https?:\/\//i.test(url)) {
                url = `https://${url}`;
            }
            window.open(url, '_blank');
            router.push('/home');
        } else {
            router.push('/home');
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-6">
                <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-500 font-medium text-xs tracking-widest animate-pulse uppercase">Chargement du récapitulatif...</p>
            </div>
        );
    }
    if (!offer) return null;

    return (
        <div className="min-h-screen bg-white flex flex-col md:flex-row pb-20 md:pb-0">
            <main className="flex-1 px-5 pb-5 md:p-12 pt-4 md:pt-12">
                <div className="max-w-3xl mx-auto">
                    <header className="flex items-center justify-between pb-3 border-b border-slate-200 mb-6 gap-4">
                        <h1 className="text-[14px] sm:text-base md:text-lg font-medium text-slate-900 tracking-tight">Récapitulatif de commande</h1>
                        <Link href="/credits" className="flex items-center gap-1 text-[10px] md:text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group border border-slate-200 rounded-full px-2.5 py-1 hover:border-slate-300">
                            <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span>Retour</span>
                        </Link>
                    </header>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-6 md:p-8">
                            {/* Offer Details Summary */}
                            <div className="flex flex-col items-center gap-4 pb-8 border-b border-slate-200">
                                <div className="space-y-4 text-center">
                                    <h2 className="text-lg md:text-xl font-semibold text-slate-900 capitalize tracking-tight">{offer.name}</h2>
                                    <div className="pt-1">
                                        <div 
                                            className="inline-block text-[13px] md:text-sm font-semibold px-4 py-1 rounded-full border transition-colors capitalize"
                                            style={{
                                                backgroundColor: `${tenant?.primary_color || '#2563eb'}10`,
                                                borderColor: `${tenant?.primary_color || '#2563eb'}30`,
                                                color: tenant?.primary_color || '#2563eb'
                                            }}
                                        >
                                            {offer.allowed_activities && offer.allowed_activities.length > 0 
                                                ? offer.allowed_activities.join(", ") 
                                                : "Toutes activités"
                                            }
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col items-center gap-1">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <div className="w-5 h-5 flex items-center justify-center text-xs">💎</div>
                                            <span className="text-xs font-medium">{offer.is_unlimited ? "Crédits illimités" : `${offer.classes_included || 0} crédit${(offer.classes_included || 0) > 1 ? 's' : ''}`}</span>
                                        </div>
                                        {offer.is_validity_unlimited ? (
                                            <div className="flex items-center gap-2 text-emerald-600">
                                                <div className="w-5 h-5 flex items-center justify-center text-xs">♾️</div>
                                                <span className="text-xs font-semibold">Validité illimitée</span>
                                            </div>
                                        ) : (offer.validity_days || offer.deadline_date) && (
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <div className="w-5 h-5 flex items-center justify-center text-sm">🕒</div>
                                                <span className="text-xs font-medium">Validité : {offer.deadline_date ? `jusqu'au ${new Date(offer.deadline_date).toLocaleDateString()}` : `${offer.validity_unit === 'months' ? Math.round((offer.validity_days || 0) / 30) : offer.validity_days} ${offer.validity_unit === 'months' ? 'mois' : 'jours'}`}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="w-full text-center space-y-4 mt-1">
                                    {offer.description && (
                                        <div className="pt-0">
                                            <p className="text-slate-600 font-medium leading-relaxed text-xs md:text-sm max-w-xl mx-auto text-center">{offer.description}</p>
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
                                                <span className={`text-[11px] font-medium lowercase tracking-normal ${selectedPricingType === 'lump_sum' ? 'text-black' : 'text-slate-500'}`}>en une fois</span>
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
                                                <span className={`text-[11px] font-medium lowercase tracking-normal ${selectedPricingType === 'recurring' ? 'text-black' : 'text-slate-500'}`}>x {offer.recurring_count} échéances</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 pt-2">
                                            <p className="text-2xl md:text-3xl font-semibold text-slate-900 leading-none">
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
                                        {tenant.allow_pay_later_offers ? (
                                            <>
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
                                                    <span className="text-xs font-medium text-slate-700">Option &quot;Payer plus tard&quot;</span>
                                                </label>

                                                {payLater && (
                                                    <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
                                                        <p className="text-xs text-amber-800 leading-relaxed text-center">
                                                            <strong>Attention !</strong> Si vous choisissez le paiement différé, vous n&apos;êtes pas redirigé vers le lien de paiement. Vos crédits sont disponibles dès maintenant pour réserver vos séances. Le règlement est à effectuer selon les conditions de l&apos;établissement.
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="pt-8 md:pt-12 text-center">
                                                <p className="text-[11px] text-slate-400 italic">
                                                    Le paiement immédiat est requis pour cette commande.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
                                        <p className="text-xs text-blue-800 leading-relaxed text-center">
                                            Le règlement en ligne n&apos;est pas proposé pour le moment. Votre commande sera validée immédiatement et le règlement sera à effectuer selon les modalités de l&apos;établissement.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="mt-8 flex flex-col items-center">
                                <button
                                    onClick={() => handleCheckout(payLater)}
                                    disabled={processing}
                                    className="w-full md:max-w-sm py-3.5 rounded-2xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 shadow-xl shadow-slate-100 transition-all duration-300 disabled:opacity-50"
                                >
                                    {processing ? "Traitement..." : "Confirmer la commande"}
                                </button>
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

            <ConfirmModal
                isOpen={showSuccess}
                title="Commande validée !"
                message={successData?.message || "Votre commande a été enregistrée avec succès."}
                type="success-check"
                confirmLabel={(successData?.redirect_url && tenant?.payment_redirect_link) ? "Procéder au paiement" : "Retour à l'accueil"}
                onConfirm={handleFinalRedirect}
            />

            <style jsx global>{`
                @supports (-webkit-touch-callout: none) {
                    .safe-top { padding-top: env(safe-area-inset-top); }
                    .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
                }
            `}</style>
        </div>
    );
}

export default function CheckoutPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>}>
            <CheckoutPageContent />
        </Suspense>
    );
}
