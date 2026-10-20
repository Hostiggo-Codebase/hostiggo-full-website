import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, SUPPORT_EMAIL, COMPANY_LEGAL_NAME } from "@/lib/site";
import { DESTINATIONS, MIN_INDEXABLE_LISTINGS } from "@/lib/destinations";
import { getDestinationCounts } from "@/lib/services/destinationStays";

// llms.txt: a plain-text map of the site for AI assistants and answer engines
// (https://llmstxt.org). Everything here points at pages that exist and facts
// that are stated on those pages.
export const revalidate = 3600;

export async function GET() {
  let counts: Record<string, number> = {};
  try {
    counts = await getDestinationCounts();
  } catch {
    // Static sections below still ship if the database is unreachable.
  }
  const destinations = DESTINATIONS.filter((d) => (counts[d.slug] ?? 0) >= MIN_INDEXABLE_LISTINGS)
    .map((d) => `- [Homestays in ${d.name}, ${d.state}](${SITE_URL}/stays/${d.slug}): ${counts[d.slug]} stays`)
    .join("\n");

  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE_NAME} is an online marketplace for homestays in India, operated by ${COMPANY_LEGAL_NAME}. Guests search and book stays and pay on the platform through Razorpay (the host is never paid directly by the guest). Hosts list properties and receive payouts to their bank account. Every listing page shows the host's photos, location, house rules, amenities, cancellation policy and guest reviews.

## Find a stay
- [Search all homestays](${SITE_URL}/search): filter by destination, dates, guests, price and amenities
- [Homestays by destination](${SITE_URL}/stays): browse by city
${destinations}

## Booking, payments and refunds
- [Cancellation and refund policy](${SITE_URL}/cancellation): how Flexible, Moderate and Strict policies calculate refunds
- [FAQs](${SITE_URL}/faq): booking, payments, refunds, verification and hosting
- [Refunds explained](${SITE_URL}/help/refunds)
- [Safety information](${SITE_URL}/safety)

## Hosting
- [Become a host](${SITE_URL}/become-a-host)
- [Earnings and payouts](${SITE_URL}/help/payouts)
- [Verify your identity](${SITE_URL}/help/verify-identity): optional eAadhaar verification for hosts
- [Add-on services](${SITE_URL}/help/add-ons)

## Company and policies
- [About ${SITE_NAME}](${SITE_URL}/about)
- [Terms and conditions](${SITE_URL}/terms)
- [Privacy policy](${SITE_URL}/privacy)
- [Contact](${SITE_URL}/contact): ${SUPPORT_EMAIL}
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
