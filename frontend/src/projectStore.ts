import { create } from 'zustand';
import { Circuit, defaultSupply, Load, Supply } from './engine/electrical';
import { Cabinet } from './engine/led';
import { ReportProjectMeta } from './engine/report';
import { LengthUnit } from './engine/units';
import { useMapping } from './mappingStore';
import { useRoom } from './roomStore';

export interface ProjectionSnapData {
  screenName?: string;
  screenPhotoUrl?: string;
  projectorName: string;
  ansiLumens?: number;
  resolution?: string;
  technology?: string;
  lensName: string;
  imageWidthM: number;
  distanceM: number;
  aspectW: number;
  aspectH: number;
  throwMin: number;
  throwMax: number;
  throwRatio?: number;
  lensFrontProtrusionM: number;
  verticalOffsetM?: number;
  horizontalOffsetM?: number;
}

export interface ProjectionScreenEntry {
  id: string;
  name: string;
  includeInReport: boolean;
  photoUrl?: string;
  calcMode: 'size2dist' | 'dist2size' | 'both2tr';
  sizeMode: 'w2h' | 'h2w' | 'd2wh' | 'wh2d';
  inUnit: LengthUnit;
  ar: string;
  cw: number;
  ch: number;
  dimA: number;
  dimB: number;
  dist: number;
  catProjId: string;
  catLensId: string;
  customLensName: string;
  presetId: string;
  trMin: number;
  trMax: number;
  tr: number;
  vOff: number;
  protr: number;
  snap: ProjectionSnapData;
}

export interface MasterDesignConfig {
  screenWidthM: number;
  screenHeightM: number;
  roomWidthM: number;
  roomLengthM: number;
  roomHeightM: number;
  projectorName: string;
  ansiLumens: number;
  lensName: string;
  throwRatio: number;
  throwDistM: number;
}

export const createDefaultProjectionScreen = (
  id = 'proj-scr-1',
  name = 'Ekran / Duvar 1'
): ProjectionScreenEntry => ({
  id,
  name,
  includeInReport: true,
  calcMode: 'size2dist',
  sizeMode: 'wh2d',
  inUnit: 'm',
  ar: '16:9',
  cw: 6,
  ch: 4,
  dimA: 6,
  dimB: 4,
  dist: 4.8,
  catProjId: 'epson-eb-pu2010b',
  catLensId: 'epson-elplu03s',
  customLensName: '',
  presetId: 'std-125-160',
  trMin: 0.65,
  trMax: 0.78,
  tr: 0.80,
  vOff: 0,
  protr: 0,
  snap: {
    screenName: name,
    projectorName: 'Epson EB-PU2010B (10.000 lm)',
    ansiLumens: 10000,
    lensName: 'ELPLU03S (0.65-0.78:1)',
    imageWidthM: 6.0,
    distanceM: 4.8,
    aspectW: 6,
    aspectH: 4,
    throwMin: 0.65,
    throwMax: 0.78,
    throwRatio: 0.80,
    lensFrontProtrusionM: 0,
  },
});

