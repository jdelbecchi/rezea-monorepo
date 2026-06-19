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
    const [balancesByActivity, setBalancesByActivity] = useState<Record<string, number | null>>({});
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
                setBalancesByActivity(accountData.balances_by_activity || {});
                setOffers(offersData);
                setTenantSettings(tenantData);
            } catch (err) {
                console.error(err);
                router.push(`/${slug}`);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router, slug]);

    const isAdminMode = false; // We can refine this later if needed

    if (loading) {
        return (
            <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-6">
                <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-500 font-medium text-xs tracking-widest animate-pulse uppercase">Chargement de la boutique...</p>
            </div>
        );
    }

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

    return (
        <div className="min-h-screen bg-white flex flex-col md:flex-row pb-20 md:pb-0 overflow-x-hidden">
            {isAdminMode && <Sidebar user={user} tenant={tenantSettings} />}

            {/* Main Content */}
            <main className={`flex-1 px-5 pb-5 md:p-12 pt-4 md:pt-12`}>
                <div className="max-w-5xl mx-auto">
                    <header className="mb-6">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 gap-4">
                            <h1 className="text-lg md:text-xl font-medium text-slate-900 tracking-tight flex items-center gap-2">
                                <span className="text-xl md:text-2xl">🛍️</span> Boutique
                            </h1>
                            {!isAdminMode && (
                                <Link href={`/${slug}/home`} className="flex items-center gap-1 text-[10px] md:text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group border border-slate-200 rounded-full px-2.5 py-1 hover:border-slate-300">
                                    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <span>Retour</span>
                                </Link>
                            )}
                        </div>

                        {/* Balance display below the separator line */}
                        <div className="mt-4 flex flex-col items-center">
                            {(() => {
                                const activities = Object.entries(balancesByActivity || {});
                                if (activities.length > 1) {
                                    return (
                                        <div className="flex flex-col items-center gap-1.5 max-w-md w-full">
                                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Mes soldes de crédits</span>
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {activities.map(([activity, bal]) => (
                                                    <div 
                                                        key={activity} 
                                                        className="px-3.5 py-1.5 rounded-2xl border flex items-center justify-center gap-2 shadow-sm bg-white"
                                                        style={{ 
                                                            borderColor: `${(tenantSettings?.primary_color || '#2563eb')}25`
                                                        }}
                                                    >
                                                        <span>💎</span>
                                                        <span className="text-xs md:text-sm font-bold text-slate-900 leading-none">
                                                            {bal === null ? "Illimité" : formatCredits(Number(bal))}
                                                        </span>
                                                        <span className="text-slate-500 text-[10px] lowercase font-medium">
                                                            {activity}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }
                                const singleAct = activities[0];
                                const label = singleAct && singleAct[0] !== "Toutes activités" ? ` (${singleAct[0]})` : "";
                                const balValue = singleAct ? (singleAct[1] === null ? "Illimité" : formatCredits(Number(singleAct[1]))) : formatCredits(balance);
                                return (
                                    <div 
                                        className="px-4 py-1.5 md:px-5 md:py-2 rounded-2xl border flex items-center justify-center gap-3 shadow-sm"
                                        style={{ 
                                            background: `linear-gradient(135deg, white, ${(tenantSettings?.primary_color || '#2563eb')}40)`,
                                            borderColor: `${(tenantSettings?.primary_color || '#2563eb')}30`
                                        }}
                                    >
                                        <span className="text-[11px] md:text-xs font-semibold text-slate-500 capitalize tracking-tight whitespace-nowrap">Mon solde{label} :</span>
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-lg md:text-xl font-semibold text-slate-900 leading-none">{balValue}</span>
                                            {balValue !== "Illimité" && (
                                                <span className="text-[10px] md:text-xs font-medium text-slate-500 lowercase">crédit{Number(balValue) > 1 ? 's' : ''}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </header>

                    {/* Catalog sections */}
                    {categoriesList.length > 0 ? (
                        <div className="mt-8 space-y-12">
                            {categoriesList.map(([category, categoryOffers]) => (
                                <section key={category} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <h2 
                                            className="text-xs font-bold uppercase tracking-wider"
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
                                                className="group relative bg-white rounded-2xl p-4 md:p-5 border transition-all duration-300 hover:bg-slate-50 hover:border-slate-400 flex flex-col items-center justify-between overflow-hidden text-center"
                                                style={{ 
                                                    boxShadow: `3px 4px 14px -2px ${(tenantSettings?.primary_color || '#2563eb')}40`,
                                                    borderColor: `${(tenantSettings?.primary_color || '#2563eb')}20`
                                                }}
                                            >
                                                <div className="relative z-10 space-y-3 w-full flex flex-col items-center">
                                                    <div className="space-y-1 w-full">
                                                        <h3 className="text-[15px] md:text-base font-semibold text-slate-800 group-hover:text-slate-900 transition-colors capitalize tracking-tight">{offer.name}</h3>
                                                    </div>
 
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <div className="flex items-baseline justify-center flex-wrap">
                                                            <span className="text-lg font-semibold text-slate-900">
                                                                {offer.featured_pricing === "recurring" && offer.price_recurring_cents 
                                                                    ? `${formatPrice(offer.price_recurring_cents)}`
                                                                    : `${formatPrice(offer.price_lump_sum_cents)}`
                                                                }
                                                            </span>
                                                            {offer.featured_pricing === "recurring" && (
                                                                <span className="text-slate-900 text-xs font-medium">
                                                                    /{(offer.period && offer.period !== 'null') ? offer.period : 'mois'}
                                                                    {offer.recurring_count && ` pendant ${offer.recurring_count} ${offer.period || 'mois'}`}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {/* Secondary line: Alternative pricing */}
                                                        <p className="text-[10px] md:text-xs font-medium text-slate-500 leading-tight">
                                                            {offer.featured_pricing === "recurring" ? (
                                                                offer.price_lump_sum_cents ? `ou ${formatPrice(offer.price_lump_sum_cents)} en une fois` : ""
                                                            ) : (
                                                                offer.price_recurring_cents ? (
                                                                    `ou ${formatPrice(offer.price_recurring_cents)}/${(offer.period && offer.period !== 'null') ? offer.period : 'mois'} pendant ${offer.recurring_count} mois`
                                                                ) : ""
                                                            )}
                                                        </p>
                                                    </div>
 
                                                    <div className="space-y-0.5 w-full flex flex-col items-center">
                                                        <div className="flex items-center gap-1.5 text-slate-500 justify-center">
                                                            <span className="text-xs">💎</span>
                                                            <span className="text-xs font-medium">
                                                                {offer.is_unlimited ? "Crédits illimités" : `${offer.classes_included || 0} crédit${(offer.classes_included || 0) > 1 ? 's' : ''}`}
                                                            </span>
                                                        </div>
                                                        {offer.allowed_activities && offer.allowed_activities.length > 0 && (
                                                            <div className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg mt-0.5 max-w-full">
                                                                <span className="text-[9px]">🏷️</span>
                                                                <span className="truncate capitalize">{offer.allowed_activities.join(", ")}</span>
                                                            </div>
                                                        )}
                                                        
                                                        {offer.is_validity_unlimited ? (
                                                            <div className="flex items-center gap-1.5 text-emerald-600/70 justify-center">
                                                                <span className="text-xs">♾️</span>
                                                                <span className="text-xs font-medium">Validité illimitée</span>
                                                            </div>
                                                        ) : (offer.validity_days || offer.deadline_date) && (
                                                            <div className="flex items-center gap-1.5 text-slate-500 justify-center">
                                                                <span className="text-[11px]">🕒</span>
                                                                <span className="text-xs font-medium">
                                                                    {offer.deadline_date 
                                                                        ? `jusqu'au ${new Date(offer.deadline_date).toLocaleDateString()}`
                                                                        : `Validité : ${offer.validity_unit === 'months' ? Math.round((offer.validity_days || 0) / 30) : offer.validity_days} ${offer.validity_unit === 'months' ? 'mois' : 'jours'}`
                                                                    }
                                                                </span>
                                                            </div>
                                                        )}
 
                                                        {offer.is_unique && (
                                                            <div className="flex items-center gap-1.5 text-amber-600/70 justify-center">
                                                                <span className="text-xs">🔒</span>
                                                                <span className="text-xs font-medium">Valable 1 fois / personne</span>
                                                            </div>
                                                        )}
                                                    </div>
 
                                                    {offer.description && (
                                                        <div className="pt-2 border-t border-slate-50 w-full">
                                                            <p className="text-slate-500 text-[10px] md:text-[11px] leading-relaxed italic">{offer.description}</p>
                                                        </div>
                                                    )}
                                                </div>
 
                                                <div className="mt-4 relative z-10 w-full">
                                                    <Link
                                                        href={`/${slug}/credits/checkout/${offer.id}`}
                                                        className="block w-fit mx-auto px-10 py-2 rounded-xl font-medium text-white bg-slate-900 hover:bg-slate-800 transition-all duration-300 text-xs shadow-lg shadow-slate-100"
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
                            <h3 className="text-xl font-bold text-slate-900">Catalogue vide</h3>
                            <p className="text-slate-500 text-xs max-w-md mx-auto">
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
