"use client";

import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import { useEffect, useState } from "react";
import { api, User, Tenant, EventRegistration } from "@/lib/api";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { formatCredits } from "@/lib/formatters";

export default function MemberOrdersPage() {
    const params = useParams();
    const slug = params.slug;
    const [user, setUser] = useState<User | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'offers' | 'events'>('offers');
    
    // States for Info Modal
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch basic info first (User and Tenant)
                const [userData, tenantData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getTenantSettings()
                ]);
                setUser(userData);
                setTenant(tenantData);

                // Fetch orders and registrations in parallel and wait for both
                const [ordersResult, registrationsResult] = await Promise.allSettled([
                    api.getMyOrders(),
                    api.getMyEventRegistrations()
                ]);

                if (ordersResult.status === 'fulfilled') {
                    setOrders(ordersResult.value);
                } else {
                    console.error("Orders fetch failed:", ordersResult.reason);
                }

                if (registrationsResult.status === 'fulfilled') {
                    setRegistrations(registrationsResult.value);
                } else {
                    console.error("Registrations fetch failed:", registrationsResult.reason);
                }

            } catch (err) {
                console.error("Global dashboard fetch fail:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'en_attente': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'a_valider': return 'bg-slate-100 text-slate-600 border-slate-200';
            case 'paye': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'rembourse': return 'bg-slate-100 text-slate-500 border-slate-200';
            case 'echelonne': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'a_regulariser': return 'bg-rose-100 text-rose-700 border-rose-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'en_attente': return 'En attente';
            case 'a_valider': return 'À valider';
            case 'paye': return 'Payé';
            case 'rembourse': return 'Remboursé';
            case 'echelonne': return 'Échelonné';
            case 'a_regulariser': return 'À régulariser';
            default: return status;
        }
    };

    const formatPriceClean = (cents: number) => {
        const amount = cents / 100;
        return amount % 1 === 0 ? amount.toString() : amount.toFixed(2);
    };

    const formatPrice = (order: any) => {
        if (order.offer_featured_pricing === "recurring" && order.offer_price_recurring_cents) {
            const amount = formatPriceClean(order.offer_price_recurring_cents);
            const period = order.offer_period || "";
            const recurrence = order.offer_recurring_count ? ` x${order.offer_recurring_count}` : "";
            return `${amount}€/${period}${recurrence}`.trim();
        }
        if (order.offer_featured_pricing === "lump_sum" && order.offer_price_lump_sum_cents) {
            return `${formatPriceClean(order.offer_price_lump_sum_cents)}€`;
        }
        return `${formatPriceClean(order.price_cents)}€`;
    };

    const getGeneralStatusLabel = (status: string) => {
        switch (status) {
            case 'active': return 'Active';
            case 'termine': return 'Terminée';
            case 'expiree': return 'Expirée';
            case 'en_pause': return 'En pause';
            case 'annule': return 'Annulée';
            default: return status;
        }
    };

    const formatExternalUrl = (url: string) => {
        if (!url) return "";
        return /^https?:\/\//i.test(url) ? url : `https://${url}`;
    };

    const getEventRegistrationStatusStyle = (status: string) => {
        switch (status) {
            case 'pending_payment': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'confirmed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            case 'cancelled': return 'bg-slate-100 text-slate-500 border-slate-200';
            case 'event_cancelled': return 'bg-rose-100 text-rose-700 border-rose-200';
            case 'waiting_list': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'absent': return 'bg-rose-100 text-rose-700 border-rose-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const getEventRegistrationStatusLabel = (status: string) => {
        switch (status) {
            case 'pending_payment': return 'En attente';
            case 'confirmed': return 'Inscrit';
            case 'cancelled': return 'Annulé';
            case 'waiting_list': return 'Liste d\'attente';
            case 'absent': return 'Absent';
            case 'event_deleted': return 'Événement supprimé';
            case 'event_cancelled': return 'Évènement annulé';
            default: return status;
        }
    };

    const formatEventPrice = (reg: EventRegistration) => {
        if (reg.price_paid_cents === 0) return "Offert";
        return `${(reg.price_paid_cents / 100).toFixed(2)}€`;
    };

    const downloadReceipt = (order: any) => {
        const receiptNumber = order.invoice_number || `REC-${order.id.slice(-6).toUpperCase()}`;
        const receiptDate = new Date(order.created_at).toISOString().split("T")[0];
        
        const emitterName = tenant?.legal_name || tenant?.name || "Votre Établissement";
        const legalForm = tenant?.legal_form || "";
        const emitterAddress = tenant?.legal_address || "";
        const siret = tenant?.legal_siret ? `SIRET : ${tenant.legal_siret}` : "";
        
        const recipient = `${user?.first_name} ${user?.last_name}`;
        // Add address to recipient if available
        let recipientFull = recipient;
        if (user?.street || user?.zip_code || user?.city) {
            recipientFull += `\n${user?.street || ""}\n${user?.zip_code || ""} ${user?.city || ""}`.trim();
        }

        const description = `${order.offer_name} (${order.offer_code})`;
        
        // Calcul du montant total de l'offre
        const isRecurring = order.offer_featured_pricing === "recurring" && order.offer_price_recurring_cents && order.offer_recurring_count;
        const totalCents = isRecurring ? (order.offer_price_recurring_cents * order.offer_recurring_count) : order.price_cents;
        const amountTtc = (totalCents / 100).toFixed(2);
        
        // Calcul du montant payé et restant
        const paidCents = order.received_cents || (order.payment_status === "paye" ? totalCents : 0);
        const amountPaid = (paidCents / 100).toFixed(2);
        const remainingCents = Math.max(0, totalCents - paidCents);
        const amountRemaining = (remainingCents / 100).toFixed(2);

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Justificatif de paiement ${receiptNumber}</title>
<style>
    body{font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;max-width:800px;margin:40px auto;padding:40px;color:#334155;line-height:1.5;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:60px}
    .invoice-title{font-size:26px;font-weight:700;color:#0f172a;letter-spacing:-0.025em;margin:0}
    .emitter-info{font-size:13px;color:#64748b}
    .emitter-name{font-size:16px;font-weight:700;color:#0f172a;margin-bottom:4px}
    .details{display:flex;justify-content:space-between;margin-bottom:40px;gap:40px}
    .details-box{flex:1;padding:24px;background:#f8fafc;border-radius:16px}
    .details-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.05em;margin-bottom:8px}
    .details-value{font-size:14px;font-weight:500;white-space:pre-wrap}
    table{width:100%;border-collapse:collapse;margin:40px 0}
    th{padding:12px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc}
    td{padding:16px;font-size:14px;border-bottom:1px solid #f1f5f9}
    .totals{display:flex;flex-direction:column;align-items:flex-end;gap:8px;margin-top:20px}
    .total-row{display:flex;justify-content:space-between;width:240px;font-size:14px}
    .total-main{font-size:18px;font-weight:700;color:#0f172a;border-top:2px solid #e2e8f0;padding-top:12px;margin-top:8px}
    .acquitted-stamp{display:${order.payment_status === "paye" ? "inline-block" : "none"};margin-top:12px;padding:6px 12px;border:2px solid #10b981;color:#10b981;font-size:14px;font-weight:700;text-transform:uppercase;transform:rotate(-5deg);border-radius:8px;opacity:0.9;background:rgba(255,255,255,0.8)}
    .footer{margin-top:80px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;font-size:11px;color:#94a3b8}
    .disclaimer{margin-top:20px;padding:12px;background:#f1f5f9;border-radius:8px;font-size:11px;color:#64748b;text-align:center;font-weight:500}
    @media print{body{margin:0;padding:20px}.acquitted-stamp{opacity:1}}
</style></head><body>
    <div class="header">
        <div>
            <h1 class="invoice-title">JUSTIFICATIF DE PAIEMENT</h1>
            <div style="margin-top:8px;font-size:14px;font-weight:600;color:#64748b">N° ${receiptNumber}</div>
        </div>
        <div class="emitter-info" style="text-align:right">
            <div class="emitter-name">${emitterName}</div>
            ${legalForm ? `<div>${legalForm}</div>` : ""}
            ${emitterAddress ? `<div style="white-space:pre-wrap">${emitterAddress}</div>` : ""}
            <div>${siret}</div>
        </div>
    </div>

    <div class="details">
        <div class="details-box">
            <div class="details-label">Adhérent</div>
            <div class="details-value">${recipientFull}</div>
        </div>
        <div class="details-box" style="max-width:200px">
            <div class="details-label">Date d'émission</div>
            <div class="details-value">${new Date(receiptDate).toLocaleDateString("fr-FR")}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width:70%">Description</th>
                <th style="text-align:right">Total TTC</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <div style="font-weight:600;color:#0f172a">${description}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:4px">Période : ${order.start_date} au ${order.end_date || "Illimité"}</div>
                </td>
                <td style="text-align:right;font-weight:700;color:#0f172a">${amountTtc} €</td>
            </tr>
        </tbody>
    </table>

    <div class="totals">
        <div class="total-row"><span>Montant total de l'offre</span><span>${amountTtc} €</span></div>
        <div class="total-row"><span>Règlements perçus</span><span>${amountPaid} €</span></div>
        <div class="total-row"><span>Reste à payer</span><span>${amountRemaining} €</span></div>
        <div class="total-row total-main"><span>Total payé</span><span>${amountPaid} €</span></div>
        <div class="acquitted-stamp">Réglé le ${new Date(receiptDate).toLocaleDateString("fr-FR")}</div>
    </div>

    <div class="disclaimer">
        Ce document est un justificatif de paiement à usage interne et ne constitue pas une facture fiscale.
    </div>

    <div class="footer">
        <div>${emitterName} ${legalForm ? " - " + legalForm : ""}</div>
        <div>${emitterAddress.replace(/\n/g, ", ")}</div>
        <div style="margin-top:12px;opacity:0.6">Document généré par Rezea</div>
    </div>
</body></html>`;

        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `justificatif_${receiptNumber}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const isAdminMode = false;

    if (loading) {
        return (
            <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-6">
                <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-500 font-medium text-xs tracking-widest animate-pulse uppercase">Chargement de vos commandes...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 overflow-x-hidden pb-20 md:pb-0" style={{ backgroundColor: tenant?.background_color ? `${tenant.background_color}10` : undefined }}>
            {isAdminMode && <Sidebar user={user} tenant={tenant} />}
            
            <main className={`flex-1 px-5 pb-5 md:p-12 pt-4 md:pt-12`}>
                <div className="max-w-4xl mx-auto">
                    <header className="flex items-center justify-between pb-3 border-b border-slate-200 mb-6 gap-4">
                        <h1 className="text-lg md:text-xl font-medium text-slate-900 tracking-tight flex items-center gap-2">
                            <span className="text-xl md:text-2xl">📋</span> Mes commandes
                        </h1>
                        {!isAdminMode && (
                            <Link href="/home" className="flex items-center gap-1 text-[10px] md:text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group border border-slate-200 rounded-full px-2.5 py-1 hover:border-slate-300">
                                <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>Retour</span>
                            </Link>
                        )}
                    </header>

                    {/* Tab Switcher */}
                    <div className="flex justify-center mb-8">
                        <div className="flex gap-2 p-1.5 bg-white border border-slate-200/80 rounded-2xl w-fit">
                            <button 
                                onClick={() => setActiveTab('offers')}
                                className={`px-6 py-2.5 rounded-xl text-xs font-medium transition-all duration-300 ${
                                    activeTab === 'offers' 
                                        ? 'text-white shadow-lg' 
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                                }`}
                                style={activeTab === 'offers' ? {
                                    background: `linear-gradient(135deg, ${tenant?.primary_color || '#2563eb'}CC, ${tenant?.primary_color || '#2563eb'}EE)`,
                                    boxShadow: `0 4px 12px ${(tenant?.primary_color || '#2563eb')}40`
                                } : {}}
                            >
                                Offres et forfaits
                            </button>
                            <button 
                                onClick={() => setActiveTab('events')}
                                className={`px-6 py-2.5 rounded-xl text-xs font-medium transition-all duration-300 ${
                                    activeTab === 'events' 
                                        ? 'text-white shadow-lg' 
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                                }`}
                                style={activeTab === 'events' ? {
                                    background: `linear-gradient(135deg, ${tenant?.primary_color || '#2563eb'}CC, ${tenant?.primary_color || '#2563eb'}EE)`,
                                    boxShadow: `0 4px 12px ${(tenant?.primary_color || '#2563eb')}40`
                                } : {}}
                            >
                                Événements
                            </button>
                        </div>
                    </div>

                    {(activeTab === 'offers' ? orders.length : registrations.length) === 0 ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-10 text-center space-y-3">
                            <div className="text-4xl">{activeTab === 'offers' ? '🛍️' : '🎫'}</div>
                            <h2 className="text-base font-semibold text-slate-900">
                                {activeTab === 'offers' ? "Vous n'avez pas encore de commande" : "Vous n'êtes inscrit à aucun événement"}
                            </h2>
                            <p className="text-xs text-slate-500 max-w-xs mx-auto">
                                {activeTab === 'offers' 
                                    ? "Parcourez notre boutique pour découvrir nos offres et forfaits." 
                                    : "Consultez notre planning pour découvrir les événements à venir."}
                            </p>
                            {activeTab === 'offers' && (
                                <Link href="/credits" className="inline-block mt-2 px-6 py-2 bg-slate-900 text-white text-xs font-medium rounded-xl hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                                    Aller à la Boutique
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {activeTab === 'offers' ? (
                                orders.map((order) => (
                                    <div 
                                        key={order.id} 
                                        onMouseEnter={() => setHoveredCardId(order.id)}
                                        onMouseLeave={() => setHoveredCardId(null)}
                                        className="bg-white p-5 md:p-6 rounded-3xl border transition-all duration-300 relative overflow-hidden group"
                                        style={{ 
                                            boxShadow: `2px 4px 12px -2px ${(tenant?.primary_color || '#2563eb')}25`,
                                            borderColor: hoveredCardId === order.id 
                                                ? tenant?.primary_color || '#2563eb' 
                                                : `${(tenant?.primary_color || '#2563eb')}40`
                                        }}
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-bl-full -mr-16 -mt-16 opacity-40 pointer-events-none" />
                                        
                                        <div className="flex flex-col gap-4 relative z-10">
                                            {/* Top Section: Title & Metadata */}
                                            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                                <div className="flex flex-col min-w-0 flex-1 w-full sm:w-auto">
                                                    <div className="flex flex-col items-start gap-1 mb-4 w-full min-w-0">
                                                        <h3 className="text-lg md:text-xl font-semibold text-slate-900 capitalize tracking-tight truncate w-full">{order.offer_name}</h3>
                                                        {(() => {
                                                             return (!order.allowed_activities || order.allowed_activities.length === 0) ? (
                                                                 <div className="w-full mt-1.5 flex flex-wrap gap-1.5">
                                                                     <span 
                                                                         className="px-2 py-1 border font-medium rounded-lg text-[10px] text-center capitalize shadow-sm transition-colors text-slate-800"
                                                                         style={{
                                                                             backgroundColor: `${tenant?.primary_color || '#2563eb'}10`,
                                                                             borderColor: `${tenant?.primary_color || '#2563eb'}25`
                                                                         }}
                                                                     >
                                                                         Toutes activités
                                                                     </span>
                                                                 </div>
                                                             ) : (
                                                                 <div className="w-full mt-1.5 flex flex-wrap gap-1.5">
                                                                     {order.allowed_activities.map((act: string) => (
                                                                         <span 
                                                                             key={act}
                                                                             className="px-2 py-1 border font-medium rounded-lg text-[10px] text-center capitalize shadow-sm transition-colors text-slate-800"
                                                                             style={{
                                                                                 backgroundColor: `${tenant?.primary_color || '#2563eb'}10`,
                                                                                 borderColor: `${tenant?.primary_color || '#2563eb'}25`
                                                                             }}
                                                                         >
                                                                             {act}
                                                                         </span>
                                                                     ))}
                                                                 </div>
                                                             );
                                                         })()}
                                                    </div>
                                                    <div className="flex flex-col items-start gap-2">
                                                        <p className="text-slate-600 text-xs font-medium tracking-tight whitespace-nowrap">
                                                            Commandée le {new Date(order.created_at).toLocaleDateString("fr-FR")}
                                                        </p>
                                                        <button 
                                                            onClick={() => { setSelectedOrder(order); setShowInfoModal(true); }}
                                                            className="text-[11px] font-bold flex items-center gap-1 transition-all hover:opacity-80 group/info"
                                                            style={{ color: tenant?.primary_color || '#2563eb' }}
                                                        >
                                                            <span className="hover:underline">Plus d'infos</span>
                                                            <span className="transition-transform group-hover/info:translate-x-0.5">→</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex flex-col items-start sm:items-end gap-3 w-full sm:w-auto">
                                                    <div className="flex items-center gap-2 px-1">
                                                        <span className="text-sm">⌛</span>
                                                        <p className="text-xs text-slate-600 font-medium tracking-tight">Fin de validité :</p>
                                                        <p className={`text-sm font-semibold tracking-tight ${order.is_validity_unlimited ? 'text-emerald-600' : 'text-slate-900'}`}>
                                                            {order.is_validity_unlimited ? 'Illimitée' : (order.end_date ? new Date(order.end_date).toLocaleDateString("fr-FR") : "N/A")}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 px-1">
                                                        <span className="text-sm">💎</span>
                                                        <p className="text-xs text-slate-600 font-medium tracking-tight">
                                                            {order.allowed_activities && order.allowed_activities.length > 1 ? "Solde total de crédits :" : "Solde de crédit :"}
                                                        </p>
                                                        <p className="text-sm font-semibold tracking-tight text-slate-900">
                                                            {order.is_unlimited ? 'Illimité' : `${formatCredits(order.balance)}`}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end">
                                                        <span className="px-3 py-1.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[10px] font-semibold">
                                                            <span className="opacity-60 mr-1">Statut :</span>
                                                            {getGeneralStatusLabel(order.status)}
                                                        </span>
                                                        <span className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border ${getStatusStyle(order.payment_status)}`}>
                                                            <span className="opacity-60 mr-1">Paiement :</span>
                                                            {getStatusLabel(order.payment_status)}
                                                        </span>
                                                        <button 
                                                            onClick={() => downloadReceipt(order)}
                                                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-all hover:scale-110 ml-1 text-lg flex items-center justify-center"
                                                            title="Télécharger le justificatif de paiement"
                                                        >
                                                            🧾
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Divider, Note & Actions */}
                                            {(order.user_note || (order.payment_status?.toLowerCase().includes('attente') && tenant?.payment_redirect_link)) && (
                                                <div className="pt-4 border-t border-dashed border-slate-100 flex flex-col gap-4">
                                                    {order.user_note && (
                                                        <div className="flex items-start gap-2 px-1">
                                                            <span className="text-sm mt-0.5">💬</span>
                                                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                                                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold whitespace-nowrap">Note d&apos;information :</p>
                                                                <p className="text-xs text-slate-700 font-medium italic leading-relaxed">{order.user_note}</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Buttons Row */}
                                                    <div className="flex flex-col md:flex-row justify-center md:justify-end items-center gap-3">
                                                        {(order.payment_status?.toLowerCase().includes('attente')) && tenant?.payment_redirect_link && (
                                                            <a 
                                                                href={formatExternalUrl(tenant.payment_redirect_link)}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="w-full md:w-auto px-6 py-2.5 bg-slate-900 text-white text-[11px] font-medium rounded-xl transition-all shadow-lg flex items-center justify-center gap-4 group/btn active:scale-95"
                                                            >
                                                                <span>💳</span>
                                                                <span>Payer ma commande</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                registrations.map((reg) => (
                                    <div 
                                        key={reg.id} 
                                        onMouseEnter={() => setHoveredCardId(reg.id)}
                                        onMouseLeave={() => setHoveredCardId(null)}
                                        className="bg-white p-5 md:p-6 rounded-3xl border transition-all duration-300 relative overflow-hidden group"
                                        style={{ 
                                            boxShadow: `2px 4px 12px -2px ${(tenant?.primary_color || '#2563eb')}25`,
                                            borderColor: hoveredCardId === reg.id 
                                                ? tenant?.primary_color || '#2563eb' 
                                                : `${(tenant?.primary_color || '#2563eb')}40`
                                        }}
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-bl-full -mr-16 -mt-16 opacity-40 pointer-events-none" />
                                        
                                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 relative z-10">
                                            <div className="flex flex-col min-w-0 flex-1 w-full sm:w-auto">
                                                {(reg as any).event_parent_title && (
                                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.2em] mb-1 flex items-center gap-1">
                                                        <span>✨</span>
                                                        <span>{(reg as any).event_parent_title}</span>
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <h3 className="text-lg md:text-xl font-semibold text-slate-900 truncate pr-2 capitalize tracking-tight">{reg.event_title}</h3>
                                                </div>
                                                
                                                {reg.instructor_name && (
                                                    <p className="text-[13px] font-medium mb-1" style={{ color: tenant?.primary_color }}>
                                                        par {reg.instructor_name}
                                                    </p>
                                                )}

                                                <div className="flex items-center justify-between w-full gap-4 mt-1">
                                                    <p className="text-slate-400 text-xs font-medium tracking-tight">
                                                        Inscrit le {new Date(reg.created_at).toLocaleDateString("fr-FR")}
                                                    </p>
                                                    {/* Price only on mobile */}
                                                    <div className="flex md:hidden items-center gap-1.5 text-slate-500">
                                                        <span className="text-xs">🏷️</span>
                                                        <span className="text-[13px] font-medium">{formatEventPrice(reg)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-col items-end gap-2 relative z-10 pt-1">
                                                {/* Price only on PC */}
                                                <div className="hidden md:flex items-center gap-1.5 mb-1 text-slate-900 font-semibold text-base">
                                                    <span className="text-slate-400 text-sm">🏷️</span>
                                                    <span>{formatEventPrice(reg)}</span>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                                    <span className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border ${getStatusStyle(reg.payment_status || 'en_attente')}`}>
                                                        <span className="opacity-60 mr-1">Paiement :</span>
                                                        {getStatusLabel(reg.payment_status || 'en_attente')}
                                                    </span>
                                                    <span className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border ${getEventRegistrationStatusStyle(reg.status)}`}>
                                                        <span className="opacity-60 mr-1">Statut :</span>
                                                        {getEventRegistrationStatusLabel(reg.status)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Panel & Validity */}
                                        <div className="mt-4 pt-4 border-t border-dashed border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
                                            <div className="flex items-center gap-6">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 flex items-center justify-center text-lg">📅</div>
                                                    <p className="text-xs font-medium text-slate-600">
                                                        {reg.event_date ? new Date(reg.event_date).toLocaleDateString("fr-FR") : ""}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 flex items-center justify-center text-lg">🕒</div>
                                                    <p className="text-xs font-medium text-slate-600">
                                                        {reg.event_time}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-center gap-3 w-full">
                                                {/* Bouton Payer */}
                                                {(reg.payment_status?.toLowerCase().includes('attente') || reg.status?.toLowerCase().includes('payment')) && tenant?.payment_redirect_link && (
                                                    <a 
                                                        href={formatExternalUrl(tenant.payment_redirect_link)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-6 py-3 bg-slate-900 text-white text-[11px] font-medium rounded-xl transition-all shadow-lg flex items-center justify-center gap-4 group/btn active:scale-95 mx-auto"
                                                    >
                                                        <span>💳</span>
                                                        <span>Payer ma commande</span>
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Detail Modal */}
            {showInfoModal && selectedOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
                   <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-white animate-in zoom-in duration-300 p-8 md:p-10 relative">
                      {/* Decorative elements */}
                      <div 
                        className="absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full -mr-16 -mt-16"
                        style={{ backgroundColor: tenant?.primary_color || '#2563eb' }}
                      />
                      
                      <div className="text-center relative z-10">
                         <h2 className="text-xl md:text-2xl font-semibold text-slate-900 mb-2 tracking-tight capitalize">
                             {selectedOrder.offer_snap_name || selectedOrder.offer_name}
                         </h2>
                         <p className="text-xs text-slate-600 font-medium leading-relaxed mb-8 max-w-[280px] mx-auto">
                             Données contractuelles de votre commande à la date de l'achat, avant toute modification ultérieure.
                         </p>
                         
                         <div className="relative mb-10 text-left max-w-[260px] mx-auto">
                             {/* The "Accolade Rose" (Pink Brace) */}
                             <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-400 rounded-full opacity-60" />
                             
                             <div className="pl-6 space-y-5">
                                 <div className="flex items-center gap-3">
                                     <span className="text-lg w-6 text-center">🏷️</span>
                                     <div className="flex flex-col">
                                         <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium leading-none mb-1">Tarif d'achat</span>
                                         <p className="text-sm font-medium text-slate-900 leading-none">
                                            {formatPrice(selectedOrder)}
                                            {selectedOrder.payment_status === 'echelonne' && !formatPrice(selectedOrder).includes('x') && selectedOrder.installments?.length > 0 && ` (x${selectedOrder.installments.length})`}
                                         </p>
                                     </div>
                                 </div>
                                 
                                 <div className="flex items-center gap-3">
                                     <span className="text-lg w-6 text-center">💎</span>
                                     <div className="flex flex-col">
                                         <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium leading-none mb-1">Crédits inclus</span>
                                         <p className="text-sm font-medium text-slate-900 leading-none">
                                            {selectedOrder.is_unlimited ? 'Illimité' : `${formatCredits(selectedOrder.credits_total)} crédits`}
                                         </p>
                                     </div>
                                 </div>
                                 
                                 <div className="flex items-center gap-3">
                                     <span className="text-lg w-6 text-center">📅</span>
                                     <div className="flex flex-col">
                                         <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium leading-none mb-1">Date de début</span>
                                         <p className="text-sm font-medium text-slate-900 leading-none">
                                             {selectedOrder.start_date ? new Date(selectedOrder.start_date).toLocaleDateString("fr-FR") : "N/A"}
                                         </p>
                                     </div>
                                 </div>

                                 <div className="flex items-center gap-3">
                                     <span className="text-lg w-6 text-center">🕒</span>
                                     <div className="flex flex-col">
                                         <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium leading-none mb-1">Validité initiale</span>
                                         <p className="text-sm font-medium text-slate-900 leading-none">
                                            {selectedOrder.offer_snap_is_validity_unlimited ? 'Illimitée' : 
                                             (selectedOrder.offer_snap_validity_days ? 
                                              `${selectedOrder.offer_snap_validity_unit === 'months' ? Math.round(selectedOrder.offer_snap_validity_days / 30) : selectedOrder.offer_snap_validity_unit === 'weeks' ? Math.round(selectedOrder.offer_snap_validity_days / 7) : selectedOrder.offer_snap_validity_days} ${selectedOrder.offer_snap_validity_unit === 'months' ? 'mois' : selectedOrder.offer_snap_validity_unit === 'weeks' ? 'semaines' : 'jours'}` : 
                                              (selectedOrder.is_validity_unlimited ? 'Illimitée' : 
                                               (selectedOrder.end_date ? new Date(selectedOrder.end_date).toLocaleDateString("fr-FR") : "N/A")))}
                                         </p>
                                     </div>
                                 </div>

                                 {selectedOrder.allowed_activities && selectedOrder.allowed_activities.length > 0 && (
                                     <div className="flex items-start gap-3">
                                         <span className="text-lg w-6 text-center mt-0.5">🎯</span>
                                         <div className="flex flex-col gap-1.5 w-full">
                                             <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium leading-none mb-1">Activités concernées</span>
                                             {(() => {
                                                 const hasActivityCredits = selectedOrder.allowed_activities && selectedOrder.allowed_activities.length > 0 &&
                                                     (selectedOrder.offer_snap_activity_credits || selectedOrder.activity_credits) &&
                                                     Object.keys(selectedOrder.offer_snap_activity_credits || selectedOrder.activity_credits || {}).some(k => 
                                                         selectedOrder.allowed_activities.includes(k) && 
                                                         ((selectedOrder.offer_snap_activity_credits?.[k] !== undefined && selectedOrder.offer_snap_activity_credits?.[k] !== null && selectedOrder.offer_snap_activity_credits?.[k].toString().trim() !== "") || 
                                                          (selectedOrder.activity_credits?.[k] !== undefined && selectedOrder.activity_credits?.[k] !== null && selectedOrder.activity_credits?.[k].toString().trim() !== ""))
                                                     );
                                                 return (
                                                     <div className="w-full space-y-1.5 mt-1 flex flex-col">
                                                         {selectedOrder.allowed_activities.map((act: string) => {
                                                             const packCredits = selectedOrder.offer_snap_activity_credits?.[act] ?? selectedOrder.activity_credits?.[act];
                                                             return (
                                                                 <div 
                                                                     key={act} 
                                                                     className={`flex ${hasActivityCredits ? 'justify-between text-left' : 'justify-center text-center'} items-center gap-2 text-[11px] font-semibold w-full`}
                                                                 >
                                                                     <span className="capitalize flex items-center gap-1.5 truncate">
                                                                         <span 
                                                                             className="text-[9px] font-bold" 
                                                                             style={{ color: tenant?.primary_color || '#2563eb' }}
                                                                         >
                                                                             ✓
                                                                         </span>
                                                                         <span className="text-slate-800 truncate">{act}</span>
                                                                     </span>
                                                                     {packCredits !== undefined && packCredits !== null && packCredits.toString().trim() !== "" && (
                                                                         <span 
                                                                             className="px-1.5 py-0.5 border font-bold rounded-full text-[9px] whitespace-nowrap"
                                                                             style={{
                                                                                 backgroundColor: `${tenant?.primary_color || '#2563eb'}15`,
                                                                                 borderColor: `${tenant?.primary_color || '#2563eb'}25`,
                                                                                 color: tenant?.primary_color || '#2563eb'
                                                                             }}
                                                                         >
                                                                             {packCredits} cr.
                                                                         </span>
                                                                     )}
                                                                 </div>
                                                             );
                                                         })}
                                                     </div>
                                                 );
                                             })()}
                                         </div>
                                     </div>
                                 )}

                                 {(selectedOrder.offer_snap_description || selectedOrder.offer_description) && (
                                     <div className="pt-2 border-t border-slate-100 flex items-start gap-3">
                                         <span className="text-xs mt-0.5">📝</span>
                                         <p className="text-slate-600 text-[11px] font-medium leading-relaxed">
                                             {selectedOrder.offer_snap_description || selectedOrder.offer_description}
                                         </p>
                                     </div>
                                 )}
                             </div>
                         </div>
                         
                         <button 
                            onClick={() => setShowInfoModal(false)}
                            className="px-8 py-3 bg-slate-900 text-white text-xs font-medium rounded-xl transition-all shadow-lg active:scale-95 mx-auto"
                         >
                            Fermer
                         </button>
                      </div>
                   </div>
                </div>
            )}

            <BottomNav userRole={user?.role} />

            <style jsx global>{`
                @supports (-webkit-touch-callout: none) {
                    .safe-top { padding-top: env(safe-area-inset-top); }
                    .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
                }
            `}</style>
        </div>
    );
}
