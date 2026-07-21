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
    const [frozenBalance, setFrozenBalance] = useState(0);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [balancesByActivity, setBalancesByActivity] = useState<Record<string, number | null>>({});
    const [frozenByActivity, setFrozenByActivity] = useState<Record<string, number>>({});
    const [myOrders, setMyOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userData, accountData, offersData, tenantData, myOrdersData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getCreditAccount(),
                    api.getOffers(false), // Only active offers
                    api.getTenantSettings(),
                    api.getMyOrders()
                ]);
                setUser(userData);
                setBalance(accountData.balance);
                setFrozenBalance(accountData.frozen_balance || 0);
                setBalancesByActivity(accountData.balances_by_activity || {});
                setFrozenByActivity(accountData.frozen_by_activity || {});
                setOffers(offersData);
                setTenantSettings(tenantData);
                setMyOrders(myOrdersData);
            } catch (err) {
                console.error(err);
                router.push('/');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

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
                <div className="max-w-6xl mx-auto">
                    <header className="mb-6">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 gap-4">
                            <h1 className="text-lg md:text-xl font-medium text-slate-900 tracking-tight flex items-center gap-2">
                                <span className="text-xl md:text-2xl">🛍️</span> Boutique
                            </h1>
                            {!isAdminMode && (
                                <Link href="/home" className="flex items-center gap-1 text-[10px] md:text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group border border-slate-200 rounded-full px-2.5 py-1 hover:border-slate-300">
                                    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <span>Retour</span>
                                </Link>
                            )}
                        </div>
                        {/* Balance display below the separator line */}
                        {(balance > 0 || frozenBalance > 0) && (
                            <div className="mt-4 flex flex-col items-center">
                                {(() => {
                                    const activities = Object.entries(balancesByActivity || {})
                                        .filter(([_, bal]) => bal === null || Number(bal) > 0)
                                        .sort(([a], [b]) => {
                                            if (a === "Toutes activités") return -1;
                                            if (b === "Toutes activités") return 1;
                                            return a.localeCompare(b);
                                        });
                                    if (activities.length === 0) return null;
                                    if (activities.length > 1) {
                                        return (
                                            <div className="flex flex-col items-center gap-1.5 max-w-md w-full">
                                                <span className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-wider">Mes soldes de crédits</span>
                                                <div className="flex flex-wrap justify-center gap-2">
                                                    {activities.map(([activity, bal]) => {
                                                        return (
                                                            <div 
                                                                key={activity} 
                                                                className="px-3.5 py-1.5 md:px-4 md:py-2 rounded-2xl border flex items-center justify-center gap-2 md:gap-3 shadow-sm bg-white"
                                                                style={{ 
                                                                    borderColor: `${(tenantSettings?.primary_color || '#2563eb')}25`
                                                                }}
                                                            >
                                                                <span className="text-sm md:text-base">💎</span>
                                                                <span className="text-xs md:text-sm font-medium text-slate-900 leading-none">
                                                                    {bal === null ? "Illimité" : formatCredits(Number(bal))}
                                                                </span>
                                                                <span className="text-slate-500 text-[11px] md:text-xs capitalize font-medium">
                                                                    {activity}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    }
                                    const singleAct = activities[0];
                                    const label = singleAct && singleAct[0] !== "Toutes activités" ? ` (${singleAct[0]})` : "";
                                    const balValue = singleAct ? (singleAct[1] === null ? "Illimité" : formatCredits(Number(singleAct[1]))) : formatCredits(balance);
                                    return (
                                        <div className="flex flex-col items-center gap-1.5">
                                            <div 
                                                className="px-4 py-1.5 md:px-5 md:py-2 rounded-2xl border flex items-center justify-center gap-3 shadow-sm"
                                                style={{ 
                                                    background: `linear-gradient(135deg, white, ${(tenantSettings?.primary_color || '#2563eb')}40)`,
                                                    borderColor: `${(tenantSettings?.primary_color || '#2563eb')}30`
                                                }}
                                            >
                                                <span className="text-[11px] md:text-xs font-medium text-slate-500 capitalize tracking-tight whitespace-nowrap">Mon solde{label} :</span>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-lg md:text-xl font-medium text-slate-900 leading-none">{balValue}</span>
                                                    {balValue !== "Illimité" && (
                                                        <span className="text-[10px] md:text-xs font-medium text-slate-500 lowercase">crédit{Number(balValue) > 1 ? 's' : ''}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </header>

                    {/* Catalog sections */}
                    {categoriesList.length > 0 ? (
                        <div className="mt-8 space-y-12">
                            {categoriesList.map(([category, categoryOffers]) => (
                                <section key={category} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <h2 
                                            className="text-sm font-bold uppercase tracking-normal"
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
                                        {categoryOffers.map((offer) => {
                                            const hasAlreadyPurchased = offer.is_unique && myOrders.some(order => order.offer_id === offer.id && order.status !== 'resiliee');
                                            const allowedActs = offer.allowed_activities || [];
                                            const hasActivityCredits = allowedActs.length > 0 &&
                                                (offer as any).activity_credits && 
                                                Object.keys((offer as any).activity_credits).some(k => 
                                                    allowedActs.includes(k) && 
                                                    (offer as any).activity_credits[k] !== undefined && 
                                                    (offer as any).activity_credits[k] !== null && 
                                                    (offer as any).activity_credits[k].toString().trim() !== ""
                                                );
                                            return (
                                                <div
                                                    key={offer.id}
                                                    onMouseEnter={() => setHoveredCardId(offer.id)}
                                                    onMouseLeave={() => setHoveredCardId(null)}
                                                    className="group relative bg-white rounded-2xl p-4 md:p-5 border transition-all duration-300 flex flex-col items-center justify-between overflow-hidden text-center"
                                                    style={{ 
                                                        boxShadow: `3px 4px 14px -2px ${(tenantSettings?.primary_color || '#2563eb')}25`,
                                                        borderColor: hoveredCardId === offer.id 
                                                            ? tenantSettings?.primary_color || '#2563eb' 
                                                            : `${(tenantSettings?.primary_color || '#2563eb')}25`,
                                                        backgroundImage: hoveredCardId === offer.id
                                                            ? `linear-gradient(to top left, ${(tenantSettings?.primary_color || '#2563eb')}40 0%, white 60%)`
                                                            : `linear-gradient(to top left, ${(tenantSettings?.primary_color || '#2563eb')}25 0%, white 70%)`,
                                                        backgroundColor: 'white'
                                                    }}
                                                >
                                                    <div className="relative z-10 space-y-6 w-full flex flex-col items-center flex-1">
                                                         <div className="space-y-3 w-full flex flex-col items-center">
                                                             <div className="w-full flex flex-col items-center gap-1.5">
                                                                 <h3 className="text-lg font-semibold text-slate-800 group-hover:text-slate-900 transition-colors capitalize tracking-tight">{offer.name}</h3>
                                                                 {(!offer.allowed_activities || offer.allowed_activities.length === 0) ? (
                                                                      <div className="w-full mx-auto flex flex-wrap justify-center gap-2 px-4">
                                                                          <span 
                                                                              className="px-3 py-1.5 border font-medium rounded-lg text-[13px] text-center capitalize shadow-sm transition-colors"
                                                                              style={{
                                                                                  backgroundColor: `${tenantSettings?.primary_color || '#2563eb'}10`,
                                                                                  borderColor: `${tenantSettings?.primary_color || '#2563eb'}25`,
                                                                                  color: tenantSettings?.primary_color || '#2563eb'
                                                                              }}
                                                                          >
                                                                              Toutes activités
                                                                          </span>
                                                                      </div>
                                                                 ) : hasActivityCredits ? (
                                                                      <div className="w-[90%] mx-auto space-y-2 mt-1 flex flex-col">
                                                                          {offer.allowed_activities.map((act) => {
                                                                              const packCredits = (offer as any).activity_credits?.[act];
                                                                              return (
                                                                                  <div 
                                                                                      key={act} 
                                                                                      className="flex justify-between text-left items-center gap-2 text-sm font-medium text-slate-800 w-full"
                                                                                  >
                                                                                      <span className="capitalize flex items-center gap-1.5 truncate">
                                                                                          <span 
                                                                                              className="text-xs font-bold" 
                                                                                              style={{ color: tenantSettings?.primary_color || '#2563eb' }}
                                                                                          >
                                                                                              ✓
                                                                                          </span>
                                                                                          <span className="text-slate-800 truncate">{act}</span>
                                                                                      </span>
                                                                                      {packCredits !== undefined && packCredits !== null && packCredits.toString().trim() !== "" && (
                                                                                          <span 
                                                                                              className="px-2 py-0.5 border font-medium rounded-full text-xs whitespace-nowrap flex items-center gap-0.5"
                                                                                              style={{
                                                                                                  backgroundColor: `${tenantSettings?.primary_color || '#2563eb'}15`,
                                                                                                  borderColor: `${tenantSettings?.primary_color || '#2563eb'}25`,
                                                                                                  color: tenantSettings?.primary_color || '#2563eb'
                                                                                              }}
                                                                                          >
                                                                                              {packCredits} cr.
                                                                                          </span>
                                                                                      )}
                                                                                  </div>
                                                                              );
                                                                          })}
                                                                      </div>
                                                                  ) : (
                                                                      <div className="w-full mx-auto flex flex-wrap justify-center gap-2 px-4">
                                                                          {offer.allowed_activities.map((act) => (
                                                                              <span 
                                                                                  key={act}
                                                                                  className="px-3 py-1.5 border font-medium rounded-lg text-[13px] text-center capitalize shadow-sm transition-colors"
                                                                                  style={{
                                                                                      backgroundColor: `${tenantSettings?.primary_color || '#2563eb'}10`,
                                                                                      borderColor: `${tenantSettings?.primary_color || '#2563eb'}25`,
                                                                                      color: tenantSettings?.primary_color || '#2563eb'
                                                                                  }}
                                                                              >
                                                                                  {act}
                                                                              </span>
                                                                          ))}
                                                                      </div>
                                                                  )}
                                                             </div>
                                                             {offer.description && (
                                                                 <div className="pt-2 border-t border-slate-50 w-full">
                                                                     <p className="text-slate-500 text-sm leading-relaxed italic">{offer.description}</p>
                                                                 </div>
                                                             )}
                                                             <div className="w-full flex items-center justify-center gap-4 mt-12 pt-2">
                                                              {/* Left Column: Credits and Validity */}
                                                              <div className="flex flex-col items-center gap-2 flex-1">
                                                                  <div className="flex items-center gap-1.5 text-slate-700">
                                                                      <div className="flex items-center justify-center text-lg">💎</div>
                                                                      {offer.is_unlimited ? (
                                                                          <span className="text-[15px] font-semibold text-slate-900 leading-none mt-0.5">Illimités</span>
                                                                      ) : (
                                                                          <div className="flex items-baseline gap-1 tracking-tight">
                                                                              <span className="text-3xl font-normal text-slate-900 tracking-tight leading-none">{Math.round(Number(offer.classes_included || 0))}</span>
                                                                              <span className="text-sm font-medium text-slate-700 leading-none">
                                                                                  crédit{Math.round(Number(offer.classes_included || 0)) > 1 ? 's' : ''}
                                                                              </span>
                                                                          </div>
                                                                      )}
                                                                  </div>

                                                                  <div className="flex items-center text-slate-500">
                                                                      <span className="text-xs font-medium leading-none">
                                                                          {offer.is_validity_unlimited 
                                                                              ? "Validité illimitée" 
                                                                              : (offer.validity_days || offer.deadline_date) 
                                                                                  ? (offer.deadline_date ? `Valable jusqu'au ${new Date(offer.deadline_date).toLocaleDateString()}` : `Valable ${offer.validity_unit === 'months' ? Math.round((offer.validity_days || 0) / 30) : offer.validity_days} ${offer.validity_unit === 'months' ? 'mois' : 'jours'}`)
                                                                                  : ""}
                                                                      </span>
                                                                  </div>
                                                              </div>

                                                              {/* Vertical Divider */}
                                                              <div className="w-px h-16 bg-slate-200"></div>

                                                              {/* Right Column: Pricing */}
                                                              <div className="flex flex-col items-center gap-1 flex-1">
                                                                  <div className="flex flex-col items-center justify-center">
                                                                      <div className="flex items-baseline justify-center gap-1 text-black">
                                                                          <span className="text-3xl font-normal tracking-tight leading-none">
                                                                              {offer.featured_pricing === "recurring" && offer.price_recurring_cents 
                                                                                  ? `${formatPrice(offer.price_recurring_cents)}`
                                                                                  : `${formatPrice(offer.price_lump_sum_cents)}`
                                                                              }
                                                                          </span>
                                                                          {offer.featured_pricing === "recurring" && offer.period !== 'seuil' && offer.period !== 'seuils' && (
                                                                              <span className="text-sm font-medium whitespace-nowrap">
                                                                                  /{offer.period && offer.period !== 'null' ? offer.period : 'mois'}
                                                                                  {offer.recurring_count ? (
                                                                                      <span className="tracking-tighter ml-1">x{offer.recurring_count}</span>
                                                                                  ) : null}
                                                                              </span>
                                                                          )}
                                                                      </div>
                                                                      {offer.featured_pricing === "recurring" && offer.recurring_count && (offer.period === 'seuil' || offer.period === 'seuils') && (
                                                                          <span className="text-[11px] font-medium tracking-tight text-slate-600 mt-1.5 text-center leading-tight -mx-1.5">
                                                                              à la commande, {offer.trigger_consumption_percent 
                                                                                  ? `puis à ${offer.trigger_consumption_percent.split(',').map((s: string) => s.trim()).reduce((acc: string, curr: string, i: number, arr: string[]) => acc + (i === 0 ? curr + '%' : i === arr.length - 1 ? ' et ' + curr + '%' : ', ' + curr + '%'), '')} de votre conso.`
                                                                                  : `puis selon votre conso.`}
                                                                          </span>
                                                                      )}
                                                                  </div>
                                                                  {/* Secondary line: Alternative pricing */}
                                                                  {(offer.featured_pricing === "recurring" ? offer.price_lump_sum_cents : offer.price_recurring_cents) ? (
                                                                      <p className="text-xs font-medium text-slate-500 leading-tight mt-1">
                                                                          {offer.featured_pricing === "recurring" ? (
                                                                              offer.price_lump_sum_cents ? `ou ${formatPrice(offer.price_lump_sum_cents)} en une fois` : ""
                                                                          ) : (
                                                                              offer.price_recurring_cents ? (
                                                                                  `ou ${formatPrice(offer.price_recurring_cents)}/${(offer.period && offer.period !== 'null') ? offer.period : 'mois'}${offer.recurring_count ? ` x ${offer.recurring_count}` : ''}`
                                                                              ) : ""
                                                                          )}
                                                                      </p>
                                                                  ) : null}
                                                              </div>
                                                          </div>
                                                          </div>
                                                      </div>
                                                     <div className="mt-8 relative z-10 w-full flex flex-col items-center shrink-0 gap-3">
                                                          {offer.is_unique && (
                                                              <div className="flex items-center gap-1.5 text-amber-600/70 justify-center w-full">
                                                                  <span className="text-sm">🔒</span>
                                                                  <span className="text-xs font-medium">Limité à 1 fois / personne</span>
                                                              </div>
                                                          )}
                                                          <div>
                                                          {hasAlreadyPurchased ? (
                                                              <span className="bg-slate-100 text-slate-500 font-medium text-[13px] px-4 py-1.5 rounded-sm">
                                                                  Déjà commandée
                                                              </span>
                                                          ) : (
                                                              <Link
                                                                  href={`/credits/checkout?id=${offer.id}`}
                                                                  className="bg-black text-white font-medium hover:bg-slate-800 transition-colors text-[13px] px-4 py-1.5 rounded-sm flex items-center gap-1.5 shadow-sm"
                                                              >
                                                                  Je choisis cette offre <span className="text-[10px] leading-none mt-px">→</span>
                                                              </Link>
                                                          )}
                                                          </div>
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
