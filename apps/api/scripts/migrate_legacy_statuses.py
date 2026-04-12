"""
Script de migration pour normaliser les statuts des commandes.
Met à jour 'en_cours', 'en cours', 'encours' en 'active'.
"""
import asyncio
import sys
import os

# Ajouter le chemin de l'app pour les imports
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.db.session import AsyncSessionLocal
from app.models.models import Order
from sqlalchemy import select, update, or_

async def migrate():
    print("🚀 Démarrage de la migration des statuts...")
    async with AsyncSessionLocal() as db:
        # Liste des statuts à migrer
        legacy_statuses = ["en cours", "en_cours", "encours"]
        
        # 1. Identifier les commandes concernées
        query = select(Order).where(Order.status.in_(legacy_statuses))
        result = await db.execute(query)
        orders = result.scalars().all()
        
        if not orders:
            print("✅ Aucune commande avec un statut legacy trouvée.")
            return

        print(f"🔄 Mise à jour de {len(orders)} commandes...")
        
        # 2. Exécuter la mise à jour
        stmt = (
            update(Order)
            .where(Order.status.in_(legacy_statuses))
            .values(status="active")
        )
        await db.execute(stmt)
        await db.commit()
        
        print("✅ Migration terminée avec succès.")

if __name__ == "__main__":
    asyncio.run(migrate())
