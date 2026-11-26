import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const sections = [
  {
    id: "scope-of-this-policy",
    title: "1. Scope of This Policy",
    body: "This policy applies to hosts, guests, service providers, and visitors using Hostiggo through its website, mobile applications, customer support channels, and related services. Hostiggo is operated by Hostiggo Trips Private Limited.",
  },
  {
    id: "information-we-collect",
    title: "2. Information We Collect",
    body: "We collect the following, depending on how you use Hostiggo. Account and profile: your name, email address, phone number, profile photo, and optional details such as gender, age and an emergency contact. If you use Sign in with Apple we receive your name and an email address, which may be a private relay address if you choose Hide My Email. If you sign in with Google on our website or another app where it is offered, we receive your name, email address and profile photo from Google. Identity and verification: government identification details such as Aadhaar, PAN or passport numbers and the results of verification, where required for hosts and for safety and legal compliance. Bookings and listings: property details, addresses, prices, availability, booking history, reviews, and cancellations and refunds. Financial information: booking amounts, taxes and fees, payout history, and, for hosts, bank account details and PAN needed to pay you; card and UPI details are handled by our payment partner and are not stored by Hostiggo. Communications: chat messages between guests and hosts, support requests, feedback and issue reports. Photos you upload. Location, as described below. Device and usage information: IP address, device model and operating system, app version, push notification token, login activity, and crash and performance diagnostics.",
  },
  {
    id: "location-information",
    title: "3. Location Information",
    body: "With your permission, Hostiggo uses your device's precise location only while the app is open, to show stays near you and to help you place a property pin on the map. We do not track your location in the background. Hosts provide a property address and map location as part of a listing, which is shown to guests as needed for a booking. Text you type into a place search, and map coordinates you select, are sent to our mapping and address-search providers to return results. You can turn off location access at any time in your device settings.",
  },
  {
    id: "photos-camera-files",
    title: "4. Photos, Camera & Files",
    body: "With your permission, Hostiggo accesses your camera and photo library so hosts can add property photos and so you can set a profile picture. Photos you upload are stored on our servers and, for property photos, shown to guests. Hostiggo does not access your photos in the background or any photos you do not choose.",
  },
  {
    id: "purpose-of-data-collection",
    title: "5. Purpose of Data Collection",
    body: "Data is used to facilitate bookings, verify identities, process payments, refunds and payouts, provide support, send booking and account notifications, prevent fraud and abuse, improve safety and user experience, meet legal requirements, and support marketing where consent is provided or permitted by law.",
  },
  {
    id: "identity-verification-compliance",
    title: "6. Identity Verification & Compliance",
    body: "Hostiggo may require government identification and other documents from hosts, guests, and service providers for identity verification, fraud prevention, safety, and legal compliance. Verification is carried out with the help of an identity verification partner, to whom the details you submit are sent for checking.",
  },
  {
    id: "payments-financial-information",
    title: "7. Payments & Financial Information",
    body: "Payments are processed through authorized third-party payment gateways. Hostiggo does not store full card or UPI details. Payment-related data, including bank details provided by hosts for payouts, is processed securely under applicable financial and data protection requirements.",
  },
  {
    id: "chat-messages-automated-monitoring",
    title: "8. Chat Messages & Automated Monitoring",
    body: "Messages you send in the app are stored so conversations can be shown to you and the other party. To keep payments on the platform and to protect users, messages are checked automatically, for example to block the sharing of phone numbers, email addresses, payment IDs and outside links, and to detect abuse. Hostiggo support staff may review reported conversations. You can report a user or a review, and block a user; we store your reports and your block list to act on them and to stop blocked users from messaging you.",
  },
  {
    id: "service-providers-we-share-data-with",
    title: "9. Service Providers We Share Data With",
    body: "To operate the platform we share only the data needed with these categories of providers: cloud hosting, database, authentication and file storage (Supabase); payment processing (Razorpay); identity and bank verification (Surepass); maps, place search and geocoding (Google Maps, and OpenStreetMap-based address search); crash and performance monitoring (Sentry); push notifications (Expo and Apple Push Notification service); email and SMS delivery for login codes and booking messages; hosting of our own support, chat-monitoring, calendar-sync and verification services; website hosting and analytics (Vercel); and Sign in with Apple and Sign in with Google. These providers may only use data to provide their service to us.",
  },
  {
    id: "data-sharing-disclosure",
    title: "10. Data Sharing & Disclosure",
    body: "Hostiggo does not sell or rent personal data and does not use it to track you across other companies' apps and websites. Between users, a guest and host see the details needed to complete a booking, such as names, the property address and booking dates. Information may also be disclosed under court order, to comply with law, or to protect users and the public.",
  },
  {
    id: "sign-in-with-apple",
    title: "11. Sign in with Apple",
    body: "If you choose Sign in with Apple, Apple tells us your name and email address. If you choose Hide My Email, we receive a private relay address and our emails reach you through Apple's relay. Apple's own privacy policy governs what Apple collects.",
  },
  {
    id: "push-notifications-device-data-diagnostics",
    title: "12. Push Notifications, Device Data & Diagnostics",
    body: "If you allow notifications, we store a device push token to send booking, chat and account alerts. You can turn notifications off in your device settings or in the app. We collect crash reports and performance data, which do not include your name or contact details, to find and fix problems.",
  },
  {
    id: "data-storage-security-international-transfers",
    title: "13. Data Storage, Security & International Transfers",
    body: "Hostiggo uses reasonable administrative, technical, and organizational safeguards to protect data from unauthorized access, loss, misuse, alteration, or disclosure. Our service providers may store or process data on servers located outside India; where this happens we require them to protect it appropriately.",
  },
  {
    id: "data-retention-account-deletion",
    title: "14. Data Retention & Account Deletion",
    body: "You can delete your account in the app under Settings > Delete Account, or by writing to us at the address below. When an account is deleted we delete or anonymize your personal data, such as your name, contact details, profile photo, identity details, bank details and push tokens. We may keep records we are required to keep for legal, tax, accounting, fraud-prevention and dispute purposes, such as bookings, invoices, payment, refund and payout records, for the period the law requires, and in that case they are no longer linked to your name where possible. Messages you sent are removed from conversations. For hosts who have had bookings, the bank account and PAN details used for payouts are kept with those financial records. An account cannot be deleted while it has an upcoming or ongoing booking.",
  },
  {
    id: "user-rights",
    title: "15. User Rights",
    body: "Subject to legal requirements, users may access, correct, update, or request deletion of personal data and may withdraw consent for certain processing. You can do most of this in the app, or make a request using the contact details below.",
  },
  {
    id: "cookies-tracking-technologies",
    title: "16. Cookies & Tracking Technologies",
    body: "The Hostiggo app does not use advertising or cross-app tracking. Our website uses Vercel Analytics to measure traffic and may use cookies and similar technologies to improve the experience, analyze usage, and maintain security. Cookie preferences can be managed through browser settings, although disabling cookies may affect functionality.",
  },
  {
    id: "third-party-links",
    title: "17. Third-Party Links",
    body: "Hostiggo may link to third-party websites or services and is not responsible for their content or privacy practices. Review the privacy policy of each third-party platform independently.",
  },
  {
    id: "children-s-privacy",
    title: "18. Children's Privacy",
    body: "Hostiggo is intended for people aged eighteen and over and does not knowingly collect personal data from people under eighteen. If such data is discovered, Hostiggo will take appropriate steps to delete it promptly.",
  },
  {
    id: "legal-compliance",
    title: "19. Legal Compliance",
    body: "Hostiggo processes personal data under the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000, and other applicable Indian privacy laws, and may cooperate with authorities where required.",
  },
  {
    id: "policy-updates",
    title: "20. Policy Updates",
    body: "Hostiggo may update this Privacy Policy at any time. Changes become effective when published, and we will make the update date visible at the top of this page. Continued use after publication constitutes acceptance of the revised policy.",
  },
  {
    id: "contact-grievance-redressal",
    title: "21. Contact & Grievance Redressal",
    body: "For privacy requests or grievances, contact\n\nGrievance Officer Daksh Bhasin\nEmail: support@hostiggo.com\nPhone: +91 84483 37674\n\nHostiggo Trips Private Limited, C-72, Plot H-584, Shivaji Park, Punjabi Bagh, West Delhi, New Delhi, Delhi, India - 110026.",
  },
];

export const metadata = {
  title: "Privacy Policy",
  description:
    "How Hostiggo collects, uses, stores, and protects your personal data in accordance with applicable Indian laws.",
};

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-sm text-figma-ink/60 mb-6">
            Last updated: November 26, 2026
          </p>
          <p className="text-[15px] leading-7 text-figma-ink/80 max-w-3xl">
            Hostiggo (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;)
            is committed to protecting the privacy and personal data of all
            users (&ldquo;you&rdquo;, &ldquo;user&rdquo;, &ldquo;host&rdquo;,
            &ldquo;guest&rdquo;, or &ldquo;service provider&rdquo;) who access
            or use the Hostiggo platform. This Privacy Policy explains how we
            collect, use, store, process, and protect your personal data in
            accordance with applicable Indian laws. By accessing or using
            Hostiggo, you consent to the collection and use of your information
            as described in this Privacy Policy.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-10">
          <aside className="hidden md:block">
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

          <article className="bg-white rounded-3xl border border-figma-border p-6 md:p-10">
            {sections.map((s) => (
              <section
                key={s.id}
                id={s.id}
                className="mb-8 anchor-below-header"
              >
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
                Questions about your data?
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
