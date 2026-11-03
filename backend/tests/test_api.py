import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


# Test verisi KURGUSALDIR (üretici verisi değil).
def mk_proj(c, model="P1", mount="MountA"):
    return c.post("/api/projectors", json={"manufacturer": "TestCo", "model": model,
                                           "lens_mount": mount}).json()


def mk_lens(c, model="L1", mount="MountA"):
    return c.post("/api/lenses", json={"manufacturer": "TestCo", "model": model, "lens_mount": mount,
                                       "throw_min": 1.0, "throw_max": 2.0}).json()


def test_lens_incompatible_without_relation_even_if_throw_matches(client):
    p, l = mk_proj(client, "P-a"), mk_lens(client, "L-a")
    r = client.get("/api/compat/check", params={"projector_id": p["id"], "lens_id": l["id"]}).json()
    assert r["compatible"] is False


def test_lens_rejected_on_mount_mismatch_even_with_relation(client):
    p, l = mk_proj(client, "P-b", "MountA"), mk_lens(client, "L-b", "MountB")
    client.post("/api/compat", json={"projector_id": p["id"], "lens_id": l["id"]})
    r = client.get("/api/compat/check", params={"projector_id": p["id"], "lens_id": l["id"]}).json()
    assert r["compatible"] is False and "montaj" in r["reasons"][0].lower()


def test_lens_compatible_with_relation_flags_unverified(client):
    p, l = mk_proj(client, "P-c"), mk_lens(client, "L-c")
    client.post("/api/compat", json={"projector_id": p["id"], "lens_id": l["id"]})
    r = client.get("/api/compat/check", params={"projector_id": p["id"], "lens_id": l["id"]}).json()
    assert r["compatible"] and not r["verified"] and r["warnings"]
    assert len(client.get(f"/api/projectors/{p['id']}/lenses").json()) == 1


def test_projector_crud_duplicate_and_import_export(client):
    p = mk_proj(client, "P-d")
    d = client.post(f"/api/projectors/{p['id']}/duplicate").json()
    assert d["model"].endswith("(kopya)")
    assert client.delete(f"/api/projectors/{d['id']}").status_code == 204
    exp = client.get("/api/database/export").json()
    assert any(x["model"] == "P-d" for x in exp["projectors"])
    assert client.post("/api/database/import", json=exp).json()["skipped"] >= 1


def test_project_save_reopen_preserves_data(client):
    data = {"geometry": {"width": 4.0, "tr": 1.5}, "calc": {"distance": 6.0}}
    pr = client.post("/api/projects", json={"name": "Müze", "customer": "X", "data": data}).json()
    got = client.get(f"/api/projects/{pr['id']}").json()
    assert got["data"] == data


def test_revisions_never_overwritten_without_confirmation(client):
    pr = client.post("/api/projects", json={"name": "R", "data": {"v": 1}}).json()
    r2 = client.post(f"/api/projects/{pr['id']}/revisions", json={"data": {"v": 2}}).json()
    assert r2["current_revision"] == 2
    assert client.get(f"/api/projects/{pr['id']}", params={"revision": 1}).json()["data"] == {"v": 1}
    assert client.put(f"/api/projects/{pr['id']}/revisions/1", json={"data": {"v": 9}}).status_code == 409
    ok = client.put(f"/api/projects/{pr['id']}/revisions/1",
                    json={"data": {"v": 9}, "confirm_overwrite": True})
    assert ok.status_code == 200


def test_duplicate_and_archive(client):
    pr = client.post("/api/projects", json={"name": "A", "data": {"k": 1}}).json()
    d = client.post(f"/api/projects/{pr['id']}/duplicate").json()
    assert d["data"] == {"k": 1}
    client.post(f"/api/projects/{pr['id']}/archive")
    ids = [p["id"] for p in client.get("/api/projects").json()]
    assert pr["id"] not in ids and d["id"] in ids
