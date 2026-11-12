import { create } from 'zustand';
import { Aabb, Projector3D, Surface, V3 } from './engine/room3d';

export interface ImportedModel { id: string; name: string; ext: 'glb' | 'gltf' | 'obj' | 'fbx'; url: string; pos: V3; scale: number }
export type Sel = { type: 'projector' | 'surface' | 'obstacle' | 'model'; id: string } | null;

export interface RoomState {
  room: { w: number; l: number; h: number };       // x: [-w/2,w/2], z: [0,l], y: [0,h]
  surfaces: Surface[];
  obstacles: Aabb[];
  projectors: Projector3D[];
  models: ImportedModel[];
  sel: Sel;
  human: boolean;
  setRoom: (r: RoomState['room']) => void;
  setSel: (s: Sel) => void;
  setHuman: (b: boolean) => void;
  upsertProjector: (p: Projector3D) => void;
  upsertSurface: (s: Surface) => void;
  upsertObstacle: (o: Aabb) => void;
  upsertModel: (m: ImportedModel) => void;
  remove: (type: NonNullable<Sel>['type'], id: string) => void;
}

const upsert = <T extends { id: string }>(arr: T[], x: T) => arr.some(a => a.id === x.id) ? arr.map(a => a.id === x.id ? x : a) : [...arr, x];
let counter = 1;
export const newId = (p: string) => `${p}${counter++}`;

export const useRoom = create<RoomState>(set => ({
  room: { w: 0, l: 0, h: 0 },
  surfaces: [],
  obstacles: [],
  projectors: [],
  models: [],
  sel: null,
  human: false,
  setRoom: room => set({ room }),
  setSel: sel => set({ sel }),
  setHuman: human => set({ human }),
  upsertProjector: p => set(s => ({ projectors: upsert(s.projectors, p) })),
  upsertSurface: x => set(s => ({ surfaces: upsert(s.surfaces, x) })),
  upsertObstacle: o => set(s => ({ obstacles: upsert(s.obstacles, o) })),
  upsertModel: m => set(s => ({ models: upsert(s.models, m) })),
  remove: (type, id) => set(s => ({
    projectors: type === 'projector' ? s.projectors.filter(x => x.id !== id) : s.projectors,
    surfaces: type === 'surface' ? s.surfaces.filter(x => x.id !== id) : s.surfaces,
    obstacles: type === 'obstacle' ? s.obstacles.filter(x => x.id !== id) : s.obstacles,
    models: type === 'model' ? s.models.filter(x => x.id !== id) : s.models,
    sel: s.sel?.id === id ? null : s.sel,
  })),
}));
