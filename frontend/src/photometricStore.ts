import { create } from 'zustand';
import { Projector3DConfig, Surface3DConfig, SurfaceGeometryType } from './engine/photometrics';
import { SurfaceItem } from './modules/ContentPlanner';
import { RoomSurfaceType, SurfaceMaterial, DEFAULT_MATERIALS } from './engine/globalIllumination';

export interface ProjectorDistributionRow {
  code: string;
  name: string;
  rowName?: string;
  startX: number;
  endX: number;
  widthM: number;
  centerX: number;
  centerY?: number;
  throwDistM: number;
  throwRatio: number;
  overlapText: string;
}

export interface SurfacePhotometricEntry {
  surfaceId: string;
  surfaceName: string;
  surfaceType: string; // 'wall' | 'floor' | 'ceiling'
  widthM: number;
  heightM: number;
  projectorCount: number;
  avgLux: number;
  minLux: number;
  maxLux: number;
  uniformityU0: number;
  uniformityU1: number;
  luminanceNits: number;
  luminanceFL: number;
  screenGain: number;
  ambientLux: number;
  ambientContrastRatio: number;
  isManualLux: boolean;
  heatmapSnapshotUrl?: string;
  distributionRows: ProjectorDistributionRow[];
}

export interface PhotometricStoreState {
  // Seçili Proje Yüzeyi
  selectedSurfaceId: string; // 'custom' veya 'surf-1', 'surf-2', vb.
  
  // Yüzey Parametreleri
  screenW: number;
  screenH: number;
  geometry: SurfaceGeometryType;
  curveRadius: number;
  curveAngle: number;
  inclineAngle: number;
  screenGain: number;
  surfaceReflectance: number;
  ambientLux: number;

  // Grid Çözünürlüğü
  gridRes: '15x10' | '30x20' | '50x30' | '80x45';

  // Projektörler Listesi
  projectors: Projector3DConfig[];
  selectedProjId: string;
  defaultProjectorLumens: number;

  // Simülasyon Görünüm Ayarları
  blendOverlap: boolean;
  showHotDarkSpots: boolean;
  showIsoContours: boolean;
  showProjectorOutlines: boolean;
  viewMode: 'combined' | 'dominant' | string; // 'combined', 'dominant' veya seçili projektör ID'si ('proj-1', vb.)
  activeTab: 'heatmap' | '3d' | 'gi' | 'ansi9' | 'overlap' | 'scenarios' | 'guide';
  advancedMode: boolean;

  // Manuel Lux Girişi
  isManualLux: boolean;
  manualAvgLux: number;
  manualMinLux: number;
  manualMaxLux: number;

  // Global Illumination (GI) & Light Bounce Motoru Ayarları
  giBounceCount: number;
  giViewMode: 'total' | 'direct' | 'indirect' | 'reflectance';
  giResolution: 'coarse' | 'medium' | 'fine';
  selectedGISurfaceId: string;
  surfaceMaterials: Record<RoomSurfaceType, SurfaceMaterial>;

  // Rapora Dahil Edilecek Yüzey Lux Kayıtları Haritası
  surfacePhotometrics: Record<string, SurfacePhotometricEntry>;

  // Eylemler
  setScreenW: (w: number) => void;
  setScreenH: (h: number) => void;
  setGeometry: (g: SurfaceGeometryType) => void;
  setCurveRadius: (r: number) => void;
  setCurveAngle: (a: number) => void;
  setInclineAngle: (a: number) => void;
  setScreenGain: (g: number) => void;
  setSurfaceReflectance: (r: number) => void;
  setAmbientLux: (lux: number) => void;
  setGridRes: (res: '15x10' | '30x20' | '50x30' | '80x45') => void;
  setProjectors: (projs: Projector3DConfig[] | ((prev: Projector3DConfig[]) => Projector3DConfig[])) => void;
  setSelectedProjId: (id: string) => void;
  setDefaultProjectorLumens: (lm: number) => void;
  setBlendOverlap: (b: boolean) => void;
  setShowHotDarkSpots: (b: boolean) => void;
  setShowIsoContours: (b: boolean) => void;
  setShowProjectorOutlines: (b: boolean) => void;
  setViewMode: (vm: 'combined' | 'dominant' | string) => void;
  setActiveTab: (tab: 'heatmap' | '3d' | 'gi' | 'ansi9' | 'overlap' | 'scenarios' | 'guide') => void;
  setAdvancedMode: (b: boolean) => void;
  
