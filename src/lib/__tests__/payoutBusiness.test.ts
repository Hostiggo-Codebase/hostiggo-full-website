import { describe, expect, it } from "vitest";
import { isBusinessType, isCompanyType, needsStakeholder, panProblemForBusiness } from "../payoutBusiness";

describe("business types", () => {
  it("recognises Razorpay business types only", () => {
    expect(isBusinessType("llp")).toBe(true);
    expect(isBusinessType("private_limited")).toBe(true);
    expect(isBusinessType("company")).toBe(false);
    expect(isBusinessType(undefined)).toBe(false);
  });

  it("treats everything but individual as a company, and only people need a stakeholder", () => {
    expect(isCompanyType("individual")).toBe(false);
    expect(isCompanyType("llp")).toBe(true);
    expect(needsStakeholder("individual")).toBe(true);
    expect(needsStakeholder(null)).toBe(true);
    expect(needsStakeholder("proprietorship")).toBe(true);
    expect(needsStakeholder("llp")).toBe(false);
    expect(needsStakeholder("private_limited")).toBe(false);
  });
});

describe("panProblemForBusiness", () => {
  it("accepts a PAN whose 4th character fits the business type", () => {
    expect(panProblemForBusiness("ABCPD1234E", "individual")).toBeNull();
    expect(panProblemForBusiness("AAAFD1234E", "llp")).toBeNull();
    expect(panProblemForBusiness("aaafd1234e", "partnership")).toBeNull();
    expect(panProblemForBusiness("AAACD1234E", "private_limited")).toBeNull();
  });

  it("rejects a personal PAN for a business, and a business PAN for a person", () => {
    expect(panProblemForBusiness("ABCPD1234E", "llp")).toMatch(/business's own PAN/);
    expect(panProblemForBusiness("AAAFD1234E", "individual")).toMatch(/personal PAN/);
    expect(panProblemForBusiness("AAACD1234E", "llp")).not.toBeNull();
  });
});
