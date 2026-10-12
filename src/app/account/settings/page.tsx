"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  User,
  Mail,
  Activity,
  ShieldCheck,
  MessageSquare,
  Megaphone,
  Bell,
  Radar,
  AlertTriangle,
  ChevronRight,
  Trash2,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/context/NotificationContext';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
}

// Real users-table columns, read/written via api.updateProfile -- these
// actually persist, unlike the nav items below which have no backing data.
type PrefKey =
  | 'email_notifications'
  | 'sms_alerts'
  | 'promo_notifications'
  | 'host_message_notifications'
  | 'show_profile_to_hosts'
  | 'include_in_search'
  | 'activity_status';

interface ToggleItem {
  key: PrefKey;
  label: string;
  desc: string;
  icon: LucideIcon;
}

const ACCOUNT_ITEMS: NavItem[] = [
  { id: 'personal-info', label: 'Personal information', icon: User, href: '/account/profile' },
  { id: 'email-phone', label: 'Email & Phone no', icon: Mail, href: '/account/profile' },
  { id: 'login-activity', label: 'Login activity', icon: Activity, href: '/account/login-activity' },
  { id: 'profile-verification', label: 'Profile verification', icon: ShieldCheck, href: '/account/verification' },
];

const NOTIFICATION_TOGGLES: ToggleItem[] = [
  {
    key: 'host_message_notifications',
    label: 'Message notifications',
    desc: 'New messages from your hosts',
    icon: MessageSquare,
  },
  {
    key: 'email_notifications',
    label: 'Email notifications',
    desc: 'Booking confirmations, receipts, and reminders',
    icon: Mail,
  },
  {
    key: 'sms_alerts',
    label: 'WhatsApp notifications',
    desc: 'Booking updates via WhatsApp',
    icon: Bell,
  },
  {
    key: 'promo_notifications',
    label: 'Marketing',
    desc: 'Deals, discounts, and Hostiggo news',
    icon: Megaphone,
  },
];

/** Toggles mirrored into notification_preferences, the row the mobile app also edits. */
const SHARED_NOTIFICATION_PREFS: Partial<Record<PrefKey, { group: 'channels' | 'categories'; key: string }>> = {
  email_notifications: { group: 'channels', key: 'email' },
  sms_alerts: { group: 'channels', key: 'whatsapp' },
  promo_notifications: { group: 'categories', key: 'marketing' },
};

const PRIVACY_TOGGLES: ToggleItem[] = [
  {
    key: 'show_profile_to_hosts',
    label: 'Show profile to hosts',
    desc: 'Let hosts see your public profile before booking',
    icon: User,
  },
  {
    key: 'include_in_search',
    label: 'Include in search',
    desc: 'Allow your reviews to appear on listings',
    icon: Radar,
  },
  {
    key: 'activity_status',
    label: 'Activity status',
    desc: 'Show when you were last active',
    icon: Activity,
  },
];

const PRIVACY_NAV_ITEMS: NavItem[] = [
  { id: 'report-issue', label: 'Report an issue', icon: AlertTriangle, href: '/report-issue' },
];
// Language/currency rows were removed: Hostiggo is English + INR only (payments
// settle in INR), so there is no setting to change.

function NavPill({ item }: { item: NavItem }) {
  const Icon = item.icon;

  const content = (
    <>
      <Icon className="w-5 h-5 text-gray-500 shrink-0 group-hover:text-gray-700 transition-colors" />
      <span className="text-gray-900 font-medium text-sm sm:text-[15px] truncate">
        {item.label}
      </span>
      <ChevronRight className="w-4 h-4 text-gray-400 ml-auto shrink-0 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all" />
    </>
  );

  const pillClasses =
    'flex items-center gap-3.5 w-full px-5 py-4 bg-white border border-gray-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-gray-300 transition-all duration-200 text-left group cursor-pointer';

  if (item.href) {
    return (
      <Link href={item.href} className={pillClasses}>
        {content}
      </Link>
    );
  }

  return <div className={pillClasses}>{content}</div>;
}

