import { SCHEMA } from "@/lib/schema.constants";
import { createClient } from "@supabase/supabase-js";

// No hardcoded fallback here on purpose -- these used to have a literal
// project URL/anon key committed as a fallback, which meant a missing env
// var failed silently instead of loudly, and the anon key sat in source
// control right next to it. Both must come from real env vars now; a
// misconfigured deploy should fail at build/boot, not quietly work off a
// stale committed value.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
  );
}

// Next.js patches the global `fetch` in the App Router and will cache GET
// requests -- including the ones supabase-js makes under the hood -- to its
// on-disk Data Cache, which survives dev-server restarts. Without `cache:
// "no-store"` here, a query result (e.g. "popular locations") can keep being
// served stale indefinitely after the underlying rows change or get
// deleted, even on a `force-dynamic` route. Mirrors the same fix already
// applied to the service-role client in supabase-admin.ts.
const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const response = await fetch(input, { ...init, cache: "no-store" });
    return response;
  } catch (error: any) {
    console.error("[supabase] Fetch Error:", {
      message: error.message,
      name: error.name,
      input,
    });
    throw error;
  }
};

// PKCE is the flow Supabase documents for anything with a server side (this
// app upserts the profile and verifies bearer tokens in /app/api/*). The
// previous default, "implicit", is what dumped the raw
// access_token/refresh_token into the URL fragment after Google sign-in.
// With PKCE the provider redirects back with `?code=` and
// detectSessionInUrl exchanges it for a session client-side, into the same
// localStorage store every other flow here already uses. Only affects the
// OAuth and email-magic-link redirects; the 6-digit email OTP, phone OTP and
// password flows return a session directly and are unchanged.
const authOptions = {
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
  flowType: "pkce" as const,
};

// Plain `createClient(...)` here (no wrapping getter/singleton) is
// deliberate: Next.js only evaluates a module once per process, so this
// already only runs once, and it lets TypeScript infer the client's schema
// types from the literal call-site arguments. Wrapping it behind a
// `ReturnType<typeof createClient>`-typed variable loses that inference and
// collapses every `.from(table)` row type to `never` across the app --
// don't reintroduce that.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: customFetch },
  auth: authOptions,
  db: {
    schema: SCHEMA.testingSchema,
  },
});

// A second client, identical except it does NOT force `cache: "no-store"`.
// Only for reads that are already wrapped in `unstable_cache`
// (src/lib/services/cached-reference-data.ts) -- that wrapper is the actual
// caching/freshness layer (its own revalidate window), so the inner fetch
// forcing no-store was redundant there, and worse: a no-store fetch during
// Next's static-generation pass throws "Dynamic server usage", which broke
// the homepage in production (it couldn't be prerendered/ISR'd at all).
// Everywhere else in the app should keep using the `supabase` export above.
//
// This client only ever does anonymous reads for cached reference data
// (see src/lib/services/hotel.ts) -- it never needs to manage a user
// session. GoTrue registers a client under its storage key regardless of
// `persistSession`/`detectSessionInUrl`, so two clients built from the same
// URL (and therefore the same default "sb-<project-ref>-auth-token" key)
// still trip Supabase's "Multiple GoTrueClient instances detected" warning
// even with both of those disabled. Giving this one its own storageKey is
// the actual fix, not just disabling persistence.
export const supabaseCacheable = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    ...authOptions,
    persistSession: false,
    detectSessionInUrl: false,
    storageKey: "sb-hostiggo-cacheable-noop",
  },
  db: {
    schema: SCHEMA.testingSchema,
  },
});

// Narrowed to string by the throw above; re-typed so importers get `string`
// rather than the raw `string | undefined` from process.env.
const supabaseUrl: string = SUPABASE_URL;
const supabaseAnonKey: string = SUPABASE_ANON_KEY;
export { supabaseUrl as SUPABASE_URL, supabaseAnonKey as SUPABASE_ANON_KEY };
