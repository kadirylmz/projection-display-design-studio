import { describe, it, expect } from 'vitest';
import { computePixelMapSummary, computeGeometricMappingSummary, ProjectorSlot } from './multiproj';
import { computeEffectiveMultiProjectorPixelArea, computeSurfacePointLuxDistribution, evaluateSystemFeasibility } from './feasibility';
import { computeProjectorFov, computeFovSurfaceProjection, computeViewerFov, computeSurfaceFov } from './fovProjection';
import { buildReportHtml, DEFAULT_SECTIONS, ReportProjectMeta } from './report';
import { validateReportConsistency } from './reportValidation';

const meta: ReportProjectMeta = {
  companyName: 'AV Mühendislik',
  customer: 'Müze',
  projectName: 'Doğrulama Projesi',
  location: 'Ankara',
  category: 'Projeksiyon',
  date: '2026-11-13',
  revision: 1,
  description: 'Otomatik doğrulama testi',
};

function makeSlots(count: number, w = 1920, h = 1200, overlapPx = 288): ProjectorSlot[] {
  const step = Math.max(100, w - overlapPx);
  return Array.from({ length: count }, (_, i) => ({
    id: `pj-${i + 1}`,
    label: `PJ ${i + 1}`,
    x: i * step,
    y: 0,
    w,
    h,
    blend: count > 1
      ? { l: i > 0 ? overlapPx : 0, r: i < count - 1 ? overlapPx : 0, t: 0, b: 0 }
      : { l: 0, r: 0, t: 0, b: 0 },
  }));
}

