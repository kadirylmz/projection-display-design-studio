import { useState, useMemo } from 'react';
import { pctToPx } from '../engine/multiproj';
import { LengthUnit, round } from '../engine/units';
import { download } from '../util';

interface PresetRes { label: string; w: number; h: number }
const RESOLUTIONS: PresetRes[] = [
  { label: 'WUXGA (1920×1200) - 16:10', w: 1920, h: 1200 },
  { label: 'Full HD (1920×1080) - 16:9', w: 1920, h: 1080 },
  { label: '4K UHD (3840×2160) - 16:9', w: 3840, h: 2160 },
  { label: '4K DCI (4096×2160)', w: 4096, h: 2160 },
  { label: 'WXGA (1280×800)', w: 1280, h: 800 },
];

export default function ContentPlanner({ unit }: { unit: LengthUnit }) {
  const [plannerMode, setPlannerMode] = useState<'immersive' | 'wall'>('immersive');

  // ==========================================
  // --- İMMERSİVE 5-YÜZEY: MEKAN ÖLÇÜLERİ ---
  // ==========================================
  const [roomL, setRoomL] = useState(23.30); // Uzun Duvar boyu (m)
  const [roomW, setRoomW] = useState(7.00);  // Kısa Duvar eni (m)
  const [roomH, setRoomH] = useState(4.30);  // Duvar yüksekliği (m)

  // ==========================================
  // 1. UZUN DUVARLAR İÇİN PROJEKSİYON AYARLARI
  // ==========================================
  const [longResIdx, setLongResIdx] = useState(0); // 1920x1200
  const [longCols, setLongCols] = useState(4);     // Yan yana 4 projektör
  const [longRows, setLongRows] = useState(1);     // Üst üste 1 sıra
  const [longOrient, setLongOrient] = useState<'landscape' | 'portrait'>('landscape');
  const [longBlendPct, setLongBlendPct] = useState(12);

  // ==========================================
  // 2. KISA DUVARLAR İÇİN PROJEKSİYON AYARLARI
  // ==========================================
  const [shortResIdx, setShortResIdx] = useState(0); // 1920x1200
  const [shortCols, setShortCols] = useState(2);     // Yan yana 2 projektör
  const [shortRows, setShortRows] = useState(1);     // Üst üste 1 sıra
  const [shortOrient, setShortOrient] = useState<'landscape' | 'portrait'>('landscape');
  const [shortBlendPct, setShortBlendPct] = useState(15);

  // ==========================================
  // 3. ZEMİN (FLOOR) İÇİN PROJEKSİYON AYARLARI
  // ==========================================
  const [floorResIdx, setFloorResIdx] = useState(0); // 1920x1200
  const [floorCols, setFloorCols] = useState(4);     // Boyuna 4 projektör
  const [floorRows, setFloorRows] = useState(2);     // Enine 2 sıra
  const [floorOrient, setFloorOrient] = useState<'landscape' | 'portrait'>('landscape');
  const [floorBlendPct, setFloorBlendPct] = useState(12);

  // ==========================================
  // DİNAMİK İMMERSİVE HESAPLAMA MOTORU
  // ==========================================
  const immersiveCalc = useMemo(() => {
    // 1. UZUN DUVAR HESABI
    const longP = RESOLUTIONS[longResIdx];
    const longPw = longOrient === 'landscape' ? longP.w : longP.h;
    const longPh = longOrient === 'landscape' ? longP.h : longP.w;
    const longBlendX = longCols > 1 ? pctToPx(longBlendPct, longPw) : 0;
    const longBlendY = longRows > 1 ? pctToPx(longBlendPct, longPh) : 0;
    const longWallW = longCols * longPw - (longCols - 1) * longBlendX;
    const longWallH = longRows * longPh - (longRows - 1) * longBlendY;
    // Piksel boyutu (mm/px) ve PPI
    const longMmPerPxW = round((roomL * 1000) / longWallW, 2);
    const longMmPerPxH = round((roomH * 1000) / longWallH, 2);
    const longAvgMm = round((longMmPerPxW + longMmPerPxH) / 2, 2);
    const longPpi = round(25.4 / longAvgMm, 1);

    // 2. KISA DUVAR HESABI
    const shortP = RESOLUTIONS[shortResIdx];
    const shortPw = shortOrient === 'landscape' ? shortP.w : shortP.h;
    const shortPh = shortOrient === 'landscape' ? shortP.h : shortP.w;
    const shortBlendX = shortCols > 1 ? pctToPx(shortBlendPct, shortPw) : 0;
    const shortBlendY = shortRows > 1 ? pctToPx(shortBlendPct, shortPh) : 0;
    const shortWallW = shortCols * shortPw - (shortCols - 1) * shortBlendX;
    const shortWallH = shortRows * shortPh - (shortRows - 1) * shortBlendY;
    const shortMmPerPxW = round((roomW * 1000) / shortWallW, 2);
    const shortMmPerPxH = round((roomH * 1000) / shortWallH, 2);
    const shortAvgMm = round((shortMmPerPxW + shortMmPerPxH) / 2, 2);
    const shortPpi = round(25.4 / shortAvgMm, 1);

    // 3. ZEMİN (FLOOR) HESABI
    const floorP = RESOLUTIONS[floorResIdx];
    const floorPw = floorOrient === 'landscape' ? floorP.w : floorP.h;
    const floorPh = floorOrient === 'landscape' ? floorP.h : floorP.w;
    const floorBlendX = floorCols > 1 ? pctToPx(floorBlendPct, floorPw) : 0;
    const floorBlendY = floorRows > 1 ? pctToPx(floorBlendPct, floorPh) : 0;
    const floorW = floorCols * floorPw - (floorCols - 1) * floorBlendX; // Uzun kenar boyu
    const floorH = floorRows * floorPh - (floorRows - 1) * floorBlendY; // Kısa kenar eni
    const floorMmPerPxW = round((roomL * 1000) / floorW, 2);
    const floorMmPerPxH = round((roomW * 1000) / floorH, 2);
    const floorAvgMm = round((floorMmPerPxW + floorMmPerPxH) / 2, 2);
    const floorPpi = round(25.4 / floorAvgMm, 1);

    // KUTU AÇILIMI (CROSS UNWRAP) TOPLAM CANVAS EBATLARI:
    // Yatay: Sol Duvar Yüksekliği + Zemin Eni (floorH) + Sağ Duvar Yüksekliği
    const totalCanvasW = longWallH + floorH + longWallH;
    // Düşey: Üst Kısa Duvar Yüksekliği + Zemin Boyu (floorW) + Alt Kısa Duvar Yüksekliği
    const totalCanvasH = shortWallH + floorW + shortWallH;

    const totalPixels = (longWallW * longWallH * 2) + (shortWallW * shortWallH * 2) + (floorW * floorH);
    const megapixels = round(totalPixels / 1_000_000, 2);

    // Toplam Projektör Sayısı
    const totalProjLong = longCols * longRows * 2;
    const totalProjShort = shortCols * shortRows * 2;
    const totalProjFloor = floorCols * floorRows;
    const totalProjectors = totalProjLong + totalProjShort + totalProjFloor;

    // Piksel homojenlik kontrolü (Duvar vs Zemin)
    const mmList = [longMmPerPxW, longMmPerPxH, shortMmPerPxW, shortMmPerPxH, floorMmPerPxW, floorMmPerPxH];
    const minMm = Math.min(...mmList), maxMm = Math.max(...mmList);
    const densityMismatchPct = round(((maxMm - minMm) / minMm) * 100, 1);

    return {
      longP, longWallW, longWallH, longBlendX, longMmPerPxW, longMmPerPxH, longAvgMm, longPpi,
      shortP, shortWallW, shortWallH, shortBlendX, shortMmPerPxW, shortMmPerPxH, shortAvgMm, shortPpi,
      floorP, floorW, floorH, floorBlendX, floorBlendY, floorMmPerPxW, floorMmPerPxH, floorAvgMm, floorPpi,
      totalCanvasW, totalCanvasH, totalPixels, megapixels,
      totalProjLong, totalProjShort, totalProjFloor, totalProjectors,
      densityMismatchPct, minMm, maxMm,
    };
  }, [
    roomL, roomW, roomH,
    longResIdx, longCols, longRows, longOrient, longBlendPct,
    shortResIdx, shortCols, shortRows, shortOrient, shortBlendPct,
    floorResIdx, floorCols, floorRows, floorOrient, floorBlendPct,
  ]);

  // --- 1:1 KUTU AÇILIMI ŞABLONU İNDİR (PNG) ---
  const downloadImmersiveTemplate = () => {
    const c = document.createElement('canvas');
    c.width = immersiveCalc.totalCanvasW;
    c.height = immersiveCalc.totalCanvasH;
    const g = c.getContext('2d')!;

    g.fillStyle = '#0b1329';
    g.fillRect(0, 0, c.width, c.height);

    const { longWallH, floorH, floorW, shortWallH, longWallW, shortWallW } = immersiveCalc;

    const floorX = longWallH;
    const floorY = shortWallH;

    const drawBox = (x: number, y: number, w: number, h: number, label: string, info: string, fillCol: string) => {
      g.fillStyle = fillCol;
      g.fillRect(x, y, w, h);
      g.strokeStyle = '#38bdf8';
      g.lineWidth = 4;
      g.strokeRect(x, y, w, h);

      const fs = Math.max(28, Math.round(Math.min(w, h) / 18));
      g.fillStyle = '#f8fafc';
      g.font = `bold ${fs}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(label, x + w / 2, y + h / 2 - fs * 0.4);
      g.fillStyle = '#38bdf8';
      g.font = `${Math.round(fs * 0.75)}px monospace`;
      g.fillText(info, x + w / 2, y + h / 2 + fs * 0.8);
    };

    // Zemin & Duvarları Kutu Açılımı Olarak Çiz
    drawBox(floorX, floorY, floorH, floorW, 'ZEMİN (FLOOR)', `${floorW} × ${floorH} px (${roomL}m × ${roomW}m)`, 'rgba(14, 165, 233, 0.15)');
    drawBox(0, floorY, longWallH, floorW, 'SOL UZUN DUVAR', `${longWallW} × ${longWallH} px (${roomL}m × ${roomH}m)`, 'rgba(56, 189, 248, 0.1)');
    drawBox(floorX + floorH, floorY, longWallH, floorW, 'SAĞ UZUN DUVAR', `${longWallW} × ${longWallH} px (${roomL}m × ${roomH}m)`, 'rgba(56, 189, 248, 0.1)');
    drawBox(floorX, 0, floorH, shortWallH, 'ÖN KISA DUVAR', `${shortWallW} × ${shortWallH} px (${roomW}m × ${roomH}m)`, 'rgba(99, 102, 241, 0.15)');
    drawBox(floorX, floorY + floorW, floorH, shortWallH, 'ARKA KISA DUVAR', `${shortWallW} × ${shortWallH} px (${roomW}m × ${roomH}m)`, 'rgba(99, 102, 241, 0.15)');

    g.fillStyle = '#facc15';
    g.font = 'bold 38px monospace';
    g.textAlign = 'left';
    g.fillText(`IMMERSIVE CROSS UNWRAP CANVAS: ${c.width} × ${c.height} px | Proje Boyutu: ${roomL}m × ${roomW}m × ${roomH}m`, 40, 50);

    c.toBlob(blob => {
      if (blob) download(`immersive-canvas-${c.width}x${c.height}.png`, blob);
    });
  };

  // Metin Kopyalama
  const copySpecs = () => {
    const text = `=======================================================
AV MÜHENDİSLİK - 5-YÜZEY İMMERSİVE ODA İÇERİK ŞARTNAMESİ
=======================================================
MEKAN ÖLÇÜLERİ:
- Oda Boyu (Uzun Duvarlar): ${roomL} m
- Oda Eni (Kısa Duvarlar): ${roomW} m
- Duvar Yüksekliği: ${roomH} m

PROJEKTÖR DONANIM & YÜZEY ÇÖZÜNÜRLÜKLERİ:
1. UZUN DUVARLAR (2 Adet):
   - Projektör: ${immersiveCalc.longP.label} (${longOrient})
   - Adet: Duvar başına ${longCols}×${longRows} = ${longCols * longRows} Projektör (Toplam ${immersiveCalc.totalProjLong} Adet)
   - Çözünürlük: ${immersiveCalc.longWallW} × ${immersiveCalc.longWallH} piksel
   - Piksel Boyutu: ~${immersiveCalc.longMmPerPxW} mm/px

2. KISA DUVARLAR (2 Adet):
   - Projektör: ${immersiveCalc.shortP.label} (${shortOrient})
   - Adet: Duvar başına ${shortCols}×${shortRows} = ${shortCols * shortRows} Projektör (Toplam ${immersiveCalc.totalProjShort} Adet)
   - Çözünürlük: ${immersiveCalc.shortWallW} × ${immersiveCalc.shortWallH} piksel
   - Piksel Boyutu: ~${immersiveCalc.shortMmPerPxW} mm/px

3. ZEMİN (FLOOR):
   - Projektör: ${immersiveCalc.floorP.label} (${floorOrient})
   - Adet: ${floorCols} Sütun × ${floorRows} Satır = ${immersiveCalc.totalProjFloor} Projektör
   - Çözünürlük: ${immersiveCalc.floorW} × ${immersiveCalc.floorH} piksel
   - Piksel Boyutu: ~${immersiveCalc.floorMmPerPxW} mm/px

TOPLAM SİSTEM:
- Toplam Projektör Adedi: ${immersiveCalc.totalProjectors} Projektör
- Birleşik Kutu Açılımı (Unwrap) Render Ebatı: ${immersiveCalc.totalCanvasW} × ${immersiveCalc.totalCanvasH} piksel
- Toplam Aktif Piksel: ${immersiveCalc.megapixels} Megapiksel (${immersiveCalc.totalPixels.toLocaleString()} px)
- Piksel Yoğunluk Farkı: %${immersiveCalc.densityMismatchPct}
=======================================================`;
    navigator.clipboard.writeText(text);
    alert('5-Yüzey teknik şartnamesi panoya kopyalandı!');
  };

  return (
    <div className="space-y-3 h-full flex flex-col text-xs">
      {/* Üst Sekmeler */}
      <div className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-800">
        <div className="flex gap-1.5">
          <button
            onClick={() => setPlannerMode('immersive')}
            className={`px-3 py-1.5 rounded font-semibold text-xs flex items-center gap-1.5 ${plannerMode === 'immersive' ? 'bg-sky-700 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-750'}`}
          >
            <span>5-Yüzey İmmersive Kutu Açılımı (Bağımsız Projektör Girişi)</span>
          </button>
        </div>
        <span className="text-slate-400 text-[11px] hidden sm:inline">
          Uzun duvar, kısa duvar ve zemin için bağımsız projektör modelleri ve dizilimleri.
        </span>
      </div>

      <div className="grid lg:grid-cols-[420px_1fr] gap-4 flex-1 overflow-auto">
        {/* SOL PANEL: MEKAN VE HER YÜZEY İÇİN AYRI PROJEKTÖR GİRİŞİ */}
        <div className="space-y-3 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto" style={{ maxHeight: '84vh' }}>
          {/* Mekan Ölçüleri */}
          <div className="border-b border-slate-800 pb-2">
            <span className="font-semibold text-slate-200 block text-xs">Mekan Fiziksel Ölçüleri (Metre)</span>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <label>Oda Boyu (m)<input className="inp font-bold text-sky-400" type="number" step="0.1" value={roomL} onChange={e => setRoomL(+e.target.value)} /></label>
              <label>Oda Eni (m)<input className="inp font-bold text-sky-400" type="number" step="0.1" value={roomW} onChange={e => setRoomW(+e.target.value)} /></label>
              <label>Yükseklik (m)<input className="inp font-bold text-sky-400" type="number" step="0.1" value={roomH} onChange={e => setRoomH(+e.target.value)} /></label>
            </div>
          </div>

          {/* 1. UZUN DUVAR PROJEKTÖRLERİ */}
          <div className="p-2.5 rounded bg-slate-950 border border-sky-900/60 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-sky-400">1. Uzun Duvarlar (2 Adet, {roomL}m × {roomH}m)</span>
              <span className="text-[10px] text-slate-400">{longCols * longRows * 2} Projektör</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label>Projektör Modeli
                <select className="inp" value={longResIdx} onChange={e => setLongResIdx(+e.target.value)}>
                  {RESOLUTIONS.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
                </select>
              </label>
              <label>Yön (Orientation)
                <select className="inp" value={longOrient} onChange={e => setLongOrient(e.target.value as any)}>
                  <option value="landscape">Yatay (Landscape)</option>
                  <option value="portrait">Dikey (Portrait)</option>
                </select>
              </label>
              <label>Yan Yana Adet (Sütun)<input className="inp" type="number" min="1" max="16" value={longCols} onChange={e => setLongCols(Math.max(1, Math.round(+e.target.value)))} /></label>
              <label>Üst Üste Sıra (Satır)<input className="inp" type="number" min="1" max="4" value={longRows} onChange={e => setLongRows(Math.max(1, Math.round(+e.target.value)))} /></label>
            </div>
            <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800 text-slate-300">
              <span>Çözünürlük: <b className="text-emerald-400">{immersiveCalc.longWallW} × {immersiveCalc.longWallH} px</b></span>
              <span>Piksel: <b className="text-slate-200">~{immersiveCalc.longMmPerPxW} mm/px</b></span>
            </div>
          </div>

          {/* 2. KISA DUVAR PROJEKTÖRLERİ */}
          <div className="p-2.5 rounded bg-slate-950 border border-indigo-900/60 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-indigo-400">2. Kısa Duvarlar (2 Adet, {roomW}m × {roomH}m)</span>
              <span className="text-[10px] text-slate-400">{shortCols * shortRows * 2} Projektör</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label>Projektör Modeli
                <select className="inp" value={shortResIdx} onChange={e => setShortResIdx(+e.target.value)}>
                  {RESOLUTIONS.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
                </select>
              </label>
              <label>Yön (Orientation)
                <select className="inp" value={shortOrient} onChange={e => setShortOrient(e.target.value as any)}>
                  <option value="landscape">Yatay (Landscape)</option>
                  <option value="portrait">Dikey (Portrait)</option>
                </select>
              </label>
              <label>Yan Yana Adet (Sütun)<input className="inp" type="number" min="1" max="16" value={shortCols} onChange={e => setShortCols(Math.max(1, Math.round(+e.target.value)))} /></label>
              <label>Üst Üste Sıra (Satır)<input className="inp" type="number" min="1" max="4" value={shortRows} onChange={e => setShortRows(Math.max(1, Math.round(+e.target.value)))} /></label>
            </div>
            <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800 text-slate-300">
              <span>Çözünürlük: <b className="text-emerald-400">{immersiveCalc.shortWallW} × {immersiveCalc.shortWallH} px</b></span>
              <span>Piksel: <b className="text-slate-200">~{immersiveCalc.shortMmPerPxW} mm/px</b></span>
            </div>
          </div>

          {/* 3. ZEMİN (FLOOR) PROJEKTÖRLERİ */}
          <div className="p-2.5 rounded bg-slate-950 border border-teal-900/60 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-teal-400">3. Zemin (Floor, {roomL}m × {roomW}m)</span>
              <span className="text-[10px] text-slate-400">{floorCols * floorRows} Projektör</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label>Projektör Modeli
                <select className="inp" value={floorResIdx} onChange={e => setFloorResIdx(+e.target.value)}>
                  {RESOLUTIONS.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
                </select>
              </label>
              <label>Yön (Orientation)
                <select className="inp" value={floorOrient} onChange={e => setFloorOrient(e.target.value as any)}>
                  <option value="landscape">Yatay (Landscape)</option>
                  <option value="portrait">Dikey (Portrait)</option>
                </select>
              </label>
              <label>Boyuna Adet (Sütun)<input className="inp" type="number" min="1" max="16" value={floorCols} onChange={e => setFloorCols(Math.max(1, Math.round(+e.target.value)))} /></label>
              <label>Enine Adet (Satır)<input className="inp" type="number" min="1" max="8" value={floorRows} onChange={e => setFloorRows(Math.max(1, Math.round(+e.target.value)))} /></label>
            </div>
            <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800 text-slate-300">
              <span>Çözünürlük: <b className="text-emerald-400">{immersiveCalc.floorW} × {immersiveCalc.floorH} px</b></span>
              <span>Piksel: <b className="text-slate-200">~{immersiveCalc.floorMmPerPxW} mm/px</b></span>
            </div>
          </div>

          {/* Aksiyon Butonları */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <button
              className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-white font-semibold flex items-center justify-center gap-1.5 shadow"
              onClick={downloadImmersiveTemplate}
            >
              1:1 Kutu Açılımı Şablonu İndir (PNG)
            </button>
            <button
              className="w-full py-2 bg-sky-700 hover:bg-sky-600 rounded text-white font-semibold flex items-center justify-center gap-1.5"
              onClick={copySpecs}
            >
              5-Yüzey Şartnamesini Kopyala (Metin)
            </button>
          </div>
        </div>

        {/* SAĞ PANEL: HESAPLAMA ÇIKTILARI VE GÖRSEL ÇİZİM */}
        <div className="space-y-3 min-w-0 flex flex-col overflow-auto">
          {/* Çözünürlük Kartları & Piksel Yoğunluğu (Mevcut vs İdeal) */}
          <div className="grid sm:grid-cols-3 gap-2">
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex flex-col justify-between">
              <div>
                <span className="text-slate-400 block text-[11px] font-medium">Uzun Duvarlar (2×):</span>
                <b className="text-sm text-emerald-400 font-mono">{immersiveCalc.longWallW} × {immersiveCalc.longWallH} px</b>
                <span className="text-slate-500 block text-[10px] mt-0.5">{roomL}m × {roomH}m (2 × {longCols*longRows} PJ)</span>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10.5px]">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Piksel Boyutu (Mevcut):</span>
                  <span className="font-mono font-bold text-sky-400">~{immersiveCalc.longAvgMm} mm/px</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500">Piksel Yoğunluğu:</span>
                  <span className="text-slate-300 font-mono">{immersiveCalc.longPpi} PPI</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-emerald-400/80">
                  <span>İdeal Müze / İmmersive:</span>
                  <span>2.0 - 3.5 mm</span>
                </div>
              </div>
            </div>

            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex flex-col justify-between">
              <div>
                <span className="text-slate-400 block text-[11px] font-medium">Kısa Duvarlar (2×):</span>
                <b className="text-sm text-emerald-400 font-mono">{immersiveCalc.shortWallW} × {immersiveCalc.shortWallH} px</b>
                <span className="text-slate-500 block text-[10px] mt-0.5">{roomW}m × {roomH}m (2 × {shortCols*shortRows} PJ)</span>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10.5px]">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Piksel Boyutu (Mevcut):</span>
                  <span className="font-mono font-bold text-sky-400">~{immersiveCalc.shortAvgMm} mm/px</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500">Piksel Yoğunluğu:</span>
                  <span className="text-slate-300 font-mono">{immersiveCalc.shortPpi} PPI</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-emerald-400/80">
                  <span>İdeal Müze / İmmersive:</span>
                  <span>2.0 - 3.5 mm</span>
                </div>
              </div>
            </div>

            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex flex-col justify-between">
              <div>
                <span className="text-slate-400 block text-[11px] font-medium">Zemin (Floor):</span>
                <b className="text-sm text-emerald-400 font-mono">{immersiveCalc.floorW} × {immersiveCalc.floorH} px</b>
                <span className="text-slate-500 block text-[10px] mt-0.5">{roomL}m × {roomW}m ({floorCols*floorRows} PJ)</span>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10.5px]">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Piksel Boyutu (Mevcut):</span>
                  <span className="font-mono font-bold text-sky-400">~{immersiveCalc.floorAvgMm} mm/px</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500">Piksel Yoğunluğu:</span>
                  <span className="text-slate-300 font-mono">{immersiveCalc.floorPpi} PPI</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-emerald-400/80">
                  <span>İdeal Zemin Yürüyüş:</span>
                  <span>2.5 - 4.5 mm</span>
                </div>
              </div>
            </div>
          </div>

          {/* Toplam Canvas & Projektör Kartı */}
          <div className="bg-gradient-to-r from-sky-950/70 via-slate-900 to-slate-900 p-3 rounded border border-sky-800/70 flex flex-wrap justify-between items-center gap-2">
            <div>
              <span className="text-slate-400 text-[10px] block uppercase tracking-wider">Tek Parça Kutu Açılımı (Unwrap Canvas) Ebatı:</span>
              <span className="text-xl lg:text-2xl font-black text-sky-300 font-mono">{immersiveCalc.totalCanvasW} × {immersiveCalc.totalCanvasH} px</span>
              <span className="text-slate-400 text-xs ml-2">({immersiveCalc.megapixels} MP)</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 text-[10px] block">Toplam Projektör Donanımı:</span>
              <b className="text-amber-400 text-base">{immersiveCalc.totalProjectors} Projektör</b>
              <span className="text-slate-500 block text-[10px]">({immersiveCalc.totalProjLong} Yan + {immersiveCalc.totalProjShort} Ön/Arka + {immersiveCalc.totalProjFloor} Zemin)</span>
            </div>
          </div>

          {/* Piksel Homojenlik Uyarısı */}
          {immersiveCalc.densityMismatchPct > 15 && (
            <div className="p-2 rounded bg-amber-950/40 border border-amber-700/60 text-amber-300 text-[11px] flex justify-between items-center">
              <span>⚠ Yüzeyler arası piksel boyutu farkı %{immersiveCalc.densityMismatchPct}! Duvar ile zemin arasında piksel ölçek farkı hissedilebilir.</span>
              <span className="text-[10px] text-amber-400 underline cursor-help" title="Farkı kapatmak için zemin projektör adedini artırabilir veya çözünürlüğünü yükseltebilirsiniz.">Öneri</span>
            </div>
          )}

          {/* Canlı Kutu Açılımı Vektör Çizimi */}
          <div className="border border-slate-700 rounded bg-slate-950 p-3 flex-1 flex flex-col items-center justify-center min-h-[360px]">
            <div className="text-xs text-slate-300 mb-1 font-semibold">5-Yüzey Kutu Açılımı (Ölçü Çizgileri & Piksel Eşleşmesi)</div>
            <div className="w-full flex-1 flex items-center justify-center">
              <svg viewBox="0 0 700 840" className="max-w-full max-h-[350px] drop-shadow-md">
                {/* Merkez: Zemin */}
                <rect x="250" y="160" width="200" height="480" fill="#bae6fd" stroke="#0284c7" strokeWidth="3" />
                <text x="350" y="370" fill="#0369a1" fontSize="16" fontWeight="bold" textAnchor="middle">ZEMİN (FLOOR)</text>
                <text x="350" y="395" fill="#0f172a" fontSize="15" fontWeight="bold" fontFamily="monospace" textAnchor="middle">{immersiveCalc.floorW} × {immersiveCalc.floorH} px</text>
                <text x="350" y="415" fill="#0369a1" fontSize="13" fontWeight="bold" fontFamily="monospace" textAnchor="middle">Piksel: ~{immersiveCalc.floorAvgMm} mm/px ({immersiveCalc.floorPpi} PPI)</text>
                <text x="350" y="435" fill="#475569" fontSize="12" textAnchor="middle">({roomL}m × {roomW}m) · {floorCols*floorRows} PJ</text>

                {/* Sol Uzun Duvar */}
                <rect x="90" y="160" width="160" height="480" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
                <text x="170" y="370" fill="#0369a1" fontSize="15" fontWeight="bold" textAnchor="middle" transform="rotate(-90 170 370)">SOL UZUN DUVAR</text>
                <text x="170" y="395" fill="#0f172a" fontSize="14" fontWeight="bold" fontFamily="monospace" textAnchor="middle" transform="rotate(-90 170 395)">{immersiveCalc.longWallW} × {immersiveCalc.longWallH} px ({longCols*longRows} PJ)</text>
                <text x="170" y="415" fill="#0369a1" fontSize="12" fontWeight="bold" fontFamily="monospace" textAnchor="middle" transform="rotate(-90 170 415)">Piksel: ~{immersiveCalc.longAvgMm} mm/px ({immersiveCalc.longPpi} PPI)</text>

                {/* Sağ Uzun Duvar */}
                <rect x="450" y="160" width="160" height="480" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
                <text x="530" y="370" fill="#0369a1" fontSize="15" fontWeight="bold" textAnchor="middle" transform="rotate(90 530 370)">SAĞ UZUN DUVAR</text>
                <text x="530" y="395" fill="#0f172a" fontSize="14" fontWeight="bold" fontFamily="monospace" textAnchor="middle" transform="rotate(90 530 395)">{immersiveCalc.longWallW} × {immersiveCalc.longWallH} px ({longCols*longRows} PJ)</text>
                <text x="530" y="415" fill="#0369a1" fontSize="12" fontWeight="bold" fontFamily="monospace" textAnchor="middle" transform="rotate(90 530 415)">Piksel: ~{immersiveCalc.longAvgMm} mm/px ({immersiveCalc.longPpi} PPI)</text>

                {/* Üst Kısa Duvar */}
                <rect x="250" y="40" width="200" height="120" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
                <text x="350" y="85" fill="#0369a1" fontSize="14" fontWeight="bold" textAnchor="middle">ÖN KISA DUVAR</text>
                <text x="350" y="105" fill="#0f172a" fontSize="13" fontWeight="bold" fontFamily="monospace" textAnchor="middle">{immersiveCalc.shortWallW} × {immersiveCalc.shortWallH} px ({shortCols*shortRows} PJ)</text>
                <text x="350" y="125" fill="#0369a1" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle">Piksel: ~{immersiveCalc.shortAvgMm} mm/px ({immersiveCalc.shortPpi} PPI)</text>

                {/* Alt Kısa Duvar */}
                <rect x="250" y="640" width="200" height="120" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
                <text x="350" y="685" fill="#0369a1" fontSize="14" fontWeight="bold" textAnchor="middle">ARKA KISA DUVAR</text>
                <text x="350" y="705" fill="#0f172a" fontSize="13" fontWeight="bold" fontFamily="monospace" textAnchor="middle">{immersiveCalc.shortWallW} × {immersiveCalc.shortWallH} px ({shortCols*shortRows} PJ)</text>
                <text x="350" y="725" fill="#0369a1" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle">Piksel: ~{immersiveCalc.shortAvgMm} mm/px ({immersiveCalc.shortPpi} PPI)</text>

                {/* Ölçülendirme Çizgileri */}
                <line x1="250" y1="25" x2="450" y2="25" stroke="#f59e0b" strokeWidth="2" />
                <line x1="250" y1="18" x2="250" y2="32" stroke="#f59e0b" strokeWidth="2" />
                <line x1="450" y1="18" x2="450" y2="32" stroke="#f59e0b" strokeWidth="2" />
                <text x="350" y="18" fill="#f59e0b" fontSize="13" fontWeight="bold" textAnchor="middle">{roomW} m ({immersiveCalc.shortWallW} px)</text>

                <line x1="90" y1="145" x2="250" y2="145" stroke="#f59e0b" strokeWidth="2" />
                <line x1="90" y1="138" x2="90" y2="152" stroke="#f59e0b" strokeWidth="2" />
                <line x1="250" y1="138" x2="250" y2="152" stroke="#f59e0b" strokeWidth="2" />
                <text x="170" y="138" fill="#f59e0b" fontSize="13" fontWeight="bold" textAnchor="middle">{roomH} m ({immersiveCalc.longWallH} px)</text>

                <line x1="65" y1="160" x2="65" y2="640" stroke="#f59e0b" strokeWidth="2" />
                <line x1="58" y1="160" x2="72" y2="160" stroke="#f59e0b" strokeWidth="2" />
                <line x1="58" y1="640" x2="72" y2="640" stroke="#f59e0b" strokeWidth="2" />
                <text x="50" y="405" fill="#f59e0b" fontSize="14" fontWeight="bold" textAnchor="middle" transform="rotate(-90 50 405)">{roomL} m ({immersiveCalc.longWallW} px)</text>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
