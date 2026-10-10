import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const sections = [
  {
    id: "policy-structure",
    title: "1. Policy Structure & Control",
    body: `Hostiggo determines the types of cancellation policies available on the platform, including refund timelines, percentages, and applicable conditions. Hosts are required to select one of the predefined cancellation policies during property onboarding. Once selected, the policy applies uniformly to all bookings for that listing unless updated by the host in accordance with platform rules. Hostiggo reserves the right to modify, restrict, or override cancellation policies where required by law, consumer protection guidelines, or exceptional circumstances.`,
  },
  {
    id: "available-policies",
    title: "2. Available Cancellation Policies",
    body: null,
    subsections: [
      {
        id: "flexible",
        title: "2.1 Flexible Cancellation Policy",
        body: `Under the Flexible Cancellation Policy, guests are eligible for a full refund if the booking is canceled at least twenty-four (24) hours before the scheduled check-in date. Cancellations made within twenty-four (24) hours of check-in are non-refundable. This policy is designed for hosts who prefer higher booking flexibility and guest confidence.`,
      },
      {
        id: "moderate",
        title: "2.2 Moderate Cancellation Policy",
        body: `Under the Moderate Cancellation Policy, guests are eligible for a full refund if the booking is canceled at least five (5) days prior to the scheduled check-in date. Cancellations made within five (5) days of check-in are eligible for a partial refund, excluding Hostiggo’s service fees, as determined by the platform’s refund calculation system.`,
      },
      {
        id: "strict",
        title: "2.3 Strict Cancellation Policy",
        body: `Under the Strict Cancellation Policy, guests may receive a partial refund if the booking is canceled at least seven (7) days prior to the scheduled check-in date. Cancellations made within seven (7) days of check-in are non-refundable. This policy is intended for high-demand properties or peak-season bookings.`,
      },
    ],
  },
  {
    id: "refund-calculation",
    title: "3. Platform-Managed Refund Calculation",
    body: `All refunds are calculated automatically by Hostiggo’s system based on the selected cancellation policy, booking date, and cancellation timestamp. Hosts and guests do not engage in manual refund negotiations. Hostiggo’s service or commission fees are non-refundable under all cancellation policies unless otherwise required by law.`,
  },
  {
    id: "force-majeure",
    title: "4. Exceptional Circumstances (Force Majeure)",
    body: `Notwithstanding the selected cancellation policy, Hostiggo may allow full or partial refunds in exceptional circumstances, including but not limited to government travel bans, natural disasters, public health emergencies, legal restrictions, fraud, or safety risks. Such determinations are made solely at Hostiggo’s discretion to ensure user safety and regulatory compliance.`,
  },
  {
    id: "host-obligations",
    title: "5. Host Obligations",
    body: `Hosts agree to honor all bookings and applicable refunds strictly in accordance with the selected cancellation policy and Hostiggo’s automated refund decisions. Failure to comply may result in penalties, including account suspension, listing removal, or financial adjustments.`,
  },
  {
    id: "guest-acknowledgement",
    title: "6. Guest Acknowledgement",
    body: `By confirming a booking, guests acknowledge that they have reviewed and accepted the applicable cancellation policy displayed at the time of booking. Refund eligibility is determined exclusively by the policy selected by the host and enforced by Hostiggo’s system.`,
  },
  {
    id: "policy-updates",
    title: "7. Policy Updates",
    body: `Hostiggo reserves the right to revise or update cancellation policies at any time. Any changes will apply prospectively and will be clearly communicated on the platform. Continued use of the platform constitutes acceptance of the updated policies.`,
  },
];

export const metadata = {
  title: "Cancellation & Refund Policy",
  description:
    "Hostiggo’s standardized cancellation and refund framework: Flexible, Moderate, and Strict policies, for hosts and guests.",
};

export default function CancellationPage() {
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
            Cancellation &amp; Refund Policy
          </h1>
          <p className="text-sm text-figma-ink/60 mb-6">
            Last updated: September 2, 2026
          </p>
          <p className="text-[15px] leading-7 text-figma-ink/80 max-w-3xl">
            Hostiggo follows a standardized, platform-defined cancellation
            framework to ensure transparency, fairness, and consumer
            protection. While hosts may choose from available cancellation
            options, they are required to operate strictly within the policies
            defined and enforced by Hostiggo. Custom or self-defined
            cancellation rules are not permitted.
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
                {s.subsections && (
                  <div className="space-y-6 mt-2">
                    {s.subsections.map((sub) => (
                      <div
                        key={sub.id}
                        id={sub.id}
                        className="anchor-below-header border-l-2 border-figma-navy/10 pl-4"
                      >
                        <h3 className="text-base md:text-lg font-semibold text-figma-ink mb-2">
                          {sub.title}
                        </h3>
                        <p className="text-[15px] leading-7 text-figma-ink/80">
                          {sub.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}

            <div className="mt-12 rounded-2xl bg-figma-navy px-6 py-8 text-center">
              <h3 className="text-lg md:text-xl font-bold text-white mb-2">
                Questions about cancellations or refunds?
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
