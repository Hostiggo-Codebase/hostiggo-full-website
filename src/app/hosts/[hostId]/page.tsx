import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Award, Home, MessageSquare, ShieldCheck, Star, Users } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { UserAvatar } from '@/components/ui/user-avatar';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatINR } from '@/lib/format';

type HostListing = {
  listing_id: number;
  title: string | null;
  price_weekday: number | null;
  price_weekend: number | null;
  locations: { district?: string | null; state?: string | null } | null;
  listing_media: { media_url?: string | null; is_cover?: boolean | null }[] | null;
};

const plural = (count: number, label: string) => `${count} ${label}${count === 1 ? '' : 's'}`;

function listingImage(listing: HostListing) {
  const media = listing.listing_media ?? [];
  return media.find((item) => item.is_cover)?.media_url ?? media[0]?.media_url ?? '/placeholder.svg';
}

export default async function PublicHostProfilePage({
  params,
}: {
  params: Promise<{ hostId: string }>;
}) {
  const { hostId } = await params;

  const { data: host } = await supabaseAdmin
    .from('host')
    .select('host_uuid, user_id, photo, is_verified, about, created_at')
    .eq('host_uuid', hostId)
    .maybeSingle();

  if (!host) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const [userResult, listingsResult, tripsResult] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('name, profile_pic_url, created_at')
      .eq('user_id', host.user_id)
      .maybeSingle(),
    supabaseAdmin
      .from('listings')
      .select(
        'listing_id, title, price_weekday, price_weekend, locations (district, state), listing_media (media_url, is_cover)',
      )
      .eq('host_uuid', hostId)
      .eq('is_active', true)
      .order('listing_id', { ascending: false })
      .limit(12),
    supabaseAdmin
      .from('bookings')
      .select('booking_id', { count: 'exact', head: true })
      .eq('host_uuid', hostId)
      .eq('status_id', 2)
      .lte('end_date', today),
  ]);

  const listings = (listingsResult.data ?? []) as HostListing[];
  const listingIds = listings.map((listing) => listing.listing_id);
  const reviewsResult = listingIds.length
    ? await supabaseAdmin
        .from('review')
        .select('rating, comment, reviewd_at')
        .in('listing_id', listingIds)
        .order('reviewd_at', { ascending: false })
        .limit(100)
    : { data: [] as Array<{ rating: number | null; comment: string | null; reviewd_at: string | null }> };

  const reviews = reviewsResult.data ?? [];
  const ratingCount = reviews.filter((review) => review.rating != null).length;
  const averageRating =
    ratingCount > 0
      ? reviews.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) / ratingCount
      : null;
  const hostName = userResult.data?.name ?? 'Host';
  const avatar = userResult.data?.profile_pic_url ?? host.photo ?? null;
  const joined = new Date(userResult.data?.created_at ?? host.created_at ?? Date.now()).getFullYear();

  return (
    <div className="min-h-screen bg-figma-cream">
      <Navbar />
      <main className="container-main py-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-3xl border border-gray-200 bg-white p-7 text-center shadow-card">
              <UserAvatar
                src={avatar}
                name={hostName}
                size={112}
                className="mx-auto mb-4 border-4 border-figma-navy/10 shadow-sm"
              />
              <h1 className="text-2xl font-bold text-gray-900">{hostName}</h1>
              <p className="mt-1 text-sm font-medium text-gray-500">Host since {joined}</p>
              {host.is_verified && (
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
                  <ShieldCheck className="h-4 w-4" />
                  Verified host
                </div>
              )}
              <div className="mt-6 grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 pt-5">
                <div>
                  <p className="text-lg font-bold text-gray-900">{listings.length}</p>
                  <p className="text-[11px] font-medium text-gray-500">Listings</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{tripsResult.count ?? 0}</p>
                  <p className="text-[11px] font-medium text-gray-500">Trips</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{averageRating ? averageRating.toFixed(1) : 'New'}</p>
                  <p className="text-[11px] font-medium text-gray-500">Rating</p>
                </div>
              </div>
              <Link
                href={`/chat?hostId=${encodeURIComponent(hostId)}`}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-figma-navy px-5 py-3 text-sm font-semibold text-white hover:bg-figma-navy/90"
              >
                <MessageSquare className="h-4 w-4" />
                Contact host
              </Link>
            </section>
          </aside>

          <div className="space-y-8">
            <section className="rounded-3xl border border-gray-200 bg-white p-7 shadow-card">
              <div className="flex items-center gap-3">
                <Award className="h-6 w-6 text-figma-navy" />
                <h2 className="text-xl font-bold text-gray-900">About {hostName}</h2>
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-600">
                {host.about ||
                  `${hostName} hosts stays on Hostiggo and helps guests settle in with local guidance, clear communication, and support during the trip.`}
              </p>
            </section>

            <section>
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{hostName}&apos;s listings</h2>
                  <p className="mt-1 text-sm text-gray-500">{plural(listings.length, 'active stay')}</p>
                </div>
              </div>

              {listings.length === 0 ? (
                <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-card">
                  <Home className="mx-auto mb-3 h-9 w-9 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-700">No active listings right now.</p>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {listings.map((listing) => {
                    const location = [listing.locations?.district, listing.locations?.state].filter(Boolean).join(', ');
                    return (
                      <Link
                        key={listing.listing_id}
                        href={`/property/${listing.listing_id}`}
                        className="group overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
                      >
                        <div className="aspect-[4/3] overflow-hidden bg-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={listingImage(listing)}
                            alt={listing.title ?? 'Host listing'}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                        <div className="p-4">
                          <p className="truncate text-sm font-bold text-gray-900">{listing.title ?? 'Untitled stay'}</p>
                          {location && <p className="mt-1 truncate text-xs text-gray-500">{location}</p>}
                          <p className="mt-3 text-sm font-bold text-gray-900">
                            {formatINR(Number(listing.price_weekday ?? listing.price_weekend ?? 0))}
                            <span className="font-medium text-gray-500"> / night</span>
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-7 shadow-card">
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-bold text-gray-900">
                    {averageRating ? `${averageRating.toFixed(1)} average rating` : 'No ratings yet'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  <Users className="h-5 w-5 text-gray-400" />
                  {plural(reviews.length, 'guest review')}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
