-- =============================================================================
-- Greenkeeper – Produkt-Governance V2
-- Erweiterung auf Phase 1 (20250722). Sicher erneut ausführbar.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Enum-Erweiterungen
-- ---------------------------------------------------------------------------

alter type public.product_verification_status add value if not exists 'legacy_imported';

do $$ begin
  create type public.product_submission_channel as enum (
    'user_manual',
    'ai_import',
    'pdf_import',
    'photo_import',
    'manufacturer_import',
    'admin_seed',
    'legacy_backfill',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_source_kind as enum (
    'manufacturer_website',
    'manufacturer_pdf',
    'product_label',
    'user_photo',
    'retailer_page',
    'ai_research',
    'internal_note',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_domain_event_name as enum (
    'product.submission_created',
    'product.submission_approved',
    'product.submission_rejected',
    'product.change_requested',
    'product.change_approved',
    'product.change_rejected',
    'product.published',
    'product.updated',
    'product.archived',
    'product.legacy_marked',
    'product.source_snapshot_created'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- products – getrennte Vertrauenswerte & Legacy
-- ---------------------------------------------------------------------------

alter table public.products add column if not exists ai_confidence_score numeric(5, 2);
alter table public.products add column if not exists review_confidence_score numeric(5, 2);
alter table public.products add column if not exists ai_field_confidence jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists review_field_confidence jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists legacy_imported_at timestamptz;
alter table public.products add column if not exists legacy_import_note text;

comment on column public.products.ai_confidence_score is 'KI-Sicherheit 0–100 (intern).';
comment on column public.products.review_confidence_score is 'Review-Sicherheit 0–100 (intern).';
comment on column public.products.legacy_imported_at is 'Zeitpunkt der technischen Übernahme ohne Review.';

-- Legacy-Strategie: bestehende Produkte ohne menschliche Freigabe kennzeichnen
update public.products
set
  verification_status = 'legacy_imported',
  legacy_imported_at = coalesce(legacy_imported_at, created_at, timezone('utc', now())),
  legacy_import_note = coalesce(
    legacy_import_note,
    'Technisch übernommen vor Einführung des Review-Workflows. Review ausstehend.'
  )
where verified_by is null
  and verification_status in ('verified', 'draft', 'incomplete')
  and soft_deleted_at is null;

-- confidence_score / field_confidence → Review-Spiegelung (keine Daten löschen)
update public.products
set
  review_confidence_score = coalesce(review_confidence_score, confidence_score),
  review_field_confidence = case
    when review_field_confidence = '{}'::jsonb and field_confidence <> '{}'::jsonb
      then field_confidence
    else review_field_confidence
  end
where soft_deleted_at is null;

-- ---------------------------------------------------------------------------
-- product_source_snapshots – unveränderliche Quellenmomentaufnahmen
-- ---------------------------------------------------------------------------

create table if not exists public.product_source_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  source_type         public.product_source_type not null,
  source_kind         public.product_source_kind not null default 'other',
  source_name         text not null,
  source_url          text,
  storage_bucket      text,
  storage_path        text,
  content_hash        text not null,
  mime_type           text,
  file_size_bytes     bigint check (file_size_bytes is null or file_size_bytes >= 0),
  extracted_text      text,
  ai_extraction       jsonb not null default '{}'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,
  captured_at         timestamptz not null,
  created_by          uuid references public.profiles (id) on delete set null,
  submission_id       uuid references public.product_submissions (id) on delete set null,
  change_request_id   uuid references public.product_change_requests (id) on delete set null,
  product_id          uuid references public.products (id) on delete set null,
  created_at          timestamptz not null default timezone('utc', now())
);

comment on table public.product_source_snapshots is 'Unveränderliche Quellen-Snapshots; Dateien liegen in Supabase Storage.';
comment on column public.product_source_snapshots.storage_bucket is 'Storage-Bucket für PDF/Foto-Dateien.';
comment on column public.product_source_snapshots.storage_path is 'Pfad innerhalb des Buckets – kein öffentlicher Direktzugriff.';
comment on column public.product_source_snapshots.content_hash is 'SHA-256 über Datei- oder Textinhalt.';

create index if not exists idx_product_source_snapshots_submission
  on public.product_source_snapshots (submission_id, captured_at desc)
  where submission_id is not null;

create index if not exists idx_product_source_snapshots_change_request
  on public.product_source_snapshots (change_request_id, captured_at desc)
  where change_request_id is not null;

create index if not exists idx_product_source_snapshots_product
  on public.product_source_snapshots (product_id, captured_at desc)
  where product_id is not null;

create index if not exists idx_product_source_snapshots_hash
  on public.product_source_snapshots (content_hash);

-- ---------------------------------------------------------------------------
-- product_versions – erweiterte Nachverfolgbarkeit
-- ---------------------------------------------------------------------------

alter table public.product_versions add column if not exists approved_by uuid references public.profiles (id) on delete set null;
alter table public.product_versions add column if not exists source_snapshot_ids uuid[] not null default '{}';
alter table public.product_versions add column if not exists field_changes jsonb not null default '[]'::jsonb;
alter table public.product_versions add column if not exists ai_confidence_score numeric(5, 2);
alter table public.product_versions add column if not exists review_confidence_score numeric(5, 2);
alter table public.product_versions add column if not exists ai_field_confidence jsonb not null default '{}'::jsonb;
alter table public.product_versions add column if not exists review_field_confidence jsonb not null default '{}'::jsonb;

comment on column public.product_versions.field_changes is 'Strukturierte Feldänderungen gegenüber Vorgängerversion.';
comment on column public.product_versions.approved_by is 'Reviewer/Admin, der die Version freigegeben hat.';

-- ---------------------------------------------------------------------------
-- Submissions & Change Requests – Priorität, Kanal, KI/Review-Vertrauen
-- ---------------------------------------------------------------------------

alter table public.product_submissions add column if not exists submission_channel public.product_submission_channel not null default 'user_manual';
alter table public.product_submissions add column if not exists review_priority integer not null default 50 check (review_priority between 0 and 100);
alter table public.product_submissions add column if not exists corroboration_count integer not null default 0 check (corroboration_count >= 0);
alter table public.product_submissions add column if not exists source_snapshot_ids uuid[] not null default '{}';
alter table public.product_submissions add column if not exists ai_confidence_score numeric(5, 2);
alter table public.product_submissions add column if not exists review_confidence_score numeric(5, 2);
alter table public.product_submissions add column if not exists ai_field_confidence jsonb not null default '{}'::jsonb;
alter table public.product_submissions add column if not exists review_field_confidence jsonb not null default '{}'::jsonb;

alter table public.product_change_requests add column if not exists submission_channel public.product_submission_channel not null default 'user_manual';
alter table public.product_change_requests add column if not exists review_priority integer not null default 50 check (review_priority between 0 and 100);
alter table public.product_change_requests add column if not exists corroboration_count integer not null default 0 check (corroboration_count >= 0);
alter table public.product_change_requests add column if not exists source_snapshot_ids uuid[] not null default '{}';
alter table public.product_change_requests add column if not exists ai_confidence_score numeric(5, 2);
alter table public.product_change_requests add column if not exists review_confidence_score numeric(5, 2);
alter table public.product_change_requests add column if not exists ai_field_confidence jsonb not null default '{}'::jsonb;
alter table public.product_change_requests add column if not exists review_field_confidence jsonb not null default '{}'::jsonb;

create index if not exists idx_product_submissions_review_queue
  on public.product_submissions (review_priority desc, created_at asc)
  where status in ('pending', 'needs_information') and soft_deleted_at is null;

create index if not exists idx_product_change_requests_review_queue
  on public.product_change_requests (review_priority desc, created_at asc)
  where status in ('pending', 'needs_information') and soft_deleted_at is null;

-- ---------------------------------------------------------------------------
-- product_domain_events – Vorbereitung Event-Engine
-- ---------------------------------------------------------------------------

create table if not exists public.product_domain_events (
  id              uuid primary key default gen_random_uuid(),
  event_name      public.product_domain_event_name not null,
  aggregate_type  text not null check (aggregate_type in ('product', 'submission', 'change_request', 'version', 'source_snapshot')),
  aggregate_id    uuid not null,
  product_id      uuid references public.products (id) on delete set null,
  actor_id        uuid references public.profiles (id) on delete set null,
  payload         jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default timezone('utc', now()),
  dispatched_at   timestamptz,
  created_at      timestamptz not null default timezone('utc', now())
);

comment on table public.product_domain_events is 'Domain Events für künftige Event-Engine; dispatched_at = NULL bis versendet.';

create index if not exists idx_product_domain_events_pending
  on public.product_domain_events (occurred_at asc)
  where dispatched_at is null;

create index if not exists idx_product_domain_events_product
  on public.product_domain_events (product_id, occurred_at desc)
  where product_id is not null;

-- ---------------------------------------------------------------------------
-- Review-Warteschlange (View)
-- ---------------------------------------------------------------------------

create or replace view public.product_review_queue as
  select
    'submission'::text as queue_kind,
    ps.id as item_id,
    ps.submitted_by,
    ps.status::text as status,
    ps.review_priority,
    ps.corroboration_count,
    ps.submission_channel::text as submission_channel,
    ps.confidence_score,
    ps.ai_confidence_score,
    ps.created_at,
    ps.payload ->> 'manufacturer' as manufacturer,
    ps.payload ->> 'officialName' as official_name,
    null::uuid as product_id
  from public.product_submissions ps
  where ps.status in ('pending', 'needs_information')
    and ps.soft_deleted_at is null

  union all

  select
    'change_request'::text as queue_kind,
    pcr.id as item_id,
    pcr.submitted_by,
    pcr.status::text as status,
    pcr.review_priority,
    pcr.corroboration_count,
    pcr.submission_channel::text as submission_channel,
    pcr.confidence_score,
    pcr.ai_confidence_score,
    pcr.created_at,
    p.manufacturer,
    p.official_name,
    pcr.product_id
  from public.product_change_requests pcr
  join public.products p on p.id = pcr.product_id
  where pcr.status in ('pending', 'needs_information')
    and pcr.soft_deleted_at is null;

comment on view public.product_review_queue is 'Priorisierte Review-Warteschlange für Reviewer.';

-- ---------------------------------------------------------------------------
-- Immutability-Trigger für Source Snapshots & Domain Events
-- ---------------------------------------------------------------------------

drop trigger if exists product_source_snapshots_immutable on public.product_source_snapshots;
create trigger product_source_snapshots_immutable
  before update or delete on public.product_source_snapshots
  for each row execute function public.prevent_immutable_mutation();

drop trigger if exists product_domain_events_immutable on public.product_domain_events;
create trigger product_domain_events_immutable
  before update or delete on public.product_domain_events
  for each row execute function public.prevent_immutable_mutation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.product_source_snapshots enable row level security;
alter table public.product_domain_events enable row level security;

drop policy if exists "product_source_snapshots_select_reviewer" on public.product_source_snapshots;
create policy "product_source_snapshots_select_reviewer"
  on public.product_source_snapshots for select
  to authenticated
  using (public.user_is_reviewer_or_admin());

drop policy if exists "product_domain_events_select_reviewer" on public.product_domain_events;
create policy "product_domain_events_select_reviewer"
  on public.product_domain_events for select
  to authenticated
  using (public.user_is_reviewer_or_admin());

-- products: legacy_imported weiterhin lesbar
drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_authenticated"
  on public.products for select
  to authenticated
  using (
    soft_deleted_at is null
    and verification_status <> 'archived'::public.product_verification_status
  );

commit;
