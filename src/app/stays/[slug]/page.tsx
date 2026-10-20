import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import JsonLd from "@/components/JsonLd";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { formatINR } from "@/lib/format";
import {
  DESTINATIONS,
  DESTINATIONS_BY_SLUG,
  MIN_INDEXABLE_LISTINGS,
  type Destination,
} from "@/lib/destinations";
import { getDestinationStays } from "@/lib/services/destinationStays";

// Live inventory: counts and prices come from the database.
export const revalidate = 600;

type Props = { params: Promise<{ slug: string }> };

const rupees = (n: number) => formatINR(Math.round(n)).replace(/\.00$/, "");

function faqFor(d: Destination, count: number, from: number) {
  return [
    {
      q: `How much does a homestay in ${d.name} cost?`,
      a: `Homestays in ${d.name} on ${SITE_NAME} start from about ${rupees(from)} per night, with taxes and fees included. We currently list ${count} stays here, and prices vary with the property, season and dates.`,
    },
    {
      q: `Can I cancel a ${d.name} booking and get a refund?`,
      a: `Yes. Every listing shows its cancellation policy (Flexible, Moderate or Strict) before you pay, and the refund you would get on each date. The policy shown at checkout is the one that applies to your booking.`,
    },
    {
      q: `How do I pay for a stay in ${d.name}?`,
      a: `You pay on ${SITE_NAME} at the time of booking through Razorpay. You never pay the host directly, and the booking is confirmed once the payment is verified.`,
    },
    {
      q: `What can I check before booking a stay in ${d.name}?`,
      a: `Each listing page shows the host's photos, the map location, house rules, amenities, the cancellation policy and guest reviews. Hosts can also verify their identity with an eAadhaar check from their host settings.`,
    },
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = DESTINATIONS_BY_SLUG[slug];
  if (!d) return { title: "Destination not found", robots: { index: false } };
  const stays = await getDestinationStays(d);
  const from = stays[0]?.nightlyFrom ?? 0;
  const title = `Homestays in ${d.name}, ${d.state}`;
  const description =
    stays.length > 0
      ? `Book ${stays.length} homestays in ${d.name} from ${rupees(from)} a night, all taxes included. Real photos, clear cancellation terms and secure Razorpay payments.`
      : `Homestays in ${d.name}, ${d.state} on ${SITE_NAME}.`;
  const indexable = stays.length >= MIN_INDEXABLE_LISTINGS;
  const cover = stays[0]?.image;
  return {
    title,
    description,
    alternates: { canonical: `/stays/${slug}` },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, type: "website", ...(cover ? { images: [cover] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(cover ? { images: [cover] } : {}) },
  };
}

export default async function DestinationPage({ params }: Props) {
  const { slug } = await params;
  const d = DESTINATIONS_BY_SLUG[slug];
  if (!d) notFound();

  const stays = await getDestinationStays(d);
  const from = stays[0]?.nightlyFrom ?? 0;
  const faqs = stays.length ? faqFor(d, stays.length, from) : [];
  const related = d.related
    .map((s) => DESTINATIONS_BY_SLUG[s])
    .filter((x): x is Destination => !!x);
  const pageUrl = `${SITE_URL}/stays/${slug}`;

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Stays", item: `${SITE_URL}/stays` },
          { "@type": "ListItem", position: 3, name: d.name, item: pageUrl },
        ],
      },
      {
        "@type": "CollectionPage",
        "@id": pageUrl,
        url: pageUrl,
        name: `Homestays in ${d.name}, ${d.state}`,
        inLanguage: "en-IN",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@type": "Place", name: d.name, address: { "@type": "PostalAddress", addressRegion: d.state, addressCountry: "IN" } },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: stays.length,
          itemListElement: stays.slice(0, 20).map((s, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE_URL}/property/${s.id}`,
            name: s.title,
          })),
        },
      },
      ...(faqs.length
        ? [
            {
              "@type": "FAQPage",
              mainEntity: faqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <div className="min-h-screen bg-figma-cream">
      <JsonLd data={schema} />
      <Navbar />
      <main className="mx-auto max-w-[1100px] px-4 sm:px-6 pt-8 pb-16">
        <nav aria-label="Breadcrumb" className="text-[13px] text-gray-500 mb-4">
          <Link href="/" className="hover:text-gray-800">Home</Link>
          <span className="mx-1.5">/</span>
          <Link href="/stays" className="hover:text-gray-800">Stays</Link>
          <span className="mx-1.5">/</span>
          <span className="text-gray-800">{d.name}</span>
        </nav>

        <h1 className="text-[28px] sm:text-[36px] font-bold text-[#111827] leading-tight">
          Homestays in {d.name}, {d.state}
        </h1>
        {stays.length > 0 ? (
          <p className="mt-3 text-[16px] text-gray-700 max-w-[760px]">
            {d.summary} {SITE_NAME} has <strong>{stays.length} {stays.length === 1 ? "stay" : "stays"}</strong> here from{" "}
            <strong>{rupees(from)} a night</strong>, taxes and fees included.
          </p>
        ) : (
          <p className="mt-3 text-[16px] text-gray-700 max-w-[760px]">{d.summary}</p>
        )}
        {d.areaNote ? <p className="mt-2 text-[14px] text-gray-500 max-w-[760px]">{d.areaNote}</p> : null}

        <section aria-labelledby="stays-heading" className="mt-8">
          <h2 id="stays-heading" className="text-[22px] font-semibold text-[#111827] mb-4">
            Stays in {d.name}
          </h2>
          {stays.length === 0 ? (
            <p className="text-gray-600">
              No stays are listed here right now.{" "}
              <Link href="/search" className="text-[#004772] underline">Browse all homestays</Link>.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {stays.map((s, i) => (
                <li key={s.id}>
                  <Link
                    href={`/property/${s.id}`}
                    className="block bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="relative h-[200px] bg-gray-100">
                      <Image
                        src={s.image || "/placeholder.svg"}
                        alt={`${s.title} in ${s.place}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                        priority={i < 3}
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="text-[16px] font-semibold text-[#111827] line-clamp-2">{s.title}</h3>
                      <p className="text-[13px] text-gray-500 mt-0.5">{s.place}</p>
                      <p className="text-[13px] text-gray-500 mt-1">
                        {[s.guests ? `${s.guests} guests` : null, s.bedrooms ? `${s.bedrooms} bedroom${s.bedrooms === 1 ? "" : "s"}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-2 text-[15px] text-[#111827]">
                        <span className="font-bold">{rupees(s.nightlyFrom)}</span>
                        <span className="text-gray-500"> / night, all-in</span>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="about-heading" className="mt-12 max-w-[760px]">
          <h2 id="about-heading" className="text-[22px] font-semibold text-[#111827] mb-3">
            Why stay in {d.name}
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-[15px] text-gray-700">
            {d.knownFor.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </section>

        {faqs.length > 0 ? (
          <section aria-labelledby="faq-heading" className="mt-12 max-w-[760px]">
            <h2 id="faq-heading" className="text-[22px] font-semibold text-[#111827] mb-4">
              Booking a stay in {d.name}: common questions
            </h2>
            <dl className="space-y-5">
              {faqs.map((f) => (
                <div key={f.q}>
                  <dt className="text-[16px] font-semibold text-[#111827]">{f.q}</dt>
                  <dd className="mt-1 text-[15px] text-gray-700">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {related.length > 0 ? (
          <section aria-labelledby="related-heading" className="mt-12">
            <h2 id="related-heading" className="text-[18px] font-semibold text-[#111827] mb-3">
              Explore more destinations
            </h2>
            <div className="flex flex-wrap gap-2">
              {related.map((r) => (
                <Link key={r.slug} href={`/stays/${r.slug}`} className="px-4 py-2 rounded-full bg-white border border-gray-200 text-[14px] text-[#004772] hover:bg-gray-50">
                  Homestays in {r.name}
                </Link>
              ))}
              <Link href="/stays" className="px-4 py-2 rounded-full bg-white border border-gray-200 text-[14px] text-[#004772] hover:bg-gray-50">
                All destinations
              </Link>
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
