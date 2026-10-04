import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Default share card for links to the site (WhatsApp, Instagram, X, Facebook).
export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #0b2c4d 0%, #1e3a5f 100%)",
          color: "white",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 44, marginTop: 24, opacity: 0.92 }}>{SITE_TAGLINE}</div>
        <div style={{ fontSize: 30, marginTop: 48, color: "#f5c542" }}>
          All-in prices · Exact refund dates · Verified stays
        </div>
      </div>
    ),
    size,
  );
}
