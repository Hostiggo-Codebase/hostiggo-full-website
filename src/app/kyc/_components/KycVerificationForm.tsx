'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Landmark, CheckCircle2, XCircle, Clock, FileText, BookUser, Upload, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import DigilockerSdkButton, { type DigilockerSession } from '@/components/DigilockerSdkButton';
import { deferKyc, markKycSubmitted } from '@/lib/kyc';
import { formatPanInput, isValidPanNumber } from '@/lib/pan';
import { useKycStatus } from '@/hooks/useKycStatus';
import BankDetailsNotice from '@/components/features/BankDetailsNotice';
import PayoutSetupPromptModal from '@/components/features/PayoutSetupPromptModal';

type IdResult = { status: 'verified' | 'rejected' | 'pending'; reason: string | null } | null;
type BankResult =
  | { verified: true; accountHolderName: string | null; bankName: string | null }
  | { verified: false; reason: string | null }
  | null;
type KycAudience = 'host' | 'guest';

// Any one of these verifies identity (KYC). Payouts additionally need a
// verified PAN -- Razorpay Route requires one to open the host's account.
type IdMethod = 'pan' | 'aadhaar' | 'passport';
const ID_METHODS: Record<IdMethod, { label: string; icon: typeof CreditCard }> = {
  pan: { label: 'PAN', icon: CreditCard },
  aadhaar: { label: 'Aadhaar', icon: FileText },
  passport: { label: 'Passport', icon: BookUser },
};

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;

function ResultBanner({ result }: { result: IdResult | BankResult }) {
  if (!result) return null;
  const ok = 'verified' in result ? result.verified === true : result.status === 'verified';
  const pending = 'status' in result && result.status === 'pending';
  const reason =
    'reason' in result ? result.reason : null;

  const Icon = ok ? CheckCircle2 : pending ? Clock : XCircle;
  const tone = ok
    ? 'bg-green-50 border-green-200 text-green-800'
    : pending
      ? 'bg-figma-navy/5 border-figma-navy/15 text-gray-700'
      : 'bg-red-50 border-red-200 text-red-700';

  const label = ok
    ? 'accountHolderName' in result && result.accountHolderName
      ? `Verified -- ${result.accountHolderName}${'bankName' in result && result.bankName ? ` (${result.bankName})` : ''}`
      : 'Verified'
    : reason || 'Could not verify. Please check the details and try again.';

  return (
    <div className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium', tone)}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{label}</span>
    </div>
  );
}

const PAYOUT_SETTINGS_HREF = '/host/settings?tab=payouts';

/**
 * ID + bank verification, shared by the standalone /kyc page and the
 * in-flow KYC modal. Two ordered steps, each backed by a direct SurePass
 * call (see src/lib/surepass.ts): first an id proof (Aadhaar, PAN or
 * passport -- any one verifies identity), then a bank account, which
 * unlocks once identity is verified (now or on an earlier visit). As soon
 * as the bank account verifies, the host is offered payout setup
 * (PayoutSetupPromptModal) -- Settings -> Payouts opens with the verified
 * bank details pre-filled and asks for PAN, since Razorpay Route
 * onboarding (hostRouteOnboarding.ts) needs a verified PAN whichever id
 * proof was used here.
 */
