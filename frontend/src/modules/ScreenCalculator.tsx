import { useMemo, useState } from 'react';
import { PRESET_ASPECTS, Aspect, diagonal, heightFromWidth, heightFromDiagonal, widthFromDiagonal, widthFromHeight } from '../engine/aspect';
import { LengthUnit, fromMeters, toMeters, round } from '../engine/units';

type Mode = 'w2h' | 'h2w' | 'd2wh' | 'wh2d';
const UNITS: LengthUnit[] = ['m', 'cm', 'mm', 'in', 'ft'];

export default function ScreenCalculator({ unit }: { unit: LengthUnit }) {
  const [mode, setMode] = useState<Mode>('w2h');
  const [ar, setAr] = useState('16:9');
  const [cw, setCw] = useState(16);
  const [ch, setCh] = useState(9);
  const [a, setA] = useState(4);
  const [b, setB] = useState(2.25);
  const [inUnit, setInUnit] = useState<LengthUnit>(unit);

  const aspect: Aspect = ar === 'custom' ? { w: cw, h: ch } : PRESET_ASPECTS[ar];

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

  const f = (m: number) => round(fromMeters(m, unit), 4);
  const labelA = { w2h: 'Genişlik', h2w: 'Yükseklik', d2wh: 'Diagonal', wh2d: 'Genişlik' }[mode];

  return (
    <div className="grid md:grid-cols-[320px_1fr] gap-4 h-full">
      <div className="space-y-3 p-4 rounded border border-slate-700 bg-slate-900">
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
          <table className="text-sm w-full"><tbody>
            <tr><td>Genişlik</td><td className="text-right">{f(res.w)} {unit}</td></tr>
            <tr><td>Yükseklik</td><td className="text-right">{f(res.h)} {unit}</td></tr>
            <tr><td>Diagonal</td><td className="text-right">{f(res.d)} {unit}</td></tr>
            <tr><td>Diagonal (inç)</td><td className="text-right">{round(fromMeters(res.d, 'in'), 2)} in</td></tr>
            <tr><td>Oran</td><td className="text-right">{round(res.w / res.h, 4)}:1</td></tr>
          </tbody></table>)}
      </div>
      <div className="p-4 rounded border border-slate-700 bg-slate-950 flex items-center justify-center">
        {!res.err && <ScreenPreview w={res.w} h={res.h} unit={unit} />}
      </div>
    </div>
  );
}

function ScreenPreview({ w, h, unit }: { w: number; h: number; unit: LengthUnit }) {
  const pad = 60, vw = 800, vh = 500;
  const s = Math.min((vw - 2 * pad) / w, (vh - 2 * pad) / h);
  const pw = w * s, ph = h * s, x = (vw - pw) / 2, y = (vh - ph) / 2;
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className="w-full max-h-full">
      <rect x={x} y={y} width={pw} height={ph} fill="#0b3a5b" stroke="#38bdf8" strokeWidth="2" />
      <line x1={x} y1={y} x2={x + pw} y2={y + ph} stroke="#38bdf8" strokeDasharray="6 4" opacity=".5" />
      <text x={vw / 2} y={y - 14} textAnchor="middle" fill="#cbd5e1" fontSize="16">{round(fromMeters(w, unit), 3)} {unit}</text>
      <text x={x - 14} y={vh / 2} textAnchor="middle" fill="#cbd5e1" fontSize="16" transform={`rotate(-90 ${x - 14} ${vh / 2})`}>{round(fromMeters(h, unit), 3)} {unit}</text>
    </svg>
  );
}
