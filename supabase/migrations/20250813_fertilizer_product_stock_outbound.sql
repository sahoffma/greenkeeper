-- GA-015 Phase 6 — Product-based fertilizer stock outbound (additive)
-- Real outflows and inventory corrections on canonical product_stock items only.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Outbound receipt (request-scoped idempotency — not inventory truth)
-- ---------------------------------------------------------------------------

create table if not exists public.fertilizer_product_stock_outbound_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  payload_fingerprint text not null,
  inventory_item_id uuid not null references public.fertilizer_containers (id) on delete restrict,
  outbound_reason text not null,
  quantity_delta numeric(18, 4) not null,
  note text null,
  movement_id uuid null references public.fertilizer_stock_movements (id) on delete restrict,
  result_jsonb jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  constraint fertilizer_product_stock_outbound_receipts_idempotency_key_nonempty_check
    check (idempotency_key <> ''),
  constraint fertilizer_product_stock_outbound_receipts_payload_fingerprint_nonempty_check
    check (payload_fingerprint <> ''),
  constraint fertilizer_product_stock_outbound_receipts_outbound_reason_check
    check (outbound_reason in ('gift_given', 'disposed', 'inventory_correction')),
  constraint fertilizer_product_stock_outbound_receipts_quantity_delta_nonzero_check
    check (quantity_delta <> 0)
);

create unique index if not exists fertilizer_product_stock_outbound_receipts_user_idempotency_idx
  on public.fertilizer_product_stock_outbound_receipts (user_id, idempotency_key);

comment on table public.fertilizer_product_stock_outbound_receipts is
  'Technical atomic-operation receipt for product-stock outbound idempotency — not inventory truth.';

alter table public.fertilizer_product_stock_outbound_receipts enable row level security;

revoke all on public.fertilizer_product_stock_outbound_receipts from public;
revoke all on public.fertilizer_product_stock_outbound_receipts from authenticated, anon;
grant all on public.fertilizer_product_stock_outbound_receipts to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public._product_stock_outbound_format_quantity(p_value numeric)
returns text
language plpgsql
immutable
as $$
declare
  v_scaled bigint;
begin
  if p_value is null or p_value <> round(p_value, 4) then
    raise exception 'INVENTORY_OUTBOUND_QUANTITY_INVALID';
  end if;

  v_scaled := round(p_value * 10000)::bigint;

  if v_scaled % 10000 = 0 then
    return (v_scaled / 10000)::text;
  end if;

  return trim(trailing '0' from to_char(p_value, 'FM9999999990.9999'));
end;
$$;

