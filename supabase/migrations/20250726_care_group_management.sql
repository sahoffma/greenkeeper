-- Flächengruppen (care_groups): Verwaltung, RPCs und Bereinigung ungültiger Gruppen (< 2 Mitglieder)

create or replace function public.prune_care_groups(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  delete from public.care_groups cg
  where cg.user_id = p_user_id
    and cg.archived_at is null
    and (
      select count(*)
      from public.care_group_areas cga
      where cga.care_group_id = cg.id
    ) < 2;
end;
$$;

create or replace function public.prune_care_groups_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_group_id uuid;
begin
  v_group_id := coalesce(old.care_group_id, new.care_group_id);

  select cg.user_id
  into v_user_id
  from public.care_groups cg
  where cg.id = v_group_id;

  if v_user_id is not null then
    perform public.prune_care_groups(v_user_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists care_group_areas_prune on public.care_group_areas;

create trigger care_group_areas_prune
  after delete on public.care_group_areas
  for each row
  execute function public.prune_care_groups_after_membership_change();

create or replace function public.connect_areas_care_group(p_area_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_area_id uuid;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_area_ids is null or array_length(p_area_ids, 1) is null then
    raise exception 'INVALID_AREA_IDS';
  end if;

  select count(distinct x)
  into v_count
  from unnest(p_area_ids) as x;

  if v_count < 2 then
    raise exception 'MIN_TWO_AREAS_REQUIRED';
  end if;

  if v_count <> array_length(p_area_ids, 1) then
    raise exception 'DUPLICATE_AREA_IDS';
  end if;

  if exists (
    select 1
    from unnest(p_area_ids) as requested(area_id)
    left join public.areas a
      on a.id = requested.area_id
     and a.user_id = v_user_id
     and a.archived_at is null
    where a.id is null
  ) then
    raise exception 'FOREIGN_OR_MISSING_AREA';
  end if;

  if exists (
    select 1
    from public.care_group_areas cga
    where cga.area_id = any (p_area_ids)
  ) then
    raise exception 'AREA_ALREADY_GROUPED';
  end if;

  insert into public.care_groups (user_id, name, sort_order)
  values (v_user_id, 'Gemeinsam betrachtet', 0)
  returning id into v_group_id;

  foreach v_area_id in array p_area_ids loop
    insert into public.care_group_areas (care_group_id, area_id)
    values (v_group_id, v_area_id);
  end loop;

  perform public.prune_care_groups(v_user_id);

  return v_group_id;
end;
$$;

create or replace function public.disconnect_area_from_care_group(p_area_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_area_id is null then
    raise exception 'INVALID_AREA_ID';
  end if;

  if not public.user_owns_area(p_area_id) then
    raise exception 'FOREIGN_OR_MISSING_AREA';
  end if;

  delete from public.care_group_areas cga
  where cga.area_id = p_area_id;

  perform public.prune_care_groups(v_user_id);
end;
$$;

create or replace function public.dissolve_care_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_group_id is null then
    raise exception 'INVALID_GROUP_ID';
  end if;

  if not public.user_owns_care_group(p_group_id) then
    raise exception 'FOREIGN_OR_MISSING_GROUP';
  end if;

  delete from public.care_group_areas
  where care_group_id = p_group_id;

  delete from public.care_groups
  where id = p_group_id
    and user_id = v_user_id;

  perform public.prune_care_groups(v_user_id);
end;
$$;

revoke all on function public.prune_care_groups(uuid) from public;
grant execute on function public.prune_care_groups(uuid) to authenticated;

revoke all on function public.connect_areas_care_group(uuid[]) from public;
grant execute on function public.connect_areas_care_group(uuid[]) to authenticated;

revoke all on function public.disconnect_area_from_care_group(uuid) from public;
grant execute on function public.disconnect_area_from_care_group(uuid) to authenticated;

revoke all on function public.dissolve_care_group(uuid) from public;
grant execute on function public.dissolve_care_group(uuid) to authenticated;

-- Onboarding: getrennt = keine Gruppe; gemeinsam = eine Gruppe ab 2 Flächen; einzelne Fläche = unverbunden
create or replace function public.complete_onboarding(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_completed_at timestamptz;
  v_areas jsonb;
  v_care_mode text;
  v_area_count integer;
  v_idx integer;
  v_area_id uuid;
  v_group_id uuid;
  v_area_ids uuid[] := array[]::uuid[];
  v_care_group_ids uuid[] := array[]::uuid[];
  v_memberships jsonb := '[]'::jsonb;
  v_name text;
  v_size_sqm numeric(10, 2);
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform 1
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  select onboarding_completed_at
  into v_completed_at
  from public.profiles
  where id = v_user_id;

  if v_completed_at is not null then
    raise exception 'ONBOARDING_ALREADY_COMPLETED';
  end if;

  if exists (
    select 1
    from public.areas
    where user_id = v_user_id
      and archived_at is null
  ) then
    raise exception 'ACTIVE_AREAS_EXIST';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'INVALID_PAYLOAD';
  end if;

  v_areas := payload -> 'areas';
  v_care_mode := payload ->> 'care_mode';

  if v_areas is null or jsonb_typeof(v_areas) <> 'array' then
    raise exception 'INVALID_AREAS';
  end if;

  v_area_count := jsonb_array_length(v_areas);

  if v_area_count < 1 or v_area_count > 20 then
    raise exception 'INVALID_AREA_COUNT';
  end if;

  if v_care_mode not in ('single', 'together', 'separate') then
    raise exception 'INVALID_CARE_MODE';
  end if;

  if v_area_count = 1 and v_care_mode <> 'single' then
    raise exception 'INVALID_CARE_MODE_FOR_COUNT';
  end if;

  if v_area_count > 1 and v_care_mode = 'single' then
    raise exception 'INVALID_CARE_MODE_FOR_COUNT';
  end if;

  for v_idx in 0..(v_area_count - 1) loop
    v_name := trim(both from coalesce(v_areas -> v_idx ->> 'name', ''));

    if v_name = '' then
      raise exception 'EMPTY_AREA_NAME';
    end if;

    if v_areas -> v_idx -> 'size_sqm' is null
      or v_areas -> v_idx -> 'size_sqm' = 'null'::jsonb then
      continue;
    end if;

    if jsonb_typeof(v_areas -> v_idx -> 'size_sqm') <> 'number' then
      raise exception 'INVALID_AREA_SIZE';
    end if;

    v_size_sqm := (v_areas -> v_idx ->> 'size_sqm')::numeric(10, 2);

    if v_size_sqm <= 0 then
      raise exception 'INVALID_AREA_SIZE';
    end if;
  end loop;

  for v_idx in 0..(v_area_count - 1) loop
    v_name := trim(both from v_areas -> v_idx ->> 'name');

    if v_areas -> v_idx -> 'size_sqm' is null
      or v_areas -> v_idx -> 'size_sqm' = 'null'::jsonb then
      v_size_sqm := null;
    else
      v_size_sqm := (v_areas -> v_idx ->> 'size_sqm')::numeric(10, 2);
    end if;

    insert into public.areas (user_id, name, size_sqm, sort_order)
    values (v_user_id, v_name, v_size_sqm, v_idx)
    returning id into v_area_id;

    v_area_ids := array_append(v_area_ids, v_area_id);
  end loop;

  if v_care_mode = 'together' and v_area_count >= 2 then
    insert into public.care_groups (user_id, name, sort_order)
    values (v_user_id, 'Gemeinsam betrachtet', 0)
    returning id into v_group_id;

    v_care_group_ids := array_append(v_care_group_ids, v_group_id);

    foreach v_area_id in array v_area_ids loop
      insert into public.care_group_areas (care_group_id, area_id)
      values (v_group_id, v_area_id);

      v_memberships := v_memberships || jsonb_build_array(
        jsonb_build_object(
          'care_group_id', v_group_id,
          'area_id', v_area_id
        )
      );
    end loop;
  end if;

  update public.profiles
  set onboarding_completed_at = timezone('utc', now())
  where id = v_user_id
  returning onboarding_completed_at into v_completed_at;

  return jsonb_build_object(
    'onboarding_completed_at', v_completed_at,
    'area_ids', to_jsonb(v_area_ids),
    'care_group_ids', to_jsonb(v_care_group_ids),
    'memberships', v_memberships
  );
end;
$$;

comment on function public.connect_areas_care_group(uuid[]) is
  'Verbindet mindestens zwei ungruppierte Rasenflächen des Nutzers in einer Pflegegruppe.';

comment on function public.disconnect_area_from_care_group(uuid) is
  'Entfernt eine Rasenfläche aus ihrer Pflegegruppe und bereinigt ungültige Gruppen.';

comment on function public.dissolve_care_group(uuid) is
  'Hebt eine gemeinsame Betrachtung auf, ohne Rasenflächen zu löschen.';

-- Bestehende Einzelgruppen (altes separate-Modell) auflösen
delete from public.care_groups cg
where (
  select count(*)
  from public.care_group_areas cga
  where cga.care_group_id = cg.id
) < 2;
