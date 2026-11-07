import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { download } from '../util';
import type { CalculatedSurface } from './ContentPlanner';

interface PlannerRoom3DProps {
  surfaces: CalculatedSurface[];
  selectedId: string;
  onSelect: (id: string) => void;
}

const PROJ_COLORS = ['#38bdf8', '#facc15', '#4ade80', '#f472b6', '#a78bfa', '#fb923c'];

/**
 * Tek bir projektör cihazı + 3B Işık Konisi (Frustum) + Duvardaki Görüntü Çerçevesi + Kaç m Açtığı Etiketi
 */
function ProjectorFrustum3D({
  pos,
  targetCenter,
  upVec,
  rightVec,
  imgW,
  imgH,
  throwDist,
  color,
  label,
  detailText,
  showLabels,
}: {
  pos: [number, number, number];
  targetCenter: [number, number, number];
  upVec: [number, number, number];
  rightVec: [number, number, number];
  imgW: number;
  imgH: number;
  throwDist: number;
  color: string;
  label: string;
  detailText: string;
  showLabels: boolean;
}) {
  const { beamGeo, corners, lookQuat } = useMemo(() => {
    const p = new THREE.Vector3(...pos);
    const c = new THREE.Vector3(...targetCenter);
    const u = new THREE.Vector3(...upVec).normalize();
    const r = new THREE.Vector3(...rightVec).normalize();

    const halfW = imgW / 2;
    const halfH = imgH / 2;

    // 4 Köşe (Sol-Üst, Sağ-Üst, Sağ-Alt, Sol-Alt)
    const c0 = c.clone().addScaledVector(r, -halfW).addScaledVector(u, halfH);
    const c1 = c.clone().addScaledVector(r, halfW).addScaledVector(u, halfH);
    const c2 = c.clone().addScaledVector(r, halfW).addScaledVector(u, -halfH);
    const c3 = c.clone().addScaledVector(r, -halfW).addScaledVector(u, -halfH);

    const pts = [c0, c1, c2, c3];

    // Piramit (Frustum) yan yüzey üçgenleri
    const verts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      verts.push(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();

    // Projektör gövdesi yönelimi
    const m = new THREE.Matrix4().lookAt(p, c, u);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);

    return {
      beamGeo: g,
      corners: pts.map(v => [v.x, v.y, v.z] as [number, number, number]),
      lookQuat: q,
    };
  }, [pos, targetCenter, upVec, rightVec, imgW, imgH]);

  const midBeamPos: [number, number, number] = [
    (pos[0] + targetCenter[0]) / 2,
    (pos[1] + targetCenter[1]) / 2 + 0.18,
    (pos[2] + targetCenter[2]) / 2,
  ];

  return (
    <group>
      {/* Projektör Cihaz Gövdesi */}
      <group position={pos} quaternion={lookQuat}>
        <mesh>
          <boxGeometry args={[0.42, 0.16, 0.48]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Lens */}
        <mesh position={[0, 0, -0.26]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.07, 0.08, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
        </mesh>
      </group>

      {/* Yarı Saydam Işık Konisi (Frustum) */}
      <mesh geometry={beamGeo}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.13}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Köşe Işın Çizgileri */}
      {corners.map((corner, idx) => (
        <Line
          key={`ray-${idx}`}
          points={[pos, corner]}
          color={color}
          lineWidth={1.4}
          transparent
          opacity={0.65}
        />
      ))}

      {/* Duvardaki / Yüzeydeki Açılan Görüntü Çerçevesi */}
      <Line
        points={[corners[0], corners[1], corners[2], corners[3], corners[0]]}
        color={color}
        lineWidth={2.2}
      />

      {/* Projektör Üstü ve Duvardaki Ölçü Etiketleri */}
      {showLabels && (
        <>
          <Text
            position={[pos[0], pos[1] + 0.28, pos[2]]}
            fontSize={0.22}
            color="#f8fafc"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.025}
            outlineColor="#020617"
          >
            {`${label} (D=${throwDist}m)`}
          </Text>

          <Text
            position={midBeamPos}
            fontSize={0.19}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#020617"
          >
            {detailText}
          </Text>
        </>
      )}
    </group>
  );
}

