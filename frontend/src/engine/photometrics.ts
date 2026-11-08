/**
 * Profesyonel Fotometrik Simülasyon ve Lux Haritalama Motoru
 * - Point-by-point fotometrik aydınlık hesabı: E = I(θ) · cos(α) / r²
 * - IES LM-63 / LDT fotometrik dosya desteği ve ANSI tabanlı optik düşüş modeli
 * - 3B Yüzey Geometrileri: Düz Duvar, Kavisli/Silindir, Zemin, Tavan, Eğimli Yüzey
 * - Çoklu Projektör Süperpozisyonu ve Overlap/Blending Analizi
 * - ANSI 9-Nokta Homojenlik ve ACR (Ortam Işığı Kontrast) Analizi
 * - Fiziksel kesinlik: Lux (Aydınlık) ≠ Luminance (cd/m² / Nit)
 */

export type PhotometricSourceType = 'ies' | 'ansi_cosine' | 'manufacturer_data';

export interface IESData {
  tilt: string;
  numLamps: number;
  lumensPerLamp: number;
  candelaMultiplier: number;
  numVerticalAngles: number;
  numHorizontalAngles: number;
  photometricType: number; // 1 = Type C, 2 = Type B, 3 = Type A
  unitsType: number;       // 1 = feet, 2 = meters
  verticalAngles: number[];
  horizontalAngles: number[];
  candelaTable: number[][]; // [horizIdx][vertIdx]
  headerInfo: Record<string, string>;
}

export interface Projector3DConfig {
  id: string;
  name: string;
  model: string;
  ansiLumens: number;
  efficiency: number;         // 0.1 - 1.0 (lens geçirgenliği, toz, lamba/lazer kalibrasyon katsayısı η)
  pos: [number, number, number]; // [X, Y, Z] metre
  target: [number, number, number]; // [X, Y, Z] odak noktası metre
  yawDeg: number;             // Yatay dönme açısı (derece)
  pitchDeg: number;           // Dikey eğim açısı (derece)
  rollDeg: number;            // Eksen dönme açısı (derece)
  throwRatio: number;         // Lens atım oranı (Throw Ratio)
  zoom: number;               // Lens zoom çarpanı (örn: 1.0)
  lensModel?: string;
  cornerUniformity: number;   // 0.5 - 1.0 (köşe/merkez oranı, datasheet değeri)
  photometricSource: PhotometricSourceType;
  iesData?: IESData;
  enabled: boolean;
  color?: string;
}

export type SurfaceGeometryType = 'flat' | 'curved' | 'floor' | 'ceiling' | 'inclined';

export interface Surface3DConfig {
  widthM: number;
  heightM: number;
  geometry: SurfaceGeometryType;
  radiusM?: number;          // Kavis yarıçapı
  curveAngleDeg?: number;    // Kavis yay açısı
  inclineAngleDeg?: number;  // Eğim açısı (0 = düşey, 45 = eğimli vb.)
  screenGain: number;        // Yüzey kazancı (gain, varsayılan 1.0)
  reflectance: number;       // Yüzey yansıtma katsayısı (0 - 1.0)
  ambientLux: number;        // Ortam aydınlığı (Lux)
}

export interface LuxGridCell {
  xM: number;
  yM: number;
  worldPos: [number, number, number];
  normal: [number, number, number];
  perProjectorLux: number[];
  totalLux: number;
  overlapCount: number;
  luminanceNits: number;
  luminanceFL: number;
}

export interface ANSI9Point {
  index: number;
  col: number; // 0, 1, 2
  row: number; // 0, 1, 2
  xM: number;
  yM: number;
  lux: number;
  luminanceNits: number;
}

export interface PhotometricSimulationResult {
  cols: number;
  rows: number;
  grid: LuxGridCell[];
  minLux: number;
  maxLux: number;
  avgLux: number;
  uniformityU0: number; // Emin / Eavg
  uniformityU1: number; // Emin / Emax
  hotspot: { xM: number; yM: number; lux: number };
  darkspot: { xM: number; yM: number; lux: number };
  ansi9Points: ANSI9Point[];
  ansiAvgLux: number;
  ansiUniformity: number; // Min/Max 9-point
  ansiStdDev: number;
  ambientLux: number;
  ambientContrastRatio: number; // (AvgLux + Amb) / Amb
  avgLuminanceNits: number;
  avgLuminanceFL: number;
  calculationMethod: 'point_by_point_ies' | 'point_by_point_cosine' | 'average_flux';
  isEstimatedModel: boolean;
  overlapAreasFound: boolean;
  assumptions: string[];
}

