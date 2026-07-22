-- =============================================================================
-- Greenkeeper – Mangan (Mn) für public.products
-- Sicher erneut ausführbar (ADD COLUMN IF NOT EXISTS)
-- =============================================================================

begin;

alter table public.products add column if not exists manganese_percent numeric;

comment on column public.products.manganese_percent is 'Mangangehalt in Prozent (Mn).';

commit;
