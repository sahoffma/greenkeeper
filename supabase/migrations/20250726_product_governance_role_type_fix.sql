-- =============================================================================
-- Greenkeeper – Korrektur: schema.sql text-Spalten vor Governance-Migrationen
-- =============================================================================
--
-- Hintergrund:
-- supabase/schema.sql legt profiles.role und products.verification_status als
-- text an. 20250722_product_governance.sql nutzt ADD COLUMN IF NOT EXISTS und
-- überspringt diese Spalten. user_app_role() scheitert dann mit:
--   COALESCE types text and app_user_role cannot be matched
--
-- Diese Migration ist idempotent und sicher für:
-- - frische Dev-DB (schema.sql + Vor-Migrationen),
-- - teilweise migrierte Dev-DB,
-- - bereits vollständig migrierte Production (Spalten bereits enum → No-Op).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Enums (nur die für Spalten-Konvertierung nötigen; Rest legt 20250722 an)
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.app_user_role as enum (
    'user',
    'reviewer',
    'admin'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_verification_status as enum (
    'draft',
    'pending_review',
    'verified',
    'incomplete',
    'disputed',
    'archived'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_source_type as enum (
    'manufacturer',
    'datasheet',
    'retailer',
    'user_submission',
    'ai_research',
    'internal',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- profiles.role: text → app_user_role
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
      and udt_name = 'text'
  ) then
    alter table public.profiles
      alter column role drop default;

    alter table public.profiles
      alter column role type public.app_user_role
      using (
        case
          when role::text in ('user', 'reviewer', 'admin')
            then role::text::public.app_user_role
          else 'user'::public.app_user_role
        end
      );

    alter table public.profiles
      alter column role set default 'user'::public.app_user_role,
      alter column role set not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- products.verification_status: text → product_verification_status
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'verification_status'
      and udt_name = 'text'
  ) then
    drop policy if exists "products_select_authenticated" on public.products;

    alter table public.products
      alter column verification_status drop default;

    alter table public.products
      alter column verification_status type public.product_verification_status
      using (
        case
          when verification_status::text in (
            'draft',
            'pending_review',
            'verified',
            'incomplete',
            'disputed',
            'archived'
          ) then verification_status::text::public.product_verification_status
          else 'verified'::public.product_verification_status
        end
      );

    alter table public.products
      alter column verification_status set default 'verified'::public.product_verification_status,
      alter column verification_status set not null;

    create policy "products_select_authenticated"
      on public.products for select
      to authenticated
      using (
        soft_deleted_at is null
        and verification_status <> 'archived'::public.product_verification_status
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- products.primary_source_type: text → product_source_type (nullable)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'primary_source_type'
      and udt_name = 'text'
  ) then
    alter table public.products
      alter column primary_source_type type public.product_source_type
      using (
        case
          when primary_source_type is null then null
          when primary_source_type::text in (
            'manufacturer',
            'datasheet',
            'retailer',
            'user_submission',
            'ai_research',
            'internal',
            'other'
          ) then primary_source_type::text::public.product_source_type
          else null
        end
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- user_app_role(): explizite Casts (robust während und nach Konvertierung)
-- ---------------------------------------------------------------------------

create or replace function public.user_app_role()
returns public.app_user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role::text::public.app_user_role
      from public.profiles p
      where p.id = (select auth.uid())
    ),
    'user'::public.app_user_role
  );
$$;

commit;
