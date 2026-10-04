import Link from "next/link";
import { Building2, ChevronLeft, Mail, MessageSquareWarning, Phone, ShieldAlert } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const channels = [
  {
    icon: Mail,
    title: "General support",
    body: "Booking, payment, or account questions.",
    action: { label: "support@hostiggo.com", href: "mailto:support@hostiggo.com" },
  },
  {
    icon: MessageSquareWarning,
    title: "Report an issue or leave feedback",
    body: "Technical problems, suggestions, or hosting-experience feedback go straight to our team.",
    action: { label: "Open the feedback form", href: "/support" },
  },
  {
    icon: ShieldAlert,
    title: "Grievance & data requests",
    body: "For grievances under our Privacy Policy or requests related to your personal data. Grievance Officer: Daksh Bhasin.",
    action: { label: "support@hostiggo.com", href: "mailto:support@hostiggo.com" },
  },
];

export const metadata = {
  title: "Contact Us",
  description: "How to reach the Hostiggo team for support, feedback, or grievances.",
};

export default function ContactPage() {
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
            Contact Us
          </h1>
          <p className="text-[15px] leading-7 text-figma-ink/80">
            Pick the option below that matches what you need — our support
            team responds to every message.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {channels.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                className="bg-white rounded-3xl border border-figma-border p-6 md:p-8 flex flex-col"
              >
                <div className="w-12 h-12 rounded-xl bg-figma-navy/5 text-figma-navy flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-semibold text-figma-ink mb-2">
                  {c.title}
                </h2>
                <p className="text-[15px] leading-7 text-figma-ink/70 mb-4 flex-1">
                  {c.body}
                </p>
                <a
                  href={c.action.href}
                  className="text-sm font-semibold text-figma-navy underline underline-offset-2"
                >
                  {c.action.label}
                </a>
              </div>
            );
          })}
        </section>

        <section className="bg-white rounded-3xl border border-figma-border p-6 md:p-10 mb-10">
          <h2 className="text-xl md:text-2xl font-semibold text-figma-ink mb-3">
            Response times
          </h2>
          <p className="text-[15px] leading-7 text-figma-ink/80">
            Critical technical issues and payment problems are prioritized
            with a target response time of under 4 hours. General questions,
            suggestions, and feedback are reviewed on an ongoing basis. For
            details on how we handle grievances related to your data, see our{" "}
            <Link href="/privacy" className="text-figma-navy underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section className="bg-white rounded-3xl border border-figma-border p-6 md:p-10">
          <h2 className="text-xl md:text-2xl font-semibold text-figma-ink mb-3">
            Registered business details
          </h2>
          <p className="text-sm text-figma-ink/60 mb-6">
            Published as required under the Consumer Protection (E-Commerce)
            Rules, 2020.
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex gap-3">
              <Building2 className="w-5 h-5 text-figma-navy shrink-0 mt-0.5" />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-figma-ink/50 mb-1">
                  Legal entity
                </dt>
                <dd className="text-[15px] text-figma-ink/80">
                  Hostiggo Trips Private Limited
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Phone className="w-5 h-5 text-figma-navy shrink-0 mt-0.5" />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-figma-ink/50 mb-1">
                  Customer care
                </dt>
                <dd className="text-[15px] text-figma-ink/80">
                  <a href="tel:+918448337674" className="hover:text-figma-navy">
                    +91 84483 37674
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <Building2 className="w-5 h-5 text-figma-navy shrink-0 mt-0.5" />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-figma-ink/50 mb-1">
                  Registered office
                </dt>
                <dd className="text-[15px] text-figma-ink/80">
                  C-72, Plot H-584, Shivaji Park, Punjabi Bagh, West Delhi,
                  New Delhi, Delhi, India – 110026
                </dd>
              </div>
            </div>
          </dl>
        </section>
      </main>
      <Footer />
    </div>
  );
}
