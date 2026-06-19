-- Migration: Ajout de la table staff_notes
-- Date: 2026-06-17

CREATE TABLE IF NOT EXISTS staff_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    entity_type VARCHAR(20) NOT NULL DEFAULT 'general',  -- 'session' | 'event' | 'general'
    entity_id UUID,                                       -- NULL si note générale
    entity_label TEXT,                                    -- Ex: "Yoga – Lun. 10h"
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (tenant_id, entity_id)                         -- 1 note max par séance/event
);

CREATE INDEX IF NOT EXISTS idx_staff_notes_tenant ON staff_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_notes_entity ON staff_notes(tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_staff_notes_unresolved ON staff_notes(tenant_id, is_resolved);
