"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { api, User, Tenant, Vignette } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

// Import dynamique de ReactQuill pour éviter les erreurs SSR
const ReactQuill = dynamic(() => import("react-quill"), {
  ssr: false,
  loading: () => <div className="h-48 bg-slate-50 animate-pulse rounded-xl border border-slate-200" />,
});

import "react-quill/dist/quill.snow.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TABS = [
    { id: "identity", label: "Identité", icon: "🏢" },
    { id: "home_design", label: "Interface utilisateur", icon: "📱" },
    { id: "portal", label: "Portail", icon: "🌐" },
    { id: "rules", label: "Règles", icon: "⚖️" },
    { id: "payment", label: "Paiements", icon: "💳" },
    { id: "docs", label: "Infos & docs légaux", icon: "📁" },
];

export default function AdminSettingsPage() {
    const router = useRouter();
    const params = useParams();
    const bannerInputRef = useRef<HTMLInputElement>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const loginBgInputRef = useRef<HTMLInputElement>(null);
    const cgvInputRef = useRef<HTMLInputElement>(null);
    const rulesInputRef = useRef<HTMLInputElement>(null);

    const [user, setUser] = useState<User | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [activeTab, setActiveTab] = useState<string>("identity");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);
    const [message, setMessage] = useState({ text: "", type: "" });
    const [showHomePreview, setShowHomePreview] = useState(false);

    // Form states
    const [formData, setFormData] = useState<Partial<Tenant>>({});
    const [structuredDescription, setStructuredDescription] = useState<{intro: string, items: string[]}>({
        intro: "",
        items: [""]
    });
    const [previewBanner, setPreviewBanner] = useState<string | null>(null);
    const [previewLogo, setPreviewLogo] = useState<string | null>(null);
    const [previewLoginBg, setPreviewLoginBg] = useState<string | null>(null);
    const [newLocation, setNewLocation] = useState("");
    const [newActivity, setNewActivity] = useState("");
    const [showPreview, setShowPreview] = useState(false);
    const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("mobile");

    const [editingLocIndex, setEditingLocIndex] = useState<number | null>(null);
    const [activePaymentConfig, setActivePaymentConfig] = useState<'stripe' | 'helloasso' | null>(null);
    const [editingLocValue, setEditingLocValue] = useState("");
    const [editingActIndex, setEditingActIndex] = useState<number | null>(null);
    const [editingActValue, setEditingActValue] = useState("");

    // Helpers for structured description
    const parseDescription = (html: string) => {
        if (!html) return { intro: "", items: [""] };
        const temp = document.createElement("div");
        temp.innerHTML = html;
        
        // Extract all paragraphs for the intro
        const paragraphs = Array.from(temp.querySelectorAll("p")).map(p => p.innerText);
        const intro = paragraphs.length > 0 ? paragraphs.join('\n') : temp.childNodes[0]?.textContent?.trim() || "";
        
        const items = Array.from(temp.querySelectorAll("li")).map(li => li.innerText);
        
        // If it's old messy HTML without clear P or LI, use raw text as intro
        if (items.length === 0 && paragraphs.length === 0 && html) {
            return { intro: temp.innerText.trim(), items: [""] };
        }
        
        return { 
            intro: intro, 
            items: items.length > 0 ? items : [""] 
        };
    };

    const serializeDescription = (intro: string, items: string[]) => {
        // Convert intro lines to paragraphs
        const introHtml = intro.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => `<p>${line}</p>`)
            .join('');
            
        let html = introHtml;
        const validItems = items.filter(i => i.trim() !== "");
        if (validItems.length > 0) {
            html += "<ul>" + validItems.map(i => `<li>${i}</li>`).join("") + "</ul>";
        }
        return html;
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Get user and check permissions BEFORE other data
                const userData = await api.getCurrentUser();
                if (userData.role !== "owner" && userData.role !== "manager") {
                    router.push("/home");
                    return;
                }
                setUser(userData);

                // 2. Fetch other data
                const tenantData = await api.getTenantSettings();
                setTenant(tenantData);
                setFormData(tenantData);
                
                if (tenantData.banner_url) {
                    setPreviewBanner(`${API_URL}${tenantData.banner_url}`);
                }
                if (tenantData.logo_url) {
                    setPreviewLogo(`${API_URL}${tenantData.logo_url}`);
                }
                if (tenantData.login_background_url) {
                    setPreviewLoginBg(`${API_URL}${tenantData.login_background_url}`);
                }

                // Initialize structured description
                if (tenantData.login_description) {
                    setStructuredDescription(parseDescription(tenantData.login_description));
                }
            } catch (err: any) {
                console.error(err);
                if (err.response?.status === 401) {
                    router.push(`/${params.slug}`);
                }
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    // Update formData when structuredDescription changes
    useEffect(() => {
        const html = serializeDescription(structuredDescription.intro, structuredDescription.items);
        setFormData(prev => ({ ...prev, login_description: html }));
    }, [structuredDescription]);

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
            } else if ((type as string) === 'login-bg') {
                result = await api.uploadLoginBackground(file);
                setPreviewLoginBg(`${API_URL}${result.login_background_url}`);
                setFormData(prev => ({ ...prev, login_background_url: result.login_background_url }));
            } else {
                result = await api.uploadDocument(file, type as any);
                setFormData(prev => ({ ...prev, [`${type}_url`]: result.url }));
            }
            showMessage("Fichier mis à jour !", "success");
        } catch (err: any) {
            showMessage(err.response?.data?.detail || "Erreur lors de l'upload", "error");
        } finally {
            setUploading(null);
        }
    };

    const [verifyingPayment, setVerifyingPayment] = useState<boolean>(false);
    const [paymentVerificationError, setPaymentVerificationError] = useState<string | null>(null);
    const [paymentVerificationSuccess, setPaymentVerificationSuccess] = useState<string | null>(null);

    const handleVerifyPayment = async (provider: 'stripe' | 'helloasso') => {
        setVerifyingPayment(true);
        setPaymentVerificationError(null);
        setPaymentVerificationSuccess(null);
        try {
            const payload = {
                provider,
                stripe_publishable_key: formData.stripe_publishable_key,
                stripe_secret_key: formData.stripe_secret_key,
                helloasso_client_id: formData.helloasso_client_id,
                helloasso_client_secret: formData.helloasso_client_secret,
                helloasso_organization_slug: formData.helloasso_organization_slug,
            };
            const res = await api.verifyPaymentSettings(payload);
            setPaymentVerificationSuccess(res.message);
        } catch (err: any) {
            setPaymentVerificationError(err.response?.data?.detail || "Erreur lors du test de connexion");
        } finally {
            setVerifyingPayment(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
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

    const handleAddLocation = () => {
        if (!newLocation.trim()) return;
        const current = formData.locations || [];
        if (current.includes(newLocation.trim())) {
            showMessage("Ce lieu existe déjà", "error");
            return;
        }
        setFormData({ ...formData, locations: [...current, newLocation.trim()] });
        setNewLocation("");
    };

    const handleRemoveLocation = (loc: string) => {
        const current = formData.locations || [];
        setFormData({ ...formData, locations: current.filter(l => l !== loc) });
    };

    const handleStartEditLocation = (index: number, val: string) => {
        setEditingLocIndex(index);
        setEditingLocValue(val);
    };

    const handleSaveEditLocation = (index: number) => {
        if (!editingLocValue.trim()) return;
        const current = [...(formData.locations || [])];
        current[index] = editingLocValue.trim();
        setFormData({ ...formData, locations: current });
        setEditingLocIndex(null);
    };

    const handleAddActivity = () => {
        if (!newActivity.trim()) return;
        const current = formData.activity_types || [];
        if (current.includes(newActivity.trim())) {
            showMessage("Cette activité existe déjà", "error");
            return;
        }
        setFormData({ ...formData, activity_types: [...current, newActivity.trim()] });
        setNewActivity("");
    };

    const handleRemoveActivity = (act: string) => {
        const current = formData.activity_types || [];
        setFormData({ ...formData, activity_types: current.filter(a => a !== act) });
    };

    const handleStartEditActivity = (index: number, val: string) => {
        setEditingActIndex(index);
        setEditingActValue(val);
    };

    const handleSaveEditActivity = (index: number) => {
        if (!editingActValue.trim()) return;
        const current = [...(formData.activity_types || [])];
        current[index] = editingActValue.trim();
        setFormData({ ...formData, activity_types: current });
        setEditingActIndex(null);
    };

    const handleAddAtout = () => {
        setStructuredDescription(prev => ({
            ...prev,
            items: [...prev.items, ""]
        }));
    };

    const handleUpdateAtout = (index: number, val: string) => {
        const newItems = [...structuredDescription.items];
        newItems[index] = val;
        setStructuredDescription(prev => ({ ...prev, items: newItems }));
    };

    const handleRemoveAtout = (index: number) => {
        const newItems = structuredDescription.items.filter((_, i) => i !== index);
        setStructuredDescription(prev => ({ 
            ...prev, 
            items: newItems.length > 0 ? newItems : [""] 
        }));
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

    if (loading) return <div className="p-8 text-center bg-slate-50 min-h-screen">Chargement...</div>;

    return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col md:flex-row text-slate-900">
            <Sidebar user={user} />
            <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">⚙️ Paramètres</h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Gérez l&apos;identité, les règles et les options de votre club</p>
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
                    <div className="flex items-center border-b border-slate-200 mb-10 overflow-x-auto no-scrollbar">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-8 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id
                                    ? "border-blue-600 text-blue-600"
                                    : "border-transparent text-slate-500 hover:text-slate-700"
                                    }`}
                            >
                                <span className="text-base">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* IDENTITY TAB */}
                        {activeTab === "identity" && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                                <div className="space-y-8 flex flex-col">
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6 flex-1">
                                        <div className="grid grid-cols-1 gap-4">
                                            <div>
                                                <label className={`block text-sm font-medium mb-2 ${!formData.name ? 'text-red-500' : 'text-slate-700'}`}>Nom de l&apos;établissement *</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={formData.name || ""}
                                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                    className={`w-full px-4 py-3 border rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal ${!formData.name ? 'border-red-300 bg-red-50' : 'bg-white border-slate-200'}`}
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Phrase d&apos;accroche / Signature</label>
                                                <input
                                                    type="text"
                                                    value={formData.slogan || ""}
                                                    onChange={e => setFormData({ ...formData, slogan: e.target.value })}
                                                    placeholder="Votre phrase d'accroche ou signature..."
                                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-slate-700"
                                                />
                                            </div>

                                            <div className="pt-4 border-t border-slate-100/50 flex flex-col items-center justify-center">
                                                <label className="block text-sm font-medium text-slate-700 mb-4 text-center w-full">Logo de l&apos;établissement</label>
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="relative group">
                                                        <div 
                                                            onClick={() => logoInputRef.current?.click()}
                                                            className="w-32 h-32 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative cursor-pointer group shadow-sm hover:border-slate-300 transition-all"
                                                        >
                                                            {previewLogo ? (
                                                                <img src={previewLogo} className="w-full h-full object-contain p-3" alt="Logo" />
                                                            ) : (
                                                                 <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 group-hover:text-slate-500 transition-colors text-center p-3">
                                                                     <span className="text-3xl mb-2">🖼️</span>
                                                                     <span className="text-xs font-medium text-slate-500 leading-tight">Charger un visuel</span>
                                                                 </div>
                                                            )}
                                                            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <span className="text-white text-xl">📷</span>
                                                            </div>
                                                        </div>
                                                        {previewLogo && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setPreviewLogo(null);
                                                                    setFormData({ ...formData, logo_url: "" });
                                                                }}
                                                                className="absolute -top-2 -right-2 p-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-xl transition-all shadow-sm z-20 active:scale-95 animate-in fade-in duration-200"
                                                                title="Supprimer le logo"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-center text-center gap-2">
                                                        <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'logo')} />
                                                        <p className="text-[10px] text-slate-400 font-normal tracking-wide leading-tight">Fond transparent recommandé, max 1MB.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-8 flex flex-col">
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                                    Site internet de l&apos;établissement
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 select-none">
                                                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                                        </svg>
                                                    </span>
                                                    <input
                                                        type="url"
                                                        value={formData.website_url || ""}
                                                        onChange={e => setFormData({ ...formData, website_url: e.target.value })}
                                                        placeholder="https://www.votresite.com"
                                                        className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                                    Email de contact
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 select-none">
                                                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                        </svg>
                                                    </span>
                                                    <input
                                                        type="email"
                                                        value={formData.email || ""}
                                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                                        placeholder="contact@votreclub.com"
                                                        className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                                        Lien Facebook
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 select-none">
                                                            <svg className="w-5 h-5 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                                            </svg>
                                                        </span>
                                                        <input
                                                            type="url"
                                                            value={formData.facebook_url || ""}
                                                            onChange={e => setFormData({ ...formData, facebook_url: e.target.value })}
                                                            placeholder="https://facebook.com/page"
                                                            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-sm"
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                                        Lien Instagram
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 select-none">
                                                            <svg className="w-5 h-5 text-[#E1306C]" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                                                            </svg>
                                                        </span>
                                                        <input
                                                            type="url"
                                                            value={formData.instagram_url || ""}
                                                            onChange={e => setFormData({ ...formData, instagram_url: e.target.value })}
                                                            placeholder="https://instagram.com/compte"
                                                            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-4">
                                        <label className="block text-sm font-medium text-slate-700">
                                            Message de bienvenue <span className="text-slate-400 text-[10px] font-normal ml-1">(facultatif - affiché lors de la création de compte)</span>
                                        </label>
                                        <textarea
                                            value={formData.welcome_message || ""}
                                            onChange={e => setFormData({ ...formData, welcome_message: e.target.value })}
                                            placeholder="Bienvenue chez nous !"
                                            rows={3}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PORTAL TAB */}
                        {activeTab === "portal" && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="space-y-8">
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col h-full">
                                        <div className="space-y-6 flex-1 mb-8">
                                            {/* Cases à cocher pour l'affichage des éléments de branding */}
                                            <div className="space-y-3">
                                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                                    Que souhaitez-vous afficher sur votre portail de connexion ?
                                                </label>
                                                <div className="flex flex-col gap-2.5 pl-1">
                                                    {/* Logo visibility */}
                                                    <label className="flex items-center gap-3 cursor-pointer group select-none">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={formData.show_logo !== false}
                                                            onChange={e => setFormData({ ...formData, show_logo: e.target.checked })}
                                                            className="w-4 h-4"
                                                        />
                                                        <span className="text-xs font-light text-slate-600 group-hover:text-slate-900 transition-colors">Logo de l&apos;établissement</span>
                                                    </label>
                                                    
                                                    {/* Name visibility */}
                                                    <label className="flex items-center gap-3 cursor-pointer group select-none">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={formData.show_name !== false}
                                                            onChange={e => setFormData({ ...formData, show_name: e.target.checked })}
                                                            className="w-4 h-4"
                                                        />
                                                        <span className="text-xs font-light text-slate-600 group-hover:text-slate-900 transition-colors">Nom de l&apos;établissement</span>
                                                    </label>
                                                    
                                                    {/* Slogan visibility */}
                                                    <label className="flex items-center gap-3 cursor-pointer group select-none">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={formData.show_slogan !== false}
                                                            onChange={e => setFormData({ ...formData, show_slogan: e.target.checked })}
                                                            className="w-4 h-4"
                                                        />
                                                        <span className="text-xs font-light text-slate-600 group-hover:text-slate-900 transition-colors">Phrase d&apos;accroche (signature)</span>
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="border-t border-slate-100 my-6" />

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Image de fond du portail</label>
                                                <div className="relative group mb-3">
                                                    <div 
                                                        onClick={() => loginBgInputRef.current?.click()}
                                                        className="w-full h-48 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative cursor-pointer shadow-inner group"
                                                    >
                                                    {previewLoginBg ? (
                                                        <img src={previewLoginBg} className="w-full h-full object-contain bg-slate-900/[0.02]" alt="Login Background" />
                                                    ) : (
                                                         <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 group-hover:text-slate-500 transition-colors text-center">
                                                             <span className="text-3xl mb-1">🖼️</span>
                                                             <span className="text-[11px] font-medium text-slate-500">Charger un visuel</span>
                                                         </div>
                                                    )}
                                                    {uploading === 'login-bg' && (
                                                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-sm">
                                                            <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent animate-spin rounded-full"></div>
                                                        </div>
                                                    )}
                                                    {uploading !== 'login-bg' && (
                                                        <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <span className="text-white text-2xl">📷</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {previewLoginBg && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPreviewLoginBg(null);
                                                            setFormData({ ...formData, login_background_url: "" });
                                                        }}
                                                        className="absolute -top-2 -right-2 p-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-xl transition-all shadow-sm z-20 active:scale-95 animate-in fade-in duration-200"
                                                        title="Supprimer l'image"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                            <input type="file" ref={loginBgInputRef} className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'login-bg' as any)} />
                                        </div>

                                            <div className="flex items-center justify-between gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">Couleur dédiée au portail</label>
                                                    <p className="text-xs text-slate-400 font-normal mt-0.5">Si non définie, la couleur d&apos;accentuation du club sera utilisée.</p>
                                                </div>
                                                <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm min-w-[150px]">
                                                    <input
                                                        type="color"
                                                        value={formData.login_primary_color || formData.primary_color || "#7c3aed"}
                                                        onChange={e => setFormData({ ...formData, login_primary_color: e.target.value })}
                                                        className="w-8 h-8 rounded-lg border border-slate-200/50 shadow-sm cursor-pointer"
                                                    />
                                                    <div className="flex-1">
                                                        <input
                                                            type="text"
                                                            value={formData.login_primary_color || ""}
                                                            placeholder={formData.primary_color}
                                                            onChange={e => setFormData({ ...formData, login_primary_color: e.target.value })}
                                                            className="bg-transparent border-none p-0 font-mono font-medium text-sm text-slate-700 outline-none w-full"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-slate-100 flex justify-end mt-auto">
                                            <button 
                                                onClick={() => setShowPreview(true)}
                                                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium text-sm transition-all shadow-lg shadow-slate-200 active:scale-95"
                                            >
                                                Aperçu du portail
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6 h-full">
                                        <h3 className="text-base font-medium flex items-center gap-2 text-slate-800">✨ Textes personnalisés</h3>
                                        <div>
                                            <p className="text-xs text-slate-400 mb-6 font-medium leading-relaxed italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                💡 <b>le conseil Rezea :</b> une introduction courte suivie de 3 à 5 atouts majeurs est le format idéal pour convertir vos visiteurs !
                                            </p>
                                            
                                            <div className="space-y-8">
                                                {/* Introduction Field */}
                                                <div className="space-y-2">
                                                    <label className="block text-sm font-medium text-slate-700 mb-2">Description courte</label>
                                                    <textarea 
                                                        value={structuredDescription.intro}
                                                        onChange={e => setStructuredDescription(prev => ({ ...prev, intro: e.target.value }))}
                                                        placeholder="Ex: Bienvenue dans votre club de bien-être..."
                                                        className="w-full px-5 py-4 bg-white border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:bg-white transition-all outline-none text-sm font-normal text-slate-700 resize-none min-h-[100px]"
                                                    />
                                                </div>

                                                {/* Key Assets List */}
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="block text-sm font-medium text-slate-700">Points forts et atouts</label>
                                                        <button 
                                                            onClick={handleAddAtout}
                                                            className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full hover:bg-blue-100 transition-all active:scale-95"
                                                        >
                                                            + Ajouter un point
                                                        </button>
                                                    </div>
                                                    
                                                    <div className="space-y-3">
                                                        {structuredDescription.items.map((item, idx) => (
                                                            <div key={idx} className="group relative flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                                                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 font-bold text-xs">
                                                                    {idx + 1}
                                                                </div>
                                                                <input 
                                                                    type="text"
                                                                    value={item}
                                                                    onChange={e => handleUpdateAtout(idx, e.target.value)}
                                                                    placeholder={`Atout n°${idx + 1}...`}
                                                                    className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all font-normal text-sm text-slate-700"
                                                                />
                                                                <button 
                                                                    onClick={() => handleRemoveAtout(idx)}
                                                                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* RULES TAB */}
                        {activeTab === "rules" && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* DEADLINES BOX - FULL WIDTH */}
                                <section className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
                                    <div className="flex flex-col lg:flex-row gap-8 items-stretch">
                                        {/* Left Side: Deadlines */}
                                        <div className="flex-1 space-y-4 pt-1">
                                            
                                            <div className="space-y-4">
                                                <div className="space-y-1.5">
                                                    <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                                        <span>⏳</span>
                                                        <span>Délai limite d&apos;inscription</span>
                                                    </label>
                                                    <div className="relative group">
                                                        <input
                                                            type="number"
                                                            value={formData.registration_limit_mins ?? 0}
                                                            onChange={e => setFormData({ ...formData, registration_limit_mins: parseInt(e.target.value) || 0 })}
                                                            className="w-full pl-6 pr-20 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">minutes</span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 font-normal">0 = possible jusqu&apos;au début du cours</p>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                                        <span>🚫</span>
                                                        <span>Délai limite d&apos;annulation</span>
                                                    </label>
                                                    <div className="relative group">
                                                        <input
                                                            type="number"
                                                            value={formData.cancellation_limit_mins ?? 45}
                                                            onChange={e => setFormData({ ...formData, cancellation_limit_mins: parseInt(e.target.value) || 0 })}
                                                            className="w-full pl-6 pr-20 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">minutes</span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 font-normal">Passé ce délai, le crédit ne sera pas restitué</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Vertical Separator */}
                                        <div className="hidden lg:block w-px bg-slate-100 self-stretch my-2"></div>

                                        {/* Right Side: Grace period */}
                                        <div className="flex-1 space-y-4">
                                            <h3 className="text-base font-medium flex items-center gap-2 text-slate-800 mb-4">
                                                <span>🎁</span>
                                                <span>Délai de grâce (crédits & statut)</span>
                                            </h3>
                                            <p className="text-xs text-slate-400 font-normal">
                                                Autoriser les utilisateurs à consommer leurs crédits après la fin théorique de leur commande d&apos;offre.
                                            </p>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                <div>
                                                    <label className="block text-[11px] font-light text-slate-400 uppercase tracking-wider mb-2 ml-1">Mode de tolérance</label>
                                                    <select
                                                        value={formData.grace_period_mode || "days"}
                                                        onChange={e => {
                                                            const mode = e.target.value;
                                                            setFormData({ 
                                                                ...formData, 
                                                                grace_period_mode: mode,
                                                                grace_period_days: mode === "end_of_month" ? 0 : (formData.grace_period_days || 0)
                                                            });
                                                        }}
                                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-sm font-medium"
                                                    >
                                                        <option value="days">Nombre de jours après la fin</option>
                                                        <option value="end_of_month">Jusqu&apos;à la fin du mois calendaire</option>
                                                    </select>
                                                </div>

                                                {formData.grace_period_mode !== "end_of_month" && (
                                                    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                                        <label className="block text-[11px] font-light text-slate-400 uppercase tracking-wider mb-2 ml-1">Nombre de jours</label>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={formData.grace_period_days ?? 0}
                                                                onChange={e => setFormData({ ...formData, grace_period_days: parseInt(e.target.value) || 0 })}
                                                                className="w-full pl-4 pr-12 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-sm font-semibold"
                                                            />
                                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">jours</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-normal italic leading-tight pt-2">
                                                💡 Exemple : Pour une offre finissant le 10 juin, avec 15 jours de tolérance ou une fin de mois, l&apos;utilisateur pourra utiliser ses crédits restants jusqu&apos;au 25 juin ou 30 juin. Le statut passera à Expiré après cette date de tolérance.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                {/* LOCATIONS & ACTIVITIES - SIDE BY SIDE */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                                    {/* LOCATIONS SECTION */}
                                    <section className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-8 flex flex-col h-full">
                                        <div className="space-y-1">
                                            <h3 className="text-base font-medium flex items-center gap-2 text-slate-800">
                                                <span>📍</span>
                                                <span>Locaux & Espaces</span>
                                            </h3>
                                            <p className="text-xs text-slate-400 font-normal">Définissez les salles et lieux de votre établissement</p>
                                        </div>

                                        <div className="space-y-6 flex-1">
                                            <div className="flex gap-3 items-center">
                                                <input
                                                    type="text"
                                                    placeholder="Ex: Salle 1, Studio Yoga..."
                                                    value={newLocation}
                                                    onChange={e => setNewLocation(e.target.value)}
                                                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAddLocation())}
                                                    className="flex-1 px-5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-normal focus:ring-4 focus:ring-blue-100 transition-all outline-none text-sm"
                                                />
                                                <button
                                                    onClick={handleAddLocation}
                                                    className="px-4 py-1.5 bg-slate-900 text-white rounded-xl font-semibold text-xs hover:bg-slate-800 transition-all shadow-sm active:scale-95 flex items-center gap-2 leading-none"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                    <span className="mb-[1px]">Ajouter</span>
                                                </button>
                                            </div>

                                            <div className="divide-y divide-slate-100">
                                                {(formData.locations || []).map((loc, index) => (
                                                    <div key={index} className="group flex items-center justify-between py-2.5 transition-all">
                                                        {editingLocIndex === index ? (
                                                            <div className="flex items-center gap-2 w-full animate-in slide-in-from-top-1 duration-200">
                                                                <input
                                                                    type="text"
                                                                    value={editingLocValue}
                                                                    onChange={e => setEditingLocValue(e.target.value)}
                                                                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleSaveEditLocation(index))}
                                                                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all outline-none text-sm font-medium"
                                                                    autoFocus
                                                                />
                                                                <button
                                                                    onClick={() => handleSaveEditLocation(index)}
                                                                    className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                                                                    title="Valider"
                                                                >
                                                                    ✔️
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingLocIndex(null)}
                                                                    className="p-1.5 hover:bg-slate-100 text-slate-400 rounded-lg transition-all"
                                                                    title="Annuler"
                                                                >
                                                                    ❌
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-slate-400 text-[10px]">📍</span>
                                                                    <span className="font-medium text-slate-600 text-sm">{loc}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                    <button 
                                                                        onClick={() => handleStartEditLocation(index, loc)}
                                                                        className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                                                        title="Modifier ce lieu"
                                                                    >
                                                                        ✏️
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleRemoveLocation(loc)}
                                                                        className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                                        title="Supprimer ce lieu"
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                ))}
                                                {(formData.locations || []).length === 0 && (
                                                    <div className="py-8 text-center border-2 border-dashed border-slate-50 rounded-xl mt-2">
                                                        <p className="text-slate-400 font-normal text-xs">Aucun lieu configuré</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </section>

                                    {/* ACTIVITIES SECTION */}
                                    <section className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-8 flex flex-col h-full">
                                        <div className="space-y-1">
                                            <h3 className="text-base font-medium flex items-center gap-2 text-slate-800">
                                                <span>🏷️</span>
                                                <span>Activités de l&apos;établissement</span>
                                            </h3>
                                            <p className="text-xs text-slate-400 font-normal">Définissez les types d&apos;activités proposés (ex: Peinture, Dessin, Yoga...)</p>
                                        </div>

                                        <div className="space-y-6 flex-1">
                                            <div className="flex gap-3 items-center">
                                                <input
                                                    type="text"
                                                    placeholder="Ex: Peinture, Dessin, Yoga..."
                                                    value={newActivity}
                                                    onChange={e => setNewActivity(e.target.value)}
                                                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAddActivity())}
                                                    className="flex-1 px-5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-normal focus:ring-4 focus:ring-blue-100 transition-all outline-none text-sm"
                                                />
                                                <button
                                                    onClick={handleAddActivity}
                                                    className="px-4 py-1.5 bg-slate-900 text-white rounded-xl font-semibold text-xs hover:bg-slate-800 transition-all shadow-sm active:scale-95 flex items-center gap-2 leading-none"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                    <span className="mb-[1px]">Ajouter</span>
                                                </button>
                                            </div>

                                            <div className="divide-y divide-slate-100">
                                                {(formData.activity_types || []).map((act, index) => (
                                                    <div key={index} className="group flex items-center justify-between py-2.5 transition-all">
                                                        {editingActIndex === index ? (
                                                            <div className="flex items-center gap-2 w-full animate-in slide-in-from-top-1 duration-200">
                                                                <input
                                                                    type="text"
                                                                    value={editingActValue}
                                                                    onChange={e => setEditingActValue(e.target.value)}
                                                                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleSaveEditActivity(index))}
                                                                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all outline-none text-sm font-medium"
                                                                    autoFocus
                                                                />
                                                                <button
                                                                    onClick={() => handleSaveEditActivity(index)}
                                                                    className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                                                                    title="Valider"
                                                                >
                                                                    ✔️
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingActIndex(null)}
                                                                    className="p-1.5 hover:bg-slate-100 text-slate-400 rounded-lg transition-all"
                                                                    title="Annuler"
                                                                >
                                                                    ❌
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-slate-400 text-[10px]">🏷️</span>
                                                                    <span className="font-medium text-slate-600 text-sm capitalize">{act}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                    <button 
                                                                        onClick={() => handleStartEditActivity(index, act)}
                                                                        className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                                                        title="Modifier cette activité"
                                                                    >
                                                                        ✏️
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleRemoveActivity(act)}
                                                                        className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                                        title="Supprimer cette activité"
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                ))}
                                                {(formData.activity_types || []).length === 0 && (
                                                    <div className="py-8 text-center border-2 border-dashed border-slate-50 rounded-xl mt-2">
                                                        <p className="text-slate-400 font-normal text-xs">Aucune activité configurée</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        )}

                        {/* PAYMENT TAB */}
                        {activeTab === "payment" && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <section className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-8">
                                    <div className="space-y-1">
                                        <h3 className="text-base font-medium flex items-center gap-2 text-slate-800">
                                            <span>💶</span>
                                            <span>Paramètres de paiement</span>
                                        </h3>
                                        <p className="text-xs text-slate-400 font-normal">Gérer vos moyens de paiement des commandes et inscriptions</p>
                                    </div>

                                    <div className="space-y-6">
                                        <p className="text-xs text-amber-600 font-normal leading-relaxed italic px-2">
                                            💡 Si aucun moyen de paiement n&apos;est configuré, le fonctionnement par défaut est celui du &quot;Paiement différé&quot; : la commande est enregistrée au statut &quot;En attente&quot; de paiement. Si vous avez renseigné des instructions ci-dessous, elles seront envoyées systématiquement par email à tous les utilisateurs lors de leur commande.
                                        </p>

                                        {/* 1. PAIEMENTS AUTOMATISÉS */}
                                        <div className="p-6 bg-white rounded-3xl border border-slate-200 space-y-5">
                                            <div className="flex items-start gap-4">
                                                <div className="text-xl -mt-0.5 leading-none">⚡</div>
                                                <div className="flex-1 space-y-5">
                                                    <div>
                                                        <h4 className="font-semibold text-slate-900 text-base">Paiements automatisés (Rapprochement automatique)</h4>
                                                        <div className="text-xs text-slate-500 font-normal leading-relaxed mt-1 space-y-1">
                                                            <p>• Configurez votre plateforme de paiement Stripe ou HelloAsso pour gérer votre boutique en ligne.</p>
                                                            <p>• Le statut de la commande est mis à jour automatiquement à <span className="font-semibold text-emerald-600">&quot;Payé&quot;</span> ou <span className="font-semibold text-emerald-600">&quot;Echelonné&quot;</span> après le règlement, sans action manuelle de votre part.</p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                                        {/* Stripe Section */}
                                                        <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between h-full space-y-3">
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-sm font-semibold text-slate-800">Stripe</span>
                                                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[9px] font-bold uppercase tracking-wider">Entreprises</span>
                                                                    {formData.stripe_publishable_key && formData.stripe_secret_key ? (
                                                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-bold uppercase tracking-wider">Configuré</span>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[9px] font-bold uppercase tracking-wider">Non configuré</span>
                                                                    )}
                                                                </div>
                                                                <p className="text-[11px] text-slate-400 font-normal leading-relaxed">
                                                                    Idéal pour les structures commerciales. Expérience utilisateur 100% intégrée.
                                                                </p>
                                                                <p className="text-[10px] text-slate-400 font-normal italic pt-1">
                                                                    Des frais de transaction Stripe s&apos;appliquent (~1.5% + 0.25€).
                                                                </p>
                                                            </div>
                                                            <button 
                                                                type="button"
                                                                onClick={() => setActivePaymentConfig(activePaymentConfig === 'stripe' ? null : 'stripe')}
                                                                className={`self-start px-6 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                                                    activePaymentConfig === 'stripe' 
                                                                        ? 'bg-slate-200 text-slate-700 border-slate-300' 
                                                                        : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                                                                }`}
                                                            >
                                                                {activePaymentConfig === 'stripe' ? 'Fermer' : 'Configurer'}
                                                            </button>
                                                        </div>

                                                        {/* HelloAsso Section */}
                                                        <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between h-full space-y-3">
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-sm font-semibold text-slate-800">HelloAsso</span>
                                                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-bold uppercase tracking-wider">Associations</span>
                                                                    {formData.helloasso_client_id && formData.helloasso_client_secret ? (
                                                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-bold uppercase tracking-wider">Configuré</span>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[9px] font-bold uppercase tracking-wider">Non configuré</span>
                                                                    )}
                                                                </div>
                                                                <p className="text-[11px] text-slate-400 font-normal leading-relaxed">
                                                                    Solution gratuite dédiée aux associations loi 1901. Rapprochement automatique par Webhook.
                                                                </p>
                                                                <p className="text-[10px] text-emerald-600 font-semibold italic pt-1">
                                                                    HelloAsso est 100% gratuit (pas de frais de transaction).
                                                                </p>
                                                            </div>
                                                            <button 
                                                                type="button"
                                                                onClick={() => setActivePaymentConfig(activePaymentConfig === 'helloasso' ? null : 'helloasso')}
                                                                className={`self-start px-6 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                                                    activePaymentConfig === 'helloasso' 
                                                                        ? 'bg-slate-200 text-slate-700 border-slate-300' 
                                                                        : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                                                }`}
                                                            >
                                                                {activePaymentConfig === 'helloasso' ? 'Fermer' : 'Configurer'}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Configuration forms */}
                                                    {activePaymentConfig === 'stripe' && (
                                                        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                                                                <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Configuration de Stripe</h5>
                                                                <span className="text-[10px] text-blue-600 font-medium">Automatisation des paiements</span>
                                                            </div>
                                                            
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <div className="space-y-1">
                                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clé publique (Publishable key)</label>
                                                                    <input 
                                                                        type="text"
                                                                        placeholder="pk_live_..."
                                                                        value={formData.stripe_publishable_key || ""}
                                                                        onChange={e => setFormData({ ...formData, stripe_publishable_key: e.target.value })}
                                                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all font-normal shadow-inner"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clé secrète (Secret key)</label>
                                                                    <input 
                                                                        type="password"
                                                                        placeholder={formData.stripe_secret_key ? "••••••••••••" : "sk_live_..."}
                                                                        value={formData.stripe_secret_key || ""}
                                                                        onChange={e => setFormData({ ...formData, stripe_secret_key: e.target.value })}
                                                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all font-normal shadow-inner"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-3 pt-1 flex-wrap">
                                                                <button
                                                                    type="button"
                                                                    disabled={verifyingPayment}
                                                                    onClick={() => handleVerifyPayment('stripe')}
                                                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-all shadow-sm"
                                                                >
                                                                    {verifyingPayment ? "Vérification..." : "Tester la connexion"}
                                                                </button>
                                                                {paymentVerificationSuccess && activePaymentConfig === 'stripe' && (
                                                                    <span className="text-xs text-emerald-600 font-medium">🟢 {paymentVerificationSuccess}</span>
                                                                )}
                                                                {paymentVerificationError && activePaymentConfig === 'stripe' && (
                                                                    <span className="text-xs text-red-500 font-medium">🔴 {paymentVerificationError}</span>
                                                                )}
                                                            </div>

                                                            {/* User Guide for Stripe */}
                                                            <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/60 text-[11px] text-slate-600 space-y-1.5 font-normal">
                                                                <span className="font-semibold text-blue-700 flex items-center gap-1.5">💡 Comment trouver vos clés d&apos;API Stripe ?</span>
                                                                <p className="leading-relaxed">1. Connectez-vous à votre <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-blue-600 hover:text-blue-800">Tableau de bord Stripe</a>.</p>
                                                                <p className="leading-relaxed">2. En haut à droite, activez le mode Live/Production, puis cliquez sur <strong>Développeurs</strong> et enfin sur <strong>Clés API</strong> dans le menu de gauche.</p>
                                                                <p className="leading-relaxed">3. Copiez la <strong>Clé de publication</strong> (commence par <code>pk_live_</code>) et collez-la dans le premier champ ci-dessus.</p>
                                                                <p className="leading-relaxed">4. Cliquez sur <strong>Révéler la clé secrète</strong> (commence par <code>sk_live_</code>), copiez-la et collez-la dans le deuxième champ ci-dessus.</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {activePaymentConfig === 'helloasso' && (
                                                        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                                                                <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Configuration de HelloAsso</h5>
                                                                <span className="text-[10px] text-emerald-600 font-medium">Rapprochement via Webhooks</span>
                                                            </div>
                                                            
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <div className="space-y-1">
                                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">ID Client (Client ID)</label>
                                                                    <input 
                                                                        type="text"
                                                                        placeholder="ID Client API obtenu sur HelloAsso"
                                                                        value={formData.helloasso_client_id || ""}
                                                                        onChange={e => setFormData({ ...formData, helloasso_client_id: e.target.value })}
                                                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all font-normal shadow-inner"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clé secrète (Client Secret)</label>
                                                                    <input 
                                                                        type="password"
                                                                        placeholder={formData.helloasso_client_secret ? "••••••••••••" : "Clé secrète de l'API"}
                                                                        value={formData.helloasso_client_secret || ""}
                                                                        onChange={e => setFormData({ ...formData, helloasso_client_secret: e.target.value })}
                                                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all font-normal shadow-inner"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Slug de l&apos;association</label>
                                                                    <input 
                                                                        type="text"
                                                                        placeholder="ex: mon-club-de-sport"
                                                                        value={formData.helloasso_organization_slug || ""}
                                                                        onChange={e => setFormData({ ...formData, helloasso_organization_slug: e.target.value })}
                                                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all font-normal shadow-inner"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Secret de signature du Webhook</label>
                                                                    <input 
                                                                        type="password"
                                                                        placeholder={formData.helloasso_webhook_secret ? "••••••••••••" : "Clé de validation des signatures"}
                                                                        value={formData.helloasso_webhook_secret || ""}
                                                                        onChange={e => setFormData({ ...formData, helloasso_webhook_secret: e.target.value })}
                                                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all font-normal shadow-inner"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-3 pt-1 flex-wrap">
                                                                <button
                                                                    type="button"
                                                                    disabled={verifyingPayment}
                                                                    onClick={() => handleVerifyPayment('helloasso')}
                                                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-all shadow-sm"
                                                                >
                                                                    {verifyingPayment ? "Vérification..." : "Tester la connexion"}
                                                                </button>
                                                                {paymentVerificationSuccess && activePaymentConfig === 'helloasso' && (
                                                                    <span className="text-xs text-emerald-600 font-medium">🟢 {paymentVerificationSuccess}</span>
                                                                )}
                                                                {paymentVerificationError && activePaymentConfig === 'helloasso' && (
                                                                    <span className="text-xs text-red-500 font-medium">🔴 {paymentVerificationError}</span>
                                                                )}
                                                            </div>

                                                            {/* User Guide for HelloAsso */}
                                                            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/60 text-[11px] text-slate-600 space-y-1.5 font-normal">
                                                                <span className="font-semibold text-emerald-700 flex items-center gap-1.5">💡 Comment trouver vos identifiants d&apos;API HelloAsso ?</span>
                                                                <p className="leading-relaxed">1. Connectez-vous à votre espace <a href="https://www.helloasso.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-emerald-600 hover:text-emerald-800">HelloAsso</a>.</p>
                                                                <p className="leading-relaxed">2. Dans le menu latéral de gauche, allez dans <strong>Mon compte</strong> puis cliquez sur <strong>Intégrations et API</strong>.</p>
                                                                <p className="leading-relaxed">3. Copiez l&apos;<strong>ID Client</strong> et le <strong>Secret Client</strong> du tableau, puis collez-les dans les champs correspondants ci-dessus.</p>
                                                                <p className="leading-relaxed">4. Le <strong>Slug de l&apos;association</strong> correspond au nom de votre association tel qu&apos;il apparaît dans l&apos;URL de votre page publique HelloAsso (ex: <code>mon-association-sportive</code>).</p>
                                                                <p className="leading-relaxed">5. <strong>Activez le Webhook automatique</strong> : Dans la même page d&apos;intégrations sur HelloAsso, ajoutez une URL de notification pointant vers : <code className="bg-slate-200/60 px-1 py-0.5 rounded text-[10px] select-all font-mono">https://api.votre-domaine.com/api/webhooks/helloasso</code>. HelloAsso générera une clé secrète de signature, qu&apos;il vous faudra coller dans le champ &quot;Secret de signature du Webhook&quot; ci-dessus.</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>


                                        {/* 2. LIEN DE PAIEMENT EXTERNE */}
                                        <div className="p-6 bg-white rounded-3xl border border-slate-200 space-y-5">
                                            <div className="flex items-start gap-6">
                                                <div className="text-xl -mt-0.5 leading-none">🔗</div>
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-slate-900 text-base">Lien de redirection / paiement externe</h4>
                                                    <div className="text-xs text-slate-500 font-normal leading-relaxed mt-1 space-y-1">
                                                        <p>• Utilisez une autre page internet pour permettre à vos utilisateurs de régler leur commande (votre site internet, HelloAsso, Zeffy, etc.).</p>
                                                        <p>• Le statut de la commande passe automatiquement à <span className="font-semibold text-amber-600">&quot;À valider&quot;</span>. Vous confirmez manuellement la réception du paiement dans la Gestion des commandes.</p>
                                                    </div>
                                                </div>
                                                <div className="w-80 pt-1">
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1 text-right">URL de redirection</label>
                                                    <input
                                                        type="url"
                                                        value={formData.payment_redirect_link || ""}
                                                        onChange={e => setFormData({ ...formData, payment_redirect_link: e.target.value })}
                                                        placeholder="https://www.helloasso.com/..."
                                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-normal focus:ring-4 focus:ring-blue-100 transition-all outline-none text-sm shadow-inner"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* 3. PAIEMENT DIFFÉRÉ */}
                                        <div className="p-6 bg-white rounded-3xl border border-slate-200 space-y-6">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-start gap-4 flex-1">
                                                    <div className="text-xl -mt-0.5 leading-none">🕐</div>
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold text-slate-900 text-base">Paiement différé / autres moyens de paiement (optionnel)</h4>
                                                        <div className="text-xs text-slate-500 font-normal leading-relaxed mt-1 space-y-1">
                                                            <p>• En activant l&apos;option de paiement différé, vous permettez à l&apos;utilisateur qui le souhaite de &quot;payer plus tard&quot; sa commande (chèque, espèces, virement...). Il n&apos;est pas redirigé vers Stripe ou votre URL.</p>
                                                            <p>• Vous pouvez activer cette option indépendamment pour les offres (boutique) et les événements.</p>
                                                            <p>• La commande est enregistrée au statut <span className="font-semibold text-orange-500">&quot;En attente&quot;</span> de paiement.</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-semibold text-slate-700">Autoriser pour les offres</span>
                                                        <span className="text-[10px] text-slate-400">Shop / Boutique</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setFormData({ ...formData, allow_pay_later_offers: !formData.allow_pay_later_offers })}
                                                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${formData.allow_pay_later_offers ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                    >
                                                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${formData.allow_pay_later_offers ? 'translate-x-6' : 'translate-x-1'}`} />
                                                    </button>
                                                </div>

                                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-semibold text-slate-700">Autoriser pour les évènements</span>
                                                        <span className="text-[10px] text-slate-400">Stages, Ateliers...</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setFormData({ ...formData, allow_pay_later_events: !formData.allow_pay_later_events })}
                                                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${formData.allow_pay_later_events ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                    >
                                                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${formData.allow_pay_later_events ? 'translate-x-6' : 'translate-x-1'}`} />
                                                    </button>
                                                </div>
                                            </div>

                                            {(formData.allow_pay_later_offers || formData.allow_pay_later_events) && (
                                                <div className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-t border-slate-100">
                                                    <div className="space-y-1">
                                                        <label className="block text-base font-medium text-slate-700 flex items-center gap-1.5">
                                                            <span>✉️</span>
                                                            <span>Instructions de paiement :</span>
                                                        </label>
                                                        <p className="text-[11px] text-slate-400 italic">Ces instructions seront envoyées par email par défaut si aucun moyen de paiement n&apos;est défini ou en cas de choix de paiement différé.</p>
                                                    </div>
                                                    <ReactQuill
                                                        theme="snow"
                                                        value={formData.confirmation_email_body || ""}
                                                        onChange={(val) => setFormData({ ...formData, confirmation_email_body: val })}
                                                        placeholder="Ex: Merci de bien vouloir nous remettre votre règlement lors de votre premier cours..."
                                                        modules={quillModules}
                                                        className="bg-white rounded-2xl overflow-hidden border border-slate-200 email-editor"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                </section>
                            </div>
                        )}

                        {/* DOCUMENTS TAB */}
                        {activeTab === "docs" && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* LEGAL INFO SECTION */}
                                <section className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-8">
                                    <div className="space-y-1">
                                        <h3 className="text-base font-medium flex items-center gap-2 text-slate-800">
                                            <span>🏛️</span>
                                            <span>Informations de facturation</span>
                                        </h3>
                                        <p className="text-xs text-slate-400 font-normal">Ces informations apparaîtront automatiquement sur les factures générées</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Raison sociale</label>
                                            <input
                                                type="text"
                                                value={formData.legal_name || ""}
                                                onChange={e => setFormData({ ...formData, legal_name: e.target.value })}
                                                placeholder="Ex: Association Sportive MonClub"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Forme juridique</label>
                                            <select
                                                value={formData.legal_form || ""}
                                                onChange={e => setFormData({ ...formData, legal_form: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-sm"
                                            >
                                                <option value="">Sélectionner...</option>
                                                <option value="Association loi 1901">Association loi 1901</option>
                                                <option value="SARL">SARL</option>
                                                <option value="SAS">SAS</option>
                                                <option value="SASU">SASU</option>
                                                <option value="EURL">EURL</option>
                                                <option value="Auto-entrepreneur">Auto-entrepreneur</option>
                                                <option value="SCI">SCI</option>
                                                <option value="Autre">Autre</option>
                                            </select>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Adresse du siège</label>
                                            <textarea
                                                value={formData.legal_address || ""}
                                                onChange={e => setFormData({ ...formData, legal_address: e.target.value })}
                                                placeholder="Ex: 12 rue de la Paix, 75002 Paris"
                                                rows={2}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-sm resize-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">SIRET</label>
                                            <input
                                                type="text"
                                                value={formData.legal_siret || ""}
                                                onChange={e => setFormData({ ...formData, legal_siret: e.target.value })}
                                                placeholder="Ex: 123 456 789 00012"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                N° TVA intracommunautaire <span className="text-slate-400 text-[10px] font-normal ml-1">(optionnel)</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.legal_vat_number || ""}
                                                onChange={e => setFormData({ ...formData, legal_vat_number: e.target.value })}
                                                placeholder="Ex: FR 12 345678901"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Mention TVA</label>
                                            <input
                                                type="text"
                                                value={formData.legal_vat_mention || ""}
                                                onChange={e => setFormData({ ...formData, legal_vat_mention: e.target.value })}
                                                placeholder="Ex: TVA non applicable, art. 293 B du CGI"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-sm"
                                            />
                                            <p className="text-[10px] text-slate-400 font-normal mt-1.5 ml-1">Cette mention sera affichée en pied de facture. Laissez par défaut si vous êtes en franchise de base.</p>
                                        </div>
                                    </div>
                                </section>

                                {/* DOCUMENTS SECTION */}
                                <section id="documents-legaux" className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                                    <div className="space-y-1">
                                        <h3 className="text-base font-medium flex items-center gap-2 text-slate-800">
                                            <span>📄</span>
                                            <span>Documents légaux</span>
                                        </h3>
                                        <p className="text-xs text-slate-400 font-normal">Publiez vos conditions générales et règlement intérieur</p>
                                    </div>

                                    <div className="space-y-4">
                                        {/* CGV Row */}
                                        <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 hover:border-slate-200 transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-xl group-hover:scale-105 transition-transform">📜</div>
                                                <div>
                                                    <h4 className="text-sm font-semibold text-slate-900">Conditions Générales</h4>
                                                    <p className="text-[10px] text-slate-400 font-normal">Obligatoire pour les paiements en ligne</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {formData.cgv_url && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="bg-emerald-50 text-emerald-600 text-[9px] font-bold px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
                                                            <span className="text-[10px]">✅</span> En ligne
                                                        </span>
                                                        <a href={`${API_URL}${formData.cgv_url}`} target="_blank" className="text-blue-600 text-[10px] font-semibold hover:underline">Voir</a>
                                                    </div>
                                                )}
                                                <input type="file" ref={cgvInputRef} className="hidden" accept=".pdf,.doc,.docx" onChange={e => handleFileUpload(e, 'cgv')} />
                                                <button 
                                                    onClick={() => cgvInputRef.current?.click()}
                                                    disabled={!!uploading}
                                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium text-[10px] transition-all shadow-sm disabled:opacity-50"
                                                >
                                                     {uploading === 'cgv' ? "Upload..." : "Charger"}
                                                </button>
                                            </div>
                                        </div>

                                        {/* RI Row */}
                                        <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 hover:border-slate-200 transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-xl group-hover:scale-105 transition-transform">📋</div>
                                                <div>
                                                    <h4 className="text-sm font-semibold text-slate-900">Règlement Intérieur</h4>
                                                    <p className="text-[10px] text-slate-400 font-normal">Optionnel mais recommandé</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {formData.rules_url && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="bg-emerald-50 text-emerald-600 text-[9px] font-bold px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
                                                            <span className="text-[10px]">✅</span> En ligne
                                                        </span>
                                                        <a href={`${API_URL}${formData.rules_url}`} target="_blank" className="text-blue-600 text-[10px] font-semibold hover:underline">Voir</a>
                                                    </div>
                                                )}
                                                <input type="file" ref={rulesInputRef} className="hidden" accept=".pdf,.doc,.docx" onChange={e => handleFileUpload(e, 'rules')} />
                                                <button 
                                                    onClick={() => rulesInputRef.current?.click()}
                                                    disabled={!!uploading}
                                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium text-[10px] transition-all shadow-sm disabled:opacity-50"
                                                >
                                                     {uploading === 'rules' ? "Upload..." : "Charger"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === "home_design" && (() => {
                            const layoutVal = formData.user_home_layout || "both";
                            const isHeaderEnabled = layoutVal === "both" || layoutVal === "header";
                            const isVignettesEnabled = layoutVal === "both" || layoutVal === "vignettes";

                            const handleToggleHeader = (checked: boolean) => {
                                let nextLayout = "none";
                                if (checked && isVignettesEnabled) {
                                    nextLayout = "both";
                                } else if (checked && !isVignettesEnabled) {
                                    nextLayout = "header";
                                } else if (!checked && isVignettesEnabled) {
                                    nextLayout = "vignettes";
                                }
                                setFormData({ ...formData, user_home_layout: nextLayout });
                            };

                            const handleToggleVignettes = (checked: boolean) => {
                                let nextLayout = "none";
                                if (isHeaderEnabled && checked) {
                                    nextLayout = "both";
                                } else if (isHeaderEnabled && !checked) {
                                    nextLayout = "header";
                                } else if (!isHeaderEnabled && checked) {
                                    nextLayout = "vignettes";
                                }
                                setFormData({ ...formData, user_home_layout: nextLayout });
                            };

                            return (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    {/* Description de la Personnalisation Visuelle + Aperçu de l'écran d'accueil */}
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch animate-in fade-in duration-300">
                                        <div className="lg:col-span-2 bg-blue-50/70 rounded-3xl p-6 border border-blue-100 shadow-sm flex items-start gap-4">
                                            <span className="text-2xl text-blue-600 select-none mt-0.5">ℹ️</span>
                                            <div className="space-y-2 flex-1">
                                                <h4 className="text-sm font-bold text-slate-900">
                                                    Personnalisation de la page d&apos;accueil de Rezea :
                                                </h4>
                                                <p className="text-xs text-slate-600 font-normal leading-relaxed">
                                                    Rezea vous permet de personnaliser et dynamiser votre page d&apos;accueil avec votre logo auquel vous pouvez ajouter le nom de votre établissement, une couleur d&apos;accentuation et d&apos;intégrer des visuels optionnels pour enrichir l&apos;expérience quotidienne de vos utilisateurs, promouvoir des événements ou mettre en avant des offres spéciales :
                                                </p>
                                                <ul className="text-xs text-slate-600 font-normal list-disc pl-5 space-y-1.5">
                                                    <li>Une image en format horizontal toute largeur à laquelle vous pouvez ajouter un texte court dynamique</li>
                                                    <li>Un carrousel d&apos;images en format vignettes verticales (jusqu&apos;à 5 visuels)</li>
                                                </ul>
                                                <p className="text-xs text-slate-500 italic font-normal pt-1">
                                                    Le carrousel s&apos;affiche sous le bandeau lorsque les deux options sont activées.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center">
                                            <label className="block text-sm font-semibold text-slate-900 mb-1">
                                                Aperçu de l&apos;écran d&apos;accueil
                                            </label>
                                            <span className="block text-slate-400 text-[10px] font-normal mb-4 max-w-[200px]">
                                                Visualisez le rendu final de l&apos;interface utilisateur en temps réel
                                            </span>
                                            <button 
                                                onClick={() => setShowHomePreview(true)}
                                                className="w-full max-w-[200px] py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium text-xs transition-all shadow-md flex items-center justify-center active:scale-95"
                                            >
                                                Visualiser le rendu
                                            </button>
                                        </div>
                                    </div>

                                    {/* Configuration de base de l'interface */}
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                        {/* 1. Affichage de l'en-tête de l'écran d'accueil */}
                                        <div className="pb-6 border-b md:border-b-0 md:border-r border-slate-100 pr-0 md:pr-8">
                                            <label className="block text-sm font-semibold text-slate-900 mb-2">
                                                Affichage de l&apos;en-tête de l&apos;écran d&apos;accueil *
                                            </label>
                                            <div className="flex flex-col gap-2.5 pl-1 mb-4">
                                                <label className="flex items-center gap-3 cursor-pointer group select-none">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={formData.user_header_show_logo !== false}
                                                        onChange={e => {
                                                            const newChecked = e.target.checked;
                                                            if (!newChecked && formData.user_header_show_name === false) {
                                                                return;
                                                            }
                                                            setFormData({ ...formData, user_header_show_logo: newChecked });
                                                        }}
                                                        className="w-4 h-4"
                                                    />
                                                    <span className="text-xs font-light text-slate-600 group-hover:text-slate-900 transition-colors">Logo de l&apos;établissement</span>
                                                </label>
                                                
                                                <label className="flex items-center gap-3 cursor-pointer group select-none">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={formData.user_header_show_name !== false}
                                                        onChange={e => {
                                                            const newChecked = e.target.checked;
                                                            if (!newChecked && formData.user_header_show_logo === false) {
                                                                return;
                                                            }
                                                            setFormData({ ...formData, user_header_show_name: newChecked });
                                                        }}
                                                        className="w-4 h-4"
                                                    />
                                                    <span className="text-xs font-light text-slate-600 group-hover:text-slate-900 transition-colors">Nom de l&apos;établissement</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* 2. Personnalisation de la couleur */}
                                        <div className="pl-0 md:pl-8">
                                            <label className="block text-sm font-semibold text-slate-900 mb-1">
                                                Personnalisation de la couleur
                                            </label>
                                            <span className="block text-slate-400 text-[10px] font-normal mb-3">
                                                Choisissez une couleur foncée à médium pour la visibilité de l&apos;interface utilisateur
                                            </span>
                                            <div className="flex items-center gap-3 p-2.5 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-[200px]">
                                                <input
                                                    type="color"
                                                    value={formData.primary_color || "#7c3aed"}
                                                    onChange={e => setFormData({ ...formData, primary_color: e.target.value })}
                                                    className="w-9 h-9 rounded-xl border-2 border-white shadow-sm cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={formData.primary_color || "#7c3aed"}
                                                    onChange={e => setFormData({ ...formData, primary_color: e.target.value })}
                                                    className="bg-transparent border-none p-0 font-mono font-bold text-xs outline-none w-20 text-slate-600"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Grille Side-by-Side */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                                        {/* Configuration du Bandeau Supérieur */}
                                        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                                <div className="space-y-0.5">
                                                    <h3 className="text-sm font-semibold text-slate-900">Bandeau supérieur</h3>
                                                    <p className="text-[10px] text-slate-400 font-normal">Afficher une image format paysage en toute largeur</p>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isHeaderEnabled} 
                                                        onChange={e => handleToggleHeader(e.target.checked)} 
                                                        className="sr-only peer" 
                                                    />
                                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                                </label>
                                            </div>

                                            {isHeaderEnabled && (
                                                <div className="space-y-6 pt-2 animate-in fade-in duration-200">
                                                    {/* Image à afficher dans le bandeau */}
                                                    <div className="space-y-3">
                                                        <div 
                                                            onClick={() => bannerInputRef.current?.click()}
                                                            className="w-full h-64 rounded-3xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group cursor-pointer"
                                                        >
                                                            {previewBanner ? (
                                                                <>
                                                                    <img src={previewBanner} className="w-full h-full object-cover" alt="Banner" />
                                                                    <button 
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setPreviewBanner(null);
                                                                            setFormData({ ...formData, banner_url: "" });
                                                                        }}
                                                                        className="absolute top-4 right-4 p-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-xl transition-all shadow-sm z-20"
                                                                        title="Supprimer l'image"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                        </svg>
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 group-hover:text-slate-500 transition-colors">
                                                                    <span className="text-3xl mb-1">🏞️</span>
                                                                    <span className="text-[11px] font-medium text-slate-500">Charger un visuel</span>
                                                                    <span className="text-[10px] text-slate-400 mt-0.5">(max. 5 Mo)</span>
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <button 
                                                                    type="button"
                                                                    className="p-3 bg-white rounded-2xl text-slate-900 shadow-2xl scale-90 group-hover:scale-100 transition-transform"
                                                                >
                                                                    <span className="text-lg">📸</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'banner')} />
                                                    </div>

                                                    {/* Accroche textuelle sous l'image */}
                                                    <div className="space-y-4 pt-4 border-t border-slate-100">
                                                        <label className="block text-sm font-semibold text-slate-700">Accroche textuelle sur le bandeau</label>
                                                        
                                                        <div className="space-y-4">
                                                            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
                                                                <label className="text-[11px] font-medium text-slate-500">Titre d'accroche principal :</label>
                                                                <input 
                                                                    type="text"
                                                                    value={formData.header_title || ""}
                                                                    onChange={e => setFormData({ ...formData, header_title: e.target.value })}
                                                                    placeholder="Ex: Bienvenue dans votre club !"
                                                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-xs text-slate-700"
                                                                />
                                                            </div>

                                                            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
                                                                <label className="text-[11px] font-medium text-slate-500">Sous-titre / Message secondaire :</label>
                                                                <input 
                                                                    type="text"
                                                                    value={formData.header_subtitle || ""}
                                                                    onChange={e => setFormData({ ...formData, header_subtitle: e.target.value })}
                                                                    placeholder="Ex: Réservez votre séance du jour"
                                                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-xs text-slate-700"
                                                                />
                                                            </div>

                                                            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
                                                                <label className="text-[11px] font-medium text-slate-500">Couleur du texte d'accroche :</label>
                                                                <div className="flex items-center gap-2.5 p-2 bg-white rounded-2xl border border-slate-200 max-w-[200px]">
                                                                    <input 
                                                                        type="color"
                                                                        value={formData.header_text_color || "#ffffff"}
                                                                        onChange={e => setFormData({ ...formData, header_text_color: e.target.value })}
                                                                        className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer shadow-sm"
                                                                    />
                                                                    <input 
                                                                        type="text"
                                                                        value={formData.header_text_color || "#ffffff"}
                                                                        onChange={e => setFormData({ ...formData, header_text_color: e.target.value })}
                                                                        className="bg-transparent border-none p-0 font-mono font-semibold text-[10px] outline-none w-16 text-slate-700"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
                                                                <label className="text-[11px] font-medium text-slate-500">Arrière-plan du texte :</label>
                                                                <select
                                                                    value={formData.header_text_bg || "none"}
                                                                    onChange={e => setFormData({ ...formData, header_text_bg: e.target.value })}
                                                                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-xs text-slate-700"
                                                                >
                                                                    <option value="none">Aucun (texte brut)</option>
                                                                    <option value="dark_overlay">Voile sombre complet</option>
                                                                    <option value="light_overlay">Voile clair complet</option>
                                                                    <option value="pill_dark">Capsule sombre</option>
                                                                    <option value="pill_light">Capsule claire</option>
                                                                </select>
                                                            </div>

                                                            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
                                                                <label className="text-[11px] font-medium text-slate-500">Positionnement horizontal :</label>
                                                                <select
                                                                    value={formData.header_text_pos_x || "center"}
                                                                    onChange={e => setFormData({ ...formData, header_text_pos_x: e.target.value })}
                                                                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-xs text-slate-700"
                                                                >
                                                                    <option value="left">Gauche</option>
                                                                    <option value="center">Centre</option>
                                                                    <option value="right">Droite</option>
                                                                </select>
                                                            </div>

                                                            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
                                                                <label className="text-[11px] font-medium text-slate-500">Positionnement vertical :</label>
                                                                <select
                                                                    value={formData.header_text_pos_y || "center"}
                                                                    onChange={e => setFormData({ ...formData, header_text_pos_y: e.target.value })}
                                                                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-xs text-slate-700"
                                                                >
                                                                    <option value="top">Haut</option>
                                                                    <option value="center">Milieu</option>
                                                                    <option value="bottom">Bas</option>
                                                                </select>
                                                            </div>

                                                            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
                                                                <label className="text-[11px] font-medium text-slate-500">Animation d'apparition :</label>
                                                                <select
                                                                    value={formData.header_text_animation || "none"}
                                                                    onChange={e => setFormData({ ...formData, header_text_animation: e.target.value })}
                                                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-xs text-slate-700"
                                                                >
                                                                    <option value="none">Aucune (apparition statique)</option>
                                                                    <option value="fade">Fondu d'apparition (Fade-in)</option>
                                                                    <option value="scale">Zoom doux (Scale-in)</option>
                                                                    <option value="flash">Effet Flash subtil</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Gestion des Vignettes */}
                                        <VignettesEditor 
                                            vignettes={formData.vignettes || []} 
                                            onChange={(newVignettes) => setFormData({ ...formData, vignettes: newVignettes })} 
                                            isEnabled={isVignettesEnabled}
                                            onToggle={handleToggleVignettes}
                                            title={formData.vignettes_title || "À la une"}
                                            onTitleChange={(newTitle) => setFormData({ ...formData, vignettes_title: newTitle })}
                                        />
                                    </div>
                                </div>
                            );
                        })()}
                </div>
            </div>

                {/* PORTAL PREVIEW MODAL */}
                {showPreview && (
                    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
                        {/* Modal Header */}
                        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-4">
                                <h2 className="text-lg font-bold text-slate-900">Aperçu du Portail</h2>
                                <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                                    <button 
                                        onClick={() => setPreviewMode("desktop")}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${previewMode === "desktop" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                    >
                                        Ordinateur
                                    </button>
                                    <button 
                                        onClick={() => setPreviewMode("mobile")}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${previewMode === "mobile" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                    >
                                        Mobile
                                    </button>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowPreview(false)}
                                className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-all font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Content - The actual Mock Portal */}
                        <div className="flex-1 overflow-auto p-4 md:p-12 flex items-center justify-center">
                            <div className={`bg-white shadow-2xl overflow-hidden transition-all duration-500 ${previewMode === "mobile" ? "w-[375px] h-[667px] rounded-3xl border-[8px] border-slate-900" : "w-full max-w-5xl h-[600px] rounded-3xl"}`}>
                                <div className={`h-full flex ${previewMode === "mobile" ? "flex-col overflow-y-auto no-scrollbar" : "flex-row"} bg-white`} style={{ "--primary-color": formData.login_primary_color || formData.primary_color || "#0f172a" } as any}>
                                    
                                    {/* Left Branding Panel */}
                                    <div className={`${previewMode === "mobile" ? "w-full pt-10 pb-8 px-6 text-center" : "w-[40%] p-12 text-center"} relative z-20 bg-white flex flex-col justify-center`}>
                                        <div className="flex flex-col items-center space-y-6 md:space-y-8 text-center w-full">
                                            {/* Logo & Name Header */}
                                            <div className={`flex flex-col ${previewMode === "mobile" ? "gap-4" : "gap-8"} items-center justify-center text-center w-full`}>
                                                {formData.show_logo !== false && (
                                                    previewLogo ? (
                                                        <img 
                                                            src={previewLogo} 
                                                            alt={formData.name} 
                                                            className={`${previewMode === "mobile" ? "h-12" : "h-16"} object-contain`} 
                                                        />
                                                    ) : (
                                                        <div 
                                                            className={`${previewMode === "mobile" ? "h-12 w-12 text-xl" : "h-16 w-16 text-2xl"} rounded-2xl flex items-center justify-center text-white font-bold shadow-sm`}
                                                            style={{ backgroundColor: formData.login_primary_color || formData.primary_color || "#0f172a" }}
                                                        >
                                                            {(formData.name || "REZEA").substring(0, 2).toUpperCase()}
                                                        </div>
                                                    )
                                                )}
                                                
                                                <div className="flex flex-col gap-1 items-center justify-center text-center w-full">
                                                    {formData.show_name !== false && (
                                                        <h1 className={`${previewMode === "mobile" ? "text-xl" : "text-2xl lg:text-3xl"} font-medium tracking-tight leading-none text-slate-900`}>
                                                            {formData.name || "REZEA"}
                                                        </h1>
                                                    )}
                                                    
                                                    {formData.show_slogan !== false && formData.slogan && (
                                                        <p className="text-[11px] md:text-xs font-medium text-slate-400 italic">
                                                            {formData.slogan}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <div className="text-center w-full">
                                                <div 
                                                    className="portal-description text-xs md:text-sm text-slate-500 font-medium leading-relaxed pointer-events-none"
                                                    dangerouslySetInnerHTML={{ __html: formData.login_description || "<p>Votre description apparaîtra ici...</p>" }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Panel (Image & Form) */}
                                    <div className={`relative ${previewMode === "mobile" ? "w-full min-h-[350px] flex-1 pb-10 px-4" : "flex-1"} flex items-center justify-center overflow-hidden bg-white`}>
                                        {/* Background Image logic mirror */}
                                        {previewLoginBg ? (
                                            <div className="absolute inset-0">
                                                <img src={previewLoginBg} className="w-full h-full object-cover grayscale-[10%]" alt="" />
                                                <div className={`absolute top-0 left-0 w-full h-full ${previewMode === "mobile" ? "bg-gradient-to-b from-white via-white/40 to-transparent" : "bg-gradient-to-r from-white via-white/10 to-transparent"} z-10`} />
                                                <div className="absolute inset-0 bg-slate-900/10 z-0" />
                                            </div>
                                        ) : (
                                            <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(circle at center, ${formData.primary_color}, transparent)` }} />
                                        )}
                                        
                                        {/* Mock Form */}
                                        <div className="relative z-20 w-full max-w-[280px] scale-90 md:scale-95">
                                            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 space-y-4">
                                                <h4 className="text-xs font-semibold text-slate-800">Accédez à votre espace</h4>
                                                <div className="space-y-2.5">
                                                    <div className="h-8 bg-slate-50 border border-slate-150 rounded-lg animate-pulse" />
                                                    <div className="h-8 bg-slate-50 border border-slate-150 rounded-lg animate-pulse" />
                                                </div>
                                                <div className="h-8 rounded-lg" style={{ backgroundColor: formData.login_primary_color || formData.primary_color || "#0f172a" }} />
                                                <div className="text-[9px] text-center text-slate-400 font-medium">Pas encore de compte ? S&apos;inscrire</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* HOME PREVIEW MODAL */}
                {showHomePreview && (() => {
                    const layoutVal = formData.user_home_layout || "both";
                    const isHeaderEnabled = layoutVal === "both" || layoutVal === "header";
                    const isVignettesEnabled = layoutVal === "both" || layoutVal === "vignettes";

                    const posY = formData.header_text_pos_y || "center";
                    const posX = formData.header_text_pos_x || "center";
                    const alignY = posY === "top" ? "justify-start" : posY === "bottom" ? "justify-end" : "justify-center";
                    const alignX = posX === "left" ? "items-start text-left" : posX === "right" ? "items-end text-right" : "items-center text-center";
                    const animation = formData.header_text_animation || "none";

                    return (
                        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300">
                            {/* Modal Header */}
                            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-4">
                                    <h2 className="text-lg font-bold text-slate-900">Aperçu de l'écran d'accueil</h2>
                                    <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                                        <button 
                                            onClick={() => setPreviewMode("desktop")}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${previewMode === "desktop" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                        >
                                            Ordinateur
                                        </button>
                                        <button 
                                            onClick={() => setPreviewMode("mobile")}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${previewMode === "mobile" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                        >
                                            Mobile
                                        </button>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setShowHomePreview(false)}
                                    className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-all font-bold"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center items-start bg-slate-100/50">
                                <div className={`bg-white shadow-2xl transition-all duration-500 overflow-hidden relative ${previewMode === "desktop" ? "w-full max-w-5xl rounded-2xl" : "w-[375px] h-[667px] rounded-[3rem] border-[8px] border-slate-900 shadow-black/20"}`}>
                                    <div className={`h-full overflow-y-auto no-scrollbar flex flex-col bg-white ${previewMode === "mobile" ? "pt-8" : ""}`}>
                                        <div className={`w-full mx-auto flex flex-col bg-white ${previewMode === "desktop" ? "max-w-4xl px-8 pt-8" : ""}`}>
                                            <div className={`${previewMode === "desktop" ? "lg:grid lg:grid-cols-2 lg:gap-12 lg:items-start" : ""}`}>
                                                <div className="flex flex-col">
                                                    <header className={`px-5 py-3 flex items-center justify-between mb-3`}>
                                                        <div className="flex items-center gap-3">
                                                            {formData.user_header_show_logo !== false && (
                                                                previewLogo ? (
                                                                    <img src={previewLogo} className="h-14 w-14 object-contain" alt="Logo" />
                                                                ) : (
                                                                    <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-sm font-semibold">
                                                                        {formData.name?.[0]?.toUpperCase() || 'R'}
                                                                    </div>
                                                                )
                                                            )}
                                                            {formData.user_header_show_name !== false && (
                                                                <span className="text-sm font-medium tracking-tight text-slate-800 truncate max-w-[200px]">
                                                                    {formData.name || "rezea"}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </header>

                                                    {/* Banner */}
                                                    {isHeaderEnabled && (
                                                        <div className="relative mb-6 px-5">
                                                            <div 
                                                                className="aspect-video w-full shadow-lg relative bg-slate-50 border border-slate-100 overflow-hidden rounded-xl group"
                                                                style={{ 
                                                                    background: previewBanner 
                                                                        ? `url(${previewBanner}) center/cover no-repeat` 
                                                                        : `linear-gradient(135deg, ${formData.primary_color}20, ${formData.primary_color}40)` 
                                                                }}
                                                            >
                                                                {/* Background Overlay Styles */}
                                                                {formData.header_text_bg === "dark_overlay" && (
                                                                    <div className="absolute inset-0 bg-black/45" />
                                                                )}
                                                                {formData.header_text_bg === "light_overlay" && (
                                                                    <div className="absolute inset-0 bg-white/45" />
                                                                )}
                                                                {previewBanner && formData.header_text_bg !== "dark_overlay" && formData.header_text_bg !== "light_overlay" && (
                                                                    <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-all duration-700" />
                                                                )}

                                                                {/* Text Overlay Content */}
                                                                {(formData.header_title || formData.header_subtitle) && (
                                                                    <div className={`absolute inset-0 p-4 flex flex-col ${alignY} ${alignX}`}>
                                                                        {formData.header_text_bg === "pill_dark" || formData.header_text_bg === "pill_light" ? (
                                                                            <div className={`${
                                                                                formData.header_text_bg === "pill_dark"
                                                                                    ? "bg-black/65 text-white border border-white/10"
                                                                                    : "bg-white/85 text-slate-800 border border-slate-100 shadow-lg"
                                                                            } backdrop-blur-md px-4 py-2.5 rounded-2xl max-w-[90%] inline-flex flex-col gap-0.5 ${alignX}`}>
                                                                                {formData.header_title && (
                                                                                    <h2 
                                                                                        className={`text-[11px] md:text-xs font-medium tracking-tight ${
                                                                                            animation === "fade" ? "anim-fade" : animation === "flash" ? "anim-flash" : animation === "scale" ? "anim-scale" : ""
                                                                                        }`}
                                                                                        style={{ color: formData.header_text_bg === "pill_dark" ? undefined : formData.header_text_color }}
                                                                                    >
                                                                                        {formData.header_title}
                                                                                    </h2>
                                                                                )}
                                                                                {formData.header_subtitle && (
                                                                                    <p className={`text-[10px] md:text-xs font-medium opacity-90 ${animation === "fade" ? "anim-fade" : ""}`}>
                                                                                        {formData.header_subtitle}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <div className={`max-w-[90%] flex flex-col gap-0.5 ${alignX}`} style={{ color: formData.header_text_color || "#ffffff" }}>
                                                                                {formData.header_title && (
                                                                                    <h2 
                                                                                        className={`text-[11px] md:text-xs font-medium tracking-tight ${
                                                                                            animation === "fade" ? "anim-fade" : animation === "flash" ? "anim-flash" : animation === "scale" ? "anim-scale" : ""
                                                                                        }`}
                                                                                    >
                                                                                        {formData.header_title}
                                                                                    </h2>
                                                                                )}
                                                                                {formData.header_subtitle && (
                                                                                    <p className={`text-[10px] md:text-xs font-medium opacity-90 ${animation === "fade" ? "anim-fade" : ""}`}>
                                                                                        {formData.header_subtitle}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                
                                                                {!previewBanner && !(formData.header_title || formData.header_subtitle) && (
                                                                    <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                                                                        <span className="text-4xl opacity-20">✨</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Vignettes Carousel */}
                                                    {isVignettesEnabled && formData.vignettes && formData.vignettes.length > 0 && (
                                                        <div className="px-5 mb-6">
                                                            <h3 className="text-xs font-bold text-slate-800 mb-2 tracking-tight">{formData.vignettes_title || "À la une"}</h3>
                                                            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1">
                                                                {formData.vignettes.map((vig) => (
                                                                    <div 
                                                                        key={vig.id}
                                                                        className="w-[38%] flex-shrink-0 snap-start aspect-[3/4] rounded-xl overflow-hidden border border-slate-100 relative shadow-sm transition-all group"
                                                                    >
                                                                        <div className="relative w-full h-full">
                                                                            {vig.image_url ? (
                                                                                <img 
                                                                                    src={vig.image_url.startsWith('http') ? vig.image_url : `${API_URL}${vig.image_url}`} 
                                                                                    alt={vig.title || "Vignette"} 
                                                                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                                                                                />
                                                                            ) : (
                                                                                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-xs text-slate-400">🏞️</div>
                                                                            )}
                                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                                                            {vig.title && (
                                                                                <div className="absolute bottom-2 left-2 right-2 text-white">
                                                                                    <p className="text-[10px] font-bold leading-tight tracking-tight">{vig.title}</p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-col px-5 pb-8 gap-3">
                                                    <div 
                                                        className="w-full flex items-center justify-between px-5 py-4 bg-white border rounded-xl shadow-sm"
                                                        style={{ 
                                                            boxShadow: `0 4px 12px -2px ${formData.primary_color}25`,
                                                            borderColor: `${formData.primary_color}20`
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-3.5">
                                                            <span className="text-2xl shrink-0">🗓️</span>
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-xs font-medium text-slate-800">Planning & réservations</span>
                                                                <span className="text-[10px] font-normal text-slate-500">Réservez votre prochaine séance</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div 
                                                        className="w-full flex items-center justify-between px-5 py-4 bg-white border rounded-xl shadow-sm"
                                                        style={{ 
                                                            boxShadow: `0 4px 12px -2px ${formData.primary_color}20`,
                                                            borderColor: `${formData.primary_color}15`
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-3.5">
                                                            <span className="text-2xl shrink-0">🛍️</span>
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-xs font-medium text-slate-800">Boutique</span>
                                                                <span className="text-[10px] font-normal text-slate-500">Créditez votre compte</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div 
                                                        className="w-full flex items-center justify-between px-5 py-4 bg-white border rounded-xl shadow-sm"
                                                        style={{ 
                                                            boxShadow: `0 4px 12px -2px ${formData.primary_color}20`,
                                                            borderColor: `${formData.primary_color}15`
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-3.5">
                                                            <span className="text-2xl shrink-0">📦</span>
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-xs font-medium text-slate-800">Mes commandes</span>
                                                                <span className="text-[10px] font-normal text-slate-500">Consultez vos offres et évènements</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {previewMode === "mobile" && (
                                            <div className="mt-auto border-t border-slate-100 flex items-center justify-around py-3 px-2 bg-white/72 backdrop-blur-md">
                                                <div className="flex flex-col items-center gap-0.5 transition-all duration-300" style={{ color: formData.primary_color }}>
                                                    <span className="text-base">🏠</span>
                                                    <span className="text-[9px] font-bold">Accueil</span>
                                                </div>
                                                <div className="flex flex-col items-center gap-0.5 opacity-50 text-slate-500">
                                                    <span className="text-base">🗓️</span>
                                                    <span className="text-[9px] font-medium">Planning</span>
                                                </div>
                                                <div className="flex flex-col items-center gap-0.5 opacity-50 text-slate-500">
                                                    <span className="text-base">🛍️</span>
                                                    <span className="text-[9px] font-medium">Boutique</span>
                                                </div>
                                                <div className="flex flex-col items-center gap-0.5 opacity-50 text-slate-500">
                                                    <span className="text-base">📦</span>
                                                    <span className="text-[9px] font-medium">Commandes</span>
                                                </div>
                                                <div className="flex flex-col items-center gap-0.5 opacity-50 text-slate-500">
                                                    <span className="text-base">👤</span>
                                                    <span className="text-[9px] font-medium">Profil</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white border-t border-slate-200 px-8 py-4 flex items-center justify-center gap-2">
                                <p className="text-xs text-slate-400 italic">Ceci est une simulation basée sur vos réglages actuels</p>
                            </div>
                        </div>
                    );
                })()}

                {/* Save button at the bottom */}
                <div className="flex justify-end mt-8 pt-6 border-t border-slate-200">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium text-sm transition-all shadow-sm shadow-slate-200 disabled:opacity-50 flex items-center gap-2 active:scale-95"
                    >
                        {saving ? "Enregistrement..." : "Enregistrer les modifications"}
                    </button>
                </div>
            </main>

            <style jsx global>{`
                .ql-container.ql-snow { border: none !important; font-family: inherit; }
                .ql-toolbar.ql-snow { border: none !important; border-bottom: 1px solid #f1f5f9 !important; background: #f8fafc; padding: 12px 16px !important; }
                .ql-editor { font-size: 16px; line-height: 1.6; color: #1e293b; min-height: 200px; padding: 24px !important; }
                .email-editor .ql-editor { font-size: 14px !important; }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                
                /* Portal Description Styles in Preview */
                .portal-description p { margin-bottom: 0.75rem; color: var(--primary-color); }
                @media (min-width: 768px) {
                    .portal-description p { margin-bottom: 1.5rem; }
                }
                .portal-description h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem; color: #1e293b; }
                .portal-description ul { 
                    display: inline-block;
                    text-align: left;
                    list-style: none; 
                    padding: 0; 
                    margin-bottom: 0.75rem; 
                }
                .portal-description li { position: relative; padding-left: 1.25rem; margin-bottom: 0.4rem; font-size: 0.9em; }
                .portal-description li::before {
                    content: "";
                    position: absolute;
                    left: 0;
                    top: 0.25rem;
                    width: 0.8rem;
                    height: 0.8rem;
                    background-color: var(--primary-color);
                    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
                    mask-repeat: no-repeat;
                    mask-size: contain;
                    mask-position: center;
                    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
                    -webkit-mask-repeat: no-repeat;
                    -webkit-mask-size: contain;
                    -webkit-mask-position: center;
                }
            `}</style>
        </div>
    );
}

interface VignettesEditorProps {
    vignettes: Vignette[];
    onChange: (vignettes: Vignette[]) => void;
    isEnabled: boolean;
    onToggle: (checked: boolean) => void;
    title: string;
    onTitleChange: (title: string) => void;
}

function VignettesEditor({ vignettes, onChange, isEnabled, onToggle, title, onTitleChange }: VignettesEditorProps) {
    const [uploadingId, setUploadingId] = useState<string | null>(null);

    const handleAdd = () => {
        if (vignettes.length >= 5) return;
        const newVig: Vignette = {
            id: `vig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            image_url: "",
            title: "",
            link_url: ""
        };
        onChange([...vignettes, newVig]);
    };

    const handleRemove = (id: string) => {
        onChange(vignettes.filter(v => v.id !== id));
    };

    const handleChange = (id: string, field: keyof Vignette, value: any) => {
        onChange(vignettes.map(v => v.id === id ? { ...v, [field]: value } : v));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingId(id);
        try {
            const res = await api.uploadImage(file);
            handleChange(id, 'image_url', res.url);
        } catch (err: any) {
            alert(err.response?.data?.detail || "Erreur lors de l'upload de l'image");
        } finally {
            setUploadingId(null);
        }
    };

    return (
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                    <label className="block text-sm font-semibold text-slate-900 cursor-default">
                        Carrousel de vignettes
                    </label>
                    <p className="text-[10px] text-slate-400 font-normal">Afficher un carrousel d&apos;images format portrait</p>
                </div>
                <div className="flex items-center gap-4">
                    {isEnabled && (
                        <span className="text-xs text-slate-500 font-medium">{vignettes.length} / 5 vignettes</span>
                    )}
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input 
                            type="checkbox" 
                            checked={isEnabled} 
                            onChange={e => onToggle(e.target.checked)} 
                            className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
            </div>

            {isEnabled && (
                <div className="pt-2 space-y-6">
                    <div className="grid grid-cols-[180px_1fr] items-center gap-4 border-b border-slate-100 pb-4">
                        <label className="text-[11px] font-medium text-slate-500">Titre du carrousel :</label>
                        <input 
                            type="text"
                            value={title || ""}
                            onChange={e => onTitleChange(e.target.value)}
                            placeholder="Ex: À la une, Actualités, Offres..."
                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-normal text-xs text-slate-700"
                        />
                    </div>

                    {vignettes.length === 0 ? (
                        <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                            <span className="text-3xl block mb-2">📱</span>
                            <p className="text-sm font-semibold text-slate-600 mb-1">Aucune vignette configurée</p>
                            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4 leading-relaxed">
                                Ajoutez jusqu'à 5 vignettes avec des images au format vertical qui s'afficheront sur l'accueil client.
                            </p>
                            <button
                                type="button"
                                onClick={handleAdd}
                                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                            >
                                + Ajouter une première vignette
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {vignettes.map((v, index) => (
                                <div key={v.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4 items-start relative group">
                                    
                                    {/* Number label */}
                                    <div className="absolute left-4 -top-3 px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full border border-slate-300">
                                        Vignette {index + 1}
                                    </div>

                                    {/* Image upload box */}
                                    <div className="w-full md:w-32 aspect-[3/4] bg-white border border-slate-300 rounded-xl overflow-hidden relative flex flex-col items-center justify-center shrink-0">
                                        {v.image_url ? (
                                            <>
                                                <img src={`${API_URL}${v.image_url}`} className="w-full h-full object-cover" alt={`Vignette ${index + 1}`} />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <label className="p-2 bg-white rounded-full text-slate-900 shadow-lg cursor-pointer hover:scale-105 transition-all">
                                                        <span>📷</span>
                                                        <input 
                                                            type="file" 
                                                            accept="image/*" 
                                                            className="hidden" 
                                                            onChange={e => handleFileChange(e, v.id)} 
                                                        />
                                                    </label>
                                                </div>
                                            </>
                                        ) : (
                                            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-50 transition-colors p-2 text-center">
                                                <span className="text-xl mb-1">🖼️</span>
                                                <span className="text-[10px] font-medium text-slate-500">
                                                    {uploadingId === v.id ? "Upload..." : "Charger un visuel"}
                                                </span>
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    className="hidden" 
                                                    onChange={e => handleFileChange(e, v.id)} 
                                                    disabled={uploadingId !== null}
                                                />
                                            </label>
                                        )}
                                    </div>

                                    {/* Fields */}
                                    <div className="flex-1 w-full space-y-3 pt-2">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Titre de la vignette (affiché sur l'image)</label>
                                            <input 
                                                type="text"
                                                value={v.title || ""}
                                                onChange={e => handleChange(v.id, 'title', e.target.value)}
                                                placeholder="Ex: Nouveaux cours de Yoga"
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-xs text-slate-700"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Lien de redirection (URL ou route interne)</label>
                                            <input 
                                                type="text"
                                                value={v.link_url || ""}
                                                onChange={e => handleChange(v.id, 'link_url', e.target.value)}
                                                placeholder="Ex: /home/booking ou URL externe"
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-xs text-slate-700"
                                            />
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="w-full md:w-auto self-stretch flex md:flex-col justify-end pt-2">
                                        <button
                                            type="button"
                                            onClick={() => handleRemove(v.id)}
                                            className="px-3 py-1.5 md:py-2 text-[10px] font-bold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition-all uppercase tracking-wider"
                                        >
                                            Supprimer
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {vignettes.length < 5 && (
                                <button
                                    type="button"
                                    onClick={handleAdd}
                                    className="w-full py-3 border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-2xl text-xs font-semibold text-slate-600 hover:text-slate-700 bg-white hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                >
                                    + Ajouter une vignette ({vignettes.length} / 5)
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

