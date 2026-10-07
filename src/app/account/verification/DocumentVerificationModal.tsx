'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { IdDocument } from './documents';

type Props = {
  doc: IdDocument | null;
  onClose: () => void;
};

export default function DocumentVerificationModal({ doc, onClose }: Props) {
  const [number, setNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState(''); // For passport (full date: YYYY-MM-DD)
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever a different document is opened.
  useEffect(() => {
    setNumber('');
    setFullName('');
    setDob('');
    setSubmitting(false);
  }, [doc?.id]);

  if (!doc) {
    return <Dialog open={false} onOpenChange={() => onClose()} />;
  }

  const handleNumberChange = (value: string) => {
    setNumber(doc.uppercase ? value.toUpperCase() : value);
  };

  const canSubmit = doc.id === 'aadhaar'
    ? number.trim().length === 12 && fullName.trim().length > 1 && !submitting
    : doc.id === 'pan'
    ? number.trim().length === 10 && fullName.trim().length > 1 && !submitting
    : doc.id === 'passport'
    ? number.trim().length > 0 && fullName.trim().length > 1 && dob.length === 10 && !submitting
    : false;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    
    try {
      if (doc.id === 'aadhaar') {
        const result = await api.verifyAadhaar({ idNumber: number.trim(), fullName: fullName.trim() });
        if (result.status === 'verified') toast.success('Your Aadhaar has been verified.');
        else if (result.status === 'rejected') toast.error(result.reason || 'Aadhaar verification failed.');
        onClose();
      } else if (doc.id === 'pan') {
        const result = await api.verifyPan(number.trim(), fullName.trim());
        if (result.status === 'verified') toast.success('Your PAN has been verified.');
        else if (result.status === 'rejected') toast.error(result.reason || 'PAN verification failed.');
        onClose();
      } else if (doc.id === 'passport') {
        const result = await api.verifyPassport({ fileNumber: number.trim(), dob, fullName: fullName.trim() });
        if (result.status === 'verified') toast.success('Your Passport has been verified.');
        else if (result.status === 'rejected') toast.error(result.reason || 'Passport verification failed.');
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not verify your ${doc.label}.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md rounded-[28px] bg-[#fffef9] p-8 sm:rounded-[28px]">
        <DialogHeader className="text-left">
          <DialogTitle className="text-2xl font-semibold text-[#333]">
            {doc.verificationTitle}
          </DialogTitle>
          <DialogDescription className="mt-1 text-[15px] leading-relaxed text-gray-500">
            Please fill the below details so that our team can verify your identity
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Full name field - shown for all document types */}
          <div className="space-y-2">
            <label htmlFor="doc-fullname" className="block text-[17px] font-medium text-[#151515]">
              Full name (as on your {doc.label})
            </label>
            <input 
              id="doc-fullname" 
              type="text" 
              value={fullName} 
              onChange={(e) => setFullName(e.target.value)} 
              placeholder="Enter your full name" 
              className="h-14 w-full rounded-[15px] border border-[#a1a1a1] px-4 text-[15px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" 
            />
          </div>

          {/* Document number field */}
          <div className="space-y-2">
            <label htmlFor="doc-number" className="block text-[17px] font-medium text-[#151515]">{doc.numberLabel}</label>
            <input 
              id="doc-number" 
              type="text" 
              inputMode={doc.inputMode} 
              maxLength={doc.maxLength} 
              autoComplete="off" 
              value={number} 
              onChange={(e) => handleNumberChange(e.target.value)} 
              placeholder={doc.numberPlaceholder} 
              className="h-14 w-full rounded-[15px] border border-[#a1a1a1] px-4 text-[15px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" 
            />
          </div>

          {/* Date of birth field - only for passport */}
          {doc.id === 'passport' && (
            <div className="space-y-2">
              <label htmlFor="passport-dob" className="block text-[17px] font-medium text-[#151515]">Date of birth</label>
              <input 
                id="passport-dob" 
                type="date" 
                value={dob} 
                onChange={(e) => setDob(e.target.value)} 
                max={new Date().toISOString().split('T')[0]}
                className="h-14 w-full rounded-[15px] border border-[#a1a1a1] px-4 text-[15px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" 
              />
            </div>
          )}

          {/* Submit button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={
              canSubmit
                ? 'h-14 w-full rounded-[25px] bg-blue-600 text-[17px] font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.99]'
                : 'h-14 w-full cursor-not-allowed rounded-[25px] bg-[#ebebeb] text-[17px] font-semibold text-[#747474]'
            }
          >
            {submitting ? 'Verifying…' : 'Verify'}
          </button>

          <div className="text-center">
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-gray-500 underline underline-offset-2 hover:text-blue-600"
            >
              terms &amp; conditions
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
