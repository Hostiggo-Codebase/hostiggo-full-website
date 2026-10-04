import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify your identity",
  description: "Verify your identity with PAN, Aadhaar or passport to host or book on Hostiggo.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
