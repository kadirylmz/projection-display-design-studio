import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LengthUnit, toMeters, round } from '../engine/units';
import {
  simulatePhotometricLux,
  parseIES,
  getLuxColorRGB,
  Projector3DConfig,
  Surface3DConfig,
  PhotometricSimulationResult,
  SurfaceGeometryType
} from '../engine/photometrics';
import { usePlannerStore } from '../plannerStore';
import { usePhotometricStore } from '../photometricStore';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text as DreiText, Line as DreiLine } from '@react-three/drei';
import * as THREE from 'three';
import RoomGIScene3D from './RoomGIScene3D';
import QuickOpticsLuxCalculator from './QuickOpticsLuxCalculator';

interface ScenarioComparisonItem {
  name: string;
  lumens: number;
  distanceM: number;
  avgLux: number;
  minLux: number;
  maxLux: number;
  u0: number;
  u1: number;
  nits: number;
  contrast: number;
}

/**
 * 3B Mekansal Fotometrik Görünüm (Three.js Simülasyonu)
 * 25m duvardaki her projektörün havada asılı olduğu konumu ve ışık konisi (frustum) piramidini gösterir.
 */
function Photometric3DScene({
  surface,
  projectors,
  simResult,
}: {
  surface: Surface3DConfig;
  projectors: Projector3DConfig[];
  simResult?: PhotometricSimulationResult;
}) {
  const halfW = surface.widthM / 2;
  const halfH = surface.heightM / 2;

  // Duvara kaplanacak 3D Lüks Isı Haritası Texture'ı
  const heatmapTexture = useMemo(() => {
    if (!simResult || !simResult.grid || simResult.grid.length === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(256, simResult.cols * 16);
    canvas.height = Math.max(256, simResult.rows * 16);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cellW = canvas.width / simResult.cols;
    const cellH = canvas.height / simResult.rows;
    const min = simResult.minLux;
    const max = Math.max(min + 1, simResult.maxLux);

    for (let r = 0; r < simResult.rows; r++) {
      for (let c = 0; c < simResult.cols; c++) {
        const idx = r * simResult.cols + c;
        const cell = simResult.grid[idx];
        const val = cell ? cell.totalLux : 0;
        const [red, green, blue] = getLuxColorRGB(val, min, max);

        // Three.js UV koordinatında Y aşağıdan yukarıdır, Canvas'ta yukarıdan aşağıdır.
        const py = (simResult.rows - 1 - r) * cellH;
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(c * cellW, py, cellW + 0.5, cellH + 0.5);

        // İnce ızgara çizgisi
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(c * cellW, py, cellW, cellH);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, [simResult]);

  return (
    <div className="relative w-full h-[520px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      <Canvas
        camera={{ position: [0, surface.heightM * 1.1, Math.max(8, surface.widthM * 0.75)], fov: 48 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
      >
        <color attach="background" args={['#070b14']} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[10, 20, 15]} intensity={0.8} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2 - 0.01} />
        <Grid
          position={[0, 0, 0]}
          args={[Math.max(35, surface.widthM * 1.5), Math.max(25, surface.widthM * 1.2)]}
          cellSize={1}
          cellThickness={0.8}
          cellColor="#1e293b"
          sectionSize={5}
          sectionThickness={1.5}
          sectionColor="#334155"
          fadeDistance={60}
        />

        {/* Projeksiyon Yüzeyi (Duvar / Zemin) – Canlı Isı Haritası Kaplamalı */}
        <group position={[0, halfH, 0]}>
          <mesh>
            <planeGeometry args={[surface.widthM, surface.heightM]} />
            {heatmapTexture ? (
              <meshBasicMaterial map={heatmapTexture} side={THREE.DoubleSide} />
            ) : (
              <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.1} side={THREE.DoubleSide} />
            )}
          </mesh>
          <DreiLine
            points={[
              [-halfW, -halfH, 0.01],
              [halfW, -halfH, 0.01],
              [halfW, halfH, 0.01],
              [-halfW, halfH, 0.01],
              [-halfW, -halfH, 0.01]
            ]}
            color="#38bdf8"
            lineWidth={3.5}
          />
          <DreiText
            position={[0, halfH + 0.35, 0]}
            fontSize={0.36}
            color="#38bdf8"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.04}
            outlineColor="#020617"
          >
            {`PROJEKSİYON YÜZEYİ (${surface.widthM}m × ${surface.heightM}m)`}
          </DreiText>
        </group>

        {/* Projektörler ve Renkli Işık Piramitleri (Frustum Beams) */}
        {projectors.filter(p => p.enabled).map((pj, idx) => {
          const tr = pj.throwRatio || 0.8;
          const dist = Math.abs(pj.pos[2]) || 4.5;
          const beamW = dist / tr;
          const beamH = beamW / 1.7778; // 16:9
          const beamPts: [number, number, number][] = [
            [pj.target[0] - beamW / 2, pj.target[1] + beamH / 2, pj.target[2] + 0.02],
            [pj.target[0] + beamW / 2, pj.target[1] + beamH / 2, pj.target[2] + 0.02],
            [pj.target[0] + beamW / 2, pj.target[1] - beamH / 2, pj.target[2] + 0.02],
            [pj.target[0] - beamW / 2, pj.target[1] - beamH / 2, pj.target[2] + 0.02],
          ];

          return (
            <group key={pj.id}>
              {/* Projektör Gövdesi */}
              <mesh position={pj.pos}>
                <boxGeometry args={[0.55, 0.24, 0.55]} />
                <meshStandardMaterial color={pj.color || '#38bdf8'} metalness={0.6} roughness={0.3} />
              </mesh>
              {/* Lens */}
              <mesh position={[pj.pos[0], pj.pos[1], pj.pos[2] - 0.3]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.08, 0.09, 0.1, 16]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
              {/* Cihaz Etiketi */}
              <DreiText
                position={[pj.pos[0], pj.pos[1] + 0.35, pj.pos[2]]}
                fontSize={0.28}
                color={pj.color || '#ffffff'}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.03}
                outlineColor="#020617"
              >
                {`PJ ${idx + 1}: ${pj.name.split('(')[0].trim()} (TR: ${pj.throwRatio}:1)`}
              </DreiText>

              {/* Duvardaki Işık Ayak İzi (Footprint Quad) */}
              <DreiLine
                points={[beamPts[0], beamPts[1], beamPts[2], beamPts[3], beamPts[0]]}
                color={pj.color || '#ffffff'}
                lineWidth={3}
              />

              {/* 4 Köşe Işın Çizgisi */}
              {beamPts.map((corner, cIdx) => (
                <DreiLine
                  key={cIdx}
                  points={[pj.pos, corner]}
                  color={pj.color || '#ffffff'}
                  lineWidth={1.6}
                  transparent
                  opacity={0.65}
                />
              ))}
            </group>
          );
        })}
      </Canvas>

      {/* 3D Bilgi Notu & Renk Skalası */}
      <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-700 px-3 py-2 rounded-lg text-xs text-slate-300 pointer-events-none shadow-lg flex flex-wrap items-center gap-4">
        <div>
          <span className="font-bold text-sky-400">💡 3B Mekansal Lux Haritası:</span> Duvar üzerinde hesaplanan gerçek lüks ısı haritası renklendirilmiştir.
        </div>
        {simResult && (
          <div className="flex items-center gap-2 pl-3 border-l border-slate-700 font-mono text-[11px]">
            <span className="text-blue-400">{Math.round(simResult.minLux)} lx</span>
            <div className="w-24 h-2.5 rounded bg-gradient-to-r from-blue-600 via-emerald-500 via-amber-400 to-red-500 border border-slate-700" />
            <span className="text-red-400">{Math.round(simResult.maxLux)} lx</span>
            <span className="text-slate-400 ml-1">Ort: <b className="text-emerald-300">{Math.round(simResult.avgLux)} lx</b></span>
          </div>
        )}
      </div>
    </div>
  );
}


export function getFootprint(pj: Projector3DConfig, surface: Surface3DConfig) {
  const safeW = Math.max(0.1, surface.widthM || 0);
  const safeH = Math.max(0.1, surface.heightM || 0);
  const halfW = safeW / 2;
  const halfH = safeH / 2;
  const tr = Math.max(0.2, pj.throwRatio || 0.8);
  const dist = Math.hypot(
    pj.pos[0] - pj.target[0],
    pj.pos[1] - pj.target[1],
    pj.pos[2] - pj.target[2]
  ) || 4.5;
  const beamW = dist / tr;
  const beamH = beamW / 1.6;

  const centerX = pj.target[0] + halfW;
  let centerY = pj.target[1];
  if (surface.geometry === 'floor' || surface.geometry === 'ceiling') {
    centerY = pj.target[2] + halfH;
  }

  const startX = Math.max(0, centerX - beamW / 2);
  const endX = Math.min(safeW, centerX + beamW / 2);
  const startY = Math.max(0, centerY - beamH / 2);
  const endY = Math.min(safeH, centerY + beamH / 2);

  return { dist, beamW, beamH, centerX, centerY, startX, endX, startY, endY };
}

export default function LuxCalculator({ unit }: { unit: LengthUnit }) {
  // Proje Store (İçerik Planlama Yüzeyleri)
  const plannerSurfaces = usePlannerStore(state => state.surfaces);

  // Kalıcı Fotometrik Zustand Store
  const {
    selectedSurfaceId,
    screenW,
    screenH,
    geometry,
    curveRadius,
    curveAngle,
    inclineAngle,
    screenGain,
    surfaceReflectance,
    ambientLux,
    gridRes,
    projectors,
    selectedProjId,
    blendOverlap,
    showHotDarkSpots,
    showIsoContours,
    showProjectorOutlines,
    viewMode,
    activeTab,
    advancedMode,
    defaultProjectorLumens,
    setScreenW,
    setScreenH,
    setGeometry,
    setCurveRadius,
    setCurveAngle,
    setInclineAngle,
    setScreenGain,
    setSurfaceReflectance,
    setAmbientLux,
    setGridRes,
    setProjectors,
    setSelectedProjId,
    setDefaultProjectorLumens,
    setBlendOverlap,
    setShowHotDarkSpots,
    setShowIsoContours,
    setShowProjectorOutlines,
    setViewMode,
    setActiveTab,
    setAdvancedMode,
    isManualLux,
    manualAvgLux,
    manualMinLux,
    manualMaxLux,
    setIsManualLux,
    setManualAvgLux,
    setManualMinLux,
    setManualMaxLux,
    surfacePhotometrics,
    saveSurfacePhotometric,
    importFromPlannerSurface,
    updateSelectedProjector,
    addProjector,
    removeProjector
  } = usePhotometricStore();

  // İlk açılışta projede tanımlı yüzey varsa otomatik senkronize et
  useEffect(() => {
    if (selectedSurfaceId === 'custom' && plannerSurfaces.length > 0 && projectors.length <= 2) {
      importFromPlannerSurface(plannerSurfaces[0], defaultProjectorLumens);
    }
  }, [plannerSurfaces, selectedSurfaceId, importFromPlannerSurface, defaultProjectorLumens, projectors.length]);

  // Basit Hesaplama vs Detaylı Fotometrik Modu
  const [calcMode, setCalcMode] = useState<'quick_report' | 'advanced'>(() => {
    try {
      const saved = localStorage.getItem('lux_active_calc_mode');
      if (saved === 'quick_report' || saved === 'advanced') return saved as 'quick_report' | 'advanced';
    } catch (e) {}
    return 'quick_report';
  });

  useEffect(() => {
    try {
      localStorage.setItem('lux_active_calc_mode', calcMode);
    } catch (e) {}
  }, [calcMode]);

  // Hover Durumu (Isı Haritası Tooltip)
  const [hoveredCell, setHoveredCell] = useState<{
    xM: number;
    yM: number;
    lux: number;
    nits: number;
    overlapCount: number;
    perProjLux: number[];
  } | null>(null);

  // Canvas Ref
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlapCanvasRef = useRef<HTMLCanvasElement>(null);


  // Grid Ölçüleri
  const [cols, rows] = useMemo(() => {
    switch (gridRes) {
      case '15x10': return [15, 10];
      case '50x30': return [50, 30];
      case '80x45': return [80, 45];
      case '30x20':
      default: return [30, 20];
    }
  }, [gridRes]);

  // Yüzey Konfigürasyonu
  const surfaceConfig: Surface3DConfig = useMemo(() => {
    const wM = toMeters(screenW, unit);
    const hM = toMeters(screenH, unit);
    return {
      widthM: wM,
      heightM: hM,
      geometry,
      radiusM: curveRadius,
      curveAngleDeg: curveAngle,
      inclineAngleDeg: inclineAngle,
      screenGain,
      reflectance: surfaceReflectance,
      ambientLux
    };
  }, [screenW, screenH, geometry, curveRadius, curveAngle, inclineAngle, screenGain, surfaceReflectance, ambientLux, unit]);

  // Aktif projektörler
  const activeProjectors = useMemo(() => projectors.filter(p => p.enabled), [projectors]);

  // Simülasyon Çalıştırma
  const simResult: PhotometricSimulationResult = useMemo(() => {
    return simulatePhotometricLux(
      surfaceConfig,
      projectors,
      cols,
      rows,
      blendOverlap
    );
  }, [surfaceConfig, projectors, cols, rows, blendOverlap]);

  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Projektör Ayak İzleri & Çoklu Satır/Sıra Dağılım Analizi
  const distributionData = useMemo(() => {
    const fpList = activeProjectors.map((pj, idx) => {
      const fp = getFootprint(pj, surfaceConfig);
      return { pj, idx, ...fp };
    });

    const rowsMap = new Map<number, typeof fpList>();
    fpList.forEach(item => {
      const rowKey = Math.round(item.centerY * 2) / 2;
      if (!rowsMap.has(rowKey)) rowsMap.set(rowKey, []);
      rowsMap.get(rowKey)!.push(item);
    });

    const sortedRowKeys = Array.from(rowsMap.keys()).sort((a, b) => a - b);
    const isMultiRow = sortedRowKeys.length > 1;

    const resultRows: (typeof fpList[0] & { rowName?: string; overlapInfo: string; yOverlapInfo?: string })[] = [];

    sortedRowKeys.forEach((rKey, rIdx) => {
      const rowItems = rowsMap.get(rKey)!.sort((a, b) => a.centerX - b.centerX);
      const rowName = isMultiRow ? `Sıra ${rIdx + 1}` : undefined;

      rowItems.forEach((curr, cIdx) => {
        let overlapInfo = '— (Kenar)';
        if (cIdx < rowItems.length - 1) {
          const next = rowItems[cIdx + 1];
          const ovW = curr.endX - next.startX;
          if (ovW > 0) {
            const ovPct = Math.round((ovW / Math.max(0.1, curr.beamW)) * 100);
            overlapInfo = `${ovW.toFixed(2)}m (%${ovPct} Blend PJ ${next.idx + 1} ile)`;
          }
        }

        let yOverlapInfo: string | undefined = undefined;
        if (isMultiRow && rIdx < sortedRowKeys.length - 1) {
          const nextRowKey = sortedRowKeys[rIdx + 1];
          const nextRowItems = rowsMap.get(nextRowKey)!;
          const matchingUnder = nextRowItems.find(item => Math.abs(item.centerX - curr.centerX) < curr.beamW * 0.4);
          if (matchingUnder) {
            const ovH = curr.endY - matchingUnder.startY;
            if (ovH > 0) {
              const ovPct = Math.round((ovH / Math.max(0.1, curr.beamH)) * 100);
              yOverlapInfo = `${ovH.toFixed(2)}m (%${ovPct} Dikey Blend PJ ${matchingUnder.idx + 1} ile)`;
            }
          }
        }

        resultRows.push({
          ...curr,
          rowName,
          overlapInfo: yOverlapInfo ? `${overlapInfo} | ↕ ${yOverlapInfo}` : overlapInfo,
          yOverlapInfo,
        });
      });
    });

    return { rows: resultRows, isMultiRow, sortedRowKeys, rowsMap };
  }, [activeProjectors, surfaceConfig]);

  // Manuel & Efektif Fotometrik Metrikler
  const effAvgLux = isManualLux ? manualAvgLux : simResult.avgLux;
  const effMinLux = isManualLux ? manualMinLux : simResult.minLux;
  const effMaxLux = isManualLux ? manualMaxLux : simResult.maxLux;
  const effU0 = isManualLux ? (effMinLux / Math.max(1, effAvgLux)) : simResult.uniformityU0;
  const effU1 = isManualLux ? (effMinLux / Math.max(1, effMaxLux)) : simResult.uniformityU1;
  const effNits = isManualLux ? ((effAvgLux * screenGain) / Math.PI) : simResult.avgLuminanceNits;
  const effFL = isManualLux ? (effNits * 0.2919) : simResult.avgLuminanceFL;
  const effACR = isManualLux ? ((effAvgLux + ambientLux) / Math.max(1, ambientLux)) : simResult.ambientContrastRatio;

  // Rapora Kaydet Fonksiyonu
  const handleSaveToReport = useCallback(() => {
    let snapshotUrl: string | undefined = undefined;
    if (heatmapCanvasRef.current) {
      try {
        snapshotUrl = heatmapCanvasRef.current.toDataURL('image/png');
      } catch (err) {
        console.warn('Canvas snapshot error:', err);
      }
    }

    const distRowsForReport = distributionData.rows.map(r => ({
      code: `PJ ${r.idx + 1}`,
      name: r.pj.name,
      rowName: r.rowName,
      startX: r.startX,
      endX: r.endX,
      widthM: r.beamW,
      centerX: r.centerX,
      throwDistM: r.dist,
      throwRatio: r.pj.throwRatio || 0.8,
      overlapText: r.overlapInfo,
    }));

    const currentSurf = plannerSurfaces.find(s => s.id === selectedSurfaceId);
    const surfName = currentSurf ? currentSurf.name : `Özel Yüzey (${surfaceConfig.widthM}m × ${surfaceConfig.heightM}m)`;
    const surfType = currentSurf ? currentSurf.type : (geometry === 'floor' ? 'floor' : geometry === 'ceiling' ? 'ceiling' : 'wall');

    saveSurfacePhotometric({
      surfaceId: selectedSurfaceId,
      surfaceName: surfName,
      surfaceType: surfType,
      widthM: surfaceConfig.widthM,
      heightM: surfaceConfig.heightM,
      projectorCount: activeProjectors.length,
      avgLux: effAvgLux,
      minLux: effMinLux,
      maxLux: effMaxLux,
      uniformityU0: effU0,
      uniformityU1: effU1,
      luminanceNits: effNits,
      luminanceFL: effFL,
      screenGain: screenGain,
      ambientLux: ambientLux,
      ambientContrastRatio: effACR,
      isManualLux: isManualLux,
      heatmapSnapshotUrl: snapshotUrl,
      distributionRows: distRowsForReport,
    });

    setSaveToast(`✓ "${surfName}" 2B Isı Haritası ve Lux Analizi Raporlama Modülüne Eklendi!`);
    setTimeout(() => setSaveToast(null), 4000);
  }, [selectedSurfaceId, plannerSurfaces, surfaceConfig, geometry, activeProjectors.length, effAvgLux, effMinLux, effMaxLux, effU0, effU1, effNits, effFL, screenGain, ambientLux, effACR, isManualLux, distributionData.rows, saveSurfacePhotometric]);




  // Canvas Çizimi (Heatmap)
  useEffect(() => {
    if (activeTab !== 'heatmap') return;

    const render = () => {
      const canvas = heatmapCanvasRef.current;
      if (!canvas || !simResult) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const safeW = Math.max(0.1, surfaceConfig.widthM || 0);
      const safeH = Math.max(0.1, surfaceConfig.heightM || 0);
      const targetW = 720;
      const targetH = Math.max(220, Math.min(720, Math.round(targetW * (safeH / safeW))));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cellW = w / simResult.cols;
      const cellH = h / simResult.rows;

      // Hangi projektörün gösterileceği (Tümü, Bireysel veya Dominant)
      const isSolo = viewMode !== 'combined' && viewMode !== 'dominant';
      const soloProjIdx = isSolo ? activeProjectors.findIndex(p => p.id === viewMode) : -1;

      let min = simResult.minLux;
      let max = simResult.maxLux;

      if (isSolo && soloProjIdx >= 0) {
        // Yalnızca seçili projektörün lüks skalası
        const values = simResult.grid.map(c => c.perProjectorLux[soloProjIdx] || 0);
        min = Math.min(...values);
        max = Math.max(...values);
      }

      // Grid Hücrelerini Çiz
      for (let r = 0; r < simResult.rows; r++) {
        for (let c = 0; c < simResult.cols; c++) {
          const idx = r * simResult.cols + c;
          const cell = simResult.grid[idx];
          if (!cell) continue;

          let cellLux = cell.totalLux;

          if (isSolo && soloProjIdx >= 0) {
            cellLux = cell.perProjectorLux[soloProjIdx] || 0;
          }

          if (viewMode === 'dominant') {
            // Hangi projektörün baskın olduğunu gösteren renk modu
            let maxPjVal = 0;
            let maxPjColor = '#0f172a';
            cell.perProjectorLux.forEach((lx, i) => {
              if (lx > maxPjVal && activeProjectors[i]) {
                maxPjVal = lx;
                maxPjColor = activeProjectors[i].color || '#38bdf8';
              }
            });

            if (cell.overlapCount > 1) {
              // Örtüşme alanı: Canlı mor/pembe vurgusu
              ctx.fillStyle = 'rgba(217, 70, 239, 0.75)';
            } else if (maxPjVal > 10) {
              ctx.fillStyle = maxPjColor;
            } else {
              ctx.fillStyle = '#0f172a';
            }
          } else {
            const [red, green, blue] = getLuxColorRGB(cellLux, min, max);
            ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
          }

          const drawY = h - (r + 1) * cellH;
          ctx.fillRect(c * cellW, drawY, cellW + 0.5, cellH + 0.5);
        }
      }

      // Iso Contour çizgileri
      if (showIsoContours && max > min && viewMode !== 'dominant') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        const numSteps = 5;
        for (let s = 1; s < numSteps; s++) {
          const threshold = min + (s / numSteps) * (max - min);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '9px monospace';
          ctx.fillText(`${Math.round(threshold)} lx`, 8, (s / numSteps) * h);
        }
      }

      // 🌟 PROJEKTÖR KAPSAMA ALANLARI & ÇERÇEVELERİ (FOOTPRINTS)
      if (showProjectorOutlines) {
        activeProjectors.forEach((pj, pIdx) => {
          if (isSolo && pj.id !== viewMode) return;

          const fp = getFootprint(pj, surfaceConfig);
          const px1 = (fp.startX / safeW) * w;
          const px2 = (fp.endX / safeW) * w;
          const pyTop = ((safeH - fp.endY) / safeH) * h;
          const pyBottom = ((safeH - fp.startY) / safeH) * h;

          const boxW = Math.max(4, px2 - px1);
          const boxH = Math.max(4, pyBottom - pyTop);

          ctx.save();
          ctx.strokeStyle = pj.color || '#38bdf8';
          ctx.lineWidth = 2.2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(px1, pyTop, boxW, boxH);

          // Optik Merkez Artısı (+)
          const pcx = (fp.centerX / safeW) * w;
          const pcy = ((safeH - fp.centerY) / safeH) * h;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(pcx - 8, pcy);
          ctx.lineTo(pcx + 8, pcy);
          ctx.moveTo(pcx, pcy - 8);
          ctx.lineTo(pcx, pcy + 8);
          ctx.stroke();

          // Başlık Rozeti: PJ 1 [0.0m - 6.5m]
          const badgeText = `PJ ${pIdx + 1}: ${pj.name.split('(')[0].trim()} [${fp.startX.toFixed(1)}m – ${fp.endX.toFixed(1)}m]`;
          ctx.font = 'bold 11px sans-serif';
          const textMetrics = ctx.measureText(badgeText);
          const badgeW = textMetrics.width + 12;
          const badgeH = 18;
          const badgeX = Math.max(px1 + 4, Math.min(px1 + boxW - badgeW - 4, pcx - badgeW / 2));
          const badgeY = Math.max(pyTop + 4, 4);

          ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
          ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
          ctx.strokeStyle = pj.color || '#38bdf8';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(badgeText, badgeX + 6, badgeY + 13);
          ctx.restore();
        });
      }

      // Hotspot & Darkspot Göstergeleri (Yalnızca kombine modda)
      if (showHotDarkSpots && viewMode === 'combined' && simResult.hotspot && simResult.darkspot) {
        // Hotspot (Maksimum)
        const hotNormX = simResult.hotspot.xM / safeW;
        const hotNormY = 1 - simResult.hotspot.yM / safeH;
        const hx = hotNormX * w;
        const hy = hotNormY * h;

        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(hx, hy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText(`HOT ${Math.round(simResult.hotspot.lux)} lx`, hx + 10, hy + 4);
        ctx.restore();

        // Darkspot (Minimum)
        const darkNormX = simResult.darkspot.xM / safeW;
        const darkNormY = 1 - simResult.darkspot.yM / safeH;
        const dx = darkNormX * w;
        const dy = darkNormY * h;

        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dx, dy, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(dx, dy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText(`MIN ${Math.round(simResult.darkspot.lux)} lx`, dx + 10, dy + 4);
        ctx.restore();
      }
    };

    render();
    const animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [simResult, activeTab, viewMode, showProjectorOutlines, showHotDarkSpots, showIsoContours, surfaceConfig.widthM, surfaceConfig.heightM, activeProjectors]);

  // Canvas Çizimi (Overlap Görselleştirmesi)
  useEffect(() => {
    if (activeTab !== 'overlap') return;

    const renderOverlap = () => {
      const canvas = overlapCanvasRef.current;
      if (!canvas || !simResult) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const safeW = Math.max(0.1, surfaceConfig.widthM || 0);
      const safeH = Math.max(0.1, surfaceConfig.heightM || 0);
      const targetW = 720;
      const targetH = Math.max(220, Math.min(720, Math.round(targetW * (safeH / safeW))));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cellW = w / simResult.cols;
      const cellH = h / simResult.rows;

      for (let r = 0; r < simResult.rows; r++) {
        for (let c = 0; c < simResult.cols; c++) {
          const idx = r * simResult.cols + c;
          const cell = simResult.grid[idx];
          if (!cell) continue;

          if (cell.overlapCount > 1) {
            ctx.fillStyle = 'rgba(217, 70, 239, 0.75)';
          } else if (cell.overlapCount === 1) {
            ctx.fillStyle = 'rgba(14, 165, 233, 0.45)';
          } else {
            ctx.fillStyle = '#0f172a';
          }
          const drawY = h - (r + 1) * cellH;
          ctx.fillRect(c * cellW, drawY, cellW + 0.5, cellH + 0.5);
        }
      }
    };

    renderOverlap();
    const animId = requestAnimationFrame(renderOverlap);
    return () => cancelAnimationFrame(animId);
  }, [simResult, activeTab]);

  // Canvas Üzerinde Fare Hareketi (Hover Tooltip)
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = heatmapCanvasRef.current;
    if (!canvas || !simResult) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const py = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const col = Math.min(Math.max(0, Math.floor((px / rect.width) * simResult.cols)), simResult.cols - 1);
    const row = Math.min(Math.max(0, Math.floor((1 - py / rect.height) * simResult.rows)), simResult.rows - 1);

    const idx = row * simResult.cols + col;
    const cell = simResult.grid[idx];
    if (cell) {
      setHoveredCell({
        xM: cell.xM,
        yM: cell.yM,
        lux: cell.totalLux,
        nits: cell.luminanceNits,
        overlapCount: cell.overlapCount,
        perProjLux: cell.perProjectorLux
      });
    }
  };

  const handleCanvasMouseLeave = () => {
    setHoveredCell(null);
  };

  // IES Dosyası Yükleme İşleyicisi
  const handleIESFileUpload = (projId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseIES(text);
        setProjectors(prev => prev.map(p => {
          if (p.id === projId) {
            return {
              ...p,
              photometricSource: 'ies' as const,
              iesData: parsed,
              ansiLumens: Math.round(parsed.numLamps * parsed.lumensPerLamp) || p.ansiLumens
            };
          }
          return p;
        }));
        alert(`IES Fotometrik Veri Başarıyla Yüklendi:\n${parsed.numVerticalAngles}x${parsed.numHorizontalAngles} Candela Tablosu (${parsed.tilt})`);
      } catch (err: unknown) {
        alert(`IES Dosyası Okunamadı: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
  };

  // Seçili Projektör
  const currentProj = projectors.find(p => p.id === selectedProjId) || projectors[0];

  // Senaryo Karşılaştırma Listesi
  const comparisonScenarios: ScenarioComparisonItem[] = useMemo(() => {
    const list = [
      { name: 'Giriş / Ekonomik (7.000 lm)', lumens: 7000, dist: 3.8 },
      { name: 'Mevcut Kurulum (' + (currentProj?.ansiLumens || 10000).toLocaleString('tr-TR') + ' lm)', lumens: currentProj?.ansiLumens || 10000, dist: currentProj?.pos[2] || 4.5 },
      { name: 'Yüksek Işık (16.000 lm)', lumens: 16000, dist: 4.8 },
      { name: 'Büyük Mekan / Mapping (20.000 lm)', lumens: 20000, dist: 5.5 }
    ];

    const wM = toMeters(screenW, unit);
    const hM = toMeters(screenH, unit);

    return list.map(item => {
      const testProj: Projector3DConfig[] = [{
        ...currentProj,
        ansiLumens: item.lumens,
        pos: [0, hM / 2, item.dist],
        target: [0, hM / 2, 0],
        enabled: true
      }];
      const res = simulatePhotometricLux(surfaceConfig, testProj, 15, 10, false);
      return {
        name: item.name,
        lumens: item.lumens,
        distanceM: item.dist,
        avgLux: Math.round(res.avgLux),
        minLux: Math.round(res.minLux),
        maxLux: Math.round(res.maxLux),
        u0: round(res.uniformityU0 * 100, 1),
        u1: round(res.uniformityU1 * 100, 1),
        nits: Math.round(res.avgLuminanceNits),
        contrast: round(res.ambientContrastRatio, 1)
      };
    });
  }, [currentProj, screenW, screenH, unit, surfaceConfig]);

  // CSV İndirme
  const exportCSV = () => {
    if (!simResult) return;
    let csv = 'X_Meters,Y_Meters,Lux,Luminance_Nits,Overlap_Count\n';
    simResult.grid.forEach(c => {
      csv += `${round(c.xM, 3)},${round(c.yM, 3)},${round(c.totalLux, 1)},${round(c.luminanceNits, 1)},${c.overlapCount}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fotometrik-lux-grid-${screenW}x${screenH}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // PNG İndirme
  const exportPNG = () => {
    const canvas = heatmapCanvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `lux-heatmap-${screenW}x${screenH}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  // Açıklayıcı Değerlendirme Etiketleri
  const getLuxEvaluation = (avgLux: number) => {
    if (avgLux < 200) return { text: '⚠ Düşük Işık (Karanlık Ortam Şart)', color: 'text-amber-400 bg-amber-950/40 border-amber-800' };
    if (avgLux < 500) return { text: '✓ Müze & Sergi İdeal (300-500 Lux)', color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800' };
    if (avgLux < 800) return { text: '✓ Canlı ve Parlak Görsel', color: 'text-sky-400 bg-sky-950/40 border-sky-800' };
    return { text: '🌟 Gün Işığı / Yüksek Aydınlık Standardı', color: 'text-purple-400 bg-purple-950/40 border-purple-800' };
  };

  const getUniformityEvaluation = (u0: number) => {
    if (u0 >= 0.75) return { text: '✓ Mükemmel Homojenlik (Köşeler Eşit)', color: 'text-emerald-400' };
    if (u0 >= 0.60) return { text: '✓ Kabul Edilebilir Standart', color: 'text-sky-400' };
    return { text: '⚠ Köşelerde Kararma (Vignette) Riski', color: 'text-amber-400' };
  };

  const getContrastEvaluation = (acr: number) => {
    if (acr < 10) return { text: '❌ Soluk / Yıkanmış (Ortam Fazla Aydınlık)', color: 'text-red-400' };
    if (acr < 20) return { text: '⚠ Temel Okunabilirlik Sınırı', color: 'text-amber-400' };
    if (acr < 50) return { text: '✓ Müze & Deneyim İçin İdeal', color: 'text-emerald-400' };
    return { text: '🌟 Sinematik Yüksek Kontrast', color: 'text-purple-400' };
  };

  const luxEval = getLuxEvaluation(simResult.avgLux);
  const uniEval = getUniformityEvaluation(simResult.uniformityU0);
  const acrEval = getContrastEvaluation(simResult.ambientContrastRatio);

  // Basit Parlaklık Matematik Değerleri
  const simpleAreaM2 = Math.max(0.1, toMeters(screenW, unit) * toMeters(screenH, unit));
  const simpleProjCount = Math.max(1, activeProjectors.length || 1);
  const simplePerProjLumens = activeProjectors[0]?.ansiLumens || defaultProjectorLumens || 6000;
  const simpleTotalLumens = simpleProjCount * simplePerProjLumens;
  const simpleOpticalEfficiency = 0.90; // Lens ve optik motor verimi
  const simpleEffectiveLumens = simpleTotalLumens * simpleOpticalEfficiency;
  const simpleAvgLux = Math.round(simpleEffectiveLumens / simpleAreaM2);
  const simpleNits = Math.round((simpleAvgLux * screenGain) / Math.PI);
  const simpleFL = (simpleNits * 0.2919).toFixed(1);
  const simpleACR = ((simpleAvgLux + ambientLux) / Math.max(1, ambientLux)).toFixed(1);

  return (
    <div className="flex flex-col gap-4 h-full text-slate-100 p-2 sm:p-4 overflow-y-auto">
      {/* 🌟 EN ÜST BÖLÜM SEÇİM ÇUBUĞU (Bağımsız Parlaklık & Lens Raporu vs Detaylı Simülasyon) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400 font-bold text-lg">
            💡
          </div>
          <div>
            <h2 className="font-bold text-sm sm:text-base text-slate-100 flex items-center gap-2">
              <span>Lux & Parlaklık Modülü</span>
              <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-400 font-mono">
                {calcMode === 'quick_report' ? 'Bağımsız Hesaplama & Rapor' : 'Mekansal Fotometrik Dağılım'}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              {calcMode === 'quick_report'
                ? 'Diğer alanlardan bağımsız serbest giriş: Alan (m²), ortalama ekran luxu, yüzey nit/fL parlaklığı, ACR, ışık düzgünlüğü ve A4 teknik raporu.'
                : 'Mekansal 2B Lüks Izgarası, 3B Oda Yansımaları (GI) ve Noktadan Noktaya Simülasyon.'}
            </p>
          </div>
        </div>

        {/* Bölüm Değiştirici Butonlar */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
          <button
            type="button"
            onClick={() => setCalcMode('quick_report')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
              calcMode === 'quick_report'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>💡 Bağımsız Parlaklık & Lens (Resmi Rapor)</span>
          </button>
          <button
            type="button"
            onClick={() => setCalcMode('advanced')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
              calcMode === 'advanced'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🔬 Detaylı 2B/3B Fotometrik Simülasyon</span>
          </button>
        </div>
      </div>

      {/* 💡 1. BAĞIMSIZ PARLAKLIK & LENS HESAPLAYICI (RESMİ RAPOR ALANI) */}
      {calcMode === 'quick_report' && (
        <QuickOpticsLuxCalculator unit={unit} />
      )}

      {/* 🔬 2. DETAYLI FOTOMETRİK GÖRÜNÜM (MEVCUT GÖRÜNÜM) */}
      {calcMode === 'advanced' && (
        <div className="flex flex-col lg:grid lg:grid-cols-[400px_1fr] gap-4 h-full text-slate-100 overflow-hidden">
      
      {/* SOL PANEL: KONTROLLER VE PARAMETRELER */}
      <div className="flex flex-col gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-y-auto max-h-[85vh] lg:max-h-full text-xs sm:text-sm shadow-xl">
        
        {/* Başlık ve Mod Seçimi */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div>
            <h2 className="font-bold text-base text-sky-400 flex items-center gap-2">
              <span>Fotometrik Simülasyon</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">Kalıcı Hafıza</span>
            </h2>
            <p className="text-[11px] text-slate-400">Noktadan Noktaya Gerçek Lux & Nits Analizi</p>
          </div>
          <label className="flex items-center gap-1.5 text-xs bg-slate-800 px-2 py-1 rounded cursor-pointer border border-slate-700">
            <input
              type="checkbox"
              checked={advancedMode}
              onChange={e => setAdvancedMode(e.target.checked)}
              className="rounded text-sky-500"
            />
            <span className="font-medium text-slate-300">Gelişmiş</span>
          </label>
        </div>

        {/* PROJE İLE OTOMATİK SENKRONİZASYON */}
        <div className="space-y-2 bg-gradient-to-r from-sky-950/40 via-slate-950 to-slate-950 p-3 rounded-lg border border-sky-900/60 shadow">
          <div className="flex items-center justify-between">
            <label className="font-bold text-sky-300 text-xs flex items-center gap-1.5">
              <span>🎯 Projedeki Yüzeyden Aktar</span>
            </label>
            <span className="text-[10px] text-slate-400">
              {plannerSurfaces.length} Yüzey Mevcut
            </span>
          </div>

          <p className="text-[11px] text-slate-300 leading-tight">
            İçerik Planlama'da tasarladığınız duvar/zeminleri tek tıkla buraya aktarabilirsiniz; projektörler ve koordinatlar otomatik yüklenir.
          </p>

          <div className="flex gap-2 items-center pt-1">
            <select
              className="flex-1 bg-slate-900 border border-sky-700/60 rounded px-2 py-1.5 text-xs text-sky-200 font-medium outline-none focus:border-sky-400"
              value={selectedSurfaceId}
              onChange={e => {
                const sid = e.target.value;
                if (sid === 'custom') {
                  usePhotometricStore.setState({ selectedSurfaceId: 'custom' });
                } else {
                  const found = plannerSurfaces.find(s => s.id === sid);
                  if (found) {
                    importFromPlannerSurface(found, defaultProjectorLumens);
                  }
                }
              }}
            >
              {plannerSurfaces.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.widthM}m × {s.heightM}m ({s.cols * s.rows} Projektör)
                </option>
              ))}
              <option value="custom">✏ Özel / Manuel Geometri</option>
            </select>

            {selectedSurfaceId !== 'custom' && (
              <button
                type="button"
                onClick={() => {
                  const found = plannerSurfaces.find(s => s.id === selectedSurfaceId);
                  if (found) importFromPlannerSurface(found, defaultProjectorLumens);
                }}
                className="px-2 py-1.5 bg-sky-900/80 hover:bg-sky-800 text-sky-200 rounded text-xs border border-sky-700/70"
                title="Projeden Tekrar Yükle"
              >
                🔄
              </button>
            )}
          </div>
        </div>

        {/* PROJEKSİYON YÜZEYİ GEOMETRİSİ */}
        <div className="space-y-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase">1. Yüzey Geometrisi</h3>
            <span className="text-[10px] text-slate-400">
              Alan: <b className="text-sky-300 font-mono">{round(screenW * screenH, 2)} m²</b>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400">Genişlik ({unit})</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs focus:border-sky-500 outline-none"
                value={screenW}
                onChange={e => setScreenW(Math.max(0.5, +e.target.value))}
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Yükseklik ({unit})</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs focus:border-sky-500 outline-none"
                value={screenH}
                onChange={e => setScreenH(Math.max(0.5, +e.target.value))}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-400">Yüzey Şekli</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs outline-none"
              value={geometry}
              onChange={e => setGeometry(e.target.value as SurfaceGeometryType)}
            >
              <option value="flat">Düz Duvar (Flat Wall)</option>
              <option value="curved">Kavisli Duvar (Curved Arc)</option>
              <option value="floor">Zemin Projeksiyonu (Floor)</option>
              <option value="ceiling">Tavan Projeksiyonu (Ceiling)</option>
              <option value="inclined">Eğimli Yüzey (Inclined Plane)</option>
            </select>
          </div>

          {geometry === 'curved' && (
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
              <div>
                <label className="text-[10px] text-slate-400">Kavis Yarıçapı (m)</label>
                <input
                  type="number"
                  step="0.5"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                  value={curveRadius}
                  onChange={e => setCurveRadius(+e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Kavis Açısı (°)</label>
                <input
                  type="number"
                  step="5"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                  value={curveAngle}
                  onChange={e => setCurveAngle(+e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Screen Gain & Yansıtma */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
            <div>
              <label className="text-[11px] text-slate-400" title="Screen Gain gelen Lux'ü değiştirmez; yansıyan Nits parlaklığını artırır.">
                Screen Gain: <span className="text-sky-300 font-bold">{screenGain}x</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0.4"
                max="3.0"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                value={screenGain}
                onChange={e => setScreenGain(Math.max(0.1, +e.target.value))}
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Yüzey Yansıtma</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="1.0"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                value={surfaceReflectance}
                onChange={e => setSurfaceReflectance(Math.max(0.01, +e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* ORTAM IŞIĞI (AMBIENT LUX) & KONTRAST ANALİZİ */}
        <div className="space-y-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase">2. Ortam Işığı (Ambient)</h3>
            <span className="text-xs font-mono font-bold text-amber-400">{ambientLux} Lux</span>
          </div>

          <div className="grid grid-cols-4 gap-1 text-[10px]">
            {[
              { val: 5, label: 'Karanlık', desc: '5 lx' },
              { val: 20, label: 'Müze', desc: '20 lx' },
              { val: 100, label: 'Galeri', desc: '100 lx' },
              { val: 300, label: 'Ofis', desc: '300 lx' },
            ].map(item => (
              <button
                key={item.val}
                type="button"
                onClick={() => setAmbientLux(item.val)}
                className={`p-1 rounded text-center border transition ${
                  ambientLux === item.val
                    ? 'bg-amber-950/60 border-amber-500 text-amber-300 font-bold shadow'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.desc}<br/><span className="text-[9px] opacity-75">{item.label}</span>
              </button>
            ))}
          </div>

          <input
            type="range"
            min="0"
            max="500"
            step="5"
            value={ambientLux}
            onChange={e => setAmbientLux(+e.target.value)}
            className="w-full accent-amber-500"
          />
        </div>

        {/* ÇOKLU PROJEKTÖR YÖNETİMİ */}
        <div className="space-y-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase">
              3. Projektörler ({projectors.length})
            </h3>
            <button
              type="button"
              onClick={addProjector}
              className="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium"
            >
              + Projektör Ekle
            </button>
          </div>

          {/* Projektör Sekmeleri */}
          <div className="flex gap-1 overflow-x-auto pb-1 max-w-full">
            {projectors.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProjId(p.id)}
                className={`min-w-[64px] text-xs py-1 px-2 rounded border truncate text-center transition ${
                  p.id === selectedProjId
                    ? 'border-sky-500 bg-sky-950/50 text-sky-200 font-semibold shadow'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                PJ {idx + 1} {!p.enabled ? '(Kapalı)' : ''}
              </button>
            ))}
          </div>

          {/* Seçili Projektör Ayrıntıları */}
          {currentProj && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 font-medium w-2/3"
                  value={currentProj.name}
                  onChange={e => updateSelectedProjector({ name: e.target.value })}
                />
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-400 flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentProj.enabled}
                      onChange={e => updateSelectedProjector({ enabled: e.target.checked })}
                    />
                    Aktif
                  </label>
                  {projectors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeProjector(currentProj.id)}
                      className="text-red-400 hover:text-red-300 text-xs font-bold px-1"
                      title="Projektörü Sil"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* ANSI Lümen ve Toplu Güncelleme */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] text-slate-400">ANSI Lümen (lm)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const targetLm = currentProj.ansiLumens;
                        setDefaultProjectorLumens(targetLm);
                        setProjectors(prev => prev.map(p => ({ ...p, ansiLumens: targetLm })));
                      }}
                      className="text-[9px] text-sky-400 hover:underline"
                      title="Tüm projektörlere bu lümen değerini uygula"
                    >
                      Tümüne Uygula
                    </button>
                  </div>
                  <input
                    type="number"
                    step="500"
                    min="100"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-sky-400 font-mono font-bold"
                    value={currentProj.ansiLumens}
                    onChange={e => updateSelectedProjector({ ansiLumens: Math.max(1, +e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400" title="Lens geçirgenliği, optik toz ve kalibrasyon katsayısı">
                    Optik Verim (η): <span className="font-bold text-slate-200">{round(currentProj.efficiency, 2)}</span>
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.0"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                    value={currentProj.efficiency}
                    onChange={e => updateSelectedProjector({ efficiency: Math.max(0.1, Math.min(1.0, +e.target.value)) })}
                  />
                </div>
              </div>

              {/* 3B Konum [X, Y, Z] */}
              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 font-medium">Projektör 3B Konumu [X, Y, Z] (metre)</span>
                <div className="grid grid-cols-3 gap-1">
                  <div>
                    <label className="text-[9px] text-slate-500">X (Yatay)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono"
                      value={currentProj.pos[0]}
                      onChange={e => updateSelectedProjector({ pos: [+e.target.value, currentProj.pos[1], currentProj.pos[2]] })}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500">Y (Yükseklik)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono"
                      value={currentProj.pos[1]}
                      onChange={e => updateSelectedProjector({ pos: [currentProj.pos[0], +e.target.value, currentProj.pos[2]] })}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500">Z (Mesafe D)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-amber-300 font-bold"
                      value={currentProj.pos[2]}
                      onChange={e => updateSelectedProjector({ pos: [currentProj.pos[0], currentProj.pos[1], Math.max(0.1, +e.target.value)] })}
                    />
                  </div>
                </div>
              </div>

              {/* Lens & Fotometrik Model */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400">Throw Ratio (Atım)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.2"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                    value={currentProj.throwRatio}
                    onChange={e => updateSelectedProjector({ throwRatio: Math.max(0.1, +e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Köşe Düzgünlüğü</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.5"
                    max="1.0"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                    value={currentProj.cornerUniformity}
                    onChange={e => updateSelectedProjector({ cornerUniformity: Math.max(0.4, Math.min(1.0, +e.target.value)) })}
                  />
                </div>
              </div>

              {/* IES Dosyası Yükleme */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-slate-300 font-medium">Fotometrik Veri</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${currentProj.photometricSource === 'ies' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                    {currentProj.photometricSource === 'ies' ? 'Doğrulanmış IES' : 'ANSI Kosinüs (Tahmini)'}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <label className="flex-1 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 text-center py-1 px-2 rounded border border-slate-700 text-xs">
                    📁 IES / LDT Dosyası Yükle
                    <input
                      type="file"
                      accept=".ies,.ldt"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleIESFileUpload(currentProj.id, file);
                      }}
                    />
                  </label>
                  {currentProj.photometricSource === 'ies' && (
                    <button
                      type="button"
                      onClick={() => updateSelectedProjector({ photometricSource: 'ansi_cosine', iesData: undefined })}
                      className="text-xs text-slate-400 hover:text-red-400"
                    >
                      Kaldır
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* GRID ÇÖZÜNÜRLÜĞÜ */}
        <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-lg border border-slate-800 text-xs">
          <label className="text-slate-400">Grid Çözünürlüğü:</label>
          <div className="flex gap-1">
            {(['15x10', '30x20', '50x30'] as const).map(res => (
              <button
                key={res}
                type="button"
                onClick={() => setGridRes(res)}
                className={`px-2 py-0.5 rounded text-[11px] transition ${gridRes === res ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-400'}`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* SAĞ PANEL: SİMÜLASYON GÖRSELİ, ANALİZ KARTLARI VE KULLANICI REHBERİ */}
      <div className="flex flex-col gap-3 min-w-0 overflow-y-auto">

        {/* Üst Sekmeler ve Dışa Aktarım */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-2">
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('heatmap')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === 'heatmap' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              2D Lux Isı Haritası
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('3d')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === '3d' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              🌐 3B Mekansal Simülasyon
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gi')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === 'gi' ? 'bg-purple-600 text-white shadow font-bold' : 'text-purple-400 hover:text-white'}`}
              title="Komple 3B oda yüzeyleri, zemin/tavan ve duvarlar arasındaki fiziksel ışık sekmeleri (Global Illumination)"
            >
              ✨ 3D Global Illumination (Işık Sekmesi)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ansi9')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === 'ansi9' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              ANSI 9-Nokta Testi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('overlap')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === 'overlap' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Örtüşme (Overlap) & Blend
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scenarios')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === 'scenarios' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Senaryo Karşılaştırma
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === 'guide' ? 'bg-amber-600 text-white shadow' : 'text-amber-400 hover:text-amber-200'}`}
            >
              📖 Nasıl Yorumlanır?
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportPNG}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs border border-slate-700"
            >
              PNG Kaydet
            </button>
            <button
              type="button"
              onClick={exportCSV}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs border border-slate-700"
            >
              CSV İndir
            </button>
          </div>
        </div>

        {/* 🌟 3B MEKANSAL SİMÜLASYON SEKMESİ */}
        {activeTab === '3d' && (
          <div className="space-y-3">
            <Photometric3DScene surface={surfaceConfig} projectors={projectors} simResult={simResult} />
          </div>
        )}

        {/* 🌟 3D GLOBAL ILLUMINATION & IŞIK SEKMESİ SEKMESİ */}
        {activeTab === 'gi' && (
          <div className="space-y-3">
            <RoomGIScene3D />
          </div>
        )}

        {/* 🌟 ANA GÖRSELLEŞTİRME: 2D ISI HARİTASI */}
        {activeTab === 'heatmap' && (
          <div className="space-y-3">
            {/* Isı Haritası Tuvali */}
            <div className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-2 flex flex-col items-center justify-center shadow-lg">
              <div
                className="relative w-full max-w-[840px] max-h-[520px] flex items-center justify-center bg-black/50 rounded-lg overflow-hidden border border-slate-800/80"
                style={{ aspectRatio: `${Math.max(0.1, surfaceConfig.widthM || 0)} / ${Math.max(0.1, surfaceConfig.heightM || 0)}` }}
              >
                <canvas
                  ref={heatmapCanvasRef}
                  width={640}
                  height={360}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={handleCanvasMouseLeave}
                  className="w-full h-full object-contain cursor-crosshair"
                />

                {/* Hover Tooltip Bilgi Kartı */}
                {hoveredCell && (
                  <div className="absolute top-3 left-3 bg-slate-900/95 backdrop-blur-md border border-slate-700 text-slate-100 p-2.5 rounded-lg shadow-2xl text-xs pointer-events-none space-y-1">
                    <div className="font-semibold text-sky-400 flex items-center justify-between gap-4">
                      <span>Nokta: X: {round(hoveredCell.xM, 2)}m, Y: {round(hoveredCell.yM, 2)}m</span>
                      <span className="text-[10px] bg-sky-950 px-1.5 py-0.5 rounded text-sky-300 border border-sky-800">
                        {hoveredCell.overlapCount > 1 ? `${hoveredCell.overlapCount} Projektör (Overlap)` : 'Tek Işık'}
                      </span>
                    </div>
                    <div className="text-sm font-mono font-bold text-emerald-400">
                      {round(hoveredCell.lux, 1)} Lux (Aydınlık)
                    </div>
                    <div className="text-[11px] text-slate-300">
                      Gözlenen Parlaklık: <span className="font-semibold text-amber-300">{round(hoveredCell.nits, 1)} cd/m² (Nit)</span> ({round(hoveredCell.nits * 0.2919, 1)} fL)
                    </div>
                    {hoveredCell.perProjLux.length > 1 && (
                      <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                        Katkı: {hoveredCell.perProjLux.map((lx, i) => `PJ${i + 1}: ${round(lx, 0)} lx`).join(' + ')}
                      </div>
                    )}
                  </div>
                )}

                {/* Renk Skalası Lejantı */}
                <div className="absolute bottom-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-2 rounded shadow text-xs flex flex-col gap-1 items-center">
                  <span className="text-[10px] text-slate-300 font-mono">Işık Yoğunluğu Skalası</span>
                  <div className="w-48 h-3 rounded bg-gradient-to-r from-[#00008b] via-[#00ffff] via-[#00ff00] via-[#ffff00] via-[#ff8c00] to-[#ff0000]" />
                  <div className="w-full flex justify-between text-[10px] font-mono text-slate-300">
                    <span>{Math.round(simResult.minLux)} lx</span>
                    <span>{Math.round((simResult.minLux + simResult.maxLux) / 2)} lx</span>
                    <span>{Math.round(simResult.maxLux)} lx</span>
                  </div>
                </div>
              </div>

              {/* Alt Kontroller & Çerçeve / İso Çizgileri Toggle */}
              <div className="w-full flex items-center justify-between text-xs text-slate-400 pt-2 px-2 flex-wrap gap-2">
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-sky-300">
                    <input
                      type="checkbox"
                      checked={showProjectorOutlines}
                      onChange={e => setShowProjectorOutlines(e.target.checked)}
                      className="rounded text-sky-500"
                    />
                    📐 Projektör Sınırlarını & Kapsama Alanlarını Göster (PJ 1, PJ 2...)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showHotDarkSpots}
                      onChange={e => setShowHotDarkSpots(e.target.checked)}
                      className="rounded text-sky-500"
                    />
                    Tepe Noktaları Göster (HOT & MIN)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showIsoContours}
                      onChange={e => setShowIsoContours(e.target.checked)}
                      className="rounded text-sky-500"
                    />
                    Eş-Lux Çizgileri
                  </label>
                </div>
                <div className="text-[11px] text-slate-400">
                  {simResult.isEstimatedModel ? '⚠ Yaklaşık Datasheet/Kosinüs Modeli' : '✓ Doğrulanmış IES Modeli'}
                </div>
              </div>
            </div>

            
            {/* BAŞLIK & RAPORLAMA VE MANUEL LUX KONTROLLERİ */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-950/70 p-3 rounded-lg border border-slate-800">
              <div>
                <h3 className="font-bold text-sm text-sky-400 flex items-center gap-1.5">
                  <span>📏 Projektör Kapsama, Atım & Örtüşme (Blend) Analizi</span>
                  <span className="text-xs font-mono text-slate-400">({surfaceConfig.widthM}m × {surfaceConfig.heightM}m)</span>
                </h3>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  {distributionData.isMultiRow ? `${distributionData.sortedRowKeys.length} Sıra Halinde Toplam ${activeProjectors.length} Projektörün Yatay ve Dikey Kesişimleri:` : `Mekandaki ${activeProjectors.length} projektörün duvardaki net başlangıç/bitiş mesafeleri ve bindirme payları:`}
                </p>
              </div>

              {/* Rapor Ekle Butonu & Mod Seçiciler */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSaveToReport}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 transition active:scale-95"
                  title="Bu yüzeyin 2B Isı Haritası görselini, metraj cetvelini ve lux analizini Raporlama modülüne aktarır"
                >
                  <span>📸 Bu Yüzeyi Rapora Ekle</span>
                </button>

                <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setIsManualLux(false)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition ${!isManualLux ? 'bg-sky-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    ⚡ Simülasyon
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsManualLux(true)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition ${isManualLux ? 'bg-amber-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    ✏️ Manuel Lux Girişi
                  </button>
                </div>
              </div>
            </div>

            {/* Bildirim Toast'ı */}
            {saveToast && (
              <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500 text-emerald-200 text-xs font-medium flex items-center justify-between shadow-lg">
                <span>{saveToast}</span>
                <span className="text-[10px] text-emerald-400">Rapor sekmesinde görüntülenebilir</span>
              </div>
            )}

            {/* MANUEL LUX GİRİŞ ALANI (Aktifse) */}
            {isManualLux && (
              <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <span>✏️ Manuel Ölçüm / Sahada Luxmetre ile Alınan Değerler:</span>
                  </span>
                  <span className="text-[10.5px] text-amber-400/80">Raporda ve aşağıdaki tüm metrik kartlarında bu değerler kullanılacaktır</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1 font-medium">Ortalama Aydınlık (E_avg):</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="10"
                        max="10000"
                        value={manualAvgLux}
                        onChange={(e) => setManualAvgLux(Math.max(1, Number(e.target.value) || 0))}
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-lg px-2.5 py-1 text-sm font-mono text-amber-300 font-bold focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                      <span className="text-xs text-slate-400">Lux</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1 font-medium">Minimum Aydınlık (E_min):</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={manualMinLux}
                        onChange={(e) => setManualMinLux(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-sm font-mono text-sky-300 font-bold focus:outline-none focus:ring-1 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-400">Lux</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1 font-medium">Maksimum Aydınlık (E_max):</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="10"
                        max="20000"
                        value={manualMaxLux}
                        onChange={(e) => setManualMaxLux(Math.max(1, Number(e.target.value) || 0))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-sm font-mono text-rose-300 font-bold focus:outline-none focus:ring-1 focus:ring-rose-400"
                      />
                      <span className="text-xs text-slate-400">Lux</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CETVEL VE KAPSAMA ALANI FİLTRESİ */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-300">Haritada Tekil Projektör İzole Et (Solo Mod):</span>
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs flex-wrap">
                  <button
                    type="button"
                    onClick={() => setViewMode('combined')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${viewMode === 'combined' ? 'bg-sky-600 text-white shadow font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Tümü (Kombine)
                  </button>
                  {activeProjectors.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setViewMode(p.id)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${viewMode === p.id ? 'bg-sky-600 text-white shadow font-bold' : 'text-slate-400 hover:text-white'}`}
                      style={{ color: viewMode === p.id ? '#ffffff' : p.color }}
                    >
                      PJ {idx + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setViewMode('dominant')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${viewMode === 'dominant' ? 'bg-purple-600 text-white shadow font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Kapsama Haritası
                  </button>
                </div>
              </div>

              {/* GÖRSEL YATAY CETVEL BARLARI (Satır Bazlı Kulvarlar) */}
              <div className="space-y-1.5">
                {distributionData.sortedRowKeys.map((rKey, rIdx) => {
                  const rowItems = distributionData.rowsMap.get(rKey) || [];
                  const rowTitle = distributionData.isMultiRow ? `Sıra ${rIdx + 1} (Y: ${(rKey).toFixed(1)}m derinlik)` : undefined;

                  return (
                    <div key={rKey} className="space-y-0.5">
                      {rowTitle && (
                        <div className="text-[10px] text-slate-400 font-mono font-medium flex items-center justify-between">
                          <span>{rowTitle}</span>
                          <span className="text-[9px] text-slate-500">{rowItems.length} Projektör</span>
                        </div>
                      )}
                      <div className="relative w-full h-8 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden flex">
                        {rowItems.map((item) => {
                          const widthPct = ((item.endX - item.startX) / surfaceConfig.widthM) * 100;
                          const leftPct = (item.startX / surfaceConfig.widthM) * 100;

                          return (
                            <div
                              key={item.pj.id}
                              className="absolute top-0 bottom-0 border-r border-white/20 flex flex-col justify-center items-center text-[10px] font-bold text-white shadow transition hover:opacity-90 cursor-pointer"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: `${item.pj.color}33`,
                                borderLeft: `3px solid ${item.pj.color}`
                              }}
                              onClick={() => {
                                setSelectedProjId(item.pj.id);
                                setViewMode(item.pj.id);
                              }}
                              title={`${item.pj.name}: ${item.startX.toFixed(2)}m – ${item.endX.toFixed(2)}m`}
                            >
                              <span style={{ color: item.pj.color }}>PJ {item.idx + 1}</span>
                              <span className="text-[9px] text-slate-300 font-mono">
                                {item.startX.toFixed(1)}m – {item.endX.toFixed(1)}m
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* CETVEL DETAY TABLOSU */}
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-2">Cihaz Kodu</th>
                      <th className="p-2">Duvardaki Başlangıç</th>
                      <th className="p-2">Duvardaki Bitiş</th>
                      <th className="p-2">Açılan Genişlik</th>
                      <th className="p-2">Optik Merkez (X)</th>
                      <th className="p-2">Atım (D) / TR</th>
                      <th className="p-2">Komşu Örtüşme (Blend)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {distributionData.rows.map((r) => (
                      <tr key={r.pj.id} className="hover:bg-slate-800/40">
                        <td className="p-2 font-bold flex items-center gap-1.5" style={{ color: r.pj.color }}>
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.pj.color }} />
                          <span>PJ {r.idx + 1}: {r.pj.name.split('(')[0].trim()}</span>
                          {r.rowName && <span className="text-[10px] text-slate-400 font-normal">({r.rowName})</span>}
                        </td>
                        <td className="p-2 font-mono text-slate-200">{r.startX.toFixed(2)} m</td>
                        <td className="p-2 font-mono text-slate-200">{r.endX.toFixed(2)} m</td>
                        <td className="p-2 font-mono text-emerald-400 font-semibold">{r.beamW.toFixed(2)} m</td>
                        <td className="p-2 font-mono text-sky-400">{r.centerX.toFixed(2)} m</td>
                        <td className="p-2 font-mono text-slate-300">D={r.dist.toFixed(2)}m (TR: {r.pj.throwRatio}:1)</td>
                        <td className="p-2 font-mono text-amber-300 font-medium">{r.overlapInfo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AÇIKLAYICI METRİK KARTLARI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
              
              {/* ORTALAMA LUX */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Ortalama Aydınlık (Lux)</span>
                    <span className="text-[10px] text-slate-500 font-mono">E_avg</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-sky-400 mt-1 flex items-baseline gap-1.5">
                    <span>{Math.round(effAvgLux)}</span>
                    <span className="text-xs font-normal text-slate-400">Lux (lm/m²)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Min: <b className="text-sky-300">{Math.round(effMinLux)}</b> / Max: <b className="text-amber-300">{Math.round(effMaxLux)}</b> lx
                  </div>
                </div>
                <div className={`mt-2 p-1.5 rounded text-[10.5px] border font-medium ${isManualLux ? 'bg-amber-950/60 border-amber-500/40 text-amber-300' : luxEval.color}`}>
                  {isManualLux ? '✏️ Manuel Ölçülen Saha Değeri' : luxEval.text}
                </div>
              </div>

              {/* DÜZGÜNLÜK (HOMOJENLİK) */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Işık Düzgünlüğü (Uniformity)</span>
                    <span className="text-[10px] text-slate-500 font-mono">U0 (Min/Ort)</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    %{round(effU0 * 100, 1)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    U1 (Min/Maks): <b className="text-slate-200">%{round(effU1 * 100, 1)}</b>
                  </div>
                </div>
                <div className="mt-2 p-1.5 rounded text-[10.5px] border border-slate-800 bg-slate-950 font-medium text-slate-300">
                  <span className={effU0 >= 0.5 ? 'text-emerald-400' : 'text-amber-300'}>
                    {effU0 >= 0.6 ? '✓ Yüksek Homojenlik' : effU0 >= 0.4 ? '✓ Kabul Edilebilir Düzgünlük' : '⚠ Köşelerde Kararma Riski'}
                  </span>
                </div>
              </div>

              {/* YANSIYAN PARLAKLIK (NITS) */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Gözlenen Parlaklık (Luminance)</span>
                    <span className="text-[10px] text-slate-500 font-mono">Gain: {screenGain}x</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-400 mt-1 flex items-baseline gap-1.5">
                    <span>{Math.round(effNits)}</span>
                    <span className="text-xs font-normal text-slate-400">cd/m² (Nit)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Foot-Lambert: <b className="text-slate-200">{round(effFL, 1)} fL</b>
                  </div>
                </div>
                <div className="mt-2 p-1.5 rounded text-[10.5px] border border-slate-800 bg-slate-950 font-medium text-slate-300">
                  {effNits > 100 ? '✓ TV / LED netliğinde parlaklık' : '✓ Loş sinema standardı'}
                </div>
              </div>

              {/* ORTAM KONTRASTI (ACR) */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Ortam Işığı Kontrastı (ACR)</span>
                    <span className="text-[10px] text-slate-500 font-mono">Amb: {ambientLux} lx</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-purple-400 mt-1">
                    {round(effACR, 1)}:1
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {ambientLux === 0 ? 'Tamamen karanlık oda' : `${ambientLux} Lux ortam ışığı altında`}
                  </div>
                </div>
                <div className="mt-2 p-1.5 rounded text-[10.5px] border border-slate-800 bg-slate-950 font-medium text-slate-300">
                  <span className={effACR >= 15 ? 'text-emerald-400' : 'text-amber-300'}>
                    {effACR >= 20 ? '✓ Mükemmel Kontrast' : effACR >= 15 ? '✓ İyi Okunabilirlik' : '⚠ Düşük Kontrast'}
                  </span>
                </div>
              </div>

            </div>
</div>
        )}

        {/* ANSI 9-NOKTA ANALİZİ */}
        {activeTab === 'ansi9' && (
          <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-semibold text-slate-200 text-sm">ANSI 9-Nokta Standart Fotometrik Ölçüm</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Yüzey 3x3 bölgeye ayrılarak standart ANSI test noktalarındaki aydınlık ve homojenlik dağılımı ölçülür.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-[650px] mx-auto p-4 bg-slate-950 border border-slate-800 rounded-lg">
              {simResult.ansi9Points.map((pt, i) => (
                <div
                  key={i}
                  className="bg-slate-900/90 border border-slate-700 p-3 rounded text-center flex flex-col justify-center items-center shadow"
                >
                  <span className="text-[10px] text-slate-400 font-mono">Nokta #{i + 1}</span>
                  <span className="text-base font-bold font-mono text-sky-400 my-1">
                    {Math.round(pt.lux)} Lux
                  </span>
                  <span className="text-[10px] text-amber-300">
                    {Math.round(pt.luminanceNits)} cd/m²
                  </span>
                  <span className="text-[9px] text-slate-500 mt-1">
                    ({round(pt.xM, 2)}m, {round(pt.yM, 2)}m)
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block">9-Nokta Ortalama:</span>
                <span className="text-base font-bold font-mono text-emerald-400">{Math.round(simResult.ansiAvgLux)} Lux</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block">ANSI Düzgünlük (Min/Maks):</span>
                <span className="text-base font-bold font-mono text-sky-400">%{round(simResult.ansiUniformity * 100, 1)}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block">Standart Sapma (σ):</span>
                <span className="text-base font-bold font-mono text-purple-400">{round(simResult.ansiStdDev, 1)} Lux</span>
              </div>
            </div>
          </div>
        )}

        {/* OVERLAP VE BLEND SEKMESİ */}
        {activeTab === 'overlap' && (
          <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200 text-sm">Çoklu Projektör Örtüşme (Overlap) & Blend Haritası</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Projektörlerin yan yana geldiği hatlarda ışıkların süperpozisyonu ve harmanlama kompanzasyonu.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs bg-slate-800 px-3 py-1.5 rounded border border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blendOverlap}
                  onChange={e => setBlendOverlap(e.target.checked)}
                  className="rounded text-sky-500"
                />
                <span className="font-medium text-slate-300">Soft-Edge Blending Dengelemesi</span>
              </label>
            </div>

            <div className="relative bg-slate-950 border border-slate-800 rounded-lg p-2 flex flex-col items-center justify-center">
              <canvas
                ref={overlapCanvasRef}
                width={640}
                height={360}
                className="w-full max-w-[720px] aspect-[16/9] object-contain rounded"
              />
              <div className="flex gap-4 items-center justify-center pt-2 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-[#0ea5e9]" />
                  <span>Tek Projektör Alanı (1x Işık)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-[#d946ef]" />
                  <span>Örtüşme (Overlap) Bölgesi (Toplanan / Harmanlanan Işık)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SENARYO KARŞILAŞTIRMA */}
        {activeTab === 'scenarios' && (
          <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-semibold text-slate-200 text-sm">Farklı Lümen & Mesafe Senaryoları</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Mevcut yüzey boyutunda farklı güçteki cihazların aydınlık ve kontrast karşılaştırması.
              </p>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Senaryo</th>
                    <th className="p-2.5">Lümen (lm)</th>
                    <th className="p-2.5">Mesafe (m)</th>
                    <th className="p-2.5">Ortalama Lux</th>
                    <th className="p-2.5">Min / Max Lux</th>
                    <th className="p-2.5">Düzgünlük (U0)</th>
                    <th className="p-2.5">Parlaklık (cd/m²)</th>
                    <th className="p-2.5">ACR Kontrast</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {comparisonScenarios.map((sc, i) => (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="p-2.5 font-medium text-slate-200">{sc.name}</td>
                      <td className="p-2.5 font-mono text-sky-400">{sc.lumens.toLocaleString()}</td>
                      <td className="p-2.5 font-mono text-slate-300">{sc.distanceM}m</td>
                      <td className="p-2.5 font-mono font-bold text-emerald-400">{sc.avgLux} lx</td>
                      <td className="p-2.5 font-mono text-slate-400">{sc.minLux} / {sc.maxLux} lx</td>
                      <td className="p-2.5 font-mono text-slate-300">%{sc.u0}</td>
                      <td className="p-2.5 font-mono text-amber-400">{sc.nits} cd/m²</td>
                      <td className="p-2.5 font-mono text-purple-400">{sc.contrast}:1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* YENİ REHBER: "NASIL YORUMLANIR & NE ANLAMA GELİR?" */}
        {activeTab === 'guide' && (
          <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-5 text-xs text-slate-300">
            <div>
              <h3 className="font-bold text-base text-amber-400 flex items-center gap-2">
                <span>📖 AV & Müze Projeksiyon Fotometri Rehberi</span>
              </h3>
              <p className="text-slate-400 text-xs mt-1">
                Bu modüldeki teknik parametreleri pratik sahada nasıl yorumlayacağınızı ve nelere dikkat etmeniz gerektiğini aşağıdan inceleyebilirsiniz:
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4 pt-2">
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                <span className="font-bold text-sky-400 block text-sm">1. Lux (Aydınlık) Nedir?</span>
                <p className="text-slate-300 leading-relaxed">
                  Projektörden çıkan ışığın ekranın 1 metrekaresine düşen miktarıdır (lm/m²).
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-400">
                  <li><b>200 - 350 Lux:</b> Karartılmış tiyatro veya karanlık immersif oda için yeterli.</li>
                  <li><b>400 - 600 Lux:</b> Müze, sergi ve deneyim alanları için altın standart.</li>
                  <li><b>800+ Lux:</b> Pencereli, ışık alan veya gün ışığı sızan odalarda gereklidir.</li>
                </ul>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                <span className="font-bold text-amber-400 block text-sm">2. cd/m² (Nits Parlaklık) Nedir?</span>
                <p className="text-slate-300 leading-relaxed">
                  Ekrana çarpan ışıktan izleyicinin gözüne yansıyan gerçek parlaklıktır (TV/monitör parlaklığı gibi).
                </p>
                <p className="text-slate-400 text-[11px]">
                  <b>Önemli Fizik Kuralı:</b> Screen Gain yüzeye gelen Lux'ü değiştirmez. Ancak gain yüksekse izleyiciye yansıyan Nits değeri çarpanla artar (L = E · Gain / π).
                </p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                <span className="font-bold text-emerald-400 block text-sm">3. Düzgünlük (Uniformity U0)</span>
                <p className="text-slate-300 leading-relaxed">
                  Ekranın en karanlık köşesi ile ortalama ışık arasındaki orandır (U0 = Emin / Eavg).
                </p>
                <p className="text-slate-400 text-[11px]">
                  <b>%70 ve Üzeri:</b> İnsan gözü köşelerdeki düşüşü algılayamaz, görüntü homojen görünür.<br/>
                  <b>%50 Altı:</b> Köşelerde belirgin kararma (vignette) hissedilir.
                </p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                <span className="font-bold text-purple-400 block text-sm">4. Ortam Kontrastı (ACR)</span>
                <p className="text-slate-300 leading-relaxed">
                  Salondaki ortam aydınlığı (E_ortam) altında siyahların grileşmeden ne kadar net kalacağını gösterir.
                </p>
                <p className="text-slate-400 text-[11px]">
                  <b>10:1:</b> Yazıların okunabildiği minimum sınır.<br/>
                  <b>20:1 - 50:1:</b> Müze sergisi için zengin renk ve canlı görsel kalitesi.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1 text-slate-400">
              <span className="font-semibold text-slate-200 block">🎨 Isı Haritası (Heatmap) Renk Skalası Anlamı:</span>
              <p>
                <b>Mavi:</b> Işığın zayıf kaldığı veya köşe düşüşü yaşanan loş bölgeler.<br/>
                <b>Yeşil / Sarı:</b> Tasarımın hedeflediği ideal, homojen parlaklık alanı.<br/>
                <b>Kırmızı:</b> Aşırı parlaklık veya harmanlanmamış örtüşme tepe noktası (Hotspot).
              </p>
            </div>
          </div>
        )}

      </div>
        </div>
      )}
    </div>
  );
}
