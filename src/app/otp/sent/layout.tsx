import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Code sent",
  description: "We sent you a one-time code to sign in to Hostiggo.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
