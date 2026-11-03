import { useEffect, useMemo, useState } from 'react';
import { cabinetGrid, cabinetsForSize, curvedLayout, ledFromCabinets, resolutionFromSize, sizeFromResolution, Cabinet, Rounding } from '../engine/led';
import { equipmentApi, EquipmentRecord } from '../api';
import { LengthUnit, fromMeters, round } from '../engine/units';

type Mode = 'A' | 'B' | 'C' | 'D';
const n = (v: unknown) => (typeof v === 'number' ? v : undefined);

export default function LedCalculator({ unit }: { unit: LengthUnit }) {
  const [mode, setMode] = useState<Mode>('D');
  const [pitch, setPitch] = useState(2.5);
  const [cw, setCw] = useState(500), [ch, setCh] = useState(500);
  const [crx, setCrx] = useState<number | undefined>(), [cry, setCry] = useState<number | undefined>();
  const [wt, setWt] = useState(8), [ptyp, setPtyp] = useState(100), [pmax, setPmax] = useState(250);
  const [cols, setCols] = useState(4), [rows, setRows] = useState(3);
  const [tw, setTw] = useState(4800), [th, setTh] = useState(2700);
  const [trx, setTrx] = useState(1920), [try_, setTry] = useState(1080);
  const [round_, setRound] = useState<Rounding>('ceil');
  const [spare, setSpare] = useState(5), [volt, setVolt] = useState(230), [pf, setPf] = useState(1);
  const [curved, setCurved] = useState(false), [radius, setRadius] = useState(5000);
  const [lib, setLib] = useState<EquipmentRecord[]>([]);
  const [libId, setLibId] = useState('');

  useEffect(() => { equipmentApi.list('led_cabinet').then(setLib).catch(() => setLib([])); }, []);
  const loadCab = (id: string) => {
    setLibId(id);
    const e = lib.find(x => String(x.id) === id); if (!e) return;
    const s = e.specs;
    setPitch(n(s.pitch_mm) ?? pitch); setCw(n(s.width_mm) ?? cw); setCh(n(s.height_mm) ?? ch);
    setCrx(n(s.res_w)); setCry(n(s.res_h)); setWt(n(s.weight_kg) ?? wt);
    setPtyp(n(s.power_typ_w) ?? ptyp); setPmax(n(s.power_max_w) ?? pmax);
  };

  const cab: Cabinet = { pitchMm: pitch, widthMm: cw, heightMm: ch, resX: crx, resY: cry, weightKg: wt, powerTypW: ptyp, powerMaxW: pmax };

  const calc = useMemo(() => {
    try {
      let c = cols, r = rows, note = '';
      if (mode === 'A') {
        const a = resolutionFromSize(pitch, tw, th);
        note = `Girilen ${tw}×${th} mm → ${a.resX}×${a.resY} px (tam: ${a.exactX.toFixed(2)}×${a.exactY.toFixed(2)}); yuvarlama farkı ${a.widthErrorMm.toFixed(2)} / ${a.heightErrorMm.toFixed(2)} mm (tolerans ±${a.toleranceMm} mm).`;
        const q = cabinetsForSize(cab, tw, th, round_); c = q.cols; r = q.rows;
      } else if (mode === 'B') {
        const s = sizeFromResolution(pitch, trx, try_);
        note = `${trx}×${try_} px × ${pitch} mm = ${s.widthMm}×${s.heightMm} mm.`;
        const q = cabinetsForSize(cab, s.widthMm, s.heightMm, round_); c = q.cols; r = q.rows;
        if (q.widthErrorMm || q.heightErrorMm) note += ` Kabin ızgarası ${round(q.widthErrorMm, 2)} / ${round(q.heightErrorMm, 2)} mm sapma gösterir.`;
      } else if (mode === 'C') {
        const q = cabinetsForSize(cab, tw, th, round_); c = q.cols; r = q.rows;
        note = `Hedefe göre sapma: ${round(q.widthErrorMm, 2)} × ${round(q.heightErrorMm, 2)} mm.`;
      }
      const res = ledFromCabinets(cab, c, r, spare / 100, { voltage: volt, powerFactor: pf });
      const curve = curved ? curvedLayout(cw, c, radius) : null;
      return { res, note, curve, err: null as string | null };
    } catch (e) { return { res: null, note: '', curve: null, err: (e as Error).message }; }
  }, [mode, pitch, cw, ch, crx, cry, wt, ptyp, pmax, cols, rows, tw, th, trx, try_, round_, spare, volt, pf, curved, radius]);

  const R = calc.res;
  const f = (mm: number) => `${round(fromMeters(mm / 1000, unit), 3)} ${unit}`;
  const N = (l: string, v: number | undefined, s: (x: number) => void, step: number | string = 'any') => (
    <label className="block text-xs">{l}<input className="inp" type="number" step={step} value={v ?? ''} onChange={e => s(+e.target.value)} /></label>);

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4 h-full">
      <div className="space-y-2 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto text-sm">
        <h2 className="font-semibold">LED Duvar Hesaplayıcı</h2>
        <select className="inp" value={mode} onChange={e => setMode(e.target.value as Mode)}>
          <option value="A">A — Fiziksel boyut + pitch → çözünürlük</option>
          <option value="B">B — Hedef çözünürlük + pitch → boyut</option>
          <option value="C">C — Ekran boyutu → kabin adedi</option>
          <option value="D">D — Kabin adedi → ekran boyutu</option>
        </select>
        <label className="block text-xs">Katalogdan kabin
          <select className="inp" value={libId} onChange={e => loadCab(e.target.value)}>
            <option value="">— manuel —</option>{lib.map(l => <option key={l.id} value={l.id}>{l.manufacturer} {l.model}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2">
          {N('Pitch (mm)', pitch, setPitch)}{N('Kabin W (mm)', cw, setCw)}{N('Kabin H (mm)', ch, setCh)}
          {N('Kabin çöz. X (ops.)', crx, x => setCrx(x || undefined), 1)}{N('Kabin çöz. Y (ops.)', cry, x => setCry(x || undefined), 1)}
          {N('Ağırlık (kg)', wt, setWt)}{N('Tipik güç (W)', ptyp, setPtyp)}{N('Maks güç (W)', pmax, setPmax)}
        </div>
        {mode === 'D' && <div className="grid grid-cols-2 gap-2">{N('Sütun', cols, x => setCols(Math.round(x)), 1)}{N('Satır', rows, x => setRows(Math.round(x)), 1)}</div>}
        {(mode === 'A' || mode === 'C') && <div className="grid grid-cols-2 gap-2">{N('Hedef genişlik (mm)', tw, setTw)}{N('Hedef yükseklik (mm)', th, setTh)}</div>}
        {mode === 'B' && <div className="grid grid-cols-2 gap-2">{N('Hedef çöz. X', trx, setTrx, 1)}{N('Hedef çöz. Y', try_, setTry, 1)}</div>}
        {mode !== 'D' && <label className="block text-xs">Kabin yuvarlama
          <select className="inp" value={round_} onChange={e => setRound(e.target.value as Rounding)}>
            <option value="ceil">Yukarı (hedefi kapsa)</option><option value="floor">Aşağı (hedefe sığ)</option><option value="nearest">En yakın</option></select></label>}
        <div className="grid grid-cols-3 gap-2">{N('Yedek %', spare, setSpare)}{N('Gerilim (V)', volt, setVolt)}{N('Güç faktörü', pf, setPf)}</div>
        <label className="block"><input type="checkbox" checked={curved} onChange={e => setCurved(e.target.checked)} /> Kavisli duvar (plan görünüşü)</label>
        {curved && N('Yarıçap (mm)', radius, setRadius)}
      </div>

      <div className="space-y-3 min-w-0">
        {calc.err && <p className="text-red-400">⚠ {calc.err}</p>}
        {R && <>
          {calc.note && <p className="text-xs text-sky-300">{calc.note}</p>}
          {R.warnings.map(w => <p key={w} className="text-xs text-amber-400">⚠ {w}</p>)}
          <div className="grid sm:grid-cols-3 gap-2 text-sm">
            {([
              ['Fiziksel boyut', `${f(R.widthMm)} × ${f(R.heightMm)}`],
              ['Diagonal', `${f(R.diagonalMm)} (${round(R.diagonalMm / 25.4, 1)} in)`],
              ['Oran', `${round(R.aspect, 4)}:1`],
              ['Alan', `${round(R.areaM2, 3)} m²`],
              ['Çözünürlük', `${R.resX} × ${R.resY} px`],
              ['Toplam piksel', R.totalPixels.toLocaleString('tr-TR')],
              ['Kabin', `${R.qty} (${R.cols}×${R.rows}) · ${R.cabResX}×${R.cabResY} px`],
              ['Yedek kabin', `${R.spareQty}`],
              ['Ağırlık', `${round(R.weightKg ?? 0, 1)} kg`],
              ['Güç (tipik / maks)', `${R.powerTypW} / ${R.powerMaxW} W`],
              ['Akım (tipik / maks)', `${round(R.currentTypA ?? 0, 1)} / ${round(R.currentMaxA ?? 0, 1)} A`],
              ['Min. bakış mesafesi (yaklaşık)', `≈ ${R.minViewingDistanceM} m`],
            ] as [string, string][]).map(([k, v]) => <div key={k} className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-xs text-slate-400">{k}</div>{v}</div>)}
          </div>
          <CabinetView cab={cab} cols={R.cols} rows={R.rows} />
          {calc.curve && <CurvedView curve={calc.curve} cabW={cw} />}
          <p className="text-xs text-slate-500">{R.approximations.join(' ')}</p>
        </>}
      </div>
    </div>
  );
}

function CabinetView({ cab, cols, rows }: { cab: Cabinet; cols: number; rows: number }) {
  const cells = cabinetGrid(cab, cols, rows);
  const W = cols * cab.widthMm, H = rows * cab.heightMm, pad = 40;
  const fs = Math.max(W, H) / 45;
  return (
    <svg viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`} className="w-full max-h-[50vh] bg-slate-950 border border-slate-700 rounded">
      {cells.map(c => (
        <g key={`${c.col}-${c.row}`}>
          <rect x={c.xMm} y={c.yMm} width={c.wMm} height={c.hMm} fill={(c.col + c.row) % 2 ? '#0c4a6e' : '#075985'} stroke="#38bdf8" strokeWidth={fs / 15} />
          {cells.length <= 100 && <text x={c.xMm + c.wMm / 2} y={c.yMm + c.hMm / 2} fill="#e2e8f0" fontSize={fs} textAnchor="middle">{c.col + 1},{c.row + 1}</text>}
        </g>))}
      <text x={W / 2} y={-pad / 3} fill="#cbd5e1" fontSize={fs} textAnchor="middle">{W} mm</text>
      <text x={W + pad / 2} y={H / 2} fill="#cbd5e1" fontSize={fs} textAnchor="middle" transform={`rotate(90 ${W + pad / 2} ${H / 2})`}>{H} mm</text>
    </svg>);
}

function CurvedView({ curve, cabW }: { curve: ReturnType<typeof curvedLayout>; cabW: number }) {
  const xs = curve.cells.map(c => c.cx), zs = curve.cells.map(c => c.cz);
  const minX = Math.min(...xs) - cabW, maxX = Math.max(...xs) + cabW, minZ = Math.min(...zs) - cabW, maxZ = Math.max(...zs) + cabW;
  const span = Math.max(maxX - minX, maxZ - minZ);
  return (
    <div>
      <svg viewBox={`${minX} ${-maxZ} ${maxX - minX} ${maxZ - minZ}`} className="w-full max-h-[40vh] bg-slate-950 border border-slate-700 rounded">
        {curve.cells.map(c => (
          <rect key={c.col} x={c.cx - cabW / 2} y={-c.cz - span / 150} width={cabW} height={span / 75} fill="#38bdf8"
            transform={`rotate(${-c.angleDeg} ${c.cx} ${-c.cz})`} />))}
      </svg>
      <p className="text-xs text-slate-400">Plan görünüşü · eklem açısı {round(curve.jointAngleDeg, 3)}° · toplam {round(curve.totalAngleDeg, 2)}° · kiriş {round(curve.chordMm, 1)} mm · yay boyu {round(curve.arcLengthMm, 1)} mm · sagitta {round(curve.sagittaMm, 1)} mm. Dairesel yay ve düz kabin varsayımı.</p>
    </div>);
}
