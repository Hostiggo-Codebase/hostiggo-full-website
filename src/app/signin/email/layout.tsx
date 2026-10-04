import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in with email",
  description: "Sign in to Hostiggo with a one-time code sent to your email.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
