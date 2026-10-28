--
-- SearchOS CRM rollback. Moves the whole "crm" schema aside, never drops it.
-- Run in the Supabase SQL editor. Data stays in crm_rolled_back_<yyyymmdd>.
--
-- Also detaches what points into the schema from outside it: the two triggers on
-- auth.users (their functions reference crm.sales by name and would fail on
-- every flagged login) and the three storage policies. The storage bucket
-- "attachments" and its files are left untouched.
--
-- To bring it back: alter schema crm_rolled_back_<yyyymmdd> rename to crm;
-- then re-create the two triggers and the three storage policies from the tail
-- of the matching sections in crm-schema.sql.
--

drop trigger if exists crm_on_auth_user_created on auth.users;
drop trigger if exists crm_on_auth_user_updated on auth.users;

drop policy if exists "crm_attachments_select" on storage.objects;
drop policy if exists "crm_attachments_insert" on storage.objects;
drop policy if exists "crm_attachments_delete" on storage.objects;

do $$
declare
  target text := 'crm_rolled_back_' || to_char(now(), 'YYYYMMDD');
begin
  if not exists (select 1 from pg_namespace where nspname = 'crm') then
    raise exception 'schema crm does not exist, nothing to roll back';
  end if;
  if exists (select 1 from pg_namespace where nspname = target) then
    target := target || '_' || to_char(now(), 'HH24MISS');
  end if;
  execute format('alter schema crm rename to %I', target);
  -- Nobody reads the parked copy through the API or the console.
  execute format('revoke all on schema %I from authenticated, service_role, supabase_auth_admin', target);
  if exists (select 1 from pg_roles where rolname = 'console_app') then
    execute format('revoke all on schema %I from console_app', target);
  end if;
  raise notice 'crm moved to %', target;
end
$$;

-- Then remove "crm" from Settings > API > Exposed schemas.
