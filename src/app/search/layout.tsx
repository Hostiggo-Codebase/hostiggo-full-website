import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search homestays in India",
  description: "Find and compare homestays across India with all-in nightly prices, verified reviews and free-cancellation options.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