/**
 * Standart IES LM-63 fotometrik ASCII dosya ayrıştırıcısı.
 */
export function parseIES(content: string): IESData {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const headerInfo: Record<string, string> = {};
  let lineIdx = 0;

  // Başlık etiketlerini oku ([TEST], [MANUFAC], [LUMCAT] vb.)
  while (lineIdx < lines.length && !lines[lineIdx].startsWith('TILT=')) {
    const l = lines[lineIdx];
    if (l.startsWith('[')) {
      const match = l.match(/\[([A-Z0-9_]+)\]\s*(.*)/i);
      if (match) headerInfo[match[1]] = match[2];
    }
    lineIdx++;
  }

  const tiltLine = lines[lineIdx++] || 'TILT=NONE';
  const tilt = tiltLine.replace('TILT=', '').trim();

  // TILT dosyası değilse sayısal parametreleri ardışık topla
  const tokens: number[] = [];
  while (lineIdx < lines.length) {
    const rawTokens = lines[lineIdx].split(/\s+/);
    for (const tok of rawTokens) {
      const n = parseFloat(tok);
      if (!isNaN(n)) tokens.push(n);
    }
    lineIdx++;
  }

  if (tokens.length < 10) {
    throw new Error('Geçersiz veya yetersiz IES fotometrik veri yapısı');
  }

  const numLamps = Math.round(tokens[0]);
  const lumensPerLamp = tokens[1];
  const candelaMultiplier = tokens[2];
  const numVerticalAngles = Math.round(tokens[3]);
  const numHorizontalAngles = Math.round(tokens[4]);
  const photometricType = Math.round(tokens[5]);
  const unitsType = Math.round(tokens[6]);
  // tokens 7, 8, 9: Luminous opening dimensions (w, l, h)

  let tokOffset = 10 + 3; // +3 opening dimensions
  const verticalAngles: number[] = [];
  for (let i = 0; i < numVerticalAngles && tokOffset < tokens.length; i++) {
    verticalAngles.push(tokens[tokOffset++]);
  }

  const horizontalAngles: number[] = [];
  for (let i = 0; i < numHorizontalAngles && tokOffset < tokens.length; i++) {
    horizontalAngles.push(tokens[tokOffset++]);
  }

  const candelaTable: number[][] = [];
  for (let h = 0; h < numHorizontalAngles; h++) {
    const row: number[] = [];
    for (let v = 0; v < numVerticalAngles && tokOffset < tokens.length; v++) {
      row.push(tokens[tokOffset++] * candelaMultiplier);
    }
    candelaTable.push(row);
  }

  return {
    tilt,
    numLamps,
    lumensPerLamp,
    candelaMultiplier,
    numVerticalAngles,
    numHorizontalAngles,
    photometricType,
    unitsType,
    verticalAngles,
    horizontalAngles,
    candelaTable,
    headerInfo,
  };
}

/**
 * IES Tablosundan çift doğrusal interpolasyonla (bilinear interpolation) Candela okur.
 */
