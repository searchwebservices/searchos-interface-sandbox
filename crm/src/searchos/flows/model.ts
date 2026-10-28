/**
 * The CRM has one workflow, Add a new lead, a sequence of
 * single-decision screens, addressed by hash so Back and refresh work:
 *
 *   #/flow/<workflow>/<step>?deal=101&what=call
 *
 * The breadcrumb reads Home > New lead > <Step>. The pages: Home > Leads (the
 * kanban), Home > Leads > <Deal>, Home > Contacts, Home > Companies > <Company>.
 *
 * Pure functions here; the screens live next to this file.
 */

export type StepDef = {
  id: string;
  /** Breadcrumb label. */
  label: string;
  /** The subject parameter this step asks for; present in the params means the step can be skipped. */
  asks?: "deal" | "contact" | "company";
};

export type FlowDef = {
  id: FlowId;
  title: string;
  /** One line under the title on the Home starters. */
  note: string;
  steps: StepDef[];
};

export type FlowId = "lead";

export const FLOWS: Record<FlowId, FlowDef> = {
  lead: {
    id: "lead",
    title: "New lead",
    note: "A company, a person, where it came from.",
    steps: [
      { id: "company", label: "Company", asks: "company" },
      { id: "person", label: "Person" },
      { id: "source", label: "Where it came from" },
      { id: "done", label: "Done" },
    ],
  },
};

export const FLOW_ORDER: FlowId[] = ["lead"];

export const isFlowId = (s: unknown): s is FlowId =>
  typeof s === "string" && s in FLOWS;

export type Params = Record<string, string | undefined>;

/** Params to a query string, stable key order, empty values dropped. */
export function toSearch(params: Params): string {
  const q = new URLSearchParams();
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v !== undefined && v !== "") q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function fromSearch(search: string): Params {
  const out: Params = {};
  new URLSearchParams(search.replace(/^\?/, "")).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export const stepHref = (flow: FlowId, step: string, params: Params = {}) =>
  `/flow/${flow}/${step}${toSearch(params)}`;

const stepIndex = (flow: FlowDef, step: string) =>
  flow.steps.findIndex((s) => s.id === step);

/** Does a step already have its answer in the params? (A row click skips "who".) */
export function stepAnswered(step: StepDef, params: Params): boolean {
  if (!step.asks) return false;
  return !!params[step.asks];
}

/** The first step still to answer; a prefilled subject skips its step. */
export function firstStep(flow: FlowId, params: Params = {}): string {
  const def = FLOWS[flow];
  for (const s of def.steps) if (!stepAnswered(s, params)) return s.id;
  return def.steps[def.steps.length - 1].id;
}

/** Where to start the workflow with these params, as a hash path. */
export const startHref = (flow: FlowId, params: Params = {}) =>
  stepHref(flow, firstStep(flow, params), params);

export function nextStep(flow: FlowId, step: string): string | null {
  const def = FLOWS[flow];
  const i = stepIndex(def, step);
  return i >= 0 && i + 1 < def.steps.length ? def.steps[i + 1].id : null;
}

/** The previous step that is not already answered; null on the first screen. */
export function prevStep(
  flow: FlowId,
  step: string,
  params: Params = {},
): string | null {
  const def = FLOWS[flow];
  for (let i = stepIndex(def, step) - 1; i >= 0; i--) {
    if (!stepAnswered(def.steps[i], params)) return def.steps[i].id;
  }
  return null;
}

/** "Step 2 of 4", counting only the steps the person sees. */
export function stepCounter(
  flow: FlowId,
  step: string,
  params: Params = {},
): { n: number; of: number } {
  const seen = FLOWS[flow].steps.filter((s) => !stepAnswered(s, params));
  const n = seen.findIndex((s) => s.id === step);
  return { n: n < 0 ? seen.length : n + 1, of: seen.length };
}

export type FlowLocation = { flow: FlowId; step: string; params: Params };

export function parseFlowPath(
  pathname: string,
  search: string = "",
): FlowLocation | null {
  const m = /^\/flow\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!m || !isFlowId(m[1])) return null;
  const params = fromSearch(search);
  const step =
    m[2] && stepIndex(FLOWS[m[1]], m[2]) >= 0 ? m[2] : firstStep(m[1], params);
  return { flow: m[1], step, params };
}

// ---------- breadcrumbs ----------

export type Crumb = { label: string; to: string | null };

export type SubjectNames = {
  deal?: string | null;
  contact?: string | null;
  company?: string | null;
};

const RESOURCE_LABEL: Record<string, string> = {
  deals: "Leads",
  contacts: "Contacts",
  companies: "Companies",
  tasks: "Tasks",
  sales: "Users",
};
const RESOURCE_SINGULAR: Record<string, string> = {
  deals: "Lead",
  contacts: "Contact",
  companies: "Company",
};
const PAGE_LABEL: Record<string, string> = {
  settings: "Settings",
  profile: "Profile",
  import: "Import",
  changelog: "Changelog",
};
const TAB_LABEL: Record<string, string> = {
  searchos: "SearchOS",
  contacts: "Contacts",
  deals: "Deals",
  activity: "Activity",
};

/** The subject of a workflow, by precedence: the deal, else the contact, else the company. */
export function subjectOf(params: Params, names: SubjectNames): string | null {
  if (params.deal) return names.deal ?? `Deal ${params.deal}`;
  if (params.contact) return names.contact ?? `Contact ${params.contact}`;
  if (params.company) return names.company ?? `Company ${params.company}`;
  return null;
}

