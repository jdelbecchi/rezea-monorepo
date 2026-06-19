"use client";

import { useState } from "react";
import Link from "next/link";

export default function PreviewEmailPage() {
  const [clubName, setClubName] = useState("Mon Club Sportif");
  const [userName, setUserName] = useState("Thomas");
  const [threshold, setThreshold] = useState(5);
  const [googleUrl, setGoogleUrl] = useState("https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83dQY4");
  const [primaryColor, setPrimaryColor] = useState("#4f46e5"); // indigo-600

  const colorPresets = [
    { name: "Indigo", value: "#4f46e5" },
    { name: "Slate", value: "#0f172a" },
    { name: "Emerald", value: "#059669" },
    { name: "Amber", value: "#d97706" },
    { name: "Rose", value: "#e11d48" },
    { name: "Violet", value: "#7c3aed" },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-xl">🌐</span>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">REZEA</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Simulateur d'Email Marketing</p>
          </div>
        </div>
        <Link 
          href="/mon-club/admin" 
          className="text-xs font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 hover:bg-slate-900"
        >
          ← Retour au Dashboard
        </Link>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left pane: Configuration Control Panel */}
        <section className="w-full lg:w-[400px] border-r border-slate-800 bg-slate-950/50 p-6 flex flex-col gap-6 overflow-y-auto shrink-0">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Configuration de la Campagne</h2>
            <p className="text-xs text-slate-400">Personnalisez en temps réel l'e-mail automatique envoyé à vos membres.</p>
          </div>

          <div className="h-px bg-slate-800" />

          {/* Form */}
          <div className="space-y-5">
            {/* Nom du Club */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Nom de l'établissement</label>
              <input 
                type="text" 
                value={clubName} 
                onChange={(e) => setClubName(e.target.value)} 
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Ex: Mon Club Sportif"
              />
            </div>

            {/* Prénom de l'utilisateur (pour le test) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Prénom du destinataire (Exemple)</label>
              <input 
                type="text" 
                value={userName} 
                onChange={(e) => setUserName(e.target.value)} 
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Ex: Thomas"
              />
            </div>

            {/* Seuil de séances */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Seuil de séances complétées</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="1" 
                  max="100"
                  value={threshold} 
                  onChange={(e) => setThreshold(parseInt(e.target.value) || 1)} 
                  className="w-20 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-white text-center focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <span className="text-xs text-slate-400">séances complétées</span>
              </div>
            </div>

            {/* Lien avis Google */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Lien d'avis Google My Business</label>
              <input 
                type="url" 
                value={googleUrl} 
                onChange={(e) => setGoogleUrl(e.target.value)} 
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Ex: https://g.page/..."
              />
              <p className="text-[10px] text-slate-500">Ce lien redirige directement l'utilisateur vers la boîte de dialogue de note de votre fiche.</p>
            </div>


            {/* Couleur principale */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300 block">Couleur de l'établissement (Bouton)</label>
              <div className="grid grid-cols-6 gap-2">
                {colorPresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setPrimaryColor(preset.value)}
                    style={{ backgroundColor: preset.value }}
                    className={`h-7 rounded-lg relative transition-transform hover:scale-110 active:scale-95 ${
                      primaryColor === preset.value ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950 scale-105" : ""
                    }`}
                    title={preset.name}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="color" 
                  value={primaryColor} 
                  onChange={(e) => setPrimaryColor(e.target.value)} 
                  className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <span className="text-xs text-slate-400 font-mono">{primaryColor.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed">
            ✨ Cette configuration sera modifiable dans votre onglet <strong className="text-slate-400">Avis Google</strong> au sein de la page <strong className="text-slate-400">Communication & Marketing</strong> de votre espace admin.
          </div>
        </section>

        {/* Right pane: Gmail/Email Mock Interface */}
        <section className="flex-1 bg-slate-900 p-6 flex flex-col justify-start items-center overflow-y-auto">
          
          {/* Email Client Wrapper */}
          <div className="w-full max-w-[650px] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 flex flex-col">
            
            {/* Email client header */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-400" />
                  <span className="w-3 h-3 rounded-full bg-amber-400" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Aperçu Email Client</span>
              </div>
              
              <div className="h-px bg-slate-200 my-1" />

              <div className="grid grid-cols-[60px_1fr] text-xs gap-y-1 text-slate-600">
                <span className="font-semibold text-slate-400">De :</span>
                <div>
                  <span className="font-bold text-slate-800">{clubName}</span>{" "}
                  <span className="text-slate-400 font-mono">
                    &lt;{clubName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "club"}-noreply@rezea.app&gt;
                  </span>
                </div>
                
                <span className="font-semibold text-slate-400">À :</span>
                <div>
                  <span className="font-bold text-slate-800">{userName}</span>{" "}
                  <span className="text-slate-400 font-mono">&lt;{userName.toLowerCase()}@gmail.com&gt;</span>
                </div>

                <span className="font-semibold text-slate-400">Objet :</span>
                <div className="font-bold text-slate-900">
                  [{clubName}] Vos {threshold} séances avec nous ! 🎉
                </div>
              </div>
            </div>

            {/* Email Body Area */}
            <div className="bg-slate-100/50 p-8 flex justify-center">
              
              {/* Actual HTML Email template simulation */}
              <div className="w-full max-w-[560px] bg-white rounded-[24px] border border-slate-200/60 shadow-md p-6 font-sans flex flex-col gap-5">
                
                {/* Logo Area */}
                <div className="flex justify-center items-center py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold text-white shadow-sm" style={{ backgroundColor: primaryColor }}>
                      {clubName.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="font-bold text-slate-900 text-sm tracking-tight">{clubName}</span>
                  </div>
                </div>

                {/* Email Title */}
                <h2 className="font-bold text-[20px] text-slate-900 leading-tight text-center mt-2">
                  Déjà {threshold} séances chez {clubName} !
                </h2>

                <div className="w-12 h-0.5 mx-auto bg-slate-200" />

                {/* Content */}
                <div className="text-[14px] text-slate-600 leading-relaxed space-y-4">
                  <p>Bonjour {userName},</p>
                  
                  <p>
                    Vous venez de passer le cap des <strong>{threshold} séances</strong> chez <strong>{clubName}</strong> 🎉
                  </p>
                  
                  <p>
                    On espère que l'expérience vous plaît ! Pourriez-vous prendre une minute pour partager votre avis sur Google ? Ce retour nous permet de nous améliorer, de faire connaître notre établissement et d'augmenter notre visibilité 😉
                  </p>
                </div>

                {/* Button Action */}
                <div className="text-center py-4">
                  <a 
                    href={googleUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{ backgroundColor: primaryColor }}
                    className="inline-flex items-center gap-2 text-white font-medium text-xs py-3.5 px-6 rounded-2xl shadow-lg transition-transform hover:scale-105 active:scale-95 duration-150"
                  >
                    <span>⭐</span>
                    <span>Partager mon avis sur Google</span>
                  </a>
                </div>

                <div className="text-[13px] text-slate-500 leading-relaxed">
                  Merci pour votre confiance et votre soutien. A très vite !
                  <br />
                  L'équipe <strong className="text-slate-800">{clubName}</strong>
                </div>

                {/* Email Footer */}
                <div className="border-t border-slate-100 pt-6 mt-4 text-center text-[10px] text-slate-400 space-y-2">
                  <div className="flex justify-center gap-3 font-semibold text-[11px] text-slate-500">
                    <span className="cursor-pointer hover:text-slate-700">Notre Site</span>
                    <span>•</span>
                    <span className="cursor-pointer hover:text-slate-700">Se désabonner</span>
                  </div>
                  
                  <p className="text-[9px] pt-1">
                    © 2026 {clubName} | Cet e-mail est envoyé automatiquement suite à vos séances.
                  </p>
                </div>

              </div>

            </div>

          </div>

        </section>

      </main>
    </div>
  );
}
