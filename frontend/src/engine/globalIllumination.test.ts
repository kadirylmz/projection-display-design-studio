import { describe, expect, it } from 'vitest';
import {
  computeFormFactor,
  simulateRoomGlobalIllumination,
  buildStandardRoomSurfaces,
  DEFAULT_MATERIALS,
  ProjectorGISource,
} from './globalIllumination';

describe('Global Illumination & Light Bounce Motoru', () => {
  it('diferansiyel yamalar arasında form faktörünü ve ters kare kanununu doğru hesaplar', () => {
    // Karşı karşıya bakan iki yama (Z = 0 ve Z = 2)
    const patch1 = { pos: [0, 1, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number] };
    const patch2 = { pos: [0, 1, 2] as [number, number, number], normal: [0, 0, -1] as [number, number, number], areaM2: 1.0 };

    const ff1 = computeFormFactor(patch1, patch2);
    expect(ff1).toBeGreaterThan(0);

    // Mesafe 2m'den 4m'ye çıktığında form faktörü ~1/4 oranında düşmeli (1/r²)
    const patch3 = { pos: [0, 1, 4] as [number, number, number], normal: [0, 0, -1] as [number, number, number], areaM2: 1.0 };
    const ff2 = computeFormFactor(patch1, patch3);
    expect(ff2).toBeLessThan(ff1);
    expect(ff1 / ff2).toBeCloseTo(4.0, 1);
  });

  it('arkada kalan veya birbirine bakmayan yamalar için form faktörü 0 olmalıdır (ışık geçişi engeli)', () => {
    // Aynı yöne bakan (arkadan aydınlanan) iki yama
    const patchA = { pos: [0, 1, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number] };
    const patchB = { pos: [0, 1, 2] as [number, number, number], normal: [0, 0, 1] as [number, number, number], areaM2: 1.0 };

    const ff = computeFormFactor(patchA, patchB);
    expect(ff).toBe(0);
  });

  it('bütün odada doğrudan ve dolaylı aydınlığı ayrı ayrı hesaplar ve enerji korunumu ilkesini sağlar', () => {
    // 10m x 6m x 4m standart oda
    const surfaces = buildStandardRoomSurfaces(10.0, 6.0, 4.0, {
      front_wall: DEFAULT_MATERIALS.matte_white, // %80 yansıtma
      floor: DEFAULT_MATERIALS.dark_grey, // %20 yansıtma
      ceiling: DEFAULT_MATERIALS.black_velvet, // %5 yansıtma
    });

    // Ön duvara doğru vuran 10.000 ANSI lümen projektör
    const projectors: ProjectorGISource[] = [
      {
        id: 'pj-1',
        name: 'Ana Projektör',
        pos: [0, 2.0, 0], // Odanın ortasında
        target: [0, 2.0, -3.0], // Ön duvara (Z = -3.0) bakıyor
        ansiLumens: 10000,
        throwRatio: 0.8,
        efficiency: 0.90,
        enabled: true,
        color: '#38bdf8',
      },
    ];

    const result = simulateRoomGlobalIllumination(surfaces, projectors, 2, 'coarse');

    expect(result.surfaces.length).toBe(6);

    const frontWall = result.surfaces.find(s => s.type === 'front_wall')!;
    const floor = result.surfaces.find(s => s.type === 'floor')!;
    const ceiling = result.surfaces.find(s => s.type === 'ceiling')!;
    const backWall = result.surfaces.find(s => s.type === 'back_wall')!;

    // 1. Doğrudan ışık: Ön duvarda yüksek direct lux olmalı
    expect(frontWall.avgDirectLux).toBeGreaterThan(100);

    // 2. Dolaylı ışık: Projektör arkasında kalan arka duvara direct ışık 0 iken,
    // ön duvardan ve zeminden seken indirect ışık ulaşmalıdır!
    expect(backWall.avgDirectLux).toBe(0);
    expect(backWall.avgIndirectLux).toBeGreaterThan(0);

    // 3. Zemin ve tavan ön duvardaki parlak yansımadan dolaylı ışık (indirect bounce) almalıdır
    expect(floor.avgIndirectLux).toBeGreaterThan(0);
    expect(ceiling.avgIndirectLux).toBeGreaterThan(0);

    // 4. Toplam Lux = Doğrudan Lux + Dolaylı Lux eşitliği sağlanmalıdır
    result.surfaces.forEach(s => {
      expect(s.avgTotalLux).toBeCloseTo(s.avgDirectLux + s.avgIndirectLux, 1);
    });

    // 5. Enerji Korunumu: Yansıyan toplam enerji, birincil ışıktan ve yansıtma oranlarından fazla olamaz!
    expect(result.roomEnergyConservationRatio).toBeLessThan(1.0);
    expect(result.roomEnergyConservationRatio).toBeGreaterThan(0.01);
  });
});
