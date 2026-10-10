'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { UserAvatar } from '@/components/ui/user-avatar';
import Link from 'next/link';
import { toast } from 'sonner';
import { BadgeCheck, Camera, ShieldCheck, Loader2, Pencil, Compass, Users, UserCheck, User, PartyPopper, Coffee, Sun, Map, Utensils, Landmark, BookOpen, Smile, Star } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { useAuth } from '@/context/AuthContext';
import { useKycStatus } from '@/hooks/useKycStatus';
import { api } from '@/lib/api';

const mapChipToTag = (chip: string) => {
  if (chip === 'Travel' || chip === 'New experiences') return { label: 'Traveller', icon: Compass };
  if (chip === 'Friends' || chip === 'Yes, absolutely!') return { label: 'Extrovert', icon: Users };
  if (chip === 'Sometimes') return { label: 'Ambivert', icon: UserCheck };
  if (chip === 'I prefer staying to myself') return { label: 'Introvert', icon: User };
  if (chip === 'House party') return { label: 'Party goer', icon: PartyPopper };
  if (chip === 'Quiet evening') return { label: 'Quiet', icon: Coffee };
  if (chip === 'Chill & Relax') return { label: 'Chill', icon: Sun };
  if (chip === 'Adventure') return { label: 'Adventurer', icon: Map };
  if (chip === 'Foodie' || chip === 'My cooking') return { label: 'Foodie', icon: Utensils };
  if (chip === 'Culture') return { label: 'Culture', icon: Landmark };
  if (chip === 'My stories') return { label: 'Storyteller', icon: BookOpen };
  if (chip === 'My jokes') return { label: 'Joker', icon: Smile };
  return { label: chip, icon: Star };
};

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

  const hasAboutMe = false; // Add real about_me logic from backend when available
  const aboutMeChips: any[] = [];

  // Calculate profile completion percentage
  const { percentage } = useMemo(() => {
    let completed = 0;
    let total = 0;
    const check = (condition: any) => {
      total++;
      if (condition) completed++;
    };

    check(user?.profile_pic_url);
    check(user?.name);
    check(user?.email);
    check(user?.phone);
    check(user?.dob || user?.age);
    check(user?.gender);
    check(identityVerified);



    return {
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [user, identityVerified]);

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
      <main className="w-full max-w-[1440px] mx-auto px-6 lg:px-10 py-6">
        <h1 className="text-[32px] font-bold text-gray-900 mb-6 pt-2">My profile</h1>

        {loading ? (
          <div className="py-24 flex justify-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !isAuthenticated ? (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-card py-16 text-center max-w-md mx-auto">
            <p className="text-4xl mb-3">🔒</p>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Sign in to view your profile</h2>
            <p className="text-sm text-gray-500 mb-6">Manage your personal details once you’re signed in.</p>
            <Link
              href="/signin?redirect=/account/profile"
              className="inline-flex items-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-stretch mt-4">
            {/* Summary */}
            <aside className="w-full lg:w-[434px] shrink-0 space-y-6 flex flex-col">
              <div className="relative w-full lg:w-[434px] lg:h-[290px]">
                {/* Reddish/warm glow behind the card */}
                <div className="absolute inset-[-12px] bg-[#E3A090]/30 rounded-[34px] blur-2xl z-0 pointer-events-none"></div>
                
                {/* Actual Profile Card */}
                <div className="bg-white rounded-[22px] p-8 shadow-[0_2px_16px_rgba(0,0,0,0.06)] relative z-10 w-full h-full flex flex-col">
                  <Link href="/account/profile/edit" className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors">
                    <Pencil className="w-5 h-5" />
                  </Link>
                  <div className="flex items-center gap-5 mt-2">
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingPhoto}
                        className="w-[84px] h-[84px] rounded-full overflow-hidden border border-gray-100 cursor-pointer relative group"
                      >
                        <UserAvatar
                          src={user?.profile_pic_url}
                          name={name || 'Profile'}
                          size={84}
                          className="h-full w-full"
                        />
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {uploadingPhoto ? (
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          ) : (
                            <Camera className="w-5 h-5 text-white" />
                          )}
                        </div>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoChange}
                        className="hidden"
                      />
                    </div>
                    <div className="pt-1">
                      <h2 className="text-[22px] font-bold text-gray-900 leading-tight">{name || 'Your name'}</h2>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-[15px] text-gray-500">Guest</p>
                        {identityVerified && (
                          <div 
                            className="flex items-center justify-center text-white font-semibold text-[9px] uppercase tracking-wider shrink-0"
                            style={{
                              width: '68px',
                              height: '17px',
                              background: 'linear-gradient(90deg, #C026D3 0%, #4F46E5 100%)',
                              borderRadius: '4px'
                            }}
                          >
                            VERIFIED
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mt-auto pt-6 border-t border-gray-100 w-full">
                    <div className="h-[4px] w-full bg-gray-100 rounded-full overflow-hidden mb-3">
                      <div 
                        className="h-full bg-primary-gradient rounded-full transition-all duration-300 ease-in-out" 
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between text-[13px] font-semibold tracking-wide">
                      <span className="text-gray-500">Your profile is {percentage}% complete</span>
                      <Link href="/account/profile/about-me" className="text-[#0396EF] font-bold hover:underline">Continue</Link>
                    </div>
                  </div>
                </div>
              </div>

              {identityVerified ? null : identityPending ? (
                <div className="bg-white rounded-[14px] w-full lg:w-[434px] lg:h-[224px] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex flex-col justify-center">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-figma-navy/5 flex items-center justify-center text-figma-navy shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-gray-800">Verification in review</p>
                      <p className="text-[13px] text-gray-500 mt-1">
                        We received your ID details and will update your profile when checks finish.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full lg:w-[434px] lg:h-[224px] rounded-[14px] border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-transparent">
                  <h3 className="font-extrabold text-gray-900 mb-2 text-[16px]">Profile verification required!</h3>
                  <p className="text-center text-[13px] leading-relaxed text-gray-500 mb-6 px-4">
                    You need to verify your profile with an official government identity proof
                  </p>
                  <Link
                    href="/account/verification"
                    className="w-[158px] h-[49px] rounded-[14px] border-2 border-[#004772] text-[15px] font-bold text-[#004772] flex items-center justify-center bg-white hover:bg-[#004772]/5 transition-colors box-border"
                  >
                    Let’s start
                  </Link>
                </div>
              )}
            </aside>

            {/* Vertical Separator */}
            <div className="hidden lg:block w-[1px] bg-gray-900/10 mx-10 xl:mx-16 self-stretch"></div>

            {/* Details */}
            <div className="flex-1 mt-10 lg:mt-0 pt-2">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[32px] md:text-[40px] font-bold text-gray-900 leading-tight">About Me</h2>
                <Link href="/account/profile/about-me" className="w-[101px] h-[49px] rounded-[14px] border-2 border-[#004772] text-[15px] font-bold text-[#004772] flex items-center justify-center hover:bg-gray-50 transition-colors bg-white shrink-0">
                  Edit
                </Link>
              </div>
              <p className="text-[#5F5F5F] text-[15px] font-normal mb-8 max-w-[850px] leading-[1.6]">
                Tell others a bit about yourself. Share your interests, travel style, hobbies, profession, or anything that helps hosts and guests get to know you better.
              </p>
              {hasAboutMe ? (
                <div className="flex flex-wrap gap-4 mt-2">
                  {aboutMeChips.map((chip, idx) => {
                    const { label, icon: Icon } = mapChipToTag(chip);
                    return (
                      <div key={idx} className="w-[149px] h-[49px] rounded-[11px] border border-[#818181] bg-white flex items-center px-[10px] gap-2.5 shrink-0">
                        <div className="w-[30px] h-[30px] rounded-[8px] bg-[#333333] flex items-center justify-center shrink-0">
                          <Icon className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                        </div>
                        <span className="text-[14px] font-semibold text-[#333333] truncate pt-0.5">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Link href="/account/profile/about-me" className="inline-flex px-8 py-2.5 bg-[#004772] text-white text-[14px] font-bold rounded-[12px] hover:bg-[#003859] transition-colors">
                  Let’s start
                </Link>
              )}
            </div>
          </div>

        )}
      </main>
    </div>
  );
}
