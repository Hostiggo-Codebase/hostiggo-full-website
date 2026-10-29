import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refer and earn",
  description: "Hostiggo's referral program is coming soon.",
  // Placeholder page with no real content yet: keep it out of search results.
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
