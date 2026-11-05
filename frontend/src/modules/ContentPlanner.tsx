import { useState, useMemo } from 'react';
import { pctToPx } from '../engine/multiproj';
import { LengthUnit, round } from '../engine/units';
import { download } from '../util';

interface PresetRes { label: string; w: number; h: number }
const RESOLUTIONS: PresetRes[] = [
  { label: 'Full HD (1920×1080)', w: 1920, h: 1080 },
  { label: 'WUXGA (1920×1200)', w: 1920, h: 1200 },
  { label: '4K UHD (3840×2160)', w: 3840, h: 2160 },
  { label: '4K DCI (4096×2160)', w: 4096, h: 2160 },
  { label: 'WXGA (1280×800)', w: 1280, h: 800 },
  { label: 'SXGA+ (1400×1050)', w: 1400, h: 1050 },
];

export default function ContentPlanner({ unit }: { unit: LengthUnit }) {
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(1);
  const [resIdx, setResIdx] = useState(0);
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1080);
  const [isCustom, setIsCustom] = useState(false);
  const [overlapPctX, setOverlapPctX] = useState(10);
  const [overlapPctY, setOverlapPctY] = useState(10);
  const [fps, setFps] = useState(60);
  const [codec, setCodec] = useState<'hap' | 'prores' | 'h264' | 'h265'>('prores');

  // Tek projektör çözünürlüğü
  const singleW = isCustom ? customW : RESOLUTIONS[resIdx].w;
  const singleH = isCustom ? customH : RESOLUTIONS[resIdx].h;

  // Hesaplamalar
  const calc = useMemo(() => {
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

    // Projektör dilimleri (Slices)
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
          col: c + 1,
          row: r + 1,
          startX,
          endX,
          startY,
          endY,
          w: singleW,
          h: singleH,
        });
      }
    }

    // Yaklaşık Bitrate & Dosya Boyutu (MB/s ve GB/dakika)
    // Prores 422 HQ ~ 220 Mbps @ 1080p60. Piksel sayısına göre orantılanır.
    const refPixels = 1920 * 1080;
    const pixelRatio = totalPixels / refPixels;
    const fpsRatio = fps / 60;
    
    let baseBitrateMbps = 120; // ProRes normal
    if (codec === 'hap') baseBitrateMbps = 180;
    if (codec === 'h265') baseBitrateMbps = 45;
    if (codec === 'h264') baseBitrateMbps = 60;

    const estimatedBitrateMbps = Math.round(baseBitrateMbps * pixelRatio * fpsRatio);
    const gigabytesPerMinute = round((estimatedBitrateMbps * 60) / (8 * 1024), 2);

    return {
      ox,
      oy,
      rawTotalW,
      rawTotalH,
      overlapTotalW,
      overlapTotalH,
      contentW,
      contentH,
      totalPixels,
      megapixels,
      aspect,
      slices,
      estimatedBitrateMbps,
      gigabytesPerMinute,
    };
  }, [cols, rows, singleW, singleH, overlapPctX, overlapPctY, fps, codec]);

  // After Effects Kılavuz Şablonu PNG (1:1 Transparent Guide Layer)
  const downloadAeTemplate = () => {
    const canvas = document.createElement('canvas');
    canvas.width = calc.contentW;
    canvas.height = calc.contentH;
    const ctx = canvas.getContext('2d')!;

    // Yarı saydam grid & arkaplan
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, calc.contentW, calc.contentH);

    // Kılavuz çizgileri ve alanlar
    calc.slices.forEach((s, i) => {
      // Dilim çerçevesi
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.strokeRect(s.startX + 1.5, s.startY + 1.5, s.w - 3, s.h - 3);

      // Metin bilgisi
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 36px monospace';
      ctx.fillText(`${s.label}: [${s.startX}..${s.endX}] × [${s.startY}..${s.endY}]`, s.startX + 30, s.startY + 60);

      // Merkez çarpı
      const cx = s.startX + s.w / 2;
      const cy = s.startY + s.h / 2;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy); ctx.lineTo(cx + 30, cy);
      ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy + 30);
      ctx.stroke();
    });

    // Overlap çizgileri (Sarı kesikli)
    ctx.fillStyle = 'rgba(250, 204, 21, 0.15)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    for (let c = 1; c < cols; c++) {
      const x = c * (singleW - calc.ox);
      ctx.fillRect(x, 0, calc.ox, calc.contentH);
      ctx.strokeRect(x, 0, calc.ox, calc.contentH);
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`OVERLAP ${calc.ox}px`, x + 10, calc.contentH / 2);
    }

    // Ana Başlık
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(`İÇERİK TESLİM ŞABLONU: ${calc.contentW} × ${calc.contentH} px @ ${fps}fps`, 40, calc.contentH - 40);

    canvas.toBlob(blob => {
      if (blob) download(`content-template-${calc.contentW}x${calc.contentH}.png`, blob);
    });
  };

  // Metin Raporunu Kopyalama (Sanatçıya Göndermek İçin)
  const copySpecText = () => {
    const text = `================================================
AV MÜHENDİSLİK - İÇERİK ÜRETİM TEKNİK ŞARTNAMESİ
================================================
Proje / Render Çözünürlüğü: ${calc.contentW} × ${calc.contentH} piksel
En-Boy Oranı: ${calc.aspect}:1
Kare Hızı (FPS): ${fps} fps
Toplam Piksel: ${calc.megapixels} Megapiksel (${calc.totalPixels.toLocaleString()} px)

PROJEKSİYON DÜZENİ:
- Düzen: ${cols} Sütun × ${rows} Satır (${cols * rows} Projektör)
- Tek Projektör Çözünürlüğü: ${singleW} × ${singleH} px
- Yatay Örtüşme (Overlap): %${overlapPctX} (${calc.ox} px)
${rows > 1 ? `- Dikey Örtüşme (Overlap): %${overlapPctY} (${calc.oy} px)\n` : ''}
PROJEKTÖR KESİM KOORDİNATLARI (INPUT SLICES):
${calc.slices.map(s => `- ${s.label}: X=${s.startX}..${s.endX} (W=${s.w}px), Y=${s.startY}..${s.endY} (H=${s.h}px)`).join('\n')}

ÖNERİLEN ÇIKTI FORMATLARI:
- Codec: ${codec.toUpperCase()} (${codec === 'hap' ? 'Medya Sunucuları için GPU HAP' : codec === 'prores' ? 'Apple ProRes 422 / LT' : 'H.265 Master'})
- Tahmini Veri Hızı: ~${calc.estimatedBitrateMbps} Mbps
- Tahmini Disk Alanı: ~${calc.gigabytesPerMinute} GB / dakika
================================================`;
    navigator.clipboard.writeText(text);
    alert('Teknik şartname panoya kopyalandı! İçerik üreticisine doğrudan yapıştırabilirsiniz.');
  };

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4 h-full text-xs">
      {/* Sol Panel: Parametreler */}
      <div className="space-y-3 p-3.5 rounded border border-slate-700 bg-slate-900 overflow-auto" style={{ maxHeight: '88vh' }}>
        <div className="border-b border-slate-700 pb-2">
          <h2 className="text-sm font-semibold text-sky-300">İçerik Çözünürlüğü Planlayıcı</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            After Effects, Premiere, Unreal Engine veya 3D stüdyolar için net teslim çözünürlüğü ve kılavuz oluşturucu.
          </p>
        </div>

        {/* Projektör Düzeni */}
        <div className="space-y-1.5">
          <span className="font-semibold text-slate-200">1. Projektör Dizilimi</span>
          <div className="grid grid-cols-2 gap-2">
            <label>Yatay Adet (Sütun)
              <input className="inp" type="number" min="1" max="16" value={cols} onChange={e => setCols(Math.max(1, Math.round(+e.target.value)))} />
            </label>
            <label>Dikey Adet (Satır)
              <input className="inp" type="number" min="1" max="8" value={rows} onChange={e => setRows(Math.max(1, Math.round(+e.target.value)))} />
            </label>
          </div>
        </div>

        {/* Projektör Çözünürlüğü */}
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

        {/* Örtüşme (Overlap) */}
        <div className="space-y-1.5 border-t border-slate-800 pt-2">
          <span className="font-semibold text-slate-200">3. Bindirme / Örtüşme (Overlap)</span>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between">
                <span>Yatay Overlap: %{overlapPctX}</span>
                <b className="text-emerald-400">{calc.ox} piksel</b>
              </div>
              <input className="w-full mt-1" type="range" min="0" max="40" value={overlapPctX} onChange={e => setOverlapPctX(+e.target.value)} disabled={cols <= 1} />
            </div>
            {rows > 1 && (
              <div>
                <div className="flex justify-between">
                  <span>Dikey Overlap: %{overlapPctY}</span>
                  <b className="text-emerald-400">{calc.oy} piksel</b>
                </div>
                <input className="w-full mt-1" type="range" min="0" max="40" value={overlapPctY} onChange={e => setOverlapPctY(+e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {/* Video & Render Standartları */}
        <div className="space-y-1.5 border-t border-slate-800 pt-2">
          <span className="font-semibold text-slate-200">4. Video & Codec Tercihleri</span>
          <div className="grid grid-cols-2 gap-2">
            <label>Kare Hızı (FPS)
              <select className="inp" value={fps} onChange={e => setFps(+e.target.value)}>
                <option value={30}>30 fps</option>
                <option value={50}>50 fps (PAL Pro)</option>
                <option value={60}>60 fps (Önerilen)</option>
                <option value={120}>120 fps (Ultra Akıcı)</option>
              </select>
            </label>
            <label>Format / Codec
              <select className="inp" value={codec} onChange={e => setCodec(e.target.value as any)}>
                <option value="prores">Apple ProRes 422</option>
                <option value="hap">HAP (GPU Accelerated)</option>
                <option value="h265">H.265 / HEVC</option>
                <option value="h264">H.264 MP4</option>
              </select>
            </label>
          </div>
        </div>

        {/* Aksiyon Butonları */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <button className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-white font-semibold flex items-center justify-center gap-1.5 shadow" onClick={downloadAeTemplate}>
            <span>1:1 AE / Premiere Kılavuz Şablonu İndir (PNG)</span>
          </button>
          <button className="w-full py-2 bg-sky-700 hover:bg-sky-600 rounded text-white font-semibold flex items-center justify-center gap-1.5" onClick={copySpecText}>
            <span>Şartname Metnini Kopyala (WhatsApp / E-Posta)</span>
          </button>
        </div>
      </div>

      {/* Sağ Panel: Çözünürlük Çıktısı, Tablo ve Görsel Kılavuz */}
      <div className="space-y-3 min-w-0 flex flex-col">
        {/* Büyük Sonuç Kartı */}
        <div className="bg-gradient-to-r from-sky-950/80 via-slate-900 to-slate-900 p-4 rounded-lg border border-sky-800/80 shadow">
          <div className="text-slate-400 font-medium uppercase tracking-wider text-[11px]">İçerik Stüdyosu İçin Teslim Çözünürlüğü (Composition Size)</div>
          <div className="flex flex-wrap items-baseline gap-3 mt-1">
            <span className="text-2xl lg:text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
              {calc.contentW} × {calc.contentH} px
            </span>
            <span className="text-slate-300 font-medium">({calc.aspect}:1 Aspect Ratio)</span>
            <span className="px-2 py-0.5 rounded bg-sky-900/60 text-sky-300 font-mono text-xs border border-sky-700">
              {calc.megapixels} MP
            </span>
            <span className="text-slate-400 text-xs">@ {fps} fps</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-800 text-[11px]">
            <div><span className="text-slate-400 block">Ham Piksel Toplamı:</span> <b className="text-slate-200">{calc.rawTotalW}×{calc.rawTotalH} px</b></div>
            <div><span className="text-slate-400 block">Toplam Örtüşme Kaybı:</span> <b className="text-amber-400">-{calc.overlapTotalW} px genişlik</b></div>
            <div><span className="text-slate-400 block">Tahmini Veri Hızı:</span> <b className="text-slate-200">~{calc.estimatedBitrateMbps} Mbps</b></div>
            <div><span className="text-slate-400 block">Dakika Başına Boyut:</span> <b className="text-slate-200">~{calc.gigabytesPerMinute} GB / dk</b></div>
          </div>
        </div>

        {/* Görsel İnteraktif Şema Önizlemesi */}
        <div className="border border-slate-700 rounded bg-slate-950 p-3 flex-1 flex flex-col items-center justify-center relative min-h-[320px]">
          <div className="text-xs text-slate-400 mb-2 font-semibold">İçerik Canvas & Projektör Sınırları Önizlemesi (Guide Preview)</div>
          <div className="w-full flex-1 flex items-center justify-center p-2">
            <svg
              viewBox={`0 0 ${calc.contentW} ${calc.contentH}`}
              className="max-w-full max-h-[300px] border-2 border-slate-600 rounded bg-slate-900 shadow-lg"
            >
              {/* Dilimler */}
              {calc.slices.map((s, i) => (
                <g key={s.id}>
                  <rect
                    x={s.startX}
                    y={s.startY}
                    width={s.w}
                    height={s.h}
                    fill={i % 2 === 0 ? 'rgba(56, 189, 248, 0.12)' : 'rgba(99, 102, 241, 0.12)'}
                    stroke="#38bdf8"
                    strokeWidth="4"
                  />
                  <text
                    x={s.startX + s.w / 2}
                    y={s.startY + s.h / 2}
                    fill="#38bdf8"
                    fontSize={Math.max(28, Math.round(s.h / 12))}
                    fontFamily="monospace"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {s.label} ({s.w}×{s.h})
                  </text>
                  <text
                    x={s.startX + s.w / 2}
                    y={s.startY + s.h / 2 + Math.max(30, Math.round(s.h / 10))}
                    fill="#94a3b8"
                    fontSize={Math.max(20, Math.round(s.h / 18))}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    X: [{s.startX} .. {s.endX}]
                  </text>
                </g>
              ))}

              {/* Overlap Taramaları */}
              {cols > 1 && Array.from({ length: cols - 1 }).map((_, c) => {
                const oxX = (c + 1) * (singleW - calc.ox);
                return (
                  <g key={c}>
                    <rect x={oxX} y={0} width={calc.ox} height={calc.contentH} fill="rgba(250, 204, 21, 0.25)" stroke="#facc15" strokeWidth="2" strokeDasharray="10 6" />
                    <text x={oxX + calc.ox / 2} y={calc.contentH * 0.15} fill="#facc15" fontSize="24" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                      {calc.ox}px
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            * Sarı kesikli alanlar projektörlerin üst üste bindiği (Soft-Edge Blending) alanlardır.
          </div>
        </div>

        {/* Projektör Dilimleri (Slices) Teknik Tablosu */}
        <div className="bg-slate-900 border border-slate-800 rounded p-2.5 overflow-auto text-xs space-y-1.5">
          <div className="flex justify-between items-center font-semibold text-slate-200">
            <span>Projektör Kesim & Atama Koordinatları (Input Mapping)</span>
            <span className="text-[11px] text-slate-400">After Effects / Medya Sunucusu Dilim Haritası</span>
          </div>
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800 text-[11px]">
                <th className="py-1">Projektör</th>
                <th>Başlangıç X</th>
                <th>Bitiş X</th>
                <th>Başlangıç Y</th>
                <th>Bitiş Y</th>
                <th>Efektif Boyut</th>
                <th>Örtüşme (Sol / Sağ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {calc.slices.map((s, idx) => (
                <tr key={s.id} className="hover:bg-slate-800/40">
                  <td className="py-1.5 font-semibold text-sky-300 font-sans">{s.label}</td>
                  <td className="text-emerald-400 font-bold">{s.startX} px</td>
                  <td className="text-emerald-400 font-bold">{s.endX} px</td>
                  <td>{s.startY} px</td>
                  <td>{s.endY} px</td>
                  <td>{s.w} × {s.h} px</td>
                  <td className="text-amber-400">
                    {idx > 0 ? `${calc.ox} px` : '0 px'} / {idx < cols - 1 ? `${calc.ox} px` : '0 px'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
