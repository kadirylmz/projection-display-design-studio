import { describe, expect, it } from 'vitest';
import {
  CATALOG_BRANDS,
  CATALOG_LENSES,
  CATALOG_PROJECTORS,
  getCompatibleCatalogLenses,
} from '../data/projectorCatalog';

describe('çoklu marka projektör ve lens kataloğu', () => {
  it('Epson, Vivitek, Sharp/NEC, Panasonic, Optoma, Barco ve Christie markalarını içerir', () => {
    expect(CATALOG_BRANDS).toEqual(
      expect.arrayContaining(['Epson', 'Vivitek', 'Sharp / NEC', 'Panasonic', 'Optoma', 'Barco', 'Christie'])
    );
    expect(CATALOG_PROJECTORS.length).toBeGreaterThanOrEqual(18);
    expect(CATALOG_LENSES.length).toBeGreaterThanOrEqual(35);
  });

  it('her projektörün en az 1 uyumlu lensi (veya dahili lensi) ve geçerli lümen/çözünürlük değerleri vardır', () => {
    for (const p of CATALOG_PROJECTORS) {
      expect(p.ansiLumens).toBeGreaterThan(0);
      expect(p.nativeW).toBeGreaterThan(0);
      expect(p.nativeH).toBeGreaterThan(0);
      const compat = getCompatibleCatalogLenses(p);
      expect(compat.length).toBeGreaterThanOrEqual(1);
      for (const l of compat) {
        expect(l.throwMin).toBeGreaterThan(0);
        expect(l.throwMax).toBeGreaterThanOrEqual(l.throwMin);
      }
    }
  });
});
