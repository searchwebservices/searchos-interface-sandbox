# SearchOS console v2 (web)

React 19 + TypeScript + Vite + Tailwind v4 + shadcn (radix-nova), with Vercel AI Elements as presentational legos. Spec: `docs/console-v2-spec.md`. Server API: `docs/console-wired.md` (authoritative). Pass one covers spec sections 1, 2, 3, 6 and 7. Pass two adds sections 4 (FormCard) and 5 (devices and health pages).

## Layout

- `src/lib/store.ts`: ONE reducer over the API (initial loads, send states, every `/api/stream` frame). Pure, tested. `forms` slot per thread holds `form` and `form_update` frames until the FormCard exists.
- `src/lib/api.ts`, `src/lib/stream.ts`: thin wiring to the console. `src/lib/markdown.ts`: the command-block rule ported from `console/ui/markdown.js`. `src/lib/tools.ts`: tool specialisation by name.
- `src/app/`: provider (loads, stream, actions), hash router (`#/`, `#/lanes/:id`, `#/devices`, `#/health`), sidebar, command menu, theme and zoom.
- `src/thread/`: lane view, messages, markdown reply, agent cards (working row, run row, tool cards, ask, changes), composer.
- `src/lanes/suggestions.ts`: purpose line and suggestion cards per lane (test covers every id in `console/data/lanes.json`).
- `src/pages/`: Devices (owners and admins, pending cards and approved rows) and Health (from `GET /api/health`, shared with the sidebar footer). `src/lib/forms.ts`: pure page, `when`, validation and stepper helpers for `src/thread/FormCard.tsx`.
- `src/components/lattice-loader/`: the verbatim working indicator, typed through `index.tsx`.
- `src/components/ai-elements/`, `src/components/ui/`: copied in with the shadcn CLI, free to edit.

We do not use the AI SDK `useChat`. The `ai` package is a dev dependency only, because AI Elements files import its types.

## Add components

    npx shadcn@latest add sidebar command

    npx shadcn@latest add https://elements.ai-sdk.dev/api/registry/conversation.json -o

## Develop, test, build

    npm install

    npm run dev

    npm test

    npm run build

`npm run dev` serves at `http://localhost:5173/v2/` and proxies `/api` and `/ui` to the console at `http://127.0.0.1:8800`, so it needs an approved device on that console. `npm run build` type-checks and writes `dist/`.

## Serving

The console serves `web/dist` at `/v2/` (the route is still to be added in `console/server.js` by Jared). Vite is built with `base: '/v2/'`. The router is hash based, so no server fallback is needed for deep links.
