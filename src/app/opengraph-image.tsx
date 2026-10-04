import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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
          <div style={{ fontSize: '64px', fontWeight: 800, letterSpacing: '-0.06em', lineHeight: 1.02 }}>
            Find your perfect stay
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
            <div style={{ fontSize: '15px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              Book with confidence
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a' }}>Secure • Transparent • Local</div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 600, color: '#0f172a' }}>hostiggo.com</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
