-- GA-015 Phase 2 — Product-based fertilizer stock intake (additive)
-- Canonical identity: (user_id, saved_product_profile_id, base_unit) for stock_kind = product_stock.
-- Legacy rows unchanged; no data migration.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- fertilizer_containers — stock_kind (legacy vs product_stock)
-- ---------------------------------------------------------------------------

alter table public.fertilizer_containers
  add column if not exists stock_kind text;

alter table public.fertilizer_containers
  drop constraint if exists fertilizer_containers_stock_kind_check;

alter table public.fertilizer_containers
  add constraint fertilizer_containers_stock_kind_check
    check (
      stock_kind is null
      or stock_kind in ('legacy_container', 'product_stock')
    );

comment on column public.fertilizer_containers.stock_kind is
  'NULL or legacy_container = historical/package path; product_stock = canonical product-based stock (GA-015).';

create unique index if not exists fertilizer_containers_product_stock_active_unique_idx
  on public.fertilizer_containers (user_id, saved_product_profile_id, base_unit)
  where stock_kind = 'product_stock'
    and archived_at is null
    and saved_product_profile_id is not null
    and base_unit is not null
    and access_kind = 'authenticated_user';

-- ---------------------------------------------------------------------------
-- Intake receipt (request-scoped idempotency — not inventory truth)
-- ---------------------------------------------------------------------------

create table if not exists public.fertilizer_product_stock_intake_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  payload_fingerprint text not null,
  saved_product_profile_id uuid not null references public.product_profiles (id) on delete restrict,
  base_unit text not null,
  intake_reason text not null,
  quantity numeric(18, 4) not null,
  source_event_ref text null,
  note text null,
  container_id uuid null references public.fertilizer_containers (id) on delete restrict,
  movement_id uuid null references public.fertilizer_stock_movements (id) on delete restrict,
  result_jsonb jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  constraint fertilizer_product_stock_intake_receipts_idempotency_key_nonempty_check
    check (idempotency_key <> ''),
  constraint fertilizer_product_stock_intake_receipts_payload_fingerprint_nonempty_check
    check (payload_fingerprint <> ''),
  constraint fertilizer_product_stock_intake_receipts_base_unit_check
    check (base_unit in ('kg', 'ml')),
  constraint fertilizer_product_stock_intake_receipts_intake_reason_check
    check (intake_reason in ('initial_stock', 'purchase', 'gift_received')),
  constraint fertilizer_product_stock_intake_receipts_quantity_positive_check
    check (quantity > 0)
);

create unique index if not exists fertilizer_product_stock_intake_receipts_user_idempotency_idx
  on public.fertilizer_product_stock_intake_receipts (user_id, idempotency_key);

comment on table public.fertilizer_product_stock_intake_receipts is
  'Technical atomic-operation receipt for product-stock intake idempotency — not inventory truth.';

alter table public.fertilizer_product_stock_intake_receipts enable row level security;

revoke all on public.fertilizer_product_stock_intake_receipts from public;
revoke all on public.fertilizer_product_stock_intake_receipts from authenticated, anon;
grant all on public.fertilizer_product_stock_intake_receipts to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public._product_stock_intake_format_quantity(p_value numeric)
returns text
language plpgsql
immutable
as $$
declare
  v_scaled bigint;
begin
  if p_value is null or p_value <> round(p_value, 4) then
    raise exception 'INVENTORY_INTAKE_QUANTITY_INVALID';
  end if;

  v_scaled := round(p_value * 10000)::bigint;

  if v_scaled % 10000 = 0 then
    return (v_scaled / 10000)::text;
  end if;

  return trim(trailing '0' from to_char(p_value, 'FM9999999990.9999'));
end;
$$;

