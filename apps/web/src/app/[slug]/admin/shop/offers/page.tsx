"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User, Offer } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

const emptyForm = {
    offer_code: "",
    name: "",
    description: "",
    price_lump_sum: "",
    price_recurring: "",
    recurring_count: "1",
    featured_pricing: "lump_sum" as "lump_sum" | "recurring",
    period: "mois",
    classes_included: "1",
    is_unlimited: false,
    validity_duration: "1",
    validity_unit: "months" as "days" | "months",
    deadline_date: "",
    is_validity_unlimited: false,
    is_unique: false,
    is_active: true,
    category: "",
    category_display_order: "1",
    offer_display_order: "1",
};

const formatPrice = (cents: number | null | undefined) => {
    if (!cents) return "0";
    const amount = cents / 100;
    return (amount % 1 === 0 ? amount.toString() : amount.toFixed(2)).replace('.', ',');
};

function AdminOffersContent() {
    const router = useRouter();
    const params = useParams();
    const [user, setUser] = useState<User | null>(null);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("active");
    
    const [formData, setFormData] = useState({ ...emptyForm });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showErrors, setShowErrors] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const fetchOffers = useCallback(async () => {
        try {
            const data = await api.getOffers(true);
            setOffers(data);
        } catch (err) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                // 1. Get user and check permissions BEFORE other data
                const userData = await api.getCurrentUser();
                if (userData.role !== 'owner' && userData.role !== 'manager') {
                    router.push("/home");
                    return;
                }
                setUser(userData);

                // 2. Fetch other data
                await fetchOffers();
            } catch (err: any) {
                if (err.response?.status === 401) {
                    router.push(`/${params.slug}`);
                }
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [router, fetchOffers]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validation locale
        const isPricingValid = formData.featured_pricing === 'lump_sum' 
            ? !!formData.price_lump_sum 
            : (!!formData.price_recurring && !!formData.recurring_count);
        
        const isValidityValid = formData.is_validity_unlimited || !!formData.deadline_date || !!formData.validity_duration;
        const isCreditsValid = formData.is_unlimited || !!formData.classes_included;

        if (!formData.offer_code || !formData.name || !isPricingValid || !isValidityValid || !isCreditsValid) {
            setShowErrors(true);
            return;
        }

        setSaving(true);
        try {
            const payload: any = {
                offer_code: formData.offer_code,
                name: formData.name,
                description: formData.description || null,
                price_lump_sum_cents: formData.price_lump_sum ? Math.round(parseFloat(formData.price_lump_sum.replace(',', '.')) * 100) : null,
                price_recurring_cents: formData.price_recurring ? Math.round(parseFloat(formData.price_recurring.replace(',', '.')) * 100) : null,
                recurring_count: formData.price_recurring ? (parseInt(formData.recurring_count) || null) : null,
                featured_pricing: formData.featured_pricing,
                period: formData.period || null,
                is_unlimited: formData.is_unlimited,
                classes_included: formData.is_unlimited ? null : (parseInt(formData.classes_included) || null),
                is_validity_unlimited: formData.is_validity_unlimited,
                validity_days: (!formData.is_validity_unlimited && !formData.deadline_date) ? (parseInt(formData.validity_duration) * (formData.validity_unit === 'months' ? 30 : formData.validity_unit === 'weeks' ? 7 : 1)) : null,
                validity_unit: formData.validity_unit,
                deadline_date: (formData.is_validity_unlimited) ? null : (formData.deadline_date || null),
                is_unique: formData.is_unique,
                is_active: formData.is_active,
                category: formData.category || null,
                display_order: parseInt(formData.offer_display_order) || 1,
                category_display_order: parseInt(formData.category_display_order) || 1,
            };

            if (editingId) {
                await api.updateOffer(editingId, payload);
                setMessage({ type: "success", text: "Offre modifiée avec succès !" });
            } else {
                await api.createOffer(payload);
                setMessage({ type: "success", text: "Offre créée avec succès !" });
            }

            await fetchOffers();
            resetForm();
        } catch (err: any) {
            const errorData = err.response?.data?.detail;
            let errorText = "Erreur lors de la sauvegarde";
            if (typeof errorData === 'string') {
                errorText = errorData;
            } else if (Array.isArray(errorData)) {
                errorText = errorData.map(e => `${e.loc.join('.')}: ${e.msg}`).join(', ');
            } else if (typeof errorData === 'object') {
                errorText = JSON.stringify(errorData);
            }
            setMessage({ type: "error", text: errorText });
        } finally {
            setSaving(false);
        }
    };

    const handleEditOpen = (o: Offer) => {
        setEditingId(o.id);
        setFormData({
            offer_code: o.offer_code || "",
            name: o.name,
            description: o.description || "",
            price_lump_sum: o.price_lump_sum_cents ? (o.price_lump_sum_cents / 100).toString() : "",
            price_recurring: o.price_recurring_cents ? (o.price_recurring_cents / 100).toString() : "",
            recurring_count: o.recurring_count?.toString() || "1",
            featured_pricing: o.featured_pricing || "lump_sum",
            period: o.period || "mois",
            classes_included: o.classes_included?.toString() || "1",
            is_unlimited: o.is_unlimited,
            validity_duration: o.validity_days ? (o.validity_unit === 'months' ? Math.round(o.validity_days/30) : o.validity_unit === 'weeks' ? Math.round(o.validity_days/7) : o.validity_days).toString() : "1",
            validity_unit: o.validity_unit || "months",
            deadline_date: o.deadline_date || "",
            is_validity_unlimited: o.is_validity_unlimited,
            is_unique: o.is_unique,
            is_active: o.is_active,
            category: o.category || "",
            category_display_order: (o as any).category_display_order?.toString() || "1",
            offer_display_order: (o.display_order || 1).toString(),
        });
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await api.deleteOffer(id);
            await fetchOffers();
            setDeleteConfirmId(null);
            setMessage({ type: "success", text: "Offre supprimée." });
        } catch (err: any) {
            setMessage({ type: "error", text: "Erreur lors de la suppression" });
        }
    };

    const resetForm = () => {
        setFormData({ ...emptyForm });
        setEditingId(null);
        setShowForm(false);
        setShowErrors(false);
    };

    const filteredOffers = offers.filter(o => {
        const q = searchTerm.toLowerCase();
        const matchesSearch = o.name.toLowerCase().includes(q) || (o.offer_code || "").toLowerCase().includes(q) || (o.category || "").toLowerCase().includes(q);
        const matchesStatus = statusFilter === "all" || (statusFilter === "active" && o.is_active) || (statusFilter === "inactive" && !o.is_active);
        return matchesSearch && matchesStatus;
    }).sort((a,b) => (a.category_display_order || 0) - (b.category_display_order || 0) || (a.display_order || 0) - (b.display_order || 0));

    // Liste unique des catégories pour les suggestions
    const existingCategories = Array.from(new Set(offers.map(o => o.category).filter((c): c is string => !!c))).sort();

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">🏷️ Catalogue d'offres</h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Gestion des prestations commerciales</p>
                        </div>
                        <button 
                            onClick={() => { resetForm(); setShowForm(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-sm text-sm tracking-tight active:scale-95"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Nouvelle offre
                        </button>
                    </div>

                    {/* Message */}
                    {message && (
                        <div className={`p-3 rounded-xl flex items-center justify-between border animate-in slide-in-from-top-2 duration-300 ${
                            message.type === 'success' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className="text-sm">
                                    {message.type === 'success' ? '✅' : '⚠️'}
                                </span>
                                <span className="text-sm font-normal text-slate-700 tracking-tight">
                                    {message.text}
                                </span>
                            </div>
                            <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-white/50 rounded-lg">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex flex-col md:flex-row gap-3 items-end flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input 
                                    type="text"
                                    placeholder="Nom, code offre..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm placeholder:text-slate-400"
                                />
                            </div>
                            
                            <div className="w-full md:w-auto">
                                <label className="block text-xs font-medium text-slate-500 mb-1">Statut</label>
                                <select 
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px] outline-none"
                                >
                                    <option value="active">Actives</option>
                                    <option value="inactive">Inactives</option>
                                    <option value="all">Toutes</option>
                                </select>
                            </div>
                        </div>
                        {(searchTerm || statusFilter !== "active") && (
                            <div className="mt-2 text-xs text-slate-500">
                                {filteredOffers.length} offre{filteredOffers.length > 1 ? "s" : ""} affichée{filteredOffers.length > 1 ? "s" : ""}
                            </div>
                        )}
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-100 border-b border-slate-200">
                                    <tr>
                                        <th className="px-1 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap w-10">N° Rub</th>
                                        <th className="px-1 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap w-16">Rubrique</th>
                                        <th className="px-1 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap w-10">N° Offre</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Intitulé</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Tarif</th>
                                        <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Crédits</th>
                                        <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Validité</th>
                                        <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Code</th>
                                        <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Statut</th>
                                        <th className="px-3 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {filteredOffers.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-8 text-center text-slate-500 text-sm">Aucune offre trouvée</td>
                                        </tr>
                                    ) : (
                                        filteredOffers.map((o) => (
                                            <tr key={o.id} className={`hover:bg-slate-50 transition-colors group ${!o.is_active ? 'opacity-50 select-none' : ''}`}>
                                                <td className="px-1 py-2.5 whitespace-nowrap text-[10px] font-normal text-slate-400 text-center w-10">{o.category_display_order || "-"}</td>
                                                <td className="px-1 py-2.5 whitespace-nowrap w-16">
                                                    <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-lg text-xs font-normal border border-slate-100 uppercase tracking-tight">{o.category || "Général"}</span>
                                                </td>
                                                <td className="px-1 py-2.5 whitespace-nowrap text-[10px] font-normal text-slate-400 text-center w-10">{o.display_order || "-"}</td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-slate-900">{o.name}</span>
                                                        {o.description && (
                                                            <div title={o.description} className="text-slate-400 hover:text-slate-600 transition-colors cursor-help">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                                </svg>
                                                            </div>
                                                        )}
                                                        {o.is_unique && (
                                                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[10px] font-medium uppercase tracking-tight">Achat unique</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <div className="flex flex-col gap-0.5">
                                                        {o.featured_pricing === 'recurring' ? (
                                                            <>
                                                                <div className="flex items-baseline gap-1">
                                                                    <span className="text-sm font-medium text-slate-900">{formatPrice(o.price_recurring_cents)}€</span>
                                                                    <span className="text-[11px] text-slate-900 font-normal">/ {o.period} x{o.recurring_count}</span>
                                                                </div>
                                                                {o.price_lump_sum_cents && (
                                                                    <span className="text-[11px] text-slate-400 font-normal">ou {formatPrice(o.price_lump_sum_cents)}€</span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="text-sm font-medium text-slate-900">{formatPrice(o.price_lump_sum_cents)}€</span>
                                                                {o.price_recurring_cents && (
                                                                    <div className="flex items-baseline gap-1">
                                                                        <span className="text-[11px] text-slate-400 font-normal">ou {formatPrice(o.price_recurring_cents)}€</span>
                                                                        <span className="text-[11px] text-slate-400 font-normal leading-none">/ {o.period} x{o.recurring_count}</span>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                                    {o.is_unlimited ? (
                                                        <span className="text-purple-600 font-normal text-lg leading-none">∞</span>
                                                    ) : (
                                                        <span className="text-sm font-normal text-slate-700">
                                                            {o.classes_included || 0} <span className="text-[11px] text-slate-400 font-normal">crédits</span>
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700 text-center">
                                                    {o.is_validity_unlimited ? (
                                                        <span className="text-purple-600 font-normal text-lg leading-none">∞</span>
                                                    ) : o.deadline_date ? (
                                                        <span className="text-xs font-medium">{new Date(o.deadline_date).toLocaleDateString("fr-FR")}</span>
                                                    ) : (
                                                        <span className="text-xs font-normal text-slate-600">
                                                            {o.validity_unit === 'months' ? Math.round((o.validity_days || 0) / 30) : o.validity_unit === 'weeks' ? Math.round((o.validity_days || 0) / 7) : (o.validity_days || 0)} 
                                                            {' '}{o.validity_unit === 'months' ? 'mois' : o.validity_unit === 'weeks' ? 'semaines' : 'jours'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-xs font-mono font-normal text-slate-400 uppercase tracking-tighter text-center">{o.offer_code}</td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                                    <span className={`px-2.5 py-1 text-xs font-normal rounded-full border shadow-sm ${o.is_active 
                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                                        : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                                        {o.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-right flex items-center justify-end gap-0">
                                                    <button onClick={() => handleEditOpen(o)} className="p-0.5 hover:bg-blue-50 text-blue-500 rounded-lg transition-all hover:scale-105" title="Modifier">✏️</button>
                                                    <button onClick={() => setDeleteConfirmId(o.id)} className="p-0.5 hover:bg-rose-50 text-rose-500 rounded-lg transition-all hover:scale-105" title="Supprimer">🗑️</button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {showForm && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                {editingId ? (
                                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                )}
                                <h3 className="text-[17px] font-semibold text-slate-900 tracking-tight">
                                    {editingId ? "Modifier l'offre" : "Nouvelle offre"}
                                </h3>
                            </div>
                            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Identification */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b pb-1">Identification</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className={`block text-sm font-medium mb-1 ${(showErrors && !formData.offer_code) ? 'text-red-500' : 'text-slate-700'}`}>Code Offre *</label>
                                            <input type="text" value={formData.offer_code} onChange={e => setFormData({...formData, offer_code: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm ${(showErrors && !formData.offer_code) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} placeholder="ex: FORFAIT-10" />
                                        </div>
                                        <div>
                                            <label className={`block text-sm font-medium mb-1 ${(showErrors && !formData.name) ? 'text-red-500' : 'text-slate-700'}`}>Intitulé *</label>
                                            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm ${(showErrors && !formData.name) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Rubrique</label>
                                            <input 
                                                type="text" 
                                                value={formData.category} 
                                                onChange={e => setFormData({...formData, category: e.target.value})} 
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" 
                                                list="categories-list"
                                                placeholder="ex: Abonnement, Formation..."
                                            />
                                            <datalist id="categories-list">
                                                {existingCategories.map(cat => (
                                                    <option key={cat} value={cat} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">N° Rubrique</label>
                                            <input type="number" value={formData.category_display_order} onChange={e => setFormData({...formData, category_display_order: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">N° Offre</label>
                                            <input type="number" value={formData.offer_display_order} onChange={e => setFormData({...formData, offer_display_order: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row justify-end items-start sm:items-center gap-6 mt-4">
                                        <div className="w-48">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Statut de l'offre</label>
                                            <select value={formData.is_active ? "true" : "false"} onChange={e => setFormData({...formData, is_active: e.target.value === "true"})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white">
                                                <option value="true">Active</option>
                                                <option value="false">Inactive</option>
                                            </select>
                                        </div>
                                        <div className="pt-0 sm:pt-6">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={formData.is_unique} onChange={e => setFormData({...formData, is_unique: e.target.checked})} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                                                <span className="text-sm font-medium text-slate-700">Achat unique (1x par user)</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Contenu & Validité */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b pb-1">Contenu & Validité</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <div>
                                                <label className={`block text-sm font-medium mb-1 ${(showErrors && !formData.is_unlimited && !formData.classes_included) ? 'text-red-500' : 'text-slate-700'}`}>Nombre de crédits inclus *</label>
                                                <div className="flex flex-col gap-2">
                                                    <input type="number" disabled={formData.is_unlimited} value={formData.classes_included} onChange={e => setFormData({...formData, classes_included: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 ${(showErrors && !formData.is_unlimited && !formData.classes_included) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                                                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                                                        <input type="checkbox" checked={formData.is_unlimited} onChange={e => setFormData({...formData, is_unlimited: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500" />
                                                        <span className="text-sm font-medium text-slate-700">Illimité</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className={`block text-sm font-medium mb-1 ${(showErrors && !formData.is_validity_unlimited && !formData.deadline_date && !formData.validity_duration) ? 'text-red-500' : 'text-slate-700'}`}>
                                                    Durée de validité *
                                                </label>
                                                <div className="flex gap-2 items-center">
                                                    <input 
                                                        type="number" 
                                                        disabled={formData.is_validity_unlimited} 
                                                        value={formData.validity_duration} 
                                                        onChange={e => setFormData({...formData, validity_duration: e.target.value})} 
                                                        className={`w-20 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 ${(showErrors && !formData.is_validity_unlimited && !formData.deadline_date && !formData.validity_duration) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} 
                                                    />
                                                    <select disabled={formData.is_validity_unlimited} value={formData.validity_unit} onChange={e => setFormData({...formData, validity_unit: e.target.value as any})} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 bg-white">
                                                        <option value="months">mois</option>
                                                        <option value="weeks">semaine</option>
                                                        <option value="days">jour</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Ou Échéance fixe</label>
                                                    <input type="date" disabled={formData.is_validity_unlimited} value={formData.deadline_date} onChange={e => setFormData({...formData, deadline_date: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100" />
                                                </div>
                                                <div className="pt-6">
                                                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                                                        <input type="checkbox" checked={formData.is_validity_unlimited} onChange={e => setFormData({...formData, is_validity_unlimited: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500" />
                                                        <span className="text-sm font-medium text-slate-700">Illimitée</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {(() => {
                                    const isPricingValid = formData.featured_pricing === 'lump_sum' 
                                        ? !!formData.price_lump_sum 
                                        : (!!formData.price_recurring && !!formData.recurring_count);

                                    return (
                                        <div className="space-y-4">
                                            <h4 className={`text-xs font-semibold uppercase tracking-wider border-b pb-1 flex items-baseline gap-2 ${(showErrors && !isPricingValid) ? 'text-red-500 border-red-200' : 'text-slate-400'}`}>
                                                Tarification *
                                                <span className="normal-case italic font-normal text-[10px] tracking-normal text-slate-400">(Choisissez le tarif que vous souhaitez mettre en avant)</span>
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Paiement Unique */}
                                                <div 
                                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${formData.featured_pricing === 'lump_sum' ? (showErrors && !formData.price_lump_sum ? 'border-red-300 bg-red-50' : 'border-blue-600 bg-blue-50') : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                                    onClick={() => setFormData({...formData, featured_pricing: 'lump_sum'})}
                                                >
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <input type="radio" checked={formData.featured_pricing === 'lump_sum'} readOnly className="w-4 h-4 text-blue-600" />
                                                        <span className="font-semibold text-slate-900">Paiement unique</span>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-slate-500 mb-1">Prix TTC (€)</label>
                                                        <input type="number" step="0.01" value={formData.price_lump_sum} onChange={e => setFormData({...formData, price_lump_sum: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 bg-white ${(showErrors && formData.featured_pricing === 'lump_sum' && !formData.price_lump_sum) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} placeholder="0.00" disabled={formData.featured_pricing !== 'lump_sum'} />
                                                    </div>
                                                </div>

                                                {/* Abonnement */}
                                                <div 
                                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${formData.featured_pricing === 'recurring' ? (showErrors && (!formData.price_recurring || !formData.recurring_count) ? 'border-red-300 bg-red-50' : 'border-amber-500 bg-amber-50') : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                                    onClick={() => setFormData({...formData, featured_pricing: 'recurring'})}
                                                >
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <input type="radio" checked={formData.featured_pricing === 'recurring'} readOnly className="w-4 h-4 text-amber-500" />
                                                        <span className="font-semibold text-slate-900">Paiement échelonné / Abonnement</span>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <div className="flex gap-2">
                                                            <div className="flex-1">
                                                                <label className="block text-xs text-slate-500 mb-1">Échéance (€)</label>
                                                                <input type="number" step="0.01" value={formData.price_recurring} onChange={e => setFormData({...formData, price_recurring: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 bg-white text-sm ${(showErrors && formData.featured_pricing === 'recurring' && !formData.price_recurring) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} placeholder="0.00" disabled={formData.featured_pricing !== 'recurring'} />
                                                            </div>
                                                            <div className="w-32">
                                                                <label className="block text-xs text-slate-500 mb-1">Période</label>
                                                                <select value={formData.period} onChange={e => setFormData({...formData, period: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 bg-white text-sm" disabled={formData.featured_pricing !== 'recurring'}>
                                                                    <option value="mois">mois</option>
                                                                    <option value="semaine">semaine</option>
                                                                    <option value="jour">jour</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-slate-500 mb-1">Nombre d'échéances</label>
                                                            <input type="number" value={formData.recurring_count} onChange={e => setFormData({...formData, recurring_count: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 bg-white text-sm ${(showErrors && formData.featured_pricing === 'recurring' && !formData.recurring_count) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} disabled={formData.featured_pricing !== 'recurring'} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                    <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" rows={3} placeholder="Détails de l'offre..." />
                                </div>
                            </form>
                        </div>
                        
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center sticky bottom-0 z-10">
                            <button 
                                type="button" 
                                onClick={resetForm} 
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={handleSubmit} 
                                disabled={saving} 
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50 transition-all text-sm shadow-sm flex items-center gap-2"
                            >
                                {saving && (
                                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                {saving ? (editingId ? "Modification..." : "Création...") : (editingId ? "Modifier l'offre" : "Créer l'offre")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteConfirmId && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">
                        <div className="p-10 pb-8">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2 tracking-tight">Confirmer la suppression</h3>
                            <p className="text-slate-500 font-normal text-base leading-relaxed">Cette offre sera définitivement retirée de votre catalogue. Cette action est irréversible.</p>
                        </div>
                        <div className="p-6 bg-white border-t border-gray-100 flex gap-3 justify-end items-center">
                            <button 
                                onClick={() => setDeleteConfirmId(null)} 
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={() => handleDelete(deleteConfirmId)} 
                                className="px-6 py-2.5 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition-all text-sm shadow-sm active:scale-95"
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminOffersPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>}>
            <AdminOffersContent />
        </Suspense>
    );
}
