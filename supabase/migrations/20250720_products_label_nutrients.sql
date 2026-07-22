-- =============================================================================
-- Greenkeeper – Etikett-Deklarationen für public.products
-- Sicher erneut ausführbar. Kein automatischer Backfill aus Legacy-Spalten.
-- =============================================================================

begin;

alter table public.products add column if not exists n_percent numeric;
alter table public.products add column if not exists p2o5_percent numeric;
alter table public.products add column if not exists k2o_percent numeric;
alter table public.products add column if not exists mgo_percent numeric;
alter table public.products add column if not exists so3_percent numeric;
alter table public.products add column if not exists fe_percent numeric;
alter table public.products add column if not exists mn_percent numeric;

comment on column public.products.n_percent is 'Etikett-Deklaration: Stickstoff (N) in %.';
comment on column public.products.p2o5_percent is 'Etikett-Deklaration: Phosphor (P₂O₅) in %.';
comment on column public.products.k2o_percent is 'Etikett-Deklaration: Kalium (K₂O) in %.';
comment on column public.products.mgo_percent is 'Etikett-Deklaration: Magnesium (MgO) in %.';
comment on column public.products.so3_percent is 'Etikett-Deklaration: Schwefel (SO₃) in %.';
comment on column public.products.fe_percent is 'Etikett-Deklaration: Eisen (Fe) in %.';
comment on column public.products.mn_percent is 'Etikett-Deklaration: Mangan (Mn) in %.';

-- Explizit geprüfter Datensatz: ICL Spring Start (Sierraform GT)
update public.products
set
  n_percent    = 16,
  p2o5_percent = 0,
  k2o_percent  = 16,
  mgo_percent  = null,
  so3_percent  = null,
  fe_percent   = 1,
  mn_percent   = 0.3,
  npk          = '16-0-16'
where manufacturer = 'ICL'
  and official_name = 'Spring Start';

commit;
