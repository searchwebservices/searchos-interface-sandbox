-- Bay, 2026-10-28: the leads kanban runs seven stages.
-- discovery, planning, proposal, negotiation, won, lost, ghosted.
-- Deals first (old values), then the configuration. Safe to re-run.
begin;

update crm.deals set stage = case
  when stage = 'lost-ghosted' or (stage like 'lost%' and description ilike '%lost-ghosted%') then 'ghosted'
  when stage in ('new-lead', 'qualified') then 'discovery'
  when stage in ('discovery-call', 'paused') then 'planning'
  when stage = 'proposal-sent' then 'proposal'
  when stage = 'negotiating' then 'negotiation'
  when stage in ('lost', 'churned') or stage like 'lost-%' then 'lost'
  else stage
end
where stage in ('new-lead','qualified','discovery-call','paused','proposal-sent','negotiating','lost','churned','lost-ghosted')
   or stage like 'lost-%';

update crm.configuration set config = jsonb_set(
  jsonb_set(config, '{dealStages}', '[
    {"value":"discovery","label":"Discovery"},
    {"value":"planning","label":"Planning"},
    {"value":"proposal","label":"Proposal"},
    {"value":"negotiation","label":"Negotiation"},
    {"value":"won","label":"Won"},
    {"value":"lost","label":"Lost"},
    {"value":"ghosted","label":"Ghosted"}
  ]'::jsonb),
  '{dealPipelineStatuses}', '["won","lost","ghosted"]'::jsonb)
where id = 1;

commit;
