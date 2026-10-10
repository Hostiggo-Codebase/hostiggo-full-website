import type { AmenityItem, Host, Property, Review, SearchFilters } from "@/types";
import { supabase } from "@/lib/supabase";
import { toISODate } from "@/lib/utils";
import type { NotificationRow } from "@/lib/notificationRules";

/** notification_preferences row -- shared with the mobile app. */
export type NotificationPreferences = {
  channels: { in_app: boolean; push: boolean; email: boolean; whatsapp: boolean; sms: boolean };
  categories: { bookings: boolean; account: boolean; marketing: boolean };
};

const FALLBACK_IMAGE = "/placeholder.svg";

export const AUTH_USER_ID_KEY = "hostiggo:user-id";
export const AUTH_PHONE_KEY = "hostiggo:phone";
export const AUTH_EMAIL_KEY = "hostiggo:email";
// Real Supabase session tokens (JWT), returned by /api/auth/otp on verify.
// Sent as a Bearer token on every request so API routes can verify the
// caller's identity server-side instead of trusting a client-claimed userId
// -- see getAuthenticatedUserId() in src/lib/auth-server.ts.
export const AUTH_ACCESS_TOKEN_KEY = "hostiggo:access-token";
export const AUTH_REFRESH_TOKEN_KEY = "hostiggo:refresh-token";

type ApiResult<T> = { data?: T; error?: string; code?: string };

