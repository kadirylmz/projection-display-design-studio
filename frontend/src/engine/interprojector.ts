/**
 * Projeksiyonlar Arası Mesafe, 3B Montaj Eksenleri ve Mekanik Yerleşim Motoru.
 * Müşteri Raporu ve Şantiye Uygulama Planı için tek tek her projektörün:
 * - Sol ve sağ referans kenarlara olan mesafesi
 * - Komşu projektörle arasındaki eksen-eksen mesafesi (ΔX, ΔY)
 * - Örtüşme (blend/overlap) genişliği (metre ve piksel)
 * - Tavandan askı borusu ve yerden montaj kotu (H)
 * - 3B oda içi dünya koordinatları (X, Y, Z)
 * - Köşe geçişlerindeki 3B mesafeler ve elektrik linyeleri
 * hesaplanır.
 */
import { round } from './units';

export interface ProjectorSpatialData {
  id: string;                  // Cihaz Etiketi: 'SOL-PJ-1', 'SOL-PJ-2', 'ON-PJ-1', 'ZMN-PJ-1' vb.
  surfaceId: string;
  surfaceName: string;
  surfaceType: 'wall' | 'floor';
  colIndex: number;            // 1-based sütun sırası
  rowIndex: number;            // 1-based satır sırası
  model: string;               // Projektör modeli / açıklaması
  powerW: number;              // Birim güç tüketimi (W)
  
  // Optik ve Atım Boyutları
  throwDistM: number;          // Duvardan dik lens mesafesi (m)
  singleWidthM: number;        // Tek projektörün bu uzaklıktaki net açınım eni (m)
  singleHeightM: number;       // Tek projektörün bu uzaklıktaki net açınım boyu (m)
  distMmPerPx: number;         // 1 pikselin fiziksel boyutu (mm/px)
  ppi: number;                 // İnç başına piksel yoğunluğu
  
  // Yüzey ve Mekanik Montaj Ölçüleri (Şantiye Uygulaması)
  leftEdgeDistM: number;       // Duvarın sol referans kenarından lens merkezine mesafe (m)
  rightEdgeDistM: number;      // Duvarın sağ referans kenarına olan mesafe (m)
  mountHeightM: number;        // Yerden lens optik merkezine montaj kotu (m)
  ceilingDistM: number;        // Tavandan askı borusu mesafesi (m)
  
  // Komşu Projektörler Arası Eksen Aralıkları
  spacingToNextM: number | null;// Bir sonraki komşu projektöre eksen mesafesi (ΔX)
  spacingToPrevM: number | null;// Bir önceki komşu projektöre eksen mesafesi (ΔX)
  overlapWidthM: number;       // Blend bölgesi genişliği (m)
  overlapPct: number;          // Blend örtüşme oranı (%)
  overlapPx: number;           // Blend piksel genişliği (px)
  
  // 3B Oda Koordinatları (Simülasyon ve CAD)
  worldPos: [number, number, number];    // [X, Y, Z] Lens montaj koordinatları (m)
  targetCenter: [number, number, number];// [X, Y, Z] Duvardaki hedef merkezi (m)
  
  // Elektrik Dağıtımı Eşleşmesi
  circuitId: string;           // 'C-PJ-1'
  circuitPhase: string;        // 'L1', 'L2', 'L3' veya '1 Faz'
  breakerA: number;            // 16, 20, 32 A
  cableSpec: string;           // '3x2.5mm²'
}

export interface CornerTransition {
  fromProjId: string;
  toProjId: string;
  fromSurface: string;
  toSurface: string;
  cornerName: string;          // 'Sol Duvar ↔ Ön Duvar Köşesi'
  euclideanDistM: number;      // İki lens arasındaki 3B kuş uçuşu mesafe (m)
  angleDeg: number;            // Işık eksenleri arasındaki köşe açısı (90°, 120° vb.)
  notes: string;
}

