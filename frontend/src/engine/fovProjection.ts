/**
 * Optik Görüş Açısı (FOV) ve 3B Eğik Yüzey İzdüşüm Motoru
 *
 * - Projektör, Kamera, 3D Tarayıcı ve VR Sistemleri için HFOV / VFOV / DFOV hesabı
 * - 3B Frustum köşe ışınlarının hedef yüzey düzlemiyle geometrik kesişimi (Ray-Plane Intersection)
 * - Eğik yerleştirmede gerçek yamuk (trapezoid) izdüşüm kenarları, shoelace alanı ve keystone bozulması
 * - Yüzeyin tamamının kapsanıp kapsanmadığını kontrol eden 2D/3D frustum kapsama analizi
 */

export type OpticalDeviceKind = 'projector' | 'camera' | 'scanner3d' | 'vr';

export interface FovAnglesResult {
  hfovDeg: number;
  vfovDeg: number;
  dfovDeg: number;
  hfovRad: number;
  vfovRad: number;
}

export interface FovProjectionInput {
  hfovDeg: number;
  vfovDeg: number;
  /** Cihaz konumu (m): Hedef yüzey merkezi (0, 0, 0), yüzey normali +Z (cihaz +Z tarafında z = +distanceM) */
  posX: number;
  posY: number;
  posZ: number;
  /** Cihazın yüzeye (-Z yönüne) göre dönüş açıları (derece) */
  yawDeg: number;
  pitchDeg: number;
  rollDeg?: number;
  /** Opsiyonel optik lens shift (görüntü genişliği/yüksekliği oranı, örn. ±0.5) */
  hShift?: number;
  vShift?: number;
  /** Opsiyonel dijital keystone düzeltmesi (derece, ±40°) */
  keystoneHDeg?: number;
  keystoneVDeg?: number;
  /** Hedef yüzey genişliği ve yüksekliği (m) */
  surfaceWidthM: number;
  surfaceHeightM: number;
}

export interface FovProjectionResult {
  hfovDeg: number;
  vfovDeg: number;
  dfovDeg: number;
  /** Yüzey merkezine olan öklid mesafesi (m) */
  distanceToCenterM: number;
  /** Optik eksen ile yüzey normali arasındaki geliş açısı (derece) */
  incidenceAngleDeg: number;
  /** Tüm 4 köşe ışını yüzey düzlemiyle ileri yönde kesişiyor mu */
  allCornersHitPlane: boolean;
  /** Yüzey düzlemindeki 2D izdüşüm köşeleri (m): [Sol-Üst, Sağ-Üst, Sağ-Alt, Sol-Alt] */
  corners2D: [number, number][];
  /** 3B sahne uzayındaki köşe noktaları (m) */
  corners3D: [number, number, number][];
  /** Dijital keystone uygulandıktan sonraki aktif görüntü 2D köşeleri (m) */
  activeCorners2D: [number, number][];
  /** Dijital keystone uygulandıktan sonraki aktif görüntü 3B köşeleri (m) */
  activeCorners3D: [number, number, number][];
  /** Dijital keystone nedeniyle kaybedilen piksel oranı (%) */
  keystonePixelLossPct: number;
  /** Dijital keystone aktif mi */
  hasDigitalKeystone: boolean;
  /** Optik eksen merkezinin yüzey düzlemiyle kesişim noktası (m) */
  centerHit2D: [number, number] | null;
  /** İzdüşüm dörtgeninin kenar uzunlukları (m) */
  topEdgeM: number;
  bottomEdgeM: number;
  leftEdgeM: number;
  rightEdgeM: number;
  /** Gerçek yamuk / dörtgen izdüşüm alanı (m²) */
  projectedAreaM2: number;
  /** Yamuk (Keystone) bozulma oranı (%) */
  keystoneDistortionPct: number;
  /** Hedef yüzeyin tamamı görüş konisi içinde mi */
  isFullSurfaceCovered: boolean;
  /** Hedef yüzeyin yüzde kaçı kapsanıyor (0–100) */
  coveragePct: number;
  /** Görüş konisi dışında kalan yüzey kenarları */
  uncoveredSides: ('Sol' | 'Sağ' | 'Üst' | 'Alt')[];
  /** Yüzey sınırından taşan alan oranı (%) */
  overflowPct: number;
}

