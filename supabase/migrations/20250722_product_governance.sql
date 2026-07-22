-- =============================================================================
-- Greenkeeper – Produkt-Governance & Review-System (Phase 1)
-- Sicher erneut ausführbar. Keine DROP/DELETE-Operationen auf Bestandsdaten.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.product_verification_status as enum (
    'draft',
    'pending_review',
    'verified',
    'incomplete',
    'disputed',
    'archived'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_submission_status as enum (
    'pending',
    'needs_information',
    'approved',
    'rejected',
    'duplicate',
    'withdrawn'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_change_request_status as enum (
    'pending',
    'needs_information',
    'approved',
    'rejected',
    'withdrawn'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_source_type as enum (
    'manufacturer',
    'datasheet',
    'retailer',
    'user_submission',
    'ai_research',
    'internal',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_review_event_type as enum (
    'submission_created',
    'submission_updated',
    'submission_withdrawn',
    'submission_needs_information',
    'submission_approved',
    'submission_rejected',
    'submission_marked_duplicate',
    'change_request_created',
    'change_request_updated',
    'change_request_withdrawn',
    'change_request_needs_information',
    'change_request_approved',
    'change_request_rejected',
    'product_version_created',
    'product_published',
    'product_archived',
    'confidence_recalculated',
    'duplicate_detected',
    'rate_limit_triggered',
    'spam_flagged'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.app_user_role as enum (
    'user',
    'reviewer',
    'admin'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Profile-Erweiterung (Rollen, Reputation, Missbrauchsschutz)
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists role public.app_user_role not null default 'user';
alter table public.profiles add column if not exists reputation_score numeric(5, 2) not null default 100;
alter table public.profiles add column if not exists is_blacklisted boolean not null default false;
alter table public.profiles add column if not exists blacklisted_at timestamptz;
alter table public.profiles add column if not exists blacklist_reason text;
alter table public.profiles add column if not exists soft_deleted_at timestamptz;

comment on column public.profiles.role is 'App-Rolle: user, reviewer, admin.';
comment on column public.profiles.reputation_score is 'Reputation 0–100 für Missbrauchsschutz.';
comment on column public.profiles.is_blacklisted is 'Gesperrte Nutzer dürfen keine Vorschläge einreichen.';

-- ---------------------------------------------------------------------------
-- products erweitern
-- ---------------------------------------------------------------------------

alter table public.products add column if not exists verification_status public.product_verification_status not null default 'verified';
alter table public.products add column if not exists verified_at timestamptz;
alter table public.products add column if not exists verified_by uuid references public.profiles (id) on delete set null;
alter table public.products add column if not exists last_reviewed_at timestamptz;
alter table public.products add column if not exists current_version integer not null default 1;
alter table public.products add column if not exists confidence_score numeric(5, 2);
alter table public.products add column if not exists field_confidence jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists sources jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists primary_source_type public.product_source_type;
alter table public.products add column if not exists primary_source_url text;
alter table public.products add column if not exists has_open_change_request boolean not null default false;
alter table public.products add column if not exists soft_deleted_at timestamptz;

comment on column public.products.verification_status is 'Governance-Status des Produkts.';
comment on column public.products.field_confidence is 'Feldweise Vertrauenswerte 0–100 (JSON).';
comment on column public.products.sources is 'Quellenangaben als JSON-Array.';
comment on column public.products.has_open_change_request is 'True, solange ein offener Änderungsvorschlag existiert.';

create index if not exists idx_products_verification_status
  on public.products (verification_status)
  where soft_deleted_at is null;

create index if not exists idx_products_has_open_change_request
  on public.products (has_open_change_request)
  where has_open_change_request = true;

-- Bestehende Seed-Produkte als verifiziert markieren
update public.products
set
  verification_status = 'verified',
  current_version = coalesce(current_version, 1),
  verified_at = coalesce(verified_at, timezone('utc', now()))
where verification_status is distinct from 'archived'
  and soft_deleted_at is null;

-- ---------------------------------------------------------------------------
-- product_submissions – neue Produkte
-- ---------------------------------------------------------------------------

create table if not exists public.product_submissions (
  id                          uuid primary key default gen_random_uuid(),
  submitted_by                uuid not null references public.profiles (id) on delete restrict,
  status                      public.product_submission_status not null default 'pending',
  payload                     jsonb not null,
  field_confidence            jsonb not null default '{}'::jsonb,
  sources                     jsonb not null default '[]'::jsonb,
  confidence_score            numeric(5, 2),
  duplicate_of_product_id     uuid references public.products (id) on delete set null,
  duplicate_of_submission_id  uuid references public.product_submissions (id) on delete set null,
  review_notes                text,
  reviewed_by                 uuid references public.profiles (id) on delete set null,
  reviewed_at                 timestamptz,
  resulting_product_id        uuid references public.products (id) on delete set null,
  withdrawn_at                timestamptz,
  soft_deleted_at             timestamptz,
  created_at                  timestamptz not null default timezone('utc', now()),
  updated_at                  timestamptz not null default timezone('utc', now())
);

comment on table public.product_submissions is 'Neue Produktvorschläge – werden erst nach Review veröffentlicht.';

create index if not exists idx_product_submissions_submitted_by
  on public.product_submissions (submitted_by, created_at desc);

create index if not exists idx_product_submissions_status
  on public.product_submissions (status, created_at desc)
  where soft_deleted_at is null;

create index if not exists idx_product_submissions_pending
  on public.product_submissions (created_at desc)
  where status = 'pending' and soft_deleted_at is null;

-- ---------------------------------------------------------------------------
-- product_change_requests – Korrekturvorschläge
-- ---------------------------------------------------------------------------

create table if not exists public.product_change_requests (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references public.products (id) on delete restrict,
  submitted_by          uuid not null references public.profiles (id) on delete restrict,
  status                public.product_change_request_status not null default 'pending',
  proposed_changes      jsonb not null,
  change_summary        text not null,
  field_confidence      jsonb not null default '{}'::jsonb,
  sources               jsonb not null default '[]'::jsonb,
  confidence_score      numeric(5, 2),
  duplicate_of_request_id uuid references public.product_change_requests (id) on delete set null,
  review_notes          text,
  reviewed_by           uuid references public.profiles (id) on delete set null,
  reviewed_at           timestamptz,
  withdrawn_at          timestamptz,
  soft_deleted_at       timestamptz,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now())
);

comment on table public.product_change_requests is 'Änderungsvorschläge für bestehende Produkte.';

create index if not exists idx_product_change_requests_product
  on public.product_change_requests (product_id, created_at desc);

create index if not exists idx_product_change_requests_submitted_by
  on public.product_change_requests (submitted_by, created_at desc);

create index if not exists idx_product_change_requests_pending
  on public.product_change_requests (created_at desc)
  where status = 'pending' and soft_deleted_at is null;

-- ---------------------------------------------------------------------------
-- product_versions – unveränderliche Momentaufnahmen
-- ---------------------------------------------------------------------------

create table if not exists public.product_versions (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products (id) on delete restrict,
  version_number      integer not null check (version_number > 0),
  snapshot            jsonb not null,
  change_summary      text not null,
  field_confidence    jsonb not null default '{}'::jsonb,
  sources             jsonb not null default '[]'::jsonb,
  confidence_score    numeric(5, 2),
  created_by          uuid references public.profiles (id) on delete set null,
  submission_id       uuid references public.product_submissions (id) on delete set null,
  change_request_id   uuid references public.product_change_requests (id) on delete set null,
  created_at          timestamptz not null default timezone('utc', now()),
  unique (product_id, version_number)
);

comment on table public.product_versions is 'Unveränderliche Produktversionen nach jedem angenommenen Review.';

create index if not exists idx_product_versions_product
  on public.product_versions (product_id, version_number desc);

-- ---------------------------------------------------------------------------
-- product_review_events – Audit-Log
-- ---------------------------------------------------------------------------

create table if not exists public.product_review_events (
  id            uuid primary key default gen_random_uuid(),
  event_type    public.product_review_event_type not null,
  entity_type   text not null check (entity_type in ('submission', 'change_request', 'product', 'version', 'user')),
  entity_id     uuid not null,
  product_id    uuid references public.products (id) on delete set null,
  actor_id      uuid references public.profiles (id) on delete set null,
  payload       jsonb not null default '{}'::jsonb,
  notes         text,
  created_at    timestamptz not null default timezone('utc', now())
);

comment on table public.product_review_events is 'Unveränderliches Audit-Log aller Governance-Aktionen.';

create index if not exists idx_product_review_events_entity
  on public.product_review_events (entity_type, entity_id, created_at desc);

create index if not exists idx_product_review_events_product
  on public.product_review_events (product_id, created_at desc)
  where product_id is not null;

create index if not exists idx_product_review_events_actor
  on public.product_review_events (actor_id, created_at desc)
  where actor_id is not null;

-- ---------------------------------------------------------------------------
-- Missbrauchsschutz (Vorbereitung)
-- ---------------------------------------------------------------------------

create table if not exists public.product_submission_rate_limits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  window_start    timestamptz not null,
  submission_count integer not null default 0 check (submission_count >= 0),
  change_request_count integer not null default 0 check (change_request_count >= 0),
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now()),
  unique (user_id, window_start)
);

comment on table public.product_submission_rate_limits is 'Rate-Limit-Zähler pro Nutzer und Zeitfenster.';

create table if not exists public.product_spam_flags (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles (id) on delete set null,
  entity_type     text not null check (entity_type in ('submission', 'change_request')),
  entity_id       uuid not null,
  reason          text not null,
  score           numeric(5, 2),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default timezone('utc', now())
);

comment on table public.product_spam_flags is 'Spam-Verdachtsfälle zur manuellen oder automatischen Prüfung.';

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

create or replace function public.user_app_role()
returns public.app_user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = (select auth.uid())),
    'user'::public.app_user_role
  );
$$;

create or replace function public.user_is_reviewer_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_app_role() in ('reviewer'::public.app_user_role, 'admin'::public.app_user_role);
$$;

create or replace function public.user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_app_role() = 'admin'::public.app_user_role;
$$;

create or replace function public.user_can_submit_products()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_blacklisted = false
      and p.soft_deleted_at is null
  );
