import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in or sign up",
  description: "Sign in to Hostiggo with your phone, email or Google account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
