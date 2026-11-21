-- AIGIS 0011 post-check. Run after supabase/migrations/0011_privileged_risk_overlay.sql
-- commits. Owner-run only.
--
-- Gates:
--   identities.risk_factors exists, jsonb, not null, default []
--   0010 objects still present

do $$
declare
  col_type text;
  col_nullable text;
  col_default text;
begin
  select c.data_type, c.is_nullable, c.column_default
    into col_type, col_nullable, col_default
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'identities' and c.column_name = 'risk_factors';

  if col_type is null then
    raise exception '0011 postcheck failed: identities.risk_factors missing';
  end if;
  if col_type <> 'jsonb' then
    raise exception '0011 postcheck failed: identities.risk_factors type = % (expected jsonb)', col_type;
  end if;
  if col_nullable <> 'NO' then
    raise exception '0011 postcheck failed: identities.risk_factors is_nullable = %', col_nullable;
  end if;
  if col_default is null or col_default not like '%[]%' then
    raise exception '0011 postcheck failed: identities.risk_factors default = % (expected [])', col_default;
  end if;

  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'group_pim_eligibilities'
  ) then
    raise exception '0011 postcheck failed: group_pim_eligibilities missing (0010 rolled back?)';
  end if;
end $$;

select
  (select count(*) from identities) as identities,
  (select count(*) from identities where risk_factors = '[]'::jsonb) as empty_factor_rows,
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'identities' and column_name = 'risk_factors') as risk_factors_type;
