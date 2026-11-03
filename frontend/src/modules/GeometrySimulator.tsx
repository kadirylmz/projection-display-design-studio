import { useMemo, useRef, useState } from 'react';
import { PRESET_ASPECTS } from '../engine/aspect';
import { solveProjection } from '../engine/throw';
import { LengthUnit, fromMeters, round, toMeters } from '../engine/units';
import { download, svgToPng } from '../util';

type ViewMode = 'side' | 'top' | 'front' | 'perspective';
type SurfaceTarget = 'wall' | 'floor' | 'ceiling';

export default function GeometrySimulator({ unit }: { unit: LengthUnit }) {
  const [view, setView] = useState<ViewMode>('side');
  const [surface, setSurface] = useState<SurfaceTarget>('wall');
  const [surfW, setSurfW] = useState(8);
  const [surfH, setSurfH] = useState(4.5);
  const [dist, setDist] = useState(6);
  const [tr, setTr] = useState(1.5);
  const [ar, setAr] = useState('16:9');
  const [hOff, setHOff] = useState(0);
  const [vOff, setVOff] = useState(0);
  const [mountH, setMountH] = useState(2.8);
  const [human, setHuman] = useState(true);
  const [bgPhoto, setBgPhoto] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const calc = useMemo(() => {
    try {
      const D = toMeters(dist, unit);
      const r = solveProjection({
        distance: D,
        throwRatio: tr,
        aspect: PRESET_ASPECTS[ar],
        horizontalOffset: toMeters(hOff, unit),
        verticalOffset: toMeters(vOff, unit),
      });
      const SW = toMeters(surfW, unit), SH = toMeters(surfH, unit);
      const fits = Math.abs(r.bounds.left) <= SW / 2 && Math.abs(r.bounds.right) <= SW / 2 && r.bounds.top - r.bounds.bottom <= SH;
      return { r, SW, SH, fits, err: null as string | null };
    } catch (e) { return { r: null, SW: 8, SH: 4.5, fits: false, err: (e as Error).message }; }
  }, [dist, tr, ar, hOff, vOff, surfW, surfH, unit]);

  const f = (m: number) => `${round(fromMeters(m, unit), 3)} ${unit}`;

  const onDragMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const nx = Math.max(0.08, Math.min(0.85, (e.clientX - rect.left) / rect.width));
    if (view === 'side' || view === 'top') {
      const newDistM = Math.max(0.5, (1 - nx) * toMeters(surfW, unit) * 1.4);
      setDist(round(fromMeters(newDistM, unit), 2));
    }
  };

  const exportScreenshot = async () => {
    if (!svgRef.current) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    const blob = await svgToPng(xml, 1920);
    download(`geometri-${view}.png`, blob);
  };

  const r = calc.r;

  return (
    <div className="grid lg:grid-cols-[330px_1fr] gap-4 h-full">
      <div className="space-y-2 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto text-xs">
        <h2 className="text-sm font-semibold">Projeksiyon Geometrisi Simülatörü</h2>
        <div className="flex gap-1 flex-wrap">
          {([['side', 'Yan'], ['top', 'Üst'], ['front', 'Ön'], ['perspective', 'Perspektif']] as [ViewMode, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`px-2.5 py-1 rounded ${view === k ? 'bg-sky-700 text-white' : 'bg-slate-800'}`}>{l} Görünüş</button>
          ))}
        </div>
        <label className="block">Projeksiyon Yüzeyi
          <select className="inp" value={surface} onChange={e => setSurface(e.target.value as SurfaceTarget)}>
            <option value="wall">Duvar Projeksiyonu</option>
            <option value="floor">Zemin (Floor) Projeksiyonu</option>
            <option value="ceiling">Tavan (Ceiling) Projeksiyonu</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>Yüzey Genişliği ({unit})<input className="inp" type="number" step="0.1" value={surfW} onChange={e => setSurfW(+e.target.value)} /></label>
          <label>Yüzey Yüksekliği ({unit})<input className="inp" type="number" step="0.1" value={surfH} onChange={e => setSurfH(+e.target.value)} /></label>
          <label>Lens Mesafesi ({unit})<input className="inp" type="number" step="0.1" value={dist} onChange={e => setDist(+e.target.value)} /></label>
          <label>Throw Ratio<input className="inp" type="number" step="0.05" value={tr} onChange={e => setTr(+e.target.value)} /></label>
          <label>Yatay Shift ({unit})<input className="inp" type="number" step="0.05" value={hOff} onChange={e => setHOff(+e.target.value)} /></label>
          <label>Dikey Shift ({unit})<input className="inp" type="number" step="0.05" value={vOff} onChange={e => setVOff(+e.target.value)} /></label>
          <label>Montaj Yüksekliği ({unit})<input className="inp" type="number" step="0.1" value={mountH} onChange={e => setMountH(+e.target.value)} /></label>
          <label>En-Boy Oranı<select className="inp" value={ar} onChange={e => setAr(e.target.value)}>{Object.keys(PRESET_ASPECTS).map(k => <option key={k}>{k}</option>)}</select></label>
        </div>
        <label className="flex items-center gap-2 pt-1"><input type="checkbox" checked={human} onChange={e => setHuman(e.target.checked)} /> İnsan ölçek referansı (1.75 m)</label>
        <div className="pt-1 space-y-1">
          <label className="block px-2 py-1 bg-slate-800 rounded cursor-pointer text-center">
            Gerçek Oda Fotoğrafı Yükle (Ön/Perspektif Bindirme)
            <input type="file" accept="image/*" hidden onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const rd = new FileReader();
              rd.onload = () => setBgPhoto(rd.result as string);
              rd.readAsDataURL(file);
            }} />
          </label>
          {bgPhoto && <button className="w-full px-2 py-1 bg-slate-800 rounded text-amber-400" onClick={() => setBgPhoto(null)}>Fotoğrafı Kaldır</button>}
        </div>
        <button className="w-full px-3 py-1.5 bg-sky-700 rounded text-white font-semibold" onClick={exportScreenshot}>Sahne Ekran Görüntüsü İndir (PNG)</button>
        <p className="text-[11px] text-slate-400">İpucu: Yan ve Üst görünüşte projektör noktasını fareyle sürükleyerek mesafeyi gerçek zamanlı değiştirebilirsiniz.</p>
      </div>

      <div className="space-y-3 min-w-0">
        {calc.err && <p className="text-red-400">{calc.err}</p>}
        {r && (
          <div className="grid sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-slate-400">Görüntü Boyutu</div><b>{f(r.imageWidth)} × {f(r.imageHeight)}</b></div>
            <div className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-slate-400">Diagonal</div><b>{f(r.diagonal)}</b></div>
            <div className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-slate-400">Optik Mesafe</div><b>{f(r.lensToSurface)}</b></div>
            <div className={`p-2 rounded border ${calc.fits ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300' : 'bg-amber-950/40 border-amber-700 text-amber-300'}`}>
              <div className="text-slate-400">Yüzey Sınır Kontrolü</div><b>{calc.fits ? 'Yüzey İçinde' : 'Yüzey Sınırını Aşıyor'}</b>
            </div>
          </div>
        )}

        {r && (
          <svg
            ref={svgRef}
            viewBox="0 0 900 520"
            className="w-full bg-slate-950 border border-slate-700 rounded select-none touch-none"
            onPointerMove={onDragMove}
            onPointerUp={() => { dragging.current = false; }}
          >
            {bgPhoto && (view === 'front' || view === 'perspective') && (
              <image href={bgPhoto} x="50" y="30" width="800" height="460" preserveAspectRatio="xMidYMid slice" opacity="0.55" />
            )}

            {(view === 'side' || view === 'top') && (() => {
              const spanM = Math.max(calc.SW * 1.4, r.lensToSurface * 1.15, 4);
              const scale = 680 / spanM;
              const xSurf = 780;
              const xProj = xSurf - r.lensToSurface * scale;
              const yMid = 260;
              const imgSpan = view === 'side' ? r.imageHeight : r.imageWidth;
              const surfSpan = view === 'side' ? calc.SH : calc.SW;
              const shiftM = toMeters(view === 'side' ? vOff : hOff, unit);
              const yTop = yMid - (shiftM + imgSpan / 2) * scale;
              const yBot = yMid - (shiftM - imgSpan / 2) * scale;
              return (
                <g>
                  <line x1={xSurf} y1={yMid - (surfSpan / 2) * scale} x2={xSurf} y2={yMid + (surfSpan / 2) * scale} stroke="#64748b" strokeWidth="6" />
                  <polygon points={`${xProj},${yMid} ${xSurf},${yTop} ${xSurf},${yBot}`} fill="#38bdf8" fillOpacity="0.18" stroke="#38bdf8" strokeWidth="2" />
                  <line x1={xProj} y1={yMid} x2={xSurf} y2={yMid} stroke="#f59e0b" strokeDasharray="6 4" />
                  <line x1={xSurf} y1={yTop} x2={xSurf} y2={yBot} stroke="#4ade80" strokeWidth="5" />
                  <g className="cursor-ew-resize" onPointerDown={e => { e.stopPropagation(); dragging.current = true; }}>
                    <rect x={xProj - 32} y={yMid - 14} width="32" height="28" rx="3" fill="#334155" stroke="#94a3b8" />
                    <circle cx={xProj} cy={yMid} r="7" fill="#f59e0b" />
                  </g>
                  {human && view === 'side' && (
                    <g transform={`translate(${xSurf - 70}, ${yMid + (surfSpan / 2) * scale - 1.75 * scale})`}>
                      <circle cx="0" cy={0.15 * scale} r={0.12 * scale} fill="#f87171" />
                      <line x1="0" y1={0.27 * scale} x2="0" y2={1.75 * scale} stroke="#f87171" strokeWidth="4" />
                    </g>
                  )}
                  <text x={(xProj + xSurf) / 2} y={yMid - 10} fill="#f59e0b" fontSize="13" textAnchor="middle">
                    {view === 'side' ? 'Yan Görünüş' : 'Üst Görünüş'} · Optik Eksen D = {f(r.lensToSurface)} ({surface})
                  </text>
                  <text x={xSurf + 12} y={(yTop + yBot) / 2} fill="#4ade80" fontSize="13">
                    {view === 'side' ? `H = ${f(r.imageHeight)}` : `W = ${f(r.imageWidth)}`}
                  </text>
                </g>
              );
            })()}

            {(view === 'front' || view === 'perspective') && (() => {
              const scale = Math.min(720 / calc.SW, 400 / calc.SH);
              const cx = 450, cy = 260;
              const sw = calc.SW * scale, sh = calc.SH * scale;
              const iw = r.imageWidth * scale, ih = r.imageHeight * scale;
              const ox = toMeters(hOff, unit) * scale, oy = -toMeters(vOff, unit) * scale;
              return (
                <g>
                  <rect x={cx - sw / 2} y={cy - sh / 2} width={sw} height={sh} fill={bgPhoto ? 'none' : '#0f172a'} stroke="#64748b" strokeWidth="2" strokeDasharray="6 4" />
                  {view === 'perspective' && (
                    <polygon points={`${cx},${cy + 210} ${cx + ox - iw / 2},${cy + oy + ih / 2} ${cx + ox + iw / 2},${cy + oy - ih / 2}`} fill="#38bdf8" fillOpacity="0.12" />
                  )}
                  <rect x={cx + ox - iw / 2} y={cy + oy - ih / 2} width={iw} height={ih} fill="#38bdf8" fillOpacity="0.22" stroke="#38bdf8" strokeWidth="2.5" />
                  {human && (
                    <g transform={`translate(${cx - sw / 2 + 35}, ${cy + sh / 2 - 1.75 * scale})`}>
                      <circle cx="0" cy={0.15 * scale} r={0.12 * scale} fill="#f87171" />
                      <line x1="0" y1={0.27 * scale} x2="0" y2={1.75 * scale} stroke="#f87171" strokeWidth="4" />
                    </g>
                  )}
                  <text x={cx} y={cy - sh / 2 - 10} fill="#cbd5e1" fontSize="13" textAnchor="middle">
                    Yüzey: {f(calc.SW)} × {f(calc.SH)} &nbsp;|&nbsp; Görüntü: {f(r.imageWidth)} × {f(r.imageHeight)}
                  </text>
                </g>
              );
            })()}
          </svg>
        )}
      </div>
    </div>
  );
}
