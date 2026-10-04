import Link from "next/link";
import { ChevronLeft, Landmark, ShieldCheck, ArchiveX, MessageSquare, Package, RotateCcw } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata = {
  title: "Help Centre",
  description:
    "Guides for hosts and guests: payouts, identity verification, removing a listing, chat guidelines, add-ons and refunds.",
};

const guides = [
  {
    href: "/help/payouts",
    icon: Landmark,
    title: "Payouts & bank details",
    body: "Where hosts add their bank account, what we deduct, and the current status of payouts.",
    audience: "Hosts",
  },
  {
    href: "/help/verify-identity",
    icon: ShieldCheck,
    title: "Verify your identity",
    body: "How Aadhaar verification works, what you upload, and how to check your status.",
    audience: "Hosts",
  },
  {
    href: "/help/delisting",
    icon: ArchiveX,
    title: "Removing (delisting) a listing",
    body: "What happens when you remove a listing, and how upcoming bookings are protected.",
    audience: "Hosts",
  },
  {
    href: "/help/chat-guidelines",
    icon: MessageSquare,
    title: "Chat guidelines",
    body: "How messaging between guests and hosts works and the rules for using it.",
    audience: "Hosts & guests",
  },
  {
    href: "/help/add-ons",
    icon: Package,
    title: "Add-on services",
    body: "Meals, transport, experiences and more: how hosts offer add-ons and guests book them.",
    audience: "Hosts & guests",
  },
  {
    href: "/help/refunds",
    icon: RotateCcw,
    title: "Cancellations & refunds",
    body: "Exactly how much is refunded under Flexible, Moderate and Strict policies.",
    audience: "Hosts & guests",
  },
];

export default function HelpCentrePage() {
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
          <h1 className="text-3xl md:text-4xl font-bold text-figma-ink mb-3">Help Centre</h1>
          <p className="text-[15px] leading-7 text-figma-ink/80 max-w-3xl">
            Practical guides to how Hostiggo works today, for hosts and guests. Can&apos;t find
            what you need? Visit{" "}
            <Link href="/support" className="text-figma-navy underline">
              Support
            </Link>{" "}
            or read the{" "}
            <Link href="/faq" className="text-figma-navy underline">
              FAQs
            </Link>
            .
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {guides.map((g) => {
            const Icon = g.icon;
            return (
              <Link
                key={g.href}
                href={g.href}
                className="group bg-white rounded-3xl border border-figma-border p-6 hover:border-figma-navy/40 transition-colors"
              >
                <div className="w-11 h-11 rounded-2xl bg-figma-navy/10 text-figma-navy flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-figma-ink/50 mb-1">
                  {g.audience}
                </p>
                <h2 className="text-lg font-semibold text-figma-ink mb-2 group-hover:text-figma-navy">
                  {g.title}
                </h2>
                <p className="text-sm leading-6 text-figma-ink/70">{g.body}</p>
              </Link>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}
