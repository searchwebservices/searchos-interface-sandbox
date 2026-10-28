// SearchOS: CORS follows the request origin against an allow list.
// CRM_ALLOWED_ORIGINS is a comma separated env var; the two console origins are the default.
const DEFAULT_ORIGINS = ["http://localhost:8800", "http://10.100.100.167:8800"];

function allowedOrigins(): string[] {
  const raw = Deno.env.get("CRM_ALLOWED_ORIGINS");
  const extra = raw
    ? raw
        .split(",")
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean)
    : [];
  return extra.length ? extra : DEFAULT_ORIGINS;
}

const BASE_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer, accept-profile, content-profile",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

/** Static default, used where no request is at hand. The real origin is applied per request by OptionsMiddleware. */
export const corsHeaders: Record<string, string> = {
  ...BASE_HEADERS,
  "Access-Control-Allow-Origin": allowedOrigins()[0],
};

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/**
 * Handle OPTIONS requests for CORS preflight (200) and stamp the matching
 * CORS headers on every other response.
 */
export async function OptionsMiddleware(
  req: Request,
  next: (req: Request) => Promise<Response>,
) {
  const cors = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  const res = await next(req);
  const headers = new Headers(res.headers);
  headers.delete("Access-Control-Allow-Origin");
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}
