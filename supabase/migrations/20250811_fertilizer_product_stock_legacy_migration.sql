-- GA-015 Phase 3 — Legacy product-stock migration (additive)
-- Dry-run analysis, atomic group migration, legacy_balance_migration takeover, supersede + write protection.
-- No automatic data migration on schema apply.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enum — legacy_balance_migration (internal takeover reason)
-- ---------------------------------------------------------------------------

do $$
begin
  alter type public.fertilizer_movement_type add value if not exists 'legacy_balance_migration';
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- fertilizer_containers — supersede target
-- ---------------------------------------------------------------------------

alter table public.fertilizer_containers
  add column if not exists superseded_by_container_id uuid
    references public.fertilizer_containers (id) on delete restrict;

alter table public.fertilizer_containers
  drop constraint if exists fertilizer_containers_superseded_not_self_check;

alter table public.fertilizer_containers
  add constraint fertilizer_containers_superseded_not_self_check
    check (
      superseded_by_container_id is null
      or superseded_by_container_id <> id
    );

comment on column public.fertilizer_containers.superseded_by_container_id is
  'Canonical product_stock item that superseded this legacy row (GA-015 Phase 3). Read models exclude superseded legacy from active totals.';

create index if not exists fertilizer_containers_superseded_by_idx
  on public.fertilizer_containers (superseded_by_container_id)
  where superseded_by_container_id is not null;

-- ---------------------------------------------------------------------------
-- Migration receipt (request-scoped idempotency — not inventory truth)
-- ---------------------------------------------------------------------------

create table if not exists public.fertilizer_product_stock_migration_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  migration_group_key text not null,
  payload_fingerprint text not null,
  saved_product_profile_id uuid not null references public.product_profiles (id) on delete restrict,
  base_unit text not null,
  legacy_container_ids uuid[] not null,
  canonical_container_id uuid null references public.fertilizer_containers (id) on delete restrict,
  takeover_movement_id uuid null references public.fertilizer_stock_movements (id) on delete restrict,
  effective_balance numeric(18, 4) not null default 0,
  migration_cutoff_at timestamptz not null,
  movement_checksum text not null,
  status text not null default 'pending',
  result_jsonb jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  constraint fertilizer_product_stock_migration_receipts_idempotency_key_nonempty_check
    check (idempotency_key <> ''),
  constraint fertilizer_product_stock_migration_receipts_payload_fingerprint_nonempty_check
    check (payload_fingerprint <> ''),
  constraint fertilizer_product_stock_migration_receipts_base_unit_check
    check (base_unit in ('kg', 'ml')),
  constraint fertilizer_product_stock_migration_receipts_status_check
    check (status in ('pending', 'completed', 'conflict')),
  constraint fertilizer_product_stock_migration_receipts_legacy_ids_nonempty_check
    check (cardinality(legacy_container_ids) > 0)
);

create unique index if not exists fertilizer_product_stock_migration_receipts_user_idempotency_idx
  on public.fertilizer_product_stock_migration_receipts (user_id, idempotency_key);

create unique index if not exists fertilizer_product_stock_migration_receipts_completed_group_idx
  on public.fertilizer_product_stock_migration_receipts (user_id, saved_product_profile_id, base_unit)
  where status = 'completed';

comment on table public.fertilizer_product_stock_migration_receipts is
  'Technical receipt for legacy product-stock group migration — audit and idempotency, not inventory truth.';

alter table public.fertilizer_product_stock_migration_receipts enable row level security;

revoke all on public.fertilizer_product_stock_migration_receipts from public;
revoke all on public.fertilizer_product_stock_migration_receipts from authenticated, anon;
grant all on public.fertilizer_product_stock_migration_receipts to service_role;

-- ---------------------------------------------------------------------------
-- Write protection — no new movements on archived/superseded containers
-- ---------------------------------------------------------------------------

create or replace function public.prevent_movement_on_superseded_container()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_item public.fertilizer_containers%rowtype;
begin
  select *
  into v_item
  from public.fertilizer_containers fc
  where fc.id = new.container_id;

  if not found then
    raise exception 'INVENTORY_ITEM_NOT_FOUND';
  end if;

  if v_item.archived_at is not null or v_item.superseded_by_container_id is not null then
    raise exception 'INVENTORY_ITEM_SUPERSEDED';
  end if;

  return new;
end;
$$;

drop trigger if exists fertilizer_stock_movements_prevent_superseded_insert
  on public.fertilizer_stock_movements;

create trigger fertilizer_stock_movements_prevent_superseded_insert
  before insert on public.fertilizer_stock_movements
  for each row
  execute function public.prevent_movement_on_superseded_container();

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public._product_stock_legacy_migration_format_quantity(p_value numeric)
returns text
language sql
immutable
as $$
  select public._product_stock_intake_format_quantity(p_value);
$$;

create or replace function public._product_stock_legacy_migration_compute_fingerprint(p_canonical_json text)
returns text
language sql
immutable
as $$
  select public._product_stock_intake_compute_fingerprint(p_canonical_json);
$$;

create or replace function public._product_stock_legacy_migration_group_key(
  p_user_id uuid,
  p_saved_product_profile_id uuid,
  p_base_unit text
)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'userId', p_user_id::text,
          'savedProductProfileId', p_saved_product_profile_id::text,
          'baseUnit', p_base_unit
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public._product_stock_legacy_migration_advisory_lock_key(
  p_user_id uuid,
  p_migration_group_key text
)
returns bigint
language plpgsql
immutable
set search_path = public
as $$
declare
  v_canonical text;
  v_digest bytea;
