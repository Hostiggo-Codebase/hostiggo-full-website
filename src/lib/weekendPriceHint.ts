/** Above this gap the % stops being useful and usually means a typo. */
export const EXTREME_WEEKEND_GAP_PERCENT = 300;

export type WeekendPriceHint =
  | { kind: "none" }
  | { kind: "higher" | "lower"; percent: number }
  | { kind: "extreme"; message: string };

/**
 * Helper text under the weekend price in the listing wizard. Shows "X%
 * higher/lower than weekday price" only in a plausible range; extreme gaps
 * (e.g. weekday ₹100, weekend ₹3,300 -> "3199% higher") get a warning instead.
 */
export function weekendPriceHint(weekday: number, weekend: number): WeekendPriceHint {
  if (!(weekday > 0) || !(weekend > 0)) return { kind: "none" };
  const percent = Math.round(((weekend - weekday) / weekday) * 100);
  if (percent === 0) return { kind: "none" };
  if (percent > EXTREME_WEEKEND_GAP_PERCENT) {
    return {
      kind: "extreme",
      message: "Your weekend price is far above your weekday price - please check.",
    };
  }
  return percent > 0 ? { kind: "higher", percent } : { kind: "lower", percent: -percent };
}
