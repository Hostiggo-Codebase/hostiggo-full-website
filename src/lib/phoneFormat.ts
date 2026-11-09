/**
 * Canonical stored/displayed phone format: "+" followed by country code and
 * number (E.164). Supabase phone-OTP accounts hold the number WITHOUT the
 * plus ("919711159245"), and older rows were saved bare, so every read and
 * write passes through here.
 *
 * "919711159245" / "+91 97111 59245" / "09711159245" / "9711159245"
 *   -> "+919711159245". Empty / null -> null. Unrecognisable input is
 * returned unchanged so a stored value is never silently destroyed.
 */
export function toE164Phone(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return value;
  if (value.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return value;
}
