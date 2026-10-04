import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const sections = [
  {
    id: "introduction",
    title: "1. Introduction",
    body: `By accessing or using the Hostiggo platform, users acknowledge that they have read, understood, and agreed to be bound by these Terms and Conditions. Hostiggo operates solely as a technology-enabled marketplace that facilitates connections between property owners (“Hosts”), service providers, and travelers (“Guests”). Hostiggo does not own, lease, manage, control, or operate any property or service listed on the platform, nor does it act as a real estate broker, travel agent, or service provider.`,
  },
  {
    id: "eligibility",
    title: "2. Eligibility & Registration",
    body: `Only individuals who are eighteen (18) years of age or older and possess valid government-issued identification are permitted to register and use Hostiggo. Users agree to provide accurate, complete, and truthful information during registration and throughout their use of the platform. Hostiggo reserves the right to suspend or permanently terminate accounts that contain false, misleading, or incomplete information, without prior notice.`,
  },
  {
    id: "hosts-responsibilities",
    title: "3. Hosts’ Responsibilities",
    body: `Hosts are solely responsible for ensuring that all property listings are accurate, complete, and up to date, including pricing, amenities, number of rooms, guest capacity, availability, and location details. Hosts are responsible for maintaining appropriate standards of cleanliness, hygiene, and safety, and for ensuring that their properties comply with all applicable local laws, building regulations, fire safety standards, and health requirements. Hosts must obtain and maintain all necessary licenses, permits, registrations, and approvals required under state tourism laws, municipal regulations, and police verification rules. Hosts agree to honor all confirmed bookings unless canceled in accordance with the applicable cancellation policy selected on the platform. Any photographs, videos, or descriptive content uploaded by hosts must accurately represent the property, and by uploading such content, hosts grant Hostiggo the right to use it for platform operations, marketing, and promotional purposes.`,
  },
  {
    id: "property-delisting-termination-by-hosts",
    title: "4. Property Delisting & Termination by Hosts",
    body: `4.1 Any request submitted by a Host to unlist, deactivate, withdraw, terminate, or otherwise remove a property from the Hostiggo platform shall be treated solely as a formal notice of intended delisting and shall not take immediate effect upon submission.

4.2 A mandatory notice period of thirty (30) days shall apply from the date on which the Host submits such delisting request to Hostiggo. Throughout this notice period, the relevant property shall remain active, visible, searchable, and bookable on the Hostiggo platform, and Guests shall continue to be entitled to access the listing and make reservations in the ordinary course.

4.3 The Host shall remain fully and continuously responsible for honoring and fulfilling all bookings confirmed prior to the submission of the delisting request, as well as all bookings confirmed during the thirty (30) day notice period. Any reservation confirmed before the effective date of delisting shall remain valid, binding, and enforceable, and must be fulfilled by the Host unless canceled strictly in accordance with Hostiggo's applicable cancellation policies and procedures.

4.4 The property shall only be removed, unpublished, unlisted, or deactivated from the Hostiggo platform upon the expiry of the aforesaid thirty (30) day notice period, or on such later date as may be determined by Hostiggo in accordance with these Terms. Hostiggo further reserves the right, at its sole discretion, to delay, extend, suspend, or otherwise modify the delisting process where reasonably necessary for operational continuity, legal or regulatory compliance, consumer protection obligations, dispute resolution, active or anticipated bookings, or any other booking-related, administrative, or risk-management reason.`,
  },
  {
    id: "guest-requirements",
    title: "5. Guest Requirements",
    body: `Guests are required to provide accurate identity and contact information during booking and verification processes. Guests must comply with all house rules established by hosts, as well as all applicable local, state, and national laws. Guests must not engage in illegal activities, cause property damage, harass or abuse hosts, service providers, or other guests, or engage in conduct that violates the rights or safety of others.`,
  },
  {
    id: "payments-refunds",
    title: "6. Payments & Refunds",
    body: `All payments for bookings and services must be processed exclusively through Hostiggo’s authorized payment gateway. Direct or offline payments outside the platform are strictly prohibited. Hostiggo charges a service or commission fee on confirmed bookings, which is non-refundable. Refunds, where applicable, are governed by the host’s selected cancellation policy and Hostiggo’s platform guidelines. Hostiggo does not mediate or assume responsibility for payment disputes between hosts and guests. Any payout to a Host may be delayed due to bank processing times, payment processor procedures, verification requirements, weekends, public holidays, technical issues, or other circumstances outside Hostiggo’s reasonable control.`,
  },
  {
    id: "liability",
    title: "7. Liability & Disclaimers",
    body: `Hostiggo shall not be liable for any personal injury, theft, loss, damage, or harm occurring at any listed property or during the provision of services. Hostiggo disclaims all liability arising from disputes between users, service quality issues, third-party actions, platform interruptions, or force majeure events, including natural disasters and emergencies. To the fullest extent permitted by law, Hostiggo shall not be responsible for any direct, indirect, incidental, or consequential damages arising from the use of the platform.`,
  },
  {
    id: "prohibited-activities",
    title: "8. Prohibited Activities",
    body: `Users agree not to create fake accounts, misrepresent identity, engage in fraudulent transactions, manipulate payments, post false or misleading listings, harass or discriminate against other users, participate in illegal activities, bypass platform safeguards, scrape or copy platform content, or violate any intellectual property rights. Any such actions may result in immediate enforcement measures.`,
  },
  {
    id: "enforcement",
    title: "9. Enforcement & Penalties",
    body: `Hostiggo reserves the right, at its sole discretion, to investigate violations of these Terms and to take appropriate enforcement action, including account suspension, permanent termination, forfeiture of funds, and initiation of civil or criminal legal proceedings where applicable.`,
  },
  {
    id: "data-protection",
    title: "10. Data Protection & Privacy",
    body: `Hostiggo collects, processes, and protects personal data in accordance with the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000, and all other applicable Indian data protection laws. User data will not be shared with third parties without consent, except where disclosure is required by law or regulatory authorities.`,
  },
  {
    id: "intellectual-property",
    title: "11. Intellectual Property Rights",
    body: `All trademarks, logos, brand names, software, platform design, and proprietary content associated with Hostiggo are the exclusive intellectual property of Hostiggo and may not be copied, reproduced, modified, distributed, or used without prior written permission. By submitting any content to the platform, users grant Hostiggo a non-exclusive, worldwide, royalty-free license to use, display, distribute, modify, and reproduce such content for operational, promotional, and marketing purposes, and confirm that they have the legal rights to grant such license.`,
  },
  {
    id: "dispute-resolution",
    title: "12. Dispute Resolution & Jurisdiction",
    body: `These Terms and Conditions shall be governed by and construed in accordance with the laws of the Republic of India. All disputes arising from or relating to the use of Hostiggo shall be subject to the exclusive jurisdiction of the courts located in New Delhi, India. Users agree to first attempt resolution by contacting Hostiggo support before pursuing legal remedies.`,
  },
  {
    id: "amendments",
    title: "13. Amendments",
    body: `Hostiggo reserves the right to modify or update these Terms and Conditions at any time. Any changes shall become effective immediately upon publication on the platform. Continued use of Hostiggo following such updates constitutes acceptance of the revised terms.`,
  },
  {
    id: "support-contact",
    title: "14. Support & Contact",
    body: `For questions, support, or grievances related to the platform or these Terms and Conditions, users may contact Hostiggo Trips Private Limited at support@hostiggo.com or +91 84483 37674. The support team is available twenty-four (24) hours a day to assist with inquiries and concerns.

Registered office: C-72, Plot H-584, Shivaji Park, Punjabi Bagh, West Delhi, New Delhi, Delhi, India – 110026.`,
  },
];

export const metadata = {
  title: "Terms & Conditions",
  description:
    "The Terms and Conditions governing use of the Hostiggo platform by hosts, guests, and service providers.",
};

export default function TermsPage() {
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
            Terms &amp; Conditions
          </h1>
          <p className="text-sm text-figma-ink/60">
            Last updated: December 1, 2025
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
                <div className="space-y-4">
                  {s.body.split("\n\n").map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-[15px] leading-7 text-figma-ink/80 whitespace-pre-line"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <div className="mt-12 rounded-2xl bg-figma-navy px-6 py-8 text-center">
              <h3 className="text-lg md:text-xl font-bold text-white mb-2">
                Questions?
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
