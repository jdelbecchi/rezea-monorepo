"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User, Offer, Tenant } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import MultiSelect from "@/components/MultiSelect";
import ConfirmModal from "@/components/ConfirmModal";
import { formatCredits } from "@/lib/formatters";
import { getSessionFilter, setSessionFilter, updateLastActivity } from "@/lib/sessionFilters";

interface OfferForm {
    offer_code: string;
    name: string;
    description: string;
    price_lump_sum: string;
    price_recurring: string;
    recurring_count: string;
    featured_pricing: "lump_sum" | "recurring";
    period: string;
    classes_included: string;
    is_unlimited: boolean;
    limit_amount: string;
    limit_period: string;
    limit_rollover: boolean;
    validity_duration: string;
    validity_unit: "days" | "weeks" | "months";
    deadline_date: string;
    is_validity_unlimited: boolean;
    is_unique: boolean;
    is_active: boolean;
    category: string;
    offer_display_order: string;
    category_display_order: string;
    engagement_type: string;
    allowed_activities: string[];
    is_recurring_unlimited: boolean;
    trigger_consumption_percent: string;
    activity_credits: Record<string, string>;
}

const emptyForm: OfferForm = {
    offer_code: "",
    name: "",
    description: "",
    price_lump_sum: "",
    price_recurring: "",
    recurring_count: "1",
    featured_pricing: "lump_sum",
    period: "mois",
    classes_included: "",
    is_unlimited: false,
    limit_amount: "",
    limit_period: "/mois",
    limit_rollover: false,
    validity_duration: "",
    validity_unit: "months",
    deadline_date: "",
    is_validity_unlimited: false,
    is_unique: false,
    is_active: true,
    category: "",
    offer_display_order: "1",
    category_display_order: "1",
    engagement_type: "ponctuel",
    allowed_activities: [],
    is_recurring_unlimited: false,
    trigger_consumption_percent: "",
    activity_credits: {},
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
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [searchTerm, setSearchTerm] = useState(() => getSessionFilter("offers_search", ""));
    const [statusFilter, setStatusFilter] = useState(() => getSessionFilter("offers_statusFilter", "active"));

    // Sync filters to sessionStorage
    useEffect(() => {
        setSessionFilter("offers_search", searchTerm);
    }, [searchTerm]);

    useEffect(() => {
        setSessionFilter("offers_statusFilter", statusFilter);
    }, [statusFilter]);

    // Handle global activity listener to update inactivity timestamp
    useEffect(() => {
        const handleActivity = () => {
            updateLastActivity();
        };
        window.addEventListener("click", handleActivity);
        window.addEventListener("keypress", handleActivity);
        return () => {
            window.removeEventListener("click", handleActivity);
            window.removeEventListener("keypress", handleActivity);
        };
    }, []);
    
    const [formData, setFormData] = useState({ ...emptyForm });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showErrors, setShowErrors] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);

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

                const [tenantData] = await Promise.all([
                    api.getTenantSettings(),
                    fetchOffers()
                ]);
                setTenant(tenantData);
            } catch (err: any) {
                if (err.response?.status === 401) {
                    router.push(`/`);
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
            : (!!formData.price_recurring && (formData.is_recurring_unlimited || !!formData.recurring_count));
        
        const isValidityValid = formData.is_validity_unlimited || !!formData.deadline_date || !!formData.validity_duration;
        const isCreditsValid = formData.is_unlimited || !!formData.classes_included;

        if (!formData.offer_code || !formData.name || !isPricingValid || !isValidityValid || !isCreditsValid) {
            setShowErrors(true);
            return;
        }

        setSaving(true);
        try {
            const has_activity_credits = formData.allowed_activities?.length > 1 && Object.keys(formData.activity_credits || {}).some(k => formData.activity_credits[k]?.trim() !== '');
            const activity_credits_payload = has_activity_credits
                ? Object.fromEntries(
                    Object.entries(formData.activity_credits || {})
                        .filter(([act, val]) => formData.allowed_activities.includes(act) && val && val.trim() !== '')
                        .map(([act, val]) => [act, parseFloat(val.toString().replace(',', '.'))])
                  )
                : null;

            const computed_classes_included = (formData.is_unlimited)
                ? null
                : (activity_credits_payload
                    ? Object.values(activity_credits_payload).reduce((a, b) => a + b, 0)
                    : (parseFloat(formData.classes_included) || null));

            const payload: any = {
                offer_code: formData.offer_code,
                name: formData.name,
                description: formData.description || null,
                price_lump_sum_cents: formData.price_lump_sum ? Math.round(parseFloat(formData.price_lump_sum.replace(',', '.')) * 100) : null,
                price_recurring_cents: formData.price_recurring ? Math.round(parseFloat(formData.price_recurring.replace(',', '.')) * 100) : null,
                recurring_count: formData.price_recurring ? (formData.period === 'seuil' ? (formData.trigger_consumption_percent.split(',').filter(x => x.trim()).length + 1) : (formData.is_recurring_unlimited ? null : (parseInt(formData.recurring_count) || null))) : null,
                trigger_consumption_percent: (formData.price_recurring && formData.period === 'seuil') ? formData.trigger_consumption_percent : null,
                featured_pricing: formData.featured_pricing,
                period: formData.price_recurring ? (formData.period || null) : null,
                is_unlimited: formData.is_unlimited,
                classes_included: computed_classes_included,
                activity_credits: activity_credits_payload,
                limit_amount: formData.limit_amount ? parseFloat(formData.limit_amount) : null,
                limit_period: formData.limit_amount ? formData.limit_period : null,
                limit_rollover: formData.limit_amount ? formData.limit_rollover : false,
                is_validity_unlimited: formData.is_validity_unlimited,
                validity_days: (!formData.is_validity_unlimited && !formData.deadline_date) ? (parseInt(formData.validity_duration) * (formData.validity_unit === 'months' ? 30 : formData.validity_unit === 'weeks' ? 7 : 1)) : null,
                validity_unit: formData.validity_unit,
                deadline_date: (formData.is_validity_unlimited) ? null : (formData.deadline_date || null),
                is_unique: formData.is_unique,
                is_active: formData.is_active,
                category: formData.category || null,
                display_order: parseInt(formData.offer_display_order) || 1,
                category_display_order: parseInt(formData.category_display_order) || 1,
                engagement_type: formData.engagement_type,
                allowed_activities: formData.allowed_activities,
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
            setModalError(errorText);
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
            limit_amount: o.limit_amount?.toString() || "",
            limit_period: o.limit_period || "mois",
            limit_rollover: o.limit_rollover || false,
            validity_duration: o.validity_days ? (o.validity_unit === 'months' ? Math.round(o.validity_days/30) : o.validity_unit === 'weeks' ? Math.round(o.validity_days/7) : o.validity_days).toString() : "1",
            validity_unit: o.validity_unit || "months",
            deadline_date: o.deadline_date || "",
            is_validity_unlimited: o.is_validity_unlimited,
            is_unique: o.is_unique,
            is_active: o.is_active,
            category: o.category || "",
            category_display_order: (o as any).category_display_order?.toString() || "1",
            offer_display_order: (o.display_order || 1).toString(),
            engagement_type: o.engagement_type || "ponctuel",
            allowed_activities: o.allowed_activities || [],
            is_recurring_unlimited: o.featured_pricing === 'recurring' && o.recurring_count === null,
            trigger_consumption_percent: o.trigger_consumption_percent?.toString() || "",
            activity_credits: Object.fromEntries(
                Object.entries((o as any).activity_credits || {}).map(([act, val]) => [act, val?.toString() || ""])
            ),
        });
        setShowForm(true);
        setModalError(null);
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

    const handleActivityCheckboxChange = (act: string, checked: boolean) => {
        let nextActs = [...(formData.allowed_activities || [])];
        if (checked) {
            if (!nextActs.includes(act)) nextActs.push(act);
        } else {
            nextActs = nextActs.filter(a => a !== act);
        }
        
        const nextCredits = { ...formData.activity_credits };
        if (!checked) {
            delete nextCredits[act];
        }
        
        const sum = Object.values(nextCredits)
            .map(val => parseFloat(val) || 0)
            .reduce((a, b) => a + b, 0);
            
        setFormData({
            ...formData,
            allowed_activities: nextActs,
            activity_credits: nextCredits,
            classes_included: sum > 0 ? sum.toString() : formData.classes_included
        });
    };

    const handleActivityCreditChange = (act: string, value: string) => {
        const nextCredits = { ...formData.activity_credits, [act]: value };
        const sum = Object.values(nextCredits)
            .map(val => parseFloat(val) || 0)
            .reduce((a, b) => a + b, 0);
        setFormData({
            ...formData,
            activity_credits: nextCredits,
            classes_included: sum > 0 ? sum.toString() : formData.classes_included
        });
    };

    const resetForm = () => {
        setFormData({ ...emptyForm });
        setEditingId(null);
        setShowForm(false);
        setShowErrors(false);
        setModalError(null);
    };

    const filteredOffers = offers.filter(o => {
        const q = searchTerm.toLowerCase();
        const matchesActivities = o.allowed_activities?.some(act => act.toLowerCase().includes(q));
        const matchesSearch = o.name.toLowerCase().includes(q) || 
                              (o.offer_code || "").toLowerCase().includes(q) || 
                              (o.category || "").toLowerCase().includes(q) ||
                              !!matchesActivities;
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
                            <p className="text-base font-normal text-slate-500 mt-1">Créez et organisez vos offres et vos forfaits</p>
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
                                        <th className="px-1 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap w-12">N°</th>
                                        <th className="px-1 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap w-20">Rubrique</th>
                                        <th className="px-1.5 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Intitulé</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Activités</th>
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
                                            <td colSpan={10} className="px-6 py-8 text-center text-slate-500 text-sm">Aucune offre trouvée</td>
                                        </tr>
                                    ) : (
                                        filteredOffers.map((o) => (
                                            <tr key={o.id} className={`hover:bg-slate-50 transition-colors group ${!o.is_active ? 'opacity-50 select-none' : ''}`}>
                                                <td className="px-1 py-2.5 whitespace-nowrap text-[11px] font-normal text-slate-400 text-center w-12">
                                                    {o.category_display_order || 0}.{o.display_order || 0}
                                                </td>
                                                <td className="px-1 py-2.5 whitespace-nowrap w-20">
                                                    <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-lg text-xs font-normal border border-slate-100 uppercase tracking-tight">{o.category || "Général"}</span>
                                                </td>
                                                <td className="px-1.5 py-2.5 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-slate-900">{o.name}</span>
                                                        {o.is_unique && (
                                                            <span className="w-4 h-4 flex items-center justify-center bg-amber-50 border border-amber-200/60 text-amber-600 rounded-full text-[9px] font-medium" title="Achat unique (1x par utilisateur)">1</span>
                                                        )}
                                                        {o.description && (
                                                            <div title={o.description} className="text-slate-400 hover:text-slate-600 transition-colors cursor-help">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                                </svg>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <div className="flex flex-wrap gap-1">
                                                        {!o.allowed_activities || o.allowed_activities.length === 0 ? (
                                                            <span className="px-2 py-0.5 bg-slate-50 text-slate-400 border border-slate-100 rounded text-[10px] font-medium uppercase tracking-tight">
                                                                toutes activités
                                                            </span>
                                                        ) : (
                                                            o.allowed_activities.map((act) => {
                                                                const packCredits = (o as any).activity_credits?.[act];
                                                                if (packCredits !== undefined && packCredits !== null) {
                                                                    return (
                                                                        <span key={act} className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[10px] font-semibold uppercase tracking-tight whitespace-nowrap">
                                                                            {act} ({packCredits})
                                                                        </span>
                                                                    );
                                                                }
                                                                return (
                                                                    <span key={act} className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[10px] font-medium uppercase tracking-tight whitespace-nowrap">
                                                                        {act}
                                                                    </span>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <div className="flex flex-col gap-0.5">
                                                        {o.featured_pricing === 'recurring' ? (
                                                            <>
                                                                <div className="flex items-baseline gap-1">
                                                                    <span className="text-sm font-medium text-slate-900">{formatPrice(o.price_recurring_cents)}€</span>
                                                                    <span className="text-[11px] text-slate-900 font-normal">/ {o.period} {o.recurring_count ? `x${o.recurring_count}` : ''}</span>
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
                                                                        <span className="text-[11px] text-slate-400 font-normal leading-none">/ {o.period} {o.recurring_count ? `x${o.recurring_count}` : ''}</span>
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
                                                        <span className="text-sm font-medium text-slate-600">
                                                            {formatCredits(o.classes_included)}
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
                                {modalError && (
                                    <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl text-sm font-normal flex items-start gap-2.5 animate-in slide-in-from-top-2 duration-300">
                                        <span className="flex-shrink-0 text-base">⚠️</span>
                                        <span className="text-left leading-relaxed">{modalError}</span>
                                    </div>
                                )}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b pb-1">Identification & Description</h4>
                                    <div className="flex flex-col md:flex-row gap-4">
                                        <div className="w-full md:w-48">
                                            <label className={`block text-sm font-medium mb-1 ${(showErrors && !formData.offer_code) ? 'text-red-500' : 'text-slate-700'}`}>Code Offre *</label>
                                            <input type="text" value={formData.offer_code} onChange={e => setFormData({...formData, offer_code: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${(showErrors && !formData.offer_code) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} placeholder="ex: FORFAIT-10" />
                                        </div>
                                        <div className="flex-1">
                                            <label className={`block text-sm font-medium mb-1 ${(showErrors && !formData.name) ? 'text-red-500' : 'text-slate-700'}`}>Intitulé *</label>
                                            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${(showErrors && !formData.name) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                        <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" rows={2} placeholder="Détails de l'offre..." />
                                    </div>

                                    {/* Options complémentaires */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                                        <div className="flex items-center">
                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <input type="checkbox" checked={formData.is_unique} onChange={e => setFormData({...formData, is_unique: e.target.checked})} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                                                <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Achat unique (1x par utilisateur)</span>
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Type d'engagement :</label>
                                            <select value={formData.engagement_type} onChange={e => setFormData({...formData, engagement_type: e.target.value})} className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white min-w-[140px]">
                                                <option value="essai">Essai</option>
                                                <option value="regulier">Régulier (Actif)</option>
                                                <option value="ponctuel">Ponctuel (Occasionnel)</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Classification Rubrique */}
                                    <div className="space-y-4 pt-2">
                                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b pb-1">ORGANISATION DE LA BOUTIQUE</h4>
                                        <div className="flex flex-col md:flex-row gap-4">
                                            <div className="flex-1">
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Rubrique</label>
                                                <input 
                                                    type="text" 
                                                    value={formData.category} 
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        const existingOffer = offers.find(o => o.category?.toLowerCase() === val.toLowerCase());
                                                        const displayOrder = existingOffer?.category_display_order ? existingOffer.category_display_order.toString() : formData.category_display_order;
                                                        setFormData({
                                                            ...formData, 
                                                            category: val,
                                                            category_display_order: displayOrder
                                                        });
                                                    }} 
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
                                                    list="categories-list"
                                                    placeholder="ex: Abonnement, Formation..."
                                                />
                                                <datalist id="categories-list">
                                                    {existingCategories.map(cat => (
                                                        <option key={cat} value={cat} />
                                                    ))}
                                                </datalist>
                                            </div>
                                            
                                            <div className="w-full md:w-36">
                                                <label className="block text-sm font-medium text-slate-700 mb-1">N° de rubrique</label>
                                                <input type="number" value={formData.category_display_order} onChange={e => setFormData({...formData, category_display_order: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                                            </div>
                                            <div className="w-full md:w-36">
                                                <label className="block text-sm font-medium text-slate-700 mb-1">N° d'offre</label>
                                                <input type="number" value={formData.offer_display_order} onChange={e => setFormData({...formData, offer_display_order: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Contenu & crédits */}
                                <div className="space-y-4 pt-4">
                                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b pb-1">Contenu & crédits</h4>
                                    
                                    {/* Nombre de crédits inclus */}
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <span className={`text-sm font-medium ${(showErrors && !formData.is_unlimited && !formData.classes_included) ? 'text-red-500' : 'text-slate-700'}`}>
                                                Nombre de crédits inclus dans l'offre
                                            </span>
                                            <input 
                                                type="number" 
                                                step="any" 
                                                placeholder="Nombre" 
                                                disabled={formData.is_unlimited} 
                                                value={formData.classes_included} 
                                                onChange={e => setFormData({...formData, classes_included: e.target.value})} 
                                                className={`w-28 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:bg-slate-50 bg-white ${(showErrors && !formData.is_unlimited && !formData.classes_included) ? 'border-red-300 bg-red-50' : 'border-gray-300'} [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield]`} 
                                            />
                                            <span className="text-xs text-slate-400 italic">
                                                (saisie manuelle ou somme des crédits de chaque type d'activités)
                                            </span>
                                        </div>
                                        <div className="pt-0.5">
                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <input 
                                                    type="checkbox" 
                                                    checked={formData.is_unlimited} 
                                                    onChange={e => setFormData({...formData, is_unlimited: e.target.checked, ...(e.target.checked ? {classes_included: ''} : {})})} 
                                                    className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500" 
                                                />
                                                <span className="text-sm font-medium text-slate-700">Crédits illimités</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Grille d'activités et encart explicatif */}
                                    {tenant?.activity_types && tenant.activity_types.length > 0 && (
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
                                            {/* Colonnes d'activités */}
                                            <div className="lg:col-span-7 grid grid-cols-2 gap-4 items-start">
                                                {/* Colonne 1: Types d'activités autorisés */}
                                                <div>
                                                    <div className="text-sm font-medium text-slate-700 mb-3">
                                                        Type d'activités autorisés <span className="font-normal text-slate-500">(<u>optionnel</u>)</span>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {tenant.activity_types.map(act => {
                                                            const isChecked = formData.allowed_activities?.includes(act);
                                                            return (
                                                                <div key={`chk-${act}`} className="h-9 flex items-center">
                                                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={isChecked} 
                                                                            onChange={e => handleActivityCheckboxChange(act, e.target.checked)} 
                                                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" 
                                                                        />
                                                                        <span className="text-sm text-slate-700 font-medium">{act}</span>
                                                                    </label>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Colonne 2: Nombre de crédits par type d'activité */}
                                                <div>
                                                    <div className="text-sm font-medium text-slate-700 mb-3">
                                                        Nombre de crédits par type d'activité <span className="font-normal text-slate-500">(<u>optionnel</u>)</span>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {tenant.activity_types.map(act => {
                                                            const isChecked = formData.allowed_activities?.includes(act);
                                                            return (
                                                                <div key={`val-${act}`} className="h-9 flex items-center">
                                                                    <input 
                                                                        type="number"
                                                                        disabled={!isChecked || formData.is_unlimited}
                                                                        value={formData.activity_credits[act] || ""}
                                                                        onChange={e => handleActivityCreditChange(act, e.target.value)}
                                                                        className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-center bg-white disabled:bg-slate-50 disabled:text-slate-400"
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Encart explicatif à droite */}
                                            <div className="lg:col-span-5 bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl p-5 self-stretch flex items-center">
                                                <p className="text-xs text-slate-600 leading-relaxed font-normal italic">
                                                    Vous pouvez créer des offres par activité ou des offres multi-pack avec un nombre de crédit dédié à chaque activité sélectionnée.<br /><br />
                                                    Si aucune activité n'est renseignée, alors l'offre donne accès à toutes les séances programmées.<br /><br />
                                                    Si des activités sont sélectionnées mais aucun crédit associé, l'offre donne accès uniquement aux activités renseignées dans la limite du crédit global de l'offre.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Plafond de crédit périodique */}
                                    <div className="pt-4 border-t border-slate-100">
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Plafond de crédit périodique <span className="font-normal text-slate-500">(<u>optionnel</u>)</span>
                                        </label>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <input type="number" placeholder="Nombre" value={formData.limit_amount} onChange={e => setFormData({...formData, limit_amount: e.target.value})} className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield] bg-white" />
                                            <span className="text-sm text-slate-500">par</span>
                                            <select value={formData.limit_period} onChange={e => setFormData({...formData, limit_period: e.target.value})} className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                                                <option value="/semaine">semaine</option>
                                                <option value="/mois">mois</option>
                                                <option value="/bimestre">bimestre</option>
                                                <option value="/trimestre">trimestre</option>
                                                <option value="/an">an</option>
                                            </select>
                                            <label className="flex items-center gap-2 cursor-pointer ml-2 select-none">
                                                <input type="checkbox" checked={formData.limit_rollover} onChange={e => setFormData({...formData, limit_rollover: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500" />
                                                <span className="text-xs text-slate-600">Autoriser le report des crédits non consommés sur la période suivante</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Durée de validité */}
                                 <div className="space-y-4 pt-4">
                                     <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b pb-1">Durée de validité</h4>
                                     <div>
                                         <label className={`block text-sm font-medium mb-1.5 ${(showErrors && !formData.is_validity_unlimited && !formData.deadline_date && !formData.validity_duration) ? 'text-red-500' : 'text-slate-700'}`}>
                                             Durée de validité *
                                         </label>
                                         <div className="flex flex-wrap items-center gap-3">
                                             <div className="flex items-center gap-2">
                                                 <input type="number" placeholder="Nombre" disabled={formData.is_validity_unlimited} value={formData.validity_duration} onChange={e => setFormData({...formData, validity_duration: e.target.value})} className={`w-20 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:bg-gray-100 ${(showErrors && !formData.is_validity_unlimited && !formData.deadline_date && !formData.validity_duration) ? 'border-red-300 bg-red-50' : 'border-gray-300'} [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield]`} />
                                                 <select disabled={formData.is_validity_unlimited} value={formData.validity_unit} onChange={e => setFormData({...formData, validity_unit: e.target.value as any})} className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:bg-gray-100 bg-white">
                                                     <option value="months">mois</option>
                                                     <option value="weeks">semaine</option>
                                                     <option value="days">jour</option>
                                                 </select>
                                             </div>
                                             <span className="text-xs text-slate-400 font-normal"><u>ou</u> échéance au</span>
                                             <input type="date" disabled={formData.is_validity_unlimited} value={formData.deadline_date} onChange={e => setFormData({...formData, deadline_date: e.target.value})} className="w-36 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:bg-gray-100" />
                                             <span className="text-xs text-slate-400 font-normal"><u>ou</u></span>
                                             <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                                                 <input type="checkbox" checked={formData.is_validity_unlimited} onChange={e => setFormData({...formData, is_validity_unlimited: e.target.checked, ...(e.target.checked ? {validity_duration: '', deadline_date: ''} : {})})} className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500" />
                                                 <span className="text-sm font-medium text-slate-700">Durée illimitée</span>
                                             </label>
                                         </div>
                                     </div>
                                 </div>
                                 {/* Tarification */}
                                 {(() => {
                                     const isPricingValid = formData.featured_pricing === 'lump_sum' 
                                         ? !!formData.price_lump_sum 
                                         : (!!formData.price_recurring && (formData.is_recurring_unlimited || !!formData.recurring_count));

                                     return (
                                         <div className="space-y-4 pt-4">
                                             <h4 className={`text-xs font-semibold uppercase tracking-wider border-b pb-1 flex items-baseline gap-2 ${(showErrors && !isPricingValid) ? 'text-red-500 border-red-200' : 'text-slate-400'}`}>
                                                 Tarification *
                                                 <span className="normal-case italic font-normal text-[10px] tracking-normal text-slate-400">(Vous pouvez renseigner les deux modes de paiement, puis sélectionner le tarif que vous souhaitez mettre en avant dans la boutique)</span>
                                             </h4>
                                             <div className="flex flex-col gap-4">
                                                 {/* Paiement Unique */}
                                                 <div 
                                                      className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${formData.featured_pricing === 'lump_sum' ? (showErrors && !formData.price_lump_sum ? 'border-red-300 bg-red-50' : 'border-blue-600 bg-blue-50') : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                                      onClick={() => setFormData({...formData, featured_pricing: 'lump_sum'})}
                                                  >
                                                      <div className="space-y-3">
                                                          <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                                                              <span className="font-semibold text-slate-900">Paiement unique</span>
                                                              <div className="flex items-center gap-2 flex-1 justify-end min-w-[200px]">
                                                                  <label className="text-xs text-slate-500 whitespace-nowrap">Montant TTC (€) :</label>
                                                                  <input type="number" step="0.01" value={formData.price_lump_sum} onChange={e => setFormData({...formData, price_lump_sum: e.target.value})} className={`w-32 px-3 py-2 border rounded-lg focus:border-slate-400 outline-none bg-white ${(showErrors && formData.featured_pricing === 'lump_sum' && !formData.price_lump_sum) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} placeholder="0.00" />
                                                              </div>
                                                          </div>
                                                          <div className="flex justify-start">
                                                              <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-slate-500 font-normal" onClick={e => e.stopPropagation()}>
                                                                  <input 
                                                                      type="checkbox" 
                                                                      checked={formData.featured_pricing === 'lump_sum'} 
                                                                      onChange={() => setFormData({...formData, featured_pricing: 'lump_sum'})} 
                                                                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-0 focus:ring-offset-0" 
                                                                  />
                                                                  <span>Tarif à mettre en avant</span>
                                                              </label>
                                                          </div>
                                                      </div>
                                                  </div>

                                                 {/* Abonnement */}
                                                 <div 
                                                     className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${formData.featured_pricing === 'recurring' ? (showErrors && (!formData.price_recurring || (!formData.is_recurring_unlimited && !formData.recurring_count)) ? 'border-red-300 bg-red-50' : 'border-amber-500 bg-amber-50') : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                                     onClick={() => setFormData({...formData, featured_pricing: 'recurring'})}
                                                 >
                                                      <div className="space-y-4">
                                                          <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                                                              <span className="font-semibold text-slate-900">Paiement échelonné / Abonnement</span>
                                                              <div className="flex items-center gap-2 flex-1 justify-end min-w-[200px]">
                                                                  <label className="text-xs text-slate-500 whitespace-nowrap">Montant de l'échéance (€) :</label>
                                                                  <input type="number" step="0.01" value={formData.price_recurring} onChange={e => setFormData({...formData, price_recurring: e.target.value})} className={`w-32 px-3 py-2 border rounded-lg focus:border-slate-400 outline-none bg-white text-sm ${(showErrors && formData.featured_pricing === 'recurring' && !formData.price_recurring) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} placeholder="0.00" />
                                                              </div>
                                                          </div>
                                                          
                                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 md:gap-y-0 md:divide-x md:divide-gray-200 pt-4 border-t border-gray-150">
                                                              {/* Colonne 1: Période */}
                                                              <div className="md:pr-6 space-y-3">
                                                                  <label className="flex items-center gap-2 cursor-pointer mb-2 font-semibold text-slate-800">
                                                                      <input 
                                                                          type="checkbox" 
                                                                          checked={formData.period !== 'seuil' && !formData.is_recurring_unlimited} 
                                                                          onChange={() => setFormData({
                                                                              ...formData,
                                                                              period: formData.period === 'seuil' ? 'mois' : formData.period,
                                                                              is_recurring_unlimited: false
                                                                          })} 
                                                                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-0 focus:ring-offset-0"
                                                                      />
                                                                      <span className="text-xs">Période</span>
                                                                  </label>
                                                                  <div className="space-y-3">
                                                                      <select 
                                                                          value={formData.period === 'seuil' ? 'mois' : formData.period} 
                                                                          onChange={e => setFormData({
                                                                              ...formData, 
                                                                              period: e.target.value,
                                                                              is_recurring_unlimited: false
                                                                          })} 
                                                                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:border-slate-400 outline-none bg-white text-xs"
                                                                      >
                                                                          <option value="semaine">semaine</option>
                                                                          <option value="mois">mois</option>
                                                                          <option value="bimestre">bimestre</option>
                                                                          <option value="trimestre">trimestre</option>
                                                                      </select>
                                                                      
                                                                      <div className="flex items-center justify-between gap-2">
                                                                          <label className="text-[10px] text-slate-500 whitespace-nowrap">Nombre d'échéances :</label>
                                                                          <input 
                                                                              type="number" 
                                                                              min="1" 
                                                                              value={(formData.is_recurring_unlimited || formData.period === 'seuil') ? "" : formData.recurring_count} 
                                                                              onChange={e => setFormData({
                                                                                  ...formData, 
                                                                                  recurring_count: e.target.value,
                                                                                  period: formData.period === 'seuil' ? 'mois' : formData.period,
                                                                                  is_recurring_unlimited: false
                                                                              })} 
                                                                              className="w-16 px-2 py-1 border border-gray-300 rounded-lg focus:border-slate-400 outline-none text-xs text-center bg-white" 
                                                                              placeholder="ex: 12" 
                                                                          />
                                                                      </div>
                                                                  </div>
                                                              </div>

                                                              {/* Colonne 2: Seuil de consommation */}
                                                              <div className="md:px-6 space-y-3">
                                                                  <label className="flex items-center gap-2 cursor-pointer mb-2 font-semibold text-slate-800">
                                                                      <input 
                                                                          type="checkbox" 
                                                                          checked={formData.period === 'seuil'} 
                                                                          onChange={() => setFormData({
                                                                              ...formData,
                                                                              period: 'seuil',
                                                                              is_recurring_unlimited: false,
                                                                              trigger_consumption_percent: formData.trigger_consumption_percent || '20, 40, 60'
                                                                          })} 
                                                                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-0 focus:ring-offset-0"
                                                                      />
                                                                      <span className="text-xs">Seuil de consommation</span>
                                                                  </label>
                                                                  <div>
                                                                      <label className="block text-[10px] text-slate-500 mb-1">Paliers de seuils :</label>
                                                                      <input 
                                                                          type="text" 
                                                                          value={formData.trigger_consumption_percent} 
                                                                          onChange={e => setFormData({
                                                                              ...formData, 
                                                                              trigger_consumption_percent: e.target.value,
                                                                              period: 'seuil',
                                                                              is_recurring_unlimited: false
                                                                          })} 
                                                                          className="w-full px-2 py-1 border border-gray-300 rounded-lg focus:border-slate-400 outline-none bg-white text-xs"
                                                                          placeholder="ex: 20, 40, 60"
                                                                      />
                                                                      <span className="block text-[9px] text-slate-400 mt-1 leading-tight">
                                                                          (saisir les paliers de seuil séparés par une virgule)
                                                                      </span>
                                                                  </div>
                                                              </div>

                                                              {/* Colonne 3: Période illimitée */}
                                                              <div className="md:pl-6 space-y-3">
                                                                  <label className="flex items-center gap-2 cursor-pointer mb-2 font-semibold text-slate-800">
                                                                      <input 
                                                                          type="checkbox" 
                                                                          checked={formData.is_recurring_unlimited} 
                                                                          onChange={() => setFormData({
                                                                              ...formData,
                                                                              period: formData.period === 'seuil' ? 'mois' : formData.period,
                                                                              is_recurring_unlimited: true
                                                                          })} 
                                                                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-0 focus:ring-offset-0"
                                                                      />
                                                                      <span className="text-xs">Période illimitée</span>
                                                                  </label>
                                                                  <div className="text-[10px] text-slate-400 leading-relaxed pt-1">
                                                                      Les échéances de paiement continuent indéfiniment selon la période sélectionnée.
                                                                  </div>
                                                              </div>
                                                          </div>
                                                          
                                                          <div className="flex justify-start pt-3 border-t border-gray-150">
                                                              <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-slate-500 font-normal" onClick={e => e.stopPropagation()}>
                                                                  <input 
                                                                      type="checkbox" 
                                                                      checked={formData.featured_pricing === 'recurring'} 
                                                                      onChange={() => setFormData({...formData, featured_pricing: 'recurring'})} 
                                                                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-0 focus:ring-offset-0" 
                                                                  />
                                                                  <span>Tarif à mettre en avant</span>
                                                              </label>
                                                          </div>
                                                      </div>
                                                  </div>
                                             </div>
                                         </div>
                                     );
                                 })()}
                                {/* Statut de l'offre */}
                                <div className="pt-6 border-t border-gray-150">
                                    <div className="w-80">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Statut de l'offre</label>
                                        <select value={formData.is_active ? "true" : "false"} onChange={e => setFormData({...formData, is_active: e.target.value === "true"})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                                            <option value="true">Active (Visible dans la boutique)</option>
                                            <option value="false">Inactive (Masquée)</option>
                                        </select>
                                    </div>
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

            <ConfirmModal
                isOpen={!!deleteConfirmId}
                title="Confirmer la suppression"
                message="Cette offre sera définitivement retirée de votre catalogue. Cette action est irréversible."
                type="danger"
                confirmLabel="Supprimer"
                cancelLabel="Annuler"
                onConfirm={() => handleDelete(deleteConfirmId!)}
                onCancel={() => setDeleteConfirmId(null)}
            />
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

