import { LensRecord } from './engine/lenses';

export interface ProjectorRecord {
  id: number; manufacturer: string; model: string;
  native_w?: number | null; native_h?: number | null; ansi_lumens?: number | null;
  lens_mount?: string | null; width_mm?: number | null; height_mm?: number | null; depth_mm?: number | null;
  aspect?: string | null; verified: boolean;
}
export interface CompatLens extends LensRecord { compat_verified: boolean; warnings: string[] }

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`API hatası ${r.status}: ${await r.text()}`);
  return r.json();
}
export interface EquipmentRecord {
  id?: number; category: string; manufacturer?: string | null; model: string;
  specs: Record<string, string | number>; url?: string | null; image_url?: string | null;
  notes?: string | null; compat: string[]; verified: boolean;
}
const jsonHeaders = { 'Content-Type': 'application/json' };
export const equipmentApi = {
  list: (category?: string) => fetch('/api/equipment' + (category ? `?category=${category}` : '')).then(r => j<EquipmentRecord[]>(r)),
  create: (e: EquipmentRecord) => fetch('/api/equipment', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(e) }).then(r => j<EquipmentRecord>(r)),
  update: (e: EquipmentRecord) => fetch(`/api/equipment/${e.id}`, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(e) }).then(r => j<EquipmentRecord>(r)),
  duplicate: (id: number) => fetch(`/api/equipment/${id}/duplicate`, { method: 'POST' }).then(r => j<EquipmentRecord>(r)),
  remove: (id: number) => fetch(`/api/equipment/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(`API hatası ${r.status}`); }),
};

export interface ProjectSummary {
  id: number; name: string; customer?: string | null; location?: string | null;
  description?: string | null; category?: string | null; project_date?: string | null;
  current_revision: number; archived: boolean;
  revisions: { revision_no: number; note?: string | null; created_at: string }[];
  data?: Record<string, unknown>;
}

export const projectApi = {
  list: (includeArchived = false) => fetch(`/api/projects?include_archived=${includeArchived}`).then(r => j<ProjectSummary[]>(r)),
  get: (id: number, revision?: number) => fetch(`/api/projects/${id}` + (revision ? `?revision=${revision}` : '')).then(r => j<ProjectSummary>(r)),
  create: (body: { name: string; customer?: string; location?: string; description?: string; category?: string; project_date?: string; data: unknown }) =>
    fetch('/api/projects', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }).then(r => j<ProjectSummary>(r)),
  newRevision: (id: number, data: unknown, note?: string) =>
    fetch(`/api/projects/${id}/revisions`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ data, note }) }).then(r => j<ProjectSummary>(r)),
  overwriteRevision: (id: number, revNo: number, data: unknown, note: string | undefined, confirm_overwrite: boolean) =>
    fetch(`/api/projects/${id}/revisions/${revNo}`, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ data, note, confirm_overwrite }) }).then(r => j<ProjectSummary>(r)),
  duplicate: (id: number) => fetch(`/api/projects/${id}/duplicate`, { method: 'POST' }).then(r => j<ProjectSummary>(r)),
  archive: (id: number, archived: boolean) => fetch(`/api/projects/${id}/archive?archived=${archived}`, { method: 'POST' }).then(r => j<ProjectSummary>(r)),
};

export const api = {
  projectors: () => fetch('/api/projectors').then(r => j<ProjectorRecord[]>(r)),
  lenses: () => fetch('/api/lenses').then(r => j<LensRecord[]>(r)),
  compatLenses: (pid: number) => fetch(`/api/projectors/${pid}/lenses`).then(r => j<CompatLens[]>(r)),
  importDb: (body: unknown) =>
    fetch('/api/database/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => j<{ projectors: number; lenses: number; skipped: number }>(r)),
};
