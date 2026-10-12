import { toE164Phone } from "./phoneFormat";

/**
 * Editable guest-profile fields. Every key maps to a real `users` column that
 * PATCH /api/users (validateProfilePatch) accepts -- do not add fields here
 * without a column and a server whitelist entry, or edits will silently vanish.
 */
export type ProfileForm = {
  name: string;
  email: string;
  phone: string;
  age: string;
  emergencyContact: string;
};

export type ProfileFormErrors = Partial<Record<keyof ProfileForm, string>>;

type UserLike = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  emergency_contact?: string | null;
} | null | undefined;

export function profileFormFromUser(user: UserLike): ProfileForm {
  return {
    name: user?.name ?? "",
    email: user?.email ?? "",
    // Stored numbers are E.164 ("+91XXXXXXXXXX"); legacy bare rows display the same way.
    phone: toE164Phone(user?.phone) ?? "",
    age: user?.age ? String(user.age) : "",
    emergencyContact: user?.emergency_contact ?? "",
  };
}

const stripIndian = (raw: string) => raw.replace(/[^\d]/g, "").replace(/^(91|0)(?=\d{10}$)/, "");

/** Mirrors the server rules in PATCH /api/users (which remain authoritative). */
export function validateProfileForm(form: ProfileForm): ProfileFormErrors {
  const e: ProfileFormErrors = {};
  const n = form.name.trim();
  if (n.length < 2 || n.length > 80) e.name = "Enter your name (2-80 characters).";
  const em = form.email.trim();
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) e.email = "Enter a valid email address.";
  if (form.phone.trim() && !/^[6-9]\d{9}$/.test(stripIndian(form.phone))) {
    e.phone = "Enter a valid 10-digit Indian mobile number.";
  }
  if (form.age.trim()) {
    const a = Number(form.age);
    if (!Number.isInteger(a) || a < 18 || a > 120) e.age = "Age must be between 18 and 120.";
  }
  const ec = form.emergencyContact.trim();
  if (ec && !/[6-9]\d{9}/.test(stripIndian(ec))) {
    e.emergencyContact = "Include a valid 10-digit mobile number.";
  }
  return e;
}

/**
 * Only the fields that changed, in the shape PATCH /api/users expects, so an
 * untouched legacy value never blocks a save. Phone is compared in E.164 so a
 * legacy bare number is not re-sent just because it is displayed with "+91".
 */
export function buildProfilePatch(form: ProfileForm, user: UserLike): Record<string, unknown> {
  const before = profileFormFromUser(user);
  const patch: Record<string, unknown> = {};
  if (form.name.trim() !== before.name) patch.name = form.name.trim();
  if (form.email.trim() !== before.email) patch.email = form.email.trim();
  if ((toE164Phone(form.phone) ?? "") !== before.phone) patch.phone = form.phone.trim();
  if (form.age.trim() !== before.age) patch.age = form.age.trim() ? Number(form.age) : null;
  if (form.emergencyContact.trim() !== before.emergencyContact) {
    patch.emergency_contact = form.emergencyContact.trim() || null;
  }
  return patch;
}

/**
 * The AuthContext.updateProfile implementation: persist via PATCH /api/users,
 * then reload the user so every screen shows the server-normalised values.
 * Errors propagate so the caller can show a failure toast.
 */
export async function saveProfilePatch(
  deps: {
    update: (userId: string, patch: Record<string, unknown>) => Promise<unknown>;
    reload: (userId: string) => Promise<void>;
  },
  userId: string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!userId) throw new Error("Sign in to update your profile.");
  if (Object.keys(patch).length === 0) return;
  await deps.update(userId, patch);
  await deps.reload(userId);
}
