'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { hasDeferredKyc, hasSubmittedKyc, markKycSubmitted } from '@/lib/kyc';

export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected' | 'unknown';

export interface KycState {
  /** Server-authoritative status, with a local-flag fallback when the API is unreachable. */
  status: KycStatus;
  /** ISO timestamp of the submission, if any. */
  submittedAt: string | null;
  /** Why a 'rejected' submission failed, from the SurePass verification result. */
  reason: string | null;
  /** The host chose "verify later" -- KYC is optional, so we honor this. */
  deferred: boolean;
  loading: boolean;
  /** Re-fetch (e.g. after a submission). */
  refresh: () => void;
}

/**
 * Resolves a user's PAN KYC state from GET /api/kyc/status, falling back to
 * the per-browser localStorage flags in src/lib/kyc.ts when the API can't be
 * reached. Used by the host dashboard banner and Settings.
 */
export function useKycStatus(): KycState {
  const { userId } = useAuth();
  const [status, setStatus] = useState<KycStatus>('unknown');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [deferred, setDeferred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!userId) {
      setStatus('unknown');
      setDeferred(false);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setDeferred(hasDeferredKyc(userId));

    fetch(`/api/kyc/status?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((body) => {
        if (!active) return;
        const data = body?.data ?? {};
        let next: KycStatus = data.status ?? 'unknown';

        // The server is the source of truth, but if it can't be read and the
        // user has a local "submitted" flag, treat it as unknown rather than
        // showing a misleading "pending" status.
        if ((next === 'unknown' || next === 'none') && hasSubmittedKyc(userId)) {
          next = 'unknown';
        }
        // Keep the local flag in sync so offline reads stay accurate.
        if (next === 'verified') markKycSubmitted(userId);

        setStatus(next);
        setSubmittedAt(data.submittedAt ?? null);
        setReason(data.reason ?? null);
      })
      .catch(() => {
        if (!active) return;
        setStatus('unknown');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, nonce]);

  return { status, submittedAt, reason, deferred, loading, refresh };
}
