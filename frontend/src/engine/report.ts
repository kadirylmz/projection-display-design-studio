/**
 * Müşteri sunumu ve teknik rapor üretici motoru (HTML/Yazdırılabilir PDF + SVG diyagram gömme).
 * Kabul Testi 10: Dışa aktarılan raporlar doğru proje verilerini ve diyagramları içermelidir.
 * Dil desteği: Türkçe ('tr') ve İngilizce ('en').
 */
import { solveProjection } from './throw';
import { computeLux } from './lux';
import { computeLayout, ProjectorSlot } from './multiproj';
import { Cabinet, ledFromCabinets } from './led';
import { analyze, Circuit, Load, Supply } from './electrical';
import { toSvg } from './drawing';
import { electricalSingleLine, ledElevation, mappingDrawing } from './drawings';
import { layoutToSvg } from './exporters';
import { round } from './units';

export type ReportLang = 'tr' | 'en';

export interface ReportSectionFlags {
  summary: boolean;
  projection: boolean;
  lux: boolean;
  multiProjector: boolean;
  led: boolean;
  electrical: boolean;
  drawings2d: boolean;
  equipmentList: boolean;
  assumptionsAndWarnings: boolean;
}

export const DEFAULT_SECTIONS: ReportSectionFlags = {
  summary: true,
  projection: true,
  lux: true,
  multiProjector: true,
  led: true,
  electrical: true,
  drawings2d: true,
  equipmentList: true,
  assumptionsAndWarnings: true,
};

export interface ReportProjectMeta {
  companyName: string;
  companyLogoDataUrl?: string;
  customer: string;
  projectName: string;
  location: string;
  category: string;
  date: string;
  revision: number;
  description: string;
  notes?: string;
}

export interface ReportPayload {
  lang: ReportLang;
  meta: ReportProjectMeta;
  sections: ReportSectionFlags;
  projection?: {
    projectorName: string;
    lensName: string;
    imageWidthM: number;
    distanceM: number;
    aspectW: number;
    aspectH: number;
    throwMin?: number;
    throwMax?: number;
    lensFrontProtrusionM?: number;
  };
  lux?: {
    ansiLumens: number[];
    brightnessPct: number;
    widthM: number;
    heightM: number;
    gain: number;
    ambientLux: number;
  };
  mappingSlots?: ProjectorSlot[];
  led?: {
    cabinet: Cabinet;
    cols: number;
    rows: number;
    spareFraction: number;
  };
  electrical?: {
    loads: Load[];
    circuits: Circuit[];
    supply: Supply;
  };
  equipmentList?: { category: string; manufacturer: string; model: string; qty: number; notes?: string }[];
}

