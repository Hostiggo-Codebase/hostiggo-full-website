import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Booking confirmation",
  description: "Your Hostiggo booking details, receipt and cancellation timeline.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
