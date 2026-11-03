"""Pydantic şemaları."""
from datetime import date
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ProjectorIn(BaseModel):
    manufacturer: str = Field(min_length=1)
    model: str = Field(min_length=1)
    native_w: Optional[int] = Field(None, gt=0)
    native_h: Optional[int] = Field(None, gt=0)
    max_w: Optional[int] = Field(None, gt=0)
    max_h: Optional[int] = Field(None, gt=0)
    ansi_lumens: Optional[float] = Field(None, gt=0)
    light_source: Optional[str] = None
    contrast: Optional[str] = None
    aspect: Optional[str] = None
    lens_mount: Optional[str] = None
    weight_kg: Optional[float] = Field(None, gt=0)
    width_mm: Optional[float] = Field(None, gt=0)
    height_mm: Optional[float] = Field(None, gt=0)
    depth_mm: Optional[float] = Field(None, gt=0)
    power_w: Optional[float] = Field(None, ge=0)
    inputs: list[str] = []
    outputs: list[str] = []
    orientations: list[str] = []
    shift: dict[str, Any] = {}
    zoom: dict[str, Any] = {}
    datasheet_url: Optional[str] = None
    notes: Optional[str] = None
    verified: bool = False
    source: Optional[str] = None


class ProjectorOut(ProjectorIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class LensIn(BaseModel):
    manufacturer: str = Field(min_length=1)
    model: str = Field(min_length=1)
    lens_mount: Optional[str] = None
    throw_min: float = Field(gt=0)
    throw_max: float = Field(gt=0)
    shift: dict[str, Any] = {}
    shift_convention: Optional[str] = None
    focus_min_m: Optional[float] = Field(None, gt=0)
    focus_max_m: Optional[float] = Field(None, gt=0)
    length_mm: Optional[float] = Field(None, gt=0)
    diameter_mm: Optional[float] = Field(None, gt=0)
    datasheet_url: Optional[str] = None
    verified: bool = False


class LensOut(LensIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class CompatIn(BaseModel):
    projector_id: int
    lens_id: int
    verified: bool = False
    source_note: Optional[str] = None


EQUIPMENT_CATEGORIES = [
    "projector", "lens", "led_cabinet", "led_processor", "lcd_display", "videowall_display",
    "media_server", "camera", "mounting", "cable", "extender",
]


class EquipmentIn(BaseModel):
    category: str
    manufacturer: Optional[str] = None
    model: str = Field(min_length=1)
    specs: dict[str, Any] = {}
    url: Optional[str] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    compat: list[Any] = []
    verified: bool = False


class EquipmentOut(EquipmentIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ProjectIn(BaseModel):
    name: str = Field(min_length=1)
    customer: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    project_date: Optional[date] = None
    data: dict[str, Any] = {}


class RevisionIn(BaseModel):
    data: dict[str, Any]
    note: Optional[str] = None


class RevisionOverwrite(RevisionIn):
    confirm_overwrite: bool = False