describe('AV Mühendislik 10 Zorunlu Doğrulama Senaryosu', () => {
  it('1. Tek projektör, sıfır overlap', () => {
    const pm = computePixelMapSummary({ slots: makeSlots(1, 1920, 1200, 0), wallWidthM: 4.8, wallHeightM: 3.0 });
    expect(pm.projectorCount).toBe(1);
    expect(pm.combinedW).toBe(1920);
    expect(pm.combinedH).toBe(1200);
    expect(pm.lostOverlapPixels).toBe(0);
    expect(pm.pxPerMeterW).toBe(400);
    expect(pm.mmPerPxW).toBe(2.5);
  });

  it('2. İki projektör, yatay overlap', () => {
    const pm = computePixelMapSummary({ slots: makeSlots(2, 1920, 1200, 288), wallWidthM: 8.88, wallHeightM: 3.0 });
    expect(pm.projectorCount).toBe(2);
    expect(pm.rawTotalW).toBe(3840);
    expect(pm.combinedW).toBe(3552);
    expect(pm.lostPxW).toBe(288);
    expect(pm.lostOverlapPct).toBeGreaterThan(0);
  });

  it('3. Üç projektör, yatay overlap', () => {
    const pm = computePixelMapSummary({ slots: makeSlots(3, 1920, 1200, 288), wallWidthM: 12.96, wallHeightM: 3.0 });
    expect(pm.projectorCount).toBe(3);
    expect(pm.rawTotalW).toBe(5760);
    expect(pm.combinedW).toBe(5184);
    expect(pm.lostPxW).toBe(576);
  });

  it('4. Farklı native çözünürlüklü projektörler', () => {
    const wuxga = computePixelMapSummary({ slots: makeSlots(1, 1920, 1200, 0), wallWidthM: 4.8, wallHeightM: 3.0 });
    const uhd = computePixelMapSummary({ slots: makeSlots(1, 3840, 2160, 0), wallWidthM: 4.8, wallHeightM: 2.7 });
    expect(uhd.nativeW).toBe(3840);
    expect(uhd.nativeH).toBe(2160);
    expect(uhd.pxPerMeterW!).toBeGreaterThan(wuxga.pxPerMeterW!);
    expect(uhd.mmPerPxW!).toBeLessThan(wuxga.mmPerPxW!);
  });

  it('5. Zoom aralığının dışında kalan lens kritik hata ve taslak işareti üretir', () => {
    const res = validateReportConsistency({
      lang: 'tr',
      meta,
      sections: DEFAULT_SECTIONS,
      projection: {
        projectorName: 'PJ-1',
        lensName: 'Zoom 1.2–1.5:1',
        imageWidthM: 5.0,
        distanceM: 3.0,
        aspectW: 16,
        aspectH: 10,
        throwRatio: 0.6,
        throwMin: 1.2,
        throwMax: 1.5,
      },
    });
    expect(res.hasCriticalErrors).toBe(true);
    expect(res.draftRequired).toBe(true);
    expect(res.consistencyScorePct).toBeLessThan(100);
    const rangeCheck = res.checks.find(c => c.id === 'proj-lens-range');
    expect(rangeCheck?.status).toBe('error');
  });

  it('6. Ekran ölçüsü değiştiğinde bütün modüller (Pixel Map, Lux, Viewer FOV) güncellenir', () => {
    const smallPm = computePixelMapSummary({ slots: makeSlots(1, 1920, 1200, 0), wallWidthM: 4.0, wallHeightM: 2.5 });
    const largePm = computePixelMapSummary({ slots: makeSlots(1, 1920, 1200, 0), wallWidthM: 8.0, wallHeightM: 5.0 });
    expect(largePm.pxPerMeterW!).toBeCloseTo(smallPm.pxPerMeterW! / 2, 1);

    const smallLux = computeSurfacePointLuxDistribution({ widthM: 4.0, heightM: 2.5, cols: 1, rows: 1, avgLux: 500, uniformityU0: 85 });
    const largeLux = computeSurfacePointLuxDistribution({ widthM: 8.0, heightM: 5.0, cols: 1, rows: 1, avgLux: 125, uniformityU0: 85 });
    expect(largeLux.avgLux).toBeLessThan(smallLux.avgLux);

    const vSmall = computeViewerFov({ surfaceWidthM: 4.0, surfaceHeightM: 2.5, viewerDistM: 4.0 });
    const vLarge = computeViewerFov({ surfaceWidthM: 8.0, surfaceHeightM: 5.0, viewerDistM: 4.0 });
    expect(vLarge.hfovDeg).toBeGreaterThan(vSmall.hfovDeg);
  });

  it('7. Projektör adedi değiştiğinde güç ve lümen toplamları güncellenir', () => {
    const p1 = computeEffectiveMultiProjectorPixelArea({
      widthM: 6, heightM: 3.5, projW: 1920, projH: 1200, cols: 1, rows: 1, overlapPctX: 0,
    });
    const p2 = computeEffectiveMultiProjectorPixelArea({
      widthM: 6, heightM: 3.5, projW: 1920, projH: 1200, cols: 2, rows: 1, overlapPctX: 15,
    });
    const f2 = evaluateSystemFeasibility({
      widthM: 6, heightM: 3.5, throwDistM: 4.5, throwRatio: 0.8, roomHeightM: 4.2, projMountHeightM: 3.4,
      viewDistM: 5, cols: 2, rows: 1, projW: 1920, projH: 1200, overlapPct: 15, avgLux: 600, ambientLux: 30, uniformityU0: 85,
    });
    expect(p2.netW).toBeGreaterThan(p1.netW);
    expect(p2.totalProjectors).toBe(2);
    expect(f2.overallScorePct).toBeGreaterThan(0);
  });

  it('8. Eksik veya sıfır veri girilmesi veri eksikliği uyarısı ve Taslak damgası üretir', () => {
    const payload = {
      lang: 'tr' as const,
      meta,
      sections: DEFAULT_SECTIONS,
      interProjectorAnalysis: {
        totalProjectors: 1,
        totalPowerW: 0,
        roomDimensions: { widthM: 0, lengthM: 0, heightM: 0 },
        surfaceStats: [],
        cornerTransitions: [],
        projectors: [],
      },
      plannerSurfaces: [
        {
          id: 's1', name: 'Ana Duvar', type: 'wall', cols: 1, rows: 1,
          projW: 1920, projH: 1200, netW: 1920, netH: 1200,
          overlapX: 0, overlapY: 0, ovPxX: 0, ovPxY: 0,
          effectiveWidthM: 4.8, effectiveHeightM: 3.0, throwRatio: 0.8, avgMmPerPx: 2.5, viewDistM: 3.5,
        },
      ],
      electrical: {
        supply: { voltage: 0, phases: 1 as const, defaultPf: 0.95, designMargin: 0.25, maxDropPct: 3, rho: 0.0225, diversity: 1 },
        loads: [{ id: 'l1', name: 'PJ', powerW: 0, qty: 1 }],
        circuits: [{ id: 'c1', name: 'L1', loadIds: ['l1'], phase: 'L1' as const, ampacityA: 21, cableMm2: 2.5, lengthM: 20 }],
      },
    };
    const val = validateReportConsistency(payload);
    expect(val.hasCriticalErrors).toBe(true);
    expect(val.checks.some(c => c.id === 'room-dims-zero')).toBe(true);
    expect(val.checks.some(c => c.id === 'power-zero')).toBe(true);
    expect(val.checks.some(c => c.id === 'electrical-missing')).toBe(true);
    const html = buildReportHtml(payload);
    expect(html).toContain('TASLAK / DOĞRULANMAMIŞ MÜHENDİSLİK RAPORU');
  });

  it('9. Dikey (Portrait) projeksiyon', () => {
    const landscape = computeProjectorFov(1.0, 16 / 9);
    const portrait = computeProjectorFov(1.0, 9 / 16);
    expect(portrait.vfovDeg).toBeGreaterThan(portrait.hfovDeg);
    expect(portrait.vfovDeg).toBeGreaterThan(landscape.vfovDeg);
  });

  it('10. Eğik ve kavisli yüzey', () => {
    const straight = computeViewerFov({ surfaceWidthM: 8, surfaceHeightM: 3, viewerDistM: 4, surfaceTiltDeg: 0, surfaceCurvatureDeg: 0 });
    const curvedTilted = computeViewerFov({ surfaceWidthM: 8, surfaceHeightM: 3, viewerDistM: 4, surfaceTiltDeg: 25, surfaceCurvatureDeg: 90 });
    expect(curvedTilted.viewerCenterAngleDeg).toBe(25);
    expect(curvedTilted.perspectiveCompressionPct).toBeGreaterThan(straight.perspectiveCompressionPct);

    const proj = computeFovSurfaceProjection({
      hfovDeg: 55, vfovDeg: 32, posX: 0, posY: 0, posZ: 4.5, yawDeg: 18, pitchDeg: 12, surfaceWidthM: 5, surfaceHeightM: 2.8,
    });
    const surfFov = computeSurfaceFov({
      devicePos: [0, 0, 4.5], activeCorners3D: proj.activeCorners3D, projectorHfovDeg: proj.hfovDeg, projectorVfovDeg: proj.vfovDeg, surfaceTiltDeg: 18, surfaceCurvatureDeg: 60,
    });
    expect(surfFov.surfaceCurvatureDeg).toBe(60);
    expect(surfFov.perspectiveChangePct).toBeGreaterThan(0);

    const geo = computeGeometricMappingSummary({
      slots: makeSlots(2, 1920, 1200, 288),
      surfaceGeometry: 'concave_arc',
      sagittaM: 0.85,
      wallWidthM: 8,
      wallHeightM: 3,
      keystoneVDeg: 12,
    });
    expect(geo.sagittaM).toBeGreaterThan(0);
    expect(geo.totalGeometricLossPct).toBeGreaterThan(0);
  });
});
