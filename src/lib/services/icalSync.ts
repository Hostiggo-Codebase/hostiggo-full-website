import "server-only";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { todayInIndia } from "@/lib/booking-config";
import { parseBlockedDates } from "@/lib/services/icalParse";

// Imports a host's external iCal feed (Airbnb, Booking.com, Google...) and
// hands the complete list of blocked dates to the sync_listing_ical_dates()
// RPC, which swaps them in atomically under the same per-listing advisory
// lock the booking guard uses -- so an import can never interleave with a
// booking for the same listing. A failed fetch/parse never touches the
// calendar (the last good blocks stay), and an empty-but-valid feed clears them.

const FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const CONCURRENCY = 8;

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
}

/** Host-supplied URL is fetched server-side: https only, never an internal address. */
async function assertSafeFeedUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcal:/i, "https:"));
  } catch {
    throw new Error("Invalid iCal URL");
  }
  if (url.protocol !== "https:") throw new Error("iCal URL must use https");
  const records = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true });
  if (!records.length || records.some((r) => isPrivateAddress(r.address))) {
    throw new Error("iCal URL is not reachable");
  }
  return url;
}

async function fetchFeedText(rawUrl: string): Promise<string> {
  let url = await assertSafeFeedUrl(rawUrl);
  for (let hop = 0; hop < 3; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "text/calendar, text/plain, */*", "User-Agent": "Hostiggo-iCal-Sync/1.0" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertSafeFeedUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`Feed returned HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) throw new Error("Feed is too large");
    return text;
  }
  throw new Error("Too many redirects");
}

async function recordFeedStatus(listingId: number, feedUrl: string, status: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("listing_ical_feeds")
    .select("id")
    .eq("listing_id", listingId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = { feed_url: feedUrl, last_status: status.slice(0, 300), updated_at: new Date().toISOString() };
  if (existing) await supabaseAdmin.from("listing_ical_feeds").update(row).eq("id", existing.id);
  else await supabaseAdmin.from("listing_ical_feeds").insert({ listing_id: listingId, ...row });
}

/** Sync one listing. Throws on failure; the calendar is untouched in that case. */
export async function syncListingICalFeed(listingId: number, icalUrl: string): Promise<{ blocked: number }> {
  try {
    const dates = parseBlockedDates(await fetchFeedText(icalUrl), todayInIndia());
    await recordFeedStatus(listingId, icalUrl, "syncing");
    const { error } = await supabaseAdmin.rpc("sync_listing_ical_dates", {
      p_listing_id: listingId,
      p_dates: dates,
    });
    if (error) throw error;
    await recordFeedStatus(listingId, icalUrl, "ok");
    return { blocked: dates.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await recordFeedStatus(listingId, icalUrl, `error: ${message}`).catch(() => {});
    throw err;
  }
}

export async function syncAllICalFeeds(): Promise<{ success: number; failed: number; total: number }> {
  const { data: listings, error } = await supabaseAdmin
    .from("listings")
    .select('listing_id, "icalLink"')
    .not("icalLink", "is", null)
    .neq("icalLink", "")
    .is("delisted_at", null);
  if (error) throw error;

  const feeds = (listings ?? []) as unknown as Array<{ listing_id: number; icalLink: string }>;
  let success = 0;
  let failed = 0;
  for (let i = 0; i < feeds.length; i += CONCURRENCY) {
    await Promise.all(
      feeds.slice(i, i + CONCURRENCY).map(async (l) => {
        try {
          await syncListingICalFeed(l.listing_id, l.icalLink);
          success++;
        } catch (err) {
          failed++;
          console.error(`[iCal Sync] listing ${l.listing_id} failed:`, err instanceof Error ? err.message : err);
        }
      }),
    );
  }
  return { success, failed, total: feeds.length };
}

/** Immediate sync for one listing (after a host adds or changes its feed URL). */
export async function triggerListingSync(listingId: number): Promise<{ blocked: number }> {
  const { data } = await supabaseAdmin
    .from("listings")
    .select('"icalLink"')
    .eq("listing_id", listingId)
    .maybeSingle();
  const url = (data as { icalLink?: string | null } | null)?.icalLink;
  if (!url) throw new Error("No iCal URL configured for this listing");
  return syncListingICalFeed(listingId, url);
}
