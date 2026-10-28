-- Date audit for crm.deals, crm.deal_notes, crm.contact_notes (2026-10-27).
-- Run against ezuwknaheyithtjpralk. Read-only: nothing needs rewriting.
-- expected_closing_date is type date, created_at/updated_at/date are timestamptz,
-- so Postgres already guarantees plain dates and real timestamps. The crash came
-- from 58 of 77 deals having expected_closing_date NULL, which the UI now renders
-- as a dash. We do not invent closing dates for them.
select
  (select count(*) from crm.deals) as deals,
  (select count(*) from crm.deals where expected_closing_date is null) as null_close,
  (select count(*) from crm.deals where created_at is null or updated_at is null) as null_ts,
  (select count(*) from crm.deal_notes where date is null) as deal_notes_null_date,
  (select count(*) from crm.contact_notes where date is null) as contact_notes_null_date;
