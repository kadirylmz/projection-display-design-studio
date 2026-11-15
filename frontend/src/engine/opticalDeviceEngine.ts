/**
 * PROFESYONEL OPTİK CİHAZ PROFİLİ, FOV KAMERA VE PROJEKSİYON LENS HESAPLAMA MOTORU
 * ---------------------------------------------------------------------------------
 * Kurallar:
 * 1. Bilinmeyen (eksik) değerler asla 0 kabul edilmez; null / UNKNOWN olarak saklanır ve raporlanır.
 * 2. F-number ve Focal Length değerleri, sensör/imager boyutu olmadan Throw Ratio yerine kullanılmaz.
 * 3. Optik Offset, Optik Lens Shift ve Dijital Keystone birbirinden tamamen ayrı hesaplanır.
 *    Offset referans konvansiyonu belirtilmemişse (UNSPECIFIED / null) kesin dikey yerleşim üretilmez (UNKNOWN).
 * 4. Kamera FOV hesabında sensör boyutu bilinmiyorsa tahmin edilmez; UNKNOWN döner.
 *    Optik zoom ile dijital zoom, ideal rectilinear FOV ile distorsiyonlu FOV ayrı hesaplanır.
 * 5. Fiziksel uygunluk kontrolleri PASS / WARNING / FAIL / UNKNOWN üretir; eksik veriyle PASS verilmez.
 */

import { round, LengthUnit, toMeters, fromMeters } from './units';

export type { LengthUnit };

export function convertToMeters(val: number, unit: LengthUnit): number {
  return toMeters(val, unit);
}

export function convertFromMeters(meters: number, unit: LengthUnit): number {
  return fromMeters(meters, unit);
}

export function formatLengthWithUnit(meters: number | null | undefined, unit: LengthUnit = 'm', digits = 3): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return 'UNKNOWN';
  return `${round(fromMeters(meters, unit), digits).toFixed(digits)} ${unit}`;
}

export type ParameterSourceType =
  | 'MANUFACTURER_SPEC'
  | 'USER_ENTERED'
  | 'FIELD_MEASURED'
  | 'ESTIMATED'
  | 'UNKNOWN';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type ComplianceStatus = 'PASS' | 'WARNING' | 'FAIL' | 'UNKNOWN';

export type OffsetReferenceConvention =
  | 'FULL_HEIGHT_FROM_BOTTOM' // %100 = görüntü alt kenarı lens ekseninde; >%100 (örn. %112) = görüntü tamamen eksen üstünde (+%12 boşluk)
  | 'HALF_HEIGHT_FROM_CENTER' // %0 = görüntü merkezi lens ekseninde; %100 = yarı yükseklik kadar kayma
  | 'LENS_TO_BOTTOM_PCT'      // Lens ekseninden görüntü üst/alt kenarına oran
  | 'UNSPECIFIED';

export interface ParameterProvenance {
  source: ParameterSourceType;
  confidence: ConfidenceLevel;
  note?: string;
  updatedAt?: string;
}

export interface DeviceProfileBase {
  id: string;
  category: 'projector' | 'camera';
  brand: string;
  model: string;
  manufacturer: string;
  dataSource: ParameterSourceType;
  catalogUrl: string | null;
  entryDate: string;
  verificationStatus: 'MANUFACTURER_VERIFIED' | 'USER_DEFINED' | 'FIELD_VERIFIED' | 'UNVERIFIED';
  notes: string | null;
  fieldSources: Record<string, ParameterProvenance>;
}

export interface ProjectorDeviceProfile extends DeviceProfileBase {
  category: 'projector';
  general: {
    displayTechnology: 'DLP' | '3LCD' | 'LCoS' | 'SXRD' | 'Other' | null;
    chipConfiguration: string | null;
    lightSource: 'Laser' | 'Laser Phosphor' | 'RGB Laser' | 'LED' | 'Lamp' | null;
    brightnessAnsiLumens: number | null;
    dynamicBrightnessLumens: number | null;
    nativeResolutionW: number | null;
    nativeResolutionH: number | null;
    nativeResolutionLabel: string | null;
    maxResolutionW: number | null;
    maxResolutionH: number | null;
    maxRefreshRateHz: number | null;
    maxResolutionLabel: string | null;
    nativeAspectRatio: string | null;
    nativeContrastRatio: number | null;
    dynamicContrastRatio: number | null;
  };
  optics: {
    throwRatioMin: number | null;
    throwRatioMax: number | null;
    lensType: 'fixed' | 'zoom' | 'ust' | null;
    fNumberMin: number | null;
    fNumberMax: number | null;
    focalLengthMinMm: number | null;
    focalLengthMaxMm: number | null;
    opticalZoomRatio: number | null;
    lensShiftHorizontalMinPct: number | null;
    lensShiftHorizontalMaxPct: number | null;
    lensShiftVerticalMinPct: number | null;
    lensShiftVerticalMaxPct: number | null;
    lensShiftReference: 'FULL_DIMENSION' | 'HALF_DIMENSION' | 'UNSPECIFIED' | null;
    lensOffsetPct: number | null;
    lensOffsetTolerancePct: number | null;
    offsetMeasurementConvention: OffsetReferenceConvention | null;
    lensDistortionPct: number | null;
    isInterchangeableLens: boolean | null;
    lensModel: string | null;
    lensCatalogRef: string | null;
  };
  geometry: {
    keystoneHorizontalDeg: number | null;
    keystoneVerticalDeg: number | null;
    imageOrientations: ('landscape' | 'portrait' | 'free_360')[];
    supportedAspectRatios: string[];
    supportedProjectionModes: ('front_desktop' | 'front_ceiling' | 'rear_desktop' | 'rear_ceiling')[];
  };
  electrical: {
    powerConsumptionW: number | null;
    ecoPowerConsumptionW?: number | null;
    voltageMinV: number | null;
    voltageMaxV: number | null;
    frequencyHz: string | null;
    powerFactor: number | null;
    maxCurrentA: number | null;
    standbyPowerW: number | null;
  };
  mechanical: {
    widthMm: number | null;
    heightMm: number | null;
    depthMm: number | null;
    weightKg: number | null;
    lensCenterFromLeftMm: number | null;
    lensCenterFromBottomMm: number | null;
    lensCenterFromFrontMm: number | null;
    mountingPoint: string | null;
    mountingOrientation: string | null;
    coolingClearanceSideMm: number | null;
    coolingClearanceRearMm: number | null;
    coolingClearanceTopMm: number | null;
  };
}

export interface CameraDeviceProfile extends DeviceProfileBase {
  category: 'camera';
  sensor: {
    sensorType: string | null;
    sensorWidthMm: number | null;
    sensorHeightMm: number | null;
    sensorResolutionMp: number | null;
    nativeResolutionW: number | null;
    nativeResolutionH: number | null;
    cropFactor: number | null;
    sensorCropMode: number | null;
    aspectRatio: string | null;
    pixelPitchUm: number | null;
  };
  lens: {
    lensBrandModel: string | null;
    focalLengthMm: number | null;
    focalLengthMinMm: number | null;
    focalLengthMaxMm: number | null;
    lensPrimeOrZoom: 'prime' | 'zoom' | null;
    apertureFNumberMin: number | null;
    apertureFNumberMax: number | null;
    lensDistortionPct: number | null;
    manufacturerHfovDeg: number | null;
    manufacturerVfovDeg: number | null;
    focusDistanceM: number | null;
    minFocusDistanceM: number | null;
    digitalZoomFactor: number | null;
  };
  mechanical: {
    widthMm: number | null;
    heightMm: number | null;
    depthMm: number | null;
    weightKg: number | null;
    mountingPoint: string | null;
  };
}

export type AnyOpticalDeviceProfile = ProjectorDeviceProfile | CameraDeviceProfile;

/**
 * Bölüm 8 — Test & Doğrulama İçin Zorunlu Örnek Projektör Profili
 * ÖNEMLİ KURAL: Üretici kataloğuyla doğrulanmış gibi gösterilmez; kaynağı USER_ENTERED olarak işaretlidir.
 */
export const SAMPLE_WXGA_4000_DLP_PROJECTOR: ProjectorDeviceProfile = {
  id: 'sample-wxga-4000-dlp-laser',
  category: 'projector',
  brand: 'Örnek DLP Projektör',
  model: 'WXGA-4000L (1.54–1.72:1)',
  manufacturer: 'Single chip DLP Technology by Texas Instruments (Kullanıcı Girişi)',
  dataSource: 'USER_ENTERED',
  catalogUrl: null,
  entryDate: '2026-11-15',
  verificationStatus: 'USER_DEFINED',
  notes: 'Bölüm 8 mühendislik doğrulama profili. Üretici kataloğu ile doğrulanmamıştır; manuel kullanıcı girişi (USER_ENTERED) olarak işaretlenmiştir.',
  fieldSources: {
    brightnessAnsiLumens: { source: 'USER_ENTERED', confidence: 'MEDIUM', note: '4000 ANSI Lumens' },
    throwRatio: { source: 'USER_ENTERED', confidence: 'MEDIUM', note: '1.54–1.72:1' },
    focalLength: { source: 'USER_ENTERED', confidence: 'MEDIUM', note: '21.85–24.00 mm' },
    fNumber: { source: 'USER_ENTERED', confidence: 'MEDIUM', note: '2.41–2.53' },
    zoomRatio: { source: 'USER_ENTERED', confidence: 'MEDIUM', note: '1.1x' },
    lensOffsetPct: { source: 'USER_ENTERED', confidence: 'MEDIUM', note: '112% ±5% (Full Height)' },
    nativeContrastRatio: { source: 'UNKNOWN', confidence: 'UNKNOWN', note: 'Yalnızca 3,000,000:1 Dynamic Contrast girilmiş; Native Contrast UNKNOWN' },
    lensShift: { source: 'UNKNOWN', confidence: 'UNKNOWN', note: 'Optik lens shift verisi girilmedi (UNKNOWN)' },
  },
  general: {
    displayTechnology: 'DLP',
    chipConfiguration: 'Single chip DLP Technology by Texas Instruments',
    lightSource: 'Laser Phosphor',
    brightnessAnsiLumens: 4000,
    dynamicBrightnessLumens: null,
    nativeResolutionW: 1280,
    nativeResolutionH: 800,
    nativeResolutionLabel: 'WXGA (1280 x 800)',
    maxResolutionW: 1920,
    maxResolutionH: 1200,
    maxRefreshRateHz: 60,
    maxResolutionLabel: 'WUXGA (1920 x 1200) @60Hz',
    nativeAspectRatio: '16:10',
    nativeContrastRatio: null, // Native contrast bilinmiyor, sadece Dynamic 3,000,000:1 biliniyor!
    dynamicContrastRatio: 3000000,
  },
  optics: {
    throwRatioMin: 1.54,
    throwRatioMax: 1.72,
    lensType: 'zoom',
    fNumberMin: 2.41,
    fNumberMax: 2.53,
    focalLengthMinMm: 21.85,
    focalLengthMaxMm: 24.0,
    opticalZoomRatio: 1.1,
    lensShiftHorizontalMinPct: null,
    lensShiftHorizontalMaxPct: null,
    lensShiftVerticalMinPct: null,
    lensShiftVerticalMaxPct: null,
    lensShiftReference: 'UNSPECIFIED',
    lensOffsetPct: 112,
    lensOffsetTolerancePct: 5,
    offsetMeasurementConvention: 'FULL_HEIGHT_FROM_BOTTOM',
    lensDistortionPct: null,
    isInterchangeableLens: false,
    lensModel: 'Dahili 1.1x Zoom Lens (21.85–24.00 mm, F/2.41–2.53)',
    lensCatalogRef: null,
  },
  geometry: {
    keystoneHorizontalDeg: 30,
    keystoneVerticalDeg: 30,
    imageOrientations: ['landscape', 'portrait', 'free_360'],
    supportedAspectRatios: ['16:10', '16:9', '4:3'],
    supportedProjectionModes: ['front_desktop', 'front_ceiling', 'rear_desktop', 'rear_ceiling'],
  },
  electrical: {
    powerConsumptionW: 180,
    voltageMinV: 100,
    voltageMaxV: 240,
    frequencyHz: '50/60 Hz',
    powerFactor: null,
    maxCurrentA: null,
    standbyPowerW: 0.5,
  },
  mechanical: {
    widthMm: 278,
    heightMm: 115.5,
    depthMm: 216,
    weightKg: 2.8,
    lensCenterFromLeftMm: 139,
    lensCenterFromBottomMm: 65,
    lensCenterFromFrontMm: 12,
    mountingPoint: '3× M4 Tavan Askı Bağlantısı',
    mountingOrientation: 'Masaüstü / Tavan (360° Lazer)',
    coolingClearanceSideMm: 300,
    coolingClearanceRearMm: 300,
    coolingClearanceTopMm: 200,
  },
};

