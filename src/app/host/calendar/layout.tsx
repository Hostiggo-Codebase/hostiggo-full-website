import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host calendar",
  description: "Manage availability and prices for your Hostiggo listings.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
