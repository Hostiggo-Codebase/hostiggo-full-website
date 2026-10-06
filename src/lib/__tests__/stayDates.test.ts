import { describe, expect, it } from "vitest";
import { blockedStayDates, isISODate, isDatabaseAvailabilityError } from "../stayDates";

describe("blocked stay nights", () => {
  const date = (day: number) => new Date(2026, 9, day);
  it("rejects a range that crosses a blocked night", () => {
    expect(blockedStayDates(date(6), date(10), new Set(["2026-10-07", "2026-10-08"]))).toEqual(["2026-10-07", "2026-10-08"]);
  });
  it("allows checkout on a blocked date but not check-in", () => {
    const blocks = new Set(["2026-10-07"]);
    expect(blockedStayDates(date(6), date(7), blocks)).toEqual([]);
    expect(blockedStayDates(date(7), date(8), blocks)).toEqual(["2026-10-07"]);
  });
  it("handles month and year boundaries", () => {
    expect(blockedStayDates(new Date(2026, 11, 31), new Date(2027, 0, 2), new Set(["2027-01-01"]))).toEqual(["2027-01-01"]);
  });
  it("rejects impossible dates", () => {
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("null")).toBe(false);
  });
  it("only refunds recognized database availability rejections", () => {
    expect(isDatabaseAvailabilityError({ code: "P0001", message: "HOSTIGGO_DATES_UNAVAILABLE" })).toBe(true);
    expect(isDatabaseAvailabilityError({ code: "P0001", message: "unrelated failure" })).toBe(false);
  });
});
