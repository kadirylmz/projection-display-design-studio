import { useEffect, useMemo, useState } from 'react';
import { PRESET_ASPECTS, Aspect, diagonal, heightFromWidth, heightFromDiagonal, widthFromDiagonal, widthFromHeight } from '../engine/aspect';
import { LensRecord, STANDARD_LENS_PRESETS, distanceForLens, sizeRangeForLens } from '../engine/lenses';
import { LengthUnit, fromMeters, toMeters, round } from '../engine/units';
import { api } from '../api';

type Mode = 'w2h' | 'h2w' | 'd2wh' | 'wh2d';
type LensTab = 'bySize' | 'byDist';
const UNITS: LengthUnit[] = ['m', 'cm', 'mm', 'in', 'ft'];

interface UnifiedLens {
  id: string;
  category: string;
  name: string;
  throwMin: number;
  throwMax: number;
  notes?: string;
  isDb?: boolean;
}

export default function ScreenCalculator({ unit }: { unit: LengthUnit }) {
  const [mode, setMode] = useState<Mode>('w2h');
  const [ar, setAr] = useState('16:9');
  const [cw, setCw] = useState(16);
  const [ch, setCh] = useState(9);
  const [a, setA] = useState(4);
  const [b, setB] = useState(2.25);
  const [inUnit, setInUnit] = useState<LengthUnit>(unit);

  // Lens & Mesafe analizi state'leri
  const [lensTab, setLensTab] = useState<LensTab>('bySize');
  const [targetDistInput, setTargetDistInput] = useState<string>(''); // Opsiyonel hedef mesafe (Ekran Boyutu -> Mesafe modunda filtre)
  const [calcDist, setCalcDist] = useState<number>(6); // Mesafe -> Açılan Boyut modundaki mesafe (inUnit cinsinden)
  const [customTrMin, setCustomTrMin] = useState<number>(1.2);
  const [customTrMax, setCustomTrMax] = useState<number>(1.6);
  const [dbLenses, setDbLenses] = useState<LensRecord[]>([]);

  useEffect(() => {
    api.lenses().then(setDbLenses).catch(() => setDbLenses([]));
  }, []);

  const aspect: Aspect = ar === 'custom' ? { w: cw, h: ch } : PRESET_ASPECTS[ar];
  const aspectNum = aspect.w / aspect.h;

  const res = useMemo(() => {
    try {
      const A = toMeters(a, inUnit), B = toMeters(b, inUnit);
      let w: number, h: number;
      if (mode === 'w2h') { w = A; h = heightFromWidth(A, aspect); }
      else if (mode === 'h2w') { h = A; w = widthFromHeight(A, aspect); }
      else if (mode === 'd2wh') { w = widthFromDiagonal(A, aspect); h = heightFromDiagonal(A, aspect); }
      else { w = A; h = B; }
      return { w, h, d: diagonal(w, h), err: null as string | null };
    } catch (e) { return { w: 0, h: 0, d: 0, err: (e as Error).message }; }
  }, [mode, a, b, inUnit, aspect.w, aspect.h]);

  const allLenses: UnifiedLens[] = useMemo(() => {
    const dbMapped: UnifiedLens[] = dbLenses.map(l => ({
      id: `db-${l.id}`,
      category: 'Veritabanı',
      name: `${l.manufacturer} ${l.model}`,
      throwMin: l.throw_min,
      throwMax: l.throw_max,
      notes: l.lens_mount ? `Mount: ${l.lens_mount}` : undefined,
      isDb: true,
    }));
    const presets: UnifiedLens[] = STANDARD_LENS_PRESETS.map(p => ({
      id: p.id,
      category: p.category,
      name: p.name,
      throwMin: p.throwMin,
      throwMax: p.throwMax,
      notes: p.notes,
    }));
    return [...dbMapped, ...presets];
  }, [dbLenses]);

  const f = (m: number, digits = 3) => round(fromMeters(m, unit), digits);
  const labelA = { w2h: 'Genişlik', h2w: 'Yükseklik', d2wh: 'Diagonal', wh2d: 'Genişlik' }[mode];

  // Hedef mesafe varsa metre cinsinden değeri ve gereken TR
  const targetDistM = useMemo(() => {
    const val = parseFloat(targetDistInput);
    if (!Number.isFinite(val) || val <= 0) return null;
    return toMeters(val, inUnit);
  }, [targetDistInput, inUnit]);

  const requiredTrForTarget = targetDistM && res.w > 0 ? targetDistM / res.w : null;

  // Mesafe -> Boyut modundaki metre cinsinden mesafe
  const calcDistM = useMemo(() => {
    if (!Number.isFinite(calcDist) || calcDist <= 0) return 0;
    return toMeters(calcDist, inUnit);
  }, [calcDist, inUnit]);

  const applyWidthToPreview = (widthM: number) => {
    setMode('w2h');
    setA(round(fromMeters(widthM, inUnit), 3));
  };

  const validCustomTr = customTrMin > 0 && customTrMax >= customTrMin;

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4 h-full">
      {/* Sol Kontrol Paneli */}
      <div className="space-y-3 p-4 rounded border border-slate-700 bg-slate-900 overflow-auto">
        <h2 className="font-semibold">Ekran Boyutu Hesaplayıcı</h2>
        <label className="block text-sm">Mod
          <select className="inp" value={mode} onChange={e => setMode(e.target.value as Mode)}>
            <option value="w2h">Genişlik → Yükseklik</option>
            <option value="h2w">Yükseklik → Genişlik</option>
            <option value="d2wh">Diagonal → Genişlik ve Yükseklik</option>
            <option value="wh2d">Genişlik ve Yükseklik → Diagonal</option>
          </select></label>
        <label className="block text-sm" title="Ekranın yatay:dikey oran değeri">En-boy oranı
          <select className="inp" value={ar} onChange={e => setAr(e.target.value)}>
            {Object.keys(PRESET_ASPECTS).map(k => <option key={k}>{k}</option>)}
            <option value="custom">Özel</option>
          </select></label>
        {ar === 'custom' && (
          <div className="flex gap-2">
            <input className="inp" type="number" min="0.01" value={cw} onChange={e => setCw(+e.target.value)} />
            <input className="inp" type="number" min="0.01" value={ch} onChange={e => setCh(+e.target.value)} />
          </div>)}
        <label className="block text-sm">Giriş birimi
          <select className="inp" value={inUnit} onChange={e => setInUnit(e.target.value as LengthUnit)}>
            {UNITS.map(u => <option key={u}>{u}</option>)}</select></label>
        <label className="block text-sm">{labelA} ({inUnit})
          <input className="inp" type="number" step="any" value={a} onChange={e => setA(+e.target.value)} /></label>
        {mode === 'wh2d' && (
          <label className="block text-sm">Yükseklik ({inUnit})
            <input className="inp" type="number" step="any" value={b} onChange={e => setB(+e.target.value)} /></label>)}
        {res.err && <p className="text-red-400 text-sm">⚠ {res.err}</p>}
        {!res.err && (
          <table className="text-sm w-full border-t border-slate-800 pt-2"><tbody>
            <tr><td className="py-0.5 text-slate-400">Genişlik</td><td className="text-right font-medium">{f(res.w, 4)} {unit}</td></tr>
            <tr><td className="py-0.5 text-slate-400">Yükseklik</td><td className="text-right font-medium">{f(res.h, 4)} {unit}</td></tr>
            <tr><td className="py-0.5 text-slate-400">Diagonal</td><td className="text-right font-medium">{f(res.d, 4)} {unit}</td></tr>
            <tr><td className="py-0.5 text-slate-400">Diagonal (inç)</td><td className="text-right font-medium">{round(fromMeters(res.d, 'in'), 2)} in</td></tr>
            <tr><td className="py-0.5 text-slate-400">Alan</td><td className="text-right font-medium">{round(res.w * res.h, 2)} m²</td></tr>
            <tr><td className="py-0.5 text-slate-400">Oran</td><td className="text-right font-medium">{round(res.w / res.h, 4)}:1</td></tr>
          </tbody></table>)}

        {/* Özel Throw Ratio Hızlı Test */}
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Özel Lens (TR) Hızlı Test</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label>TR Min (Geniş)
              <input className="inp" type="number" step="0.01" min="0.1" value={customTrMin} onChange={e => setCustomTrMin(+e.target.value)} />
            </label>
            <label>TR Max (Tele)
              <input className="inp" type="number" step="0.01" min="0.1" value={customTrMax} onChange={e => setCustomTrMax(+e.target.value)} />
            </label>
          </div>
          {!res.err && validCustomTr && (
            <div className="text-xs bg-slate-950 border border-slate-800 rounded p-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Bu ekran için mesafe:</span>
                <span className="font-semibold text-emerald-300">
                  {customTrMin === customTrMax
                    ? `${f(res.w * customTrMin, 2)} ${unit}`
                    : `${f(res.w * customTrMin, 2)} – ${f(res.w * customTrMax, 2)} ${unit}`}
                </span>
              </div>
              {calcDistM > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">{calcDist} {inUnit} mesafeden açar:</span>
                  <span className="font-semibold text-sky-300">
                    {customTrMin === customTrMax
                      ? `${f(calcDistM / customTrMin, 2)} × ${f((calcDistM / customTrMin) / aspectNum, 2)} ${unit}`
                      : `${f(calcDistM / customTrMax, 2)} – ${f(calcDistM / customTrMin, 2)} ${unit} (G)`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sağ Panel: Önizleme + Lens & Mesafe Tablosu */}
      <div className="flex flex-col gap-4 min-w-0 overflow-auto">
        <div className="p-3 rounded border border-slate-700 bg-slate-950 flex items-center justify-center min-h-[210px] max-h-[260px]">
          {!res.err && <ScreenPreview w={res.w} h={res.h} unit={unit} />}
        </div>

        {/* Lens & Mesafe Karşılıklı Analiz Paneli */}
        <div className="p-4 rounded border border-slate-700 bg-slate-900 space-y-3 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex gap-2">
              <button
                onClick={() => setLensTab('bySize')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                  lensTab === 'bySize'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                📏 Ekran Boyutuna Göre Mesafe &amp; Lensler
              </button>
              <button
                onClick={() => setLensTab('byDist')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                  lensTab === 'byDist'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🎯 Mesafe Gir → Kaç Açıyor?
              </button>
            </div>

            {lensTab === 'bySize' ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Hedef Kurulum Mesafem ({inUnit}):</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Opsiyonel (örn: 5)"
                  value={targetDistInput}
                  onChange={e => setTargetDistInput(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-1 w-32 text-slate-100 focus:border-sky-500 outline-none"
                />
                {requiredTrForTarget !== null && (
                  <span className="px-2 py-1 rounded bg-sky-900/50 border border-sky-700 text-sky-300 font-semibold">
                    Gereken TR: {round(requiredTrForTarget, 2)}:1
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Projektör – Yüzey Mesafesi ({inUnit}):</span>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  value={calcDist}
                  onChange={e => setCalcDist(+e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-1 w-24 text-slate-100 font-semibold focus:border-sky-500 outline-none"
                />
                <span className="text-slate-500">Oran: {round(aspectNum, 2)}:1</span>
              </div>
            )}
          </div>

          {/* Mod 1: Ekran Boyutu -> Hangi metreden hangi lens ile açılır? */}
          {lensTab === 'bySize' && !res.err && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                Seçili görüntü boyutu <strong className="text-slate-200">{f(res.w, 2)} × {f(res.h, 2)} {unit}</strong> ({round(fromMeters(res.d, 'in'), 1)} in) için her lens kategorisinin gereken kurulum mesafesi:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="py-2 pr-3">Lens / Kategori</th>
                      <th className="py-2 px-3">Atım Oranı (TR)</th>
                      <th className="py-2 px-3">Kurulum Mesafesi ({unit})</th>
                      {targetDistM !== null && <th className="py-2 px-3">Hedef Mesafe Uyumu</th>}
                      <th className="py-2 pl-3">Açıklama</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {allLenses.map(l => {
                      const { minDist, maxDist } = distanceForLens(res.w, l.throwMin, l.throwMax);
                      const isFixed = Math.abs(l.throwMin - l.throwMax) < 1e-6;
                      const eps = 1e-6;
                      const isMatch = targetDistM !== null && targetDistM >= minDist - eps && targetDistM <= maxDist + eps;
                      const zoomPct = isMatch && !isFixed && requiredTrForTarget !== null
                        ? round(((requiredTrForTarget - l.throwMin) / (l.throwMax - l.throwMin)) * 100, 0)
                        : null;

                      return (
                        <tr
                          key={l.id}
                          className={
                            isMatch
                              ? 'bg-emerald-950/40 text-emerald-200'
                              : targetDistM !== null
                                ? 'opacity-50 hover:opacity-90'
                                : 'hover:bg-slate-800/40'
                          }
                        >
                          <td className="py-2 pr-3 font-medium">
                            <span className="text-slate-400 mr-1.5">[{l.category}]</span>
                            <span className={isMatch ? 'text-emerald-300 font-semibold' : 'text-slate-200'}>{l.name}</span>
                          </td>
                          <td className="py-2 px-3 font-mono text-sky-300">
                            {isFixed ? `${l.throwMin.toFixed(2)}:1` : `${l.throwMin.toFixed(2)} – ${l.throwMax.toFixed(2)}:1`}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-100">
                            {isFixed
                              ? `${f(minDist, 2)} ${unit}`
                              : `${f(minDist, 2)} – ${f(maxDist, 2)} ${unit}`}
                          </td>
                          {targetDistM !== null && (
                            <td className="py-2 px-3">
                              {isMatch ? (
                                <span className="inline-block px-2 py-0.5 rounded bg-emerald-800/60 text-emerald-300 font-semibold">
                                  ✔ Uygun {zoomPct !== null ? `(Zoom %${zoomPct})` : '(Sabit)'}
                                </span>
                              ) : (
                                <span className="text-slate-500">
                                  {targetDistM < minDist ? 'Çok yakın' : 'Çok uzak'}
                                </span>
                              )}
                            </td>
                          )}
                          <td className="py-2 pl-3 text-slate-400">{l.notes ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mod 2: Mesafe -> Her lens o mesafeden kaç m görüntü açar? */}
          {lensTab === 'byDist' && (
            <div className="space-y-2">
              {calcDistM <= 0 ? (
                <p className="text-amber-400 text-xs">Lütfen geçerli bir mesafe değeri girin.</p>
              ) : (
                <>
                  <p className="text-xs text-slate-400">
                    <strong className="text-slate-200">{f(calcDistM, 2)} {unit}</strong> mesafeden ({ar === 'custom' ? `${cw}:${ch}` : ar} oranında) her lensin açabileceği görüntü boyutları:
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-700 text-slate-400">
                          <th className="py-2 pr-3">Lens / Kategori</th>
                          <th className="py-2 px-3">Atım Oranı (TR)</th>
                          <th className="py-2 px-3">Açılan Genişlik ({unit})</th>
                          <th className="py-2 px-3">Açılan Yükseklik ({unit})</th>
                          <th className="py-2 px-3">Diagonal (inç)</th>
                          <th className="py-2 pl-3 text-right">Önizle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {allLenses.map(l => {
                          const { minW, maxW, minH, maxH } = sizeRangeForLens(calcDistM, l.throwMin, l.throwMax, aspectNum);
                          const isFixed = Math.abs(l.throwMin - l.throwMax) < 1e-6;
                          const minDiagIn = round(fromMeters(diagonal(minW, minH), 'in'), 0);
                          const maxDiagIn = round(fromMeters(diagonal(maxW, maxH), 'in'), 0);

                          return (
                            <tr key={l.id} className="hover:bg-slate-800/40">
                              <td className="py-2 pr-3 font-medium">
                                <span className="text-slate-400 mr-1.5">[{l.category}]</span>
                                <span className="text-slate-200">{l.name}</span>
                              </td>
                              <td className="py-2 px-3 font-mono text-sky-300">
                                {isFixed ? `${l.throwMin.toFixed(2)}:1` : `${l.throwMin.toFixed(2)} – ${l.throwMax.toFixed(2)}:1`}
                              </td>
                              <td className="py-2 px-3 font-semibold text-emerald-300">
                                {isFixed ? `${f(maxW, 2)} ${unit}` : `${f(minW, 2)} – ${f(maxW, 2)} ${unit}`}
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-200">
                                {isFixed ? `${f(maxH, 2)} ${unit}` : `${f(minH, 2)} – ${f(maxH, 2)} ${unit}`}
                              </td>
                              <td className="py-2 px-3 text-slate-300">
                                {isFixed ? `${maxDiagIn}"` : `${minDiagIn}" – ${maxDiagIn}"`}
                              </td>
                              <td className="py-2 pl-3 text-right">
                                <button
                                  onClick={() => applyWidthToPreview((minW + maxW) / 2)}
                                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-sky-700 text-sky-300 hover:text-white transition"
                                  title="Bu boyutun ortalama genişliğini üstteki önizlemeye aktar"
                                >
                                  Göster
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScreenPreview({ w, h, unit }: { w: number; h: number; unit: LengthUnit }) {
  const pad = 44, vw = 800, vh = 320;
  const s = Math.min((vw - 2 * pad) / w, (vh - 2 * pad) / h);
  const pw = w * s, ph = h * s, x = (vw - pw) / 2, y = (vh - ph) / 2;
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className="w-full max-h-full">
      <rect x={x} y={y} width={pw} height={ph} fill="#0b3a5b" stroke="#38bdf8" strokeWidth="2" />
      <line x1={x} y1={y} x2={x + pw} y2={y + ph} stroke="#38bdf8" strokeDasharray="6 4" opacity=".5" />
      <text x={vw / 2} y={y - 10} textAnchor="middle" fill="#cbd5e1" fontSize="15">{round(fromMeters(w, unit), 3)} {unit}</text>
      <text x={x - 12} y={vh / 2} textAnchor="middle" fill="#cbd5e1" fontSize="15" transform={`rotate(-90 ${x - 12} ${vh / 2})`}>{round(fromMeters(h, unit), 3)} {unit}</text>
      <text x={vw / 2} y={vh / 2 + 5} textAnchor="middle" fill="#7dd3fc" fontSize="13" opacity="0.85">
        {round(fromMeters(diagonal(w, h), 'in'), 1)}" ({round(fromMeters(diagonal(w, h), unit), 2)} {unit})
      </text>
    </svg>
  );
}
