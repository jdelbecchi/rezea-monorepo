"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminOffersRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/dashboard/admin/shop/offers");
    }, [router]);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-slate-400">Redirection...</p>
        </div>
    );
}
