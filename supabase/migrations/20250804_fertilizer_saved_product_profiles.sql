-- GA-014 Phase 5 — Immutable enrichment-saved fertilizer product versions (Product Profiles)

alter table public.product_profiles
  drop constraint if exists product_profiles_snapshot_draft_source;

alter table public.product_profiles
  drop constraint if exists product_profiles_draft_requires_user;

alter table public.product_profiles
  drop constraint if exists product_profiles_verified_requires_no_user;

alter table public.product_profiles
  drop constraint if exists product_profiles_draft_unverified;

alter table public.product_profiles
  drop constraint if exists product_profiles_verified_verified;

alter table public.product_profiles
  drop constraint if exists product_profiles_profile_status_check;

alter table public.product_profiles
  drop constraint if exists product_profiles_source_check;

alter table public.product_profiles
  add column if not exists access_kind text,
  add column if not exists session_access_hash text,
  add column if not exists product_family_key text,
  add column if not exists nutrient_matrix jsonb,
  add column if not exists composition_fingerprint_version text,
  add column if not exists composition_fingerprint text,
  add column if not exists provenance_json jsonb,
  add column if not exists save_idempotency_key text;

alter table public.product_profiles
  add constraint product_profiles_profile_status_check
    check (profile_status in ('draft', 'verified', 'saved'));

alter table public.product_profiles
  add constraint product_profiles_source_check
    check (source in ('packaging_photo', 'enrichment'));

alter table public.product_profiles
  add constraint product_profiles_snapshot_draft_source
    check (profile_status <> 'draft' or source = 'packaging_photo');

alter table public.product_profiles
  add constraint product_profiles_draft_requires_user
    check (profile_status <> 'draft' or user_id is not null);

alter table public.product_profiles
  add constraint product_profiles_verified_requires_no_user
    check (profile_status <> 'verified' or user_id is null);

alter table public.product_profiles
  add constraint product_profiles_draft_unverified
    check (profile_status <> 'draft' or verification_status = 'unverified');

alter table public.product_profiles
  add constraint product_profiles_verified_verified
    check (profile_status <> 'verified' or verification_status = 'verified');

alter table public.product_profiles
  add constraint product_profiles_access_kind_check
    check (access_kind is null or access_kind in ('authenticated_user', 'session'));

alter table public.product_profiles
  add constraint product_profiles_saved_requires_access
    check (
      profile_status <> 'saved'
      or (
        access_kind is not null
        and product_family_key is not null
        and nutrient_matrix is not null
        and composition_fingerprint_version is not null
        and composition_fingerprint is not null
        and save_idempotency_key is not null
        and provenance_json is not null
        and (
          (access_kind = 'authenticated_user' and user_id is not null and session_access_hash is null)
          or (access_kind = 'session' and user_id is null and session_access_hash is not null)
        )
      )
    );

alter table public.product_profiles
  add constraint product_profiles_saved_enrichment_source
    check (profile_status <> 'saved' or source = 'enrichment');

alter table public.product_profiles
  add constraint product_profiles_saved_verified
    check (profile_status <> 'saved' or verification_status = 'verified');

alter table public.product_profiles
  add constraint product_profiles_saved_session_hash_format_check
    check (
      profile_status <> 'saved'
      or access_kind <> 'session'
      or (
        length(session_access_hash) = 64
        and session_access_hash ~ '^[0-9a-f]{64}$'
      )
    );

create unique index if not exists product_profiles_saved_auth_version_idx
  on public.product_profiles (user_id, product_family_key, composition_fingerprint_version, composition_fingerprint)
  where profile_status = 'saved' and access_kind = 'authenticated_user';

create unique index if not exists product_profiles_saved_session_version_idx
  on public.product_profiles (session_access_hash, product_family_key, composition_fingerprint_version, composition_fingerprint)
  where profile_status = 'saved' and access_kind = 'session';

create unique index if not exists product_profiles_saved_auth_idempotency_idx
  on public.product_profiles (user_id, save_idempotency_key)
  where profile_status = 'saved' and access_kind = 'authenticated_user';

create unique index if not exists product_profiles_saved_session_idempotency_idx
  on public.product_profiles (session_access_hash, save_idempotency_key)
  where profile_status = 'saved' and access_kind = 'session';

create index if not exists product_profiles_saved_family_idx
  on public.product_profiles (product_family_key)
  where profile_status = 'saved';

comment on column public.product_profiles.session_access_hash is
  'Server-derived HMAC-SHA-256 hex (64 lowercase chars); never client input or raw session_id.';

comment on column public.product_profiles.composition_fingerprint is
  'Deterministic SHA-256 over canonical fertilizer version projection (DL-018 Phase 5).';

create or replace function public.prevent_saved_product_profile_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.profile_status = 'saved' then
    raise exception 'SAVED_PRODUCT_PROFILE_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_saved_product_profile_mutation on public.product_profiles;

create trigger prevent_saved_product_profile_mutation
  before update on public.product_profiles
  for each row
  execute function public.prevent_saved_product_profile_mutation();
