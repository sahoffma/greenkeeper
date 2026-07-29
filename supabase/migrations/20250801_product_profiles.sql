-- GA-013 Stufe 1 — Product Profile: persönliche Drafts + globale verifizierte Profile

-- ---------------------------------------------------------------------------
-- Product Profiles
-- ---------------------------------------------------------------------------

create table public.product_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  identity_fingerprint text not null,
  brand text,
  manufacturer text,
  product_line text,
  official_name text,
  variant text,
  product_form text check (product_form is null or product_form in ('granular', 'liquid')),
  nitrogen numeric,
  phosphate numeric,
  potash numeric,
  npk_declaration text,
  source text not null,
  profile_status text not null
    check (profile_status in ('draft', 'verified')),
  verification_status text not null
    check (verification_status in ('unverified', 'verified')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_profiles_draft_requires_user
    check (profile_status <> 'draft' or user_id is not null),
  constraint product_profiles_verified_requires_no_user
    check (profile_status <> 'verified' or user_id is null),
  constraint product_profiles_draft_unverified
    check (profile_status <> 'draft' or verification_status = 'unverified'),
  constraint product_profiles_verified_verified
    check (profile_status <> 'verified' or verification_status = 'verified'),
  constraint product_profiles_snapshot_draft_source
    check (profile_status <> 'draft' or source = 'packaging_photo')
);

create unique index product_profiles_verified_fingerprint_idx
  on public.product_profiles (identity_fingerprint)
  where profile_status = 'verified';

create unique index product_profiles_draft_user_fingerprint_idx
  on public.product_profiles (user_id, identity_fingerprint)
  where profile_status = 'draft';

create index product_profiles_fingerprint_idx on public.product_profiles (identity_fingerprint);
create index product_profiles_user_idx on public.product_profiles (user_id);

create trigger product_profiles_set_updated_at
  before update on public.product_profiles
  for each row
  execute function public.set_updated_at();

-- Katalogprodukte → optionales verifiziertes Product Profile (keine Auto-Migration)
alter table public.products
  add column if not exists product_profile_id uuid references public.product_profiles (id) on delete restrict;

create index if not exists products_product_profile_idx
  on public.products (product_profile_id);

alter table public.fertilizer_recognition_candidates
  add column product_profile_id uuid references public.product_profiles (id) on delete restrict;

create index fertilizer_recognition_candidates_profile_idx
  on public.fertilizer_recognition_candidates (product_profile_id);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

create or replace function public.is_global_verified_product_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.product_profiles pp
    where pp.id = p_profile_id
      and pp.profile_status = 'verified'
      and pp.verification_status = 'verified'
      and pp.user_id is null
  );
$$;

