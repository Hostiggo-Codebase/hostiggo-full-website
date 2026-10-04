import HelpArticle, { A, List, Note, P } from "@/components/help/HelpArticle";

export const metadata = {
  title: "Cancellations & Refunds · Help",
  description: "Exactly how Hostiggo calculates refunds under the Flexible, Moderate and Strict cancellation policies.",
};

export default function RefundsHelpPage() {
  return (
    <HelpArticle
      title="Cancellations & refunds"
      updated="September 26, 2026"
      intro={
        <p>
          Every listing uses one of three Hostiggo cancellation policies, chosen by the host. Refunds
          are calculated automatically from that policy and the time left before check-in. There is no
          manual negotiation. The formal policy is in our{" "}
          <A href="/cancellation">Cancellation &amp; Refund Policy</A>.
        </p>
      }
      sections={[
        {
          id: "policies",
          title: "The three policies",
          body: (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-[14px] text-left border border-figma-border rounded-xl">
                <thead className="bg-figma-cream/60 text-figma-ink">
                  <tr>
                    <th className="p-3 font-semibold">Policy</th>
                    <th className="p-3 font-semibold">Cancel before the cutoff</th>
                    <th className="p-3 font-semibold">Cancel after the cutoff</th>
                  </tr>
                </thead>
                <tbody className="text-figma-ink/80">
                  <tr className="border-t border-figma-border">
                    <td className="p-3 font-semibold">Flexible</td>
                    <td className="p-3">Full refund if cancelled at least 24 hours before check-in</td>
                    <td className="p-3">No refund within 24 hours of check-in</td>
                  </tr>
                  <tr className="border-t border-figma-border">
                    <td className="p-3 font-semibold">Moderate</td>
                    <td className="p-3">Full refund if cancelled at least 5 days before check-in</td>
                    <td className="p-3">50% refund if cancelled less than 5 days but at least 24 hours before check-in. No refund within 24 hours of check-in</td>
                  </tr>
                  <tr className="border-t border-figma-border">
                    <td className="p-3 font-semibold">Strict</td>
                    <td className="p-3">Partial refund if cancelled at least 7 days before check-in: the host&apos;s set percentage (50% unless the host chose otherwise)</td>
                    <td className="p-3">No refund within 7 days of check-in</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ),
        },
        {
          id: "whats-refunded",
          title: "What \"full refund\" covers",
          body: (
            <>
              <P>
                Refunds are calculated on what you paid for the stay and any add-ons you booked with it. Taxes (GST) and Hostiggo&apos;s service fee, plus the
                GST on that fee, are <strong>never refundable</strong> under any policy. A &ldquo;full refund&rdquo;
                means the full amount you paid minus those taxes and fees.
              </P>
              <P>
                Add-ons can&apos;t be cancelled separately from the booking, but their price is included in the
                refund: the same policy percentage applies to the stay and add-ons together, and only the GST
                on add-ons is kept. See <A href="/help/add-ons">Add-on services</A>.
              </P>
            </>
          ),
        },
        {
          id: "timing",
          title: "How the time before check-in is measured",
          body: (
            <P>
              The countdown runs from the moment you confirm the cancellation to the start of your check-in
              date, which the system counts as 5:30 AM IST (midnight UTC) on that day. Example: with a Flexible
              policy and check-in on 10 October, you must cancel before 5:30 AM IST on 9 October to get a full
              refund.
            </P>
          ),
        },
        {
          id: "how-to-cancel",
          title: "Guests: how to cancel",
          body: (
            <List
              ordered
              items={[
                <>Go to <A href="/my-memories">My Memories</A> (your trips) and find the confirmed booking.</>,
                <>Click <strong>Cancel Booking</strong>. We show exactly how much you&apos;ll get back <em>before</em> you confirm.</>,
                <>Confirm. The booking is cancelled, the refund is sent to your original payment method via Razorpay, and the dates are opened up on the host&apos;s calendar again.</>,
              ]}
            />
          ),
        },
        {
          id: "special",
          title: "Special cases",
          body: (
            <>
              <List
                items={[
                  <>Only confirmed bookings can be cancelled, and a refund can only be started once per booking.</>,
                  <>If the host has already been paid for the booking when you cancel, the refund isn&apos;t sent automatically. It&apos;s flagged for our team to settle manually.</>,
                  <>If the refund fails at the payment provider, the booking is still cancelled and the refund is marked as failed for our team to follow up. Email support@hostiggo.com if you haven&apos;t received it.</>,
                ]}
              />
              <Note>
                In exceptional circumstances (e.g. government travel bans, natural disasters, safety risks),
                Hostiggo may allow full or partial refunds regardless of the policy. See the{" "}
                <A href="/cancellation">Cancellation &amp; Refund Policy</A>.
              </Note>
            </>
          ),
        },
        {
          id: "hosts",
          title: "Hosts: choosing a policy",
          body: (
            <P>
              You pick Flexible, Moderate or Strict in the listing wizard&apos;s <strong>Cancellation policy</strong>{" "}
              step. For Strict, you also set the partial-refund percentage (0–100%, default 50%). If a listing has
              no policy set, Moderate applies.
            </P>
          ),
        },
      ]}
    />
  );
}
