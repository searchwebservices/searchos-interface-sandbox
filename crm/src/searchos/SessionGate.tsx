import { useEffect, useState, type ReactNode } from "react";

import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

import { MarkLoader } from "./Mark";
import { ConsoleOnlyNotice, SESSION_ERROR_MESSAGE } from "./ConsoleOnlyNotice";
import { ensureSession, type SessionResult } from "./session";

/** Renders the CRM only once a Supabase session exists. */
export const SessionGate = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<SessionResult | "pending">("pending");

  useEffect(() => {
    let cancelled = false;
    ensureSession(getSupabaseClient()).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "pending") return <MarkLoader fill />;
  if (state === "unauthorized") return <ConsoleOnlyNotice />;
  if (state === "error")
    return <ConsoleOnlyNotice message={SESSION_ERROR_MESSAGE} />;
  return <>{children}</>;
};
