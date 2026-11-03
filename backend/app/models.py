from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Manufacturer(Base):
    __tablename__ = "manufacturers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)


class Projector(Base):
    __tablename__ = "projectors"
    __table_args__ = (UniqueConstraint("manufacturer_id", "model"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    manufacturer_id: Mapped[int] = mapped_column(ForeignKey("manufacturers.id"))
    manufacturer: Mapped[Manufacturer] = relationship()
    model: Mapped[str] = mapped_column(String(120))
    native_w: Mapped[int | None] = mapped_column(Integer)
    native_h: Mapped[int | None] = mapped_column(Integer)
    max_w: Mapped[int | None] = mapped_column(Integer)
    max_h: Mapped[int | None] = mapped_column(Integer)
    ansi_lumens: Mapped[float | None] = mapped_column(Float)
    light_source: Mapped[str | None] = mapped_column(String(60))
    contrast: Mapped[str | None] = mapped_column(String(60))
    aspect: Mapped[str | None] = mapped_column(String(20))
    lens_mount: Mapped[str | None] = mapped_column(String(60))
    weight_kg: Mapped[float | None] = mapped_column(Float)
    width_mm: Mapped[float | None] = mapped_column(Float)
    height_mm: Mapped[float | None] = mapped_column(Float)
    depth_mm: Mapped[float | None] = mapped_column(Float)
    power_w: Mapped[float | None] = mapped_column(Float)
    inputs: Mapped[list] = mapped_column(JSON, default=list)
    outputs: Mapped[list] = mapped_column(JSON, default=list)
    orientations: Mapped[list] = mapped_column(JSON, default=list)
    # Lens shift sınırları; üretici konvansiyonu ile birlikte saklanır
    shift: Mapped[dict] = mapped_column(JSON, default=dict)
    zoom: Mapped[dict] = mapped_column(JSON, default=dict)
    datasheet_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str | None] = mapped_column(String(300))


class Lens(Base):
    __tablename__ = "lenses"
    __table_args__ = (UniqueConstraint("manufacturer_id", "model"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    manufacturer_id: Mapped[int] = mapped_column(ForeignKey("manufacturers.id"))
    manufacturer: Mapped[Manufacturer] = relationship()
    model: Mapped[str] = mapped_column(String(120))
    lens_mount: Mapped[str | None] = mapped_column(String(60))
    throw_min: Mapped[float] = mapped_column(Float)
    throw_max: Mapped[float] = mapped_column(Float)
    shift: Mapped[dict] = mapped_column(JSON, default=dict)
    shift_convention: Mapped[str | None] = mapped_column(String(200))
    focus_min_m: Mapped[float | None] = mapped_column(Float)
    focus_max_m: Mapped[float | None] = mapped_column(Float)
    length_mm: Mapped[float | None] = mapped_column(Float)
    diameter_mm: Mapped[float | None] = mapped_column(Float)
    datasheet_url: Mapped[str | None] = mapped_column(String(500))
    verified: Mapped[bool] = mapped_column(Boolean, default=False)


class ProjectorLensCompat(Base):
    """Açık uyumluluk ilişkisi. Throw ratio eşleşmesi uyumluluk sayılmaz."""
    __tablename__ = "projector_lens_compat"
    projector_id: Mapped[int] = mapped_column(ForeignKey("projectors.id"), primary_key=True)
    lens_id: Mapped[int] = mapped_column(ForeignKey("lenses.id"), primary_key=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    source_note: Mapped[str | None] = mapped_column(String(300))


class Equipment(Base):
    __tablename__ = "equipment"
    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(120))
    model: Mapped[str] = mapped_column(String(120))
    specs: Mapped[dict] = mapped_column(JSON, default=dict)
    url: Mapped[str | None] = mapped_column(String(500))
    image_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    compat: Mapped[list] = mapped_column(JSON, default=list)  # uyumlu ekipman notları / kimlikleri
    verified: Mapped[bool] = mapped_column(Boolean, default=False)


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    contact: Mapped[str | None] = mapped_column(String(300))


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"))
    customer: Mapped[Customer | None] = relationship()
    name: Mapped[str] = mapped_column(String(200))
    location: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(80))
    project_date: Mapped[date | None] = mapped_column(Date)
    current_revision: Mapped[int] = mapped_column(Integer, default=1)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    revisions: Mapped[list["ProjectRevision"]] = relationship(
        back_populates="project", order_by="ProjectRevision.revision_no",
        cascade="all, delete-orphan")


class ProjectRevision(Base):
    __tablename__ = "project_revisions"
    __table_args__ = (UniqueConstraint("project_id", "revision_no"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    project: Mapped[Project] = relationship(back_populates="revisions")
    revision_no: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
