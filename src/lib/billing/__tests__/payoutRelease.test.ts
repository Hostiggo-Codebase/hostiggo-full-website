import { describe, expect, it } from "vitest";
import { payoutReleaseMoment } from "../policyTimeline";

describe("payoutReleaseMoment", () => {
  const now = new Date("2026-10-01T00:00:00+05:30");

  it("releases the host share 24h after the listing's check-in time", () => {
    const release = payoutReleaseMoment("2026-10-10", "14:00:00", now);
    expect(release?.toISOString()).toBe(new Date("2026-10-11T14:00:00+05:30").toISOString());
  });

  it("falls back to a 14:00 check-in when the listing has none", () => {
    const release = payoutReleaseMoment("2026-10-10", null, now);
    expect(release?.toISOString()).toBe(new Date("2026-10-11T14:00:00+05:30").toISOString());
  });

  it("holds nothing when the release moment has already passed", () => {
    expect(payoutReleaseMoment("2026-09-20", "14:00", now)).toBeNull();
  });
});
