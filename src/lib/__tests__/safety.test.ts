import { describe, expect, it } from "vitest";
import { safeRedirect } from "../utils";
import { detectContactSharing } from "../chatModeration";
import { formatINR, formatTime12h, plural } from "../format";
import { todayInIndia } from "../booking-config";

describe("safeRedirect -- only same-origin relative paths", () => {
  it.each(["/", "/wishlist", "/property/12?checkIn=2026-10-01", "/search?destination=Goa#map"])(
    "keeps %s",
    (path) => expect(safeRedirect(path)).toBe(path),
  );

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
  ])("rejects %j", (target) => expect(safeRedirect(target, "/fallback")).toBe("/fallback"));

  it("uses the fallback for empty values", () => {
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect("", "")).toBe("");
  });
});

describe("detectContactSharing -- keeps bookings on-platform", () => {
  it.each([
    ["call me on 9876543210", "phone_number"],
    ["+91 98765 43210", "phone_number"],
    ["98765-43210", "phone_number"],
    ["nine eight seven six five four three two one zero", "phone_number"],
    ["mail me at host.name@gmail.com", "email"],
    ["pay to rahul@okicici", "upi"],
    ["ping me on wa.me/919876543210", "external_link"],
  ])("blocks %j (%s)", (text, reason) => {
    const r = detectContactSharing(text);
    expect(r.blocked).toBe(true);
    expect(r.reasons).toContain(reason);
  });

  it.each([
    "Is the place available from 12 Oct to 15 Oct for 4 adults?",
    "The total came to 15000 for 3 nights, is breakfast included?",
    "We will arrive around 9 pm, is that okay?",
    "Booking #10429 -- can we check in early?",
  ])("allows normal messages: %j", (text) => {
    expect(detectContactSharing(text).blocked).toBe(false);
  });
});

describe("formatters", () => {
  it("always shows two decimals", () => {
    expect(formatINR(57.6)).toBe("₹57.60");
    expect(formatINR(4577.6)).toBe("₹4,577.60");
    expect(formatINR(4000)).toBe("₹4,000.00");
    expect(formatINR(125000)).toBe("₹1,25,000.00");
    expect(formatINR(-12.5)).toBe("-₹12.50");
  });
  it("formats check-in times", () => {
    expect(formatTime12h("14:00:00")).toBe("2:00 PM");
    expect(formatTime12h("00:30")).toBe("12:30 AM");
    expect(formatTime12h("banana")).toBeNull();
    expect(formatTime12h("25:99")).toBeNull();
  });
  it("pluralises", () => {
    expect(plural(1, "Adult")).toBe("1 Adult");
    expect(plural(2, "Child", "Children")).toBe("2 Children");
  });
});

describe("todayInIndia -- IST calendar day (audit OBS-04)", () => {
  it("is already tomorrow in India at 20:00 UTC", () => {
    expect(todayInIndia(new Date("2026-10-01T20:00:00Z"))).toBe("2026-10-02");
  });
  it("is still today in India at 18:00 UTC", () => {
    expect(todayInIndia(new Date("2026-10-01T18:00:00Z"))).toBe("2026-10-01");
  });
});
