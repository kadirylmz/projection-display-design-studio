import { describe, expect, it } from 'vitest';
import {
  computeCameraFov,
  computeFovShadowAnalysis,
  computeFovSurfaceProjection,
  computePersonViewingAngles,
  computeProjectorFov,
  computeSurfaceFov,
  computeViewerFov,
} from './fovProjection';

describe('fovProjection', () => {
  it('projektör throw ratio ve aspect değerinden HFOV, VFOV, DFOV hesaplar', () => {
    const f = computeProjectorFov(1.0, 16 / 9);
    expect(f.hfovDeg).toBeCloseTo(53.1, 1);
    expect(f.vfovDeg).toBeCloseTo(31.4, 1);
    expect(f.dfovDeg).toBeGreaterThan(f.hfovDeg);
  });

  it('kamera sensör ve odak uzaklığından doğru FOV hesaplar', () => {
    const f = computeCameraFov(36, 24, 50);
    expect(f.hfovDeg).toBeCloseTo(39.6, 1);
    expect(f.vfovDeg).toBeCloseTo(27.0, 1);
  });

  it('dik konumlandırılan cihaz yüzeyin tamamını kapsadığında yamulma 0 ve kapsama %100 olur', () => {
    const projFov = computeProjectorFov(1.0, 16 / 9);
    const res = computeFovSurfaceProjection({
      hfovDeg: projFov.hfovDeg,
      vfovDeg: projFov.vfovDeg,
      posX: 0,
      posY: 0,
      posZ: 4.5,
      yawDeg: 0,
      pitchDeg: 0,
      surfaceWidthM: 4.0,
      surfaceHeightM: 2.25,
    });

    expect(res.incidenceAngleDeg).toBe(0);
    expect(res.keystoneDistortionPct).toBe(0);
    expect(res.isFullSurfaceCovered).toBe(true);
    expect(res.coveragePct).toBe(100);
    expect(res.uncoveredSides).toEqual([]);
    expect(res.topEdgeM).toBeCloseTo(res.bottomEdgeM, 2);
    expect(res.leftEdgeM).toBeCloseTo(res.rightEdgeM, 2);
  });

  it('eğik yerleştirmede (yaw/pitch) optik FOV sabit kalırken yüzey izdüşümü yamuklaşır ve kapsama yeniden hesaplanır', () => {
    const projFov = computeProjectorFov(1.0, 16 / 9);
    const straight = computeFovSurfaceProjection({
      hfovDeg: projFov.hfovDeg,
      vfovDeg: projFov.vfovDeg,
      posX: 0,
      posY: 0,
      posZ: 4.0,
      yawDeg: 0,
      pitchDeg: 0,
      surfaceWidthM: 4.0,
      surfaceHeightM: 2.25,
    });
    const oblique = computeFovSurfaceProjection({
      hfovDeg: projFov.hfovDeg,
      vfovDeg: projFov.vfovDeg,
      posX: -1.5,
      posY: 0.8,
      posZ: 4.0,
      yawDeg: 22,
      pitchDeg: -10,
      surfaceWidthM: 4.0,
      surfaceHeightM: 2.25,
    });

    expect(oblique.hfovDeg).toBe(straight.hfovDeg);
    expect(oblique.vfovDeg).toBe(straight.vfovDeg);
    expect(oblique.incidenceAngleDeg).toBeGreaterThan(20);
    expect(oblique.keystoneDistortionPct).toBeGreaterThan(10);
    expect(oblique.rightEdgeM).not.toBeCloseTo(oblique.leftEdgeM, 1);
    expect(oblique.projectedAreaM2).toBeGreaterThan(straight.projectedAreaM2);
  });

  it('cihaz açısı yüzeyden fazla saparsa tam kapsama false döner ve açıkta kalan kenarları bildirir', () => {
    const res = computeFovSurfaceProjection({
      hfovDeg: 40,
      vfovDeg: 25,
      posX: 0,
      posY: 0,
      posZ: 4.0,
      yawDeg: 28,
      pitchDeg: 0,
      surfaceWidthM: 4.0,
      surfaceHeightM: 2.25,
    });

    expect(res.isFullSurfaceCovered).toBe(false);
    expect(res.coveragePct).toBeLessThan(100);
    expect(res.uncoveredSides).toContain('Sol');
  });

  it('dijital keystone uygulandığında aktif köşeleri içe büker ve piksel kaybını hesaplar', () => {
    const base = computeFovSurfaceProjection({
      hfovDeg: 50,
      vfovDeg: 30,
      posX: 0,
      posY: 0,
      posZ: 4.0,
      yawDeg: 0,
      pitchDeg: 0,
      surfaceWidthM: 3.5,
      surfaceHeightM: 2.0,
    });
    const keyed = computeFovSurfaceProjection({
      hfovDeg: 50,
      vfovDeg: 30,
      posX: 0,
      posY: 0,
      posZ: 4.0,
      yawDeg: 0,
      pitchDeg: 0,
      keystoneVDeg: 20,
      surfaceWidthM: 3.5,
      surfaceHeightM: 2.0,
    });

    expect(base.hasDigitalKeystone).toBe(false);
    expect(base.keystonePixelLossPct).toBe(0);
    expect(keyed.hasDigitalKeystone).toBe(true);
    expect(keyed.keystonePixelLossPct).toBeGreaterThan(0);
    expect(keyed.topEdgeM).toBeLessThan(keyed.bottomEdgeM);
    expect(keyed.projectedAreaM2).toBeLessThan(base.projectedAreaM2);
  });

  it('Viewer FOV izleyici yan kaydığında veya yüzey eğildiğinde dinamik olarak daralır ve merkez açısını hesaplar', () => {
    const center = computeViewerFov({
      surfaceWidthM: 12,
      surfaceHeightM: 4.3,
      viewerDistM: 3.5,
      viewerOffsetXM: 0,
      viewerOffsetYM: 0,
    });
    expect(center.hfovDeg).toBe(119.5);
    expect(center.vfovDeg).toBe(63.1);
    expect(center.dfovDeg).toBe(122.5);
    expect(center.viewerCenterAngleDeg).toBe(0);

    const offAxis = computeViewerFov({
      surfaceWidthM: 12,
      surfaceHeightM: 4.3,
      viewerDistM: 3.5,
      viewerOffsetXM: 4.0,
      viewerOffsetYM: 0,
    });
    expect(offAxis.viewerCenterAngleDeg).toBeGreaterThan(30);
    expect(offAxis.hfovDeg).toBeLessThan(center.hfovDeg);
    expect(offAxis.perspectiveCompressionPct).toBeGreaterThan(0);
  });

  it('Surface FOV eğik izdüşümün gerçek geometrik kapsama açısını hesaplar', () => {
    const proj = computeFovSurfaceProjection({
      hfovDeg: 50,
      vfovDeg: 30,
      posX: 0,
      posY: 0,
      posZ: 4.5,
      yawDeg: 20,
      pitchDeg: 10,
      surfaceWidthM: 4.0,
      surfaceHeightM: 2.25,
    });
    const surfFov = computeSurfaceFov({
      devicePos: [0, 0, 4.5],
      activeCorners3D: proj.activeCorners3D,
      projectorHfovDeg: proj.hfovDeg,
      projectorVfovDeg: proj.vfovDeg,
      surfaceTiltDeg: 20,
    });
    expect(surfFov.hfovDeg).toBeGreaterThan(20);
    expect(surfFov.vfovDeg).toBeGreaterThan(10);
    expect(surfFov.dfovDeg).toBeGreaterThan(surfFov.hfovDeg);
  });

  it('computeFovShadowAnalysis kritik gölge giriş mesafesini ve perdedeki gölge boyutunu hesaplar', () => {
    // 4m × 2.25m perde (zeminde 0..2.25m), cihaz 4.5m mesafede ve yerden 3.0m yükseklikte (posY = 3.0 - 1.125 = 1.875)
    const sh = computeFovShadowAnalysis({
      devicePos: [0, 1.875, 4.5],
      surfaceWidthM: 4,
      surfaceHeightM: 2.25,
      screenBottomHeightM: 0,
      activeCorners2D: [
        [-2, 1.125],
        [2, 1.125],
        [2, -1.125],
        [-2, -1.125],
      ],
      personHeightM: 1.75,
      personWidthM: 0.5,
      personDistFromScreenM: 1.5,
      personXM: 0,
    });
    // H_bot(z) = (z / 4.5) * 3.0 = 1.75 => z_crit = 4.5 * (1.75 / 3.0) = 2.625 -> 2.63 m
    expect(sh.shadowEntryDistFromScreenM).toBeCloseTo(2.63, 2);
    expect(sh.isCastingShadow).toBe(true);
    expect(sh.shadowWidthM).toBeCloseTo(0.75, 2); // 0.5 * (4.5 / 3.0) = 0.75m
    expect(sh.shadowHeightM).toBeGreaterThan(0);

    // İnsan 3.2m mesafede (2.63m sınırının dışında) -> gölge oluşmaz
    const shSafe = computeFovShadowAnalysis({
      devicePos: [0, 1.875, 4.5],
      surfaceWidthM: 4,
      surfaceHeightM: 2.25,
      screenBottomHeightM: 0,
      activeCorners2D: [
        [-2, 1.125],
        [2, 1.125],
        [2, -1.125],
        [-2, -1.125],
      ],
      personHeightM: 1.75,
      personWidthM: 0.5,
      personDistFromScreenM: 3.2,
      personXM: 0,
    });
    expect(shSafe.isCastingShadow).toBe(false);
    expect(shSafe.headClearanceM).toBeGreaterThan(0);

    // İnsan podyumda (personElevationM = 0.5m) -> baş seviyesi 1.75 + 0.5 = 2.25m
    const shPodium = computeFovShadowAnalysis({
      devicePos: [0, 1.875, 4.5],
      surfaceWidthM: 4,
      surfaceHeightM: 2.25,
      screenBottomHeightM: 0,
      activeCorners2D: [
        [-2, 1.125],
        [2, 1.125],
        [2, -1.125],
        [-2, -1.125],
      ],
      personHeightM: 1.75,
      personWidthM: 0.5,
      personDistFromScreenM: 3.2,
      personXM: 0,
      personElevationM: 0.5,
    });
    expect(shPodium.effectivePersonTopFromFloorM).toBeCloseTo(2.25, 2);
    expect(shPodium.personElevationM).toBe(0.5);
  });

  it('computePersonViewingAngles insanın göz seviyesinden perdeye olan açıları ve AVIXA ergonomisini hesaplar', () => {
    // 4m × 2.25m perde, alt kenarı 0m zemin, insan 1.75m boyunda (göz ~1.63m), perdeden 3.0m uzakta
    const angles = computePersonViewingAngles({
      surfaceWidthM: 4,
      surfaceHeightM: 2.25,
      screenBottomHeightM: 0,
      personHeightM: 1.75,
      personDistFromScreenM: 3.0,
      personXM: 0,
    });

    expect(angles.eyeHeightFromFloorM).toBeCloseTo(1.63, 2);
    expect(angles.verticalAngleTopDeg).toBeGreaterThan(0); // Perde tepesi gözün üstünde (2.25 > 1.63)
    expect(angles.verticalAngleBottomDeg).toBeLessThan(0); // Perde altı gözün altında (0 < 1.63)
    expect(angles.verticalFovDeg).toBeCloseTo(angles.verticalAngleTopDeg - angles.verticalAngleBottomDeg, 1);
    expect(angles.horizontalFovDeg).toBeGreaterThan(50);
    expect(['optimal', 'acceptable']).toContain(angles.ergonomicsGrade);

    // İnsan podyumda (yükselti 1.0m)
    const anglesPodium = computePersonViewingAngles({
      surfaceWidthM: 4,
      surfaceHeightM: 2.25,
      screenBottomHeightM: 0,
      personHeightM: 1.75,
      personElevationM: 1.0,
      personDistFromScreenM: 3.0,
      personXM: 0,
    });
    expect(anglesPodium.eyeHeightFromFloorM).toBeCloseTo(2.63, 2);
    // Göz 2.63m, perde üstü 2.25m -> artık perde üstüne de aşağı doğru bakar
    expect(anglesPodium.verticalAngleTopDeg).toBeLessThan(0);
  });
});
