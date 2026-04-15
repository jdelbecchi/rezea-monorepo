"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
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
    const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

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
                    router.push("/login");
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
                <div className="max-w-5xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Paramètres</h1>
                            <p className="text-slate-500 mt-1">Gérez l&apos;identité, les règles et les options de votre club</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-lg shadow-slate-200 disabled:opacity-50 flex items-center gap-2"
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
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="space-y-8">
                                    {/* Bloc 1: Informations Générales */}
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                                        <h3 className="text-xl font-bold flex items-center gap-2">📝 Informations Générales</h3>
                                        <div className="grid grid-cols-1 gap-6">
                                            <div>
                                                <label className={`block text-sm font-bold mb-2 ${!formData.name ? 'text-red-500' : 'text-slate-700'}`}>Nom de l'établissement *</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={formData.name || ""}
                                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                    className={`w-full px-4 py-3 border rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-medium ${!formData.name ? 'border-red-300 bg-red-50' : 'bg-slate-50 border-slate-200'}`}
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
                                            <div className="pt-2">
                                                <label className="block text-sm font-bold text-slate-700 mb-4">Logo de l&apos;établissement</label>
                                                <div className="flex items-center gap-6">
                                                    <div className="w-24 h-24 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group">
                                                        {previewLogo ? (
                                                            <img src={previewLogo} className="w-full h-full object-contain p-2" alt="Logo" />
                                                        ) : (
                                                            <span className="text-2xl">🏗️</span>
                                                        )}
                                                        {uploading === 'logo' && (
                                                            <div className="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-sm">
                                                                <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent animate-spin rounded-full"></div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 space-y-2">
                                                        <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'logo')} />
                                                        <button 
                                                            onClick={() => logoInputRef.current?.click()}
                                                            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs transition-all shadow-sm"
                                                        >
                                                            Changer le logo
                                                        </button>
                                                        <p className="text-[10px] text-slate-400 font-medium tracking-wide leading-tight">Recommandé : Fond transparent, max 1MB.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    {/* Bloc 2: Personnalisation */}
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                                        <h3 className="text-xl font-bold flex items-center gap-2">🎨 Personnalisation</h3>
                                        
                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Bannière (Dashboard)</label>
                                                <div className="w-full h-32 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group mb-3">
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
                                                    className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs transition-all"
                                                >
                                                    Changer la bannière
                                                </button>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Couleur d&apos;accentuation</label>
                                                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <input
                                                        type="color"
                                                        value={formData.primary_color || "#7c3aed"}
                                                        onChange={e => setFormData({ ...formData, primary_color: e.target.value })}
                                                        className="w-12 h-12 rounded-xl border-2 border-white shadow-sm cursor-pointer"
                                                    />
                                                    <div className="flex-1">
                                                        <input
                                                            type="text"
                                                            value={formData.primary_color || "#7c3aed"}
                                                            onChange={e => setFormData({ ...formData, primary_color: e.target.value })}
                                                            className="bg-transparent border-none p-0 font-mono font-bold text-base outline-none w-full"
                                                        />
                                                    </div>
                                                    <div 
                                                        className="px-4 py-1.5 rounded-lg text-white font-bold text-[10px] uppercase shadow-sm"
                                                        style={{ backgroundColor: formData.primary_color }}
                                                    >
                                                        Aperçu
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Message d&apos;accueil</label>
                                                <textarea
                                                    value={formData.welcome_message || ""}
                                                    onChange={e => setFormData({ ...formData, welcome_message: e.target.value })}
                                                    placeholder="Bienvenue chez nous !"
                                                    rows={4}
                                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-medium"
                                                />
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
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xl font-bold flex items-center gap-2">🎨 Apparence du portail</h3>
                                            <button 
                                                onClick={() => setShowPreview(true)}
                                                className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl font-bold text-xs transition-all flex items-center gap-2"
                                            >
                                                <span>👁️</span> Aperçu du portail
                                            </button>
                                        </div>
                                        
                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Couleur dédiée au portail</label>
                                                <p className="text-xs text-slate-400 mb-4">Si non définie, la couleur d'accentuation du club sera utilisée.</p>
                                                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
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
                                                            className="bg-transparent border-none p-0 font-mono font-bold text-base outline-none w-full"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Image de fond du portail</label>
                                                <div className="w-full h-48 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group mb-3 shadow-inner">
                                                    {previewLoginBg ? (
                                                        <img src={previewLoginBg} className="w-full h-full object-cover" alt="Login Background" />
                                                    ) : (
                                                        <div className="text-center space-y-2">
                                                            <span className="text-4xl block">🖼️</span>
                                                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Aucune image</p>
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
                                                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-slate-200"
                                                >
                                                    Changer l&apos;image de fond
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6 min-h-[400px]">
                                        <h3 className="text-xl font-bold flex items-center gap-2">✨ Textes personnalisés</h3>
                                        <div>
                                            <p className="text-xs text-slate-400 mb-6 font-medium leading-relaxed italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                💡 <b>le conseil Rezea :</b> une introduction courte suivie de 3 à 5 atouts majeurs est le format idéal pour convertir vos visiteurs !
                                            </p>
                                            
                                            <div className="space-y-8">
                                                {/* Introduction Field */}
                                                <div className="space-y-2">
                                                    <label className="block text-sm font-bold text-slate-700 mb-2">Description courte</label>
                                                    <textarea 
                                                        value={structuredDescription.intro}
                                                        onChange={e => setStructuredDescription(prev => ({ ...prev, intro: e.target.value }))}
                                                        placeholder="Ex: Bienvenue dans votre club de bien-être..."
                                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:bg-white transition-all outline-none font-medium text-slate-700 resize-none min-h-[100px]"
                                                    />
                                                </div>

                                                {/* Key Assets List */}
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="block text-sm font-bold text-slate-700">Points forts et atouts</label>
                                                        <button 
                                                            onClick={handleAddAtout}
                                                            className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full hover:bg-blue-100 transition-all"
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
                                                                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all font-medium text-slate-700"
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
                            <div className="space-y-8">
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
                                            <p className="text-xs text-slate-400 font-medium">Passé ce délai, le crédit ne sera pas restitué</p>
                                        </div>
                                    </div>
                                </section>

                                {/* LOCATIONS SECTION */}
                                <section className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm space-y-8">
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">
                                            📍 Locaux & Espaces
                                        </h3>
                                        <p className="text-slate-500 font-medium">Définissez les salles et lieux de votre établissement pour vos planning</p>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="flex gap-3">
                                            <input
                                                type="text"
                                                placeholder="Ex: Salle 1, Studio Yoga, Extérieur..."
                                                value={newLocation}
                                                onChange={e => setNewLocation(e.target.value)}
                                                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAddLocation())}
                                                className="flex-1 px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                                            />
                                            <button
                                                onClick={handleAddLocation}
                                                className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all"
                                            >
                                                Ajouter
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                            {(formData.locations || []).map((loc) => (
                                                <div key={loc} className="group flex items-center justify-between px-5 py-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-300 transition-all">
                                                    <span className="font-bold text-slate-700">{loc}</span>
                                                    <button 
                                                        onClick={() => handleRemoveLocation(loc)}
                                                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            ))}
                                            {(formData.locations || []).length === 0 && (
                                                <div className="col-span-full py-8 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                                                    <p className="text-slate-400 font-medium text-sm">Aucun lieu configuré</p>
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
                                <section className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm space-y-8">
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">💶 Paramètres de Paiement</h3>
                                        <p className="text-slate-500 font-medium">Gérez comment vos membres règlent leurs commandes</p>
                                    </div>

                                    <div className="grid grid-cols-1 gap-8">
                                        {/* Redirection Link - FIRST and ALWAYS visible */}
                                        <div className="p-8 bg-blue-50/50 rounded-3xl border border-blue-100/50 space-y-4">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-2xl">🔗</span>
                                                <label className="text-lg font-bold text-slate-800">Lien de redirection de paiement <span className="text-slate-400 font-medium text-sm">(optionnel)</span></label>
                                            </div>
                                            <input
                                                type="url"
                                                placeholder="https://www.helloasso.com/votre-boutique"
                                                value={formData.payment_redirect_link || ""}
                                                onChange={e => setFormData({ ...formData, payment_redirect_link: e.target.value })}
                                                className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none transition-all font-medium text-blue-600"
                                            />
                                            <p className="text-xs text-slate-400 font-medium leading-relaxed">
                                                Indiquez ici l&apos;URL de votre page de paiement (ex: HelloAsso). Les utilisateurs y seront redirigés pour finaliser leur achat.
                                            </p>
                                        </div>

                                        {/* Différé Toggle */}
                                        <div className="p-8 bg-white rounded-3xl border border-slate-200 space-y-6">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <h4 className="text-lg font-bold text-slate-800">Accepter les paiements différés</h4>
                                                    <p className="text-sm text-slate-500 max-w-xl leading-relaxed">
                                                        Si activé, l&apos;utilisateur peut valider sa commande sans être redirigé vers le site de paiement (ex: chèque, espèces sur place). Sa commande sera alors &quot;en attente&quot; de validation par un administrateur.
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => setFormData({ ...formData, allow_pay_later: !formData.allow_pay_later })}
                                                    className={`relative inline-flex h-9 w-16 items-center rounded-full transition-colors focus:outline-none ${formData.allow_pay_later ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                >
                                                    <span className={`inline-block h-7 w-7 transform rounded-full bg-white transition-transform shadow-md ${formData.allow_pay_later ? 'translate-x-8' : 'translate-x-1'}`} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Confirmation Email section */}
                                <section className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm space-y-8">
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">✉️ Email de Confirmation</h3>
                                        <p className="text-slate-500 font-medium">Personnalisez le message envoyé automatiquement après une commande</p>
                                    </div>

                                    <div>
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
                                                className="h-[24rem]"
                                            />
                                        </div>
                                        <div className="mt-4 flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-800">
                                            <span className="text-xl">✨</span>
                                            <p className="text-xs font-bold leading-tight uppercase tracking-wider">
                                                Conseil : Si vous acceptez les paiements différés, n&apos;oubliez pas d&apos;inclure vos instructions (RIB, ordre de chèque) dans cet email.
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* DOCUMENTS TAB */}
                        {activeTab === "docs" && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                            <div className={`bg-white shadow-2xl overflow-hidden transition-all duration-500 ${previewMode === "mobile" ? "w-[375px] h-[667px] rounded-[3rem] border-[8px] border-slate-900" : "w-full max-w-5xl h-[600px] rounded-3xl"}`}>
                                <div 
                                    className={`h-full flex ${previewMode === "mobile" ? "flex-col" : "flex-row"} relative bg-white`}
                                    style={{ "--primary-color": formData.login_primary_color || formData.primary_color || "#0f172a" } as any}
                                >
                                    {/* Left Panel (Branding) */}
                                    <div className={`${previewMode === "mobile" ? "pt-8 pb-4 px-8 text-center" : "flex-1 p-12"} relative z-10 bg-white flex flex-col justify-center`}>
                                        <div className={`space-y-6 ${previewMode === "mobile" ? "flex flex-col items-center" : ""}`}>
                                            <div className="flex items-center gap-4">
                                                {previewLogo ? (
                                                    <img src={previewLogo} className="h-12 object-contain" alt="Logo" />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold">RZ</div>
                                                )}
                                                <h1 className="text-2xl md:text-4xl font-black tracking-tighter text-slate-900 truncate">
                                                    {formData.name || "Rezea Club"}
                                                </h1>
                                            </div>
                                            <div 
                                                className="portal-description text-sm md:text-base text-slate-500 font-medium leading-relaxed max-w-md pointer-events-none"
                                                dangerouslySetInnerHTML={{ __html: formData.login_description || "<p>Votre description apparaîtra ici...</p>" }}
                                            />
                                        </div>
                                    </div>

                                    {/* Right Panel (Image & Form) */}
                                    <div className={`relative flex-1 flex items-center justify-center overflow-hidden bg-slate-50 ${previewMode === "mobile" ? "min-h-[300px] pt-2 pb-8 px-6" : ""}`}>
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
                                        <div className="relative z-10 w-full max-w-[280px] scale-90 md:scale-100">
                                            <div className="bg-white/95 backdrop-blur-sm p-6 rounded-3xl shadow-xl border border-white/50 space-y-4">
                                                <h4 className="text-sm font-bold text-slate-900">Accédez à votre espace</h4>
                                                <div className="space-y-2">
                                                    <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
                                                    <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
                                                </div>
                                                <div className="h-9 rounded-lg" style={{ backgroundColor: formData.login_primary_color || formData.primary_color || "#0f172a" }} />
                                                <div className="text-[10px] text-center text-slate-400">Pas encore de compte ? S'inscrire</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
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