export interface OpticalSystemPreset {
  id: string;
  kind: OpticalDeviceKind;
  name: string;
  hfovDeg: number;
  vfovDeg: number;
  defaultDistM: number;
  notes: string;
}

export const SCANNER_3D_PRESETS: OpticalSystemPreset[] = [
  {
    id: 'blk360',
    kind: 'scanner3d',
    name: 'Leica BLK360 G2 (LiDAR)',
    hfovDeg: 110,
    vfovDeg: 75,
    defaultDistM: 4.0,
    notes: 'Tek pencere tarama kesiti / fotogrametri çalışma konisi',
  },
  {
    id: 'artec_leo',
    kind: 'scanner3d',
    name: 'Artec Leo (Yapısal Işık)',
    hfovDeg: 38.5,
    vfovDeg: 23.0,
    defaultDistM: 1.0,
    notes: 'Yüksek doğruluklu el tipi 3D tarayıcı görüş açısı',
  },
  {
    id: 'azure_kinect',
    kind: 'scanner3d',
    name: 'Orbbec / Depth ToF (WFOV)',
    hfovDeg: 120,
    vfovDeg: 120,
    defaultDistM: 2.2,
    notes: 'Geniş açılı derinlik sensörü (interaktif müze duvarı)',
  },
];

export const VR_SYSTEM_PRESETS: OpticalSystemPreset[] = [
  {
    id: 'quest3',
    kind: 'vr',
    name: 'Meta Quest 3 (Pancake)',
    hfovDeg: 110,
    vfovDeg: 96,
    defaultDistM: 2.5,
    notes: 'Yatay 110° × Dikey 96° binocular VR görüş alanı',
  },
  {
    id: 'valve_index',
    kind: 'vr',
    name: 'Valve Index / Base Station 2.0',
    hfovDeg: 150,
    vfovDeg: 110,
    defaultDistM: 3.5,
    notes: 'Geniş açılı SteamVR takip istasyonu kapsama konisi',
  },
  {
    id: 'vision_pro',
    kind: 'vr',
    name: 'Apple Vision Pro / XR',
    hfovDeg: 100,
    vfovDeg: 90,
    defaultDistM: 2.5,
    notes: 'Yüksek piksel yoğunluklu karma gerçeklik görüş konisi',
  },
];

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Projektör lensinin atım oranı (Throw Ratio) ve en-boy oranından (aspect = W/H)
 * gerçek optik HFOV, VFOV ve DFOV açılarını hesaplar.
 */
export function computeProjectorFov(throwRatio: number, aspect: number): FovAnglesResult {
  const tr = Math.max(0.1, Number.isFinite(throwRatio) ? throwRatio : 1.0);
  const ar = Math.max(0.2, Number.isFinite(aspect) ? aspect : 16 / 9);
  const halfWAt1 = 0.5 / tr;
  const halfHAt1 = halfWAt1 / ar;
  const halfDAt1 = Math.hypot(halfWAt1, halfHAt1);
  const hfovRad = 2 * Math.atan(halfWAt1);
  const vfovRad = 2 * Math.atan(halfHAt1);
  return {
    hfovDeg: r1(hfovRad * RAD2DEG),
    vfovDeg: r1(vfovRad * RAD2DEG),
    dfovDeg: r1(2 * Math.atan(halfDAt1) * RAD2DEG),
    hfovRad,
    vfovRad,
  };
}

/**
 * Kamera sensörü (mm) ve odak uzaklığından (mm) HFOV, VFOV ve DFOV açılarını hesaplar.
 */
export function computeCameraFov(sensorW: number, sensorH: number, focalMm: number): FovAnglesResult {
  const sw = Math.max(1, Number.isFinite(sensorW) ? sensorW : 36);
  const sh = Math.max(1, Number.isFinite(sensorH) ? sensorH : 24);
  const f = Math.max(1, Number.isFinite(focalMm) ? focalMm : 35);
  const hfovRad = 2 * Math.atan(sw / (2 * f));
  const vfovRad = 2 * Math.atan(sh / (2 * f));
  const dfovRad = 2 * Math.atan(Math.hypot(sw, sh) / (2 * f));
  return {
    hfovDeg: r1(hfovRad * RAD2DEG),
    vfovDeg: r1(vfovRad * RAD2DEG),
    dfovDeg: r1(dfovRad * RAD2DEG),
    hfovRad,
    vfovRad,
  };
}

