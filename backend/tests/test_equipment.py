from test_api import client  # noqa: F401  (fixture)


def test_equipment_crud_duplicate_filter(client):
    # Kurgusal test verisi
    body = {"category": "led_cabinet", "manufacturer": "TestCo", "model": "C-1",
            "specs": {"pitch_mm": 2.5, "width_mm": 500, "height_mm": 500}, "notes": "n"}
    e = client.post("/api/equipment", json=body).json()
    assert e["verified"] is False and e["specs"]["pitch_mm"] == 2.5
    d = client.post(f"/api/equipment/{e['id']}/duplicate").json()
    assert d["model"].endswith("(kopya)")
    rows = client.get("/api/equipment", params={"category": "led_cabinet"}).json()
    assert len(rows) >= 2
    assert client.get("/api/equipment", params={"category": "cable"}).json() == []
    body["notes"] = "güncel"
    assert client.put(f"/api/equipment/{e['id']}", json=body).json()["notes"] == "güncel"
    assert client.delete(f"/api/equipment/{d['id']}").status_code == 204


def test_equipment_rejects_invalid_category(client):
    r = client.post("/api/equipment", json={"category": "bogus", "model": "x"})
    assert r.status_code == 422
