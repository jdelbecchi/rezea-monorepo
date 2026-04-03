"use client";

import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import { useEffect, useState } from "react";
import { api, User, Tenant } from "@/lib/api";
import Link from "next/link";

export default function MemberOrdersPage() {
    const [user, setUser] = useState<User | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // States for Info Modal
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userData, ordersData, tenantData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getMyOrders(),
                    api.getTenantSettings()
                ]);
                setUser(userData);
                setOrders(ordersData);
                setTenant(tenantData);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'en_attente': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'a_valider': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
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
            return `${amount}€ /${period}${recurrence}`.trim();
        }
        if (order.offer_featured_pricing === "lump_sum" && order.offer_price_lump_sum_cents) {
            return `${(order.offer_price_lump_sum_cents / 100).toFixed(2)}€`;
        }
        return `${(order.price_cents / 100).toFixed(2)}€`;
    };

    const getGeneralStatusLabel = (status: string) => {
        switch (status) {
            case 'active': return 'Active';
            case 'en_cours': return 'Active';
            case 'termine': return 'Terminée';
            case 'expiree': return 'Expirée';
            case 'en_pause': return 'En pause';
            case 'annule': return 'Annulée';
            default: return status;
        }
    };

    const downloadInvoice = (order: any) => {
        const invoiceNumber = order.invoice_number || `FAC-${order.id.slice(-6).toUpperCase()}`;
        const invoiceDate = new Date(order.created_at).toISOString().split("T")[0];
        const emitter = tenant?.name || "Votre Établissement";
        const recipient = `${user?.first_name} ${user?.last_name}`;
        const description = `${order.offer_name} (${order.offer_code})`;
        const amount = (order.price_cents / 100).toFixed(2);

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture ${invoiceNumber}</title>
<style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#333}
h1{color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:10px}
.info{display:flex;justify-content:space-between;margin:20px 0}
.info div{width:45%}
table{width:100%;border-collapse:collapse;margin:20px 0}
th,td{border:1px solid #ddd;padding:10px;text-align:left}
th{background:#f1f5f9}
.total{text-align:right;font-size:1.3em;font-weight:bold;margin:20px 0}
.notes{margin-top:30px;padding:15px;background:#f8fafc;border-radius:8px}
.footer{margin-top:50px;text-align:center;font-size:0.8em;color:#999}
@media print{body{margin:0}}</style></head><body>
<h1>FACTURE</h1>
<div class="info"><div><strong>Émetteur</strong><br>${emitter}</div>
<div style="text-align:right"><strong>N° :</strong> ${invoiceNumber}<br><strong>Date :</strong> ${invoiceDate}</div></div>
<div><strong>Destinataire :</strong> ${recipient}</div>
<table><thead><tr><th>Description</th><th>Période</th><th>Montant</th></tr></thead>
<tbody><tr><td>${description}</td><td>${order.start_date} → ${order.end_date || "Illimité"}</td><td>${amount} €</td></tr></tbody></table>
<div class="total">Total : ${amount} €</div>
<div class="footer">Document généré automatiquement le ${new Date().toLocaleDateString("fr-FR")}</div>
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

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden">
            {isAdminMode && <Sidebar user={user} tenant={tenant} />}
            
            {/* PWA Mobile Header - Reduced Height and Tight Spacing */}
            {!isAdminMode && (
                <header className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 z-40 md:hidden safe-top shadow-sm">
                    <Link href="/dashboard" className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 active:scale-95 transition-all text-slate-400">
                        <span className="text-lg">←</span>
                    </Link>
                </header>
            )}

            <main className={`flex-1 px-5 pb-5 md:p-12 ${!isAdminMode ? 'pt-16 md:pt-14' : ''}`}>
                <div className="max-w-4xl mx-auto">
                    {/* Desktop Header with Back Button */}
                    {!isAdminMode && (
                        <div className="hidden md:flex items-center gap-2 mb-10">
                            <Link href="/dashboard" className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group">
                                <span className="text-lg group-hover:-translate-x-1 transition-transform">←</span>
                                Retour
                            </Link>
                        </div>
                    )}
                    <header className="px-1 space-y-1">
                        <h1 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight flex items-center gap-2">
                            <span className="text-2xl md:text-3xl">📋</span> Mes commandes
                        </h1>
                        <p className="text-slate-500 font-medium text-[11px] md:text-xs">Historique de vos achats</p>
                    </header>

                    {loading ? (
                        <div className="p-12 text-center text-slate-400 font-semibold bg-white rounded-3xl border border-slate-100 shadow-sm animate-pulse">
                            Chargement de vos commandes...
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 md:p-16 text-center space-y-4">
                            <div className="text-6xl">🛍️</div>
                            <h2 className="text-2xl font-semibold text-slate-900">Vous n&apos;avez pas encore de commande</h2>
                            <p className="text-slate-500 max-w-xs mx-auto">Parcourez notre boutique pour découvrir nos offres et forfaits.</p>
                            <Link href="/dashboard/credits" className="inline-block mt-4 px-8 py-3 bg-blue-600 text-white font-medium rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                                Aller à la Boutique
                            </Link>
                        </div>
                    ) : (
                        <div className="mt-6 grid grid-cols-1 gap-4">
                            {orders.map((order) => (
                                <div key={order.id} className="bg-white p-5 md:p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-full -mr-16 -mt-16 opacity-50 pointer-events-none" />
                                    
                                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 relative z-10">
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="text-lg md:text-xl font-semibold text-slate-900 truncate pr-2 capitalize tracking-tight">{order.offer_name}</h3>
                                                <button 
                                                    onClick={() => { setSelectedOrder(order); setShowInfoModal(true); }}
                                                    className="w-6 h-6 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all flex-shrink-0"
                                                    title="Détails de l'offre"
                                                >
                                                    ⓘ
                                                </button>
                                            </div>
                                            <p className="text-slate-400 text-[11px] md:text-xs">
                                                Commandée le {new Date(order.created_at).toLocaleDateString("fr-FR")}
                                            </p>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 relative z-10 flex-wrap sm:flex-nowrap">
                                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border ${getStatusStyle(order.payment_status)}`}>
                                                <span className="opacity-60 mr-1">Paiement :</span>
                                                {getStatusLabel(order.payment_status)}
                                            </span>
                                            <span className="px-3 py-1.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[10px] font-semibold">
                                                <span className="opacity-60 mr-1">Statut :</span>
                                                {getGeneralStatusLabel(order.status)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Panel & Validity */}
                                    <div className="mt-4 pt-4 border-t border-dashed border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 flex items-center justify-center text-sm">📅</div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs text-slate-400 font-medium tracking-tight">Fin de validité :</p>
                                                <p className={`text-sm font-semibold tracking-tight ${order.is_unlimited ? 'text-emerald-600' : 'text-slate-900'}`}>
                                                    {order.is_validity_unlimited ? 'Illimitée' : (order.end_date ? new Date(order.end_date).toLocaleDateString("fr-FR") : "N/A")}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                                            {order.payment_status === 'en_attente' && tenant?.payment_redirect_link && (
                                                <a 
                                                    href={tenant.payment_redirect_link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 md:flex-none px-5 py-2.5 bg-blue-600 text-white text-xs font-medium rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2 group/btn"
                                                >
                                                    💳 Payer
                                                    <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                                                </a>
                                            )}
                                            {order.invoice_number && (
                                                <button 
                                                    onClick={() => downloadInvoice(order)}
                                                    className="flex-1 md:flex-none px-4 py-2.5 bg-slate-900 text-white text-xs font-medium rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-sm"
                                                >
                                                    🧾 Facture
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Detail Modal */}
            {showInfoModal && selectedOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
                   <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 animate-in zoom-in duration-300 p-8 text-center">
                      <div className="mb-8">
                         <h2 className="text-xl md:text-2xl font-medium text-slate-900 mb-6 tracking-tight">
                             {selectedOrder.offer_snap_name || selectedOrder.offer_name}
                         </h2>
                         
                         <div className="space-y-3">
                             <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                                 <span className="text-xs text-slate-400 font-medium">Tarif initial</span>
                                 <span className="text-sm font-semibold text-slate-900">
                                     {formatPrice(selectedOrder)}
                                     {selectedOrder.payment_status === 'echelonne' && !formatPrice(selectedOrder).includes('x') && selectedOrder.installments?.length > 0 && ` (x${selectedOrder.installments.length})`}
                                 </span>
                             </div>
                             <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                                 <span className="text-xs text-slate-400 font-medium">Crédits inclus</span>
                                 <span className="text-sm font-semibold text-slate-900">
                                     {selectedOrder.is_unlimited ? 'Illimité' : `${selectedOrder.credits_total} crédits`}
                                 </span>
                             </div>
                             <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                                 <span className="text-xs text-slate-400 font-medium">Validité initiale</span>
                                 <span className="text-sm font-semibold text-slate-900">
                                     {selectedOrder.offer_snap_is_validity_unlimited ? 'Illimitée' : 
                                      (selectedOrder.offer_snap_validity_days ? 
                                       `${selectedOrder.offer_snap_validity_days} ${selectedOrder.offer_snap_validity_unit === 'months' ? 'mois' : 'jours'}` : 
                                       (selectedOrder.is_validity_unlimited ? 'Illimitée' : 
                                        (selectedOrder.end_date ? new Date(selectedOrder.end_date).toLocaleDateString("fr-FR") : "N/A")))}
                                 </span>
                             </div>
                         </div>

                         {(selectedOrder.offer_snap_description || selectedOrder.offer_description) && (
                             <div className="mt-4 p-4 bg-slate-50/30 rounded-2xl border border-slate-100/30">
                                 <p className="text-slate-500 text-[11px] leading-relaxed italic">
                                     {selectedOrder.offer_snap_description || selectedOrder.offer_description}
                                 </p>
                             </div>
                         )}
                      </div>
                      
                      <button 
                       onClick={() => setShowInfoModal(false)}
                       className="w-full py-4 bg-slate-900 text-white font-medium rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 text-xs"
                      >
                         Fermer
                      </button>
                   </div>
                </div>
            )}

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