export const DEFAULT_PROJECTOR_PROFILES: ProjectorDeviceProfile[] = [
  SAMPLE_WXGA_4000_DLP_PROJECTOR,
  {
    id: 'epson-eb-pu2010b-std',
    category: 'projector',
    brand: 'Epson',
    model: 'EB-PU2010B + ELPLM15',
    manufacturer: 'Seiko Epson Corp.',
    dataSource: 'MANUFACTURER_SPEC',
    catalogUrl: 'https://www.epson.eu/products/projectors/installation/eb-pu2010b',
    entryDate: '2026-11-15',
    verificationStatus: 'MANUFACTURER_VERIFIED',
    notes: '10.000 ANSI lm 3LCD WUXGA kurulum projektörü, ELPLM15 orta zoom lens ile.',
    fieldSources: {
      brightnessAnsiLumens: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      throwRatio: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      lensShift: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
    },
    general: {
      displayTechnology: '3LCD',
      chipConfiguration: '3× 0.76" LCD with MLA',
      lightSource: 'Laser',
      brightnessAnsiLumens: 10000,
      dynamicBrightnessLumens: 10000,
      nativeResolutionW: 1920,
      nativeResolutionH: 1200,
      nativeResolutionLabel: 'WUXGA (1920 x 1200)',
      maxResolutionW: 3840,
      maxResolutionH: 2160,
      maxRefreshRateHz: 60,
      maxResolutionLabel: '4K Enhancement (3840 x 2160) @60Hz',
      nativeAspectRatio: '16:10',
      nativeContrastRatio: 2000,
      dynamicContrastRatio: 2500000,
    },
    optics: {
      throwRatioMin: 1.57,
      throwRatioMax: 2.56,
      lensType: 'zoom',
      fNumberMin: 1.8,
      fNumberMax: 2.3,
      focalLengthMinMm: 36.0,
      focalLengthMaxMm: 57.4,
      opticalZoomRatio: 1.6,
      lensShiftHorizontalMinPct: -18,
      lensShiftHorizontalMaxPct: 18,
      lensShiftVerticalMinPct: -60,
      lensShiftVerticalMaxPct: 60,
      lensShiftReference: 'FULL_DIMENSION',
      lensOffsetPct: 0,
      lensOffsetTolerancePct: 2,
      offsetMeasurementConvention: 'HALF_HEIGHT_FROM_CENTER',
      lensDistortionPct: 0.8,
      isInterchangeableLens: true,
      lensModel: 'Epson ELPLM15 (1.57–2.56:1)',
      lensCatalogRef: 'V12H004M0F',
    },
    geometry: {
      keystoneHorizontalDeg: 30,
      keystoneVerticalDeg: 45,
      imageOrientations: ['landscape', 'portrait', 'free_360'],
      supportedAspectRatios: ['16:10', '16:9', '4:3', '21:9'],
      supportedProjectionModes: ['front_desktop', 'front_ceiling', 'rear_desktop', 'rear_ceiling'],
    },
    electrical: {
      powerConsumptionW: 535,
      voltageMinV: 100,
      voltageMaxV: 240,
      frequencyHz: '50/60 Hz',
      powerFactor: 0.95,
      maxCurrentA: 5.6,
      standbyPowerW: 0.5,
    },
    mechanical: {
      widthMm: 545,
      heightMm: 189,
      depthMm: 436,
      weightKg: 16.8,
      lensCenterFromLeftMm: 272.5,
      lensCenterFromBottomMm: 95,
      lensCenterFromFrontMm: 45,
      mountingPoint: '4× M6 Rigging / Tavan Askı',
      mountingOrientation: '360° Serbest Montaj',
      coolingClearanceSideMm: 500,
      coolingClearanceRearMm: 500,
      coolingClearanceTopMm: 300,
    },
  },
  {
    id: 'vivitek-du4381z-st',
    category: 'projector',
    brand: 'Vivitek',
    model: 'DU4381Z-ST',
    manufacturer: 'Vivitek / Delta Electronics',
    dataSource: 'MANUFACTURER_SPEC',
    catalogUrl: 'https://www.vivitek.eu/products/short-throw-projectors/du4381z-st',
    entryDate: '2026-11-15',
    verificationStatus: 'MANUFACTURER_VERIFIED',
    notes: '6.100 ANSI lm WUXGA 1-Chip DLP lazer projektör, 0.50:1 sabit kısa atım lens (Fixed lens, no zoom, 530W normal / 380W eco).',
    fieldSources: {
      brightnessAnsiLumens: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      powerConsumptionW: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      dynamicContrastRatio: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      throwRatio: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
    },
    general: {
      displayTechnology: 'DLP',
      chipConfiguration: '1× 0.67" WUXGA DMD',
      lightSource: 'Laser Phosphor',
      brightnessAnsiLumens: 6100,
      dynamicBrightnessLumens: 6100,
      nativeResolutionW: 1920,
      nativeResolutionH: 1200,
      nativeResolutionLabel: 'WUXGA (1920 x 1200)',
      maxResolutionW: 1920,
      maxResolutionH: 1200,
      maxRefreshRateHz: 60,
      maxResolutionLabel: 'WUXGA',
      nativeAspectRatio: '16:10',
      nativeContrastRatio: null, // UNKNOWN — Üretici yalnızca Full On/Off dinamik kontrast belirtir
      dynamicContrastRatio: 3000000,
    },
    optics: {
      throwRatioMin: 0.50,
      throwRatioMax: 0.50,
      lensType: 'fixed',
      fNumberMin: 2.0,
      fNumberMax: 2.0,
      focalLengthMinMm: 7.2,
      focalLengthMaxMm: 7.2,
      opticalZoomRatio: 1.0,
      lensShiftHorizontalMinPct: 0,
      lensShiftHorizontalMaxPct: 0,
      lensShiftVerticalMinPct: 0,
      lensShiftVerticalMaxPct: 0,
      lensShiftReference: 'FULL_DIMENSION',
      lensOffsetPct: 115,
      lensOffsetTolerancePct: 5,
      offsetMeasurementConvention: 'HALF_HEIGHT_FROM_CENTER',
      lensDistortionPct: 0.5,
      isInterchangeableLens: false,
      lensModel: 'Dahili 0.50:1 Sabit Kısa Atım Lens (Fixed)',
      lensCatalogRef: 'BUILTIN-ST-0.50',
    },
    geometry: {
      keystoneHorizontalDeg: 30,
      keystoneVerticalDeg: 30,
      imageOrientations: ['landscape', 'portrait', 'free_360'],
      supportedAspectRatios: ['16:10', '16:9', '4:3'],
      supportedProjectionModes: ['front_desktop', 'front_ceiling', 'rear_desktop', 'rear_ceiling'],
    },
    electrical: {
      powerConsumptionW: 530,
      ecoPowerConsumptionW: 380,
      voltageMinV: 100,
      voltageMaxV: 240,
      frequencyHz: '50/60 Hz',
      powerFactor: 1.0,
      maxCurrentA: 2.5,
      standbyPowerW: 0.5,
    },
    mechanical: {
      widthMm: 395,
      heightMm: 136,
      depthMm: 343,
      weightKg: 7.0,
      lensCenterFromLeftMm: 197.5,
      lensCenterFromBottomMm: 68,
      lensCenterFromFrontMm: 30,
      mountingPoint: '3× M4 Tavan Askı',
      mountingOrientation: '360° Serbest Montaj',
      coolingClearanceSideMm: 300,
      coolingClearanceRearMm: 300,
      coolingClearanceTopMm: 200,
    },
  },
  {
    id: 'vivitek-du9800z-d98-0810',
    category: 'projector',
    brand: 'Vivitek',
    model: 'DU9800Z + D98-0810',
    manufacturer: 'Vivitek / Delta Electronics',
    dataSource: 'MANUFACTURER_SPEC',
    catalogUrl: 'https://www.vivitek.eu/products/large-venue-projectors/du9800z',
    entryDate: '2026-11-15',
    verificationStatus: 'MANUFACTURER_VERIFIED',
    notes: '18.000 ANSI lm WUXGA 1-Chip DLP büyük mekan lazer projektörü, D98-0810 kısa zoom lens ile.',
    fieldSources: {
      brightnessAnsiLumens: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      powerConsumptionW: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      nativeContrastRatio: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      dynamicContrastRatio: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      throwRatio: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
    },
    general: {
      displayTechnology: 'DLP',
      chipConfiguration: '1× 0.96" WUXGA DMD',
      lightSource: 'Laser Phosphor',
      brightnessAnsiLumens: 18000,
      dynamicBrightnessLumens: 18000,
      nativeResolutionW: 1920,
      nativeResolutionH: 1200,
      nativeResolutionLabel: 'WUXGA (1920 x 1200)',
      maxResolutionW: 3840,
      maxResolutionH: 2160,
      maxRefreshRateHz: 60,
      maxResolutionLabel: '4K UHD Downscaled',
      nativeAspectRatio: '16:10',
      nativeContrastRatio: 1250,
      dynamicContrastRatio: 10000,
    },
    optics: {
      throwRatioMin: 0.84,
      throwRatioMax: 1.03,
      lensType: 'zoom',
      fNumberMin: 1.85,
      fNumberMax: 2.1,
      focalLengthMinMm: 21.8,
      focalLengthMaxMm: 26.7,
      opticalZoomRatio: 1.22,
      lensShiftHorizontalMinPct: -15,
      lensShiftHorizontalMaxPct: 15,
      lensShiftVerticalMinPct: -50,
      lensShiftVerticalMaxPct: 50,
      lensShiftReference: 'FULL_DIMENSION',
      lensOffsetPct: 0,
      lensOffsetTolerancePct: 2,
      offsetMeasurementConvention: 'HALF_HEIGHT_FROM_CENTER',
      lensDistortionPct: 1.0,
      isInterchangeableLens: true,
      lensModel: 'Vivitek D98-0810 (0.84–1.03:1)',
      lensCatalogRef: 'D98-0810',
    },
    geometry: {
      keystoneHorizontalDeg: 30,
      keystoneVerticalDeg: 40,
      imageOrientations: ['landscape', 'portrait', 'free_360'],
      supportedAspectRatios: ['16:10', '16:9', '4:3'],
      supportedProjectionModes: ['front_desktop', 'front_ceiling', 'rear_desktop', 'rear_ceiling'],
    },
    electrical: {
      powerConsumptionW: 1900,
      voltageMinV: 100,
      voltageMaxV: 240,
      frequencyHz: '50/60 Hz',
      powerFactor: 0.98,
      maxCurrentA: 9.5,
      standbyPowerW: 0.5,
    },
    mechanical: {
      widthMm: 530,
      heightMm: 248,
      depthMm: 645,
      weightKg: 46.5,
      lensCenterFromLeftMm: 265,
      lensCenterFromBottomMm: 124,
      lensCenterFromFrontMm: 80,
      mountingPoint: '6× M8 Ağır Yük Askı Bağlantısı',
      mountingOrientation: '360° Serbest Kurulum',
      coolingClearanceSideMm: 600,
      coolingClearanceRearMm: 600,
      coolingClearanceTopMm: 400,
    },
  },
  {
    id: 'panasonic-pt-rz990-dle060',
    category: 'projector',
    brand: 'Panasonic',
    model: 'PT-RZ990 + ET-DLE060',
    manufacturer: 'Panasonic Connect Co., Ltd.',
    dataSource: 'MANUFACTURER_SPEC',
    catalogUrl: 'https://panasonic.net/cns/projector/products/rz990/',
    entryDate: '2026-11-15',
    verificationStatus: 'MANUFACTURER_VERIFIED',
    notes: '7.000 ANSI lm WUXGA 1-Chip DLP Solid Shine lazer projektör, ET-DLE060 kısa zoom lens ile.',
    fieldSources: {
      brightnessAnsiLumens: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      powerConsumptionW: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      nativeContrastRatio: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      throwRatio: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
    },
    general: {
      displayTechnology: 'DLP',
      chipConfiguration: '1× 0.67" WUXGA DMD',
      lightSource: 'Laser',
      brightnessAnsiLumens: 7000,
      dynamicBrightnessLumens: 7000,
      nativeResolutionW: 1920,
      nativeResolutionH: 1200,
      nativeResolutionLabel: 'WUXGA (1920 x 1200)',
      maxResolutionW: 3840,
      maxResolutionH: 2160,
      maxRefreshRateHz: 60,
      maxResolutionLabel: '4K Signal Input Supported',
      nativeAspectRatio: '16:10',
      nativeContrastRatio: 10000,
      dynamicContrastRatio: 10000,
    },
    optics: {
      throwRatioMin: 0.600,
      throwRatioMax: 0.801,
      lensType: 'zoom',
      fNumberMin: 1.9,
      fNumberMax: 2.1,
      focalLengthMinMm: 10.4,
      focalLengthMaxMm: 13.8,
      opticalZoomRatio: 1.33,
      lensShiftHorizontalMinPct: -16,
      lensShiftHorizontalMaxPct: 16,
      lensShiftVerticalMinPct: -50,
      lensShiftVerticalMaxPct: 50,
      lensShiftReference: 'FULL_DIMENSION',
      lensOffsetPct: 0,
      lensOffsetTolerancePct: 2,
      offsetMeasurementConvention: 'HALF_HEIGHT_FROM_CENTER',
      lensDistortionPct: 1.2,
      isInterchangeableLens: true,
      lensModel: 'Panasonic ET-DLE060 (0.600–0.801:1)',
      lensCatalogRef: 'ET-DLE060',
    },
    geometry: {
      keystoneHorizontalDeg: 30,
      keystoneVerticalDeg: 40,
      imageOrientations: ['landscape', 'portrait', 'free_360'],
      supportedAspectRatios: ['16:10', '16:9', '4:3'],
      supportedProjectionModes: ['front_desktop', 'front_ceiling', 'rear_desktop', 'rear_ceiling'],
    },
    electrical: {
      powerConsumptionW: 810,
      voltageMinV: 100,
      voltageMaxV: 240,
      frequencyHz: '50/60 Hz',
      powerFactor: 0.96,
      maxCurrentA: 4.2,
      standbyPowerW: 0.5,
    },
    mechanical: {
      widthMm: 498,
      heightMm: 200,
      depthMm: 581,
      weightKg: 23.0,
      lensCenterFromLeftMm: 249,
      lensCenterFromBottomMm: 100,
      lensCenterFromFrontMm: 50,
      mountingPoint: '4× M6 Tavan / Truss Askı',
      mountingOrientation: '360° Serbest Montaj',
      coolingClearanceSideMm: 500,
      coolingClearanceRearMm: 500,
      coolingClearanceTopMm: 300,
    },
  },
];

