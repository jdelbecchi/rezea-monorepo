"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function AdminSessionsRedirect() {
    const router = useRouter();
    const params = useParams();

    useEffect(() => {
        router.replace(`/${params.slug}/admin/planning/sessions`);
    }, [router]);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-slate-400">Redirection...</p>
        </div>
    );
}
