from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import compat as compat_mod
from .db import engine, get_db
from .models import (Base, Customer, Equipment, Lens, Manufacturer, Project, ProjectRevision,
                     Projector, ProjectorLensCompat)
from .schemas import (EQUIPMENT_CATEGORIES, CompatIn, EquipmentIn, EquipmentOut, LensIn, LensOut,
                      ProjectIn, ProjectorIn, ProjectorOut, RevisionIn, RevisionOverwrite)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Projection & Display Design Studio API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"status": "ok"}


def _manufacturer(db: Session, name: str) -> Manufacturer:
    m = db.scalar(select(Manufacturer).where(Manufacturer.name == name))
    if not m:
        m = Manufacturer(name=name)
        db.add(m)
        db.flush()
    return m


def _proj_out(p: Projector) -> dict:
    d = {c.name: getattr(p, c.name) for c in Projector.__table__.columns if c.name != "manufacturer_id"}
    d["manufacturer"] = p.manufacturer.name
    return d


def _lens_out(l: Lens) -> dict:
    d = {c.name: getattr(l, c.name) for c in Lens.__table__.columns if c.name != "manufacturer_id"}
    d["manufacturer"] = l.manufacturer.name
    return d


# ---------- Projektörler ----------
@app.get("/api/projectors", response_model=list[ProjectorOut])
def list_projectors(q: str | None = None, db: Session = Depends(get_db)):
    rows = db.scalars(select(Projector)).all()
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r.model.lower() or ql in r.manufacturer.name.lower()]
    return [_proj_out(r) for r in rows]


@app.post("/api/projectors", response_model=ProjectorOut, status_code=201)
def create_projector(body: ProjectorIn, db: Session = Depends(get_db)):
    data = body.model_dump()
    m = _manufacturer(db, data.pop("manufacturer"))
    if db.scalar(select(Projector).where(Projector.manufacturer_id == m.id, Projector.model == data["model"])):
        raise HTTPException(409, "Bu model zaten kayıtlı")
    p = Projector(manufacturer_id=m.id, **data)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _proj_out(p)


@app.put("/api/projectors/{pid}", response_model=ProjectorOut)
def update_projector(pid: int, body: ProjectorIn, db: Session = Depends(get_db)):
    p = db.get(Projector, pid)
    if not p:
        raise HTTPException(404, "Projektör bulunamadı")
    data = body.model_dump()
    p.manufacturer_id = _manufacturer(db, data.pop("manufacturer")).id
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _proj_out(p)


@app.post("/api/projectors/{pid}/duplicate", response_model=ProjectorOut, status_code=201)
def duplicate_projector(pid: int, db: Session = Depends(get_db)):
    p = db.get(Projector, pid)
    if not p:
        raise HTTPException(404, "Projektör bulunamadı")
    data = {c.name: getattr(p, c.name) for c in Projector.__table__.columns if c.name != "id"}
    data["model"] = f"{p.model} (kopya)"
    data["verified"] = False
    n = Projector(**data)
    db.add(n)
    db.commit()
    db.refresh(n)
    return _proj_out(n)


@app.delete("/api/projectors/{pid}", status_code=204)
def delete_projector(pid: int, db: Session = Depends(get_db)):
    p = db.get(Projector, pid)
    if not p:
        raise HTTPException(404, "Projektör bulunamadı")
    for c in db.scalars(select(ProjectorLensCompat).where(ProjectorLensCompat.projector_id == pid)):
        db.delete(c)
    db.delete(p)
    db.commit()


# ---------- Lensler ----------
@app.get("/api/lenses", response_model=list[LensOut])
def list_lenses(db: Session = Depends(get_db)):
    return [_lens_out(l) for l in db.scalars(select(Lens))]


@app.post("/api/lenses", response_model=LensOut, status_code=201)
def create_lens(body: LensIn, db: Session = Depends(get_db)):
    data = body.model_dump()
    if data["throw_min"] > data["throw_max"]:
        raise HTTPException(422, "throw_min, throw_max değerinden büyük olamaz")
    m = _manufacturer(db, data.pop("manufacturer"))
    if db.scalar(select(Lens).where(Lens.manufacturer_id == m.id, Lens.model == data["model"])):
        raise HTTPException(409, "Bu lens zaten kayıtlı")
    l = Lens(manufacturer_id=m.id, **data)
    db.add(l)
    db.commit()
    db.refresh(l)
    return _lens_out(l)


@app.delete("/api/lenses/{lid}", status_code=204)
def delete_lens(lid: int, db: Session = Depends(get_db)):
    l = db.get(Lens, lid)
    if not l:
        raise HTTPException(404, "Lens bulunamadı")
    for c in db.scalars(select(ProjectorLensCompat).where(ProjectorLensCompat.lens_id == lid)):
        db.delete(c)
    db.delete(l)
    db.commit()


