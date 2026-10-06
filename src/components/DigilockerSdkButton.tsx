'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

// Surepass Digiboost Web SDK (https://github.com/surepassio/surepass-digiboost-web-sdk).
const SDK_SRC = 'https://cdn.jsdelivr.net/gh/surepassio/surepass-digiboost-web-sdk@latest/index.min.js';

type DigiboostWindow = Window & {
  DigiboostSdk?: (config: {
    gateway: 'sandbox' | 'production';
    token: string;
    selector?: string;
    style?: Record<string, string>;
    onSuccess?: (data: unknown) => void;
    onFailure?: (error: unknown) => void;
  }) => void;
};

let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if ((window as DigiboostWindow).DigiboostSdk) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SDK_SRC;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        sdkPromise = null;
        el.remove();
        reject(new Error('Could not load DigiLocker. Check your connection and try again.'));
      };
      document.head.appendChild(el);
    });
  }
  return sdkPromise;
}

export type DigilockerSession = { clientId: string; token: string; ticket: string };

type Props = {
  session: DigilockerSession;
  fullName: string;
  onResult: (result: { status: 'verified' | 'rejected'; reason: string | null }) => void;
  onError: (message: string) => void;
};

/** Mounts the Digiboost SDK button; on success, finalises the check server-side. */
export default function DigilockerSdkButton({ session, fullName, onResult, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const cb = useRef({ onResult, onError, fullName });
  cb.current = { onResult, onError, fullName };

  useEffect(() => {
    let cancelled = false;
    loadSdk()
      .then(() => {
        const container = containerRef.current;
        const sdk = (window as DigiboostWindow).DigiboostSdk;
        if (cancelled || !container || !sdk) return;
        container.innerHTML = '';
        const id = `digilocker-btn-${session.clientId}`;
        container.id = id;
        sdk({
          gateway: 'production',
          token: session.token,
          selector: `#${id}`,
          style: {
            backgroundColor: '#1d4ed8',
            color: 'white',
            padding: '14px 24px',
            borderRadius: '15px',
            fontSize: '15px',
            fontWeight: '600',
            width: '100%',
            border: 'none',
            cursor: 'pointer',
          },
          onSuccess: async () => {
            try {
              const result = await api.completeDigilocker({
                clientId: session.clientId,
                ticket: session.ticket,
                fullName: cb.current.fullName,
              });
              cb.current.onResult(result);
            } catch (err) {
              cb.current.onError(err instanceof Error ? err.message : 'Could not complete DigiLocker verification.');
            }
          },
          onFailure: () => cb.current.onError('DigiLocker verification was cancelled or failed. Please try again.'),
        });
        setReady(true);
      })
      .catch((err: Error) => cb.current.onError(err.message));
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <div>
      <div ref={containerRef} />
      {!ready && <p className="text-sm text-gray-500">Loading DigiLocker…</p>}
    </div>
  );
}
