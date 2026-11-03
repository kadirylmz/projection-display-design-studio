import { useMemo, useState } from 'react';
import { PRESET_ASPECTS } from '../engine/aspect';
import { activeAreaFromDiagonal, lcdWall } from '../engine/lcd';
import { LengthUnit, fromMeters, round } from '../engine/units';

const PRESETS: [number, number][] = [[2, 2], [3, 3], [4, 3], [4, 4]];

export default function LcdCalculator({ unit }: { unit: LengthUnit }) {
  const [cols, setCols] = useState(2), [rows, setRows] = useState(2);
  const [useDiag, setUseDiag] = useState(true);
  const [diag, setDiag] = useState(55), [ar, setAr] = useState('16:9');
  const [aw, setAw] = useState(1200), [ah, setAh] = useState(675);
  const [bezel, setBezel] = useState(2), [gap, setGap] = useState(0);
  const [nw, setNw] = useState(1920), [nh, setNh] = useState(1080);

  const out = useMemo(() => {
    try {
      const a = useDiag ? activeAreaFromDiagonal(diag * 25.4, PRESET_ASPECTS[ar]) : { activeWmm: aw, activeHmm: ah };
      return { a, r: lcdWall({ ...a, bezelMm: bezel, gapMm: gap, nativeW: nw, nativeH: nh, cols, rows }), err: null as string | null };
    } catch (e) { return { a: null, r: null, err: (e as Error).message }; }
  }, [cols, rows, useDiag, diag, ar, aw, ah, bezel, gap, nw, nh]);

  const f = (mm: number) => `${round(fromMeters(mm / 1000, unit), 3)} ${unit}`;
  const N = (l: string, v: number, s: (x: number) => void) => (
    <label className="block text-xs">{l}<input className="inp" type="number" step="any" value={v} onChange={e => s(+e.target.value)} /></label>);
  const R = out.r, A = out.a;

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4 h-full">
      <div className="space-y-2 p-3 rounded border border-slate-700 bg-slate-900 text-sm overflow-auto">
        <h2 className="font-semibold">LCD / Video Duvarı</h2>
        <div className="flex gap-1 flex-wrap">{PRESETS.map(([c, r]) => (
          <button key={`${c}${r}`} className="px-2 py-1 bg-slate-700 rounded text-xs" onClick={() => { setCols(c); setRows(r); }}>{c}×{r}</button>))}</div>
        <div className="grid grid-cols-2 gap-2">{N('Yatay adet', cols, x => setCols(Math.round(x)))}{N('Dikey adet', rows, x => setRows(Math.round(x)))}</div>
        <label className="block text-xs"><input type="checkbox" checked={useDiag} onChange={e => setUseDiag(e.target.checked)} /> Diagonaldan hesapla (inç)</label>
        {useDiag ? <div className="grid grid-cols-2 gap-2">{N('Diagonal (in)', diag, setDiag)}
          <label className="block text-xs">Oran<select className="inp" value={ar} onChange={e => setAr(e.target.value)}>{Object.keys(PRESET_ASPECTS).map(k => <option key={k}>{k}</option>)}</select></label></div>
          : <div className="grid grid-cols-2 gap-2">{N('Aktif genişlik (mm)', aw, setAw)}{N('Aktif yükseklik (mm)', ah, setAh)}</div>}
        <div className="grid grid-cols-2 gap-2">{N('Çerçeve / kenar (mm)', bezel, setBezel)}{N('Montaj boşluğu (mm)', gap, setGap)}
          {N('Native X (px)', nw, x => setNw(Math.round(x)))}{N('Native Y (px)', nh, x => setNh(Math.round(x)))}</div>
        <p className="text-[11px] text-slate-500">Çerçeve değeri bir kenardaki genişliktir; görünür dikiş = 2×çerçeve + boşluk. Datasheet'teki "bezel-to-bezel" değeri genelde dikişi verir (2×çerçeve).</p>
      </div>
      <div className="space-y-3 min-w-0">
        {out.err && <p className="text-red-400">⚠ {out.err}</p>}
        {R && A && <>
          <div className="grid sm:grid-cols-3 gap-2 text-sm">
            {([
              ['Panel aktif alan', `${round(A.activeWmm, 1)} × ${round(A.activeHmm, 1)} mm`],
              ['Toplam duvar (dış)', `${f(R.outerWmm)} × ${f(R.outerHmm)}`],
              ['Görünür görüntü alanı', `${f(R.visibleWmm)} × ${f(R.visibleHmm)}`],
              ['Dikiş (çerçeve boşluğu)', `${R.seamMm} mm`],
              ['Toplam çözünürlük', `${R.resX} × ${R.resY} px`],
              ['Çerçeve telafili kanvas', `${R.compensatedCanvasW} × ${R.compensatedCanvasH} px`],
              ['Toplam alan', `${round(R.areaM2, 3)} m²`],
              ['Oran', `${round(R.aspect, 4)}:1`],
              ['Panel adedi', `${R.count}`],
            ] as [string, string][]).map(([k, v]) => <div key={k} className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-xs text-slate-400">{k}</div>{v}</div>)}
          </div>
          <Wall cols={cols} rows={rows} aw={A.activeWmm} ah={A.activeHmm} b={bezel} g={gap} />
        </>}
      </div>
    </div>
  );
}

function Wall({ cols, rows, aw, ah, b, g }: { cols: number; rows: number; aw: number; ah: number; b: number; g: number }) {
  const pw = aw + 2 * b, ph = ah + 2 * b;
  const W = cols * pw + (cols - 1) * g, H = rows * ph + (rows - 1) * g;
  const cells = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * (pw + g), y = j * (ph + g);
    cells.push(<g key={`${i}-${j}`}><rect x={x} y={y} width={pw} height={ph} fill="#1e293b" stroke="#64748b" strokeWidth={W / 900} />
      <rect x={x + b} y={y + b} width={aw} height={ah} fill="#075985" /></g>);
  }
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[60vh] bg-slate-950 border border-slate-700 rounded">{cells}</svg>;
}
