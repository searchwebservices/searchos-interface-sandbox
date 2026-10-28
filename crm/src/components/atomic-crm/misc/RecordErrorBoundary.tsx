import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

/**
 * Wraps a record show view so one bad record shows an inline message
 * instead of taking down the whole app.
 */
export const RecordErrorBoundary = ({
  resource,
  children,
}: {
  resource: string;
  children: ReactNode;
}) => (
  <ErrorBoundary
    resetKeys={[typeof window !== "undefined" ? window.location.hash : ""]}
    fallbackRender={() => (
      <div
        role="alert"
        className="m-4 rounded-md border border-border p-4 text-sm text-muted-foreground"
      >
        Could not render this {resource}.
      </div>
    )}
  >
    {children}
  </ErrorBoundary>
);
