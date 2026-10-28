/**
 * Wire shape and pure helpers of the SearchOS client profile
 * (GET /api/apps/crm/companies/:id/searchos on the console). Ported from the
 * console's old Clients app so the CRM company page can show the same facts.
 */
export type Tone = "ok" | "warn" | "bad" | "idle";

type Maybe<T> = T | null | undefined;
export type ProfileBody = {
  client: {
    id: string;
    name: string;
    company_name?: Maybe<string>;
    status?: Maybe<string>;
    notes?: Maybe<string>;
    ai_summary?: Maybe<string>;
  };
  board?: Maybe<{
    tier?: Maybe<string>;
    health?: Maybe<string>;
    health_note?: Maybe<string>;
    mrr_mxn?: Maybe<number>;
    mrr_note?: Maybe<string>;
    svt_owner?: Maybe<string>;
  }>;
  projects?: {
    id: string;
    name: string;
    type?: Maybe<string>;
    status?: Maybe<string>;
    live_url?: Maybe<string>;
    repo_url?: Maybe<string>;
    hosting?: Maybe<string>;
    monthly_rate?: Maybe<number>;
  }[];
  deals?: {
    id: string;
    name: string;
    stage?: Maybe<string>;
    proposal_url?: Maybe<string>;
    next_steps_url?: Maybe<string>;
  }[];
  proposals?: {
    title: string;
    url: string;
    kind?: Maybe<string>;
    at?: Maybe<string>;
  }[];
  contracts?: {
    id: string;
    title: string;
    ref_code?: Maybe<string>;
    type?: Maybe<string>;
    status?: Maybe<string>;
    created_at?: Maybe<string>;
    updated_at?: Maybe<string>;
  }[];
  invoices?: {
    id: string;
    amount?: Maybe<number>;
    status?: Maybe<string>;
    type?: Maybe<string>;
    due_date?: Maybe<string>;
    paid_date?: Maybe<string>;
  }[];
  facturas?: {
    id: string;
    folio?: Maybe<string>;
    total?: Maybe<number>;
    status?: Maybe<string>;
    fecha?: Maybe<string>;
  }[];
  cartera?: {
    entries?: {
      id: string;
      bucket?: Maybe<string>;
      monthly_amount?: Maybe<number>;
      billing_mode?: Maybe<string>;
      billing_state?: Maybe<string>;
      last_paid_period?: Maybe<string>;
    }[];
    payments?: {
      id: string;
      kind?: Maybe<string>;
      amount?: Maybe<number>;
      period?: Maybe<string>;
      paid_at?: Maybe<string>;
    }[];
  };
  mrr?: {
    id?: string;
    service: string;
    amount_mxn?: Maybe<number>;
    status?: Maybe<string>;
    counts_in_mrr?: Maybe<boolean>;
    billing_paused?: Maybe<boolean>;
  }[];
  versions?: {
    id: string;
    entry_date?: Maybe<string>;
    category?: Maybe<string>;
    title: string;
    published?: Maybe<boolean>;
  }[];
  errors?: {
    reports?: {
      id: string;
      title: string;
      severity?: Maybe<string>;
      status?: Maybe<string>;
      created_at?: Maybe<string>;
    }[];
    incidents?: {
      id: string;
      title: string;
      impact?: Maybe<string>;
      status?: Maybe<string>;
      started_at?: Maybe<string>;
    }[];
  };
  infra?: {
    id?: string;
    surface: string;
    url?: Maybe<string>;
    hosting?: Maybe<string>;
    repo?: Maybe<string>;
    monitored?: Maybe<boolean>;
    last_ping_ok?: Maybe<boolean>;
    last_ping_at?: Maybe<string>;
    last_ping_ms?: Maybe<number>;
    consecutive_failures?: Maybe<number>;
  }[];
  tickets?: {
    project?: {
      id?: string;
      ticket_key: string;
      title: string;
      priority?: Maybe<string>;
      status?: Maybe<string>;
    }[];
    code?: {
      id?: string;
      code_key: string;
      title: string;
      repo?: Maybe<string>;
      status?: Maybe<string>;
    }[];
  };
};

/** The API promises every list; a missing one reads as empty. */
export function normalize(p: ProfileBody) {
  return {
    client: p.client,
    board: p.board ?? null,
    projects: p.projects ?? [],
    deals: p.deals ?? [],
    proposals: p.proposals ?? [],
    contracts: p.contracts ?? [],
    invoices: p.invoices ?? [],
    facturas: p.facturas ?? [],
    mrr: p.mrr ?? [],
    versions: p.versions ?? [],
    infra: p.infra ?? [],
    cartera: {
      entries: p.cartera?.entries ?? [],
      payments: p.cartera?.payments ?? [],
    },
    errors: {
      reports: p.errors?.reports ?? [],
      incidents: p.errors?.incidents ?? [],
    },
    tickets: { project: p.tickets?.project ?? [], code: p.tickets?.code ?? [] },
  };
}
export type Profile = ReturnType<typeof normalize>;

