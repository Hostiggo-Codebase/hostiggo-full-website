'use client';

import Navbar from '@/components/layout/Navbar';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { ArrowLeft, Camera, ChevronRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  buildProfilePatch,
  profileFormFromUser,
  validateProfileForm,
  type ProfileForm,
  type ProfileFormErrors,
} from '@/lib/profileForm';

export default function EditProfilePage() {
  const router = useRouter();
  const { user, userId, loading, isAuthenticated, updateProfile } = useAuth();

  const [form, setForm] = useState<ProfileForm>(() => profileFormFromUser(null));
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { name, email, phone, age, emergencyContact } = form;
  const setField = (key: keyof ProfileForm) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (user) setForm(profileFormFromUser(user));
  }, [user]);

  const handleSave = async () => {
    if (!userId || saving) return;
    const found = validateProfileForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const patch = buildProfilePatch(form, user);
    if (Object.keys(patch).length === 0) {
      toast.info('No changes to save.', { id: 'profile-save' });
      return;
    }
    setSaving(true);
    try {
      await updateProfile(patch);
      toast.success('Profile updated.', { id: 'profile-save' });
      router.push('/account/profile');
    } catch (err) {
      console.error('[account/profile/edit] save failed:', err);
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
      await updateProfile({ profile_pic_url: url });
      toast.success('Profile photo updated.');
    } catch (err) {
      console.error('[account/profile/edit] photo upload failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-figma-cream">
        <Navbar />
        <main className="w-full max-w-[1440px] mx-auto px-6 lg:px-10 py-16">
          {loading ? (
            <div className="flex justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-card py-16 text-center max-w-md mx-auto">
              <h2 className="text-lg font-bold text-gray-800 mb-1">Sign in to edit your profile</h2>
              <p className="text-sm text-gray-500 mb-6">Manage your personal details once you&apos;re signed in.</p>
              <Link
                href="/signin?redirect=/account/profile/edit"
                className="inline-flex items-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90"
              >
                Sign in
              </Link>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-figma-cream flex flex-col relative pb-[100px]">
      <Navbar />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-24 xl:px-40 py-8 lg:py-12 flex flex-col md:flex-row">
        {/* Left Side: Back button */}
        <div className="w-full md:w-[100px] shrink-0 flex flex-row md:flex-col items-center md:items-start mb-6 md:mb-0">
          <button 
            onClick={() => router.push('/account/profile')}
            className="w-12 h-12 rounded-full bg-[#FFFFFF] border border-gray-200 flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:bg-[#F9F9F9] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" strokeWidth={2.5} />
          </button>
        </div>

        {/* Right Side: Content */}
        <div className="flex-1 md:pl-12 lg:pl-16">
          <h1 className="text-[32px] md:text-[40px] font-bold text-gray-900 leading-tight mb-12">
            Edit profile
          </h1>

          <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 relative">
            {/* Left Column: Photo */}
            <div className="shrink-0 flex flex-col items-center lg:items-start lg:w-[265px]">
              <div className="relative mb-8">
                <div className="w-[265px] h-[265px] rounded-full overflow-hidden bg-[#F4F6F8] border border-gray-200 flex items-center justify-center relative">
                  {uploadingPhoto ? (
                    <Loader2 className="w-8 h-8 text-[#004772] animate-spin" />
                  ) : user?.profile_pic_url ? (
                    <UserAvatar
                      src={user.profile_pic_url}
                      name={name || 'Profile'}
                      size={265}
                      className="h-full w-full"
                    />
                  ) : (
                    <Camera className="w-12 h-12 text-gray-400" />
                  )}
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute -bottom-[24.5px] left-1/2 -translate-x-1/2 flex items-center justify-center font-bold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed z-10"
                  style={{
                    width: '133px',
                    height: '49px',
                    borderRadius: '15px',
                    backgroundColor: '#4F4F4F',
                    border: '1px solid #FFFFFF',
                    color: '#FFFFFF',
                    boxSizing: 'border-box'
                  }}
                >
                  {uploadingPhoto ? 'Uploading...' : 'Upload'}
                </button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handlePhotoChange} className="hidden" accept="image/jpeg,image/png,image/webp" />
            </div>

            {/* Vertical Divider */}
            <div className="hidden lg:block w-[1px] bg-black/20 shrink-0 self-stretch"></div>

            {/* Right Column: Forms */}
            <div className="flex-1 max-w-[550px]">
              <section className="mb-14">
                <h2 className="text-[20px] font-bold text-gray-900 mb-2">Personal Information</h2>
                <p className="text-[15px] text-[#5F5F5F] mb-8 leading-[1.6]">
                  This helps us secure your account and provide a smoother booking experience
                </p>

                <div className="space-y-6">
                  <div className="relative w-full h-[60px] bg-white border border-[#B8B8B8] rounded-[16px] focus-within:border-[#004772] focus-within:ring-1 focus-within:ring-[#004772] transition-colors">
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setField('name')(e.target.value)}
                      maxLength={80}
                      autoComplete="name"
                      aria-invalid={!!errors.name}
                      className="peer w-full h-full bg-transparent px-5 pt-6 pb-1 text-[15px] font-medium text-gray-900 outline-none z-10 relative" 
                    />
                    <label className={`absolute left-5 transition-all duration-200 pointer-events-none z-0 ${
                      name ? 'top-2 text-[12px] text-[#434343]' : 'top-1/2 -translate-y-1/2 text-[15px] text-gray-400'
                    } peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[12px] peer-focus:text-[#434343]`}>
                      Full Name<span className="text-red-500">*</span>
                    </label>
                  </div>
                  <div className="relative w-full h-[60px] bg-white border border-[#B8B8B8] rounded-[16px] focus-within:border-[#004772] focus-within:ring-1 focus-within:ring-[#004772] transition-colors">
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setField('email')(e.target.value)}
                      autoComplete="email"
                      aria-invalid={!!errors.email}
                      className="peer w-full h-full bg-transparent px-5 pt-6 pb-1 text-[15px] font-medium text-gray-900 outline-none z-10 relative" 
                    />
                    <label className={`absolute left-5 transition-all duration-200 pointer-events-none z-0 ${
                      email ? 'top-2 text-[12px] text-[#434343]' : 'top-1/2 -translate-y-1/2 text-[15px] text-gray-400'
                    } peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[12px] peer-focus:text-[#434343]`}>
                      Email Id
                    </label>
                  </div>
                  <div className="relative w-full h-[60px] bg-white border border-[#B8B8B8] rounded-[16px] focus-within:border-[#004772] focus-within:ring-1 focus-within:ring-[#004772] transition-colors">
                    <input 
                      type="tel" 
                      value={phone}
                      onChange={(e) => setField('phone')(e.target.value)}
                      autoComplete="tel"
                      placeholder="+91XXXXXXXXXX"
                      aria-invalid={!!errors.phone}
                      className="peer w-full h-full bg-transparent px-5 pt-6 pb-1 text-[15px] font-medium text-gray-900 outline-none z-10 relative" 
                    />
                    <label className={`absolute left-5 transition-all duration-200 pointer-events-none z-0 ${
                      phone ? 'top-2 text-[12px] text-[#434343]' : 'top-1/2 -translate-y-1/2 text-[15px] text-gray-400'
                    } peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[12px] peer-focus:text-[#434343]`}>
                      Phone Number
                    </label>
                  </div>
                  <div className="relative w-full h-[60px] bg-white border border-[#B8B8B8] rounded-[16px] focus-within:border-[#004772] focus-within:ring-1 focus-within:ring-[#004772] transition-colors">
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => setField('age')(e.target.value)}
                      inputMode="numeric"
                      min={18}
                      max={120}
                      aria-invalid={!!errors.age}
                      className="peer w-full h-full bg-transparent px-5 pt-6 pb-1 text-[15px] font-medium text-gray-900 outline-none z-10 relative"
                    />
                    <label className={`absolute left-5 transition-all duration-200 pointer-events-none z-0 ${
                      age ? 'top-2 text-[12px] text-[#434343]' : 'top-1/2 -translate-y-1/2 text-[15px] text-gray-400'
                    } peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[12px] peer-focus:text-[#434343]`}>
                      Age
                    </label>
                  </div>
                  <div className="relative w-full h-[60px] bg-white border border-[#B8B8B8] rounded-[16px] focus-within:border-[#004772] focus-within:ring-1 focus-within:ring-[#004772] transition-colors">
                    <input
                      type="text"
                      value={emergencyContact}
                      onChange={(e) => setField('emergencyContact')(e.target.value)}
                      maxLength={100}
                      aria-invalid={!!errors.emergencyContact}
                      className="peer w-full h-full bg-transparent px-5 pt-6 pb-1 text-[15px] font-medium text-gray-900 outline-none z-10 relative"
                    />
                    <label className={`absolute left-5 transition-all duration-200 pointer-events-none z-0 ${
                      emergencyContact ? 'top-2 text-[12px] text-[#434343]' : 'top-1/2 -translate-y-1/2 text-[15px] text-gray-400'
                    } peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[12px] peer-focus:text-[#434343]`}>
                      Emergency contact (name and mobile)
                    </label>
                  </div>
                  {Object.values(errors).some(Boolean) && (
                    <ul role="alert" className="space-y-1">
                      {Object.entries(errors).map(([key, msg]) =>
                        msg ? (
                          <li key={key} className="ml-1 text-xs font-medium text-red-600">{msg}</li>
                        ) : null,
                      )}
                    </ul>
                  )}
                </div>
              </section>

              <hr className="border-gray-200 mb-10" />

              <section>
                <h2 className="text-[20px] font-bold text-gray-900 mb-2">Identity Verification</h2>
                <p className="text-[15px] text-[#5F5F5F] mb-8 leading-[1.6]">
                  Identity verification is mandatory for bookings and building trust among our hosts
                </p>

                <div className="flex flex-col gap-4">
                  <Link href="/account/verification" className="w-full bg-white border border-gray-200 rounded-[16px] p-5 flex items-center justify-between hover:border-[#004772] shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all group">
                    <div className="flex items-center gap-5">
                      <img src="/verification/aadhaar.png" alt="Aadhaar Card" className="w-[32px] h-auto object-contain shrink-0" />
                      <span className="font-bold text-gray-900 text-[15px]">Aadhaar Card</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#004772]" />
                  </Link>

                  <div className="text-center">
                    <span className="text-[#999999] font-medium text-[13px] tracking-wide">OR</span>
                  </div>

                  <Link href="/account/verification" className="w-full bg-white border border-gray-200 rounded-[16px] p-5 flex items-center justify-between hover:border-[#004772] shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all group">
                    <div className="flex items-center gap-5">
                      <img src="/verification/pan.png" alt="PAN Card" className="w-[32px] h-auto object-contain shrink-0" />
                      <span className="font-bold text-gray-900 text-[15px]">PAN Card</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#004772]" />
                  </Link>

                  <div className="text-center">
                    <span className="text-[#999999] font-medium text-[13px] tracking-wide">OR</span>
                  </div>

                  <Link href="/account/verification" className="w-full bg-white border border-gray-200 rounded-[16px] p-5 flex items-center justify-between hover:border-[#004772] shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all group">
                    <div className="flex items-center gap-5">
                      <img src="/verification/passport.png" alt="Passport" className="w-[32px] h-auto object-contain shrink-0" />
                      <span className="font-bold text-gray-900 text-[15px]">Passport</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#004772]" />
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky Bottom Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 md:p-6 z-40 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <div className="max-w-[1440px] mx-auto px-6 lg:pl-24 xl:pl-40 lg:pr-[200px] xl:pr-[350px] flex justify-end">
          <button 
            onClick={handleSave}
            disabled={saving || uploadingPhoto}
            className="disabled:opacity-60 disabled:cursor-not-allowed bg-[#004772] text-white px-10 py-3 rounded-[12px] font-semibold text-[16px] w-full md:w-auto md:min-w-[140px] hover:bg-[#003655] transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
