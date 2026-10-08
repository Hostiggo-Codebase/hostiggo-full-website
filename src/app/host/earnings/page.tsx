'use client';

import { formatINR } from '@/lib/format';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Download,
  Wallet,
  Clock,
  ReceiptText,
  TrendingUp,
  Landmark,
  CalendarClock,
} from 'lucide-react';
import HostDashboardShell, { DashboardHeading } from '../_components/HostDashboardShell';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAutoRetry } from '@/hooks/useAutoRetry';
import BankProcessingNotice from '@/components/features/BankProcessingNotice';
import { calculateHostPayout } from '@/lib/billing/payout';
import { expectedSettlementDate, formatSettlementDate } from '@/lib/billing/settlement';

// Bookings are instant-confirmed on creation, status_id is only ever
// 2 (confirmed) or 3 (cancelled), there is no pending/approval step.
const STATUS_CANCELLED = 3;
const STATUS_CONFIRMED = 2;

type Earn = {
  id: string;
  title: string;
  start: Date | null;
  end: Date | null;
  amount: number;
  cancelled: boolean;
  confirmed: boolean;
  transferStatus: 'created' | 'processed' | 'failed' | null;
  settlementStatus: 'pending' | 'processed' | null;
  utr: string | null;
  /** Estimated bank-credit date (T+2 working days after payment), until settled. */
  expectedSettlement: Date | null;
};

