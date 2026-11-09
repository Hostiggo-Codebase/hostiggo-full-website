import { describe, expect, it, vi } from "vitest";
import { buildProfilePatch, profileFormFromUser, saveProfilePatch, validateProfileForm } from "../profileForm";

const user = {
  name: "Asha Rao",
  email: "asha@example.com",
  phone: "+919876543210",
  age: 30,
  emergency_contact: "Mom 9123456789",
};

describe("profileFormFromUser", () => {
  it("normalises legacy bare phones to +91", () => {
    expect(profileFormFromUser({ ...user, phone: "919876543210" }).phone).toBe("+919876543210");
    expect(profileFormFromUser(null)).toEqual({ name: "", email: "", phone: "", age: "", emergencyContact: "" });
  });
});

describe("buildProfilePatch", () => {
  it("returns nothing when unchanged (including a legacy bare phone)", () => {
    const legacy = { ...user, phone: "9876543210" };
    expect(buildProfilePatch(profileFormFromUser(legacy), legacy)).toEqual({});
  });

  it("sends only changed fields in the server's shape", () => {
    const form = { ...profileFormFromUser(user), name: " Asha  R ", age: "", phone: "98765 00000" };
    expect(buildProfilePatch(form, user)).toEqual({ name: "Asha  R", age: null, phone: "98765 00000" });
  });

  it("treats a reformatted but identical phone as unchanged", () => {
    const form = { ...profileFormFromUser(user), phone: "+91 98765 43210" };
    expect(buildProfilePatch(form, user)).toEqual({});
  });

  it("clears emergency contact to null", () => {
    const form = { ...profileFormFromUser(user), emergencyContact: "  " };
    expect(buildProfilePatch(form, user)).toEqual({ emergency_contact: null });
  });
});

describe("validateProfileForm", () => {
  it("accepts a valid form", () => {
    expect(validateProfileForm(profileFormFromUser(user))).toEqual({});
  });

  it("flags bad values", () => {
    const errs = validateProfileForm({ name: "A", email: "x@", phone: "12345", age: "12", emergencyContact: "mom" });
    expect(Object.keys(errs).sort()).toEqual(["age", "email", "emergencyContact", "name", "phone"]);
  });
});

describe("saveProfilePatch", () => {
  it("patches then reloads the user", async () => {
    const calls: string[] = [];
    const update = vi.fn(async () => { calls.push("update"); });
    const reload = vi.fn(async () => { calls.push("reload"); });
    await saveProfilePatch({ update, reload }, "u1", { name: "Asha" });
    expect(update).toHaveBeenCalledWith("u1", { name: "Asha" });
    expect(calls).toEqual(["update", "reload"]);
  });

  it("propagates server errors and does not reload", async () => {
    const update = vi.fn(async () => { throw new Error("Enter a valid email address."); });
    const reload = vi.fn(async () => {});
    await expect(saveProfilePatch({ update, reload }, "u1", { email: "x" })).rejects.toThrow("valid email");
    expect(reload).not.toHaveBeenCalled();
  });

  it("refuses without a user id", async () => {
    const update = vi.fn();
    await expect(saveProfilePatch({ update, reload: vi.fn() }, null, { name: "A" })).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});
