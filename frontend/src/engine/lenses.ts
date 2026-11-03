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