export function healthTone(h?: Maybe<string>): Tone {
  const s = (h ?? "").toLowerCase();
  if (["green", "good", "healthy", "ok"].includes(s)) return "ok";
  if (
    [
      "amber",
      "yellow",
      "warn",
      "warning",
      "watch",
      "at_risk",
      "at risk",
    ].includes(s)
  )
    return "warn";
  if (["red", "bad", "critical", "unhealthy"].includes(s)) return "bad";
  return "idle";
}

export function statusTone(s?: Maybe<string>): Tone {
  const v = (s ?? "").toLowerCase();
  if (/paid|active|live|signed|resolved|done|ok|up|won|stamped|vigente/.test(v))
    return "ok";
  if (/overdue|failed|open|error|down|critical|high|cancel|lost|vencid/.test(v))
    return "bad";
  if (/pending|draft|sent|due|warn|paused|medium|progress/.test(v))
    return "warn";
  return "idle";
}

const CLOSED_DEAL = /won|lost|closed|cancel|churn/i;
const DONE_TICKET =
  /done|closed|resolved|cancel|complete|shipped|wontfix|won't/i;
const DAY = 86400000;

export function summarize(p: Profile, now: number = Date.now()) {
  const year = new Date(now).getUTCFullYear();
  const live = p.mrr.filter(
    (m) => m.counts_in_mrr !== false && !m.billing_paused,
  );
  const paid = p.invoices.filter(
    (i) =>
      (i.status ?? "").toLowerCase() === "paid" &&
      i.paid_date &&
      new Date(i.paid_date).getUTCFullYear() === year,
  );
  const versions = [...p.versions].sort(
    (a, b) => Date.parse(b.entry_date ?? "") - Date.parse(a.entry_date ?? ""),
  );
  return {
    // Postgres numerics can arrive as strings: coerce before adding, or "100" + "50" is "10050".
    mrr:
      p.board?.mrr_mxn != null
        ? Number(p.board.mrr_mxn)
        : p.mrr.length
          ? live.reduce((a, m) => a + Number(m.amount_mxn ?? 0), 0)
          : null,
    paidCount: paid.length,
    paidTotal: paid.reduce((a, i) => a + Number(i.amount ?? 0), 0),
    openDeals: p.deals.filter((d) => !CLOSED_DEAL.test(d.stage ?? "")).length,
    openTickets:
      p.tickets.project.filter((t) => !DONE_TICKET.test(t.status ?? ""))
        .length +
      p.tickets.code.filter((t) => !DONE_TICKET.test(t.status ?? "")).length,
    incidents30d: p.errors.incidents.filter((i) => {
      const t = Date.parse(i.started_at ?? "");
      return !isNaN(t) && now - t <= 30 * DAY && now - t >= -DAY;
    }).length,
    latestVersion: versions[0]?.title ?? "",
  };
}

export type LinkRow = { label: string; url: string; kind: string };

export function linksOf(p: Profile): LinkRow[] {
  const out: LinkRow[] = [];
  const seen = new Set<string>();
  const add = (label: string, url: Maybe<string>, kind: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ label, url, kind });
  };
  for (const pr of p.projects) {
    add(
      pr.name,
      pr.live_url,
      /portal/i.test(pr.type ?? "") || /portal/i.test(pr.name)
        ? "portal"
        : "live",
    );
    add(pr.name, pr.repo_url, "repo");
  }
  for (const i of p.infra) {
    add(i.surface, i.url, i.monitored ? "status" : "live");
    if (i.repo && /^https?:\/\//.test(i.repo)) add(i.surface, i.repo, "repo");
  }
  for (const d of p.deals) {
    add(d.name, d.proposal_url, "proposal");
    add(d.name, d.next_steps_url, "next steps");
  }
  return out;
}

export const isLive = (u?: Maybe<string>): u is string =>
  !!u && /^https?:\/\//i.test(u);

export function relDate(iso?: Maybe<string>, now: number = Date.now()): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (isNaN(t)) return "-";
  const d = Math.round((now - t) / DAY);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d === -1) return "tomorrow";
  if (d > 1 && d < 60) return `${d} days ago`;
  if (d < -1 && d > -60) return `in ${-d} days`;
  return iso.slice(0, 10);
}
