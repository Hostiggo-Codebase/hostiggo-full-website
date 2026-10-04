import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host settings",
  description: "Manage your host profile, identity verification and payout details.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
