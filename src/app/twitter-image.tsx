import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #fff7ed 0%, #dbeafe 100%)',
          padding: '72px 84px',
          fontFamily: 'sans-serif',
          color: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0f172a',
              color: '#ffffff',
              fontSize: '28px',
              fontWeight: 700,
            }}
          >
            H
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.04em' }}>Hostiggo</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ fontSize: '62px', fontWeight: 800, letterSpacing: '-0.06em', lineHeight: 1.05 }}>
            Someday’s stay starts here
          </div>
          <div style={{ fontSize: '30px', color: '#374151', lineHeight: 1.25 }}>
            Handpicked homestays, verified hosts, and secure bookings across India.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>hostiggo.com</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
