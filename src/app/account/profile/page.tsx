'use client';

import { useEffect, useRef, useState } from 'react';
import { UserAvatar } from '@/components/ui/user-avatar';
import Link from 'next/link';
import { toast } from 'sonner';
import { BadgeCheck, ChevronRight, Camera, ShieldCheck, ShieldAlert, Mail, Phone, Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { useAuth } from '@/context/AuthContext';
import { useKycStatus } from '@/hooks/useKycStatus';
import { api } from '@/lib/api';

export default function GuestProfilePage() {
  const { user, userId, loading, isAuthenticated, refresh } = useAuth();
  const { status: kycStatus, loading: kycLoading } = useKycStatus();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const identityVerified = user?.is_verified === true || kycStatus === 'verified';
  const identityPending = kycStatus === 'pending';
  const identityRejected = kycStatus === 'rejected';

  // Seed the form from the real user once it loads.
  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setEmail(user.email ?? '');
      setPhone(user.phone ?? '');
      setAge(user.age ? String(user.age) : '');
      setEmergencyContact(user.emergency_contact ?? '');
    }
  }, [user]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Mirrors the server rules in PATCH /api/users (which remain authoritative).
  const validate = () => {
    const e: Record<string, string> = {};
    const n = name.trim();
    if (n.length < 2 || n.length > 80) e.name = 'Enter your name (2-80 characters).';
    const em = email.trim();
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) e.email = 'Enter a valid email address.';
    const ph = phone.replace(/[^\d]/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (phone.trim() && !/^[6-9]\d{9}$/.test(ph)) e.phone = 'Enter a valid 10-digit Indian mobile number.';
    if (age.trim()) {
      const a = Number(age);
      if (!Number.isInteger(a) || a < 18 || a > 120) e.age = 'Age must be between 18 and 120.';
    }
    const ec = emergencyContact.trim();
    if (ec && !/[6-9]\d{9}/.test(ec.replace(/[^\d]/g, '').replace(/^(91|0)(?=\d{10}$)/, ''))) {
      e.emergencyContact = 'Include a valid 10-digit mobile number.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!validate()) return;
    // Only send what changed, so an untouched legacy value never blocks a save.
    const patch: Record<string, unknown> = {};
    if (name.trim() !== (user?.name ?? '')) patch.name = name.trim();
    if (email.trim() !== (user?.email ?? '')) patch.email = email.trim();
    if (phone.trim() !== (user?.phone ?? '')) patch.phone = phone.trim();
    if (age.trim() !== (user?.age ? String(user.age) : '')) patch.age = age.trim() ? Number(age) : null;
    if (emergencyContact.trim() !== (user?.emergency_contact ?? '')) {
      patch.emergency_contact = emergencyContact.trim() || null;
    }
    if (Object.keys(patch).length === 0) {
      toast.info('No changes to save.', { id: 'profile-save' });
      return;
    }
    setSaving(true);
    try {
      await api.updateProfile(userId, patch as any);
      await refresh();
      toast.success('Profile updated.', { id: 'profile-save' });
    } catch (err) {
      console.error('[account/profile] save failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not save your profile.', { id: 'profile-save' });
    } finally {
      setSaving(false);
    }
  };


  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;
    setUploadingPhoto(true);
    try {
      const url = await api.uploadProfilePhoto(file);
      await api.updateProfile(userId, { profile_pic_url: url });
      await refresh();
      toast.success('Profile photo updated.');
    } catch (err) {
      console.error('[account/profile] photo upload failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="min-h-screen bg-figma-cream">
      <Navbar />
      <main className="container-main py-8">
        <nav className="flex items-center gap-2 py-4 text-gray-500 text-sm">
          <span>Account</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-figma-navy font-bold">Profile</span>
        </nav>

        {loading ? (
          <div className="py-24 flex justify-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !isAuthenticated ? (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-card py-16 text-center max-w-md mx-auto">
            <p className="text-4xl mb-3">🔒</p>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Sign in to view your profile</h2>
            <p className="text-sm text-gray-500 mb-6">Manage your personal details once you&apos;re signed in.</p>
            <Link
              href="/signin?redirect=/account/profile"
              className="inline-flex items-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Summary */}
            <aside className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-3xl p-8 shadow-card border border-gray-200">
                <div className="flex flex-col items-center text-center">
                  <div className="relative w-32 h-32 mb-6">
                    <UserAvatar
                      src={user?.profile_pic_url}
                      name={name || 'Profile'}
                      size={128}
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
                      aria-label="Change profile photo"
                      title="Change photo"
                      className="absolute bottom-1 right-1 bg-figma-navy hover:bg-figma-navy/90 text-white p-2 rounded-full shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {uploadingPhoto ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Camera className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <h1 className="text-xl font-bold text-gray-900 mb-1">{name || 'Your name'}</h1>
                  <p className="text-sm text-gray-500 mb-4">{email || phone || 'Hostiggo member'}</p>
                </div>
              </div>

              {identityVerified ? (
                <div className="bg-white rounded-3xl p-6 shadow-card border border-gray-200">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-700">
                      <BadgeCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Verified guest</p>
                      <p className="text-xs text-gray-500">Identity checks completed</p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3 border-t border-gray-100 pt-5">
                    {['Government ID verified', 'Profile ready for hosts', 'Bank details not required'].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-green-700" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : identityPending ? (
                <div className="bg-white rounded-3xl p-6 shadow-card border border-gray-200">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-figma-navy/5 flex items-center justify-center text-figma-navy shrink-0">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">Verification in review</p>
                      <p className="text-xs text-gray-500">
                        We received your ID details and will update your profile when checks finish.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-3xl p-6 shadow-card border border-gray-200">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                      {kycLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ShieldAlert className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">
                        {identityRejected ? 'Try verification again' : 'Verify your account'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {identityRejected
                          ? 'Your last ID check could not be completed. Submit a government ID again.'
                          : 'Confirm your identity with a government ID to build trust with hosts.'}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/account/verification"
                    className="mt-4 flex w-full items-center justify-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90 transition-colors"
                  >
                    Verify account
                  </Link>
                </div>
              )}
            </aside>

            {/* Details */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-3xl p-6 shadow-card border border-gray-200">
                <h2 className="text-lg font-bold text-gray-800 mb-6">Personal Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-500 ml-1">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      maxLength={80}
                      autoComplete="name"
                      aria-invalid={!!errors.name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm"
                    />
                    {errors.name && <p className="ml-1 text-xs font-medium text-red-600">{errors.name}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-500 ml-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      maxLength={254}
                      autoComplete="email"
                      aria-invalid={!!errors.email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm"
                    />
                    {errors.email && <p className="ml-1 text-xs font-medium text-red-600">{errors.email}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-500 ml-1">Phone</label>
                    <input
                      type="tel"
                      value={phone}
                      maxLength={16}
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="10-digit mobile number"
                      aria-invalid={!!errors.phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm"
                    />
                    {errors.phone && <p className="ml-1 text-xs font-medium text-red-600">{errors.phone}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-500 ml-1">Age</label>
                    <input
                      type="number"
                      min="18"
                      max="120"
                      value={age}
                      aria-invalid={!!errors.age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm"
                    />
                    {errors.age && <p className="ml-1 text-xs font-medium text-red-600">{errors.age}</p>}
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-sm font-bold text-gray-500 ml-1">Emergency Contact</label>
                    <input
                      type="text"
                      value={emergencyContact}
                      maxLength={100}
                      aria-invalid={!!errors.emergencyContact}
                      onChange={(e) => setEmergencyContact(e.target.value)}
                      placeholder="e.g. Priya (sister) 98765 43210 -- optional"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm"
                    />
                    {errors.emergencyContact && (
                      <p className="ml-1 text-xs font-medium text-red-600">{errors.emergencyContact}</p>
                    )}
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-8 py-3 bg-figma-navy text-white rounded-xl font-bold hover:bg-figma-navy/90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-card border border-gray-200">
                <h2 className="text-lg font-bold text-gray-800 mb-6">Contact Preferences</h2>
                <div className="space-y-4">
                  {[
                    { icon: Mail, label: 'Email notifications', desc: 'Booking updates and offers' },
                    { icon: Phone, label: 'SMS alerts', desc: 'Time-sensitive trip reminders' },
                  ].map((p) => {
                    const Icon = p.icon;
                    return (
                      <div
                        key={p.label}
                        className="flex items-center justify-between p-4 rounded-xl border border-gray-200"
                      >
                        <div className="flex items-center gap-4">
                          <Icon className="w-5 h-5 text-figma-navy" />
                          <div>
                            <p className="text-sm font-bold text-gray-800">{p.label}</p>
                            <p className="text-xs text-gray-500">{p.desc}</p>
                          </div>
                        </div>
                        <Link href="/account/settings" className="text-sm text-figma-navy font-bold hover:underline">
                          Manage
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
