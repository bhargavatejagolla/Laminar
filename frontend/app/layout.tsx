import "./globals.css";
import "@fontsource/inter";
import "@fontsource/space-grotesk";
import QueryProvider from "@/components/providers/query-provider"
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "sonner";
import AIAssistantChat from "@/components/dashboard/ai-assistant-chat";
import I18nProvider from "@/components/providers/i18n-provider";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata = {
  title: "Laminar — AI Crowd Intelligence",
  description: "AI powered crowd risk prediction and safety monitoring system",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-96x96.png",
    apple: "/apple-touch-icon.png",
    other: "/logo.png"
  },
}

// Load Google Client ID from environment
// Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in frontend/.env.local
// Get it from: https://console.cloud.google.com → APIs & Services → Credentials
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

if (!GOOGLE_CLIENT_ID && typeof window !== "undefined") {
  console.warn(
    "[Laminar] NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set. " +
    "Google Sign-In will not work. Set it in frontend/.env.local"
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "Inter, sans-serif",
          backgroundColor: "#050b14",
        }}
      >
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <QueryProvider>
            <I18nProvider>
              <Toaster theme="dark" position="bottom-right" richColors expand={false} visibleToasts={3} closeButton toastOptions={{
                style: {
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                }
              }} />
              {children}
              {/* Global AI Assistant Floating Widget */}
              <AIAssistantChat />
            </I18nProvider>
          </QueryProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  )
}