export const DEFAULT_CAMERA_PROFILES: CameraDeviceProfile[] = [
  {
    id: 'sony-fx3-ff-24-70',
    category: 'camera',
    brand: 'Sony',
    model: 'ILME-FX3 + FE 24-70mm F2.8 GM II',
    manufacturer: 'Sony Corp.',
    dataSource: 'MANUFACTURER_SPEC',
    catalogUrl: 'https://pro.sony/products/handheld-camcorders/ilme-fx3',
    entryDate: '2026-11-15',
    verificationStatus: 'MANUFACTURER_VERIFIED',
    notes: 'Tam kare (Full-Frame 35.6×23.8 mm) sinema/kalibrasyon kamerası, 24–70 mm zoom lens.',
    fieldSources: {
      sensorWidthMm: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      sensorHeightMm: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      focalLengthMm: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
    },
    sensor: {
      sensorType: 'Full Frame (35mm Exmor R CMOS)',
      sensorWidthMm: 35.6,
      sensorHeightMm: 23.8,
      sensorResolutionMp: 10.2,
      nativeResolutionW: 4096,
      nativeResolutionH: 2160,
      cropFactor: 1.0,
      sensorCropMode: 1.0,
      aspectRatio: '3:2',
      pixelPitchUm: 8.4,
    },
    lens: {
      lensBrandModel: 'Sony FE 24-70mm F2.8 GM II',
      focalLengthMm: 35,
      focalLengthMinMm: 24,
      focalLengthMaxMm: 70,
      lensPrimeOrZoom: 'zoom',
      apertureFNumberMin: 2.8,
      apertureFNumberMax: 22,
      lensDistortionPct: -1.2,
      manufacturerHfovDeg: null,
      manufacturerVfovDeg: null,
      focusDistanceM: 5.0,
      minFocusDistanceM: 0.21,
      digitalZoomFactor: 1.0,
    },
    mechanical: {
      widthMm: 129.7,
      heightMm: 77.8,
      depthMm: 210,
      weightKg: 1.41,
      mountingPoint: '1/4"-20 UNC Tripod & Üst Kafes',
    },
  },
  {
    id: 'av-ptz-1-28-broadcast',
    category: 'camera',
    brand: 'Panasonic',
    model: 'AW-UE150 4K 60p PTZ Kamera',
    manufacturer: 'Panasonic Connect',
    dataSource: 'MANUFACTURER_SPEC',
    catalogUrl: null,
    entryDate: '2026-11-15',
    verificationStatus: 'MANUFACTURER_VERIFIED',
    notes: '1-inç MOS sensörlü profesyonel konferans/sahne PTZ kamera (20x optik zoom).',
    fieldSources: {
      sensorWidthMm: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      sensorHeightMm: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
      focalLengthMm: { source: 'MANUFACTURER_SPEC', confidence: 'HIGH' },
    },
    sensor: {
      sensorType: '1-inch MOS',
      sensorWidthMm: 13.2,
      sensorHeightMm: 8.8,
      sensorResolutionMp: 20.1,
      nativeResolutionW: 3840,
      nativeResolutionH: 2160,
      cropFactor: 2.7,
      sensorCropMode: 1.0,
      aspectRatio: '16:9',
      pixelPitchUm: 2.4,
    },
    lens: {
      lensBrandModel: 'Dahili 20x Optik Zoom (f=8.8–176 mm, F2.8–4.5)',
      focalLengthMm: 8.8,
      focalLengthMinMm: 8.8,
      focalLengthMaxMm: 176.0,
      lensPrimeOrZoom: 'zoom',
      apertureFNumberMin: 2.8,
      apertureFNumberMax: 4.5,
      lensDistortionPct: -0.6,
      manufacturerHfovDeg: 75.1,
      manufacturerVfovDeg: 46.7,
      focusDistanceM: 6.0,
      minFocusDistanceM: 1.0,
      digitalZoomFactor: 1.0,
    },
    mechanical: {
      widthMm: 213,
      heightMm: 267,
      depthMm: 219,
      weightKg: 4.2,
      mountingPoint: 'Tavan / Duvar PTZ Braketi',
    },
  },
];

// ============================================================================
// YARDIMCI ORAN & GEOMETRİ ÇÖZÜCÜLER
// ============================================================================

export function parseAspectRatioNumber(aspectStr: string | null | undefined, fallbackW?: number | null, fallbackH?: number | null): number | null {
  if (aspectStr) {
    const clean = aspectStr.trim();
    const parts = clean.split(/[:/]/).map(s => parseFloat(s.trim()));
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      return parts[0] / parts[1];
    }
  }
  if (fallbackW && fallbackH && fallbackW > 0 && fallbackH > 0) {
    return fallbackW / fallbackH;
  }
  return null;
}

// ============================================================================
// 3. PROJEKSİYON LENS HESAPLAMA MOTORU
// ============================================================================

export type ProjectorCalculationMethod =
  | 'DIST_TO_SIZE'          // 1. Mesafeyi girip görüntü ölçüsünü bulma
  | 'SIZE_TO_DIST'          // 2. Görüntü genişliğini girip mesafeyi bulma
  | 'SIZE_TO_LENS_RANGE'    // 3. Görüntü genişliği ve yüksekliğini girip uygun lens aralığını bulma
  | 'POSITION_TO_FOOTPRINT'; // 4. Projektör konumunu girip fiziksel görüntü alanını görme

export interface ProjectorLensCalcInput {
  profile: ProjectorDeviceProfile;
  method: ProjectorCalculationMethod;
  /** Hedef atım mesafesi D (metre) — DIST_TO_SIZE, SIZE_TO_LENS_RANGE ve POSITION_TO_FOOTPRINT için */
  throwDistanceM?: number | null;
  /** Hedef görüntü genişliği W (metre) — SIZE_TO_DIST ve SIZE_TO_LENS_RANGE için */
  targetImageWidthM?: number | null;
  /** Hedef görüntü yüksekliği H (metre) — SIZE_TO_LENS_RANGE için */
  targetImageHeightM?: number | null;
  /** Seçilen çalışma Throw Ratio değeri (null ise zoom orta noktası kullanılır) */
  selectedThrowRatio?: number | null;
  /** Talep edilen optik lens shift (dikey %, yatay %) */
  requestedVerticalShiftPct?: number | null;
  requestedHorizontalShiftPct?: number | null;
  /** Talep edilen dijital keystone (dikey °, yatay °) */
  requestedVerticalKeystoneDeg?: number | null;
  requestedHorizontalKeystoneDeg?: number | null;
  /** Cihaz 3B konumu [x, y, z] (m): x yanal, y yerden yükseklik, z perdeye dik uzaklık */
  projectorPositionM?: [number, number, number];
}

export interface ProjectorLensCalcResult {
  status: ComplianceStatus;
  method: ProjectorCalculationMethod;
  isFixedLens: boolean | null;
  aspectRatio: number | null;
  aspectRatioLabel: string;

  /** Hesaplanan değerler (Eksik veri varsa null / UNKNOWN) */
  nominalThrowRatio: number | null;
  minThrowRatio: number | null;
  maxThrowRatio: number | null;
  requiredThrowRatio: number | null;

  nominalDistanceM: number | null;
  minDistanceM: number | null;
  maxDistanceM: number | null;

  nominalImageWidthM: number | null;
  minImageWidthM: number | null;
  maxImageWidthM: number | null;

  nominalImageHeightM: number | null;
  minImageHeightM: number | null;
  maxImageHeightM: number | null;

  nominalDiagonalM: number | null;
  minDiagonalM: number | null;
  maxDiagonalM: number | null;
  nominalDiagonalInch: number | null;

  /** Zoom & Optik Tutarlılık Analizi */
  zoomConsistency: {
    status: ComplianceStatus;
    trZoomRatio: number | null;       // TR_max / TR_min
    focalZoomRatio: number | null;    // f_max / f_min
    statedZoomRatio: number | null;   // Katalog/kullanıcı beyanı (örn. 1.1x)
    deviationFromStatedPct: number | null;
    summaryTr: string;
  };

  /** Lens Çalışma Aralığı Uygunluğu */
  lensRangeCheck: {
    status: ComplianceStatus;
    inOpticalRange: boolean | null;
     catalogVerified: boolean;
    summaryTr: string;
  };

  /** Bölüm 6: Offset, Lens Shift ve Keystone Ayrımı */
  offsetAnalysis: {
    status: ComplianceStatus;
    offsetPct: number | null;
    tolerancePct: number | null;
    convention: OffsetReferenceConvention | null;
    /** Lens eksenine göre görüntü alt kenarının dikey ofseti (m, + yukarı) */
    imageBottomOffsetFromLensAxisM: number | null;
    imageTopOffsetFromLensAxisM: number | null;
    imageCenterOffsetFromLensAxisM: number | null;
    /** Cihaz yerden yüksekliği verildiğinde görüntünün yerden başlangıç ve bitiş yüksekliği (m) */
    projectedBottomFromFloorM: number | null;
    projectedTopFromFloorM: number | null;
    summaryTr: string;
  };

  lensShiftAnalysis: {
    status: ComplianceStatus;
    requestedVPct: number;
    requestedHPct: number;
    allowedVRangePct: [number | null, number | null];
    allowedHRangePct: [number | null, number | null];
    verticalShiftMeters: number | null;
    horizontalShiftMeters: number | null;
    summaryTr: string;
  };

  keystoneAnalysis: {
    status: ComplianceStatus;
    requestedVDeg: number;
    requestedHDeg: number;
    maxAllowedVDeg: number | null;
    maxAllowedHDeg: number | null;
    estimatedEffectivePixelKeepPct: number;
    summaryTr: string;
  };

  /** Çoklu mesafe / genişlik hızlı doğrulama matrisi (örn. 5m, 7m mesafede W_min/W_max; 3m genişlik için D_min/D_max) */
  referenceMatrix: {
    at5mDistance: { minWidthM: number | null; maxWidthM: number | null; minHeightM: number | null; maxHeightM: number | null };
    at7mDistance: { minWidthM: number | null; maxWidthM: number | null; minHeightM: number | null; maxHeightM: number | null };
    for3mWidth: { minDistanceM: number | null; maxDistanceM: number | null; imageHeightM: number | null; diagonalM: number | null };
  };

  formulasUsed: { name: string; expression: string; substitution: string }[];
  dataSourceSummary: { parameter: string; value: string; source: ParameterSourceType; confidence: ConfidenceLevel }[];
  assumptions: string[];
  warnings: string[];
}

