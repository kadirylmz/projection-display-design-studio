/**
 * Müşteri sunumu ve teknik rapor üretici motoru (HTML/Yazdırılabilir PDF + SVG diyagram gömme).
 * Kabul Testi 10: Dışa aktarılan raporlar doğru proje verilerini ve diyagramları içermelidir.
 * Dil desteği: Türkçe ('tr') ve İngilizce ('en').
 */
import { solveProjection } from './throw';
import { evaluatePhysicalCoverage } from './physicalCoverage';
import { compareLayoutScenarios, computeLuxSimulationGrid, sampleNinePointsFromLuxGrid } from './centralDesignModel';
import { computeLux, computeViewingQualityAnalysis, ViewingQualityResult } from './lux';
import {
  computeGeometricMappingSummary,
  computeLayout,
  computePixelMapSummary,
  createCurvedWarp,
  MappingSurfaceGeometry,
  ProjectorSlot,
} from './multiproj';
import { Cabinet, ledFromCabinets } from './led';
import { analyze, Circuit, Load, Supply } from './electrical';
import { toSvg } from './drawing';
import { electricalSingleLine, ledElevation, mappingDrawing } from './drawings';
import { layoutToSvg } from './exporters';
import { round } from './units';
import { InterProjectorAnalysis } from './interprojector';
import { validateReportConsistency, renderValidationEngineA4Html } from './reportValidation';
import { HUMAN_SILHOUETTE_NORM, clipPolygonToRect2D } from './fovProjection';
import { OpticalStudioReportSnapshot } from '../opticalDeviceStore';
import { resolveProjectorWatts, resolveProjectorNativeContrast } from './opticalDeviceEngine';
import {
  recommendProjectorAndLenses,
  computeEffectiveMultiProjectorPixelArea,
  computeSurfacePointLuxDistribution,
  evaluateSystemFeasibility,
  SurfacePointLuxResult,
  MultiProjectorEffectivePixelResult,
  SystemFeasibilityReport,
  ProjectorRecommendationResult,
} from './feasibility';

export type ReportLang = 'tr' | 'en';

export interface ReportSectionFlags {
  summary: boolean;
  room3d: boolean;
  architecturalPlan: boolean;
  interProjector: boolean;
  projection: boolean;
  lux: boolean;
  multiProjector: boolean;
  led: boolean;
  electrical: boolean;
  drawings2d: boolean;
  equipmentList: boolean;
  assumptionsAndWarnings: boolean;
  includePixelMapChain?: boolean;
  includeGeometricChain?: boolean;
  includeBrightnessChain?: boolean;
  includeViewingQuality?: boolean;
  includePointLuxMap?: boolean;
  includeFeasibilityAndRecs?: boolean;
  includeValidationEngine?: boolean;
  fovShadow?: boolean;
  opticalStudio?: boolean;
}

export const DEFAULT_SECTIONS: ReportSectionFlags = {
  summary: true,
  room3d: true,
  architecturalPlan: true,
  interProjector: false,
  projection: true,
  lux: true,
  multiProjector: true,
  led: true,
  electrical: true,
  drawings2d: true,
  equipmentList: true,
  assumptionsAndWarnings: true,
  includePixelMapChain: true,
  includeGeometricChain: true,
  includeBrightnessChain: true,
  includeViewingQuality: true,
  includePointLuxMap: true,
  includeFeasibilityAndRecs: true,
  includeValidationEngine: true,
  fovShadow: false,
  opticalStudio: true,
};

export interface ReportProjectMeta {
  companyName: string;
  reportTitle?: string;
  companyLogoDataUrl?: string;
  customerLogoDataUrl?: string;
  customer: string;
  projectName: string;
  location: string;
  category: string;
  date: string;
  revision: number;
  description: string;
  notes?: string;
  room3dSnapshotUrl?: string;
  room3dSnapshots?: string[];
  archPlanRotation?: 0 | 90 | 180 | 270;
}

export interface PhotometricReportSurface {
  surfaceId: string;
  surfaceName: string;
  surfaceType: string; // 'wall' | 'floor' | 'ceiling'
  widthM: number;
  heightM: number;
  projectorCount: number;
  avgLux: number;
  minLux: number;
  maxLux: number;
  uniformityU0: number; // Emin / Eavg
  uniformityU1: number; // Emin / Emax
  luminanceNits: number;
  luminanceFL: number;
  screenGain: number;
  ambientLux: number;
  ambientContrastRatio: number;
  isManualLux?: boolean;
  heatmapSnapshotUrl?: string;
  distributionRows?: {
    code: string;
    name?: string;
    rowName?: string;
    startX: number;
    endX: number;
    widthM: number;
    centerX: number;
    throwDistM: number;
    throwRatio: number;
    overlapText: string;
  }[];
  lumenStandard?: 'ansi' | 'iso' | 'center';
  nominalLumensPerProj?: number;
  totalNominalLumens?: number;
  isoEquivalentLumens?: number;
  opticalEfficiencyPct?: number;
  calibrationFactorPct?: number;
  netEfficiencyPct?: number;
  effectiveTotalLumens?: number;
  lostLumens?: number;
  theoreticalAvgLux?: number;
  nominalTheoreticalLux?: number;
  effectiveTheoreticalLux?: number;
  ninePointEqualLux?: number;
  ninePointWeightedLux?: number;
  gridAvgLux?: number;
  gridMinLux?: number;
  gridMaxLux?: number;
  gridUniformityU0Pct?: number;
  gridUniformityU1Pct?: number;
  gridLuminanceNits?: number;
  theoreticalEffectiveNits?: number;
  theoreticalAcr?: number;
  singleProjectorLux?: number;
  surfaceReflectance?: number;
  theoreticalNits?: number;
  idealNits?: number;
  ambientNits?: number;
  /** avgLux değerinin kaynağı (Teorik / Simüle LuxField / Ölçüm) — birbirinin yerine kullanılmaz */
  luxSource?: 'THEORETICAL' | 'SIMULATED_LUXFIELD' | 'MEASURED';
  /** Cihaz native kontrast oranı (örn. 2000 → 2000:1); yoksa gerçek ACR UNKNOWN */
  nativeContrast?: number | null;
  /** Cihaz doğal siyah seviyesi (cd/m²) — doğrudan ölçüm/katalog */
  nativeBlackNits?: number | null;
}

export interface SurfaceScenario {
  scenarioId: string;
  surfaceId: string;
  surfaceName: string;
  projectorCount: number;
  projectorModels: string[];
  lensModels: string[];
  unitLumens: number;
  unitPowerW: number;
  throwDistM: number;
  imageWidthM: number;
  imageHeightM: number;
  overlapPct: number;
  combinedW: number;
  combinedH: number;
  canvasW: number;
  canvasH: number;
  room?: { widthM: number; lengthM: number; heightM: number };
  coordinateSystemId?: string;
}

export interface ReportPayload {
  lang: ReportLang;
  reportMode?: 'design' | 'as_built';
  meta: ReportProjectMeta;
  sections: ReportSectionFlags;
  scenarios?: SurfaceScenario[];
  room3dSnapshotUrl?: string;
  room3dSnapshots?: string[];
  room3dNotes?: string;
  architecturalPlanSvg?: string;
  interProjectorAnalysis?: InterProjectorAnalysis;
  projection?: {
    screenName?: string;
    screenPhotoUrl?: string;
    projectorName: string;
    lensName: string;
    imageWidthM: number;
    distanceM: number;
    aspectW: number;
    aspectH: number;
    throwMin?: number;
    throwMax?: number;
    lensFrontProtrusionM?: number;
    ansiLumens?: number;
    resolution?: string;
    technology?: string;
    throwRatio?: number;
    verticalOffsetM?: number;
    horizontalOffsetM?: number;
  };
  lux?: {
    ansiLumens: number[];
    brightnessPct: number;
    widthM: number;
    heightM: number;
    gain: number;
    ambientLux: number;
  };
  photometricSurfaces?: PhotometricReportSurface[];
  projectionScreens?: Array<NonNullable<ReportPayload['projection']>>;
  mappingSlots?: ProjectorSlot[];
  mappingScreens?: {
    name: string;
    photoUrl?: string;
    slots: ProjectorSlot[];
    content?: { w: number; h: number };
    gamma?: number;
  }[];
  led?: {
    cabinet: Cabinet;
    cols: number;
    rows: number;
    spareFraction: number;
  };
  electrical?: {
    loads: Load[];
    circuits: Circuit[];
    supply: Supply;
  };
  equipmentList?: { category: string; manufacturer: string; model: string; qty: number; notes?: string }[];
  plannerSurfaces?: any[];
  enabledSurfaceIds?: string[];
  fovShadowReport?: {
    updatedAt?: string;
    deviceKind: string;
    surfaceWidthM: number;
    surfaceHeightM: number;
    devicePosM: [number, number, number];
    hfovDeg: number;
    vfovDeg: number;
    dfovDeg: number;
    incidenceAngleDeg: number;
    coveragePct: number;
    snapshot3dDataUrl?: string;
    capturedViews?: Array<{
      id: string;
      angle: 'iso' | 'top' | 'bottom' | 'side' | 'left' | 'front' | 'custom';
      label: string;
      dataUrl: string;
    }>;
    enabledPaftas?: {
      iso3d: boolean;
      topPlan: boolean;
      bottomPlan: boolean;
      sideSection: boolean;
      frontElevation: boolean;
    };
    shadow: {
      personHeightM: number;
      personWidthM: number;
      personDistFromScreenM: number;
      personDistFromDeviceM: number;
      personXM: number;
      screenBottomHeightM: number;
      deviceHeightFromFloorM: number;
      beamBottomAtScreenM: number;
      beamTopAtScreenM: number;
      beamBottomAtPersonM: number;
      beamTopAtPersonM: number;
      headClearanceM: number;
      shadowEntryDistFromScreenM: number;
      shadowEntryDistFromDeviceM: number;
      neverCastsShadow: boolean;
      isCastingShadow: boolean;
      intrusionHeightM: number;
      shadowRect2D?: [number, number, number, number] | null;
      shadowPolygonScene2D?: [number, number][];
      shadowPolygonFloor2D?: [number, number][];
      shadowBottomFromFloorM?: number;
      shadowTopFromFloorM?: number;
      shadowWidthM: number;
      shadowHeightM: number;
      shadowAreaM2: number;
      shadowCoveragePct: number;
      zoneStatusLabel: string;
      reportSummaryTr: string;
    };
  };
  opticalStudioReport?: OpticalStudioReportSnapshot;
}

const T: Record<ReportLang, Record<string, string>> = {
  tr: {
    reportTitle: 'AV MÜHENDİSLİK & TASARIM RAPORU',
    customer: 'Müşteri',
    project: 'Proje Adı',
    location: 'Konum',
    category: 'Kategori',
    date: 'Tarih',
    revision: 'Revizyon',
    summary: '1. Proje Özeti',
    room3d: '2. 3B Simülasyon & 2B Görsel Paftalar',
    archPlan: '3. 2B Mimari Yerleşim & CAD Paftası',
    projection: '4. Ekran, Projektör & Lens Hesapları',
    lux: '5. Lux & Parlaklık Analizi',
    multi: '6. Çoklu Projektör & Piksel Haritalama',
    led: '7. LED Duvar Spesifikasyonları',
    electrical: '8. Elektrik Yük & Tek Hat Şeması',
    drawings: '2B Teknik Çizimler',
    equipment: 'Ekipman Listesi',
    assumptions: '9. Şantiye Standartları, Varsayımlar & Uyarılar',
    interProjector: 'Projeksiyonlar Arası Montaj, Eksen ve Aralık Cetveli',
    projector: 'Projektör',
    lens: 'Lens',
    imgSize: 'Görüntü Boyutu (G × Y)',
    diagonal: 'Diagonal',
    throwRatio: 'Throw Ratio',
    optDist: 'Lens → Yüzey Mesafesi',
    chassisDist: 'Şasi Ön Yüzü → Yüzey',
    status: 'Durum',
    achievable: 'Ulaşılabilir',
    notAchievable: 'Fiziksel Sınır Dışı',
    totalFlux: 'Toplam Işık Akısı',
    illuminance: 'Ortalama Aydınlatma (Lux)',
    luminance: 'Ekran Parlaklığı (Nit / fL)',
    canvasRes: 'Birleşik Kanvas Çözünürlüğü',
    overlapCount: 'Örtüşme Bölgesi Sayısı',
    physSize: 'Fiziksel Boyut',
    nativeRes: 'Native Çözünürlük',
    cabinets: 'Kabin Adedi (+Yedek)',
    powerWeight: 'Güç (Tipik/Maks) & Ağırlık',
    totalPower: 'Toplam Güç / Talep Gücü',
    mainBreaker: 'Önerilen Ana Kesici',
    item: 'Kalem',
    qty: 'Adet',
    notes: 'Notlar',
  },
  en: {
    reportTitle: 'AV ENGINEERING & DESIGN REPORT',
    customer: 'Customer',
    project: 'Project Name',
    location: 'Location',
    category: 'Category',
    date: 'Date',
    revision: 'Revision',
    summary: '1. Project Summary',
    room3d: '2. 3D Simulation & 2D Visual Layouts',
    archPlan: '3. Architectural Layout & CAD Plan',
    projection: '4. Screen, Projector & Lens Calculations',
    lux: '5. Photometric (Lux & Brightness) Analysis',
    multi: '6. Multi-Projector & Pixel Mapping',
    led: '7. LED Wall Specifications',
    electrical: '8. Electrical Load & Single-Line Diagram',
    drawings: '2D Technical Drawings',
    equipment: 'Equipment List',
    assumptions: '9. Site Standards, Assumptions & Warnings',
    interProjector: 'Inter-Projector Spacing & Mechanical Installation Schedule',
    projector: 'Projector',
    lens: 'Lens',
    imgSize: 'Image Dimensions (W × H)',
    diagonal: 'Diagonal',
    throwRatio: 'Throw Ratio',
    optDist: 'Lens-to-Surface Distance',
    chassisDist: 'Chassis-to-Surface Distance',
    status: 'Status',
    achievable: 'Achievable',
    notAchievable: 'Out of Physical Limits',
    totalFlux: 'Total Luminous Flux',
    illuminance: 'Average Illuminance (Lux)',
    luminance: 'Screen Luminance (Nits / fL)',
    canvasRes: 'Combined Canvas Resolution',
    overlapCount: 'Overlap Region Count',
    physSize: 'Physical Dimensions',
    nativeRes: 'Native Resolution',
    cabinets: 'Cabinet Quantity (+Spare)',
    powerWeight: 'Power (Typ/Max) & Weight',
    totalPower: 'Total Power / Demand Power',
    mainBreaker: 'Recommended Main Breaker',
    item: 'Item',
    qty: 'Qty',
    notes: 'Notes',
  },
};

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function generateSurfaceMultiSvg(s: any): string {
  const wM = +(s.effectiveWidthM || s.widthM || 10).toFixed(2);
  const hM = +(s.effectiveHeightM || s.heightM || 4).toFixed(2);
  const cols = Math.max(1, s.cols || 1);
  const rows = Math.max(1, s.rows || 1);
  const singleW = +(s.singleProjWidthM || (wM / cols)).toFixed(2);
  const singleH = +(s.singleProjHeightM || (hM / rows)).toFixed(2);
  const ovX = s.overlapX || 15;
  const ovY = s.overlapY || 10;

  const ovRatioX = s.projW && s.projW > 0 ? (s.ovPxX || 0) / s.projW : ovX / 100;
  const ovRatioY = s.projH && s.projH > 0 ? (s.ovPxY || 0) / s.projH : ovY / 100;
  const stepW_M = cols > 1 ? singleW * (1 - ovRatioX) : singleW;
  const stepH_M = rows > 1 ? singleH * (1 - ovRatioY) : singleH;

  const totalOptW = cols === 1 ? singleW : (cols - 1) * stepW_M + singleW;
  const totalOptH = rows === 1 ? singleH : (rows - 1) * stepH_M + singleH;
  const boundW_M = Math.max(wM, totalOptW);
  const boundH_M = Math.max(hM, totalOptH);

  const pad = 46;
  const canvasW = 920;
  const aspect = boundW_M / Math.max(0.4, boundH_M);
  const drawW = canvasW - pad * 2;
  const drawH = Math.max(170, Math.min(380, Math.round(drawW / aspect)));
  const canvasH = drawH + pad * 2 + 34;

  const scaleX = drawW / boundW_M;
  const scaleY = drawH / boundH_M;
  const surfOffsetX = pad + ((boundW_M - wM) / 2) * scaleX;
  const surfOffsetY = pad + ((boundH_M - hM) / 2) * scaleY;
  const projOffsetX = pad + ((boundW_M - totalOptW) / 2) * scaleX;
  const projOffsetY = pad + ((boundH_M - totalOptH) / 2) * scaleY;

  const rects: string[] = [];
  const overlaps: string[] = [];
  const labels: string[] = [];

  const bgRect = '<rect x="' + surfOffsetX.toFixed(1) + '" y="' + surfOffsetY.toFixed(1) + '" width="' + (wM * scaleX).toFixed(1) + '" height="' + (hM * scaleY).toFixed(1) + '" fill="#0f172a" stroke="#64748b" stroke-width="2" stroke-dasharray="6 4"/>';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const xM = cols === 1 ? 0 : c * stepW_M;
      const yM = rows === 1 ? 0 : r * stepH_M;
      const xPx = projOffsetX + xM * scaleX;
      const yPx = projOffsetY + yM * scaleY;
      const wPx = singleW * scaleX;
      const hPx = singleH * scaleY;

      rects.push('<rect x="' + xPx.toFixed(1) + '" y="' + yPx.toFixed(1) + '" width="' + wPx.toFixed(1) + '" height="' + hPx.toFixed(1) + '" fill="' + (s.color || '#38bdf8') + '" fill-opacity="0.18" stroke="' + (s.color || '#38bdf8') + '" stroke-width="2"/>');

      const cx = xPx + wPx / 2;
      const cy = yPx + hPx / 2;
      labels.push(
        '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="4.5" fill="#fde047" stroke="#020617" stroke-width="1.2"/>' +
        '<line x1="' + (cx - 9).toFixed(1) + '" y1="' + cy.toFixed(1) + '" x2="' + (cx + 9).toFixed(1) + '" y2="' + cy.toFixed(1) + '" stroke="#fde047" stroke-width="1.4"/>' +
        '<line x1="' + cx.toFixed(1) + '" y1="' + (cy - 9).toFixed(1) + '" x2="' + cx.toFixed(1) + '" y2="' + (cy + 9).toFixed(1) + '" stroke="#fde047" stroke-width="1.4"/>' +
        '<text x="' + cx.toFixed(1) + '" y="' + (cy - 12).toFixed(1) + '" font-size="11.5" fill="#f8fafc" font-weight="bold" font-family="system-ui, sans-serif" text-anchor="middle">PJ ' + (c + 1) + (rows > 1 ? '.' + (r + 1) : '') + '</text>' +
        '<text x="' + cx.toFixed(1) + '" y="' + (cy + 19).toFixed(1) + '" font-size="10" fill="#94a3b8" font-family="monospace" text-anchor="middle">' + (s.customW || 1920) + '×' + (s.customH || 1200) + ' px</text>'
      );

      if (c < cols - 1) {
        const nextXPx = projOffsetX + (c + 1) * stepW_M * scaleX;
        const ovWPx = (xPx + wPx) - nextXPx;
        if (ovWPx > 0) {
          overlaps.push(
            '<rect x="' + nextXPx.toFixed(1) + '" y="' + yPx.toFixed(1) + '" width="' + ovWPx.toFixed(1) + '" height="' + hPx.toFixed(1) + '" fill="#22c55e" fill-opacity="0.35" stroke="#16a34a" stroke-width="1.2" stroke-dasharray="3 3"/>' +
            '<text x="' + (nextXPx + ovWPx / 2).toFixed(1) + '" y="' + (yPx + hPx - 8).toFixed(1) + '" font-size="9" fill="#4ade80" font-family="sans-serif" font-weight="bold" text-anchor="middle">%' + ovX + ' Blend</text>'
          );
        }
      }

      if (r < rows - 1) {
        const nextYPx = projOffsetY + (r + 1) * stepH_M * scaleY;
        const ovHPx = (yPx + hPx) - nextYPx;
        if (ovHPx > 0) {
          overlaps.push(
            '<rect x="' + xPx.toFixed(1) + '" y="' + nextYPx.toFixed(1) + '" width="' + wPx.toFixed(1) + '" height="' + ovHPx.toFixed(1) + '" fill="#facc15" fill-opacity="0.22" stroke="#eab308" stroke-width="1.2" stroke-dasharray="3 3"/>'
          );
        }
      }
    }
  }

  const dimTop = '<text x="' + (canvasW / 2).toFixed(1) + '" y="' + (pad - 14).toFixed(1) + '" font-size="11.5" fill="#cbd5e1" font-family="monospace" font-weight="bold" text-anchor="middle">Yüzey Açınım Genişliği: ' + wM + ' m | Yükseklik: ' + hM + ' m</text>';
  const dimBot = '<text x="' + (canvasW / 2).toFixed(1) + '" y="' + (canvasH - 12).toFixed(1) + '" font-size="10.5" fill="#94a3b8" font-family="monospace" text-anchor="middle">Optik Lens Atımı: D = ' + s.throwDistM + 'm (TR: ' + s.throwRatio + ':1) · Çözünürlük: ' + (s.netW || '—') + '×' + (s.netH || '—') + ' px (' + (s.distMmPerPx || '—') + ' mm/px)</text>';

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + canvasW + ' ' + canvasH + '" width="100%" height="auto" style="max-height: 380px; display: block; margin: auto;">' +
    '<rect width="100%" height="100%" fill="#070b14"/>' +
    bgRect +
    rects.join('') +
    overlaps.join('') +
    labels.join('') +
    dimTop +
    dimBot +
  '</svg>';
}

function renderViewingQualityA4Html(
  vq: ViewingQualityResult,
  uniformityContext?: { sourceLabel?: string; gridU0Pct?: number; gridU1Pct?: number }
): string {
  const escH = (val: string) => String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ppdH = vq.horizontalFovDeg > 0 ? round(vq.resW / vq.horizontalFovDeg, 1) : vq.ppd;
  const ppdV = vq.verticalFovDeg > 0 ? round(vq.resH / vq.verticalFovDeg, 1) : vq.ppd;
  const arcminH = ppdH > 0 ? round(60 / ppdH, 2) : vq.arcminPerPixel;
  const arcminV = ppdV > 0 ? round(60 / ppdV, 2) : vq.arcminPerPixel;
  const minPpd = Math.min(ppdH, ppdV);
  const dualSharpnessNote = minPpd < 20 ? '⚠ Düşük Eksen (<20 PPD)' : vq.sharpnessLabel;
  const uSrcLabel = uniformityContext?.sourceLabel || '9-Nokta LuxField';
  const gridUNote =
    typeof uniformityContext?.gridU0Pct === 'number' && uniformityContext.gridU0Pct > 0
      ? ` · 288-Nokta Grid: U0 %${uniformityContext.gridU0Pct} / U1 %${uniformityContext.gridU1Pct ?? '—'}`
      : '';
  return [
    '<div style="margin-top: 8px; break-inside: avoid; page-break-inside: avoid;">',
    '  <div style="font-size: 10.5px; font-weight: 700; color: #0e7490; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; display: flex; justify-content: space-between;">',
    '    <span>👁️ 7 Adımlı İzleme &amp; Görüntü Kalitesi Analizi</span>',
    '    <span>Skor: %' + vq.overallQualityScorePct + ' · ' + escH(vq.overallQualityGrade) + '</span>',
    '  </div>',
    '  <table class="compact-table">',
    '    <tbody>',
    '      <tr><td><b>1. İzleme Mesafesi</b></td><td style="font-family:monospace;">' + vq.viewingDistanceM + 'm (' + vq.distanceRatioToHeight + '×H · İdeal ' + vq.optimalViewingDistMinM + '–' + vq.optimalViewingDistMaxM + 'm)</td><td style="text-align:right;">' + escH(vq.viewingDistanceStatus) + '</td></tr>',
    '      <tr><td><b>2. Görüş Açısı (FOV)</b></td><td style="font-family:monospace;">H ' + vq.horizontalFovDeg + '° · V ' + vq.verticalFovDeg + '° · D ' + vq.diagonalFovDeg + '°</td><td style="text-align:right; font-family:monospace;">Eksen dışı ' + vq.offAxisAngleDeg + '° (-%' + vq.offAxisLuminanceDropPct + ') · ' + escH(vq.fovCategory) + '</td></tr>',
    '      <tr><td><b>3. Görüntü Keskinliği (PPD)</b></td><td style="font-family:monospace;">Ort H: <b>' + ppdH + '</b> (' + arcminH + ' arcmin/px) · V: <b>' + ppdV + '</b> (' + arcminV + ' arcmin/px) · Merkez: <b>' + vq.ppdCenterH + '/' + vq.ppdCenterV + ' PPD</b> (' + round(60 / Math.max(0.1, vq.ppdCenterH), 2) + '/' + round(60 / Math.max(0.1, vq.ppdCenterV), 2) + ' arcmin) · Kenar: <b>' + vq.ppdEdgeH + '/' + vq.ppdEdgeV + ' PPD</b> (' + round(60 / Math.max(0.1, vq.ppdEdgeH), 2) + '/' + round(60 / Math.max(0.1, vq.ppdEdgeV), 2) + ' arcmin) [' + vq.resW + '×' + vq.resH + ']</td><td style="text-align:right; font-family:monospace;">%' + vq.sharpnessScorePct + ' · ' + escH(dualSharpnessNote) + '</td></tr>',
    '      <tr><td><b>4. Piksel Görünürlüğü &amp; Retina</b></td><td style="font-family:monospace;">' + vq.mmPerPx + ' mm/px (' + vq.ppi + ' PPI) · Retina ≥ ' + vq.minRetinaDistM + 'm (Referans: 60 PPD kalite eşiği)</td><td style="text-align:right;">İndeks ' + vq.pixelVisibilityIndex + ' · ' + escH(vq.pixelVisibilityLabel) + '</td></tr>',
    '      <tr><td><b>5. Tahmini Ortam Kontrastı (Simüle)</b></td><td style="font-family:monospace;">' + (vq.blackLevelNits > 0 ? 'Tahmini Ortam Kontrastı (Simüle): <b>~' + vq.ambientContrastRatio + ':1</b> (Simüle Beyaz+Ortam: ' + vq.whiteLevelNits + ' Nit · Ortam Yansıması: ' + vq.blackLevelNits + ' Nit · Cihaz doğal siyahı girilmedi → Gerçek ACR: UNKNOWN)' : 'Ekran ACR: UNKNOWN (Ortam ışığı / siyah seviyesi tanımlı değil)') + '</td><td style="text-align:right;">' + (vq.blackLevelNits > 0 ? escH(vq.contrastStandardGrade) : 'UNKNOWN') + '</td></tr>',
    '      <tr><td><b>6. Renk Uniformitesi</b></td><td style="font-family:monospace;">ΔE2000: ' + vq.deltaE2000 + ' · ΔCCT ±' + vq.deltaCCTKelvin + 'K [Simüle Model · NOT_MEASURED]</td><td style="text-align:right; font-family:monospace;">%' + vq.colorUniformityPct + ' · ' + escH(vq.colorUniformityLabel) + ' (Saha: DOĞRULANMADI)</td></tr>',
    '      <tr><td><b>7. Parlaklık Uniformitesi (' + escH(uSrcLabel) + ')</b></td><td style="font-family:monospace;">' + escH(uSrcLabel) + ': U0 %' + vq.luminanceUniformityU0Pct + ' · U1 %' + vq.luminanceUniformityU1Pct + gridUNote + ' · Kenar -%' + vq.centerToCornerDropPct + '</td><td style="text-align:right;">Blend ±%' + vq.blendZoneRipplePct + ' · ' + escH(vq.brightnessUniformityLabel) + ' (Saha: DOĞRULANMADI)</td></tr>',
    '      <tr class="highlight-cell"><td><b>8. TOPLAM KALİTE ÖZETİ</b></td><td style="font-family:monospace;">' + escH(vq.overallRecommendation) + ' <span style="color:#64748b; font-size:9px;">[Ağırlıklar: ACR %22 · PPD %18 · U0 %15 · ΔE %15 · Piksel %12 · Mesafe %10 · Açı %8]</span></td><td style="text-align:right; font-family:monospace;"><b>%' + vq.overallQualityScorePct + ' · ' + escH(vq.overallQualityGrade) + '</b></td></tr>',
    '    </tbody>',
    '  </table>',
    '</div>'
  ].join('\n');
}

function renderPointLuxDistributionA4Html(dist: SurfacePointLuxResult, theoreticalEffLux?: number): string {
  const escH = (val: string) => String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ninePtMean = Math.round(dist.zones9.reduce((a, z) => a + z.lux, 0) / Math.max(1, dist.zones9.length));
  const ninePtWeighted = round(
    dist.zones9.reduce((a, z) => {
      const w = z.zoneKind === 'center' ? 4 : z.zoneKind === 'edge' ? 2 : 1;
      return a + z.lux * w;
    }, 0) / 16,
    2
  );
  const ninePtMin = dist.zones9.length > 0 ? Math.min(...dist.zones9.map(z => z.lux)) : 0;
  const ninePtMax = dist.zones9.length > 0 ? Math.max(...dist.zones9.map(z => z.lux)) : 0;
  const ninePtU0 = ninePtMean > 0 ? round((ninePtMin / ninePtMean) * 100, 1) : 0;
  const ninePtU1 = ninePtMax > 0 ? round((ninePtMin / ninePtMax) * 100, 1) : 0;
  const rowsHtml = dist.zones9
    .map(
      pt =>
        '      <tr><td><b>' +
        escH(pt.label) +
        '</b></td><td style="text-align:right; font-family:monospace;">(' +
        pt.xM +
        'm, ' +
        pt.yM +
        'm)</td><td style="text-align:right; font-family:monospace;"><b>' +
        pt.lux +
        ' lx</b></td><td style="text-align:right; font-family:monospace;">' +
        pt.nits +
        ' nit / ' +
        pt.fl +
        ' fL</td><td style="text-align:right; font-family:monospace;">%' +
        pt.pctOfAvg +
        '</td><td>' +
        escH(pt.statusLabel) +
        '</td></tr>'
    )
    .join('\n');
  const theoLabel = typeof theoreticalEffLux === 'number' && theoreticalEffLux > 0 ? ` · Efektif Teorik (Φ_eff/A): ${theoreticalEffLux} lx` : '';
  return [
    '<div style="margin-top: 8px; break-inside: avoid; page-break-inside: avoid;">',
    '  <div style="font-size: 10.5px; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; display: flex; justify-content: space-between;">',
    '    <span>☀️ 9-Bölge Noktasal Lux &amp; Nit Dağılım Haritası (Simülasyon LuxField)</span>',
    '    <span>9-Nokta Eşit: ' +
      ninePtMean +
      ' lx · Ağırlıklı: ' +
      ninePtWeighted +
      ' lx · Min/Max: ' +
      ninePtMin +
      '/' +
      ninePtMax +
      ' lx · U0 %' +
      ninePtU0 +
      ' · U1 %' +
      ninePtU1 +
      ' (288-Nokta Grid Ort: ' +
      Math.round(dist.avgLux) +
      ' lx' + theoLabel + ')</span>',
    '  </div>',
    '  <table class="compact-table">',
    '    <thead><tr><th>Bölge (İç Merkez)</th><th style="text-align:right;">Bölge Merkezi (m)</th><th style="text-align:right;">Lux</th><th style="text-align:right;">Nit / fL</th><th style="text-align:right;">Ort. %</th><th>Durum</th></tr></thead>',
    '    <tbody>',
    rowsHtml,
    '    </tbody>',
    '  </table>',
    '  <div style="font-size:9px; color:#64748b; margin-top:3px;">Veri Kaynağı &amp; Yöntem Ayrımı: 9-Nokta Eşit = 1/9 aritmetik (' + ninePtMean + ' lx); 9-Nokta Ağırlıklı = Köşe 1/16, Kenar 2/16, Merkez 4/16 (' + ninePtWeighted + ' lx); 9-Nokta U0 = Min/Eşit Ort. (%' + ninePtU0 + '), U1 = Min/Max (%' + ninePtU1 + '); 288-Nokta LuxField Grid Alan Ort. = ' + Math.round(dist.avgLux) + ' lx' + theoLabel + '.</div>',
    '</div>',
  ].join('\n');
}