$$;

create or replace function public.prevent_immutable_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is immutable and cannot be modified or deleted', TG_TABLE_NAME;
end;
$$;

create or replace function public.set_product_submissions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_product_change_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_submission_rate_limits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

drop trigger if exists product_versions_immutable on public.product_versions;
create trigger product_versions_immutable
  before update or delete on public.product_versions
  for each row execute function public.prevent_immutable_mutation();

drop trigger if exists product_review_events_immutable on public.product_review_events;
create trigger product_review_events_immutable
  before update or delete on public.product_review_events
  for each row execute function public.prevent_immutable_mutation();

drop trigger if exists set_product_submissions_updated_at on public.product_submissions;
create trigger set_product_submissions_updated_at
  before update on public.product_submissions
  for each row execute function public.set_product_submissions_updated_at();

drop trigger if exists set_product_change_requests_updated_at on public.product_change_requests;
create trigger set_product_change_requests_updated_at
  before update on public.product_change_requests
  for each row execute function public.set_product_change_requests_updated_at();

drop trigger if exists set_submission_rate_limits_updated_at on public.product_submission_rate_limits;
create trigger set_submission_rate_limits_updated_at
  before update on public.product_submission_rate_limits
  for each row execute function public.set_submission_rate_limits_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.product_submissions enable row level security;
