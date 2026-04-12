"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // La page de connexion a été fusionnée avec la page d'accueil.
    // On redirige donc vers la racine.
    router.replace("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#fbfcfd] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
    </div>
  );
}
