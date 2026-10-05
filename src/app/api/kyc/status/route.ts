import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { forbiddenResponse, requireUserId } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const ID_PROOF_TYPES = ['pan', 'aadhaar', 'passport'];

const normalizeKycStatus = (status: unknown) => {
  if (status === 'verified' || status === 'success') return 'verified';
  if (status === 'pending') return 'pending';
  if (status === 'rejected' || status === 'failed') return 'rejected';
  return 'unknown';
};

// Live id-proof KYC status for a user, so the host dashboard banner and
// Settings -> Identity Verification reflect the real verification state
// instead of a client-only "I submitted once" localStorage flag. Follows
// the caller's verified session (see requireUserId).
//
// Id proof is any one of PAN, Aadhaar (eAadhaar PDF) or passport, verified
// through /api/verify/{pan,aadhaar,passport}. Payouts separately require a
// verified PAN -- see maybeAutoOnboardHostToRoute.
//
// status:
//   'none'     -- no id-proof submission on file
//   'verified' -- PAN, Aadhaar or passport verified by SurePass
//   'rejected' -- most recent submission was rejected, host needs to re-submit
//   'unknown'  -- couldn't read (storage error); caller should fall back to
//                 its local flag rather than assume 'none'
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    const requested = req.nextUrl.searchParams.get('userId');
    if (requested && requested !== userId) return forbiddenResponse();

    // A single verified id proof is enough, even if a later retry was rejected.
    const [verified, latest] = await Promise.all([
      supabaseAdmin
        .from('kyc_requests')
        .select('created_at, service_type')
        .eq('user_id', userId)
        .in('service_type', ID_PROOF_TYPES)
        .in('status', ['verified', 'success'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('kyc_requests')
        .select('status, error_message, created_at')
        .eq('user_id', userId)
        .in('service_type', ID_PROOF_TYPES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (verified.error || latest.error) {
      console.error('[api/kyc/status] failed to read status:', verified.error ?? latest.error);
      return NextResponse.json({ data: { status: 'unknown' } }, { status: 200 });
    }

    if (verified.data) {
      return NextResponse.json({
        data: {
          status: 'verified',
          submittedAt: verified.data.created_at,
          reason: null,
          method: verified.data.service_type,
        },
      });
    }
    if (!latest.data) {
      return NextResponse.json({ data: { status: 'none' } });
    }
    return NextResponse.json({
      data: {
        status: normalizeKycStatus(latest.data.status),
        submittedAt: latest.data.created_at,
        reason: latest.data.error_message ?? null,
      },
    });
  } catch (err) {
    console.error('[api/kyc/status] unexpected error reading status:', err);
    return NextResponse.json({ data: { status: 'unknown' } }, { status: 200 });
  }
}
