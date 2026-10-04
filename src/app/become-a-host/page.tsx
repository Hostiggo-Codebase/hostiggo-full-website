import Link from 'next/link';
import { ArrowRight, TrendingUp, Percent, Package, CalendarDays, Wallet, ShieldCheck } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

// First pass at the Figma "started website" host-landing frame
// (node 2355:16418, file PkxxdQZz9FfGkmUWhnrMOW). Built from get_metadata
// alone -- the Figma MCP hit its Starter-plan rate limit before
// get_design_context could run, so exact colors/fonts/imagery are not yet
// verified against the real design. Structure (headline, "ALL IN ONE
// PLACE" eyebrow + inline feature list, two CTAs, large image panel) is
// read from node names/positions; the earnings-card illustration and
// gradient blobs reuse the token system already established in
// CTABanner.tsx pending a real design_context pass.
const FEATURES = ['Add Services', 'Manage bookings', 'Get Paid Securely'];
const CHART_BARS = [35, 60, 45, 88, 62, 75, 50, 92];

// Target of the hero's "Learn More" button (href="#why-hostiggo"), which
// previously pointed at an anchor that didn't exist on the page, so the
// button did nothing. Every point here restates something the product
// already offers/states elsewhere (CTABanner commission line, the listing
// wizard's Add-ons / Cancellation policy steps, calendar, payouts) -- no
// new claims.
const WHY_HOSTIGGO = [
  {
    id: 'commission',
    icon: Percent,
    title: 'One simple 5% commission',
    body: 'No listing fee and no monthly charges. Hostiggo keeps 5% of the stay price, and you see your exact payout for every booking before you publish.',
  },
  {
    id: 'add-on-services',
    icon: Package,
    title: 'Add-on services',
    body: 'Offer extras like meals or experiences alongside your stay, with your own price, timings and what is included. Guests add them while booking.',
  },
  {
    id: 'bookings',
    icon: CalendarDays,
    title: 'Manage bookings in one place',
    body: 'Set weekday and weekend prices, discounts and availability from your host dashboard and calendar.',
  },
  {
    id: 'policy',
    icon: ShieldCheck,
    title: 'Your cancellation policy',
    body: 'Choose Flexible, Moderate or Strict for each listing. Refunds are calculated from the policy you pick.',
  },
  {
    id: 'payouts',
    icon: Wallet,
    title: 'Get paid securely',
    body: 'Add your bank details once and track earnings and payouts from the dashboard.',
  },
];

export default function BecomeAHostPage() {
  return (
    <div className="min-h-screen bg-figma-cream">
      <Navbar />
      <main className="container-main py-10 md:py-16">
        <section
          className="relative overflow-hidden rounded-3xl"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)' }}
        >
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-figma-navy opacity-[0.08] blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 left-10 w-64 h-64 rounded-full bg-figma-accent opacity-[0.08] blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row items-center gap-10 lg:gap-16 p-8 md:p-14">
            {/* Left: copy */}
            <div className="flex-1 max-w-xl">
              <h1 className="text-white text-4xl md:text-5xl font-extrabold leading-tight mb-6">
                Become a host
              </h1>

              <p className="text-figma-accent text-xs font-bold uppercase tracking-widest mb-2">
                All in one place
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-8">
                {FEATURES.map((f, i) => (
                  <span key={f} className="flex items-center gap-2">
                    <span className="text-slate-200 text-sm md:text-base font-medium">{f}</span>
                    {i < FEATURES.length - 1 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                    )}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/host/list/method"
                  className="inline-flex items-center gap-2 bg-figma-navy hover:bg-figma-navy/90 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-figma-navy/30 group"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="#why-hostiggo"
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all border border-white/20"
                >
                  Learn More
                </Link>
              </div>
            </div>

            {/* Right: earnings illustration */}
            <div className="flex-shrink-0">
              <div className="bg-amber-400 rounded-2xl p-6 w-[260px] shadow-2xl shadow-black/30">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center text-white text-base font-bold">
                    R
                  </div>
                  <div>
                    <p className="text-amber-900 text-[13px] font-bold leading-tight">Rahul Kumar</p>
                    <p className="text-amber-700 text-[11px]">New Delhi · Host</p>
                    <p className="mt-0.5 inline-block rounded-full bg-amber-900/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                      Illustrative example
                    </p>
                  </div>
                </div>

                <div className="bg-amber-500/50 rounded-xl p-4 mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-amber-900 text-[11px] font-semibold">Monthly Earnings</p>
                    <TrendingUp className="w-3.5 h-3.5 text-amber-900 opacity-70" />
                  </div>
                  <p className="text-amber-900 text-2xl font-extrabold">₹42,800</p>

                  <div className="flex items-end gap-0.5 h-10 mt-2">
                    {CHART_BARS.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-amber-700 rounded-t opacity-70"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="text-center">
                  <span className="text-amber-900 text-sm font-extrabold tracking-tight">
                    Rupi<span className="text-amber-700">Gold</span>
                  </span>
                  <p className="text-amber-800 text-[10px] mt-0.5 font-medium">Your earnings dashboard</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="why-hostiggo" className="scroll-mt-24 mt-14 md:mt-20">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2">Why host with Hostiggo</h2>
          <p className="text-gray-600 mb-8 max-w-2xl">
            Everything you need to list your homestay and start receiving bookings.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_HOSTIGGO.map(({ id, icon: Icon, title, body }) => (
              <div
                key={id}
                id={id}
                className="scroll-mt-24 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl bg-figma-navy/10 text-figma-navy flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link
              href="/host/list/method"
              className="inline-flex items-center gap-2 bg-figma-navy hover:bg-figma-navy/90 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all"
            >
              List your homestay
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
