import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./fakeSupabase";

const h = vi.hoisted(() => ({
  db: null as any,
  orders: new Map<string, any>(),
  refunds: [] as any[],
  refundFail: false,
  notified: [] as any[],
  whatsapp: [] as any[],
  emails: [] as any[],
  alerts: [] as any[],
  transfers: [] as any[],
  seq: 0,
}));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (t: string) => h.db.client.from(t),
    schema: () => ({ from: (t: string) => h.db.client.from(t) }),
  },
}));
vi.mock("@/lib/billing/razorpay", () => ({
  createRazorpayOrder: async ({ amountPaise, notes }: any) => {
    const id = `order_${++h.seq}`;
    h.orders.set(id, { id, amount: amountPaise, notes });
    return { id };
  },
  getRazorpayClient: () => ({ orders: { fetch: async (id: string) => h.orders.get(id) } }),
  createRazorpayRefund: async (p: any) => {
    if (h.refundFail) throw new Error("razorpay down");
    h.refunds.push(p);
    return { id: `rfnd_${h.refunds.length}` };
  },
}));
vi.mock("@/lib/billing/razorpayRoute", () => ({
  createTransferForPayment: async (paymentId: string, p: any) => {
    h.transfers.push({ paymentId, ...p });
    return { items: [{ id: "trf_1" }] };
  },
}));
vi.mock("@/lib/services/notifications", () => ({
  notify: async (i: any) => {
    h.notified.push(i);
    await h.db.client.from("notifications").insert({
      user_id: i.userId,
      title: i.title,
      message: i.message,
      metadata: i.metadata,
    });
  },
  hostUserId: async (hostUuid: string) => (hostUuid === "h1" ? "host1" : null),
  notifyWhatsApp: async (i: any) => {
    h.whatsapp.push(i);
  },
  resolveUserPhone: async () => null,
}));
vi.mock("@/lib/services/email", () => ({
  emailUser: async (userId: string, mail: any) => {
    h.emails.push({ userId, ...mail });
  },
}));
vi.mock("@/lib/services/adminAlerts", () => ({
  sendAdminAlert: async (a: any) => {
    h.alerts.push(a);
  },
}));
vi.mock("@/lib/services/pricingRules", () => ({ getPricingRules: async () => ({ commissionRate: 0.05 }) }));
vi.mock("@/lib/services/hostPayoutReadiness", () => ({
  hostHasPayoutAccount: async () => true,
  getHostPayoutReadiness: async () => ({ blockers: [] }),
  HostPayoutMissingError: class HostPayoutMissingError extends Error {},
}));

import {
  PaymentRefundedError,
  assertNoOpenRequest,
  cancelPendingRequestIfAny,
  finalizeBookingFromRazorpayOrder,
  respondToBookingRequest,
  sweepBookingRequests,
  validateAndPriceBooking,
  withdrawBookingRequest,
} from "../admin-writes";
import { DatesUnavailableError } from "@/lib/stayDates";

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = new Date("2026-10-30T10:00:00Z");
const stay = { startDate: "2026-12-10", endDate: "2026-12-12", numAdults: 2 };
const otherStay = { startDate: "2027-01-10", endDate: "2027-01-12", numAdults: 2 };
const request = (userId = "g1", listingId = 1, dates: typeof stay = stay) => ({ listingId, userId, ...dates });

const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
const bookings = () => h.db.table("bookings") as any[];
const byId = (id: number) => bookings().find((b) => b.booking_id === id);

/** The guest pays up front: prices the stay, opens an order, and finalizes it (as the webhook/callback do). */
async function paid(userId = "g1", listingId = 1, dates: typeof stay = stay) {
  const input = request(userId, listingId, dates);
  const priced = await validateAndPriceBooking(input);
  const orderId = `order_t${++h.seq}`;
  h.orders.set(orderId, {
    id: orderId,
    amount: priced.amountPaise,
    notes: {
      listingId: String(listingId),
      userId,
      startDate: dates.startDate,
      endDate: dates.endDate,
      numAdults: String(dates.numAdults),
    },
  });
  const booking = await finalizeBookingFromRazorpayOrder({ orderId, paymentId: `pay_${orderId}` });
  return booking.booking_id as number;
}
const respond = (id: number, decision: "accept" | "reject", hostUserId = "host1") =>
  respondToBookingRequest({ bookingId: id, hostUserId, decision });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  h.orders.clear();
  h.refunds.length = 0;
  h.refundFail = false;
  h.notified.length = 0;
  h.whatsapp.length = 0;
  h.emails.length = 0;
  h.alerts.length = 0;
  h.transfers.length = 0;
  h.seq = 0;
  const listing = {
    host_uuid: "h1",
    price_weekday: 1000,
    price_weekend: 1500,
    num_guests: 4,
    is_active: true,
    delisted_at: null,
    title: "Cabin",
  };
  h.db = createFakeDb({
    listings: [
      { listing_id: 1, booking_mode: "manual", ...listing },
      { listing_id: 2, booking_mode: "auto", ...listing },
      { listing_id: 3, booking_mode: null, ...listing },
    ],
    users: [
      { user_id: "g1", name: "Gia" },
      { user_id: "g2", name: "Gus" },
    ],
    host_payout_methods: [{ host_uuid: "h1", razorpay_account_id: "acc_1", status: "active" }],
  });
});
afterEach(() => vi.useRealTimers());

