import { createClient, type User } from "jsr:@supabase/supabase-js@2";
import { createErrorResponse } from "./utils.ts";

function getAuthToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }
  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer" || !token) {
    throw new Error(`Auth header is not 'Bearer {token}'`);
  }
  return token;
}

// SearchOS: the token is checked by the Auth server (auth.getUser), which works
// for both legacy and asymmetric signing keys. SUPABASE_URL and SUPABASE_ANON_KEY
// are injected by the platform.
async function getUserFromToken(token: string): Promise<User | null> {
  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/**
 * Validates the Authorization header to ensure that a user is authenticated.
 */
export const AuthMiddleware = async (
  req: Request,
  next: (req: Request) => Promise<Response>,
) => {
  if (req.method === "OPTIONS") return await next(req);

  try {
    const user = await getUserFromToken(getAuthToken(req));
    if (user) return await next(req);
    return createErrorResponse(401, "Invalid authentication");
  } catch (e) {
    return createErrorResponse(401, e?.toString() || "Unauthorized");
  }
};

/**
 * Get the authenticated user using the authorization header.
 * User will be undefined for OPTIONS requests.
 */
export const UserMiddleware = async (
  req: Request,
  next: (req: Request, user?: User) => Promise<Response>,
) => {
  if (req.method === "OPTIONS") return await next(req);

  try {
    const user = await getUserFromToken(getAuthToken(req));
    if (!user) return createErrorResponse(401, "Unauthorized");
    return next(req, user);
  } catch (err) {
    return createErrorResponse(401, err?.toString() || "Unauthorized");
  }
};
