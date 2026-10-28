import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SearchOS session shim. The CRM has no login of its own: the console mints a
 * Supabase session for the approved device and hands it over at this URL
 * (same origin, cookie authenticated).
 */
export const SESSION_URL = "/api/apps/crm/session";

export type SessionResult = "ready" | "unauthorized" | "error";

type AuthLike = Pick<SupabaseClient, "auth">;

export async function ensureSession(
  supabase: AuthLike,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<SessionResult> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return "ready";

    const response = await fetchImpl(SESSION_URL, { credentials: "include" });
    if (response.status === 401) return "unauthorized";
    if (!response.ok) return "error";

    const body = await response.json();
    const accessToken = body?.access_token;
    const refreshToken = body?.refresh_token;
    if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
      return "error";
    }

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return error ? "error" : "ready";
  } catch {
    return "error";
  }
}
