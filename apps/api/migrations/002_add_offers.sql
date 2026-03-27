-- Migration: Add offers table and update credit_transactions
-- Date: 2026-02-02

-- Create offers table
CREATE TABLE IF NOT EXISTS offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    classes_included INTEGER NOT NULL CHECK (classes_included > 0),
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    is_popular BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index on tenant_id and is_active for faster queries
CREATE INDEX idx_offers_tenant_active ON offers(tenant_id, is_active);

-- Add offer_id column to credit_transactions
ALTER TABLE credit_transactions 
ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES offers(id) ON DELETE SET NULL;

-- Add index on offer_id
CREATE INDEX IF NOT EXISTS idx_credit_transactions_offer ON credit_transactions(offer_id);

-- Insert default offers for existing tenants (optional)
-- Uncomment and adjust if you want to create default offers
/*
INSERT INTO offers (tenant_id, name, description, price_cents, classes_included, is_popular, display_order)
SELECT 
    id as tenant_id,
    'Forfait Découverte' as name,
    'Idéal pour découvrir nos cours' as description,
    3000 as price_cents,  -- 30€
    5 as classes_included,
    false as is_popular,
    1 as display_order
FROM tenants
UNION ALL
SELECT 
    id,
    'Forfait Mensuel',
    'Le meilleur rapport qualité/prix',
    8000,  -- 80€
    12,
    true,  -- Popular
    2
FROM tenants
UNION ALL
SELECT 
    id,
    'Forfait Illimité',
    'Pour les plus motivés',
    12000,  -- 120€
    30,
    false,
    3
FROM tenants;
*/
