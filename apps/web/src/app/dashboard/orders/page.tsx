"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { api, User, Tenant } from "@/lib/api";
import Link from "next/link";

export default function MemberOrdersPage() {
    const [user, setUser] = useState<User | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

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
            return `${amount}€ ${period}`.trim();
        }
        if (order.offer_featured_pricing === "lump_sum" && order.offer_price_lump_sum_cents) {
            return `${(order.offer_price_lump_sum_cents / 100).toFixed(2)}€`;
        }
        return `${(order.price_cents / 100).toFixed(2)}€`;
    };

    const getOrderIcon = (order: any) => {
        if (order.payment_status === 'a_valider' || order.payment_status === 'en_attente') {
            return '⏳';
        }
        if (order.offer_name.toLowerCase().includes('yoga')) return '🧘';
        return '🏷️';
    };

    const getGeneralStatusLabel = (status: string) => {
        switch (status) {
            case 'en_cours': return 'Active';
            case 'termine': return 'Terminée';
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

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-slate-50">
            <Sidebar user={user} tenant={tenant} />
            <main className="flex-1 p-4 md:p-8">
                <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
                    <header className="space-y-1">
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">🛍️ Mes commandes</h1>
                        <p className="text-slate-500 font-medium text-sm md:text-base">Historique de vos achats et factures</p>
                    </header>

                    {loading ? (
                        <div className="p-12 text-center text-slate-400 font-bold bg-white rounded-3xl border border-slate-100 shadow-sm animate-pulse">
                            Chargement de vos commandes...
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 md:p-16 text-center space-y-4">
                            <div className="text-6xl">🛍️</div>
                            <h2 className="text-2xl font-bold text-slate-900">Vous n&apos;avez pas encore de commande</h2>
                            <p className="text-slate-500 max-w-xs mx-auto">Parcourez notre boutique pour découvrir nos offres et forfaits.</p>
                            <Link href="/dashboard/credits" className="inline-block mt-4 px-8 py-3 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                                Aller à la Boutique
                            </Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {orders.map((order) => (
                                <div key={order.id} className="bg-white p-5 md:p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
                                    {/* Background Decor */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-full -mr-16 -mt-16 opacity-50 pointer-events-none" />
                                    
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                                        <div className="flex items-center gap-4 md:gap-6 w-full sm:w-auto">
                                            <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-xl md:text-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                                                {getOrderIcon(order)}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-lg md:text-xl font-bold text-slate-900 truncate pr-4">{order.offer_name}</h3>
                                                <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">
                                                    Commandée le {new Date(order.created_at).toLocaleDateString("fr-FR")}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 md:gap-8 border-t sm:border-t-0 border-slate-50 pt-3 sm:pt-0">
                                            <div className="text-left sm:text-right">
                                                <p className="text-lg md:text-xl font-black text-slate-900">{formatPrice(order)}</p>
                                                <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest">
                                                    {order.is_unlimited ? 'Illimité' : `${order.credits_total} crédits`}
                                                </p>
                                            </div>
                                            
                                            <div className="flex flex-col items-end gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getStatusStyle(order.payment_status)}`}>
                                                        <span className="opacity-60 mr-1">Paiement:</span>
                                                        {getStatusLabel(order.payment_status)}
                                                    </span>
                                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                                        {getGeneralStatusLabel(order.status)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Info Panel */}
                                    <div className="mt-5 pt-5 border-t border-dashed border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                                                <span className="text-sm">📅</span>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Fin de validité</p>
                                                <p className={`text-sm font-black ${order.is_validity_unlimited ? 'text-emerald-600' : 'text-slate-900 font-bold'}`}>
                                                    {order.is_validity_unlimited ? 'Illimitée' : (order.end_date ? new Date(order.end_date).toLocaleDateString("fr-FR") : "N/A")}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
                                            {order.payment_status === 'en_attente' && tenant?.payment_redirect_link && (
                                                <a 
                                                    href={tenant.payment_redirect_link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 md:flex-none px-5 py-2.5 bg-blue-600 text-white text-xs font-black rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2 group/btn"
                                                >
                                                    💳 Payer votre commande
                                                    <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                                                </a>
                                            )}
                                            {order.invoice_number && (
                                                <button 
                                                    onClick={() => downloadInvoice(order)}
                                                    className="flex-1 md:flex-none px-4 py-2.5 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-sm"
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
        </div>
    );
}
