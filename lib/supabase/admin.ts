import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Admin Supabase client με service role key.
 * Παρακάμπτει RLS — ΧΡΗΣΗ ΜΟΝΟ ΑΠΟ SERVER-SIDE CODE.
 *
 * Καλείται από API routes που έχουν ήδη γίνει admin guard
 * (requireAdmin) ώστε να μη γίνει mass exposure.
 */
let cachedAdminClient: ReturnType<typeof createClient<Database>> | null = null;

export function getAdminClient() {
  if (cachedAdminClient) return cachedAdminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local " +
        "and restart the server."
    );
  }

  cachedAdminClient = createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedAdminClient;
}
