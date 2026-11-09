import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text as DreiText, Line as DreiLine } from '@react-three/drei';
import * as THREE from 'three';
import {
  simulateRoomGlobalIllumination,
  buildStandardRoomSurfaces,
  DEFAULT_MATERIALS,
  RoomSurfaceDef,
  RoomSurfaceType,
  SurfaceMaterial,
  ProjectorGISource,
  RadiosityPatch,
  RoomGISimulationResult,
} from '../engine/globalIllumination';
import { getLuxColorRGB } from '../engine/photometrics';
import { usePhotometricStore } from '../photometricStore';
import { usePlannerStore } from '../plannerStore';

/**
 * Bir yüzeyin yamalarını renkli bir HTMLCanvasElement ısı haritasına dönüştürür.
 * Three.js Mesh üzerinde CanvasTexture olarak doğrudan kaplanır.
 */
function createHeatmapCanvasTexture(
  patches: RadiosityPatch[],
  cols: number,
  rows: number,
  mode: 'total' | 'direct' | 'indirect' | 'reflectance',
  globalMin: number,
  globalMax: number,
  bounceBoost: number = 1.0,
  usePerceptualScale: boolean = true
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const scale = 24;
  canvas.width = Math.max(128, cols * scale);
  canvas.height = Math.max(128, rows * scale);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;

    patches.forEach(p => {
      let val = p.totalLux;
      if (mode === 'direct') {
        val = p.directLux;
      } else if (mode === 'indirect') {
        val = p.indirectLux * bounceBoost;
      } else if (mode === 'total') {
        // Doğrudan ışık + güçlendirilmiş seken ışık (karanlık duvarları aydınlatmak için)
        val = p.directLux + (p.indirectLux * bounceBoost);
      } else if (mode === 'reflectance') {
        val = p.reflectance * 100;
      }

      let r = 0, g = 0, b = 0;
      if (mode === 'reflectance') {
        const grey = Math.min(255, Math.round(val * 2.55));
        r = grey;
        g = grey;
        b = grey;
      } else {
        if (usePerceptualScale && mode !== 'direct' && globalMax > globalMin) {
          // İnsan gözünün ışık algısına uygun gama/logaritmik eşleme: seken hafif ışıklar da görünür olsun
          const norm = Math.max(0, Math.min(1, (val - globalMin) / (globalMax - globalMin || 1)));
          // Karekök / gama 0.55 ile düşük lüks tonlarını canlandır
          const mappedNorm = Math.pow(norm, 0.55);
          const mappedVal = globalMin + mappedNorm * (globalMax - globalMin);
          [r, g, b] = getLuxColorRGB(mappedVal, globalMin, globalMax);
        } else {
          [r, g, b] = getLuxColorRGB(val, globalMin, globalMax);
        }
      }

      // Canvas koordinatlarında Y yukarıdan aşağı gider
      const py = (rows - 1 - p.row) * cellH;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(p.col * cellW, py, cellW + 0.5, cellH + 0.5);

      // Hücre sınır çizgisi (hafif)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(p.col * cellW, py, cellW, cellH);
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Tek bir 3B Oda Yüzeyi Meşi (Canvas Isı Haritası Kaplamalı)
 */
function GISurfaceMesh({
  surfaceDef,
  surfaceResult,
  isSelected,
  mode,
  globalMin,
  globalMax,
  bounceBoost,
  usePerceptualScale,
  onSelect,
}: {
  bounceBoost?: number;
  usePerceptualScale?: boolean;
  surfaceDef: RoomSurfaceDef;
  surfaceResult?: RoomGISimulationResult['surfaces'][0];
  isSelected: boolean;
  mode: 'total' | 'direct' | 'indirect' | 'reflectance';
  globalMin: number;
  globalMax: number;
  onSelect: (id: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const texture = useMemo(() => {
    if (!surfaceResult || surfaceResult.patches.length === 0) return null;
    return createHeatmapCanvasTexture(
      surfaceResult.patches,
      surfaceResult.cols,
      surfaceResult.rows,
      mode,
      globalMin,
      globalMax,
      bounceBoost || 1.0,
      usePerceptualScale ?? true
    );
  }, [surfaceResult, mode, globalMin, globalMax, bounceBoost, usePerceptualScale]);

  // Normal ve teğet vektörlerinden Three.js rotasyonu
  const rotationEuler = useMemo(() => {
    const norm = new THREE.Vector3(...surfaceDef.normal);
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion();

    if (Math.abs(norm.y) > 0.99) {
      // Zemin veya Tavan
      if (norm.y > 0) {
        quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      } else {
        quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      }
    } else {
      // Dikey Duvarlar
      const angle = Math.atan2(norm.x, norm.z);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    }

    const euler = new THREE.Euler().setFromQuaternion(quat);
    return euler;
  }, [surfaceDef.normal]);

  return (
    <group position={surfaceDef.centerPos} rotation={rotationEuler}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(surfaceDef.id);
        }}
      >
        <planeGeometry args={[surfaceDef.widthM, surfaceDef.heightM]} />
        {texture ? (
          <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
        ) : (
          <meshStandardMaterial
            color={surfaceDef.material.color || '#334155'}
            roughness={surfaceDef.material.roughness}
            side={THREE.DoubleSide}
          />
        )}
      </mesh>

      {/* Seçim Vurgu Çerçevesi */}
      {isSelected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.PlaneGeometry(surfaceDef.widthM + 0.05, surfaceDef.heightM + 0.05)]} />
          <lineBasicMaterial color="#fde047" linewidth={3} />
        </lineSegments>
      )}

      {/* Yüzey İsim Etiketi */}
      <DreiText
        position={[0, 0, 0.04]}
        fontSize={Math.max(0.24, Math.min(0.5, surfaceDef.widthM * 0.04))}
        color="#f8fafc"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.03}
        outlineColor="#020617"
      >
        {`${surfaceDef.name}\n[${surfaceResult ? Math.round(surfaceResult.avgTotalLux) : 0} lx]`}
      </DreiText>
    </group>
  );
}

