import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Complete your profile",
  description: "Add your details to finish setting up your Hostiggo account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
