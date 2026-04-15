"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, User, EmailTemplate } from "@/lib/api";
import dynamic from "next/dynamic";

// Import CSS for ReactQuill
import "react-quill/dist/quill.snow.css";

// Dynamic import of ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import("react-quill"), { 
    ssr: false,
    loading: () => <div className="h-64 bg-slate-50 border border-slate-200 rounded-xl animate-pulse flex items-center justify-center text-slate-400">Chargement de l'éditeur...</div>
});

function AdminEmailsContent() {
    const searchParams = useSearchParams();
    const [user, setUser] = useState<User | null>(null);
    const [recipientType, setRecipientType] = useState<"all" | "active" | "selected">("all");
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const QuillNode = ReactQuill as any;

    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    const [subject, setSubject] = useState("");
    const [content, setContent] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showUserSelector, setShowUserSelector] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    
    // Templates state
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [templateName, setTemplateName] = useState("");
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    
    const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const quillRef = useRef<any>(null);

    useEffect(() => {
        // Configure Quill for inline styles (alignment)
        const configureQuill = async () => {
            try {
                const { default: Quill } = await import('quill');
                const Align = Quill.import('attributors/style/align');
                Quill.register(Align, true);
            } catch (err) {
                console.warn("Quill could not be configured for inline styles", err);
            }
        };
        configureQuill();
    }, []);

    useEffect(() => {
        api.getCurrentUser().then(setUser).catch(() => { });
        api.getAdminUsers().then(users => {
            setAllUsers(users);
            
            // Handle pre-filled recipients from query params
            const recipientIds = searchParams.get("recipientIds");
            if (recipientIds) {
                const ids = recipientIds.split(",");
                setSelectedUserIds(ids);
                setRecipientType("selected");
            }
        }).catch(() => { });

        // Fetch templates
        api.getEmailTemplates().then(setTemplates).catch(err => console.error("Failed to load templates", err));
    }, [searchParams]);

    const imageHandler = useCallback(() => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            if (input.files && input.files[0]) {
                const file = input.files[0];
                try {
                    const res = await api.uploadImage(file);
                    const editor = quillRef.current.getEditor();
                    const range = editor.getSelection();
                    editor.insertEmbed(range.index, 'image', res.url);
                } catch (error) {
                    console.error("Image upload failed:", error);
                    setMessage({ type: "error", text: "L'upload de l'image a échoué." });
                }
            }
        };
    }, []);

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                [{ 'align': [] }],
                [{ 'color': [] }, { 'background': [] }],
                ['link', 'image'],
                ['clean']
            ],
            handlers: {
                image: imageHandler
            }
        },
    }), [imageHandler]);

    const handleSend = async () => {
        if (!subject || !content || content === "<p><br></p>") {
            setMessage({ type: "error", text: "Veuillez remplir l'objet et le contenu de l'email." });
            return;
        }

        if (recipientType === "selected" && selectedUserIds.length === 0) {
            setMessage({ type: "error", text: "Veuillez sélectionner au moins un destinataire." });
            return;
        }

        setIsSending(true);
        setMessage(null);

        try {
            const result = await api.sendAdminEmail({
                subject,
                content: content, 
                recipient_type: recipientType,
                selected_user_ids: recipientType === "selected" ? selectedUserIds : undefined
            });
            setMessage({ type: "success", text: result.message });
            setSubject("");
            setContent("");
            setSelectedUserIds([]);
        } catch (error) {
            setMessage({ type: "error", text: "Une erreur est survenue lors de l'envoi de l'email." });
        } finally {
            setIsSending(false);
        }
    };

    const handleSaveTemplate = async () => {
        if (!templateName.trim()) return;
        if (!subject || !content || content === "<p><br></p>") {
            setMessage({ type: "error", text: "Veuillez remplir l'objet et le contenu avant de sauvegarder." });
            return;
        }

        setIsSavingTemplate(true);
        try {
            const newTemplate = await api.saveEmailTemplate({
                name: templateName,
                subject,
                content
            });
            setTemplates(prev => [newTemplate, ...prev]);
            setShowSaveModal(false);
            setTemplateName("");
            setMessage({ type: "success", text: "Modèle enregistré avec succès." });
        } catch (error) {
            setMessage({ type: "error", text: "Erreur lors de la sauvegarde du modèle." });
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const handleDeleteTemplate = async () => {
        if (!templateToDelete) return;
        
        setIsDeleting(true);
        try {
            await api.deleteEmailTemplate(templateToDelete.id);
            setTemplates(prev => prev.filter(t => t.id !== templateToDelete.id));
            setTemplateToDelete(null);
            setMessage({ type: "success", text: "Modèle supprimé avec succès." });
        } catch (error) {
            console.error("Delete failed", error);
            setMessage({ type: "error", text: "Erreur lors de la suppression du modèle." });
        } finally {
            setIsDeleting(false);
        }
    };

    const loadTemplate = (template: EmailTemplate) => {
        setSubject(template.subject);
        setContent(template.content);
        // Scroll to subject input or editor
        window.scrollTo({ top: 400, behavior: 'smooth' });
    };

    const filteredUsers = allUsers.filter(u => 
        u.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleUserSelection = (id: string) => {
        setSelectedUserIds(prev => 
            prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]
        );
    };

    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar user={user} />
            <main className="flex-1 p-8">
                <div className="max-w-4xl mx-auto">
                    <header className="mb-8">
                        <h1 className="text-3xl font-bold text-slate-900 mb-2 font-display">📧 Diffusion d'Emails</h1>
                        <p className="text-slate-500">Envoyez des informations ou une newsletter à vos membres.</p>
                    </header>

                    {message && (
                        <div className={`mb-6 p-4 rounded-xl border ${message.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                            {message.type === "success" ? "✅ " : "❌ "} {message.text}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-8">
                        {/* Configuration de l'envoi */}
                        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                                <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-lg flex items-center justify-center mr-3 text-sm">1</span>
                                Destinataires
                            </h2>
                            
                            <div className="flex flex-wrap gap-4 mb-6">
                                <button
                                    onClick={() => setRecipientType("all")}
                                    className={`flex-1 py-4 px-6 rounded-xl border-2 transition-all flex flex-col items-center text-center gap-2 ${recipientType === "all" ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" : "border-slate-100 hover:border-slate-200 bg-slate-50 text-slate-500"}`}
                                >
                                    <span className="text-2xl">🌍</span>
                                    <span className="font-bold">Tous</span>
                                    <span className="text-xs opacity-70">Tous les inscrits</span>
                                </button>
                                <button
                                    onClick={() => setRecipientType("active")}
                                    className={`flex-1 py-4 px-6 rounded-xl border-2 transition-all flex flex-col items-center text-center gap-2 ${recipientType === "active" ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" : "border-slate-100 hover:border-slate-200 bg-slate-50 text-slate-500"}`}
                                >
                                    <span className="text-2xl">✅</span>
                                    <span className="font-bold">Actifs</span>
                                    <span className="text-xs opacity-70">Statut actif uniquement</span>
                                </button>
                                <button
                                    onClick={() => setRecipientType("selected")}
                                    className={`flex-1 py-4 px-6 rounded-xl border-2 transition-all flex flex-col items-center text-center gap-2 ${recipientType === "selected" ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" : "border-slate-100 hover:border-slate-200 bg-slate-50 text-slate-500"}`}
                                >
                                    <span className="text-2xl">🎯</span>
                                    <span className="font-bold">Ciblé</span>
                                    <span className="text-xs opacity-70">Sélection manuelle</span>
                                </button>
                            </div>

                            {recipientType === "selected" && (
                                <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-dotted border-slate-300">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-sm font-medium text-slate-700">
                                            {selectedUserIds.length} utilisateur(s) sélectionné(s)
                                        </span>
                                        <button 
                                            onClick={() => setShowUserSelector(true)}
                                            className="text-sm text-blue-600 font-bold hover:underline"
                                        >
                                            Modifier la sélection
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedUserIds.slice(0, 5).map(id => {
                                            const u = allUsers.find(user => user.id === id);
                                            return u ? (
                                                <span key={id} className="bg-white px-2 py-1 rounded border text-xs text-slate-600">
                                                    {u.first_name} {u.last_name}
                                                </span>
                                            ) : null;
                                        })}
                                        {selectedUserIds.length > 5 && (
                                            <span className="text-xs text-slate-400 self-center">... et {selectedUserIds.length - 5} autres</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* Section Modèles */}
                        {templates.length > 0 && (
                            <section className="animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Modèles enregistrés</h2>
                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{templates.length} modèles</span>
                                </div>
                                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-2 px-2">
                                    {templates.map(t => (
                                        <div 
                                            key={t.id}
                                            onClick={() => loadTemplate(t)}
                                            className="min-w-[220px] max-w-[220px] bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group relative"
                                        >
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setTemplateToDelete(t);
                                                }}
                                                className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all text-xs z-20"
                                                title="Supprimer le modèle"
                                            >
                                                ✕
                                            </button>
                                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors mb-4">
                                                <span className="text-xl">📄</span>
                                            </div>
                                            <h3 className="font-bold text-slate-900 text-sm truncate mb-1">{t.name}</h3>
                                            <p className="text-xs text-slate-500 truncate">{t.subject || "Pas d'objet"}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Composition du message */}
                        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                                <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-lg flex items-center justify-center mr-3 text-sm">2</span>
                                Message
                            </h2>

                            <div className="space-y-4">
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${!subject ? 'text-red-500' : 'text-slate-700'}`}>Objet de l'email *</label>
                                    <input
                                        type="text"
                                        required
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        placeholder="Note d'information : [Sujet]"
                                        className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none ${!subject ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Contenu de l'email</label>
                                    <div className="bg-white rounded-xl overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                                        {/* @ts-ignore */}
                                        <QuillNode
                                            ref={quillRef}
                                            theme="snow"
                                            value={content}
                                            onChange={setContent}
                                            modules={modules}
                                            placeholder="Rédigez votre message ici..."
                                            className="h-80 quill-editor"
                                        />
                                    </div>

                                    <style jsx global>{`
                                        .quill-editor .ql-toolbar {
                                            border: none !important;
                                            border-bottom: 1px solid #e2e8f0 !important;
                                            background: #f8fafc;
                                        }
                                        .quill-editor .ql-container {
                                            border: none !important;
                                            font-family: inherit;
                                        }
                                        .quill-editor .ql-editor {
                                            min-height: 200px;
                                            font-size: 0.95rem;
                                            line-height: 1.6;
                                        }
                                        .quill-editor .ql-editor img {
                                            max-width: 100%;
                                            border-radius: 8px;
                                        }
                                    `}</style>
                                </div>
                            </div>
                        </section>

                        <div className="flex flex-col md:flex-row justify-end items-center gap-4 pt-4 pb-8">
                            <button
                                onClick={() => setShowSaveModal(true)}
                                className="w-full md:w-auto px-6 py-4 rounded-xl font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                            >
                                💾 Enregistrer comme modèle
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={isSending}
                                className={`w-full md:w-auto px-10 py-4 rounded-xl font-medium text-white shadow-lg transition-all ${isSending ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800"}`}
                            >
                                {isSending ? "Envoi en cours..." : "Envoyer l'email"}
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            {/* Modal de sélection d'utilisateurs */}
            {showUserSelector && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-xl font-bold text-slate-900">Sélectionner les destinataires</h3>
                            <button onClick={() => setShowUserSelector(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>
                        
                        <div className="p-6 border-b border-slate-100">
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
                                <input
                                    type="text"
                                    placeholder="Rechercher un membre..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {filteredUsers.map(u => (
                                <button
                                    key={u.id}
                                    onClick={() => toggleUserSelection(u.id)}
                                    className={`w-full flex items-center p-3 rounded-xl transition-all border ${selectedUserIds.includes(u.id) ? "bg-blue-50 border-blue-200" : "bg-white border-slate-100 hover:border-slate-200"}`}
                                >
                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center mr-4 ${selectedUserIds.includes(u.id) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300"}`}>
                                        {selectedUserIds.includes(u.id) && "✓"}
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-slate-800 text-sm">{u.first_name} {u.last_name}</p>
                                        <p className="text-xs text-slate-500">{u.email}</p>
                                    </div>
                                    <div className="ml-auto">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${u.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                            {u.is_active ? "Actif" : "Inactif"}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-600">{selectedUserIds.length} sélectionné(s)</span>
                            <button
                                onClick={() => setShowUserSelector(false)}
                                className="bg-slate-900 text-white px-8 py-2 rounded-xl font-bold hover:bg-slate-800 transition-all"
                            >
                                Terminer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de sauvegarde de modèle */}
            {showSaveModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 text-center">
                            <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-8 shadow-inner">
                                💾
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">Enregistrer le modèle</h3>
                            <p className="text-sm text-slate-500 mb-8 leading-relaxed">Donnez un nom à ce modèle pour le retrouver facilement dans votre bibliothèque.</p>
                            
                            <div className="relative mb-8">
                                <input
                                    type="text"
                                    autoFocus
                                    value={templateName}
                                    onChange={(e) => setTemplateName(e.target.value)}
                                    placeholder="ex: Newsletter Annonce Stage"
                                    className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-slate-50/50 text-center font-medium"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
                                />
                            </div>

                            <div className="flex gap-4">
                                <button 
                                    onClick={() => setShowSaveModal(false)}
                                    className="flex-1 py-4 rounded-2xl font-medium text-slate-500 hover:bg-slate-50 transition-all active:scale-95"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleSaveTemplate}
                                    disabled={isSavingTemplate || !templateName.trim()}
                                    className="flex-1 py-4 rounded-2xl font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:cursor-not-allowed transition-all shadow-lg active:scale-95"
                                >
                                    {isSavingTemplate ? "..." : "Enregistrer"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de suppression de modèle */}
            {templateToDelete && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 text-center">
                            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-8 shadow-inner">
                                🗑️
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">Supprimer le modèle ?</h3>
                            <p className="text-sm text-slate-500 mb-8 leading-relaxed">Cette action est irréversible. Le modèle <b>"{templateToDelete.name}"</b> sera définitivement supprimé.</p>
                            
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => setTemplateToDelete(null)}
                                    className="flex-1 py-4 rounded-2xl font-medium text-slate-500 hover:bg-slate-50 transition-all active:scale-95"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleDeleteTemplate}
                                    disabled={isDeleting}
                                    className="flex-1 py-4 rounded-2xl font-bold bg-rose-500 text-white hover:bg-rose-600 disabled:bg-slate-200 disabled:cursor-not-allowed transition-all shadow-lg shadow-rose-200 active:scale-95"
                                >
                                    {isDeleting ? "..." : "Supprimer"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminEmailsPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen bg-slate-50 items-center justify-center">Chargement...</div>}>
            <AdminEmailsContent />
        </Suspense>
    );
}
