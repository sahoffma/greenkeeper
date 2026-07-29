-- GA-014 Phase 4b — Persistent fertilizer enrichment jobs (schema only)

-- ---------------------------------------------------------------------------
-- Fertilizer enrichment jobs (server-only persistence)
-- ---------------------------------------------------------------------------

create table public.fertilizer_enrichment_jobs (
  job_id text primary key,
  orchestration_run_id text not null,
  idempotency_key text not null,
  access_kind text not null,
  user_id uuid references auth.users (id) on delete cascade,
  session_access_hash text,
  object_category text not null,
  identity_fingerprint text not null,
  job_json jsonb not null,
  orchestration_input_json jsonb not null,
  last_source_provision_idempotency_key text,
  record_schema_version smallint not null default 1,
  revision integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  constraint fertilizer_enrichment_jobs_access_kind_check
    check (access_kind in ('authenticated_user', 'session')),
  constraint fertilizer_enrichment_jobs_access_context_check
    check (
      (access_kind = 'authenticated_user' and user_id is not null and session_access_hash is null)
      or (access_kind = 'session' and user_id is null and session_access_hash is not null)
    ),
  constraint fertilizer_enrichment_jobs_session_hash_format_check
    check (
      access_kind <> 'session'
      or (
        length(session_access_hash) = 64
        and session_access_hash ~ '^[0-9a-f]{64}$'
      )
    ),
  constraint fertilizer_enrichment_jobs_idempotency_key_nonempty_check
    check (idempotency_key <> ''),
  constraint fertilizer_enrichment_jobs_object_category_check
    check (object_category = 'fertilizer'),
  constraint fertilizer_enrichment_jobs_job_json_object_check
    check (jsonb_typeof(job_json) = 'object'),
  constraint fertilizer_enrichment_jobs_orchestration_input_json_object_check
    check (jsonb_typeof(orchestration_input_json) = 'object'),
  constraint fertilizer_enrichment_jobs_job_json_has_result_check
    check (job_json ? 'result'),
  constraint fertilizer_enrichment_jobs_record_schema_version_check
    check (record_schema_version >= 1),
  constraint fertilizer_enrichment_jobs_revision_check
    check (revision >= 1),
  constraint fertilizer_enrichment_jobs_expires_after_created_check
    check (expires_at > created_at),
  constraint fertilizer_enrichment_jobs_last_source_provision_key_nonempty_check
    check (
      last_source_provision_idempotency_key is null
      or last_source_provision_idempotency_key <> ''
    )
);

comment on table public.fertilizer_enrichment_jobs is
  'Server-only persistence for fertilizer enrichment jobs (GA-014 Phase 4).';

comment on column public.fertilizer_enrichment_jobs.job_json is
  'Sanitized public job snapshot; job_json.result is the canonical fachlicher Zustand.';

comment on column public.fertilizer_enrichment_jobs.orchestration_input_json is
  'Sanitized internal continuation input without session tokens or access hashes.';

comment on column public.fertilizer_enrichment_jobs.session_access_hash is
  'Server-derived HMAC-SHA-256 hex (64 lowercase chars); never client input or raw session_id.';

comment on column public.fertilizer_enrichment_jobs.revision is
  'Optimistic locking counter; repository updates with WHERE revision = expected and revision + 1.';

comment on column public.fertilizer_enrichment_jobs.record_schema_version is
  'Technical persistence/mapping version for the row format (not orchestration status).';

create unique index fertilizer_enrichment_jobs_auth_idempotency_idx
  on public.fertilizer_enrichment_jobs (user_id, idempotency_key)
  where access_kind = 'authenticated_user';

create unique index fertilizer_enrichment_jobs_session_idempotency_idx
  on public.fertilizer_enrichment_jobs (session_access_hash, idempotency_key)
  where access_kind = 'session';

create index fertilizer_enrichment_jobs_expires_at_idx
  on public.fertilizer_enrichment_jobs (expires_at);

create index fertilizer_enrichment_jobs_orchestration_run_id_idx
  on public.fertilizer_enrichment_jobs (orchestration_run_id);

create trigger fertilizer_enrichment_jobs_set_updated_at
  before update on public.fertilizer_enrichment_jobs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (deny-by-default; server-only via service role)
-- ---------------------------------------------------------------------------

alter table public.fertilizer_enrichment_jobs enable row level security;

revoke all on table public.fertilizer_enrichment_jobs from anon;
revoke all on table public.fertilizer_enrichment_jobs from authenticated;
