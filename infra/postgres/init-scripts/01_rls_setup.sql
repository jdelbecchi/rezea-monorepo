-- Script d'initialisation PostgreSQL avec Row-Level Security
-- Ce script configure les politiques RLS pour l'isolation multi-tenant

-- Activer l'extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Fonction pour obtenir le tenant courant depuis le contexte
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_tenant', TRUE)::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Fonction FIFO pour consommation de crédits
-- Cette fonction gère la logique de consommation FIFO avec verrouillage
CREATE OR REPLACE FUNCTION consume_credits_fifo(
    p_tenant_id UUID,
    p_user_id UUID,
    p_amount INTEGER
) RETURNS UUID AS $$
DECLARE
    v_account_id UUID;
    v_current_balance INTEGER;
    v_transaction_id UUID;
BEGIN
    -- Récupérer et verrouiller le compte
    SELECT id, balance INTO v_account_id, v_current_balance
    FROM credit_accounts
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
    FOR UPDATE;

    -- Vérifier le solde
    IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
        RAISE EXCEPTION 'Crédits insuffisants';
    END IF;

    -- Mettre à jour le solde
    UPDATE credit_accounts
    SET balance = balance - p_amount,
        total_used = total_used + p_amount,
        updated_at = NOW()
    WHERE id = v_account_id;

    -- Créer la transaction
    INSERT INTO credit_transactions (
        tenant_id,
        account_id,
        transaction_type,
        amount,
        balance_after,
        description,
        consumed_at
    ) VALUES (
        p_tenant_id,
        v_account_id,
        'booking',
        -p_amount,
        v_current_balance - p_amount,
        'Consommation de crédits',
        NOW()
    ) RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Note: Les tables seront créées par SQLAlchemy/Alembic
-- Les politiques RLS seront activées après la création des tables

-- Fonction pour créer les politiques RLS sur une table
CREATE OR REPLACE FUNCTION enable_rls_for_table(table_name TEXT) RETURNS VOID AS $$
BEGIN
    -- Activer RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    
    -- Politique par défaut: DENY ALL
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    
    -- Politique SELECT: voir uniquement son tenant
    EXECUTE format('
        CREATE POLICY %I_tenant_isolation_select ON %I
        FOR SELECT
        USING (tenant_id = current_tenant_id())
    ', table_name, table_name);
    
    -- Politique INSERT: insérer uniquement dans son tenant
    EXECUTE format('
        CREATE POLICY %I_tenant_isolation_insert ON %I
        FOR INSERT
        WITH CHECK (tenant_id = current_tenant_id())
    ', table_name, table_name);
    
    -- Politique UPDATE: modifier uniquement son tenant
    EXECUTE format('
        CREATE POLICY %I_tenant_isolation_update ON %I
        FOR UPDATE
        USING (tenant_id = current_tenant_id())
    ', table_name, table_name);
    
    -- Politique DELETE: supprimer uniquement son tenant
    EXECUTE format('
        CREATE POLICY %I_tenant_isolation_delete ON %I
        FOR DELETE
        USING (tenant_id = current_tenant_id())
    ', table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Liste des tables à protéger avec RLS
-- Ces commandes seront exécutées après la création des tables par Alembic
-- DO $$
-- BEGIN
--     PERFORM enable_rls_for_table('users');
--     PERFORM enable_rls_for_table('sessions');
--     PERFORM enable_rls_for_table('bookings');
--     PERFORM enable_rls_for_table('credit_accounts');
--     PERFORM enable_rls_for_table('credit_transactions');
--     PERFORM enable_rls_for_table('waitlist_entries');
-- END $$;

-- Créer un utilisateur de base pour les tests (optionnel)
-- INSERT INTO tenants (id, name, slug, is_active) 
-- VALUES (
--     'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
--     'Club de Test',
--     'test-club',
--     TRUE
-- ) ON CONFLICT DO NOTHING;
