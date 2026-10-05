import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Choose add-ons",
  description: "Select add-ons for your Hostiggo stay.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
