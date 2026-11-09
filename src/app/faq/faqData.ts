// Shared by the FAQ page (visible accordion) and its layout (FAQPage JSON-LD),
// so the structured data can never drift from what visitors actually read.
export type QA = { q: string; a: string };
export type Category = { title: string; items: QA[] };

export const CATEGORIES: Category[] = [
  {
    title: 'Booking & payments',
    items: [
      {
        q: 'How do I pay for a booking?',
        a: 'Payment happens on Hostiggo through Razorpay at the time you book — you never pay a host directly. Your booking is only confirmed once the payment is verified.',
      },
      {
        q: 'Why was my card charged before the host confirmed?',
        a: "Most listings are instant-book, so payment and confirmation happen together. If a charge appears without a confirmed booking, contact support — see our Report an issue page.",
      },
      {
        q: 'Can I change my booking dates after paying?',
        a: 'Date changes go through the same flow as a cancellation and rebooking, since pricing and availability can differ. Check the listing\'s cancellation policy first.',
      },
    ],
  },
  {
    title: 'Cancellations & refunds',
    items: [
      {
        q: 'What cancellation policy applies to my booking?',
        a: "The policy shown at checkout for that specific listing is the one that applies — it's locked in at the time you book, not whatever is shown later.",
      },
      {
        q: 'How long do refunds take?',
        a: 'Refunds are calculated automatically based on the cancellation policy and initiated right away — it takes 5-7 banking days to reach your account, depending on your bank or card issuer.',
      },
      {
        q: 'Can a host refuse to refund me?',
        a: "No — refunds follow the platform-enforced policy shown at checkout, not something negotiated with the host. See our Cancellation & Refund Policy for the exact rules.",
      },
    ],
  },
  {
    title: 'Hosting',
    items: [
      {
        q: 'How do I list my property?',
        a: 'Start from Become a host — you\'ll go through identity verification, then set up your listing details, photos, pricing, and house rules.',
      },
      {
        q: 'When do I get paid as a host?',
        a: "Payouts are released after guest check-in, once the cancellation window for that booking has passed. You can track earnings from your host dashboard.",
      },
      {
        q: 'Can I set my own cancellation policy?',
        a: 'You choose from the cancellation policy options available on your listing settings — but whichever one you pick is the one enforced automatically, for every booking.',
      },
    ],
  },
  {
    title: 'Account & safety',
    items: [
      {
        q: 'Is my personal data shared with hosts or guests?',
        a: "Only what's needed to complete a booking (name, contact details for coordinating the stay). See our Privacy Policy for the full picture.",
      },
      {
        q: 'How do I report a safety concern or a listing that looks wrong?',
        a: 'Use Report an issue or see our Safety Information page — safety and payment issues are prioritized with a target response time of under 4 hours.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Account deletion is available from your profile settings. Deleting your account does not cancel bookings that are already in progress.',
      },
    ],
  },
];
