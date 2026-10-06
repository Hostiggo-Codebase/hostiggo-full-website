import { formatINR, REFUND_ARRIVAL_NOTE } from '@/lib/format';
import { supabaseAdmin } from "../supabase-admin";
import { todayInIndia } from "@/lib/booking-config";
import { SCHEMA } from "../schema.constants";
import { canonicalPlaceName } from "../destinationAliases";
import { calculateBookingInvoice } from "../billing/invoice";
import { getHostPayoutReadiness } from "./hostPayoutReadiness";
import { DatesUnavailableError, isDatabaseAvailabilityError } from "../stayDates";

const DB_SCHEMA = SCHEMA.testingSchema;

// All functions here run with the service-role key (RLS bypassed) and must only
// be called from /app/api/* route handlers.

/**
 * Read-only host lookup: returns the caller's host_uuid, or null if they have
 * never become a host. Use this (never ensureHostProfile) from anything that is
 * a read, a KYC/verification step or a retry -- those must not be able to turn
 * a plain guest into a host row as a side effect.
 */
export async function findHostUuid(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("host")
    .select("host_uuid")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.host_uuid ?? null;
}

// ── Host Profile ─────────────────────────────────────────────────────────────
/**
 * Ensures a host profile exists for the given user.
 * If no host profile exists, creates one automatically.
 * If multiple host profiles exist (data issue), returns the first one.
 * This allows any authenticated user to become a host.
 * 
 * @param userId The user's ID
 * @returns The host_uuid for the user
 */
export async function ensureHostProfile(userId: string): Promise<string> {
  // Get all host profiles for this user (there should be only 1, but handle multiples)
  const { data: hosts, error: checkError } = await supabaseAdmin
    .from("host")
    .select("host_uuid")
    .eq("user_id", userId)
    .limit(10); // Limit to avoid retrieving too many rows
  
  if (checkError) {
    console.error("[ensureHostProfile] Check error:", checkError);
    throw checkError;
  }
  
  // If host profiles exist, return the first one
  if (hosts && hosts.length > 0) {
    if (hosts.length > 1) {
      console.warn(
        `[ensureHostProfile] Found ${hosts.length} host profiles for user ${userId}. Using first one.`,
        hosts.map((h) => h.host_uuid)
      );
    }
    return hosts[0].host_uuid;
  }
  
  // Never create a host for an auth identity that has no real profile row --
  // that is how orphan "ghost" hosts (host rows with no users row, no listing,
  // no payout details) were accumulating. The users row is created by the
  // on_auth_user_created trigger; if it is missing the account is not set up.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("user_id, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.is_active === false) {
    throw new Error("Complete your profile before setting up hosting.");
  }

  // Create a new host profile for this user
  console.log(`[ensureHostProfile] Creating new host profile for user ${userId}`);
  
  const { data: newHost, error: createError } = await supabaseAdmin
    .from("host")
    .insert({
      user_id: userId,
      is_verified: false,
    })
    .select("host_uuid")
    .single();
  
  if (createError) {
    console.error("[ensureHostProfile] Failed to create host profile:", createError);
    throw new Error(`Could not create host profile: ${createError.message}`);
  }
  
  if (!newHost?.host_uuid) {
    throw new Error("Failed to create host profile for user");
  }
  
  console.log(`[ensureHostProfile] Successfully created host profile with UUID: ${newHost.host_uuid}`);
  return newHost.host_uuid;
}

// ── Storage ──────────────────────────────────────────────────────────────────
const LISTING_BUCKET = "homestay photos";

export async function uploadListingPhoto(
  file: {
    data: ArrayBuffer;
    name: string;
    type: string;
  },
  folder: string = "listings/uploads",
): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(LISTING_BUCKET)
    .upload(path, file.data, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw error;
  const { data } = supabaseAdmin.storage.from(LISTING_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

const MIRROR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIRROR_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Downloads a remote image URL and re-uploads it into our own
 * "homestay photos" bucket, returning the public URL of the copy. Used by
 * the AI-import flow, whose upstream service returns photos hosted on its
 * own storage -- linking those directly would break as soon as that
 * storage is purged and trips next/image's remote-host allowlist. Throws
 * on a non-image, an oversize file, or a failed fetch so the caller can
 * skip that one photo.
 */
export async function mirrorRemoteImageToListingBucket(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);

  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!MIRROR_ALLOWED_TYPES.has(type)) {
    throw new Error(`unsupported content-type: ${type || "unknown"}`);
  }
  const declaredLen = Number(res.headers.get("content-length") || 0);
  if (declaredLen && declaredLen > MIRROR_MAX_BYTES) {
    throw new Error(`image too large: ${declaredLen} bytes`);
  }

  const data = await res.arrayBuffer();
  if (data.byteLength > MIRROR_MAX_BYTES) {
    throw new Error(`image too large: ${data.byteLength} bytes`);
  }

  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return uploadListingPhoto({ data, name: `ai-import.${ext}`, type }, "listings/ai-import");
}

// ── Calendar ─────────────────────────────────────────────────────────────────
/**
 * Throws unless `requestingUserId` is the host who owns `listingId`.
 * Shared guard for host-side writes that previously trusted any client
 * that knew a listing_id integer.
 */
export async function assertListingOwnedBy(listingId: number, requestingUserId: string) {
  const { data: listing, error: listingError } = await supabaseAdmin
    .from("listings")
    .select("host_uuid")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (listingError) throw listingError;
  if (!listing) throw new Error("Listing not found");

  const { data: host, error: hostError } = await supabaseAdmin
    .from("host")
    .select("user_id")
    .eq("host_uuid", listing.host_uuid)
    .maybeSingle();
  if (hostError) throw hostError;
  if (host?.user_id !== requestingUserId) {
    throw new Error("You don't have permission to modify this listing.");
  }
}