  setIsManualLux: (b: boolean) => void;
  setManualAvgLux: (v: number) => void;
  setManualMinLux: (v: number) => void;
  setManualMaxLux: (v: number) => void;

  setGIBounceCount: (n: number) => void;
  setGIViewMode: (vm: 'total' | 'direct' | 'indirect' | 'reflectance') => void;
  setGIResolution: (res: 'coarse' | 'medium' | 'fine') => void;
  setSelectedGISurfaceId: (id: string) => void;
  setSurfaceMaterial: (type: RoomSurfaceType, mat: SurfaceMaterial) => void;

  saveSurfacePhotometric: (entry: SurfacePhotometricEntry) => void;

  // Projeden Yüzey ve Projektör Bilgilerini Aktarma Fonksiyonu
  importFromPlannerSurface: (surface: SurfaceItem, lumensOverride?: number) => void;
  updateSelectedProjector: (patch: Partial<Projector3DConfig>) => void;
  addProjector: () => void;
  removeProjector: (id: string) => void;
}

const DEFAULT_PROJECTORS: Projector3DConfig[] = [
  {
    id: 'proj-1',
    name: 'Projektör 1 (Sol/Ana)',
    model: '12K ANSI Laser',
    ansiLumens: 10000,
    efficiency: 0.90,
    pos: [-2.0, 2.0, 4.5],
    target: [-2.0, 2.0, 0],
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    throwRatio: 0.8,
    zoom: 1.0,
    lensModel: 'Ultra Short / Standart Lens',
    cornerUniformity: 0.85,
    photometricSource: 'ansi_cosine',
    enabled: true,
    color: '#38bdf8'
  },
  {
    id: 'proj-2',
    name: 'Projektör 2 (Sağ/Overlap)',
    model: '12K ANSI Laser',
    ansiLumens: 10000,
    efficiency: 0.90,
    pos: [2.0, 2.0, 4.5],
    target: [2.0, 2.0, 0],
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    throwRatio: 0.8,
    zoom: 1.0,
    lensModel: 'Ultra Short / Standart Lens',
    cornerUniformity: 0.85,
    photometricSource: 'ansi_cosine',
    enabled: true,
    color: '#a855f7'
  }
];

