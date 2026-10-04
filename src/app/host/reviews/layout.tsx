import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guest feedback",
  description: "Reviews from guests who stayed at your properties.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
