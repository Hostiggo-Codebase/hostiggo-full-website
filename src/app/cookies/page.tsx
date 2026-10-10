import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const sections = [
  {
    id: "what-are-cookies",
    title: "1. What Are Cookies",
    body: `Cookies are small text files that are stored on a user's device when visiting a website or using an application. Cookies enable websites and applications to recognize users, remember preferences, maintain sessions, improve functionality, and collect information about how users interact with the platform.

Cookies may be temporary (“Session Cookies”), which are deleted when the browser is closed, or persistent (“Persistent Cookies”), which remain on the device for a specified period or until manually deleted.`,
  },
  {
    id: "types-of-cookies",
    title: "2. Types of Cookies We Use",
    body: `Hostiggo may use essential cookies, functional cookies, analytics cookies, performance cookies, and security cookies to ensure the proper operation and improvement of the Platform.

Essential cookies are necessary for user authentication, account security, session management, and core platform functionality. Without these cookies, certain services may not be available.

Functional cookies enable the Platform to remember user preferences, settings, language selections, and other customization choices to improve the user experience.

Analytics and performance cookies help Hostiggo understand how users interact with the Platform, identify technical issues, monitor platform performance, and improve overall functionality.

Security cookies assist in detecting fraudulent activity, preventing unauthorized access, maintaining account security, and protecting the integrity of the Platform.`,
  },
  {
    id: "information-collected",
    title: "3. Information Collected Through Cookies",
    body: `Cookies and similar technologies may collect information including IP address, browser type, device information, operating system, language preferences, session information, pages visited, referral sources, usage patterns, interaction data, and other technical information related to the use of the Platform.

The information collected through cookies is used solely for legitimate business purposes, platform improvement, security enhancement, user experience optimization, and compliance with applicable legal obligations.`,
  },
  {
    id: "third-party-cookies",
    title: "4. Third-Party Cookies",
    body: `Hostiggo may permit trusted third-party service providers, including analytics providers, payment partners, security services, and technology partners, to place or access cookies on the Platform where necessary to support platform operations.

Such third parties may collect information in accordance with their own privacy policies and applicable legal requirements. Hostiggo does not control the cookie practices of third-party websites, services, or platforms.`,
  },
  {
    id: "purpose-of-cookie-usage",
    title: "5. Purpose of Cookie Usage",
    body: `Hostiggo uses cookies to authenticate users, maintain login sessions, improve platform functionality, personalize user experiences, analyze platform traffic, measure service performance, detect and prevent fraud, ensure security, and comply with legal and regulatory obligations.

Cookies may also be used to remember user preferences and reduce the need for repeated data entry during future visits.`,
  },
  {
    id: "cookie-management",
    title: "6. Cookie Management",
    body: `Users may control, restrict, disable, or delete cookies through their browser settings or device preferences. Most browsers allow users to manage cookie permissions, block specific cookies, or remove previously stored cookies.

Disabling certain cookies may affect the functionality, performance, or availability of some features of the Hostiggo Platform. Certain essential cookies are required for the operation of core services and security functions.`,
  },
  {
    id: "data-protection",
    title: "7. Data Protection",
    body: `Information collected through cookies is processed and protected in accordance with Hostiggo’s Privacy Policy, the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000, and all other applicable Indian laws.

Hostiggo implements reasonable administrative, technical, and organizational safeguards to protect information collected through cookies from unauthorized access, misuse, alteration, or disclosure.`,
  },
  {
    id: "changes",
    title: "8. Changes to This Cookie Policy",
    body: `Hostiggo reserves the right to modify or update this Cookie Policy at any time. Any changes shall become effective immediately upon publication on the Platform unless otherwise required by law. Continued use of the Platform following the publication of updates constitutes acceptance of the revised Cookie Policy.`,
  },
  {
    id: "contact",
    title: "9. Contact & Grievance Redressal",
    body: `For questions, concerns, or requests relating to this Cookie Policy or the use of cookies on the Platform, users may contact:

Hostiggo Support Team
Email: support@hostiggo.com

Hostiggo will make reasonable efforts to address cookie-related inquiries and privacy concerns in a timely manner and in accordance with applicable law.`,
  },
];

export const metadata = {
  title: "Cookie Policy",
  description:
    "How Hostiggo uses cookies and similar tracking technologies to improve user experience, security, and platform functionality.",
};

export default function CookiesPage() {
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
            Cookie Policy
          </h1>
          <p className="text-sm text-figma-ink/60 mb-6">
            Last updated: December 1, 2025
          </p>
          <p className="text-[15px] leading-7 text-figma-ink/80 max-w-3xl mb-4">
            Hostiggo (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;)
            uses cookies and similar tracking technologies to improve user
            experience, enhance platform functionality, analyze usage patterns,
            maintain security, and support the operation of our website,
            mobile applications, and related services (&ldquo;Platform&rdquo;).
          </p>
          <p className="text-[15px] leading-7 text-figma-ink/80 max-w-3xl">
            By accessing or using Hostiggo, you consent to the use of cookies
            and similar technologies in accordance with this Cookie Policy.
            Users may manage or withdraw cookie preferences at any time through
            their browser or device settings, subject to the limitations
            described below.
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
                Questions about cookies?
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
