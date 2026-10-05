import HelpArticle, { A, List, Note, P } from "@/components/help/HelpArticle";

export const metadata = {
  title: "Removing a Listing · Help",
  description: "How delisting works on Hostiggo: nothing is deleted instantly and upcoming bookings are always honoured.",
};

export default function DelistingHelpPage() {
  return (
    <HelpArticle
      title="Removing (delisting) a listing"
      updated="September 26, 2026"
      intro={
        <p>
          &ldquo;Remove Listing&rdquo; never deletes your listing instantly. It records a removal
          request, and Hostiggo delists the listing only once it is safe to do so, so no guest with an
          upcoming stay is left without a booking.
        </p>
      }
      sections={[
        {
          id: "how",
          title: "How to request removal",
          body: (
            <List
              ordered
              items={[
                <>Open <A href="/host/listings">Listings</A> in your host dashboard and choose <strong>Manage</strong> on the listing.</>,
                <>In the left menu, click <strong>Remove Listing</strong>.</>,
                <>Confirm in the &ldquo;Remove this listing?&rdquo; dialog. The dialog tells you how many upcoming bookings the listing has.</>,
              ]}
            />
          ),
        },
        {
          id: "rules",
          title: "When the listing actually goes offline",
          body: (
            <>
              <List
                items={[
                  <><strong>No upcoming bookings:</strong> the listing is delisted within 24 hours of your request.</>,
                  <><strong>Upcoming bookings:</strong> the listing stays live and bookable until all of them are completed (the guest&apos;s check-out date has passed), then it is delisted.</>,
                ]}
              />
              <P>
                Cancelled bookings don&apos;t count. Pending removals are checked automatically every 15
                minutes, so the listing goes offline shortly after it becomes eligible: at least 24 hours
                after your request, with no remaining upcoming stays.
              </P>
            </>
          ),
        },
        {
          id: "pending",
          title: "While removal is pending",
          body: (
            <>
              <P>
                The manage page shows the request as pending, either with the date after which it will be
                delisted or with the number of upcoming bookings it is waiting on.
              </P>
              <P>
                Changed your mind? Click <strong>Cancel removal request</strong> on the same page at any
                time before the listing is delisted, and it stays live as normal.
              </P>
            </>
          ),
        },
        {
          id: "after",
          title: "After a listing is delisted",
          body: (
            <>
              <P>
                The listing is taken offline and no longer appears to guests. Its record and booking
                history are kept, not deleted. The manage page shows the date it was delisted.
              </P>
              <Note>
                A delisted listing can&apos;t be switched back on with the Pause/Reactivate toggle. To
                restore it, contact{" "}
                <a href="mailto:support@hostiggo.com" className="text-figma-navy underline">support@hostiggo.com</a>.
              </Note>
            </>
          ),
        },
        {
          id: "pause",
          title: "Just need a break? Pause instead",
          body: (
            <P>
              If you only want to stop new bookings for a while, use <strong>Pause listing</strong> on the
              manage page instead. You can reactivate a paused listing yourself at any time.
            </P>
          ),
        },
      ]}
    />
  );
}
