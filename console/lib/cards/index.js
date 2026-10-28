'use strict';
// Cards (docs/cards-spec.md): the shared registry. One source of truth for the plugin tool, the console and the
// web app. Schemas are plain JSON files in ./schemas (JSON Schema draft 7, no external $refs); the envelope is
// ./envelope.json; fixtures are ./fixtures.json. The validator below covers exactly the subset those files use:
// type (one name or a list), required, properties, enum, items, minItems, maxLength. Anything else in a schema is
// ignored on purpose, so adding a keyword here is a deliberate change with a test.
const fs = require('node:fs');
const path = require('node:path');

const KINDS = Object.freeze(['tool_run', 'command_output', 'metrics_snapshot', 'approval', 'file_retrieval', 'requested_input', 'config_diff', 'alert', 'script', 'result_summary']);
const SOURCES = Object.freeze(['tool', 'recall', 'research', 'person']);
const ACTION_KINDS = Object.freeze(['open', 'approve', 'deny', 'ack', 'copy', 'download', 'retry', 'submit', 'run']);
const STATES = Object.freeze(['open', 'done', 'ack', 'stale']);

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const SCHEMAS = Object.freeze(Object.fromEntries(KINDS.map((k) => [k, readJson('schemas/' + k + '.json')])));
const ENVELOPE = readJson('envelope.json');
const fixtures = readJson('fixtures.json');

// Actions a kind carries when the author gives none (spec section 3, last column). scope owner = canAdmin.
const DEFAULT_ACTIONS = Object.freeze({
  tool_run: [{ id: 'copy', label: 'Copy', kind: 'copy' }],
  command_output: [{ id: 'copy', label: 'Copy', kind: 'copy' }, { id: 'retry', label: 'Retry', kind: 'retry', scope: 'owner' }],
  metrics_snapshot: [{ id: 'open', label: 'Open', kind: 'open' }],
  approval: [{ id: 'approve', label: 'Approve', kind: 'approve', scope: 'owner' }, { id: 'deny', label: 'Deny', kind: 'deny', scope: 'owner' }],
  file_retrieval: [{ id: 'open', label: 'Open', kind: 'open' }, { id: 'download', label: 'Download', kind: 'download' }],
  requested_input: [{ id: 'submit', label: 'Submit', kind: 'submit', scope: 'member' }],
  config_diff: [{ id: 'approve', label: 'Approve', kind: 'approve', scope: 'owner' }, { id: 'deny', label: 'Deny', kind: 'deny', scope: 'owner' }],
  alert: [{ id: 'ack', label: 'Acknowledge', kind: 'ack', scope: 'member' }, { id: 'open', label: 'Open', kind: 'open' }],
  script: [{ id: 'open', label: 'Open', kind: 'open' }, { id: 'copy', label: 'Copy', kind: 'copy' }, { id: 'run', label: 'Run', kind: 'run', scope: 'owner' }],
  result_summary: [{ id: 'open', label: 'Open', kind: 'open' }],
});
const defaultActions = (kind) => (DEFAULT_ACTIONS[kind] || []).map((a) => ({ ...a }));

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
function isType(name, v) {
  switch (name) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: return true;
  }
}

// Returns a list of "path: reason" strings, empty when the value fits. `at` is the path shown in messages.
function validate(schema, value, at = 'data') {
  const errs = [];
  if (!schema || typeof schema !== 'object') return errs;
  if (schema.type !== undefined) {
    const names = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!names.some((n) => isType(n, value))) { errs.push(`${at}: expected ${names.join(' or ')}, got ${typeOf(value)}`); return errs; }
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errs.push(`${at}: must be one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string' && typeof schema.maxLength === 'number' && value.length > schema.maxLength) errs.push(`${at}: longer than ${schema.maxLength} characters`);
  if (isType('array', value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errs.push(`${at}: needs at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`);
    if (schema.items) value.forEach((x, i) => errs.push(...validate(schema.items, x, `${at}[${i}]`)));
  }
  if (isType('object', value)) {
    for (const k of schema.required || []) if (value[k] === undefined) errs.push(`${at}.${k}: required`);
    for (const [k, sub] of Object.entries(schema.properties || {})) if (value[k] !== undefined) errs.push(...validate(sub, value[k], `${at}.${k}`));
  }
  return errs;
}

// Rules a JSON schema subset cannot say. An executable script must list the permissions it needs.
function semanticErrors(card) {
  const errs = [];
  const d = isType('object', card) && isType('object', card.data) ? card.data : null;
  if (d && card.kind === 'script' && d.executable === true && !(Array.isArray(d.permissions) && d.permissions.length > 0)) {
    errs.push('data.permissions: an executable script must list the permissions it needs');
  }
  return errs;
}

// The whole card: envelope first, then data against the kind's schema. { ok, errors[] }.
function validateCard(card) {
  const errors = validate(ENVELOPE, card, 'card');
  if (isType('object', card) && typeof card.kind === 'string') {
    if (!KINDS.includes(card.kind)) errors.unshift(`unknown card kind "${card.kind.slice(0, 60)}"`);
    else if (isType('object', card.data)) errors.push(...validate(SCHEMAS[card.kind], card.data, 'data'));
  }
  if (!errors.length) errors.push(...semanticErrors(card));
  const p = isType('object', card) ? card.provenance : null;
  if (isType('object', p) && typeof p.at === 'string' && Number.isNaN(Date.parse(p.at))) errors.push('card.provenance.at: not a date');
  if (isType('object', card) && typeof card.at === 'string' && Number.isNaN(Date.parse(card.at))) errors.push('card.at: not a date');
  return { ok: errors.length === 0, errors };
}

module.exports = { KINDS, SOURCES, ACTION_KINDS, STATES, SCHEMAS, ENVELOPE, DEFAULT_ACTIONS, defaultActions, validate, validateCard, semanticErrors, fixtures };
