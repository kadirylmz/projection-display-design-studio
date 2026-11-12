import { useEffect, useMemo, useState } from 'react';
import { buildReportHtml, DEFAULT_SECTIONS, ReportLang, ReportSectionFlags } from '../engine/report';
import { useProjectStore } from '../projectStore';
import { usePlannerStore } from '../plannerStore';
import { usePhotometricStore } from '../photometricStore';
import { useMapping } from '../mappingStore';
import { calculateInterProjectorDistances } from '../engine/interprojector';
import { contentPlannerRoomPlan } from '../engine/drawings';
import { toSvg } from '../engine/drawing';
import { download } from '../util';

export default function ReportGenerator() {
  const { meta, setMeta, projectionSnap, luxSnap, ledSnap, electrical, equipmentList, setEquipmentList } = useProjectStore();
  const { surfaces, calculatedSurfaces, physicalRoom } = usePlannerStore();
  const { slots } = useMapping();
  const surfacePhotometrics = usePhotometricStore(state => state.surfacePhotometrics);

  const [lang, setLang] = useState<ReportLang>('tr');
  const [sections, setSections] = useState<ReportSectionFlags>(() => ({
    ...DEFAULT_SECTIONS,
    led: false, // Projeksiyon mekanlarında varsayılan olarak kapalı; kullanıcı dilediğinde kutucuktan tek tıkla ekler/çıkarır
  }));
  const [presentation, setPresentation] = useState(false);
  // 1. PROJEKSİYONLAR ARASI MONTAJ, EKSEN VE MESAFE MATRİSİ HESABI
  const ipSurfaces = useMemo(() => {
    return calculatedSurfaces && calculatedSurfaces.length > 0 ? calculatedSurfaces : surfaces;
  }, [calculatedSurfaces, surfaces]);
  const [archRotation, setArchRotation] = useState<0 | 90 | 180 | 270>((meta.archPlanRotation as (0 | 90 | 180 | 270)) || 0);
  const [enabledSurfaceIds, setEnabledSurfaceIds] = useState<string[]>(() => (calculatedSurfaces && calculatedSurfaces.length > 0 ? calculatedSurfaces : surfaces).map(s => s.id));

  useEffect(() => {
    const allIds = [
      ...ipSurfaces.map(s => s.id),
      ...Object.keys(surfacePhotometrics).filter(id => !ipSurfaces.some(s => s.id === id))
    ];
    if (allIds.length > 0) {
      setEnabledSurfaceIds(prev => {
        // if prev is empty or misses standalone IDs, include them
        const missing = allIds.filter(id => !prev.includes(id));
        return missing.length > 0 ? [...prev, ...missing] : prev;
      });
    }
  }, [ipSurfaces, surfacePhotometrics]);

  useEffect(() => {
    if (meta.archPlanRotation !== undefined && meta.archPlanRotation !== archRotation) {
      setArchRotation(meta.archPlanRotation);
    }
  }, [meta.archPlanRotation]);

  const interProjectorAnalysis = useMemo(() => {
    // Elektrik yüklerinden projektör gücünü al, yoksa 1350W varsay
    const pjLoad = electrical.loads.find(l => l.name.includes('Projektör') || l.id.includes('PJ'));
    const singleWatt = pjLoad ? pjLoad.powerW : 1350;
    const breakerA = electrical.circuits[0]?.ampacityA ? (electrical.circuits[0].ampacityA <= 18 ? 10 : electrical.circuits[0].ampacityA <= 25 ? 16 : 32) : 16;

    return calculateInterProjectorDistances(
      ipSurfaces,
      physicalRoom,
      singleWatt,
      pjLoad?.name || 'Lazer Projeksiyon Cihazı (WUXGA / 4K)',
      breakerA
    );
  }, [ipSurfaces, physicalRoom, electrical]);

  // 2. 2B MİMARİ YERLEŞİM ODA PLANI SVG ÇİZİMİ
  const architecturalPlanSvg = useMemo(() => {
    try {
      const planDrawing = contentPlannerRoomPlan(
        physicalRoom,
        ipSurfaces,
        {
          showRoomDimensions: true,
          showThrowDimensions: true,
          showProjectorLabels: true,
          showElectricalLabels: true,
          showFrustums: true,
          showTitleBlock: true,
        }
      );
      return toSvg(planDrawing, { background: '#090e17', rotationDeg: archRotation });
    } catch (err) {
      console.warn('Room plan SVG generation fallback:', err);
      return undefined;
    }
  }, [physicalRoom, ipSurfaces, archRotation]);

  const snapshots = useMemo(() => {
    return (meta.room3dSnapshots && meta.room3dSnapshots.length > 0)
      ? meta.room3dSnapshots
      : (meta.room3dSnapshotUrl ? [meta.room3dSnapshotUrl] : []);
  }, [meta.room3dSnapshots, meta.room3dSnapshotUrl]);

  const reportPhotometricSurfaces = useMemo(() => {
    const fromPlanner = ipSurfaces.map(s => {
      if (surfacePhotometrics[s.id]) {
        return surfacePhotometrics[s.id];
      }
      const wM = +(s.widthM || 10).toFixed(2);
      const hM = +(s.heightM || 4).toFixed(2);
      const area = wM * hM;
      const count = (s.cols || 1) * (s.rows || 1);
      const lumensPerPj = 10000;
      const totalFlux = count * lumensPerPj * 0.90;
      const avgL = Math.round(totalFlux / Math.max(1, area));
      const minL = Math.round(avgL * 0.72);
      const maxL = Math.round(avgL * 1.25);
      const nits = Math.round((avgL * 1.0) / Math.PI);
      const fl = +(nits * 0.2919).toFixed(1);
      const acr = Math.round((avgL + 20) / 20);

      const tr = s.throwRatio || 0.8;
      const dist = s.throwDistM || 4.5;
      const beamW = +(dist / tr).toFixed(2);
      const stepW = (s.cols || 1) > 1 ? Math.max(0.1, (wM - beamW) / ((s.cols || 1) - 1)) : 0;

      const distRows = [];
      let pjIdx = 1;
      for (let r = 0; r < (s.rows || 1); r++) {
        for (let c = 0; c < (s.cols || 1); c++) {
          const stX = +(c * stepW).toFixed(2);
          const enX = +(stX + beamW).toFixed(2);
          const cX = +((stX + enX) / 2).toFixed(2);
          let ovText = '— (Kenar)';
          if (c < (s.cols || 1) - 1) {
            const nextStX = +((c + 1) * stepW).toFixed(2);
            const ovW = +(enX - nextStX).toFixed(2);
            ovText = `${ovW}m (%${Math.round((ovW / Math.max(0.1, beamW)) * 100)} Blend)`;
          }
          distRows.push({
            code: `PJ ${pjIdx}`,
            name: `${s.name} - PJ ${pjIdx}`,
            rowName: (s.rows || 1) > 1 ? `Sıra ${r + 1}` : undefined,
            startX: stX,
            endX: enX,
            widthM: beamW,
            centerX: cX,
            throwDistM: dist,
            throwRatio: tr,
            overlapText: ovText,
          });
          pjIdx++;
        }
      }

      return {
        surfaceId: s.id,
        surfaceName: s.name,
        surfaceType: s.type || 'wall',
        widthM: wM,
        heightM: hM,
        projectorCount: count,
        avgLux: avgL,
        minLux: minL,
        maxLux: maxL,
        uniformityU0: minL / Math.max(1, avgL),
        uniformityU1: minL / Math.max(1, maxL),
        luminanceNits: nits,
        luminanceFL: fl,
        screenGain: 1.0,
        ambientLux: 20,
        ambientContrastRatio: acr,
        isManualLux: false,
        distributionRows: distRows,
      };
    });

    const plannerIds = new Set(ipSurfaces.map(s => s.id));
    const standaloneSurfaces = Object.values(surfacePhotometrics).filter(p => !plannerIds.has(p.surfaceId));

    return [...fromPlanner, ...standaloneSurfaces];
  }, [ipSurfaces, surfacePhotometrics]);

  // 3. HTML RAPORUNU OLUŞTUR
  const html = useMemo(() => buildReportHtml({
    lang,
    meta,
    sections,
    room3dSnapshotUrl: snapshots[0] || meta.room3dSnapshotUrl,
    room3dSnapshots: snapshots,
    architecturalPlanSvg,
    interProjectorAnalysis,
    projection: projectionSnap,
    lux: luxSnap,
    photometricSurfaces: reportPhotometricSurfaces,
    mappingSlots: slots,
    led: ledSnap,
    electrical,
    equipmentList,
    plannerSurfaces: ipSurfaces,
    enabledSurfaceIds,
  }), [
    lang,
    meta,
    snapshots,
    sections,
    architecturalPlanSvg,
    interProjectorAnalysis,
    projectionSnap,
    luxSnap,
    reportPhotometricSurfaces,
    slots,
    ledSnap,
    electrical,
    equipmentList,
    ipSurfaces,
    enabledSurfaceIds,
  ]);

  const printPdf = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const toggle = (k: keyof ReportSectionFlags) => setSections(s => ({ ...s, [k]: !s[k] }));

  if (presentation) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
        <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <b>MÜŞTERİ SUNUM MODU — {meta.projectName} ({meta.customer})</b>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 font-semibold rounded text-white shadow" onClick={printPdf}>🖨 PDF Yazdır / Kaydet</button>
            <button className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200" onClick={() => setPresentation(false)}>✕ Sunumdan Çık</button>
          </div>
        </div>
        <iframe title="sunum" srcDoc={html} className="flex-1 w-full bg-white" />
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4 h-full">
      {/* SOL KONTROL VE YAPILANDIRMA PANELİ */}
      <div className="space-y-3 p-3.5 rounded border border-slate-700 bg-slate-900 overflow-auto text-xs" style={{ maxHeight: '88vh' }}>
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-sky-400">Müşteri Raporu & Çizim Stüdyosu</h2>
          <span className="text-[10px] text-slate-400 font-mono">v2.4 Pro</span>
        </div>

        {/* Dil ve Firma Logosu */}
        <div className="grid grid-cols-2 gap-2">
          <label>
            Rapor Dili
            <select className="inp font-semibold" value={lang} onChange={e => setLang(e.target.value as ReportLang)}>
              <option value="tr">🇹🇷 Türkçe</option>
              <option value="en">🇬🇧 English</option>
            </select>
          </label>
          <label>
            Firma Logosu
            <input
              type="file"
              accept="image/*"
              className="inp text-[10px]"
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                const rd = new FileReader();
                rd.onload = () => setMeta({ companyLogoDataUrl: rd.result as string });
                rd.readAsDataURL(f);
              }}
            />
          </label>
        </div>

        {/* 3B & 2B GÖRSEL SİMÜLASYON VE PAFTA KARTI */}
        <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center">
            <b className="text-amber-400 text-[11px]">📸 3B & 2B Görsel Galerisi ({snapshots.length})</b>
            {snapshots.length > 0 && (
              <button
                className="text-[10px] text-red-400 hover:text-red-300 underline"
                onClick={() => setMeta({ room3dSnapshotUrl: undefined, room3dSnapshots: [] })}
              >
                Tümünü Temizle
              </button>
            )}
          </div>

          {snapshots.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {snapshots.map((url, idx) => (
                  <div key={idx} className="relative group rounded border border-sky-900/60 overflow-hidden bg-slate-900">
                    <img
                      src={url}
                      alt={`Görsel #${idx + 1}`}
                      className="w-full h-20 object-cover"
                    />
                    <div className="absolute top-1 left-1 bg-black/75 text-[9px] text-white px-1.5 py-0.5 rounded font-mono">
                      #{idx + 1}
                    </div>
                    <button
                      title="Bu Görseli Sil"
                      onClick={() => {
                        const updated = snapshots.filter((_, i) => i !== idx);
                        setMeta({
                          room3dSnapshots: updated,
                          room3dSnapshotUrl: updated[0] || undefined,
                        });
                      }}
                      className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-500 text-white rounded w-4 h-4 flex items-center justify-center text-[10px] shadow font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span>✓ Toplam {snapshots.length} adet 3B/2B görsel rapora dahil edildi</span>
              </div>
            </div>
          ) : (
            <div className="text-[10.5px] text-slate-400 leading-relaxed bg-slate-900/80 p-2 rounded border border-slate-800">
              💡 <b>Görsel Eklemek İçin:</b> <i>"3D Oda"</i>, <i>"2B Açınım"</i> veya <i>"CAD Çizim"</i> sekmelerindeki <b>"📋 Rapora Ekle"</b> butonlarına basarak dilediğiniz kadar 3B ve 2B açınım görseli ekleyebilir veya aşağıdan dosya yükleyebilirsiniz.
            </div>
          )}

          <label className="block">
            <span className="text-[10px] text-slate-400">+ Harici 3B/2B Render veya Görsel Ekle</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="inp text-[10px] !mt-1"
              onChange={async e => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                const readAsDataUrl = (file: File): Promise<string> =>
                  new Promise<string>((resolve, reject) => {
                    const rd = new FileReader();
                    rd.onload = () => resolve(rd.result as string);
                    rd.onerror = reject;
                    rd.readAsDataURL(file);
                  });
                const urls = await Promise.all(files.map(readAsDataUrl));
                const nextSnapshots = [...snapshots, ...urls];
                setMeta({
                  room3dSnapshots: nextSnapshots,
                  room3dSnapshotUrl: nextSnapshots[0],
                });
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {/* Müşteri ve Proje Bilgileri */}
        <label className="block">
          Firma Adı
          <input className="inp font-medium" value={meta.companyName} onChange={e => setMeta({ companyName: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>Müşteri / Kurum<input className="inp" value={meta.customer} onChange={e => setMeta({ customer: e.target.value })} /></label>
          <label>Proje Adı<input className="inp" value={meta.projectName} onChange={e => setMeta({ projectName: e.target.value })} /></label>
          <label>Konum<input className="inp" value={meta.location} onChange={e => setMeta({ location: e.target.value })} /></label>
          <label>Kategori<input className="inp" value={meta.category} onChange={e => setMeta({ category: e.target.value })} /></label>
          <label>Tarih<input className="inp" type="date" value={meta.date} onChange={e => setMeta({ date: e.target.value })} /></label>
          <label>Revizyon No<input className="inp" type="number" min="1" value={meta.revision} onChange={e => setMeta({ revision: Math.max(1, +e.target.value) })} /></label>
        </div>
        <label className="block">
          Proje Özeti
          <textarea className="inp h-14" value={meta.description} onChange={e => setMeta({ description: e.target.value })} />
        </label>
        <label className="block">
          Özel Mühendislik Notları
          <input className="inp" placeholder="Opsiyonel şantiye veya müşteri notu..." value={meta.notes || ''} onChange={e => setMeta({ notes: e.target.value })} />
        </label>

        {/* RAPORA DAHİL EDİLECEK BÖLÜMLER */}
        <div className="border-t border-slate-800 pt-2.5 space-y-1.5">
          <div className="flex justify-between items-center">
            <b className="text-slate-200">Rapora Dahil Edilecek Bölümler</b>
            <button
              type="button"
              className="text-[10.5px] text-sky-400 hover:text-sky-300 underline"
              onClick={() => setSections(prev => ({
                ...prev,
                led: !prev.led,
              }))}
            >
              {sections.led ? 'LED Duvarı Çıkar' : '+ LED Duvarı Ekle'}
            </button>
          </div>
          {([
            ['summary', '1. Proje Özeti & Metrikler'],
            ['room3d', '2. 3B Simülasyon & 2B Görsel Paftalar'],
            ['interProjector', '3. Projeksiyonlar Arası Eksen & Mesafe Cetveli'],
            ['architecturalPlan', '4. 2B Mimari Yerleşim & CAD Paftası'],
            ['projection', '5. Projektör & Lens Hesapları'],
            ['lux', '6. Lux & Parlaklık Analizi'],
            ['multiProjector', '7. Çoklu Projektör & Kanvas Haritası'],
            ['led', '8. LED Duvar Spesifikasyonları'],
            ['electrical', '9. Elektrik Yük & Tek Hat Dağıtım Şeması'],
            ['drawings2d', '10. 2B CAD Teknik Çizimler'],
            ['equipmentList', '11. Ekipman Listesi (BOM)'],
            ['assumptionsAndWarnings', '12. Şantiye Standartları & Teknik Uyarılar'],
          ] as [keyof ReportSectionFlags, string][]).filter(([k]) => k !== 'interProjector').map(([k, label]) => (
            <div key={k} className="space-y-1">
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition">
                <input type="checkbox" checked={sections[k]} onChange={() => toggle(k)} />
                <span className={k === 'led' ? (sections.led ? 'text-amber-300 font-bold' : 'text-slate-400') : ''}>{label}</span>
              </label>
              {k === 'lux' && sections.lux && (
                <div className="ml-6 mt-1 p-2 space-y-1 rounded bg-slate-900 border border-slate-800 text-[11px]">
                  <span className="text-emerald-400 font-bold block text-[10.5px]">
                    ✓ Rapora Eklenen Fotometrik Yüzeyler ({reportPhotometricSurfaces.length}):
                  </span>
                  {reportPhotometricSurfaces.length > 0 ? (
                    reportPhotometricSurfaces.map(s => (
                      <div key={s.surfaceId} className="flex items-center justify-between text-slate-300 py-0.5 border-b border-slate-800/60 last:border-0">
                        <span className="truncate text-sky-300 font-medium">
                          {s.surfaceId.startsWith('quick-') ? '💡 ' : '🧱 '}
                          {s.surfaceName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {(s.widthM * s.heightM).toFixed(1)} m² · {Math.round(s.avgLux)} lx
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-[10px] text-slate-500 italic block">
                      Henüz yüzey eklenmedi. "Lux & Parlaklık" sekmesinden aktarabilirsiniz.
                    </span>
                  )}
                </div>
              )}
              {k === 'architecturalPlan' && sections.architecturalPlan && (
                <div className="flex items-center gap-1.5 ml-6 py-1 px-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                  <span className="text-slate-400 font-medium">🔄 Pafta Yönü:</span>
                  {([0, 90, 180, 270] as const).map(deg => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => {
                        setArchRotation(deg);
                        setMeta({ archPlanRotation: deg });
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                        archRotation === deg
                          ? 'bg-sky-500 text-white shadow'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              )}
              {k === 'multiProjector' && sections.multiProjector && (
                <div className="ml-6 mt-1 p-2 space-y-1.5 rounded bg-slate-900 border border-slate-800 text-[11px]">
                  <span className="text-amber-300 font-bold block text-[10.5px]">Ayrı Eklenecek Yüzeyler:</span>
                  {ipSurfaces.map(s => {
                    const isChecked = enabledSurfaceIds.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white transition">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setEnabledSurfaceIds(prev => [...prev, s.id]);
                            } else {
                              setEnabledSurfaceIds(prev => prev.filter(id => id !== s.id));
                            }
                          }}
                        />
                        <span className={isChecked ? 'text-sky-300 font-semibold' : 'text-slate-400'}>
                          {s.name} ({s.cols}×{s.rows} PJ)
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* EKİPMAN LİSTESİ */}
        <div className="border-t border-slate-800 pt-2.5 space-y-1.5">
          <div className="flex justify-between items-center">
            <b>Rapor Ekipman Listesi (BOM)</b>
            <button
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded text-[10px]"
              onClick={() => setEquipmentList([...equipmentList, { category: 'Projektör', manufacturer: '', model: '', qty: 1 }])}
            >
              + Satır Ekle
            </button>
          </div>
          {equipmentList.map((item, i) => (
            <div key={i} className="grid grid-cols-[80px_1fr_44px_20px] gap-1 items-center">
              <input className="inp !mt-0" placeholder="Kategori" value={item.category} onChange={e => setEquipmentList(equipmentList.map((x, k) => k === i ? { ...x, category: e.target.value } : x))} />
              <input className="inp !mt-0" placeholder="Model" value={item.model} onChange={e => setEquipmentList(equipmentList.map((x, k) => k === i ? { ...x, model: e.target.value } : x))} />
              <input className="inp !mt-0 text-center" type="number" min="1" value={item.qty} onChange={e => setEquipmentList(equipmentList.map((x, k) => k === i ? { ...x, qty: +e.target.value } : x))} />
              <button className="text-red-400 hover:text-red-300" onClick={() => setEquipmentList(equipmentList.filter((_, k) => k !== i))}>✕</button>
            </div>
          ))}
        </div>

        {/* AKSİYON BUTONLARI */}
        <div className="flex flex-col gap-2 pt-3 border-t border-slate-800">
          <button
            className="w-full py-2 bg-sky-700 hover:bg-sky-600 rounded font-bold text-white shadow flex items-center justify-center gap-1.5"
            onClick={printPdf}
          >
            <span>🖨 Müşteri Raporunu PDF Olarak Yazdır / Kaydet</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded font-semibold text-white shadow text-[11px]"
              onClick={() => setPresentation(true)}
            >
              🖥 Tam Ekran Sunum
            </button>
            <button
              className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded font-semibold text-slate-300 text-[11px]"
              onClick={() => download(`${meta.projectName || 'rapor'}.html`, html, 'text/html')}
            >
              💾 HTML İndir
            </button>
          </div>
        </div>
      </div>

      {/* SAĞ CANLI RAPOR ÖNİZLEME PENCERESİ */}
      <div className="h-full min-h-[75vh] border border-slate-800 rounded overflow-hidden bg-slate-950 flex flex-col shadow-2xl">
        <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-[11px] text-slate-400 font-mono">
          <span>CANLI MÜŞTERİ RAPORU ÖNİZLEMESİ</span>
          <div className="flex items-center gap-3">
            <span>Toplam Cihaz: <b className="text-sky-300">{interProjectorAnalysis.totalProjectors}</b></span>
            <span>Toplam Güç: <b className="text-amber-300">{(interProjectorAnalysis.totalPowerW / 1000).toFixed(2)} kW</b></span>
            <span>Toplam Akım (Ib): <b className="text-rose-400">{(interProjectorAnalysis.totalPowerW / (230 * 0.95)).toFixed(1)} A</b></span>
          </div>
        </div>
        <iframe title="rapor-onizleme" srcDoc={html} className="w-full flex-1 bg-white" />
      </div>
    </div>
  );
}
