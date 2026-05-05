-- Migration: Add legal entity fields to tenants table for invoicing compliance
-- These fields store the establishment's legal information for proper French invoicing

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_form VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_siret VARCHAR(20);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_vat_number VARCHAR(30);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_vat_mention VARCHAR(255);
