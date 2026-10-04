import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Answers about booking, payments, refunds, cancellations, verification and hosting on Hostiggo.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
