import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import JsonLd from "@/components/JsonLd";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { formatINR } from "@/lib/format";
import { DESTINATIONS, MIN_INDEXABLE_LISTINGS } from "@/lib/destinations";
import { getDestinationCounts, getDestinationStays } from "@/lib/services/destinationStays";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Homestays by destination in India",
  description: `Browse homestays across India by destination: Bhopal, Jaipur, Shimla, Varanasi, Dehradun and more. Real prices, clear cancellation terms, secure payments on ${SITE_NAME}.`,
  alternates: { canonical: "/stays" },
};

export default async function StaysHubPage() {
  const counts = await getDestinationCounts();
  const live = DESTINATIONS.filter((d) => (counts[d.slug] ?? 0) >= MIN_INDEXABLE_LISTINGS).sort(
    (a, b) => (counts[b.slug] ?? 0) - (counts[a.slug] ?? 0),
  );
  const froms = await Promise.all(live.map(async (d) => (await getDestinationStays(d))[0]?.nightlyFrom ?? 0));

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: `${SITE_URL}/stays`,
    name: "Homestays by destination in India",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: live.map((d, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/stays/${d.slug}`,
        name: `Homestays in ${d.name}`,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-figma-cream">
      <JsonLd data={schema} />
      <Navbar />
      <main className="mx-auto max-w-[1100px] px-4 sm:px-6 pt-8 pb-16">
        <h1 className="text-[28px] sm:text-[36px] font-bold text-[#111827]">Homestays by destination in India</h1>
        <p className="mt-3 text-[16px] text-gray-700 max-w-[760px]">
          {SITE_NAME} lists homestays with all-in nightly prices and a clear refund date on every booking. Pick a
          destination to see the stays available there, or{" "}
          <Link href="/search" className="text-[#004772] underline">search all of India</Link>.
        </p>
        <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {live.map((d, i) => (
            <li key={d.slug}>
              <Link href={`/stays/${d.slug}`} className="block h-full bg-white rounded-[20px] border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
                <h2 className="text-[18px] font-semibold text-[#111827]">Homestays in {d.name}</h2>
                <p className="text-[13px] text-gray-500">{d.state}</p>
                <p className="mt-3 text-[14px] text-gray-700">
                  {counts[d.slug]} stays
                  {froms[i] ? <> · from {formatINR(Math.round(froms[i])).replace(/\.00$/, "")} / night</> : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </div>
  );
}