begin
  v_canonical := jsonb_build_object(
    'userId', p_user_id::text,
    'migrationGroupKey', p_migration_group_key
  )::text;

  v_digest := extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256');

  return (
    (get_byte(v_digest, 0)::bigint << 56)
    | (get_byte(v_digest, 1)::bigint << 48)
    | (get_byte(v_digest, 2)::bigint << 40)
    | (get_byte(v_digest, 3)::bigint << 32)
    | (get_byte(v_digest, 4)::bigint << 24)
    | (get_byte(v_digest, 5)::bigint << 16)
    | (get_byte(v_digest, 6)::bigint << 8)
    | get_byte(v_digest, 7)::bigint
  );
end;
$$;

create or replace function public._product_stock_legacy_migration_movement_idempotency_key(p_receipt_id uuid)
returns text
language sql
immutable
as $$
  select 'product-stock-legacy-migration:' || p_receipt_id::text;
$$;

create or replace function public._product_stock_legacy_migration_is_legacy_row(p_item public.fertilizer_containers)
returns boolean
language sql
immutable
as $$
  select
    p_item.stock_kind is distinct from 'product_stock'
    and p_item.access_kind = 'authenticated_user'
    and p_item.saved_product_profile_id is not null
    and p_item.base_unit is not null;
$$;

