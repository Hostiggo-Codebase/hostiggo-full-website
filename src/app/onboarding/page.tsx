'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Image from 'next/image';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, getStoredAccessToken } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';
const authBg = '/auth-bg.jpg';


function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams?.get('mode') || 'phone';
  const { user, userId, isAuthenticated, loading: authLoading, refresh } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState<string>('');
  const [emergencyContact, setEmergencyContact] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !userId) {
      router.push('/signin');
      return;
    }
    if (user?.name) setName(user.name);
    if (user?.email) setEmail(user.email);
    if (user?.phone) setPhone(user.phone);
    if (user?.age) setAge(user.age?.toString() || '');
    if (user?.emergency_contact) setEmergencyContact(user.emergency_contact);
    if (user?.profile_pic_url) setPhotoUrl(user.profile_pic_url);
  }, [user, userId, isAuthenticated, authLoading, router]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const url = await api.uploadProfilePhoto(file);
      setPhotoUrl(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#004772] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const needsEmail = mode === 'phone' || mode === 'mobile';
  const needsPhone = mode === 'email' || mode === 'google';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
      if (!trimmed) return;
    if (needsEmail && !email.includes('@')) return;
    if (needsPhone && !phone.trim()) {
      toast.error('Phone number is required');
      return;
    }
    if (!age.trim()) return;

    setSaving(true);
    try {
      // /api/users now requires proof of identity (a verified bearer token
      // that matches user_id). Google/email-OTP sign-ins hold the session in
      // the Supabase client; phone-OTP sign-ins store it via setStoredSession.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token || getStoredAccessToken();
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          user_id: userId,
          name: trimmed,
          email: email || user?.email || '',
          phone: phone || user?.phone || null,
          age: age ? parseInt(age) : null,
          emergency_contact: emergencyContact || null,
          profile_pic_url: photoUrl || user?.profile_pic_url || null,
          // A new user hasn't verified any government ID yet -- identity
          // verification is its own opt-in flow (/account/verification).
          is_verified: false,
          is_active: true,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to save');
      }

      await refresh();
      toast.success('Welcome to Hostiggo!');
      router.push('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden">
      <Image fill priority src={authBg} alt="" sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-[360px] mx-4 bg-white rounded-3xl shadow-2xl p-8">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <Image src="/logo-circle.png" alt="" width={32} height={32} className="w-8 h-8 rounded-full" />
          <span className="font-black text-gray-800 text-[16px] tracking-wider uppercase">
            HOSTI<span className="text-figma-accent">GGO</span>
          </span>
        </div>

        <h2 className="text-[22px] font-bold text-gray-900 mb-1 text-center">
          Welcome!
        </h2>
        <p className="text-[13px] text-gray-500 mb-6 text-center">
          Tell us about yourself
        </p>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-24 h-24">
              <UserAvatar
                src={photoUrl}
                name={name || 'You'}
                size={96}
                className="border-4 border-figma-navy/10 shadow-lg"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                title="Add photo"
                className="absolute bottom-0 right-0 bg-figma-navy hover:bg-figma-navy/90 text-white p-1.5 rounded-full shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {uploadingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Your name
            </label>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-4 py-3 text-[14px] text-gray-800 rounded-xl border border-gray-200 outline-none focus:border-figma-navy focus:ring-2 focus:ring-figma-navy/10 placeholder:text-gray-400"
            />
          </div>

          {needsEmail && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Email address
              </label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 text-[14px] text-gray-800 rounded-xl border border-gray-200 outline-none focus:border-figma-navy focus:ring-2 focus:ring-figma-navy/10 placeholder:text-gray-400"
              />
            </div>
          )}

          {needsPhone && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Phone number <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">Required for booking confirmations via WhatsApp</p>
              <input
                type="tel"
                placeholder="Enter your phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full px-4 py-3 text-[14px] text-gray-800 rounded-xl border border-gray-200 outline-none focus:border-figma-navy focus:ring-2 focus:ring-figma-navy/10 placeholder:text-gray-400"
              />
            </div>
          )}

          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Age <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              placeholder="Enter your age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full px-4 py-3 text-[14px] text-gray-800 rounded-xl border border-gray-200 outline-none focus:border-figma-navy focus:ring-2 focus:ring-figma-navy/10 placeholder:text-gray-400"
            />
          </div>

          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Emergency Contact <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="Enter emergency contact"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              className="w-full px-4 py-3 text-[14px] text-gray-800 rounded-xl border border-gray-200 outline-none focus:border-figma-navy focus:ring-2 focus:ring-figma-navy/10 placeholder:text-gray-400"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !name.trim() || (needsEmail && !email.includes('@')) || (needsPhone && !phone.trim()) || !age.trim()}
            className="w-full py-3.5 bg-[#004772] hover:bg-[#003a5c] active:scale-[0.98] text-white font-semibold rounded-xl transition-all text-[15px] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-10 h-10 border-4 border-[#004772] border-t-transparent rounded-full animate-spin" /></div>}>
      <OnboardingContent />
    </Suspense>
  );
}
