'use client';

import { useAuth } from '@/context/AuthContext';
import HostDashboardShell from '../_components/HostDashboardShell';
import HostChatUI from './_components/HostChatUI';

export default function HostChatPage() {
  const { user } = useAuth();

  return (
    <HostDashboardShell active="chat">
      <div className="flex flex-col gap-3 sm:gap-6">
        {/* Page header */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Messages</h2>
          <p className="hidden sm:block text-sm text-gray-500">Real-time chat with your guests about bookings and properties.</p>
        </div>

        {/* Chat UI - takes remaining space */}
        <div className="flex-1">
          <HostChatUI />
        </div>
      </div>
    </HostDashboardShell>
  );
}
