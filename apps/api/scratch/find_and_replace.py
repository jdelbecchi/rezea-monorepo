import re
import os

filepath = "apps/web/src/app/[slug]/admin/emails/page.tsx"

new_html = """                                         <div className="mt-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/80 flex items-start gap-3 text-[11px] text-indigo-950 font-normal leading-relaxed">
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
        content = f.read()
    
    # We locate the exact div block enclosing "Utilisez le tag"
    # The pattern matches: <div class/className="...bg-amber-50...">...Utilisez le tag...</div>
    pattern = r'<div[^>]*bg-amber-50[^>]*>.*?Utilisez le tag.*?</div>'
    
    # Search with re.DOTALL to let . match newlines
    match = re.search(pattern, content, re.DOTALL)
    if match:
        matched_text = match.group(0)
        content = content.replace(matched_text, new_html)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print("Successfully updated instructions banner in page.tsx using regex!")
    else:
        print("Regex pattern for tip box not matched. Please check file structure.")
else:
    print(f"File not found: {filepath}")
