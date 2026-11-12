import { create } from 'zustand';
import { ProjectorSlot, gridLayout } from './engine/multiproj';

interface MappingState {
  slots: ProjectorSlot[];
  content: { w: number; h: number };
  gamma: number;
  setSlots: (s: ProjectorSlot[]) => void;
  setContent: (c: { w: number; h: number }) => void;
  setGamma: (g: number) => void;
}

export const useMapping = create<MappingState>(set => ({
  slots: [],
  content: { w: 0, h: 0 },
  gamma: 2.2,
  setSlots: slots => set({ slots }),
  setContent: content => set({ content }),
  setGamma: gamma => set({ gamma }),
}));
