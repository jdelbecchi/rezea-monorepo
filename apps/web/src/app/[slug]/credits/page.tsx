"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, User, Offer, Tenant } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import { formatCredits, formatPrice } from "@/lib/formatters";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function CreditsPage() {
    const router = useRouter();
    const params = useParams();
    const slug = params.slug;
    const [user, setUser] = useState<User | null>(null);
    const [tenantSettings, setTenantSettings] = useState<Tenant | null>(null);
    const [balance, setBalance] = useState(0);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userData, accountData, offersData, tenantData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getCreditAccount(),
                    api.getOffers(false), // Only active offers
                    api.getTenantSettings()
                ]);
                setUser(userData);
                setBalance(accountData.balance);
                setOffers(offersData);
                setTenantSettings(tenantData);
            } catch (err) {
                console.error(err);
                router.push("/login");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;

    // Sort all offers first by category order then by offer order
    const sortedOffers = [...offers].sort((a, b) => 
        (a.category_display_order || 0) - (b.category_display_order || 0) || 
        (a.display_order || 0) - (b.display_order || 0)
    );

    // Group offers by category while preserving order
    const categoriesMap = new Map<string, Offer[]>();
    sortedOffers.forEach(offer => {
        const category = offer.category || "Autres";
        if (!categoriesMap.has(category)) categoriesMap.set(category, []);
        categoriesMap.get(category)!.push(offer);
    });

    const categoriesList = Array.from(categoriesMap.entries());

    const isAdminMode = false; // We can refine this later if needed

    return (
        <div className="min-h-screen bg-white flex flex-col md:flex-row pb-20 md:pb-0 overflow-x-hidden">
            {isAdminMode && <Sidebar user={user} tenant={tenantSettings} />}

            {/* PWA Mobile Header - Reduced Height and Tight Spacing */}
            {!isAdminMode && (
                <header className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 z-40 md:hidden safe-top shadow-sm">
                    <Link href={`/${slug}/home`} className="flex items-center gap-2 group text-slate-400 active:scale-95 transition-all">
                        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 ml-0.5" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-[13px] font-medium leading-none">Retour</span>
                    </Link>
                </header>
            )}

            {/* Main Content */}
            <main className={`flex-1 px-5 pb-5 md:p-12 ${!isAdminMode ? 'pt-16 md:pt-14' : ''}`}>
                <div className="max-w-5xl mx-auto">
                    {/* Desktop Header with Back Button */}
                    {!isAdminMode && (
                        <div className="hidden md:flex items-center gap-2 mb-10">
                            <Link href={`/${slug}/home`} className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group">
                                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 transition-transform group-hover:-translate-x-1" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span className="leading-none">Retour</span>
                            </Link>
                        </div>
                    )}
                    <header className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div className="px-1 space-y-1">
                            <h1 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight flex items-center gap-2">
                                <span className="text-2xl md:text-3xl">🛍️</span> Boutique
                            </h1>
                            <p className="text-slate-500 font-medium text-[11px] md:text-xs">Choisissez votre offre pour réserver vos séances</p>
                        </div>
                        
                        {/* More discrete balance display - Compact on mobile */}
                        <div 
                            className="px-6 py-3.5 md:px-8 md:py-4 rounded-2xl border flex items-center justify-center gap-4 md:gap-6 self-center shadow-sm md:transform origin-right"
                            style={{ 
                                background: `linear-gradient(135deg, white, ${(tenantSettings?.primary_color || '#2563eb')}40)`,
                                borderColor: `${(tenantSettings?.primary_color || '#2563eb')}30`
                            }}
                        >
                            <span className="text-xs md:text-sm font-semibold text-slate-500 capitalize tracking-tight whitespace-nowrap">Mon solde :</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl md:text-4xl font-semibold text-slate-900 leading-none">{formatCredits(balance)}</span>
                                <span className="text-sm md:text-base font-medium text-slate-500 lowercase">crédit{balance > 1 ? 's' : ''}</span>
                            </div>
                        </div>
                    </header>

                    {/* Catalog sections */}
                    {categoriesList.length > 0 ? (
                        <div className="mt-8 space-y-12">
                            {categoriesList.map(([category, categoryOffers]) => (
                                <section key={category} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <h2 
                                            className="text-sm font-bold uppercase tracking-wider"
                                            style={{ color: tenantSettings?.primary_color || '#2563eb' }}
                                        >
                                            {category}
                                        </h2>
                                        <div 
                                            className="h-px flex-1"
                                            style={{ backgroundColor: `${tenantSettings?.primary_color || '#2563eb'}30` }}
                                        ></div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                        {categoryOffers.map((offer) => (
                                            <div
                                                key={offer.id}
                                                className="group relative bg-slate-50 rounded-2xl p-6 border transition-all duration-300 hover:bg-slate-100 hover:border-slate-400 flex flex-col items-center justify-between overflow-hidden text-center"
                                                style={{ 
                                                    boxShadow: `3px 4px 14px -2px ${(tenantSettings?.primary_color || '#2563eb')}40`,
                                                    borderColor: `${(tenantSettings?.primary_color || '#2563eb')}20`
                                                }}
                                            >
                                                <div className="relative z-10 space-y-4 w-full flex flex-col items-center">
                                                    <div className="space-y-2 w-full">
                                                        <h3 className="text-[17px] md:text-lg font-semibold text-slate-800 group-hover:text-slate-900 transition-colors capitalize tracking-tight">{offer.name}</h3>
                                                    </div>

                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="flex items-baseline justify-center flex-wrap">
                                                            <span className="text-xl font-semibold text-slate-900">
                                                                {offer.featured_pricing === "recurring" && offer.price_recurring_cents 
                                                                    ? `${formatPrice(offer.price_recurring_cents)}`
                                                                    : `${formatPrice(offer.price_lump_sum_cents)}`
                                                                }
                                                            </span>
                                                            {offer.featured_pricing === "recurring" && (
                                                                <span className="text-slate-900 text-sm font-medium">
                                                                    /{(offer.period && offer.period !== 'null') ? offer.period : 'mois'}
                                                                    {offer.recurring_count && ` pendant ${offer.recurring_count} ${offer.period || 'mois'}`}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {/* Secondary line: Alternative pricing */}
                                                        <p className="text-xs md:text-sm font-medium text-slate-500 leading-tight">
                                                            {offer.featured_pricing === "recurring" ? (
                                                                offer.price_lump_sum_cents ? `ou ${formatPrice(offer.price_lump_sum_cents)} en une fois` : ""
                                                            ) : (
                                                                offer.price_recurring_cents ? (
                                                                    `ou ${formatPrice(offer.price_recurring_cents)}/${(offer.period && offer.period !== 'null') ? offer.period : 'mois'} pendant ${offer.recurring_count} mois`
                                                                ) : ""
                                                            )}
                                                        </p>
                                                    </div>

                                                    <div className="space-y-1.5 w-full flex flex-col items-center">
                                                        <div className="flex items-center gap-2 text-slate-500 justify-center">
                                                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs">💎</div>
                                                            <span className="text-sm font-medium">
                                                                {offer.is_unlimited ? "Crédits illimités" : `${offer.classes_included || 0} crédit${(offer.classes_included || 0) > 1 ? 's' : ''}`}
                                                            </span>
                                                        </div>
                                                        
                                                        {offer.is_validity_unlimited ? (
                                                            <div className="flex items-center gap-2 text-emerald-600/70 justify-center">
                                                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]">♾️</div>
                                                                <span className="text-xs font-semibold">Validité illimitée</span>
                                                            </div>
                                                        ) : (offer.validity_days || offer.deadline_date) && (
                                                            <div className="flex items-center gap-2 text-slate-500 justify-center">
                                                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[11px]">🕒</div>
                                                                <span className="text-sm font-medium">
                                                                    {offer.deadline_date 
                                                                        ? `jusqu'au ${new Date(offer.deadline_date).toLocaleDateString()}`
                                                                        : `Validité : ${offer.validity_days} ${offer.validity_unit === 'months' ? 'mois' : 'jours'}`
                                                                    }
                                                                </span>
                                                            </div>
                                                        )}

                                                        {offer.is_unique && (
                                                            <div className="flex items-center gap-2 text-amber-600/70 justify-center">
                                                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs">🔒</div>
                                                                <span className="text-sm font-medium">Valable 1 fois / personne</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {offer.description && (
                                                        <div className="pt-2 border-t border-slate-50 w-full">
                                                            <p className="text-slate-500 text-xs leading-relaxed italic">{offer.description}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-6 relative z-10 w-full">
                                                    <Link
                                                        href={`/${slug}/credits/checkout/${offer.id}`}
                                                        className="block w-fit mx-auto px-10 py-3 rounded-xl font-medium text-white bg-slate-900 hover:bg-slate-800 transition-all duration-300 text-xs shadow-lg shadow-slate-100"
                                                    >
                                                        Choisir cette offre
                                                    </Link>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-20 text-center space-y-4">
                            <div className="text-7xl">🛍️</div>
                            <h3 className="text-2xl font-bold text-slate-900">Catalogue vide</h3>
                            <p className="text-slate-500 max-w-md mx-auto">
                                Nous préparons de nouvelles offres pour vous. Revenez très bientôt pour découvrir nos nouveautés !
                            </p>
                        </div>
                    )}
                </div>
            </main>

            <BottomNav userRole={user?.role} />

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