export function computeDiagonalFov(hfovDeg: number, vfovDeg: number): number {
  const tw = Math.tan((Math.max(1, Math.min(175, hfovDeg)) * DEG2RAD) / 2);
  const th = Math.tan((Math.max(1, Math.min(175, vfovDeg)) * DEG2RAD) / 2);
  return r1(2 * Math.atan(Math.hypot(tw, th)) * RAD2DEG);
}

type Vec3 = [number, number, number];

function normalize3(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Cihaz lokal eksenlerinden (ileri = -Z, sağ = +X, yukarı = +Y)
 * yaw (Y etrafında), pitch (X etrafında) ve roll (Z etrafında) uygulanmış baz vektörlerini döndürür.
 */
function buildDeviceBasis(yawDeg: number, pitchDeg: number, rollDeg: number): {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
} {
  const y = yawDeg * DEG2RAD;
  const p = pitchDeg * DEG2RAD;
  const r = rollDeg * DEG2RAD;

  // Başlangıç: forward = (0, 0, -1), right = (1, 0, 0), up = (0, 1, 0)
  // Yaw (+yaw sağa çevirir: -Z -> +X bileşeni alır)
  const rotVec = (v: Vec3): Vec3 => {
    // 1) Roll (Z ekseni)
    const x1 = v[0] * Math.cos(r) - v[1] * Math.sin(r);
    const y1 = v[0] * Math.sin(r) + v[1] * Math.cos(r);
    const z1 = v[2];
    // 2) Pitch (X ekseni: +pitch yukarı bakar -> -Z'den +Y'ye)
    const x2 = x1;
    const y2 = y1 * Math.cos(p) - z1 * Math.sin(p);
    const z2 = y1 * Math.sin(p) + z1 * Math.cos(p);
    // 3) Yaw (Y ekseni: +yaw sağa bakar -> -Z'den +X'e)
    const x3 = x2 * Math.cos(y) - z2 * Math.sin(y);
    const y3 = y2;
    const z3 = x2 * Math.sin(y) + z2 * Math.cos(y);
    return [x3, y3, z3];
  };

  return {
    forward: normalize3(rotVec([0, 0, -1])),
    right: normalize3(rotVec([1, 0, 0])),
    up: normalize3(rotVec([0, 1, 0])),
  };
}

/**
 * 3B ortamda cihazın optik FOV konisini z = 0 yüzey düzlemiyle kesiştirerek
 * eğik izdüşüm (yamuk/trapezoid) geometrisini ve tam yüzey kapsama durumunu hesaplar.
 */
export function computeFovSurfaceProjection(inp: FovProjectionInput): FovProjectionResult {
  const hfovDeg = Math.max(2, Math.min(170, inp.hfovDeg || 50));
  const vfovDeg = Math.max(2, Math.min(170, inp.vfovDeg || 30));
  const dfovDeg = computeDiagonalFov(hfovDeg, vfovDeg);

  const surfW = Math.max(0.1, inp.surfaceWidthM || 4);
  const surfH = Math.max(0.1, inp.surfaceHeightM || 2.25);

  const pos: Vec3 = [
    Number.isFinite(inp.posX) ? inp.posX : 0,
    Number.isFinite(inp.posY) ? inp.posY : 0,
    Math.max(0.1, Number.isFinite(inp.posZ) ? inp.posZ : 4),
  ];

  const basis = buildDeviceBasis(inp.yawDeg || 0, inp.pitchDeg || 0, inp.rollDeg || 0);
  const tanH = Math.tan((hfovDeg * DEG2RAD) / 2);
  const tanV = Math.tan((vfovDeg * DEG2RAD) / 2);
  const hOff = (inp.hShift ?? 0) * (2 * tanH);
  const vOff = (inp.vShift ?? 0) * (2 * tanV);

  // Yüzey z = 0 düzlemindedir; yüzey normali (0, 0, +1) cihaz tarafına bakar.
  // Ray: P(t) = pos + t * dir, z = 0 => pos[2] + t * dir[2] = 0 => t = -pos[2] / dir[2]
  const intersectPlaneZ0 = (dir: Vec3): { hit: [number, number]; t: number; valid: boolean } => {
    const denom = dir[2];
    if (denom >= -1e-4) {
      // Işın yüzey düzleminden uzaklaşıyor veya paralel: görsel referans için uzak uca kırp
      const safeT = pos[2] / 0.05;
      return {
        hit: [pos[0] + dir[0] * safeT, pos[1] + dir[1] * safeT],
        t: safeT,
        valid: false,
      };
    }
    const t = -pos[2] / denom;
    return {
      hit: [pos[0] + dir[0] * t, pos[1] + dir[1] * t],
      t,
      valid: t > 0,
    };
  };

  // Köşe ışınları: Sol-Üst (-1,+1), Sağ-Üst (+1,+1), Sağ-Alt (+1,-1), Sol-Alt (-1,-1)
  const cornerParams: [number, number][] = [
    [-tanH + hOff, tanV + vOff],
    [tanH + hOff, tanV + vOff],
    [tanH + hOff, -tanV + vOff],
    [-tanH + hOff, -tanV + vOff],
  ];

  const cornerHits = cornerParams.map(([u, v]) => {
    const dir = normalize3([
      basis.forward[0] + basis.right[0] * u + basis.up[0] * v,
      basis.forward[1] + basis.right[1] * u + basis.up[1] * v,
      basis.forward[2] + basis.right[2] * u + basis.up[2] * v,
    ]);
    return intersectPlaneZ0(dir);
  });

  const allCornersHitPlane = cornerHits.every(h => h.valid);
  const corners2D: [number, number][] = cornerHits.map(h => [r2(h.hit[0]), r2(h.hit[1])]);
  const corners3D: Vec3[] = cornerHits.map(h => [r2(h.hit[0]), r2(h.hit[1]), 0]);

  // Dijital Keystone (V / H) kırpma ve yamuk telafisi
  const kV = Math.max(-40, Math.min(40, inp.keystoneVDeg ?? 0));
  const kH = Math.max(-40, Math.min(40, inp.keystoneHDeg ?? 0));
  const hasDigitalKeystone = Math.abs(kV) > 0.05 || Math.abs(kH) > 0.05;
  const pinchV = Math.min(0.6, Math.abs(Math.tan(kV * DEG2RAD)) * 0.72);
  const pinchH = Math.min(0.6, Math.abs(Math.tan(kH * DEG2RAD)) * 0.72);
  const keystonePixelLossPct = hasDigitalKeystone
    ? r1((1 - (1 - pinchV / 2) * (1 - pinchH / 2)) * 100)
    : 0;

  const activeSignCorners: [number, number][] = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ];
  const activeCornerHits = hasDigitalKeystone
    ? activeSignCorners.map(([sx, sy]) => {
        const xScale =
          (kV > 0 && sy > 0) || (kV < 0 && sy < 0) ? 1 - pinchV : 1;
        const yScale =
          (kH > 0 && sx > 0) || (kH < 0 && sx < 0) ? 1 - pinchH : 1;
        const u = sx * xScale * tanH + hOff;
        const v = sy * yScale * tanV + vOff;
        const dir = normalize3([
          basis.forward[0] + basis.right[0] * u + basis.up[0] * v,
          basis.forward[1] + basis.right[1] * u + basis.up[1] * v,
          basis.forward[2] + basis.right[2] * u + basis.up[2] * v,
        ]);
        return intersectPlaneZ0(dir);
      })
    : cornerHits;
  const activeCorners2D: [number, number][] = activeCornerHits.map(h => [r2(h.hit[0]), r2(h.hit[1])]);
  const activeCorners3D: Vec3[] = activeCornerHits.map(h => [r2(h.hit[0]), r2(h.hit[1]), 0]);

  const centerDir = normalize3([
    basis.forward[0] + basis.right[0] * hOff + basis.up[0] * vOff,
    basis.forward[1] + basis.right[1] * hOff + basis.up[1] * vOff,
    basis.forward[2] + basis.right[2] * hOff + basis.up[2] * vOff,
  ]);
  const centerRes = intersectPlaneZ0(centerDir);
  const centerHit2D: [number, number] | null = centerRes.valid
    ? [r2(centerRes.hit[0]), r2(centerRes.hit[1])]
    : null;

  // Geliş açısı (optik eksen ile yüzey normali [0, 0, 1] arası)
  const cosInc = Math.min(1, Math.max(0, Math.abs(dot3(centerDir, [0, 0, 1]))));
  const incidenceAngleDeg = r1(Math.acos(cosInc) * RAD2DEG);

  // Aktif (keystone sonrası) kenar uzunlukları
  const dist2 = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const [tl, tr, br, bl] = activeCornerHits.map(h => h.hit);
  const topEdgeM = r2(dist2(tl, tr));
  const rightEdgeM = r2(dist2(tr, br));
  const bottomEdgeM = r2(dist2(br, bl));
  const leftEdgeM = r2(dist2(bl, tl));

  // Shoelace formülü ile gerçek aktif izdüşüm alanı (m²)
  let shoelace = 0;
  const ptsRaw = [tl, tr, br, bl];
  for (let i = 0; i < 4; i++) {
    const p1 = ptsRaw[i];
    const p2 = ptsRaw[(i + 1) % 4];
    shoelace += p1[0] * p2[1] - p2[0] * p1[1];
  }
  const projectedAreaM2 = r2(Math.abs(shoelace) / 2);

  const hSkew = Math.abs(topEdgeM - bottomEdgeM) / Math.max(0.01, Math.max(topEdgeM, bottomEdgeM));
  const vSkew = Math.abs(leftEdgeM - rightEdgeM) / Math.max(0.01, Math.max(leftEdgeM, rightEdgeM));
  const keystoneDistortionPct = r1(Math.min(95, Math.max(hSkew, vSkew) * 100));

  // Bir nokta cihazın aktif frustumu içinde mi? (21×21 örnekleme + 4 yüzey köşesi kontrolü)
  const isPointInFrustum = (qx: number, qy: number): boolean => {
    const dx = qx - pos[0];
    const dy = qy - pos[1];
    const dz = 0 - pos[2];
    const zLocal = dx * basis.forward[0] + dy * basis.forward[1] + dz * basis.forward[2];
    if (zLocal <= 1e-4) return false;
    const u = (dx * basis.right[0] + dy * basis.right[1] + dz * basis.right[2]) / zLocal - hOff;
    const v = (dx * basis.up[0] + dy * basis.up[1] + dz * basis.up[2]) / zLocal - vOff;
    const nu = u / Math.max(1e-5, tanH);
    const nv = v / Math.max(1e-5, tanV);
    if (Math.abs(nu) > 1 + 1e-4 || Math.abs(nv) > 1 + 1e-4) return false;
    if (!hasDigitalKeystone) return true;
    const maxNu =
      kV > 0 ? 1 - pinchV * ((nv + 1) / 2) : kV < 0 ? 1 - pinchV * ((1 - nv) / 2) : 1;
    const maxNv =
      kH > 0 ? 1 - pinchH * ((nu + 1) / 2) : kH < 0 ? 1 - pinchH * ((1 - nu) / 2) : 1;
    return Math.abs(nu) <= maxNu + 1e-4 && Math.abs(nv) <= maxNv + 1e-4;
  };

  const GRID = 21;
  let insideCount = 0;
  for (let iy = 0; iy < GRID; iy++) {
    const sy = ((iy + 0.5) / GRID - 0.5) * surfH;
    for (let ix = 0; ix < GRID; ix++) {
      const sx = ((ix + 0.5) / GRID - 0.5) * surfW;
      if (isPointInFrustum(sx, sy)) insideCount++;
    }
  }
  const coveragePct = r1((insideCount / (GRID * GRID)) * 100);

  // Yüzeyin 4 köşesi ve kenar orta noktaları
  const leftCovered = isPointInFrustum(-surfW / 2, 0) && isPointInFrustum(-surfW / 2, surfH / 2) && isPointInFrustum(-surfW / 2, -surfH / 2);
  const rightCovered = isPointInFrustum(surfW / 2, 0) && isPointInFrustum(surfW / 2, surfH / 2) && isPointInFrustum(surfW / 2, -surfH / 2);
  const topCovered = isPointInFrustum(0, surfH / 2) && isPointInFrustum(-surfW / 2, surfH / 2) && isPointInFrustum(surfW / 2, surfH / 2);
  const bottomCovered = isPointInFrustum(0, -surfH / 2) && isPointInFrustum(-surfW / 2, -surfH / 2) && isPointInFrustum(surfW / 2, -surfH / 2);

  const uncoveredSides: ('Sol' | 'Sağ' | 'Üst' | 'Alt')[] = [];
  if (!leftCovered) uncoveredSides.push('Sol');
  if (!rightCovered) uncoveredSides.push('Sağ');
  if (!topCovered) uncoveredSides.push('Üst');
  if (!bottomCovered) uncoveredSides.push('Alt');

  const isFullSurfaceCovered = insideCount === GRID * GRID && uncoveredSides.length === 0;

  const surfaceAreaM2 = surfW * surfH;
  const coveredSurfaceArea = surfaceAreaM2 * (coveragePct / 100);
  const overflowPct = allCornersHitPlane && projectedAreaM2 > coveredSurfaceArea
    ? r1(((projectedAreaM2 - coveredSurfaceArea) / Math.max(0.01, projectedAreaM2)) * 100)
    : 0;

  return {
    hfovDeg: r1(hfovDeg),
    vfovDeg: r1(vfovDeg),
    dfovDeg: r1(dfovDeg),
    distanceToCenterM: r2(Math.hypot(pos[0], pos[1], pos[2])),
    incidenceAngleDeg,
    allCornersHitPlane,
    corners2D,
    corners3D,
    activeCorners2D,
    activeCorners3D,
    keystonePixelLossPct,
    hasDigitalKeystone,
    centerHit2D,
    topEdgeM,
    bottomEdgeM,
    leftEdgeM,
    rightEdgeM,
    projectedAreaM2,
    keystoneDistortionPct,
    isFullSurfaceCovered,
    coveragePct,
    uncoveredSides,
    overflowPct,
  };
}

