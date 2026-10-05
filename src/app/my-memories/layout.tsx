import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My trips",
  description: "Your upcoming, completed and cancelled Hostiggo bookings.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
