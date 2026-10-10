import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Tables = {
  host: { host_uuid: string } | null;
  pan: { id: number } | null;
  bank: { status: string } | null;
  payout: Record<string, unknown> | null;
  /** users.phone for the signed-in user. */
  userPhone: string | null;
  /** auth.users.phone, the fallback when users.phone is empty. */
  authPhone: string | null;
};
let tables: Tables;

// Minimal chainable stand-in for the supabase query builder: every filter is a
// no-op returning the builder, and maybeSingle() resolves the table's fixture.
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from(table: string) {
      let service: string | null = null;
      const builder: any = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: (col: string, value: string) => {
          if (col === "service_type") service = value;
          return builder;
        },
        maybeSingle: async () => {
          if (table === "host") return { data: tables.host, error: null };
          if (table === "host_payout_methods") return { data: tables.payout, error: null };
          if (table === "users") return { data: { phone: tables.userPhone }, error: null };
          return { data: service === "pan" ? tables.pan : tables.bank, error: null };
        },
      };
      return builder;
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { phone: tables.authPhone } }, error: null }),
      },
    },
  },
}));

import { getHostPayoutReadiness, PayoutNotReadyError } from "../hostPayoutReadiness";

const fullPayout = {
  razorpay_account_id: "acc_1",
  razorpay_stakeholder_id: "sth_1",
  razorpay_product_id: "prd_1",
  status: "onboarding",
};

beforeEach(() => {
  tables = {
    host: { host_uuid: "h1" },
    pan: { id: 1 },
    bank: { status: "success" },
    payout: fullPayout,
    userPhone: "+919999999999",
    authPhone: null,
  };
});

describe("getHostPayoutReadiness", () => {
  it("is ready only with a verified PAN, verified bank and a created payout account", async () => {
    const r = await getHostPayoutReadiness("u1");
    expect(r).toMatchObject({ ready: true, blockers: [] });
  });

  it("blocks on a missing phone number before anything else", async () => {
    tables.userPhone = null;
    tables.authPhone = null;
    tables.pan = null;
    tables.bank = { status: "failed" };
    tables.payout = null;
    const r = await getHostPayoutReadiness("u1");
    expect(r.phoneAdded).toBe(false);
    expect(r.blockers).toEqual(["phone", "kyc", "bank", "payout"]);
  });

  it("only a missing phone blocks an otherwise complete host", async () => {
    tables.userPhone = null;
    tables.authPhone = null;
    const r = await getHostPayoutReadiness("u1");
    expect(r).toMatchObject({ ready: false, blockers: ["phone"] });
  });

  it("accepts a phone that is only on the auth user", async () => {
    tables.userPhone = null;
    tables.authPhone = "+919888888888";
    const r = await getHostPayoutReadiness("u1");
    expect(r).toMatchObject({ ready: true, phoneAdded: true, blockers: [] });
  });

  it("blocks on KYC first, in the order the host has to do things", async () => {
    tables.pan = null;
    tables.bank = { status: "failed" };
    tables.payout = null;
    const r = await getHostPayoutReadiness("u1");
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual(["kyc", "bank", "payout"]);
  });

  it("does not count a payout account created without verified bank details", async () => {
    tables.bank = { status: "failed" };
    const r = await getHostPayoutReadiness("u1");
    expect(r.blockers).toEqual(["bank"]);
  });

  it("does not count a half-created or rejected payout account", async () => {
    tables.payout = { ...fullPayout, razorpay_product_id: null };
    expect((await getHostPayoutReadiness("u1")).blockers).toEqual(["payout"]);
    tables.payout = { ...fullPayout, status: "rejected" };
    expect((await getHostPayoutReadiness("u1")).blockers).toEqual(["payout"]);
  });

  it("treats a user who is not a host yet as not ready", async () => {
    tables.host = null;
    tables.payout = null;
    expect((await getHostPayoutReadiness("u1")).blockers).toEqual(["payout"]);
  });
});

describe("PayoutNotReadyError", () => {
  it("names what is missing", () => {
    expect(new PayoutNotReadyError(["kyc", "bank"]).message).toContain("verify your identity (pan)");
  });
});
