import { describe, expect, it } from "vitest";
import { discountedStaySubtotal, pickStayDiscount, type StayDiscountRow } from "../stayDiscounts";

const row = (discount_type: string, percent: number, extra: Partial<StayDiscountRow> = {}): StayDiscountRow => ({
  discount_type, percent, enabled: true, ...extra,
});
const ctx = (nights: number, prior = 10, checkIn = "2027-03-01") => ({ nights, checkIn, priorConfirmedBookings: prior });

describe("pickStayDiscount", () => {
  it("weekly needs 7+ nights, monthly 28+", () => {
    const rows = [row("weekly", 10), row("monthly", 20)];
    expect(pickStayDiscount(rows, ctx(6))).toBeNull();
    expect(pickStayDiscount(rows, ctx(7))).toEqual({ type: "weekly", percent: 10 });
    expect(pickStayDiscount(rows, ctx(28))).toEqual({ type: "monthly", percent: 20 });
  });

  it("applies only the single best discount", () => {
    expect(pickStayDiscount([row("weekly", 10), row("new_listing", 15)], ctx(7, 0))).toEqual({ type: "new_listing", percent: 15 });
  });

  it("new listing discount covers only the first 3 bookings", () => {
    const rows = [row("new_listing", 12)];
    expect(pickStayDiscount(rows, ctx(1, 2))).not.toBeNull();
    expect(pickStayDiscount(rows, ctx(1, 3))).toBeNull();
  });

  it("ignores disabled, invalid, unknown and out-of-window discounts", () => {
    expect(pickStayDiscount([row("weekly", 10, { enabled: false })], ctx(7))).toBeNull();
    expect(pickStayDiscount([row("weekly", 0)], ctx(7))).toBeNull();
    expect(pickStayDiscount([row("weekly", 101)], ctx(7))).toBeNull();
    expect(pickStayDiscount([row("festival", 10)], ctx(7))).toBeNull();
    expect(pickStayDiscount([row("weekly", 10, { valid_to: "2027-02-01T00:00:00Z" })], ctx(7))).toBeNull();
    expect(pickStayDiscount([row("weekly", 10, { valid_from: "2027-04-01T00:00:00Z" })], ctx(7))).toBeNull();
  });

  it("min_stay_nights on the row overrides the default", () => {
    expect(pickStayDiscount([row("weekly", 10, { min_stay_nights: 3 })], ctx(3))).not.toBeNull();
  });
});

describe("discountedStaySubtotal", () => {
  it("returns the plain sum with no discount", () => {
    expect(discountedStaySubtotal([1000, 2000, 2000], null)).toBe(5000);
  });
  it("takes the percent off every night, rounded to paise per night", () => {
    expect(discountedStaySubtotal([1000, 2000], { type: "weekly", percent: 10 })).toBe(2700);
    expect(discountedStaySubtotal([999], { type: "weekly", percent: 33 })).toBe(669.33);
  });
});
