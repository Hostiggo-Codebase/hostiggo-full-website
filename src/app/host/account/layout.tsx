import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host account",
  description: "Your Hostiggo host account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
