import { useMemo, useRef, useState } from 'react';
import {
  calculatePixelDensity,
  computeGeometricMappingSummary,
  computeLayout,
  computePixelMapSummary,
  createCurvedWarp,
  createDefaultBezierMask,
  createUniformWarp,
  MappingSurfaceGeometry,
  ProjectorSlot,
} from '../engine/multiproj';
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
  const [blendControlMode, setBlendControlMode] = useState<'auto' | 'manual'>('manual');
  const [blendUnit, setBlendUnit] = useState<'percent' | 'pixel'>('percent');
  const [overlapXInput, setOverlapXInput] = useState<number>(15);
  const [overlapYInput, setOverlapYInput] = useState<number>(15);
  const [autoCols, setAutoCols] = useState<number>(0); // 0 = tek sıra yatay (tümü yan yana)
  const [slotRefMap, setSlotRefMap] = useState<Record<string, string>>({});
  const [slotPctMap, setSlotPctMap] = useState<Record<string, number>>({});
  const [slotAxisMap, setSlotAxisMap] = useState<Record<string, 'h' | 'v'>>({});
  const [summaryWallW, setSummaryWallW] = useState<number>(8.0);
  const [summaryWallH, setSummaryWallH] = useState<number>(2.5);
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | { pan: true; x: number; y: number } | null>(null);

  const res = useMemo(() => {
    if (slots.length === 0) return { L: null, err: null as string | null };
    try { return { L: computeLayout(slots), err: null as string | null }; }
    catch (e) { return { L: null, err: (e as Error).message }; }
  }, [slots]);
  const L = res.L;
  const pixelMapSummary = useMemo(() => {
    if (!L || slots.length === 0) return null;
    try {
      return computePixelMapSummary({
        slots,
        wallWidthM: summaryWallW > 0 ? summaryWallW : undefined,
        wallHeightM: summaryWallH > 0 ? summaryWallH : undefined,
        contentW: content.w,
        contentH: content.h,
      });
    } catch {
      return null;
    }
  }, [L, slots, summaryWallW, summaryWallH, content.w, content.h]);

  const geometricMappingSummary = useMemo(() => {
    if (!L || slots.length === 0) return null;
    try {
      const otherMm = screens
        .filter(sc => sc.id !== activeScreen?.id && sc.slots.length > 0)
        .map(sc => {
          try {
            return computePixelMapSummary({ slots: sc.slots }).avgMmPerPx;
          } catch {
            return null;
          }
        })
        .filter((v): v is number => typeof v === 'number' && v > 0);
      return computeGeometricMappingSummary({
        slots,
        wallWidthM: summaryWallW > 0 ? summaryWallW : undefined,
        wallHeightM: summaryWallH > 0 ? summaryWallH : undefined,
        gamma,
        otherSurfaceMmPerPx: otherMm,
      });
    } catch {
      return null;
    }
  }, [L, slots, summaryWallW, summaryWallH, gamma, screens, activeScreen?.id]);
  const v = view ?? (L ? { x: 0, y: 0, w: L.canvasW, h: L.canvasH } : null);
  const svg = L && v ? layoutToSvg(L, { gridStep: grid, safeAreaPct: showSafe ? safe : undefined, rulers, view: v }) : '';

  const pt = (e: React.PointerEvent | React.WheelEvent) => {
    const el = host.current!.querySelector('svg')!;
    const p = el.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(el.getScreenCTM()!.inverse());
    return { x: q.x, y: q.y };
  };
  const sn = (n: number) => snap && grid > 0 ? Math.round(n / grid) * grid : Math.round(n);

  const update = (id: string, patch: Partial<ProjectorSlot>) => {
    if ('x' in patch || 'y' in patch || 'blend' in patch) {
      setBlendControlMode('manual');
    }
    setSlots(slots.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const applyAutoOverlapLayout = (
    targetSlots: ProjectorSlot[],
    opts?: { unit?: 'percent' | 'pixel'; ovX?: number; ovY?: number; cols?: number }
  ) => {
    if (targetSlots.length === 0) return;
    const unit = opts?.unit ?? blendUnit;
    const ovX = Math.max(0, opts?.ovX ?? overlapXInput);
    const ovY = Math.max(0, opts?.ovY ?? overlapYInput);
    const colsCount = Math.max(1, (opts?.cols ?? autoCols) > 0 ? Math.min(opts?.cols ?? autoCols, targetSlots.length) : targetSlots.length);
    const rowsCount = Math.ceil(targetSlots.length / colsCount);

    const nextSlots: ProjectorSlot[] = [];
    let curY = 0;
    for (let r = 0; r < rowsCount; r++) {
      let curX = 0;
      let rowMaxH = 0;
      const rowEndIdx = Math.min(targetSlots.length, (r + 1) * colsCount);
      const colsInThisRow = rowEndIdx - r * colsCount;

      for (let c = 0; c < colsInThisRow; c++) {
        const idx = r * colsCount + c;
        const item = targetSlots[idx];
        const ovPxX = unit === 'percent' ? Math.min(item.w - 1, Math.round((item.w * ovX) / 100)) : Math.min(item.w - 1, Math.round(ovX));
        const ovPxY = unit === 'percent' ? Math.min(item.h - 1, Math.round((item.h * ovY) / 100)) : Math.min(item.h - 1, Math.round(ovY));

        const startX = c === 0 ? 0 : Math.max(0, curX - ovPxX);
        const startY = r === 0 ? 0 : Math.max(0, curY - ovPxY);

        nextSlots.push({
          ...item,
          x: startX,
          y: startY,
          blend: {
            l: c > 0 ? ovPxX : 0,
            r: c < colsInThisRow - 1 ? ovPxX : 0,
            t: r > 0 ? ovPxY : 0,
            b: r < rowsCount - 1 ? ovPxY : 0,
          },
        });

        curX = startX + item.w;
        if (item.h > rowMaxH) rowMaxH = item.h;
      }
      const rowOvY = unit === 'percent' ? Math.round((rowMaxH * ovY) / 100) : Math.round(ovY);
      curY = (r === 0 ? 0 : curY) + rowMaxH - (r < rowsCount - 1 ? 0 : 0);
      // Bir sonraki satırın Y başlangıcı, mevcut satırın altından dikey overlap kadar geri çekilir
      if (r === 0) {
        curY = rowMaxH;
      } else {
        curY = nextSlots[r * colsCount].y + rowMaxH;
      }
      void rowOvY;
    }

    const totalW = Math.max(...nextSlots.map(q => q.x + q.w));
    const totalH = Math.max(...nextSlots.map(q => q.y + q.h));
    setBlendControlMode('auto');
    setSlots(nextSlots);
    setContent({ w: totalW, h: totalH });
  };

  const snapSlotToRef = (
    targetId: string,
    refId: string,
    dir: 'right' | 'bottom' | 'detach',
    pctVal: number
  ) => {
    const target = slots.find(q => q.id === targetId);
    if (!target) return;
    if (dir === 'detach') {
      setBlendControlMode('manual');
      setSlots(slots.map(q => q.id === targetId ? { ...q, blend: { l: 0, r: 0, t: 0, b: 0 } } : q));
      return;
    }
    const ref = slots.find(q => q.id === refId);
    if (!ref || ref.id === target.id) return;

    const pct = Math.max(0, Math.min(80, pctVal));
    const ovPx = dir === 'right'
      ? Math.min(ref.w - 1, target.w - 1, Math.round((target.w * pct) / 100))
      : Math.min(ref.h - 1, target.h - 1, Math.round((target.h * pct) / 100));

    const nextSlots = slots.map(q => {
      if (q.id === targetId) {
        if (dir === 'right') {
          return {
            ...q,
            x: Math.max(0, ref.x + ref.w - ovPx),
            y: ref.y,
            blend: { l: ovPx, r: q.blend?.r ?? 0, t: q.blend?.t ?? 0, b: q.blend?.b ?? 0 },
          };
        }
        return {
          ...q,
          x: ref.x,
          y: Math.max(0, ref.y + ref.h - ovPx),
          blend: { l: q.blend?.l ?? 0, r: q.blend?.r ?? 0, t: ovPx, b: q.blend?.b ?? 0 },
        };
      }
      if (q.id === ref.id) {
        if (dir === 'right') {
          return {
            ...q,
            blend: { l: q.blend?.l ?? 0, r: ovPx, t: q.blend?.t ?? 0, b: q.blend?.b ?? 0 },
          };
        }
        return {
          ...q,
          blend: { l: q.blend?.l ?? 0, r: q.blend?.r ?? 0, t: q.blend?.t ?? 0, b: ovPx },
        };
      }
      return q;
    });

    setBlendControlMode('manual');
    setSlotAxisMap(prev => ({ ...prev, [targetId]: dir === 'bottom' ? 'v' : 'h' }));
    setSlots(nextSlots);
    const totalW = Math.max(...nextSlots.map(q => q.x + q.w));
    const totalH = Math.max(...nextSlots.map(q => q.y + q.h));
    setContent({ w: totalW, h: totalH });
  };

  const getSlotAxis = (slot: ProjectorSlot, prevSlot?: ProjectorSlot): 'h' | 'v' => {
    if (slotAxisMap[slot.id]) return slotAxisMap[slot.id];
    if (prevSlot && slot.y > prevSlot.y + prevSlot.h * 0.25 && Math.abs(slot.x - prevSlot.x) < prevSlot.w * 0.5) {
      return 'v';
    }
    if ((slot.blend?.t ?? 0) > 0 && (slot.blend?.l ?? 0) === 0) return 'v';
    return 'h';
  };

  const applyPerSlotPct = (targetId: string, pctVal: number, forceAxis?: 'h' | 'v') => {
    const pct = Math.max(0, Math.min(80, pctVal));
    const nextMap = { ...slotPctMap, [targetId]: pct };
    setSlotPctMap(nextMap);

    const nextAxisMap = { ...slotAxisMap };
    if (forceAxis) {
      nextAxisMap[targetId] = forceAxis;
      setSlotAxisMap(nextAxisMap);
    }

    const nextSlots = slots.map(q => ({
      ...q,
      blend: { l: q.blend?.l ?? 0, r: q.blend?.r ?? 0, t: q.blend?.t ?? 0, b: q.blend?.b ?? 0 },
    }));

    const targetIdx = nextSlots.findIndex(q => q.id === targetId);
    if (targetIdx < 0) return;

    if (targetIdx === 0) {
      const ov0 = Math.round((nextSlots[0].w * pct) / 100);
      nextSlots[0].blend!.l = ov0;
    } else {
      for (let i = targetIdx; i < nextSlots.length; i++) {
        const cur = nextSlots[i];
        const prev = nextSlots[i - 1];
        const axis = i === targetIdx && forceAxis
          ? forceAxis
          : (nextAxisMap[cur.id] ?? getSlotAxis(slots[i], slots[i - 1]));
        const curPct = nextMap[cur.id] ?? (
          axis === 'v'
            ? Math.round(((cur.blend?.t ?? 0) / Math.max(1, cur.h)) * 100)
            : Math.round(((cur.blend?.l ?? 0) / Math.max(1, cur.w)) * 100)
        );

        if (axis === 'v') {
          const ovPxY = Math.min(prev.h - 1, cur.h - 1, Math.round((cur.h * curPct) / 100));
          cur.x = prev.x;
          cur.y = Math.max(0, prev.y + prev.h - ovPxY);
          cur.blend!.t = ovPxY;
          cur.blend!.l = 0;
          prev.blend!.b = ovPxY;
          if (i === targetIdx) prev.blend!.r = 0;
        } else {
          const ovPxX = Math.min(prev.w - 1, cur.w - 1, Math.round((cur.w * curPct) / 100));
          cur.x = Math.max(0, prev.x + prev.w - ovPxX);
          cur.y = prev.y;
          cur.blend!.l = ovPxX;
          cur.blend!.t = 0;
          prev.blend!.r = ovPxX;
          if (i === targetIdx) prev.blend!.b = 0;
        }
      }
    }

    setBlendControlMode('manual');
    setSlots(nextSlots);
    const totalW = Math.max(...nextSlots.map(q => q.x + q.w));
    const totalH = Math.max(...nextSlots.map(q => q.y + q.h));
    setContent({ w: totalW, h: totalH });
  };

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
    const refW = slots[0]?.w || 1920;
    const refH = slots[0]?.h || 1080;
    const next = [...slots, { id, label: `Projektör ${n}`, x: 0, y: 0, w: refW, h: refH }];
    if (blendControlMode === 'auto') {
      applyAutoOverlapLayout(next);
    } else {
      setSlots(next);
    }
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

        {/* Otomatik Overlap & Blend Hesaplayıcı */}
        <div className="p-2.5 rounded border border-indigo-800/70 bg-slate-950 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-indigo-300 text-[11px]">Overlap &amp; Blend Hesaplayıcı</span>
            <div className="flex rounded overflow-hidden border border-slate-700 text-[10px]">
              <button
                type="button"
                onClick={() => applyAutoOverlapLayout(slots)}
                className={`px-2 py-0.5 font-semibold ${blendControlMode === 'auto' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Otomatik
              </button>
              <button
                type="button"
                onClick={() => setBlendControlMode('manual')}
                className={`px-2 py-0.5 font-semibold ${blendControlMode === 'manual' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Manuel
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {[0, 10, 15, 20, 25].map(pct => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  setBlendUnit('percent');
                  setOverlapXInput(pct);
                  applyAutoOverlapLayout(slots, { unit: 'percent', ovX: pct });
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                  blendControlMode === 'auto' && blendUnit === 'percent' && overlapXInput === pct
                    ? 'bg-sky-700 border-sky-400 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                %{pct}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const nextUnit = blendUnit === 'percent' ? 'pixel' : 'percent';
                const sampleW = slots[0]?.w || 1920;
                const convertedX = nextUnit === 'pixel'
                  ? Math.round((sampleW * overlapXInput) / 100)
                  : Math.round((overlapXInput / Math.max(1, sampleW)) * 100);
                setBlendUnit(nextUnit);
                setOverlapXInput(convertedX);
                if (blendControlMode === 'auto') {
                  applyAutoOverlapLayout(slots, { unit: nextUnit, ovX: convertedX });
                }
              }}
              className="ml-auto px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-sky-300 hover:bg-slate-700"
              title="Yüzde (%) veya Piksel (px) birimi arasında geçiş yap"
            >
              Birim: {blendUnit === 'percent' ? '%' : 'px'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <label className="text-[10.5px] text-slate-300">
              Yatay Blend ({blendUnit === 'percent' ? '%' : 'px'})
              <input
                className="inp font-mono"
                type="number"
                min="0"
                step={blendUnit === 'percent' ? '1' : '10'}
                value={overlapXInput}
                onChange={e => {
                  const val = Math.max(0, +e.target.value || 0);
                  setOverlapXInput(val);
                  applyAutoOverlapLayout(slots, { ovX: val });
                }}
              />
            </label>
            <label className="text-[10.5px] text-slate-300">
              Dikey Blend ({blendUnit === 'percent' ? '%' : 'px'})
              <input
                className="inp font-mono"
                type="number"
                min="0"
                step={blendUnit === 'percent' ? '1' : '10'}
                value={overlapYInput}
                onChange={e => {
                  const val = Math.max(0, +e.target.value || 0);
                  setOverlapYInput(val);
                  applyAutoOverlapLayout(slots, { ovY: val });
                }}
              />
            </label>
            <label className="text-[10.5px] text-slate-300">
              Yatay Sütun
              <select
                className="inp"
                value={autoCols}
                onChange={e => {
                  const c = +e.target.value;
                  setAutoCols(c);
                  applyAutoOverlapLayout(slots, { cols: c });
                }}
              >
                <option value={0}>Tek Sıra ({slots.length})</option>
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <option key={n} value={n}>{n} Sütun</option>
                ))}
              </select>
            </label>
          </div>

          {slots[0] && (
            <div className="text-[10.5px] font-mono text-emerald-400 bg-slate-900/90 px-2 py-1 rounded flex justify-between items-center">
              <span>
                Hesaplanan Yatay Blend:{' '}
                <b>
                  {blendUnit === 'percent'
                    ? `${Math.round((slots[0].w * overlapXInput) / 100)} px (%${overlapXInput})`
                    : `${overlapXInput} px (%${Math.round((overlapXInput / Math.max(1, slots[0].w)) * 100)})`}
                </b>
              </span>
              <span className="text-slate-400">{blendControlMode === 'auto' ? 'Otomatik' : 'Manuel'}</span>
            </div>
          )}
        </div>

        {/* Ekranlar / Çıkışlar Listesi */}
        <div className="flex justify-between items-center pt-1">
          <b className="text-slate-200">Çıkış Ekranları / Projektörler</b>
          <button className="px-2.5 py-0.5 bg-sky-700 hover:bg-sky-600 rounded text-white" onClick={add}>+ Çıkış Ekle</button>
        </div>
        <div className="space-y-1">
          {slots.map((x, idx) => {
            const prevX = idx > 0 ? slots[idx - 1] : undefined;
            const axis = idx > 0 ? getSlotAxis(x, prevX) : 'h';
            const curPct = slotPctMap[x.id] ?? (
              idx === 0
                ? 0
                : axis === 'v'
                  ? Math.round(((x.blend?.t ?? 0) / Math.max(1, x.h)) * 100)
                  : Math.round(((x.blend?.l ?? 0) / Math.max(1, x.w)) * 100)
            );
            return (
            <div key={x.id} onClick={() => setSel(x.id)} className={`px-2 py-1.5 rounded cursor-pointer flex justify-between items-center gap-2 ${sel === x.id ? 'bg-sky-950/80 border border-sky-400' : 'bg-slate-800 hover:bg-slate-750'}`}>
              <div className="min-w-0 truncate">
                <span className="font-semibold text-slate-200">{x.label}</span>
                {x.output && <span className="ml-1.5 text-[10px] px-1 py-0.5 bg-slate-700 text-sky-300 rounded font-mono">{x.output}</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => applyPerSlotPct(x.id, curPct, axis === 'h' ? 'v' : 'h')}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      axis === 'v'
                        ? 'bg-indigo-800 border-indigo-500 text-white'
                        : 'bg-sky-900/80 border-sky-600 text-sky-200'
                    }`}
                    title={axis === 'v' ? 'Dikey (Alt Alta) — Yataya çevirmek için tıkla' : 'Yatay (Yan Yana) — Dikeye çevirmek için tıkla'}
                  >
                    {axis === 'v' ? '↓ Dikey' : '→ Yatay'}
                  </button>
                )}
                <label className="flex items-center gap-0.5 text-[10px] text-amber-300 bg-slate-900/90 border border-slate-700 rounded px-1 py-0.5" title="Bu projektörün kendi overlap/blend yüzdesi (%)">
                  <span>%</span>
                  <input
                    type="number"
                    min="0"
                    max="80"
                    value={curPct}
                    onChange={e => applyPerSlotPct(x.id, Math.max(0, Math.min(80, +e.target.value || 0)))}
                    className="w-9 bg-transparent text-right font-mono font-bold text-amber-300 focus:outline-none"
                  />
                </label>
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
            );
          })}
        </div>

        {/* Seçili Ekran Detayları */}
        {s && (
          <div className="border border-slate-700 rounded p-2.5 bg-slate-950 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <label>Etiket / İsim<input className="inp" value={s.label} onChange={e => update(s.id, { label: e.target.value })} /></label>
              <label>Donanım Çıkışı (Port)<input className="inp" placeholder="Örn: GPU-1 Out 1" value={s.output ?? ''} onChange={e => update(s.id, { output: e.target.value })} /></label>
              {nf('Başlangıç X (px)', 'x')}{nf('Başlangıç Y (px)', 'y')}{nf('Genişlik W (px)', 'w')}{nf('Yükseklik H (px)', 'h')}
            </div>
            <div className="text-[11px] font-mono text-sky-300 bg-slate-900/80 px-2 py-1 rounded border border-slate-800 flex justify-between">
              <span>Başlangıç: ({s.x}, {s.y}) px</span>
              <span>Bitiş: ({s.x + s.w}, {s.y + s.h}) px</span>
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

            <div className="border-t border-slate-800 pt-2 space-y-2">
              <div className="text-slate-400 font-semibold">2. Kenar Harmanlama &amp; Projektör Bazlı Hizalama</div>

              {slots.length > 1 && (() => {
                const otherSlots = slots.filter(q => q.id !== s.id);
                const sIdx = slots.findIndex(q => q.id === s.id);
                const defaultRef = sIdx > 0 ? slots[sIdx - 1].id : otherSlots[0]?.id;
                const refId = slotRefMap[s.id] && otherSlots.some(q => q.id === slotRefMap[s.id])
                  ? slotRefMap[s.id]
                  : defaultRef;
                const pjPct = slotPctMap[s.id] ?? 15;
                const curAxis = getSlotAxis(s, sIdx > 0 ? slots[sIdx - 1] : undefined);
                const calcPxW = Math.round(((curAxis === 'v' ? s.h : s.w) * pjPct) / 100);
                return (
                  <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5 text-[10.5px]">
                      <span className="text-sky-300 font-semibold">Bu Projektörü Bağla / Yasla:</span>
                      <span className="font-mono text-emerald-400">%{pjPct} = {calcPxW} px</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        className="inp text-[11px]"
                        value={refId}
                        onChange={e => setSlotRefMap(prev => ({ ...prev, [s.id]: e.target.value }))}
                      >
                        {otherSlots.map(o => (
                          <option key={o.id} value={o.id}>Referans: {o.label}</option>
                        ))}
                      </select>
                      <input
                        className="inp font-mono text-[11px]"
                        type="number"
                        min="0"
                        max="80"
                        value={pjPct}
                        onChange={e => {
                          const vPct = Math.max(0, Math.min(80, +e.target.value || 0));
                          setSlotPctMap(prev => ({ ...prev, [s.id]: vPct }));
                        }}
                        title="Bu projektör için Blend (%)"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[0, 10, 15, 20, 25].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            setSlotPctMap(prev => ({ ...prev, [s.id]: pct }));
                            snapSlotToRef(s.id, refId, curAxis === 'v' ? 'bottom' : 'right', pct);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] border ${
                            pjPct === pct
                              ? 'bg-sky-700 border-sky-400 text-white'
                              : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          %{pct}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => snapSlotToRef(s.id, refId, 'right', pjPct)}
                        className="px-1.5 py-1 rounded bg-sky-800 hover:bg-sky-700 text-white text-[10px] font-semibold"
                      >
                        → Sağına Yasla
                      </button>
                      <button
                        type="button"
                        onClick={() => snapSlotToRef(s.id, refId, 'bottom', pjPct)}
                        className="px-1.5 py-1 rounded bg-indigo-800 hover:bg-indigo-700 text-white text-[10px] font-semibold"
                      >
                        ↓ Altına Yasla
                      </button>
                      <button
                        type="button"
                        onClick={() => snapSlotToRef(s.id, refId, 'detach', 0)}
                        className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-semibold border border-slate-700"
                        title="Bu projektörü bağımsız (ayrı) yap ve kenar blendini sıfırla"
                      >
                        Bağımsız (Ayrı)
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-4 gap-1">{blendField('Sol', 'l')}{blendField('Sağ', 'r')}{blendField('Üst', 't')}{blendField('Alt', 'b')}</div>
            </div>

            {/* 3. Keystone Düzeltmesi */}
            <div className="border-t border-slate-800 pt-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-semibold">3. Keystone Düzeltmesi (Açı &amp; Shift)</span>
                <button
                  type="button"
                  onClick={() => update(s.id, { keystone: { vDeg: 0, hDeg: 0, useOpticalShift: false } })}
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  Sıfırla
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-xs">
                  Dikey Keystone (°)
                  <input
                    className="inp font-mono"
                    type="number"
                    min="-40"
                    max="40"
                    step="1"
                    value={s.keystone?.vDeg ?? 0}
                    onChange={e =>
                      update(s.id, {
                        keystone: {
                          vDeg: Math.max(-40, Math.min(40, +e.target.value || 0)),
                          hDeg: s.keystone?.hDeg ?? 0,
                          useOpticalShift: s.keystone?.useOpticalShift ?? false,
                        },
                      })
                    }
                  />
                </label>
                <label className="text-xs">
                  Yatay Keystone (°)
                  <input
                    className="inp font-mono"
                    type="number"
                    min="-40"
                    max="40"
                    step="1"
                    value={s.keystone?.hDeg ?? 0}
                    onChange={e =>
                      update(s.id, {
                        keystone: {
                          vDeg: s.keystone?.vDeg ?? 0,
                          hDeg: Math.max(-40, Math.min(40, +e.target.value || 0)),
                          useOpticalShift: s.keystone?.useOpticalShift ?? false,
                        },
                      })
                    }
                  />
                </label>
              </div>
              <label className="flex items-center gap-1.5 text-[10.5px] text-emerald-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(s.keystone?.useOpticalShift)}
                  onChange={e =>
                    update(s.id, {
                      keystone: {
                        vDeg: s.keystone?.vDeg ?? 0,
                        hDeg: s.keystone?.hDeg ?? 0,
                        useOpticalShift: e.target.checked,
                      },
                    })
                  }
                  className="accent-emerald-500"
                />
                <span>Optik Lens Shift Kullanılıyor (Dijital piksel kaybı %0)</span>
              </label>
            </div>

            {/* 4. Warp / Mesh Mapping & Surface Mapping */}
            <div className="border-t border-slate-800 pt-2 space-y-1.5">
              <div className="text-slate-400 font-semibold">4. Warp / Mesh &amp; Surface Mapping</div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-xs">
                  Yüzey Geometrisi
                  <select
                    className="inp"
                    value={s.surfaceGeometry ?? 'flat'}
                    onChange={e =>
                      update(s.id, {
                        surfaceGeometry: e.target.value as MappingSurfaceGeometry,
                      })
                    }
                  >
                    <option value="flat">Düz Yüzey (Planar)</option>
                    <option value="concave_arc">İçbükey Kavis (Concave Arc)</option>
                    <option value="convex_arc">Dışbükey Kavis (Convex Arc)</option>
                    <option value="cylinder_360">360° Silindir</option>
                    <option value="dome">Kubbe / Fulldome</option>
                    <option value="corner_l">Çoklu Köşe / L-Duvar</option>
                  </select>
                </label>
                <label className="text-xs">
                  Mesh Izgara (Warp Grid)
                  <select
                    className="inp"
                    value={s.warp ? `${s.warp.cols}x${s.warp.rows}` : 'none'}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'none') {
                        update(s.id, { warp: undefined });
                      } else {
                        const [c, r] = val.split('x').map(Number);
                        update(s.id, { warp: createUniformWarp(s.w, s.h, c, r) });
                      }
                    }}
                  >
                    <option value="none">Warp Yok</option>
                    <option value="2x2">2×2 Mesh (9 nokta)</option>
                    <option value="3x3">3×3 Mesh (16 nokta)</option>
                    <option value="4x4">4×4 Mesh (25 nokta)</option>
                    <option value="6x6">6×6 Mesh (49 nokta)</option>
                  </select>
                </label>
              </div>
              {s.surfaceGeometry && s.surfaceGeometry !== 'flat' && (
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-xs">
                    Kavis Yarıçapı R (m)
                    <input
                      className="inp font-mono"
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={s.surfaceRadiusM ?? 5}
                      onChange={e => update(s.id, { surfaceRadiusM: Math.max(0.5, +e.target.value || 5) })}
                    />
                  </label>
                  <label className="text-xs">
                    Kavis Açısı (°)
                    <input
                      className="inp font-mono"
                      type="number"
                      step="5"
                      min="10"
                      max="360"
                      value={s.surfaceAngleDeg ?? 90}
                      onChange={e => update(s.id, { surfaceAngleDeg: Math.max(10, Math.min(360, +e.target.value || 90)) })}
                    />
                  </label>
                </div>
              )}
              <div className="flex flex-wrap gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => update(s.id, { warp: createUniformWarp(s.w, s.h, 4, 4) })}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Düz 4×4
                </button>
                <button
                  type="button"
                  onClick={() => update(s.id, { warp: createCurvedWarp(s.w, s.h, 4, 4, 12, 'concave'), surfaceGeometry: 'concave_arc' })}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-sky-950/70 border border-sky-700/70 text-sky-300 hover:bg-sky-900"
                >
                  İçbükey Warp
                </button>
                <button
                  type="button"
                  onClick={() => update(s.id, { warp: createCurvedWarp(s.w, s.h, 4, 4, 12, 'convex'), surfaceGeometry: 'convex_arc' })}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-950/70 border border-indigo-700/70 text-indigo-300 hover:bg-indigo-900"
                >
                  Dışbükey Warp
                </button>
                <button
                  type="button"
                  onClick={() => update(s.id, { warp: createCurvedWarp(s.w, s.h, 4, 4, 15, 'keystone') })}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/70 border border-amber-700/70 text-amber-300 hover:bg-amber-900"
                >
                  Keystone Pin
                </button>
              </div>
            </div>

            {/* 5. Gelişmiş Maskeleme (Poligon & Bezier Maske) */}
            <div className="border-t border-slate-800 pt-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-semibold">5. Gelişmiş Maskeleme (Poligon / Bezier)</span>
                <span className="text-[10px] font-mono text-slate-400">
                  {s.polygonMask?.length ? `${s.polygonMask.length} nokta` : s.bezierMask?.length ? 'Bezier Aktif' : 'Yok'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setPolyDrawMode(v => !v)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    polyDrawMode
                      ? 'bg-amber-600 border-amber-400 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {polyDrawMode ? '✓ Poligon Çizimi Açık (Canvas’a Tıkla)' : '✏️ Poligon Maske Çiz'}
                </button>
                <button
                  type="button"
                  onClick={() => update(s.id, { bezierMask: createDefaultBezierMask(s.w, s.h, 0.08) })}
                  className="px-2 py-0.5 rounded text-[10px] bg-rose-950/70 border border-rose-700/70 text-rose-300 hover:bg-rose-900"
                >
                  ⭕ Eliptik Bezier Maske
                </button>
                {(s.polygonMask || s.bezierMask) && (
                  <button
                    type="button"
                    onClick={() => {
                      setPolyDrawMode(false);
                      update(s.id, { polygonMask: undefined, bezierMask: undefined });
                    }}
                    className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Temizle
                  </button>
                )}
              </div>
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

        {/* 8 Adımlı Pixel Map & Çözünürlük Hesap Zinciri (Toplam Sonuç Özeti) */}
        {L && pixelMapSummary && (
          <div className="bg-slate-900 border border-emerald-800/70 rounded p-2.5 text-xs space-y-2">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-1.5">
              <span className="font-bold text-emerald-400">
                📐 8 Adımlı Pixel Map &amp; Çözünürlük Hesap Zinciri (Toplam Sonuç Özeti)
              </span>
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                <label className="flex items-center gap-1">
                  <span>Duvar En (m):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={summaryWallW}
                    onChange={e => setSummaryWallW(Math.max(0.5, +e.target.value || 1))}
                    className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 font-mono text-sky-300"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span>Duvar Boy (m):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={summaryWallH}
                    onChange={e => setSummaryWallH(Math.max(0.5, +e.target.value || 1))}
                    className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 font-mono text-sky-300"
                  />
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-left border-collapse">
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">1. Projektör Native Çözünürlüğü</td>
                    <td className="py-1 font-mono text-sky-300"><b>{pixelMapSummary.nativeW} × {pixelMapSummary.nativeH} px</b> ({pixelMapSummary.nativeMP} MP)</td>
                    <td className="py-1 text-right text-[10.5px] text-slate-400">{pixelMapSummary.projectorCount} Adet Çıkış</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">2. Görüntünün Fiziksel Piksel Yoğunluğu</td>
                    <td className="py-1 font-mono text-emerald-300">
                      {pixelMapSummary.pxPerM2 !== null ? <><b>{pixelMapSummary.pxPerM2.toLocaleString('tr-TR')} px/m²</b> · {pixelMapSummary.ppi} PPI</> : '—'}
                    </td>
                    <td className="py-1 text-right text-[10.5px] text-slate-400">
                      {pixelMapSummary.pxPerCm !== null ? `${pixelMapSummary.pxPerCm} px/cm` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">3. Pixel per Meter (px/m)</td>
                    <td className="py-1 font-mono text-sky-300">
                      {pixelMapSummary.pxPerMeterW !== null ? <>Yatay: <b>{pixelMapSummary.pxPerMeterW} px/m</b> · Dikey: <b>{pixelMapSummary.pxPerMeterH} px/m</b></> : '—'}
                    </td>
                    <td className="py-1 text-right text-[10.5px] text-slate-400">
                      {pixelMapSummary.avgPxPerMeter !== null ? `Ortalama: ${pixelMapSummary.avgPxPerMeter} px/m` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">4. Piksel Aralığı (mm/px)</td>
                    <td className="py-1 font-mono text-amber-300">
                      {pixelMapSummary.avgMmPerPx !== null ? <>Ort: <b>{pixelMapSummary.avgMmPerPx} mm/px</b> (W: {pixelMapSummary.mmPerPxW} / H: {pixelMapSummary.mmPerPxH})</> : '—'}
                    </td>
                    <td className="py-1 text-right text-[10.5px] text-slate-400">Piksel Pitch</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">5. Duvarın Toplam Piksel Karşılığı</td>
                    <td className="py-1 font-mono text-slate-200">
                      {pixelMapSummary.wallAspectPixelsW !== null ? <b>{pixelMapSummary.wallAspectPixelsW} × {pixelMapSummary.wallAspectPixelsH} px</b> : '—'}
                    </td>
                    <td className="py-1 text-right text-[10.5px] text-slate-400">
                      {pixelMapSummary.wallWidthM && pixelMapSummary.wallHeightM ? `${pixelMapSummary.wallWidthM}m × ${pixelMapSummary.wallHeightM}m` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">6. Çoklu Projektörlerde Birleşik Çözünürlük</td>
                    <td className="py-1 font-mono text-sky-300"><b>{pixelMapSummary.combinedW} × {pixelMapSummary.combinedH} px</b> ({pixelMapSummary.combinedMP} MP)</td>
                    <td className="py-1 text-right text-[10.5px] text-slate-400">Ham Toplam: {pixelMapSummary.rawTotalW} × {pixelMapSummary.rawTotalH} px</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">7. Overlap Nedeniyle Kaybedilen Efektif Alan</td>
                    <td className="py-1 font-mono text-amber-300">
                      Yatay -{pixelMapSummary.lostPxW} px · Dikey -{pixelMapSummary.lostPxH} px (<b>-%{pixelMapSummary.lostOverlapPct}</b>)
                    </td>
                    <td className="py-1 text-right font-mono text-[10.5px] text-amber-400">
                      -{(pixelMapSummary.lostOverlapPixels / 1_000_000).toFixed(2)} MP
                      {pixelMapSummary.lostAreaM2 !== null ? ` · -${pixelMapSummary.lostAreaM2} m²` : ''}
                    </td>
                  </tr>
                  <tr className="bg-emerald-950/50 border-t-2 border-emerald-700/70">
                    <td className="py-1.5 pr-2 font-bold text-emerald-300">8. TOPLAM İÇERİK ÜRETİM ÇÖZÜNÜRLÜĞÜ</td>
                    <td className="py-1.5 font-mono font-extrabold text-emerald-300">
                      {pixelMapSummary.contentProductionW} × {pixelMapSummary.contentProductionH} px ({pixelMapSummary.contentProductionMP} MP)
                    </td>
                    <td className="py-1.5 text-right font-mono text-emerald-200">
                      Oran {pixelMapSummary.contentAspect}:1 · Kanvas {pixelMapSummary.combinedW}×{pixelMapSummary.combinedH}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7 Adımlı Geometrik Düzeltme & Mapping Hesap Zinciri */}
        {L && geometricMappingSummary && (
          <div className="bg-slate-900 border border-indigo-800/70 rounded p-2.5 text-xs space-y-2">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-1.5">
              <span className="font-bold text-indigo-300">
                🎯 7 Adımlı Geometrik Düzeltme &amp; Mapping Hesap Zinciri (Toplam Kalite Özeti)
              </span>
              <span className={`px-2 py-0.5 rounded font-mono text-[10.5px] font-bold ${
                geometricMappingSummary.distortionSeverity === 'low'
                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
                  : geometricMappingSummary.distortionSeverity === 'moderate'
                    ? 'bg-amber-950/70 text-amber-300 border border-amber-800'
                    : 'bg-rose-950/70 text-rose-300 border border-rose-800'
              }`}>
                {geometricMappingSummary.qualityGrade}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-left border-collapse">
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">1. Keystone Düzeltmesi</td>
                    <td className="py-1 font-mono text-amber-300">
                      Dikey: ±{geometricMappingSummary.maxKeystoneVDeg}° · Yatay: ±{geometricMappingSummary.maxKeystoneHDeg}°
                      {geometricMappingSummary.opticalShiftActive ? ' (Optik Lens Shift)' : ''}
                    </td>
                    <td className="py-1 text-right font-mono text-[10.5px] text-amber-400">
                      Trapez Daralma: %{geometricMappingSummary.trapezoidShrinkPct} · Kayıp: -%{geometricMappingSummary.keystonePixelLossPct}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">2. Warp / Mesh Mapping</td>
                    <td className="py-1 font-mono text-sky-300">
                      {geometricMappingSummary.meshGridLabel} ({geometricMappingSummary.activeWarpSlots} aktif PJ)
                    </td>
                    <td className="py-1 text-right font-mono text-[10.5px] text-sky-300">
                      Ort. Sapma: {geometricMappingSummary.avgWarpDisplacementPx} px (-%{geometricMappingSummary.warpPixelLossPct})
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">3. Surface Mapping</td>
                    <td className="py-1 font-mono text-slate-200">
                      {geometricMappingSummary.surfaceGeometryLabel}
                    </td>
                    <td className="py-1 text-right font-mono text-[10.5px] text-slate-400">
                      Açınım: {geometricMappingSummary.effectiveWidthM}m · Kiriş: {geometricMappingSummary.chordWidthM}m · Kavis: {geometricMappingSummary.sagittaM}m
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">4. Masking (Kırpma &amp; Maske)</td>
                    <td className="py-1 font-mono text-rose-300">
                      Kırpma: {geometricMappingSummary.croppedPixels.toLocaleString('tr-TR')} px · Poligon: {geometricMappingSummary.polygonMaskCount} · Bezier: {geometricMappingSummary.bezierMaskCount}
                    </td>
                    <td className="py-1 text-right font-mono text-[10.5px] text-emerald-300">
                      Maskeli Kayıp: -%{geometricMappingSummary.maskedOutPct} · Aktif: <b>%{geometricMappingSummary.visibleActivePct}</b>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">5. Edge Blending</td>
                    <td className="py-1 font-mono text-sky-300">
                      {geometricMappingSummary.overlapZoneCount} Bölge · Yatay {geometricMappingSummary.blendWidthPxX}px ({geometricMappingSummary.blendPhysicalWidthM}m) · Dikey {geometricMappingSummary.blendWidthPxY}px
                    </td>
                    <td className="py-1 text-right font-mono text-[10.5px] text-sky-300">
                      γ={geometricMappingSummary.gamma} · Orta Nokta: %{geometricMappingSummary.midpointDrivePct}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">6. Geometrik Bozulma Analizi</td>
                    <td className="py-1 font-mono text-amber-300">
                      Anizotropi: {geometricMappingSummary.pixelAnisotropyRatio}:1 · Köşe Gerilimi: %{geometricMappingSummary.cornerStretchPct} · Odak Farkı: {geometricMappingSummary.depthOfFieldSpreadM}m
                    </td>
                    <td className="py-1 text-right text-[10.5px] text-slate-300">
                      {geometricMappingSummary.distortionLabel}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold text-slate-200">7. Çoklu Yüzey Eşleştirme</td>
                    <td className="py-1 font-mono text-indigo-300">
                      {geometricMappingSummary.matchedSurfacesCount} / {geometricMappingSummary.totalSurfacesCount} Yüzey · {geometricMappingSummary.seamTransitionCount} Geçiş
                    </td>
                    <td className="py-1 text-right font-mono text-[10.5px] text-indigo-300">
                      Sapma: %{geometricMappingSummary.densitySpreadPct} ({geometricMappingSummary.multiSurfaceStatus})
                    </td>
                  </tr>
                  <tr className="bg-indigo-950/50 border-t-2 border-indigo-700/70">
                    <td className="py-1.5 pr-2 font-bold text-indigo-300">8. TOPLAM EFEKTİF ÇÖZÜNÜRLÜK &amp; VERİM</td>
                    <td className="py-1.5 font-mono font-extrabold text-emerald-300">
                      {geometricMappingSummary.effectiveResolutionW} × {geometricMappingSummary.effectiveResolutionH} px ({geometricMappingSummary.effectiveUsableMP} MP aktif)
                    </td>
                    <td className="py-1.5 text-right font-mono font-bold text-indigo-200">
                      Geometrik Verim: %{geometricMappingSummary.geometricEfficiencyPct} (Kayıp: -%{geometricMappingSummary.totalGeometricLossPct})
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Eklenen Tüm Duvarlar / Ekranlar (Alt Alta Ayrı Alanlar) */}
        <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="text-xs font-semibold text-sky-300">
              Eklenen Duvarlar / Ekranlar ({screens.length})
            </span>
            <span className="text-[11px] text-slate-400">
              Düzenlemek için duvar kartına tıklayın; önceki duvarlar kaybolmaz.
            </span>
          </div>
          <div className="space-y-2">
            {screens.map((sc, idx) => {
              const isAct = sc.id === activeScreen?.id;
              let scLayout = null as ReturnType<typeof computeLayout> | null;
              if (sc.slots.length > 0) {
                try { scLayout = computeLayout(sc.slots); } catch { scLayout = null; }
              }
              return (
                <div
                  key={sc.id}
                  onClick={() => { selectScreen(sc.id); setView(null); setSel(sc.slots[0]?.id ?? null); }}
                  className={`rounded border p-2.5 cursor-pointer transition space-y-2 ${
                    isAct ? 'bg-sky-950/40 border-sky-500' : 'bg-slate-950 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">#{idx + 1}</span>
                      <span className="font-bold text-slate-100">{sc.name}</span>
                      {isAct && <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[10px] font-semibold">Aktif Düzenlenen</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-emerald-400">
                        {scLayout ? `${scLayout.canvasW}×${scLayout.canvasH} px · ${sc.slots.length} Projektör` : `${sc.slots.length} Projektör`}
                      </span>
                      <label className="flex items-center gap-1 text-[11px] text-slate-300" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={sc.includeInReport}
                          onChange={e => updateScreen(sc.id, { includeInReport: e.target.checked })}
                          className="accent-emerald-500"
                        />
                        Rapora Dahil
                      </label>
                    </div>
                  </div>
                  {(sc.photoUrl || scLayout) && (
                    <div className="grid sm:grid-cols-[120px_1fr] gap-2 items-center">
                      {sc.photoUrl && (
                        <img src={sc.photoUrl} alt={sc.name} className="w-full h-16 object-contain rounded bg-black/50 border border-slate-800" />
                      )}
                      {scLayout && (
                        <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-1.5">
                          {sc.slots.map(sl => (
                            <span key={sl.id} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                              {sl.label}: {sl.w}×{sl.h} @ ({sl.x},{sl.y})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
