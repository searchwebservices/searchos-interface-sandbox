import { describe, expect, it } from "vitest";

import {
  FLOWS,
  FLOW_ORDER,
  backHref,
  crumbsFor,
  firstStep,
  fromSearch,
  leadRecords,
  nextStep,
  parseFlowPath,
  prevStep,
  startHref,
  stepCounter,
  stepHref,
  subjectIds,
  toSearch,
} from "./model";

describe("workflow catalogue", () => {
  it("ships one workflow, New lead, ending on done", () => {
    expect(FLOW_ORDER).toEqual(["lead"]);
    expect(FLOWS.lead.steps.map((s) => s.id)).toEqual([
      "company",
      "person",
      "source",
      "done",
    ]);
    expect(nextStep("lead", "done")).toBeNull();
    expect(nextStep("lead", "company")).toBe("person");
  });
});

describe("hash addressing", () => {
  it("writes and reads the step and its answers", () => {
    expect(toSearch({ b: "2", a: "1", c: "" })).toBe("?a=1&b=2");
    expect(fromSearch("?a=1&b=2")).toEqual({ a: "1", b: "2" });
    const href = stepHref("lead", "person", { company: "7" });
    expect(href).toBe("/flow/lead/person?company=7");
    expect(parseFlowPath("/flow/lead/person", "?company=7")).toEqual({
      flow: "lead",
      step: "person",
      params: { company: "7" },
    });
  });
  it("a bad step or workflow lands on the first one or nothing", () => {
    expect(parseFlowPath("/flow/lead/nope")?.step).toBe("company");
    expect(parseFlowPath("/flow/touch/who")).toBeNull();
  });
  it("a prefilled company skips its step and the way back knows it", () => {
    expect(firstStep("lead", { company: "7" })).toBe("person");
    expect(startHref("lead", { company: "7" })).toBe(
      "/flow/lead/person?company=7",
    );
    expect(prevStep("lead", "person", { company: "7" })).toBeNull();
    expect(prevStep("lead", "source")).toBe("person");
    expect(stepCounter("lead", "person", { company: "7" })).toEqual({
      n: 1,
      of: 3,
    });
  });
});

describe("breadcrumbs", () => {
  const names = {
    deal: "Quote builder",
    company: "Magnolia",
    contact: "Jacky",
  };
  it("Home alone is the page", () => {
    expect(crumbsFor("/")).toEqual([{ label: "Home", to: null }]);
  });
  it("Home > New lead on the first step", () => {
    expect(crumbsFor("/flow/lead/company")).toEqual([
      { label: "Home", to: "/" },
      { label: "New lead", to: null },
    ]);
  });
  it("inside the form the second crumb links to the start", () => {
    const c = crumbsFor("/flow/lead/source", "?name=Luz", names);
    expect(c.map((x) => x.label)).toEqual([
      "Home",
      "New lead",
      "Where it came from",
    ]);
    expect(backHref(c)).toBe("/flow/lead/company");
  });
  it("Home > Leads, Contacts, Companies", () => {
    expect(crumbsFor("/deals")).toEqual([
      { label: "Home", to: "/" },
      { label: "Leads", to: null },
    ]);
    expect(crumbsFor("/contacts").map((x) => x.label)).toEqual([
      "Home",
      "Contacts",
    ]);
    expect(crumbsFor("/companies").map((x) => x.label)).toEqual([
      "Home",
      "Companies",
    ]);
  });
  it("Home > Leads > <Deal>", () => {
    expect(crumbsFor("/deals/9/show", "", names)).toEqual([
      { label: "Home", to: "/" },
      { label: "Leads", to: "/deals" },
      { label: "Quote builder", to: null },
    ]);
    expect(crumbsFor("/deals/9/show", "").at(-1)?.label).toBe("Lead 9");
  });
  it("a company tab keeps the SearchOS crumb", () => {
    expect(
      crumbsFor("/companies/3/show/searchos", "", names).map((x) => x.label),
    ).toEqual(["Home", "Companies", "Magnolia", "SearchOS"]);
  });
  it("names the ids the bar must resolve", () => {
    expect(subjectIds("/deals/9/show")).toEqual({ deal: "9" });
    expect(subjectIds("/contacts/create")).toEqual({});
  });
});

describe("the lead's records", () => {
  it("turns a lead into a company, a contact and a deal in Discovery", () => {
    const r = leadRecords({
      companyName: " Florería Luz ",
      firstName: "Ana",
      lastName: "Lopez",
      email: "ana@luz.mx",
      source: "instagram",
      salesId: 1,
      now: "2026-10-27T10:00:00.000Z",
    });
    expect(r.company).toEqual({
      name: "Florería Luz",
      sales_id: 1,
      created_at: "2026-10-27T10:00:00.000Z",
    });
    expect(r.contact.email_jsonb).toEqual([
      { email: "ana@luz.mx", type: "Work" },
    ]);
    expect(r.deal.stage).toBe("discovery");
    expect(r.deal.name).toBe("Florería Luz lead");
    expect(
      leadRecords({
        companyName: "X",
        companyId: "5",
        firstName: "A",
        lastName: "",
        source: "other",
        salesId: 1,
      }).company,
    ).toBeNull();
  });
});