create or replace function public._product_stock_legacy_migration_compute_movement_checksum(
  p_movement_ids uuid[]
)
returns text
language sql
stable
set search_path = public
as $$
  select encode(
    extensions.digest(
      convert_to(
        coalesce(
          (
            select string_agg(
              fsm.id::text || ':'
                || public._product_stock_legacy_migration_format_quantity(fsm.quantity_delta) || ':'
                || fsm.unit || ':'
                || to_char(fsm.movement_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              '|' order by fsm.id
            )
            from public.fertilizer_stock_movements fsm
            where fsm.id = any (p_movement_ids)
          ),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public._product_stock_legacy_migration_effective_movement_ids(
  p_legacy_container_ids uuid[],
  p_migration_cutoff_at timestamptz
)
returns uuid[]
language sql
stable
set search_path = public
as $$
  select coalesce(
    array_agg(fsm.id order by fsm.id),
    array[]::uuid[]
  )
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = any (p_legacy_container_ids)
    and fsm.movement_at is not null
    and fsm.movement_at <= p_migration_cutoff_at;
$$;

create or replace function public._product_stock_legacy_migration_compute_balance(
  p_legacy_container_ids uuid[],
  p_base_unit text,
  p_migration_cutoff_at timestamptz,
  out balance numeric,
  out movement_ids uuid[],
  out movement_checksum text,
  out movements_without_at integer,
  out unit_conflict boolean,
  out invalid_movement boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_row record;
begin
  balance := 0;
  movement_ids := array[]::uuid[];
  movements_without_at := 0;
  unit_conflict := false;
  invalid_movement := false;

  select count(*)::integer
  into movements_without_at
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = any (p_legacy_container_ids)
    and fsm.movement_at is null;

  for v_row in
    select fsm.id, fsm.quantity_delta, fsm.unit
    from public.fertilizer_stock_movements fsm
    where fsm.container_id = any (p_legacy_container_ids)
      and fsm.movement_at is not null
      and fsm.movement_at <= p_migration_cutoff_at
    order by fsm.id
  loop
    if v_row.quantity_delta is null
      or v_row.quantity_delta = 0
      or v_row.quantity_delta <> round(v_row.quantity_delta, 4) then
      invalid_movement := true;
    end if;

    if v_row.unit is distinct from p_base_unit then
      unit_conflict := true;
    end if;

    balance := balance + v_row.quantity_delta;
    movement_ids := array_append(movement_ids, v_row.id);
  end loop;

  if balance <> round(balance, 4) then
    invalid_movement := true;
  end if;

  movement_checksum := public._product_stock_legacy_migration_compute_movement_checksum(movement_ids);
end;
$$;

create or replace function public._product_stock_legacy_migration_build_fingerprint_json(
  p_user_id uuid,
  p_saved_product_profile_id uuid,
  p_base_unit text,
  p_legacy_container_ids uuid[],
  p_movement_ids uuid[],
  p_movement_checksum text,
  p_migration_cutoff_at timestamptz,
  p_computed_balance numeric,
  p_canonical_container_id uuid
)
returns text
language sql
immutable
as $$
  select jsonb_build_object(
    'userId', p_user_id::text,
    'savedProductProfileId', p_saved_product_profile_id::text,
    'baseUnit', p_base_unit,
    'legacyContainerIds', (
      select coalesce(jsonb_agg(id_text order by id_text), '[]'::jsonb)
      from (
        select legacy_id::text as id_text
        from unnest(p_legacy_container_ids) as legacy_id
        order by legacy_id
      ) sorted
    ),
    'effectiveMovementIds', (
      select coalesce(jsonb_agg(id_text order by id_text), '[]'::jsonb)
      from (
        select movement_id::text as id_text
        from unnest(p_movement_ids) as movement_id
        order by movement_id
      ) sorted_movements
    ),
    'movementChecksum', p_movement_checksum,
    'migrationCutoffAt', to_char(p_migration_cutoff_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'computedBalance', public._product_stock_legacy_migration_format_quantity(p_computed_balance),
    'canonicalContainerId', case
      when p_canonical_container_id is null then null
      else p_canonical_container_id::text
    end,
    'movementReason', 'legacy_balance_migration'
  )::text;
$$;

create or replace function public._product_stock_legacy_migration_find_or_create_canonical(
  p_user_id uuid,
  p_saved_product_profile_id uuid,
  p_base_unit text
)
returns public.fertilizer_containers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.fertilizer_containers%rowtype;
begin
  select *
  into v_item
  from public.fertilizer_containers fc
  where fc.user_id = p_user_id
    and fc.saved_product_profile_id = p_saved_product_profile_id
    and fc.base_unit = p_base_unit
    and fc.stock_kind = 'product_stock'
    and fc.archived_at is null
    and fc.access_kind = 'authenticated_user'
  for update;

  if found then
    return v_item;
  end if;

  insert into public.fertilizer_containers (
    user_id,
    product_id,
    recognition_candidate_id,
    saved_product_profile_id,
    access_kind,
    session_access_hash,
    base_unit,
    package_size_value,
    package_size_unit,
    label,
    stock_kind,
    created_at,
    archived_at
  ) values (
    p_user_id,
    null,
    null,
    p_saved_product_profile_id,
    'authenticated_user',
    null,
    p_base_unit,
    null,
    null,
    null,
    'product_stock',
    timezone('utc', now()),
    null
  )
  on conflict (user_id, saved_product_profile_id, base_unit)
    where (
      stock_kind = 'product_stock'
      and archived_at is null
      and saved_product_profile_id is not null
      and base_unit is not null
      and access_kind = 'authenticated_user'
    )
  do nothing
  returning * into v_item;

  if found then
    return v_item;
  end if;

  select *
  into v_item
  from public.fertilizer_containers fc
  where fc.user_id = p_user_id
    and fc.saved_product_profile_id = p_saved_product_profile_id
    and fc.base_unit = p_base_unit
    and fc.stock_kind = 'product_stock'
    and fc.archived_at is null
    and fc.access_kind = 'authenticated_user'
  for update;

  if not found then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_FAILED';
  end if;

  return v_item;
end;
$$;

create or replace function public._product_stock_legacy_migration_insert_takeover_movement(
  p_receipt_id uuid,
  p_canonical_container_id uuid,
  p_user_id uuid,
  p_base_unit text,
  p_quantity numeric,
  p_migration_cutoff_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_movement_key text;
  v_movement_at timestamptz;
  v_existing public.fertilizer_stock_movements%rowtype;
begin
  if p_quantity is null or not (p_quantity > 0) or p_quantity <> round(p_quantity, 4) then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_BALANCE_INVALID';
  end if;

  v_movement_key := public._product_stock_legacy_migration_movement_idempotency_key(p_receipt_id);
  v_movement_at := p_migration_cutoff_at;

  select *
  into v_existing
  from public.fertilizer_stock_movements fsm
  where fsm.user_id = p_user_id
    and fsm.inventory_idempotency_key = v_movement_key
    and fsm.access_kind = 'authenticated_user'
    and fsm.movement_at is not null;

  if found then
    if v_existing.container_id is distinct from p_canonical_container_id
      or v_existing.quantity_delta is distinct from p_quantity
      or v_existing.unit is distinct from p_base_unit
      or v_existing.movement_type::text is distinct from 'legacy_balance_migration' then
      raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_IDEMPOTENCY_CONFLICT';
    end if;

    return v_existing.id;
  end if;

  v_movement_id := gen_random_uuid();

  insert into public.fertilizer_stock_movements (
    id,
    container_id,
    access_kind,
    user_id,
    session_access_hash,
    quantity_delta,
    unit,
    movement_type,
    movement_origin,
    movement_at,
    movement_date,
    inventory_idempotency_key,
    source_event_ref,
    note,
    created_at,
    capture_idempotency_key
  ) values (
    v_movement_id,
    p_canonical_container_id,
    'authenticated_user',
    p_user_id,
    null,
    p_quantity,
    p_base_unit,
    'legacy_balance_migration'::public.fertilizer_movement_type,
    'migration'::public.fertilizer_movement_origin,
    v_movement_at,
    (v_movement_at at time zone 'UTC')::date,
    v_movement_key,
    'product-stock-legacy-migration:' || p_receipt_id::text,
    'Übernommener früherer Bestand',
    timezone('utc', now()),
    null
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Group analysis (shared by dry-run and write RPC)
-- ---------------------------------------------------------------------------

create or replace function public._product_stock_legacy_migration_analyze_group(
  p_user_id uuid,
  p_saved_product_profile_id uuid,
  p_base_unit text,
  p_migration_cutoff_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.product_profiles%rowtype;
  v_legacy_ids uuid[];
  v_canonical_id uuid;
  v_canonical_archived_count integer;
  v_active_canonical_count integer;
  v_legacy_count integer;
  v_archived_legacy_count integer;
  v_balance numeric;
  v_movement_ids uuid[];
  v_movement_checksum text;
  v_movements_without_at integer;
  v_unit_conflict boolean;
  v_invalid_movement boolean;
  v_classification text;
  v_auto_migratable boolean := false;
  v_blocking_reasons text[] := array[]::text[];
  v_expected_takeover boolean := false;
  v_form_unit_ok boolean := true;
begin
  if p_base_unit is null or p_base_unit not in ('kg', 'ml') then
    return jsonb_build_object(
      'migrationGroupKey', null,
      'userId', p_user_id,
      'savedProductProfileId', p_saved_product_profile_id,
      'baseUnit', p_base_unit,
      'classification', 'F',
      'autoMigratable', false,
      'blockingReasons', array['missing_or_invalid_base_unit'],
      'legacyContainerIds', '[]'::jsonb,
      'canonicalContainerId', null,
      'legacyItemCount', 0,
      'effectiveMovementCount', 0,
      'movementsWithoutMovementAt', 0,
      'effectiveBalance', 0,
      'movementChecksum', null,
      'expectedTakeoverMovement', false,
      'expectedSupersedeCount', 0,
      'recommendedTreatment', 'blocked'
    );
  end if;

  select *
  into v_profile
  from public.product_profiles pp
  where pp.id = p_saved_product_profile_id;

  if not found
    or v_profile.profile_status <> 'saved'
    or v_profile.source <> 'enrichment'
    or v_profile.user_id is distinct from p_user_id then
    return jsonb_build_object(
      'migrationGroupKey', public._product_stock_legacy_migration_group_key(
        p_user_id, p_saved_product_profile_id, p_base_unit
      ),
      'userId', p_user_id,
      'savedProductProfileId', p_saved_product_profile_id,
      'baseUnit', p_base_unit,
      'classification', 'E',
      'autoMigratable', false,
      'blockingReasons', array['missing_or_invalid_saved_profile'],
      'legacyContainerIds', '[]'::jsonb,
      'canonicalContainerId', null,
      'legacyItemCount', 0,
      'effectiveMovementCount', 0,
      'movementsWithoutMovementAt', 0,
      'effectiveBalance', 0,
      'movementChecksum', null,
      'expectedTakeoverMovement', false,
      'expectedSupersedeCount', 0,
      'recommendedTreatment', 'blocked'
    );
  end if;

  if v_profile.product_form = 'granular' and p_base_unit <> 'kg' then
    v_form_unit_ok := false;
  elsif v_profile.product_form = 'liquid' and p_base_unit <> 'ml' then
    v_form_unit_ok := false;
  end if;

  if not v_form_unit_ok then
    return jsonb_build_object(
      'migrationGroupKey', public._product_stock_legacy_migration_group_key(
        p_user_id, p_saved_product_profile_id, p_base_unit
      ),
      'userId', p_user_id,
      'savedProductProfileId', p_saved_product_profile_id,
      'baseUnit', p_base_unit,
      'classification', 'G',
      'autoMigratable', false,
      'blockingReasons', array['form_unit_conflict'],
      'legacyContainerIds', '[]'::jsonb,
      'canonicalContainerId', null,
      'legacyItemCount', 0,
      'effectiveMovementCount', 0,
      'movementsWithoutMovementAt', 0,
      'effectiveBalance', 0,
      'movementChecksum', null,
      'expectedTakeoverMovement', false,
      'expectedSupersedeCount', 0,
      'recommendedTreatment', 'blocked'
    );
  end if;

  select coalesce(array_agg(fc.id order by fc.id), array[]::uuid[])
  into v_legacy_ids
  from public.fertilizer_containers fc
  where fc.user_id = p_user_id
    and fc.saved_product_profile_id = p_saved_product_profile_id
    and fc.base_unit = p_base_unit
    and fc.access_kind = 'authenticated_user'
    and public._product_stock_legacy_migration_is_legacy_row(fc)
    and fc.superseded_by_container_id is null
    and fc.archived_at is null;

  select count(*)::integer
  into v_archived_legacy_count
  from public.fertilizer_containers fc
  where fc.user_id = p_user_id
    and fc.saved_product_profile_id = p_saved_product_profile_id
    and fc.base_unit = p_base_unit
    and fc.access_kind = 'authenticated_user'
    and public._product_stock_legacy_migration_is_legacy_row(fc)
    and fc.archived_at is not null
    and fc.superseded_by_container_id is null;

  v_legacy_count := cardinality(v_legacy_ids);

  select fc.id
  into v_canonical_id
  from public.fertilizer_containers fc
  where fc.user_id = p_user_id
    and fc.saved_product_profile_id = p_saved_product_profile_id
    and fc.base_unit = p_base_unit
    and fc.stock_kind = 'product_stock'
    and fc.archived_at is null
    and fc.access_kind = 'authenticated_user'
  order by fc.created_at
  limit 1;

  select count(*)::integer
  into v_active_canonical_count
  from public.fertilizer_containers fc
  where fc.user_id = p_user_id
    and fc.saved_product_profile_id = p_saved_product_profile_id
    and fc.base_unit = p_base_unit
    and fc.stock_kind = 'product_stock'
    and fc.archived_at is null
    and fc.access_kind = 'authenticated_user';

  select count(*)::integer
  into v_canonical_archived_count
  from public.fertilizer_containers fc
  where fc.user_id = p_user_id
    and fc.saved_product_profile_id = p_saved_product_profile_id
    and fc.base_unit = p_base_unit
    and fc.stock_kind = 'product_stock'
    and fc.archived_at is not null
    and fc.access_kind = 'authenticated_user';

  if v_active_canonical_count > 1 then
    v_classification := 'H';
    v_blocking_reasons := array_append(v_blocking_reasons, 'multiple_active_canonical_items');
  elsif v_archived_legacy_count > 0 and v_legacy_count = 0 then
    v_classification := 'I';
    v_blocking_reasons := array_append(v_blocking_reasons, 'archived_legacy_only');
  elsif v_legacy_count = 0 and v_canonical_id is not null then
    v_classification := 'A';
  elsif v_legacy_count = 0 and v_canonical_id is null then
    v_classification := 'J';
  elsif v_legacy_count = 1 and v_canonical_id is null then
    v_classification := 'B';
  elsif v_legacy_count > 1 and v_canonical_id is null then
    v_classification := 'C';
  elsif v_legacy_count >= 1 and v_canonical_id is not null then
    v_classification := 'D';
  else
    v_classification := 'H';
    v_blocking_reasons := array_append(v_blocking_reasons, 'unclassified_group');
  end if;

  if v_legacy_count > 0 then
    select
      b.balance,
      b.movement_ids,
      b.movement_checksum,
      b.movements_without_at,
      b.unit_conflict,
      b.invalid_movement
    into
      v_balance,
      v_movement_ids,
      v_movement_checksum,
      v_movements_without_at,
      v_unit_conflict,
      v_invalid_movement
    from public._product_stock_legacy_migration_compute_balance(
      v_legacy_ids,
      p_base_unit,
      p_migration_cutoff_at
    ) as b;
  else
    v_balance := 0;
    v_movement_ids := array[]::uuid[];
    v_movement_checksum := public._product_stock_legacy_migration_compute_movement_checksum(v_movement_ids);
    v_movements_without_at := 0;
    v_unit_conflict := false;
    v_invalid_movement := false;
  end if;

  if v_unit_conflict or v_invalid_movement then
    v_classification := 'H';
    if v_unit_conflict then
      v_blocking_reasons := array_append(v_blocking_reasons, 'movement_unit_conflict');
    end if;
    if v_invalid_movement then
      v_blocking_reasons := array_append(v_blocking_reasons, 'invalid_movement_data');
    end if;
  end if;

  if v_balance < 0 then
    v_classification := 'H';
    v_blocking_reasons := array_append(v_blocking_reasons, 'negative_balance');
  end if;

  if v_canonical_archived_count > 0 and v_canonical_id is null then
    v_classification := 'H';
    v_blocking_reasons := array_append(v_blocking_reasons, 'archived_canonical_only');
  end if;

  if v_classification in ('B', 'C', 'D') and cardinality(v_blocking_reasons) = 0 then
    if v_balance > 0 then
      v_auto_migratable := true;
      v_expected_takeover := true;
    elsif v_balance = 0 then
      if v_classification in ('B', 'C') then
        v_classification := 'J';
      end if;
      v_auto_migratable := true;
      v_expected_takeover := false;
    else
      v_auto_migratable := false;
    end if;
  elsif v_classification = 'J' and v_legacy_count > 0 and v_balance = 0 and cardinality(v_blocking_reasons) = 0 then
    v_auto_migratable := true;
    v_expected_takeover := false;
  end if;

  return jsonb_build_object(
    'migrationGroupKey', public._product_stock_legacy_migration_group_key(
      p_user_id, p_saved_product_profile_id, p_base_unit
    ),
    'userId', p_user_id,
    'savedProductProfileId', p_saved_product_profile_id,
    'baseUnit', p_base_unit,
    'legacyContainerIds', to_jsonb(v_legacy_ids),
    'canonicalContainerId', v_canonical_id,
    'legacyItemCount', v_legacy_count,
    'effectiveMovementCount', cardinality(v_movement_ids),
    'movementsWithoutMovementAt', v_movements_without_at,
    'effectiveBalance', v_balance,
    'movementChecksum', v_movement_checksum,
    'classification', v_classification,
    'autoMigratable', v_auto_migratable,
    'blockingReasons', to_jsonb(v_blocking_reasons),
    'expectedTakeoverMovement', v_expected_takeover,
    'expectedSupersedeCount', v_legacy_count,
    'recommendedTreatment', case
      when v_auto_migratable then 'migrate'
      when v_classification = 'A' then 'none'
      when v_classification = 'I' then 'preserve'
      else 'blocked'
    end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Dry-run RPC (read-only)
-- ---------------------------------------------------------------------------

create or replace function public.analyze_fertilizer_product_stock_legacy_migration(
  p_migration_cutoff_at timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_cutoff timestamptz;
  v_groups jsonb := '[]'::jsonb;
  v_group record;
  v_analysis jsonb;
  v_summary jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_ACCESS_DENIED';
  end if;

  v_cutoff := coalesce(p_migration_cutoff_at, timezone('utc', now()));

  for v_group in
    select distinct
      fc.saved_product_profile_id,
      fc.base_unit
    from public.fertilizer_containers fc
    where fc.user_id = v_user_id
      and fc.access_kind = 'authenticated_user'
      and fc.saved_product_profile_id is not null
      and fc.base_unit is not null
      and (
        public._product_stock_legacy_migration_is_legacy_row(fc)
        or fc.stock_kind = 'product_stock'
      )
    order by fc.saved_product_profile_id, fc.base_unit
  loop
    v_analysis := public._product_stock_legacy_migration_analyze_group(
      v_user_id,
      v_group.saved_product_profile_id,
      v_group.base_unit,
      v_cutoff
    );
    v_groups := v_groups || jsonb_build_array(v_analysis);
  end loop;

  select jsonb_build_object(
    'legacyItemCount', (
      select count(*)::integer
      from public.fertilizer_containers fc
      where fc.user_id = v_user_id
        and fc.access_kind = 'authenticated_user'
        and public._product_stock_legacy_migration_is_legacy_row(fc)
        and fc.superseded_by_container_id is null
        and fc.archived_at is null
    ),
    'canonicalItemCount', (
      select count(*)::integer
      from public.fertilizer_containers fc
      where fc.user_id = v_user_id
        and fc.stock_kind = 'product_stock'
        and fc.archived_at is null
        and fc.access_kind = 'authenticated_user'
    ),
    'migrationGroupCount', jsonb_array_length(v_groups),
    'autoMigratableGroups', (
      select count(*)::integer
      from jsonb_array_elements(v_groups) elem
      where (elem ->> 'autoMigratable')::boolean is true
    ),
    'blockedGroups', (
      select count(*)::integer
      from jsonb_array_elements(v_groups) elem
      where (elem ->> 'autoMigratable')::boolean is not true
        and elem ->> 'classification' not in ('A')
    ),
    'itemsWithoutSavedProfile', (
      select count(*)::integer
      from public.fertilizer_containers fc
      where fc.user_id = v_user_id
        and fc.access_kind = 'authenticated_user'
        and fc.saved_product_profile_id is null
        and fc.stock_kind is distinct from 'product_stock'
        and fc.archived_at is null
    ),
    'unitConflicts', (
      select count(*)::integer
      from jsonb_array_elements(v_groups) elem
      where elem ->> 'classification' in ('F', 'H')
        and elem -> 'blockingReasons' ? 'movement_unit_conflict'
    ),
    'formUnitConflicts', (
      select count(*)::integer
      from jsonb_array_elements(v_groups) elem
      where elem ->> 'classification' = 'G'
    ),
    'negativeBalances', (
      select count(*)::integer
      from jsonb_array_elements(v_groups) elem
      where elem -> 'blockingReasons' ? 'negative_balance'
    ),
    'zeroBalanceGroups', (
      select count(*)::integer
      from jsonb_array_elements(v_groups) elem
      where (elem ->> 'effectiveBalance')::numeric = 0
        and (elem ->> 'legacyItemCount')::integer > 0
    ),
    'groupsWithExistingCanonical', (
      select count(*)::integer
      from jsonb_array_elements(v_groups) elem
      where elem ->> 'classification' = 'D'
    ),
    'movementsWithoutMovementAt', (
      select coalesce(sum((elem ->> 'movementsWithoutMovementAt')::integer), 0)::integer
      from jsonb_array_elements(v_groups) elem
    ),
    'expectedTakeoverMovements', (
      select count(*)::integer
      from jsonb_array_elements(v_groups) elem
      where (elem ->> 'expectedTakeoverMovement')::boolean is true
    ),
    'expectedSupersededItems', (
      select coalesce(sum((elem ->> 'expectedSupersedeCount')::integer), 0)::integer
      from jsonb_array_elements(v_groups) elem
      where (elem ->> 'autoMigratable')::boolean is true
    )
  )
  into v_summary;

  return jsonb_build_object(
    'migrationCutoffAt', v_cutoff,
    'summary', v_summary,
    'groups', v_groups
  );
end;
$$;

revoke all on function public.analyze_fertilizer_product_stock_legacy_migration(timestamptz) from public;
grant execute on function public.analyze_fertilizer_product_stock_legacy_migration(timestamptz)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Write migration RPC (atomic per group)
-- ---------------------------------------------------------------------------

create or replace function public.migrate_fertilizer_product_stock_legacy_group(
  p_saved_product_profile_id uuid,
  p_base_unit text,
  p_idempotency_key text,
  p_payload_fingerprint text,
  p_migration_cutoff_at timestamptz,
  p_legacy_container_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_idempotency_key text;
  v_group_key text;
  v_analysis jsonb;
  v_classification text;
  v_legacy_ids uuid[];
  v_expected_legacy_ids uuid[];
  v_balance numeric;
  v_movement_ids uuid[];
  v_movement_checksum text;
  v_canonical_id uuid;
  v_canonical public.fertilizer_containers%rowtype;
  v_receipt public.fertilizer_product_stock_migration_receipts%rowtype;
  v_receipt_id uuid;
  v_takeover_movement_id uuid;
  v_fingerprint_json text;
  v_fingerprint text;
  v_result jsonb;
  v_migration_at timestamptz;
  v_receipt_exists boolean := false;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_ACCESS_DENIED';
  end if;

  v_idempotency_key := nullif(trim(p_idempotency_key), '');

  if v_idempotency_key is null or length(v_idempotency_key) > 256 then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_IDEMPOTENCY_INVALID';
  end if;

  if p_payload_fingerprint is null or trim(p_payload_fingerprint) = '' then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_FINGERPRINT_INVALID';
  end if;

  if p_migration_cutoff_at is null then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_CUTOFF_INVALID';
  end if;

  v_group_key := public._product_stock_legacy_migration_group_key(
    v_user_id,
    p_saved_product_profile_id,
    p_base_unit
  );

  perform pg_advisory_xact_lock(
    public._product_stock_legacy_migration_advisory_lock_key(v_user_id, v_group_key)
  );

  select *
  into v_receipt
  from public.fertilizer_product_stock_migration_receipts r
  where r.user_id = v_user_id
    and r.idempotency_key = v_idempotency_key
  for update;

  v_receipt_exists := found;

  if v_receipt_exists then
    if v_receipt.payload_fingerprint <> trim(p_payload_fingerprint) then
      raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_IDEMPOTENCY_CONFLICT';
    end if;

    if v_receipt.status = 'completed' and v_receipt.result_jsonb is not null then
      return v_receipt.result_jsonb || jsonb_build_object('idempotency_replay', true);
    end if;
  elsif exists (
    select 1
    from public.fertilizer_product_stock_migration_receipts r
    where r.user_id = v_user_id
      and r.saved_product_profile_id = p_saved_product_profile_id
      and r.base_unit = p_base_unit
      and r.status = 'completed'
  ) then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_GROUP_ALREADY_COMPLETED';
  end if;

  v_analysis := public._product_stock_legacy_migration_analyze_group(
    v_user_id,
    p_saved_product_profile_id,
    p_base_unit,
    p_migration_cutoff_at
  );

  v_classification := v_analysis ->> 'classification';

  if (v_analysis ->> 'autoMigratable')::boolean is not true then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_GROUP_BLOCKED';
  end if;

  select coalesce(array_agg(value::uuid order by value::uuid), array[]::uuid[])
  into v_expected_legacy_ids
  from jsonb_array_elements_text(v_analysis -> 'legacyContainerIds') as value;

  if p_legacy_container_ids is not null then
    select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_legacy_ids
    from unnest(p_legacy_container_ids) as id;

    if v_legacy_ids is distinct from v_expected_legacy_ids then
      raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_LEGACY_IDS_MISMATCH';
    end if;
  else
    v_legacy_ids := v_expected_legacy_ids;
  end if;

  v_balance := (v_analysis ->> 'effectiveBalance')::numeric;
  v_movement_checksum := v_analysis ->> 'movementChecksum';
  v_canonical_id := nullif(v_analysis ->> 'canonicalContainerId', '')::uuid;

  select coalesce(array_agg(value::uuid order by value::uuid), array[]::uuid[])
  into v_movement_ids
  from (
    select unnest(
      public._product_stock_legacy_migration_effective_movement_ids(
        v_legacy_ids,
        p_migration_cutoff_at
      )
    ) as value
  ) ordered;

  v_fingerprint_json := public._product_stock_legacy_migration_build_fingerprint_json(
    v_user_id,
    p_saved_product_profile_id,
    p_base_unit,
    v_legacy_ids,
    v_movement_ids,
    v_movement_checksum,
    p_migration_cutoff_at,
    v_balance,
    v_canonical_id
  );

  v_fingerprint := public._product_stock_legacy_migration_compute_fingerprint(v_fingerprint_json);

  if v_fingerprint <> trim(p_payload_fingerprint) then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_FINGERPRINT_MISMATCH';
  end if;

  if not v_receipt_exists then
    insert into public.fertilizer_product_stock_migration_receipts (
      user_id,
      idempotency_key,
      migration_group_key,
      payload_fingerprint,
      saved_product_profile_id,
      base_unit,
      legacy_container_ids,
      canonical_container_id,
      effective_balance,
      migration_cutoff_at,
      movement_checksum,
      status
    ) values (
      v_user_id,
      v_idempotency_key,
      v_group_key,
      v_fingerprint,
      p_saved_product_profile_id,
      p_base_unit,
      v_legacy_ids,
      v_canonical_id,
      v_balance,
      p_migration_cutoff_at,
      v_movement_checksum,
      'pending'
    )
    returning * into v_receipt;
  else
    if v_receipt.legacy_container_ids is distinct from v_legacy_ids then
      raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_LEGACY_IDS_MISMATCH';
    end if;

    if v_receipt.payload_fingerprint <> v_fingerprint then
      raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_IDEMPOTENCY_CONFLICT';
    end if;
  end if;

  v_receipt_id := v_receipt.id;

  if exists (
    select 1
    from public.fertilizer_product_stock_migration_receipts r
    where r.user_id = v_user_id
      and r.saved_product_profile_id = p_saved_product_profile_id
      and r.base_unit = p_base_unit
      and r.status = 'completed'
      and r.id <> v_receipt_id
  ) then
    raise exception 'PRODUCT_STOCK_LEGACY_MIGRATION_GROUP_ALREADY_COMPLETED';
  end if;

  v_canonical := public._product_stock_legacy_migration_find_or_create_canonical(
    v_user_id,
    p_saved_product_profile_id,
    p_base_unit
  );

  v_takeover_movement_id := null;

  if v_balance > 0 then
    v_takeover_movement_id := public._product_stock_legacy_migration_insert_takeover_movement(
      v_receipt_id,
      v_canonical.id,
      v_user_id,
      p_base_unit,
      v_balance,
      p_migration_cutoff_at
    );
  end if;

  v_migration_at := timezone('utc', now());

  update public.fertilizer_containers fc
  set
    superseded_by_container_id = v_canonical.id,
    archived_at = v_migration_at
  where fc.id = any (v_legacy_ids)
    and fc.superseded_by_container_id is null;

  v_result := jsonb_build_object(
    'receipt_id', v_receipt_id,
    'idempotency_key', v_idempotency_key,
    'migration_group_key', v_group_key,
    'classification', v_classification,
    'canonical_container_id', v_canonical.id,
    'legacy_container_ids', to_jsonb(v_legacy_ids),
    'takeover_movement_id', v_takeover_movement_id,
    'effective_balance', v_balance,
    'movement_checksum', v_movement_checksum,
    'migration_cutoff_at', p_migration_cutoff_at,
    'idempotency_replay', false
  );

  update public.fertilizer_product_stock_migration_receipts
  set
    canonical_container_id = v_canonical.id,
    takeover_movement_id = v_takeover_movement_id,
    effective_balance = v_balance,
    status = 'completed',
    result_jsonb = v_result,
    completed_at = v_migration_at
  where id = v_receipt_id;

  return v_result;
end;
$$;

revoke all on function public.migrate_fertilizer_product_stock_legacy_group(
  uuid, text, text, text, timestamptz, uuid[]
) from public;

grant execute on function public.migrate_fertilizer_product_stock_legacy_group(
  uuid, text, text, text, timestamptz, uuid[]
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- append_fertilizer_inventory_core_movement — supersede guard (legacy_balance_migration not allowed)
-- ---------------------------------------------------------------------------

create or replace function public.append_fertilizer_inventory_core_movement(
  p_inventory_item_id uuid,
  p_access_kind text,
  p_user_id uuid,
  p_session_access_hash text,
  p_quantity_delta numeric,
  p_unit text,
  p_movement_type text,
  p_movement_origin text default 'manual',
  p_movement_at timestamptz default null,
  p_inventory_idempotency_key text default null,
  p_source_event_ref text default null,
  p_note text default null,
  p_movement_id uuid default null,
  p_created_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.fertilizer_containers%rowtype;
  v_existing public.fertilizer_stock_movements%rowtype;
  v_balance numeric;
  v_movement_id uuid;
  v_movement_at timestamptz;
  v_created_at timestamptz;
  v_movement_date date;
  v_idempotency_key text;
begin
  if p_access_kind is null or p_access_kind not in ('authenticated_user', 'session') then
    raise exception 'INVENTORY_ACCESS_DENIED';
  end if;

  if p_access_kind = 'authenticated_user' and p_user_id is null then
    raise exception 'INVENTORY_ACCESS_DENIED';
  end if;

  if p_access_kind = 'session'
    and (
      p_session_access_hash is null
      or length(p_session_access_hash) <> 64
      or p_session_access_hash !~ '^[0-9a-f]{64}$'
    ) then
    raise exception 'INVENTORY_ACCESS_DENIED';
  end if;

  if auth.uid() is not null then
    if p_access_kind = 'authenticated_user' and p_user_id is distinct from auth.uid() then
      raise exception 'INVENTORY_ACCESS_DENIED';
    end if;

    if p_access_kind = 'session' then
      raise exception 'INVENTORY_ACCESS_DENIED';
    end if;
  end if;

  if p_movement_type = 'legacy_balance_migration' then
    raise exception 'INVENTORY_MOVEMENT_TYPE_NOT_ALLOWED';
  end if;

  select *
  into v_item
  from public.fertilizer_containers fc
  where fc.id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'INVENTORY_ITEM_NOT_FOUND';
  end if;

  if v_item.archived_at is not null or v_item.superseded_by_container_id is not null then
    raise exception 'INVENTORY_ITEM_SUPERSEDED';
  end if;

  if v_item.saved_product_profile_id is null
    or v_item.access_kind is null
    or v_item.base_unit is null then
    raise exception 'INVENTORY_ITEM_NOT_FOUND';
  end if;

  if v_item.access_kind is distinct from p_access_kind then
    raise exception 'INVENTORY_ACCESS_DENIED';
  end if;

  if v_item.access_kind = 'authenticated_user' then
    if v_item.user_id is distinct from p_user_id then
      raise exception 'INVENTORY_ACCESS_DENIED';
    end if;
  elsif v_item.session_access_hash is distinct from p_session_access_hash then
    raise exception 'INVENTORY_ACCESS_DENIED';
  end if;

  if p_unit is null or p_unit <> v_item.base_unit then
    raise exception 'INVENTORY_UNIT_MISMATCH';
  end if;

  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'INVENTORY_QUANTITY_INVALID';
  end if;

  if abs(p_quantity_delta) > 100000 then
    raise exception 'INVENTORY_QUANTITY_INVALID';
  end if;

  if p_quantity_delta <> round(p_quantity_delta, 4) then
    raise exception 'INVENTORY_QUANTITY_INVALID';
  end if;

  if p_movement_type is null
    or p_movement_type not in (
      'purchase',
      'initial_stock',
      'gift_received',
      'sale',
      'gifted_away',
      'disposal',
      'fertilization',
      'inventory_correction'
    ) then
    raise exception 'INVENTORY_QUANTITY_INVALID';
  end if;

  if p_movement_origin is null
    or p_movement_origin not in ('manual', 'journal', 'system', 'migration') then
    raise exception 'INVENTORY_QUANTITY_INVALID';
  end if;

  v_idempotency_key := nullif(trim(p_inventory_idempotency_key), '');

  if v_idempotency_key is not null then
    if v_item.access_kind = 'authenticated_user' then
      select *
      into v_existing
      from public.fertilizer_stock_movements fsm
      where fsm.user_id = v_item.user_id
        and fsm.inventory_idempotency_key = v_idempotency_key
        and fsm.access_kind = 'authenticated_user'
        and fsm.movement_at is not null;
    else
      select *
      into v_existing
      from public.fertilizer_stock_movements fsm
      where fsm.session_access_hash = v_item.session_access_hash
        and fsm.inventory_idempotency_key = v_idempotency_key
        and fsm.access_kind = 'session'
        and fsm.movement_at is not null;
    end if;

    if found then
      if v_existing.container_id is distinct from p_inventory_item_id
        or v_existing.quantity_delta is distinct from p_quantity_delta
        or v_existing.unit is distinct from p_unit
        or v_existing.movement_type::text is distinct from p_movement_type then
        raise exception 'INVENTORY_IDEMPOTENCY_CONFLICT';
      end if;

      return to_jsonb(v_existing);
    end if;
  end if;

  select coalesce(sum(fsm.quantity_delta), 0)
  into v_balance
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_inventory_item_id
    and fsm.movement_at is not null;

  if v_balance + p_quantity_delta < 0 then
    raise exception 'INVENTORY_NEGATIVE_BALANCE';
  end if;

  v_movement_id := coalesce(p_movement_id, gen_random_uuid());
  v_movement_at := coalesce(p_movement_at, timezone('utc', now()));
  v_created_at := coalesce(p_created_at, timezone('utc', now()));
  v_movement_date := (v_movement_at at time zone 'UTC')::date;

  begin
    insert into public.fertilizer_stock_movements (
      id,
      container_id,
      access_kind,
      user_id,
      session_access_hash,
      quantity_delta,
      unit,
      movement_type,
      movement_origin,
      movement_at,
      movement_date,
      inventory_idempotency_key,
      source_event_ref,
      note,
      created_at,
      capture_idempotency_key
    ) values (
      v_movement_id,
      p_inventory_item_id,
      v_item.access_kind,
      v_item.user_id,
      v_item.session_access_hash,
      p_quantity_delta,
      p_unit,
      p_movement_type::public.fertilizer_movement_type,
      p_movement_origin::public.fertilizer_movement_origin,
      v_movement_at,
      v_movement_date,
      v_idempotency_key,
      p_source_event_ref,
      p_note,
      v_created_at,
      null
    )
    returning * into v_existing;
  exception
    when unique_violation then
      if v_idempotency_key is null then
        raise;
      end if;

      if v_item.access_kind = 'authenticated_user' then
        select *
        into v_existing
        from public.fertilizer_stock_movements fsm
        where fsm.user_id = v_item.user_id
          and fsm.inventory_idempotency_key = v_idempotency_key
          and fsm.access_kind = 'authenticated_user'
          and fsm.movement_at is not null;
      else
        select *
        into v_existing
        from public.fertilizer_stock_movements fsm
        where fsm.session_access_hash = v_item.session_access_hash
          and fsm.inventory_idempotency_key = v_idempotency_key
          and fsm.access_kind = 'session'
          and fsm.movement_at is not null;
      end if;

      if not found then
        raise;
      end if;

      if v_existing.container_id is distinct from p_inventory_item_id
        or v_existing.quantity_delta is distinct from p_quantity_delta
        or v_existing.unit is distinct from p_unit
        or v_existing.movement_type::text is distinct from p_movement_type then
        raise exception 'INVENTORY_IDEMPOTENCY_CONFLICT';
      end if;
  end;

  return to_jsonb(v_existing);
end;
$$;

revoke all on function public.append_fertilizer_inventory_core_movement(
  uuid, text, uuid, text, numeric, text, text, text, timestamptz, text, text, text, uuid, timestamptz
) from public;

grant execute on function public.append_fertilizer_inventory_core_movement(
  uuid, text, uuid, text, numeric, text, text, text, timestamptz, text, text, text, uuid, timestamptz
) to authenticated, service_role;
