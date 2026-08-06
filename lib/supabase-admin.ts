import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Falta la variable de entorno SUPABASE_URL");
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    "Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY"
  );
}

/**
 * Cliente exclusivo del servidor.
 *
 * IMPORTANTE:
 * La service role key nunca debe utilizarse dentro de componentes
 * del navegador ni llevar el prefijo NEXT_PUBLIC_.
 */
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