# ---------- Uyumluluk ----------
@app.post("/api/compat", status_code=201)
def add_compat(body: CompatIn, db: Session = Depends(get_db)):
    if not db.get(Projector, body.projector_id) or not db.get(Lens, body.lens_id):
        raise HTTPException(404, "Projektör veya lens bulunamadı")
    rel = db.get(ProjectorLensCompat, (body.projector_id, body.lens_id))
    if rel:
        rel.verified, rel.source_note = body.verified, body.source_note
    else:
        db.add(ProjectorLensCompat(**body.model_dump()))
    db.commit()
    return {"ok": True}


@app.get("/api/compat/check")
def check_compat(projector_id: int, lens_id: int, db: Session = Depends(get_db)):
    p, l = db.get(Projector, projector_id), db.get(Lens, lens_id)
    if not p or not l:
        raise HTTPException(404, "Projektör veya lens bulunamadı")
    r = compat_mod.evaluate(p, l, db.get(ProjectorLensCompat, (projector_id, lens_id)))
    return r.__dict__


@app.get("/api/projectors/{pid}/lenses")
def compatible_lenses(pid: int, db: Session = Depends(get_db)):
    p = db.get(Projector, pid)
    if not p:
        raise HTTPException(404, "Projektör bulunamadı")
    out = []
    for rel in db.scalars(select(ProjectorLensCompat).where(ProjectorLensCompat.projector_id == pid)):
        l = db.get(Lens, rel.lens_id)
        res = compat_mod.evaluate(p, l, rel)
        if res.compatible:
            out.append({**_lens_out(l), "compat_verified": res.verified, "warnings": res.warnings})
    return out


# ---------- JSON içe/dışa aktarım ----------
@app.get("/api/database/export")
def export_db(db: Session = Depends(get_db)):
    return {
        "projectors": [_proj_out(p) for p in db.scalars(select(Projector))],
        "lenses": [_lens_out(l) for l in db.scalars(select(Lens))],
        "compat": [{"projector_id": c.projector_id, "lens_id": c.lens_id, "verified": c.verified,
                    "source_note": c.source_note} for c in db.scalars(select(ProjectorLensCompat))],
    }


@app.post("/api/database/import")
def import_db(body: dict, db: Session = Depends(get_db)):
    """Projektör ve lensleri içe aktarır (mevcut üretici+model atlanır). ID'ler yeniden üretilir."""
    added = {"projectors": 0, "lenses": 0, "skipped": 0}
    for raw in body.get("projectors", []):
        item = ProjectorIn(**{k: v for k, v in raw.items() if k != "id"})
        data = item.model_dump()
        m = _manufacturer(db, data.pop("manufacturer"))
        if db.scalar(select(Projector).where(Projector.manufacturer_id == m.id, Projector.model == data["model"])):
            added["skipped"] += 1
            continue
        db.add(Projector(manufacturer_id=m.id, **data))
        added["projectors"] += 1
    for raw in body.get("lenses", []):
        item = LensIn(**{k: v for k, v in raw.items() if k != "id"})
        data = item.model_dump()
        m = _manufacturer(db, data.pop("manufacturer"))
        if db.scalar(select(Lens).where(Lens.manufacturer_id == m.id, Lens.model == data["model"])):
            added["skipped"] += 1
            continue
        db.add(Lens(manufacturer_id=m.id, **data))
        added["lenses"] += 1
    db.commit()
    return added


# ---------- Ekipman kataloğu ----------
@app.get("/api/equipment/categories")
def equipment_categories():
    return EQUIPMENT_CATEGORIES


def _check_category(c: str):
    if c not in EQUIPMENT_CATEGORIES:
        raise HTTPException(422, f"Geçersiz kategori: {c}")


@app.get("/api/equipment", response_model=list[EquipmentOut])
def list_equipment(category: str | None = None, q: str | None = None, db: Session = Depends(get_db)):
    stmt = select(Equipment)
    if category:
        stmt = stmt.where(Equipment.category == category)
    rows = db.scalars(stmt).all()
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r.model.lower() or ql in (r.manufacturer or "").lower()]
    return rows


