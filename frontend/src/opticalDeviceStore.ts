import { create } from 'zustand';
import {
  CameraDeviceProfile,
  CameraFovCalcResult,
  DEFAULT_CAMERA_PROFILES,
  DEFAULT_PROJECTOR_PROFILES,
  ProjectorDeviceProfile,
  ProjectorLensCalcResult,
  SAMPLE_WXGA_4000_DLP_PROJECTOR,
  SharedPlacementEvaluationResult,
} from './engine/opticalDeviceEngine';
import { CATALOG_LENSES, CATALOG_PROJECTORS, getCompatibleCatalogLenses } from './data/projectorCatalog';

const STORAGE_KEY = 'agy_optical_device_library_v1';
const REPORT_SNAP_KEY = 'agy_optical_studio_report_v1';

export interface CapturedReportView {
  id: string;
  angle: 'iso' | 'top' | 'bottom' | 'side' | 'left' | 'front' | 'custom';
  label: string;
  dataUrl: string;
  capturedAt: string;
}

export interface EnabledReportPaftas {
  iso3d: boolean;
  topPlan: boolean;
  bottomPlan: boolean;
  sideSection: boolean;
  frontElevation: boolean;
}

export interface OpticalStudioReportSnapshot {
  updatedAt: string;
  projectorProfile: ProjectorDeviceProfile;
  cameraProfile: CameraDeviceProfile;
  projectorCalc: ProjectorLensCalcResult;
  cameraCalc: CameraFovCalcResult;
  compliance: SharedPlacementEvaluationResult;
  room: {
    widthM: number;
    lengthM: number;
    heightM: number;
    surfaceWidthM: number;
    surfaceHeightM: number;
    surfaceBottomFromFloorM: number;
  };
  projectorPosM: [number, number, number];
  projectorAnglesDeg: [number, number, number];
  cameraPosM: [number, number, number];
  cameraAnglesDeg: [number, number, number];
  snapshot3dDataUrl?: string;
  capturedViews?: CapturedReportView[];
  enabledPaftas?: EnabledReportPaftas;
}

interface StoredLibraryData {
  projectors: ProjectorDeviceProfile[];
  cameras: CameraDeviceProfile[];
  activeProjectorId: string;
  activeCameraId: string;
}

function loadInitialLibrary(): StoredLibraryData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredLibraryData>;
      const projectors = Array.isArray(parsed.projectors) && parsed.projectors.length > 0
        ? parsed.projectors
        : DEFAULT_PROJECTOR_PROFILES;
      // Bölüm 8 örnek profilin her zaman kütüphanede bulunduğundan emin ol
      if (!projectors.some(p => p.id === SAMPLE_WXGA_4000_DLP_PROJECTOR.id)) {
        projectors.unshift(SAMPLE_WXGA_4000_DLP_PROJECTOR);
      }
      const cameras = Array.isArray(parsed.cameras) && parsed.cameras.length > 0
        ? parsed.cameras
        : DEFAULT_CAMERA_PROFILES;
      return {
        projectors,
        cameras,
        activeProjectorId: parsed.activeProjectorId || projectors[0].id,
        activeCameraId: parsed.activeCameraId || cameras[0].id,
      };
    }
  } catch {
    /* ignore storage error */
  }
  return {
    projectors: DEFAULT_PROJECTOR_PROFILES,
    cameras: DEFAULT_CAMERA_PROFILES,
    activeProjectorId: SAMPLE_WXGA_4000_DLP_PROJECTOR.id,
    activeCameraId: DEFAULT_CAMERA_PROFILES[0].id,
  };
}

