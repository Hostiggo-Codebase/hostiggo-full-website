import { describe, expect, it } from "vitest";
import {
  HOST_RESPONSE_WINDOW_MS,
  formatTimeLeft,
  isUnconfirmedRequest,
  parseBookedAt,
  requestDeadline,
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
  it("is awaiting_host for a paid, pending booking", () => {
    expect(requestPhase({ status_id: 1, razorpay_payment_id: "pay_1" })).toBe("awaiting_host");
  });
  it("is null when unpaid, confirmed or cancelled", () => {
    expect(requestPhase({ status_id: 1 })).toBeNull();
    expect(requestPhase({ status_id: 2, razorpay_payment_id: "pay_1" })).toBeNull();
    expect(requestPhase({ status_id: 3, razorpay_payment_id: "pay_1" })).toBeNull();
  });
});

describe("deadline", () => {
  it("gives the host 2h from the payment", () => {
    expect(HOST_RESPONSE_WINDOW_MS).toBe(2 * 3600e3);
    expect(requestDeadline({ status_id: 1, razorpay_payment_id: "pay_1", booked_at: BOOKED })).toBe(
      BOOKED_MS + HOST_RESPONSE_WINDOW_MS,
    );
  });
  it("has no deadline for anything that is not a live request", () => {
    expect(requestDeadline({ status_id: 2, razorpay_payment_id: "pay_1", booked_at: BOOKED })).toBeNull();
    expect(requestDeadline({ status_id: 1, razorpay_payment_id: "pay_1" })).toBeNull();
  });
});

describe("isUnconfirmedRequest", () => {
  it("covers pending requests and requests cancelled before ever being confirmed", () => {
    expect(isUnconfirmedRequest({ status_id: 1, razorpay_payment_id: "pay_1" })).toBe(true);
    expect(isUnconfirmedRequest({ status_id: 3, razorpay_payment_id: "pay_1", paid_at: null })).toBe(true);
  });
  it("leaves confirmed bookings, and bookings cancelled after confirmation, alone", () => {
    expect(isUnconfirmedRequest({ status_id: 2, razorpay_payment_id: "pay_1", paid_at: "2026-10-29" })).toBe(false);
    expect(isUnconfirmedRequest({ status_id: 3, razorpay_payment_id: "pay_1", paid_at: "2026-10-29" })).toBe(false);
  });
});

describe("formatTimeLeft", () => {
  it("formats hours and minutes, rounding up", () => {
    expect(formatTimeLeft(1 * 3600e3 + 41 * 60e3)).toBe("1h 41m");
    expect(formatTimeLeft(59 * 60e3 + 1)).toBe("1h 0m");
    expect(formatTimeLeft(5 * 60e3)).toBe("5m");
    expect(formatTimeLeft(0)).toBe("0m");
  });
});
