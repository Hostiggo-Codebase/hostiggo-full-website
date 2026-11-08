import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { HOST_FAQS } from "./faqData";

export const metadata: Metadata = {
  title: "Become a host",
  description:
    "List your homestay or villa on Hostiggo. No listing fee, one simple 5% commission, secure payouts and full control of your calendar, prices and cancellation policy.",
  alternates: { canonical: "/become-a-host" },
};

// The same questions and answers are shown on the page (faq.tsx), so the
// structured data always matches what visitors can read.
const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: HOST_FAQS.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={FAQ_SCHEMA} />
      {children}
    </>
  );
}