export async function upsertCalendarDay(input: {
  listingId: number;
  date: string; // yyyy-mm-dd
  price?: number;
  isAvailable?: boolean;
  currency?: string;
  requestingUserId: string;
}) {
  const { listingId, date, price, isAvailable, currency } = input;
  await assertListingOwnedBy(listingId, input.requestingUserId);
  if (isAvailable !== undefined) {
    const { error } = await supabaseAdmin.rpc("set_host_calendar_dates", {
      p_listing_id: listingId, p_dates: [date], p_is_available: isAvailable, p_price: price ?? null,
    });
    if (!error) {
      const result = await supabaseAdmin.from("listing_calendar").select().eq("listing_id", listingId).eq("date", date).single();
      if (result.error) throw result.error;
      return result.data;
    }
    // Blocking must never fall back to a direct write: only the RPC refuses
    // nights that already have a confirmed booking.
    if (error.code !== "PGRST202" || isAvailable === false) throw error;
  }

  // Find an existing row for this (listing, date) so we update in place rather
  // than relying on a specific unique-constraint name for upsert.
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("listing_calendar")
    .select("calendar_id, price, is_available, currency")
    .eq("listing_id", listingId)
    .eq("date", date)
    .maybeSingle();
  if (findErr) throw findErr;

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (price !== undefined) patch.price = price;
  if (isAvailable !== undefined) patch.is_available = isAvailable;
  if (currency !== undefined) patch.currency = currency;

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("listing_calendar")
      .update(patch)
      .eq("calendar_id", existing.calendar_id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("listing_calendar")
    .insert({
      listing_id: listingId,
      date,
      price: price ?? 0,
      is_available: isAvailable ?? true,
      currency: currency ?? "INR",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Bookings ─────────────────────────────────────────────────────────────────
type BookingInput = {
  listingId: number;
  userId: string;
  startDate: string;
  endDate: string;
  numAdults?: number;
  numChildren?: number;
  // Guest picks *which* add-ons they want; the price for each is always
  // looked up server-side from listing_addons below, never trusted from
  // the client, same reasoning as `amount` never being accepted directly.
  addonIds?: number[];
  // `amount` is intentionally NOT accepted from the client anywhere, the
  // charge is always recomputed here from the listing's real prices so a
  // guest can't submit an arbitrary (or zero) amount for a real booking.
};

/**
 * Availability checks + the real server-side charge for a prospective
 * booking, with no DB writes. Split out of what used to be createBooking()
 * so /api/bookings/reserve can price a Razorpay order for an amount that's
 * guaranteed to match what finalizeBookingFromRazorpayOrder() below will
 * insert once payment actually clears -- neither step trusts a client-sent
 * amount, and both run this exact same calculation.
 */
export async function validateAndPriceBooking(input: BookingInput) {
  // Resolve the owning host + real pricing/capacity from the listing,
  // never trust client-supplied price or guest-count data for the charge.
  const { data: listing, error: lerr } = await supabaseAdmin
    .from("listings")
    .select("host_uuid, price_weekday, price_weekend, num_guests, is_active, delisted_at")
    .eq("listing_id", input.listingId)
    .maybeSingle();
  if (lerr) throw lerr;
  if (!listing?.host_uuid) throw new Error("Listing not found");
  // Paused, delisted and not-yet-published (payout not set up) listings can't
  // be booked, even by someone holding a direct link.
  if (!listing.is_active || listing.delisted_at) {
    throw new Error("This property isn't available for booking right now.");
  }

  const numAdults = input.numAdults ?? 1;
  const numChildren = input.numChildren ?? 0;
  const totalGuests = numAdults + numChildren;
  const maxGuests = Number(listing.num_guests ?? 1);
  if (totalGuests > maxGuests) {
    throw new Error(`This listing only accommodates up to ${maxGuests} guests.`);
  }

  // Check A: blocked calendar days in the requested range.
  const { data: blocked, error: blockedErr } = await supabaseAdmin
    .schema(DB_SCHEMA)
    .from("listing_calendar")
    .select("date")
    .eq("listing_id", input.listingId)
    .gte("date", input.startDate)
    .lt("date", input.endDate) // end date is check-out night, not a stay night
    .eq("is_available", false);
  if (blockedErr) throw blockedErr;
  if (blocked && blocked.length > 0)
    throw new DatesUnavailableError(undefined, blocked.map((row: { date: string }) => row.date));

  // Check B: overlapping confirmed bookings for the same listing.
  const { data: conflicts, error: conflictsErr } = await supabaseAdmin
    .schema(DB_SCHEMA)
    .from("bookings")
    .select("booking_id")
    .eq("listing_id", input.listingId)
    .eq("status_id", 2) // CONFIRMED only
    .lt("start_date", input.endDate) // existing booking starts before new end
    .gt("end_date", input.startDate); // existing booking ends after new start
  if (conflictsErr) throw conflictsErr;
  if (conflicts && conflicts.length > 0)
    throw new DatesUnavailableError("These dates are already booked. Please choose different dates.");

  // Recompute the charge server-side from the listing's real per-night
  // prices, weekend nights (Fri/Sat) use price_weekend, everything else
  // uses price_weekday, plus whichever add-ons the guest actually picked
  // (priced from listing_addons, never from the client), run through the
  // real GST/service-fee invoice (src/lib/billing/invoice.ts) so the
  // stored amount always matches the exact number the guest was shown at
  // checkout, and can't be spoofed by the client.
  const stayNights = eachDateInRange(input.startDate, input.endDate);
  const priceWeekday = Number(listing.price_weekday ?? 0);
  const priceWeekend = Number(listing.price_weekend ?? priceWeekday);
  const subtotal = stayNights.reduce((sum, date) => {
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    const isWeekend = dow === 5 || dow === 6; // Friday or Saturday night
    return sum + (isWeekend ? priceWeekend : priceWeekday);
  }, 0);
  // Which GST slab applies (5%/18%) is decided by the check-in night's own
  // declared-tariff rate, not by the summed multi-night total -- see
  // calculateBookingInvoice's gstRateBasisPrice.
  const checkInDow = stayNights.length
    ? new Date(stayNights[0] + "T00:00:00Z").getUTCDay()
    : 0;
  const gstRateBasisPrice = checkInDow === 5 || checkInDow === 6 ? priceWeekend : priceWeekday;

  let resolvedAddons: { name: string; price: number; type: string | null }[] = [];
  if (input.addonIds?.length) {
    const { data: addonRows, error: addonErr } = await supabaseAdmin
      .from("listing_addons")
      .select("addon_id, price, addons(name, category)")
      .eq("listing_id", input.listingId)
      .in("addon_id", input.addonIds);
    if (addonErr) throw addonErr;
    resolvedAddons = (addonRows ?? []).map((a: any) => ({
      name: a.addons?.name ?? "Add-on",
      price: Number(a.price ?? 0),
      type: a.addons?.category ?? null,
    }));
  }
  const breakfastTotal = resolvedAddons
    .filter((a) => a.type?.toLowerCase().includes("breakfast"))
    .reduce((sum, a) => sum + a.price, 0);
  const otherServicesTotal = resolvedAddons
    .filter((a) => !a.type?.toLowerCase().includes("breakfast"))
    .reduce((sum, a) => sum + a.price, 0);

  const invoice = calculateBookingInvoice({
    basePropertyPrice: subtotal,
    gstRateBasisPrice: gstRateBasisPrice,
    breakfastPrice: breakfastTotal,
    otherServicesPrice: otherServicesTotal,
  });

  return {
    listing,
    numAdults,
    numChildren,
    stayNights,
    resolvedAddons,
    invoice,
    amountRupees: invoice.grandTotalRupees,
    amountPaise: invoice.grandTotalPaise,
  };
}

/**
 * The actual booking write: insert the CONFIRMED row, record the add-ons,
 * lose gracefully to a same-dates race, and block the calendar. Paid
 * bookings provide Razorpay IDs; payment-disabled bookings leave them null.
 */
async function insertConfirmedBooking(
  input: BookingInput,
  priced: Awaited<ReturnType<typeof validateAndPriceBooking>>,
  razorpay: { orderId: string | null; paymentId: string | null },
) {
  const { listing, numAdults, numChildren, stayNights, resolvedAddons, amountRupees } = priced;

  const { data, error } = await supabaseAdmin
    .from("bookings")
    .insert({
      listing_id: input.listingId,
      user_id: input.userId,
      start_date: input.startDate,
      end_date: input.endDate,
      num_adults: numAdults,
      num_children: numChildren,
      nom_guests: numAdults + numChildren,
      amount: amountRupees,
      status_id: 2,
      host_uuid: listing.host_uuid,
      booked_at: new Date().toISOString(),
      razorpay_payment_id: razorpay.paymentId,
      razorpay_order_id: razorpay.orderId,
    })
    .select()
    .single();
  if (error) throw error;

  // Record which add-ons were actually purchased with this booking (their
  // price is already folded into `amount` above; this is just the record
  // of which ones, for the guest/host to see later).
  if (resolvedAddons.length) {
    const { error: bookingAddonsErr } = await supabaseAdmin.from("booking_addons").insert(
      resolvedAddons.map((a) => ({
        booking_id: data.booking_id,
        name: a.name,
        price: a.price,
        type: a.type,
      })),
    );
    if (bookingAddonsErr) {
      console.error("[insertConfirmedBooking] booking_addons insert failed:", bookingAddonsErr.message);
    }
  }

  // Check A/B in validateAndPriceBooking are check-then-insert, not atomic,
  // two requests can both pass them and both insert a CONFIRMED booking for
  // overlapping dates -- here that's two guests who *both actually paid*
  // for the same nights, not just two idle form submissions, so losing this
  // race means a real refund is owed, not just a status flip. There's no
  // way to add a real DB-level exclusion constraint from here (would need
  // direct schema access this service doesn't have), so instead re-check
  // immediately after inserting: if another CONFIRMED booking for the same
  // listing/dates already existed before ours (lower booking_id = arrived
  // first), we lost the race -- cancel the booking we just created and
  // refund the payment that paid for it, rather than leave two guests both
  // holding a "confirmed" reservation for the same nights. This shrinks the
  // race window from the whole request round-trip down to just this
  // recheck, it doesn't eliminate it outright.
  const { data: raceLosers, error: raceErr } = await supabaseAdmin
    .from("bookings")
    .select("booking_id")
    .eq("listing_id", input.listingId)
    .eq("status_id", 2)
    .neq("booking_id", data.booking_id)
    .lt("booking_id", data.booking_id)
    .lt("start_date", input.endDate)
    .gt("end_date", input.startDate);
  if (!raceErr && raceLosers && raceLosers.length > 0) {
    await supabaseAdmin
      .from("bookings")
      .update({ status_id: 3, cancellation_reason: "Dates were booked by another guest first" })
      .eq("booking_id", data.booking_id);
    if (razorpay.paymentId) {
      const { createRazorpayRefund } = await import("../billing/razorpay");
      try {
        await createRazorpayRefund({
          razorpayPaymentId: razorpay.paymentId,
          amountPaise: priced.amountPaise,
          idempotencyKey: `refund:race-loss:${data.booking_id}`,
          notes: { reason: "Dates were booked by another guest first", bookingId: String(data.booking_id) },
        });
      } catch (refundErr) {
        console.error(
          `[insertConfirmedBooking] URGENT: race-loss refund failed for payment ${razorpay.paymentId}, booking ${data.booking_id} -- needs manual refund:`,
          refundErr,
        );
      }
      throw new PaymentRefundedError(
        "These dates were just booked by someone else. Your payment has been refunded.",
      );
    }
    throw new Error("These dates were just booked by someone else. Please choose different dates.");
  }

  // The database booking trigger updates listing_calendar atomically from the
  // booking row. Keeping this write in the application would let a later
  // cancellation accidentally reopen a host or iCal block.

  return data;
}

export async function createBookingWithoutPayment(input: BookingInput) {
  const priced = await validateAndPriceBooking(input);
  const booking = await insertConfirmedBooking(input, priced, { orderId: null, paymentId: null });
  await notifyBookingConfirmed(booking, priced.invoice.grandTotalPaise, false).catch(() => {});
  return booking;
}

/**
 * A payment was captured but no booking can be made for it (dates taken
 * meanwhile, price changed). Refunds the guest in full and tells them, so they
 * are never left charged with nothing to show. A failed refund raises a
 * critical admin alert for a manual refund. Returns the error to throw.
 */
export class PaymentRefundedError extends Error {}

async function refundUnfulfillablePayment(
  params: { orderId: string; paymentId: string },
  order: { amount: number | string; notes?: unknown },
  reason: string,
): Promise<PaymentRefundedError> {
  const amountPaise = Number(order.amount);
  const notes = (order.notes ?? {}) as Record<string, string>;
  let refunded = false;
  try {
    const { createRazorpayRefund } = await import("../billing/razorpay");
    await createRazorpayRefund({
      razorpayPaymentId: params.paymentId,
      amountPaise,
      idempotencyKey: `refund:unfulfilled:${params.paymentId}`,
      notes: { reason, orderId: params.orderId },
    });
    refunded = true;
  } catch (refundErr) {
    const { sendAdminAlert } = await import("./adminAlerts");
    await sendAdminAlert({
      severity: "critical",
      category: "payment",
      message: `Payment ${params.paymentId} has no booking and the automatic refund failed -- refund manually.`,
      details: { orderId: params.orderId, amountPaise, reason, error: String(refundErr) },
    });
  }

  if (notes.userId) {
    try {
      const { notify } = await import("./notifications");
      await notify({
        userId: notes.userId,
        type: "booking_guest",
        category: "bookings",
        title: "Booking not completed",
        message: `${reason} ${
          refunded
            ? `Your payment of ₹${amountPaise / 100} is being refunded in full. ${REFUND_ARRIVAL_NOTE}`
            : "Our team will refund your payment shortly."
        }`,
        metadata: { order_id: params.orderId, listing_id: notes.listingId, role: "guest" },
      });
    } catch (notifyErr) {
      console.error("[refundUnfulfillablePayment] notification failed:", notifyErr);
    }
  }
  return new PaymentRefundedError(
    `${reason} ${refunded ? "Your payment has been refunded." : "We'll refund your payment shortly."}`,
  );
}

/**
 * The only place a booking is ever inserted: called once a Razorpay
 * payment's signature has already been verified by the caller (either the
 * checkout-callback route or the webhook route -- see
 * src/app/api/bookings/confirm-payment and src/app/api/webhooks/razorpay).
 * Re-derives every booking field from the Razorpay order's own `notes`
 * (set server-side at order-creation time in /api/bookings/reserve, never
 * client-editable) rather than trusting anything the client sends alongside
 * the payment IDs.
 */
export async function finalizeBookingFromRazorpayOrder(params: {
  orderId: string;
  paymentId: string;
}) {
  // Idempotency: the checkout-callback route and the payment.captured
  // webhook can both fire for the same payment (or the callback route can
  // get retried by a flaky client) -- without this, that double-fires the
  // whole insert path, including a second real calendar block and a
  // spurious race-loss refund of the guest's own successful payment.
  const { data: existingBooking } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("razorpay_payment_id", params.paymentId)
    .maybeSingle();
  if (existingBooking) return existingBooking;

  const { getRazorpayClient } = await import("../billing/razorpay");
  const order = await getRazorpayClient().orders.fetch(params.orderId);
  const notes = (order.notes ?? {}) as Record<string, string>;
  if (!notes.listingId || !notes.userId || !notes.startDate || !notes.endDate) {
    throw new Error(`Razorpay order ${params.orderId} is missing booking notes.`);
  }

  const input: BookingInput = {
    listingId: Number(notes.listingId),
    userId: notes.userId,
    startDate: notes.startDate,
    endDate: notes.endDate,
    numAdults: notes.numAdults ? Number(notes.numAdults) : undefined,
    numChildren: notes.numChildren ? Number(notes.numChildren) : undefined,
    addonIds: notes.addonIds ? JSON.parse(notes.addonIds) : undefined,
  };

  // Re-run the exact same availability + pricing check /api/bookings/reserve
  // ran when the order was created -- dates can have been taken by someone
  // else in the time it took this guest to pay, and prices are only ever
  // trusted from this recomputation, never from the (already-verified, but
  // now potentially stale) order amount.
  let priced: Awaited<ReturnType<typeof validateAndPriceBooking>>;
  try {
    priced = await validateAndPriceBooking(input);
  } catch (err: any) {
    // A database error (has a Postgres/PostgREST code) is transient: rethrow so
    // the webhook is retried. Anything else is a business rejection, e.g. the
    // dates were taken while this guest was paying, and no retry can fix it.
    if (err?.code) throw err;
    throw await refundUnfulfillablePayment(params, order, err?.message ?? "The booking could not be completed.");
  }

  // The order was created for a specific amount; if the recomputed price
  // has since drifted (e.g. the host changed nightly rates mid-checkout),
  // inserting at the new price would silently charge or credit the guest
  // for something they never actually paid. Order amount is paise; compare
  // in the same unit.
  if (Math.abs(priced.amountPaise - Number(order.amount)) > 1) {
    console.error(
      `[finalizeBookingFromRazorpayOrder] price drift for order ${params.orderId}: paid ${order.amount}, now prices at ${priced.amountPaise}`,
    );
    throw await refundUnfulfillablePayment(
      params,
      order,
      "The price for these dates changed while you were paying.",
    );
  }

  let booking;
  try {
    booking = await insertConfirmedBooking(input, priced, {
      orderId: params.orderId,
      paymentId: params.paymentId,
    });
  } catch (err: any) {
    // Callback + webhook raced past the read-then-insert idempotency check above.
    // bookings_razorpay_payment_id_uniq makes the loser fail here with a unique
    // violation -- that is the SAME payment, so hand back the winner's row.
    if (err?.code === "23505") {
      const { data: winner } = await supabaseAdmin
        .from("bookings")
        .select("*")
        .eq("razorpay_payment_id", params.paymentId)
        .maybeSingle();
      if (winner) return winner;
    }
    if (isDatabaseAvailabilityError(err)) {
      throw await refundUnfulfillablePayment(params, order, "These dates were blocked or booked while you were paying.");
    }
    throw err;
  }

  await snapshotInvoiceOnBooking(booking, priced).catch((err) => {
    console.error(
      `[finalizeBookingFromRazorpayOrder] invoice snapshot failed for booking ${booking.booking_id}:`,
      err,
    );
  });

  // Split the host's net share off to their Razorpay Route Linked Account.
  // The guest's payment and the booking are already final by this point --
  // a Route failure (host never onboarded, Route not enabled on this
  // account yet, transient API error) must never undo either, so this is
  // fully isolated in its own try/catch and only ever adjusts
  // bookings.transfer_status + a manual_settlement_flags row for ops to
  // follow up on, the same pattern already used for a failed race-loss
  // refund above.
  await createHostTransferForBooking(booking, priced, params.paymentId).catch((err) => {
    console.error(
      `[finalizeBookingFromRazorpayOrder] transfer step failed for booking ${booking.booking_id}:`,
      err,
    );
  });

  await notifyBookingConfirmed(booking, priced.invoice.grandTotalPaise, true).catch(() => {});

  return booking;
}

/**
 * Freezes exactly what the guest was charged, and how it splits, onto the
 * booking row (amount_paise, invoice, invoice_number, host_payout_paise, ...).
 * Invoices used to be rebuilt from the listing's *current* prices, so a later
 * price/rate change would rewrite history. Fail-soft: the payment and booking
 * are already final -- a failure here must never undo either.
 */
async function snapshotInvoiceOnBooking(
  booking: { booking_id: number },
  priced: Awaited<ReturnType<typeof validateAndPriceBooking>>,
) {
  const { calculateHostPayout } = await import("../billing/payout");
  const { getPricingRules } = await import("./pricingRules");
  const { invoice } = priced;
  const rules = await getPricingRules();
  const payout = calculateHostPayout({
    propertyPrice: invoice.propertyPricePaise / 100,
    breakfastPrice: invoice.breakfastPricePaise / 100,
    otherServicesPrice: invoice.otherServicesPricePaise / 100,
    commissionRate: rules.commissionRate,
  });
  const gstPaise =
    invoice.gstOnPropertyPaise +
    invoice.gstOnHostiggoServiceFeePaise +
    invoice.breakfastGstPaise +
    invoice.otherServicesGstPaise;
  const yymm = new Date(Date.now() + 330 * 60000).toISOString().slice(2, 7).replace("-", "");

  const { error } = await supabaseAdmin
    .from("bookings")
    .update({
      amount_paise: invoice.grandTotalPaise,
      invoice,
      invoice_number: `HG-${yymm}-${String(booking.booking_id).padStart(6, "0")}`,
      host_payout_paise: payout.netHostPayoutPaise,
      platform_fee_paise: invoice.hostiggoServiceFeePaise + payout.commissionPaise,
      gst_collected_paise: gstPaise,
      paid_at: new Date().toISOString(),
    })
    .eq("booking_id", booking.booking_id);
  if (error) throw error;

  await recordPaymentAndPayout(booking.booking_id, invoice, payout, gstPaise);
}

async function nextId(table: string, column: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number((data as any)?.[column] ?? 0) + 1;
}

/**
 * Writes the payment ledger row and the host's payouts/payout_items rows for
 * a paid booking, so payment and payout history exist as rows (the mobile
 * app and the host dashboard both read them). Idempotent: skips whatever
 * already exists for this booking. The payout starts 'processing' and is
 * moved to 'credited'/'failed' by the transfer/settlement webhooks.
 */
async function recordPaymentAndPayout(
  bookingId: number,
  invoice: Awaited<ReturnType<typeof validateAndPriceBooking>>["invoice"],
  payout: { commissionPaise: number; netHostPayoutPaise: number },
  gstPaise: number,
) {
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("host_uuid")
    .eq("booking_id", bookingId)
    .maybeSingle();

  const { data: existingPayment } = await supabaseAdmin
    .from("payment")
    .select("payment_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!existingPayment) {
    const { data: gateway } = await supabaseAdmin
      .from("payment_gateways")
      .select("payment_gatway_id")
      .ilike("name", "razorpay")
      .maybeSingle();
    const { error } = await supabaseAdmin.from("payment").insert({
      payment_id: await nextId("payment", "payment_id"),
      booking_id: bookingId,
      amount: invoice.grandTotalPaise / 100,
      comission: (invoice.hostiggoServiceFeePaise + payout.commissionPaise) / 100,
      host_payout: payout.netHostPayoutPaise / 100,
      gst_amount: gstPaise / 100,
      payment_gatway_id: gateway?.payment_gatway_id ?? null,
    });
    if (error) console.error(`[recordPaymentAndPayout] payment insert failed for ${bookingId}:`, error);
  }

  if (!booking?.host_uuid) return;
  const { data: existingItem } = await supabaseAdmin
    .from("payout_items")
    .select("payout_item_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existingItem) return;

  const { data: payoutRow, error: payoutErr } = await supabaseAdmin
    .from("payouts")
    .insert({
      host_id: booking.host_uuid,
      total_amount: payout.netHostPayoutPaise / 100,
      reference_id: `booking-${bookingId}`,
    })
    .select("payout_id")
    .single();
  if (payoutErr || !payoutRow) {
    console.error(`[recordPaymentAndPayout] payouts insert failed for ${bookingId}:`, payoutErr);
    return;
  }
  const { error: itemErr } = await supabaseAdmin.from("payout_items").insert({
    payout_id: payoutRow.payout_id,
    booking_id: bookingId,
    host_amount: payout.netHostPayoutPaise / 100,
    commission: payout.commissionPaise / 100,
    gst: gstPaise / 100,
  });
  if (itemErr) console.error(`[recordPaymentAndPayout] payout_items insert failed for ${bookingId}:`, itemErr);
}

/** Moves a booking's payouts row to a new status (processing | credited | failed). */
export async function setPayoutStatusForBooking(
  bookingId: number,
  status: "processing" | "credited" | "failed",
  referenceId?: string | null,
) {
  const { data: item } = await supabaseAdmin
    .from("payout_items")
    .select("payout_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!item?.payout_id) return;
  await supabaseAdmin
    .from("payouts")
    .update({ status, ...(referenceId ? { reference_id: referenceId } : {}) })
    .eq("payout_id", item.payout_id);
}

async function notifyBookingConfirmed(
  booking: {
    booking_id: number;
    user_id: string;
    host_uuid: string;
    listing_id: number;
    start_date: string;
    end_date: string;
    num_adults?: number | null;
    num_children?: number | null;
  },
  grandTotalPaise: number,
  paymentReceived: boolean,
) {
  console.log(`[notifyBookingConfirmed] Starting notifications for booking ${booking.booking_id}`);
  
  const { notify, notifyWhatsApp, hostUserId, resolveUserPhone } = await import("./notifications");
  const { data: listing } = await supabaseAdmin
    .from("listings")
    .select("title")
    .eq("listing_id", booking.listing_id)
    .maybeSingle();
  const title = listing?.title ?? "your stay";
  // Same keys the DB booking trigger writes, so notify() can merge into its row.
  const metadata = {
    booking_id: booking.booking_id,
    listing_id: booking.listing_id,
    property_id: booking.listing_id,
    start_date: booking.start_date,
    end_date: booking.end_date,
  };
  const paymentText = paymentReceived
    ? ` Paid ${formatINR((grandTotalPaise / 100))}.`
    : " Payment is currently disabled.";
  const guestCount = String((booking.num_adults ?? 0) + (booking.num_children ?? 0));
  const formatBookingDate = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const checkIn = formatBookingDate(booking.start_date);
  const checkOut = formatBookingDate(booking.end_date);
  const { data: guest } = await supabaseAdmin
    .from("users")
    .select("name, phone")
    .eq("user_id", booking.user_id)
    .maybeSingle();
  
  console.log(`[notifyBookingConfirmed] Guest data:`, { name: guest?.name, phone: guest?.phone });
  
  const guestPhone = await resolveUserPhone(booking.user_id, guest?.phone);
  
  console.log(`[notifyBookingConfirmed] Resolved guest phone: ${guestPhone}`);
  
  await notify({
    userId: booking.user_id,
    type: "booking_guest",
    category: "bookings",
    templateId: "booking_confirmed_guest",
    title: "Booking confirmed",
    message: `Your booking at ${title} (${checkIn} to ${checkOut}) is confirmed.${paymentText}`,
    metadata: { ...metadata, role: "guest" },
  });
  
  const { emailUser } = await import("./email");
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.hostiggo.com").replace(/\/+$/, "");
  await emailUser(booking.user_id, {
    subject: `Booking confirmed: ${title}`,
    heading: "Your booking is confirmed",
    lines: [
      `${title}`,
      `Check-in ${checkIn} · Check-out ${checkOut} · ${guestCount} guest(s)`,
      paymentReceived ? `Total paid: ${formatINR(grandTotalPaise / 100)}.` : "No payment was taken for this booking.",
      `Booking reference: #${booking.booking_id}`,
    ],
    cta: { label: "View booking & receipt", url: `${site}/booking-confirmation/${booking.booking_id}` },
  }).catch((err) => console.error("[notifyBookingConfirmed] guest email failed:", err));

  console.log(`[notifyBookingConfirmed] Sending guest WhatsApp notification`);
  
  await notifyWhatsApp({
    userId: booking.user_id,
    to: guestPhone,
    template: "booking_confirmation_guest",
    category: "bookings",
    variables: {
      "1": guest?.name ?? "Guest",
      "2": title,
      "3": checkIn,
      "4": checkOut,
      "5": guestCount,
      "6": String(booking.booking_id),
    },
  });
  
  const hostUser = await hostUserId(booking.host_uuid);
  console.log(`[notifyBookingConfirmed] Resolved host user_id: ${hostUser}`);
  
  if (hostUser) {
    const { data: host } = await supabaseAdmin
      .from("users")
      .select("name, phone")
      .eq("user_id", hostUser)
      .maybeSingle();
    
    console.log(`[notifyBookingConfirmed] Host data:`, { name: host?.name, phone: host?.phone });
    
    const hostPhone = await resolveUserPhone(hostUser, host?.phone);
    
    console.log(`[notifyBookingConfirmed] Resolved host phone: ${hostPhone}`);
    
    await notify({
      userId: hostUser,
      type: "booking_host",
      category: "bookings",
      templateId: "booking_received_host",
      title: "New booking",
      message: `${title} was booked for ${checkIn} to ${checkOut} by ${guest?.name ?? "a guest"}.`,
      metadata: { ...metadata, role: "host" },
    });
    
    await emailUser(hostUser, {
      subject: `New booking: ${title}`,
      heading: "You have a new booking",
      lines: [
        `${title} was booked by ${guest?.name ?? "a guest"}.`,
        `Check-in ${checkIn} · Check-out ${checkOut} · ${guestCount} guest(s)`,
        `Booking reference: #${booking.booking_id}`,
      ],
      cta: { label: "View booking", url: `${site}/host/bookings` },
    }).catch((err) => console.error("[notifyBookingConfirmed] host email failed:", err));

    console.log(`[notifyBookingConfirmed] Sending host WhatsApp notification`);
    
    await notifyWhatsApp({
      userId: hostUser,
      to: hostPhone,
      template: "booking_received_host",
      category: "bookings",
      variables: {
        "1": host?.name ?? "Host",
        "2": title,
        "3": guest?.name ?? "Guest",
        "4": checkIn,
        "5": checkOut,
        "6": guestCount,
        "7": String(booking.booking_id),
      },
    });
  }
  
  console.log(`[notifyBookingConfirmed] Completed notifications for booking ${booking.booking_id}`);
}

async function createHostTransferForBooking(
  booking: { booking_id: number; host_uuid: string },
  priced: Awaited<ReturnType<typeof validateAndPriceBooking>>,
  paymentId: string,
) {
  const { data: payout, error: payoutError } = await supabaseAdmin
    .from("host_payout_methods")
    .select("razorpay_account_id, status")
    .eq("host_uuid", booking.host_uuid)
    .maybeSingle();
  if (payoutError) throw payoutError;

  // No Route account yet (host hasn't finished onboarding) -- nothing to
  // transfer to. Leave transfer_status null so this booking is easy to find
  // once the host does onboard, rather than flagging every booking made
  // before a host's first Route setup as an error.
  if (!payout?.razorpay_account_id) return;

  const { calculateHostPayout } = await import("../billing/payout");
  const { createTransferForPayment } = await import("../billing/razorpayRoute");
  const { payoutReleaseMoment } = await import("../billing/policyTimeline");

  // The host's share is held until 24h after check-in, so cancelling or a
  // failed stay never has to claw money back from an already-settled host.
  const { data: bookingRow } = await supabaseAdmin
    .from("bookings")
    .select("start_date, listings(check_in_time)")
    .eq("booking_id", booking.booking_id)
    .maybeSingle();
  const onHoldUntil = bookingRow
    ? payoutReleaseMoment(bookingRow.start_date, (bookingRow as any).listings?.check_in_time)
    : null;

  const { getPricingRules } = await import("./pricingRules");
  const { invoice } = priced;
  const hostPayout = calculateHostPayout({
    propertyPrice: invoice.propertyPricePaise / 100,
    breakfastPrice: invoice.breakfastPricePaise / 100,
    otherServicesPrice: invoice.otherServicesPricePaise / 100,
    commissionRate: (await getPricingRules()).commissionRate,
  });

  try {
    const result = await createTransferForPayment(paymentId, {
      linkedAccountId: payout.razorpay_account_id,
      amountPaise: hostPayout.netHostPayoutPaise,
      notes: { bookingId: String(booking.booking_id) },
      onHoldUntil,
      idempotencyKey: `transfer:${booking.booking_id}`,
    });
    const transferId = result.items?.[0]?.id ?? null;
    await supabaseAdmin
      .from("bookings")
      .update({ razorpay_transfer_id: transferId, transfer_status: "created" })
      .eq("booking_id", booking.booking_id);
  } catch (err) {
    await supabaseAdmin
      .from("bookings")
      .update({ transfer_status: "failed" })
      .eq("booking_id", booking.booking_id);
    await setPayoutStatusForBooking(booking.booking_id, "failed").catch(() => {});
    await supabaseAdmin.from("manual_settlement_flags").insert({
      booking_id: booking.booking_id,
      reason: `Route transfer failed: ${err instanceof Error ? err.message : "unknown error"}`,
    });
    throw err;
  }
}

function eachDateInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur < end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ── Booking cancellation ─────────────────────────────────────────────────────
// ── Reviews ──────────────────────────────────────────────────────────────────
export class ReviewNotAllowedError extends Error {}

export async function createReview(input: {
  listingId: number;
  userId: string;
  rating: number;
  comment?: string | null;
}) {
  // Only verified guests review: a confirmed stay at this listing that has
  // ended, and at most one review per completed stay -- so ratings can't be
  // stuffed by the host's friends or by one guest reviewing repeatedly.
  const today = todayInIndia();
  const { count: completedStays, error: eligErr } = await supabaseAdmin
    .from("bookings")
    .select("booking_id", { count: "exact", head: true })
    .eq("listing_id", input.listingId)
    .eq("user_id", input.userId)
    .eq("status_id", 2) // CONFIRMED
    .lte("end_date", today); // checked out
  if (eligErr) throw eligErr;
  if (!completedStays) {
    throw new ReviewNotAllowedError("You can review a stay once you've checked out.");
  }
  const { count: existingReviews, error: countErr } = await supabaseAdmin
    .from("review")
    .select("review_id", { count: "exact", head: true })
    .eq("listing_id", input.listingId)
    .eq("user_id", input.userId);
  if (countErr) throw countErr;
  if ((existingReviews ?? 0) >= completedStays) {
    throw new ReviewNotAllowedError("You've already reviewed this stay.");
  }

  const { data, error } = await supabaseAdmin
    .from("review")
    .insert({
      listing_id: input.listingId,
      user_id: input.userId,
      rating: input.rating,
      comment: input.comment ?? null,
      reviewd_at: new Date().toISOString(), // note: column is misspelled in schema
    })
    .select("review_id, listing_id, rating, comment")
    .single();
  if (error) throw error;
  return data;
}

// ── Feedback ─────────────────────────────────────────────────────────────────
export async function createFeedback(input: {
  userId?: string | null;
  type: string;
  description: string;
  category?: string | null;
  rating?: number | null;
  comment?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("feedback")
    .insert({
      user_id: input.userId ?? null,
      type: input.type,
      description: input.description,
      category: input.category ?? null,
      rating: input.rating ?? null,
      comment: input.comment ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Listings (create from wizard draft) ──────────────────────────────────────
export type ListingDraft = {
  userId: string;
  title?: string;
  description?: string;
  propertyType?: string;
  priceWeekday?: number;
  priceWeekend?: number;
  numGuests?: number;
  numBedrooms?: number;
  numBeds?: number;
  numBathrooms?: number;
  amenityIds?: number[];
  addonSelections?: { addon_id: number; price: number; includes: string }[];
  discounts?: { discount_type: string; percent: number; enabled: boolean }[];
  houseRules?: {
    check_in_time?: string;
    check_out_time?: string;
    smoking_allowed?: boolean;
    pets_allowed?: boolean;
    parties_allowed?: boolean;
    quiet_hours?: boolean;
  };
  photoUrls?: string[];
  // Index into photoUrls of the host's chosen cover. Falls back to the first
  // photo when omitted (Rule A). Lets any path that supplies photos not
  // cover-first (imports, admin tools) still land the right cover.
  coverIndex?: number;
  checkInTime?: string;
  checkOutTime?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  locationId?: number;
  // Structured location. When locationId is absent, createListing
  // find-or-creates a canonical `locations` row from these so location_id is
  // never left null (that's what leaves a listing showing "Unknown" and
  // invisible to location-based search).
  city?: string;
  state?: string;
  postalCode?: string;
  currency?: string;
  latitude?: number;
  longitude?: number;
  cancellationPolicy?: "flexible" | "moderate" | "strict";
  strictPartialRefundPercent?: number;
};

// Canonical dedup key for a location: diacritic-, case- and space-insensitive
// (so "Haryāna" === "haryana", "  Dehradun " === "dehradun").
const locationKey = (state?: string | null, district?: string | null) => {
  const n = (s: string | null | undefined) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return `${n(state)}|${n(district)}`;
};

// Find an existing `locations` row matching (state, city) or create one.
// Returns the location_id, or null when state/city are missing.
export async function resolveLocationId(
  state?: string | null,
  city?: string | null,
  postalCode?: string | null,
): Promise<number | null> {
  if (!state?.trim() || !city?.trim()) return null;
  // File old city names under their current one ("Gurgaon" -> "Gurugram").
  city = canonicalPlaceName(city);
  const wanted = locationKey(state, city);

  const { data: rows, error } = await supabaseAdmin
    .from("locations")
    .select("location_id, state, district");
  if (error) {
    console.error("[resolveLocationId] lookup failed:", error.message);
    return null;
  }
  const match = (rows ?? []).find(
    (l) => locationKey(l.state, l.district) === wanted,
  );
  if (match) return match.location_id;

  const pincode = postalCode && /^\d+$/.test(postalCode.trim()) ? Number(postalCode.trim()) : null;
  const { data: created, error: cErr } = await supabaseAdmin
    .from("locations")
    .insert({
      state: state.trim(),
      district: city,
      lower_division_name: city,
      lower_division_type: "city",
      pincode,
    })
    .select("location_id")
    .single();
  if (cErr) {
    console.error("[resolveLocationId] create failed:", cErr.message);
    return null;
  }
  return created.location_id;
}

export async function createListing(draft: ListingDraft) {
  // Ensure the user has a host profile (auto-create if needed)
  const hostUuid = await ensureHostProfile(draft.userId);

  // A listing only goes live once the host can actually be paid: verified PAN,
  // verified bank account, then a created payout account. Until then it is
  // saved as a (hidden) draft and the host publishes it from Listings.
  const readiness = await getHostPayoutReadiness(draft.userId);

  const now = new Date().toISOString();
  const row: Record<string, any> = {
    title: draft.title?.trim() || "Untitled listing",
    description: draft.description?.trim() || "", // column is NOT NULL

    price_weekday: draft.priceWeekday ?? 0,
    price_weekend: draft.priceWeekend ?? draft.priceWeekday ?? 0,
    num_guests: draft.numGuests ?? 1,
    num_bedrooms: draft.numBedrooms ?? 1,
    num_beds: draft.numBeds ?? 1,
    num_bathrooms: draft.numBathrooms ?? 1,
    host_uuid: hostUuid,
    is_active: readiness.ready, // hidden until payouts are set up
    check_in_time: draft.checkInTime ?? "14:00:00",
    check_out_time: draft.checkOutTime ?? "11:00:00",
    address_line1: draft.addressLine1 ?? null,
    address_line2: draft.addressLine2 ?? null,
    landmark: draft.landmark ?? null,
    latitude: draft.latitude ?? null,
    longitude: draft.longitude ?? null,
    cancellation_policy: draft.cancellationPolicy ?? "moderate",
    // Only stored for the Strict policy -- null otherwise, so the refund
    // engine's platform-default fallback (50%) applies cleanly rather than
    // a stray value lingering from a listing that later switched away from
    // Strict.
    strict_partial_refund_percent:
      draft.cancellationPolicy === "strict" ? draft.strictPartialRefundPercent ?? null : null,
    created_at: now,
    updated_at: now,
  };
  // Prefer an explicit locationId; otherwise find-or-create from city/state so
  // the listing is never saved without a resolvable location_id.
  const locationId =
    draft.locationId ?? (await resolveLocationId(draft.state, draft.city, draft.postalCode));
  if (locationId) row.location_id = locationId;

  if (draft.propertyType) {
    const { data: propType } = await supabaseAdmin
      .from("property_types")
      .select("id")
      .eq("type_id", draft.propertyType)
      .maybeSingle();
    if (propType) row.property_type_id = propType.id;
  }

  // listings.listing_id is NOT NULL with no default in the schema, so it has
  // to be supplied. Take max+1 and retry on a unique-violation in case two
  // hosts create a listing at the same moment.
  let listing: { listing_id: number; title: string } | null = null;
  let lastError: any = null;
  for (let attempt = 0; attempt < 5 && !listing; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("listings")
      .insert({ ...row, listing_id: (await nextId("listings", "listing_id")) + attempt })
      .select("listing_id, title")
      .single();
    if (!error) {
      listing = data;
    } else if (error.code === "23505") {
      lastError = error;
    } else {
      throw error;
    }
  }
  if (!listing) throw lastError;

  const listingId = listing.listing_id;
  const warnings: string[] = [];

  // Amenities (join rows).
  if (draft.amenityIds?.length) {
    const amenRows = draft.amenityIds.map((amenity_id) => ({ listing_id: listingId, amenity_id }));
    const { error: aerr } = await supabaseAdmin.from("listing_amenities").insert(amenRows);
    if (aerr) {
      console.error("[createListing] amenities insert failed:", aerr.message);
      warnings.push("Your listing was created, but the selected amenities failed to save.");
    }
  }

  // Add-ons picked in the wizard (host can still add/remove/reprice these
  // later from listing settings - this just seeds the initial selection).
  if (draft.addonSelections?.length) {
    const addonRows = draft.addonSelections.map((s) => ({
      listing_id: listingId,
      addon_id: s.addon_id,
      price: s.price ?? 0,
      includes: s.includes ?? "",
    }));
    const { error: addonErr } = await supabaseAdmin.from("listing_addons").insert(addonRows);
    if (addonErr) {
      console.error("[createListing] addons insert failed:", addonErr.message);
      warnings.push("Your listing was created, but the selected add-ons failed to save.");
    }
  }

  // Discounts picked in the wizard's pricing step.
  if (draft.discounts?.length) {
    const discountRows = draft.discounts.map((d) => ({
      listing_id: listingId,
      discount_type: d.discount_type,
      percent: d.percent,
      enabled: d.enabled,
    }));
    const { error: discountErr } = await supabaseAdmin.from("listing_discounts").insert(discountRows);
    if (discountErr) {
      console.error("[createListing] discounts insert failed:", discountErr.message);
      warnings.push("Your listing was created, but the discount settings failed to save.");
    }
  }

  // House rules set in the wizard's rules step (one structured row, not a list).
  if (draft.houseRules) {
    const { error: rulesErr } = await supabaseAdmin.from("listing_house_rules").insert({
      listing_id: listingId,
      ...draft.houseRules,
    });
    if (rulesErr) {
      console.error("[createListing] house rules insert failed:", rulesErr.message);
      warnings.push("Your listing was created, but the house rules failed to save.");
    }
  }

  // Photos (media rows). Persist the host's chosen cover explicitly (Rule A):
  // derive is_cover from coverIndex, falling back to the first photo only when
  // no valid index is supplied -- never leave the cover to array position alone.
  if (draft.photoUrls?.length) {
    const coverIdx =
      draft.coverIndex != null &&
      draft.coverIndex >= 0 &&
      draft.coverIndex < draft.photoUrls.length
        ? draft.coverIndex
        : 0;
    const mediaRows = draft.photoUrls.map((media_url, i) => ({
      listing_id: listingId,
      media_url,
      media_type: "image",
      is_cover: i === coverIdx,
    }));
    const { error: merr } = await supabaseAdmin.from("listing_media").insert(mediaRows);
    if (merr) {
      console.error("[createListing] media insert failed:", merr.message);
      warnings.push("Your listing was created, but the photos failed to save.");
    }
  }

  return {
    listing_id: listingId,
    title: listing.title,
    warnings,
    live: readiness.ready,
    payoutBlockers: readiness.blockers,
  };
}

// ── Cover photo ──────────────────────────────────────────────────────────────
// Rule B (single source of truth): clear the listing's existing cover(s), then
// flag the chosen media row -- so there is always exactly one is_cover per
// listing. Scoped to the listing so a stale or foreign mediaId can never flip
// another listing's cover.
export async function setCoverPhoto(listingId: number, mediaId: string) {
  // Confirm the target photo actually belongs to this listing before writing.
  const { data: target, error: findErr } = await supabaseAdmin
    .from("listing_media")
    .select("id")
    .eq("listing_id", listingId)
    .eq("id", mediaId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (!target) throw new Error("Photo not found for this listing");

  // Clear the current cover(s) for the listing.
  const { error: clearErr } = await supabaseAdmin
    .from("listing_media")
    .update({ is_cover: false })
    .eq("listing_id", listingId)
    .eq("is_cover", true);
  if (clearErr) throw clearErr;

  // Flag the chosen row as the new cover.
  const { error: setErr } = await supabaseAdmin
    .from("listing_media")
    .update({ is_cover: true })
    .eq("id", mediaId);
  if (setErr) throw setErr;

  return { success: true };
}

// ── User profile ─────────────────────────────────────────────────────────────
export async function updateUserProfile(
  userId: string,
  patch: Partial<{
    name: string;
    email: string;
    phone: string;
    age: number;
    emergency_contact: string;
    profile_pic_url: string;
    email_notifications: boolean;
    sms_alerts: boolean;
    promo_notifications: boolean;
    host_message_notifications: boolean;
    show_profile_to_hosts: boolean;
    include_in_search: boolean;
    activity_status: boolean;
  }>,
) {
  // Runtime allowlist -- the Partial<> type above only constrains TS callers,
  // but the /api/users PATCH route forwards client JSON straight in, so
  // without this any users-table column (is_verified, is_active, ...) could
  // be written by name.
  const ALLOWED_PROFILE_FIELDS = new Set([
    "name",
    "email",
    "phone",
    "age",
    "emergency_contact",
    "profile_pic_url",
    "email_notifications",
    "sms_alerts",
    "promo_notifications",
    "host_message_notifications",
    "show_profile_to_hosts",
    "include_in_search",
    "activity_status",
  ]);
  const clean: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_PROFILE_FIELDS.has(k)) continue;
    // Explicit null/"" must persist (e.g. clearing emergency_contact) --
    // only an actually-omitted key should be left untouched.
    clean[k] = v === "" ? null : v;
  }
  // select("*") rather than an explicit column list: the preference columns
  // below are added by a migration the operator applies separately (see
  // supabase/migrations), and an explicit list of not-yet-existing columns
  // would break this RETURNING clause -- and therefore every profile save,
  // including unrelated name/email/phone edits -- until that migration runs.
  const { data, error } = await supabaseAdmin
    .from("users")
    .update(clean)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// Deliberately its own function rather than another key in updateUserProfile's
// allowlist: is_active also gates login (see /api/auth/otp and
// /auth/callback), so letting it in through the generic profile-patch path
// would let any caller of that endpoint flip it. This is the only write path
// for it.
export async function deactivateUserAccount(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;

  // Ban at the Supabase Auth layer too, not just our own users.is_active
  // check: GoTrue rejects sign-in for a banned user outright (phone OTP,
  // email OTP, and Google OAuth all route through it), so this blocks new
  // logins even before our own app-level check runs. It doesn't kill an
  // *already-issued* access token (those simply expire on their normal TTL,
  // typically an hour) -- there's no per-user "revoke all sessions" call in
  // this GoTrue Admin API version. A ~100-year ban_duration is Supabase's own
  // idiom for "indefinite"; support can lift it by setting ban_duration back
  // to 'none' if the user asks to reactivate.
  const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (banError) {
    console.error("[deactivateUserAccount] failed to ban auth user:", banError);
  }

  return data;
}
