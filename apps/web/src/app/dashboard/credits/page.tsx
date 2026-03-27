"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, User, Offer } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

export default function CreditsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [balance, setBalance] = useState(0);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userData, accountData, offersData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getCreditAccount(),
                    api.getOffers(false) // Only active offers
                ]);
                setUser(userData);
                setBalance(accountData.balance);
                setOffers(offersData);
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

    // Group offers by category
    const categories = offers.reduce((acc, offer) => {
        const category = offer.category || "Autres";
        if (!acc[category]) acc[category] = [];
        acc[category].push(offer);
        return acc;
    }, {} as Record<string, Offer[]>);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            {/* Main Content */}
            <main className="flex-1 p-8">
                <div className="max-w-6xl mx-auto space-y-10">
                    <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Boutique</h1>
                            <p className="text-slate-500 mt-2 text-lg">Choisissez votre offre pour réserver vos séances</p>
                        </div>
                        
                        {/* More discrete balance display */}
                        <div className="bg-white px-6 py-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xl">
                                🎟️
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mon Solde</p>
                                <p className="text-2xl font-bold text-slate-900">{balance} <span className="text-sm font-medium text-slate-500">crédits</span></p>
                            </div>
                        </div>
                    </header>

                    {/* Catalog sections */}
                    {Object.keys(categories).length > 0 ? (
                        <div className="space-y-12">
                            {Object.entries(categories).map(([category, categoryOffers]) => (
                                <section key={category} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <h2 className="text-2xl font-bold text-slate-800">{category}</h2>
                                        <div className="h-px flex-1 bg-slate-200"></div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                        {categoryOffers.map((offer) => {
                                            return (
                                                <div
                                                    key={offer.id}
                                                    className="group relative bg-white rounded-3xl p-8 border border-slate-200 hover:border-blue-400 transition-all duration-300 hover:shadow-2xl flex flex-col justify-between overflow-hidden"
                                                >
                                                    {/* Background decorative element */}
                                                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-0"></div>
                                                    
                                                    <div className="relative z-10 space-y-6">
                                                        <div className="space-y-4">
                                                            <div className="flex justify-between items-start">
                                                                <h3 className="text-xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{offer.name}</h3>
                                                                {offer.is_unique && (
                                                                    <span className="px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider rounded-md border border-amber-100">
                                                                        Unique
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-baseline gap-2">
                                                                <span className="text-4xl font-black text-slate-900">
                                                                    {offer.featured_pricing === "recurring" && offer.price_recurring_cents 
                                                                        ? (offer.price_recurring_cents / 100).toFixed(2)
                                                                        : (offer.price_lump_sum_cents ? (offer.price_lump_sum_cents / 100).toFixed(2) : "0.00")
                                                                    }€
                                                                </span>
                                                                {offer.featured_pricing === "recurring" && offer.period && (
                                                                    <span className="text-slate-400 text-sm font-medium">{offer.period}</span>
                                                                )}
                                                                {offer.featured_pricing === "recurring" && offer.recurring_count && (
                                                                    <span className="text-slate-400 text-[10px] font-medium italic">pendant {offer.recurring_count} mois</span>
                                                                )}
                                                            </div>
                                                            {/* Secondary price display */}
                                                            {((offer.featured_pricing === "recurring" && offer.price_lump_sum_cents) || 
                                                              (offer.featured_pricing === "lump_sum" && offer.price_recurring_cents)) && (
                                                                <p className="text-sm font-medium text-slate-400">
                                                                    ou {offer.featured_pricing === "recurring" 
                                                                        ? `${(offer.price_lump_sum_cents! / 100).toFixed(2)}€ en une fois` 
                                                                        : `${(offer.price_recurring_cents! / 100).toFixed(2)}€ ${offer.period}${offer.recurring_count ? ` pendant ${offer.recurring_count} m.` : ""}`
                                                                    }
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-3 text-slate-600">
                                                                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">✨</div>
                                                                <span className="text-sm font-medium">
                                                                    {offer.is_unlimited ? "Crédits illimités" : `${offer.classes_included} crédits inclus`}
                                                                </span>
                                                            </div>
                                                            
                                                            {offer.is_validity_unlimited ? (
                                                                <div className="flex items-center gap-3 text-purple-600">
                                                                    <div className="w-5 h-5 rounded-full bg-purple-50 flex items-center justify-center text-[10px]">♾️</div>
                                                                    <span className="text-sm font-semibold">Validité illimitée</span>
                                                                </div>
                                                            ) : (offer.validity_days || offer.deadline_date) && (
                                                                <div className="flex items-center gap-3 text-slate-600">
                                                                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">📅</div>
                                                                    <span className="text-sm font-medium">
                                                                        {offer.deadline_date 
                                                                            ? `Valable jusqu'au ${new Date(offer.deadline_date).toLocaleDateString()}`
                                                                            : `Validité : ${offer.validity_days} ${offer.validity_unit === 'months' ? 'mois' : 'jours'}`
                                                                        }
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {offer.is_unique && (
                                                                <div className="flex items-center gap-3 text-amber-600">
                                                                    <div className="w-5 h-5 rounded-full bg-amber-50 flex items-center justify-center text-[10px]">🔒</div>
                                                                    <span className="text-sm font-semibold italic">Valable une fois / personne</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {offer.description && (
                                                            <div className="pt-4 border-t border-slate-100">
                                                                <p className="text-slate-500 text-sm leading-relaxed italic">{offer.description}</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-8 relative z-10">
                                                        <Link
                                                            href={`/dashboard/credits/checkout/${offer.id}`}
                                                            className="block w-full text-center py-4 rounded-2xl font-bold text-white bg-slate-900 hover:bg-blue-600 shadow-lg shadow-slate-200 hover:shadow-blue-200 transition-all duration-300"
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
        </div>
    );
}