export function calculateProjectorLensOptics(inp: ProjectorLensCalcInput): ProjectorLensCalcResult {
  const { profile, method } = inp;
  const opt = profile.optics;
  const gen = profile.general;
  const geo = profile.geometry;

  const warnings: string[] = [];
  const assumptions: string[] = [
    'Teorik optik hesap: İnce mercek / merkezi projeksiyon modeli (TR = D / W), lens ön referans düzleminden dikey hedef yüzeye ölçülür.',
  ];
  const formulasUsed: { name: string; expression: string; substitution: string }[] = [];

  const trMin = opt.throwRatioMin !== null && opt.throwRatioMin > 0 ? opt.throwRatioMin : null;
  const trMax = opt.throwRatioMax !== null && opt.throwRatioMax > 0 ? opt.throwRatioMax : trMin;

  // KURAL: F-number ve focal length değerlerini sensör/imager boyutu olmadan Throw Ratio yerine ASLA kullanma!
  if (trMin === null || trMax === null) {
    if (opt.focalLengthMinMm !== null || opt.fNumberMin !== null) {
      warnings.push(
        'KRİTİK OPTİK KURAL: Odak uzaklığı (mm) ve F-number değerleri mevcut olsa da DMD/LCD panel (imager) fiziksel boyutu ve optik röle oranı bilinmeden bu değerlerden Throw Ratio türetilemez (Sonuç: UNKNOWN).'
      );
    } else {
      warnings.push('Projektör Throw Ratio (TR min / TR max) verisi girilmediğinden optik lens hesabı yapılamıyor (UNKNOWN).');
    }
  }

  const aspect = parseAspectRatioNumber(gen.nativeAspectRatio, gen.nativeResolutionW, gen.nativeResolutionH);
  const aspectLabel = gen.nativeAspectRatio || (gen.nativeResolutionW && gen.nativeResolutionH ? `${gen.nativeResolutionW}:${gen.nativeResolutionH}` : 'UNKNOWN');
  if (aspect === null) {
    warnings.push('Native en-boy oranı (Aspect Ratio) veya doğal çözünürlük tanımlanmadığından görüntü yüksekliği (H) ve diyagonal hesaplanamaz (UNKNOWN).');
  }

  const isFixedLens = trMin !== null && trMax !== null ? Math.abs(trMax - trMin) < 1e-4 : null;

  // Zoom Tutarlılık Analizi (TR_max/TR_min vs f_max/f_min vs opticalZoomRatio)
  const trZoomRatio = trMin !== null && trMax !== null && trMin > 0 ? round(trMax / trMin, 4) : null;
  const focalZoomRatio =
    opt.focalLengthMinMm !== null && opt.focalLengthMaxMm !== null && opt.focalLengthMinMm > 0
      ? round(opt.focalLengthMaxMm / opt.focalLengthMinMm, 4)
      : null;
  const statedZoomRatio = opt.opticalZoomRatio !== null && opt.opticalZoomRatio > 0 ? opt.opticalZoomRatio : null;

  let zoomStatus: ComplianceStatus = 'UNKNOWN';
  let zoomDeviationPct: number | null = null;
  let zoomSummaryTr = 'Optik zoom verisi eksik (UNKNOWN).';

  if (trZoomRatio !== null) {
    if (isFixedLens) {
      zoomStatus = 'PASS';
      zoomSummaryTr = `Sabit odak (Fixed) lens: TR = ${trMin}:1 (Zoom oranı 1.00x).`;
    } else if (statedZoomRatio !== null) {
      zoomDeviationPct = round((Math.abs(trZoomRatio - statedZoomRatio) / statedZoomRatio) * 100, 2);
      if (zoomDeviationPct <= 3.5) {
        zoomStatus = 'PASS';
        zoomSummaryTr = `TR aralığından hesaplanan optik zoom (${trZoomRatio.toFixed(3)}x = ${trMax}/${trMin}), beyan edilen ${statedZoomRatio}x zoom değeriyle uyumludur (fark: %${zoomDeviationPct})${
          focalZoomRatio !== null ? `; odak uzaklığı oranı f_max/f_min = ${focalZoomRatio.toFixed(3)}x` : ''
        }.`;
      } else if (zoomDeviationPct <= 8.0) {
        zoomStatus = 'WARNING';
        zoomSummaryTr = `TR oranı (${trZoomRatio.toFixed(3)}x) ile beyan edilen zoom (${statedZoomRatio}x) arasında %${zoomDeviationPct} yuvarlama farkı var.`;
      } else {
        zoomStatus = 'FAIL';
        zoomSummaryTr = `TUTARSIZ ZOOM: TR aralığı (${trMax}/${trMin} = ${trZoomRatio.toFixed(3)}x) ile beyan edilen zoom (${statedZoomRatio}x) birbiriyle çelişiyor (%${zoomDeviationPct} sapma)!`;
        warnings.push(zoomSummaryTr);
      }
    } else {
      zoomStatus = 'WARNING';
      zoomSummaryTr = `TR aralığından hesaplanan optik zoom: ${trZoomRatio.toFixed(3)}x (üretici zoom çarpanı ayrıca girilmemiş).`;
    }
  }

  // Seçilen / Nominal Throw Ratio
  const selectedTR =
    inp.selectedThrowRatio !== undefined && inp.selectedThrowRatio !== null && inp.selectedThrowRatio > 0
      ? inp.selectedThrowRatio
      : trMin !== null && trMax !== null
      ? round((trMin + trMax) / 2, 3)
      : null;

  let nominalDistanceM: number | null = null;
  let minDistanceM: number | null = null;
  let maxDistanceM: number | null = null;
  let nominalImageWidthM: number | null = null;
  let minImageWidthM: number | null = null;
  let maxImageWidthM: number | null = null;
  let requiredThrowRatio: number | null = null;

  const D_in = inp.throwDistanceM !== undefined && inp.throwDistanceM !== null && inp.throwDistanceM > 0 ? inp.throwDistanceM : null;
  const W_in = inp.targetImageWidthM !== undefined && inp.targetImageWidthM !== null && inp.targetImageWidthM > 0 ? inp.targetImageWidthM : null;
  const H_in = inp.targetImageHeightM !== undefined && inp.targetImageHeightM !== null && inp.targetImageHeightM > 0 ? inp.targetImageHeightM : null;

  if (trMin !== null && trMax !== null && selectedTR !== null) {
    if (method === 'DIST_TO_SIZE' || method === 'POSITION_TO_FOOTPRINT') {
      const distUsed = method === 'POSITION_TO_FOOTPRINT' && inp.projectorPositionM ? inp.projectorPositionM[2] : D_in;
      if (distUsed !== null && distUsed > 0) {
        nominalDistanceM = round(distUsed, 3);
        minDistanceM = nominalDistanceM;
        maxDistanceM = nominalDistanceM;
        // W_min = D / TR_max (tele uç), W_max = D / TR_min (geniş uç)
        minImageWidthM = round(distUsed / trMax, 3);
        maxImageWidthM = round(distUsed / trMin, 3);
        nominalImageWidthM = round(distUsed / selectedTR, 3);
        requiredThrowRatio = round(selectedTR, 3);
        formulasUsed.push(
          { name: 'Minimum Görüntü Genişliği (Tele Uç)', expression: 'W_min = D / TR_max', substitution: `${distUsed} / ${trMax} = ${minImageWidthM} m` },
          { name: 'Maksimum Görüntü Genişliği (Geniş Uç)', expression: 'W_max = D / TR_min', substitution: `${distUsed} / ${trMin} = ${maxImageWidthM} m` },
          { name: 'Nominal Görüntü Genişliği', expression: 'W_nom = D / TR_secilen', substitution: `${distUsed} / ${selectedTR} = ${nominalImageWidthM} m` }
        );
      } else {
        warnings.push('Atım mesafesi (D) girilmedi (UNKNOWN).');
      }
    } else if (method === 'SIZE_TO_DIST') {
      if (W_in !== null && W_in > 0) {
        nominalImageWidthM = round(W_in, 3);
        minImageWidthM = nominalImageWidthM;
        maxImageWidthM = nominalImageWidthM;
        minDistanceM = round(W_in * trMin, 3);
        maxDistanceM = round(W_in * trMax, 3);
        nominalDistanceM = round(W_in * selectedTR, 3);
        requiredThrowRatio = round(selectedTR, 3);
        formulasUsed.push(
          { name: 'Minimum Atım Mesafesi (Geniş Uç)', expression: 'D_min = W × TR_min', substitution: `${W_in} × ${trMin} = ${minDistanceM} m` },
          { name: 'Maksimum Atım Mesafesi (Tele Uç)', expression: 'D_max = W × TR_max', substitution: `${W_in} × ${trMax} = ${maxDistanceM} m` },
          { name: 'Nominal Atım Mesafesi', expression: 'D_nom = W × TR_secilen', substitution: `${W_in} × ${selectedTR} = ${nominalDistanceM} m` }
        );
      } else {
        warnings.push('Hedef görüntü genişliği (W) girilmedi (UNKNOWN).');
      }
    } else if (method === 'SIZE_TO_LENS_RANGE') {
      if (W_in !== null && D_in !== null && W_in > 0 && D_in > 0) {
        requiredThrowRatio = round(D_in / W_in, 3);
        nominalDistanceM = round(D_in, 3);
        minDistanceM = round(W_in * trMin, 3);
        maxDistanceM = round(W_in * trMax, 3);
        nominalImageWidthM = round(W_in, 3);
        minImageWidthM = round(D_in / trMax, 3);
        maxImageWidthM = round(D_in / trMin, 3);
        formulasUsed.push(
          { name: 'Gereken Throw Ratio', expression: 'TR_req = D / W', substitution: `${D_in} / ${W_in} = ${requiredThrowRatio}:1` },
          { name: 'Lens Mesafe Penceresi', expression: '[D_min, D_max] = [W × TR_min, W × TR_max]', substitution: `[${minDistanceM} m, ${maxDistanceM} m]` }
        );
        if (H_in !== null && aspect !== null) {
          const targetAspect = W_in / H_in;
          if (Math.abs(targetAspect - aspect) > 0.03) {
            warnings.push(
              `Hedef yüzey en-boy oranı (${targetAspect.toFixed(2)}:1 = ${W_in}m × ${H_in}m), cihazın doğal en-boy oranından (${aspectLabel} = ${aspect.toFixed(2)}:1) farklıdır; aktif görüntü yüksekliği ${(W_in / aspect).toFixed(3)} m olacaktır.`
            );
          }
        }
      } else {
        warnings.push('Uygun lens aralığı analizi için hem görüntü genişliği (W) hem de mesafe (D) girilmelidir (UNKNOWN).');
      }
    }
  }

  // Yükseklik ve Diyagonal Hesapları: H = W / Aspect, Diagonal = sqrt(W^2 + H^2)
  const calcH = (w: number | null) => (w !== null && aspect !== null ? round(w / aspect, 3) : null);
  const calcDiag = (w: number | null, h: number | null) => (w !== null && h !== null ? round(Math.hypot(w, h), 3) : null);

  const nominalImageHeightM = calcH(nominalImageWidthM);
  const minImageHeightM = calcH(minImageWidthM);
  const maxImageHeightM = calcH(maxImageWidthM);

  const nominalDiagonalM = calcDiag(nominalImageWidthM, nominalImageHeightM);
  const minDiagonalM = calcDiag(minImageWidthM, minImageHeightM);
  const maxDiagonalM = calcDiag(maxImageWidthM, maxImageHeightM);
  const nominalDiagonalInch = nominalDiagonalM !== null ? round(nominalDiagonalM / 0.0254, 1) : null;

  if (nominalImageWidthM !== null && nominalImageHeightM !== null && nominalDiagonalM !== null) {
    formulasUsed.push(
      { name: 'Görüntü Yüksekliği', expression: 'H = W / AspectRatio', substitution: `${nominalImageWidthM} / ${aspect?.toFixed(4)} = ${nominalImageHeightM} m` },
      { name: 'Görüntü Diyagonali', expression: 'Diagonal = √(W² + H²)', substitution: `√(${nominalImageWidthM}² + ${nominalImageHeightM}²) = ${nominalDiagonalM} m (${nominalDiagonalInch}")` }
    );
  }

  // Lens Çalışma Aralığı ve Katalog Doğrulama Kontrolü
  const catalogVerified = profile.verificationStatus === 'MANUFACTURER_VERIFIED' && profile.dataSource === 'MANUFACTURER_SPEC';
  let lensRangeStatus: ComplianceStatus = 'UNKNOWN';
  let inOpticalRange: boolean | null = null;
  let lensRangeSummary = 'Lens çalışma aralığı kontrolü için TR ve hedef değerler gereklidir (UNKNOWN).';

  const trToCheck = requiredThrowRatio ?? selectedTR;
  if (trMin !== null && trMax !== null && trToCheck !== null) {
    const eps = 1e-6;
    inOpticalRange = trToCheck >= trMin - eps && trToCheck <= trMax + eps;
    if (!inOpticalRange) {
      lensRangeStatus = 'FAIL';
      lensRangeSummary = `OPTİK ARALIK DIŞI (FAIL): Gereken TR (${trToCheck}:1), seçili lensin optik çalışma aralığı [${trMin}–${trMax}:1] dışındadır!`;
      warnings.push(lensRangeSummary);
    } else if (!catalogVerified) {
      lensRangeStatus = 'WARNING';
      lensRangeSummary = `Gereken TR (${trToCheck}:1) optik aralık [${trMin}–${trMax}:1] içindedir; ancak cihaz/lens profili kullanıcı tanımlıdır (${profile.dataSource}) ve üretici zoom eğrisi/kataloğu ile doğrulanmamıştır (WARNING).`;
    } else {
      lensRangeStatus = 'PASS';
      lensRangeSummary = `Gereken TR (${trToCheck}:1), üretici kataloğu onaylı [${trMin}–${trMax}:1] lens çalışma aralığı içindedir (PASS).`;
    }
  }

  // Bölüm 6.1: Optik Offset Analizi (Referans konvansiyonu zorunlu!)
  let offsetStatus: ComplianceStatus = 'UNKNOWN';
  let imageBottomOffsetFromLensAxisM: number | null = null;
  let imageTopOffsetFromLensAxisM: number | null = null;
  let imageCenterOffsetFromLensAxisM: number | null = null;
  let projectedBottomFromFloorM: number | null = null;
  let projectedTopFromFloorM: number | null = null;
  let offsetSummaryTr = 'Optik offset verisi girilmedi (UNKNOWN).';

  if (opt.lensOffsetPct !== null) {
    if (!opt.offsetMeasurementConvention || opt.offsetMeasurementConvention === 'UNSPECIFIED') {
      offsetStatus = 'UNKNOWN';
      offsetSummaryTr = `Optik Offset %${opt.lensOffsetPct} girilmiş ancak üretici referans konvansiyonu (Full Height / Half Height / Merkez) belirtilmemiştir (UNSPECIFIED). Konvansiyon olmadan kesin dikey yerleşim koordinatı üretilemez (UNKNOWN).`;
      warnings.push(offsetSummaryTr);
    } else if (nominalImageHeightM !== null) {
      const H = nominalImageHeightM;
      const pct = opt.lensOffsetPct;
      if (opt.offsetMeasurementConvention === 'FULL_HEIGHT_FROM_BOTTOM') {
        // %100 = alt kenar lens ekseninde (0 m); %112 = alt kenar lens ekseninin +0.12*H üstünde, üst kenar +1.12*H üstünde
        imageBottomOffsetFromLensAxisM = round(((pct - 100) / 100) * H, 3);
        imageTopOffsetFromLensAxisM = round((pct / 100) * H, 3);
        imageCenterOffsetFromLensAxisM = round((imageBottomOffsetFromLensAxisM + imageTopOffsetFromLensAxisM) / 2, 3);
      } else if (opt.offsetMeasurementConvention === 'HALF_HEIGHT_FROM_CENTER') {
        // %0 = merkez lens ekseninde; %100 = merkez +0.5*H yukarıda
        imageCenterOffsetFromLensAxisM = round((pct / 100) * (H / 2), 3);
        imageBottomOffsetFromLensAxisM = round(imageCenterOffsetFromLensAxisM - H / 2, 3);
        imageTopOffsetFromLensAxisM = round(imageCenterOffsetFromLensAxisM + H / 2, 3);
      } else {
        // LENS_TO_BOTTOM_PCT: doğrudan alt kenarın H'a oranı
        imageBottomOffsetFromLensAxisM = round((pct / 100) * H, 3);
        imageTopOffsetFromLensAxisM = round(imageBottomOffsetFromLensAxisM + H, 3);
        imageCenterOffsetFromLensAxisM = round(imageBottomOffsetFromLensAxisM + H / 2, 3);
      }

      if (inp.projectorPositionM && inp.projectorPositionM[1] > 0) {
        const lensY = inp.projectorPositionM[1];
        projectedBottomFromFloorM = round(lensY + imageBottomOffsetFromLensAxisM, 3);
        projectedTopFromFloorM = round(lensY + imageTopOffsetFromLensAxisM, 3);
      }

      offsetStatus = opt.lensOffsetTolerancePct !== null ? 'PASS' : 'WARNING';
      offsetSummaryTr = `Optik Offset: %${pct}${opt.lensOffsetTolerancePct !== null ? ` ±%${opt.lensOffsetTolerancePct}` : ''} (${opt.offsetMeasurementConvention}) → Görüntü alt kenarı lens ekseninden ${imageBottomOffsetFromLensAxisM >= 0 ? '+' : ''}${imageBottomOffsetFromLensAxisM} m, üst kenarı ${imageTopOffsetFromLensAxisM >= 0 ? '+' : ''}${imageTopOffsetFromLensAxisM} m hizasındadır.`;
    }
  }

  // Bölüm 6.2: Optik Lens Shift Analizi (Keystone ile karıştırılmaz!)
  const reqVShift = inp.requestedVerticalShiftPct ?? 0;
  const reqHShift = inp.requestedHorizontalShiftPct ?? 0;
  const hasVShiftSpec = opt.lensShiftVerticalMinPct !== null && opt.lensShiftVerticalMaxPct !== null;
  const hasHShiftSpec = opt.lensShiftHorizontalMinPct !== null && opt.lensShiftHorizontalMaxPct !== null;

  let shiftStatus: ComplianceStatus = 'UNKNOWN';
  let shiftSummaryTr = 'Optik lens shift verisi üretici profilinde tanımlı değil (UNKNOWN).';
  const shiftRefFactor = opt.lensShiftReference === 'HALF_DIMENSION' ? 0.5 : 1.0;
  const verticalShiftMeters =
    nominalImageHeightM !== null ? round((reqVShift / 100) * nominalImageHeightM * shiftRefFactor, 3) : null;
  const horizontalShiftMeters =
    nominalImageWidthM !== null ? round((reqHShift / 100) * nominalImageWidthM * shiftRefFactor, 3) : null;

  if (Math.abs(reqVShift) < 1e-4 && Math.abs(reqHShift) < 1e-4) {
    shiftStatus = hasVShiftSpec || hasHShiftSpec ? 'PASS' : 'UNKNOWN';
    shiftSummaryTr =
      hasVShiftSpec || hasHShiftSpec
        ? `Optik lens shift talebi 0% (Kapasite: Dikey [${opt.lensShiftVerticalMinPct ?? 0}%..+${opt.lensShiftVerticalMaxPct ?? 0}%], Yatay [${opt.lensShiftHorizontalMinPct ?? 0}%..+${opt.lensShiftHorizontalMaxPct ?? 0}%]).`
        : 'Optik lens shift talebi 0%, ancak cihazın lens shift kapasitesi tanımlı değil (UNKNOWN).';
  } else {
    if (!hasVShiftSpec && Math.abs(reqVShift) > 0) {
      shiftStatus = 'UNKNOWN';
      shiftSummaryTr = `Dikey %${reqVShift} optik lens shift talep edildi ancak cihaz profilinde lens shift kapasitesi UNKNOWN!`;
      warnings.push(shiftSummaryTr);
    } else if (!hasHShiftSpec && Math.abs(reqHShift) > 0) {
      shiftStatus = 'UNKNOWN';
      shiftSummaryTr = `Yatay %${reqHShift} optik lens shift talep edildi ancak cihaz profilinde yatay shift kapasitesi UNKNOWN!`;
      warnings.push(shiftSummaryTr);
    } else {
      const vOk = !hasVShiftSpec || (reqVShift >= (opt.lensShiftVerticalMinPct ?? 0) && reqVShift <= (opt.lensShiftVerticalMaxPct ?? 0));
      const hOk = !hasHShiftSpec || (reqHShift >= (opt.lensShiftHorizontalMinPct ?? 0) && reqHShift <= (opt.lensShiftHorizontalMaxPct ?? 0));
      if (vOk && hOk) {
        shiftStatus = 'PASS';
        shiftSummaryTr = `Optik lens shift (Dikey %${reqVShift} = ${verticalShiftMeters ?? '—'}m, Yatay %${reqHShift} = ${horizontalShiftMeters ?? '—'}m) optik limitler içindedir (PASS).`;
      } else {
        shiftStatus = 'FAIL';
        shiftSummaryTr = `LENS SHIFT AŞIMI (FAIL): Talep edilen shift (V:%${reqVShift}, H:%${reqHShift}), cihazın optik shift sınırlarını (V:[${opt.lensShiftVerticalMinPct}..${opt.lensShiftVerticalMaxPct}%], H:[${opt.lensShiftHorizontalMinPct}..${opt.lensShiftHorizontalMaxPct}%]) aşıyor!`;
        warnings.push(shiftSummaryTr);
      }
    }
  }

  // Bölüm 6.3: Dijital Keystone Analizi (Optik shift değildir; çözünürlük kaybı üretir!)
  const reqVKey = inp.requestedVerticalKeystoneDeg ?? 0;
  const reqHKey = inp.requestedHorizontalKeystoneDeg ?? 0;
  const maxVKey = geo.keystoneVerticalDeg;
  const maxHKey = geo.keystoneHorizontalDeg;
  const estimatedEffectivePixelKeepPct = round(
    Math.max(40, 100 - (Math.abs(reqVKey) * 1.15 + Math.abs(reqHKey) * 1.05)),
    1
  );

  let keystoneStatus: ComplianceStatus = 'PASS';
  let keystoneSummaryTr = 'Dijital keystone düzeltmesi kapalı (0° — %100 doğal piksel korunuyor).';
  if (Math.abs(reqVKey) > 0 || Math.abs(reqHKey) > 0) {
    if (maxVKey === null && maxHKey === null) {
      keystoneStatus = 'UNKNOWN';
      keystoneSummaryTr = `Dijital keystone (V:${reqVKey}°, H:${reqHKey}°) talep edildi ancak cihazın keystone sınırı UNKNOWN.`;
    } else if (
      (maxVKey !== null && Math.abs(reqVKey) > maxVKey) ||
      (maxHKey !== null && Math.abs(reqHKey) > maxHKey)
    ) {
      keystoneStatus = 'FAIL';
      keystoneSummaryTr = `KEYSTONE SINIR AŞIMI (FAIL): Talep edilen dijital keystone (V:${reqVKey}°, H:${reqHKey}°), cihaz sınırını (±${maxVKey}° / ±${maxHKey}°) aşıyor!`;
      warnings.push(keystoneSummaryTr);
    } else {
      keystoneStatus = 'WARNING';
      keystoneSummaryTr = `DİJİTAL KEYSTONE AKTİF (WARNING): V:${reqVKey}°, H:${reqHKey}° dijital/geometrik düzeltme uygulanıyor. Bu işlem optik lens shift değildir; efektif piksel alanında yaklaşık %${round(100 - estimatedEffectivePixelKeepPct, 1)} çözünürlük ve keskinlik kaybı oluşur.`;
      warnings.push(keystoneSummaryTr);
    }
  }

  // Bölüm 8 Referans Doğrulama Matrisi (5m mesafe, 7m mesafe ve 3m genişlik için kesin değerler)
  const referenceMatrix = {
    at5mDistance: {
      minWidthM: trMax !== null ? round(5 / trMax, 3) : null,
      maxWidthM: trMin !== null ? round(5 / trMin, 3) : null,
      minHeightM: trMax !== null && aspect !== null ? round(5 / trMax / aspect, 3) : null,
      maxHeightM: trMin !== null && aspect !== null ? round(5 / trMin / aspect, 3) : null,
    },
    at7mDistance: {
      minWidthM: trMax !== null ? round(7 / trMax, 3) : null,
      maxWidthM: trMin !== null ? round(7 / trMin, 3) : null,
      minHeightM: trMax !== null && aspect !== null ? round(7 / trMax / aspect, 3) : null,
      maxHeightM: trMin !== null && aspect !== null ? round(7 / trMin / aspect, 3) : null,
    },
    for3mWidth: {
      minDistanceM: trMin !== null ? round(3 * trMin, 3) : null,
      maxDistanceM: trMax !== null ? round(3 * trMax, 3) : null,
      imageHeightM: aspect !== null ? round(3 / aspect, 3) : null,
      diagonalM: aspect !== null ? round(Math.hypot(3, 3 / aspect), 3) : null,
    },
  };

  const dataSourceSummary: { parameter: string; value: string; source: ParameterSourceType; confidence: ConfidenceLevel }[] = [
    {
      parameter: 'Throw Ratio (Min – Max)',
      value: trMin !== null && trMax !== null ? `${trMin} – ${trMax}:1` : 'UNKNOWN',
      source: trMin !== null ? (profile.fieldSources.throwRatio?.source ?? profile.dataSource) : 'UNKNOWN',
      confidence: trMin !== null ? (profile.fieldSources.throwRatio?.confidence ?? 'MEDIUM') : 'UNKNOWN',
    },
    {
      parameter: 'Odak Uzaklığı & F-Number',
      value:
        opt.focalLengthMinMm !== null
          ? `f = ${opt.focalLengthMinMm}–${opt.focalLengthMaxMm ?? opt.focalLengthMinMm} mm · F/${opt.fNumberMin ?? '?'}–${opt.fNumberMax ?? '?'}`
          : 'UNKNOWN',
      source: opt.focalLengthMinMm !== null ? (profile.fieldSources.focalLength?.source ?? profile.dataSource) : 'UNKNOWN',
      confidence: opt.focalLengthMinMm !== null ? 'MEDIUM' : 'UNKNOWN',
    },
    {
      parameter: 'Optik Offset & Konvansiyon',
      value:
        opt.lensOffsetPct !== null
          ? `%${opt.lensOffsetPct}${opt.lensOffsetTolerancePct !== null ? ` ±%${opt.lensOffsetTolerancePct}` : ''} (${opt.offsetMeasurementConvention ?? 'UNSPECIFIED'})`
          : 'UNKNOWN',
      source: opt.lensOffsetPct !== null ? (profile.fieldSources.lensOffsetPct?.source ?? profile.dataSource) : 'UNKNOWN',
      confidence:
        opt.lensOffsetPct !== null && opt.offsetMeasurementConvention && opt.offsetMeasurementConvention !== 'UNSPECIFIED'
          ? 'MEDIUM'
          : 'UNKNOWN',
    },
    {
      parameter: 'Native vs Dynamic Contrast',
      value: `Native: ${gen.nativeContrastRatio !== null ? `${gen.nativeContrastRatio.toLocaleString('tr-TR')}:1` : 'UNKNOWN'} | Dynamic: ${gen.dynamicContrastRatio !== null ? `${gen.dynamicContrastRatio.toLocaleString('tr-TR')}:1` : 'UNKNOWN'}`,
      source: gen.nativeContrastRatio !== null ? profile.dataSource : 'UNKNOWN',
      confidence: gen.nativeContrastRatio !== null ? 'HIGH' : 'UNKNOWN',
    },
  ];

  // Genel Durum
  let overallStatus: ComplianceStatus = 'PASS';
  if (lensRangeStatus === 'FAIL' || zoomStatus === 'FAIL' || shiftStatus === 'FAIL' || keystoneStatus === 'FAIL') {
    overallStatus = 'FAIL';
  } else if (trMin === null || aspect === null || nominalImageWidthM === null || nominalDistanceM === null) {
    overallStatus = 'UNKNOWN';
  } else if (
    lensRangeStatus === 'WARNING' ||
    zoomStatus === 'WARNING' ||
    offsetStatus === 'UNKNOWN' ||
    keystoneStatus === 'WARNING'
  ) {
    overallStatus = 'WARNING';
  }

  return {
    status: overallStatus,
    method,
    isFixedLens,
    aspectRatio: aspect !== null ? round(aspect, 4) : null,
    aspectRatioLabel: aspectLabel,
    nominalThrowRatio: selectedTR,
    minThrowRatio: trMin,
    maxThrowRatio: trMax,
    requiredThrowRatio,
    nominalDistanceM,
    minDistanceM,
    maxDistanceM,
    nominalImageWidthM,
    minImageWidthM,
    maxImageWidthM,
    nominalImageHeightM,
    minImageHeightM,
    maxImageHeightM,
    nominalDiagonalM,
    minDiagonalM,
    maxDiagonalM,
    nominalDiagonalInch,
    zoomConsistency: {
      status: zoomStatus,
      trZoomRatio,
      focalZoomRatio,
      statedZoomRatio,
      deviationFromStatedPct: zoomDeviationPct,
      summaryTr: zoomSummaryTr,
    },
    lensRangeCheck: {
      status: lensRangeStatus,
      inOpticalRange,
      catalogVerified,
      summaryTr: lensRangeSummary,
    },
    offsetAnalysis: {
      status: offsetStatus,
      offsetPct: opt.lensOffsetPct,
      tolerancePct: opt.lensOffsetTolerancePct,
      convention: opt.offsetMeasurementConvention,
      imageBottomOffsetFromLensAxisM,
      imageTopOffsetFromLensAxisM,
      imageCenterOffsetFromLensAxisM,
      projectedBottomFromFloorM,
      projectedTopFromFloorM,
      summaryTr: offsetSummaryTr,
    },
    lensShiftAnalysis: {
      status: shiftStatus,
      requestedVPct: reqVShift,
      requestedHPct: reqHShift,
      allowedVRangePct: [opt.lensShiftVerticalMinPct, opt.lensShiftVerticalMaxPct],
      allowedHRangePct: [opt.lensShiftHorizontalMinPct, opt.lensShiftHorizontalMaxPct],
      verticalShiftMeters,
      horizontalShiftMeters,
      summaryTr: shiftSummaryTr,
    },
    keystoneAnalysis: {
      status: keystoneStatus,
      requestedVDeg: reqVKey,
      requestedHDeg: reqHKey,
      maxAllowedVDeg: maxVKey,
      maxAllowedHDeg: maxHKey,
      estimatedEffectivePixelKeepPct,
      summaryTr: keystoneSummaryTr,
    },
    referenceMatrix,
    formulasUsed,
    dataSourceSummary,
    assumptions,
    warnings,
  };
}

