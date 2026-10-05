import HelpArticle, { A, List, Note, P } from "@/components/help/HelpArticle";

export const metadata = {
  title: "Verify Your Identity · Help",
  description: "How Aadhaar identity verification works for Hostiggo hosts.",
};

export default function VerifyIdentityHelpPage() {
  return (
    <HelpArticle
      title="How to verify your identity"
      updated="September 26, 2026"
      intro={
        <p>
          Hostiggo verifies hosts using an eAadhaar PDF. Verification is <strong>optional</strong>:
          you can list and host without it, but verified hosts earn more guest trust and bookings.
        </p>
      }
      sections={[
        {
          id: "when",
          title: "When you'll be asked",
          body: (
            <>
              <P>
                The first time you start creating a listing, we show the verification page once. You
                can verify then, or choose <strong>&ldquo;Skip for now — I&apos;ll verify later&rdquo;</strong>.
                If you skip, the listing flow won&apos;t ask again.
              </P>
              <P>
                You can verify any time from{" "}
                <A href="/host/settings">Host Settings</A> → <strong>Identity Verification</strong> →{" "}
                <strong>Verify now</strong>.
              </P>
            </>
          ),
        },
        {
          id: "steps",
          title: "Step by step",
          body: (
            <List
              ordered
              items={[
                <>Download your digitally signed <strong>eAadhaar PDF</strong> from UIDAI and upload the original file. A scan or photo will not work.</>,
                <>Enter the <strong>PDF password</strong>. UIDAI usually uses the first four letters of your name in capitals followed by your birth year.</>,
                <>Enter your <strong>full name</strong> and <strong>year of birth</strong> exactly as they appear on the eAadhaar.</>,
                <>Tick the consent box allowing Hostiggo to use the eAadhaar details for identity verification, in line with our <A href="/privacy">Privacy policy</A>.</>,
                <>Submit. You&apos;ll see &ldquo;eAadhaar details received — verification is in progress.&rdquo;</>,
              ]}
            />
          ),
        },
        {
          id: "status",
          title: "Checking your status",
          body: (
            <>
              <P>Host Settings → Identity Verification shows one of:</P>
              <List
                items={[
                  <><strong>Verify now</strong>: you haven&apos;t submitted yet.</>,
                  <><strong>Pending</strong>: your documents are in and verification is in progress.</>,
                  <><strong>Verified</strong>: your identity has been successfully verified.</>,
                ]}
              />
            </>
          ),
        },
        {
          id: "privacy",
          title: "How your documents are protected",
          body: (
            <>
              <P>
                Hostiggo does not store the eAadhaar PDF or its password. The document is sent securely to
                the verification provider, and only the minimum masked verification details are retained.
              </P>
              <Note>
                Verification currently uses Aadhaar only. Bank and PAN details for payouts are collected
                separately, see <A href="/help/payouts">Payouts &amp; bank details</A>.
              </Note>
            </>
          ),
        },
      ]}
    />
  );
}
