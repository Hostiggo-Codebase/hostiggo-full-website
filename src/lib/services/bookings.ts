// Server-only service (used by /api routes): the anon client has no table
// privileges on bookings, so everything here runs as the service role. Every
// caller scopes by the verified user id (see getAuthenticatedUserId).
import { supabaseAdmin } from "../supabase-admin";
import { todayInIndia } from "../booking-config";
const supabase = supabaseAdmin;

// None of updateBookingStatus/updateBookingDates/updateBookingGuests ever
// checked that the caller actually owns the booking they're modifying,
// only bookingId was required, so any guest could edit or cancel any other
// guest's booking just by knowing (or guessing) its id. Confirmed live:
// a demo guest was able to overwrite booking #46 (belonging to a different
// user) to 99 guests with a plain PATCH request. This throws unless the
// requesting user is the booking's actual owner.
async function assertOwnsBooking(bookingId: string | number, requestingUserId: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select("user_id")
    .eq("booking_id", Number(bookingId))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Booking not found.");
  if (data.user_id !== requestingUserId) {
    throw new Error("You don't have permission to modify this booking.");
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

export const bookingsAPI = {
  async fetchGuestBookings(
    userId: string,
    bookingLabel: "upcoming" | "completed" | "cancelled",
    page: number = 0,
    limit: number = 20,
  ) {
    const from = page * limit;
    const to = from + limit - 1;

    const { data, error } = await supabase
      .from("user_bookings_detailed")
      .select(
        `
        booking_id,
        start_date,
        end_date,
        status_name,
        listing_title,
        cover_photo_url,
        booking_label
      `,
      )
      .eq("user_id", userId)
      .eq("booking_label", bookingLabel)
      .range(from, to)
      .order("start_date", { ascending: bookingLabel === "upcoming" });

    if (error) throw error;
    const rows = data || [];
    if (!rows.length) return rows;

    // user_bookings_detailed has no listing_id/coordinates/location/price at
    // all, so the guest-facing "Location" button had no real place to point
    // to (defaulted to the geographic center of India), and there was no way
    // to show a price breakdown without a second round trip. Fetch the real
    // listing_id + coordinates + district/state + per-night prices + the
    // actual charged amount for these bookings and merge them in.
    const bookingIds = rows.map((r: any) => r.booking_id);
    const { data: withListing } = await supabase
      .from("bookings")
      .select(
        `
        booking_id,
        listing_id,
        amount,
        refund_amount,
        refund_status,
        listings (
          latitude, longitude,
          price_weekday, price_weekend,
          locations (district, state)
        )
      `,
      )
      .in("booking_id", bookingIds);

    const byId = new Map(
      (withListing ?? []).map((r: any) => [r.booking_id, r]),
    );

    return rows.map((r: any) => {
      const extra = byId.get(r.booking_id);
      const listing = extra?.listings;
      return {
        ...r,
        listing_id: extra?.listing_id ?? r.listing_id ?? null,
        amount: extra?.amount ?? null,
        refundAmount: extra?.refund_amount ?? null,
        refundStatus: extra?.refund_status ?? null,
        priceWeekday: listing?.price_weekday ?? null,
        priceWeekend: listing?.price_weekend ?? null,
        latitude: listing?.latitude ?? null,
        longitude: listing?.longitude ?? null,
        district: listing?.locations?.district ?? null,
        state: listing?.locations?.state ?? null,
      };
    });
  },

  async fetchGuestBookingDetail(bookingId: string | number) {
    const { data, error } = await supabase
      .from("user_bookings_detailed")
      .select("*")
      .eq("booking_id", Number(bookingId))
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async createReview(payload: {
    listing_id: number;
    user_id: string;
    rating: number;
    comment?: string | null;
  }) {
    const { data, error } = await supabase
      .from("review")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  },

  async fetchBookings(userId: string) {
    const { data: hostData, error: hostError } = await supabase
      .from("host")
      .select("host_uuid")
      .eq("user_id", userId)
      .single();

    if (hostError || !hostData) {
      console.warn("Could not find host profile for user:", userId, hostError);
      return [];
    }

    const hostUuid = hostData.host_uuid;
    const { data, error } = await supabase
      .from("bookings")
      .select(`*, property:listings(*)`)
      .eq("host_uuid", hostUuid);

    if (error) throw error;
    return data;
  },

  // Single booking for the host detail view. There is no FK from bookings to
  // users in the schema cache, so the guest profile is fetched separately.
  async getBookingDetail(bookingId: string | number, requestingUserId: string) {
    const { data: booking, error } = await supabase
      .from("bookings")
      .select(
        `
        *,
        property:listings (
          listing_id,
          title,
          price_weekday,
          price_weekend,
          currency,
          num_bedrooms,
          num_beds,
          num_bathrooms,
          num_guests,
          check_in_time,
          check_out_time,
          address_line1,
          address_line2,
          landmark,
          latitude,
          longitude,
          cancellation_policy,
          strict_partial_refund_percent,
          locations (state, district),
          listing_media (media_url, is_cover),
          listing_amenities ( amenities ( name ) )
        )
      `,
      )
      .eq("booking_id", Number(bookingId))
      .maybeSingle();

    if (error) throw error;
    if (!booking) return null;

    // This payload includes the guest's name and phone -- only the booking's
    // guest or the host of the booked listing may see it.
    const { data: hostRow, error: hostErr } = await supabase
      .from("host")
      .select("user_id, photo, about, is_verified, verified_at")
      .eq("host_uuid", booking.host_uuid ?? "")
      .maybeSingle();
    if (hostErr) throw hostErr;
    const viewerIsGuest = booking.user_id === requestingUserId;
    if (!viewerIsGuest && hostRow?.user_id !== requestingUserId) {
      throw new Error("You don't have permission to view this booking.");
    }

    let guest = null;
    if (booking.user_id) {
      // Admin client: the authorization check above already confirmed the
      // requester is either the guest or the listing's host, but RLS on
      // `users` still blocks this SELECT under the anon client (no session
      // forwarded server-side), which was silently rendering the guest's
      // profile as blank/"not visible" to hosts.
      const { data: guestRow } = await supabaseAdmin
        .from("users")
        .select("name, phone, profile_pic_url, is_verified, created_at")
        .eq("user_id", booking.user_id)
        .maybeSingle();
      guest = guestRow ?? null;
    }

    // Which add-ons (breakfast/other services) were actually purchased --
    // their price is already folded into `booking.amount`, but without this
    // the confirmation/invoice UI has no way to itemize what that total is
    // made of. No FK in the schema cache to embed this in the select above
    // (same reason `guest` is fetched separately), so a plain query by id.
    const { data: addons } = await supabase
      .from("booking_addons")
      .select("name, price, type")
      .eq("booking_id", Number(bookingId));

    // Host card for the guest. The host's phone is only released once the
    // booking is confirmed (paid) -- until then all contact goes through
    // Hostiggo chat, where contact details are moderated.
    let host = null;
    if (hostRow?.user_id) {
      const { data: hostUser } = await supabaseAdmin
        .from("users")
        .select("name, phone, profile_pic_url, created_at")
        .eq("user_id", hostRow.user_id)
        .maybeSingle();
      host = {
        userId: hostRow.user_id,
        name: hostUser?.name ?? "Your host",
        photo: hostRow.photo || hostUser?.profile_pic_url || null,
        about: hostRow.about ?? null,
        isVerified: hostRow.is_verified === true,
        joinedAt: hostUser?.created_at ?? null,
        phone: viewerIsGuest && booking.status_id === 2 ? hostUser?.phone ?? null : null,
      };
    }

    const listingId = (booking as any).property?.listing_id;
    let houseRules = null;
    if (listingId) {
      const { data: rules } = await supabaseAdmin
        .from("listing_house_rules")
        .select("check_in_time, check_out_time, smoking_allowed, pets_allowed, parties_allowed, quiet_hours")
        .eq("listing_id", listingId)
        .limit(1);
      houseRules = rules?.[0] ?? null;
    }

    return { ...booking, guest, host, houseRules, addons: addons ?? [] };
  },

  async updateBookingDates(
    bookingId: string | number,
    checkIn: string,
    checkOut: string,
    requestingUserId: string,
  ) {
    await assertOwnsBooking(bookingId, requestingUserId);
    const formattedCheckIn = checkIn.split("T")[0];
    const formattedCheckOut = checkOut.split("T")[0];

    const { data: existing, error: fetchErr } = await supabase
      .from("bookings")
      .select("listing_id, start_date, end_date, status_id")
      .eq("booking_id", Number(bookingId))
      .single();
    if (fetchErr) throw fetchErr;

    // Dates are not re-priced, so a change may never add paid-for nights, and
    // only a live, upcoming reservation can move at all (a cancelled booking
    // must not re-block the calendar).
    if (existing.status_id !== 2) {
      throw new Error("Only confirmed bookings can be changed.");
    }
    if (formattedCheckOut <= formattedCheckIn) {
      throw new Error("Check-out must be after check-in.");
    }
    if (formattedCheckIn < todayInIndia()) {
      throw new Error("Check-in cannot be in the past.");
    }
    if (existing.start_date < todayInIndia()) {
      throw new Error("A stay that has already started can't be changed.");
    }
    if (
      eachDateInRange(formattedCheckIn, formattedCheckOut).length >
      eachDateInRange(existing.start_date, existing.end_date).length
    ) {
      throw new Error(
        "You can't extend a booking. Please book the extra nights as a new reservation.",
      );
    }

    // Same conflict checks createBooking runs, otherwise "modify dates"
    // can move a booking onto already-blocked or already-booked nights.
    const { data: blocked, error: blockedErr } = await supabase
      .from("listing_calendar")
      .select("date")
      .eq("listing_id", existing.listing_id)
      .gte("date", formattedCheckIn)
      .lt("date", formattedCheckOut)
      .eq("is_available", false);
    if (blockedErr) throw blockedErr;
    if (blocked && blocked.length > 0) {
      throw new Error("Some of the selected dates are not available.");
    }

    const { data: conflicts, error: conflictsErr } = await supabase
      .from("bookings")
      .select("booking_id")
      .eq("listing_id", existing.listing_id)
      .eq("status_id", 2)
      .neq("booking_id", Number(bookingId))
      .lt("start_date", formattedCheckOut)
      .gt("end_date", formattedCheckIn);
    if (conflictsErr) throw conflictsErr;
    if (conflicts && conflicts.length > 0) {
      throw new Error("These dates are already booked.");
    }

    const { data, error } = await supabase
      .from("bookings")
      .update({ start_date: formattedCheckIn, end_date: formattedCheckOut })
      .eq("booking_id", Number(bookingId))
      .select()
      .single();

    if (error) throw error;

    // Release the old nights and block the new ones so the calendar stays
    // in sync with the booking's actual dates.
    const now = new Date().toISOString();
    const oldNights = eachDateInRange(existing.start_date, existing.end_date);
    if (oldNights.length) {
      await supabase
        .from("listing_calendar")
        .update({ is_available: true, updated_at: now })
        .eq("listing_id", existing.listing_id)
        .in("date", oldNights);
    }
    const newNights = eachDateInRange(formattedCheckIn, formattedCheckOut);
    if (newNights.length) {
      const { data: existingRows } = await supabase
        .from("listing_calendar")
        .select("date")
        .eq("listing_id", existing.listing_id)
        .in("date", newNights);
      const existingDates = new Set((existingRows ?? []).map((r: any) => r.date));
      if (existingRows?.length) {
        await supabase
          .from("listing_calendar")
          .update({ is_available: false, updated_at: now })
          .eq("listing_id", existing.listing_id)
          .in("date", newNights);
      }
      const missing = newNights.filter((d) => !existingDates.has(d));
      if (missing.length) {
        await supabase.from("listing_calendar").insert(
          missing.map((date) => ({
            listing_id: existing.listing_id,
            date,
            is_available: false,
            price: 0,
            currency: "INR",
          })),
        );
      }
    }

    return data;
  },

  async updateBookingGuests(
    bookingId: string | number,
    adults: number,
    children: number,
    _pets: number = 0,
    requestingUserId?: string,
  ) {
    if (!requestingUserId) throw new Error("requestingUserId is required.");
    await assertOwnsBooking(bookingId, requestingUserId);

    const { data: existing, error: fetchErr } = await supabase
      .from("bookings")
      .select("listing_id, listings(num_guests)")
      .eq("booking_id", Number(bookingId))
      .single();
    if (fetchErr) throw fetchErr;

    const maxGuests = Number((existing as any)?.listings?.num_guests ?? 1);
    if (adults + children > maxGuests) {
      throw new Error(`This listing only accommodates up to ${maxGuests} guests.`);
    }

    const { data, error } = await supabase
      .from("bookings")
      .update({
        num_adults: adults,
        num_children: children,
        nom_guests: adults + children,
      })
      .eq("booking_id", Number(bookingId))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async addBookingAddon(bookingId: string, addon: any) {
    const { data, error } = await supabase
      .from("booking_addons")
      .insert([
        {
          booking_id: bookingId,
          name: addon.name,
          price: addon.price,
          type: addon.type,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
