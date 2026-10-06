import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ICAL_SERVICE_URL = process.env.NEXT_PUBLIC_ICAL_SERVICE_URL || "https://ical-1-of1o.onrender.com";

/**
 * Sync all active iCal feeds for all listings
 * Called by cron endpoint every 15 seconds
 */
export async function syncAllICalFeeds(): Promise<{
  success: number;
  failed: number;
  total: number;
}> {
  console.log("[iCal Sync] Starting sync for all listings...");
  
  try {
    // Get all listings with iCal URLs
    const { data: listings, error } = await supabaseAdmin
      .from("listings")
      .select("listing_id, ical_url, host_uuid")
      .not("ical_url", "is", null)
      .neq("ical_url", "");

    if (error) throw error;

    if (!listings || listings.length === 0) {
      console.log("[iCal Sync] No listings with iCal URLs found");
      return { success: 0, failed: 0, total: 0 };
    }

    console.log(`[iCal Sync] Found ${listings.length} listings to sync`);

    let successCount = 0;
    let failCount = 0;

    // Sync each listing
    await Promise.allSettled(
      listings.map(async (listing) => {
        try {
          await syncListingICalFeed(listing.listing_id, listing.ical_url!);
          successCount++;
        } catch (err) {
          console.error(`[iCal Sync] Failed to sync listing ${listing.listing_id}:`, err);
          failCount++;
        }
      })
    );

    console.log(`[iCal Sync] Completed: ${successCount} success, ${failCount} failed out of ${listings.length}`);

    return {
      success: successCount,
      failed: failCount,
      total: listings.length,
    };
  } catch (err) {
    console.error("[iCal Sync] Error during sync:", err);
    throw err;
  }
}

/**
 * Sync iCal feed for a specific listing
 */
export async function syncListingICalFeed(listingId: number, icalUrl: string): Promise<void> {
  try {
    console.log(`[iCal Sync] Syncing listing ${listingId} from ${icalUrl.substring(0, 50)}...`);

    // Fetch iCal data from the service
    const response = await fetch(`${ICAL_SERVICE_URL}/parse-ical`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icalUrl }),
    });

    if (!response.ok) {
      throw new Error(`iCal service returned ${response.status}`);
    }

    const data = await response.json();
    const events = data.events || [];

    console.log(`[iCal Sync] Found ${events.length} events for listing ${listingId}`);

    // Delete old blocked dates for this listing
    await supabaseAdmin
      .from("blocked_dates")
      .delete()
      .eq("listing_id", listingId)
      .eq("source", "ical");

    // Insert new blocked dates
    if (events.length > 0) {
      const blockedDates = events.map((event: any) => ({
        listing_id: listingId,
        start_date: event.start,
        end_date: event.end,
        source: "ical" as const,
        reason: event.summary || "Blocked via iCal",
      }));

      const { error: insertError } = await supabaseAdmin
        .from("blocked_dates")
        .insert(blockedDates);

      if (insertError) {
        throw insertError;
      }
    }

    // Update last sync timestamp
    await supabaseAdmin
      .from("listings")
      .update({ ical_last_sync: new Date().toISOString() })
      .eq("listing_id", listingId);

    console.log(`[iCal Sync] Successfully synced listing ${listingId}`);
  } catch (err) {
    console.error(`[iCal Sync] Error syncing listing ${listingId}:`, err);
    throw err;
  }
}

/**
 * Sync iCal for specific listing (called from UI)
 */
export async function triggerListingSync(listingId: number): Promise<void> {
  const { data: listing } = await supabaseAdmin
    .from("listings")
    .select("ical_url")
    .eq("listing_id", listingId)
    .single();

  if (!listing?.ical_url) {
    throw new Error("No iCal URL configured for this listing");
  }

  await syncListingICalFeed(listingId, listing.ical_url);
}
