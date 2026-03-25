"use client";

import { useEffect, useCallback } from "react";
import { useZoneIntelligenceSummary } from "./useZoneIntelligence";
import { useAreaStore } from "@/store/useAreaStore";

/**
 * Hook to manage "Panoramic Area Survey" logic with global persistence.
 */
export function useAreaIntelligence() {
  const { data: summary } = useZoneIntelligenceSummary(1000);
  const { 
    isSurveying, 
    cumulativeTotal, 
    cameraMemory, 
    setIsSurveying, 
    setCumulativeTotal, 
    updateCameraMemory,
    resetAreaStore 
  } = useAreaStore();

  const startSurvey = useCallback(() => {
    resetAreaStore();
    setIsSurveying(true);
  }, [resetAreaStore, setIsSurveying]);

  const stopSurvey = useCallback(() => {
    setIsSurveying(false);
  }, [setIsSurveying]);

  const restartSurvey = useCallback(() => {
    resetAreaStore();
    setIsSurveying(true);
  }, [resetAreaStore, setIsSurveying]);

  const resetSurvey = useCallback(() => {
    resetAreaStore();
  }, [resetAreaStore]);

  useEffect(() => {
    if (!isSurveying || !summary?.cameras) return;

    let total = 0;
    let changed = false;

    summary.cameras.forEach((cam) => {
      const currentCount = cam.snapshot?.density?.current || 0;
      const prevPeak = cameraMemory[cam.camera_id] || 0;

      if (currentCount > prevPeak) {
        updateCameraMemory(cam.camera_id, currentCount);
        changed = true;
      }
    });

    // We recalculate total from the latest memory
    // Note: Since updateCameraMemory is an action, we might need to be careful with stale state.
    // But since Zustand updates are synchronous in the current frame or next, it should be fine.
    // However, it's safer to sum the 'effective' values.
    const effectiveMemory = { ...cameraMemory };
    summary.cameras.forEach(cam => {
      const current = cam.snapshot?.density?.current || 0;
      if (current > (effectiveMemory[cam.camera_id] || 0)) {
        effectiveMemory[cam.camera_id] = current;
      }
    });

    const newTotal = Object.values(effectiveMemory).reduce((acc, curr) => acc + curr, 0);
    if (newTotal !== cumulativeTotal) {
      setCumulativeTotal(newTotal);
    }
  }, [isSurveying, summary, cameraMemory, cumulativeTotal, updateCameraMemory, setCumulativeTotal]);

  return {
    isSurveying,
    cumulativeTotal,
    startSurvey,
    stopSurvey,
    restartSurvey,
    resetSurvey,
    cameraMemory,
    activeCameras: summary?.cameras || [],
  };
}
