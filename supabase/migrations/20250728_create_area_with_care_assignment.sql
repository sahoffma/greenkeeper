-- Atomare Anlage einer Rasenfläche mit optionaler Zuordnung zu bestehender Betrachtung

create or replace function public.create_area_with_care_assignment(
  p_name text,
  p_size_sqm numeric(10, 2) default null,
  p_join_care_group_id uuid default null,
  p_join_area_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_sort_order integer;
  v_area_id uuid;
  v_group_id uuid;
  v_group_member_count integer;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_name := trim(both from coalesce(p_name, ''));

  if v_name = '' then
    raise exception 'EMPTY_AREA_NAME';
  end if;

  if p_size_sqm is not null and p_size_sqm <= 0 then
    raise exception 'INVALID_AREA_SIZE';
  end if;

  if p_join_care_group_id is not null and p_join_area_id is not null then
    raise exception 'INVALID_CARE_TARGET';
  end if;

  if p_join_care_group_id is not null then
    if not public.user_owns_care_group(p_join_care_group_id) then
      raise exception 'FOREIGN_OR_MISSING_GROUP';
    end if;

    select count(*)
    into v_group_member_count
    from public.care_group_areas cga
    where cga.care_group_id = p_join_care_group_id;

    if v_group_member_count < 2 then
      raise exception 'FOREIGN_OR_MISSING_GROUP';
    end if;
  end if;

  if p_join_area_id is not null then
    if not public.user_owns_area(p_join_area_id) then
      raise exception 'FOREIGN_OR_MISSING_AREA';
    end if;

    if exists (
      select 1
      from public.care_group_areas cga
      where cga.area_id = p_join_area_id
    ) then
      raise exception 'AREA_ALREADY_GROUPED';
    end if;
  end if;

  select coalesce(max(a.sort_order), -1) + 1
  into v_sort_order
  from public.areas a
  where a.user_id = v_user_id
    and a.archived_at is null;

  insert into public.areas (user_id, name, size_sqm, sort_order)
  values (v_user_id, v_name, p_size_sqm, v_sort_order)
  returning id into v_area_id;

  if p_join_care_group_id is not null then
    insert into public.care_group_areas (care_group_id, area_id)
    values (p_join_care_group_id, v_area_id);
  elsif p_join_area_id is not null then
    insert into public.care_groups (user_id, name, sort_order)
    values (v_user_id, 'Gemeinsam betrachtet', 0)
    returning id into v_group_id;

    insert into public.care_group_areas (care_group_id, area_id)
    values
      (v_group_id, p_join_area_id),
      (v_group_id, v_area_id);
  end if;

  return jsonb_build_object(
    'id', v_area_id,
    'name', v_name,
    'size_sqm', p_size_sqm
  );
end;
$$;

comment on function public.create_area_with_care_assignment(text, numeric, uuid, uuid) is
  'Legt eine Rasenfläche an und ordnet sie optional einer bestehenden Betrachtung oder einer einzelnen Fläche zu.';

revoke all on function public.create_area_with_care_assignment(text, numeric, uuid, uuid) from public;
grant execute on function public.create_area_with_care_assignment(text, numeric, uuid, uuid) to authenticated;
