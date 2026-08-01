-- GA-014 Phase 7B — Atomic inventory creation from confirmed packages (additive)
-- DL-024..DL-029: one package = one item, initial positive movement only, no stored balance.
-- Receipt table is technical idempotency only — not inventory truth.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Technical creation receipt (request-scoped idempotency — not inventory truth)
-- ---------------------------------------------------------------------------

create table public.fertilizer_inventory_creation_receipts (
  id uuid primary key default gen_random_uuid(),
  access_kind text not null,
  user_id uuid null,
  session_access_hash text null,
  idempotency_key text not null,
  payload_fingerprint text not null,
  saved_product_profile_id uuid not null references public.product_profiles (id) on delete restrict,
  creation_reason text not null,
  source_event_ref text null,
  result_jsonb jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  constraint fertilizer_inventory_creation_receipts_access_kind_check
    check (access_kind in ('authenticated_user', 'session')),
  constraint fertilizer_inventory_creation_receipts_access_context_check
    check (
      (
        access_kind = 'authenticated_user'
        and user_id is not null
        and session_access_hash is null
      )
      or (
        access_kind = 'session'
        and user_id is null
        and session_access_hash is not null
      )
    ),
  constraint fertilizer_inventory_creation_receipts_session_hash_format_check
    check (
      access_kind is distinct from 'session'
      or (
        length(session_access_hash) = 64
        and session_access_hash ~ '^[0-9a-f]{64}$'
      )
    ),
  constraint fertilizer_inventory_creation_receipts_idempotency_key_nonempty_check
    check (idempotency_key <> ''),
  constraint fertilizer_inventory_creation_receipts_payload_fingerprint_nonempty_check
    check (payload_fingerprint <> ''),
  constraint fertilizer_inventory_creation_receipts_creation_reason_check
    check (creation_reason in ('initial_stock', 'purchase', 'gift_received'))
);

create unique index fertilizer_inventory_creation_receipts_auth_idempotency_idx
  on public.fertilizer_inventory_creation_receipts (user_id, idempotency_key)
  where access_kind = 'authenticated_user';

create unique index fertilizer_inventory_creation_receipts_session_idempotency_idx
  on public.fertilizer_inventory_creation_receipts (session_access_hash, idempotency_key)
  where access_kind = 'session';

comment on table public.fertilizer_inventory_creation_receipts is
  'Technical atomic-operation receipt for inventory creation idempotency — not inventory truth.';

alter table public.fertilizer_inventory_creation_receipts enable row level security;

revoke all on public.fertilizer_inventory_creation_receipts from public;
revoke all on public.fertilizer_inventory_creation_receipts from authenticated, anon;
grant all on public.fertilizer_inventory_creation_receipts to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public._inventory_creation_format_quantity(p_value numeric)
returns text
language plpgsql
immutable
as $$
declare
  v_scaled bigint;
begin
  if p_value is null or p_value <> round(p_value, 4) then
    raise exception 'INVENTORY_CREATION_PACKAGE_INVALID';
  end if;

  v_scaled := round(p_value * 10000)::bigint;

  if v_scaled % 10000 = 0 then
    return (v_scaled / 10000)::text;
  end if;

  return trim(trailing '0' from to_char(p_value, 'FM9999999990.9999'));
end;
$$;

