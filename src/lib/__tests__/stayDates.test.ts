import { describe, expect, it } from "vitest";
import { applyDayClick, blockedStayDates, isISODate, isDatabaseAvailabilityError } from "../stayDates";

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

describe("date picker clicks start a fresh range", () => {
  const d = (iso: string) => new Date(iso + "T00:00:00");
  const none = new Set<string>();
  const existing = { checkIn: d("2026-11-10"), checkOut: d("2026-11-12") };

  it("with dates already chosen, the first click is the NEW check-in and the old checkout is cleared", () => {
    const r = applyDayClick({ step: "checkin", ...existing }, d("2026-11-20"), none);
    expect(r).toMatchObject({ step: "checkout", done: false, checkOut: null });
    expect(r.checkIn).toEqual(d("2026-11-20"));
  });

  it("the second click completes the range as the check-out", () => {
    const r = applyDayClick({ step: "checkout", checkIn: d("2026-11-20"), checkOut: null }, d("2026-11-23"), none);
    expect(r).toMatchObject({ step: "checkin", done: true });
    expect(r.checkIn).toEqual(d("2026-11-20"));
    expect(r.checkOut).toEqual(d("2026-11-23"));
  });

  it("a second click on or before the check-in restarts from that day", () => {
    const before = applyDayClick({ step: "checkout", checkIn: d("2026-11-20"), checkOut: null }, d("2026-11-18"), none);
    expect(before).toMatchObject({ step: "checkout", done: false, checkOut: null });
    expect(before.checkIn).toEqual(d("2026-11-18"));
    const same = applyDayClick({ step: "checkout", checkIn: d("2026-11-20"), checkOut: null }, d("2026-11-20"), none);
    expect(same).toMatchObject({ step: "checkout", done: false });
  });

  it("refuses a range that crosses a blocked night and leaves the selection alone", () => {
    const blocked = new Set(["2026-11-21"]);
    const r = applyDayClick({ step: "checkout", checkIn: d("2026-11-20"), checkOut: null }, d("2026-11-23"), blocked);
    expect(r.error).toMatch(/blocked/i);
    expect(r.done).toBe(false);
    expect(r.checkIn).toEqual(d("2026-11-20"));
    expect(r.step).toBe("checkout");
  });

  it("a checkout that lands on a blocked day is fine (checkout is not a stay night)", () => {
    const blocked = new Set(["2026-11-23"]);
    const r = applyDayClick({ step: "checkout", checkIn: d("2026-11-20"), checkOut: null }, d("2026-11-23"), blocked);
    expect(r).toMatchObject({ done: true });
  });
});
