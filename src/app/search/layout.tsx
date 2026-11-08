import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search homestays in India",
  description:
    "Search homestays, villas and holiday homes across India by destination, dates and guests. Compare all-in nightly prices, reviews and cancellation terms.",
  // Filtered/paginated search URLs all point back to the one clean page.
  alternates: { canonical: "/search" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
