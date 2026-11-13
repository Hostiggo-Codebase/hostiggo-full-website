import { describe, expect, it } from "vitest";
import { ageFromDateOfBirth, getProfileCompletion } from "../profileCompletion";

const full = {
  name: "Rijusmit Biswas",
  email: "a@b.com",
  emailVerified: true,
  phone: "+919876543210",
  phoneVerified: true,
  dateOfBirth: "2000-01-01",
  gender: "Male",
  photoUrl: "https://x/p.png",
};

describe("getProfileCompletion (mirrors the app)", () => {
  it("is 100% with all six items, regardless of emergency contact or ID verification", () => {
    expect(getProfileCompletion(full)).toEqual({ percentage: 100, missing: [] });
  });

  it("lists exactly what is left", () => {
    const r = getProfileCompletion({ ...full, gender: "", photoUrl: null, phoneVerified: false });
    expect(r.percentage).toBe(50);
    expect(r.missing.map((m) => m.key)).toEqual(["phone", "gender", "photo"]);
    expect(r.missing[0].todo).toMatch(/in the Hostiggo app/);
  });

  it("requires verified email and phone, not just filled in", () => {
    expect(getProfileCompletion({ ...full, emailVerified: false }).percentage).toBe(83);
  });
});

describe("ageFromDateOfBirth", () => {
  it("computes whole years", () => {
    expect(ageFromDateOfBirth("2000-06-15", new Date(2026, 5, 14))).toBe(25);
    expect(ageFromDateOfBirth("2000-06-15", new Date(2026, 5, 15))).toBe(26);
  });
  it("rejects invalid and future dates", () => {
    expect(ageFromDateOfBirth("nope")).toBeNull();
    expect(ageFromDateOfBirth("2999-01-01")).toBeNull();
  });
});
