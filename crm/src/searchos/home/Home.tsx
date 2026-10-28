/**
 * Home (Bay, 2026-10-28): one question, three places to go. The BPE OS home
 * pattern on the kit: a mono eyebrow with the person's first name, the
 * question as the title, one line under it, then three large Choice tiles.
 * Each tile is an illustration panel (line art in the accent on the page
 * paper), a title, one sentence, and a mono meta line with the live count.
 * Counts come from the CRM itself; while they load the line says so, and a
 * failed count says so too. Never a guessed zero.
 */
import { ArrowRight } from "lucide-react";
import { useGetIdentity, useGetList } from "ra-core";
import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { startHref } from "../flows/model";
import { firstNameOf, plural, weekAgoIso } from "./homeModel";

/** A count from the list endpoint: only the total, one row. */
function useTotal(
  resource: string,
  filter: Record<string, unknown> = {},
): { total: number | null; pending: boolean; error: boolean } {
  const q = useGetList(resource, {
    pagination: { page: 1, perPage: 1 },
    sort: { field: "id", order: "ASC" },
    filter,
  });
  return {
    total: q.total ?? null,
    pending: q.isPending,
    error: !!q.error,
  };
}

function MetaLine({
  parts,
  pending,
  error,
  pendingText,
}: {
  parts: string[];
  pending: boolean;
  error: boolean;
  pendingText: string;
}) {
  const text = pending
    ? pendingText
    : error
      ? "Count unavailable right now"
      : parts.join(" · ");
  return (
    <span
      className={`hm-meta${pending ? " is-pending" : ""}`}
      data-testid="home-meta"
    >
      <span>{text}</span>
      <span className="hm-go" aria-hidden>
        <ArrowRight />
      </span>
    </span>
  );
}

function Tile({
  to,
  testid,
  art,
  title,
  note,
  meta,
}: {
  to: string;
  testid: string;
  art: ReactNode;
  title: string;
  note: string;
  meta: ReactNode;
}) {
  return (
    <Link to={to} className="hm-tile" data-testid={testid}>
      <span className="hm-art" aria-hidden>
        {art}
      </span>
      <span className="hm-title">{title}</span>
      <span className="hm-note">{note}</span>
      {meta}
    </Link>
  );
}

/* Line art, currentColor, no raster. Three scenes at a shared 160 x 100 box. */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const KanbanArt = () => (
  <svg viewBox="0 0 160 100" {...stroke}>
    <rect x="10" y="12" width="40" height="76" rx="6" />
    <rect x="60" y="12" width="40" height="76" rx="6" />
    <rect x="110" y="12" width="40" height="76" rx="6" />
    <path d="M18 24h24M68 24h24M118 24h24" opacity=".55" />
    <rect x="17" y="34" width="26" height="12" rx="3" />
    <rect x="17" y="52" width="26" height="12" rx="3" />
    <rect x="17" y="70" width="26" height="12" rx="3" />
    <rect x="67" y="34" width="26" height="12" rx="3" />
    <rect x="67" y="52" width="26" height="12" rx="3" />
    <rect x="117" y="34" width="26" height="12" rx="3" />
    <path d="M100 40h10" strokeDasharray="2 3" opacity=".7" />
  </svg>
);

const PersonPlusArt = () => (
  <svg viewBox="0 0 160 100" {...stroke}>
    <circle cx="66" cy="36" r="16" />
    <path d="M30 88c2-20 16-30 36-30s34 10 36 30" />
    <circle cx="118" cy="30" r="16" />
    <path d="M118 22v16M110 30h16" />
  </svg>
);

const DirectoryArt = () => (
  <svg viewBox="0 0 160 100" {...stroke}>
    <rect x="22" y="10" width="116" height="80" rx="8" />
    <path d="M22 36h116M22 62h116" opacity=".55" />
    <circle cx="40" cy="23" r="6" />
    <circle cx="40" cy="49" r="6" />
    <circle cx="40" cy="75" r="6" />
    <path d="M54 20h44M54 27h28M54 46h52M54 53h24M54 72h40M54 79h30" />
    <path d="M138 24h8M138 50h8M138 76h8" opacity=".55" />
  </svg>
);

export function Home() {
  const { identity } = useGetIdentity();
  const name = firstNameOf(identity?.fullName);
  // The week window is fixed once per mount: a fresh timestamp on every
  // render would change the query key each time and refetch in a loop.
  const [since] = useState(() => weekAgoIso());
  const open = useTotal("deals", { "archived_at@is": null });
  const moved = useTotal("deals", {
    "archived_at@is": null,
    "updated_at@gte": since,
  });
  const contacts = useTotal("contacts");
  const companies = useTotal("companies");

  return (
    <div
      className="mx-auto w-full max-w-[75rem] px-1 pb-10"
      data-testid="crm-home"
    >
      <header className="hm-head">
        <p className="si-eyebrow" data-testid="home-hello">
          {name ? `Hi, ${name}` : "Welcome"}
        </p>
        <h1 className="si-title" tabIndex={-1} data-crm-title>
          What do you need to get done?
        </h1>
        <p className="si-lede">Pick a place to start.</p>
      </header>
      <div className="hm-tiles">
        <Tile
          to="/deals"
          testid="home-leads"
          art={<KanbanArt />}
          title="Manage leads"
          note="The board, stage by stage, from discovery to won."
          meta={
            <MetaLine
              pendingText="Counting leads"
              pending={open.pending || moved.pending}
              error={open.error || moved.error}
              parts={[
                plural(open.total ?? 0, "open lead"),
                `${moved.total ?? 0} moved this week`,
              ]}
            />
          }
        />
        <Tile
          to={startHref("lead")}
          testid="home-new-lead"
          art={<PersonPlusArt />}
          title="Add a new lead"
          note="Company, person, where it came from. It lands in Discovery."
          meta={
            <MetaLine
              pendingText="3 steps · about a minute"
              pending={false}
              error={false}
              parts={["3 steps", "about a minute"]}
            />
          }
        />
        <Tile
          to="/contacts"
          testid="home-contacts"
          art={<DirectoryArt />}
          title="Contacts"
          note="Everyone we talk to, and the company they belong to."
          meta={
            <MetaLine
              pendingText="Counting contacts"
              pending={contacts.pending || companies.pending}
              error={contacts.error || companies.error}
              parts={[
                plural(contacts.total ?? 0, "contact"),
                plural(companies.total ?? 0, "company", "companies"),
              ]}
            />
          }
        />
      </div>
    </div>
  );
}
