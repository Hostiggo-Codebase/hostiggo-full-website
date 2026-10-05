import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile verification",
  description: "Verify your identity with a government ID.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
