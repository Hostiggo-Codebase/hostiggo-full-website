'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type AuthIdentity = {
  dateOfBirth: string;
  gender: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  loaded: boolean;
  refresh: () => void;
};

/**
 * The profile fields the mobile app keeps on the Supabase auth user rather
 * than the `users` row: date of birth + gender (user_metadata) and the
 * email/phone verification timestamps. Needed so the web computes completion
 * from the same data as the app (see src/lib/profileCompletion.ts).
 */
export function useAuthIdentity(userId: string | null): AuthIdentity {
  const [state, setState] = useState({
    dateOfBirth: '',
    gender: '',
    emailVerified: false,
    phoneVerified: false,
    loaded: false,
  });
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!userId) {
      setState((s) => ({ ...s, loaded: true }));
      return;
    }
    let active = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        const u = data?.user;
        const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
        setState({
          dateOfBirth: typeof meta.date_of_birth === 'string' ? meta.date_of_birth.slice(0, 10) : '',
          gender: typeof meta.gender === 'string' ? meta.gender : '',
          emailVerified: Boolean(u?.email_confirmed_at),
          phoneVerified: Boolean(u?.phone_confirmed_at),
          loaded: true,
        });
      })
      .catch(() => {
        if (active) setState((s) => ({ ...s, loaded: true }));
      });
    return () => {
      active = false;
    };
  }, [userId, nonce]);

  return { ...state, refresh };
}
