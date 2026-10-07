import { createClient } from "@supabase/supabase-js";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase";

// authApi runs inside /app/api/* route handlers. Calls that *establish* a
// session (verifyOtp) must not run on the
// shared module-level `supabase` client: on the server that client is a
// process-wide singleton, so the session it stores would leak into every
// later request served by the same instance (another user's requests would
// silently run as whoever signed in last). A fresh, non-persisting client
// per call keeps each sign-in isolated; the session is returned to the
// browser in the response body, which is where it belongs.
const isolatedClient = () =>
  createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

export const authApi = {
  getSession: async () => {
    return await supabase.auth.getSession();
  },

  signInWithOtp: async (phone: string) => {
    return await supabase.auth.signInWithOtp({ 
      phone,
      options: {
        shouldCreateUser: true,
      },
    });
  },

  signInWithEmailOtp: async (email: string) => {
    return await supabase.auth.signInWithOtp({
      email,
      // Code-only login: the email carries the 6-digit {{ .Token }} (see
      // supabase/templates/README.md). No emailRedirectTo -- that is for link emails.
      options: { shouldCreateUser: true },
    });
  },

  verifyOtp: async (params: { phone?: string; email?: string; token: string; type: "sms" | "email" }) => {
    if (params.type === "email" && params.email) {
      return await isolatedClient().auth.verifyOtp({
        email: params.email,
        token: params.token,
        type: "email",
      });
    }
    if (params.phone) {
      return await isolatedClient().auth.verifyOtp({
        phone: params.phone,
        token: params.token,
        type: "sms",
      });
    }
    throw new Error("Either phone or email must be provided for OTP verification");
  },

  updateUser: async (attributes: { phone?: string; email?: string }) => {
    return await supabase.auth.updateUser(attributes);
  },

  signOut: async () => {
    return await supabase.auth.signOut();
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  },
};
