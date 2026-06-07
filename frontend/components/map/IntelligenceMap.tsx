"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import Loading from "@/app/loading";

const IntelligenceMapCore = dynamic(() => import("./IntelligenceMapCore"), {
  ssr: false,
  loading: () => <Loading />,
});

interface IntelligenceMapProps {
  venues?: any[];
}

export function IntelligenceMap(props: IntelligenceMapProps) {
  const { t } = useTranslation();
return <IntelligenceMapCore {...props} />;
}
