-- GM-008 / GA-012 — Persönlicher Düngerbestand (minimaler Erstumfang für Erfassungsflow)
-- Gebinde, Bestandsbewegungen, Recognition Candidates, atomare Speicher-RPC

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.fertilizer_movement_type as enum (
  'purchase',
  'initial_stock',
  'gift_received',
  'sale',
  'gifted_away',
  'disposal',
  'fertilization',
  'inventory_correction'
);

create type public.fertilizer_movement_origin as enum (
  'manual',
  'journal',
  'system',
  'migration'
);

-- ---------------------------------------------------------------------------
-- Recognition Candidates (persönlich, nicht verifiziert — kein Katalog-Write)
-- ---------------------------------------------------------------------------

create table public.fertilizer_recognition_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  catalog_product_id uuid references public.products (id) on delete set null,
  brand text,
  product_line text,
  product_name text,
  variant text,
  product_descriptor text,
  manufacturer text,
  npk text,
  package_size_value numeric,
  package_size_unit text,
  product_form text not null default 'unknown'
    check (product_form in ('granular', 'liquid', 'unknown')),
  identity_fingerprint text not null,
  identity_confidence numeric,
  data_completeness numeric,
  identity_origin text,
  recognition_snapshot jsonb,
  status text not null default 'accepted'
    check (status in ('pending_review', 'accepted')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, identity_fingerprint)
);

create index fertilizer_recognition_candidates_user_idx
  on public.fertilizer_recognition_candidates (user_id);

create trigger fertilizer_recognition_candidates_set_updated_at
  before update on public.fertilizer_recognition_candidates
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Gebinde (persönlicher Bestand — Ebene 2)
-- ---------------------------------------------------------------------------

create table public.fertilizer_containers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete restrict,
  recognition_candidate_id uuid references public.fertilizer_recognition_candidates (id) on delete restrict,
  package_size_value numeric,
  package_size_unit text,
  label text,
  created_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  check (
    (product_id is not null and recognition_candidate_id is null)
    or (product_id is null and recognition_candidate_id is not null)
  )
);

create index fertilizer_containers_user_idx on public.fertilizer_containers (user_id);
create index fertilizer_containers_product_idx on public.fertilizer_containers (product_id);
create index fertilizer_containers_candidate_idx on public.fertilizer_containers (recognition_candidate_id);

-- ---------------------------------------------------------------------------
-- Bestandsbewegungen (Ebene 3 — append-only, Saldo = Summe)
-- ---------------------------------------------------------------------------

create table public.fertilizer_stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  container_id uuid not null references public.fertilizer_containers (id) on delete restrict,
  movement_type public.fertilizer_movement_type not null,
  movement_origin public.fertilizer_movement_origin not null default 'manual',
  quantity_delta numeric not null check (quantity_delta <> 0),
  unit text not null,
  movement_date date not null default (timezone('utc', now()))::date,
  activity_id uuid references public.activities (id) on delete set null,
  capture_idempotency_key text,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index fertilizer_stock_movements_container_idx
  on public.fertilizer_stock_movements (container_id);

create index fertilizer_stock_movements_user_idx
  on public.fertilizer_stock_movements (user_id);

create unique index fertilizer_stock_movements_idempotency_idx
  on public.fertilizer_stock_movements (user_id, capture_idempotency_key, movement_type)
  where capture_idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- Erfassungsbelege (Idempotenz — kein Doppel-Speichern)
-- ---------------------------------------------------------------------------

