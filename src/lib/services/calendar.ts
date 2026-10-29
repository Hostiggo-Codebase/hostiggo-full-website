// Server-only (used by /api routes); anon has no privileges on bookings.
import { supabaseAdmin as supabase } from "../supabase-admin";
import { SCHEMA } from "../schema.constants";

const DB_SCHEMA = SCHEMA.testingSchema;
const CALENDAR_TABLE = SCHEMA.tables.listingCalendar.tableName;
const CAL_COLS = SCHEMA.tables.listingCalendar.columns;

export interface CalendarEntryRow {
  calendar_id: number;
  listing_id: number;
  date: string;
  price: number;
  currency: string;
  is_available: boolean;
}

export interface BookingWithGuestRow {
  booking_id: number;
  start_date: string;
  end_date: string;
  status_id: number;
  amount: number;
  guest: { name: string } | null;
}

// Deliberately excludes amount/user_id/host_uuid/guest name so this shape is
// safe to expose to anonymous visitors on the public property-page calendar.
export interface BookedDateRangeRow {
  listing_id: number;
  start_date: string;
  end_date: string;
  status_id: number;
}

export interface CalendarUpsertPayload {
  listing_id: number;
  date: string;
  price: number;
  currency?: string;
  is_available: boolean;
  updated_at?: string;
}

export const calendarServiceAPI = {
  async fetchCalendarEntries(
    listingId: number,
    startDate: string,
    endDate: string,
  ): Promise<CalendarEntryRow[]> {
    const { data, error } = await supabase
      .schema(DB_SCHEMA)
      .from(CALENDAR_TABLE)
      .select(
        `
        ${CAL_COLS.calendarId},
        ${CAL_COLS.listingId},
        ${CAL_COLS.date},
        ${CAL_COLS.price},
        ${CAL_COLS.currency},
        ${CAL_COLS.isAvailable}
      `,
      )
      .eq(CAL_COLS.listingId, listingId)
      .gte(CAL_COLS.date, startDate)
      .lte(CAL_COLS.date, endDate)
      .order(CAL_COLS.date, { ascending: true });

    if (error) {
      console.error("[calendarService] fetchCalendarEntries error:", error);
      throw error;
    }

    return (data ?? []) as CalendarEntryRow[];
  },

  async fetchBookingsForListing(
    listingId: number,
    startDate: string,
    endDate: string,
  ): Promise<BookingWithGuestRow[]> {
    const { data, error } = await supabase
      .schema(DB_SCHEMA)
      .from("bookings")
      .select("booking_id, start_date, end_date, status_id, amount, user_id")
      .eq("listing_id", listingId)
      .or(`start_date.lte.${endDate},end_date.gte.${startDate}`)
      // Confirmed only: an unpaid booking request doesn't occupy the calendar yet.
      .eq("status_id", 2)
      .order("start_date", { ascending: true });

    if (error) {
      console.error("[calendarService] fetchBookingsForListing error:", error);
      throw error;
    }

    if (!data || data.length === 0) return [];

    const userIds = [...new Set(data.map((b: any) => b.user_id).filter(Boolean))];
    const { data: users } = await supabase
      .schema(DB_SCHEMA)
      .from("users")
      .select("user_id, name")
      .in("user_id", userIds);

    const userMap = new Map((users ?? []).map((u: any) => [u.user_id, u.name]));

    return data.map((b: any) => ({
      booking_id: b.booking_id,
      start_date: b.start_date,
      end_date: b.end_date,
      status_id: b.status_id,
      amount: b.amount,
      guest: b.user_id ? { name: userMap.get(b.user_id) || "Guest" } : null,
    }));
  },

  // Public, anon-safe path for the property-page availability calendar.
  // This route runs server-side with the service-role client and selects only
  // date/status fields, so it does not depend on a separately permissioned
  // SECURITY DEFINER RPC and never exposes booking PII.
  async fetchPublicBookedDates(
    listingId: number,
    startDate: string,
    endDate: string,
  ): Promise<BookedDateRangeRow[]> {
    const { data, error } = await supabase
      .schema(DB_SCHEMA)
      .from("bookings")
      .select("listing_id, start_date, end_date, status_id")
      .eq("listing_id", listingId)
      .eq("status_id", 2)
      .lt("start_date", endDate)
      .gt("end_date", startDate)
      .order("start_date", { ascending: true });

    if (error) {
      console.error("[calendarService] fetchPublicBookedDates error:", error);
      throw error;
    }

    return (data ?? []) as BookedDateRangeRow[];
  },

  async upsertCalendarEntry(payload: CalendarUpsertPayload) {
    const { data, error } = await supabase
      .schema(DB_SCHEMA)
      .from(CALENDAR_TABLE)
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