export const usePhotometricStore = create<PhotometricStoreState>((set, get) => ({
  selectedSurfaceId: 'custom',
  screenW: 0,
  screenH: 0,
  geometry: 'flat',
  curveRadius: 6.0,
  curveAngle: 90,
  inclineAngle: 0,
  screenGain: 1.0,
  surfaceReflectance: 0.85,
  ambientLux: 0,
  gridRes: '30x20',
  projectors: [],
  selectedProjId: '',
  defaultProjectorLumens: 0,
  blendOverlap: true,
  showHotDarkSpots: true,
  showIsoContours: false,
  showProjectorOutlines: true,
  viewMode: 'combined',
  activeTab: 'heatmap',
  advancedMode: true,

  isManualLux: false,
  manualAvgLux: 350,
  manualMinLux: 280,
  manualMaxLux: 420,
  surfacePhotometrics: {},

  // Global Illumination
  giBounceCount: 2,
  giViewMode: 'total',
  giResolution: 'medium',
  selectedGISurfaceId: 'room-front-wall',
  surfaceMaterials: {
    front_wall: DEFAULT_MATERIALS.matte_white,
    back_wall: DEFAULT_MATERIALS.dark_grey,
    left_wall: DEFAULT_MATERIALS.matte_white,
    right_wall: DEFAULT_MATERIALS.matte_white,
    floor: DEFAULT_MATERIALS.dark_grey,
    ceiling: DEFAULT_MATERIALS.black_velvet,
    curved_wall: DEFAULT_MATERIALS.matte_white,
    custom_surface: DEFAULT_MATERIALS.light_grey,
    column_obstacle: DEFAULT_MATERIALS.concrete,
  },

  setScreenW: (screenW) => set({ screenW }),
  setScreenH: (screenH) => set({ screenH }),
  setGeometry: (geometry) => set({ geometry }),
  setCurveRadius: (curveRadius) => set({ curveRadius }),
  setCurveAngle: (curveAngle) => set({ curveAngle }),
  setInclineAngle: (inclineAngle) => set({ inclineAngle }),
  setScreenGain: (screenGain) => set({ screenGain }),
  setSurfaceReflectance: (surfaceReflectance) => set({ surfaceReflectance }),
  setAmbientLux: (ambientLux) => set({ ambientLux }),
  setGridRes: (gridRes) => set({ gridRes }),
  setProjectors: (projs) => set((state) => ({
    projectors: typeof projs === 'function' ? projs(state.projectors) : projs
  })),
  setSelectedProjId: (selectedProjId) => set({ selectedProjId }),
  setDefaultProjectorLumens: (defaultProjectorLumens) => set({ defaultProjectorLumens }),
  setBlendOverlap: (blendOverlap) => set({ blendOverlap }),
  setShowHotDarkSpots: (showHotDarkSpots) => set({ showHotDarkSpots }),
  setShowIsoContours: (showIsoContours) => set({ showIsoContours }),
  setShowProjectorOutlines: (showProjectorOutlines) => set({ showProjectorOutlines }),
  setViewMode: (viewMode) => set({ viewMode }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setAdvancedMode: (advancedMode) => set({ advancedMode }),

  setIsManualLux: (isManualLux) => set({ isManualLux }),
  setManualAvgLux: (manualAvgLux) => set({ manualAvgLux }),
  setManualMinLux: (manualMinLux) => set({ manualMinLux }),
  setManualMaxLux: (manualMaxLux) => set({ manualMaxLux }),

  setGIBounceCount: (giBounceCount) => set({ giBounceCount }),
  setGIViewMode: (giViewMode) => set({ giViewMode }),
  setGIResolution: (giResolution) => set({ giResolution }),
  setSelectedGISurfaceId: (selectedGISurfaceId) => set({ selectedGISurfaceId }),
  setSurfaceMaterial: (type, mat) => set((state) => ({
    surfaceMaterials: {
      ...state.surfaceMaterials,
      [type]: mat
    }
  })),

  saveSurfacePhotometric: (entry: SurfacePhotometricEntry) => {
    set((state) => ({
      surfacePhotometrics: {
        ...state.surfacePhotometrics,
        [entry.surfaceId]: entry
      }
    }));
  },

  importFromPlannerSurface: (surface: SurfaceItem, lumensOverride?: number) => {
    const lm = lumensOverride || get().defaultProjectorLumens || 10000;
    const wM = surface.widthM || 8.0;
    const hM = surface.heightM || 4.0;
    const cols = Math.max(1, surface.cols || 1);
    const rows = Math.max(1, surface.rows || 1);
    const throwDist = surface.throwDistM || 4.5;
    const throwRatio = surface.throwRatio || 0.8;

    // Yüzey tipi eşleme
    let geom: SurfaceGeometryType = 'flat';
    if (surface.type === 'floor') {
      geom = 'floor';
    } else if (surface.type === 'ceiling') {
      geom = 'ceiling';
    } else if (surface.geometry === 'concave_arc' || surface.geometry === 'cylinder_360' || surface.geometry === 'dome' || surface.geometry === 'sphere') {
      geom = 'curved';
    }

    // Projektör dizilimini oluştur
    const newProjectors: Projector3DConfig[] = [];
    const colors = ['#38bdf8', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#14b8a6'];

    // Overlap oranına göre adım hesabı
    const ovRatioX = surface.overlapX ? surface.overlapX / 100 : 0.15;
    const ovRatioY = surface.overlapY ? surface.overlapY / 100 : 0.10;

    const halfW = wM / 2;
    const halfH = hM / 2;

    const singleW = cols > 1 
      ? Math.max(throwDist / Math.max(0.2, throwRatio), wM / Math.max(1, (cols - (cols - 1) * ovRatioX)))
      : Math.max(wM, throwDist / Math.max(0.2, throwRatio));
    const stepW = cols > 1 ? (wM - singleW) / (cols - 1) : 0;

    const singleH = rows > 1
      ? Math.max(singleW / 1.6, hM / Math.max(1, (rows - (rows - 1) * ovRatioY)))
      : Math.max(hM, singleW / 1.6);
    const stepH = rows > 1 ? (hM - singleH) / (rows - 1) : 0;

    let projCounter = 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `proj-surf-${surface.id}-${projCounter}`;
        const name = `${surface.name} - PJ ${projCounter} (${c + 1}.${r + 1})`;
        
        // Merkez koordinatları: Yüzeyin sol kenarından sağına (-halfW to +halfW) tam ortalanmış
        const posX = +(-halfW + c * stepW + singleW / 2).toFixed(2);
        
        let posY = +(r * stepH + singleH / 2).toFixed(2);
        let posZ = +throwDist.toFixed(2);
        let targetX = posX;
        let targetY = posY;
        let targetZ = 0;

        if (geom === 'floor') {
          // Zemin: X yatay (-halfW to +halfW), Z derinlik (-halfH to +halfH), Projektör tavanda (+throwDist)
          const localZ = +(-halfH + r * stepH + singleH / 2).toFixed(2);
          posY = +throwDist.toFixed(2);
          posZ = localZ;
          targetY = 0;
          targetZ = localZ;
        } else if (geom === 'ceiling') {
          const localZ = +(-halfH + r * stepH + singleH / 2).toFixed(2);
          posY = 0;
          posZ = localZ;
          targetY = hM;
          targetZ = localZ;
        }

        newProjectors.push({
          id,
          name,
          model: 'Proje Projektörü',
          ansiLumens: lm,
          efficiency: 0.90,
          pos: [posX, posY, posZ],
          target: [targetX, targetY, targetZ],
          yawDeg: 0,
          pitchDeg: 0,
          rollDeg: 0,
          throwRatio: throwRatio,
          zoom: 1.0,
          lensModel: `Lens TR ${throwRatio}:1`,
          cornerUniformity: 0.85,
          photometricSource: 'ansi_cosine',
          enabled: true,
          color: colors[(projCounter - 1) % colors.length]
        });
        projCounter++;
      }
    }

    set({
      selectedSurfaceId: surface.id,
      screenW: wM,
      screenH: hM,
      geometry: geom,
      curveRadius: surface.radiusM || 6.0,
      curveAngle: surface.angleDeg || 90,
      projectors: newProjectors,
      selectedProjId: newProjectors[0]?.id || 'proj-1'
    });
  },

  updateSelectedProjector: (patch: Partial<Projector3DConfig>) => {
    set((state) => ({
      projectors: state.projectors.map((p) =>
        p.id === state.selectedProjId ? { ...p, ...patch } : p
      )
    }));
  },

  addProjector: () => {
    const state = get();
    const newIdx = state.projectors.length + 1;
    const newId = `proj-${Date.now()}`;
    const colors = ['#38bdf8', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];
    const newProj: Projector3DConfig = {
      id: newId,
      name: `Projektör ${newIdx}`,
      model: '12K ANSI Laser',
      ansiLumens: state.defaultProjectorLumens || 10000,
      efficiency: 0.90,
      pos: [0, +(state.screenH / 2).toFixed(2), 4.5],
      target: [0, +(state.screenH / 2).toFixed(2), 0],
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      throwRatio: 0.8,
      zoom: 1.0,
      cornerUniformity: 0.85,
      photometricSource: 'ansi_cosine',
      enabled: true,
      color: colors[newIdx % colors.length]
    };
    set({
      projectors: [...state.projectors, newProj],
      selectedProjId: newId
    });
  },

  removeProjector: (id: string) => {
    const state = get();
    if (state.projectors.length <= 1) return;
    const filtered = state.projectors.filter((p) => p.id !== id);
    set({
      projectors: filtered,
      selectedProjId: state.selectedProjId === id ? filtered[0].id : state.selectedProjId
    });
  }
}));
