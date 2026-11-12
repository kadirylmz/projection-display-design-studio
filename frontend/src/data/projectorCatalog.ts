export interface CatalogProjector {
  id: string;
  manufacturer: 'Epson' | 'Vivitek' | 'Sharp / NEC' | 'Panasonic' | 'Optoma' | 'Barco' | 'Christie';
  model: string;
  ansiLumens: number;
  nativeW: number;
  nativeH: number;
  aspect: string;
  technology: string;
  lensMount: string;
  builtInThrow?: { min: number; max: number };
  notes?: string;
}

export interface CatalogLens {
  id: string;
  manufacturer: string;
  model: string;
  lensMount: string;
  throwMin: number;
  throwMax: number;
  notes?: string;
}

export const CATALOG_PROJECTORS: CatalogProjector[] = [
  // ================= EPSON =================
  {
    id: 'epson-eb-pu1007b',
    manufacturer: 'Epson',
    model: 'EB-PU1007B',
    ansiLumens: 7000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '3LCD Laser',
    lensMount: 'Epson-ELPL',
    notes: 'Kompakt değiştirilebilir lensli sergi/müze projektörü',
  },
  {
    id: 'epson-eb-pu2010b',
    manufacturer: 'Epson',
    model: 'EB-PU2010B',
    ansiLumens: 10000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '3LCD Laser',
    lensMount: 'Epson-ELPL',
    notes: 'Büyük mekan / mapping standart 10K lümen',
  },
  {
    id: 'epson-eb-pu2220b',
    manufacturer: 'Epson',
    model: 'EB-PU2220B',
    ansiLumens: 20000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '3LCD Laser',
    lensMount: 'Epson-ELPL-High',
    notes: 'Yüksek parlaklık 20K lümen sahne/cephe mapping',
  },
  {
    id: 'epson-eb-l770u',
    manufacturer: 'Epson',
    model: 'EB-L770U',
    ansiLumens: 7000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '3LCD Laser',
    lensMount: 'Dahili',
    builtInThrow: { min: 1.35, max: 2.20 },
    notes: 'Dahili 1.6x zoom lensli kurulum projektörü',
  },

  // ================= VIVITEK =================
  {
    id: 'vivitek-du7098z',
    manufacturer: 'Vivitek',
    model: 'DU7098Z',
    ansiLumens: 7000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Vivitek-D70',
    notes: '7 farklı bayonet lens destekli 7K lümen lazer',
  },
  {
    id: 'vivitek-du8195z',
    manufacturer: 'Vivitek',
    model: 'DU8195Z',
    ansiLumens: 13500,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Vivitek-D88',
    notes: 'D88 serisi motorize lenslerle 13.5K lümen büyük mekan',
  },
  {
    id: 'vivitek-du9800z',
    manufacturer: 'Vivitek',
    model: 'DU9800Z',
    ansiLumens: 18000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Vivitek-D98',
    notes: '18K lümen yüksek parlaklık D98 serisi',
  },

  // ================= SHARP / NEC =================
  {
    id: 'sharp-nec-pa1004ul',
    manufacturer: 'Sharp / NEC',
    model: 'PA1004UL',
    ansiLumens: 10000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '3LCD Laser',
    lensMount: 'NEC-NP',
    notes: 'Ultra sessiz müze/sergi 10K lümen (NP40/41/43/44 serisi)',
  },
  {
    id: 'sharp-nec-pa1505ul',
    manufacturer: 'Sharp / NEC',
    model: 'PA1505UL',
    ansiLumens: 15000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '3LCD Laser',
    lensMount: 'NEC-NP',
    notes: '15K lümen filtre gerektirmeyen mühürlü optik',
  },
  {
    id: 'sharp-nec-p627ul',
    manufacturer: 'Sharp / NEC',
    model: 'P627UL',
    ansiLumens: 6200,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '3LCD Laser',
    lensMount: 'Dahili',
    builtInThrow: { min: 1.23, max: 2.00 },
    notes: 'Dahili zoom lensli 22 dB ultra sessiz projektör',
  },

  // ================= PANASONIC =================
  {
    id: 'panasonic-pt-rz990',
    manufacturer: 'Panasonic',
    model: 'PT-RZ990',
    ansiLumens: 9400,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Panasonic-DLE',
    notes: 'ET-DLE lens ailesi uyumlu 9.4K/10K sınıfı projektör',
  },
  {
    id: 'panasonic-pt-rz120',
    manufacturer: 'Panasonic',
    model: 'PT-RZ120',
    ansiLumens: 12000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Panasonic-DLE',
    notes: '12K lümen kompakt DLP (ET-DLE serisi)',
  },
  {
    id: 'panasonic-pt-mz880',
    manufacturer: 'Panasonic',
    model: 'PT-MZ880',
    ansiLumens: 8000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '3LCD Laser',
    lensMount: 'Panasonic-ELW',
    notes: '8K lümen 3LCD sergi/konferans projektörü',
  },

  // ================= OPTOMA =================
  {
    id: 'optoma-zu920tst',
    manufacturer: 'Optoma',
    model: 'ZU920TST',
    ansiLumens: 9800,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Dahili',
    builtInThrow: { min: 0.65, max: 0.75 },
    notes: 'Dahili kısa atım (0.65–0.75:1) motorize lensli 9.8K lümen',
  },
  {
    id: 'optoma-zu1050',
    manufacturer: 'Optoma',
    model: 'ZU1050',
    ansiLumens: 10000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Optoma-BX-CTA',
    notes: 'BX-CTA lens ailesiyle uyumlu 10K lümen',
  },
  {
    id: 'optoma-zu1300',
    manufacturer: 'Optoma',
    model: 'ZU1300',
    ansiLumens: 14400,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Optoma-BX-CTA',
    notes: '14.4K lümen büyük mekan / mapping projektörü',
  },

  // ================= BARCO =================
  {
    id: 'barco-g62-w11',
    manufacturer: 'Barco',
    model: 'G62-W11',
    ansiLumens: 11000,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Barco-G-Lens',
    notes: 'G-Lens ailesi ile 0.36:1 – 5.50:1 arası esnek kurulum',
  },
  {
    id: 'barco-udm-4k22',
    manufacturer: 'Barco',
    model: 'UDM-4K22',
    ansiLumens: 21000,
    nativeW: 3840,
    nativeH: 2400,
    aspect: '16:10',
    technology: '3-Chip DLP Laser',
    lensMount: 'Barco-TLD+',
    notes: '21K lümen 4K UHD 3-Chip DLP amiral gemisi (TLD+)',
  },

  // ================= CHRISTIE =================
  {
    id: 'christie-dwu880-gs',
    manufacturer: 'Christie',
    model: 'DWU880-GS',
    ansiLumens: 9500,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Christie-GS',
    notes: 'GS serisi 9.5K lümen müze ve etkinlik standardı',
  },
  {
    id: 'christie-dwu1100-gs',
    manufacturer: 'Christie',
    model: 'DWU1100-GS',
    ansiLumens: 11850,
    nativeW: 1920,
    nativeH: 1200,
    aspect: '16:10',
    technology: '1-Chip DLP Laser',
    lensMount: 'Christie-GS',
    notes: '11.85K lümen GS serisi profesyonel kurulum',
  },
];

