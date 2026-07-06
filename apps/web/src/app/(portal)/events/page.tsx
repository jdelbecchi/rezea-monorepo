"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { api, User } from "@/lib/api";

export default function MemberEventsPage() {
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        api.getCurrentUser().then(setUser).catch(() => { });
    }, []);

    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar user={user} />
            <main className="flex-1 p-8">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">🎉 Evenements</h1>
                    <p className="text-slate-500">Découvrez et inscrivez-vous à nos événements spéciaux</p>
                    <div className="mt-8 bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-400">
                        <p className="text-lg">Cette section sera bientôt disponible.</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