export interface SurfaceProjectorStat {
  surfaceId: string;
  surfaceName: string;
  surfaceType: 'wall' | 'floor';
  surfaceWidthM: number;
  surfaceHeightM: number;
  projectorCount: number;
  cols: number;
  rows: number;
  singleWidthM: number;
  singleHeightM: number;
  spacingM: number;            // Eksen aralığı (ΔX)
  overlapWidthM: number;       // Örtüşme eni
  overlapPct: number;
  throwDistM: number;
  mountHeightM: number;
  totalPowerW: number;
}

export interface InterProjectorAnalysis {
  projectors: ProjectorSpatialData[];
  surfaceStats: SurfaceProjectorStat[];
  cornerTransitions: CornerTransition[];
  totalProjectors: number;
  totalPowerW: number;
  roomDimensions: {
    widthM: number;
    lengthM: number;
    heightM: number;
  };
}

export interface InputSurfaceGeometry {
  id: string;
  name: string;
  type?: string;
  widthM: number;
  heightM: number;
  cols: number;
  rows: number;
  throwDistM: number;
  throwRatio?: number;
  overlapX?: number;
  overlapY?: number;
  projW?: number;
  projH?: number;
  ovPxX?: number;
  ovPxY?: number;
  singleProjWidthM?: number;
  singleProjHeightM?: number;
  distMmPerPx?: number;
  distPpi?: number;
  projMountHeightM?: number;
  projShiftXM?: number;
  projShiftYM?: number;
  customW?: number;
  customH?: number;
}

export interface InputRoomConfig {
  widthM: number;
  lengthM: number;
  heightM: number;
}

/**
 * Girişteki yüzeyler ve oda geometrisine göre tek tek her projektörün
 * birbirine ve mekan sınırlarına olan mesafelerini milimetrik hassasiyetle hesaplar.
 */
