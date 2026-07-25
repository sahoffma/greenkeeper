-- =============================================================================
-- Greenkeeper Production Pre-Flight — Read-only Inventur
-- =============================================================================
--
-- Project-Ref: keoxzyzdkvebedgdswah (greenkeeper-prod)
--
-- ANWEISUNG:
--   1. Supabase Dashboard → greenkeeper-prod → SQL Editor → New query
--   2. Gesamten Inhalt dieser Datei einfügen
--   3. Prüfen: erste Zeile = BEGIN TRANSACTION READ ONLY;
--   4. Run — ein gemeinsames Result-Set erscheint (sortiert nach check_id)
--   5. Ergebnisse vollständig exportieren/sichern
--   6. Bei Fehler oder unerwartetem Wert: STOPP — keine Migration starten
--
-- SICHERHEIT:
--   - Ausschließlich SELECT (Read-only-Transaktion)
--   - Keine personenbezogenen Detaildaten (keine E-Mails, Namen, UUID-Listen)
--   - Nur Aggregat-Zähler, Boolean-Flags, Typ- und Objektnamen
--
-- TEILWEISE MIGRIERTE DATENBANKEN:
--   - Existenz-Checks (B, H) über information_schema / pg_catalog / to_regclass
--   - Integritätsprüfungen (J) referenzieren optionale Objekte direkt
--   - Parse-Fehler „relation/column does not exist“ bei J → Objekt fehlt;
--     B-/H-Zeilen in separatem Minimal-Lauf nicht nötig — zuerst B04/B05/B07 prüfen
--
-- HINWEIS:
--   Diese Inventur ersetzt KEINE Migrationshistorie. Welche Migration fehlt,
--   ergibt sich aus dem tatsächlichen Schema-Zustand (Existenz, Typen, RPC).
--
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH inventory_checks AS (

  -- ---------------------------------------------------------------------------
  -- A) Session / Kontext
  -- ---------------------------------------------------------------------------

  SELECT
    'A01_current_database'::text AS check_id,
    current_database()::text AS result_text,
    NULL::bigint AS result_count,
    NULL::boolean AS result_flag
  UNION ALL
  SELECT
    'A02_current_user'::text,
    current_user::text,
    NULL::bigint,
    NULL::boolean
  UNION ALL
  SELECT
    'A03_session_user'::text,
    session_user::text,
    NULL::bigint,
    NULL::boolean
  UNION ALL
  SELECT
    'A04_transaction_read_only'::text,
    NULL::text,
    NULL::bigint,
    current_setting('transaction_read_only') = 'on'

  -- ---------------------------------------------------------------------------
  -- B) Objekt-Existenz (information_schema / pg_catalog)
  -- ---------------------------------------------------------------------------

  UNION ALL
  SELECT
    'B01_table_profiles_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'profiles'
    )
  UNION ALL
  SELECT
    'B02_table_areas_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'areas'
    )
  UNION ALL
  SELECT
    'B03_table_products_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products'
    )
  UNION ALL
  SELECT
    'B04_table_care_groups_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'care_groups'
    )
  UNION ALL
  SELECT
    'B05_table_care_group_areas_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'care_group_areas'
    )
  UNION ALL
  SELECT
    'B06_table_measure_details_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'measure_details'
    )
  UNION ALL
  SELECT
    'B07_column_profiles_onboarding_completed_at_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'onboarding_completed_at'
    )
  UNION ALL
  SELECT
    'B08_column_products_soft_deleted_at_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'products'
        AND column_name = 'soft_deleted_at'
    )
  UNION ALL
  SELECT
    'B09_rpc_complete_onboarding_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding'
    )
  UNION ALL
  SELECT
    'B10_enum_legacy_imported_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'product_verification_status'
        AND e.enumlabel = 'legacy_imported'
    )
  UNION ALL
  SELECT
    'B11_care_group_areas_area_id_unique_constraint_exists'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'care_group_areas'
        AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) LIKE '%area_id%'
    )

  -- ---------------------------------------------------------------------------
  -- C) Datentypen (information_schema — immer eine Zeile pro Check)
  -- ---------------------------------------------------------------------------

  UNION ALL
  SELECT
    'C01_profiles_role_udt_name'::text,
    (
      SELECT c.udt_name::text
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'profiles'
        AND c.column_name = 'role'
    ),
    NULL::bigint,
    NULL::boolean
  UNION ALL
  SELECT
    'C02_products_verification_status_udt_name'::text,
    (
      SELECT c.udt_name::text
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'products'
        AND c.column_name = 'verification_status'
    ),
    NULL::bigint,
    NULL::boolean

  -- ---------------------------------------------------------------------------
  -- D) RPC complete_onboarding — Eigenschaften (pg_catalog)
  -- ---------------------------------------------------------------------------

  UNION ALL
  SELECT
    'D01_rpc_complete_onboarding_security_definer'::text,
    NULL::text,
    NULL::bigint,
    (
      SELECT p.prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding'
      LIMIT 1
    )
  UNION ALL
  SELECT
    'D02_rpc_complete_onboarding_volatility'::text,
    (
      SELECT (
        CASE p.provolatile
          WHEN 'i' THEN 'IMMUTABLE'
          WHEN 's' THEN 'STABLE'
          WHEN 'v' THEN 'VOLATILE'
          ELSE p.provolatile::text
        END
      )::text
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding'
      LIMIT 1
    ),
    NULL::bigint,
    NULL::boolean
  UNION ALL
  SELECT
    'D03_rpc_complete_onboarding_argument_types'::text,
    (
      SELECT pg_catalog.pg_get_function_identity_arguments(p.oid)::text
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding'
      LIMIT 1
    ),
    NULL::bigint,
    NULL::boolean
  UNION ALL
  SELECT
    'D04_rpc_complete_onboarding_return_type'::text,
    (
      SELECT pg_catalog.format_type(p.prorettype, NULL)::text
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding'
      LIMIT 1
    ),
    NULL::bigint,
    NULL::boolean
  UNION ALL
  SELECT
    'D05_rpc_complete_onboarding_executable_by_authenticated'::text,
    NULL::text,
    NULL::bigint,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'complete_onboarding'
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )

  -- ---------------------------------------------------------------------------
  -- E) RLS-Aktivierung (pg_class — immer eine Zeile pro relevanter Tabelle)
  -- ---------------------------------------------------------------------------

  UNION ALL
  SELECT
    'E01_rls_profiles'::text,
    'profiles'::text,
    NULL::bigint,
    COALESCE((
      SELECT c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'profiles'
    ), false)
  UNION ALL
  SELECT
    'E02_rls_areas'::text,
    'areas'::text,
    NULL::bigint,
    COALESCE((
      SELECT c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'areas'
    ), false)
  UNION ALL
  SELECT
    'E03_rls_products'::text,
    'products'::text,
    NULL::bigint,
    COALESCE((
      SELECT c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'products'
    ), false)
  UNION ALL
  SELECT
    'E04_rls_care_groups'::text,
    'care_groups'::text,
    NULL::bigint,
    COALESCE((
      SELECT c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'care_groups'
    ), false)
  UNION ALL
  SELECT
    'E05_rls_care_group_areas'::text,
    'care_group_areas'::text,
    NULL::bigint,
    COALESCE((
      SELECT c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'care_group_areas'
    ), false)

  -- ---------------------------------------------------------------------------
  -- F) RLS-Policies — Metadaten (pg_policies)
  -- ---------------------------------------------------------------------------

  UNION ALL
  SELECT
    'F01_policy_count_profiles'::text,
    'profiles'::text,
    COALESCE((
      SELECT count(*)::bigint
      FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = 'profiles'
    ), 0),
    NULL::boolean
  UNION ALL
  SELECT
    'F01_policy_count_areas'::text,
    'areas'::text,
    COALESCE((
      SELECT count(*)::bigint
      FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = 'areas'
    ), 0),
    NULL::boolean
  UNION ALL
  SELECT
    'F01_policy_count_products'::text,
    'products'::text,
    COALESCE((
      SELECT count(*)::bigint
      FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = 'products'
    ), 0),
    NULL::boolean
  UNION ALL
  SELECT
    'F01_policy_count_care_groups'::text,
    'care_groups'::text,
    COALESCE((
      SELECT count(*)::bigint
      FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = 'care_groups'
    ), 0),
    NULL::boolean
  UNION ALL
  SELECT
    'F01_policy_count_care_group_areas'::text,
    'care_group_areas'::text,
    COALESCE((
      SELECT count(*)::bigint
      FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = 'care_group_areas'
    ), 0),
    NULL::boolean
  UNION ALL
  SELECT
    ('F02_policy_' || p.tablename || '_' || p.policyname)::text AS check_id,
    p.cmd::text AS result_text,
    NULL::bigint AS result_count,
    NULL::boolean AS result_flag
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename IN (
      'profiles',
      'areas',
      'products',
      'care_groups',
      'care_group_areas'
    )

  -- ---------------------------------------------------------------------------
  -- G) Aggregierte Zähler — Kernobjekte
  -- ---------------------------------------------------------------------------

  UNION ALL
  SELECT
    'G01_auth_users_count'::text,
    NULL::text,
    (SELECT count(*)::bigint FROM auth.users),
    NULL::boolean
  UNION ALL
  SELECT
    'G02_profiles_count'::text,
    NULL::text,
    (SELECT count(*)::bigint FROM public.profiles),
    NULL::boolean
  UNION ALL
  SELECT
    'G03_active_areas_count'::text,
    NULL::text,
    (
      SELECT count(*)::bigint
      FROM public.areas
      WHERE archived_at IS NULL
    ),
    NULL::boolean
  UNION ALL
  SELECT
    'G04_products_total_count'::text,
    NULL::text,
    (SELECT count(*)::bigint FROM public.products),
    NULL::boolean

  -- ---------------------------------------------------------------------------
  -- H) Optionale Tabellen — Zeilenschätzungen (pg_stat, parse-sicher)
  -- ---------------------------------------------------------------------------

  UNION ALL
  SELECT
    'H01_care_groups_estimated_rows'::text,
    CASE
      WHEN to_regclass('public.care_groups') IS NULL THEN 'TABLE_MISSING'
      ELSE 'TABLE_PRESENT'
    END::text,
    COALESCE((
      SELECT s.n_live_tup::bigint
      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.oid = s.relid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'care_groups'
    ), 0),
    to_regclass('public.care_groups') IS NOT NULL
  UNION ALL
  SELECT
    'H02_care_group_areas_estimated_rows'::text,
    CASE
      WHEN to_regclass('public.care_group_areas') IS NULL THEN 'TABLE_MISSING'
      ELSE 'TABLE_PRESENT'
    END::text,
    COALESCE((
      SELECT s.n_live_tup::bigint
      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.oid = s.relid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'care_group_areas'
    ), 0),
    to_regclass('public.care_group_areas') IS NOT NULL
  UNION ALL
  SELECT
    'H03_measure_details_estimated_rows'::text,
    CASE
      WHEN to_regclass('public.measure_details') IS NULL THEN 'TABLE_MISSING'
      ELSE 'TABLE_PRESENT'
    END::text,
    COALESCE((
      SELECT s.n_live_tup::bigint
      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.oid = s.relid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'measure_details'
    ), 0),
    to_regclass('public.measure_details') IS NOT NULL

  -- ---------------------------------------------------------------------------
  -- J) Integritätsprüfungen — Onboarding / Pflegegruppen
  --     Benötigt Objekte aus Migration 20250725 (siehe B04, B05, B07).
  -- ---------------------------------------------------------------------------

  UNION ALL
  SELECT
    'J01_profiles_with_areas_but_no_onboarding_completed_at'::text,
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'onboarding_completed_at'
      ) THEN 'SKIPPED'
      ELSE NULL::text
    END,
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'onboarding_completed_at'
      ) THEN NULL::bigint
      ELSE (
        SELECT count(*)::bigint
        FROM public.profiles p
        WHERE p.onboarding_completed_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.areas a
            WHERE a.user_id = p.id
              AND a.archived_at IS NULL
          )
      )
    END,
    NULL::boolean
  UNION ALL
  SELECT
    'J02_active_areas_without_care_group_assignment'::text,
    CASE
      WHEN to_regclass('public.care_group_areas') IS NULL THEN 'SKIPPED'
      ELSE NULL::text
    END,
    CASE
      WHEN to_regclass('public.care_group_areas') IS NULL THEN NULL::bigint
      ELSE (
        SELECT count(*)::bigint
        FROM public.areas a
        WHERE a.archived_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.care_group_areas cga
            WHERE cga.area_id = a.id
          )
      )
    END,
    NULL::boolean
  UNION ALL
  SELECT
    'J03_duplicate_area_assignments'::text,
    CASE
      WHEN to_regclass('public.care_group_areas') IS NULL THEN 'SKIPPED'
      ELSE NULL::text
    END,
    CASE
      WHEN to_regclass('public.care_group_areas') IS NULL THEN NULL::bigint
      ELSE (
        SELECT count(*)::bigint
        FROM (
          SELECT cga.area_id
          FROM public.care_group_areas cga
          GROUP BY cga.area_id
          HAVING count(*) > 1
        ) duplicates
      )
    END,
    NULL::boolean
  UNION ALL
  SELECT
    'J04_care_groups_without_areas'::text,
    CASE
      WHEN to_regclass('public.care_groups') IS NULL
        OR to_regclass('public.care_group_areas') IS NULL THEN 'SKIPPED'
      ELSE NULL::text
    END,
    CASE
      WHEN to_regclass('public.care_groups') IS NULL
        OR to_regclass('public.care_group_areas') IS NULL THEN NULL::bigint
      ELSE (
        SELECT count(*)::bigint
        FROM public.care_groups cg
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.care_group_areas cga
          WHERE cga.care_group_id = cg.id
        )
      )
    END,
    NULL::boolean

)

SELECT
  check_id,
  result_text,
  result_count,
  result_flag
FROM inventory_checks
ORDER BY check_id;

COMMIT;
