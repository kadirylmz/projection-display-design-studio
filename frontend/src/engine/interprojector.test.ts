import { describe, it, expect } from 'vitest';
import { calculateInterProjectorDistances } from './interprojector';

describe('calculateInterProjectorDistances', () => {
  it('tekil ve çoklu duvar projektörlerinin mesafelerini doğru hesaplar', () => {
    const surfaces = [
      {
        id: 'surf-1',
        name: '1. Duvar (Sol Uzun)',
        type: 'wall',
        widthM: 23.3,
        heightM: 4.3,
        cols: 4,
        rows: 1,
        throwDistM: 5.5,
        throwRatio: 0.8,
        overlapX: 20.4,
        projW: 1920,
        projH: 1200,
      },
      {
        id: 'surf-2',
        name: '2. Duvar (Ön Kısa)',
        type: 'wall',
        widthM: 7.0,
        heightM: 4.3,
        cols: 2,
        rows: 1,
        throwDistM: 5.5,
        throwRatio: 0.8,
        overlapX: 15.0,
        projW: 1920,
        projH: 1200,
      },
    ];

    const res = calculateInterProjectorDistances(surfaces, { widthM: 8.5, lengthM: 25.0, heightM: 5.5 }, 1350);

    expect(res.totalProjectors).toBe(6);
    expect(res.totalPowerW).toBe(6 * 1350);
    expect(res.projectors).toHaveLength(6);

    // 1. Duvardaki ilk projektör
    const pj1 = res.projectors[0];
    expect(pj1.id).toBe('SOL-PJ-1');
    expect(pj1.throwDistM).toBe(5.5);
    expect(pj1.singleWidthM).toBeGreaterThan(6.0); // 5.5 / 0.8 = 6.875
    expect(pj1.spacingToNextM).toBeGreaterThan(5.0);
    expect(pj1.spacingToPrevM).toBeNull();

    // 1. Duvardaki 2. projektör
    const pj2 = res.projectors[1];
    expect(pj2.id).toBe('SOL-PJ-2');
    expect(pj2.spacingToPrevM).toBe(pj1.spacingToNextM);

    // 1. Duvardaki son projektör (4. projektör)
    const pj4 = res.projectors[3];
    expect(pj4.id).toBe('SOL-PJ-4');
    expect(pj4.spacingToNextM).toBeNull();

    // Köşe geçişi kontrolü (Sol Duvar ↔ Ön Duvar)
    expect(res.cornerTransitions.length).toBe(1);
    expect(res.cornerTransitions[0].angleDeg).toBe(90);
    expect(res.cornerTransitions[0].euclideanDistM).toBeGreaterThan(0);
  });
});
