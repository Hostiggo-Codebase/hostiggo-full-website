import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify your code",
  description: "Enter the one-time code to sign in to Hostiggo.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
