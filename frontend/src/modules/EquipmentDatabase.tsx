import { useEffect, useMemo, useState } from 'react';
import { EquipmentRecord, equipmentApi, api } from '../api';
import {
  CATALOG_BRANDS,
  CATALOG_LENSES,
  CATALOG_PROJECTORS,
  getCompatibleCatalogLenses,
} from '../data/projectorCatalog';

export const CATEGORIES: Record<string, string> = {
  projector: 'Projektörler',
  lens: 'Lensler',
  led_cabinet: 'LED kabinler',
  led_processor: 'LED işlemciler',
  lcd_display: 'LCD ekranlar',
  videowall_display: 'Video duvarı ekranları',
  media_server: 'Medya sunucuları',
  camera: 'Kameralar',
  mounting: 'Montaj aksesuarları',
  cable: 'Kablolar',
  extender: 'Sinyal uzatıcılar',
};

/** LED kabin kayıtları için tanımlı spec anahtarları (LED hesaplayıcı bunları okur). */
export const LED_SPEC_KEYS = ['pitch_mm', 'width_mm', 'height_mm', 'res_w', 'res_h', 'weight_kg', 'power_typ_w', 'power_max_w'];

const empty = (category: string): EquipmentRecord => ({ category, model: '', manufacturer: '', specs: {}, compat: [], verified: false });

