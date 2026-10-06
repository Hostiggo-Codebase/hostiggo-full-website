'use client';

import Navbar from '@/components/layout/Navbar';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { ArrowLeft, Camera, ChevronRight, CreditCard, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export default function EditProfilePage() {
  const router = useRouter();
  const { user, userId, refresh, updateProfile } = useAuth();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setDob(user.dob || '');
      setGender(user.gender || '');
    }
  }, [user]);

  const handleSave = () => {
    if (updateProfile) {
      updateProfile({
        profile: { name, email, phone, dob, gender }
      });
    }
    router.push('/account/profile');
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;
    setUploadingPhoto(true);
    try {
      const url = await api.uploadProfilePhoto(file);
      if (updateProfile) {
        updateProfile({ profile_pic_url: url });
      } else {
        await api.updateProfile(userId, { profile_pic_url: url });
        await refresh();
      }
      toast.success('Profile photo updated.');
    } catch (err) {
      console.error('[account/profile/edit] photo upload failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

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
              <input type="file" ref={fileInputRef} onChange={handlePhotoChange} className="hidden" accept="image/*" />
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
                      onChange={(e) => setName(e.target.value)}
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
                      onChange={(e) => setEmail(e.target.value)}
                      className="peer w-full h-full bg-transparent px-5 pt-6 pb-1 text-[15px] font-medium text-gray-900 outline-none z-10 relative" 
                    />
                    <label className={`absolute left-5 transition-all duration-200 pointer-events-none z-0 ${
                      email ? 'top-2 text-[12px] text-[#434343]' : 'top-1/2 -translate-y-1/2 text-[15px] text-gray-400'
                    } peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[12px] peer-focus:text-[#434343]`}>
                      Email Id<span className="text-red-500">*</span>
                    </label>
                  </div>
                  <div className="relative w-full h-[60px] bg-white border border-[#B8B8B8] rounded-[16px] focus-within:border-[#004772] focus-within:ring-1 focus-within:ring-[#004772] transition-colors">
                    <input 
                      type="tel" 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="peer w-full h-full bg-transparent px-5 pt-6 pb-1 text-[15px] font-medium text-gray-900 outline-none z-10 relative" 
                    />
                    <label className={`absolute left-5 transition-all duration-200 pointer-events-none z-0 ${
                      phone ? 'top-2 text-[12px] text-[#434343]' : 'top-1/2 -translate-y-1/2 text-[15px] text-gray-400'
                    } peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[12px] peer-focus:text-[#434343]`}>
                      Phone Number
                    </label>
                  </div>
                  <div className="flex gap-6">
                    <div className="flex-1 relative h-[60px] bg-white border border-[#B8B8B8] rounded-[16px] focus-within:border-[#004772] focus-within:ring-1 focus-within:ring-[#004772] transition-colors">
                      <input 
                        type="text" 
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="peer w-full h-full bg-transparent px-5 pt-6 pb-1 text-[15px] font-medium text-gray-900 outline-none z-10 relative" 
                      />
                      <label className={`absolute left-5 transition-all duration-200 pointer-events-none z-0 ${
                        dob ? 'top-2 text-[12px] text-[#434343]' : 'top-1/2 -translate-y-1/2 text-[15px] text-gray-400'
                      } peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[12px] peer-focus:text-[#434343]`}>
                        DOB
                      </label>
                    </div>
                    <div className="flex-1 relative h-[60px] bg-white border border-[#B8B8B8] rounded-[16px] focus-within:border-[#004772] focus-within:ring-1 focus-within:ring-[#004772] transition-colors">
                      <select 
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="peer w-full h-full bg-transparent px-5 pt-6 pb-1 text-[15px] font-medium text-gray-900 outline-none z-10 relative appearance-none"
                      >
                        <option value="" disabled hidden></option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                      <label className={`absolute left-5 transition-all duration-200 pointer-events-none z-0 ${
                        gender ? 'top-2 text-[12px] text-[#434343]' : 'top-1/2 -translate-y-1/2 text-[15px] text-gray-400'
                      } peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[12px] peer-focus:text-[#434343]`}>
                        Gender
                      </label>
                    </div>
                  </div>
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
            className="bg-[#004772] text-white px-10 py-3 rounded-[12px] font-semibold text-[16px] w-full md:w-auto md:min-w-[140px] hover:bg-[#003655] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
