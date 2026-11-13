/**
 * Profile completion -- the SAME rule as the mobile app
 * (hostiggo-frontend/src/hooks/useProfile.ts `calculateCompletionPercentage`).
 * Six equally weighted items; ID (KYC) verification and emergency contact are
 * deliberately NOT part of it. Keep the two in sync.
 */
export type CompletionInput = {
  name?: string | null;
  email?: string | null;
  emailVerified: boolean;
  phone?: string | null;
  phoneVerified: boolean;
  dateOfBirth?: string | null;
  gender?: string | null;
  photoUrl?: string | null;
};

export type CompletionTodo = {
  key: 'name' | 'email' | 'phone' | 'dateOfBirth' | 'gender' | 'photo';
  label: string;
  /** What the user has to do to finish this item. */
  todo: string;
};

export const PROFILE_COMPLETION_TOTAL = 6;

export function getProfileCompletion(input: CompletionInput): {
  percentage: number;
  missing: CompletionTodo[];
} {
  const missing: CompletionTodo[] = [];

  if (!input.name?.trim()) {
    missing.push({ key: 'name', label: 'Full name', todo: 'Add your full name.' });
  }

  if (!input.email?.trim()) {
    missing.push({ key: 'email', label: 'Email', todo: 'Add your email address and verify it.' });
  } else if (!input.emailVerified) {
    missing.push({ key: 'email', label: 'Email', todo: 'Verify your email address.' });
  }

  if (!input.phone?.trim()) {
    missing.push({ key: 'phone', label: 'Phone number', todo: 'Add your phone number and verify it with an OTP.' });
  } else if (!input.phoneVerified) {
    missing.push({ key: 'phone', label: 'Phone number', todo: 'Verify your phone number with an OTP.' });
  }

  if (!input.dateOfBirth?.trim()) {
    missing.push({ key: 'dateOfBirth', label: 'Date of birth', todo: 'Add your date of birth.' });
  }

  if (!input.gender?.trim()) {
    missing.push({ key: 'gender', label: 'Gender', todo: 'Select your gender.' });
  }

  if (!input.photoUrl?.trim()) {
    missing.push({ key: 'photo', label: 'Profile photo', todo: 'Upload a profile photo.' });
  }

  const done = PROFILE_COMPLETION_TOTAL - missing.length;
  return { percentage: Math.round((done / PROFILE_COMPLETION_TOTAL) * 100), missing };
}

/** Whole years between an ISO date (YYYY-MM-DD) and today; null if invalid or in the future. */
export function ageFromDateOfBirth(iso: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(y, mo - 1, d);
  if (Number.isNaN(birth.getTime()) || birth > now) return null;
  let age = now.getFullYear() - y;
  if (now.getMonth() < mo - 1 || (now.getMonth() === mo - 1 && now.getDate() < d)) age--;
  return age;
}
