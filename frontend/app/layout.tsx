import "./globals.css";
import "@fontsource/inter";
import "@fontsource/space-grotesk";
import "@fontsource/outfit";
import QueryProvider from "@/components/providers/query-provider"
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "sonner";
import AIAssistantChat from "@/components/dashboard/ai-assistant-chat";
import I18nProvider from "@/components/providers/i18n-provider";
import { NotificationMesh } from "@/components/layout/NotificationMesh";

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
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700,800,900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          fontFamily: "'General Sans', Inter, sans-serif",
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
              <NotificationMesh />
              {/* Global AI Assistant Floating Widget */}
              <AIAssistantChat />
            </I18nProvider>
          </QueryProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  )
}