/**
 * 3B Sahne İçi Projektör Modelleri ve Işık Konileri
 */

/**
 * 3B Yüzeyler Arası Işık Sekme Işınları (Inter-Wall Light Bounce Rays)
 * Ön projeksiyon duvarından yan duvarlara, tavana ve zemine sıçrayan ışık akışını somut çizgilerle gösterir.
 */
function InterWallBounceRays({
  surfaces,
  bounceBoost,
}: {
  surfaces: RoomSurfaceDef[];
  bounceBoost: number;
}) {
  const frontWall = surfaces.find(s => s.type === 'front_wall' || s.id === 'front_wall');
  const otherSurfaces = surfaces.filter(s => s.id !== frontWall?.id);

  if (!frontWall) return null;

  return (
    <group>
      {otherSurfaces.map(other => {
        const startPos = frontWall.centerPos;
        const endPos = other.centerPos;
        // Orta kavis noktası
        const midX = (startPos[0] + endPos[0]) / 2;
        const midY = (startPos[1] + endPos[1]) / 2 + 0.35;
        const midZ = (startPos[2] + endPos[2]) / 2;

        return (
          <group key={`bounce-${frontWall.id}-${other.id}`}>
            {/* Sekme Işını (Kavisli 3 Nokta) */}
            <DreiLine
              points={[startPos, [midX, midY, midZ], endPos]}
              color={other.type === 'floor' ? '#f59e0b' : other.type === 'ceiling' ? '#38bdf8' : '#10b981'}
              lineWidth={Math.min(4, 1.8 * bounceBoost)}
              dashed
              dashSize={0.4}
              gapSize={0.25}
              transparent
              opacity={0.75}
            />
            {/* Sekme Etiket Rozeti */}
            <DreiText
              position={[midX, midY + 0.15, midZ]}
              fontSize={0.22}
              color="#fef08a"
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.03}
              outlineColor="#020617"
            >
              {`➔ ${other.name}`}
            </DreiText>
          </group>
        );
      })}
    </group>
  );
}