// The real Razorpay Route payout state for a booking, not a guess -- these
// three columns are written by /api/webhooks/razorpay (transfer.processed,
// settlement.processed) and src/lib/services/admin-writes.ts
// (createHostTransferForBooking), so this is what actually happened to the
// money, not just whether the stay is over.
function payoutLabel(r: Earn): { text: string; tone: 'green' | 'blue' | 'gray' | 'red' } {
  if (r.settlementStatus === 'processed') return { text: 'Paid out', tone: 'green' };
  if (r.transferStatus === 'processed') return { text: 'Transferred', tone: 'blue' };
  if (r.transferStatus === 'failed') return { text: 'Transfer failed', tone: 'red' };
  if (r.transferStatus === 'created') return { text: 'Processing', tone: 'blue' };
  return { text: 'Awaiting payout', tone: 'gray' };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Host earnings must show the NET payout (after Hostiggo's 5% commission,
// 1% TCS, 1% TDS) -- never the raw guest-paid `bookings.amount`, which is
// the grand total including GST and the Hostiggo service fee. Recomputed
// from the listing's property price rather than stored on the booking,
// same simplification previewCancellationRefund() already uses (add-on
// price isn't tracked per-booking yet).
const mapEarn = (row: any): Earn => {
  // Prefer the payout snapshotted on the booking at payment time
  // (bookings.host_payout_paise); only bookings that predate it fall back to
  // recomputing from the listing's current price.
  const storedPaise = row.host_payout_paise != null ? Number(row.host_payout_paise) : null;
  const propertyPrice = Number(row.property?.price_weekday ?? 0);
  const netHostPayoutRupees =
    storedPaise != null ? storedPaise / 100 : calculateHostPayout({ propertyPrice }).netHostPayoutRupees;
  return {
    id: String(row.booking_id),
    title: row.property?.title?.trim() || 'Booked stay',
    start: row.start_date ? new Date(row.start_date) : null,
    end: row.end_date ? new Date(row.end_date) : null,
    amount: netHostPayoutRupees,
    cancelled: Number(row.status_id) === STATUS_CANCELLED,
    confirmed: Number(row.status_id) === STATUS_CONFIRMED,
    transferStatus: row.transfer_status ?? null,
    settlementStatus: row.settlement_status ?? null,
    utr: row.utr ?? null,
    expectedSettlement:
      row.settlement_status === 'processed' || row.transfer_status === 'failed'
        ? null
        : expectedSettlementDate(row.paid_at),
  };
};

const inr = (n: number) => formatINR(n);

// A missing or unparseable date means the bank / payment partner has not reported it yet -- say so instead of
// printing "N/A" or the browser's "Invalid Date".
const AWAITING_BANK = 'Awaiting bank';
const fmtDate = (d: Date | null) =>
  d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : AWAITING_BANK;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function AreaChart({ series }: { series: number[] }) {
  const w = 560;
  const h = 220;
  const max = Math.max(...series, 1);
  const pts = series.map((v, i) => {
    const x = (i / Math.max(series.length - 1, 1)) * w;
    const y = h - (v / max) * (h - 20) - 10;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[220px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(37,99,235,0.18)" />
          <stop offset="100%" stopColor="rgba(37,99,235,0)" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" y1={h * g} x2={w} y2={h * g} stroke="#eef0f3" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#rev)" />
      <path d={line} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#fff" stroke="#2563eb" strokeWidth="2" />
      ))}
    </svg>
  );
}

export default function EarningsPage() {
  const { userId } = useAuth();
  const [rows, setRows] = useState<Earn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<Awaited<
    ReturnType<typeof api.getPayoutMethod>
  > | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.hostPaymentHistory>>>([]);

  // Failed fetches are retried automatically and explained ("the bank is still processing"); a payout / payment
  // history failure is never shown as "nothing here yet".
  const retryRef = useRef<() => void>(() => undefined);
  const autoRetry = useAutoRetry(() => retryRef.current());
  const [partialFailure, setPartialFailure] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    setError(false);
    try {
      const [bookingsRes, payoutRes, historyRes] = await Promise.allSettled([
        api.hostBookings(userId),
        // Payouts need a bank account on file at all -- purely informational here (drives the empty-state copy
        // below), so a failure to load it must never block earnings from rendering.
        api.getPayoutMethod(),
        // Full payment/payout ledger; a failure here only affects that table.
        api.hostPaymentHistory(),
      ]);
      if (bookingsRes.status === 'rejected') throw bookingsRes.reason;
      setRows(bookingsRes.value.map(mapEarn));
      if (payoutRes.status === 'fulfilled') setPayoutMethod(payoutRes.value);
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value);
      const partial = payoutRes.status === 'rejected' || historyRes.status === 'rejected';
      setPartialFailure(partial);
      if (partial) {
        console.warn('[host/earnings] some payment details are not available yet');
        autoRetry.failed();
      } else {
        autoRetry.succeeded();
      }
    } catch (err) {
      console.error('[host/earnings] load failed:', err);
      setError(true);
      autoRetry.failed();
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autoRetry callbacks are stable
  }, [userId]);
  useEffect(() => {
    retryRef.current = () => { void load(true); };
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const earning = rows.filter((r) => !r.cancelled);
    const total = earning.reduce((s, r) => s + r.amount, 0);
    const confirmedRevenue = earning.filter((r) => r.confirmed).reduce((s, r) => s + r.amount, 0);
    const pendingRevenue = total - confirmedRevenue;

    // 12-month trailing series keyed by start_date month.
    const now = new Date();
    const buckets: { label: string; value: number }[] = [];
    const keyOf = (y: number, m: number) => y * 12 + m;
    const map = new Map<number, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = keyOf(d.getFullYear(), d.getMonth());
      map.set(k, 0);
      buckets.push({ label: MONTHS[d.getMonth()], value: 0 });
    }
    earning.forEach((r) => {
      if (!r.start) return;
      const k = keyOf(r.start.getFullYear(), r.start.getMonth());
      if (map.has(k)) map.set(k, (map.get(k) || 0) + r.amount);
    });
    const orderedKeys = [...map.keys()];
    const series = orderedKeys.map((k) => map.get(k) || 0);
    const thisMonth = series[series.length - 1] || 0;
    const lastMonth = series[series.length - 2] || 0;
    const momPct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

    // Top property by revenue.
    const byProp = new Map<string, number>();
    earning.forEach((r) => byProp.set(r.title, (byProp.get(r.title) || 0) + r.amount));
    let topProp = '';
    let topVal = 0;
    byProp.forEach((v, k) => {
      if (v > topVal) {
        topVal = v;
        topProp = k;
      }
    });
    const avg = byProp.size ? total / byProp.size : 0;
    const topPct = avg > 0 ? Math.round(((topVal - avg) / avg) * 100) : 0;

    const today = startOfDay(new Date());
    const upcoming = earning
      .filter((r) => r.start && startOfDay(r.start) >= today)
      .sort((a, b) => (a.start!.getTime() - b.start!.getTime()))
      .slice(0, 4);
    const history = earning
      .filter((r) => r.end && startOfDay(r.end) < today)
      .sort((a, b) => (b.end!.getTime() - a.end!.getTime()))
      .slice(0, 8);

    return {
      total,
      confirmedRevenue,
      pendingRevenue,
      series,
      labels: buckets.map((b) => b.label),
      momPct,
      topProp,
      topPct,
      upcoming,
      history,
    };
  }, [rows]);

  const exportStatement = useCallback(async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    let y = 20;

    const newPageIfNeeded = (needed = 10) => {
      if (y + needed > pageHeight - 15) {
        doc.addPage();
        y = 20;
      }
    };

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Hostiggo: Earnings Statement', marginX, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, marginX, y);
    doc.setTextColor(0);
    y += 12;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', marginX, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    [
      ['Total earnings', inr(stats.total)],
      ['Confirmed revenue', inr(stats.confirmedRevenue)],
      ['Pending revenue', inr(stats.pendingRevenue)],
    ].forEach(([label, value]) => {
      doc.text(label, marginX, y);
      doc.text(value, pageWidth - marginX, y, { align: 'right' });
      y += 6;
    });
    y += 6;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Monthly revenue (last 12 months)', marginX, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    stats.labels.forEach((label, i) => {
      newPageIfNeeded();
      doc.text(label, marginX, y);
      doc.text(inr(stats.series[i] ?? 0), pageWidth - marginX, y, { align: 'right' });
      y += 6;
    });
    y += 6;

    const earningRows = rows.filter((r) => !r.cancelled);
    newPageIfNeeded(14);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('All bookings', marginX, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Booking', marginX, y);
    doc.text('Check-in', marginX + 28, y);
    doc.text('Checkout', marginX + 58, y);
    doc.text('Property', marginX + 88, y);
    doc.text('Status', pageWidth - marginX - 24, y);
    doc.text('Amount', pageWidth - marginX, y, { align: 'right' });
    y += 2;
    doc.setDrawColor(200);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    if (earningRows.length === 0) {
      doc.text('No bookings yet.', marginX, y);
      y += 6;
    }
    earningRows
      .slice()
      .sort((a, b) => (b.start?.getTime() ?? 0) - (a.start?.getTime() ?? 0))
      .forEach((r) => {
        newPageIfNeeded();
        doc.text(`#${r.id}`, marginX, y);
        doc.text(fmtDate(r.start), marginX + 28, y);
        doc.text(fmtDate(r.end), marginX + 58, y);
        doc.text(r.title.slice(0, 26), marginX + 88, y);
        doc.text(r.confirmed ? 'Confirmed' : 'Pending', pageWidth - marginX - 24, y);
        doc.text(inr(r.amount), pageWidth - marginX, y, { align: 'right' });
        y += 6;
      });

    doc.save(`hostiggo-earnings-statement-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [stats, rows]);

  return (
    <HostDashboardShell active="earnings">
      <DashboardHeading
        title="Financial Overview"
        subtitle="Track your revenue and payouts across all properties."
        actions={
          <button
            onClick={exportStatement}
            disabled={loading || rows.length === 0}
            className="px-4 py-2 border border-gray-200 rounded-full text-sm font-medium flex items-center gap-2 text-gray-700 hover:bg-gray-50 transition-colors disabled:text-gray-300 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Download className="w-4 h-4" />
            Export Statement
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-12 gap-6">
          {['lg:col-span-4', 'lg:col-span-8', 'lg:col-span-4', 'lg:col-span-8', 'lg:col-span-12'].map(
            (span, i) => (
              <div
                key={i}
                className={cn('col-span-12 bg-white rounded-2xl p-6 border border-gray-100 shadow-card', span)}
              >
                <div className="h-6 w-1/3 bg-gray-100 rounded animate-pulse mb-6" />
                <div className="h-32 bg-gray-50 rounded animate-pulse" />
              </div>
            ),
          )}
        </div>
      ) : error ? (
        <BankProcessingNotice retrying={autoRetry.retrying} onRetry={autoRetry.manualRetry} />
      ) : rows.length === 0 ? (
        // Nothing to compute a chart/history/upcoming-payouts grid from yet
        // -- showing five separate empty widgets at once used to read as
        // "this is broken", not "no data". One clear message instead, with
        // copy that reflects whether payouts are actually ready to receive
        // money (bank verified and onboarded to Razorpay Route) or the host
        // still needs to set that up.
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card py-20 text-center px-6">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-figma-navy/5 flex items-center justify-center text-figma-navy">
            <CalendarClock className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Waiting on your first booking</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            {payoutMethod?.status === 'active'
              ? "Your payout account is verified and ready. As soon as a guest books one of your properties, your earnings and payout status will show up here."
              : payoutMethod
                ? "Your payout details are on file and being set up with Razorpay. Once that's done and a guest books, your earnings will show up here."
                : 'Once a guest books one of your properties, your earnings will show up here. Add your payout details in Settings so you get paid as soon as it happens.'}
          </p>
          {!payoutMethod && (
            <Link
              href="/host/settings"
              className="inline-flex items-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90"
            >
              <Landmark className="w-4 h-4" /> Set up payouts
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Total earnings */}
          <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl p-6 border border-gray-200 shadow-card relative overflow-hidden">
            <div className="flex justify-between items-start mb-6">
              <span className="p-3 bg-figma-navy/5 text-figma-navy rounded-xl inline-flex">
                <Wallet className="w-6 h-6" />
              </span>
              {stats.momPct !== null && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <span className={cn('font-bold', stats.momPct >= 0 ? 'text-green-600' : 'text-red-500')}>
                    {stats.momPct >= 0 ? '+' : ''}
                    {stats.momPct}%
                  </span>{' '}
                  vs last month
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Earnings</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-8 tracking-tight">{inr(stats.total)}</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-figma-navy" />
                  <span className="text-sm text-gray-500">Confirmed revenue</span>
                </div>
                <span className="text-sm font-bold text-gray-800">{inr(stats.confirmedRevenue)}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-figma-accent" />
                  <span className="text-sm text-gray-500">Pending revenue</span>
                </div>
                <span className="text-sm font-bold text-gray-800">{inr(stats.pendingRevenue)}</span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl p-6 border border-gray-200 shadow-card">
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-8 gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Revenue Growth</h3>
                <p className="text-xs text-gray-500">Revenue by month over the last year</p>
              </div>
            </div>
            <AreaChart series={stats.series} />
            <div className="flex justify-between mt-4 px-1 text-xs text-gray-400">
              {stats.labels.filter((_, i) => i % 2 === 0).map((m, i) => (
                <span key={`${m}-${i}`}>{m}</span>
              ))}
            </div>
          </div>

          {/* Upcoming */}
          <div className="col-span-12 md:col-span-5 lg:col-span-4 bg-white rounded-2xl p-6 border border-gray-200 shadow-card flex flex-col">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Upcoming Payouts</h3>
            <div className="space-y-4 flex-1">
              {stats.upcoming.length === 0 ? (
                <div className="text-sm text-gray-400 py-8 text-center">No upcoming payouts.</div>
              ) : (
                stats.upcoming.map((u) => (
                  <div
                    key={u.id}
                    className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-4 hover:border-figma-navy/30 transition-colors"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-figma-navy shadow-sm">
                      {u.confirmed ? <Clock className="w-5 h-5" /> : <ReceiptText className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{u.title}</p>
                      <p className="text-xs text-gray-500">Check-in {fmtDate(u.start)}</p>
                      {u.expectedSettlement && (
                        <p className="text-[11px] text-figma-navy/80">
                          Settles by {formatSettlementDate(u.expectedSettlement)}, 1 PM
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-figma-navy">{inr(u.amount)}</p>
                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full uppercase font-bold',
                          u.confirmed ? 'bg-figma-navy/5 text-figma-navy' : 'bg-figma-accent/10 text-figma-accent',
                        )}
                      >
                        {u.confirmed ? 'Confirmed' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Performance */}
          <div className="col-span-12 md:col-span-7 lg:col-span-8 bg-white rounded-2xl p-6 border border-gray-200 shadow-card flex items-center">
            <div className="max-w-md">
              <h3 className="text-lg font-bold text-gray-800 mb-2">Performance by Unit</h3>
              <p className="text-sm text-gray-500 mb-6">
                {stats.topProp
                  ? <>Your highest performing property is &apos;{stats.topProp}&apos;.</>
                  : 'No revenue recorded yet.'}
              </p>
              {stats.topProp && (
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-figma-navy/5 rounded-full">
                    <TrendingUp className="w-5 h-5 text-figma-navy" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">
                      {stats.topPct >= 0 ? '+' : ''}
                      {stats.topPct}% revenue
                    </p>
                    <p className="text-xs text-gray-500">Compared to portfolio average</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <div className="col-span-12 bg-white rounded-2xl p-6 border border-gray-200 shadow-card overflow-x-auto">
            <div className="flex justify-between items-center mb-6 px-1">
              <h3 className="text-lg font-bold text-gray-800">Recent Completed Stays</h3>
            </div>
            {stats.history.length === 0 ? (
              <div className="text-sm text-gray-400 py-10 text-center">No completed stays yet.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-200">
                    {['Booking', 'Checkout Date', 'Property', 'Amount', 'Payout'].map((th, i) => (
                      <th
                        key={th}
                        className={cn(
                          'pb-4 text-xs uppercase tracking-widest px-4 font-semibold',
                          i === 3 && 'text-right',
                          i === 4 && 'text-center',
                        )}
                      >
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.history.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-5 px-4 text-sm text-gray-800 font-mono">#{r.id}</td>
                      <td className="py-5 px-4 text-sm text-gray-500">{fmtDate(r.end)}</td>
                      <td className="py-5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center text-gray-600">
                            <Landmark className="w-4 h-4" />
                          </div>
                          <span className="text-sm text-gray-800 truncate max-w-[200px]">{r.title}</span>
                        </div>
                      </td>
                      <td className="py-5 px-4 text-right font-bold text-gray-800">{inr(r.amount)}</td>
                      <td className="py-5 px-4 text-center">
                        {(() => {
                          const { text, tone } = payoutLabel(r);
                          return (
                            <span
                              className={cn(
                                'px-3 py-1 rounded-full text-[11px] font-bold uppercase',
                                tone === 'green' && 'bg-green-100 text-green-700',
                                tone === 'blue' && 'bg-figma-navy/10 text-figma-navy',
                                tone === 'red' && 'bg-red-100 text-red-700',
                                tone === 'gray' && 'bg-gray-100 text-gray-500',
                              )}
                            >
                              {text}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Full payment & payout history -- every booking, nothing sliced */}
          <div className="col-span-12 bg-white rounded-2xl p-6 border border-gray-200 shadow-card overflow-x-auto">
            <div className="flex justify-between items-center mb-6 px-1">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Payments &amp; Payout History</h3>
                <p className="text-xs text-gray-500">Every booking, what the guest paid and what reached you.</p>
              </div>
            </div>
            {history.length === 0 && partialFailure ? (
              <div className="py-4">
                <BankProcessingNotice retrying={autoRetry.retrying} onRetry={autoRetry.manualRetry} />
              </div>
            ) : history.length === 0 ? (
              <div className="text-sm text-gray-400 py-10 text-center">No payments yet.</div>
            ) : (
              <table className="w-full border-collapse min-w-[900px]">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-200">
                    {['Booking', 'Property', 'Paid on', 'Guest paid', 'Fees & GST', 'Your payout', 'Payout status', 'Reference'].map((th, i) => (
                      <th
                        key={th}
                        className={cn(
                          'pb-4 text-xs uppercase tracking-widest px-4 font-semibold',
                          (i === 3 || i === 4 || i === 5) && 'text-right',
                        )}
                      >
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((h) => {
                    const { text, tone } = h.cancelled
                      ? { text: h.refundStatus === 'processed' ? 'Refunded' : 'Cancelled', tone: 'red' as const }
                      : payoutLabel({
                          transferStatus: h.transferStatus as Earn['transferStatus'],
                          settlementStatus: h.settlementStatus as Earn['settlementStatus'],
                        } as Earn);
                    const fees = (h.commission ?? 0) + (h.gst ?? 0);
                    return (
                      <tr key={h.bookingId} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-4 text-sm text-gray-800 font-mono">
                          #{h.bookingId}
                          {h.invoiceNumber && <div className="text-[10px] text-gray-400">{h.invoiceNumber}</div>}
                        </td>
                        <td className="py-4 px-4 text-sm text-gray-800 max-w-[200px] truncate">{h.title}</td>
                        <td className="py-4 px-4 text-sm text-gray-500">
                          {fmtDate(h.paidAt ?? h.bookedAt ? new Date((h.paidAt ?? h.bookedAt) as string) : null)}
                        </td>
                        <td className="py-4 px-4 text-right text-sm text-gray-800">
                          {h.guestAmount != null ? inr(h.guestAmount) : 'N/A'}
                        </td>
                        <td className="py-4 px-4 text-right text-sm text-gray-500">
                          {h.commission != null || h.gst != null ? inr(fees) : 'N/A'}
                        </td>
                        <td className="py-4 px-4 text-right font-bold text-gray-800">
                          {h.hostPayout != null ? inr(h.hostPayout) : 'N/A'}
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={cn(
                              'px-3 py-1 rounded-full text-[11px] font-bold uppercase whitespace-nowrap',
                              tone === 'green' && 'bg-green-100 text-green-700',
                              tone === 'blue' && 'bg-figma-navy/10 text-figma-navy',
                              tone === 'red' && 'bg-red-100 text-red-700',
                              tone === 'gray' && 'bg-gray-100 text-gray-500',
                            )}
                          >
                            {text}
                          </span>
                          {h.expectedSettlementAt && (
                            <p className="mt-1 text-[11px] text-gray-500">
                              Settles by {formatSettlementDate(new Date(h.expectedSettlementAt))}, 1 PM
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-4 text-xs text-gray-500 font-mono">
                          {h.utr ?? h.payoutReference ?? '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </HostDashboardShell>
  );
}
