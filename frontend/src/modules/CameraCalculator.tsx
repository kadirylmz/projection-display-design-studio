import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, Line, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { focalForFraming, framing, visibleSize } from '../engine/camera';
import {
  computeCameraFov,
  computeFovSurfaceProjection,
  computeProjectorFov,
  computeSurfaceFov,
  computeViewerFov,
  OpticalDeviceKind,
  SCANNER_3D_PRESETS,
  VR_SYSTEM_PRESETS,
} from '../engine/fovProjection';
import { LengthUnit, fromMeters, toMeters, round } from '../engine/units';

const SENSORS: Record<string, [number, number]> = {
  '35 mm tam kare (36×24)': [36, 24],
  'Süper 35 (24.89×18.66)': [24.89, 18.66],
  'APS-C (23.5×15.6)': [23.5, 15.6],
  '1" (13.2×8.8)': [13.2, 8.8],
  'Özel': [0, 0],
};

const ASPECT_PRESETS: Record<string, number> = {
  '16:9': 16 / 9,
  '16:10': 16 / 10,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
};

function FovFrustum3DScene({
  pos,
  surfW,
  surfH,
  corners3D,
  activeCorners3D,
  hasDigitalKeystone,
  centerHit2D,
  isFullCovered,
  deviceKind,
  yawDeg,
  pitchDeg,
  rollDeg,
  isPortrait,
}: {
  pos: [number, number, number];
  surfW: number;
  surfH: number;
  corners3D: [number, number, number][];
  activeCorners3D: [number, number, number][];
  hasDigitalKeystone: boolean;
  centerHit2D: [number, number] | null;
  isFullCovered: boolean;
  deviceKind: OpticalDeviceKind;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  isPortrait: boolean;
}) {
  const deviceQuat = useMemo(() => {
    const euler = new THREE.Euler(
      (pitchDeg * Math.PI) / 180,
      (-yawDeg * Math.PI) / 180,
      ((rollDeg + (isPortrait ? 90 : 0)) * Math.PI) / 180,
      'YXZ'
    );
    return new THREE.Quaternion().setFromEuler(euler);
  }, [yawDeg, pitchDeg, rollDeg, isPortrait]);

  const { coneGeo, footprintGeo, edgeLoop, activeEdgeLoop, rayLines } = useMemo(() => {
    const p = new THREE.Vector3(...pos);
    const pts = corners3D.map(c => new THREE.Vector3(c[0], c[1], c[2] + 0.015));
    const aPts = activeCorners3D.map(c => new THREE.Vector3(c[0], c[1], c[2] + 0.02));
    const coneVerts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      coneVerts.push(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.Float32BufferAttribute(coneVerts, 3));
    cGeo.computeVertexNormals();

    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          aPts[0].x, aPts[0].y, aPts[0].z,
          aPts[1].x, aPts[1].y, aPts[1].z,
          aPts[2].x, aPts[2].y, aPts[2].z,
          aPts[0].x, aPts[0].y, aPts[0].z,
          aPts[2].x, aPts[2].y, aPts[2].z,
          aPts[3].x, aPts[3].y, aPts[3].z,
        ],
        3
      )
    );
    fGeo.computeVertexNormals();

    const loop: [number, number, number][] = [
      [pts[0].x, pts[0].y, pts[0].z + 0.005],
      [pts[1].x, pts[1].y, pts[1].z + 0.005],
      [pts[2].x, pts[2].y, pts[2].z + 0.005],
      [pts[3].x, pts[3].y, pts[3].z + 0.005],
      [pts[0].x, pts[0].y, pts[0].z + 0.005],
    ];
    const activeLoop: [number, number, number][] = [
      [aPts[0].x, aPts[0].y, aPts[0].z + 0.006],
      [aPts[1].x, aPts[1].y, aPts[1].z + 0.006],
      [aPts[2].x, aPts[2].y, aPts[2].z + 0.006],
      [aPts[3].x, aPts[3].y, aPts[3].z + 0.006],
      [aPts[0].x, aPts[0].y, aPts[0].z + 0.006],
    ];
    const rays: [[number, number, number], [number, number, number]][] = pts.map(pt => [
      pos,
      [pt.x, pt.y, pt.z],
    ]);

    return { coneGeo: cGeo, footprintGeo: fGeo, edgeLoop: loop, activeEdgeLoop: activeLoop, rayLines: rays };
  }, [pos, corners3D, activeCorners3D]);

  const accent = isFullCovered ? '#22c55e' : '#f59e0b';
  const deviceColor =
    deviceKind === 'projector'
      ? '#38bdf8'
      : deviceKind === 'camera'
      ? '#f472b6'
      : deviceKind === 'scanner3d'
      ? '#a855f7'
      : '#10b981';

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 10, 8]} intensity={0.8} />
      <Grid
        args={[24, 24]}
        position={[0, -surfH / 2, 0]}
        cellSize={0.5}
        cellColor="#1e293b"
        sectionSize={2}
        sectionColor="#334155"
      />

      {/* Hedef Yüzey Düzlemi */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[surfW, surfH]} />
        <meshStandardMaterial color="#1e293b" side={THREE.DoubleSide} />
      </mesh>
      <Line
        points={[
          [-surfW / 2, surfH / 2, 0.01],
          [surfW / 2, surfH / 2, 0.01],
          [surfW / 2, -surfH / 2, 0.01],
          [-surfW / 2, -surfH / 2, 0.01],
          [-surfW / 2, surfH / 2, 0.01],
        ]}
        color="#f8fafc"
        lineWidth={2}
      />
      <Text
        position={[0, surfH / 2 + 0.22, 0.02]}
        fontSize={0.22}
        color="#e2e8f0"
        anchorX="center"
      >
        {`Hedef Yüzey (${surfW.toFixed(2)}m × ${surfH.toFixed(2)}m)`}
      </Text>

      {/* Yarı Saydam 3B Görüş Konisi (FOV Frustum) */}
      <mesh geometry={coneGeo}>
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Köşe Işınları */}
      {rayLines.map((pts, i) => (
        <Line key={i} points={pts} color={accent} lineWidth={1.2} transparent opacity={0.75} />
      ))}

      {/* Merkez Optik Eksen Işını */}
      {centerHit2D && (
        <Line
          points={[pos, [centerHit2D[0], centerHit2D[1], 0.02]]}
          color="#38bdf8"
          lineWidth={1.6}
          dashed
          dashSize={0.18}
          gapSize={0.12}
        />
      )}

      {/* Yüzey Üzerindeki Gerçek Eğik İzdüşüm (Yamuk / Trapezoid + Keystone Aktif Alan) */}
      <mesh geometry={footprintGeo}>
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.32}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {hasDigitalKeystone ? (
        <>
          <Line points={edgeLoop} color="#94a3b8" lineWidth={1.3} dashed dashSize={0.14} gapSize={0.1} />
          <Line points={activeEdgeLoop} color={accent} lineWidth={2.4} />
        </>
      ) : (
        <Line points={edgeLoop} color={accent} lineWidth={2.2} />
      )}

      {/* Cihaz Gövdesi (Yaw, Pitch, Roll ve Dikey/Portrait moduna göre gerçek 3B yönelim) */}
      <group position={pos} quaternion={deviceQuat}>
        <mesh>
          <boxGeometry args={[0.32, 0.16, 0.36]} />
          <meshStandardMaterial color={deviceColor} emissive={deviceColor} emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0, 0, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.065, 0.08, 16]} />
          <meshStandardMaterial color="#0f172a" emissive={deviceColor} emissiveIntensity={0.45} />
        </mesh>
      </group>
      <Text
        position={[pos[0], pos[1] + 0.3, pos[2]]}
        fontSize={0.2}
        color={deviceColor}
        anchorX="center"
      >
        {deviceKind === 'projector'
          ? `Projektör${isPortrait ? ' (Dikey)' : ''}`
          : deviceKind === 'camera'
          ? 'Kamera'
          : deviceKind === 'scanner3d'
          ? '3D Tarayıcı'
          : 'VR Sistemi'}
      </Text>
    </>
  );
}

