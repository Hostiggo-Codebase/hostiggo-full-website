'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { ageFromDateOfBirth, getProfileCompletion, type CompletionInput } from '@/lib/profileCompletion';
import { toE164Phone } from '@/lib/phoneFormat';

const GENDERS = ['Male', 'Female', 'Transgender', 'Prefer Not To Say'];
const ITEMS: { key: string; label: string }[] = [
  { key: 'name', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone number' },
  { key: 'dateOfBirth', label: 'Date of birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'photo', label: 'Profile photo' },
];

const stripIndian = (raw: string) => raw.replace(/[^\d]/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  completion: CompletionInput;
  uploadingPhoto: boolean;
  onPickPhoto: () => void;
  /** Re-load the users row and the auth identity after a save. */
  onSaved: () => Promise<void> | void;
};

/**
 * "What is left" for the profile-completion bar. Lets the user fill in date of
 * birth, gender and phone right here. Phone is NOT verified on the web -- that
 * is done in the mobile app -- so a saved-but-unverified phone stays listed
 * with a "verify in the app" note.
 */
export default function ProfileCompletionModal({
  open,
  onOpenChange,
  userId,
  completion,
  uploadingPhoto,
  onPickPhoto,
  onSaved,
}: Props) {
  const { missing } = getProfileCompletion(completion);
  const missingKeys = new Set(missing.map((m) => m.key));
  const todoFor = (key: string) => missing.find((m) => m.key === key)?.todo;

  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDob(completion.dateOfBirth ?? '');
      setGender(completion.gender ?? '');
      setPhone('');
      setError('');
    }
    // Only reseed when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const needsPhoneInput = !completion.phone?.trim();
  const dirty =
    (dob !== (completion.dateOfBirth ?? '') && dob !== '') ||
    (gender !== (completion.gender ?? '') && gender !== '') ||
    (needsPhoneInput && phone.trim() !== '');

  const handleSave = async () => {
    setError('');
    let age: number | null = null;
    if (dob && dob !== completion.dateOfBirth) {
      age = ageFromDateOfBirth(dob);
      if (age === null || age < 18 || age > 120) {
        setError('Enter a valid date of birth (you must be 18 or older).');
        return;
      }
    }
    if (needsPhoneInput && phone.trim() && !/^[6-9]\d{9}$/.test(stripIndian(phone))) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setSaving(true);
    try {
      if (dob !== (completion.dateOfBirth ?? '') || gender !== (completion.gender ?? '')) {
        const { error: authError } = await supabase.auth.updateUser({
          data: { date_of_birth: dob || null, gender: gender || null },
        });
        if (authError) throw authError;
      }
      const patch: Record<string, unknown> = {};
      if (age !== null) patch.age = age;
      if (needsPhoneInput && phone.trim()) patch.phone = toE164Phone(phone) ?? phone.trim();
      if (Object.keys(patch).length > 0) await api.updateProfile(userId, patch);

      await onSaved();
      toast.success('Profile updated.', { id: 'profile-completion' });
    } catch (err) {
      console.error('[ProfileCompletionModal] save failed:', err);
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-[15px] text-gray-900 outline-none focus:border-[#004772] focus:ring-1 focus:ring-[#004772]';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {missing.length === 0 ? 'Your profile is complete' : `${missing.length} step${missing.length > 1 ? 's' : ''} left to complete your profile`}
          </DialogTitle>
          <DialogDescription>
            {missing.length === 0
              ? 'Everything is filled in.'
              : 'Finish these to reach 100%. Verification of your phone is done in the Hostiggo app.'}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-4">
          {ITEMS.map(({ key, label }) => {
            const isMissing = missingKeys.has(key as never);
            return (
              <li key={key} className="flex gap-3">
                {isMissing ? (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-gray-900">{label}</p>
                  {!isMissing ? (
                    <p className="text-[13px] text-gray-500">Done</p>
                  ) : (
                    <>
                      <p className="text-[13px] text-gray-600">{todoFor(key)}</p>

                      {key === 'dateOfBirth' && (
                        <input
                          type="date"
                          value={dob}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setDob(e.target.value)}
                          className={inputCls}
                        />
                      )}
                      {key === 'gender' && (
                        <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls}>
                          <option value="">Select</option>
                          {GENDERS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      )}
                      {key === 'phone' && needsPhoneInput && (
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+91XXXXXXXXXX"
                          autoComplete="tel"
                          className={inputCls}
                        />
                      )}
                      {key === 'photo' && (
                        <button
                          type="button"
                          onClick={onPickPhoto}
                          disabled={uploadingPhoto}
                          className="mt-2 rounded-xl border-2 border-[#004772] px-4 py-2 text-sm font-bold text-[#004772] hover:bg-[#004772]/5 disabled:opacity-50"
                        >
                          {uploadingPhoto ? 'Uploading…' : 'Upload photo'}
                        </button>
                      )}
                      {(key === 'name' || key === 'email') && (
                        <Link
                          href="/account/profile/edit"
                          className="mt-2 inline-block text-sm font-bold text-[#0396EF] hover:underline"
                        >
                          Edit profile
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-xl bg-[#004772] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#003655] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