create or replace function public._inventory_creation_compute_fingerprint(p_canonical_json text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(convert_to(p_canonical_json, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public._inventory_creation_advisory_lock_key(
  p_access_kind text,
  p_scope_id text,
  p_idempotency_key text
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
    'accessKind', p_access_kind,
    'scopeId', p_scope_id,
    'idempotencyKey', p_idempotency_key
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

create or replace function public._inventory_creation_movement_idempotency_key(
  p_receipt_id uuid,
  p_sequence_index integer
)
returns text
language sql
immutable
as $$
  select 'inventory-create:' || p_receipt_id::text || ':' || p_sequence_index::text;
$$;

-- ---------------------------------------------------------------------------
-- Atomic creation RPC
-- Idempotency: transaction-scoped advisory lock (scope + key) plus receipt
-- unique indexes and SELECT ... FOR UPDATE on the receipt row.
-- Advisory lock serializes parallel creation requests on the same scope +
-- idempotency key. Scoped unique indexes remain the final correctness boundary.
-- ---------------------------------------------------------------------------

create or replace function public.create_fertilizer_inventory_core_from_confirmed_packages(
  p_saved_product_profile_id uuid,
  p_access_kind text,
  p_user_id uuid,
  p_session_access_hash text,
  p_creation_reason text,
  p_idempotency_key text,
  p_source_event_ref text,
  p_packages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.product_profiles%rowtype;
  v_base_unit text;
  v_idempotency_key text;
  v_source_event_ref text;
  v_package_count integer;
  v_packages jsonb;
  v_pkg jsonb;
  v_seq integer;
  v_expected_seq integer;
  v_package_size numeric;
  v_initial_qty numeric;
  v_package_unit text;
  v_initial_unit text;
  v_client_correlation_id text;
  v_canonical_packages jsonb := '[]'::jsonb;
  v_access_context jsonb;
  v_canonical_json text;
  v_fingerprint text;
  v_receipt public.fertilizer_inventory_creation_receipts%rowtype;
  v_receipt_id uuid;
  v_now timestamptz;
  v_movement_date date;
  v_item_id uuid;
  v_movement_id uuid;
  v_movement_key text;
  v_item_row public.fertilizer_containers%rowtype;
  v_movement_row public.fertilizer_stock_movements%rowtype;
  v_result_packages jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  -- 1. Request and scope validation
  if p_access_kind is null or p_access_kind not in ('authenticated_user', 'session') then
    raise exception 'INVENTORY_CREATION_ACCESS_DENIED';
  end if;

  if p_access_kind = 'authenticated_user' and p_user_id is null then
    raise exception 'INVENTORY_CREATION_ACCESS_DENIED';
  end if;

  if p_access_kind = 'session'
    and (
      p_session_access_hash is null
      or length(p_session_access_hash) <> 64
      or p_session_access_hash !~ '^[0-9a-f]{64}$'
    ) then
    raise exception 'INVENTORY_CREATION_ACCESS_DENIED';
  end if;

  if auth.uid() is not null then
    if p_access_kind = 'authenticated_user' and p_user_id is distinct from auth.uid() then
      raise exception 'INVENTORY_CREATION_ACCESS_DENIED';
    end if;

    if p_access_kind = 'session' then
      raise exception 'INVENTORY_CREATION_ACCESS_DENIED';
    end if;
  end if;

  v_idempotency_key := nullif(trim(p_idempotency_key), '');

  if v_idempotency_key is null or length(v_idempotency_key) > 256 then
    raise exception 'INVENTORY_CREATION_IDEMPOTENCY_INVALID';
  end if;

  if p_creation_reason is null
    or p_creation_reason not in ('initial_stock', 'purchase', 'gift_received') then
    raise exception 'INVENTORY_CREATION_REASON_INVALID';
  end if;

  v_source_event_ref := nullif(trim(p_source_event_ref), '');

  if v_source_event_ref is not null and length(v_source_event_ref) > 256 then
    raise exception 'INVENTORY_CREATION_PACKAGE_INVALID';
  end if;

  -- 2. Package list structure
  if p_packages is null or jsonb_typeof(p_packages) <> 'array' then
    raise exception 'INVENTORY_CREATION_PACKAGE_LIST_EMPTY';
  end if;

  v_package_count := jsonb_array_length(p_packages);

  if v_package_count < 1 then
    raise exception 'INVENTORY_CREATION_PACKAGE_LIST_EMPTY';
  end if;

  if v_package_count > 20 then
    raise exception 'INVENTORY_CREATION_PACKAGE_COUNT_EXCEEDED';
  end if;

  -- Normalize packages: validate each element and build canonical package entries sorted by sequence_index
  v_packages := '[]'::jsonb;

  for v_seq in 0 .. (v_package_count - 1) loop
    v_pkg := p_packages -> v_seq;

    if v_pkg is null or jsonb_typeof(v_pkg) <> 'object' then
      raise exception 'INVENTORY_CREATION_PACKAGE_INVALID';
    end if;

    if v_pkg ? 'sequence_index' is false then
      raise exception 'INVENTORY_CREATION_PACKAGE_INVALID';
    end if;

    begin
      v_expected_seq := (v_pkg ->> 'sequence_index')::integer;
    exception
      when others then
        raise exception 'INVENTORY_CREATION_PACKAGE_INVALID';
    end;

    if v_expected_seq <> v_seq then
      raise exception 'INVENTORY_CREATION_PACKAGE_INVALID';
    end if;

    begin
      v_package_size := (v_pkg ->> 'package_size_value')::numeric;
    exception
      when others then
        raise exception 'INVENTORY_CREATION_PACKAGE_SIZE_INVALID';
    end;

    if v_package_size is null or v_package_size <= 0 then
      raise exception 'INVENTORY_CREATION_PACKAGE_SIZE_INVALID';
    end if;

    if v_package_size <> round(v_package_size, 4) then
      raise exception 'INVENTORY_CREATION_PACKAGE_SIZE_INVALID';
    end if;

    begin
      v_initial_qty := (v_pkg ->> 'initial_quantity_value')::numeric;
    exception
      when others then
        raise exception 'INVENTORY_CREATION_INITIAL_QUANTITY_INVALID';
    end;

    if v_initial_qty is null or v_initial_qty <= 0 then
      raise exception 'INVENTORY_CREATION_INITIAL_QUANTITY_INVALID';
    end if;

    if v_initial_qty <> round(v_initial_qty, 4) then
      raise exception 'INVENTORY_CREATION_INITIAL_QUANTITY_INVALID';
    end if;

    if v_initial_qty > v_package_size then
      raise exception 'INVENTORY_CREATION_INITIAL_QUANTITY_EXCEEDS_PACKAGE_SIZE';
    end if;

    v_package_unit := v_pkg ->> 'package_size_unit';
    v_initial_unit := v_pkg ->> 'initial_quantity_unit';

    if v_package_unit is null
      or v_initial_unit is null
      or v_package_unit not in ('kg', 'ml')
      or v_initial_unit not in ('kg', 'ml') then
      raise exception 'INVENTORY_CREATION_UNIT_MISMATCH';
    end if;

    if v_package_unit <> v_initial_unit then
      raise exception 'INVENTORY_CREATION_UNIT_MISMATCH';
    end if;

    if v_pkg ? 'client_correlation_id' then
      if jsonb_typeof(v_pkg -> 'client_correlation_id') = 'null' then
        v_client_correlation_id := null;
      elsif jsonb_typeof(v_pkg -> 'client_correlation_id') = 'string' then
        v_client_correlation_id := nullif(trim(v_pkg ->> 'client_correlation_id'), '');

        if v_client_correlation_id is not null and length(v_client_correlation_id) > 128 then
          raise exception 'INVENTORY_CREATION_PACKAGE_INVALID';
        end if;
      else
        raise exception 'INVENTORY_CREATION_PACKAGE_INVALID';
      end if;
    else
      v_client_correlation_id := null;
    end if;

    v_canonical_packages := v_canonical_packages || jsonb_build_array(
      jsonb_build_object(
        'sequenceIndex', v_expected_seq,
        'packageSizeValue', public._inventory_creation_format_quantity(v_package_size),
        'packageSizeUnit', v_package_unit,
        'initialQuantityValue', public._inventory_creation_format_quantity(v_initial_qty),
        'initialQuantityUnit', v_initial_unit,
        'clientCorrelationId', v_client_correlation_id
      )
    );

    v_packages := v_packages || jsonb_build_array(
      jsonb_build_object(
        'sequence_index', v_expected_seq,
        'package_size_value', v_package_size,
        'package_size_unit', v_package_unit,
        'initial_quantity_value', v_initial_qty,
        'initial_quantity_unit', v_initial_unit,
        'client_correlation_id', v_client_correlation_id
      )
    );
  end loop;

  -- 4–6. Product profile (saved enrichment-only) and access
  select *
  into v_profile
  from public.product_profiles pp
  where pp.id = p_saved_product_profile_id;

  if not found then
    raise exception 'INVENTORY_CREATION_PRODUCT_PROFILE_NOT_FOUND';
  end if;

  if v_profile.profile_status <> 'saved' or v_profile.source <> 'enrichment' then
    raise exception 'INVENTORY_CREATION_PRODUCT_PROFILE_NOT_READY';
  end if;

  if v_profile.access_kind is distinct from p_access_kind then
    raise exception 'INVENTORY_CREATION_ACCESS_DENIED';
  end if;

  if p_access_kind = 'authenticated_user' then
    if v_profile.user_id is distinct from p_user_id then
      raise exception 'INVENTORY_CREATION_ACCESS_DENIED';
    end if;
  elsif v_profile.session_access_hash is distinct from p_session_access_hash then
    raise exception 'INVENTORY_CREATION_ACCESS_DENIED';
  end if;

  -- 7–8. Authoritative base unit from product form
  if v_profile.product_form = 'granular' then
    v_base_unit := 'kg';
  elsif v_profile.product_form = 'liquid' then
    v_base_unit := 'ml';
  else
    raise exception 'INVENTORY_CREATION_PRODUCT_PROFILE_NOT_READY';
  end if;

  -- 9. Package units against base unit
  for v_seq in 0 .. (v_package_count - 1) loop
    v_pkg := v_packages -> v_seq;

    if (v_pkg ->> 'package_size_unit') <> v_base_unit then
      raise exception 'INVENTORY_CREATION_UNIT_MISMATCH';
    end if;
  end loop;

  -- 11–12. Canonical payload and SHA-256 fingerprint (authoritative — no client hash)
  if p_access_kind = 'authenticated_user' then
    v_access_context := jsonb_build_object(
      'kind', 'authenticated_user',
      'userId', p_user_id::text
    );
  else
    v_access_context := jsonb_build_object(
      'kind', 'session',
      'sessionAccessHash', p_session_access_hash
    );
  end if;

  v_canonical_json := jsonb_build_object(
    'savedProductProfileId', lower(p_saved_product_profile_id::text),
    'accessContext', v_access_context,
    'creationReason', p_creation_reason,
    'sourceEventRef', v_source_event_ref,
    'packages', v_canonical_packages
  )::text;

  v_fingerprint := public._inventory_creation_compute_fingerprint(v_canonical_json);

  -- 13. Request-scoped idempotency: advisory lock prevents parallel duplicate creation.
  -- Advisory lock serializes parallel creation requests on the same scope +
  -- idempotency key. Scoped unique indexes remain the final correctness boundary.
  perform pg_advisory_xact_lock(
    public._inventory_creation_advisory_lock_key(
      p_access_kind,
      coalesce(p_user_id::text, p_session_access_hash),
      v_idempotency_key
    )
  );

  if p_access_kind = 'authenticated_user' then
    select *
    into v_receipt
    from public.fertilizer_inventory_creation_receipts r
    where r.access_kind = 'authenticated_user'
      and r.user_id = p_user_id
      and r.idempotency_key = v_idempotency_key
    for update;
  else
    select *
    into v_receipt
    from public.fertilizer_inventory_creation_receipts r
    where r.access_kind = 'session'
      and r.session_access_hash = p_session_access_hash
      and r.idempotency_key = v_idempotency_key
    for update;
  end if;

  if found then
    if v_receipt.payload_fingerprint <> v_fingerprint then
      raise exception 'INVENTORY_CREATION_IDEMPOTENCY_CONFLICT';
    end if;

    if v_receipt.result_jsonb is not null then
      return v_receipt.result_jsonb;
    end if;
  else
    begin
      insert into public.fertilizer_inventory_creation_receipts (
        access_kind,
        user_id,
        session_access_hash,
        idempotency_key,
        payload_fingerprint,
        saved_product_profile_id,
        creation_reason,
        source_event_ref
      ) values (
        p_access_kind,
        case when p_access_kind = 'authenticated_user' then p_user_id else null end,
        case when p_access_kind = 'session' then p_session_access_hash else null end,
        v_idempotency_key,
        v_fingerprint,
        p_saved_product_profile_id,
        p_creation_reason,
        v_source_event_ref
      )
      returning * into v_receipt;
    exception
      when unique_violation then
        if p_access_kind = 'authenticated_user' then
          select *
          into v_receipt
          from public.fertilizer_inventory_creation_receipts r
          where r.access_kind = 'authenticated_user'
            and r.user_id = p_user_id
            and r.idempotency_key = v_idempotency_key
          for update;
        else
          select *
          into v_receipt
          from public.fertilizer_inventory_creation_receipts r
          where r.access_kind = 'session'
            and r.session_access_hash = p_session_access_hash
            and r.idempotency_key = v_idempotency_key
          for update;
        end if;

        if not found then
          raise exception 'INVENTORY_CREATION_FAILED';
        end if;

        if v_receipt.payload_fingerprint <> v_fingerprint then
          raise exception 'INVENTORY_CREATION_IDEMPOTENCY_CONFLICT';
        end if;

        if v_receipt.result_jsonb is not null then
          return v_receipt.result_jsonb;
        end if;
    end;
  end if;

  v_receipt_id := v_receipt.id;
  v_now := timezone('utc', now());
  v_movement_date := (v_now at time zone 'UTC')::date;

  -- 14–16. One item and one initial movement per package (same transaction — full rollback on error)
  for v_seq in 0 .. (v_package_count - 1) loop
    v_pkg := v_packages -> v_seq;
    v_item_id := gen_random_uuid();
    v_movement_id := gen_random_uuid();
    v_movement_key := public._inventory_creation_movement_idempotency_key(
      v_receipt_id,
      (v_pkg ->> 'sequence_index')::integer
    );

    insert into public.fertilizer_containers (
      id,
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
      created_at,
      archived_at
    ) values (
      v_item_id,
      case when p_access_kind = 'authenticated_user' then p_user_id else null end,
      null,
      null,
      p_saved_product_profile_id,
      p_access_kind,
      case when p_access_kind = 'session' then p_session_access_hash else null end,
      v_base_unit,
      (v_pkg ->> 'package_size_value')::numeric,
      v_pkg ->> 'package_size_unit',
      null,
      v_now,
      null
    )
    returning * into v_item_row;

    insert into public.fertilizer_stock_movements (
      id,
      user_id,
      container_id,
      access_kind,
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
      case when p_access_kind = 'authenticated_user' then p_user_id else null end,
      v_item_id,
      p_access_kind,
      case when p_access_kind = 'session' then p_session_access_hash else null end,
      (v_pkg ->> 'initial_quantity_value')::numeric,
      v_base_unit,
      p_creation_reason::public.fertilizer_movement_type,
      'manual'::public.fertilizer_movement_origin,
      v_now,
      v_movement_date,
      v_movement_key,
      v_source_event_ref,
      null,
      v_now,
      null
    )
    returning * into v_movement_row;

    v_result_packages := v_result_packages || jsonb_build_array(
      jsonb_build_object(
        'sequence_index', (v_pkg ->> 'sequence_index')::integer,
        'client_correlation_id', v_pkg -> 'client_correlation_id',
        'item', to_jsonb(v_item_row),
        'initial_movement', to_jsonb(v_movement_row)
      )
    );
  end loop;

  v_result := jsonb_build_object(
    'operation_id', v_receipt_id,
    'idempotency_key', v_idempotency_key,
    'packages', v_result_packages
  );

  update public.fertilizer_inventory_creation_receipts
  set result_jsonb = v_result,
      completed_at = v_now
  where id = v_receipt_id;

  return v_result;
exception
  when others then
    if sqlerrm like 'INVENTORY_CREATION_%' then
      raise;
    end if;

    raise exception 'INVENTORY_CREATION_FAILED';
end;
$$;

revoke all on function public.create_fertilizer_inventory_core_from_confirmed_packages(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) from public;

grant execute on function public.create_fertilizer_inventory_core_from_confirmed_packages(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated, service_role;