export default function EquipmentDatabase() {
  const [cat, setCat] = useState('projector');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<EquipmentRecord[]>([]);
  const [edit, setEdit] = useState<EquipmentRecord | null>(null);
  const [err, setErr] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [specText, setSpecText] = useState('');
  const [compatText, setCompatText] = useState('');

  const load = () =>
    equipmentApi
      .list(cat)
      .then(r => {
        setRows(r);
        setErr('');
      })
      .catch(() => {
        setRows([]);
        setErr('');
      });

  useEffect(() => {
    load();
    setEdit(null);
  }, [cat]);

  const open = (e: EquipmentRecord) => {
    setEdit(e);
    setSpecText(Object.entries(e.specs).map(([k, v]) => `${k}=${v}`).join('\n'));
    setCompatText(e.compat.join('\n'));
  };

  const save = async () => {
    if (!edit) return;
    const specs: Record<string, string | number> = {};
    for (const line of specText.split('\n')) {
      const i = line.indexOf('=');
      if (i < 1) continue;
      const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
      specs[k] = v !== '' && !isNaN(Number(v)) ? Number(v) : v;
    }
    const rec = { ...edit, specs, compat: compatText.split('\n').map(s => s.trim()).filter(Boolean) };
    try {
      rec.id ? await equipmentApi.update(rec) : await equipmentApi.create(rec);
      setEdit(null);
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const filteredCatalogProjectors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CATALOG_PROJECTORS.filter(p => {
      if (brandFilter !== 'ALL' && p.manufacturer !== brandFilter) return false;
      if (!q) return true;
      return (
        p.manufacturer.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        p.lensMount.toLowerCase().includes(q) ||
        p.technology.toLowerCase().includes(q)
      );
    });
  }, [brandFilter, search]);

  const filteredCatalogLenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CATALOG_LENSES.filter(l => {
      if (brandFilter !== 'ALL' && l.manufacturer !== brandFilter) return false;
      if (!q) return true;
      return (
        l.manufacturer.toLowerCase().includes(q) ||
        l.model.toLowerCase().includes(q) ||
        l.lensMount.toLowerCase().includes(q)
      );
    });
  }, [brandFilter, search]);

  const useProjectorInCalc = (projId: string, lensId?: string) => {
    localStorage.setItem('selected_catalog_selection', JSON.stringify({ projId, lensId }));
    window.dispatchEvent(new CustomEvent('navigate-module', { detail: 'projector' }));
  };

  const syncAllToBackend = async () => {
    try {
      setSyncMsg('Senkronize ediliyor...');
      const payload = {
        projectors: CATALOG_PROJECTORS.map(p => ({
          manufacturer: p.manufacturer,
          model: p.model,
          native_w: p.nativeW,
          native_h: p.nativeH,
          ansi_lumens: p.ansiLumens,
          lens_mount: p.lensMount,
          aspect: p.aspect,
          verified: true,
        })),
        lenses: CATALOG_LENSES.map(l => ({
          manufacturer: l.manufacturer,
          model: l.model,
          throw_min: l.throwMin,
          throw_max: l.throwMax,
          lens_mount: l.lensMount,
          verified: true,
        })),
      };
      const res = await api.importDb(payload);
      setSyncMsg(`✔ Veritabanına aktarıldı: ${res.projectors} projektör, ${res.lenses} lens (${res.skipped} zaten kayıtlı).`);
      load();
    } catch (e) {
      setSyncMsg(`Backend API bağlı değil; dahili katalog doğrudan hesaplayıcılarda aktif.`);
    }
  };

  return (
    <div className="grid lg:grid-cols-[240px_1fr] gap-4 h-full">
      <div className="p-3 rounded border border-slate-700 bg-slate-900 space-y-1 text-sm overflow-auto">
        <h2 className="font-semibold mb-2">Ekipman Kataloğu</h2>
        {Object.entries(CATEGORIES).map(([k, n]) => (
          <button
            key={k}
            onClick={() => setCat(k)}
            className={`block w-full text-left px-2 py-1.5 rounded flex justify-between items-center ${cat === k ? 'bg-slate-700 text-sky-300 font-medium' : 'hover:bg-slate-800'}`}
          >
            <span>{n}</span>
            {k === 'projector' && <span className="text-[10px] bg-sky-900/60 text-sky-300 px-1.5 rounded">{CATALOG_PROJECTORS.length}</span>}
            {k === 'lens' && <span className="text-[10px] bg-sky-900/60 text-sky-300 px-1.5 rounded">{CATALOG_LENSES.length}</span>}
          </button>
        ))}
      </div>

      <div className="space-y-3 min-w-0 overflow-auto">
        {err && <p className="text-amber-400 text-sm">⚠ {err}</p>}

        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex items-center gap-2">
            <b className="text-base">{CATEGORIES[cat]}</b>
            <button className="px-3 py-1 bg-sky-700 hover:bg-sky-600 rounded text-xs font-medium" onClick={() => open(empty(cat))}>
              + Özel Ürün Ekle
            </button>
          </div>

          {(cat === 'projector' || cat === 'lens') && (
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={syncAllToBackend}
                className="px-2.5 py-1 bg-emerald-800/70 hover:bg-emerald-700 border border-emerald-700 rounded text-xs text-emerald-200"
              >
                ⬇ Backend DB&apos;ye Aktar
              </button>
            </div>
          )}
        </div>

        {syncMsg && <div className="text-xs px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-sky-300">{syncMsg}</div>}

        {/* Marka Filtresi ve Arama (Projektörler ve Lensler için) */}
        {(cat === 'projector' || cat === 'lens') && (
          <div className="flex flex-wrap gap-2 items-center bg-slate-900/80 p-2.5 rounded border border-slate-800">
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setBrandFilter('ALL')}
                className={`px-2.5 py-1 rounded text-xs ${brandFilter === 'ALL' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Tümü
              </button>
              {CATALOG_BRANDS.map(b => (
                <button
                  key={b}
                  onClick={() => setBrandFilter(b)}
                  className={`px-2.5 py-1 rounded text-xs ${brandFilter === b ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {b}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Model, lens veya mount ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ml-auto bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 w-56 outline-none focus:border-sky-500"
            />
          </div>
        )}

        {/* Projektörler Dahili Çoklu Marka Kataloğu */}
        {cat === 'projector' && (
          <div className="overflow-x-auto rounded border border-slate-700">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="p-2">Marka</th>
                  <th className="p-2">Model</th>
                  <th className="p-2">ANSI Lümen</th>
                  <th className="p-2">Çözünürlük</th>
                  <th className="p-2">Teknoloji</th>
                  <th className="p-2">Uyumlu Lensler / Mount</th>
                  <th className="p-2 text-right">Hesaplama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredCatalogProjectors.map(p => {
                  const lenses = getCompatibleCatalogLenses(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="p-2 font-semibold text-sky-300">{p.manufacturer}</td>
                      <td className="p-2 font-semibold text-slate-100">{p.model}</td>
                      <td className="p-2 font-mono text-amber-300">{p.ansiLumens.toLocaleString('tr-TR')} lm</td>
                      <td className="p-2 text-slate-300">{p.nativeW}×{p.nativeH} ({p.aspect})</td>
                      <td className="p-2 text-slate-400">{p.technology}</td>
                      <td className="p-2 text-slate-300">
                        <span className="text-slate-400">{p.lensMount}:</span>{' '}
                        {lenses.length} lens
                      </td>
                      <td className="p-2 text-right">
                        <button
                          onClick={() => useProjectorInCalc(p.id)}
                          className="px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white font-medium"
                        >
                          Hesaplamada Kullan →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Lensler Dahili Çoklu Marka Kataloğu */}
        {cat === 'lens' && (
          <div className="overflow-x-auto rounded border border-slate-700">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="p-2">Marka</th>
                  <th className="p-2">Lens Modeli</th>
                  <th className="p-2">Throw Ratio (TR)</th>
                  <th className="p-2">Lens Mount / Seri</th>
                  <th className="p-2">Açıklama</th>
                  <th className="p-2 text-right">Hesaplama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredCatalogLenses.map(l => {
                  const matchingProj = CATALOG_PROJECTORS.find(p => p.lensMount === l.lensMount);
                  return (
                    <tr key={l.id} className="hover:bg-slate-800/40">
                      <td className="p-2 font-semibold text-sky-300">{l.manufacturer}</td>
                      <td className="p-2 font-semibold text-slate-100">{l.model}</td>
                      <td className="p-2 font-mono text-emerald-300">
                        {l.throwMin === l.throwMax ? `${l.throwMin.toFixed(2)}:1` : `${l.throwMin.toFixed(2)} – ${l.throwMax.toFixed(2)}:1`}
                      </td>
                      <td className="p-2 text-slate-300">{l.lensMount}</td>
                      <td className="p-2 text-slate-400">{l.notes ?? '—'}</td>
                      <td className="p-2 text-right">
                        {matchingProj && (
                          <button
                            onClick={() => useProjectorInCalc(matchingProj.id, l.id)}
                            className="px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white font-medium"
                          >
                            Hesaplamada Kullan →
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Kullanıcı / Backend DB Kayıtları */}
        {rows.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-slate-400 font-semibold">Özel / Veritabanı Kayıtları ({rows.length})</div>
            <table className="w-full text-sm border border-slate-700">
              <thead className="text-slate-400 text-xs">
                <tr><th className="text-left p-1">Üretici</th><th className="text-left">Model</th><th>Durum</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="p-1">{r.manufacturer}</td>
                    <td>{r.model}</td>
                    <td className={`text-center text-xs ${r.verified ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {r.verified ? 'doğrulanmış' : 'kullanıcı girişi'}
                    </td>
                    <td className="text-right space-x-2 pr-1 text-xs">
                      <button onClick={() => open(r)}>Düzenle</button>
                      <button onClick={() => equipmentApi.duplicate(r.id!).then(load).catch(e => setErr(e.message))}>Çoğalt</button>
                      <button className="text-red-400" onClick={() => confirm(`${r.model} silinsin mi?`) && equipmentApi.remove(r.id!).then(load).catch(e => setErr(e.message))}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cat !== 'projector' && cat !== 'lens' && rows.length === 0 && (
          <p className="p-3 text-slate-500 text-sm border border-slate-800 rounded">
            Kayıt yok. &quot;+ Özel Ürün Ekle&quot; ile yeni kayıt ekleyebilirsiniz.
          </p>
        )}

        {edit && (
          <div className="p-3 border border-slate-700 rounded bg-slate-900 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <label>Üretici<input className="inp" value={edit.manufacturer ?? ''} onChange={e => setEdit({ ...edit, manufacturer: e.target.value })} /></label>
              <label>Model<input className="inp" value={edit.model} onChange={e => setEdit({ ...edit, model: e.target.value })} /></label>
              <label>Üretici bağlantısı (URL)<input className="inp" value={edit.url ?? ''} onChange={e => setEdit({ ...edit, url: e.target.value })} /></label>
              <label>Görsel URL<input className="inp" value={edit.image_url ?? ''} onChange={e => setEdit({ ...edit, image_url: e.target.value })} /></label>
            </div>
            <label className="block">
              Teknik özellikler (her satır: anahtar=değer)
              {cat === 'led_cabinet' && <span className="text-xs text-slate-400"> — LED hesaplayıcı için: {LED_SPEC_KEYS.join(', ')}</span>}
              <textarea className="inp h-28 font-mono" value={specText} onChange={e => setSpecText(e.target.value)} />
            </label>
            <label className="block">Uyumluluk (her satır bir kayıt)<textarea className="inp h-16" value={compatText} onChange={e => setCompatText(e.target.value)} /></label>
            <label className="block">Notlar<textarea className="inp h-16" value={edit.notes ?? ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></label>
            <label><input type="checkbox" checked={edit.verified} onChange={e => setEdit({ ...edit, verified: e.target.checked })} /> Üretici datasheet&apos;i ile doğrulandı</label>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-sky-700 rounded" onClick={save} disabled={!edit.model.trim()}>Kaydet</button>
              <button className="px-3 py-1 bg-slate-700 rounded" onClick={() => setEdit(null)}>Vazgeç</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
