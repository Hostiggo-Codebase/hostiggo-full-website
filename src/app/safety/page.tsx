import Link from "next/link";
import {
  ChevronLeft,
  Fingerprint,
  Lock,
  PhoneCall,
  ShieldAlert,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const pillars = [
  {
    icon: Fingerprint,
    title: "Verified hosts",
    body: "Every host completes identity verification before they can list a property, so you always know who you're booking with.",
  },
  {
    icon: Lock,
    title: "Secure payments",
    body: "Payments are processed through Razorpay and held until check-in — you never pay a host directly, and refunds follow the same platform-enforced rules every time.",
  },
  {
    icon: ShieldAlert,
    title: "Always reportable",
    body: "Anything that feels off — a listing, a message, a stay — can be flagged in a couple of taps, and our team reviews every report.",
  },
];

export const metadata = {
  title: "Safety Information",
  description:
    "How Hostiggo keeps guests and hosts safe — identity verification, secure payments, and how to report a concern.",
};

export default function SafetyPage() {
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
            Safety Information
          </h1>
          <p className="text-[15px] leading-7 text-figma-ink/80">
            Trust between guests and hosts is what makes a homestay work.
            Here&apos;s what Hostiggo does to keep both sides safe, and how
            to reach us if something goes wrong.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
          {pillars.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="bg-white rounded-3xl border border-figma-border p-6 md:p-8"
              >
                <div className="w-12 h-12 rounded-xl bg-figma-navy/5 text-figma-navy flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-semibold text-figma-ink mb-2">
                  {p.title}
                </h2>
                <p className="text-[15px] leading-7 text-figma-ink/70">
                  {p.body}
                </p>
              </div>
            );
          })}
        </section>

        <section className="bg-white rounded-3xl border border-figma-border p-6 md:p-10 mb-10">
          <h2 className="text-xl md:text-2xl font-semibold text-figma-ink mb-3">
            Before and during your stay
          </h2>
          <p className="text-[15px] leading-7 text-figma-ink/80 mb-4">
            Only communicate and pay through Hostiggo — booking or paying a
            host directly, on or off the platform, means none of our
            verification, refund, or support guarantees apply. Read the
            listing details, house rules, and cancellation policy shown at
            checkout before you confirm, and keep an eye out for anything
            that doesn&apos;t match what was listed once you arrive.
          </p>
          <p className="text-[15px] leading-7 text-figma-ink/80">
            For how we handle your personal data and grievances related to
            it, see our{" "}
            <Link href="/privacy" className="text-figma-navy underline">
              Privacy Policy
            </Link>
            . For cancellations and refunds, see our{" "}
            <Link href="/cancellation" className="text-figma-navy underline">
              Cancellation &amp; Refund Policy
            </Link>
            .
          </p>
        </section>

        <section className="bg-white rounded-3xl border border-figma-border p-6 md:p-10">
          <h2 className="text-xl md:text-2xl font-semibold text-figma-ink mb-3">
            Report a safety concern
          </h2>
          <p className="text-[15px] leading-7 text-figma-ink/80 mb-6">
            If something feels unsafe or a listing doesn&apos;t match what
            was promised, tell us right away — critical safety and payment
            issues are prioritized with a target response time of under 4
            hours.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex gap-3">
              <ShieldAlert className="w-5 h-5 text-figma-navy shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-figma-ink/50 mb-1">
                  Report an issue
                </h3>
                <Link
                  href="/support"
                  className="text-sm font-semibold text-figma-navy underline underline-offset-2"
                >
                  Open the feedback form
                </Link>
              </div>
            </div>
            <div className="flex gap-3">
              <PhoneCall className="w-5 h-5 text-figma-navy shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-figma-ink/50 mb-1">
                  Customer care
                </h3>
                <a
                  href="tel:+918448337674"
                  className="text-sm font-semibold text-figma-navy underline underline-offset-2"
                >
                  +91 84483 37674
                </a>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-10 rounded-2xl bg-figma-navy px-6 py-8 text-center">
          <h3 className="text-lg md:text-xl font-bold text-white mb-2">
            Have a question that isn&apos;t about safety?
          </h3>
          <p className="text-sm text-white/80 mb-4">
            Our support team is reachable for booking, payment, and account
            questions too.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-white text-figma-navy text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            Contact us
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
