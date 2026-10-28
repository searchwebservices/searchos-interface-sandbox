import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Notification } from "@/components/admin/notification";
import { Error } from "@/components/admin/error";
import { MarkLoader } from "@/searchos/Mark";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import Header from "./Header";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  return (
    <DataImportProvider>
      <Header />
      <main className="max-w-screen-xl mx-auto p-3" id="main-content">
        <ErrorBoundary FallbackComponent={Error}>
          <Suspense fallback={<MarkLoader />}>{children}</Suspense>
        </ErrorBoundary>
      </main>
      <Notification />
    </DataImportProvider>
  );
};
