-- GA-014 Phase 7c — Legacy fertilizer container in-place upgrade to Inventory Core
-- Additive receipt table + single-container upgrade RPC. No batch migration, no stored balance.

-- ---------------------------------------------------------------------------
-- Migration receipt (technical idempotency — not inventory truth)
-- ---------------------------------------------------------------------------

create table public.fertilizer_inventory_migration_receipts (
  id uuid primary key default gen_random_uuid(),
  legacy_container_id uuid not null references public.fertilizer_containers (id) on delete restrict,
  migration_key text not null,
  payload_fingerprint text not null,
  status text not null default 'completed'
    check (status in ('completed', 'failed')),
  result_jsonb jsonb null,
  error_code text null,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  failed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fertilizer_inventory_migration_receipts_migration_key_nonempty_check
    check (migration_key <> ''),
  constraint fertilizer_inventory_migration_receipts_payload_fingerprint_nonempty_check
    check (payload_fingerprint <> '')
);

create unique index fertilizer_inventory_migration_receipts_container_completed_idx
  on public.fertilizer_inventory_migration_receipts (legacy_container_id)
  where status = 'completed';

create unique index fertilizer_inventory_migration_receipts_migration_key_idx
  on public.fertilizer_inventory_migration_receipts (migration_key);

comment on table public.fertilizer_inventory_migration_receipts is
  'Technical atomic-operation receipt for legacy container inventory-core upgrade idempotency — not inventory truth.';

alter table public.fertilizer_inventory_migration_receipts enable row level security;

