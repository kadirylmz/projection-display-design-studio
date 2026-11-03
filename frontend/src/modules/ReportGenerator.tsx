import { useMemo, useState } from 'react';
import { buildReportHtml, DEFAULT_SECTIONS, ReportLang, ReportSectionFlags } from '../engine/report';
import { useProjectStore } from '../projectStore';
import { useMapping } from '../mappingStore';
import { download } from '../util';

export default function ReportGenerator() {
  const { meta, setMeta, projectionSnap, luxSnap, ledSnap, electrical, equipmentList, setEquipmentList } = useProjectStore();
  const { slots } = useMapping();
  const [lang, setLang] = useState<ReportLang>('tr');
  const [sections, setSections] = useState<ReportSectionFlags>(DEFAULT_SECTIONS);
  const [presentation, setPresentation] = useState(false);

  const html = useMemo(() => buildReportHtml({
    lang,
    meta,
    sections,
    projection: projectionSnap,
    lux: luxSnap,
    mappingSlots: slots,
    led: ledSnap,
    electrical,
    equipmentList,
  }), [lang, meta, sections, projectionSnap, luxSnap, slots, ledSnap, electrical, equipmentList]);

  const printPdf = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const toggle = (k: keyof ReportSectionFlags) => setSections(s => ({ ...s, [k]: !s[k] }));

  if (presentation) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
        <div className="p-2 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-xs">
          <b>MÜŞTERİ SUNUM MODU — {meta.projectName} ({meta.customer})</b>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-sky-700 rounded" onClick={printPdf}>PDF Yazdır / Kaydet</button>
            <button className="px-3 py-1 bg-slate-700 rounded" onClick={() => setPresentation(false)}>Sunumdan Çık</button>
          </div>
        </div>
        <iframe title="sunum" srcDoc={html} className="flex-1 w-full bg-white" />
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-4 h-full">
      <div className="space-y-2 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto text-xs" style={{ maxHeight: '88vh' }}>
        <h2 className="text-sm font-semibold">PDF Rapor & Teknik Çizim Üreticisi</h2>
        <div className="flex gap-2">
          <label className="flex-1">Rapor Dili
            <select className="inp" value={lang} onChange={e => setLang(e.target.value as ReportLang)}>
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="flex-1">Firma Logosu
            <input type="file" accept="image/*" className="inp text-[11px]" onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              const rd = new FileReader();
              rd.onload = () => setMeta({ companyLogoDataUrl: rd.result as string });
              rd.readAsDataURL(f);
            }} />
          </label>
        </div>

        <label className="block">Firma Adı<input className="inp" value={meta.companyName} onChange={e => setMeta({ companyName: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label>Müşteri<input className="inp" value={meta.customer} onChange={e => setMeta({ customer: e.target.value })} /></label>
          <label>Proje Adı<input className="inp" value={meta.projectName} onChange={e => setMeta({ projectName: e.target.value })} /></label>
          <label>Konum<input className="inp" value={meta.location} onChange={e => setMeta({ location: e.target.value })} /></label>
          <label>Kategori<input className="inp" value={meta.category} onChange={e => setMeta({ category: e.target.value })} /></label>
          <label>Tarih<input className="inp" type="date" value={meta.date} onChange={e => setMeta({ date: e.target.value })} /></label>
          <label>Revizyon No<input className="inp" type="number" min="1" value={meta.revision} onChange={e => setMeta({ revision: Math.max(1, +e.target.value) })} /></label>
        </div>
        <label className="block">Proje Özeti<textarea className="inp h-14" value={meta.description} onChange={e => setMeta({ description: e.target.value })} /></label>

        <div className="border-t border-slate-700 pt-2 space-y-1">
          <b>Rapora Dahil Edilecek Bölümler</b>
          {([
            ['summary', 'Proje Özeti'],
            ['projection', 'Projektör & Lens Hesapları'],
            ['lux', 'Lux & Parlaklık Analizi'],
            ['multiProjector', 'Çoklu Projektör & Piksel Haritası'],
            ['led', 'LED Duvar Spesifikasyonları'],
            ['electrical', 'Elektrik Yük & Tek Hat Şeması'],
            ['drawings2d', '2B CAD Teknik Çizimler'],
            ['equipmentList', 'Ekipman Listesi'],
            ['assumptionsAndWarnings', 'Teknik Varsayımlar ve Uyarılar'],
          ] as [keyof ReportSectionFlags, string][]).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={sections[k]} onChange={() => toggle(k)} />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="border-t border-slate-700 pt-2 space-y-1">
          <div className="flex justify-between items-center">
            <b>Rapor Ekipman Listesi</b>
            <button className="px-2 py-0.5 bg-slate-700 rounded" onClick={() => setEquipmentList([...equipmentList, { category: 'Projektör', manufacturer: '', model: '', qty: 1 }])}>+ Satır</button>
          </div>
          {equipmentList.map((item, i) => (
            <div key={i} className="grid grid-cols-[80px_1fr_44px_20px] gap-1 items-center">
              <input className="inp !mt-0" placeholder="Kategori" value={item.category} onChange={e => setEquipmentList(equipmentList.map((x, k) => k === i ? { ...x, category: e.target.value } : x))} />
              <input className="inp !mt-0" placeholder="Model" value={item.model} onChange={e => setEquipmentList(equipmentList.map((x, k) => k === i ? { ...x, model: e.target.value } : x))} />
              <input className="inp !mt-0" type="number" min="1" value={item.qty} onChange={e => setEquipmentList(equipmentList.map((x, k) => k === i ? { ...x, qty: +e.target.value } : x))} />
              <button className="text-red-400" onClick={() => setEquipmentList(equipmentList.filter((_, k) => k !== i))}>✕</button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button className="px-3 py-1.5 bg-sky-700 rounded font-semibold text-white" onClick={printPdf}>PDF Rapor Yazdır / İndir</button>
          <button className="px-3 py-1.5 bg-emerald-700 rounded font-semibold text-white" onClick={() => setPresentation(true)}>Sunum Modu (Tam Ekran)</button>
          <button className="px-3 py-1.5 bg-slate-700 rounded" onClick={() => download(`${meta.projectName || 'rapor'}.html`, html, 'text/html')}>HTML İndir</button>
        </div>
      </div>

      <div className="h-full min-h-[75vh] border border-slate-700 rounded overflow-hidden bg-white">
        <iframe title="rapor-onizleme" srcDoc={html} className="w-full h-full" />
      </div>
    </div>
  );
}
