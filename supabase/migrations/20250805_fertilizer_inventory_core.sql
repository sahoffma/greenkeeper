-- GA-014 Phase 7a — Inventory Core (additive schema on legacy fertilizer inventory tables)
-- DL-018..DL-025 / AD-7A: product version binding, access scope, append-only movements, no stored balance.

-- ---------------------------------------------------------------------------
-- fertilizer_containers — Inventory Item (physical package)
-- ---------------------------------------------------------------------------

alter table public.fertilizer_containers
  alter column user_id drop not null;

alter table public.fertilizer_containers
  alter column package_size_value type numeric(18, 4)
  using package_size_value::numeric(18, 4);

alter table public.fertilizer_containers
  add column if not exists saved_product_profile_id uuid references public.product_profiles (id) on delete restrict,
  add column if not exists access_kind text,
  add column if not exists session_access_hash text,
  add column if not exists base_unit text;

alter table public.fertilizer_containers
  drop constraint if exists fertilizer_containers_check;

alter table public.fertilizer_containers
  add constraint fertilizer_containers_access_kind_check
    check (access_kind is null or access_kind in ('authenticated_user', 'session'));

alter table public.fertilizer_containers
  add constraint fertilizer_containers_base_unit_check
    check (base_unit is null or base_unit in ('kg', 'ml'));

alter table public.fertilizer_containers
  add constraint fertilizer_containers_access_context_check
    check (
      access_kind is null
      or (
        access_kind = 'authenticated_user'
        and user_id is not null
        and session_access_hash is null
      )
      or (
        access_kind = 'session'
        and user_id is null
        and session_access_hash is not null
      )
    );

alter table public.fertilizer_containers
  add constraint fertilizer_containers_session_hash_format_check
    check (
      access_kind is distinct from 'session'
      or (
        length(session_access_hash) = 64
        and session_access_hash ~ '^[0-9a-f]{64}$'
      )
    );

alter table public.fertilizer_containers
  add constraint fertilizer_containers_package_size_unit_check
    check (
      package_size_unit is null
      or access_kind is null
      or package_size_unit in ('kg', 'ml')
    );

alter table public.fertilizer_containers
  add constraint fertilizer_containers_package_size_pair_check
    check (
      (package_size_value is null and package_size_unit is null)
      or (package_size_value is not null and package_size_unit is not null)
    );

alter table public.fertilizer_containers
  add constraint fertilizer_containers_package_size_base_unit_check
    check (
      package_size_unit is null
      or base_unit is null
      or package_size_unit = base_unit
    );

alter table public.fertilizer_containers
  add constraint fertilizer_containers_product_binding_check
    check (
      (
        saved_product_profile_id is null
        and access_kind is null
        and user_id is not null
        and (
          (product_id is not null and recognition_candidate_id is null)
          or (product_id is null and recognition_candidate_id is not null)
        )
      )
      or (
        saved_product_profile_id is not null
        and product_id is null
        and recognition_candidate_id is null
        and access_kind is not null
        and base_unit is not null
      )
    );

comment on column public.fertilizer_containers.saved_product_profile_id is
  'FK to immutable enrichment-saved product version (product_profiles.profile_status = saved).';

comment on column public.fertilizer_containers.session_access_hash is
  'Server-derived HMAC-SHA-256 hex (64 lowercase chars); never client input or raw session_id.';

comment on column public.fertilizer_containers.base_unit is
  'Internal inventory base unit (DL-021): kg for granular, ml for liquid.';

create index if not exists fertilizer_containers_saved_product_profile_idx
  on public.fertilizer_containers (saved_product_profile_id)
  where saved_product_profile_id is not null;

create index if not exists fertilizer_containers_auth_saved_profile_idx
  on public.fertilizer_containers (user_id, saved_product_profile_id)
  where access_kind = 'authenticated_user';

create index if not exists fertilizer_containers_session_saved_profile_idx
  on public.fertilizer_containers (session_access_hash, saved_product_profile_id)
  where access_kind = 'session';

-- ---------------------------------------------------------------------------
-- fertilizer_stock_movements — Inventory Movement (append-only)
-- ---------------------------------------------------------------------------

alter table public.fertilizer_stock_movements
  alter column user_id drop not null;

alter table public.fertilizer_stock_movements
  alter column quantity_delta type numeric(18, 4)
  using quantity_delta::numeric(18, 4);

alter table public.fertilizer_stock_movements
  add column if not exists access_kind text,
  add column if not exists session_access_hash text,
  add column if not exists inventory_idempotency_key text,
  add column if not exists source_event_ref text,
  add column if not exists movement_at timestamptz;

alter table public.fertilizer_stock_movements
  add constraint fertilizer_stock_movements_access_kind_check
    check (access_kind is null or access_kind in ('authenticated_user', 'session'));

alter table public.fertilizer_stock_movements
  add constraint fertilizer_stock_movements_access_context_check
    check (
      access_kind is null
      or (
        access_kind = 'authenticated_user'
        and user_id is not null
        and session_access_hash is null
      )
      or (
        access_kind = 'session'
        and user_id is null
        and session_access_hash is not null
      )
    );