export function getCandelaFromIES(ies: IESData, vertAngleDeg: number, horizAngleDeg: number): number {
  const vAngles = ies.verticalAngles;
  const hAngles = ies.horizontalAngles;
  const table = ies.candelaTable;

  if (!table.length || !table[0].length) return 0;

  const clampV = Math.max(vAngles[0], Math.min(vAngles[vAngles.length - 1], vertAngleDeg));
  let normH = horizAngleDeg % 360;
  if (normH < 0) normH += 360;

  // Dikey açı aralığını bul
  let vIdx = 0;
  while (vIdx < vAngles.length - 1 && vAngles[vIdx + 1] < clampV) vIdx++;
  const v0 = vAngles[vIdx];
  const v1 = vAngles[Math.min(vAngles.length - 1, vIdx + 1)];
  const vFrac = v1 > v0 ? (clampV - v0) / (v1 - v0) : 0;

  // Yatay açı aralığını bul
  let hIdx = 0;
  while (hIdx < hAngles.length - 1 && hAngles[hIdx + 1] < normH) hIdx++;
  const h0 = hAngles[hIdx];
  const h1 = hAngles[Math.min(hAngles.length - 1, hIdx + 1)];
  const hFrac = h1 > h0 ? (normH - h0) / (h1 - h0) : 0;

  const c00 = table[hIdx]?.[vIdx] ?? 0;
  const c01 = table[hIdx]?.[Math.min(vAngles.length - 1, vIdx + 1)] ?? 0;
  const c10 = table[Math.min(hAngles.length - 1, hIdx + 1)]?.[vIdx] ?? c00;
  const c11 = table[Math.min(hAngles.length - 1, hIdx + 1)]?.[Math.min(vAngles.length - 1, vIdx + 1)] ?? c01;

  const cv0 = c00 + (c01 - c00) * vFrac;
  const cv1 = c10 + (c11 - c10) * vFrac;
  return Math.max(0, cv0 + (cv1 - cv0) * hFrac);
}

/**
 * ANSI Lümen değerinden lens optik düşüşüne göre tahmini Candela dağılımı (Approximate Cosine Model)
 * - Merkez candela: I_0 ≈ ANSI_Lumen / SolidAngle
 * - Optik eksenden θ açısı uzaklaştıkça cos^4(θ) veya köşe homojenliği u parametresine göre kuadratik düşüş
 */
export function getCandelaFromApproximate(
  ansiLumens: number,
  efficiency: number,
  halfAngleRad: number,
  thetaRad: number,
  cornerUniformity: number
): number {
  // 16:9 / 16:10 formatındaki projeksiyonun köşegen yayılımını kapsayan açı eşiği
  const maxAngle = halfAngleRad * 1.35;
  if (thetaRad > maxAngle) return 0; // Işık konisi dışı

  const effectiveLumens = ansiLumens * Math.max(0.1, efficiency);
  // Katı açı yaklaşımı: Ω = 2π(1 - cos(θ_half))
  const solidAngle = Math.max(0.05, 2 * Math.PI * (1 - Math.cos(halfAngleRad)));
  const centerCandela = effectiveLumens / solidAngle;

  const rRatio = Math.min(1.0, thetaRad / Math.max(0.001, maxAngle));
  const u = Math.max(0.4, Math.min(1.0, cornerUniformity));

  // Kuadratik lens düşüş modeli: f(r) = 1 - (1 - u) · r²
  const falloff = Math.max(0, 1 - (1 - u) * (rRatio * rRatio));
  return centerCandela * falloff;
}

/**
 * Yüzey geometrisi parametrelerine göre yüzeydeki bir (x, y) hücresinin 3B Dünya Konumunu ve Normalini hesaplar.
 */
export function getSurfacePoint3D(
  surface: Surface33DParam,
  xM: number,
  yM: number
): { pos: [number, number, number]; normal: [number, number, number] } {
  const halfW = surface.widthM / 2;
  const halfH = surface.heightM / 2;
  const localX = xM - halfW;
  const localY = yM - halfH;

  switch (surface.geometry) {
    case 'floor':
      // Zemin: X yatay, Y = 0, Z derinlik (ileri-geri)
      return {
        pos: [localX, 0, localY],
        normal: [0, 1, 0], // Yukarı bakar
      };

    case 'ceiling':
      // Tavan: Y = heightM, normal aşağı bakar
      return {
        pos: [localX, surface.heightM, localY],
        normal: [0, -1, 0], // Aşağı bakar
      };

    case 'curved': {
      // Kavisli İçbükey Duvar: Silindir yay
      const R = surface.radiusM || Math.max(2, surface.widthM * 0.8);
      const arcRad = ((surface.curveAngleDeg || 60) * Math.PI) / 180;
      const angle = (localX / halfW) * (arcRad / 2);
      // Merkeze doğru bükülme
      const px = R * Math.sin(angle);
      const pz = -R * (1 - Math.cos(angle));
      const py = yM;
      // Normal içe (merkeze) doğru bakar
      const nx = -Math.sin(angle);
      const nz = Math.cos(angle);
      return {
        pos: [px, py, pz],
        normal: [nx, 0, nz],
      };
    }

    case 'inclined': {
      // Eğimli Yüzey
      const incRad = ((surface.inclineAngleDeg || 15) * Math.PI) / 180;
      const py = yM * Math.cos(incRad);
      const pz = yM * Math.sin(incRad);
      return {
        pos: [localX, py, pz],
        normal: [0, Math.sin(incRad), Math.cos(incRad)],
      };
    }

    case 'flat':
    default:
      // Standart Düz Duvar (Z = 0 düzleminde, normal +Z odanın içine doğru)
      return {
        pos: [localX, yM, 0],
        normal: [0, 0, 1],
      };
  }
}