function saveLibraryToStorage(data: StoredLibraryData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function loadInitialReportSnap(): OpticalStudioReportSnapshot | null {
  try {
    const raw = localStorage.getItem(REPORT_SNAP_KEY);
    return raw ? (JSON.parse(raw) as OpticalStudioReportSnapshot) : null;
  } catch {
    return null;
  }
}

export function createProjectorProfileFromCatalog(catalogProjId: string, catalogLensId?: string): ProjectorDeviceProfile | null {
  const cp = CATALOG_PROJECTORS.find(p => p.id === catalogProjId);
  if (!cp) return null;
  const compatLenses = getCompatibleCatalogLenses(cp);
  const cl = (catalogLensId && CATALOG_LENSES.find(l => l.id === catalogLensId)) || compatLenses[0] || null;
  const trMin = cl ? cl.throwMin : cp.builtInThrow?.min ?? null;
  const trMax = cl ? cl.throwMax : cp.builtInThrow?.max ?? null;
  const isTech3Lcd = cp.technology.toLowerCase().includes('3lcd');
  const isTechDlp = cp.technology.toLowerCase().includes('dlp');

  return {
    id: `cat-${cp.id}${cl ? `-${cl.id}` : ''}`,
    category: 'projector',
    brand: cp.manufacturer,
    model: cl ? `${cp.model} + ${cl.model}` : cp.model,
    manufacturer: cp.manufacturer,
    dataSource: 'MANUFACTURER_SPEC',
    catalogUrl: null,
    entryDate: new Date().toISOString().slice(0, 10),
    verificationStatus: 'MANUFACTURER_VERIFIED',
    notes: `${cp.notes ?? ''}${cl?.notes ? ` | Lens: ${cl.notes}` : ''}`.trim() || null,
    fieldSources: {
      brightnessAnsiLumens: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      throwRatio: { source: trMin !== null ? 'MANUFACTURER_SPEC' : 'UNKNOWN', confidence: trMin !== null ? 'HIGH' : 'UNKNOWN' },
      lensShift: { source: 'UNKNOWN', confidence: 'UNKNOWN', note: 'Katalog özet kaydında shift limiti belirtilmemiş' },
    },
    general: {
      displayTechnology: isTech3Lcd ? '3LCD' : isTechDlp ? 'DLP' : 'Other',
      chipConfiguration: cp.technology,
      lightSource: 'Laser',
      brightnessAnsiLumens: cp.ansiLumens,
      dynamicBrightnessLumens: null,
      nativeResolutionW: cp.nativeW,
      nativeResolutionH: cp.nativeH,
      nativeResolutionLabel: `${cp.nativeW} × ${cp.nativeH}`,
      maxResolutionW: null,
      maxResolutionH: null,
      maxRefreshRateHz: 60,
      maxResolutionLabel: null,
      nativeAspectRatio: cp.aspect,
      nativeContrastRatio: null,
      dynamicContrastRatio: null,
    },
    optics: {
      throwRatioMin: trMin,
      throwRatioMax: trMax,
      lensType: trMin !== null && trMax !== null ? (Math.abs(trMax - trMin) < 1e-4 ? 'fixed' : 'zoom') : null,
      fNumberMin: null,
      fNumberMax: null,
      focalLengthMinMm: null,
      focalLengthMaxMm: null,
      opticalZoomRatio: trMin && trMax && trMin > 0 ? +(trMax / trMin).toFixed(2) : null,
      lensShiftHorizontalMinPct: null,
      lensShiftHorizontalMaxPct: null,
      lensShiftVerticalMinPct: null,
      lensShiftVerticalMaxPct: null,
      lensShiftReference: 'UNSPECIFIED',
      lensOffsetPct: null,
      lensOffsetTolerancePct: null,
      offsetMeasurementConvention: 'UNSPECIFIED',
      lensDistortionPct: null,
      isInterchangeableLens: cp.lensMount !== 'Dahili',
      lensModel: cl ? `${cl.manufacturer} ${cl.model}` : cp.lensMount,
      lensCatalogRef: cl?.id ?? null,
    },
    geometry: {
      keystoneHorizontalDeg: 30,
      keystoneVerticalDeg: 30,
      imageOrientations: ['landscape', 'portrait', 'free_360'],
      supportedAspectRatios: [cp.aspect, '16:9', '16:10', '4:3'],
      supportedProjectionModes: ['front_desktop', 'front_ceiling', 'rear_desktop', 'rear_ceiling'],
    },
    electrical: {
      powerConsumptionW: null,
      voltageMinV: 100,
      voltageMaxV: 240,
      frequencyHz: '50/60 Hz',
      powerFactor: null,
      maxCurrentA: null,
      standbyPowerW: null,
    },
    mechanical: {
      widthMm: null,
      heightMm: null,
      depthMm: null,
      weightKg: null,
      lensCenterFromLeftMm: null,
      lensCenterFromBottomMm: null,
      lensCenterFromFrontMm: null,
      mountingPoint: cp.lensMount,
      mountingOrientation: 'Masaüstü / Tavan',
      coolingClearanceSideMm: null,
      coolingClearanceRearMm: null,
      coolingClearanceTopMm: null,
    },
  };
}

interface OpticalDeviceStoreState {
  projectors: ProjectorDeviceProfile[];
  cameras: CameraDeviceProfile[];
  activeProjectorId: string;
  activeCameraId: string;
  latestStudioReport: OpticalStudioReportSnapshot | null;

  setActiveProjectorId: (id: string) => void;
  setActiveCameraId: (id: string) => void;
  upsertProjectorProfile: (profile: ProjectorDeviceProfile) => void;
  upsertCameraProfile: (profile: CameraDeviceProfile) => void;
  duplicateProjectorProfile: (id: string) => ProjectorDeviceProfile | null;
  duplicateCameraProfile: (id: string) => CameraDeviceProfile | null;
  deleteProjectorProfile: (id: string) => void;
  deleteCameraProfile: (id: string) => void;
  importFromCatalog: (catalogProjId: string, catalogLensId?: string) => ProjectorDeviceProfile | null;
  exportLibraryJson: () => string;
  importLibraryJson: (jsonText: string) => { addedProjectors: number; addedCameras: number };
  setLatestStudioReport: (snap: OpticalStudioReportSnapshot) => void;
}

const init = loadInitialLibrary();

export const useOpticalDeviceStore = create<OpticalDeviceStoreState>((set, get) => ({
  projectors: init.projectors,
  cameras: init.cameras,
  activeProjectorId: init.activeProjectorId,
  activeCameraId: init.activeCameraId,
  latestStudioReport: loadInitialReportSnap(),

  setActiveProjectorId: id => {
    set(s => {
      const next = { ...s, activeProjectorId: id };
      saveLibraryToStorage(next);
      return { activeProjectorId: id };
    });
  },

  setActiveCameraId: id => {
    set(s => {
      const next = { ...s, activeCameraId: id };
      saveLibraryToStorage(next);
      return { activeCameraId: id };
    });
  },

  upsertProjectorProfile: profile => {
    set(s => {
      const exists = s.projectors.some(p => p.id === profile.id);
      const projectors = exists
        ? s.projectors.map(p => (p.id === profile.id ? profile : p))
        : [profile, ...s.projectors];
      const next = {
        projectors,
        cameras: s.cameras,
        activeProjectorId: profile.id,
        activeCameraId: s.activeCameraId,
      };
      saveLibraryToStorage(next);
      return { projectors, activeProjectorId: profile.id };
    });
  },

  upsertCameraProfile: profile => {
    set(s => {
      const exists = s.cameras.some(c => c.id === profile.id);
      const cameras = exists
        ? s.cameras.map(c => (c.id === profile.id ? profile : c))
        : [profile, ...s.cameras];
      const next = {
        projectors: s.projectors,
        cameras,
        activeProjectorId: s.activeProjectorId,
        activeCameraId: profile.id,
      };
      saveLibraryToStorage(next);
      return { cameras, activeCameraId: profile.id };
    });
  },

  duplicateProjectorProfile: id => {
    const s = get();
    const src = s.projectors.find(p => p.id === id);
    if (!src) return null;
    const copy: ProjectorDeviceProfile = {
      ...structuredClone(src),
      id: `pj-${Date.now().toString(36)}`,
      model: `${src.model} (Kopya)`,
      dataSource: 'USER_ENTERED',
      verificationStatus: 'USER_DEFINED',
      entryDate: new Date().toISOString().slice(0, 10),
    };
    s.upsertProjectorProfile(copy);
    return copy;
  },

  duplicateCameraProfile: id => {
    const s = get();
    const src = s.cameras.find(c => c.id === id);
    if (!src) return null;
    const copy: CameraDeviceProfile = {
      ...structuredClone(src),
      id: `cam-${Date.now().toString(36)}`,
      model: `${src.model} (Kopya)`,
      dataSource: 'USER_ENTERED',
      verificationStatus: 'USER_DEFINED',
      entryDate: new Date().toISOString().slice(0, 10),
    };
    s.upsertCameraProfile(copy);
    return copy;
  },

  deleteProjectorProfile: id => {
    set(s => {
      if (s.projectors.length <= 1) return s;
      const projectors = s.projectors.filter(p => p.id !== id);
      const activeProjectorId = s.activeProjectorId === id ? projectors[0].id : s.activeProjectorId;
      saveLibraryToStorage({ projectors, cameras: s.cameras, activeProjectorId, activeCameraId: s.activeCameraId });
      return { projectors, activeProjectorId };
    });
  },

  deleteCameraProfile: id => {
    set(s => {
      if (s.cameras.length <= 1) return s;
      const cameras = s.cameras.filter(c => c.id !== id);
      const activeCameraId = s.activeCameraId === id ? cameras[0].id : s.activeCameraId;
      saveLibraryToStorage({ projectors: s.projectors, cameras, activeProjectorId: s.activeProjectorId, activeCameraId });
      return { cameras, activeCameraId };
    });
  },

  importFromCatalog: (catalogProjId, catalogLensId) => {
    const profile = createProjectorProfileFromCatalog(catalogProjId, catalogLensId);
    if (!profile) return null;
    get().upsertProjectorProfile(profile);
    return profile;
  },

  exportLibraryJson: () => {
    const s = get();
    return JSON.stringify(
      {
        schemaVersion: '1.0',
        exportedAt: new Date().toISOString(),
        projectors: s.projectors,
        cameras: s.cameras,
      },
      null,
      2
    );
  },

  importLibraryJson: jsonText => {
    const parsed = JSON.parse(jsonText);
    let addedProjectors = 0;
    let addedCameras = 0;
    const s = get();
    const nextProjectors = [...s.projectors];
    const nextCameras = [...s.cameras];

    const incomingProjectors: ProjectorDeviceProfile[] = Array.isArray(parsed.projectors)
      ? parsed.projectors
      : parsed.category === 'projector'
      ? [parsed]
      : [];
    const incomingCameras: CameraDeviceProfile[] = Array.isArray(parsed.cameras)
      ? parsed.cameras
      : parsed.category === 'camera'
      ? [parsed]
      : [];

    for (const pj of incomingProjectors) {
      if (!pj || !pj.model) continue;
      const id = pj.id || `pj-imp-${Date.now().toString(36)}-${addedProjectors}`;
      const idx = nextProjectors.findIndex(x => x.id === id);
      if (idx >= 0) nextProjectors[idx] = { ...pj, id };
      else nextProjectors.unshift({ ...pj, id });
      addedProjectors++;
    }

    for (const cam of incomingCameras) {
      if (!cam || !cam.model) continue;
      const id = cam.id || `cam-imp-${Date.now().toString(36)}-${addedCameras}`;
      const idx = nextCameras.findIndex(x => x.id === id);
      if (idx >= 0) nextCameras[idx] = { ...cam, id };
      else nextCameras.unshift({ ...cam, id });
      addedCameras++;
    }

    saveLibraryToStorage({
      projectors: nextProjectors,
      cameras: nextCameras,
      activeProjectorId: s.activeProjectorId,
      activeCameraId: s.activeCameraId,
    });
    set({ projectors: nextProjectors, cameras: nextCameras });
    return { addedProjectors, addedCameras };
  },

  setLatestStudioReport: snap => {
    try {
      localStorage.setItem(REPORT_SNAP_KEY, JSON.stringify(snap));
      window.dispatchEvent(new CustomEvent('agy:optical-studio-updated', { detail: snap }));
    } catch {
      /* ignore */
    }
    set({ latestStudioReport: snap });
  },
}));
