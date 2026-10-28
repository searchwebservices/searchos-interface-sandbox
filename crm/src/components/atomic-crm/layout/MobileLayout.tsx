import { Error } from "@/components/admin/error";
import { Notification } from "@/components/admin/notification";
import { MarkLoader } from "@/searchos/Mark";
import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { MobileNavigation } from "./MobileNavigation";
import { PullToRefresh } from "./PullToRefresh";

export const MobileLayout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  return (
    <DataImportProvider>
      <PullToRefresh />
      <ErrorBoundary FallbackComponent={Error}>
        <Suspense fallback={<MarkLoader />}>{children}</Suspense>
      </ErrorBoundary>
      <MobileNavigation />
      <Notification mobileOffset={{ bottom: "72px" }} />
    </DataImportProvider>
  );
};
