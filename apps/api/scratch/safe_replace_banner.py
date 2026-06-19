import os

filepath = "apps/web/src/app/[slug]/admin/emails/page.tsx"

new_banner_block = """                                         <div className="mt-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/80 flex items-start gap-3 text-[11px] text-indigo-950 font-normal leading-relaxed">
                                             <span className="text-sm select-none">✨</span>
                                             <div className="space-y-1.5">
                                                 <p className="font-semibold text-indigo-900">Astuces et optimisations visuelles automatiques :</p>
                                                 <ul className="list-disc pl-4 space-y-1">
                                                     <li><b>Personnalisation</b> : Utilisez le tag <code>{"{first_name}"}</code> dans votre texte pour insérer le prénom de chaque destinataire (ex: Julie, Thomas).</li>
                                                     <li><b>Cadre Code Promo</b> : Rédigez un code en MAJUSCULES et mettez-le <b>en gras</b> (ex: <b>MERCIAMIS</b>) pour l&apos;afficher dans un magnifique encart double-bordure pastel.</li>
                                                     <li><b>Bouton d&apos;Action</b> : Insérez un lien hypertexte seul sur sa propre ligne de paragraphe pour le transformer automatiquement en un bouton d&apos;action arrondi à la couleur du club.</li>
                                                 </ul>
                                             </div>
                                         </div>"""

if os.path.exists(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()
    
    target_idx = -1
    for idx, line in enumerate(lines):
        if "Utilisez le tag" in line and "first_name" in line and "Marie, Pierre" in line:
            target_idx = idx
            break
            
    if target_idx != -1:
        start_idx = target_idx - 2
        end_idx = target_idx + 2
        
        # Re-assemble content
        new_lines = lines[:start_idx] + [new_banner_block + "\n"] + lines[end_idx + 1:]
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
            
        print("Successfully updated instructions banner surgically without console encoding issues!")
    else:
        print("Target line not found in file. Please verify content.")
else:
    print(f"File not found: {filepath}")
