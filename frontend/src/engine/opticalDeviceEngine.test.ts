import { describe, it, expect } from 'vitest';
import {
  SAMPLE_WXGA_4000_DLP_PROJECTOR,
  DEFAULT_CAMERA_PROFILES,
  calculateProjectorLensOptics,
  calculateCameraOpticsFov,
  evaluateOpticalPhysicalCompliance,
  convertToMeters,
  convertFromMeters,
  formatLengthWithUnit,
  ProjectorDeviceProfile,
  CameraDeviceProfile,
  SharedRoomPlacementInput,
} from './opticalDeviceEngine';
import { buildReportHtml, DEFAULT_SECTIONS, ReportPayload } from './report';

describe('Profesyonel Optik Cihaz Profili, FOV Kamera ve Projeksiyon Lens Hesaplama Motoru', () => {
  // ============================================================================
  // 1. BÖLÜM 8 ZORUNLU ÖRNEK TEST CİHAZI (4000 ANSI lm WXGA DLP) DOĞRULAMASI
  // ============================================================================
  describe('Bölüm 8 — Örnek WXGA 4000lm DLP Projektör Profili ve Hesap Doğrulamaları', () => {
    it('Örnek cihaz kullanıcı tanımlı (USER_ENTERED / USER_DEFINED) olmalı ve Native Contrast UNKNOWN (null) saklanmalıdır', () => {
      const p = SAMPLE_WXGA_4000_DLP_PROJECTOR;
      expect(p.dataSource).toBe('USER_ENTERED');
      expect(p.verificationStatus).toBe('USER_DEFINED');
      expect(p.verificationStatus).not.toBe('MANUFACTURER_VERIFIED');
      expect(p.general.brightnessAnsiLumens).toBe(4000);
      expect(p.general.nativeResolutionW).toBe(1280);
      expect(p.general.nativeResolutionH).toBe(800);
      expect(p.general.nativeAspectRatio).toBe('16:10');
      // Native contrast bilinmediğinden 0 veya dynamic contrast yazılmaz, null (UNKNOWN) tutulur
      expect(p.general.nativeContrastRatio).toBeNull();
      expect(p.general.dynamicContrastRatio).toBe(3000000);
      expect(p.fieldSources.nativeContrastRatio.source).toBe('UNKNOWN');
    });

    it('5 metre mesafede minimum ve maksimum görüntü genişliğini (2.907 m – 3.247 m) doğru hesaplamalıdır', () => {
      const res = calculateProjectorLensOptics({
        profile: SAMPLE_WXGA_4000_DLP_PROJECTOR,
        method: 'DIST_TO_SIZE',
        throwDistanceM: 5.0,
      });
      // W_min = 5.0 / 1.72 = 2.906976... -> 2.907 m
      // W_max = 5.0 / 1.54 = 3.246753... -> 3.247 m
      expect(res.minImageWidthM).toBeCloseTo(5.0 / 1.72, 3);
      expect(res.maxImageWidthM).toBeCloseTo(5.0 / 1.54, 3);
      expect(res.minImageHeightM).toBeCloseTo(5.0 / 1.72 / 1.6, 3);
      expect(res.maxImageHeightM).toBeCloseTo(5.0 / 1.54 / 1.6, 3);
    });

    it('7 metre mesafede minimum ve maksimum görüntü genişliğini (4.070 m – 4.545 m) doğru hesaplamalıdır', () => {
      const res = calculateProjectorLensOptics({
        profile: SAMPLE_WXGA_4000_DLP_PROJECTOR,
        method: 'DIST_TO_SIZE',
        throwDistanceM: 7.0,
      });
      // W_min = 7.0 / 1.72 = 4.069767... -> 4.070 m
      // W_max = 7.0 / 1.54 = 4.545454... -> 4.545 m
      expect(res.minImageWidthM).toBeCloseTo(7.0 / 1.72, 3);
      expect(res.maxImageWidthM).toBeCloseTo(7.0 / 1.54, 3);
    });

    it('3 metre görüntü genişliği için gereken minimum ve maksimum projektör mesafesini (4.62 m – 5.16 m) ve 16:10 yüksekliğini (1.875 m) doğru hesaplamalıdır', () => {
      const res = calculateProjectorLensOptics({
        profile: SAMPLE_WXGA_4000_DLP_PROJECTOR,
        method: 'SIZE_TO_DIST',
        targetImageWidthM: 3.0,
      });
      // D_min = 3.0 * 1.54 = 4.62 m
      // D_max = 3.0 * 1.72 = 5.16 m
      // H = 3.0 / 1.6 = 1.875 m
      expect(res.minDistanceM).toBeCloseTo(4.62, 3);
      expect(res.maxDistanceM).toBeCloseTo(5.16, 3);
      expect(res.nominalImageHeightM).toBeCloseTo(1.875, 3);
      expect(res.nominalDiagonalM).toBeCloseTo(Math.hypot(3.0, 1.875), 3);
    });

    it('1.54–1.72 throw ratio, 21.85–24.00 mm focal length ve 1.1x zoom tutarlılığını doğrulamalıdır', () => {
      const res = calculateProjectorLensOptics({
        profile: SAMPLE_WXGA_4000_DLP_PROJECTOR,
        method: 'DIST_TO_SIZE',
        throwDistanceM: 5.0,
      });
      expect(res.zoomConsistency.trZoomRatio).toBeCloseTo(1.72 / 1.54, 3);
      expect(res.zoomConsistency.focalZoomRatio).toBeCloseTo(24.0 / 21.85, 3);
      expect(res.zoomConsistency.statedZoomRatio).toBe(1.1);
      expect(res.zoomConsistency.status).toBe('PASS');
    });

    it('Offset %112 ±5% değerinin dikey yerleşime etkisini hesaplamalı, konvansiyon UNSPECIFIED olduğunda UNKNOWN üretmelidir', () => {
      // 1) FULL_HEIGHT_FROM_BOTTOM konvansiyonu ile (H = 1.875 m için alt kenar = +0.12 * 1.875 = +0.225 m)
      const resWithConv = calculateProjectorLensOptics({
        profile: SAMPLE_WXGA_4000_DLP_PROJECTOR,
        method: 'SIZE_TO_DIST',
        targetImageWidthM: 3.0,
        projectorPositionM: [0, 1.0, 4.8],
      });
      expect(resWithConv.offsetAnalysis.status).toBe('PASS');
      expect(resWithConv.offsetAnalysis.imageBottomOffsetFromLensAxisM).toBeCloseTo(0.12 * 1.875, 3);
      expect(resWithConv.offsetAnalysis.imageTopOffsetFromLensAxisM).toBeCloseTo(1.12 * 1.875, 3);
      expect(resWithConv.offsetAnalysis.projectedBottomFromFloorM).toBeCloseTo(1.0 + 0.12 * 1.875, 3);

      // 2) Konvansiyon UNSPECIFIED yapıldığında kesin dikey yerleşim üretilemez -> UNKNOWN
      const profileNoConv: ProjectorDeviceProfile = {
        ...structuredClone(SAMPLE_WXGA_4000_DLP_PROJECTOR),
        optics: {
          ...SAMPLE_WXGA_4000_DLP_PROJECTOR.optics,
          offsetMeasurementConvention: 'UNSPECIFIED',
        },
      };
      const resNoConv = calculateProjectorLensOptics({
        profile: profileNoConv,
        method: 'SIZE_TO_DIST',
        targetImageWidthM: 3.0,
        projectorPositionM: [0, 1.0, 4.8],
      });
      expect(resNoConv.offsetAnalysis.status).toBe('UNKNOWN');
      expect(resNoConv.offsetAnalysis.imageBottomOffsetFromLensAxisM).toBeNull();
      expect(resNoConv.offsetAnalysis.projectedBottomFromFloorM).toBeNull();
    });
  });

  // ============================================================================
  // 2. KAMERA FOV FORMÜL VE ZOOM / DİSTORSİYON AYRIMI TESTLERİ (BÖLÜM 4 & 10)
  // ============================================================================
  describe('Kamera FOV, Optik/Dijital Zoom ve Distorsiyon Hesaplama Testleri', () => {
    it('HFOV, VFOV, DFOV ve Mesafeye Göre Yatay/Dikey Görüş Alanını tam trigonometrik formülle hesaplamalıdır', () => {
      const cam = DEFAULT_CAMERA_PROFILES[0]; // Sony FX3 Full Frame 35.6 x 23.8 mm, f = 24 mm
      const sw = cam.sensor.sensorWidthMm!;
      const sh = cam.sensor.sensorHeightMm!;
      const res = calculateCameraOpticsFov({
        profile: cam,
        targetDistanceM: 5.0,
        activeFocalLengthMm: 24.0,
        digitalZoomOverride: 1.0,
      });

      const expectedHfov = (2 * Math.atan(sw / (2 * 24)) * 180) / Math.PI;
      const expectedVfov = (2 * Math.atan(sh / (2 * 24)) * 180) / Math.PI;
      const expectedDfov = (2 * Math.atan(Math.hypot(sw, sh) / (2 * 24)) * 180) / Math.PI;

      expect(res.status).not.toBe('UNKNOWN');
      expect(res.rectilinearHfovDeg).toBeCloseTo(expectedHfov, 2);
      expect(res.rectilinearVfovDeg).toBeCloseTo(expectedVfov, 2);
      expect(res.rectilinearDfovDeg).toBeCloseTo(expectedDfov, 2);

      expect(res.horizontalCoverageM).toBeCloseTo(2 * 5.0 * (sw / 48), 3);
      expect(res.verticalCoverageM).toBeCloseTo(2 * 5.0 * (sh / 48), 3);
    });

    it('Optik Zoom (Geniş vs Tele uç) ile Dijital Zoom (piksel kırpma) ve Lens Distorsiyonunu birbirinden ayırmalıdır', () => {
      const cam = DEFAULT_CAMERA_PROFILES[0]; // 24-70 mm zoom lens, -1.8% barrel distortion
      const res = calculateCameraOpticsFov({
        profile: cam,
        targetDistanceM: 6.0,
        activeFocalLengthMm: 24.0,
        digitalZoomOverride: 2.0,
      });

      expect(res.wideEndFov).not.toBeNull();
      expect(res.teleEndFov).not.toBeNull();
      expect(res.wideEndFov!.hfovDeg).toBeGreaterThan(res.teleEndFov!.hfovDeg);

      // Dijital zoom 2.0x uygulandığında optik HFOV değişmez, dijital efektif çözünürlük yarıya düşer (4096x2160 -> 2048x1080)
      expect(res.digitalZoomFactor).toBe(2.0);
      expect(res.effectiveResolutionAfterDigitalZoom?.w).toBe(2048);
      expect(res.effectiveResolutionAfterDigitalZoom?.h).toBe(1080);

      // Distorsiyon kalibreli FOV, ideal rektilineer FOV'dan ayrıdır
      expect(res.calibratedHfovDeg).not.toBe(res.rectilinearHfovDeg);
    });
  });

  // ============================================================================
  // 3. EKSİK SENSÖR VE EKSİK LENS VERİSİ TESTLERİ (ASLA TAHMİN ETME -> UNKNOWN)
  // ============================================================================
  describe('Eksik Veri (UNKNOWN) ve Yanlış Optik Türetim Koruması Testleri', () => {
    it('Kamera fiziksel sensör boyutu girilmediğinde (null) ASLA tahmin yapmamalı ve UNKNOWN döndürmelidir', () => {
      const unknownSensorCam: CameraDeviceProfile = {
        ...structuredClone(DEFAULT_CAMERA_PROFILES[0]),
        sensor: {
          ...DEFAULT_CAMERA_PROFILES[0].sensor,
          sensorWidthMm: null,
          sensorHeightMm: null,
        },
      };
      const res = calculateCameraOpticsFov({
        profile: unknownSensorCam,
        targetDistanceM: 5.0,
      });
      expect(res.status).toBe('UNKNOWN');
      expect(res.rectilinearHfovDeg).toBeNull();
      expect(res.rectilinearVfovDeg).toBeNull();
      expect(res.horizontalCoverageM).toBeNull();
    });

    it('Projektör Throw Ratio eksik olduğunda F-number veya Focal Length (mm) üzerinden ASLA Throw Ratio türetmemeli ve UNKNOWN döndürmelidir', () => {
      const missingTrProj: ProjectorDeviceProfile = {
        ...structuredClone(SAMPLE_WXGA_4000_DLP_PROJECTOR),
        optics: {
          ...SAMPLE_WXGA_4000_DLP_PROJECTOR.optics,
          throwRatioMin: null,
          throwRatioMax: null,
          focalLengthMinMm: 21.85,
          focalLengthMaxMm: 24.0,
          fNumberMin: 2.41,
          fNumberMax: 2.53,
        },
      };
      const res = calculateProjectorLensOptics({
        profile: missingTrProj,
        method: 'DIST_TO_SIZE',
        throwDistanceM: 5.0,
      });
      expect(res.status).toBe('UNKNOWN');
      expect(res.nominalImageWidthM).toBeNull();
      expect(res.minImageWidthM).toBeNull();
      expect(res.warnings.some(w => w.includes('Throw Ratio türetilemez'))).toBe(true);
    });
  });

  // ============================================================================
  // 4. FİZİKSEL SINIR İHLALİ VE 9-MADDELİ UYGUNLUK MOTORU TESTLERİ (BÖLÜM 7)
  // ============================================================================
  describe('Bölüm 7 — 9-Maddeli Fiziksel Yerleşim Uygunluk Denetimi (PASS / WARNING / FAIL / UNKNOWN)', () => {
    const buildBaseComplianceInput = (): SharedRoomPlacementInput => {
      const pj = SAMPLE_WXGA_4000_DLP_PROJECTOR;
      const cam = DEFAULT_CAMERA_PROFILES[0];
      const pjOptics = calculateProjectorLensOptics({
        profile: pj,
        method: 'DIST_TO_SIZE',
        throwDistanceM: 5.0,
        targetImageWidthM: 3.0,
        targetImageHeightM: 1.875,
        projectorPositionM: [0, 0.85, 5.0],
      });
      const camOptics = calculateCameraOpticsFov({
        profile: cam,
        targetDistanceM: 5.0,
      });
      return {
        roomWidthM: 8.0,
        roomLengthM: 9.0,
        roomHeightM: 3.6,
        surfaceWidthM: 3.2,
        surfaceHeightM: 2.0,
        surfaceBottomFromFloorM: 0.85,
        projectorProfile: pj,
        projectorPosM: [0, 0.85, 5.0],
        projectorYawDeg: 0,
        projectorPitchDeg: 0,
        projectorCalc: pjOptics,
        cameraProfile: cam,
        cameraPosM: [0.5, 1.8, 5.0],
        cameraYawDeg: 0,
        cameraPitchDeg: 0,
        cameraCalc: camOptics,
        obstacle: {
          enabled: false,
          name: 'Test Engeli',
          xM: 3.0,
          zFromWallM: 2.5,
          widthM: 0.5,
          heightM: 1.7,
        },
      };
    };

    it('9 zorunlu fiziksel kontrol kaleminin tamamını üretmeli ve eksik lens shift verisi varken asla sahte PASS vermemelidir', () => {
      const input = buildBaseComplianceInput();
      const rep = evaluateOpticalPhysicalCompliance(input);
      expect(rep.checks).toHaveLength(9);

      // Örnek cihazda optik lens shift verisi null (UNKNOWN) olduğundan LENS_SHIFT_WITHIN_LIMITS UNKNOWN olmalı
      const shiftChk = rep.checks.find(c => c.id === 'LENS_SHIFT_WITHIN_LIMITS');
      expect(shiftChk?.status).toBe('UNKNOWN');
      expect(rep.overallStatus).not.toBe('PASS');
    });

    it('Görüntü duvar sınırlarını aştığında veya soğutma boşluğu ihlal edildiğinde FAIL döndürmelidir', () => {
      const input = buildBaseComplianceInput();
      // Duvarı daraltalım (2.0 m) ve odayı daraltarak soğutma boşluğunu ihlal edelim
      input.roomWidthM = 2.0;
      input.roomLengthM = 5.05; // Arka duvara 5cm mesafe < gereken 40.8cm soğutma boşluğu

      const rep = evaluateOpticalPhysicalCompliance(input);
      const wallChk = rep.checks.find(c => c.id === 'IMAGE_WITHIN_WALL_BOUNDS');
      const coolChk = rep.checks.find(c => c.id === 'CHASSIS_COOLING_CLEARANCE');

      expect(wallChk?.status).toBe('FAIL');
      expect(coolChk?.status).toBe('FAIL');
      expect(rep.overallStatus).toBe('FAIL');
    });
  });

  // ============================================================================
  // 5. İZOLASYON, BİRİM DÖNÜŞÜMÜ VE PDF RAPOR TUTARLILIK TESTLERİ (BÖLÜM 9 & 10)
  // ============================================================================
  describe('İzolasyon, Birim Dönüşümü ve PDF Rapor Tutarlılığı', () => {
    it('Kamera ve projektör hesapları birbirini etkilememelidir (tam izolasyon)', () => {
      const pjRes1 = calculateProjectorLensOptics({
        profile: SAMPLE_WXGA_4000_DLP_PROJECTOR,
        method: 'DIST_TO_SIZE',
        throwDistanceM: 5.0,
      });

      const camModified: CameraDeviceProfile = {
        ...structuredClone(DEFAULT_CAMERA_PROFILES[1]),
        lens: { ...DEFAULT_CAMERA_PROFILES[1].lens, focalLengthMm: 85 },
      };
      const camRes = calculateCameraOpticsFov({
        profile: camModified,
        targetDistanceM: 12.0,
        activeFocalLengthMm: 85,
        digitalZoomOverride: 3.0,
      });

      const pjRes2 = calculateProjectorLensOptics({
        profile: SAMPLE_WXGA_4000_DLP_PROJECTOR,
        method: 'DIST_TO_SIZE',
        throwDistanceM: 5.0,
      });

      expect(camRes.digitalZoomFactor).toBe(3.0);
      expect(pjRes1.minImageWidthM).toBe(pjRes2.minImageWidthM);
      expect(pjRes1.maxImageWidthM).toBe(pjRes2.maxImageWidthM);
    });

    it('Birim dönüşümleri (m, cm, mm, ft, in) çift yönlü tutarlı çalışmalıdır', () => {
      expect(convertFromMeters(1.0, 'cm')).toBeCloseTo(100, 4);
      expect(convertFromMeters(1.0, 'mm')).toBeCloseTo(1000, 4);
      expect(convertFromMeters(0.3048, 'ft')).toBeCloseTo(1.0, 4);
      expect(convertFromMeters(0.0254, 'in')).toBeCloseTo(1.0, 4);

      expect(convertToMeters(500, 'cm')).toBeCloseTo(5.0, 4);
      expect(convertToMeters(5000, 'mm')).toBeCloseTo(5.0, 4);
      expect(formatLengthWithUnit(null, 'm')).toBe('UNKNOWN');
    });

    it('PDF Rapor üretimi (buildReportHtml) hesaplama motoru sonuçlarıyla birebir aynı değerleri içermelidir', () => {
      const pj = SAMPLE_WXGA_4000_DLP_PROJECTOR;
      const cam = DEFAULT_CAMERA_PROFILES[0];
      const pjOptics = calculateProjectorLensOptics({
        profile: pj,
        method: 'DIST_TO_SIZE',
        throwDistanceM: 5.0,
        targetImageWidthM: 3.0,
        targetImageHeightM: 1.875,
        projectorPositionM: [0, 0.85, 5.0],
      });
      const camOptics = calculateCameraOpticsFov({
        profile: cam,
        targetDistanceM: 5.0,
      });
      const compInput: SharedRoomPlacementInput = {
        roomWidthM: 8.0,
        roomLengthM: 9.0,
        roomHeightM: 3.6,
        surfaceWidthM: 3.2,
        surfaceHeightM: 2.0,
        surfaceBottomFromFloorM: 0.85,
        projectorProfile: pj,
        projectorPosM: [0, 0.85, 5.0],
        projectorYawDeg: 0,
        projectorPitchDeg: 0,
        projectorCalc: pjOptics,
        cameraProfile: cam,
        cameraPosM: [0.5, 1.8, 5.0],
        cameraYawDeg: 0,
        cameraPitchDeg: 0,
        cameraCalc: camOptics,
      };
      const compReport = evaluateOpticalPhysicalCompliance(compInput);

      const payload: ReportPayload = {
        lang: 'tr',
        meta: {
          companyName: 'Test AV',
          customer: 'Müze',
          projectName: 'Optik Test Projesi',
          location: 'İstanbul',
          category: 'Museum',
          date: '2026-11-15',
          revision: 1,
          description: 'Optik Cihaz ve FOV Rapor Testi',
        },
        sections: { ...DEFAULT_SECTIONS, opticalStudio: true },
        opticalStudioReport: {
          updatedAt: '2026-11-15T21:00:00Z',
          projectorProfile: pj,
          cameraProfile: cam,
          projectorCalc: pjOptics,
          cameraCalc: camOptics,
          compliance: compReport,
          room: {
            widthM: 8.0,
            lengthM: 9.0,
            heightM: 3.6,
            surfaceWidthM: 3.2,
            surfaceHeightM: 2.0,
            surfaceBottomFromFloorM: 0.85,
          },
          projectorPosM: [0, 0.85, 5.0],
          projectorAnglesDeg: [0, 0, 0],
          cameraPosM: [0.5, 1.8, 5.0],
          cameraAnglesDeg: [0, 0, 0],
        },
      };

      const html = buildReportHtml(payload);
      expect(html).toContain('Profesyonel Optik Cihaz Profili, Projeksiyon Lens');
      expect(html).toContain('2.907 m'); // 5m min width
      expect(html).toContain('3.247 m'); // 5m max width
      expect(html).toContain('4.07 m');  // 7m min width
      expect(html).toContain('4.545 m'); // 7m max width
      expect(html).toContain('4.62 m – 5.16 m'); // 3m width required distance
      expect(html).toContain('FULL_HEIGHT_FROM_BOTTOM');
      expect(html).toContain('IMAGE_WITHIN_WALL_BOUNDS');
      expect(html).toContain('OPTICAL_IMAGE_SIZE_ACHIEVABLE');
    });
  });
});
