import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Report an issue",
  description: "Tell us about a problem with a listing, a booking or the website so the Hostiggo team can fix it.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
