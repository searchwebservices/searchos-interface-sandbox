# SearchOS fork of Atomic CRM

Branch `searchos`, based on upstream `1d965616` (marmelab/atomic-crm, MIT). Runs
inside the SearchOS console as an iframe. Native Atomic schema in Postgres schema
`crm` of the shared Supabase project `ezuwknaheyithtjpralk`. No views over our old
tables. Auth is per approved device: the console mints the session, Atomic has no
login page.

## What differs from upstream

- `supabase/searchos/crm-schema.sql`: the whole schema rewritten from `public` to `crm`.
- Supabase client uses schema `crm` and its own storage key `searchos-crm-auth`.
- `src/searchos/`: session shim, context and theme shim, lockup, tests.
- `src/searchos-theme.css`: the only file with colour literals. Since the kit pass (Bay, 2026-10-27, "you are slacking on the interface design system") it holds the Search Interface System v2 tokens verbatim from `design-system/kit/search-interface.css` (warm paper, cards lighter than the page, purple accent on light and lime on dark, the kit's ok/warn/danger), radius 0.875rem for cards with pills for buttons and badges, the kit type roles (`.si-eyebrow`, `.si-title`, `.si-lede`, `.si-label`, `.si-src`), the Home tile pattern (`.hm-*`), the kanban and empty-state rules, and self-hosted Montserrat plus IBM Plex Mono for eyebrows and meta (`src/assets/fonts`). The earlier graphite copy of the console palette is gone; the CRM reads as BPE OS does.
- Removed: sign-up, first-user, set/forgot password routes, password change, user invite.
- Deal stages (SearchOS pipeline), MXN, categories = our service types.
- Edge functions (`supabase/functions`) read schema `crm`; four are deployed (see open points).

## Component patches (keep minimal, re-apply after an upstream merge)

- `layout/Header.tsx`: no lockup and no title (the console is already branded); bar is `bg-background border-b`, tabs `px-4 py-2.5`.
- `layout/Layout.tsx`: main padding `p-3`. `dashboard/MobileDashboard.tsx`: logo and title replaced by a plain "Dashboard" label.
- Headings: `text-xl`/`text-2xl` to `text-base`/`text-lg` in dashboard cards, company, contact and deal pages and forms; dashboard grid gap 4; deals chart margins widened so the MXN axis is not clipped.
- `index.css`: Inter import removed, `--font-sans` reads `--sos-font`; the mobile 17px root size rule is gone (the console is 16px).
- `deals/DealListContent.tsx`, `DealColumn.tsx`, `DealCard.tsx`: board scrolls horizontally, columns `w-64 shrink-0`, cards `w-full min-h-[5rem]`, title clamped to 3 lines, amount and categories on one truncated line, padding so shadows are not clipped.
- Money: `src/searchos/money.ts` `formatMoney` ("$1,234 MXN") replaces every compact or locale currency format (DealCard, DealColumn, DealShow, CompanyShow, DealsPipeline, DealsChart tooltip and axis).
- Activity: `sales/SalesAvatar.tsx` (initials of the sales person) replaces the company avatar or grey dot on company-created, deal-created and deal-note rows.
- `src/searchos/Lockup.tsx` is no longer used by the app (the favicon and manifest stay).

## SearchOS tab (fold of the console's Clients app, 2026-10-27)

- Company page tabs: Activity, **SearchOS**, contacts, deals. The SearchOS tab (`src/searchos/SearchosTab.tsx`) fetches
  `GET /api/apps/crm/companies/<id>/searchos` (same origin, cookies) and renders health, MRR and money, projects with
  links, proposals, contracts, versions, errors and incidents, infra and tickets. A 404 means the company has no
  `searchos_id`: the tab says "Not linked to SearchOS yet". `companies_summary` does not expose `searchos_id`; the
  tab does not need it, the console resolves it.
- Company cards show the health badge and MRR from one `GET /api/apps/crm/companies/summary` (cached per load).
- `crm.context` carries `tab` (`/companies/<id>/show/<tab>`); the record name comes from `[data-crm-title]`.
- New files only: `src/searchos/{profile,useSearchosData,SearchosTab}.ts(x)`; patches in `CompanyShow.tsx` (tab, grid
  columns, `data-crm-title`) and `CompanyCard.tsx` (badge + MRR).

## Home and navigation (Bay, 2026-10-28: "three cards, thats it")

No page tabs, no Browse menu. **Home** (`src/searchos/home/Home.tsx`, the `/` route) is the BPE OS home pattern on the kit:
mono eyebrow "Hi, <first name>" (from the sales row through `getIdentity`), the title "What do you need to get done?", the
line "Pick a place to start.", then three large Choice tiles, each with a line-art illustration in the accent on a paper
panel, a title, one sentence and a mono meta line with live counts (`<n> open leads · <m> moved this week`, `3 steps ·
about a minute`, `<n> contacts · <m> companies`; "Counting..." while they load, "Count unavailable right now" on error,
never a guessed zero): Manage leads (`#/deals`, the kanban), Add a new lead (`#/flow/lead/company`), Contacts
(`#/contacts`). Nothing else on the page. Pure helpers in `home/homeModel.ts`.

- **Add a new lead** (`src/searchos/flows/`, route `#/flow/lead/<step>?<answers>`): company > person > where it came from >
  done. Makes the company (when new), the contact and a deal in Discovery. Also reachable from "+ New lead" on the kanban.
  The unit is `StepFrame` (Flow register). It is the only workflow; the others (touch, move, review, proposal) are gone.
- **Breadcrumbs** (`nav/Breadcrumbs.tsx`, model in `flows/model.ts` `crumbsFor`): Home, Home > Leads, Home > New lead,
  Home > Contacts, Home > Leads > <deal>, Home > Companies > <company> (> SearchOS).
- **Stages** (Bay, 2026-10-28): discovery, planning, proposal, negotiation, won, lost, ghosted; pipeline statuses won, lost,
  ghosted. Config default in `defaultConfiguration.ts`, live row via `supabase/searchos/stages-2026-10-28.sql`.
- **Console side:** `GET /api/apps/crm/companies/summary` still feeds the company cards; a `crm.context` with `ask: true`
  and `prompt` still opens the Ask Jared dock with the composer prefilled.
- Mobile: the same Home stacked; the bottom bar is Home, Leads, Create, Tasks, Settings.

## 1. Database (Bay applies)

1. Supabase SQL editor on `ezuwknaheyithtjpralk`: paste and run
   `supabase/searchos/crm-schema.sql` once, top to bottom. It is not re-runnable
   (plain `create`, fails loud on a second run).
2. Settings > API > Exposed schemas: add `crm`.
3. Auth users, one per person (bay, dani, borja). Create each with
   app metadata `{"crm": true}` and user metadata `first_name` / `last_name`, for
   example through the admin API (`auth.admin.createUser({ email, email_confirm: true,
   app_metadata: { crm: true }, user_metadata: { first_name, last_name } })`).
   Flagging an existing auth user later also works (`updateUserById` with the same
   app metadata). Users without the flag never get a `crm.sales` row.
4. Administrators are explicit, nothing promotes anyone:
   `update crm.sales set administrator = true where email = '<email>';`
5. Import script role: `console_app` already has select, insert, update on every
   `crm` table and sequence (granted in the SQL file, skipped if the role is absent).

The file was executed end to end on PGlite (real Postgres in WASM, fake Supabase
roles and `auth` schema): `npm i --no-save @electric-sql/pglite && node supabase/searchos/validate-schema.mjs`.
It checks the trigger gate, no auto-admin, RLS, anon lockout, `console_app` writes,
search, and the rollback.

## 2. Build for the console

On the Lenovo, as the searchos user, from the repo root:

```
set -a; . ~/.config/searchos/env; set +a; npm ci; npm run build
```

Needs `VITE_SUPABASE_URL` and `VITE_SB_PUBLISHABLE_KEY` in that env file (both
public by design; the values are read by Vite, never printed). Output is `dist/`.
Ship it to the console as `web/dist/apps/crm/` (`base` is `./`, hash routing).
The console serves `/v2/apps/crm/` through `authenticate()` and mounts it in an
iframe. Placeholder check build:
`VITE_SUPABASE_URL=https://placeholder.supabase.co VITE_SB_PUBLISHABLE_KEY=placeholder npm run build`.

Notes: the favicon links are relative (`./favicon.svg`) because the app is not at
the origin root. `vite-plugin-pwa` still emits a service worker scoped to
`/v2/apps/crm/`; drop the plugin from `vite.config.ts` if a stale shell after a
deploy becomes a nuisance.

## 3. Console side contract

- `GET /api/apps/crm/session` (same origin, cookies): returns
  `{ "access_token", "refresh_token" }` for the person's CRM auth user, 401 if the
  device is not approved. The SPA then calls `supabase.auth.setSession`. The
  service role key behind it stays in the console env, placed by Bay.
- Child to parent: `{ type: "crm.context", route, resource, id, title }` on every hash
  change (`resource` is contacts, deals or companies; `title` is best effort).
- Parent to child: `{ type: "theme", value: "light" | "dark" }` and
  `{ type: "density", value: "small" | "medium" | "large" | "enormous" }`. The child
  checks origin and `event.source === window.parent`; check both on your side too.

## 4. Rollback

Run `supabase/searchos/crm-rollback.sql`. It drops the two `crm_on_auth_user_*`
triggers and the three `crm_attachments_*` storage policies, then renames schema
`crm` to `crm_rolled_back_<yyyymmdd>` and revokes API access to it. Nothing is
dropped; the data stays parked. Then remove `crm` from the exposed schemas. The
`attachments` bucket and its files are left alone. Restoring: rename the schema back
and re-create the triggers and policies from `crm-schema.sql`.

## 5. Open points

- Edge functions deployed 2026-10-27 on `ezuwknaheyithtjpralk` with `verify_jwt = false`
  (they authenticate the caller themselves through `auth.getUser`, and a browser preflight
  carries no token): `users`, `update_password`, `merge_contacts`, `delete_note_attachments`.
  All read schema `crm` (shared `supabaseAdmin` and the kysely `db` use it). Deployed through
  the Supabase MCP, not the CLI, so a CLI deploy must keep `verify_jwt = false` per `config.toml`.
- `users` creates auth users with `app_metadata.crm = true` (so `crm_on_auth_user_created`
  makes the `crm.sales` row) and never sets administrator unless the request says
  `administrator: true`. A non-admin cannot ban or promote anyone.
- CORS: origins come from the env var `CRM_ALLOWED_ORIGINS` (comma separated), default
  `http://localhost:8800` and `http://10.100.100.167:8800`. Add the tailnet origin there
  (function secret), no redeploy of code needed. Preflight answers 200.
- `postmark` and `mcp` are phase 2 and NOT deployed. The MCP Server URL block on the settings
  page points at `/functions/v1/mcp`, which does not exist yet.
- Company logo error (Bay, 10-27): could not be reproduced. Through the console session the
  logo upload (`POST storage/attachments`) and the `PATCH crm.companies` both return 200,
  for add, replace and remove. The storage bucket and `crm_attachments_select/insert/delete`
  policies are correct. Most likely the error was the profile avatar save, which goes through
  the `users` function that did not exist. No SQL or `src/` patch needed. Latent only: there is
  no `crm_attachments_update` policy, so an upsert upload would fail (the code does not upsert).
  Pending src patch: none.
- `delete_note_attachments` is called from a DB trigger through `pg_net` with the
  caller's auth header; it is now deployed, so removed note attachments leave storage.
- Bucket `attachments` is public, as upstream. If another app on this project uses
  the same bucket id, its objects are readable by any authenticated user through the
  `crm_attachments_*` policies.
- The four `lost-*` stages of `public.deals` collapse to `lost`. Keep the reason in
  the deal description when importing.
- Hard Line 6 needs Bay's one-line amendment for this third-party app (same shape as
  the Framer one).