export interface ViewerFovInput {
  surfaceWidthM: number;
  surfaceHeightM: number;
  viewerDistM: number;
  viewerOffsetXM?: number;
  viewerOffsetYM?: number;
  surfaceTiltDeg?: number;
  surfaceCurvatureDeg?: number;
}

export interface ViewerFovResult {
  hfovDeg: number;
  vfovDeg: number;
  dfovDeg: number;
  viewerCenterAngleDeg: number;
  viewerDistanceToCenterM: number;
  perspectiveCompressionPct: number;
  straightHfovDeg: number;
  straightVfovDeg: number;
}

export interface SurfaceFovResult {
  hfovDeg: number;
  vfovDeg: number;
  dfovDeg: number;
  surfaceTiltDeg: number;
  surfaceCurvatureDeg: number;
  perspectiveChangePct: number;
}

/**
 * 1. Viewer FOV: İzleyicinin konumu (X, Y, Z) ve yüzey eğimi/kavisinden
 * kaynaklanan gerçek izleyici görüş açıları (yatay, dikey, çapraz) ve merkez açısı.
 */
export function computeViewerFov(inp: ViewerFovInput): ViewerFovResult {
  const w = Math.max(0.1, inp.surfaceWidthM || 4);
  const h = Math.max(0.1, inp.surfaceHeightM || 2.25);
  const vz = Math.max(0.2, inp.viewerDistM || 3.5);
  const vx = inp.viewerOffsetXM ?? 0;
  const vy = inp.viewerOffsetYM ?? 0;
  const tiltRad = ((inp.surfaceTiltDeg ?? 0) * DEG2RAD);
  const curvDeg = Math.max(0, Math.min(180, inp.surfaceCurvatureDeg ?? 0));

  // Kavisli yüzeyde efektif kiriş genişliği (chord)
  const effW = curvDeg > 1
    ? (w / (curvDeg * DEG2RAD)) * 2 * Math.sin((curvDeg * DEG2RAD) / 2)
    : w;

  const cosT = Math.cos(tiltRad);
  const sinT = Math.sin(tiltRad);
  const halfW = effW / 2;
  const halfH = h / 2;

  const angleBetween = (a: Vec3, b: Vec3): number => {
    const na = normalize3(a);
    const nb = normalize3(b);
    const c = Math.max(-1, Math.min(1, dot3(na, nb)));
    return Math.acos(c) * RAD2DEG;
  };

  const leftPt: Vec3 = [-halfW * cosT, 0, halfW * sinT];
  const rightPt: Vec3 = [halfW * cosT, 0, -halfW * sinT];
  const topPt: Vec3 = [0, halfH, 0];
  const botPt: Vec3 = [0, -halfH, 0];
  const tlPt: Vec3 = [-halfW * cosT, halfH, halfW * sinT];
  const brPt: Vec3 = [halfW * cosT, -halfH, -halfW * sinT];

  const vPos: Vec3 = [vx, vy, vz];
  const toVec = (pt: Vec3): Vec3 => [pt[0] - vPos[0], pt[1] - vPos[1], pt[2] - vPos[2]];

  const hfovDeg = r1(angleBetween(toVec(leftPt), toVec(rightPt)));
  const vfovDeg = r1(angleBetween(toVec(topPt), toVec(botPt)));
  const dfovDeg = r1(angleBetween(toVec(tlPt), toVec(brPt)));

  const centerVec = normalize3(toVec([0, 0, 0]));
  const surfNormal: Vec3 = [sinT, 0, cosT];
  const cosCenter = Math.max(0, Math.min(1, Math.abs(dot3(centerVec, surfNormal))));
  const viewerCenterAngleDeg = r1(Math.acos(cosCenter) * RAD2DEG);
  const viewerDistanceToCenterM = r2(Math.hypot(vx, vy, vz));

  const straightHfovDeg = r1(2 * Math.atan(w / (2 * vz)) * RAD2DEG);
  const straightVfovDeg = r1(2 * Math.atan(h / (2 * vz)) * RAD2DEG);
  const perspectiveCompressionPct = r1(
    Math.max(0, Math.min(95, (1 - hfovDeg / Math.max(0.1, straightHfovDeg)) * 100)),
  );

  return {
    hfovDeg,
    vfovDeg,
    dfovDeg,
    viewerCenterAngleDeg,
    viewerDistanceToCenterM,
    perspectiveCompressionPct,
    straightHfovDeg,
    straightVfovDeg,
  };
}

