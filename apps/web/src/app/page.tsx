"use client";

import { useEffect, useState } from "react";
import ClubSearch from "@/components/ClubSearch";
import TenantPortal from "@/app/login/page";
import { getTenantSlug } from "@/lib/api";

export default function Home() {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    setSlug(getTenantSlug());
  }, []);

  if (slug) {
    return <TenantPortal />;
  }
  return (
    <main className="min-h-screen relative overflow-hidden bg-[#fbfcfd] flex items-center justify-center p-4">
      {/* Background Abstract Shapes - Zen Blobs */}
      <div className="absolute top-[-5%] left-[-5%] w-[45%] h-[45%] bg-blue-400/30 rounded-full blur-[80px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[55%] h-[55%] bg-indigo-400/25 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      <div className="absolute top-[30%] right-[10%] w-[25%] h-[25%] bg-emerald-300/20 rounded-full blur-[70px] animate-pulse" style={{ animationDelay: '4s' }}></div>

      <div className="max-w-6xl w-full flex flex-col md:grid md:grid-cols-2 gap-8 md:gap-12 items-center relative z-10 py-12">
        
        {/* Mobile Header */}
        <div className="space-y-2.5 text-center md:hidden px-4 order-first">
          <h1 className="text-5xl font-semibold text-slate-900 tracking-tight">
            Rezea
          </h1>
          <h2 className="text-sm font-medium text-slate-600 leading-tight">
            La solution parfaite pour gérer vos réservations.
          </h2>
        </div>

        {/* Left Side: Value Proposition */}
        <div className="flex flex-col gap-6 md:gap-12 text-center md:text-left px-4 order-2 md:order-1">
          {/* Desktop Header */}
          <div className="space-y-2.5 hidden md:block">
            <h1 className="text-5xl md:text-7xl font-semibold text-slate-900 tracking-tight">
              Rezea
            </h1>
            <h2 className="text-sm md:text-xl font-medium text-slate-600 leading-tight md:leading-relaxed md:whitespace-nowrap">
              La solution parfaite <br className="md:hidden" /> pour gérer vos réservations.
            </h2>
          </div>
 
          <div className="grid grid-cols-1 gap-5 md:gap-6">
               {[
                 { icon: "🍃", title: "Liberté totale, inscriptions instantanées", desc: "Réservez, annulez et gérez vos séances en quelques secondes, sur ordinateur ou mobile." },
                 { icon: "🔋", title: "Flexibilité & sur-mesure", desc: "Rechargez vos crédits à votre rythme et programmez vos forfaits selon vos besoins." },
                 { icon: "⚡", title: "Vos données en un coup d'œil", desc: "Consultez votre historique, vos soldes de crédits et l’état de vos inscriptions facilement et à tout moment." },
                 { icon: "💬", title: "Toujours informé !", desc: "Restez au courant des actus, des événements et des rappels utiles directement depuis votre écran d’accueil, sans polluer votre boîte mail." },
                 { icon: "✨", title: "Une interface fluide & intuitive", desc: "Pensée pour votre confort, conçue pour vous accompagner partout, sans téléchargement." }
               ].map((item, i) => (
                 <div key={i} className="flex flex-row items-start justify-center md:justify-start gap-4 group">
                    <span className="text-xl md:text-2xl mt-0.5">{item.icon}</span>
                    <div className="space-y-0.5 text-left">
                      <h3 className="font-semibold text-slate-800 text-sm md:text-base">{item.title}</h3>
                      <p className="text-slate-500 text-xs md:text-sm leading-tight max-w-[280px] md:max-w-none">{item.desc}</p>
                    </div>
                 </div>
               ))}
          </div>
        </div>
 
        {/* Right Side: Club Search */}
        <div className="flex justify-center md:justify-end order-1 md:order-2 w-full">
          <ClubSearch />
        </div>
      </div>
    </main>
  );
}
