"""Projektör–lens uyumluluk değerlendirmesi.

Kural: Throw ratio aralığının örtüşmesi tek başına uyumluluk DEĞİLDİR.
Uyumluluk yalnızca açık (projector_lens_compat) kayıtla kabul edilir.
"""
from dataclasses import dataclass, field


@dataclass
class CompatResult:
    compatible: bool
    verified: bool = False
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def evaluate(projector, lens, relation) -> CompatResult:
    reasons: list[str] = []
    warnings: list[str] = []
    if relation is None:
        reasons.append("Bu projektör–lens çifti için uyumluluk kaydı yok (throw ratio eşleşmesi yeterli değildir).")
    if projector.lens_mount and lens.lens_mount and \
            projector.lens_mount.strip().lower() != lens.lens_mount.strip().lower():
        reasons.append(f"Lens montajı uyumsuz: projektör '{projector.lens_mount}', lens '{lens.lens_mount}'.")
    if reasons:
        return CompatResult(False, False, reasons, warnings)
    verified = bool(relation.verified)
    if not verified:
        warnings.append("Uyumluluk kullanıcı tarafından girilmiş, üretici verisiyle doğrulanmamış.")
    if not (projector.lens_mount and lens.lens_mount):
        warnings.append("Montaj bilgisi eksik; montaj uyumu kontrol edilemedi.")
    return CompatResult(True, verified, reasons, warnings)
