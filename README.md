# SearchOS interface, frontend sandbox

Bay's SearchOS interface, cut out of the console repo (`~/Code/sovereignos` on the Lenovo at 6a2c56b, CRM from `~/Code/atomic-crm` at 38d5a7e2) so you can change how
it looks in a fresh project. Everything visual is here: the shell and sidebar, chat, cards and surfaces (the dock), the SearchOS map,
Money, Library, LAN, Devices, Health, Profile, Cmd K, plus the CRM source. No server code. When it runs, it borrows the real console on
the Lenovo through your SSH tunnel, so you see your real lanes, messages and data while you work on visuals.

Read `GROUNDING.md` first: how Search actually uses the CRM and the PM day to day. UI notes are judged against it.

This is a sandbox. Nothing here deploys. Bring changes back to Jared and they get ported into the real tree.

## Layout

- `web/`: the console web app (Vite, React, Tailwind, shadcn). This is the interface.
- `console/lib/cards/`: the card schemas and fixtures the web app imports (alias `@cards`). Read only, it is shared with the server.
- `crm/`: the CRM (our fork of Atomic CRM). It runs inside the console as an iframe at `/v2/apps/crm`.

## Run the interface

Needs Node 22+. Keep the Lenovo tunnel running with 8800 forwarded (your always-on one does).

    cd web
    npm ci
    npm run dev

Open http://localhost:3300/v2/ . Your browser already holds the device cookie from localhost:8800, and cookies are shared across
localhost ports, so you land as you. `/api` and the built CRM go to the console through the tunnel; everything else is your local code
with hot reload. If you see "device not approved", open http://localhost:8800 once in the same browser profile first.

Careful: it is the real data and the real agents. A message you send here goes to the real lane.

## Run the CRM on its own (demo data, no keys)

    cd crm
    npm ci
    npm run dev:demo

Open http://localhost:5174 . Fake companies, contacts and deals, real Search theme. Inside the console at `/v2/apps/crm` you still see the
built CRM the console ships, not your local edits: to see CRM edits, use this demo.

## Where the visuals live

- Tokens and base styles: `web/src/index.css` (Search Interface System colors, both themes, density). The CRM's only color file is
  `crm/src/searchos-theme.css`.
- Bay's shell: `web/src/ui/bay-v1/` (sidebar, rail, menus, apps nav). Marvin's: `web/src/ui/marvin-v2/`.
- Chat: `web/src/thread/` (messages, composer, agent working row). Cards: `web/src/cards/`. Surfaces dock: `web/src/dock/`.
- Apps: `web/src/apps/` (map, money, canvas, CRM and PM pages). Pages: `web/src/pages/`. Library: `web/src/library/`. LAN: `web/src/lan/`.
- Shared components (shadcn and AI Elements): `web/src/components/`.

## Rules that still apply (Search Interface System, Hard Line 6)

- Colors are tokens. No hex outside the token definitions.
- Purple accent on light, lime accent on dark, never lime on a light surface. The accent is a hint, not a fill.
- Works in both themes and at `data-density="enormous"` before it is done.
- The Search logo is the real artwork only (`web/src/components/SearchMark.tsx` and the lockup). Never "Search" typed next to the mark.
- No em dashes in copy.

## Bringing changes back

Commit on a branch and push it to this repo, then tell Jared the branch name. Screenshots of before and after help. Jared ports the
diff into the console repo, runs the test suite (700+ web tests) and deploys.

## Licenses

The CRM is Atomic CRM by Marmelab, MIT (`crm/LICENSE.md`). Keep it.
