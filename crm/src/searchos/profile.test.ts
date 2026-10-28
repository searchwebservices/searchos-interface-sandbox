import { describe, expect, it } from "vitest";

import { healthTone, linksOf, normalize, summarize } from "./profile";
import type { ProfileBody } from "./profile";

const body: ProfileBody = {
  client: { id: "c1", name: "Arido" },
  board: { health: "green", mrr_mxn: 9000, tier: "A" },
  projects: [
    {
      id: "p1",
      name: "Site",
      live_url: "https://arido.mx",
      repo_url: "https://github.com/x/arido",
    },
  ],
  deals: [
    {
      id: "d1",
      name: "Build",
      stage: "proposal",
      proposal_url: "https://prop",
    },
    { id: "d2", name: "Old", stage: "won" },
  ],
  invoices: [
    { id: "i1", amount: 100, status: "paid", paid_date: "2026-03-01" },
  ],
  versions: [
    { id: "v1", title: "1.0", entry_date: "2026-01-01" },
    { id: "v2", title: "1.1", entry_date: "2026-02-01" },
  ],
  errors: {
    incidents: [{ id: "x", title: "down", started_at: "2026-10-20T00:00:00Z" }],
  },
  tickets: {
    project: [
      { ticket_key: "A-1", title: "t", status: "open" },
      { ticket_key: "A-2", title: "u", status: "done" },
    ],
  },
};

describe("searchos profile helpers", () => {
  it("normalizes missing lists to empty", () => {
    const p = normalize({ client: { id: "c", name: "n" } });
    expect(p.projects).toEqual([]);
    expect(p.cartera.entries).toEqual([]);
    expect(p.errors.incidents).toEqual([]);
    expect(p.board).toBeNull();
  });
  it("summarizes MRR, paid, open deals and tickets, recent incidents and the latest version", () => {
    const s = summarize(normalize(body), Date.parse("2026-10-27T00:00:00Z"));
    expect(s.mrr).toBe(9000);
    expect(s.paidCount).toBe(1);
    expect(s.paidTotal).toBe(100);
    expect(s.openDeals).toBe(1);
    expect(s.openTickets).toBe(1);
    expect(s.incidents30d).toBe(1);
    expect(s.latestVersion).toBe("1.1");
  });
  it("adds numeric strings as numbers", () => {
    const p = normalize({
      client: { id: "c", name: "n" },
      invoices: [
        {
          id: "a",
          amount: "16000.00" as unknown as number,
          status: "paid",
          paid_date: "2026-06-01",
        },
        {
          id: "b",
          amount: "40000.00" as unknown as number,
          status: "paid",
          paid_date: "2026-07-01",
        },
      ],
      mrr: [
        { service: "s", amount_mxn: "100" as unknown as number },
        { service: "t", amount_mxn: "50" as unknown as number },
      ],
    });
    const s = summarize(p, Date.parse("2026-10-27T00:00:00Z"));
    expect(s.paidTotal).toBe(56000);
    expect(s.mrr).toBe(150);
  });
  it("lists each link once with its kind", () => {
    expect(linksOf(normalize(body)).map((l) => l.kind)).toEqual([
      "live",
      "repo",
      "proposal",
    ]);
  });
  it("maps health words to tones", () => {
    expect(healthTone("Green")).toBe("ok");
    expect(healthTone("amber")).toBe("warn");
    expect(healthTone("red")).toBe("bad");
    expect(healthTone(null)).toBe("idle");
  });
});
