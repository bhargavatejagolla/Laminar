"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Dynamically import the MapCore to prevent 'window is not defined' SSR error in Next.js
import { useTranslation } from "react-i18next";
const LoadingComponent = () => {
  const { t } = useTranslation();
  return (
    <div className="flex w-full h-[400px] flex-col items-center justify-center bg-black/20 border border-white/5 rounded-md backdrop-blur-md">
       <Loader2 className="h-6 w-6 text-primary animate-spin mb-4" />
       <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono">{t("auto.InitializingGPS_1714") || "Initializing GPS Link"}</p>
    </div>
  );
};

const MapPickerCore = dynamic(() => import("./MapPickerCore"), {
  ssr: false,
  loading: LoadingComponent,
});

interface MapPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationSelect?: (lat: number, lng: number, address: string, city?: string, country?: string) => void;
  fullScreen?: boolean;
  readOnly?: boolean;
  venues?: any[];
}

export function MapPicker(props: MapPickerProps) {
  const { t } = useTranslation();

  return <MapPickerCore {...props} />;
}
