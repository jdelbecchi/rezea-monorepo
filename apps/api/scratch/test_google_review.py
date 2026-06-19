import sys
import os
import asyncio
from datetime import datetime, timedelta

# Ajouter le path de l'app au sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import AsyncSessionLocal
from app.models.models import Tenant, User, Session, Booking, BookingStatus
from app.services.tasks import process_google_review_prompts
from sqlalchemy import select

async def test_google_review_prompts():
    print("🧪 Démarrage du test pour les avis Google automatiques...")
    
    async with AsyncSessionLocal() as db:
        # 1. Récupérer un tenant existant ou en créer un de test
        tenant_res = await db.execute(select(Tenant).limit(1))
        tenant = tenant_res.scalar_one_or_none()
        
        if not tenant:
            print("❌ Aucun tenant en base de données pour exécuter le test.")
            return

        print(f"🏢 Utilisation du tenant: {tenant.name} (id: {tenant.id})")
        
        # Sauvegarder l'état initial pour restauration à la fin
        old_enable = tenant.enable_review_prompts
        old_url = tenant.google_review_url
        old_threshold = tenant.review_prompt_threshold
        
        # Configurer le tenant pour le test
        tenant.enable_review_prompts = True
        tenant.google_review_url = "https://g.page/r/test-rezea"
        tenant.review_prompt_threshold = 2
        
        # 2. Récupérer un utilisateur de test du même tenant
        user_res = await db.execute(
            select(User).where(User.tenant_id == tenant.id).limit(1)
        )
        user = user_res.scalar_one_or_none()
        
        if not user:
            print(f"❌ Aucun utilisateur trouvé pour le tenant {tenant.name}.")
            return
            
        print(f"👤 Utilisation de l'utilisateur: {user.email} (id: {user.id})")
        
        # Reset l'état d'envoi de l'e-mail
        old_sent_at = user.review_prompt_sent_at
        user.review_prompt_sent_at = None
        
        # 3. Créer une séance de test si besoin, et lui associer 2 bookings complétés
        session_res = await db.execute(
            select(Session).where(Session.tenant_id == tenant.id).limit(1)
        )
        session = session_res.scalar_one_or_none()
        
        if not session:
            # Créer une séance bidon
            session = Session(
                tenant_id=tenant.id,
                title="Séance Test Avis Google",
                start_time=datetime.utcnow() - timedelta(hours=2),
                end_time=datetime.utcnow() - timedelta(hours=1),
                max_participants=10
            )
            db.add(session)
            await db.flush()
        
        # Supprimer les bookings complétés temporairement de cet utilisateur pour maîtriser le test
        # (on va juste créer 2 bookings complétés de test)
        bookings_created = []
        for i in range(2):
            b = Booking(
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                status=BookingStatus.COMPLETED,
                credits_used=1.0
            )
            db.add(b)
            bookings_created.append(b)
            
        await db.flush()
        print("📅 Création de 2 bookings complétés pour le test.")

        # Commiter temporairement les modifications pour que la tâche de fond les lise
        await db.commit()

    # 4. Exécuter la tâche de fond
    try:
        await process_google_review_prompts()
        print("⚙️ Tâche de fond process_google_review_prompts exécutée.")
    except Exception as e:
        print(f"❌ Erreur lors de l'exécution de la tâche: {e}")
        return

    # 5. Vérifier les résultats
    async with AsyncSessionLocal() as db:
        user_res = await db.execute(select(User).where(User.id == user.id))
        updated_user = user_res.scalar()
        
        print(f"📬 Résultat review_prompt_sent_at: {updated_user.review_prompt_sent_at}")
        if updated_user.review_prompt_sent_at is not None:
            print("✅ SUCCÈS: L'e-mail de demande d'avis a bien été simulé/envoyé et le flag review_prompt_sent_at a été mis à jour !")
        else:
            print("❌ ÉCHEC: Le flag review_prompt_sent_at est toujours NULL.")

        # 6. NETTOYAGE (remettre en état initial)
        print("🧹 Nettoyage de la base de données...")
        
        # Recharger et restaurer le tenant
        tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant.id))
        db_tenant = tenant_res.scalar()
        db_tenant.enable_review_prompts = old_enable
        db_tenant.google_review_url = old_url
        db_tenant.review_prompt_threshold = old_threshold
        
        # Restaurer l'utilisateur
        user_res = await db.execute(select(User).where(User.id == user.id))
        db_user = user_res.scalar()
        db_user.review_prompt_sent_at = old_sent_at
        
        # Supprimer les bookings créés
        for b in bookings_created:
            db_b = await db.get(Booking, b.id)
            if db_b:
                await db.delete(db_b)
                
        await db.commit()
        print("✅ Nettoyage terminé.")

if __name__ == "__main__":
    asyncio.run(test_google_review_prompts())
