import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host bookings",
  description: "Manage your Hostiggo reservations.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
