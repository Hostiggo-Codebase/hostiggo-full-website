import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help and support",
  description: "Get help with a booking, payment, refund or your host account. Contact the Hostiggo support team.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
