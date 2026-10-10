import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const sections = [
  {
    id: "no-physical-shipment",
    title: "1. No Physical Shipment",
    body: `Hostiggo is a booking platform for homestays and short-term stays -- it does not sell, ship, or deliver any physical goods. No couriers, postal services, or logistics providers are involved in any transaction made on the platform. References to "shipping" in payment-processing terminology do not apply to bookings made through Hostiggo.`,
  },
  {
    id: "service-delivery",
    title: "2. How Your Booking Is Delivered",
    body: `What Hostiggo delivers is a confirmed reservation, not a shipped item. As soon as payment for a booking is successfully processed, the reservation is confirmed instantly and a booking confirmation -- including the property address, host contact details, and check-in instructions -- is sent to the guest by email and made available in their Hostiggo account, typically within a few minutes of payment confirmation. The stay itself is provided by the host directly at the property on the scheduled check-in date.`,
  },
  {
    id: "no-shipping-fees",
    title: "3. No Shipping Fees",
    body: `Because no physical goods are shipped, Hostiggo does not charge any shipping, handling, or delivery fee. The amount paid at checkout reflects the booking price, applicable taxes, and Hostiggo's service fee, as itemized before payment.`,
  },
  {
    id: "booking-issues",
    title: "4. Delayed or Missing Booking Confirmations",
    body: `If a booking confirmation is not received within a reasonable time after successful payment, or if any details in the confirmation appear incorrect, guests should contact Hostiggo support immediately so the issue can be resolved. This does not affect the validity of a successfully processed payment or booking.`,
  },
  {
    id: "related-policies",
    title: "5. Related Policies",
    body: null,
  },
];

export const metadata = {
  title: "Shipping Policy",
  description:
    "Hostiggo does not ship physical goods -- this page explains how bookings are confirmed and delivered instead.",
};

export default function ShippingPolicyPage() {
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

        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-figma-ink mb-3">
            Shipping Policy
          </h1>
          <p className="text-sm text-figma-ink/60 mb-6">
            Last updated: August 26, 2026
          </p>
          <p className="text-[15px] leading-7 text-figma-ink/80 max-w-3xl">
            Hostiggo connects guests with homestays and does not sell or ship
            any physical products. This policy explains what &ldquo;delivery&rdquo; means
            for a service booked through Hostiggo.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10">
          <aside className="hidden lg:block">
            <nav className="sticky sticky-below-header">
              <p className="text-xs font-semibold uppercase tracking-wide text-figma-ink/60 mb-3">
                On this page
              </p>
              <ul className="space-y-2">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-sm text-figma-ink/70 hover:text-figma-navy transition-colors"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="max-w-3xl bg-white rounded-3xl border border-figma-border p-6 md:p-10">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="mb-8 anchor-below-header">
                <h2 className="text-xl md:text-2xl font-semibold text-figma-ink mb-3">
                  {s.title}
                </h2>
                {s.body && (
                  <p className="text-[15px] leading-7 text-figma-ink/80 whitespace-pre-line">
                    {s.body}
                  </p>
                )}
                {s.id === "related-policies" && (
                  <p className="text-[15px] leading-7 text-figma-ink/80">
                    For details on how payments, cancellations, and refunds
                    work, see our{" "}
                    <Link href="/cancellation" className="text-figma-navy underline">
                      Cancellation &amp; Refund Policy
                    </Link>{" "}
                    and{" "}
                    <Link href="/terms" className="text-figma-navy underline">
                      Terms &amp; Conditions
                    </Link>
                    .
                  </p>
                )}
              </section>
            ))}

            <div className="mt-12 rounded-2xl bg-figma-navy px-6 py-8 text-center">
              <h3 className="text-lg md:text-xl font-bold text-white mb-2">
                Questions about a booking confirmation?
              </h3>
              <p className="text-sm text-white/80">
                Contact us at{" "}
                <a
                  href="mailto:support@hostiggo.com"
                  className="text-white underline hover:text-white/90"
                >
                  support@hostiggo.com
                </a>
                .
              </p>
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