describe("Instant Book is the default", () => {
  it("needs host approval only when the listing is set to manual", async () => {
    expect((await validateAndPriceBooking(request("g1", 1))).requiresHostApproval).toBe(true);
    expect((await validateAndPriceBooking(request("g1", 2))).requiresHostApproval).toBe(false);
    expect((await validateAndPriceBooking(request("g1", 3))).requiresHostApproval).toBe(false);
  });

  it("confirms an Instant Book payment immediately, with a transfer and no request", async () => {
    const id = await paid("g1", 3);
    expect(byId(id)).toMatchObject({ status_id: 2, listing_id: 3 });
    expect(h.transfers).toHaveLength(1);
    expect(h.refunds).toHaveLength(0);
    expect(h.whatsapp.map((w) => w.template)).toEqual(["booking_confirmation_guest", "booking_received_host"]);
  });
});

describe("guest pays up front on a host-approval listing", () => {
  it("holds a PENDING booking with the payment, and does not confirm, transfer or refund", async () => {
    const id = await paid();
    const row = byId(id);
    expect(row).toMatchObject({ status_id: 1, user_id: "g1", host_uuid: "h1", listing_id: 1 });
    expect(row.razorpay_payment_id).toBeTruthy();
    expect(row.razorpay_order_id).toBeTruthy();
    expect(row.amount_paise).toBe(h.orders.get(row.razorpay_order_id).amount);
    expect(row.invoice_number).toBeUndefined();
    expect(h.transfers).toHaveLength(0);
    expect(h.refunds).toHaveLength(0);
  });

  it("tells the guest they paid and shows the host the request, with in-app + email, not a confirmation", async () => {
    await paid();
    expect(h.notified.map((n) => [n.userId, n.title])).toEqual([
      ["g1", "Request sent"],
      ["host1", "New booking request"],
    ]);
    // Reuses the DB trigger templates so the generic "Booking Confirmed!" row is overwritten.
    expect(h.notified.map((n) => n.templateId)).toEqual(["booking_confirmed_guest", "booking_received_host"]);
    const hostNotice = h.notified[1];
    expect(hostNotice.metadata).toMatchObject({ kind: "booking_request", role: "host" });
    expect(hostNotice.metadata.respond_by).toBe(new Date(NOW.getTime() + 2 * HOUR).toISOString());
    expect(hostNotice.message).toMatch(/Gia/);
    expect(hostNotice.message).toMatch(/2 guests/);
    expect(h.emails.map((e) => e.userId)).toEqual(["g1", "host1"]);
    // No confirmation WhatsApp until the host accepts.
    expect(h.whatsapp).toHaveLength(0);
  });

  it("is idempotent when the callback and webhook both deliver the same payment", async () => {
    const id = await paid();
    const order = [...h.orders.values()][0];
    const again = await finalizeBookingFromRazorpayOrder({ orderId: order.id, paymentId: byId(id).razorpay_payment_id });
    expect(again.booking_id).toBe(id);
    expect(bookings()).toHaveLength(1);
    expect(h.notified).toHaveLength(2);
  });

  it("stops the same guest paying twice for the same dates", async () => {
    await paid();
    await expect(assertNoOpenRequest(request())).rejects.toMatchObject({ code: "REQUEST_ALREADY_PENDING", status: 409 });
    await expect(assertNoOpenRequest(request("g1", 1, otherStay))).resolves.toBeUndefined();
  });

  it("holds the dates for the host's 2h so another guest can't book them, then frees them", async () => {
    await paid("g1");
    await expect(validateAndPriceBooking(request("g2"))).rejects.toBeInstanceOf(DatesUnavailableError);
    advance(2 * HOUR + MIN);
    await expect(validateAndPriceBooking(request("g2"))).resolves.toBeDefined();
  });

  it("refunds a second guest who paid for dates already held by an earlier paid request", async () => {
    await paid("g1");
    const priced = { amountPaise: 123400 };
    h.orders.set("order_late", {
      id: "order_late",
      amount: priced.amountPaise,
      notes: { listingId: "1", userId: "g2", startDate: stay.startDate, endDate: stay.endDate, numAdults: "2" },
    });
    await expect(finalizeBookingFromRazorpayOrder({ orderId: "order_late", paymentId: "pay_late" })).rejects.toBeInstanceOf(
      PaymentRefundedError,
    );
    expect(h.refunds).toHaveLength(1);
    expect(h.refunds[0]).toMatchObject({ razorpayPaymentId: "pay_late", amountPaise: 123400 });
    expect(bookings()).toHaveLength(1);
  });
});