/**
 * The breadcrumb model for any CRM path. The last crumb is the page (no link);
 * Back is the crumb before it.
 */
export function crumbsFor(
  pathname: string,
  search: string = "",
  names: SubjectNames = {},
): Crumb[] {
  const home: Crumb = { label: "Home", to: "/" };
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return [{ label: "Home", to: null }];

  const flow = parseFlowPath(path, search);
  if (flow) {
    const def = FLOWS[flow.flow];
    const crumbs: Crumb[] = [home];
    const first = firstStep(flow.flow, {});
    const current = def.steps.find((s) => s.id === flow.step) ?? def.steps[0];
    const isFirst = current.id === first;
    crumbs.push({
      label: def.title,
      to: isFirst ? null : startHref(flow.flow),
    });
    if (!isFirst) crumbs.push({ label: current.label, to: null });
    return crumbs;
  }

  const parts = path.split("/").filter(Boolean);
  const [res, id, action, tab] = parts;
  if (RESOURCE_LABEL[res]) {
    const crumbs: Crumb[] = [home];
    const list = `/${res}`;
    if (!id) return [...crumbs, { label: RESOURCE_LABEL[res], to: null }];
    crumbs.push({ label: RESOURCE_LABEL[res], to: list });
    if (id === "create") return [...crumbs, { label: "New", to: null }];
    const key =
      res === "deals"
        ? "deal"
        : res === "contacts"
          ? "contact"
          : res === "companies"
            ? "company"
            : null;
    const name =
      (key && names[key]) || `${RESOURCE_SINGULAR[res] ?? res} ${id}`;
    const show = `/${res}/${id}/show`;
    if (action === "show" && tab && TAB_LABEL[tab] && tab !== "activity") {
      return [
        ...crumbs,
        { label: name, to: show },
        { label: TAB_LABEL[tab], to: null },
      ];
    }
    if (action && action !== "show") {
      return [
        ...crumbs,
        { label: name, to: show },
        { label: action === "edit" ? "Edit" : action, to: null },
      ];
    }
    return [...crumbs, { label: name, to: null }];
  }
  return [home, { label: PAGE_LABEL[res] ?? res, to: null }];
}

/** Only the subject keys, for the workflow crumb (drops the answers given after it). */
export function subjectParams(params: Params): Params {
  const out: Params = {};
  for (const k of ["deal", "contact", "company"])
    if (params[k]) out[k] = params[k];
  return out;
}

/** The ids the breadcrumb needs resolved into names, from any path. */
export function subjectIds(
  pathname: string,
  search: string = "",
): { deal?: string; contact?: string; company?: string } {
  const flow = parseFlowPath(pathname, search);
  if (flow)
    return subjectParams(flow.params) as {
      deal?: string;
      contact?: string;
      company?: string;
    };
  const m = /^\/(deals|contacts|companies)\/([^/]+)/.exec(pathname);
  if (!m || m[2] === "create") return {};
  const key =
    m[1] === "deals" ? "deal" : m[1] === "contacts" ? "contact" : "company";
  return { [key]: m[2] };
}

export const backHref = (crumbs: Crumb[]): string | null => {
  for (let i = crumbs.length - 2; i >= 0; i--)
    if (crumbs[i].to) return crumbs[i].to;
  return crumbs.length > 1 ? "/" : null;
};

// ---------- the workflows' own words ----------

export const LEAD_SOURCES = [
  { value: "referral", label: "Referral", note: "Someone sent them." },
  { value: "instagram", label: "Instagram", note: "A DM or a comment." },
  {
    value: "website",
    label: "Website",
    note: "The form or a WhatsApp from the site.",
  },
  { value: "whatsapp", label: "WhatsApp", note: "They wrote first." },
  { value: "event", label: "An event", note: "Met in person." },
  { value: "outreach", label: "Our outreach", note: "Cold, we went first." },
  { value: "other", label: "Other", note: "Say where in the deal." },
];
export const leadSourceLabel = (v: string | undefined) =>
  LEAD_SOURCES.find((k) => k.value === v)?.label ?? "Unknown";

export type LeadInput = {
  companyName: string;
  companyId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  source: string;
  salesId: string | number;
  now?: string;
};

/** The three records a new lead becomes: the company (when new), the contact, the deal in discovery. */
export function leadRecords(input: LeadInput) {
  const now = input.now ?? new Date().toISOString();
  const name = input.companyName.trim();
  const first = input.firstName.trim();
  const last = input.lastName.trim();
  const email = (input.email ?? "").trim();
  return {
    company: input.companyId
      ? null
      : { name, sales_id: input.salesId, created_at: now },
    contact: {
      first_name: first,
      last_name: last,
      email_jsonb: email ? [{ email, type: "Work" }] : [],
      phone_jsonb: [],
      status: "warm",
      sales_id: input.salesId,
      first_seen: now,
      last_seen: now,
      tags: [],
      background: `Source: ${leadSourceLabel(input.source)}`,
    },
    deal: {
      name: `${name} lead`,
      stage: "discovery",
      amount: 0,
      categories: [],
      description: `Source: ${leadSourceLabel(input.source)}. Contact: ${first} ${last}${email ? ` (${email})` : ""}.`,
      sales_id: input.salesId,
      expected_closing_date: null,
      created_at: now,
      updated_at: now,
      index: 0,
    },
  };
}