export default function CameraCalculator({ unit }: { unit: LengthUnit }) {
  const [deviceKind, setDeviceKind] = useState<OpticalDeviceKind>('projector');

  // Projektör parametreleri
  const [throwRatio, setThrowRatio] = useState<number>(1.0);
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [aspectKey, setAspectKey] = useState<string>('16:9');
  const [orient, setOrient] = useState<'landscape' | 'portrait'>('landscape');
  const [hShift, setHShift] = useState<number>(0);
  const [vShift, setVShift] = useState<number>(0);
  const [keystoneV, setKeystoneV] = useState<number>(0);
  const [keystoneH, setKeystoneH] = useState<number>(0);

  // Kamera parametreleri
  const [sensor, setSensor] = useState('35 mm tam kare (36×24)');
  const [sw, setSw] = useState(36);
  const [sh, setSh] = useState(24);
  const [focal, setFocal] = useState(35);

  // 3D Tarayıcı & VR parametreleri
  const [scannerPresetId, setScannerPresetId] = useState(SCANNER_3D_PRESETS[0].id);
  const [vrPresetId, setVrPresetId] = useState(VR_SYSTEM_PRESETS[0].id);
  const [customHfov, setCustomHfov] = useState<number>(110);
  const [customVfov, setCustomVfov] = useState<number>(75);

  // 3B Konum & Açılar + Hedef Yüzey Ölçüleri
  const [yRefMode, setYRefMode] = useState<'floor' | 'center'>('floor');
  const [posX, setPosX] = useState<number>(0);
  const [posY, setPosY] = useState<number>(1.13);
  const [dist, setDist] = useState<number>(4.5);
  const [yaw, setYaw] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);
  const [roll, setRoll] = useState<number>(0);
  const [subW, setSubW] = useState<number>(4);
  const [subH, setSubH] = useState<number>(2.25);

  // İzleyici (Viewer FOV) & Yüzey Eğimi / Kavisi (Surface FOV)
  const [viewerDistM, setViewerDistM] = useState<number>(3.5);
  const [viewerX, setViewerX] = useState<number>(0);
  const [viewerY, setViewerY] = useState<number>(0);
  const [surfaceTiltDeg, setSurfaceTiltDeg] = useState<number>(0);
  const [surfaceCurvatureDeg, setSurfaceCurvatureDeg] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');

  const pickSensor = (k: string) => {
    setSensor(k);
    const s = SENSORS[k];
    if (s[0]) {
      setSw(s[0]);
      setSh(s[1]);
    }
  };

  const applyKindPreset = (kind: OpticalDeviceKind) => {
    setDeviceKind(kind);
    if (kind === 'scanner3d') {
      const p = SCANNER_3D_PRESETS.find(x => x.id === scannerPresetId) || SCANNER_3D_PRESETS[0];
      setCustomHfov(p.hfovDeg);
      setCustomVfov(p.vfovDeg);
    } else if (kind === 'vr') {
      const p = VR_SYSTEM_PRESETS.find(x => x.id === vrPresetId) || VR_SYSTEM_PRESETS[0];
      setCustomHfov(p.hfovDeg);
      setCustomVfov(p.vfovDeg);
    }
  };

  const r = useMemo(() => {
    try {
      const surfW = Math.max(0.1, toMeters(subW, unit));
      const surfH = Math.max(0.1, toMeters(subH, unit));
      const xM = toMeters(posX, unit);
      const rawYM = toMeters(posY, unit);
      const yM = yRefMode === 'floor' ? rawYM - surfH / 2 : rawYM;
      const zM = Math.max(0.2, toMeters(dist, unit));

      let hfovDeg = 53.1;
      let vfovDeg = 31.4;
      let camMeta: { visible: { width: number; height: number }; fillW: number; fillH: number; fits: boolean; needF: number } | null = null;

      if (deviceKind === 'projector') {
        const effectiveTR = Math.max(0.15, throwRatio / Math.max(0.3, zoomFactor));
        const baseAspect = ASPECT_PRESETS[aspectKey] ?? 16 / 9;
        const effAspect = orient === 'portrait' ? 1 / baseAspect : baseAspect;
        const pf = computeProjectorFov(effectiveTR, effAspect);
        hfovDeg = pf.hfovDeg;
        vfovDeg = pf.vfovDeg;
      } else if (deviceKind === 'camera') {
        const effectiveFocal = focal * Math.max(0.3, zoomFactor);
        const cf = computeCameraFov(sw, sh, effectiveFocal);
        hfovDeg = cf.hfovDeg;
        vfovDeg = cf.vfovDeg;
        const cam = { sensorW: sw, sensorH: sh, focal: effectiveFocal };
        const v = visibleSize(cam, zM);
        const fr = framing(cam, zM, surfW, surfH);
        const needF = focalForFraming(sw, zM, surfW);
        camMeta = { visible: v, fillW: fr.fillW, fillH: fr.fillH, fits: fr.fits, needF };
      } else {
        const zf = Math.max(0.3, zoomFactor);
        hfovDeg = +(2 * Math.atan(Math.tan((customHfov * Math.PI) / 360) / zf) * (180 / Math.PI)).toFixed(1);
        vfovDeg = +(2 * Math.atan(Math.tan((customVfov * Math.PI) / 360) / zf) * (180 / Math.PI)).toFixed(1);
      }

      const proj = computeFovSurfaceProjection({
        hfovDeg,
        vfovDeg,
        posX: xM,
        posY: yM,
        posZ: zM,
        yawDeg: yaw,
        pitchDeg: pitch,
        rollDeg: roll,
        hShift: deviceKind === 'projector' ? hShift : 0,
        vShift: deviceKind === 'projector' ? vShift : 0,
        keystoneHDeg: deviceKind === 'projector' ? keystoneH : 0,
        keystoneVDeg: deviceKind === 'projector' ? keystoneV : 0,
        surfaceWidthM: surfW,
        surfaceHeightM: surfH,
      });

      const viewerFov = computeViewerFov({
        surfaceWidthM: surfW,
        surfaceHeightM: surfH,
        viewerDistM: Math.max(0.3, toMeters(viewerDistM, unit)),
        viewerOffsetXM: toMeters(viewerX, unit),
        viewerOffsetYM: toMeters(viewerY, unit),
        surfaceTiltDeg,
        surfaceCurvatureDeg,
      });

      const surfaceFov = computeSurfaceFov({
        devicePos: [xM, yM, zM],
        activeCorners3D: proj.activeCorners3D,
        projectorHfovDeg: proj.hfovDeg,
        projectorVfovDeg: proj.vfovDeg,
        surfaceTiltDeg,
        surfaceCurvatureDeg,
      });

      return { proj, viewerFov, surfaceFov, camMeta, surfW, surfH, posM: [xM, yM, zM] as [number, number, number], err: null as string | null };
    } catch (e) {
      return { err: (e as Error).message } as any;
    }
  }, [
    deviceKind,
    throwRatio,
    zoomFactor,
    aspectKey,
    orient,
    hShift,
    vShift,
    keystoneH,
    keystoneV,
    sw,
    sh,
    focal,
    customHfov,
    customVfov,
    yRefMode,
    posX,
    posY,
    dist,
    yaw,
    pitch,
    roll,
    subW,
    subH,
    viewerDistM,
    viewerX,
    viewerY,
    surfaceTiltDeg,
    surfaceCurvatureDeg,
    unit,
  ]);

  const u = (m: number) => `${round(fromMeters(m, unit), 2)} ${unit}`;
  const N = (l: string, v: number, s: (x: number) => void, step = 'any') => (
    <label className="block text-[11px] text-slate-300">
      {l}
      <input
        className="inp mt-0.5"
        type="number"
        step={step}
        value={v}
        onChange={e => s(parseFloat(e.target.value) || 0)}
      />
    </label>
  );

  return (
    <div className="grid lg:grid-cols-[350px_1fr] gap-4 h-full">
      {/* SOL PANEL: CİHAZ MODU, KONUM, YÜZEY VE EĞİK AÇI KONTROLLERİ */}
      <div className="space-y-3 p-3 rounded-lg border border-slate-700 bg-slate-900 text-sm overflow-y-auto">
        <div>
          <h2 className="font-bold text-slate-100">Optik FOV, 3B Konisi &amp; İzdüşüm</h2>
          <p className="text-[11px] text-slate-400">
            Projektör, kamera, 3D tarayıcı ve VR sistemleri için HFOV/VFOV ve eğik yüzey izdüşümü
          </p>
        </div>

        {/* 4 Sistem Sekmesi */}
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          {[
            { id: 'projector', label: '📽️ Projektör' },
            { id: 'camera', label: '📷 Kamera' },
            { id: 'scanner3d', label: '📡 3D Tarayıcı' },
            { id: 'vr', label: '🥽 VR Sistemi' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => applyKindPreset(tab.id as OpticalDeviceKind)}
              className={`px-2 py-1.5 rounded border font-semibold transition ${
                deviceKind === tab.id
                  ? 'bg-sky-600 border-sky-400 text-white'
                  : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Cihaza Özel Optik Parametreler */}
        {deviceKind === 'projector' && (
          <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              {N('Throw Ratio (TR)', throwRatio, v => setThrowRatio(Math.max(0.15, v)), '0.05')}
              <label className="block text-[11px] text-slate-300">
                En-Boy Oranı
                <select className="inp mt-0.5" value={aspectKey} onChange={e => setAspectKey(e.target.value)}>
                  {Object.keys(ASPECT_PRESETS).map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Yatay / Dikey (Portrait) Yönelim */}
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setOrient('landscape')}
                className={`py-1 rounded border font-semibold transition ${
                  orient === 'landscape'
                    ? 'bg-emerald-600/80 border-emerald-400 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                ↔ Yatay (Landscape)
              </button>
              <button
                type="button"
                onClick={() => setOrient('portrait')}
                className={`py-1 rounded border font-semibold transition ${
                  orient === 'portrait'
                    ? 'bg-emerald-600/80 border-emerald-400 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                ↕ Dikey (Portrait 90°)
              </button>
            </div>

            {/* Optik Zoom */}
            <div className="pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Optik Zoom: <b className="text-sky-300 font-mono">{zoomFactor.toFixed(2)}×</b></span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Efektif TR: {Math.max(0.15, throwRatio / Math.max(0.3, zoomFactor)).toFixed(2)}:1
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.2}
                step={0.05}
                value={zoomFactor}
                onChange={e => setZoomFactor(+e.target.value)}
                className="w-full accent-sky-500 h-1.5 mt-1 cursor-pointer"
              />
            </div>

            {/* Lens Shift (Yatay / Dikey) */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
              <label className="block text-[11px] text-slate-300">
                Yatay Shift ({Math.round(hShift * 100)}%)
                <input
                  type="range"
                  min={-0.6}
                  max={0.6}
                  step={0.02}
                  value={hShift}
                  onChange={e => setHShift(+e.target.value)}
                  className="w-full accent-emerald-500 h-1.5 mt-1 cursor-pointer"
                />
              </label>
              <label className="block text-[11px] text-slate-300">
                Dikey Shift ({Math.round(vShift * 100)}%)
                <input
                  type="range"
                  min={-0.6}
                  max={0.6}
                  step={0.02}
                  value={vShift}
                  onChange={e => setVShift(+e.target.value)}
                  className="w-full accent-emerald-500 h-1.5 mt-1 cursor-pointer"
                />
              </label>
            </div>

            {/* Dijital Keystone (V / H) */}
            <div className="pt-1 border-t border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-300">Dijital Keystone (V / H)</span>
                {(keystoneV !== 0 || keystoneH !== 0 || hShift !== 0 || vShift !== 0 || zoomFactor !== 1) && (
                  <button
                    type="button"
                    onClick={() => {
                      setZoomFactor(1);
                      setHShift(0);
                      setVShift(0);
                      setKeystoneV(0);
                      setKeystoneH(0);
                    }}
                    className="text-[9.5px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600"
                  >
                    Optiği Sıfırla
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] text-slate-300">
                  Dikey V ({keystoneV > 0 ? `+${keystoneV}` : keystoneV}°)
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    step={1}
                    value={keystoneV}
                    onChange={e => setKeystoneV(+e.target.value)}
                    className="w-full accent-amber-500 h-1.5 mt-1 cursor-pointer"
                  />
                </label>
                <label className="block text-[11px] text-slate-300">
                  Yatay H ({keystoneH > 0 ? `+${keystoneH}` : keystoneH}°)
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    step={1}
                    value={keystoneH}
                    onChange={e => setKeystoneH(+e.target.value)}
                    className="w-full accent-amber-500 h-1.5 mt-1 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {deviceKind === 'camera' && (
          <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <label className="block text-[11px] text-slate-300">
              Sensör
              <select className="inp mt-0.5" value={sensor} onChange={e => pickSensor(e.target.value)}>
                {Object.keys(SENSORS).map(k => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {N('Sensör W (mm)', sw, x => { setSw(Math.max(1, x)); setSensor('Özel'); })}
              {N('Sensör H (mm)', sh, x => { setSh(Math.max(1, x)); setSensor('Özel'); })}
              {N('Odak (mm)', focal, x => setFocal(Math.max(1, x)))}
            </div>
          </div>
        )}

        {deviceKind === 'scanner3d' && (
          <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <label className="block text-[11px] text-slate-300">
              3D Tarayıcı / Derinlik Sensörü
              <select
                className="inp mt-0.5"
                value={scannerPresetId}
                onChange={e => {
                  const id = e.target.value;
                  setScannerPresetId(id);
                  const found = SCANNER_3D_PRESETS.find(x => x.id === id);
                  if (found) {
                    setCustomHfov(found.hfovDeg);
                    setCustomVfov(found.vfovDeg);
                  }
                }}
              >
                {SCANNER_3D_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {N('HFOV (°)', customHfov, v => setCustomHfov(Math.max(2, Math.min(170, v))))}
              {N('VFOV (°)', customVfov, v => setCustomVfov(Math.max(2, Math.min(170, v))))}
            </div>
          </div>
        )}

        {deviceKind === 'vr' && (
          <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <label className="block text-[11px] text-slate-300">
              VR / XR Sistemi
              <select
                className="inp mt-0.5"
                value={vrPresetId}
                onChange={e => {
                  const id = e.target.value;
                  setVrPresetId(id);
                  const found = VR_SYSTEM_PRESETS.find(x => x.id === id);
                  if (found) {
                    setCustomHfov(found.hfovDeg);
                    setCustomVfov(found.vfovDeg);
                  }
                }}
              >
                {VR_SYSTEM_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {N('HFOV (°)', customHfov, v => setCustomHfov(Math.max(2, Math.min(170, v))))}
              {N('VFOV (°)', customVfov, v => setCustomVfov(Math.max(2, Math.min(170, v))))}
            </div>
          </div>
        )}

        {/* Hedef Yüzey Ölçüleri */}
        <div className="space-y-1.5 p-2.5 rounded bg-slate-950/70 border border-slate-800">
          <div className="text-[11px] font-bold text-amber-300">Hedef Yüzey Ölçüleri</div>
          <div className="grid grid-cols-2 gap-2">
            {N(`Yüzey Genişliği (${unit})`, subW, v => setSubW(Math.max(0.1, v)), '0.1')}
            {N(`Yüzey Yüksekliği (${unit})`, subH, v => setSubH(Math.max(0.1, v)), '0.1')}
          </div>
        </div>

        {/* 3B Cihaz Konumu ve Eğim Açıları */}
        <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-sky-300">Cihaz 3B Konumu &amp; Eğik Açılar</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = yRefMode === 'floor' ? 'center' : 'floor';
                  const curM = toMeters(posY, unit);
                  const surfHM = Math.max(0.1, toMeters(subH, unit));
                  const convertedM = next === 'floor' ? curM + surfHM / 2 : curM - surfHM / 2;
                  setPosY(round(fromMeters(convertedM, unit), 2));
                  setYRefMode(next);
                }}
                className="text-[9.5px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 hover:bg-sky-900"
                title="Yükseklik referansını Zeminden (0m) veya Perde Merkezinden (±) olarak değiştirir"
              >
                {yRefMode === 'floor' ? 'Ref: Zemin (0m)' : 'Ref: Merkez (±)'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPosX(0);
                  setPosY(yRefMode === 'floor' ? round(subH / 2, 2) : 0);
                  setYaw(0);
                  setPitch(0);
                  setRoll(0);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Sıfırla
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {N(`X Yanal (${unit})`, posX, setPosX, '0.1')}
            {N(yRefMode === 'floor' ? `Yükseklik (${unit})` : `Y Merkez (${unit})`, posY, setPosY, '0.1')}
            {N(`Z Mesafe (${unit})`, dist, v => setDist(Math.max(0.2, v)), '0.1')}
          </div>
          {yRefMode === 'floor' && !r.err && (
            <div className="text-[10px] text-slate-400 font-mono">
              Perde: 0–{subH} {unit} · Cihaz perde merkezine göre: {r.posM[1] >= 0 ? '+' : ''}{round(fromMeters(r.posM[1], unit), 2)} {unit}
            </div>
          )}
          <div className="space-y-1.5 pt-1">
            <label className="block text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>Yatay Dönme (Yaw)</span>
                <span className="font-mono text-amber-300">{yaw}°</span>
              </div>
              <input type="range" min={-60} max={60} step={1} value={yaw} onChange={e => setYaw(+e.target.value)} className="w-full accent-sky-500" />
            </label>
            <label className="block text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>Dikey Eğim (Pitch)</span>
                <span className="font-mono text-amber-300">{pitch}°</span>
              </div>
              <input type="range" min={-45} max={45} step={1} value={pitch} onChange={e => setPitch(+e.target.value)} className="w-full accent-sky-500" />
            </label>
            <label className="block text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>Eksen Dönmesi (Roll)</span>
                <span className="font-mono text-amber-300">{roll}°</span>
              </div>
              <input type="range" min={-30} max={30} step={1} value={roll} onChange={e => setRoll(+e.target.value)} className="w-full accent-sky-500" />
            </label>
          </div>
        </div>

        {/* İzleyici (Viewer FOV) & Yüzey Eğimi / Kavisi */}
        <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-300">İzleyici Konumu &amp; Yüzey Eğimi</span>
            <button
              type="button"
              onClick={() => {
                setViewerDistM(3.5);
                setViewerX(0);
                setViewerY(0);
                setSurfaceTiltDeg(0);
                setSurfaceCurvatureDeg(0);
              }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Sıfırla
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {N(`İzleyici Z (${unit})`, viewerDistM, v => setViewerDistM(Math.max(0.3, v)), '0.1')}
            {N(`İzleyici X (${unit})`, viewerX, setViewerX, '0.1')}
            {N(`İzleyici Y (${unit})`, viewerY, setViewerY, '0.1')}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="block text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>Yüzey Eğimi</span>
                <span className="font-mono text-purple-300">{surfaceTiltDeg}°</span>
              </div>
              <input type="range" min={-45} max={45} step={1} value={surfaceTiltDeg} onChange={e => setSurfaceTiltDeg(+e.target.value)} className="w-full accent-purple-500" />
            </label>
            <label className="block text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>Yüzey Kavisi</span>
                <span className="font-mono text-purple-300">{surfaceCurvatureDeg}°</span>
              </div>
              <input type="range" min={0} max={180} step={5} value={surfaceCurvatureDeg} onChange={e => setSurfaceCurvatureDeg(+e.target.value)} className="w-full accent-purple-500" />
            </label>
          </div>
        </div>
      </div>

      {/* SAĞ PANEL: FOV, EĞİK İZDÜŞÜM, KAPSAMA KONTROLÜ + 3D / 2D GÖRÜNTÜ */}
      <div className="space-y-3 min-w-0 flex flex-col">
        {r.err ? (
          <p className="p-3 rounded bg-red-950/60 border border-red-800 text-red-300">⚠ {r.err}</p>
        ) : (
          <>
            {/* Tam Kapsama Durum Bandı */}
            <div
              className={`px-3 py-2 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ${
                r.proj.isFullSurfaceCovered
                  ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200'
                  : 'bg-amber-950/50 border-amber-700 text-amber-200'
              }`}
            >
              <div className="font-semibold">
                {r.proj.isFullSurfaceCovered
                  ? `✅ Yüzeyin Tamamı Kapsanıyor (%${r.proj.coveragePct} Kapsama)`
                  : `⚠️ Yüzey Tam Kapsanmıyor (%${r.proj.coveragePct} Kapsama — Açıkta Kalan: ${r.proj.uncoveredSides.join(', ') || 'Kısmi'})`}
              </div>
              <div className="font-mono text-[11px]">
                Geliş Açısı: ∠{r.proj.incidenceAngleDeg}° · Keystone Bozulma: %{r.proj.keystoneDistortionPct}
                {r.proj.hasDigitalKeystone ? ` · Dijital Kayıp: -%${r.proj.keystonePixelLossPct}` : ''} · Taşma: %{r.proj.overflowPct}
              </div>
            </div>

            {/* 3 Ayrı FOV Paneli: Viewer FOV | Projector FOV | Surface FOV */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded bg-purple-950/30 border border-purple-700/60">
                <div className="text-[10.5px] font-bold text-purple-300 uppercase tracking-wider">1. Viewer FOV (İzleyici)</div>
                <div className="font-mono font-bold text-white text-sm mt-0.5">
                  {r.viewerFov.hfovDeg}° × {r.viewerFov.vfovDeg}° <span className="text-purple-300 text-xs">(D: {r.viewerFov.dfovDeg}°)</span>
                </div>
                <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                  Uzaklık: {u(r.viewerFov.viewerDistanceToCenterM)} · Merkez Açısı: ∠{r.viewerFov.viewerCenterAngleDeg}°
                </div>
                <div className="text-[10px] text-purple-200/80 font-mono">
                  Perspektif Sıkışması: %{r.viewerFov.perspectiveCompressionPct}
                </div>
              </div>

              <div className="p-2.5 rounded bg-sky-950/30 border border-sky-700/60">
                <div className="text-[10.5px] font-bold text-sky-300 uppercase tracking-wider">2. Projector / Optik FOV</div>
                <div className="font-mono font-bold text-white text-sm mt-0.5">
                  {r.proj.hfovDeg}° × {r.proj.vfovDeg}° <span className="text-sky-300 text-xs">(D: {r.proj.dfovDeg}°)</span>
                </div>
                <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                  Görüntü: {u(r.surfW)} × {u(r.surfH)} · Cihaz: {u(r.proj.distanceToCenterM)}
                </div>
                <div className="text-[10px] text-sky-200/80 font-mono">
                  Geliş Açısı: ∠{r.proj.incidenceAngleDeg}°
                </div>
              </div>

              <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-700/60">
                <div className="text-[10.5px] font-bold text-emerald-300 uppercase tracking-wider">3. Surface FOV (Yüzey)</div>
                <div className="font-mono font-bold text-white text-sm mt-0.5">
                  {r.surfaceFov.hfovDeg}° × {r.surfaceFov.vfovDeg}° <span className="text-emerald-300 text-xs">(D: {r.surfaceFov.dfovDeg}°)</span>
                </div>
                <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                  Eğim: {r.surfaceFov.surfaceTiltDeg}° · Kavis: {r.surfaceFov.surfaceCurvatureDeg}°
                </div>
                <div className="text-[10px] text-emerald-200/80 font-mono">
                  Perspektif Değişimi: %{r.surfaceFov.perspectiveChangePct}
                </div>
              </div>
            </div>

            {/* Metrik Kartları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded bg-slate-900 border border-slate-700">
                <div className="text-[10.5px] text-slate-400">Optik Görüş Açısı (FOV)</div>
                <div className="font-mono font-bold text-sky-300 text-sm">
                  {r.proj.hfovDeg}° × {r.proj.vfovDeg}°
                </div>
                <div className="text-[10px] text-slate-400 font-mono">Diagonal: {r.proj.dfovDeg}°</div>
              </div>

              <div className="p-2.5 rounded bg-slate-900 border border-slate-700">
                <div className="text-[10.5px] text-slate-400">Gerçek Eğik İzdüşüm Alanı</div>
                <div className="font-mono font-bold text-emerald-300 text-sm">
                  {r.proj.projectedAreaM2} m²
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Hedef: {round(r.surfW * r.surfH, 2)} m²
                </div>
              </div>

              <div className="p-2.5 rounded bg-slate-900 border border-slate-700">
                <div className="text-[10.5px] text-slate-400">Yamuk Kenar Ölçüleri (Üst/Alt)</div>
                <div className="font-mono font-bold text-amber-300 text-sm">
                  {u(r.proj.topEdgeM)} / {u(r.proj.bottomEdgeM)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Sol/Sağ: {u(r.proj.leftEdgeM)} / {u(r.proj.rightEdgeM)}
                </div>
              </div>

              <div className="p-2.5 rounded bg-slate-900 border border-slate-700">
                <div className="text-[10.5px] text-slate-400">
                  {r.camMeta ? 'Kadraj İçin Gereken Odak' : 'Cihaz → Merkez Mesafesi'}
                </div>
                <div className="font-mono font-bold text-indigo-300 text-sm">
                  {r.camMeta ? `${round(r.camMeta.needF, 1)} mm` : u(r.proj.distanceToCenterM)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {r.camMeta
                    ? `Dik Görünür: ${u(r.camMeta.visible.width)}×${u(r.camMeta.visible.height)}`
                    : `Keystone: %${r.proj.keystoneDistortionPct}`}
                </div>
              </div>
            </div>

            {/* 3D / 2D Görünüm Geçişi */}
            <div className="flex items-center justify-between">
              <div className="flex rounded overflow-hidden border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('3d')}
                  className={`px-3 py-1 font-semibold ${viewMode === '3d' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                >
                  🧊 3D Görüş Konisi &amp; Yüzey İzdüşümü
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('2d')}
                  className={`px-3 py-1 font-semibold ${viewMode === '2d' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                >
                  📐 2B Yüzey İzdüşüm Planı
                </button>
              </div>
              <span className="text-[11px] text-slate-400">
                Açıyı değiştirdiğinizde koni ve yamuk izdüşüm anlık güncellenir
              </span>
            </div>

            {viewMode === '3d' ? (
              <div className="flex-1 min-h-[420px] rounded-lg border border-slate-700 bg-slate-950 overflow-hidden relative">
                <Canvas camera={{ position: [4.5, 3.2, 7.5], fov: 48 }}>
                  <Suspense fallback={null}>
                    <FovFrustum3DScene
                      pos={r.posM}
                      surfW={r.surfW}
                      surfH={r.surfH}
                      corners3D={r.proj.corners3D}
                      activeCorners3D={r.proj.activeCorners3D}
                      hasDigitalKeystone={r.proj.hasDigitalKeystone}
                      centerHit2D={r.proj.centerHit2D}
                      isFullCovered={r.proj.isFullSurfaceCovered}
                      deviceKind={deviceKind}
                      yawDeg={yaw}
                      pitchDeg={pitch}
                      rollDeg={roll}
                      isPortrait={deviceKind === 'projector' && orient === 'portrait'}
                    />
                    <OrbitControls makeDefault />
                  </Suspense>
                </Canvas>
              </div>
            ) : (
              <SurfaceFootprint2D
                surfW={r.surfW}
                surfH={r.surfH}
                corners2D={r.proj.corners2D}
                activeCorners2D={r.proj.activeCorners2D}
                hasDigitalKeystone={r.proj.hasDigitalKeystone}
                centerHit2D={r.proj.centerHit2D}
                isFullCovered={r.proj.isFullSurfaceCovered}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SurfaceFootprint2D({
  surfW,
  surfH,
  corners2D,
  activeCorners2D,
  hasDigitalKeystone,
  centerHit2D,
  isFullCovered,
}: {
  surfW: number;
  surfH: number;
  corners2D: [number, number][];
  activeCorners2D: [number, number][];
  hasDigitalKeystone: boolean;
  centerHit2D: [number, number] | null;
  isFullCovered: boolean;
}) {
  const xs = [-surfW / 2, surfW / 2, ...corners2D.map(c => c[0]), ...activeCorners2D.map(c => c[0])];
  const ys = [-surfH / 2, surfH / 2, ...corners2D.map(c => c[1]), ...activeCorners2D.map(c => c[1])];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = span * 0.14;
  const vbX = minX - pad;
  const vbY = -maxY - pad;
  const vbW = maxX - minX + 2 * pad;
  const vbH = maxY - minY + 2 * pad;

  const rawPolyPoints = corners2D.map(([x, y]) => `${x},${-y}`).join(' ');
  const activePolyPoints = activeCorners2D.map(([x, y]) => `${x},${-y}`).join(' ');
  const accent = isFullCovered ? '#22c55e' : '#f59e0b';

  return (
    <div className="flex-1 min-h-[420px] rounded-lg border border-slate-700 bg-slate-950 p-2 flex flex-col">
      <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="w-full flex-1 max-h-[55vh]">
        <rect
          x={-surfW / 2}
          y={-surfH / 2}
          width={surfW}
          height={surfH}
          fill="#1e293b"
          stroke="#f8fafc"
          strokeWidth={span / 160}
        />
        {hasDigitalKeystone && (
          <polygon
            points={rawPolyPoints}
            fill="none"
            stroke="#94a3b8"
            strokeDasharray={`${span / 60} ${span / 80}`}
            strokeWidth={span / 160}
          />
        )}
        <polygon
          points={activePolyPoints}
          fill={accent}
          fillOpacity={0.28}
          stroke={accent}
          strokeWidth={span / 120}
        />
        {centerHit2D && (
          <circle cx={centerHit2D[0]} cy={-centerHit2D[1]} r={span / 90} fill="#38bdf8" />
        )}
      </svg>
      <p className="text-[11px] text-slate-400 px-2 pt-1">
        Beyaz dikdörtgen: Hedef yüzey ({surfW.toFixed(2)}m × {surfH.toFixed(2)}m). Renkli dörtgen: Aktif görüntü izdüşümü{hasDigitalKeystone ? ' (Kesik gri çerçeve: Ham optik ışık konisi)' : ''}.
      </p>
    </div>
  );
}
