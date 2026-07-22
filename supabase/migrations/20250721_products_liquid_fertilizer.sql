-- =============================================================================
-- Greenkeeper – Produktform und Flüssigdünger-Felder für public.products
-- Sicher erneut ausführbar. Keine DROP/DELETE-Operationen.
-- =============================================================================

begin;

alter table public.products add column if not exists product_form text;
alter table public.products add column if not exists density_kg_per_l numeric;
alter table public.products add column if not exists nutrient_basis text;
alter table public.products add column if not exists liquid_rate_min numeric;
alter table public.products add column if not exists liquid_rate_max numeric;
alter table public.products add column if not exists dilution_min numeric;
alter table public.products add column if not exists dilution_max numeric;
alter table public.products add column if not exists water_rate_min numeric;
alter table public.products add column if not exists water_rate_max numeric;
alter table public.products add column if not exists application_method text;

comment on column public.products.product_form is 'Produktform: granular, liquid, soluble_powder, other.';
comment on column public.products.density_kg_per_l is 'Flüssigdünger: Dichte in kg/L.';
comment on column public.products.nutrient_basis is 'Flüssigdünger: mass_mass, mass_volume, grams_per_liter, unknown.';
comment on column public.products.liquid_rate_min is 'Flüssigdünger: empfohlene Produktmenge min in ml/m².';
comment on column public.products.liquid_rate_max is 'Flüssigdünger: empfohlene Produktmenge max in ml/m².';
comment on column public.products.dilution_min is 'Flüssigdünger: Verdünnung min in ml Produkt pro Liter Wasser.';
comment on column public.products.dilution_max is 'Flüssigdünger: Verdünnung max in ml Produkt pro Liter Wasser.';
comment on column public.products.water_rate_min is 'Flüssigdünger: Wassermenge min in L/m².';
comment on column public.products.water_rate_max is 'Flüssigdünger: Wassermenge max in L/m².';
comment on column public.products.application_method is 'Flüssigdünger: foliar, soil, both.';

-- Bekannter Granulat-Datensatz explizit markieren (ohne Flüssigfelder zu verändern)
update public.products
set product_form = 'granular'
where manufacturer = 'ICL'
  and official_name = 'Spring Start'
  and product_form is null;

commit;
