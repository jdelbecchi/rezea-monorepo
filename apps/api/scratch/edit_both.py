import os

file_path = r"c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\emails\page.tsx"

with open(file_path, "rb") as f:
    content_bytes = f.read()

content = content_bytes.replace(b"\r", b"").decode("utf-8")

# 1. ideas capitalization
old_ideas_title = "💡 idées d&apos;actions recommandées"
new_ideas_title = "💡 Idées d&apos;actions recommandées"

if old_ideas_title in content:
    content = content.replace(old_ideas_title, new_ideas_title)
    print("Replaced Ideas title successfully!")
else:
    print("Error: old_ideas_title not found")

# 2. toggle text capitalization
old_toggle = '{showTips ? "masquer ▲" : "afficher les conseils ▼"}'
new_toggle = '{showTips ? "Masquer ▲" : "Afficher les conseils ▼"}'

if old_toggle in content:
    content = content.replace(old_toggle, new_toggle)
    print("Replaced toggle text successfully!")
else:
    print("Error: old_toggle not found")

# 3. layout tips list semi-bolding
old_list = """                                                 <ul className="list-disc pl-4 space-y-1">
                                                     <li>Personnaliser le prénom du destinataire en utilisant le tag <code>{"{first_name}"}</code> dans votre texte</li>
                                                     <li>Mettre un mot en évidence dans un encart en l&apos;écrivant en MAJUSCULE et en gras (ex : un code promo, un mot de passe...)</li>
                                                     <li>Insérer un bouton d&apos;action en ajoutant un lien hypertexte seul sur sa propre ligne de texte (ex : Plus d&apos;infos, Réserver votre séance...)</li>
                                                 </ul>"""

new_list = """                                                 <ul className="list-disc pl-4 space-y-1">
                                                     <li><span className="font-semibold">Personnaliser le prénom du destinataire</span> en utilisant le tag <code>{"{first_name}"}</code> dans votre texte</li>
                                                     <li><span className="font-semibold">Mettre un mot en évidence</span> dans un encart en l&apos;écrivant en MAJUSCULE et en gras (ex : un code promo, un mot de passe...)</li>
                                                     <li><span className="font-semibold">Insérer un bouton d&apos;action</span> en ajoutant un lien hypertexte seul sur sa propre ligne de texte (ex : Plus d&apos;infos, Réserver votre séance...)</li>
                                                 </ul>"""

if old_list in content:
    content = content.replace(old_list, new_list)
    print("Replaced layout tips list successfully!")
else:
    print("Error: old_list not found")

# 4. Image of illustration label optionnel and description
old_image_label = '<label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Image d&apos;illustration</label>'
new_image_label = '<label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Image d&apos;illustration <span className="lowercase font-normal text-slate-400/80">(optionnel)</span></label>'

if old_image_label in content:
    content = content.replace(old_image_label, new_image_label)
    print("Replaced image label successfully!")
else:
    print("Error: old_image_label not found")

# Let's add the description right before the closing div of the image field container
# The image field container starts with: {/* Illustration Image Field */}\n                                     <div className="w-full">
# And ends with:
#                                          )}\n                                     </div>
# Let's find this container end
target_image_block = """                                                 <button
                                                     type="button"
                                                     disabled={isUploadingImage}
                                                     className="w-full py-2.5 border border-dashed border-slate-200 text-slate-500 hover:border-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2"
                                                 >
                                                     {isUploadingImage ? "Chargement..." : "Charger une image 📸"}
                                                 </button>
                                             </div>
                                         )}
                                     </div>"""

new_image_block = """                                                 <button
                                                     type="button"
                                                     disabled={isUploadingImage}
                                                     className="w-full py-2.5 border border-dashed border-slate-200 text-slate-500 hover:border-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2"
                                                 >
                                                     {isUploadingImage ? "Chargement..." : "Charger une image 📸"}
                                                 </button>
                                             </div>
                                         )}
                                         <p className="text-[10px] text-slate-400 italic mt-1.5 leading-relaxed">
                                             L&apos;image s&apos;affichera en haut de l&apos;email juste en dessous de votre logo et votre phrase d&apos;accroche renseignés dans les paramètres
                                         </p>
                                     </div>"""

if target_image_block in content:
    content = content.replace(target_image_block, new_image_block)
    print("Added image description successfully!")
else:
    print("Error: target_image_block not found")

with open(file_path, "wb") as f:
    f.write(content.replace("\n", "\r\n").encode("utf-8"))
print("Done!")