export type Surface33DParam = Surface3DConfig;

/**
 * 3B Vektör Matematik Yardımcıları
 */
function dot3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length3(v: [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = length3(v);
  if (len < 1e-6) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function sub3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Noktadan Noktaya Profesyonel Fotometrik Lux Simülasyonu (Point-by-Point Photometric Engine)
 */
export function simulatePhotometricLux(
  surface: Surface3DConfig,
  projectors: Projector3DConfig[],
  gridCols: number = 30,
  gridRows: number = 20,
  enableBlending: boolean = true
): PhotometricSimulationResult {
  const cols = Math.max(5, Math.min(150, gridCols));
  const rows = Math.max(5, Math.min(150, gridRows));
  const cellW = surface.widthM / cols;
  const cellH = surface.heightM / rows;

  const grid: LuxGridCell[] = [];
  const activeProjectors = projectors.filter(p => p.enabled);

  let minLux = Infinity;
  let maxLux = -Infinity;
  let sumLux = 0;
  let hotspot = { xM: 0, yM: 0, lux: 0 };
  let darkspot = { xM: 0, yM: 0, lux: Infinity };
  let hasOverlap = false;

  const isEstimated = activeProjectors.some(p => p.photometricSource !== 'ies');

  // Her hücre için hesapla
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const xM = (c + 0.5) * cellW;
      const yM = (r + 0.5) * cellH;

      const { pos: cellPos, normal: cellNorm } = getSurfacePoint3D(surface, xM, yM);
      const perProjLux: number[] = [];
      let cellTotalLux = 0;
      let activeCount = 0;

      for (let pIdx = 0; pIdx < activeProjectors.length; pIdx++) {
        const pj = activeProjectors[pIdx];

        // Projektör konumu ve optik ekseni
        const pPos = pj.pos;
        const pTarget = pj.target;
        const axisVec = normalize3(sub3(pTarget, pPos));

        // Işın vektörü (projektörden yüzey noktasına)
        const rayVecRaw = sub3(cellPos, pPos);
        const dist = length3(rayVecRaw);

        if (dist < 0.1) {
          perProjLux.push(0);
          continue;
        }

        const rayDir = normalize3(rayVecRaw);

        // 1. Işın ile projektör optik ekseni arasındaki açı θ
        const cosTheta = Math.max(-1, Math.min(1, dot3(rayDir, axisVec)));
        const thetaRad = Math.acos(cosTheta);

        // Throw Ratio ve Görüntü Açısı (FOV) Sınırı
        // TR = D / W => tan(halfAngle) = 1 / (2 * TR)
        const halfAngleRad = Math.atan(1 / (2 * Math.max(0.2, pj.throwRatio)));

        // 2. Işın ile yüzey normali arasındaki geliş açısı α (Lambertian Kosinüs Kanunu)
        // Işın yüzeye doğru gidiyor, normal yüzeyden dışarı doğru bakıyor
        const cosAlpha = Math.max(0, -dot3(rayDir, cellNorm));

        let luxContribution = 0;

        // Işın projektörün atım konisinin sınırları içinde mi? (16:9 / 16:10 format köşegen açısı 1.35x)
        if (thetaRad <= halfAngleRad * 1.35 && cosAlpha > 0.001) {
          let candela = 0;

          if (pj.photometricSource === 'ies' && pj.iesData) {
            // Gerçek IES Fotometrik Veri Tablosundan Oku
            const vertDeg = (thetaRad * 180) / Math.PI;
            candela = getCandelaFromIES(pj.iesData, vertDeg, 0);
          } else {
            // ANSI Lümen & Köşe Düşüş Yaklaşık Modeli
            candela = getCandelaFromApproximate(
              pj.ansiLumens,
              pj.efficiency,
              halfAngleRad,
              thetaRad,
              pj.cornerUniformity
            );
          }

          // Temel Fotometrik Denklem: E = I(θ) · cos(α) / r²
          luxContribution = (candela * cosAlpha) / (dist * dist);
        }

        perProjLux.push(+luxContribution.toFixed(2));
        if (luxContribution > 5) activeCount++;
      }

      // Çoklu Projektör Süperpozisyonu: E_tot = E1 + E2 + ...
      cellTotalLux = perProjLux.reduce((a, b) => a + b, 0);

      // Blending / Harmanlama düzeltmesi (eğer açık ve birden fazla projektör aynı hücreye düşüyorsa)
      if (enableBlending && activeCount > 1) {
        hasOverlap = true;
        // İdeal blend ile örtüşme alanında parlaklık normalizasyonu
        cellTotalLux = cellTotalLux / Math.sqrt(activeCount);
      } else if (activeCount > 1) {
        hasOverlap = true;
      }

      // Yüzey Parlaklığı (Luminance, cd/m² ve fL)
      // L = E · Gain / π
      const luminanceNits = +(cellTotalLux * surface.screenGain / Math.PI).toFixed(2);
      const luminanceFL = +(luminanceNits / 3.426259).toFixed(2);

      const cell: LuxGridCell = {
        xM: +xM.toFixed(3),
        yM: +yM.toFixed(3),
        worldPos: cellPos,
        normal: cellNorm,
        perProjectorLux: perProjLux,
        totalLux: +cellTotalLux.toFixed(2),
        overlapCount: activeCount,
        luminanceNits,
        luminanceFL,
      };

      grid.push(cell);

      if (cellTotalLux < minLux) {
        minLux = cellTotalLux;
        darkspot = { xM: cell.xM, yM: cell.yM, lux: +minLux.toFixed(1) };
      }
      if (cellTotalLux > maxLux) {
        maxLux = cellTotalLux;
        hotspot = { xM: cell.xM, yM: cell.yM, lux: +maxLux.toFixed(1) };
      }
      sumLux += cellTotalLux;
    }
  }

  const avgLux = grid.length > 0 ? sumLux / grid.length : 0;
  if (!isFinite(minLux)) minLux = 0;
  if (!isFinite(maxLux)) maxLux = 0;

  // Homojenlik Oranları
  const uniformityU0 = avgLux > 0 ? +(minLux / avgLux).toFixed(3) : 0;
  const uniformityU1 = maxLux > 0 ? +(minLux / maxLux).toFixed(3) : 0;

  // ANSI 9-Point Standart Ölçümü
  const ansi9Points = calculateAnsi9Points(grid, cols, rows, surface.screenGain);
  const ansiSum = ansi9Points.reduce((acc, p) => acc + p.lux, 0);
  const ansiAvgLux = ansi9Points.length > 0 ? +(ansiSum / ansi9Points.length).toFixed(1) : 0;
  const ansiMin = Math.min(...ansi9Points.map(p => p.lux));
  const ansiMax = Math.max(...ansi9Points.map(p => p.lux));
  const ansiUniformity = ansiMax > 0 ? +(ansiMin / ansiMax).toFixed(3) : 0;

  // Standart Sapma
  const variance =
    ansi9Points.reduce((acc, p) => acc + Math.pow(p.lux - ansiAvgLux, 2), 0) /
    Math.max(1, ansi9Points.length);
  const ansiStdDev = +Math.sqrt(variance).toFixed(1);

  // Ortam Işığı ve Kontrast
  const amb = surface.ambientLux || 0;
  const acr = amb > 0 ? +((avgLux + amb) / amb).toFixed(1) : 999;
  const avgNits = +(avgLux * surface.screenGain / Math.PI).toFixed(1);
  const avgFL = +(avgNits / 3.426259).toFixed(1);

  return {
    cols,
    rows,
    grid,
    minLux: +minLux.toFixed(1),
    maxLux: +maxLux.toFixed(1),
    avgLux: +avgLux.toFixed(1),
    uniformityU0,
    uniformityU1,
    hotspot,
    darkspot,
    ansi9Points,
    ansiAvgLux,
    ansiUniformity,
    ansiStdDev,
    ambientLux: amb,
    ambientContrastRatio: acr,
    avgLuminanceNits: avgNits,
    avgLuminanceFL: avgFL,
    calculationMethod: isEstimated ? 'point_by_point_cosine' : 'point_by_point_ies',
    isEstimatedModel: isEstimated,
    overlapAreasFound: hasOverlap,
    assumptions: [
      'Temel Denklem: E = I(θ) · cos(α) / r² (SI standardı)',
      'Ekran Yüzeyi Lambertian kabul edilir: L = E · Gain / π [cd/m²]',
      isEstimated
        ? 'Optik Veri: ANSI Lümen tabanlı açısal kosinüs/kuadratik düşüş modeli (Tahmini Model)'
        : 'Optik Veri: IES LM-63 fotometrik kandela matrisi interpolasyonu',
      enableBlending
        ? 'Kenar Harmanlama: Overlap çakışma alanlarında soft-edge normalizasyonu aktif'
        : 'Overlap alanlarında doğrudan aydınlık süperpozisyonu (E_tot = E1 + E2)',
      'Yüzey eğimi ve kavis normalleri noktasal cos(α) ile hesaba katılmıştır',
    ],
  };
}

