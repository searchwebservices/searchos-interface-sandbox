'use strict';
// Console side of cards (docs/cards-spec.md section 2): turn a posted card into a stored thread item, and apply
// an action to it. Pure and testable; server.js owns the store, the stream and the DB. The thread item is
// { id, lane, role: 'card', card, session_id?, text: '', at }, with the card object exactly as validated.
const { validateCard, defaultActions, KINDS } = require('./index');
const { redactDeep } = require('../forms');

const ID_RE = /^[A-Za-z0-9-]{8,100}$/;
// What an action does to the card. open, copy and download change nothing; retry is recorded but leaves the card open.
const RESOLVES = Object.freeze({ approve: 'done', deny: 'done', submit: 'done', ack: 'ack' });
const RECORDED_ONLY = new Set(['open', 'copy', 'download', 'retry', 'run']);

// body: { card, session_id? } as posted by the harness. Returns { card, session_id } or { error, reason }.
// The id is kept when it is well formed (the harness writes the same id to the DB), else the console assigns one.
// Strings inside data and provenance are redacted before anything is stored or broadcast.
function acceptCard(body, laneIds, { now, newId }) {
  const b = body && typeof body === 'object' ? body : {};
  const c = b.card && typeof b.card === 'object' && !Array.isArray(b.card) ? b.card : null;
  if (!c) return { error: 'invalid_card', reason: 'card: required' };
  if (!KINDS.includes(c.kind)) return { error: 'invalid_card', reason: `unknown card kind "${String(c.kind).slice(0, 60)}"` };
  if (typeof c.lane !== 'string' || !laneIds.includes(c.lane)) return { error: 'no_such_lane', reason: 'lane: unknown' };
  const card = {
    id: typeof c.id === 'string' && ID_RE.test(c.id) ? c.id : newId(),
    kind: c.kind,
    lane: c.lane,
    data: redactDeep(c.data),
    provenance: c.provenance && typeof c.provenance === 'object' ? redactDeep(c.provenance) : c.provenance,
    actions: Array.isArray(c.actions) ? c.actions : defaultActions(c.kind),
    state: 'open',
    at: typeof c.at === 'string' && !Number.isNaN(Date.parse(c.at)) ? c.at : now,
  };
  const v = validateCard(card);
  if (!v.ok) return { error: 'invalid_card', reason: v.errors[0] + (v.errors.length > 1 ? ` (and ${v.errors.length - 1} more)` : '') };
  return { card, session_id: typeof b.session_id === 'string' ? b.session_id.slice(0, 200) : null };
}

function newCardItem(card, sessionId) {
  return { id: card.id, lane: card.lane, role: 'card', card, ...(sessionId ? { session_id: sessionId } : {}), text: '', at: card.at };
}

// An alert is raised once: a second alert with the same title and source while one is open is not stored.
function findOpenAlert(items, card) {
  if (card.kind !== 'alert') return null;
  return items.find((m) => m.role === 'card' && m.card && m.card.kind === 'alert' && m.card.state === 'open'
    && m.card.data.title === card.data.title && m.card.data.source === card.data.source) || null;
}

// Scope check. owner: canAdmin. member (or unset): a member of the lane. Returns an error code or null.
function scopeError(action, { canAdmin, isMember }) {
  if (action.scope === 'owner') return canAdmin ? null : 'owners_only';
  return isMember ? null : 'not_a_member';
}

// Mutates the stored item for one action. Returns { ok:true, changed } or { ok:false, error }.
// by: the device signature { person, device_id, device_name, ip, mac, at }.
function applyAction(item, action, by, at) {
  const card = item.card;
  const sig = { person: by.person, device_id: by.device_id, device_name: by.device_name };
  const note = { action_id: action.id, kind: action.kind, label: action.label, by: sig, at };
  if (RECORDED_ONLY.has(action.kind)) {
    if (card.state === 'stale') return { ok: false, error: 'card_stale' };
    if (action.kind === 'retry' || action.kind === 'run') { card.last_action = note; return { ok: true, changed: true }; }
    return { ok: true, changed: false };
  }
  const next = RESOLVES[action.kind];
  if (!next) return { ok: false, error: 'unsupported_action' };
  if (card.state !== 'open') return { ok: false, error: 'already_resolved', state: card.state };
  card.state = next;
  card.resolution = note;
  return { ok: true, changed: true };
}

// What a `run` on a script card asks Gilfoyle to do. The code goes through verbatim in a fence long enough to hold
// any backticks in it. Gilfoyle runs it with his shell tool, so the permission system raises the normal approval;
// the output comes back as a command_output card. header is the device signature line, as for a typed message.
function runPrompt(card, header) {
  const d = card.data;
  const code = String(d.code);
  let fence = '```';
  while (code.includes(fence)) fence += '`';
  const perms = Array.isArray(d.permissions) && d.permissions.length ? d.permissions.join('; ') : 'none listed';
  return `${header}\nAn owner pressed Run on script card ${card.id}. Execute exactly this script, unchanged, through your shell tool. `
    + `Do not edit, extend or reorder it, and do not run anything else with it. Target: ${d.target}. Working directory: ${d.cwd}. `
    + `Language: ${d.language}. Permissions the author listed: ${perms}. The normal approval applies; if it is denied, stop and say so. `
    + `When it finishes, show the result as a command_output card with the exact command, output and exit code.\n\n${fence}${d.language}\n${code}\n${fence}`;
}

module.exports = { runPrompt, acceptCard, newCardItem, findOpenAlert, scopeError, applyAction, RESOLVES };
