import { useEffect, useMemo, useRef, useState } from 'react';
import { computeLux, heatmap, LuxResult } from '../engine/lux';
import { LengthUnit, toMeters, round } from '../engine/units';

function colorFor(t: number): [number, number, number] {
  // basit mavi→yeşil→sarı→kırmızı skalası
  const stops: [number, number, number][] = [[20, 30, 140], [20, 160, 200], [40, 190, 80], [240, 220, 40], [220, 40, 30]];
  const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1), i = Math.min(Math.floor(x), stops.length - 2), f = x - i;
  return [0, 1, 2].map(k => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f)) as [number, number, number];
}

export default function LuxCalculator({ unit }: { unit: LengthUnit }) {
  const [advanced, setAdvanced] = useState(false);
  const [lm, setLm] = useState(5000), [pct, setPct] = useState(100);
  const [w, setW] = useState(4), [h, setH] = useState(2.25), [gain, setGain] = useState(1);
  const [amb, setAmb] = useState(0), [n, setN] = useState(1), [ov, setOv] = useState(10);
  const [ang, setAng] = useState(0), [blend, setBlend] = useState(true), [uni, setUni] = useState(0.85);
  const cv = useRef<HTMLCanvasElement>(null);

  const calc = useMemo<{ r: LuxResult | null; err: string | null }>(() => {
    try {
      const W = toMeters(w, unit), H = toMeters(h, unit);
      return { r: computeLux({ ansiLumens: Array(n).fill(lm), brightnessPct: pct, width: W, height: H, gain, ambientLux: amb, surfaceAngleDeg: advanced ? ang : 0 }), err: null };
    } catch (e) { return { r: null, err: (e as Error).message }; }
  }, [lm, pct, w, h, gain, amb, n, ang, advanced, unit]);

  const hm = useMemo(() => {
    try {
      const W = toMeters(w, unit), H = toMeters(h, unit);
      const cos = advanced ? Math.cos(ang * Math.PI / 180) : 1;
      const res = heatmap({ projectors: n, lumensEach: lm * pct / 100 * cos, width: W, height: H, overlapFraction: n > 1 ? ov / 100 : 0, blend, cornerUniformity: advanced ? uni : 1, cols: 160, rows: 90 });
      return res;
    } catch { return null; }
  }, [lm, pct, w, h, n, ov, blend, uni, advanced, ang, unit]);

  useEffect(() => {
    const c = cv.current; if (!c || !hm) return;
    const ctx = c.getContext('2d')!; const img = ctx.createImageData(160, 90);
    const span = hm.max - hm.min || 1;
    hm.data.forEach((e, i) => { const [r, g, b] = colorFor((e - hm.min) / span); img.data.set([r, g, b, 255], i * 4); });
    ctx.putImageData(img, 0, 0);
  }, [hm]);

  const r = calc.r;
  const row = (k: string, v: string, tip?: string) => <tr title={tip}><td>{k}</td><td className="text-right">{v}</td></tr>;
  let ovInfo = '';
  try { if (n > 1) ovInfo = `${round(w / (n - (n - 1) * ov / 100), 3)} ${unit}`; } catch { /* yok */ }

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4 h-full">
      <div className="space-y-2 p-4 rounded border border-slate-700 bg-slate-900 overflow-auto text-sm">
        <h2 className="font-semibold">Lux & Parlaklık Hesaplayıcı</h2>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={advanced} onChange={e => setAdvanced(e.target.checked)} /> Gelişmiş fotometrik mod</label>
        <F l="Projektör ANSI lümen (lm)" v={lm} s={setLm} /><F l="Gerçek parlaklık (%)" v={pct} s={setPct} />
        <F l={`Toplam görüntü genişliği (${unit})`} v={w} s={setW} /><F l={`Görüntü yüksekliği (${unit})`} v={h} s={setH} />
        <F l="Yüzey kazancı (gain)" v={gain} s={setGain} />
        <F l="Ortam aydınlatması (lux, ekran yüzeyinde)" v={amb} s={setAmb} />
        <F l="Projektör sayısı" v={n} s={v => setN(Math.max(1, Math.round(v)))} />
        {n > 1 && <><F l="Yatay örtüşme (%)" v={ov} s={setOv} />
          <label className="flex gap-2"><input type="checkbox" checked={blend} onChange={e => setBlend(e.target.checked)} /> İdeal kenar harmanlama</label>
          <div className="text-xs text-slate-400">Her projektör görüntü genişliği: {ovInfo}</div></>}
        {advanced && <><F l="Yüzey açısı (°, 0 = dik)" v={ang} s={setAng} />
          <F l="Köşe/merkez düzgünlüğü (0–1, datasheet)" v={uni} s={setUni} /></>}
      </div>
      <div className="space-y-3 min-w-0">
        {calc.err && <p className="text-red-400">⚠ {calc.err}</p>}
        {r && <div className="grid md:grid-cols-2 gap-3">
          <table className="w-full border border-slate-700 p-2"><tbody>
            {row('Toplam ışık akısı', `${round(r.totalLumens, 1)} lm`, 'Luminous flux')}
            {row('Alan', `${round(r.area, 3)} m²`)}
            {row('Lümen / m²', `${round(r.lumensPerM2, 2)}`)}
            {row('Ortalama aydınlatma', `${round(r.illuminanceLux, 1)} lux (${round(r.illuminanceFc, 1)} fc)`, 'Illuminance')}
            {row('Ekran parlaklığı', `${round(r.luminanceNits, 1)} cd/m² (nit)`, 'Luminance')}
            {row('Foot-lambert', `${round(r.luminanceFL, 2)} fL`)}
            {row('Ortam luminance', `${round(r.ambientLuminanceNits, 2)} cd/m²`)}
            {row('Ortam dahil kontrast', r.contrastRatioWithAmbient ? `${round(r.contrastRatioWithAmbient, 1)}:1` : '—')}
            {row('Projektör başına', r.perProjectorLumens.map(x => round(x, 0)).join(' + ') + ' lm')}
            {hm && row('Isı haritası min / max / ort', `${round(hm.min, 0)} / ${round(hm.max, 0)} / ${round(hm.avg, 0)} lux`)}
            {hm && row('Tahmini düzgünlük (min/maks)', `${round(hm.min / hm.max * 100, 1)} %`)}
          </tbody></table>
          <div className="text-xs text-slate-400 border border-slate-700 p-2">
            <b>Varsayımlar ve doğruluk sınırları</b>
            <ul className="list-disc pl-4">{r.assumptions.map(a => <li key={a}>{a}</li>)}
              <li>Isı haritası yaklaşık modeldir (kuadratik köşe düşüşü); ölçümün yerine geçmez.</li>
              <li>Harmansız örtüşme bölgesi aydınlatması toplanır (≈ 2×).</li></ul>
          </div>
        </div>}
        <div>
          <canvas ref={cv} width={160} height={90} className="w-full border border-slate-700" style={{ imageRendering: 'pixelated', aspectRatio: `${w} / ${h}` }} />
          <button className="mt-2 px-3 py-1 bg-sky-700 rounded text-sm" onClick={() => {
            const a = document.createElement('a'); a.download = 'lux-isi-haritasi.png'; a.href = cv.current!.toDataURL('image/png'); a.click();
          }}>PNG olarak indir</button>
          <span className="text-xs text-slate-500 ml-2">PDF dışa aktarımı Faz 6 (rapor modülü) kapsamındadır.</span>
        </div>
      </div>
    </div>
  );
}
const F = ({ l, v, s }: { l: string; v: number; s: (n: number) => void }) => (
  <label className="block">{l}<input className="inp" type="number" step="any" value={v} onChange={e => s(+e.target.value)} /></label>);
