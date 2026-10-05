import HelpArticle, { A, List, Note, P } from "@/components/help/HelpArticle";

export const metadata = {
  title: "Payouts & Bank Details · Help",
  description: "How Hostiggo hosts add bank details for payouts, what is deducted, and the current payout status.",
};

export default function PayoutsHelpPage() {
  return (
    <HelpArticle
      title="Payouts & bank details"
      updated="September 26, 2026"
      intro={
        <p>
          Only the host adds payout details, from their own host account. Guests never enter or
          see a host&apos;s bank information, and Hostiggo staff do not add it on your behalf.
        </p>
      }
      sections={[
        {
          id: "where",
          title: "Where to add your bank account",
          body: (
            <>
              <List
                ordered
                items={[
                  <>Sign in and open your host dashboard.</>,
                  <>
                    Go to <A href="/host/settings">Settings</A> and choose the{" "}
                    <strong>Payouts &amp; Taxes</strong> tab.
                  </>,
                  <>Fill in the payout form and save. You only need to do this once per host account.</>,
                ]}
              />
              <P>To change your details later, use the Edit button on the same tab and re-enter them.</P>
            </>
          ),
        },
        {
          id: "details",
          title: "What you'll need",
          body: (
            <List
              items={[
                <><strong>Account holder name</strong>, as it appears on your bank account / PAN.</>,
                <><strong>Bank account number</strong>: digits only, 9 to 18 characters.</>,
                <><strong>IFSC code</strong>: 11 characters, e.g. HDFC0001234 (4 letters, a zero, then 6 letters or digits).</>,
                <><strong>PAN</strong>: e.g. ABCDE1234F (5 letters, 4 digits, 1 letter).</>,
                <><strong>Address</strong>: address line, city, state and a 6-digit postal code.</>,
              ]}
            />
          ),
        },
        {
          id: "security",
          title: "How your details are stored",
          body: (
            <P>
              Your full account number is only used when you submit the form. After that it is always
              shown masked (for example ••••1234), including to you. To change the account, enter the
              full number again.
            </P>
          ),
        },
        {
          id: "status",
          title: "Payout status: what's live today",
          body: (
            <>
              <Note>
                Automatic bank transfers to hosts are <strong>not live yet</strong>. When you save your
                details, the status shows as <em>submitted</em>: &ldquo;We&apos;re setting up automatic
                payouts and will notify you once this account is ready to receive money.&rdquo;
              </Note>
              <P>The Payouts &amp; Taxes tab shows one of these statuses:</P>
              <List
                items={[
                  <><strong>Submitted</strong>: details saved; automatic payouts are still being set up.</>,
                  <><strong>Onboarding</strong>: your payout account is being verified.</>,
                  <><strong>Active</strong>: the account is ready to receive payouts.</>,
                  <><strong>Rejected</strong>: the account could not be verified. Review and resubmit your details.</>,
                ]}
              />
              <P>
                If you have questions about money owed for a completed stay, email{" "}
                <a href="mailto:support@hostiggo.com" className="text-figma-navy underline">support@hostiggo.com</a>.
              </P>
            </>
          ),
        },
        {
          id: "deductions",
          title: "How your payout is calculated",
          body: (
            <>
              <P>
                Your payout is based on the property price plus any breakfast and add-on services the
                guest booked. From that amount Hostiggo deducts:
              </P>
              <List
                items={[
                  <>5% Hostiggo commission</>,
                  <>1% TCS (tax collected at source)</>,
                  <>1% TDS (tax deducted at source)</>,
                ]}
              />
              <P>
                GST and the guest service fee are paid by the guest and are not part of your payout.
                Example: on a ₹10,000 stay, the net payout is ₹9,300.
              </P>
            </>
          ),
        },
        {
          id: "earnings",
          title: "Tracking your earnings",
          body: (
            <P>
              <A href="/host/earnings">Host dashboard → Earnings</A> shows your net earnings (after the
              deductions above), confirmed and pending revenue, and upcoming payouts per booking. You can
              also download a PDF report from there.
            </P>
          ),
        },
      ]}
    />
  );
}
