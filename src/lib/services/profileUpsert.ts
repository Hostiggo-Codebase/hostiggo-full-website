/**
 * Builds the `users` upsert payload for POST /api/users.
 *
 * That route runs on EVERY Google / email-OTP sign-in (auth/callback,
 * api.verifyOtp) as well as from onboarding. The sign-in callers send
 * `phone: user.phone || null` from the auth identity, which is null for
 * Google and email users -- so writing the value unconditionally wiped the
 * phone a host had saved in Settings -> Personal Info on every login.
 *
 * Rule: for an existing row, a blank value (null / "" / missing) never
 * overwrites a stored value. Non-blank values still update (onboarding).
 */
import { toE164Phone } from "../phoneFormat";

type Existing = Record<string, any> | null | undefined;

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

export function buildProfileUpsert(body: Record<string, any>, existing: Existing) {
  const keepExisting = (key: string, value: unknown) => !!existing && isBlank(value) && !isBlank(existing[key]);

  const age = body.age == null || body.age === "" ? null : Number(body.age);
  const name = String(body.name ?? "").slice(0, 200);
  const email = body.email ? String(body.email).slice(0, 320) : "";

  return {
    user_id: String(body.user_id),
    name: keepExisting("name", name) ? existing!.name : name,
    email: keepExisting("email", email) ? existing!.email : email,
    ...(body.phone !== undefined &&
      !keepExisting("phone", body.phone) && { phone: toE164Phone(body.phone)?.slice(0, 20) ?? null }),
    ...(body.age !== undefined && !keepExisting("age", age) && { age }),
    ...(body.emergency_contact !== undefined &&
      !keepExisting("emergency_contact", body.emergency_contact) && {
        emergency_contact: body.emergency_contact ? String(body.emergency_contact).slice(0, 200) : null,
      }),
    // Google sign-in can provide the initial avatar, but must never replace
    // a photo the user has already uploaded from their account.
    ...(body.profile_pic_url !== undefined &&
      !existing?.profile_pic_url && {
        profile_pic_url: body.profile_pic_url ? String(body.profile_pic_url) : null,
      }),
    // Sign-in callers always send is_verified: false; never downgrade a
    // verified account on login.
    ...(body.is_verified !== undefined && !existing && { is_verified: body.is_verified === true }),
    ...(body.is_active !== undefined && !existing && { is_active: body.is_active === true }),
  };
}