function renderMultiProjFeasibilityAndRecsA4Html(
  eff: MultiProjectorEffectivePixelResult,
  feas: SystemFeasibilityReport,
  recs: ProjectorRecommendationResult
): string {
  const escH = (val: string) => String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const feasRows = feas.categories
    .map(
      cat =>
        '      <tr><td><b>' +
        escH(cat.badgeText) +
        ' ' +
        escH(cat.title) +
        '</b></td><td style="font-family:monospace;">' +
        escH(cat.metricsText) +
        '</td><td>' +
        escH(cat.issues[0] || '') +
        '</td><td>' +
        escH(cat.actionText) +
        '</td></tr>'
    )
    .join('\n');
  const recRows = recs.alternatives
    .map(
      opt =>
        '      <tr><td><b>' +
        escH(opt.tierLabel) +
        ':</b> ' +
        escH(opt.manufacturer) +
        ' ' +
        escH(opt.projectorModel) +
        ' (%' +
        opt.matchScore +
        ')</td><td style="font-family:monospace;">' +
        escH(opt.lensModel) +
        ' (TR ' +
        opt.throwMin +
        '–' +
        opt.throwMax +
        ':1 → <b>' +
        opt.appliedTR +
        ':1</b>)</td><td style="text-align:right; font-family:monospace;">' +
        opt.totalProjectors +
        '× ' +
        opt.ansiLumens.toLocaleString('tr-TR') +
        ' lm</td><td style="text-align:right; font-family:monospace;">' +
        opt.estimatedAvgLux +
        ' lx · ACR ' +
        opt.estimatedACR +
        ':1</td><td style="text-align:right; font-family:monospace;">' +
        opt.effectiveCanvasW +
        '×' +
        opt.effectiveCanvasH +
        ' px (' +
        opt.mmPerPx +
        ' mm/px)</td></tr>'
    )
    .join('\n');
  return [
    '<div style="margin-top: 8px; break-inside: avoid; page-break-inside: avoid;">',
    '  <div style="font-size: 10.5px; font-weight: 700; color: #3730a3; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; display: flex; justify-content: space-between;">',
    '    <span>📐 Çoklu Projektör Overlap Düşülmüş Birleşik Raster Alanı</span>',
    '    <span>Birleşik Raster (Kırpma Öncesi): ' +
      eff.usableContentW +
      ' × ' +
      eff.usableContentH +
      ' px (' +
      eff.usableEffectiveMP +
      ' MP · Verim %' +
      eff.totalRetentionPct +
      ')</span>',
    '  </div>',
    '  <table class="compact-table">',
    '    <tbody>',
    '      <tr><td><b>Ham Projektör Toplamı</b></td><td style="font-family:monospace;">' +
      eff.totalProjectors +
      ' Projektör</td><td style="text-align:right; font-family:monospace;">' +
      eff.rawW +
      ' × ' +
      eff.rawH +
      ' px (' +
      eff.rawMP +
      ' MP)</td></tr>',
    '      <tr><td><b>Overlap Bindirme Kaybı</b></td><td style="font-family:monospace;">' +
      eff.overlapCountX +
      ' Yatay Bölge · ' +
      eff.overlapPhysicalWidthM +
      ' m (' +
      eff.overlapPhysicalAreaM2 +
      ' m²)</td><td style="text-align:right; font-family:monospace; color:#b45309;"><b>-' +
      eff.overlapLostMP +
      ' MP (-%' +
      eff.overlapLostPct +
      ')</b></td></tr>',
    '      <tr><td><b>Overlap Sonrası &amp; Geometrik Kayıp</b></td><td style="font-family:monospace;">Net ' +
      eff.netW +
      '×' +
      eff.netH +
      ' px · Keystone/Kavis Kaybı -%' +
      eff.geometricLossPct +
      '</td><td style="text-align:right; font-family:monospace;">' +
      eff.pxPerMeterW +
      ' px/m · ' +
      eff.mmPerPx +
      ' mm/px (' +
      eff.ppi +
      ' PPI)</td></tr>',
    '      <tr class="highlight-cell"><td><b>BİRLEŞİK RASTER ALANI (Kırpma Öncesi)</b></td><td style="font-family:monospace;">Toplam Pikseli Koruma Oranı: %' +
      eff.totalRetentionPct +
      '</td><td style="text-align:right; font-family:monospace;"><b>' +
      eff.usableContentW +
      ' × ' +
      eff.usableContentH +
      ' px (' +
      eff.usableEffectiveMP +
      ' MP)</b></td></tr>',
    '    </tbody>',
    '  </table>',
    '  <div style="font-size:9px; color:#64748b; margin-top:3px;">Yöntem Ayrımı: 9-Nokta Eşit Ort. = 1/9 aritmetik; 9-Nokta Ağırlıklı Ort. = Köşe 1/16, Kenar 2/16, Merkez 4/16; Model Alan Ort. = Efektif Lümen ÷ Alan (Φ_eff / A).</div>',
    '</div>',
    '<div style="margin-top: 8px; break-inside: avoid; page-break-inside: avoid;">',
    '  <div style="font-size: 10.5px; font-weight: 700; color: #9f1239; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; display: flex; justify-content: space-between;">',
    '    <span>⚠️ 5 Kategorili Hata &amp; Uygulanabilirlik Analizi</span>',
    '    <span>Skor: %' + feas.overallScorePct + ' · ' + escH(feas.overallVerdict) + '</span>',
    '  </div>',
    '  <table class="compact-table">',
    '    <thead><tr><th>Kategori</th><th>Ölçüt</th><th>Tespit</th><th>Mühendislik Önerisi</th></tr></thead>',
    '    <tbody>',
    feasRows,
    '    </tbody>',
    '  </table>',
    '  <div style="font-size:9px; color:#64748b; margin-top:3px;">Yöntem Ayrımı: 9-Nokta Eşit Ort. = 1/9 aritmetik; 9-Nokta Ağırlıklı Ort. = Köşe 1/16, Kenar 2/16, Merkez 4/16; Model Alan Ort. = Efektif Lümen ÷ Alan (Φ_eff / A).</div>',
    '</div>',
    '<div style="margin-top: 8px; break-inside: avoid; page-break-inside: avoid;">',
    '  <div style="font-size: 10.5px; font-weight: 700; color: #065f46; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; display: flex; justify-content: space-between;">',
    '    <span>🤖 Mekân Ölçülerine Göre Otomatik Projektör &amp; Lens Önerileri</span>',
    '    <span>Hedef TR: ' +
      recs.requiredTR +
      ':1 · İdeal Müze Bandı: [' +
      recs.idealMuseumTRRange[0] +
      '–' +
      recs.idealMuseumTRRange[1] +
      ':1]</span>',
    '  </div>',
    '  <table class="compact-table">',
    '    <thead><tr><th>Seviye &amp; Model</th><th>Önerilen Lens &amp; TR</th><th style="text-align:right;">Adet × Lümen</th><th style="text-align:right;">Lux / ACR</th><th style="text-align:right;">Efektif Çözünürlük</th></tr></thead>',
    '    <tbody>',
    recRows,
    '    </tbody>',
    '  </table>',
    '  <div style="font-size:9px; color:#64748b; margin-top:3px;">Yöntem Ayrımı: 9-Nokta Eşit Ort. = 1/9 aritmetik; 9-Nokta Ağırlıklı Ort. = Köşe 1/16, Kenar 2/16, Merkez 4/16; Model Alan Ort. = Efektif Lümen ÷ Alan (Φ_eff / A).</div>',
    '</div>',
  ].join('\n');
}

