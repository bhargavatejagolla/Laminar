"use client";

import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/src/i18n/config";

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Restore language after mounting to avoid hydration mismatch
    const saved = localStorage.getItem("laminar_language");
    if (saved && saved !== i18n.language) {
      i18n.changeLanguage(saved);
    }
    setMounted(true);
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <div className={mounted ? "opacity-100" : "opacity-0"} style={{ transition: 'opacity 0.2s' }}>
        {children}
      </div>
    </I18nextProvider>
  );
}
