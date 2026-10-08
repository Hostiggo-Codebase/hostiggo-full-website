import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase";
import { supabaseAdmin } from "../supabase-admin";

const PROFILE_IMAGE_BUCKET = "profile-images";

export type UpsertUserPayload = {
  user_id: string;
  name: string;
  email: string;
  phone?: string | null;
  age?: number | null;
  is_active?: boolean | null;
  updated_at?: string | null;
  profile_pic_url?: string | null;
  is_verified?: boolean | null;
  emergency_contact?: string | null;
};

export type UserRow = {
  user_id: string;
  name: string;
  email: string;
  created_at: string | null;
  phone: string | null;
  age: number | null;
  is_active: boolean | null;
  updated_at: string | null;
  profile_pic_url: string | null;
  is_verified: boolean | null;
  emergency_contact: string | null;
  email_notifications: boolean | null;
  sms_alerts: boolean | null;
  promo_notifications: boolean | null;
  host_message_notifications: boolean | null;
  show_profile_to_hosts: boolean | null;
  include_in_search: boolean | null;
  activity_status: boolean | null;
};

// Server-side profile writes go through the service-role client. This used
// to use the shared anon `supabase` client, which on the server carries no
// session of its own -- so RLS (users_insert_own / users_update_own:
// user_id = auth.uid()) rejected the write and onboarding failed with
// "Failed to save". It only ever "worked" when that process-wide client
// happened to still hold a session left behind by an earlier server-side
// verifyOtp() call for the *same* user. Callers (the /api/users POST route
// and ensureProfile) are responsible for verifying the caller's identity
// first; this function trusts the user_id it is given.
const upsertUserWithSchema = async (payload: UpsertUserPayload) => {
  return supabaseAdmin
    .from("users")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
};

const getUserByIdWithSchema = async (userId: string) => {
  // Uses the admin client (not the anon `supabase` client) because RLS on
  // `users` otherwise blocks this SELECT server-side (no session forwarded),
  // silently returning null even right after a successful write.
  return supabaseAdmin.from("users").select("*").eq("user_id", userId).maybeSingle();
};

const getSessionAccessToken = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
};

const getAuthenticatedUserId = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.warn("[user] failed to resolve authenticated user:", error);
    return null;
  }
  return data.user?.id ?? null;
};

const encodeStoragePath = (path: string): string =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const getStorageUploadUrl = (bucket: string, path: string): string =>
  `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeStoragePath(path)}`;

export const usersAPI = {
  async upsertUser(payload: UpsertUserPayload): Promise<UserRow> {
    const { data, error } = await upsertUserWithSchema(payload);
    if (error) throw error;
    return data;
  },

  async getUserById(userId: string): Promise<UserRow | null> {
    const { data, error } = await getUserByIdWithSchema(userId);
    if (error) throw error;
    
    // If phone is missing in users table, try to get it from auth.users
    if (data && !data.phone) {
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (authData?.user?.phone) {
          data.phone = authData.user.phone;
        }
      } catch (authErr) {
        console.warn('[usersAPI.getUserById] Failed to fetch auth.users phone:', authErr);
      }
    }
    
    return data ?? null;
  },

  async requestPhoneChangeOtp(phone: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ phone });
    if (error) throw error;
  },

  async verifyPhoneChangeOtp(phone: string, token: string): Promise<void> {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: "phone_change" });
    if (error) throw error;
  },

  async uploadProfileImage(fileUri: string, userId: string): Promise<string> {
    const extension = fileUri.split(".").pop() || "jpg";
    const authUserId = await getAuthenticatedUserId();
    const resolvedOwnerId = authUserId || userId;
    const timestamp = Date.now();
    const filePath = `profiles/${resolvedOwnerId}/${timestamp}.${extension}`;

    if (authUserId && authUserId !== userId) {
      console.warn("[user] uploadProfileImage userId mismatch; using auth user id", {
        requestedUserId: userId,
        authUserId,
      });
    }

    const response = await fetch(fileUri);
    const blob = await response.blob();
    const contentType = blob.type || "image/jpeg";

    const { error } = await supabase.storage
      .from(PROFILE_IMAGE_BUCKET)
      .upload(filePath, blob, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload profile image: ${error.message}`);
    }

    const { data } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(filePath);
    if (!data?.publicUrl) {
      throw new Error("Uploaded profile image but failed to get public URL");
    }

    return data.publicUrl;
  },
};
