-- GA-013 Stufe 1 — Replay-Fix: save_fertilizer_capture liefert product_profile_id auch bei Idempotenz

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
  v_profile_id uuid;
  v_balance numeric := 0;
  v_purchase numeric;
  v_unit text;
  v_label text;
  v_fingerprint text;
  v_remainder numeric;
  v_existing_profile_id uuid;
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
      'product_profile_id', case
        when v_existing.recognition_candidate_id is not null then (
          select frc.product_profile_id
          from public.fertilizer_recognition_candidates frc
          where frc.id = v_existing.recognition_candidate_id
        )
        when v_existing.catalog_product_id is not null then
          public.resolve_product_profile_for_catalog(v_existing.catalog_product_id)
        else null
      end,
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

  if p_catalog_product_id is not null then
    if not exists (
      select 1 from public.products p
      where p.id = p_catalog_product_id
        and p.soft_deleted_at is null
    ) then
      raise exception 'CATALOG_PRODUCT_NOT_FOUND';
    end if;

    v_profile_id := public.resolve_product_profile_for_catalog(p_catalog_product_id);

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
    v_profile_id := public.ensure_product_profile_from_snapshot(p_candidate -> 'recognitionSnapshot');

    if not public.user_can_link_product_profile(v_profile_id, v_user_id) then
      raise exception 'PROFILE_LINK_FORBIDDEN';
    end if;

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

    select frc.id, frc.product_profile_id
    into v_candidate_id, v_existing_profile_id
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
        status,
        product_profile_id
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
        coalesce(p_candidate ->> 'status', 'accepted'),
        v_profile_id
      )
      returning id into v_candidate_id;
    else
      if v_existing_profile_id is null then
        update public.fertilizer_recognition_candidates
        set product_profile_id = v_profile_id
        where id = v_candidate_id
          and product_profile_id is null
          and public.user_can_link_product_profile(v_profile_id, v_user_id);
      end if;
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
    'product_profile_id', v_profile_id,
    'product_label', v_label,
    'purchase_quantity', v_purchase,
    'purchase_unit', v_unit,
    'previous_remainder', nullif(v_remainder, 0),
    'resulting_balance', v_balance,
    'idempotent_replay', false
  );
end;
$$;

grant execute on function public.save_fertilizer_capture(text, uuid, jsonb, numeric, text, numeric, integer, text) to authenticated;
