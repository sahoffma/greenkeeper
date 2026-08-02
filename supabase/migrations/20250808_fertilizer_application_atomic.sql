-- GA-012 / DL-030 — Atomic fertilizer application: one journal activity + one negative movement.
-- One inventory item per application; area target only; no unit conversion; no stored balance.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Schema extensions for inventory-coupled journal entries
-- ---------------------------------------------------------------------------

alter table public.activities
  add column if not exists area_name_snapshot text;

comment on column public.activities.area_name_snapshot is
  'Historical area label at application time — decouples journal display from later renames.';

alter table public.fertilization_details
  add column if not exists saved_product_profile_id uuid references public.product_profiles (id) on delete restrict,
  add column if not exists inventory_item_id uuid references public.fertilizer_containers (id) on delete restrict;

comment on column public.fertilization_details.saved_product_profile_id is
  'Immutable saved product version referenced by inventory-coupled fertilization.';

comment on column public.fertilization_details.inventory_item_id is
  'Inventory item consumed by this fertilization — marks journal entry as inventory-coupled.';

create index if not exists fertilization_details_inventory_item_idx
  on public.fertilization_details (inventory_item_id)
  where inventory_item_id is not null;

-- ---------------------------------------------------------------------------
-- Technical application receipt (request-scoped idempotency — not inventory truth)
-- ---------------------------------------------------------------------------

create table public.fertilizer_application_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  payload_fingerprint text not null,
  inventory_item_id uuid not null references public.fertilizer_containers (id) on delete restrict,
  saved_product_profile_id uuid not null references public.product_profiles (id) on delete restrict,
  area_id uuid not null references public.areas (id) on delete restrict,
  application_amount numeric(18, 4) not null,
  application_unit text not null,
  applied_at timestamptz not null,
  source_event_ref text null,
  note text null,
  activity_id uuid null references public.activities (id) on delete restrict,
  movement_id uuid null references public.fertilizer_stock_movements (id) on delete restrict,
  result_jsonb jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  constraint fertilizer_application_receipts_idempotency_key_nonempty_check
    check (idempotency_key <> ''),
  constraint fertilizer_application_receipts_payload_fingerprint_nonempty_check
    check (payload_fingerprint <> ''),
  constraint fertilizer_application_receipts_application_amount_positive_check
    check (application_amount > 0),
  constraint fertilizer_application_receipts_application_unit_check
    check (application_unit in ('kg', 'ml'))
);

create unique index fertilizer_application_receipts_user_idempotency_idx
  on public.fertilizer_application_receipts (user_id, idempotency_key);

comment on table public.fertilizer_application_receipts is
  'Technical atomic-operation receipt for fertilizer application idempotency — not inventory truth.';

alter table public.fertilizer_application_receipts enable row level security;

revoke all on public.fertilizer_application_receipts from public;
revoke all on public.fertilizer_application_receipts from authenticated, anon;
grant all on public.fertilizer_application_receipts to service_role;

-- ---------------------------------------------------------------------------
-- Immutability for inventory-coupled journal entries (DL-030)
-- ---------------------------------------------------------------------------

create or replace function public.prevent_inventory_coupled_activity_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.fertilization_details fd
    where fd.activity_id = old.id
      and fd.inventory_item_id is not null
  ) then
    raise exception 'FERTILIZER_APPLICATION_ACTIVITY_IMMUTABLE';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.prevent_inventory_coupled_fertilization_details_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.inventory_item_id is not null then
    raise exception 'FERTILIZER_APPLICATION_FERTILIZATION_IMMUTABLE';
  end if;

  if tg_op = 'UPDATE' and old.inventory_item_id is not null then
    raise exception 'FERTILIZER_APPLICATION_FERTILIZATION_IMMUTABLE';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists prevent_inventory_coupled_activity_update on public.activities;
create trigger prevent_inventory_coupled_activity_update
  before update on public.activities
  for each row
  execute function public.prevent_inventory_coupled_activity_mutation();

