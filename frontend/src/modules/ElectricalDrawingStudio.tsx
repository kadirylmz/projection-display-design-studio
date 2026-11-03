import { useMemo, useState } from 'react';
import { analyze, Circuit, Load } from '../engine/electrical';
import { toDxf, toSvg } from '../engine/drawing';
import { electricalSingleLine, ledElevation, mappingDrawing, roomPlan } from '../engine/drawings';
import { computeLayout } from '../engine/multiproj';
import { useProjectStore } from '../projectStore';
import { useMapping } from '../mappingStore';
import { useRoom } from '../roomStore';
import { round } from '../engine/units';
import { download, svgToPng } from '../util';

type Sheet = 'electrical' | 'room' | 'led' | 'mapping';

export default function ElectricalDrawingStudio() {
  const { electrical, setElectrical, ledSnap } = useProjectStore();
  const { slots } = useMapping();
  const { room, projectors, surfaces, obstacles } = useRoom();
  const [sheet, setSheet] = useState<Sheet>('electrical');

  const { loads, circuits, supply } = electrical;

  const elRes = useMemo(() => {
    try { return { r: analyze(loads, circuits, supply), err: null as string | null }; }
    catch (e) { return { r: null, err: (e as Error).message }; }
  }, [loads, circuits, supply]);

  const activeDrawing = useMemo(() => {
    try {
      if (sheet === 'electrical' && elRes.r) return electricalSingleLine(loads, circuits, supply, elRes.r);
      if (sheet === 'room') return roomPlan(room, projectors, surfaces, obstacles);
      if (sheet === 'led') return ledElevation(ledSnap.cabinet, ledSnap.cols, ledSnap.rows);
      if (sheet === 'mapping') return mappingDrawing(computeLayout(slots));
      return null;
    } catch { return null; }
  }, [sheet, elRes.r, loads, circuits, supply, room, projectors, surfaces, obstacles, ledSnap, slots]);

  const svg = useMemo(() => activeDrawing ? toSvg(activeDrawing, { background: '#0b1220' }) : '', [activeDrawing]);

  const addLoad = () => {
    const id = `L${Date.now().toString(36).slice(-3).toUpperCase()}`;
    setElectrical({ loads: [...loads, { id, name: `Yük ${loads.length + 1}`, qty: 1, powerW: 500, pf: 0.95 }] });
  };
  const updLoad = (id: string, p: Partial<Load>) => setElectrical({ loads: loads.map(l => l.id === id ? { ...l, ...p } : l) });
  const delLoad = (id: string) => setElectrical({
    loads: loads.filter(l => l.id !== id),
    circuits: circuits.map(c => ({ ...c, loadIds: c.loadIds.filter(x => x !== id) })),
  });

  const addCircuit = () => {
    const id = `C${Date.now().toString(36).slice(-3).toUpperCase()}`;
    setElectrical({ circuits: [...circuits, { id, name: `Linye-${circuits.length + 1}`, loadIds: [], phase: 'L1', cableMm2: 2.5, lengthM: 20, ampacityA: 25 }] });
  };
  const updCircuit = (id: string, p: Partial<Circuit>) => setElectrical({ circuits: circuits.map(c => c.id === id ? { ...c, ...p } : c) });
  const delCircuit = (id: string) => setElectrical({ circuits: circuits.filter(c => c.id !== id) });

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-4 h-full">
      <div className="space-y-3 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto text-xs" style={{ maxHeight: '88vh' }}>
        <h2 className="text-sm font-semibold text-sky-300">CAD (DXF/DWG) Çizim & Elektrik Şeması</h2>
        <div className="p-2 rounded bg-slate-800/70 text-slate-300">
          <b>CAD Notu:</b> Çizimler açık standart <b>AutoCAD R12 DXF (AC1009)</b> biçiminde indirilir. AutoCAD, ZWCAD, BricsCAD ve DraftSight ile doğrudan açılıp <i>Farklı Kaydet → DWG</i> yapılabilir.
        </div>

        <div className="space-y-1 border-t border-slate-700 pt-2">
          <b className="text-slate-200">Besleme & Hesap Parametreleri</b>
          <div className="grid grid-cols-3 gap-2">
            <label>Gerilim (V)<input className="inp" type="number" value={supply.voltage} onChange={e => setElectrical({ supply: { ...supply, voltage: +e.target.value || 230 } })} /></label>
            <label>Faz<select className="inp" value={supply.phases} onChange={e => setElectrical({ supply: { ...supply, phases: (+e.target.value as 1 | 3) } })}><option value={1}>1 Faz</option><option value={3}>3 Faz</option></select></label>
            <label>Eşzamanlılık<input className="inp" type="number" step="0.05" min="0.1" max="1" value={supply.diversity} onChange={e => setElectrical({ supply: { ...supply, diversity: +e.target.value || 1 } })} /></label>
            <label>Sigorta marjı<input className="inp" type="number" step="0.05" value={supply.designMargin} onChange={e => setElectrical({ supply: { ...supply, designMargin: +e.target.value } })} /></label>
            <label>Maks. ΔU (%)<input className="inp" type="number" step="0.5" value={supply.maxDropPct} onChange={e => setElectrical({ supply: { ...supply, maxDropPct: +e.target.value } })} /></label>
            <label>ρ (Ω·mm²/m)<input className="inp" type="number" step="0.0005" value={supply.rho} onChange={e => setElectrical({ supply: { ...supply, rho: +e.target.value || 0.0225 } })} /></label>
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-700 pt-2">
          <div className="flex justify-between items-center"><b className="text-slate-200">Elektrik Yükleri</b><button className="px-2 py-0.5 bg-sky-700 rounded" onClick={addLoad}>+ Yük Ekle</button></div>
          {loads.map(l => (
            <div key={l.id} className="grid grid-cols-[1fr_52px_68px_52px_24px] gap-1 items-center">
              <input className="inp !mt-0" value={l.name} onChange={e => updLoad(l.id, { name: e.target.value })} title="Yük adı" />
              <input className="inp !mt-0" type="number" min="1" value={l.qty} onChange={e => updLoad(l.id, { qty: Math.max(1, Math.round(+e.target.value)) })} title="Adet" />
              <input className="inp !mt-0" type="number" min="1" value={l.powerW} onChange={e => updLoad(l.id, { powerW: Math.max(1, +e.target.value) })} title="Birim güç (W)" />
              <input className="inp !mt-0" type="number" step="0.05" min="0.1" max="1" value={l.pf ?? 1} onChange={e => updLoad(l.id, { pf: +e.target.value })} title="cos φ (PF)" />
              <button className="text-red-400" onClick={() => delLoad(l.id)}>✕</button>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-slate-700 pt-2">
          <div className="flex justify-between items-center"><b className="text-slate-200">Linyeler / Devreler</b><button className="px-2 py-0.5 bg-sky-700 rounded" onClick={addCircuit}>+ Devre Ekle</button></div>
          {circuits.map(c => (
            <div key={c.id} className="p-2 rounded border border-slate-700 bg-slate-950 space-y-1">
              <div className="grid grid-cols-[1fr_64px_24px] gap-1 items-center">
                <input className="inp !mt-0" value={c.name} onChange={e => updCircuit(c.id, { name: e.target.value })} />
                <select className="inp !mt-0" value={c.phase} onChange={e => updCircuit(c.id, { phase: e.target.value as Circuit['phase'] })}>
                  <option value="L1">L1</option><option value="L2">L2</option><option value="L3">L3</option><option value="3P">3P</option>
                </select>
                <button className="text-red-400" onClick={() => delCircuit(c.id)}>✕</button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <label>Kesit (mm²)<input className="inp !mt-0" type="number" step="0.5" value={c.cableMm2 ?? ''} onChange={e => updCircuit(c.id, { cableMm2: +e.target.value || undefined })} /></label>
                <label>Mesafe (m)<input className="inp !mt-0" type="number" value={c.lengthM ?? ''} onChange={e => updCircuit(c.id, { lengthM: +e.target.value || undefined })} /></label>
                <label>Kablo Iz (A)<input className="inp !mt-0" type="number" value={c.ampacityA ?? ''} onChange={e => updCircuit(c.id, { ampacityA: +e.target.value || undefined })} /></label>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {loads.map(l => {
                  const checked = c.loadIds.includes(l.id);
                  return (
                    <label key={l.id} className="flex items-center gap-1">
                      <input type="checkbox" checked={checked} onChange={e => updCircuit(c.id, { loadIds: e.target.checked ? [...c.loadIds, l.id] : c.loadIds.filter(x => x !== l.id) })} />
                      <span>{l.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 min-w-0">
        {elRes.err && <p className="text-red-400 text-sm">⚠ {elRes.err}</p>}
        {elRes.r && (
          <div className="grid sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-slate-400">Toplam / Talep Gücü</div><b>{Math.round(elRes.r.totalW)} W / {Math.round(elRes.r.demandW)} W</b></div>
            <div className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-slate-400">Toplam Akım (Ib)</div><b>{round(elRes.r.totalIbA, 2)} A</b></div>
            <div className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-slate-400">Ana Kesici (IEC 60898)</div><b>{elRes.r.mainBreakerA ? `${elRes.r.mainBreakerA} A` : 'Bölünmeli (>125 A)'}</b></div>
            <div className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-slate-400">Faz Dağılımı (L1/L2/L3)</div><b>{Math.round(elRes.r.phaseLoadsW.L1)}/{Math.round(elRes.r.phaseLoadsW.L2)}/{Math.round(elRes.r.phaseLoadsW.L3)} W</b></div>
          </div>
        )}

        {elRes.r && (
          <table className="w-full text-xs border border-slate-700">
            <thead className="text-slate-400 bg-slate-900"><tr><th className="text-left p-1">Devre</th><th>Faz</th><th>Güç (W)</th><th>Akım Ib (A)</th><th>Sigorta In (A)</th><th>ΔU</th><th className="text-left">Uyarılar</th></tr></thead>
            <tbody>
              {elRes.r.circuits.map(cr => (
                <tr key={cr.circuit.id} className="border-t border-slate-800 text-center">
                  <td className="text-left p-1">{cr.circuit.name}</td>
                  <td>{cr.circuit.phase}</td>
                  <td>{Math.round(cr.powerW)}</td>
                  <td>{round(cr.ibA, 2)}</td>
                  <td>{cr.breakerA ?? '—'}</td>
                  <td>{cr.dropPct !== undefined ? `%${round(cr.dropPct, 2)} (${round(cr.dropV!, 2)} V)` : '—'}</td>
                  <td className="text-left text-amber-400">{cr.warnings.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {elRes.r?.warnings.map(w => <div key={w} className="text-xs text-amber-400">⚠ {w}</div>)}

        <div className="flex flex-wrap gap-2 items-center text-xs">
          <b>Çizim Paftası:</b>
          {([
            ['electrical', 'Elektrik Tek Hat Şeması'],
            ['room', 'Oda & Projeksiyon Planı (Üst)'],
            ['led', 'LED Duvar Ön Görünüş'],
            ['mapping', 'Piksel Haritalama Paftası'],
          ] as [Sheet, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setSheet(k)} className={`px-3 py-1 rounded ${sheet === k ? 'bg-sky-700 text-white' : 'bg-slate-800'}`}>{label}</button>
          ))}
          {activeDrawing && (
            <>
              <button className="ml-auto px-3 py-1 bg-emerald-700 rounded font-semibold" onClick={() => download(`${sheet}-cizim.dxf`, toDxf(activeDrawing), 'application/dxf')}>
                CAD İndir (.DXF / AutoCAD)
              </button>
              <button className="px-3 py-1 bg-slate-700 rounded" onClick={() => download(`${sheet}-cizim.svg`, svg, 'image/svg+xml')}>SVG İndir</button>
              <button className="px-3 py-1 bg-slate-700 rounded" onClick={async () => download(`${sheet}-cizim.png`, await svgToPng(toSvg(activeDrawing, { pixelWidth: 2400 }), 2400))}>PNG İndir</button>
            </>
          )}
        </div>

        {svg && <div className="border border-slate-700 rounded bg-slate-950 p-2 max-h-[52vh] overflow-auto" dangerouslySetInnerHTML={{ __html: svg }} />}
        {elRes.r && <p className="text-[11px] text-slate-500">{elRes.r.assumptions.join(' ')}</p>}
      </div>
    </div>
  );
}
