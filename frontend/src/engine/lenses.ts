import { ShiftLimits, ThrowRange } from './throw';

export interface LensRecord {
  id: number; manufacturer: string; model: string;
  throw_min: number; throw_max: number;
  lens_mount?: string | null;
  shift?: { v_min?: number; v_max?: number; h_min?: number; h_max?: number; reference?: 'full-dimension' | 'half-dimension' };
  verified?: boolean;
}

export const lensThrowRange = (l: LensRecord): ThrowRange => ({ min: l.throw_min, max: l.throw_max });

export function lensShiftLimits(l: LensRecord): { v?: ShiftLimits; h?: ShiftLimits } {
  const s = l.shift;
  if (!s || !s.reference) return {};
  return {
    v: s.v_min !== undefined && s.v_max !== undefined ? { min: s.v_min, max: s.v_max, reference: s.reference } : undefined,
    h: s.h_min !== undefined && s.h_max !== undefined ? { min: s.h_min, max: s.h_max, reference: s.reference } : undefined,
  };
}

/** Gereken throw ratio'yu kapsayan lensler (yalnızca optik aralık; UYUMLULUK ayrıca doğrulanmalıdır). */
export function lensesCoveringThrow(tr: number, lenses: LensRecord[]): LensRecord[] {
  const eps = 1e-9;
  return lenses.filter(l => tr >= l.throw_min - eps && tr <= l.throw_max + eps);
}

export interface StandardLensPreset {
  id: string;
  category: string;
  name: string;
  throwMin: number;
  throwMax: number;
  notes: string;
}

/**
 * Endüstri standardı profesyonel projeksiyon lens kategorileri ve atım oranları.
 * Veritabanında kayıtlı lens olmadığında veya hızlı ön boyutlandırma için kullanılır.
 */
export const STANDARD_LENS_PRESETS: StandardLensPreset[] = [
  { id: 'ust-mirror', category: 'Ultra Kısa (UST)', name: 'UST Ayna / L-Tipi Lens', throwMin: 0.25, throwMax: 0.38, notes: 'Sıfıra yakın mesafe, gölgesiz kurulum' },
  { id: 'st-050', category: 'Kısa Sabit', name: '0.50:1 Sabit Kısa Lens', throwMin: 0.50, throwMax: 0.50, notes: 'Sabit odak (zoom yok)' },
  { id: 'st-065', category: 'Kısa Sabit', name: '0.65:1 Sabit Kısa Lens', throwMin: 0.65, throwMax: 0.65, notes: 'Sabit odak, düşük tavan / zemin mapping' },
  { id: 'st-080', category: 'Kısa Sabit', name: '0.80:1 Sabit Kısa Lens', throwMin: 0.80, throwMax: 0.80, notes: 'Müze / sergi duvar ve zemin standart' },
  { id: 'sz-075-095', category: 'Kısa Zoom', name: '0.75 – 0.95:1 Kısa Zoom', throwMin: 0.75, throwMax: 0.95, notes: 'Esnek kısa mesafe, sahne içi' },
  { id: 'wz-095-130', category: 'Geniş Zoom', name: '0.95 – 1.30:1 Geniş Zoom', throwMin: 0.95, throwMax: 1.30, notes: 'Kısa-orta salon ve sergi odaları' },
  { id: 'std-125-160', category: 'Standart Zoom', name: '1.25 – 1.60:1 Standart Zoom', throwMin: 1.25, throwMax: 1.60, notes: 'Çoğu projektörün dahili / standart lensi' },
  { id: 'std-150-200', category: 'Standart Zoom', name: '1.50 – 2.00:1 Standart-Orta Zoom', throwMin: 1.50, throwMax: 2.00, notes: 'Konferans salonu ve sınıf standardı' },
  { id: 'mt-200-300', category: 'Orta Tele', name: '2.00 – 3.00:1 Orta Tele Zoom', throwMin: 2.00, throwMax: 3.00, notes: 'Büyük salon / galeri arka duvar montajı' },
  { id: 'lt-300-500', category: 'Uzun Tele', name: '3.00 – 5.00:1 Uzun Tele Zoom', throwMin: 3.00, throwMax: 5.00, notes: 'Oditoryum, reji odası, yüksek tavan' },
  { id: 'ut-500-800', category: 'Ultra Tele', name: '5.00 – 8.00:1 Ultra Tele Zoom', throwMin: 5.00, throwMax: 8.00, notes: 'Büyük sahne, cephe (facade) mapping' },
];

/** Verilen görüntü genişliği (m) için lensin kurulum mesafe aralığı (m). */
export function distanceForLens(widthM: number, trMin: number, trMax: number): { minDist: number; maxDist: number } {
  return {
    minDist: widthM * trMin,
    maxDist: widthM * trMax,
  };
}

/** Verilen mesafe (m) için lensin açabileceği görüntü genişlik ve yükseklik aralığı (m). */
export function sizeRangeForLens(
  distanceM: number,
  trMin: number,
  trMax: number,
  aspectRatio: number
): { minW: number; maxW: number; minH: number; maxH: number } {
  const minW = distanceM / trMax;
  const maxW = distanceM / trMin;
  return {
    minW,
    maxW,
    minH: minW / aspectRatio,
    maxH: maxW / aspectRatio,
  };
}
