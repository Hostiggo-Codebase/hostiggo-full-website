import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account settings",
  description: "Manage your Hostiggo account, notifications and privacy.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
