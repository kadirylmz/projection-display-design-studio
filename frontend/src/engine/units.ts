/**
 * Birim dönüşümü. Tüm iç hesaplar METRE cinsindendir.
 * Dönüşümler yalnızca giriş/çıkışta uygulanır; fiziksel sonuç birimden bağımsızdır.
 */
export type LengthUnit = 'm' | 'cm' | 'mm' | 'in' | 'ft';

// Tanım gereği tam değerler: 1 in = 0.0254 m, 1 ft = 0.3048 m
export const METERS_PER: Record<LengthUnit, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  in: 0.0254,
  ft: 0.3048,
};

export function toMeters(v: number, u: LengthUnit): number {
  return v * METERS_PER[u];
}
export function fromMeters(m: number, u: LengthUnit): number {
  return m / METERS_PER[u];
}
export function convert(v: number, from: LengthUnit, to: LengthUnit): number {
  return fromMeters(toMeters(v, from), to);
}

/** Kayan nokta gürültüsünü temizler (görüntüleme/karşılaştırma için). */
export function round(v: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round((v + Number.EPSILON) * f) / f;
}

export function assertPositive(name: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new RangeError(`${name} sıfırdan büyük ve sonlu olmalıdır (girilen: ${v})`);
  }
}