// ============================================================================
// 4. FOV KAMERA HESAPLAMA MODÜLÜ
// ============================================================================

export interface CameraFovCalcInput {
  profile: CameraDeviceProfile;
  /** Hedef çalışma mesafesi (m) */
  targetDistanceM: number;
  /** Seçilen optik odak uzaklığı (mm) — girilmezse profile.lens.focalLengthMm kullanılır */
  activeFocalLengthMm?: number | null;
  /** Dijital zoom çarpanı (1.0 = kapalı; optik odak uzaklığıyla karıştırılmaz!) */
  digitalZoomOverride?: number | null;
}

export interface CameraDistanceCoverageRow {
  distanceM: number;
  horizontalCoverageM: number;
  verticalCoverageM: number;
  diagonalCoverageM: number;
  pixelsPerMeterH: number | null;
  mmPerPixelH: number | null;
}

export interface CameraFovCalcResult {
  status: ComplianceStatus;
  /** Efektif sensör boyutu (sensorCropMode uygulanmış, mm) */
  effectiveSensorWidthMm: number | null;
  effectiveSensorHeightMm: number | null;
  effectiveSensorDiagonalMm: number | null;

  /** İdeal Rectilinear (Distorsiyonsuz) Optik FOV (°) */
  rectilinearHfovDeg: number | null;
  rectilinearVfovDeg: number | null;
  rectilinearDfovDeg: number | null;

