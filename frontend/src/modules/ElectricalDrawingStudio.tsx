import { useCallback, useEffect, useMemo, useState } from 'react';
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

  // 3) Metin ve Etiket Konumlarını Kaydırma (Üst Üste Binmeyi Önleme):
  type ShiftTarget = 'proj' | 'dim' | 'roomDim' | 'titleBlock';
  const [activeShiftTarget, setActiveShiftTarget] = useState<ShiftTarget>('proj');

  const [shifts, setShifts] = useState<{
    proj: { x: number; y: number };
    dim: { x: number; y: number };
    roomDim: { x: number; y: number };
    titleBlock: { x: number; y: number };
  }>({
    proj: { x: 0, y: 0 },
    dim: { x: 0, y: 0 },
    roomDim: { x: 0, y: 0 },
    titleBlock: { x: 0, y: 0 },
  });

  const [elColumnSpacing, setElColumnSpacing] = useState<number>(145);
  const [elTextShiftY, setElTextShiftY] = useState<number>(0);
  const [reportCadToast, setReportCadToast] = useState<boolean>(false);

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
  const activeDrawing = useMemo(() => {
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
          labelShiftX: shifts.proj.x,
          labelShiftY: shifts.proj.y,
          dimShiftX: shifts.dim.x,
          dimShiftY: shifts.dim.y,
          roomDimShiftX: shifts.roomDim.x,
          roomDimShiftY: shifts.roomDim.y,
          titleBlockShiftX: shifts.titleBlock.x,
          titleBlockShiftY: shifts.titleBlock.y,
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
          textShiftY: elTextShiftY,
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
    shifts,
    elShowBusSpecs,
    elShowBreakerSpecs,
    elShowCableSpecs,
    elShowPhaseCurrent,
    elShowLoadDetails,
    elColumnSpacing,
    elTextShiftY,
  ]);

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
          <div className="flex justify-between items-center">
            <b className="text-slate-200">Linyeler / Devreler ({circuits.length})</b>
            <button className="px-2 py-0.5 bg-sky-700 rounded text-white text-[10px]" onClick={addCircuit}>
              + Linye
            </button>
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

        {/* YAZILARI VE ETİKETLERİ KAYDIRMA / ARALIK AYARLAMA KONTROL BARI */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900/95 px-3 py-1.5 rounded border border-sky-900/60 text-[11px] shadow">
          <div className="flex items-center gap-1.5 font-bold text-sky-400">
            <span>↔️ Seçtiğin Yazıyı Kaydır:</span>
          </div>

          {sheet === 'room' ? (
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Kaydırılacak Yazıyı Seç */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-[10px]">Yazı Seçimi:</span>
                <select
                  value={activeShiftTarget}
                  onChange={e => setActiveShiftTarget(e.target.value as ShiftTarget)}
                  className="bg-slate-950 border border-sky-700 text-sky-300 font-semibold text-[10.5px] rounded px-2 py-0.5"
                >
                  <option value="proj">📌 Projektör & Montaj Etiketleri (PJ / H / Watt)</option>
                  <option value="dim">📏 Atım Mesafesi (D) Ölçü Yazısı</option>
                  <option value="roomDim">📐 Dış Oda Ölçüleri (Genişlik / Boy)</option>
                  <option value="titleBlock">📋 Teknik Çizim Anteti & Lejant</option>
                </select>
              </div>

              {/* Yatay X Kaydırma */}
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                <span className="text-slate-400 text-[10px]">Yatay (X):</span>
                <button
                  className="px-1.5 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                  onClick={() =>
                    setShifts(prev => ({
                      ...prev,
                      [activeShiftTarget]: {
                        ...prev[activeShiftTarget],
                        x: prev[activeShiftTarget].x - 50,
                      },
                    }))
                  }
                  title="Seçili metni 50mm sola kaydır"
                >
                  ◀
                </button>
                <span className="font-mono text-amber-300 w-14 text-center text-[10.5px]">
                  {shifts[activeShiftTarget].x > 0 ? `+${shifts[activeShiftTarget].x}` : shifts[activeShiftTarget].x} mm
                </span>
                <button
                  className="px-1.5 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                  onClick={() =>
                    setShifts(prev => ({
                      ...prev,
                      [activeShiftTarget]: {
                        ...prev[activeShiftTarget],
                        x: prev[activeShiftTarget].x + 50,
                      },
                    }))
                  }
                  title="Seçili metni 50mm sağa kaydır"
                >
                  ▶
                </button>
              </div>

              {/* Dikey Y Kaydırma */}
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                <span className="text-slate-400 text-[10px]">Dikey (Y):</span>
                <button
                  className="px-1.5 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                  onClick={() =>
                    setShifts(prev => ({
                      ...prev,
                      [activeShiftTarget]: {
                        ...prev[activeShiftTarget],
                        y: prev[activeShiftTarget].y - 50,
                      },
                    }))
                  }
                  title="Seçili metni 50mm yukarı kaydır"
                >
                  ▲
                </button>
                <span className="font-mono text-amber-300 w-14 text-center text-[10.5px]">
                  {shifts[activeShiftTarget].y > 0 ? `+${shifts[activeShiftTarget].y}` : shifts[activeShiftTarget].y} mm
                </span>
                <button
                  className="px-1.5 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                  onClick={() =>
                    setShifts(prev => ({
                      ...prev,
                      [activeShiftTarget]: {
                        ...prev[activeShiftTarget],
                        y: prev[activeShiftTarget].y + 50,
                      },
                    }))
                  }
                  title="Seçili metni 50mm aşağı kaydır"
                >
                  ▼
                </button>
              </div>

              {/* Seçileni Sıfırla */}
              {(shifts[activeShiftTarget].x !== 0 || shifts[activeShiftTarget].y !== 0) && (
                <button
                  className="px-2 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 text-[10px] font-semibold"
                  onClick={() =>
                    setShifts(prev => ({
                      ...prev,
                      [activeShiftTarget]: { x: 0, y: 0 },
                    }))
                  }
                  title="Seçili yazının konumunu sıfırla"
                >
                  ⟲ Seçileni Sıfırla
                </button>
              )}

              {/* Tümünü Sıfırla */}
              {(shifts.proj.x !== 0 || shifts.proj.y !== 0 || shifts.dim.x !== 0 || shifts.dim.y !== 0 || shifts.roomDim.x !== 0 || shifts.roomDim.y !== 0 || shifts.titleBlock.x !== 0 || shifts.titleBlock.y !== 0) && (
                <button
                  className="px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-semibold"
                  onClick={() => {
                    setShifts({
                      proj: { x: 0, y: 0 },
                      dim: { x: 0, y: 0 },
                      roomDim: { x: 0, y: 0 },
                      titleBlock: { x: 0, y: 0 },
                    });
                  }}
                  title="Tüm yazıların kaydırmasını sıfırla"
                >
                  ⟲ Tümünü Sıfırla
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                <span className="text-slate-400 text-[10px]">Linye Sütun Genişliği (Aralık):</span>
                <button
                  className="px-1.5 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                  onClick={() => setElColumnSpacing(v => Math.max(90, v - 15))}
                  title="Linyeleri birbirine yaklaştır"
                >
                  ◀ Daralt
                </button>
                <span className="font-mono text-amber-300 w-14 text-center text-[10.5px]">
                  {elColumnSpacing} mm
                </span>
                <button
                  className="px-1.5 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                  onClick={() => setElColumnSpacing(v => Math.min(260, v + 15))}
                  title="Linyeleri birbirinden uzaklaştırarak yazıları ferahlat"
                >
                  Genişlet ▶
                </button>
              </div>

              <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                <span className="text-slate-400 text-[10px]">Metin Dikey Boşluğu:</span>
                <button
                  className="px-1.5 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                  onClick={() => setElTextShiftY(v => v - 5)}
                >
                  ▲
                </button>
                <span className="font-mono text-sky-300 w-10 text-center text-[10.5px]">
                  {elTextShiftY}
                </span>
                <button
                  className="px-1.5 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                  onClick={() => setElTextShiftY(v => v + 5)}
                >
                  ▼
                </button>
              </div>

              {(elColumnSpacing !== 145 || elTextShiftY !== 0) && (
                <button
                  className="px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-semibold"
                  onClick={() => {
                    setElColumnSpacing(145);
                    setElTextShiftY(0);
                  }}
                >
                  ⟲ Standart Aralığa Dön
                </button>
              )}
            </div>
          )}
        </div>

        {/* CAD ÇİZİM GÖRSELLEŞTİRME PENCERESİ */}
        {svg && (
          <div
            className="border border-slate-800 rounded bg-slate-950 p-3 flex-1 min-h-[480px] overflow-auto flex items-center justify-center drop-shadow"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>
    </div>
  );
}
