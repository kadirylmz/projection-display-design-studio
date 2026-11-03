import { useMemo } from 'react';
import { computeLayout, gridLayout, pctToPx } from '../engine/multiproj';
import { layoutToSvg, toConfig } from '../engine/exporters';
import { useMapping } from '../mappingStore';
import { download, renderTestPattern, svgToPng } from '../util';
import { useState } from 'react';

export default function MultiProjectorDesigner() {
  const { slots, setSlots, setContent, gamma, content } = useMapping();
  const [cols, setCols] = useState(2), [rows, setRows] = useState(1);
  const [w, setW] = useState(1920), [h, setH] = useState(1200);
  const [pctX, setPctX] = useState(10), [pctY, setPctY] = useState(10);
  const [outs, setOuts] = useState('');

  const built = useMemo(() => {
    try {
      const ox = cols > 1 ? pctToPx(pctX, w) : 0, oy = rows > 1 ? pctToPx(pctY, h) : 0;
      const outputs = outs.split(',').map(s => s.trim()).filter(Boolean);
      const s = gridLayout({ cols, rows, w, h, overlapX: ox, overlapY: oy, outputs });
      return { ox, oy, L: computeLayout(s), s, err: null as string | null };
    } catch (e) { return { ox: 0, oy: 0, L: null, s: null, err: (e as Error).message }; }
  }, [cols, rows, w, h, pctX, pctY, outs]);

  const L = built.L;
  const svg = L ? layoutToSvg(L, { gridStep: 0 }) : '';
  const apply = () => { if (built.s && L) { setSlots(built.s); setContent({ w: L.canvasW, h: L.canvasH }); } };
  const N = (l: string, v: number, s: (n: number) => void, min = 1) => (
    <label className="block text-sm">{l}<input className="inp" type="number" min={min} value={v} onChange={e => s(Math.round(+e.target.value))} /></label>);

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4 h-full">
      <div className="space-y-2 p-4 rounded border border-slate-700 bg-slate-900 overflow-auto">
        <h2 className="font-semibold">Çoklu Projektör Tasarımcısı</h2>
        <div className="grid grid-cols-2 gap-2">{N('Sütun', cols, setCols)}{N('Satır', rows, setRows)}{N('Çıkış genişliği (px)', w, setW)}{N('Çıkış yüksekliği (px)', h, setH)}</div>
        <label className="block text-sm">Yatay örtüşme: %{pctX} → {built.ox} px
          <input type="range" min="0" max="50" value={pctX} onChange={e => setPctX(+e.target.value)} className="w-full" disabled={cols < 2} /></label>
        <label className="block text-sm">Dikey örtüşme: %{pctY} → {built.oy} px
          <input type="range" min="0" max="50" value={pctY} onChange={e => setPctY(+e.target.value)} className="w-full" disabled={rows < 2} /></label>
        <label className="block text-sm">Çıkış atamaları (virgülle: DP-1, DP-2…)
          <input className="inp" value={outs} onChange={e => setOuts(e.target.value)} /></label>
        {built.err && <p className="text-red-400 text-sm">⚠ {built.err}</p>}
        {L && <div className="text-sm border border-slate-700 rounded p-2">
          <div>Birleşik kanvas: <b>{L.canvasW} × {L.canvasH}</b> px</div>
          <div className="text-xs text-slate-400">Çözünürlük toplamı {L.naiveW}×{L.naiveH} yanlış olurdu; örtüşme çıkarıldı.</div>
          <div>Toplam piksel: {(L.canvasW * L.canvasH).toLocaleString('tr-TR')}</div>
          <div>Örtüşme bölgesi sayısı: {L.overlaps.length}</div>
          {L.warnings.map(x => <div key={x} className="text-amber-400">⚠ {x}</div>)}
        </div>}
        <button className="px-3 py-1 bg-sky-700 rounded text-sm" disabled={!L} onClick={apply}>Düzeni uygula (Piksel Haritalama'ya gönder)</button>
        <p className="text-xs text-slate-500">Mevcut düzen: {slots.length} projektör, içerik kanvası {content.w}×{content.h}.</p>
      </div>
      <div className="space-y-3 min-w-0">
        {L && <div className="border border-slate-700 rounded bg-slate-950 p-2" dangerouslySetInnerHTML={{ __html: svg }} />}
        {L && (
          <table className="text-xs w-full border border-slate-700">
            <thead className="text-slate-400"><tr><th className="text-left p-1">Projektör</th><th>Çıkış</th><th>Ofset (x, y)</th><th>Bitiş</th><th>Harman (S/Sğ/Ü/A)</th></tr></thead>
            <tbody>{L.slots.map(s => (
              <tr key={s.id} className="border-t border-slate-800 text-center">
                <td className="text-left p-1">{s.label}</td><td>{s.output ?? '—'}</td>
                <td>{s.x}, {s.y}</td><td>{s.x + s.w}, {s.y + s.h}</td>
                <td>{s.blend ? `${s.blend.l}/${s.blend.r}/${s.blend.t}/${s.blend.b}` : '—'}</td></tr>))}</tbody>
          </table>)}
        {L && <div className="flex flex-wrap gap-2 text-sm">
          <button className="px-3 py-1 bg-slate-700 rounded" onClick={() => download('multi-projektor.svg', layoutToSvg(L, { gridStep: 0 }), 'image/svg+xml')}>SVG</button>
          <button className="px-3 py-1 bg-slate-700 rounded" onClick={async () => download('multi-projektor.png', await svgToPng(layoutToSvg(L, { pixelWidth: 2400 }), 2400))}>PNG</button>
          <button className="px-3 py-1 bg-slate-700 rounded" onClick={() => download('multi-projektor.json', JSON.stringify(toConfig(L.slots, { w: L.canvasW, h: L.canvasH }, gamma), null, 2), 'application/json')}>JSON</button>
          {L.slots.map(s => (
            <button key={s.id} className="px-3 py-1 bg-slate-800 rounded" onClick={() => renderTestPattern(s, L, gamma).toBlob(b => b && download(`test-${s.id}.png`, b))}>
              Test deseni {s.id}</button>))}
        </div>}
      </div>
    </div>
  );
}
