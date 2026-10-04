import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Signing you in",
  description: "Completing your Hostiggo sign-in.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
