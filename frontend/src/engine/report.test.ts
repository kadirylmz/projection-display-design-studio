import { describe, expect, it } from 'vitest';
import { buildReportHtml, DEFAULT_SECTIONS, ReportPayload } from './report';
import { gridLayout } from './multiproj';
import { defaultSupply } from './electrical';

describe('rapor üretici (kabul testi 10)', () => {
  const payload: ReportPayload = {
    lang: 'tr',
    meta: {
      companyName: 'Test AV Mühendislik',
      customer: 'Kültür Müzesi',
      projectName: 'Ana Salon Mapping',
      location: 'İstanbul',
      category: 'Müze',
      date: '2026-11-04',
      revision: 2,
      description: 'Ana kubbe ve duvar projeksiyon sistemi.',
    },
    sections: DEFAULT_SECTIONS,
    projection: {
      projectorName: 'TestProj P1',
      lensName: 'TestLens L1',
      imageWidthM: 4,
      distanceM: 6,
      aspectW: 16,
      aspectH: 9,
      throwMin: 1.2,
      throwMax: 1.8,
    },
    lux: {
      ansiLumens: [10000],
      brightnessPct: 100,
      widthM: 4,
      heightM: 2.25,
      gain: 1.0,
      ambientLux: 20,
    },
    mappingSlots: gridLayout({ cols: 2, rows: 1, w: 1920, h: 1200, overlapX: 192, overlapY: 0 }),
    led: {
      cabinet: { pitchMm: 2.5, widthMm: 500, heightMm: 500, weightKg: 8, powerTypW: 100, powerMaxW: 250 },
      cols: 4,
      rows: 3,
      spareFraction: 0.1,
    },
    electrical: {
      loads: [{ id: 'L1', name: 'Projektör Hattı', qty: 2, powerW: 1150 }],
      circuits: [{ id: 'C1', name: 'Linye-1', loadIds: ['L1'], phase: 'L1', cableMm2: 2.5, lengthM: 25, ampacityA: 20 }],
      supply: defaultSupply(),
    },
    equipmentList: [{ category: 'Projektör', manufacturer: 'TestCo', model: 'P1', qty: 2, notes: 'Ana salon' }],
  };

  it('proje verilerini, hesap sonuçlarını ve gömülü SVG diyagramlarını eksiksiz içerir', () => {
    const html = buildReportHtml(payload);
    expect(html).toContain('Kültür Müzesi');
    expect(html).toContain('Ana Salon Mapping');
    expect(html).toContain('Rev 2');
    expect(html).toContain('4 × 2.25 m');
    expect(html).toContain('1.5:1');
    expect(html).toContain('3648 × 1200 px');
    expect(html).toContain('2000 × 1500 mm');
    expect(html).toContain('TestCo P1');
    expect((html.match(/<svg /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('seçilmeyen bölümleri rapora dahil etmez ve İngilizce dil seçeneğini destekler', () => {
    const htmlEn = buildReportHtml({
      ...payload,
      lang: 'en',
      sections: { ...DEFAULT_SECTIONS, led: false, electrical: false },
    });
    expect(htmlEn).toContain('AV ENGINEERING & DESIGN REPORT');
    expect(htmlEn).not.toContain('5. LED Wall Specifications');
    expect(htmlEn).not.toContain('6. Electrical Load');
  });
});
