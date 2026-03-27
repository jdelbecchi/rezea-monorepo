-- Migration: Enrichir le modèle Offer avec les champs d'abonnement
-- Date: 2026-02-02

-- Ajouter les nouveaux champs
ALTER TABLE offers ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(20);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS validity_end_date DATE;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN DEFAULT FALSE;

-- Modifier classes_included pour permettre NULL (pour les offres illimitées)
ALTER TABLE offers ALTER COLUMN classes_included DROP NOT NULL;

-- Supprimer la contrainte de vérification sur classes_included si elle existe
ALTER TABLE offers DROP CONSTRAINT IF EXISTS check_classes_positive;

-- Créer un index pour les offres par type d'abonnement
CREATE INDEX IF NOT EXISTS idx_offers_subscription_type ON offers(tenant_id, subscription_type) WHERE subscription_type IS NOT NULL;

-- Commentaires
COMMENT ON COLUMN offers.subscription_type IS 'Type d''abonnement: mensuel, 3_mois, 5_mois, 6_mois, annuelle';
COMMENT ON COLUMN offers.validity_end_date IS 'Date de fin de validité de l''offre';
COMMENT ON COLUMN offers.is_unlimited IS 'Indique si l''offre inclut un nombre illimité de cours';
