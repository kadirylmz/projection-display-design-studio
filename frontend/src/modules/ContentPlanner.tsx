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
              <label>Projektör Sayısı (Adet)<input className="inp" type="number" min="1" max="16" value={longCols} onChange={e => setLongCols(Math.max(1, Math.round(+e.target.value)))} /></label>
              <label>Overlap / Örtüşme (% veya Px)
                <div className="flex gap-1">
                  <input className="inp font-bold" type="number" min="0" max="50" value={longBlendPct} onChange={e => setLongBlendPct(+e.target.value)} />
                  <span className="self-center text-slate-400 font-mono text-[10px]">% ({longCols > 1 ? pctToPx(longBlendPct, longOrient === 'landscape' ? RESOLUTIONS[longResIdx].w : RESOLUTIONS[longResIdx].h) : 0}px)</span>
                </div>
              </label>
              <label>Sıra (Düşey Satır)<input className="inp" type="number" min="1" max="4" value={longRows} onChange={e => setLongRows(Math.max(1, Math.round(+e.target.value)))} /></label>
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
              <label>Projektör Sayısı (Adet)<input className="inp" type="number" min="1" max="16" value={shortCols} onChange={e => setShortCols(Math.max(1, Math.round(+e.target.value)))} /></label>
              <label>Overlap / Örtüşme (% veya Px)
                <div className="flex gap-1">
                  <input className="inp font-bold" type="number" min="0" max="50" value={shortBlendPct} onChange={e => setShortBlendPct(+e.target.value)} />
                  <span className="self-center text-slate-400 font-mono text-[10px]">% ({shortCols > 1 ? pctToPx(shortBlendPct, shortOrient === 'landscape' ? RESOLUTIONS[shortResIdx].w : RESOLUTIONS[shortResIdx].h) : 0}px)</span>
                </div>
              </label>
              <label>Sıra (Düşey Satır)<input className="inp" type="number" min="1" max="4" value={shortRows} onChange={e => setShortRows(Math.max(1, Math.round(+e.target.value)))} /></label>
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
              <label>Projektör Sayısı (Boyuna X)<input className="inp" type="number" min="1" max="16" value={floorCols} onChange={e => setFloorCols(Math.max(1, Math.round(+e.target.value)))} /></label>
              <label>Overlap / Örtüşme (% veya Px)
                <div className="flex gap-1">
                  <input className="inp font-bold" type="number" min="0" max="50" value={floorBlendPct} onChange={e => setFloorBlendPct(+e.target.value)} />
                  <span className="self-center text-slate-400 font-mono text-[10px]">% ({floorCols > 1 ? pctToPx(floorBlendPct, floorOrient === 'landscape' ? RESOLUTIONS[floorResIdx].w : RESOLUTIONS[floorResIdx].h) : 0}px)</span>
                </div>
              </label>
              <label>Sıra Sayısı (Enine Y)<input className="inp" type="number" min="1" max="8" value={floorRows} onChange={e => setFloorRows(Math.max(1, Math.round(+e.target.value)))} /></label>
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

          {/* Canlı Kutu Açılımı Vektör Çizimi (Kullanıcı Eskizine Tam Uyumlu) */}
          <div className="border border-slate-700 rounded bg-slate-950 p-3 flex-1 flex flex-col items-center justify-center min-h-[480px]">
            <div className="w-full flex justify-between items-center text-xs text-slate-300 mb-2 font-semibold border-b border-slate-800 pb-1.5">
              <span>Teknik Açınım Planı (İçerik & Projeksiyon Eşleşmesi)</span>
              <span className="font-mono text-emerald-400 text-[11px]">
                Uzun Duvar: {immersiveCalc.longWallW}×{immersiveCalc.longWallH} | Kısa Duvar: {immersiveCalc.shortWallW}×{immersiveCalc.shortWallH} | Zemin: {immersiveCalc.floorW}×{immersiveCalc.floorH}
              </span>
            </div>
            <div className="w-full flex-1 flex items-center justify-center">
              <svg viewBox="0 0 920 840" className="w-full max-h-[520px] drop-shadow-md select-none font-sans">
                {/* Referans Eksen Çizgileri (Görseldeki Kırmızı & Yeşil Eksenler) */}
                <line x1="330" y1="10" x2="330" y2="830" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="4 3" />
                <line x1="20" y1="420" x2="900" y2="420" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3 3" />

                {/* 1. ÜST KISA DUVAR: Genişlik 180 (7.00 m), Yükseklik 110 */}
                <rect x="240" y="50" width="180" height="110" fill="#bae6fd" stroke="#0f172a" strokeWidth="2.5" />
                <text x="330" y="110" fill="#0f172a" fontSize="16" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {immersiveCalc.shortWallW} pixel
                </text>
                <text x="330" y="130" fill="#0369a1" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  ({immersiveCalc.shortWallH} px boy · ~{immersiveCalc.shortAvgMm} mm/px)
                </text>

                {/* Üst Kısa Duvar Genişlik Ölçüsü (7,00 m) */}
                <line x1="240" y1="36" x2="420" y2="36" stroke="#0f172a" strokeWidth="1.5" />
                <path d="M 240 36 L 248 33 L 248 39 Z" fill="#0f172a" />
                <path d="M 420 36 L 412 33 L 412 39 Z" fill="#0f172a" />
                <text x="330" y="30" fill="#0f172a" fontSize="14" fontWeight="bold" textAnchor="middle">{roomW.toFixed(2).replace('.', ',')} m</text>

                {/* 2. MERKEZ: ZEMİN (FLOOR): Genişlik 180 (7.00 m), Boy 520 (23.30 m) */}
                <rect x="240" y="160" width="180" height="520" fill="#bae6fd" stroke="#0f172a" strokeWidth="2.5" />
                {/* Zemin Üzerinde Düşey Ölçü Metni */}
                <text x="330" y="425" fill="#0f172a" fontSize="18" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {immersiveCalc.floorW} pixel
                </text>
                <text x="330" y="450" fill="#0369a1" fontSize="13" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  Zemin ({roomL}m × {roomW}m) · ~{immersiveCalc.floorAvgMm} mm/px
                </text>

                {/* 3. SOL UZUN DUVAR: Genişlik 110 (4.30 m), Boy 520 (23.30 m) */}
                <rect x="130" y="160" width="110" height="520" fill="#bae6fd" stroke="#0f172a" strokeWidth="2.5" />
                <text x="185" y="425" fill="#0f172a" fontSize="16" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {immersiveCalc.longWallH} pixel
                </text>
                <text x="185" y="445" fill="#0369a1" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  ({immersiveCalc.longWallW} px)
                </text>

                {/* Sol Duvar En Ölçüsü (4,30 m) */}
                <line x1="130" y1="145" x2="240" y2="145" stroke="#0f172a" strokeWidth="1.5" />
                <path d="M 130 145 L 138 142 L 138 148 Z" fill="#0f172a" />
                <path d="M 240 145 L 232 142 L 232 148 Z" fill="#0f172a" />
                <text x="185" y="140" fill="#0f172a" fontSize="13" fontWeight="bold" textAnchor="middle">{roomH.toFixed(2).replace('.', ',')} m</text>

                {/* Sol Duvar Boy Ölçüsü (23,30 m) */}
                <line x1="110" y1="160" x2="110" y2="680" stroke="#0f172a" strokeWidth="1.5" />
                <path d="M 110 160 L 107 168 L 113 168 Z" fill="#0f172a" />
                <path d="M 110 680 L 107 672 L 113 672 Z" fill="#0f172a" />
                <text x="95" y="425" fill="#0f172a" fontSize="14" fontWeight="bold" textAnchor="end">{roomL.toFixed(2).replace('.', ',')} m</text>

                {/* 4. SAĞ UZUN DUVAR: Genişlik 110 (4.30 m), Boy 520 (23.30 m) */}
                <rect x="420" y="160" width="110" height="520" fill="#bae6fd" stroke="#0f172a" strokeWidth="2.5" />
                <text x="475" y="425" fill="#0f172a" fontSize="16" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {immersiveCalc.longWallH} pixel
                </text>
                <text x="475" y="445" fill="#0369a1" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  ({immersiveCalc.longWallW} px)
                </text>

                {/* 5. ALT KISA DUVAR: Genişlik 180 (7.00 m), Yükseklik 110 */}
                <rect x="240" y="680" width="180" height="110" fill="#bae6fd" stroke="#0f172a" strokeWidth="2.5" />
                <text x="330" y="740" fill="#0f172a" fontSize="16" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {immersiveCalc.shortWallW} pixel
                </text>
                <text x="330" y="760" fill="#0369a1" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  ({immersiveCalc.shortWallH} px boy · ~{immersiveCalc.shortAvgMm} mm/px)
                </text>

                {/* SAĞ TARAFTAKİ TEKNİK BİLGİ BLOKLARI (Görseldeki Gibi Birebir) */}
                <g transform="translate(560, 180)">
                  <rect x="0" y="0" width="340" height="340" rx="8" fill="#090d16" stroke="#1e293b" strokeWidth="1.5" />
                  
                  {/* Başlık: Projektör Özellikleri */}
                  <text x="20" y="32" fill="#f8fafc" fontSize="15" fontWeight="bold">
                    Projektör Çözünürlüğü:
                  </text>
                  <text x="20" y="55" fill="#38bdf8" fontSize="16" fontWeight="bold" fontFamily="monospace">
                    {immersiveCalc.longP.w} × {immersiveCalc.longP.h} ({immersiveCalc.longP.label})
                  </text>

                  <line x1="20" y1="75" x2="320" y2="75" stroke="#334155" strokeWidth="1" />

                  {/* Uzun Duvar Bilgisi */}
                  <text x="20" y="105" fill="#94a3b8" fontSize="12" fontWeight="bold">Uzun Duvar Çözünürlüğü:</text>
                  <text x="20" y="128" fill="#4ade80" fontSize="17" fontWeight="bold" fontFamily="monospace">
                    {immersiveCalc.longWallW} × {immersiveCalc.longWallH} pixel
                  </text>
                  <text x="20" y="148" fill="#64748b" fontSize="11">
                    Piksel Boyutu: ~{immersiveCalc.longAvgMm} mm/px ({immersiveCalc.longPpi} PPI)
                  </text>

                  {/* Kısa Duvar Bilgisi */}
                  <text x="20" y="180" fill="#94a3b8" fontSize="12" fontWeight="bold">Kısa Duvar Çözünürlüğü:</text>
                  <text x="20" y="203" fill="#4ade80" fontSize="17" fontWeight="bold" fontFamily="monospace">
                    {immersiveCalc.shortWallW} × {immersiveCalc.shortWallH} pixel
                  </text>
                  <text x="20" y="223" fill="#64748b" fontSize="11">
                    Piksel Boyutu: ~{immersiveCalc.shortAvgMm} mm/px ({immersiveCalc.shortPpi} PPI)
                  </text>

                  {/* Zemin Bilgisi */}
                  <text x="20" y="255" fill="#94a3b8" fontSize="12" fontWeight="bold">Zemin Çözünürlüğü:</text>
                  <text x="20" y="278" fill="#4ade80" fontSize="17" fontWeight="bold" fontFamily="monospace">
                    {immersiveCalc.floorW} × {immersiveCalc.floorH} pixel
                  </text>
                  <text x="20" y="298" fill="#64748b" fontSize="11">
                    Piksel Boyutu: ~{immersiveCalc.floorAvgMm} mm/px ({immersiveCalc.floorPpi} PPI)
                  </text>

                  {/* Toplam Canvas Alt Özet */}
                  <line x1="20" y1="315" x2="320" y2="315" stroke="#334155" strokeWidth="1" />
                  <text x="20" y="335" fill="#facc15" fontSize="13" fontWeight="bold">
                    Overlap Formülü: W = (N×w) - ((N-1)×O)
                  </text>
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
