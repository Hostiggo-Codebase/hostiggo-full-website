import Link from "next/link";
import { ChevronLeft, Home, ShieldCheck, Users } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const values = [
  {
    icon: Home,
    title: "Homestays, not hotels",
    body: "Hostiggo is built around real homes and hosts, not chain inventory — every listing is run by an actual person who lives in or near the property.",
  },
  {
    icon: ShieldCheck,
    title: "Verified & accountable",
    body: "Hosts go through identity verification before they can list, and every booking, cancellation, and refund follows the same platform-enforced rules — no exceptions negotiated off-platform.",
  },
  {
    icon: Users,
    title: "Built for both sides",
    body: "Guests get transparent pricing and consistent cancellation policies. Hosts get a dashboard for listings, earnings, and payouts without needing to run their own booking site.",
  },
];

export const metadata = {
  title: "About Us",
  description:
    "Hostiggo is a technology-enabled marketplace connecting hosts and travelers across India.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-figma-cream">
      <Navbar />
      <main className="container-main py-10 md:py-14">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-figma-ink/60 hover:text-figma-navy mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to home
        </Link>

        <header className="mb-10 max-w-2xl">
          <h1 className="text-3xl md:text-4xl font-bold text-figma-ink mb-3">
            About Hostiggo
          </h1>
          <p className="text-[15px] leading-7 text-figma-ink/80">
            Hostiggo is a technology-enabled marketplace that connects
            property owners with travelers looking for a homestay across
            India. We don&apos;t own, manage, or operate any of the
            properties listed on the platform — we build the tools that let
            hosts list, price, and manage their space, and let guests search,
            book, and pay with confidence.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
          {values.map((v) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title}
                className="bg-white rounded-3xl border border-figma-border p-6 md:p-8"
              >
                <div className="w-12 h-12 rounded-xl bg-figma-navy/5 text-figma-navy flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-semibold text-figma-ink mb-2">
                  {v.title}
                </h2>
                <p className="text-[15px] leading-7 text-figma-ink/70">
                  {v.body}
                </p>
              </div>
            );
          })}
        </section>

        <section className="bg-white rounded-3xl border border-figma-border p-6 md:p-10 mb-10">
          <h2 className="text-xl md:text-2xl font-semibold text-figma-ink mb-3">
            What we do
          </h2>
          <p className="text-[15px] leading-7 text-figma-ink/80 mb-4">
            Every booking made through Hostiggo runs on the same
            platform-managed rules — the cancellation policy shown at
            checkout is the one that applies, and refunds are calculated
            automatically rather than negotiated between host and guest. That
            consistency is the core of what we&apos;re building: a
            marketplace where both sides know exactly what to expect.
          </p>
          <p className="text-[15px] leading-7 text-figma-ink/80">
            For the details on how bookings, cancellations, and data are
            handled, see our{" "}
            <Link href="/terms" className="text-figma-navy underline">
              Terms &amp; Conditions
            </Link>
            ,{" "}
            <Link href="/cancellation" className="text-figma-navy underline">
              Cancellation &amp; Refund Policy
            </Link>
            , and{" "}
            <Link href="/privacy" className="text-figma-navy underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <div className="rounded-2xl bg-figma-navy px-6 py-8 text-center">
          <h3 className="text-lg md:text-xl font-bold text-white mb-2">
            Want to list your property?
          </h3>
          <p className="text-sm text-white/80 mb-4">
            Join hosts across India already earning on Hostiggo.
          </p>
          <Link
            href="/become-a-host"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-white text-figma-navy text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            Get started
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