/**
 * ANSI/NAPM IT7.228 Standardına Uygun 3x3 (9-Nokta) Ölçüm Noktalarını Çıkarır
 */
function calculateAnsi9Points(
  grid: LuxGridCell[],
  cols: number,
  rows: number,
  gain: number
): ANSI9Point[] {
  const points: ANSI9Point[] = [];
  // 3x3 bölgenin merkezleri: %16.7, %50.0, %83.3
  const targetColPcts = [1 / 6, 3 / 6, 5 / 6];
  const targetRowPcts = [1 / 6, 3 / 6, 5 / 6];

  let idx = 1;
  for (let rIdx = 0; rIdx < 3; rIdx++) {
    for (let cIdx = 0; cIdx < 3; cIdx++) {
      const c = Math.min(cols - 1, Math.max(0, Math.floor(targetColPcts[cIdx] * cols)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor(targetRowPcts[rIdx] * rows)));
      const cell = grid[r * cols + c];

      if (cell) {
        const lux = cell.totalLux;
        const nits = +(lux * gain / Math.PI).toFixed(1);
        points.push({
          index: idx++,
          col: cIdx,
          row: rIdx,
          xM: cell.xM,
          yM: cell.yM,
          lux,
          luminanceNits: nits,
        });
      }
    }
  }

  return points;
}

