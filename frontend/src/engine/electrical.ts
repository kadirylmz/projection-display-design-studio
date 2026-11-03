/**
 * Elektrik yük, devre ve gerilim düşümü hesapları.
 *   Tek faz   I = P / (V · PF)
 *   Üç faz    I = P / (√3 · V_LL · PF)
 *   Gerilim düşümü  tek faz ΔU = 2·ρ·L·I / S ;  üç faz ΔU = √3·ρ·L·I / S   (reaktans ihmal edilir)
 *   ρ bakır, 70 °C iletken sıcaklığı ≈ 0.0225 Ω·mm²/m (kullanıcı değiştirebilir; 20 °C için ≈ 0.0175)
 * UYARI: Kablo kesiti/akım taşıma kapasitesi (Iz) montaj yöntemine ve düzeltme katsayılarına bağlıdır
 * (TS HD 60364-5-52 / IEC 60364-5-52). Bu modül Iz'yi TABLOLARDAN SEÇMEZ; kullanıcı girerse In ≤ Iz kontrol eder.
 * Koruma elemanı anma akımları IEC 60898-1 tercihli değerlerindendir (6…125 A).
 */
import { assertPositive } from './units';

export const BREAKER_RATINGS_A = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];

export interface Load { id: string; name: string; qty: number; powerW: number; pf?: number }
export interface Circuit {
  id: string; name: string; loadIds: string[];
  phase: 'L1' | 'L2' | 'L3' | '3P';        // tek faz hattı veya üç faz devre
  cableMm2?: number; lengthM?: number; ampacityA?: number;   // Iz kullanıcıdan
}
export interface Supply { voltage: number; phases: 1 | 3; defaultPf: number; designMargin: number; maxDropPct: number; rho: number; diversity: number }

export const defaultSupply = (): Supply => ({ voltage: 230, phases: 1, defaultPf: 1, designMargin: 0.25, maxDropPct: 3, rho: 0.0225, diversity: 1 });

export function loadCurrent(powerW: number, voltage: number, pf: number, threePhase: boolean): number {
  assertPositive('power', powerW); assertPositive('voltage', voltage); assertPositive('pf', pf);
  if (pf > 1) throw new RangeError('Güç faktörü ≤ 1 olmalı');
  return threePhase ? powerW / (Math.sqrt(3) * voltage * pf) : powerW / (voltage * pf);
}

export function selectBreaker(ib: number, margin: number): { inA: number | null; required: number } {
  assertPositive('Ib', ib);
  if (margin < 0) throw new RangeError('Marj negatif olamaz');
  const required = ib * (1 + margin);
  const found = BREAKER_RATINGS_A.find(r => r >= required - 1e-9);
  return { inA: found ?? null, required };
}

export function voltageDrop(i: number, lengthM: number, mm2: number, rho: number, voltage: number, threePhase: boolean) {
  assertPositive('I', i); assertPositive('length', lengthM); assertPositive('S', mm2); assertPositive('rho', rho);
  const du = (threePhase ? Math.sqrt(3) : 2) * rho * lengthM * i / mm2;
  return { volts: du, percent: du / voltage * 100 };
}

export interface CircuitResult {
  circuit: Circuit; powerW: number; ibA: number; breakerA: number | null; requiredA: number;
  dropV?: number; dropPct?: number; warnings: string[];
}
export interface ElectricalResult {
  circuits: CircuitResult[]; totalW: number; demandW: number; totalIbA: number;
  mainBreakerA: number | null; phaseLoadsW: Record<string, number>; imbalancePct: number | null;
  warnings: string[]; assumptions: string[];
}

