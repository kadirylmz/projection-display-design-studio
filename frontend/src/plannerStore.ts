import { create } from 'zustand';
import type { CalculatedSurface, PhysicalRoomConfig, SurfaceItem } from './modules/ContentPlanner';

export interface PlannerStoreState {
  surfaces: SurfaceItem[];
  physicalRoom: PhysicalRoomConfig;
  calculatedSurfaces: CalculatedSurface[];
  totalProjectors: number;
  setSurfaces: (surfaces: SurfaceItem[]) => void;
  setPhysicalRoom: (room: PhysicalRoomConfig) => void;
  setCalculatedSurfaces: (calcSurfs: CalculatedSurface[]) => void;
}

const INITIAL_SURFACES: SurfaceItem[] = [
  {
    id: 'surf-1',
    name: '1. Duvar (Sol Uzun)',
    type: 'wall',
    geometry: 'flat',
    widthM: 23.30,
    heightM: 4.30,
    radiusM: 6.0,
    angleDeg: 120,
    resIdx: 0,
    customW: 1920,
    customH: 1200,
    orient: 'landscape',
    cols: 4,
    rows: 1,
    overlapMode: 'percent',
    overlapX: 20.4,
    overlapY: 10,
    throwDistM: 5.50,
    throwRatio: 0.80,
    viewDistM: 3.50,
    color: '#0284c7',
    canvasX: 0,
    canvasY: 0,
    rotate90: true,
  },
  {
    id: 'surf-2',
    name: '2. Duvar (Ön Kısa)',
    type: 'wall',
    geometry: 'flat',
    widthM: 7.00,
    heightM: 4.30,
    radiusM: 6.0,
    angleDeg: 90,
    resIdx: 0,
    customW: 1920,
    customH: 1200,
    orient: 'landscape',
    cols: 2,
    rows: 1,
    overlapMode: 'percent',
    overlapX: 15,
    overlapY: 10,
    throwDistM: 5.50,
    throwRatio: 0.80,
    viewDistM: 3.50,
    color: '#0d9488',
    canvasX: 0,
    canvasY: 0,
    rotate90: false,
  },
  {
    id: 'surf-3',
    name: '3. Duvar (Sağ Uzun)',
    type: 'wall',
    geometry: 'flat',
    widthM: 23.30,
    heightM: 4.30,
    radiusM: 6.0,
    angleDeg: 120,
    resIdx: 0,
    customW: 1920,
    customH: 1200,
    orient: 'landscape',
    cols: 4,
    rows: 1,
    overlapMode: 'percent',
    overlapX: 20.4,
    overlapY: 10,
    throwDistM: 5.50,
    throwRatio: 0.80,
    viewDistM: 3.50,
    color: '#d97706',
    canvasX: 0,
    canvasY: 0,
    rotate90: true,
  },
  {
    id: 'surf-4',
    name: 'Zemin (Floor)',
    type: 'floor',
    geometry: 'flat',
    widthM: 23.30,
    heightM: 7.00,
    radiusM: 6.0,
    angleDeg: 360,
    resIdx: 0,
    customW: 1920,
    customH: 1200,
    orient: 'landscape',
    cols: 4,
    rows: 2,
    overlapMode: 'percent',
    overlapX: 20.4,
    overlapY: 18.6,
    throwDistM: 4.30,
    throwRatio: 0.65,
    viewDistM: 1.80,
    color: '#059669',
    canvasX: 0,
    canvasY: 0,
    rotate90: true,
    syncFloorWithWalls: true,
  },
];

export const usePlannerStore = create<PlannerStoreState>((set) => ({
  surfaces: [],
  physicalRoom: {
    enabled: false,
    widthM: 0,
    lengthM: 0,
    heightM: 0,
  },
  calculatedSurfaces: [],
  totalProjectors: 0,
  setSurfaces: (surfaces) => set((state) => {
    const total = surfaces.reduce((acc, s) => acc + s.cols * s.rows, 0);
    return { surfaces, totalProjectors: total };
  }),
  setPhysicalRoom: (physicalRoom) => set({ physicalRoom }),
  setCalculatedSurfaces: (calculatedSurfaces) => set((state) => {
    const total = calculatedSurfaces.reduce((acc, s) => acc + s.cols * s.rows, 0);
    return { calculatedSurfaces, totalProjectors: total };
  }),
}));
