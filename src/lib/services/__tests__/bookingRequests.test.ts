import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./fakeSupabase";

const h = vi.hoisted(() => ({
  db: null as any,
  orders: new Map<string, any>(),
  refunds: [] as any[],
  notified: [] as any[],
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
  notifyWhatsApp: async () => undefined,
  resolveUserPhone: async () => null,
}));
vi.mock("@/lib/services/email", () => ({ emailUser: async () => undefined }));
vi.mock("@/lib/services/adminAlerts", () => ({ sendAdminAlert: async () => undefined }));
vi.mock("@/lib/services/pricingRules", () => ({ getPricingRules: async () => ({ commissionRate: 0.05 }) }));
vi.mock("@/lib/services/hostPayoutReadiness", () => ({
  hostHasPayoutAccount: async () => true,
  getHostPayoutReadiness: async () => ({ blockers: [] }),
  HostPayoutMissingError: class HostPayoutMissingError extends Error {},
}));

import {
  BookingRequestError,
  PaymentRefundedError,
  cancelPendingRequestIfAny,
  createBookingRequest,
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
const request = (userId = "g1", listingId = 1) => ({ listingId, userId, ...stay });

const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
const bookings = () => h.db.table("bookings") as any[];
const byId = (id: number) => bookings().find((b) => b.booking_id === id);

async function requested(userId = "g1", listingId = 1) {
  const { booking } = await createBookingRequest(request(userId, listingId));
  return booking.booking_id as number;
}
async function accepted(userId = "g1") {
  const id = await requested(userId);
  await respondToBookingRequest({ bookingId: id, hostUserId: "host1", decision: "accept" });
  return id;
}
const pay = (id: number, paymentId = `pay_${id}`) =>
  finalizeBookingFromRazorpayOrder({ orderId: byId(id).razorpay_order_id, paymentId });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  h.orders.clear();
  h.refunds.length = 0;
  h.notified.length = 0;
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
      { listing_id: 1, booking_mode: null, ...listing },
      { listing_id: 2, booking_mode: "auto", ...listing },
    ],
    users: [
      { user_id: "g1", name: "Gia" },
      { user_id: "g2", name: "Gus" },
    ],
    host_payout_methods: [{ host_uuid: "h1", razorpay_account_id: "acc_1", status: "active" }],
  });
});
afterEach(() => vi.useRealTimers());

describe("requesting", () => {
  it("flags only non-Instant-Book listings as needing approval", async () => {
    expect((await validateAndPriceBooking(request("g1", 1))).requiresHostApproval).toBe(true);
    expect((await validateAndPriceBooking(request("g1", 2))).requiresHostApproval).toBe(false);
  });

  it("creates an unpaid pending booking and tells both sides", async () => {
    const id = await requested();
    const row = byId(id);
    expect(row).toMatchObject({ status_id: 1, user_id: "g1", host_uuid: "h1", listing_id: 1 });
    expect(row.razorpay_order_id ?? null).toBeNull();
    expect(row.razorpay_payment_id ?? null).toBeNull();
    expect(h.orders.size).toBe(0);
    expect(h.notified.map((n) => [n.userId, n.title])).toEqual([
      ["g1", "Request sent"],
      ["host1", "New booking request"],
    ]);
    // Reuses the DB trigger templates so the generic "Booking Confirmed!" row is overwritten.
    expect(h.notified.map((n) => n.templateId)).toEqual(["booking_confirmed_guest", "booking_received_host"]);
  });

  it("rejects a second open request for the same dates by the same guest", async () => {
    await requested();
    await expect(createBookingRequest(request())).rejects.toMatchObject({ code: "REQUEST_ALREADY_PENDING", status: 409 });
  });

  it("does not hold dates while only waiting for the host", async () => {
    await requested("g1");
    await expect(createBookingRequest(request("g2"))).resolves.toBeDefined();
  });
});

