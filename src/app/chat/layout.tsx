import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages",
  description: "Chat with your Hostiggo hosts.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