alter table public.product_change_requests enable row level security;
alter table public.product_versions enable row level security;
alter table public.product_review_events enable row level security;
alter table public.product_submission_rate_limits enable row level security;
alter table public.product_spam_flags enable row level security;

-- products: nur SELECT für authentifizierte Nutzer (kein INSERT/UPDATE/DELETE)
drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_authenticated"
  on public.products for select
  to authenticated
  using (
    soft_deleted_at is null
    and verification_status <> 'archived'::public.product_verification_status
  );

-- profiles: Rolle darf nicht vom Nutzer selbst geändert werden
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
    and is_blacklisted = (select p.is_blacklisted from public.profiles p where p.id = (select auth.uid()))
    and reputation_score = (select p.reputation_score from public.profiles p where p.id = (select auth.uid()))
  );

-- product_submissions
drop policy if exists "product_submissions_insert_own" on public.product_submissions;
create policy "product_submissions_insert_own"
  on public.product_submissions for insert
  to authenticated
  with check (
    submitted_by = (select auth.uid())
    and public.user_can_submit_products()
  );

drop policy if exists "product_submissions_select_own_or_reviewer" on public.product_submissions;
create policy "product_submissions_select_own_or_reviewer"
  on public.product_submissions for select
  to authenticated
  using (
    soft_deleted_at is null
    and (
      submitted_by = (select auth.uid())
      or public.user_is_reviewer_or_admin()
    )
  );

