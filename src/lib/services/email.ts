import "server-only";

// Transactional email through Resend's HTTP API (no SDK needed). Optional and
// fail-soft by design: with RESEND_API_KEY unset it does nothing, and a send
// failure is logged, never thrown -- an email problem must not undo a booking
// or a refund.
//   RESEND_API_KEY=  EMAIL_FROM="Hostiggo <bookings@yourdomain>"  (verified sender)

const RESEND_URL = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Wraps plain lines in the one simple, client-safe layout all our emails share. */
export function renderEmail(params: { heading: string; lines: string[]; cta?: { label: string; url: string } }) {
  const body = params.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${escapeHtml(l)}</p>`).join("");
  const cta = params.cta
    ? `<p style="margin:20px 0"><a href="${escapeHtml(params.cta.url)}" style="background:#0b2a4a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(params.cta.label)}</a></p>`
    : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a"><h2 style="margin:0 0 16px;color:#0b2a4a">${escapeHtml(params.heading)}</h2>${body}${cta}<p style="margin-top:28px;font-size:12px;color:#777">Hostiggo · Homestays across India</p></div>`;
  const text = `${params.heading}\n\n${params.lines.join("\n\n")}${params.cta ? `\n\n${params.cta.label}: ${params.cta.url}` : ""}`;
  return { html, text };
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });
    if (!res.ok) {
      console.error("[email] send failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send error:", err);
    return false;
  }
}

/** Looks up the user's email and sends a notification-style message. */
export async function emailUser(
  userId: string,
  message: { subject: string; heading: string; lines: string[]; cta?: { label: string; url: string } },
): Promise<void> {
  if (!isEmailConfigured()) return;
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const { data } = await supabaseAdmin.from("users").select("email").eq("user_id", userId).maybeSingle();
  if (!data?.email) return;
  const { html, text } = renderEmail(message);
  await sendEmail({ to: data.email, subject: message.subject, html, text });
}
