"use client";

/**
 * Laminar - Theme Switcher
 * -------------------------
 * Provides Dark / Light / High-Contrast theme switching using CSS custom properties.
 * No external package required — uses Tailwind dark: classes + CSS variables approach.
 *
 * Persists selection in localStorage, applies class to <html> element.
 * Integrates with existing dark theme (Laminar's default is already dark).
 */

import * as React from "react";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

export type Theme = "dark" | "light" | "high-contrast";

const THEMES: { id: Theme; label: string; Icon: React.FC }[] = [
  { id: "dark", label: "Dark", Icon: MoonIcon },
  { id: "light", label: "Light", Icon: SunIcon },
  { id: "high-contrast", label: "High Contrast", Icon: ContrastIcon },
];

export function ThemeSwitcher({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  // Avoid hydration mismatch
  if (!mounted) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <div className="w-28 h-9 rounded-full bg-neutral-800/40 animate-pulse border border-white/5" />
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center p-1 bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl rounded-full ${className}`}
      role="group"
      aria-label="Theme switcher"
    >
      {/* Animated active pill background */}
      <div 
        className="absolute top-1 bottom-1 w-8 bg-gradient-to-tr from-indigo-500 to-cyan-400 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all duration-300 ease-out z-0"
        style={{
          transform: `translateX(${theme === 'dark' ? '0px' : theme === 'light' ? '32px' : '64px'})`
        }}
      />

      {THEMES.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => handleThemeChange(id)}
          title={`Switch to ${label} theme`}
          aria-pressed={theme === id}
          className={`
            relative z-10 flex items-center justify-center w-8 h-7 rounded-full
            transition-colors duration-300 focus:outline-none
            ${theme === id
              ? "text-white"
              : "text-neutral-500 hover:text-neutral-300"
            }
          `}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function ContrastIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20M2 12h20" strokeWidth="1.5" />
      <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" />
    </svg>
  );
}
