import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { CATEGORIES } from "./faqData";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Answers about booking, payments, refunds, cancellations, verification and hosting on Hostiggo.",
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
