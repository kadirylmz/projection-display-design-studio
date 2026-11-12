"""Varsayılan çoklu marka projektör, lens ve ekran ekipman kataloğu (idempotent seed)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Equipment, Lens, Manufacturer, Projector, ProjectorLensCompat

SEED_PROJECTORS = [
    {"manufacturer": "Epson", "model": "EB-PU1007B", "native_w": 1920, "native_h": 1200, "ansi_lumens": 7000, "aspect": "16:10", "lens_mount": "Epson-ELPL", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Epson", "model": "EB-PU2010B", "native_w": 1920, "native_h": 1200, "ansi_lumens": 10000, "aspect": "16:10", "lens_mount": "Epson-ELPL", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Epson", "model": "EB-PU2220B", "native_w": 1920, "native_h": 1200, "ansi_lumens": 20000, "aspect": "16:10", "lens_mount": "Epson-ELPL-High", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Epson", "model": "EB-L770U", "native_w": 1920, "native_h": 1200, "ansi_lumens": 7000, "aspect": "16:10", "lens_mount": "Dahili-Epson-L770", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Vivitek", "model": "DU7098Z", "native_w": 1920, "native_h": 1200, "ansi_lumens": 7000, "aspect": "16:10", "lens_mount": "Vivitek-D70", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Vivitek", "model": "DU8195Z", "native_w": 1920, "native_h": 1200, "ansi_lumens": 13500, "aspect": "16:10", "lens_mount": "Vivitek-D88", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Vivitek", "model": "DU9800Z", "native_w": 1920, "native_h": 1200, "ansi_lumens": 18000, "aspect": "16:10", "lens_mount": "Vivitek-D98", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "PA1004UL", "native_w": 1920, "native_h": 1200, "ansi_lumens": 10000, "aspect": "16:10", "lens_mount": "NEC-NP", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "PA1505UL", "native_w": 1920, "native_h": 1200, "ansi_lumens": 15000, "aspect": "16:10", "lens_mount": "NEC-NP", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "P627UL", "native_w": 1920, "native_h": 1200, "ansi_lumens": 6200, "aspect": "16:10", "lens_mount": "Dahili-NEC-P627", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Panasonic", "model": "PT-RZ990", "native_w": 1920, "native_h": 1200, "ansi_lumens": 9400, "aspect": "16:10", "lens_mount": "Panasonic-DLE", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Panasonic", "model": "PT-RZ120", "native_w": 1920, "native_h": 1200, "ansi_lumens": 12000, "aspect": "16:10", "lens_mount": "Panasonic-DLE", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Panasonic", "model": "PT-MZ880", "native_w": 1920, "native_h": 1200, "ansi_lumens": 8000, "aspect": "16:10", "lens_mount": "Panasonic-ELW", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Optoma", "model": "ZU920TST", "native_w": 1920, "native_h": 1200, "ansi_lumens": 9800, "aspect": "16:10", "lens_mount": "Dahili-Optoma-ZU920TST", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Optoma", "model": "ZU1050", "native_w": 1920, "native_h": 1200, "ansi_lumens": 10000, "aspect": "16:10", "lens_mount": "Optoma-BX-CTA", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Optoma", "model": "ZU1300", "native_w": 1920, "native_h": 1200, "ansi_lumens": 14400, "aspect": "16:10", "lens_mount": "Optoma-BX-CTA", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Barco", "model": "G62-W11", "native_w": 1920, "native_h": 1200, "ansi_lumens": 11000, "aspect": "16:10", "lens_mount": "Barco-G-Lens", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Barco", "model": "UDM-4K22", "native_w": 3840, "native_h": 2400, "ansi_lumens": 21000, "aspect": "16:10", "lens_mount": "Barco-TLD+", "light_source": "3-Chip DLP Laser", "verified": True},
    {"manufacturer": "Christie", "model": "DWU880-GS", "native_w": 1920, "native_h": 1200, "ansi_lumens": 9500, "aspect": "16:10", "lens_mount": "Christie-GS", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Christie", "model": "DWU1100-GS", "native_w": 1920, "native_h": 1200, "ansi_lumens": 11850, "aspect": "16:10", "lens_mount": "Christie-GS", "light_source": "1-Chip DLP Laser", "verified": True},
]

SEED_LENSES = [
    # Epson
    {"manufacturer": "Epson", "model": "ELPLX02S (UST)", "lens_mount": "Epson-ELPL", "throw_min": 0.35, "throw_max": 0.35, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLU03S (Short)", "lens_mount": "Epson-ELPL", "throw_min": 0.48, "throw_max": 0.57, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLW05 (Wide)", "lens_mount": "Epson-ELPL", "throw_min": 0.77, "throw_max": 1.07, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLM08 (Standard)", "lens_mount": "Epson-ELPL", "throw_min": 1.44, "throw_max": 2.32, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLM15 (Middle)", "lens_mount": "Epson-ELPL", "throw_min": 1.57, "throw_max": 2.56, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLL08 (Long)", "lens_mount": "Epson-ELPL", "throw_min": 5.27, "throw_max": 7.41, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLX02S (UST High)", "lens_mount": "Epson-ELPL-High", "throw_min": 0.35, "throw_max": 0.35, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLU03S (Short High)", "lens_mount": "Epson-ELPL-High", "throw_min": 0.48, "throw_max": 0.57, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLW06 (Wide High)", "lens_mount": "Epson-ELPL-High", "throw_min": 1.19, "throw_max": 1.62, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLM15 (Middle High)", "lens_mount": "Epson-ELPL-High", "throw_min": 1.57, "throw_max": 2.56, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLL08 (Long High)", "lens_mount": "Epson-ELPL-High", "throw_min": 5.27, "throw_max": 7.41, "verified": True},
    {"manufacturer": "Epson", "model": "EB-L770U Dahili Zoom", "lens_mount": "Dahili-Epson-L770", "throw_min": 1.35, "throw_max": 2.20, "verified": True},
    # Vivitek
    {"manufacturer": "Vivitek", "model": "D88-UST01B (UST)", "lens_mount": "Vivitek-D88", "throw_min": 0.38, "throw_max": 0.38, "verified": True},
    {"manufacturer": "Vivitek", "model": "D88-ST001 (Short)", "lens_mount": "Vivitek-D88", "throw_min": 0.76, "throw_max": 0.76, "verified": True},
    {"manufacturer": "Vivitek", "model": "D88-WF18501 (Wide)", "lens_mount": "Vivitek-D88", "throw_min": 1.25, "throw_max": 1.60, "verified": True},
    {"manufacturer": "Vivitek", "model": "D88-SMLZ01 (Standard)", "lens_mount": "Vivitek-D88", "throw_min": 1.73, "throw_max": 2.27, "verified": True},
    {"manufacturer": "Vivitek", "model": "D88-LOZ101 (Long 1)", "lens_mount": "Vivitek-D88", "throw_min": 2.22, "throw_max": 3.67, "verified": True},
    {"manufacturer": "Vivitek", "model": "D88-LOZ201 (Long 2)", "lens_mount": "Vivitek-D88", "throw_min": 3.58, "throw_max": 5.38, "verified": True},
    {"manufacturer": "Vivitek", "model": "D88-ULZ01 (Ultra Long)", "lens_mount": "Vivitek-D88", "throw_min": 5.31, "throw_max": 8.26, "verified": True},
    {"manufacturer": "Vivitek", "model": "D98-0810", "lens_mount": "Vivitek-D98", "throw_min": 0.84, "throw_max": 1.03, "verified": True},
    {"manufacturer": "Vivitek", "model": "D98-1215", "lens_mount": "Vivitek-D98", "throw_min": 1.20, "throw_max": 1.56, "verified": True},
    {"manufacturer": "Vivitek", "model": "D98-1520", "lens_mount": "Vivitek-D98", "throw_min": 1.50, "throw_max": 2.00, "verified": True},
    {"manufacturer": "Vivitek", "model": "D98-2040", "lens_mount": "Vivitek-D98", "throw_min": 2.00, "throw_max": 4.00, "verified": True},
    {"manufacturer": "Vivitek", "model": "D98-4070", "lens_mount": "Vivitek-D98", "throw_min": 4.00, "throw_max": 7.00, "verified": True},
    {"manufacturer": "Vivitek", "model": "D70-Short Zoom", "lens_mount": "Vivitek-D70", "throw_min": 0.77, "throw_max": 1.10, "verified": True},
    {"manufacturer": "Vivitek", "model": "D70-Wide Zoom", "lens_mount": "Vivitek-D70", "throw_min": 1.25, "throw_max": 1.60, "verified": True},
    {"manufacturer": "Vivitek", "model": "D70-Standard Zoom", "lens_mount": "Vivitek-D70", "throw_min": 1.54, "throw_max": 1.93, "verified": True},
    {"manufacturer": "Vivitek", "model": "D70-Long Zoom", "lens_mount": "Vivitek-D70", "throw_min": 1.93, "throw_max": 2.90, "verified": True},
    {"manufacturer": "Vivitek", "model": "D70-Super Long", "lens_mount": "Vivitek-D70", "throw_min": 3.00, "throw_max": 5.01, "verified": True},
    # Sharp / NEC
    {"manufacturer": "Sharp / NEC", "model": "NP44ML (UST)", "lens_mount": "NEC-NP", "throw_min": 0.32, "throw_max": 0.32, "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "NP40ZL (Short)", "lens_mount": "NEC-NP", "throw_min": 0.79, "throw_max": 1.11, "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "NP41ZL (Standard)", "lens_mount": "NEC-NP", "throw_min": 1.30, "throw_max": 3.02, "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "NP43ZL (Long)", "lens_mount": "NEC-NP", "throw_min": 2.99, "throw_max": 5.93, "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "P627UL Dahili Zoom", "lens_mount": "Dahili-NEC-P627", "throw_min": 1.23, "throw_max": 2.00, "verified": True},
    # Panasonic
    {"manufacturer": "Panasonic", "model": "ET-DLE020 (UST)", "lens_mount": "Panasonic-DLE", "throw_min": 0.28, "throw_max": 0.30, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-DLE060 (Short)", "lens_mount": "Panasonic-DLE", "throw_min": 0.60, "throw_max": 0.80, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-DLE085 (Wide)", "lens_mount": "Panasonic-DLE", "throw_min": 0.78, "throw_max": 0.98, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-DLE150 (Standard)", "lens_mount": "Panasonic-DLE", "throw_min": 1.30, "throw_max": 1.89, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-DLE250 (Long)", "lens_mount": "Panasonic-DLE", "throw_min": 2.27, "throw_max": 3.62, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-ELW22 (Short)", "lens_mount": "Panasonic-ELW", "throw_min": 0.78, "throw_max": 0.98, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-ELS20 (Standard)", "lens_mount": "Panasonic-ELW", "throw_min": 1.61, "throw_max": 2.76, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-ELT22 (Long)", "lens_mount": "Panasonic-ELW", "throw_min": 2.72, "throw_max": 4.48, "verified": True},
    # Optoma
    {"manufacturer": "Optoma", "model": "ZU920TST Dahili Kısa Zoom", "lens_mount": "Dahili-Optoma-ZU920TST", "throw_min": 0.65, "throw_max": 0.75, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA16 (UST)", "lens_mount": "Optoma-BX-CTA", "throw_min": 0.36, "throw_max": 0.36, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA17 (Short)", "lens_mount": "Optoma-BX-CTA", "throw_min": 0.65, "throw_max": 0.75, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA15 (Wide Short)", "lens_mount": "Optoma-BX-CTA", "throw_min": 0.75, "throw_max": 0.95, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA01 (Wide)", "lens_mount": "Optoma-BX-CTA", "throw_min": 0.95, "throw_max": 1.22, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA03 (Long)", "lens_mount": "Optoma-BX-CTA", "throw_min": 1.52, "throw_max": 2.92, "verified": True},
    # Barco
    {"manufacturer": "Barco", "model": "G-Lens UST 0.36", "lens_mount": "Barco-G-Lens", "throw_min": 0.36, "throw_max": 0.36, "verified": True},
    {"manufacturer": "Barco", "model": "G-Lens 0.65-0.75", "lens_mount": "Barco-G-Lens", "throw_min": 0.65, "throw_max": 0.75, "verified": True},
    {"manufacturer": "Barco", "model": "G-Lens 0.95-1.22", "lens_mount": "Barco-G-Lens", "throw_min": 0.95, "throw_max": 1.22, "verified": True},
    {"manufacturer": "Barco", "model": "G-Lens 1.22-1.52", "lens_mount": "Barco-G-Lens", "throw_min": 1.22, "throw_max": 1.52, "verified": True},
    {"manufacturer": "Barco", "model": "G-Lens 1.52-2.92", "lens_mount": "Barco-G-Lens", "throw_min": 1.52, "throw_max": 2.92, "verified": True},
    {"manufacturer": "Barco", "model": "G-Lens 2.90-5.50", "lens_mount": "Barco-G-Lens", "throw_min": 2.90, "throw_max": 5.50, "verified": True},
    {"manufacturer": "Barco", "model": "TLD+ UST 0.38", "lens_mount": "Barco-TLD+", "throw_min": 0.38, "throw_max": 0.38, "verified": True},
    {"manufacturer": "Barco", "model": "TLD+ 0.67-0.88", "lens_mount": "Barco-TLD+", "throw_min": 0.67, "throw_max": 0.88, "verified": True},
    {"manufacturer": "Barco", "model": "TLD+ 0.85-1.25", "lens_mount": "Barco-TLD+", "throw_min": 0.85, "throw_max": 1.25, "verified": True},
    {"manufacturer": "Barco", "model": "TLD+ 1.39-1.89", "lens_mount": "Barco-TLD+", "throw_min": 1.39, "throw_max": 1.89, "verified": True},
    {"manufacturer": "Barco", "model": "TLD+ 2.74-4.43", "lens_mount": "Barco-TLD+", "throw_min": 2.74, "throw_max": 4.43, "verified": True},
    # Christie
    {"manufacturer": "Christie", "model": "GS UST 0.36", "lens_mount": "Christie-GS", "throw_min": 0.36, "throw_max": 0.36, "verified": True},
    {"manufacturer": "Christie", "model": "GS Short 0.65-0.75", "lens_mount": "Christie-GS", "throw_min": 0.65, "throw_max": 0.75, "verified": True},
    {"manufacturer": "Christie", "model": "GS Short Zoom 0.75-0.95", "lens_mount": "Christie-GS", "throw_min": 0.75, "throw_max": 0.95, "verified": True},
    {"manufacturer": "Christie", "model": "GS Wide 0.95-1.22", "lens_mount": "Christie-GS", "throw_min": 0.95, "throw_max": 1.22, "verified": True},
    {"manufacturer": "Christie", "model": "GS Standard 1.22-1.52", "lens_mount": "Christie-GS", "throw_min": 1.22, "throw_max": 1.52, "verified": True},
    {"manufacturer": "Christie", "model": "GS Long 1.52-2.89", "lens_mount": "Christie-GS", "throw_min": 1.52, "throw_max": 2.89, "verified": True},
    {"manufacturer": "Christie", "model": "GS Ultra Long 2.90-5.50", "lens_mount": "Christie-GS", "throw_min": 2.90, "throw_max": 5.50, "verified": True},
]

SEED_SCREENS_AND_DISPLAYS = [
    # LED Kabinler
    {"category": "led_cabinet", "manufacturer": "Absen", "model": "A2715 Plus (P1.5)", "specs": {"pitch_mm": 1.5, "width_mm": 610, "height_mm": 343, "res_w": 384, "res_h": 216, "weight_kg": 6.2, "power_typ_w": 45, "power_max_w": 135}, "verified": True},
    {"category": "led_cabinet", "manufacturer": "Absen", "model": "PL2.5 Pro V10 (P2.5)", "specs": {"pitch_mm": 2.5, "width_mm": 500, "height_mm": 500, "res_w": 200, "res_h": 200, "weight_kg": 7.5, "power_typ_w": 65, "power_max_w": 195}, "verified": True},
    {"category": "led_cabinet", "manufacturer": "ROE Visual", "model": "Black Pearl BP2 V2 (P2.8)", "specs": {"pitch_mm": 2.8, "width_mm": 500, "height_mm": 500, "res_w": 176, "res_h": 176, "weight_kg": 8.6, "power_typ_w": 85, "power_max_w": 230}, "verified": True},
    {"category": "led_cabinet", "manufacturer": "Samsung", "model": "The Wall IWC (P1.2)", "specs": {"pitch_mm": 1.26, "width_mm": 806.4, "height_mm": 453.6, "res_w": 640, "res_h": 360, "weight_kg": 11.2, "power_typ_w": 110, "power_max_w": 260}, "verified": True},
    # LCD & Video Duvarı Ekranları
    {"category": "lcd_display", "manufacturer": "Samsung", "model": "QM98C (98 inç 4K)", "specs": {"diagonal_in": 98, "res_w": 3840, "res_h": 2160, "brightness_nit": 500, "power_w": 360}, "verified": True},
    {"category": "lcd_display", "manufacturer": "LG", "model": "86UH5J-H (86 inç 4K)", "specs": {"diagonal_in": 86, "res_w": 3840, "res_h": 2160, "brightness_nit": 500, "power_w": 230}, "verified": True},
    {"category": "lcd_display", "manufacturer": "Sharp / NEC", "model": "MultiSync M751 (75 inç 4K)", "specs": {"diagonal_in": 75, "res_w": 3840, "res_h": 2160, "brightness_nit": 500, "power_w": 185}, "verified": True},
    {"category": "videowall_display", "manufacturer": "LG", "model": "55VH7J-H (55 inç 0.44mm Bezel)", "specs": {"diagonal_in": 55, "res_w": 1920, "res_h": 1080, "bezel_mm": 0.88, "brightness_nit": 700}, "verified": True},
    {"category": "videowall_display", "manufacturer": "Samsung", "model": "VH55B-E (55 inç 0.44mm Bezel)", "specs": {"diagonal_in": 55, "res_w": 1920, "res_h": 1080, "bezel_mm": 0.88, "brightness_nit": 700}, "verified": True},
]


def _get_or_create_mfg(db: Session, name: str) -> Manufacturer:
    m = db.scalar(select(Manufacturer).where(Manufacturer.name == name))
    if not m:
        m = Manufacturer(name=name)
        db.add(m)
        db.flush()
    return m


def seed_default_catalog(db: Session) -> None:
    """Tüm marka projektör, lens, uyumluluk ve ekran/panel kayıtlarını veritabanına idempotent ekler."""
    proj_map: dict[str, Projector] = {}
    for pdata in SEED_PROJECTORS:
        mfg = _get_or_create_mfg(db, pdata["manufacturer"])
        p = db.scalar(select(Projector).where(Projector.manufacturer_id == mfg.id, Projector.model == pdata["model"]))
        if not p:
            fields = {k: v for k, v in pdata.items() if k != "manufacturer"}
            p = Projector(manufacturer_id=mfg.id, **fields)
            db.add(p)
            db.flush()
        proj_map[f"{pdata['manufacturer']}::{pdata['model']}"] = p

        # Equipment tablosuna da ekle
        if not db.scalar(select(Equipment).where(Equipment.category == "projector", Equipment.manufacturer == pdata["manufacturer"], Equipment.model == pdata["model"])):
            db.add(Equipment(
                category="projector",
                manufacturer=pdata["manufacturer"],
                model=pdata["model"],
                specs={"ansi_lumens": pdata["ansi_lumens"], "res_w": pdata["native_w"], "res_h": pdata["native_h"], "aspect": pdata["aspect"], "lens_mount": pdata["lens_mount"], "light_source": pdata["light_source"]},
                verified=True,
            ))

    lens_list: list[Lens] = []
    for ldata in SEED_LENSES:
        mfg = _get_or_create_mfg(db, ldata["manufacturer"])
        l = db.scalar(select(Lens).where(Lens.manufacturer_id == mfg.id, Lens.model == ldata["model"]))
        if not l:
            fields = {k: v for k, v in ldata.items() if k != "manufacturer"}
            l = Lens(manufacturer_id=mfg.id, **fields)
            db.add(l)
            db.flush()
        lens_list.append(l)

        if not db.scalar(select(Equipment).where(Equipment.category == "lens", Equipment.manufacturer == ldata["manufacturer"], Equipment.model == ldata["model"])):
            db.add(Equipment(
                category="lens",
                manufacturer=ldata["manufacturer"],
                model=ldata["model"],
                specs={"throw_min": ldata["throw_min"], "throw_max": ldata["throw_max"], "lens_mount": ldata["lens_mount"]},
                verified=True,
            ))

    # Uyumluluk kayıtları (lens_mount eşleşmesine göre)
    for p in proj_map.values():
        if not p.lens_mount:
            continue
        for l in lens_list:
            if l.lens_mount == p.lens_mount:
                exists = db.scalar(select(ProjectorLensCompat).where(ProjectorLensCompat.projector_id == p.id, ProjectorLensCompat.lens_id == l.id))
                if not exists:
                    db.add(ProjectorLensCompat(projector_id=p.id, lens_id=l.id, verified=True, source_note="Üretici resmi lens serisi"))

    # LED, LCD, Video Duvarı kayıtları
    for item in SEED_SCREENS_AND_DISPLAYS:
        if not db.scalar(select(Equipment).where(Equipment.category == item["category"], Equipment.manufacturer == item["manufacturer"], Equipment.model == item["model"])):
            db.add(Equipment(**item))

    db.commit()