export default function PlannerRoom3D({ surfaces, selectedId, onSelect }: PlannerRoom3DProps) {
  const [showBeams, setShowBeams] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showHuman, setShowHuman] = useState(true);
  const [viewFilter, setViewFilter] = useState<'all' | 'selected'>('all');
  const [includeHudOnExport, setIncludeHudOnExport] = useState(true);

  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);

  const activeSurf = surfaces.find(s => s.id === selectedId) || surfaces[0];

  // Oda / Sahne 3B Geometri ve Projektör Konumlarını Hesapla
  const sceneData = useMemo(() => {
    const walls = surfaces.filter(s => s.type === 'wall');
    const floor = surfaces.find(s => s.type === 'floor');
    const ceiling = surfaces.find(s => s.type === 'ceiling');

    // Özel tekil geometriler var mı? (Silindir, Küre, Kubbe, Kavis)
    const specialSurf = surfaces.find(
      s => s.geometry === 'cylinder_360' || s.geometry === 'sphere' || s.geometry === 'dome' || s.geometry === 'concave_arc'
    );

    // Oda genişliği (X), uzunluğu (Z) ve yüksekliği (Y)
    const roomLengthZ = walls[0]?.effectiveWidthM || floor?.effectiveWidthM || 20;
    const roomWidthX = walls[1]?.effectiveWidthM || floor?.effectiveHeightM || 7;
    const roomHeightY = walls[0]?.effectiveHeightM || 4.3;

    return {
      walls,
      floor,
      ceiling,
      specialSurf,
      roomLengthZ,
      roomWidthX,
      roomHeightY,
    };
  }, [surfaces]);

  // Hazır Kamera Bakış Açılarına Geçiş
  const setCameraPreset = (preset: 'iso' | 'top' | 'front' | 'left' | 'right' | 'inside') => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;

    const maxDim = Math.max(sceneData.roomLengthZ, sceneData.roomWidthX, 12);
    if (preset === 'iso') {
      cam.position.set(maxDim * 0.85, maxDim * 0.65, maxDim * 0.95);
      ctrl.target.set(0, sceneData.roomHeightY * 0.4, 0);
    } else if (preset === 'top') {
      cam.position.set(0, maxDim * 1.45, 0.01);
      ctrl.target.set(0, 0, 0);
    } else if (preset === 'front') {
      cam.position.set(0, sceneData.roomHeightY * 0.8, maxDim * 1.15);
      ctrl.target.set(0, sceneData.roomHeightY * 0.5, 0);
    } else if (preset === 'left') {
      cam.position.set(-maxDim * 1.15, sceneData.roomHeightY * 0.8, 0);
      ctrl.target.set(0, sceneData.roomHeightY * 0.5, 0);
    } else if (preset === 'right') {
      cam.position.set(maxDim * 1.15, sceneData.roomHeightY * 0.8, 0);
      ctrl.target.set(0, sceneData.roomHeightY * 0.5, 0);
    } else if (preset === 'inside') {
      cam.position.set(0, 1.7, sceneData.roomLengthZ * 0.25);
      ctrl.target.set(0, 2.0, -sceneData.roomLengthZ * 0.4);
    }
    cam.updateProjectionMatrix();
    ctrl.update();
  };

  // Mevcut 3B Bakış Açısını Yüksek Çözünürlüklü PNG Olarak İndir
  const exportCurrent3DViewPng = () => {
    const gl = glRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!gl || !scene || !camera) return;

    // Güncel kareyi zorla render et
    gl.render(scene, camera);
    const srcCanvas = gl.domElement;

    const outCanvas = document.createElement('canvas');
    const bannerH = includeHudOnExport ? 110 : 0;
    outCanvas.width = srcCanvas.width;
    outCanvas.height = srcCanvas.height + bannerH;

    const ctx = outCanvas.getContext('2d')!;
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

    // 3B WebGL görüntüsünü çiz
    ctx.drawImage(srcCanvas, 0, 0);

    // Alt Teknik Bilgi Anteti (HUD)
    if (includeHudOnExport && activeSurf) {
      const y0 = srcCanvas.height;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, y0, outCanvas.width, bannerH);

      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(outCanvas.width, y0);
      ctx.stroke();

      const fsTitle = Math.max(15, Math.round(outCanvas.width / 72));
      const fsSub = Math.max(12, Math.round(outCanvas.width / 92));

      ctx.fillStyle = '#38bdf8';
      ctx.font = `bold ${fsTitle}px sans-serif`;
      ctx.fillText(
        `3B ODA & PROJEKSİYON ATIM SİMÜLASYONU — ${activeSurf.name.toUpperCase()} (${activeSurf.effectiveWidthM}m × ${activeSurf.effectiveHeightM}m)`,
        24,
        y0 + 32
      );

      ctx.fillStyle = '#4ade80';
      ctx.font = `bold ${fsSub}px monospace`;
      ctx.fillText(
        `İçerik Pixel Map: ${activeSurf.netW} × ${activeSurf.netH} px (Oran ${activeSurf.aspectContent}:1)  |  Duvar Piksel Boyutu: ${activeSurf.avgMmPerPx} mm/px (${activeSurf.pxPerMeterW} px/m · ${activeSurf.ppi} PPI)`,
        24,
        y0 + 62
      );

      ctx.fillStyle = '#facc15';
      ctx.font = `${fsSub}px monospace`;
      ctx.fillText(
        `PJ Uzaklık: D = ${activeSurf.throwDistM}m  |  Lens TR = ${activeSurf.throwRatio}:1  |  1 PJ Açılımı: ${activeSurf.singleProjWidthM}m × ${activeSurf.singleProjHeightM}m (${activeSurf.distMmPerPx} mm/px)  |  Dizilim: ${activeSurf.cols}×${activeSurf.rows} PJ  |  İzleyici: ${activeSurf.viewDistM}m (İdeal ≤${activeSurf.idealMuseumMmPerPx}mm)`,
        24,
        y0 + 90
      );
    }

    outCanvas.toBlob(blob => {
      if (blob) {
        const safeName = (activeSurf?.name || 'oda').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        download(`3d-simulasyon-${safeName}-${Date.now().toString().slice(-4)}.png`, blob);
      }
    }, 'image/png');
  };

  return (
    <div className="flex flex-col h-full w-full space-y-2">
      {/* ÜST 3B SİMÜLASYON KONTROL, KAMERA AÇILARI VE PNG ÇIKIŞ BARI */}
      <div className="flex flex-wrap justify-between items-center gap-2 bg-slate-900/90 p-2 rounded border border-slate-800 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-amber-400">🎥 3B Projeksiyon Simülasyonu:</span>
          <div className="flex rounded overflow-hidden border border-slate-700 bg-slate-950 p-0.5">
            <button
              onClick={() => setViewFilter('all')}
              className={`px-2 py-0.5 rounded font-semibold ${
                viewFilter === 'all' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tüm Oda Projektörleri
            </button>
            <button
              onClick={() => setViewFilter('selected')}
              className={`px-2 py-0.5 rounded font-semibold ${
                viewFilter === 'selected' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sadece Seçili Yüzey ({activeSurf?.name})
            </button>
          </div>

          {/* Hazır Kamera Bakış Açıları */}
          <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
            <span className="text-slate-400 text-[10px]">Bakış Açısı:</span>
            <button onClick={() => setCameraPreset('iso')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">
              Perspektif
            </button>
            <button onClick={() => setCameraPreset('top')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">
              Üstten (Plan)
            </button>
            <button onClick={() => setCameraPreset('front')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">
              Ön
            </button>
            <button onClick={() => setCameraPreset('left')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">
              Sol
            </button>
            <button onClick={() => setCameraPreset('right')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">
              Sağ
            </button>
            <button onClick={() => setCameraPreset('inside')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[10px]">
              İzleyici Gözü
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-1 cursor-pointer text-slate-300">
            <input type="checkbox" checked={showBeams} onChange={e => setShowBeams(e.target.checked)} />
            <span>Işık Konileri</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-slate-300">
            <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
            <span>Ölçü Etiketleri</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-slate-300">
            <input type="checkbox" checked={showHuman} onChange={e => setShowHuman(e.target.checked)} />
            <span>İzleyici ({activeSurf?.viewDistM}m)</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-sky-300" title="İndirilen 3B PNG altına teknik özet barı ekler">
            <input type="checkbox" checked={includeHudOnExport} onChange={e => setIncludeHudOnExport(e.target.checked)} />
            <span>PNG Teknik Antet</span>
          </label>
          <button
            onClick={exportCurrent3DViewPng}
            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow flex items-center gap-1"
          >
            <span>📸 Bu 3B Bakış Açısını PNG İndir</span>
          </button>
        </div>
      </div>

      {/* SEÇİLİ YÜZEYİN OPTİK SİMÜLASYON BİLGİ ŞERİDİ */}
      {activeSurf && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/70 p-2 rounded border border-sky-900/60 font-mono text-[11px]">
          <div>
            <span className="text-slate-400 block text-[10px]">Seçili Yüzey & Açınım:</span>
            <b className="text-sky-300">{activeSurf.name} ({activeSurf.effectiveWidthM}m × {activeSurf.effectiveHeightM}m)</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Projektör Atım Uzaklığı (D) & Lens:</span>
            <b className="text-amber-300">D = {activeSurf.throwDistM}m | Lens TR = {activeSurf.throwRatio}:1</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">1 Projektörün Duvarda Açtığı Boyut:</span>
            <b className="text-emerald-400">{activeSurf.singleProjWidthM}m × {activeSurf.singleProjHeightM}m ({activeSurf.distMmPerPx} mm/px)</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">{activeSurf.cols}×{activeSurf.rows} PJ Toplam Optik Kapsama:</span>
            <b className={activeSurf.totalOpticalWidthM >= activeSurf.effectiveWidthM * 0.98 ? 'text-emerald-400' : 'text-rose-400'}>
              {activeSurf.totalOpticalWidthM}m Genişlik {activeSurf.totalOpticalWidthM >= activeSurf.effectiveWidthM * 0.98 ? '✓ (Tam Dolduruyor)' : `⚠ (${activeSurf.effectiveWidthM}m için Eksik)`}
            </b>
          </div>
        </div>
      )}

      {/* 3B WEBGL SAHNESİ (preserveDrawingBuffer: true ile anlık PNG yakalama aktif) */}
      <div className="flex-1 min-h-[480px] w-full rounded border border-slate-800 bg-slate-950 relative overflow-hidden">
        <Canvas
          camera={{ position: [18, 14, 22], fov: 48, near: 0.1, far: 500 }}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          dpr={[1, 2]}
          onCreated={({ gl, scene, camera }) => {
            glRef.current = gl;
            sceneRef.current = scene;
            cameraRef.current = camera as THREE.PerspectiveCamera;
          }}
        >
          <color attach="background" args={['#070b14']} />
          <ambientLight intensity={0.75} />
          <directionalLight position={[12, 20, 10]} intensity={0.9} />
          <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} />

          <Grid
            args={[60, 60]}
            position={[0, -0.02, 0]}
            cellColor="#1e293b"
            sectionColor="#334155"
            infiniteGrid
            fadeDistance={55}
          />

          <Suspense fallback={null}>
            {/* DURUM 1: ÖZEL GEOMETRİLER (360° SİLİNDİR, KAVİSLİ DUVAR, KUBBE, KÜRE) */}
            {sceneData.specialSurf ? (
              <SpecialGeometryScene
                surf={sceneData.specialSurf}
                floorSurf={sceneData.floor}
                showBeams={showBeams}
                showLabels={showLabels}
                showHuman={showHuman}
                onSelect={onSelect}
              />
            ) : (
              /* DURUM 2: ÇOK DUVARLI KUTU / U-ODA VE ZEMİN MİMARİSİ */
              <RoomBoxScene
                surfaces={surfaces}
                selectedId={selectedId}
                viewFilter={viewFilter}
                roomWidthX={sceneData.roomWidthX}
                roomLengthZ={sceneData.roomLengthZ}
                roomHeightY={sceneData.roomHeightY}
                showBeams={showBeams}
                showLabels={showLabels}
                showHuman={showHuman}
                onSelect={onSelect}
              />
            )}
          </Suspense>
        </Canvas>

        <div className="absolute bottom-2 left-2 bg-slate-950/85 border border-slate-800 px-2.5 py-1.5 rounded text-[10px] text-slate-300 pointer-events-none">
          🖱️ <b>Sol Tık + Sürükle:</b> 360° Döndür &nbsp;|&nbsp; <b>Sağ Tık + Sürükle:</b> Kaydır (Pan) &nbsp;|&nbsp; <b>Tekerlek:</b> Yakınlaş/Uzaklaş &nbsp;|&nbsp; <b>Duvara Tıkla:</b> Yüzey Seç
        </div>
      </div>
    </div>
  );
}

/**
 * Standart Kutu / U-Oda (1. Sol Duvar, 2. Ön Duvar, 3. Sağ Duvar, 4. Arka Duvar ve Zemin) 3B Yerleşimi
 */
function RoomBoxScene({
  surfaces,
  selectedId,
  viewFilter,
  roomWidthX,
  roomLengthZ,
  roomHeightY,
  showBeams,
  showLabels,
  showHuman,
  onSelect,
}: {
  surfaces: CalculatedSurface[];
  selectedId: string;
  viewFilter: 'all' | 'selected';
  roomWidthX: number;
  roomLengthZ: number;
  roomHeightY: number;
  showBeams: boolean;
  showLabels: boolean;
  showHuman: boolean;
  onSelect: (id: string) => void;
}) {
  const walls = surfaces.filter(s => s.type === 'wall');
  const floor = surfaces.find(s => s.type === 'floor');

  // Duvarların 3B uzaydaki pozisyon, yönelim ve normal vektörlerini çıkar
  const wallPlacements = useMemo(() => {
    return walls.map((w, idx) => {
      const len = w.effectiveWidthM;
      const h = w.effectiveHeightM;

      // idx 0: Sol Uzun Duvar (x = -roomWidthX/2, z: -len/2..+len/2, normal +X)
      if (idx === 0) {
        return {
          surf: w,
          center: [-roomWidthX / 2, h / 2, 0] as [number, number, number],
          rot: [0, Math.PI / 2, 0] as [number, number, number],
          normal: [1, 0, 0] as [number, number, number],
          rightDir: [0, 0, -1] as [number, number, number],
          upDir: [0, 1, 0] as [number, number, number],
        };
      }
      // idx 1: Ön Kısa Duvar (z = -roomLengthZ/2, x: -len/2..+len/2, normal +Z)
      if (idx === 1) {
        return {
          surf: w,
          center: [0, h / 2, -roomLengthZ / 2] as [number, number, number],
          rot: [0, 0, 0] as [number, number, number],
          normal: [0, 0, 1] as [number, number, number],
          rightDir: [1, 0, 0] as [number, number, number],
          upDir: [0, 1, 0] as [number, number, number],
        };
      }
      // idx 2: Sağ Uzun Duvar (x = +roomWidthX/2, z: -len/2..+len/2, normal -X)
      if (idx === 2) {
        return {
          surf: w,
          center: [roomWidthX / 2, h / 2, 0] as [number, number, number],
          rot: [0, -Math.PI / 2, 0] as [number, number, number],
          normal: [-1, 0, 0] as [number, number, number],
          rightDir: [0, 0, 1] as [number, number, number],
          upDir: [0, 1, 0] as [number, number, number],
        };
      }
      // idx 3+: Arka Kısa Duvar (z = +roomLengthZ/2, normal -Z)
      return {
        surf: w,
        center: [0, h / 2, roomLengthZ / 2] as [number, number, number],
        rot: [0, Math.PI, 0] as [number, number, number],
        normal: [0, 0, -1] as [number, number, number],
        rightDir: [-1, 0, 0] as [number, number, number],
        upDir: [0, 1, 0] as [number, number, number],
      };
    });
  }, [walls, roomWidthX, roomLengthZ]);

  const activePlacement = wallPlacements.find(wp => wp.surf.id === selectedId) || wallPlacements[0];

  return (
    <group>
      {/* 1. DUVAR YÜZEYLERİ VE PROJEKTÖRLERİ */}
      {wallPlacements.map((wp, wIdx) => {
        const { surf, center, rot, normal, rightDir, upDir } = wp;
        const isSel = surf.id === selectedId;
        const showThisProjectors = showBeams && (viewFilter === 'all' || isSel);
        const col = PROJ_COLORS[wIdx % PROJ_COLORS.length];

        // Bu duvara bakan projektörlerin konumlarını hesapla
        const projItems: {
          pos: [number, number, number];
          target: [number, number, number];
          label: string;
        }[] = [];

        if (showThisProjectors) {
          const singleW = surf.singleProjWidthM;
          const singleH = surf.singleProjHeightM;
          const ovRatioX = surf.projW > 0 ? surf.ovPxX / surf.projW : 0.15;
          const stepW = singleW * (1 - ovRatioX);
          const totalOptW = surf.cols === 1 ? singleW : singleW + (surf.cols - 1) * stepW;

          for (let r = 0; r < surf.rows; r++) {
            for (let c = 0; c < surf.cols; c++) {
              const offsetRight =
                surf.cols === 1
                  ? 0
                  : -totalOptW / 2 + singleW / 2 + c * stepW;
              const offsetUp =
                surf.rows === 1
                  ? 0
                  : ((surf.rows - 1) / 2 - r) * (singleH * 0.85);

              // Duvardaki hedef merkez noktası
              const tx = center[0] + rightDir[0] * offsetRight + upDir[0] * offsetUp;
              const ty = center[1] + rightDir[1] * offsetRight + upDir[1] * offsetUp;
              const tz = center[2] + rightDir[2] * offsetRight + upDir[2] * offsetUp;

              // Projektör tavana yakın (y = surf.effectiveHeightM - 0.15) ve duvardan throwDistM uzaklıkta
              const px = tx + normal[0] * surf.throwDistM;
              const py = Math.max(2.2, surf.effectiveHeightM - 0.15) + offsetUp * 0.3;
              const pz = tz + normal[2] * surf.throwDistM;

              projItems.push({
                pos: [px, py, pz],
                target: [tx, ty, tz],
                label: `PJ ${ c + 1 }${surf.rows > 1 ? `.${r + 1}` : ''}`,
              });
            }
          }
        }

        return (
          <group key={surf.id}>
            {/* Duvar Mesh */}
            <group
              position={center}
              rotation={rot}
              onClick={e => {
                e.stopPropagation();
                onSelect(surf.id);
              }}
            >
              <mesh>
                <planeGeometry args={[surf.effectiveWidthM, surf.effectiveHeightM]} />
                <meshStandardMaterial
                  color={isSel ? '#0284c7' : surf.color}
                  transparent
                  opacity={isSel ? 0.42 : 0.24}
                  side={THREE.DoubleSide}
                />
              </mesh>

              {/* Duvar Çerçevesi */}
              <Line
                points={[
                  [-surf.effectiveWidthM / 2, -surf.effectiveHeightM / 2, 0],
                  [surf.effectiveWidthM / 2, -surf.effectiveHeightM / 2, 0],
                  [surf.effectiveWidthM / 2, surf.effectiveHeightM / 2, 0],
                  [-surf.effectiveWidthM / 2, surf.effectiveHeightM / 2, 0],
                  [-surf.effectiveWidthM / 2, -surf.effectiveHeightM / 2, 0],
                ]}
                color={isSel ? '#facc15' : surf.color}
                lineWidth={isSel ? 3 : 1.5}
              />

              {/* Duvar Üstü Bilgi Yazısı */}
              <Text
                position={[0, surf.effectiveHeightM / 2 + 0.45, 0.05]}
                fontSize={0.36}
                color={isSel ? '#facc15' : '#f8fafc'}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.03}
                outlineColor="#020617"
              >
                {`${surf.name} (${surf.effectiveWidthM}m × ${surf.effectiveHeightM}m → ${surf.netW}×${surf.netH}px | ${surf.avgMmPerPx} mm/px)`}
              </Text>
            </group>

            {/* Bu Duvara Ait Projektörler ve Işık Konileri */}
            {projItems.map((item, pIdx) => (
              <ProjectorFrustum3D
                key={`proj-${surf.id}-${pIdx}`}
                pos={item.pos}
                targetCenter={item.target}
                upVec={upDir}
                rightVec={rightDir}
                imgW={surf.singleProjWidthM}
                imgH={surf.singleProjHeightM}
                throwDist={surf.throwDistM}
                color={col}
                label={item.label}
                detailText={`${surf.singleProjWidthM}m×${surf.singleProjHeightM}m (${surf.distMmPerPx}mm/px)`}
                showLabels={showLabels}
              />
            ))}
          </group>
        );
      })}

      {/* 2. ZEMİN (FLOOR) YÜZEYİ VE TAVAN PROJEKTÖRLERİ */}
      {floor && (
        <group>
          <mesh
            position={[0, 0.01, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={e => {
              e.stopPropagation();
              onSelect(floor.id);
            }}
          >
            <planeGeometry args={[floor.effectiveHeightM, floor.effectiveWidthM]} />
            <meshStandardMaterial
              color={floor.id === selectedId ? '#eab308' : floor.color}
              transparent
              opacity={floor.id === selectedId ? 0.38 : 0.2}
              side={THREE.DoubleSide}
            />
          </mesh>

          <Text
            position={[0, 0.08, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.42}
            color="#fde047"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.03}
            outlineColor="#020617"
          >
            {`${floor.name}: ${floor.effectiveWidthM}m × ${floor.effectiveHeightM}m (${floor.netW}×${floor.netH}px · ${floor.avgMmPerPx} mm/px)`}
          </Text>

          {/* Zemin Projektörleri (Tavandan Zemine Dik Atım) */}
          {showBeams && (viewFilter === 'all' || floor.id === selectedId) && (() => {
            const items: JSX.Element[] = [];
            const singleW = floor.singleProjWidthM;
            const singleH = floor.singleProjHeightM;
            const stepZ = floor.cols > 1 ? (floor.effectiveWidthM - singleW) / (floor.cols - 1) : 0;
            const stepX = floor.rows > 1 ? (floor.effectiveHeightM - singleH) / (floor.rows - 1) : 0;

            for (let r = 0; r < floor.rows; r++) {
              for (let c = 0; c < floor.cols; c++) {
                const tz = floor.cols === 1 ? 0 : -floor.effectiveWidthM / 2 + singleW / 2 + c * stepZ;
                const tx = floor.rows === 1 ? 0 : -floor.effectiveHeightM / 2 + singleH / 2 + r * stepX;

                items.push(
                  <ProjectorFrustum3D
                    key={`floor-pj-${r}-${c}`}
                    pos={[tx, floor.throwDistM, tz]}
                    targetCenter={[tx, 0.02, tz]}
                    upVec={[1, 0, 0]}
                    rightVec={[0, 0, 1]}
                    imgW={singleW}
                    imgH={singleH}
                    throwDist={floor.throwDistM}
                    color="#facc15"
                    label={`Zemin PJ ${c + 1}.${r + 1}`}
                    detailText={`${singleW}m×${singleH}m`}
                    showLabels={showLabels}
                  />
                );
              }
            }
            return items;
          })()}
        </group>
      )}

      {/* 3. İZLEYİCİ (İNSAN MODELİ) VE BAKIŞ MESAFESİ ÇİZGİSİ */}
      {showHuman && activePlacement && (() => {
        const { surf, center, normal } = activePlacement;
        const hx = center[0] + normal[0] * surf.viewDistM;
        const hz = center[2] + normal[2] * surf.viewDistM;
        const wallPt: [number, number, number] = [center[0], 1.65, center[2]];
        const eyePt: [number, number, number] = [hx, 1.65, hz];

        return (
          <group>
            {/* İnsan Silüeti (1.75m boy) */}
            <group position={[hx, 0, hz]}>
              <mesh position={[0, 0.85, 0]}>
                <capsuleGeometry args={[0.22, 1.25, 8, 16]} />
                <meshStandardMaterial color="#10b981" />
              </mesh>
              <mesh position={[0, 1.68, 0]}>
                <sphereGeometry args={[0.14, 16, 16]} />
                <meshStandardMaterial color="#6ee7b7" />
              </mesh>
              <Text
                position={[0, 2.1, 0]}
                fontSize={0.24}
                color="#4ade80"
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.025}
                outlineColor="#020617"
              >
                {`İzleyici (${surf.viewDistM}m → İdeal ≤${surf.idealMuseumMmPerPx}mm)`}
              </Text>
            </group>

            {/* Göz Hizasından Duvara Bakış Mesafesi Çizgisi */}
            <Line
              points={[eyePt, wallPt]}
              color="#10b981"
              lineWidth={2}
              dashed
              dashSize={0.25}
              gapSize={0.15}
            />
          </group>
        );
      })()}
    </group>
  );
}

/**
 * Özel Mimari Geometriler İçin 3B Sahne (360° Silindir, İçbükey Kavis, Kubbe, Küre)
 */
function SpecialGeometryScene({
  surf,
  floorSurf,
  showBeams,
  showLabels,
  showHuman,
  onSelect,
}: {
  surf: CalculatedSurface;
  floorSurf?: CalculatedSurface;
  showBeams: boolean;
  showLabels: boolean;
  showHuman: boolean;
  onSelect: (id: string) => void;
}) {
  const r = surf.radiusM;
  const h = surf.heightM;
  const arcAngleRad =
    surf.geometry === 'concave_arc' ? THREE.MathUtils.degToRad(surf.angleDeg) : Math.PI * 2;

  return (
    <group>
      {/* 1. KAVİSLİ DUVAR VEYA 360° SİLİNDİR */}
      {(surf.geometry === 'cylinder_360' || surf.geometry === 'concave_arc') && (
        <group>
          <mesh
            position={[0, h / 2, 0]}
            onClick={e => {
              e.stopPropagation();
              onSelect(surf.id);
            }}
          >
            <cylinderGeometry
              args={[
                r,
                r,
                h,
                64,
                1,
                true,
                surf.geometry === 'concave_arc' ? -arcAngleRad / 2 + Math.PI : 0,
                arcAngleRad,
              ]}
            />
            <meshStandardMaterial
              color={surf.color}
              transparent
              opacity={0.32}
              side={THREE.DoubleSide}
            />
          </mesh>

          <Text
            position={[0, h + 0.6, 0]}
            fontSize={0.42}
            color="#38bdf8"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.03}
            outlineColor="#020617"
          >
            {`${surf.name} | R=${r}m (Açınım: ${surf.effectiveWidthM}m × ${h}m → ${surf.netW}×${surf.netH}px)`}
          </Text>

          {/* Çevresel Projektörler */}
          {showBeams &&
            Array.from({ length: surf.cols }).map((_, idx) => {
              const startAng = surf.geometry === 'concave_arc' ? -arcAngleRad / 2 + Math.PI : 0;
              const step =
                surf.geometry === 'concave_arc'
                  ? arcAngleRad / Math.max(1, surf.cols)
                  : (Math.PI * 2) / Math.max(1, surf.cols);
              const theta = startAng + (idx + 0.5) * step;

              // Duvardaki hedef nokta
              const tx = Math.sin(theta) * r;
              const ty = h / 2;
              const tz = Math.cos(theta) * r;

              // Merkeze doğru normal vektör
              const nx = -Math.sin(theta);
              const nz = -Math.cos(theta);

              // Projektör konumu: duvardan throwDistM geride
              const px = tx + nx * surf.throwDistM;
              const py = Math.max(2.2, h - 0.2);
              const pz = tz + nz * surf.throwDistM;

              // Teğet (sağ) vektör
              const rx = Math.cos(theta);
              const rz = -Math.sin(theta);

              return (
                <ProjectorFrustum3D
                  key={`cyl-pj-${idx}`}
                  pos={[px, py, pz]}
                  targetCenter={[tx, ty, tz]}
                  upVec={[0, 1, 0]}
                  rightVec={[rx, 0, rz]}
                  imgW={surf.singleProjWidthM}
                  imgH={surf.singleProjHeightM}
                  throwDist={surf.throwDistM}
                  color={PROJ_COLORS[idx % PROJ_COLORS.length]}
                  label={`PJ #${idx + 1}`}
                  detailText={`${surf.singleProjWidthM}m (${surf.distMmPerPx}mm/px)`}
                  showLabels={showLabels}
                />
              );
            })}
        </group>
      )}

      {/* 2. KUBBE (DOME) VEYA TAM KÜRE (SPHERE) */}
      {(surf.geometry === 'dome' || surf.geometry === 'sphere') && (
        <group position={[0, surf.geometry === 'sphere' ? r : 0, 0]}>
          <mesh
            onClick={e => {
              e.stopPropagation();
              onSelect(surf.id);
            }}
          >
            <sphereGeometry
              args={[
                r,
                48,
                32,
                0,
                Math.PI * 2,
                0,
                surf.geometry === 'dome' ? Math.PI / 2 : Math.PI,
              ]}
            />
            <meshStandardMaterial
              color={surf.color}
              transparent
              opacity={0.28}
              side={THREE.DoubleSide}
              wireframe={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry
              args={[
                r * 1.002,
                24,
                16,
                0,
                Math.PI * 2,
                0,
                surf.geometry === 'dome' ? Math.PI / 2 : Math.PI,
              ]}
            />
            <meshBasicMaterial color={surf.color} wireframe transparent opacity={0.22} />
          </mesh>

          <Text
            position={[0, r + 0.8, 0]}
            fontSize={0.45}
            color="#c084fc"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.03}
            outlineColor="#020617"
          >
            {`${surf.name} | Çap=${r * 2}m (${surf.netW}×${surf.netH}px · ${surf.avgMmPerPx} mm/px)`}
          </Text>
        </group>
      )}

      {/* DAİRESEL ZEMİN VARSA */}
      {floorSurf && (
        <mesh
          position={[0, 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={e => {
            e.stopPropagation();
            onSelect(floorSurf.id);
          }}
        >
          <circleGeometry args={[floorSurf.radiusM, 64]} />
          <meshStandardMaterial color={floorSurf.color} transparent opacity={0.25} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* İZLEYİCİ */}
      {showHuman && (
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.85, 0]}>
            <capsuleGeometry args={[0.22, 1.25, 8, 16]} />
            <meshStandardMaterial color="#10b981" />
          </mesh>
          <mesh position={[0, 1.68, 0]}>
            <sphereGeometry args={[0.14, 16, 16]} />
            <meshStandardMaterial color="#6ee7b7" />
          </mesh>
        </group>
      )}
    </group>
  );
}
