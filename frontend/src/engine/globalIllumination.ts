/**
 * ADVANCED ROOM PHOTOMETRIC SIMULATION – GLOBAL ILLUMINATION & LIGHT BOUNCE ENGINE
 *
 * Fiziksel temelli oda aydınlatma ve çoklu ışık sekmesi (Global Illumination - Radiosity Form Factor) motoru.
 * Desteklenen ışık yolları:
 * - Projektör -> Duvar / Zemin / Tavan (Doğrudan Işık - Direct Illumination)
 * - Duvar -> Duvar / Zemin / Tavan (Dolaylı Işık - Indirect Bounce)
 * - Zemin -> Duvar / Tavan (Dolaylı Işık - Floor Bounce)
 * - Tavan -> Duvar / Zemin (Dolaylı Işık - Ceiling Bounce)
 *
 * Enerji Korunumu:
 * Toplam yansıyan radyosite enerjisi gelen enerjiden fazla olamaz (ρ < 1.0, Σ F_ij <= 1.0).
 */

export type V3 = [number, number, number];

export interface SurfaceMaterial {
  name: string;
  diffuseReflectance: number; // 0.0 .. 1.0 (örn: mat beyaz: 0.80, açık gri: 0.50, koyu gri: 0.20, siyah: 0.05)
  specularReflectance: number; // 0.0 .. 1.0
  roughness: number; // 0.0 .. 1.0
  color: string; // Görsel renk (hex)
}

export const DEFAULT_MATERIALS: Record<string, SurfaceMaterial> = {
  matte_white: {
    name: 'Mat Beyaz Boya (Alçı / Projeksiyon Boyası)',
    diffuseReflectance: 0.80,
    specularReflectance: 0.05,
    roughness: 0.90,
    color: '#f8fafc',
  },
  light_grey: {
    name: 'Açık Gri (Standart Mimari Yüzey)',
    diffuseReflectance: 0.50,
    specularReflectance: 0.04,
    roughness: 0.85,
    color: '#cbd5e1',
  },
  dark_grey: {
    name: 'Koyu Gri (Müze & Sergi Salonu Standardı)',
    diffuseReflectance: 0.20,
    specularReflectance: 0.03,
    roughness: 0.80,
    color: '#475569',
  },
  black_velvet: {
    name: 'Mat Siyah / Akustik Kumaş (Blackout)',
    diffuseReflectance: 0.05,
    specularReflectance: 0.01,
    roughness: 0.95,
    color: '#0f172a',
  },
  wood_parquet: {
    name: 'Ahşap Parke (Zemin Kaplama)',
    diffuseReflectance: 0.35,
    specularReflectance: 0.08,
    roughness: 0.60,
    color: '#b45309',
  },
  concrete: {
    name: 'Brüt Beton (Endüstriyel Duvar)',
    diffuseReflectance: 0.30,
    specularReflectance: 0.02,
    roughness: 0.90,
    color: '#64748b',
  },
};

export type RoomSurfaceType =
  | 'front_wall'
  | 'back_wall'
  | 'left_wall'
  | 'right_wall'
  | 'floor'
  | 'ceiling'
  | 'curved_wall'
  | 'custom_surface'
  | 'column_obstacle';

export interface RoomSurfaceDef {
  id: string;
  name: string;
  type: RoomSurfaceType;
  widthM: number;
  heightM: number;
  centerPos: V3; // [x, y, z]
  normal: V3; // Yüzeyden dışa (içeri odaya bakan birim normal)
  tangentU: V3; // Yüzey yatay ekseni
  tangentV: V3; // Yüzey dikey ekseni
  material: SurfaceMaterial;
  gridCols?: number;
  gridRows?: number;
}

export interface RadiosityPatch {
  id: string;
  surfaceId: string;
  col: number;
  row: number;
  pos: V3;
  normal: V3;
  areaM2: number;
  reflectance: number;
  directLux: number; // Projektörden doğrudan gelen aydınlık (Lux)
  indirectLux: number; // Sekmelerden gelen dolaylı aydınlık (Lux)
  totalLux: number; // directLux + indirectLux
  bounceDetails: number[]; // [bounce1Lux, bounce2Lux, ...]
}

