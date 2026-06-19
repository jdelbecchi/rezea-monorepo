file_path = "apps/web/src/app/[slug]/admin/emails/page.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """                                    {/* 1/3 Left Column: Visual Email Preview Mockup */}
                                    <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aperçu du visuel cible</h3>
                                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                                        </div>
                                        
                                        {/* Mock Email Client Container */}
                                        <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm bg-slate-50 text-[10px]">
                                            {/* Browser Header Bar */}
                                            <div className="bg-slate-100 px-3.5 py-2.5 flex items-center gap-2 border-b border-slate-200">
                                                <div className="flex gap-1.5 shrink-0">
                                                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block"></span>
                                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                                </div>
                                                <div className="w-full bg-white rounded-md text-[9px] text-slate-400 text-center py-0.5 border border-slate-200 truncate select-none">
                                                    apercu-zenstudio-mockup
                                                </div>
                                            </div>
                                            
                                            {/* Email Client Content */}
                                            <div className="bg-white text-slate-700">
                                                {/* Brand Logo & Name */}
                                                <div className="p-4 pb-2 flex flex-col items-center justify-center">
                                                    <svg viewBox="0 0 100 100" className="w-9 h-9 text-[#a7825d]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M50 20 C40 38 40 68 50 80 C60 68 60 38 50 20 Z" />
                                                        <path d="M50 35 C25 45 25 70 50 80" />
                                                        <path d="M50 35 C75 45 75 70 50 80" />
                                                        <path d="M50 50 C10 58 15 78 50 80" />
                                                        <path d="M50 50 C90 58 85 78 50 80" />
                                                    </svg>
                                                </div>

                                                {/* Slogan */}
                                                <div className="px-4 text-center">
                                                    <div className="border-t border-slate-200 w-10 mx-auto my-1.5" />
                                                    <div className="text-[10px] font-light text-[#475569] mb-2" style={{ fontFamily: "'Livvic', sans-serif" }}>
                                                        Le bien-être à chaque respiration | A vos côtés depuis 2005
                                                    </div>
                                                </div>

                                                {/* Premium Yoga Cover Image - Full Width / Edge-to-Edge */}
                                                <div className="w-full">
                                                    <img 
                                                        src="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop" 
                                                        className="w-full h-auto block" 
                                                        alt="Zen Yoga Studio Preview" 
                                                    />
                                                </div>"""

replacement = """                                    {/* 1/3 Left Column: Visual Email Preview Mockup */}
                                    <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2">
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aperçu cible</h3>
                                            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 select-none shrink-0">
                                                <button
                                                    onClick={() => setMarketingMockupHasImage(true)}
                                                    className={`px-2 py-0.5 text-[9px] font-semibold rounded-md transition-all ${marketingMockupHasImage ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                                                >
                                                    Avec image
                                                </button>
                                                <button
                                                    onClick={() => setMarketingMockupHasImage(false)}
                                                    className={`px-2 py-0.5 text-[9px] font-semibold rounded-md transition-all ${!marketingMockupHasImage ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                                                >
                                                    Sans image
                                                </button>
                                            </div>
                                        </div>
                                        
                                        {/* Mock Email Client Container */}
                                        <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm bg-slate-50 text-[10px]">
                                            {/* Browser Header Bar */}
                                            <div className="bg-slate-100 px-3.5 py-2.5 flex items-center gap-2 border-b border-slate-200">
                                                <div className="flex gap-1.5 shrink-0">
                                                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block"></span>
                                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                                </div>
                                                <div className="w-full bg-white rounded-md text-[9px] text-slate-400 text-center py-0.5 border border-slate-200 truncate select-none">
                                                    apercu-zenstudio-mockup
                                                </div>
                                            </div>
                                            
                                            {/* Email Client Content */}
                                            <div className="bg-white text-slate-700">
                                                {/* Brand Logo & Name */}
                                                <div className="pt-5 pb-1 flex flex-col items-center justify-center">
                                                    <svg viewBox="0 0 100 100" className="w-14 h-14 text-[#a7825d]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M50 20 C40 38 40 68 50 80 C60 68 60 38 50 20 Z" />
                                                        <path d="M50 35 C25 45 25 70 50 80" />
                                                        <path d="M50 35 C75 45 75 70 50 80" />
                                                        <path d="M50 50 C10 58 15 78 50 80" />
                                                        <path d="M50 50 C90 58 85 78 50 80" />
                                                    </svg>
                                                </div>

                                                {/* Slogan */}
                                                <div className="px-4 text-center">
                                                    <div className="border-t border-slate-200 w-10 mx-auto my-1" />
                                                    <div className="text-[10px] font-light text-[#475569] mb-3" style={{ fontFamily: "'Livvic', sans-serif" }}>
                                                        Le bien-être à chaque respiration | A vos côtés depuis 2005
                                                    </div>
                                                </div>

                                                {/* Premium Yoga Cover Image or Separator - Full Width / Edge-to-Edge */}
                                                {marketingMockupHasImage ? (
                                                    <div className="w-full">
                                                        <img 
                                                            src="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop" 
                                                            className="w-full h-auto block" 
                                                            alt="Zen Yoga Studio Preview" 
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="border-t border-slate-200 w-full" />
                                                )}"""

# Normalize line endings
content_norm = content.replace("\r\n", "\n")
target_norm = target.replace("\r\n", "\n")
replacement_norm = replacement.replace("\r\n", "\n")

state_target = '    // Marketing State\n    const [selectedMarketingCard, setSelectedMarketingCard] = useState<any | null>(null);'
state_replacement = '    // Marketing State\n    const [marketingMockupHasImage, setMarketingMockupHasImage] = useState(true);\n    const [selectedMarketingCard, setSelectedMarketingCard] = useState<any | null>(null);'

if target_norm in content_norm and state_target in content_norm:
    new_content = content_norm.replace(target_norm, replacement_norm, 1)
    new_content = new_content.replace(state_target, state_replacement, 1)
    with open(file_path, "w", encoding="utf-8", newline="\r\n") as f:
        f.write(new_content)
    print("Successfully replaced mockup content and added state variable!")
else:
    print("Error: Target content or state target not found in file!")
