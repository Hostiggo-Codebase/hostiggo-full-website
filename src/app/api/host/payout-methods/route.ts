import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureHostProfile, findHostUuid } from "@/lib/services/admin-writes";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { maskMiddle, sha256Hex } from "@/lib/surepass";
import { samePerson, verifyBankAccount, verifyPanNumber } from "@/lib/services/kycVerify";

export const dynamic = "force-dynamic";

// Bank account: digits only, 9-18 characters -- covers the real range of
// Indian bank account number lengths (there's no single fixed length).
const ACCOUNT_NUMBER_RE = /^\d{9,18}$/;
// Standard IFSC format: 4 letters (bank code) + '0' + 6 alphanumeric (branch code).
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// Standard PAN format: 5 letters + 4 digits + 1 letter.
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const POSTAL_CODE_RE = /^\d{6}$/;

async function latestValidBankVerification(userId: string, accountNumber: string) {
  const { data: requests } = await supabaseAdmin
    .from("kyc_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("service_type", "bank")
    .eq("status", "success");
  const ids = (requests ?? []).map((r) => r.id);
  if (ids.length === 0) return null;
  const { data } = await supabaseAdmin
    .from("bank_verifications")
    .select("bank_name, account_holder_name, created_at")
    .in("kyc_request_id", ids)
    .eq("is_valid", true)
    .eq("account_hash", sha256Hex(accountNumber))
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// A verified PAN is the id proof payouts require.
async function hasVerifiedPan(userId: string): Promise<boolean> {
  const { data: pan } = await supabaseAdmin
    .from("kyc_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("service_type", "pan")
    .eq("status", "verified")
    .limit(1)
    .maybeSingle();
  return Boolean(pan);
}

// The user's latest verified PAN, read from where verification is recorded
// (kyc_requests + pan_verifications) -- independent of whatever PAN string
// happens to be saved on the payout row, which can be blank.
async function latestVerifiedPan(userId: string) {
  const { data } = await supabaseAdmin
    .from("kyc_requests")
    .select("id, masked_id, created_at")
    .eq("user_id", userId)
    .eq("service_type", "pan")
    .eq("status", "verified")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { data: detail } = await supabaseAdmin
    .from("pan_verifications")
    .select("full_name")
    .eq("kyc_request_id", data.id)
    .maybeSingle();
  return { maskedPan: data.masked_id as string | null, verifiedAt: data.created_at as string, name: detail?.full_name ?? null };
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    // Read-only: opening this screen as a guest must not create a host row.
    const hostUuid = await findHostUuid(userId);
    if (!hostUuid) return NextResponse.json({ data: null });

    const readPayout = () =>
      supabaseAdmin
        .from("host_payout_methods")
        .select(
          "account_holder_name, bank_account_number, bank_ifsc, pan_number, address_line1, city, state, postal_code, status, created_at, updated_at",
        )
        .eq("host_uuid", hostUuid)
        .maybeSingle();
    let { data, error } = await readPayout();
    if (error) throw error;
    if (!data) {
      // Host verified their bank before verification started saving into
      // payout details -- build the row from that verified account.
      const { saveVerifiedPayoutDetails } = await import("@/lib/services/hostRouteOnboarding");
      await saveVerifiedPayoutDetails(userId);
      ({ data, error } = await readPayout());
      if (error) throw error;
    }

    if (!data) return NextResponse.json({ data: null });

    // Everything the settings page shows as "verified" is read back from
    // what SurePass actually returned and we stored -- never a UI guess.
    const [bankVerification, panVerification, bankProfile] = await Promise.all([
      latestValidBankVerification(userId, data.bank_account_number),
      latestVerifiedPan(userId),
      supabaseAdmin
        .from("host_bank_details")
        .select("bank_branch_name, upi_id")
        .eq("host_uuid", hostUuid)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle()
        .then((r) => r.data),
    ]);

    // Mask the account number for display -- the full number was only ever
    // needed at submit time; nothing after that should render it in full.
    const masked = {
      ...data,
      bank_account_number: data.bank_account_number ? `••••${data.bank_account_number.slice(-4)}` : "",
      bank_name: bankVerification?.bank_name ?? null,
      bank_branch: bankProfile?.bank_branch_name ?? null,
      upi_id: bankProfile?.upi_id ?? null,
      verification: {
        bank: {
          verified: Boolean(bankVerification),
          holderName: bankVerification?.account_holder_name ?? null,
          verifiedAt: bankVerification?.created_at ?? null,
        },
        pan: {
          verified: Boolean(panVerification),
          maskedPan: panVerification?.maskedPan ?? null,
          name: panVerification?.name ?? null,
          verifiedAt: panVerification?.verifiedAt ?? null,
        },
      },
    };

    return NextResponse.json({ data: masked });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[/api/host/payout-methods GET] error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

// PATCH: send only the fields you're changing; each provided field is
// validated on its own and only those columns are written, in one atomic
// update. Bank (account number / IFSC) and PAN changes are re-checked with
// SurePass first; name and address fields are plain updates. Every field is
// optional except that a brand-new payout method needs a holder name,
// account number and IFSC to exist at all.
export async function PATCH(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    const hostUuid = await ensureHostProfile(userId);

    const body = (await req.json().catch(() => ({}))) ?? {};
    const provided = (key: string) => body[key] !== undefined && body[key] !== null;
    const text = (key: string) => String(body[key] ?? "").trim();

    const { data: existing } = await supabaseAdmin
      .from("host_payout_methods")
      .select("account_holder_name, bank_account_number, bank_ifsc, pan_number, address_line1, city, state, postal_code")
      .eq("host_uuid", hostUuid)
      .maybeSingle();

    // Columns that will actually change, keyed by DB column.
    const changes: Record<string, string> = {};

    if (provided("accountHolderName")) {
      const name = text("accountHolderName");
      if (name.length < 2) {
        return NextResponse.json({ error: "Enter the account holder's full name." }, { status: 400 });
      }
      if (name !== existing?.account_holder_name) changes.account_holder_name = name;
    }

    // Bank: a blank account number means "keep the one on file" (it is never
    // sent to the browser in full).
    const accountNumber =
      (provided("bankAccountNumber") ? text("bankAccountNumber").replace(/\s+/g, "") : "") ||
      existing?.bank_account_number ||
      "";
    const ifsc = (provided("bankIfsc") ? text("bankIfsc").toUpperCase() : "") || existing?.bank_ifsc || "";
    const bankTouched = provided("bankAccountNumber") || provided("bankIfsc");
    if (bankTouched || !existing) {
      if (!ACCOUNT_NUMBER_RE.test(accountNumber)) {
        return NextResponse.json({ error: "Enter a valid bank account number." }, { status: 400 });
      }
      if (!IFSC_RE.test(ifsc)) {
        return NextResponse.json({ error: "Enter a valid IFSC code (e.g. HDFC0001234)." }, { status: 400 });
      }
    }
    const bankChanged =
      (bankTouched || !existing) &&
      (existing?.bank_account_number !== accountNumber || existing?.bank_ifsc !== ifsc);

    // PAN: optional. Blank keeps what's saved; never cleared through here.
    const pan = provided("panNumber") ? text("panNumber").toUpperCase() : "";
    if (pan && !PAN_RE.test(pan)) {
      return NextResponse.json({ error: "Enter a valid PAN (e.g. ABCDE1234F)." }, { status: 400 });
    }
    // A host who did KYC with their PAN can't change it here -- payouts use
    // that verified PAN. Only hosts who verified with Aadhaar / passport (no
    // verified PAN yet) enter one. A PAN matching the verified one (same
    // mask) is just filled in, without another SurePass lookup.
    const panOnFile = pan ? await latestVerifiedPan(userId) : null;
    if (pan && panOnFile?.maskedPan) {
      if (maskMiddle(pan) !== panOnFile.maskedPan) {
        return NextResponse.json(
          { error: "Your PAN is already verified and can't be changed here." },
          { status: 400 },
        );
      }
      if (pan !== existing?.pan_number) changes.pan_number = pan;
    }
    const panChanged = Boolean(pan) && !panOnFile?.maskedPan && pan !== existing?.pan_number;

    // Address fields: all optional, each updated independently.
    const postalCode = provided("postalCode") ? text("postalCode") : null;
    if (postalCode && !POSTAL_CODE_RE.test(postalCode)) {
      return NextResponse.json({ error: "Enter a valid 6-digit postal code." }, { status: 400 });
    }
    const plain: Array<[string, string, string | null]> = [
      ["addressLine1", "address_line1", provided("addressLine1") ? text("addressLine1") : null],
      ["city", "city", provided("city") ? text("city") : null],
      ["state", "state", provided("state") ? text("state") : null],
      ["postalCode", "postal_code", postalCode],
    ];
    for (const [, column, value] of plain) {
      if (value !== null && value !== (existing as Record<string, string> | null)?.[column]) {
        changes[column] = value;
      }
    }

    if (!existing) {
      if (!changes.account_holder_name) {
        return NextResponse.json({ error: "Enter the account holder's full name." }, { status: 400 });
      }
      if (!pan && !(await hasVerifiedPan(userId))) {
        return NextResponse.json(
          { error: "Enter your PAN to verify it -- it's required to receive payouts." },
          { status: 400 },
        );
      }
    }

    // Everything Razorpay Route onboarding needs is mandatory -- checked
    // before the SurePass lookups so an incomplete form costs nothing.
    const final: Record<string, string | null | undefined> = {
      ...existing,
      ...changes,
      bank_account_number: accountNumber,
      bank_ifsc: ifsc,
      pan_number: pan || existing?.pan_number,
    };
    const missing = (
      [
        ["account_holder_name", "account holder name"],
        ["bank_account_number", "bank account number"],
        ["bank_ifsc", "IFSC code"],
        ["pan_number", "PAN"],
        ["address_line1", "address"],
        ["city", "city"],
        ["state", "state"],
        ["postal_code", "postal code"],
      ] as const
    )
      .filter(([column]) => !final[column]?.trim())
      .map(([, label]) => label);
    if (missing.length > 0) {
      return NextResponse.json({ error: `Please fill in: ${missing.join(", ")}.` }, { status: 400 });
    }

    // Both lookups must match the name payouts will be made out to.
    const holderName = changes.account_holder_name ?? existing?.account_holder_name ?? null;
    
    // Only call SurePass when the account is new/changed or has no successful
    // verification on file. Re-checking an already-verified, unchanged account
    // on every save just burns the provider's rate limit and can block a host
    // whose details are fine.
    if (accountNumber) {
      const verifiedOnFile = bankChanged ? null : await latestValidBankVerification(userId, accountNumber);
      if (!verifiedOnFile) {
        const bank = await verifyBankAccount(userId, accountNumber, ifsc, holderName);
        if (!bank.verified) {
          return NextResponse.json(
            { error: `Bank account could not be verified: ${bank.reason ?? "please check the account number and IFSC."}` },
            { status: bank.rateLimited ? 429 : 400 },
          );
        }
      }
      if (bankChanged) {
        changes.bank_account_number = accountNumber;
        changes.bank_ifsc = ifsc;
      }
    }

    if (panChanged) {
      const result = await verifyPanNumber(userId, pan, holderName);
      if (result.status !== "verified") {
        return NextResponse.json(
          { error: `PAN could not be verified: ${result.reason ?? "please check the number and try again."}` },
          { status: 400 },
        );
      }
      changes.pan_number = pan;
    }

    // A name-only edit skips both lookups above, but this name is what
    // Razorpay pays out to (beneficiaryName in hostRouteOnboarding), so it
    // must still match the verified bank account and PAN on file.
    if (changes.account_holder_name && existing) {
      if (!bankChanged && accountNumber) {
        const onFile = await latestValidBankVerification(userId, accountNumber);
        if (onFile?.account_holder_name) {
          if (!samePerson(changes.account_holder_name, onFile.account_holder_name)) {
            return NextResponse.json(
              { error: "The account holder name must match the name on your bank account." },
              { status: 400 },
            );
          }
        } else {
          // No stored verification for this account -- re-check it live.
          const bank = await verifyBankAccount(userId, accountNumber, ifsc, changes.account_holder_name);
          if (!bank.verified) {
            return NextResponse.json(
              { error: `Bank account could not be verified: ${bank.reason ?? "please check the account number and IFSC."}` },
              { status: 400 },
            );
          }
        }
      }
      if (!panChanged) {
        const verifiedPan = await latestVerifiedPan(userId);
        if (verifiedPan?.name && !samePerson(changes.account_holder_name, verifiedPan.name)) {
          return NextResponse.json(
            { error: "The account holder name must match the name on your verified PAN." },
            { status: 400 },
          );
        }
      }
    }

    if (existing && Object.keys(changes).length === 0) {
      // Nothing to write, but still retry payout setup -- it may have failed
      // earlier for something fixed elsewhere (e.g. a phone number added in
      // Personal Info).
      const { maybeAutoOnboardHostToRoute } = await import("@/lib/services/hostRouteOnboarding");
      const onboardingError = await maybeAutoOnboardHostToRoute(userId);
      return NextResponse.json({ data: { status: "unchanged", onboardingError } });
    }
    // Any real change has to reach Razorpay: dropping back to 'submitted'
    // makes the onboarding run below upsert the new details onto the
    // existing linked account, stakeholder and settlement config.
    const reset = { status: "submitted", updated_at: new Date().toISOString() };
    if (existing) {
      const { error } = await supabaseAdmin
        .from("host_payout_methods")
        .update({ ...changes, ...reset })
        .eq("host_uuid", hostUuid);
      if (error) throw error;
    } else {
      // NOT NULL columns with nothing supplied are stored empty.
      const { error } = await supabaseAdmin.from("host_payout_methods").insert({
        host_uuid: hostUuid,
        account_holder_name: "",
        bank_account_number: accountNumber,
        bank_ifsc: ifsc,
        pan_number: "",
        address_line1: "",
        city: "",
        state: "",
        postal_code: "",
        ...changes,
        ...reset,
      });
      if (error) throw error;
    }

    if (changes.account_holder_name || bankChanged) {
      const { upsertHostBankDetails } = await import("@/lib/services/hostBankDetails");
      await upsertHostBankDetails({
        hostUuid,
        accountName: changes.account_holder_name,
        accountNumber: bankChanged ? accountNumber : undefined,
        ifsc: bankChanged ? ifsc : undefined,
      });
    }

    // Verified details are on file, so Route onboarding can start right away
    // rather than waiting for another verification call. Fail-soft.
    const { maybeAutoOnboardHostToRoute } = await import("@/lib/services/hostRouteOnboarding");
    const onboardingError = await maybeAutoOnboardHostToRoute(userId);
    const { data: after } = await supabaseAdmin
      .from("host_payout_methods")
      .select("status")
      .eq("host_uuid", hostUuid)
      .maybeSingle();

    return NextResponse.json({
      data: { status: after?.status ?? "submitted", updated: Object.keys(changes), onboardingError },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[/api/host/payout-methods PATCH] error:", err);
    return NextResponse.json({ error: "Could not save payout details." }, { status: 500 });
  }
}

// Kept so any older caller still posting the full form keeps working; it is
// the same partial-update logic.
export const POST = PATCH;
