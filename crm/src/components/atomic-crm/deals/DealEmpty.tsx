import { useGetList, useTranslate } from "ra-core";
import { EmptyMark } from "@/searchos/Mark";
import { matchPath, useLocation, Link } from "react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MarkLoader } from "@/searchos/Mark";
import { startHref } from "@/searchos/flows/model";

import type { Contact } from "../types";
import { DealCreate } from "./DealCreate";

/** Empty board (kit section 10): one sentence of why, the one action that fills it. */
export const DealEmpty = ({ children }: { children?: ReactNode }) => {
  const translate = useTranslate();
  const location = useLocation();
  const matchCreate = matchPath("/deals/create", location.pathname);

  // get Contact data
  const { data: contacts, isPending: contactsLoading } = useGetList<Contact>(
    "contacts",
    {
      pagination: { page: 1, perPage: 1 },
    },
  );

  if (contactsLoading) return <MarkLoader />;

  return (
    <div className="sos-empty" data-testid="deals-empty">
      <EmptyMark alt={translate("resources.deals.empty.title")} />
      <h3 className="si-title">{translate("resources.deals.empty.title")}</h3>
      {contacts && contacts.length > 0 ? (
        <>
          <p className="si-lede">
            {translate("resources.deals.empty.description")}
          </p>
          <Button
            asChild
            className="mt-4 h-11 px-7"
            data-testid="deals-empty-new"
          >
            <Link to={startHref("lead")}>Add a new lead</Link>
          </Button>
          <DealCreate open={!!matchCreate} />
          {children}
        </>
      ) : (
        <>
          <p className="si-lede">
            Nothing on the board yet. A lead starts with a person, so add the
            first contact and the board follows.
          </p>
          <Button
            asChild
            className="mt-4 h-11 px-7"
            data-testid="deals-empty-new"
          >
            <Link to={startHref("lead")}>Add a new lead</Link>
          </Button>
        </>
      )}
    </div>
  );
};
