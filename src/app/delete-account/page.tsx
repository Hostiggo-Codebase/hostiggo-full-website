import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata = {
  title: "Delete Your Account",
  description:
    "How to delete your Hostiggo account and personal data, what gets removed, and what we must retain by law.",
};

const steps = [
  "Sign in to Hostiggo on the website or app.",
  "Open Account → Settings.",
  "Scroll to the bottom and tap “Delete Account”.",
  "Confirm the prompt. Your account is deactivated immediately and you are signed out.",
];

const sections = [
  {
    id: "before-you-delete",
    title: "Before you delete",
    body: `Deleting your account does not cancel bookings that are already in progress. Please complete or cancel any upcoming stays, and (for hosts) any upcoming guest bookings and pending payouts, before you request deletion.

Once your account is deleted you will lose access to your bookings history, saved listings, chats, reviews and profile.`,
  },
  {
    id: "what-is-deleted",
    title: "What we delete",
    body: `Your profile information (name, photo, email address, phone number), saved preferences and wishlists, chat messages, and verification details you submitted are removed or anonymised from our active systems after your request is processed.`,
  },
  {
    id: "what-we-retain",
    title: "What we may retain",
    body: `Some information must be kept to meet legal, tax, accounting, fraud-prevention and dispute-resolution obligations under applicable Indian law, including the Digital Personal Data Protection Act, 2023. This can include booking and payment records, invoices, and payout records. Retained data is kept only for as long as the law requires and is not used for any other purpose.`,
  },
  {
    id: "cant-sign-in",
    title: "Can’t sign in?",
    body: `If you no longer have access to your account, email us from the address registered on the account with the subject “Delete my account”. We may ask you to verify your identity before processing the request.

Email: support@hostiggo.com`,
  },
];

export default function DeleteAccountPage() {
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
            Delete Your Hostiggo Account
          </h1>
          <p className="text-[15px] leading-7 text-figma-ink/80 max-w-3xl">
            You can delete your Hostiggo account and request removal of your
            personal data at any time. This page explains how, and what happens
            to your data.
          </p>
        </header>

        <article className="bg-white rounded-3xl border border-figma-border p-6 md:p-10 max-w-4xl">
          <section id="how-to-delete" className="mb-8 anchor-below-header">
            <h2 className="text-xl md:text-2xl font-semibold text-figma-ink mb-3">
              How to delete your account
            </h2>
            <ol className="list-decimal pl-5 space-y-2 text-[15px] leading-7 text-figma-ink/80">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <Link
              href="/account/settings"
              className="inline-block mt-5 rounded-full bg-figma-navy px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Go to account settings
            </Link>
          </section>

          {sections.map((s) => (
            <section key={s.id} id={s.id} className="mb-8 anchor-below-header">
              <h2 className="text-xl md:text-2xl font-semibold text-figma-ink mb-3">
                {s.title}
              </h2>
              <p className="text-[15px] leading-7 text-figma-ink/80 whitespace-pre-line">
                {s.body}
              </p>
            </section>
          ))}

          <div className="mt-12 rounded-2xl bg-figma-navy px-6 py-8 text-center">
            <h3 className="text-lg md:text-xl font-bold text-white mb-2">
              Need help?
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
      </main>
      <Footer />
    </div>
  );
}
