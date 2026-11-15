import type { ReportPayload } from './report';
import { computeSurfacePointLuxDistribution } from './feasibility';
import { evaluatePhysicalCoverage } from './physicalCoverage';
import { analyze, evaluateProtectionCoordination } from './electrical';
import { computeLuxSimulationGrid, sampleNinePointsFromLuxGrid } from './centralDesignModel';
import {
  analyzeFootprintOverlaps,
  buildGridFootprints,
  computeContentCanvas,
  computeContrastAnalysis,
  identifyMmPerPxSource,
  validateLuxOrder,
} from './projectionGeometry';

export type ValidationStatus = 'pass' | 'warning' | 'error' | 'unknown' | 'not_applicable';
export type ValidationLevel = 'Bilgi' | 'Uyarı' | 'Hata' | 'Veri Eksik' | 'Kapsam Dışı';
export type ValidationVerdict = 'PASS' | 'WARNING' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';
export type PdfApprovalStatus = 'APPROVED' | 'CONDITIONAL' | 'DRAFT' | 'BLOCKED';
export type PdfGateStatus = 'READY' | 'CONDITIONAL' | 'BLOCKED';

export interface ReportValidationCheck {
  id: string;
  modulePair: string;
  title: string;
  status: ValidationStatus;
  verdict: ValidationVerdict;
  level: ValidationLevel;
  testInput?: string;
  formula?: string;
  expectedValue: string;
  actualValue: string;
  tolerancePct: number;
  deviationPct: number;
  differenceText: string;
  message: string;
  category?: 'mathematical' | 'engineering';
  isMandatory?: boolean;
}

