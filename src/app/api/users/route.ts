import { NextRequest, NextResponse } from "next/server";
import { usersAPI } from "@/lib/services/user";
import { updateUserProfile, deactivateUserAccount } from "@/lib/services/admin-writes";
import { buildProfileUpsert } from "@/lib/services/profileUpsert";
import { errorMessage } from "@/lib/api-error";
import {
  forbiddenResponse,
  getAuthenticatedUserId,
  readJsonBody,
  requireUserId,
  UnauthorizedError,
} from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const jsonError = (err: unknown, status = 500) => {
  console.error("[/api/users] error:", err);
  return NextResponse.json({ error: errorMessage(err, "Request failed") }, { status });
};

export async function GET(req: NextRequest) {
  try {
    // A profile row carries email, phone and emergency contact -- only the
    // signed-in user may read their own. The query param is accepted for
    // backwards compatibility but must match the verified identity.
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    const requested = req.nextUrl.searchParams.get("userId");
    if (requested && requested !== userId) return forbiddenResponse();

    const data = await usersAPI.getUserById(userId);
    return NextResponse.json({ data });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    if (body instanceof NextResponse) return body;
    if (!body.user_id || !body.name) {
      return NextResponse.json({ error: "user_id and name are required" }, { status: 400 });
    }
    // The write below uses the service-role client (see usersAPI.upsertUser),
    // so the caller's identity must be proven here: the bearer token is
    // verified against Supabase Auth and must belong to the user_id being
    // written. Without this, anyone could overwrite anyone's profile.
    let authedUserId: string;
    try {
      authedUserId = await getAuthenticatedUserId(req);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
      }
      throw e;
    }
    if (authedUserId !== String(body.user_id)) {
      return NextResponse.json({ error: "You can only update your own profile." }, { status: 403 });
    }
    // Whitelist the columns the onboarding flow actually owns -- passing the
    // raw body to .upsert() meant any extra key 500'd with "column not
    // found", and any users-table column could be written arbitrarily.
    const age = body.age == null ? null : Number(body.age);
    if (age != null && (!Number.isInteger(age) || age < 1 || age > 150)) {
      return NextResponse.json({ error: "age must be between 1 and 150" }, { status: 400 });
    }
    // This runs on every Google/OTP sign-in (see auth/callback and
    // /api/auth/otp's ensureProfile), always asking for is_active: true --
    // for a brand-new profile that's correct, but honoring it unconditionally
    // would silently reactivate an account someone deactivated from account
    // settings the moment they signed back in. Only apply is_active when
    // this is actually an insert; an existing row keeps whatever
    // deactivateUserAccount last set.
    const existing = await usersAPI.getUserById(String(body.user_id));
    // Blank values from sign-in callers never overwrite stored ones (see
    // buildProfileUpsert -- this used to wipe saved phone numbers on login).
    const data = await usersAPI.upsertUser(buildProfileUpsert(body, existing));
    return NextResponse.json({ data });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // Both actions write with the service-role client (bypassing RLS), so the
    // target is always the caller's own verified account -- never a userId
    // from the body. Deactivation also bans the auth user, so a spoofable id
    // here meant anyone could lock anyone out.
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    const body = await readJsonBody(req);
    if (body instanceof NextResponse) return body;
    if (body.userId && body.userId !== userId) return forbiddenResponse();

    if (body.action === "update-profile") {
      const patch = validateProfilePatch(body.patch);
      if ("error" in patch) return NextResponse.json({ error: patch.error }, { status: 400 });
      const data = await updateUserProfile(userId, patch.value);
      return NextResponse.json({ data });
    }

    if (body.action === "deactivate-account") {
      const data = await deactivateUserAccount(userId);
      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return jsonError(err);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BOOLEAN_FIELDS = [
  "email_notifications",
  "sms_alerts",
  "promo_notifications",
  "host_message_notifications",
  "show_profile_to_hosts",
  "include_in_search",
  "activity_status",
] as const;

/**
 * Server-side value validation for profile edits -- the client form checks
 * the same rules, but this is the one that can't be skipped. Only keys that
 * are present get validated/written, so partial saves (e.g. a single
 * notification toggle) work.
 */
function validateProfilePatch(
  raw: unknown,
): { value: Record<string, any> } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Nothing to update." };
  const patch = raw as Record<string, unknown>;
  const out: Record<string, any> = {};

  if ("name" in patch) {
    const name = String(patch.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 80) return { error: "Name must be 2-80 characters." };
    out.name = name;
  }
  if ("email" in patch) {
    const email = String(patch.email ?? "").trim().toLowerCase();
    if (email && (email.length > 254 || !EMAIL_RE.test(email))) {
      return { error: "Enter a valid email address." };
    }
    out.email = email || null;
  }
  if ("phone" in patch) {
    const phone = normalizeIndianPhone(patch.phone);
    if (phone === undefined) return { error: "Enter a valid 10-digit Indian mobile number." };
    out.phone = phone;
  }
  if ("emergency_contact" in patch) {
    // Free text like "Mom - 98765 43210", but it must contain a reachable
    // Indian mobile number.
    const contact = String(patch.emergency_contact ?? "").trim().replace(/\s+/g, " ");
    if (contact) {
      const digits = contact.replace(/[^\d]/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
      const hasMobile = /[6-9]\d{9}/.test(digits);
      if (!hasMobile || contact.length > 100) {
        return { error: "Emergency contact needs a valid 10-digit mobile number (up to 100 characters)." };
      }
    }
    out.emergency_contact = contact || null;
  }
  if ("age" in patch) {
    if (patch.age === null || patch.age === "") {
      out.age = null;
    } else {
      const age = Number(patch.age);
      if (!Number.isInteger(age) || age < 18 || age > 120) {
        return { error: "Age must be a whole number between 18 and 120." };
      }
      out.age = age;
    }
  }
  if ("profile_pic_url" in patch) {
    const url = patch.profile_pic_url ? String(patch.profile_pic_url) : null;
    if (url && !/^https:\/\//.test(url)) return { error: "Invalid photo URL." };
    out.profile_pic_url = url;
  }
  for (const key of BOOLEAN_FIELDS) {
    if (key in patch) {
      if (typeof patch[key] !== "boolean") return { error: `${key} must be true or false.` };
      out[key] = patch[key];
    }
  }
  if (Object.keys(out).length === 0) return { error: "Nothing to update." };
  return { value: out };
}

/** "+91 98765 43210" / "9876543210" -> "+919876543210"; "" -> null; invalid -> undefined. */
function normalizeIndianPhone(raw: unknown): string | null | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : undefined;
}
