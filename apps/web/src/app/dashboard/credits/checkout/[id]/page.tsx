"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, User, Offer } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

export default function CheckoutPage() {
    const router = useRouter();
    const params = useParams();
    const offerId = params.id as string;

    const [user, setUser] = useState<User | null>(null);
    const [offer, setOffer] = useState<Offer | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [payLater, setPayLater] = useState(false);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successData, setSuccessData] = useState<{ message: string; redirect_url: string | null } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userData, offersData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getOffers(true) // Include all to find this specific one
                ]);
                setUser(userData);
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

    const handleCheckout = async (payLater: boolean) => {
        if (!offer) return;
        setProcessing(true);
        try {
            const res = await api.createShopOrder(offer.id, payLater, startDate);
            setSuccessData(res);
            setShowSuccess(true);
        } catch (err: any) {
            alert(err.response?.data?.detail || "Une erreur est survenue lors de la commande.");
            setProcessing(false);
        }
    };

    const handleFinalRedirect = () => {
        if (successData?.redirect_url) {
            window.location.href = successData.redirect_url;
        } else {
            router.push("/dashboard/orders"); // Redirige vers "Mes commandes"
        }
    };

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;
    if (!offer) return null;


    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-8">
                <div className="max-w-3xl mx-auto space-y-8">
                    <header className="space-y-4">
                        <Link href="/dashboard/credits" className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2 transition-colors">
                            ← Retour à la boutique
                        </Link>
                        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Récapitulatif de votre commande</h1>
                    </header>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-8 md:p-12 space-y-10">
                            {/* Offer Details Summary */}
                            <div className="flex flex-col md:flex-row justify-between items-start gap-8 pb-10 border-b border-slate-100">
                                <div className="space-y-4">
                                    <div>
                                        <span className="text-xs font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full">{offer.category || "Offre"}</span>
                                        <h2 className="text-3xl font-bold text-slate-900 mt-3">{offer.name}</h2>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                                        <div className="flex items-center gap-3 text-slate-700">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">✨</div>
                                            <span className="font-medium">{offer.is_unlimited ? "Crédits illimités" : `${offer.classes_included} crédits`}</span>
                                        </div>
                                        {offer.is_validity_unlimited ? (
                                            <div className="flex items-center gap-3 text-purple-700">
                                                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center">♾️</div>
                                                <span className="font-semibold">Validité illimitée</span>
                                            </div>
                                        ) : offer.validity_days && (
                                            <div className="flex items-center gap-3 text-slate-700">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">📅</div>
                                                <span className="font-medium">Validité {offer.validity_days} {offer.validity_unit === 'months' ? 'mois' : 'jours'}</span>
                                            </div>
                                        )}
                                    </div>

                                    {offer.description && (
                                        <div className="pt-6 border-t border-slate-100 mt-2">
                                            <p className="text-slate-500 max-w-md italic leading-relaxed text-sm">{offer.description}</p>
                                        </div>
                                    )}
                                </div>
                                <div className="text-right space-y-1">
                                    <p className="text-5xl font-black text-slate-900">
                                        {offer.featured_pricing === "recurring" && offer.price_recurring_cents 
                                            ? (offer.price_recurring_cents / 100).toFixed(2)
                                            : (offer.price_lump_sum_cents ? (offer.price_lump_sum_cents / 100).toFixed(2) : "0.00")
                                        }€
                                    </p>
                                    {offer.featured_pricing === "recurring" && offer.period && (
                                        <p className="text-slate-400 font-medium">{offer.period}{offer.recurring_count ? ` pendant ${offer.recurring_count} m.` : ""}</p>
                                    )}
                                    {((offer.featured_pricing === "recurring" && offer.price_lump_sum_cents) || 
                                      (offer.featured_pricing === "lump_sum" && offer.price_recurring_cents)) && (
                                        <p className="text-sm font-medium text-slate-400 italic">
                                            ou {offer.featured_pricing === "recurring" 
                                                ? `${(offer.price_lump_sum_cents! / 100).toFixed(2)}€ en 1x` 
                                                : `${(offer.price_recurring_cents! / 100).toFixed(2)}€ ${offer.period}${offer.recurring_count ? ` pendant ${offer.recurring_count} m.` : ""}`
                                            }
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Payment Options */}
                            <div className="space-y-10">
                                <div className="pt-4 space-y-8">
                                    {/* Start Date Selection */}
                                    <div className="space-y-3">
                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <span className="text-blue-600">📅</span>
                                            A quelle date souhaitez vous que votre offre débute ?
                                        </label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full max-w-xs px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none font-medium text-slate-700 bg-slate-50/50"
                                        />
                                        <p className="text-xs text-slate-400 italic">Par défaut, l&apos;offre débute aujourd&apos;hui.</p>
                                    </div>

                                    <label className="flex items-start gap-3 cursor-pointer group">
                                         <div className="relative flex items-center h-5 mt-0.5">
                                             <input
                                                 type="checkbox"
                                                 checked={payLater}
                                                 onChange={(e) => setPayLater(e.target.checked)}
                                                 className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-slate-300 transition-all checked:border-blue-600 checked:bg-blue-600"
                                             />
                                             <span className="absolute text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity pointer-events-none">
                                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" strokeWidth="1">
                                                     <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                 </svg>
                                             </span>
                                         </div>
                                         <div className="space-y-1">
                                             <span className="text-base font-semibold text-slate-700 block group-hover:text-blue-600 transition-colors">Option &quot;Payer plus tard&quot;</span>
                                             {payLater && (
                                                 <div className="mt-3 p-4 bg-amber-50/50 border border-amber-100 rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
                                                     <p className="text-xs text-amber-800 leading-relaxed">
                                                         <strong>Attention !</strong> Si vous choisissez le paiement différé, vous n&apos;êtes pas redirigé vers le lien de paiement. Vos crédits sont disponibles dès maintenant pour réserver vos séances. Le règlement est à effectuer selon les conditions de l&apos;établissement.
                                                     </p>
                                                 </div>
                                             )}
                                         </div>
                                     </label>
                                 </div>
 
                                 <button
                                     onClick={() => handleCheckout(payLater)}
                                     disabled={processing}
                                     className="w-full py-4 rounded-2xl bg-blue-600 text-white text-lg font-bold hover:bg-blue-700 hover:shadow-lg transition-all duration-300 disabled:opacity-50"
                                 >
                                     {processing ? "Traitement en cours..." : "Confirmer votre commande"}
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

            {/* Success Modal */}
            {showSuccess && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-6 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2rem] max-w-lg w-full p-10 shadow-2xl space-y-8 animate-in zoom-in-95 duration-300">
                        <div className="text-center space-y-4">
                            <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-5xl mx-auto shadow-inner">
                                ✓
                            </div>
                            <h2 className="text-3xl font-black text-slate-900">Commande enregistrée !</h2>
                            <p className="text-slate-600 text-lg leading-relaxed whitespace-pre-wrap">
                                {successData?.message}
                            </p>
                        </div>

                        <button
                            onClick={handleFinalRedirect}
                            className="w-full py-5 rounded-2xl bg-slate-900 text-white font-black text-xl hover:bg-blue-600 transition-all duration-300 shadow-xl"
                        >
                            {successData?.redirect_url ? "Procéder au paiement" : "Voir mes commandes"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