export const CATALOG_LENSES: CatalogLens[] = [
  // ================= EPSON ELPL =================
  { id: 'epson-elplx02s', manufacturer: 'Epson', model: 'ELPLX02S (UST Zero-Offset)', lensMount: 'Epson-ELPL', throwMin: 0.35, throwMax: 0.35, notes: 'Sıfır ofset ultra kısa atım' },
  { id: 'epson-elplu03s', manufacturer: 'Epson', model: 'ELPLU03S (Short Throw)', lensMount: 'Epson-ELPL', throwMin: 0.48, throwMax: 0.57, notes: 'Kısa atım motorize zoom' },
  { id: 'epson-elplw05', manufacturer: 'Epson', model: 'ELPLW05 (Wide Zoom)', lensMount: 'Epson-ELPL', throwMin: 0.77, throwMax: 1.07, notes: 'Geniş açı zoom' },
  { id: 'epson-elplm08', manufacturer: 'Epson', model: 'ELPLM08 (Standard)', lensMount: 'Epson-ELPL', throwMin: 1.44, throwMax: 2.32, notes: 'Standart orta zoom' },
  { id: 'epson-elplm15', manufacturer: 'Epson', model: 'ELPLM15 (Middle Throw)', lensMount: 'Epson-ELPL', throwMin: 1.57, throwMax: 2.56, notes: 'Orta mesafe motorize zoom' },
  { id: 'epson-elpll08', manufacturer: 'Epson', model: 'ELPLL08 (Long Throw)', lensMount: 'Epson-ELPL', throwMin: 5.27, throwMax: 7.41, notes: 'Uzun mesafe tele zoom' },

  // Epson 20K (PU2220B uyumlu aynı seri / high-power)
  { id: 'epson-elplx02s-h', manufacturer: 'Epson', model: 'ELPLX02S (UST)', lensMount: 'Epson-ELPL-High', throwMin: 0.35, throwMax: 0.35 },
  { id: 'epson-elplu03s-h', manufacturer: 'Epson', model: 'ELPLU03S (Short)', lensMount: 'Epson-ELPL-High', throwMin: 0.48, throwMax: 0.57 },
  { id: 'epson-elplw06', manufacturer: 'Epson', model: 'ELPLW06 (Wide)', lensMount: 'Epson-ELPL-High', throwMin: 1.19, throwMax: 1.62 },
  { id: 'epson-elplm15-h', manufacturer: 'Epson', model: 'ELPLM15 (Middle)', lensMount: 'Epson-ELPL-High', throwMin: 1.57, throwMax: 2.56 },
  { id: 'epson-elpll08-h', manufacturer: 'Epson', model: 'ELPLL08 (Long)', lensMount: 'Epson-ELPL-High', throwMin: 5.27, throwMax: 7.41 },

  // ================= VIVITEK D88 / D98 / D70 =================
  { id: 'viv-d88-ust01b', manufacturer: 'Vivitek', model: 'D88-UST01B (UST)', lensMount: 'Vivitek-D88', throwMin: 0.38, throwMax: 0.38, notes: 'Ultra kısa atım sabit' },
  { id: 'viv-d88-st001', manufacturer: 'Vivitek', model: 'D88-ST001 (Short Fixed)', lensMount: 'Vivitek-D88', throwMin: 0.76, throwMax: 0.76, notes: 'Kısa atım sabit' },
  { id: 'viv-d88-wf18501', manufacturer: 'Vivitek', model: 'D88-WF18501 (Wide Zoom)', lensMount: 'Vivitek-D88', throwMin: 1.25, throwMax: 1.60, notes: 'Geniş/standart zoom' },
  { id: 'viv-d88-smlz01', manufacturer: 'Vivitek', model: 'D88-SMLZ01 (Standard)', lensMount: 'Vivitek-D88', throwMin: 1.73, throwMax: 2.27, notes: 'Standart zoom' },
  { id: 'viv-d88-loz101', manufacturer: 'Vivitek', model: 'D88-LOZ101 (Long Zoom 1)', lensMount: 'Vivitek-D88', throwMin: 2.22, throwMax: 3.67, notes: 'Uzun atım 1' },
  { id: 'viv-d88-loz201', manufacturer: 'Vivitek', model: 'D88-LOZ201 (Long Zoom 2)', lensMount: 'Vivitek-D88', throwMin: 3.58, throwMax: 5.38, notes: 'Uzun atım 2' },
  { id: 'viv-d88-ulz01', manufacturer: 'Vivitek', model: 'D88-ULZ01 (Ultra Long)', lensMount: 'Vivitek-D88', throwMin: 5.31, throwMax: 8.26, notes: 'Ultra uzun atım' },

  { id: 'viv-d98-0810', manufacturer: 'Vivitek', model: 'D98-0810 (Short Zoom)', lensMount: 'Vivitek-D98', throwMin: 0.84, throwMax: 1.03 },
  { id: 'viv-d98-1215', manufacturer: 'Vivitek', model: 'D98-1215 (Wide Zoom)', lensMount: 'Vivitek-D98', throwMin: 1.20, throwMax: 1.56 },
  { id: 'viv-d98-1520', manufacturer: 'Vivitek', model: 'D98-1520 (Standard)', lensMount: 'Vivitek-D98', throwMin: 1.50, throwMax: 2.00 },
  { id: 'viv-d98-2040', manufacturer: 'Vivitek', model: 'D98-2040 (Long)', lensMount: 'Vivitek-D98', throwMin: 2.00, throwMax: 4.00 },
  { id: 'viv-d98-4070', manufacturer: 'Vivitek', model: 'D98-4070 (Ultra Long)', lensMount: 'Vivitek-D98', throwMin: 4.00, throwMax: 7.00 },

  { id: 'viv-d70-st', manufacturer: 'Vivitek', model: 'D70-Short Zoom', lensMount: 'Vivitek-D70', throwMin: 0.77, throwMax: 1.10 },
  { id: 'viv-d70-wz', manufacturer: 'Vivitek', model: 'D70-Wide Zoom', lensMount: 'Vivitek-D70', throwMin: 1.25, throwMax: 1.60 },
  { id: 'viv-d70-std', manufacturer: 'Vivitek', model: 'D70-Standard Zoom', lensMount: 'Vivitek-D70', throwMin: 1.54, throwMax: 1.93 },
  { id: 'viv-d70-lt', manufacturer: 'Vivitek', model: 'D70-Long Zoom', lensMount: 'Vivitek-D70', throwMin: 1.93, throwMax: 2.90 },
  { id: 'viv-d70-slt', manufacturer: 'Vivitek', model: 'D70-Super Long', lensMount: 'Vivitek-D70', throwMin: 3.00, throwMax: 5.01 },

  // ================= SHARP / NEC =================
  { id: 'nec-np44ml', manufacturer: 'Sharp / NEC', model: 'NP44ML (UST)', lensMount: 'NEC-NP', throwMin: 0.32, throwMax: 0.32, notes: 'Ultra kısa atım ayna lens' },
  { id: 'nec-np40zl', manufacturer: 'Sharp / NEC', model: 'NP40ZL (Short Zoom)', lensMount: 'NEC-NP', throwMin: 0.79, throwMax: 1.11, notes: 'Kısa atım motorize zoom' },
  { id: 'nec-np41zl', manufacturer: 'Sharp / NEC', model: 'NP41ZL (Standard Zoom)', lensMount: 'NEC-NP', throwMin: 1.30, throwMax: 3.02, notes: 'Geniş aralıklı standart zoom' },
  { id: 'nec-np43zl', manufacturer: 'Sharp / NEC', model: 'NP43ZL (Long Zoom)', lensMount: 'NEC-NP', throwMin: 2.99, throwMax: 5.93, notes: 'Uzun atım tele zoom' },

  // ================= PANASONIC =================
  { id: 'pan-dle020', manufacturer: 'Panasonic', model: 'ET-DLE020 (UST Zoom)', lensMount: 'Panasonic-DLE', throwMin: 0.28, throwMax: 0.30, notes: 'L-tipi ultra kısa zoom' },
  { id: 'pan-dle060', manufacturer: 'Panasonic', model: 'ET-DLE060 (Short Zoom)', lensMount: 'Panasonic-DLE', throwMin: 0.60, throwMax: 0.80, notes: 'Kısa atım zoom' },
  { id: 'pan-dle085', manufacturer: 'Panasonic', model: 'ET-DLE085 (Wide Zoom)', lensMount: 'Panasonic-DLE', throwMin: 0.78, throwMax: 0.98, notes: 'Geniş açı zoom' },
  { id: 'pan-dle150', manufacturer: 'Panasonic', model: 'ET-DLE150 (Standard)', lensMount: 'Panasonic-DLE', throwMin: 1.30, throwMax: 1.89, notes: 'Standart zoom' },
  { id: 'pan-dle250', manufacturer: 'Panasonic', model: 'ET-DLE250 (Long Zoom)', lensMount: 'Panasonic-DLE', throwMin: 2.27, throwMax: 3.62, notes: 'Uzun atım zoom' },

  { id: 'pan-elw22', manufacturer: 'Panasonic', model: 'ET-ELW22 (Short Zoom)', lensMount: 'Panasonic-ELW', throwMin: 0.78, throwMax: 0.98 },
  { id: 'pan-els20', manufacturer: 'Panasonic', model: 'ET-ELS20 (Standard)', lensMount: 'Panasonic-ELW', throwMin: 1.61, throwMax: 2.76 },
  { id: 'pan-elt22', manufacturer: 'Panasonic', model: 'ET-ELT22 (Long)', lensMount: 'Panasonic-ELW', throwMin: 2.72, throwMax: 4.48 },

  // ================= OPTOMA BX-CTA =================
  { id: 'opt-cta16', manufacturer: 'Optoma', model: 'BX-CTA16 (UST)', lensMount: 'Optoma-BX-CTA', throwMin: 0.36, throwMax: 0.36, notes: 'Ultra kısa sabit' },
  { id: 'opt-cta17', manufacturer: 'Optoma', model: 'BX-CTA17 (Short Zoom)', lensMount: 'Optoma-BX-CTA', throwMin: 0.65, throwMax: 0.75, notes: 'Kısa zoom' },
  { id: 'opt-cta15', manufacturer: 'Optoma', model: 'BX-CTA15 (Wide Short)', lensMount: 'Optoma-BX-CTA', throwMin: 0.75, throwMax: 0.95, notes: 'Geniş kısa zoom' },
  { id: 'opt-cta01', manufacturer: 'Optoma', model: 'BX-CTA01 (Wide Zoom)', lensMount: 'Optoma-BX-CTA', throwMin: 0.95, throwMax: 1.22, notes: 'Geniş zoom' },
  { id: 'opt-cta03', manufacturer: 'Optoma', model: 'BX-CTA03 (Long Zoom)', lensMount: 'Optoma-BX-CTA', throwMin: 1.52, throwMax: 2.92, notes: 'Uzun zoom' },

  // ================= BARCO G-LENS & TLD+ =================
  { id: 'barco-g-ust', manufacturer: 'Barco', model: 'G-Lens UST 0.36:1', lensMount: 'Barco-G-Lens', throwMin: 0.36, throwMax: 0.36 },
  { id: 'barco-g-065', manufacturer: 'Barco', model: 'G-Lens 0.65–0.75:1', lensMount: 'Barco-G-Lens', throwMin: 0.65, throwMax: 0.75 },
  { id: 'barco-g-095', manufacturer: 'Barco', model: 'G-Lens 0.95–1.22:1', lensMount: 'Barco-G-Lens', throwMin: 0.95, throwMax: 1.22 },
  { id: 'barco-g-122', manufacturer: 'Barco', model: 'G-Lens 1.22–1.52:1', lensMount: 'Barco-G-Lens', throwMin: 1.22, throwMax: 1.52 },
  { id: 'barco-g-152', manufacturer: 'Barco', model: 'G-Lens 1.52–2.92:1', lensMount: 'Barco-G-Lens', throwMin: 1.52, throwMax: 2.92 },
  { id: 'barco-g-290', manufacturer: 'Barco', model: 'G-Lens 2.90–5.50:1', lensMount: 'Barco-G-Lens', throwMin: 2.90, throwMax: 5.50 },

  { id: 'barco-tld-038', manufacturer: 'Barco', model: 'TLD+ UST 90° (0.38:1)', lensMount: 'Barco-TLD+', throwMin: 0.38, throwMax: 0.38 },
  { id: 'barco-tld-067', manufacturer: 'Barco', model: 'TLD+ 0.67–0.88:1', lensMount: 'Barco-TLD+', throwMin: 0.67, throwMax: 0.88 },
  { id: 'barco-tld-085', manufacturer: 'Barco', model: 'TLD+ 0.85–1.25:1', lensMount: 'Barco-TLD+', throwMin: 0.85, throwMax: 1.25 },
  { id: 'barco-tld-139', manufacturer: 'Barco', model: 'TLD+ 1.39–1.89:1', lensMount: 'Barco-TLD+', throwMin: 1.39, throwMax: 1.89 },
  { id: 'barco-tld-274', manufacturer: 'Barco', model: 'TLD+ 2.74–4.43:1', lensMount: 'Barco-TLD+', throwMin: 2.74, throwMax: 4.43 },

  // ================= CHRISTIE GS =================
  { id: 'chr-gs-036', manufacturer: 'Christie', model: 'GS UST 0.36:1 (140-133108)', lensMount: 'Christie-GS', throwMin: 0.36, throwMax: 0.36 },
  { id: 'chr-gs-065', manufacturer: 'Christie', model: 'GS Short 0.65–0.75:1', lensMount: 'Christie-GS', throwMin: 0.65, throwMax: 0.75 },
  { id: 'chr-gs-075', manufacturer: 'Christie', model: 'GS Short Zoom 0.75–0.95:1', lensMount: 'Christie-GS', throwMin: 0.75, throwMax: 0.95 },
  { id: 'chr-gs-095', manufacturer: 'Christie', model: 'GS Wide 0.95–1.22:1', lensMount: 'Christie-GS', throwMin: 0.95, throwMax: 1.22 },
  { id: 'chr-gs-122', manufacturer: 'Christie', model: 'GS Standard 1.22–1.52:1', lensMount: 'Christie-GS', throwMin: 1.22, throwMax: 1.52 },
  { id: 'chr-gs-152', manufacturer: 'Christie', model: 'GS Long 1.52–2.89:1', lensMount: 'Christie-GS', throwMin: 1.52, throwMax: 2.89 },
  { id: 'chr-gs-290', manufacturer: 'Christie', model: 'GS Ultra Long 2.90–5.50:1', lensMount: 'Christie-GS', throwMin: 2.90, throwMax: 5.50 },
];

export const CATALOG_BRANDS = Array.from(new Set(CATALOG_PROJECTORS.map(p => p.manufacturer)));

export function getCompatibleCatalogLenses(proj: CatalogProjector): CatalogLens[] {
  if (proj.builtInThrow) {
    return [
      {
        id: `${proj.id}-builtin`,
        manufacturer: proj.manufacturer,
        model: `Dahili Lens (${proj.builtInThrow.min.toFixed(2)}–${proj.builtInThrow.max.toFixed(2)}:1)`,
        lensMount: 'Dahili',
        throwMin: proj.builtInThrow.min,
        throwMax: proj.builtInThrow.max,
        notes: 'Cihaz üzeri sabit/entegre lens',
      },
    ];
  }
  return CATALOG_LENSES.filter(l => l.lensMount === proj.lensMount);
}
