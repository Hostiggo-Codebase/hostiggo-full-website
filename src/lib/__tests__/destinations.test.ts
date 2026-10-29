import { describe, expect, it } from "vitest";
import { DESTINATIONS, DESTINATIONS_BY_SLUG } from "../destinations";

describe("destinations config", () => {
  it("has unique, url-safe slugs", () => {
    const slugs = DESTINATIONS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it("every destination names a district, state and summary", () => {
    for (const d of DESTINATIONS) {
      expect(d.districts.length).toBeGreaterThan(0);
      expect(d.state).toBeTruthy();
      expect(d.summary.length).toBeGreaterThan(40);
      expect(d.knownFor.length).toBeGreaterThan(0);
    }
  });

  it("never makes an unverifiable 'verified' claim in copy", () => {
    for (const d of DESTINATIONS) {
      expect(`${d.summary} ${d.knownFor.join(" ")} ${d.areaNote ?? ""}`).not.toMatch(/verified/i);
    }
  });

  it("looks up by slug", () => {
    expect(DESTINATIONS_BY_SLUG["shimla"]?.state).toBe("Himachal Pradesh");
  });
});
