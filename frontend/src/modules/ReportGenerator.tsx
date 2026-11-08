import { useMemo, useState } from 'react';
import { buildReportHtml, DEFAULT_SECTIONS, ReportLang, ReportSectionFlags } from '../engine/report';
import { useProjectStore } from '../projectStore';
import { usePlannerStore } from '../plannerStore';
import { useMapping } from '../mappingStore';
import { calculateInterProjectorDistances } from '../engine/interprojector';
import { contentPlannerRoomPlan } from '../engine/drawings';
import { toSvg } from '../engine/drawing';
import { download } from '../util';

export default function ReportGenerator() {
  const { meta, setMeta, projectionSnap, luxSnap, ledSnap, electrical, equipmentList, setEquipmentList } = useProjectStore();
  const { surfaces, calculatedSurfaces, physicalRoom } = usePlannerStore();
  const { slots } = useMapping();

  const [lang, setLang] = useState<ReportLang>('tr');
  const [sections, setSections] = useState<ReportSectionFlags>(DEFAULT_SECTIONS);
  const [presentation, setPresentation] = useState(false);

  // 1. PROJEKSİYONLAR ARASI MONTAJ, EKSEN VE MESAFE MATRİSİ HESABI
  const ipSurfaces = useMemo(() => {
    return calculatedSurfaces && calculatedSurfaces.length > 0 ? calculatedSurfaces : surfaces;
  }, [calculatedSurfaces, surfaces]);

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
      return toSvg(planDrawing, { background: '#090e17' });
    } catch (err) {
      console.warn('Room plan SVG generation fallback:', err);
      return undefined;
    }
  }, [physicalRoom, ipSurfaces]);

  // 3. HTML RAPORUNU OLUŞTUR
  const html = useMemo(() => buildReportHtml({
    lang,
    meta,
    sections,
    room3dSnapshotUrl: meta.room3dSnapshotUrl,
    architecturalPlanSvg,
    interProjectorAnalysis,
    projection: projectionSnap,
    lux: luxSnap,
    mappingSlots: slots,
    led: ledSnap,
    electrical,
    equipmentList,
  }), [
    lang,
    meta,
    sections,
    architecturalPlanSvg,
    interProjectorAnalysis,
    projectionSnap,
    luxSnap,
    slots,
    ledSnap,
    electrical,
    equipmentList,
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

        {/* 3B SİMÜLASYON GÖRÜNÜMÜ KARTI */}
        <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center">
            <b className="text-amber-400 text-[11px]">📸 3B Sahne Simülasyonu</b>
            {meta.room3dSnapshotUrl && (
              <button
                className="text-[10px] text-red-400 hover:text-red-300 underline"
                onClick={() => setMeta({ room3dSnapshotUrl: undefined })}
              >
                Kaldır
              </button>
            )}
          </div>

          {meta.room3dSnapshotUrl ? (
            <div className="space-y-1.5">
              <img
                src={meta.room3dSnapshotUrl}
                alt="3B Önizleme"
                className="w-full h-24 object-cover rounded border border-sky-900/60"
              />
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span>✓ 3B Kamera Görünüşü Rapora Dahil Edildi</span>
              </div>
            </div>
          ) : (
            <div className="text-[10.5px] text-slate-400 leading-relaxed bg-slate-900/80 p-2 rounded border border-slate-800">
              💡 <b>3B Görünüşü Eklemek İçin:</b> <i>"İçerik Çözünürlüğü Planlayıcı / 3D Oda"</i> sekmesine gidip dilediğiniz açıdan <b>"📋 3B Açıyı Rapora Ekle"</b> butonuna basabilir veya aşağıdan dosya yükleyebilirsiniz.
            </div>
          )}

          <label className="block">
            <span className="text-[10px] text-slate-400">Harici 3B Render / Fotoğraf Yükle</span>
            <input
              type="file"
              accept="image/*"
              className="inp text-[10px] !mt-1"
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                const rd = new FileReader();
                rd.onload = () => setMeta({ room3dSnapshotUrl: rd.result as string });
                rd.readAsDataURL(f);
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
          <b className="text-slate-200">Rapora Dahil Edilecek Bölümler</b>
          {([
            ['summary', '1. Proje Özeti & Metrikler'],
            ['room3d', '2. 3B Simülasyon & Mekansal Görünüş'],
            ['interProjector', '3. Projeksiyonlar Arası Eksen & Mesafe Cetveli'],
            ['architecturalPlan', '4. 2B Mimari Yerleşim & CAD Paftası'],
            ['projection', '5. Projektör & Lens Hesapları'],
            ['lux', '6. Lux & Parlaklık Analizi'],
            ['multiProjector', '7. Çoklu Projektör & Kanvas Haritası'],
            ['electrical', '8. Elektrik Yük & Tek Hat Dağıtım Şeması'],
            ['equipmentList', '9. Ekipman Listesi (BOM)'],
            ['assumptionsAndWarnings', '10. Şantiye Standartları & Onay İmzaları'],
          ] as [keyof ReportSectionFlags, string][]).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer hover:text-white transition">
              <input type="checkbox" checked={sections[k]} onChange={() => toggle(k)} />
              <span>{label}</span>
            </label>
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
          </div>
        </div>
        <iframe title="rapor-onizleme" srcDoc={html} className="w-full flex-1 bg-white" />
      </div>
    </div>
  );
}
