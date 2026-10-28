import { useGetList, useTimeout, useTranslate } from "ra-core";
import { Skeleton } from "@/components/ui/skeleton";

import type { Contact, ContactNote } from "../types";
import { Home } from "@/searchos/home/Home";
import { DashboardStepper } from "./DashboardStepper";
import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const translate = useTranslate();
  return (
    <>
      <MobileHeader showRefresh>
        <div className="flex items-center gap-2 text-secondary-foreground no-underline py-3">
          <h1 className="text-base font-semibold">
            {translate("ra.page.dashboard")}
          </h1>
        </div>
      </MobileHeader>
      <MobileContent>{children}</MobileContent>
    </>
  );
};

const Loading = () => (
  <Wrapper>
    <Skeleton className="h-4 w-3/4 mb-4" />
    <Skeleton className="h-4 w-full mb-2" />
    <Skeleton className="h-4 w-full mb-2" />
    <Skeleton className="h-4 w-full mb-2" />
    <Skeleton className="h-4 w-full mb-2" />
  </Wrapper>
);

export const MobileDashboard = () => {
  const {
    data: dataContact,
    total: totalContact,
    isPending: isPendingContact,
  } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 1 },
  });
  const { total: totalContactNotes, isPending: isPendingContactNotes } =
    useGetList<ContactNote>("contact_notes", {
      pagination: { page: 1, perPage: 1 },
    });
  const oneSecondHasPassed = useTimeout(1000);

  const isPending = isPendingContact || isPendingContactNotes;

  if (isPending) {
    return oneSecondHasPassed ? <Loading /> : null;
  }

  if (!totalContact) {
    return (
      <Wrapper>
        <DashboardStepper step={1} />
      </Wrapper>
    );
  }

  if (!totalContactNotes) {
    return (
      <Wrapper>
        <DashboardStepper step={2} contactId={dataContact?.[0]?.id} />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Home />
    </Wrapper>
  );
};
