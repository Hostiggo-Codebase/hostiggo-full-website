import HelpArticle, { A, List, Note, P } from "@/components/help/HelpArticle";

export const metadata = {
  title: "Add-on Services · Help",
  description: "What add-on services are on Hostiggo, how hosts set them up, and how guests book them.",
};

const catalog: [string, string][] = [
  ["Food & Dining", "Breakfast, Lunch, Dinner, Snacks and evening tea, Packed meals for travelling, Private chef service"],
  ["Drive, Car & Transport", "Bike / Scooter Rental, Car Rental, Local Driver, Sightseeing Driver, Tempo Traveller"],
  ["Adventure & Experiences", "Camping & Bonfire Experience, Cycling Tours, River Rafting, Trekking Guide"],
  ["Events and Decorations", "Birthday decorations, Honeymoon setup, Proposal setup, Music / speaker arrangements, Small events and gathering"],
  ["Photography & Media", "Local Photographer, Videographer, Drone Shoot"],
  ["Wellness & Lifestyle", "Yoga Sessions, Meditation Sessions, Massage / Spa, Ayurveda & Wellness Programs"],
];

export default function AddOnsHelpPage() {
  return (
    <HelpArticle
      title="Add-on services"
      updated="September 26, 2026"
      intro={
        <p>
          Add-ons are optional paid extras a host offers alongside their stay, like breakfast, airport
          pickup or a guided trek. Each host chooses which add-ons to offer and sets their own price.
          Guests add them while booking.
        </p>
      }
      sections={[
        {
          id: "catalog",
          title: "Add-ons you can offer",
          body: (
            <>
              <P>Hosts pick from Hostiggo&apos;s add-on catalogue, grouped by category:</P>
              <List
                items={catalog.map(([cat, items]) => (
                  <>
                    <strong>{cat}:</strong> {items}
                  </>
                ))}
              />
            </>
          ),
        },
        {
          id: "wizard",
          title: "Hosts: adding add-ons while listing",
          body: (
            <>
              <P>
                The listing wizard includes an <strong>&ldquo;Offer extra add-ons&rdquo;</strong> step. It&apos;s
                optional, and you can skip it.
              </P>
              <List
                ordered
                items={[
                  <>Tap an add-on to select it.</>,
                  <>Enter the <strong>price per booking</strong> in rupees.</>,
                  <>Describe <strong>what&apos;s included</strong>, e.g. &ldquo;Continental breakfast for 2&rdquo;.</>,
                  <>Check the &ldquo;Selected add-ons&rdquo; summary, then continue. If nothing is selected, guests won&apos;t see any extras.</>,
                ]}
              />
            </>
          ),
        },
        {
          id: "manage",
          title: "Hosts: changing add-ons after publishing",
          body: (
            <P>
              Go to <A href="/host/listings">Listings</A> → <strong>Manage</strong> on the listing → <strong>Add-ons</strong> in the left
              menu. There you can add or remove add-ons, change prices and what&apos;s
              included, and set optional timings (from / to) and notes for guests.
            </P>
          ),
        },
        {
          id: "guests",
          title: "Guests: booking add-ons",
          body: (
            <>
              <P>
                On a property page, any add-ons the host offers are listed with their price and what&apos;s
                included. Select the ones you want before reserving. Their price and GST are added to your
                booking total and shown in the price breakdown before you pay.
              </P>
              <Note>
                Add-ons are part of your booking and can&apos;t be cancelled separately. If you cancel the
                booking, the add-on price is refunded together with the stay under the listing&apos;s
                cancellation policy (the GST on add-ons isn&apos;t refundable). See{" "}
                <A href="/help/refunds">Cancellations &amp; refunds</A>.
              </Note>
            </>
          ),
        },
        {
          id: "earnings",
          title: "Hosts: how add-ons are paid",
          body: (
            <P>
              Add-on revenue counts towards your payout together with the property price, with the same
              deductions (5% commission, 1% TCS, 1% TDS). See <A href="/help/payouts">Payouts &amp; bank details</A>.
            </P>
          ),
        },
      ]}
    />
  );
}