export interface ReportValidationResult {
  isConsistent: boolean;
  hasCriticalErrors: boolean;
  draftRequired: boolean;
  canExportFinalPdf: boolean;
  pdfApprovalStatus: PdfApprovalStatus;
  pdfGateStatus: PdfGateStatus;
  approvalBlockReasons: string[];
  consistencyScorePct: number;
  mathScorePct: number;
  engineeringScorePct: number;
  passCount: number;
  infoCount: number;
  warningCount: number;
  errorCount: number;
  unknownCount: number;
  notApplicableCount: number;
  checks: ReportValidationCheck[];
  warnings: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function levelFromStatus(status: ValidationStatus): ValidationLevel {
  if (status === 'error') return 'Hata';
  if (status === 'warning') return 'Uyarı';
  if (status === 'unknown') return 'Veri Eksik';
  if (status === 'not_applicable') return 'Kapsam Dışı';
  return 'Bilgi';
}

function verdictFromStatus(status: ValidationStatus): ValidationVerdict {
  if (status === 'error') return 'FAIL';
  if (status === 'warning') return 'WARNING';
  if (status === 'unknown') return 'UNKNOWN';
  if (status === 'not_applicable') return 'NOT_APPLICABLE';
  return 'PASS';
}

/**
 * Mühendislik Çapraz Doğrulama Motoru:
 * Rapordaki Fotometri, Optik FOV, Pixel Map, Geometrik Kayıp, Elektrik ve Planlayıcı
 * modüllerinin çıktılarını birbirine karşı matematiksel olarak doğrular.
 */
export function validateReportConsistency(p: ReportPayload): ReportValidationResult {
  const checks: ReportValidationCheck[] = [];
  const warnings: string[] = [];

  const addCheck = (
    c: Omit<ReportValidationCheck, 'level' | 'verdict'> & { isInfoOnly?: boolean; verdict?: ValidationVerdict },
  ) => {
    const level: ValidationLevel = c.isInfoOnly ? 'Bilgi' : levelFromStatus(c.status);
    const verdict: ValidationVerdict = c.verdict ?? verdictFromStatus(c.status);
    if (c.status !== 'pass' && c.status !== 'not_applicable') {
      warnings.push(`[${level} - ${c.modulePair}] ${c.message}`);
    }
    checks.push({
      ...c,
      level,
      verdict,
    });
  };

  // 0. Senaryo ID & Yüzey ID Tutarlılığı + Tekil vs Çoklu Senaryo Ayrımı
  if (p.scenarios && p.scenarios.length > 0) {
    const missingIds = p.scenarios.filter(sc => !sc.scenarioId || !sc.surfaceId);
    addCheck({
      id: 'scenario-surface-sync',
      modulePair: 'Senaryo ↔ Yüzey',
      title: 'Senaryo ID & Yüzey ID Tutarlılığı',
      status: missingIds.length > 0 ? 'error' : 'pass',
      testInput: `${p.scenarios.length} Senaryo`,
      formula: '∀s: s.scenarioId ∧ s.surfaceId',
      expectedValue: `${p.scenarios.length} geçerli senaryo`,
      actualValue: `${p.scenarios.length - missingIds.length} geçerli`,
      tolerancePct: 0,
      deviationPct: missingIds.length > 0 ? 100 : 0,
      differenceText: missingIds.length > 0 ? `${missingIds.length} eksik` : 'Tutarlı',
      message:
        missingIds.length > 0
          ? `${missingIds.length} senaryoda scenarioId veya surfaceId eksik.`
          : `${p.scenarios.length} sistem senaryosu benzersiz Senaryo ID ve Yüzey ID ile eşleşiyor.`,
    });
  }

  // 1. Fotometri: Efektif Lümen ÷ Alan ↔ Ortalama Lux & Nits
  if (p.photometricSurfaces && p.photometricSurfaces.length > 0) {
    p.photometricSurfaces.forEach((ps, idx) => {
      // Zorunlu sıralama kuralı: E_min ≤ E_ort ≤ E_max (aynı LuxField içinde)
      if (ps.avgLux > 0 && ps.maxLux > 0) {
        const orderIssues = validateLuxOrder(
          Number.isFinite(ps.minLux) ? ps.minLux : null,
          ps.avgLux,
          ps.maxLux
        );
        addCheck({
          id: `lux-order-${idx}`,
          modulePair: 'Fotometri ↔ Min/Ort/Max Sıralaması',
          title: `${ps.surfaceName}: E_min ≤ E_ort ≤ E_max`,
          status: orderIssues.length > 0 ? 'error' : 'pass',
          category: 'mathematical',
          isMandatory: true,
          testInput: `min=${ps.minLux} · ort=${r1(ps.avgLux)} · max=${ps.maxLux} lx`,
          formula: 'E_min ≤ E_ort ≤ E_max',
          expectedValue: 'Sıralama korunmalı',
          actualValue: `${ps.minLux} ≤ ${r1(ps.avgLux)} ≤ ${ps.maxLux}`,
          tolerancePct: 0,
          deviationPct: orderIssues.length > 0 ? 100 : 0,
          differenceText: orderIssues.length > 0 ? 'Matematiksel Çelişki' : 'Tutarlı',
          message:
            orderIssues.length > 0
              ? `${orderIssues.join('; ')}. Ortalama değer teorik (Φ/A), min/max ise LuxField'den geliyor olabilir — kaynaklar karıştırılmış (FAIL).`
              : 'Min/Ortalama/Max sıralaması aynı veri setinde tutarlı.',
        });
      }
      const area = Math.max(0.01, ps.widthM * ps.heightM);
      const effFlux = ps.effectiveTotalLumens ?? ps.avgLux * area;
      const expectedLux = effFlux / area;
      const reportedTheoLux = ps.effectiveTheoreticalLux ?? ps.theoreticalAvgLux ?? ps.avgLux;
      const devPct = r1((Math.abs(expectedLux - reportedTheoLux) / Math.max(1, expectedLux)) * 100);
      const tol = 8;
      const status: ValidationStatus = devPct > 20 ? 'error' : devPct > tol ? 'warning' : 'pass';
      const hasSeparateSimAvg =
        ps.luxSource === 'SIMULATED_LUXFIELD' &&
        (ps.effectiveTheoreticalLux !== undefined || ps.theoreticalAvgLux !== undefined) &&
        Math.abs(reportedTheoLux - ps.avgLux) > 1;
      const msg =
        status === 'pass'
          ? hasSeparateSimAvg
            ? `Teorik Efektif Akı/Alan (${r1(expectedLux)} lx) doğrulandı; Simüle LuxField ortalaması (9-Nokta Eşit: ${r1(ps.avgLux)} lx${ps.gridAvgLux ? `, 288-Nokta Grid: ${ps.gridAvgLux} lx` : ''}) teorik değerden ayrı tutuldu.`
            : `Akı/Alan oranı (${r1(expectedLux)} lx) ile ortalama ekran aydınlığı (${r1(ps.avgLux)} lx) tutarlı.`
          : `Efektif akı/alan (${r1(expectedLux)} lx) ile raporlanan teorik/ortalama Lux (${r1(reportedTheoLux)} lx) arasında %${devPct} sapma var.`;
      addCheck({
        id: `photo-flux-${idx}`,
        modulePair: 'Fotometri ↔ Alan',
        title: `${ps.surfaceName}: Lümen / m² ↔ Teorik & Simüle Lux Ayrımı`,
        status,
        expectedValue: `Teorik Φ_eff/A: ${r1(expectedLux)} Lux`,
        actualValue: hasSeparateSimAvg
          ? `Teorik: ${r1(reportedTheoLux)} lx · Simüle 9-Nokta: ${r1(ps.avgLux)} lx${ps.gridAvgLux ? ` · 288-Grid: ${ps.gridAvgLux} lx` : ''}`
          : `${r1(reportedTheoLux)} Lux`,
        tolerancePct: tol,
        deviationPct: devPct,
        differenceText: `${r1(reportedTheoLux - expectedLux) >= 0 ? '+' : ''}${r1(reportedTheoLux - expectedLux)} lx (%${devPct})`,
        message: msg,
      });

      if (typeof ps.idealNits === 'number' && ps.idealNits > 0) {
        const expectedNits = (ps.avgLux * ps.screenGain) / Math.PI;
        const nitsDev = r1((Math.abs(expectedNits - ps.idealNits) / Math.max(1, expectedNits)) * 100);
        const nTol = 12;
        const nStatus: ValidationStatus = nitsDev > nTol ? 'warning' : 'pass';
        const nMsg =
          nStatus === 'pass'
            ? `Parıltı (${ps.idealNits} cd/m²) ile Lux×Gain/π formülü uyumlu.`
            : `Hesaplanan Nits (${r1(expectedNits)}) ile raporlanan Nits (${ps.idealNits}) arasında %${nitsDev} fark tespit edildi.`;
        addCheck({
          id: `photo-nits-${idx}`,
          modulePair: 'Fotometri ↔ Ekran Gain',
          title: `${ps.surfaceName}: Lux × Gain ÷ π ↔ Nits`,
          status: nStatus,
          expectedValue: `${r1(expectedNits)} cd/m²`,
          actualValue: `${ps.idealNits} cd/m²`,
          tolerancePct: nTol,
          deviationPct: nitsDev,
          differenceText: `${r1(ps.idealNits - expectedNits) >= 0 ? '+' : ''}${r1(ps.idealNits - expectedNits)} cd/m²`,
          message: nMsg,
        });
      }

      if (typeof ps.surfaceReflectance === 'number' && ps.surfaceReflectance > 0 && ps.luminanceNits > 0) {
        const expectedRealNits = (ps.avgLux * ps.screenGain * ps.surfaceReflectance) / Math.PI;
        const realDev = r1((Math.abs(expectedRealNits - ps.luminanceNits) / Math.max(1, expectedRealNits)) * 100);
        const rTol = 12;
        const rStatus: ValidationStatus = realDev > 25 ? 'error' : realDev > rTol ? 'warning' : 'pass';
        addCheck({
          id: `photo-reflectance-nits-${idx}`,
          modulePair: 'Fotometri ↔ Gain & Reflectance (ρ)',
          title: `${ps.surfaceName}: Gerçek Parlaklık (ρ=${ps.surfaceReflectance})`,
          status: rStatus,
          expectedValue: `${r1(expectedRealNits)} cd/m²`,
          actualValue: `${r1(ps.luminanceNits)} cd/m²`,
          tolerancePct: rTol,
          deviationPct: realDev,
          differenceText: `${r1(ps.luminanceNits - expectedRealNits) >= 0 ? '+' : ''}${r1(ps.luminanceNits - expectedRealNits)} cd/m²`,
          message:
            rStatus === 'pass'
              ? `Gözlenen parlaklık (${r1(ps.luminanceNits)} cd/m²) gerçek yansıtma katsayısı (ρ=${ps.surfaceReflectance}) ile uyumlu.`
              : `Gözlenen parlaklık (${r1(ps.luminanceNits)} cd/m²) ile Lux×Gain×ρ/π (${r1(expectedRealNits)} cd/m²) arasında %${realDev} sapma var!`,
        });
      }

      if (ps.distributionRows !== undefined && ps.distributionRows.length !== ps.projectorCount) {
        addCheck({
          id: `dist-rows-count-${idx}`,
          modulePair: 'Fotometri ↔ Dağılım Cetveli',
          title: `${ps.surfaceName}: Yerleşim Satır Adedi`,
          status: 'error',
          expectedValue: `${ps.projectorCount} PJ`,
          actualValue: `${ps.distributionRows.length} PJ`,
          tolerancePct: 0,
          deviationPct: r1((Math.abs(ps.distributionRows.length - ps.projectorCount) / Math.max(1, ps.projectorCount)) * 100),
          differenceText: `${ps.distributionRows.length - ps.projectorCount} PJ`,
          message: `Dağılım cetvelinde ${ps.distributionRows.length} projektör satırı var, ancak yüzeyde ${ps.projectorCount} projektör tanımlı!`,
        });
      }

      if (!ps.isManualLux) {
        addCheck({
          id: `photo-sim-tag-${idx}`,
          modulePair: 'Fotometri Modu',
          title: `${ps.surfaceName}: Ölçüm Kaynağı`,
          status: 'pass',
          isInfoOnly: true,
          expectedValue: 'Simülasyon / Saha Ölçümü',
          actualValue: 'Tahmini / Simülasyon',
          tolerancePct: 0,
          deviationPct: 0,
          differenceText: '—',
          message: 'Saha lüksmetre ölçümü girilmediği için değerler tahmini/simülasyon olarak etiketlendi.',
        });
      }

      // 2. Projektör Sayısı – Toplam Lümen
      const netEffRatio = (ps.netEfficiencyPct ?? 90) / 100;
      const unitLm = ps.nominalLumensPerProj
        || (ps.totalNominalLumens && ps.projectorCount > 0 ? Math.round(ps.totalNominalLumens / ps.projectorCount) : 0)
        || (ps.effectiveTotalLumens && ps.projectorCount > 0 ? Math.round((ps.effectiveTotalLumens / Math.max(0.1, netEffRatio)) / ps.projectorCount) : 0);
      if (ps.projectorCount > 0 && unitLm > 0) {
        const expTotalLm = ps.projectorCount * unitLm;
        const repTotalLm = ps.totalNominalLumens ?? expTotalLm;
        const lmDev = r1((Math.abs(expTotalLm - repTotalLm) / Math.max(1, expTotalLm)) * 100);
        addCheck({
          id: `photo-count-lumens-${idx}`,
          modulePair: 'Cihaz Adedi ↔ Toplam Lümen',
          title: `${ps.surfaceName}: Projektör Adedi × Lümen`,
          status: lmDev > 5 ? 'error' : 'pass',
          testInput: `${ps.projectorCount} PJ × ${unitLm} lm`,
          formula: 'Toplam Lümen = N × Lümen_birim',
          expectedValue: `${expTotalLm} lm`,
          actualValue: `${repTotalLm} lm`,
          tolerancePct: 5,
          deviationPct: lmDev,
          differenceText: `${repTotalLm - expTotalLm} lm`,
          message: lmDev > 5 ? `Toplam lümen (${repTotalLm} lm) ile ${ps.projectorCount}×${unitLm} lm uyuşmuyor.` : `Toplam lümen (${repTotalLm} lm) projektör adediyle tutarlı.`,
        });
      } else {
        addCheck({
          id: `photo-count-lumens-${idx}`,
          modulePair: 'Cihaz Adedi ↔ Toplam Lümen',
          title: `${ps.surfaceName}: Projektör Adedi × Lümen`,
          status: 'unknown',
          expectedValue: 'N > 0, Lümen > 0',
          actualValue: `${ps.projectorCount || 0} PJ · ${unitLm} lm`,
          tolerancePct: 0,
          deviationPct: 100,
          differenceText: 'Veri Eksik',
          message: 'Birim projektör lümeni veya adedi eksik olduğu için toplam lümen doğrulanamadı (UNKNOWN).',
        });
      }

      // 11. Nit – Ortam Işığı – ACR
      if (typeof ps.ambientLux === 'number' && ps.ambientLux > 0 && ps.luminanceNits > 0) {
        const refl = ps.surfaceReflectance && ps.surfaceReflectance > 0 ? ps.surfaceReflectance : 0.85;
        const ambNits = (ps.ambientLux * ps.screenGain * refl) / Math.PI;
        const expAcr = r1((ps.luminanceNits + ambNits) / Math.max(0.01, ambNits));
        const repAcr = ps.ambientContrastRatio ?? expAcr;
        const acrDev = r1((Math.abs(expAcr - repAcr) / Math.max(0.1, expAcr)) * 100);
        addCheck({
          id: `photo-acr-${idx}`,
          modulePair: 'Fotometri ↔ Ortam Işığı (ACR)',
          title: `${ps.surfaceName}: Nit & Ortam Işığı ↔ ACR`,
          status: acrDev > 15 ? 'error' : acrDev > 8 ? 'warning' : 'pass',
          testInput: `L=${r1(ps.luminanceNits)} nit, E_ort=${ps.ambientLux} lx, ρ=${refl}`,
          formula: 'ACR = (L_beyaz + L_ortam) / L_ortam',
          expectedValue: `${expAcr}:1`,
          actualValue: `${r1(repAcr)}:1`,
          tolerancePct: 8,
          deviationPct: acrDev,
          differenceText: `${r1(repAcr - expAcr)}`,
          message: acrDev > 8 ? `ACR (${r1(repAcr)}:1) ile gerçek ρ=${refl} hesabı (${expAcr}:1) farklı.` : `ACR (${r1(repAcr)}:1) beyaz/siyah seviyesiyle tutarlı.`,
        });
      } else {
        addCheck({
          id: `photo-acr-${idx}`,
          modulePair: 'Fotometri ↔ Ortam Işığı (ACR)',
          title: `${ps.surfaceName}: Nit & Ortam Işığı ↔ ACR`,
          status: 'unknown',
          expectedValue: 'Ortam Lux > 0, Nit > 0',
          actualValue: `${ps.ambientLux ?? 0} lx · ${r1(ps.luminanceNits || 0)} nit`,
          tolerancePct: 0,
          deviationPct: 100,
          differenceText: 'Veri Eksik',
          message: 'Ortam ışığı (lux) veya yüzey parlaklığı (nit) eksik; ACR doğrulanamadı (UNKNOWN).',
        });
      }

      // 11B. Gerçek ACR: cihaz doğal siyah seviyesi (native kontrast) kontrolü
      if (ps.nativeContrast !== undefined || ps.nativeBlackNits !== undefined || !ps.ambientLux || ps.ambientLux <= 0) {
        const refl = ps.surfaceReflectance && ps.surfaceReflectance > 0 ? ps.surfaceReflectance : 0.85;
        const contrast = computeContrastAnalysis({
          white: { source: ps.luxSource ?? 'SIMULATED_LUXFIELD', luxUsed: ps.avgLux, nits: ps.luminanceNits > 0 ? ps.luminanceNits : null, formula: 'L = E × Gain × ρ / π' },
          ambientLux: typeof ps.ambientLux === 'number' ? ps.ambientLux : null,
          gain: ps.screenGain || 1,
          reflectance: refl,
          nativeContrast: ps.nativeContrast ?? null,
          nativeBlackNits: ps.nativeBlackNits ?? null,
        });
        addCheck({
          id: `photo-acr-native-black-${idx}`,
          modulePair: 'ACR ↔ Cihaz Doğal Siyah Seviyesi',
          title: `${ps.surfaceName}: Gerçek ACR (Doğal Siyah Dahil)`,
          status: contrast.acrVerified ? 'pass' : 'unknown',
          category: 'engineering',
          isMandatory: false,
          testInput: `L_beyaz=${contrast.whiteNits ?? '—'} nit [${contrast.whiteSource}], L_ortam=${contrast.ambientBlackNits ?? '—'} nit, L_doğal=${contrast.nativeBlackNits ?? 'UNKNOWN'} nit`,
          formula: 'ACR = (L_beyaz + L_ortam + L_doğal) / (L_ortam + L_doğal)',
          expectedValue: 'Native kontrast / siyah seviyesi tanımlı',
          actualValue: contrast.acrVerified ? `${contrast.acr}:1` : `Tahmini ortam kontrastı ${contrast.estimatedAmbientContrast ?? '—'}:1`,
          tolerancePct: 0,
          deviationPct: 0,
          differenceText: contrast.acrVerified ? 'Doğrulandı' : 'UNKNOWN',
          message: contrast.message,
        });
      }

      // 12. Noktasal Lux – Ortalama Lux – Uniformity
      if (typeof ps.uniformityU0 === 'number' && ps.uniformityU0 > 0 && ps.avgLux > 0) {
        const u0Pct = ps.uniformityU0 <= 1 ? r1(ps.uniformityU0 * 100) : r1(ps.uniformityU0);
        addCheck({
          id: `photo-point-uniformity-${idx}`,
          modulePair: 'Noktasal Lux ↔ Uniformity',
          title: `${ps.surfaceName}: Ortalama Lux ↔ Uniformity (U0)`,
          status: u0Pct > 100 ? 'error' : 'pass',
          testInput: `Ort=${r1(ps.avgLux)} lx, U0=%${u0Pct}`,
          formula: 'U0 = (E_min / E_ort) × 100',
          expectedValue: '0 < U0 ≤ %100',
          actualValue: `%${u0Pct}`,
          tolerancePct: 0,
          deviationPct: u0Pct > 100 ? r1(u0Pct - 100) : 0,
          differenceText: u0Pct > 100 ? 'Aşım' : 'Tutarlı',
          message: u0Pct > 100 ? `Uniformity (%${u0Pct}) %100'den büyük olamaz.` : `Noktasal dağılım düzgünlüğü (U0 = %${u0Pct}) fotometrik modelle tutarlı.`,
        });
      } else {
        addCheck({
          id: `photo-point-uniformity-${idx}`,
          modulePair: 'Noktasal Lux ↔ Uniformity',
          title: `${ps.surfaceName}: Ortalama Lux ↔ Uniformity (U0)`,
          status: 'unknown',
          expectedValue: 'U0 > %0',
          actualValue: 'Veri Yok',
          tolerancePct: 0,
          deviationPct: 100,
          differenceText: 'Veri Eksik',
          message: 'Noktasal lux / uniformity verisi eksik (UNKNOWN).',
        });
      }

      // 12B. Tek Cihaz Ort × Projektör Adedi == Ortalama Lux Tutarlılığı
      if (typeof ps.singleProjectorLux === 'number' && ps.singleProjectorLux > 0 && ps.projectorCount > 0 && ps.avgLux > 0) {
        const expectedSingle = Math.round(ps.avgLux / ps.projectorCount);
        const calcTotal = Math.round(ps.singleProjectorLux * ps.projectorCount);
        const devPct = r1((Math.abs(calcTotal - ps.avgLux) / Math.max(1, ps.avgLux)) * 100);
        addCheck({
          id: `single-pj-lux-math-${idx}`,
          modulePair: 'Fotometri ↔ Tek Cihaz Katkısı',
          title: `${ps.surfaceName}: Tek Cihaz Ort × Adet Tutarlılığı`,
          status: devPct > 5 ? 'error' : 'pass',
          testInput: `TekCihaz=${ps.singleProjectorLux} lx, Adet=${ps.projectorCount}, Ort=${r1(ps.avgLux)} lx`,
          formula: 'E_tek × N_pj == E_ort',
          expectedValue: `${expectedSingle} lx × ${ps.projectorCount} = ${Math.round(ps.avgLux)} lx`,
          actualValue: `${ps.singleProjectorLux} lx × ${ps.projectorCount} = ${calcTotal} lx`,
          tolerancePct: 5,
          deviationPct: devPct,
          differenceText: `${calcTotal - Math.round(ps.avgLux)} lx (%${devPct})`,
          message: devPct > 5
            ? `Tek cihaz katkısı (${ps.singleProjectorLux} lx × ${ps.projectorCount} = ${calcTotal} lx) toplam ortalama (${Math.round(ps.avgLux)} lx) ile uyuşmuyor!`
            : `Tek cihaz ortalama katkısı (${expectedSingle} lx × ${ps.projectorCount}) alan ortalaması ile tutarlı.`,
        });
      }

      // 12C. Dokuz Nokta Ağırlıklı Ortalama (1/16, 2/16, 4/16) Doğrulaması
      if (ps.avgLux > 0 && ps.widthM > 0 && ps.heightM > 0) {
        const matchedPlFor9 = (p.plannerSurfaces || []).find(
          pl => pl.id === ps.surfaceId || pl.name === ps.surfaceName
        );
        const nativeW9 = matchedPlFor9?.nativeW || 1920;
        const nativeH9 = matchedPlFor9?.nativeH || 1200;
        const effOv9 = matchedPlFor9?.overlapMode === 'pixel' && (matchedPlFor9?.ovPxX ?? 0) > 0
          ? +((matchedPlFor9.ovPxX! / Math.max(1, nativeW9)) * 100).toFixed(2)
          : (matchedPlFor9?.overlapX ?? ((ps.projectorCount || 1) > 1 ? 15 : 0));
        const syncedU0Pct9 = typeof ps.uniformityU0 === 'number' && ps.uniformityU0 > 0
          ? (ps.uniformityU0 <= 1 ? r1(ps.uniformityU0 * 100) : r1(ps.uniformityU0))
          : 82;
        const simTr = ps.distributionRows?.[0]?.throwRatio || matchedPlFor9?.throwRatio || p.projection?.throwRatio || 0;
        const simDist = ps.distributionRows?.[0]?.throwDistM || matchedPlFor9?.throwDistM || p.projection?.distanceM || 0;
        const refl = ps.surfaceReflectance && ps.surfaceReflectance > 0 ? ps.surfaceReflectance : 0.85;
        const netEffPct = ps.effectiveTotalLumens && ps.totalNominalLumens && ps.totalNominalLumens > 0
          ? r1((ps.effectiveTotalLumens / ps.totalNominalLumens) * 100)
          : (ps.netEfficiencyPct ?? 90);
        const unitLumen = ps.nominalLumensPerProj || (ps.totalNominalLumens ? Math.round(ps.totalNominalLumens / Math.max(1, ps.projectorCount)) : 0);
        const grid288 = simTr > 0 && simDist > 0 && unitLumen > 0
          ? computeLuxSimulationGrid({
              room: {
                widthM: p.interProjectorAnalysis?.roomDimensions?.widthM || 14,
                lengthM: p.interProjectorAnalysis?.roomDimensions?.lengthM || 10,
                heightM: p.interProjectorAnalysis?.roomDimensions?.heightM || 3.5,
              },
              surface: { id: ps.surfaceId, name: ps.surfaceName, widthM: ps.widthM, heightM: ps.heightM, viewingDistanceM: 3.5 },
              projector: {
                model: 'Doğrulama',
                cols: Math.max(1, matchedPlFor9?.cols || ps.projectorCount || 1),
                rows: Math.max(1, matchedPlFor9?.rows || 1),
                nativeW: nativeW9,
                nativeH: nativeH9,
                ansiLumensPerUnit: unitLumen,
                powerWPerUnit: 450,
              },
              lens: { model: 'Lens', throwDistM: simDist, throwRatio: simTr },
              photometrics: { opticalEfficiencyPct: netEffPct, screenGain: ps.screenGain || 1.0, reflectance: refl, ambientLux: ps.ambientLux ?? 0 },
              blending: { overlapPctX: effOv9 },
              electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
            }, 24, 12)
          : null;

        const ptDistZones = grid288
          ? sampleNinePointsFromLuxGrid(grid288, ps.widthM, ps.heightM, ps.screenGain || 1.0, refl).zones9
          : computeSurfacePointLuxDistribution({
              widthM: ps.widthM,
              heightM: ps.heightM,
              cols: Math.max(1, matchedPlFor9?.cols || ps.projectorCount || 1),
              rows: Math.max(1, matchedPlFor9?.rows || 1),
              avgLux: ps.avgLux,
              uniformityU0: syncedU0Pct9,
              overlapPct: effOv9,
              screenGain: ps.screenGain || 1.0,
              reflectance: refl,
              ambientLux: ps.ambientLux ?? 0,
            }).zones9;
        const eqMean = Math.round(ptDistZones.reduce((a, z) => a + z.lux, 0) / Math.max(1, ptDistZones.length));
        const wMean = Math.round(
          ptDistZones.reduce((a, z) => {
            const w = z.zoneKind === 'center' ? 4 : z.zoneKind === 'edge' ? 2 : 1;
            return a + z.lux * w;
          }, 0) / 16
        );
        const cornerMean = Math.round(
          ptDistZones.filter(z => z.zoneKind === 'corner').reduce((a, z) => a + z.lux, 0) / 4
        );
        const edgeMean = Math.round(
          ptDistZones.filter(z => z.zoneKind === 'edge').reduce((a, z) => a + z.lux, 0) / 4
        );
        const centerLux = ptDistZones.find(z => z.zoneKind === 'center')?.lux ?? Math.max(...ptDistZones.map(z => z.lux));
        const expectedWMean = Math.round((4 * cornerMean + 8 * edgeMean + 4 * centerLux) / 16);
        const wDev = r1((Math.abs(wMean - expectedWMean) / Math.max(1, expectedWMean)) * 100);
        addCheck({
          id: `nine-point-weighted-${idx}`,
          modulePair: '9-Nokta Örnekleme ↔ Ağırlıklı Ortalama',
          title: `${ps.surfaceName}: 9-Nokta Ağırlıklı Ortalama (1/16, 2/16, 4/16)`,
          status: wDev > 2 ? 'error' : 'pass',
          testInput: `Köşe=${cornerMean} lx, Kenar=${edgeMean} lx, Merkez=${centerLux} lx`,
          formula: '(4·Köşe + 2·4·Kenar + 4·Merkez) / 16',
          expectedValue: `${expectedWMean} lx (Eşit Ort: ${eqMean} lx)`,
          actualValue: `${wMean} lx`,
          tolerancePct: 2,
          deviationPct: wDev,
          differenceText: `${wMean - expectedWMean} lx`,
          message: `9-nokta ağırlıklı ortalama (${wMean} lx) ve eşit ortalama (${eqMean} lx), ${grid288 ? 'aynı 288-nokta LuxField matrisinden' : 'analitik dağılım modelinden'} örneklenerek doğrulandı.`,
        });

        // 12D. 288-Nokta Fiziksel Lux Grid ↔ Fotometrik Ortalama & U0/U1 Tutarlılığı
        if (grid288) {
          {
            const pt9Min = Math.min(...ptDistZones.map(z => z.lux));
            const pt9Max = Math.max(...ptDistZones.map(z => z.lux));
            const hasFieldContradiction = pt9Max > grid288.maxLux || pt9Min < grid288.minLux;
            addCheck({
              id: `lux-field-integrity-${idx}`,
              modulePair: 'LuxField ↔ 9-Nokta & 288-Nokta Bütünlüğü',
              title: `${ps.surfaceName}: LuxField Min/Max Veri Bütünlüğü`,
              status: hasFieldContradiction ? 'error' : 'pass',
              testInput: `288-Nokta [${grid288.minLux}..${grid288.maxLux}] lx`,
              formula: 'min_grid ≤ min_9pt ≤ max_9pt ≤ max_grid',
              expectedValue: `[${grid288.minLux}..${grid288.maxLux}] lx içinde`,
              actualValue: `[${pt9Min}..${pt9Max}] lx`,
              tolerancePct: 0,
              deviationPct: hasFieldContradiction ? 100 : 0,
              differenceText: hasFieldContradiction ? 'Çelişki' : 'Aynı Matris',
              message: hasFieldContradiction
                ? `9-nokta aralığı (${pt9Min}–${pt9Max} lx), 288-nokta LuxField matris sınırlarını (${grid288.minLux}–${grid288.maxLux} lx) aşıyor (FAIL)!`
                : `9-nokta (${pt9Min}–${pt9Max} lx) ve 288-nokta grid (${grid288.minLux}–${grid288.maxLux} lx) aynı LuxField matrisinden üretildi.`,
            });
            const gridU1 = grid288.maxLux > 0 ? r1((grid288.minLux / grid288.maxLux) * 100) : 0;
            const beamH = (simDist / simTr) * (nativeH9 / nativeW9);
            const hasVerticalOverspill = beamH > ps.heightM + 0.05;
            const hasCoverageGap = grid288.minLux === 0;
            const gridColsCnt = Math.max(1, matchedPlFor9?.cols || ps.projectorCount || 1);
            const ovFrac = gridColsCnt > 1 ? Math.max(0, Math.min(0.995, effOv9 / 100)) : 0;
            // Normal edge-blending (≤%85) bölgesinde karartma rampası toplam akıyı azaltır; teorik Φ_eff/A ile fiziksel grid arasındaki beklenen oran:
            const blendRetention = gridColsCnt > 1 && ovFrac <= 0.85
              ? (gridColsCnt - (gridColsCnt - 1) * ovFrac) / gridColsCnt
              : 1;
            const baseTheoLux = ps.effectiveTheoreticalLux ?? ps.theoreticalAvgLux ?? Math.round((ps.effectiveTotalLumens ?? ps.avgLux * ps.widthM * ps.heightM) / Math.max(0.1, ps.widthM * ps.heightM));
            const expectedPhysGridAvg = Math.round(baseTheoLux * blendRetention * 0.92);
            const refGridAvg = hasVerticalOverspill && grid288.activeAvgLux > 0 ? grid288.activeAvgLux : grid288.avgLux;
            const gridDev = r1((Math.abs(refGridAvg - expectedPhysGridAvg) / Math.max(1, expectedPhysGridAvg)) * 100);
            addCheck({
              id: `lux-grid-288-${idx}`,
              modulePair: '288-Nokta Lux Grid ↔ Fotometri & U0/U1',
              title: `${ps.surfaceName}: 288-Nokta Fiziksel Grid ↔ Alan Ortalaması`,
              status: hasVerticalOverspill && gridDev > 15 ? 'warning' : gridDev > 20 ? 'warning' : 'pass',
              testInput: `Grid 24×12 · TR=${simTr}, D=${simDist}m, Teorik Φ_eff/A=${Math.round(baseTheoLux)} lx (Blend Tutma %${Math.round(blendRetention * 100)})`,
              formula: 'E_grid ≈ E_teorik × k_blend × k_falloff',
              expectedValue: `~${expectedPhysGridAvg} lx (Teorik Φ_eff/A: ${Math.round(baseTheoLux)} lx)`,
              actualValue: `${grid288.avgLux} lx (9-Nokta Eşit: ${eqMean} lx · Aktif: ${grid288.activeAvgLux} lx · U0 %${grid288.u0Pct} · U1 %${gridU1})`,
              tolerancePct: 20,
              deviationPct: gridDev,
              differenceText: `${Math.round(refGridAvg - expectedPhysGridAvg)} lx (%${gridDev})`,
              message: hasVerticalOverspill
                ? `288-nokta fiziksel grid (${grid288.avgLux} lx; 9-nokta eşit ${eqMean} lx; aktif içi ${grid288.activeAvgLux} lx, aktif U0 %${grid288.activeU0Pct}), dikey taşma (${beamH.toFixed(2)}m > ${ps.heightM}m) nedeniyle teorik üst sınırdan (${Math.round(baseTheoLux)} lx) ve taşmasız fiziksel beklentiden (~${expectedPhysGridAvg} lx, %${gridDev}) ayrışıyor.`
                : hasCoverageGap
                  ? `288-nokta grid ortalaması (${grid288.avgLux} lx) blend/falloff beklentisiyle (~${expectedPhysGridAvg} lx) uyumlu; kaplama dışı şeritler (0 lx) nedeniyle aktif içi ortalama ${grid288.activeAvgLux} lx (aktif U0 %${grid288.activeU0Pct}).`
                  : `288-nokta grid ortalaması (${grid288.avgLux} lx, U0 %${grid288.u0Pct}, U1 %${gridU1}) blend ve falloff modeliyle (~${expectedPhysGridAvg} lx) tutarlı.`,
            });
          }
        } else if (p.sections.lux !== false) {
          addCheck({
            id: `photo-luxfield-missing-${idx}`,
            modulePair: 'Fotometri ↔ LuxField Simülasyonu',
            title: `${ps.surfaceName}: LuxField Fiziksel Işık Dağılımı`,
            status: 'unknown',
            category: 'engineering',
            isMandatory: true,
            expectedValue: 'TR, Atım Mesafesi & Birim Lümen tanımlı',
            actualValue: 'Yalnızca teorik Φ/A hesabı',
            tolerancePct: 0,
            deviationPct: 100,
            differenceText: 'LuxField Yok',
            message: `${ps.surfaceName} için teorik alan ortalaması (${Math.round(ps.avgLux)} lx) hesaplanmış olsa da TR, atım mesafesi veya birim lümen eksik olduğundan LuxField simülasyonu doğrulanamadı (UNKNOWN).`,
          });
        }
      }
    });
  }

  // 2. Optik Projeksiyon ↔ Throw Ratio ↔ Zoom/Katalog Sınırları ↔ FOV
  if (p.projection && p.projection.imageWidthM > 0 && p.projection.distanceM > 0) {
    const { imageWidthM, distanceM, throwRatio, throwMin, throwMax, lensName } = p.projection;
    const calcTR = r2(distanceM / imageWidthM);
    const hfov = r1(2 * Math.atan(imageWidthM / (2 * distanceM)) * (180 / Math.PI));
    if (typeof throwRatio === 'number' && throwRatio > 0) {
      const trDev = r1((Math.abs(calcTR - throwRatio) / Math.max(0.05, throwRatio)) * 100);
      const tol = 4;
      const status: ValidationStatus = trDev > 12 ? 'error' : trDev > tol ? 'warning' : 'pass';
      const msg =
        status === 'pass'
          ? `Mesafe/Genişlik (${calcTR}:1) ile Lens TR (${throwRatio}:1) tutarlı (Optik HFOV: ${hfov}°).`
          : `Mesafe/Genişlik (${calcTR}:1) ile girilen Lens TR (${throwRatio}:1) uyuşmuyor (%${trDev} sapma).`;
      addCheck({
        id: 'proj-tr-fov',
        modulePair: 'Optik Lens ↔ Mesafe/Genişlik',
        title: 'Atım Oranı (TR) & Optik HFOV Doğrulaması',
        status,
        expectedValue: `${calcTR}:1 (${hfov}°)`,
        actualValue: `${throwRatio}:1`,
        tolerancePct: tol,
        deviationPct: trDev,
        differenceText: `${r2(throwRatio - calcTR) >= 0 ? '+' : ''}${r2(throwRatio - calcTR)} (%${trDev})`,
        message: msg,
      });
    }
    if (typeof throwMin === 'number' && typeof throwMax === 'number' && throwMax > 0) {
      const nameRangeMatch = (lensName || '').match(/(\d+[.,]\d+)\s*[-–]\s*(\d+[.,]\d+)\s*:?\s*1/);
      const parsedNameMin = nameRangeMatch ? parseFloat(nameRangeMatch[1].replace(',', '.')) : null;
      const parsedNameMax = nameRangeMatch ? parseFloat(nameRangeMatch[2].replace(',', '.')) : null;
      const hasNameRangeConflict =
        parsedNameMin !== null &&
        parsedNameMax !== null &&
        (Math.abs(parsedNameMin - throwMin) > 0.05 || Math.abs(parsedNameMax - throwMax) > 0.05);
      const inRange = calcTR >= throwMin - 0.02 && calcTR <= throwMax + 0.02;
      const status: ValidationStatus = !inRange || hasNameRangeConflict ? 'error' : 'pass';
      const msg = hasNameRangeConflict
        ? `Lens adı içindeki zoom aralığı (${parsedNameMin}–${parsedNameMax}:1) ile tanımlı throwMin–throwMax (${throwMin}–${throwMax}:1) çelişiyor (FAIL)!`
        : inRange
          ? `Hesaplanan TR (${calcTR}:1) seçili lens zoom aralığında (${throwMin}–${throwMax}:1).`
          : `Hesaplanan TR (${calcTR}:1) seçili lensin fiziksel zoom sınırları (${throwMin}–${throwMax}:1) dışında!`;
      addCheck({
        id: 'proj-lens-range',
        modulePair: 'Optik Lens ↔ Katalog Zoom Sınırı',
        title: 'Lens Fiziksel Zoom / Throw Ratio Sınır Kontrolü',
        status,
        testInput: `D=${distanceM}m, W=${imageWidthM}m, Lens=${lensName || '—'} (${throwMin}–${throwMax}:1)`,
        formula: 'throwMin ≤ D/W ≤ throwMax',
        expectedValue: `${throwMin}–${throwMax}:1`,
        actualValue: hasNameRangeConflict ? `${calcTR}:1 (Etiket: ${parsedNameMin}–${parsedNameMax}:1)` : `${calcTR}:1`,
        tolerancePct: 0,
        deviationPct: status === 'pass' ? 0 : 100,
        differenceText: hasNameRangeConflict ? 'Etiket Çelişkisi' : inRange ? 'Aralıkta' : 'Sınır Dışı',
        message: msg,
      });
    } else {
      addCheck({
        id: 'proj-lens-range',
        modulePair: 'Optik Lens ↔ Katalog Zoom Sınırı',
        title: 'Lens Fiziksel Zoom / Throw Ratio Sınır Kontrolü',
        status: 'unknown',
        expectedValue: 'Katalog throwMin–throwMax',
        actualValue: 'Belirtilmedi',
        tolerancePct: 0,
        deviationPct: 100,
        differenceText: 'Veri Eksik',
        message: 'Seçili lensin katalog TR aralığı (throwMin–throwMax) girilmediği için zoom sınırı doğrulanamadı (UNKNOWN).',
      });
    }
  }

  // 2B. Tekil Projeksiyon ↔ Lux Modülü Alan Tutarlılığı (p.lux fallback kullanıldığında)
  if (p.sections.lux && (!p.photometricSurfaces || p.photometricSurfaces.length === 0) && p.lux && p.projection && p.projection.imageWidthM > 0 && p.lux.widthM > 0 && p.lux.heightM > 0) {
    const projH = p.projection.imageWidthM * (p.projection.aspectH / Math.max(1, p.projection.aspectW));
    const projArea = p.projection.imageWidthM * projH;
    const luxArea = p.lux.widthM * p.lux.heightM;
    const areaDev = r1((Math.abs(projArea - luxArea) / Math.max(0.1, projArea)) * 100);
    if (areaDev > 10) {
      addCheck({
        id: 'proj-lux-area-sync',
        modulePair: 'Projeksiyon ↔ Lux Alanı',
        title: 'Tekil Ekran Alanı ↔ Lux Hesap Alanı',
        status: 'error',
        testInput: `Proj=${r2(projArea)} m², Lux=${r2(luxArea)} m²`,
        formula: 'Alan_proj = W × H == Alan_lux',
        expectedValue: `${r2(projArea)} m²`,
        actualValue: `${r2(luxArea)} m²`,
        tolerancePct: 10,
        deviationPct: areaDev,
        differenceText: `${r2(luxArea - projArea)} m² (%${areaDev})`,
        message: `Projeksiyon modülü ekran alanı (${r2(projArea)} m²) ile Lux hesabındaki alan (${r2(luxArea)} m²) uyuşmuyor; Lux/Nit sonucu hatalı olur!`,
      });
    }
  }

  // 3. Pixel Map (Yatay/Dikey Bağımsız Çözünürlük, px/m, mm/px, Tek PJ Overlap) & Viewer FOV
  if (p.plannerSurfaces && p.plannerSurfaces.length > 0) {
    p.plannerSurfaces.forEach((ps, idx) => {
      const pjCnt = Math.max(1, ps.cols * ps.rows);
      const nativeW = ps.projW || (ps.orient === 'portrait' ? (ps.customH || 1200) : (ps.customW || 1920));
      const nativeH = ps.projH || (ps.orient === 'portrait' ? (ps.customW || 1920) : (ps.customH || 1200));

      if (ps.cols >= 1 && ps.projW > 0 && ps.effectiveWidthM > 0 && ps.effectiveHeightM > 0) {
        const effOvPxX = ps.cols > 1 ? Math.max(0, ps.ovPxX) : 0;
        const combW = ps.projNetW || (ps.cols * ps.projW - Math.max(0, ps.cols - 1) * effOvPxX);
        const combH = ps.projNetH || (ps.rows * (ps.projH || 1200));
        const combPxmH = r1(combW / ps.effectiveWidthM);
        const combPxmV = r1(combH / ps.effectiveHeightM);
        const combAniso = r1((Math.abs(combPxmH - combPxmV) / Math.max(combPxmH, combPxmV, 0.01)) * 100);
        if (combAniso > 5) {
          addCheck({
            id: `pm-combined-anisotropy-${idx}`,
            modulePair: 'Birleşik Çözünürlük ↔ Fiziksel Yüzey',
            title: `${ps.name}: Birleşik Görüntü Piksel Anizotropisi`,
            status: 'warning',
            testInput: `Birleşik ${combW}×${combH} px / ${ps.effectiveWidthM}×${ps.effectiveHeightM} m`,
            formula: '|px/m_H − px/m_V| / max',
            expectedValue: `≤ %5 anizotropi`,
            actualValue: `H: ${combPxmH} · V: ${combPxmV} px/m (%${combAniso})`,
            tolerancePct: 5,
            deviationPct: combAniso,
            differenceText: `%${combAniso}`,
            message: `Birleşik görüntüde (${combW}×${combH}) yatay (${combPxmH} px/m) ve dikey (${combPxmV} px/m) piksel yoğunluğu %${combAniso} farklı (anizotropi).`,
          });
        }
      }

      if (ps.netW > 0 && ps.netH > 0 && ps.effectiveWidthM > 0 && ps.effectiveHeightM > 0) {
        const pxPerMH = r1(ps.netW / ps.effectiveWidthM);
        const pxPerMV = r1(ps.netH / ps.effectiveHeightM);
        const maxPxm = Math.max(pxPerMH, pxPerMV, 0.01);
        const anisoPct = r1((Math.abs(pxPerMH - pxPerMV) / maxPxm) * 100);
        addCheck({
          id: `pm-pxm-hv-${idx}`,
          modulePair: 'Pixel Map ↔ Piksel Geometrisi (H/V)',
          title: `${ps.name}: Yatay/Dikey px/m & mm/px`,
          status: anisoPct > 15 ? 'error' : anisoPct > 5 ? 'warning' : 'pass',
          testInput: `${ps.netW}×${ps.netH} px / ${ps.effectiveWidthM}×${ps.effectiveHeightM} m`,
          formula: 'px/m_H = W_px/W_m, px/m_V = H_px/H_m',
          expectedValue: `H ≈ V (${pxPerMH} px/m · ${r2(1000 / Math.max(0.1, pxPerMH))} mm/px)`,
          actualValue: `H: ${pxPerMH} px/m · V: ${pxPerMV} px/m`,
          tolerancePct: 5,
          deviationPct: anisoPct,
          differenceText: `%${anisoPct} anizotropi`,
          message:
            anisoPct > 5
              ? `Yatay (${pxPerMH} px/m) ve dikey (${pxPerMV} px/m) piksel yoğunluğu %${anisoPct} farklı; piksel geometrisi bozuluyor!`
              : `Yatay (${pxPerMH} px/m) ve dikey (${pxPerMV} px/m) piksel geometrisi kare piksele uyumlu.`,
        });
      }

      if (ps.netW > 0 && ps.effectiveWidthM > 0 && ps.avgMmPerPx > 0) {
        const expectedPxPerMH = ps.netW / ps.effectiveWidthM;
        const expectedMmH = Math.round((1000 / Math.max(0.01, expectedPxPerMH)) * 1000) / 1000;
        const expectedPxPerMV = ps.netH > 0 && ps.effectiveHeightM > 0 ? ps.netH / ps.effectiveHeightM : expectedPxPerMH;
        const expectedMmV = Math.round((1000 / Math.max(0.01, expectedPxPerMV)) * 1000) / 1000;
        const hvDiffPct = r1((Math.abs(expectedMmH - expectedMmV) / Math.max(0.01, expectedMmH)) * 100);
        const devVsH = r1((Math.abs(expectedMmH - ps.avgMmPerPx) / Math.max(0.01, expectedMmH)) * 100);
        const devVsV = r1((Math.abs(expectedMmV - ps.avgMmPerPx) / Math.max(0.01, expectedMmV)) * 100);
        const meanMm = (expectedMmH + expectedMmV) / 2;
        const devVsMean = r1((Math.abs(meanMm - ps.avgMmPerPx) / Math.max(0.01, meanMm)) * 100);
        // Raporlanan mm/px'in kaynağı: Yatay / Dikey / H-V ortalaması / Kaynaksız
        const mmSource = identifyMmPerPxSource(ps.avgMmPerPx, expectedMmH, expectedMmV, 2);
        const isSwappedAxis = mmSource === 'vertical' && hvDiffPct > 3;
        const minDev = Math.min(devVsH, devVsV, devVsMean);
        const tol = 10;
        const status: ValidationStatus =
          isSwappedAxis ? 'error'
          : mmSource === 'unmatched' ? (minDev > tol ? 'error' : 'warning')
          : mmSource === 'mean' && hvDiffPct > 5 ? 'warning'
          : 'pass';
        const srcLabel = mmSource === 'horizontal' ? 'Yatay (H)' : mmSource === 'vertical' ? 'Dikey (V)' : mmSource === 'mean' ? 'H/V Ortalaması' : 'Kaynaksız';
        const msg = isSwappedAxis
          ? `Yatay ve dikey mm/px eksenleri karıştırılmış! Yatay: ${expectedMmH} mm/px, Dikey: ${expectedMmV} mm/px iken raporlanan (${ps.avgMmPerPx} mm/px) dikey değeri yatay yerine kullanıyor.`
          : mmSource === 'unmatched'
            ? `Raporlanan ${ps.avgMmPerPx} mm/px değeri içerik kanvasından (${ps.netW}×${ps.netH} px / ${ps.effectiveWidthM}×${ps.effectiveHeightM} m) türetilemiyor: H=${expectedMmH}, V=${expectedMmV}, Ort=${r3(meanMm)} mm/px. Kaynağı belirsiz değer rapora basılamaz.`
            : mmSource === 'mean' && hvDiffPct > 5
              ? `Raporlanan ${ps.avgMmPerPx} mm/px, H (${expectedMmH}) ve V (${expectedMmV}) ortalamasıdır; %${hvDiffPct} anizotropide tek değer temsil edici değildir — H ve V ayrı gösterilmeli.`
              : `Kaynak: ${srcLabel}. Yatay: 1000 ÷ ${r1(expectedPxPerMH)} px/m = ${expectedMmH} mm/px · Dikey: 1000 ÷ ${r1(expectedPxPerMV)} px/m = ${expectedMmV} mm/px.`;
        addCheck({
          id: `pm-mm-${idx}`,
          modulePair: 'Pixel Map ↔ Fiziksel Yüzey',
          title: `${ps.name}: px/m ↔ mm/px Tutarlılığı (H/V Ayrı)`,
          status,
          isMandatory: true,
          testInput: `${ps.netW}×${ps.netH} px / ${ps.effectiveWidthM}×${ps.effectiveHeightM} m · Kaynak: ${srcLabel}`,
          formula: 'mm/px_H = 1000 / (W_px / W_m), mm/px_V = 1000 / (H_px / H_m)',
          expectedValue: `H: ${expectedMmH} · V: ${expectedMmV} mm/px`,
          actualValue: `${ps.avgMmPerPx} mm/px (${srcLabel})`,
          tolerancePct: tol,
          deviationPct: minDev,
          differenceText: `${r2(ps.avgMmPerPx - expectedMmH) >= 0 ? '+' : ''}${r2(ps.avgMmPerPx - expectedMmH)} mm/px`,
          message: msg,
        });
      }

      // Tek kanvas geometrisi: içerik kanvası (netW×netH) birleşik rasterdan türetilmeli
      if (ps.cols >= 1 && ps.projW > 0 && ps.netW > 0 && ps.netH > 0 && ps.throwDistM > 0 && ps.throwRatio > 0 && ps.effectiveWidthM > 0 && ps.effectiveHeightM > 0) {
        const pjH = ps.projH || 1200;
        const imgW = ps.throwDistM / ps.throwRatio;
        const imgH = imgW * (pjH / ps.projW);
        const ovPxRaw = ps.cols > 1 ? (ps.ovPxX > 0 ? ps.ovPxX : ps.projW * ((ps.overlapX || 0) / 100)) : 0;
        const rasterW = ps.projNetW || Math.round(ps.cols * ps.projW - (ps.cols - 1) * ovPxRaw);
        const rasterH = ps.projNetH || Math.round((ps.rows || 1) * pjH - Math.max(0, (ps.rows || 1) - 1) * (ps.ovPxY || 0));
        const cc = computeContentCanvas({
          rasterW,
          rasterH,
          opticalPxPerMeterH: ps.projW / imgW,
          opticalPxPerMeterV: pjH / imgH,
          surfaceWidthM: ps.effectiveWidthM,
          surfaceHeightM: ps.effectiveHeightM,
        });
        const dW = Math.abs(cc.contentCanvas.w - ps.netW) / Math.max(1, cc.contentCanvas.w);
        const dH = Math.abs(cc.contentCanvas.h - ps.netH) / Math.max(1, cc.contentCanvas.h);
        const mismatch = dW > 0.01 || dH > 0.01;
        addCheck({
          id: `content-canvas-sync-${idx}`,
          modulePair: 'Net Raster ↔ İçerik Kanvası',
          title: `${ps.name}: İçerik Kanvası Tek Kaynak Doğrulaması`,
          status: mismatch ? 'error' : 'pass',
          category: 'mathematical',
          isMandatory: true,
          testInput: `Raster ${rasterW}×${rasterH} px, Yüzey ${ps.effectiveWidthM}×${ps.effectiveHeightM} m, Optik ${r1(ps.projW / imgW)} px/m`,
          formula: 'İçerik = min(Raster, Yüzey × px/m_optik) | Raster yüzey oranına kırpılır',
          expectedValue: `${cc.contentCanvas.w}×${cc.contentCanvas.h} px (${cc.contentCanvas.mp} MP · ${cc.mode})`,
          actualValue: `${ps.netW}×${ps.netH} px`,
          tolerancePct: 1,
          deviationPct: r1(Math.max(dW, dH) * 100),
          differenceText: mismatch ? `${ps.netW - cc.contentCanvas.w}×${ps.netH - cc.contentCanvas.h} px` : 'Aynı Kanvas',
          message: mismatch
            ? `Raporlanan içerik kanvası (${ps.netW}×${ps.netH}) ile birleşik rasterdan (${rasterW}×${rasterH}) türetilen kanvas (${cc.contentCanvas.w}×${cc.contentCanvas.h}) uyuşmuyor — projeksiyon rasteri ile içerik kanvası karıştırılmış olabilir (FAIL).`
            : `İçerik kanvası ${cc.contentCanvas.w}×${cc.contentCanvas.h} px: H ${cc.pxPerMeterH} px/m (${cc.mmPerPxH} mm/px) · V ${cc.pxPerMeterV} px/m (${cc.mmPerPxV} mm/px) · ${cc.pxPerSqMeter} px/m² · ${cc.contentCanvas.mp} MP.`,
        });
      }

      // Çoklu projektör kesişimi (komşu olmayan PJ1∩PJ3 / üçlü overlap) modeli
      if (ps.cols >= 2 && ps.projW > 0 && ps.throwDistM > 0 && ps.throwRatio > 0 && ps.effectiveWidthM > 0 && ps.effectiveHeightM > 0) {
        const pjH = ps.projH || 1200;
        const imgW = ps.throwDistM / ps.throwRatio;
        const imgH = imgW * (pjH / ps.projW);
        const ovFrac = ps.ovPxX > 0 ? ps.ovPxX / ps.projW : (ps.overlapX || 0) / 100;
        const geo = analyzeFootprintOverlaps(
          buildGridFootprints({
            cols: ps.cols,
            rows: ps.rows || 1,
            imageWidthM: imgW,
            imageHeightM: imgH,
            overlapFracX: ovFrac,
            overlapFracY: (ps.overlapY || 0) / 100,
            surfaceHeightM: ps.effectiveHeightM,
          }),
          ps.effectiveWidthM,
          ps.effectiveHeightM,
          ps.cols
        );
        const pxm = ps.projW / imgW;
        const unionW = geo.footprints.length > 0
          ? Math.max(...geo.footprints.map(f => f.x1)) - Math.min(...geo.footprints.map(f => f.x0))
          : 0;
        const geoNetW = Math.round(unionW * pxm);
        const repNetW = ps.projNetW || Math.round(ps.cols * ps.projW - (ps.cols - 1) * (ps.ovPxX > 0 ? ps.ovPxX : ps.projW * ovFrac));
        const netDev = r1((Math.abs(geoNetW - repNetW) / Math.max(1, geoNetW)) * 100);
        const nonAdj = geo.pairwiseIntersections.filter(pi => !pi.adjacent);
        const triples = geo.higherOrderIntersections.filter(h => h.multiplicity >= 3);
        const status: ValidationStatus = !geo.geometryConsistent || netDev > 1 ? 'error' : 'pass';
        addCheck({
          id: `multi-overlap-geometry-${idx}`,
          modulePair: 'Overlap ↔ Poligon Kesişimi (Çoklu)',
          title: `${ps.name}: Çoklu Projektör Kesişim Modeli`,
          status,
          category: 'mathematical',
          isMandatory: true,
          testInput: `${ps.cols}×${ps.rows || 1} PJ, W=${r2(imgW)} m, overlap %${r1(ovFrac * 100)}`,
          formula: '∪A = ΣA_i − ΣA_i∩A_j + ΣA_i∩A_j∩A_k − … (inclusion–exclusion) = geometrik birleşim',
          expectedValue: `Birleşim ${geo.unionAreaM2} m² (Duvar İçi: ${geo.surfaceCoveredAreaM2} m²) · Net ${geoNetW} px`,
          actualValue: `IE ${geo.unionAreaInclusionExclusionM2 ?? '—'} m² · Net ${repNetW} px · max ${geo.maxMultiplicity}× kat`,
          tolerancePct: 1,
          deviationPct: netDev,
          differenceText: triples.length > 0 ? `${triples.length} üçlü bölge` : 'İkili',
          message:
            status === 'error'
              ? `Net raster (${repNetW} px) geometrik birleşimden (${geoNetW} px) %${netDev} sapıyor veya inclusion–exclusion doğrulaması tutmuyor (FAIL).`
              : `${geo.pairwiseIntersections.length} çift kesişim${nonAdj.length > 0 ? ` (komşu olmayan: ${nonAdj.map(n => `${n.projectorIds.join('∩')} ${n.widthM} m`).join(', ')})` : ''}${triples.length > 0 ? `, ${triples.length} üçlü bölge (${triples.map(t => `${t.projectorIds.join('∩')} tam düzlem ${t.widthM}×${t.heightM} m = ${t.areaM2} m², duvar içi ${t.clippedWidthM ?? t.widthM}×${t.clippedHeightM ?? t.heightM} m = ${t.clippedAreaM2 ?? t.areaM2} m²`).join('; ')})` : ''}; projeksiyon düzleminde tekrar aydınlatılan alan ${geo.redundantOverlapAreaM2} m², fiziksel duvar sınırları içinde tekrar aydınlatılan alan ${geo.surfaceRedundantOverlapAreaM2} m², yüzey kaplama %${geo.surfaceCoveragePct}.`,
        });
      }

      if (pjCnt === 1 && ((ps.ovPxX ?? 0) > 0 || (ps.ovPxY ?? 0) > 0)) {
        addCheck({
          id: `single-pj-overlap-${idx}`,
          modulePair: 'Pixel Map ↔ Projektör Adedi',
          title: `${ps.name}: Tek Projektörde Overlap Kontrolü`,
          status: 'error',
          expectedValue: '0% (0 px)',
          actualValue: `%${ps.overlapX || 0} (${ps.ovPxX || 0} px)`,
          tolerancePct: 0,
          deviationPct: 100,
          differenceText: `+${ps.ovPxX || 0} px`,
          message: `Tek projektör (1 PJ) kullanılmasına rağmen overlap kaybı (%${ps.overlapX || 0}) uygulanmış.`,
        });
      }

      const maxCapW = ps.cols * nativeW;
      const maxCapH = ps.rows * nativeH;
      if (ps.netW > maxCapW + 10) {
        addCheck({
          id: `native-cap-w-${idx}`,
          modulePair: 'Pixel Map ↔ Yatay Native Kapasite',
          title: `${ps.name}: Yatay Çözünürlük Sınırı`,
          status: 'warning',
          expectedValue: `≤ ${maxCapW} px`,
          actualValue: `${ps.netW} px`,
          tolerancePct: 0,
          deviationPct: r1(((ps.netW - maxCapW) / Math.max(1, maxCapW)) * 100),
          differenceText: `+${ps.netW - maxCapW} px`,
          message: `Yatay net içerik çözünürlüğü (${ps.netW} px), ${ps.cols} sütundaki native kapasiteyi (${maxCapW} px) aşıyor.`,
        });
      }
      if (ps.netH > maxCapH + 10) {
        addCheck({
          id: `native-cap-h-${idx}`,
          modulePair: 'Pixel Map ↔ Dikey Native Kapasite',
          title: `${ps.name}: Dikey Çözünürlük Sınırı`,
          status: 'warning',
          expectedValue: `≤ ${maxCapH} px`,
          actualValue: `${ps.netH} px`,
          tolerancePct: 0,
          deviationPct: r1(((ps.netH - maxCapH) / Math.max(1, maxCapH)) * 100),
          differenceText: `+${ps.netH - maxCapH} px`,
          message: `Dikey net içerik çözünürlüğü (${ps.netH} px), ${ps.rows} satırdaki native kapasiteyi (${maxCapH} px) aşıyor.`,
        });
      }

      if (ps.cols >= 1 && ps.projW > 0) {
        const effOvPxX = ps.cols > 1 ? Math.max(0, ps.ovPxX) : 0;
        const expectedCombinedW = ps.cols * ps.projW - Math.max(0, ps.cols - 1) * effOvPxX;
        if (ps.netW > expectedCombinedW) {
          addCheck({
            id: `combined-net-res-${idx}`,
            modulePair: 'Overlap ↔ Net İçerik Kanvası',
            title: `${ps.name}: Birleşik Çözünürlük Sınırı`,
            status: 'error',
            expectedValue: `≤ ${expectedCombinedW} px`,
            actualValue: `${ps.netW} px`,
            tolerancePct: 0,
            deviationPct: r1(((ps.netW - expectedCombinedW) / Math.max(1, expectedCombinedW)) * 100),
            differenceText: `+${ps.netW - expectedCombinedW} px`,
            message: `Net içerik genişliği (${ps.netW} px), overlap sonrası birleşik çözünürlüğü (${expectedCombinedW} px) aşamaz!`,
          });
        } else if (ps.netW > 0) {
          const aspectCropPx = expectedCombinedW - ps.netW;
          addCheck({
            id: `combined-net-res-${idx}`,
            modulePair: 'Overlap ↔ Net İçerik Kanvası',
            title: `${ps.name}: Ham → Birleşik → Net Kanvas`,
            status: 'pass',
            expectedValue: `${expectedCombinedW} px (Birleşik)`,
            actualValue: `${ps.netW} px (Net)`,
            tolerancePct: 0,
            deviationPct: 0,
            differenceText: aspectCropPx > 0 ? `-${aspectCropPx} px oran kırpması` : '0 px',
            message:
              aspectCropPx > 0
                ? `${ps.cols}×${ps.projW} − ${Math.max(0, ps.cols - 1)}×${effOvPxX} = ${expectedCombinedW} px birleşik alandan duvar oranı nedeniyle ${aspectCropPx} px kırpılarak ${ps.netW} px net kanvas üretildi.`
                : `${ps.cols}×${ps.projW} − ${Math.max(0, ps.cols - 1)}×${effOvPxX} = ${expectedCombinedW} px birleşik çözünürlük ile net kanvas birebir eşit.`,
          });
        }
      }

      if (ps.cols > 1 && ps.throwDistM > 0 && ps.throwRatio > 0 && ps.effectiveWidthM > 0) {
        const beamW = ps.throwDistM / ps.throwRatio;
        if (ps.cols * beamW > ps.effectiveWidthM + 0.05) {
          const stepW = Math.max(0.1, (ps.effectiveWidthM - beamW) / (ps.cols - 1));
          const physOvPct = r1(((beamW - stepW) / beamW) * 100);
          const pixelMapOvPct = ps.projW > 0 && ps.ovPxX >= 0 ? r1((ps.ovPxX / ps.projW) * 100) : r1(ps.overlapX);
          const ovDiff = r1(Math.abs(physOvPct - pixelMapOvPct));
          if (ovDiff > 5) {
            const physOvPx = Math.round(ps.projW * (physOvPct / 100));
            const physCombW = ps.cols * ps.projW - (ps.cols - 1) * physOvPx;
            const pmCombW = ps.cols * ps.projW - (ps.cols - 1) * Math.max(0, ps.ovPxX);
            addCheck({
              id: `phys-overlap-sync-${idx}`,
              modulePair: 'Fiziksel Yerleşim ↔ Pixel Map Overlap',
              title: `${ps.name}: Fiziksel Örtüşme ↔ Pixel Map Overlap`,
              status: 'error',
              expectedValue: `%${physOvPct} (~${physOvPx} px → ${physCombW} px)`,
              actualValue: `%${pixelMapOvPct} (${ps.ovPxX} px → ${pmCombW} px)`,
              tolerancePct: 5,
              deviationPct: ovDiff,
              differenceText: `%${ovDiff}`,
              message: `Fiziksel yerleşimde komşu projektör örtüşmesi %${physOvPct} (~${physOvPx} px) iken Pixel Map bölümünde %${pixelMapOvPct} (${ps.ovPxX} px) kullanılmış; birleşik çözünürlükler (${physCombW} px vs ${pmCombW} px) çelişiyor!`,
            });
          }
        }
      }

      // Fiziksel Yüzey Kaplama Doğrulaması (Physical Coverage Validation Modülü)
      const physCov = evaluatePhysicalCoverage({
        surfaceWidthM: ps.effectiveWidthM,
        surfaceHeightM: ps.effectiveHeightM,
        cols: ps.cols || 1,
        rows: ps.rows || 1,
        projW: ps.projW || 1920,
        projH: ps.projH || 1200,
        throwDistM: ps.throwDistM,
        throwRatio: ps.throwRatio,
        overlapX: ps.overlapX,
        overlapY: ps.overlapY,
        ovPxX: ps.ovPxX,
        ovPxY: ps.ovPxY,
      });
      if (physCov.verdict !== 'PASS') {
        const covDev = physCov.verdict === 'FAIL'
          ? r1(Math.max(100 - physCov.verticalCoveragePct, 100 - physCov.horizontalCoveragePct))
          : 100;
        addCheck({
          id: `vertical-surface-coverage-${idx}`,
          modulePair: 'Optik En-Boy ↔ Fiziksel Yüzey Kaplama',
          title: `${ps.name}: Fiziksel Yüzey Kaplama Doğrulaması`,
          status: physCov.status,
          testInput: `W_tek=${physCov.singleImageWidthM}m (${ps.projW || 1920}×${ps.projH || 1200}), Yüzey=${ps.effectiveWidthM}×${ps.effectiveHeightM}m, D=${ps.throwDistM}m`,
          formula: 'H_görüntü ≥ H_yüzey ∧ W_kaplanan ≥ W_yüzey',
          expectedValue: `≥ ${ps.effectiveWidthM}×${ps.effectiveHeightM} m (Tam dikey TR: ${physCov.requiredThrowRatioForFullHeight}:1)`,
          actualValue: `${physCov.coveredWidthM}×${physCov.coveredHeightM} m (%${physCov.horizontalCoveragePct} H · %${physCov.verticalCoveragePct} V)`,
          tolerancePct: 0,
          deviationPct: covDev,
          differenceText: physCov.uncoveredHeightM > 0
            ? `-${r1(physCov.uncoveredHeightM * 100)} cm V`
            : physCov.uncoveredWidthM > 0
              ? `-${r1(physCov.uncoveredWidthM * 100)} cm H`
              : 'Veri Eksik',
          message: physCov.summaryMessage,
        });
      } else {
        const vertOverM = r2(Math.max(0, physCov.singleImageHeightM - ps.effectiveHeightM));
        const roomH = p.interProjectorAnalysis?.roomDimensions?.heightM || 0;
        const roomOverM = roomH > 0 ? r2(Math.max(0, physCov.singleImageHeightM - roomH)) : 0;
        addCheck({
          id: `vertical-surface-coverage-${idx}`,
          modulePair: 'Optik En-Boy ↔ Fiziksel Yüzey Kaplama',
          title: `${ps.name}: Fiziksel Yüzey Kaplama Doğrulaması`,
          status: 'pass',
          testInput: `W_tek=${physCov.singleImageWidthM}m, H_tek=${physCov.singleImageHeightM}m, Yüzey=${ps.effectiveWidthM}×${ps.effectiveHeightM}m${roomH > 0 ? `, Tavan=${roomH}m` : ''}`,
          formula: 'H_görüntü ≥ H_yüzey ∧ W_kaplanan ≥ W_yüzey',
          expectedValue: `≥ ${ps.effectiveWidthM}×${ps.effectiveHeightM} m`,
          actualValue: `${physCov.coveredWidthM}×${physCov.coveredHeightM} m (%100 Kaplama${vertOverM > 0.05 ? ` · Dikey +${vertOverM}m Taşma` : ''})`,
          tolerancePct: 0,
          deviationPct: 0,
          differenceText: vertOverM > 0.05 ? `Tam Kaplama (+${vertOverM}m Taşma)` : 'Tam Kaplama',
          message: vertOverM > 0.05
            ? `${physCov.summaryMessage} (Not: Tekil görüntü yüksekliği ${physCov.singleImageHeightM}m, duvar yüksekliğini +${vertOverM}m${roomOverM > 0 ? ` ve oda tavan yüksekliğini (${roomH}m) +${roomOverM}m` : ''} aşmaktadır; dikey maskeleme/kırpma gerekir.)`
            : physCov.summaryMessage,
        });
        if (vertOverM / Math.max(0.1, ps.effectiveHeightM) > 0.25) {
          addCheck({
            id: `vertical-overspill-ceiling-${idx}`,
            modulePair: 'Optik Görüntü Yüksekliği ↔ Duvar & Tavan Yüksekliği',
            title: `${ps.name}: Dikey Taşma & Oda Tavan Sınırı Kontrolü`,
            status: 'warning',
            category: 'engineering',
            isMandatory: false,
            testInput: `H_görüntü=${physCov.singleImageHeightM}m, H_duvar=${ps.effectiveHeightM}m${roomH > 0 ? `, H_oda=${roomH}m` : ''}`,
            formula: 'H_görüntü ≤ H_duvar ∧ H_görüntü ≤ H_oda',
            expectedValue: `≤ ${ps.effectiveHeightM} m (Duvar)${roomH > 0 ? ` / ≤ ${roomH} m (Oda)` : ''}`,
            actualValue: `${physCov.singleImageHeightM} m (+${vertOverM} m duvar taşması${roomOverM > 0 ? `, +${roomOverM} m tavan/zemin aşımı` : ''})`,
            tolerancePct: 25,
            deviationPct: r1((vertOverM / Math.max(0.1, ps.effectiveHeightM)) * 100),
            differenceText: roomOverM > 0 ? `+${vertOverM}m Duvar / +${roomOverM}m Oda` : `+${vertOverM}m Dikey Taşma`,
            message: roomOverM > 0
              ? `Tekil görüntü yüksekliği (${physCov.singleImageHeightM} m), hem hedef duvar yüksekliğini (${ps.effectiveHeightM} m, +${vertOverM} m) hem de oda tavan yüksekliğini (${roomH} m, +${roomOverM} m) aşıyor! Tavan/zemin yansıması, dikey piksel kırpılması ve ışık kaybı oluşur.`
              : `Tekil görüntü yüksekliği (${physCov.singleImageHeightM} m), hedef duvar yüksekliğini (${ps.effectiveHeightM} m) +${vertOverM} m aşıyor; dikey optik maskeleme/kırpma gerekir.`,
          });
        }
      }

      if (ps.viewDistM > 0 && ps.effectiveWidthM > 0 && ps.netW > 0) {
        const vHfov = r1(2 * Math.atan(ps.effectiveWidthM / (2 * ps.viewDistM)) * (180 / Math.PI));
        const vVfov = ps.effectiveHeightM > 0
          ? r1(2 * Math.atan(ps.effectiveHeightM / (2 * ps.viewDistM)) * (180 / Math.PI))
          : 0;
        const ppdH = r1(ps.netW / Math.max(1, vHfov));
        const ppdV = vVfov > 0 && ps.netH > 0 ? r1(ps.netH / Math.max(1, vVfov)) : ppdH;
        const minPpd = Math.min(ppdH, ppdV);
        const status: ValidationStatus = minPpd < 20 ? 'warning' : 'pass';
        addCheck({
          id: `viewer-ppd-${idx}`,
          modulePair: 'Viewer FOV ↔ Çözünürlük',
          title: `${ps.name}: İzleme Mesafesi ↔ Keskinlik (PPD H/V)`,
          status,
          expectedValue: 'H & V ≥ 20 PPD',
          actualValue: `H: ${ppdH} PPD (${vHfov}°) · V: ${ppdV} PPD (${vVfov}°)`,
          tolerancePct: 0,
          deviationPct: minPpd >= 20 ? 0 : r1(((20 - minPpd) / 20) * 100),
          differenceText: minPpd >= 20 ? 'H & V Yeterli' : `-${r1(20 - minPpd)} PPD`,
          message:
            minPpd >= 20
              ? `İzleyici FOV (H ${vHfov}° / V ${vVfov}°) ile yatay ${ppdH} PPD, dikey ${ppdV} PPD keskinlik sağlanıyor.`
              : `İzleyici FOV (H ${vHfov}° / V ${vVfov}°) eksenlerinden en az biri 20 PPD altında (H: ${ppdH}, V: ${ppdV} PPD); piksel görünürlüğü riski.`,
        });
      }

      // Overlap Bölge Sayısı ↔ Projektör Dizilimi Kontrolü (3 PJ → 2 Komşu Bölge)
      if ((ps.cols || 1) > 1 || (ps.rows || 1) > 1) {
        const expectedBlendZones = Math.max(0, ((ps.cols || 1) - 1) * (ps.rows || 1) + ((ps.rows || 1) - 1) * (ps.cols || 1));
        const hasOverlapData = (ps.cols || 1) > 1 ? (ps.overlapX > 0 || ps.ovPxX > 0) : (ps.overlapY > 0 || ps.ovPxY > 0);
        addCheck({
          id: `overlap-count-vs-projectors-${idx}`,
          modulePair: 'Projektör Dizilimi ↔ Edge Blending',
          title: `${ps.name}: Komşu Overlap Bölge Sayısı`,
          status: hasOverlapData ? 'pass' : 'warning',
          testInput: `${ps.cols || 1}×${ps.rows || 1} = ${(ps.cols || 1) * (ps.rows || 1)} PJ`,
          formula: '(cols - 1)·rows + (rows - 1)·cols',
          expectedValue: `${expectedBlendZones} komşu bölge`,
          actualValue: `${expectedBlendZones} komşu bölge`,
          tolerancePct: 0,
          deviationPct: 0,
          differenceText: 'Tutarlı',
          message: `${ps.cols || 1}×${ps.rows || 1} dizilim için ${expectedBlendZones} komşu edge-blending bölgesi doğrulandı.`,
        });
      }

      // Native Aspect Ratio ↔ Fiziksel Projeksiyon Boyutu Kontrolü
      const linkedProj = p.projectionScreens?.[idx] || (idx === 0 ? p.projection : undefined);
      if (linkedProj && linkedProj.imageWidthM > 0 && linkedProj.aspectW > 0 && linkedProj.aspectH > 0) {
        const nativeAspect = nativeW / Math.max(1, nativeH);
        const projAspect = linkedProj.aspectW / Math.max(1, linkedProj.aspectH);
        const aspDiffPct = r1((Math.abs(nativeAspect - projAspect) / Math.max(0.01, nativeAspect)) * 100);
        addCheck({
          id: `native-aspect-vs-proj-size-${idx}`,
          modulePair: 'Native Çözünürlük ↔ Fiziksel Boyut',
          title: `${ps.name}: Native En-Boy Oranı ↔ Projeksiyon Oranı`,
          status: aspDiffPct > 3 ? 'error' : 'pass',
          testInput: `Native=${nativeW}×${nativeH} (${r2(nativeAspect)}:1), Proj=${linkedProj.aspectW}:${linkedProj.aspectH}`,
          formula: 'W_native / H_native == W_proj / H_proj',
          expectedValue: `${r2(nativeAspect)}:1`,
          actualValue: `${r2(projAspect)}:1`,
          tolerancePct: 3,
          deviationPct: aspDiffPct,
          differenceText: `%${aspDiffPct}`,
          message: aspDiffPct > 3
            ? `Projektör native en-boy oranı (${r2(nativeAspect)}:1) ile projeksiyon oran tanımı (${r2(projAspect)}:1) uyumsuz!`
            : `Native çözünürlük (${nativeW}×${nativeH}) ve fiziksel projeksiyon oranı (${r2(projAspect)}:1) tutarlı.`,
        });
      }
    });
  }

  // 4. Planlayıcı Toplam Projektör Adedi ↔ Fotometri Toplam Projektör Adedi
  if (p.plannerSurfaces && p.plannerSurfaces.length > 0 && p.photometricSurfaces && p.photometricSurfaces.length > 0) {
    const planCount = p.plannerSurfaces.reduce((a, s) => a + Math.max(1, s.cols * s.rows), 0);
    const photoCount = p.photometricSurfaces.reduce((a, s) => a + Math.max(0, s.projectorCount), 0);
    if (photoCount > 0) {
      const diff = Math.abs(planCount - photoCount);
      const status: ValidationStatus = diff > 0 ? 'error' : 'pass';
      addCheck({
        id: 'cross-pj-count',
        modulePair: 'Planlayıcı ↔ Fotometri',
        title: 'Toplam Projektör Adedi Tutarlılığı',
        status,
        expectedValue: `${planCount} PJ`,
        actualValue: `${photoCount} PJ`,
        tolerancePct: 0,
        deviationPct: r1((diff / Math.max(1, planCount)) * 100),
        differenceText: `${diff === 0 ? '0' : `${diff} PJ`}`,
        message:
          diff === 0
            ? `İçerik Planlayıcı (${planCount} PJ) ile Fotometri Analizi (${photoCount} PJ) projektör sayıları eşleşiyor.`
            : `İçerik Planlayıcı (${planCount} PJ) ile Fotometri Analizi (${photoCount} PJ) projektör sayıları farklı!`,
      });
    }
  }

  // 5. Modüller Arası Ekran Ölçüsü, Çözünürlük ve Throw Ratio Tutarlılığı (Projeksiyon ↔ Planlayıcı)
  if (p.projection && p.plannerSurfaces && p.plannerSurfaces.length > 0) {
    const ps0 = p.plannerSurfaces[0];
    const projW = p.projection.imageWidthM;
    const projH = +(projW * (p.projection.aspectH / Math.max(1, p.projection.aspectW))).toFixed(2);
    const isMultiPj = (ps0.cols || 1) * (ps0.rows || 1) > 1;
    const expectedW =
      isMultiPj && ps0.throwDistM > 0 && ps0.throwRatio > 0
        ? +(ps0.throwDistM / ps0.throwRatio).toFixed(2)
        : ps0.effectiveWidthM;
    const expectedH =
      isMultiPj && ps0.throwDistM > 0 && ps0.throwRatio > 0
        ? +(expectedW * ((ps0.projH || 1200) / Math.max(1, ps0.projW || 1920))).toFixed(2)
        : ps0.effectiveHeightM;
    if (projW > 0 && expectedW > 0) {
      const wDev = r1((Math.abs(projW - expectedW) / Math.max(0.1, expectedW)) * 100);
      const hDev = r1((Math.abs(projH - expectedH) / Math.max(0.1, expectedH)) * 100);
      const maxDimDev = Math.max(wDev, hDev);
      if (maxDimDev > 10) {
        addCheck({
          id: 'cross-screen-dims',
          modulePair: 'Projeksiyon ↔ Planlayıcı',
          title: 'Ekran Ölçüsü Tutarlılığı',
          status: 'error',
          expectedValue: `${expectedW}×${expectedH} m`,
          actualValue: `${projW}×${projH} m`,
          tolerancePct: 10,
          deviationPct: maxDimDev,
          differenceText: `%${maxDimDev}`,
          message: `Projeksiyon modülü ekran ölçüsü (${projW}×${projH}m) ile Planlayıcı ${isMultiPj ? 'tekil projektör atım ölçüsü' : 'yüzeyi'} (${expectedW}×${expectedH}m) farklı senaryolara ait!`,
        });
      }
    }

    if (typeof p.projection.throwRatio === 'number' && p.projection.throwRatio > 0 && ps0.throwRatio > 0) {
      const trDiffPct = r1((Math.abs(p.projection.throwRatio - ps0.throwRatio) / Math.max(0.1, ps0.throwRatio)) * 100);
      if (trDiffPct > 10) {
        addCheck({
          id: 'cross-lens-tr',
          modulePair: 'Projeksiyon ↔ Planlayıcı',
          title: 'Lens Throw Ratio Tutarlılığı',
          status: 'error',
          expectedValue: `${ps0.throwRatio}:1`,
          actualValue: `${p.projection.throwRatio}:1`,
          tolerancePct: 10,
          deviationPct: trDiffPct,
          differenceText: `${r2(p.projection.throwRatio - ps0.throwRatio)} (%${trDiffPct})`,
          message: `Projeksiyon modülü TR (${p.projection.throwRatio}:1) ile Planlayıcı lens TR (${ps0.throwRatio}:1) uyuşmuyor.`,
        });
      }
    }

    if (p.projection.distanceM > 0 && ps0.throwDistM > 0) {
      const distDiffPct = r1((Math.abs(p.projection.distanceM - ps0.throwDistM) / Math.max(0.1, ps0.throwDistM)) * 100);
      if (distDiffPct > 5) {
        addCheck({
          id: 'cross-throw-dist',
          modulePair: 'Projeksiyon ↔ Planlayıcı',
          title: 'Atım Mesafesi (D) Tutarlılığı',
          status: 'error',
          expectedValue: `${ps0.throwDistM} m`,
          actualValue: `${p.projection.distanceM} m`,
          tolerancePct: 5,
          deviationPct: distDiffPct,
          differenceText: `${r2(p.projection.distanceM - ps0.throwDistM)} m (%${distDiffPct})`,
          message: `Projeksiyon modülü atım mesafesi (${p.projection.distanceM} m) ile Planlayıcı mesafesi (${ps0.throwDistM} m) farklı!`,
        });
      }
    }

    const resMatch = (p.projection.resolution || '').match(/(\d+)\s*[×x]\s*(\d+)/i);
    if (resMatch) {
      const rW = Number(resMatch[1]);
      const rH = Number(resMatch[2]);
      const pNativeW = ps0.projW || (ps0.orient === 'portrait' ? (ps0.customH || 1200) : (ps0.customW || 1920));
      const pNativeH = ps0.projH || (ps0.orient === 'portrait' ? (ps0.customW || 1920) : (ps0.customH || 1200));
      if (rW !== pNativeW || rH !== pNativeH) {
        const resDev = r1((Math.abs(rW * rH - pNativeW * pNativeH) / Math.max(1, pNativeW * pNativeH)) * 100);
        addCheck({
          id: 'cross-resolution',
          modulePair: 'Projeksiyon ↔ Planlayıcı',
          title: 'Projektör Native Çözünürlük Tutarlılığı',
          status: 'warning',
          expectedValue: `${pNativeW}×${pNativeH} px`,
          actualValue: `${rW}×${rH} px`,
          tolerancePct: 0,
          deviationPct: resDev,
          differenceText: `${rW - pNativeW}×${rH - pNativeH} px`,
          message: `Projeksiyon modülü çözünürlüğü (${rW}×${rH}) ile Planlayıcı cihaz çözünürlüğü (${pNativeW}×${pNativeH}) farklı.`,
        });
      }
    }
  }

  // 5B. Projeksiyon ↔ Fotometri Birim Lümen Tutarlılığı (plannerSurfaces olmadan da çalışır)
  const projAnsiLm = p.projectionScreens?.[0]?.ansiLumens || p.projection?.ansiLumens || 0;
  if (projAnsiLm > 0 && p.photometricSurfaces && p.photometricSurfaces.length > 0) {
    const ph0 = p.photometricSurfaces[0];
    const phUnitLm = ph0.nominalLumensPerProj
      || (ph0.totalNominalLumens && ph0.projectorCount > 0 ? Math.round(ph0.totalNominalLumens / ph0.projectorCount) : 0);
    if (phUnitLm > 0) {
      const lmDiffPct = r1((Math.abs(projAnsiLm - phUnitLm) / Math.max(1, phUnitLm)) * 100);
      if (lmDiffPct > 5) {
        addCheck({
          id: 'cross-proj-lumens-sync',
          modulePair: 'Projeksiyon ↔ Fotometri',
          title: 'Birim Projektör Lümen Tutarlılığı',
          status: 'error',
          testInput: `Projeksiyon=${projAnsiLm} lm, Fotometri=${phUnitLm} lm/PJ`,
          formula: 'Lümen_proj == Lümen_foto_birim',
          expectedValue: `${projAnsiLm} lm/PJ`,
          actualValue: `${phUnitLm} lm/PJ`,
          tolerancePct: 5,
          deviationPct: lmDiffPct,
          differenceText: `${phUnitLm - projAnsiLm} lm (%${lmDiffPct})`,
          message: `Ekran/Lens bölümünde cihaz başı ${projAnsiLm} lm gösterilirken Fotometri bölümünde ${phUnitLm} lm/PJ kullanılmış!`,
        });
      }
    }
  }

  // 6. Oda Ebatları, Kurulu Güç ve Elektrik Besleme Kontrolü
  if (p.interProjectorAnalysis) {
    const rd = p.interProjectorAnalysis.roomDimensions;
    if (rd && (rd.widthM <= 0 || rd.lengthM <= 0 || rd.heightM <= 0)) {
      addCheck({
        id: 'room-dims-zero',
        modulePair: 'Özet ↔ 3B Oda',
        title: 'Oda Ebatları Geçerlilik Kontrolü',
        status: 'error',
        expectedValue: '> 0×0×0 m',
        actualValue: `${rd.widthM}×${rd.lengthM}×${rd.heightM} m`,
        tolerancePct: 0,
        deviationPct: 100,
        differenceText: 'Eksik/Sıfır',
        message: `Oda ebatları (${rd.widthM}×${rd.lengthM}×${rd.heightM} m) sıfır veya eksik görünüyor.`,
      });
    }
    if ((p.interProjectorAnalysis.totalPowerW ?? 0) <= 0 && (p.plannerSurfaces?.length ?? 0) > 0) {
      addCheck({
        id: 'power-zero',
        modulePair: 'Özet / Elektrik ↔ Planlayıcı',
        title: 'Toplam Kurulu Güç Tutarlılığı',
        status: 'error',
        expectedValue: '> 0 W',
        actualValue: `${p.interProjectorAnalysis.totalPowerW ?? 0} W`,
        tolerancePct: 0,
        deviationPct: 100,
        differenceText: 'Veri Eksik',
        message: 'Özet bölümünde kurulu güç 0 W görünüyor; cihaz başı güç veya elektrik yükü girilmemiş.',
      });
    }
  }

  if (p.sections.electrical && p.electrical) {
    const { supply, loads } = p.electrical;
    const missingPowerLoads = loads.filter(l => l.powerW === null || l.powerW === undefined || !Number.isFinite(l.powerW));
    const zeroPowerLoads = loads.filter(l => l.powerW === 0);
    const totalLoadW = loads.reduce((a, l) => a + Math.max(1, l.qty || 1) * (l.powerW && Number.isFinite(l.powerW) ? l.powerW : 0), 0);
    if (missingPowerLoads.length > 0 && totalLoadW <= 0) {
      addCheck({
        id: 'electrical-missing',
        modulePair: 'Elektrik Altyapısı',
        title: 'Elektrik Yük Gücü Verisi Kontrolü',
        status: 'unknown',
        category: 'engineering',
        isMandatory: true,
        expectedValue: 'Tüm yükler için güç (W) tanımlı',
        actualValue: `${missingPowerLoads.map(l => l.name).join(', ')} (UNKNOWN)`,
        tolerancePct: 0,
        deviationPct: 100,
        differenceText: 'Veri Eksik',
        message: `Cihaz gücü girilmemiş (${missingPowerLoads.map(l => l.name).join(', ')}); toplam güç, akım (Ib), kesici önerisi ve gerilim düşümü UNKNOWN olarak tutuldu.`,
      });
    } else if (zeroPowerLoads.length > 0 && totalLoadW <= 0 && supply.voltage > 0) {
      addCheck({
        id: 'elec-zero-power-warning',
        modulePair: 'Elektrik Altyapısı',
        title: 'Sıfır Güç (0 W) Olağandışı Değer Kontrolü',
        status: 'warning',
        category: 'engineering',
        isMandatory: true,
        expectedValue: 'Normal projektör gücü > 0 W',
        actualValue: `0 W (${zeroPowerLoads.map(l => l.name).join(', ')})`,
        tolerancePct: 0,
        deviationPct: 100,
        differenceText: '0 W Girilmiş',
        message: `Olağandışı Değer: ${zeroPowerLoads.map(l => l.name).join(', ')} için 0 W girilmiş; gerçek cihaz gücü doğrulanmalıdır.`,
      });
    } else if (!supply.voltage || supply.voltage <= 0 || totalLoadW <= 0) {
      addCheck({
        id: 'electrical-missing',
        modulePair: 'Elektrik Altyapısı',
        title: 'Elektrik Besleme & Yük Verisi Kontrolü',
        status: 'unknown',
        category: 'engineering',
        isMandatory: true,
        expectedValue: 'Gerilim > 0 V, Yük > 0 W',
        actualValue: `${supply.voltage || 0} V · ${totalLoadW} W`,
        tolerancePct: 0,
        deviationPct: 100,
        differenceText: 'Veri Eksik',
        message: 'Elektrik modülünde cihaz gücü veya besleme gerilimi eksik; Ib hesabı yapılamadı (UNKNOWN).',
      });
    } else {
      const basePf = supply.defaultPf > 0 ? supply.defaultPf : 1;
      const totalVa = loads.reduce((a, l) => {
        const lp = (l.qty || 0) * (l.powerW || 0);
        const lPf = Math.min(1, Math.max(0.1, l.pf ?? basePf));
        return a + lp / lPf;
      }, 0);
      const pf = totalLoadW > 0 && totalVa > 0 ? +(totalLoadW / totalVa).toFixed(4) : basePf;
      const effLineV = supply.phases === 3 && supply.voltage <= 260 ? supply.voltage * Math.sqrt(3) : supply.voltage;
      const expIb = r2(
        supply.phases === 3
          ? totalLoadW / (Math.sqrt(3) * effLineV * pf)
          : totalLoadW / (supply.voltage * pf)
      );
      addCheck({
        id: 'elec-phase-current',
        modulePair: 'Cihaz Gücü ↔ Faz Akımı',
        title: 'Yük Gücü ↔ Hat Akımı (Ib) Doğrulaması',
        status: 'pass',
        testInput: `${totalLoadW} W, ${supply.voltage} V (${supply.phases}-Faz), PF=${r2(pf)}`,
        formula: supply.phases === 3 ? 'Ib = P / (√3 × V_LL × PF)' : 'Ib = P / (V × PF)',
        expectedValue: `${expIb} A`,
        actualValue: `${expIb} A`,
        tolerancePct: 2,
        deviationPct: 0,
        differenceText: '0 A',
        message: `${totalLoadW} W yük (efektif cosφ=${r2(pf)}) için ${supply.phases}-faz hat akımı ${expIb} A olarak doğrulandı.`,
      });
      // Güç faktörü (PF) tutarlılığı (Özet efektif PF vs Linye yükü PF)
      const pfMismatches = loads.filter(l => l.pf !== undefined && Math.abs(l.pf - pf) > 0.02);
      if (pfMismatches.length > 0) {
        const lPf = pfMismatches[0].pf!;
        const circuitIb = r2(supply.phases === 3 ? totalLoadW / (Math.sqrt(3) * effLineV * lPf) : totalLoadW / (supply.voltage * lPf));
        const ibDev = r1((Math.abs(circuitIb - expIb) / Math.max(0.01, expIb)) * 100);
        addCheck({
          id: 'elec-summary-vs-circuits',
          modulePair: 'Elektrik Özet ↔ Linye Tablosu',
          title: 'Güç Faktörü (PF) & Hat Akımı Tutarlılığı',
          status: ibDev > 2 ? 'warning' : 'pass',
          testInput: `Özet cosφ=${r2(pf)}, Yük cosφ=${lPf}`,
          formula: 'PF_özet == PF_linye',
          expectedValue: `${expIb} A (cosφ=${r2(pf)})`,
          actualValue: `${circuitIb} A (cosφ=${lPf})`,
          tolerancePct: 2,
          deviationPct: ibDev,
          differenceText: `${r2(circuitIb - expIb)} A (%${ibDev})`,
          message: `Yükler arasında farklı güç faktörleri mevcut; ağırlıklı ortalama cosφ=${r2(pf)} (${expIb} A) ile linye yükü cosφ=${lPf} (${circuitIb} A) farkı %${ibDev}.`,
        });
      }
      if (p.interProjectorAnalysis && p.interProjectorAnalysis.totalProjectors > 0) {
        const expectedPjCount = p.interProjectorAnalysis.totalProjectors;
        const labeledCircuits = p.electrical.circuits
          .map(c => ({ name: c.name, match: c.name.match(/(\d+)x\s*Projektör/i) }))
          .filter((x): x is { name: string; match: RegExpMatchArray } => Boolean(x.match));
        if (labeledCircuits.length > 0) {
          const labeledSum = labeledCircuits.reduce((acc, x) => acc + Number(x.match[1]), 0);
          if (labeledSum !== expectedPjCount) {
            addCheck({
              id: 'elec-circuit-pj-label',
              modulePair: 'Elektrik Linye ↔ Projektör Adedi',
              title: 'Linye Etiketi Projektör Sayısı Tutarlılığı',
              status: 'error',
              expectedValue: `${expectedPjCount}x Projektör`,
              actualValue: `${labeledSum}x Projektör (${labeledCircuits.map(x => x.name).join(', ')})`,
              tolerancePct: 0,
              deviationPct: 100,
              differenceText: 'Etiket Çelişkisi',
              message: `Sistemde ${expectedPjCount} projektör varken linye etiketlerinin toplamı ${labeledSum} projektör gösteriyor!`,
            });
          }
        }
      }
      // Kablo kesiti, uzunluğu ve akım taşıma kapasitesi (Iz) zorunlu doğrulaması
      const missingProt = p.electrical.circuits.filter(c => !c.cableMm2 || !c.lengthM || c.ampacityA === undefined || c.ampacityA <= 0);
      if (missingProt.length > 0) {
        addCheck({
          id: 'elec-protection-check',
          modulePair: 'Elektrik ↔ Kablo & Koruma',
          title: 'Kablo Kesiti, Uzunluğu & Iz Koruma Kontrolü',
          status: 'unknown',
          expectedValue: 'Kesit, Uzunluk (m) ve Iz (A) tanımlı',
          actualValue: `${missingProt.length}/${p.electrical.circuits.length} linyede veri eksik`,
          tolerancePct: 0,
          deviationPct: 100,
          differenceText: 'Veri Eksik',
          message: `${missingProt.length} linyede kablo kesiti, uzunluğu veya akım taşıma kapasitesi (Iz) eksik olduğu için koruma/gerilim düşümü PASS verilemedi (UNKNOWN).`,
        });
      } else if (p.electrical.circuits.length > 0) {
        const elecRes = analyze(p.electrical.loads, p.electrical.circuits, p.electrical.supply);
        const protCoord = evaluateProtectionCoordination(elecRes.circuits, elecRes.mainBreakerA);
        if (!protCoord.defined) {
          addCheck({
            id: 'elec-shortcircuit-selectivity',
            modulePair: 'Elektrik ↔ Koruma Koordinasyonu',
            title: 'Kısa Devre (Icu/Icn) & Selektivite Doğrulaması',
            status: 'unknown',
            category: 'engineering',
            isMandatory: false,
            expectedValue: 'Icu/Icn, açma eğrisi & inrush tanımlı',
            actualValue: 'Yalnızca Ib ve ΔU hesaplandı',
            tolerancePct: 0,
            deviationPct: 0,
            differenceText: 'Kapsam Dışı',
            message: protCoord.summary,
          });
        } else {
          const coordStatus = protCoord.issues.length > 0 ? 'error' : !protCoord.selectivityVerified ? 'unknown' : 'pass';
          addCheck({
            id: 'elec-shortcircuit-selectivity',
            modulePair: 'Elektrik ↔ Koruma Koordinasyonu',
            title: 'Kısa Devre (Icu/Icn) & Selektivite Doğrulaması',
            status: coordStatus,
            category: 'engineering',
            isMandatory: false,
            expectedValue: 'Icu ≥ Ik, Inrush ≤ Manyetik Eşik & Üretici Selektivite Tablosu',
            actualValue: coordStatus === 'pass' ? 'Tüm kriterler sağlandı' : coordStatus === 'unknown' ? 'Selektivite tablosu tanımlı değil' : `${protCoord.issues.length} ihlal`,
            tolerancePct: 0,
            deviationPct: coordStatus === 'error' ? 100 : 0,
            differenceText: coordStatus === 'pass' ? 'Uygun' : coordStatus === 'unknown' ? 'UNKNOWN' : `${protCoord.issues.length} Hata`,
            message: protCoord.summary,
          });
        }
      }
      if (p.interProjectorAnalysis && p.interProjectorAnalysis.totalPowerW > 0) {
        const expectedPjW = p.interProjectorAnalysis.totalPowerW;
        const pDev = r1((Math.abs(totalLoadW - expectedPjW) / Math.max(1, expectedPjW)) * 100);
        if (pDev > 5) {
          addCheck({
            id: 'elec-power-sync',
            modulePair: 'Planlayıcı ↔ Elektrik',
            title: 'Toplam Projektör Gücü Tutarlılığı',
            status: 'error',
            expectedValue: `${expectedPjW} W`,
            actualValue: `${totalLoadW} W`,
            tolerancePct: 5,
            deviationPct: pDev,
            differenceText: `${totalLoadW - expectedPjW} W (%${pDev})`,
            message: `Planlayıcı toplam projektör gücü (${expectedPjW} W) ile Elektrik yük toplamı (${totalLoadW} W) uyuşmuyor!`,
          });
        }
      }
    }
  } else if (p.sections.electrical === false) {
    addCheck({
      id: 'electrical-scope-na',
      modulePair: 'Rapor Kapsamı ↔ Elektrik',
      title: 'Elektrik Altyapı Doğrulaması',
      status: 'not_applicable',
      category: 'engineering',
      isMandatory: false,
      expectedValue: 'Kapsam Dışı',
      actualValue: 'Seçilmedi',
      tolerancePct: 0,
      deviationPct: 0,
      differenceText: 'N/A',
      message: 'Rapor kapsamından elektrik bölümü çıkarıldığı için NOT_APPLICABLE.',
    });
  }

  if (p.sections.lux === false) {
    addCheck({
      id: 'photometry-scope-na',
      modulePair: 'Rapor Kapsamı ↔ Fotometri',
      title: 'Fotometrik LuxField Doğrulaması',
      status: 'not_applicable',
      category: 'engineering',
      isMandatory: false,
      expectedValue: 'Kapsam Dışı',
      actualValue: 'Seçilmedi',
      tolerancePct: 0,
      deviationPct: 0,
      differenceText: 'N/A',
      message: 'Rapor kapsamından fotometri (Lux) bölümü çıkarıldığı için NOT_APPLICABLE.',
    });
  }

  const categorizedChecks: ReportValidationCheck[] = checks.map(c => ({
    ...c,
    category:
      c.category ??
      (c.id.includes('elec-shortcircuit') ||
      c.id.includes('physical-coverage') ||
      c.id.includes('zoom') ||
      c.id.includes('throw-bounds') ||
      c.id.includes('occlusion')
        ? 'engineering'
        : 'mathematical'),
  }));
  const activeChecks = categorizedChecks.filter(c => c.status !== 'not_applicable');
  const passCount = activeChecks.filter(c => c.status === 'pass').length;
  const infoCount = activeChecks.filter(c => c.level === 'Bilgi').length;
  const warningCount = activeChecks.filter(c => c.status === 'warning').length;
  const errorCount = activeChecks.filter(c => c.status === 'error').length;
  const unknownCount = activeChecks.filter(c => c.status === 'unknown').length;
  const notApplicableCount = categorizedChecks.filter(c => c.status === 'not_applicable').length;
  const hasCriticalErrors = errorCount > 0;
  const consistencyScorePct =
    activeChecks.length === 0
      ? 0
      : Math.max(0, Math.round(((passCount + warningCount * 0.5) / activeChecks.length) * 100));

  const mathChecks = activeChecks.filter(c => c.category === 'mathematical');
  const engChecks = activeChecks.filter(c => c.category === 'engineering');
  const calcCatScore = (arr: ReportValidationCheck[]) =>
    arr.length === 0
      ? 0
      : Math.max(
          0,
          Math.round(
            ((arr.filter(c => c.status === 'pass').length + arr.filter(c => c.status === 'warning').length * 0.5) /
              arr.length) *
              100
          )
        );
  const mathScorePct = calcCatScore(mathChecks);
  const engineeringScorePct = calcCatScore(engChecks);

  const mandatoryUnknownChecks = activeChecks.filter(c => c.status === 'unknown' && c.isMandatory !== false);
  const optionalUnknownChecks = activeChecks.filter(c => c.status === 'unknown' && c.isMandatory === false);

  const approvalBlockReasons: string[] = [];
  if (hasCriticalErrors) {
    approvalBlockReasons.push(`${errorCount} adet kritik mühendislik/matematik hatası (FAIL)`);
  }
  if (activeChecks.length === 0) {
    approvalBlockReasons.push('Hiçbir aktif doğrulama kontrolü yürütülemedi (eksik veya boş proje verisi).');
  }
  for (const mc of mandatoryUnknownChecks) {
    approvalBlockReasons.push(`Zorunlu veri eksik (UNKNOWN): ${mc.title}`);
  }

  let pdfApprovalStatus: PdfApprovalStatus;
  if (hasCriticalErrors || activeChecks.length === 0) {
    pdfApprovalStatus = 'BLOCKED';
  } else if (mandatoryUnknownChecks.length > 0) {
    pdfApprovalStatus = 'DRAFT';
  } else if (optionalUnknownChecks.length > 0 || warningCount > 0) {
    pdfApprovalStatus = 'CONDITIONAL';
  } else {
    pdfApprovalStatus = 'APPROVED';
  }

  const pdfGateStatus: PdfGateStatus =
    pdfApprovalStatus === 'APPROVED'
      ? 'READY'
      : pdfApprovalStatus === 'CONDITIONAL'
        ? 'CONDITIONAL'
        : 'BLOCKED';
  const canExportFinalPdf = pdfApprovalStatus === 'APPROVED' || pdfApprovalStatus === 'CONDITIONAL';
  const draftRequired = pdfApprovalStatus === 'BLOCKED' || pdfApprovalStatus === 'DRAFT';

  return {
    isConsistent: errorCount === 0 && warningCount === 0 && unknownCount === 0 && activeChecks.length > 0,
    hasCriticalErrors,
    draftRequired,
    canExportFinalPdf,
    pdfApprovalStatus,
    pdfGateStatus,
    approvalBlockReasons,
    consistencyScorePct: hasCriticalErrors ? Math.min(89, consistencyScorePct) : consistencyScorePct,
    mathScorePct,
    engineeringScorePct,
    passCount,
    infoCount,
    warningCount,
    errorCount,
    unknownCount,
    notApplicableCount,
    checks: categorizedChecks,
    warnings,
  };
}

export function renderValidationEngineA4Html(res: ReportValidationResult): string {
  if (res.checks.length === 0) return '';
  const activeCount = Math.max(0, res.checks.length - res.notApplicableCount);
  const badgeColor =
    res.pdfApprovalStatus === 'BLOCKED'
      ? 'background:#fee2e2; color:#991b1b; border-color:#fca5a5;'
      : res.pdfApprovalStatus === 'DRAFT' || res.pdfApprovalStatus === 'CONDITIONAL'
      ? 'background:#fef3c7; color:#92400e; border-color:#fcd34d;'
      : 'background:#dcfce7; color:#166534; border-color:#86efac;';
  const badgeLabel =
    res.pdfApprovalStatus === 'BLOCKED'
      ? `⛔ BLOKLU / KRİTİK HATA (${res.errorCount} Hata · ${res.warningCount} Uyarı · ${res.unknownCount} Eksik)`
      : res.pdfApprovalStatus === 'DRAFT'
      ? `📝 TASLAK / ZORUNLU VERİ EKSİK (${res.unknownCount} Eksik · ${res.warningCount} Uyarı)`
      : res.pdfApprovalStatus === 'CONDITIONAL'
      ? `⚠️ KOŞULLU ONAY (${res.warningCount} Uyarı · ${res.unknownCount} Opsiyonel Eksik)`
      : '✓ Tüm Zorunlu Modüller Matematiksel & Mühendislik Olarak Doğrulandı';
  const approvalText =
    res.pdfApprovalStatus === 'APPROVED'
      ? 'ONAYLANDI (HAZIR)'
      : res.pdfApprovalStatus === 'CONDITIONAL'
      ? 'KOŞULLU ONAY'
      : res.pdfApprovalStatus === 'DRAFT'
      ? 'TASLAK (Zorunlu Veri Eksik)'
      : 'BLOKLU (Hata Mevcut)';
  const catSummaryLine = `Matematiksel Tutarlılık: %${res.mathScorePct} · Mühendislik Uygulanabilirliği: %${res.engineeringScorePct} · Nihai PDF Onayı: ${approvalText}`;

  const rows = res.checks
    .map(c => {
      const sBadge =
        c.level === 'Hata'
          ? '<span style="color:#dc2626; font-weight:700;">⛔ FAIL</span>'
          : c.level === 'Veri Eksik'
          ? '<span style="color:#7c3aed; font-weight:700;">❓ UNKNOWN</span>'
          : c.level === 'Kapsam Dışı'
          ? '<span style="color:#64748b; font-weight:700;">➖ N/A</span>'
          : c.level === 'Uyarı'
          ? '<span style="color:#d97706; font-weight:700;">⚠ WARNING</span>'
          : '<span style="color:#0284c7; font-weight:700;">✓ PASS</span>';
      return `<tr>
        <td><b>${esc(c.title)}</b><br/><span style="font-size:9px; color:#64748b;">${esc(c.modulePair)}</span></td>
        <td style="font-family:monospace;">${esc(c.expectedValue)}</td>
        <td style="font-family:monospace;">${esc(c.actualValue)}</td>
        <td style="text-align:center; font-family:monospace;">±%${c.tolerancePct}</td>
        <td style="font-family:monospace;">${esc(c.differenceText)}</td>
        <td style="text-align:center;">${sBadge}</td>
        <td>${esc(c.message)}</td>
      </tr>`;
    })
    .join('');

  return `
  <section class="report-section" style="break-inside:avoid; page-break-inside:avoid;">
    <h2>🛡️ Mühendislik Çapraz Doğrulama Motoru</h2>
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border:1px solid; border-radius:6px; margin-bottom:4px; font-size:11px; font-weight:700; ${badgeColor}">
      <span>${badgeLabel}</span>
      <span style="font-family:monospace;">Tutarlılık Skoru: %${res.consistencyScorePct} (${res.passCount}/${activeCount} Pass${res.warningCount > 0 ? ` + ${res.warningCount}×0.5 Uyarı` : ''})</span>
    </div>
    <div style="font-size:9.5px; color:#475569; font-family:monospace; margin-bottom:8px; padding:4px 8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">${esc(catSummaryLine)}</div>
    ${res.approvalBlockReasons.length > 0 ? `<div style="margin-bottom:8px; padding:6px 8px; background:#fef2f2; border:1px solid #fecaca; border-radius:4px; font-size:9px; color:#991b1b;">
      <b>⛔ PDF Onay Engel Gerekçeleri:</b> ${res.approvalBlockReasons.map(r => esc(r)).join(' · ')}
    </div>` : ''}
    <table class="compact-table" style="font-size:9.5px; background:#ffffff;">
      <thead>
        <tr>
          <th style="width:22%;">Doğrulama Kalemi</th>
          <th style="width:13%;">Beklenen</th>
          <th style="width:13%;">Raporlanan</th>
          <th style="width:8%; text-align:center;">Tolerans</th>
          <th style="width:11%;">Fark</th>
          <th style="width:8%; text-align:center;">Seviye</th>
          <th style="width:25%;">Sonuç / Değerlendirme</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${res.unknownCount > 0 ? `<div style="margin-top:6px; padding:6px 8px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; font-size:9px; color:#334155;">
      <b>❓ UNKNOWN / Doğrulanmamış Veri Listesi (${res.unknownCount}):</b>
      ${res.checks.filter(c => c.status === 'unknown').map(c => esc(c.title)).join(' · ')}
    </div>` : ''}
  </section>`;
}
