import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const sections = [
  {
    id: "scope",
    title: "1. Scope of This Policy",
    body: `This Privacy Policy applies to all users of the Hostiggo platform, including hosts, guests, service providers, and visitors, and covers data collected through the Hostiggo website, mobile applications, customer support channels, and related services.`,
  },
  {
    id: "information-we-collect",
    title: "2. Information We Collect",
    body: `Hostiggo may collect personal data including, but not limited to, your name, phone number, email address, government-issued identification details, profile information, property or service listing details, booking information, payment-related details, communication records, and usage data such as IP address, device information, and platform interaction logs.

We only collect information that is necessary to provide, operate, improve, secure, and comply with legal obligations related to the platform.`,
  },
  {
    id: "purpose",
    title: "3. Purpose of Data Collection",
    body: `The personal data collected by Hostiggo is used to facilitate bookings, verify identities, enable payments and refunds, provide customer support, communicate platform updates, prevent fraud, ensure platform safety, comply with legal and regulatory requirements, improve user experience, and support marketing and promotional activities where consent is provided or permitted by law.`,
  },
  {
    id: "identity-verification",
    title: "4. Identity Verification & Compliance",
    body: `To ensure platform safety and regulatory compliance, Hostiggo may require identity verification of hosts, guests, and service providers. This may include government-issued identification and other verification documents. Such information is collected solely for verification, fraud prevention, and legal compliance purposes.`,
  },
  {
    id: "payments-financial",
    title: "5. Payments & Financial Information",
    body: `All payments on Hostiggo are processed through authorized third-party payment gateways. Hostiggo does not store full card or sensitive banking information. Payment-related data is processed securely in compliance with applicable financial and data protection regulations.`,
  },
  {
    id: "data-sharing",
    title: "6. Data Sharing & Disclosure",
    body: `Hostiggo does not sell or rent personal data to third parties. Personal information may be shared only with trusted third-party service providers such as payment processors, verification services, technology partners, or legal authorities, strictly for purposes necessary to operate the platform or comply with legal obligations.

Information may also be disclosed where required by law, court order, government authority, or to protect the rights, safety, and security of Hostiggo, its users, or the public.`,
  },
  {
    id: "data-storage",
    title: "7. Data Storage & Security",
    body: `Hostiggo implements reasonable administrative, technical, and organizational security measures to protect personal data against unauthorized access, loss, misuse, alteration, or disclosure. Data is stored securely and retained only for as long as necessary to fulfill the purposes outlined in this policy or as required by applicable law.`,
  },
  {
    id: "user-rights",
    title: "8. User Rights",
    body: `Users have the right to access, correct, update, or request deletion of their personal data, subject to legal and regulatory requirements. Users may also withdraw consent for certain data processing activities where applicable. Requests related to personal data may be submitted to Hostiggo through the contact details provided below.`,
  },
  {
    id: "cookies",
    title: "9. Cookies & Tracking Technologies",
    body: `Hostiggo may use cookies and similar technologies to enhance user experience, analyze platform usage, improve services, and maintain platform security. Users may manage cookie preferences through their device or browser settings, though disabling cookies may affect platform functionality.`,
  },
  {
    id: "third-party-links",
    title: "10. Third-Party Links",
    body: `The Hostiggo platform may contain links to third-party websites or services. Hostiggo is not responsible for the privacy practices or content of such third-party platforms, and users are encouraged to review their respective privacy policies independently.`,
  },
  {
    id: "childrens-privacy",
    title: "11. Children’s Privacy",
    body: `Hostiggo does not knowingly collect personal data from individuals under the age of eighteen (18). If such data is discovered, Hostiggo will take appropriate steps to delete it promptly.`,
  },
  {
    id: "legal-compliance",
    title: "12. Legal Compliance",
    body: `Hostiggo processes personal data in compliance with the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000, and all other applicable Indian data protection and privacy laws. Where required, Hostiggo may cooperate with government or regulatory authorities.`,
  },
  {
    id: "policy-updates",
    title: "13. Policy Updates",
    body: `Hostiggo reserves the right to modify or update this Privacy Policy at any time. Any changes will be effective immediately upon publication on the platform. Continued use of Hostiggo after such updates constitutes acceptance of the revised Privacy Policy.`,
  },
  {
    id: "contact",
    title: "14. Contact & Grievance Redressal",
    body: `For questions, concerns, or requests related to this Privacy Policy or personal data, users may contact:

Grievance Officer: Daksh Bhasin
Hostiggo Trips Private Limited
C-72, Plot H-584, Shivaji Park, Punjabi Bagh, West Delhi, New Delhi, Delhi, India – 110026
Email: support@hostiggo.com
Phone: +91 84483 37674

Hostiggo will make reasonable efforts to address grievances and data-related requests in a timely manner in accordance with applicable law.`,
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
            Last updated: December 1, 2025
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
            <nav className="sticky top-24">
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
                className="mb-8 scroll-mt-24"
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
