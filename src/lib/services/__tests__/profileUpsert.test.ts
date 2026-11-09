import { describe, expect, it } from "vitest";
import { buildProfileUpsert } from "../profileUpsert";

const googleLogin = {
  user_id: "u1",
  name: "Asha",
  email: "a@x.com",
  phone: null,
  profile_pic_url: "https://g/p.png",
  is_verified: false,
  is_active: true,
};

describe("buildProfileUpsert", () => {
  it("does not blank a saved phone on a later Google/email sign-in", () => {
    const out = buildProfileUpsert(googleLogin, { name: "Asha", email: "a@x.com", phone: "+919876543210" });
    expect(out).not.toHaveProperty("phone");
  });

  it("does not blank age / emergency contact on email-OTP sign-in", () => {
    const out = buildProfileUpsert(
      { ...googleLogin, age: null, emergency_contact: null },
      { phone: "+919876543210", age: 30, emergency_contact: "Mom 9876543210" },
    );
    expect(out).not.toHaveProperty("age");
    expect(out).not.toHaveProperty("emergency_contact");
  });

  it("still lets onboarding set a new phone on an existing row", () => {
    const out = buildProfileUpsert({ ...googleLogin, phone: "+919999999999" }, { phone: null });
    expect(out.phone).toBe("+919999999999");
  });

  it("writes null phone for a brand-new profile", () => {
    const out = buildProfileUpsert(googleLogin, null);
    expect(out.phone).toBeNull();
    expect(out.is_active).toBe(true);
    expect(out.is_verified).toBe(false);
  });

  it("never downgrades verification or reactivates on login", () => {
    const out = buildProfileUpsert(googleLogin, { is_verified: true, is_active: false });
    expect(out).not.toHaveProperty("is_verified");
    expect(out).not.toHaveProperty("is_active");
  });

  it("keeps a stored email when the caller sends blank", () => {
    const out = buildProfileUpsert({ ...googleLogin, email: "" }, { email: "a@x.com" });
    expect(out.email).toBe("a@x.com");
  });
});
