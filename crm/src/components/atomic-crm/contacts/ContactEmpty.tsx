import { EmptyMark } from "@/searchos/Mark";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslate } from "ra-core";
import { Link } from "react-router";

import { ContactCreateSheet } from "./ContactCreateSheet";
import { useIsMobile } from "@/hooks/use-mobile";

/** Empty directory (kit section 10): one sentence of why, the one action that fills it. */
export const ContactEmpty = () => {
  const isMobile = useIsMobile();
  const translate = useTranslate();
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <ContactCreateSheet open={createOpen} onOpenChange={setCreateOpen} />
      <div className="sos-empty" data-testid="contacts-empty">
        <EmptyMark alt={translate("resources.contacts.empty.title")} />
        <h6 className="si-title">
          {translate("resources.contacts.empty.title")}
        </h6>
        <p className="si-lede">
          {translate("resources.contacts.empty.description")}
        </p>
        {isMobile ? (
          <Button
            onClick={() => setCreateOpen(true)}
            className="mt-4 h-11 px-7"
          >
            {translate("resources.contacts.action.new")}
          </Button>
        ) : (
          <Button asChild className="mt-4 h-11 px-7">
            <Link to="/contacts/create">
              {translate("resources.contacts.action.new")}
            </Link>
          </Button>
        )}
      </div>
    </>
  );
};