create table public.fertilizer_capture_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  container_id uuid not null references public.fertilizer_containers (id) on delete restrict,
  catalog_product_id uuid references public.products (id) on delete set null,
  recognition_candidate_id uuid references public.fertilizer_recognition_candidates (id) on delete set null,
  product_label text not null,
  purchase_quantity numeric not null check (purchase_quantity > 0),
  purchase_unit text not null,
  previous_remainder numeric check (previous_remainder is null or previous_remainder >= 0),
  resulting_balance numeric not null check (resulting_balance >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

create or replace function public.user_owns_fertilizer_container(p_container_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fertilizer_containers fc
    where fc.id = p_container_id
      and fc.user_id = auth.uid()
      and fc.archived_at is null
  );
$$;

create or replace function public.fertilizer_container_balance(p_container_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(fsm.quantity_delta), 0)
  from public.fertilizer_stock_movements fsm
  where fsm.container_id = p_container_id
    and fsm.user_id = auth.uid();
$$;

create or replace function public.build_fertilizer_identity_fingerprint(
  p_brand text,
  p_product_line text,
  p_product_name text,
  p_variant text,
  p_npk text
)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '|' from concat_ws(
      '|',
      nullif(lower(trim(coalesce(p_brand, ''))), ''),
      nullif(lower(trim(coalesce(p_product_line, ''))), ''),
      nullif(lower(trim(coalesce(p_product_name, ''))), ''),
      nullif(lower(trim(coalesce(p_variant, ''))), ''),
      nullif(lower(trim(coalesce(p_npk, ''))), '')
    )),
    ''
  );
$$;

-- ---------------------------------------------------------------------------
-- Bestandsstatus für Produktidentität
-- ---------------------------------------------------------------------------

