import os

file_path = r"c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\emails\page.tsx"

with open(file_path, "rb") as f:
    content_bytes = f.read()

content = content_bytes.replace(b"\r", b"").decode("utf-8")

# 1. Replace button inside "💡 Idées d'actions recommandées"
btn_start_str = 'onClick={() => setShowTips(!showTips)}'
btn_start_idx = content.find(btn_start_str)

if btn_start_idx != -1:
    # We want to replace from '<button' just before btn_start_idx to '</button>'
    start_tag_idx = content.rfind('<button', 0, btn_start_idx)
    end_tag_idx = content.find('</button>', btn_start_idx)
    
    if start_tag_idx != -1 and end_tag_idx != -1:
        new_btn = """<button 
                                             type="button"
                                             onClick={() => setShowTips(!showTips)}
                                             className="w-full flex items-center justify-between font-semibold text-slate-700 outline-none select-none"
                                         >
                                             <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-left">
                                                 <h4 className="text-xs font-semibold flex items-center gap-1.5 text-slate-800">
                                                     💡 idées d&apos;actions recommandées
                                                 </h4>
                                             </div>
                                             <span className="text-[11px] font-medium text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1 shrink-0 ml-2">
                                                 {showTips ? "masquer ▲" : "afficher les conseils ▼"}
                                             </span>
                                         </button>"""
        content = content[:start_tag_idx] + new_btn + content[end_tag_idx + 9:]
        print("Successfully replaced Button!")
    else:
        print("Error: start_tag_idx or end_tag_idx not found")
else:
    print("Error: btn_start_str not found")

# 2. Replace Color and Image fields with Image-only field
start_fields_str = "{/* Accent Color and Illustration Image Fields */}"
end_fields_str = 'label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">corps du message</label>'

start_idx = content.find(start_fields_str)
end_idx = content.find(end_fields_str)

if start_idx != -1 and end_idx != -1:
    # We want to replace from start_idx to the '<div>' preceding the end_fields_str
    # Let's find '<div>' backwards from end_idx
    div_start_idx = content.rfind('<div>', start_idx, end_idx)
    if div_start_idx != -1:
        new_image_block = """{/* Illustration Image Field */}
                                     <div className="w-full">
                                         <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Image d&apos;illustration</label>
                                         {marketingImageUrl ? (
                                             <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 p-1.5 pr-3.5 rounded-xl">
                                                 <img
                                                     src={`${API_URL}${marketingImageUrl}`}
                                                     alt="Illustration Preview"
                                                     className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                                                 />
                                                 <span className="text-[10px] font-semibold text-slate-500 truncate flex-1">Image chargée</span>
                                                 <button
                                                     type="button"
                                                     onClick={() => setMarketingImageUrl("")}
                                                     className="text-xs font-bold text-rose-500 hover:text-rose-600 ml-2"
                                                 >
                                                     Retirer
                                                 </button>
                                             </div>
                                         ) : (
                                             <div className="relative">
                                                 <input
                                                     type="file"
                                                     accept="image/*"
                                                     onChange={async (e) => {
                                                         const file = e.target.files?.[0];
                                                         if (!file) return;
                                                         setIsUploadingImage(true);
                                                         try {
                                                             const res = await api.uploadImage(file);
                                                             setMarketingImageUrl(res.url);
                                                         } catch (err) {
                                                             console.error(err);
                                                             alert("Erreur lors de l'upload de l'image.");
                                                         } finally {
                                                             setIsUploadingImage(false);
                                                         }
                                                     }}
                                                     disabled={isUploadingImage}
                                                     className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                 />
                                                 <button
                                                     type="button"
                                                     disabled={isUploadingImage}
                                                     className="w-full py-2.5 border border-dashed border-slate-200 text-slate-500 hover:border-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2"
                                                 >
                                                     {isUploadingImage ? "Chargement..." : "Charger une image 📸"}
                                                 </button>
                                             </div>
                                         )}
                                     </div>
                                     """
        content = content[:start_idx] + new_image_block + content[div_start_idx:]
        print("Successfully replaced fields block!")
    else:
        print("Error: preceding div start not found")
else:
    print("Error: start_fields_str or end_fields_str not found")

# 3. Replace Tips section
tips_start_str = '<div className="mt-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/80 flex items-start gap-3'
tips_end_str = '{/* Modal Footer */}'

start_tips_idx = content.find(tips_start_str)
end_tips_idx = content.find(tips_end_str)

if start_tips_idx != -1 and end_tips_idx != -1:
    new_tips_block = """<div className="mt-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/80 flex items-start gap-3 text-[11px] text-indigo-950 font-normal leading-relaxed">
                                             <span className="text-sm select-none">✨</span>
                                             <div className="space-y-1.5">
                                                 <p className="font-semibold text-indigo-900">Créer la mise en page :</p>
                                                 <ul className="list-disc pl-4 space-y-1">
                                                     <li>Personnaliser le prénom du destinataire en utilisant le tag <code>{"{first_name}"}</code> dans votre texte</li>
                                                     <li>Mettre un mot en évidence dans un encart en l&apos;écrivant en MAJUSCULE et en gras (ex : un code promo, un mot de passe...)</li>
                                                     <li>Insérer un bouton d&apos;action en ajoutant un lien hypertexte seul sur sa propre ligne de texte (ex : Plus d&apos;infos, Réserver votre séance...)</li>
                                                 </ul>
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         </div>
                         """
    content = content[:start_tips_idx] + new_tips_block + content[end_tips_idx:]
    print("Successfully replaced tips block!")
else:
    print("Error: tips_start_str or tips_end_str not found")

# Save file with CRLF
output_bytes = content.replace("\n", "\r\n").encode("utf-8")
with open(file_path, "wb") as f:
    f.write(output_bytes)
print("Saved all changes successfully!")