describe("host accepts", () => {
  it("confirms the booking, creates the transfer and notifies both sides on WhatsApp, email and in-app", async () => {
    const id = await paid();
    h.notified.length = 0;
    h.emails.length = 0;
    advance(30 * MIN);
    const res = await respond(id, "accept");
    expect(res.decision).toBe("accept");
    expect(byId(id)).toMatchObject({ status_id: 2, transfer_status: "created" });
    expect(byId(id).invoice_number).toBeTruthy();
    expect(byId(id).invoice.grandTotalPaise).toBe(h.orders.get(byId(id).razorpay_order_id).amount);
    expect(h.transfers).toHaveLength(1);
    expect(h.refunds).toHaveLength(0);

    expect(h.notified.map((n) => [n.userId, n.title])).toEqual([
      ["g1", "Booking confirmed"],
      ["host1", "New booking"],
    ]);
    expect(h.emails.map((e) => e.userId)).toEqual(["g1", "host1"]);
    expect(h.whatsapp.map((w) => [w.userId, w.template])).toEqual([
      ["g1", "booking_confirmation_guest"],
      ["host1", "booking_received_host"],
    ]);
  });

  it("only the listing's host can respond", async () => {
    const id = await paid();
    await expect(respond(id, "accept", "intruder")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(byId(id).status_id).toBe(1);
    expect(h.refunds).toHaveLength(0);
  });

  it("cannot be answered twice", async () => {
    const id = await paid();
    await respond(id, "accept");
    await expect(respond(id, "accept")).rejects.toMatchObject({ code: "NOT_PENDING", status: 409 });
    await expect(respond(id, "reject")).rejects.toMatchObject({ code: "NOT_PENDING" });
    expect(h.refunds).toHaveLength(0);
  });

  it("refunds the guest if the nights were taken in the meantime", async () => {
    const id = await paid();
    bookings().push({ booking_id: 5000, listing_id: 1, status_id: 2, start_date: "2026-12-11", end_date: "2026-12-13", user_id: "g2" });
    await expect(respond(id, "accept")).rejects.toMatchObject({ code: "UNAVAILABLE", status: 409 });
    expect(byId(id)).toMatchObject({ status_id: 3, cancellation_reason: "Dates no longer available", refund_status: "processed" });
    expect(h.refunds).toHaveLength(1);
    expect(h.transfers).toHaveLength(0);
  });

  it("refunds the guest if the price changed after they paid", async () => {
    const id = await paid();
    h.db.table("listings")[0].price_weekday = 5000;
    await expect(respond(id, "accept")).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(byId(id)).toMatchObject({ status_id: 3, refund_status: "processed" });
    expect(h.refunds).toHaveLength(1);
  });

  it("lets the host retry on a transient database error without refunding", async () => {
    const id = await paid();
    const orig = h.db.client.from;
    h.db.client.from = (t: string) => {
      if (t === "listing_calendar") throw Object.assign(new Error("db down"), { code: "08006" });
      return orig(t);
    };
    await expect(respond(id, "accept")).rejects.toMatchObject({ code: "08006" });
    h.db.client.from = orig;
    expect(byId(id).status_id).toBe(1);
    expect(h.refunds).toHaveLength(0);
  });
});

describe("host declines or doesn't answer: cancelled and refunded in full", () => {
  it("decline cancels the booking and starts a full refund in the same step", async () => {
    const id = await paid();
    h.notified.length = 0;
    await respond(id, "reject");
    const row = byId(id);
    expect(row).toMatchObject({
      status_id: 3,
      cancellation_reason: "Host declined",
      cancelled_by: "host1",
      refund_status: "processed",
      refund_transaction_id: "rfnd_1",
    });
    expect(row.refund_amount).toBe(row.amount_paise / 100);
    expect(h.refunds).toEqual([
      expect.objectContaining({
        razorpayPaymentId: row.razorpay_payment_id,
        amountPaise: row.amount_paise,
        idempotencyKey: `refund:request:${id}`,
      }),
    ]);
    expect(h.transfers).toHaveLength(0);
    expect(h.notified.map((n) => [n.userId, n.title])).toEqual([
      ["g1", "Request declined"],
      ["host1", "Request declined"],
    ]);
    expect(h.notified[0].message).toMatch(/full refund/i);
  });

  it("answering after the 2h window cancels, refunds and returns 410", async () => {
    const id = await paid();
    advance(2 * HOUR + MIN);
    await expect(respond(id, "accept")).rejects.toMatchObject({ code: "EXPIRED", status: 410 });
    expect(byId(id)).toMatchObject({ status_id: 3, cancellation_reason: "Host did not respond in time", refund_status: "processed" });
    expect(h.refunds).toHaveLength(1);
    expect(h.transfers).toHaveLength(0);
  });

  it("still cancels, flags it for retry and alerts ops when Razorpay refuses the refund", async () => {
    const id = await paid();
    h.refundFail = true;
    await respond(id, "reject");
    expect(byId(id)).toMatchObject({ status_id: 3, refund_status: "failed" });
    expect(byId(id).refund_transaction_id ?? null).toBeNull();
    expect(h.db.table("manual_settlement_flags")).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ severity: "critical" });
    expect(h.notified[h.notified.length - 2].message).toMatch(/retry/i);
  });
});

