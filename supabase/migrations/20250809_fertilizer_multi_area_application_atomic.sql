-- DL-031 / DL-032 — Atomic multi-area fertilizer application persistence.
-- One batch receipt, one negative movement, one activity + detail + batch-area row per concrete area.

-- ---------------------------------------------------------------------------
-- Batch receipt (multi-area application + idempotency truth)
-- ---------------------------------------------------------------------------

create table if not exists public.fertilizer_application_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  inventory_item_id uuid not null references public.fertilizer_containers (id) on delete restrict,
  saved_product_profile_id uuid not null references public.product_profiles (id) on delete restrict,
  application_mode text not null,
  selection_source text not null,
  care_group_id_snapshot uuid null references public.care_groups (id) on delete set null,
  confirmed_input_value numeric not null,
  confirmed_input_unit text not null,
  total_application_amount numeric(18, 4) not null,
  application_unit text not null,
  applied_at timestamptz not null,
  note text null,
  idempotency_key text not null,
  source_event_ref text null,
  request_fingerprint text not null,
  movement_id uuid null references public.fertilizer_stock_movements (id) on delete restrict,
  result_jsonb jsonb null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fertilizer_application_batches_idempotency_key_nonempty_check
    check (idempotency_key <> ''),
  constraint fertilizer_application_batches_request_fingerprint_nonempty_check
    check (request_fingerprint <> ''),
  constraint fertilizer_application_batches_confirmed_input_value_positive_check
    check (confirmed_input_value > 0),
  constraint fertilizer_application_batches_total_application_amount_positive_check
    check (total_application_amount > 0),
  constraint fertilizer_application_batches_application_mode_check
    check (application_mode in ('rate_per_sqm', 'total_amount_proportional')),
  constraint fertilizer_application_batches_selection_source_check
    check (selection_source in ('manual', 'care_group')),
  constraint fertilizer_application_batches_application_unit_check
    check (application_unit in ('kg', 'ml')),
  constraint fertilizer_application_batches_care_group_selection_check
    check (
      (selection_source = 'care_group' and care_group_id_snapshot is not null)
      or (selection_source = 'manual' and care_group_id_snapshot is null)
    )
);

create unique index if not exists fertilizer_application_batches_user_idempotency_idx
  on public.fertilizer_application_batches (user_id, idempotency_key);

create index if not exists fertilizer_application_batches_inventory_item_idx
  on public.fertilizer_application_batches (inventory_item_id);

create index if not exists fertilizer_application_batches_movement_idx
  on public.fertilizer_application_batches (movement_id)
  where movement_id is not null;

comment on table public.fertilizer_application_batches is
  'Shared multi-area fertilizer application batch — idempotency receipt and inventory journal grouping.';

-- ---------------------------------------------------------------------------
-- Per-area batch assignment
-- ---------------------------------------------------------------------------

create table if not exists public.fertilizer_application_areas (
  id uuid primary key default gen_random_uuid(),
  application_batch_id uuid not null references public.fertilizer_application_batches (id) on delete restrict,
  activity_id uuid not null references public.activities (id) on delete cascade,
  area_id uuid not null references public.areas (id) on delete cascade,
  area_name_snapshot text not null,
  area_size_sqm_snapshot numeric(10, 2) not null,
  application_amount numeric(18, 4) not null,
  application_unit text not null,
  rate_per_sqm numeric(18, 4) not null,
  rate_unit text not null,
  sort_order integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fertilizer_application_areas_area_size_positive_check
    check (area_size_sqm_snapshot > 0),
  constraint fertilizer_application_areas_application_amount_positive_check
    check (application_amount > 0),
  constraint fertilizer_application_areas_rate_per_sqm_positive_check
    check (rate_per_sqm > 0),
  constraint fertilizer_application_areas_application_unit_check
    check (application_unit in ('kg', 'ml')),
  constraint fertilizer_application_areas_rate_unit_check
    check (rate_unit in ('g_per_sqm', 'ml_per_sqm')),
  constraint fertilizer_application_areas_sort_order_nonnegative_check
    check (sort_order >= 0),
  constraint fertilizer_application_areas_batch_area_unique
    unique (application_batch_id, area_id),
  constraint fertilizer_application_areas_batch_sort_order_unique
    unique (application_batch_id, sort_order)
);

create index if not exists fertilizer_application_areas_activity_idx
  on public.fertilizer_application_areas (activity_id);

create index if not exists fertilizer_application_areas_area_idx
  on public.fertilizer_application_areas (area_id);

comment on table public.fertilizer_application_areas is
  'Immutable per-area assignment for a shared multi-area fertilizer application batch.';

-- ---------------------------------------------------------------------------
-- Journal and movement extensions
-- ---------------------------------------------------------------------------

alter table public.fertilization_details
  add column if not exists application_batch_id uuid references public.fertilizer_application_batches (id) on delete restrict,
  add column if not exists area_size_sqm_snapshot numeric(10, 2),
  add column if not exists rate_per_sqm numeric(18, 4),
  add column if not exists rate_unit text;

