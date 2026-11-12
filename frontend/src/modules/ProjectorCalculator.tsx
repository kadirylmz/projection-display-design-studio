import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PRESET_ASPECTS,
  Aspect,
  diagonal,
  heightFromWidth,
  widthFromDiagonal,
  widthFromHeight,
} from '../engine/aspect';
import { solveProjection, ProjectionResult } from '../engine/throw';
import {
  LensRecord,
  STANDARD_LENS_PRESETS,
  distanceForLens,
  lensShiftLimits,
  lensThrowRange,
  sizeRangeForLens,
} from '../engine/lenses';
import { LengthUnit, fromMeters, toMeters, round } from '../engine/units';
import { api, CompatLens, ProjectorRecord } from '../api';
import { useProjectStore } from '../projectStore';
import { download, svgToPng } from '../util';
import {
  CATALOG_BRANDS,
  CATALOG_LENSES,
  CATALOG_PROJECTORS,
  getCompatibleCatalogLenses,
} from '../data/projectorCatalog';

type DiagramTab = 'standard' | 'geometry';
type GeoViewMode = 'side' | 'top' | 'front' | 'perspective';
type SurfaceTarget = 'wall' | 'floor' | 'ceiling';

type CalcMode = 'size2dist' | 'dist2size' | 'both2tr';
type SizeInputMode = 'w2h' | 'h2w' | 'd2wh' | 'wh2d';
const UNITS: LengthUnit[] = ['m', 'cm', 'mm', 'in', 'ft'];

interface UnifiedLens {
  id: string;
  dbId?: number;
  category: string;
  name: string;
  throwMin: number;
  throwMax: number;
  notes?: string;
  isDb?: boolean;
}

