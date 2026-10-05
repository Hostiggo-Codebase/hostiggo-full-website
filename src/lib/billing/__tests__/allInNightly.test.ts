import { describe, expect, it } from "vitest";
import { allInNightlyPrice, calculateBookingInvoice } from "../invoice";

describe("allInNightlyPrice", () => {
  it("matches the checkout invoice grand total for one night (5% slab)", () => {
    // 2999 + 5% GST (149.95) + 8% fee (239.92) + 18% GST on fee (43.19) = 3432.06
    expect(allInNightlyPrice(2999)).toBe(3432.06);
    expect(allInNightlyPrice(2999)).toBe(
      calculateBookingInvoice({ basePropertyPrice: 2999 }).grandTotalPaise / 100,
    );
  });

  it("uses the 18% property GST slab above ₹7,500/night", () => {
    // 8000 + 1440 + 640 + 115.2 = 10195.2
    expect(allInNightlyPrice(8000)).toBe(10195.2);
  });

  it("returns 0 for missing prices", () => {
    expect(allInNightlyPrice(0)).toBe(0);
    expect(allInNightlyPrice(Number.NaN)).toBe(0);
  });
});
