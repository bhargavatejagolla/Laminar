"use client";

import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useGlobalNotifications } from "@/hooks/useGlobalNotifications"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Activate global sound and toast notifications
  useGlobalNotifications();
  return (
    <div className="flex h-screen bg-[#020617] text-slate-300 relative w-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 relative">
          <div className="w-full max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}