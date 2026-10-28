import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchosTab } from "./SearchosTab";
import {
  fetchSearchos,
  loadSummary,
  resetSummaryCache,
} from "./useSearchosData";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const res = (b: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(b), { status }));

const PROFILE = {
  client: { id: "c1", name: "Arido" },
  board: { health: "green", mrr_mxn: 9000, tier: "A" },
  projects: [
    {
      id: "p1",
      name: "Site",
      status: "live",
      repo_url: "https://github.com/x/a",
      live_url: "https://a.mx",
      hosting: "netlify",
    },
  ],
  proposals: [{ title: "Build", url: "https://prop", kind: "deal" }],
  contracts: [{ id: "k1", title: "MSA", status: "signed" }],
  versions: [{ id: "v1", title: "1.2", entry_date: "2026-10-01" }],
  errors: {
    incidents: [{ id: "i", title: "outage", status: "resolved" }],
    reports: [],
  },
  infra: [
    {
      surface: "app",
      url: "https://a.mx",
      monitored: true,
      last_ping_ok: true,
    },
  ],
  tickets: {
    project: [{ ticket_key: "A-1", title: "fix", status: "open" }],
    code: [],
  },
  cartera: {
    entries: [
      { id: "e", bucket: "mrr", monthly_amount: 9000, billing_state: "active" },
    ],
    payments: [],
  },
  invoices: [
    { id: "n1", amount: 500, status: "paid", paid_date: "2026-02-01" },
  ],
  facturas: [{ id: "f1", folio: "BP260-1", total: 580, status: "stamped" }],
};

let root: Root | null = null;
let el: HTMLElement;
const settle = async () => {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
};
const mount = async () => {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(<SearchosTab companyId="7" />);
  });
  await settle();
};

beforeEach(() => {
  resetSummaryCache();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("SearchosTab", () => {
  it("renders the profile sections from the console payload", async () => {
    const f = vi.fn(() => res(PROFILE));
    vi.stubGlobal("fetch", f);
    await mount();
    expect(f).toHaveBeenCalledWith("/api/apps/crm/companies/7/searchos", {
      credentials: "include",
    });
    expect(el.querySelector("[data-testid=health-badge]")?.textContent).toBe(
      "green",
    );
    const labels = [...el.querySelectorAll("[data-testid=searchos-tile]")].map(
      (t) => t.getAttribute("data-label"),
    );
    expect(labels).toEqual([
      "MRR",
      "Paid this year",
      "Open deals",
      "Open tickets",
      "Incidents, 30 days",
      "Latest version",
    ]);
    expect(el.textContent).toContain("$9,000 MXN");
    for (const id of [
      "money",
      "projects",
      "links",
      "proposals",
      "contracts",
      "versions",
      "errors",
      "infra",
      "tickets",
    ]) {
      expect(
        el.querySelector(`[data-testid=searchos-section-${id}]`),
        id,
      ).toBeTruthy();
    }
    expect(
      el.querySelector("[data-testid=searchos-facturas]")?.textContent,
    ).toContain("BP260-1");
    expect(
      el.querySelector(
        "[data-testid=searchos-projects] a[href='https://github.com/x/a']",
      ),
    ).toBeTruthy();
  });

  it("says Not linked to SearchOS yet on 404 and nothing else", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => res({ error: "not_found" }, 404)),
    );
    await mount();
    expect(el.textContent).toBe("Not linked to SearchOS yet");
  });

  it("shows a calm state with retry when the console database is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => res({ error: "db_unavailable" }, 503)),
    );
    await mount();
    expect(
      el
        .querySelector("[data-testid=searchos-error]")
        ?.getAttribute("data-state"),
    ).toBe("unavailable");
  });
});

describe("data helpers", () => {
  it("fetchSearchos maps statuses", async () => {
    expect(
      (await fetchSearchos(1, (() => res({}, 403)) as unknown as typeof fetch))
        .kind,
    ).toBe("forbidden");
    expect(
      (await fetchSearchos(1, (() => res({}, 500)) as unknown as typeof fetch))
        .kind,
    ).toBe("error");
    expect(
      (
        await fetchSearchos(1, (() =>
          Promise.reject(new Error("x"))) as unknown as typeof fetch)
      ).kind,
    ).toBe("error");
  });
  it("loadSummary asks once and shares the answer", async () => {
    const f = vi.fn(() => res({ 7: { health: "green", mrr_mxn: 9000 } }));
    const a = await loadSummary(f as unknown as typeof fetch);
    await loadSummary(f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a["7"].mrr_mxn).toBe(9000);
  });
  it("loadSummary gives {} and retries later when the console says no", async () => {
    const f = vi.fn(() => res({}, 403));
    expect(await loadSummary(f as unknown as typeof fetch)).toEqual({});
    await loadSummary(f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
