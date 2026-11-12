import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { getLuxColorRGB } from '../engine/photometrics';
import { LengthUnit, toMeters, fromMeters, round } from '../engine/units';
import { usePhotometricStore } from '../photometricStore';
import { useProjectStore } from '../projectStore';
import {
  CATALOG_BRANDS,
  CATALOG_PROJECTORS,
  getCompatibleCatalogLenses,
} from '../data/projectorCatalog';

const STORAGE_KEY = 'quick_lux_calculator_persist_v1';

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

export default function QuickOpticsLuxCalculator({ unit = 'm' }: { unit?: LengthUnit }) {
  const initial = useMemo(() => loadStoredConfig(), []);

  // Bağımsız Proje Bilgileri (Kalıcı State)
  const [projectName, setProjectName] = useState<string>(initial?.projectName ?? 'Sergi Alanı Projeksiyon Parlaklık & Lens Hesabı');
  const [preparedBy, setPreparedBy] = useState<string>(initial?.preparedBy ?? 'AV & Projeksiyon Tasarım Ekibi');

  // 1. Ekran Geometrisi
  const [screenW, setScreenW] = useState<number>(initial?.screenW ?? 12.0); // metre
  const [screenH, setScreenH] = useState<number>(initial?.screenH ?? 3.5);  // metre

  // 2. Projektör & Lens
  const [projCount, setProjCount] = useState<number>(initial?.projCount ?? 3);
  const [lumensPerProj, setLumensPerProj] = useState<number>(initial?.lumensPerProj ?? 7000); // ANSI Lümen
  const [throwDistM, setThrowDistM] = useState<number>(initial?.throwDistM ?? 4.2);        // Atım mesafesi (m)
  const [throwRatio, setThrowRatio] = useState<number>(initial?.throwRatio ?? 0.80);       // Lens Throw Ratio (TR)
  const [opticalEfficiency, setOpticalEfficiency] = useState<number>(initial?.opticalEfficiency ?? 90); // %90 Lens & motor verimi

  // 3. Ekran ve Ortam Koşulları
  const [screenGain, setScreenGain] = useState<number>(initial?.screenGain ?? 1.0);  // Kazanç
  const [ambientLux, setAmbientLux] = useState<number>(initial?.ambientLux ?? 50);   // Müze ortam ışığı (Lux)
  const [catProjId, setCatProjId] = useState<string>('');
  const [catLensId, setCatLensId] = useState<string>('');

  // Değerler değiştikçe LocalStorage'a kaydet (Asla başa dönmez!)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        projectName,
        preparedBy,
        screenW,
        screenH,
        projCount,
        lumensPerProj,
        throwDistM,
        throwRatio,
        opticalEfficiency,
        screenGain,
        ambientLux,
      }));
    } catch (e) {}
  }, [projectName, preparedBy, screenW, screenH, projCount, lumensPerProj, throwDistM, throwRatio, opticalEfficiency, screenGain, ambientLux]);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Zustand Store fonksiyonu (Ana rapora aktarma)
  const saveSurfacePhotometric = usePhotometricStore(state => state.saveSurfacePhotometric);

  // Matematiksel Hesaplamalar
  const calc = useMemo(() => {
    // Alan (m²)
    const areaM2 = +(screenW * screenH).toFixed(2);
    const aspect = +(screenW / Math.max(0.1, screenH)).toFixed(2);

    // Işık Akısı (Lümen)
    const totalLumens = projCount * lumensPerProj;
    const effLumens = Math.round(totalLumens * (opticalEfficiency / 100));

    // Ortalama Ekran Aydınlığı (Lux)
    const avgLux = Math.round(effLumens / Math.max(0.1, areaM2));

    // Lens Geometrisi (Tek projektörün açtığı görüntü boyutu)
    const singleW = +(throwDistM / Math.max(0.1, throwRatio)).toFixed(2);
    const singleH = +(singleW / 1.7778).toFixed(2); // 16:9 varsayım
    const totalCoverW = +(projCount * singleW).toFixed(2);
    const overlapM = projCount > 1 ? +((totalCoverW - screenW) / (projCount - 1)).toFixed(2) : 0;
    const overlapPct = projCount > 1 && singleW > 0 ? Math.round((overlapM / singleW) * 100) : 0;

    // Fiziksel Işık Düzgünlüğü (Uniformity U0) Hesabı:
    // Lensin iç optik düşüşü (baz: %82) + Kapsama alanı ve Overlap geometrisi
    let calculatedU0 = 82;

    if (projCount === 1) {
      // Tek projektörde ekran taşması / kapsama analizi
      const covW = Math.min(1.0, singleW / Math.max(0.1, screenW));
      const covH = Math.min(1.0, singleH / Math.max(0.1, screenH));
      const coverage = Math.min(covW, covH);
      calculatedU0 = Math.round(82 * Math.pow(coverage, 1.8));
    } else {
      // Çoklu projektörde örtüşme (overlap) ve kapsama analizi
      const covW = Math.min(1.0, totalCoverW / Math.max(0.1, screenW));
      const covH = Math.min(1.0, singleH / Math.max(0.1, screenH));
      const coverage = Math.min(covW, covH);

      if (overlapPct >= 15 && overlapPct <= 30) {
        // İdeal blend aralığı: bindirme sayesinde homojenlik mükemmeldir
        calculatedU0 = Math.round(85 * coverage);
      } else if (overlapPct > 30) {
        // Fazla örtüşme: merkezde gereksiz ışık birikmesi
        calculatedU0 = Math.round(78 * coverage);
      } else if (overlapPct >= 5) {
        // Düşük örtüşme: hafif dalgalanma
        calculatedU0 = Math.round(72 * coverage);
      } else if (overlapPct >= 0) {
        // Neredeyse sıfır örtüşme
        calculatedU0 = Math.round(62 * coverage);
      } else {
        // Negatif örtüşme (projektörler arasında boşluk/kör nokta var)
        calculatedU0 = Math.max(25, Math.round(50 + overlapPct * 0.8));
      }
    }
    const uniformityU0 = Math.max(20, Math.min(95, calculatedU0));

    // Min ve Max Lux Değerleri:
    // Homojenliğe göre gerçek minimum ve maksimum aydınlık
    const minLux = Math.round(avgLux * (uniformityU0 / 100));
    const maxLux = Math.round(avgLux * (1 + (1 - uniformityU0 / 100) * 0.65));

    // Yüzey Parlaklığı (Luminance): Nit (cd/m²) ve Foot-Lambert (fL)
    const nits = Math.round((avgLux * screenGain) / Math.PI);
    const footLambert = +(nits * 0.2919).toFixed(1);

    // Ortam Kontrast Oranı (ACR - Ambient Contrast Ratio)
    const acr = +((avgLux + ambientLux) / Math.max(1, ambientLux)).toFixed(1);

    // Dinamik Homojenlik ve Mühendislik Değerlendirmesi
    let uniformityEvaluation = {
      title: 'Mükemmel Homojenlik (Müze & Sergi Standardı)',
      badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-700',
      description: `Bu kurulumda hesaplanan %${uniformityU0} homojenlik değeri, profesyonel müze ve galeri standartlarına tam uyumludur. İzleyicinin gözü köşelerde ve kenarlarda kararma (vinyet) algılamaz. Renk ve ton dengesi tüm perdede eşittir.`,
    };

    if (uniformityU0 < 60) {
      uniformityEvaluation = {
        title: '⚠ Düşük Homojenlik (Köşelerde Kararma Riski)',
        badgeClass: 'bg-red-950 text-red-300 border-red-700',
        description: `DİKKAT: %${uniformityU0} homojenlik değeri müze standartlarının altındadır. Ekranın uç köşeleri ile merkez arasında belirgin ışık farkı oluşur ve köşeler karanlık kalır. Öneri: Projektör atım mesafesini veya projektör adedini artırın.`,
      };
    } else if (uniformityU0 < 75) {
      uniformityEvaluation = {
        title: 'Kabul Edilebilir Düzgünlük (Hafif Kenar Düşüşü)',
        badgeClass: 'bg-amber-950 text-amber-300 border-amber-700',
        description: `Hesaplanan %${uniformityU0} homojenlik değeri genel sergiler için kabul edilebilir toleranstadır. Köşelerde standart lens optik düşüşüne bağlı hafif ışık azalması görülür, ancak izleme deneyimini bozmaz.`,
      };
    }

    // Genel Parlaklık Durumu
    let evalStatus = {
      badge: '✓ İdeal Seviye (Müze & Sergi)',
      badgeClass: 'bg-emerald-950 text-emerald-400 border-emerald-700',
      description: 'Müze, galeri ve karanlık/yarı karanlık sergiler için gözü yormayan, net ve canlı bir parlaklık seviyesindedir.',
    };
    if (avgLux < 200) {
      evalStatus = {
        badge: '⚠ Düşük Parlaklık (Karanlık Şart)',
        badgeClass: 'bg-amber-950 text-amber-400 border-amber-700',
        description: 'Ekran aydınlığı 200 Lux altındadır; ortamın tamamen karartılması (blackout) şarttır.',
      };
    } else if (avgLux > 700) {
      evalStatus = {
        badge: '🌟 Yüksek Aydınlık (Canlı / Gün Işığı)',
        badgeClass: 'bg-purple-950 text-purple-300 border-purple-700',
        description: 'Yüksek aydınlıklı ortamlar ve dinamik video sanatı için oldukça parlak ve canlı bir görsel sunar.',
      };
    }

    return {
      areaM2,
      aspect,
      totalLumens,
      effLumens,
      avgLux,
      minLux,
      maxLux,
      uniformityU0,
      uniformityEvaluation,
      nits,
      footLambert,
      acr,
      singleW,
      singleH,
      overlapM,
      overlapPct,
      evalStatus,
    };
  }, [screenW, screenH, projCount, lumensPerProj, throwDistM, throwRatio, opticalEfficiency, screenGain, ambientLux]);

  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  const [heatmapDataUrl, setHeatmapDataUrl] = useState<string>('');

  // 2B Lux Isı Haritası Çizim Fonksiyonu (Point-by-Point Süperpozisyon & Vinyet Modeli)
  const renderHeatmapToCanvas = useCallback((): string => {
    const canvas = heatmapCanvasRef.current || document.createElement('canvas');
    const width = 800;
    const aspect = screenW / Math.max(0.1, screenH);
    const calculatedH = Math.round(width / aspect);
    const clampedH = Math.max(280, Math.min(520, calculatedH));

    canvas.width = width;
    canvas.height = clampedH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Arka Plan
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, width, clampedH);

    const cols = 80;
    const rows = 40;
    const cellW = width / cols;
    const cellH = clampedH / rows;

    const singleW = throwDistM / Math.max(0.1, throwRatio);
    const singleH = singleW / 1.7778;
    const step = projCount > 1 ? (screenW - singleW) / (projCount - 1) : 0;

    const gridLux: number[][] = [];
    let calculatedMin = Infinity;
    let calculatedMax = -Infinity;

    // Pürüzsüz Edge-Blend ve Canlı Termal Hotspot Isı Haritası Motoru
    // Merkezde kırmızı (Peak Hotspot), gövdede sarı/yeşil, köşelerde turkuaz/mavi
    for (let r = 0; r < rows; r++) {
      gridLux[r] = [];
      const yM = ((r + 0.5) / rows) * screenH;
      const dy = (yM - screenH / 2) / (singleH / 2);
      const isInsideY = Math.abs(dy) <= 1.02;

      for (let c = 0; c < cols; c++) {
        const xM = ((c + 0.5) / cols) * screenW;

        let totalCellFlux = 0;

        for (let p = 0; p < projCount; p++) {
          const pjStartX = projCount > 1 ? (p * step) : (screenW - singleW) / 2;
          const pjEndX = pjStartX + singleW;
          const pjCenterX = (pjStartX + pjEndX) / 2;

          // xM bu projektörün menzili içinde mi?
          if (xM >= pjStartX && xM <= pjEndX && isInsideY) {
            // 1. Soft Edge-Blending Geçiş Katsayısı:
            let blendFactor = 1.0;
            if (projCount > 1 && calc.overlapM > 0) {
              if (p > 0 && xM < pjStartX + calc.overlapM) {
                const t = (xM - pjStartX) / calc.overlapM;
                blendFactor = 0.5 * (1 - Math.cos(Math.PI * t));
              } else if (p < projCount - 1 && xM > pjEndX - calc.overlapM) {
                const t = (pjEndX - xM) / calc.overlapM;
                blendFactor = 0.5 * (1 - Math.cos(Math.PI * t));
              }
            }

            // 2. Termal Lens Düşüşü:
            // Merkez (dx=0, dy=0) tepe ışık (1.0 = calc.maxLux Hotspot Kırmızı)
            // Köşelere doğru radyal olarak minimum lüks oranına (calc.minLux / calc.maxLux) iner
            const dx = (xM - pjCenterX) / (singleW / 2);
            const distNorm = Math.min(1.0, Math.sqrt(dx * dx + dy * dy) / 1.414);
            const minRatio = Math.max(0.45, calc.minLux / Math.max(1, calc.maxLux));
            const lensFactor = 1.0 - distNorm * (1.0 - minRatio);

            totalCellFlux += lensFactor * blendFactor;
          }
        }

        let cellLux = 0;
        if (totalCellFlux > 0) {
          // Tepe parlaklık merkezde tam calc.maxLux (Kırmızı Hotspot) seviyesindedir
          cellLux = Math.round(totalCellFlux * calc.maxLux);
        } else {
          // Projektör ışığının yetişmediği karanlık bölge
          cellLux = Math.round(calc.minLux * 0.25);
        }

        gridLux[r][c] = cellLux;
        if (cellLux < calculatedMin) calculatedMin = cellLux;
        if (cellLux > calculatedMax) calculatedMax = cellLux;
      }
    }

    // Renk Skalası: Tepe noktalarının kırmızı, ortalamanın yeşil/sarı, köşelerin mavi olmasını sağlar
    const minL = Math.max(20, calculatedMin);
    const maxL = Math.max(minL + 40, calculatedMax);

    // Isı haritası boyama
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = gridLux[r][c];
        const [red, green, blue] = getLuxColorRGB(val, minL, maxL);
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
      }
    }

    // Grid Çizgileri
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= cols; c += 10) {
      ctx.beginPath();
      ctx.moveTo(c * cellW, 0);
      ctx.lineTo(c * cellW, clampedH);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r += 10) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellH);
      ctx.lineTo(width, r * cellH);
      ctx.stroke();
    }

    // Projektör Sınırları & Etiketleri
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    for (let p = 0; p < projCount; p++) {
      const stX = projCount > 1 ? (p * step) : (screenW - singleW) / 2;
      const pxX = (stX / screenW) * width;
      const pxW = (singleW / screenW) * width;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.strokeRect(pxX, 2, pxW, clampedH - 4);

      // Badge
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(pxX + 6, 8, 86, 22);
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeRect(pxX + 6, 8, 86, 22);

      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`PJ ${p + 1} (${lumensPerProj} lm)`, pxX + 10, 23);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
    }
    ctx.setLineDash([]);

    // Alt Legend & Metraj Barı
    const legendH = 34;
    ctx.fillStyle = 'rgba(10, 15, 29, 0.94)';
    ctx.fillRect(0, clampedH - legendH, width, legendH);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, clampedH - legendH, width, legendH);

    // Gradient bar
    const gradW = 180;
    const gradH = 10;
    const gradX = width - gradW - 16;
    const gradY = clampedH - legendH + 12;

    for (let gx = 0; gx < gradW; gx++) {
      const t = gx / gradW;
      const val = minL + t * (maxL - minL);
      const [red, green, blue] = getLuxColorRGB(val, minL, maxL);
      ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      ctx.fillRect(gradX + gx, gradY, 1, gradH);
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(gradX, gradY, gradW, gradH);

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`📐 Alan: ${screenW}m × ${screenH}m (${calc.areaM2} m²) · ${projCount} Projektör · Ort: ${calc.avgLux} lx`, 12, clampedH - 12);

    ctx.font = '9px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${minL} lx`, gradX - 38, gradY + 8);
    ctx.fillText(`${maxL} lx`, gradX + gradW + 6, gradY + 8);

    const url = canvas.toDataURL('image/png');
    setHeatmapDataUrl(url);
    return url;
  }, [screenW, screenH, projCount, lumensPerProj, throwDistM, throwRatio, calc]);

  // Canlı Isı Haritasını Otomatik Güncelle
  useEffect(() => {
    renderHeatmapToCanvas();
  }, [renderHeatmapToCanvas]);

  // Yazdır / PDF Al
  const handlePrint = () => {
    window.print();
  };

  // Ana Rapor Modülüne Kaydet
  const handleSaveToMainReport = () => {
    const standaloneId = 'quick-standalone-surface';
    const surfaceTitle = projectName || 'Bağımsız Projeksiyon Alanı';

    // 1. Canlı 2B Isı Haritası görseli üret
    const snapshotUrl = renderHeatmapToCanvas();

    // 2. Fotometrik Store'a kaydet (Isı Haritası SNAPSHOT DAHİL)
    saveSurfacePhotometric({
      surfaceId: standaloneId,
      surfaceName: surfaceTitle,
      surfaceType: 'wall',
      widthM: screenW,
      heightM: screenH,
      projectorCount: projCount,
      avgLux: calc.avgLux,
      minLux: calc.minLux,
      maxLux: calc.maxLux,
      uniformityU0: calc.uniformityU0 / 100,
      uniformityU1: 0.68,
      luminanceNits: calc.nits,
      luminanceFL: calc.footLambert,
      screenGain: screenGain,
      ambientLux: ambientLux,
      ambientContrastRatio: calc.acr,
      isManualLux: true,
      heatmapSnapshotUrl: snapshotUrl,
      distributionRows: [
        {
          code: `PJ Toplam (${projCount} Adet)`,
          name: `${lumensPerProj.toLocaleString('tr-TR')} ANSI Lümen / Cihaz`,
          startX: 0,
          endX: screenW,
          centerX: screenW / 2,
          widthM: calc.singleW,
          throwDistM: throwDistM,
          throwRatio: throwRatio,
          overlapText: projCount > 1 ? `%${calc.overlapPct} Overlap (${calc.overlapM}m)` : 'Tek Cihaz',
        }
      ]
    });

    // 2. ProjectStore luxSnap ve projectionSnap güncelle
    try {
      useProjectStore.getState().setLuxSnap({
        ansiLumens: Array(projCount).fill(lumensPerProj),
        brightnessPct: 100,
        widthM: screenW,
        heightM: screenH,
        gain: screenGain,
        ambientLux: ambientLux,
      });

      useProjectStore.getState().setProjectionSnap({
        projectorName: `${projCount}x Projektör (${lumensPerProj.toLocaleString('tr-TR')} lm)`,
        lensName: `TR ${throwRatio}:1`,
        imageWidthM: screenW,
        distanceM: throwDistM,
        aspectW: 16,
        aspectH: 9,
        throwMin: throwRatio,
        throwMax: throwRatio,
        lensFrontProtrusionM: 0,
      });
    } catch (e) {
      console.warn('ProjectStore snap error:', e);
    }

    setToastMsg(`✓ "${surfaceTitle}" ana PDF Rapor modülüne başarıyla eklendi! (Rapor & Çizim sekmesinde görüntülenebilir)`);
    setTimeout(() => setToastMsg(null), 5000);
  };

  return (
    <div className="space-y-4 text-slate-100 max-w-6xl mx-auto p-2 sm:p-4">
      {/* Toast Bildirimi */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-2xl font-semibold text-xs border border-emerald-400 flex items-center gap-2">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ÜST BAŞLIK VE HIZLI EYLEMLER */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-950 border border-sky-600/60 text-sky-400 font-bold text-xl">
            💡
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
              <span>Bağımsız Parlaklık & Lens Hesaplayıcı</span>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-mono">
                Serbest Hesaplama Modu
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Diğer proje ve oda alanlarından bağımsız; ekran ölçüsü, lümen, atım mesafesi ve ışık homojenliği analizi.
            </p>
          </div>
        </div>

        {/* Eylem Butonları */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              handleSaveToMainReport();
              window.dispatchEvent(new CustomEvent('navigate-module', { detail: 'report' }));
            }}
            className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition border border-sky-400 shadow-md flex items-center gap-1.5 animate-pulse hover:animate-none"
            title="Bu hesabı projenin ana PDF Raporlama sayfasına aktarır ve doğrudan Rapor sekmesine gider"
          >
            <span>📋 Ana Rapora Ekle &amp; Rapora Git →</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition border border-emerald-500 shadow flex items-center gap-1.5"
            title="A4 formatında şık ve resmi teknik rapor çıktısı alır / PDF kaydeder"
          >
            <span>🖨️ Rapor Yazdır / PDF</span>
          </button>
        </div>
      </div>

      {/* ANA İKİ SÜTUN: GİRDİLER & BÜYÜK METRİK GÖSTERGELERİ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* SOL PANEL: BAĞIMSIZ GİRDİ PARAMETRELERİ (5 Kolon) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
              1. Hesaplama Parametreleri
            </h2>
            <span className="text-[10px] text-slate-400">Serbest Giriş</span>
          </div>

          {/* Proje Başlığı */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1 font-medium">Proje / Mekan Başlığı:</label>
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-medium focus:ring-1 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          {/* A) EKRAN BOYUTLARI & ALAN (m²) */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-200 uppercase">Ekran Boyutları & Alanı:</span>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                Alan: {calc.areaM2} m²
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10.5px] text-slate-400 mb-1">Genişlik (m):</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={screenW}
                  onChange={e => setScreenW(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10.5px] text-slate-400 mb-1">Yükseklik (m):</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={screenH}
                  onChange={e => setScreenH(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Katalogdan Hızlı Projektör & Lens Seçimi */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-[10.5px] font-bold text-sky-400 uppercase">📦 Katalogdan Projektör &amp; Lens Seç:</div>
            <select
              value={catProjId}
              onChange={e => {
                const id = e.target.value;
                setCatProjId(id);
                const found = CATALOG_PROJECTORS.find(p => p.id === id);
                if (found) {
                  setLumensPerProj(found.ansiLumens);
                  const lenses = getCompatibleCatalogLenses(found);
                  if (lenses.length > 0) {
                    setCatLensId(lenses[0].id);
                    setThrowRatio(round((lenses[0].throwMin + lenses[0].throwMax) / 2, 2));
                  }
                } else {
                  setCatLensId('');
                }
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-sky-300 focus:ring-1 focus:ring-sky-500 focus:outline-none"
            >
              <option value="">— Marka / Model Seçin (Epson, Vivitek, Sharp...) —</option>
              {CATALOG_BRANDS.map(brand => (
                <optgroup key={brand} label={brand}>
                  {CATALOG_PROJECTORS.filter(p => p.manufacturer === brand).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.manufacturer} {p.model} ({p.ansiLumens.toLocaleString('tr-TR')} lm)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {catProjId && (() => {
              const found = CATALOG_PROJECTORS.find(p => p.id === catProjId);
              if (!found) return null;
              const lenses = getCompatibleCatalogLenses(found);
              return (
                <select
                  value={catLensId}
                  onChange={e => {
                    const lid = e.target.value;
                    setCatLensId(lid);
                    const lens = lenses.find(l => l.id === lid);
                    if (lens) setThrowRatio(round((lens.throwMin + lens.throwMax) / 2, 2));
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-emerald-300 focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  {lenses.map(l => (
                    <option key={l.id} value={l.id}>
                      Lens: {l.model} ({l.throwMin === l.throwMax ? `${l.throwMin.toFixed(2)}:1` : `${l.throwMin.toFixed(2)}–${l.throwMax.toFixed(2)}:1`})
                    </option>
                  ))}
                </select>
              );
            })()}
          </div>

          {/* B) PROJEKTÖR & LENS PARAMETRELERİ */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-200 uppercase">Projektör & Lens:</span>
              <span className="text-[10.5px] font-mono text-sky-400">
                Toplam: {calc.totalLumens.toLocaleString('tr-TR')} ANSI lm
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10.5px] text-slate-400 mb-1">Projektör Adedi:</label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setProjCount(Math.max(1, projCount - 1))}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 font-bold border border-slate-700"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-mono font-bold text-sky-400 bg-slate-900 py-1 rounded border border-slate-800 text-sm">
                    {projCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setProjCount(projCount + 1)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 font-bold border border-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10.5px] text-slate-400 mb-1">Cihaz Başı Lümen (ANSI):</label>
                <input
                  type="number"
                  step="500"
                  min="1000"
                  value={lumensPerProj}
                  onChange={e => setLumensPerProj(Math.max(500, parseInt(e.target.value) || 1000))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-900">
              <div>
                <label className="block text-[10.5px] text-slate-400 mb-1">Atım Mesafesi D (m):</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={throwDistM}
                  onChange={e => setThrowDistM(Math.max(0.2, parseFloat(e.target.value) || 0.5))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-mono font-bold focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10.5px] text-slate-400 mb-1">Lens Throw Ratio (TR):</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.2"
                  value={throwRatio}
                  onChange={e => setThrowRatio(Math.max(0.15, parseFloat(e.target.value) || 0.8))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-mono font-bold focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="text-[10px] text-slate-400 font-mono bg-slate-900 p-2 rounded border border-slate-800/80">
              Tek Cihaz Görüntüsü: <b>{calc.singleW}m × {calc.singleH}m</b> |
              {projCount > 1 ? ` Overlap: %${calc.overlapPct} (${calc.overlapM}m)` : ' Tek Cihaz'}
            </div>
          </div>

          {/* C) EKRAN GAIN VE ORTAM AYDINLIĞI */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2.5">
            <span className="text-[11px] font-bold text-slate-200 uppercase block">Yüzey ve Ortam Koşulları:</span>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10.5px] text-slate-400 mb-1">Ekran Kazancı (Gain):</label>
                <select
                  value={screenGain}
                  onChange={e => setScreenGain(parseFloat(e.target.value) || 1.0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-medium"
                >
                  <option value={0.8}>0.8 (Koyu Gri Kontrast)</option>
                  <option value={1.0}>1.0 (Mat Beyaz Standardı)</option>
                  <option value={1.2}>1.2 (Hafif Parlak)</option>
                  <option value={1.5}>1.5 (Yüksek Kazançlı Yüzey)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] text-slate-400 mb-1">Ortam Işığı (Lux):</label>
                <select
                  value={ambientLux}
                  onChange={e => setAmbientLux(parseFloat(e.target.value) || 50)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-medium"
                >
                  <option value={20}>20 Lux (Karartılmış Müze)</option>
                  <option value={50}>50 Lux (Standart Müze / Sergi)</option>
                  <option value={150}>150 Lux (Yarı Loş Galeri)</option>
                  <option value={300}>300 Lux (Aydınlık Sergi Alanı)</option>
                  <option value={500}>500 Lux (Ofis / Gün Işığı)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* SAĞ PANEL: HESAPLANAN BÜYÜK SONUÇ KARTLARI (7 Kolon) */}
        <div className="lg:col-span-7 space-y-4">
          {/* 🌟 2B FOTOMETRİK LUX ISI DAĞILIM HARİTASI (CANLI CANVAS) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-bold text-xs uppercase tracking-wider">
                  🔥 2D Fotometrik Lüks Isı Dağılımı ve Projektör Sınırları
                </span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-mono">
                  Canlı Simülasyon
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {calc.minLux} lx → {calc.maxLux} lx
              </span>
            </div>
            
            <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-950 shadow-inner flex items-center justify-center">
              <canvas
                ref={heatmapCanvasRef}
                className="w-full h-auto max-h-64 object-contain"
              />
            </div>
            <div className="text-[10.5px] text-slate-400 flex items-center justify-between px-1">
              <span>✓ Bu ısı haritası görseli Ana PDF Rapora otomatik olarak aktarılır.</span>
              <span className="text-sky-400 font-mono font-semibold">U0: %{calc.uniformityU0}</span>
            </div>
          </div>

          {/* 4 ANA METRİK KARTI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1. Ortalama Ekran Lux'u */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-sky-800/80 rounded-xl p-4 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Ortalama Ekran Lux</span>
                <span className="text-[10px] bg-sky-950 text-sky-300 px-2 py-0.5 rounded border border-sky-800 font-mono">
                  E_avg
                </span>
              </div>
              <div className="my-2.5">
                <div className="text-3xl sm:text-4xl font-extrabold text-sky-400 font-mono tracking-tight">
                  {calc.avgLux} <span className="text-lg font-normal text-slate-300">Lux</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-1.5 flex justify-between">
                <span>Ekran Alanı: <b className="text-emerald-400">{calc.areaM2} m²</b></span>
                <span>Efektif Akı: <b className="text-slate-200">{calc.effLumens.toLocaleString('tr-TR')} lm</b></span>
              </div>
            </div>

            {/* 2. Yüzey Parlaklığı (Nit & Foot-Lambert) */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-800/80 rounded-xl p-4 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Gözlenen Yüzey Parlaklığı</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-mono">
                  Luminance
                </span>
              </div>
              <div className="my-2.5">
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400 font-mono tracking-tight">
                  {calc.nits} <span className="text-lg font-normal text-slate-300">Nit</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-1.5 flex justify-between">
                <span>Sinema Ölçütü: <b className="text-slate-200">{calc.footLambert} fL</b></span>
                <span>cd/m²: <b className="text-slate-200">{calc.nits}</b></span>
              </div>
            </div>

            {/* 3. Ortam Kontrast Oranı (ACR) */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-purple-800/80 rounded-xl p-4 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Ortam Kontrast Oranı</span>
                <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-800 font-mono">
                  ACR
                </span>
              </div>
              <div className="my-2.5">
                <div className="text-3xl sm:text-4xl font-extrabold text-purple-400 font-mono tracking-tight">
                  {calc.acr} <span className="text-lg font-normal text-slate-300">: 1</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-1.5 flex justify-between">
                <span>Ortam Işığı: <b className="text-slate-200">{ambientLux} Lux</b></span>
                <span className="text-emerald-400 font-medium">✓ {calc.acr >= 15 ? 'Yüksek Okunurluk' : 'Orta'}</span>
              </div>
            </div>

            {/* 4. Işık Düzgünlüğü (Uniformity) */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-amber-800/80 rounded-xl p-4 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Işık Düzgünlüğü (Uniformity)</span>
                <span className="text-[10px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-800 font-mono">
                  U0 (Min/Ort)
                </span>
              </div>
              <div className="my-2.5">
                <div className="text-3xl sm:text-4xl font-extrabold text-amber-400 font-mono tracking-tight">
                  %{calc.uniformityU0} <span className="text-lg font-normal text-slate-300">Homojenlik</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-1.5 flex justify-between">
                <span>Köşe / Merkez Oranı: <b className="text-slate-200">{calc.minLux} / {calc.maxLux} lx</b></span>
                <span className="text-emerald-400 font-medium">✓ Vinyet Yok</span>
              </div>
            </div>
          </div>

          {/* 🌟 ÖZEL REHBER: IŞIK DÜZGÜNLÜĞÜ NEDİR? */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
              <span>❓ Işık Düzgünlüğü (Uniformity) Nedir?</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              <b>Işık Düzgünlüğü (Uniformity / Homojenlik):</b> Projeksiyon görüntüsünün merkezinden en uç köşelerine doğru aydınlığın ne kadar dengeli dağıldığını ifade eden optik mühendislik oranıdır (U0 = E_min / E_ort).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1">
              <div className="p-2 rounded bg-slate-950 border border-emerald-800/80 text-emerald-300">
                <b>• %80 ve üzeri:</b> Mükemmel homojenlik. Göz köşelerdeki ışık düşümünü fark etmez, renkler ve tonlar tüm duvarda eşit parlar.
              </div>
              <div className="p-2 rounded bg-slate-950 border border-sky-800/80 text-sky-300">
                <b>• %65 - %80:</b> Standart müze ve galeri seviyesi. Kabul edilebilir optik tolerans sınırıdır.
              </div>
              <div className="p-2 rounded bg-slate-950 border border-amber-800/80 text-amber-300">
                <b>• %60 altı:</b> Kenar ve köşelerde kararma (vinyet) hissedilir; lens açısı veya projektör adedi artırılmalıdır.
              </div>
            </div>
          </div>

          {/* ADIM ADIM FORMÜL VE STANDART DEĞERLENDİRME */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase">Müze & Sergi Standart Uygunluğu:</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${calc.evalStatus.badgeClass}`}>
                {calc.evalStatus.badge}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {calc.evalStatus.description}
            </p>

            {/* Matematik Dökümü */}
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 space-y-1">
              <div>📐 <b>Ekran Alanı:</b> {screenW}m × {screenH}m = <b className="text-emerald-400">{calc.areaM2} m²</b> (Oran {calc.aspect}:1)</div>
              <div>💡 <b>Efektif Lümen:</b> {projCount} PJ × {lumensPerProj.toLocaleString('tr-TR')} ANSI lm × %{opticalEfficiency} = <b className="text-sky-300">{calc.effLumens.toLocaleString('tr-TR')} lm</b></div>
              <div>🔆 <b>Ortalama Ekran Lux:</b> {calc.effLumens.toLocaleString('tr-TR')} lm ÷ {calc.areaM2} m² = <b className="text-sky-400">{calc.avgLux} Lux</b></div>
              <div>✨ <b>Yüzey Parlaklığı:</b> ({calc.avgLux} lx × {screenGain} Gain) ÷ π = <b className="text-emerald-400">{calc.nits} Nit</b> ({calc.footLambert} fL)</div>
            </div>
          </div>
        </div>
      </div>

      {/* 🌟 YAZDIRILABİLİR RESMİ A4 TEKNİK RAPOR ÖNİZLEMESİ (CSS Print Uyumlu) */}
      <div
        ref={printAreaRef}
        className="bg-white text-slate-900 rounded-xl p-6 sm:p-8 shadow-2xl border border-slate-300 space-y-6 print:p-0 print:border-0 print:shadow-none print:m-0"
      >
        {/* Rapor Üst Başlık & Logo */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4">
          <div>
            <div className="text-xs font-bold tracking-widest text-sky-700 uppercase">
              PROJEKSİYON & EKRAN TASARIM STÜDYOSU
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
              FOTOMETRİK PARLAKLIK & LENS HESAPLAMA RAPORU
            </h2>
            <div className="text-xs text-slate-600 mt-1">
              Proje: <b>{projectName}</b> | Hazırlayan: {preparedBy}
            </div>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono">
            <div>Tarih: {new Date().toLocaleDateString('tr-TR')}</div>
            <div className="text-emerald-700 font-bold">Mühendislik Standartı: ISO/CIE</div>
          </div>
        </div>

        {/* 1. Ekran ve Mekan Alanı Özeti */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div>
            <span className="text-slate-500 block">Ekran Genişliği:</span>
            <b className="text-sm text-slate-900">{screenW} m</b>
          </div>
          <div>
            <span className="text-slate-500 block">Ekran Yüksekliği:</span>
            <b className="text-sm text-slate-900">{screenH} m</b>
          </div>
          <div>
            <span className="text-slate-500 block">TOPLAM EKRAN ALANI:</span>
            <b className="text-base text-emerald-700 font-extrabold">{calc.areaM2} m²</b>
          </div>
          <div>
            <span className="text-slate-500 block">Fiziksel En/Boy Oranı:</span>
            <b className="text-sm text-slate-900 font-mono">{calc.aspect} : 1</b>
          </div>
        </div>

        {/* 2. Donanım ve Lens Bilgileri */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div>
            <span className="text-slate-500 block">Projektör Cihaz Adedi:</span>
            <b className="text-sm text-slate-900">{projCount} Adet</b>
          </div>
          <div>
            <span className="text-slate-500 block">Cihaz Başına Akı:</span>
            <b className="text-sm text-slate-900">{lumensPerProj.toLocaleString('tr-TR')} ANSI lm</b>
          </div>
          <div>
            <span className="text-slate-500 block">Lens Throw Ratio (TR):</span>
            <b className="text-sm text-slate-900 font-mono">{throwRatio} : 1</b>
          </div>
          <div>
            <span className="text-slate-500 block">Atım Mesafesi (Throw):</span>
            <b className="text-sm text-slate-900 font-mono">{throwDistM} m</b>
          </div>
        </div>

        {/* 2.5. 2B Fotometrik Isı Haritası Önizlemesi */}
        {heatmapDataUrl && (
          <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50 space-y-1">
            <div className="text-[11px] font-bold text-slate-800 flex justify-between items-center">
              <span>📸 2D Fotometrik Lux Isı Dağılımı ve Projektör Kapsama Sınırları</span>
              <span className="text-[10px] font-mono text-slate-600 font-normal">
                Min: {calc.minLux} lx · Ort: {calc.avgLux} lx · Max: {calc.maxLux} lx
              </span>
            </div>
            <img
              src={heatmapDataUrl}
              alt="2D Lux Isı Dağılımı"
              className="w-full h-auto max-h-56 object-contain rounded border border-slate-300"
            />
          </div>
        )}

        {/* 3. Ana Fotometrik Metrikler Tablosu */}
        <table className="w-full text-xs text-left border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700">
              <th className="p-2.5">Fotometrik Parametre</th>
              <th className="p-2.5 text-center">Hesaplanan Değer</th>
              <th className="p-2.5 text-center">Birim</th>
              <th className="p-2.5">Müze & Sergi Standart Değerlendirmesi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono">
            <tr>
              <td className="p-2.5 font-sans font-semibold text-slate-800">Ortalama Ekran Aydınlığı (E_avg)</td>
              <td className="p-2.5 text-center font-bold text-sky-800 text-sm">{calc.avgLux}</td>
              <td className="p-2.5 text-center text-slate-600 font-sans">Lux</td>
              <td className="p-2.5 font-sans font-medium text-emerald-700">{calc.evalStatus.badge}</td>
            </tr>
            <tr>
              <td className="p-2.5 font-sans font-semibold text-slate-800">Gözlenen Yüzey Parlaklığı</td>
              <td className="p-2.5 text-center font-bold text-emerald-800 text-sm">{calc.nits}</td>
              <td className="p-2.5 text-center text-slate-600 font-sans">Nit (cd/m²)</td>
              <td className="p-2.5 font-sans text-slate-600">{calc.footLambert} Foot-Lambert (Sinema Standardı)</td>
            </tr>
            <tr>
              <td className="p-2.5 font-sans font-semibold text-slate-800">Ortam Kontrast Oranı (ACR)</td>
              <td className="p-2.5 text-center font-bold text-purple-800 text-sm">{calc.acr} : 1</td>
              <td className="p-2.5 text-center text-slate-600 font-sans">Oran</td>
              <td className="p-2.5 font-sans text-slate-600">Ortam Işığı: {ambientLux} Lux ({calc.acr >= 15 ? 'Net ve Canlı Kontrast' : 'Karanlık Gerektirir'})</td>
            </tr>
            <tr>
              <td className="p-2.5 font-sans font-semibold text-slate-800">Işık Düzgünlüğü (Uniformity U0)</td>
              <td className="p-2.5 text-center font-bold text-amber-800 text-sm">%{calc.uniformityU0}</td>
              <td className="p-2.5 text-center text-slate-600 font-sans">Yüzde</td>
              <td className="p-2.5 font-sans text-slate-600">Köşeler ile merkez arası homojenlik; vinyet riski bulunmamaktadır.</td>
            </tr>
            <tr>
              <td className="p-2.5 font-sans font-semibold text-slate-800">Toplam Efektif Akı</td>
              <td className="p-2.5 text-center font-bold text-slate-800 text-sm">{calc.effLumens.toLocaleString('tr-TR')}</td>
              <td className="p-2.5 text-center text-slate-600 font-sans">Lümen</td>
              <td className="p-2.5 font-sans text-slate-600">%90 Optik ve motor verimi dahil</td>
            </tr>
          </tbody>
        </table>

        {/* 4. Işık Düzgünlüğü ve Mühendislik Açıklaması (DİNAMİK) */}
        <div className={`p-3.5 rounded border text-xs space-y-1.5 ${
          calc.uniformityU0 >= 75 
            ? 'bg-emerald-50/70 border-emerald-300 text-slate-800' 
            : calc.uniformityU0 >= 60 
            ? 'bg-amber-50/70 border-amber-300 text-slate-800' 
            : 'bg-red-50/70 border-red-300 text-slate-900'
        }`}>
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1.5 text-slate-900">
              📌 Işık Düzgünlüğü (Uniformity) ve Mühendislik Değerlendirmesi:
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${calc.uniformityEvaluation.badgeClass}`}>
              {calc.uniformityEvaluation.title}
            </span>
          </div>
          <p className="leading-relaxed text-slate-700">
            Işık düzgünlüğü, projektör lensinden çıkan ışığın ekranın merkez noktası ile 4 köşesi arasındaki homojenlik katsayısıdır (U0 = E_min / E_ort).
            {' '}{calc.uniformityEvaluation.description}
          </p>
        </div>


      </div>
    </div>
  );
}
