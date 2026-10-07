'use client';

import Link from 'next/link';
import { Pencil, Star, Home, CalendarCheck, ShieldCheck, ChevronRight, type LucideIcon, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { UserAvatar } from '@/components/ui/user-avatar';
import HostDashboardShell, { DashboardHeading } from '../_components/HostDashboardShell';
import ProfileCompletionCard from '../_components/ProfileCompletionCard';

const QUICK: { icon: LucideIcon; label: string; href: string }[] = [
  { icon: Home, label: 'My listings', href: '/host/listings' },
  { icon: CalendarCheck, label: 'Reservations', href: '/host/bookings' },
  { icon: ShieldCheck, label: 'Account & security', href: '/host/settings' },
];

type ProfileData = {
  name: string;
  email?: string;
  phone?: string;
  avatar?: string | null;
  about: string;
  isVerified: boolean;
  stats: {
    rating: number | string;
    reviews: number;
    listings: number;
  };
};

export default function HostAccountPage() {
  const { userId } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    try {
      // Ensure the user has a host profile row before fetching it -- a host
      // who lands here before ever visiting /host/listings or /host/settings
      // (which both do this) has no `host` row yet, and profile-info 404s.
      try {
        await fetch('/api/host/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      } catch (profileErr) {
        console.error('[host/account] Failed to create/ensure host profile:', profileErr);
      }

      const res = await fetch(`/api/host/profile-info?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error(`Failed to fetch profile: ${res.status}`);
      
      const json = await res.json();
      setProfile(json.data);
    } catch (err) {
      console.error('[host/account] Failed to load profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !userId) return;

    setUploadingPhoto(true);
    try {
      const url = await api.uploadProfilePhoto(file);
      await api.updateProfile(userId, { profile_pic_url: url });
      await loadProfile();
      toast.success('Profile photo updated.');
    } catch (err) {
      console.error('[host/account] photo upload failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <HostDashboardShell active="settings">
        <div className="py-16 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-figma-navy" />
        </div>
      </HostDashboardShell>
    );
  }

  if (error || !profile) {
    return (
      <HostDashboardShell active="settings">
        <div className="bg-white rounded-3xl p-8 shadow-card border border-gray-200 text-center">
          <p className="text-red-500 font-bold">{error || 'Failed to load profile'}</p>
        </div>
      </HostDashboardShell>
    );
  }

  const stats = [
    { label: 'Rating', value: profile.stats.rating },
    { label: 'Reviews', value: profile.stats.reviews },
    { label: 'Listings', value: profile.stats.listings },
  ];

  return (
    <HostDashboardShell active="settings">
      <DashboardHeading
        title="Host Profile"
        subtitle="Your public profile and quick links to manage your hosting account."
      />

      <ProfileCompletionCard
        profile={{
          avatar: profile.avatar,
          about: profile.about,
          email: profile.email,
          phone: profile.phone,
          listings: profile.stats.listings,
        }}
        onPickPhoto={() => fileInputRef.current?.click()}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profile card */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-8 shadow-card border border-gray-200">
          <div className="flex flex-col items-center text-center">
            <div className="relative w-32 h-32 mb-6">
              <UserAvatar
                src={profile.avatar}
                name={profile.name}
                size={128}
                className="rounded-3xl object-cover ring-4 ring-gray-100 shadow"
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
                className="absolute -bottom-2 -right-2 bg-figma-navy text-white p-2 rounded-xl shadow-md hover:scale-110 transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              </button>
            </div>
            <h2 className="text-xl font-bold text-gray-800">{profile.name}</h2>
            {profile.isVerified && (
              <div className="flex items-center gap-1 text-sm font-bold text-figma-navy mb-6">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" /> Verified Host
              </div>
            )}
            <div className="w-full grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 pt-6">
              {stats.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-lg font-bold text-gray-800">{s.value}</p>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick links + about */}
        <div className="lg:col-span-7 space-y-6">
          {/* About section - Read only */}
          <div className="bg-white rounded-3xl p-6 shadow-card border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">About</h3>
            <p className="text-sm text-gray-600 leading-relaxed min-h-[80px]">
              {profile.about || <span className="text-gray-400 italic">No about section added yet.</span>}
            </p>
          </div>

          {/* Contact info */}
          <div className="bg-white rounded-3xl p-6 shadow-card border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Contact Info</h3>
            <div className="space-y-3 text-sm">
              {profile.email && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Email</p>
                  <p className="text-gray-800 font-medium">{profile.email}</p>
                </div>
              )}
              {profile.phone && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Phone</p>
                  <p className="text-gray-800 font-medium">{profile.phone}</p>
                </div>
              )}
              {!profile.email && !profile.phone && (
                <p className="text-gray-500 text-sm">No contact info on file</p>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-3xl p-2 shadow-card border border-gray-200">
            {QUICK.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.label}
                  href={q.href}
                  className="flex items-center justify-between px-4 py-4 rounded-2xl hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-figma-navy/5 flex items-center justify-center text-figma-navy">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{q.label}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </HostDashboardShell>
  );
}
