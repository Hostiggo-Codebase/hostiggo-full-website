import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Booking, payment and account updates from Hostiggo.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
