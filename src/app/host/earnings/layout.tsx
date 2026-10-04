import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host earnings",
  description: "Track your Hostiggo earnings and payouts.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
