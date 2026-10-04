import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in with mobile",
  description: "Sign in to Hostiggo with a one-time code sent to your phone.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
