import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trip add-ons",
  description: "Add extras to your Hostiggo booking.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
