"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

export default function ContactsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const userData = await api.getCurrentUser();
                if (userData.role === "user") {
                    router.push("/dashboard");
                    return;
                }
                setUser(userData);
            } catch {
                router.push("/login");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-slate-400">Chargement...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            <Sidebar user={user} />
            <main className="flex-1 p-8">
                <div className="max-w-4xl mx-auto space-y-6">
                    <header>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">📇 Contacts</h1>
                        <p className="text-slate-500 mt-1">Gestion des contacts</p>
                    </header>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
                        <div className="text-5xl mb-4">🚧</div>
                        <h2 className="text-xl font-semibold text-slate-700">Page en construction</h2>
                        <p className="text-slate-500 mt-2">
                            Cette fonctionnalité sera bientôt disponible.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
