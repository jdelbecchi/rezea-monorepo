"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
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

function AdminOffersContent() {
    const router = useRouter();
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
                const userData = await api.getCurrentUser();
                if (userData.role !== 'owner' && userData.role !== 'manager') {
                    router.push('/dashboard');
                    return;
                }
                setUser(userData);
                await fetchOffers();
            } catch (err: any) {
                if (err.response?.status === 401) {
                    router.push("/login");
                }
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [router, fetchOffers]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
                validity_days: (!formData.is_validity_unlimited && !formData.deadline_date) ? (parseInt(formData.validity_duration) * (formData.validity_unit === 'months' ? 30 : 1)) : null,
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
            validity_duration: o.validity_days ? (o.validity_unit === 'months' ? Math.round(o.validity_days/30) : o.validity_days).toString() : "1",
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
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">🛍️ catalogue d'offres</h1>
                            <p className="text-[11px] font-medium text-slate-400 lowercase mt-1">gestion des prestations commerciales</p>
                        </div>
                        <button 
                            onClick={() => { resetForm(); setShowForm(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            ➕ Nouvelle offre
                        </button>
                    </div>

                    {/* Message */}
                    {message && (
                        <div className={`p-4 rounded-lg border ${message.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                            {message.text}
                        </div>
                    )}

                    {/* Filters */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex flex-col md:flex-row gap-3 items-end flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input 
                                    type="text"
                                    placeholder="Nom, code offre..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                />
                            </div>
                            
                            <div className="w-full md:w-auto">
                                <label className="block text-xs font-medium text-slate-500 mb-1">Statut</label>
                                <select 
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
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
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-3 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">N° Rub</th>
                                        <th className="px-3 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Rubrique</th>
                                        <th className="px-3 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">N° Offre</th>
                                        <th className="px-3 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Intitulé de l&apos;offre</th>
                                        <th className="px-3 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Tarif</th>
                                        <th className="px-3 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Crédits</th>
                                        <th className="px-3 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Validité</th>
                                        <th className="px-3 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Code</th>
                                        <th className="px-3 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Statut</th>
                                        <th className="px-3 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredOffers.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-8 text-center text-slate-500 text-sm">Aucune offre trouvée</td>
                                        </tr>
                                    ) : (
                                        filteredOffers.map((o) => (
                                            <tr key={o.id} className={`hover:bg-slate-50 transition-colors ${!o.is_active ? 'opacity-50 grayscale select-none' : ''}`}>
                                                <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-slate-400 text-center">{o.category_display_order || "-"}</td>
                                                <td className="px-3 py-4 whitespace-nowrap">
                                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold tracking-tight uppercase">{o.category || "Général"}</span>
                                                </td>
                                                <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-slate-800 text-center">{o.display_order || "-"}</td>
                                                <td className="px-3 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-slate-900">{o.name}</span>
                                                        {o.is_unique && (
                                                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[9px] font-black uppercase tracking-tighter">Achat unique</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-black text-slate-900 tracking-tight">
                                                            {o.featured_pricing === 'recurring' && o.price_recurring_cents 
                                                                ? `${(o.price_recurring_cents/100).toFixed(2).replace('.', ',')}€` 
                                                                : `${(o.price_lump_sum_cents ? o.price_lump_sum_cents/100 : 0).toFixed(2).replace('.', ',')}€`}
                                                        </span>
                                                        {o.featured_pricing === 'recurring' && o.price_recurring_cents && (
                                                            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-tight">/ {o.period} x{o.recurring_count}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-4 whitespace-nowrap">
                                                    {o.is_unlimited ? (
                                                        <span className="text-purple-600 font-black text-lg">∞</span>
                                                    ) : (
                                                        <span className="text-sm font-bold text-slate-700">
                                                            {o.classes_included || 0} <span className="text-[10px] text-slate-400 uppercase font-medium">crédits</span>
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-700">
                                                    {o.is_validity_unlimited ? (
                                                        <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Illimitée</span>
                                                    ) : o.deadline_date ? (
                                                        <span className="text-xs font-medium">{new Date(o.deadline_date).toLocaleDateString("fr-FR")}</span>
                                                    ) : (
                                                        <span className="text-xs font-bold text-slate-600 lowercase group-hover:text-blue-600 transition-colors">
                                                            {o.validity_unit === 'months' ? Math.round((o.validity_days || 0) / 30) : (o.validity_days || 0)} 
                                                            {' '}{o.validity_unit === 'months' ? 'Mois' : 'Jours'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-4 whitespace-nowrap text-xs font-mono font-bold text-slate-400 uppercase tracking-tighter">{o.offer_code}</td>
                                                <td className="px-3 py-4 whitespace-nowrap">
                                                    <span className={`px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-wider shadow-sm border ${o.is_active 
                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                                        : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                                        {o.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-4 whitespace-nowrap text-right space-x-1">
                                                    <button onClick={() => handleEditOpen(o)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors group" title="Modifier">
                                                        <span className="group-hover:scale-110 inline-block transition-transform">✏️</span>
                                                    </button>
                                                    <button onClick={() => setDeleteConfirmId(o.id)} className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors group" title="Supprimer">
                                                        <span className="group-hover:scale-110 inline-block transition-transform">🗑️</span>
                                                    </button>
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

            {/* Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900">
                                {editingId ? "✏️ Modifier l'offre" : "➕ Nouvelle offre"}
                            </h3>
                            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Identification */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b pb-1">Identification</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className={`block text-sm font-medium mb-1 ${!formData.offer_code ? 'text-red-500' : 'text-slate-700'}`}>Code Offre *</label>
                                            <input type="text" required value={formData.offer_code} onChange={e => setFormData({...formData, offer_code: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm ${!formData.offer_code ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} placeholder="ex: FORFAIT-10" />
                                        </div>
                                        <div>
                                            <label className={`block text-sm font-medium mb-1 ${!formData.name ? 'text-red-500' : 'text-slate-700'}`}>Nom Commercial *</label>
                                            <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm ${!formData.name ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
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
                                    <div className="flex gap-6 mt-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={formData.is_unique} onChange={e => setFormData({...formData, is_unique: e.target.checked})} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                                            <span className="text-sm font-medium text-slate-700">Achat unique (1x par user)</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500" />
                                            <span className="text-sm font-medium text-slate-700">Activer l'offre</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Contenu & Validité */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b pb-1">Contenu & Validité</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Séances incluses</label>
                                                <div className="flex gap-4 items-center">
                                                    <input type="number" disabled={formData.is_unlimited} value={formData.classes_included} onChange={e => setFormData({...formData, classes_included: e.target.value})} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100" />
                                                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                                                        <input type="checkbox" checked={formData.is_unlimited} onChange={e => setFormData({...formData, is_unlimited: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500" />
                                                        <span className="text-sm font-medium text-slate-700">Illimitées</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className={`block text-sm font-medium mb-1 ${!formData.is_validity_unlimited && !formData.deadline_date && !formData.validity_duration ? 'text-red-500' : 'text-slate-700'}`}>
                                                    Durée de validité {!formData.is_validity_unlimited && !formData.deadline_date && '*'}
                                                </label>
                                                <div className="flex gap-2 items-center">
                                                    <input 
                                                        type="number" 
                                                        required={!formData.is_validity_unlimited && !formData.deadline_date}
                                                        disabled={formData.is_validity_unlimited} 
                                                        value={formData.validity_duration} 
                                                        onChange={e => setFormData({...formData, validity_duration: e.target.value})} 
                                                        className={`w-20 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 ${!formData.is_validity_unlimited && !formData.deadline_date && !formData.validity_duration ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} 
                                                    />
                                                    <select disabled={formData.is_validity_unlimited} value={formData.validity_unit} onChange={e => setFormData({...formData, validity_unit: e.target.value as any})} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100">
                                                        <option value="months">Mois</option>
                                                        <option value="days">Jours</option>
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

                                {/* Tarification */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b pb-1">Tarification</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Paiement Unique */}
                                        <div 
                                            className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${formData.featured_pricing === 'lump_sum' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                            onClick={() => setFormData({...formData, featured_pricing: 'lump_sum'})}
                                        >
                                            <div className="flex items-center gap-2 mb-3">
                                                <input type="radio" checked={formData.featured_pricing === 'lump_sum'} readOnly className="w-4 h-4 text-blue-600" />
                                                <span className="font-semibold text-slate-900">Paiement unique</span>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">Prix TTC (€)</label>
                                                <input type="number" step="0.01" value={formData.price_lump_sum} onChange={e => setFormData({...formData, price_lump_sum: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 bg-white" placeholder="0.00" disabled={formData.featured_pricing !== 'lump_sum'} />
                                            </div>
                                        </div>

                                        {/* Abonnement */}
                                        <div 
                                            className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${formData.featured_pricing === 'recurring' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                            onClick={() => setFormData({...formData, featured_pricing: 'recurring'})}
                                        >
                                            <div className="flex items-center gap-2 mb-3">
                                                <input type="radio" checked={formData.featured_pricing === 'recurring'} readOnly className="w-4 h-4 text-amber-500" />
                                                <span className="font-semibold text-slate-900">Abonnement / Récurrence</span>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-slate-500 mb-1">Échéance (€)</label>
                                                        <input type="number" step="0.01" value={formData.price_recurring} onChange={e => setFormData({...formData, price_recurring: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 bg-white text-sm" placeholder="0.00" disabled={formData.featured_pricing !== 'recurring'} />
                                                    </div>
                                                    <div className="w-24">
                                                        <label className="block text-xs text-slate-500 mb-1">Période</label>
                                                        <input type="text" value={formData.period} onChange={e => setFormData({...formData, period: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 bg-white text-sm" placeholder="ex: mois" disabled={formData.featured_pricing !== 'recurring'} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-slate-500 mb-1">Nombre d'échéances</label>
                                                    <input type="number" value={formData.recurring_count} onChange={e => setFormData({...formData, recurring_count: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 bg-white text-sm" disabled={formData.featured_pricing !== 'recurring'} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Description Commerciale</label>
                                    <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" rows={3} placeholder="Détails de l'offre..." />
                                </div>
                            </form>
                        </div>
                        
                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                            <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300 transition-colors">
                                Annuler
                            </button>
                            <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
                                {saving ? "Enregistrement..." : "Enregistrer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Confirmer la suppression</h3>
                        <p className="text-slate-600 mb-6 font-medium text-sm">Cette offre sera définitivement retirée. Continuer ?</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300">
                                Annuler
                            </button>
                            <button onClick={() => handleDelete(deleteConfirmId)} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 shadow-sm">
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