alter table public.fertilization_details
  drop constraint if exists fertilization_details_rate_unit_check;

alter table public.fertilization_details
  add constraint fertilization_details_rate_unit_check
    check (rate_unit is null or rate_unit in ('g_per_sqm', 'ml_per_sqm'));

alter table public.fertilization_details
  drop constraint if exists fertilization_details_multi_area_batch_fields_check;

alter table public.fertilization_details
  add constraint fertilization_details_multi_area_batch_fields_check
    check (
      (
        application_batch_id is null
        and area_size_sqm_snapshot is null
        and rate_per_sqm is null
        and rate_unit is null
      )
      or (
        application_batch_id is not null
        and area_size_sqm_snapshot is not null
        and rate_per_sqm is not null
        and rate_unit is not null
      )
    );

create index if not exists fertilization_details_application_batch_idx
  on public.fertilization_details (application_batch_id)
  where application_batch_id is not null;

comment on column public.fertilization_details.application_batch_id is
  'Shared multi-area application batch referenced by inventory-coupled fertilization.';

alter table public.fertilizer_stock_movements
  add column if not exists application_batch_id uuid references public.fertilizer_application_batches (id) on delete restrict;

create unique index if not exists fertilizer_stock_movements_application_batch_idx
  on public.fertilizer_stock_movements (application_batch_id)
  where application_batch_id is not null;

comment on column public.fertilizer_stock_movements.application_batch_id is
  'Shared multi-area application batch that caused this journal movement.';

-- ---------------------------------------------------------------------------
-- DL-032 area deletion context
-- ---------------------------------------------------------------------------

create or replace function public.set_area_deletion_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform set_config('greenkeeper.area_deletion_id', lower(old.id::text), true);
  return old;
end;
$$;

drop trigger if exists areas_set_deletion_context on public.areas;
create trigger areas_set_deletion_context
  before delete on public.areas
  for each row
  execute function public.set_area_deletion_context();

-- ---------------------------------------------------------------------------
-- Immutability guards (DL-030 exception for area deletion — DL-032)
-- ---------------------------------------------------------------------------

create or replace function public.prevent_inventory_coupled_activity_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_deletion_id text;
begin
  if exists (
    select 1
    from public.fertilization_details fd
    where fd.activity_id = old.id
      and (fd.inventory_item_id is not null or fd.application_batch_id is not null)
  ) then
    if tg_op = 'DELETE' then
      v_deletion_id := nullif(trim(current_setting('greenkeeper.area_deletion_id', true)), '');
      if v_deletion_id is not null and lower(old.area_id::text) = lower(v_deletion_id) then
        return old;
      end if;
    end if;

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
declare
  v_deletion_id text;
  v_area_id uuid;
begin
  if old.inventory_item_id is not null or old.application_batch_id is not null then
    if tg_op = 'DELETE' then
      v_deletion_id := nullif(trim(current_setting('greenkeeper.area_deletion_id', true)), '');
      if v_deletion_id is not null then
        select a.area_id
        into v_area_id
        from public.activities a
        where a.id = old.activity_id;

        if v_area_id is not null and lower(v_area_id::text) = lower(v_deletion_id) then
          return old;
        end if;

        if exists (
          select 1
          from public.fertilizer_application_areas faa
          where faa.activity_id = old.activity_id
            and lower(faa.area_id::text) = lower(v_deletion_id)
        ) then
          return old;
        end if;
      end if;

      raise exception 'FERTILIZER_APPLICATION_FERTILIZATION_IMMUTABLE';
    end if;

    if tg_op = 'UPDATE' then
      raise exception 'FERTILIZER_APPLICATION_FERTILIZATION_IMMUTABLE';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.prevent_fertilizer_application_batch_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_BATCH_IMMUTABLE';
  end if;

  if tg_op = 'UPDATE' then
    if old.completed_at is not null then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_BATCH_IMMUTABLE';
    end if;

    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.inventory_item_id is distinct from old.inventory_item_id
      or new.saved_product_profile_id is distinct from old.saved_product_profile_id
      or new.application_mode is distinct from old.application_mode
      or new.selection_source is distinct from old.selection_source
      or new.care_group_id_snapshot is distinct from old.care_group_id_snapshot
      or new.confirmed_input_value is distinct from old.confirmed_input_value
      or new.confirmed_input_unit is distinct from old.confirmed_input_unit
      or new.total_application_amount is distinct from old.total_application_amount
      or new.application_unit is distinct from old.application_unit
      or new.applied_at is distinct from old.applied_at
      or new.note is distinct from old.note
      or new.idempotency_key is distinct from old.idempotency_key
      or new.source_event_ref is distinct from old.source_event_ref
      or new.request_fingerprint is distinct from old.request_fingerprint
      or new.created_at is distinct from old.created_at
    then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_BATCH_IMMUTABLE';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_fertilizer_application_area_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_deletion_id text;
