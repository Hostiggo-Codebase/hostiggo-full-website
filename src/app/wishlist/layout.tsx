import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your wishlist",
  description: "Homestays you have saved on Hostiggo.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
