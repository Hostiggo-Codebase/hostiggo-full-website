import { describe, expect, it } from "vitest";
import {
  GUEST_PAYMENT_WINDOW_MS,
  HOST_RESPONSE_WINDOW_MS,
  PAYMENT_GRACE_MS,
  formatTimeLeft,
  parseBookedAt,
  requestDeadline,
  requestHardExpiry,
  requestPhase,
} from "../bookingRequest";

// booked_at is a timestamp WITHOUT time zone holding UTC wall time.
const BOOKED = "2026-10-29 10:00:00";
const BOOKED_MS = Date.UTC(2026, 9, 29, 10, 0, 0);

describe("parseBookedAt", () => {
  it("reads zone-less timestamps as UTC", () => {
    expect(parseBookedAt(BOOKED)).toBe(BOOKED_MS);
    expect(parseBookedAt("2026-10-29T10:00:00")).toBe(BOOKED_MS);
    expect(parseBookedAt("2026-10-29T10:00:00.000Z")).toBe(BOOKED_MS);
  });
  it("returns null for missing or invalid values", () => {
    expect(parseBookedAt(null)).toBeNull();
    expect(parseBookedAt("nonsense")).toBeNull();
  });
});

describe("requestPhase", () => {
  it("is awaiting_host with no order, awaiting_payment with an order and no payment", () => {
    expect(requestPhase({ status_id: 1 })).toBe("awaiting_host");
    expect(requestPhase({ status_id: 1, razorpay_order_id: "order_1" })).toBe("awaiting_payment");
  });
  it("is null once paid, confirmed or cancelled", () => {
    expect(requestPhase({ status_id: 1, razorpay_order_id: "o", razorpay_payment_id: "pay_1" })).toBeNull();
    expect(requestPhase({ status_id: 2 })).toBeNull();
    expect(requestPhase({ status_id: 3 })).toBeNull();
  });
});

describe("deadlines", () => {
  it("gives the host 24h from the request", () => {
    expect(requestDeadline({ status_id: 1, booked_at: BOOKED })).toBe(BOOKED_MS + HOST_RESPONSE_WINDOW_MS);
    expect(requestHardExpiry({ status_id: 1, booked_at: BOOKED })).toBe(BOOKED_MS + HOST_RESPONSE_WINDOW_MS);
  });
  it("gives the guest 2h from acceptance, plus grace before the sweep cancels", () => {
    const accepted = { status_id: 1, razorpay_order_id: "order_1", booked_at: BOOKED };
    expect(requestDeadline(accepted)).toBe(BOOKED_MS + GUEST_PAYMENT_WINDOW_MS);
    expect(requestHardExpiry(accepted)).toBe(BOOKED_MS + GUEST_PAYMENT_WINDOW_MS + PAYMENT_GRACE_MS);
  });
  it("has no deadline for anything that is not a live request", () => {
    expect(requestDeadline({ status_id: 2, booked_at: BOOKED })).toBeNull();
    expect(requestDeadline({ status_id: 1 })).toBeNull();
  });
});

describe("formatTimeLeft", () => {
  it("formats hours and minutes, rounding up", () => {
    expect(formatTimeLeft(23 * 3600e3 + 41 * 60e3)).toBe("23h 41m");
    expect(formatTimeLeft(59 * 60e3 + 1)).toBe("1h 0m");
    expect(formatTimeLeft(5 * 60e3)).toBe("5m");
    expect(formatTimeLeft(0)).toBe("0m");
  });
});
