import { useEffect, useMemo, useState } from 'react';
import { buildReportHtml, DEFAULT_SECTIONS, ReportLang, ReportPayload, ReportSectionFlags } from '../engine/report';
import { computeSurfacePointLuxDistribution } from '../engine/feasibility';
import { validateReportConsistency } from '../engine/reportValidation';
import { useProjectStore } from '../projectStore';
import { usePlannerStore } from '../plannerStore';
import { usePhotometricStore } from '../photometricStore';
import { useMapping } from '../mappingStore';
import { calculateInterProjectorDistances } from '../engine/interprojector';
import { contentPlannerRoomPlan } from '../engine/drawings';
import { toSvg } from '../engine/drawing';
import { download } from '../util';

export default function ReportGenerator() {
  const { meta, setMeta, projectionSnap, projectionScreens, updateProjectionScreen, luxSnap, ledSnap, electrical, equipmentList } = useProjectStore();
  const { surfaces, calculatedSurfaces, physicalRoom } = usePlannerStore();
  const { slots, screens: mappingScreens, updateScreen: updateMappingScreen } = useMapping();
  const surfacePhotometrics = usePhotometricStore(state => state.surfacePhotometrics);

  const [lang, setLang] = useState<ReportLang>('tr');
  const [reportMode, setReportMode] = useState<'design' | 'as_built'>('design');
  const [sections, setSections] = useState<ReportSectionFlags>(() => ({
    ...DEFAULT_SECTIONS,
    led: false, // Projeksiyon mekanlarında varsayılan olarak kapalı; kullanıcı dilediğinde kutucuktan tek tıkla ekler/çıkarır
    drawings2d: false,
    equipmentList: false,
  }));
  const [presentation, setPresentation] = useState(false);
  // 1. PROJEKSİYONLAR ARASI MONTAJ, EKSEN VE MESAFE MATRİSİ HESABI
  const ipSurfaces = useMemo(() => {
    return calculatedSurfaces && calculatedSurfaces.length > 0 ? calculatedSurfaces : surfaces;
  }, [calculatedSurfaces, surfaces]);
  const [archRotation, setArchRotation] = useState<0 | 90 | 180 | 270>((meta.archPlanRotation as (0 | 90 | 180 | 270)) || 0);
  const [enabledSurfaceIds, setEnabledSurfaceIds] = useState<string[]>(() => (calculatedSurfaces && calculatedSurfaces.length > 0 ? calculatedSurfaces : surfaces).map(s => s.id));

  useEffect(() => {
    const allIds = [
      ...ipSurfaces.map(s => s.id),
      ...Object.keys(surfacePhotometrics).filter(id => !ipSurfaces.some(s => s.id === id))
    ];
    if (allIds.length > 0) {
      setEnabledSurfaceIds(prev => {
        // if prev is empty or misses standalone IDs, include them
        const missing = allIds.filter(id => !prev.includes(id));
        return missing.length > 0 ? [...prev, ...missing] : prev;
      });
    }
  }, [ipSurfaces, surfacePhotometrics]);

  useEffect(() => {
    if (meta.archPlanRotation !== undefined && meta.archPlanRotation !== archRotation) {
      setArchRotation(meta.archPlanRotation);
    }
  }, [meta.archPlanRotation]);

  const canonicalIpSurfaces = useMemo(() => {
    return ipSurfaces.map(s => {
      if ((s.cols || 1) <= 1 || !(s.throwDistM > 0) || !(s.throwRatio > 0)) return s;
      const sExt = s as unknown as {
        effectiveWidthM?: number;
        effectiveHeightM?: number;
        projW?: number;
        projH?: number;
        projNetH?: number;
        netW?: number;
        netH?: number;
        customW?: number;
        customH?: number;
      };
      const beamW = s.throwDistM / s.throwRatio;
      const effW = sExt.effectiveWidthM || s.widthM;
      const effH = sExt.effectiveHeightM || s.heightM;
      if (s.cols * beamW <= effW + 0.05) return s;

      const stepW = Math.max(0.1, (effW - beamW) / (s.cols - 1));
      const physOvRatio = Math.min(0.995, Math.max(0, (beamW - stepW) / beamW));
      const physOvPct = +(physOvRatio * 100).toFixed(1);
      const pW = sExt.projW || sExt.customW || 1920;
      const pH = sExt.projH || sExt.customH || 1200;
      const beamH = beamW * (pH / Math.max(1, pW));
      const projNetH = sExt.projNetH || ((s.rows || 1) * pH);
      const physOvPxX = Math.round(pW * physOvRatio);
      const physCombinedW = s.cols * pW - (s.cols - 1) * physOvPxX;
      const physTotalOvW = (s.cols - 1) * physOvPxX;
      const rawAreaPx = s.cols * pW * (s.rows || 1) * pH;
      const combAreaPx = physCombinedW * projNetH;
      const physLostPx = Math.max(0, rawAreaPx - combAreaPx);
      const physLostPct = +((physLostPx / Math.max(1, rawAreaPx)) * 100).toFixed(1);

      // Fiziksel duvarın optik yoğunluk (px/m) karşılığı; net içerik kanvası birleşik rasteri aşamaz
      const optPxPerM = pW / Math.max(0.1, beamW);
      const optPxPerMH = pH / Math.max(0.1, beamH);
      const targetAspect = effW / Math.max(0.1, effH);
      let syncedNetW = Math.min(physCombinedW, Math.max(100, Math.round(effW * optPxPerM)));
      let syncedNetH = Math.min(projNetH, Math.max(100, Math.round(effH * optPxPerMH)));
      if (syncedNetW > physCombinedW || syncedNetH > projNetH) {
        if (physCombinedW / Math.max(1, projNetH) >= targetAspect) {
          syncedNetH = projNetH;
          syncedNetW = Math.min(physCombinedW, Math.max(100, Math.round(projNetH * targetAspect)));
        } else {
          syncedNetW = physCombinedW;
          syncedNetH = Math.min(projNetH, Math.max(100, Math.round(physCombinedW / Math.max(0.1, targetAspect))));
        }
      }
      const syncedPxPerM = +(syncedNetW / Math.max(0.1, effW)).toFixed(1);
      const syncedPxPerMH = +(syncedNetH / Math.max(0.1, effH)).toFixed(1);

      return {
        ...s,
        overlapX: physOvPct,
        ovPxX: physOvPxX,
        projNetW: physCombinedW,
        projNetH,
        netW: syncedNetW,
        netH: syncedNetH,
        pxPerMeter: syncedPxPerM,
        pxPerMeterH: syncedPxPerMH,
        aspectProjector: +(physCombinedW / Math.max(1, projNetH)).toFixed(2),
        aspectContent: +(syncedNetW / Math.max(1, syncedNetH)).toFixed(2),
        totalOvW: physTotalOvW,
        lostPixelsTotal: physLostPx,
        lostPixelsPct: physLostPct,
      };
    });
  }, [ipSurfaces]);

  const interProjectorAnalysis = useMemo(() => {
    // Elektrik yüklerinden projektör gücünü al, yoksa 1350W varsay
    const pjLoad = electrical.loads.find(l => l.name.toLowerCase().includes('projekt') || l.id.toUpperCase().includes('PJ'));
    const singleWatt = pjLoad && pjLoad.powerW > 0 ? pjLoad.powerW : 1350;
    const breakerA = electrical.circuits[0]?.ampacityA ? (electrical.circuits[0].ampacityA <= 18 ? 10 : electrical.circuits[0].ampacityA <= 25 ? 16 : 32) : 16;

    return calculateInterProjectorDistances(
      canonicalIpSurfaces,
      physicalRoom,
      singleWatt,
      pjLoad?.name || 'Lazer Projeksiyon Cihazı (WUXGA / 4K)',
      breakerA
    );
  }, [canonicalIpSurfaces, physicalRoom, electrical]);

  // 2. 2B MİMARİ YERLEŞİM ODA PLANI SVG ÇİZİMİ
  const architecturalPlanSvg = useMemo(() => {
    try {
      const planDrawing = contentPlannerRoomPlan(
        physicalRoom,
        canonicalIpSurfaces,
        {
          showRoomDimensions: true,
          showThrowDimensions: true,
          showProjectorLabels: true,
          showElectricalLabels: true,
          showFrustums: true,
          showTitleBlock: true,
        }
      );
      return toSvg(planDrawing, { background: '#090e17', rotationDeg: archRotation });
    } catch (err) {
      console.warn('Room plan SVG generation fallback:', err);
      return undefined;
    }
  }, [physicalRoom, ipSurfaces, archRotation]);

  const snapshots = useMemo(() => {
    return (meta.room3dSnapshots && meta.room3dSnapshots.length > 0)
      ? meta.room3dSnapshots
      : (meta.room3dSnapshotUrl ? [meta.room3dSnapshotUrl] : []);
  }, [meta.room3dSnapshots, meta.room3dSnapshotUrl]);

  // TEK KAYNAK ANSI LÜMEN & CİHAZ MODELİ (Tüm modüller bu tek kaynaktan beslenir)
  const canonicalUnitLumens = useMemo(() => {
    const activeScr = projectionScreens.find(
      sc => sc.includeInReport !== false && sc.snap && sc.snap.ansiLumens && sc.snap.ansiLumens > 0
    );
    if (activeScr?.snap?.ansiLumens && activeScr.snap.ansiLumens > 0) {
      return activeScr.snap.ansiLumens;
    }
    if (projectionSnap?.ansiLumens && projectionSnap.ansiLumens > 0) {
      return projectionSnap.ansiLumens;
    }
    const firstStored = Object.values(surfacePhotometrics)[0] as
      | { nominalLumensPerProj?: number; effectiveTotalLumens?: number; projectorCount?: number; netEfficiencyPct?: number }
      | undefined;
    if (firstStored?.nominalLumensPerProj && firstStored.nominalLumensPerProj > 0) {
      return firstStored.nominalLumensPerProj;
    }
    if (firstStored?.effectiveTotalLumens && firstStored.effectiveTotalLumens > 0 && (firstStored.projectorCount || 0) > 0) {
      const eff = (firstStored.netEfficiencyPct ?? 90) / 100;
      return Math.round((firstStored.effectiveTotalLumens / Math.max(0.1, eff)) / Math.max(1, firstStored.projectorCount || 1));
    }
    return 10000;
  }, [projectionScreens, projectionSnap?.ansiLumens, surfacePhotometrics]);

  const canonicalProjectorModel = useMemo(() => {
    const activeScr = projectionScreens.find(sc => sc.includeInReport !== false && sc.snap?.projectorName);
    const rawName = (activeScr?.snap?.projectorName || projectionSnap?.projectorName || '').trim();
    const cleaned = rawName
      .replace(/^\d+\s*x\s*/i, '')
      .replace(/\s*\([\d.,]+\s*(?:ANSI\s*)?lm[^)]*\)/gi, '')
      .trim();
    if (!cleaned || /^projektör$/i.test(cleaned)) {
      return interProjectorAnalysis.projectors[0]?.model || 'Lazer Projeksiyon Cihazı';
    }
    return cleaned;
  }, [projectionScreens, projectionSnap?.projectorName, interProjectorAnalysis.projectors]);

  const reportPhotometricSurfaces = useMemo(() => {
    const buildDistributionRows = (
      surfName: string,
      wM: number,
      cols: number,
      rows: number,
      dist: number,
      tr: number
    ) => {
      const beamW = +(dist / Math.max(0.1, tr)).toFixed(2);
      const stepW = cols > 1 ? Math.max(0.1, (wM - beamW) / (cols - 1)) : 0;
      const distRows = [];
      let pjIdx = 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const stX = +(c * stepW).toFixed(2);
          const enX = +(stX + beamW).toFixed(2);
          const cX = +((stX + enX) / 2).toFixed(2);
          let ovText = '— (Kenar)';
          if (c < cols - 1) {
            const nextStX = +((c + 1) * stepW).toFixed(2);
            const ovW = +(enX - nextStX).toFixed(2);
            ovText = `${ovW}m (%${Math.round((ovW / Math.max(0.1, beamW)) * 100)} Blend)`;
          }
          distRows.push({
            code: `PJ ${pjIdx}`,
            name: `${surfName} - PJ ${pjIdx}`,
            rowName: rows > 1 ? `Sıra ${r + 1}` : undefined,
            startX: stX,
            endX: enX,
            widthM: beamW,
            centerX: cX,
            throwDistM: dist,
            throwRatio: tr,
            overlapText: ovText,
          });
          pjIdx++;
        }
      }
      return distRows;
    };

    const storedList = Object.values(surfacePhotometrics);
    // Kullanıcı Lux Hesaplayıcı'dan en az 1 yüzey kaydettiyse, İçerik Planlayıcı'dan otomatik hayalet/tahmini duvar üretme;
    // yalnızca kullanıcının gerçekten hesaplayıp eklediği yüzeyleri göster (böylece 1 duvar varken 2 duvar çıkmaz).
    if (storedList.length > 0) {
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      return storedList
        .filter(item => {
          const n = item.surfaceName.trim().toLocaleLowerCase('tr-TR');
          if (seenIds.has(item.surfaceId) || seenNames.has(n)) return false;
          seenIds.add(item.surfaceId);
          seenNames.add(n);
          return true;
        })
        .map(item => {
          const n = item.surfaceName.trim().toLocaleLowerCase('tr-TR');
          const matchedSurf = ipSurfaces.find(
            s => s.id === item.surfaceId || s.name.trim().toLocaleLowerCase('tr-TR') === n
          );
          const wM = matchedSurf ? +(matchedSurf.widthM || item.widthM).toFixed(2) : item.widthM;
          const hM = matchedSurf ? +(matchedSurf.heightM || item.heightM).toFixed(2) : item.heightM;
          const count = matchedSurf ? (matchedSurf.cols || 1) * (matchedSurf.rows || 1) : item.projectorCount;
          const cols = matchedSurf?.cols || Math.max(1, count);
          const rows = matchedSurf?.rows || 1;
          const dist = matchedSurf?.throwDistM || item.distributionRows?.[0]?.throwDistM || 4.5;
          const tr = matchedSurf?.throwRatio || item.distributionRows?.[0]?.throwRatio || 0.8;
          const area = Math.max(1, wM * hM);
          const rawEffLumens = item.effectiveTotalLumens && item.effectiveTotalLumens > 0
            ? item.effectiveTotalLumens
            : count * 10000 * 0.90;
          const effLumens =
            matchedSurf && item.projectorCount > 0 && item.projectorCount !== count
              ? Math.round(rawEffLumens * (count / item.projectorCount))
              : rawEffLumens;
          const expectedAvg = Math.round(effLumens / area);
          const expectedNitsForItem = (item.avgLux * (item.screenGain || 1.0)) / Math.PI;
          const distRowsMismatch =
            !!item.distributionRows &&
            (item.distributionRows.length !== count ||
              Math.abs((item.distributionRows[0]?.throwDistM ?? dist) - dist) > 0.05 ||
              Math.abs((item.distributionRows[0]?.throwRatio ?? tr) - tr) > 0.05);
          const isStale = !item.isManualLux && (
            item.minLux === 0 ||
            distRowsMismatch ||
            Math.abs(item.avgLux - expectedAvg) > Math.max(20, expectedAvg * 0.1) ||
            (typeof item.idealNits === 'number' && item.idealNits > 0 && Math.abs(item.idealNits - expectedNitsForItem) > Math.max(10, expectedNitsForItem * 0.1)) ||
            (matchedSurf && (Math.abs(item.widthM - wM) > 0.05 || Math.abs(item.heightM - hM) > 0.05 || item.projectorCount !== count))
          );
          const netEffPct = (item as { netEfficiencyPct?: number }).netEfficiencyPct ?? 90;
          const unitNomLm = canonicalUnitLumens;
          const savedUnitNomLm = (item as { nominalLumensPerProj?: number }).nominalLumensPerProj
            || Math.round((effLumens / Math.max(0.1, netEffPct / 100)) / Math.max(1, count));
          const syncedEffLumens = Math.round(count * unitNomLm * (netEffPct / 100));
          const totalNomLm = count * unitNomLm;
          const lumenMismatch = Math.abs(savedUnitNomLm - unitNomLm) > 50 || Math.abs(effLumens - syncedEffLumens) > 50;
          if (!isStale && !lumenMismatch) {
            return {
              ...item,
              nominalLumensPerProj: unitNomLm,
              totalNominalLumens: totalNomLm,
              effectiveTotalLumens: syncedEffLumens,
              singleProjectorLux: Math.round(item.avgLux / Math.max(1, item.projectorCount)),
            };
          }

          const refl = item.surfaceReflectance ?? 0.85;
          const ptDist = computeSurfacePointLuxDistribution({
            widthM: wM,
            heightM: hM,
            cols,
            rows,
            avgLux: Math.round(syncedEffLumens / area),
            uniformityU0: 82,
            overlapPct: cols > 1 ? 15 : 0,
            screenGain: item.screenGain || 1.0,
            reflectance: refl,
            ambientLux: item.ambientLux ?? 20,
          });
          const avgL = Math.round(ptDist.avgLux);
          const minL = Math.round(Math.min(...ptDist.zones9.map(z => z.lux)));
          const maxL = Math.round(Math.max(...ptDist.zones9.map(z => z.lux)));
          const idealNitsVal = Math.round((avgL * (item.screenGain || 1.0)) / Math.PI);
          const nits = Math.round((avgL * (item.screenGain || 1.0) * refl) / Math.PI);
          const fl = +(nits * 0.2919).toFixed(1);
          const ambNits = (Math.max(1, item.ambientLux ?? 20) * (item.screenGain || 1.0) * refl) / Math.PI;
          const acr = Math.round((nits + ambNits) / Math.max(0.01, ambNits));
          return {
            ...item,
            widthM: wM,
            heightM: hM,
            projectorCount: count,
            nominalLumensPerProj: unitNomLm,
            totalNominalLumens: totalNomLm,
            effectiveTotalLumens: syncedEffLumens,
            surfaceReflectance: refl,
            avgLux: avgL,
            singleProjectorLux: Math.round(avgL / Math.max(1, count)),
            minLux: minL,
            maxLux: maxL,
            uniformityU0: minL / Math.max(1, avgL),
            uniformityU1: minL / Math.max(1, maxL),
            luminanceNits: nits,
            idealNits: idealNitsVal,
            luminanceFL: fl,
            ambientContrastRatio: acr,
            distributionRows: buildDistributionRows(item.surfaceName, wM, cols, rows, dist, tr),
          };
        });
    }

    return ipSurfaces.map(s => {
      const wM = +(s.widthM || 10).toFixed(2);
      const hM = +(s.heightM || 4).toFixed(2);
      const area = wM * hM;
      const count = (s.cols || 1) * (s.rows || 1);
      const lumensPerPj = canonicalUnitLumens;
      const totalFlux = count * lumensPerPj * 0.90;
      const baseAvgL = Math.round(totalFlux / Math.max(1, area));
      const ptDist = computeSurfacePointLuxDistribution({
        widthM: wM,
        heightM: hM,
        cols: s.cols || 1,
        rows: s.rows || 1,
        avgLux: baseAvgL,
        uniformityU0: 82,
        overlapPct: (s.cols || 1) > 1 ? 15 : 0,
        screenGain: 1.0,
        reflectance: 0.85,
        ambientLux: 20,
      });
      const avgL = Math.round(ptDist.avgLux);
      const minL = Math.round(Math.min(...ptDist.zones9.map(z => z.lux)));
      const maxL = Math.round(Math.max(...ptDist.zones9.map(z => z.lux)));
      const refl = 0.85;
      const idealNitsVal = Math.round((avgL * 1.0) / Math.PI);
      const nits = Math.round((avgL * 1.0 * refl) / Math.PI);
      const fl = +(nits * 0.2919).toFixed(1);
      const ambNits = (20 * 1.0 * refl) / Math.PI;
      const acr = Math.round((nits + ambNits) / Math.max(0.01, ambNits));

      const tr = s.throwRatio || 0.8;
      const dist = s.throwDistM || 4.5;
      const distRows = buildDistributionRows(s.name, wM, s.cols || 1, s.rows || 1, dist, tr);

      return {
        surfaceId: s.id,
        surfaceName: s.name,
        surfaceType: s.type || 'wall',
        widthM: wM,
        heightM: hM,
        projectorCount: count,
        nominalLumensPerProj: lumensPerPj,
        totalNominalLumens: count * lumensPerPj,
        effectiveTotalLumens: totalFlux,
        avgLux: avgL,
        singleProjectorLux: Math.round(avgL / Math.max(1, count)),
        minLux: minL,
        maxLux: maxL,
        uniformityU0: minL / Math.max(1, avgL),
        uniformityU1: minL / Math.max(1, maxL),
        luminanceNits: nits,
        idealNits: idealNitsVal,
        luminanceFL: fl,
        screenGain: 1.0,
        surfaceReflectance: refl,
        ambientLux: 20,
        ambientContrastRatio: acr,
        isManualLux: false,
        distributionRows: distRows,
      };
    });
  }, [ipSurfaces, surfacePhotometrics, canonicalUnitLumens]);

  const [hiddenLuxIds, setHiddenLuxIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('report_hidden_lux_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('report_hidden_lux_ids', JSON.stringify(hiddenLuxIds));
    } catch { /* ignore */ }
  }, [hiddenLuxIds]);

  const activePhotometricSurfaces = useMemo(
    () => reportPhotometricSurfaces.filter(s => !hiddenLuxIds.includes(s.surfaceId)),
    [reportPhotometricSurfaces, hiddenLuxIds]
  );

  // 2B. TEKİL PROJE VERİ KAYNAĞI EŞİTLEMESİ (Elektrik, Lens/Ekran, Pixel Map)
  const effectiveElectrical = useMemo(() => {
    const totalPj = interProjectorAnalysis.totalProjectors;
    if (totalPj <= 0) return electrical;
    const isPjLoad = (l: { name: string; id: string }) =>
      l.name.toLowerCase().includes('projekt') || l.id.toUpperCase().includes('PJ');
    const pjLoads = electrical.loads.filter(isPjLoad);
    const pjQty = pjLoads.reduce((acc, l) => acc + (l.qty || 0), 0);
    const is3Phase = electrical.supply.phases === 3;

    const buildBalancedPjSetup = (singleWatt: number, pf = electrical.supply.defaultPf || 1) => {
      const baseC = electrical.circuits[0];
      const cableMm2 = baseC?.cableMm2 ?? 2.5;
      const lengthM = baseC?.lengthM ?? 25;
      const ampacityA = baseC?.ampacityA ?? 24;

      // 1 veya 2 projektörde 3 fazlı dağıtımda L3 boş kalıp %150-%300 faz dengesizliği üreteceğinden tek faz (230V) besleme kullan
      if (!is3Phase || totalPj < 3) {
        const loads = [
          {
            id: 'PJ-AUTO-1',
            name: `Projeksiyon Sistemi (${totalPj}x Projektör)`,
            powerW: singleWatt,
            qty: totalPj,
            pf,
          },
        ];
        const circuits = [
          {
            id: baseC?.id || 'C-PJ-1',
            name: baseC?.name || `Linye-1 (${totalPj}x Projektör)`,
            loadIds: ['PJ-AUTO-1'],
            phase: (baseC?.phase && baseC.phase !== '3P' ? baseC.phase : 'L1') as 'L1' | 'L2' | 'L3' | '3P',
            cableMm2,
            lengthM,
            ampacityA,
            breakerIcuKa: baseC?.breakerIcuKa,
            prospectiveFaultKa: baseC?.prospectiveFaultKa,
            tripCurve: baseC?.tripCurve,
            inrushA: baseC?.inrushA,
            inrushMultiplier: baseC?.inrushMultiplier,
            selectivityVerified: baseC?.selectivityVerified,
          },
        ];
        return {
          loads,
          circuits,
          supply: totalPj < 3 ? { ...electrical.supply, phases: 1 as const } : electrical.supply,
        };
      }
      const phases = ['L1', 'L2', 'L3'] as const;
      const counts = [0, 0, 0];
      for (let i = 0; i < totalPj; i++) counts[i % 3]++;
      const items = phases
        .map((ph, idx) => ({ ph, q: counts[idx] }))
        .filter(item => item.q > 0);
      const loads = items.map((item, idx) => ({
        id: `PJ-AUTO-${idx + 1}`,
        name: `Projeksiyon Faz ${item.ph} (${item.q}x Projektör)`,
        powerW: singleWatt,
        qty: item.q,
        pf,
      }));
      const circuits = items.map((item, idx) => ({
        id: `C-PJ-${idx + 1}`,
        name: `Linye-${idx + 1} (${item.ph} · ${item.q}x Projektör)`,
        loadIds: [`PJ-AUTO-${idx + 1}`],
        phase: item.ph,
        cableMm2,
        lengthM,
        ampacityA,
        breakerIcuKa: baseC?.breakerIcuKa,
        prospectiveFaultKa: baseC?.prospectiveFaultKa,
        tripCurve: baseC?.tripCurve,
        inrushA: baseC?.inrushA,
        inrushMultiplier: baseC?.inrushMultiplier,
        selectivityVerified: baseC?.selectivityVerified,
      }));
      return { loads, circuits, supply: electrical.supply };
    };

    if (electrical.loads.length === 0) {
      const singleWatt = interProjectorAnalysis.projectors[0]?.powerW || 1350;
      const balanced = buildBalancedPjSetup(singleWatt);
      return {
        ...electrical,
        supply: balanced.supply,
        loads: balanced.loads,
        circuits: electrical.circuits.length <= 1 ? balanced.circuits : electrical.circuits,
      };
    }

    const hasStaleAutoLabel = electrical.circuits.some(c => /(\d+)x\s*Projektör/i.test(c.name) && Number(c.name.match(/(\d+)x\s*Projektör/i)?.[1]) !== totalPj);
    const hasPfMismatch = pjLoads.some(l => l.id.startsWith('PJ-AUTO-') && l.pf !== undefined && Math.abs(l.pf - (electrical.supply.defaultPf || 1)) > 0.01);
    if (pjLoads.length >= 1 && (pjQty !== totalPj || hasStaleAutoLabel || hasPfMismatch || (is3Phase && totalPj > 1 && electrical.loads.length === 1))) {
      const singleLoad = pjLoads[0];
      const allLoadsArePj = pjLoads.length === electrical.loads.length;
      if (allLoadsArePj || (is3Phase && totalPj > 1 && electrical.loads.length === 1)) {
        const balanced = buildBalancedPjSetup(singleLoad.powerW > 0 ? singleLoad.powerW : 1350, electrical.supply.defaultPf || singleLoad.pf || 1);
        return {
          ...electrical,
          supply: balanced.supply,
          loads: balanced.loads,
          circuits: electrical.circuits.length <= pjLoads.length ? balanced.circuits : electrical.circuits,
        };
      }
      return {
        ...electrical,
        loads: electrical.loads.map(l =>
          l.id === singleLoad.id ? { ...l, qty: Math.max(1, totalPj - (pjQty - (l.qty || 0))) } : l
        ),
      };
    }
    return electrical;
  }, [electrical, interProjectorAnalysis]);

  const canonicalProjection = useMemo(() => {
    if (ipSurfaces.length === 0) {
      return {
        ...projectionSnap,
        projectorName: canonicalProjectorModel,
        ansiLumens: canonicalUnitLumens,
      };
    }
    const s0 = ipSurfaces[0];
    const pjCount0 = Math.max(1, (s0.cols || 1) * (s0.rows || 1));
    const s0Ext = s0 as unknown as {
      singleProjWidthM?: number;
      projW?: number;
      projH?: number;
      customW?: number;
      customH?: number;
    };
    const tr0 = s0.throwRatio > 0 ? s0.throwRatio : 0.8;
    const dist0 = s0.throwDistM > 0 ? s0.throwDistM : 4.5;
    const w0 = s0Ext.singleProjWidthM && s0Ext.singleProjWidthM > 0
      ? +s0Ext.singleProjWidthM.toFixed(2)
      : (interProjectorAnalysis.projectors[0]?.singleWidthM || +(dist0 / tr0).toFixed(2));
    const pW0 = s0Ext.projW || s0Ext.customW || 1920;
    const pH0 = s0Ext.projH || s0Ext.customH || 1200;

    const snapTr = projectionSnap.throwRatio ?? 0;
    const snapCalcTr = projectionSnap.imageWidthM > 0 && projectionSnap.distanceM > 0
      ? projectionSnap.distanceM / projectionSnap.imageWidthM
      : 0;
    const hasInternalConflict = !projectionSnap.distanceM || !projectionSnap.imageWidthM
      || Math.abs(snapCalcTr - snapTr) > 0.08
      || Math.abs(snapTr - tr0) > 0.05
      || Math.abs(projectionSnap.distanceM - dist0) > 0.05
      || Math.abs(projectionSnap.imageWidthM - w0) > 0.05;

    if (!hasInternalConflict) {
      return {
        ...projectionSnap,
        projectorName: `${pjCount0}x ${canonicalProjectorModel}`,
        ansiLumens: canonicalUnitLumens,
      };
    }

    return {
      ...projectionSnap,
      screenName: s0.name || projectionSnap.screenName,
      projectorName: `${pjCount0}x ${canonicalProjectorModel}`,
      ansiLumens: canonicalUnitLumens,
      distanceM: dist0,
      throwRatio: tr0,
      imageWidthM: w0,
      resolution: `${pW0}×${pH0}`,
      aspectW: 16,
      aspectH: pW0 === 1920 && pH0 === 1200 ? 10 : Math.max(1, Math.round((16 * pH0) / pW0)),
      throwMin: projectionSnap.throwMin > 0 && projectionSnap.throwMin <= tr0
        ? projectionSnap.throwMin
        : +(tr0 * 0.9).toFixed(2),
      throwMax: projectionSnap.throwMax > 0 && projectionSnap.throwMax >= tr0
        ? projectionSnap.throwMax
        : +(tr0 * 1.15).toFixed(2),
    };
  }, [ipSurfaces, projectionSnap, interProjectorAnalysis.projectors, canonicalProjectorModel, canonicalUnitLumens]);

  const effectiveProjectionScreens = useMemo(() => {
    return projectionScreens
      .filter(sc => {
        if (!sc.includeInReport || sc.snap.imageWidthM <= 0 || sc.snap.distanceM <= 0) return false;
        // İçerik Planlayıcı aktifken dokunulmamış varsayılan 4×2.25m (5.68m, TR 1.42) ekranı rapora sızdırma
        const isUntouchedDefault =
          ipSurfaces.length > 0 &&
          sc.id === 'proj-scr-1' &&
          Math.abs(sc.snap.imageWidthM - 4) < 0.05 &&
          Math.abs(sc.snap.distanceM - 5.68) < 0.05 &&
          Math.abs((sc.snap.throwRatio ?? 0) - 1.42) < 0.05;
        return !isUntouchedDefault;
      })
      .map((sc, idx) => {
        const scrName = (sc.name || sc.snap.screenName || '').trim().toLowerCase();
        const matchedIp = canonicalIpSurfaces.find(
          s => s.id === sc.id || s.name.trim().toLowerCase() === scrName
        ) || canonicalIpSurfaces[idx];
        const pjCount = matchedIp ? Math.max(1, (matchedIp.cols || 1) * (matchedIp.rows || 1)) : 1;
        if (!matchedIp) {
          return {
            ...sc.snap,
            screenName: sc.name || sc.snap.screenName,
            screenPhotoUrl: sc.photoUrl ?? sc.snap.screenPhotoUrl,
            projectorName: canonicalProjectorModel,
            ansiLumens: canonicalUnitLumens,
          };
        }
        const mExt = matchedIp as unknown as {
          singleProjWidthM?: number;
          projW?: number;
          projH?: number;
          customW?: number;
          customH?: number;
        };
        const trIp = matchedIp.throwRatio > 0 ? matchedIp.throwRatio : (sc.snap.throwRatio || 0.8);
        const distIp = matchedIp.throwDistM > 0 ? matchedIp.throwDistM : (sc.snap.distanceM || 4.5);
        const wIp = mExt.singleProjWidthM && mExt.singleProjWidthM > 0
          ? +mExt.singleProjWidthM.toFixed(2)
          : +(distIp / Math.max(0.1, trIp)).toFixed(2);
        const pWIp = mExt.projW || mExt.customW || 1920;
        const pHIp = mExt.projH || mExt.customH || 1200;
        const aspectHIp = pWIp === 1920 && pHIp === 1200 ? 10 : Math.max(1, Math.round((16 * pHIp) / Math.max(1, pWIp)));
        return {
          ...sc.snap,
          screenName: matchedIp.name || sc.name || sc.snap.screenName,
          screenPhotoUrl: sc.photoUrl ?? sc.snap.screenPhotoUrl,
          projectorName: `${pjCount}x ${canonicalProjectorModel}`,
          ansiLumens: canonicalUnitLumens,
          distanceM: distIp,
          throwRatio: trIp,
          imageWidthM: wIp,
          resolution: `${pWIp}×${pHIp}`,
          aspectW: 16,
          aspectH: aspectHIp,
        };
      });
  }, [projectionScreens, ipSurfaces.length, canonicalIpSurfaces, canonicalProjectorModel, canonicalUnitLumens]);

  const effectiveMappingScreens = useMemo(() => {
    return mappingScreens
      .filter(sc => {
        if (!sc.includeInReport || (sc.slots.length === 0 && !sc.photoUrl)) return false;
        // İçerik Planlayıcı aktifken varsayılan 3x 1920×1080 (4992×1080) şablon ekranını gizle
        const isUntouchedDefault =
          ipSurfaces.length > 0 &&
          !sc.photoUrl &&
          sc.name === 'Ekran / Duvar 1' &&
          sc.slots.length === 3 &&
          sc.slots.every(sl => sl.w === 1920 && sl.h === 1080);
        return !isUntouchedDefault;
      })
      .map(sc => ({
        name: sc.name,
        photoUrl: sc.photoUrl,
        slots: sc.slots,
        content: sc.content,
        gamma: sc.gamma,
      }));
  }, [mappingScreens, ipSurfaces.length]);

  // 3. TEKİL RAPOR PAYLOAD'U & ÇAPRAZ DOĞRULAMA + HTML ÜRETİMİ
  const scenarios = useMemo(() => {
    return canonicalIpSurfaces.map((s, idx) => {
      const sExt = s as unknown as {
        effectiveWidthM?: number;
        effectiveHeightM?: number;
        projW?: number;
        projH?: number;
        projNetW?: number;
        projNetH?: number;
        netW?: number;
        netH?: number;
        lensModel?: string;
        projectorModel?: string;
      };
      const pjCount = Math.max(1, (s.cols || 1) * (s.rows || 1));
      const matchedPhoto = activePhotometricSurfaces.find(ps => ps.surfaceId === s.id);
      const matchedPj = interProjectorAnalysis.projectors.find(pj => pj.surfaceId === s.id);
      const pW = sExt.projW || 1920;
      const pH = sExt.projH || 1200;
      const ovPx = s.cols > 1 ? Math.round(pW * ((s.overlapX ?? 15) / 100)) : 0;
      const combW = sExt.projNetW || (s.cols * pW - Math.max(0, s.cols - 1) * ovPx);
      const combH = sExt.projNetH || (s.rows * pH);
      return {
        scenarioId: `SCN-${idx + 1}-${s.id}`,
        surfaceId: s.id,
        surfaceName: s.name,
        projectorCount: pjCount,
        projectorModels: [sExt.projectorModel || matchedPj?.model || canonicalProjectorModel],
        lensModels: [sExt.lensModel || matchedPj?.lensModel || canonicalProjection?.lensName || 'Standart Lens'],
        unitLumens: canonicalUnitLumens,
        unitPowerW: matchedPj?.powerW || 0,
        throwDistM: s.throwDistM,
        imageWidthM: sExt.effectiveWidthM || s.widthM,
        imageHeightM: sExt.effectiveHeightM || s.heightM,
        overlapPct: s.cols > 1 ? (s.overlapX ?? 15) : 0,
        combinedW: combW,
        combinedH: combH,
        canvasW: sExt.netW || combW,
        canvasH: sExt.netH || combH,
      };
    });
  }, [canonicalIpSurfaces, activePhotometricSurfaces, interProjectorAnalysis, canonicalProjection, canonicalProjectorModel, canonicalUnitLumens]);

  const reportPayload: ReportPayload = useMemo(() => ({
    lang,
    reportMode,
    meta,
    sections,
    scenarios,
    room3dSnapshotUrl: snapshots[0] || meta.room3dSnapshotUrl,
    room3dSnapshots: snapshots,
    architecturalPlanSvg,
    interProjectorAnalysis,
    projection: canonicalProjection,
    projectionScreens: effectiveProjectionScreens,
    lux: (() => {
      if (!luxSnap) return luxSnap;
      if (activePhotometricSurfaces.length === 0 && effectiveProjectionScreens.length === 1 && canonicalProjection && canonicalProjection.imageWidthM > 0) {
        const syncedH = +(canonicalProjection.imageWidthM * (canonicalProjection.aspectH / Math.max(1, canonicalProjection.aspectW))).toFixed(2);
        return {
          ...luxSnap,
          widthM: canonicalProjection.imageWidthM,
          heightM: syncedH,
        };
      }
      return luxSnap;
    })(),
    photometricSurfaces: activePhotometricSurfaces,
    mappingSlots: slots,
    mappingScreens: effectiveMappingScreens,
    led: ledSnap,
    electrical: effectiveElectrical,
    equipmentList,
    plannerSurfaces: canonicalIpSurfaces,
    enabledSurfaceIds,
  }), [
    lang,
    reportMode,
    meta,
    snapshots,
    sections,
    architecturalPlanSvg,
    interProjectorAnalysis,
    canonicalProjection,
    effectiveProjectionScreens,
    luxSnap,
    activePhotometricSurfaces,
    slots,
    effectiveMappingScreens,
    ledSnap,
    effectiveElectrical,
    equipmentList,
    canonicalIpSurfaces,
    enabledSurfaceIds,
  ]);

  const validationRes = useMemo(() => validateReportConsistency(reportPayload), [reportPayload]);
  const html = useMemo(() => buildReportHtml(reportPayload), [reportPayload]);

  const printPdf = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();

    let printed = false;
    const triggerPrint = () => {
      if (printed || w.closed) return;
      printed = true;
      w.print();
    };

    const imgs = Array.from(w.document.images || []);
    const pending = imgs.filter(img => !img.complete).map(
      img => new Promise<void>(res => {
        img.addEventListener('load', () => res(), { once: true });
        img.addEventListener('error', () => res(), { once: true });
      }),
    );

    if (pending.length === 0) {
      setTimeout(triggerPrint, 250);
    } else {
      Promise.all(pending).then(() => setTimeout(triggerPrint, 150));
      setTimeout(triggerPrint, 2000);
    }
  };

  const toggle = (k: keyof ReportSectionFlags) => setSections(s => ({ ...s, [k]: !s[k] }));

  if (presentation) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
        <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <b>MÜŞTERİ SUNUM MODU — {meta.projectName} ({meta.customer})</b>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 font-semibold rounded text-white shadow" onClick={printPdf}>🖨 PDF Yazdır / Kaydet</button>
            <button className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200" onClick={() => setPresentation(false)}>✕ Sunumdan Çık</button>
          </div>
        </div>
        <iframe title="sunum" srcDoc={html} className="flex-1 w-full bg-white" />
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4 h-full">
      {/* SOL KONTROL VE YAPILANDIRMA PANELİ */}
      <div className="space-y-3 p-3.5 rounded border border-slate-700 bg-slate-900 overflow-auto text-xs" style={{ maxHeight: '88vh' }}>
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-sky-400">Müşteri Raporu & Çizim Stüdyosu</h2>
          <span className="text-[10px] text-slate-400 font-mono">v2.4 Pro</span>
        </div>

        {/* Dil, Rapor Modu, Firma Logosu ve Müşteri Logosu */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              Rapor Dili
              <select className="inp font-semibold" value={lang} onChange={e => setLang(e.target.value as ReportLang)}>
                <option value="tr">🇹🇷 Türkçe</option>
                <option value="en">🇬🇧 English</option>
              </select>
            </label>
            <label className="block">
              Rapor Modu
              <select className="inp font-semibold" value={reportMode} onChange={e => setReportMode(e.target.value as 'design' | 'as_built')}>
                <option value="design">📐 Tasarım Raporu</option>
                <option value="as_built">🏗️ Uygulama / Saha</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">Firma Logosu</span>
                {meta.companyLogoDataUrl && (
                  <button type="button" onClick={() => setMeta({ companyLogoDataUrl: undefined })} className="text-[10px] text-rose-400 hover:text-rose-300">Sil</button>
                )}
              </div>
              <label className="block cursor-pointer px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-center text-[10.5px] text-slate-200">
                {meta.companyLogoDataUrl ? '🖼️ Logoyu Değiştir' : '🖼️ Logo Yükle'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const rd = new FileReader();
                    rd.onload = () => setMeta({ companyLogoDataUrl: rd.result as string });
                    rd.readAsDataURL(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {meta.companyLogoDataUrl && <img src={meta.companyLogoDataUrl} alt="Firma Logosu" className="h-8 mx-auto object-contain rounded bg-white/90 p-0.5" />}
            </div>
            <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">Müşteri Logosu</span>
                {meta.customerLogoDataUrl && (
                  <button type="button" onClick={() => setMeta({ customerLogoDataUrl: undefined })} className="text-[10px] text-rose-400 hover:text-rose-300">Sil</button>
                )}
              </div>
              <label className="block cursor-pointer px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-center text-[10.5px] text-slate-200">
                {meta.customerLogoDataUrl ? '🖼️ Logoyu Değiştir' : '🖼️ Logo Yükle'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const rd = new FileReader();
                    rd.onload = () => setMeta({ customerLogoDataUrl: rd.result as string });
                    rd.readAsDataURL(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {meta.customerLogoDataUrl && <img src={meta.customerLogoDataUrl} alt="Müşteri Logosu" className="h-8 mx-auto object-contain rounded bg-white/90 p-0.5" />}
            </div>
          </div>
        </div>

        {/* 3B & 2B GÖRSEL SİMÜLASYON VE PAFTA KARTI */}
        <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center">
            <b className="text-amber-400 text-[11px]">📸 3B & 2B Görsel Galerisi ({snapshots.length})</b>
            {snapshots.length > 0 && (
              <button
                className="text-[10px] text-red-400 hover:text-red-300 underline"
                onClick={() => setMeta({ room3dSnapshotUrl: undefined, room3dSnapshots: [] })}
              >
                Tümünü Temizle
              </button>
            )}
          </div>

          {snapshots.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {snapshots.map((url, idx) => (
                  <div key={idx} className="relative group rounded border border-sky-900/60 overflow-hidden bg-slate-900">
                    <img
                      src={url}
                      alt={`Görsel #${idx + 1}`}
                      className="w-full h-20 object-cover"
                    />
                    <div className="absolute top-1 left-1 bg-black/75 text-[9px] text-white px-1.5 py-0.5 rounded font-mono">
                      #{idx + 1}
                    </div>
                    <button
                      title="Bu Görseli Sil"
                      onClick={() => {
                        const updated = snapshots.filter((_, i) => i !== idx);
                        setMeta({
                          room3dSnapshots: updated,
                          room3dSnapshotUrl: updated[0] || undefined,
                        });
                      }}
                      className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-500 text-white rounded w-4 h-4 flex items-center justify-center text-[10px] shadow font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span>✓ Toplam {snapshots.length} adet 3B/2B görsel rapora dahil edildi</span>
              </div>
            </div>
          ) : (
            <div className="text-[10.5px] text-slate-400 leading-relaxed bg-slate-900/80 p-2 rounded border border-slate-800">
              💡 <b>Görsel Eklemek İçin:</b> <i>"3D Oda"</i>, <i>"2B Açınım"</i> veya <i>"CAD Çizim"</i> sekmelerindeki <b>"📋 Rapora Ekle"</b> butonlarına basarak dilediğiniz kadar 3B ve 2B açınım görseli ekleyebilir veya aşağıdan dosya yükleyebilirsiniz.
            </div>
          )}

          <label className="block">
            <span className="text-[10px] text-slate-400">+ Harici 3B/2B Render veya Görsel Ekle</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="inp text-[10px] !mt-1"
              onChange={async e => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                const readAsDataUrl = (file: File): Promise<string> =>
                  new Promise<string>((resolve, reject) => {
                    const rd = new FileReader();
                    rd.onload = () => resolve(rd.result as string);
                    rd.onerror = reject;
                    rd.readAsDataURL(file);
                  });
                const urls = await Promise.all(files.map(readAsDataUrl));
                const nextSnapshots = [...snapshots, ...urls];
                setMeta({
                  room3dSnapshots: nextSnapshots,
                  room3dSnapshotUrl: nextSnapshots[0],
                });
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {/* Müşteri ve Proje Bilgileri */}
        <label className="block">
          Rapor Başlığı (AV Tasarım Başlığı)
          <input
            className="inp font-medium"
            placeholder="AV MÜHENDİSLİK & TASARIM RAPORU"
            value={meta.reportTitle || ''}
            onChange={e => setMeta({ reportTitle: e.target.value })}
          />
        </label>
        <label className="block">
          Firma Adı
          <input className="inp font-medium" value={meta.companyName} onChange={e => setMeta({ companyName: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>Müşteri / Kurum<input className="inp" value={meta.customer} onChange={e => setMeta({ customer: e.target.value })} /></label>
          <label>Proje Adı<input className="inp" value={meta.projectName} onChange={e => setMeta({ projectName: e.target.value })} /></label>
          <label>Konum<input className="inp" value={meta.location} onChange={e => setMeta({ location: e.target.value })} /></label>
          <label>Kategori<input className="inp" value={meta.category} onChange={e => setMeta({ category: e.target.value })} /></label>
          <label>Tarih<input className="inp" type="date" value={meta.date} onChange={e => setMeta({ date: e.target.value })} /></label>
          <label>Revizyon No<input className="inp" type="number" min="1" value={meta.revision} onChange={e => setMeta({ revision: Math.max(1, +e.target.value) })} /></label>
        </div>
        <label className="block">
          Proje Özeti
          <textarea className="inp h-14" value={meta.description} onChange={e => setMeta({ description: e.target.value })} />
        </label>
        <label className="block">
          Özel Mühendislik Notları
          <input className="inp" placeholder="Opsiyonel şantiye veya müşteri notu..." value={meta.notes || ''} onChange={e => setMeta({ notes: e.target.value })} />
        </label>

        {/* RAPORA DAHİL EDİLECEK BÖLÜMLER */}
        <div className="border-t border-slate-800 pt-2.5 space-y-1.5">
          <div className="flex justify-between items-center">
            <b className="text-slate-200">Rapora Dahil Edilecek Bölümler</b>
            <button
              type="button"
              className="text-[10.5px] text-sky-400 hover:text-sky-300 underline"
              onClick={() => setSections(prev => ({
                ...prev,
                led: !prev.led,
              }))}
            >
              {sections.led ? 'LED Duvarı Çıkar' : '+ LED Duvarı Ekle'}
            </button>
          </div>
          {([
            ['summary', '1. Proje Özeti & Metrikler'],
            ['room3d', '2. 3B Simülasyon & 2B Görsel Paftalar'],
            ['architecturalPlan', '3. 2B Mimari Yerleşim & CAD Paftası'],
            ['projection', '4. Ekran, Projektör & Lens Hesapları'],
            ['lux', '5. Lux & Parlaklık Analizi'],
            ['multiProjector', '6. Çoklu Projektör & Piksel Haritalama'],
            ['led', '7. LED Duvar Spesifikasyonları'],
            ['electrical', '8. Elektrik Yük & Tek Hat Dağıtım Şeması'],
            ['assumptionsAndWarnings', '9. Şantiye Standartları & Teknik Uyarılar'],
          ] as [keyof ReportSectionFlags, string][]).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition">
                <input type="checkbox" checked={sections[k]} onChange={() => toggle(k)} />
                <span className={k === 'led' ? (sections.led ? 'text-amber-300 font-bold' : 'text-slate-400') : ''}>{label}</span>
              </label>
              {k === 'projection' && sections.projection && projectionScreens.length > 0 && (
                <div className="ml-6 mt-1 p-2 space-y-1 rounded bg-slate-900 border border-slate-800 text-[11px]">
                  <span className="text-sky-300 font-bold block text-[10.5px]">
                    Ekran, Projektör &amp; Lens Duvarları ({projectionScreens.filter(s => s.includeInReport).length}/{projectionScreens.length}):
                  </span>
                  {projectionScreens.map(sc => (
                    <label key={sc.id} className="flex items-center justify-between gap-2 cursor-pointer text-slate-300 hover:text-white">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={sc.includeInReport}
                          onChange={e => updateProjectionScreen(sc.id, { includeInReport: e.target.checked })}
                          className="accent-emerald-500"
                        />
                        <span className="truncate">{sc.name}</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {sc.snap?.imageWidthM > 0 ? `${sc.snap.imageWidthM.toFixed(2)}m` : 'Boş'}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {k === 'lux' && sections.lux && (
                <div className="ml-6 mt-1 p-2 space-y-1.5 rounded bg-slate-900 border border-slate-800 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-emerald-400 font-bold text-[10.5px]">
                      ✓ Fotometrik Yüzeyler ({activePhotometricSurfaces.length}/{reportPhotometricSurfaces.length}):
                    </span>
                    {reportPhotometricSurfaces.length > 0 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setHiddenLuxIds([])}
                          className="px-1.5 py-0.5 rounded bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 text-[9.5px]"
                        >
                          Tümü
                        </button>
                        <button
                          type="button"
                          onClick={() => setHiddenLuxIds(reportPhotometricSurfaces.map(x => x.surfaceId))}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9.5px]"
                        >
                          Hiçbiri
                        </button>
                      </div>
                    )}
                  </div>
                  {reportPhotometricSurfaces.length > 0 ? (
                    reportPhotometricSurfaces.map(s => {
                      const isIncluded = !hiddenLuxIds.includes(s.surfaceId);
                      const isStored = Boolean(surfacePhotometrics[s.surfaceId]);
                      return (
                        <div key={s.surfaceId} className="flex items-center justify-between gap-1.5 text-slate-300 py-0.5 border-b border-slate-800/60 last:border-0">
                          <label className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer hover:text-white">
                            <input
                              type="checkbox"
                              checked={isIncluded}
                              onChange={e => {
                                if (e.target.checked) {
                                  setHiddenLuxIds(prev => prev.filter(id => id !== s.surfaceId));
                                } else {
                                  setHiddenLuxIds(prev => (prev.includes(s.surfaceId) ? prev : [...prev, s.surfaceId]));
                                }
                              }}
                              className="accent-emerald-500"
                            />
                            <span className={`truncate font-medium ${isIncluded ? 'text-sky-300' : 'text-slate-500 line-through'}`}>
                              {s.surfaceId.startsWith('quick-') ? '💡 ' : '🧱 '}
                              {s.surfaceName}
                            </span>
                          </label>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-slate-400 font-mono">
                              {(s.widthM * s.heightM).toFixed(1)}m² · {Math.round(s.avgLux)}lx
                            </span>
                            {isStored && (
                              <button
                                type="button"
                                onClick={() => {
                                  usePhotometricStore.setState(st => {
                                    const next = { ...st.surfacePhotometrics };
                                    delete next[s.surfaceId];
                                    return { surfacePhotometrics: next };
                                  });
                                  setHiddenLuxIds(prev => prev.filter(id => id !== s.surfaceId));
                                }}
                                className="px-1 py-0.2 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-[9.5px]"
                                title="Bu fotometrik kaydı kalıcı olarak sil"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-[10px] text-slate-500 italic block">
                      Henüz yüzey eklenmedi. "Lux & Parlaklık" sekmesinden aktarabilirsiniz.
                    </span>
                  )}
                </div>
              )}
              {k === 'architecturalPlan' && sections.architecturalPlan && (
                <div className="flex items-center gap-1.5 ml-6 py-1 px-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                  <span className="text-slate-400 font-medium">🔄 Pafta Yönü:</span>
                  {([0, 90, 180, 270] as const).map(deg => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => {
                        setArchRotation(deg);
                        setMeta({ archPlanRotation: deg });
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                        archRotation === deg
                          ? 'bg-sky-500 text-white shadow'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              )}
              {k === 'multiProjector' && sections.multiProjector && (
                <div className="ml-6 mt-1 p-2 space-y-1.5 rounded bg-slate-900 border border-slate-800 text-[11px]">
                  {mappingScreens.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-sky-300 font-bold block text-[10.5px]">Piksel Haritalama Ekranları:</span>
                      {mappingScreens.map(ms => (
                        <label key={ms.id} className="flex items-center justify-between gap-2 cursor-pointer text-slate-300 hover:text-white">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={ms.includeInReport}
                              onChange={e => updateMappingScreen(ms.id, { includeInReport: e.target.checked })}
                              className="accent-emerald-500"
                            />
                            <span className="truncate">{ms.name}</span>
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {ms.slots.length} PJ{ms.photoUrl ? ' · 🖼️' : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {ipSurfaces.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-slate-800/80">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-amber-300 font-bold text-[10.5px]">İçerik Planlayıcı Yüzeyleri ({enabledSurfaceIds.filter(id => ipSurfaces.some(s => s.id === id)).length}/{ipSurfaces.length}):</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEnabledSurfaceIds(ipSurfaces.map(s => s.id))}
                            className="px-1.5 py-0.5 rounded bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 text-[9.5px]"
                          >
                            Tümü
                          </button>
                          <button
                            type="button"
                            onClick={() => setEnabledSurfaceIds([])}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9.5px]"
                          >
                            Hiçbiri
                          </button>
                        </div>
                      </div>
                      {ipSurfaces.map(s => {
                        const isChecked = enabledSurfaceIds.includes(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white transition">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setEnabledSurfaceIds(prev => [...prev, s.id]);
                                } else {
                                  setEnabledSurfaceIds(prev => prev.filter(id => id !== s.id));
                                }
                              }}
                            />
                            <span className={isChecked ? 'text-sky-300 font-semibold' : 'text-slate-400'}>
                              {s.name} ({s.cols}×{s.rows} PJ)
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* ANALİZ & HESAPLAMA ZİNCİRLERİ (SEÇMELİ ALT BLOKLAR) */}
          <div className="pt-2.5 mt-2 border-t border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <b className="text-cyan-300 text-[11px]">Analiz &amp; Hesap Zincirleri (Seçmeli)</b>
              <button
                type="button"
                className="text-[10px] text-sky-400 hover:text-sky-300 underline"
                onClick={() => {
                  const anyOff =
                    sections.includePixelMapChain === false ||
                    sections.includeGeometricChain === false ||
                    sections.includeBrightnessChain === false ||
                    sections.includeViewingQuality === false ||
                    sections.includePointLuxMap === false ||
                    sections.includeFeasibilityAndRecs === false ||
                    sections.includeValidationEngine === false;
                  setSections(prev => ({
                    ...prev,
                    includePixelMapChain: anyOff,
                    includeGeometricChain: anyOff,
                    includeBrightnessChain: anyOff,
                    includeViewingQuality: anyOff,
                    includePointLuxMap: anyOff,
                    includeFeasibilityAndRecs: anyOff,
                    includeValidationEngine: anyOff,
                  }));
                }}
              >
                {sections.includePixelMapChain === false ||
                sections.includeGeometricChain === false ||
                sections.includeBrightnessChain === false ||
                sections.includeViewingQuality === false ||
                sections.includePointLuxMap === false ||
                sections.includeFeasibilityAndRecs === false ||
                sections.includeValidationEngine === false
                  ? 'Tümünü Aç'
                  : 'Tümünü Kapat'}
              </button>
            </div>
            {([
              ['includePixelMapChain', '📐 8 Adımlı Pixel Map & Çözünürlük Zinciri'],
              ['includeGeometricChain', '🎯 7 Adımlı Geometrik & Mapping Zinciri'],
              ['includeBrightnessChain', '📊 9 Adımlı Işık, Kayıp & Parlaklık Zinciri'],
              ['includeViewingQuality', '👁️ 7 Adımlı İzleme & Görüntü Kalitesi Analizi'],
              ['includePointLuxMap', '☀️ 9-Bölge Noktasal Lux Dağılım Haritası'],
              ['includeFeasibilityAndRecs', '⚠️ Efektif Piksel, 5 Kriterli Hata & Öneriler'],
              ['includeValidationEngine', '🛡️ Mühendislik Çapraz Doğrulama Motoru'],
            ] as [keyof ReportSectionFlags, string][]).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300 hover:text-white transition">
                <input
                  type="checkbox"
                  checked={sections[k] !== false}
                  onChange={() => setSections(s => ({ ...s, [k]: s[k] === false }))}
                  className="accent-cyan-500"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        

        {/* AKSİYON BUTONLARI */}
        <div className="flex flex-col gap-2 pt-3 border-t border-slate-800">
          <button
            className="w-full py-2 bg-sky-700 hover:bg-sky-600 rounded font-bold text-white shadow flex items-center justify-center gap-1.5"
            onClick={printPdf}
          >
            <span>🖨 Müşteri Raporunu PDF Olarak Yazdır / Kaydet</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded font-semibold text-white shadow text-[11px]"
              onClick={() => setPresentation(true)}
            >
              🖥 Tam Ekran Sunum
            </button>
            <button
              className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded font-semibold text-slate-300 text-[11px]"
              onClick={() => download(`${meta.projectName || 'rapor'}.html`, html, 'text/html')}
            >
              💾 HTML İndir
            </button>
          </div>
        </div>
      </div>

      {/* SAĞ CANLI RAPOR ÖNİZLEME PENCERESİ */}
      <div className="h-full min-h-[75vh] border border-slate-800 rounded overflow-hidden bg-slate-950 flex flex-col shadow-2xl">
        <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-[11px] text-slate-400 font-mono">
          <span>CANLI MÜŞTERİ RAPORU ÖNİZLEMESİ</span>
          <div className="flex items-center gap-3">
            <span>Toplam Cihaz: <b className="text-sky-300">{interProjectorAnalysis.totalProjectors}</b></span>
            <span>Toplam Güç: <b className="text-amber-300">{(interProjectorAnalysis.totalPowerW / 1000).toFixed(2)} kW</b></span>
            <span>Toplam Akım (Ib): <b className="text-rose-400">{(interProjectorAnalysis.totalPowerW / (230 * 0.95)).toFixed(1)} A</b></span>
            <span className={validationRes.hasCriticalErrors ? 'text-rose-400 font-bold' : validationRes.warningCount > 0 ? 'text-amber-300 font-bold' : 'text-emerald-400 font-bold'}>
              {validationRes.hasCriticalErrors
                ? `⛔ Taslak (${validationRes.errorCount} Hata · %${validationRes.consistencyScorePct})`
                : validationRes.warningCount > 0
                ? `⚠ ${validationRes.warningCount} Uyarı (%${validationRes.consistencyScorePct})`
                : `✓ Doğrulandı (%${validationRes.consistencyScorePct})`}
            </span>
          </div>
        </div>
        <iframe title="rapor-onizleme" srcDoc={html} className="w-full flex-1 bg-white" />
      </div>
    </div>
  );
}
