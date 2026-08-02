-- GA-015 Phase 4: active canonical product stock read model

-- ---------------------------------------------------------------------------
-- Effective balance (canonical items only; movement_at required)
-- ---------------------------------------------------------------------------

create or replace function public._fertilizer_product_stock_effective_balance(p_container_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(fsm.quantity_delta), 0)
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_container_id
    and fsm.user_id = auth.uid()
    and fsm.movement_at is not null;
$$;

revoke all on function public._fertilizer_product_stock_effective_balance(uuid) from public;

-- ---------------------------------------------------------------------------
-- Active canonical product stock list (read-only)
-- ---------------------------------------------------------------------------

create or replace function public.list_active_fertilizer_product_stock()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_items jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'FERTILIZER_PRODUCT_STOCK_READ_ACCESS_DENIED';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'inventoryItemId', fc.id,
        'savedProductProfileId', fc.saved_product_profile_id,
        'baseUnit', fc.base_unit,
        'balance', public._fertilizer_product_stock_effective_balance(fc.id),
        'manufacturer', pp.manufacturer,
        'officialName', pp.official_name,
        'productForm', pp.product_form,
        'movementCount', (
          select count(*)::integer
          from public.fertilizer_stock_movements fsm
          where fsm.container_id = fc.id
            and fsm.user_id = v_user_id
            and fsm.movement_at is not null
        ),
        'lastMovementAt', (
          select max(fsm.movement_at)
          from public.fertilizer_stock_movements fsm
          where fsm.container_id = fc.id
            and fsm.user_id = v_user_id
            and fsm.movement_at is not null
        )
      )
      order by coalesce(pp.manufacturer, ''), coalesce(pp.official_name, ''), fc.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.fertilizer_containers fc
  inner join public.product_profiles pp
    on pp.id = fc.saved_product_profile_id
  where fc.user_id = v_user_id
    and fc.access_kind = 'authenticated_user'
    and fc.stock_kind = 'product_stock'
    and fc.archived_at is null
    and fc.superseded_by_container_id is null
    and fc.saved_product_profile_id is not null
    and fc.base_unit in ('kg', 'ml')
    and pp.profile_status = 'saved'
    and pp.source = 'enrichment'
    and pp.user_id = v_user_id;

  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.list_active_fertilizer_product_stock() from public;
grant execute on function public.list_active_fertilizer_product_stock() to authenticated;

-- ---------------------------------------------------------------------------
-- Single active canonical product stock item (read-only)
-- ---------------------------------------------------------------------------

create or replace function public.get_active_fertilizer_product_stock_item(p_inventory_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_item jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'FERTILIZER_PRODUCT_STOCK_READ_ACCESS_DENIED';
  end if;

  select jsonb_build_object(
    'inventoryItemId', fc.id,
    'savedProductProfileId', fc.saved_product_profile_id,
    'baseUnit', fc.base_unit,
    'balance', public._fertilizer_product_stock_effective_balance(fc.id),
    'manufacturer', pp.manufacturer,
    'officialName', pp.official_name,
    'productForm', pp.product_form,
    'movementCount', (
      select count(*)::integer
      from public.fertilizer_stock_movements fsm
      where fsm.container_id = fc.id
        and fsm.user_id = v_user_id
        and fsm.movement_at is not null
    ),
    'lastMovementAt', (
      select max(fsm.movement_at)
      from public.fertilizer_stock_movements fsm
      where fsm.container_id = fc.id
        and fsm.user_id = v_user_id
        and fsm.movement_at is not null
    )
  )
  into v_item
  from public.fertilizer_containers fc
  inner join public.product_profiles pp
    on pp.id = fc.saved_product_profile_id
  where fc.id = p_inventory_item_id
    and fc.user_id = v_user_id
    and fc.access_kind = 'authenticated_user'
    and fc.stock_kind = 'product_stock'
    and fc.archived_at is null
    and fc.superseded_by_container_id is null
    and fc.saved_product_profile_id is not null
    and fc.base_unit in ('kg', 'ml')
    and pp.profile_status = 'saved'
    and pp.source = 'enrichment'
    and pp.user_id = v_user_id;

  if v_item is null then
    return null;
  end if;

  return jsonb_build_object('item', v_item);
end;
$$;

revoke all on function public.get_active_fertilizer_product_stock_item(uuid) from public;
grant execute on function public.get_active_fertilizer_product_stock_item(uuid) to authenticated;
