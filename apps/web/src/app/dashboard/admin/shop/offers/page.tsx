"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

interface Offer {
    id: string;
    offer_code: string;
    name: string;
    description: string | null;
    price_lump_sum_cents: number | null;
    price_recurring_cents: number | null;
    recurring_count: number | null;
    featured_pricing: string;
    period: string | null;
    classes_included: number | null;
    is_unlimited: boolean;
    validity_days: number | null;
    validity_unit: string;
    deadline_date: string | null;
    is_validity_unlimited?: boolean;
    is_unique: boolean;
    is_active: boolean;
    category: string | null;
    display_order: number;
}

const emptyForm = {
    offer_code: "",
    name: "",
    description: "",
    price_lump_sum_cents: "",
    price_recurring_cents: "",
    recurring_count: "",
    featured_pricing: "lump_sum",
    period: "",
    classes_included: "",
    is_unlimited: false,
    validity_days: "",
    validity_unit: "days",
    deadline_date: "",
    is_validity_unlimited: false,
    is_unique: false,
    is_active: true,
    category: "",
    display_order: "0",
};

export default function AdminOffersPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [formData, setFormData] = useState({ ...emptyForm });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [formError, setFormError] = useState("");
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("active");

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userData, offersData] = await Promise.all([
                    api.getCurrentUser(),
                    api.getOffers(true)
                ]);

                if (userData.role !== 'owner' && userData.role !== 'manager') {
                    router.push('/dashboard');
                    return;
                }

                setUser(userData);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");

        // Validation: exactly one of validity_days or deadline_date
        const hasValidityDays = formData.validity_days !== "";
        const hasDeadlineDate = formData.deadline_date !== "";

        if (!hasValidityDays && !hasDeadlineDate) {
            setFormError("Veuillez renseigner soit la durée de validité, soit la date d'échéance.");
            return;
        }
        if (hasValidityDays && hasDeadlineDate) {
            setFormError("Vous ne pouvez pas renseigner à la fois la durée de validité et la date d'échéance. Choisissez l'un des deux.");
            return;
        }

        try {
            const offerData: Record<string, any> = {
                offer_code: formData.offer_code,
                name: formData.name,
                description: formData.description || null,
                price_lump_sum_cents: formData.price_lump_sum_cents ? parseInt(formData.price_lump_sum_cents) : null,
                price_recurring_cents: formData.price_recurring_cents ? parseInt(formData.price_recurring_cents) : null,
                recurring_count: formData.recurring_count ? parseInt(formData.recurring_count) : null,
                featured_pricing: formData.featured_pricing,
                period: formData.period || null,
                classes_included: formData.is_unlimited ? null : (formData.classes_included ? parseInt(formData.classes_included) : null),
                is_unlimited: formData.is_unlimited,
                validity_days: hasValidityDays ? parseInt(formData.validity_days) : null,
                validity_unit: formData.validity_unit,
                deadline_date: hasDeadlineDate ? formData.deadline_date : null,
                is_validity_unlimited: formData.is_validity_unlimited,
                is_unique: formData.is_unique,
                is_active: formData.is_active,
                category: formData.category || null,
                display_order: parseInt(formData.display_order || "0"),
            };

            if (editingId) {
                await api.updateOffer(editingId, offerData);
            } else {
                await api.createOffer(offerData as any);
            }

            const updatedOffers = await api.getOffers(true);
            setOffers(updatedOffers);
            resetForm();
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Erreur lors de la sauvegarde');
        }
    };

    const handleEdit = (offer: Offer) => {
        setFormData({
            offer_code: offer.offer_code || "",
            name: offer.name,
            description: offer.description || "",
            price_lump_sum_cents: offer.price_lump_sum_cents?.toString() || "",
            price_recurring_cents: offer.price_recurring_cents?.toString() || "",
            recurring_count: offer.recurring_count?.toString() || "",
            featured_pricing: offer.featured_pricing || "lump_sum",
            period: offer.period || "",
            classes_included: offer.classes_included?.toString() || "",
            is_unlimited: offer.is_unlimited,
            validity_days: offer.validity_days?.toString() || "",
            validity_unit: offer.validity_unit || "days",
            deadline_date: offer.deadline_date || "",
            is_validity_unlimited: offer.is_validity_unlimited || false,
            is_unique: offer.is_unique,
            is_active: offer.is_active,
            category: offer.category || "",
            display_order: (offer.display_order || 0).toString(),
        });
        setEditingId(offer.id);
        setShowForm(true);
        setFormError("");
    };

    const handleDelete = async (offerId: string) => {
        try {
            await api.deleteOffer(offerId);
            const updatedOffers = await api.getOffers(true);
            setOffers(updatedOffers);
            setDeleteConfirmId(null);
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Erreur lors de la suppression');
        }
    };

    const resetForm = () => {
        setFormData({ ...emptyForm });
        setEditingId(null);
        setShowForm(false);
        setFormError("");
    };

    // Client-side filtering
    const filteredOffers = offers.filter((o) => {
        const matchesSearch = !searchTerm || 
            o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.offer_code.toLowerCase().includes(searchTerm.toLowerCase());
            
        const matchesStatus = statusFilter === "all" || 
            (statusFilter === "active" && o.is_active) ||
            (statusFilter === "inactive" && !o.is_active);
            
        return matchesSearch && matchesStatus;
    });

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />

            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">🏷️ gestion des offres</h1>
                            <p className="text-[11px] font-medium text-slate-400 lowercase mt-1">
                                {offers.length} prestation{offers.length > 1 ? "s" : ""} disponible{offers.length > 1 ? "s" : ""}
                            </p>
                        </div>
                        <button
                            onClick={() => { setShowForm(true); setEditingId(null); setFormData({ ...emptyForm }); setFormError(""); }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            ➕ Nouveau
                        </button>
                    </div>

                    {/* Search & Filter */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                                <input
                                    type="text"
                                    placeholder="Rechercher une offre par nom ou code..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] font-medium text-slate-400 lowercase tracking-widest whitespace-nowrap">statut:</label>
                                <select 
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-slate-50 font-medium text-slate-700 min-w-[140px]"
                                >
                                    <option value="all">Toutes</option>
                                    <option value="active">Actives</option>
                                    <option value="inactive">Inactives</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Form (shown conditionally) */}
                    {showForm && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <h2 className="text-xl font-semibold text-slate-900 mb-4 tracking-tight">
                                {editingId ? "modifier l'offre" : "créer une nouvelle offre"}
                            </h2>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Row 1: Code + Intitulé */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Code offre *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.offer_code}
                                            onChange={(e) => setFormData({ ...formData, offer_code: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Ex: MENS-2024"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Intitulé de l&apos;offre *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Ex: Abonnement Mensuel"
                                        />
                                    </div>
                                </div>

                                {/* Row 1.5: Catégorie + Ordre */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Type d&apos;offre (Rubrique)
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.category}
                                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Ex: Yoga, Pilates, Forfait Annuel..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Ordre d&apos;affichage
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.display_order}
                                            onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>

                                {/* Row 2: Tarif */}
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Tarification</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                        {/* Tarif Unique */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-bold text-slate-900 border-l-4 border-blue-500 pl-2">
                                                    Tarif unique / en une fois
                                                </label>
                                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 cursor-pointer">
                                                    <input 
                                                        type="radio" 
                                                        name="featured" 
                                                        checked={formData.featured_pricing === "lump_sum"}
                                                        onChange={() => setFormData({ ...formData, featured_pricing: "lump_sum" })}
                                                        className="w-3 h-3 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    Mettre en avant
                                                </label>
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">€</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.price_lump_sum_cents ? (parseInt(formData.price_lump_sum_cents) / 100).toString() : ""}
                                                    onChange={(e) => setFormData({ ...formData, price_lump_sum_cents: e.target.value ? (parseFloat(e.target.value) * 100).toString() : "" })}
                                                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                                                    placeholder="Ex: 500"
                                                />
                                            </div>
                                        </div>

                                        {/* Tarif Récurrent */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-bold text-slate-900 border-l-4 border-emerald-500 pl-2">
                                                    Tarif récurrent ou facilités
                                                </label>
                                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 cursor-pointer">
                                                    <input 
                                                        type="radio" 
                                                        name="featured"
                                                        checked={formData.featured_pricing === "recurring"}
                                                        onChange={() => setFormData({ ...formData, featured_pricing: "recurring" })}
                                                        className="w-3 h-3 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    Mettre en avant
                                                </label>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">€</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={formData.price_recurring_cents ? (parseInt(formData.price_recurring_cents) / 100).toString() : ""}
                                                        onChange={(e) => setFormData({ ...formData, price_recurring_cents: e.target.value ? (parseFloat(e.target.value) * 100).toString() : "" })}
                                                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                                                        placeholder="50"
                                                    />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={formData.period}
                                                    onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                                                    placeholder="Période (ex: /mois)"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Nombre d&apos;échéances (facultatif)</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={formData.recurring_count}
                                                    onChange={(e) => setFormData({ ...formData, recurring_count: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                                                    placeholder="Ex: 12"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 3: Crédits */}
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Crédits</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                Nombre de crédits {!formData.is_unlimited && "*"}
                                            </label>
                                            <input
                                                type="number"
                                                required={!formData.is_unlimited}
                                                min="1"
                                                value={formData.classes_included}
                                                onChange={(e) => setFormData({ ...formData, classes_included: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                placeholder="12"
                                                disabled={formData.is_unlimited}
                                            />
                                        </div>
                                        <div className="flex items-center pb-2">
                                            <label className="flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.is_unlimited}
                                                    onChange={(e) => setFormData({ ...formData, is_unlimited: e.target.checked, classes_included: e.target.checked ? "" : formData.classes_included })}
                                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                                <span className="ml-2 text-sm font-medium text-slate-700">
                                                    ♾️ Illimité
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 4: Validité */}
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                        Validité <span className="text-xs text-slate-400 normal-case">(renseignez l&apos;un des deux, ou cochez illimité)</span>
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                                         <div>
                                             <label className="block text-sm font-medium text-slate-700 mb-1">
                                                 Durée de validité
                                             </label>
                                             <div className="flex gap-2">
                                                 <input
                                                     type="number"
                                                     min="1"
                                                     value={formData.validity_days}
                                                     onChange={(e) => setFormData({ ...formData, validity_days: e.target.value, deadline_date: e.target.value ? "" : formData.deadline_date })}
                                                     className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${formData.deadline_date || formData.is_validity_unlimited ? "border-gray-200 bg-gray-100 cursor-not-allowed" : "border-gray-300"}`}
                                                     placeholder="Ex: 1, 3, 12..."
                                                     disabled={!!formData.deadline_date || formData.is_validity_unlimited}
                                                 />
                                                 <select
                                                     value={formData.validity_unit}
                                                     onChange={(e) => setFormData({ ...formData, validity_unit: e.target.value })}
                                                     disabled={!!formData.deadline_date || formData.is_validity_unlimited}
                                                     className={`w-24 px-2 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${formData.deadline_date || formData.is_validity_unlimited ? "border-gray-200 bg-gray-100 cursor-not-allowed" : "border-gray-300"}`}
                                                 >
                                                     <option value="days">Jours</option>
                                                     <option value="months">Mois</option>
                                                 </select>
                                             </div>
                                         </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                Date d&apos;échéance
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.deadline_date}
                                                onChange={(e) => setFormData({ ...formData, deadline_date: e.target.value, validity_days: e.target.value ? "" : formData.validity_days })}
                                                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${formData.validity_days || formData.is_validity_unlimited ? "border-gray-200 bg-gray-100 cursor-not-allowed" : "border-gray-300"}`}
                                                disabled={!!formData.validity_days || formData.is_validity_unlimited}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center">
                                        <label className="flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_validity_unlimited}
                                                onChange={(e) => setFormData({ ...formData, is_validity_unlimited: e.target.checked, validity_days: e.target.checked ? "" : formData.validity_days, deadline_date: e.target.checked ? "" : formData.deadline_date })}
                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <span className="ml-2 text-sm font-medium text-slate-700">
                                                ♾️ Durée de validité illimitée
                                            </span>
                                        </label>
                                    </div>
                                </div>

                                {/* Row 5: Options */}
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Options</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex items-center">
                                            <label className="flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.is_unique}
                                                    onChange={(e) => setFormData({ ...formData, is_unique: e.target.checked })}
                                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                                <span className="ml-2 text-sm font-medium text-slate-700">
                                                    🔒 Offre unique <span className="text-xs text-slate-400">(une seule commande par utilisateur)</span>
                                                </span>
                                            </label>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                Statut
                                            </label>
                                            <select
                                                value={formData.is_active ? "true" : "false"}
                                                onChange={(e) => setFormData({ ...formData, is_active: e.target.value === "true" })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="true">Active</option>
                                                <option value="false">Inactive</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        rows={2}
                                        placeholder="Description de l'offre..."
                                    />
                                </div>

                                {/* Error */}
                                {formError && (
                                    <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm font-medium">
                                        {formError}
                                    </div>
                                )}

                                {/* Submit */}
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        className="px-6 py-2 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all active:scale-95 shadow-md shadow-slate-200 text-[11px] lowercase"
                                    >
                                        {editingId ? "mettre à jour" : "créer l'offre"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="px-6 py-2 bg-gray-200 text-slate-900 rounded-lg font-bold hover:bg-gray-300 transition-colors"
                                    >
                                        Annuler
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Offers Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">code</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">offre</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">tarif</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">crédits</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">validité</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">type</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">statut</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest text-center">ordre</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-medium text-slate-400 lowercase tracking-widest">actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredOffers.map((offer) => (
                                        <tr key={offer.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-mono rounded">
                                                    {offer.offer_code}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-medium text-slate-900">{offer.name}</div>
                                                    {offer.is_unique && <span title="Offre unique" className="text-xs">🔒</span>}
                                                </div>
                                                {offer.description && (
                                                    <div className="text-xs text-slate-500 truncate max-w-[200px]">{offer.description}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className="text-sm font-bold text-slate-900">
                                                    {offer.featured_pricing === "recurring" && offer.price_recurring_cents ? (
                                                        <>
                                                            {(offer.price_recurring_cents / 100).toFixed(2)}€ {offer.period}
                                                            {offer.recurring_count && <span className="text-[10px] block text-slate-400 font-normal">pendant {offer.recurring_count} mois</span>}
                                                        </>
                                                    ) : (
                                                        <>
                                                            {offer.price_lump_sum_cents ? (offer.price_lump_sum_cents / 100).toFixed(2) : "0.00"}€
                                                        </>
                                                    )}
                                                </div>
                                                {((offer.featured_pricing === "recurring" && offer.price_lump_sum_cents) || (offer.featured_pricing === "lump_sum" && offer.price_recurring_cents)) && (
                                                    <div className="text-[10px] text-slate-400 italic">
                                                        ou {offer.featured_pricing === "recurring" 
                                                            ? `${(offer.price_lump_sum_cents! / 100).toFixed(2)}€ en 1x` 
                                                            : `${(offer.price_recurring_cents! / 100).toFixed(2)}€ ${offer.period}`
                                                        }
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className="text-sm font-bold text-slate-900">
                                                    {offer.is_unlimited ? (
                                                        <span className="font-semibold text-blue-600">♾️ Illimité</span>
                                                    ) : (
                                                        `${offer.classes_included} crédits`
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className="text-sm text-slate-500">
                                                    {offer.is_validity_unlimited ? (
                                                        <span className="font-semibold text-purple-600">♾️ Illimité</span>
                                                    ) : offer.deadline_date ? (
                                                        `Jusqu'au ${new Date(offer.deadline_date).toLocaleDateString()}`
                                                    ) : (
                                                        offer.validity_days ? `${offer.validity_days} ${offer.validity_unit === 'months' ? 'mois' : 'jours'}` : "-"
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                {offer.category ? (
                                                    <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded border border-blue-100">
                                                        {offer.category}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 text-xs italic">Non défini</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-[10px] font-medium rounded-full lowercase tracking-tight ${offer.is_active
                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                                    }`}>
                                                    {offer.is_active ? 'active' : 'inactive'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap text-center">
                                                <span className="text-sm font-medium text-slate-600">
                                                    {offer.display_order}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap text-lg space-x-3 text-center">
                                                <button
                                                    onClick={() => handleEdit(offer)}
                                                    className="text-blue-600 hover:text-blue-800 transition-colors"
                                                    title="Modifier l'offre"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirmId(offer.id)}
                                                    className="text-red-600 hover:text-red-800 transition-colors"
                                                    title="Supprimer l'offre"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {offers.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                                                Aucune offre créée pour le moment
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
                        <h3 className="text-lg font-semibold text-slate-900 mb-2 tracking-tight">confirmer la suppression</h3>
                        <p className="text-slate-600 mb-4">
                            Êtes-vous sûr de vouloir supprimer cette offre ? Cette action est irréversible.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-4 py-2 bg-gray-200 text-slate-900 rounded-lg font-medium hover:bg-gray-300"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirmId)}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
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
