import { describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  buildContext,
  parseCrmHash,
  startContextShim,
} from "./context";

describe("parseCrmHash", () => {
  it.each([
    ["#/contacts/42", "contacts", "42"],
    ["#/deals/9", "deals", "9"],
    ["#/companies/3", "companies", "3"],
    ["#/contacts/42/show", "contacts", "42"],
    ["#/deals/9?foo=1", "deals", "9"],
    ["#/contacts/42/", "contacts", "42"],
  ])("%s", (hash, resource, id) => {
    expect(parseCrmHash(hash)).toEqual({ resource, id });
  });

  it("reads the company tab from /show/:tab", () => {
    expect(parseCrmHash("#/companies/7/show/searchos")).toEqual({
      resource: "companies",
      id: "7",
      tab: "searchos",
    });
    expect(parseCrmHash("#/companies/7/show")).toEqual({
      resource: "companies",
      id: "7",
    });
  });

  it("returns nulls for routes without a record", () => {
    expect(parseCrmHash("#/")).toEqual({ resource: null, id: null });
    expect(parseCrmHash("")).toEqual({ resource: null, id: null });
    expect(parseCrmHash("#/contacts")).toEqual({ resource: null, id: null });
    expect(parseCrmHash("#/tasks/5")).toEqual({ resource: null, id: null });
    expect(parseCrmHash("#/settings")).toEqual({ resource: null, id: null });
  });

  it("does not treat create as an id", () => {
    expect(parseCrmHash("#/deals/create")).toEqual({
      resource: "deals",
      id: null,
    });
  });
});

describe("buildContext", () => {
  it("carries route, resource, id and title", () => {
    expect(buildContext("#/deals/9", "Sitio web")).toEqual({
      type: "crm.context",
      route: "#/deals/9",
      resource: "deals",
      id: "9",
      title: "Sitio web",
    });
  });
});

describe("buildContext with a tab", () => {
  it("carries tab searchos and the client name for the SearchOS tab", () => {
    expect(buildContext("#/companies/7/show/searchos", "Arido")).toEqual({
      type: "crm.context",
      route: "#/companies/7/show/searchos",
      resource: "companies",
      id: "7",
      title: "Arido",
      tab: "searchos",
    });
  });
});

describe("applyTheme", () => {
  it("toggles the dark class and ignores junk", () => {
    applyTheme(document, "dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme(document, "light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
    applyTheme(document, "purple");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});

describe("startContextShim", () => {
  const makeWindow = () => {
    const listeners: Record<string, ((e: any) => void)[]> = {};
    const parent = { postMessage: vi.fn() };
    const win: any = {
      parent,
      location: { hash: "#/contacts/42", origin: "https://box.test" },
      document,
      matchMedia: () => ({ matches: false }),
      addEventListener: (t: string, f: (e: any) => void) =>
        (listeners[t] ??= []).push(f),
      removeEventListener: vi.fn(),
    };
    return { win, parent, listeners };
  };

  it("follows crm.navigate from the parent only, hash routes only", () => {
    const { win, parent, listeners } = makeWindow();
    startContextShim(win);
    const send = (
      data: unknown,
      origin = "https://box.test",
      source: unknown = parent,
    ) => listeners.message.forEach((f) => f({ data, origin, source }));
    send({ type: "crm.navigate", hash: "#/companies/7/show/searchos" });
    expect(win.location.hash).toBe("#/companies/7/show/searchos");
    send({ type: "crm.navigate", hash: "#/deals/1" }, "https://evil.test");
    send({ type: "crm.navigate", hash: "#/deals/2" }, "https://box.test", {});
    send({ type: "crm.navigate", hash: "javascript:alert(1)" });
    expect(win.location.hash).toBe("#/companies/7/show/searchos");
  });

  it("posts the context on start and on every hash change", () => {
    const { win, parent, listeners } = makeWindow();
    const stop = startContextShim(win);
    expect(parent.postMessage).toHaveBeenCalledWith(
      {
        type: "crm.context",
        route: "#/contacts/42",
        resource: "contacts",
        id: "42",
        title: null,
      },
      "https://box.test",
    );
    win.location.hash = "#/deals/9";
    listeners.hashchange.forEach((f) => f({}));
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ resource: "deals", id: "9" }),
      "https://box.test",
    );
    stop();
  });

  it("only obeys theme messages from the parent on the same origin", () => {
    const { win, parent, listeners } = makeWindow();
    const stop = startContextShim(win);
    const send = (event: any) => listeners.message.forEach((f) => f(event));
    send({
      origin: "https://evil.test",
      source: parent,
      data: { type: "theme", value: "dark" },
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    send({
      origin: "https://box.test",
      source: {},
      data: { type: "theme", value: "dark" },
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    send({
      origin: "https://box.test",
      source: parent,
      data: { type: "theme", value: "dark" },
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    stop();
    applyTheme(document, "light");
  });
});
