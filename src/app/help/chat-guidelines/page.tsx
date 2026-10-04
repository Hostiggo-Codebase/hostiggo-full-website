import HelpArticle, { A, List, Note, P } from "@/components/help/HelpArticle";

export const metadata = {
  title: "Chat Guidelines · Help",
  description: "How guest and host messaging works on Hostiggo, and the rules for using it.",
};

export default function ChatGuidelinesPage() {
  return (
    <HelpArticle
      title="Chat guidelines"
      updated="September 26, 2026"
      intro={
        <p>
          Hostiggo chat lets guests and hosts talk directly about a stay. This page explains how it
          works, the limits the system enforces, and the conduct rules everyone agrees to follow.
        </p>
      }
      sections={[
        {
          id: "how",
          title: "How chat works",
          body: (
            <List
              items={[
                <>Guests start a conversation with <strong>Contact host</strong> on a property page or on their booking confirmation.</>,
                <>Guests find their conversations in <A href="/chat">Messages</A>; hosts use <A href="/host/chat">Host dashboard → Chat</A>.</>,
                <>You can search conversations and filter by status (for example, unread).</>,
              ]}
            />
          ),
        },
        {
          id: "limits",
          title: "What the system enforces",
          body: (
            <>
              <List
                items={[
                  <>Messages are text only, and empty messages can&apos;t be sent.</>,
                  <>Each message can be at most <strong>4,000 characters</strong>.</>,
                  <>Messages are stored on Hostiggo so both sides keep a record of what was agreed.</>,
                ]}
              />
              <Note>
                There is currently no automated filtering or monitoring of message content, and
                in-chat reporting is not yet available. The conduct rules below are Hostiggo platform
                policy. Breaking them can lead to action on your account once it&apos;s reported to us.
              </Note>
            </>
          ),
        },
        {
          id: "rules",
          title: "Conduct rules (platform policy)",
          body: (
            <List
              items={[
                <><strong>Keep payments on Hostiggo.</strong> Never ask for or send payment outside the platform (UPI, bank transfer, cash advance). Off-platform payments aren&apos;t covered by our cancellation and refund policy.</>,
                <><strong>Don&apos;t share sensitive data.</strong> Never share passwords, OTPs, card numbers or Aadhaar numbers in chat. Hostiggo will never ask for them in chat.</>,
                <><strong>Be respectful.</strong> No harassment, threats, hate speech, discriminatory or sexually explicit messages.</>,
                <><strong>Stay on topic.</strong> Use chat for the stay: questions, check-in details, directions, add-ons. No spam, advertising or unrelated promotions.</>,
                <><strong>Be honest.</strong> Don&apos;t misrepresent a property, a booking or your identity.</>,
                <><strong>Agree changes on the platform.</strong> Changes to dates, guests or price must go through a booking on Hostiggo, not just be agreed in chat.</>,
              ]}
            />
          ),
        },
        {
          id: "report",
          title: "How to report a problem",
          body: (
            <P>
              If someone breaks these rules or you feel unsafe, use <A href="/report-issue">Report an issue</A>{" "}
              or email{" "}
              <a href="mailto:support@hostiggo.com" className="text-figma-navy underline">support@hostiggo.com</a>{" "}
              with the name of the person and roughly when the messages were sent. For urgent safety
              concerns, see <A href="/safety">Safety information</A> and contact local emergency services first.
            </P>
          ),
        },
      ]}
    />
  );
}