revoke all on public.fertilizer_inventory_migration_receipts from public;
revoke all on public.fertilizer_inventory_migration_receipts from authenticated, anon;
grant all on public.fertilizer_inventory_migration_receipts to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public._legacy_migration_advisory_lock_key(
  p_container_id uuid,
  p_migration_key text
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
    'containerId', lower(p_container_id::text),
    'migrationKey', p_migration_key
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

create or replace function public._legacy_migration_movement_timestamp(
  p_movement_at timestamptz,
  p_movement_date date,
  p_created_at timestamptz
)
returns timestamptz
language sql
immutable
as $$
  select coalesce(
    p_movement_at,
    case
      when p_movement_date is not null
        then (p_movement_date::text || 'T12:00:00.000Z')::timestamptz
      else null
    end,
    p_created_at
  );
$$;

create or replace function public._legacy_migration_detect_aggregation(
  p_container_id uuid,
  p_product_id uuid
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_capture_key_count integer;
  v_purchase_capture_key_count integer;
  v_gebinde_note_count integer;
begin
  select count(distinct trim(fsm.capture_idempotency_key))
  into v_capture_key_count
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_container_id
    and fsm.capture_idempotency_key is not null
    and trim(fsm.capture_idempotency_key) <> '';

  if p_product_id is not null and v_capture_key_count > 1 then
    return true;
  end if;

  select count(distinct trim(fsm.capture_idempotency_key))
  into v_purchase_capture_key_count
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_container_id
    and fsm.movement_type = 'purchase'
    and fsm.quantity_delta > 0
    and fsm.capture_idempotency_key is not null
    and trim(fsm.capture_idempotency_key) <> '';

  if p_product_id is not null and v_purchase_capture_key_count > 1 then
    return true;
  end if;

  select count(*)
  into v_gebinde_note_count
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_container_id
    and fsm.note is not null
    and fsm.note ~* '\(\s*\d+\s+Gebinde\s*\)';

  return v_gebinde_note_count > 0;
end;
$$;

create or replace function public._legacy_migration_validate_creation_reason(
  p_container_id uuid,
  p_creation_reason text
)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_inbound record;
  v_earliest_ts timestamptz;
  v_earliest_type text;
  v_conflicting_types boolean;
  v_acquisition_type_count integer;
begin
  if p_creation_reason is null
    or p_creation_reason not in ('initial_stock', 'purchase', 'gift_received') then
    raise exception 'AMBIGUOUS_CREATION_REASON';
  end if;

  select
    fsm.movement_type::text as movement_type,
    public._legacy_migration_movement_timestamp(
      fsm.movement_at,
      fsm.movement_date,
      fsm.created_at
    ) as movement_ts
  into v_inbound
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_container_id
    and fsm.quantity_delta > 0
    and fsm.movement_type::text in ('purchase', 'initial_stock', 'gift_received')
  order by public._legacy_migration_movement_timestamp(
    fsm.movement_at,
    fsm.movement_date,
    fsm.created_at
  )
  limit 1;

  if not found then
    if p_creation_reason = 'initial_stock'
      and not exists (
        select 1
        from public.fertilizer_stock_movements fsm
        where fsm.container_id = p_container_id
      ) then
      return;
    end if;

    raise exception 'AMBIGUOUS_CREATION_REASON';
  end if;

  v_earliest_ts := v_inbound.movement_ts;
  v_earliest_type := v_inbound.movement_type;

  select exists (
    select 1
    from public.fertilizer_stock_movements fsm
    where fsm.container_id = p_container_id
      and fsm.quantity_delta > 0
      and fsm.movement_type::text in ('purchase', 'initial_stock', 'gift_received')
      and public._legacy_migration_movement_timestamp(
        fsm.movement_at,
        fsm.movement_date,
        fsm.created_at
      ) = v_earliest_ts
      and fsm.movement_type::text <> v_earliest_type
  )
  into v_conflicting_types;

  if v_conflicting_types then
    raise exception 'AMBIGUOUS_CREATION_REASON';
  end if;

  select count(distinct fsm.movement_type::text)
  into v_acquisition_type_count
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_container_id
    and fsm.quantity_delta > 0
    and fsm.movement_type::text in ('purchase', 'gift_received');

  if v_acquisition_type_count >= 2 then
    raise exception 'AMBIGUOUS_CREATION_REASON';
  end if;

  if p_creation_reason <> v_earliest_type then
    raise exception 'AMBIGUOUS_CREATION_REASON';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Controlled legacy-upgrade metadata supplement on immutable movements
-- Transaction-local context: greenkeeper.fertilizer_legacy_upgrade = '1'
-- ---------------------------------------------------------------------------

create or replace function public.prevent_fertilizer_stock_movement_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_legacy_upgrade boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'INVENTORY_MOVEMENT_IMMUTABLE';
  end if;

  v_legacy_upgrade := coalesce(current_setting('greenkeeper.fertilizer_legacy_upgrade', true), '') = '1';

  if tg_op = 'UPDATE' and v_legacy_upgrade then
    if new.id is distinct from old.id
      or new.container_id is distinct from old.container_id
      or new.quantity_delta is distinct from old.quantity_delta
      or new.unit is distinct from old.unit
      or new.movement_type is distinct from old.movement_type
      or new.movement_date is distinct from old.movement_date
      or new.capture_idempotency_key is distinct from old.capture_idempotency_key
      or new.note is distinct from old.note
      or new.created_at is distinct from old.created_at
      or new.activity_id is distinct from old.activity_id
      or new.user_id is distinct from old.user_id
    then
      raise exception 'INVENTORY_MOVEMENT_IMMUTABLE';
    end if;

    if old.movement_at is not null and new.movement_at is distinct from old.movement_at then
      raise exception 'INVENTORY_MOVEMENT_IMMUTABLE';
    end if;

    if old.inventory_idempotency_key is not null
      and new.inventory_idempotency_key is distinct from old.inventory_idempotency_key then
      raise exception 'INVENTORY_MOVEMENT_IMMUTABLE';
    end if;

    if old.source_event_ref is not null and new.source_event_ref is distinct from old.source_event_ref then
      raise exception 'INVENTORY_MOVEMENT_IMMUTABLE';
    end if;

    if old.access_kind is not null and new.access_kind is distinct from old.access_kind then
      raise exception 'INVENTORY_MOVEMENT_IMMUTABLE';
    end if;

    if old.session_access_hash is not null
      and new.session_access_hash is distinct from old.session_access_hash then
      raise exception 'INVENTORY_MOVEMENT_IMMUTABLE';
    end if;

    if old.movement_origin is not null
      and new.movement_origin is distinct from old.movement_origin then
      raise exception 'INVENTORY_MOVEMENT_IMMUTABLE';
    end if;

    return new;
  end if;

  raise exception 'INVENTORY_MOVEMENT_IMMUTABLE';
end;
$$;

-- ---------------------------------------------------------------------------
-- Single-container legacy upgrade RPC
-- ---------------------------------------------------------------------------

create or replace function public.upgrade_fertilizer_legacy_container_to_inventory_core(
  p_container_id uuid,
  p_saved_product_profile_id uuid,
  p_access_kind text,
  p_user_id uuid,
  p_session_access_hash text,
  p_package_size_value numeric,
  p_package_size_unit text,
  p_base_unit text,
  p_creation_reason text,
  p_migration_key text,
  p_payload_fingerprint text,
  p_canonical_payload text,
  p_source_event_ref text,
  p_movement_upgrades jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_container public.fertilizer_containers%rowtype;
  v_profile public.product_profiles%rowtype;
  v_receipt public.fertilizer_inventory_migration_receipts%rowtype;
  v_migration_key text;
  v_source_event_ref text;
  v_fingerprint text;
  v_balance_before numeric;
  v_balance_after numeric;
  v_movement_count integer;
  v_upgrade_count integer;
  v_upgrade jsonb;
  v_movement public.fertilizer_stock_movements%rowtype;
  v_movement_id uuid;
  v_movement_at timestamptz;
  v_inventory_key text;
  v_source_ref text;
  v_movement_origin text;
  v_unit text;
  v_result jsonb;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_access_kind is null or p_access_kind not in ('authenticated_user', 'session') then
    raise exception 'INVALID_ACCESS_BINDING';
  end if;

  if p_access_kind = 'authenticated_user' then
    if p_user_id is null or p_user_id is distinct from auth.uid() then
      raise exception 'INVALID_ACCESS_BINDING';
    end if;

    if p_session_access_hash is not null then
      raise exception 'INVALID_ACCESS_BINDING';
    end if;
  else
    if p_user_id is not null then
      raise exception 'INVALID_ACCESS_BINDING';
    end if;

    if p_session_access_hash is null
      or length(p_session_access_hash) <> 64
      or p_session_access_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'INVALID_ACCESS_BINDING';
    end if;
  end if;

  v_migration_key := nullif(trim(p_migration_key), '');

  if v_migration_key is null or length(v_migration_key) > 256 then
    raise exception 'MIGRATION_RECEIPT_FINGERPRINT_MISMATCH';
  end if;

  if p_canonical_payload is null or trim(p_canonical_payload) = '' then
    raise exception 'MIGRATION_RECEIPT_FINGERPRINT_MISMATCH';
  end if;

  v_fingerprint := public._inventory_creation_compute_fingerprint(p_canonical_payload);

  if p_payload_fingerprint is null
    or trim(p_payload_fingerprint) = ''
    or v_fingerprint <> trim(p_payload_fingerprint) then
    raise exception 'MIGRATION_RECEIPT_FINGERPRINT_MISMATCH';
  end if;

  if p_creation_reason is null
    or p_creation_reason not in ('initial_stock', 'purchase', 'gift_received') then
    raise exception 'AMBIGUOUS_CREATION_REASON';
  end if;

  v_source_event_ref := nullif(trim(p_source_event_ref), '');

  if v_source_event_ref is not null and length(v_source_event_ref) > 256 then
    raise exception 'INVALID_PACKAGE_VALUE';
  end if;

  if p_package_size_value is null
    or p_package_size_value <= 0
    or p_package_size_value <> round(p_package_size_value, 4) then
    raise exception 'INVALID_PACKAGE_VALUE';
  end if;

  if p_package_size_unit is null
    or p_package_size_unit not in ('kg', 'ml') then
    raise exception 'UNSUPPORTED_PACKAGE_UNIT';
  end if;

  if p_base_unit is null
    or p_base_unit not in ('kg', 'ml')
    or p_base_unit <> p_package_size_unit then
    raise exception 'UNSUPPORTED_PACKAGE_UNIT';
  end if;

  if p_movement_upgrades is null or jsonb_typeof(p_movement_upgrades) <> 'array' then
    raise exception 'INVALID_MOVEMENT';
  end if;

  perform pg_advisory_xact_lock(
    public._legacy_migration_advisory_lock_key(p_container_id, v_migration_key)
  );

  select *
  into v_receipt
  from public.fertilizer_inventory_migration_receipts r
  where r.legacy_container_id = p_container_id
    and r.status = 'completed'
  for update;

  if found then
    if v_receipt.payload_fingerprint <> v_fingerprint then
      raise exception 'MIGRATION_RECEIPT_FINGERPRINT_MISMATCH';
    end if;

    if v_receipt.result_jsonb is not null then
      return v_receipt.result_jsonb;
    end if;
  end if;

  select *
  into v_receipt
  from public.fertilizer_inventory_migration_receipts r
  where r.migration_key = v_migration_key
  for update;

  if found and v_receipt.status = 'completed' then
    if v_receipt.payload_fingerprint <> v_fingerprint then
      raise exception 'MIGRATION_RECEIPT_FINGERPRINT_MISMATCH';
    end if;

    if v_receipt.result_jsonb is not null then
      return v_receipt.result_jsonb;
    end if;
  end if;

  select *
  into v_container
  from public.fertilizer_containers fc
  where fc.id = p_container_id
  for update;

  if not found then
    raise exception 'FOREIGN_OR_MISSING_CONTAINER';
  end if;

  if v_container.archived_at is not null then
    raise exception 'FOREIGN_OR_MISSING_CONTAINER';
  end if;

  if p_access_kind = 'authenticated_user' then
    if v_container.user_id is distinct from p_user_id then
      raise exception 'FOREIGN_OR_MISSING_CONTAINER';
    end if;
  end if;

  if v_container.saved_product_profile_id is not null
    and v_container.access_kind is not null
    and v_container.base_unit is not null
    and v_container.product_id is null
    and v_container.recognition_candidate_id is null then
    return jsonb_build_object(
      'container_id', p_container_id,
      'already_migrated', true,
      'migration_key', v_migration_key,
      'payload_fingerprint', v_fingerprint
    );
  end if;

  if v_container.product_id is not null and v_container.recognition_candidate_id is not null then
    raise exception 'LEGACY_AND_CORE_BINDING_CONFLICT';
  end if;

  if (v_container.product_id is not null or v_container.recognition_candidate_id is not null)
    and (
      v_container.saved_product_profile_id is not null
      or v_container.access_kind is not null
      or v_container.base_unit is not null
    ) then
    raise exception 'LEGACY_AND_CORE_BINDING_CONFLICT';
  end if;

  if v_container.product_id is null and v_container.recognition_candidate_id is null then
    raise exception 'LEGACY_AND_CORE_BINDING_CONFLICT';
  end if;

  select *
  into v_profile
  from public.product_profiles pp
  where pp.id = p_saved_product_profile_id;

  if not found then
    raise exception 'FOREIGN_OR_MISSING_SAVED_PROFILE';
  end if;

  if v_profile.profile_status <> 'saved' then
    raise exception 'INVALID_SAVED_PROFILE_STATUS';
  end if;

  if v_profile.source <> 'enrichment' then
    raise exception 'INVALID_SAVED_PROFILE_SOURCE';
  end if;

  if v_profile.access_kind is distinct from p_access_kind then
    raise exception 'INVALID_ACCESS_BINDING';
  end if;

  if p_access_kind = 'authenticated_user' then
    if v_profile.user_id is distinct from p_user_id then
      raise exception 'INVALID_ACCESS_BINDING';
    end if;
  elsif v_profile.session_access_hash is distinct from p_session_access_hash then
    raise exception 'INVALID_ACCESS_BINDING';
  end if;

  if v_profile.product_form = 'granular' and p_base_unit <> 'kg' then
    raise exception 'UNKNOWN_PRODUCT_FORM';
  end if;

  if v_profile.product_form = 'liquid' and p_base_unit <> 'ml' then
    raise exception 'UNKNOWN_PRODUCT_FORM';
  end if;

  if v_profile.product_form is null
    or v_profile.product_form not in ('granular', 'liquid') then
    raise exception 'UNKNOWN_PRODUCT_FORM';
  end if;

  if public._legacy_migration_detect_aggregation(p_container_id, v_container.product_id) then
    raise exception 'AGGREGATED_LEGACY_CONTAINER';
  end if;

  select count(*)
  into v_movement_count
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_container_id;

  v_upgrade_count := jsonb_array_length(p_movement_upgrades);

  if v_movement_count <> v_upgrade_count then
    raise exception 'INVALID_MOVEMENT';
  end if;

  select coalesce(sum(fsm.quantity_delta), 0)
  into v_balance_before
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_container_id;

  if v_balance_before < 0 then
    raise exception 'NEGATIVE_BALANCE';
  end if;

  perform public._legacy_migration_validate_creation_reason(p_container_id, p_creation_reason);

  for v_upgrade in
    select value
    from jsonb_array_elements(p_movement_upgrades)
  loop
    if jsonb_typeof(v_upgrade) <> 'object' then
      raise exception 'INVALID_MOVEMENT';
    end if;

    begin
      v_movement_id := (v_upgrade ->> 'movement_id')::uuid;
    exception
      when others then
        raise exception 'INVALID_MOVEMENT';
    end;

    select *
    into v_movement
    from public.fertilizer_stock_movements fsm
    where fsm.id = v_movement_id
      and fsm.container_id = p_container_id
    for update;

    if not found then
      raise exception 'INVALID_MOVEMENT';
    end if;

    v_unit := lower(trim(v_movement.unit));

    if v_unit not in ('kg', 'ml') then
      raise exception 'UNSUPPORTED_PACKAGE_UNIT';
    end if;

    if v_unit <> p_base_unit then
      raise exception 'CONFLICTING_MOVEMENT_UNITS';
    end if;

    if v_movement.quantity_delta is null
      or v_movement.quantity_delta = 0
      or v_movement.quantity_delta <> round(v_movement.quantity_delta, 4) then
      raise exception 'INVALID_MOVEMENT';
    end if;

    begin
      v_movement_at := (v_upgrade ->> 'movement_at')::timestamptz;
    exception
      when others then
        raise exception 'INVALID_MOVEMENT';
    end;

    if v_movement_at is null then
      raise exception 'INVALID_MOVEMENT';
    end if;

    v_inventory_key := nullif(trim(v_upgrade ->> 'inventory_idempotency_key'), '');

    if v_inventory_key is null or length(v_inventory_key) > 256 then
      raise exception 'INVALID_MOVEMENT';
    end if;

    v_source_ref := nullif(trim(v_upgrade ->> 'source_event_ref'), '');

    if v_source_ref is null or length(v_source_ref) > 256 then
      raise exception 'INVALID_MOVEMENT';
    end if;

    v_movement_origin := nullif(trim(v_upgrade ->> 'movement_origin'), '');

    if v_movement_origin is null
      or v_movement_origin not in ('manual', 'journal', 'system', 'migration') then
      raise exception 'INVALID_MOVEMENT';
    end if;

    if v_movement.movement_origin is not null then
      v_movement_origin := v_movement.movement_origin::text;
    end if;

    if v_movement.movement_at is not null
      and v_movement.access_kind is not null
      and v_movement.inventory_idempotency_key is not null then
      if v_movement.movement_at is distinct from v_movement_at
        or v_movement.inventory_idempotency_key is distinct from v_inventory_key
        or v_movement.source_event_ref is distinct from v_source_ref
        or v_movement.movement_origin::text is distinct from v_movement_origin then
        raise exception 'INVALID_MOVEMENT';
      end if;

      continue;
    end if;
  end loop;

  update public.fertilizer_containers
  set saved_product_profile_id = p_saved_product_profile_id,
      access_kind = p_access_kind,
      user_id = case when p_access_kind = 'authenticated_user' then p_user_id else null end,
      session_access_hash = case when p_access_kind = 'session' then p_session_access_hash else null end,
      base_unit = p_base_unit,
      package_size_value = p_package_size_value,
      package_size_unit = p_package_size_unit,
      product_id = null,
      recognition_candidate_id = null
  where id = p_container_id;

  perform set_config('greenkeeper.fertilizer_legacy_upgrade', '1', true);

  for v_upgrade in
    select value
    from jsonb_array_elements(p_movement_upgrades)
  loop
    v_movement_id := (v_upgrade ->> 'movement_id')::uuid;
    v_movement_at := (v_upgrade ->> 'movement_at')::timestamptz;
    v_inventory_key := nullif(trim(v_upgrade ->> 'inventory_idempotency_key'), '');
    v_source_ref := nullif(trim(v_upgrade ->> 'source_event_ref'), '');
    v_movement_origin := nullif(trim(v_upgrade ->> 'movement_origin'), '');

    select *
    into v_movement
    from public.fertilizer_stock_movements fsm
    where fsm.id = v_movement_id
      and fsm.container_id = p_container_id;

    if v_movement.movement_at is not null
      and v_movement.access_kind is not null
      and v_movement.inventory_idempotency_key is not null then
      continue;
    end if;

    if v_movement.movement_origin is not null then
      v_movement_origin := v_movement.movement_origin::text;
    end if;

    update public.fertilizer_stock_movements
    set access_kind = p_access_kind,
        user_id = case when p_access_kind = 'authenticated_user' then p_user_id else null end,
        session_access_hash = case when p_access_kind = 'session' then p_session_access_hash else null end,
        movement_at = coalesce(movement_at, v_movement_at),
        inventory_idempotency_key = coalesce(inventory_idempotency_key, v_inventory_key),
        source_event_ref = coalesce(source_event_ref, v_source_ref),
        movement_origin = coalesce(movement_origin, v_movement_origin::public.fertilizer_movement_origin)
    where id = v_movement_id
      and container_id = p_container_id
      and quantity_delta = v_movement.quantity_delta
      and unit = v_movement.unit
      and movement_type = v_movement.movement_type;
  end loop;

  select coalesce(sum(fsm.quantity_delta), 0)
  into v_balance_after
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_container_id
    and fsm.movement_at is not null;

  if v_balance_after < 0 then
    raise exception 'NEGATIVE_BALANCE';
  end if;

  if v_balance_after is distinct from v_balance_before then
    raise exception 'INVALID_MOVEMENT';
  end if;

  v_result := jsonb_build_object(
    'container_id', p_container_id,
    'migration_key', v_migration_key,
    'payload_fingerprint', v_fingerprint,
    'saved_product_profile_id', p_saved_product_profile_id,
    'creation_reason', p_creation_reason,
    'source_event_ref', v_source_event_ref,
    'already_migrated', false
  );

  insert into public.fertilizer_inventory_migration_receipts (
    legacy_container_id,
    migration_key,
    payload_fingerprint,
    status,
    result_jsonb,
    completed_at
  ) values (
    p_container_id,
    v_migration_key,
    v_fingerprint,
    'completed',
    v_result,
    v_now
  );

  return v_result;
exception
  when others then
    if sqlerrm in (
      'NOT_AUTHENTICATED',
      'FOREIGN_OR_MISSING_CONTAINER',
      'MIGRATION_RECEIPT_FINGERPRINT_MISMATCH',
      'CORE_BINDING_ALREADY_COMPLETE',
      'LEGACY_AND_CORE_BINDING_CONFLICT',
      'INVALID_ACCESS_BINDING',
      'FOREIGN_OR_MISSING_SAVED_PROFILE',
      'INVALID_SAVED_PROFILE_STATUS',
      'INVALID_SAVED_PROFILE_SOURCE',
      'UNKNOWN_PRODUCT_FORM',
      'UNSUPPORTED_PACKAGE_UNIT',
      'INVALID_PACKAGE_VALUE',
      'EXCESSIVE_PACKAGE_PRECISION',
      'CONFLICTING_MOVEMENT_UNITS',
      'INVALID_MOVEMENT',
      'NEGATIVE_BALANCE',
      'AMBIGUOUS_CREATION_REASON',
      'AGGREGATED_LEGACY_CONTAINER'
    ) then
      raise;
    end if;

    raise exception 'INVALID_MOVEMENT';
end;
$$;

revoke all on function public.upgrade_fertilizer_legacy_container_to_inventory_core(
  uuid,
  uuid,
  text,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public;

grant execute on function public.upgrade_fertilizer_legacy_container_to_inventory_core(
  uuid,
  uuid,
  text,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated, service_role;