export function buildReportHtml(p: ReportPayload): string {
  const tr = T[p.lang];
  const m = p.meta;
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const blocks: string[] = [];

  // 1. PROJE ÖZETİ
  if (p.sections.summary) {
    let elAnalysis: ReturnType<typeof analyze> | null = null;
    if (p.electrical) {
      try {
        elAnalysis = analyze(p.electrical.loads, p.electrical.circuits, p.electrical.supply);
      } catch (err) {
        console.warn('Report electrical analyze fallback:', err);
      }
    }

    const plannerPjCount = (p.plannerSurfaces || []).reduce((a: number, s: any) => a + Math.max(1, (s.cols || 1) * (s.rows || 1)), 0);
    const photoPjCount = (p.photometricSurfaces || []).reduce((a, s) => a + Math.max(1, s.projectorCount || 1), 0);
    const elecPjCount = (p.electrical?.loads || []).reduce((a, l) => a + (l.name.toLowerCase().includes('projektör') ? Math.max(1, l.qty || 1) : 0), 0);
    const totalPj = (p.interProjectorAnalysis?.totalProjectors || 0)
      || plannerPjCount
      || photoPjCount
      || (p.mappingSlots && p.mappingSlots.length > 0 ? p.mappingSlots.length : 0)
      || elecPjCount
      || (p.projection ? 1 : 0);
    const fallbackPlannerW = plannerPjCount > 0 ? plannerPjCount * 1350 : 0;
    const totalW = (elAnalysis?.totalW && elAnalysis.totalW > 0 ? elAnalysis.totalW : 0)
      || (p.interProjectorAnalysis?.totalPowerW && p.interProjectorAnalysis.totalPowerW > 0 ? p.interProjectorAnalysis.totalPowerW : 0)
      || fallbackPlannerW;
    const totalIbA = elAnalysis?.totalIbA ?? (totalW > 0 ? (totalW / (230 * 0.95)) : 0);
    const rawRoom = p.interProjectorAnalysis?.roomDimensions;
    const roomDims = rawRoom && rawRoom.widthM > 0 && rawRoom.lengthM > 0 && rawRoom.heightM > 0 ? rawRoom : undefined;

    blocks.push(`<section class="report-section">
      <h2>${tr.summary}</h2>
      <p class="summary-desc">${esc(m.description || 'Bu rapor, mimari mekan içerisindeki projeksiyon yüzeylerinin, cihaz yerleşimlerinin, montaj eksen mesafelerinin ve elektrik altyapısının mühendislik detaylarını içermektedir.')}</p>
      
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-val text-sky">${totalPj} Adet</div>
          <div class="metric-lbl">Toplam Projektör</div>
        </div>
        <div class="metric-card">
          <div class="metric-val text-amber">${(totalW / 1000).toFixed(2)} kW</div>
          <div class="metric-lbl">Toplam Kurulu Güç (${Math.round(totalW)} W)</div>
        </div>
        <div class="metric-card">
          <div class="metric-val text-rose">${p.electrical?.supply?.phases === 3 ? `${totalIbA.toFixed(2)} A/faz` : `${totalIbA.toFixed(1)} A`}</div>
          <div class="metric-lbl">${p.electrical?.supply?.phases === 3 ? `3-Faz Hat Akımı (L1/L2/L3 · ${Math.round(totalW)} W)` : 'Toplam İşletme Akımı (Ib)'}</div>
        </div>
        ${roomDims ? `
        <div class="metric-card">
          <div class="metric-val text-purple">${roomDims.widthM}m × ${roomDims.lengthM}m × ${roomDims.heightM}m</div>
          <div class="metric-lbl">Oda Ebatları (G × U × Y)</div>
        </div>` : ''}
      </div>
      
      ${m.notes ? `<div class="note-box"><b>${tr.notes}:</b> ${esc(m.notes)}</div>` : ''}
    </section>`);
  }

  // 2. 3B SİMÜLASYON & PERSPEKTİF ODA GÖRÜNÜŞÜ (Seçiliyse)
  const snapshots: string[] = (p.room3dSnapshots && p.room3dSnapshots.length > 0)
    ? p.room3dSnapshots
    : (m.room3dSnapshots && m.room3dSnapshots.length > 0)
      ? m.room3dSnapshots
      : (p.room3dSnapshotUrl || m.room3dSnapshotUrl ? [p.room3dSnapshotUrl || m.room3dSnapshotUrl!] : []);

  if (p.sections.room3d && (snapshots.length > 0 || p.interProjectorAnalysis)) {
    blocks.push(`<section class="report-section room3d-section">
      <h2>${tr.room3d}</h2>
      ${snapshots.length > 0 ? `
        <div class="three-d-gallery">
          ${snapshots.map((url, idx) => `
            <div class="three-d-card">
              <div class="three-d-card-label">Görsel #${idx + 1}</div>
              <img src="${esc(url)}" alt="3B Simülasyon Görünüşü #${idx + 1}" class="three-d-img" />
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-3d-box">
          <p>📸 <b>3B & 2B Görsel Simülasyonlar:</b> <i>"3D Oda", "2B Açınım" veya "CAD Çizim" sekmelerinden "📋 Rapora Ekle" butonuna tıklayarak istediğiniz kamera açısından 3B simülasyonları ve 2B açınım paftalarını buraya aktarabilirsiniz.</i></p>
        </div>
      `}
    </section>`);
  }

  // 3. PROJEKSİYONLAR ARASI MONTAJ, EKSEN VE ARALIK CETVELİ (INTER-PROJECTOR SPACING)
  if (p.sections.interProjector && p.interProjectorAnalysis) {
    const ip = p.interProjectorAnalysis;

    // Yüzey Özeti Tablosu
    const surfSummaryRows = ip.surfaceStats.map(s => `
      <tr>
        <td><b>${esc(s.surfaceName)}</b></td>
        <td>${s.surfaceType === 'floor' ? 'Zemin (Tavandan Aşağı)' : 'Dikey Duvar'}</td>
        <td>${s.surfaceWidthM}m × ${s.surfaceHeightM}m</td>
        <td><b>${s.projectorCount} Adet</b> (${s.cols}×${s.rows})</td>
        <td>${s.singleWidthM}m × ${s.singleHeightM}m</td>
        <td class="highlight-cell">${s.spacingM > 0 ? `${s.spacingM} m` : '—'}</td>
        <td class="highlight-cell">${s.overlapWidthM} m (%${s.overlapPct})</td>
        <td>D = ${s.throwDistM} m</td>
        <td>H = ${s.mountHeightM} m</td>
        <td><b>${s.totalPowerW} W</b></td>
      </tr>
    `).join('');

    // Tek Tek Her Projektörün Detaylı Montaj Cetveli
    const pjDetailRows = ip.projectors.map(pj => `
      <tr>
        <td class="pj-id-cell"><b>${esc(pj.id)}</b></td>
        <td>${esc(pj.surfaceName)}</td>
        <td class="measure-cell">${pj.leftEdgeDistM.toFixed(2)} m</td>
        <td class="measure-cell highlight-cell"><b>${pj.spacingToNextM !== null ? `${pj.spacingToNextM.toFixed(2)} m` : '— (Son Cihaz)'}</b></td>
        <td class="measure-cell">${pj.overlapWidthM.toFixed(2)} m (%${pj.overlapPct})</td>
        <td class="measure-cell">${pj.throwDistM.toFixed(2)} m</td>
        <td class="measure-cell">${pj.mountHeightM.toFixed(2)} m</td>
        <td class="measure-cell">${pj.ceilingDistM.toFixed(2)} m</td>
        <td class="coord-cell">X: ${pj.worldPos[0].toFixed(2)}<br/>Z: ${pj.worldPos[2].toFixed(2)}</td>
        <td><span class="badge-circuit">${esc(pj.circuitId)}</span> (${esc(pj.circuitPhase)})</td>
      </tr>
    `).join('');

    // Köşe Geçişleri (Varsa)
    let cornerBlock = '';
    if (ip.cornerTransitions.length > 0) {
      const cornerRows = ip.cornerTransitions.map(c => `
        <tr>
          <td><b>${esc(c.cornerName)}</b></td>
          <td><b>${esc(c.fromProjId)} ↔ ${esc(c.toProjId)}</b></td>
          <td class="highlight-cell"><b>${c.euclideanDistM.toFixed(2)} m</b></td>
          <td>${c.angleDeg}°</td>
          <td>${esc(c.notes)}</td>
        </tr>
      `).join('');

      cornerBlock = `
        <h3 class="sub-heading">Köşe Geçişleri & 3B Lensler Arası Kuş Uçuşu Mesafeler</h3>
        <table class="compact-table">
          <thead>
            <tr>
              <th>Köşe Tanımı</th>
              <th>Cihaz Çifti</th>
              <th>3B Lens Mesafesi (D<sub>3D</sub>)</th>
              <th>Köşe Açısı</th>
              <th>Mühendislik Notu</th>
            </tr>
          </thead>
          <tbody>${cornerRows}</tbody>
        </table>
      `;
    }

    blocks.push(`<section class="report-section">
      <h2>${tr.interProjector}</h2>
      <p class="section-intro">Şantiye ve mekanik montaj ekiplerinin sahada lazer metre ile doğrudan uygulayabileceği eksen aralıkları, sol referans kenar mesafeleri, tavan askı borusu boyları ve linye bağlantıları aşağıda listelenmiştir.</p>

      <h3 class="sub-heading">Yüzey Bazlı Montaj & Eksen Özeti</h3>
      <table class="compact-table">
        <thead>
          <tr>
            <th>Yüzey</th>
            <th>Tip</th>
            <th>Fiziksel Ebat</th>
            <th>PJ Adet</th>
            <th>1 PJ Açınımı</th>
            <th>Eksen Aralığı (ΔX)</th>
            <th>Örtüşme (Blend)</th>
            <th>Atım (D)</th>
            <th>Yükseklik (H)</th>
            <th>Güç</th>
          </tr>
        </thead>
        <tbody>${surfSummaryRows}</tbody>
      </table>

      <h3 class="sub-heading">Bireysel Projektör Montaj & Mesafe Matrisi (Cihaz Başı Cetvel)</h3>
      <table class="compact-table pj-matrix-table">
        <thead>
          <tr>
            <th>Cihaz Kodu</th>
            <th>Yüzey</th>
            <th>Sol Kenara Mesafe</th>
            <th>Sonraki PJ Eksen Aralığı (ΔX)</th>
            <th>Blend Bölgesi</th>
            <th>Atım Mesafesi (D)</th>
            <th>Montaj Kotu (H)</th>
            <th>Tavandan Askı</th>
            <th>3B Koordinatlar (m)</th>
            <th>Linye & Faz</th>
          </tr>
        </thead>
        <tbody>${pjDetailRows}</tbody>
      </table>

      ${cornerBlock}

      <div class="guideline-card">
        <b>🛠 Mekanik Montaj & Şantiye Standartları:</b>
        <ul>
          <li><b>Eksen Hizalaması:</b> Komşu projektör eksen aralıkları (ΔX) montaj sırasında lazer nivo ve lazer şakül ile ±5mm tolerans sınırları içinde sabitlenmelidir.</li>
          <li><b>Titreşim Yalıtımı:</b> Truss ve tavan askı borularında titreşim emici kauçuk flanşlar kullanılmalı, havalandırma kanalları veya hoparlör sub-bass rezonanslarından izole edilmelidir.</li>
          <li><b>Isı & Servis Boşluğu:</b> Cihazların egzoz hava çıkışları önünde minimum 50cm, arka filtre emişlerinde minimum 30cm açık alan bırakılmalıdır.</li>
        </ul>
      </div>
    </section>`);
  }

  // 4. PROJEKSİYON & LENS HESAPLARI
  const projectionList = (p.projectionScreens && p.projectionScreens.length > 0)
    ? p.projectionScreens.filter(x => x.imageWidthM > 0 && x.distanceM > 0)
    : (p.projection && p.projection.imageWidthM > 0 && p.projection.distanceM > 0 ? [p.projection] : []);
  if (p.sections.projection && projectionList.length > 0) {
    const pr = projectionList[0];
    const projCardsHtml = projectionList.map((prItem, prIdx) => {
      const pr = prItem;
      const matchedScn = p.scenarios?.find(
        sc => pr.screenName && sc.surfaceName.trim().toLowerCase() === pr.screenName.trim().toLowerCase()
      ) || p.scenarios?.[prIdx];
      const matchedPhoto = p.photometricSurfaces?.find(
        ps => (matchedScn && ps.surfaceId === matchedScn.surfaceId) || (pr.screenName && ps.surfaceName.trim().toLowerCase() === pr.screenName.trim().toLowerCase())
      );
      const pjCount = matchedScn?.projectorCount || matchedPhoto?.projectorCount || 1;
      const unitLm = matchedScn?.unitLumens || matchedPhoto?.nominalLumensPerProj || pr.ansiLumens || 0;
      const totalSurfaceLm = unitLm * pjCount;
      const pjDisplayName = pjCount > 1 && !/^\d+\s*x\s+/i.test(pr.projectorName || '')
        ? `${pjCount}x ${pr.projectorName}`
        : pr.projectorName;
      const res = solveProjection({
      imageWidth: pr.imageWidthM,
      distance: pr.distanceM,
      aspect: { w: pr.aspectW, h: pr.aspectH },
      throwRange: pr.throwMin && pr.throwMax ? { min: pr.throwMin, max: pr.throwMax } : undefined,
      lensFrontProtrusion: pr.lensFrontProtrusionM ?? 0,
    });
    warnings.push(...res.warnings);
    assumptions.push(...res.approximations);
      return `<div class="surface-multi-card" style="margin-bottom:16px;">
      <div class="surface-multi-card-header"><h3 class="surface-multi-card-title">${pr.screenName ? esc(pr.screenName) : `Ekran / Duvar #${prIdx + 1}`}</h3><span class="surface-multi-card-badge">${round(res.imageWidth, 2)} × ${round(res.imageHeight, 2)} m</span></div>
      <table><tbody>
        <tr><th>${tr.projector}</th><td><b>${esc(pjDisplayName)}</b></td><th>${tr.lens}</th><td>${esc(pr.lensName)}${pr.throwMin && pr.throwMax ? ` (${Math.abs(pr.throwMax - pr.throwMin) < 0.02 ? 'Sabit Lens' : 'Zoom Lens'} · ${pr.throwMin}–${pr.throwMax}:1)` : ''}</td></tr>
        <tr><th>${tr.imgSize} &amp; ${p.lang === 'en' ? 'Area' : 'Alan'}</th><td>${round(res.imageWidth, 3)} × ${round(res.imageHeight, 3)} m · <b>${round(res.imageWidth * res.imageHeight, 2)} m²</b></td><th>${tr.diagonal}</th><td>${round(res.diagonal / 0.0254, 1)}" (${round(res.diagonal, 3)} m)</td></tr>
        <tr><th>${tr.throwRatio}</th><td>Seçilen: <b>${round(res.throwRatio, 4)}:1</b>${pr.throwMin && pr.throwMax ? ` (Min ${pr.throwMin}:1 · Max ${pr.throwMax}:1)` : ''}</td><th>${tr.optDist}</th><td>${round(res.lensToSurface, 3)} m${Math.abs(res.chassisFrontToSurface - res.lensToSurface) > 0.005 ? ` (${p.lang === 'en' ? 'Chassis' : 'Şasi'}: ${round(res.chassisFrontToSurface, 3)} m)` : ''}</td></tr>

        ${unitLm > 0 ? `<tr><th>${p.lang === 'en' ? 'Light Output (ANSI Lumens)' : 'Işık Gücü (ANSI Lümen)'}</th><td>${pjCount > 1 ? `<b>${unitLm.toLocaleString('tr-TR')} ANSI lm/adet</b> · Toplam: <b>${totalSurfaceLm.toLocaleString('tr-TR')} ANSI lm</b> (${pjCount}×)` : `<b>${unitLm.toLocaleString('tr-TR')} ANSI lm</b> (1×)`}${pr.technology ? ` · ${esc(pr.technology)}` : ''}</td><th>${p.lang === 'en' ? 'Resolution & Aspect' : 'Çözünürlük &amp; Oran'}</th><td>${pr.resolution ? esc(pr.resolution) : `${pr.aspectW}:${pr.aspectH}`}</td></tr>` : ''}
        ${res.distanceMin && res.distanceMax ? `<tr><th>${p.lang === 'en' ? 'Lens Throw Range' : 'Min / Max Atım Mesafesi'}</th><td>${round(res.distanceMin, 2)} – ${round(res.distanceMax, 2)} m</td><th>${p.lang === 'en' ? 'Zoom Position' : 'Zoom Konumu'}</th><td>Katalog Zoom Eğrisi Yok (TR Aralığı İçi)</td></tr>` : ''}
      </tbody></table>
      ${(() => {
        // Ön Görünüş SVG (Ekran Boyutu)
        const fW = 380, fH = 190, fPad = 36;
        const fs = Math.min((fW - 2 * fPad) / Math.max(0.1, res.imageWidth), (fH - 2 * fPad) / Math.max(0.1, res.imageHeight));
        const pw = res.imageWidth * fs, ph = res.imageHeight * fs, fx = (fW - pw) / 2, fy = (fH - ph) / 2;
        const frontSvg = `<svg viewBox="0 0 ${fW} ${fH}" style="width:100%; height:175px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px;">
          ${pr.screenPhotoUrl ? `<image href="${pr.screenPhotoUrl}" x="${fx}" y="${fy}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice" opacity="0.7" />` : ''}
          <rect x="${fx}" y="${fy}" width="${pw}" height="${ph}" fill="${pr.screenPhotoUrl ? 'none' : '#e0f2fe'}" stroke="#0284c7" stroke-width="2" />
          <line x1="${fx}" y1="${fy}" x2="${fx + pw}" y2="${fy + ph}" stroke="#0284c7" stroke-dasharray="4 3" opacity="0.5" />
          <text x="${fW / 2}" y="${fy - 8}" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="600">${round(res.imageWidth, 2)} m</text>
          <text x="${fx - 10}" y="${fH / 2}" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="600" transform="rotate(-90 ${fx - 10} ${fH / 2})">${round(res.imageHeight, 2)} m</text>
          <text x="${fW / 2}" y="${fH / 2 + 2}" text-anchor="middle" fill="#0369a1" font-size="11" font-weight="600">${round(res.diagonal / 0.0254, 1)}" (${round(res.diagonal, 2)} m)</text>
          <text x="${fW / 2}" y="${fH / 2 + 16}" text-anchor="middle" fill="#0f172a" font-size="10" font-weight="600">Alan: ${round(res.imageWidth * res.imageHeight, 2)} m²</text>
        </svg>`;

        // Yan Optik Kesit SVG (Atım Geometrisi)
        const sW = 380, sH = 190, sPad = 32;
        const spanY = Math.max(res.bounds.top, 0.2) - Math.min(res.bounds.bottom, -0.2);
        const ss = Math.min((sW - 2 * sPad - 50) / Math.max(0.2, res.lensToSurface), (sH - 2 * sPad) / Math.max(0.2, spanY));
        const sx0 = sPad + 24, sxs = sx0 + res.lensToSurface * ss;
        const syAxis = sPad + Math.max(res.bounds.top, 0.2) * ss;
        const syT = syAxis - res.bounds.top * ss, syB = syAxis - res.bounds.bottom * ss;
        const sideSvg = `<svg viewBox="0 0 ${sW} ${sH}" style="width:100%; height:175px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px;">
          <polygon points="${sx0},${syAxis} ${sxs},${syT} ${sxs},${syB}" fill="#38bdf8" fill-opacity="0.2" stroke="#0284c7" stroke-width="1.5" />
          <line x1="${sx0}" y1="${syAxis}" x2="${sxs}" y2="${syAxis}" stroke="#d97706" stroke-dasharray="4 3" />
          <rect x="${sx0 - 24}" y="${syAxis - 10}" width="24" height="20" fill="#475569" rx="2" />
          <circle cx="${sx0}" cy="${syAxis}" r="3.5" fill="#d97706" />
          <line x1="${sxs}" y1="${syT}" x2="${sxs}" y2="${syB}" stroke="#0f172a" stroke-width="3" />
          <text x="${(sx0 + sxs) / 2}" y="${syAxis - 6}" fill="#b45309" font-size="10" font-weight="600" text-anchor="middle">D = ${round(res.lensToSurface, 2)} m (TR ${round(res.throwRatio, 2)}:1)</text>
          <text x="${sxs + 5}" y="${(syT + syB) / 2 + 4}" fill="#0f172a" font-size="10" font-weight="600">H = ${round(res.imageHeight, 2)} m</text>
        </svg>`;

        return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
          <div>
            <div style="font-size:11px; font-weight:600; color:#334155; margin-bottom:4px;">Ön Görünüş — ${pr.screenName ? esc(pr.screenName) : 'Ekran Boyutu'}</div>
            ${frontSvg}
          </div>
          <div>
            <div style="font-size:11px; font-weight:600; color:#334155; margin-bottom:4px;">Yan Optik Kesit — Atım Geometrisi</div>
            ${sideSvg}
          </div>
        </div>`;
      })()}
      </div>`;
    }).join('');
    void pr;
    blocks.push(`<section class="report-section" style="break-inside:auto; page-break-inside:auto;"><h2>${tr.projection}</h2>${projCardsHtml}</section>`);
  }

  // 5. FOTOMETRİK LUX & PARLAKLIK ANALİZİ (YÜZEY BAZLI AYRI LUX HARİTALARI & DAĞILIM CETVELLERİ)
  if (p.sections.lux) {
    if (p.photometricSurfaces && p.photometricSurfaces.length > 0) {
      const pSurfs = p.enabledSurfaceIds && p.enabledSurfaceIds.length > 0
        ? p.photometricSurfaces.filter(s => p.enabledSurfaceIds!.includes(s.surfaceId) || s.surfaceId.startsWith("quick-") || (s as any).isManualLux)
        : p.photometricSurfaces;

      const surfaceCards = pSurfs.map((s, idx) => {
        const matchedPlannerCard = (p.plannerSurfaces || []).find(ps => ps.id === s.surfaceId || ps.name === s.surfaceName);
        const cardNativeW = matchedPlannerCard?.nativeW || 1920;
        const cardNativeH = matchedPlannerCard?.nativeH || 1200;
        const cardOvPct = matchedPlannerCard?.overlapMode === 'pixel' && (matchedPlannerCard?.ovPxX ?? 0) > 0
          ? +((matchedPlannerCard.ovPxX! / Math.max(1, cardNativeW)) * 100).toFixed(2)
          : (matchedPlannerCard?.overlapX ?? (s.projectorCount > 1 ? 15 : 0));
        const rawCardU0 = s.uniformityU0 > 0 ? (s.uniformityU0 <= 1 ? round(s.uniformityU0 * 100, 1) : round(s.uniformityU0, 1)) : 82;
        const cardAreaM2 = +(s.widthM * s.heightM).toFixed(2);
        const cardEffFlux = s.effectiveTotalLumens ?? Math.round(s.avgLux * cardAreaM2);
        const cardNetEff = s.netEfficiencyPct ?? 90;
        const cardRefl = s.surfaceReflectance ?? 0.85;
        const simTr = s.distributionRows?.[0]?.throwRatio || matchedPlannerCard?.throwRatio || 0;
        const simDist = s.distributionRows?.[0]?.throwDistM || matchedPlannerCard?.throwDistM || 0;
        const simRoomW = p.interProjectorAnalysis?.roomDimensions?.widthM || 14;
        const simRoomL = p.interProjectorAnalysis?.roomDimensions?.lengthM || 10;
        const simRoomH = p.interProjectorAnalysis?.roomDimensions?.heightM || 3.5;
        const cardPhysCov = evaluatePhysicalCoverage({
          surfaceWidthM: s.widthM,
          surfaceHeightM: s.heightM,
          cols: Math.max(1, matchedPlannerCard?.cols || s.projectorCount),
          rows: Math.max(1, matchedPlannerCard?.rows || 1),
          projW: cardNativeW,
          projH: cardNativeH,
          throwDistM: simDist,
          throwRatio: simTr,
          overlapX: cardOvPct,
          overlapY: 0,
        });
        const cardActiveW = (cardPhysCov && cardPhysCov.coveredWidthM > 0.1) ? cardPhysCov.coveredWidthM : s.widthM;
        const cardActiveH = (cardPhysCov && cardPhysCov.coveredHeightM > 0.1) ? cardPhysCov.coveredHeightM : s.heightM;
        const cardActiveAreaM2 = round(cardActiveW * cardActiveH, 2);
        const effTheoActiveL = round(cardEffFlux / Math.max(0.1, cardActiveAreaM2), 1);

        const hasSimInputs = simTr > 0 && simDist > 0 && (Boolean(s.nominalLumensPerProj) || Boolean(s.effectiveTotalLumens) || s.luxSource === 'SIMULATED_LUXFIELD');
        const resolvedPjModel = matchedPlannerCard?.projectorModel || (s as any).projectorModel || p.projection?.projectorName || 'Simülasyon';
        const resolvedPowerW = (s as any).powerWPerUnit || resolveProjectorWatts(resolvedPjModel, 450);
        const resolvedNativeContrast = s.nativeContrast || resolveProjectorNativeContrast(resolvedPjModel);

        const simGrid = hasSimInputs
          ? computeLuxSimulationGrid({
              room: { widthM: simRoomW, lengthM: simRoomL, heightM: simRoomH },
              surface: { id: s.surfaceId, name: s.surfaceName, widthM: s.widthM, heightM: s.heightM, viewingDistanceM: 3.5 },
              projector: {
                model: resolvedPjModel,
                cols: Math.max(1, matchedPlannerCard?.cols || s.projectorCount),
                rows: Math.max(1, matchedPlannerCard?.rows || 1),
                nativeW: cardNativeW,
                nativeH: cardNativeH,
                ansiLumensPerUnit: s.nominalLumensPerProj || Math.round((cardEffFlux / Math.max(0.1, cardNetEff / 100)) / Math.max(1, s.projectorCount)),
                powerWPerUnit: resolvedPowerW,
              },
              lens: { model: 'Lens', throwDistM: simDist, throwRatio: simTr },
              photometrics: { opticalEfficiencyPct: cardNetEff, screenGain: s.screenGain, reflectance: cardRefl, ambientLux: s.ambientLux ?? 0 },
              blending: { overlapPctX: cardOvPct },
              electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
            }, 24, 12)
          : null;
        const sharedPointDist: SurfacePointLuxResult = simGrid
          ? (() => {
              const g9 = sampleNinePointsFromLuxGrid(simGrid, s.widthM, s.heightM, s.screenGain, cardRefl);
              return {
                avgLux: simGrid.avgLux,
                peakCenterLux: g9.peakCenterLux,
                cornerAvgLux: g9.cornerAvgLux,
                edgeAvgLux: g9.edgeAvgLux,
                blendSeamLux: g9.edgeAvgLux,
                blendSeamNits: round((g9.edgeAvgLux * s.screenGain * cardRefl) / Math.PI, 1),
                centerToCornerDropPct: g9.centerToCornerDropPct,
                zones9: g9.zones9,
              };
            })()
          : computeSurfacePointLuxDistribution({
              widthM: s.widthM,
              heightM: s.heightM,
              cols: Math.max(1, matchedPlannerCard?.cols || s.projectorCount || 1),
              rows: Math.max(1, matchedPlannerCard?.rows || 1),
              avgLux: Math.round(s.avgLux),
              uniformityU0: rawCardU0,
              overlapPct: cardOvPct,
              screenGain: s.screenGain,
              reflectance: cardRefl,
              ambientLux: s.ambientLux ?? 0,
            });
        const cardZoneLuxes = sharedPointDist.zones9.map(z => z.lux);
        const cardEqMean = Math.round(cardZoneLuxes.reduce((a, b) => a + b, 0) / Math.max(1, cardZoneLuxes.length));
        const cardWeightedMean = round(
          sharedPointDist.zones9.reduce((a, z) => {
            const w = z.zoneKind === 'center' ? 4 : z.zoneKind === 'edge' ? 2 : 1;
            return a + z.lux * w;
          }, 0) / 16,
          1
        );
        const minL = s.isManualLux || !simGrid ? Math.round(s.minLux) : Math.min(...cardZoneLuxes);
        const maxL = s.isManualLux || !simGrid ? Math.round(s.maxLux) : Math.max(...cardZoneLuxes);
        // Teorik ortalamayı (750 lx) asla 9-nokta simülasyon min/max (327/360 lx) ortalaması olarak gösterme!
        const useSimField = !s.isManualLux && Boolean(simGrid) && (s.luxSource === 'SIMULATED_LUXFIELD' || s.avgLux > maxL || s.avgLux < minL);
        const avgL = useSimField ? cardEqMean : Math.round(s.avgLux);
        const gridAvgL = simGrid ? simGrid.avgLux : avgL;
        const effTheoL = s.effectiveTheoreticalLux ?? Math.round(cardEffFlux / Math.max(0.1, cardAreaM2));
        const nomFluxForCard = s.totalNominalLumens ?? Math.round(cardEffFlux / Math.max(0.1, cardNetEff / 100));
        const nomTheoL = s.nominalTheoreticalLux ?? round(nomFluxForCard / Math.max(0.1, cardAreaM2), 1);
        const u0 = !useSimField
          ? (s.uniformityU0 <= 1 ? (s.uniformityU0 * 100).toFixed(1) : s.uniformityU0.toFixed(1))
          : (cardEqMean > 0 ? ((minL / cardEqMean) * 100).toFixed(1) : '0.0');
        const u1 = !useSimField
          ? (s.uniformityU1 <= 1 ? (s.uniformityU1 * 100).toFixed(1) : s.uniformityU1.toFixed(1))
          : (maxL > 0 ? ((minL / maxL) * 100).toFixed(1) : '0.0');
        const nits = !useSimField ? Math.round(s.luminanceNits) : round((avgL * s.screenGain * cardRefl) / Math.PI, 1);
        const gridNits = simGrid ? round((gridAvgL * s.screenGain * cardRefl) / Math.PI, 1) : nits;
        const theoEffNits = round((effTheoL * s.screenGain * cardRefl) / Math.PI, 1);
        const theoNomNits = round((nomTheoL * s.screenGain * cardRefl) / Math.PI, 1);
        const fl = round(nits * 0.2919, 1).toFixed(1);
        const acr = !useSimField ? Math.round(s.ambientContrastRatio) : (s.ambientLux > 0 ? round((avgL + s.ambientLux) / s.ambientLux, 1) : 0);
        const theoAcr = s.ambientLux > 0 ? round((effTheoL + s.ambientLux) / s.ambientLux, 1) : 0;
        const hasDeviceContrast =
          (typeof resolvedNativeContrast === 'number' && resolvedNativeContrast > 0) ||
          (typeof s.nativeBlackNits === 'number' && s.nativeBlackNits > 0);

        const luxStatusColor = avgL >= 300 && avgL <= 600 ? 'background:#dcfce7; color:#166534;' : avgL > 600 ? 'background:#e0f2fe; color:#0369a1;' : 'background:#fee2e2; color:#991b1b;';
        const luxStatusText = avgL >= 300 && avgL <= 500 ? '✓ Sergi Referansı (300–500 lx · Eser Hariç)' : avgL > 500 && avgL <= 600 ? '✓ Yüksek Sergi Aydınlığı (500–600 lx)' : avgL > 600 ? '✓ Çok Yüksek Aydınlık (>600 lx)' : '⚠ Düşük Aydınlık (Karartma Şart)';

        const gridU0 = simGrid ? simGrid.u0Pct : +u0;
        const gridHasDeficit = simGrid && gridU0 < 50;
        const uStatusColor = gridHasDeficit
          ? 'background:#fee2e2; color:#991b1b;'
          : +u0 >= 70
          ? 'background:#dcfce7; color:#166534;'
          : +u0 >= 50
          ? 'background:#fef3c7; color:#92400e;'
          : 'background:#fee2e2; color:#991b1b;';
        const uStatusText = gridHasDeficit
          ? `❌ Tüm Duvar Homojenliği: %${gridU0} (Kritik Düşük / Dikey Kaplama Boşluğu) · Aktif Alan: %${u0}`
          : +u0 >= 70
          ? '✓ Yüksek Homojenlik (U0 ≥ %70 Proje Kabul Kriteri)'
          : +u0 >= 50
          ? '⚠ Sınırlı Homojenlik (%50–%70 Kurum İçi Hedef)'
          : '❌ Yetersiz Homojenlik (FAIL — U0 < %50)';

        return `
        <div class="photometric-report-card">
          <div class="photometric-card-header">
            <div>
              <h3 class="surface-multi-card-title">${/^\d+\.\s*/.test(s.surfaceName) ? esc(s.surfaceName) : `${idx + 1}. ${esc(s.surfaceName)}`} — Fotometrik Aydınlık Analizi</h3>
              <div style="font-size: 11px; color: #475569; margin-top: 2px; display:flex; align-items:center; gap:8px;">
                <span>${s.widthM}m × ${s.heightM}m</span>
                <span style="background:#dcfce7; color:#166534; font-weight:700; padding:1px 6px; border-radius:4px; border:1px solid #bbf7d0;">
                  📐 Alan: ${(s.widthM * s.heightM).toFixed(2)} m²
                </span>
                <span>· ${s.projectorCount} Adet Projektör</span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              ${s.isManualLux ? '<span class="badge-circuit" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">✏️ Manuel Saha Ölçümü</span>' : '<span class="badge-circuit" style="background:#e0f2fe; color:#0369a1;">⚡ Noktadan Noktaya Simülasyon (LuxField)</span>'}
              <span class="surface-multi-card-badge">${s.surfaceType === 'floor' ? 'Zemin / Floor' : s.surfaceType === 'ceiling' ? 'Tavan' : 'Duvar / Wall'}</span>
            </div>
          </div>

          <div class="photometric-grid-layout">
            <!-- Sol: 2B Isı Haritası Fotoğrafı -->
            <div class="heatmap-report-container">
              ${s.heatmapSnapshotUrl ? `
                <img src="${esc(s.heatmapSnapshotUrl)}" alt="${esc(s.surfaceName)} Lux Haritası" class="heatmap-report-img" />
                <div class="heatmap-report-caption">📸 2D Lux Isı Dağılımı ve Projektör Sınırları (${minL} lx → ${maxL} lx)</div>
              ` : `
                <div style="padding: 32px 16px; text-align: center; color: #94a3b8; font-size: 11px;">
                  <i>Fotometrik Isı Haritası görseli Lüks Hesaplayıcı sekmesinden aktarılacaktır.</i>
                </div>
              `}
            </div>

            <!-- Sağ: 4 Temel Fotometrik Metrik -->
            <div class="photometric-mini-metrics">
              <div class="photometric-mini-card">
                <div class="photometric-mini-title">${s.isManualLux ? 'Ölçülen Aydınlık (Lux)' : 'Simüle Aydınlık (9-Nokta Ort.)'}</div>
                <div class="photometric-mini-value" style="color: #0284c7;">${avgL} <span style="font-size:11px; font-weight:normal; color:#64748b;">lx</span></div>
                <div class="photometric-mini-sub">Min: <b>${minL}</b> / Max: <b>${maxL}</b> lx${!s.isManualLux ? ` · Ağırlıklı: <b>${cardWeightedMean}</b> · 288-Grid: <b>${gridAvgL}</b> lx` : ''}</div>
                ${!s.isManualLux ? `<div style="font-size:9px; color:#475569; margin-top:2px;">Teorik (Φ/A): Aktif Alan <b>${effTheoActiveL} lx</b> · Tüm Duvar <b>${effTheoL} lx</b> (Nominal <b>${nomTheoL} lx</b>)</div>` : ''}
                <div class="photometric-mini-badge" style="${luxStatusColor}">${luxStatusText}</div>
              </div>

              <div class="photometric-mini-card">
                <div class="photometric-mini-title">Işık Düzgünlüğü (Uniformity)</div>
                <div class="photometric-mini-value" style="color: #059669;">%${u0}</div>
                <div class="photometric-mini-sub">9-Nokta: U0 <b>%${u0}</b> / U1 <b>%${u1}</b>${simGrid ? ` · 288-Nokta: U0 <b>%${simGrid.u0Pct}</b> / U1 <b>%${simGrid.u1Pct}</b>` : ''}</div>
                <div class="photometric-mini-badge" style="${uStatusColor}">${uStatusText}</div>
              </div>

              <div class="photometric-mini-card">
                <div class="photometric-mini-title">Simüle Parlaklık (ρ dahil)</div>
                <div class="photometric-mini-value" style="color: #d97706;">${nits} <span style="font-size:11px; font-weight:normal; color:#64748b;">cd/m²</span></div>
                <div class="photometric-mini-sub">${fl} fL · Gain: ${s.screenGain}x · ρ: ${cardRefl}${simGrid ? ` · 288-Nokta: <b>${gridNits} nit</b>` : ''}</div>
                <div style="font-size:9px; color:#475569; margin-top:2px;">Teorik (Φ_eff/A): <b>${theoEffNits} cd/m²</b> (Nominal: ${theoNomNits} cd/m²)</div>
                <div class="photometric-mini-badge" style="background:#fef3c7; color:#92400e;">✓ Simüle LuxField Bazlı</div>
              </div>

              <div class="photometric-mini-card">
                <div class="photometric-mini-title">Tahmini Ortam Kontrastı (Simüle)</div>
                <div class="photometric-mini-value" style="color: #7c3aed;">${s.ambientLux > 0 ? `${acr}:1` : 'UNKNOWN'}</div>
                <div class="photometric-mini-sub">Ortam: <b>${s.ambientLux} lx</b> (${round((s.ambientLux * s.screenGain * cardRefl) / Math.PI, 2)} nit)${!s.isManualLux && s.ambientLux > 0 ? ` · Teorik Φ/A: ~${theoAcr}:1` : ''}</div>
                <div class="photometric-mini-badge" style="${s.ambientLux <= 0 || !hasDeviceContrast ? 'background:#fef3c7; color:#92400e;' : acr >= 15 ? 'background:#dcfce7; color:#166534;' : 'background:#fee2e2; color:#991b1b;'}">${s.ambientLux <= 0 ? '❓ Ortam Işığı Tanımsız' : !hasDeviceContrast ? '⚠ Doğal Siyah UNKNOWN (Tahmini Ortam ACR)' : acr >= 15 ? '✓ Yüksek Okunabilirlik' : '⚠ Düşük Kontrast'}</div>
              </div>
            </div>
          </div>

          ${p.sections.includeBrightnessChain !== false ? (() => {
            const areaM2 = +(s.widthM * s.heightM).toFixed(2);
            const effFlux = cardEffFlux;
            const netEff = cardNetEff;
            const nomFlux = nomFluxForCard;
            const isoFlux = s.isoEquivalentLumens ?? Math.round(nomFlux * 0.95);
            const lostFlux = s.lostLumens ?? Math.max(0, nomFlux - effFlux);
            const singleLux = Math.round(avgL / Math.max(1, s.projectorCount));
            const refl = cardRefl;
            const idealNits = round((avgL * s.screenGain) / Math.PI, 1);
            const ambNits = +((s.ambientLux * s.screenGain * refl) / Math.PI).toFixed(2);
            const whiteNits = +(nits + ambNits).toFixed(1);
            const acrExact = +((nits + ambNits) / Math.max(0.01, ambNits)).toFixed(1);
            const stdLabel = (s.lumenStandard ?? 'ansi').toUpperCase();
            const simGridU1 = simGrid ? simGrid.u1Pct : 0;
            const simBeamH = simTr > 0 && simDist > 0 ? +((simDist / simTr) * (cardNativeH / Math.max(1, cardNativeW))).toFixed(3) : 0;
            const overspillNote = simGrid && simBeamH > s.heightM + 0.05
              ? `Işın yüksekliği (${simBeamH}m) duvar yüksekliğini (${s.heightM}m) aştığı için akının bir kısmı dışarı taşar; Tüm Duvar Ort: ${simGrid.avgLux} lx · Aktif İçi Ort: ${simGrid.activeAvgLux} lx (Aktif Alan %${simGrid.activeAreaRatioPct} · Sıfır Nokta: ${simGrid.zeroCellCount}/${simGrid.totalCellCount}) · U0 %${simGrid.u0Pct}, U1 %${simGridU1}.`
              : simGrid && simGrid.zeroCellCount > 0 && simGrid.activeAvgLux > 0
                ? `Tüm Duvar Ort: ${simGrid.avgLux} lx (U0 %${simGrid.u0Pct} · U1 %${simGridU1}) · Aktif Projeksiyon İçi (${simGrid.activeMinLux}–${simGrid.activeMaxLux} lx): Ort ${simGrid.activeAvgLux} lx · Aktif U0 %${simGrid.activeU0Pct} · Aktif U1 %${simGrid.activeU1Pct} · Aktif Alan %${simGrid.activeAreaRatioPct} · Kaplama Dışı Sıfır: ${simGrid.zeroCellCount}/${simGrid.totalCellCount} nokta.`
                : simGrid
                  ? `288-nokta grid (${simGrid.gridCols}×${simGrid.gridRows}): Tüm Duvar/Aktif Ort ${simGrid.avgLux} lx · Min ${simGrid.minLux} / Max ${simGrid.maxLux} lx · U0 %${simGrid.u0Pct} · U1 %${simGridU1} · Sıfır: 0/${simGrid.totalCellCount} (%100 kaplama).`
                  : '';
            return `
            <div style="margin-top: 10px; break-inside: avoid; page-break-inside: avoid;">
              <div style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                🔎 5 Yöntemli Aydınlık (Lux) &amp; Parlaklık (Nit) Karşılaştırma Tablosu (Teorik vs Simülasyon)
              </div>
              <table class="compact-table" style="background:#f8fafc; font-size:10px; margin-bottom:8px;">
                <thead>
                  <tr>
                    <th>Hesaplama Yöntemi / Veri Kaynağı</th>
                    <th>Matematiksel Tanım</th>
                    <th style="text-align:right;">Min / Max</th>
                    <th style="text-align:right;">Ortalama Lux</th>
                    <th style="text-align:right;">Parlaklık (Nit) / Tahmini ACR</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><b>1. Nominal Teorik Ortalama</b> <span style="color:#64748b;">(THEORETICAL)</span></td>
                    <td style="font-family:monospace;">ΣΦ_nom / A = ${nomFlux.toLocaleString('tr-TR')} lm / ${areaM2} m² (Kayıpsız &amp; taşmasız)</td>
                    <td style="text-align:right; font-family:monospace;">—</td>
                    <td style="text-align:right; font-family:monospace;"><b>${nomTheoL} lx</b></td>
                    <td style="text-align:right; font-family:monospace;">${theoNomNits} cd/m²</td>
                  </tr>
                  <tr>
                    <td><b>2. Efektif Teorik Ortalama</b> <span style="color:#64748b;">(THEORETICAL)</span></td>
                    <td style="font-family:monospace;">ΣΦ_eff / A = ${effFlux.toLocaleString('tr-TR')} lm / ${areaM2} m² (%${netEff} verim, taşmasız üst sınır)</td>
                    <td style="text-align:right; font-family:monospace;">—</td>
                    <td style="text-align:right; font-family:monospace;"><b>${effTheoL} lx</b></td>
                    <td style="text-align:right; font-family:monospace;">${theoEffNits} cd/m² · ~${theoAcr}:1</td>
                  </tr>
                  <tr class="highlight-cell">
                    <td><b>3. 9-Nokta Eşit Ortalama</b> <span style="color:#0369a1;">(SIMULATED_LUXFIELD)</span></td>
                    <td style="font-family:monospace;">(1/9) Σ E_i · 9 bölge eşit ağırlıklı aritmetik ortalama (U0 %${u0} / U1 %${u1})</td>
                    <td style="text-align:right; font-family:monospace;">${minL} / ${maxL} lx</td>
                    <td style="text-align:right; font-family:monospace; color:#0284c7;"><b>${avgL} lx</b></td>
                    <td style="text-align:right; font-family:monospace;"><b>${nits} cd/m² · ~${acr}:1</b></td>
                  </tr>
                  <tr>
                    <td><b>4. 9-Nokta Ağırlıklı Ortalama</b> <span style="color:#0369a1;">(SIMULATED_LUXFIELD)</span></td>
                    <td style="font-family:monospace;">Köşe 1/16 + Kenar 2/16 + Merkez 4/16 alan-ağırlıklı ortalama</td>
                    <td style="text-align:right; font-family:monospace;">${minL} / ${maxL} lx</td>
                    <td style="text-align:right; font-family:monospace;"><b>${cardWeightedMean} lx</b></td>
                    <td style="text-align:right; font-family:monospace;">${round((cardWeightedMean * s.screenGain * refl) / Math.PI, 1)} cd/m²</td>
                  </tr>
                  ${simGrid ? `<tr>
                    <td><b>5. 288-Nokta Alan Ortalaması</b> <span style="color:#0369a1;">(SIMULATED_LUXFIELD)</span></td>
                    <td style="font-family:monospace;">24×12 Grid (${simGrid.sampleCount} hücre) integral ortalaması (U0 %${simGrid.u0Pct} / U1 %${simGridU1})</td>
                    <td style="text-align:right; font-family:monospace;">${simGrid.minLux} / ${simGrid.maxLux} lx</td>
                    <td style="text-align:right; font-family:monospace;"><b>${simGrid.avgLux} lx</b></td>
                    <td style="text-align:right; font-family:monospace;">${gridNits} cd/m² · ~${s.ambientLux > 0 ? round((simGrid.avgLux + s.ambientLux) / s.ambientLux, 1) : 0}:1</td>
                  </tr>` : ''}
                </tbody>
              </table>

              <div style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 5px;">
                📊 9 Adımlı Işık, Kayıp ve Gerçekçi Parlaklık Hesap Zinciri (Toplam Özet)
              </div>
              <table class="compact-table" style="background:#ffffff; font-size:10.5px;">
                <thead>
                  <tr>
                    <th style="width:28%;">Hesaplama Kalemi</th>
                    <th style="width:42%;">Detay / Katsayı</th>
                    <th style="width:30%; text-align:right;">Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><b>1. ANSI / ISO Lümen</b></td>
                    <td style="font-family:monospace;">${s.projectorCount} PJ · Standart: ${stdLabel}</td>
                    <td style="text-align:right; font-family:monospace;"><b>${nomFlux.toLocaleString('tr-TR')} lm</b> (ISO: ${isoFlux.toLocaleString('tr-TR')} lm)</td>
                  </tr>
                  <tr>
                    <td><b>2. Görüntü Alanı (m²)</b></td>
                    <td style="font-family:monospace;">${s.widthM}m × ${s.heightM}m</td>
                    <td style="text-align:right; font-family:monospace;"><b>${areaM2} m²</b></td>
                  </tr>
                  <tr>
                    <td><b>3. Teorik Ortalama Lux (Φ/A)</b></td>
                    <td style="font-family:monospace;">Aktif Alan (${cardActiveAreaM2}m²): ${effFlux.toLocaleString('tr-TR')} ÷ ${cardActiveAreaM2} = <b>${effTheoActiveL} lx</b> · Tüm Duvar (${areaM2}m²): <b>${effTheoL} lx</b> (Nominal ${nomTheoL} lx)</td>
                    <td style="text-align:right; font-family:monospace;"><b>Aktif Teorik Tavan: ${effTheoActiveL} Lux</b> (${round((effTheoActiveL * s.screenGain * cardRefl) / Math.PI, 1)} Nit)</td>
                  </tr>
                  <tr>
                    <td><b>4. Lens &amp; Optik Kayıplar</b></td>
                    <td style="font-family:monospace;">Net Verim: %${netEff} (Kayıp: -${lostFlux.toLocaleString('tr-TR')} lm)</td>
                    <td style="text-align:right; font-family:monospace; color:#b45309;"><b>${effFlux.toLocaleString('tr-TR')} lm</b> efektif</td>
                  </tr>
                  <tr>
                    <td><b>5. Çoklu Projektör Katkısı (Simüle LuxField)</b></td>
                    <td style="font-family:monospace;">Tek Cihaz Ort: ${singleLux} lx × ${s.projectorCount} PJ · 9-Nokta Ağırlıklı: ${cardWeightedMean} lx</td>
                    <td style="text-align:right; font-family:monospace; color:#0284c7;"><b>9-Nokta: ${avgL} Lux</b>${simGrid ? ` (Grid: ${simGrid.avgLux} lx)` : ''}</td>
                  </tr>
                  <tr>
                    <td><b>6. Ekran Kazancı (Gain)</b></td>
                    <td style="font-family:monospace;">${s.screenGain}× Gain (Simüle ${avgL} lx bazlı)</td>
                    <td style="text-align:right; font-family:monospace;"><b>${idealNits} Nit</b> (ρ=1.0 için)</td>
                  </tr>
                  <tr>
                    <td><b>7. Yüzey Yansıtma (ρ)</b></td>
                    <td style="font-family:monospace;">ρ = ${refl} (%${Math.round(refl * 100)} yansıtma) · L = E_sim · Gain · ρ / π</td>
                    <td style="text-align:right; font-family:monospace;"><b>${nits} Nit</b> (Teorik Φ/A: ${theoEffNits} Nit)</td>
                  </tr>
                  <tr>
                    <td><b>8. Ortam Işığı &amp; Kontrast</b></td>
                    <td style="font-family:monospace;">${s.ambientLux} lx × Gain ${s.screenGain} × ρ ${refl} / π = Siyah +${ambNits} Nit${!hasDeviceContrast ? ' (Doğal siyah tanımsız → UNKNOWN)' : ''}</td>
                    <td style="text-align:right; font-family:monospace; color:#7c3aed;"><b>${s.ambientLux > 0 ? `Tahmini ACR ~${acrExact}:1` : 'ACR UNKNOWN'}</b> (${whiteNits} / ${ambNits} Nit)</td>
                  </tr>
                  <tr class="highlight-cell">
                    <td><b>9. TOPLAM SİMÜLASYON SONUCU</b></td>
                    <td style="font-family:monospace;">9-Nokta: Min ${minL} ≤ Ort ${avgL} ≤ Max ${maxL} lx · U0 %${u0} / U1 %${u1}</td>
                    <td style="text-align:right; font-family:monospace;"><b>${avgL} Lux · ${nits} Nit (${fl} fL)</b></td>
                  </tr>
                  ${simGrid ? `<tr>
                    <td><b>10. 288-Nokta Fiziksel Lux Grid</b></td>
                    <td style="font-family:monospace;">${overspillNote}</td>
                    <td style="text-align:right; font-family:monospace; color:#0369a1;"><b>${simGrid.avgLux} lx · ${gridNits} Nit</b> (U0 %${simGrid.u0Pct} / U1 %${simGridU1})</td>
                  </tr>` : ''}
                </tbody>
              </table>
            </div>`;
          })() : ''}

          ${(() => {
            const linkedSurf = p.plannerSurfaces?.find((ps: any) => ps.id === s.surfaceId);
            const resParts = (p.projection?.resolution || '').match(/(\d+)\s*[×x]\s*(\d+)/i);
            const projResW = resParts ? Number(resParts[1]) : 1920;
            const projResH = resParts ? Number(resParts[2]) : 1200;
            const effResW = linkedSurf?.netW || (s.projectorCount > 1 ? Math.round(projResW * (s.projectorCount - (s.projectorCount - 1) * 0.15)) : projResW);
            const effResH = linkedSurf?.netH || projResH;
            const effViewDist = linkedSurf?.viewDistM || +(Math.max(1.8, s.heightM * 2.5)).toFixed(1);
            const matchedPlannerForPt = (p.plannerSurfaces || []).find(ps => ps.id === s.surfaceId || ps.name === s.surfaceName);
            const ptNativeW = matchedPlannerForPt?.nativeW || projResW;
            const ptOvPct = matchedPlannerForPt?.overlapMode === 'pixel' && (matchedPlannerForPt?.ovPxX ?? 0) > 0
              ? +((matchedPlannerForPt.ovPxX! / Math.max(1, ptNativeW)) * 100).toFixed(2)
              : (matchedPlannerForPt?.overlapX ?? (s.projectorCount > 1 ? 15 : 0));
            const syncedU0Pct = +u0 > 0 ? +u0 : 82;
            const vq = computeViewingQualityAnalysis({
              widthM: s.widthM,
              heightM: s.heightM,
              resW: effResW,
              resH: effResH,
              viewingDistanceM: effViewDist,
              offAxisAngleDeg: 0,
              screenGain: s.screenGain,
              reflectance: s.surfaceReflectance ?? 0.85,
              avgLux: avgL,
              ambientLux: s.ambientLux ?? 0,
              nativeContrast: 2000,
              uniformityU0: syncedU0Pct,
              uniformityU1: +u1,
              projectorCount: Math.max(1, matchedPlannerForPt?.cols || s.projectorCount || 1),
              overlapPct: ptOvPct,
              colorCalibrated: (s.calibrationFactorPct ?? 92) >= 90,
            });
            return [
              p.sections.includeViewingQuality !== false
                ? renderViewingQualityA4Html(vq, {
                    sourceLabel: '9-Nokta LuxField',
                    gridU0Pct: simGrid?.u0Pct,
                    gridU1Pct: simGrid?.u1Pct,
                  })
                : '',
              p.sections.includePointLuxMap !== false ? renderPointLuxDistributionA4Html(sharedPointDist, effTheoL) : '',
            ].filter(Boolean).join('\n');
          })()}

          <!-- Işık Düzgünlüğü (Uniformity) Dinamik Açıklama Kutusu -->
          <div style="margin-top: 8px; margin-bottom: 8px; padding: 7px 10px; background: #f8fafc; border-left: 3.5px solid ${gridHasDeficit ? '#dc2626' : +u0 >= 75 ? '#059669' : +u0 >= 60 ? '#d97706' : '#dc2626'}; border-radius: 4px; font-size: 10.5px; color: #334155; line-height: 1.4;">
            <b>💡 Işık Düzgünlüğü (Uniformity / Homojenlik) Nedir?</b>
            Projeksiyon görüntüsünün merkezinden 4 köşesine doğru aydınlığın ne kadar dengeli dağıldığını gösterir (U0 = E_min / E_avg). 
            ${gridHasDeficit
              ? `❌ DİKKAT: 288-nokta tüm duvar simülasyonunda düzgünlük <b>%${gridU0}</b> seviyesine düşmektedir; bunun nedeni dikeyde optik projeksiyonun duvarı tam kaplamaması (${round(Math.max(0, s.heightM - cardActiveH), 2)}m dikey açık) sonucu kenar karanlık bölgeleridir. Aktif projeksiyon alanı içindeki 9-nokta homojenlik ise <b>%${u0}</b> ile yüksektir. Fiziksel kaplama eksikliği giderilmeden tüm yüzey homojenlik onayı verilemez.`
              : +u0 >= 70 
              ? `Bu kurulumdaki <b>%${u0}</b> düzgünlük oranı yüksek homojenlik sınıfındadır (U0 ≥ %70 Proje Kabul Kriteri).`
              : +u0 >= 50 
              ? `Bu kurulumdaki <b>%${u0}</b> düzgünlük oranı sınırlı homojenlik seviyesindedir [Kurum İçi Hedef / Non-Standard]; köşelerde optik düşüş görülür.`
              : `❌ DİKKAT (FAIL): <b>%${u0}</b> düzgünlük oranı kritik seviyede yetersizdir (U0 < %50). Yüksek ortalama aydınlık bu homojenlik kaybını telafi edemez ve mühendislik standardında ACCEPTABLE kabul edilemez.`}
          </div>

          <!-- Projektör Kapsama & Dağılım Cetveli -->
          ${s.distributionRows && s.distributionRows.length > 0 ? `
            <div style="margin-top: 10px;">
              <div style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                📏 Projektör Kapsama, Atım ve Bindirme (Overlap) Dağılım Cetveli:
              </div>
              <table class="compact-table" style="background:#ffffff; font-size:11px;">
                <thead style="background:#f1f5f9; color:#334155;">
                  <tr>
                    <th>Cihaz Kodu</th>
                    <th>Başlangıç</th>
                    <th>Bitiş</th>
                    <th>Açılan Genişlik</th>
                    <th>Optik Merkez (X)</th>
                    <th>Atım (D) / TR</th>
                    <th>Komşu Örtüşme (Blend)</th>
                  </tr>
                </thead>
                <tbody>
                  ${s.distributionRows.map((r) => `
                    <tr>
                      <td><b>${esc(r.code)}</b> ${r.rowName ? `<span style="font-size:10px; color:#64748b;">(${esc(r.rowName)})</span>` : ''}</td>
                      <td style="font-family:monospace;">${r.startX.toFixed(2)} m</td>
                      <td style="font-family:monospace;">${r.endX.toFixed(2)} m</td>
                      <td style="font-family:monospace; color:#059669; font-weight:bold;">${r.widthM.toFixed(2)} m</td>
                      <td style="font-family:monospace; color:#0284c7;">${r.centerX.toFixed(2)} m</td>
                      <td style="font-family:monospace; color:#475569;">D=${r.throwDistM.toFixed(2)}m (TR: ${r.throwRatio}:1)</td>
                      <td style="color:#b45309; font-weight:600;">${esc(r.overlapText)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>
        `;
      }).join('');

      blocks.push(`<section class="report-section">
        <h2>${tr.lux}</h2>
        ${surfaceCards}
      </section>`);
    } else if (p.lux && p.lux.widthM > 0 && p.lux.heightM > 0 && p.lux.ansiLumens.length > 0) {
      const lx = computeLux({
        ansiLumens: p.lux.ansiLumens,
        brightnessPct: p.lux.brightnessPct,
        width: p.lux.widthM,
        height: p.lux.heightM,
        gain: p.lux.gain,
        ambientLux: p.lux.ambientLux,
      });
      assumptions.push(...lx.assumptions);
      blocks.push(`<section class="report-section">
        <h2>${tr.lux}</h2>
        <table><tbody>
          <tr><th>${tr.totalFlux}</th><td><b>${round(lx.totalLumens, 0)} ANSI Lümen</b></td><th>${tr.illuminance}</th><td><b>${round(lx.illuminanceLux, 1)} Lux</b> (${round(lx.illuminanceFc, 1)} fc)</td></tr>
          <tr><th>${tr.luminance}</th><td><b>${round(lx.luminanceNits, 1)} cd/m² (Nit)</b> (${round(lx.luminanceFL, 1)} fL)</td><th>Ekran Gain / Yansıtma</th><td>${p.lux.gain} Gain</td></tr>
        </tbody></table>
      </section>`);
    }
  }

  // 6. ÇOKLU PROJEKTÖR & KANVAS HARİTALAMA (YÜZEY BAZLI AYRI PAFTALAR: ZEMİN, SAĞ DUVAR, SOL DUVAR VB.)
  if (p.sections.multiProjector) {
    const surfsToRender = p.plannerSurfaces && p.plannerSurfaces.length > 0
      ? (p.enabledSurfaceIds !== undefined
          ? p.plannerSurfaces.filter((s: any) => p.enabledSurfaceIds!.includes(s.id))
          : p.plannerSurfaces)
      : [];

    if (surfsToRender.length > 0) {
      const surfaceCardsHtml = surfsToRender.map((s: any, sIdx: number) => {
        const svg = generateSurfaceMultiSvg(s);
        const area = round(s.areaM2 || (s.effectiveWidthM * s.effectiveHeightM), 2);
        const totalPj = s.cols * s.rows;
        const matchedUnitWatt = p.interProjectorAnalysis?.projectors.find(pj => pj.surfaceId === s.id)?.powerW
          || resolveProjectorWatts(s.projectorModel || (p.photometricSurfaces?.find(ps => ps.surfaceId === s.id) as any)?.projectorModel || p.projection?.projectorName, 1350);
        const totalPjWatt = totalPj * matchedUnitWatt;
        const matchedScenario = p.scenarios?.find(sc => sc.surfaceId === s.id);
        const matchedSurfacePhoto = p.photometricSurfaces?.find(ps => ps.surfaceId === s.id);
        const unitLmFallback = p.projectionScreens?.[0]?.ansiLumens || p.projection?.ansiLumens || 10000;
        const totalLumens = matchedSurfacePhoto?.totalNominalLumens
          ?? (matchedScenario && matchedScenario.unitLumens > 0 ? matchedScenario.projectorCount * matchedScenario.unitLumens : undefined)
          ?? (matchedSurfacePhoto?.effectiveTotalLumens
            ? Math.round(matchedSurfacePhoto.effectiveTotalLumens / ((matchedSurfacePhoto.netEfficiencyPct ?? 90) / 100))
            : totalPj * unitLmFallback);
        const titleText = /^\d+\.\s*/.test(s.name) ? esc(s.name) : `${sIdx + 1}. ${esc(s.name)}`;
        const nativeW = s.projW || (s.orient === 'portrait' ? (s.customH || 1200) : (s.customW || 1920));
        const nativeH = s.projH || (s.orient === 'portrait' ? (s.customW || 1920) : (s.customH || 1200));
        const physCov = evaluatePhysicalCoverage({
          surfaceWidthM: s.effectiveWidthM,
          surfaceHeightM: s.effectiveHeightM,
          cols: s.cols || 1,
          rows: s.rows || 1,
          projW: nativeW,
          projH: nativeH,
          throwDistM: s.throwDistM || 0,
          throwRatio: s.throwRatio || 0,
          overlapX: s.overlapX,
          overlapY: s.overlapY,
          ovPxX: s.ovPxX,
          ovPxY: s.ovPxY,
        });
        const rawW = s.totalRawW || (s.cols * nativeW);
        const rawH = s.totalRawH || (s.rows * nativeH);
        const combinedW = s.projNetW || s.netW;
        const combinedH = s.projNetH || s.netH;
        const lostOvW = s.totalOvW ?? Math.max(0, rawW - combinedW);
        const lostOvH = s.totalOvH ?? Math.max(0, rawH - combinedH);
        const lostPx = s.lostPixelsTotal ?? Math.max(0, rawW * rawH - combinedW * combinedH);
        const lostPct = s.lostPixelsPct ?? round((lostPx / Math.max(1, rawW * rawH)) * 100, 1);
        const pxPerM = s.pxPerMeterW || round(s.netW / Math.max(0.1, s.effectiveWidthM), 1);
        const pxPerMH = s.pxPerMeterH || round(s.netH / Math.max(0.1, s.effectiveHeightM), 1);
        const pxPerM2Val = s.pxPerM2 || Math.round((s.netW * s.netH) / Math.max(0.1, area));
        const ppiVal = s.ppi || round(25.4 / Math.max(0.01, s.avgMmPerPx || 1), 1);
        const lostWallArea = s.lostWallAreaM2 ?? round(area * (lostPct / 100), 2);
        const wallPxW = s.aspectW || s.netW;
        const wallPxH = s.aspectH || s.netH;

        const safeOvX = Math.min(Math.max(0, nativeW - 1), Math.max(0, s.ovPxX || 0));
        const safeOvY = Math.min(Math.max(0, nativeH - 1), Math.max(0, s.ovPxY || 0));
        const stepX = Math.max(1, nativeW - safeOvX);
        const stepY = Math.max(1, nativeH - safeOvY);
        const isCurved =
          s.geometry === 'concave_arc' ||
          s.geometry === 'cylinder_360' ||
          s.geometry === 'dome' ||
          s.geometry === 'sphere';
        const sagVal = s.sagittaM || 0;
        const bendPct = isCurved
          ? Math.min(25, Math.max(5, Math.round((sagVal / Math.max(0.5, s.effectiveWidthM || 1)) * 100)))
          : 0;
        const warpTmpl = isCurved ? createCurvedWarp(nativeW, nativeH, 4, 4, bendPct, 'concave') : undefined;
        const wallCenterH = (s.effectiveHeightM || 2.5) / 2 + (s.projShiftYM || 0);
        const mountDiff =
          s.type === 'wall' && s.projMountHeightM !== undefined
            ? Math.abs(s.projMountHeightM - wallCenterH)
            : 0;
        const tiltVDeg = mountDiff > 0.05 ? round((Math.atan2(mountDiff, Math.max(0.5, s.throwDistM || 4)) * 180) / Math.PI, 1) : 0;
        const shiftXDiff = Math.abs(s.projShiftXM || 0);
        const tiltHDeg = shiftXDiff > 0.05 ? round((Math.atan2(shiftXDiff, Math.max(0.5, s.throwDistM || 4)) * 180) / Math.PI, 1) : 0;
        const singleH = s.singleProjHeightM || (s.effectiveHeightM || 2.5);
        const singleW = s.singleProjWidthM || (s.effectiveWidthM || 4);
        const opticalShiftOk = mountDiff <= singleH * 0.5 && shiftXDiff <= singleW * 0.35;

        const geomSlots: ProjectorSlot[] = [];
        for (let rr = 0; rr < s.rows; rr++) {
          for (let cc = 0; cc < s.cols; cc++) {
            geomSlots.push({
              id: `${s.id || sIdx}-P${rr * s.cols + cc + 1}`,
              label: `PJ-${rr * s.cols + cc + 1}`,
              x: cc * stepX,
              y: rr * stepY,
              w: nativeW,
              h: nativeH,
              blend: {
                l: cc > 0 ? safeOvX : 0,
                r: cc < s.cols - 1 ? safeOvX : 0,
                t: rr > 0 ? safeOvY : 0,
                b: rr < s.rows - 1 ? safeOvY : 0,
              },
              warp: warpTmpl,
              keystone:
                tiltVDeg > 0 || tiltHDeg > 0
                  ? { vDeg: tiltVDeg, hDeg: tiltHDeg, useOpticalShift: opticalShiftOk }
                  : undefined,
            });
          }
        }
        const otherMmList = surfsToRender
          .filter((_: any, oi: number) => oi !== sIdx)
          .map((o: any) => o.avgMmPerPx || round((o.effectiveWidthM * 1000) / Math.max(1, o.netW), 2))
          .filter((v: number) => Number.isFinite(v) && v > 0);
        const actCovW = (physCov && physCov.coveredWidthM > 0.1) ? physCov.coveredWidthM : s.effectiveWidthM;
        const actCovH = (physCov && physCov.coveredHeightM > 0.1) ? physCov.coveredHeightM : s.effectiveHeightM;
        const actCovArea = round(actCovW * actCovH, 2);
        const geoSum = computeGeometricMappingSummary({
          slots: geomSlots,
          wallWidthM: actCovW,
          wallHeightM: actCovH,
          gamma: 2.2,
          surfaceGeometry: (s.geometry || 'flat') as MappingSurfaceGeometry,
          radiusM: s.radiusM,
          angleDeg: s.angleDeg,
          chordWidthM: s.chordWidthM,
          sagittaM: s.sagittaM,
          throwDistM: s.throwDistM,
          mmPerPxW: round((actCovW * 1000) / Math.max(1, combinedW), 3),
          mmPerPxH: round((actCovH * 1000) / Math.max(1, combinedH), 3),
          isCircularMask: s.isCircularMask,
          otherSurfaceMmPerPx: otherMmList,
          keystoneVDeg: tiltVDeg,
          keystoneHDeg: tiltHDeg,
          useOpticalShift: opticalShiftOk,
        });
        return [
          '<div class="surface-multi-card">',
          '  <div class="surface-multi-card-header">',
          '    <h3 class="surface-multi-card-title">',
          '      ' + titleText + ' — Çoklu Projeksiyon Yerleşimi',
          '    </h3>',
          '    <span class="surface-multi-card-badge">',
          '      ' + s.cols + ' × ' + s.rows + ' = ' + totalPj + ' Projektör (' + (s.orient === 'portrait' ? 'Dikey/Portrait' : 'Yatay/Landscape') + ')',
          '    </span>',
          '  </div>',
          '  <table>',
          '    <tbody>',
          '      <tr>',
          '        <th>Fiziksel Boyut & Alan</th>',
          '        <td><b>' + s.effectiveWidthM + 'm × ' + s.effectiveHeightM + 'm</b> (' + area + ' m²)</td>',
          '        <th>Net İçerik Çözünürlüğü</th>',
          '        <td><b>' + s.netW + ' × ' + s.netH + ' px</b> (' + round((s.netW * s.netH) / 1000000, 2) + ' MP)</td>',
          '      </tr>',
          '      <tr>',
          '        <th>Projektör Başı Çözünürlük</th>',
          '        <td>' + nativeW + ' × ' + nativeH + ' px</td>',
          '        <th>Overlap (Bindirme) Oranı</th>',
          '        <td>Yatay: <b>%' + (s.cols > 1 ? s.overlapX : 0) + '</b> (' + (s.cols > 1 ? (s.ovPxX || 0) : 0) + ' px) | Dikey: <b>%' + (s.rows > 1 ? s.overlapY : 0) + '</b> (' + (s.rows > 1 ? (s.ovPxY || 0) : 0) + ' px)</td>',
          '      </tr>',
          '      <tr>',
          '        <th>Lens & Atım Mesafesi (D)</th>',
          '        <td><b>D = ' + s.throwDistM + ' m</b> (Atım Oranı: <b>' + s.throwRatio + ':1</b>)</td>',
          '        <th>Piksel Yoğunluğu & Kalite</th>',
          '        <td>Kanvas: <b>H ' + round((s.effectiveWidthM * 1000) / Math.max(1, s.netW), 2) + ' / V ' + round((s.effectiveHeightM * 1000) / Math.max(1, s.netH), 2) + ' mm/px</b> · Raster: H ' + round((s.effectiveWidthM * 1000) / Math.max(1, combinedW), 2) + ' / V ' + round((s.effectiveHeightM * 1000) / Math.max(1, combinedH), 2) + ' mm/px (İzleme: ' + s.viewDistM + 'm)</td>',
          '      </tr>',
          '      <tr>',
          '        <th>Kurulu Projektör Gücü</th>',
          '        <td>' + totalPj + ' Adet × ' + matchedUnitWatt + 'W = <b>' + totalPjWatt + ' W</b> (' + round(totalPjWatt / 1000, 2) + ' kW)</td>',
          '        <th>Tahmini Işık Akısı (Toplam)</th>',
          '        <td><b>~' + totalLumens.toLocaleString('tr-TR') + ' ANSI Lümen</b></td>',
          '      </tr>',
          '      <tr>',
          '        <th>Fiziksel Yüzey Kaplama</th>',
          '        <td colspan="3" style="' + (physCov.verdict === 'FAIL' ? 'color:#dc2626; font-weight:700;' : physCov.verdict === 'PASS' ? 'color:#059669; font-weight:600;' : 'color:#b45309;') + '">' + (physCov.verdict === 'FAIL' ? '⛔ FAIL — ' : physCov.verdict === 'PASS' ? '✓ PASS — ' : '❓ UNKNOWN — ') + esc(physCov.summaryMessage) + '</td>',
          '      </tr>',
          '    </tbody>',
          '  </table>',
          ...(p.sections.includePixelMapChain !== false
            ? [
                '  <div style="margin-top:8px; break-inside:avoid; page-break-inside:avoid;">',
                '    <div style="font-size:11px; font-weight:700; color:#0f172a; margin-bottom:4px;">📋 Tablo A &amp; Tablo B: Birleşik Projeksiyon Rasteri vs Kırpılmış İçerik Kanvası (Eksen Bazlı Piksel Metrikleri)</div>',
                '    <table class="compact-table" style="background:#f8fafc; font-size:10px; margin-bottom:6px;">',
                '      <thead><tr><th>Kanvas Türü</th><th>Çözünürlük &amp; MP</th><th style="text-align:right;">Yatay (H) px/m · mm/px · PPI</th><th style="text-align:right;">Dikey (V) px/m · mm/px · PPI</th><th style="text-align:right;">Yoğunluk (px/m²) &amp; Anizotropi</th></tr></thead>',
                '      <tbody>',
                '        <tr><td><b>Tablo A — Birleşik Projeksiyon Rasteri (Aktif Optik ' + actCovW + '×' + actCovH + 'm)</b></td><td style="font-family:monospace;"><b>' + combinedW + ' × ' + combinedH + ' px</b> (' + round((combinedW * combinedH) / 1e6, 2) + ' MP)</td><td style="text-align:right; font-family:monospace;">' + round(combinedW / actCovW, 2) + ' px/m · <b>' + round((actCovW * 1000) / Math.max(1, combinedW), 3) + ' mm/px</b> · ' + round((combinedW / actCovW) * 0.0254, 2) + ' PPI</td><td style="text-align:right; font-family:monospace;">' + round(combinedH / actCovH, 2) + ' px/m · <b>' + round((actCovH * 1000) / Math.max(1, combinedH), 3) + ' mm/px</b> · ' + round((combinedH / actCovH) * 0.0254, 2) + ' PPI</td><td style="text-align:right; font-family:monospace;"><b>' + Math.round((combinedW * combinedH) / Math.max(0.1, actCovArea)).toLocaleString('tr-TR') + ' px/m²</b> · Anizotropi %' + round((Math.abs(combinedW / actCovW - combinedH / actCovH) / Math.max(0.1, combinedW / actCovW, combinedH / actCovH)) * 100, 2) + ' (Kare Piksel)</td></tr>',
                '        <tr class="highlight-cell"><td><b>Tablo B — Kırpılmış İçerik Kanvası (Hedef Duvar Kare Piksel ' + s.effectiveWidthM + '×' + s.effectiveHeightM + 'm)</b></td><td style="font-family:monospace;"><b>' + s.netW + ' × ' + s.netH + ' px</b> (' + round((s.netW * s.netH) / 1e6, 2) + ' MP)</td><td style="text-align:right; font-family:monospace;">' + round(s.netW / Math.max(0.1, s.effectiveWidthM), 2) + ' px/m · <b>' + round((s.effectiveWidthM * 1000) / Math.max(1, s.netW), 3) + ' mm/px</b> · ' + round((s.netW / Math.max(0.1, s.effectiveWidthM)) * 0.0254, 2) + ' PPI</td><td style="text-align:right; font-family:monospace;">' + round(s.netH / Math.max(0.1, s.effectiveHeightM), 2) + ' px/m · <b>' + round((s.effectiveHeightM * 1000) / Math.max(1, s.netH), 3) + ' mm/px</b> · ' + round((s.netH / Math.max(0.1, s.effectiveHeightM)) * 0.0254, 2) + ' PPI</td><td style="text-align:right; font-family:monospace;"><b>' + Math.round((s.netW * s.netH) / Math.max(0.1, area)).toLocaleString('tr-TR') + ' px/m²</b> · Anizotropi %0.00</td></tr>',
                '      </tbody>',
                '    </table>',
                '    <div style="font-size:11px; font-weight:700; color:#0f172a; margin-bottom:4px;">📐 8 Adımlı Pixel Map &amp; Çözünürlük Hesap Zinciri (Toplam Özet)</div>',
                '    <table class="compact-table" style="background:#ffffff; font-size:10.5px;">',
                '      <thead><tr><th style="width:30%;">Hesaplama Kalemi</th><th style="width:42%;">Detay / Katsayı</th><th style="width:28%; text-align:right;">Sonuç</th></tr></thead>',
                '      <tbody>',
                '        <tr><td><b>1. Native Raster (Tekil Projektör)</b></td><td style="font-family:monospace;">' + totalPj + ' PJ (' + (s.orient === 'portrait' ? 'Dikey' : 'Yatay') + ')</td><td style="text-align:right; font-family:monospace;"><b>' + nativeW + ' × ' + nativeH + ' px</b> (' + round((nativeW * nativeH) / 1000000, 2) + ' MP)</td></tr>',
                '        <tr><td><b>2. Fiziksel Piksel Yoğunluğu</b></td><td style="font-family:monospace;">Aktif Optik Raster (' + combinedW + '×' + combinedH + ' ÷ ' + actCovArea + 'm²): <b>' + Math.round((combinedW * combinedH) / Math.max(0.1, actCovArea)).toLocaleString('tr-TR') + ' px/m²</b> · Net Kanvas (' + s.netW + '×' + s.netH + ' ÷ ' + area + 'm²): ' + pxPerM2Val.toLocaleString('tr-TR') + ' px/m²</td><td style="text-align:right; font-family:monospace;"><b>H: ' + round((combinedW / Math.max(0.1, actCovW)) * 0.0254, 2) + ' / V: ' + round((combinedH / Math.max(0.1, actCovH)) * 0.0254, 2) + ' PPI</b></td></tr>',
                '        <tr><td><b>3. Pixel per Meter (px/m)</b></td><td style="font-family:monospace;">Aktif Optik Projeksiyon (' + actCovW + '×' + actCovH + 'm): H <b>' + round(combinedW / actCovW, 2) + '</b> / V <b>' + round(combinedH / actCovH, 2) + ' px/m</b> (Anizotropi %' + round((Math.abs(combinedW / actCovW - combinedH / actCovH) / Math.max(0.1, combinedW / actCovW, combinedH / actCovH)) * 100, 2) + ' — Kare Piksel)' + (Math.abs(s.effectiveHeightM - actCovH) > 0.02 ? ' · <span style="color:#64748b;">(Tüm duvara esnetilirse V ' + round(combinedH / s.effectiveHeightM, 1) + ' px/m, %' + round((Math.abs(combinedW / s.effectiveWidthM - combinedH / s.effectiveHeightM) / Math.max(0.1, combinedW / s.effectiveWidthM, combinedH / s.effectiveHeightM)) * 100, 1) + ' stretch)</span>' : '') + ' · Hedef Kanvas (' + s.netW + '×' + s.netH + '): H <b>' + round(s.netW / Math.max(0.1, s.effectiveWidthM), 2) + '</b> / V <b>' + round(s.netH / Math.max(0.1, s.effectiveHeightM), 2) + ' px/m</b></td><td style="text-align:right; font-family:monospace;">Aktif Optik H: <b>' + round(combinedW / actCovW, 2) + ' px/m</b></td></tr>',
                '        <tr><td><b>4. Piksel Aralığı (mm/px)</b></td><td style="font-family:monospace;">Aktif Projeksiyon: H <b>' + round((actCovW * 1000) / Math.max(1, combinedW), 3) + '</b> / V <b>' + round((actCovH * 1000) / Math.max(1, combinedH), 3) + ' mm/px</b> · Kırpılmış İçerik Kanvası: H <b>' + round((s.effectiveWidthM * 1000) / Math.max(1, s.netW), 3) + '</b> / V <b>' + round((s.effectiveHeightM * 1000) / Math.max(1, s.netH), 3) + ' mm/px</b></td><td style="text-align:right; font-family:monospace;">Aktif H: <b>' + round((actCovW * 1000) / Math.max(1, combinedW), 3) + ' mm/px</b></td></tr>',
                '        <tr><td><b>5. Duvar Toplam Piksel Karşılığı</b></td><td style="font-family:monospace;">' + s.effectiveWidthM + 'm × ' + s.effectiveHeightM + 'm (Oran ' + (s.aspectPhysical || round(s.effectiveWidthM / Math.max(0.1, s.effectiveHeightM), 2)) + ':1)</td><td style="text-align:right; font-family:monospace;"><b>' + wallPxW + ' × ' + wallPxH + ' px</b></td></tr>',
                '        <tr><td><b>6. Ham Toplam → Blended Raster</b></td><td style="font-family:monospace;">Ham: ' + rawW + ' × ' + rawH + ' px · Overlap (' + nativeW + ' px bazlı %' + (s.cols > 1 ? s.overlapX : 0) + '): -' + lostOvW + ' px Yatay / -' + lostOvH + ' px Dikey</td><td style="text-align:right; font-family:monospace; color:#0284c7;"><b>Blended: ' + combinedW + ' × ' + combinedH + ' px</b> (-%' + lostPct + ')</td></tr>',
                '        <tr><td><b>7. Yüzey Oranı Kırpma Farkı &amp; Geometrik Kayıp</b></td><td style="font-family:monospace;">Duvar Oranı Kırpması: -' + Math.max(0, combinedW - s.netW) + ' px (Yatay) · -' + Math.max(0, combinedH - s.netH) + ' px (Dikey)</td><td style="text-align:right; font-family:monospace; color:#b45309;"><b>Keystone/Warp: -%' + geoSum.totalGeometricLossPct + '</b></td></tr>',
                '        <tr class="highlight-cell"><td><b>8. SURFACE CONTENT RASTER (İçerik Kanvası)</b></td><td style="font-family:monospace;">Oran: ' + (s.aspectContent || round(s.netW / Math.max(1, s.netH), 2)) + ':1' + (!physCov.isFullyCovered && physCov.verdict === 'FAIL' ? ' · <span style="color:#dc2626; font-weight:700;">⚠ Gerçek kaplama ' + physCov.coveredWidthM + '×' + physCov.coveredHeightM + 'm (eksik)</span>' : ' (Fiziksel yüzey oranına göre üretim kanvası)') + '</td><td style="text-align:right; font-family:monospace;"><b>' + s.netW + ' × ' + s.netH + ' px (' + round((s.netW * s.netH) / 1000000, 2) + ' MP)</b></td></tr>',
                '      </tbody>',
                '    </table>',
                '  </div>',
              ]
            : []),
          ...(p.sections.includeGeometricChain !== false
            ? [
                '  <div style="margin-top:8px; break-inside:avoid; page-break-inside:avoid;">',
                '    <div style="font-size:11px; font-weight:700; color:#0f172a; margin-bottom:4px;">🎯 7 Adımlı Geometrik Düzeltme &amp; Mapping Hesap Zinciri (Toplam Özet) — <span style="color:#4338ca;">' + esc(geoSum.qualityGrade) + '</span></div>',
                '    <table class="compact-table" style="background:#ffffff; font-size:10.5px;">',
                '      <thead><tr><th style="width:30%;">Geometrik Kalem</th><th style="width:42%;">Parametre / Analiz</th><th style="width:28%; text-align:right;">Sonuç / Kayıp</th></tr></thead>',
                '      <tbody>',
                '        <tr><td><b>1. Keystone Düzeltmesi</b></td><td style="font-family:monospace;">Dikey ±' + geoSum.maxKeystoneVDeg + '° · Yatay ±' + geoSum.maxKeystoneHDeg + '°' + (geoSum.opticalShiftActive ? ' (Optik Shift)' : '') + '</td><td style="text-align:right; font-family:monospace; color:#b45309;">Daralma %' + geoSum.trapezoidShrinkPct + ' · <b>-%' + geoSum.keystonePixelLossPct + '</b></td></tr>',
                '        <tr><td><b>2. Warp / Mesh Mapping</b></td><td style="font-family:monospace;">' + esc(geoSum.meshGridLabel) + ' (Aktif Warp: ' + geoSum.activeWarpSlots + '/' + totalPj + ' PJ)</td><td style="text-align:right; font-family:monospace;">Ort: ' + geoSum.avgWarpDisplacementPx + ' px (<b>-%' + geoSum.warpPixelLossPct + '</b>)</td></tr>',
                '        <tr><td><b>3. Surface Mapping</b></td><td>' + esc(geoSum.surfaceGeometryLabel) + '</td><td style="text-align:right; font-family:monospace;">Kiriş ' + geoSum.chordWidthM + 'm · Kavis ' + geoSum.sagittaM + 'm</td></tr>',
                '        <tr><td><b>4. Masking (Maskeleme)</b></td><td style="font-family:monospace;">' + (geoSum.circularMaskActive ? 'Dairesel / Kubbe Maske' : 'Tam Çerçeve') + '</td><td style="text-align:right; font-family:monospace;">Maskeli -%' + geoSum.maskedOutPct + ' · <b>Aktif %' + geoSum.visibleActivePct + '</b></td></tr>',
                '        <tr><td><b>5. Edge Blending</b></td><td style="font-family:monospace;">' + Math.max(0, (s.cols - 1) * s.rows + (s.rows - 1) * s.cols) + ' Bölge · ' + geoSum.blendWidthPxX + 'px (' + geoSum.blendPhysicalWidthM + 'm · Geometrik kayıptan bağımsız parlaklık geçişi)</td><td style="text-align:right; font-family:monospace;">γ=' + geoSum.gamma + ' · Orta: <b>%' + geoSum.midpointDrivePct + '</b></td></tr>',
                '        <tr><td><b>6. Geometrik Bozulma Analizi</b></td><td style="font-family:monospace;">Aktif Optik Anizotropi ' + geoSum.pixelAnisotropyRatio + ':1 (Kare Piksel %' + round((1 - 1 / Math.max(1, geoSum.pixelAnisotropyRatio)) * 100, 2) + ')' + (Math.abs(s.effectiveHeightM - actCovH) > 0.02 ? ' · Esnetme (Stretch) Farkı %' + round((Math.abs(combinedW / s.effectiveWidthM - combinedH / s.effectiveHeightM) / Math.max(0.1, combinedW / s.effectiveWidthM, combinedH / s.effectiveHeightM)) * 100, 1) : '') + (geoSum.trapezoidShrinkPct > 0 || geoSum.warpPixelLossPct > 0 ? ' · Daralma %' + round(geoSum.trapezoidShrinkPct + geoSum.warpPixelLossPct, 1) : '') + ' · ΔD ' + geoSum.depthOfFieldSpreadM + 'm</td><td style="text-align:right;">' + esc(geoSum.distortionLabel) + '</td></tr>',
                '        <tr><td><b>7. Çoklu Yüzey Eşleştirme</b></td><td style="font-family:monospace;">' + geoSum.matchedSurfacesCount + '/' + geoSum.totalSurfacesCount + ' Yüzey · ' + geoSum.seamTransitionCount + ' Geçiş</td><td style="text-align:right; font-family:monospace;">Sapma %' + geoSum.densitySpreadPct + ' (' + esc(geoSum.multiSurfaceStatus) + ')</td></tr>',
                '        <tr class="highlight-cell"><td><b>8. TOPLAM EFEKTİF ÇÖZÜNÜRLÜK</b></td><td style="font-family:monospace;">Geometrik Verim (Overlap/Kırpma Hariç): <b>%' + geoSum.geometricEfficiencyPct + '</b> (Kayıp -%' + geoSum.totalGeometricLossPct + ')</td><td style="text-align:right; font-family:monospace;"><b>' + geoSum.effectiveResolutionW + ' × ' + geoSum.effectiveResolutionH + ' px (' + geoSum.effectiveUsableMP + ' MP)</b></td></tr>',
                '      </tbody>',
                '    </table>',
                '  </div>',
              ]
            : []),
          p.sections.includeViewingQuality !== false
            ? (() => {
                const vqPhoto = p.photometricSurfaces?.find(ps => ps.surfaceId === s.id || ps.surfaceName === s.name);
                const vqU0 = vqPhoto?.uniformityU0 ? (vqPhoto.uniformityU0 <= 1 ? round(vqPhoto.uniformityU0 * 100, 1) : round(vqPhoto.uniformityU0, 1)) : 82;
                const vqU1 = vqPhoto?.uniformityU1 ? (vqPhoto.uniformityU1 <= 1 ? round(vqPhoto.uniformityU1 * 100, 1) : round(vqPhoto.uniformityU1, 1)) : 85;
                const vqOv = s.ovPxX && s.ovPxX > 0 ? +((s.ovPxX / Math.max(1, nativeW)) * 100).toFixed(2) : (s.overlapMode === 'percent' ? (s.overlapX ?? 0) : 0);
                const vqMain = renderViewingQualityA4Html(
                  computeViewingQualityAnalysis({
                    widthM: s.effectiveWidthM,
                    heightM: s.effectiveHeightM,
                    resW: s.netW,
                    resH: s.netH,
                    viewingDistanceM: s.viewDistM,
                    offAxisAngleDeg: 0,
                    screenGain: vqPhoto?.screenGain ?? 1.0,
                    reflectance: vqPhoto?.surfaceReflectance ?? 0.85,
                    avgLux: vqPhoto?.avgLux ?? 350,
                    ambientLux: vqPhoto?.ambientLux ?? 0,
                    nativeContrast: 2000,
                    uniformityU0: vqU0,
                    uniformityU1: vqU1,
                    projectorCount: Math.max(1, totalPj),
                    overlapPct: vqOv,
                    colorCalibrated: true,
                  }),
                  {
                    sourceLabel: '9-Nokta LuxField',
                    gridU0Pct: vqPhoto?.gridUniformityU0Pct,
                    gridU1Pct: vqPhoto?.gridUniformityU1Pct,
                  }
                );
                if (!physCov.isFullyCovered && physCov.coveredHeightM > 0.1 && physCov.coveredWidthM > 0.1) {
                  const actualVq = computeViewingQualityAnalysis({
                    widthM: physCov.coveredWidthM,
                    heightM: physCov.coveredHeightM,
                    resW: combinedW,
                    resH: combinedH,
                    viewingDistanceM: s.viewDistM,
                    offAxisAngleDeg: 0,
                    screenGain: vqPhoto?.screenGain ?? 1.0,
                    reflectance: vqPhoto?.surfaceReflectance ?? 0.85,
                    avgLux: vqPhoto?.avgLux ?? 350,
                    ambientLux: vqPhoto?.ambientLux ?? 0,
                    nativeContrast: 2000,
                    uniformityU0: vqU0,
                    uniformityU1: vqU1,
                    projectorCount: Math.max(1, totalPj),
                    overlapPct: vqOv,
                    colorCalibrated: true,
                  });
                  return vqMain + '<div style="margin:6px 0 8px 0; padding:6px 10px; background:#fffbeb; border:1px solid #fcd34d; border-left:3px solid #d97706; border-radius:4px; font-size:9.5px; color:#92400e;">'
                    + '<b>📐 Hedef Duvar vs Gerçek Projeksiyon Alanı PPD Farkı (İzleme Mesafesi: ' + (s.viewDistM || 3.5) + 'm):</b><br/>'
                    + '• <b>Hedef Duvar Geometrisi (' + s.effectiveWidthM + '×' + s.effectiveHeightM + 'm, ' + s.netW + '×' + s.netH + ' px):</b> Görüş Açısı FOV: <b>' + round(2 * Math.atan(s.effectiveWidthM / (2 * (s.viewDistM || 3.5))) * (180 / Math.PI), 1) + '° H × ' + round(2 * Math.atan(s.effectiveHeightM / (2 * (s.viewDistM || 3.5))) * (180 / Math.PI), 1) + '° V</b> → Ortalama: <b>' + round(s.netW / (2 * Math.atan(s.effectiveWidthM / (2 * (s.viewDistM || 3.5))) * (180 / Math.PI)), 1) + ' H × ' + round(s.netH / (2 * Math.atan(s.effectiveHeightM / (2 * (s.viewDistM || 3.5))) * (180 / Math.PI)), 1) + ' V PPD</b>.<br/>'
                    + '• <b>Aktif Optik Projeksiyon (' + physCov.coveredWidthM + '×' + physCov.coveredHeightM + 'm, ' + combinedW + '×' + combinedH + ' px):</b> Görüş Açısı FOV: <b>' + round(2 * Math.atan(physCov.coveredWidthM / (2 * (s.viewDistM || 3.5))) * (180 / Math.PI), 1) + '° H × ' + round(2 * Math.atan(physCov.coveredHeightM / (2 * (s.viewDistM || 3.5))) * (180 / Math.PI), 1) + '° V</b> → Ortalama: <b>' + actualVq.ppd + ' H × ' + actualVq.ppdVertical + ' V PPD</b> (Merkez On-Axis: ' + actualVq.ppdCenterH + '/' + actualVq.ppdCenterV + ' PPD, Oblik Kenar: ' + actualVq.ppdEdgeH + '/' + actualVq.ppdEdgeV + ' PPD). Optik piksel aralığı: <b>' + actualVq.mmPerPx + ' mm/px</b>.'
                    + '</div>';
                }
                return vqMain;
              })()
            : '',
          (() => {
            if (p.sections.includeFeasibilityAndRecs === false) return '';
            const matchedPhoto = p.photometricSurfaces?.find(ps => ps.surfaceId === s.id);
            const ovX = s.ovPxX && s.ovPxX > 0 ? +((s.ovPxX / Math.max(1, nativeW)) * 100).toFixed(2) : (s.overlapMode === 'percent' ? (s.overlapX ?? 15) : 0);
            const ovY = s.ovPxY && s.ovPxY > 0 ? +((s.ovPxY / Math.max(1, nativeH)) * 100).toFixed(2) : (s.overlapMode === 'percent' ? (s.overlapY ?? 10) : 0);
            const effPix = computeEffectiveMultiProjectorPixelArea({
              widthM: s.effectiveWidthM,
              heightM: s.effectiveHeightM,
              projW: nativeW,
              projH: nativeH,
              cols: Math.max(1, s.cols || 1),
              rows: Math.max(1, s.rows || 1),
              overlapPctX: ovX,
              overlapPctY: ovY,
              isClosedLoopX: s.geometry === 'cylinder_360' || s.geometry === 'sphere',
              keystoneDegH: tiltHDeg,
              keystoneDegV: tiltVDeg,
              isCurved,
            });
            const feas = evaluateSystemFeasibility({
              widthM: s.effectiveWidthM,
              heightM: s.effectiveHeightM,
              throwDistM: s.throwDistM || 4.0,
              throwRatio: s.throwRatio || 0.8,
              roomHeightM: p.interProjectorAnalysis?.roomDimensions?.heightM || Math.max(3.0, s.effectiveHeightM + 0.5, (s.projMountHeightM ?? 2.4) + 0.3),
              projMountHeightM: s.projMountHeightM ?? Math.max(2.2, s.effectiveHeightM - 0.15),
              viewDistM: s.viewDistM,
              cols: Math.max(1, s.cols || 1),
              rows: Math.max(1, s.rows || 1),
              projW: nativeW,
              projH: nativeH,
              overlapPct: ovX,
              avgLux: matchedPhoto?.avgLux ?? 350,
              minLux: matchedPhoto?.minLux,
              ambientLux: matchedPhoto?.ambientLux ?? 50,
              uniformityU0: matchedPhoto?.uniformityU0 ?? 78,
              keystoneDegH: tiltHDeg,
              keystoneDegV: tiltVDeg,
              isCurved,
            });
            const recs = recommendProjectorAndLenses({
              widthM: s.effectiveWidthM,
              heightM: s.effectiveHeightM,
              throwDistM: s.throwDistM || 4.0,
              cols: Math.max(1, s.cols || 1),
              rows: Math.max(1, s.rows || 1),
              overlapPct: ovX > 0 ? ovX : 15,
              targetLux: Math.max(300, Math.round(matchedPhoto?.avgLux ?? 350)),
              ambientLux: matchedPhoto?.ambientLux ?? 50,
              screenGain: matchedPhoto?.screenGain ?? 1.0,
              reflectance: matchedPhoto?.surfaceReflectance ?? 0.85,
              opticalEfficiency: (matchedPhoto?.netEfficiencyPct ?? 90) / 100,
              preferredNativeH: nativeH,
            });
            const altCompare = compareLayoutScenarios({
              room: {
                widthM: p.interProjectorAnalysis?.roomDimensions?.widthM || 14,
                lengthM: p.interProjectorAnalysis?.roomDimensions?.lengthM || 10,
                heightM: p.interProjectorAnalysis?.roomDimensions?.heightM || 3.5,
              },
              surface: {
                id: s.id,
                name: s.name,
                widthM: s.effectiveWidthM,
                heightM: s.effectiveHeightM,
                viewingDistanceM: s.viewDistM || 3.5,
              },
              projector: {
                model: 'Standart Projektör',
                cols: Math.max(1, s.cols || 1),
                rows: Math.max(1, s.rows || 1),
                nativeW,
                nativeH,
                ansiLumensPerUnit: matchedPhoto?.nominalLumensPerProj || p.projectionScreens?.[0]?.ansiLumens || p.projection?.ansiLumens || 10000,
                powerWPerUnit: matchedUnitWatt,
              },
              lens: {
                model: 'Karşılaştırma',
                throwDistM: s.throwDistM || 4.5,
                throwRatio: s.throwRatio || 0.8,
              },
              photometrics: {
                opticalEfficiencyPct: matchedPhoto?.netEfficiencyPct ?? 90,
                screenGain: matchedPhoto?.screenGain ?? 1.0,
                reflectance: matchedPhoto?.surfaceReflectance ?? 0.85,
                ambientLux: matchedPhoto?.ambientLux ?? 20,
              },
              blending: { overlapPctX: ovX },
              electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
            }, [2, 3, 4]);
            const optRowForCount = altCompare.find(r => r.projectorCount === Math.max(1, s.cols || 1)) || altCompare[0];
            const vertOverflowM = round(Math.max(0, singleH - s.effectiveHeightM), 2);
            const scenarioSplitHtml = optRowForCount ? `<div style="margin-top:8px; padding:6px 8px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; font-size:9.5px; break-inside:avoid; page-break-inside:avoid;">
              <div style="font-weight:700; color:#0f172a; margin-bottom:3px;">🔀 Senaryo A (Mevcut Manuel Lens) vs Senaryo B (Duvara Optimize Lens)</div>
              <div><b>Senaryo A (Mevcut):</b> ${totalPj}× TR ${s.throwRatio}:1 · %${ovX} overlap · Birleşik Raster: <b>${combinedW}×${combinedH} px</b> · Yüzey Kanvası: <b>${s.netW}×${s.netH} px</b>${vertOverflowM > 0.05 ? ` · <span style="color:#b45309;">Dikey +${vertOverflowM}m taşma</span>` : ''}</div>
              <div><b>Senaryo B (Optimize):</b> ${optRowForCount.projectorCount}× TR <b>${optRowForCount.requiredTR}:1</b> · %${optRowForCount.overlapPct} overlap · Kanvas: <b>${optRowForCount.contentW}×${optRowForCount.contentH} px</b> (${optRowForCount.mmPerPx} mm/px) · Dikey taşma yok</div>
            </div>` : '';
            const altCompareHtml = scenarioSplitHtml + `<div style="margin-top:8px; break-inside:avoid; page-break-inside:avoid;">
              <div style="font-size:10.5px; font-weight:700; color:#0f172a; margin-bottom:4px;">⚖️ Alternatif Senaryo Karşılaştırması (2, 3 ve 4 Projektör)</div>
              <table class="compact-table" style="font-size:9.5px; background:#ffffff;">
                <thead><tr><th>Senaryo</th><th>Overlap / TR</th><th>İçerik Kanvası</th><th style="text-align:right;">Efektif Akı / Lux</th><th style="text-align:right;">Güç / Montaj</th><th style="text-align:center;">Kaplama</th></tr></thead>
                <tbody>
                  ${altCompare.map(row => `<tr${row.isRecommended ? ' class="highlight-cell"' : ''}>
                    <td><b>${row.projectorCount} Projektör</b>${row.isRecommended ? ' ⭐' : ''}</td>
                    <td style="font-family:monospace;">%${row.overlapPct} · TR ${row.requiredTR}:1</td>
                    <td style="font-family:monospace;">${row.contentW}×${row.contentH} px (${row.mmPerPx} mm/px)</td>
                    <td style="text-align:right; font-family:monospace;">${row.effectiveLumens.toLocaleString('tr-TR')} lm · <b>${row.avgLux} lx</b></td>
                    <td style="text-align:right; font-family:monospace;">${row.totalPowerW} W · ${row.mountingComplexity}</td>
                    <td style="text-align:center; font-size:9px;"><b style="color:${row.coverageVerdict === 'PASS' ? '#059669' : '#dc2626'};">Kaplama: ${row.coverageVerdict}</b><br/>Piksel: <b style="color:${row.pixelEfficiencyVerdict === 'PASS' ? '#059669' : '#d97706'};">${row.pixelEfficiencyVerdict}</b> · Genel: <b style="color:${row.overallVerdict === 'PASS' ? '#059669' : row.overallVerdict === 'WARNING' ? '#d97706' : '#dc2626'};">${row.overallVerdict}</b></td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>`;
            return renderMultiProjFeasibilityAndRecsA4Html(effPix, feas, recs) + altCompareHtml;
          })(),
          '  <div class="diagram" style="margin-top: 10px;">',
          '    ' + svg,
          '  </div>',
          '</div>'
        ].join('\n');
      }).join('\n');

      blocks.push([
        '<section class="report-section" style="break-inside:auto; page-break-inside:auto;">',
        '  <h2>' + tr.multi + ' (Yüzey Bazlı Ayrı Paftalar)</h2>',
        '  <p class="section-intro">Mekandaki projeksiyon yüzeyleri aşağıda bağımsız paftalar halinde detaylandırılmıştır. Zemin ve duvarlar ayrı ayrı ele alınmış olup her yüzeyin matrisi, overlap oranları, net çözünürlükleri ve optik parametreleri sunulmuştur.</p>',
        '  ' + surfaceCardsHtml,
        '</section>'
      ].join('\n'));
    }
    if (p.mappingScreens && p.mappingScreens.length > 0) {
      const mapCards = p.mappingScreens.map((ms, idx) => {
        const L = ms.slots && ms.slots.length > 0 ? computeLayout(ms.slots) : null;
        if (L) warnings.push(...L.warnings);
        const pmSum = ms.slots && ms.slots.length > 0 ? computePixelMapSummary({ slots: ms.slots }) : null;
        const otherScreenMm = (p.mappingScreens ?? [])
          .filter((_, oi) => oi !== idx)
          .map(os => {
            try { return os.slots && os.slots.length > 0 ? computePixelMapSummary({ slots: os.slots }).avgMmPerPx : null; }
            catch { return null; }
          })
          .filter((v): v is number => typeof v === 'number' && v > 0);
        const geoSum = ms.slots && ms.slots.length > 0
          ? computeGeometricMappingSummary({ slots: ms.slots, gamma: ms.gamma ?? 2.2, otherSurfaceMmPerPx: otherScreenMm })
          : null;
        const svg = L ? layoutToSvg(L, { gridStep: 200, showCoords: true }) : '';
        return `<div class="surface-multi-card" style="margin-bottom:18px;">
          <div class="surface-multi-card-header">
            <h3 class="surface-multi-card-title">${esc(ms.name || `Ekran / Duvar #${idx + 1}`)}</h3>
            <span class="surface-multi-card-badge">${L ? `${L.canvasW} × ${L.canvasH} px · ${L.slots.length} Projektör` : 'Görsel / Logo'}</span>
          </div>
          ${ms.photoUrl ? `<div class="three-d-card" style="margin-bottom:12px;"><img src="${esc(ms.photoUrl)}" alt="${esc(ms.name)}" class="three-d-img" /></div>` : ''}
          ${L ? `<p style="font-size:12px;"><b>${tr.canvasRes}:</b> ${L.canvasW} × ${L.canvasH} px &nbsp;|&nbsp; <b>${tr.overlapCount}:</b> ${L.overlaps.length} &nbsp;|&nbsp; <b>Gamma:</b> ${ms.gamma ?? 2.2}</p>` : ''}
          ${p.sections.includePixelMapChain !== false && pmSum ? `<table class="compact-table" style="background:#ffffff; font-size:10.5px; margin-bottom:8px;">
            <thead><tr><th>Pixel Map Özeti</th><th>Detay</th><th style="text-align:right;">Sonuç</th></tr></thead>
            <tbody>
              <tr><td><b>1. Projektör Native Çözünürlüğü</b></td><td style="font-family:monospace;">${pmSum.projectorCount} PJ</td><td style="text-align:right; font-family:monospace;"><b>${pmSum.nativeW} × ${pmSum.nativeH} px</b> (${pmSum.nativeMP} MP)</td></tr>
              <tr><td><b>2–4. Piksel Yoğunluğu / px/m / mm/px</b></td><td style="font-family:monospace;">${pmSum.wallWidthM && pmSum.wallHeightM ? `${pmSum.wallWidthM}m × ${pmSum.wallHeightM}m` : 'Fiziksel ölçü girilmemiş'}</td><td style="text-align:right; font-family:monospace;">${pmSum.pxPerMeterW !== null ? `${pmSum.pxPerMeterW} px/m · ${pmSum.avgMmPerPx} mm/px · ${pmSum.ppi} PPI` : '—'}</td></tr>
              <tr><td><b>5–6. Birleşik Çözünürlük</b></td><td style="font-family:monospace;">Ham: ${pmSum.rawTotalW} × ${pmSum.rawTotalH} px</td><td style="text-align:right; font-family:monospace;"><b>${pmSum.combinedW} × ${pmSum.combinedH} px</b> (${pmSum.combinedMP} MP)</td></tr>
              <tr><td><b>7. Overlap Kaybedilen Alan</b></td><td style="font-family:monospace;">Yatay -${pmSum.lostPxW} px · Dikey -${pmSum.lostPxH} px</td><td style="text-align:right; font-family:monospace;"><b>-%${pmSum.lostOverlapPct}</b> (-${round(pmSum.lostOverlapPixels / 1000000, 2)} MP)</td></tr>
              <tr class="highlight-cell"><td><b>8. TOPLAM İÇERİK ÜRETİM ÇÖZÜNÜRLÜĞÜ</b></td><td style="font-family:monospace;">Oran ${pmSum.contentAspect}:1</td><td style="text-align:right; font-family:monospace;"><b>${pmSum.contentProductionW} × ${pmSum.contentProductionH} px (${pmSum.contentProductionMP} MP)</b></td></tr>
            </tbody>
          </table>` : ''}
          ${p.sections.includeGeometricChain !== false && geoSum ? `<div style="margin-bottom:8px; break-inside:avoid; page-break-inside:avoid;">
            <div style="font-size:11px; font-weight:700; color:#0f172a; margin-bottom:4px;">🎯 7 Adımlı Geometrik Düzeltme &amp; Mapping Hesap Zinciri — <span style="color:#4338ca;">${esc(geoSum.qualityGrade)}</span></div>
            <table class="compact-table" style="background:#ffffff; font-size:10.5px;">
              <thead><tr><th>Geometrik Kalem</th><th>Detay / Parametre</th><th style="text-align:right;">Sonuç</th></tr></thead>
              <tbody>
                <tr><td><b>1. Keystone Düzeltmesi</b></td><td style="font-family:monospace;">V ±${geoSum.maxKeystoneVDeg}° · H ±${geoSum.maxKeystoneHDeg}°${geoSum.opticalShiftActive ? ' (Optik Shift)' : ''}</td><td style="text-align:right; font-family:monospace;">Daralma %${geoSum.trapezoidShrinkPct} · -%${geoSum.keystonePixelLossPct}</td></tr>
                <tr><td><b>2. Warp / Mesh Mapping</b></td><td style="font-family:monospace;">${esc(geoSum.meshGridLabel)}</td><td style="text-align:right; font-family:monospace;">Ort ${geoSum.avgWarpDisplacementPx} px (-%${geoSum.warpPixelLossPct})</td></tr>
                <tr><td><b>3. Surface Mapping</b></td><td>${esc(geoSum.surfaceGeometryLabel)}</td><td style="text-align:right; font-family:monospace;">Kiriş ${geoSum.chordWidthM}m · Kavis ${geoSum.sagittaM}m</td></tr>
                <tr><td><b>4. Masking (Maskeleme)</b></td><td style="font-family:monospace;">Kırpma ${geoSum.croppedPixels.toLocaleString('tr-TR')} px · Poligon ${geoSum.polygonMaskCount} · Bezier ${geoSum.bezierMaskCount}</td><td style="text-align:right; font-family:monospace;">Maskeli -%${geoSum.maskedOutPct} · Aktif %${geoSum.visibleActivePct}</td></tr>
                <tr><td><b>5. Edge Blending</b></td><td style="font-family:monospace;">${Math.max(0, geoSum.seamTransitionCount || geoSum.overlapZoneCount)} Bölge · Yatay ${geoSum.blendWidthPxX}px · Dikey ${geoSum.blendWidthPxY}px</td><td style="text-align:right; font-family:monospace;">γ=${geoSum.gamma} · Orta %${geoSum.midpointDrivePct}</td></tr>
                <tr><td><b>6. Geometrik Bozulma Analizi</b></td><td style="font-family:monospace;">Anizotropi ${geoSum.pixelAnisotropyRatio}:1 (Yatay Fark %${round((1 - 1 / Math.max(1, geoSum.pixelAnisotropyRatio)) * 100, 1)}) · ΔD ${geoSum.depthOfFieldSpreadM}m</td><td style="text-align:right;">${esc(geoSum.distortionLabel)}</td></tr>
                <tr><td><b>7. Çoklu Yüzey Eşleştirme</b></td><td style="font-family:monospace;">${geoSum.matchedSurfacesCount}/${geoSum.totalSurfacesCount} Yüzey</td><td style="text-align:right; font-family:monospace;">Sapma %${geoSum.densitySpreadPct} (${esc(geoSum.multiSurfaceStatus)})</td></tr>
                <tr class="highlight-cell"><td><b>8. TOPLAM EFEKTİF ÇÖZÜNÜRLÜK</b></td><td style="font-family:monospace;">Verim %${geoSum.geometricEfficiencyPct} (Kayıp -%${geoSum.totalGeometricLossPct})</td><td style="text-align:right; font-family:monospace;"><b>${geoSum.effectiveResolutionW} × ${geoSum.effectiveResolutionH} px (${geoSum.effectiveUsableMP} MP)</b></td></tr>
              </tbody>
            </table>
          </div>` : ''}
          ${pmSum && (p.sections.includeViewingQuality !== false || p.sections.includeFeasibilityAndRecs !== false) ? (() => {
            const wallW = pmSum.wallWidthM || +(Math.max(1.5, pmSum.combinedW * 0.0025)).toFixed(2);
            const wallH = pmSum.wallHeightM || +(Math.max(1.0, pmSum.combinedH * 0.0025)).toFixed(2);
            const matchedPhoto = p.photometricSurfaces?.find(ps => ps.surfaceName === ms.name);
            const effOv = pmSum.projectorCount > 1 ? Math.max(0, Math.min(99.5, pmSum.lostOverlapPct)) : 0;
            const effViewD = +(Math.max(1.8, wallH * 2.5)).toFixed(1);
            const effU0 = matchedPhoto?.uniformityU0 ? (matchedPhoto.uniformityU0 <= 1 ? round(matchedPhoto.uniformityU0 * 100, 1) : round(matchedPhoto.uniformityU0, 1)) : 82;
            const effU1 = matchedPhoto?.uniformityU1 ? (matchedPhoto.uniformityU1 <= 1 ? round(matchedPhoto.uniformityU1 * 100, 1) : round(matchedPhoto.uniformityU1, 1)) : 85;
            const effAmbient = matchedPhoto?.ambientLux ?? 0;
            const vqHtml = p.sections.includeViewingQuality !== false ? renderViewingQualityA4Html(computeViewingQualityAnalysis({
              widthM: wallW,
              heightM: wallH,
              resW: pmSum.contentProductionW,
              resH: pmSum.contentProductionH,
              viewingDistanceM: effViewD,
              offAxisAngleDeg: 0,
              screenGain: matchedPhoto?.screenGain ?? 1.0,
              reflectance: matchedPhoto?.surfaceReflectance ?? 0.85,
              avgLux: matchedPhoto?.avgLux ?? 350,
              ambientLux: effAmbient,
              nativeContrast: 2000,
              uniformityU0: effU0,
              uniformityU1: effU1,
              projectorCount: Math.max(1, pmSum.projectorCount),
              overlapPct: effOv,
              colorCalibrated: true,
            })) : '';
            const feasHtml = p.sections.includeFeasibilityAndRecs !== false ? (() => {
              const effPix = computeEffectiveMultiProjectorPixelArea({
                widthM: wallW,
                heightM: wallH,
                projW: pmSum.nativeW,
                projH: pmSum.nativeH,
                cols: Math.max(1, pmSum.projectorCount),
                rows: 1,
                overlapPctX: effOv,
                keystoneDegH: geoSum?.maxKeystoneHDeg ?? 0,
                keystoneDegV: geoSum?.maxKeystoneVDeg ?? 0,
              });
              const feas = evaluateSystemFeasibility({
                widthM: wallW,
                heightM: wallH,
                throwDistM: matchedPhoto?.distributionRows?.[0]?.throwDistM ?? 4.2,
                throwRatio: matchedPhoto?.distributionRows?.[0]?.throwRatio ?? 0.8,
                roomHeightM: p.interProjectorAnalysis?.roomDimensions?.heightM || Math.max(3.0, wallH + 0.5),
                projMountHeightM: Math.max(2.2, wallH - 0.15),
                viewDistM: effViewD,
                cols: Math.max(1, pmSum.projectorCount),
                rows: 1,
                projW: pmSum.nativeW,
                projH: pmSum.nativeH,
                overlapPct: effOv,
                avgLux: matchedPhoto?.avgLux ?? 350,
                minLux: matchedPhoto?.minLux,
                ambientLux: matchedPhoto?.ambientLux ?? 50,
                uniformityU0: matchedPhoto?.uniformityU0 ?? 78,
                keystoneDegH: geoSum?.maxKeystoneHDeg ?? 0,
                keystoneDegV: geoSum?.maxKeystoneVDeg ?? 0,
              });
              const recs = recommendProjectorAndLenses({
                widthM: wallW,
                heightM: wallH,
                throwDistM: matchedPhoto?.distributionRows?.[0]?.throwDistM ?? 4.2,
                cols: Math.max(1, pmSum.projectorCount),
                rows: 1,
                overlapPct: effOv > 0 ? effOv : 15,
                targetLux: Math.max(300, Math.round(matchedPhoto?.avgLux ?? 350)),
                ambientLux: matchedPhoto?.ambientLux ?? 50,
                screenGain: matchedPhoto?.screenGain ?? 1.0,
                reflectance: matchedPhoto?.surfaceReflectance ?? 0.85,
                preferredNativeH: pmSum.nativeH,
              });
              const altCompare = compareLayoutScenarios({
                room: {
                  widthM: p.interProjectorAnalysis?.roomDimensions?.widthM || 14,
                  lengthM: p.interProjectorAnalysis?.roomDimensions?.lengthM || 10,
                  heightM: p.interProjectorAnalysis?.roomDimensions?.heightM || 3.5,
                },
                surface: {
                  id: ms.name,
                  name: ms.name,
                  widthM: wallW,
                  heightM: wallH,
                  viewingDistanceM: effViewD,
                },
                projector: {
                  model: 'Standart Projektör',
                  cols: Math.max(1, pmSum.projectorCount),
                  rows: 1,
                  nativeW: pmSum.nativeW,
                  nativeH: pmSum.nativeH,
                  ansiLumensPerUnit: matchedPhoto?.nominalLumensPerProj || p.projectionScreens?.[0]?.ansiLumens || p.projection?.ansiLumens || 10000,
                  powerWPerUnit: resolveProjectorWatts((matchedPhoto as any)?.projectorModel || p.projectionScreens?.[0]?.projectorName || p.projection?.projectorName, 450),
                },
                lens: {
                  model: 'Karşılaştırma',
                  throwDistM: matchedPhoto?.distributionRows?.[0]?.throwDistM ?? 4.2,
                  throwRatio: matchedPhoto?.distributionRows?.[0]?.throwRatio ?? 0.8,
                },
                photometrics: {
                  opticalEfficiencyPct: matchedPhoto?.netEfficiencyPct ?? 90,
                  screenGain: matchedPhoto?.screenGain ?? 1.0,
                  reflectance: matchedPhoto?.surfaceReflectance ?? 0.85,
                  ambientLux: matchedPhoto?.ambientLux ?? 20,
                },
                blending: { overlapPctX: effOv },
                electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
              }, [2, 3, 4]);
              const altCompareHtml = `<div style="margin-top:8px; break-inside:avoid; page-break-inside:avoid;">
                <div style="font-size:10.5px; font-weight:700; color:#0f172a; margin-bottom:4px;">⚖️ Alternatif Senaryo Karşılaştırması (2, 3 ve 4 Projektör)</div>
                <table class="compact-table" style="font-size:9.5px; background:#ffffff;">
                  <thead><tr><th>Senaryo</th><th>Overlap / TR</th><th>İçerik Kanvası</th><th style="text-align:right;">Efektif Akı / Lux</th><th style="text-align:right;">Güç / Montaj</th><th style="text-align:center;">Kaplama</th></tr></thead>
                  <tbody>
                    ${altCompare.map(row => `<tr${row.isRecommended ? ' class="highlight-cell"' : ''}>
                      <td><b>${row.projectorCount} Projektör</b>${row.isRecommended ? ' ⭐' : ''}</td>
                      <td style="font-family:monospace;">%${row.overlapPct} · TR ${row.requiredTR}:1</td>
                      <td style="font-family:monospace;">${row.contentW}×${row.contentH} px (${row.mmPerPx} mm/px)</td>
                      <td style="text-align:right; font-family:monospace;">${row.effectiveLumens.toLocaleString('tr-TR')} lm · <b>${row.avgLux} lx</b></td>
                      <td style="text-align:right; font-family:monospace;">${row.totalPowerW} W · ${row.mountingComplexity}</td>
                      <td style="text-align:center; font-size:9px;"><b style="color:${row.coverageVerdict === 'PASS' ? '#059669' : '#dc2626'};">Kaplama: ${row.coverageVerdict}</b><br/>Piksel: <b style="color:${row.pixelEfficiencyVerdict === 'PASS' ? '#059669' : '#d97706'};">${row.pixelEfficiencyVerdict}</b> · Genel: <b style="color:${row.overallVerdict === 'PASS' ? '#059669' : row.overallVerdict === 'WARNING' ? '#d97706' : '#dc2626'};">${row.overallVerdict}</b></td>
                    </tr>`).join('')}
                  </tbody>
                </table>
              </div>`;
              return renderMultiProjFeasibilityAndRecsA4Html(effPix, feas, recs) + altCompareHtml;
            })() : '';
            return [vqHtml, feasHtml].filter(Boolean).join('\n');
          })() : ''}
          ${L ? `<div class="diagram">${svg}</div>` : ''}
        </div>`;
      }).join('');
      blocks.push(`<section class="report-section" style="break-inside:auto; page-break-inside:auto;"><h2>${tr.multi}</h2>${mapCards}</section>`);
    } else if (p.mappingScreens === undefined && surfsToRender.length === 0 && p.mappingSlots && p.mappingSlots.length > 0) {
      const L = computeLayout(p.mappingSlots);
      warnings.push(...L.warnings);
      const svg = layoutToSvg(L, { gridStep: 200, showCoords: true });
      blocks.push('<section class="report-section"><h2>' + tr.multi + '</h2><p><b>' + tr.canvasRes + ':</b> ' + L.canvasW + ' × ' + L.canvasH + ' px &nbsp;|&nbsp; <b>' + tr.overlapCount + ':</b> ' + L.overlaps.length + '</p><div class="diagram">' + svg + '</div></section>');
    }
  }

  // 7. LED DUVAR SPESİFİKASYONLARI
  if (p.sections.led && p.led && p.led.cols > 0 && p.led.rows > 0) {
    const r = ledFromCabinets(p.led.cabinet, p.led.cols, p.led.rows, p.led.spareFraction, { voltage: 230, powerFactor: 1 });
    warnings.push(...r.warnings);
    assumptions.push(...r.approximations);
    const svg = toSvg(ledElevation(p.led.cabinet, p.led.cols, p.led.rows), { background: '#0f172a' });
    blocks.push(`<section class="report-section">
      <h2>${tr.led}</h2>
      <table><tbody>
        <tr><th>${tr.physSize}</th><td>${r.widthMm} × ${r.heightMm} mm (${round(r.areaM2, 2)} m²)</td><th>${tr.nativeRes}</th><td>${r.resX} × ${r.resY} px (pitch ${p.led.cabinet.pitchMm} mm)</td></tr>
        <tr><th>${tr.cabinets}</th><td>${r.qty} (${r.cols}×${r.rows}) + ${r.spareQty}</td><th>${tr.powerWeight}</th><td>${r.powerTypW ?? 0}/${r.powerMaxW ?? 0} W · ${round(r.weightKg ?? 0, 1)} kg</td></tr>
      </tbody></table>
      ${p.sections.drawings2d ? `<div class="diagram">${svg}</div>` : ''}
    </section>`);
  }

  // 8. ELEKTRİK YÜK & TEK HAT ŞEMASI
  if (p.sections.electrical && p.electrical) {
    let el: ReturnType<typeof analyze> | null = null;
    let elErr: string | null = null;
    try {
      el = analyze(p.electrical.loads, p.electrical.circuits, p.electrical.supply);
    } catch (err) {
      elErr = (err as Error).message || 'Elektrik verisi eksik veya geçersiz.';
      warnings.push(`Elektrik hesabı yapılamadı: ${elErr}`);
    }

    if (!el || elErr) {
      blocks.push(`<section class="report-section">
        <h2>${tr.electrical}</h2>
        <div style="padding:10px 12px; border:1px solid #fca5a5; background:#fee2e2; color:#991b1b; border-radius:6px; font-size:11px; font-weight:700;">
          ⚠ Veri Eksikliği: Elektrik besleme gerilimi (${p.electrical.supply.voltage} V) veya cihaz gücü eksik/sıfır olduğu için Ib ve tek hat hesabı yapılamadı (${esc(elErr || '')}).
        </div>
      </section>`);
    } else {
      warnings.push(...el.warnings);
      assumptions.push(...el.assumptions);
      for (const c of el.circuits) warnings.push(...c.warnings.map(w => `${c.circuit.name}: ${w}`));
      const sld = toSvg(electricalSingleLine(p.electrical.loads, p.electrical.circuits, p.electrical.supply, el), { background: '#0b1220' });

      const isElecUnknown = el.electricalDataStatus === 'UNKNOWN';
      const circuitRows = el.circuits.map(c => {
        const isCircUnknown = c.dataStatus === 'UNKNOWN';
        return `
        <tr>
          <td><b>${esc(c.circuit.name)}</b></td>
          <td><span class="badge-circuit">${esc(c.circuit.phase ?? 'L1')}</span></td>
          <td>${isCircUnknown ? '<span style="color:#7c3aed; font-weight:700;">UNKNOWN</span>' : c.breakerA !== null ? `<b>${c.breakerA} A</b> (B-Tipi)` : '<span class="badge-danger">VERİ EKSİK / AŞIM</span>'}</td>
          <td>${c.circuit.cableMm2 ? `${c.circuit.cableMm2} mm² · ${c.circuit.lengthM ?? '—'} m (cosφ=${round(el.effectivePf, 2)})` : '<span class="badge-danger">VERİ EKSİK</span>'}</td>
          <td><b>${isCircUnknown ? '<span style="color:#7c3aed;">UNKNOWN</span>' : `${round(c.ibA, 2)} A`}</b></td>
          <td>${isCircUnknown ? '<span style="color:#7c3aed;">UNKNOWN</span>' : `${Math.round(c.powerW)} W`}</td>
          <td>${isCircUnknown ? '<span style="color:#7c3aed;">UNKNOWN</span>' : c.dropPct !== undefined ? `%${round(c.dropPct, 2)}` : '<span style="color:#b45309;">VERİ EKSİK</span>'}</td>
          <td>${c.warnings.length === 0 ? '<span class="badge-success">✓ Uygun</span>' : `<span class="badge-danger">${esc(c.warnings.join(' | '))}</span>`}</td>
        </tr>
      `;
      }).join('');

      const elecBanner = isElecUnknown
        ? `<div style="padding:8px 10px; margin-bottom:10px; border:1px solid #c4b5fd; background:#f5f3ff; color:#5b21b6; border-radius:6px; font-size:11px; font-weight:700;">❓ UNKNOWN (Eksik Güç Verisi): ${esc(el.missingPowerLoadNames.join(', '))} yük(ler)inde güç verisi girilmediği için akım, sigorta ve gerilim düşümü hesaplanamadı.</div>`
        : el.electricalDataStatus === 'ZERO_POWER'
        ? `<div style="padding:8px 10px; margin-bottom:10px; border:1px solid #fcd34d; background:#fef3c7; color:#92400e; border-radius:6px; font-size:11px; font-weight:700;">⚠ Olağandışı Değer Uyarısı (0 W): ${esc(el.zeroPowerLoadNames.join(', '))} yük(ler)i 0 W olarak tanımlanmış.</div>`
        : p.electrical.supply.voltage <= 0
        ? `<div style="padding:8px 10px; margin-bottom:10px; border:1px solid #fca5a5; background:#fee2e2; color:#991b1b; border-radius:6px; font-size:11px; font-weight:700;">⚠ Veri Eksikliği: Besleme gerilimi (${p.electrical.supply.voltage} V) eksik olduğu için kesin akım/yük hesabı yapılamadı.</div>`
        : '';

      const curTotalW = el.totalW > 0 ? el.totalW : 1350;
      const curPjCount = (p.electrical?.loads || []).reduce((a, l) => a + (l.name.toLowerCase().includes('projektör') ? Math.max(1, l.qty || 1) : 0), 0) || 3;
      blocks.push(`<section class="report-section">
        <h2>${tr.electrical} — Ön Tasarım / Preliminary Design</h2>
        ${elecBanner}
        <div style="padding:6px 10px; margin-bottom:8px; border-radius:5px; background:#f8fafc; border:1px solid #cbd5e1; font-size:10px; font-family:monospace; color:#334155;">
          <b>Elektrik Akım &amp; Faz Ayrımı (Ön Tasarım / Preliminary Design):</b><br/>
          • Tek Faz Linye Akımı (230 V L-N · Tek Cihaz ${Math.round(curTotalW / Math.max(1, curPjCount))} W): <b>I<sub>b,1φ</sub> ≈ ${round((curTotalW / Math.max(1, curPjCount)) / (230 * (el.effectivePf || 1)), 2)} A</b> (cosφ=${round(el.effectivePf, 2)}) | 3 Cihaz Toplam: <b>${round(curTotalW / (230 * (el.effectivePf || 1)), 2)} A</b><br/>
          • 3-Faz Dengeli Hat Akımı (400 V L-L · Toplam ${Math.round(curTotalW)} W): <b>I<sub>hat,3φ</sub> = P / (√3 × U<sub>LL</sub> × cosφ) ≈ ${round(curTotalW / (Math.sqrt(3) * 400 * (el.effectivePf || 1)), 2)} A</b>
        </div>
        <p><b>${tr.totalPower}:</b> ${isElecUnknown ? '<span style="color:#7c3aed; font-weight:700;">UNKNOWN</span>' : `${Math.round(el.totalW)} W / ${Math.round(el.demandW)} W`} &nbsp;|&nbsp; <b>Toplam ${p.electrical.supply.phases ?? 1}-Faz Hat Akımı (Ib_toplam):</b> ${isElecUnknown ? '<span style="color:#7c3aed; font-weight:700;">UNKNOWN</span>' : `${round(el.totalIbA, 2)} A`} (${p.electrical.supply.phases === 3 && p.electrical.supply.voltage <= 260 ? `400 V L-L / ${p.electrical.supply.voltage} V L-N` : `${p.electrical.supply.voltage} V`} · cosφ=${round(el.effectivePf, 2)}) &nbsp;|&nbsp; <b>${tr.mainBreaker}:</b> ${isElecUnknown ? '<span style="color:#7c3aed; font-weight:700;">UNKNOWN</span>' : `${el.mainBreakerA ?? '—'} A`}</p>
        
        <div class="diagram cad-diagram">${sld}</div>

        <h3 class="sub-heading">Linye Dağıtım & Yük Dengeleme Tablosu</h3>
        <table class="compact-table">
          <thead>
            <tr>
              <th>Linye Adı</th>
              <th>Faz</th>
              <th>Sigorta Anma Akımı</th>
              <th>Kablo Kesiti</th>
              <th>Çalışma Akımı (Ib)</th>
              <th>Toplam Yük</th>
              <th>Gerilim Düşümü</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>${circuitRows}</tbody>
        </table>
        <p style="font-size:10px; color:#64748b; margin-top:6px;">Not: Sigorta/kesici önerileri yalnızca işletme akımı (Ib) ve reaktanssız gerilim düşümü ön hesabına dayanır; kablo döşeme yöntemi, ortam sıcaklığı, kısa devre akımı (Icu/Icn), açma eğrisi ve projektör ilk kalkış (inrush) akımı saha elektrik projesinde ayrıca doğrulanmalıdır (tam koruma koordinasyonu onayı yerine geçmez).</p>
      </section>`);
    }
  }

  // 9. 2B TEKNİK CAD ÇİZİMLERİ (Mimari Yerleşim & Mapping Çizimi)
  {
    if (p.sections.architecturalPlan && p.architecturalPlanSvg) {
      blocks.push(`<section class="report-section">
        <h2>${tr.archPlan}</h2>
        <p class="section-intro">Aşağıdaki mimari yerleşim planında oda dış sınırları, projeksiyon cihazlarının tavandaki askı merkezleri, duvardan dik atım mesafeleri (D) ve 230V besleme prizleri şematik olarak gösterilmiştir.</p>
        <div class="diagram cad-diagram">${p.architecturalPlanSvg}</div>
        <div class="legend-row">
          <span><b style="color:#ef4444">🔴 Kırmızı Daire:</b> 230V 16A Priz Noktası</span>
          <span><b style="color:#0ea5e9">🟦 Mavi Kutu:</b> Projektör Askı Noktası</span>
          <span><b style="color:#10b981">📏 D:</b> Duvardan Lens Atım Mesafesi (m)</span>
          <span><b style="color:#f59e0b">📐 H:</b> Yerden Lens Montaj Kotu (m)</span>
        </div>
      </section>`);
    }

    if (p.sections.drawings2d && p.mappingSlots && p.mappingSlots.length > 0) {
      const L = computeLayout(p.mappingSlots);
      const cadSvg = toSvg(mappingDrawing(L), { background: '#0f172a' });
      blocks.push(`<section class="report-section"><h2>${tr.drawings}</h2><div class="diagram">${cadSvg}</div></section>`);
    }
  }

  // 10. EKİPMAN LİSTESİ (BOM)
  if (p.sections.equipmentList && p.equipmentList && p.equipmentList.length > 0) {
    const rows = p.equipmentList.map(e => `
      <tr>
        <td><b>${esc(e.category)}</b></td>
        <td>${esc(e.manufacturer)} ${esc(e.model)}</td>
        <td style="text-align:center"><b>${e.qty}</b></td>
        <td>${esc(e.notes ?? '—')}</td>
      </tr>
    `).join('');
    blocks.push(`<section class="report-section">
      <h2>${tr.equipment}</h2>
      <table class="compact-table">
        <thead>
          <tr>
            <th>${tr.category}</th>
            <th>${tr.item}</th>
            <th style="text-align:center">${tr.qty}</th>
            <th>${tr.notes}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`);
  }

  // 10.2. KAMERA / PROJEKTÖR FOV & İNSAN GÖLGE ANALİZİ RAPORU (İSTEĞE BAĞLI — 3B İZOMETRİK + 2B YAN KESİT + 2B PERDE ÖN GÖRÜNÜM)
  if (p.sections.fovShadow && p.fovShadowReport && p.fovShadowReport.shadow) {
    const fs = p.fovShadowReport;
    const sh = fs.shadow;
    const totalZ = Math.max(1, fs.devicePosM[2]);
    const surfW = Math.max(0.5, fs.surfaceWidthM);
    const surfH = Math.max(0.5, fs.surfaceHeightM);
    const scrBot = Math.max(0, sh.screenBottomHeightM || 0);
    const maxH = Math.max(sh.deviceHeightFromFloorM, sh.beamTopAtScreenM, sh.personHeightM, scrBot + surfH, 2.5) * 1.18;

    const ep = fs.enabledPaftas ?? {
      iso3d: true,
      topPlan: true,
      bottomPlan: true,
      sideSection: true,
      frontElevation: true,
    };

    // --- PAFTA 1: 3B İZOMETRİK PERSPEKTİF GÖLGE & IŞIK KONİSİ SİMÜLASYONU (MÜHENDİSLİK ÇİZİMİ) ---
    // Matematiksel olarak sınırlandırılmış, çakışmayan, net ve ferah aksonometrik projeksiyon
    const isoW = 760;
    const isoH = 370;
    const pOriginX = 160;
    const pOriginY = 325;

    // Ölçekler çizim alanına [40, 720] × [65, 360] tam sığacak şekilde dinamik hesaplanır
    const scaleX = Math.min(55, 190 / Math.max(1, surfW));
    const scaleY = 125 / Math.max(1, maxH);
    const zSpanPx = 360;
    const zAngleRad = 22 * (Math.PI / 180);
    const cosZ = Math.cos(zAngleRad);
    const sinZ = Math.sin(zAngleRad);

    const isoPt = (x: number, y: number, z: number): [number, number] => {
      const zNorm = Math.max(0, Math.min(totalZ, z)) / Math.max(0.1, totalZ);
      const zDistPx = zNorm * zSpanPx;
      const sx = pOriginX + x * scaleX + zDistPx * cosZ;
      const sy = pOriginY - y * scaleY - zDistPx * sinZ * 0.78;
      return [round(sx, 1), round(sy, 1)];
    };
    const polyPts = (pts: [number, number, number][]) => pts.map(([x, y, z]) => isoPt(x, y, z).join(',')).join(' ');

    const zCritClamped = Math.max(0, Math.min(totalZ, sh.shadowEntryDistFromScreenM));
    const floorFull = polyPts([
      [-surfW / 2, 0, 0],
      [surfW / 2, 0, 0],
      [surfW / 2, 0, totalZ],
      [-surfW / 2, 0, totalZ],
    ]);
    const floorRiskZone = polyPts([
      [-surfW / 2, 0, 0],
      [surfW / 2, 0, 0],
      [surfW / 2, 0, zCritClamped],
      [-surfW / 2, 0, zCritClamped],
    ]);
    const floorSafeZone = polyPts([
      [-surfW / 2, 0, zCritClamped],
      [surfW / 2, 0, zCritClamped],
      [surfW / 2, 0, totalZ],
      [-surfW / 2, 0, totalZ],
    ]);
    const underScreenWallPoly = scrBot > 0.01 ? polyPts([
      [-surfW / 2, 0, 0],
      [surfW / 2, 0, 0],
      [surfW / 2, scrBot, 0],
      [-surfW / 2, scrBot, 0],
    ]) : '';
    const screenPoly = polyPts([
      [-surfW / 2, scrBot, 0],
      [surfW / 2, scrBot, 0],
      [surfW / 2, scrBot + surfH, 0],
      [-surfW / 2, scrBot + surfH, 0],
    ]);
    const [critL0, critL1] = [isoPt(-surfW / 2 - 0.25, 0, zCritClamped), isoPt(surfW / 2 + 0.25, 0, zCritClamped)];
    const dev3D: [number, number, number] = [fs.devicePosM[0] || 0, sh.deviceHeightFromFloorM, totalZ];
    const [devPx, devPy] = isoPt(...dev3D);
    const [devFloorPx, devFloorPy] = isoPt(dev3D[0], 0, totalZ);

    const scCorners3D: [number, number, number][] = [
      [-surfW / 2, sh.beamTopAtScreenM, 0],
      [surfW / 2, sh.beamTopAtScreenM, 0],
      [surfW / 2, sh.beamBottomAtScreenM, 0],
      [-surfW / 2, sh.beamBottomAtScreenM, 0],
    ];
    const coneTopFace = polyPts([dev3D, scCorners3D[0], scCorners3D[1]]);
    const coneRightFace = polyPts([dev3D, scCorners3D[1], scCorners3D[2]]);
    const coneBottomFace = polyPts([dev3D, scCorners3D[2], scCorners3D[3]]);

    // İnsan 3B konumu (gerçekçi insan silüeti) ve Perdedeki 3B İnsan Gölgesi Silüeti
    const pX = Math.max(-surfW / 2, Math.min(surfW / 2, sh.personXM || 0));
    const pZ = Math.max(0.05, Math.min(totalZ - 0.05, sh.personDistFromScreenM));
    const pW = Math.max(0.3, sh.personWidthM || 0.5);
    const [pFootX, pFootY] = isoPt(pX, 0, pZ);
    const [pHeadX, pHeadY] = isoPt(pX, sh.personHeightM, pZ);
    const isoPersonPoly = polyPts(
      HUMAN_SILHOUETTE_NORM.map(([u, v]) => [pX + u * pW, v * sh.personHeightM, pZ] as [number, number, number])
    );

    const shHalfW = sh.shadowWidthM / 2;
    const shBotY = sh.shadowBottomFromFloorM ?? scrBot;
    const shTopY = sh.shadowTopFromFloorM ?? Math.min(scrBot + surfH, scrBot + sh.shadowHeightM);
    const shadow3DBoxPoly = polyPts([
      [Math.max(-surfW / 2, pX - shHalfW), shBotY, 0],
      [Math.min(surfW / 2, pX + shHalfW), shBotY, 0],
      [Math.min(surfW / 2, pX + shHalfW), shTopY, 0],
      [Math.max(-surfW / 2, pX - shHalfW), shTopY, 0],
    ]);

    const floorShadowPts2D: [number, number][] =
      sh.shadowPolygonFloor2D && sh.shadowPolygonFloor2D.length >= 3
        ? sh.shadowPolygonFloor2D
        : sh.isCastingShadow && sh.shadowWidthM > 0
        ? clipPolygonToRect2D(
            HUMAN_SILHOUETTE_NORM.map(([u, v]) => [
              pX + u * sh.shadowWidthM,
              shBotY + v * Math.max(sh.shadowHeightM, shTopY - shBotY),
            ]),
            -surfW / 2,
            scrBot,
            surfW / 2,
            scrBot + surfH
          )
        : [];
    const shadow3DHumanPoly = floorShadowPts2D.length >= 3
      ? polyPts(floorShadowPts2D.map(([sx, sy]) => [sx, sy, 0] as [number, number, number]))
      : shadow3DBoxPoly;

    const [shTopMidX, shTopMidY] = isoPt(pX, shTopY, 0);
    const [scrTopMidX, scrTopMidY] = isoPt(0, scrBot + surfH, 0);

    const iso3dSvg = `<svg viewBox="0 0 ${isoW} ${isoH}" width="100%" height="340" style="background:#050914; border-radius:8px; border:1px solid #334155;">
      <defs>
        <linearGradient id="beamGrad" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.32" />
          <stop offset="100%" stop-color="#0284c7" stop-opacity="0.06" />
        </linearGradient>
      </defs>

      <!-- ÜST BAŞLIK BİLGİ ŞERİDİ -->
      <rect x="0" y="0" width="${isoW}" height="28" fill="#0b1329" />
      <text x="14" y="19" fill="#38bdf8" font-size="11" font-weight="bold">🧊 PAFTA 1 — 3B İZOMETRİK IŞIK KONİSİ, KRİTİK BÖLGE &amp; İNSAN GÖLGE SİMÜLASYONU</text>
      <text x="${isoW - 14}" y="19" fill="#94a3b8" font-size="9.5" text-anchor="end" font-family="monospace">Derinlik (Z): ${totalZ.toFixed(2)}m · Tavan/Lens (Y): ${sh.deviceHeightFromFloorM.toFixed(2)}m</text>

      <!-- ÇAKIŞMAYAN ÜST TELEMETRİ ROZETLERİ (SAHNEYİ ASLA ÖRTMEZ) -->
      <g transform="translate(14, 32)">
        <!-- ① Perde Rozeti -->
        <rect x="0" y="0" width="175" height="24" rx="4" fill="#0b1329" stroke="#334155" stroke-width="1" />
        <text x="8" y="16" fill="#f8fafc" font-size="8.5" font-weight="bold">🖥️ Perde: <tspan fill="#38bdf8">${round(surfW, 2)}×${round(surfH, 2)}m</tspan> <tspan fill="#94a3b8">(+${round(scrBot, 2)}m)</tspan></text>

        <!-- ② Kritik Gölge Sınırı Rozeti -->
        <rect x="182" y="0" width="180" height="24" rx="4" fill="#0b1329" stroke="#f59e0b" stroke-width="1" />
        <text x="190" y="16" fill="#fde047" font-size="8.5" font-weight="bold">⚡ Kritik Sınır: <tspan fill="#f59e0b">${sh.neverCastsShadow ? 'Yok (0m)' : `${sh.shadowEntryDistFromScreenM}m`}</tspan></text>

        <!-- ③ İzleyici Durumu Rozeti -->
        <rect x="369" y="0" width="180" height="24" rx="4" fill="#0b1329" stroke="${sh.isCastingShadow ? '#ef4444' : '#10b981'}" stroke-width="1" />
        <text x="377" y="16" fill="${sh.isCastingShadow ? '#fca5a5' : '#a7f3d0'}" font-size="8.5" font-weight="bold">👤 İzleyici: <tspan fill="#e2e8f0">${sh.personDistFromScreenM}m</tspan> <tspan fill="${sh.isCastingShadow ? '#f87171' : '#34d399'}">(${sh.isCastingShadow ? `%${sh.shadowCoveragePct} Gölge` : 'Temiz'})</tspan></text>

        <!-- ④ Cihaz Konumu Rozeti -->
        <rect x="556" y="0" width="176" height="24" rx="4" fill="#0b1329" stroke="#0284c7" stroke-width="1" />
        <text x="564" y="16" fill="#38bdf8" font-size="8.5" font-weight="bold">📽️ Cihaz: <tspan fill="#e2e8f0">Z:${round(totalZ, 2)}m</tspan> · <tspan fill="#93c5fd">Y:${round(sh.deviceHeightFromFloorM, 2)}m</tspan></text>
      </g>

      <!-- 3B Zemin Taban Izgarası (Zeminde Derinlik ve Açı İzdüşümü) -->
      <polygon points="${floorFull}" fill="#0a0f1d" stroke="#334155" stroke-width="1.3" />
      ${!sh.neverCastsShadow && zCritClamped > 0.02 ? `
        <polygon points="${floorRiskZone}" fill="#ef4444" fill-opacity="0.16" stroke="#ef4444" stroke-opacity="0.55" stroke-width="1.2" />
        <polygon points="${floorSafeZone}" fill="#10b981" fill-opacity="0.11" stroke="#10b981" stroke-opacity="0.45" stroke-width="1.2" />
      ` : ''}

      <!-- Perde Yerden Yüksekteyse: Perde Altı Duvar / Sahne Eteği -->
      ${underScreenWallPoly ? `
        <polygon points="${underScreenWallPoly}" fill="#0f172a" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4,3" />
      ` : ''}

      <!-- 3B Hedef Perde Yüzeyi (Fiziksel Duvar / Projeksiyon Alanı) -->
      <polygon points="${screenPoly}" fill="#1e293b" stroke="#f8fafc" stroke-width="2.2" />
      <polygon points="${screenPoly}" fill="#38bdf8" fill-opacity="0.06" />

      <!-- 3B Yarı Saydam Optik Işık Konisi Yüzeyleri -->
      <polygon points="${coneTopFace}" fill="url(#beamGrad)" />
      <polygon points="${coneRightFace}" fill="#38bdf8" fill-opacity="0.12" />
      <polygon points="${coneBottomFace}" fill="#0284c7" fill-opacity="0.07" />

      <!-- Işık Konisi Kenar Çizgileri -->
      ${scCorners3D.map(c => {
        const [cx, cy] = isoPt(...c);
        return `<line x1="${devPx}" y1="${devPy}" x2="${cx}" y2="${cy}" stroke="#38bdf8" stroke-opacity="0.75" stroke-width="1.3" />`;
      }).join('')}

      <!-- Perde Üzerindeki 3B Gerçekçi İnsan Gölgesi Silüeti ve Işık Çizgisi -->
      ${sh.isCastingShadow && sh.shadowWidthM > 0 ? `
        <polygon points="${shadow3DBoxPoly}" fill="none" stroke="#f87171" stroke-width="1.2" stroke-dasharray="4,3" />
        <polygon points="${shadow3DHumanPoly}" fill="#020617" fill-opacity="0.95" stroke="#ef4444" stroke-width="1.8" />
        <line x1="${devPx}" y1="${devPy}" x2="${pHeadX}" y2="${pHeadY}" stroke="#f87171" stroke-width="1.3" stroke-dasharray="4,3" />
        <line x1="${pHeadX}" y1="${pHeadY}" x2="${shTopMidX}" y2="${shTopMidY}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,3" />
      ` : ''}

      <!-- Zeminde Kritik Gölge Sınır Çizgisi -->
      ${!sh.neverCastsShadow && zCritClamped > 0.02 ? `
        <line x1="${critL0[0]}" y1="${critL0[1]}" x2="${critL1[0]}" y2="${critL1[1]}" stroke="#f59e0b" stroke-width="2.2" stroke-dasharray="6,4" />
      ` : ''}

      <!-- 3B Gerçekçi İnsan Silüeti (İzleyici) -->
      <ellipse cx="${pFootX}" cy="${pFootY}" rx="9" ry="4" fill="#020617" fill-opacity="0.85" stroke="${sh.isCastingShadow ? '#ef4444' : '#10b981'}" stroke-width="1" />
      <polygon points="${isoPersonPoly}" fill="${sh.isCastingShadow ? '#e11d48' : '#059669'}" stroke="${sh.isCastingShadow ? '#fecaca' : '#a7f3d0'}" stroke-width="1.3" />

      <!-- 3B Cihaz Gövdesi ve Montaj Dikmesi -->
      <line x1="${devFloorPx}" y1="${devFloorPy}" x2="${devPx}" y2="${devPy}" stroke="#64748b" stroke-width="1.3" stroke-dasharray="3,3" />
      <circle cx="${devFloorPx}" cy="${devFloorPy}" r="3" fill="#64748b" />
      <rect x="${devPx - 13}" y="${devPy - 8}" width="26" height="16" rx="3" fill="#0284c7" stroke="#e0f2fe" stroke-width="1.5" />
      <circle cx="${devPx}" cy="${devPy}" r="3.5" fill="#f8fafc" />

      <!-- 3B MÜHENDİSLİK İŞARETLEYİCİ ETİKETLERİ (SAHNE İÇİ DİREK LİDER ÇİZGİLİ) -->
      <!-- Perde Etiketi -->
      <line x1="${isoPt(0, scrBot + surfH, 0)[0]}" y1="${isoPt(0, scrBot + surfH, 0)[1]}" x2="${isoPt(0, scrBot + surfH, 0)[0]}" y2="${isoPt(0, scrBot + surfH, 0)[1] - 16}" stroke="#94a3b8" stroke-width="1.2" />
      <text x="${isoPt(0, scrBot + surfH, 0)[0]}" y="${isoPt(0, scrBot + surfH, 0)[1] - 19}" fill="#f8fafc" font-size="9.5" font-weight="bold" text-anchor="middle">① HEDEF PERDE (${round(surfW, 2)}m × ${round(surfH, 2)}m)</text>

      <!-- Kritik Sınır Zemin Bayrağı -->
      ${!sh.neverCastsShadow && zCritClamped > 0.02 ? `
        <text x="${critL1[0] + 6}" y="${critL1[1] + 3}" fill="#fde047" font-size="8.5" font-weight="bold" text-anchor="start">⚡ ② KRİTİK GÖLGE SINIRI (${sh.shadowEntryDistFromScreenM}m)</text>
      ` : ''}

      <!-- İzleyici Etiketi -->
      <line x1="${pHeadX}" y1="${pHeadY}" x2="${pHeadX}" y2="${pHeadY - 14}" stroke="${sh.isCastingShadow ? '#ef4444' : '#10b981'}" stroke-width="1" />
      <text x="${pHeadX}" y="${pHeadY - 17}" fill="${sh.isCastingShadow ? '#fca5a5' : '#a7f3d0'}" font-size="9" font-weight="bold" text-anchor="middle">
        ③ İZLEYİCİ (${sh.isCastingShadow ? `GÖLGE %${sh.shadowCoveragePct}` : 'TEMİZ'})
      </text>

      <!-- Cihaz Etiketi -->
      <text x="${devPx + 18}" y="${devPy + 4}" fill="#38bdf8" font-size="9.5" font-weight="bold" text-anchor="start">④ PROJEKTÖR (Z:${round(totalZ, 2)}m · Y:${round(sh.deviceHeightFromFloorM, 2)}m)</text>
    </svg>`;


    // --- PAFTA 2: 2B YAN KESİT (ÇAKIŞMAYAN 4 KADEMELİ ETİKETLER & BÖLGE CETVELİ) ---
    const svgW = 480;
    const svgH = 270;
    const padL = 48;
    const padR = 40;
    const padT = 72; // Üst kademeler (Tier 1: Perde & Cihaz; Tier 2: Gölge Sınırı) için net dikey boşluk
    const padB = 62; // Alt kademe (Tier 3: Zemin Şeritleri; Tier 4: İzleyici Rozeti) için net dikey boşluk
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;
    const xOfZ = (z: number) => padL + (Math.max(0, Math.min(totalZ, z)) / totalZ) * plotW;
    const yOfH = (h: number) => padT + plotH - (Math.max(0, Math.min(maxH, h)) / maxH) * plotH;

    const xScreen = xOfZ(0);
    const xDev = xOfZ(totalZ);
    const xCrit = xOfZ(sh.shadowEntryDistFromScreenM);
    const xPerson = xOfZ(sh.personDistFromScreenM);
    const yFloor = yOfH(0);
    const yScrBot = yOfH(scrBot);
    const yScrTop = yOfH(scrBot + surfH);
    const yDev = yOfH(sh.deviceHeightFromFloorM);
    const yBeamBot0 = yOfH(sh.beamBottomAtScreenM);
    const yBeamTop0 = yOfH(sh.beamTopAtScreenM);
    const yPersonTop = yOfH(sh.personHeightM);
    const yShTop = yOfH(sh.shadowTopFromFloorM ?? Math.min(sh.beamTopAtScreenM, scrBot + sh.shadowHeightM));
    const yShBot = yOfH(sh.shadowBottomFromFloorM ?? scrBot);

    // Yan kesitte insan yüksekliği (px) ve anatomik oranlar
    const pPixH = Math.max(18, yFloor - yPersonTop);
    const pCol = sh.isCastingShadow ? '#e11d48' : '#059669';
    const pStroke = sh.isCastingShadow ? '#fecaca' : '#a7f3d0';

    // Etiketlerin yatayda güvenli sınırlanması (Tier 2: Gölge Sınırı Rozeti)
    const critBadgeW = 150;
    const critLabelX = Math.max(14 + critBadgeW / 2, Math.min(svgW - 14 - critBadgeW / 2, xCrit));

    // Etiketlerin yatayda güvenli sınırlanması (Tier 4: İzleyici Rozeti)
    const personBadgeW = 230;
    const personLabelX = Math.max(14 + personBadgeW / 2, Math.min(svgW - 14 - personBadgeW / 2, xPerson));

    const sideSvg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="250" style="background:#0f172a; border-radius:6px; border:1px solid #334155;">
      <!-- Başlık -->
      <text x="12" y="15" fill="#38bdf8" font-size="10.5" font-weight="bold">📐 PAFTA 2 — 2B YAN KESİT (OPTİK KONİ &amp; MESAFE CETVELİ)</text>
      
      <!-- TIER 1 (Y=24..42): Sabit Uç Rozetleri (Sol: Perde · Sağ: Cihaz — Yatayda 150px+ ayrık) -->
      <!-- ① Perde Rozeti (Sol Üst) -->
      <rect x="12" y="24" width="138" height="18" rx="3" fill="#1e293b" stroke="#64748b" stroke-width="0.9" />
      <text x="81" y="36.5" fill="#f8fafc" font-size="8.8" text-anchor="middle" font-weight="bold">① Perde (Yerden +${round(scrBot, 2)}m)</text>

      <!-- ④ Cihaz Rozeti (Sağ Üst) -->
      <rect x="${svgW - 176}" y="24" width="164" height="18" rx="3" fill="#0c2a4d" stroke="#0284c7" stroke-width="1" />
      <text x="${svgW - 94}" y="36.5" fill="#38bdf8" font-size="8.8" text-anchor="middle" font-weight="bold">④ Cihaz (Z:${round(totalZ, 2)}m · Y:${sh.deviceHeightFromFloorM}m)</text>

      <!-- TIER 2 (Y=47..65): ② Gölge Sınırı Bağımsız Ara Kademe (Tier 1 ve Tier 4 ile asla çakışmaz) -->
      ${!sh.neverCastsShadow && sh.shadowEntryDistFromScreenM > 0 ? `
        <line x1="${xCrit}" y1="65" x2="${xCrit}" y2="${yFloor + 12}" stroke="#f59e0b" stroke-width="1.6" stroke-dasharray="4,3" />
        <line x1="${critLabelX}" y1="65" x2="${xCrit}" y2="72" stroke="#f59e0b" stroke-width="1" />
        <rect x="${critLabelX - critBadgeW / 2}" y="47" width="${critBadgeW}" height="18" rx="3" fill="#2d1b03" stroke="#f59e0b" stroke-width="1.2" />
        <text x="${critLabelX}" y="59.5" fill="#fde047" font-size="8.8" text-anchor="middle" font-weight="bold">② Gölge Sınırı: ${sh.shadowEntryDistFromScreenM} m</text>
      ` : ''}

      <!-- TIER 3 (Y=72..208): Çizim Alanı (Işık Konisi, Perde, Silüet) -->
      <!-- Zemin Bölge Şeritleri (Y=yFloor .. yFloor+12) -->
      ${!sh.neverCastsShadow && sh.shadowEntryDistFromScreenM > 0 ? `
        <rect x="${xScreen}" y="${yFloor}" width="${Math.max(0, xCrit - xScreen)}" height="12" fill="#ef4444" fill-opacity="0.32" />
        <rect x="${xCrit}" y="${yFloor}" width="${Math.max(0, xDev - xCrit)}" height="12" fill="#10b981" fill-opacity="0.26" />
      ` : `
        <rect x="${xScreen}" y="${yFloor}" width="${Math.max(0, xDev - xScreen)}" height="12" fill="#10b981" fill-opacity="0.26" />
      `}
      <line x1="${padL - 15}" y1="${yFloor}" x2="${svgW - padR + 15}" y2="${yFloor}" stroke="#94a3b8" stroke-width="2" />

      <!-- Işık Konisi -->
      <polygon points="${xDev},${yDev} ${xScreen},${yBeamTop0} ${xScreen},${yBeamBot0}" fill="#38bdf8" fill-opacity="0.16" stroke="#38bdf8" stroke-width="1.4" />

      <!-- Perde Altı Duvar (Perde Yerden Yüksekteyse) & Perde & Perdedeki Gölge -->
      ${scrBot > 0.01 ? `
        <line x1="${xScreen}" y1="${yFloor}" x2="${xScreen}" y2="${yScrBot}" stroke="#64748b" stroke-width="3" stroke-dasharray="3,2" />
      ` : ''}
      <line x1="${xScreen}" y1="${yScrBot}" x2="${xScreen}" y2="${yScrTop}" stroke="#f8fafc" stroke-width="4" />
      ${sh.isCastingShadow ? `
        <line x1="${xScreen + 2}" y1="${yShBot}" x2="${xScreen + 2}" y2="${yShTop}" stroke="#ef4444" stroke-width="5" />
        <line x1="${xDev}" y1="${yDev}" x2="${xScreen}" y2="${yShTop}" stroke="#ef4444" stroke-width="1.3" stroke-dasharray="4,3" />
      ` : ''}

      <!-- Cihaz Montaj Çizgisi ve Gövde Kutusu -->
      <line x1="${xDev}" y1="${yFloor}" x2="${xDev}" y2="${yDev}" stroke="#475569" stroke-width="1" stroke-dasharray="3,3" />
      <rect x="${xDev - 9}" y="${yDev - 6}" width="18" height="12" rx="2" fill="#0284c7" stroke="#bae6fd" stroke-width="1.2" />

      <!-- Anatomik Yan Kesit İnsan Silüeti -->
      <!-- Ayakkabı ve Bacaklar -->
      <ellipse cx="${xPerson - 1.5}" cy="${yFloor - 1.5}" rx="4.5" ry="2" fill="#0f172a" stroke="${pStroke}" stroke-width="0.7" />
      <line x1="${xPerson}" y1="${yFloor - 2}" x2="${xPerson}" y2="${yFloor - pPixH * 0.48}" stroke="#334155" stroke-width="4.2" stroke-linecap="round" />
      <!-- Gövde / Ceket ve Kol -->
      <rect x="${xPerson - 3.6}" y="${yFloor - pPixH * 0.83}" width="7.2" height="${pPixH * 0.37}" rx="3.2" fill="${pCol}" stroke="${pStroke}" stroke-width="0.9" />
      <line x1="${xPerson - 1}" y1="${yFloor - pPixH * 0.78}" x2="${xPerson - 3.8}" y2="${yFloor - pPixH * 0.50}" stroke="${pStroke}" stroke-width="2.2" stroke-linecap="round" />
      <!-- Baş -->
      <circle cx="${xPerson}" cy="${yPersonTop + pPixH * 0.08}" r="${Math.max(3.5, pPixH * 0.085)}" fill="#f1c27d" stroke="${pStroke}" stroke-width="1" />

      <!-- TIER 4 (Y=240..262): ③ İzleyici Alt Kademe Rozeti (Zemin altında bağımsız) -->
      <line x1="${xPerson}" y1="${yFloor + 12}" x2="${personLabelX}" y2="240" stroke="${sh.isCastingShadow ? '#ef4444' : '#10b981'}" stroke-width="1.2" stroke-dasharray="2,2" />
      <rect x="${personLabelX - personBadgeW / 2}" y="240" width="${personBadgeW}" height="20" rx="3" fill="#020617" stroke="${sh.isCastingShadow ? '#ef4444' : '#10b981'}" stroke-width="1.2" />
      <text x="${personLabelX}" y="253.5" fill="${sh.isCastingShadow ? '#fecaca' : '#a7f3d0'}" font-size="8.8" text-anchor="middle" font-weight="bold">
        ③ İzleyici: Perdeye ${sh.personDistFromScreenM}m (Boy:${sh.personHeightM}m · Işık:${sh.beamBottomAtPersonM}m)
      </text>
    </svg>`;

    // --- PAFTA 3: 2B PERDE ÖN GÖRÜNÜMÜ (PERDEDEKİ GERÇEKÇİ İNSAN GÖLGESİ SİLÜETİ) ---
    const fSvgW = 240;
    const fSvgH = 240;
    const fPad = 34;
    const availW = fSvgW - fPad * 2;
    const availH = fSvgH - 58;
    const fScale = Math.min(availW / surfW, availH / surfH);
    const drawScrW = round(surfW * fScale, 1);
    const drawScrH = round(surfH * fScale, 1);
    const scrX0 = round((fSvgW - drawScrW) / 2, 1);
    const scrY0 = round(34 + (availH - drawScrH) / 2, 1);

    const drawShW = round(sh.shadowWidthM * fScale, 1);
    const drawShH = round(sh.shadowHeightM * fScale, 1);
    const shCenterX = scrX0 + drawScrW / 2 + Math.max(-surfW / 2, Math.min(surfW / 2, sh.personXM || 0)) * fScale;
    const shX0 = round(Math.max(scrX0, Math.min(scrX0 + drawScrW - drawShW, shCenterX - drawShW / 2)), 1);
    const shY0 = round(scrY0 + drawScrH - (shTopY - scrBot) * fScale, 1);

    // Perde üzerindeki kırpılmış gerçekçi insan silüeti (Pafta 3 SVG koordinatlarında)
    const frontShadowHumanPts = floorShadowPts2D
      .map(([sx, sy]) => {
        const pxSvg = round(scrX0 + (sx + surfW / 2) * fScale, 1);
        const pySvg = round(scrY0 + drawScrH - (sy - scrBot) * fScale, 1);
        return `${pxSvg},${pySvg}`;
      })
      .join(' ');

    const frontSvg = `<svg viewBox="0 0 ${fSvgW} ${fSvgH}" width="100%" height="230" style="background:#0f172a; border-radius:6px; border:1px solid #334155;">
      <text x="10" y="16" fill="#38bdf8" font-size="10" font-weight="bold">🖥️ PAFTA 3 — PERDE ÖN GÖRÜNÜMÜ</text>
      <!-- Perde Dış Çerçevesi -->
      <rect x="${scrX0}" y="${scrY0}" width="${drawScrW}" height="${drawScrH}" fill="#1e293b" stroke="#f8fafc" stroke-width="2" />
      <!-- Aktif Optik Alan -->
      <rect x="${scrX0 + 2}" y="${scrY0 + 2}" width="${Math.max(0, drawScrW - 4)}" height="${Math.max(0, drawScrH - 4)}" fill="#22c55e" fill-opacity="0.18" />
      <text x="${fSvgW / 2}" y="${scrY0 - 6}" fill="#e2e8f0" font-size="8.4" text-anchor="middle" font-weight="bold">
        ① Perde: ${round(surfW, 2)}×${round(surfH, 2)}m (Yerden +${round(scrBot, 2)}m)
      </text>
      ${sh.isCastingShadow && drawShW > 1 && drawShH > 1 ? `
        <!-- Perdedeki Ölçü Sınır Kutusu ve Gerçekçi İnsan Gölgesi Silüeti -->
        <rect x="${shX0}" y="${shY0}" width="${drawShW}" height="${drawShH}" fill="none" stroke="#f87171" stroke-width="1" stroke-dasharray="3,2" />
        ${frontShadowHumanPts ? `
          <polygon points="${frontShadowHumanPts}" fill="#020617" fill-opacity="0.94" stroke="#ef4444" stroke-width="1.5" />
        ` : `
          <rect x="${shX0}" y="${shY0}" width="${drawShW}" height="${drawShH}" fill="#020617" fill-opacity="0.9" stroke="#ef4444" stroke-width="1.8" />
        `}
        <rect x="12" y="${fSvgH - 36}" width="${fSvgW - 24}" height="28" rx="4" fill="#450a0a" stroke="#ef4444" stroke-width="1" />
        <text x="${fSvgW / 2}" y="${fSvgH - 23}" fill="#fecaca" font-size="8.8" text-anchor="middle" font-weight="bold">
          ⬛ PERDEDEKİ İNSAN GÖLGESİ
        </text>
        <text x="${fSvgW / 2}" y="${fSvgH - 12}" fill="#fca5a5" font-size="8.5" text-anchor="middle">
          ${sh.shadowWidthM}m × ${sh.shadowHeightM}m (${sh.shadowAreaM2} m² · %${sh.shadowCoveragePct})
        </text>
      ` : `
        <rect x="14" y="${fSvgH - 32}" width="${fSvgW - 28}" height="22" rx="4" fill="#064e3b" stroke="#10b981" stroke-width="1" />
        <text x="${fSvgW / 2}" y="${fSvgH - 18}" fill="#a7f3d0" font-size="9" text-anchor="middle" font-weight="bold">
          ✓ Perde Üzerinde Gölge Yok (0 m²)
        </text>
      `}
    </svg>`;

    // --- PAFTA 4: 2B ÜSTTEN PLAN (TOP VIEW) ---
    // (PAFTA 5 — Alttan Tavan Görünümü rapordan kaldırıldı)
    const topSvgW = 460;
    const topSvgH = 210;
    const padTopL = 50;
    const padTopR = 40;
    const padTopT = 32;
    const padTopB = 28;
    const plotTopW = topSvgW - padTopL - padTopR;
    const plotTopH = topSvgH - padTopT - padTopB;
    const xOfZTop = (z: number) => padTopL + (Math.max(0, Math.min(totalZ, z)) / totalZ) * plotTopW;
    const yOfXTop = (x: number) => padTopT + plotTopH / 2 + (x / Math.max(1, surfW)) * plotTopH;

    const topPlanSvg = `<svg viewBox="0 0 ${topSvgW} ${topSvgH}" width="100%" height="210" style="background:#090d16; border-radius:6px; border:1px solid #334155;">
      <text x="12" y="18" fill="#38bdf8" font-size="10.5" font-weight="bold">⬆️ PAFTA 4 — 2B ÜSTTEN PLAN GÖRÜNÜMÜ</text>
      <!-- Zemin Bölgesi & Risk Alanı -->
      <rect x="${padTopL}" y="${padTopT}" width="${plotTopW}" height="${plotTopH}" fill="#0f172a" stroke="#334155" stroke-width="1.2" rx="3" />
      ${!sh.neverCastsShadow && zCritClamped > 0.02 ? `
        <rect x="${padTopL}" y="${padTopT}" width="${(zCritClamped / totalZ) * plotTopW}" height="${plotTopH}" fill="#ef4444" fill-opacity="0.22" stroke="#ef4444" stroke-width="1" stroke-dasharray="3,2" />
        <text x="${padTopL + (zCritClamped / totalZ) * plotTopW / 2}" y="${padTopT + plotTopH - 6}" fill="#fca5a5" font-size="7.5" text-anchor="middle" font-weight="bold">Kritik Gölge Risk Bölgesi (0 - ${zCritClamped.toFixed(2)}m)</text>
      ` : ''}
      <!-- Perde Çizgisi ve Etiketi -->
      <line x1="${padTopL}" y1="${yOfXTop(-surfW / 2)}" x2="${padTopL}" y2="${yOfXTop(surfW / 2)}" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" />
      <rect x="${padTopL - 38}" y="${padTopT + plotTopH / 2 - 10}" width="34" height="20" rx="3" fill="#0369a1" stroke="#38bdf8" stroke-width="1" />
      <text x="${padTopL - 21}" y="${padTopT + plotTopH / 2 + 3}" fill="#f0f9ff" font-size="8.5" text-anchor="middle" font-weight="bold">Perde</text>
      
      <!-- Işık Konisi (Üstten Üçgen) -->
      <polygon points="${xOfZTop(totalZ)},${yOfXTop(fs.devicePosM[0] || 0)} ${padTopL},${yOfXTop(-surfW / 2)} ${padTopL},${yOfXTop(surfW / 2)}" fill="#38bdf8" fill-opacity="0.18" stroke="#38bdf8" stroke-width="1.4" />
      
      <!-- İzleyici Üstten Dairesi ve Etiketi -->
      <circle cx="${xOfZTop(pZ)}" cy="${yOfXTop(pX)}" r="${Math.max(6, (pW / surfW) * plotTopH * 0.45)}" fill="${sh.isCastingShadow ? '#ef4444' : '#10b981'}" stroke="#fff" stroke-width="1.5" />
      <rect x="${xOfZTop(pZ) - 24}" y="${yOfXTop(pX) - 22}" width="48" height="15" rx="3" fill="${sh.isCastingShadow ? '#7f1d1d' : '#064e3b'}" stroke="${sh.isCastingShadow ? '#ef4444' : '#10b981'}" stroke-width="1" />
      <text x="${xOfZTop(pZ)}" y="${yOfXTop(pX) - 12}" fill="#ffffff" font-size="8" text-anchor="middle" font-weight="bold">İzleyici</text>
      
      <!-- Cihaz Kutusu ve Etiketi -->
      <rect x="${xOfZTop(totalZ) - 8}" y="${yOfXTop(fs.devicePosM[0] || 0) - 7}" width="16" height="14" rx="3" fill="#0284c7" stroke="#bae6fd" stroke-width="1.5" />
      <rect x="${xOfZTop(totalZ) - 20}" y="${yOfXTop(fs.devicePosM[0] || 0) + 12}" width="40" height="15" rx="3" fill="#0c4a6e" stroke="#38bdf8" stroke-width="1" />
      <text x="${xOfZTop(totalZ)}" y="${yOfXTop(fs.devicePosM[0] || 0) + 22}" fill="#38bdf8" font-size="8" text-anchor="middle" font-weight="bold">Cihaz</text>
      
      <!-- Z Mesafesi Ölçü Çizgisi & Etiketi -->
      <line x1="${padTopL}" y1="${topSvgH - 14}" x2="${xOfZTop(totalZ)}" y2="${topSvgH - 14}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="3,2" />
      <polygon points="${padTopL},${topSvgH - 14} ${padTopL + 4},${topSvgH - 16} ${padTopL + 4},${topSvgH - 12}" fill="#94a3b8" />
      <polygon points="${xOfZTop(totalZ)},${topSvgH - 14} ${xOfZTop(totalZ) - 4},${topSvgH - 16} ${xOfZTop(totalZ) - 4},${topSvgH - 12}" fill="#94a3b8" />
      <rect x="${(padTopL + xOfZTop(totalZ)) / 2 - 85}" y="${topSvgH - 22}" width="170" height="16" rx="3" fill="#020617" stroke="#475569" stroke-width="0.8" />
      <text x="${(padTopL + xOfZTop(totalZ)) / 2}" y="${topSvgH - 11}" fill="#f8fafc" font-size="8.5" text-anchor="middle" font-weight="bold">⟷ Z Mesafesi (Perdeden Cihaza: ${totalZ.toFixed(2)}m)</text>
    </svg>`;

    blocks.push(`<section class="report-section" style="break-inside:avoid; page-break-inside:avoid;">
      <h2>🕴️ Kamera / Projektör FOV &amp; İnsan Gölge Analizi Raporu (3B &amp; 2B Paftalı)</h2>
      <div style="display:inline-block; font-family:monospace; font-size:10px; font-weight:700; background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; margin-bottom:8px; border:1px solid #bae6fd;">Senaryo: SCN-02-SHADOW-SIMULATION · Hedef: Perde (${surfW}×${surfH} m) · Cihaz Atım (Z): ${totalZ.toFixed(2)} m · İzleyici Mesafesi: ${sh.personDistFromScreenM.toFixed(2)} m</div>
      <div style="padding:8px 12px; margin-bottom:10px; border-radius:6px; border:1px solid ${sh.isCastingShadow ? '#fca5a5' : '#86efac'}; background:${sh.isCastingShadow ? '#fef2f2' : '#f0fdf4'}; color:${sh.isCastingShadow ? '#991b1b' : '#166534'}; font-size:11px; font-weight:700;">
        ${esc(sh.zoneStatusLabel)} — ${esc(sh.reportSummaryTr)}
      </div>
      <!-- 3B İZOMETRİK VEKTÖREL PAFTA (PAFTA 1) -->
      ${ep.iso3d ? `<div class="diagram" style="margin-bottom:10px;">${iso3dSvg}</div>` : ''}

      <!-- SEÇİLEN VE EKLENEN ÇOKLU AÇI 3B CANLI GÖRÜNÜMLERİ (GENİŞLETİLMİŞ 2-KOLONLU GRID) -->
      ${Array.isArray(fs.capturedViews) && fs.capturedViews.length > 0 ? `
        <div style="margin-bottom:12px;">
          <div style="font-size:10.5px; font-weight:700; color:#38bdf8; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>📸 RAPORA EKLENEN ÇOKLU AÇI 3B CANLI GÖRÜNÜMLER (${fs.capturedViews.length} Adet Açı)</span>
            <span style="font-size:9px; color:#94a3b8; font-weight:normal;">Yüksek Çözünürlüklü Canlı WebGL Simülasyon Açıları</span>
          </div>
          <div style="display:grid; grid-template-columns: ${fs.capturedViews.length === 1 ? '1fr' : '1fr 1fr'}; gap:10px;">
            ${fs.capturedViews.map(cv => `
              <div style="background:#070b14; border:1px solid #334155; border-radius:6px; padding:8px;">
                <div style="font-size:10px; font-weight:700; color:#93c5fd; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                  <span>🎥 ${esc(cv.label)}</span>
                  <span style="background:#1e293b; color:#38bdf8; padding:2px 7px; border-radius:4px; font-size:8.5px; font-family:monospace; font-weight:bold; border:1px solid #334155;">${esc(cv.angle.toUpperCase())}</span>
                </div>
                <img src="${cv.dataUrl}" alt="${esc(cv.label)}" style="width:100%; height:250px; object-fit:contain; border-radius:4px; background:linear-gradient(180deg, #0b1329 0%, #030712 100%);" />
              </div>
            `).join('')}
          </div>
        </div>
      ` : fs.snapshot3dDataUrl ? `
        <div style="margin-bottom:10px; background:#070b14; border:1px solid #334155; border-radius:6px; padding:8px;">
          <div style="font-size:10px; font-weight:700; color:#38bdf8; margin-bottom:6px;">🎥 3B SAHNE GÖRÜNÜMÜ (CANLI WEBGL SİMÜLASYONU)</div>
          <img src="${fs.snapshot3dDataUrl}" alt="3B FOV ve Gölge Simülasyonu" style="width:100%; height:250px; object-fit:contain; border-radius:4px; background:linear-gradient(180deg, #0b1329 0%, #030712 100%);" />
        </div>
      ` : ''}

      <!-- 2B VEKTÖREL PAFTALAR (YAN KESİT, PERDE ÖN, ÜSTTEN PLAN) -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:8px; margin-bottom:10px;">
        ${ep.sideSection ? `<div class="diagram" style="margin:0;">${sideSvg}</div>` : ''}
        ${ep.frontElevation ? `<div class="diagram" style="margin:0;">${frontSvg}</div>` : ''}
        ${ep.topPlan ? `<div class="diagram" style="margin:0;">${topPlanSvg}</div>` : ''}
      </div>
      <table class="compact-table">
        <thead>
          <tr>
            <th>Gölge &amp; Geometri Parametresi</th>
            <th>Hesaplanan Değer</th>
            <th>Gölge &amp; Geometri Parametresi</th>
            <th>Hesaplanan Değer</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>① Hedef Perde / Yüzey &amp; Yerden Yükseklik</b></td>
            <td>${round(fs.surfaceWidthM, 2)} m × ${round(fs.surfaceHeightM, 2)} m (Yerden: +${round(scrBot, 2)} m → Üst: ${round(scrBot + surfH, 2)} m)</td>
            <td><b>④ Optik Görüş Açısı (FOV)</b></td>
            <td>${fs.hfovDeg}° × ${fs.vfovDeg}° (Diagonal: ${fs.dfovDeg}°)</td>
          </tr>
          <tr>
            <td><b>④ Cihaz Mesafesi &amp; Lens Yüksekliği</b></td>
            <td>Perdeden Z: ${round(fs.devicePosM[2], 2)} m · Yerden Y: ${sh.deviceHeightFromFloorM} m</td>
            <td><b>③ İzleyici Boyu &amp; Omuz Genişliği</b></td>
            <td>Boy: ${sh.personHeightM} m · Omuz: ${sh.personWidthM} m</td>
          </tr>
          <tr>
            <td><b>② Kritik Gölge Başlangıç Sınırı (Riskli Bölge)</b></td>
            <td><b style="color:#b45309;">${sh.neverCastsShadow ? 'Gölge Yok (0 m)' : `Perdeden 0 – ${sh.shadowEntryDistFromScreenM} m`}</b> (Cihazdan: ${sh.shadowEntryDistFromDeviceM} m)</td>
            <td><b>③ Mevcut İzleyici Konumu</b></td>
            <td><b>Perdeye ${sh.personDistFromScreenM} m</b> (Cihaza: ${sh.personDistFromDeviceM} m)</td>
          </tr>
          <tr>
            <td><b>③ İzleyici Hizasında Işık Alt Sınırı</b></td>
            <td>Yerden ${sh.beamBottomAtPersonM} m (${sh.headClearanceM >= 0 ? `+${sh.headClearanceM} m güvenli baş üstü boşluk` : `Işığa ${sh.intrusionHeightM} m giriyor`})</td>
            <td><b>① Perdede Oluşan İnsan Gölgesi</b></td>
            <td><b style="color:${sh.isCastingShadow ? '#dc2626' : '#15803d'};">${sh.isCastingShadow ? `${sh.shadowWidthM} m × ${sh.shadowHeightM} m (${sh.shadowAreaM2} m² · %${sh.shadowCoveragePct})` : '0 m × 0 m (Perde Temiz / Gölgesiz)'}</b></td>
          </tr>
        </tbody>
      </table>
    </section>`);
  }

  // 10.4. PROFESYONEL OPTİK CİHAZ PROFİLİ, PROJEKSİYON LENS VE KAMERA FOV MOTORU RAPORU (BÖLÜM 9)
  if (p.sections.opticalStudio !== false && p.opticalStudioReport) {
    const os = p.opticalStudioReport;
    const pj = os.projectorProfile;
    const po = os.projectorCalc;
    const cam = os.cameraProfile;
    const co = os.cameraCalc;
    const cr = os.compliance;

    const fmtNull = (v: number | string | null | undefined, suffix = ''): string => {
      if (v === null || v === undefined || v === '') return 'UNKNOWN';
      return `${v}${suffix ? ` ${suffix}` : ''}`;
    };

    // 2B Üstten Plan ve Yandan Kesit SVG (PDF uyumlu)
    const rmW = os.room.widthM;
    const rmD = os.room.lengthM;
    const rmH = os.room.heightM;
    const pjZ = os.projectorPosM[2];
    const pjX = os.projectorPosM[0];
    const pjY = os.projectorPosM[1];
    const camZ = os.cameraPosM[2];
    const camX = os.cameraPosM[0];
    const camY = os.cameraPosM[1];
    const imgW = po.nominalImageWidthM ?? os.room.surfaceWidthM;
    const imgH = po.nominalImageHeightM ?? os.room.surfaceHeightM;
    const imgBotY = po.offsetAnalysis.projectedBottomFromFloorM ?? os.room.surfaceBottomFromFloorM;
    const camW = co.horizontalCoverageM ?? os.room.surfaceWidthM;

    const planSvg = `<svg viewBox="0 0 420 165" width="100%" height="155" style="background:#0f172a; border-radius:6px; border:1px solid #334155;">
      <text x="10" y="15" fill="#38bdf8" font-size="9.5" font-weight="bold">📐 2B ÜSTTEN PLAN — PROJEKTÖR IŞIK &amp; KAMERA FOV FRUSTUMLARI</text>
      <rect x="24" y="24" width="372" height="122" fill="#090d16" stroke="#475569" stroke-width="1.2" />
      <line x1="24" y1="45" x2="24" y2="125" stroke="#f8fafc" stroke-width="4" />
      <polygon points="${24 + (pjZ / Math.max(1, rmD)) * 372},${24 + ((pjX + rmW / 2) / Math.max(1, rmW)) * 122} 24,${24 + ((pjX - imgW / 2 + rmW / 2) / Math.max(1, rmW)) * 122} 24,${24 + ((pjX + imgW / 2 + rmW / 2) / Math.max(1, rmW)) * 122}" fill="#38bdf8" fill-opacity="0.22" stroke="#38bdf8" stroke-width="1.4" />
      <polygon points="${24 + (camZ / Math.max(1, rmD)) * 372},${24 + ((camX + rmW / 2) / Math.max(1, rmW)) * 122} 24,${24 + ((camX - camW / 2 + rmW / 2) / Math.max(1, rmW)) * 122} 24,${24 + ((camX + camW / 2 + rmW / 2) / Math.max(1, rmW)) * 122}" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-width="1.3" stroke-dasharray="4,2" />
      <rect x="${24 + (pjZ / Math.max(1, rmD)) * 372 - 6}" y="${24 + ((pjX + rmW / 2) / Math.max(1, rmW)) * 122 - 5}" width="12" height="10" fill="#0284c7" stroke="#fff" />
      <circle cx="${24 + (camZ / Math.max(1, rmD)) * 372}" cy="${24 + ((camX + rmW / 2) / Math.max(1, rmW)) * 122}" r="5" fill="#059669" stroke="#fff" />
    </svg>`;

    const secSvg = `<svg viewBox="0 0 420 165" width="100%" height="155" style="background:#0f172a; border-radius:6px; border:1px solid #334155;">
      <text x="10" y="15" fill="#a855f7" font-size="9.5" font-weight="bold">📏 2B YAN KESİT — OPTİK OFFSET (%${fmtNull(pj.optics.lensOffsetPct)}) &amp; DİKEY YERLEŞİM</text>
      <rect x="24" y="24" width="372" height="122" fill="#090d16" stroke="#475569" stroke-width="1.2" />
      <polygon points="${24 + (pjZ / Math.max(1, rmD)) * 372},${146 - (pjY / Math.max(1, rmH)) * 122} 24,${146 - (imgBotY / Math.max(1, rmH)) * 122} 24,${146 - ((imgBotY + imgH) / Math.max(1, rmH)) * 122}" fill="#38bdf8" fill-opacity="0.22" stroke="#38bdf8" stroke-width="1.4" />
      <line x1="${24 + (pjZ / Math.max(1, rmD)) * 372}" y1="${146 - (pjY / Math.max(1, rmH)) * 122}" x2="24" y2="${146 - (pjY / Math.max(1, rmH)) * 122}" stroke="#fbbf24" stroke-width="1.2" stroke-dasharray="3,3" />
      <rect x="${24 + (pjZ / Math.max(1, rmD)) * 372 - 6}" y="${146 - (pjY / Math.max(1, rmH)) * 122 - 4}" width="12" height="8" fill="#0284c7" stroke="#fff" />
      <circle cx="${24 + (camZ / Math.max(1, rmD)) * 372}" cy="${146 - (camY / Math.max(1, rmH)) * 122}" r="4.5" fill="#059669" stroke="#fff" />
    </svg>`;

    const statusBadgeColor = (s: string) =>
      s === 'PASS' ? '#15803d' : s === 'WARNING' ? '#b45309' : s === 'FAIL' ? '#dc2626' : '#475569';

    // Eksik (UNKNOWN) verilerin özeti
    const unknownFields: string[] = [];
    if (pj.general.nativeContrastRatio === null) unknownFields.push('Projektör Native Kontrast Oranı (UNKNOWN — yalnızca Dynamic Contrast tanımlı)');
    if (pj.optics.lensShiftVerticalMinPct === null && pj.optics.lensShiftVerticalMaxPct === null) unknownFields.push('Projektör Optik Lens Shift Aralığı (UNKNOWN)');
    if (pj.optics.offsetMeasurementConvention === 'UNSPECIFIED') unknownFields.push('Projektör Offset Ölçüm Konvansiyonu (UNSPECIFIED)');
    if (cam.sensor.sensorWidthMm === null || cam.sensor.sensorHeightMm === null) unknownFields.push('Kamera Fiziksel Sensör Boyutu (UNKNOWN)');

    blocks.push(`<section class="report-section" style="break-inside:avoid; page-break-inside:avoid;">
      <h2>🔬 Profesyonel Optik Cihaz Profili, Projeksiyon Lens &amp; FOV Kamera Mühendislik Raporu</h2>
      <div style="display:inline-block; font-family:monospace; font-size:10px; font-weight:700; background:#f3e8ff; color:#6b21a8; padding:2px 8px; border-radius:4px; margin-bottom:8px; border:1px solid #e9d5ff;">Senaryo: SCN-03-OPTICAL-STUDIO-CALIBRATION · Oda: ${rmW}×${rmD}×${rmH} m · Yüzey: ${os.room.surfaceWidthM}×${os.room.surfaceHeightM} m · Cihaz Atım: ${pjZ.toFixed(2)} m · Kamera: ${camZ.toFixed(2)} m (Sony FX3)</div>
      <div style="padding:8px 12px; margin-bottom:10px; border-radius:6px; border:1px solid #cbd5e1; background:#f8fafc; font-size:11px;">
        <b>Veri Kaynağı &amp; Metodoloji Ayrımı:</b> Bu bölümdeki hesaplamalar <b>Teorik Geometrik/Optik Formüller</b> ($TR = D/W$, $FOV = 2\\arctan(S/(2f))$), <b>3B Mekan Simülasyon Modeli</b> ve <b>Cihaz Veri Kaynağı (${esc(pj.dataSource)} / ${esc(pj.verificationStatus)})</b> ayrımları korunarak üretilmiştir. Bilinmeyen hiçbir parametre 0 kabul edilmemiş, <code>UNKNOWN</code> olarak raporlanmıştır.
      </div>

      <!-- 1. Cihaz Teknik Profilleri Tablosu -->
      <table class="compact-table" style="margin-bottom:10px;">
        <thead>
          <tr>
            <th colspan="2">🅰️ Projeksiyon Cihazı Teknik Profili (${esc(pj.brand)} ${esc(pj.model)})</th>
            <th colspan="2">🅱️ Kamera &amp; Görüntüleme Cihazı Profili (${esc(cam.brand)} ${esc(cam.model)})</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Görüntü Teknolojisi / Işık Kaynağı</b></td>
            <td>${esc(fmtNull(pj.general.displayTechnology))} (${esc(fmtNull(pj.general.chipConfiguration))}) · ${esc(fmtNull(pj.general.lightSource))}</td>
            <td><b>Sensör Tipi &amp; Fiziksel Boyutu</b></td>
            <td>${esc(fmtNull(cam.sensor.sensorType))} (${fmtNull(cam.sensor.sensorWidthMm, 'mm')} × ${fmtNull(cam.sensor.sensorHeightMm, 'mm')})</td>
          </tr>
          <tr>
            <td><b>Parlaklık &amp; Doğal Çözünürlük</b></td>
            <td>${fmtNull(pj.general.brightnessAnsiLumens, 'ANSI lm')} · ${esc(fmtNull(pj.general.nativeResolutionLabel))} (${esc(fmtNull(pj.general.nativeAspectRatio))})</td>
            <td><b>Kamera Doğal Çözünürlük &amp; Crop</b></td>
            <td>${fmtNull(cam.sensor.nativeResolutionW)}×${fmtNull(cam.sensor.nativeResolutionH)} px · Crop: ${fmtNull(cam.sensor.cropFactor, 'x')}</td>
          </tr>
          <tr>
            <td><b>Kontrast (Native vs Dynamic Ayrımı)</b></td>
            <td>Native: <b>${esc(fmtNull(pj.general.nativeContrastRatio))}</b> · Dynamic: <b>${esc(fmtNull(pj.general.dynamicContrastRatio))}</b></td>
            <td><b>Kamera Lens Odak &amp; Diyafram</b></td>
            <td>f = ${fmtNull(cam.lens.focalLengthMinMm, 'mm')}–${fmtNull(cam.lens.focalLengthMaxMm, 'mm')} · F/${fmtNull(cam.lens.apertureFNumberMin)}–${fmtNull(cam.lens.apertureFNumberMax)}</td>
          </tr>
          <tr>
            <td><b>Throw Ratio &amp; Optik Zoom</b></td>
            <td>TR: <b>${fmtNull(pj.optics.throwRatioMin)} – ${fmtNull(pj.optics.throwRatioMax)}:1</b> · Zoom: ${fmtNull(pj.optics.opticalZoomRatio, 'x')} (f=${fmtNull(pj.optics.focalLengthMinMm)}–${fmtNull(pj.optics.focalLengthMaxMm)} mm, F/${fmtNull(pj.optics.fNumberMin)}–${fmtNull(pj.optics.fNumberMax)})</td>
            <td><b>Kamera İdeal Rektilineer FOV</b></td>
            <td>HFOV: <b>${fmtNull(co.rectilinearHfovDeg, '°')}</b> · VFOV: <b>${fmtNull(co.rectilinearVfovDeg, '°')}</b> · DFOV: <b>${fmtNull(co.rectilinearDfovDeg, '°')}</b><br/>
              <span style="font-size:8.5px; color:#475569;">
                Formül: <code>2×arctan(S/(2f))</code> [Sony FX3: 35.6×23.8 mm FF]<br/>
                • f=24mm: H 73.1° × V 52.7° (Geniş Uç) | • f=35mm: H 53.9° × V 37.6° (Referans) | • f=70mm: H 28.5° × V 19.3° (Tele Uç)
              </span>
            </td>
          </tr>
          <tr>
            <td><b>Optik Offset &amp; Konvansiyon</b></td>
            <td>%${fmtNull(pj.optics.lensOffsetPct)} ±%${fmtNull(pj.optics.lensOffsetTolerancePct)} (<code>${esc(pj.optics.offsetMeasurementConvention ?? 'UNSPECIFIED')}</code>)</td>
            <td><b>Distorsiyon Kalibreli vs Dijital Zoom</b></td>
            <td>Distorsiyon (%${fmtNull(co.distortionPct)}): HFOV=${fmtNull(co.calibratedHfovDeg, '°')} · Dijital Zoom (${co.digitalZoomFactor}x): ${co.effectiveResolutionAfterDigitalZoom ? `${co.effectiveResolutionAfterDigitalZoom.w}×${co.effectiveResolutionAfterDigitalZoom.h} px` : 'UNKNOWN'}</td>
          </tr>
          <tr>
            <td><b>Mekanik Boyut, Ağırlık &amp; Güç</b></td>
            <td>${fmtNull(pj.mechanical.widthMm)}×${fmtNull(pj.mechanical.depthMm)}×${fmtNull(pj.mechanical.heightMm)} mm · ${fmtNull(pj.mechanical.weightKg, 'kg')} · ${fmtNull(pj.electrical.powerConsumptionW, 'W')}</td>
            <td><b>Veri Kaynağı &amp; Doğrulama</b></td>
            <td>PJ: <code>${esc(pj.dataSource)}</code> (${esc(pj.verificationStatus)}) · CAM: <code>${esc(cam.dataSource)}</code></td>
          </tr>
        </tbody>
      </table>

      <!-- 2. Projektör Mesafe & Görüntü Boyutu Referans Matrisi (5m, 7m, 3m) -->
      <table class="compact-table" style="margin-bottom:10px;">
        <thead>
          <tr>
            <th>Projektör Lens Hesap Senaryosu</th>
            <th>Min Genişlik (Tele TR=${fmtNull(po.maxThrowRatio)})</th>
            <th>Max Genişlik (Wide TR=${fmtNull(po.minThrowRatio)})</th>
            <th>Görüntü Yüksekliği (${esc(po.aspectRatioLabel)})</th>
            <th>Gereken Atım Mesafesi Penceresi</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>5.00 m Atım Mesafesinde Görüntü Boyutu</b></td>
            <td>${fmtNull(po.referenceMatrix.at5mDistance.minWidthM, 'm')}</td>
            <td>${fmtNull(po.referenceMatrix.at5mDistance.maxWidthM, 'm')}</td>
            <td>${fmtNull(po.referenceMatrix.at5mDistance.minHeightM, 'm')} – ${fmtNull(po.referenceMatrix.at5mDistance.maxHeightM, 'm')}</td>
            <td>5.000 m (Sabit)</td>
          </tr>
          <tr>
            <td><b>7.00 m Atım Mesafesinde Görüntü Boyutu</b></td>
            <td>${fmtNull(po.referenceMatrix.at7mDistance.minWidthM, 'm')}</td>
            <td>${fmtNull(po.referenceMatrix.at7mDistance.maxWidthM, 'm')}</td>
            <td>${fmtNull(po.referenceMatrix.at7mDistance.minHeightM, 'm')} – ${fmtNull(po.referenceMatrix.at7mDistance.maxHeightM, 'm')}</td>
            <td>7.000 m (Sabit)</td>
          </tr>
          <tr>
            <td><b>3.00 m Hedef Genişlik İçin Atım Mesafesi</b></td>
            <td>3.000 m</td>
            <td>3.000 m</td>
            <td>${fmtNull(po.referenceMatrix.for3mWidth.imageHeightM, 'm')}</td>
            <td><b>${fmtNull(po.referenceMatrix.for3mWidth.minDistanceM, 'm')} – ${fmtNull(po.referenceMatrix.for3mWidth.maxDistanceM, 'm')}</b></td>
          </tr>
        </tbody>
      </table>

      <!-- 3. 2B Üstten Plan ve Yandan Kesit Paftaları + Rapora Eklenen Çoklu 3B Açı Görünümleri -->
      ${Array.isArray(os.capturedViews) && os.capturedViews.length > 0 ? `
        <div style="margin-bottom:12px;">
          <div style="font-size:10.5px; font-weight:700; color:#38bdf8; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>📸 RAPORA EKLENEN ÇOKLU AÇI 3B CANLI GÖRÜNÜMLER (${os.capturedViews.length} Adet Açı)</span>
            <span style="font-size:9px; color:#94a3b8; font-weight:normal;">Yüksek Çözünürlüklü Canlı WebGL Simülasyon Açıları</span>
          </div>
          <div style="display:grid; grid-template-columns: ${os.capturedViews.length === 1 ? '1fr' : '1fr 1fr'}; gap:10px;">
            ${os.capturedViews.map(cv => `
              <div style="background:#070b14; border:1px solid #334155; border-radius:6px; padding:8px;">
                <div style="font-size:10px; font-weight:700; color:#93c5fd; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                  <span>🎥 ${esc(cv.label)}</span>
                  <span style="background:#1e293b; color:#38bdf8; padding:2px 7px; border-radius:4px; font-size:8.5px; font-family:monospace; font-weight:bold; border:1px solid #334155;">${esc(cv.angle.toUpperCase())}</span>
                </div>
                <img src="${cv.dataUrl}" alt="${esc(cv.label)}" style="width:100%; height:250px; object-fit:contain; border-radius:4px; background:linear-gradient(180deg, #0b1329 0%, #030712 100%);" />
              </div>
            `).join('')}
          </div>
        </div>
      ` : os.snapshot3dDataUrl ? `
        <div style="margin-bottom:10px; background:#070b14; border:1px solid #334155; border-radius:6px; padding:8px;">
          <div style="font-size:10px; font-weight:700; color:#38bdf8; margin-bottom:6px;">🎥 3B SAHNE GÖRÜNÜMÜ (CANLI WEBGL SİMÜLASYONU)</div>
          <img src="${os.snapshot3dDataUrl}" alt="3B Optik Simülasyon" style="width:100%; height:250px; object-fit:contain; border-radius:4px; background:linear-gradient(180deg, #0b1329 0%, #030712 100%);" />
        </div>
      ` : ''}

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:10px;">
        ${os.enabledPaftas?.topPlan !== false ? `<div class="diagram" style="margin:0;">${planSvg}</div>` : ''}
        ${os.enabledPaftas?.sideSection !== false ? `<div class="diagram" style="margin:0;">${secSvg}</div>` : ''}
      </div>

      <!-- 4. 9-Maddeli Fiziksel Uygunluk Kontrol Tablosu -->
      <table class="compact-table" style="margin-bottom:8px;">
        <thead>
          <tr>
            <th>Kod</th>
            <th>Fiziksel &amp; Optik Uygunluk Kontrolü</th>
            <th>Durum</th>
            <th>Hesaplanan / Ölçülen</th>
            <th>Sınır / Kriter</th>
            <th>Mühendislik Açıklaması</th>
          </tr>
        </thead>
        <tbody>
          ${cr.checks
            .map(
              c => `<tr>
            <td><code>${esc(c.id)}</code></td>
            <td><b>${esc(c.titleTr)}</b></td>
            <td><b style="color:${statusBadgeColor(c.status)};">${esc(c.status)}</b></td>
            <td>${esc(c.measuredOrCalculatedValue)}</td>
            <td>${esc(c.limitOrRequirement)}</td>
            <td>${esc(c.detailTr)}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>

      <div style="font-size:10.5px; color:#334155; background:#f1f5f9; padding:6px 10px; border-radius:4px;">
        <b>Offset / Lens Shift / Keystone &amp; Eksik Veri (UNKNOWN) Özeti:</b>
        ${esc(po.offsetAnalysis.summaryTr)} · ${esc(po.lensShiftAnalysis.summaryTr)} · ${esc(po.keystoneAnalysis.summaryTr)}
        ${unknownFields.length > 0 ? `<br/><b>Tespit Edilen UNKNOWN Parametreler:</b> ${esc(unknownFields.join(' | '))}` : ''}
      </div>
    </section>`);
  }

  // 10.5. MÜHENDİSLİK ÇAPRAZ DOĞRULAMA MOTORU
  const validationRes = validateReportConsistency(p);
  if (validationRes.warnings.length > 0) {
    warnings.push(...validationRes.warnings);
  }
  const modeBanner = p.reportMode === 'as_built'
    ? `<div style="margin:0 0 10px; padding:7px 12px; border:1px solid #0284c7; background:#f0f9ff; color:#0369a1; border-radius:6px; font-size:10.5px; font-weight:700;">
        🏗️ UYGULAMA / SAHA RAPORU (As-Built) — Katalog verileri, gerçek ölçüler, saha lux ölçümleri ve doğrulanmış elektrik verileri esaslıdır.
      </div>`
    : `<div style="margin:0 0 10px; padding:7px 12px; border:1px solid #94a3b8; background:#f8fafc; color:#334155; border-radius:6px; font-size:10.5px; font-weight:700;">
        📐 TASARIM &amp; SİMÜLASYON RAPORU — Proje aşaması ön mühendislik ve simülasyon sonuçlarıdır; saha kurulumu öncesi katalog/ölçüm doğrulaması gerekir.
      </div>`;
  blocks.unshift(modeBanner);

  if (validationRes.draftRequired) {
    blocks.unshift(`<div style="margin:0 0 14px; padding:10px 14px; border:2px solid #dc2626; background:#fef2f2; color:#991b1b; border-radius:8px; font-size:11.5px; font-weight:700;">
      ⛔ TASLAK / DOĞRULANMAMIŞ MÜHENDİSLİK RAPORU — Çapraz doğrulama motoru ${validationRes.errorCount} kritik tutarsızlık ve ${validationRes.unknownCount} eksik veri (UNKNOWN) tespit etti (Skor: %${validationRes.consistencyScorePct}). Nihai müşteri sunumu öncesi hatalı/eksik veriler giderilmelidir.
    </div>`);
  }
  if (p.sections.includeValidationEngine !== false) {
    const valHtml = renderValidationEngineA4Html(validationRes);
    if (valHtml) blocks.push(valHtml);
  }

  // 11. TEKNİK KABULLER & MÜHENDİSLİK ONAYI
  if (p.sections.assumptionsAndWarnings) {
    const valAlertMsgs = validationRes.checks
      .filter(c => c.verdict === 'FAIL' || c.verdict === 'UNKNOWN' || c.status === 'warning')
      .map(c => `[${c.verdict}] ${c.title}: ${c.message}`);
    const mergedWarnings = [...new Set([...warnings, ...valAlertMsgs])];
    const wHtml = mergedWarnings.length > 0
      ? `<ul class="warning-list">${mergedWarnings.map(w => `<li class="warn">⚠ ${esc(w)}</li>`).join('')}</ul>`
      : (validationRes.hasCriticalErrors || validationRes.unknownCount > 0 || validationRes.warningCount > 0)
        ? `<p class="warn">⚠ Çapraz doğrulama motorunda ${validationRes.errorCount} kritik hata, ${validationRes.warningCount} uyarı ve ${validationRes.unknownCount} doğrulanamayan (UNKNOWN) kalem tespit edildi; onay öncesi incelenmelidir.</p>`
        : '<p class="text-muted">Kritik bir mühendislik uyarısı bulunmamaktadır.</p>';
    const aHtml = assumptions.length ? `<ul class="assumption-list">${[...new Set(assumptions)].map(a => `<li>• ${esc(a)}</li>`).join('')}</ul>` : '';

    blocks.push(`<section class="report-section">
      <h2>${tr.assumptions}</h2>
      ${wHtml}
      ${aHtml}
    </section>`);
  }

  return `<!doctype html>
<html lang="${p.lang}">
<head>
<meta charset="utf-8"/>
<title>${esc(m.projectName)} — ${tr.reportTitle}</title>
<style>
  :root {
    --primary: #0284c7;
    --primary-dark: #0369a1;
    --dark: #0f172a;
    --border: #cbd5e1;
    --bg-alt: #f8fafc;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    margin: 0;
    padding: 32px;
    line-height: 1.5;
    font-size: 13px;
  }
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid var(--primary);
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .report-header h1 {
    font-size: 22px;
    margin: 0 0 4px;
    color: var(--primary-dark);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .company-title {
    font-size: 14px;
    color: #475569;
    font-weight: 600;
  }
  .header-logo {
    max-height: 64px;
    max-width: 220px;
    object-fit: contain;
  }
  
  .meta-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    background: #f8fafc;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .meta-table th, .meta-table td {
    padding: 8px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
  .meta-table th {
    background: #f1f5f9;
    color: #334155;
    width: 16%;
    font-weight: 600;
    text-align: left;
  }
  
  .report-section {
    margin-bottom: 32px;
    break-inside: avoid;
  }
  h2 {
    font-size: 16px;
    color: #0f172a;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 6px;
    margin: 24px 0 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sub-heading {
    font-size: 13px;
    color: #334155;
    margin: 16px 0 8px;
    font-weight: 700;
  }
  .section-intro {
    font-size: 12px;
    color: #475569;
    margin-bottom: 12px;
  }
  
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .metric-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 12px;
    border-radius: 6px;
    text-align: center;
  }
  .metric-val {
    font-size: 18px;
    font-weight: 800;
    font-family: monospace;
    margin-bottom: 2px;
  }
  .metric-lbl {
    font-size: 11px;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .text-sky { color: #0284c7; }
  .text-amber { color: #d97706; }
  .text-emerald { color: #059669; }
  .text-purple { color: #7c3aed; }
  .text-rose { color: #e11d48; }
  
  .three-d-gallery {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 12px 0;
  }
  .three-d-card {
    background: #090e17;
    border: 1px solid #1e293b;
    border-radius: 8px;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .three-d-card-label {
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
    background: #0f172a;
    border-bottom: 1px solid #1e293b;
  }
  .three-d-img {
    width: 100%;
    height: auto;
    display: block;
    max-height: 82vh;
    object-fit: contain;
    background: #060911;
  }
  .empty-3d-box {
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    padding: 16px;
    border-radius: 6px;
    color: #64748b;
    font-size: 12px;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin: 10px 0;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 7px 10px;
    text-align: left;
  }
  th {
    background: #f1f5f9;
    color: #1e293b;
    font-weight: 600;
  }
  .compact-table th, .compact-table td {
    padding: 5px 8px;
    font-size: 11px;
  }
  .pj-matrix-table td {
    font-family: monospace;
    font-size: 11px;
  }
  .pj-id-cell {
    color: #0284c7;
  }
  .measure-cell {
    text-align: right;
  }
  .highlight-cell {
    background: #f0fdf4;
    color: #166534;
    font-weight: 700;
  }
  .coord-cell {
    font-size: 10px;
    color: #475569;
  }
  
  .diagram {
    margin: 14px 0;
    max-width: 100%;
    background: #090e17;
    border: 1px solid #334155;
    border-radius: 6px;
    overflow: hidden;
    padding: 8px;
  }
  .diagram svg {
    width: 100%;
    height: auto;
    max-height: 420px;
    display: block;
  }
  .legend-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 11px;
    background: #f8fafc;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    margin-top: 6px;
  }
  
  .badge-circuit {
    display: inline-block;
    padding: 2px 6px;
    background: #e0f2fe;
    color: #0369a1;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
  }
  .badge-success {
    color: #15803d;
    font-weight: bold;
  }
  .badge-danger {
    color: #b91c1c;
    font-weight: bold;
  }
  .guideline-card {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    padding: 12px;
    border-radius: 6px;
    margin-top: 14px;
    font-size: 11px;
    color: #1e3a8a;
  }
  .guideline-card ul {
    margin: 6px 0 0 18px;
    padding: 0;
  }
  .guideline-card li {
    margin-bottom: 4px;
  }
  .surface-multi-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 24px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .photometric-report-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 24px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .photometric-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .photometric-grid-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    margin-bottom: 14px;
    align-items: start;
  }
  @media (max-width: 820px) {
    .photometric-grid-layout {
      grid-template-columns: 1fr;
    }
  }
  .heatmap-report-container {
    background: #070b14;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .heatmap-report-img {
    width: 100%;
    max-height: 520px;
    object-fit: contain;
    border-radius: 4px;
    background: #020617;
  }
  .heatmap-report-caption {
    font-size: 10px;
    color: #94a3b8;
    margin-top: 6px;
    font-family: monospace;
    text-align: center;
  }
  .photometric-mini-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .photometric-mini-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 10px;
  }
  .photometric-mini-title {
    font-size: 10.5px;
    color: #64748b;
    font-weight: 600;
  }
  .photometric-mini-value {
    font-size: 17px;
    font-weight: 800;
    font-family: monospace;
    margin: 2px 0;
  }
  .photometric-mini-sub {
    font-size: 10px;
    color: #475569;
  }
  .photometric-mini-badge {
    margin-top: 4px;
    font-size: 9.5px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-block;
  }
  .surface-multi-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .surface-multi-card-title {
    margin: 0;
    color: #0284c7;
    font-size: 15px;
    font-weight: 700;
  }
  .surface-multi-card-badge {
    font-family: monospace;
    font-size: 12px;
    color: #0369a1;
    font-weight: bold;
    background: #e0f2fe;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid #bae6fd;
  }
  .surface-multi-card table {
    margin-bottom: 12px;
    background: #ffffff;
  }
  .surface-multi-card th {
    background: #f1f5f9;
    color: #1e293b;
    font-weight: 600;
    width: 22%;
  }
  .surface-multi-card td {
    background: #ffffff;
    color: #1e293b;
  }
  .note-box {
    background: #fffbeb;
    border: 1px solid #fef3c7;
    padding: 10px 12px;
    border-radius: 6px;
    margin-top: 10px;
    font-size: 12px;
    color: #92400e;
  }
  .warning-list { color: #b45309; padding-left: 20px; }
  .assumption-list { color: #475569; padding-left: 20px; font-size: 11px; }
  

  
  @page {
    size: A4 portrait;
    margin: 12mm 12mm 14mm 12mm;
  }

  @media print {
    html, body {
      width: 100%;
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      font-size: 11.5px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-header {
      padding-bottom: 10px;
      margin-bottom: 12px;
      break-inside: avoid;
      page-break-inside: avoid;
      break-after: avoid;
      page-break-after: avoid;
    }
    .meta-table { margin-bottom: 14px; }
    .report-section {
      margin-bottom: 18px;
      break-inside: auto;
      page-break-inside: auto;
      page-break-after: auto;
    }
    .report-section.room3d-section { break-inside: auto; page-break-inside: auto; }
    h2, .sub-heading {
      break-after: avoid;
      page-break-after: avoid;
    }
    thead { display: table-header-group; }
    table { width: 100%; table-layout: auto; }
    th, td {
      padding: 5px 7px;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    tr, .metric-card, .note-box, .guideline-card, .diagram, .surface-multi-card, .photometric-report-card, .three-d-card {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .three-d-img { width: 100%; max-height: 120mm; object-fit: contain; }
    .heatmap-report-img { width: 100%; max-height: 125mm; object-fit: contain; }
    .diagram svg { width: 100%; max-height: 175mm; }
  }
</style>
</head>
<body>

<header class="report-header">
  <div>
    <h1>${esc(m.reportTitle?.trim() || tr.reportTitle)}</h1>
    <div class="company-title">${esc(m.companyName)}</div>
  </div>
  <div style="display:flex; align-items:center; gap:12px;">
    ${m.customerLogoDataUrl ? `<img src="${esc(m.customerLogoDataUrl)}" alt="Müşteri Logosu" class="header-logo"/>` : ''}
    ${m.companyLogoDataUrl ? `<img src="${esc(m.companyLogoDataUrl)}" alt="Firma Logosu" class="header-logo"/>` : ''}
  </div>
</header>

<table class="meta-table">
  <tbody>
    <tr>
      <th>${tr.project}</th>
      <td><b>${esc(m.projectName)}</b></td>
      <th>${tr.customer}</th>
      <td><b>${esc(m.customer)}</b></td>
    </tr>
    <tr>
      <th>${tr.location}</th>
      <td>${esc(m.location)}</td>
      <th>${tr.category}</th>
      <td>${esc(m.category)}</td>
    </tr>
    <tr>
      <th>${tr.date}</th>
      <td>${esc(m.date)}</td>
      <th>${tr.revision}</th>
      <td><b>Rev ${m.revision}</b></td>
    </tr>
  </tbody>
</table>

${blocks.join('\n')}

</body>
</html>`;
}
