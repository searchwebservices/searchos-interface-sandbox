import { useEffect, useState } from "react";

import { normalize } from "./profile";
import type { Profile, ProfileBody } from "./profile";

export const searchosUrl = (companyId: string | number) =>
  `/api/apps/crm/companies/${encodeURIComponent(String(companyId))}/searchos`;
export const SUMMARY_URL = "/api/apps/crm/companies/summary";

export type SearchosState =
  | { kind: "loading" }
  | { kind: "ok"; profile: Profile }
  | { kind: "unlinked" }
  | { kind: "unavailable" }
  | { kind: "forbidden" }
  | { kind: "error"; status: number };

/** One admin GET of the console, same origin, with the device cookie. */
export async function fetchSearchos(
  companyId: string | number,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<SearchosState> {
  try {
    const r = await fetchImpl(searchosUrl(companyId), {
      credentials: "include",
    });
    if (r.status === 404) return { kind: "unlinked" };
    if (r.status === 403) return { kind: "forbidden" };
    if (r.status === 503) return { kind: "unavailable" };
    if (!r.ok) return { kind: "error", status: r.status };
    const body = (await r.json()) as ProfileBody;
    if (!body?.client) return { kind: "unlinked" };
    return { kind: "ok", profile: normalize(body) };
  } catch {
    return { kind: "error", status: 0 };
  }
}

export function useSearchosProfile(companyId: string | number | undefined) {
  const [state, setState] = useState<SearchosState>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (companyId === undefined) return;
    let live = true;
    setState({ kind: "loading" });
    void fetchSearchos(companyId).then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [companyId, tick]);
  return { state, reload: () => setTick((n) => n + 1) };
}

/** One row of GET /api/apps/crm/companies/summary. The first two fields are the original contract; the rest arrived with the Home page (2026-10-27) and may be absent on an older console. */
export type CompanySummary = {
  health: string | null;
  mrr_mxn: number | null;
  name?: string | null;
  status?: string | null;
  /** clients.status through crm.companies.searchos_id (null when the company links to no client). Health and MRR are only attached for active or closing. */
  client_status?: string | null;
  active?: boolean;
  last_contact_at?: string | null;
  /** The next (for a closing client, the last) charge date, from the cartera. */
  next_charge?: string | null;
};
export type SummaryMap = Record<string, CompanySummary>;

let cache: Promise<SummaryMap> | null = null;

/** Health and MRR for every linked company: one request, shared by the whole list. */
export function loadSummary(
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<SummaryMap> {
  if (!cache) {
    cache = (async () => {
      try {
        const r = await fetchImpl(SUMMARY_URL, { credentials: "include" });
        if (!r.ok) {
          cache = null;
          return {};
        }
        const body = await r.json();
        return body && typeof body === "object" ? (body as SummaryMap) : {};
      } catch {
        cache = null;
        return {};
      }
    })();
  }
  return cache;
}
export const resetSummaryCache = () => {
  cache = null;
};

export function useCompanySummary(companyId: string | number | undefined) {
  const [s, setS] = useState<CompanySummary | null>(null);
  useEffect(() => {
    if (companyId === undefined) return;
    let live = true;
    void loadSummary().then((m) => {
      if (live) setS(m[String(companyId)] ?? null);
    });
    return () => {
      live = false;
    };
  }, [companyId]);
  return s;
}
