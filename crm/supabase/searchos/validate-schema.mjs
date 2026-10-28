// Runs crm-schema.sql and crm-rollback.sql on a real Postgres (PGlite, in memory) with a fake Supabase shell.
// Usage: npm i --no-save @electric-sql/pglite && node supabase/searchos/validate-schema.mjs
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import fs from 'fs';
const db = new PGlite({ extensions: { citext, unaccent } });
await db.exec(`
create role anon; create role authenticated; create role service_role; create role supabase_auth_admin; create role console_app;
create schema extensions; create schema auth; grant usage on schema auth to authenticated, anon; create schema storage; create schema net;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', last_sign_in_at timestamptz);

create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.sub', true),'')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text); alter table storage.objects enable row level security;
grant usage on schema extensions to authenticated;
create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds int) returns bigint language sql as $$ select 1::bigint $$;
`);
const sql = fs.readFileSync(new URL('./crm-schema.sql', import.meta.url),'utf8');
await db.exec(sql);
console.log('schema ok');
const q = async (s)=> (await db.query(s)).rows;
await db.exec(`insert into auth.users(email) values ('other@x.com'); insert into auth.users(email, raw_app_meta_data, raw_user_meta_data) values ('bay@x.com','{"crm":"true"}','{"first_name":"Bay","last_name":"P"}'),('dani@x.com','{"crm":"true"}','{}');`);
console.log(await q(`select email, administrator, first_name from crm.sales order by id`));
await db.exec(`update auth.users set last_sign_in_at=now() where email='bay@x.com'; update auth.users set raw_app_meta_data='{"crm":"true"}' where email='other@x.com';`);
console.log(await q(`select count(*) from crm.sales`));
await db.exec(`update crm.sales set administrator=true where email='bay@x.com'`);
console.log(await q(`select crm.is_admin()`));
// as authenticated bay
await db.exec(`set role authenticated; select set_config('request.jwt.sub', (select user_id::text from crm.sales where email='bay@x.com'), false);`);
await db.exec(`insert into crm.companies(name, website) values ('Árido Café','https://arido.mx'); insert into crm.contacts(first_name,last_name,email_jsonb,company_id) values ('Hélène','Dupont','[{"email":"Helene@Arido.mx","type":"Work"}]',1);
insert into crm.deals(name, company_id, stage, amount, categories, description) values ('Sitio','1','proposal-sent',1000,'{website}','x'); insert into crm.tasks(contact_id,text,due_date) values (1,'call', now());
insert into crm.contact_notes(contact_id,text) values (1,'hello world'); `);
console.log(await q(`select sales_id, logo from crm.companies`));
console.log(await q(`select * from crm.companies_summary`).then(r=>r.map(x=>[x.nb_deals,x.nb_contacts])));
console.log(await q(`select resource,title from crm.global_search('hel dup')`));
console.log(await q(`select type from crm.activity_log order by 1`));
console.log(await q(`select config->>'currency' c from crm.configuration`));
let e; try{ await db.exec(`update crm.sales set administrator=true`);}catch(x){e=x.message} console.log('sales write', await q(`select count(*) from crm.sales where administrator`), e);
try{ await db.exec(`update crm.configuration set config='{}'`);}catch(x){console.log('cfg',x.message)}
console.log(await q(`select count(*) from crm.configuration where config='{}'`));
await db.exec(`reset role; set role anon;`);
try{ await q(`select * from crm.companies`);}catch(x){console.log('anon:',x.message)}
await db.exec(`reset role; set role console_app;`);
await db.exec(`insert into crm.companies(name) values ('ImportCo'); update crm.companies set city='La Paz' where name='ImportCo'`);
console.log('console_app ok', await q(`select count(*) from crm.companies`));
await db.exec(`reset role; delete from crm.contact_notes;`);
console.log('done');
await db.exec(fs.readFileSync(new URL('./crm-rollback.sql', import.meta.url),'utf8'));
console.log(await q(`select nspname from pg_namespace where nspname like 'crm%'`));
await db.exec(`update auth.users set last_sign_in_at=now() where email='bay@x.com'`);
console.log('rollback ok, logins still work', await q(`select count(*) from crm_rolled_back_20261027.sales`).catch(e=>e.message));
