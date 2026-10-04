import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Become a host",
  description:
    "List your homestay on Hostiggo. No listing fee, one simple 5% commission, secure payouts and full control of your calendar, prices and cancellation policy.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
