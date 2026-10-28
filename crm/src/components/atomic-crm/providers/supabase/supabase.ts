import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

// SearchOS: every CRM table, view and function lives in the "crm" schema of
// the shared project. PostgREST needs it both on the client (rpc, from) and on
// the data provider (Accept-Profile / Content-Profile headers).
export const CRM_SCHEMA = "crm";

// Own storage key: the console may hold a session of its own in the same origin.
export const SESSION_STORAGE_KEY = "searchos-crm-auth";

let supabaseClient: SupabaseClient | null = null;

export const getSupabaseClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient<any, typeof CRM_SCHEMA>(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SB_PUBLISHABLE_KEY,
      {
        db: { schema: CRM_SCHEMA },
        auth: {
          storageKey: SESSION_STORAGE_KEY,
          detectSessionInUrl: false,
        },
      },
    ) as unknown as SupabaseClient;
  }
  return supabaseClient;
};
