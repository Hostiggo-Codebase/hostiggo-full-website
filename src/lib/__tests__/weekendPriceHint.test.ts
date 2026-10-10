import { describe, expect, it } from "vitest";
import { weekendPriceHint } from "../weekendPriceHint";

describe("weekendPriceHint", () => {
  it("shows the percentage in a plausible range", () => {
    expect(weekendPriceHint(1000, 1200)).toEqual({ kind: "higher", percent: 20 });
    expect(weekendPriceHint(1000, 4000)).toEqual({ kind: "higher", percent: 300 });
  });
  it("handles a weekend price lower than weekday", () => {
    expect(weekendPriceHint(1000, 800)).toEqual({ kind: "lower", percent: 20 });
  });
  it("warns instead of showing an extreme percentage", () => {
    expect(weekendPriceHint(100, 3299).kind).toBe("extreme");
  });
  it("shows nothing for equal or missing prices", () => {
    expect(weekendPriceHint(1000, 1000).kind).toBe("none");
    expect(weekendPriceHint(0, 1000).kind).toBe("none");
    expect(weekendPriceHint(1000, 0).kind).toBe("none");
  });
});
