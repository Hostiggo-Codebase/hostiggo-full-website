import { ImageResponse } from 'next/og';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site';

// Default share card for links to the site (WhatsApp, Instagram, X, Facebook).
export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Brand logo inlined so the share card renders without a network fetch.
const LOGO_DATA_URI = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo-circle.png')).toString('base64')}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #f7f3eb 0%, #ecf2ff 100%)',
          padding: '72px 84px',
          fontFamily: 'sans-serif',
          color: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img src={LOGO_DATA_URI} width={54} height={54} alt="" style={{ borderRadius: '27px' }} />
          <div style={{ fontSize: '28px', fontWeight: 700 }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ fontSize: '64px', fontWeight: 800, lineHeight: 1.02 }}>
            {SITE_TAGLINE}
          </div>
          <div style={{ fontSize: '30px', color: '#374151', lineHeight: 1.25 }}>
            Verified homestays and unique stays across India.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            borderRadius: '24px',
            padding: '20px 28px',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ fontSize: '15px', color: '#475569', textTransform: 'uppercase' }}>
              Book with confidence
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a' }}>
              Secure - Transparent - Local
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 600, color: '#0f172a' }}>
            {SITE_URL.replace(/^https?:\/\//, '')}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
