import { create } from 'zustand';

type AppState = {
  onboardingDone: boolean;
  setOnboardingDone: (value: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  onboardingDone: false,
  setOnboardingDone: (value) => set({ onboardingDone: value }),
}));
