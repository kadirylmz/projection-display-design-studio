import { useEffect, useState } from 'react';
import { EquipmentRecord, equipmentApi } from '../api';

export const CATEGORIES: Record<string, string> = {
  projector: 'Projektörler', lens: 'Lensler', led_cabinet: 'LED kabinler', led_processor: 'LED işlemciler',
  lcd_display: 'LCD ekranlar', videowall_display: 'Video duvarı ekranları', media_server: 'Medya sunucuları',
  camera: 'Kameralar', mounting: 'Montaj aksesuarları', cable: 'Kablolar', extender: 'Sinyal uzatıcılar',
};

/** LED kabin kayıtları için tanımlı spec anahtarları (LED hesaplayıcı bunları okur). */
export const LED_SPEC_KEYS = ['pitch_mm', 'width_mm', 'height_mm', 'res_w', 'res_h', 'weight_kg', 'power_typ_w', 'power_max_w'];

const empty = (category: string): EquipmentRecord => ({ category, model: '', manufacturer: '', specs: {}, compat: [], verified: false });

export default function EquipmentDatabase() {
  const [cat, setCat] = useState('led_cabinet');
  const [rows, setRows] = useState<EquipmentRecord[]>([]);
  const [edit, setEdit] = useState<EquipmentRecord | null>(null);
  const [err, setErr] = useState('');
  const [specText, setSpecText] = useState('');
  const [compatText, setCompatText] = useState('');

  const load = () => equipmentApi.list(cat).then(r => { setRows(r); setErr(''); }).catch(e => setErr((e as Error).message));
  useEffect(() => { load(); setEdit(null); }, [cat]);

  const open = (e: EquipmentRecord) => {
    setEdit(e);
    setSpecText(Object.entries(e.specs).map(([k, v]) => `${k}=${v}`).join('\n'));
    setCompatText(e.compat.join('\n'));
  };
  const save = async () => {
    if (!edit) return;
    const specs: Record<string, string | number> = {};
    for (const line of specText.split('\n')) {
      const i = line.indexOf('='); if (i < 1) continue;
      const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
      specs[k] = v !== '' && !isNaN(Number(v)) ? Number(v) : v;
    }
    const rec = { ...edit, specs, compat: compatText.split('\n').map(s => s.trim()).filter(Boolean) };
    try { rec.id ? await equipmentApi.update(rec) : await equipmentApi.create(rec); setEdit(null); load(); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="grid lg:grid-cols-[240px_1fr] gap-4 h-full">
      <div className="p-3 rounded border border-slate-700 bg-slate-900 space-y-1 text-sm overflow-auto">
        <h2 className="font-semibold mb-2">Ekipman Kataloğu</h2>
        {Object.entries(CATEGORIES).map(([k, n]) => (
          <button key={k} onClick={() => setCat(k)} className={`block w-full text-left px-2 py-1 rounded ${cat === k ? 'bg-slate-700 text-sky-300' : 'hover:bg-slate-800'}`}>{n}</button>))}
      </div>
      <div className="space-y-3 min-w-0">
        {err && <p className="text-amber-400 text-sm">⚠ {err}</p>}
        <div className="flex gap-2 items-center">
          <b>{CATEGORIES[cat]}</b>
          <button className="px-3 py-1 bg-sky-700 rounded text-sm" onClick={() => open(empty(cat))}>+ Yeni ürün</button>
        </div>
        <table className="w-full text-sm border border-slate-700">
          <thead className="text-slate-400 text-xs"><tr><th className="text-left p-1">Üretici</th><th className="text-left">Model</th><th>Durum</th><th></th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id} className="border-t border-slate-800">
              <td className="p-1">{r.manufacturer}</td><td>{r.model}</td>
              <td className={`text-center text-xs ${r.verified ? 'text-emerald-400' : 'text-amber-400'}`}>{r.verified ? 'doğrulanmış' : 'kullanıcı girişi'}</td>
              <td className="text-right space-x-2 pr-1 text-xs">
                <button onClick={() => open(r)}>Düzenle</button>
                <button onClick={() => equipmentApi.duplicate(r.id!).then(load).catch(e => setErr(e.message))}>Çoğalt</button>
                <button className="text-red-400" onClick={() => confirm(`${r.model} silinsin mi?`) && equipmentApi.remove(r.id!).then(load).catch(e => setErr(e.message))}>Sil</button>
              </td></tr>))}
            {rows.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-500">Kayıt yok. Kendi ürününüzü ekleyin (veri üreticinin datasheet'inden alınmalıdır).</td></tr>}
          </tbody>
        </table>
        {edit && (
          <div className="p-3 border border-slate-700 rounded bg-slate-900 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <label>Üretici<input className="inp" value={edit.manufacturer ?? ''} onChange={e => setEdit({ ...edit, manufacturer: e.target.value })} /></label>
              <label>Model<input className="inp" value={edit.model} onChange={e => setEdit({ ...edit, model: e.target.value })} /></label>
              <label>Üretici bağlantısı (URL)<input className="inp" value={edit.url ?? ''} onChange={e => setEdit({ ...edit, url: e.target.value })} /></label>
              <label>Görsel URL<input className="inp" value={edit.image_url ?? ''} onChange={e => setEdit({ ...edit, image_url: e.target.value })} /></label>
            </div>
            <label className="block">Teknik özellikler (her satır: anahtar=değer){cat === 'led_cabinet' && <span className="text-xs text-slate-400"> — LED hesaplayıcı için: {LED_SPEC_KEYS.join(', ')}</span>}
              <textarea className="inp h-28 font-mono" value={specText} onChange={e => setSpecText(e.target.value)} /></label>
            <label className="block">Uyumluluk (her satır bir kayıt)<textarea className="inp h-16" value={compatText} onChange={e => setCompatText(e.target.value)} /></label>
            <label className="block">Notlar<textarea className="inp h-16" value={edit.notes ?? ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></label>
            <label><input type="checkbox" checked={edit.verified} onChange={e => setEdit({ ...edit, verified: e.target.checked })} /> Üretici datasheet'i ile doğrulandı</label>
            <div className="flex gap-2"><button className="px-3 py-1 bg-sky-700 rounded" onClick={save} disabled={!edit.model.trim()}>Kaydet</button>
              <button className="px-3 py-1 bg-slate-700 rounded" onClick={() => setEdit(null)}>Vazgeç</button></div>
          </div>)}
      </div>
    </div>
  );
}
