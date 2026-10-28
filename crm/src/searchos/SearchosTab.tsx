import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "./money";
import {
  healthTone,
  isLive,
  linksOf,
  relDate,
  statusTone,
  summarize,
} from "./profile";
import type { Profile, Tone } from "./profile";
import { useSearchosProfile } from "./useSearchosData";

const toneDot: Record<Tone, string> = {
  ok: "bg-chart-2",
  warn: "bg-chart-3",
  bad: "bg-destructive",
  idle: "bg-muted-foreground/50",
};

export const StatusDot = ({ tone }: { tone: Tone }) => (
  <span
    aria-hidden
    className={`inline-block size-2 shrink-0 rounded-full ${toneDot[tone]}`}
  />
);

/** Health as a small pill: a coloured dot and the word. */
export const HealthBadge = ({ health }: { health?: string | null }) =>
  health ? (
    <Badge
      variant="outline"
      data-testid="health-badge"
      data-tone={healthTone(health)}
    >
      <StatusDot tone={healthTone(health)} />
      {health}
    </Badge>
  ) : null;

const StatusPill = ({ status }: { status?: string | null }) => (
  <Badge variant="outline" data-tone={statusTone(status)}>
    <StatusDot tone={statusTone(status)} />
    {status ?? "unknown"}
  </Badge>
);

const LIMIT = 5;