create or replace function public.get_fertilizer_product_stock_status(
  p_catalog_product_id uuid default null,
  p_identity_fingerprint text default null,
  p_unit text default 'kg'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric := 0;
  v_has_containers boolean := false;
  v_unit text := coalesce(nullif(trim(p_unit), ''), 'kg');
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_catalog_product_id is null and (p_identity_fingerprint is null or p_identity_fingerprint = '') then
    raise exception 'PRODUCT_REFERENCE_REQUIRED';
  end if;

  select
    coalesce(sum(public.fertilizer_container_balance(fc.id)), 0),
    count(*) > 0
  into v_balance, v_has_containers
  from public.fertilizer_containers fc
  where fc.user_id = v_user_id
    and fc.archived_at is null
    and (
      (p_catalog_product_id is not null and fc.product_id = p_catalog_product_id)
      or (
        p_identity_fingerprint is not null
        and fc.recognition_candidate_id in (
          select frc.id
          from public.fertilizer_recognition_candidates frc
          where frc.user_id = v_user_id
            and frc.identity_fingerprint = p_identity_fingerprint
        )
      )
    );

  if not v_has_containers then
    return jsonb_build_object(
      'status', 'first_time',
      'current_balance', 0,
      'unit', v_unit
    );
  end if;

  if v_balance > 0 then
    return jsonb_build_object(
      'status', 'has_stock',
      'current_balance', v_balance,
      'unit', v_unit
    );
  end if;

  return jsonb_build_object(
    'status', 'known_zero',
    'current_balance', 0,
    'unit', v_unit
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomare Speicherung: Recognition Candidate + Gebinde + Bewegungen
-- ---------------------------------------------------------------------------

create or replace function public.save_fertilizer_capture(
  p_idempotency_key text,
  p_catalog_product_id uuid default null,
  p_candidate jsonb default null,
  p_purchase_quantity numeric default null,
  p_purchase_unit text default null,
  p_previous_remainder numeric default null,
  p_package_count integer default 1,
  p_product_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.fertilizer_capture_receipts%rowtype;
  v_candidate_id uuid;
  v_container_id uuid;
  v_balance numeric := 0;
  v_purchase numeric;
  v_unit text;
  v_label text;
  v_fingerprint text;
  v_remainder numeric;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_idempotency_key is null or trim(p_idempotency_key) = '' then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  select *
  into v_existing
  from public.fertilizer_capture_receipts fcr
  where fcr.user_id = v_user_id
    and fcr.idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'receipt_id', v_existing.id,
      'container_id', v_existing.container_id,
      'catalog_product_id', v_existing.catalog_product_id,
      'recognition_candidate_id', v_existing.recognition_candidate_id,
      'product_label', v_existing.product_label,
      'purchase_quantity', v_existing.purchase_quantity,
      'purchase_unit', v_existing.purchase_unit,
      'previous_remainder', v_existing.previous_remainder,
      'resulting_balance', v_existing.resulting_balance,
      'idempotent_replay', true
    );
  end if;

  if p_purchase_quantity is null or p_purchase_quantity <= 0 or p_purchase_quantity > 100000 then
    raise exception 'INVALID_PURCHASE_QUANTITY';
  end if;

  if p_purchase_unit is null or trim(p_purchase_unit) = '' then
    raise exception 'INVALID_PURCHASE_UNIT';
  end if;

  v_purchase := p_purchase_quantity;
  v_unit := trim(p_purchase_unit);
  v_remainder := coalesce(p_previous_remainder, 0);

  if v_remainder < 0 or v_remainder > 100000 then
    raise exception 'INVALID_PREVIOUS_REMAINDER';
  end if;

  if p_catalog_product_id is null and (p_candidate is null or p_candidate = 'null'::jsonb) then
    raise exception 'PRODUCT_REFERENCE_REQUIRED';
  end if;

  if p_catalog_product_id is not null and p_candidate is not null and p_candidate <> 'null'::jsonb then
    raise exception 'CATALOG_AND_CANDIDATE_CONFLICT';
  end if;

  -- Katalogprodukt: bestehendes Gebinde bevorzugen oder neues anlegen
  if p_catalog_product_id is not null then
    if not exists (
      select 1 from public.products p
      where p.id = p_catalog_product_id
        and p.soft_deleted_at is null
    ) then
      raise exception 'CATALOG_PRODUCT_NOT_FOUND';
    end if;

    select fc.id
    into v_container_id
    from public.fertilizer_containers fc
    where fc.user_id = v_user_id
      and fc.product_id = p_catalog_product_id
      and fc.archived_at is null
    order by fc.created_at asc
    limit 1;

    if v_container_id is null then
      insert into public.fertilizer_containers (user_id, product_id, label)
      values (v_user_id, p_catalog_product_id, coalesce(p_product_label, 'Dünger'))
      returning id into v_container_id;
    end if;

    v_label := coalesce(p_product_label, 'Dünger');
  else
    v_fingerprint := public.build_fertilizer_identity_fingerprint(
      p_candidate ->> 'brand',
      p_candidate ->> 'productLine',
      p_candidate ->> 'productName',
      p_candidate ->> 'variant',
      p_candidate ->> 'npk'
    );

    if v_fingerprint is null then
      raise exception 'CANDIDATE_FINGERPRINT_REQUIRED';
    end if;

    select frc.id
    into v_candidate_id
    from public.fertilizer_recognition_candidates frc
    where frc.user_id = v_user_id
      and frc.identity_fingerprint = v_fingerprint;

    if v_candidate_id is null then
      insert into public.fertilizer_recognition_candidates (
        user_id,
        brand,
        product_line,
        product_name,
        variant,
        product_descriptor,
        manufacturer,
        npk,
        package_size_value,
        package_size_unit,
        product_form,
        identity_fingerprint,
        identity_confidence,
        data_completeness,
        identity_origin,
        recognition_snapshot,
        status
      )
      values (
        v_user_id,
        p_candidate ->> 'brand',
        p_candidate ->> 'productLine',
        p_candidate ->> 'productName',
        p_candidate ->> 'variant',
        p_candidate ->> 'productDescriptor',
        p_candidate ->> 'manufacturer',
        p_candidate ->> 'npk',
        nullif(p_candidate ->> 'packageSizeValue', '')::numeric,
        p_candidate ->> 'packageSizeUnit',
        coalesce(p_candidate ->> 'productForm', 'unknown'),
        v_fingerprint,
        nullif(p_candidate ->> 'identityConfidence', '')::numeric,
        nullif(p_candidate ->> 'dataCompleteness', '')::numeric,
        p_candidate ->> 'identityOrigin',
        p_candidate -> 'recognitionSnapshot',
        coalesce(p_candidate ->> 'status', 'accepted')
      )
      returning id into v_candidate_id;
    end if;

    select fc.id
    into v_container_id
    from public.fertilizer_containers fc
    where fc.user_id = v_user_id
      and fc.recognition_candidate_id = v_candidate_id
      and fc.archived_at is null
    order by fc.created_at asc
    limit 1;

    if v_container_id is null then
      insert into public.fertilizer_containers (
        user_id,
        recognition_candidate_id,
        package_size_value,
        package_size_unit,
        label
      )
      values (
        v_user_id,
        v_candidate_id,
        nullif(p_candidate ->> 'packageSizeValue', '')::numeric,
        p_candidate ->> 'packageSizeUnit',
        coalesce(p_product_label, 'Persönlicher Dünger')
      )
      returning id into v_container_id;
    end if;

    v_label := coalesce(p_product_label, 'Persönlicher Dünger');
  end if;

  if v_remainder > 0 then
    insert into public.fertilizer_stock_movements (
      user_id,
      container_id,
      movement_type,
      movement_origin,
      quantity_delta,
      unit,
      capture_idempotency_key,
      note
    )
    values (
      v_user_id,
      v_container_id,
      'initial_stock',
      'manual',
      v_remainder,
      v_unit,
      p_idempotency_key,
      'Früherer Restbestand vor Kauf'
    );
  end if;

  insert into public.fertilizer_stock_movements (
    user_id,
    container_id,
    movement_type,
    movement_origin,
    quantity_delta,
    unit,
    capture_idempotency_key,
    note
  )
  values (
    v_user_id,
    v_container_id,
    'purchase',
    'manual',
    v_purchase,
    v_unit,
    p_idempotency_key,
    case
      when coalesce(p_package_count, 1) > 1
        then format('Kauf (%s Gebinde)', p_package_count)
      else 'Kauf'
    end
  );

  v_balance := public.fertilizer_container_balance(v_container_id);

  insert into public.fertilizer_capture_receipts (
    user_id,
    idempotency_key,
    container_id,
    catalog_product_id,
    recognition_candidate_id,
    product_label,
    purchase_quantity,
    purchase_unit,
    previous_remainder,
    resulting_balance
  )
  values (
    v_user_id,
    p_idempotency_key,
    v_container_id,
    p_catalog_product_id,
    v_candidate_id,
    v_label,
    v_purchase,
    v_unit,
    nullif(v_remainder, 0),
    v_balance
  );

  return jsonb_build_object(
    'receipt_id', (select id from public.fertilizer_capture_receipts where user_id = v_user_id and idempotency_key = p_idempotency_key),
    'container_id', v_container_id,
    'catalog_product_id', p_catalog_product_id,
    'recognition_candidate_id', v_candidate_id,
    'product_label', v_label,
    'purchase_quantity', v_purchase,
    'purchase_unit', v_unit,
    'previous_remainder', nullif(v_remainder, 0),
    'resulting_balance', v_balance,
    'idempotent_replay', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.fertilizer_recognition_candidates enable row level security;
alter table public.fertilizer_containers enable row level security;
alter table public.fertilizer_stock_movements enable row level security;
alter table public.fertilizer_capture_receipts enable row level security;

create policy fertilizer_recognition_candidates_select_own
  on public.fertilizer_recognition_candidates for select
  using (user_id = auth.uid());

create policy fertilizer_recognition_candidates_insert_own
  on public.fertilizer_recognition_candidates for insert
  with check (user_id = auth.uid());

create policy fertilizer_recognition_candidates_update_own
  on public.fertilizer_recognition_candidates for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy fertilizer_containers_select_own
  on public.fertilizer_containers for select
  using (user_id = auth.uid());

create policy fertilizer_containers_insert_own
  on public.fertilizer_containers for insert
  with check (user_id = auth.uid());

create policy fertilizer_containers_update_own
  on public.fertilizer_containers for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy fertilizer_stock_movements_select_own
  on public.fertilizer_stock_movements for select
  using (user_id = auth.uid());

create policy fertilizer_capture_receipts_select_own
  on public.fertilizer_capture_receipts for select
  using (user_id = auth.uid());

-- Schreibzugriff auf Bewegungen nur über security definer RPCs
revoke insert, update, delete on public.fertilizer_stock_movements from authenticated;
revoke insert, update, delete on public.fertilizer_capture_receipts from authenticated;

grant execute on function public.get_fertilizer_product_stock_status(uuid, text, text) to authenticated;
grant execute on function public.save_fertilizer_capture(text, uuid, jsonb, numeric, text, numeric, integer, text) to authenticated;
grant execute on function public.fertilizer_container_balance(uuid) to authenticated;
