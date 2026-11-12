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
    # Epson Genişletilmiş
    {"manufacturer": "Epson", "model": "EB-L530U", "native_w": 1920, "native_h": 1200, "ansi_lumens": 5200, "aspect": "16:10", "lens_mount": "Dahili-Epson-L530U", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Epson", "model": "EB-L630U", "native_w": 1920, "native_h": 1200, "ansi_lumens": 6200, "aspect": "16:10", "lens_mount": "Dahili-Epson-L630U", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Epson", "model": "EB-L730U", "native_w": 1920, "native_h": 1200, "ansi_lumens": 7000, "aspect": "16:10", "lens_mount": "Dahili-Epson-L730U", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Epson", "model": "EB-810E", "native_w": 1920, "native_h": 1080, "ansi_lumens": 5000, "aspect": "16:9", "lens_mount": "Dahili-Epson-810E", "light_source": "3LCD Laser 4K Enhancement", "verified": True},
    {"manufacturer": "Epson", "model": "EB-PU1008B", "native_w": 1920, "native_h": 1200, "ansi_lumens": 8500, "aspect": "16:10", "lens_mount": "Epson-ELPL", "light_source": "3LCD Laser (4K Enhancement)", "verified": True},
    {"manufacturer": "Epson", "model": "EB-PU2010W", "native_w": 1920, "native_h": 1200, "ansi_lumens": 10000, "aspect": "16:10", "lens_mount": "Epson-ELPL", "light_source": "3LCD Laser (4K Enhancement)", "verified": True},
    {"manufacturer": "Epson", "model": "EB-PQ2008B", "native_w": 3840, "native_h": 2160, "ansi_lumens": 8000, "aspect": "16:9", "lens_mount": "Epson-ELPL", "light_source": "3LCD 4K Crystal Motion", "verified": True},
    {"manufacturer": "Epson", "model": "EB-PQ2220B", "native_w": 3840, "native_h": 2160, "ansi_lumens": 20000, "aspect": "16:9", "lens_mount": "Epson-ELPL-High", "light_source": "3LCD 4K Crystal Motion", "verified": True},
    # Vivitek Genişletilmiş
    {"manufacturer": "Vivitek", "model": "DK8500Z", "native_w": 3840, "native_h": 2160, "ansi_lumens": 7500, "aspect": "16:9", "lens_mount": "Vivitek-D88", "light_source": "1-Chip DLP 4K UHD Laser", "verified": True},
    {"manufacturer": "Vivitek", "model": "DU6693Z", "native_w": 1920, "native_h": 1200, "ansi_lumens": 7000, "aspect": "16:10", "lens_mount": "Vivitek-D88", "light_source": "1-Chip DLP Laser", "verified": True},
    # Sharp / NEC Genişletilmiş
    {"manufacturer": "Sharp / NEC", "model": "PX2201UL", "native_w": 1920, "native_h": 1200, "ansi_lumens": 20500, "aspect": "16:10", "lens_mount": "NEC-PX-ZL", "light_source": "1-Chip DLP RB Laser", "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "XP-P601Q", "native_w": 3840, "native_h": 2160, "ansi_lumens": 6000, "aspect": "16:9", "lens_mount": "Dahili-NEC-XPP601Q", "light_source": "1-Chip DLP 4K UHD Laser", "verified": True},
    # Panasonic Genişletilmiş
    {"manufacturer": "Panasonic", "model": "PT-REQ12", "native_w": 3840, "native_h": 2400, "ansi_lumens": 12000, "aspect": "16:10", "lens_mount": "Panasonic-C1", "light_source": "1-Chip DLP 4K Quad Pixel Drive", "verified": True},
    {"manufacturer": "Panasonic", "model": "PT-REQ15", "native_w": 3840, "native_h": 2400, "ansi_lumens": 15000, "aspect": "16:10", "lens_mount": "Panasonic-C1", "light_source": "1-Chip DLP 4K Quad Pixel Drive", "verified": True},
    {"manufacturer": "Panasonic", "model": "PT-FRQ60", "native_w": 3840, "native_h": 2160, "ansi_lumens": 6000, "aspect": "16:9", "lens_mount": "Dahili-Panasonic-FRQ60", "light_source": "1-Chip DLP 4K Quad Pixel Drive", "verified": True},
    {"manufacturer": "Panasonic", "model": "PT-CMZ50", "native_w": 1920, "native_h": 1200, "ansi_lumens": 5200, "aspect": "16:10", "lens_mount": "Dahili-Panasonic-CMZ50", "light_source": "3LCD Laser UST", "verified": True},
    # Optoma Genişletilmiş
    {"manufacturer": "Optoma", "model": "ZU720TST", "native_w": 1920, "native_h": 1200, "ansi_lumens": 7000, "aspect": "16:10", "lens_mount": "Dahili-Optoma-ZU720TST", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Optoma", "model": "ZK1050", "native_w": 3840, "native_h": 2160, "ansi_lumens": 10000, "aspect": "16:9", "lens_mount": "Optoma-BX-CTA", "light_source": "1-Chip DLP 4K UHD Laser", "verified": True},
    # Barco Genişletilmiş
    {"manufacturer": "Barco", "model": "G100-W19", "native_w": 1920, "native_h": 1200, "ansi_lumens": 16000, "aspect": "16:10", "lens_mount": "Barco-GC-Lens", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Barco", "model": "UDX-4K32", "native_w": 3840, "native_h": 2400, "ansi_lumens": 30000, "aspect": "16:10", "lens_mount": "Barco-TLD+", "light_source": "3-Chip DLP Laser", "verified": True},
    # Christie Genişletilmiş
    {"manufacturer": "Christie", "model": "DWU760-iS", "native_w": 1920, "native_h": 1200, "ansi_lumens": 6000, "aspect": "16:10", "lens_mount": "Dahili-Christie-DWU760", "light_source": "1-Chip DLP Inspire Laser", "verified": True},
    {"manufacturer": "Christie", "model": "DWU960ST-iS", "native_w": 1920, "native_h": 1200, "ansi_lumens": 8100, "aspect": "16:10", "lens_mount": "Dahili-Christie-DWU960ST", "light_source": "1-Chip DLP Inspire Laser", "verified": True},
    {"manufacturer": "Christie", "model": "Griffyn 4K35-RGB", "native_w": 4096, "native_h": 2160, "ansi_lumens": 32500, "aspect": "17:9", "lens_mount": "Christie-ILS4", "light_source": "3-Chip DLP Pure RGB Laser", "verified": True},
    # Sony
    {"manufacturer": "Sony", "model": "VPL-PHZ51", "native_w": 1920, "native_h": 1200, "ansi_lumens": 5300, "aspect": "16:10", "lens_mount": "Dahili-Sony-PHZ51", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Sony", "model": "VPL-PHZ61", "native_w": 1920, "native_h": 1200, "ansi_lumens": 6400, "aspect": "16:10", "lens_mount": "Dahili-Sony-PHZ61", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Sony", "model": "VPL-FHZ85", "native_w": 1920, "native_h": 1200, "ansi_lumens": 7300, "aspect": "16:10", "lens_mount": "Dahili-Sony-FHZ85", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Sony", "model": "VPL-FHZ91L", "native_w": 1920, "native_h": 1200, "ansi_lumens": 9000, "aspect": "16:10", "lens_mount": "Sony-VPLL-Z4", "light_source": "3LCD Laser", "verified": True},
    {"manufacturer": "Sony", "model": "VPL-GTZ380", "native_w": 4096, "native_h": 2160, "ansi_lumens": 10000, "aspect": "17:9", "lens_mount": "Sony-VPLL-Z4", "light_source": "4K SXRD Laser", "verified": True},
    # BenQ
    {"manufacturer": "BenQ", "model": "LU935", "native_w": 1920, "native_h": 1200, "ansi_lumens": 6000, "aspect": "16:10", "lens_mount": "Dahili-BenQ-LU935", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "BenQ", "model": "LU960ST2", "native_w": 1920, "native_h": 1200, "ansi_lumens": 5200, "aspect": "16:10", "lens_mount": "Dahili-BenQ-LU960ST2", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "BenQ", "model": "LK936ST", "native_w": 3840, "native_h": 2160, "ansi_lumens": 5100, "aspect": "16:9", "lens_mount": "Dahili-BenQ-LK936ST", "light_source": "1-Chip DLP 4K UHD Laser", "verified": True},
    {"manufacturer": "BenQ", "model": "LK953ST", "native_w": 3840, "native_h": 2160, "ansi_lumens": 5000, "aspect": "16:9", "lens_mount": "Dahili-BenQ-LK953ST", "light_source": "1-Chip DLP 4K UHD Laser", "verified": True},
    {"manufacturer": "BenQ", "model": "LU9750", "native_w": 1920, "native_h": 1200, "ansi_lumens": 8500, "aspect": "16:10", "lens_mount": "BenQ-LS2", "light_source": "1-Chip DLP Laser", "verified": True},
    # Digital Projection
    {"manufacturer": "Digital Projection", "model": "E-Vision Laser 10K", "native_w": 1920, "native_h": 1200, "ansi_lumens": 10000, "aspect": "16:10", "lens_mount": "DP-EVision", "light_source": "1-Chip DLP Laser", "verified": True},
    {"manufacturer": "Digital Projection", "model": "M-Vision 27000 WU", "native_w": 1920, "native_h": 1200, "ansi_lumens": 24000, "aspect": "16:10", "lens_mount": "DP-MVision", "light_source": "1-Chip DLP ColorBoost Red Laser", "verified": True},
    {"manufacturer": "Digital Projection", "model": "TITAN Laser 37000 4K-UHD", "native_w": 3840, "native_h": 2160, "ansi_lumens": 33000, "aspect": "16:9", "lens_mount": "DP-MVision", "light_source": "3-Chip DLP 4K UHD Laser", "verified": True},
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
    # Epson Ek & Dahili
    {"manufacturer": "Epson", "model": "ELPLW08 (Wide Zoom)", "lens_mount": "Epson-ELPL", "throw_min": 0.86, "throw_max": 1.21, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLM10 (Middle #3)", "lens_mount": "Epson-ELPL", "throw_min": 3.32, "throw_max": 5.06, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLM11 (Middle #4)", "lens_mount": "Epson-ELPL", "throw_min": 4.85, "throw_max": 7.38, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLW08 (Wide High)", "lens_mount": "Epson-ELPL-High", "throw_min": 0.83, "throw_max": 1.17, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLM10 (Middle #3 High)", "lens_mount": "Epson-ELPL-High", "throw_min": 2.33, "throw_max": 3.57, "verified": True},
    {"manufacturer": "Epson", "model": "ELPLM11 (Middle #4 High)", "lens_mount": "Epson-ELPL-High", "throw_min": 3.42, "throw_max": 5.23, "verified": True},
    {"manufacturer": "Epson", "model": "EB-L530U Dahili Zoom", "lens_mount": "Dahili-Epson-L530U", "throw_min": 1.35, "throw_max": 2.20, "verified": True},
    {"manufacturer": "Epson", "model": "EB-L630U Dahili Zoom", "lens_mount": "Dahili-Epson-L630U", "throw_min": 1.35, "throw_max": 2.20, "verified": True},
    {"manufacturer": "Epson", "model": "EB-L730U Dahili Zoom", "lens_mount": "Dahili-Epson-L730U", "throw_min": 1.35, "throw_max": 2.20, "verified": True},
    {"manufacturer": "Epson", "model": "EB-810E Dahili UST", "lens_mount": "Dahili-Epson-810E", "throw_min": 0.16, "throw_max": 0.16, "verified": True},
    # Sharp / NEC PX-ZL & Dahili
    {"manufacturer": "Sharp / NEC", "model": "NP45ZL (Ultra Wide)", "lens_mount": "NEC-PX-ZL", "throw_min": 0.90, "throw_max": 1.20, "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "NP46ZL (Short)", "lens_mount": "NEC-PX-ZL", "throw_min": 1.20, "throw_max": 1.56, "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "NP47ZL (Standard)", "lens_mount": "NEC-PX-ZL", "throw_min": 1.50, "throw_max": 2.00, "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "NP48ZL (Long)", "lens_mount": "NEC-PX-ZL", "throw_min": 2.00, "throw_max": 4.00, "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "NP49ZL (Extra Long)", "lens_mount": "NEC-PX-ZL", "throw_min": 4.00, "throw_max": 7.00, "verified": True},
    {"manufacturer": "Sharp / NEC", "model": "XP-P601Q Dahili Zoom", "lens_mount": "Dahili-NEC-XPP601Q", "throw_min": 1.25, "throw_max": 2.00, "verified": True},
    # Panasonic C1 & Dahili
    {"manufacturer": "Panasonic", "model": "ET-C1U100 (UST Zoom)", "lens_mount": "Panasonic-C1", "throw_min": 0.308, "throw_max": 0.330, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-C1W300 (Short Zoom)", "lens_mount": "Panasonic-C1", "throw_min": 0.550, "throw_max": 0.690, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-C1W400 (Short-Wide)", "lens_mount": "Panasonic-C1", "throw_min": 0.680, "throw_max": 0.950, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-C1W500 (Wide-Std)", "lens_mount": "Panasonic-C1", "throw_min": 0.940, "throw_max": 1.390, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-C1S600 (Standard)", "lens_mount": "Panasonic-C1", "throw_min": 1.360, "throw_max": 2.100, "verified": True},
    {"manufacturer": "Panasonic", "model": "ET-C1T700 (Med-Long)", "lens_mount": "Panasonic-C1", "throw_min": 2.070, "throw_max": 3.380, "verified": True},
    {"manufacturer": "Panasonic", "model": "PT-FRQ60 Dahili Zoom", "lens_mount": "Dahili-Panasonic-FRQ60", "throw_min": 1.46, "throw_max": 2.93, "verified": True},
    {"manufacturer": "Panasonic", "model": "PT-CMZ50 Dahili UST", "lens_mount": "Dahili-Panasonic-CMZ50", "throw_min": 0.235, "throw_max": 0.235, "verified": True},
    # Optoma BX-CTA Ek & Dahili
    {"manufacturer": "Optoma", "model": "ZU720TST Dahili Short", "lens_mount": "Dahili-Optoma-ZU720TST", "throw_min": 0.75, "throw_max": 0.95, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA18 (Short)", "lens_mount": "Optoma-BX-CTA", "throw_min": 0.84, "throw_max": 1.02, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA19 (Semi-Short)", "lens_mount": "Optoma-BX-CTA", "throw_min": 1.02, "throw_max": 1.36, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA20 (Semi-Wide)", "lens_mount": "Optoma-BX-CTA", "throw_min": 1.20, "throw_max": 1.50, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA21 (Standard)", "lens_mount": "Optoma-BX-CTA", "throw_min": 1.50, "throw_max": 2.00, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA22 (Long)", "lens_mount": "Optoma-BX-CTA", "throw_min": 2.00, "throw_max": 4.00, "verified": True},
    {"manufacturer": "Optoma", "model": "BX-CTA23 (Ultra Long)", "lens_mount": "Optoma-BX-CTA", "throw_min": 4.00, "throw_max": 7.20, "verified": True},
    # Barco GC & TLD+ Ek
    {"manufacturer": "Barco", "model": "GC UST 0.38", "lens_mount": "Barco-GC-Lens", "throw_min": 0.38, "throw_max": 0.38, "verified": True},
    {"manufacturer": "Barco", "model": "GC Short 0.75-0.95", "lens_mount": "Barco-GC-Lens", "throw_min": 0.75, "throw_max": 0.95, "verified": True},
    {"manufacturer": "Barco", "model": "GC Wide 1.02-1.36", "lens_mount": "Barco-GC-Lens", "throw_min": 1.02, "throw_max": 1.36, "verified": True},
    {"manufacturer": "Barco", "model": "GC Standard 1.50-2.00", "lens_mount": "Barco-GC-Lens", "throw_min": 1.50, "throw_max": 2.00, "verified": True},
    {"manufacturer": "Barco", "model": "GC Long 2.00-4.00", "lens_mount": "Barco-GC-Lens", "throw_min": 2.00, "throw_max": 4.00, "verified": True},
    {"manufacturer": "Barco", "model": "GC Ultra Long 4.00-7.20", "lens_mount": "Barco-GC-Lens", "throw_min": 4.00, "throw_max": 7.20, "verified": True},
    {"manufacturer": "Barco", "model": "TLD+ Long 4.50-7.50", "lens_mount": "Barco-TLD+", "throw_min": 4.50, "throw_max": 7.50, "verified": True},
    {"manufacturer": "Barco", "model": "TLD+ Very Long 7.50-11.20", "lens_mount": "Barco-TLD+", "throw_min": 7.50, "throw_max": 11.20, "verified": True},
    # Christie ILS4 & Dahili
    {"manufacturer": "Christie", "model": "DWU760-iS Dahili Zoom", "lens_mount": "Dahili-Christie-DWU760", "throw_min": 1.25, "throw_max": 2.00, "verified": True},
    {"manufacturer": "Christie", "model": "DWU960ST-iS Dahili Short", "lens_mount": "Dahili-Christie-DWU960ST", "throw_min": 0.65, "throw_max": 0.75, "verified": True},
    {"manufacturer": "Christie", "model": "ILS4 UHC 0.72 (163-116109)", "lens_mount": "Christie-ILS4", "throw_min": 0.72, "throw_max": 0.72, "verified": True},
    {"manufacturer": "Christie", "model": "ILS4 UHC 0.90 (163-117100)", "lens_mount": "Christie-ILS4", "throw_min": 0.90, "throw_max": 0.90, "verified": True},
    {"manufacturer": "Christie", "model": "ILS4 HB 1.13-1.63 (144-129103)", "lens_mount": "Christie-ILS4", "throw_min": 1.13, "throw_max": 1.63, "verified": True},
    {"manufacturer": "Christie", "model": "ILS4 HB 1.45-2.17 (144-130105)", "lens_mount": "Christie-ILS4", "throw_min": 1.45, "throw_max": 2.17, "verified": True},
    {"manufacturer": "Christie", "model": "ILS4 HB 1.95-3.26 (144-131106)", "lens_mount": "Christie-ILS4", "throw_min": 1.95, "throw_max": 3.26, "verified": True},
    {"manufacturer": "Christie", "model": "ILS4 HB 2.71-3.89 (144-107109)", "lens_mount": "Christie-ILS4", "throw_min": 2.71, "throw_max": 3.89, "verified": True},
    {"manufacturer": "Christie", "model": "ILS4 HB 3.89-5.43 (144-108100)", "lens_mount": "Christie-ILS4", "throw_min": 3.89, "throw_max": 5.43, "verified": True},
    {"manufacturer": "Christie", "model": "ILS4 HB 4.98-7.69 (144-109101)", "lens_mount": "Christie-ILS4", "throw_min": 4.98, "throw_max": 7.69, "verified": True},
    # Sony
    {"manufacturer": "Sony", "model": "VPL-PHZ51 Dahili Zoom", "lens_mount": "Dahili-Sony-PHZ51", "throw_min": 1.23, "throw_max": 1.97, "verified": True},
    {"manufacturer": "Sony", "model": "VPL-PHZ61 Dahili Zoom", "lens_mount": "Dahili-Sony-PHZ61", "throw_min": 1.23, "throw_max": 1.97, "verified": True},
    {"manufacturer": "Sony", "model": "VPL-FHZ85 Dahili Zoom", "lens_mount": "Dahili-Sony-FHZ85", "throw_min": 1.39, "throw_max": 2.23, "verified": True},
    {"manufacturer": "Sony", "model": "VPLL-Z4107 (Short)", "lens_mount": "Sony-VPLL-Z4", "throw_min": 0.75, "throw_max": 0.94, "verified": True},
    {"manufacturer": "Sony", "model": "VPLL-Z4111 (Standard)", "lens_mount": "Sony-VPLL-Z4", "throw_min": 1.30, "throw_max": 1.96, "verified": True},
    {"manufacturer": "Sony", "model": "VPLL-Z4015 (Short-Med)", "lens_mount": "Sony-VPLL-Z4", "throw_min": 1.85, "throw_max": 2.44, "verified": True},
    {"manufacturer": "Sony", "model": "VPLL-Z4019 (Std-Med)", "lens_mount": "Sony-VPLL-Z4", "throw_min": 2.14, "throw_max": 3.07, "verified": True},
    {"manufacturer": "Sony", "model": "VPLL-Z4025 (Long)", "lens_mount": "Sony-VPLL-Z4", "throw_min": 3.02, "throw_max": 5.58, "verified": True},
    {"manufacturer": "Sony", "model": "VPLL-Z4045 (Ultra Long)", "lens_mount": "Sony-VPLL-Z4", "throw_min": 5.56, "throw_max": 7.50, "verified": True},
    # BenQ
    {"manufacturer": "BenQ", "model": "LU935 Dahili Zoom", "lens_mount": "Dahili-BenQ-LU935", "throw_min": 1.36, "throw_max": 2.18, "verified": True},
    {"manufacturer": "BenQ", "model": "LU960ST2 Dahili Short", "lens_mount": "Dahili-BenQ-LU960ST2", "throw_min": 0.50, "throw_max": 0.50, "verified": True},
    {"manufacturer": "BenQ", "model": "LK936ST Dahili Short", "lens_mount": "Dahili-BenQ-LK936ST", "throw_min": 0.81, "throw_max": 0.89, "verified": True},
    {"manufacturer": "BenQ", "model": "LK953ST Dahili Short", "lens_mount": "Dahili-BenQ-LK953ST", "throw_min": 0.81, "throw_max": 0.89, "verified": True},
    {"manufacturer": "BenQ", "model": "LS1UST (UST)", "lens_mount": "BenQ-LS2", "throw_min": 0.38, "throw_max": 0.39, "verified": True},
    {"manufacturer": "BenQ", "model": "LS2ST1 (Wide)", "lens_mount": "BenQ-LS2", "throw_min": 1.10, "throw_max": 1.30, "verified": True},
    {"manufacturer": "BenQ", "model": "LS2ST2 (Std-Wide)", "lens_mount": "BenQ-LS2", "throw_min": 1.54, "throw_max": 1.93, "verified": True},
    {"manufacturer": "BenQ", "model": "LS2SD (Standard)", "lens_mount": "BenQ-LS2", "throw_min": 1.73, "throw_max": 2.27, "verified": True},
    {"manufacturer": "BenQ", "model": "LS2LT1 (Semi-Long)", "lens_mount": "BenQ-LS2", "throw_min": 1.93, "throw_max": 2.90, "verified": True},
    {"manufacturer": "BenQ", "model": "LS2LT2 (Long)", "lens_mount": "BenQ-LS2", "throw_min": 3.00, "throw_max": 5.00, "verified": True},
    # Digital Projection
    {"manufacturer": "Digital Projection", "model": "124-318 (E-Vision UST)", "lens_mount": "DP-EVision", "throw_min": 0.37, "throw_max": 0.37, "verified": True},
    {"manufacturer": "Digital Projection", "model": "124-319 (E-Vision Short)", "lens_mount": "DP-EVision", "throw_min": 0.65, "throw_max": 0.89, "verified": True},
    {"manufacturer": "Digital Projection", "model": "124-320 (E-Vision Wide)", "lens_mount": "DP-EVision", "throw_min": 0.88, "throw_max": 1.28, "verified": True},
    {"manufacturer": "Digital Projection", "model": "124-321 (E-Vision Std)", "lens_mount": "DP-EVision", "throw_min": 1.25, "throw_max": 1.68, "verified": True},
    {"manufacturer": "Digital Projection", "model": "124-322 (E-Vision Std-Long)", "lens_mount": "DP-EVision", "throw_min": 1.67, "throw_max": 2.51, "verified": True},
    {"manufacturer": "Digital Projection", "model": "124-323 (E-Vision Long)", "lens_mount": "DP-EVision", "throw_min": 2.50, "throw_max": 4.70, "verified": True},
    {"manufacturer": "Digital Projection", "model": "120-624 (M-Vision Short)", "lens_mount": "DP-MVision", "throw_min": 0.90, "throw_max": 1.20, "verified": True},
    {"manufacturer": "Digital Projection", "model": "120-625 (M-Vision Wide-Std)", "lens_mount": "DP-MVision", "throw_min": 1.20, "throw_max": 1.56, "verified": True},
    {"manufacturer": "Digital Projection", "model": "120-626 (M-Vision Std)", "lens_mount": "DP-MVision", "throw_min": 1.50, "throw_max": 2.00, "verified": True},
    {"manufacturer": "Digital Projection", "model": "120-627 (M-Vision Med)", "lens_mount": "DP-MVision", "throw_min": 2.00, "throw_max": 4.00, "verified": True},
    {"manufacturer": "Digital Projection", "model": "120-628 (M-Vision Long)", "lens_mount": "DP-MVision", "throw_min": 4.00, "throw_max": 7.00, "verified": True},
    {"manufacturer": "Digital Projection", "model": "123-418 (M-Vision U-Long)", "lens_mount": "DP-MVision", "throw_min": 6.90, "throw_max": 10.30, "verified": True},
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