create or replace function public._product_stock_intake_compute_fingerprint(p_canonical_json text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(convert_to(p_canonical_json, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public._product_stock_intake_advisory_lock_key(
  p_user_id uuid,
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
    'userId', p_user_id::text,
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

create or replace function public._product_stock_intake_movement_idempotency_key(p_receipt_id uuid)
returns text
language sql
immutable
as $$
  select 'product-stock-intake:' || p_receipt_id::text;
$$;

-- ---------------------------------------------------------------------------
-- Atomic product-stock intake RPC
-- ---------------------------------------------------------------------------

create or replace function public.record_fertilizer_product_stock_intake(
  p_saved_product_profile_id uuid,
  p_base_unit text,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text,
  p_movement_at timestamptz default null,
  p_source_event_ref text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_profile public.product_profiles%rowtype;
  v_idempotency_key text;
  v_source_event_ref text;
  v_note text;
  v_quantity numeric;
  v_canonical_json text;
  v_fingerprint text;
  v_receipt public.fertilizer_product_stock_intake_receipts%rowtype;
  v_receipt_id uuid;
  v_item public.fertilizer_containers%rowtype;
  v_item_created boolean := false;
  v_movement jsonb;
  v_movement_row public.fertilizer_stock_movements%rowtype;
  v_movement_key text;
  v_movement_at timestamptz;
  v_result jsonb;
  v_replay boolean := false;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'INVENTORY_INTAKE_ACCESS_DENIED';
  end if;

  v_idempotency_key := nullif(trim(p_idempotency_key), '');

  if v_idempotency_key is null or length(v_idempotency_key) > 256 then
    raise exception 'INVENTORY_INTAKE_IDEMPOTENCY_INVALID';
  end if;

  if p_reason is null
    or p_reason not in ('initial_stock', 'purchase', 'gift_received') then
    raise exception 'INVENTORY_INTAKE_REASON_INVALID';
  end if;

  if p_base_unit is null or p_base_unit not in ('kg', 'ml') then
    raise exception 'INVENTORY_INTAKE_UNIT_MISMATCH';
  end if;

  begin
    v_quantity := p_quantity::numeric;
  exception
    when others then
      raise exception 'INVENTORY_INTAKE_QUANTITY_INVALID';
  end;

  if v_quantity is null or not (v_quantity > 0) or not (v_quantity = v_quantity) then
    raise exception 'INVENTORY_INTAKE_QUANTITY_INVALID';
  end if;

  if v_quantity <> round(v_quantity, 4) then
    raise exception 'INVENTORY_INTAKE_QUANTITY_INVALID';
  end if;

  if abs(v_quantity) > 100000 then
    raise exception 'INVENTORY_INTAKE_QUANTITY_INVALID';
  end if;

  v_source_event_ref := nullif(trim(p_source_event_ref), '');

  if v_source_event_ref is not null and length(v_source_event_ref) > 256 then
    raise exception 'INVENTORY_INTAKE_QUANTITY_INVALID';
  end if;

  v_note := nullif(trim(p_note), '');

  if v_note is not null and length(v_note) > 1024 then
    raise exception 'INVENTORY_INTAKE_QUANTITY_INVALID';
  end if;

  select *
  into v_profile
  from public.product_profiles pp
  where pp.id = p_saved_product_profile_id;

  if not found then
    raise exception 'INVENTORY_INTAKE_PRODUCT_PROFILE_NOT_FOUND';
  end if;

  if v_profile.profile_status <> 'saved' or v_profile.source <> 'enrichment' then
    raise exception 'INVENTORY_INTAKE_PRODUCT_PROFILE_NOT_READY';
  end if;

  if v_profile.access_kind <> 'authenticated_user' then
    raise exception 'INVENTORY_INTAKE_ACCESS_DENIED';
  end if;

  if v_profile.user_id is distinct from v_user_id then
    raise exception 'INVENTORY_INTAKE_ACCESS_DENIED';
  end if;

  if v_profile.product_form = 'granular' and p_base_unit <> 'kg' then
    raise exception 'INVENTORY_INTAKE_UNIT_MISMATCH';
  end if;

  if v_profile.product_form = 'liquid' and p_base_unit <> 'ml' then
    raise exception 'INVENTORY_INTAKE_UNIT_MISMATCH';
  end if;

  v_movement_at := coalesce(p_movement_at, timezone('utc', now()));

  v_canonical_json := jsonb_build_object(
    'savedProductProfileId', p_saved_product_profile_id::text,
    'baseUnit', p_base_unit,
    'quantity', public._product_stock_intake_format_quantity(v_quantity),
    'reason', p_reason,
    'sourceEventRef', v_source_event_ref,
    'note', v_note,
    'movementAt', to_char(v_movement_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )::text;

  v_fingerprint := public._product_stock_intake_compute_fingerprint(v_canonical_json);

  perform pg_advisory_xact_lock(
    public._product_stock_intake_advisory_lock_key(v_user_id, v_idempotency_key)
  );

  begin
    insert into public.fertilizer_product_stock_intake_receipts (
      user_id,
      idempotency_key,
      payload_fingerprint,
      saved_product_profile_id,
      base_unit,
      intake_reason,
      quantity,
      source_event_ref,
      note
    ) values (
      v_user_id,
      v_idempotency_key,
      v_fingerprint,
      p_saved_product_profile_id,
      p_base_unit,
      p_reason,
      v_quantity,
      v_source_event_ref,
      v_note
    )
    returning * into v_receipt;
  exception
    when unique_violation then
      select *
      into v_receipt
      from public.fertilizer_product_stock_intake_receipts r
      where r.user_id = v_user_id
        and r.idempotency_key = v_idempotency_key
      for update;

      if not found then
        raise exception 'INVENTORY_INTAKE_FAILED';
      end if;

      if v_receipt.payload_fingerprint <> v_fingerprint then
        raise exception 'INVENTORY_INTAKE_IDEMPOTENCY_CONFLICT';
      end if;

      if v_receipt.result_jsonb is not null then
        v_replay := true;
        return v_receipt.result_jsonb;
      end if;
  end;

  v_receipt_id := v_receipt.id;
  v_movement_key := public._product_stock_intake_movement_idempotency_key(v_receipt_id);

  select *
  into v_item
  from public.fertilizer_containers fc
  where fc.user_id = v_user_id
    and fc.saved_product_profile_id = p_saved_product_profile_id
    and fc.base_unit = p_base_unit
    and fc.stock_kind = 'product_stock'
    and fc.archived_at is null
    and fc.access_kind = 'authenticated_user'
  for update;

  if not found then
    begin
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
        v_user_id,
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
        v_item_created := true;
      else
        select *
        into v_item
        from public.fertilizer_containers fc
        where fc.user_id = v_user_id
          and fc.saved_product_profile_id = p_saved_product_profile_id
          and fc.base_unit = p_base_unit
          and fc.stock_kind = 'product_stock'
          and fc.archived_at is null
          and fc.access_kind = 'authenticated_user'
        for update;

        if not found then
          raise exception 'INVENTORY_INTAKE_FAILED';
        end if;
      end if;
    exception
      when unique_violation then
        select *
        into v_item
        from public.fertilizer_containers fc
        where fc.user_id = v_user_id
          and fc.saved_product_profile_id = p_saved_product_profile_id
          and fc.base_unit = p_base_unit
          and fc.stock_kind = 'product_stock'
          and fc.archived_at is null
          and fc.access_kind = 'authenticated_user'
        for update;

        if not found then
          raise exception 'INVENTORY_INTAKE_FAILED';
        end if;
    end;
  end if;

  v_movement := public.append_fertilizer_inventory_core_movement(
    v_item.id,
    'authenticated_user',
    v_user_id,
    null,
    v_quantity,
    p_base_unit,
    p_reason,
    'manual',
    v_movement_at,
    v_movement_key,
    v_source_event_ref,
    v_note,
    null,
    null
  );

  v_movement_row := jsonb_populate_record(null::public.fertilizer_stock_movements, v_movement);

  v_result := jsonb_build_object(
    'operation_id', v_receipt_id,
    'idempotency_key', v_idempotency_key,
    'inventory_item_id', v_item.id,
    'movement_id', v_movement_row.id,
    'saved_product_profile_id', p_saved_product_profile_id,
    'base_unit', p_base_unit,
    'quantity_delta', v_quantity,
    'reason', p_reason,
    'movement_at', v_movement_row.movement_at,
    'item_created', v_item_created,
    'idempotency_replay', v_replay
  );

  update public.fertilizer_product_stock_intake_receipts
  set
    container_id = v_item.id,
    movement_id = v_movement_row.id,
    result_jsonb = v_result,
    completed_at = timezone('utc', now())
  where id = v_receipt_id;

  return v_result;
end;
$$;

revoke all on function public.record_fertilizer_product_stock_intake(
  uuid,
  text,
  numeric,
  text,
  text,
  timestamptz,
  text,
  text
) from public;

grant execute on function public.record_fertilizer_product_stock_intake(
  uuid,
  text,
  numeric,
  text,
  text,
  timestamptz,
  text,
  text
) to authenticated, service_role;
