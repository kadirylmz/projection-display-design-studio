import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyze, Circuit, Load } from '../engine/electrical';
import { toDxf, toSvg } from '../engine/drawing';
import { electricalSingleLine, contentPlannerRoomPlan } from '../engine/drawings';
import { useProjectStore } from '../projectStore';
import { usePlannerStore } from '../plannerStore';
import { round } from '../engine/units';
import { download, svgToPng } from '../util';

type Sheet = 'room' | 'electrical';

export default function ElectricalDrawingStudio() {
  const { electrical, setElectrical, meta, setMeta } = useProjectStore();
  const { physicalRoom, surfaces, totalProjectors } = usePlannerStore();
  const [sheet, setSheet] = useState<Sheet>('room');
  const [cadRotation, setCadRotation] = useState<0 | 90 | 180 | 270>((meta.archPlanRotation as (0 | 90 | 180 | 270)) || 0);

  // 1 Adet Referans Projektör Gücü (W) ve Özel Manuel Adet Girişi
  const [singleProjWatt, setSingleProjWatt] = useState<number>(450);
  const [singleProjPf, setSingleProjPf] = useState<number>(0.95);
  const [singleProjModel, setSingleProjModel] = useState<string>('Lazer Projektör (WUXGA / 4K)');
  // Kullanıcının doğrudan bu ekrandan adet değiştirebilmesi için state:
  const [projectorQty, setProjectorQty] = useState<number>(totalProjectors || 10);

  // Sigorta ve Linye Tipi Seçimi (10A, 16A, 20A, 25A, 32A)
  const [selectedBreakerA, setSelectedBreakerA] = useState<number>(16);

  // SEÇMELİ METİN VE KATMAN GÖRÜNÜM AYARLARI (KULLANICI İSTEDİĞİNİ AÇIP KAPATIR)
  // 1) Mimari Oda Planı Seçenekleri:
  const [roomShowRoomDim, setRoomShowRoomDim] = useState<boolean>(true);
  const [roomShowThrowDim, setRoomShowThrowDim] = useState<boolean>(true);
  const [roomShowPjLabels, setRoomShowPjLabels] = useState<boolean>(true);
  const [roomShowElLabels, setRoomShowElLabels] = useState<boolean>(true);
  const [roomShowFrustums, setRoomShowFrustums] = useState<boolean>(true);
  const [roomShowTitleBlock, setRoomShowTitleBlock] = useState<boolean>(true);

  // 2) Elektrik Tek Hat Şeması Seçenekleri:
  const [elShowBusSpecs, setElShowBusSpecs] = useState<boolean>(true);
  const [elShowBreakerSpecs, setElShowBreakerSpecs] = useState<boolean>(true);
  const [elShowCableSpecs, setElShowCableSpecs] = useState<boolean>(true);
  const [elShowPhaseCurrent, setElShowPhaseCurrent] = useState<boolean>(true);
  const [elShowLoadDetails, setElShowLoadDetails] = useState<boolean>(true);

  // 3) Elektrik Paftası Linye Sütun Aralığı ve CAD Rapor Bildirimi:
  const [elColumnSpacing, setElColumnSpacing] = useState<number>(145);
  const [reportCadToast, setReportCadToast] = useState<boolean>(false);

  // 4) Her yazıyı bağımsız olarak mouse ile sürükleme ve yön (açı) değiştirme
  type TextOverride = { dx: number; dy: number; rotationDeg: number };
  const [textOverrides, setTextOverrides] = useState<Record<string, TextOverride>>(() => {
    try {
      const saved = localStorage.getItem('cad_text_overrides_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('cad_text_overrides_v1', JSON.stringify(textOverrides));
    } catch { /* ignore */ }
  }, [textOverrides]);

  const [selectedTextIdx, setSelectedTextIdx] = useState<number | null>(null);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    key: string;
    primIdx: number;
    startX: number;
    startY: number;
    origDx: number;
    origDy: number;
    origRot: number;
    inv: DOMMatrix | null;
  } | null>(null);

  const { loads, circuits, supply } = electrical;

  // Sigorta seçimine göre kablo kesiti ve standart akım taşıma kapasitesi (Iz)
  const breakerConfig = useMemo(() => {
    switch (selectedBreakerA) {
      case 10: return { cableMm2: 1.5, ampacityA: 18, label: '10A (3x1.5mm² Kablo)' };
      case 20: return { cableMm2: 4.0, ampacityA: 32, label: '20A (3x4.0mm² Kablo)' };
      case 25: return { cableMm2: 4.0, ampacityA: 32, label: '25A (3x4.0mm² Kablo)' };
      case 32: return { cableMm2: 6.0, ampacityA: 42, label: '32A (3x6.0mm² Kablo)' };
      case 16:
      default: return { cableMm2: 2.5, ampacityA: 25, label: '16A (3x2.5mm² Kablo)' };
    }
  }, [selectedBreakerA]);

  // IEC 60898 & NEC %80 sürekli çalışma kuralına göre 1 linyenin güvenli azami gücü (Watt)
  const safeCapacityW = useMemo(() => {
    const nominalW = selectedBreakerA * supply.voltage * singleProjPf;
    return Math.round(nominalW * 0.80);
  }, [selectedBreakerA, supply.voltage, singleProjPf]);

  // Watt değerine göre 1 linyeye bağlanabilecek GÜVENLİ projektör sayısı
  const maxPjPerCircuit = useMemo(() => {
    if (singleProjWatt <= 0) return 1;
    return Math.max(1, Math.floor(safeCapacityW / singleProjWatt));
  }, [safeCapacityW, singleProjWatt]);

  // Gerekli linye adedi
  const neededCircuits = useMemo(() => {
    return Math.ceil(projectorQty / maxPjPerCircuit);
  }, [projectorQty, maxPjPerCircuit]);

  // Girilen adet ve watt değerini linyelere doğru paylaştırarak circuits ve loads üretir (Sıfır çıkmasını engeller)
  const buildProjectorCircuits = useCallback(
    (
      qty: number,
      watt: number,
      pf: number,
      model: string,
      brk: number,
      phasesCount: 1 | 3,
      currentLoads: Load[],
      currentCircuits: Circuit[]
    ) => {
      const nomW = brk * supply.voltage * pf;
      const safeW = nomW * 0.80;
      const maxPerCir = Math.max(1, Math.floor(safeW / Math.max(1, watt)));
      const nCircuits = Math.ceil(qty / maxPerCir);

      const cfg = brk === 32
        ? { cableMm2: 6.0, ampacityA: 42 }
        : brk === 25 || brk === 20
        ? { cableMm2: 4.0, ampacityA: 32 }
        : brk === 10
        ? { cableMm2: 1.5, ampacityA: 18 }
        : { cableMm2: 2.5, ampacityA: 25 };

      const newLoads: Load[] = [];
      const newCircuits: Circuit[] = [];
      const phaseList: ('L1' | 'L2' | 'L3')[] = ['L1', 'L2', 'L3'];

      let remaining = qty;
      for (let i = 0; i < nCircuits; i++) {
        const countOnThisCircuit = Math.min(remaining, maxPerCir);
        remaining -= countOnThisCircuit;
        const loadId = `L-PJ-${i + 1}`;
        const circuitId = `C-PJ-${i + 1}`;

        newLoads.push({
          id: loadId,
          name: `${model} (Grup ${i + 1})`,
          qty: countOnThisCircuit,
          powerW: watt,
          pf,
        });

        newCircuits.push({
          id: circuitId,
          name: `Linye-${i + 1} (${countOnThisCircuit}x Projektör)`,
          loadIds: [loadId],
          phase: phasesCount === 3 ? phaseList[i % 3] : 'L1',
          cableMm2: cfg.cableMm2,
          lengthM: 25,
          ampacityA: cfg.ampacityA,
          breakerIcuKa: 6,
          prospectiveFaultKa: 4.5,
          tripCurve: 'C',
          inrushA: Math.max(15, Math.round(((countOnThisCircuit * watt) / Math.max(110, supply.voltage || 230)) * 4)),
        });
      }

      // Varsa kullanıcının manuel eklediği ek yükleri koru
      const nonPjLoads = currentLoads.filter(
        l => !l.id.startsWith('L-PJ-') && l.id !== 'PJ-MAIN' && !l.name.includes('Projektör')
      );
      const nonPjCircuits = currentCircuits.filter(
        c => !c.id.startsWith('C-PJ-') && !c.name.includes('Projeksiyon') && !c.name.includes('Projektör')
      );

      return {
        loads: [...newLoads, ...nonPjLoads],
        circuits: [...newCircuits, ...nonPjCircuits],
      };
    },
    [supply.voltage]
  );

  // Değerler her değiştiğinde elektriği otomatik güncelle ve sıfır yazmasını kesin olarak önle
  useEffect(() => {
    const res = buildProjectorCircuits(
      projectorQty,
      singleProjWatt,
      singleProjPf,
      singleProjModel,
      selectedBreakerA,
      supply.phases,
      loads,
      circuits
    );
    setElectrical({
      loads: res.loads,
      circuits: res.circuits,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectorQty,
    singleProjWatt,
    singleProjPf,
    singleProjModel,
    selectedBreakerA,
    supply.phases,
    supply.voltage,
  ]);

  const applyElectricalCalculation = (
    qtyToApply = projectorQty,
    wattToApply = singleProjWatt,
    brkToApply = selectedBreakerA
  ) => {
    const res = buildProjectorCircuits(
      qtyToApply,
      wattToApply,
      singleProjPf,
      singleProjModel,
      brkToApply,
      supply.phases,
      loads,
      circuits
    );
    setElectrical({
      loads: res.loads,
      circuits: res.circuits,
    });
  };

  const elRes = useMemo(() => {
    try {
      return { r: analyze(loads, circuits, supply), err: null as string | null };
    } catch (e) {
      return { r: null, err: (e as Error).message };
    }
  }, [loads, circuits, supply]);

  // CAD Paftası Üretimi (Ölçülendirmeler, Prizler ve Frustumlar ile)
  const baseDrawing = useMemo(() => {
    try {
      if (sheet === 'room') {
        return contentPlannerRoomPlan(physicalRoom, surfaces, {
          customProjectorQty: projectorQty,
          perProjectorWatt: singleProjWatt,
          showRoomDimensions: roomShowRoomDim,
          showThrowDimensions: roomShowThrowDim,
          showProjectorLabels: roomShowPjLabels,
          showElectricalLabels: roomShowElLabels,
          showFrustums: roomShowFrustums,
          showTitleBlock: roomShowTitleBlock,
        });
      }
      if (sheet === 'electrical' && elRes.r) {
        return electricalSingleLine(loads, circuits, supply, elRes.r, {
          showBusSpecs: elShowBusSpecs,
          showBreakerSpecs: elShowBreakerSpecs,
          showCableSpecs: elShowCableSpecs,
          showPhaseAndCurrent: elShowPhaseCurrent,
          showLoadDetails: elShowLoadDetails,
          columnSpacing: elColumnSpacing,
        });
      }
      return null;
    } catch (e) {
      console.error('CAD Drawing Error:', e);
      return null;
    }
  }, [
    sheet,
    physicalRoom,
    surfaces,
    loads,
    circuits,
    supply,
    elRes.r,
    projectorQty,
    singleProjWatt,
    roomShowRoomDim,
    roomShowThrowDim,
    roomShowPjLabels,
    roomShowElLabels,
    roomShowFrustums,
    roomShowTitleBlock,
    elShowBusSpecs,
    elShowBreakerSpecs,
    elShowCableSpecs,
    elShowPhaseCurrent,
    elShowLoadDetails,
    elColumnSpacing,
  ]);

  // Kullanıcının sürüklediği / döndürdüğü yazıları uygula (SVG, DXF ve PNG çıktılarının tamamına yansır)
  const activeDrawing = useMemo(() => {
    if (!baseDrawing) return null;
    return {
      ...baseDrawing,
      prims: baseDrawing.prims.map((p, idx) => {
        if (p.t !== 'text') return p;
        const ov = textOverrides[`${sheet}::${idx}`];
        if (!ov) return p;
        return {
          ...p,
          x: p.x + ov.dx,
          y: p.y + ov.dy,
          rotationDeg: ov.rotationDeg,
        };
      }),
    };
  }, [baseDrawing, textOverrides, sheet]);

  // Mouse ile yazı sürükleme olayları
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      let dSvgX = e.clientX - drag.startX;
      let dSvgY = e.clientY - drag.startY;
      if (drag.inv) {
        const p1 = new DOMPoint(drag.startX, drag.startY).matrixTransform(drag.inv);
        const p2 = new DOMPoint(e.clientX, e.clientY).matrixTransform(drag.inv);
        dSvgX = p2.x - p1.x;
        dSvgY = p2.y - p1.y;
      }
      // CAD Y ekseni SVG Y ekseninin tersidir
      const nextDx = Math.round(drag.origDx + dSvgX);
      const nextDy = Math.round(drag.origDy - dSvgY);
      setTextOverrides(prev => ({
        ...prev,
        [drag.key]: {
          dx: nextDx,
          dy: nextDy,
          rotationDeg: prev[drag.key]?.rotationDeg ?? drag.origRot,
        },
      }));
    };
    const onMouseUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleSvgMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as Element | null)?.closest?.('text[data-prim-idx]');
    if (!target) return;
    const idxAttr = target.getAttribute('data-prim-idx');
    if (idxAttr === null) return;
    const primIdx = Number(idxAttr);
    if (!Number.isFinite(primIdx)) return;

    e.preventDefault();
    setSelectedTextIdx(primIdx);

    const key = `${sheet}::${primIdx}`;
    const existing = textOverrides[key] ?? { dx: 0, dy: 0, rotationDeg: 0 };
    const svgEl = svgContainerRef.current?.querySelector('svg');
    const contentG = svgEl?.querySelector('g[data-cad-content="1"]') as SVGGElement | null;
    const ctm = (contentG || svgEl)?.getScreenCTM() ?? null;
    const inv = ctm ? ctm.inverse() : null;

    dragRef.current = {
      key,
      primIdx,
      startX: e.clientX,
      startY: e.clientY,
      origDx: existing.dx,
      origDy: existing.dy,
      origRot: existing.rotationDeg,
      inv,
    };
  };

  const selectedTextPrim = useMemo(() => {
    if (selectedTextIdx === null || !activeDrawing) return null;
    const p = activeDrawing.prims[selectedTextIdx];
    return p && p.t === 'text' ? p : null;
  }, [selectedTextIdx, activeDrawing]);

  const selectedKey = selectedTextIdx !== null ? `${sheet}::${selectedTextIdx}` : null;
  const selectedOverride = selectedKey ? (textOverrides[selectedKey] ?? { dx: 0, dy: 0, rotationDeg: 0 }) : null;

  const setSelectedRotation = (deg: number) => {
    if (!selectedKey) return;
    const norm = ((deg % 360) + 360) % 360;
    setTextOverrides(prev => {
      const cur = prev[selectedKey] ?? { dx: 0, dy: 0, rotationDeg: 0 };
      return { ...prev, [selectedKey]: { ...cur, rotationDeg: norm } };
    });
  };

  const sheetHasOverrides = Object.keys(textOverrides).some(k => k.startsWith(`${sheet}::`));

  const svg = useMemo(
    () => (activeDrawing ? toSvg(activeDrawing, { background: '#0b1220', rotationDeg: cadRotation }) : ''),
    [activeDrawing, cadRotation]
  );

  const addLoad = () => {
    const id = `L${Date.now().toString(36).slice(-3).toUpperCase()}`;
    setElectrical({
      loads: [
        ...loads,
        { id, name: `Ek Cihaz (Medya Sunucusu/Ses) ${loads.length + 1}`, qty: 1, powerW: 350, pf: 0.95 },
      ],
    });
  };

  const updLoad = (id: string, p: Partial<Load>) =>
    setElectrical({ loads: loads.map(l => (l.id === id ? { ...l, ...p } : l)) });

  const delLoad = (id: string) =>
    setElectrical({
      loads: loads.filter(l => l.id !== id),
      circuits: circuits.map(c => ({ ...c, loadIds: c.loadIds.filter(x => x !== id) })),
    });

  const addCircuit = () => {
    const id = `C${Date.now().toString(36).slice(-3).toUpperCase()}`;
    setElectrical({
      circuits: [
        ...circuits,
        {
          id,
          name: `Linye-${circuits.length + 1}`,
          loadIds: [],
          phase: 'L1',
          cableMm2: 2.5,
          lengthM: 20,
          ampacityA: 25,
          breakerIcuKa: 6,
          prospectiveFaultKa: 4.5,
          tripCurve: 'C',
          inrushA: 25,
        },
      ],
    });
  };

  const updCircuit = (id: string, p: Partial<Circuit>) =>
    setElectrical({ circuits: circuits.map(c => (c.id === id ? { ...c, ...p } : c)) });

  const delCircuit = (id: string) =>
    setElectrical({ circuits: circuits.filter(c => c.id !== id) });

  return (
    <div className="grid lg:grid-cols-[440px_1fr] gap-4 h-full">
      {/* SOL PANEL: PROJEKTÖR ADET & WATT GİRİŞİ, ELEKTRİK HESAPLARI VE LİNYELER */}
      <div className="space-y-3 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto text-xs" style={{ maxHeight: '88vh' }}>
        <div className="border-b border-slate-700 pb-2">
          <h2 className="text-sm font-bold text-sky-400">CAD (AutoCAD DXF) & Elektrik Şeması</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Elektrikçinin şantiyede tek bakışta anlayacağı net mesafeler, askı kotları ve 230V priz yerleşimi.
          </p>
        </div>

        {/* 1. DOĞRUDAN PROJEKTÖR ADET VE WATT GİRİŞİ (TEK KARTTA HEPSİ) */}
        <div className="p-3 rounded bg-slate-950 border border-emerald-700/80 space-y-2.5">
          <div className="flex justify-between items-center border-b border-slate-800 pb-1">
            <span className="font-bold text-emerald-300 uppercase tracking-wide text-[11px]">
              ⚡ Projektör Adet & Güç Girişi
            </span>
            <button
              onClick={() => {
                setProjectorQty(totalProjectors);
                applyElectricalCalculation(totalProjectors);
              }}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold text-[10px] border border-slate-700"
              title="İçerik planlayıcıdaki yüzey toplamını al"
            >
              Planlayıcıdan Al ({totalProjectors} Adet)
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label>
              Projektör Adedi (Adet)
              <input
                className="inp font-bold text-amber-300 text-sm"
                type="number"
                min="1"
                max="100"
                value={projectorQty}
                onChange={e => {
                  const val = Math.max(1, Math.round(+e.target.value));
                  setProjectorQty(val);
                }}
              />
            </label>

            <label>
              1 Adet Projektör Gücü (W)
              <input
                className="inp font-bold text-emerald-300 text-sm"
                type="number"
                step="25"
                min="50"
                max="5000"
                value={singleProjWatt}
                onChange={e => setSingleProjWatt(Math.max(50, +e.target.value))}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label>
              Projektör Cihaz Modeli
              <input
                className="inp font-medium text-slate-200"
                value={singleProjModel}
                onChange={e => setSingleProjModel(e.target.value)}
              />
            </label>
            <label>
              Güç Faktörü (cos φ)
              <input
                className="inp font-semibold text-slate-300"
                type="number"
                step="0.01"
                min="0.5"
                max="1"
                value={singleProjPf}
                onChange={e => setSingleProjPf(Math.min(1, Math.max(0.5, +e.target.value)))}
              />
            </label>
          </div>

          {/* SİGORTA ANMA AKIMI VE ŞEBEKE BESLEMESİ SEÇİMİ */}
          <div className="grid grid-cols-2 gap-2">
            <label>
              Linye Sigortası (Amper)
              <select
                className="inp font-bold text-amber-300"
                value={selectedBreakerA}
                onChange={e => setSelectedBreakerA(+e.target.value)}
              >
                <option value={10}>10 A (3x1.5mm² - Düşük Güç)</option>
                <option value={16}>16 A (3x2.5mm² - Standart Priz)</option>
                <option value={20}>20 A (3x4.0mm² - Güçlü AV Hattı)</option>
                <option value={25}>25 A (3x4.0mm² - Yüksek Güç)</option>
                <option value={32}>32 A (3x6.0mm² - Ağır Yük Linyesi)</option>
              </select>
            </label>

            <label>
              Şebeke Beslemesi
              <select
                className="inp font-bold text-sky-300"
                value={supply.phases}
                onChange={e => setElectrical({ supply: { ...supply, phases: +e.target.value as 1 | 3 } })}
              >
                <option value={1}>1 Faz (230V Şebeke)</option>
                <option value={3}>3 Faz (400V Sanayi / Bina)</option>
              </select>
            </label>
          </div>

          <div className="p-2.5 rounded bg-slate-900 border border-emerald-800/80 font-mono text-[11px] space-y-1.5">
            <div className="flex justify-between items-center text-slate-200">
              <span>Toplam Projeksiyon Gücü:</span>
              <b className="text-amber-300 text-xs">
                {projectorQty} Adet × {singleProjWatt}W = {projectorQty * singleProjWatt} W ({(projectorQty * singleProjWatt / 1000).toFixed(2)} kW)
              </b>
            </div>

            <div className="flex justify-between items-center text-slate-300 text-[10px]">
              <span>1 Linye Güvenli Kapasitesi:</span>
              <span className="text-sky-300">
                ~{safeCapacityW} W (%80 Güvenlik Sınırı @{selectedBreakerA}A)
              </span>
            </div>

            <div className="flex justify-between items-center text-slate-300 text-[10px]">
              <span>Linye Başına Güvenli Cihaz:</span>
              <b className="text-amber-200">
                {maxPjPerCircuit} Adet Projektör ({maxPjPerCircuit * singleProjWatt} W / Linye)
              </b>
            </div>

            <div className="flex justify-between items-center border-t border-slate-800 pt-1 text-emerald-300 font-bold">
              <span>Gerekli Linye Sayısı:</span>
              <span>
                {neededCircuits} Adet Linye ({selectedBreakerA}A Sigorta, {breakerConfig.cableMm2}mm² Kablo)
              </span>
            </div>

            {projectorQty * singleProjWatt > 9000 && supply.phases === 1 && (
              <div className="text-[10px] text-amber-300 bg-amber-950/70 p-1.5 rounded border border-amber-800">
                💡 <b>Mühendislik Tavsiyesi:</b> Toplam güç {((projectorQty * singleProjWatt) / 1000).toFixed(1)} kW olduğundan tek faza 98A aşırı yük binmemesi için <b>3 Faz (400V)</b> besleme seçilmiştir / önerilir.
              </div>
            )}
          </div>

          <button
            onClick={() => applyElectricalCalculation(projectorQty, singleProjWatt, selectedBreakerA)}
            className="w-full py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow flex justify-center items-center gap-1.5"
          >
            <span>⚡ Çizim ve Elektrik Linyelerini Yeniden Dağıt</span>
          </button>
        </div>

        {/* 2. İÇERİK PLANLAYICIDAN GELEN ODA ÖLÇÜLERİ */}
        <div className="p-2.5 rounded bg-slate-950 border border-sky-800/80 space-y-1.5">
          <div className="flex justify-between items-center border-b border-slate-800 pb-1">
            <b className="text-sky-300">🏛️ Mimari Oda Kabuğu (Çizim Alanı):</b>
            <span className="text-[10px] text-slate-400 font-mono">
              {physicalRoom.widthM}m × {physicalRoom.lengthM}m × Tavan: {physicalRoom.heightM}m
            </span>
          </div>

          <div className="text-[10px] text-slate-300 space-y-0.5 font-mono">
            {surfaces.map(s => (
              <div key={s.id} className="flex justify-between border-b border-slate-900 pb-0.5">
                <span>{s.name}:</span>
                <span className="text-emerald-400">
                  {s.cols * s.rows} PJ (@D={s.throwDistM}m, Lens {s.throwRatio}:1)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. ŞEBEKE BESLEMESİ */}
        <div className="space-y-1 border-t border-slate-700 pt-2">
          <b className="text-slate-200">Elektrik Şebekesi & Besleme:</b>
          <div className="grid grid-cols-3 gap-2">
            <label>
              Gerilim (V)
              <input
                className="inp"
                type="number"
                value={supply.voltage}
                onChange={e => setElectrical({ supply: { ...supply, voltage: +e.target.value || 230 } })}
              />
            </label>
            <label>
              Faz Sayısı
              <select
                className="inp"
                value={supply.phases}
                onChange={e => setElectrical({ supply: { ...supply, phases: +e.target.value as 1 | 3 } })}
              >
                <option value={1}>1 Faz (230V)</option>
                <option value={3}>3 Faz (400V)</option>
              </select>
            </label>
            <label>
              Eşzamanlılık
              <input
                className="inp"
                type="number"
                step="0.05"
                min="0.1"
                max="1"
                value={supply.diversity}
                onChange={e => setElectrical({ supply: { ...supply, diversity: +e.target.value || 1 } })}
              />
            </label>
          </div>
        </div>

        {/* 4. YÜKLER VE LİNYELER */}
        <div className="space-y-2 border-t border-slate-700 pt-2">
          <div className="flex justify-between items-center">
            <b className="text-slate-200">Yük Listesi ({loads.length})</b>
            <button className="px-2 py-0.5 bg-sky-700 rounded text-white text-[10px]" onClick={addLoad}>
              + Ek Yük
            </button>
          </div>
          {loads.map(l => (
            <div key={l.id} className="grid grid-cols-[1fr_45px_58px_22px] gap-1 items-center">
              <input className="inp !mt-0 font-medium" value={l.name} onChange={e => updLoad(l.id, { name: e.target.value })} />
              <input
                className="inp !mt-0 text-center font-bold text-amber-300"
                type="number"
                min="1"
                value={l.qty}
                onChange={e => updLoad(l.id, { qty: Math.max(1, +e.target.value) })}
                title="Adet"
              />
              <input
                className="inp !mt-0 text-right"
                type="number"
                min="1"
                value={l.powerW}
                onChange={e => updLoad(l.id, { powerW: Math.max(1, +e.target.value) })}
                title="Birim W"
              />
              <button className="text-red-400 hover:text-red-300" onClick={() => delLoad(l.id)}>✕</button>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-slate-700 pt-2">
          <div className="flex justify-between items-center gap-1">
            <b className="text-slate-200">Linyeler / Devreler ({circuits.length})</b>
            <div className="flex items-center gap-1">
              <button
                className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 rounded text-white text-[10px]"
                title="Eksik koruma koordinasyonu alanlarını IEC 60898-1 tali pano standartlarıyla doldur (Icu=6 kA, Ik=4.5 kA, C Eğrisi, İnruş=4×Ib)"
                onClick={() =>
                  setElectrical({
                    circuits: circuits.map(c => ({
                      ...c,
                      breakerIcuKa: c.breakerIcuKa ?? 6,
                      prospectiveFaultKa: c.prospectiveFaultKa ?? 4.5,
                      tripCurve: c.tripCurve ?? 'C',
                      inrushA: c.inrushA ?? 25,
                    })),
                  })
                }
              >
                IEC Doldur
              </button>
              <button className="px-2 py-0.5 bg-sky-700 rounded text-white text-[10px]" onClick={addCircuit}>
                + Linye
              </button>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 bg-slate-950/70 border border-slate-800 rounded px-2 py-1 leading-snug">
            <b>Standartlar (IEC 60898-1 / TS HD 60364):</b> Tali pano için <b>Icu/Icn ≥ 6 kA</b>, beklenen <b>Ik ≤ 4.5 kA</b>, projektör SMPS yükleri için <b>C Eğrisi (5–10×In)</b> ve <b>İnruş ≈ 4×Ib</b> önerilir.
          </div>
          {circuits.map(c => (
            <div key={c.id} className="p-2 rounded border border-slate-800 bg-slate-950 space-y-1">
              <div className="grid grid-cols-[1fr_56px_22px] gap-1 items-center">
                <input className="inp !mt-0" value={c.name} onChange={e => updCircuit(c.id, { name: e.target.value })} />
                <select className="inp !mt-0" value={c.phase} onChange={e => updCircuit(c.id, { phase: e.target.value as Circuit['phase'] })}>
                  <option value="L1">L1</option><option value="L2">L2</option><option value="L3">L3</option><option value="3P">3P</option>
                </select>
                <button className="text-red-400" onClick={() => delCircuit(c.id)}>✕</button>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <label>Kablo (mm²)<input className="inp !mt-0" type="number" step="0.5" value={c.cableMm2 ?? 2.5} onChange={e => updCircuit(c.id, { cableMm2: +e.target.value || 2.5 })} /></label>
                <label>Mesafe (m)<input className="inp !mt-0" type="number" value={c.lengthM ?? 25} onChange={e => updCircuit(c.id, { lengthM: +e.target.value || 25 })} /></label>
                <label>Icu/Icn (kA)<input className="inp !mt-0" type="number" step="0.5" placeholder="ör. 6" value={c.breakerIcuKa ?? ''} onChange={e => updCircuit(c.id, { breakerIcuKa: e.target.value ? +e.target.value : undefined })} /></label>
                <label>Beklenen Ik (kA)<input className="inp !mt-0" type="number" step="0.5" placeholder="ör. 4.5" value={c.prospectiveFaultKa ?? ''} onChange={e => updCircuit(c.id, { prospectiveFaultKa: e.target.value ? +e.target.value : undefined })} /></label>
                <label>Açma Eğrisi
                  <select className="inp !mt-0" value={c.tripCurve ?? ''} onChange={e => updCircuit(c.id, { tripCurve: (e.target.value || undefined) as Circuit['tripCurve'] })}>
                    <option value="">Seçiniz</option>
                    <option value="B">B (3–5×In)</option>
                    <option value="C">C (5–10×In)</option>
                    <option value="D">D (10–20×In)</option>
                  </select>
                </label>
                <label>İnruş (A)<input className="inp !mt-0" type="number" step="1" placeholder="ör. 25" value={c.inrushA ?? ''} onChange={e => updCircuit(c.id, { inrushA: e.target.value ? +e.target.value : undefined })} /></label>
                <label className="col-span-2 flex items-center gap-1.5 pt-1 text-[10px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(c.selectivityVerified)}
                    onChange={e => updCircuit(c.id, { selectivityVerified: e.target.checked })}
                  />
                  <span>Üretici Selektivite Koordinasyon Tablosu Doğrulandı (IEC 60898-1 / 60947-2)</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SAĞ PANEL: CAD ÇİZİM ÖNİZLEME, ÖLÇÜ KOTLARI VE ELEKTRİKÇİ ÇIKTILARI */}
      <div className="space-y-3 min-w-0 flex flex-col">
        {elRes.err && <p className="text-red-400 text-sm">⚠ {elRes.err}</p>}
        {elRes.r && (
          <div className="grid sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded bg-slate-900 border border-slate-700">
              <div className="text-slate-400 text-[10px]">Toplam / Talep Gücü</div>
              <b className="text-amber-300">{Math.round(elRes.r.totalW)} W / {Math.round(elRes.r.demandW)} W</b>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-700">
              <div className="text-slate-400 text-[10px]">Toplam Akım (Ib)</div>
              <b className="text-sky-300">{round(elRes.r.totalIbA, 2)} A</b>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-700">
              <div className="text-slate-400 text-[10px]">Ana Kesici (IEC 60898)</div>
              <b className="text-emerald-400">{elRes.r.mainBreakerA ? `${elRes.r.mainBreakerA} A` : 'Bölünmeli'}</b>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-700">
              <div className="text-slate-400 text-[10px]">Faz Dağılımı (L1/L2/L3)</div>
              <b className="text-slate-200">{Math.round(elRes.r.phaseLoadsW.L1)}/{Math.round(elRes.r.phaseLoadsW.L2)}/{Math.round(elRes.r.phaseLoadsW.L3)} W</b>
            </div>
          </div>
        )}

        {/* CAD PAFTASI SEÇİM BARI */}
        <div className="flex flex-wrap gap-2 items-center text-xs p-2.5 rounded bg-slate-900 border border-slate-800">
          <span className="font-bold text-slate-300">CAD Paftası:</span>
          <button
            onClick={() => setSheet('room')}
            className={`px-3 py-1.5 rounded font-bold transition flex items-center gap-1.5 ${
              sheet === 'room' ? 'bg-sky-600 text-white shadow' : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <span>🏛️ Oda & Projeksiyon CAD Planı (Üstten Görünüş)</span>
          </button>
          <button
            onClick={() => setSheet('electrical')}
            className={`px-3 py-1.5 rounded font-bold transition flex items-center gap-1.5 ${
              sheet === 'electrical' ? 'bg-amber-600 text-white shadow' : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <span>⚡ Elektrik Tek Hat Şeması</span>
          </button>

          {activeDrawing && (
            <div className="ml-auto flex items-center gap-1.5">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
                <span className="text-slate-400 font-semibold text-[11px]">🔄 Çevir:</span>
                {([0, 90, 180, 270] as const).map(deg => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => {
                      setCadRotation(deg);
                      setMeta({ archPlanRotation: deg });
                    }}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition ${
                      cadRotation === deg
                        ? 'bg-sky-500 text-white shadow'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
              <button
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded font-bold text-white shadow flex items-center gap-1"
                onClick={() => download(`${sheet === 'room' ? 'oda-projeksiyon-plani' : 'elektrik-semasi'}.dxf`, toDxf(activeDrawing), 'application/dxf')}
              >
                <span>💾 AutoCAD DXF İndir (.DXF)</span>
              </button>
              <button
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
                onClick={() => download(`${sheet}-cizim.svg`, svg, 'image/svg+xml')}
              >
                SVG
              </button>
              <button
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
                onClick={async () => download(`${sheet}-cizim.png`, await svgToPng(toSvg(activeDrawing, { pixelWidth: 2600, rotationDeg: cadRotation }), 2600))}
              >
                PNG
              </button>
              <button
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded font-bold text-white shadow flex items-center gap-1 transition"
                onClick={async () => {
                  try {
                    const blob = await svgToPng(toSvg(activeDrawing, { pixelWidth: 2600, background: '#0b1220', rotationDeg: cadRotation }), 2600);
                    const reader = new FileReader();
                    reader.onload = () => {
                      const dataUrl = reader.result as string;
                      const prevMeta = useProjectStore.getState().meta;
                      const existing = prevMeta.room3dSnapshots && prevMeta.room3dSnapshots.length > 0
                        ? prevMeta.room3dSnapshots
                        : (prevMeta.room3dSnapshotUrl ? [prevMeta.room3dSnapshotUrl] : []);
                      useProjectStore.getState().setMeta({
                        archPlanRotation: cadRotation,
                        room3dSnapshotUrl: dataUrl,
                        room3dSnapshots: [...existing, dataUrl],
                      });
                      setReportCadToast(true);
                      setTimeout(() => setReportCadToast(false), 3000);
                    };
                    reader.readAsDataURL(blob);
                  } catch (err) {
                    console.error('CAD çizimini rapora aktarma hatası:', err);
                  }
                }}
                title="Mevcut CAD Çizimini Müşteri Raporu Görsel Simülasyon Galerisine Ekler (Seçilen Çevirme Açısıyla)"
              >
                <span>{reportCadToast ? '✓ Rapora Eklendi!' : '📋 Çizimi Rapora Ekle'}</span>
              </button>
            </div>
          )}
        </div>

        {/* SEÇMELİ YAZI VE KATMAN KONTROL PANELİ (İSTENENLER AÇILIP KAPATILIR) */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-slate-900/90 border border-slate-800 text-[11px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-amber-300 flex items-center gap-1">
              <span>✍️ Seçmeli Yazılar:</span>
            </span>

            {sheet === 'room' ? (
              <>
                <label className="flex items-center gap-1 cursor-pointer text-slate-200 hover:text-white" title="Oda dış mimari genişlik ve boy ölçü çizgileri">
                  <input type="checkbox" checked={roomShowRoomDim} onChange={e => setRoomShowRoomDim(e.target.checked)} />
                  <span>Oda Dış Kotları</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-amber-300 hover:text-amber-200" title="Projektörlerin duvara dik atım mesafesi (D) ölçü çizgileri">
                  <input type="checkbox" checked={roomShowThrowDim} onChange={e => setRoomShowThrowDim(e.target.checked)} />
                  <span>Atım Mesafesi (D)</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-sky-300 hover:text-sky-200" title="Cihaz adı ve tavandan montaj kotu (H)">
                  <input type="checkbox" checked={roomShowPjLabels} onChange={e => setRoomShowPjLabels(e.target.checked)} />
                  <span>Cihaz Adı & Askı Kotu (H)</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-rose-300 hover:text-rose-200" title="230V Priz sembolü ve watt güç etiketi">
                  <input type="checkbox" checked={roomShowElLabels} onChange={e => setRoomShowElLabels(e.target.checked)} />
                  <span>230V Priz & Güç (W)</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-emerald-300 hover:text-emerald-200" title="Işık atım konileri (üçgen frustum çizgileri)">
                  <input type="checkbox" checked={roomShowFrustums} onChange={e => setRoomShowFrustums(e.target.checked)} />
                  <span>Işık Konileri</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-slate-300 hover:text-white" title="Sağ alt mimari antet ve sembol lejantı">
                  <input type="checkbox" checked={roomShowTitleBlock} onChange={e => setRoomShowTitleBlock(e.target.checked)} />
                  <span>Antet & Lejant</span>
                </label>
              </>
            ) : (
              <>
                <label className="flex items-center gap-1 cursor-pointer text-sky-300 hover:text-sky-200" title="Şebeke beslemesi ve ana dağıtım barası detayları">
                  <input type="checkbox" checked={elShowBusSpecs} onChange={e => setElShowBusSpecs(e.target.checked)} />
                  <span>Bara & Şebeke</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-amber-300 hover:text-amber-200" title="Sigorta ve ana kesici amper değerleri">
                  <input type="checkbox" checked={elShowBreakerSpecs} onChange={e => setElShowBreakerSpecs(e.target.checked)} />
                  <span>Sigortalar (16A / 40A)</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-emerald-300 hover:text-emerald-200" title="Kablo kesiti (mm2), mesafe (m) ve gerilim düşümü (%dU)">
                  <input type="checkbox" checked={elShowCableSpecs} onChange={e => setElShowCableSpecs(e.target.checked)} />
                  <span>Kablo (3x2.5mm²) & %dU</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-indigo-300 hover:text-indigo-200" title="Faz dağılımı ve linye işletme akımı (Ib)">
                  <input type="checkbox" checked={elShowPhaseCurrent} onChange={e => setElShowPhaseCurrent(e.target.checked)} />
                  <span>Faz & Akım (Ib)</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-slate-200 hover:text-white" title="Yük kutusu, cihaz modelleri ve watt detayları">
                  <input type="checkbox" checked={elShowLoadDetails} onChange={e => setElShowLoadDetails(e.target.checked)} />
                  <span>Yük & Watt Detayı</span>
                </label>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (sheet === 'room') {
                  setRoomShowRoomDim(true);
                  setRoomShowThrowDim(true);
                  setRoomShowPjLabels(true);
                  setRoomShowElLabels(true);
                  setRoomShowFrustums(true);
                  setRoomShowTitleBlock(true);
                } else {
                  setElShowBusSpecs(true);
                  setElShowBreakerSpecs(true);
                  setElShowCableSpecs(true);
                  setElShowPhaseCurrent(true);
                  setElShowLoadDetails(true);
                }
              }}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px]"
            >
              Tümünü Aç
            </button>
            <button
              onClick={() => {
                if (sheet === 'room') {
                  setRoomShowRoomDim(false);
                  setRoomShowThrowDim(false);
                  setRoomShowFrustums(false);
                  setRoomShowTitleBlock(false);
                  setRoomShowPjLabels(true);
                  setRoomShowElLabels(true);
                } else {
                  setElShowBusSpecs(false);
                  setElShowCableSpecs(false);
                  setElShowPhaseCurrent(false);
                  setElShowBreakerSpecs(true);
                  setElShowLoadDetails(true);
                }
              }}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 text-[10px]"
              title="Yalnızca temel cihaz ve sigorta etiketlerini bırakır"
            >
              Sade Görünüm
            </button>
          </div>
        </div>

        {/* YAZI SÜRÜKLEME & YÖN KONTROL ÇUBUĞU */}
        <div className="bg-slate-900/90 border border-slate-800 rounded px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          {selectedTextPrim && selectedOverride ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-sky-950 border border-sky-700/60 text-sky-300 font-semibold max-w-[280px] truncate" title={selectedTextPrim.text}>
                Seçili Yazı: {selectedTextPrim.text}
              </span>
              <span className="text-slate-400">Yön:</span>
              <div className="flex items-center gap-1">
                {[
                  { deg: 0, label: '0° Yatay' },
                  { deg: 90, label: '90° Dikey ↑' },
                  { deg: 180, label: '180° Ters' },
                  { deg: 270, label: '270° Dikey ↓' },
                ].map(opt => (
                  <button
                    key={opt.deg}
                    type="button"
                    onClick={() => setSelectedRotation(opt.deg)}
                    className={`px-2 py-0.5 rounded border text-[10.5px] font-medium transition ${
                      selectedOverride.rotationDeg === opt.deg
                        ? 'bg-sky-600 border-sky-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedRotation(selectedOverride.rotationDeg - 15)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
                  title="Saat yönünde 15° döndür"
                >
                  ↻ -15°
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRotation(selectedOverride.rotationDeg + 15)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
                  title="Saat yönünün tersine 15° döndür"
                >
                  ↺ +15°
                </button>
                <input
                  type="number"
                  value={selectedOverride.rotationDeg}
                  onChange={e => setSelectedRotation(Number(e.target.value) || 0)}
                  className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center font-mono text-amber-300"
                  title="Serbest açı (derece)"
                />
                <span className="text-slate-500">°</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!selectedKey) return;
                  setTextOverrides(prev => {
                    const next = { ...prev };
                    delete next[selectedKey];
                    return next;
                  });
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-[10.5px]"
              >
                Bu Yazıyı Sıfırla
              </button>
            </div>
          ) : (
            <span className="text-slate-400">
              💡 <strong className="text-slate-200">Mouse ile Taşı &amp; Döndür:</strong> Çizimdeki herhangi bir yazıyı (örn. <code className="text-sky-300">PJ-Sol.1</code>, <code className="text-sky-300">D = 5.00 m</code>, <code className="text-sky-300">ODA GENİŞLİĞİ</code>, başlık) tutup istediğiniz yere sürükleyin veya tıklayıp yönünü değiştirin.
            </span>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {sheet === 'electrical' && (
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                <span className="text-slate-400 text-[10px]">Linye Sütun Genişliği:</span>
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10.5px]"
                  onClick={() => setElColumnSpacing(v => Math.max(90, v - 15))}
                  title="Linyeleri birbirine yaklaştır"
                >
                  ◀ Daralt
                </button>
                <span className="font-mono text-amber-300 w-12 text-center text-[10.5px]">
                  {elColumnSpacing} mm
                </span>
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10.5px]"
                  onClick={() => setElColumnSpacing(v => Math.min(260, v + 15))}
                  title="Linyeleri birbirinden uzaklaştır"
                >
                  Genişlet ▶
                </button>
                {elColumnSpacing !== 145 && (
                  <button
                    type="button"
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px]"
                    onClick={() => setElColumnSpacing(145)}
                    title="Varsayılan 145 mm sütun genişliğine dön"
                  >
                    ⟲
                  </button>
                )}
              </div>
            )}

            {sheetHasOverrides && (
              <button
                type="button"
                onClick={() => {
                  setTextOverrides(prev => {
                    const next: Record<string, TextOverride> = {};
                    for (const [k, v] of Object.entries(prev)) {
                      if (!k.startsWith(`${sheet}::`)) next[k] = v;
                    }
                    return next;
                  });
                  setSelectedTextIdx(null);
                }}
                className="px-2.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10.5px] font-semibold"
              >
                ⟲ Tüm Yazı Konum/Yönlerini Sıfırla
              </button>
            )}
          </div>
        </div>

        {/* CAD ÇİZİM GÖRSELLEŞTİRME PENCERESİ */}
        {svg && (
          <div
            ref={svgContainerRef}
            onMouseDown={handleSvgMouseDown}
            className="border border-slate-800 rounded bg-slate-950 p-3 flex-1 min-h-[480px] overflow-auto flex items-center justify-center drop-shadow relative"
          >
            {selectedTextIdx !== null && (
              <style>{`text[data-prim-idx="${selectedTextIdx}"] { filter: drop-shadow(0 0 6px #38bdf8) drop-shadow(0 0 2px #ffffff); cursor: grabbing !important; }`}</style>
            )}
            <div className="w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        )}
      </div>
    </div>
  );
}