drop trigger if exists prevent_inventory_coupled_activity_delete on public.activities;
create trigger prevent_inventory_coupled_activity_delete
  before delete on public.activities
  for each row
  execute function public.prevent_inventory_coupled_activity_mutation();

drop trigger if exists prevent_inventory_coupled_fertilization_details_update
  on public.fertilization_details;
create trigger prevent_inventory_coupled_fertilization_details_update
  before update on public.fertilization_details
  for each row
  execute function public.prevent_inventory_coupled_fertilization_details_mutation();

drop trigger if exists prevent_inventory_coupled_fertilization_details_delete
  on public.fertilization_details;
create trigger prevent_inventory_coupled_fertilization_details_delete
  before delete on public.fertilization_details
  for each row
  execute function public.prevent_inventory_coupled_fertilization_details_mutation();

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public._fertilizer_application_advisory_lock_key(
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

create or replace function public._fertilizer_application_movement_idempotency_key(
  p_receipt_id uuid
)
returns text
language sql
immutable
as $$
  select 'fertilizer-application:' || p_receipt_id::text;
$$;

create or replace function public._fertilizer_application_build_product_label(
  p_manufacturer text,
  p_official_name text
)
returns text
language plpgsql
immutable
as $$
declare
  v_name text;
  v_mfr text;
begin
  v_name := nullif(trim(p_official_name), '');
  v_mfr := nullif(trim(p_manufacturer), '');

  if v_name is null then
    return coalesce(v_mfr, 'Dünger');
  end if;

  if v_mfr is null then
    return v_name;
  end if;

  if lower(v_name) like '%' || lower(v_mfr) || '%' then
    return v_name;
  end if;

  return trim(v_mfr || ' ' || v_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic application RPC
-- ---------------------------------------------------------------------------

create or replace function public.apply_fertilizer_inventory_item_to_area(
  p_inventory_item_id uuid,
  p_saved_product_profile_id uuid,
  p_area_id uuid,
  p_application_amount numeric,
  p_application_unit text,
  p_applied_at timestamptz,
  p_idempotency_key text,
  p_source_event_ref text default null,
  p_note text default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_idempotency_key text;
  v_source_event_ref text;
  v_note text;
  v_item public.fertilizer_containers%rowtype;
  v_profile public.product_profiles%rowtype;
  v_area public.areas%rowtype;
  v_receipt public.fertilizer_application_receipts%rowtype;
  v_receipt_id uuid;
  v_canonical_json text;
  v_fingerprint text;
  v_balance numeric;
  v_activity_id uuid;
  v_movement_id uuid;
  v_product_label text;
  v_activity_title text;
  v_movement_key text;
  v_now timestamptz;
  v_movement_date date;
  v_resulting_balance numeric;
  v_quantity_delta numeric;
begin
  v_user_id := coalesce(p_user_id, auth.uid());

  if v_user_id is null then
    raise exception 'FERTILIZER_APPLICATION_NOT_AUTHENTICATED';
  end if;

  if auth.uid() is not null and v_user_id is distinct from auth.uid() then
    raise exception 'FERTILIZER_APPLICATION_NOT_AUTHENTICATED';
  end if;

  v_idempotency_key := nullif(trim(p_idempotency_key), '');
  if v_idempotency_key is null then
    raise exception 'FERTILIZER_APPLICATION_PERSISTENCE_FAILED';
  end if;

  if length(v_idempotency_key) > 256 then
    raise exception 'FERTILIZER_APPLICATION_PERSISTENCE_FAILED';
  end if;

  v_source_event_ref := nullif(trim(p_source_event_ref), '');
  if v_source_event_ref is not null and length(v_source_event_ref) > 256 then
    raise exception 'FERTILIZER_APPLICATION_PERSISTENCE_FAILED';
  end if;

  v_note := nullif(trim(p_note), '');
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'FERTILIZER_APPLICATION_PERSISTENCE_FAILED';
  end if;

  if p_application_unit is null or p_application_unit not in ('kg', 'ml') then
    raise exception 'FERTILIZER_APPLICATION_UNIT_INVALID';
  end if;

  if p_application_amount is null or p_application_amount <= 0 then
    raise exception 'FERTILIZER_APPLICATION_AMOUNT_INVALID';
  end if;

  if p_application_amount <> round(p_application_amount, 4) then
    raise exception 'FERTILIZER_APPLICATION_AMOUNT_PRECISION_INVALID';
  end if;

  if p_applied_at is null then
    raise exception 'FERTILIZER_APPLICATION_DATE_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    public._fertilizer_application_advisory_lock_key(v_user_id, v_idempotency_key)
  );

  select *
  into v_receipt
  from public.fertilizer_application_receipts far
  where far.user_id = v_user_id
    and far.idempotency_key = v_idempotency_key
  for update;

  v_canonical_json := jsonb_build_object(
    'inventoryItemId', lower(p_inventory_item_id::text),
    'savedProductProfileId', lower(p_saved_product_profile_id::text),
    'targetKind', 'area',
    'targetId', lower(p_area_id::text),
    'applicationAmount', public._inventory_creation_format_quantity(p_application_amount),
    'applicationUnit', p_application_unit,
    'appliedAt', to_char(p_applied_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'sourceEventRef', v_source_event_ref,
    'note', v_note,
    'userId', lower(v_user_id::text)
  )::text;

  v_fingerprint := public._inventory_creation_compute_fingerprint(v_canonical_json);

  if found then
    if v_receipt.payload_fingerprint is distinct from v_fingerprint then
      raise exception 'FERTILIZER_APPLICATION_IDEMPOTENCY_CONFLICT';
    end if;

    if v_receipt.completed_at is not null and v_receipt.result_jsonb is not null then
      return v_receipt.result_jsonb || jsonb_build_object('idempotentReplay', true);
    end if;
  else
    insert into public.fertilizer_application_receipts (
      user_id,
      idempotency_key,
      payload_fingerprint,
      inventory_item_id,
      saved_product_profile_id,
      area_id,
      application_amount,
      application_unit,
      applied_at,
      source_event_ref,
      note
    ) values (
      v_user_id,
      v_idempotency_key,
      v_fingerprint,
      p_inventory_item_id,
      p_saved_product_profile_id,
      p_area_id,
      p_application_amount,
      p_application_unit,
      p_applied_at,
      v_source_event_ref,
      v_note
    )
    returning * into v_receipt;
  end if;

  v_receipt_id := v_receipt.id;

  select *
  into v_item
  from public.fertilizer_containers fc
  where fc.id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'FERTILIZER_APPLICATION_INVENTORY_ITEM_NOT_FOUND';
  end if;

  if v_item.saved_product_profile_id is null
    or v_item.access_kind is null
    or v_item.base_unit is null then
    raise exception 'FERTILIZER_APPLICATION_INVENTORY_ITEM_NOT_FOUND';
  end if;

  if v_item.access_kind <> 'authenticated_user'
    or v_item.user_id is distinct from v_user_id then
    raise exception 'FERTILIZER_APPLICATION_INVENTORY_ITEM_NOT_ACCESSIBLE';
  end if;

  if v_item.saved_product_profile_id is distinct from p_saved_product_profile_id then
    raise exception 'FERTILIZER_APPLICATION_PRODUCT_PROFILE_MISMATCH';
  end if;

  if p_application_unit is distinct from v_item.base_unit then
    raise exception 'FERTILIZER_APPLICATION_UNIT_MISMATCH';
  end if;

  select *
  into v_profile
  from public.product_profiles pp
  where pp.id = p_saved_product_profile_id;

  if not found
    or v_profile.profile_status <> 'saved'
    or v_profile.source <> 'enrichment' then
    raise exception 'FERTILIZER_APPLICATION_PRODUCT_PROFILE_MISMATCH';
  end if;

  select *
  into v_area
  from public.areas a
  where a.id = p_area_id
  for update;

  if not found then
    raise exception 'FERTILIZER_APPLICATION_APPLICATION_TARGET_NOT_FOUND';
  end if;

  if v_area.user_id is distinct from v_user_id then
    raise exception 'FERTILIZER_APPLICATION_APPLICATION_TARGET_NOT_ACCESSIBLE';
  end if;

  select coalesce(sum(fsm.quantity_delta), 0)
  into v_balance
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_inventory_item_id
    and fsm.movement_at is not null;

  v_quantity_delta := -p_application_amount;

  if v_balance + v_quantity_delta < 0 then
    raise exception 'FERTILIZER_APPLICATION_INSUFFICIENT_STOCK';
  end if;

  v_product_label := public._fertilizer_application_build_product_label(
    v_profile.manufacturer,
    v_profile.official_name
  );
  v_activity_title := 'Düngung: ' || v_product_label;
  v_activity_id := gen_random_uuid();
  v_movement_id := gen_random_uuid();
  v_now := timezone('utc', now());
  v_movement_date := (p_applied_at at time zone 'UTC')::date;
  v_movement_key := public._fertilizer_application_movement_idempotency_key(v_receipt_id);

  insert into public.activities (
    id,
    area_id,
    user_id,
    activity_type,
    title,
    notes,
    occurred_at,
    area_name_snapshot
  ) values (
    v_activity_id,
    p_area_id,
    v_user_id,
    'fertilization',
    v_activity_title,
    v_note,
    p_applied_at,
    v_area.name
  );

  insert into public.fertilization_details (
    activity_id,
    product_name,
    product_brand,
    amount_applied,
    amount_unit,
    application_rate,
    saved_product_profile_id,
    inventory_item_id
  ) values (
    v_activity_id,
    coalesce(nullif(trim(v_profile.official_name), ''), v_product_label),
    nullif(trim(v_profile.manufacturer), ''),
    p_application_amount,
    p_application_unit,
    public._inventory_creation_format_quantity(p_application_amount) || ' ' || p_application_unit,
    p_saved_product_profile_id,
    p_inventory_item_id
  );

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
    activity_id,
    created_at,
    capture_idempotency_key
  ) values (
    v_movement_id,
    p_inventory_item_id,
    v_item.access_kind,
    v_item.user_id,
    v_item.session_access_hash,
    v_quantity_delta,
    p_application_unit,
    'fertilization'::public.fertilizer_movement_type,
    'journal'::public.fertilizer_movement_origin,
    p_applied_at,
    v_movement_date,
    v_movement_key,
    coalesce(v_source_event_ref, 'activity:' || v_activity_id::text),
    v_note,
    v_activity_id,
    v_now,
    null
  );

  v_resulting_balance := v_balance + v_quantity_delta;

  update public.fertilizer_application_receipts
  set
    activity_id = v_activity_id,
    movement_id = v_movement_id,
    completed_at = v_now,
    result_jsonb = jsonb_build_object(
      'activityId', v_activity_id,
      'movementId', v_movement_id,
      'inventoryItemId', p_inventory_item_id,
      'savedProductProfileId', p_saved_product_profile_id,
      'targetKind', 'area',
      'targetId', p_area_id,
      'applicationAmount', p_application_amount,
      'applicationUnit', p_application_unit,
      'appliedAt', p_applied_at,
      'resultingBalance', v_resulting_balance,
      'idempotentReplay', false
    )
  where id = v_receipt_id;

  return (
    select result_jsonb || jsonb_build_object('idempotentReplay', false)
    from public.fertilizer_application_receipts
    where id = v_receipt_id
  );
end;
$$;

revoke all on function public.apply_fertilizer_inventory_item_to_area(
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  timestamptz,
  text,
  text,
  text,
  uuid
) from public;

grant execute on function public.apply_fertilizer_inventory_item_to_area(
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  timestamptz,
  text,
  text,
  text,
  uuid
) to authenticated, service_role;