function Rows({ rows, testid }: { rows: ReactNode[]; testid: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, LIMIT);
  return (
    <div data-testid={testid}>
      <ul className="divide-y">
        {shown.map((r, i) => (
          <li
            key={i}
            data-testid="searchos-row"
            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
          >
            {r}
          </li>
        ))}
      </ul>
      {rows.length > LIMIT && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAll((v) => !v)}
        >
          {all ? "Show fewer" : `Show all (${rows.length})`}
        </Button>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-lg border"
      data-testid={`searchos-section-${id}`}
      data-count={count}
    >
      <h3 className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
        <span className="flex-1">{title}</span>
        <Badge variant="secondary">{count}</Badge>
      </h3>
      <div className="px-3 pb-2">
        {count === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            Nothing here yet.
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

const Sub = ({
  title,
  n,
  children,
}: {
  title: string;
  n: number;
  children: ReactNode;
}) =>
  n ? (
    <div className="pt-2">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title} ({n})
      </h4>
      {children}
    </div>
  ) : null;
const Muted = ({ children }: { children: ReactNode }) => (
  <span className="text-xs text-muted-foreground">{children}</span>
);
const Name = ({ children }: { children: ReactNode }) => (
  <span className="min-w-0 flex-1 basis-40 truncate font-medium">
    {children}
  </span>
);
function Ext({ url, children }: { url?: string | null; children: ReactNode }) {
  return isLive(url) ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  ) : (
    <>{children}</>
  );
}
const D = ({ iso }: { iso?: string | null }) => (
  <time dateTime={iso ?? undefined} title={iso?.slice(0, 10)}>
    {relDate(iso)}
  </time>
);

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div
      className="min-w-0 rounded-lg border p-3"
      data-testid="searchos-tile"
      data-label={label}
    >
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-base font-semibold" title={value}>
        {value || "-"}
      </div>
      {sub ? (
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

export function SearchosProfile({ p }: { p: Profile }) {
  const s = summarize(p);
  const links = linksOf(p);
  const board = p.board;
  const m = (n?: number | null) => formatMoney(n);
  const moneyCount =
    p.cartera.entries.length +
    p.cartera.payments.length +
    p.invoices.length +
    p.facturas.length +
    p.mrr.length;
  return (
    <div className="flex flex-col gap-3" data-testid="searchos-profile">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <HealthBadge health={board?.health} />
        {board?.tier && <Badge variant="secondary">{board.tier}</Badge>}
        {(board?.svt_owner || p.client.status) && (
          <Muted>
            {[board?.svt_owner && `owner ${board.svt_owner}`, p.client.status]
              .filter(Boolean)
              .join(", ")}
          </Muted>
        )}
        {board?.health_note && <Muted>{board.health_note}</Muted>}
      </div>

      <div
        className="grid grid-cols-2 gap-2 lg:grid-cols-3"
        data-testid="searchos-tiles"
      >
        <Tile
          label="MRR"
          value={s.mrr == null ? "" : m(s.mrr)}
          sub={board?.mrr_note}
        />
        <Tile
          label="Paid this year"
          value={String(s.paidCount)}
          sub={m(s.paidTotal)}
        />
        <Tile label="Open deals" value={String(s.openDeals)} />
        <Tile label="Open tickets" value={String(s.openTickets)} />
        <Tile label="Incidents, 30 days" value={String(s.incidents30d)} />
        <Tile label="Latest version" value={s.latestVersion} />
      </div>

      <Section id="money" title="Money" count={moneyCount}>
        <Sub title="Cartera" n={p.cartera.entries.length}>
          <Rows
            testid="searchos-cartera"
            rows={p.cartera.entries.map((x) => (
              <>
                <Name>{x.bucket ?? "entry"}</Name>
                <span>{m(x.monthly_amount)}/mo</span>
                <Muted>{x.billing_mode}</Muted>
                <StatusPill status={x.billing_state} />
                <Muted>last paid {x.last_paid_period ?? "-"}</Muted>
              </>
            ))}
          />
        </Sub>
        <Sub title="Payments" n={p.cartera.payments.length}>
          <Rows
            testid="searchos-payments"
            rows={p.cartera.payments.map((x) => (
              <>
                <Name>{m(x.amount)}</Name>
                <Muted>{x.kind}</Muted>
                <Muted>{x.period}</Muted>
                <Muted>
                  <D iso={x.paid_at} />
                </Muted>
              </>
            ))}
          />
        </Sub>
        <Sub title="Invoices" n={p.invoices.length}>
          <Rows
            testid="searchos-invoices"
            rows={p.invoices.map((x) => (
              <>
                <Name>{m(x.amount)}</Name>
                <Muted>{x.type}</Muted>
                <StatusPill status={x.status} />
                <Muted>
                  due <D iso={x.due_date} />
                </Muted>
              </>
            ))}
          />
        </Sub>
        <Sub title="Facturas" n={p.facturas.length}>
          <Rows
            testid="searchos-facturas"
            rows={p.facturas.map((x) => (
              <>
                <Name>{x.folio ?? x.id}</Name>
                <span>{m(x.total)}</span>
                <StatusPill status={x.status} />
                <Muted>
                  <D iso={x.fecha} />
                </Muted>
              </>
            ))}
          />
        </Sub>
        <Sub title="MRR roster" n={p.mrr.length}>
          <Rows
            testid="searchos-mrr"
            rows={p.mrr.map((x) => (
              <>
                <Name>{x.service}</Name>
                <span>{m(x.amount_mxn)}</span>
                <StatusPill status={x.status} />
                {x.billing_paused && <Badge variant="outline">paused</Badge>}
                {x.counts_in_mrr === false && <Muted>not in MRR</Muted>}
              </>
            ))}
          />
        </Sub>
      </Section>

      <Section id="projects" title="Projects" count={p.projects.length}>
        <Rows
          testid="searchos-projects"
          rows={p.projects.map((x) => (
            <>
              <Name>{x.name}</Name>
              <Muted>{x.type}</Muted>
              <StatusPill status={x.status} />
              {x.monthly_rate != null && <Muted>{m(x.monthly_rate)}/mo</Muted>}
              <span className="flex flex-wrap gap-x-3 text-xs">
                {isLive(x.repo_url) && <Ext url={x.repo_url}>repo</Ext>}
                {isLive(x.live_url) && <Ext url={x.live_url}>live</Ext>}
                {x.hosting && <Muted>{x.hosting}</Muted>}
              </span>
            </>
          ))}
        />
      </Section>

      <Section id="links" title="Links" count={links.length}>
        <Rows
          testid="searchos-links"
          rows={links.map((l) => (
            <>
              <Name>{l.label}</Name>
              <Badge variant="secondary">{l.kind}</Badge>
              <Ext url={l.url}>{l.url.replace(/^https?:\/\//, "")}</Ext>
            </>
          ))}
        />
      </Section>

      <Section id="proposals" title="Proposals" count={p.proposals.length}>
        <Rows
          testid="searchos-proposals"
          rows={p.proposals.map((x) => (
            <>
              <Name>
                <Ext url={x.url}>{x.title}</Ext>
              </Name>
              <Muted>{x.kind}</Muted>
              <Muted>
                <D iso={x.at} />
              </Muted>
            </>
          ))}
        />
      </Section>

      <Section id="contracts" title="Contracts" count={p.contracts.length}>
        <Rows
          testid="searchos-contracts"
          rows={p.contracts.map((x) => (
            <>
              <Name>{x.title}</Name>
              <Muted>{x.ref_code}</Muted>
              <Muted>{x.type}</Muted>
              <StatusPill status={x.status} />
              <Muted>
                <D iso={x.updated_at ?? x.created_at} />
              </Muted>
            </>
          ))}
        />
      </Section>

      <Section id="versions" title="Versions" count={p.versions.length}>
        <Rows
          testid="searchos-versions"
          rows={p.versions.map((x) => (
            <>
              <Name>{x.title}</Name>
              <Muted>{x.category}</Muted>
              {x.published === false && (
                <Badge variant="outline">unpublished</Badge>
              )}
              <Muted>
                <D iso={x.entry_date} />
              </Muted>
            </>
          ))}
        />
      </Section>

      <Section
        id="errors"
        title="Errors and incidents"
        count={p.errors.reports.length + p.errors.incidents.length}
      >
        <Sub title="Incidents" n={p.errors.incidents.length}>
          <Rows
            testid="searchos-incidents"
            rows={p.errors.incidents.map((x) => (
              <>
                <Name>{x.title}</Name>
                <Muted>{x.impact}</Muted>
                <StatusPill status={x.status} />
                <Muted>
                  <D iso={x.started_at} />
                </Muted>
              </>
            ))}
          />
        </Sub>
        <Sub title="Error reports" n={p.errors.reports.length}>
          <Rows
            testid="searchos-reports"
            rows={p.errors.reports.map((x) => (
              <>
                <Name>{x.title}</Name>
                <Muted>{x.severity}</Muted>
                <StatusPill status={x.status} />
                <Muted>
                  <D iso={x.created_at} />
                </Muted>
              </>
            ))}
          />
        </Sub>
      </Section>

      <Section id="infra" title="Infra" count={p.infra.length}>
        <Rows
          testid="searchos-infra"
          rows={p.infra.map((x) => (
            <>
              <Name>
                <Ext url={x.url}>{x.surface}</Ext>
              </Name>
              <Muted>{x.hosting}</Muted>
              {x.monitored ? (
                <>
                  <StatusDot tone={x.last_ping_ok ? "ok" : "bad"} />
                  <Muted>
                    {x.last_ping_ms != null ? `${x.last_ping_ms} ms, ` : ""}
                    <D iso={x.last_ping_at} />
                  </Muted>
                </>
              ) : (
                <Muted>not monitored</Muted>
              )}
              {!!x.consecutive_failures && (
                <Badge variant="destructive">
                  {x.consecutive_failures} failures
                </Badge>
              )}
            </>
          ))}
        />
      </Section>

      <Section
        id="tickets"
        title="Tickets"
        count={p.tickets.project.length + p.tickets.code.length}
      >
        <Sub title="Project tickets" n={p.tickets.project.length}>
          <Rows
            testid="searchos-tickets-project"
            rows={p.tickets.project.map((x) => (
              <>
                <span className="font-mono text-xs">{x.ticket_key}</span>
                <Name>{x.title}</Name>
                <Muted>{x.priority}</Muted>
                <StatusPill status={x.status} />
              </>
            ))}
          />
        </Sub>
        <Sub title="Code tickets" n={p.tickets.code.length}>
          <Rows
            testid="searchos-tickets-code"
            rows={p.tickets.code.map((x) => (
              <>
                <span className="font-mono text-xs">{x.code_key}</span>
                <Name>{x.title}</Name>
                <Muted>{x.repo}</Muted>
                <StatusPill status={x.status} />
              </>
            ))}
          />
        </Sub>
      </Section>
    </div>
  );
}

/** The company page tab. A company without searchos_id (the API answers 404) says so and shows nothing else. */
export function SearchosTab({ companyId }: { companyId: string | number }) {
  const { state, reload } = useSearchosProfile(companyId);
  if (state.kind === "loading")
    return (
      <p
        className="py-6 text-sm text-muted-foreground"
        data-testid="searchos-loading"
      >
        Loading...
      </p>
    );
  if (state.kind === "unlinked")
    return (
      <p
        className="py-6 text-sm text-muted-foreground"
        data-testid="searchos-unlinked"
      >
        Not linked to SearchOS yet
      </p>
    );
  if (state.kind === "ok") return <SearchosProfile p={state.profile} />;
  const text =
    state.kind === "forbidden"
      ? "SearchOS details are for admins."
      : state.kind === "unavailable"
        ? "SearchOS is not reachable right now. It usually comes back on its own."
        : "SearchOS details could not be loaded.";
  return (
    <div
      className="flex flex-col items-start gap-2 py-6 text-sm text-muted-foreground"
      data-testid="searchos-error"
      data-state={state.kind}
    >
      <p>{text}</p>
      <Button type="button" variant="outline" size="sm" onClick={reload}>
        Retry
      </Button>
    </div>
  );
}