describe("withdraw and shared cancel entry", () => {
  it("lets the guest withdraw a pending request and refunds them in full", async () => {
    const id = await paid();
    await withdrawBookingRequest(id, "g1");
    expect(byId(id)).toMatchObject({ status_id: 3, cancelled_by: "g1", refund_status: "processed" });
    expect(h.refunds).toHaveLength(1);
  });

  it("refuses another user, and a booking that is no longer a request", async () => {
    const id = await paid();
    await expect(withdrawBookingRequest(id, "g2")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await respond(id, "accept");
    await expect(withdrawBookingRequest(id, "g1")).rejects.toMatchObject({ code: "NOT_PENDING" });
    expect(h.refunds).toHaveLength(0);
  });

  it("cancelPendingRequestIfAny ignores confirmed bookings so the refund engine handles them", async () => {
    const id = await paid("g1", 2);
    expect(await cancelPendingRequestIfAny(id, "g1")).toBeNull();
    expect(byId(id).status_id).toBe(2);
    expect(h.refunds).toHaveLength(0);
  });

  it("lets the host cancel a pending request (full refund) but not a stranger", async () => {
    const id = await paid();
    await expect(cancelPendingRequestIfAny(id, "intruder")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await cancelPendingRequestIfAny(id, "host1");
    expect(byId(id)).toMatchObject({ status_id: 3, cancelled_by: "host1", refund_status: "processed" });
    expect(h.refunds).toHaveLength(1);
  });
});

describe("sweep", () => {
  it("cancels and refunds an unanswered request after 2h, and tells both", async () => {
    const id = await paid();
    h.notified.length = 0;
    advance(2 * HOUR + MIN);
    const res = await sweepBookingRequests();
    expect(res.expired).toBe(1);
    expect(byId(id)).toMatchObject({
      status_id: 3,
      cancellation_reason: "Host did not respond in time",
      refund_status: "processed",
    });
    expect(h.refunds).toHaveLength(1);
    expect(h.notified.map((n) => n.title)).toEqual(["Request expired", "Request expired"]);
    // Running again must not refund twice.
    expect((await sweepBookingRequests()).expired).toBe(0);
    expect(h.refunds).toHaveLength(1);
  });

  it("leaves a request alone before its deadline", async () => {
    const id = await paid();
    advance(2 * HOUR - 5 * MIN);
    const res = await sweepBookingRequests();
    expect(res.expired).toBe(0);
    expect(byId(id).status_id).toBe(1);
    expect(h.refunds).toHaveLength(0);
  });

  it("never touches confirmed bookings", async () => {
    const id = await paid();
    await respond(id, "accept");
    advance(48 * HOUR);
    expect((await sweepBookingRequests()).expired).toBe(0);
    expect(byId(id).status_id).toBe(2);
    expect(h.refunds).toHaveLength(0);
  });

  it("sends each host reminder once", async () => {
    await paid();
    h.notified.length = 0;
    advance(16 * MIN);
    expect((await sweepBookingRequests()).reminded).toBe(1);
    expect((await sweepBookingRequests()).reminded).toBe(0);
    expect(h.notified.filter((n) => /Reminder/.test(n.title))).toHaveLength(1);
    expect(h.notified[0].userId).toBe("host1");
    advance(45 * MIN);
    expect((await sweepBookingRequests()).reminded).toBe(1); // the 1h mark
  });

  it("keeps going when one booking fails", async () => {
    const a = await paid("g1");
    advance(30 * MIN);
    const b = await paid("g2", 1, otherStay);
    advance(2 * HOUR);
    const orig = h.db.client.from;
    let calls = 0;
    h.db.client.from = (t: string) => {
      if (t === "bookings" && ++calls === 4) throw new Error("boom");
      return orig(t);
    };
    const res = await sweepBookingRequests();
    h.db.client.from = orig;
    expect(res.errors + res.expired).toBeGreaterThanOrEqual(1);
    expect([a, b].map((x) => byId(x).status_id)).toContain(3);
  });
});
