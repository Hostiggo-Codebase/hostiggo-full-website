"use client";

import { useAuth } from "@/context/AuthContext";
import {
  api,
  AUTH_EMAIL_KEY,
  AUTH_PHONE_KEY,
  normalizeEmail,
  normalizePhone,
  setStoredSession,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, ChevronDown, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { safeRedirect } from "@/lib/utils";

export type AuthMode = "email" | "mobile" | "otp-sent" | "otp-verify";

type AssetSet = {
  background: string;
  mascot: string;
  closeCircle: string;
  closeIcon: string;
};

// Self-hosted under public/assets/auth -- the original design PR linked
// directly to figma.com/api/mcp/asset/... URLs, which are an internal
// Figma dev-tool asset proxy, not a stable public CDN. Hotlinking those in
// production risks the mascot/icons breaking for real visitors with no
// warning. Downloaded once and served from this app instead.
const assets: Record<AuthMode, AssetSet> = {
  email: {
    background: "/assets/figma-auth-bg.jpg",
    mascot: "/assets/auth/mascot.png",
    closeCircle: "/assets/auth/close-circle-email-mobile.svg",
    closeIcon: "/assets/auth/close-icon-email-mobile.svg",
  },
  mobile: {
    background: "/assets/figma-auth-bg.jpg",
    mascot: "/assets/auth/mascot.png",
    closeCircle: "/assets/auth/close-circle-email-mobile.svg",
    closeIcon: "/assets/auth/close-icon-email-mobile.svg",
  },
  "otp-sent": {
    background: "/assets/figma-auth-bg.jpg",
    mascot: "/assets/auth/mascot.png",
    closeCircle: "/assets/auth/close-circle-otp-sent.svg",
    closeIcon: "/assets/auth/close-icon-otp-sent.svg",
  },
  "otp-verify": {
    background: "/assets/figma-auth-bg.jpg",
    mascot: "/assets/auth/mascot.png",
    closeCircle: "/assets/auth/close-circle-otp-verify.svg",
    closeIcon: "/assets/auth/close-icon-otp-verify.svg",
  },
};

const modeCopy = {
  email: { title: "Sign in with email id", value: "Enter email id" },
  mobile: { title: "Sign in with mobile", value: "Enter Mobile No." },
  "otp-sent": { title: "OTP sent successfully", value: "" },
  "otp-verify": { title: "OTP sent successfully", value: "" },
} as const;

function BrandPanel({ asset }: { asset: AssetSet }) {
  return (
    <div className="relative flex h-full min-h-[385px] flex-col overflow-hidden rounded-[20px] bg-[linear-gradient(to_bottom,#fff_0%,#73a7c7_100%)] px-6 pb-0 pt-4 sm:min-h-[480px] sm:px-8 sm:pt-5 lg:min-h-[598px] sm:rounded-[26px] lg:rounded-r-none lg:px-9 lg:pt-5">
      <div className="relative z-10">
        <p className="text-[25px] leading-[1.25] text-[#404040] sm:text-[29px] lg:text-[33px]">
          Welcome to,
        </p>
        <p className="mt-[-2px] text-[38px] font-bold leading-none tracking-[6px] text-[#303030] sm:text-[46px] lg:text-[52px]">
          Hostig<span className="text-[#0396ef]">go</span>
        </p>
      </div>
      <img
        src={asset.mascot}
        alt="Hostiggo travel mascot"
        className="pointer-events-none absolute bottom-0 -scale-x-100 object-contain max-w-none left-[53%] -translate-x-1/2 h-[260px] w-auto sm:h-[310px] sm:left-[52%] lg:left-1/2 lg:w-[894px] lg:h-[488px]"
        style={{ aspectRatio: "218/119" }}
      />
    </div>
  );
}

function FigmaAuthScreenContent({ mode: propMode = "mobile" }: { mode?: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryMode = searchParams?.get("mode");
  const redirect = safeRedirect(searchParams?.get("redirect"), "");
  const errorParam = searchParams?.get("error");
  const paramValue = searchParams?.get("value") || "";

  // Handle OAuth callback errors
  useEffect(() => {
    if (!errorParam) return;
    toast.error(
      errorParam === "access_denied"
        ? "Sign-in was cancelled."
        : errorParam === "account_deactivated"
          ? "This account has been deactivated. Contact support to reactivate it."
          : "Sign-in error. Please try again.",
    );
  }, [errorParam]);

  // Determine active mode: allow ?mode=email/mobile to override on non-OTP screens
  const isInitialOtp = propMode === "otp-sent" || propMode === "otp-verify";
  const activeMode: AuthMode = isInitialOtp
    ? propMode
    : queryMode === "email"
      ? "email"
      : queryMode === "mobile"
        ? "mobile"
        : propMode;

  const { signIn } = useAuth();
  const asset = assets[activeMode];
  const copy = modeCopy[activeMode];
  const isOtp = activeMode === "otp-sent" || activeMode === "otp-verify";

  // Form input state
  const [mobileValue, setMobileValue] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  // Every sign-in path installs the session in the Supabase client (not just
  // our token copy) -- that session is what keeps the user signed in across
  // reloads and gets refreshed in the background.
  const establishSession = async (
    session: { access_token: string; refresh_token: string },
    userId: string,
  ) => {
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (error) throw new Error("Couldn't start your session. Please try again.");
    setStoredSession(session.access_token, session.refresh_token);
    await signIn(userId);
  };

  // OTP State
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [timer, setTimer] = useState(20);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const verifyingRef = useRef(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

  // Determine active value & mode for OTP screen
  const otpMode: "phone" | "email" =
    queryMode === "email" || paramValue.includes("@") ? "email" : "phone";

  const [activeValue, setActiveValue] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (paramValue) {
      setActiveValue(paramValue);
      return;
    }
    const stored =
      otpMode === "email"
        ? localStorage.getItem(AUTH_EMAIL_KEY)
        : localStorage.getItem(AUTH_PHONE_KEY);
    if (stored) {
      setActiveValue(stored);
      return;
    }
    // No pending OTP session to show: /otp is a public route, reachable by
    // typing the URL directly with no ?value= and nothing in localStorage
    // (e.g. a fresh browser, or after clearing site data). This used to
    // fall through to a hardcoded "83183 XXXXX" placeholder phone number
    // below and render a fabricated "OTP sent successfully" screen despite
    // no OTP ever having been sent -- misleading, and a possible stale-
    // number leak on a shared device. Send them back to sign in instead;
    // this doesn't touch OTP verification itself, only this display state.
    if (isOtp) {
      router.replace(
        `/signin${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`,
      );
    }
  }, [paramValue, otpMode, isOtp, redirect, router]);

  // Masked string calculation
  const cleanPhone = activeValue.replace(/^\+91/, "").replace(/\D/g, "");
  const maskedValue =
    otpMode === "phone"
      ? cleanPhone.length >= 10
        ? `+91 ${cleanPhone.slice(0, 2)}XXXX${cleanPhone.slice(-2)}`
        : "your mobile number"
      : activeValue.replace(/(.{2}).*(@.*)/, "$1****$2") || "your email";

  // Auto-focus first input on OTP screen
  useEffect(() => {
    if (isOtp) {
      inputRefs.current[0]?.focus();
    }
  }, [isOtp]);

  // Countdown timer for OTP
  useEffect(() => {
    if (!isOtp) return;
    if (timer <= 0) return;

    const interval = setInterval(() => {
      setTimer((t) => t - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isOtp, timer]);

  // OTP input handlers
  // Each box accepts whatever the browser delivers: normally one digit, but
  // a fast typist can land a second keystroke in a box before focus has
  // moved on, and OS/browser one-time-code autofill (autocomplete=
  // "one-time-code") drops the whole 6-digit code into a single box. The
  // old handler kept only the last character (`slice(-1)`) against
  // `maxLength={1}` and wrote into a stale `otp` closure, so digits were
  // silently dropped and "Verify" stayed disabled or sent a wrong code --
  // reproduced on production: typing 346491 left only "3", "4", "6".
  // Now every digit received is spread across this box and the ones after
  // it, using a functional state update so no keystroke is lost.
  const handleDigitChange = (index: number, val: string) => {
    const digits = val.replace(/\D/g, "");
    if (!digits) {
      setOtp((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }
    // If the box already held a digit and one more was typed, the new
    // keystroke is the character that isn't the old value.
    const incoming =
      digits.length === 2 && otp[index] && digits.includes(otp[index])
        ? digits.replace(otp[index], "")
        : digits;
    const chars = incoming.slice(0, 6 - index).split("");
    setOtp((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => {
        next[index + i] = c;
      });
      return next;
    });
    const focusIndex = Math.min(index + chars.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    const newOtp = [...otp];
    pasted.split("").forEach((char, i) => {
      newOtp[i] = char;
    });
    setOtp(newOtp);
    const nextIndex = Math.min(pasted.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  // Resend OTP
  const handleResend = async () => {
    if (resending || timer > 0) return;
    setResending(true);
    try {
      if (otpMode === "email") {
        const emailToSend = normalizeEmail(activeValue);
        await api.sendEmailOtp(emailToSend);
      } else {
        const phoneToSend = normalizePhone(activeValue);
        await api.sendOtp(phoneToSend);
      }
      setOtp(Array(6).fill(""));
      setTimer(20);
      inputRefs.current[0]?.focus();
      toast.success("OTP sent again!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to resend OTP",
      );
    } finally {
      setResending(false);
    }
  };

  // Submit phone/email entry. Validates length/format itself (below) and
  // toasts an inline error -- the submit button used to be `disabled`
  // whenever this validation would fail, which meant a user typing a too-
  // short number or leaving the field empty and clicking "Send OTP" got a
  // completely silent no-op (a disabled button doesn't fire onClick/submit
  // at all) instead of ever seeing this toast. The button is no longer
  // disabled for invalid input so this validation is actually reachable;
  // it's still disabled while a request is in flight (`sending`).
  const submitEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendingRef.current) return;

    if (activeMode === "mobile") {
      const trimmed = mobileValue.trim();
      // Indian mobile numbers are 10 digits starting 6-9; anything else
      // can't receive an OTP and just burns an SMS request.
      if (!/^[6-9]\d{9}$/.test(trimmed)) {
        toast.error("Please enter a valid 10-digit Indian mobile number", { id: "signin-phone" });
        return;
      }
      sendingRef.current = true;
      setSending(true);
      try {
        const normalized = normalizePhone(trimmed);
        await api.sendOtp(normalized);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(AUTH_PHONE_KEY, normalized);
        }
        router.push(
          // The number is kept in localStorage (AUTH_PHONE_KEY, set just
          // above) instead of the URL, so it doesn't show in the address
          // bar, browser history, or Referer headers.
          `/otp?mode=phone${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ""}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to send OTP";
        if (msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("over")) {
          toast.error("Please wait a moment before requesting a new code");
        } else {
          toast.error(msg);
        }
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    } else if (activeMode === "email") {
      const trimmed = emailValue.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
        toast.error("Please enter a valid email address", { id: "signin-email" });
        return;
      }
      sendingRef.current = true;
      setSending(true);
      try {
        const normalized = normalizeEmail(trimmed);
        await api.sendEmailOtp(normalized);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(AUTH_EMAIL_KEY, normalized);
        }
        router.push(
          // Email kept in localStorage (AUTH_EMAIL_KEY), not the URL --
          // see the phone branch above.
          `/otp?mode=email${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ""}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to send OTP";
        // Supabase returns 429 over_email_send_rate_limit ("email rate limit
        // exceeded") when the project's email quota is used up -- show
        // something a guest can act on instead of the raw provider string.
        if (msg.toLowerCase().includes("rate limit")) {
          toast.error(
            "We couldn't send a code right now. Please try again in a few minutes, or sign in with Google or your mobile number.",
          );
        } else {
          toast.error(msg);
        }
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    }
  };

  // Verify OTP
  const submitOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verifyingRef.current) return;
    const code = otp.join("");
    if (code.length < 6) {
      toast.error("Please enter all 6 digits of the OTP");
      return;
    }

    verifyingRef.current = true;
    setVerifying(true);
    try {
      const storedPhone =
        activeValue ||
        (typeof window !== "undefined"
          ? window.localStorage.getItem(AUTH_PHONE_KEY) || ""
          : "");
      const storedEmail =
        activeValue ||
        (typeof window !== "undefined"
          ? window.localStorage.getItem(AUTH_EMAIL_KEY) || ""
          : "");

      const verifyParams =
        otpMode === "email"
          ? { email: normalizeEmail(storedEmail), token: code }
          : { phone: normalizePhone(storedPhone), token: code };

      const data = await api.verifyOtp(verifyParams);
      const userId = data?.user?.id || data?.session?.user?.id;
      const session = data?.session;

      if (userId && session) {
        await establishSession(session, userId);
        toast.success("Signed in successfully!");
        router.push(redirect || `/onboarding?mode=${otpMode}`);
      } else {
        toast.error("Could not verify OTP. Please try again.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid OTP");
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  // Google OAuth Login
  const handleGoogleSignIn = async () => {
    try {
      // Keep redirectTo a bare, fixed URL. Supabase validates it against the
      // dashboard "Redirect URLs" allow list, and an allow-list entry for
      // ".../auth/callback" does NOT match ".../auth/callback?redirect=..."
      // unless a wildcard was added -- a mismatch silently drops the user on
      // the Site URL instead. Stash where to land after login in
      // sessionStorage; the callback page reads it back.
      if (redirect) {
        try {
          window.sessionStorage.setItem("hostiggo:post-auth-redirect", redirect);
        } catch {
          /* private mode / storage disabled -- fall back to default landing */
        }
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) {
        toast.error("Google sign-in failed. Please try again.");
      }
    } catch {
      toast.error("Google sign-in failed. Please try again.");
    }
  };

  // Toggle between mobile & email modes
  const handleToggleMode = () => {
    const nextMode = activeMode === "email" ? "mobile" : "email";
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/signin/")) {
      router.push(`/signin/${nextMode}${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`);
    } else {
      router.push(`/signin?mode=${nextMode}${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ""}`);
    }
  };

  return (
    <main className="relative min-h-screen lg:h-screen lg:max-h-screen overflow-x-hidden lg:overflow-hidden bg-[#244246] font-[var(--font-poppins),sans-serif] text-[#1a1a1a]">
      {/* Background illustration */}
      <div className="absolute inset-0">
        <img
          src="/assets/figma-auth-bg.jpg"
          alt="Tropical leaves"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[#162d30]/35 backdrop-blur-[0.5px]" />
      </div>

      <div className="relative z-10 flex min-h-screen lg:min-h-0 lg:h-full items-center justify-center px-3 py-16 sm:px-6 sm:py-20 lg:px-10 lg:py-0">
        <div className="relative w-full max-w-[1114px] origin-center auth-modal-card">
          {/* Floating Close Button in tropical background above top-right of card (exact Figma / Sign in.svg coords) */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => router.push(redirect || "/")}
            className="absolute -top-[52px] right-2 sm:-top-[58px] sm:right-3 lg:right-4 z-30 flex h-[42px] w-[42px] items-center justify-center rounded-full bg-white shadow-[0_0_23px_rgba(0,0,0,0.25)] transition hover:scale-105 active:scale-95 cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-[#1D1D1D]"
            >
              <path
                d="M12 4L4 12M4 4L12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <section className="relative grid w-full grid-cols-1 overflow-hidden rounded-[28px] sm:rounded-[35px] bg-white shadow-[0_12px_60px_rgba(0,0,0,0.38)] lg:min-h-[630px] lg:grid-cols-[minmax(0,1fr)_495px]">
            <div className="h-full min-w-0 p-2.5 sm:p-3 lg:p-3.5 lg:pr-0 lg:-mr-12">
              <BrandPanel asset={asset} />
            </div>
            <div
              style={{
                background:
                  "radial-gradient(ellipse 115% 90% at 16% 12%, #D8F4FF 0%, #E9FEFF 42%, #FFFFFF 80%)",
              }}
              className="relative z-10 flex min-h-[470px] min-w-0 flex-col rounded-b-[28px] shadow-[-16px_0_35px_rgba(0,0,0,0.10),-4px_0_12px_rgba(0,0,0,0.05)] px-5 pb-6 pt-9 min-[400px]:px-7 sm:px-10 sm:pt-11 lg:min-h-[630px] lg:rounded-b-none lg:rounded-l-[32px] lg:px-9 lg:pt-[54px]"
            >
              {/* Back button on OTP */}
              {isOtp && (
                <button
                  type="button"
                  aria-label="Back"
                  onClick={() =>
                    router.push(
                      `/signin?mode=${otpMode === "email" ? "email" : "mobile"}${
                        redirect ? `&redirect=${encodeURIComponent(redirect)}` : ""
                      }`,
                    )
                  }
                  className="mb-8 flex h-7 w-7 items-center justify-center self-start rounded-full hover:bg-gray-100 transition cursor-pointer"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-700" />
                </button>
              )}

              <h1 className="text-[25px] font-semibold leading-[1.4] tracking-[0.09px] sm:text-[28px] lg:text-[30px]">
                {copy.title}
              </h1>

              {isOtp ? (
                <p className="mt-1 max-w-[371px] text-[15px] leading-[1.4] text-[#7b7b7b] sm:text-[17px] lg:text-[18px]">
                  We&apos;ve sent you the code on your{" "}
                  {otpMode === "phone" ? "mobile" : "email"}{" "}
                  <span className="font-semibold text-gray-800">
                    {maskedValue}
                  </span>
                </p>
              ) : (
                <p className="mt-1 max-w-[371px] text-[15px] leading-[1.4] text-[#7b7b7b] sm:text-[17px] lg:text-[18px]">
                  Sign in to access personalized travel plans made for you
                </p>
              )}

              {/* OTP Form */}
              {isOtp ? (
                <form onSubmit={submitOtp} className="mt-5">
                  <div
                    className="flex gap-1.5 min-[400px]:gap-2 sm:gap-2.5 justify-center my-3"
                    onPaste={handlePaste}
                  >
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          inputRefs.current[index] = el;
                        }}
                        value={digit}
                        onChange={(e) =>
                          handleDigitChange(index, e.target.value)
                        }
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        aria-label={`OTP digit ${index + 1}`}
                        className={`aspect-square min-w-0 flex-1 max-w-[48px] sm:max-w-[56px] rounded-full border text-center text-[22px] font-bold outline-none transition-all caret-transparent ${
                          digit
                            ? "border-[#0396ef] bg-white text-[#004772] shadow-sm"
                            : "border-transparent bg-[#ededed] text-gray-900 focus:border-[#0396ef] focus:bg-white"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Resend Timer */}
                  <div className="mt-2 text-right">
                    {timer > 0 ? (
                      <span className="text-[13px] text-[#6d6d6d]">
                        resend code after{" "}
                        <span className="font-semibold text-[#0396ef]">
                          {timer < 10 ? `0${timer}` : timer} sec
                        </span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resending}
                        className="text-[13px] font-semibold text-[#0396ef] hover:underline cursor-pointer disabled:opacity-50"
                      >
                        {resending ? "Resending..." : "Resend Code"}
                      </button>
                    )}
                  </div>

                  {/* Verify Action Button */}
                  <button
                    type="submit"
                    disabled={verifying || otp.join("").length !== 6}
                    className="mt-7 h-[57px] w-full rounded-[11px] bg-gradient-to-r from-[#004772] to-[#0086d8] text-[16px] font-semibold text-white transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed sm:text-[18px] shadow-sm flex items-center justify-center cursor-pointer"
                  >
                    {verifying ? "Verifying..." : "Verify"}
                  </button>
                </form>
              ) : (
                /* Phone / Email Entry Form */
                <form onSubmit={submitEntry} className="mt-7">
                  <div className="flex h-[53px] overflow-hidden rounded-[11px] bg-[#ebebeb]">
                    {activeMode === "mobile" && (
                      <div className="relative flex items-center">
                        <button
                          type="button"
                          onClick={() => setCountryOpen((open) => !open)}
                          className="flex h-full items-center justify-center gap-1.5 border-r border-gray-300 px-3 text-[16px] text-[#3a3a3a] outline-none cursor-pointer"
                        >
                          <span>+91</span>
                          <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                        </button>
                        {countryOpen && (
                          <div className="absolute left-0 top-[calc(100%+6px)] z-20 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-lg">
                            +91 (India)
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
                      {activeMode === "email" && (
                        <Mail className="h-5 w-5 text-gray-400 flex-shrink-0 ml-1" />
                      )}
                      <input
                        value={activeMode === "mobile" ? mobileValue : emailValue}
                        onChange={(event) =>
                          activeMode === "mobile"
                            ? setMobileValue(
                                event.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 10),
                              )
                            : setEmailValue(event.target.value)
                        }
                        type={activeMode === "email" ? "email" : "tel"}
                        inputMode={activeMode === "mobile" ? "numeric" : "email"}
                        aria-label={copy.value}
                        placeholder={copy.value}
                        className="min-w-0 flex-1 bg-transparent text-[16px] text-[#3a3a3a] outline-none placeholder:text-[#999] sm:text-[18px]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    className="mt-7 h-[57px] w-full rounded-[11px] bg-gradient-to-r from-[#004772] to-[#0086d8] text-[16px] font-semibold text-white transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed sm:text-[18px] shadow-sm flex items-center justify-center cursor-pointer"
                  >
                    {sending ? "Sending..." : "Send OTP"}
                  </button>
                </form>
              )}

              {/* Social Login Section (Google) */}
              {!isOtp && (
                <>
                  <div className="mt-6 flex items-center gap-4 text-[16px] text-[#7b7b7b] sm:text-[18px]">
                    <span className="h-px flex-1 bg-[#d5d5d5]" />
                    <span className="text-[14px]">OR</span>
                    <span className="h-px flex-1 bg-[#d5d5d5]" />
                  </div>

                  {/* Google Icon Circular Button */}
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    aria-label="Continue with Google"
                    className="mx-auto mt-4 flex h-[62px] w-[62px] items-center justify-center rounded-full border border-[#d8d8d8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition hover:scale-105 hover:bg-gray-50 cursor-pointer"
                  >
                    <GoogleIcon />
                  </button>

                  {/* Switch between Mobile and Email */}
                  <div className="mt-3 text-center">
                    <button
                      type="button"
                      onClick={handleToggleMode}
                      className="text-[13px] font-medium text-[#004772] hover:underline cursor-pointer"
                    >
                      {activeMode === "email"
                        ? "Sign in with mobile number instead"
                        : "Sign in with email instead"}
                    </button>
                  </div>
                </>
              )}

              {!isOtp && (
                <p className="mt-auto pt-7 text-center text-[11px] leading-[1.4] text-[#060518]/65 sm:text-[12px] lg:text-[13px]">
                  By continuing, you agree to Hostiggo&apos;s{" "}
                  <a href="/terms" className="text-[#0396ef]">
                    Terms and Conditions
                  </a>{" "}
                  and{" "}
                  <a href="/privacy" className="text-[#0396ef]">
                    Privacy Policy
                  </a>
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
      <style>{`
        @media (min-width: 1024px) and (max-height: 870px) {
          .auth-modal-card {
            transform: scale(0.92);
          }
        }
        @media (min-width: 1024px) and (max-height: 780px) {
          .auth-modal-card {
            transform: scale(0.85);
          }
        }
        @media (min-width: 1024px) and (max-height: 700px) {
          .auth-modal-card {
            transform: scale(0.78);
          }
        }
      `}</style>
    </main>
  );
}

export default function FigmaAuthScreen({ mode }: { mode?: AuthMode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#244246] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <FigmaAuthScreenContent mode={mode} />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
