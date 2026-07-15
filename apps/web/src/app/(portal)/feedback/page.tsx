"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";

function PublicFeedbackContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const params = useParams();
    
    const token = searchParams.get("t");
    const initialRating = searchParams.get("r");

    const [campaignTitle, setCampaignTitle] = useState<string>("");
    const [campaignDescription, setCampaignDescription] = useState<string>("");
    const [tenantName, setTenantName] = useState<string>("");
    const [rating, setRating] = useState<number | null>(null);
    const [comment, setComment] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [isSuccess, setIsSuccess] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Charger les détails de l'enquête
    const loadSurveyData = useCallback(async () => {
        if (!token) {
            setError("Jeton de connexion manquant. Veuillez utiliser le lien fourni dans votre e-mail.");
            setLoading(false);
            return;
        }

        try {
            const data = await api.getPublicFeedback(token);
            setCampaignTitle(data.campaign_title);
            setCampaignDescription(data.campaign_description || "");
            setTenantName(data.tenant_name || "");
            
            // Si la base a déjà un vote, ou si l'e-mail a passé un vote en URL
            let activeRating: number | null = data.rating;
            if (initialRating) {
                const parsed = parseInt(initialRating, 10);
                if (parsed >= 1 && parsed <= 5) {
                    activeRating = parsed;
                    // Lancer la soumission automatique 1-Click en tâche de fond !
                    await api.submitPublicFeedback(token, { rating: parsed, comment: data.comment || "" });
                }
            }
            
            setRating(activeRating);
            setComment(data.comment || "");
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || "Ce lien d'enquête est invalide ou a expiré.");
        } finally {
            setLoading(false);
        }
    }, [token, initialRating]);

    useEffect(() => {
        loadSurveyData();
    }, [loadSurveyData]);

    const handleRatingClick = async (value: number) => {
        setRating(value);
        if (!token) return;
        
        try {
            // Mettre à jour la note instantanément en arrière-plan
            await api.submitPublicFeedback(token, { rating: value, comment });
        } catch (err) {
            console.error("Instant submit failed", err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || rating === null) return;

        setIsSubmitting(true);
        try {
            await api.submitPublicFeedback(token, { rating, comment });
            setIsSuccess(true);
        } catch (err: any) {
            console.error(err);
            setError("Erreur lors de l'enregistrement de votre avis. Veuillez réessayer.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const smileys = [
        { val: 1, char: "😔", label: "Pas satisfait" },
        { val: 2, char: "🙁", label: "Peu satisfait" },
        { val: 3, char: "😐", label: "Moyen" },
        { val: 4, char: "🙂", label: "Satisfait" },
        { val: 5, char: "😍", label: "Très satisfait" }
    ];

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-xl max-w-sm w-full text-center space-y-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-slate-500 font-semibold text-sm">Connexion sécurisée en cours...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white p-8 rounded-3xl border border-rose-100 shadow-xl max-w-md w-full text-center space-y-5">
                    <span className="text-4xl">⚠️</span>
                    <h2 className="text-lg font-bold text-slate-800">Oups ! Une erreur est survenue</h2>
                    <p className="text-slate-500 text-sm leading-relaxed">{error}</p>
                    <button
                        onClick={() => router.push(`/`)}
                        className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
                    >
                        Retourner à l&apos;accueil
                    </button>
                </div>
            </div>
        );
    }

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white p-10 rounded-3xl border border-slate-200/80 shadow-2xl max-w-md w-full text-center space-y-6 animate-in zoom-in-95 duration-300">
                    <span className="text-5xl block animate-bounce">✨</span>
                    <div className="space-y-2">
                        <h2 className="text-xl font-medium text-slate-900 tracking-tight">Merci pour votre vote !</h2>
                        <p className="text-slate-500 text-sm leading-relaxed">
                            À bientôt chez {tenantName || "PolAir"} !
                        </p>
                    </div>
                    <div className="pt-2">
                        <button
                            onClick={() => router.push(`/`)}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-indigo-100"
                        >
                            Accéder à mon espace membre
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-400">Vous pouvez fermer cet onglet en toute sérénité.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
            <div className="bg-white p-6 sm:p-8 md:p-10 rounded-3xl border border-slate-200/80 shadow-2xl max-w-lg w-full space-y-6 animate-in fade-in duration-300">
                
                {/* Header */}
                <div className="text-center space-y-2.5">
                    <span className="text-3xl">🌟</span>
                    <h2 className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Enquête de satisfaction</h2>
                    <div className="border-t border-slate-100 w-24 mx-auto my-2.5"></div>
                    <h1 className="text-lg md:text-xl font-medium text-slate-800 tracking-tight leading-snug">
                        {campaignTitle || "Votre avis nous intéresse"}
                    </h1>
                </div>

                {/* Main interactive Rating Row */}
                <div className="border-t border-b border-slate-100 py-4 text-center space-y-3">
                    <p className="text-slate-500 text-xs font-medium">Votre évaluation :</p>
                    
                    <div className="flex justify-between items-center max-w-sm mx-auto px-2">
                        {smileys.map(s => {
                            const isSelected = rating === s.val;
                            return (
                                <button
                                    key={s.val}
                                    type="button"
                                    onClick={() => handleRatingClick(s.val)}
                                    className={`w-12 h-12 flex items-center justify-center text-2xl rounded-full transition-all duration-200 focus:outline-none ${
                                        isSelected 
                                            ? "bg-slate-100/90 scale-105 shadow-sm border border-slate-200/40" 
                                            : rating !== null 
                                                ? "opacity-35 grayscale hover:opacity-75 hover:grayscale-0 hover:bg-slate-50" 
                                                : "hover:bg-slate-50"
                                    }`}
                                    title={s.label}
                                >
                                    {s.char}
                                </button>
                            );
                        })}
                    </div>

                    {rating !== null && (
                        <p className="text-xs text-slate-800 font-semibold transition-all">
                            Note sélectionnée : {smileys.find(s => s.val === rating)?.label}
                        </p>
                    )}
                </div>

                {/* Form comment */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-2">Un mot à ajouter ? (optionnel)</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Partagez-nous votre ressenti, vos remarques ou vos idées d'amélioration..."
                            className="w-full p-4 rounded-2xl border border-slate-200 bg-slate-50/30 font-medium text-slate-800 placeholder:text-slate-400 text-xs h-32 focus:border-slate-400 focus:bg-white outline-none transition-all resize-none"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting || rating === null}
                        className={`w-full py-3 rounded-xl font-semibold text-xs text-white shadow-lg transition-all ${rating === null ? "bg-slate-300 cursor-not-allowed shadow-none" : "bg-slate-900 hover:bg-slate-800 shadow-slate-200"}`}
                    >
                        {isSubmitting ? "Enregistrement en cours..." : "Enregistrer mon avis"}
                    </button>
                </form>

                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    Votre réponse est sécurisée et confidentielle. Merci de contribuer à notre développement !
                </p>
            </div>
        </div>
    );
}

export default function PublicFeedbackPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen bg-slate-50 items-center justify-center">Chargement sécurisé...</div>}>
            <PublicFeedbackContent />
        </Suspense>
    );
}

