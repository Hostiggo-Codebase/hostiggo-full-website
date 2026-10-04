import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Referrals",
  description: "Your Hostiggo referrals.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
