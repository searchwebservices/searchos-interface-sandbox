-- Bay, 2026-10-28: the UCW wedding sites are a convenio, not leads (moving to Plane).
-- Removes the four couple companies with their contacts, deals and notes.
-- The "UCW Website" deal on Unique Cabo Weddings stays.
begin;

create temp table _ucw on commit drop as
  select id from crm.companies where name in (
    'Beth & Randall (boda UCW)', 'Audrey & Ani (boda UCW)',
    'Lauren & Bryan (boda UCW)', 'Lupita & Jake (boda UCW)');

delete from crm.deal_notes where deal_id in (select id from crm.deals where company_id in (select id from _ucw));
delete from crm.contact_notes where contact_id in (select id from crm.contacts where company_id in (select id from _ucw));
delete from crm.tasks where contact_id in (select id from crm.contacts where company_id in (select id from _ucw));
delete from crm.deals where company_id in (select id from _ucw);
delete from crm.contacts where company_id in (select id from _ucw);
delete from crm.activity_log where company_id in (select id from _ucw);
delete from crm.companies where id in (select id from _ucw);

commit;