export function calculateInterProjectorDistances(
  surfaces: InputSurfaceGeometry[],
  roomConfig?: InputRoomConfig,
  singleWatt = 1350,
  singleModel = 'Lazer Projeksiyon Cihazı (WUXGA / 4K)',
  breakerA = 16
): InterProjectorAnalysis {
  const roomW = roomConfig?.widthM ?? 8.5;
  const roomL = roomConfig?.lengthM ?? 25.0;
  const roomH = roomConfig?.heightM ?? 5.5;

  const hw = roomW / 2;
  const hl = roomL / 2;

  const projectors: ProjectorSpatialData[] = [];
  const surfaceStats: SurfaceProjectorStat[] = [];
  const cornerTransitions: CornerTransition[] = [];

  let globalPjIndex = 0;
  let wallCount = 0;

  // Linyeler için faz dağıtımı
  const phaseList = ['L1', 'L2', 'L3'];
  const cableSpec = breakerA >= 32 ? '3x6.0mm²' : breakerA >= 20 ? '3x4.0mm²' : '3x2.5mm²';

  // 1. YÜZEY BAZINDA PROJEKSİYON HESAPLAMALARI
  surfaces.forEach((surf) => {
    const isFloor = surf.type === 'floor' || surf.id.includes('floor') || surf.name.toLowerCase().includes('zemin');
    const cols = Math.max(1, surf.cols || 1);
    const rows = Math.max(1, surf.rows || 1);
    const pW = surf.projW || 1920;
    const pH = surf.projH || 1200;

    // Tek projektör optik açınım boyutları
    const tr = surf.throwRatio && surf.throwRatio > 0 ? surf.throwRatio : 0.80;
    const singleW = surf.singleProjWidthM && surf.singleProjWidthM > 0
      ? surf.singleProjWidthM
      : round(surf.throwDistM / tr, 3);
    const singleH = surf.singleProjHeightM && surf.singleProjHeightM > 0
      ? surf.singleProjHeightM
      : round(singleW * (pH / pW), 3);

    const ovPct = surf.overlapX !== undefined ? surf.overlapX : 15;
    const ovRatioX = ovPct / 100;
    const stepW = round(singleW * (1 - ovRatioX), 3);
    const overlapWidthM = round(singleW * ovRatioX, 3);
    const overlapPx = Math.round(pW * ovRatioX);

    const totalOptW = cols === 1 ? singleW : round(singleW + (cols - 1) * stepW, 3);
    const mountH = surf.projMountHeightM && surf.projMountHeightM > 0
      ? surf.projMountHeightM
      : isFloor
      ? round(roomH, 2)
      : round(Math.max(2.0, surf.heightM - 0.20), 2);

    const ceilingDistM = round(Math.max(0.1, roomH - mountH), 2);
    const mmPerPx = surf.distMmPerPx || round((singleW * 1000) / pW, 2);
    const ppi = surf.distPpi || round(25.4 / Math.max(0.01, mmPerPx), 1);

    surfaceStats.push({
      surfaceId: surf.id,
      surfaceName: surf.name,
      surfaceType: isFloor ? 'floor' : 'wall',
      surfaceWidthM: surf.widthM,
      surfaceHeightM: surf.heightM,
      projectorCount: cols * rows,
      cols,
      rows,
      singleWidthM: singleW,
      singleHeightM: singleH,
      spacingM: cols > 1 ? stepW : 0,
      overlapWidthM,
      overlapPct: ovPct,
      throwDistM: surf.throwDistM,
      mountHeightM: mountH,
      totalPowerW: cols * rows * singleWatt,
    });

    const shiftX = surf.projShiftXM || 0;
    const shiftY = surf.projShiftYM || 0;

    // Duvarın solundan optik alanın başlama noktası
    const wallStartOffset = round(Math.max(0, (surf.widthM - totalOptW) / 2) + shiftX, 3);

    const surfacePjs: ProjectorSpatialData[] = [];

    if (!isFloor) {
      // DUVAR TİPİ YERLEŞİM (Sol Uzun, Ön Kısa, Sağ Uzun vb.)
      const wIdx = wallCount;
      wallCount++;

      // Duvarın 3B Oda İçindeki Yönü ve Konumu
      // wIdx: 0 -> Sol Duvar (X = -hw), 1 -> Ön Duvar (Z = -hl), 2 -> Sağ Duvar (X = +hw)
      let center: [number, number, number] = [0, surf.heightM / 2, 0];
      let normal: [number, number, number] = [0, 0, 1];
      let rightDir: [number, number, number] = [1, 0, 0];
      let upDir: [number, number, number] = [0, 1, 0];

      if (wIdx === 0) {
        // Sol Uzun Duvar: X = -hw, bakış +X, sağ yönü +Z
        center = [-hw, surf.heightM / 2, 0];
        normal = [1, 0, 0];
        rightDir = [0, 0, 1];
      } else if (wIdx === 1) {
        // Ön Kısa Duvar: Z = -hl, bakış +Z, sağ yönü +X
        center = [0, surf.heightM / 2, -hl];
        normal = [0, 0, 1];
        rightDir = [1, 0, 0];
      } else if (wIdx === 2) {
        // Sağ Uzun Duvar: X = +hw, bakış -X, sağ yönü -Z
        center = [hw, surf.heightM / 2, 0];
        normal = [-1, 0, 0];
        rightDir = [0, 0, -1];
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          globalPjIndex++;
          const colNum = c + 1;
          const rowNum = r + 1;

          // Sol referans kenardan lens eksenine olan net mesafe
          const leftEdgeDistM = round(wallStartOffset + (singleW / 2) + c * stepW, 3);
          const rightEdgeDistM = round(Math.max(0, surf.widthM - leftEdgeDistM), 3);

          const spacingToNextM = c < cols - 1 ? stepW : null;
          const spacingToPrevM = c > 0 ? stepW : null;

          // 3B Dünya Koordinatları
          const offsetRight = (cols === 1 ? 0 : -totalOptW / 2 + singleW / 2 + c * stepW) + shiftX;
          const offsetUp = (rows === 1 ? 0 : ((rows - 1) / 2 - r) * (singleH * 0.85)) + shiftY;

          const tx = round(center[0] + rightDir[0] * offsetRight + upDir[0] * offsetUp, 3);
          const ty = round(center[1] + rightDir[1] * offsetRight + upDir[1] * offsetUp, 3);
          const tz = round(center[2] + rightDir[2] * offsetRight + upDir[2] * offsetUp, 3);

          const px = round(tx + normal[0] * surf.throwDistM, 3);
          const py = round(mountH + (rows > 1 ? offsetUp * 0.3 : 0), 3);
          const pz = round(tz + normal[2] * surf.throwDistM, 3);

          const circuitNum = Math.ceil(globalPjIndex / Math.max(1, Math.floor((breakerA * 230 * 0.95 * 0.80) / singleWatt)));
          const phase = phaseList[(circuitNum - 1) % 3];

          const pjId = `${wIdx === 0 ? 'SOL' : wIdx === 1 ? 'ON' : wIdx === 2 ? 'SAG' : 'DW'}-PJ-${colNum}${rows > 1 ? `.${rowNum}` : ''}`;

          const item: ProjectorSpatialData = {
            id: pjId,
            surfaceId: surf.id,
            surfaceName: surf.name,
            surfaceType: 'wall',
            colIndex: colNum,
            rowIndex: rowNum,
            model: singleModel,
            powerW: singleWatt,
            throwDistM: surf.throwDistM,
            singleWidthM: singleW,
            singleHeightM: singleH,
            distMmPerPx: mmPerPx,
            ppi,
            leftEdgeDistM,
            rightEdgeDistM,
            mountHeightM: py,
            ceilingDistM: round(Math.max(0.1, roomH - py), 2),
            spacingToNextM,
            spacingToPrevM,
            overlapWidthM,
            overlapPct: ovPct,
            overlapPx,
            worldPos: [px, py, pz],
            targetCenter: [tx, ty, tz],
            circuitId: `C-PJ-${circuitNum}`,
            circuitPhase: phase,
            breakerA,
            cableSpec,
          };

          projectors.push(item);
          surfacePjs.push(item);
        }
      }
    } else {
      // ZEMİN (FLOOR) TİPİ YERLEŞİM (Tavandan Aşağı Yönlü Projeksiyonlar)
      const stepZ = cols > 1 ? round((surf.widthM - singleW) / (cols - 1), 3) : 0;
      const stepX = rows > 1 ? round((surf.heightM - singleH) / (rows - 1), 3) : 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          globalPjIndex++;
          const colNum = c + 1;
          const rowNum = r + 1;

          const tz = round((cols === 1 ? 0 : -surf.widthM / 2 + singleW / 2 + c * stepZ) + shiftX, 3);
          const tx = round((rows === 1 ? 0 : -surf.heightM / 2 + singleH / 2 + r * stepX) + shiftY, 3);
          const py = round(surf.throwDistM, 3);

          const leftEdgeDistM = round((surf.widthM / 2) + tz, 3);
          const rightEdgeDistM = round(Math.max(0, surf.widthM - leftEdgeDistM), 3);

          const spacingToNextM = c < cols - 1 ? (stepZ > 0 ? stepZ : stepW) : null;
          const spacingToPrevM = c > 0 ? (stepZ > 0 ? stepZ : stepW) : null;

          const circuitNum = Math.ceil(globalPjIndex / Math.max(1, Math.floor((breakerA * 230 * 0.95 * 0.80) / singleWatt)));
          const phase = phaseList[(circuitNum - 1) % 3];

          const item: ProjectorSpatialData = {
            id: `ZMN-PJ-${colNum}.${rowNum}`,
            surfaceId: surf.id,
            surfaceName: surf.name,
            surfaceType: 'floor',
            colIndex: colNum,
            rowIndex: rowNum,
            model: singleModel,
            powerW: singleWatt,
            throwDistM: surf.throwDistM,
            singleWidthM: singleW,
            singleHeightM: singleH,
            distMmPerPx: mmPerPx,
            ppi,
            leftEdgeDistM,
            rightEdgeDistM,
            mountHeightM: py,
            ceilingDistM: round(Math.max(0.1, roomH - py), 2),
            spacingToNextM,
            spacingToPrevM,
            overlapWidthM,
            overlapPct: ovPct,
            overlapPx,
            worldPos: [tx, py, tz],
            targetCenter: [tx, 0.02, tz],
            circuitId: `C-PJ-${circuitNum}`,
            circuitPhase: phase,
            breakerA,
            cableSpec,
          };

          projectors.push(item);
          surfacePjs.push(item);
        }
      }
    }
  });

  // 2. KÖŞE GEÇİŞLERİ (SOL DUVAR ↔ ÖN DUVAR & ÖN DUVAR ↔ SAĞ DUVAR)
  const solPjs = projectors.filter(p => p.id.startsWith('SOL-PJ'));
  const onPjs = projectors.filter(p => p.id.startsWith('ON-PJ'));
  const sagPjs = projectors.filter(p => p.id.startsWith('SAG-PJ'));

  if (solPjs.length > 0 && onPjs.length > 0) {
    const lastSol = solPjs[solPjs.length - 1];
    const firstOn = onPjs[0];
    const dx = lastSol.worldPos[0] - firstOn.worldPos[0];
    const dy = lastSol.worldPos[1] - firstOn.worldPos[1];
    const dz = lastSol.worldPos[2] - firstOn.worldPos[2];
    const dist3D = round(Math.sqrt(dx * dx + dy * dy + dz * dz), 3);

    cornerTransitions.push({
      fromProjId: lastSol.id,
      toProjId: firstOn.id,
      fromSurface: lastSol.surfaceName,
      toSurface: firstOn.surfaceName,
      cornerName: 'Sol Duvar ↔ Ön Duvar Köşesi (90° İç Köşe)',
      euclideanDistM: dist3D,
      angleDeg: 90,
      notes: `Köşedeki komşu iki lens arası 3B mesafe ${dist3D}m'dir. Işık demetleri köşede 90° açıyla sıfır boşlukla birleşir.`,
    });
  }

  if (onPjs.length > 0 && sagPjs.length > 0) {
    const lastOn = onPjs[onPjs.length - 1];
    const firstSag = sagPjs[0];
    const dx = lastOn.worldPos[0] - firstSag.worldPos[0];
    const dy = lastOn.worldPos[1] - firstSag.worldPos[1];
    const dz = lastOn.worldPos[2] - firstSag.worldPos[2];
    const dist3D = round(Math.sqrt(dx * dx + dy * dy + dz * dz), 3);

    cornerTransitions.push({
      fromProjId: lastOn.id,
      toProjId: firstSag.id,
      fromSurface: lastOn.surfaceName,
      toSurface: firstSag.surfaceName,
      cornerName: 'Ön Duvar ↔ Sağ Duvar Köşesi (90° İç Köşe)',
      euclideanDistM: dist3D,
      angleDeg: 90,
      notes: `Köşedeki komşu iki lens arası 3B mesafe ${dist3D}m'dir. Işık demetleri köşede 90° açıyla sıfır boşlukla birleşir.`,
    });
  }

  const totalProjectors = projectors.length;
  const totalPowerW = totalProjectors * singleWatt;

  return {
    projectors,
    surfaceStats,
    cornerTransitions,
    totalProjectors,
    totalPowerW,
    roomDimensions: {
      widthM: roomW,
      lengthM: roomL,
      heightM: roomH,
    },
  };
}
