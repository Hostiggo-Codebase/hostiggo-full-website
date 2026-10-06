import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { isSurepassConfigured, surepassPost, DIGILOCKER_CALLBACK_URL } from "@/lib/surepass";

export const dynamic = "force-dynamic";

const DIGILOCKER_INITIALIZE_ENDPOINT = "/api/v1/digilocker/initialize";

/**
 * Initialize DigiLocker verification flow for Aadhaar.
 * Returns a URL that the user should be redirected to for DigiLocker authentication.
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

    // Initialize DigiLocker session
    const res = await surepassPost(DIGILOCKER_INITIALIZE_ENDPOINT, {
      data: {
        signup_flow: true,
        redirect_url: DIGILOCKER_CALLBACK_URL,
        skip_main_screen: false,
      },
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.success) {
      console.error("[api/verify/digilocker/initialize] error:", res.status, json);
      return NextResponse.json(
        { error: json?.message || "Failed to initialize DigiLocker verification." },
        { status: res.status }
      );
    }

    const data = json.data ?? {};
    const clientId = data.client_id;
    const url = data.url;
    const expirySeconds = data.expiry_seconds;

    if (!clientId || !url) {
      console.error("[api/verify/digilocker/initialize] missing client_id or url:", json);
      return NextResponse.json(
        { error: "Invalid response from verification provider." },
        { status: 500 }
      );
    }

    // Store the client_id and user info in a temporary session (you might want to use Redis or database)
    // For now, we'll return it to the client and they'll pass it back in the callback
    return NextResponse.json({
      data: {
        clientId,
        url,
        expirySeconds,
        userId,
        fullName,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api/verify/digilocker/initialize] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to initialize DigiLocker verification." },
      { status: 500 }
    );
  }
}
