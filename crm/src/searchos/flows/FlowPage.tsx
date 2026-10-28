/**
 * #/flow/lead/:step?...  The one workflow left: Add a new lead, one StepFrame
 * per screen. Every answer rides in the query string, so Back, refresh and
 * deep links land on the same screen with the same choices.
 */
import { useMemo, useState } from "react";
import {
  useCreate,
  useGetIdentity,
  useGetList,
  useGetOne,
  useNotify,
} from "ra-core";
import type { Identifier } from "ra-core";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";

import { Input } from "@/components/ui/input";
import type { Company } from "@/components/atomic-crm/types";
import { Choice, Choices, StepFrame } from "./StepFrame";
import {
  FLOWS,
  LEAD_SOURCES,
  backHref,
  crumbsFor,
  firstStep,
  fromSearch,
  isFlowId,
  leadRecords,
  startHref,
  stepCounter,
  stepHref,
} from "./model";
import type { FlowId, Params, SubjectNames } from "./model";
import { useSubjectNames } from "../nav/Breadcrumbs";

type Ctx = {
  flow: FlowId;
  step: string;
  params: Params;
  n: number;
  of: number;
  back: string | null;
  go: (step: string, more?: Params) => void;
  hrefTo: (step: string, more?: Params) => string;
  names: SubjectNames;
};

function useCtx(): Ctx | null {
  const { flow, step } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => fromSearch(location.search), [location.search]);
  const names = useSubjectNames(location.pathname, location.search);
  if (!isFlowId(flow)) return null;
  const s =
    step && FLOWS[flow].steps.some((x) => x.id === step)
      ? step
      : firstStep(flow, params);
  const { n, of } = stepCounter(flow, s, params);
  const crumbs = crumbsFor(location.pathname, location.search, names);
  const hrefTo = (next: string, more: Params = {}) =>
    stepHref(flow, next, { ...params, ...more });
  return {
    flow,
    step: s,
    params,
    n,
    of,
    back: backHref(crumbs),
    go: (next, more) => navigate(hrefTo(next, more)),
    hrefTo,
    names,
  };
}

export function FlowPage() {
  const ctx = useCtx();
  const { step } = useParams();
  if (!ctx) return <Navigate to="/" replace />;
  if (!step || step !== ctx.step)
    return <Navigate to={stepHref(ctx.flow, ctx.step, ctx.params)} replace />;
  return <LeadFlow ctx={ctx} />;
}

const useCompanyName = (id?: string) =>
  useGetOne<Company>("companies", { id: id as string }, { enabled: !!id }).data
    ?.name;

function LeadFlow({ ctx }: { ctx: Ctx }) {
  const { step, params, n, of, back, go } = ctx;
  const [name, setName] = useState(params.name ?? "");
  const [first, setFirst] = useState(params.first ?? "");
  const [last, setLast] = useState(params.last ?? "");
  const [email, setEmail] = useState(params.email ?? "");
  const [busy, setBusy] = useState(false);
  const existingName = useCompanyName(params.company);
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const [create] = useCreate();
  const matches = useGetList<Company>(
    "companies",
    {
      pagination: { page: 1, perPage: 5 },
      sort: { field: "name", order: "ASC" },
      filter: { q: name.trim() },
    },
    { enabled: step === "company" && name.trim().length >= 2 },
  );
  const companyLabel = existingName ?? params.name ?? "";

  if (step === "company") {
    return (
      <StepFrame
        n={n}
        of={of}
        title="Which company is the lead?"
        lede="Type the name. If we already have it, pick it below instead of making a twin."
        back={back}
        primary={{
          label: "Continue",
          onClick: () => go("person", { name: name.trim(), company: "" }),
          disabled: name.trim().length < 2,
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          aria-label="Company name"
          autoFocus
          data-testid="lead-company"
        />
        {matches.data?.length ? (
          <Choices>
            {matches.data.map((c) => (
              <Choice
                key={String(c.id)}
                title={c.name}
                note="Already in the CRM, use it"
                onClick={() =>
                  go("person", { company: String(c.id), name: "" })
                }
                testid="lead-existing"
              />
            ))}
          </Choices>
        ) : null}
      </StepFrame>
    );
  }
  if (step === "person") {
    return (
      <StepFrame
        n={n}
        of={of}
        title={`Who is the person at ${companyLabel || "the company"}?`}
        back={back}
        primary={{
          label: "Continue",
          onClick: () =>
            go("source", {
              first: first.trim(),
              last: last.trim(),
              email: email.trim(),
            }),
          disabled: !first.trim(),
        }}
      >
        <Input
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          placeholder="First name"
          aria-label="First name"
          autoFocus
          data-testid="lead-first"
        />
        <Input
          value={last}
          onChange={(e) => setLast(e.target.value)}
          placeholder="Last name"
          aria-label="Last name"
        />
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional)"
          aria-label="Email"
          type="email"
        />
      </StepFrame>
    );
  }
  if (step === "source") {
    const finish = async (source: string) => {
      if (!identity || busy) return;
      setBusy(true);
      const recs = leadRecords({
        companyName: companyLabel,
        companyId: params.company,
        firstName: params.first ?? first,
        lastName: params.last ?? last,
        email: params.email ?? email,
        source,
        salesId: identity.id,
      });
      try {
        let companyId: Identifier | undefined = params.company;
        if (recs.company) {
          const co = await create(
            "companies",
            { data: recs.company },
            { returnPromise: true },
          );
          companyId = co.id;
        }
        const ct = await create(
          "contacts",
          { data: { ...recs.contact, company_id: companyId } },
          { returnPromise: true },
        );
        const dl = await create(
          "deals",
          {
            data: { ...recs.deal, company_id: companyId, contact_ids: [ct.id] },
          },
          { returnPromise: true },
        );
        go("done", {
          source,
          company: String(companyId),
          contact: String(ct.id),
          deal: String(dl.id),
        });
      } catch {
        notify("The lead did not save. Try again.", { type: "error" });
      } finally {
        setBusy(false);
      }
    };
    return (
      <StepFrame
        n={n}
        of={of}
        title="Where did it come from?"
        lede="One tap saves the company, the person and a deal in Discovery."
        back={back}
      >
        <Choices>
          {LEAD_SOURCES.map((s) => (
            <Choice
              key={s.value}
              title={s.label}
              note={s.note}
              selected={params.source === s.value}
              onClick={() => void finish(s.value)}
              testid="lead-source"
            />
          ))}
        </Choices>
        {busy ? <p className="text-sm text-muted-foreground">Saving.</p> : null}
      </StepFrame>
    );
  }
  return (
    <StepFrame
      n={n}
      of={of}
      done
      title="Lead added."
      lede={`${companyLabel || "The company"} is on the board in Discovery, with ${[params.first, params.last].filter(Boolean).join(" ") || "the contact"} attached.`}
      primary={{ label: "Home", to: "/" }}
      quiet={[
        { label: "Add another", to: startHref("lead") },
        { label: "Open the deal", to: `/deals/${params.deal}/show` },
      ]}
    />
  );
}