export default function ProjectorCalculator({ unit }: { unit: LengthUnit }) {
  // Ana hesaplama modu
  const [calcMode, setCalcMode] = useState<CalcMode>('size2dist');
  const [sizeMode, setSizeMode] = useState<SizeInputMode>('w2h');

  // Birim ve en-boy oranı
  const [inUnit, setInUnit] = useState<LengthUnit>(unit);
  const [ar, setAr] = useState('16:9');
  const [cw, setCw] = useState(16);
  const [ch, setCh] = useState(9);

  // Ekran boyutu girdileri (inUnit cinsinden)
  const [dimA, setDimA] = useState(4);
  const [dimB, setDimB] = useState(2.25);

  // Mesafe & Opsiyonel Hedef Mesafe (inUnit cinsinden)
  const [dist, setDist] = useState(6);
  const [targetDistFilter, setTargetDistFilter] = useState('');

  // Veritabanı ve Katalog projektör/lens seçimi
  const [projectors, setProjectors] = useState<ProjectorRecord[]>([]);
  const [allDbLenses, setAllDbLenses] = useState<LensRecord[]>([]);
  const [compat, setCompat] = useState<CompatLens[]>([]);
  const [pid, setPid] = useState<number | ''>('');
  const [lid, setLid] = useState<number | ''>('');
  const [catProjId, setCatProjId] = useState<string>('');
  const [catLensId, setCatLensId] = useState<string>('');
  const [customLensName, setCustomLensName] = useState<string>('');
  const [tableScope, setTableScope] = useState<'compat' | 'all'>('all');
  const [presetId, setPresetId] = useState<string>('std-125-160');
  const [apiConnected, setApiConnected] = useState(true);

  // Throw Ratio & Montaj Ofsetleri
  const [trMin, setTrMin] = useState(1.25);
  const [trMax, setTrMax] = useState(1.60);
  const [tr, setTr] = useState(1.42);
  const [vOff, setVOff] = useState(0);
  const [protr, setProtr] = useState(0);

  // JSON içe aktarma
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');

  // Gelişmiş Geometri & Perspektif Simülasyonu state'leri
  const [diagramTab, setDiagramTab] = useState<DiagramTab>('standard');
  const [expandedView, setExpandedView] = useState<'front' | 'side' | 'geometry' | null>(null);
  const [geoView, setGeoView] = useState<GeoViewMode>('side');
  const [surface, setSurface] = useState<SurfaceTarget>('wall');
  const [surfW, setSurfW] = useState(8);
  const [surfH, setSurfH] = useState(4.5);
  const [hOff, setHOff] = useState(0);
  const [human, setHuman] = useState(true);
  const [bgPhoto, setBgPhoto] = useState<string | null>(null);
  const geoSvgRef = useRef<SVGSVGElement>(null);
  const geoDragging = useRef(false);

  const reload = () =>
    Promise.all([api.projectors(), api.lenses()])
      .then(([p, l]) => {
        setProjectors(p);
        setAllDbLenses(l);
        setApiConnected(true);
      })
      .catch(() => setApiConnected(false));

  const applyCatalogFromStorage = () => {
    try {
      const raw = localStorage.getItem('selected_catalog_selection');
      if (raw) {
        localStorage.removeItem('selected_catalog_selection');
        const { projId, lensId } = JSON.parse(raw);
        if (projId) {
          handleCatalogProjectorChange(projId, lensId);
        }
      }
    } catch {}
  };

  useEffect(() => {
    reload();
    applyCatalogFromStorage();
    const onNav = () => applyCatalogFromStorage();
    window.addEventListener('navigate-module' as any, onNav);
    return () => window.removeEventListener('navigate-module' as any, onNav);
  }, []);

  const catProj = CATALOG_PROJECTORS.find(p => p.id === catProjId) ?? null;
  const catCompatLenses = useMemo(() => (catProj ? getCompatibleCatalogLenses(catProj) : []), [catProj]);

  const handleCatalogProjectorChange = (newProjId: string, preferredLensId?: string) => {
    setCatProjId(newProjId);
    setPid('');
    setLid('');
    if (!newProjId) {
      setCatLensId('');
      setTableScope('all');
      return;
    }
    const found = CATALOG_PROJECTORS.find(p => p.id === newProjId);
    if (!found) return;
    if (found.aspect && PRESET_ASPECTS[found.aspect]) {
      setAr(found.aspect);
    }
    const compatList = getCompatibleCatalogLenses(found);
    const chosen = (preferredLensId && compatList.find(l => l.id === preferredLensId)) || compatList[0];
    if (chosen) {
      setCatLensId(chosen.id);
      setPresetId('custom');
      setTrMin(chosen.throwMin);
      setTrMax(chosen.throwMax);
      setTr(round((chosen.throwMin + chosen.throwMax) / 2, 2));
    }
    setTableScope('compat');
  };

  const handleCatalogLensChange = (newLensId: string) => {
    setCatLensId(newLensId);
    const found = catCompatLenses.find(l => l.id === newLensId);
    if (found) {
      setPresetId('custom');
      setTrMin(found.throwMin);
      setTrMax(found.throwMax);
      setTr(round((found.throwMin + found.throwMax) / 2, 2));
    }
  };

  useEffect(() => {
    setLid('');
    setCompat([]);
    if (pid !== '') {
      api.compatLenses(pid).then(setCompat).catch(() => setCompat([]));
    }
  }, [pid]);

  const dbLens = compat.find(l => l.id === lid) ?? null;
  const proj = projectors.find(p => p.id === pid) ?? null;

  // Standart preset seçildiğinde trMin/trMax/tr güncelle
  const handlePresetChange = (newPresetId: string) => {
    setPresetId(newPresetId);
    if (newPresetId === 'custom') return;
    const found = STANDARD_LENS_PRESETS.find(p => p.id === newPresetId);
    if (found) {
      setTrMin(found.throwMin);
      setTrMax(found.throwMax);
      setTr(round((found.throwMin + found.throwMax) / 2, 2));
    }
  };

  // DB lensi seçildiğinde tr güncelle
  useEffect(() => {
    if (dbLens) {
      setTr(round((dbLens.throw_min + dbLens.throw_max) / 2, 2));
    }
  }, [dbLens]);

  const baseAspect: Aspect = ar === 'custom' ? { w: Math.max(0.01, cw), h: Math.max(0.01, ch) } : PRESET_ASPECTS[ar];

  // Ekran girdilerinden metre cinsinden W, H ve etkili aspect hesapla
  const screenDims = useMemo(() => {
    try {
      const A = toMeters(dimA, inUnit);
      const B = toMeters(dimB, inUnit);
      let w = 0, h = 0;
      let effAspect: Aspect = baseAspect;
      if (sizeMode === 'w2h') {
        w = A;
        h = heightFromWidth(A, baseAspect);
      } else if (sizeMode === 'h2w') {
        h = A;
        w = widthFromHeight(A, baseAspect);
      } else if (sizeMode === 'd2wh') {
        w = widthFromDiagonal(A, baseAspect);
        h = heightFromWidth(w, baseAspect);
      } else {
        w = A;
        h = B;
        if (w > 0 && h > 0) effAspect = { w, h };
      }
      return { w, h, d: diagonal(w, h), effAspect, err: null as string | null };
    } catch (e) {
      return { w: 0, h: 0, d: 0, effAspect: baseAspect, err: (e as Error).message };
    }
  }, [dimA, dimB, inUnit, sizeMode, baseAspect.w, baseAspect.h]);

  const range = dbLens ? lensThrowRange(dbLens) : { min: trMin, max: trMax };
  const shift = dbLens ? lensShiftLimits(dbLens) : {};

  // Aktif TR değeri zoom aralığı dışındaysa clamp değil ama solveProjection sınır kontrolü yapsın
  const out = useMemo(() => {
    try {
      if (calcMode !== 'dist2size' && screenDims.err) {
        return { r: null, err: screenDims.err };
      }
      const D = toMeters(dist, inUnit);
      const activeAspect = calcMode === 'dist2size' ? baseAspect : screenDims.effAspect;
      const base = {
        aspect: activeAspect,
        throwRange: range,
        lensFrontProtrusion: toMeters(protr, 'mm'),
        horizontalOffset: toMeters(hOff, inUnit),
        verticalOffset: toMeters(vOff, inUnit),
        vShift: shift.v,
        hShift: shift.h,
      };
      let r: ProjectionResult;
      if (calcMode === 'dist2size') {
        r = solveProjection({ ...base, distance: D, throwRatio: tr });
      } else if (calcMode === 'size2dist') {
        r = solveProjection({ ...base, imageWidth: screenDims.w, throwRatio: tr });
      } else {
        r = solveProjection({ ...base, imageWidth: screenDims.w, distance: D });
      }
      return { r, err: null as string | null };
    } catch (e) {
      return { r: null, err: (e as Error).message };
    }
  }, [calcMode, screenDims, baseAspect, range.min, range.max, dist, tr, hOff, vOff, protr, inUnit, dbLens]);

  const geoCalc = useMemo(() => {
    const SW = toMeters(surfW, inUnit), SH = toMeters(surfH, inUnit);
    const fits = out.r
      ? Math.abs(out.r.bounds.left) <= SW / 2 && Math.abs(out.r.bounds.right) <= SW / 2 && (out.r.bounds.top - out.r.bounds.bottom) <= SH && out.r.bounds.top <= SH / 2 && out.r.bounds.bottom >= -SH / 2
      : false;
    return { SW, SH, fits };
  }, [out.r, surfW, surfH, inUnit]);

  const onGeoDragMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geoDragging.current || !geoSvgRef.current) return;
    const rect = geoSvgRef.current.getBoundingClientRect();
    const nx = Math.max(0.08, Math.min(0.85, (e.clientX - rect.left) / rect.width));
    if (geoView === 'side' || geoView === 'top') {
      const newDistM = Math.max(0.5, (1 - nx) * toMeters(surfW, inUnit) * 1.4);
      if (calcMode === 'size2dist') setCalcMode('dist2size');
      setDist(round(fromMeters(newDistM, inUnit), 2));
    }
  };

  const exportGeoScreenshot = async () => {
    if (!geoSvgRef.current) return;
    const xml = new XMLSerializer().serializeToString(geoSvgRef.current);
    const blob = await svgToPng(xml, 1920);
    download(`geometri-${geoView}.png`, blob);
  };

  const setProjectionSnap = useProjectStore(s => s.setProjectionSnap);
  const [reportToast, setReportToast] = useState<string | null>(null);

  const buildReportProjection = () => {
    if (!out.r) return null;
    const activeCatLens = catCompatLenses.find(l => l.id === catLensId);
    const activePreset = STANDARD_LENS_PRESETS.find(p => p.id === presetId);
    const activeAspect = calcMode === 'dist2size' ? baseAspect : screenDims.effAspect;
    return {
      projectorName: catProj
        ? `${catProj.manufacturer} ${catProj.model}`
        : proj
          ? `${proj.manufacturer} ${proj.model}`
          : 'Genel Projektör (Manuel)',
      ansiLumens: catProj?.ansiLumens ?? proj?.ansi_lumens ?? undefined,
      resolution: catProj
        ? `${catProj.nativeW}×${catProj.nativeH} (${catProj.aspect})`
        : proj?.native_w && proj?.native_h
          ? `${proj.native_w}×${proj.native_h}`
          : undefined,
      technology: catProj?.technology ?? undefined,
      lensName: activeCatLens
        ? activeCatLens.model
        : dbLens
          ? `${dbLens.manufacturer} ${dbLens.model}`
          : activePreset
            ? activePreset.name
            : customLensName.trim()
              ? `${customLensName.trim()} (${range.min.toFixed(2)}–${range.max.toFixed(2)}:1)`
              : `Özel Lens (${range.min.toFixed(2)}–${range.max.toFixed(2)}:1)`,
      imageWidthM: round(out.r.imageWidth, 4),
      distanceM: round(out.r.lensToSurface, 4),
      aspectW: round(activeAspect.w, 4),
      aspectH: round(activeAspect.h, 4),
      throwMin: range.min,
      throwMax: range.max,
      throwRatio: round(out.r.throwRatio, 4),
      lensFrontProtrusionM: toMeters(protr, 'mm'),
      verticalOffsetM: toMeters(vOff, inUnit),
      horizontalOffsetM: toMeters(hOff, inUnit),
    };
  };

  useEffect(() => {
    const snap = buildReportProjection();
    if (snap) setProjectionSnap(snap);
  }, [out.r, catProj, proj, catLensId, customLensName, dbLens, presetId, range.min, range.max, protr, vOff, hOff, inUnit]);

  const handleSendToReport = () => {
    const snap = buildReportProjection();
    if (!snap) return;
    setProjectionSnap(snap);
    setReportToast('✔ Ekran, Projektör & Lens rapora eklendi');
    setTimeout(() => setReportToast(null), 2600);
  };

  const f = (m: number | undefined, digits = 3) =>
    m === undefined ? '—' : `${round(fromMeters(m, unit), digits)} ${unit}`;

  // Tüm lenslerin (Seçili Projektör Uyumlu + Katalog + Veritabanı + Standart Ön Tanımlar) birleştirilmiş listesi
  const allUnifiedLenses: UnifiedLens[] = useMemo(() => {
    if (catProj && tableScope === 'compat') {
      return catCompatLenses.map(l => ({
        id: l.id,
        category: l.manufacturer,
        name: l.model,
        throwMin: l.throwMin,
        throwMax: l.throwMax,
        notes: l.notes ?? `Mount: ${l.lensMount}`,
      }));
    }
    const dbMapped: UnifiedLens[] = allDbLenses.map(l => ({
      id: `db-${l.id}`,
      dbId: l.id,
      category: 'Veritabanı',
      name: `${l.manufacturer} ${l.model}`,
      throwMin: l.throw_min,
      throwMax: l.throw_max,
      notes: l.lens_mount ? `Mount: ${l.lens_mount}` : undefined,
      isDb: true,
    }));
    const catalogMapped: UnifiedLens[] = CATALOG_LENSES.map(l => ({
      id: l.id,
      category: l.manufacturer,
      name: l.model,
      throwMin: l.throwMin,
      throwMax: l.throwMax,
      notes: l.notes ?? `Mount: ${l.lensMount}`,
    }));
    const presets: UnifiedLens[] = STANDARD_LENS_PRESETS.map(p => ({
      id: p.id,
      category: p.category,
      name: p.name,
      throwMin: p.throwMin,
      throwMax: p.throwMax,
      notes: p.notes,
    }));
    return [...dbMapped, ...presets, ...catalogMapped];
  }, [allDbLenses, catProj, catCompatLenses, tableScope]);

  // Tablo için hedef mesafe kontrolü
  const targetDistM = useMemo(() => {
    if (calcMode === 'both2tr') {
      const D = toMeters(dist, inUnit);
      return Number.isFinite(D) && D > 0 ? D : null;
    }
    const parsed = parseFloat(targetDistFilter);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return toMeters(parsed, inUnit);
  }, [calcMode, dist, targetDistFilter, inUnit]);

  const activeW = out.r ? out.r.imageWidth : screenDims.w;
  const activeAspectNum = out.r ? out.r.imageWidth / out.r.imageHeight : baseAspect.w / baseAspect.h;
  const requiredTrForTarget = targetDistM && activeW > 0 ? targetDistM / activeW : null;
  const compatIds = new Set(compat.map(c => c.id));

  const applyLensFromTable = (l: UnifiedLens) => {
    if (l.isDb && l.dbId && compatIds.has(l.dbId)) {
      setLid(l.dbId);
      return;
    }
    setLid('');
    if (l.isDb) {
      setPresetId('custom');
    } else {
      setPresetId(l.id);
    }
    setTrMin(l.throwMin);
    setTrMax(l.throwMax);
    if (requiredTrForTarget && requiredTrForTarget >= l.throwMin && requiredTrForTarget <= l.throwMax) {
      setTr(round(requiredTrForTarget, 2));
    } else {
      setTr(round((l.throwMin + l.throwMax) / 2, 2));
    }
  };

  const labelDimA = { w2h: 'Genişlik', h2w: 'Yükseklik', d2wh: 'Diagonal', wh2d: 'Genişlik' }[sizeMode];

  return (
    <div className="grid lg:grid-cols-[350px_1fr] gap-4 h-full">
      {/* SOL PANEL: Birleştirilmiş Ekran, Projektör & Lens Kontrolleri */}
      <div className="space-y-3 p-4 rounded border border-slate-700 bg-slate-900 overflow-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="font-semibold text-sky-400">Ekran, Projektör &amp; Lens</h2>
          <select
            className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs"
            value={inUnit}
            onChange={e => setInUnit(e.target.value as LengthUnit)}
            title="Giriş birimi"
          >
            {UNITS.map(u => <option key={u} value={u}>Birim: {u}</option>)}
          </select>
        </div>

        {/* Ana Hesaplama Modu */}
        <label className="block text-sm">
          <span className="text-slate-300 font-medium">Hesaplama Yöntemi</span>
          <select className="inp mt-1" value={calcMode} onChange={e => setCalcMode(e.target.value as CalcMode)}>
            <option value="size2dist">Ekran Boyutu + Lens → Kurulum Mesafesi</option>
            <option value="dist2size">Mesafe + Lens → Açılan Ekran Boyutu</option>
            <option value="both2tr">Ekran Boyutu + Mesafe → Gereken Lens (TR)</option>
          </select>
        </label>

        {/* En-Boy Oranı */}
        <div className="space-y-1.5">
          <label className="block text-sm">
            <span className="text-slate-300">En-Boy Oranı</span>
            <select
              className="inp mt-1"
              value={sizeMode === 'wh2d' && calcMode !== 'dist2size' ? 'custom' : ar}
              disabled={sizeMode === 'wh2d' && calcMode !== 'dist2size'}
              onChange={e => setAr(e.target.value)}
            >
              {Object.keys(PRESET_ASPECTS).map(k => <option key={k}>{k}</option>)}
              <option value="custom">Özel</option>
            </select>
          </label>
          {ar === 'custom' && !(sizeMode === 'wh2d' && calcMode !== 'dist2size') && (
            <div className="flex gap-2 items-center text-xs">
              <input className="inp" type="number" min="0.01" step="any" value={cw} onChange={e => setCw(+e.target.value)} />
              <span>:</span>
              <input className="inp" type="number" min="0.01" step="any" value={ch} onChange={e => setCh(+e.target.value)} />
            </div>
          )}
        </div>

        {/* Ekran Boyutu Girdileri (size2dist ve both2tr modlarında) */}
        {calcMode !== 'dist2size' && (
          <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800 space-y-2">
            <label className="block text-xs text-slate-400">
              Ekran Boyutu Giriş Tipi
              <select className="inp mt-1 text-sm" value={sizeMode} onChange={e => setSizeMode(e.target.value as SizeInputMode)}>
                <option value="w2h">Genişlikten hesapla</option>
                <option value="h2w">Yükseklikten hesapla</option>
                <option value="d2wh">Diagonal&apos;den hesapla</option>
                <option value="wh2d">Genişlik &amp; Yükseklik (Özel)</option>
              </select>
            </label>
            <div className={sizeMode === 'wh2d' ? 'grid grid-cols-2 gap-2' : ''}>
              <Num label={`${labelDimA} (${inUnit})`} v={dimA} set={setDimA} />
              {sizeMode === 'wh2d' && <Num label={`Yükseklik (${inUnit})`} v={dimB} set={setDimB} />}
            </div>
          </div>
        )}

        {/* Mesafe Girdisi (dist2size ve both2tr modlarında) */}
        {(calcMode === 'dist2size' || calcMode === 'both2tr') && (
          <Num label={`Lens – Yüzey Mesafesi (${inUnit})`} v={dist} set={setDist} />
        )}

        {/* Projektör & Lens Seçimi */}
        {calcMode !== 'both2tr' && (
          <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Projektör &amp; Lens Seçimi</div>

            {/* Marka & Model Seçici (Tüm Markalar + Veritabanı) */}
            <label className="block text-xs text-slate-400">
              Projektör Markası &amp; Modeli
              <select
                className="inp mt-1 text-sm"
                value={catProjId ? `cat:${catProjId}` : pid !== '' ? `db:${pid}` : ''}
                onChange={e => {
                  const val = e.target.value;
                  if (val.startsWith('cat:')) {
                    handleCatalogProjectorChange(val.slice(4));
                  } else if (val.startsWith('db:')) {
                    setCatProjId('');
                    setCatLensId('');
                    setPid(+val.slice(3));
                  } else {
                    setCatProjId('');
                    setCatLensId('');
                    setPid('');
                  }
                }}
              >
                <option value="">— Genel / Manuel Lens Seçimi —</option>
                {CATALOG_BRANDS.map(brand => (
                  <optgroup key={brand} label={brand}>
                    {CATALOG_PROJECTORS.filter(p => p.manufacturer === brand).map(p => (
                      <option key={p.id} value={`cat:${p.id}`}>
                        {p.model} ({(p.ansiLumens / 1000).toFixed(1)}K lm · {p.nativeW}×{p.nativeH})
                      </option>
                    ))}
                  </optgroup>
                ))}
                {apiConnected && projectors.length > 0 && (
                  <optgroup label="Özel / Veritabanı">
                    {projectors.map(p => (
                      <option key={p.id} value={`db:${p.id}`}>
                        {p.manufacturer} {p.model}{p.verified ? '' : ' (doğrulanmamış)'}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>

            {catProj && (
              <div className="text-[11px] bg-slate-900 border border-slate-700/80 rounded px-2 py-1.5 text-slate-300 flex flex-wrap justify-between gap-1">
                <span>💡 <b className="text-amber-300">{catProj.ansiLumens.toLocaleString('tr-TR')} ANSI lm</b></span>
                <span>{catProj.nativeW}×{catProj.nativeH} ({catProj.aspect}) · {catProj.technology}</span>
              </div>
            )}

            {catProj ? (
              <label className="block text-xs text-slate-400">
                Uyumlu Lens ({catProj.lensMount})
                <select className="inp mt-1 text-sm" value={catLensId} onChange={e => handleCatalogLensChange(e.target.value)}>
                  <option value="custom">— Özel (Manuel Lens Gir) —</option>
                  {catCompatLenses.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.model} ({l.throwMin === l.throwMax ? `${l.throwMin.toFixed(2)}:1` : `${l.throwMin.toFixed(2)}–${l.throwMax.toFixed(2)}:1`})
                    </option>
                  ))}
                </select>
              </label>
            ) : pid !== '' ? (
              <label className="block text-xs text-slate-400">
                Uyumlu Lens (Veritabanı)
                <select className="inp mt-1 text-sm" value={lid} onChange={e => setLid(e.target.value ? +e.target.value : '')}>
                  <option value="">— Manuel TR kullan —</option>
                  {compat.map(l => (
                    <option key={l.id} value={l.id}>{l.manufacturer} {l.model} ({l.throw_min}–{l.throw_max}:1)</option>
                  ))}
                </select>
                {compat.length === 0 && <span className="text-xs text-amber-400">Bu projektör için uyumluluk kaydı yok.</span>}
              </label>
            ) : (
              <label className="block text-xs text-slate-400">
                Standart Lens Kategorisi
                <select className="inp mt-1 text-sm" value={presetId} onChange={e => handlePresetChange(e.target.value)}>
                  <option value="custom">— Özel Throw Ratio Gir —</option>
                  {STANDARD_LENS_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.category}] {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {dbLens?.warnings.map(w => <p key={w} className="text-xs text-amber-400">⚠ {w}</p>)}

            {!dbLens && (
              <>
                {((catProj && catLensId === 'custom') || (!catProj && pid === '' && presetId === 'custom')) && (
                  <label className="block text-xs text-slate-400">
                    Özel Lens Adı / Modeli (Opsiyonel)
                    <input
                      className="inp mt-0.5 text-xs"
                      type="text"
                      placeholder="Örn: ELPLU04 veya Özel 0.65–0.85"
                      value={customLensName}
                      onChange={e => setCustomLensName(e.target.value)}
                    />
                  </label>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="text-slate-400">
                    TR Min (Geniş)
                    <input
                      className="inp mt-0.5"
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={trMin}
                      onChange={e => { if (catProj) setCatLensId('custom'); setPresetId('custom'); setTrMin(+e.target.value); }}
                    />
                  </label>
                  <label className="text-slate-400">
                    TR Max (Tele)
                    <input
                      className="inp mt-0.5"
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={trMax}
                      onChange={e => { if (catProj) setCatLensId('custom'); setPresetId('custom'); setTrMax(+e.target.value); }}
                    />
                  </label>
                </div>
              </>
            )}

            <div className="space-y-1">
              <Num label="Aktif Throw Ratio (TR)" v={tr} set={setTr} />
              {range.max > range.min && (
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step="0.01"
                  value={Math.min(range.max, Math.max(range.min, tr))}
                  onChange={e => setTr(+e.target.value)}
                  className="w-full accent-sky-500 cursor-pointer"
                  title="Zoom aralığında gezinin"
                />
              )}
            </div>
          </div>
        )}

        {/* Fiziksel Ofset ve Şasi Ayarları */}
        <details className="text-xs border-t border-slate-800 pt-2">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200 font-medium">
            Montaj Ofseti, Lens Çıkıntısı &amp; JSON İçe Aktar
          </summary>
          <div className="space-y-2 mt-2">
            <Num label={`Dikey görüntü ofseti (${inUnit}, optik eksen)`} v={vOff} set={setVOff} />
            <Num label="Lens ön yüzü şasi çıkıntısı (mm)" v={protr} set={setProtr} />
            {proj?.depth_mm && (
              <p className="text-slate-400">Şasi derinliği: {proj.depth_mm} mm</p>
            )}
            <div className="pt-2 border-t border-slate-800 space-y-1">
              <div className="text-slate-400">Veritabanına JSON içe aktar</div>
              <textarea
                className="inp h-20 font-mono text-[11px]"
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder='{"projectors":[...],"lenses":[...]}'
              />
              <button
                className="px-2 py-1 bg-sky-700 hover:bg-sky-600 rounded text-white"
                onClick={async () => {
                  try {
                    const r = await api.importDb(JSON.parse(importText));
                    setMsg(`Eklendi: ${r.projectors} projektör, ${r.lenses} lens`);
                    reload();
                  } catch (e) {
                    setMsg((e as Error).message);
                  }
                }}
              >
                İçe aktar
              </button>
              {msg && <span className="ml-2 text-slate-300">{msg}</span>}
            </div>
          </div>
        </details>
      </div>

      {/* SAĞ PANEL: Metrikler + Çift Teknik Çizim + Lens Karşılaştırma Tablosu */}
      <div className="flex flex-col gap-3 min-w-0 overflow-auto">
        {out.err && <p className="p-3 rounded bg-red-950/60 border border-red-800 text-red-300 text-sm">⚠ {out.err}</p>}

        {out.r && (
          <>
            {/* Durum Bandı */}
            <div className={`px-3 py-2 rounded text-sm flex flex-wrap items-center justify-between gap-2 ${out.r.achievable ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-300' : 'bg-red-950/50 border border-red-800/60 text-red-300'}`}>
              <div>
                {out.r.achievable ? '✔ Yapılandırma fiziksel olarak ulaşılabilir' : '✘ Seçili lens / throw aralığı bu yapılandırmayı karşılamıyor'}
                {out.r.warnings.map(w => <div key={w} className="text-xs text-amber-300 mt-0.5">⚠ {w}</div>)}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300 font-mono">
                <span>Alan: {round(out.r.imageWidth * out.r.imageHeight, 2)} m² · Oran: {round(out.r.imageWidth / out.r.imageHeight, 3)}:1</span>
                {reportToast && <span className="px-2 py-0.5 rounded bg-emerald-800 text-emerald-100 font-sans font-semibold">{reportToast}</span>}
                <button
                  onClick={handleSendToReport}
                  className="px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white font-sans font-semibold transition"
                >
                  📋 Rapora Ekle
                </button>
              </div>
            </div>

            {/* Özet Metrik Kartları */}
            <div className="grid sm:grid-cols-3 xl:grid-cols-6 gap-2 text-sm">
              <Card k="Genişlik × Yükseklik" v={`${f(out.r.imageWidth, 2)} × ${f(out.r.imageHeight, 2)}`} />
              <Card k="Diagonal" v={`${round(fromMeters(out.r.diagonal, 'in'), 1)}" (${f(out.r.diagonal, 2)})`} />
              <Card k="Throw Ratio" v={`${round(out.r.throwRatio, 3)}:1`} />
              <Card
                k="Zoom Konumu"
                v={out.r.zoomPosition === undefined ? 'Sabit / —' : `%${round(out.r.zoomPosition * 100, 0)} (0=Geniş)`}
              />
              <Card k="Lens → Yüzey Mesafesi" v={f(out.r.lensToSurface, 2)} />
              <Card
                k={calcMode === 'dist2size' ? 'Bu Mesafede Genişlik' : 'Lens Mesafe Aralığı'}
                v={
                  calcMode === 'dist2size'
                    ? `${f(out.r.lensToSurface / range.max, 2)} – ${f(out.r.lensToSurface / range.min, 2)}`
                    : `${f(out.r.distanceMin, 2)} – ${f(out.r.distanceMax, 2)}`
                }
              />
            </div>

            {/* Teknik Çizim & Geometri Simülasyonu Sekmeleri */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex rounded overflow-hidden border border-slate-700 text-xs">
                  <button
                    onClick={() => setDiagramTab('standard')}
                    className={`px-3 py-1.5 font-medium ${diagramTab === 'standard' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    📐 Ön &amp; Yan Optik Kesit
                  </button>
                  <button
                    onClick={() => setDiagramTab('geometry')}
                    className={`px-3 py-1.5 font-medium ${diagramTab === 'geometry' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    🎯 Gelişmiş Geometri &amp; Perspektif (Duvar/Zemin/Tavan + Foto)
                  </button>
                </div>

                {diagramTab === 'geometry' && (
                  <span className={`text-xs px-2.5 py-1 rounded border font-medium ${geoCalc.fits ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300' : 'bg-amber-950/50 border-amber-700 text-amber-300'}`}>
                    {geoCalc.fits ? '✔ Yüzey İçinde Sığıyor' : '⚠ Yüzey Sınırını Aşıyor'}
                  </span>
                )}
              </div>

              {diagramTab === 'standard' ? (
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="p-2.5 rounded border border-slate-700 bg-slate-950 flex flex-col">
                    <div className="flex items-center justify-between px-1 pb-1.5">
                      <span className="text-xs font-medium text-slate-300">Ön Görünüş — Ekran Boyutu</span>
                      <button
                        onClick={() => setExpandedView('front')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-sky-700 text-[11px] text-sky-300 hover:text-white transition"
                      >
                        🔍 Büyüt
                      </button>
                    </div>
                    <FrontScreenDiagram w={out.r.imageWidth} h={out.r.imageHeight} d={out.r.diagonal} unit={unit} />
                  </div>
                  <div className="p-2.5 rounded border border-slate-700 bg-slate-950 flex flex-col">
                    <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
                      <span className="text-xs font-medium text-slate-300 truncate">
                        Yan Optik Kesit · Şasi Önü: {f(out.r.chassisFrontToSurface, 2)} · Ü {f(out.r.bounds.top, 2)} / A {f(out.r.bounds.bottom, 2)}
                      </span>
                      <button
                        onClick={() => setExpandedView('side')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-sky-700 text-[11px] text-sky-300 hover:text-white transition shrink-0"
                      >
                        🔍 Büyüt
                      </button>
                    </div>
                    <SideDiagram r={out.r} unit={unit} />
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded border border-slate-700 bg-slate-950 space-y-2.5">
                  {/* Geometri Simülatörü Kontrolleri */}
                  <div className="flex flex-wrap items-center gap-2 text-xs border-b border-slate-800 pb-2">
                    <div className="flex gap-1">
                      {([['side', 'Yan'], ['top', 'Üst'], ['front', 'Ön'], ['perspective', 'Perspektif']] as [GeoViewMode, string][]).map(([k, l]) => (
                        <button key={k} onClick={() => setGeoView(k)} className={`px-2.5 py-1 rounded ${geoView === k ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}>{l}</button>
                      ))}
                    </div>
                    <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200" value={surface} onChange={e => setSurface(e.target.value as SurfaceTarget)}>
                      <option value="wall">Duvar</option>
                      <option value="floor">Zemin (Floor)</option>
                      <option value="ceiling">Tavan (Ceiling)</option>
                    </select>
                    <label className="flex items-center gap-1 text-slate-400">
                      Yüzey G:
                      <input type="number" step="0.1" value={surfW} onChange={e => setSurfW(+e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 w-14 text-slate-100" />
                    </label>
                    <label className="flex items-center gap-1 text-slate-400">
                      Yüzey Y:
                      <input type="number" step="0.1" value={surfH} onChange={e => setSurfH(+e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 w-14 text-slate-100" />
                    </label>
                    <label className="flex items-center gap-1 text-slate-400">
                      Yatay Shift:
                      <input type="number" step="0.05" value={hOff} onChange={e => setHOff(+e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 w-14 text-slate-100" />
                    </label>
                    <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={human} onChange={e => setHuman(e.target.checked)} /> İnsan (1.75m)
                    </label>
                    <label className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded cursor-pointer text-slate-200">
                      📷 Foto Yükle
                      <input type="file" accept="image/*" hidden onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const rd = new FileReader();
                        rd.onload = () => setBgPhoto(rd.result as string);
                        rd.readAsDataURL(file);
                      }} />
                    </label>
                    {bgPhoto && <button className="px-2 py-1 bg-slate-800 rounded text-amber-400" onClick={() => setBgPhoto(null)}>Foto Sil</button>}
                    <div className="ml-auto flex gap-1.5">
                      <button
                        onClick={() => setExpandedView('geometry')}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-sky-700 rounded text-sky-300 hover:text-white transition font-medium"
                      >
                        🔍 Büyüt
                      </button>
                      <button className="px-2.5 py-1 bg-sky-700 hover:bg-sky-600 rounded text-white font-medium" onClick={exportGeoScreenshot}>PNG İndir</button>
                    </div>
                  </div>

                  {/* İnteraktif SVG Geometri Sahnesi */}
                  <svg
                    ref={geoSvgRef}
                    viewBox="0 0 900 460"
                    className="w-full min-h-[360px] max-h-[520px] bg-slate-950 rounded select-none touch-none"
                    onPointerMove={onGeoDragMove}
                    onPointerUp={() => { geoDragging.current = false; }}
                  >
                    {bgPhoto && (geoView === 'front' || geoView === 'perspective') && (
                      <image href={bgPhoto} x="50" y="20" width="800" height="420" preserveAspectRatio="xMidYMid slice" opacity="0.55" />
                    )}

                    {(geoView === 'side' || geoView === 'top') && (() => {
                      const r = out.r!;
                      const spanM = Math.max(geoCalc.SW * 1.4, r.lensToSurface * 1.15, 4);
                      const scale = 680 / spanM;
                      const xSurf = 780;
                      const xProj = xSurf - r.lensToSurface * scale;
                      const yMid = 230;
                      const imgSpan = geoView === 'side' ? r.imageHeight : r.imageWidth;
                      const surfSpan = geoView === 'side' ? geoCalc.SH : geoCalc.SW;
                      const shiftM = toMeters(geoView === 'side' ? vOff : hOff, inUnit);
                      const yTop = yMid - (shiftM + imgSpan / 2) * scale;
                      const yBot = yMid - (shiftM - imgSpan / 2) * scale;
                      return (
                        <g>
                          <line x1={xSurf} y1={yMid - (surfSpan / 2) * scale} x2={xSurf} y2={yMid + (surfSpan / 2) * scale} stroke="#64748b" strokeWidth="6" />
                          <polygon points={`${xProj},${yMid} ${xSurf},${yTop} ${xSurf},${yBot}`} fill="#38bdf8" fillOpacity="0.18" stroke="#38bdf8" strokeWidth="2" />
                          <line x1={xProj} y1={yMid} x2={xSurf} y2={yMid} stroke="#f59e0b" strokeDasharray="6 4" />
                          <line x1={xSurf} y1={yTop} x2={xSurf} y2={yBot} stroke="#4ade80" strokeWidth="5" />
                          <g className="cursor-ew-resize" onPointerDown={e => { e.stopPropagation(); geoDragging.current = true; }}>
                            <rect x={xProj - 32} y={yMid - 14} width="32" height="28" rx="3" fill="#334155" stroke="#94a3b8" />
                            <circle cx={xProj} cy={yMid} r="7" fill="#f59e0b" />
                          </g>
                          {human && geoView === 'side' && (
                            <g transform={`translate(${xSurf - 70}, ${yMid + (surfSpan / 2) * scale - 1.75 * scale})`}>
                              <circle cx="0" cy={0.15 * scale} r={0.12 * scale} fill="#f87171" />
                              <line x1="0" y1={0.27 * scale} x2="0" y2={1.75 * scale} stroke="#f87171" strokeWidth="4" />
                            </g>
                          )}
                          <text x={(xProj + xSurf) / 2} y={yMid - 10} fill="#f59e0b" fontSize="13" textAnchor="middle">
                            {geoView === 'side' ? 'Yan Görünüş' : 'Üst Görünüş'} · Optik Eksen D = {f(r.lensToSurface, 2)} ({surface})
                          </text>
                          <text x={xSurf + 12} y={(yTop + yBot) / 2} fill="#4ade80" fontSize="13">
                            {geoView === 'side' ? `H = ${f(r.imageHeight, 2)}` : `W = ${f(r.imageWidth, 2)}`}
                          </text>
                        </g>
                      );
                    })()}

                    {(geoView === 'front' || geoView === 'perspective') && (() => {
                      const r = out.r!;
                      const scale = Math.min(720 / geoCalc.SW, 360 / geoCalc.SH);
                      const cx = 450, cy = 230;
                      const sw = geoCalc.SW * scale, sh = geoCalc.SH * scale;
                      const iw = r.imageWidth * scale, ih = r.imageHeight * scale;
                      const ox = toMeters(hOff, inUnit) * scale, oy = -toMeters(vOff, inUnit) * scale;
                      return (
                        <g>
                          <rect x={cx - sw / 2} y={cy - sh / 2} width={sw} height={sh} fill={bgPhoto ? 'none' : '#0f172a'} stroke="#64748b" strokeWidth="2" strokeDasharray="6 4" />
                          {geoView === 'perspective' && (
                            <polygon points={`${cx},${cy + 190} ${cx + ox - iw / 2},${cy + oy + ih / 2} ${cx + ox + iw / 2},${cy + oy - ih / 2}`} fill="#38bdf8" fillOpacity="0.12" />
                          )}
                          <rect x={cx + ox - iw / 2} y={cy + oy - ih / 2} width={iw} height={ih} fill="#38bdf8" fillOpacity="0.22" stroke="#38bdf8" strokeWidth="2.5" />
                          {human && (
                            <g transform={`translate(${cx - sw / 2 + 35}, ${cy + sh / 2 - 1.75 * scale})`}>
                              <circle cx="0" cy={0.15 * scale} r={0.12 * scale} fill="#f87171" />
                              <line x1="0" y1={0.27 * scale} x2="0" y2={1.75 * scale} stroke="#f87171" strokeWidth="4" />
                            </g>
                          )}
                          <text x={cx} y={cy - sh / 2 - 10} fill="#cbd5e1" fontSize="13" textAnchor="middle">
                            Yüzey: {f(geoCalc.SW, 2)} × {f(geoCalc.SH, 2)} &nbsp;|&nbsp; Görüntü: {f(r.imageWidth, 2)} × {f(r.imageHeight, 2)}
                          </text>
                        </g>
                      );
                    })()}
                  </svg>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tüm Lensler Karşılaştırma & Mesafe/Boyut Tablosu */}
        <div className="p-4 rounded border border-slate-700 bg-slate-900 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                {calcMode === 'dist2size'
                  ? `🎯 ${f(toMeters(dist, inUnit), 2)} Mesafeden Hangi Lens Kaç Açar?`
                  : `📏 ${f(activeW, 2)} Genişlik (${round(activeAspectNum, 2)}:1) Hangi Metreden Hangi Lensle Açılır?`}
              </h3>
              <p className="text-xs text-slate-400">
                {calcMode === 'dist2size'
                  ? 'Seçili mesafe ve en-boy oranında her lens kategorisinin açabileceği minimum–maksimum görüntü boyutları:'
                  : 'Hesaplanan ekran boyutunu açabilmek için her lens kategorisinin ihtiyaç duyduğu kurulum mesafesi:'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {catProj && (
                <div className="flex rounded overflow-hidden border border-slate-700 text-xs">
                  <button
                    onClick={() => setTableScope('compat')}
                    className={`px-2.5 py-1 ${tableScope === 'compat' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                  >
                    {catProj.model} Lensleri ({catCompatLenses.length})
                  </button>
                  <button
                    onClick={() => setTableScope('all')}
                    className={`px-2.5 py-1 ${tableScope === 'all' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                  >
                    Tüm Markalar ({CATALOG_LENSES.length + STANDARD_LENS_PRESETS.length})
                  </button>
                </div>
              )}

              {calcMode === 'size2dist' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Hedef Mesafe Filtresi ({inUnit}):</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Örn: 5"
                  value={targetDistFilter}
                  onChange={e => setTargetDistFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-1 w-24 text-slate-100 focus:border-sky-500 outline-none"
                />
                {requiredTrForTarget !== null && (
                  <span className="px-2 py-1 rounded bg-sky-900/50 border border-sky-700 text-sky-300 font-semibold">
                    Gereken TR: {round(requiredTrForTarget, 2)}:1
                  </span>
                )}
              </div>
            )}
            </div>
          </div>

          <div className="overflow-auto max-h-[300px] pr-1">
            {calcMode === 'dist2size' ? (
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="py-2 pr-3">Lens / Kategori</th>
                    <th className="py-2 px-3">Atım Oranı (TR)</th>
                    <th className="py-2 px-3">Açılan Genişlik ({unit})</th>
                    <th className="py-2 px-3">Açılan Yükseklik ({unit})</th>
                    <th className="py-2 px-3">Diagonal (inç)</th>
                    <th className="py-2 pl-3 text-right">Seç</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {allUnifiedLenses.map(l => {
                    const D_m = toMeters(dist, inUnit);
                    const { minW, maxW, minH, maxH } = sizeRangeForLens(D_m, l.throwMin, l.throwMax, activeAspectNum);
                    const isFixed = Math.abs(l.throwMin - l.throwMax) < 1e-6;
                    const minDiagIn = round(fromMeters(diagonal(minW, minH), 'in'), 0);
                    const maxDiagIn = round(fromMeters(diagonal(maxW, maxH), 'in'), 0);
                    const isCurrent = presetId === l.id || (l.dbId && lid === l.dbId);

                    return (
                      <tr key={l.id} className={isCurrent ? 'bg-sky-950/50' : 'hover:bg-slate-800/40'}>
                        <td className="py-1.5 pr-3 font-medium">
                          <span className="text-slate-400 mr-1.5">[{l.category}]</span>
                          <span className="text-slate-200">{l.name}</span>
                        </td>
                        <td className="py-1.5 px-3 font-mono text-sky-300">
                          {isFixed ? `${l.throwMin.toFixed(2)}:1` : `${l.throwMin.toFixed(2)} – ${l.throwMax.toFixed(2)}:1`}
                        </td>
                        <td className="py-1.5 px-3 font-semibold text-emerald-300">
                          {isFixed ? `${f(maxW, 2)}` : `${f(minW, 2)} – ${f(maxW, 2)}`}
                        </td>
                        <td className="py-1.5 px-3 font-semibold text-slate-200">
                          {isFixed ? `${f(maxH, 2)}` : `${f(minH, 2)} – ${f(maxH, 2)}`}
                        </td>
                        <td className="py-1.5 px-3 text-slate-300">
                          {isFixed ? `${maxDiagIn}"` : `${minDiagIn}" – ${maxDiagIn}"`}
                        </td>
                        <td className="py-1.5 pl-3 text-right">
                          <button
                            onClick={() => applyLensFromTable(l)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-sky-700 text-sky-300 hover:text-white transition"
                          >
                            Uygula
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="py-2 pr-3">Lens / Kategori</th>
                    <th className="py-2 px-3">Atım Oranı (TR)</th>
                    <th className="py-2 px-3">Kurulum Mesafesi ({unit})</th>
                    {targetDistM !== null && <th className="py-2 px-3">Mesafe Uyumu</th>}
                    <th className="py-2 px-3">Açıklama</th>
                    <th className="py-2 pl-3 text-right">Seç</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {allUnifiedLenses.map(l => {
                    const { minDist, maxDist } = distanceForLens(activeW, l.throwMin, l.throwMax);
                    const isFixed = Math.abs(l.throwMin - l.throwMax) < 1e-6;
                    const eps = 1e-6;
                    const isMatch = targetDistM !== null && targetDistM >= minDist - eps && targetDistM <= maxDist + eps;
                    const zoomPct = isMatch && !isFixed && requiredTrForTarget !== null
                      ? round(((requiredTrForTarget - l.throwMin) / (l.throwMax - l.throwMin)) * 100, 0)
                      : null;
                    const isCurrent = presetId === l.id || (l.dbId && lid === l.dbId);

                    return (
                      <tr
                        key={l.id}
                        className={
                          isMatch
                            ? 'bg-emerald-950/40 text-emerald-200'
                            : isCurrent
                              ? 'bg-sky-950/40'
                              : targetDistM !== null
                                ? 'opacity-50 hover:opacity-90'
                                : 'hover:bg-slate-800/40'
                        }
                      >
                        <td className="py-1.5 pr-3 font-medium">
                          <span className="text-slate-400 mr-1.5">[{l.category}]</span>
                          <span className={isMatch ? 'text-emerald-300 font-semibold' : 'text-slate-200'}>{l.name}</span>
                        </td>
                        <td className="py-1.5 px-3 font-mono text-sky-300">
                          {isFixed ? `${l.throwMin.toFixed(2)}:1` : `${l.throwMin.toFixed(2)} – ${l.throwMax.toFixed(2)}:1`}
                        </td>
                        <td className="py-1.5 px-3 font-semibold text-slate-100">
                          {isFixed ? f(minDist, 2) : `${f(minDist, 2)} – ${f(maxDist, 2)}`}
                        </td>
                        {targetDistM !== null && (
                          <td className="py-1.5 px-3">
                            {isMatch ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-emerald-800/60 text-emerald-300 font-semibold">
                                ✔ Uygun {zoomPct !== null ? `(Zoom %${zoomPct})` : '(Sabit)'}
                              </span>
                            ) : (
                              <span className="text-slate-500">
                                {targetDistM < minDist ? 'Çok yakın' : 'Çok uzak'}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="py-1.5 px-3 text-slate-400">
                          {l.notes ?? '—'}
                          {l.isDb && pid !== '' && (
                            compatIds.has(l.dbId!)
                              ? <span className="ml-1 text-emerald-400">(Uyumlu)</span>
                              : <span className="ml-1 text-amber-400">(Uyumluluk kaydı yok)</span>
                          )}
                        </td>
                        <td className="py-1.5 pl-3 text-right">
                          <button
                            onClick={() => applyLensFromTable(l)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-sky-700 text-sky-300 hover:text-white transition"
                          >
                            Uygula
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Büyütülmüş / Tam Ekran Görünüm Modalı */}
      {expandedView && out.r && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm p-6 flex flex-col gap-3"
          onClick={() => setExpandedView(null)}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-sky-300">
              {expandedView === 'front' && `Ön Görünüş — ${f(out.r.imageWidth, 2)} × ${f(out.r.imageHeight, 2)} (${round(fromMeters(out.r.diagonal, 'in'), 1)}")`}
              {expandedView === 'side' && `Yan Optik Kesit — Mesafe D = ${f(out.r.lensToSurface, 2)} · TR ${round(out.r.throwRatio, 2)}:1`}
              {expandedView === 'geometry' && `Gelişmiş Geometri & Perspektif (${geoView.toUpperCase()} · ${surface})`}
            </div>
            <button
              onClick={() => setExpandedView(null)}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-red-800 text-slate-200 hover:text-white text-xs font-semibold transition"
            >
              ✕ Küçült / Kapat
            </button>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-900/40 rounded border border-slate-800 p-4" onClick={e => e.stopPropagation()}>
            {expandedView === 'front' && (
              <FrontScreenDiagram w={out.r.imageWidth} h={out.r.imageHeight} d={out.r.diagonal} unit={unit} large />
            )}
            {expandedView === 'side' && (
              <SideDiagram r={out.r} unit={unit} large />
            )}
            {expandedView === 'geometry' && (
              <svg
                viewBox="0 0 900 460"
                className="w-full h-full max-h-[82vh] bg-slate-950 rounded select-none touch-none"
                onPointerMove={onGeoDragMove}
                onPointerUp={() => { geoDragging.current = false; }}
              >
                {bgPhoto && (geoView === 'front' || geoView === 'perspective') && (
                  <image href={bgPhoto} x="50" y="20" width="800" height="420" preserveAspectRatio="xMidYMid slice" opacity="0.55" />
                )}
                {(geoView === 'side' || geoView === 'top') && (() => {
                  const r = out.r!;
                  const spanM = Math.max(geoCalc.SW * 1.4, r.lensToSurface * 1.15, 4);
                  const scale = 680 / spanM;
                  const xSurf = 780;
                  const xProj = xSurf - r.lensToSurface * scale;
                  const yMid = 230;
                  const imgSpan = geoView === 'side' ? r.imageHeight : r.imageWidth;
                  const surfSpan = geoView === 'side' ? geoCalc.SH : geoCalc.SW;
                  const shiftM = toMeters(geoView === 'side' ? vOff : hOff, inUnit);
                  const yTop = yMid - (shiftM + imgSpan / 2) * scale;
                  const yBot = yMid - (shiftM - imgSpan / 2) * scale;
                  return (
                    <g>
                      <line x1={xSurf} y1={yMid - (surfSpan / 2) * scale} x2={xSurf} y2={yMid + (surfSpan / 2) * scale} stroke="#64748b" strokeWidth="6" />
                      <polygon points={`${xProj},${yMid} ${xSurf},${yTop} ${xSurf},${yBot}`} fill="#38bdf8" fillOpacity="0.18" stroke="#38bdf8" strokeWidth="2" />
                      <line x1={xProj} y1={yMid} x2={xSurf} y2={yMid} stroke="#f59e0b" strokeDasharray="6 4" />
                      <line x1={xSurf} y1={yTop} x2={xSurf} y2={yBot} stroke="#4ade80" strokeWidth="5" />
                      <rect x={xProj - 32} y={yMid - 14} width="32" height="28" rx="3" fill="#334155" stroke="#94a3b8" />
                      <circle cx={xProj} cy={yMid} r="7" fill="#f59e0b" />
                      {human && geoView === 'side' && (
                        <g transform={`translate(${xSurf - 70}, ${yMid + (surfSpan / 2) * scale - 1.75 * scale})`}>
                          <circle cx="0" cy={0.15 * scale} r={0.12 * scale} fill="#f87171" />
                          <line x1="0" y1={0.27 * scale} x2="0" y2={1.75 * scale} stroke="#f87171" strokeWidth="4" />
                        </g>
                      )}
                      <text x={(xProj + xSurf) / 2} y={yMid - 10} fill="#f59e0b" fontSize="13" textAnchor="middle">
                        {geoView === 'side' ? 'Yan Görünüş' : 'Üst Görünüş'} · Optik Eksen D = {f(r.lensToSurface, 2)} ({surface})
                      </text>
                      <text x={xSurf + 12} y={(yTop + yBot) / 2} fill="#4ade80" fontSize="13">
                        {geoView === 'side' ? `H = ${f(r.imageHeight, 2)}` : `W = ${f(r.imageWidth, 2)}`}
                      </text>
                    </g>
                  );
                })()}
                {(geoView === 'front' || geoView === 'perspective') && (() => {
                  const r = out.r!;
                  const scale = Math.min(720 / geoCalc.SW, 360 / geoCalc.SH);
                  const cx = 450, cy = 230;
                  const sw = geoCalc.SW * scale, sh = geoCalc.SH * scale;
                  const iw = r.imageWidth * scale, ih = r.imageHeight * scale;
                  const ox = toMeters(hOff, inUnit) * scale, oy = -toMeters(vOff, inUnit) * scale;
                  return (
                    <g>
                      <rect x={cx - sw / 2} y={cy - sh / 2} width={sw} height={sh} fill={bgPhoto ? 'none' : '#0f172a'} stroke="#64748b" strokeWidth="2" strokeDasharray="6 4" />
                      {geoView === 'perspective' && (
                        <polygon points={`${cx},${cy + 190} ${cx + ox - iw / 2},${cy + oy + ih / 2} ${cx + ox + iw / 2},${cy + oy - ih / 2}`} fill="#38bdf8" fillOpacity="0.12" />
                      )}
                      <rect x={cx + ox - iw / 2} y={cy + oy - ih / 2} width={iw} height={ih} fill="#38bdf8" fillOpacity="0.22" stroke="#38bdf8" strokeWidth="2.5" />
                      {human && (
                        <g transform={`translate(${cx - sw / 2 + 35}, ${cy + sh / 2 - 1.75 * scale})`}>
                          <circle cx="0" cy={0.15 * scale} r={0.12 * scale} fill="#f87171" />
                          <line x1="0" y1={0.27 * scale} x2="0" y2={1.75 * scale} stroke="#f87171" strokeWidth="4" />
                        </g>
                      )}
                      <text x={cx} y={cy - sh / 2 - 10} fill="#cbd5e1" fontSize="13" textAnchor="middle">
                        Yüzey: {f(geoCalc.SW, 2)} × {f(geoCalc.SH, 2)} &nbsp;|&nbsp; Görüntü: {f(r.imageWidth, 2)} × {f(r.imageHeight, 2)}
                      </text>
                    </g>
                  );
                })()}
              </svg>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const Num = ({ label, v, set }: { label: string; v: number; set: (n: number) => void }) => (
  <label className="block text-xs text-slate-300">
    {label}
    <input className="inp mt-0.5 text-sm" type="number" step="any" value={v} onChange={e => set(+e.target.value)} />
  </label>
);

const Card = ({ k, v }: { k: string; v: string }) => (
  <div className="p-2 rounded bg-slate-900 border border-slate-700">
    <div className="text-[11px] text-slate-400">{k}</div>
    <div className="font-semibold text-slate-100 truncate">{v}</div>
  </div>
);

/** Ön görünüş: Ekran genişliği, yüksekliği ve diagonal. */
function FrontScreenDiagram({ w, h, d, unit, large }: { w: number; h: number; d: number; unit: LengthUnit; large?: boolean }) {
  const pad = 42, vw = 520, vh = 260;
  const s = Math.min((vw - 2 * pad) / w, (vh - 2 * pad) / h);
  const pw = w * s, ph = h * s, x = (vw - pw) / 2, y = (vh - ph) / 2;
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className={large ? 'w-full h-full max-h-[82vh]' : 'w-full min-h-[240px] max-h-[340px]'}>
      <rect x={x} y={y} width={pw} height={ph} fill="#0b3a5b" stroke="#38bdf8" strokeWidth="2" />
      <line x1={x} y1={y} x2={x + pw} y2={y + ph} stroke="#38bdf8" strokeDasharray="5 4" opacity=".45" />
      <text x={vw / 2} y={y - 10} textAnchor="middle" fill="#cbd5e1" fontSize="13">
        {round(fromMeters(w, unit), 2)} {unit}
      </text>
      <text x={x - 10} y={vh / 2} textAnchor="middle" fill="#cbd5e1" fontSize="13" transform={`rotate(-90 ${x - 10} ${vh / 2})`}>
        {round(fromMeters(h, unit), 2)} {unit}
      </text>
      <text x={vw / 2} y={vh / 2 + 4} textAnchor="middle" fill="#7dd3fc" fontSize="12">
        {round(fromMeters(d, 'in'), 1)}&quot; ({round(fromMeters(d, unit), 2)} {unit})
      </text>
    </svg>
  );
}

/** Yan görünüş: projektör lensi → yüzey, görüntü yüksekliği, optik eksen. */
function SideDiagram({ r, unit, large }: { r: ProjectionResult; unit: LengthUnit; large?: boolean }) {
  const vw = 520, vh = 260, pad = 38;
  const spanY = Math.max(r.bounds.top, 0.2) - Math.min(r.bounds.bottom, -0.2);
  const s = Math.min((vw - 2 * pad - 60) / r.lensToSurface, (vh - 2 * pad) / spanY);
  const x0 = pad + 26, xs = x0 + r.lensToSurface * s;
  const yAxis = pad + Math.max(r.bounds.top, 0.2) * s;
  const yT = yAxis - r.bounds.top * s, yB = yAxis - r.bounds.bottom * s;
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className={large ? 'w-full h-full max-h-[82vh]' : 'w-full min-h-[240px] max-h-[340px]'}>
      <polygon points={`${x0},${yAxis} ${xs},${yT} ${xs},${yB}`} fill="#38bdf8" opacity=".15" stroke="#38bdf8" />
      <line x1={x0} y1={yAxis} x2={xs} y2={yAxis} stroke="#f59e0b" strokeDasharray="5 4" />
      <rect x={x0 - 30} y={yAxis - 13} width="30" height="26" fill="#475569" rx="2" />
      <circle cx={x0} cy={yAxis} r="4" fill="#f59e0b" />
      <line x1={xs} y1={yT} x2={xs} y2={yB} stroke="#e2e8f0" strokeWidth="3.5" />
      <text x={(x0 + xs) / 2} y={yAxis - 6} fill="#f59e0b" fontSize="11" textAnchor="middle">
        D = {round(fromMeters(r.lensToSurface, unit), 2)} {unit} (TR {round(r.throwRatio, 2)}:1)
      </text>
      <text x={xs + 6} y={(yT + yB) / 2 + 4} fill="#cbd5e1" fontSize="11">
        H = {round(fromMeters(r.imageHeight, unit), 2)} {unit}
      </text>
      <text x={x0 - 30} y={yAxis + 26} fill="#94a3b8" fontSize="10">projektör</text>
    </svg>
  );
}
