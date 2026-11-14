/**
 * Fiziksel Yüzey Kaplama Doğrulama Motoru (Physical Coverage Validation)
 *
 * Doğru lens ve atım oranı seçilmiş olsa bile, projektör görüntüsünün
 * hedef mimari yüzeyi (genişlik ve yükseklik olarak) gerçekten kaplayıp
 * kaplamadığını, açıkta kalan veya taşan (crop/mask) alanları doğrular.
 */

export interface PhysicalCoverageInput {
  surfaceWidthM: number;
  surfaceHeightM: number;
  cols: number;
  rows: number;
  projW: number;
  projH: number;
  throwDistM: number;
  throwRatio: number;
  overlapX?: number;
  overlapY?: number;
  ovPxX?: number;
  ovPxY?: number;
}

export type PhysicalCoverageAction =
  | 'none'
  | 'adjust_throw_or_tr'
  | 'crop_or_mask'
  | 'scale_or_aspect_change';

export interface PhysicalCoverageResult {
  nativeAspectRatio: number;
  surfaceAspectRatio: number;
  singleImageWidthM: number;
  singleImageHeightM: number;
  coveredWidthM: number;
  coveredHeightM: number;
  horizontalCoveragePct: number;
  verticalCoveragePct: number;
  areaCoveragePct: number;
  uncoveredWidthM: number;
  uncoveredHeightM: number;
  horizontalOverflowM: number;
  verticalOverflowM: number;
  requiredSingleWidthForFullHeightM: number;
  requiredThrowRatioForFullHeight: number;
  isHorizontalCovered: boolean;
  isVerticalCovered: boolean;
  isFullyCovered: boolean;
  verdict: 'PASS' | 'FAIL' | 'UNKNOWN';
  status: 'pass' | 'warning' | 'error' | 'unknown';
  recommendedAction: PhysicalCoverageAction;
  summaryMessage: string;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function evaluatePhysicalCoverage(inp: PhysicalCoverageInput): PhysicalCoverageResult {
  const wM = inp.surfaceWidthM;
  const hM = inp.surfaceHeightM;
  const cols = Math.max(1, Math.round(inp.cols || 1));
  const rows = Math.max(1, Math.round(inp.rows || 1));
  const pW = Math.max(1, inp.projW || 1920);
  const pH = Math.max(1, inp.projH || 1200);
  const distM = inp.throwDistM;
  const tr = inp.throwRatio;

  if (!(wM > 0 && hM > 0 && distM > 0 && tr > 0)) {
    return {
      nativeAspectRatio: r3(pW / pH),
      surfaceAspectRatio: hM > 0 ? r3(wM / hM) : 0,
      singleImageWidthM: 0,
      singleImageHeightM: 0,
      coveredWidthM: 0,
      coveredHeightM: 0,
      horizontalCoveragePct: 0,
      verticalCoveragePct: 0,
      areaCoveragePct: 0,
      uncoveredWidthM: Math.max(0, wM),
      uncoveredHeightM: Math.max(0, hM),
      horizontalOverflowM: 0,
      verticalOverflowM: 0,
      requiredSingleWidthForFullHeightM: 0,
      requiredThrowRatioForFullHeight: 0,
      isHorizontalCovered: false,
      isVerticalCovered: false,
      isFullyCovered: false,
      verdict: 'UNKNOWN',
      status: 'unknown',
      recommendedAction: 'adjust_throw_or_tr',
      summaryMessage: 'Fiziksel yüzey kaplama hesabı için yüzey ölçüsü, atım mesafesi veya throw ratio eksik (UNKNOWN).',
    };
  }

  const nativeAspect = pW / pH;
  const surfaceAspect = wM / hM;
  const singleW = distM / tr;
  const singleH = singleW / nativeAspect;

  const ovXRatio =
    cols > 1
      ? inp.ovPxX !== undefined && inp.ovPxX > 0
        ? Math.min(0.85, Math.max(0, inp.ovPxX / pW))
        : Math.min(0.85, Math.max(0, (inp.overlapX ?? 0) / 100))
      : 0;
  const ovYRatio =
    rows > 1
      ? inp.ovPxY !== undefined && inp.ovPxY > 0
        ? Math.min(0.85, Math.max(0, inp.ovPxY / pH))
        : Math.min(0.85, Math.max(0, (inp.overlapY ?? 0) / 100))
      : 0;

  const coveredW = singleW * (cols - Math.max(0, cols - 1) * ovXRatio);
  const coveredH = singleH * (rows - Math.max(0, rows - 1) * ovYRatio);

  const tolM = 0.03;
  const uncoveredW = Math.max(0, r2(wM - coveredW));
  const uncoveredH = Math.max(0, r2(hM - coveredH));
  const overflowW = Math.max(0, r2(coveredW - wM));
  const overflowH = Math.max(0, r2(coveredH - hM));

  const isHorizontalCovered = coveredW >= wM - tolM;
  const isVerticalCovered = coveredH >= hM - tolM;
  const isFullyCovered = isHorizontalCovered && isVerticalCovered;

  const hCovPct = r1(Math.min(100, (coveredW / wM) * 100));
  const vCovPct = r1(Math.min(100, (coveredH / hM) * 100));
  const areaCovPct = r1(Math.min(100, ((Math.min(wM, coveredW) * Math.min(hM, coveredH)) / (wM * hM)) * 100));

  const singleRowsSpan = rows - Math.max(0, rows - 1) * ovYRatio;
  const reqSingleH = hM / Math.max(0.1, singleRowsSpan);
  const reqSingleW = r2(reqSingleH * nativeAspect);
  const reqTR = r3(distM / Math.max(0.1, reqSingleW));

  let verdict: PhysicalCoverageResult['verdict'] = 'PASS';
  let status: PhysicalCoverageResult['status'] = 'pass';
  let recommendedAction: PhysicalCoverageAction = 'none';
  let summaryMessage = `Fiziksel yüzey tam kaplanıyor (${r2(coveredW)}×${r2(coveredH)} m ≥ ${r2(wM)}×${r2(hM)} m).`;

  if (!isVerticalCovered || !isHorizontalCovered) {
    verdict = 'FAIL';
    status = 'error';
    recommendedAction = 'adjust_throw_or_tr';
    const parts: string[] = [];
    if (!isVerticalCovered) {
      parts.push(
        `Dikeyde ${r1((hM - coveredH) * 100)} cm açık kalıyor (kaplanan ${r2(coveredH)} m < duvar ${r2(hM)} m; tam kaplama için tekil genişlik ${reqSingleW} m / TR ${reqTR}:1 gerekir)`
      );
    }
    if (!isHorizontalCovered) {
      parts.push(
        `Yatayda ${r1((wM - coveredW) * 100)} cm açık kalıyor (kaplanan ${r2(coveredW)} m < duvar ${r2(wM)} m)`
      );
    }
    summaryMessage = `Fiziksel yüzey eksik kaplanıyor! ${parts.join(' · ')}`;
  } else if (overflowW > 0.05 || overflowH > 0.05) {
    recommendedAction = 'crop_or_mask';
    summaryMessage = `Yüzey tam kaplanıyor; taşan alan (${overflowW > 0.05 ? `yatay +${overflowW} m` : ''}${overflowW > 0.05 && overflowH > 0.05 ? ', ' : ''}${overflowH > 0.05 ? `dikey +${overflowH} m` : ''}) içerik kanvası / maskeleme ile kırpılmalıdır.`;
  }

  return {
    nativeAspectRatio: r3(nativeAspect),
    surfaceAspectRatio: r3(surfaceAspect),
    singleImageWidthM: r2(singleW),
    singleImageHeightM: r3(singleH),
    coveredWidthM: r2(coveredW),
    coveredHeightM: r3(coveredH),
    horizontalCoveragePct: hCovPct,
    verticalCoveragePct: vCovPct,
    areaCoveragePct: areaCovPct,
    uncoveredWidthM: uncoveredW,
    uncoveredHeightM: uncoveredH,
    horizontalOverflowM: overflowW,
    verticalOverflowM: overflowH,
    requiredSingleWidthForFullHeightM: reqSingleW,
    requiredThrowRatioForFullHeight: reqTR,
    isHorizontalCovered,
    isVerticalCovered,
    isFullyCovered,
    verdict,
    status,
    recommendedAction,
    summaryMessage,
  };
}
