-- =============================================================================
-- Greenkeeper – Korrektur: enum-Wert legacy_imported vor 20250723 committen
-- =============================================================================
--
-- Hintergrund:
-- 20250723_product_governance_v2.sql fügt per ALTER TYPE ... ADD VALUE den
-- Wert 'legacy_imported' hinzu und nutzt ihn im selben BEGIN/COMMIT-Block.
-- PostgreSQL erlaubt neue Enum-Werte erst nach Commit (55P04:
-- "New enum values must be committed before they can be used").
--
-- Diese Migration fügt den Wert in einer eigenständigen Transaktion hinzu.
-- Idempotent: IF NOT EXISTS; auf Production bereits durch 20250723 vorhanden.
-- =============================================================================

alter type public.product_verification_status
  add value if not exists 'legacy_imported';
