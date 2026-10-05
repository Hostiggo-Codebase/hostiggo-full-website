import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guest reviews",
  description: "Read verified guest reviews for this Hostiggo homestay.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