export interface ProjectorGISource {
  id: string;
  name: string;
  pos: V3;
  target: V3;
  ansiLumens: number;
  throwRatio: number;
  efficiency: number;
  enabled: boolean;
  color: string;
}

export interface RoomGISimulationResult {
  surfaces: {
    id: string;
    name: string;
    type: RoomSurfaceType;
    widthM: number;
    heightM: number;
    material: SurfaceMaterial;
    avgDirectLux: number;
    avgIndirectLux: number;
    avgTotalLux: number;
    minTotalLux: number;
    maxTotalLux: number;
    uniformityU0: number; // Min / Avg
    uniformityU1: number; // Min / Max
    patches: RadiosityPatch[];
    cols: number;
    rows: number;
  }[];
  totalDirectLumens: number;
  totalIndirectLumens: number;
  globalBounceCount: number;
  roomEnergyConservationRatio: number; // Yansıyan / Gelen (fiziksel olarak < 1.0 olmalı)
  calculationTimeMs: number;
}

// Vektör Matematik Yardımcıları
function sub3(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul3(v: V3, s: number): V3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function dot3(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length3(v: V3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize3(v: V3): V3 {
  const l = length3(v);
  if (l < 1e-6) return [0, 1, 0];
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * İki diferansiyel yama (patch i ve patch j) arasındaki Radiosity Form Faktörünü hesaplar.
 * F_ij = (cos θ_i * cos θ_j / (π * r²)) * dA_j * V_ij
 *
 * Fiziksel Kısıtlamalar:
 * - Birbirine bakmayan veya arkasında kalan yamalar için F_ij = 0
 * - Kendine çarpan ışık F_ii = 0
 * - Enerji korunumu: Toplam form faktörü normalizasyonu
 */
export function computeFormFactor(
  patchI: { pos: V3; normal: V3 },
  patchJ: { pos: V3; normal: V3; areaM2: number }
): number {
  const rVec = sub3(patchJ.pos, patchI.pos);
  const dist = length3(rVec);

  if (dist < 0.05) return 0; // Çok yakın ya da aynı yama (F_ii = 0)

  const dir = normalize3(rVec);

  // θ_i: Işık gönderen yamanın normali ile ışın arasındaki açı
  const cosThetaI = dot3(patchI.normal, dir);
  if (cosThetaI <= 0.001) return 0; // Patch I'nın arkasına gidiyor

  // θ_j: Işık alan yamanın normali ile ışın arasındaki açı (yön ters: -dir)
  const cosThetaJ = dot3(patchJ.normal, [-dir[0], -dir[1], -dir[2]]);
  if (cosThetaJ <= 0.001) return 0; // Patch J'nin arkasından geliyor

  // Diferansiyel form faktörü denklemi
  const distSq = dist * dist;
  const ff = (cosThetaI * cosThetaJ * patchJ.areaM2) / (Math.PI * distSq);

  // Fiziksel sınır (Form faktör 1'i aşamaz)
  return Math.min(0.95, Math.max(0, ff));
}

/**
 * Komple Oda Global Illumination (Doğrudan + Çoklu Sekme Dolaylı Aydınlık) Simülasyonu
 */
export function simulateRoomGlobalIllumination(
  roomSurfaces: RoomSurfaceDef[],
  projectors: ProjectorGISource[],
  bounceCount: number = 2,
  patchResolution: 'coarse' | 'medium' | 'fine' = 'medium'
): RoomGISimulationResult {
  const tStart = performance.now();
  const bounces = Math.max(1, Math.min(4, bounceCount));

  // 1. Yüzeyleri Izgara Yamalarına (Radiosity Patches) Böl
  const allPatches: RadiosityPatch[] = [];
  const surfacePatchMap = new Map<string, RadiosityPatch[]>();

  roomSurfaces.forEach(surf => {
    // Çözünürlüğe göre hücre sayısı
    let cols = 12;
    let rows = 8;
    if (patchResolution === 'coarse') {
      cols = 8;
      rows = 5;
    } else if (patchResolution === 'fine') {
      cols = 20;
      rows = 12;
    }

    if (surf.gridCols) cols = surf.gridCols;
    if (surf.gridRows) rows = surf.gridRows;

    const cellW = surf.widthM / cols;
    const cellH = surf.heightM / rows;
    const cellArea = cellW * cellH;
    const sPatches: RadiosityPatch[] = [];

    const halfW = surf.widthM / 2;
    const halfH = surf.heightM / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = (c + 0.5) * cellW - halfW;
        const v = (r + 0.5) * cellH - halfH;

        // Dünya koordinatı = centerPos + u * tangentU + v * tangentV
        const pPos: V3 = [
          surf.centerPos[0] + u * surf.tangentU[0] + v * surf.tangentV[0],
          surf.centerPos[1] + u * surf.tangentU[1] + v * surf.tangentV[1],
          surf.centerPos[2] + u * surf.tangentU[2] + v * surf.tangentV[2],
        ];

        const patch: RadiosityPatch = {
          id: `patch-${surf.id}-${c}-${r}`,
          surfaceId: surf.id,
          col: c,
          row: r,
          pos: pPos,
          normal: surf.normal,
          areaM2: cellArea,
          reflectance: Math.max(0.01, Math.min(0.95, surf.material.diffuseReflectance)),
          directLux: 0,
          indirectLux: 0,
          totalLux: 0,
          bounceDetails: [],
        };

        sPatches.push(patch);
        allPatches.push(patch);
      }
    }

    surfacePatchMap.set(surf.id, sPatches);
  });

  // 2. PASS 0: DOĞRUDAN AYDINLIK (DIRECT ILLUMINATION)
  // Her projektörden her yamaya doğrudan düşen lüks
  const activeProjs = projectors.filter(p => p.enabled && p.ansiLumens > 0);

  allPatches.forEach(patch => {
    let patchDirect = 0;

    activeProjs.forEach(pj => {
      const rayVec = sub3(patch.pos, pj.pos);
      const dist = length3(rayVec);
      if (dist < 0.1) return;

      const rayDir = normalize3(rayVec);

      // Projektör optik ekseni
      const axisVec = normalize3(sub3(pj.target, pj.pos));
      const cosTheta = dot3(rayDir, axisVec);
      if (cosTheta <= 0) return; // Projektörün arkasında

      const thetaRad = Math.acos(Math.max(-1, Math.min(1, cosTheta)));
      const halfAngleRad = Math.atan(1 / (2 * Math.max(0.2, pj.throwRatio)));
      const maxFovAngle = halfAngleRad * 1.35;

      if (thetaRad > maxFovAngle) return; // Atım konisi dışında

      // Yüzey geliş açısı α (Lambertian Cosine)
      const cosAlpha = dot3(patch.normal, [-rayDir[0], -rayDir[1], -rayDir[2]]);
      if (cosAlpha <= 0.001) return; // Yüzey arkasında

      // Candela yaklaşımı
      const solidAngle = Math.max(0.05, 2 * Math.PI * (1 - Math.cos(halfAngleRad)));
      const effLumens = pj.ansiLumens * (pj.efficiency || 0.90);
      const centerCandela = effLumens / solidAngle;

      const rRatio = thetaRad / Math.max(0.001, maxFovAngle);
      const falloff = Math.max(0, 1 - 0.25 * (rRatio * rRatio));
      const candela = centerCandela * falloff;

      const lux = (candela * cosAlpha) / (dist * dist);
      patchDirect += lux;
    });

    patch.directLux = patchDirect;
  });

  // Form faktör matrisini pre-compute ve normalize et (Enerji Korunumu: Her kaynak için Σ F_ij <= 1.0)
  const formFactorRowSums = new Float64Array(allPatches.length);
  const patchFFList: { srcIdx: number; destIdx: number; ff: number }[][] = Array.from(
    { length: allPatches.length },
    () => []
  );

  for (let srcIdx = 0; srcIdx < allPatches.length; srcIdx++) {
    const srcPatch = allPatches[srcIdx];
    let rowSum = 0;

    for (let destIdx = 0; destIdx < allPatches.length; destIdx++) {
      if (srcIdx === destIdx) continue;
      const destPatch = allPatches[destIdx];

      if (srcPatch.surfaceId === destPatch.surfaceId && dot3(srcPatch.normal, destPatch.normal) > 0.99) {
        continue;
      }

      const rawFF = computeFormFactor(
        { pos: srcPatch.pos, normal: srcPatch.normal },
        { pos: destPatch.pos, normal: destPatch.normal, areaM2: destPatch.areaM2 }
      );

      if (rawFF > 1e-5) {
        patchFFList[srcIdx].push({ srcIdx, destIdx, ff: rawFF });
        rowSum += rawFF;
      }
    }

    // Enerji korunumu normalizasyonu: Bir yamadan çıkan toplam form faktörü 1.0'ı aşamaz
    const normFactor = rowSum > 0.98 ? 0.98 / rowSum : 1.0;
    if (normFactor < 1.0) {
      for (let k = 0; k < patchFFList[srcIdx].length; k++) {
        patchFFList[srcIdx][k].ff *= normFactor;
      }
      rowSum *= normFactor;
    }
    formFactorRowSums[srcIdx] = rowSum;
  }

  // 3. PASS 1..N: DOLAYLI AYDINLIK VE IŞIK SEKMESİ (INDIRECT LIGHT BOUNCES)
  let unshotRadiosity = allPatches.map(p => p.directLux * p.reflectance);
  const totalIndirectAccum = new Float64Array(allPatches.length);
  let firstBounceFlux = 0;

  for (let b = 0; b < bounces; b++) {
    const nextUnshot = new Float64Array(allPatches.length);

    for (let srcIdx = 0; srcIdx < allPatches.length; srcIdx++) {
      const srcRad = unshotRadiosity[srcIdx];
      if (srcRad < 0.05) continue;

      const ffs = patchFFList[srcIdx];
      for (let k = 0; k < ffs.length; k++) {
        const { destIdx, ff } = ffs[k];
        const destPatch = allPatches[destIdx];

        const receivedLux = srcRad * ff;
        totalIndirectAccum[destIdx] += receivedLux;
        destPatch.bounceDetails[b] = (destPatch.bounceDetails[b] || 0) + receivedLux;

        if (b === 0) {
          firstBounceFlux += receivedLux * destPatch.areaM2;
        }

        nextUnshot[destIdx] += receivedLux * destPatch.reflectance;
      }
    }

    unshotRadiosity = Array.from(nextUnshot);
  }

  // Yamaların toplam lükslerini ata
  let sumDirectFlux = 0;
  let sumIndirectFlux = 0;

  allPatches.forEach((patch, idx) => {
    patch.indirectLux = totalIndirectAccum[idx];
    patch.totalLux = patch.directLux + patch.indirectLux;
    sumDirectFlux += patch.directLux * patch.areaM2;
    sumIndirectFlux += patch.indirectLux * patch.areaM2;
  });

  // 4. Yüzey İstatistiklerini Derle
  const surfaceResults = roomSurfaces.map(surf => {
    const patches = surfacePatchMap.get(surf.id) || [];
    const count = Math.max(1, patches.length);

    let minTot = Infinity;
    let maxTot = -Infinity;
    let sumDir = 0;
    let sumIndir = 0;
    let sumTot = 0;

    patches.forEach(p => {
      if (p.totalLux < minTot) minTot = p.totalLux;
      if (p.totalLux > maxTot) maxTot = p.totalLux;
      sumDir += p.directLux;
      sumIndir += p.indirectLux;
      sumTot += p.totalLux;
    });

    const avgDirect = sumDir / count;
    const avgIndirect = sumIndir / count;
    const avgTot = sumTot / count;

    if (minTot === Infinity) minTot = 0;
    if (maxTot === -Infinity) maxTot = 0;

    const u0 = avgTot > 0 ? minTot / avgTot : 0;
    const u1 = maxTot > 0 ? minTot / maxTot : 0;

    const cols = surf.gridCols || (patchResolution === 'coarse' ? 8 : patchResolution === 'fine' ? 20 : 12);
    const rows = surf.gridRows || (patchResolution === 'coarse' ? 5 : patchResolution === 'fine' ? 12 : 8);

    return {
      id: surf.id,
      name: surf.name,
      type: surf.type,
      widthM: surf.widthM,
      heightM: surf.heightM,
      material: surf.material,
      avgDirectLux: avgDirect,
      avgIndirectLux: avgIndirect,
      avgTotalLux: avgTot,
      minTotalLux: minTot,
      maxTotalLux: maxTot,
      uniformityU0: u0,
      uniformityU1: u1,
      patches,
      cols,
      rows,
    };
  });

  const tEnd = performance.now();
  const energyRatio = sumDirectFlux > 0 ? firstBounceFlux / sumDirectFlux : 0;

  return {
    surfaces: surfaceResults,
    totalDirectLumens: Math.round(sumDirectFlux),
    totalIndirectLumens: Math.round(sumIndirectFlux),
    globalBounceCount: bounces,
    roomEnergyConservationRatio: +energyRatio.toFixed(3),
    calculationTimeMs: Math.round(tEnd - tStart),
  };
}

/**
 * Fiziksel Oda Ölçülerinden (Genişlik, Uzunluk, Yükseklik) Standart 6 Yüzeyli (4 Duvar + Zemin + Tavan)
 * Eksiksiz Oda Geometrisini Üretir.
 */
export function buildStandardRoomSurfaces(
  roomWidthX: number = 23.3,
  roomLengthZ: number = 7.0,
  roomHeightY: number = 4.3,
  materials?: Partial<Record<RoomSurfaceType, SurfaceMaterial>>
): RoomSurfaceDef[] {
  const hw = roomWidthX / 2;
  const hl = roomLengthZ / 2;
  const hy = roomHeightY / 2;

  const mat = (type: RoomSurfaceType, fallbackKey: string): SurfaceMaterial => {
    return materials?.[type] || DEFAULT_MATERIALS[fallbackKey] || DEFAULT_MATERIALS.matte_white;
  };

  return [
    // 1. ÖN KISA DUVAR (Z = -hl, normal +Z içeri bakar)
    {
      id: 'room-front-wall',
      name: 'Ön Duvar (Front Wall)',
      type: 'front_wall',
      widthM: roomWidthX,
      heightM: roomHeightY,
      centerPos: [0, hy, -hl],
      normal: [0, 0, 1],
      tangentU: [1, 0, 0],
      tangentV: [0, 1, 0],
      material: mat('front_wall', 'matte_white'),
    },

    // 2. ARKA KISA DUVAR (Z = +hl, normal -Z içeri bakar)
    {
      id: 'room-back-wall',
      name: 'Arka Duvar (Back Wall)',
      type: 'back_wall',
      widthM: roomWidthX,
      heightM: roomHeightY,
      centerPos: [0, hy, hl],
      normal: [0, 0, -1],
      tangentU: [-1, 0, 0],
      tangentV: [0, 1, 0],
      material: mat('back_wall', 'dark_grey'),
    },

    // 3. SOL UZUN DUVAR (X = -hw, normal +X içeri bakar)
    {
      id: 'room-left-wall',
      name: 'Sol Duvar (Left Wall)',
      type: 'left_wall',
      widthM: roomLengthZ,
      heightM: roomHeightY,
      centerPos: [-hw, hy, 0],
      normal: [1, 0, 0],
      tangentU: [0, 0, 1],
      tangentV: [0, 1, 0],
      material: mat('left_wall', 'matte_white'),
    },

    // 4. SAĞ UZUN DUVAR (X = +hw, normal -X içeri bakar)
    {
      id: 'room-right-wall',
      name: 'Sağ Duvar (Right Wall)',
      type: 'right_wall',
      widthM: roomLengthZ,
      heightM: roomHeightY,
      centerPos: [hw, hy, 0],
      normal: [-1, 0, 0],
      tangentU: [0, 0, -1],
      tangentV: [0, 1, 0],
      material: mat('right_wall', 'matte_white'),
    },

    // 5. ZEMİN (Y = 0, normal +Y yukarı bakar)
    {
      id: 'room-floor',
      name: 'Zemin (Floor)',
      type: 'floor',
      widthM: roomWidthX,
      heightM: roomLengthZ,
      centerPos: [0, 0, 0],
      normal: [0, 1, 0],
      tangentU: [1, 0, 0],
      tangentV: [0, 0, 1],
      material: mat('floor', 'dark_grey'),
    },

    // 6. TAVAN (Y = roomHeightY, normal -Y aşağı bakar)
    {
      id: 'room-ceiling',
      name: 'Tavan (Ceiling)',
      type: 'ceiling',
      widthM: roomWidthX,
      heightM: roomLengthZ,
      centerPos: [0, roomHeightY, 0],
      normal: [0, -1, 0],
      tangentU: [1, 0, 0],
      tangentV: [0, 0, -1],
      material: mat('ceiling', 'black_velvet'),
    },
  ];
}
