import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    setActiveTab,
    setAdvancedMode,
    importFromPlannerSurface,
    updateSelectedProjector,
    addProjector,
    removeProjector
  } = usePhotometricStore();

  // İlk açılışta projede tanımlı yüzey varsa otomatik senkronize et (eğer custom bırakılmışsa ve hiç projektör seçilmemişse)
  useEffect(() => {
    if (selectedSurfaceId === 'custom' && plannerSurfaces.length > 0 && projectors.length <= 2) {
      importFromPlannerSurface(plannerSurfaces[0], defaultProjectorLumens);
    }
  }, [plannerSurfaces, selectedSurfaceId, importFromPlannerSurface, defaultProjectorLumens, projectors.length]);

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

  // Canvas Çizimi (Heatmap) - activeTab değiştiğinde ve simülasyon güncellendiğinde anında çizilir
  useEffect(() => {
    if (activeTab !== 'heatmap') return;

    const render = () => {
      const canvas = heatmapCanvasRef.current;
      if (!canvas || !simResult) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cellW = w / simResult.cols;
      const cellH = h / simResult.rows;

      const min = simResult.minLux;
      const max = simResult.maxLux;

      // Grid Hücrelerini Çiz
      for (let r = 0; r < simResult.rows; r++) {
        for (let c = 0; c < simResult.cols; c++) {
          const idx = r * simResult.cols + c;
          const cell = simResult.grid[idx];
          if (!cell) continue;

          const [red, green, blue] = getLuxColorRGB(cell.totalLux, min, max);
          ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
          ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
        }
      }

      // Iso Contour çizgileri
      if (showIsoContours && max > min) {
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

      // Hotspot & Darkspot Göstergeleri
      if (showHotDarkSpots && simResult.hotspot && simResult.darkspot) {
        // Hotspot (Maksimum)
        const hotNormX = simResult.hotspot.xM / surfaceConfig.widthM;
        const hotNormY = simResult.hotspot.yM / surfaceConfig.heightM;
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
        const darkNormX = simResult.darkspot.xM / surfaceConfig.widthM;
        const darkNormY = simResult.darkspot.yM / surfaceConfig.heightM;
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
  }, [simResult, activeTab, showHotDarkSpots, showIsoContours, surfaceConfig.widthM, surfaceConfig.heightM]);

  // Canvas Çizimi (Overlap Görselleştirmesi)
  useEffect(() => {
    if (activeTab !== 'overlap') return;

    const renderOverlap = () => {
      const canvas = overlapCanvasRef.current;
      if (!canvas || !simResult) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

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
          ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
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
    const px = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const py = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const col = Math.min(Math.floor((px / rect.width) * simResult.cols), simResult.cols - 1);
    const row = Math.min(Math.floor((py / rect.height) * simResult.rows), simResult.rows - 1);

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
        pos: [wM / 2, hM / 2, item.dist],
        target: [wM / 2, hM / 2, 0],
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

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[400px_1fr] gap-4 h-full text-slate-100 p-2 sm:p-4 overflow-hidden">
      
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

        {/* 🌟 PROJE İLE OTOMATİK SENKRONİZASYON (KULLANICININ ZATEN GİRDİĞİ YÜZEY VE PROJEKTÖRLER) */}
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

        {/* 🌟 ANA GÖRSELLEŞTİRME: 2D ISI HARİTASI */}
        {activeTab === 'heatmap' && (
          <div className="space-y-3">
            {/* Isı Haritası Tuvali */}
            <div className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-2 flex flex-col items-center justify-center">
              <div className="relative w-full max-w-[840px] aspect-[16/9] flex items-center justify-center bg-black/50 rounded-lg overflow-hidden border border-slate-800/80">
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

              {/* Alt Kontroller */}
              <div className="w-full flex items-center justify-between text-xs text-slate-400 pt-2 px-2">
                <div className="flex items-center gap-4">
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

            {/* 🌟 AÇIKLAYICI METRİK KARTLARI (NE ANLAMA GELDİĞİ VE MÜHENDİSLİK YORUMU) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
              
              {/* ORTALAMA LUX */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Ortalama Aydınlık (Lux)</span>
                    <span className="text-[10px] text-slate-500 font-mono">E_avg</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-sky-400 mt-1">
                    {Math.round(simResult.avgLux)} <span className="text-xs font-normal text-slate-400">Lux (lm/m²)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Min: <b className="text-sky-300">{Math.round(simResult.minLux)}</b> / Max: <b className="text-amber-300">{Math.round(simResult.maxLux)}</b> lx
                  </div>
                </div>
                <div className={`mt-2 p-1.5 rounded text-[10.5px] border font-medium ${luxEval.color}`}>
                  {luxEval.text}
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
                    %{round(simResult.uniformityU0 * 100, 1)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    U1 (Min/Maks): <b className="text-slate-200">%{round(simResult.uniformityU1 * 100, 1)}</b>
                  </div>
                </div>
                <div className="mt-2 p-1.5 rounded text-[10.5px] border border-slate-800 bg-slate-950 font-medium text-slate-300">
                  <span className={uniEval.color}>{uniEval.text}</span>
                </div>
              </div>

              {/* YANSIYAN PARLAKLIK (NITS) */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Gözlenen Parlaklık (Luminance)</span>
                    <span className="text-[10px] text-slate-500 font-mono">Gain: {screenGain}x</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                    {Math.round(simResult.avgLuminanceNits)} <span className="text-xs font-normal text-slate-400">cd/m² (Nit)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Foot-Lambert: <b className="text-slate-200">{round(simResult.avgLuminanceFL, 1)} fL</b>
                  </div>
                </div>
                <div className="mt-2 p-1.5 rounded text-[10.5px] border border-slate-800 bg-slate-950 font-medium text-slate-300">
                  {simResult.avgLuminanceNits > 100 ? '✓ TV / LED netliğinde parlaklık' : '✓ Loş sinema standardı'}
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
                    {round(simResult.ambientContrastRatio, 1)}:1
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {ambientLux === 0 ? 'Tamamen karanlık oda' : `${ambientLux} Lux ortam ışığı altında`}
                  </div>
                </div>
                <div className="mt-2 p-1.5 rounded text-[10.5px] border border-slate-800 bg-slate-950 font-medium text-slate-300">
                  <span className={acrEval.color}>{acrEval.text}</span>
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

        {/* 🌟 YENİ REHBER: "NASIL YORUMLANIR & NE ANLAMA GELİR?" */}
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
                  Projektörden çıkan ışığın ekranın 1 metrekaresine düşen miktarıdır ($lm/m^2$).
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
  );
}
