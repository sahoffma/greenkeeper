-- =============================================================================
-- Greenkeeper – MVP PostgreSQL-Schema für Supabase
-- =============================================================================
--
-- Ausführung: Supabase Dashboard → SQL Editor → New query → Run
--
-- Tabellen: profiles, areas, activities, fertilization_details,
--           area_health_scores, daily_briefings, nutrient_budgets, products
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Erweiterungen
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.area_status as enum (
  'excellent',
  'good',
  'observe',
  'critical'
);

create type public.activity_type as enum (
  'fertilization',
  'mowing',
  'watering',
  'aerating',
  'overseeding',
  'application',
  'other'
);

create type public.health_score_source as enum (
  'manual',
  'calculated'
);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create or replace function public.validate_activity_area_user()
returns trigger
language plpgsql
as $$
declare
  area_owner uuid;
begin
  select user_id into area_owner
  from public.areas
  where id = new.area_id;

  if area_owner is null then
    raise exception 'area % not found', new.area_id;
  end if;

  if new.user_id <> area_owner then
    raise exception 'activity.user_id must match areas.user_id';
  end if;

  return new;
end;
$$;

create or replace function public.validate_fertilization_activity_type()
returns trigger
language plpgsql
as $$
declare
  actual_type public.activity_type;
begin
  select activity_type into actual_type
  from public.activities
  where id = new.activity_id;

  if actual_type is null then
    raise exception 'activity % not found', new.activity_id;
  end if;

  if actual_type <> 'fertilization' then
    raise exception 'fertilization_details require activity_type fertilization';
  end if;

  return new;
end;
$$;

create or replace function public.validate_measure_activity_type()
returns trigger
language plpgsql
as $$
declare
  actual_type public.activity_type;
begin
  select activity_type into actual_type
  from public.activities
  where id = new.activity_id;

  if actual_type is null then
    raise exception 'activity % not found', new.activity_id;
  end if;

  if actual_type = 'fertilization' then
    raise exception 'measure_details require activity_type other than fertilization';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  avatar_url    text,
  locale        text not null default 'de-DE',
  timezone      text not null default 'Europe/Berlin',
  role          text not null default 'user',
  reputation_score numeric(5, 2) not null default 100,
  is_blacklisted boolean not null default false,
  blacklisted_at timestamptz,
  blacklist_reason text,
  soft_deleted_at timestamptz,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

comment on table public.profiles is 'Benutzerprofil, verknüpft 1:1 mit auth.users.';

create table public.areas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  subtitle      text,
  size_sqm      numeric(10, 2) check (size_sqm is null or size_sqm > 0),
  status        public.area_status not null default 'observe',
  status_label  text not null default 'Entwicklung beobachten',
  summary       text,
  sort_order    integer not null default 0,
  archived_at   timestamptz,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

comment on table public.areas is 'Verwaltete Rasenflächen eines Benutzers.';

create index idx_areas_user_id on public.areas (user_id);
create index idx_areas_user_active on public.areas (user_id, sort_order)
  where archived_at is null;

