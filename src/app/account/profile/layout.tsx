import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your profile",
  description: "Manage your Hostiggo profile.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
