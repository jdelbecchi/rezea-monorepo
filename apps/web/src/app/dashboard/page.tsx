"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRedirect() {
    const router = useRouter();

    useEffect(() => {
        const slug = localStorage.getItem("tenant_slug");
        if (slug) {
            router.replace(`/${slug}/home`);
        } else {
            router.replace("/");
        }
    }, [router]);

    return (
        <div className="h-screen flex items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-400 font-medium animate-pulse">Redirection vers votre espace...</p>
            </div>
        </div>
    );
}