## Branding (sweep 2026-10-27, "all logos, loading screens, font and branding")

Every Atomic and Marmelab trace is gone from what a user, a browser or an email sees.

- Tab title and `defaultTitle`: "SearchOS CRM". Manifest `name`/`short_name`: "SearchOS CRM", `start_url` and `scope` `/v2/apps/crm/`.
- Favicon set (canonical, copied from the design system) and all `appIcon/*` PNGs are ours; `index.html`, `auth-callback.html` and
  `manifest.json` now reference them root-absolute under `/v2/apps/crm/`.
- Boot loader (`index.html`, `.boot-loader`) and every loading state: the Search mark with a quiet pulse (`src/searchos/Mark.tsx`,
  `MarkLoader`; rules at the end of `searchos-theme.css`, token colours, reduced-motion aware). `admin/loading.tsx` and the Suspense
  fallbacks in `Layout.tsx` and `MobileLayout.tsx` use it. The old CSS spinner and skeleton dot are removed.
- Empty states (deals, contacts, companies): `EmptyMark` replaces Atomic's `img/empty.svg`; the illustration and `adding-users.png` are deleted.
- `auth-callback.html` (the session redirect page): retitled, our icons, no loader and no colour literals.
- Copy: "Atomic CRM" is now "SearchOS CRM" in settings, onboarding stepper, English and French messages, signup and confirmation
  pages; the demo-only `Welcome` card no longer links to marmelab; import report download is `searchos-crm-import-report.json`.
- Edge functions: MCP server and task-list app names are `searchos-crm` and `searchos-crm-task-list`. Marmelab telemetry stays off
  (`disableTelemetry`). Auth email templates (`supabase/templates/invite.html`, `recovery.html`) and `config.toml` subjects carry
  the lockup PNG (`public/email/svt-lockup-h-short-black.png`, from `{{ .SiteURL }}/email/`) and no Atomic wording. Emails need
  literal hex (no CSS variables in mail clients); they are not part of the app bundle.
- Font: Montserrat only, self-hosted woff2 (`src/assets/fonts`), no CDN. A leftover `body { font-family: Inter }` in `index.css` was still winning; it now reads `--sos-font`. Boot and callback pages name Montserrat with a sans fallback.
- `SessionGate` shows the mark loader while the console mints the session (it used to render nothing, so the boot mark vanished early).
- Avatars: initials on the `--avatar-*` tokens (already so). No PDF or export headers exist in the app.
- Left alone on purpose: code comments and Storybook stories mentioning upstream, `src/components/ui/README.md`, `registry.json`.