begin
  if tg_op = 'UPDATE' then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_BATCH_AREA_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    v_deletion_id := nullif(trim(current_setting('greenkeeper.area_deletion_id', true)), '');
    if v_deletion_id is not null and (
      lower(old.area_id::text) = lower(v_deletion_id)
      or exists (
        select 1
        from public.activities act
        where act.id = old.activity_id
          and lower(act.area_id::text) = lower(v_deletion_id)
      )
    ) then
      return old;
    end if;

    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_BATCH_AREA_IMMUTABLE';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists prevent_fertilizer_application_batch_update on public.fertilizer_application_batches;
create trigger prevent_fertilizer_application_batch_update
  before update on public.fertilizer_application_batches
  for each row
  execute function public.prevent_fertilizer_application_batch_mutation();

drop trigger if exists prevent_fertilizer_application_batch_delete on public.fertilizer_application_batches;
create trigger prevent_fertilizer_application_batch_delete
  before delete on public.fertilizer_application_batches
  for each row
  execute function public.prevent_fertilizer_application_batch_mutation();

drop trigger if exists prevent_fertilizer_application_area_update on public.fertilizer_application_areas;
create trigger prevent_fertilizer_application_area_update
  before update on public.fertilizer_application_areas
  for each row
  execute function public.prevent_fertilizer_application_area_mutation();

drop trigger if exists prevent_fertilizer_application_area_delete on public.fertilizer_application_areas;
create trigger prevent_fertilizer_application_area_delete
  before delete on public.fertilizer_application_areas
  for each row
  execute function public.prevent_fertilizer_application_area_mutation();

-- ---------------------------------------------------------------------------
-- Internal helpers — DL-031 integer scaling (matches fertilizerMultiAreaApplicationCore.ts)
-- ---------------------------------------------------------------------------

create or replace function public._fertilizer_multi_area_quantity_scale()
returns integer
language sql
immutable
as $$
  select 10000;
$$;

create or replace function public._fertilizer_multi_area_area_scale()
returns integer
language sql
immutable
as $$
  select 100;
$$;

create or replace function public._fertilizer_multi_area_scale_quantity(p_value numeric)
returns bigint
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_value is null or p_value <> round(p_value, 4) then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_PRECISION_INVALID';
  end if;

  return round(p_value * public._fertilizer_multi_area_quantity_scale())::bigint;
end;
$$;

create or replace function public._fertilizer_multi_area_unscale_quantity(p_scaled bigint)
returns numeric
language sql
immutable
as $$
  select p_scaled::numeric / public._fertilizer_multi_area_quantity_scale();
$$;

create or replace function public._fertilizer_multi_area_scale_area_size(p_size_sqm numeric)
returns integer
language plpgsql
immutable
as $$
begin
  if p_size_sqm is null or p_size_sqm <> round(p_size_sqm, 2) then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SIZE_INVALID';
  end if;

  return round(p_size_sqm * public._fertilizer_multi_area_area_scale())::integer;
end;
$$;

create or replace function public._fertilizer_multi_area_normalize_area_size(p_size_sqm numeric)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_scaled integer;
begin
  v_scaled := public._fertilizer_multi_area_scale_area_size(p_size_sqm);
  return v_scaled::numeric / public._fertilizer_multi_area_area_scale();
end;
$$;

create or replace function public._fertilizer_multi_area_effort_rate_unit(p_base_unit text)
returns text
language plpgsql
immutable
as $$
begin
  if p_base_unit = 'kg' then
    return 'g_per_sqm';
  end if;

  if p_base_unit = 'ml' then
    return 'ml_per_sqm';
  end if;

  raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_UNIT_INVALID';
end;
$$;

