"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { api, User, Tenant } from "@/lib/api";
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
    { id: "portal", label: "Portail", icon: "🌐" },
    { id: "rules", label: "Règles", icon: "⚖️" },
    { id: "payment", label: "Paiements", icon: "💳" },
    { id: "docs", label: "Documents légaux", icon: "📁" },
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
    const [showPreview, setShowPreview] = useState(false);
    const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("mobile");

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
        <div className="min-h-screen bg-[#f8fafc] flex flex-col md:flex-row font-sans text-slate-900">
            <Sidebar user={user} />
            <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">⚙️ Paramètres</h1>
                            <p className="text-base font-normal text-slate-500 mt-1">Gérez l&apos;identité, les règles et les options de votre club</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm transition-all shadow-sm shadow-slate-200 disabled:opacity-50 flex items-center gap-2 active:scale-95"
                            >
                                {saving ? "Enregistrement..." : "Enregistrer les modifications"}
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
                    <div className="flex items-center bg-slate-100/50 p-1 rounded-2xl border border-slate-200/60 mb-10 shadow-sm overflow-x-auto no-scrollbar w-full max-w-fit mx-auto md:mx-0">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2.5 px-6 py-2 rounded-[14px] text-sm font-semibold transition-all whitespace-nowrap ${activeTab === tab.id
                                    ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                                    : "text-slate-500 hover:text-slate-700"
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

                                            <div className="pt-2 border-t border-slate-100/50">
                                                <label className="block text-sm font-medium text-slate-700 mb-2 text-center">Logo de l&apos;établissement</label>
                                                <div className="flex flex-col items-center gap-6">
                                                    <div className="w-24 h-24 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group">
                                                        {previewLogo ? (
                                                            <img src={previewLogo} className="w-full h-full object-contain p-2" alt="Logo" />
                                                        ) : (
                                                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 group-hover:text-slate-400 transition-colors">
                                                                <span className="text-2xl mb-1">🖼️</span>
                                                                <span className="text-[8px] font-bold uppercase tracking-wider">Aucun logo</span>
                                                            </div>
                                                        )}
                                                        <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <button 
                                                                onClick={() => logoInputRef.current?.click()}
                                                                className="p-2 bg-white rounded-xl text-slate-900 shadow-xl scale-90 group-hover:scale-100 transition-transform"
                                                            >
                                                                <span className="text-sm">🔄</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'logo')} />
                                                        <button 
                                                            onClick={() => logoInputRef.current?.click()}
                                                            className="px-6 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 rounded-xl font-bold text-xs transition-all shadow-sm"
                                                        >
                                                            Changer le logo
                                                        </button>
                                                        <p className="text-[10px] text-slate-400 font-normal tracking-wide leading-tight text-center">Fond transparent recommandé, max 1MB.</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-2 border-t border-slate-100/50">
                                                <label className="block text-sm font-medium text-slate-700 mb-2">
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
                                </div>

                                <div className="space-y-8 flex flex-col">
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6 flex-1">
                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Header utilisateur</label>
                                                <div className="w-full h-64 rounded-3xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group mb-3">
                                                    {previewBanner ? (
                                                        <img src={previewBanner} className="w-full h-full object-cover" alt="Banner" />
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 group-hover:text-slate-400 transition-colors">
                                                            <span className="text-3xl mb-1">🏞️</span>
                                                            <span className="text-[10px] font-bold uppercase tracking-wider">Aucun header</span>
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <button 
                                                            onClick={() => bannerInputRef.current?.click()}
                                                            className="p-3 bg-white rounded-2xl text-slate-900 shadow-2xl scale-90 group-hover:scale-100 transition-transform"
                                                        >
                                                            <span className="text-lg">📸</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'banner')} />
                                                <button 
                                                    onClick={() => bannerInputRef.current?.click()}
                                                    className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl font-medium text-xs transition-all shadow-sm"
                                                >
                                                    Changer la bannière
                                                </button>
                                            </div>
                                            
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                                    Couleur d&apos;accentuation <span className="text-slate-400 text-[10px] font-normal ml-1">(Choisissez une couleur foncée à médium pour la visibilité de l&apos;interface utilisateur)</span>
                                                </label>
                                                <div className="flex items-center justify-between gap-3 p-2.5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                                    <div className="flex items-center gap-3">
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
                                                    <button 
                                                        onClick={() => setShowHomePreview(true)}
                                                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all shadow-md"
                                                    >
                                                        Aperçu
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
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
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Image de fond du portail</label>
                                                <div className="w-full h-48 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group mb-3 shadow-inner">
                                                    {previewLoginBg ? (
                                                        <img src={previewLoginBg} className="w-full h-full object-cover" alt="Login Background" />
                                                    ) : (
                                                        <div className="text-center space-y-2">
                                                            <span className="text-4xl block">🖼️</span>
                                                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Aucune image</p>
                                                        </div>
                                                    )}
                                                    {uploading === 'login-bg' && (
                                                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-sm">
                                                            <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent animate-spin rounded-full"></div>
                                                        </div>
                                                    )}
                                                </div>
                                                <input type="file" ref={loginBgInputRef} className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'login-bg' as any)} />
                                                <button 
                                                    onClick={() => loginBgInputRef.current?.click()}
                                                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-medium text-xs transition-all shadow-lg shadow-slate-200"
                                                >
                                                    Changer l&apos;image de fond
                                                </button>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Couleur dédiée au portail</label>
                                                <p className="text-xs text-slate-400 mb-4 font-normal">Si non définie, la couleur d&apos;accentuation du club sera utilisée.</p>
                                                <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                                    <input
                                                        type="color"
                                                        value={formData.login_primary_color || formData.primary_color || "#7c3aed"}
                                                        onChange={e => setFormData({ ...formData, login_primary_color: e.target.value })}
                                                        className="w-12 h-12 rounded-xl border-2 border-white shadow-sm cursor-pointer"
                                                    />
                                                    <div className="flex-1">
                                                        <input
                                                            type="text"
                                                            value={formData.login_primary_color || ""}
                                                            placeholder={formData.primary_color}
                                                            onChange={e => setFormData({ ...formData, login_primary_color: e.target.value })}
                                                            className="bg-transparent border-none p-0 font-mono font-semibold text-base outline-none w-full"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-slate-100 flex justify-end mt-auto">
                                            <button 
                                                onClick={() => setShowPreview(true)}
                                                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-slate-200 active:scale-95"
                                            >
                                                Aperçu du portail
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6 h-full">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">✨ Textes personnalisés</h3>
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
                                                        className="w-full px-5 py-4 bg-white border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:bg-white transition-all outline-none font-normal text-slate-700 resize-none min-h-[100px]"
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
                                                                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all font-normal text-slate-700"
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
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                                <section className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-8 flex flex-col h-full">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            ⏱️ Délais de gestion
                                        </h3>
                                        <p className="text-xs text-slate-400 font-normal">Configurez les limites temporelles pour vos activités</p>
                                    </div>

                                    <div className="space-y-6 flex-1">
                                        <div className="space-y-3">
                                            <label className="block text-sm font-medium text-slate-700">Délai limite d&apos;inscription</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    value={formData.registration_limit_mins ?? 0}
                                                    onChange={e => setFormData({ ...formData, registration_limit_mins: parseInt(e.target.value) || 0 })}
                                                    className="w-full pl-12 pr-20 py-4 bg-white border border-slate-200 rounded-2xl font-semibold focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                                                />
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">⏳</span>
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">minutes</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-normal">0 = possible jusqu&apos;au début du cours</p>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="block text-sm font-medium text-slate-700">Délai limite d&apos;annulation</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    value={formData.cancellation_limit_mins ?? 45}
                                                    onChange={e => setFormData({ ...formData, cancellation_limit_mins: parseInt(e.target.value) || 0 })}
                                                    className="w-full pl-12 pr-20 py-4 bg-white border border-slate-200 rounded-2xl font-semibold focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                                                />
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🚫</span>
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">minutes</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-normal">Passé ce délai, le crédit ne sera pas restitué</p>
                                        </div>
                                    </div>
                                </section>

                                {/* LOCATIONS SECTION */}
                                <section className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-8 flex flex-col h-full">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            📍 Locaux & Espaces
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
                                            {(formData.locations || []).map((loc) => (
                                                <div key={loc} className="group flex items-center justify-between py-2.5 transition-all">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-slate-400 text-[10px]">📍</span>
                                                        <span className="font-medium text-slate-600 text-sm">{loc}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => handleRemoveLocation(loc)}
                                                        className="p-1 text-slate-300 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"
                                                        title="Supprimer ce lieu"
                                                    >
                                                        🗑️
                                                    </button>
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
                            </div>
                        )}

                        {/* PAYMENT TAB */}
                        {activeTab === "payment" && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <section className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-8">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">💶 Paramètres de paiement</h3>
                                        <p className="text-xs text-slate-400 font-normal">Gérer vos moyens de paiement des commandes et inscriptions</p>
                                    </div>

                                    <div className="space-y-6">
                                        <p className="text-xs text-amber-600 font-normal leading-relaxed italic px-2">
                                            💡 Si aucun moyen de paiement n&apos;est configuré, le fonctionnement par défaut est celui du &quot;Paiement différé&quot; : la commande est enregistrée au statut &quot;En attente&quot; de paiement. Si vous avez renseigné des instructions ci-dessous, elles seront envoyées systématiquement par email à tous les utilisateurs lors de leur commande.
                                        </p>

                                        {/* 1. STRIPE */}
                                        <div className="p-6 bg-white rounded-3xl border border-slate-200 space-y-4">
                                            <div className="flex items-start gap-4">
                                                <div className="text-xl -mt-0.5 leading-none">💳</div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-slate-900 text-base">Stripe / paiement automatisé dans REZEA</h4>
                                                    <div className="text-xs text-slate-500 font-normal leading-relaxed mt-1 space-y-1">
                                                        <p>• Configurez la plateforme de paiement Stripe pour gérer votre boutique en ligne.</p>
                                                        <p>• Le statut de la commande est mis à jour automatiquement à <span className="font-semibold text-emerald-600">&quot;Payé&quot;</span> ou <span className="font-semibold text-emerald-600">&quot;Echelonné&quot;</span> après le paiement.</p>
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 font-normal mt-1 italic">
                                                        ℹ️ Des frais de transaction Stripe s&apos;appliquent (~1.5% + 0.25€ par paiement).
                                                    </p>
                                                </div>
                                                <a 
                                                    href="https://dashboard.stripe.com/settings/apps/com.rezea.app" 
                                                    target="_blank" 
                                                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 whitespace-nowrap mt-1"
                                                >
                                                    Configurer
                                                </a>
                                            </div>
                                        </div>

                                        {/* 2. LIEN DE PAIEMENT EXTERNE */}
                                        <div className="p-6 bg-white rounded-3xl border border-slate-200 space-y-5">
                                            <div className="flex items-start gap-6">
                                                <div className="text-xl -mt-0.5 leading-none">🔗</div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-slate-900 text-base">Lien de redirection / paiement externe</h4>
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
                                                        <h4 className="font-bold text-slate-900 text-base">Paiement différé / autres moyens de paiement (optionnel)</h4>
                                                        <div className="text-xs text-slate-500 font-normal leading-relaxed mt-1 space-y-1">
                                                            <p>• En activant l&apos;option de paiement différé, vous permettez à l&apos;utilisateur qui le souhaite de &quot;payer plus tard&quot; sa commande ou de passer par un autre moyen de paiement (chèque, espèces, virement...). Il n&apos;est pas redirigé vers Stripe ou votre URL.</p>
                                                            <p>• Vous pouvez renseigner vos instructions pour le réglement différé (IBAN, Paypal, délais de paiement) dans le cadre email ci-dessous.</p>
                                                            <p>• La commande est enregistrée au statut <span className="font-semibold text-orange-500">&quot;En attente&quot;</span> de paiement. Vous confirmez manuellement la réception du paiement dans la Gestion des commandes.</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setFormData({ ...formData, allow_pay_later: !formData.allow_pay_later })}
                                                    className={`relative inline-flex h-9 w-16 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ml-4 mt-1 ${formData.allow_pay_later ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                >
                                                    <span className={`inline-block h-7 w-7 transform rounded-full bg-white transition-transform ${formData.allow_pay_later ? 'translate-x-8' : 'translate-x-1'}`} />
                                                </button>
                                            </div>

                                            {formData.allow_pay_later && (
                                                <div className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-t border-slate-100">
                                                    <div className="space-y-1">
                                                        <label className="block text-sm font-medium text-slate-700">Instructions de paiement :</label>
                                                    </div>
                                                    <ReactQuill
                                                        theme="snow"
                                                        value={formData.confirmation_email_body || ""}
                                                        onChange={(val) => setFormData({ ...formData, confirmation_email_body: val })}
                                                        placeholder="Ex: Merci de bien vouloir nous remettre votre règlement lors de votre premier cours..."
                                                        modules={quillModules}
                                                        className="bg-white rounded-2xl overflow-hidden border border-slate-200"
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
                                <section id="documents-legaux" className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-8">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-semibold flex items-center gap-3">📄 Documents légaux</h3>
                                        <p className="text-xs text-slate-400 font-normal">Publiez vos conditions générales et règlement intérieur</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* CGV Card */}
                                        <div className="group bg-white rounded-3xl p-8 border border-slate-100 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 relative overflow-hidden flex flex-col items-center text-center space-y-6">
                                            {formData.cgv_url && (
                                                <div className="absolute top-4 right-4 bg-emerald-50 text-emerald-600 text-[9px] font-bold px-3 py-1.5 rounded-full border border-emerald-100 flex items-center gap-1.5 shadow-sm">
                                                    <span className="text-[10px]">✅</span> Fichier en ligne
                                                </div>
                                            )}
                                            <div className="w-20 h-20 bg-slate-50 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-sm group-hover:scale-110 transition-transform">📜</div>
                                            <div className="space-y-2">
                                                <h4 className="text-lg font-semibold">Conditions Générales</h4>
                                                <p className="text-xs text-slate-400 font-normal">Obligatoire pour les paiements en ligne</p>
                                            </div>
                                            <div className="pt-4 flex flex-col items-center gap-4">
                                                <input type="file" ref={cgvInputRef} className="hidden" accept=".pdf,.doc,.docx" onChange={e => handleFileUpload(e, 'cgv')} />
                                                <button 
                                                    onClick={() => cgvInputRef.current?.click()}
                                                    disabled={!!uploading}
                                                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
                                                >
                                                     {uploading === 'cgv' ? "Upload..." : "Charger un document"}
                                                </button>
                                                {formData.cgv_url && (
                                                    <a href={`${API_URL}${formData.cgv_url}`} target="_blank" className="block text-blue-600 text-[10px] font-semibold hover:underline">Voir le document actuel</a>
                                                )}
                                            </div>
                                        </div>

                                        {/* RI Card */}
                                        <div className="group bg-white rounded-3xl p-8 border border-slate-100 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 relative overflow-hidden flex flex-col items-center text-center space-y-6">
                                             {formData.rules_url && (
                                                 <div className="absolute top-4 right-4 bg-emerald-50 text-emerald-600 text-[9px] font-bold px-3 py-1.5 rounded-full border border-emerald-100 flex items-center gap-1.5 shadow-sm">
                                                     <span className="text-[10px]">✅</span> Fichier en ligne
                                                 </div>
                                             )}
                                             <div className="w-20 h-20 bg-slate-50 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-sm group-hover:scale-110 transition-transform">📋</div>
                                             <div className="space-y-2">
                                                 <h4 className="text-lg font-semibold">Règlement Intérieur</h4>
                                                 <p className="text-xs text-slate-400 font-normal">Optionnel mais recommandé</p>
                                             </div>
                                             <div className="pt-4 flex flex-col items-center gap-4">
                                                 <input type="file" ref={rulesInputRef} className="hidden" accept=".pdf,.doc,.docx" onChange={e => handleFileUpload(e, 'rules')} />
                                                 <button 
                                                     onClick={() => rulesInputRef.current?.click()}
                                                     disabled={!!uploading}
                                                     className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
                                                 >
                                                      {uploading === 'rules' ? "Upload..." : "Charger un document"}
                                                 </button>
                                                 {formData.rules_url && (
                                                     <a href={`${API_URL}${formData.rules_url}`} target="_blank" className="block text-blue-600 text-[10px] font-semibold hover:underline">Voir le document actuel</a>
                                                 )}
                                             </div>
                                         </div>
                                    </div>
                                </section>
                            </div>
                        )}
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
                                <div className={`h-full flex ${previewMode === "mobile" ? "flex-col overflow-y-auto no-scrollbar" : "flex-row divide-x"} divide-slate-100`} style={{ "--primary-color": formData.login_primary_color || formData.primary_color || "#0f172a" } as any}>
                                    
                                    {/* Left Branding Panel */}
                                    <div className={`${previewMode === "mobile" ? "w-full pt-12 pb-8 px-8 text-center" : "flex-1 p-12"} relative z-10 bg-white flex flex-col justify-center`}>
                                        <div className={`space-y-6 ${previewMode === "mobile" ? "flex flex-col items-center" : ""}`}>
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-xl font-black shadow-lg">
                                                    {previewLogo ? <img src={previewLogo} className="w-full h-full object-contain p-2" alt="" /> : "RZ"}
                                                </div>
                                                <h1 className="text-2xl font-black tracking-tighter text-slate-900">
                                                    {formData.name || "REZEA"}
                                                </h1>
                                            </div>
                                            <div 
                                                className="portal-description text-sm md:text-base text-slate-500 font-medium leading-relaxed max-w-md pointer-events-none"
                                                dangerouslySetInnerHTML={{ __html: formData.login_description || "<p>Votre description apparaîtra ici...</p>" }}
                                            />
                                        </div>
                                    </div>

                                    {/* Right Panel (Image & Form) */}
                                    <div className={`relative ${previewMode === "mobile" ? "w-full min-h-[450px] pb-12 px-6" : "flex-1"} flex items-center justify-center overflow-hidden bg-slate-50`}>
                                        {/* Background Image logic mirror */}
                                        {previewLoginBg ? (
                                            <div className="absolute inset-0">
                                                <img src={previewLoginBg} className="w-full h-full object-cover" alt="" />
                                                <div className={`absolute top-0 left-0 w-full h-full ${previewMode === "mobile" ? "bg-gradient-to-b" : "bg-gradient-to-r"} from-white via-white/40 to-transparent`} />
                                                <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px]" />
                                            </div>
                                        ) : (
                                            <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(circle at center, ${formData.primary_color}, transparent)` }} />
                                        )}
                                        
                                        {/* Mock Form */}
                                        <div className="relative z-10 w-full max-w-[300px] scale-90 md:scale-100">
                                            <div className="bg-white/95 backdrop-blur-sm p-6 rounded-3xl shadow-xl border border-white/50 space-y-4">
                                                <h4 className="text-sm font-bold text-slate-900">Accédez à votre espace</h4>
                                                <div className="space-y-2">
                                                    <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
                                                    <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
                                                </div>
                                                <div className="h-9 rounded-lg" style={{ backgroundColor: formData.login_primary_color || formData.primary_color || "#0f172a" }} />
                                                <div className="text-[10px] text-center text-slate-400">Pas encore de compte ? S&apos;inscrire</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* HOME PREVIEW MODAL */}
                {showHomePreview && (
                    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300">
                        {/* Modal Header */}
                        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-4">
                                <h2 className="text-lg font-bold text-slate-900">Aperçu Home Utilisateur</h2>
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
                                                <header className="px-5 py-3 flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        {previewLogo ? (
                                                            <img src={previewLogo} className="h-6 w-6 object-contain" alt="Logo" />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded-lg bg-slate-900 flex items-center justify-center text-white text-[8px] font-medium">
                                                                {formData.name?.[0]?.toUpperCase() || 'R'}
                                                            </div>
                                                        )}
                                                        <span className="text-xs font-semibold tracking-tight text-slate-800">
                                                            {formData.name || "rezea"}
                                                        </span>
                                                    </div>
                                                </header>

                                                <div className="relative mb-6">
                                                    <div 
                                                        className="aspect-video w-full shadow-lg relative bg-slate-50 border border-slate-100 overflow-hidden rounded-xl"
                                                        style={{ 
                                                            background: previewBanner 
                                                                ? `url(${previewBanner}) center/cover no-repeat` 
                                                                : `linear-gradient(135deg, ${formData.primary_color}20, ${formData.primary_color}40)` 
                                                        }}
                                                    >
                                                        {!previewBanner && (
                                                            <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                                                                <span className="text-4xl opacity-20">✨</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-col px-5 pb-8 gap-3">
                                                <div 
                                                    className="w-full flex items-center justify-between px-5 py-4 bg-white border rounded-xl shadow-sm"
                                                    style={{ 
                                                        boxShadow: `0 4px 12px -2px ${formData.primary_color}25`,
                                                        borderColor: `${formData.primary_color}20`
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xl">🗓️</span>
                                                        <span className="text-xs font-bold text-slate-800">Planning & réservations</span>
                                                    </div>
                                                </div>
                                                <div 
                                                    className="w-full flex items-center justify-between px-5 py-4 bg-white border rounded-xl shadow-sm"
                                                    style={{ 
                                                        boxShadow: `0 4px 12px -2px ${formData.primary_color}20`,
                                                        borderColor: `${formData.primary_color}15`
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xl">🛍️</span>
                                                        <span className="text-xs font-bold text-slate-800">Boutique</span>
                                                    </div>
                                                </div>

                                                <div 
                                                    className="w-full flex items-center justify-between px-5 py-4 bg-white border rounded-xl shadow-sm"
                                                    style={{ 
                                                        boxShadow: `0 4px 12px -2px ${formData.primary_color}20`,
                                                        borderColor: `${formData.primary_color}15`
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xl">📦</span>
                                                        <span className="text-xs font-bold text-slate-800">Mes commandes</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {previewMode === "mobile" && (
                                        <div className="mt-auto border-t border-slate-100 flex items-center justify-around py-3 px-4 bg-white/80 backdrop-blur-sm">
                                            <div className="flex flex-col items-center gap-1 opacity-40">
                                                <span className="text-sm">🏠</span>
                                                <span className="text-[8px] font-bold">Home</span>
                                            </div>
                                            <div className="flex flex-col items-center gap-1 opacity-40">
                                                <span className="text-sm">🗓️</span>
                                                <span className="text-[8px] font-bold">Planning</span>
                                            </div>
                                            <div className="flex flex-col items-center gap-1 opacity-40">
                                                <span className="text-sm">🛍️</span>
                                                <span className="text-[8px] font-bold">Shop</span>
                                            </div>
                                            <div className="flex flex-col items-center gap-1 opacity-40">
                                                <span className="text-sm">👤</span>
                                                <span className="text-[8px] font-bold">Profil</span>
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
                )}
            </main>

            <style jsx global>{`
                .ql-container.ql-snow { border: none !important; font-family: inherit; }
                .ql-toolbar.ql-snow { border: none !important; border-bottom: 1px solid #f1f5f9 !important; background: #f8fafc; padding: 12px 16px !important; }
                .ql-editor { font-size: 16px; line-height: 1.6; color: #1e293b; min-height: 200px; padding: 24px !important; }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                
                /* Portal Description Styles in Preview */
                .portal-description p { margin-bottom: 0.75rem; }
                .portal-description h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem; color: #1e293b; }
                .portal-description ul { list-style: none; padding: 0; margin-bottom: 0.75rem; }
                .portal-description li { position: relative; padding-left: 1.25rem; margin-bottom: 0.4rem; }
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