describe("host response", () => {
  it("decline cancels with no charge and tells the guest", async () => {
    const id = await requested();
    await respondToBookingRequest({ bookingId: id, hostUserId: "host1", decision: "reject" });
    expect(byId(id)).toMatchObject({ status_id: 3, cancellation_reason: "Host declined", refund_status: "not_applicable" });
    expect(h.refunds).toHaveLength(0);
    expect(h.notified.at(-2)).toMatchObject({ userId: "g1", title: "Request declined" });
  });

  it("only the listing's host can respond", async () => {
    const id = await requested();
    await expect(respondToBookingRequest({ bookingId: id, hostUserId: "intruder", decision: "accept" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(byId(id).status_id).toBe(1);
  });

  it("accept opens an order, restarts the clock and starts the 2h window", async () => {
    const id = await requested();
    advance(5 * HOUR);
    await respondToBookingRequest({ bookingId: id, hostUserId: "host1", decision: "accept" });
    const row = byId(id);
    expect(row.status_id).toBe(1);
    expect(row.razorpay_order_id).toBe("order_1");
    expect(row.booked_at).toBe(new Date(Date.now()).toISOString());
    expect(h.orders.get("order_1").notes).toMatchObject({ bookingId: String(id), userId: "g1", listingId: "1" });
    expect(h.orders.get("order_1").amount).toBe(Math.round(row.amount * 100));
    expect(h.notified.at(-1)).toMatchObject({ userId: "g1" });
    expect(h.notified.at(-1).title).toMatch(/complete your payment/i);
  });

  it("cannot be answered twice", async () => {
    const id = await accepted();
    await expect(respondToBookingRequest({ bookingId: id, hostUserId: "host1", decision: "accept" })).rejects.toMatchObject({
      code: "NOT_PENDING",
      status: 409,
    });
    await expect(respondToBookingRequest({ bookingId: id, hostUserId: "host1", decision: "reject" })).rejects.toMatchObject({
      code: "NOT_PENDING",
    });
  });

  it("is refused after the 24h window and the request is cancelled", async () => {
    const id = await requested();
    advance(24 * HOUR + MIN);
    await expect(respondToBookingRequest({ bookingId: id, hostUserId: "host1", decision: "accept" })).rejects.toMatchObject({
      code: "EXPIRED",
      status: 410,
    });
    expect(byId(id)).toMatchObject({ status_id: 3, refund_status: "not_applicable" });
    expect(h.orders.size).toBe(0);
  });

  it("accepting declines other open requests for the same nights, uncharged", async () => {
    const first = await requested("g1");
    const rival = await requested("g2");
    await respondToBookingRequest({ bookingId: first, hostUserId: "host1", decision: "accept" });
    expect(byId(rival)).toMatchObject({ status_id: 3, cancellation_reason: "Dates no longer available" });
    expect(h.refunds).toHaveLength(0);
  });

  it("accepting fails cleanly (409) and declines when the dates are gone", async () => {
    const id = await requested();
    bookings().push({ booking_id: 5000, listing_id: 1, status_id: 2, start_date: "2026-12-11", end_date: "2026-12-13", user_id: "g2" });
    await expect(respondToBookingRequest({ bookingId: id, hostUserId: "host1", decision: "accept" })).rejects.toBeInstanceOf(
      DatesUnavailableError,
    );
    expect(byId(id)).toMatchObject({ status_id: 3, cancellation_reason: "Dates no longer available" });
    expect(h.orders.size).toBe(0);
  });

  it("turns other business errors into a 409 instead of crashing", async () => {
    const id = await requested();
    h.db.table("listings")[0].is_active = false;
    await expect(respondToBookingRequest({ bookingId: id, hostUserId: "host1", decision: "accept" })).rejects.toMatchObject({
      code: "UNAVAILABLE",
      status: 409,
    });
    expect(byId(id).status_id).toBe(1);
  });
});

describe("dates are held while the guest pays", () => {
  it("blocks a competing request, then frees the dates once the window lapses", async () => {
    await accepted("g1");
    await expect(createBookingRequest(request("g2"))).rejects.toBeInstanceOf(DatesUnavailableError);
    advance(2 * HOUR + 11 * MIN);
    await expect(createBookingRequest(request("g2"))).resolves.toBeDefined();
  });
});

describe("guest pays", () => {
  it("confirms the same booking, records the payment and creates the host transfer", async () => {
    const id = await accepted();
    advance(30 * MIN);
    const booking = await pay(id);
    expect(booking.booking_id).toBe(id);
    expect(byId(id)).toMatchObject({ status_id: 2, razorpay_payment_id: `pay_${id}`, transfer_status: "created" });
    expect(byId(id).paid_at).toBeTruthy();
    expect(byId(id).invoice.grandTotalPaise).toBe(h.orders.get("order_1").amount);
    expect(h.transfers).toHaveLength(1);
    expect(h.refunds).toHaveLength(0);
    expect(bookings()).toHaveLength(1);
  });

  it("is idempotent when the callback and webhook both deliver", async () => {
    const id = await accepted();
    await pay(id);
    const again = await pay(id);
    expect(again.booking_id).toBe(id);
    expect(h.transfers).toHaveLength(1);
    expect(h.refunds).toHaveLength(0);
    expect(bookings()).toHaveLength(1);
  });

  it("still honours a payment inside the grace period", async () => {
    const id = await accepted();
    advance(2 * HOUR + 5 * MIN);
    await pay(id);
    expect(byId(id).status_id).toBe(2);
  });

  it("refunds in full and cancels a payment that arrives after the window", async () => {
    const id = await accepted();
    advance(2 * HOUR + 11 * MIN);
    await expect(pay(id)).rejects.toBeInstanceOf(PaymentRefundedError);
    expect(byId(id).status_id).toBe(3);
    expect(byId(id).razorpay_payment_id ?? null).toBeNull();
    expect(h.refunds).toHaveLength(1);
    expect(h.refunds[0].amountPaise).toBe(h.orders.get("order_1").amount);
    expect(h.transfers).toHaveLength(0);
  });

  it("refunds a payment made after the sweep already cancelled the request", async () => {
    const id = await accepted();
    advance(3 * HOUR);
    await sweepBookingRequests();
    expect(byId(id).status_id).toBe(3);
    await expect(pay(id)).rejects.toBeInstanceOf(PaymentRefundedError);
    expect(h.refunds).toHaveLength(1);
    expect(byId(id).status_id).toBe(3);
  });

  it("refunds in full if the price changed while the guest was paying", async () => {
    const id = await accepted();
    h.db.table("listings")[0].price_weekday = 9999;
    h.db.table("listings")[0].price_weekend = 9999;
    await expect(pay(id)).rejects.toBeInstanceOf(PaymentRefundedError);
    expect(byId(id).status_id).toBe(3);
    expect(h.refunds[0].amountPaise).toBe(h.orders.get("order_1").amount);
  });

  it("refunds in full if the dates were taken in the meantime", async () => {
    const id = await accepted();
    bookings().push({ booking_id: 5000, listing_id: 1, status_id: 2, start_date: "2026-12-10", end_date: "2026-12-12", user_id: "g2" });
    await expect(pay(id)).rejects.toBeInstanceOf(PaymentRefundedError);
    expect(byId(id).status_id).toBe(3);
    expect(h.refunds).toHaveLength(1);
  });

  it("refunds a payment for an order that matches no request", async () => {
    h.orders.set("order_x", { id: "order_x", amount: 123400, notes: { bookingId: "9999", listingId: "1", userId: "g1", startDate: stay.startDate, endDate: stay.endDate } });
    await expect(finalizeBookingFromRazorpayOrder({ orderId: "order_x", paymentId: "pay_x" })).rejects.toBeInstanceOf(PaymentRefundedError);
    expect(h.refunds).toHaveLength(1);
  });
});

describe("Instant Book listings are unchanged", () => {
  it("still insert a confirmed booking on payment, with a transfer", async () => {
    const priced = await validateAndPriceBooking(request("g1", 2));
    h.orders.set("order_i", {
      id: "order_i",
      amount: priced.amountPaise,
      notes: { listingId: "2", userId: "g1", startDate: stay.startDate, endDate: stay.endDate, numAdults: "2" },
    });
    const booking = await finalizeBookingFromRazorpayOrder({ orderId: "order_i", paymentId: "pay_i" });
    expect(booking).toMatchObject({ status_id: 2, listing_id: 2, razorpay_payment_id: "pay_i" });
    expect(h.transfers).toHaveLength(1);
    expect(h.refunds).toHaveLength(0);
  });
});

describe("withdraw and shared cancel entry", () => {
  it("lets the guest withdraw an unpaid request", async () => {
    const id = await requested();
    await withdrawBookingRequest(id, "g1");
    expect(byId(id)).toMatchObject({ status_id: 3, cancelled_by: "g1", refund_status: "not_applicable" });
    expect(h.refunds).toHaveLength(0);
  });

  it("refuses another user, and a booking that is no longer a request", async () => {
    const id = await requested();
    await expect(withdrawBookingRequest(id, "g2")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await respondToBookingRequest({ bookingId: id, hostUserId: "host1", decision: "accept" });
    await pay(id);
    await expect(withdrawBookingRequest(id, "g1")).rejects.toMatchObject({ code: "NOT_PENDING", status: 409 });
    expect(byId(id).status_id).toBe(2);
  });

  it("cancelPendingRequestIfAny ignores paid bookings so the refund engine handles them", async () => {
    const id = await accepted();
    await pay(id);
    await expect(cancelPendingRequestIfAny(id, "g1")).resolves.toBeNull();
    expect(byId(id).status_id).toBe(2);
  });

  it("lets the host cancel an accepted, unpaid request", async () => {
    const id = await accepted();
    const out = await cancelPendingRequestIfAny(id, "host1");
    expect(out).toMatchObject({ status_id: 3, cancelled_by: "host1" });
    expect(h.refunds).toHaveLength(0);
  });

  it("does not let a stranger cancel a request", async () => {
    const id = await requested();
    await expect(cancelPendingRequestIfAny(id, "stranger")).rejects.toBeInstanceOf(BookingRequestError);
  });
});

describe("sweep", () => {
  it("expires an unanswered request after 24h, uncharged, and tells both", async () => {
    const id = await requested();
    advance(24 * HOUR + MIN);
    const res = await sweepBookingRequests();
    expect(res.expired).toBe(1);
    expect(byId(id)).toMatchObject({ status_id: 3, cancellation_reason: "Host did not respond in time" });
    expect(h.refunds).toHaveLength(0);
    expect(h.notified.map((n) => n.title).slice(-2)).toEqual(["Request expired", "Request expired"]);
  });

  it("leaves a request alone before its deadline", async () => {
    const id = await requested();
    advance(23 * HOUR);
    const res = await sweepBookingRequests();
    expect(res.expired).toBe(0);
    expect(byId(id).status_id).toBe(1);
  });

  it("cancels an unpaid accepted request only after the 2h window plus grace", async () => {
    const id = await accepted();
    advance(2 * HOUR + 5 * MIN);
    expect((await sweepBookingRequests()).expired).toBe(0);
    advance(6 * MIN);
    expect((await sweepBookingRequests()).expired).toBe(1);
    expect(byId(id)).toMatchObject({ status_id: 3, cancellation_reason: "Payment not completed in time" });
  });

  it("never touches paid or confirmed bookings", async () => {
    const id = await accepted();
    await pay(id);
    advance(48 * HOUR);
    expect((await sweepBookingRequests()).expired).toBe(0);
    expect(byId(id).status_id).toBe(2);
  });

  it("sends each host reminder once", async () => {
    await requested();
    h.notified.length = 0;
    advance(HOUR + MIN);
    expect((await sweepBookingRequests()).reminded).toBe(1);
    expect((await sweepBookingRequests()).reminded).toBe(0);
    expect(h.notified.filter((n) => /Reminder/.test(n.title))).toHaveLength(1);
    expect(h.notified[0].userId).toBe("host1");
    advance(5 * HOUR);
    expect((await sweepBookingRequests()).reminded).toBe(1); // the 6h mark
  });

  it("reminds the guest to pay during the 2h window", async () => {
    await accepted();
    h.notified.length = 0;
    advance(HOUR + MIN);
    expect((await sweepBookingRequests()).reminded).toBe(1);
    expect(h.notified[0]).toMatchObject({ userId: "g1" });
    expect(h.notified[0].title).toMatch(/complete your payment/i);
  });

  it("keeps going when one booking fails", async () => {
    const a = await requested("g1");
    advance(30 * MIN);
    const b = await requested("g2");
    advance(24 * HOUR);
    const orig = h.db.client.from;
    let calls = 0;
    h.db.client.from = (t: string) => {
      if (t === "bookings" && ++calls === 5) throw new Error("boom");
      return orig(t);
    };
    const res = await sweepBookingRequests();
    h.db.client.from = orig;
    expect(res.errors + res.expired).toBeGreaterThanOrEqual(1);
    expect([a, b].map((x) => byId(x).status_id)).toContain(3);
  });
});
