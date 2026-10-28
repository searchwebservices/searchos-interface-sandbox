/**
 * The navigation of the SearchOS CRM: a breadcrumb bar (Home > Leads > Deal)
 * in place of the page tabs. The model (which crumbs for which path) is pure,
 * in flows/model.ts; this file only resolves the record names.
 */
import { ChevronRight } from "lucide-react";
import { useGetOne } from "ra-core";
import { Link, useLocation } from "react-router";

import type { Company, Contact, Deal } from "@/components/atomic-crm/types";
import { crumbsFor, subjectIds } from "../flows/model";
import type { SubjectNames } from "../flows/model";

/** The names of the records in the path, when they load; the model falls back to "Deal 9" until then. */
export function useSubjectNames(
  pathname: string,
  search: string,
): SubjectNames {
  const ids = subjectIds(pathname, search);
  const deal = useGetOne<Deal>(
    "deals",
    { id: ids.deal as string },
    { enabled: !!ids.deal },
  );
  const contact = useGetOne<Contact>(
    "contacts",
    { id: ids.contact as string },
    { enabled: !!ids.contact },
  );
  const company = useGetOne<Company>(
    "companies",
    { id: ids.company as string },
    { enabled: !!ids.company },
  );
  return {
    deal: deal.data?.name ?? null,
    contact: contact.data
      ? `${contact.data.first_name} ${contact.data.last_name}`.trim()
      : null,
    company: company.data?.name ?? null,
  };
}

export function Breadcrumbs() {
  const location = useLocation();
  const names = useSubjectNames(location.pathname, location.search);
  const crumbs = crumbsFor(location.pathname, location.search, names);
  return (
    <nav
      aria-label="Breadcrumb"
      className="sos-crumbs min-w-0 flex-1"
      data-testid="crm-crumbs"
    >
      <ol className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap py-1">
        {crumbs.map((c, i) => (
          <li
            key={`${i}-${c.label}`}
            className="flex min-w-0 items-center gap-1"
          >
            {i > 0 ? (
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
            ) : null}
            {c.to ? (
              <Link to={c.to} className="truncate">
                {c.label}
              </Link>
            ) : (
              <span className="truncate" aria-current="page">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