/**
 * Fotometrik Termal Isı Haritası Renk Paleti (Turbo/Jet türevi kesintisiz spektrum)
 */
export function getLuxColorRGB(lux: number, minLux: number, maxLux: number): [number, number, number] {
  const range = maxLux - minLux || 1;
  const t = Math.max(0, Math.min(1, (lux - minLux) / range));

  // 6 duraklı fotometrik renk skalası:
  // Koyu Mavi -> Cyan -> Yeşil -> Sarı -> Turuncu -> Canlı Kırmızı
  const stops: [number, number, number][] = [
    [15, 23, 110],   // 0.0: Koyu lacivert/mavi (Çok Düşük Lux)
    [14, 165, 233],  // 0.2: Parlak cyan (Düşük Lux)
    [34, 197, 94],   // 0.4: Canlı yeşil (Orta Lux)
    [234, 179, 8],   // 0.6: Altın sarısı (Yüksek Lux)
    [249, 115, 22],  // 0.8: Canlı turuncu (Çok Yüksek Lux)
    [225, 29, 72],   // 1.0: Yoğun kırmızı/hotspot (En Yüksek Lux)
  ];

  const scaled = t * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - idx;

  const c0 = stops[idx];
  const c1 = stops[idx + 1];

  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * f),
    Math.round(c0[1] + (c1[1] - c0[1]) * f),
    Math.round(c0[2] + (c1[2] - c0[2]) * f),
  ];
}
