import { useEffect, useMemo, useState } from 'react';
import { PRESET_ASPECTS, Aspect } from '../engine/aspect';
import { solveProjection, ProjectionResult } from '../engine/throw';
import { LensRecord, lensShiftLimits, lensThrowRange, lensesCoveringThrow } from '../engine/lenses';
import { LengthUnit, fromMeters, toMeters, round } from '../engine/units';
import { api, CompatLens, ProjectorRecord } from '../api';

type Mode = 'A' | 'B' | 'C' | 'D';

export default function ProjectorCalculator({ unit }: { unit: LengthUnit }) {
  const [mode, setMode] = useState<Mode>('A');
  const [ar, setAr] = useState('16:9');
  const [projectors, setProjectors] = useState<ProjectorRecord[]>([]);
  const [allLenses, setAllLenses] = useState<LensRecord[]>([]);
  const [compat, setCompat] = useState<CompatLens[]>([]);
  const [pid, setPid] = useState<number | ''>('');
  const [lid, setLid] = useState<number | ''>('');
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [trMin, setTrMin] = useState(1.2), [trMax, setTrMax] = useState(1.9);
  const [dist, setDist] = useState(6), [width, setWidth] = useState(4), [tr, setTr] = useState(1.5);
  const [vOff, setVOff] = useState(0), [protr, setProtr] = useState(0);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');

  const reload = () => Promise.all([api.projectors(), api.lenses()])
    .then(([p, l]) => { setProjectors(p); setAllLenses(l); setApiErr(null); })
    .catch(e => setApiErr((e as Error).message));
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    setLid(''); setCompat([]);
    if (pid !== '') api.compatLenses(pid).then(setCompat).catch(() => setCompat([]));
  }, [pid]);

  const lens = compat.find(l => l.id === lid) ?? null;
  const proj = projectors.find(p => p.id === pid) ?? null;
  const aspect: Aspect = PRESET_ASPECTS[ar];
  const range = lens ? lensThrowRange(lens) : { min: trMin, max: trMax };
  const shift = lens ? lensShiftLimits(lens) : {};

  const out = useMemo(() => {
    try {
      const D = toMeters(dist, unit), W = toMeters(width, unit);
      const base = { aspect, throwRange: range, lensFrontProtrusion: toMeters(protr, 'mm'), verticalOffset: toMeters(vOff, unit), vShift: shift.v, hShift: shift.h };
      let r: ProjectionResult;
      if (mode === 'A') r = solveProjection({ ...base, distance: D, throwRatio: tr });
      else if (mode === 'B') r = solveProjection({ ...base, imageWidth: W, throwRatio: tr });
      else if (mode === 'C') r = solveProjection({ ...base, imageWidth: W, distance: D });
      else r = solveProjection({ ...base, imageWidth: W, throwRatio: (range.min + range.max) / 2 });
      return { r, err: null as string | null };
    } catch (e) { return { r: null, err: (e as Error).message }; }
  }, [mode, aspect, range.min, range.max, dist, width, tr, vOff, protr, unit, lens]);

  const f = (m: number | undefined) => m === undefined ? '—' : `${round(fromMeters(m, unit), 3)} ${unit}`;
  const covering = out.r && mode === 'C' ? lensesCoveringThrow(out.r.throwRatio, allLenses) : [];
  const compatIds = new Set(compat.map(c => c.id));

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4 h-full">
      <div className="space-y-3 p-4 rounded border border-slate-700 bg-slate-900 overflow-auto">
        <h2 className="font-semibold">Projektör & Lens Hesaplayıcı</h2>
        {apiErr && <p className="text-amber-400 text-xs">Veritabanı API'sine ulaşılamadı; manuel giriş kullanılabilir. ({apiErr})</p>}
        <label className="block text-sm">Hesap modu
          <select className="inp" value={mode} onChange={e => setMode(e.target.value as Mode)}>
            <option value="A">A — Mesafe + throw → görüntü boyutu</option>
            <option value="B">B — Görüntü genişliği + throw → mesafe</option>
            <option value="C">C — Genişlik + mesafe → throw ve lensler</option>
            <option value="D">D — Projektör/lens seçimi → tüm parametreler</option>
          </select></label>
        <label className="block text-sm">Projektör
          <select className="inp" value={pid} onChange={e => setPid(e.target.value ? +e.target.value : '')}>
            <option value="">— manuel —</option>
            {projectors.map(p => <option key={p.id} value={p.id}>{p.manufacturer} {p.model}{p.verified ? '' : ' (doğrulanmamış)'}</option>)}
          </select></label>
        {pid !== '' && (
          <label className="block text-sm">Lens (yalnızca kayıtlı uyumlu lensler)
            <select className="inp" value={lid} onChange={e => setLid(e.target.value ? +e.target.value : '')}>
              <option value="">— lens seçin —</option>
              {compat.map(l => <option key={l.id} value={l.id}>{l.manufacturer} {l.model}</option>)}
            </select>
            {compat.length === 0 && <span className="text-xs text-amber-400">Bu projektör için uyumluluk kaydı yok.</span>}
          </label>)}
        {lens?.warnings.map(w => <p key={w} className="text-xs text-amber-400">⚠ {w}</p>)}
        <label className="block text-sm">En-boy oranı
          <select className="inp" value={ar} onChange={e => setAr(e.target.value)}>
            {Object.keys(PRESET_ASPECTS).map(k => <option key={k}>{k}</option>)}</select></label>
        {!lens && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label title="Lens minimum throw ratio (en geniş)">TR min<input className="inp" type="number" step="0.01" value={trMin} onChange={e => setTrMin(+e.target.value)} /></label>
            <label title="Lens maksimum throw ratio (en tele)">TR max<input className="inp" type="number" step="0.01" value={trMax} onChange={e => setTrMax(+e.target.value)} /></label>
          </div>)}
        {(mode === 'A' || mode === 'C') && <Num label={`Lens–yüzey mesafesi (${unit})`} v={dist} set={setDist} />}
        {(mode === 'B' || mode === 'C' || mode === 'D') && <Num label={`Görüntü genişliği (${unit})`} v={width} set={setWidth} />}
        {(mode === 'A' || mode === 'B') && <Num label="Throw ratio" v={tr} set={setTr} />}
        <Num label={`Dikey görüntü ofseti (${unit}, optik eksene göre)`} v={vOff} set={setVOff} />
        <Num label="Lens ön yüzü şasi önünden çıkıntı (mm)" v={protr} set={setProtr} />
        {proj?.depth_mm && <p className="text-xs text-slate-400">Şasi derinliği: {proj.depth_mm} mm (şasi arka yüzü = ön yüz + derinlik)</p>}
        <details className="text-xs"><summary className="cursor-pointer">Veritabanına JSON içe aktar</summary>
          <textarea className="inp h-24 font-mono" value={importText} onChange={e => setImportText(e.target.value)} placeholder='{"projectors":[...],"lenses":[...]}' />
          <button className="mt-1 px-2 py-1 bg-sky-700 rounded" onClick={async () => {
            try { const r = await api.importDb(JSON.parse(importText)); setMsg(`Eklendi: ${r.projectors} projektör, ${r.lenses} lens, ${r.skipped} atlandı`); reload(); }
            catch (e) { setMsg((e as Error).message); }
          }}>İçe aktar</button> <span>{msg}</span></details>
      </div>

      <div className="space-y-3 min-w-0">
        {out.err && <p className="text-red-400 text-sm">⚠ {out.err}</p>}
        {out.r && (<>
          <div className={`p-2 rounded text-sm ${out.r.achievable ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>
            {out.r.achievable ? '✔ Yapılandırma fiziksel olarak ulaşılabilir (ideal model)' : '✘ Yapılandırma ulaşılamaz'}
            {out.r.warnings.map(w => <div key={w}>⚠ {w}</div>)}
          </div>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <Card k="Görüntü genişliği × yüksekliği" v={`${f(out.r.imageWidth)} × ${f(out.r.imageHeight)}`} />
            <Card k="Diagonal" v={`${f(out.r.diagonal)} (${round(fromMeters(out.r.diagonal, 'in'), 1)} in)`} />
            <Card k="Throw ratio" v={round(out.r.throwRatio, 4).toString()} />
            <Card k="Lens → yüzey" v={f(out.r.lensToSurface)} />
            <Card k="Şasi ön yüzü → yüzey" v={f(out.r.chassisFrontToSurface)} />
            <Card k="Min–max mesafe (bu genişlik)" v={`${f(out.r.distanceMin)} – ${f(out.r.distanceMax)}`} />
            <Card k="Zoom konumu" v={out.r.zoomPosition === undefined ? 'sabit/—' : `${round(out.r.zoomPosition * 100, 1)} % (0 = geniş)`} />
            <Card k="Görüntü sınırları (eksene göre)" v={`L ${f(out.r.bounds.left)} · R ${f(out.r.bounds.right)} · Ü ${f(out.r.bounds.top)} · A ${f(out.r.bounds.bottom)}`} />
          </div>
          <SideDiagram r={out.r} unit={unit} />
          {mode === 'C' && (
            <div className="text-sm p-3 rounded border border-slate-700">
              <b>Gereken TR = {round(out.r.throwRatio, 3)} — optik aralığı kapsayan lensler:</b>
              {covering.length === 0 && <div className="text-slate-400">Veritabanında kapsayan lens yok.</div>}
              {covering.map(l => (
                <div key={l.id}>{l.manufacturer} {l.model} ({l.throw_min}–{l.throw_max}) —
                  {pid !== '' ? (compatIds.has(l.id) ? <span className="text-emerald-400"> seçili projektörle uyumlu kayıtlı</span> : <span className="text-red-400"> seçili projektörle uyumluluk kaydı YOK</span>)
                    : <span className="text-amber-400"> projektör seçilmedi; uyumluluk doğrulanmadı</span>}</div>))}
            </div>)}
          <p className="text-xs text-slate-500">Yaklaşım: {out.r.approximations.join(' ')} Teorik sonuçtur; üretici doğrulaması için datasheet'e bakın.</p>
        </>)}
      </div>
    </div>
  );
}

const Num = ({ label, v, set }: { label: string; v: number; set: (n: number) => void }) => (
  <label className="block text-sm">{label}
    <input className="inp" type="number" step="any" value={v} onChange={e => set(+e.target.value)} /></label>);
const Card = ({ k, v }: { k: string; v: string }) => (
  <div className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-xs text-slate-400">{k}</div><div>{v}</div></div>);

/** Yan görünüş: projektör lensi → yüzey, görüntü yüksekliği, optik eksen. */
function SideDiagram({ r, unit }: { r: ProjectionResult; unit: LengthUnit }) {
  const vw = 800, vh = 360, pad = 50;
  const spanY = Math.max(r.bounds.top, 0.2) - Math.min(r.bounds.bottom, -0.2);
  const s = Math.min((vw - 2 * pad - 80) / r.lensToSurface, (vh - 2 * pad) / spanY);
  const x0 = pad, xs = x0 + r.lensToSurface * s;
  const yAxis = pad + (Math.max(r.bounds.top, 0.2)) * s;
  const yT = yAxis - r.bounds.top * s, yB = yAxis - r.bounds.bottom * s;
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className="w-full bg-slate-950 rounded border border-slate-700">
      <polygon points={`${x0},${yAxis} ${xs},${yT} ${xs},${yB}`} fill="#38bdf8" opacity=".15" stroke="#38bdf8" />
      <line x1={x0} y1={yAxis} x2={xs} y2={yAxis} stroke="#f59e0b" strokeDasharray="6 4" />
      <rect x={x0 - 40} y={yAxis - 18} width="40" height="36" fill="#475569" />
      <circle cx={x0} cy={yAxis} r="5" fill="#f59e0b" />
      <line x1={xs} y1={yT} x2={xs} y2={yB} stroke="#e2e8f0" strokeWidth="4" />
      <text x={(x0 + xs) / 2} y={yAxis - 6} fill="#f59e0b" fontSize="13" textAnchor="middle">optik eksen · D = {round(fromMeters(r.lensToSurface, unit), 3)} {unit}</text>
      <text x={xs + 8} y={(yT + yB) / 2} fill="#cbd5e1" fontSize="13">H = {round(fromMeters(r.imageHeight, unit), 3)} {unit}</text>
      <text x={x0 - 40} y={yAxis + 34} fill="#94a3b8" fontSize="11">projektör</text>
    </svg>);
}
