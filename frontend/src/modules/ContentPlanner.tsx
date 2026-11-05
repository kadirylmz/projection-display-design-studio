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
  // Sekme modu: 'wall' (Düz/Yan Yana Çoklu Projektör) veya 'immersive' (5-Yüzey Kutu Açılımı)
  const [plannerMode, setPlannerMode] = useState<'wall' | 'immersive'>('immersive');

  // --- MOD A: DÜZ ÇOKLU PROJEKTÖR DUVARI ---
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(1);
  const [resIdx, setResIdx] = useState(0);
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1200);
  const [isCustom, setIsCustom] = useState(false);
  const [overlapPctX, setOverlapPctX] = useState(10);
  const [overlapPctY, setOverlapPctY] = useState(10);
  const [fps, setFps] = useState(60);
  const [codec, setCodec] = useState<'hap' | 'prores' | 'h264' | 'h265'>('prores');

  const singleW = isCustom ? customW : RESOLUTIONS[resIdx].w;
  const singleH = isCustom ? customH : RESOLUTIONS[resIdx].h;

  // --- MOD B: İMMERSİVE ODA (5-YÜZEY KUTU AÇILIMI) ---
  const [roomL, setRoomL] = useState(23.30); // Uzun Duvar boyu (m)
  const [roomW, setRoomW] = useState(7.00);  // Kısa Duvar eni (m)
  const [roomH, setRoomH] = useState(4.30);  // Duvar yüksekliği (m)
  const [wallRows, setWallRows] = useState(1); // Duvarda üst üste kaç projektör var (genelde 1)
  const [projOrientation, setProjOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [projW, setProjW] = useState(1920);
  const [projH, setProjH] = useState(1200);
  const [projBlendPct, setProjBlendPct] = useState(12);

  // --- DÜZ DUVAR HESAPLAMASI ---
  const wallCalc = useMemo(() => {
    const ox = cols > 1 ? pctToPx(overlapPctX, singleW) : 0;
    const oy = rows > 1 ? pctToPx(overlapPctY, singleH) : 0;
    const rawTotalW = cols * singleW;
    const rawTotalH = rows * singleH;
    const overlapTotalW = (cols - 1) * ox;
    const overlapTotalH = (rows - 1) * oy;
    const contentW = rawTotalW - overlapTotalW;
    const contentH = rawTotalH - overlapTotalH;
    const totalPixels = contentW * contentH;
    const megapixels = round(totalPixels / 1_000_000, 2);
    const aspect = round(contentW / contentH, 2);

    const slices = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c + 1;
        const startX = c * (singleW - ox);
        const endX = startX + singleW;
        const startY = r * (singleH - oy);
        const endY = startY + singleH;
        slices.push({
          id: `PJ${idx}`,
          label: `Projektör ${idx}`,
          startX, endX, startY, endY,
          w: singleW, h: singleH,
        });
      }
    }

    const refPixels = 1920 * 1080;
    const pixelRatio = totalPixels / refPixels;
    const fpsRatio = fps / 60;
    let baseBitrateMbps = 120;
    if (codec === 'hap') baseBitrateMbps = 180;
    if (codec === 'h265') baseBitrateMbps = 45;
    if (codec === 'h264') baseBitrateMbps = 60;

    const estimatedBitrateMbps = Math.round(baseBitrateMbps * pixelRatio * fpsRatio);
    const gigabytesPerMinute = round((estimatedBitrateMbps * 60) / (8 * 1024), 2);

    return {
      ox, oy, rawTotalW, rawTotalH, overlapTotalW, overlapTotalH,
      contentW, contentH, totalPixels, megapixels, aspect, slices,
      estimatedBitrateMbps, gigabytesPerMinute,
    };
  }, [cols, rows, singleW, singleH, overlapPctX, overlapPctY, fps, codec]);

  // --- İMMERSİVE 5-YÜZEY KUTU AÇILIMI HESAPLAMASI ---
  const immersiveCalc = useMemo(() => {
    // Projektörün duvardaki düşey (yükseklik) pikseli:
    // Eğer Landscape ise dikey piksel = projH (örn: 1200)
    // Eğer Portrait ise dikey piksel = projW (örn: 1920)
    const singleProjVertPx = projOrientation === 'landscape' ? projH : projW;
    const singleProjHorizPx = projOrientation === 'landscape' ? projW : projH;

    // Duvarda düşeyde birden fazla projektör varsa (blend çıkarılır)
    const vertBlendPx = wallRows > 1 ? pctToPx(projBlendPct, singleProjVertPx) : 0;
    const totalWallHpx = wallRows * singleProjVertPx - (wallRows - 1) * vertBlendPx;

    // 1 metreye düşen piksel oranı (Duvar yüksekliği üzerinden homojen piksel boyutu):
    const pxPerMeter = totalWallHpx / roomH;
    const mmPerPixel = round((1000 / pxPerMeter), 2);

    // Yüzey piksel boyutları (Seçilen projektörün çözünürlüğüne TAM DİNAMİK bağlı)
    const longWallW = Math.round(roomL * pxPerMeter);
    const longWallH = totalWallHpx;

    const shortWallW = Math.round(roomW * pxPerMeter);
    const shortWallH = totalWallHpx;

    const floorW = longWallW;
    const floorH = shortWallW;

    // Kutu Açılımı (Cross Unwrap) Toplam Canvas Ebatları:
    // Yatay: Sol Duvar Yüksekliği + Zemin Eni + Sağ Duvar Yüksekliği
    const totalCanvasW = shortWallH + floorH + shortWallH;
    // Düşey: Üst Kısa Duvar + Zemin Boyu + Alt Kısa Duvar
    const totalCanvasH = shortWallH + floorW + shortWallH;

    const totalPixels = (longWallW * longWallH * 2) + (shortWallW * shortWallH * 2) + (floorW * floorH);
    const megapixels = round(totalPixels / 1_000_000, 2);

    // Projektör Adedi Hesabı (Yatay blend çıkarılmış efektif genişlik)
    const effProjHorizPx = singleProjHorizPx * (1 - projBlendPct / 100);
    const effProjVertPx = singleProjVertPx * (1 - projBlendPct / 100);

    const pjPerLongWall = Math.ceil(longWallW / effProjHorizPx);
    const pjPerShortWall = Math.ceil(shortWallW / effProjHorizPx);

    // Zemin için tavan projektörleri (Zemin eni ve boyu)
    const pjFloorCols = Math.ceil(floorW / effProjHorizPx);
    const pjFloorRows = Math.ceil(floorH / effProjVertPx);
    const pjFloorTotal = pjFloorCols * pjFloorRows;

    const totalProjectors = (pjPerLongWall * 2 * wallRows) + (pjPerShortWall * 2 * wallRows) + pjFloorTotal;

    return {
      singleProjVertPx,
      singleProjHorizPx,
      totalWallHpx,
      pxPerMeter: round(pxPerMeter, 2),
      mmPerPixel,
      longWallW,
      longWallH,
      shortWallW,
      shortWallH,
      floorW,
      floorH,
      totalCanvasW,
      totalCanvasH,
      totalPixels,
      megapixels,
      pjPerLongWall,
      pjPerShortWall,
      pjFloorTotal,
      totalProjectors,
    };
  }, [roomL, roomW, roomH, wallRows, projOrientation, projW, projH, projBlendPct]);

  // --- İMMERSIVE KUTU AÇILIMI ŞABLONU İNDİR (PNG) ---
  const downloadImmersiveTemplate = () => {
    const c = document.createElement('canvas');
    c.width = immersiveCalc.totalCanvasW;
    c.height = immersiveCalc.totalCanvasH;
    const g = c.getContext('2d')!;

    // Arkaplan
    g.fillStyle = '#0b1329';
    g.fillRect(0, 0, c.width, c.height);

    const { shortWallH, floorH, floorW, shortWallW, longWallW, longWallH } = immersiveCalc;

    // Koordinat yerleşimleri (Haç/Kutu Açılımı)
    const floorX = shortWallH;
    const floorY = shortWallH;
    const leftWallX = 0;
    const leftWallY = shortWallH;
    const rightWallX = shortWallH + floorH;
    const rightWallY = shortWallH;
    const topWallX = shortWallH;
    const topWallY = 0;
    const botWallX = shortWallH;
    const botWallY = shortWallH + floorW;

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

    drawBox(floorX, floorY, floorH, floorW, 'ZEMİN (FLOOR)', `${floorW} × ${floorH} px (${roomL}m × ${roomW}m)`, 'rgba(14, 165, 233, 0.15)');
    drawBox(leftWallX, leftWallY, shortWallH, floorW, 'SOL UZUN DUVAR', `${longWallW} × ${longWallH} px (${roomL}m × ${roomH}m)`, 'rgba(56, 189, 248, 0.1)');
    drawBox(rightWallX, rightWallY, shortWallH, floorW, 'SAĞ UZUN DUVAR', `${longWallW} × ${longWallH} px (${roomL}m × ${roomH}m)`, 'rgba(56, 189, 248, 0.1)');
    drawBox(topWallX, topWallY, floorH, shortWallH, 'ÖN KISA DUVAR', `${shortWallW} × ${shortWallH} px (${roomW}m × ${roomH}m)`, 'rgba(99, 102, 241, 0.15)');
    drawBox(botWallX, botWallY, floorH, shortWallH, 'ARKA KISA DUVAR', `${shortWallW} × ${shortWallH} px (${roomW}m × ${roomH}m)`, 'rgba(99, 102, 241, 0.15)');

    g.fillStyle = '#facc15';
    g.font = 'bold 42px monospace';
    g.textAlign = 'left';
    g.fillText(`IMMERSIVE BOX UNWRAP CANVAS: ${c.width} × ${c.height} px | Piksel Boyutu: ${immersiveCalc.mmPerPixel} mm/px`, 40, 60);

    c.toBlob(blob => {
      if (blob) download(`immersive-box-canvas-${c.width}x${c.height}.png`, blob);
    });
  };

  const copyImmersiveSpecs = () => {
    const text = `=======================================================
AV MÜHENDİSLİK - İMMERSİVE ODA İÇERİK ŞARTNAMESİ (5-YÜZEY)
=======================================================
MEKAN ÖLÇÜLERİ:
- Oda Uzunluğu: ${roomL} m
- Oda Genişliği: ${roomW} m
- Duvar Yüksekliği: ${roomH} m
- Homojen Piksel Yoğunluğu: ${immersiveCalc.mmPerPixel} mm/px (${immersiveCalc.pxPerMeter} px/m)

YÜZEY ÇÖZÜNÜRLÜKLERİ (İÇERİK TESLİM):
1. Uzun Duvarlar (Sağ & Sol): ${immersiveCalc.longWallW} × ${immersiveCalc.longWallH} piksel (${roomL}m × ${roomH}m)
2. Kısa Duvarlar (Ön & Arka): ${immersiveCalc.shortWallW} × ${immersiveCalc.shortWallH} piksel (${roomW}m × ${roomH}m)
3. Zemin (Floor): ${immersiveCalc.floorW} × ${immersiveCalc.floorH} piksel (${roomL}m × ${roomW}m)

KUTU AÇILIMI (CROSS UNWRAP) TOPLAM CANVAS:
- Birleşik Render Ebatı: ${immersiveCalc.totalCanvasW} × ${immersiveCalc.totalCanvasH} piksel
- Toplam Aktif Piksel: ${immersiveCalc.megapixels} Megapiksel (${immersiveCalc.totalPixels.toLocaleString()} px)

PROJEKSİYON DONANIM TAHMİNİ (${projW}×${projH} WUXGA @ %${projBlendPct} Blend):
- Uzun Duvarlar: ${immersiveCalc.pjPerLongWall} × 2 = ${immersiveCalc.pjPerLongWall * 2} Projektör
- Kısa Duvarlar: ${immersiveCalc.pjPerShortWall} × 2 = ${immersiveCalc.pjPerShortWall * 2} Projektör
- Zemin (Dikey Izgara): ${immersiveCalc.pjFloorTotal} Projektör
- TOPLAM SİSTEM: Yaklaşık ${immersiveCalc.totalProjectors} Projektör
=======================================================`;
    navigator.clipboard.writeText(text);
    alert('İmmersive oda teknik şartnamesi panoya kopyalandı!');
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
            <span>İmmersive Oda (5-Yüzey Kutu Açılımı)</span>
            <span className="px-1.5 py-0.2 bg-sky-950 text-sky-200 rounded text-[10px]">Popüler</span>
          </button>
          <button
            onClick={() => setPlannerMode('wall')}
            className={`px-3 py-1.5 rounded font-semibold text-xs ${plannerMode === 'wall' ? 'bg-sky-700 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-750'}`}
          >
            Düz Duvar / Çoklu Projektör Sırası
          </button>
        </div>
        <span className="text-slate-400 text-[11px] hidden sm:inline">
          After Effects, Premiere, Notch ve Unreal Engine stüdyoları için içerik şartnamesi.
        </span>
      </div>

      {/* --- SEÇENEK 1: İMMERSİVE KUTU AÇILIMI MODU --- */}
      {plannerMode === 'immersive' && (
        <div className="grid lg:grid-cols-[380px_1fr] gap-4 flex-1 overflow-auto">
          {/* Sol Panel: Mekan Ölçüleri */}
          <div className="space-y-3 p-3.5 rounded border border-slate-700 bg-slate-900 overflow-auto" style={{ maxHeight: '84vh' }}>
            <div className="border-b border-slate-700 pb-2">
              <h2 className="text-sm font-semibold text-sky-300">5-Yüzey İmmersive Oda & Tünel</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Sağ duvar, sol duvar, ön/arka duvarlar ve zemin için homojen piksel yoğunluklu kutu açılımı.
              </p>
            </div>

            <div className="space-y-2">
              <span className="font-semibold text-slate-200">1. Fiziksel Mekan Boyutları (Metre)</span>
              <div className="grid grid-cols-3 gap-2">
                <label>Oda Boyu (m)
                  <input className="inp font-bold text-sky-400" type="number" step="0.1" value={roomL} onChange={e => setRoomL(+e.target.value)} />
                </label>
                <label>Oda Eni (m)
                  <input className="inp font-bold text-sky-400" type="number" step="0.1" value={roomW} onChange={e => setRoomW(+e.target.value)} />
                </label>
                <label>Yükseklik (m)
                  <input className="inp font-bold text-sky-400" type="number" step="0.1" value={roomH} onChange={e => setRoomH(+e.target.value)} />
                </label>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-800 pt-2">
              <span className="font-semibold text-slate-200">2. Projektör Donanımı & Çözünürlük Seçimi</span>
              <div className="grid grid-cols-2 gap-2">
                <label>Projektör Modeli / Çözünürlük
                  <select className="inp font-bold text-sky-300" value={`${projW}x${projH}`} onChange={e => {
                    const [w, h] = e.target.value.split('x').map(Number);
                    setProjW(w); setProjH(h);
                  }}>
                    <option value="1920x1200">1920×1200 (WUXGA 16:10)</option>
                    <option value="1920x1080">1920×1080 (Full HD 16:9)</option>
                    <option value="3840x2160">3840×2160 (4K UHD 16:9)</option>
                    <option value="4096x2160">4096×2160 (4K DCI 17:9)</option>
                    <option value="1280x800">1280×800 (WXGA 16:10)</option>
                  </select>
                </label>
                <label>Projektör Yönü (Orientation)
                  <select className="inp font-semibold text-slate-200" value={projOrientation} onChange={e => setProjOrientation(e.target.value as any)}>
                    <option value="landscape">Yatay (Landscape)</option>
                    <option value="portrait">Dikey (Portrait / 90°)</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label>Duvarda Düşey Projektör Sırası
                  <input className="inp" type="number" min="1" max="4" value={wallRows} onChange={e => setWallRows(Math.max(1, Math.round(+e.target.value)))} />
                </label>
                <label>Blend Örtüşme Payı (%)
                  <input className="inp" type="number" min="5" max="30" value={projBlendPct} onChange={e => setProjBlendPct(+e.target.value)} />
                </label>
              </div>

              {/* Projektörden Otomatik Türetilen Duvar Çözünürlük Özeti */}
              <div className="p-2 bg-slate-950 rounded border border-slate-800 space-y-1 mt-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Duvar Yükseklik Pikseli:</span>
                  <b className="text-emerald-400 font-mono text-xs">{immersiveCalc.totalWallHpx} px</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Piksel Boyutu (Homojen):</span>
                  <b className="text-emerald-400 font-mono text-xs">{immersiveCalc.mmPerPixel} mm / px</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Piksel Yoğunluğu:</span>
                  <span className="text-slate-300 font-mono">{immersiveCalc.pxPerMeter} px / metre</span>
                </div>
              </div>
            </div>

            {/* Aksiyon Butonları */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <button
                className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-white font-semibold flex items-center justify-center gap-1.5 shadow"
                onClick={downloadImmersiveTemplate}
              >
                1:1 Kutu Açılımı Kılavuz Şablonu İndir (PNG)
              </button>
              <button
                className="w-full py-2 bg-sky-700 hover:bg-sky-600 rounded text-white font-semibold flex items-center justify-center gap-1.5"
                onClick={copyImmersiveSpecs}
              >
                İçerik Şartnamesini Kopyala (Metin)
              </button>
            </div>
          </div>

          {/* Sağ Panel: Canlı Kutu Açılımı Çizimi & Sonuçlar */}
          <div className="space-y-3 min-w-0 flex flex-col overflow-auto">
            {/* Büyük Sonuç Kartları */}
            <div className="grid sm:grid-cols-3 gap-2.5">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                <span className="text-slate-400 block text-[11px]">Uzun Duvarlar (Sağ & Sol):</span>
                <b className="text-base text-emerald-400 font-mono">{immersiveCalc.longWallW} × {immersiveCalc.longWallH} px</b>
                <span className="text-slate-500 block text-[10px] mt-0.5">{roomL}m × {roomH}m (2 Adet)</span>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                <span className="text-slate-400 block text-[11px]">Kısa Duvarlar (Ön & Arka):</span>
                <b className="text-base text-emerald-400 font-mono">{immersiveCalc.shortWallW} × {immersiveCalc.shortWallH} px</b>
                <span className="text-slate-500 block text-[10px] mt-0.5">{roomW}m × {roomH}m (2 Adet)</span>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                <span className="text-slate-400 block text-[11px]">Zemin (Floor):</span>
                <b className="text-base text-emerald-400 font-mono">{immersiveCalc.floorW} × {immersiveCalc.floorH} px</b>
                <span className="text-slate-500 block text-[10px] mt-0.5">{roomL}m × {roomW}m</span>
              </div>
            </div>

            {/* Toplam Canvas & Donanım Kartı */}
            <div className="bg-gradient-to-r from-sky-950/70 via-slate-900 to-slate-900 p-3.5 rounded border border-sky-800/70 flex flex-wrap justify-between items-center gap-3">
              <div>
                <span className="text-slate-400 text-[11px] block uppercase tracking-wider">Tek Parça Kutu Açılımı (Cross Unwrap) Render Boyutu:</span>
                <span className="text-2xl font-black text-sky-300 font-mono">{immersiveCalc.totalCanvasW} × {immersiveCalc.totalCanvasH} px</span>
                <span className="text-slate-400 ml-2">({immersiveCalc.megapixels} Megapiksel)</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-[11px] block">Tahmini Projektör Adedi:</span>
                <b className="text-amber-400 text-lg">{immersiveCalc.totalProjectors} Adet WUXGA</b>
                <span className="text-slate-500 block text-[10px]">({immersiveCalc.pjPerLongWall*2} Yan + {immersiveCalc.pjPerShortWall*2} Ön/Arka + {immersiveCalc.pjFloorTotal} Zemin)</span>
              </div>
            </div>

            {/* Görsel Kutu Açılımı Şeması (Görselinizdekiyle Birebir) */}
            <div className="border border-slate-700 rounded bg-slate-950 p-4 flex-1 flex flex-col items-center justify-center min-h-[380px]">
              <div className="text-xs text-slate-300 mb-2 font-semibold">5-Yüzey Kutu Açılımı (Unwrap Layout & Ölçülendirme)</div>
              <div className="w-full flex-1 flex items-center justify-center">
                <svg viewBox="0 0 700 840" className="max-w-full max-h-[360px] drop-shadow-md">
                  {/* Merkez: Zemin */}
                  <rect x="250" y="160" width="200" height="480" fill="#bae6fd" stroke="#0284c7" strokeWidth="3" />
                  <text x="350" y="380" fill="#0369a1" fontSize="16" fontWeight="bold" textAnchor="middle">ZEMİN (FLOOR)</text>
                  <text x="350" y="405" fill="#0f172a" fontSize="15" fontWeight="bold" fontFamily="monospace" textAnchor="middle">{immersiveCalc.floorW} × {immersiveCalc.floorH} px</text>
                  <text x="350" y="425" fill="#475569" fontSize="13" textAnchor="middle">({roomL}m × {roomW}m)</text>

                  {/* Sol Uzun Duvar */}
                  <rect x="90" y="160" width="160" height="480" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
                  <text x="170" y="380" fill="#0369a1" fontSize="15" fontWeight="bold" textAnchor="middle" transform="rotate(-90 170 380)">SOL UZUN DUVAR</text>
                  <text x="170" y="405" fill="#0f172a" fontSize="14" fontWeight="bold" fontFamily="monospace" textAnchor="middle" transform="rotate(-90 170 405)">{immersiveCalc.longWallW} × {immersiveCalc.longWallH} px</text>

                  {/* Sağ Uzun Duvar */}
                  <rect x="450" y="160" width="160" height="480" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
                  <text x="530" y="380" fill="#0369a1" fontSize="15" fontWeight="bold" textAnchor="middle" transform="rotate(90 530 380)">SAĞ UZUN DUVAR</text>
                  <text x="530" y="405" fill="#0f172a" fontSize="14" fontWeight="bold" fontFamily="monospace" textAnchor="middle" transform="rotate(90 530 405)">{immersiveCalc.longWallW} × {immersiveCalc.longWallH} px</text>

                  {/* Üst Kısa Duvar */}
                  <rect x="250" y="40" width="200" height="120" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
                  <text x="350" y="95" fill="#0369a1" fontSize="14" fontWeight="bold" textAnchor="middle">ÖN KISA DUVAR</text>
                  <text x="350" y="115" fill="#0f172a" fontSize="13" fontWeight="bold" fontFamily="monospace" textAnchor="middle">{immersiveCalc.shortWallW} × {immersiveCalc.shortWallH} px</text>

                  {/* Alt Kısa Duvar */}
                  <rect x="250" y="640" width="200" height="120" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
                  <text x="350" y="695" fill="#0369a1" fontSize="14" fontWeight="bold" textAnchor="middle">ARKA KISA DUVAR</text>
                  <text x="350" y="715" fill="#0f172a" fontSize="13" fontWeight="bold" fontFamily="monospace" textAnchor="middle">{immersiveCalc.shortWallW} × {immersiveCalc.shortWallH} px</text>

                  {/* Ölçülendirme Çizgileri ve Oklar */}
                  {/* Üst Kısa Duvar Genişliği (7.00 m / 1954 px) */}
                  <line x1="250" y1="25" x2="450" y2="25" stroke="#f59e0b" strokeWidth="2" />
                  <line x1="250" y1="18" x2="250" y2="32" stroke="#f59e0b" strokeWidth="2" />
                  <line x1="450" y1="18" x2="450" y2="32" stroke="#f59e0b" strokeWidth="2" />
                  <text x="350" y="18" fill="#f59e0b" fontSize="13" fontWeight="bold" textAnchor="middle">{roomW} m ({immersiveCalc.shortWallW} px)</text>

                  {/* Sol Duvar Yüksekliği (4.30 m / 1200 px) */}
                  <line x1="90" y1="145" x2="250" y2="145" stroke="#f59e0b" strokeWidth="2" />
                  <line x1="90" y1="138" x2="90" y2="152" stroke="#f59e0b" strokeWidth="2" />
                  <line x1="250" y1="138" x2="250" y2="152" stroke="#f59e0b" strokeWidth="2" />
                  <text x="170" y="138" fill="#f59e0b" fontSize="13" fontWeight="bold" textAnchor="middle">{roomH} m ({immersiveCalc.shortWallH} px)</text>

                  {/* Sol Duvar Boyu (23.30 m / 6503 px) */}
                  <line x1="65" y1="160" x2="65" y2="640" stroke="#f59e0b" strokeWidth="2" />
                  <line x1="58" y1="160" x2="72" y2="160" stroke="#f59e0b" strokeWidth="2" />
                  <line x1="58" y1="640" x2="72" y2="640" stroke="#f59e0b" strokeWidth="2" />
                  <text x="50" y="405" fill="#f59e0b" fontSize="14" fontWeight="bold" textAnchor="middle" transform="rotate(-90 50 405)">{roomL} m ({immersiveCalc.longWallW} px)</text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SEÇENEK 2: DÜZ DUVAR ÇOKLU PROJEKTÖR MODU --- */}
      {plannerMode === 'wall' && (
        <div className="grid lg:grid-cols-[380px_1fr] gap-4 flex-1 overflow-auto">
          <div className="space-y-3 p-3.5 rounded border border-slate-700 bg-slate-900 overflow-auto" style={{ maxHeight: '84vh' }}>
            <div className="border-b border-slate-700 pb-2">
              <h2 className="text-sm font-semibold text-sky-300">Düz Duvar / Çizgisel Dizi</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Yan yana veya ızgara düzeninde tek bir yüzeyi kaplayan projektör dizilimi.</p>
            </div>

            <div className="space-y-1.5">
              <span className="font-semibold text-slate-200">1. Projektör Dizilimi</span>
              <div className="grid grid-cols-2 gap-2">
                <label>Yatay Adet (Sütun)<input className="inp" type="number" min="1" max="16" value={cols} onChange={e => setCols(Math.max(1, Math.round(+e.target.value)))} /></label>
                <label>Dikey Adet (Satır)<input className="inp" type="number" min="1" max="8" value={rows} onChange={e => setRows(Math.max(1, Math.round(+e.target.value)))} /></label>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-slate-800 pt-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">2. Projektör Çözünürlüğü</span>
                <label className="flex items-center gap-1 text-[11px]">
                  <input type="checkbox" checked={isCustom} onChange={e => setIsCustom(e.target.checked)} />
                  <span>Özel</span>
                </label>
              </div>
              {!isCustom ? (
                <select className="inp" value={resIdx} onChange={e => setResIdx(+e.target.value)}>
                  {RESOLUTIONS.map((r, i) => (
                    <option key={r.label} value={i}>{r.label}</option>
                  ))}
                </select>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label>Genişlik (px)<input className="inp" type="number" value={customW} onChange={e => setCustomW(+e.target.value)} /></label>
                  <label>Yükseklik (px)<input className="inp" type="number" value={customH} onChange={e => setCustomH(+e.target.value)} /></label>
                </div>
              )}
            </div>

            <div className="space-y-1.5 border-t border-slate-800 pt-2">
              <span className="font-semibold text-slate-200">3. Örtüşme (Overlap)</span>
              <div>
                <div className="flex justify-between">
                  <span>Yatay Overlap: %{overlapPctX}</span>
                  <b className="text-emerald-400">{wallCalc.ox} px</b>
                </div>
                <input className="w-full mt-1" type="range" min="0" max="40" value={overlapPctX} onChange={e => setOverlapPctX(+e.target.value)} disabled={cols <= 1} />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <button
                className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-white font-semibold"
                onClick={() => {
                  const canvas = document.createElement('canvas');
                  canvas.width = wallCalc.contentW; canvas.height = wallCalc.contentH;
                  const ctx = canvas.getContext('2d')!;
                  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, wallCalc.contentW, wallCalc.contentH);
                  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 4;
                  ctx.strokeRect(4, 4, wallCalc.contentW - 8, wallCalc.contentH - 8);
                  ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 36px monospace';
                  ctx.fillText(`DUVAR ŞABLONU: ${wallCalc.contentW} × ${wallCalc.contentH} px`, 30, 60);
                  canvas.toBlob(b => b && download(`wall-template-${wallCalc.contentW}x${wallCalc.contentH}.png`, b));
                }}
              >
                1:1 Duvar Şablonu İndir (PNG)
              </button>
            </div>
          </div>

          <div className="space-y-3 min-w-0 flex flex-col">
            <div className="bg-gradient-to-r from-sky-950/80 via-slate-900 to-slate-900 p-4 rounded-lg border border-sky-800/80 shadow">
              <div className="text-slate-400 font-medium uppercase tracking-wider text-[11px]">Duvar Render Çözünürlüğü:</div>
              <div className="flex flex-wrap items-baseline gap-3 mt-1">
                <span className="text-3xl font-extrabold text-emerald-400 font-mono">{wallCalc.contentW} × {wallCalc.contentH} px</span>
                <span className="text-slate-300">({wallCalc.aspect}:1)</span>
              </div>
            </div>

            <div className="border border-slate-700 rounded bg-slate-950 p-4 flex-1 flex flex-col items-center justify-center min-h-[300px]">
              <div className="text-xs text-slate-400 mb-2 font-semibold">Projektör Kesim & Dilim Haritası</div>
              <svg viewBox={`0 0 ${wallCalc.contentW} ${wallCalc.contentH}`} className="max-w-full max-h-[260px] border border-slate-700 rounded bg-slate-900">
                {wallCalc.slices.map((s, i) => (
                  <g key={s.id}>
                    <rect x={s.startX} y={s.startY} width={s.w} height={s.h} fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" strokeWidth="4" />
                    <text x={s.startX + s.w/2} y={s.startY + s.h/2} fill="#38bdf8" fontSize={s.h/10} fontWeight="bold" textAnchor="middle">{s.label}</text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
