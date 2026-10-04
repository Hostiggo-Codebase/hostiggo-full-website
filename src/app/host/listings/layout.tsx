import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your listings",
  description: "Manage your Hostiggo properties.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
