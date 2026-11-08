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
import { InterProjectorAnalysis } from './interprojector';

export type ReportLang = 'tr' | 'en';

export interface ReportSectionFlags {
  summary: boolean;
  room3d: boolean;
  architecturalPlan: boolean;
  interProjector: boolean;
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
  room3d: true,
  architecturalPlan: true,
  interProjector: true,
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
  room3dSnapshotUrl?: string;
  room3dSnapshots?: string[];
}

export interface ReportPayload {
  lang: ReportLang;
  meta: ReportProjectMeta;
  sections: ReportSectionFlags;
  room3dSnapshotUrl?: string;
  room3dSnapshots?: string[];
  room3dNotes?: string;
  architecturalPlanSvg?: string;
  interProjectorAnalysis?: InterProjectorAnalysis;
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
    room3d: '3B Simülasyon & 2B Görsel Paftalar',
    archPlan: 'Mimari Yerleşim & CAD Paftası',
    interProjector: 'Projeksiyonlar Arası Montaj, Eksen ve Aralık Cetveli',
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
    room3d: '3D Simulation & 2D Visual Layouts',
    archPlan: 'Architectural Layout & CAD Plan',
    interProjector: 'Inter-Projector Spacing & Mechanical Installation Schedule',
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

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function buildReportHtml(p: ReportPayload): string {
  const tr = T[p.lang];
  const m = p.meta;
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const blocks: string[] = [];

  // 1. PROJE ÖZETİ
  if (p.sections.summary) {
    let elAnalysis: ReturnType<typeof analyze> | null = null;
    if (p.electrical) {
      try {
        elAnalysis = analyze(p.electrical.loads, p.electrical.circuits, p.electrical.supply);
      } catch (err) {
        console.warn('Report electrical analyze fallback:', err);
      }
    }

    const totalPj = p.interProjectorAnalysis?.totalProjectors ?? (p.mappingSlots?.length ?? 1);
    const totalW = elAnalysis?.totalW ?? (p.interProjectorAnalysis?.totalPowerW ?? 0);
    const demandW = elAnalysis?.demandW ?? totalW;
    const totalIbA = elAnalysis?.totalIbA ?? (totalW > 0 ? (totalW / (230 * 0.95)) : 0);
    const mainBrkA = elAnalysis?.mainBreakerA ?? (totalW > 9000 ? 63 : 40);
    const phases = p.electrical?.supply.phases ?? (totalW > 9000 ? 3 : 1);
    const roomDims = p.interProjectorAnalysis?.roomDimensions;

    blocks.push(`<section class="report-section">
      <h2>${tr.summary}</h2>
      <p class="summary-desc">${esc(m.description || 'Bu rapor, mimari mekan içerisindeki projeksiyon yüzeylerinin, cihaz yerleşimlerinin, montaj eksen mesafelerinin ve elektrik altyapısının mühendislik detaylarını içermektedir.')}</p>
      
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-val text-sky">${totalPj} Adet</div>
          <div class="metric-lbl">Toplam Projektör</div>
        </div>
        <div class="metric-card">
          <div class="metric-val text-amber">${(totalW / 1000).toFixed(2)} kW</div>
          <div class="metric-lbl">Toplam Kurulu Güç (${Math.round(totalW)} W)</div>
        </div>
        <div class="metric-card">
          <div class="metric-val text-rose">${totalIbA.toFixed(1)} A</div>
          <div class="metric-lbl">Toplam İşletme Akımı (Ib)</div>
        </div>
        ${roomDims ? `
        <div class="metric-card">
          <div class="metric-val text-purple">${roomDims.widthM}m × ${roomDims.lengthM}m × ${roomDims.heightM}m</div>
          <div class="metric-lbl">Oda Ebatları (G × U × Y)</div>
        </div>` : ''}
      </div>

      <table class="compact-table" style="margin: 12px 0;">
        <tbody>
          <tr>
            <th>Toplam Kurulu Güç (P<sub>top</sub>)</th>
            <td><b class="text-amber">${(totalW / 1000).toFixed(2)} kW</b> (${Math.round(totalW).toLocaleString('tr-TR')} Watt)</td>
            <th>Eşzamanlı Talep Gücü (P<sub>talep</sub>)</th>
            <td><b class="text-amber">${(demandW / 1000).toFixed(2)} kW</b> (Talep Faktörü k=1.0)</td>
          </tr>
          <tr>
            <th>Toplam Çekilen Akım (I<sub>b</sub>)</th>
            <td><b class="text-rose">${totalIbA.toFixed(1)} Amper</b> ${phases === 3 ? `(Faz Başına Ortalama ~${(totalIbA / 3).toFixed(1)} A)` : '(@230V AC)'}</td>
            <th>Gerekli Dağıtım Linyeleri</th>
            <td>${elAnalysis?.circuits.length ?? (p.interProjectorAnalysis?.surfaceStats.length ?? 4)} Adet Linye (${phases === 3 ? 'L1, L2, L3 Dengeli Dağıtım' : 'Monofaze Dağıtım'})</td>
          </tr>
        </tbody>
      </table>
        </tbody>
      </table>
      
      ${m.notes ? `<div class="note-box"><b>${tr.notes}:</b> ${esc(m.notes)}</div>` : ''}
    </section>`);
  }

  // 2. 3B SİMÜLASYON & PERSPEKTİF ODA GÖRÜNÜŞÜ (Seçiliyse)
  const snapshots: string[] = (p.room3dSnapshots && p.room3dSnapshots.length > 0)
    ? p.room3dSnapshots
    : (m.room3dSnapshots && m.room3dSnapshots.length > 0)
      ? m.room3dSnapshots
      : (p.room3dSnapshotUrl || m.room3dSnapshotUrl ? [p.room3dSnapshotUrl || m.room3dSnapshotUrl!] : []);

  if (p.sections.room3d && (snapshots.length > 0 || p.interProjectorAnalysis)) {
    blocks.push(`<section class="report-section">
      <h2>${tr.room3d}</h2>
      ${snapshots.length > 0 ? `
        <div class="three-d-gallery">
          ${snapshots.map((url, idx) => `
            <div class="three-d-card">
              <img src="${esc(url)}" alt="3B Simülasyon Görünüşü #${idx + 1}" class="three-d-img" />
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-3d-box">
          <p>📸 <b>3B & 2B Görsel Simülasyonlar:</b> <i>"3D Oda", "2B Açınım" veya "CAD Çizim" sekmelerinden "📋 Rapora Ekle" butonuna tıklayarak istediğiniz kamera açısından 3B simülasyonları ve 2B açınım paftalarını buraya aktarabilirsiniz.</i></p>
        </div>
      `}
    </section>`);
  }

  // 3. PROJEKSİYONLAR ARASI MONTAJ, EKSEN VE ARALIK CETVELİ (INTER-PROJECTOR SPACING)
  if (p.sections.interProjector && p.interProjectorAnalysis) {
    const ip = p.interProjectorAnalysis;

    // Yüzey Özeti Tablosu
    const surfSummaryRows = ip.surfaceStats.map(s => `
      <tr>
        <td><b>${esc(s.surfaceName)}</b></td>
        <td>${s.surfaceType === 'floor' ? 'Zemin (Tavandan Aşağı)' : 'Dikey Duvar'}</td>
        <td>${s.surfaceWidthM}m × ${s.surfaceHeightM}m</td>
        <td><b>${s.projectorCount} Adet</b> (${s.cols}×${s.rows})</td>
        <td>${s.singleWidthM}m × ${s.singleHeightM}m</td>
        <td class="highlight-cell">${s.spacingM > 0 ? `${s.spacingM} m` : '—'}</td>
        <td class="highlight-cell">${s.overlapWidthM} m (%${s.overlapPct})</td>
        <td>D = ${s.throwDistM} m</td>
        <td>H = ${s.mountHeightM} m</td>
        <td><b>${s.totalPowerW} W</b></td>
      </tr>
    `).join('');

    // Tek Tek Her Projektörün Detaylı Montaj Cetveli
    const pjDetailRows = ip.projectors.map(pj => `
      <tr>
        <td class="pj-id-cell"><b>${esc(pj.id)}</b></td>
        <td>${esc(pj.surfaceName)}</td>
        <td class="measure-cell">${pj.leftEdgeDistM.toFixed(2)} m</td>
        <td class="measure-cell highlight-cell"><b>${pj.spacingToNextM !== null ? `${pj.spacingToNextM.toFixed(2)} m` : '— (Son Cihaz)'}</b></td>
        <td class="measure-cell">${pj.overlapWidthM.toFixed(2)} m (%${pj.overlapPct})</td>
        <td class="measure-cell">${pj.throwDistM.toFixed(2)} m</td>
        <td class="measure-cell">${pj.mountHeightM.toFixed(2)} m</td>
        <td class="measure-cell">${pj.ceilingDistM.toFixed(2)} m</td>
        <td class="coord-cell">X: ${pj.worldPos[0].toFixed(2)}<br/>Z: ${pj.worldPos[2].toFixed(2)}</td>
        <td><span class="badge-circuit">${esc(pj.circuitId)}</span> (${esc(pj.circuitPhase)})</td>
      </tr>
    `).join('');

    // Köşe Geçişleri (Varsa)
    let cornerBlock = '';
    if (ip.cornerTransitions.length > 0) {
      const cornerRows = ip.cornerTransitions.map(c => `
        <tr>
          <td><b>${esc(c.cornerName)}</b></td>
          <td><b>${esc(c.fromProjId)} ↔ ${esc(c.toProjId)}</b></td>
          <td class="highlight-cell"><b>${c.euclideanDistM.toFixed(2)} m</b></td>
          <td>${c.angleDeg}°</td>
          <td>${esc(c.notes)}</td>
        </tr>
      `).join('');

      cornerBlock = `
        <h3 class="sub-heading">Köşe Geçişleri & 3B Lensler Arası Kuş Uçuşu Mesafeler</h3>
        <table class="compact-table">
          <thead>
            <tr>
              <th>Köşe Tanımı</th>
              <th>Cihaz Çifti</th>
              <th>3B Lens Mesafesi (D<sub>3D</sub>)</th>
              <th>Köşe Açısı</th>
              <th>Mühendislik Notu</th>
            </tr>
          </thead>
          <tbody>${cornerRows}</tbody>
        </table>
      `;
    }

    blocks.push(`<section class="report-section">
      <h2>${tr.interProjector}</h2>
      <p class="section-intro">Şantiye ve mekanik montaj ekiplerinin sahada lazer metre ile doğrudan uygulayabileceği eksen aralıkları, sol referans kenar mesafeleri, tavan askı borusu boyları ve linye bağlantıları aşağıda listelenmiştir.</p>

      <h3 class="sub-heading">Yüzey Bazlı Montaj & Eksen Özeti</h3>
      <table class="compact-table">
        <thead>
          <tr>
            <th>Yüzey</th>
            <th>Tip</th>
            <th>Fiziksel Ebat</th>
            <th>PJ Adet</th>
            <th>1 PJ Açınımı</th>
            <th>Eksen Aralığı (ΔX)</th>
            <th>Örtüşme (Blend)</th>
            <th>Atım (D)</th>
            <th>Yükseklik (H)</th>
            <th>Güç</th>
          </tr>
        </thead>
        <tbody>${surfSummaryRows}</tbody>
      </table>

      <h3 class="sub-heading">Bireysel Projektör Montaj & Mesafe Matrisi (Cihaz Başı Cetvel)</h3>
      <table class="compact-table pj-matrix-table">
        <thead>
          <tr>
            <th>Cihaz Kodu</th>
            <th>Yüzey</th>
            <th>Sol Kenara Mesafe</th>
            <th>Sonraki PJ Eksen Aralığı (ΔX)</th>
            <th>Blend Bölgesi</th>
            <th>Atım Mesafesi (D)</th>
            <th>Montaj Kotu (H)</th>
            <th>Tavandan Askı</th>
            <th>3B Koordinatlar (m)</th>
            <th>Linye & Faz</th>
          </tr>
        </thead>
        <tbody>${pjDetailRows}</tbody>
      </table>

      ${cornerBlock}

      <div class="guideline-card">
        <b>🛠 Mekanik Montaj & Şantiye Standartları:</b>
        <ul>
          <li><b>Eksen Hizalaması:</b> Komşu projektör eksen aralıkları (ΔX) montaj sırasında lazer nivo ve lazer şakül ile ±5mm tolerans sınırları içinde sabitlenmelidir.</li>
          <li><b>Titreşim Yalıtımı:</b> Truss ve tavan askı borularında titreşim emici kauçuk flanşlar kullanılmalı, havalandırma kanalları veya hoparlör sub-bass rezonanslarından izole edilmelidir.</li>
          <li><b>Isı & Servis Boşluğu:</b> Cihazların egzoz hava çıkışları önünde minimum 50cm, arka filtre emişlerinde minimum 30cm açık alan bırakılmalıdır.</li>
        </ul>
      </div>
    </section>`);
  }

  // 4. PROJEKSİYON & LENS HESAPLARI
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
    blocks.push(`<section class="report-section">
      <h2>${tr.projection}</h2>
      <table><tbody>
        <tr><th>${tr.projector}</th><td>${esc(pr.projectorName)}</td><th>${tr.lens}</th><td>${esc(pr.lensName)}</td></tr>
        <tr><th>${tr.imgSize}</th><td>${round(res.imageWidth, 3)} × ${round(res.imageHeight, 3)} m</td><th>${tr.diagonal}</th><td>${round(res.diagonal, 3)} m</td></tr>
        <tr><th>${tr.throwRatio}</th><td>${round(res.throwRatio, 4)}:1</td><th>${tr.optDist}</th><td>${round(res.lensToSurface, 3)} m</td></tr>
        <tr><th>${tr.chassisDist}</th><td>${round(res.chassisFrontToSurface, 3)} m</td><th>${tr.status}</th><td>${res.achievable ? `<span class="badge-success">${tr.achievable}</span>` : `<span class="badge-danger">${tr.notAchievable}</span>`}</td></tr>
      </tbody></table>
    </section>`);
  }

  // 5. FOTOMETRİK LUX & PARLAKLIK ANALİZİ
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
    blocks.push(`<section class="report-section">
      <h2>${tr.lux}</h2>
      <table><tbody>
        <tr><th>${tr.totalFlux}</th><td><b>${round(lx.totalLumens, 0)} ANSI Lümen</b></td><th>${tr.illuminance}</th><td><b>${round(lx.illuminanceLux, 1)} Lux</b> (${round(lx.illuminanceFc, 1)} fc)</td></tr>
        <tr><th>${tr.luminance}</th><td><b>${round(lx.luminanceNits, 1)} cd/m² (Nit)</b> (${round(lx.luminanceFL, 1)} fL)</td><th>Ekran Gain / Yansıtma</th><td>${p.lux.gain} Gain</td></tr>
      </tbody></table>
    </section>`);
  }

  // 6. ÇOKLU PROJEKTÖR & KANVAS HARİTALAMA
  if (p.sections.multiProjector && p.mappingSlots && p.mappingSlots.length > 0) {
    const L = computeLayout(p.mappingSlots);
    warnings.push(...L.warnings);
    const svg = layoutToSvg(L, { gridStep: 200, showCoords: true });
    blocks.push(`<section class="report-section">
      <h2>${tr.multi}</h2>
      <p><b>${tr.canvasRes}:</b> ${L.canvasW} × ${L.canvasH} px &nbsp;|&nbsp; <b>${tr.overlapCount}:</b> ${L.overlaps.length}</p>
      <div class="diagram">${svg}</div>
    </section>`);
  }

  // 7. LED DUVAR SPESİFİKASYONLARI
  if (p.sections.led && p.led) {
    const r = ledFromCabinets(p.led.cabinet, p.led.cols, p.led.rows, p.led.spareFraction, { voltage: 230, powerFactor: 1 });
    warnings.push(...r.warnings);
    assumptions.push(...r.approximations);
    const svg = toSvg(ledElevation(p.led.cabinet, p.led.cols, p.led.rows), { background: '#0f172a' });
    blocks.push(`<section class="report-section">
      <h2>${tr.led}</h2>
      <table><tbody>
        <tr><th>${tr.physSize}</th><td>${r.widthMm} × ${r.heightMm} mm (${round(r.areaM2, 2)} m²)</td><th>${tr.nativeRes}</th><td>${r.resX} × ${r.resY} px (pitch ${p.led.cabinet.pitchMm} mm)</td></tr>
        <tr><th>${tr.cabinets}</th><td>${r.qty} (${r.cols}×${r.rows}) + ${r.spareQty}</td><th>${tr.powerWeight}</th><td>${r.powerTypW ?? 0}/${r.powerMaxW ?? 0} W · ${round(r.weightKg ?? 0, 1)} kg</td></tr>
      </tbody></table>
      ${p.sections.drawings2d ? `<div class="diagram">${svg}</div>` : ''}
    </section>`);
  }

  // 8. ELEKTRİK YÜK & TEK HAT ŞEMASI
  if (p.sections.electrical && p.electrical) {
    const el = analyze(p.electrical.loads, p.electrical.circuits, p.electrical.supply);
    warnings.push(...el.warnings);
    assumptions.push(...el.assumptions);
    for (const c of el.circuits) warnings.push(...c.warnings.map(w => `${c.circuit.name}: ${w}`));
    const sld = toSvg(electricalSingleLine(p.electrical.loads, p.electrical.circuits, p.electrical.supply, el), { background: '#0b1220' });

    const circuitRows = el.circuits.map(c => `
      <tr>
        <td><b>${esc(c.circuit.name)}</b></td>
        <td><span class="badge-circuit">${esc(c.circuit.phase ?? 'L1')}</span></td>
        <td><b>${c.breakerA ?? 16} A</b> (B-Tipi)</td>
        <td>${c.circuit.cableMm2 ?? 2.5} mm² NYM / Halogen-Free</td>
        <td><b>${round(c.ibA, 1)} A</b></td>
        <td>${Math.round(c.powerW)} W</td>
        <td>${c.dropPct !== undefined ? `%${round(c.dropPct, 2)}` : '—'}</td>
        <td>${c.warnings.length === 0 ? '<span class="badge-success">✓ Uygun</span>' : `<span class="badge-danger">${esc(c.warnings.join(' | '))}</span>`}</td>
      </tr>
    `).join('');

    blocks.push(`<section class="report-section">
      <h2>${tr.electrical}</h2>
      <p><b>${tr.totalPower}:</b> ${Math.round(el.totalW)} W / ${Math.round(el.demandW)} W (Ib = ${round(el.totalIbA, 1)} A) &nbsp;|&nbsp; <b>${tr.mainBreaker}:</b> ${el.mainBreakerA ?? '—'} A</p>
      
      <div class="diagram cad-diagram">${sld}</div>

      <h3 class="sub-heading">Linye Dağıtım & Yük Dengeleme Tablosu</h3>
      <table class="compact-table">
        <thead>
          <tr>
            <th>Linye Adı</th>
            <th>Faz</th>
            <th>Sigorta Anma Akımı</th>
            <th>Kablo Kesiti</th>
            <th>Çalışma Akımı (Ib)</th>
            <th>Toplam Yük</th>
            <th>Gerilim Düşümü</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>${circuitRows}</tbody>
      </table>
    </section>`);
  }

  // 9. 2B TEKNİK CAD ÇİZİMLERİ (Mimari Yerleşim & Mapping Çizimi)
  if (p.sections.drawings2d || p.sections.architecturalPlan) {
    if (p.architecturalPlanSvg) {
      blocks.push(`<section class="report-section">
        <h2>${tr.archPlan}</h2>
        <p class="section-intro">Aşağıdaki mimari yerleşim planında oda dış sınırları, projeksiyon cihazlarının tavandaki askı merkezleri, duvardan dik atım mesafeleri (D) ve 230V besleme prizleri şematik olarak gösterilmiştir.</p>
        <div class="diagram cad-diagram">${p.architecturalPlanSvg}</div>
        <div class="legend-row">
          <span><b style="color:#ef4444">🔴 Kırmızı Daire:</b> 230V 16A Priz Noktası</span>
          <span><b style="color:#0ea5e9">🟦 Mavi Kutu:</b> Projektör Askı Noktası</span>
          <span><b style="color:#10b981">📏 D:</b> Duvardan Lens Atım Mesafesi (m)</span>
          <span><b style="color:#f59e0b">📐 H:</b> Yerden Lens Montaj Kotu (m)</span>
        </div>
      </section>`);
    }

    if (p.mappingSlots && p.mappingSlots.length > 0) {
      const L = computeLayout(p.mappingSlots);
      const cadSvg = toSvg(mappingDrawing(L), { background: '#0f172a' });
      blocks.push(`<section class="report-section"><h2>${tr.drawings}</h2><div class="diagram">${cadSvg}</div></section>`);
    }
  }

  // 10. EKİPMAN LİSTESİ (BOM)
  if (p.sections.equipmentList && p.equipmentList && p.equipmentList.length > 0) {
    const rows = p.equipmentList.map(e => `
      <tr>
        <td><b>${esc(e.category)}</b></td>
        <td>${esc(e.manufacturer)} ${esc(e.model)}</td>
        <td style="text-align:center"><b>${e.qty}</b></td>
        <td>${esc(e.notes ?? '—')}</td>
      </tr>
    `).join('');
    blocks.push(`<section class="report-section">
      <h2>${tr.equipment}</h2>
      <table class="compact-table">
        <thead>
          <tr>
            <th>${tr.category}</th>
            <th>${tr.item}</th>
            <th style="text-align:center">${tr.qty}</th>
            <th>${tr.notes}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`);
  }

  // 11. TEKNİK KABULLER & MÜHENDİSLİK ONAYI
  if (p.sections.assumptionsAndWarnings) {
    const wHtml = warnings.length ? `<ul class="warning-list">${[...new Set(warnings)].map(w => `<li class="warn">⚠ ${esc(w)}</li>`).join('')}</ul>` : '<p class="text-muted">Kritik bir mühendislik uyarısı bulunmamaktadır.</p>';
    const aHtml = assumptions.length ? `<ul class="assumption-list">${[...new Set(assumptions)].map(a => `<li>• ${esc(a)}</li>`).join('')}</ul>` : '';

    blocks.push(`<section class="report-section">
      <h2>${tr.assumptions}</h2>
      ${wHtml}
      ${aHtml}

      <div class="sign-block">
        <div class="sign-box">
          <div class="sign-title">HAZIRLAYAN AV & PROJEKSİYON MÜHENDİSİ</div>
          <div class="sign-space"></div>
          <div class="sign-name">İsim / Kaşe / İmza</div>
          <div class="sign-date">Tarih: ${esc(m.date)}</div>
        </div>
        <div class="sign-box">
          <div class="sign-title">MÜŞTERİ / PROJE ONAY MAKAMI</div>
          <div class="sign-space"></div>
          <div class="sign-name">${esc(m.customer)}</div>
          <div class="sign-date">Tarih: ______ / ______ / 2026</div>
        </div>
      </div>
    </section>`);
  }

  return `<!doctype html>
<html lang="${p.lang}">
<head>
<meta charset="utf-8"/>
<title>${esc(m.projectName)} — ${tr.reportTitle}</title>
<style>
  :root {
    --primary: #0284c7;
    --primary-dark: #0369a1;
    --dark: #0f172a;
    --border: #cbd5e1;
    --bg-alt: #f8fafc;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    margin: 0;
    padding: 32px;
    line-height: 1.5;
    font-size: 13px;
  }
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid var(--primary);
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .report-header h1 {
    font-size: 22px;
    margin: 0 0 4px;
    color: var(--primary-dark);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .company-title {
    font-size: 14px;
    color: #475569;
    font-weight: 600;
  }
  .header-logo {
    max-height: 64px;
    max-width: 220px;
    object-fit: contain;
  }
  
  .meta-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    background: #f8fafc;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .meta-table th, .meta-table td {
    padding: 8px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
  .meta-table th {
    background: #f1f5f9;
    color: #334155;
    width: 16%;
    font-weight: 600;
    text-align: left;
  }
  
  .report-section {
    margin-bottom: 32px;
    break-inside: avoid;
  }
  h2 {
    font-size: 16px;
    color: #0f172a;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 6px;
    margin: 24px 0 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sub-heading {
    font-size: 13px;
    color: #334155;
    margin: 16px 0 8px;
    font-weight: 700;
  }
  .section-intro {
    font-size: 12px;
    color: #475569;
    margin-bottom: 12px;
  }
  
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .metric-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 12px;
    border-radius: 6px;
    text-align: center;
  }
  .metric-val {
    font-size: 18px;
    font-weight: 800;
    font-family: monospace;
    margin-bottom: 2px;
  }
  .metric-lbl {
    font-size: 11px;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .text-sky { color: #0284c7; }
  .text-amber { color: #d97706; }
  .text-emerald { color: #059669; }
  .text-purple { color: #7c3aed; }
  .text-rose { color: #e11d48; }
  
  .three-d-gallery {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 12px 0;
  }
  .three-d-card {
    background: #090e17;
    border: 1px solid #1e293b;
    border-radius: 8px;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .three-d-img {
    width: 100%;
    display: block;
    max-height: 520px;
    object-fit: contain;
    background: #060911;
  }
  .empty-3d-box {
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    padding: 16px;
    border-radius: 6px;
    color: #64748b;
    font-size: 12px;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin: 10px 0;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 7px 10px;
    text-align: left;
  }
  th {
    background: #f1f5f9;
    color: #1e293b;
    font-weight: 600;
  }
  .compact-table th, .compact-table td {
    padding: 5px 8px;
    font-size: 11px;
  }
  .pj-matrix-table td {
    font-family: monospace;
    font-size: 11px;
  }
  .pj-id-cell {
    color: #0284c7;
  }
  .measure-cell {
    text-align: right;
  }
  .highlight-cell {
    background: #f0fdf4;
    color: #166534;
    font-weight: 700;
  }
  .coord-cell {
    font-size: 10px;
    color: #475569;
  }
  
  .diagram {
    margin: 14px 0;
    max-width: 100%;
    background: #090e17;
    border: 1px solid #334155;
    border-radius: 6px;
    overflow: hidden;
    padding: 8px;
  }
  .diagram svg {
    width: 100%;
    height: auto;
    max-height: 420px;
    display: block;
  }
  .legend-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 11px;
    background: #f8fafc;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    margin-top: 6px;
  }
  
  .badge-circuit {
    display: inline-block;
    padding: 2px 6px;
    background: #e0f2fe;
    color: #0369a1;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
  }
  .badge-success {
    color: #15803d;
    font-weight: bold;
  }
  .badge-danger {
    color: #b91c1c;
    font-weight: bold;
  }
  .guideline-card {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    padding: 12px;
    border-radius: 6px;
    margin-top: 14px;
    font-size: 11px;
    color: #1e3a8a;
  }
  .guideline-card ul {
    margin: 6px 0 0 18px;
    padding: 0;
  }
  .guideline-card li {
    margin-bottom: 4px;
  }
  .note-box {
    background: #fffbeb;
    border: 1px solid #fef3c7;
    padding: 10px 12px;
    border-radius: 6px;
    margin-top: 10px;
    font-size: 12px;
    color: #92400e;
  }
  .warning-list { color: #b45309; padding-left: 20px; }
  .assumption-list { color: #475569; padding-left: 20px; font-size: 11px; }
  
  .sign-block {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 36px;
    padding-top: 16px;
    border-top: 1px dashed #cbd5e1;
  }
  .sign-box {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 14px;
    background: #f8fafc;
  }
  .sign-title {
    font-size: 11px;
    font-weight: 700;
    color: #334155;
    text-transform: uppercase;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
  }
  .sign-space {
    height: 60px;
  }
  .sign-name {
    font-size: 12px;
    font-weight: 600;
    color: #0f172a;
  }
  .sign-date {
    font-size: 11px;
    color: #64748b;
  }
  
  @media print {
    body { margin: 8mm; padding: 0; }
    .report-section { break-inside: avoid; page-break-after: auto; }
    .three-d-img { max-height: 380px; }
    .diagram svg { max-height: 320px; }
  }
</style>
</head>
<body>

<header class="report-header">
  <div>
    <h1>${tr.reportTitle}</h1>
    <div class="company-title">${esc(m.companyName)}</div>
  </div>
  ${m.companyLogoDataUrl ? `<img src="${esc(m.companyLogoDataUrl)}" alt="logo" class="header-logo"/>` : ''}
</header>

<table class="meta-table">
  <tbody>
    <tr>
      <th>${tr.project}</th>
      <td><b>${esc(m.projectName)}</b></td>
      <th>${tr.customer}</th>
      <td><b>${esc(m.customer)}</b></td>
    </tr>
    <tr>
      <th>${tr.location}</th>
      <td>${esc(m.location)}</td>
      <th>${tr.category}</th>
      <td>${esc(m.category)}</td>
    </tr>
    <tr>
      <th>${tr.date}</th>
      <td>${esc(m.date)}</td>
      <th>${tr.revision}</th>
      <td><b>Rev ${m.revision}</b></td>
    </tr>
  </tbody>
</table>

${blocks.join('\n')}

</body>
</html>`;
}