function Toggle({ on, onToggle, saving }: { on: boolean; onToggle: () => void; saving: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={saving}
      aria-pressed={on}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed',
        on ? 'bg-figma-navy' : 'bg-gray-300',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

function TogglePill({
  item,
  on,
  saving,
  onToggle,
}: {
  item: ToggleItem;
  on: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  const Icon = item.icon;
  return (
    <div className="flex items-center gap-3.5 w-full px-5 py-4 bg-white border border-gray-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <Icon className="w-5 h-5 text-gray-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-gray-900 font-medium text-sm sm:text-[15px] truncate">{item.label}</p>
        <p className="text-xs text-gray-500 truncate">{item.desc}</p>
      </div>
      <Toggle on={on} onToggle={onToggle} saving={saving} />
    </div>
  );
}

export default function GuestSettingsPage() {
  const { preferences: notificationPreferences } = useNotifications();
  const router = useRouter();
  const {
    user,
    userId,
    isAuthenticated,
    loading: authLoading,
    refresh,
    signOut,
  } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [prefs, setPrefs] = useState<Partial<Record<PrefKey, boolean>>>({});
  const [savingKey, setSavingKey] = useState<PrefKey | null>(null);

  // notification_preferences (shared with the app) is the source of truth for
  // the notification toggles -- it's what the server's notify()/notifyWhatsApp()
  // check. The users columns are only a fallback until it loads.
  const [sharedPrefs, setSharedPrefs] = useState<Partial<Record<PrefKey, boolean>>>({});

  useEffect(() => {
    if (!user) return;
    setPrefs({
      email_notifications: user.email_notifications ?? true,
      sms_alerts: user.sms_alerts ?? true,
      promo_notifications: user.promo_notifications ?? false,
      host_message_notifications: user.host_message_notifications ?? true,
      show_profile_to_hosts: user.show_profile_to_hosts ?? true,
      include_in_search: user.include_in_search ?? true,
      activity_status: user.activity_status ?? true,
      ...sharedPrefs,
    });
  }, [user, sharedPrefs]);

  useEffect(() => {
    if (!notificationPreferences) {
      setSharedPrefs({});
      return;
    }
    setSharedPrefs({
      email_notifications: notificationPreferences.channels.email,
      sms_alerts: notificationPreferences.channels.whatsapp,
      promo_notifications: notificationPreferences.categories.marketing,
    });
  }, [notificationPreferences]);

  const handleToggle = async (key: PrefKey) => {
    if (!userId || savingKey) return;
    const next = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    setSavingKey(key);
    try {
      const shared = SHARED_NOTIFICATION_PREFS[key];
      await Promise.all([
        api.updateProfile(userId, { [key]: next }),
        shared ? api.updateNotificationPreferences({ [shared.group]: { [shared.key]: next } }) : null,
      ]);
      if (shared) setSharedPrefs((p) => ({ ...p, [key]: next }));
      await refresh();
    } catch (err) {
      console.error('[account/settings] toggle failed:', err);
      setPrefs((p) => ({ ...p, [key]: !next }));
      toast.error(err instanceof Error ? err.message : 'Could not save that preference.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const handleDeleteAccount = async () => {
    if (!userId || deleting) return;
    setDeleting(true);
    try {
      await api.deactivateAccount(userId);
      toast.success('Your account has been deactivated.');
      setShowDeleteConfirm(false);
      await signOut();
    } catch (err) {
      console.error('[account/settings] deactivate failed:', err);
      toast.error(
        err instanceof Error ? err.message : 'Could not deactivate your account. Please try again.',
      );
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-figma-cream flex flex-col">
      <Navbar />

      <main className="container-main max-w-4xl py-10 flex-1 w-full">
        {/* Header with Circular Back Button & Large Title */}
        <div className="flex items-center gap-4 mb-8">
          <button
            type="button"
            onClick={handleBack}
            className="w-10 h-10 rounded-full bg-[#FFFFFF] border border-gray-200 shadow-sm hover:shadow transition-all flex items-center justify-center text-gray-700 hover:text-gray-900 shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">My Settings</h1>
        </div>

        {authLoading ? (
          <div className="py-24 flex justify-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !isAuthenticated ? (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-card py-16 text-center max-w-md mx-auto">
            <p className="text-4xl mb-3">🔒</p>
            <h2 className="text-lg font-bold text-gray-800 mb-1">
              Sign in to view your settings
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Manage your preferences once you&apos;re signed in.
            </p>
            <Link
              href="/signin?redirect=/account/settings"
              className="inline-flex items-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <div>
            {/* Single main column layout with subtle vertical gray line connecting the sections */}
            <div className="border-l-2 border-gray-100 ml-4 pl-6 space-y-8">
              <section>
                <h2 className="text-gray-500 font-medium text-[15px] mb-4">Account Settings</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ACCOUNT_ITEMS.map((item) => (
                    <NavPill key={item.id} item={item} />
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-gray-500 font-medium text-[15px] mb-4">Notifications</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {NOTIFICATION_TOGGLES.map((item) => (
                    <TogglePill
                      key={item.key}
                      item={item}
                      on={!!prefs[item.key]}
                      saving={savingKey === item.key}
                      onToggle={() => handleToggle(item.key)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-gray-500 font-medium text-[15px] mb-4">Privacy & Security</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PRIVACY_TOGGLES.map((item) => (
                    <TogglePill
                      key={item.key}
                      item={item}
                      on={!!prefs[item.key]}
                      saving={savingKey === item.key}
                      onToggle={() => handleToggle(item.key)}
                    />
                  ))}
                  {PRIVACY_NAV_ITEMS.map((item) => (
                    <NavPill key={item.id} item={item} />
                  ))}
                </div>
              </section>
            </div>

            {/* Dotted horizontal separator at the bottom of the sections */}
            <div className="border-t border-dashed border-gray-300 my-8 w-full" />

            {/* Centered Delete Account Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center justify-center gap-2.5 bg-red-50 hover:bg-red-100 text-red-500 font-semibold px-10 py-3 rounded-xl border border-red-200/70 shadow-sm hover:shadow transition-all duration-200 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-red-500 shrink-0" />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 text-center animate-in fade-in zoom-in-95 duration-150">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-4 border border-red-100">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Account?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to delete your account? You&apos;ll be signed out
                immediately and blocked from signing back in until support restores it.
                This can&apos;t be undone from here.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors text-sm shadow-sm disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
