import { useMemo, useState } from 'react';
import { analyze, Circuit, Load } from '../engine/electrical';
import { toDxf, toSvg } from '../engine/drawing';
import { electricalSingleLine, contentPlannerRoomPlan } from '../engine/drawings';
import { useProjectStore } from '../projectStore';
import { usePlannerStore } from '../plannerStore';
import { round } from '../engine/units';
import { download, svgToPng } from '../util';

type Sheet = 'room' | 'electrical';

export default function ElectricalDrawingStudio() {
  const { electrical, setElectrical } = useProjectStore();
  const { physicalRoom, surfaces, totalProjectors } = usePlannerStore();
  const [sheet, setSheet] = useState<Sheet>('room');

  // 1 Adet Projektör İçin Referans Güç ve Model Bilgisi
  const [singleProjWatt, setSingleProjWatt] = useState<number>(450);
  const [singleProjPf, setSingleProjPf] = useState<number>(0.95);
  const [singleProjModel, setSingleProjModel] = useState<string>('Lazer Projektör (WUXGA / 4K)');

  const { loads, circuits, supply } = electrical;

  // İçerik Planlayıcıdaki Toplam Projektör Adedine Göre Elektrik Yükünü Otomatik Güncelle
  const syncPlannerToElectrical = () => {
    const projQty = Math.max(1, totalProjectors);
    const existingPjLoad = loads.find(l => l.id === 'PJ-MAIN' || l.name.includes('Projektör'));
    
    let updatedLoads: Load[];
    if (existingPjLoad) {
      updatedLoads = loads.map(l =>
        l.id === existingPjLoad.id
          ? { ...l, name: singleProjModel, qty: projQty, powerW: singleProjWatt, pf: singleProjPf }
          : l
      );
    } else {
      updatedLoads = [
        { id: 'PJ-MAIN', name: singleProjModel, qty: projQty, powerW: singleProjWatt, pf: singleProjPf },
        ...loads,
      ];
    }

    // 16A sigorta başına maks 6 projektör dağıtımı
    const maxPerCircuit = 6;
    const neededCircuits = Math.ceil(projQty / maxPerCircuit);
    const newCircuits: Circuit[] = [];
    const phases: ('L1' | 'L2' | 'L3')[] = ['L1', 'L2', 'L3'];

    for (let i = 0; i < neededCircuits; i++) {
      newCircuits.push({
        id: `C-PJ-${i + 1}`,
        name: `Linye-${i + 1} (PJ Grup ${i + 1})`,
        loadIds: ['PJ-MAIN'],
        phase: supply.phases === 3 ? phases[i % 3] : 'L1',
        cableMm2: 2.5,
        lengthM: 25,
        ampacityA: 25,
      });
    }

    setElectrical({
      loads: updatedLoads,
      circuits: newCircuits.length > 0 ? newCircuits : circuits,
    });
  };

  const elRes = useMemo(() => {
    try {
      return { r: analyze(loads, circuits, supply), err: null as string | null };
    } catch (e) {
      return { r: null, err: (e as Error).message };
    }
  }, [loads, circuits, supply]);

  // CAD Paftası Üretimi (Doğrudan İçerik Planlayıcıdan Çekilir)
  const activeDrawing = useMemo(() => {
    try {
      if (sheet === 'room') {
        return contentPlannerRoomPlan(physicalRoom, surfaces);
      }
      if (sheet === 'electrical' && elRes.r) {
        return electricalSingleLine(loads, circuits, supply, elRes.r);
      }
      return null;
    } catch (e) {
      console.error('CAD Drawing Error:', e);
      return null;
    }
  }, [sheet, physicalRoom, surfaces, loads, circuits, supply, elRes.r]);

  const svg = useMemo(
    () => (activeDrawing ? toSvg(activeDrawing, { background: '#0b1220' }) : ''),
    [activeDrawing]
  );

  const addLoad = () => {
    const id = `L${Date.now().toString(36).slice(-3).toUpperCase()}`;
    setElectrical({
      loads: [
        ...loads,
        { id, name: `Ek Cihaz (Amfi/Sunucu) ${loads.length + 1}`, qty: 1, powerW: 350, pf: 0.95 },
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
    <div className="grid lg:grid-cols-[430px_1fr] gap-4 h-full">
      {/* SOL PANEL: İÇERİK PLANLAYICIDAN GELEN ODA & PROJEKSİYON REFERANSI VE ELEKTRİK */}
      <div className="space-y-3 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto text-xs" style={{ maxHeight: '88vh' }}>
        <div className="flex justify-between items-center border-b border-slate-700 pb-2">
          <div>
            <h2 className="text-sm font-bold text-sky-400">CAD (DXF/AutoCAD) & Projeksiyon Planı</h2>
            <p className="text-[11px] text-slate-400">
              İçerik Planlayıcı mimari oda ölçüleri ve ışık atımları ile tam entegre.
            </p>
          </div>
        </div>

        {/* 1. İÇERİK PLANLAYICIDAN OTOMATİK GELEN BİLGİLER */}
        <div className="p-2.5 rounded bg-slate-950 border border-sky-800/80 space-y-2">
          <div className="flex justify-between items-center border-b border-slate-800 pb-1">
            <b className="text-sky-300">🏛️ İçerik Planlayıcı Oda & Cihaz Verileri:</b>
            <span className="px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-700 font-bold font-mono text-[10px]">
              {totalProjectors} Projektör
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 font-mono text-center">
            <div className="p-1 rounded bg-slate-900 border border-slate-800">
              <span className="text-[9.5px] text-slate-400 block">Oda Eni (X)</span>
              <b className="text-amber-300 text-xs">{physicalRoom.widthM} m</b>
            </div>
            <div className="p-1 rounded bg-slate-900 border border-slate-800">
              <span className="text-[9.5px] text-slate-400 block">Oda Boyu (Z)</span>
              <b className="text-amber-300 text-xs">{physicalRoom.lengthM} m</b>
            </div>
            <div className="p-1 rounded bg-slate-900 border border-slate-800">
              <span className="text-[9.5px] text-slate-400 block">Tavan (H)</span>
              <b className="text-amber-300 text-xs">{physicalRoom.heightM} m</b>
            </div>
          </div>

          <div className="text-[10px] text-slate-300 space-y-0.5 pt-1">
            {surfaces.map(s => (
              <div key={s.id} className="flex justify-between border-b border-slate-900 pb-0.5">
                <span>{s.name}:</span>
                <b className="text-emerald-400 font-mono">
                  {s.cols * s.rows} PJ (@D={s.throwDistM}m, TR {s.throwRatio}:1)
                </b>
              </div>
            ))}
          </div>
        </div>

        {/* 2. 1 ADET REFERANS PROJEKTÖR GİRİŞİ (TEK GİRİŞLE TÜM HESAPLAMA) */}
        <div className="p-2.5 rounded bg-slate-950 border border-emerald-800/80 space-y-2">
          <div className="flex justify-between items-center border-b border-slate-800 pb-1">
            <b className="text-emerald-300">⚡ 1 Adet Referans Projektör Güç Girişi:</b>
            <button
              onClick={syncPlannerToElectrical}
              className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px] shadow"
              title="İçerik planlayıcıdaki toplam projektör sayısına göre tüm yük ve linye dağılımını otomatik uygula"
            >
              Otomatik Uygula ({totalProjectors} PJ)
            </button>
          </div>

          <div className="space-y-1.5">
            <label>
              Projektör Cihaz Modeli
              <input
                className="inp font-semibold text-white"
                value={singleProjModel}
                onChange={e => setSingleProjModel(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label>
                1 Adet Güç Tüketimi (W)
                <input
                  className="inp font-bold text-amber-300"
                  type="number"
                  step="10"
                  min="50"
                  value={singleProjWatt}
                  onChange={e => setSingleProjWatt(Math.max(50, +e.target.value))}
                />
              </label>
              <label>
                Güç Faktörü (cos φ)
                <input
                  className="inp font-bold text-emerald-300"
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="1"
                  value={singleProjPf}
                  onChange={e => setSingleProjPf(Math.min(1, Math.max(0.5, +e.target.value)))}
                />
              </label>
            </div>

            <div className="p-2 rounded bg-slate-900 border border-emerald-900/60 font-mono text-[10.5px] space-y-0.5">
              <div className="flex justify-between text-slate-300">
                <span>Toplam Projeksiyon Gücü:</span>
                <b className="text-amber-300">{totalProjectors} × {singleProjWatt}W = {totalProjectors * singleProjWatt} W</b>
              </div>
              <div className="flex justify-between text-slate-400 text-[10px]">
                <span>Tavsiye Edilen Dağıtım:</span>
                <span>~{Math.ceil(totalProjectors / 6)} Linye (16A Sigorta, 3x2.5mm²)</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. ŞEBEKE BESLEME PARAMETRELERİ */}
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

        {/* 4. YÜKLER VE LİNYELER LİSTESİ */}
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
            <b className="text-slate-200">Linyeler ({circuits.length})</b>
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
                <label>Mesafe (m)<input className="inp !mt-0" type="number" value={c.lengthM ?? 20} onChange={e => updCircuit(c.id, { lengthM: +e.target.value || 20 })} /></label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SAĞ PANEL: CAD ÇİZİM ÖNİZLEME, TEKNİK PAFTA BUTONLARI VE DXF İNDİRME */}
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

        {/* CAD PAFTASI SEÇİM BARI (Sadece İlgili 2 Pafta: Oda & Projeksiyon Planı ve Elektrik Tek Hat) */}
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
                onClick={async () => download(`${sheet}-cizim.png`, await svgToPng(toSvg(activeDrawing, { pixelWidth: 2600 }), 2600))}
              >
                PNG
              </button>
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
