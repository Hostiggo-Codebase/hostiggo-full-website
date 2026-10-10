import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

// Shared layout for the /help guides. Deliberately mirrors the existing
// legal/info pages (e.g. /cancellation): cream page, "On this page" sidebar,
// white rounded article card, navy CTA block.

export type HelpSection = { id: string; title: string; body: ReactNode };

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-7 text-figma-ink/80 mb-3 last:mb-0">{children}</p>;
}

export function List({ items, ordered = false }: { items: ReactNode[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={`${ordered ? "list-decimal" : "list-disc"} pl-5 space-y-2 text-[15px] leading-7 text-figma-ink/80 mb-3 last:mb-0`}
    >
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="border-l-2 border-figma-navy/30 bg-figma-cream/60 rounded-r-xl pl-4 pr-3 py-3 text-[14px] leading-6 text-figma-ink/80 mb-3 last:mb-0">
      {children}
    </div>
  );
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-figma-navy underline hover:text-figma-navy/80">
      {children}
    </Link>
  );
}

export default function HelpArticle({
  title,
  intro,
  updated,
  sections,
}: {
  title: string;
  intro: ReactNode;
  updated: string;
  sections: HelpSection[];
}) {
  return (
    <div className="min-h-screen bg-figma-cream">
      <Navbar />
      <main className="container-main py-10 md:py-14">
        <Link
          href="/help"
          className="inline-flex items-center gap-1 text-sm text-figma-ink/60 hover:text-figma-navy mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Help centre
        </Link>

        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-figma-ink mb-3">{title}</h1>
          <p className="text-sm text-figma-ink/60 mb-6">Last updated: {updated}</p>
          <div className="text-[15px] leading-7 text-figma-ink/80 max-w-3xl">{intro}</div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10">
          <aside className="hidden lg:block">
            <nav className="sticky sticky-below-header">
              <p className="text-xs font-semibold uppercase tracking-wide text-figma-ink/60 mb-3">
                On this page
              </p>
              <ul className="space-y-2">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-sm text-figma-ink/70 hover:text-figma-navy transition-colors"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="max-w-3xl bg-white rounded-3xl border border-figma-border p-6 md:p-10">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="mb-8 anchor-below-header">
                <h2 className="text-xl md:text-2xl font-semibold text-figma-ink mb-3">{s.title}</h2>
                {s.body}
              </section>
            ))}

            <div className="mt-12 rounded-2xl bg-figma-navy px-6 py-8 text-center">
              <h3 className="text-lg md:text-xl font-bold text-white mb-2">Still need help?</h3>
              <p className="text-sm text-white/80">
                Email{" "}
                <a
                  href="mailto:support@hostiggo.com"
                  className="text-white underline hover:text-white/90"
                >
                  support@hostiggo.com
                </a>{" "}
                or{" "}
                <Link href="/report-issue" className="text-white underline hover:text-white/90">
                  report an issue
                </Link>
                .
              </p>
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
