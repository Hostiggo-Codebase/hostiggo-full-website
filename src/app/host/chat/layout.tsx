import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host messages",
  description: "Chat with your Hostiggo guests.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