create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  area_id       uuid not null references public.areas (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  activity_type public.activity_type not null default 'fertilization',
  title         text,
  notes         text,
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

comment on table public.activities is 'Timeline-Einträge für alle Rasenpflegemaßnahmen.';

create index idx_activities_area_occurred on public.activities (area_id, occurred_at desc);
create index idx_activities_user_occurred on public.activities (user_id, occurred_at desc);

create table public.fertilization_details (
  activity_id                 uuid primary key references public.activities (id) on delete cascade,
  product_name                text not null,
  product_brand               text,
  nitrogen_g_per_sqm          numeric(8, 4),
  phosphate_g_per_sqm         numeric(8, 4),
  potassium_g_per_sqm         numeric(8, 4),
  phosphorus_target_g_per_sqm numeric(8, 4),
  application_rate            text,
  amount_applied              numeric(10, 3),
  amount_unit                 text,
  created_at                  timestamptz not null default timezone('utc', now()),
  updated_at                  timestamptz not null default timezone('utc', now())
);

comment on table public.fertilization_details is 'Düngungsdetails zu einem Activity-Eintrag.';

create table public.measure_details (
  activity_id      uuid primary key references public.activities (id) on delete cascade,
  product_name       text,
  amount_applied     numeric(10, 3),
  amount_unit        text,
  mow_height_mm      numeric(8, 2),
  application_rate   text,
  created_at         timestamptz not null default timezone('utc', now()),
  updated_at         timestamptz not null default timezone('utc', now())
);

comment on table public.measure_details is 'Details für Maßnahmen außer Düngung.';

create table public.area_health_scores (
  id            uuid primary key default gen_random_uuid(),
  area_id       uuid not null references public.areas (id) on delete cascade,
  score         smallint not null check (score between 0 and 100),
  status_label  text not null,
  source        public.health_score_source not null default 'calculated',
  computed_at   timestamptz not null default timezone('utc', now()),
  created_at    timestamptz not null default timezone('utc', now())
);

comment on table public.area_health_scores is 'Flächenzustand (Score-Verlauf); neuester Eintrag für Dashboard.';

create index idx_area_health_scores_area_computed
  on public.area_health_scores (area_id, computed_at desc);

create table public.daily_briefings (
  id             uuid primary key default gen_random_uuid(),
  area_id        uuid not null references public.areas (id) on delete cascade,
  briefing_date  date not null,
  content        text not null,
  score_snapshot smallint check (score_snapshot is null or score_snapshot between 0 and 100),
  created_at     timestamptz not null default timezone('utc', now()),
  updated_at     timestamptz not null default timezone('utc', now()),
  unique (area_id, briefing_date)
);

comment on table public.daily_briefings is 'Tagesbriefing pro Fläche für das Dashboard.';

create index idx_daily_briefings_area_date
  on public.daily_briefings (area_id, briefing_date desc);

create table public.nutrient_budgets (
  id                          uuid primary key default gen_random_uuid(),
  area_id                     uuid not null references public.areas (id) on delete cascade,
  year                        integer not null check (year between 2000 and 2100),
  nitrogen_g_per_sqm          numeric(10, 4) not null default 0,
  phosphate_g_per_sqm         numeric(10, 4) not null default 0,
  potassium_g_per_sqm         numeric(10, 4) not null default 0,
  phosphorus_target_g_per_sqm numeric(10, 4) not null default 0,
  created_at                  timestamptz not null default timezone('utc', now()),
  updated_at                  timestamptz not null default timezone('utc', now()),
  unique (area_id, year)
);

comment on table public.nutrient_budgets is 'Nährstoffbilanz pro Fläche und Kalenderjahr.';

create index idx_nutrient_budgets_area_year
  on public.nutrient_budgets (area_id, year desc);

create table public.products (
  id                    uuid primary key default gen_random_uuid(),
  manufacturer          text not null,
  official_name         text not null,
  aliases               text[] not null default '{}',
  category              text,
  npk                   text,
  default_unit          text,
  product_form          text,
  product_type          text,
  n_percent             numeric,
  p2o5_percent          numeric,
  k2o_percent           numeric,
  mgo_percent           numeric,
  so3_percent           numeric,
  fe_percent            numeric,
  mn_percent            numeric,
  nitrogen_percent      numeric,
  phosphorus_percent    numeric,
  potassium_percent     numeric,
  magnesium_percent     numeric,
  iron_percent          numeric,
  manganese_percent     numeric,
  sulfur_percent        numeric,
  recommended_rate_min  numeric,
  recommended_rate_max  numeric,
  recommended_rate_unit text default 'g/m²',
  density_kg_per_l      numeric,
  nutrient_basis        text,
  liquid_rate_min       numeric,
  liquid_rate_max       numeric,
  dilution_min          numeric,
  dilution_max          numeric,
  water_rate_min        numeric,
  water_rate_max        numeric,
  application_method    text,
  longevity_weeks_min   integer,
  longevity_weeks_max   integer,
  release_type          text,
  season_months         integer[],
  description           text,
  manufacturer_url      text,
  datasheet_url         text,
  source_name           text,
  source_checked_at     timestamptz,
  verification_status   text not null default 'verified',
  verified_at           timestamptz,
  verified_by           uuid references public.profiles (id) on delete set null,
  last_reviewed_at      timestamptz,
  current_version       integer not null default 1,
  confidence_score      numeric,
  field_confidence      jsonb not null default '{}'::jsonb,
  sources               jsonb not null default '[]'::jsonb,
  primary_source_type   text,
  primary_source_url    text,
  has_open_change_request boolean not null default false,
  soft_deleted_at       timestamptz,
  created_at            timestamptz not null default timezone('utc', now())
);

comment on table public.products is 'Globale Produktbibliothek für KI-Produktnormalisierung.';

create unique index idx_products_manufacturer_official_name
  on public.products (manufacturer, official_name);

-- Governance-Tabellen (Produkt-Assistent Phase 1)
-- Siehe supabase/migrations/20250722_product_governance.sql für vollständige Definition.

-- ---------------------------------------------------------------------------
-- RLS-Hilfsfunktionen (nach Tabellen, vor Policies)
-- ---------------------------------------------------------------------------

create or replace function public.user_owns_area(p_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.areas a
    where a.id = p_area_id
      and a.user_id = (select auth.uid())
  );
$$;

create or replace function public.user_owns_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.activities act
    join public.areas a on a.id = act.area_id
    where act.id = p_activity_id
      and a.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_areas_updated_at
  before update on public.areas
  for each row execute function public.set_updated_at();

create trigger validate_activities_area_user
  before insert or update on public.activities
  for each row execute function public.validate_activity_area_user();

create trigger set_activities_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

create trigger validate_fertilization_details_type
  before insert or update on public.fertilization_details
  for each row execute function public.validate_fertilization_activity_type();

create trigger set_fertilization_details_updated_at
  before update on public.fertilization_details
  for each row execute function public.set_updated_at();

create trigger validate_measure_details_type
  before insert or update on public.measure_details
  for each row execute function public.validate_measure_activity_type();

create trigger set_measure_details_updated_at
  before update on public.measure_details
  for each row execute function public.set_updated_at();

create trigger set_daily_briefings_updated_at
  before update on public.daily_briefings
  for each row execute function public.set_updated_at();

create trigger set_nutrient_budgets_updated_at
  before update on public.nutrient_budgets
  for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.areas enable row level security;
alter table public.activities enable row level security;
alter table public.fertilization_details enable row level security;
alter table public.measure_details enable row level security;
alter table public.area_health_scores enable row level security;
alter table public.daily_briefings enable row level security;
alter table public.nutrient_budgets enable row level security;
alter table public.products enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "areas_select_own"
  on public.areas for select
  using ((select auth.uid()) = user_id);

create policy "areas_insert_own"
  on public.areas for insert
  with check ((select auth.uid()) = user_id);

create policy "areas_update_own"
  on public.areas for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "areas_delete_own"
  on public.areas for delete
  using ((select auth.uid()) = user_id);

create policy "activities_select_own"
  on public.activities for select
  using (public.user_owns_area(area_id));

create policy "activities_insert_own"
  on public.activities for insert
  with check (
    (select auth.uid()) = user_id
    and public.user_owns_area(area_id)
  );

create policy "activities_update_own"
  on public.activities for update
  using (public.user_owns_area(area_id))
  with check (
    (select auth.uid()) = user_id
    and public.user_owns_area(area_id)
  );

create policy "activities_delete_own"
  on public.activities for delete
  using (public.user_owns_area(area_id));

create policy "fertilization_details_all_own"
  on public.fertilization_details for all
  using (public.user_owns_activity(activity_id))
  with check (public.user_owns_activity(activity_id));

create policy "measure_details_all_own"
  on public.measure_details for all
  using (public.user_owns_activity(activity_id))
  with check (public.user_owns_activity(activity_id));

create policy "area_health_scores_all_own"
  on public.area_health_scores for all
  using (public.user_owns_area(area_id))
  with check (public.user_owns_area(area_id));

create policy "daily_briefings_all_own"
  on public.daily_briefings for all
  using (public.user_owns_area(area_id))
  with check (public.user_owns_area(area_id));

create policy "nutrient_budgets_all_own"
  on public.nutrient_budgets for all
  using (public.user_owns_area(area_id))
  with check (public.user_owns_area(area_id));

create policy "products_select_authenticated"
  on public.products for select
  to authenticated
  using (
    soft_deleted_at is null
    and verification_status <> 'archived'
  );

-- Governance-Tabellen: product_submissions, product_change_requests,
-- product_versions, product_review_events – siehe Migration 20250722.

-- ---------------------------------------------------------------------------
-- Seed: Beispielprodukte
-- ---------------------------------------------------------------------------

insert into public.products (manufacturer, official_name, aliases, category, npk, default_unit)
values
  (
    'ICL',
    'Spring Start',
    array['Spring Star', 'Springstar', 'Spring Start'],
    'fertilization',
    null,
    'g/m²'
  ),
  (
    'ICL',
    'Sierraform GT Antistress',
    '{}',
    'fertilization',
    null,
    'g/m²'
  ),
  (
    'ICL',
    'Landscaper Pro Stress Control',
    '{}',
    'fertilization',
    null,
    'g/m²'
  ),
  (
    'Rasendoktor',
    'Testprodukt',
    '{}',
    'fertilization',
    null,
    'g/m²'
  );

commit;
