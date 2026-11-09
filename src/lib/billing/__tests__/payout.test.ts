import { describe, expect, it } from "vitest";
import { calculateHostPayout } from "../payout";

describe("calculateHostPayout", () => {
  it("implements the spec's formula exactly: payoutBase - 5% commission - 1% TCS - 1% TDS", () => {
    const result = calculateHostPayout({ propertyPrice: 10000 });
    expect(result.payoutBasePaise).toBe(1_000_000); // ₹10,000
    expect(result.commissionPaise).toBe(50_000); // ₹500 (5%)
    expect(result.tcsPaise).toBe(10_000); // ₹100 (1%)
    expect(result.tdsPaise).toBe(10_000); // ₹100 (1%)
    // 10000 - 500 - 100 - 100 = 9300
    expect(result.netHostPayoutRupees).toBe(9300);
  });

  it("includes breakfast and other-services prices in the payout base", () => {
    const result = calculateHostPayout({
      propertyPrice: 10000,
      breakfastPrice: 500,
      otherServicesPrice: 1000,
    });
    expect(result.payoutBasePaise).toBe(1_150_000); // ₹11,500
  });

  it("applies commission, TCS and TDS to the stay amount only, not add-ons", () => {
    const result = calculateHostPayout({
      propertyPrice: 10000,
      breakfastPrice: 500,
      otherServicesPrice: 1000,
    });
    expect(result.commissionPaise).toBe(50_000); // 5% of ₹10,000 only
    expect(result.tcsPaise).toBe(10_000);
    expect(result.tdsPaise).toBe(10_000);
    // 11500 - 500 - 100 - 100 = 10800 (add-ons paid out in full)
    expect(result.netHostPayoutRupees).toBe(10800);
  });
});
