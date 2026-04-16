"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, User, Offer, Tenant } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import { formatCredits } from "@/lib/formatters";

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
                    <Link href={`/${slug}/home`} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 active:scale-95 transition-all text-slate-400">
                        <span className="text-lg">←</span>
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
                                <span className="text-lg group-hover:-translate-x-1 transition-transform">←</span>
                                Retour
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
                        <div className="bg-white px-6 py-4 md:px-8 md:py-5 rounded-[2rem] border border-slate-200 shadow-sm flex items-center justify-center gap-4 md:gap-6 self-center">
                            <span className="text-[10px] md:text-xs font-medium text-slate-400 capitalize tracking-tight whitespace-nowrap">Mon solde :</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl md:text-4xl font-semibold text-slate-900 leading-none">{formatCredits(balance)}</span>
                                <span className="text-xs md:text-base font-medium text-slate-500 lowercase">crédits</span>
                            </div>
                        </div>
                    </header>

                    {/* Catalog sections */}
                    {categoriesList.length > 0 ? (
                        <div className="mt-8 space-y-12">
                            {categoriesList.map(([category, categoryOffers]) => (
                                <section key={category} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{category}</h2>
                                        <div className="h-px flex-1 bg-slate-200"></div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                        {categoryOffers.map((offer) => {
                                            return (
                                                <div
                                                    key={offer.id}
                                                    className="group relative bg-white rounded-3xl p-6 border border-slate-200 hover:border-blue-400 transition-all duration-300 hover:shadow-2xl flex flex-col items-center justify-between overflow-hidden text-center"
                                                >
                                                    {/* Background decorative element */}
                                                    <div className="absolute inset-0 bg-blue-50/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-0"></div>
                                                    
                                                    <div className="relative z-10 space-y-4 w-full flex flex-col items-center">
                                                        <div className="space-y-2 w-full">
                                                            <h3 className="text-lg font-semibold text-slate-800 group-hover:text-blue-600 transition-colors capitalize tracking-tight">{offer.name}</h3>
                                                        </div>

                                                        <div className="flex flex-col items-center gap-0.5">
                                                            <div className="flex items-baseline justify-center gap-1.5">
                                                                <span className="text-2xl font-semibold text-slate-900">
                                                                    {offer.featured_pricing === "recurring" && offer.price_recurring_cents 
                                                                        ? (offer.price_recurring_cents / 100).toFixed(2)
                                                                        : (offer.price_lump_sum_cents ? (offer.price_lump_sum_cents / 100).toFixed(2) : "0.00")
                                                                    }€
                                                                </span>
                                                                {offer.featured_pricing === "recurring" && offer.period && (
                                                                    <span className="text-slate-400 text-xs font-medium lowercase">/{offer.period}</span>
                                                                )}
                                                            </div>
                                                            {/* Secondary line: Recurrence and alternative pricing */}
                                                            <p className="text-xs font-medium text-slate-400 leading-tight">
                                                                {offer.featured_pricing === "recurring" ? (
                                                                    <>
                                                                        pendant {offer.recurring_count} {offer.period || 'mois'}
                                                                        {offer.price_lump_sum_cents && ` • ou ${(offer.price_lump_sum_cents / 100).toFixed(2)}€ en 1x`}
                                                                    </>
                                                                ) : (
                                                                    offer.price_recurring_cents ? (
                                                                        `ou ${(offer.price_recurring_cents / 100).toFixed(2)}€ /${offer.period} pendant ${offer.recurring_count} mois`
                                                                    ) : ""
                                                                )}
                                                            </p>
                                                        </div>

                                                        <div className="space-y-1.5 w-full flex flex-col items-center">
                                                            <div className="flex items-center gap-2 text-slate-600 justify-center">
                                                                <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center text-xs">💎</div>
                                                                <span className="text-sm font-medium">
                                                                    {offer.is_unlimited ? "Crédits illimités" : `${offer.classes_included} crédits`}
                                                                </span>
                                                            </div>
                                                            
                                                            {offer.is_validity_unlimited ? (
                                                                <div className="flex items-center gap-2 text-purple-600 justify-center">
                                                                    <div className="w-5 h-5 rounded-full bg-purple-50 flex items-center justify-center text-xs">♾️</div>
                                                                    <span className="text-sm font-semibold">Validité illimitée</span>
                                                                </div>
                                                            ) : (offer.validity_days || offer.deadline_date) && (
                                                                <div className="flex items-center gap-2 text-slate-500 justify-center">
                                                                    <div className="w-5 h-5 rounded-full bg-slate-50 flex items-center justify-center text-xs">📅</div>
                                                                    <span className="text-xs font-medium opacity-80">
                                                                        {offer.deadline_date 
                                                                            ? `jusqu'au ${new Date(offer.deadline_date).toLocaleDateString()}`
                                                                            : `Validité : ${offer.validity_days} ${offer.validity_unit === 'months' ? 'mois' : 'jours'}`
                                                                        }
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {offer.is_unique && (
                                                                <div className="flex items-center gap-2 text-amber-600 justify-center">
                                                                    <div className="w-5 h-5 rounded-full bg-amber-50 flex items-center justify-center text-xs">🔒</div>
                                                                    <span className="text-xs font-semibold italic">Valable 1 fois / personne</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {offer.description && (
                                                            <div className="pt-2 border-t border-slate-50 w-full">
                                                                <p className="text-slate-400 text-xs leading-relaxed italic">{offer.description}</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-6 relative z-10 w-full">
                                                        <Link
                                                            href={`/${slug}/credits/checkout/${offer.id}`}
                                                            className="block w-full text-center py-2.5 rounded-2xl font-medium text-white bg-slate-900 hover:bg-blue-600 shadow-md shadow-slate-100 transition-all duration-300 text-[11px]"
                                                        >
                                                            Choisir cette offre
                                                        </Link>
                                                    </div>
                                                </div>
                                            );
                                        })}
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
