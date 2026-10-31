import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, readJsonBody, requireUserId } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

type BookingMode = 'auto' | 'manual';

async function getHostListings(userId: string) {
  const { data: host, error: hostError } = await supabaseAdmin
    .from('host')
    .select('host_uuid')
    .eq('user_id', userId)
    .maybeSingle();

  if (hostError) throw hostError;
  if (!host) return { hostUuid: null, listings: [] as { booking_mode: string | null }[] };

  const { data: listings, error: listingsError } = await supabaseAdmin
    .from('listings')
    .select('booking_mode')
    .eq('host_uuid', host.host_uuid);

  if (listingsError) throw listingsError;
  return { hostUuid: host.host_uuid as string, listings: listings ?? [] };
}

function summarizeMode(listings: { booking_mode: string | null }[]): BookingMode | 'mixed' {
  if (listings.length === 0) return 'manual';
  const modes = new Set(listings.map((listing) => listing.booking_mode === 'auto' ? 'auto' : 'manual'));
  return modes.size > 1 ? 'mixed' : [...modes][0] as BookingMode;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;

    const { listings } = await getHostListings(userId);
    return NextResponse.json({
      bookingMode: summarizeMode(listings),
      listingCount: listings.length,
    });
  } catch (err) {
    console.error('[GET /api/host/booking-preferences] failed:', err);
    return NextResponse.json({ error: 'Could not load booking preferences.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;

    const body = await readJsonBody(req);
    if (body instanceof NextResponse) return body;
    if (body.bookingMode !== 'auto' && body.bookingMode !== 'manual') {
      return NextResponse.json({ error: 'Choose automatic or manual booking approval.' }, { status: 400 });
    }

    const { hostUuid, listings } = await getHostListings(userId);
    if (!hostUuid || listings.length === 0) {
      return NextResponse.json({ error: 'Create a listing before changing booking preferences.' }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from('listings')
      .update({ booking_mode: body.bookingMode as BookingMode, updated_at: new Date().toISOString() })
      .eq('host_uuid', hostUuid)
      .select('listing_id');

    if (error) throw error;
    return NextResponse.json({
      bookingMode: body.bookingMode,
      listingCount: data?.length ?? 0,
    });
  } catch (err) {
    console.error('[PATCH /api/host/booking-preferences] failed:', err);
    return NextResponse.json({ error: 'Could not save booking preferences.' }, { status: 500 });
  }
}