function GIProjectorFrustums({ projectors }: { projectors: ProjectorGISource[] }) {
  return (
    <group>
      {projectors.map((pj) => {
        if (!pj.enabled) return null;
        const beamVec = [
          pj.target[0] - pj.pos[0],
          pj.target[1] - pj.pos[1],
          pj.target[2] - pj.pos[2],
        ] as [number, number, number];
        const dist = Math.hypot(...beamVec);
        const beamW = dist / (pj.throwRatio || 0.8);
        const beamH = beamW / 1.6;

        return (
          <group key={pj.id}>
            {/* Projektör Şasisi */}
            <mesh position={pj.pos}>
              <boxGeometry args={[0.5, 0.22, 0.5]} />
              <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.8} />
            </mesh>

            {/* Lens Camı */}
            <mesh position={[pj.pos[0], pj.pos[1], pj.pos[2] + 0.26]}>
              <cylinderGeometry args={[0.07, 0.07, 0.05, 16]} />
              <meshBasicMaterial color={pj.color || '#38bdf8'} />
            </mesh>

            {/* Optik Merkez Işını */}
            <DreiLine
              points={[pj.pos, pj.target]}
              color={pj.color || '#38bdf8'}
              lineWidth={1.5}
              dashed
              dashSize={0.3}
              gapSize={0.2}
            />

            {/* Işık Piramidi Kenar Çizgileri */}
            <DreiLine
              points={[pj.pos, [pj.target[0] - beamW / 2, pj.target[1] - beamH / 2, pj.target[2]]]}
              color={pj.color || '#38bdf8'}
              lineWidth={1}
              transparent
              opacity={0.4}
            />
            <DreiLine
              points={[pj.pos, [pj.target[0] + beamW / 2, pj.target[1] - beamH / 2, pj.target[2]]]}
              color={pj.color || '#38bdf8'}
              lineWidth={1}
              transparent
              opacity={0.4}
            />
            <DreiLine
              points={[pj.pos, [pj.target[0] + beamW / 2, pj.target[1] + beamH / 2, pj.target[2]]]}
              color={pj.color || '#38bdf8'}
              lineWidth={1}
              transparent
              opacity={0.4}
            />
            <DreiLine
              points={[pj.pos, [pj.target[0] - beamW / 2, pj.target[1] + beamH / 2, pj.target[2]]]}
              color={pj.color || '#38bdf8'}
              lineWidth={1}
              transparent
              opacity={0.4}
            />
          </group>
        );
      })}
    </group>
  );
}

