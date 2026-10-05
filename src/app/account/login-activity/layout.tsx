import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login activity",
  description: "Recent sign-ins to your Hostiggo account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
