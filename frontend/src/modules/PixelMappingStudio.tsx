import { useMemo, useRef, useState } from 'react';
import { computeLayout, ProjectorSlot } from '../engine/multiproj';
import { fromConfig, layoutToSvg, toConfig } from '../engine/exporters';
import { useMapping } from '../mappingStore';
import { download, renderTestPattern, svgToPng } from '../util';

export default function PixelMappingStudio() {
  const { slots, setSlots, content, setContent, gamma, setGamma } = useMapping();
  const [grid, setGrid] = useState(100), [snap, setSnap] = useState(true), [safe, setSafe] = useState(90);
  const [showSafe, setShowSafe] = useState(false), [rulers, setRulers] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [msg, setMsg] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | { pan: true; x: number; y: number } | null>(null);

  const res = useMemo(() => {
    try { return { L: computeLayout(slots), err: null as string | null }; }
    catch (e) { return { L: null, err: (e as Error).message }; }
  }, [slots]);
  const L = res.L;
  const v = view ?? (L ? { x: 0, y: 0, w: L.canvasW, h: L.canvasH } : null);
  const svg = L && v ? layoutToSvg(L, { gridStep: grid, safeAreaPct: showSafe ? safe : undefined, rulers, view: v }) : '';

  const pt = (e: React.PointerEvent | React.WheelEvent) => {
    const el = host.current!.querySelector('svg')!;
    const p = el.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(el.getScreenCTM()!.inverse());
    return { x: q.x, y: q.y };
  };
  const sn = (n: number) => snap && grid > 0 ? Math.round(n / grid) * grid : Math.round(n);

  // Geometri elle değişirse ızgaradan gelen harman bölgeleri geçersiz olur; yanıltmamak için temizlenir.
  const update = (id: string, patch: Partial<ProjectorSlot>) => setSlots(slots.map(s => {
    if (s.id !== id) return s;
    const geo = ['x', 'y', 'w', 'h'].some(k => k in patch);
    return { ...s, ...patch, ...(geo ? { blend: undefined } : {}) };
  }));

  const onDown = (e: React.PointerEvent) => {
    if (!L) return;
    const p = pt(e);
    const hit = [...L.slots].reverse().find(s => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (hit && e.button === 0 && !e.altKey) { setSlots(L.slots); setSel(hit.id); drag.current = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y }; }
    else { drag.current = { pan: true, x: p.x, y: p.y }; }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || !L || !v) return;
    const p = pt(e);
    if ('pan' in d) { setView({ ...v, x: v.x - (p.x - d.x), y: v.y - (p.y - d.y) }); return; }
    // slots'taki x,y normalize edilmiş kanvas koordinatıdır; sürükleme sonrası computeLayout yeniden normalize eder
    update(d.id, { x: sn(p.x - d.dx), y: sn(p.y - d.dy) });
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    if (!v) return;
    const p = pt(e), k = e.deltaY < 0 ? 0.85 : 1 / 0.85;
    setView({ x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w: v.w * k, h: v.h * k });
  };

  const add = () => {
    const n = slots.length + 1;
    let id = `P${n}`; while (slots.some(s => s.id === id)) id += '_';
    setSlots([...slots, { id, label: `Projektör ${n}`, x: 0, y: 0, w: 1920, h: 1080 }]);
    setSel(id);
  };
  const s = slots.find(x => x.id === sel);
  const nf = (label: string, key: 'x' | 'y' | 'w' | 'h') => (
    <label className="text-xs">{label}<input className="inp" type="number" value={s![key]} onChange={e => update(s!.id, { [key]: Math.round(+e.target.value) })} /></label>);
  const cropField = (label: string, key: 'l' | 'r' | 't' | 'b') => (
    <label className="text-xs">{label}<input className="inp" type="number" min="0" value={s!.crop?.[key] ?? 0}
      onChange={e => update(s!.id, { crop: { l: 0, r: 0, t: 0, b: 0, ...s!.crop, [key]: Math.max(0, Math.round(+e.target.value)) } })} /></label>);

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4 h-full">
      <div className="space-y-2 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto text-sm">
        <h2 className="font-semibold">Piksel Haritalama Stüdyosu</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">İçerik kanvası W<input className="inp" type="number" value={content.w} onChange={e => setContent({ ...content, w: Math.round(+e.target.value) })} /></label>
          <label className="text-xs">İçerik kanvası H<input className="inp" type="number" value={content.h} onChange={e => setContent({ ...content, h: Math.round(+e.target.value) })} /></label>
          <label className="text-xs">Izgara (px)<input className="inp" type="number" min="0" value={grid} onChange={e => setGrid(Math.max(0, +e.target.value))} /></label>
          <label className="text-xs">Gamma (harman)<input className="inp" type="number" step="0.1" value={gamma} onChange={e => setGamma(+e.target.value || 2.2)} /></label>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Izgaraya yapış</label>
          <label><input type="checkbox" checked={rulers} onChange={e => setRulers(e.target.checked)} /> Cetvel</label>
          <label><input type="checkbox" checked={showSafe} onChange={e => setShowSafe(e.target.checked)} /> Güvenli alan %</label>
          <input className="inp w-16" type="number" value={safe} onChange={e => setSafe(+e.target.value)} />
        </div>
        {L && <div className="text-xs text-slate-300 border border-slate-700 rounded p-2">
          Kanvas {L.canvasW}×{L.canvasH}
          {(content.w !== L.canvasW || content.h !== L.canvasH) && <span className="text-amber-400"> — içerik kanvasından farklı ({content.w}×{content.h}); ölçekleme/kırpma gerekir.</span>}
          {L.warnings.map(w => <div key={w} className="text-amber-400">⚠ {w}</div>)}
        </div>}
        {res.err && <p className="text-red-400">⚠ {res.err}</p>}
        <div className="flex gap-2 items-center"><b className="text-xs">Projektörler</b>
          <button className="px-2 py-0.5 bg-sky-700 rounded text-xs" onClick={add}>+ Ekle</button></div>
        {slots.map(x => (
          <div key={x.id} onClick={() => setSel(x.id)} className={`px-2 py-1 rounded cursor-pointer text-xs flex justify-between ${sel === x.id ? 'bg-slate-700' : 'bg-slate-800'}`}>
            <span>{x.label} {x.output ? `· ${x.output}` : ''}</span><span>{x.w}×{x.h} @ {x.x},{x.y}</span></div>))}
        {s && <div className="border border-slate-700 rounded p-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Ad<input className="inp" value={s.label} onChange={e => update(s.id, { label: e.target.value })} /></label>
            <label className="text-xs">Çıkış<input className="inp" value={s.output ?? ''} onChange={e => update(s.id, { output: e.target.value })} /></label>
            {nf('X', 'x')}{nf('Y', 'y')}{nf('Çözünürlük W', 'w')}{nf('Çözünürlük H', 'h')}</div>
          <div className="text-xs text-slate-400">Dikdörtgen maske (kırpma, piksel)</div>
          <div className="grid grid-cols-4 gap-1">{cropField('Sol', 'l')}{cropField('Sağ', 'r')}{cropField('Üst', 't')}{cropField('Alt', 'b')}</div>
          {L && <div className="text-xs">Aktif bölge: {L.active[s.id]?.w}×{L.active[s.id]?.h} @ ({L.active[s.id]?.x}, {L.active[s.id]?.y})</div>}
          <div className="flex gap-2">
            <button className="px-2 py-1 bg-slate-700 rounded text-xs" disabled={!L} onClick={() => L && renderTestPattern(L.slots.find(q => q.id === s.id)!, L, gamma).toBlob(b => b && download(`test-${s.id}.png`, b))}>Test deseni PNG</button>
            <button className="px-2 py-1 bg-red-900 rounded text-xs" disabled={slots.length < 2} onClick={() => { setSlots(slots.filter(q => q.id !== s.id)); setSel(null); }}>Sil</button></div>
        </div>}
        <p className="text-[11px] text-amber-400">Geliştirme aşamasında: poligon/Bezier maske, mesh warping, serbest harman bölgesi düzenleme. Harman bölgeleri yalnızca Çoklu Projektör ızgarasından gelir.</p>
        <p className="text-[11px] text-slate-500">WATCHOUT/Resolume/MadMapper dışa aktarımı yok; biçim şartnameleri doğrulanmadan uyumluluk iddia edilmez (yalnızca yerel JSON).</p>
      </div>

      <div className="space-y-2 min-w-0">
        <div className="flex flex-wrap gap-2 text-sm">
          <button className="px-3 py-1 bg-slate-700 rounded" onClick={() => setView(null)}>Sığdır</button>
          <button className="px-3 py-1 bg-slate-700 rounded" disabled={!L} onClick={() => L && download('piksel-haritasi.svg', layoutToSvg(L, { gridStep: grid, safeAreaPct: showSafe ? safe : undefined }), 'image/svg+xml')}>SVG</button>
          <button className="px-3 py-1 bg-slate-700 rounded" disabled={!L} onClick={async () => L && download('piksel-haritasi.png', await svgToPng(layoutToSvg(L, { gridStep: grid, safeAreaPct: showSafe ? safe : undefined, pixelWidth: 3000 }), 3000))}>PNG</button>
          <button className="px-3 py-1 bg-slate-700 rounded" disabled={!L} onClick={() => L && download('piksel-haritasi.json', JSON.stringify(toConfig(L.slots, content, gamma), null, 2), 'application/json')}>JSON dışa</button>
          <label className="px-3 py-1 bg-slate-700 rounded cursor-pointer">JSON içe
            <input type="file" accept=".json" hidden onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              try { const c = fromConfig(await f.text()); setSlots(c.projectors); setContent(c.contentCanvas); setGamma(c.gamma); setMsg('İçe aktarıldı'); setView(null); }
              catch (err) { setMsg((err as Error).message); }
            }} /></label>
          <span className="text-xs text-slate-400 self-center">{msg} · tekerlek: yakınlaştır · boşlukta/Alt+sürükle: kaydır · PDF dışa aktarım Faz 6</span>
        </div>
        <div ref={host} className="border border-slate-700 rounded bg-slate-950 touch-none select-none" style={{ height: '70vh' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel}
          dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="width:100%;height:100%" ') }} />
      </div>
    </div>
  );
}
