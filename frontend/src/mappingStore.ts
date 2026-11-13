import { create } from 'zustand';
import { ProjectorSlot } from './engine/multiproj';

export interface MappingScreenEntry {
  id: string;
  name: string;
  includeInReport: boolean;
  photoUrl?: string;
  slots: ProjectorSlot[];
  content: { w: number; h: number };
  gamma: number;
}

const createDefaultScreen = (id = 'map-1', name = 'Ekran / Duvar 1'): MappingScreenEntry => ({
  id,
  name,
  includeInReport: true,
  slots: [],
  content: { w: 0, h: 0 },
  gamma: 2.2,
});

interface MappingState {
  screens: MappingScreenEntry[];
  activeScreenId: string;
  slots: ProjectorSlot[];
  content: { w: number; h: number };
  gamma: number;
  setSlots: (s: ProjectorSlot[]) => void;
  setContent: (c: { w: number; h: number }) => void;
  setGamma: (g: number) => void;
  selectScreen: (id: string) => void;
  addScreen: (name?: string) => string;
  removeScreen: (id: string) => void;
  updateScreen: (id: string, patch: Partial<MappingScreenEntry>) => void;
  setAllScreensInReport: (include: boolean) => void;
  hydrateScreens: (screens: MappingScreenEntry[], activeId?: string) => void;
}

export const useMapping = create<MappingState>((set, get) => ({
  screens: [createDefaultScreen()],
  activeScreenId: 'map-1',
  slots: [],
  content: { w: 0, h: 0 },
  gamma: 2.2,

  setSlots: slots =>
    set(st => ({
      slots,
      screens: st.screens.map(sc => (sc.id === st.activeScreenId ? { ...sc, slots } : sc)),
    })),

  setContent: content =>
    set(st => ({
      content,
      screens: st.screens.map(sc => (sc.id === st.activeScreenId ? { ...sc, content } : sc)),
    })),

  setGamma: gamma =>
    set(st => ({
      gamma,
      screens: st.screens.map(sc => (sc.id === st.activeScreenId ? { ...sc, gamma } : sc)),
    })),

  selectScreen: id => {
    const found = get().screens.find(sc => sc.id === id);
    if (!found) return;
    set({
      activeScreenId: id,
      slots: found.slots,
      content: found.content,
      gamma: found.gamma,
    });
  },

  addScreen: name => {
    const st = get();
    const id = `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const nextName = (name ?? '').trim() || `Ekran / Duvar ${st.screens.length + 1}`;
    const entry = createDefaultScreen(id, nextName);
    set({
      screens: [...st.screens, entry],
      activeScreenId: id,
      slots: entry.slots,
      content: entry.content,
      gamma: entry.gamma,
    });
    return id;
  },

  removeScreen: id => {
    const st = get();
    if (st.screens.length <= 1) return;
    const next = st.screens.filter(sc => sc.id !== id);
    const active = next.find(sc => sc.id === st.activeScreenId) ?? next[0];
    set({
      screens: next,
      activeScreenId: active.id,
      slots: active.slots,
      content: active.content,
      gamma: active.gamma,
    });
  },

  updateScreen: (id, patch) =>
    set(st => {
      const screens = st.screens.map(sc => (sc.id === id ? { ...sc, ...patch } : sc));
      const active = screens.find(sc => sc.id === st.activeScreenId);
      return {
        screens,
        ...(active ? { slots: active.slots, content: active.content, gamma: active.gamma } : {}),
      };
    }),

  setAllScreensInReport: include =>
    set(st => ({
      screens: st.screens.map(sc => ({ ...sc, includeInReport: include })),
    })),

  hydrateScreens: (screens, activeId) => {
    const list = screens && screens.length > 0 ? screens : [createDefaultScreen()];
    const active = list.find(sc => sc.id === activeId) ?? list[0];
    set({
      screens: list,
      activeScreenId: active.id,
      slots: active.slots,
      content: active.content,
      gamma: active.gamma,
    });
  },
}));
