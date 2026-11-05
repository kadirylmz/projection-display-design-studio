import { useMemo, useRef, useState } from 'react';
import { computeLayout, createDefaultBezierMask, createUniformWarp, ProjectorSlot } from '../engine/multiproj';
import { fromConfig, layoutToSvg, toConfig } from '../engine/exporters';
import { useMapping } from '../mappingStore';
import { download, renderCanvasPixelMapPattern, renderTestPattern, svgToPng } from '../util';

export default function PixelMappingStudio() {
  const { slots, setSlots, content, setContent, gamma, setGamma } = useMapping();
  const [grid, setGrid] = useState(100), [snap, setSnap] = useState(true), [safe, setSafe] = useState(90);
  const [showSafe, setShowSafe] = useState(false), [rulers, setRulers] = useState(true);
  const [sel, setSel] = useState<string | null>(slots[0]?.id ?? null);
  const [polyDrawMode, setPolyDrawMode] = useState(false);
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

  const update = (id: string, patch: Partial<ProjectorSlot>) => setSlots(slots.map(s => s.id === id ? { ...s, ...patch } : s));

  const onDown = (e: React.PointerEvent) => {
    if (!L) return;
    const p = pt(e);
    if (polyDrawMode && sel) {
      const target = L.slots.find(x => x.id === sel);
      if (target) {
        const lx = Math.max(0, Math.min(target.w, Math.round(p.x - target.x)));
        const ly = Math.max(0, Math.min(target.h, Math.round(p.y - target.y)));
        const cur = target.polygonMask ?? [];
        update(target.id, { polygonMask: [...cur, { x: lx, y: ly }] });
        return;
      }
    }
    const hit = [...L.slots].reverse().find(s => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (hit && e.button === 0 && !e.altKey) { setSlots(L.slots); setSel(hit.id); drag.current = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y }; }
    else { drag.current = { pan: true, x: p.x, y: p.y }; }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || !L || !v) return;
    const p = pt(e);
    if ('pan' in d) { setView({ ...v, x: v.x - (p.x - d.x), y: v.y - (p.y - d.y) }); return; }
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
  const blendField = (label: string, key: 'l' | 'r' | 't' | 'b') => (
    <label className="text-xs">{label}<input className="inp" type="number" min="0" value={s!.blend?.[key] ?? 0}
      onChange={e => update(s!.id, { blend: { l: 0, r: 0, t: 0, b: 0, ...s!.blend, [key]: Math.max(0, Math.round(+e.target.value)) } })} /></label>);

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4 h-full">
      <div className="space-y-2 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto text-xs" style={{ maxHeight: '88vh' }}>
        <h2 className="text-sm font-semibold text-sky-300">Piksel Haritalama (Pixel Mapping) Stüdyosu</h2>
        <div className="grid grid-cols-2 gap-2">
          <label>İçerik Kanvası W (px)<input className="inp" type="number" value={content.w} onChange={e => setContent({ ...content, w: Math.round(+e.target.value) })} /></label>
          <label>İçerik Kanvası H (px)<input className="inp" type="number" value={content.h} onChange={e => setContent({ ...content, h: Math.round(+e.target.value) })} /></label>
          <label>Izgara Adımı (px)<input className="inp" type="number" min="0" value={grid} onChange={e => setGrid(Math.max(0, +e.target.value))} /></label>
          <label>Harman Gamma<input className="inp" type="number" step="0.1" value={gamma} onChange={e => setGamma(+e.target.value || 2.2)} /></label>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-1"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Izgaraya yapış</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={rulers} onChange={e => setRulers(e.target.checked)} /> Cetvel</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={showSafe} onChange={e => setShowSafe(e.target.checked)} /> Güvenli alan %</label>
          <input className="inp w-14 !mt-0" type="number" value={safe} onChange={e => setSafe(+e.target.value)} />
        </div>

        {L && (
          <div className="text-slate-300 border border-slate-700 rounded p-2 bg-slate-950 space-y-1">
            <div>Birleşik Çıkış Kanvası: <b>{L.canvasW} × {L.canvasH} px</b> ({L.overlaps.length} örtüşme bölgesi)</div>
            {(content.w !== L.canvasW || content.h !== L.canvasH) && (
              <div className="text-amber-400">
                İçerik kanvası ({content.w}×{content.h}) çıkış kanvasından farklı.
                <button className="ml-2 underline text-sky-300" onClick={() => setContent({ w: L.canvasW, h: L.canvasH })}>Eşitle</button>
              </div>
            )}
            {L.warnings.map(w => <div key={w} className="text-amber-400">⚠ {w}</div>)}
          </div>
        )}
        {res.err && <p className="text-red-400">⚠ {res.err}</p>}

        <div className="flex justify-between items-center pt-1">
          <b>Çıkış Ekranları / Projektörler</b>
          <button className="px-2 py-0.5 bg-sky-700 rounded text-white" onClick={add}>+ Çıkış Ekle</button>
        </div>
        <div className="space-y-1">
          {slots.map(x => (
            <div key={x.id} onClick={() => setSel(x.id)} className={`px-2 py-1 rounded cursor-pointer flex justify-between ${sel === x.id ? 'bg-sky-900/60 border border-sky-500' : 'bg-slate-800'}`}>
              <span><b>{x.label}</b> {x.output ? `[${x.output}]` : ''}</span>
              <span>{x.w}×{x.h} @ ({x.x},{x.y})</span>
            </div>
          ))}
        </div>

        {s && (
          <div className="border border-slate-700 rounded p-2.5 bg-slate-950 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <label>Etiket<input className="inp" value={s.label} onChange={e => update(s.id, { label: e.target.value })} /></label>
              <label>Çıkış Portu (Output)<input className="inp" placeholder="DP-1 / HDMI-2" value={s.output ?? ''} onChange={e => update(s.id, { output: e.target.value })} /></label>
              {nf('Ofset X (px)', 'x')}{nf('Ofset Y (px)', 'y')}{nf('Çözünürlük W', 'w')}{nf('Çözünürlük H', 'h')}
            </div>

            <div>
              <div className="text-slate-400 font-semibold">1. Dikdörtgen Kırpma Maskesi (Cropping, px)</div>
              <div className="grid grid-cols-4 gap-1">{cropField('Sol', 'l')}{cropField('Sağ', 'r')}{cropField('Üst', 't')}{cropField('Alt', 'b')}</div>
              {L && <div className="text-slate-400 mt-1">Aktif Çıkış: <b>{L.active[s.id]?.w}×{L.active[s.id]?.h} px</b> @ ({L.active[s.id]?.x}, {L.active[s.id]?.y})</div>}
            </div>

            <div className="border-t border-slate-800 pt-2">
              <div className="text-slate-400 font-semibold">2. Kenar Harmanlama (Edge Blending, px)</div>
              <div className="grid grid-cols-4 gap-1">{blendField('Sol', 'l')}{blendField('Sağ', 'r')}{blendField('Üst', 't')}{blendField('Alt', 'b')}</div>
            </div>

            <div className="border-t border-slate-800 pt-2 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold">3. Poligon & Bezier Maskeler</span>
                <div className="flex gap-1">
                  <button
                    className={`px-2 py-0.5 rounded ${polyDrawMode ? 'bg-amber-600 text-white' : 'bg-slate-800'}`}
                    onClick={() => setPolyDrawMode(!polyDrawMode)}
                  >
                    {polyDrawMode ? 'Çizim Aktif (Kanvasa Tıkla)' : '+ Poligon Köşe Çiz'}
                  </button>
                  {s.polygonMask?.length ? (
                    <button className="px-2 py-0.5 bg-red-900/70 rounded" onClick={() => update(s.id, { polygonMask: undefined })}>Poligonu Sil</button>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-1 pt-1">
                {!s.bezierMask ? (
                  <button className="px-2 py-0.5 bg-slate-800 rounded" onClick={() => update(s.id, { bezierMask: createDefaultBezierMask(s.w, s.h) })}>
                    + Bezier Eğri Maskesi Oluştur
                  </button>
                ) : (
                  <button className="px-2 py-0.5 bg-red-900/70 rounded" onClick={() => update(s.id, { bezierMask: undefined })}>
                    Bezier Maskesini Kaldır ({s.bezierMask.length} düğüm)
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-2 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold">4. Mesh Warping (Izgara Bükme)</span>
                {!s.warp ? (
                  <div className="flex gap-1">
                    <button className="px-2 py-0.5 bg-slate-800 rounded" onClick={() => update(s.id, { warp: createUniformWarp(s.w, s.h, 3, 3) })}>3×3 Mesh</button>
                    <button className="px-2 py-0.5 bg-slate-800 rounded" onClick={() => update(s.id, { warp: createUniformWarp(s.w, s.h, 4, 4) })}>4×4 Mesh</button>
                  </div>
                ) : (
                  <button className="px-2 py-0.5 bg-red-900/70 rounded" onClick={() => update(s.id, { warp: undefined })}>Mesh Sıfırla ({s.warp.cols}×{s.warp.rows})</button>
                )}
              </div>
              {s.warp && (
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  {([
                    ['Sol-Üst Köşe', 0],
                    ['Sağ-Üst Köşe', s.warp.cols],
                    ['Sol-Alt Köşe', s.warp.rows * (s.warp.cols + 1)],
                    ['Sağ-Alt Köşe', (s.warp.rows + 1) * (s.warp.cols + 1) - 1],
                  ] as [string, number][]).map(([lbl, idx]) => {
                    const pt = s.warp!.points[idx];
                    const setPt = (nx: number, ny: number) => {
                      const next = s.warp!.points.map((p, k) => k === idx ? { x: nx, y: ny } : p);
                      update(s.id, { warp: { ...s.warp!, points: next } });
                    };
                    return (
                      <div key={lbl} className="p-1 bg-slate-900 rounded border border-slate-800">
                        <div className="text-slate-400">{lbl}</div>
                        <div className="flex gap-1">
                          <input className="inp !mt-0" type="number" value={pt.x} onChange={e => setPt(+e.target.value, pt.y)} />
                          <input className="inp !mt-0" type="number" value={pt.y} onChange={e => setPt(pt.x, +e.target.value)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button className="px-2 py-1 bg-sky-800 rounded text-white" disabled={!L} onClick={() => L && renderTestPattern(L.slots.find(q => q.id === s.id)!, L, gamma).toBlob(b => b && download(`test-${s.id}.png`, b))}>
                Bu Projektör Test Deseni (PNG)
              </button>
              <button className="px-2 py-1 bg-red-900 rounded ml-auto" disabled={slots.length < 2} onClick={() => { setSlots(slots.filter(q => q.id !== s.id)); setSel(null); }}>
                Sil
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 min-w-0">
        <div className="flex flex-wrap gap-2 text-xs items-center">
          <button className="px-3 py-1 bg-slate-700 rounded" onClick={() => setView(null)}>Görünümü Sığdır</button>
          <button
            className="px-3 py-1 bg-emerald-700 rounded font-semibold text-white"
            disabled={!L}
            onClick={() => L && renderCanvasPixelMapPattern(L).toBlob(b => b && download(`pixel-map-pattern-${L.canvasW}x${L.canvasH}.png`, b))}
          >
            Tam Kanvas Pixel Map Deseni İndir (1:1 PNG)
          </button>
          <button className="px-3 py-1 bg-slate-700 rounded" disabled={!L} onClick={() => L && download('piksel-haritasi.svg', layoutToSvg(L, { gridStep: grid, safeAreaPct: showSafe ? safe : undefined }), 'image/svg+xml')}>SVG İndir</button>
          <button className="px-3 py-1 bg-slate-700 rounded" disabled={!L} onClick={async () => L && download('piksel-haritasi.png', await svgToPng(layoutToSvg(L, { gridStep: grid, safeAreaPct: showSafe ? safe : undefined, pixelWidth: 3000 }), 3000))}>PNG Şema</button>
          <button className="px-3 py-1 bg-slate-700 rounded" disabled={!L} onClick={() => L && download('piksel-haritasi.json', JSON.stringify(toConfig(L.slots, content, gamma), null, 2), 'application/json')}>JSON Dışa</button>
          <label className="px-3 py-1 bg-slate-700 rounded cursor-pointer">JSON İçe
            <input type="file" accept=".json" hidden onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              try { const c = fromConfig(await f.text()); setSlots(c.projectors); setContent(c.contentCanvas); setGamma(c.gamma); setMsg('Yapılandırma yüklendi'); setView(null); }
              catch (err) { setMsg((err as Error).message); }
            }} />
          </label>
          <span className="text-slate-400">{msg} · Tekerlek: Zoom · Alt+Sürükle: Kaydır</span>
        </div>
        <div
          ref={host}
          className="border border-slate-700 rounded bg-slate-950 touch-none select-none"
          style={{ height: '74vh' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onWheel={onWheel}
          dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="width:100%;height:100%" ') }}
        />
      </div>
    </div>
  );
}