/**
 * 3. Surface FOV: Eğik veya kavisli yüzey üzerindeki gerçek geometrik izdüşümün
 * cihaz bakış açısından gördüğü efektif kapsama açısı ve perspektif değişimi.
 */
export function computeSurfaceFov(opts: {
  devicePos: Vec3;
  activeCorners3D: Vec3[];
  projectorHfovDeg: number;
  projectorVfovDeg: number;
  surfaceTiltDeg?: number;
  surfaceCurvatureDeg?: number;
}): SurfaceFovResult {
  const [tl, tr, br, bl] = opts.activeCorners3D;
  const p = opts.devicePos;
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const toVec = (pt: Vec3): Vec3 => [pt[0] - p[0], pt[1] - p[1], pt[2] - p[2]];
  const angleBetween = (a: Vec3, b: Vec3): number => {
    const na = normalize3(a);
    const nb = normalize3(b);
    return Math.acos(Math.max(-1, Math.min(1, dot3(na, nb)))) * RAD2DEG;
  };

  const leftMid = mid(tl, bl);
  const rightMid = mid(tr, br);
  const topMid = mid(tl, tr);
  const botMid = mid(bl, br);

  const hfovDeg = r1(angleBetween(toVec(leftMid), toVec(rightMid)));
  const vfovDeg = r1(angleBetween(toVec(topMid), toVec(botMid)));
  const dfovDeg = r1(angleBetween(toVec(tl), toVec(br)));

  const baseH = Math.max(0.1, opts.projectorHfovDeg);
  const baseV = Math.max(0.1, opts.projectorVfovDeg);
  const perspectiveChangePct = r1(
    Math.min(
      95,
      Math.max(
        Math.abs(hfovDeg - baseH) / baseH,
        Math.abs(vfovDeg - baseV) / baseV,
      ) * 100,
    ),
  );

  return {
    hfovDeg,
    vfovDeg,
    dfovDeg,
    surfaceTiltDeg: r1(opts.surfaceTiltDeg ?? 0),
    surfaceCurvatureDeg: r1(opts.surfaceCurvatureDeg ?? 0),
    perspectiveChangePct,
  };
}
