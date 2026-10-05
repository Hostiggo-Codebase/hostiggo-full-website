// Display formatters shared by guest and host screens.

/**
 * "₹4,577.60" / "₹4,000.00" -- rupees with Indian digit grouping, always two
 * decimals (product decision 2026-10-01: every price shows paise). Same rule
 * as the mobile app's src/utils/format.ts.
 */
export function formatINR(rupees: number | string | null | undefined): string {
  const n = Number(rupees ?? 0);
  const value = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Same as formatINR but "Rs." -- for PDFs, whose built-in fonts lack "₹". */
export function formatINRPlain(rupees: number | string | null | undefined): string {
  return formatINR(rupees).replace("₹", "Rs. ");
}

/** "14:00:00" / "14:00" -> "2:00 PM". Returns null for anything unparseable. */
export function formatTime12h(value: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2];
  if (h > 23 || Number(min) > 59) return null;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${suffix}`;
}

/** yyyy-mm-dd parsed as a calendar day (no timezone shift). */
export function parseISODay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** "Fri, 25 Dec 2026" */
export function formatStayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return parseISODay(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "March 2026" for a review/post timestamp; "" when unparseable. */
export function reviewMonth(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** "1 night" / "3 nights", "1 adult" / "2 adults" */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Shown wherever a refund is promised: the bank, not us, sets the final timing. */
export const REFUND_ARRIVAL_NOTE =
  "Refunds take 5-7 banking days to reach your account, depending on your bank.";
