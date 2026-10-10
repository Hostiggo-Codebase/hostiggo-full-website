import { describe, expect, it } from "vitest";
import { toE164Phone } from "../phoneFormat";

describe("toE164Phone", () => {
  it("adds the missing plus to a Supabase phone-login number", () => {
    expect(toE164Phone("919711159245")).toBe("+919711159245");
  });
  it("keeps an already-correct number", () => {
    expect(toE164Phone("+919711159245")).toBe("+919711159245");
  });
  it("cleans spaces and punctuation", () => {
    expect(toE164Phone("+91 97111 59245")).toBe("+919711159245");
    expect(toE164Phone("+91-97111-59245")).toBe("+919711159245");
  });
  it("treats a bare 10-digit number as Indian", () => {
    expect(toE164Phone("9711159245")).toBe("+919711159245");
    expect(toE164Phone("09711159245")).toBe("+919711159245");
  });
  it("keeps other countries' numbers that already have a plus", () => {
    expect(toE164Phone("+14155552671")).toBe("+14155552671");
  });
  it("returns null for blank and leaves unrecognisable input untouched", () => {
    expect(toE164Phone("")).toBeNull();
    expect(toE164Phone(null)).toBeNull();
    expect(toE164Phone(undefined)).toBeNull();
    expect(toE164Phone("12345")).toBe("12345");
  });
});
