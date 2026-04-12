"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatCredits } from "@/lib/formatters";

function CreditsCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
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
                        router.push('/dashboard');
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

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
            <div className="max-w-md w-full">
                {status === 'loading' && (
                    <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-6"></div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Vérification du paiement...</h2>
                        <p className="text-slate-500">Veuillez patienter</p>
                    </div>
                )}

                {status === 'success' && (
                    <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
                        <div className="text-6xl mb-6">✅</div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-4">Paiement réussi !</h2>
                        <p className="text-slate-600 mb-6">{message}</p>

                        {newBalance !== null && (
                            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white mb-6">
                                <p className="text-blue-100 text-sm">Nouveau solde</p>
                                <p className="text-4xl font-bold mt-2">{formatCredits(newBalance)}</p>
                                <p className="text-blue-100 text-sm mt-1">crédits</p>
                            </div>
                        )}

                        <p className="text-slate-400 text-sm">Redirection automatique dans 3 secondes...</p>

                        <Link
                            href="/dashboard"
                            className="inline-block mt-4 text-blue-600 hover:text-blue-700 font-medium"
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
                                href="/dashboard/credits"
                                className="block w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
                            >
                                Réessayer
                            </Link>
                            <Link
                                href="/dashboard"
                                className="block w-full py-3 bg-slate-100 text-slate-900 rounded-lg font-bold hover:bg-slate-200 transition-colors"
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
