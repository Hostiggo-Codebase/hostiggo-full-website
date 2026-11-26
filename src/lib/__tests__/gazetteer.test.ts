import { describe, expect, it } from "vitest";
import { PLACES, closestName, editDistance, haversineKm, lookupPlace, normalizePlace } from "../gazetteer";
import { NEARBY_RADII_KM, centroid, pickNearby } from "../nearby";

describe("place lookup forgives spelling and old names", () => {
  it("finds the spellings people actually type", () => {
    expect(lookupPlace("Odisha")?.name).toBe("Odisha");
    expect(lookupPlace("odhisha")?.name).toBe("Odisha"); // the one from the bug report
    expect(lookupPlace("Orissa")?.name).toBe("Odisha");
    expect(lookupPlace("lucknow")?.name).toBe("Lucknow");
    expect(lookupPlace("Lucknaw")?.name).toBe("Lucknow");
    expect(lookupPlace("bombay")?.name).toBe("Mumbai");
    expect(lookupPlace("Banglore")?.name).toBe("Bengaluru");
    expect(lookupPlace("MOUNT-ABU")?.name).toBe("Mount Abu");
  });

  it("does not guess at unrelated or too-short words", () => {
    expect(lookupPlace("xyzzy")).toBeNull();
    expect(lookupPlace("up")).toBeNull();
    expect(lookupPlace("")).toBeNull();
    expect(lookupPlace(null)).toBeNull();
    expect(lookupPlace("homestay")).toBeNull();
  });

  it("forgives typos in places we do have stays in", () => {
    const ours = ["Bhopal", "Gurugram", "Shimla", "Candolim"];
    expect(closestName("Bhopl", ours)).toBe("Bhopal");
    expect(closestName("gurugam", ours)).toBe("Gurugram");
    expect(closestName("goa", ours)).toBeNull();
    expect(closestName("mumbai", ours)).toBeNull();
  });

  it("normalises and measures", () => {
    expect(normalizePlace(" Mount-Abu ")).toBe("mountabu");
    expect(editDistance("odhisha", "odisha")).toBe(1);
    expect(editDistance("abc", "xyzabc", 2)).toBeGreaterThan(2);
  });
});

describe("place coordinates are sane (catches a mistyped digit)", () => {
  it("every place is inside India's bounding box", () => {
    for (const p of PLACES) {
      expect(p.lat, p.name).toBeGreaterThan(6);
      expect(p.lat, p.name).toBeLessThan(37);
      expect(p.lon, p.name).toBeGreaterThan(68);
      expect(p.lon, p.name).toBeLessThan(98);
    }
  });

  it("known distances come out right", () => {
    const at = (n: string) => PLACES.find((p) => p.name === n)!;
    const km = (a: string, b: string) => haversineKm(at(a).lat, at(a).lon, at(b).lat, at(b).lon);
    expect(km("Delhi", "Gurugram")).toBeGreaterThan(20);
    expect(km("Delhi", "Gurugram")).toBeLessThan(35);
    expect(km("Lucknow", "Ayodhya")).toBeGreaterThan(115);
    expect(km("Lucknow", "Ayodhya")).toBeLessThan(140);
    expect(km("Mumbai", "Pune")).toBeGreaterThan(110);
    expect(km("Mumbai", "Pune")).toBeLessThan(160);
    expect(km("Panaji", "Candolim")).toBeLessThan(15);
  });

  it("has no duplicate names", () => {
    const names = PLACES.map((p) => normalizePlace(p.name));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("nearby radius ladder", () => {
  const ref = { lat: 26.8467, lon: 80.9462 }; // Lucknow
  const stay = (id: string, lat: number, lon: number) => ({ id, lat, lon });
  const coords = (s: { lat: number; lon: number }) => s;

  it("uses the smallest radius that supplies enough stays", () => {
    const stays = [stay("near", 26.9, 81.0), stay("mid", 27.6, 81.3), stay("far", 26.79, 82.2)];
    expect(pickNearby(stays, coords, ref, 1).radiusKm).toBe(15);
    expect(pickNearby(stays, coords, ref, 2).radiusKm).toBe(120); // the second stay is ~90 km out, so 60 km is too small and 120 km is the next rung
  });

  it("returns nearest first and never goes past the cap", () => {
    const stays = [stay("ayodhya", 26.79, 82.2), stay("delhi", 28.6, 77.2), stay("near", 26.9, 81.0)];
    const pick = pickNearby(stays, coords, ref, 5);
    expect(pick.items.map((i) => i.item.id)).toEqual(["near", "ayodhya"]);
    expect(pick.radiusKm).toBe(NEARBY_RADII_KM[NEARBY_RADII_KM.length - 1]);
  });

  it("finds nothing when everything is beyond the cap", () => {
    const pick = pickNearby([stay("delhi", 28.6, 77.2)], coords, ref, 3);
    expect(pick).toEqual({ radiusKm: null, items: [] });
  });

  it("skips stays without coordinates and averages a centre", () => {
    const pick = pickNearby([{ id: "x", lat: NaN, lon: 1 }, stay("ok", 26.9, 81.0)], coords, ref, 1);
    expect(pick.items.map((i) => i.item.id)).toEqual(["ok"]);
    expect(centroid([{ lat: 10, lon: 20 }, { lat: 20, lon: 40 }])).toEqual({ lat: 15, lon: 30 });
    expect(centroid([])).toBeNull();
  });
});
