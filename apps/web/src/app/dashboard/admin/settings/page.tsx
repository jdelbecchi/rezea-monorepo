"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api, User, Tenant } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

// Import dynamique de ReactQuill pour éviter les erreurs SSR
const ReactQuill = dynamic(() => import("react-quill"), {
  ssr: false,
  loading: () => <div className="h-48 bg-gray-50 animate-pulse rounded-xl border border-gray-200" />,
});

import "react-quill/dist/quill.snow.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TABS = [
    { id: "identity", label: "Identité", icon: "🏢" },
    { id: "rules", label: "Règles", icon: "⚖️" },
    { id: "payment", label: "Paiement", icon: "💳" },
    { id: "emails", label: "Emails", icon: "✉️" },
    { id: "docs", label: "Documents", icon: "📁" },
];

export default function AdminSettingsPage() {
    const router = useRouter();
    const bannerInputRef = useRef<HTMLInputElement>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const cgvInputRef = useRef<HTMLInputElement>(null);
    const rulesInputRef = useRef<HTMLInputElement>(null);

    const [user, setUser] = useState<User | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [activeTab, setActiveTab] = useState("identity");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);
    const [message, setMessage] = useState({ text: "", type: "" });

    // Form states
    const [formData, setFormData] = useState<Partial<Tenant>>({});
    const [previewBanner, setPreviewBanner] = useState<string | null>(null);
    const [previewLogo, setPreviewLogo] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const userData = await api.getCurrentUser();
                if (userData.role !== "owner" && userData.role !== "manager") {
                    router.push("/dashboard");
                    return;
                }
                setUser(userData);

                const tenantData = await api.getTenantSettings();
                setTenant(tenantData);
                setFormData(tenantData);
                
                if (tenantData.banner_url) {
                    setPreviewBanner(`${API_URL}${tenantData.banner_url}`);
                }
                if (tenantData.logo_url) {
                    setPreviewLogo(`${API_URL}${tenantData.logo_url}`);
                }
            } catch (err) {
                console.error(err);
                router.push("/login");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    const showMessage = (text: string, type: string) => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: "", type: "" }), 4000);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'banner' | 'logo' | 'cgv' | 'rules') => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(type);
        try {
            let result: any;
            if (type === 'banner') {
                result = await api.uploadBanner(file);
                setPreviewBanner(`${API_URL}${result.banner_url}`);
                setFormData(prev => ({ ...prev, banner_url: result.banner_url }));
            } else if (type === 'logo') {
                result = await api.uploadLogo(file);
                setPreviewLogo(`${API_URL}${result.logo_url}`);
                setFormData(prev => ({ ...prev, logo_url: result.logo_url }));
            } else {
                result = await api.uploadDocument(file, type);
                setFormData(prev => ({ ...prev, [`${type}_url`]: result.url }));
            }
            showMessage("Fichier mis à jour !", "success");
        } catch (err: any) {
            showMessage(err.response?.data?.detail || "Erreur lors de l'upload", "error");
        } finally {
            setUploading(null);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Unset identity fields if they shouldn't be patched or if specific rules apply
            const updated = await api.updateTenantSettings(formData);
            setTenant(updated);
            setFormData(updated);
            showMessage("Paramètres sauvegardés avec succès", "success");
        } catch (err: any) {
            showMessage(err.response?.data?.detail || "Erreur lors de la sauvegarde", "error");
        } finally {
            setSaving(false);
        }
    };

    const quillModules = {
        toolbar: [
            [{ header: [1, 2, false] }],
            ["bold", "italic", "underline", "strike"],
            [{ list: "ordered" }, { list: "bullet" }],
            ["link", "image"],
            ["clean"],
        ],
    };

    if (loading) return <div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>;

    return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col md:flex-row font-sans text-slate-900">
            <Sidebar user={user} />
            <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                <div className="max-w-5xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Paramètres de l&apos;Établissement</h1>
                            <p className="text-slate-500 mt-1">Gérez l&apos;identité, les règles et les options de votre club</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold font-semibold transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2"
                            >
                                {saving ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Enregistrement...
                                    </>
                                ) : "Enregistrer les modifications"}
                            </button>
                        </div>
                    </div>

                    {/* Status message */}
                    {message.text && (
                        <div className={`rounded-2xl p-4 mb-6 text-sm font-semibold transition-all flex items-center gap-3 ${message.type === "success"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm"
                            : "bg-rose-50 text-rose-700 border border-rose-100 shadow-sm"
                            }`}>
                            <span>{message.type === "success" ? "✅" : "⚠️"}</span>
                            {message.text}
                        </div>
                    )}

                    {/* Tabs Navigation */}
                    <div className="flex items-center gap-1 bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm overflow-x-auto no-scrollbar">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                                    ? "bg-slate-900 text-white shadow-md shadow-slate-200 ring-1 ring-slate-900"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    }`}
                            >
                                <span className="text-lg">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* IDENTITY TAB */}
                        {activeTab === "identity" && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 space-y-6">
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                                        <h3 className="text-xl font-bold flex items-center gap-2">📝 Informations Générales</h3>
                                        <div className="grid grid-cols-1 gap-6">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Nom de l&apos;établissement</label>
                                                <input
                                                    type="text"
                                                    value={formData.name || ""}
                                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-medium"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Description / Slogan</label>
                                                <textarea
                                                    value={formData.description || ""}
                                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                    rows={3}
                                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-medium resize-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Message d&apos;accueil (Dashboard)</label>
                                                <input
                                                    type="text"
                                                    value={formData.welcome_message || ""}
                                                    onChange={e => setFormData({ ...formData, welcome_message: e.target.value })}
                                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-medium"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                                        <h3 className="text-xl font-bold flex items-center gap-2">🎨 Style & Couleurs</h3>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Couleur d&apos;accentuation</label>
                                            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                <input
                                                    type="color"
                                                    value={formData.primary_color || "#7c3aed"}
                                                    onChange={e => setFormData({ ...formData, primary_color: e.target.value })}
                                                    className="w-14 h-14 rounded-xl border-2 border-white shadow-sm cursor-pointer"
                                                />
                                                <div className="flex-1">
                                                    <input
                                                        type="text"
                                                        value={formData.primary_color || "#7c3aed"}
                                                        onChange={e => setFormData({ ...formData, primary_color: e.target.value })}
                                                        className="bg-transparent border-none p-0 font-mono font-bold text-lg outline-none w-full"
                                                    />
                                                    <p className="text-xs text-slate-400 font-medium lowercase">Code hexadécimal</p>
                                                </div>
                                                <div 
                                                    className="px-6 py-2 rounded-xl text-white font-bold text-sm shadow-sm"
                                                    style={{ backgroundColor: formData.primary_color }}
                                                >
                                                    Aperçu
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                                        <h3 className="text-xl font-bold flex items-center gap-2">🎯 Logo</h3>
                                        <div className="flex flex-col items-center">
                                            <div className="w-32 h-32 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden mb-4 relative group">
                                                {previewLogo ? (
                                                    <img src={previewLogo} className="w-full h-full object-contain p-2" alt="Logo" />
                                                ) : (
                                                    <span className="text-3xl">🏗️</span>
                                                )}
                                                {uploading === 'logo' && (
                                                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-sm">
                                                        <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent animate-spin rounded-full"></div>
                                                    </div>
                                                )}
                                            </div>
                                            <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'logo')} />
                                            <button 
                                                onClick={() => logoInputRef.current?.click()}
                                                className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-sm transition-all"
                                            >
                                                Modifier le logo
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                                        <h3 className="text-xl font-bold flex items-center gap-2">🖼️ Bannière</h3>
                                        <div className="w-full h-32 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group">
                                            {previewBanner ? (
                                                <img src={previewBanner} className="w-full h-full object-cover" alt="Banner" />
                                            ) : (
                                                <span className="text-3xl">🌄</span>
                                            )}
                                            {uploading === 'banner' && (
                                                <div className="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-sm">
                                                    <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent animate-spin rounded-full"></div>
                                                </div>
                                            )}
                                        </div>
                                        <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'banner')} />
                                        <button 
                                            onClick={() => bannerInputRef.current?.click()}
                                            className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-sm transition-all"
                                        >
                                            Modifier la bannière
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* RULES TAB */}
                        {activeTab === "rules" && (
                            <div className="max-w-3xl mx-auto space-y-8">
                                <section className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm space-y-8">
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">
                                            ⏱️ Délais de gestion
                                        </h3>
                                        <p className="text-slate-500 font-medium">Configurez les limites temporelles pour vos activités</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="block text-sm font-bold text-slate-700">Délai limite d&apos;inscription</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    value={formData.registration_limit_mins ?? 0}
                                                    onChange={e => setFormData({ ...formData, registration_limit_mins: parseInt(e.target.value) || 0 })}
                                                    className="w-full pl-12 pr-20 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                                                />
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">⏳</span>
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">minutes</span>
                                            </div>
                                            <p className="text-xs text-slate-400 font-medium">0 = possible jusqu&apos;au début du cours</p>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="block text-sm font-bold text-slate-700">Délai limite d&apos;annulation</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    value={formData.cancellation_limit_mins ?? 45}
                                                    onChange={e => setFormData({ ...formData, cancellation_limit_mins: parseInt(e.target.value) || 0 })}
                                                    className="w-full pl-12 pr-20 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                                                />
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🚫</span>
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">minutes</span>
                                            </div>
                                            <p className="text-xs text-slate-400 font-medium">Passé ce délai, le crédit ne sera pas remboursé</p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* PAYMENT TAB */}
                        {activeTab === "payment" && (
                            <div className="max-w-3xl mx-auto space-y-6">
                                <section className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm space-y-8">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">💶 Options de paiement</h3>
                                            <p className="text-slate-500 font-medium">Gérez comment vos membres règlent leurs commandes</p>
                                        </div>
                                        <button
                                            onClick={() => setFormData({ ...formData, allow_pay_later: !formData.allow_pay_later })}
                                            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none ${formData.allow_pay_later ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                        >
                                            <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${formData.allow_pay_later ? 'translate-x-7' : 'translate-x-1 shadow-sm'}`} />
                                        </button>
                                    </div>

                                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-start gap-4">
                                        <div className="p-3 bg-white rounded-2xl shadow-sm text-2xl">💡</div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">Paiement différé autorisé ?</h4>
                                            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                                Si activé, l&apos;utilisateur peut valider sa commande sans payer immédiatement (ex: chèque, espèces sur place). Son compte sera alors en attente de validation par un administrateur.
                                            </p>
                                        </div>
                                    </div>

                                    {!formData.allow_pay_later && (
                                        <div className="space-y-6 animate-in slide-in-from-top-4 duration-300">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Lien de redirection après commande (Optionnel)</label>
                                                <input
                                                    type="url"
                                                    placeholder="https://votre-site.com/payment"
                                                    value={formData.payment_redirect_link || ""}
                                                    onChange={e => setFormData({ ...formData, payment_redirect_link: e.target.value })}
                                                    className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none transition-all font-medium"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-3">Instructions de paiement immédiat</label>
                                                <div className="rounded-2xl overflow-hidden border border-slate-200">
                                                    <ReactQuill
                                                        theme="snow"
                                                        value={formData.pay_now_instructions || ""}
                                                        onChange={val => setFormData({ ...formData, pay_now_instructions: val })}
                                                        modules={quillModules}
                                                        className="h-64 bg-white"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}

                        {/* EMAILS TAB */}
                        {activeTab === "emails" && (
                            <div className="max-w-4xl mx-auto space-y-6">
                                <section className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm space-y-8">
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">📧 Emails Automatisés</h3>
                                        <p className="text-slate-500 font-medium">Personnalisez les messages envoyés à vos clients</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-4">Mail de confirmation de commande</label>
                                        <div className="rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                                                <span className="text-sm font-bold text-slate-400">Objet:</span>
                                                <span className="text-sm font-bold text-slate-700">Confirmation de votre commande - {tenant?.name || "Rezea"}</span>
                                            </div>
                                            <ReactQuill
                                                theme="snow"
                                                value={formData.confirmation_email_body || ""}
                                                onChange={val => setFormData({ ...formData, confirmation_email_body: val })}
                                                modules={quillModules}
                                                className="h-[32rem]"
                                            />
                                        </div>
                                        <div className="mt-4 flex items-center gap-3 p-4 bg-blue-50/50 rounded-2xl text-blue-700">
                                            <span className="text-xl">✨</span>
                                            <p className="text-xs font-bold leading-tight uppercase tracking-wider">
                                                Conseil : Ajoutez votre signature et vos coordonnées bancaires si vous utilisez le paiement hors-ligne.
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* DOCUMENTS TAB */}
                        {activeTab === "docs" && (
                            <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm space-y-8 text-center relative overflow-hidden group">
                                    {formData.cgv_url && (
                                        <div className="absolute top-4 right-4 bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Actif</div>
                                    )}
                                    <div className="w-20 h-20 bg-slate-50 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-sm group-hover:scale-110 transition-transform">📜</div>
                                    <div className="space-y-2">
                                        <h4 className="text-xl font-black">CGV</h4>
                                        <p className="text-sm font-medium text-slate-500 leading-relaxed px-4">Conditions Générales de Vente ou Règlement Intérieur</p>
                                    </div>
                                    <div className="space-y-3">
                                        <input type="file" ref={cgvInputRef} className="hidden" accept=".pdf,image/*" onChange={e => handleFileUpload(e, 'cgv')} />
                                        <button 
                                            onClick={() => cgvInputRef.current?.click()}
                                            disabled={!!uploading}
                                            className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {uploading === 'cgv' ? "Upload..." : "Charger le document"}
                                        </button>
                                        {formData.cgv_url && (
                                            <a href={`${API_URL}${formData.cgv_url}`} target="_blank" className="block text-blue-600 text-xs font-bold hover:underline">Voir le document actuel</a>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm space-y-8 text-center relative overflow-hidden group">
                                    {formData.rules_url && (
                                        <div className="absolute top-4 right-4 bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Actif</div>
                                    )}
                                    <div className="w-20 h-20 bg-slate-50 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-sm group-hover:scale-110 transition-transform">📋</div>
                                    <div className="space-y-2">
                                        <h4 className="text-xl font-black">Règlement Intérieur</h4>
                                        <p className="text-sm font-medium text-slate-500 leading-relaxed px-4">Document complémentaire (optionnel)</p>
                                    </div>
                                    <div className="space-y-3">
                                        <input type="file" ref={rulesInputRef} className="hidden" accept=".pdf,image/*" onChange={e => handleFileUpload(e, 'rules')} />
                                        <button 
                                            onClick={() => rulesInputRef.current?.click()}
                                            disabled={!!uploading}
                                            className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                             {uploading === 'rules' ? "Upload..." : "Charger le document"}
                                        </button>
                                        {formData.rules_url && (
                                            <a href={`${API_URL}${formData.rules_url}`} target="_blank" className="block text-blue-600 text-xs font-bold hover:underline">Voir le document actuel</a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <style jsx global>{`
                .ql-container.ql-snow { border: none !important; font-family: inherit; }
                .ql-toolbar.ql-snow { border: none !important; border-bottom: 1px solid #f1f5f9 !important; background: #f8fafc; padding: 12px 16px !important; }
                .ql-editor { font-size: 16px; line-height: 1.6; color: #1e293b; min-height: 200px; padding: 24px !important; }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
