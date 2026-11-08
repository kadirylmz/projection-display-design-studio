import { describe, expect, it } from 'vitest';
import {
  parseIES,
  getCandelaFromIES,
  getCandelaFromApproximate,
  getSurfacePoint3D,
  simulatePhotometricLux,
  Projector3DConfig,
  Surface3DConfig,
  getLuxColorRGB,
} from './photometrics';

// Mock IES LM-63 Verisi (Standart 13 sayısal başlık parametresi)
const MOCK_IES_CONTENT = `
IESNA:LM-63-2002
[TEST] PROJECTION_LAB_TEST_001
[MANUFAC] PROJECTION_OPTICS
[LUMCAT] HIGH_LUMEN_4K
TILT=NONE
1 10000 1.0 5 1 1 2 0.5 0.3 0.2
1.0 1.0 350
0 10 20 30 40
0
50000 45000 35000 20000 0
`;

describe('Photometrics Engine (Fotometrik Hesaplama Motoru)', () => {
  it('1. IES LM-63 Parser testi: başlık, açılar ve candela tablosu doğru okunmalı', () => {
    const ies = parseIES(MOCK_IES_CONTENT);
    expect(ies.numLamps).toBe(1);
    expect(ies.lumensPerLamp).toBe(10000);
    expect(ies.verticalAngles).toEqual([0, 10, 20, 30, 40]);
    expect(ies.candelaTable[0][0]).toBe(50000);
    expect(ies.candelaTable[0][1]).toBe(45000);
  });

  it('2. IES Candela interpolasyonu: ara açılarda doğrusal interpolasyon yapmalı', () => {
    const ies = parseIES(MOCK_IES_CONTENT);
    // 0°'de 50.000, 10°'de 45.000 -> 5°'de 47.500 olmalı
    const c5 = getCandelaFromIES(ies, 5, 0);
    expect(c5).toBeCloseTo(47500, 1);
  });

  it('3. Noktasal fotometrik aydınlık: E = I * cos(α) / r² ters kare kanunu', () => {
    const surface: Surface3DConfig = {
      widthM: 4.0,
      heightM: 2.5,
      geometry: 'flat',
      screenGain: 1.0,
      reflectance: 0.9,
      ambientLux: 0,
    };

    const pjNear: Projector3DConfig = {
      id: 'pj-1',
      name: 'Test PJ Near',
      model: 'Test',
      ansiLumens: 10000,
      efficiency: 1.0,
      pos: [0, 1.25, 3.0], // 3 metre mesafede
      target: [0, 1.25, 0],
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      throwRatio: 0.8,
      zoom: 1.0,
      cornerUniformity: 1.0,
      photometricSource: 'ansi_cosine',
      enabled: true,
    };

    const resNear = simulatePhotometricLux(surface, [pjNear], 10, 10, false);

    // Mesafe 6 metreye çıktığında (2 katına), ters kare kanununa göre aydınlık yaklaşık 1/4'e düşmelidir
    const pjFar: Projector3DConfig = {
      ...pjNear,
      pos: [0, 1.25, 6.0],
    };
    const resFar = simulatePhotometricLux(surface, [pjFar], 10, 10, false);

    expect(resFar.avgLux).toBeLessThan(resNear.avgLux * 0.35);
    expect(resNear.avgLux).toBeGreaterThan(0);
  });

  it('4. Çoklu Projektör Süperpozisyonu: iki projektörün aydınlık katkısı toplanmalı', () => {
    const surface: Surface3DConfig = {
      widthM: 6.0,
      heightM: 3.0,
      geometry: 'flat',
      screenGain: 1.0,
      reflectance: 0.9,
      ambientLux: 0,
    };

    const pj1: Projector3DConfig = {
      id: 'pj-1',
      name: 'PJ 1',
      model: 'Test',
      ansiLumens: 5000,
      efficiency: 1.0,
      pos: [-1.0, 1.5, 4.0],
      target: [-1.0, 1.5, 0],
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      throwRatio: 0.8,
      zoom: 1.0,
      cornerUniformity: 0.9,
      photometricSource: 'ansi_cosine',
      enabled: true,
    };

    const pj2: Projector3DConfig = {
      ...pj1,
      id: 'pj-2',
      pos: [1.0, 1.5, 4.0],
      target: [1.0, 1.5, 0],
    };

    const singleRes = simulatePhotometricLux(surface, [pj1], 15, 10, false);
    const dualRes = simulatePhotometricLux(surface, [pj1, pj2], 15, 10, false);

    // 2 projektör açıkken toplam lüks belirgin şekilde yüksek olmalı
    expect(dualRes.avgLux).toBeGreaterThan(singleRes.avgLux * 1.5);
    expect(dualRes.maxLux).toBeGreaterThan(singleRes.maxLux);
  });

  it('5. Yüzey Geometrisi: Kavisli içbükey yüzeyde normaller merkeze doğru dönmeli', () => {
    const curvedSurf: Surface3DConfig = {
      widthM: 8.0,
      heightM: 3.0,
      geometry: 'curved',
      radiusM: 5.0,
      curveAngleDeg: 60,
      screenGain: 1.0,
      reflectance: 0.9,
      ambientLux: 0,
    };

    const ptLeft = getSurfacePoint3D(curvedSurf, 0.5, 1.5);
    const ptCenter = getSurfacePoint3D(curvedSurf, 4.0, 1.5);
    const ptRight = getSurfacePoint3D(curvedSurf, 7.5, 1.5);

    // Merkez noktada normal tam karşıya bakar (nx ≈ 0, nz ≈ 1)
    expect(ptCenter.normal[0]).toBeCloseTo(0, 1);
    expect(ptCenter.normal[2]).toBeCloseTo(1, 1);

    // Sol ve sağ uçlarda normaller merkeze doğru eğrilir (nx != 0)
    expect(Math.abs(ptLeft.normal[0])).toBeGreaterThan(0.1);
    expect(Math.abs(ptRight.normal[0])).toBeGreaterThan(0.1);
  });

  it('6. Zemin Geometrisi: Normaller yukarı (Y = 1) bakmalı', () => {
    const floorSurf: Surface3DConfig = {
      widthM: 10.0,
      heightM: 6.0,
      geometry: 'floor',
      screenGain: 1.0,
      reflectance: 0.8,
      ambientLux: 0,
    };

    const pt = getSurfacePoint3D(floorSurf, 5.0, 3.0);
    expect(pt.normal).toEqual([0, 1, 0]);
    expect(pt.pos[1]).toBe(0); // Y = 0 zemin kotu
  });

  it('7. Uniformity Analizi: U0 = Emin / Eavg ve U1 = Emin / Emax doğru hesaplanmalı', () => {
    const surface: Surface3DConfig = {
      widthM: 4.0,
      heightM: 2.5,
      geometry: 'flat',
      screenGain: 1.0,
      reflectance: 0.9,
      ambientLux: 10,
    };

    const pj: Projector3DConfig = {
      id: 'pj-1',
      name: 'PJ',
      model: 'Test',
      ansiLumens: 8000,
      efficiency: 0.95,
      pos: [0, 1.25, 4.0],
      target: [0, 1.25, 0],
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      throwRatio: 0.8,
      zoom: 1.0,
      cornerUniformity: 0.85,
      photometricSource: 'ansi_cosine',
      enabled: true,
    };

    const res = simulatePhotometricLux(surface, [pj], 12, 8, true);

    expect(res.minLux).toBeLessThanOrEqual(res.avgLux);
    expect(res.avgLux).toBeLessThanOrEqual(res.maxLux);
    expect(res.uniformityU0).toBeCloseTo(res.minLux / res.avgLux, 2);
    expect(res.uniformityU1).toBeCloseTo(res.minLux / res.maxLux, 2);
    expect(res.ansi9Points.length).toBe(9);
    expect(res.ambientContrastRatio).toBeGreaterThan(1);
  });

  it('8. Termal Renk Skalası: Min lux mavi, Max lux kırmızı olmalı', () => {
    const cMin = getLuxColorRGB(100, 100, 1000);
    const cMax = getLuxColorRGB(1000, 100, 1000);

    // Min: koyu mavi (R düşük, B yüksek)
    expect(cMin[0]).toBeLessThan(cMin[2]);

    // Max: kırmızı (R yüksek, B düşük)
    expect(cMax[0]).toBeGreaterThan(cMax[2]);
  });
});
