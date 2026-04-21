"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatCredits } from "@/lib/formatters";

function CreditsCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const params = useParams();
    const slug = params.slug;
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');
    const [newBalance, setNewBalance] = useState<number | null>(null);

    useEffect(() => {
        const checkPayment = async () => {
            // Récupérer les paramètres de l'URL
            const code = searchParams.get('code');
            const orderId = searchParams.get('orderId');
            const checkoutIntentId = searchParams.get('checkoutIntentId');

            // HelloAsso redirige avec ces paramètres en cas de succès
            if (code === 'succeeded' || orderId || checkoutIntentId) {
                try {
                    // Attendre un peu pour laisser le webhook se traiter
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Récupérer le nouveau solde
                    const account = await api.getCreditAccount();
                    setNewBalance(account.balance);
                    setStatus('success');
                    setMessage('Votre paiement a été confirmé ! Vos crédits ont été ajoutés à votre compte.');

                    // Rediriger vers le dashboard après 3 secondes
                    setTimeout(() => {
                        router.push(`/${slug}/home`);
                    }, 3000);
                } catch (err) {
                    setStatus('error');
                    setMessage('Le paiement a été effectué mais nous rencontrons un problème pour mettre à jour votre solde. Veuillez contacter le support.');
                }
            } else {
                setStatus('error');
                setMessage('Le paiement a été annulé ou a échoué.');
            }
        };

        checkPayment();
    }, [searchParams, router]);

    if (status === 'loading') {
        return (
            <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-6">
                <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-500 font-medium text-xs tracking-widest animate-pulse uppercase">Validation du paiement...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
            <div className="max-w-md w-full">
                {status === 'success' && (
                    <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
                        <div className="text-6xl mb-6">✅</div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-4">Paiement réussi !</h2>
                        <p className="text-slate-600 mb-6">{message}</p>

                        {newBalance !== null && (
                            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 text-white mb-6 shadow-xl shadow-slate-900/10">
                                <p className="text-slate-400 text-sm font-medium">Nouveau solde</p>
                                <p className="text-4xl font-bold mt-2 tracking-tight">{formatCredits(newBalance)}</p>
                                <p className="text-slate-400 text-sm mt-1 font-medium">crédits</p>
                            </div>
                        )}

                        <p className="text-slate-400 text-sm">Redirection automatique dans 3 secondes...</p>

                        <Link
                            href={`/${slug}/home`}
                            className="inline-block mt-6 text-slate-900 hover:text-slate-600 font-bold transition-colors"
                        >
                            Retour au tableau de bord →
                        </Link>
                    </div>
                )}

                {status === 'error' && (
                    <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
                        <div className="text-6xl mb-6">❌</div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-4">Erreur</h2>
                        <p className="text-slate-600 mb-8">{message}</p>

                        <div className="space-y-3">
                            <Link
                                href={`/${slug}/credits`}
                                className="block w-full py-4 bg-slate-900 text-white rounded-2xl font-bold transition-all hover:bg-slate-800 active:scale-[0.98] shadow-lg shadow-slate-900/20"
                            >
                                Réessayer
                            </Link>
                            <Link
                                href={`/${slug}/home`}
                                className="block w-full py-4 bg-slate-100 text-slate-900 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-[0.98]"
                            >
                                Retour au tableau de bord
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CreditsCallbackPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">Chargement...</div>}>
            <CreditsCallbackContent />
        </Suspense>
    );
}
