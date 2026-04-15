"use client";

import ClubSearch from "@/components/ClubSearch";

export default function Home() {
  return (
    <main className="min-h-screen relative overflow-hidden bg-[#fbfcfd] flex items-center justify-center p-4">
      {/* Background Abstract Shapes - Zen Blobs */}
      <div className="absolute top-[-5%] left-[-5%] w-[45%] h-[45%] bg-blue-400/30 rounded-full blur-[80px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[55%] h-[55%] bg-indigo-400/25 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      <div className="absolute top-[30%] right-[10%] w-[25%] h-[25%] bg-emerald-300/20 rounded-full blur-[70px] animate-pulse" style={{ animationDelay: '4s' }}></div>

      <div className="max-w-6xl w-full grid md:grid-cols-2 gap-12 items-center relative z-10 py-12">
        
        {/* Left Side: Value Proposition */}
        <div className="space-y-12 text-center md:text-left px-4">
          <div className="space-y-2.5">
            <h1 className="text-5xl md:text-7xl font-semibold text-slate-900 tracking-tight">
              Rezea
            </h1>
            <h2 className="text-sm md:text-xl font-medium text-slate-600 leading-tight md:leading-relaxed md:whitespace-nowrap">
              La solution parfaite <br className="md:hidden" /> pour gérer les réservations.
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:gap-10">
               {[
                 { icon: "🗓️", title: "Planning en temps réel", desc: "Suivez vos séances et évènements en un clin d'œil." },
                 { icon: "💳", title: "Gestion de crédits", desc: "Un système intelligent et automatisé." },
                 { icon: "✨", title: "Expérience Zen", desc: "Une interface pensée pour la simplicité." }
               ].map((item, i) => (
                 <div key={i} className="flex flex-row items-start justify-center md:justify-start gap-4 group">
                    <span className="text-xl md:text-2xl mt-0.5">{item.icon}</span>
                    <div className="space-y-0.5 text-left">
                      <h3 className="font-semibold text-slate-800 text-base md:text-lg">{item.title}</h3>
                      <p className="text-slate-500 text-sm leading-tight max-w-[220px] md:max-w-none">{item.desc}</p>
                    </div>
                 </div>
               ))}
          </div>
        </div>

        {/* Right Side: Club Search */}
        <div className="flex justify-center md:justify-end">
          <ClubSearch />
        </div>
      </div>
    </main>
  );
}