export default function RoomGIScene3D() {
  const { physicalRoom, surfaces } = usePlannerStore();
  const {
    projectors,
    giBounceCount,
    giViewMode,
    giResolution,
    selectedGISurfaceId,
    surfaceMaterials,
    setGIBounceCount,
    setGIViewMode,
    setGIResolution,
    setSelectedGISurfaceId,
    setSurfaceMaterial,
  } = usePhotometricStore();

  // Yansıma / Sekme Belirginlik Çarpanı (1x fiziksel, 2x, 3x, 5x yüksek görünürlük)
  const [bounceBoost, setBounceBoost] = useState<number>(2.0);
  // Yüzeyler Arası Sekme Işın Çizgileri
  const [showBounceRays, setShowBounceRays] = useState<boolean>(true);
  // Perseptüel renk eşleme
  const [usePerceptualScale, setUsePerceptualScale] = useState<boolean>(true);

  const roomW = physicalRoom?.widthM || 23.3;
  const roomL = physicalRoom?.lengthM || 7.0;
  const roomH = physicalRoom?.heightM || 4.3;

  // 1. Komple Oda Geometrisi Tanımı
  const roomSurfaces = useMemo(() => {
    return buildStandardRoomSurfaces(roomW, roomL, roomH, surfaceMaterials);
  }, [roomW, roomL, roomH, surfaceMaterials]);

  // 2. GI Projektör Kaynakları
  const giProjectors = useMemo<ProjectorGISource[]>(() => {
    return projectors.map(p => ({
      id: p.id,
      name: p.name,
      pos: p.pos,
      target: p.target,
      ansiLumens: p.ansiLumens,
      throwRatio: p.throwRatio || 0.8,
      efficiency: p.efficiency || 0.90,
      enabled: p.enabled,
      color: p.color || '#38bdf8',
    }));
  }, [projectors]);

  // 3. Global Illumination & Işık Sekmesi Simülasyonunu Çalıştır
  const giResult = useMemo<RoomGISimulationResult>(() => {
    return simulateRoomGlobalIllumination(
      roomSurfaces,
      giProjectors,
      giBounceCount,
      giResolution
    );
  }, [roomSurfaces, giProjectors, giBounceCount, giResolution]);

  // Global Min & Max Lüks (Seken Işıklar ve Yansıma Çarpanı ile Uyumlu)
  const { globalMin, globalMax } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    giResult.surfaces.forEach(s => {
      s.patches.forEach(p => {
        let v = p.totalLux;
        if (giViewMode === 'direct') {
          v = p.directLux;
        } else if (giViewMode === 'indirect') {
          // Dolaylı ışık modunda yalnızca seken lükslerin min-max aralığı kullanılır (duvarlar kararmaz)
          v = p.indirectLux * bounceBoost;
        } else if (giViewMode === 'total') {
          v = p.directLux + (p.indirectLux * bounceBoost);
        } else if (giViewMode === 'reflectance') {
          v = p.reflectance * 100;
        }

        if (v < min) min = v;
        if (v > max) max = v;
      });
    });

    if (min === Infinity) min = 0;
    if (max <= min) max = min + 100;
    return { globalMin: min, globalMax: max };
  }, [giResult, giViewMode, bounceBoost]);

  // Seçili Yüzey
  const selectedSurfResult = useMemo(() => {
    return giResult.surfaces.find(s => s.id === selectedGISurfaceId) || giResult.surfaces[0];
  }, [giResult, selectedGISurfaceId]);

  const selectedSurfDef = useMemo(() => {
    return roomSurfaces.find(s => s.id === selectedGISurfaceId) || roomSurfaces[0];
  }, [roomSurfaces, selectedGISurfaceId]);

  return (
    <div className="flex flex-col gap-3 w-full h-full text-slate-200">
      {/* ÜST BİLGİ & KONTROL TOOLBARI */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        {/* Başlık ve Metrik Barı */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-950/80 border border-sky-500/50 text-sky-400 font-bold text-lg">
            ✨ GI
          </div>
          <div>
            <div className="font-bold text-sm text-sky-300 flex items-center gap-2">
              <span>3D Global Illumination & Işık Sekmesi Simülasyonu</span>
              <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-mono text-slate-400">
                {roomW}m × {roomL}m × {roomH}m Oda
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
              <span>Doğrudan Akı: <b className="text-sky-300">{giResult.totalDirectLumens.toLocaleString('tr-TR')} lm</b></span>
              <span>Seken Dolaylı Akı: <b className="text-emerald-300">{giResult.totalIndirectLumens.toLocaleString('tr-TR')} lm</b></span>
              <span>Sekme Katkısı: <b className="text-amber-300">+{Math.round(giResult.roomEnergyConservationRatio * 100)}%</b></span>
              <span className="text-slate-500 font-mono">({giResult.calculationTimeMs} ms)</span>
            </div>
          </div>
        </div>

        {/* Görünüm Modu ve Parametre Butonları */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Görünüm Modu */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setGIViewMode('total')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                giViewMode === 'total' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Doğrudan projektör ışığı + yüzeylerden seken tüm dolaylı ışıkların toplamı"
            >
              🔆 Toplam GI
            </button>
            <button
              onClick={() => setGIViewMode('direct')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                giViewMode === 'direct' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Sadece projektörlerden doğrudan yüzeylere düşen birincil ışık"
            >
              🎯 Doğrudan Lux
            </button>
            <button
              onClick={() => setGIViewMode('indirect')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                giViewMode === 'indirect' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Duvar, zemin ve tavandan sekerek odaya yayılan dolaylı ışık dağılımı"
            >
              🔄 Seken / Dolaylı
            </button>
            <button
              onClick={() => setGIViewMode('reflectance')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                giViewMode === 'reflectance' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Yüzeylerin fiziksel yansıtma katsayıları (Reflectance Map)"
            >
              🎨 Yansıtma (ρ)
            </button>
          </div>

          {/* Sekme Sayısı */}
          <div className="flex items-center bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs gap-1.5">
            <span className="text-[10px] text-slate-400">Sekme:</span>
            {[1, 2, 3].map(b => (
              <button
                key={b}
                onClick={() => setGIBounceCount(b)}
                className={`w-5 h-5 rounded text-[10.5px] font-bold font-mono transition ${
                  giBounceCount === b ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Çözünürlük */}
          <div className="flex items-center bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs gap-1">
            <span className="text-[10px] text-slate-400">Grid:</span>
            {(['coarse', 'medium', 'fine'] as const).map(res => (
              <button
                key={res}
                onClick={() => setGIResolution(res)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
                  giResolution === res ? 'bg-slate-700 text-white font-bold' : 'text-slate-500 hover:text-white'
                }`}
              >
                {res === 'coarse' ? 'Hızlı' : res === 'medium' ? 'Dengeli' : 'Hassas'}
              </button>
            ))}
          </div>

          {/* 🌟 Yansıma Vurgusu (Bounce Boost) */}
          <div className="flex items-center bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs gap-1" title="Yan duvarlara ve tavana seken ışıkların görsel belirginliğini artırır">
            <span className="text-[10px] text-amber-400 font-semibold">Yansıma:</span>
            {[1, 2, 3, 5].map(b => (
              <button
                key={b}
                onClick={() => setBounceBoost(b)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition ${
                  bounceBoost === b ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {b}x
              </button>
            ))}
          </div>

          {/* 🌟 Sekme Işın Çizgileri Toggle */}
          <button
            onClick={() => setShowBounceRays(!showBounceRays)}
            className={`px-2 py-1 rounded-lg text-[10.5px] font-semibold border transition ${
              showBounceRays
                ? 'bg-amber-950/80 border-amber-500/60 text-amber-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Ön duvardan yan duvarlara, tavana ve zemine sıçrayan ışık akış çizgilerini açıp kapatır"
          >
            {showBounceRays ? '⚡ Sekme Çizgileri: Açık' : '⚡ Sekme Çizgileri: Kapalı'}
          </button>
        </div>
      </div>

      {/* ANA 3B SAHNE & SEÇİLİ YÜZEY MÜFETTİŞİ */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 flex-1 min-h-[520px]">
        {/* 3B ÜÇ BOYUTLU WEBGL ODA SAHNESİ */}
        <div className="lg:col-span-3 bg-slate-950 border border-slate-800 rounded-xl relative overflow-hidden flex flex-col">
          <Canvas
            camera={{ position: [roomW * 0.75, roomH * 1.5, roomL * 1.3], fov: 50, near: 0.1, far: 200 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
          >
            <color attach="background" args={['#030712']} />
            <ambientLight intensity={0.4} />
            <pointLight position={[0, roomH * 0.9, 0]} intensity={0.3} />

            <OrbitControls makeDefault enableDamping dampingFactor={0.08} />

            {/* Zemin Izgarası */}
            <Grid
              args={[roomW * 2, roomL * 2]}
              position={[0, -0.01, 0]}
              cellColor="#1e293b"
              sectionColor="#334155"
              infiniteGrid
              fadeDistance={60}
            />

            {/* TÜM ODA YÜZEYLERİ (CanvasTexture Isı Haritası Kaplamalı) */}
            {roomSurfaces.map(surfDef => {
              const sRes = giResult.surfaces.find(s => s.id === surfDef.id);
              return (
                <GISurfaceMesh
                  key={surfDef.id}
                  surfaceDef={surfDef}
                  surfaceResult={sRes}
                  isSelected={surfDef.id === selectedGISurfaceId}
                  mode={giViewMode}
                  globalMin={globalMin}
                  globalMax={globalMax}
                  bounceBoost={bounceBoost}
                  usePerceptualScale={usePerceptualScale}
                  onSelect={setSelectedGISurfaceId}
                />
              );
            })}

            {/* PROJEKTÖR MODELLERİ VE IŞIK KONİLERİ */}
            {/* YÜZEYLER ARASI SEKME IŞINLARI */}
            {showBounceRays && (
              <InterWallBounceRays surfaces={roomSurfaces} bounceBoost={bounceBoost} />
            )}

            {/* PROJEKTÖR MODELLERİ VE IŞIK KONİLERİ */}
            <GIProjectorFrustums projectors={giProjectors} />
          </Canvas>

          {/* Sol Alt Renk Skalası Bilgisi */}
          <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-lg text-[10.5px] text-slate-300 pointer-events-none shadow-lg flex items-center gap-3">
            <span className="font-bold text-sky-400">💡 3B Global Illumination:</span>
            <span>Odadaki herhangi bir duvara veya zemine tıklayarak lüks ve sekme değerlerini inceleyebilirsiniz.</span>
            <span className="font-mono text-slate-400">Skala: {Math.round(globalMin)} lx → {Math.round(globalMax)} lx</span>
          </div>
        </div>

        {/* SAĞ PANEL: SEÇİLİ YÜZEY MÜFETTİŞİ & MALZEME YANSITMA KONTROLLERİ */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-3 shadow-lg">
          <div className="space-y-3">
            {/* Yüzey Seçici Dropdown */}
            <div>
              <label className="block text-[11px] text-slate-400 font-semibold mb-1 uppercase">İncelenen Oda Yüzeyi:</label>
              <select
                value={selectedGISurfaceId}
                onChange={(e) => setSelectedGISurfaceId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-medium focus:ring-1 focus:ring-sky-500 focus:outline-none"
              >
                {roomSurfaces.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.widthM}m × {s.heightM}m)
                  </option>
                ))}
              </select>
            </div>

            {/* SEÇİLİ YÜZEY FOTOMETRİK LUX KARTLARI */}
            <div className="space-y-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Doğrudan Işık (Direct):</span>
                <span className="font-mono font-bold text-sky-400">
                  {Math.round(selectedSurfResult?.avgDirectLux || 0)} Lux
                </span>
              </div>

              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Seken / Dolaylı (Indirect):</span>
                <span className="font-mono font-bold text-emerald-400">
                  +{Math.round(selectedSurfResult?.avgIndirectLux || 0)} Lux
                </span>
              </div>

              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-1.5">
                <span className="font-semibold text-slate-200">Toplam Aydınlık (Total):</span>
                <span className="font-mono font-bold text-amber-300 text-sm">
                  {Math.round(selectedSurfResult?.avgTotalLux || 0)} Lux
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                <span>Min / Max:</span>
                <span className="font-mono text-slate-300">
                  {Math.round(selectedSurfResult?.minTotalLux || 0)} / {Math.round(selectedSurfResult?.maxTotalLux || 0)} lx
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Homojenlik (U0):</span>
                <span className="font-mono text-emerald-400 font-bold">
                  %{( (selectedSurfResult?.uniformityU0 || 0) * 100).toFixed(1)}
                </span>
              </div>
            </div>

            {/* MALZEME VE YANSITMA (REFLECTANCE) AYARLARI */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Yüzey Malzemesi:</span>
                <span className="text-xs font-mono font-bold text-purple-400">
                  %{(selectedSurfDef.material.diffuseReflectance * 100).toFixed(0)} Yansıtma
                </span>
              </div>

              {/* Hazır Malzeme Presetleri */}
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(DEFAULT_MATERIALS).map(([key, mat]) => {
                  const isCurrent = Math.abs(selectedSurfDef.material.diffuseReflectance - mat.diffuseReflectance) < 0.01;
                  return (
                    <button
                      key={key}
                      onClick={() => setSurfaceMaterial(selectedSurfDef.type, mat)}
                      className={`p-1.5 rounded text-left border text-[10.5px] transition flex items-center gap-1.5 ${
                        isCurrent
                          ? 'bg-purple-950/80 border-purple-500 text-purple-200 font-bold shadow'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
                        style={{ backgroundColor: mat.color }}
                      />
                      <span className="truncate">{mat.name.split('(')[0].trim()}</span>
                    </button>
                  );
                })}
              </div>

              {/* Özel Yansıtma Kaydırıcısı */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>Özel Yansıtma Katsayısı (ρ):</span>
                  <span className="font-mono text-slate-200">
                    %{(selectedSurfDef.material.diffuseReflectance * 100).toFixed(0)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.02"
                  max="0.95"
                  step="0.01"
                  value={selectedSurfDef.material.diffuseReflectance}
                  onChange={(e) => {
                    const newRef = Number(e.target.value);
                    setSurfaceMaterial(selectedSurfDef.type, {
                      ...selectedSurfDef.material,
                      diffuseReflectance: newRef,
                    });
                  }}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-500 mt-0.5 font-mono">
                  <span>%2 (Siyah)</span>
                  <span>%50 (Gri)</span>
                  <span>%95 (Beyaz)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Alt Fiziksel Açıklama */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10.5px] text-slate-400 leading-relaxed">
            <span className="font-bold text-amber-400">📌 Fiziksel Doğruluk Notu:</span> Malzeme yansıtma katsayısını değiştirdiğinizde, yüzeyden seken ışık miktarı (Radiosity $B = \rho \cdot E$) ve diğer duvarlara ulaşan dolaylı aydınlık anında yeniden simüle edilir.
          </div>
        </div>
      </div>
      {/* 🌟 TÜM ODA DUVARLARI ARASI IŞIK SEKME VE YANSIMA MATRİSİ */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-base text-amber-400">📊</span>
            <h4 className="font-bold text-xs sm:text-sm text-slate-100 uppercase tracking-wider">
              Tüm Duvarların Birbirine Yansıyan Işıkları ve Sekme Matrisi
            </h4>
            <span className="text-[10px] bg-sky-950 text-sky-300 px-2 py-0.5 rounded border border-sky-800 font-mono">
              {roomSurfaces.length} Oda Yüzeyi
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Doğrudan ışığın çarptığı ön duvardan yan duvarlara, tavana ve zemine seken ışık dökümü
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                <th className="py-2 px-3 font-semibold">Oda Yüzeyi</th>
                <th className="py-2 px-3 font-semibold">Boyut (G×Y)</th>
                <th className="py-2 px-3 font-semibold">Malzeme / Yansıtma (ρ)</th>
                <th className="py-2 px-3 font-semibold text-right text-sky-400">Doğrudan Lux (Direct)</th>
                <th className="py-2 px-3 font-semibold text-right text-emerald-400">Seken / Dolaylı (Indirect)</th>
                <th className="py-2 px-3 font-semibold text-right text-amber-300">Toplam Aydınlık (Total)</th>
                <th className="py-2 px-3 font-semibold text-right">Sekme Katkısı</th>
                <th className="py-2 px-3 font-center">İncele</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {roomSurfaces.map(surf => {
                const sRes = giResult.surfaces.find(s => s.id === surf.id);
                const dirLux = Math.round(sRes?.avgDirectLux || 0);
                const indLux = Math.round(sRes?.avgIndirectLux || 0);
                const totLux = Math.round(sRes?.avgTotalLux || 0);
                const bounceShare = totLux > 0 ? Math.round((indLux / totLux) * 100) : 0;
                const isSelected = surf.id === selectedGISurfaceId;

                return (
                  <tr
                    key={surf.id}
                    onClick={() => setSelectedGISurfaceId(surf.id)}
                    className={`cursor-pointer transition hover:bg-slate-800/50 ${
                      isSelected ? 'bg-sky-950/40 border-l-2 border-sky-400' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-sans font-medium text-slate-200 flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: surf.material.color }}
                      />
                      <span>{surf.name}</span>
                      {surf.type === 'front_wall' && (
                        <span className="text-[9px] bg-sky-900/60 text-sky-300 px-1.5 py-0.2 rounded font-mono">
                          Projeksiyon Duvarı
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-400">
                      {surf.widthM}m × {surf.heightM}m
                    </td>
                    <td className="py-2 px-3 text-slate-300 font-sans">
                      {surf.material.name.split('(')[0].trim()}{' '}
                      <span className="text-purple-400 font-mono font-bold">
                        (%{(surf.material.diffuseReflectance * 100).toFixed(0)})
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-sky-400 font-bold">
                      {dirLux > 0 ? `${dirLux} lx` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                      +{indLux} lx
                    </td>
                    <td className="py-2 px-3 text-right text-amber-300 font-bold text-sm">
                      {totLux} lx
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        bounceShare > 50 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-slate-400'
                      }`}>
                        %{bounceShare}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center font-sans">
                      <button
                        type="button"
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                          isSelected ? 'bg-sky-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {isSelected ? 'Seçili' : 'Seç'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
