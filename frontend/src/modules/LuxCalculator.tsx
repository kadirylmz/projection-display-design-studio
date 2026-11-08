import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LengthUnit, toMeters, round } from '../engine/units';
import {
  simulatePhotometricLux,
  parseIES,
  getLuxColorRGB,
  Projector3DConfig,
  Surface3DConfig,
  PhotometricSimulationResult,
  SurfaceGeometryType,
  IESData
} from '../engine/photometrics';

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
  // Görünüm Modu ve Sekmeler
  const [activeTab, setActiveTab] = useState<'heatmap' | 'ansi9' | 'overlap' | 'scenarios' | '3d'>('heatmap');
  const [advancedMode, setAdvancedMode] = useState<boolean>(true);

  // Yüzey Parametreleri
  const [screenW, setScreenW] = useState<number>(6); // metre cinsinden default
  const [screenH, setScreenH] = useState<number>(3.375); // 16:9 oran
  const [geometry, setGeometry] = useState<SurfaceGeometryType>('flat');
  const [curveRadius, setCurveRadius] = useState<number>(8);
  const [curveAngle, setCurveAngle] = useState<number>(60);
  const [inclineAngle, setInclineAngle] = useState<number>(0);
  const [screenGain, setScreenGain] = useState<number>(1.0);
  const [surfaceReflectance, setSurfaceReflectance] = useState<number>(0.85);
  const [ambientLux, setAmbientLux] = useState<number>(20); // 20 lx müze ortamı default

  // Grid Çözünürlüğü
  const [gridRes, setGridRes] = useState<'15x10' | '30x20' | '50x30' | '80x45'>('30x20');

  // Projektörler Listesi
  const [projectors, setProjectors] = useState<Projector3DConfig[]>([
    {
      id: 'proj-1',
      name: 'Projektör 1 (Sol/Ana)',
      model: 'Barco / Panasonic 12K',
      ansiLumens: 12000,
      efficiency: 0.90,
      pos: [1.8, 1.7, 4.2],
      target: [2.0, 1.7, 0],
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      throwRatio: 1.4,
      zoom: 1.0,
      lensModel: 'Standart Zoom Lens 1.2-1.8:1',
      cornerUniformity: 0.85,
      photometricSource: 'ansi_cosine',
      enabled: true,
      color: '#38bdf8'
    },
    {
      id: 'proj-2',
      name: 'Projektör 2 (Sağ/Overlap)',
      model: 'Barco / Panasonic 12K',
      ansiLumens: 12000,
      efficiency: 0.90,
      pos: [4.2, 1.7, 4.2],
      target: [4.0, 1.7, 0],
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      throwRatio: 1.4,
      zoom: 1.0,
      lensModel: 'Standart Zoom Lens 1.2-1.8:1',
      cornerUniformity: 0.85,
      photometricSource: 'ansi_cosine',
      enabled: true,
      color: '#a855f7'
    }
  ]);

  const [selectedProjId, setSelectedProjId] = useState<string>('proj-1');
  const [blendOverlap, setBlendOverlap] = useState<boolean>(true);
  const [showHotDarkSpots, setShowHotDarkSpots] = useState<boolean>(true);
  const [showIsoContours, setShowIsoContours] = useState<boolean>(false);

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
  }, [projectors, surfaceConfig, cols, rows, blendOverlap]);

  // Canvas Çizimi (Heatmap)
  useEffect(() => {
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
        // Basit dikey/yatay seviye eşik çizgileri belirteci
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
  }, [simResult, showHotDarkSpots, showIsoContours, surfaceConfig.widthM, surfaceConfig.heightM]);

  // Canvas Çizimi (Overlap Görselleştirmesi)
  useEffect(() => {
    if (activeTab !== 'overlap') return;
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
          // Örtüşme Bölgesi: Canlı Mor/Pembe
          ctx.fillStyle = 'rgba(217, 70, 239, 0.75)';
        } else if (cell.overlapCount === 1) {
          // Tek Projektör: Mavi / Camgöbeği
          ctx.fillStyle = 'rgba(14, 165, 233, 0.45)';
        } else {
          // Işık Düşmeyen Bölge: Koyu Gri
          ctx.fillStyle = '#0f172a';
        }
        ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
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

  // Yeni Projektör Ekleme
  const handleAddProjector = () => {
    const newIdx = projectors.length + 1;
    const newProj: Projector3DConfig = {
      id: `proj-${Date.now()}`,
      name: `Projektör ${newIdx}`,
      model: '12K ANSI Laser',
      ansiLumens: 12000,
      efficiency: 0.90,
      pos: [round(newIdx * 1.5, 2), 1.7, 4.2],
      target: [round(newIdx * 1.5, 2), 1.7, 0],
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      throwRatio: 1.4,
      zoom: 1.0,
      cornerUniformity: 0.85,
      photometricSource: 'ansi_cosine',
      enabled: true,
      color: ['#38bdf8', '#a855f7', '#10b981', '#f59e0b', '#ec4899'][newIdx % 5]
    };
    setProjectors(prev => [...prev, newProj]);
    setSelectedProjId(newProj.id);
  };

  // Projektör Kaldırma
  const handleRemoveProjector = (id: string) => {
    if (projectors.length <= 1) return;
    setProjectors(prev => prev.filter(p => p.id !== id));
    if (selectedProjId === id) {
      setSelectedProjId(projectors[0].id);
    }
  };

  // Seçili Projektör
  const currentProj = projectors.find(p => p.id === selectedProjId) || projectors[0];

  const updateSelectedProj = (patch: Partial<Projector3DConfig>) => {
    setProjectors(prev => prev.map(p => p.id === selectedProjId ? { ...p, ...patch } : p));
  };

  // Senaryo Karşılaştırma Listesi (Örnek Parametreler)
  const comparisonScenarios: ScenarioComparisonItem[] = useMemo(() => {
    const list = [
      { name: 'Giriş Seviyesi (7.000 lm)', lumens: 7000, dist: 3.8 },
      { name: 'Mevcut Kurulum (12.000 lm)', lumens: currentProj?.ansiLumens || 12000, dist: 4.2 },
      { name: 'Yüksek Işık / Gün Işığı (16.000 lm)', lumens: 16000, dist: 4.5 },
      { name: 'Büyük Mekan / Mapping (20.000 lm)', lumens: 20000, dist: 5.2 }
    ];

    const wM = toMeters(screenW, unit);
    const hM = toMeters(screenH, unit);
    const area = Math.max(0.01, wM * hM);

    return list.map(item => {
      // Simülasyon modeliyle yaklaşık senaryo karşılaştırması
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

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[380px_1fr] gap-4 h-full text-slate-100 p-2 sm:p-4 overflow-hidden">
      {/* SOL PANEL: KONTROLLER VE PARAMETRELER */}
      <div className="flex flex-col gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-y-auto max-h-[85vh] lg:max-h-full text-xs sm:text-sm">
        
        {/* Başlık ve Mod Seçimi */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div>
            <h2 className="font-bold text-base text-sky-400">Photometric Studio</h2>
            <p className="text-[11px] text-slate-400">Point-by-Point Lux Simulation</p>
          </div>
          <label className="flex items-center gap-1.5 text-xs bg-slate-800 px-2 py-1 rounded cursor-pointer border border-slate-700">
            <input
              type="checkbox"
              checked={advancedMode}
              onChange={e => setAdvancedMode(e.target.checked)}
              className="rounded text-sky-500"
            />
            <span className="font-medium text-slate-300">Gelişmiş Mod</span>
          </label>
        </div>

        {/* PROJEKSİYON YÜZEYİ GEOMETRİSİ */}
        <div className="space-y-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
          <h3 className="font-semibold text-slate-200 flex items-center justify-between text-xs tracking-wider uppercase">
            <span>1. Yüzey Geometrisi</span>
            <span className="text-[10px] text-sky-400 lowercase">{geometry}</span>
          </h3>

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
            <label className="text-[11px] text-slate-400">Yüzey Tipi & Geometri</label>
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

          {geometry === 'inclined' && (
            <div>
              <label className="text-[10px] text-slate-400">Eğim Açısı (° - 0: Düşey, 45: Yarı Eğim)</label>
              <input
                type="number"
                step="5"
                min="0"
                max="90"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                value={inclineAngle}
                onChange={e => setInclineAngle(+e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
            <div>
              <label className="text-[11px] text-slate-400" title="Screen Gain yüzeye gelen Lux'ü değiştirmez, yansıyan Nits parlaklığını çarpar.">
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
            <button
              type="button"
              onClick={() => setAmbientLux(5)}
              className={`p-1 rounded text-center border ${ambientLux === 5 ? 'bg-amber-950/60 border-amber-500 text-amber-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
            >
              5 lx<br/><span className="text-[9px] opacity-75">Karanlık</span>
            </button>
            <button
              type="button"
              onClick={() => setAmbientLux(20)}
              className={`p-1 rounded text-center border ${ambientLux === 20 ? 'bg-amber-950/60 border-amber-500 text-amber-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
            >
              20 lx<br/><span className="text-[9px] opacity-75">Müze</span>
            </button>
            <button
              type="button"
              onClick={() => setAmbientLux(100)}
              className={`p-1 rounded text-center border ${ambientLux === 100 ? 'bg-amber-950/60 border-amber-500 text-amber-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
            >
              100 lx<br/><span className="text-[9px] opacity-75">Galeri</span>
            </button>
            <button
              type="button"
              onClick={() => setAmbientLux(300)}
              className={`p-1 rounded text-center border ${ambientLux === 300 ? 'bg-amber-950/60 border-amber-500 text-amber-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
            >
              300 lx<br/><span className="text-[9px] opacity-75">Ofis</span>
            </button>
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
            <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase">3. Projektörler ({projectors.length})</h3>
            <button
              type="button"
              onClick={handleAddProjector}
              className="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium"
            >
              + Projektör Ekle
            </button>
          </div>

          {/* Projektör Sekmeleri */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {projectors.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProjId(p.id)}
                className={`flex-1 min-w-[70px] text-xs py-1 px-2 rounded border truncate text-center ${
                  p.id === selectedProjId
                    ? 'border-sky-500 bg-sky-950/50 text-sky-200 font-semibold'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                P{idx + 1} {p.enabled ? '' : '(Kapalı)'}
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
                  onChange={e => updateSelectedProj({ name: e.target.value })}
                />
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-400 flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentProj.enabled}
                      onChange={e => updateSelectedProj({ enabled: e.target.checked })}
                    />
                    Aktif
                  </label>
                  {projectors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveProjector(currentProj.id)}
                      className="text-red-400 hover:text-red-300 text-xs font-bold px-1"
                      title="Projektörü Sil"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400">ANSI Lümen (lm)</label>
                  <input
                    type="number"
                    step="500"
                    min="100"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-sky-400 font-mono font-bold"
                    value={currentProj.ansiLumens}
                    onChange={e => updateSelectedProj({ ansiLumens: Math.max(1, +e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400" title="Optik verim ve kalibrasyon katsayısı (0.1 - 1.0)">
                    Optik Verim (η): <span className="font-bold text-slate-200">{round(currentProj.efficiency, 2)}</span>
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.0"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                    value={currentProj.efficiency}
                    onChange={e => updateSelectedProj({ efficiency: Math.max(0.1, Math.min(1.0, +e.target.value)) })}
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
                      onChange={e => updateSelectedProj({ pos: [+e.target.value, currentProj.pos[1], currentProj.pos[2]] })}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500">Y (Yükseklik)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono"
                      value={currentProj.pos[1]}
                      onChange={e => updateSelectedProj({ pos: [currentProj.pos[0], +e.target.value, currentProj.pos[2]] })}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500">Z (Mesafe)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono"
                      value={currentProj.pos[2]}
                      onChange={e => updateSelectedProj({ pos: [currentProj.pos[0], currentProj.pos[1], Math.max(0.1, +e.target.value)] })}
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
                    step="0.1"
                    min="0.2"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                    value={currentProj.throwRatio}
                    onChange={e => updateSelectedProj({ throwRatio: Math.max(0.1, +e.target.value) })}
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
                    onChange={e => updateSelectedProj({ cornerUniformity: Math.max(0.4, Math.min(1.0, +e.target.value)) })}
                  />
                </div>
              </div>

              {/* IES / LDT Dosyası Yükleme */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-slate-300 font-medium">Fotometrik Veri Kaynağı</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${currentProj.photometricSource === 'ies' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                    {currentProj.photometricSource === 'ies' ? 'Doğrulanmış IES' : 'ANSI Kosinüs (Tahmini)'}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <label className="flex-1 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 text-center py-1 px-2 rounded border border-slate-700 text-xs">
                    📁 .IES Dosyası Seç
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
                      onClick={() => updateSelectedProj({ photometricSource: 'ansi_cosine', iesData: undefined })}
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

        {/* HESAPLAMA AYARLARI */}
        <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-lg border border-slate-800 text-xs">
          <label className="text-slate-400">Grid Çözünürlüğü:</label>
          <div className="flex gap-1">
            {(['15x10', '30x20', '50x30'] as const).map(res => (
              <button
                key={res}
                type="button"
                onClick={() => setGridRes(res)}
                className={`px-2 py-0.5 rounded text-[11px] ${gridRes === res ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-400'}`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* SAĞ PANEL: SİMÜLASYON GÖRSELİ, SEKME İÇERİKLERİ VE ANALİZ TABLOLARI */}
      <div className="flex flex-col gap-3 min-w-0 overflow-y-auto">

        {/* Üst Sekmeler */}
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
              ANSI 9-Nokta Analizi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('overlap')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === 'overlap' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Çoklu Örtüşme & Blend
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scenarios')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === 'scenarios' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Senaryo Karşılaştırma
            </button>
          </div>

          {/* Dışa Aktar Düğmeleri */}
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
              CSV Veri Aktar
            </button>
          </div>
        </div>

        {/* ANA GÖRSELLEŞTİRME ALANI (HEATMAP / ANSI9 / OVERLAP) */}
        {activeTab === 'heatmap' && (
          <div className="space-y-3">
            {/* Isı Haritası Tuvali */}
            <div className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-2 flex flex-col items-center justify-center">
              <div className="relative w-full max-w-[840px] aspect-[16/9] flex items-center justify-center bg-black/40 rounded-lg overflow-hidden">
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
                  <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-700 text-slate-100 p-2.5 rounded shadow-lg text-xs pointer-events-none space-y-1">
                    <div className="font-semibold text-sky-400 flex items-center justify-between gap-4">
                      <span>Nokta: X: {round(hoveredCell.xM, 2)}m, Y: {round(hoveredCell.yM, 2)}m</span>
                      <span className="text-[10px] bg-sky-950 px-1 rounded text-sky-300">
                        {hoveredCell.overlapCount > 1 ? `${hoveredCell.overlapCount} Projektör (Overlap)` : 'Tek Işık'}
                      </span>
                    </div>
                    <div className="text-sm font-mono font-bold text-emerald-400">
                      {round(hoveredCell.lux, 1)} Lux
                    </div>
                    <div className="text-[11px] text-slate-300">
                      Yansıyan Parlaklık: <span className="font-semibold text-amber-300">{round(hoveredCell.nits, 1)} cd/m²</span> ({round(hoveredCell.nits * 0.2919, 1)} fL)
                    </div>
                    {hoveredCell.perProjLux.length > 1 && (
                      <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                        Projektörler: {hoveredCell.perProjLux.map((lx, i) => `P${i + 1}: ${round(lx, 0)} lx`).join(' + ')}
                      </div>
                    )}
                  </div>
                )}

                {/* Renk Skalası Lejantı (Gradient Bar) */}
                <div className="absolute bottom-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-2 rounded shadow text-xs flex flex-col gap-1 items-center">
                  <span className="text-[10px] text-slate-400 font-mono">Lux Skalası</span>
                  <div className="w-48 h-3 rounded bg-gradient-to-r from-[#00008b] via-[#00ffff] via-[#00ff00] via-[#ffff00] via-[#ff8c00] to-[#ff0000]" />
                  <div className="w-full flex justify-between text-[10px] font-mono text-slate-300">
                    <span>{Math.round(simResult.minLux)} lx</span>
                    <span>{Math.round((simResult.minLux + simResult.maxLux) / 2)} lx</span>
                    <span>{Math.round(simResult.maxLux)} lx</span>
                  </div>
                </div>
              </div>

              {/* Ekran Altı Kontrolleri */}
              <div className="w-full flex items-center justify-between text-xs text-slate-400 pt-2 px-2">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showHotDarkSpots}
                      onChange={e => setShowHotDarkSpots(e.target.checked)}
                      className="rounded text-sky-500"
                    />
                    Hotspot & Min Göster
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showIsoContours}
                      onChange={e => setShowIsoContours(e.target.checked)}
                      className="rounded text-sky-500"
                    />
                    Eş-Lux Çizgileri (Iso-Lux)
                  </label>
                </div>
                <div className="text-[11px] text-slate-500">
                  {simResult.isEstimatedModel ? '⚠ Yaklaşık model (Kosinüs/Datasheet)' : '✓ IES Ölçüm Modeli'}
                </div>
              </div>
            </div>

            {/* FOTOMETRİK ÖZET METRİK KARTLARI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-[11px] text-slate-400">Ortalama Aydınlık (E_avg)</div>
                <div className="text-xl font-bold font-mono text-sky-400 mt-0.5">
                  {Math.round(simResult.avgLux)} <span className="text-xs font-normal text-slate-400">Lux</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Min: {Math.round(simResult.minLux)} lx / Max: {Math.round(simResult.maxLux)} lx
                </div>
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-[11px] text-slate-400">Düzgünlük (Uniformity U0)</div>
                <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
                  %{round(simResult.uniformityU0 * 100, 1)}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  U0 = Emin/Eavg | U1 (Min/Max): %{round(simResult.uniformityU1 * 100, 1)}
                </div>
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-[11px] text-slate-400">Yansıyan Parlaklık (Luminance)</div>
                <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">
                  {Math.round(simResult.avgLuminanceNits)} <span className="text-xs font-normal text-slate-400">cd/m²</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {round(simResult.avgLuminanceFL, 1)} Foot-Lambert (Gain {screenGain}x)
                </div>
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-[11px] text-slate-400">Ortam Kontrastı (ACR)</div>
                <div className="text-xl font-bold font-mono text-purple-400 mt-0.5">
                  {round(simResult.ambientContrastRatio, 1)}:1
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Ortam: {ambientLux} Lux ({ambientLux > 50 ? 'Yüksek' : 'İdeal'})
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ANSI 9-NOKTA ANALİZİ SEKMESİ */}
        {activeTab === 'ansi9' && (
          <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-semibold text-slate-200 text-sm">ANSI 9-Nokta Standart Fotometrik Ölçüm</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Yüzey 3x3 bölgeye ayrılarak merkez ve köşe noktalarında standart endüstri testi gerçekleştirilir.
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

        {/* ÇOKLU ÖRTÜŞME & BLENDING SEKMESİ */}
        {activeTab === 'overlap' && (
          <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200 text-sm">Çoklu Projektör Örtüşme (Overlap) & Blend Analizi</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Aynı yüzey noktasına düşen projektör ışıklarının süperpozisyonu ve harmanlama kompanzasyonu.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs bg-slate-800 px-3 py-1.5 rounded border border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blendOverlap}
                  onChange={e => setBlendOverlap(e.target.checked)}
                  className="rounded text-sky-500"
                />
                <span className="font-medium text-slate-300">Soft-Edge Blending Dengeleme</span>
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
                  <span>Tek Projektör Alanı</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-[#d946ef]" />
                  <span>Örtüşme (Overlap) Bölgesi (Toplanan Işık)</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-2">
              <span className="font-semibold text-slate-300 block">Matematiksel Süperpozisyon Kuralı:</span>
              <p className="text-slate-400 font-mono text-[11px]">
                E_total(x, y) = E1(x, y) + E2(x, y) + ... + En(x, y)
              </p>
              <p className="text-slate-400 text-[11px]">
                {blendOverlap
                  ? 'Soft-Edge Blending aktif: Örtüşme bölgesindeki aşırı parlaklık artışı (hotspot) doğrusal rampa maskesi ile dengelenmiştir.'
                  : 'Harmansız mod: Örtüşen hücrelerde projektör aydınlıkları doğrudan toplanır, tepe parlaklık artar.'}
              </p>
            </div>
          </div>
        )}

        {/* SENARYO KARŞILAŞTIRMA SEKMESİ */}
        {activeTab === 'scenarios' && (
          <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-semibold text-slate-200 text-sm">Farklı Lümen & Mesafe Senaryoları Karşılaştırması</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Aynı ekran geometrisi üzerinde farklı projektör modelleri ve atım mesafelerinin fotometrik karşılaştırması.
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

        {/* FOTOMETRİK TEKNİK BİLGİ VE STANDARTLAR AÇIKLAMASI */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
          <div className="font-semibold text-slate-300">Fotometrik Hesaplama Yöntemi & Standartlar</div>
          <div className="grid sm:grid-cols-2 gap-2 text-[10px]">
            <div>
              <span className="text-slate-300 font-medium">Point-by-Point Formülü:</span> E = I(θ) · cos(α) / r²
              <br/>
              Burada I(θ) ilgili yöndeki Candela şiddetini, α ışın ile yüzey normali arasındaki açıyı, r ise projektör ile nokta arasındaki mesafeyi temsil eder.
            </div>
            <div>
              <span className="text-slate-300 font-medium">Aydınlık (Lux) vs Parlaklık (Luminance):</span>
              <br/>
              Lux ekrana gelen ışık akısını temsil eder; Screen Gain Lux değerini değiştirmez. Yüzeyden göze yansıyan parlaklık L = E · Gain / π formülü ile cd/m² (Nit) cinsinden hesaplanır.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
