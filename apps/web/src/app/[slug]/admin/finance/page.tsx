"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, FinanceCategory, FinanceAccount, FinanceTransaction, FinanceDashboard, User } from "@/lib/api";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Sidebar from "@/components/Sidebar";

export default function TreasuryPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params?.slug as string;

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [dashboard, setDashboard] = useState<FinanceDashboard | null>(null);
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
    const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
    const [activeTab, setActiveTab] = useState<"dashboard" | "journal" | "categories" | "accounts">("dashboard");
    const [searchTerm, setSearchTerm] = useState("");

    // Modals
    const [isTransModalOpen, setIsTransModalOpen] = useState(false);
    const [isCatModalOpen, setIsCatModalOpen] = useState(false);
    const [editingCat, setEditingCat] = useState<FinanceCategory | null>(null);
    const [isAccModalOpen, setIsAccModalOpen] = useState(false);
    const [editingAcc, setEditingAcc] = useState<FinanceAccount | null>(null);

    // Form states
    const [newTrans, setNewTrans] = useState({
        date: format(new Date(), "yyyy-MM-dd"),
        type: "expense",
        category_id: "",
        amount_cents: 0,
        vat_rate: 20,
        description: "",
        payment_method: "other",
        account_id: "",
        is_recurring: false,
        frequency: "monthly",
        recurring_count: 12
    });

    const [newAcc, setNewAcc] = useState<any>({
        name: "",
        type: "other",
        color: "#64748b"
    });

    const [newCat, setNewCat] = useState<any>({
        name: "",
        type: "expense",
        color: "#3b82f6"
    });

    useEffect(() => {
        if (slug) {
            const init = async () => {
                try {
                    const userData = await api.getCurrentUser();
                    if (userData.role !== 'owner' && userData.role !== 'manager') {
                        router.push(`/${slug}/home`);
                        return;
                    }
                    setUser(userData);
                    await refreshData();
                } catch (err) {
                    console.error("Auth error:", err);
                    router.push(`/${slug}/login`);
                } finally {
                    setLoading(false);
                }
            };
            init();
        }
    }, [slug, router]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (user) {
                api.getFinanceTransactions({ search: searchTerm }).then(setTransactions);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [searchTerm, user]);

    const refreshData = async () => {
        try {
            const [db, cats, accs, trans] = await Promise.all([
                api.getFinanceDashboard(30),
                api.getFinanceCategories(),
                api.getFinanceAccounts(),
                api.getFinanceTransactions({ search: searchTerm })
            ]);
            setDashboard(db);
            setCategories(cats);
            setAccounts(accs);
            setTransactions(trans);
        } catch (error) {
            console.error("Error loading treasury data:", error);
        }
    };

    const handleCreateTrans = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Calculer la TVA auto si montant > 0
            const amount_cents = Math.round(newTrans.amount_cents * 100);
            const vat_rate = Number(newTrans.vat_rate);
            const vat_amount_cents = vat_rate > 0 ? Math.round(amount_cents * (vat_rate / (100 + vat_rate))) : 0;

            await api.createFinanceTransaction({
                ...newTrans,
                amount_cents,
                vat_amount_cents,
                vat_rate
            });
            setIsTransModalOpen(false);
            refreshData();
            setNewTrans({ ...newTrans, amount_cents: 0, description: "" });
        } catch (error) {
            alert("Erreur lors de la création de l'opération");
        }
    };

    const openCatModal = (cat: FinanceCategory | null = null) => {
        setEditingCat(cat);
        if (cat) {
            setNewCat({ name: cat.name, type: cat.type, color: cat.color });
        } else {
            setNewCat({ name: "", type: "expense", color: "#3b82f6" });
        }
        setIsCatModalOpen(true);
    };

    const handleCreateOrUpdateCat = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingCat) {
                await api.updateFinanceCategory(editingCat.id, newCat);
            } else {
                await api.createFinanceCategory(newCat);
            }
            setIsCatModalOpen(false);
            refreshData();
            setNewCat({ name: "", type: "expense", color: "#3b82f6" });
            setEditingCat(null);
        } catch (error) {
            alert("Erreur lors de l'enregistrement de la catégorie");
        }
    };

    const handleSeedCategories = async () => {
        try {
            await api.seedFinanceCategories();
            refreshData();
        } catch (error) {
            alert("Erreur lors de l'initialisation des catégories");
        }
    };

    const openAccModal = (acc: FinanceAccount | null = null) => {
        setEditingAcc(acc);
        if (acc) {
            setNewAcc({ name: acc.name, type: acc.type, color: acc.color });
        } else {
            setNewAcc({ name: "", type: "other", color: "#64748b" });
        }
        setIsAccModalOpen(true);
    };

    const handleCreateOrUpdateAcc = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingAcc) {
                await api.updateFinanceAccount(editingAcc.id, newAcc);
            } else {
                await api.createFinanceAccount(newAcc);
            }
            setIsAccModalOpen(false);
            refreshData();
            setNewAcc({ name: "", type: "other", color: "#64748b" });
            setEditingAcc(null);
        } catch (error) {
            alert("Erreur lors de l'enregistrement du compte");
        }
    };

    const formatCurrency = (cents: number) => {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
    };

    if (loading) {
        return <div className="p-8 text-center text-slate-500 bg-slate-50 min-h-screen">Chargement du portefeuille...</div>;
    }

    return (
        <>
            <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            <Sidebar user={user} />
            
            <main className="flex-1 p-8 overflow-y-auto">
                <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-2">
                        <div>
                            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">💰 Portefeuille</h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Suivi des flux de caisse et pilotage de votre activité.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => setIsTransModalOpen(true)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-sm text-sm active:scale-95"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Ajouter une opération
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all font-medium shadow-sm text-sm active:scale-95">
                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Exporter
                            </button>
                        </div>
                    </div>

                    {/* Tabs Navigation (Moved up) */}
                    <div className="flex items-center border-b border-slate-200 mb-6">
                        <button 
                            onClick={() => setActiveTab("dashboard")}
                            className={`px-8 py-4 text-sm font-semibold transition-all border-b-2 ${activeTab === "dashboard" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                        >
                            📊 Tableau de bord
                        </button>
                        <button 
                            onClick={() => setActiveTab("journal")}
                            className={`px-8 py-4 text-sm font-semibold transition-all border-b-2 ${activeTab === "journal" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                        >
                            📓 Journal de caisse
                        </button>
                        <button 
                            onClick={() => setActiveTab("categories")}
                            className={`px-8 py-4 text-sm font-semibold transition-all border-b-2 ${activeTab === "categories" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                        >
                            🏷️ Catégories
                        </button>
                        <button 
                            onClick={() => setActiveTab("accounts")}
                            className={`px-8 py-4 text-sm font-semibold transition-all border-b-2 ${activeTab === "accounts" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                        >
                            🏦 Comptes / Banques
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                        {activeTab === "dashboard" ? (
                            <div className="space-y-8">
                                {/* Stats Summary */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm transition-all hover:shadow-md">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Recettes (30j)</p>
                                        <p className="text-3xl font-semibold text-emerald-600">{formatCurrency(dashboard?.total_income_cents || 0)}</p>
                                        <div className="mt-4 flex items-center gap-2 text-[10px] text-emerald-600 font-bold bg-emerald-50 w-fit px-2 py-0.5 rounded-full uppercase tracking-tight">
                                            ↑ Encaissé
                                        </div>
                                    </div>
                                    <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm transition-all hover:shadow-md">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Dépenses (30j)</p>
                                        <p className="text-3xl font-semibold text-rose-600">{formatCurrency(dashboard?.total_expense_cents || 0)}</p>
                                        <div className="mt-4 flex items-center gap-2 text-[10px] text-rose-600 font-bold bg-rose-50 w-fit px-2 py-0.5 rounded-full uppercase tracking-tight">
                                            ↓ Sorties
                                        </div>
                                    </div>
                                    <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm transition-all hover:shadow-md">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Prévu (Échéancier)</p>
                                        <p className="text-3xl font-semibold text-blue-600">{formatCurrency(dashboard?.projected_income_cents || 0)}</p>
                                        <div className="mt-4 flex items-center gap-2 text-[10px] text-blue-600 font-bold bg-blue-50 w-fit px-2 py-0.5 rounded-full uppercase tracking-tight">
                                            📅 À venir
                                        </div>
                                    </div>
                                    <div className="bg-white p-6 rounded-[24px] border border-rose-100 shadow-md bg-rose-50/20 transition-all hover:bg-rose-50/40">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Impayés / Erreurs</p>
                                        <p className="text-3xl font-semibold text-rose-700">{formatCurrency(dashboard?.overdue_income_cents || 0)}</p>
                                        <div className="mt-4 flex items-center gap-2 text-[10px] text-rose-700 font-bold bg-rose-100 w-fit px-2 py-0.5 rounded-full uppercase tracking-tight">
                                            ⚠️ À régulariser
                                        </div>
                                    </div>
                                </div>

                                {/* Charts Preview */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                                        <h3 className="text-lg font-semibold text-slate-900 mb-6">Répartition des dépenses</h3>
                                        {dashboard?.expense_by_category.length === 0 ? (
                                            <div className="h-40 flex items-center justify-center text-slate-400 italic">Aucune donnée</div>
                                        ) : (
                                            <div className="space-y-4">
                                                {dashboard?.expense_by_category.map(item => (
                                                    <div key={item.category} className="space-y-1">
                                                        <div className="flex justify-between text-sm font-medium">
                                                            <span className="text-slate-700">{item.category}</span>
                                                            <span className="text-slate-500">{formatCurrency(item.amount)}</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full rounded-full" 
                                                                style={{ 
                                                                    width: `${(item.amount / dashboard.total_expense_cents) * 100}%`,
                                                                    backgroundColor: item.color || '#3b82f6'
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                                        <h3 className="text-lg font-semibold text-slate-900 mb-6">Sources de revenus</h3>
                                        {dashboard?.income_by_category.length === 0 ? (
                                            <div className="h-40 flex items-center justify-center text-slate-400 italic">Aucune donnée</div>
                                        ) : (
                                            <div className="space-y-4">
                                                {dashboard?.income_by_category.map(item => (
                                                    <div key={item.category} className="space-y-1">
                                                        <div className="flex justify-between text-sm font-medium">
                                                            <span className="text-slate-700">{item.category}</span>
                                                            <span className="text-slate-500">{formatCurrency(item.amount)}</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full rounded-full" 
                                                                style={{ 
                                                                    width: `${(item.amount / dashboard.total_income_cents) * 100}%`,
                                                                    backgroundColor: item.color || '#10b981'
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Projected Trend Section */}
                                {dashboard?.projected_trend && dashboard.projected_trend.length > 0 && (
                                    <div className="bg-white p-8 rounded-[32px] border border-blue-50 shadow-sm">
                                        <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
                                            <span className="text-blue-500">📈</span> 
                                            Prévisions de recettes (6 prochains mois)
                                        </h3>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                            {dashboard.projected_trend.map((item) => (
                                                <div key={item.month} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center transition-all hover:bg-white hover:shadow-md group">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1 group-hover:text-blue-500 transition-colors">
                                                        {format(new Date(item.month + "-01"), "MMM yyyy", { locale: fr })}
                                                    </p>
                                                    <p className="text-lg font-bold text-slate-900">{formatCurrency(item.amount)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : activeTab === "journal" ? (
                            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                                    {/* Search Bar */}
                                    <div className="flex items-center justify-between gap-4 p-8 border-b border-slate-100 bg-slate-50/30">
                                        <div className="relative flex-1 max-w-md">
                                            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <input 
                                                type="text"
                                                placeholder="Rechercher une opération..."
                                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                            />
                                        </div>
                                        <div className="text-xs text-slate-400 font-medium italic">
                                            Note: Les dépenses récurrentes futures n'apparaissent qu'à date échue.
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-100 border-b border-slate-200">
                                                <th className="py-3 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Date</th>
                                                <th className="py-3 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Description</th>
                                                <th className="py-3 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Catégorie</th>
                                                <th className="py-3 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">Compte</th>
                                                <th className="py-3 px-4 text-right text-xs font-medium text-slate-400 uppercase tracking-widest">Montant</th>
                                                <th className="py-3 px-4"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {transactions.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="py-20 text-center text-slate-400">Aucune opération enregistrée.</td>
                                                </tr>
                                            ) : (
                                                transactions.map((t) => (
                                                    <tr key={t.id} className="group hover:bg-slate-50/50 transition-colors">
                                                        <td className="py-4 px-4 text-sm text-slate-600">
                                                            {format(new Date(t.date), "dd/MM/yy")}
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <div className="text-sm font-medium text-slate-900">{t.description}</div>
                                                            {t.vat_amount_cents > 0 && (
                                                                <div className="text-[10px] text-slate-400">TVA {t.vat_rate}%: {formatCurrency(t.vat_amount_cents)}</div>
                                                            )}
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                                                {t.category_name || "Non catégorisé"}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <span className="text-[11px] text-slate-500 font-medium">
                                                                {t.account_name || t.payment_method || "Autre"}
                                                            </span>
                                                        </td>
                                                        <td className={`py-4 px-4 text-sm font-bold text-right ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                            {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount_cents)}
                                                        </td>
                                                        <td className="py-4 px-4 text-right">
                                                            <button 
                                                                onClick={() => {
                                                                    if(confirm("Supprimer cette opération ?")) {
                                                                        api.deleteFinanceTransaction(t.id).then(refreshData);
                                                                    }
                                                                }}
                                                                className="p-2 text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            ) : activeTab === "categories" ? (
                                <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                                    <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-8">
                                            <div className="space-y-8">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h3 className="font-semibold text-slate-900 text-lg">Configuration des catégories</h3>
                                                        <p className="text-sm text-slate-500">Organisez vos flux financiers par nature d'opération.</p>
                                                    </div>
                                                    <button 
                                                        onClick={() => openCatModal()}
                                                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium text-sm shadow-sm"
                                                    >
                                                        + Nouvelle catégorie
                                                    </button>
                                                </div>

                                                {categories.length === 0 ? (
                                                    <div className="py-16 flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
                                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-3xl mb-4">🏷️</div>
                                                        <p className="text-slate-900 font-semibold mb-1">Aucune catégorie configurée</p>
                                                        <p className="text-slate-500 text-sm mb-8 text-center max-w-xs">Commencez par initialiser notre liste standard pour gagner du temps.</p>
                                                        <button 
                                                            onClick={handleSeedCategories}
                                                            className="px-8 py-3 bg-white text-slate-900 border border-slate-200 rounded-2xl font-semibold hover:bg-slate-50 transition-all text-sm shadow-sm active:scale-95"
                                                        >
                                                            ✨ Initialiser les catégories standard
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                                        {/* Dépenses */}
                                                        <div className="space-y-4">
                                                            <div className="flex items-center gap-2 px-1">
                                                                <div className="w-2 h-2 rounded-full bg-rose-500" />
                                                                <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Dépenses (Sorties)</h4>
                                                            </div>
                                                            <div className="grid grid-cols-1 gap-3">
                                                                {categories.filter(c => c.type === 'expense').map(cat => (
                                                                    <div 
                                                                        key={cat.id} 
                                                                        onClick={() => openCatModal(cat)}
                                                                        className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm flex items-center justify-between group hover:border-slate-300 hover:shadow-md transition-all cursor-pointer"
                                                                    >
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="w-4 h-4 rounded-full shadow-inner" style={{ backgroundColor: cat.color }} />
                                                                            <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                                                                        </div>
                                                                        <button 
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if(confirm("Supprimer cette catégorie ?")) {
                                                                                    api.deleteFinanceCategory(cat.id).then(refreshData);
                                                                                }
                                                                            }}
                                                                            className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                                <button 
                                                                    onClick={() => {
                                                                        setNewCat({ ...newCat, type: 'expense' });
                                                                        openCatModal();
                                                                    }}
                                                                    className="p-4 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm hover:border-slate-400 hover:text-slate-600 transition-all flex items-center justify-center gap-2"
                                                                >
                                                                    + Ajouter une dépense
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Recettes */}
                                                        <div className="space-y-4">
                                                            <div className="flex items-center gap-2 px-1">
                                                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                                <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Recettes (Entrées)</h4>
                                                            </div>
                                                            <div className="grid grid-cols-1 gap-3">
                                                                {categories.filter(c => c.type === 'income').map(cat => (
                                                                    <div 
                                                                        key={cat.id} 
                                                                        onClick={() => openCatModal(cat)}
                                                                        className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm flex items-center justify-between group hover:border-slate-300 hover:shadow-md transition-all cursor-pointer"
                                                                    >
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="w-4 h-4 rounded-full shadow-inner" style={{ backgroundColor: cat.color }} />
                                                                            <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                                                                        </div>
                                                                        <button 
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if(confirm("Supprimer cette catégorie ?")) {
                                                                                    api.deleteFinanceCategory(cat.id).then(refreshData);
                                                                                }
                                                                            }}
                                                                            className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                                <button 
                                                                    onClick={() => {
                                                                        setNewCat({ ...newCat, type: 'income' });
                                                                        openCatModal();
                                                                    }}
                                                                    className="p-4 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm hover:border-slate-400 hover:text-slate-600 transition-all flex items-center justify-center gap-2"
                                                                >
                                                                    + Ajouter une recette
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-8">
                                            <div className="space-y-8">
                                                <div className="flex justify-between items-center px-1">
                                                    <div>
                                                        <h3 className="text-xl font-bold text-slate-900">Comptes et Moyens de Paiement</h3>
                                                        <p className="text-sm text-slate-500">Gérez vos banques, caisses espèces et comptes de paiement.</p>
                                                    </div>
                                                    <button 
                                                        onClick={() => openAccModal()}
                                                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium text-sm shadow-sm"
                                                    >
                                                        + Nouveau compte
                                                    </button>
                                                </div>

                                                {accounts.length === 0 ? (
                                                    <div className="py-16 flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
                                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-3xl mb-4">🏦</div>
                                                        <p className="text-slate-900 font-semibold mb-1">Aucun compte configuré</p>
                                                        <p className="text-slate-500 text-sm mb-8 text-center max-w-xs">Ajoutez vos comptes bancaires ou vos caisses pour suivre vos flux par compte.</p>
                                                        <button 
                                                            onClick={() => openAccModal()}
                                                            className="px-8 py-3 bg-white text-slate-900 border border-slate-200 rounded-2xl font-semibold hover:bg-slate-50 transition-all text-sm shadow-sm active:scale-95"
                                                        >
                                                            + Créer mon premier compte
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                        {accounts.map(acc => (
                                                            <div 
                                                                key={acc.id} 
                                                                onClick={() => openAccModal(acc)}
                                                                className="p-6 rounded-3xl border border-slate-100 bg-white shadow-sm flex flex-col group hover:border-slate-300 hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                                                            >
                                                                <div className="absolute top-0 right-0 w-16 h-16 bg-slate-50 rounded-bl-full -mr-4 -mt-4 transition-all group-hover:bg-slate-100" />
                                                                
                                                                <div className="flex items-center gap-3 mb-6 relative">
                                                                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-sm border border-slate-50" style={{ backgroundColor: acc.color + '20', color: acc.color }}>
                                                                        {acc.type === 'cash' ? '💵' : acc.type === 'card' ? '💳' : acc.type === 'transfer' ? '🏦' : '🏦'}
                                                                    </div>
                                                                    <span className="font-bold text-slate-900">{acc.name}</span>
                                                                </div>

                                                                <div className="flex items-center justify-between mt-auto relative">
                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{acc.type || 'Compte'}</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <button 
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if(confirm("Supprimer ce compte ?")) {
                                                                                    api.deleteFinanceAccount(acc.id).then(refreshData);
                                                                                }
                                                                            }}
                                                                            className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                        </div>
                    </div>
                </main>
            </div>

            {/* Transaction Modal */}
            {isTransModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <h2 className="text-[17px] font-semibold text-slate-900 tracking-tight">Nouvelle opération</h2>
                            </div>
                            <button onClick={() => setIsTransModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleCreateTrans}>
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Type d'opération *</label>
                                    <div className="flex p-1 bg-slate-100 rounded-lg">
                                        <button 
                                            type="button"
                                            onClick={() => setNewTrans({...newTrans, type: 'expense'})}
                                            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${newTrans.type === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            Dépense
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setNewTrans({...newTrans, type: 'income'})}
                                            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${newTrans.type === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            Recette
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
                                    <input 
                                        required
                                        type="text" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all placeholder:text-slate-400"
                                        placeholder="Ex: Achat café, Loyer Mars..."
                                        value={newTrans.description}
                                        onChange={e => setNewTrans({...newTrans, description: e.target.value})}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Montant (€ TTC) *</label>
                                        <input 
                                            required
                                            type="number" 
                                            step="0.01"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                            value={newTrans.amount_cents || ""}
                                            onChange={e => setNewTrans({...newTrans, amount_cents: parseFloat(e.target.value)})}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">TVA (%)</label>
                                        <select 
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                                            value={newTrans.vat_rate}
                                            onChange={e => setNewTrans({...newTrans, vat_rate: parseInt(e.target.value)})}
                                        >
                                            <option value={0}>Aucune (0%)</option>
                                            <option value={5.5}>Réduit (5.5%)</option>
                                            <option value={10}>Intermédiaire (10%)</option>
                                            <option value={20}>Normal (20%)</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                                        value={newTrans.category_id}
                                        onChange={e => setNewTrans({...newTrans, category_id: e.target.value})}
                                    >
                                        <option value="">Sélectionner une catégorie</option>
                                        {categories.filter(c => !c.type || c.type === newTrans.type).map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                                        <input 
                                            type="date" 
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                            value={newTrans.date}
                                            onChange={e => setNewTrans({...newTrans, date: e.target.value})}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Compte / Moyen</label>
                                        <select 
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                                            value={newTrans.account_id}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val === "" || val === "none") {
                                                    setNewTrans({
                                                        ...newTrans,
                                                        account_id: "",
                                                        payment_method: "other"
                                                    });
                                                } else {
                                                    const acc = accounts.find(a => a.id === val);
                                                    setNewTrans({
                                                        ...newTrans, 
                                                        account_id: val,
                                                        payment_method: acc?.type || 'other'
                                                    });
                                                }
                                            }}
                                        >
                                            <option value="">Sélectionner un compte (Optionnel)</option>
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                                            ))}
                                            <option value="none">-- Sans compte spécifique --</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Récurrence */}
                                <div className="pt-2">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`w-10 h-6 rounded-full p-1 transition-all ${newTrans.is_recurring ? 'bg-blue-600' : 'bg-slate-200'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full transition-all ${newTrans.is_recurring ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </div>
                                        <input 
                                            type="checkbox"
                                            className="hidden"
                                            checked={newTrans.is_recurring}
                                            onChange={e => setNewTrans({...newTrans, is_recurring: e.target.checked})}
                                        />
                                        <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">Opération récurrente (loyer, assurance...)</span>
                                    </label>
                                    
                                    {newTrans.is_recurring && (
                                        <div className="mt-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Fréquence</label>
                                                <select 
                                                    className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                                    value={newTrans.frequency}
                                                    onChange={e => setNewTrans({...newTrans, frequency: e.target.value})}
                                                >
                                                    <option value="monthly">Mensuel</option>
                                                    <option value="weekly">Hebdomadaire</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Nb échéances</label>
                                                <input 
                                                    type="number"
                                                    className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                                    value={newTrans.recurring_count}
                                                    onChange={e => setNewTrans({...newTrans, recurring_count: parseInt(e.target.value)})}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsTransModalOpen(false)}
                                    className="px-5 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-all text-sm"
                                >
                                    Annuler
                                </button>
                                <button 
                                    type="submit"
                                    className="px-6 py-2 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95"
                                >
                                    Valider l'opération
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Category Modal */}
            {isCatModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                </svg>
                                <h2 className="text-[17px] font-semibold text-slate-900 tracking-tight">
                                    {editingCat ? "Modifier la catégorie" : "Nouvelle catégorie"}
                                </h2>
                            </div>
                            <button onClick={() => setIsCatModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleCreateOrUpdateCat}>
                            <div className="p-6 space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Flux concerné *</label>
                                    <div className="flex p-1 bg-slate-100 rounded-lg">
                                        <button 
                                            type="button"
                                            onClick={() => setNewCat({...newCat, type: 'expense'})}
                                            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${newCat.type === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            Dépense
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setNewCat({...newCat, type: 'income'})}
                                            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${newCat.type === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            Recette
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nom de la catégorie *</label>
                                    <input 
                                        required
                                        type="text" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                                        placeholder="Ex: Loyer, Marketing, Stock..."
                                        value={newCat.name}
                                        onChange={e => setNewCat({...newCat, name: e.target.value})}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Couleur</label>
                                    <div className="flex flex-wrap gap-2.5">
                                        {["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b", "#0f172a"].map(color => (
                                            <button 
                                                key={color}
                                                type="button"
                                                onClick={() => setNewCat({...newCat, color})}
                                                className={`w-8 h-8 rounded-full transition-all border-2 ${newCat.color === color ? 'border-slate-400 scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCatModalOpen(false)}
                                    className="px-5 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-all text-sm"
                                >
                                    Annuler
                                </button>
                                <button 
                                    type="submit"
                                    className="px-6 py-2 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95"
                                >
                                    {editingCat ? "Enregistrer" : "Créer la catégorie"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Account Modal */}
            {isAccModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">🏦</span>
                                <h2 className="text-[17px] font-semibold text-slate-900 tracking-tight">
                                    {editingAcc ? "Modifier le compte" : "Nouveau compte financier"}
                                </h2>
                            </div>
                            <button onClick={() => setIsAccModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleCreateOrUpdateAcc}>
                            <div className="p-6 space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nom du compte / Intitulé *</label>
                                    <input 
                                        required
                                        type="text" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                                        placeholder="Ex: Banque Populaire, Caisse Salle 1, PayPal..."
                                        value={newAcc.name}
                                        onChange={e => setNewAcc({...newAcc, name: e.target.value})}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Type de compte</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            {id: 'transfer', label: 'Banque', icon: '🏦'},
                                            {id: 'cash', label: 'Espèces', icon: '💵'},
                                            {id: 'card', label: 'CB / TPE', icon: '💳'}
                                        ].map(t => (
                                            <button 
                                                key={t.id}
                                                type="button"
                                                onClick={() => setNewAcc({...newAcc, type: t.id})}
                                                className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${newAcc.type === t.id ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
                                            >
                                                <span className="text-xl">{t.icon}</span>
                                                <span className="text-[10px] font-bold uppercase">{t.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Couleur d'identification</label>
                                    <div className="flex flex-wrap gap-2.5">
                                        {["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b", "#0f172a"].map(color => (
                                            <button 
                                                key={color}
                                                type="button"
                                                onClick={() => setNewAcc({...newAcc, color})}
                                                className={`w-8 h-8 rounded-full transition-all border-2 ${newAcc.color === color ? 'border-slate-400 scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAccModalOpen(false)}
                                    className="px-5 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-all text-sm"
                                >
                                    Annuler
                                </button>
                                <button 
                                    type="submit"
                                    className="px-6 py-2 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95"
                                >
                                    {editingAcc ? "Enregistrer les modifications" : "Créer le compte"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
