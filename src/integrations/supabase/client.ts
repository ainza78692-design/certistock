import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { isLocalBackend } from "@/lib/backendMode";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Local PostgreSQL mode routes data through the local API, but some legacy
// components still import this client. Keep a harmless placeholder so the app
// can build while local mode avoids making Supabase requests.
const localPlaceholderUrl = "http://127.0.0.1:54321";
const localPlaceholderKey = "local-mode-placeholder";

export const supabase = createClient<Database>(
  isLocalBackend ? localPlaceholderUrl : SUPABASE_URL,
  isLocalBackend ? localPlaceholderKey : SUPABASE_PUBLISHABLE_KEY,
);