  /** Zoom Lens ise Geniş Uç (f_min) ve Tele Uç (f_max) Optik FOV Aralığı (°) */
  wideEndFov: { focalMm: number; hfovDeg: number; vfovDeg: number; dfovDeg: number; hCovAtTargetM: number; vCovAtTargetM: number } | null;
  teleEndFov: { focalMm: number; hfovDeg: number; vfovDeg: number; dfovDeg: number; hCovAtTargetM: number; vCovAtTargetM: number } | null;

  /** Distorsiyon Kalibreli Gerçek FOV (°) — Lens distorsiyonu varsa rectilinear'dan ayrılır */
  calibratedHfovDeg: number | null;
  calibratedVfovDeg: number | null;
  distortionPct: number | null;

  /** Dijital Zoom Sonrası Kırpılmış Görüş Alanı (Optik FOV'dan ayrı!) */
  digitalZoomFactor: number;
  digitalCroppedHfovDeg: number | null;
  digitalCroppedVfovDeg: number | null;
  effectiveResolutionAfterDigitalZoom: { w: number; h: number } | null;

  /** Hedef Mesafede (targetDistanceM) Görüntülenen Yatay ve Dikey Alan (m) */
  targetDistanceM: number;
  horizontalCoverageM: number | null;
  verticalCoverageM: number | null;
  diagonalCoverageM: number | null;
  coverageAreaM2: number | null;

  /** Çoklu Mesafe Kapsama Tablosu (1m, 2m, 3m, 5m, 7m, 10m, 15m + hedef mesafe) */
  distanceTable: CameraDistanceCoverageRow[];

  formulasUsed: { name: string; expression: string; substitution: string }[];
  warnings: string[];
  assumptions: string[];
}

export function calculateCameraOpticsFov(inp: CameraFovCalcInput): CameraFovCalcResult {
  const { profile } = inp;
  const s = profile.sensor;
  const l = profile.lens;
  const warnings: string[] = [];
  const assumptions: string[] = [
    'İdeal ince mercek (rectilinear / pinhole) modeli: HFOV = 2 × atan(Sw / (2 × f)), VFOV = 2 × atan(Sh / (2 × f)).',
  ];
  const formulasUsed: { name: string; expression: string; substitution: string }[] = [];

  const distM = Math.max(0.1, inp.targetDistanceM || 5.0);
  const digZoom = Math.max(1.0, inp.digitalZoomOverride ?? l.digitalZoomFactor ?? 1.0);

  // KURAL: Bilinmeyen sensör boyutunu tahmin ederek kesin FOV sonucu üretme!
  if (
    s.sensorWidthMm === null ||
    s.sensorHeightMm === null ||
    s.sensorWidthMm <= 0 ||
    s.sensorHeightMm <= 0
  ) {
    warnings.push(
      'KRİTİK KAMERA KURALI: Sensör genişliği (mm) veya sensör yüksekliği (mm) girilmemiştir (UNKNOWN). Bilinmeyen sensör boyutu tahmin edilerek FOV hesaplanmaz!'
    );
    return {
      status: 'UNKNOWN',
      effectiveSensorWidthMm: null,
      effectiveSensorHeightMm: null,
      effectiveSensorDiagonalMm: null,
      rectilinearHfovDeg: null,
      rectilinearVfovDeg: null,
      rectilinearDfovDeg: null,
      wideEndFov: null,
      teleEndFov: null,
      calibratedHfovDeg: null,
      calibratedVfovDeg: null,
      distortionPct: l.lensDistortionPct,
      digitalZoomFactor: digZoom,
      digitalCroppedHfovDeg: null,
      digitalCroppedVfovDeg: null,
      effectiveResolutionAfterDigitalZoom: null,
      targetDistanceM: distM,
      horizontalCoverageM: null,
      verticalCoverageM: null,
      diagonalCoverageM: null,
      coverageAreaM2: null,
      distanceTable: [],
      formulasUsed: [],
      warnings,
      assumptions,
    };
  }

  const fRaw = inp.activeFocalLengthMm ?? (inp as any).focalLengthMm ?? l.focalLengthMm ?? l.focalLengthMinMm;
  if (fRaw === null || fRaw === undefined || fRaw <= 0) {
    warnings.push('Lens odak uzaklığı (Focal Length mm) girilmediğinden FOV hesaplanamaz (UNKNOWN).');
    return {
      status: 'UNKNOWN',
      effectiveSensorWidthMm: s.sensorWidthMm,
      effectiveSensorHeightMm: s.sensorHeightMm,
      effectiveSensorDiagonalMm: round(Math.hypot(s.sensorWidthMm, s.sensorHeightMm), 3),
      rectilinearHfovDeg: null,
      rectilinearVfovDeg: null,
      rectilinearDfovDeg: null,
      wideEndFov: null,
      teleEndFov: null,
      calibratedHfovDeg: null,
      calibratedVfovDeg: null,
      distortionPct: l.lensDistortionPct,
      digitalZoomFactor: digZoom,
      digitalCroppedHfovDeg: null,
      digitalCroppedVfovDeg: null,
      effectiveResolutionAfterDigitalZoom: null,
      targetDistanceM: distM,
      horizontalCoverageM: null,
      verticalCoverageM: null,
      diagonalCoverageM: null,
      coverageAreaM2: null,
      distanceTable: [],
      formulasUsed: [],
      warnings,
      assumptions,
    };
  }

  const cropMode = s.sensorCropMode && s.sensorCropMode > 0 ? s.sensorCropMode : 1.0;
  const effSw = round(s.sensorWidthMm / cropMode, 3);
  const effSh = round(s.sensorHeightMm / cropMode, 3);
  const effSd = round(Math.hypot(effSw, effSh), 3);

  const calcFovForFocal = (focalMm: number) => {
    const hRad = 2 * Math.atan(effSw / (2 * focalMm));
    const vRad = 2 * Math.atan(effSh / (2 * focalMm));
    const dRad = 2 * Math.atan(effSd / (2 * focalMm));
    return {
      hRad,
      vRad,
      dRad,
      hfovDeg: round((hRad * 180) / Math.PI, 2),
      vfovDeg: round((vRad * 180) / Math.PI, 2),
      dfovDeg: round((dRad * 180) / Math.PI, 2),
    };
  };

  const mainFov = calcFovForFocal(fRaw);
  const horizontalCoverageM = round(2 * distM * Math.tan(mainFov.hRad / 2), 3);
  const verticalCoverageM = round(2 * distM * Math.tan(mainFov.vRad / 2), 3);
  const diagonalCoverageM = round(Math.hypot(horizontalCoverageM, verticalCoverageM), 3);
  const coverageAreaM2 = round(horizontalCoverageM * verticalCoverageM, 3);

  formulasUsed.push(
    {
      name: 'Horizontal FOV (Yatay Görüş Açısı)',
      expression: 'HFOV = 2 × atan(SensorWidth / (2 × FocalLength))',
      substitution: `2 × atan(${effSw} / (2 × ${fRaw})) = ${mainFov.hfovDeg}°`,
    },
    {
      name: 'Vertical FOV (Dikey Görüş Açısı)',
      expression: 'VFOV = 2 × atan(SensorHeight / (2 × FocalLength))',
      substitution: `2 × atan(${effSh} / (2 × ${fRaw})) = ${mainFov.vfovDeg}°`,
    },
    {
      name: 'Diagonal FOV (Diyagonal Görüş Açısı)',
      expression: 'DFOV = 2 × atan(SensorDiagonal / (2 × FocalLength))',
      substitution: `2 × atan(${effSd} / (2 × ${fRaw})) = ${mainFov.dfovDeg}°`,
    },
    {
      name: 'Yatay Kapsama Alanı (Horizontal Coverage)',
      expression: 'Horizontal Coverage = 2 × Distance × tan(HFOV / 2)',
      substitution: `2 × ${distM} × tan(${mainFov.hfovDeg}° / 2) = ${horizontalCoverageM} m`,
    },
    {
      name: 'Dikey Kapsama Alanı (Vertical Coverage)',
      expression: 'Vertical Coverage = 2 × Distance × tan(VFOV / 2)',
      substitution: `2 × ${distM} × tan(${mainFov.vfovDeg}° / 2) = ${verticalCoverageM} m`,
    }
  );

  // Zoom lens ise f_min ve f_max ayrı hesaplanır
  let wideEndFov: CameraFovCalcResult['wideEndFov'] = null;
  let teleEndFov: CameraFovCalcResult['teleEndFov'] = null;
  if (l.focalLengthMinMm && l.focalLengthMaxMm && l.focalLengthMaxMm > l.focalLengthMinMm + 0.01) {
    const wF = calcFovForFocal(l.focalLengthMinMm);
    const tF = calcFovForFocal(l.focalLengthMaxMm);
    wideEndFov = {
      focalMm: l.focalLengthMinMm,
      hfovDeg: wF.hfovDeg,
      vfovDeg: wF.vfovDeg,
      dfovDeg: wF.dfovDeg,
      hCovAtTargetM: round(2 * distM * Math.tan(wF.hRad / 2), 3),
      vCovAtTargetM: round(2 * distM * Math.tan(wF.vRad / 2), 3),
    };
    teleEndFov = {
      focalMm: l.focalLengthMaxMm,
      hfovDeg: tF.hfovDeg,
      vfovDeg: tF.vfovDeg,
      dfovDeg: tF.dfovDeg,
      hCovAtTargetM: round(2 * distM * Math.tan(tF.hRad / 2), 3),
      vCovAtTargetM: round(2 * distM * Math.tan(tF.vRad / 2), 3),
    };
  }

  // Distorsiyon ayrımı (İdeal Rectilinear FOV vs Gerçek Kalibre Edilmiş FOV)
  let calibratedHfovDeg: number | null = mainFov.hfovDeg;
  let calibratedVfovDeg: number | null = mainFov.vfovDeg;
  if (l.lensDistortionPct !== null && Math.abs(l.lensDistortionPct) > 0.01) {
    // negatif (fıçı / barrel) distorsiyon gerçek görüş açısını genişletir; pozitif (yastık / pincushion) daraltır
    const distFactor = 1 - l.lensDistortionPct / 100;
    calibratedHfovDeg = round(
      (2 * Math.atan(Math.tan(mainFov.hRad / 2) * distFactor) * 180) / Math.PI,
      2
    );
    calibratedVfovDeg = round(
      (2 * Math.atan(Math.tan(mainFov.vRad / 2) * distFactor) * 180) / Math.PI,
      2
    );
    assumptions.push(
      `Lens distorsiyonu (%${l.lensDistortionPct}) mevcuttur: İdeal Rectilinear FOV (${mainFov.hfovDeg}°×${mainFov.vfovDeg}°) ile Distorsiyon Kalibreli Gerçek FOV (${calibratedHfovDeg}°×${calibratedVfovDeg}°) ayrı raporlanmıştır.`
    );
  }

  // Dijital Zoom ayrımı (Optik odak uzaklığı değiştirilmez; sensör merkezinden kırpılır)
  let digitalCroppedHfovDeg: number | null = mainFov.hfovDeg;
  let digitalCroppedVfovDeg: number | null = mainFov.vfovDeg;
  let effectiveResolutionAfterDigitalZoom: { w: number; h: number } | null =
    s.nativeResolutionW && s.nativeResolutionH
      ? { w: s.nativeResolutionW, h: s.nativeResolutionH }
      : null;

  if (digZoom > 1.001) {
    digitalCroppedHfovDeg = round(
      (2 * Math.atan(effSw / digZoom / (2 * fRaw)) * 180) / Math.PI,
      2
    );
    digitalCroppedVfovDeg = round(
      (2 * Math.atan(effSh / digZoom / (2 * fRaw)) * 180) / Math.PI,
      2
    );
    if (s.nativeResolutionW && s.nativeResolutionH) {
      effectiveResolutionAfterDigitalZoom = {
        w: Math.round(s.nativeResolutionW / digZoom),
        h: Math.round(s.nativeResolutionH / digZoom),
      };
    }
    warnings.push(
      `Dijital Zoom (${digZoom.toFixed(2)}x) aktif: Optik FOV (${mainFov.hfovDeg}°×${mainFov.vfovDeg}°) değişmez; görüntü sensör üzerinde dijital olarak kırpılarak ${digitalCroppedHfovDeg}°×${digitalCroppedVfovDeg}° açısına daraltılır.`
    );
  }

  // Minimum netleme mesafesi kontrolü
  if (l.minFocusDistanceM !== null && distM < l.minFocusDistanceM) {
    warnings.push(
      `Hedef mesafe (${distM} m), lensin minimum netleme mesafesinin (${l.minFocusDistanceM} m) altındadır; optik odaklama sağlanamaz!`
    );
  }

  // Çoklu mesafe kapsama tablosu
  const baseDistances = [1, 2, 3, 5, 7, 10, 15];
  if (!baseDistances.some(d => Math.abs(d - distM) < 0.05)) {
    baseDistances.push(round(distM, 2));
    baseDistances.sort((a, b) => a - b);
  }

  const effResW = effectiveResolutionAfterDigitalZoom?.w ?? s.nativeResolutionW;
  const distanceTable: CameraDistanceCoverageRow[] = baseDistances.map(d => {
    const hCov = round(2 * d * Math.tan(mainFov.hRad / 2), 3);
    const vCov = round(2 * d * Math.tan(mainFov.vRad / 2), 3);
    const dCov = round(Math.hypot(hCov, vCov), 3);
    const ppm = effResW && hCov > 0 ? round(effResW / hCov, 1) : null;
    const mmPerPx = effResW && hCov > 0 ? round((hCov * 1000) / effResW, 2) : null;
    return {
      distanceM: d,
      horizontalCoverageM: hCov,
      verticalCoverageM: vCov,
      diagonalCoverageM: dCov,
      pixelsPerMeterH: ppm,
      mmPerPixelH: mmPerPx,
    };
  });

  const status: ComplianceStatus =
    l.minFocusDistanceM !== null && distM < l.minFocusDistanceM
      ? 'FAIL'
      : digZoom > 1.001
      ? 'WARNING'
      : 'PASS';

  return {
    status,
    effectiveSensorWidthMm: effSw,
    effectiveSensorHeightMm: effSh,
    effectiveSensorDiagonalMm: effSd,
    rectilinearHfovDeg: mainFov.hfovDeg,
    rectilinearVfovDeg: mainFov.vfovDeg,
    rectilinearDfovDeg: mainFov.dfovDeg,
    wideEndFov,
    teleEndFov,
    calibratedHfovDeg,
    calibratedVfovDeg,
    distortionPct: l.lensDistortionPct,
    digitalZoomFactor: digZoom,
    digitalCroppedHfovDeg,
    digitalCroppedVfovDeg,
    effectiveResolutionAfterDigitalZoom,
    targetDistanceM: distM,
    horizontalCoverageM,
    verticalCoverageM,
    diagonalCoverageM,
    coverageAreaM2,
    distanceTable,
    formulasUsed,
    warnings,
    assumptions,
  };
}

