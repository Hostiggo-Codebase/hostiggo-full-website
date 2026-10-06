/**
 * iCal Sync Service Client
 * Integrates with the external iCal microservice to sync calendar feeds from Airbnb, Google Calendar, Booking.com, etc.
 * Service URL: https://ical-production.up.railway.app
 */

export interface ICalRegisterPayload {
  listingId: string | number;
  icalUrl: string;
  action: "add" | "update" | "deactivate";
}

export interface ICalRegisterResponse {
  status: string;
  slotOffsetS: number;
}

const SERVICE_URL = (
  process.env.NEXT_PUBLIC_ICAL_SERVICE_URL || "https://ical-production.up.railway.app"
).replace(/\/+$/, "");

/**
 * Register or update a listing's iCal feed
 * @param listingId - The listing ID in Hostiggo
 * @param icalUrl - The iCal URL to sync (e.g., from Airbnb, Google Calendar, Booking.com)
 * @param action - "add" (register new), "update" (change URL), or "deactivate" (stop syncing)
 */
export async function registerListing(
  listingId: string | number,
  icalUrl: string,
  action: "add" | "update" | "deactivate" = "add",
): Promise<ICalRegisterResponse> {
  try {
    const payload: ICalRegisterPayload = {
      listingId: String(listingId),
      icalUrl,
      action,
    };

    const response = await fetch(`${SERVICE_URL}/sync/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`iCal registration failed: ${error || response.statusText}`);
    }

    const data = (await response.json()) as ICalRegisterResponse;
    return data;
  } catch (error) {
    console.error("[iCal] Registration failed:", error);
    throw error;
  }
}

/**
 * Deactivate a listing's iCal sync
 * @param listingId - The listing ID in Hostiggo
 */
export async function deactivateListing(listingId: string | number): Promise<void> {
  try {
    await registerListing(listingId, "", "deactivate");
  } catch (error) {
    console.error("[iCal] Deactivation failed:", error);
    throw error;
  }
}