const T: Record<ReportLang, Record<string, string>> = {
  tr: {
    reportTitle: 'AV MÜHENDİSLİK & TASARIM RAPORU',
    customer: 'Müşteri',
    project: 'Proje Adı',
    location: 'Konum',
    category: 'Kategori',
    date: 'Tarih',
    revision: 'Revizyon',
    summary: '1. Proje Özeti',
    projection: '2. Projektör & Lens Hesaplamaları',
    lux: '3. Fotometrik (Lux & Parlaklık) Analizi',
    multi: '4. Çoklu Projektör & Piksel Haritalama',
    led: '5. LED Duvar Spesifikasyonları',
    electrical: '6. Elektrik Yük & Tek Hat Şeması',
    drawings: '7. 2B Teknik Çizimler',
    equipment: '8. Ekipman Listesi',
    assumptions: '9. Teknik Varsayımlar, Uyarılar ve Sınırlamalar',
    projector: 'Projektör',
    lens: 'Lens',
    imgSize: 'Görüntü Boyutu (G × Y)',
    diagonal: 'Diagonal',
    throwRatio: 'Throw Ratio',
    optDist: 'Lens → Yüzey Mesafesi',
    chassisDist: 'Şasi Ön Yüzü → Yüzey',
    status: 'Durum',
    achievable: 'Ulaşılabilir',
    notAchievable: 'Fiziksel Sınır Dışı',
    totalFlux: 'Toplam Işık Akısı',
    illuminance: 'Ortalama Aydınlatma (Lux)',
    luminance: 'Ekran Parlaklığı (Nit / fL)',
    canvasRes: 'Birleşik Kanvas Çözünürlüğü',
    overlapCount: 'Örtüşme Bölgesi Sayısı',
    physSize: 'Fiziksel Boyut',
    nativeRes: 'Native Çözünürlük',
    cabinets: 'Kabin Adedi (+Yedek)',
    powerWeight: 'Güç (Tipik/Maks) & Ağırlık',
    totalPower: 'Toplam Güç / Talep Gücü',
    mainBreaker: 'Önerilen Ana Kesici',
    item: 'Kalem',
    qty: 'Adet',
    notes: 'Notlar',
  },
  en: {
    reportTitle: 'AV ENGINEERING & DESIGN REPORT',
    customer: 'Customer',
    project: 'Project Name',
    location: 'Location',
    category: 'Category',
    date: 'Date',
    revision: 'Revision',
    summary: '1. Project Summary',
    projection: '2. Projector & Lens Calculations',
    lux: '3. Photometric (Lux & Brightness) Analysis',
    multi: '4. Multi-Projector & Pixel Mapping',
    led: '5. LED Wall Specifications',
    electrical: '6. Electrical Load & Single-Line Diagram',
    drawings: '7. 2D Technical Drawings',
    equipment: '8. Equipment List',
    assumptions: '9. Technical Assumptions, Warnings & Limitations',
    projector: 'Projector',
    lens: 'Lens',
    imgSize: 'Image Dimensions (W × H)',
    diagonal: 'Diagonal',
    throwRatio: 'Throw Ratio',
    optDist: 'Lens-to-Surface Distance',
    chassisDist: 'Chassis-to-Surface Distance',
    status: 'Status',
    achievable: 'Achievable',
    notAchievable: 'Out of Physical Limits',
    totalFlux: 'Total Luminous Flux',
    illuminance: 'Average Illuminance (Lux)',
    luminance: 'Screen Luminance (Nits / fL)',
    canvasRes: 'Combined Canvas Resolution',
    overlapCount: 'Overlap Region Count',
    physSize: 'Physical Dimensions',
    nativeRes: 'Native Resolution',
    cabinets: 'Cabinet Quantity (+Spare)',
    powerWeight: 'Power (Typ/Max) & Weight',
    totalPower: 'Total Power / Demand Power',
    mainBreaker: 'Recommended Main Breaker',
    item: 'Item',
    qty: 'Qty',
    notes: 'Notes',
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function buildReportHtml(p: ReportPayload): string {
  const tr = T[p.lang];
  const m = p.meta;
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const blocks: string[] = [];

  if (p.sections.summary) {
    blocks.push(`<section><h2>${tr.summary}</h2><p>${esc(m.description || '—')}</p>${m.notes ? `<p><b>${tr.notes}:</b> ${esc(m.notes)}</p>` : ''}</section>`);
  }

  if (p.sections.projection && p.projection) {
    const pr = p.projection;
    const res = solveProjection({
      imageWidth: pr.imageWidthM,
      distance: pr.distanceM,
      aspect: { w: pr.aspectW, h: pr.aspectH },
      throwRange: pr.throwMin && pr.throwMax ? { min: pr.throwMin, max: pr.throwMax } : undefined,
      lensFrontProtrusion: pr.lensFrontProtrusionM ?? 0,
    });
    warnings.push(...res.warnings);
    assumptions.push(...res.approximations);
    blocks.push(`<section><h2>${tr.projection}</h2>
      <table><tbody>
        <tr><th>${tr.projector}</th><td>${esc(pr.projectorName)}</td><th>${tr.lens}</th><td>${esc(pr.lensName)}</td></tr>
        <tr><th>${tr.imgSize}</th><td>${round(res.imageWidth, 3)} × ${round(res.imageHeight, 3)} m</td><th>${tr.diagonal}</th><td>${round(res.diagonal, 3)} m</td></tr>
        <tr><th>${tr.throwRatio}</th><td>${round(res.throwRatio, 4)}:1</td><th>${tr.optDist}</th><td>${round(res.lensToSurface, 3)} m</td></tr>
        <tr><th>${tr.chassisDist}</th><td>${round(res.chassisFrontToSurface, 3)} m</td><th>${tr.status}</th><td>${res.achievable ? tr.achievable : tr.notAchievable}</td></tr>
      </tbody></table></section>`);
  }

  if (p.sections.lux && p.lux) {
    const lx = computeLux({
      ansiLumens: p.lux.ansiLumens,
      brightnessPct: p.lux.brightnessPct,
      width: p.lux.widthM,
      height: p.lux.heightM,
      gain: p.lux.gain,
      ambientLux: p.lux.ambientLux,
    });
    assumptions.push(...lx.assumptions);
    blocks.push(`<section><h2>${tr.lux}</h2>
      <table><tbody>
        <tr><th>${tr.totalFlux}</th><td>${round(lx.totalLumens, 0)} lm</td><th>${tr.illuminance}</th><td>${round(lx.illuminanceLux, 1)} lux (${round(lx.illuminanceFc, 1)} fc)</td></tr>
        <tr><th>${tr.luminance}</th><td>${round(lx.luminanceNits, 1)} cd/m² (${round(lx.luminanceFL, 1)} fL)</td><th>Gain</th><td>${p.lux.gain}</td></tr>
      </tbody></table></section>`);
  }

  if (p.sections.multiProjector && p.mappingSlots && p.mappingSlots.length > 0) {
    const L = computeLayout(p.mappingSlots);
    warnings.push(...L.warnings);
    const svg = layoutToSvg(L, { gridStep: 200, showCoords: true });
    blocks.push(`<section><h2>${tr.multi}</h2>
      <p><b>${tr.canvasRes}:</b> ${L.canvasW} × ${L.canvasH} px &nbsp;|&nbsp; <b>${tr.overlapCount}:</b> ${L.overlaps.length}</p>
      <div class="diagram">${svg}</div></section>`);
  }

  if (p.sections.led && p.led) {
    const r = ledFromCabinets(p.led.cabinet, p.led.cols, p.led.rows, p.led.spareFraction, { voltage: 230, powerFactor: 1 });
    warnings.push(...r.warnings);
    assumptions.push(...r.approximations);
    const svg = toSvg(ledElevation(p.led.cabinet, p.led.cols, p.led.rows), { background: '#0f172a' });
    blocks.push(`<section><h2>${tr.led}</h2>
      <table><tbody>
        <tr><th>${tr.physSize}</th><td>${r.widthMm} × ${r.heightMm} mm (${round(r.areaM2, 2)} m²)</td><th>${tr.nativeRes}</th><td>${r.resX} × ${r.resY} px (pitch ${p.led.cabinet.pitchMm} mm)</td></tr>
        <tr><th>${tr.cabinets}</th><td>${r.qty} (${r.cols}×${r.rows}) + ${r.spareQty}</td><th>${tr.powerWeight}</th><td>${r.powerTypW ?? 0}/${r.powerMaxW ?? 0} W · ${round(r.weightKg ?? 0, 1)} kg</td></tr>
      </tbody></table>
      ${p.sections.drawings2d ? `<div class="diagram">${svg}</div>` : ''}</section>`);
  }

  if (p.sections.electrical && p.electrical) {
    const el = analyze(p.electrical.loads, p.electrical.circuits, p.electrical.supply);
    warnings.push(...el.warnings);
    assumptions.push(...el.assumptions);
    for (const c of el.circuits) warnings.push(...c.warnings.map(w => `${c.circuit.name}: ${w}`));
    const sld = toSvg(electricalSingleLine(p.electrical.loads, p.electrical.circuits, p.electrical.supply, el), { background: '#0f172a' });
    blocks.push(`<section><h2>${tr.electrical}</h2>
      <p><b>${tr.totalPower}:</b> ${Math.round(el.totalW)} W / ${Math.round(el.demandW)} W (Ib = ${round(el.totalIbA, 1)} A) &nbsp;|&nbsp; <b>${tr.mainBreaker}:</b> ${el.mainBreakerA ?? '—'} A</p>
      <div class="diagram">${sld}</div></section>`);
  }

  if (p.sections.drawings2d && p.mappingSlots && p.mappingSlots.length > 0) {
    const L = computeLayout(p.mappingSlots);
    const cadSvg = toSvg(mappingDrawing(L), { background: '#0f172a' });
    blocks.push(`<section><h2>${tr.drawings}</h2><div class="diagram">${cadSvg}</div></section>`);
  }

  if (p.sections.equipmentList && p.equipmentList && p.equipmentList.length > 0) {
    const rows = p.equipmentList.map(e => `<tr><td>${esc(e.category)}</td><td>${esc(e.manufacturer)} ${esc(e.model)}</td><td>${e.qty}</td><td>${esc(e.notes ?? '')}</td></tr>`).join('');
    blocks.push(`<section><h2>${tr.equipment}</h2>
      <table><thead><tr><th>${tr.category}</th><th>${tr.item}</th><th>${tr.qty}</th><th>${tr.notes}</th></tr></thead><tbody>${rows}</tbody></table></section>`);
  }

  if (p.sections.assumptionsAndWarnings) {
    const wHtml = warnings.length ? `<ul>${[...new Set(warnings)].map(w => `<li class="warn">⚠ ${esc(w)}</li>`).join('')}</ul>` : '<p>—</p>';
    const aHtml = assumptions.length ? `<ul>${[...new Set(assumptions)].map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p>—</p>';
    blocks.push(`<section><h2>${tr.assumptions}</h2>${wHtml}${aHtml}</section>`);
  }

  return `<!doctype html><html lang="${p.lang}"><head><meta charset="utf-8"/><title>${esc(m.projectName)} — ${tr.reportTitle}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;margin:24px;line-height:1.45}
  header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0284c7;padding-bottom:12px;margin-bottom:16px}
  h1{font-size:20px;margin:0;color:#0369a1} h2{font-size:15px;margin:18px 0 8px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;color:#0f172a}
  table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left} th{background:#f1f5f9;width:22%}
  .diagram{margin:10px 0;max-width:100%} .diagram svg{width:100%;max-height:320px;border:1px solid #334155;border-radius:4px}
  .warn{color:#b45309}
  @media print{body{margin:10mm} section{break-inside:avoid}}
</style></head><body>
<header>
  <div><h1>${tr.reportTitle}</h1><div><b>${esc(m.companyName)}</b></div></div>
  ${m.companyLogoDataUrl ? `<img src="${esc(m.companyLogoDataUrl)}" alt="logo" style="max-height:54px"/>` : ''}
</header>
<table><tbody>
  <tr><th>${tr.project}</th><td>${esc(m.projectName)}</td><th>${tr.customer}</th><td>${esc(m.customer)}</td></tr>
  <tr><th>${tr.location}</th><td>${esc(m.location)}</td><th>${tr.category}</th><td>${esc(m.category)}</td></tr>
  <tr><th>${tr.date}</th><td>${esc(m.date)}</td><th>${tr.revision}</th><td>Rev ${m.revision}</td></tr>
</tbody></table>
${blocks.join('\n')}
</body></html>`;
}