/** An API error that keeps the server's machine-readable `code` (e.g. PAYMENT_REFUNDED). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const getStoredAccessToken = () =>
  typeof window === "undefined" ? null : window.localStorage.getItem(AUTH_ACCESS_TOKEN_KEY);

export const setStoredSession = (accessToken: string, refreshToken?: string | null) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) window.localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
};

export async function getBearerToken(): Promise<string | null> {
  // The authoritative source: whatever Supabase's own client currently
  // considers the live session, refreshed automatically in the background
  // by autoRefreshToken. This works for every sign-in method (Google OAuth,
  // email/phone OTP) with no per-flow wiring -- unlike the
  // separately-tracked AUTH_ACCESS_TOKEN_KEY below, which some sign-in
  // paths (notably the Google OAuth callback) never populate at all, and
  // which none of them keep in sync across a background token refresh.
  // getSession() is a local read (no network call unless a refresh is due),
  // safe to call on every request.
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) return data.session.access_token;
  } catch {
    // fall through to the stored fallback below
  }
  return getStoredAccessToken();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // The Bearer token (and a one-shot refresh + retry on 401) is attached by
  // the /api fetch wrapper installed in src/context/AuthContext.tsx.
  const res = await fetch(path, {
    ...init,
    headers: {
      // FormData (file uploads) needs the browser to set its own multipart boundary.
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await res.json().catch(() => ({}))) as ApiResult<T>;
  if (!res.ok || payload.error) {
    throw new ApiError(payload.error || `Request failed: ${res.status}`, payload.code, res.status);
  }
  return payload.data as T;
}

const first = <T>(value: T | T[] | null | undefined): T | undefined =>
  Array.isArray(value) ? value[0] : value ?? undefined;

const mediaUrls = (row: any): string[] => {
  const media = row?.listing_media ?? row?.media ?? [];
  const urls = Array.isArray(media)
    ? media.map((item: any) => item?.media_url).filter(Boolean)
    : [];
  const cover = row?.cover_image_url || row?.cover_photo_url || row?.image;
  return [...new Set([cover, ...urls].filter(Boolean))];
};

// The listing's own amenities as joined from listing_amenities -> amenities
// (name + the DB's icon key). Empty when the row wasn't fetched with that join.
const joinedAmenities = (row: any): { name: string; icon?: string }[] => {
  const joined = row?.listing_amenities;
  if (!Array.isArray(joined)) return [];

  return joined
    .map((item: any) => {
      const amenity = item?.amenities ?? item?.amenity ?? item;
      return { name: amenity?.name, icon: amenity?.icon || undefined };
    })
    .filter((item: { name?: string }) => Boolean(item.name));
};

const amenityNames = (row: any): string[] => {
  const direct = row?.amenity_names;
  if (Array.isArray(direct)) return direct.filter(Boolean);

  return joinedAmenities(row).map((item) => item.name);
};

const boolFromAmenity = (amenities: string[], needle: string) =>
  amenities.some((item) => item.toLowerCase().includes(needle));

// Prefers the icon stored on the amenities row; only falls back to guessing
// from the name for rows that carry just names (e.g. search RPC results).
const buildAmenityDetails = (row: any, amenities: string[]): AmenityItem[] => {
  const dbIcons = new Map(joinedAmenities(row).map((item) => [item.name, item.icon]));
  return amenities.map((name) => ({
    name,
    icon: dbIcons.get(name) ?? guessAmenityIcon(name),
    available: true,
  }));
};

const guessAmenityIcon = (name: string): string =>
  boolFromAmenity([name], "wifi")
    ? "wifi"
    : boolFromAmenity([name], "parking")
      ? "car"
      : boolFromAmenity([name], "kitchen")
        ? "utensils"
        : boolFromAmenity([name], "air")
          ? "zap"
          : "check";

// Capacity is the sum over the listing's listing_bedrooms rows (guests, beds,
// bathrooms; bedrooms = row count). Listings without those rows (older ones,
// and search RPC rows that don't embed them) fall back to listings.num_* for
// guests/beds/bathrooms, but bedrooms is left undefined (and so not shown)
// because listing_bedrooms is the only source for the bedroom count.
const buildCapacity = (row: any) => {
  const rooms = Array.isArray(row?.listing_bedrooms) ? row.listing_bedrooms : [];
  if (rooms.length > 0) {
    const sum = (key: string) => rooms.reduce((total: number, r: any) => total + Number(r?.[key] ?? 0), 0);
    return {
      guests: sum("max_guests"),
      beds: sum("beds"),
      bedrooms: rooms.length,
      bathrooms: sum("bathrooms"),
    };
  }
  const num = (value: unknown) => (value != null ? Number(value) : undefined);
  return {
    guests: num(row?.num_guests ?? row?.max_guests ?? row?.nom_guests ?? row?.total_guests),
    beds: num(row?.num_beds),
    bedrooms: undefined,
    bathrooms: num(row?.num_bathrooms),
  };
};

const buildReviews = (row: any): Review[] => {
  const reviews = row?.review ?? row?.reviews ?? [];
  if (!Array.isArray(reviews)) return [];

  return reviews.map((review: any) => ({
    id: String(review.review_id ?? review.id ?? crypto.randomUUID()),
    userName: review.users?.name ?? review.user_name ?? "Guest",
    // No stock-photo fallback: a random face next to a real review reads as fake.
    userAvatar: review.user_avatar ?? "",
    rating: Number(review.rating ?? 0),
    reviewText: review.comment ?? review.reviewText ?? "",
    reviewDate: review.reviewed_at ?? review.created_at ?? "",
  }));
};

// The `host` table has no response_rate/response_time/superhost columns at
// all -- those were previously hardcoded (99%, "Within a day", true for
// every host) and displayed as if real. Left undefined here instead so the
// UI can honestly omit them; only is_verified reflects a real column.
const buildHost = (row: any): Host => ({
  id: String(row?.host_uuid ?? row?.host?.id ?? ""),
  name: row?.host?.name ?? "Host",
  avatar: row?.host?.photo ?? row?.host?.avatar ?? "",
  rating: Number(row?.host?.rating ?? 0),
  tripsHosted: Number(row?.host?.tripsHosted ?? 0),
  joinDate: row?.host?.joinDate ?? "",
  responseRate: row?.host?.responseRate != null ? Number(row.host.responseRate) : undefined,
  responseTime: row?.host?.responseTime ?? undefined,
  isSuperhost: Boolean(row?.host?.is_verified),
});

export function mapListingToProperty(input: any): Property {
  const row = input?.listing ?? input ?? {};
  const location = row.locations ?? {};
  const images = mediaUrls(row);
  const amenities = amenityNames(row);
  const reviews = buildReviews(row);
  const capacity = buildCapacity(row);
  // Prefer the live joined reviews over listings.avg_rating/review_count,
  // which are separately materialized columns that createReview never updates
  // and so go stale as soon as a new review is submitted.
  const rating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : Number(row.avg_rating ?? row.rating ?? 0);

  return {
    id: String(row.listing_id ?? row.id ?? ""),
    propertyName: row.title ?? row.propertyName ?? "Untitled stay",
    city: row.district ?? location.district ?? row.city ?? "Unknown",
    state: row.state ?? location.state ?? row.state_name ?? "",
    price: Number(row.price_weekday ?? row.price ?? 0),
    priceWeekend: Number(row.price_weekend ?? row.price_weekday ?? row.price ?? 0),
    rating,
    reviewCount: reviews.length > 0 ? reviews.length : Number(row.review_count ?? 0),
    amenities,
    amenityDetails: buildAmenityDetails(row, amenities),
    propertyType: row.property_type ?? row.propertyType ?? "Homestay",
    images: images.length > 0 ? images : [FALLBACK_IMAGE],
    maxGuests: capacity.guests || 2,
    beds: capacity.beds,
    bedrooms: capacity.bedrooms,
    bathrooms: capacity.bathrooms,
    isFavorite: Boolean(row.isFavorite),
    isNew: Boolean(row.is_new),
    distanceFromCenter:
      typeof input?.distance === "number" ? `${(input.distance / 1000).toFixed(1)} km` : row.distance,
    isInstantBook: row.booking_mode === "auto" || Boolean(row.isInstantBook),
    freeCancellation: Boolean(row.freeCancellation),
    cancellationPolicy: (row.cancellation_policy ?? "moderate") as Property["cancellationPolicy"],
    strictPartialRefundPercent:
      row.strict_partial_refund_percent != null ? Number(row.strict_partial_refund_percent) : undefined,
    breakfast: boolFromAmenity(amenities, "breakfast"),
    parking: boolFromAmenity(amenities, "parking"),
    wifi: boolFromAmenity(amenities, "wifi"),
    ac: boolFromAmenity(amenities, "air") || boolFromAmenity(amenities, "ac"),
    pool: boolFromAmenity(amenities, "pool"),
    kitchen: boolFromAmenity(amenities, "kitchen"),
    balcony: boolFromAmenity(amenities, "balcony"),
    mountainView: boolFromAmenity(amenities, "mountain"),
    bedType: row.room_type ?? row.bed_type ?? "Double bed",
    description: row.description ?? "",
    coordinates:
      row.latitude && row.longitude
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : undefined,
    host: buildHost(row),
    reviews,
    // No per-category (cleanliness/accuracy/communication/location/checkIn/
    // value) rating exists anywhere in the schema, only a single overall
    // `rating` per review, so no ratingBreakdown is fabricated here.
    houseRules: (() => {
      // listing_house_rules is one structured row per listing (booleans +
      // times), not a list of free-text rules, build readable strings
      // from it. Supabase may return it as an object or a 1-item array
      // depending on the relationship hint, so handle both.
      const hr = Array.isArray(row.listing_house_rules)
        ? row.listing_house_rules[0]
        : row.listing_house_rules;
      if (!hr) return undefined;
      const rules: string[] = [];
      rules.push(hr.smoking_allowed ? 'Smoking allowed' : 'No smoking');
      rules.push(hr.pets_allowed ? 'Pets allowed' : 'No pets');
      rules.push(hr.parties_allowed ? 'Parties or events allowed' : 'No parties or events');
      if (hr.quiet_hours) rules.push('Quiet hours enforced (10 PM – 8 AM)');
      if (hr.check_in_time) rules.push(`Check-in from ${String(hr.check_in_time).slice(0, 5)}`);
      if (hr.check_out_time) rules.push(`Check-out before ${String(hr.check_out_time).slice(0, 5)}`);
      return rules;
    })(),
    safetyFeatures: Array.isArray(row.listing_safety_details)
      ? row.listing_safety_details
          .filter((d: any) => d.enabled && d.safety_features)
          .map((d: any) => ({
            name: d.safety_features.name,
            icon: d.safety_features.icon,
            description: d.safety_features.description,
          }))
      : undefined,
    activeDiscount: (() => {
      const active = Array.isArray(row.listing_discounts)
        ? row.listing_discounts.find((d: any) => d.enabled)
        : null;
      return active ? { type: active.discount_type, percent: Number(active.percent ?? 0) } : null;
    })(),
    addons: Array.isArray(row.listing_addons)
      ? row.listing_addons
          .filter((a: any) => a.addons)
          .map((a: any) => ({
            addonId: a.addons.addon_id,
            name: a.addons.name,
            icon: a.addons.icon,
            category: a.addons.category,
            price: Number(a.price ?? 0),
            includes: a.includes ?? "",
            timingFrom: a.timing_from ?? null,
            timingTo: a.timing_to ?? null,
            notes: a.additional_notes ?? null,
          }))
      : undefined,
  };
}

export function mapWishlistListing(item: any) {
  const property = mapListingToProperty(item?.listing ?? item);
  return {
    id: property.id,
    name: property.propertyName,
    location: [property.city, property.state].filter(Boolean).join(", "),
    rating: property.rating,
    reviews: property.reviewCount,
    price: property.price,
    nights: 2,
    image: first(property.images) ?? FALLBACK_IMAGE,
    liked: true,
    group: item?.category_id ?? "all",
  };
}

export function mapBooking(item: any) {
  const checkIn = new Date(item.start_date);
  const checkOut = new Date(item.end_date);
  const status = String(item.booking_label ?? "upcoming").toLowerCase();

  // Only build real coordinates when the listing actually has them, the
  // guest-facing "Location" button previously defaulted to 22.5937,78.9629
  // (the geographic center of India) whenever they were missing, silently
  // sending guests to the wrong place instead of telling them it's unknown.
  const hasCoords = item.latitude != null && item.longitude != null;

  return {
    id: String(item.booking_id),
    listingId: item.listing_id ? String(item.listing_id) : undefined,
    title: item.listing_title ?? "Booked stay",
    image: item.cover_photo_url || FALLBACK_IMAGE,
    location: item.location ?? [item.district, item.state].filter(Boolean).join(", "),
    distanceText:
      item.distanceText ||
      [item.district, item.state].filter(Boolean).join(", ") ||
      "Location unavailable",
    checkIn,
    checkOut,
    status: status === "completed" || status === "cancelled" ? status : "upcoming",
    coordinates: hasCoords
      ? { lat: Number(item.latitude), lng: Number(item.longitude) }
      : null,
    guests: {
      adults: Number(item.num_adults ?? 1),
      children: Number(item.num_children ?? 0),
      rooms: 1,
      pets: false,
    },
    amount: item.amount != null ? Number(item.amount) : null,
    refundAmount: item.refundAmount != null ? Number(item.refundAmount) : null,
    refundStatus: (item.refundStatus ?? null) as string | null,
    priceWeekday: item.priceWeekday != null ? Number(item.priceWeekday) : null,
    priceWeekend: item.priceWeekend != null ? Number(item.priceWeekend) : null,
  };
}

export const getStoredUserId = () =>
  typeof window === "undefined" ? null : window.localStorage.getItem(AUTH_USER_ID_KEY);

export const setStoredUserId = (userId: string) => {
  if (typeof window !== "undefined") window.localStorage.setItem(AUTH_USER_ID_KEY, userId);
};

export const clearStoredAuth = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_USER_ID_KEY);
  window.localStorage.removeItem(AUTH_PHONE_KEY);
  window.localStorage.removeItem(AUTH_EMAIL_KEY);
  window.localStorage.removeItem(AUTH_ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
};

export type CurrentUser = {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  profile_pic_url: string | null;
  is_verified: boolean | null;
  is_active: boolean | null;
  dob: string | null;
  gender: string | null;
  age: number | null;
  emergency_contact: string | null;
  created_at: string | null;
  updated_at: string | null;
  email_notifications: boolean | null;
  sms_alerts: boolean | null;
  promo_notifications: boolean | null;
  host_message_notifications: boolean | null;
  show_profile_to_hosts: boolean | null;
  include_in_search: boolean | null;
  activity_status: boolean | null;
};

export const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isUuid = (value?: string) =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

export const api = {
  notifications: () => request<NotificationRow[]>("/api/notifications"),
  markNotificationsRead: (ids: number[]) =>
    request<{ ok: true }>("/api/notifications", { method: "PATCH", body: JSON.stringify({ ids }) }),
  markAllNotificationsRead: () =>
    request<{ ok: true }>("/api/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) }),
  notificationPreferences: () => request<NotificationPreferences>("/api/notification-preferences"),
  updateNotificationPreferences: (patch: {
    channels?: Partial<NotificationPreferences["channels"]>;
    categories?: Partial<NotificationPreferences["categories"]>;
  }) =>
    request<NotificationPreferences>("/api/notification-preferences", {
      method: "POST",
      body: JSON.stringify(patch),
    }),
  getUser: (userId: string) =>
    request<CurrentUser | null>(`/api/users?userId=${encodeURIComponent(userId)}`),
  hotels: () => request<any[]>("/api/hotels"),
  hotelsByLocation: (locationId: string | number, limit = 4) =>
    request<any[]>(`/api/hotels?locationId=${locationId}&limit=${limit}`),
  hostListings: async (
    userId: string,
    offset: number = 0,
    limit: number = 24,
  ): Promise<{ data: any[]; total: number }> => {
    const res = await fetch(
      `/api/host/listings?userId=${encodeURIComponent(userId)}&offset=${offset}&limit=${limit}`,
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.error) {
      throw new Error(payload.error || `Request failed: ${res.status}`);
    }
    return { data: payload.data ?? [], total: payload.total ?? 0 };
  },
  hostReviews: (userId: string) =>
    request<any[]>(`/api/host/reviews?userId=${encodeURIComponent(userId)}`),
  hostBookings: (userId: string) =>
    request<any[]>(`/api/bookings?role=host&userId=${encodeURIComponent(userId)}`),
  bookingDetail: (id: string, userId: string) =>
    request<any>(
      `/api/bookings/details?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`,
    ),
  hostCalendar: (listingId: string | number, start: string, end: string) =>
    request<{ entries: any[]; bookings: any[] }>(
      `/api/host/calendar?listingId=${encodeURIComponent(String(listingId))}&start=${start}&end=${end}`,
    ),
  updateCalendarDay: (payload: {
    listingId: string | number;
    date: string;
    price?: number;
    isAvailable?: boolean;
    userId: string;
  }) =>
    request<any>(`/api/host/calendar`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  // Opens a Razorpay order for the priced booking -- no booking exists yet.
  // Pass the response into window.Razorpay's checkout, then call
  // confirmBookingPayment() with what its success handler returns.
  reserveBooking: (payload: {
    listingId: string | number;
    userId: string;
    startDate: string;
    endDate: string;
    numAdults?: number;
    numChildren?: number;
    addonIds?: number[];
    // amount is intentionally not accepted here, the server recomputes the
    // real charge from the listing's own prices, see
    // validateAndPriceBooking() in src/lib/services/admin-writes.ts
  }) =>
    request<{
      paymentRequired: true;
      razorpayOrderId: string;
      razorpayKeyId: string;
      amountPaise: number;
      amountRupees: number;
      currency: string;
    }>(`/api/bookings/reserve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // The booking is only actually created here, after the payment signature
  // Razorpay Checkout returns has been verified server-side.
  confirmBookingPayment: (payload: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) =>
    request<any>(`/api/bookings/confirm-payment`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  submitFeedback: (payload: {
    userId?: string | null;
    type: string;
    description: string;
    category?: string | null;
    rating?: number | null;
  }) =>
    request<any>(`/api/feedback`, { method: "POST", body: JSON.stringify(payload) }),
  updateProfile: (userId: string, patch: Record<string, any>) =>
    request<any>(`/api/users`, {
      method: "PATCH",
      body: JSON.stringify({ action: "update-profile", userId, patch }),
    }),
  deactivateAccount: (userId: string) =>
    request<any>(`/api/users`, {
      method: "PATCH",
      body: JSON.stringify({ action: "deactivate-account", userId }),
    }),
  createListing: (draft: Record<string, any>) =>
    request<{
      listing_id: number;
      title: string;
      warnings?: string[];
      live?: boolean;
      payoutBlockers?: Array<"kyc" | "bank" | "payout">;
    }>(`/api/host/listings`, {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  getPayoutMethod: () =>
    request<{
      account_holder_name: string;
      bank_account_number: string; // masked, e.g. "••••1234"
      bank_ifsc: string;
      pan_number: string;
      address_line1: string;
      city: string;
      state: string;
      postal_code: string;
      status: "submitted" | "onboarding" | "active" | "rejected";
      created_at: string;
      updated_at: string;
      bank_name: string | null;
      bank_branch: string | null;
      upi_id: string | null;
      // What SurePass actually confirmed, read back from the database.
      verification: {
        bank: { verified: boolean; holderName: string | null; verifiedAt: string | null };
        pan: { verified: boolean; maskedPan: string | null; name: string | null; verifiedAt: string | null };
      };
    } | null>(`/api/host/payout-methods`),
  // PATCH: send only the fields that changed; each is updated independently.
  // Bank and PAN changes are re-verified with SurePass server-side.
  updatePayoutMethod: (payload: Partial<{
    accountHolderName: string;
    bankAccountNumber: string;
    bankIfsc: string;
    panNumber: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
  }>) =>
    request<{ status: string; updated?: string[]; onboardingError?: string | null }>(`/api/host/payout-methods`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  // Full payment + payout history for the host dashboard. See
  // src/app/api/host/payment-history/route.ts.
  hostPaymentHistory: () =>
    request<import("@/app/api/host/payment-history/route").PaymentHistoryRow[]>(
      `/api/host/payment-history`,
    ),
  // Whether the host may have live listings (PAN + bank verified, payout
  // account created). See src/app/api/host/payout-readiness/route.ts.
  getPayoutReadiness: () =>
    request<{
      ready: boolean;
      blockers: Array<"kyc" | "bank" | "payout">;
      kycVerified: boolean;
      bankVerified: boolean;
      payoutCreated: boolean;
    }>(`/api/host/payout-readiness`),
  // Live Razorpay Route onboarding state for the signed-in host. See
  // src/app/api/host/onboarding-status/route.ts.
  getOnboardingStatus: () =>
    request<{
      status: "none" | "submitted" | "onboarding" | "active" | "rejected";
      activationStatus: string | null;
      requirements: Array<{ field_reference?: string; reason_code?: string }>;
    }>(`/api/host/onboarding-status`),
  // Direct SurePass number-only lookups -- same family as verifyBank below,
  // no document photo. See src/app/api/verify/pan/route.ts.
  // `fullName` is checked server-side against the name on the PAN.
  verifyPan: (idNumber: string, fullName: string) =>
    request<{
      status: "verified" | "rejected" | "pending";
      reason: string | null;
      providerReference: string | null;
    }>(`/api/verify/pan`, {
      method: "POST",
      body: JSON.stringify({ idNumber, fullName }),
    }),
  // Alternatives to PAN for identity (KYC) only -- payouts still need a
  // verified PAN. See src/app/api/verify/aadhaar and /passport.
  verifyAadhaar: (payload: { idNumber: string; fullName: string }) =>
    request<{ status: "verified" | "rejected" | "pending"; reason: string | null }>(
      `/api/verify/aadhaar`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  verifyPassport: (payload: { fileNumber: string; dob: string; fullName: string }) =>
    request<{ status: "verified" | "rejected" | "pending"; reason: string | null }>(
      `/api/verify/passport`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  // "Bank Verification" -- reverse penny-drop lookup keyed on the account
  // number + IFSC; `fullName` is checked against the account holder's name.
  // See src/app/api/verify/bank/route.ts.
  verifyBank: (payload: { accountNumber: string; ifsc: string; fullName: string }) =>
    request<{
      verified: boolean;
      reason?: string | null;
      accountHolderName?: string | null;
      upiId?: string | null;
      bankName?: string | null;
      branch?: string | null;
    }>(`/api/verify/bank`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createReview: (payload: {
    listingId: string | number;
    userId: string;
    rating: number;
    comment?: string;
  }) =>
    request<any>(`/api/reviews`, { method: "POST", body: JSON.stringify(payload) }),
  getReviewEligibility: (listingId: string | number) =>
    request<{ canReview: boolean; reason: string | null }>(
      `/api/reviews?listingId=${encodeURIComponent(String(listingId))}`,
    ),
  uploadPhoto: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/host/upload", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Upload failed");
    }
    const { data } = await response.json();
    return data.url;
  },
  uploadProfilePhoto: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/account/upload-photo", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Upload failed");
    }
    const { data } = await response.json();
    return data.url;
  },
  locations: (limit = 40, q?: string, popular = false) =>
    request<any[]>(
      `/api/locations?limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ""}${popular ? "&popular=1" : ""}`,
    ),
  propertyDetail: (id: string) => request<any>(`/api/hotels/${id}`),
  amenities: () => request<{ amenity_id: number; name: string }[]>("/api/amenities"),
  search: async (
    filters: SearchFilters,
    destination: string,
    page = 0,
    pageSize = 20,
    extra?: {
      startDate?: string | null;
      endDate?: string | null;
      totalGuests?: number;
      amenities?: number[];
      latitude?: number;
      longitude?: number;
    },
  ) => {
    const payload = {
      page,
      pageSize,
      filters: {
        startDate: extra?.startDate ?? null,
        endDate: extra?.endDate ?? null,
        district: destination?.trim() || undefined,
        minPrice: filters.priceMin > 0 ? filters.priceMin : undefined,
        maxPrice: filters.priceMax < 100000 ? filters.priceMax : undefined,
        totalGuests: extra?.totalGuests,
        ratings: filters.guestRating != null ? [filters.guestRating] : [],
        amenities: extra?.amenities ?? ([] as number[]),
        roomTypes: filters.propertyTypes,
        latitude: extra?.latitude ?? null,
        longitude: extra?.longitude ?? null,
      },
    };
    const result = await request<any[]>("/api/search", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return result;
  },
  searchByState: async (
    filters: SearchFilters,
    destination: string,
    cursor: number | null = null,
    pageSize = 50,
    extra?: {
      startDate?: string | null;
      endDate?: string | null;
      totalGuests?: number;
      amenities?: number[];
      // The state of a place picked from the dropdown, so e.g. "Delhi" in Goa
      // and "Delhi" in Delhi aren't confused. Left out for typed text.
      state?: string;
      sort?: string;
    },
  ) => {
    const payload = {
      cursor,
      pageSize,
      // Sorting happens server-side over every match (not just the loaded page).
      sort: extra?.sort ?? "recommended",
      filters: {
        startDate: extra?.startDate ?? null,
        endDate: extra?.endDate ?? null,
        // `destination` is city/district-level free text (the search box and
        // map search collect a place name like "Bhopal"). It is sent as
        // `district`; the server maps it onto the state/district names the
        // locations table really uses (see resolveSearchScopes). `state` is
        // only sent when the user picked a specific place from the dropdown.
        state: extra?.state?.trim() || undefined,
        district: destination?.trim() || undefined,
        minPrice: filters.priceMin > 0 ? filters.priceMin : undefined,
        maxPrice: filters.priceMax < 100000 ? filters.priceMax : undefined,
        totalGuests: extra?.totalGuests,
        ratings: filters.guestRating != null ? [filters.guestRating] : [],
        amenities: extra?.amenities ?? ([] as number[]),
        roomTypes: filters.propertyTypes,
        stayTypes: filters.stayTypes,
        freeCancellation: filters.freeCancellation || undefined,
        breakfast: filters.breakfast || undefined,
        wifi: filters.wifi || undefined,
        parking: filters.parking || undefined,
        ac: filters.ac || undefined,
      },
    };
    // Not routed through request<T>() -- that helper unwraps a `{ data: T }`
    // envelope for every other endpoint, but /api/search's own top-level
    // response IS `{ data, cursor, hasMore, totalCount, stateBounds }`, so
    // request()'s auto-unwrap would strip it down to just the listings array
    // and silently drop cursor/hasMore/totalCount/stateBounds.
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await res.json().catch(() => ({}))) as {
      data: any[];
      cursor: number | null;
      hasMore: boolean;
      totalCount: number | null;
      stateBounds?: any;
      error?: string;
    };
    if (!res.ok || result.error) {
      throw new Error(result.error || `Request failed: ${res.status}`);
    }
    return result;
  },
  sendOtp: (phone: string) =>
    request<any>("/api/auth/otp", {
      method: "POST",
      body: JSON.stringify({ action: "send", phone: normalizePhone(phone) }),
    }),
  sendEmailOtp: async (email: string) => {
    const { data, error } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(email),
      // Code-only login: the 6-digit code comes from {{ .Token }} in the Supabase
      // email templates (see supabase/templates/README.md). No emailRedirectTo --
      // that is only for link emails, and passing one invites the link flow.
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
    return data;
  },
  verifyOtp: async (params: { phone?: string; email?: string; token: string }) => {
    if (params.email) {
      const email = normalizeEmail(params.email);
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: params.token,
        type: "email",
      });
      if (error) throw error;

      const user = data.user;
      if (!user) return data;

      // The app's own stored token isn't written until the caller calls
      // setStoredSession() after this returns, so pass the fresh session's
      // token explicitly -- /api/users requires a verified bearer token.
      const profile = await request<CurrentUser>("/api/users", {
        method: "POST",
        headers: data.session?.access_token
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : undefined,
        body: JSON.stringify({
          user_id: user.id,
          name: user.user_metadata?.full_name || user.user_metadata?.name || "",
          email: user.email || user.user_metadata?.email || email,
          phone: user.phone || null,
          age: user.user_metadata?.age || null,
          emergency_contact: user.user_metadata?.emergency_contact || null,
          is_verified: false,
          is_active: true,
        }),
      });

      // Best-effort -- this session was established directly against
      // Supabase Auth client-side, not through one of our own server
      // routes, so there's no single server-side place that otherwise logs
      // it. See /api/auth/log-login.
      request("/api/auth/log-login", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, method: "email_otp" }),
      }).catch(() => {});

      return { user, session: data.session, profile };
    }

    return request<any>("/api/auth/otp", {
      method: "POST",
      body: JSON.stringify({
        action: "verify",
        ...(params.phone ? { phone: normalizePhone(params.phone) } : {}),
        token: params.token,
        type: "sms",
      }),
    });
  },
  loginEvents: (userId: string) =>
    request<
      { id: number; method: string; ip_address: string | null; user_agent: string | null; created_at: string }[]
    >(`/api/auth/login-events?userId=${encodeURIComponent(userId)}`),
  addWishlistItem: (userId: string, listingId: string, categoryId?: string) =>
    request<any>("/api/wishlist", {
      method: "POST",
      body: JSON.stringify({
        action: "add",
        user_id: userId,
        listing_id: String(listingId),
        ...(isUuid(categoryId) ? { category_id: categoryId } : {}),
      }),
    }),
  wishlistIds: (userId: string) =>
    request<{ listing_id: string }[]>(
      `/api/wishlist?resource=ids&userId=${encodeURIComponent(userId)}`,
    ),
  wishlistCategoriesForListing: (userId: string, listingId: string | number) =>
    request<string[]>(
      `/api/wishlist?resource=listing-categories&userId=${encodeURIComponent(userId)}&listingId=${encodeURIComponent(String(listingId))}`,
    ),
  wishlistCategories: (userId: string) =>
    request<{ id: string; name: string }[]>(
      `/api/wishlist?resource=categories&userId=${encodeURIComponent(userId)}`,
    ),
  wishlistListings: (userId: string, categoryId?: string) =>
    request<any[]>(
      `/api/wishlist?resource=listings&userId=${encodeURIComponent(userId)}${
        isUuid(categoryId) ? `&categoryId=${encodeURIComponent(categoryId as string)}` : ""
      }`,
    ),
  createWishlistCategory: (userId: string, name: string) =>
    request<any>("/api/wishlist", {
      method: "POST",
      body: JSON.stringify({ action: "create-category", user_id: userId, name }),
    }),
  renameWishlistCategory: (categoryId: string, name: string, userId: string) =>
    request<any>("/api/wishlist", {
      method: "PATCH",
      body: JSON.stringify({ categoryId, name, userId }),
    }),
  deleteWishlistCategory: (categoryId: string, userId: string) =>
    request<boolean>("/api/wishlist", {
      method: "DELETE",
      body: JSON.stringify({ categoryId, userId }),
    }),
  removeWishlistItem: (userId: string, listingId: string, categoryId?: string) =>
    request<boolean>("/api/wishlist", {
      method: "DELETE",
      body: JSON.stringify({ userId, listingId, categoryId }),
    }),
  guestBookings: (userId: string, label: "upcoming" | "completed" | "cancelled") =>
    request<any[]>(
      `/api/bookings?role=guest&userId=${encodeURIComponent(userId)}&label=${label}&limit=50`,
    ),
  updateBookingDates: (bookingId: string, checkIn: Date, checkOut: Date, userId: string) =>
    request<any>("/api/bookings", {
      method: "PATCH",
      body: JSON.stringify({
        action: "dates",
        bookingId,
        userId,
        checkIn: toISODate(checkIn),
        checkOut: toISODate(checkOut),
      }),
    }),
  updateBookingGuests: (
    bookingId: string,
    guests: { adults: number; children: number; pets?: number },
    userId: string,
  ) =>
    request<any>("/api/bookings", {
      method: "PATCH",
      body: JSON.stringify({
        action: "guests",
        bookingId,
        userId,
        adults: guests.adults,
        children: guests.children,
        pets: guests.pets ?? 0,
      }),
    }),
  getRefundPreview: (bookingId: string | number, userId: string) =>
    request<any>(
      `/api/bookings/refund-preview?bookingId=${encodeURIComponent(String(bookingId))}&userId=${encodeURIComponent(userId)}`,
    ),
  cancelBookingWithRefund: (bookingId: string | number, userId: string, reason?: string) =>
    request<any>("/api/bookings/cancel-with-refund", {
      method: "POST",
      body: JSON.stringify({ bookingId, userId, reason }),
    }),
  // Re-attempts a refund that failed when the booking was cancelled.
  retryRefund: (bookingId: string | number) =>
    request<any>("/api/bookings/cancel-with-refund", {
      method: "POST",
      body: JSON.stringify({ bookingId, action: "retry-refund" }),
    }),
  // iCal integration
  registerICalFeed: (payload: { listingId: string | number; icalUrl: string; action: "add" | "update" | "deactivate"; userId: string }) =>
    request<any>("/api/host/calendar/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getICalStatus: (listingId: string | number, userId: string) =>
    request<any>(
      `/api/host/calendar/status?listingId=${encodeURIComponent(String(listingId))}&userId=${encodeURIComponent(userId)}`,
    ),
};
