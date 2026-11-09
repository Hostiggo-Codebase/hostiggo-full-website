import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { CATEGORIES } from "./faqData";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description:
    "Answers to common questions about booking a homestay on Hostiggo: payments, refunds and cancellation dates, ID verification, check-in, and how to become a host.",
};

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: CATEGORIES.flatMap((c) => c.items).map((i) => ({
    "@type": "Question",
    name: i.q,
    acceptedAnswer: { "@type": "Answer", text: i.a },
  })),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={FAQ_JSON_LD} />
      {children}
    </>
  );
}
