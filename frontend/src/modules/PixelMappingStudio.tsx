import { useMemo, useRef, useState } from 'react';
import { calculatePixelDensity, computeLayout, ProjectorSlot } from '../engine/multiproj';
import { fromConfig, layoutToSvg, toConfig } from '../engine/exporters';
import { useMapping } from '../mappingStore';
import { useProjectStore } from '../projectStore';
import { download, overlayImageOnCanvas, renderCanvasPixelMapPattern, renderTestPattern, svgToPng } from '../util';

export default function PixelMappingStudio() {
  const {
    screens,
    activeScreenId,
    slots,
    setSlots,
    content,
    setContent,
    gamma,
    setGamma,
    selectScreen,
    addScreen,
    removeScreen,
    updateScreen,
    setAllScreensInReport,
  } = useMapping();

  const activeScreen = screens.find(sc => sc.id === activeScreenId) ?? screens[0];
  const [newScreenName, setNewScreenName] = useState('');

  const [grid, setGrid] = useState(100), [snap, setSnap] = useState(true), [safe, setSafe] = useState(90);
  const [showSafe, setShowSafe] = useState(false), [rulers, setRulers] = useState(true);
  const [sel, setSel] = useState<string | null>(slots[0]?.id ?? null);
  const [polyDrawMode, setPolyDrawMode] = useState(false);
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [reportToast, setReportToast] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | { pan: true; x: number; y: number } | null>(null);

  const res = useMemo(() => {
    if (slots.length === 0) return { L: null, err: null as string | null };
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
  const density = s ? calculatePixelDensity(s.w, s.h, s.physicalWidthM, s.physicalHeightM) : null;
  const nf = (label: string, key: 'x' | 'y' | 'w' | 'h') => (
    <label className="text-xs">{label}<input className="inp" type="number" min={key === 'w' || key === 'h' ? 1 : undefined} value={s![key]} onChange={e => {
      const val = Math.round(+e.target.value);
      update(s!.id, { [key]: (key === 'w' || key === 'h') ? Math.max(1, val || 1) : (Number.isFinite(val) ? val : 0) });
    }} /></label>);
  const cropField = (label: string, key: 'l' | 'r' | 't' | 'b') => (
    <label className="text-xs">{label}<input className="inp" type="number" min="0" value={s!.crop?.[key] ?? 0}
      onChange={e => update(s!.id, { crop: { l: 0, r: 0, t: 0, b: 0, ...s!.crop, [key]: Math.max(0, Math.round(+e.target.value)) } })} /></label>);
  const blendField = (label: string, key: 'l' | 'r' | 't' | 'b') => (
    <label className="text-xs">{label}<input className="inp" type="number" min="0" value={s!.blend?.[key] ?? 0}
      onChange={e => update(s!.id, { blend: { l: 0, r: 0, t: 0, b: 0, ...s!.blend, [key]: Math.max(0, Math.round(+e.target.value)) } })} /></label>);

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-4 h-full">
      <div className="space-y-2 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto text-xs" style={{ maxHeight: '88vh' }}>
        <div className="border-b border-slate-700 pb-2">
          <h2 className="text-sm font-semibold text-sky-300">Çoklu Projektör &amp; Piksel Haritalama Stüdyosu</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            İçerik Canvas'ı ile fiziksel ekran/çıkış çözünürlükleri arasındaki teknik piksel eşleşmesi.
          </p>
        </div>

        {/* Duvar / Ekran Yönetimi & Foto/Logo */}
        <div className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sky-300 text-xs">Duvarlar / Ekranlar ({screens.length})</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAllScreensInReport(true)}
                className="px-1.5 py-0.5 rounded bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 text-[10px]"
                title="Tüm ekranları rapora dahil et"
              >
                Tümünü Ekle
              </button>
              <button
                type="button"
                onClick={() => setAllScreensInReport(false)}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                title="Tüm ekranları rapordan çıkar"
              >
                Tümünü Çıkar
              </button>
            </div>
          </div>

          <div className="flex gap-1.5">
            <input
              className="inp flex-1"
              value={newScreenName}
              onChange={e => setNewScreenName(e.target.value)}
              placeholder="Yeni ekran / duvar adı (örn: Sahne Önü)"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  addScreen(newScreenName);
                  setNewScreenName('');
                  setView(null);
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                addScreen(newScreenName);
                setNewScreenName('');
                setView(null);
              }}
              className="px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white font-semibold whitespace-nowrap"
            >
              + Ekle
            </button>
          </div>

          <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
            {screens.map(sc => {
              const isAct = sc.id === activeScreen.id;
              return (
                <div
                  key={sc.id}
                  onClick={() => { selectScreen(sc.id); setView(null); setSel(sc.slots[0]?.id ?? null); }}
                  className={`p-1.5 rounded border cursor-pointer flex items-center justify-between gap-2 ${
                    isAct ? 'bg-sky-950/70 border-sky-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={sc.includeInReport}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateScreen(sc.id, { includeInReport: e.target.checked })}
                      title="Rapora Dahil Et"
                      className="accent-emerald-500"
                    />
                    <input
                      className="bg-transparent text-slate-200 font-medium text-xs w-full focus:outline-none focus:bg-slate-800 px-1 rounded"
                      value={sc.name}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateScreen(sc.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {sc.photoUrl && <span className="text-[10px] text-emerald-400" title="Foto/Logo yüklü">🖼️</span>}
                    <span className="text-[10px] text-slate-400 font-mono">{sc.slots.length}pj</span>
                    {screens.length > 1 && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); removeScreen(sc.id); }}
                        className="px-1.5 py-0.5 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 text-[10px]"
                        title="Ekranı Sil"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Seçili Ekran Fotoğrafı / Logo Yükleme */}
          {activeScreen && (
            <div className="pt-1 border-t border-slate-800 flex items-center justify-between gap-2">
              <label className="flex-1 cursor-pointer px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-center text-[11px] text-slate-200">
                🖼️ {activeScreen.photoUrl ? 'Foto / Logo Değiştir' : 'Foto veya Logo Ekle'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      updateScreen(activeScreen.id, { photoUrl: reader.result as string });
                      setMsg(`"${activeScreen.name}" için foto/logo yüklendi`);
                    };
                    reader.onerror = () => setMsg('Fotoğraf okunamadı');
                    reader.readAsDataURL(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {activeScreen.photoUrl && (
                <>
                  <img src={activeScreen.photoUrl} alt="Ekran Foto/Logo" className="h-7 w-10 object-cover rounded border border-slate-700" />
                  <button
                    type="button"
                    onClick={() => updateScreen(activeScreen.id, { photoUrl: undefined })}
                    className="px-2 py-1 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 text-[10px]"
                    title="Fotoğrafı/Logoyu Kaldır"
                  >
                    Sil
                  </button>
                </>
              )}
            </div>
          )}
          {msg && <div className="text-[11px] text-emerald-400">{msg}</div>}
        </div>

        {/* Canvas & Çözünürlük Özeti */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2 rounded border border-slate-800">
          <label>İçerik Canvas W (px)<input className="inp" type="number" value={content.w} onChange={e => setContent({ ...content, w: Math.round(+e.target.value) })} /></label>
          <label>İçerik Canvas H (px)<input className="inp" type="number" value={content.h} onChange={e => setContent({ ...content, h: Math.round(+e.target.value) })} /></label>
          <label>Izgara Adımı (px)<input className="inp" type="number" min="0" value={grid} onChange={e => setGrid(Math.max(0, +e.target.value))} /></label>
          <label>Harman Gamma<input className="inp" type="number" step="0.1" value={gamma} onChange={e => setGamma(+e.target.value || 2.2)} /></label>
        </div>

        {L && (
          <div className="text-slate-300 border border-slate-700 rounded p-2.5 bg-slate-950 space-y-1">
            <div className="flex justify-between items-center">
              <span>Toplam Çıkış Canvas:</span>
              <b className="text-emerald-400 text-sm">{L.canvasW} × {L.canvasH} px</b>
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Toplam Ekran / Çıkış: {L.slots.length}</span>
              <span>Örtüşme (Overlap) Sayısı: {L.overlaps.length}</span>
            </div>
            {(content.w !== L.canvasW || content.h !== L.canvasH) && (
              <div className="text-amber-400 mt-1 pt-1 border-t border-slate-800 flex justify-between items-center">
                <span>İçerik Canvas ({content.w}×{content.h}) çıkışla eşleşmiyor.</span>
                <button className="px-2 py-0.5 bg-sky-800 text-white rounded text-[10px]" onClick={() => setContent({ w: L.canvasW, h: L.canvasH })}>
                  Eşitle
                </button>
              </div>
            )}
            {L.warnings.map(w => <div key={w} className="text-amber-400">⚠ {w}</div>)}
          </div>
        )}
        {res.err && <p className="text-red-400">⚠ {res.err}</p>}

        {/* Ekranlar / Çıkışlar Listesi */}
        <div className="flex justify-between items-center pt-1">
          <b className="text-slate-200">Çıkış Ekranları / Projektörler</b>
          <button className="px-2.5 py-0.5 bg-sky-700 hover:bg-sky-600 rounded text-white" onClick={add}>+ Çıkış Ekle</button>
        </div>
        <div className="space-y-1">
          {slots.map(x => (
            <div key={x.id} onClick={() => setSel(x.id)} className={`px-2 py-1.5 rounded cursor-pointer flex justify-between items-center gap-2 ${sel === x.id ? 'bg-sky-950/80 border border-sky-400' : 'bg-slate-800 hover:bg-slate-750'}`}>
              <div className="min-w-0 truncate">
                <span className="font-semibold text-slate-200">{x.label}</span>
                {x.output && <span className="ml-1.5 text-[10px] px-1 py-0.5 bg-slate-700 text-sky-300 rounded font-mono">{x.output}</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono text-slate-300 text-[11px]">{x.w}×{x.h} @ [{x.x}, {x.y}]</span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    const next = slots.filter(q => q.id !== x.id);
                    setSlots(next);
                    if (sel === x.id) setSel(next[0]?.id ?? null);
                  }}
                  className="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-[10px]"
                  title={`${x.label} çıkışını kaldır`}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Seçili Ekran Detayları */}
        {s && (
          <div className="border border-slate-700 rounded p-2.5 bg-slate-950 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <label>Etiket / İsim<input className="inp" value={s.label} onChange={e => update(s.id, { label: e.target.value })} /></label>
              <label>Donanım Çıkışı (Port)<input className="inp" placeholder="Örn: GPU-1 Out 1" value={s.output ?? ''} onChange={e => update(s.id, { output: e.target.value })} /></label>
              {nf('Başlangıç X (px)', 'x')}{nf('Başlangıç Y (px)', 'y')}{nf('Genişlik W (px)', 'w')}{nf('Yükseklik H (px)', 'h')}
            </div>

            {/* Hızlı Çözünürlük & Küçültme Butonları */}
            <div className="space-y-1">
              <div className="text-[10.5px] text-slate-400 font-semibold">Hızlı Çözünürlük / Küçültme</div>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: '4K', w: 3840, h: 2160 },
                  { label: 'WUXGA', w: 1920, h: 1200 },
                  { label: 'FHD', w: 1920, h: 1080 },
                  { label: 'WXGA', w: 1280, h: 800 },
                  { label: 'XGA', w: 1024, h: 768 },
                  { label: '800×600', w: 800, h: 600 },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => update(s.id, { w: p.w, h: p.h })}
                    className={`px-1.5 py-0.5 rounded text-[10px] border ${
                      s.w === p.w && s.h === p.h
                        ? 'bg-sky-700 border-sky-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => update(s.id, { w: Math.max(100, Math.round(s.w * 0.5)), h: Math.max(100, Math.round(s.h * 0.5)) })}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/70 hover:bg-amber-900 border border-amber-700/60 text-amber-300"
                  title="Çözünürlüğü yarıya (%50) küçült"
                >
                  %50 Küçült
                </button>
                <button
                  type="button"
                  onClick={() => update(s.id, { w: Math.max(100, Math.round(s.w * 0.75)), h: Math.max(100, Math.round(s.h * 0.75)) })}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/70 hover:bg-amber-900 border border-amber-700/60 text-amber-300"
                  title="Çözünürlüğü %75'e küçült"
                >
                  %75 Küçült
                </button>
              </div>
            </div>

            {/* Fiziksel Ölçüler & PPI (Piksel Yoğunluğu) */}
            <div className="p-2 rounded bg-slate-900 border border-slate-800 space-y-1.5">
              <span className="text-slate-300 font-semibold block">Fiziksel Ölçüler & Yoğunluk (PPI)</span>
              <div className="grid grid-cols-2 gap-2">
                <label>Fiziksel Genişlik (m)
                  <input className="inp" type="number" step="0.01" value={s.physicalWidthM ?? ''} placeholder="Örn: 4.00" onChange={e => update(s.id, { physicalWidthM: +e.target.value || undefined })} />
                </label>
                <label>Fiziksel Yükseklik (m)
                  <input className="inp" type="number" step="0.01" value={s.physicalHeightM ?? ''} placeholder="Örn: 2.25" onChange={e => update(s.id, { physicalHeightM: +e.target.value || undefined })} />
                </label>
              </div>
              {density && (
                <div className="grid grid-cols-3 gap-1 pt-1 text-[11px] font-mono text-emerald-400 bg-slate-950 p-1.5 rounded">
                  <div>PPI: <b>{density.ppi}</b></div>
                  <div>Piksel W: <b>{density.mmPerPxW} mm</b></div>
                  <div>Piksel H: <b>{density.mmPerPxH} mm</b></div>
                </div>
              )}
            </div>

            {/* Kırpma & Harmanlama */}
            <div>
              <div className="text-slate-400 font-semibold">1. Dikdörtgen Kırpma (Cropping, px)</div>
              <div className="grid grid-cols-4 gap-1">{cropField('Sol', 'l')}{cropField('Sağ', 'r')}{cropField('Üst', 't')}{cropField('Alt', 'b')}</div>
            </div>

            <div className="border-t border-slate-800 pt-2">
              <div className="text-slate-400 font-semibold">2. Kenar Harmanlama (Edge Blending, px)</div>
              <div className="grid grid-cols-4 gap-1">{blendField('Sol', 'l')}{blendField('Sağ', 'r')}{blendField('Üst', 't')}{blendField('Alt', 'b')}</div>
            </div>

            <div className="flex gap-2 pt-1 border-t border-slate-800">
              <button
                className="px-2.5 py-1 bg-sky-800 hover:bg-sky-700 rounded text-white font-medium"
                disabled={!L}
                onClick={async () => {
                  if (!L) return;
                  const canvas = await overlayImageOnCanvas(
                    renderTestPattern(L.slots.find(q => q.id === s.id)!, L, gamma),
                    activeScreen?.photoUrl
                  );
                  canvas.toBlob(b => b && download(`test-${s.id}.png`, b));
                }}
              >
                {s.label} Test Deseni (PNG)
              </button>
              <button
                className="px-2.5 py-1 bg-red-900/80 hover:bg-red-800 rounded ml-auto text-white"
                onClick={() => {
                  const next = slots.filter(q => q.id !== s.id);
                  setSlots(next);
                  setSel(next[0]?.id ?? null);
                }}
              >
                Çıkışı Sil
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 min-w-0 flex flex-col">
        {/* Üst Butonlar */}
        <div className="flex flex-wrap gap-2 text-xs items-center bg-slate-900 p-2 rounded border border-slate-800">
          <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white" onClick={() => setView(null)}>Görünümü Sığdır</button>
          <button
            className="px-3.5 py-1 bg-emerald-700 hover:bg-emerald-600 rounded font-semibold text-white shadow"
            disabled={!L}
            onClick={async () => {
              if (!L) return;
              const canvas = await overlayImageOnCanvas(
                renderCanvasPixelMapPattern(L, activeScreen?.name || 'PIXEL MAP CANVAS'),
                activeScreen?.photoUrl
              );
              canvas.toBlob(b => b && download(`pixel-map-canvas-${L.canvasW}x${L.canvasH}.png`, b));
            }}
          >
            1:1 Tam Canvas Pixel Map Deseni (PNG)
          </button>
          <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white" disabled={!L} onClick={() => L && download('pixel-map.svg', layoutToSvg(L, { gridStep: grid, safeAreaPct: showSafe ? safe : undefined }), 'image/svg+xml')}>SVG İndir</button>
          <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white" disabled={!L} onClick={async () => L && download('pixel-map.png', await svgToPng(layoutToSvg(L, { gridStep: grid, safeAreaPct: showSafe ? safe : undefined, pixelWidth: 3000 }), 3000))}>PNG Şema</button>
          <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white" disabled={!L} onClick={() => L && download('pixel-map.json', JSON.stringify(toConfig(L.slots, content, gamma), null, 2), 'application/json')}>JSON Kaydet</button>
          <label className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded cursor-pointer text-white">JSON Yükle
            <input type="file" accept=".json" hidden onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              try { const c = fromConfig(await f.text()); setSlots(c.projectors); setContent(c.contentCanvas); setGamma(c.gamma); setMsg('Yapılandırma yüklendi'); setView(null); }
              catch (err) { setMsg((err as Error).message); }
            }} />
          </label>
          <button
            type="button"
            className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded font-bold text-white shadow ml-auto"
            disabled={!L && !activeScreen?.photoUrl}
            onClick={async () => {
              if (activeScreen) {
                updateScreen(activeScreen.id, { includeInReport: true });
              }
              let dataUrl: string | undefined = activeScreen?.photoUrl;
              if (L) {
                const canvas = await overlayImageOnCanvas(
                  renderCanvasPixelMapPattern(L, activeScreen?.name || 'PIXEL MAP CANVAS'),
                  activeScreen?.photoUrl
                );
                dataUrl = canvas.toDataURL('image/png');
              }
              if (dataUrl) {
                const prevMeta = useProjectStore.getState().meta;
                const existing = prevMeta.room3dSnapshots && prevMeta.room3dSnapshots.length > 0
                  ? prevMeta.room3dSnapshots
                  : (prevMeta.room3dSnapshotUrl ? [prevMeta.room3dSnapshotUrl] : []);
                useProjectStore.getState().setMeta({
                  room3dSnapshotUrl: dataUrl,
                  room3dSnapshots: [...existing, dataUrl],
                });
              }
              setReportToast(true);
              setMsg(`"${activeScreen?.name || 'Piksel Haritası'}" rapora eklendi`);
              setTimeout(() => setReportToast(false), 2800);
            }}
            title="Piksel haritası ekranını ve görselini Müşteri Raporuna ekler"
          >
            {reportToast ? '✓ Rapora Eklendi!' : '📋 Rapora Ekle'}
          </button>
        </div>

        {/* Görsel Canvas Çalışma Alanı */}
        <div
          ref={host}
          className="border border-slate-700 rounded bg-slate-950 touch-none select-none relative overflow-hidden flex items-center justify-center"
          style={{ height: '54vh' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onWheel={onWheel}
        >
          {activeScreen?.photoUrl && (
            <img
              src={activeScreen.photoUrl}
              alt={activeScreen.name}
              className={`pointer-events-none select-none max-w-full max-h-full object-contain ${svg ? 'absolute inset-0 w-full h-full opacity-35' : ''}`}
            />
          )}
          {svg ? (
            <div
              className="relative w-full h-full"
              dangerouslySetInnerHTML={{
                __html: svg
                  .replace('<svg ', '<svg style="width:100%;height:100%" ')
                  .replace(/fill="#0b1220"/g, activeScreen?.photoUrl ? 'fill="transparent"' : 'fill="#0b1220"')
                  .replace(/fill="#0f172a"/g, activeScreen?.photoUrl ? 'fill="transparent"' : 'fill="#0f172a"'),
              }}
            />
          ) : !activeScreen?.photoUrl ? (
            <div className="text-xs text-slate-500 text-center px-4">
              Başlamak için soldan <b className="text-slate-300">+ Çıkış Ekle</b> veya <b className="text-slate-300">Foto veya Logo Ekle</b> kullanın.
            </div>
          ) : null}
        </div>

        {/* Teknik Çıkış & Piksel Koordinat Tablosu (Resolume / Watchout Haritası) */}
        {L && (
          <div className="bg-slate-900 border border-slate-800 rounded p-2.5 overflow-auto text-xs space-y-2">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
              <span className="font-semibold text-slate-200">Teknik Piksel Koordinat & Medya Sunucusu Atama Tablosu</span>
              <span className="text-[11px] text-slate-400">Watchout / Resolume / Disguise Input/Output Eşleştirmesi</span>
            </div>
            <table className="w-full text-left font-mono">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800 text-[11px]">
                  <th className="py-1">Ekran/Çıkış</th>
                  <th>Donanım Portu</th>
                  <th>Başlangıç (X, Y)</th>
                  <th>Bitiş (X, Y)</th>
                  <th>Çözünürlük</th>
                  <th>Fiziksel Boyut</th>
                  <th>PPI</th>
                  <th>Harman (Sol/Sağ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {L.slots.map(slot => {
                  const dens = calculatePixelDensity(slot.w, slot.h, slot.physicalWidthM, slot.physicalHeightM);
                  return (
                    <tr key={slot.id} className="hover:bg-slate-800/40">
                      <td className="py-1.5 font-semibold text-sky-300 font-sans">{slot.label}</td>
                      <td><span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 text-[10px]">{slot.output ?? '—'}</span></td>
                      <td className="text-emerald-400">({slot.x}, {slot.y})</td>
                      <td className="text-emerald-400">({slot.x + slot.w}, {slot.y + slot.h})</td>
                      <td>{slot.w} × {slot.h} px</td>
                      <td className="font-sans text-slate-300">
                        {slot.physicalWidthM && slot.physicalHeightM ? `${slot.physicalWidthM}m × ${slot.physicalHeightM}m` : '—'}
                      </td>
                      <td>{dens ? `${dens.ppi} ppi` : '—'}</td>
                      <td>{slot.blend ? `${slot.blend.l}px / ${slot.blend.r}px` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