// ============================================================================
// 5 & 7. ORTAK 3D YERLEŞİM VE 9 MADDELİ FİZİKSEL UYGUNLUK KONTROL MOTORU
// ============================================================================

export interface SharedRoomPlacementInput {
  /** Oda boyutları (m): genişlik X, derinlik Z, tavan yüksekliği Y */
  roomWidthM: number;
  roomLengthM: number;
  roomHeightM: number;
  /** Hedef projeksiyon/görüntüleme yüzeyi (duvar üzerinde, m) */
  surfaceWidthM: number;
  surfaceHeightM: number;
  surfaceBottomFromFloorM: number;
  /** Projektör yerleşimi ve hesap sonucu */
  projectorProfile: ProjectorDeviceProfile;
  projectorPosM: [number, number, number]; // [x, y_from_floor, z_from_wall]
  projectorYawDeg: number;
  projectorPitchDeg: number;
  projectorCalc: ProjectorLensCalcResult;
  /** Kamera yerleşimi ve hesap sonucu */
  cameraProfile: CameraDeviceProfile;
  cameraPosM: [number, number, number]; // [x, y_from_floor, z_from_wall]
  cameraYawDeg: number;
  cameraPitchDeg: number;
  cameraCalc: CameraFovCalcResult;
  /** Sahnedeki fiziksel engel / kolon / insan (opsiyonel) */
  obstacle?: {
    enabled: boolean;
    name: string;
    xM: number;
    zFromWallM: number;
    widthM: number;
    heightM: number;
  };
}

export interface PhysicalComplianceCheckItem {
  id: string;
  titleTr: string;
  questionTr: string;
  status: ComplianceStatus;
  measuredOrCalculatedValue: string;
  limitOrRequirement: string;
  detailTr: string;
}

export interface SharedPlacementEvaluationResult {
  overallStatus: ComplianceStatus;
  counts: { pass: number; warning: number; fail: number; unknown: number };
  checks: PhysicalComplianceCheckItem[];
  projectorFootprintOnWall: {
    leftM: number;
    rightM: number;
    bottomFromFloorM: number;
    topFromFloorM: number;
    widthM: number;
    heightM: number;
    exceedsWallBounds: boolean;
  } | null;
  cameraFootprintOnWall: {
    leftM: number;
    rightM: number;
    bottomFromFloorM: number;
    topFromFloorM: number;
    widthM: number;
    heightM: number;
    coversProjectedImage: boolean | null;
  } | null;
  chassisCollisionDistM: number;
}

