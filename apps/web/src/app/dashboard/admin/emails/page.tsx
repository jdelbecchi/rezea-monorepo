"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { api, User } from "@/lib/api";
import dynamic from "next/dynamic";

// Import CSS for ReactQuill
import "react-quill/dist/quill.snow.css";

// Dynamic import of ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import("react-quill"), { 
    ssr: false,
    loading: () => <div className="h-64 bg-slate-50 border border-slate-200 rounded-xl animate-pulse flex items-center justify-center text-slate-400">Chargement de l'éditeur...</div>
});

export default function AdminEmailsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [recipientType, setRecipientType] = useState<"all" | "active" | "selected">("all");
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [subject, setSubject] = useState("");
    const [content, setContent] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showUserSelector, setShowUserSelector] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    
    const quillRef = useRef<any>(null);

    useEffect(() => {
        api.getCurrentUser().then(setUser).catch(() => { });
        api.getAdminUsers().then(setAllUsers).catch(() => { });
    }, []);

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
                                    <span className="text-xs opacity-70">Tous les membres</span>
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

                        {/* Composition du message */}
                        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                                <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-lg flex items-center justify-center mr-3 text-sm">2</span>
                                Message
                            </h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Objet de l'email</label>
                                    <input
                                        type="text"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        placeholder="Note d'information : [Sujet]"
                                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Contenu de l'email</label>
                                    <div className="bg-white rounded-xl overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                                        <ReactQuill
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

                        <div className="flex justify-end pt-4 pb-8">
                            <button
                                onClick={handleSend}
                                disabled={isSending}
                                className={`px-10 py-4 rounded-xl font-bold text-white shadow-lg transition-all transform hover:scale-105 active:scale-95 ${isSending ? "bg-slate-400 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"}`}
                            >
                                {isSending ? "Envoi en cours..." : "🚀 Envoyer l'email"}
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
        </div>
    );
}