alter table public.fertilizer_stock_movements
  add constraint fertilizer_stock_movements_session_hash_format_check
    check (
      access_kind is distinct from 'session'
      or (
        length(session_access_hash) = 64
        and session_access_hash ~ '^[0-9a-f]{64}$'
      )
    );

alter table public.fertilizer_stock_movements
  add constraint fertilizer_stock_movements_core_unit_check
    check (
      access_kind is null
      or unit in ('kg', 'ml')
    );

alter table public.fertilizer_stock_movements
  add constraint fertilizer_stock_movements_core_movement_at_check
    check (
      access_kind is null
      or movement_at is not null
    );

comment on column public.fertilizer_stock_movements.inventory_idempotency_key is
  'Idempotency key for Phase 7a inventory core writes (separate from capture_idempotency_key).';

comment on column public.fertilizer_stock_movements.movement_at is
  'Timestamptz for Phase 7a inventory core movements; legacy rows keep movement_date.';

comment on column public.fertilizer_stock_movements.source_event_ref is
  'Optional opaque reference to an originating domain event (journal/system/manual).';

create index if not exists fertilizer_stock_movements_container_movement_at_idx
  on public.fertilizer_stock_movements (container_id, movement_at)
  where movement_at is not null;

create unique index if not exists fertilizer_stock_movements_auth_inventory_idempotency_idx
  on public.fertilizer_stock_movements (user_id, inventory_idempotency_key)
  where access_kind = 'authenticated_user' and inventory_idempotency_key is not null;

create unique index if not exists fertilizer_stock_movements_session_inventory_idempotency_idx
  on public.fertilizer_stock_movements (session_access_hash, inventory_idempotency_key)
  where access_kind = 'session' and inventory_idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- Validation triggers (core path only where noted)
-- ---------------------------------------------------------------------------

create or replace function public.validate_fertilizer_container_saved_product_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.saved_product_profile_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.product_profiles pp
    where pp.id = new.saved_product_profile_id
      and pp.profile_status = 'saved'
      and pp.source = 'enrichment'
  ) then
    raise exception 'INVALID_SAVED_PRODUCT_PROFILE_REFERENCE';
  end if;

  return new;
end;
$$;

create or replace function public.validate_fertilizer_container_base_unit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product_form text;
begin
  if new.saved_product_profile_id is null or new.base_unit is null then
    return new;
  end if;

  select pp.product_form
  into v_product_form
  from public.product_profiles pp
  where pp.id = new.saved_product_profile_id;

  if v_product_form = 'granular' and new.base_unit <> 'kg' then
    raise exception 'INVENTORY_BASE_UNIT_PRODUCT_FORM_MISMATCH';
  end if;

  if v_product_form = 'liquid' and new.base_unit <> 'ml' then
    raise exception 'INVENTORY_BASE_UNIT_PRODUCT_FORM_MISMATCH';
  end if;

  return new;
end;
$$;

create or replace function public.validate_fertilizer_stock_movement_unit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_base_unit text;
begin
  select fc.base_unit
  into v_base_unit
  from public.fertilizer_containers fc
  where fc.id = new.container_id;

  if v_base_unit is not null and new.unit is distinct from v_base_unit then
    raise exception 'INVENTORY_MOVEMENT_UNIT_MISMATCH';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_fertilizer_stock_movement_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'INVENTORY_MOVEMENT_IMMUTABLE';
end;
$$;

drop trigger if exists validate_fertilizer_container_saved_product_profile
  on public.fertilizer_containers;

create trigger validate_fertilizer_container_saved_product_profile
  before insert or update on public.fertilizer_containers
  for each row
  execute function public.validate_fertilizer_container_saved_product_profile();

drop trigger if exists validate_fertilizer_container_base_unit
  on public.fertilizer_containers;

create trigger validate_fertilizer_container_base_unit
  before insert or update on public.fertilizer_containers
  for each row
  execute function public.validate_fertilizer_container_base_unit();

drop trigger if exists validate_fertilizer_stock_movement_unit
  on public.fertilizer_stock_movements;

create trigger validate_fertilizer_stock_movement_unit
  before insert on public.fertilizer_stock_movements
  for each row
  execute function public.validate_fertilizer_stock_movement_unit();

drop trigger if exists prevent_fertilizer_stock_movement_update
  on public.fertilizer_stock_movements;

create trigger prevent_fertilizer_stock_movement_update
  before update on public.fertilizer_stock_movements
  for each row
  execute function public.prevent_fertilizer_stock_movement_mutation();

drop trigger if exists prevent_fertilizer_stock_movement_delete
  on public.fertilizer_stock_movements;

create trigger prevent_fertilizer_stock_movement_delete
  before delete on public.fertilizer_stock_movements
  for each row
  execute function public.prevent_fertilizer_stock_movement_mutation();

-- ---------------------------------------------------------------------------
-- Atomic append-only movement booking (Phase 7a — DL-019, DL-025)
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

  select *
  into v_item
  from public.fertilizer_containers fc
  where fc.id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'INVENTORY_ITEM_NOT_FOUND';
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
  uuid,
  text,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text,
  uuid,
  timestamptz
) from public;

grant execute on function public.append_fertilizer_inventory_core_movement(
  uuid,
  text,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text,
  uuid,
  timestamptz
) to authenticated, service_role;