export function analyze(loads: Load[], circuits: Circuit[], s: Supply): ElectricalResult {
  assertPositive('voltage', s.voltage);
  if (s.diversity <= 0 || s.diversity > 1) throw new RangeError('Eşzamanlılık katsayısı (0,1] olmalı');
  const byId = new Map(loads.map(l => [l.id, l]));
  const warnings: string[] = [];
  const used = new Set<string>();
  const res: CircuitResult[] = [];
  const phaseLoads: Record<string, number> = { L1: 0, L2: 0, L3: 0 };
  for (const c of circuits) {
    const w: string[] = [];
    let p = 0, ibSum = 0;
    for (const id of c.loadIds) {
      const l = byId.get(id); if (!l) { w.push(`Bilinmeyen yük: ${id}`); continue; }
      if (used.has(id)) w.push(`${l.name} birden fazla devrede.`);
      used.add(id);
      const lp = l.qty * l.powerW; p += lp;
      ibSum += loadCurrent(lp, s.voltage, l.pf ?? s.defaultPf, c.phase === '3P');
    }
    if (p === 0) { res.push({ circuit: c, powerW: 0, ibA: 0, breakerA: null, requiredA: 0, warnings: [...w, 'Devrede yük yok.'] }); continue; }
    const ib = ibSum, sel = selectBreaker(ib, s.designMargin);
    if (sel.inA === null) w.push(`Gereken ${sel.required.toFixed(1)} A, tercihli değerlerin (125 A) üstünde; devreyi bölün.`);
    const r: CircuitResult = { circuit: c, powerW: p, ibA: ib, breakerA: sel.inA, requiredA: sel.required, warnings: w };
    if (c.cableMm2 && c.lengthM) {
      const d = voltageDrop(ib, c.lengthM, c.cableMm2, s.rho, s.voltage, c.phase === '3P');
      r.dropV = d.volts; r.dropPct = d.percent;
      if (d.percent > s.maxDropPct) w.push(`Gerilim düşümü %${d.percent.toFixed(2)} > izin verilen %${s.maxDropPct}.`);
    } else w.push('Kablo kesiti/uzunluğu girilmedi; gerilim düşümü hesaplanmadı.');
    if (c.ampacityA !== undefined) {
      if (sel.inA !== null && sel.inA > c.ampacityA) w.push(`Koruma ${sel.inA} A, kablo Iz ${c.ampacityA} A'i aşıyor (In ≤ Iz sağlanmıyor).`);
    } else w.push('Kablo akım taşıma kapasitesi (Iz) girilmedi; In ≤ Iz kontrol edilemedi.');
    if (c.phase !== '3P') phaseLoads[c.phase] += p; else { for (const k of ['L1', 'L2', 'L3']) phaseLoads[k] += p / 3; }
    res.push(r);
  }
  for (const l of loads) if (!used.has(l.id)) warnings.push(`${l.name} hiçbir devreye atanmadı.`);
  const total = res.reduce((a, r) => a + r.powerW, 0), demand = total * s.diversity;
  const totalIb = s.phases === 3 ? loadCurrent(Math.max(demand, 1e-9), s.voltage, s.defaultPf, true) : loadCurrent(Math.max(demand, 1e-9), s.voltage, s.defaultPf, false);
  let imb: number | null = null;
  if (s.phases === 3) {
    const v = Object.values(phaseLoads), avg = v.reduce((a, b) => a + b, 0) / 3;
    imb = avg > 0 ? (Math.max(...v) - Math.min(...v)) / avg * 100 : 0;
    if (imb > 20) warnings.push(`Faz dengesizliği %${imb.toFixed(0)}; yükleri fazlara yeniden dağıtın.`);
  }
  const main = total > 0 ? selectBreaker(s.phases === 3 ? totalIb : totalIb, s.designMargin) : { inA: null, required: 0 };
  if (total > 0 && main.inA === null) warnings.push('Ana koruma 125 A tercihli değerlerin üstünde; elle seçin.');
  return {
    circuits: res, totalW: total, demandW: demand, totalIbA: total > 0 ? totalIb : 0, mainBreakerA: main.inA,
    phaseLoadsW: phaseLoads, imbalancePct: imb, warnings,
    assumptions: [
      `Gerilim ${s.voltage} V, ${s.phases} fazlı besleme; güç faktörü yük başına girilmediyse ${s.defaultPf}.`,
      `Koruma seçimi: In ≥ Ib × (1+${s.designMargin}); IEC 60898-1 tercihli değerlerinden en küçüğü.`,
      `Gerilim düşümü reaktanssız, ρ=${s.rho} Ω·mm²/m (bakır).`,
      'Kablo Iz değeri ve selektivite/kısa devre hesabı kapsam dışıdır; proje mühendisi tarafından doğrulanmalıdır.',
    ],
  };
}