drop policy if exists "product_submissions_withdraw_own" on public.product_submissions;
create policy "product_submissions_withdraw_own"
  on public.product_submissions for update
  to authenticated
  using (
    submitted_by = (select auth.uid())
    and status in ('pending'::public.product_submission_status, 'needs_information'::public.product_submission_status)
    and soft_deleted_at is null
  )
  with check (
    submitted_by = (select auth.uid())
    and status = 'withdrawn'::public.product_submission_status
    and review_notes is not distinct from (select ps.review_notes from public.product_submissions ps where ps.id = id)
    and reviewed_by is not distinct from (select ps.reviewed_by from public.product_submissions ps where ps.id = id)
    and reviewed_at is not distinct from (select ps.reviewed_at from public.product_submissions ps where ps.id = id)
    and duplicate_of_product_id is not distinct from (select ps.duplicate_of_product_id from public.product_submissions ps where ps.id = id)
    and duplicate_of_submission_id is not distinct from (select ps.duplicate_of_submission_id from public.product_submissions ps where ps.id = id)
    and resulting_product_id is not distinct from (select ps.resulting_product_id from public.product_submissions ps where ps.id = id)
  );

-- product_change_requests
drop policy if exists "product_change_requests_insert_own" on public.product_change_requests;
create policy "product_change_requests_insert_own"
  on public.product_change_requests for insert
  to authenticated
  with check (
    submitted_by = (select auth.uid())
    and public.user_can_submit_products()
  );

drop policy if exists "product_change_requests_select_own_or_reviewer" on public.product_change_requests;
create policy "product_change_requests_select_own_or_reviewer"
  on public.product_change_requests for select
  to authenticated
  using (
    soft_deleted_at is null
    and (
      submitted_by = (select auth.uid())
      or public.user_is_reviewer_or_admin()
    )
  );

drop policy if exists "product_change_requests_withdraw_own" on public.product_change_requests;
create policy "product_change_requests_withdraw_own"
  on public.product_change_requests for update
  to authenticated
  using (
    submitted_by = (select auth.uid())
    and status in ('pending'::public.product_change_request_status, 'needs_information'::public.product_change_request_status)
    and soft_deleted_at is null
  )
  with check (
    submitted_by = (select auth.uid())
    and status = 'withdrawn'::public.product_change_request_status
    and review_notes is not distinct from (select pcr.review_notes from public.product_change_requests pcr where pcr.id = id)
    and reviewed_by is not distinct from (select pcr.reviewed_by from public.product_change_requests pcr where pcr.id = id)
    and reviewed_at is not distinct from (select pcr.reviewed_at from public.product_change_requests pcr where pcr.id = id)
    and duplicate_of_request_id is not distinct from (select pcr.duplicate_of_request_id from public.product_change_requests pcr where pcr.id = id)
  );

-- product_versions: lesen für alle authentifizierten Nutzer
drop policy if exists "product_versions_select_authenticated" on public.product_versions;
create policy "product_versions_select_authenticated"
  on public.product_versions for select
  to authenticated
  using (true);

-- product_review_events: nur Reviewer/Admin
drop policy if exists "product_review_events_select_reviewer" on public.product_review_events;
create policy "product_review_events_select_reviewer"
  on public.product_review_events for select
  to authenticated
  using (public.user_is_reviewer_or_admin());

-- rate limits & spam flags: nur Reviewer/Admin lesen
drop policy if exists "product_submission_rate_limits_select_reviewer" on public.product_submission_rate_limits;
create policy "product_submission_rate_limits_select_reviewer"
  on public.product_submission_rate_limits for select
  to authenticated
  using (public.user_is_reviewer_or_admin());

drop policy if exists "product_spam_flags_select_reviewer" on public.product_spam_flags;
create policy "product_spam_flags_select_reviewer"
  on public.product_spam_flags for select
  to authenticated
  using (public.user_is_reviewer_or_admin());

commit;
