-- Rasenflächen: Titelbild-Pfad, Update-RPCs und privater Storage-Bucket lawn-images

alter table public.areas
  add column if not exists cover_image_path text;

comment on column public.areas.cover_image_path is
  'Relativer Pfad im privaten Bucket lawn-images, z. B. {user_id}/{area_id}/cover-{uuid}.jpg';

create or replace function public.validate_area_cover_path(
  p_user_id uuid,
  p_area_id uuid,
  p_cover_image_path text
)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_cover_image_path is null or p_cover_image_path = '' then
    return false;
  end if;

  return p_cover_image_path ~ (
    '^' || p_user_id::text || '/' || p_area_id::text || '/cover-[0-9a-f-]+\.jpg$'
  );
end;
$$;

create or replace function public.update_area_details(
  p_area_id uuid,
  p_name text,
  p_size_sqm numeric(10, 2)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_row public.areas%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not public.user_owns_area(p_area_id) then
    raise exception 'FOREIGN_OR_MISSING_AREA';
  end if;

  v_name := trim(both from coalesce(p_name, ''));

  if v_name = '' then
    raise exception 'EMPTY_AREA_NAME';
  end if;

  if p_size_sqm is null or p_size_sqm <= 0 then
    raise exception 'INVALID_AREA_SIZE';
  end if;

  update public.areas
  set
    name = v_name,
    size_sqm = p_size_sqm,
    updated_at = timezone('utc', now())
  where id = p_area_id
    and user_id = v_user_id
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'size_sqm', v_row.size_sqm,
    'cover_image_path', v_row.cover_image_path
  );
end;
$$;

create or replace function public.set_area_cover_image(
  p_area_id uuid,
  p_cover_image_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_path text;
  v_row public.areas%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not public.user_owns_area(p_area_id) then
    raise exception 'FOREIGN_OR_MISSING_AREA';
  end if;

  if not public.validate_area_cover_path(v_user_id, p_area_id, p_cover_image_path) then
    raise exception 'INVALID_COVER_PATH';
  end if;

  select cover_image_path
  into v_old_path
  from public.areas
  where id = p_area_id
    and user_id = v_user_id
  for update;

  update public.areas
  set
    cover_image_path = p_cover_image_path,
    updated_at = timezone('utc', now())
  where id = p_area_id
    and user_id = v_user_id
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'cover_image_path', v_row.cover_image_path,
    'old_cover_image_path', v_old_path
  );
end;
$$;

create or replace function public.remove_area_cover_image(p_area_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_path text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not public.user_owns_area(p_area_id) then
    raise exception 'FOREIGN_OR_MISSING_AREA';
  end if;

  select cover_image_path
  into v_old_path
  from public.areas
  where id = p_area_id
    and user_id = v_user_id
  for update;

  update public.areas
  set
    cover_image_path = null,
    updated_at = timezone('utc', now())
  where id = p_area_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'id', p_area_id,
    'old_cover_image_path', v_old_path
  );
end;
$$;

comment on function public.update_area_details(uuid, text, numeric) is
  'Aktualisiert Name und Größe einer eigenen Rasenfläche.';

comment on function public.set_area_cover_image(uuid, text) is
  'Setzt den Titelbild-Pfad nach validiertem Upload. Gibt den vorherigen Pfad zurück.';

comment on function public.remove_area_cover_image(uuid) is
  'Entfernt den Titelbild-Pfad. Gibt den vorherigen Pfad für Storage-Cleanup zurück.';

revoke all on function public.update_area_details(uuid, text, numeric) from public;
grant execute on function public.update_area_details(uuid, text, numeric) to authenticated;

revoke all on function public.set_area_cover_image(uuid, text) from public;
grant execute on function public.set_area_cover_image(uuid, text) to authenticated;

revoke all on function public.remove_area_cover_image(uuid) from public;
grant execute on function public.remove_area_cover_image(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lawn-images',
  'lawn-images',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lawn_images_select_own" on storage.objects;
drop policy if exists "lawn_images_insert_own" on storage.objects;
drop policy if exists "lawn_images_update_own" on storage.objects;
drop policy if exists "lawn_images_delete_own" on storage.objects;

create policy "lawn_images_select_own"
  on storage.objects for select
  using (
    bucket_id = 'lawn-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "lawn_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'lawn-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "lawn_images_update_own"
  on storage.objects for update
  using (
    bucket_id = 'lawn-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'lawn-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "lawn_images_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'lawn-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