export function KycVerificationForm({
  userId,
  defaultName = '',
  audience = 'host',
  onCompleted,
  onSkipped,
  showSkip = true,
  onSetupPayouts,
}: {
  userId: string;
  defaultName?: string;
  audience?: KycAudience;
  onCompleted: () => void;
  onSkipped: () => void;
  showSkip?: boolean;
  /** "Set up payouts now" from the post-bank prompt. Defaults to navigating to Settings -> Payouts. */
  onSetupPayouts?: () => void;
}) {
  const router = useRouter();
  const { status: serverKycStatus, refresh: refreshKycStatus } = useKycStatus();
  const isHost = audience === 'host';
  const [fullName, setFullName] = useState(defaultName);
  const [idMethod, setIdMethod] = useState<IdMethod>('pan');
  const [pan, setPan] = useState('');
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [aadhaarPassword, setAadhaarPassword] = useState('');
  const [yob, setYob] = useState('');
  const [useDigilocker, setUseDigilocker] = useState(false);
  const [dlSession, setDlSession] = useState<DigilockerSession | null>(null);
  const [passportFileNo, setPassportFileNo] = useState('');
  const [dob, setDob] = useState('');
  const [verifiedMethod, setVerifiedMethod] = useState<IdMethod | null>(null);
  const [consent, setConsent] = useState(false);
  const [idSubmitting, setIdSubmitting] = useState(false);
  const [idResult, setIdResult] = useState<IdResult>(null);

  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankSubmitting, setBankSubmitting] = useState(false);
  const [bankResult, setBankResult] = useState<BankResult>(null);
  const [payoutPromptOpen, setPayoutPromptOpen] = useState(false);
  // Identity already verified on an earlier visit: the id step is collapsed
  // unless the host chooses to verify again with a different document.
  const [reverifyId, setReverifyId] = useState(false);

  useEffect(() => {
    if (defaultName) setFullName((current) => current || defaultName);
  }, [defaultName]);

  const thisYear = new Date().getFullYear();
  const isIdValid =
    idMethod === 'pan'
      ? isValidPanNumber(pan)
      : idMethod === 'aadhaar'
        ? useDigilocker 
          ? true // DigiLocker only needs name, validated by hasName check
          : Boolean(aadhaarFile) && aadhaarPassword.length > 0 && /^\d{4}$/.test(yob) && Number(yob) >= 1900 && Number(yob) <= thisYear
        : /^[A-Z0-9]{8,15}$/.test(passportFileNo) && Boolean(dob);
  const hasName = fullName.trim().length > 1;
  const canSubmitId = hasName && isIdValid && consent && !idSubmitting;

  // The bank check also compares the account holder against `fullName`.
  const isBankValid = ACCOUNT_RE.test(accountNumber) && IFSC_RE.test(ifsc);
  const canSubmitBank = hasName && isBankValid && !bankSubmitting;

  // KYC can be deferred from host onboarding and from optional guest profile
  // prompts. Booking-time guest verification can hide the skip action.
  const handleSkip = () => {
    deferKyc(userId);
    onSkipped();
  };

  const handleSubmitId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitId) return;

    setIdSubmitting(true);
    const label = ID_METHODS[idMethod].label;
    try {
      const name = fullName.trim();
      
      // Handle DigiLocker flow for Aadhaar
      if (idMethod === 'aadhaar' && useDigilocker) {
        const result = await api.initializeDigilocker(name);
        // The SDK button (rendered below the form) opens DigiLocker.
        setDlSession({ clientId: result.clientId, token: result.token, ticket: result.ticket });
        return;
      }
      
      const body =
        idMethod === 'pan'
          ? await api.verifyPan(pan.trim().toUpperCase(), name)
          : idMethod === 'aadhaar'
            ? await api.verifyAadhaar({ file: aadhaarFile as File, yob, fullName: name, password: aadhaarPassword })
            : await api.verifyPassport({ fileNumber: passportFileNo, dob, fullName: name });
      const status = body?.status ?? 'pending';
      setIdResult({ status, reason: body?.reason ?? null });
      if (status === 'verified') {
        setVerifiedMethod(idMethod);
        toast.success(`Your ${label} has been verified!`);
      } else if (status === 'rejected') {
        toast.error(body?.reason || `${label} verification failed.`);
      }
      markKycSubmitted(userId);
      refreshKycStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIdSubmitting(false);
    }
  };

  const handleSubmitBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitBank) return;

    setBankSubmitting(true);
    try {
      const body = await api.verifyBank({
        accountNumber,
        ifsc: ifsc.trim().toUpperCase(),
        fullName: fullName.trim(),
      });
      if (body?.verified) {
        setBankResult({
          verified: true,
          accountHolderName: body.accountHolderName ?? null,
          bankName: body.bankName ?? null,
        });
        toast.success('Your bank account has been verified!');
        setPayoutPromptOpen(true);
      } else {
        setBankResult({ verified: false, reason: body?.reason ?? null });
        toast.error(body?.reason || 'Could not verify that bank account.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBankSubmitting(false);
    }
  };

  // Bank verification is mandatory for hosts once ID proof is verified
  // because payouts need both. Guests stop after government ID verification.
  const idVerified = idResult?.status === 'verified';
  const idAlreadyVerified = serverKycStatus === 'verified';
  const showIdForm = !idAlreadyVerified || reverifyId || Boolean(idResult);
  // Bank details come second -- only once identity is verified.
  const bankUnlocked = idVerified || idAlreadyVerified;
  const bankVerified = bankResult?.verified === true;
  const somethingSubmitted = Boolean(idResult || bankResult);
  const canFinish = isHost ? !idVerified || bankVerified : idVerified || idAlreadyVerified;
  const canCompleteNow = (somethingSubmitted && canFinish) || (!isHost && idAlreadyVerified);

  return (
    <div className="space-y-6">
      {isHost && <BankDetailsNotice />}

      <div>
        <label htmlFor="fullName" className="block text-xs font-semibold text-gray-600 mb-1.5">
          {isHost ? 'Full name (as on your ID and bank account)' : 'Full name (as on your ID)'}
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Priya Sharma"
          maxLength={100}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 transition-all"
        />
      </div>

      {/* Step 1: ID verification */}
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 -mb-2">
        {isHost ? 'Step 1 - Identity' : 'Identity verification'}
      </p>
      {!showIdForm ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
          <span className="flex items-start gap-2 text-xs font-medium text-green-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            Your identity is already verified.
          </span>
          <button
            type="button"
            onClick={() => setReverifyId(true)}
            className="shrink-0 text-xs font-semibold text-figma-navy hover:underline"
          >
            Use a different ID
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmitId} className="space-y-4">
          <div>
            <p className="block text-xs font-semibold text-gray-600 mb-1.5">Verify your identity with</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="ID document">
              {(Object.keys(ID_METHODS) as IdMethod[]).map((m) => {
                const { label, icon: Icon } = ID_METHODS[m];
                const on = idMethod === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setIdMethod(m);
                      setIdResult(null);
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-all',
                      on
                        ? 'border-figma-navy bg-figma-navy/5 text-figma-navy'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                );
              })}
            </div>
            {isHost && idMethod !== 'pan' && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                {ID_METHODS[idMethod].label} verifies your identity, but a PAN is still required to receive
                payouts -- you can add it later in Settings → Payouts.
              </p>
            )}
          </div>

          {idMethod === 'pan' && (
            <div>
              <label htmlFor="pan" className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                PAN number
              </label>
              <input
                id="pan"
                type="text"
                value={pan}
                onChange={(e) => setPan(formatPanInput(e.target.value))}
                placeholder="ABCDE1234F"
                maxLength={10}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm tracking-widest uppercase outline-none focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 transition-all"
              />
              {pan.length === 10 && !isIdValid && (
                <p className="text-xs text-red-500 mt-1.5">That doesn&apos;t look like a valid PAN.</p>
              )}
            </div>
          )}

          {idMethod === 'aadhaar' && (
            <div className="space-y-3">
              {/* DigiLocker Option */}
              <div className="flex items-center justify-between gap-4 rounded-lg bg-blue-50 border border-blue-200 p-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900">Verify with DigiLocker</p>
                  <p className="text-xs text-blue-700 mt-0.5">Faster & easier - no PDF upload needed</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUseDigilocker(!useDigilocker)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    useDigilocker
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 border border-blue-600'
                  }`}
                >
                  {useDigilocker ? 'Using DigiLocker' : 'Use DigiLocker'}
                </button>
              </div>

              {/* eAadhaar PDF Upload - only show if not using DigiLocker */}
              {!useDigilocker && (
                <>
                  <div>
                    <label htmlFor="aadhaarFile" className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      eAadhaar PDF
                    </label>
                <label
                  htmlFor="aadhaarFile"
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-dashed border-gray-300 text-sm cursor-pointer hover:border-figma-navy/40 hover:bg-gray-50 transition-all"
                >
                  <Upload className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className={cn('truncate', aadhaarFile ? 'text-gray-900' : 'text-gray-400')}>
                    {aadhaarFile ? aadhaarFile.name : 'Choose your eAadhaar PDF (max 5 MB)'}
                  </span>
                </label>
                <input
                  id="aadhaarFile"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 5 * 1024 * 1024) {
                      toast.error('The PDF is too large (max 5 MB).');
                      return;
                    }
                    setAadhaarFile(f);
                  }}
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Download it from{' '}
                  <a
                    href="https://myaadhaar.uidai.gov.in/genricDownloadAadhaar"
                    target="_blank"
                    rel="noreferrer"
                    className="text-figma-navy underline"
                  >
                    myaadhaar.uidai.gov.in
                  </a>
                  . Upload the original PDF -- a scan or photo won&apos;t work.
                </p>
              </div>
              <div>
                <label htmlFor="aadhaarPassword" className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  eAadhaar PDF password
                </label>
                <input
                  id="aadhaarPassword"
                  type="password"
                  autoComplete="off"
                  value={aadhaarPassword}
                  onChange={(e) => setAadhaarPassword(e.target.value)}
                  placeholder="Enter the password for the downloaded PDF"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 transition-all"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  UIDAI eAadhaar PDFs usually use the first four letters of your name in capitals followed by your birth year.
                </p>
              </div>
              <div>
                <label htmlFor="yob" className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Year of birth
                </label>
                <input
                  id="yob"
                  type="text"
                  inputMode="numeric"
                  value={yob}
                  onChange={(e) => setYob(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1990"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 transition-all"
                />
              </div>
                </>
              )}
            </div>
          )}

          {idMethod === 'passport' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="passportFileNo" className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                  <BookUser className="w-3.5 h-3.5" />
                  Passport file number
                </label>
                <input
                  id="passportFileNo"
                  type="text"
                  value={passportFileNo}
                  onChange={(e) => setPassportFileNo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15))}
                  placeholder="DL1064145893512"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm uppercase outline-none focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 transition-all"
                />
              </div>
              <div>
                <label htmlFor="dob" className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Date of birth
                </label>
                <input
                  id="dob"
                  type="date"
                  value={dob}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 transition-all"
                />
              </div>
              <p className="col-span-2 text-[11px] text-gray-400">
                The file number is on the last page of your passport (not the passport number).
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-figma-navy focus:ring-figma-navy/30"
            />
            <span className="text-xs text-gray-500 leading-relaxed">
              I consent to Hostiggo collecting my {ID_METHODS[idMethod].label} details for
              identity verification, in accordance with the{' '}
              <a href="/privacy" target="_blank" className="text-figma-navy underline">
                Privacy Policy
              </a>
              .
            </span>
          </label>

          <ResultBanner result={idResult} />

          {dlSession && idMethod === 'aadhaar' && useDigilocker ? (
            <DigilockerSdkButton
              session={dlSession}
              fullName={fullName.trim()}
              onResult={(result) => {
                setDlSession(null);
                setIdResult({ status: result.status, reason: result.reason });
                if (result.status === 'verified') {
                  setVerifiedMethod('aadhaar');
                  toast.success('Your Aadhaar has been verified!');
                } else {
                  toast.error(result.reason || 'Aadhaar verification failed.');
                }
                markKycSubmitted(userId);
                refreshKycStatus();
              }}
              onError={(message) => {
                setDlSession(null);
                toast.error(message);
              }}
            />
          ) : (
          <button
            type="submit"
            disabled={!canSubmitId}
            className="w-full py-3 bg-figma-navy text-white text-sm font-semibold rounded-xl hover:bg-figma-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {idSubmitting
              ? 'Verifying…'
              : idMethod === 'aadhaar' && useDigilocker
                ? 'Continue with DigiLocker'
                : `Verify ${ID_METHODS[idMethod].label}`
            }
          </button>
          )}
        </form>
      )}

      {isHost && (
        <>
          <div className="h-px bg-gray-100" />

          {/* Step 2: Bank verification */}
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 -mb-2">
            Step 2 - Bank account
          </p>
          {!bankUnlocked ? (
            <div className="flex items-start gap-2 rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-500">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              Verify your identity above first -- then add the bank account your payouts should go to.
            </div>
          ) : (
            <form onSubmit={handleSubmitBank} className="space-y-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                <Landmark className="w-3.5 h-3.5" />
                Bank account verification
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bankAccount" className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Account number
                  </label>
                  <input
                    id="bankAccount"
                    type="text"
                    inputMode="numeric"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18))}
                    placeholder="219101000000000"
                    maxLength={18}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="bankIfsc" className="block text-xs font-semibold text-gray-600 mb-1.5">
                    IFSC code
                  </label>
                  <input
                    id="bankIfsc"
                    type="text"
                    value={ifsc}
                    onChange={(e) => setIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
                    placeholder="HDFC0001234"
                    maxLength={11}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm uppercase outline-none focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 transition-all"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                We verify the account is real without moving any money -- no OTP needed.
              </p>

              <ResultBanner result={bankResult} />

              <button
                type="submit"
                disabled={!canSubmitBank}
                className="w-full py-3 bg-figma-navy text-white text-sm font-semibold rounded-xl hover:bg-figma-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {bankSubmitting ? 'Verifying…' : 'Verify bank account'}
              </button>
            </form>
          )}
        </>
      )}

      {isHost && idVerified && !bankVerified ? (
        <p className="text-center text-xs font-medium text-gray-500">
          Bank verification is required to finish -- your{' '}
          {verifiedMethod ? ID_METHODS[verifiedMethod].label : 'ID'} is verified, now add your bank
          details above.
        </p>
      ) : (
        (showSkip || somethingSubmitted || (!isHost && idAlreadyVerified)) && (
          <button
            type="button"
            onClick={canCompleteNow ? onCompleted : handleSkip}
            className="w-full text-center text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
          >
            {canCompleteNow ? 'Done' : "Skip for now - I'll verify later"}
          </button>
        )
      )}

      {isHost && (
        <PayoutSetupPromptModal
          open={payoutPromptOpen}
          onSetupNow={() => {
            setPayoutPromptOpen(false);
            if (onSetupPayouts) onSetupPayouts();
            else router.push(PAYOUT_SETTINGS_HREF);
          }}
          onLater={() => {
            setPayoutPromptOpen(false);
            onCompleted();
          }}
        />
      )}
    </div>
  );
}
