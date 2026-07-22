-- =============================================================================
-- Greenkeeper – Erweiterung public.products für Düngeberechnungen
-- Sicher erneut ausführbar (ADD COLUMN IF NOT EXISTS)
-- =============================================================================

begin;

alter table public.products add column if not exists product_type text;
alter table public.products add column if not exists nitrogen_percent numeric;
alter table public.products add column if not exists phosphorus_percent numeric;
alter table public.products add column if not exists potassium_percent numeric;
alter table public.products add column if not exists magnesium_percent numeric;
alter table public.products add column if not exists iron_percent numeric;
alter table public.products add column if not exists sulfur_percent numeric;
alter table public.products add column if not exists recommended_rate_min numeric;
alter table public.products add column if not exists recommended_rate_max numeric;
alter table public.products add column if not exists recommended_rate_unit text default 'g/m²';
alter table public.products add column if not exists longevity_weeks_min integer;
alter table public.products add column if not exists longevity_weeks_max integer;
alter table public.products add column if not exists release_type text;
alter table public.products add column if not exists season_months integer[];
alter table public.products add column if not exists description text;
alter table public.products add column if not exists manufacturer_url text;
alter table public.products add column if not exists datasheet_url text;
alter table public.products add column if not exists source_name text;
alter table public.products add column if not exists source_checked_at timestamptz;

comment on column public.products.product_type is 'Produkttyp, z. B. spring, summer, autumn, stress, starter, general.';
comment on column public.products.recommended_rate_unit is 'Einheit für recommended_rate_min/max; Standard g/m².';
comment on column public.products.release_type is 'Freisetzungstyp, z. B. quick, slow, mixed.';
comment on column public.products.season_months is 'Empfohlene Monate (1–12), z. B. {3,4,5} für März–Mai.';

commit;