create or replace function public.build_product_profile_fingerprint_from_snapshot(p_snapshot jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_brand text;
  v_product_line text;
  v_official_name text;
  v_variant text;
  v_npk_declaration text;
  v_nitrogen numeric;
  v_phosphate numeric;
  v_potash numeric;
begin
  v_brand := nullif(trim(p_snapshot #>> '{brand,normalizedValue}'), '');
  v_product_line := nullif(trim(p_snapshot #>> '{productLine,normalizedValue}'), '');
  v_official_name := coalesce(
    nullif(trim(p_snapshot #>> '{productName,normalizedValue}'), ''),
    nullif(trim(p_snapshot #>> '{variant,normalizedValue}'), '')
  );
  v_variant := nullif(trim(p_snapshot #>> '{variant,normalizedValue}'), '');
  v_npk_declaration := nullif(trim(p_snapshot #>> '{npk,rawLabel}'), '');

  v_nitrogen := nullif(p_snapshot #>> '{npk,nitrogen}', '')::numeric;
  v_phosphate := nullif(p_snapshot #>> '{npk,phosphate}', '')::numeric;
  v_potash := nullif(p_snapshot #>> '{npk,potash}', '')::numeric;

  if v_npk_declaration is null
    and v_nitrogen is not null
    and v_phosphate is not null
    and v_potash is not null then
    v_npk_declaration := v_nitrogen::text || '-' || v_phosphate::text || '-' || v_potash::text;
  end if;

  return public.build_fertilizer_identity_fingerprint(
    v_brand,
    v_product_line,
    v_official_name,
    v_variant,
    v_npk_declaration
  );
end;
$$;

create or replace function public.user_can_link_product_profile(p_profile_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.product_profiles pp
    where pp.id = p_profile_id
      and (
        pp.profile_status = 'verified'
        or (pp.profile_status = 'draft' and pp.user_id = p_user_id)
      )
  );
$$;

create or replace function public.resolve_product_profile_for_catalog(p_catalog_product_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.product_profile_id
  from public.products p
  where p.id = p_catalog_product_id
    and p.soft_deleted_at is null
    and p.product_profile_id is not null
    and public.is_global_verified_product_profile(p.product_profile_id);
$$;

create or replace function public.validate_products_product_profile_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_reactivation boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_is_reactivation := old.soft_deleted_at is not null and new.soft_deleted_at is null;

    if new.product_profile_id is not distinct from old.product_profile_id
      and not v_is_reactivation then
      return new;
    end if;
  end if;

  if new.product_profile_id is null then
    return new;
  end if;

  -- Soft-gelöschte Katalogprodukte dürfen ungültige Verknüpfungen behalten.
  if new.soft_deleted_at is not null then
    return new;
  end if;

  if not exists (
    select 1
    from public.product_profiles pp
    where pp.id = new.product_profile_id
  ) then
    raise exception 'PRODUCT_PROFILE_NOT_FOUND';
  end if;

  if not public.is_global_verified_product_profile(new.product_profile_id) then
    raise exception 'CATALOG_PRODUCT_PROFILE_MUST_BE_VERIFIED_GLOBAL';
  end if;

  return new;
end;
$$;

-- Blockiert Downgrade nur solange aktive (nicht soft-gelöschte) Katalogprodukte verknüpft sind.
create or replace function public.prevent_catalog_linked_product_profile_invalidation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.products p
    where p.product_profile_id = old.id
      and p.soft_deleted_at is null
  ) then
    if new.profile_status <> 'verified'
      or new.verification_status <> 'verified'
      or new.user_id is not null then
      raise exception 'CATALOG_LINKED_PRODUCT_PROFILE_MUST_REMAIN_VERIFIED_GLOBAL';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_products_product_profile_link on public.products;

create trigger validate_products_product_profile_link
  before insert or update on public.products
  for each row execute function public.validate_products_product_profile_link();

drop trigger if exists prevent_catalog_linked_product_profile_invalidation on public.product_profiles;

create trigger prevent_catalog_linked_product_profile_invalidation
  before update on public.product_profiles
  for each row execute function public.prevent_catalog_linked_product_profile_invalidation();

-- ---------------------------------------------------------------------------
-- Ensure: verifiziert → eigener Draft → atomar anlegen
-- ---------------------------------------------------------------------------

create or replace function public.ensure_product_profile_from_snapshot(p_snapshot jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_fingerprint text;
  v_brand text;
  v_product_line text;
  v_official_name text;
  v_variant text;
  v_npk_declaration text;
  v_nitrogen numeric;
  v_phosphate numeric;
  v_potash numeric;
  v_product_form text;
  v_manufacturer text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_snapshot is null or p_snapshot = 'null'::jsonb then
    raise exception 'SNAPSHOT_REQUIRED';
  end if;

  v_fingerprint := public.build_product_profile_fingerprint_from_snapshot(p_snapshot);

  if v_fingerprint is null then
    raise exception 'PROFILE_FINGERPRINT_REQUIRED';
  end if;

  select pp.id
  into v_profile_id
  from public.product_profiles pp
  where pp.identity_fingerprint = v_fingerprint
    and pp.profile_status = 'verified'
  limit 1;

  if found then
    return v_profile_id;
  end if;

  select pp.id
  into v_profile_id
  from public.product_profiles pp
  where pp.identity_fingerprint = v_fingerprint
    and pp.profile_status = 'draft'
    and pp.user_id = v_user_id
  limit 1;

  if found then
    return v_profile_id;
  end if;

  v_brand := nullif(trim(p_snapshot #>> '{brand,normalizedValue}'), '');
  v_product_line := nullif(trim(p_snapshot #>> '{productLine,normalizedValue}'), '');
  v_official_name := coalesce(
    nullif(trim(p_snapshot #>> '{productName,normalizedValue}'), ''),
    nullif(trim(p_snapshot #>> '{variant,normalizedValue}'), '')
  );
  v_variant := nullif(trim(p_snapshot #>> '{variant,normalizedValue}'), '');
  v_manufacturer := nullif(trim(p_snapshot #>> '{manufacturer,normalizedValue}'), '');
  v_npk_declaration := nullif(trim(p_snapshot #>> '{npk,rawLabel}'), '');

  v_nitrogen := nullif(p_snapshot #>> '{npk,nitrogen}', '')::numeric;
  v_phosphate := nullif(p_snapshot #>> '{npk,phosphate}', '')::numeric;
  v_potash := nullif(p_snapshot #>> '{npk,potash}', '')::numeric;

  if v_npk_declaration is null
    and v_nitrogen is not null
    and v_phosphate is not null
    and v_potash is not null then
    v_npk_declaration := v_nitrogen::text || '-' || v_phosphate::text || '-' || v_potash::text;
  end if;

  v_product_form := nullif(trim(p_snapshot #>> '{form,normalizedValue}'), '');
  if v_product_form is not null and v_product_form not in ('granular', 'liquid') then
    v_product_form := null;
  end if;

  insert into public.product_profiles (
    user_id,
    identity_fingerprint,
    brand,
    manufacturer,
    product_line,
    official_name,
    variant,
    product_form,
    nitrogen,
    phosphate,
    potash,
    npk_declaration,
    source,
    profile_status,
    verification_status
  )
  values (
    v_user_id,
    v_fingerprint,
    v_brand,
    v_manufacturer,
    v_product_line,
    v_official_name,
    v_variant,
    v_product_form,
    v_nitrogen,
    v_phosphate,
    v_potash,
    v_npk_declaration,
    'packaging_photo',
    'draft',
    'unverified'
  )
  on conflict (user_id, identity_fingerprint) where profile_status = 'draft'
  do nothing
  returning id into v_profile_id;

  if v_profile_id is not null then
    return v_profile_id;
  end if;

  select pp.id
  into v_profile_id
  from public.product_profiles pp
  where pp.identity_fingerprint = v_fingerprint
    and pp.profile_status = 'draft'
    and pp.user_id = v_user_id
  limit 1;

  if found then
    return v_profile_id;
  end if;

  select pp.id
  into v_profile_id
  from public.product_profiles pp
  where pp.identity_fingerprint = v_fingerprint
    and pp.profile_status = 'verified'
  limit 1;

  if found then
    return v_profile_id;
  end if;

  raise exception 'PROFILE_ENSURE_FAILED';
end;
$$;

-- ---------------------------------------------------------------------------
-- save_fertilizer_capture: Product Profile verknüpfen (serverseitig verbindlich)
-- ---------------------------------------------------------------------------

create or replace function public.save_fertilizer_capture(
  p_idempotency_key text,
  p_catalog_product_id uuid default null,
  p_candidate jsonb default null,
  p_purchase_quantity numeric default null,
  p_purchase_unit text default null,
  p_previous_remainder numeric default null,
  p_package_count integer default 1,
  p_product_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.fertilizer_capture_receipts%rowtype;
  v_candidate_id uuid;
  v_container_id uuid;
  v_profile_id uuid;
  v_balance numeric := 0;
  v_purchase numeric;
  v_unit text;
  v_label text;
  v_fingerprint text;
  v_remainder numeric;
  v_existing_profile_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_idempotency_key is null or trim(p_idempotency_key) = '' then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  select *
  into v_existing
  from public.fertilizer_capture_receipts fcr
  where fcr.user_id = v_user_id
    and fcr.idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'receipt_id', v_existing.id,
      'container_id', v_existing.container_id,
      'catalog_product_id', v_existing.catalog_product_id,
      'recognition_candidate_id', v_existing.recognition_candidate_id,
      'product_profile_id', case
        when v_existing.recognition_candidate_id is not null then (
          select frc.product_profile_id
          from public.fertilizer_recognition_candidates frc
          where frc.id = v_existing.recognition_candidate_id
        )
        when v_existing.catalog_product_id is not null then
          public.resolve_product_profile_for_catalog(v_existing.catalog_product_id)
        else null
      end,
      'product_label', v_existing.product_label,
      'purchase_quantity', v_existing.purchase_quantity,
      'purchase_unit', v_existing.purchase_unit,
      'previous_remainder', v_existing.previous_remainder,
      'resulting_balance', v_existing.resulting_balance,
      'idempotent_replay', true
    );
  end if;

  if p_purchase_quantity is null or p_purchase_quantity <= 0 or p_purchase_quantity > 100000 then
    raise exception 'INVALID_PURCHASE_QUANTITY';
  end if;

  if p_purchase_unit is null or trim(p_purchase_unit) = '' then
    raise exception 'INVALID_PURCHASE_UNIT';
  end if;

  v_purchase := p_purchase_quantity;
  v_unit := trim(p_purchase_unit);
  v_remainder := coalesce(p_previous_remainder, 0);

  if v_remainder < 0 or v_remainder > 100000 then
    raise exception 'INVALID_PREVIOUS_REMAINDER';
  end if;

  if p_catalog_product_id is null and (p_candidate is null or p_candidate = 'null'::jsonb) then
    raise exception 'PRODUCT_REFERENCE_REQUIRED';
  end if;

  if p_catalog_product_id is not null and p_candidate is not null and p_candidate <> 'null'::jsonb then
    raise exception 'CATALOG_AND_CANDIDATE_CONFLICT';
  end if;

  if p_catalog_product_id is not null then
    if not exists (
      select 1 from public.products p
      where p.id = p_catalog_product_id
        and p.soft_deleted_at is null
    ) then
      raise exception 'CATALOG_PRODUCT_NOT_FOUND';
    end if;

    v_profile_id := public.resolve_product_profile_for_catalog(p_catalog_product_id);

    select fc.id
    into v_container_id
    from public.fertilizer_containers fc
    where fc.user_id = v_user_id
      and fc.product_id = p_catalog_product_id
      and fc.archived_at is null
    order by fc.created_at asc
    limit 1;

    if v_container_id is null then
      insert into public.fertilizer_containers (user_id, product_id, label)
      values (v_user_id, p_catalog_product_id, coalesce(p_product_label, 'Dünger'))
      returning id into v_container_id;
    end if;

    v_label := coalesce(p_product_label, 'Dünger');
  else
    v_profile_id := public.ensure_product_profile_from_snapshot(p_candidate -> 'recognitionSnapshot');

    if not public.user_can_link_product_profile(v_profile_id, v_user_id) then
      raise exception 'PROFILE_LINK_FORBIDDEN';
    end if;

    v_fingerprint := public.build_fertilizer_identity_fingerprint(
      p_candidate ->> 'brand',
      p_candidate ->> 'productLine',
      p_candidate ->> 'productName',
      p_candidate ->> 'variant',
      p_candidate ->> 'npk'
    );

    if v_fingerprint is null then
      raise exception 'CANDIDATE_FINGERPRINT_REQUIRED';
    end if;

    select frc.id, frc.product_profile_id
    into v_candidate_id, v_existing_profile_id
    from public.fertilizer_recognition_candidates frc
    where frc.user_id = v_user_id
      and frc.identity_fingerprint = v_fingerprint;

    if v_candidate_id is null then
      insert into public.fertilizer_recognition_candidates (
        user_id,
        brand,
        product_line,
        product_name,
        variant,
        product_descriptor,
        manufacturer,
        npk,
        package_size_value,
        package_size_unit,
        product_form,
        identity_fingerprint,
        identity_confidence,
        data_completeness,
        identity_origin,
        recognition_snapshot,
        status,
        product_profile_id
      )
      values (
        v_user_id,
        p_candidate ->> 'brand',
        p_candidate ->> 'productLine',
        p_candidate ->> 'productName',
        p_candidate ->> 'variant',
        p_candidate ->> 'productDescriptor',
        p_candidate ->> 'manufacturer',
        p_candidate ->> 'npk',
        nullif(p_candidate ->> 'packageSizeValue', '')::numeric,
        p_candidate ->> 'packageSizeUnit',
        coalesce(p_candidate ->> 'productForm', 'unknown'),
        v_fingerprint,
        nullif(p_candidate ->> 'identityConfidence', '')::numeric,
        nullif(p_candidate ->> 'dataCompleteness', '')::numeric,
        p_candidate ->> 'identityOrigin',
        p_candidate -> 'recognitionSnapshot',
        coalesce(p_candidate ->> 'status', 'accepted'),
        v_profile_id
      )
      returning id into v_candidate_id;
    else
      if v_existing_profile_id is null then
        update public.fertilizer_recognition_candidates
        set product_profile_id = v_profile_id
        where id = v_candidate_id
          and product_profile_id is null
          and public.user_can_link_product_profile(v_profile_id, v_user_id);
      end if;
    end if;

    select fc.id
    into v_container_id
    from public.fertilizer_containers fc
    where fc.user_id = v_user_id
      and fc.recognition_candidate_id = v_candidate_id
      and fc.archived_at is null
    order by fc.created_at asc
    limit 1;

    if v_container_id is null then
      insert into public.fertilizer_containers (
        user_id,
        recognition_candidate_id,
        package_size_value,
        package_size_unit,
        label
      )
      values (
        v_user_id,
        v_candidate_id,
        nullif(p_candidate ->> 'packageSizeValue', '')::numeric,
        p_candidate ->> 'packageSizeUnit',
        coalesce(p_product_label, 'Persönlicher Dünger')
      )
      returning id into v_container_id;
    end if;

    v_label := coalesce(p_product_label, 'Persönlicher Dünger');
  end if;

  if v_remainder > 0 then
    insert into public.fertilizer_stock_movements (
      user_id,
      container_id,
      movement_type,
      movement_origin,
      quantity_delta,
      unit,
      capture_idempotency_key,
      note
    )
    values (
      v_user_id,
      v_container_id,
      'initial_stock',
      'manual',
      v_remainder,
      v_unit,
      p_idempotency_key,
      'Früherer Restbestand vor Kauf'
    );
  end if;

  insert into public.fertilizer_stock_movements (
    user_id,
    container_id,
    movement_type,
    movement_origin,
    quantity_delta,
    unit,
    capture_idempotency_key,
    note
  )
  values (
    v_user_id,
    v_container_id,
    'purchase',
    'manual',
    v_purchase,
    v_unit,
    p_idempotency_key,
    case
      when coalesce(p_package_count, 1) > 1
        then format('Kauf (%s Gebinde)', p_package_count)
      else 'Kauf'
    end
  );

  v_balance := public.fertilizer_container_balance(v_container_id);

  insert into public.fertilizer_capture_receipts (
    user_id,
    idempotency_key,
    container_id,
    catalog_product_id,
    recognition_candidate_id,
    product_label,
    purchase_quantity,
    purchase_unit,
    previous_remainder,
    resulting_balance
  )
  values (
    v_user_id,
    p_idempotency_key,
    v_container_id,
    p_catalog_product_id,
    v_candidate_id,
    v_label,
    v_purchase,
    v_unit,
    nullif(v_remainder, 0),
    v_balance
  );

  return jsonb_build_object(
    'receipt_id', (select id from public.fertilizer_capture_receipts where user_id = v_user_id and idempotency_key = p_idempotency_key),
    'container_id', v_container_id,
    'catalog_product_id', p_catalog_product_id,
    'recognition_candidate_id', v_candidate_id,
    'product_profile_id', v_profile_id,
    'product_label', v_label,
    'purchase_quantity', v_purchase,
    'purchase_unit', v_unit,
    'previous_remainder', nullif(v_remainder, 0),
    'resulting_balance', v_balance,
    'idempotent_replay', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.product_profiles enable row level security;

create policy product_profiles_select_visible
  on public.product_profiles for select
  to authenticated
  using (
    profile_status = 'verified'
    or (profile_status = 'draft' and user_id = auth.uid())
  );

revoke insert, update, delete on public.product_profiles from authenticated;

grant execute on function public.ensure_product_profile_from_snapshot(jsonb) to authenticated;
grant execute on function public.resolve_product_profile_for_catalog(uuid) to authenticated;
grant execute on function public.user_can_link_product_profile(uuid, uuid) to authenticated;
