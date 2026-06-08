"use client";
import { SmartSectionDashboard } from "@/components/smart-city/SmartSectionDashboard";
import { useTranslation } from "react-i18next";

export default function SmartSystemsHubPage() {
  const { t } = useTranslation();

  return <SmartSectionDashboard sectionType="hub" title={t("auto.SystemsHub_7628") || "Systems Hub"} />;
}