export interface ProjectState {
  currentProjectId: number | null;
  meta: ReportProjectMeta;
  projectionSnap: ProjectionSnapData;
  projectionScreens: ProjectionScreenEntry[];
  activeProjectionScreenId: string;
  luxSnap: {
    ansiLumens: number[];
    brightnessPct: number;
    widthM: number;
    heightM: number;
    gain: number;
    ambientLux: number;
  };
  ledSnap: {
    cabinet: Cabinet;
    cols: number;
    rows: number;
    spareFraction: number;
  };
  electrical: {
    loads: Load[];
    circuits: Circuit[];
    supply: Supply;
  };
  equipmentList: { category: string; manufacturer: string; model: string; qty: number; notes?: string }[];
  setMeta: (m: Partial<ReportProjectMeta>) => void;
  setCurrentProjectId: (id: number | null) => void;
  setElectrical: (e: Partial<ProjectState['electrical']>) => void;
  setLedSnap: (l: Partial<ProjectState['ledSnap']>) => void;
  setProjectionSnap: (p: Partial<ProjectState['projectionSnap']>) => void;
  setActiveProjectionScreenId: (id: string) => void;
  addProjectionScreen: (name?: string) => ProjectionScreenEntry;
  updateProjectionScreen: (id: string, patch: Partial<ProjectionScreenEntry>) => void;
  removeProjectionScreen: (id: string) => void;
  setAllProjectionScreensInReport: (include: boolean) => void;
  setLuxSnap: (x: Partial<ProjectState['luxSnap']>) => void;
  masterDesign: MasterDesignConfig;
  setMasterDesign: (patch: Partial<MasterDesignConfig>) => void;
  setEquipmentList: (list: ProjectState['equipmentList']) => void;
  serializeAll: () => Record<string, unknown>;
  hydrateAll: (data: Record<string, any>) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProjectId: null,
  meta: {
    companyName: 'PROJEKSİYON & EKRAN TASARIM STÜDYOSU',
    customer: '',
    projectName: '',
    location: '',
    category: '',
    date: new Date().toISOString().slice(0, 10),
    revision: 1,
    description: '',
    notes: '',
    room3dSnapshots: [],
  },
  masterDesign: {
    screenWidthM: 6.0,
    screenHeightM: 4.0,
    roomWidthM: 10.0,
    roomLengthM: 8.0,
    roomHeightM: 5.0,
    projectorName: 'Epson EB-PU2010B (10.000 lm)',
    ansiLumens: 10000,
    lensName: 'ELPLU03S (0.65-0.78:1)',
    throwRatio: 0.80,
    throwDistM: 4.8,
  },
  setMasterDesign: (patch: Partial<MasterDesignConfig>) => {
    set(state => {
      const next: MasterDesignConfig = { ...state.masterDesign, ...patch };
      try {
        localStorage.setItem('quick_lux_calculator_persist_v1', JSON.stringify({
          projectName: state.meta.projectName || 'Sergi Alanı Projeksiyon Parlaklık & Lens Hesabı',
          preparedBy: 'AV & Projeksiyon Tasarım Ekibi',
          screenW: next.screenWidthM,
          screenH: next.screenHeightM,
          projCount: next.screenWidthM > 5 ? 2 : 1,
          lumensPerProj: next.ansiLumens,
          throwDistM: next.throwDistM,
          throwRatio: next.throwRatio,
          opticalEfficiency: 90,
          screenGain: 1.0,
          ambientLux: 50,
        }));
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('master-design-updated', { detail: next }));
      } catch {}
      return {
        masterDesign: next,
        projectionSnap: {
          ...state.projectionSnap,
          projectorName: next.projectorName,
          ansiLumens: next.ansiLumens,
          lensName: next.lensName,
          imageWidthM: next.screenWidthM,
          distanceM: next.throwDistM,
          throwRatio: next.throwRatio,
        },
        luxSnap: {
          ...state.luxSnap,
          widthM: next.screenWidthM,
          heightM: next.screenHeightM,
          ansiLumens: [next.ansiLumens],
        }
      };
    });
  },
  projectionSnap: {
    projectorName: 'Epson EB-PU2010B (10.000 lm)',
    ansiLumens: 10000,
    lensName: 'ELPLU03S (0.65-0.78:1)',
    imageWidthM: 6.0,
    distanceM: 4.8,
    aspectW: 6,
    aspectH: 4,
    throwMin: 0.65,
    throwMax: 0.78,
    throwRatio: 0.80,
    lensFrontProtrusionM: 0,
  },
  projectionScreens: [createDefaultProjectionScreen()],
  activeProjectionScreenId: 'proj-scr-1',
  luxSnap: {
    ansiLumens: [],
    brightnessPct: 100,
    widthM: 0,
    heightM: 0,
    gain: 1.0,
    ambientLux: 0,
  },
  ledSnap: {
    cabinet: { pitchMm: 2.5, widthMm: 500, heightMm: 500, weightKg: 8, powerTypW: 100, powerMaxW: 250 },
    cols: 0,
    rows: 0,
    spareFraction: 0,
  },
  electrical: {
    loads: [],
    circuits: [],
    supply: { ...defaultSupply(), phases: 3, voltage: 230 },
  },
  equipmentList: [],
  setMeta: m => set(s => ({ meta: { ...s.meta, ...m } })),
  setCurrentProjectId: currentProjectId => set({ currentProjectId }),
  setElectrical: e => set(s => ({ electrical: { ...s.electrical, ...e } })),
  setLedSnap: l => set(s => ({ ledSnap: { ...s.ledSnap, ...l } })),
  setProjectionSnap: p => set(s => ({ projectionSnap: { ...s.projectionSnap, ...p } })),
  setActiveProjectionScreenId: id => set({ activeProjectionScreenId: id }),
  addProjectionScreen: name => {
    const s = get();
    const id = `proj-scr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const nextName = (name ?? '').trim() || `Ekran / Duvar ${s.projectionScreens.length + 1}`;
    const entry = createDefaultProjectionScreen(id, nextName);
    set({
      projectionScreens: [...s.projectionScreens, entry],
      activeProjectionScreenId: id,
    });
    return entry;
  },
  updateProjectionScreen: (id, patch) =>
    set(s => ({
      projectionScreens: s.projectionScreens.map(sc => (sc.id === id ? { ...sc, ...patch } : sc)),
    })),
  removeProjectionScreen: id =>
    set(s => {
      if (s.projectionScreens.length <= 1) return s;
      const next = s.projectionScreens.filter(sc => sc.id !== id);
      const activeId = next.some(sc => sc.id === s.activeProjectionScreenId)
        ? s.activeProjectionScreenId
        : next[0].id;
      return { projectionScreens: next, activeProjectionScreenId: activeId };
    }),
  setAllProjectionScreensInReport: include =>
    set(s => ({
      projectionScreens: s.projectionScreens.map(sc => ({ ...sc, includeInReport: include })),
    })),
  setLuxSnap: x => set(s => ({ luxSnap: { ...s.luxSnap, ...x } })),
  setEquipmentList: equipmentList => set({ equipmentList }),
  serializeAll: () => {
    const s = get();
    const mp = useMapping.getState();
    const rm = useRoom.getState();
    return {
      meta: s.meta,
      projectionSnap: s.projectionSnap,
      projectionScreens: s.projectionScreens,
      activeProjectionScreenId: s.activeProjectionScreenId,
      luxSnap: s.luxSnap,
      ledSnap: s.ledSnap,
      electrical: s.electrical,
      equipmentList: s.equipmentList,
      mapping: {
        slots: mp.slots,
        content: mp.content,
        gamma: mp.gamma,
        screens: mp.screens,
        activeScreenId: mp.activeScreenId,
      },
      room3d: { room: rm.room, surfaces: rm.surfaces, obstacles: rm.obstacles, projectors: rm.projectors },
    };
  },
  hydrateAll: (d: Record<string, any>) => {
    if (!d) return;
    set(s => ({
      meta: d.meta ?? s.meta,
      projectionSnap: d.projectionSnap ?? s.projectionSnap,
      projectionScreens: d.projectionScreens ?? s.projectionScreens,
      activeProjectionScreenId: d.activeProjectionScreenId ?? s.activeProjectionScreenId,
      luxSnap: d.luxSnap ?? s.luxSnap,
      ledSnap: d.ledSnap ?? s.ledSnap,
      electrical: d.electrical ?? s.electrical,
      equipmentList: d.equipmentList ?? s.equipmentList,
    }));
    if (d.mapping) {
      const mp = useMapping.getState();
      if (d.mapping.screens) {
        mp.hydrateScreens(d.mapping.screens, d.mapping.activeScreenId);
      } else {
        if (d.mapping.slots) mp.setSlots(d.mapping.slots);
        if (d.mapping.content) mp.setContent(d.mapping.content);
        if (d.mapping.gamma) mp.setGamma(d.mapping.gamma);
      }
    }
    if (d.room3d) {
      useRoom.setState(r => ({
        ...r,
        room: d.room3d.room ?? r.room,
        surfaces: d.room3d.surfaces ?? r.surfaces,
        obstacles: d.room3d.obstacles ?? r.obstacles,
        projectors: d.room3d.projectors ?? r.projectors,
      }));
    }
  },
}));
