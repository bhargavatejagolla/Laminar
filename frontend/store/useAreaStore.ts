import { create } from 'zustand';

interface AreaState {
  isSurveying: boolean;
  cumulativeTotal: number;
  cameraMemory: Record<string, number>;
  setIsSurveying: (isSurveying: boolean) => void;
  setCumulativeTotal: (total: number) => void;
  updateCameraMemory: (cameraId: string, peak: number) => void;
  resetAreaStore: () => void;
}

export const useAreaStore = create<AreaState>((set) => ({
  isSurveying: false,
  cumulativeTotal: 0,
  cameraMemory: {},
  setIsSurveying: (isSurveying) => set({ isSurveying }),
  setCumulativeTotal: (cumulativeTotal) => set({ cumulativeTotal }),
  updateCameraMemory: (cameraId, peak) => set((state) => ({
    cameraMemory: { ...state.cameraMemory, [cameraId]: peak }
  })),
  resetAreaStore: () => set({ 
    isSurveying: false, 
    cumulativeTotal: 0, 
    cameraMemory: {} 
  }),
}));
