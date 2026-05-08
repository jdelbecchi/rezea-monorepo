"use client";

import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import { useEffect, useState } from "react";
import { api, User, Tenant, EventRegistration } from "@/lib/api";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

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

    const formatPrice = (order: any) => {
        if (order.offer_featured_pricing === "recurring" && order.offer_price_recurring_cents) {
            const amount = (order.offer_price_recurring_cents / 100).toFixed(2);
            const period = order.offer_period || "";
            const recurrence = order.offer_recurring_count ? ` x${order.offer_recurring_count}` : "";
            return `${amount}€/${period}${recurrence}`.trim();
        }
        if (order.offer_featured_pricing === "lump_sum" && order.offer_price_lump_sum_cents) {
            return `${(order.offer_price_lump_sum_cents / 100).toFixed(2)}€`;
        }
        return `${(order.price_cents / 100).toFixed(2)}€`;
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

    const getEventRegistrationStatusStyle = (status: string) => {
        switch (status) {
            case 'pending_payment': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'confirmed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            case 'cancelled': return 'bg-slate-100 text-slate-500 border-slate-200';
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
            default: return status;
        }
    };

    const formatEventPrice = (reg: EventRegistration) => {
        if (reg.price_paid_cents === 0) return "Offert";
        return `${(reg.price_paid_cents / 100).toFixed(2)}€`;
    };

    const downloadInvoice = (order: any) => {
        const invoiceNumber = order.invoice_number || `FAC-${order.id.slice(-6).toUpperCase()}`;
        const invoiceDate = new Date(order.created_at).toISOString().split("T")[0];
        
        const emitterName = tenant?.legal_name || tenant?.name || "Votre Établissement";
        const legalForm = tenant?.legal_form || "";
        const emitterAddress = tenant?.legal_address || "";
        const siret = tenant?.legal_siret ? `SIRET : ${tenant.legal_siret}` : "";
        const vatNumber = tenant?.legal_vat_number ? `TVA : ${tenant.legal_vat_number}` : "";
        const vatMention = tenant?.legal_vat_mention || "";
        
        const recipient = `${user?.first_name} ${user?.last_name}`;
        // Add address to recipient if available
        let recipientFull = recipient;
        if (user?.street || user?.zip_code || user?.city) {
            recipientFull += `\n${user?.street || ""}\n${user?.zip_code || ""} ${user?.city || ""}`.trim();
        }

        const description = `${order.offer_name} (${order.offer_code})`;
        const amountTtc = (order.price_cents / 100).toFixed(2);

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture ${invoiceNumber}</title>
<style>
    body{font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;max-width:800px;margin:40px auto;padding:40px;color:#334155;line-height:1.5;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:60px}
    .invoice-title{font-size:32px;font-weight:700;color:#0f172a;letter-spacing:-0.025em;margin:0}
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
    .total-row{display:flex;justify-content:space-between;width:200px;font-size:14px}
    .total-main{font-size:20px;font-weight:700;color:#0f172a;border-top:2px solid #e2e8f0;padding-top:12px;margin-top:8px}
    .vat-mention-inline{font-size:11px;color:#64748b;margin-bottom:4px;text-align:right}
    .acquitted-stamp{display:${order.payment_status === "paye" ? "inline-block" : "none"};margin-top:12px;padding:6px 12px;border:2px solid #10b981;color:#10b981;font-size:14px;font-weight:700;text-transform:uppercase;transform:rotate(-5deg);border-radius:8px;opacity:0.9;background:rgba(255,255,255,0.8)}
    .footer{margin-top:80px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;font-size:11px;color:#94a3b8}
    @media print{body{margin:0;padding:20px}.acquitted-stamp{opacity:1}}
</style></head><body>
    <div class="header">
        <div>
            <h1 class="invoice-title">FACTURE</h1>
            <div style="margin-top:8px;font-size:14px;font-weight:600;color:#64748b">N° ${invoiceNumber}</div>
        </div>
        <div class="emitter-info" style="text-align:right">
            <div class="emitter-name">${emitterName}</div>
            ${legalForm ? `<div>${legalForm}</div>` : ""}
            ${emitterAddress ? `<div style="white-space:pre-wrap">${emitterAddress}</div>` : ""}
            <div>${siret}</div>
            ${vatNumber ? `<div>${vatNumber}</div>` : ""}
        </div>
    </div>

    <div class="details">
        <div class="details-box">
            <div class="details-label">Destinataire</div>
            <div class="details-value">${recipientFull}</div>
        </div>
        <div class="details-box" style="max-width:200px">
            <div class="details-label">Date d'émission</div>
            <div class="details-value">${new Date(invoiceDate).toLocaleDateString("fr-FR")}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width:60%">Description</th>
                <th style="text-align:right">Total HT</th>
                <th style="text-align:right">Total TTC</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <div style="font-weight:600;color:#0f172a">${description}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:4px">Période : ${order.start_date} au ${order.end_date || "Illimité"}</div>
                </td>
                <td style="text-align:right">-</td>
                <td style="text-align:right;font-weight:700;color:#0f172a">${amountTtc} €</td>
            </tr>
        </tbody>
    </table>

    <div class="totals">
        <div class="total-row total-main"><span>Total TTC</span><span>${amountTtc} €</span></div>
        <div class="acquitted-stamp">Acquittée le ${new Date(invoiceDate).toLocaleDateString("fr-FR")}</div>
    </div>

    <div class="footer">
        <div>${emitterName} ${legalForm ? " - " + legalForm : ""}</div>
        <div>${emitterAddress.replace(/\n/g, ", ")}</div>
        ${vatMention ? `<div style="margin-top:8px;font-style:italic;font-size:11px;opacity:0.9">${vatMention}</div>` : ""}
        <div style="margin-top:12px;opacity:0.6">Document généré par Rezea</div>
    </div>
</body></html>`;

        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `facture_${invoiceNumber}.html`;
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
        <div className="flex flex-col md:flex-row min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden">
            {isAdminMode && <Sidebar user={user} tenant={tenant} />}
            
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

            <main className={`flex-1 px-5 pb-5 md:p-12 ${!isAdminMode ? 'pt-16 md:pt-14' : ''}`}>
                <div className="max-w-4xl mx-auto">
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
                    <header className="px-1 space-y-1 mb-8">
                        <h1 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight flex items-center gap-2">
                            <span className="text-2xl md:text-3xl">📋</span> Mes commandes
                        </h1>
                        <p className="text-slate-500 font-medium text-[11px] md:text-xs">Historique de vos achats</p>
                    </header>

                    {/* Tab Switcher */}
                    <div className="flex justify-center mb-8">
                        <div className="flex gap-2 p-1.5 bg-slate-100/60 rounded-2xl w-fit">
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
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 md:p-16 text-center space-y-4">
                            <div className="text-6xl">{activeTab === 'offers' ? '🛍️' : '🎫'}</div>
                            <h2 className="text-2xl font-semibold text-slate-900">
                                {activeTab === 'offers' ? "Vous n'avez pas encore de commande" : "Vous n'êtes inscrit à aucun événement"}
                            </h2>
                            <p className="text-slate-500 max-w-xs mx-auto">
                                {activeTab === 'offers' 
                                    ? "Parcourez notre boutique pour découvrir nos offres et forfaits." 
                                    : "Consultez notre planning pour découvrir les événements à venir."}
                            </p>
                            <Link href={activeTab === 'offers' ? `/${slug}/credits` : `/${slug}/planning`} className="inline-block mt-4 px-8 py-3 bg-blue-600 text-white font-medium rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                                {activeTab === 'offers' ? "Aller à la Boutique" : "Voir le Planning"}
                            </Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {activeTab === 'offers' ? (
                                orders.map((order) => (
                                    <div 
                                        key={order.id} 
                                        className="bg-white p-5 md:p-6 rounded-3xl border transition-all duration-300 hover:bg-slate-50 hover:border-slate-400 relative overflow-hidden group"
                                        style={{ 
                                            boxShadow: `4px 6px 18px -2px ${(tenant?.primary_color || '#2563eb')}45`,
                                            borderColor: `${(tenant?.primary_color || '#2563eb')}20`
                                        }}
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-bl-full -mr-16 -mt-16 opacity-40 pointer-events-none" />
                                        
                                        <div className="flex flex-col gap-4 relative z-10">
                                            {/* Top Section: Title & Metadata */}
                                            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                                <div className="flex flex-col min-w-0 flex-1 w-full sm:w-auto">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h3 className="text-lg md:text-xl font-semibold text-slate-900 truncate pr-2 capitalize tracking-tight">{order.offer_name}</h3>
                                                    </div>
                                                    <div className="flex items-center justify-between sm:justify-start gap-4">
                                                        <p className="text-slate-600 text-xs font-medium tracking-tight whitespace-nowrap">
                                                            Commandée le {new Date(order.created_at).toLocaleDateString("fr-FR")}
                                                        </p>
                                                        <button 
                                                            onClick={() => { setSelectedOrder(order); setShowInfoModal(true); }}
                                                            className="px-3 py-1 bg-slate-200/50 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-all text-[10px] font-medium flex items-center gap-1"
                                                        >
                                                            <span>+ d'infos</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex flex-col items-start sm:items-end gap-3 w-full sm:w-auto">
                                                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end">
                                                        <span className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border ${getStatusStyle(order.payment_status)}`}>
                                                            <span className="opacity-60 mr-1">Paiement :</span>
                                                            {getStatusLabel(order.payment_status)}
                                                        </span>
                                                        <span className="px-3 py-1.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[10px] font-semibold">
                                                            <span className="opacity-60 mr-1">Statut :</span>
                                                            {getGeneralStatusLabel(order.status)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 px-1">
                                                        <span className="text-sm">⌛</span>
                                                        <p className="text-xs text-slate-600 font-medium tracking-tight">Fin de validité :</p>
                                                        <p className={`text-sm font-bold tracking-tight ${order.is_validity_unlimited ? 'text-emerald-600' : 'text-slate-900'}`}>
                                                            {order.is_validity_unlimited ? 'Illimitée' : (order.end_date ? new Date(order.end_date).toLocaleDateString("fr-FR") : "N/A")}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Divider, Note & Actions */}
                                            {(order.user_note || (order.payment_status?.toLowerCase().includes('attente') && tenant?.payment_redirect_link) || order.invoice_number) && (
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
                                                    {((order.payment_status?.toLowerCase().includes('attente') && tenant?.payment_redirect_link) || order.invoice_number) && (
                                                        <div className="flex flex-col md:flex-row justify-center md:justify-end items-center gap-3">
                                                            {(order.payment_status?.toLowerCase().includes('attente')) && tenant?.payment_redirect_link && (
                                                                <a 
                                                                    href={tenant.payment_redirect_link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="w-full md:w-auto px-6 py-2.5 bg-slate-900 text-white text-[11px] font-medium rounded-xl transition-all shadow-lg flex items-center justify-center gap-4 group/btn active:scale-95"
                                                                >
                                                                    <span>💳</span>
                                                                    <span>Payer ma commande</span>
                                                                </a>
                                                            )}
                                                            {order.invoice_number && (
                                                                <button 
                                                                    onClick={() => downloadInvoice(order)}
                                                                    className="w-full md:w-auto px-4 py-2 bg-slate-100 text-slate-600 text-[10px] font-medium rounded-lg hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                                                >
                                                                    🧾 Facture
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                registrations.map((reg) => (
                                    <div 
                                        key={reg.id} 
                                        className="bg-white p-5 md:p-6 rounded-3xl border transition-all duration-300 hover:bg-slate-50 hover:border-slate-400 relative overflow-hidden group"
                                        style={{ 
                                            boxShadow: `4px 6px 18px -2px ${(tenant?.primary_color || '#2563eb')}45`,
                                            borderColor: `${(tenant?.primary_color || '#2563eb')}20`
                                        }}
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-bl-full -mr-16 -mt-16 opacity-40 pointer-events-none" />
                                        
                                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 relative z-10">
                                            <div className="flex flex-col min-w-0 flex-1 w-full sm:w-auto">
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
                                                    <div className="flex items-center gap-1.5 text-slate-500">
                                                        <span className="text-xs">🏷️</span>
                                                        <span className="text-[13px] font-medium">{formatEventPrice(reg)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-2 relative z-10 flex-wrap sm:flex-nowrap pt-1">
                                                <div className="flex flex-col items-end gap-2">
                                                    <div className="flex items-center gap-2">
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
                                        </div>

                                        {/* Action Panel & Validity */}
                                        <div className="mt-4 pt-4 border-t border-dashed border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
                                            <div className="flex items-center gap-6">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 flex items-center justify-center text-lg">📅</div>
                                                    <p className="text-xs font-medium text-slate-600">
                                                        {new Date(reg.event_date).toLocaleDateString("fr-FR")}
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
                                                        href={tenant.payment_redirect_link}
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
                   <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-white animate-in zoom-in duration-300 p-8 md:p-10 relative">
                      {/* Decorative elements */}
                      <div 
                        className="absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full -mr-16 -mt-16"
                        style={{ backgroundColor: tenant?.primary_color || '#2563eb' }}
                      />
                      
                      <div className="text-center relative z-10">
                         <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-2 tracking-tight capitalize">
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
                                            {selectedOrder.is_unlimited ? 'Illimité' : `${selectedOrder.credits_total} crédits`}
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
                                              `${selectedOrder.offer_snap_validity_days} ${selectedOrder.offer_snap_validity_unit === 'months' ? 'mois' : 'jours'}` : 
                                              (selectedOrder.is_validity_unlimited ? 'Illimitée' : 
                                               (selectedOrder.end_date ? new Date(selectedOrder.end_date).toLocaleDateString("fr-FR") : "N/A")))}
                                         </p>
                                     </div>
                                 </div>

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
