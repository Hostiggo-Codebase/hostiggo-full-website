import { percentOf, roundPaise, rupeesToPaise } from "./money";
import type { HostPayoutInput, HostPayoutResult } from "./types";

export const PAYOUT_RATES = {
  hostiggoCommission: 0.05,
  tcs: 0.01,
  tds: 0.01,
} as const;

/**
 * Host payout base is Property + Breakfast + Other Services -- excluding the
 * Hostiggo Service Fee and all GST (GST is never host revenue). Pure
 * function -- no I/O.
 *
 * Commission, TCS and TDS apply to the stay (property) amount ONLY. Add-ons
 * (breakfast / other services) are passed through to the host in full with
 * no deductions (owner's rule).
 *
 * NOTE: implemented exactly as specified (payoutBase - 5% commission - 1%
 * TCS - 1% TDS). The source doc's worked example states ₹10,788 for a
 * ₹10,000 property with no add-ons, but this formula produces ₹9,300 --
 * no version of "subtract percentages of payoutBase" can exceed
 * payoutBase, so ₹10,788 is not reachable and is treated as an error in
 * the source doc's example, not in this formula. Confirmed final.
 */
export function calculateHostPayout(input: HostPayoutInput): HostPayoutResult {
  const propertyPricePaise = rupeesToPaise(input.propertyPrice);
  const breakfastPricePaise = rupeesToPaise(input.breakfastPrice ?? 0);
  const otherServicesPricePaise = rupeesToPaise(input.otherServicesPrice ?? 0);

  const payoutBasePaise = propertyPricePaise + breakfastPricePaise + otherServicesPricePaise;

  const commissionRate = input.commissionRate ?? PAYOUT_RATES.hostiggoCommission;
  // Deductions are on the stay amount only -- add-ons carry no commission/TCS/TDS.
  const commissionPaise = percentOf(propertyPricePaise, commissionRate);
  const tcsPaise = percentOf(propertyPricePaise, PAYOUT_RATES.tcs);
  const tdsPaise = percentOf(propertyPricePaise, PAYOUT_RATES.tds);

  const netHostPayoutPaise = roundPaise(payoutBasePaise - commissionPaise - tcsPaise - tdsPaise);

  return {
    payoutBasePaise,
    commissionPaise,
    commissionRate,
    tcsPaise,
    tcsRate: PAYOUT_RATES.tcs,
    tdsPaise,
    tdsRate: PAYOUT_RATES.tds,
    netHostPayoutPaise,
    netHostPayoutRupees: netHostPayoutPaise / 100,
  };
}