create or replace function public._product_stock_outbound_compute_fingerprint(p_canonical_json text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(convert_to(p_canonical_json, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public._product_stock_outbound_advisory_lock_key(
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

create or replace function public._product_stock_outbound_movement_idempotency_key(p_receipt_id uuid)
returns text
language sql
immutable
as $$
  select 'product-stock-outbound:' || p_receipt_id::text;
$$;

create or replace function public._product_stock_outbound_map_reason_to_movement_type(p_reason text)
returns text
language sql
immutable
as $$
  select case p_reason
    when 'gift_given' then 'gifted_away'
    when 'disposed' then 'disposal'
    when 'inventory_correction' then 'inventory_correction'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic product-stock outbound RPC
-- ---------------------------------------------------------------------------

create or replace function public.record_fertilizer_product_stock_outbound(
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text,
  p_movement_at timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_idempotency_key text;
  v_note text;
  v_quantity numeric;
  v_quantity_delta numeric;
  v_movement_type text;
  v_canonical_json text;
  v_fingerprint text;
  v_receipt public.fertilizer_product_stock_outbound_receipts%rowtype;
  v_receipt_id uuid;
  v_item public.fertilizer_containers%rowtype;
  v_movement jsonb;
  v_movement_row public.fertilizer_stock_movements%rowtype;
  v_movement_key text;
  v_movement_at timestamptz;
  v_result jsonb;
  v_replay boolean := false;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'INVENTORY_OUTBOUND_ACCESS_DENIED';
  end if;

  v_idempotency_key := nullif(trim(p_idempotency_key), '');

  if v_idempotency_key is null or length(v_idempotency_key) > 256 then
    raise exception 'INVENTORY_OUTBOUND_IDEMPOTENCY_INVALID';
  end if;

  if p_reason is null
    or p_reason not in ('gift_given', 'disposed', 'inventory_correction') then
    raise exception 'INVENTORY_OUTBOUND_REASON_INVALID';
  end if;

  begin
    v_quantity := p_quantity::numeric;
  exception
    when others then
      raise exception 'INVENTORY_OUTBOUND_QUANTITY_INVALID';
  end;

  if v_quantity is null or not (v_quantity = v_quantity) then
    raise exception 'INVENTORY_OUTBOUND_QUANTITY_INVALID';
  end if;

  if p_reason = 'inventory_correction' then
    if v_quantity = 0 or v_quantity <> round(v_quantity, 4) then
      raise exception 'INVENTORY_OUTBOUND_QUANTITY_INVALID';
    end if;

    v_quantity_delta := v_quantity;
  else
    if not (v_quantity > 0) or v_quantity <> round(v_quantity, 4) then
      raise exception 'INVENTORY_OUTBOUND_QUANTITY_INVALID';
    end if;

    v_quantity_delta := -v_quantity;
  end if;

  if abs(v_quantity_delta) > 100000 then
    raise exception 'INVENTORY_OUTBOUND_QUANTITY_INVALID';
  end if;

  v_movement_type := public._product_stock_outbound_map_reason_to_movement_type(p_reason);

  if v_movement_type is null then
    raise exception 'INVENTORY_OUTBOUND_REASON_INVALID';
  end if;

  v_note := nullif(trim(p_note), '');

  if v_note is not null and length(v_note) > 1024 then
    raise exception 'INVENTORY_OUTBOUND_QUANTITY_INVALID';
  end if;

  select *
  into v_item
  from public.fertilizer_containers fc
  where fc.id = p_inventory_item_id;

  if not found then
    raise exception 'INVENTORY_OUTBOUND_ITEM_NOT_FOUND';
  end if;

  if v_item.user_id is distinct from v_user_id then
    raise exception 'INVENTORY_OUTBOUND_ACCESS_DENIED';
  end if;

  if v_item.stock_kind is distinct from 'product_stock'
    or v_item.archived_at is not null
    or v_item.superseded_by_container_id is not null
    or v_item.access_kind <> 'authenticated_user'
    or v_item.saved_product_profile_id is null
    or v_item.base_unit is null then
    raise exception 'INVENTORY_OUTBOUND_ITEM_INACTIVE';
  end if;

  v_movement_at := coalesce(p_movement_at, timezone('utc', now()));

  if p_movement_at is not null then
    v_canonical_json := jsonb_build_object(
      'inventoryItemId', p_inventory_item_id::text,
      'reason', p_reason,
      'quantity', public._product_stock_outbound_format_quantity(v_quantity),
      'note', v_note,
      'movementAt', to_char(p_movement_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )::text;
  else
    v_canonical_json := jsonb_build_object(
      'inventoryItemId', p_inventory_item_id::text,
      'reason', p_reason,
      'quantity', public._product_stock_outbound_format_quantity(v_quantity),
      'note', v_note
    )::text;
  end if;

  v_fingerprint := public._product_stock_outbound_compute_fingerprint(v_canonical_json);

  perform pg_advisory_xact_lock(
    public._product_stock_outbound_advisory_lock_key(v_user_id, v_idempotency_key)
  );

  begin
    insert into public.fertilizer_product_stock_outbound_receipts (
      user_id,
      idempotency_key,
      payload_fingerprint,
      inventory_item_id,
      outbound_reason,
      quantity_delta,
      note
    ) values (
      v_user_id,
      v_idempotency_key,
      v_fingerprint,
      p_inventory_item_id,
      p_reason,
      v_quantity_delta,
      v_note
    )
    returning * into v_receipt;
  exception
    when unique_violation then
      select *
      into v_receipt
      from public.fertilizer_product_stock_outbound_receipts r
      where r.user_id = v_user_id
        and r.idempotency_key = v_idempotency_key
      for update;

      if not found then
        raise exception 'INVENTORY_OUTBOUND_FAILED';
      end if;

      if v_receipt.payload_fingerprint <> v_fingerprint then
        raise exception 'INVENTORY_OUTBOUND_IDEMPOTENCY_CONFLICT';
      end if;

      if v_receipt.result_jsonb is not null then
        return v_receipt.result_jsonb || jsonb_build_object('idempotency_replay', true);
      end if;
  end;

  v_receipt_id := v_receipt.id;
  v_movement_key := public._product_stock_outbound_movement_idempotency_key(v_receipt_id);

  begin
    v_movement := public.append_fertilizer_inventory_core_movement(
      v_item.id,
      'authenticated_user',
      v_user_id,
      null,
      v_quantity_delta,
      v_item.base_unit,
      v_movement_type,
      'manual',
      v_movement_at,
      v_movement_key,
      null,
      v_note,
      null,
      null
    );
  exception
    when others then
      if sqlerrm like '%INVENTORY_NEGATIVE_BALANCE%' then
        raise exception 'INVENTORY_OUTBOUND_INSUFFICIENT_STOCK';
      end if;

      raise;
  end;

  v_movement_row := jsonb_populate_record(null::public.fertilizer_stock_movements, v_movement);

  v_result := jsonb_build_object(
    'operation_id', v_receipt_id,
    'idempotency_key', v_idempotency_key,
    'inventory_item_id', v_item.id,
    'movement_id', v_movement_row.id,
    'quantity_delta', v_quantity_delta,
    'reason', p_reason,
    'movement_type', v_movement_type,
    'movement_at', v_movement_row.movement_at,
    'idempotency_replay', v_replay
  );

  update public.fertilizer_product_stock_outbound_receipts
  set
    movement_id = v_movement_row.id,
    result_jsonb = v_result,
    completed_at = timezone('utc', now())
  where id = v_receipt_id;

  return v_result;
end;
$$;

revoke all on function public.record_fertilizer_product_stock_outbound(
  uuid,
  numeric,
  text,
  text,
  timestamptz,
  text
) from public;

grant execute on function public.record_fertilizer_product_stock_outbound(
  uuid,
  numeric,
  text,
  text,
  timestamptz,
  text
) to authenticated, service_role;
