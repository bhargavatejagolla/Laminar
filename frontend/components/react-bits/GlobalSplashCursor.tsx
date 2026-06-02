"use client";
import { usePathname } from "next/navigation";
import SplashCursor from "./SplashCursor";

export default function GlobalSplashCursor() {
    const pathname = usePathname();

    // List of paths where the splash cursor should NOT appear
    const excludedPaths = [
        "/", 
        "/login", 
        "/register", 
        "/ai-explanation",
        "/onboarding",
        "/verify-email"
    ];

    if (excludedPaths.includes(pathname)) {
        return null;
    }

    // Render with optimized parameters to fix lags
    return (
        <SplashCursor 
            SIM_RESOLUTION={64} 
            DYE_RESOLUTION={512} 
            CAPTURE_RESOLUTION={256} 
            SPLAT_FORCE={4000} 
            COLOR_UPDATE_SPEED={5} 
        />
    );
}
