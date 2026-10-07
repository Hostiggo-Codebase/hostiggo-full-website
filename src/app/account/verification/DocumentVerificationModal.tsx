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
              Full name (as on your {doc.id === 'aadhaar' ? 'ID' : doc.label})
            </label>
            <input 
              id="doc-fullname" 
              type="text" 
              value={fullName} 
              onChange={(e) => setFullName(e.target.value)} 
              placeholder={doc.id === 'aadhaar' ? 'rijusmit biswas' : 'Enter your full name'} 
              className="h-14 w-full rounded-[15px] border border-[#a1a1a1] px-4 text-[15px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" 
            />
          </div>

          {doc.id === 'aadhaar' ? (
            <>
              <div className="space-y-2">
                <label htmlFor="aadhaar-password" className="block text-[17px] font-medium text-[#151515]">eAadhaar PDF password</label>
                <input 
                  id="aadhaar-password" 
                  type="password" 
                  autoComplete="off" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="Enter the password for the downloaded PDF" 
                  className="h-14 w-full rounded-[15px] border border-[#a1a1a1] px-4 text-[15px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" 
                />
                <p className="text-xs leading-relaxed text-gray-500">
                  UIDAI eAadhaar PDFs usually use the first four letters of your name in capitals followed by your birth year.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="aadhaar-yob" className="block text-[17px] font-medium text-[#151515]">Year of birth</label>
                <input 
                  id="aadhaar-yob" 
                  type="text" 
                  inputMode="numeric" 
                  maxLength={4} 
                  value={yob} 
                  onChange={(e) => setYob(e.target.value.replace(/\D/g, '').slice(0, 4))} 
                  placeholder="1990" 
                  className="h-14 w-full rounded-[15px] border border-[#a1a1a1] px-4 text-[15px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" 
                />
              </div>
            </>
          ) : (
            <>
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
              {doc.id === 'passport' && (
                <div className="space-y-2">
                  <label htmlFor="passport-dob" className="block text-[17px] font-medium text-[#151515]">Date of birth</label>
                  <input 
                    id="passport-dob" 
                    type="date" 
                    value={dob} 
                    onChange={(e) => setDob(e.target.value)} 
                    className="h-14 w-full rounded-[15px] border border-[#a1a1a1] px-4 text-[15px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" 
                  />
                </div>
              )}
            </>
          )}

          {/* Upload section - only for aadhaar */}
          {doc.id === 'aadhaar' && (
            <>
              <div className="flex items-center justify-between gap-4 rounded-lg bg-blue-50 border border-blue-200 p-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900">Verify with DigiLocker</p>
                  <p className="text-xs text-blue-700 mt-1">Faster & easier - no PDF upload needed</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUseDigilocker(!useDigilocker)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    useDigilocker
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 border border-blue-600'
                  }`}
                >
                  {useDigilocker ? 'Using DigiLocker' : 'Use DigiLocker'}
                </button>
              </div>

              {!useDigilocker && (
                <div className="space-y-2">
                  <p className="text-[17px] font-medium text-[#151515]">Upload eAadhaar PDF</p>
                  <div className="rounded-[15px] border border-[#a1a1a1] p-4">
                {previewUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-lg bg-gray-50">
                      <p className="px-4 text-center text-sm font-medium text-gray-600">eAadhaar PDF selected</p>
                      <button
                        type="button"
                        onClick={() => setFile(null)}
                        aria-label="Remove PDF"
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="max-w-full truncate text-xs text-gray-500">
                      {file?.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-full border border-[#d0d0d0] bg-white px-6 py-2 text-sm font-medium text-gray-600 shadow-[0_4px_18px_rgba(0,0,0,0.12)] transition-colors hover:text-blue-600"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-3 py-4 text-center"
                  >
                    <span className="self-start text-[15px] text-gray-400">
                      Upload your eAadhaar PDF
                    </span>
                    <ImagePlus className="h-12 w-12 text-gray-300" strokeWidth={1.5} />
                    <span className="rounded-full border border-[#d0d0d0] bg-white px-8 py-2 text-sm font-medium text-gray-600 shadow-[0_4px_18px_rgba(0,0,0,0.12)] transition-colors hover:text-blue-600">
                      Upload
                    </span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
              )}
            </>
          )}

          {/* Submit */}
          {dlSession && useDigilocker && doc.id === 'aadhaar' ? (
            <DigilockerSdkButton
              session={dlSession}
              fullName={fullName.trim()}
              onResult={(result) => {
                setDlSession(null);
                if (result.status === 'verified') toast.success('Your Aadhaar has been verified.');
                else toast.error(result.reason || 'Aadhaar verification failed.');
                onClose();
              }}
              onError={(message) => {
                setDlSession(null);
                toast.error(message);
              }}
            />
          ) : (
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
            {submitting ? 'Submitting…' : useDigilocker && doc.id === 'aadhaar' ? 'Continue with DigiLocker' : 'Submit'}
          </button>
          )}

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
