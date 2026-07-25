-- Onboarding-Abschluss, Pflegegruppen und atomare Speicherung

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.profiles.onboarding_completed_at is
  'Zeitpunkt des vollständigen Onboarding-Abschlusses; NULL solange Onboarding offen.';

create table if not exists public.care_groups (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  sort_order    integer not null default 0,
  archived_at   timestamptz,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

comment on table public.care_groups is
  'Pflegegruppen: welche Rasenflächen im Alltag gemeinsam angesprochen werden.';

create index if not exists idx_care_groups_user_id on public.care_groups (user_id);
create index if not exists idx_care_groups_user_active on public.care_groups (user_id, sort_order)
  where archived_at is null;

create table if not exists public.care_group_areas (
  care_group_id uuid not null references public.care_groups (id) on delete cascade,
  area_id       uuid not null references public.areas (id) on delete cascade,
  created_at    timestamptz not null default timezone('utc', now()),
  primary key (care_group_id, area_id),
  constraint care_group_areas_area_id_unique unique (area_id)
);

comment on table public.care_group_areas is
  'Zuordnung zwischen Pflegegruppen und Rasenflächen. Pro Fläche genau eine Zuordnung.';

create index if not exists idx_care_group_areas_group_id on public.care_group_areas (care_group_id);

drop trigger if exists set_care_groups_updated_at on public.care_groups;

create trigger set_care_groups_updated_at
  before update on public.care_groups
  for each row execute function public.set_updated_at();

create or replace function public.user_owns_care_group(p_care_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.care_groups cg
    where cg.id = p_care_group_id
      and cg.user_id = (select auth.uid())
  );
$$;

alter table public.care_groups enable row level security;
alter table public.care_group_areas enable row level security;

drop policy if exists "care_groups_select_own" on public.care_groups;
create policy "care_groups_select_own"
  on public.care_groups for select
  using ((select auth.uid()) = user_id);

drop policy if exists "care_groups_insert_own" on public.care_groups;
create policy "care_groups_insert_own"
  on public.care_groups for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "care_groups_update_own" on public.care_groups;
create policy "care_groups_update_own"
  on public.care_groups for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "care_groups_delete_own" on public.care_groups;
create policy "care_groups_delete_own"
  on public.care_groups for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "care_group_areas_select_own" on public.care_group_areas;
create policy "care_group_areas_select_own"
  on public.care_group_areas for select
  using (
    public.user_owns_care_group(care_group_id)
    and public.user_owns_area(area_id)
  );

drop policy if exists "care_group_areas_insert_own" on public.care_group_areas;
create policy "care_group_areas_insert_own"
  on public.care_group_areas for insert
  with check (
    public.user_owns_care_group(care_group_id)
    and public.user_owns_area(area_id)
  );

drop policy if exists "care_group_areas_update_own" on public.care_group_areas;
create policy "care_group_areas_update_own"
  on public.care_group_areas for update
  using (
    public.user_owns_care_group(care_group_id)
    and public.user_owns_area(area_id)
  )
  with check (
    public.user_owns_care_group(care_group_id)
    and public.user_owns_area(area_id)
  );

drop policy if exists "care_group_areas_delete_own" on public.care_group_areas;
create policy "care_group_areas_delete_own"
  on public.care_group_areas for delete
  using (
    public.user_owns_care_group(care_group_id)
    and public.user_owns_area(area_id)
  );

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

  if v_care_mode in ('single', 'together') then
    insert into public.care_groups (user_id, name, sort_order)
    values (v_user_id, 'Meine Rasenflächen', 0)
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
  else
    for v_idx in 1..coalesce(array_length(v_area_ids, 1), 0) loop
      v_area_id := v_area_ids[v_idx];

      insert into public.care_groups (user_id, name, sort_order)
      values (v_user_id, 'Pflege Rasenfläche ' || v_idx, v_idx - 1)
      returning id into v_group_id;

      v_care_group_ids := array_append(v_care_group_ids, v_group_id);

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

comment on function public.complete_onboarding(jsonb) is
  'Atomarer Onboarding-Abschluss: Flächen, Pflegegruppen, Zuordnungen und Abschlussstatus.';

revoke all on function public.complete_onboarding(jsonb) from public;
grant execute on function public.complete_onboarding(jsonb) to authenticated;

-- Backfill: Nutzer mit bestehenden aktiven Flächen gelten als abgeschlossen.
update public.profiles p
set onboarding_completed_at = timezone('utc', now())
where p.onboarding_completed_at is null
  and exists (
    select 1
    from public.areas a
    where a.user_id = p.id
      and a.archived_at is null
  );

-- Backfill: jede bestehende Fläche erhält konservativ eine eigene Pflegegruppe.
do $$
declare
  area_row record;
  new_group_id uuid;
begin
  for area_row in
    select
      a.id as area_id,
      a.user_id,
      a.name,
      coalesce(a.sort_order, 0) as sort_order
    from public.areas a
    where a.archived_at is null
      and not exists (
        select 1
        from public.care_group_areas cga
        where cga.area_id = a.id
      )
    order by a.user_id, a.sort_order, a.created_at
  loop
    insert into public.care_groups (user_id, name, sort_order)
    values (area_row.user_id, 'Pflege ' || area_row.name, area_row.sort_order)
    returning id into new_group_id;

    insert into public.care_group_areas (care_group_id, area_id)
    values (new_group_id, area_row.area_id);
  end loop;
end;
$$;
