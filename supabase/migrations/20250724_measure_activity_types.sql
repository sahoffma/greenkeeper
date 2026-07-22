-- Erweiterung: Journal für alle Rasenpflegemaßnahmen (nicht nur Düngung)

alter type public.activity_type add value if not exists 'mowing';
alter type public.activity_type add value if not exists 'watering';
alter type public.activity_type add value if not exists 'aerating';
alter type public.activity_type add value if not exists 'overseeding';
alter type public.activity_type add value if not exists 'application';
alter type public.activity_type add value if not exists 'other';

create table if not exists public.measure_details (
  activity_id     uuid primary key references public.activities (id) on delete cascade,
  product_name    text,
  amount_applied  numeric,
  amount_unit     text,
  mow_height_mm   numeric,
  application_rate text
);

comment on table public.measure_details is 'Typ-spezifische Details für Maßnahmen außer Düngung.';

create or replace function public.validate_measure_activity_type()
returns trigger
language plpgsql
as $$
declare
  actual_type public.activity_type;
begin
  select activity_type into actual_type
  from public.activities
  where id = new.activity_id;

  if actual_type is null then
    raise exception 'activity % not found', new.activity_id;
  end if;

  if actual_type = 'fertilization' then
    raise exception 'measure_details require activity_type other than fertilization';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_measure_details_activity_type on public.measure_details;

create trigger validate_measure_details_activity_type
  before insert or update on public.measure_details
  for each row execute function public.validate_measure_activity_type();

alter table public.measure_details enable row level security;

create policy "measure_details_select_own"
  on public.measure_details for select
  using (
    exists (
      select 1
      from public.activities act
      where act.id = measure_details.activity_id
        and act.user_id = auth.uid()
    )
  );

create policy "measure_details_insert_own"
  on public.measure_details for insert
  with check (
    exists (
      select 1
      from public.activities act
      where act.id = measure_details.activity_id
        and act.user_id = auth.uid()
    )
  );

create policy "measure_details_update_own"
  on public.measure_details for update
  using (
    exists (
      select 1
      from public.activities act
      where act.id = measure_details.activity_id
        and act.user_id = auth.uid()
    )
  );

create policy "measure_details_delete_own"
  on public.measure_details for delete
  using (
    exists (
      select 1
      from public.activities act
      where act.id = measure_details.activity_id
        and act.user_id = auth.uid()
    )
  );