create or replace function public._fertilizer_multi_area_compute_amount_from_rate(
  p_rate_value numeric,
  p_area_size_sqm numeric,
  p_base_unit text
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_area_size_scaled integer;
  v_amount_scaled bigint;
begin
  v_area_size_scaled := public._fertilizer_multi_area_scale_area_size(p_area_size_sqm);

  if p_base_unit = 'kg' then
    v_amount_scaled := round((p_rate_value * v_area_size_scaled) / 10)::bigint;
    return public._fertilizer_multi_area_unscale_quantity(v_amount_scaled);
  end if;

  if p_base_unit = 'ml' then
    return round(p_rate_value * p_area_size_sqm, 4);
  end if;

  raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_UNIT_INVALID';
end;
$$;

create or replace function public._fertilizer_multi_area_compute_effort_rate(
  p_application_amount numeric,
  p_area_size_sqm numeric,
  p_rate_unit text
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_raw numeric;
begin
  if p_rate_unit = 'g_per_sqm' then
    v_raw := (p_application_amount * 1000) / p_area_size_sqm;
  elsif p_rate_unit = 'ml_per_sqm' then
    v_raw := p_application_amount / p_area_size_sqm;
  else
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_RATE_UNIT_INVALID';
  end if;

  return round(v_raw * public._fertilizer_multi_area_quantity_scale())
    / public._fertilizer_multi_area_quantity_scale();
end;
$$;

create or replace function public._fertilizer_multi_area_movement_idempotency_key(
  p_batch_id uuid
)
returns text
language sql
immutable
as $$
  select 'fertilizer-multi-area-application:' || p_batch_id::text;
$$;

create or replace function public._fertilizer_multi_area_validate_proportional_distribution(
  p_total_amount_scaled bigint,
  p_areas jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_total_size_scaled bigint := 0;
  v_remainder bigint;
  v_recipient_area_id text;
  v_recipient_index integer := 0;
  v_recipient_count integer := 0;
  v_expected_scaled bigint;
  v_actual_scaled bigint;
  v_area_id text;
begin
  if jsonb_typeof(p_areas) <> 'array' or jsonb_array_length(p_areas) = 0 then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_NO_AREAS_SELECTED';
  end if;

  select coalesce(sum(public._fertilizer_multi_area_scale_area_size((entry ->> 'areaSizeSqmSnapshot')::numeric)), 0)
  into v_total_size_scaled
  from jsonb_array_elements(p_areas) as entry;

  if v_total_size_scaled <= 0 then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
  end if;

  drop table if exists _fma_distribution_work;

  create temporary table _fma_distribution_work (
    area_id text primary key,
    area_size_scaled integer not null,
    floored_share bigint not null default 0,
    expected_share bigint not null default 0
  ) on commit drop;

  insert into _fma_distribution_work (area_id, area_size_scaled, floored_share)
  select
    lower(entry ->> 'areaId'),
    public._fertilizer_multi_area_scale_area_size((entry ->> 'areaSizeSqmSnapshot')::numeric),
    floor(
      (p_total_amount_scaled::numeric * public._fertilizer_multi_area_scale_area_size((entry ->> 'areaSizeSqmSnapshot')::numeric)::numeric)
      / v_total_size_scaled::numeric
    )::bigint
  from jsonb_array_elements(p_areas) as entry
  order by lower(entry ->> 'areaId');

  v_remainder := p_total_amount_scaled - coalesce((select sum(floored_share) from _fma_distribution_work), 0);

  if v_remainder < 0 then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_ROUNDING_FAILED';
  end if;

  update _fma_distribution_work
  set expected_share = floored_share
  where area_id is not null;

  select count(*)
  into v_recipient_count
  from _fma_distribution_work;

  while v_remainder > 0 loop
    select w.area_id
    into v_recipient_area_id
    from _fma_distribution_work w
    order by w.area_size_scaled desc, w.area_id desc
    offset (v_recipient_index % v_recipient_count)
    limit 1;

    update _fma_distribution_work
    set expected_share = expected_share + 1
    where area_id = v_recipient_area_id;

    v_remainder := v_remainder - 1;
    v_recipient_index := v_recipient_index + 1;
  end loop;

  for v_area_id, v_expected_scaled in
    select w.area_id, w.expected_share
    from _fma_distribution_work w
    order by w.area_id
  loop
    select public._fertilizer_multi_area_scale_quantity((entry ->> 'applicationAmount')::numeric)
    into v_actual_scaled
    from jsonb_array_elements(p_areas) as entry
    where lower(entry ->> 'areaId') = v_area_id;

    if v_actual_scaled is distinct from v_expected_scaled then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic multi-area application RPC
-- ---------------------------------------------------------------------------

create or replace function public.apply_fertilizer_inventory_item_to_areas(
  p_inventory_item_id uuid,
  p_saved_product_profile_id uuid,
  p_application_mode text,
  p_selection_source text,
  p_confirmed_input_value numeric,
  p_confirmed_input_unit text,
  p_total_application_amount numeric,
  p_application_unit text,
  p_applied_at timestamptz,
  p_idempotency_key text,
  p_areas jsonb,
  p_care_group_id uuid default null,
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
  v_care_group_id uuid;
  v_item public.fertilizer_containers%rowtype;
  v_profile public.product_profiles%rowtype;
  v_batch public.fertilizer_application_batches%rowtype;
  v_batch_id uuid;
  v_batch_exists boolean := false;
  v_canonical_json text;
  v_fingerprint text;
  v_balance numeric;
  v_quantity_delta numeric;
  v_resulting_balance numeric;
  v_now timestamptz;
  v_movement_date date;
  v_movement_id uuid;
  v_movement_key text;
  v_product_label text;
  v_activity_title text;
  v_effort_rate_unit text;
  v_area_count integer;
  v_area_entry jsonb;
  v_area_idx integer;
  v_area_id uuid;
  v_area_id_text text;
  v_area_row public.areas%rowtype;
  v_seen_area_ids text[] := array[]::text[];
  v_area_ids uuid[] := array[]::uuid[];
  v_activity_id uuid;
  v_primary_activity_id uuid;
  v_total_scaled bigint;
  v_area_scaled bigint;
  v_expected_amount numeric;
  v_expected_scaled bigint;
  v_actual_amount numeric;
  v_actual_scaled bigint;
  v_expected_rate numeric;
  v_result_areas jsonb := '[]'::jsonb;
  v_sorted_areas jsonb;
begin
  -- dl-031-multi-area-rpc-order: batch-after-reference-validation
  v_user_id := coalesce(p_user_id, auth.uid());

  if v_user_id is null then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_NOT_AUTHENTICATED';
  end if;

  if auth.uid() is not null and v_user_id is distinct from auth.uid() then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_NOT_AUTHENTICATED';
  end if;

  v_idempotency_key := nullif(trim(p_idempotency_key), '');
  if v_idempotency_key is null then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_PERSISTENCE_FAILED';
  end if;

  if length(v_idempotency_key) > 256 then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_PERSISTENCE_FAILED';
  end if;

  v_source_event_ref := nullif(trim(p_source_event_ref), '');
  if v_source_event_ref is not null and length(v_source_event_ref) > 256 then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_PERSISTENCE_FAILED';
  end if;

  v_note := nullif(trim(p_note), '');
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_PERSISTENCE_FAILED';
  end if;

  if p_application_unit is null or p_application_unit not in ('kg', 'ml') then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_UNIT_INVALID';
  end if;

  if p_application_mode is null
    or p_application_mode not in ('rate_per_sqm', 'total_amount_proportional') then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_MODE_INVALID';
  end if;

  if p_selection_source is null or p_selection_source not in ('manual', 'care_group') then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
  end if;

  v_care_group_id := p_care_group_id;
  if p_selection_source = 'care_group' and v_care_group_id is null then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
  end if;

  if p_selection_source = 'manual' and v_care_group_id is not null then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
  end if;

  if p_confirmed_input_value is null or p_confirmed_input_value <= 0 then
    if p_application_mode = 'rate_per_sqm' then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_RATE_INVALID';
    end if;

    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_TOTAL_INVALID';
  end if;

  if p_confirmed_input_value <> round(p_confirmed_input_value, 4) then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_PRECISION_INVALID';
  end if;

  if p_confirmed_input_unit is null or trim(p_confirmed_input_unit) = '' then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
  end if;

  if p_total_application_amount is null or p_total_application_amount <= 0 then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_TOTAL_INVALID';
  end if;

  if p_total_application_amount <> round(p_total_application_amount, 4) then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_PRECISION_INVALID';
  end if;

  if p_applied_at is null then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DATE_INVALID';
  end if;

  if jsonb_typeof(p_areas) <> 'array' then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_NO_AREAS_SELECTED';
  end if;

  v_area_count := jsonb_array_length(p_areas);
  if v_area_count <= 0 then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_NO_AREAS_SELECTED';
  end if;

  v_effort_rate_unit := public._fertilizer_multi_area_effort_rate_unit(p_application_unit);

  if p_application_mode = 'rate_per_sqm' then
    if p_confirmed_input_unit <> v_effort_rate_unit then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_RATE_UNIT_INVALID';
    end if;
  else
    if p_confirmed_input_unit <> p_application_unit then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_UNIT_INVALID';
    end if;

    if p_confirmed_input_value is distinct from p_total_application_amount then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_TOTAL_INVALID';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    public._fertilizer_application_advisory_lock_key(v_user_id, v_idempotency_key)
  );

  select coalesce(
    jsonb_agg(entry order by lower(entry ->> 'areaId')),
    '[]'::jsonb
  )
  into v_sorted_areas
  from jsonb_array_elements(p_areas) as entry;

  for v_area_idx in 0 .. (v_area_count - 1) loop
    v_area_entry := v_sorted_areas -> v_area_idx;
    v_area_id_text := lower(nullif(trim(v_area_entry ->> 'areaId'), ''));

    if v_area_id_text is null then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
    end if;

    if v_area_id_text = any (v_seen_area_ids) then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_DUPLICATE_AREA';
    end if;

    v_seen_area_ids := array_append(v_seen_area_ids, v_area_id_text);

    if nullif(trim(v_area_entry ->> 'areaNameSnapshot'), '') is null then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
    end if;

    if v_area_entry ->> 'areaSizeSqmSnapshot' is null then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SIZE_MISSING';
    end if;

    if (v_area_entry ->> 'areaSizeSqmSnapshot')::numeric <= 0 then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SIZE_INVALID';
    end if;

    if (v_area_entry ->> 'areaSizeSqmSnapshot')::numeric
      <> round((v_area_entry ->> 'areaSizeSqmSnapshot')::numeric, 2) then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SIZE_INVALID';
    end if;

    if (v_area_entry ->> 'applicationAmount') is null
      or (v_area_entry ->> 'applicationAmount')::numeric <= 0 then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_TOO_SMALL';
    end if;

    if (v_area_entry ->> 'applicationAmount')::numeric
      <> round((v_area_entry ->> 'applicationAmount')::numeric, 4) then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_PRECISION_INVALID';
    end if;

    if v_area_entry ->> 'applicationUnit' is distinct from p_application_unit then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_UNIT_INVALID';
    end if;

    if (v_area_entry ->> 'ratePerSqm') is null
      or (v_area_entry ->> 'ratePerSqm')::numeric <= 0 then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_RATE_INVALID';
    end if;

    if (v_area_entry ->> 'ratePerSqm')::numeric
      <> round((v_area_entry ->> 'ratePerSqm')::numeric, 4) then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_PRECISION_INVALID';
    end if;

    if v_area_entry ->> 'rateUnit' is distinct from v_effort_rate_unit then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_RATE_UNIT_INVALID';
    end if;

    if (v_area_entry ->> 'sortOrder') is null
      or (v_area_entry ->> 'sortOrder')::integer <> v_area_idx then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
    end if;

    v_area_id := v_area_id_text::uuid;
    v_area_ids := array_append(v_area_ids, v_area_id);
  end loop;

  v_canonical_json := jsonb_build_object(
    'inventoryItemId', lower(p_inventory_item_id::text),
    'savedProductProfileId', lower(p_saved_product_profile_id::text),
    'applicationMode', p_application_mode,
    'selectionSource', p_selection_source,
    'careGroupId', case when v_care_group_id is null then null else lower(v_care_group_id::text) end,
    'confirmedInputValue', public._inventory_creation_format_quantity(p_confirmed_input_value),
    'confirmedInputUnit', p_confirmed_input_unit,
    'totalApplicationAmount', public._inventory_creation_format_quantity(p_total_application_amount),
    'applicationUnit', p_application_unit,
    'effortRateUnit', v_effort_rate_unit,
    'appliedAt', to_char(p_applied_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'sourceEventRef', v_source_event_ref,
    'note', v_note,
    'userId', lower(v_user_id::text),
    'areas', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'areaId', lower(entry ->> 'areaId'),
            'areaNameSnapshot', entry ->> 'areaNameSnapshot',
            'areaSizeSqmSnapshot', (entry ->> 'areaSizeSqmSnapshot')::numeric,
            'applicationAmount', public._inventory_creation_format_quantity((entry ->> 'applicationAmount')::numeric),
            'applicationUnit', entry ->> 'applicationUnit',
            'effortRate', public._inventory_creation_format_quantity((entry ->> 'ratePerSqm')::numeric),
            'effortRateUnit', entry ->> 'rateUnit',
            'sortOrder', (entry ->> 'sortOrder')::integer
          )
          order by lower(entry ->> 'areaId')
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(v_sorted_areas) as entry
    )
  )::text;

  v_fingerprint := public._inventory_creation_compute_fingerprint(v_canonical_json);

  select *
  into v_batch
  from public.fertilizer_application_batches fab
  where fab.user_id = v_user_id
    and fab.idempotency_key = v_idempotency_key
  for update;

  v_batch_exists := found;

  if v_batch_exists then
    if v_batch.request_fingerprint is distinct from v_fingerprint then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_IDEMPOTENCY_CONFLICT';
    end if;

    if v_batch.completed_at is not null and v_batch.result_jsonb is not null then
      return v_batch.result_jsonb || jsonb_build_object('idempotentReplay', true);
    end if;
  end if;

  select *
  into v_item
  from public.fertilizer_containers fc
  where fc.id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_INVENTORY_ITEM_NOT_FOUND';
  end if;

  if v_item.saved_product_profile_id is null
    or v_item.access_kind is null
    or v_item.base_unit is null then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_INVENTORY_ITEM_NOT_FOUND';
  end if;

  if v_item.access_kind <> 'authenticated_user'
    or v_item.user_id is distinct from v_user_id then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_INVENTORY_ITEM_NOT_ACCESSIBLE';
  end if;

  if v_item.saved_product_profile_id is distinct from p_saved_product_profile_id then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_PRODUCT_PROFILE_MISMATCH';
  end if;

  if p_application_unit is distinct from v_item.base_unit then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_UNIT_MISMATCH';
  end if;

  select *
  into v_profile
  from public.product_profiles pp
  where pp.id = p_saved_product_profile_id;

  if not found
    or v_profile.profile_status <> 'saved'
    or v_profile.source <> 'enrichment' then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_PRODUCT_PROFILE_MISMATCH';
  end if;

  if p_selection_source = 'care_group' then
    if not exists (
      select 1
      from public.care_groups cg
      where cg.id = v_care_group_id
        and cg.user_id = v_user_id
        and cg.archived_at is null
    ) then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
    end if;

    if exists (
      select 1
      from unnest(v_area_ids) as requested(area_id)
      where not exists (
        select 1
        from public.care_group_areas cga
        where cga.care_group_id = v_care_group_id
          and cga.area_id = requested.area_id
      )
    ) then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
    end if;
  end if;

  for v_area_row in
    select a.*
    from public.areas a
    where a.id = any (v_area_ids)
    order by lower(a.id::text)
    for update
  loop
    if v_area_row.user_id is distinct from v_user_id then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_TARGET_NOT_ACCESSIBLE';
    end if;

    if v_area_row.archived_at is not null then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_TARGET_NOT_FOUND';
    end if;

    select entry
    into v_area_entry
    from jsonb_array_elements(v_sorted_areas) as entry
    where lower(entry ->> 'areaId') = lower(v_area_row.id::text);

    if v_area_row.size_sqm is null or v_area_row.size_sqm <= 0 then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SIZE_MISSING';
    end if;

    if public._fertilizer_multi_area_normalize_area_size(v_area_row.size_sqm)
      is distinct from public._fertilizer_multi_area_normalize_area_size((v_area_entry ->> 'areaSizeSqmSnapshot')::numeric) then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SNAPSHOT_MISMATCH';
    end if;

    if trim(v_area_row.name) is distinct from trim(v_area_entry ->> 'areaNameSnapshot') then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SNAPSHOT_MISMATCH';
    end if;
  end loop;

  if (
    select count(*)
    from public.areas a
    where a.id = any (v_area_ids)
  ) <> v_area_count then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_TARGET_NOT_FOUND';
  end if;

  v_total_scaled := 0;

  for v_area_idx in 0 .. (v_area_count - 1) loop
    v_area_entry := v_sorted_areas -> v_area_idx;
    v_actual_amount := (v_area_entry ->> 'applicationAmount')::numeric;
    v_actual_scaled := public._fertilizer_multi_area_scale_quantity(v_actual_amount);

    if v_actual_scaled <= 0 then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_TOO_SMALL';
    end if;

    if v_actual_scaled < 1 then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_TOO_SMALL';
    end if;

    if p_application_mode = 'rate_per_sqm' then
      v_expected_amount := public._fertilizer_multi_area_compute_amount_from_rate(
        p_confirmed_input_value,
        (v_area_entry ->> 'areaSizeSqmSnapshot')::numeric,
        p_application_unit
      );
      v_expected_scaled := public._fertilizer_multi_area_scale_quantity(v_expected_amount);

      if v_actual_scaled is distinct from v_expected_scaled then
        raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
      end if;
    end if;

    v_expected_rate := public._fertilizer_multi_area_compute_effort_rate(
      v_actual_amount,
      (v_area_entry ->> 'areaSizeSqmSnapshot')::numeric,
      v_effort_rate_unit
    );

    if v_expected_rate is distinct from (v_area_entry ->> 'ratePerSqm')::numeric then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
    end if;

    v_total_scaled := v_total_scaled + v_actual_scaled;
  end loop;

  if p_application_mode = 'total_amount_proportional' then
    if v_total_scaled is distinct from public._fertilizer_multi_area_scale_quantity(p_total_application_amount) then
      raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
    end if;

    perform public._fertilizer_multi_area_validate_proportional_distribution(
      public._fertilizer_multi_area_scale_quantity(p_total_application_amount),
      v_sorted_areas
    );
  elsif v_total_scaled <> public._fertilizer_multi_area_scale_quantity(p_total_application_amount) then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID';
  end if;

  select coalesce(sum(fsm.quantity_delta), 0)
  into v_balance
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_inventory_item_id
    and fsm.movement_at is not null;

  v_quantity_delta := -p_total_application_amount;

  if v_balance + v_quantity_delta < 0 then
    raise exception 'FERTILIZER_MULTI_AREA_APPLICATION_INSUFFICIENT_STOCK';
  end if;

  if not v_batch_exists then
    insert into public.fertilizer_application_batches (
      user_id,
      inventory_item_id,
      saved_product_profile_id,
      application_mode,
      selection_source,
      care_group_id_snapshot,
      confirmed_input_value,
      confirmed_input_unit,
      total_application_amount,
      application_unit,
      applied_at,
      note,
      idempotency_key,
      source_event_ref,
      request_fingerprint
    ) values (
      v_user_id,
      p_inventory_item_id,
      p_saved_product_profile_id,
      p_application_mode,
      p_selection_source,
      v_care_group_id,
      p_confirmed_input_value,
      p_confirmed_input_unit,
      p_total_application_amount,
      p_application_unit,
      p_applied_at,
      v_note,
      v_idempotency_key,
      v_source_event_ref,
      v_fingerprint
    )
    returning * into v_batch;
  end if;

  v_batch_id := v_batch.id;

  v_product_label := public._fertilizer_application_build_product_label(
    v_profile.manufacturer,
    v_profile.official_name
  );
  v_activity_title := 'Düngung: ' || v_product_label;
  v_movement_id := gen_random_uuid();
  v_now := timezone('utc', now());
  v_movement_date := (p_applied_at at time zone 'UTC')::date;
  v_movement_key := public._fertilizer_multi_area_movement_idempotency_key(v_batch_id);

  for v_area_idx in 0 .. (v_area_count - 1) loop
    v_area_entry := v_sorted_areas -> v_area_idx;
    v_area_id := lower(v_area_entry ->> 'areaId')::uuid;
    v_activity_id := gen_random_uuid();

    if v_primary_activity_id is null then
      v_primary_activity_id := v_activity_id;
    end if;

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
      v_area_id,
      v_user_id,
      'fertilization',
      v_activity_title,
      v_note,
      p_applied_at,
      v_area_entry ->> 'areaNameSnapshot'
    );

    insert into public.fertilization_details (
      activity_id,
      product_name,
      product_brand,
      amount_applied,
      amount_unit,
      application_rate,
      saved_product_profile_id,
      inventory_item_id,
      application_batch_id,
      area_size_sqm_snapshot,
      rate_per_sqm,
      rate_unit
    ) values (
      v_activity_id,
      coalesce(nullif(trim(v_profile.official_name), ''), v_product_label),
      nullif(trim(v_profile.manufacturer), ''),
      (v_area_entry ->> 'applicationAmount')::numeric,
      p_application_unit,
      public._inventory_creation_format_quantity((v_area_entry ->> 'applicationAmount')::numeric)
        || ' ' || p_application_unit,
      p_saved_product_profile_id,
      p_inventory_item_id,
      v_batch_id,
      (v_area_entry ->> 'areaSizeSqmSnapshot')::numeric,
      (v_area_entry ->> 'ratePerSqm')::numeric,
      v_area_entry ->> 'rateUnit'
    );

    insert into public.fertilizer_application_areas (
      application_batch_id,
      activity_id,
      area_id,
      area_name_snapshot,
      area_size_sqm_snapshot,
      application_amount,
      application_unit,
      rate_per_sqm,
      rate_unit,
      sort_order
    ) values (
      v_batch_id,
      v_activity_id,
      v_area_id,
      v_area_entry ->> 'areaNameSnapshot',
      (v_area_entry ->> 'areaSizeSqmSnapshot')::numeric,
      (v_area_entry ->> 'applicationAmount')::numeric,
      p_application_unit,
      (v_area_entry ->> 'ratePerSqm')::numeric,
      v_area_entry ->> 'rateUnit',
      (v_area_entry ->> 'sortOrder')::integer
    );

    v_result_areas := v_result_areas || jsonb_build_array(
      jsonb_build_object(
        'areaId', v_area_id,
        'activityId', v_activity_id,
        'fertilizationDetailId', v_activity_id,
        'applicationAmount', (v_area_entry ->> 'applicationAmount')::numeric,
        'applicationUnit', p_application_unit,
        'ratePerSqm', (v_area_entry ->> 'ratePerSqm')::numeric,
        'rateUnit', v_area_entry ->> 'rateUnit',
        'sortOrder', (v_area_entry ->> 'sortOrder')::integer
      )
    );
  end loop;

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
    application_batch_id,
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
    coalesce(v_source_event_ref, 'batch:' || v_batch_id::text),
    v_note,
    v_primary_activity_id,
    v_batch_id,
    v_now,
    null
  );

  v_resulting_balance := v_balance + v_quantity_delta;

  update public.fertilizer_application_batches
  set
    movement_id = v_movement_id,
    completed_at = v_now,
    result_jsonb = jsonb_build_object(
      'applicationBatchId', v_batch_id,
      'inventoryItemId', p_inventory_item_id,
      'savedProductProfileId', p_saved_product_profile_id,
      'applicationMode', p_application_mode,
      'selectionSource', p_selection_source,
      'careGroupId', v_care_group_id,
      'totalApplicationAmount', p_total_application_amount,
      'applicationUnit', p_application_unit,
      'appliedAt', p_applied_at,
      'movementId', v_movement_id,
      'primaryActivityId', v_primary_activity_id,
      'resultingBalance', v_resulting_balance,
      'areas', v_result_areas,
      'idempotentReplay', false
    )
  where id = v_batch_id;

  return (
    select result_jsonb || jsonb_build_object('idempotentReplay', false)
    from public.fertilizer_application_batches
    where id = v_batch_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security and grants
-- ---------------------------------------------------------------------------

alter table public.fertilizer_application_batches enable row level security;
alter table public.fertilizer_application_areas enable row level security;

revoke all on public.fertilizer_application_batches from public;
revoke all on public.fertilizer_application_batches from authenticated, anon;
revoke all on public.fertilizer_application_areas from public;
revoke all on public.fertilizer_application_areas from authenticated, anon;

grant select on public.fertilizer_application_batches to authenticated;
grant all on public.fertilizer_application_batches to service_role;

grant select on public.fertilizer_application_areas to authenticated;
grant all on public.fertilizer_application_areas to service_role;

drop policy if exists fertilizer_application_batches_select_own on public.fertilizer_application_batches;
create policy fertilizer_application_batches_select_own
  on public.fertilizer_application_batches
  for select
  using (user_id = auth.uid());

drop policy if exists fertilizer_application_areas_select_own on public.fertilizer_application_areas;
create policy fertilizer_application_areas_select_own
  on public.fertilizer_application_areas
  for select
  using (
    exists (
      select 1
      from public.fertilizer_application_batches b
      where b.id = application_batch_id
        and b.user_id = auth.uid()
    )
  );

revoke all on function public.apply_fertilizer_inventory_item_to_areas(
  uuid,
  uuid,
  text,
  text,
  numeric,
  text,
  numeric,
  text,
  timestamptz,
  text,
  jsonb,
  uuid,
  text,
  text,
  uuid
) from public;

grant execute on function public.apply_fertilizer_inventory_item_to_areas(
  uuid,
  uuid,
  text,
  text,
  numeric,
  text,
  numeric,
  text,
  timestamptz,
  text,
  jsonb,
  uuid,
  text,
  text,
  uuid
) to authenticated, service_role;