@app.post("/api/equipment", response_model=EquipmentOut, status_code=201)
def create_equipment(body: EquipmentIn, db: Session = Depends(get_db)):
    _check_category(body.category)
    e = Equipment(**body.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@app.put("/api/equipment/{eid}", response_model=EquipmentOut)
def update_equipment(eid: int, body: EquipmentIn, db: Session = Depends(get_db)):
    _check_category(body.category)
    e = db.get(Equipment, eid)
    if not e:
        raise HTTPException(404, "Ekipman bulunamadı")
    for k, v in body.model_dump().items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return e


@app.post("/api/equipment/{eid}/duplicate", response_model=EquipmentOut, status_code=201)
def duplicate_equipment(eid: int, db: Session = Depends(get_db)):
    e = db.get(Equipment, eid)
    if not e:
        raise HTTPException(404, "Ekipman bulunamadı")
    n = Equipment(category=e.category, manufacturer=e.manufacturer, model=f"{e.model} (kopya)",
                  specs=dict(e.specs or {}), url=e.url, image_url=e.image_url, notes=e.notes,
                  compat=list(e.compat or []), verified=False)
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


@app.delete("/api/equipment/{eid}", status_code=204)
def delete_equipment(eid: int, db: Session = Depends(get_db)):
    e = db.get(Equipment, eid)
    if not e:
        raise HTTPException(404, "Ekipman bulunamadı")
    db.delete(e)
    db.commit()


# ---------- Projeler ----------
def _project_out(p: Project, with_data: bool = False) -> dict:
    d = {"id": p.id, "name": p.name, "customer": p.customer.name if p.customer else None,
         "location": p.location, "description": p.description, "category": p.category,
         "project_date": p.project_date, "current_revision": p.current_revision,
         "archived": p.archived,
         "revisions": [{"revision_no": r.revision_no, "note": r.note, "created_at": r.created_at}
                       for r in p.revisions]}
    if with_data:
        cur = next(r for r in p.revisions if r.revision_no == p.current_revision)
        d["data"] = cur.data
    return d


def _customer(db: Session, name: str | None):
    if not name:
        return None
    c = db.scalar(select(Customer).where(Customer.name == name))
    if not c:
        c = Customer(name=name)
        db.add(c)
        db.flush()
    return c.id


def _get_project(db: Session, pid: int) -> Project:
    p = db.get(Project, pid)
    if not p:
        raise HTTPException(404, "Proje bulunamadı")
    return p


@app.post("/api/projects", status_code=201)
def create_project(body: ProjectIn, db: Session = Depends(get_db)):
    p = Project(name=body.name, customer_id=_customer(db, body.customer), location=body.location,
                description=body.description, category=body.category, project_date=body.project_date)
    p.revisions.append(ProjectRevision(revision_no=1, data=body.data, note="İlk revizyon"))
    db.add(p)
    db.commit()
    return _project_out(p, True)


@app.get("/api/projects")
def list_projects(include_archived: bool = False, db: Session = Depends(get_db)):
    return [_project_out(p) for p in db.scalars(select(Project))
            if include_archived or not p.archived]


@app.get("/api/projects/{pid}")
def get_project(pid: int, revision: int | None = None, db: Session = Depends(get_db)):
    p = _get_project(db, pid)
    d = _project_out(p)
    rn = revision or p.current_revision
    rev = next((r for r in p.revisions if r.revision_no == rn), None)
    if not rev:
        raise HTTPException(404, "Revizyon bulunamadı")
    d["data"] = rev.data
    return d


@app.post("/api/projects/{pid}/revisions", status_code=201)
def new_revision(pid: int, body: RevisionIn, db: Session = Depends(get_db)):
    """Yeni revizyon ekler; önceki revizyonlar değişmez."""
    p = _get_project(db, pid)
    no = max(r.revision_no for r in p.revisions) + 1
    p.revisions.append(ProjectRevision(revision_no=no, data=body.data, note=body.note))
    p.current_revision = no
    db.commit()
    return _project_out(p, True)


@app.put("/api/projects/{pid}/revisions/{rn}")
def overwrite_revision(pid: int, rn: int, body: RevisionOverwrite, db: Session = Depends(get_db)):
    p = _get_project(db, pid)
    rev = next((r for r in p.revisions if r.revision_no == rn), None)
    if not rev:
        raise HTTPException(404, "Revizyon bulunamadı")
    if not body.confirm_overwrite:
        raise HTTPException(409, "Mevcut revizyonun üzerine yazmak için onay (confirm_overwrite) gerekli")
    rev.data = body.data
    if body.note is not None:
        rev.note = body.note
    db.commit()
    return _project_out(p, True)


@app.post("/api/projects/{pid}/duplicate", status_code=201)
def duplicate_project(pid: int, db: Session = Depends(get_db)):
    p = _get_project(db, pid)
    cur = next(r for r in p.revisions if r.revision_no == p.current_revision)
    n = Project(name=f"{p.name} (kopya)", customer_id=p.customer_id, location=p.location,
                description=p.description, category=p.category, project_date=p.project_date)
    n.revisions.append(ProjectRevision(revision_no=1, data=cur.data, note=f"Proje #{p.id} kopyası"))
    db.add(n)
    db.commit()
    return _project_out(n, True)


@app.post("/api/projects/{pid}/archive")
def archive_project(pid: int, archived: bool = True, db: Session = Depends(get_db)):
    p = _get_project(db, pid)
    p.archived = archived
    db.commit()
    return _project_out(p)
