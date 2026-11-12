import { create } from 'zustand';
import { Circuit, defaultSupply, Load, Supply } from './engine/electrical';
import { Cabinet } from './engine/led';
import { ReportProjectMeta } from './engine/report';
import { useMapping } from './mappingStore';
import { useRoom } from './roomStore';

export interface ProjectState {
  currentProjectId: number | null;
  meta: ReportProjectMeta;
  projectionSnap: {
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
  };
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
  setLuxSnap: (x: Partial<ProjectState['luxSnap']>) => void;
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
  projectionSnap: {
    projectorName: '',
    lensName: '',
    imageWidthM: 0,
    distanceM: 0,
    aspectW: 16,
    aspectH: 9,
    throwMin: 0,
    throwMax: 0,
    lensFrontProtrusionM: 0,
  },
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
  setLuxSnap: x => set(s => ({ luxSnap: { ...s.luxSnap, ...x } })),
  setEquipmentList: equipmentList => set({ equipmentList }),
  serializeAll: () => {
    const s = get();
    const mp = useMapping.getState();
    const rm = useRoom.getState();
    return {
      meta: s.meta,
      projectionSnap: s.projectionSnap,
      luxSnap: s.luxSnap,
      ledSnap: s.ledSnap,
      electrical: s.electrical,
      equipmentList: s.equipmentList,
      mapping: { slots: mp.slots, content: mp.content, gamma: mp.gamma },
      room3d: { room: rm.room, surfaces: rm.surfaces, obstacles: rm.obstacles, projectors: rm.projectors },
    };
  },
  hydrateAll: (d: Record<string, any>) => {
    if (!d) return;
    set(s => ({
      meta: d.meta ?? s.meta,
      projectionSnap: d.projectionSnap ?? s.projectionSnap,
      luxSnap: d.luxSnap ?? s.luxSnap,
      ledSnap: d.ledSnap ?? s.ledSnap,
      electrical: d.electrical ?? s.electrical,
      equipmentList: d.equipmentList ?? s.equipmentList,
    }));
    if (d.mapping) {
      const mp = useMapping.getState();
      if (d.mapping.slots) mp.setSlots(d.mapping.slots);
      if (d.mapping.content) mp.setContent(d.mapping.content);
      if (d.mapping.gamma) mp.setGamma(d.mapping.gamma);
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
