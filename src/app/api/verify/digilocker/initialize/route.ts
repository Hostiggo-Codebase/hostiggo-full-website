import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { isSurepassConfigured, surepassPost, signDigilockerTicket } from "@/lib/surepass";

export const dynamic = "force-dynamic";

const DIGILOCKER_INITIALIZE_ENDPOINT = "/api/v1/digilocker/initialize";

/**
 * Starts a DigiLocker session for the Digiboost Web SDK. Returns the SDK
 * `token` (valid ~10 min) plus a signed `ticket` tying the session to this
 * user; the client mounts the SDK button with the token and, on success,
 * calls /api/verify/digilocker/complete.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);

    if (!isSurepassConfigured()) {
      return NextResponse.json(
        { error: "DigiLocker verification is not configured. Contact support." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const fullName = String(body?.fullName ?? "").trim().slice(0, 100);
    if (fullName.length < 2) {
      return NextResponse.json(
        { error: "Enter your full name as it appears on your Aadhaar." },
        { status: 400 }
      );
    }

    // signup_flow must be true for the SDK. No redirect_url -- the SDK reports
    // completion through its onSuccess callback, not a redirect.
    const res = await surepassPost(DIGILOCKER_INITIALIZE_ENDPOINT, {
      data: { signup_flow: true, skip_main_screen: false },
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.success) {
      console.error("[api/verify/digilocker/initialize] provider error:", res.status, json);
      // A 401/403 here is SurePass refusing *our server* (key not enabled for
      // DigiLocker, or this host's IP not allow-listed on the SurePass
      // account) -- not the guest's session. Don't relay it as if it were.
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          {
            error: "DigiLocker is temporarily unavailable. Please try again later or upload your eAadhaar PDF.",
            code: "PROVIDER_ACCESS_DENIED",
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: json?.message || "Failed to initialize DigiLocker verification." },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    const { client_id: clientId, token, expiry_seconds: expirySeconds } = json.data ?? {};
    if (!clientId || !token) {
      console.error("[api/verify/digilocker/initialize] missing client_id or token:", json);
      return NextResponse.json({ error: "Invalid response from verification provider." }, { status: 502 });
    }

    return NextResponse.json({
      data: { clientId, token, expirySeconds, ticket: signDigilockerTicket(clientId, userId) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api/verify/digilocker/initialize] unexpected error:", err);
    return NextResponse.json({ error: "Failed to initialize DigiLocker verification." }, { status: 500 });
  }
}