export function evaluateOpticalPhysicalCompliance(inp: SharedRoomPlacementInput): SharedPlacementEvaluationResult {
  const {
    roomWidthM,
    roomLengthM,
    roomHeightM,
    surfaceWidthM,
    surfaceHeightM,
    surfaceBottomFromFloorM,
    projectorProfile,
    projectorPosM,
    projectorPitchDeg,
    projectorCalc,
    cameraProfile,
    cameraPosM,
    cameraPitchDeg,
    cameraCalc,
    obstacle,
  } = inp;

  const checks: PhysicalComplianceCheckItem[] = [];

  // Projektörün duvardaki fiziksel görüntü sınırları
  let projectorFootprintOnWall: SharedPlacementEvaluationResult['projectorFootprintOnWall'] = null;
  const imgW = projectorCalc.nominalImageWidthM;
  const imgH = projectorCalc.nominalImageHeightM;
  const [pjX, pjY, pjZ] = projectorPosM;

  if (imgW !== null && imgH !== null) {
    const pitchShiftY = pjZ * Math.tan((projectorPitchDeg * Math.PI) / 180);
    const shiftXM = projectorCalc.lensShiftAnalysis.horizontalShiftMeters ?? 0;
    const shiftYM = projectorCalc.lensShiftAnalysis.verticalShiftMeters ?? 0;
    // Offset konvansiyonu biliniyorsa offset'i kullan, yoksa merkez eksenini baz al
    const offsetCenterY = projectorCalc.offsetAnalysis.imageCenterOffsetFromLensAxisM ?? 0;
    const centerX = pjX + shiftXM;
    const centerY = pjY + offsetCenterY + shiftYM + pitchShiftY;
    const leftM = round(centerX - imgW / 2, 3);
    const rightM = round(centerX + imgW / 2, 3);
    const bottomFromFloorM = round(centerY - imgH / 2, 3);
    const topFromFloorM = round(centerY + imgH / 2, 3);

    const wallHalfW = roomWidthM / 2;
    const exceedsWallBounds =
      leftM < -wallHalfW - 0.01 ||
      rightM > wallHalfW + 0.01 ||
      bottomFromFloorM < -0.01 ||
      topFromFloorM > roomHeightM + 0.01;

    projectorFootprintOnWall = {
      leftM,
      rightM,
      bottomFromFloorM,
      topFromFloorM,
      widthM: imgW,
      heightM: imgH,
      exceedsWallBounds,
    };
  }

  // Kameranın karşı duvardaki görüş alanı sınırları
  let cameraFootprintOnWall: SharedPlacementEvaluationResult['cameraFootprintOnWall'] = null;
  const camW = cameraCalc.horizontalCoverageM;
  const camH = cameraCalc.verticalCoverageM;
  const [camX, camY, camZ] = cameraPosM;
  if (camW !== null && camH !== null) {
    const camPitchShiftY = camZ * Math.tan((cameraPitchDeg * Math.PI) / 180);
    const cLeft = round(camX - camW / 2, 3);
    const cRight = round(camX + camW / 2, 3);
    const cBot = round(camY + camPitchShiftY - camH / 2, 3);
    const cTop = round(camY + camPitchShiftY + camH / 2, 3);
    const coversProjectedImage =
      projectorFootprintOnWall !== null
        ? cLeft <= projectorFootprintOnWall.leftM + 0.02 &&
          cRight >= projectorFootprintOnWall.rightM - 0.02 &&
          cBot <= projectorFootprintOnWall.bottomFromFloorM + 0.02 &&
          cTop >= projectorFootprintOnWall.topFromFloorM - 0.02
        : null;
    cameraFootprintOnWall = {
      leftM: cLeft,
      rightM: cRight,
      bottomFromFloorM: cBot,
      topFromFloorM: cTop,
      widthM: camW,
      heightM: camH,
      coversProjectedImage,
    };
  }

  // 1. Görüntü duvar sınırını aşıyor mu?
  if (!projectorFootprintOnWall) {
    checks.push({
      id: 'IMAGE_WITHIN_WALL_BOUNDS',
      titleTr: '1. Görüntü Duvar Sınırı Kontrolü',
      questionTr: 'Görüntü duvar sınırını aşıyor mu?',
      status: 'UNKNOWN',
      measuredOrCalculatedValue: 'UNKNOWN',
      limitOrRequirement: `Duvar: ${roomWidthM}m × ${roomHeightM}m`,
      detailTr: 'Projektör görüntü boyutları eksik veri nedeniyle hesaplanamadı (UNKNOWN).',
    });
  } else {
    const fitsTargetSurface =
      projectorFootprintOnWall.leftM >= -surfaceWidthM / 2 - 0.02 &&
      projectorFootprintOnWall.rightM <= surfaceWidthM / 2 + 0.02 &&
      projectorFootprintOnWall.bottomFromFloorM >= surfaceBottomFromFloorM - 0.02 &&
      projectorFootprintOnWall.topFromFloorM <= surfaceBottomFromFloorM + surfaceHeightM + 0.02;

    checks.push({
      id: 'IMAGE_WITHIN_WALL_BOUNDS',
      titleTr: '1. Görüntü Duvar Sınırı Kontrolü',
      questionTr: 'Görüntü duvar sınırını aşıyor mu?',
      status: projectorFootprintOnWall.exceedsWallBounds ? 'FAIL' : fitsTargetSurface ? 'PASS' : 'WARNING',
      measuredOrCalculatedValue: `X:[${projectorFootprintOnWall.leftM}..${projectorFootprintOnWall.rightM}m], Y:[${projectorFootprintOnWall.bottomFromFloorM}..${projectorFootprintOnWall.topFromFloorM}m]`,
      limitOrRequirement: `Duvar X:[${(-roomWidthM / 2).toFixed(2)}..+${(roomWidthM / 2).toFixed(2)}m], Y:[0..${roomHeightM}m]`,
      detailTr: projectorFootprintOnWall.exceedsWallBounds
        ? 'FAIL: Projeksiyon görüntüsü fiziksel oda duvarı/tavan/zemin sınırlarını aşıyor!'
        : fitsTargetSurface
        ? 'PASS: Projeksiyon görüntüsü hem duvar hem de hedef perde sınırları içindedir.'
        : 'WARNING: Görüntü fiziksel duvar içindedir ancak hedef perde çerçevesinin dışına taşıyor.',
    });
  }

  // 2. Projeksiyon yüzeyi oda sınırları içinde mi?
  const surfTop = round(surfaceBottomFromFloorM + surfaceHeightM, 3);
  const surfFitsRoom =
    surfaceWidthM <= roomWidthM + 0.001 &&
    surfaceBottomFromFloorM >= -0.001 &&
    surfTop <= roomHeightM + 0.001;
  checks.push({
    id: 'SURFACE_WITHIN_ROOM_BOUNDS',
    titleTr: '2. Projeksiyon Yüzeyi – Oda Sınırı Uyumu',
    questionTr: 'Projeksiyon yüzeyi oda sınırları içinde mi?',
    status: surfFitsRoom ? 'PASS' : 'FAIL',
    measuredOrCalculatedValue: `Perde: ${surfaceWidthM}m × ${surfaceHeightM}m (Yerden ${surfaceBottomFromFloorM}–${surfTop}m)`,
    limitOrRequirement: `Oda Kesiti: ${roomWidthM}m × ${roomHeightM}m`,
    detailTr: surfFitsRoom
      ? 'PASS: Hedef projeksiyon yüzeyi fiziksel oda duvarı sınırları içindedir.'
      : 'FAIL: Hedef projeksiyon yüzeyi oda genişliğini veya tavan yüksekliğini aşıyor!',
  });

  // 3. Kamera görüş konisi fiziksel engelle kesişiyor mu?
  if (!cameraFootprintOnWall) {
    checks.push({
      id: 'CAMERA_FOV_OBSTACLE_CLEARANCE',
      titleTr: '3. Kamera Görüş Konisi Engel & Cihaz Çakışma Kontrolü',
      questionTr: 'Kamera görüş konisi fiziksel engelle kesişiyor mu?',
      status: 'UNKNOWN',
      measuredOrCalculatedValue: 'UNKNOWN',
      limitOrRequirement: 'Engelsiz optik görüş hattı',
      detailTr: 'Kamera FOV verisi UNKNOWN olduğundan görüş konisi kesişim analizi yapılamadı.',
    });
  } else {
    // Projektör kasası veya sahnedeki engel kamera konisinin içinde mi?
    let obstacleHitsCam = false;
    let obstacleDetail = 'Kamera görüş konisi önünde engel tespit edilmedi (PASS).';

    if (obstacle?.enabled && obstacle.zFromWallM > 0.05 && obstacle.zFromWallM < camZ) {
      const t = (camZ - obstacle.zFromWallM) / Math.max(0.1, camZ);
      const beamTopAtObs = camY + t * (cameraFootprintOnWall.topFromFloorM - camY);
      const beamBotAtObs = camY + t * (cameraFootprintOnWall.bottomFromFloorM - camY);
      const beamLeftAtObs = camX + t * (cameraFootprintOnWall.leftM - camX);
      const beamRightAtObs = camX + t * (cameraFootprintOnWall.rightM - camX);
      const xOverlap =
        obstacle.xM + obstacle.widthM / 2 >= beamLeftAtObs &&
        obstacle.xM - obstacle.widthM / 2 <= beamRightAtObs;
      const yOverlap = obstacle.heightM >= beamBotAtObs && 0 <= beamTopAtObs;
      if (xOverlap && yOverlap) {
        obstacleHitsCam = true;
        obstacleDetail = `WARNING/FAIL: Sahnedeki [${obstacle.name}] (Perdeye Z=${obstacle.zFromWallM}m, Boy=${obstacle.heightM}m) kamera görüş konisinin içine giriyor!`;
      }
    }

    checks.push({
      id: 'CAMERA_FOV_OBSTACLE_CLEARANCE',
      titleTr: '3. Kamera Görüş Konisi Engel Kontrolü',
      questionTr: 'Kamera görüş konisi fiziksel engelle kesişiyor mu?',
      status: obstacleHitsCam ? 'FAIL' : 'PASS',
      measuredOrCalculatedValue: obstacleHitsCam ? `Engel Kesişimi (${obstacle?.name})` : '0 Kesişim (Temiz Hat)',
      limitOrRequirement: 'Kamera → Yüzey arası açık görüş hattı',
      detailTr: obstacleDetail,
    });
  }

  // 4. Lensin çalışma mesafesi uygun mu?
  checks.push({
    id: 'LENS_WORKING_DISTANCE',
    titleTr: '4. Lens Optik Çalışma Mesafesi Kontrolü',
    questionTr: 'Lensin çalışma mesafesi uygun mu?',
    status: projectorCalc.lensRangeCheck.status,
    measuredOrCalculatedValue:
      projectorCalc.nominalDistanceM !== null
        ? `D = ${projectorCalc.nominalDistanceM} m (TR: ${projectorCalc.requiredThrowRatio ?? projectorCalc.nominalThrowRatio}:1)`
        : 'UNKNOWN',
    limitOrRequirement:
      projectorCalc.minDistanceM !== null && projectorCalc.maxDistanceM !== null
        ? `[${projectorCalc.minDistanceM} m – ${projectorCalc.maxDistanceM} m] (TR ${projectorCalc.minThrowRatio}–${projectorCalc.maxThrowRatio}:1)`
        : 'UNKNOWN',
    detailTr: projectorCalc.lensRangeCheck.summaryTr,
  });

  // 5. Cihaz montaj konumu uygun mu?
  const pjInsideRoom =
    Math.abs(pjX) <= roomWidthM / 2 - 0.15 &&
    pjY >= 0.1 &&
    pjY <= roomHeightM - 0.08 &&
    pjZ >= 0.3 &&
    pjZ <= roomLengthM - 0.15;
  const camInsideRoom =
    Math.abs(camX) <= roomWidthM / 2 - 0.1 &&
    camY >= 0.1 &&
    camY <= roomHeightM - 0.05 &&
    camZ >= 0.2 &&
    camZ <= roomLengthM - 0.1;
  const chassisCollisionDistM = round(
    Math.hypot(pjX - camX, pjY - camY, pjZ - camZ),
    3
  );
  const devicesCollide = chassisCollisionDistM < 0.35;

  checks.push({
    id: 'DEVICE_MOUNT_POSITION',
    titleTr: '5. Cihaz Montaj Konumu ve Çakışma Kontrolü',
    questionTr: 'Cihaz montaj konumu uygun mu?',
    status: !pjInsideRoom || !camInsideRoom || devicesCollide ? 'FAIL' : 'PASS',
    measuredOrCalculatedValue: `PJ:[${pjX}, ${pjY}, ${pjZ}m] · Cam:[${camX}, ${camY}, ${camZ}m] (Aralık: ${chassisCollisionDistM}m)`,
    limitOrRequirement: `Oda İçi ve Cihazlar Arası ≥ 0.35m`,
    detailTr: devicesCollide
      ? `FAIL: Projektör ve kamera kasaları birbiriyle çakışıyor (merkez mesafesi ${chassisCollisionDistM} m < 0.35 m)!`
      : !pjInsideRoom || !camInsideRoom
      ? 'FAIL: Cihazlardan en az biri fiziksel oda duvarı/tavan sınırlarının dışında konumlandırılmış!'
      : 'PASS: Projektör ve kamera montaj koordinatları fiziksel oda hacmi içinde ve birbirinden bağımsızdır.',
  });

  // 6. Tavan ve duvar mesafeleri yeterli mi?
  const pjDistToCeilingM = round(roomHeightM - pjY, 3);
  const pjDistToRearWallM = round(roomLengthM - pjZ, 3);
  const pjDistToSideWallM = round(roomWidthM / 2 - Math.abs(pjX), 3);
  const wallCeilOk = pjDistToCeilingM >= 0.12 && pjDistToRearWallM >= 0.25 && pjDistToSideWallM >= 0.25;
  checks.push({
    id: 'CEILING_WALL_CLEARANCE',
    titleTr: '6. Tavan ve Duvar Montaj Mesafeleri',
    questionTr: 'Tavan ve duvar mesafeleri yeterli mi?',
    status: wallCeilOk ? 'PASS' : pjDistToCeilingM >= 0 && pjDistToRearWallM >= 0.1 ? 'WARNING' : 'FAIL',
    measuredOrCalculatedValue: `Tavana: ${pjDistToCeilingM}m · Arka Duvara: ${pjDistToRearWallM}m · Yan Duvara: ${pjDistToSideWallM}m`,
    limitOrRequirement: 'Tavan ≥ 0.12m, Arka/Yan Duvar ≥ 0.25m',
    detailTr: wallCeilOk
      ? 'PASS: Cihazın tavan, arka duvar ve yan duvar montaj mesafeleri yeterlidir.'
      : 'WARNING/FAIL: Cihaz arka duvara veya tavana kablo/askı montajı için fazla yakın.',
  });

  // 7. Cihaz kasası ve bakım boşluğu uygun mu?
  const mech = projectorProfile.mechanical;
  if (
    mech.widthMm === null ||
    mech.heightMm === null ||
    mech.depthMm === null ||
    mech.coolingClearanceRearMm === null ||
    mech.coolingClearanceSideMm === null
  ) {
    checks.push({
      id: 'CHASSIS_COOLING_CLEARANCE',
      titleTr: '7. Cihaz Kasası ve Soğutma / Bakım Boşluğu',
      questionTr: 'Cihaz kasası ve bakım boşluğu uygun mu?',
      status: 'UNKNOWN',
      measuredOrCalculatedValue:
        mech.widthMm !== null ? `Kasa: ${mech.widthMm}×${mech.heightMm}×${mech.depthMm} mm` : 'Kasa Boyutu UNKNOWN',
      limitOrRequirement: 'Üretici soğutma boşluğu verisi gerekli',
      detailTr: 'Cihaz mekanik kasa boyutları veya üretici soğutma boşluğu (cooling clearance) verisi eksik olduğundan doğrulanamadı (UNKNOWN).',
    });
  } else {
    const reqRearM = (mech.depthMm / 2 + mech.coolingClearanceRearMm) / 1000;
    const reqSideM = (mech.widthMm / 2 + mech.coolingClearanceSideMm) / 1000;
    const coolingOk = pjDistToRearWallM >= reqRearM && pjDistToSideWallM >= reqSideM;
    checks.push({
      id: 'CHASSIS_COOLING_CLEARANCE',
      titleTr: '7. Cihaz Kasası ve Soğutma / Bakım Boşluğu',
      questionTr: 'Cihaz kasası ve bakım boşluğu uygun mu?',
      status: coolingOk ? 'PASS' : 'FAIL',
      measuredOrCalculatedValue: `Kasa: ${mech.widthMm}×${mech.depthMm}×${mech.heightMm}mm (${mech.weightKg ?? '?'}kg) · Arka Boşluk: ${pjDistToRearWallM}m`,
      limitOrRequirement: `Gereken Arka ≥ ${reqRearM.toFixed(2)}m, Yan ≥ ${reqSideM.toFixed(2)}m`,
      detailTr: coolingOk
        ? 'PASS: Cihaz kasası ve fan/soğutma bakım boşlukları üretici sınırlarını sağlıyor.'
        : 'FAIL: Arka veya yan duvar mesafesi cihazın soğutma havalandırma boşluğundan (cooling clearance) küçük!',
    });
  }

  // 8. Lens shift sınırları içinde mi? ve Offset konvansiyonu tanımlı mı?
  const shiftAndOffsetStatus: ComplianceStatus =
    projectorCalc.lensShiftAnalysis.status === 'FAIL'
      ? 'FAIL'
      : projectorCalc.offsetAnalysis.status === 'UNKNOWN' || projectorCalc.lensShiftAnalysis.status === 'UNKNOWN'
      ? 'UNKNOWN'
      : 'PASS';
  checks.push({
    id: 'LENS_SHIFT_WITHIN_LIMITS',
    titleTr: '8. Optik Lens Shift & Offset Konvansiyonu Kontrolü',
    questionTr: 'Lens shift sınırları içinde mi?',
    status: shiftAndOffsetStatus,
    measuredOrCalculatedValue: `Shift V:%${projectorCalc.lensShiftAnalysis.requestedVPct} H:%${projectorCalc.lensShiftAnalysis.requestedHPct} · Offset: ${
      projectorCalc.offsetAnalysis.offsetPct !== null ? `%${projectorCalc.offsetAnalysis.offsetPct}` : 'UNKNOWN'
    }`,
    limitOrRequirement: `Shift V:[${projectorCalc.lensShiftAnalysis.allowedVRangePct[0] ?? 'UNKNOWN'}..${projectorCalc.lensShiftAnalysis.allowedVRangePct[1] ?? 'UNKNOWN'}%] · Offset Ref: ${projectorCalc.offsetAnalysis.convention ?? 'UNKNOWN'}`,
    detailTr: `${projectorCalc.lensShiftAnalysis.summaryTr} | ${projectorCalc.offsetAnalysis.summaryTr}`,
  });

  // 9. İstenen görüntü boyutu optik olarak elde edilebiliyor mu?
  const canAchieveSize =
    projectorCalc.nominalImageWidthM !== null &&
    projectorCalc.minImageWidthM !== null &&
    projectorCalc.maxImageWidthM !== null &&
    projectorCalc.lensRangeCheck.inOpticalRange === true;
  checks.push({
    id: 'OPTICAL_IMAGE_SIZE_ACHIEVABLE',
    titleTr: '9. Hedef Görüntü Boyutu Optik Elde Edilebilirlik',
    questionTr: 'İstenen görüntü boyutu optik olarak elde edilebiliyor mu?',
    status:
      projectorCalc.nominalImageWidthM === null
        ? 'UNKNOWN'
        : canAchieveSize
        ? 'PASS'
        : 'FAIL',
    measuredOrCalculatedValue:
      projectorCalc.nominalImageWidthM !== null
        ? `${projectorCalc.nominalImageWidthM}m × ${projectorCalc.nominalImageHeightM}m (Diyagonal: ${projectorCalc.nominalDiagonalM}m)`
        : 'UNKNOWN',
    limitOrRequirement:
      projectorCalc.minImageWidthM !== null && projectorCalc.maxImageWidthM !== null
        ? `Optik Genişlik Aralığı: [${projectorCalc.minImageWidthM}m – ${projectorCalc.maxImageWidthM}m]`
        : 'UNKNOWN',
    detailTr:
      projectorCalc.nominalImageWidthM === null
        ? 'UNKNOWN: Optik parametreler eksik olduğundan görüntü boyutu doğrulanamadı.'
        : canAchieveSize
        ? `PASS: Hedef görüntü boyutu (${projectorCalc.nominalImageWidthM}m × ${projectorCalc.nominalImageHeightM}m) dijital ölçekleme olmadan optik zoom ile elde edilebiliyor.`
        : `FAIL: İstenen görüntü genişliği seçilen mesafede lensin optik sınırları [${projectorCalc.minImageWidthM}m – ${projectorCalc.maxImageWidthM}m] dışındadır!`,
  });

  const counts = {
    pass: checks.filter(c => c.status === 'PASS').length,
    warning: checks.filter(c => c.status === 'WARNING').length,
    fail: checks.filter(c => c.status === 'FAIL').length,
    unknown: checks.filter(c => c.status === 'UNKNOWN').length,
  };

  let overallStatus: ComplianceStatus = 'PASS';
  if (counts.fail > 0) overallStatus = 'FAIL';
  else if (counts.unknown > 0) overallStatus = 'UNKNOWN';
  else if (counts.warning > 0) overallStatus = 'WARNING';

  return {
    overallStatus,
    counts,
    checks,
    projectorFootprintOnWall,
    cameraFootprintOnWall,
    chassisCollisionDistM,
  };
}

export function resolveProjectorWatts(modelName?: string, fallbackW = 450, mode: 'normal' | 'eco' = 'normal'): number {
  if (!modelName) return fallbackW;
  const lower = modelName.toLowerCase();
  if (lower.includes('du4381') || lower.includes('4381z')) {
    return mode === 'eco' || lower.includes('eco') ? 380 : 530;
  }
  for (const prof of DEFAULT_PROJECTOR_PROFILES) {
    if (prof.model && lower.includes(prof.model.toLowerCase())) {
      if (mode === 'eco' && prof.electrical?.ecoPowerConsumptionW) return prof.electrical.ecoPowerConsumptionW;
      if (prof.electrical?.powerConsumptionW) return prof.electrical.powerConsumptionW;
    }
  }
  if (lower.includes('du9800') || lower.includes('9800z')) return 1900;
  if (lower.includes('rz990') || lower.includes('pt-rz990')) return 810;
  if (lower.includes('pu2010') || lower.includes('eb-pu2010')) return 800;
  if (lower.includes('pu1007') || lower.includes('eb-pu1007')) return 535;
  if (lower.includes('griffyn') || lower.includes('4k32')) return 2500;
  if (lower.includes('udx')) return 2750;
  return fallbackW;
}

export function resolveProjectorNativeContrast(modelName?: string): number | undefined {
  if (!modelName) return undefined;
  const lower = modelName.toLowerCase();
  // DU4381Z-ST için üretici yalnızca Full On/Off dinamik kontrast belirtir; native kontrast UNKNOWN (undefined)
  if (lower.includes('du4381') || lower.includes('4381z')) return undefined;
  for (const prof of DEFAULT_PROJECTOR_PROFILES) {
    if (prof.model && lower.includes(prof.model.toLowerCase())) {
      if (prof.general?.nativeContrastRatio) return prof.general.nativeContrastRatio;
    }
  }
  if (lower.includes('du9800') || lower.includes('9800z')) return 1250;
  if (lower.includes('rz990') || lower.includes('pt-rz990')) return 10000;
  if (lower.includes('pu2010') || lower.includes('eb-pu2010')) return 2000;
  return undefined;
}

export function resolveProjectorDynamicContrast(modelName?: string): number | undefined {
  if (!modelName) return undefined;
  const lower = modelName.toLowerCase();
  if (lower.includes('du4381') || lower.includes('4381z')) return 3000000;
  for (const prof of DEFAULT_PROJECTOR_PROFILES) {
    if (prof.model && lower.includes(prof.model.toLowerCase())) {
      if (prof.general?.dynamicContrastRatio) return prof.general.dynamicContrastRatio;
    }
  }
  if (lower.includes('du9800') || lower.includes('9800z')) return 10000;
  if (lower.includes('rz990') || lower.includes('pt-rz990')) return 10000;
  if (lower.includes('pu2010') || lower.includes('eb-pu2010')) return 2500000;
  return undefined;
}
