import { useEffect, useState } from 'react';
import { projectApi, ProjectSummary } from '../api';
import { useProjectStore } from '../projectStore';
import { download } from '../util';

export default function ProjectManager() {
  const { currentProjectId, setCurrentProjectId, meta, setMeta, serializeAll, hydrateAll } = useProjectStore();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [revNote, setRevNote] = useState('');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reload = () => projectApi.list(showArchived)
    .then(r => { setProjects(r); setErr(''); })
    .catch(e => setErr((e as Error).message));

  useEffect(() => { reload(); }, [showArchived]);

  const createNew = async () => {
    try {
      const p = await projectApi.create({
        name: meta.projectName,
        customer: meta.customer,
        location: meta.location,
        description: meta.description,
        category: meta.category,
        project_date: meta.date,
        data: serializeAll(),
      });
      setCurrentProjectId(p.id);
      setMeta({ revision: p.current_revision });
      setMsg(`Proje #${p.id} oluşturuldu (Rev 1).`);
      reload();
    } catch (e) { setErr((e as Error).message); }
  };

  const saveNewRevision = async () => {
    if (!currentProjectId) return createNew();
    try {
      const p = await projectApi.newRevision(currentProjectId, serializeAll(), revNote || 'Yeni revizyon');
      setMeta({ revision: p.current_revision });
      setRevNote('');
      setMsg(`Proje #${p.id} için Rev ${p.current_revision} kaydedildi.`);
      reload();
    } catch (e) { setErr((e as Error).message); }
  };

  const overwriteCurrent = async () => {
    if (!currentProjectId) return;
    try {
      const p = await projectApi.overwriteRevision(currentProjectId, meta.revision, serializeAll(), revNote || undefined, confirmOverwrite);
      setConfirmOverwrite(false);
      setMsg(`Rev ${p.current_revision} üzerine yazıldı.`);
      reload();
    } catch (e) { setErr((e as Error).message); }
  };

  const openRevision = async (pid: number, revNo?: number) => {
    try {
      const p = await projectApi.get(pid, revNo);
      setCurrentProjectId(p.id);
      if (p.data) hydrateAll(p.data as Record<string, any>);
      setMeta({
        projectName: p.name,
        customer: p.customer ?? '',
        location: p.location ?? '',
        description: p.description ?? '',
        category: p.category ?? '',
        date: p.project_date ?? meta.date,
        revision: revNo ?? p.current_revision,
      });
      setMsg(`Proje #${p.id} (Rev ${revNo ?? p.current_revision}) yüklendi.`);
    } catch (e) { setErr((e as Error).message); }
  };

  const activeProj = projects.find(p => p.id === currentProjectId);

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-4 h-full text-xs">
      <div className="space-y-2 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto">
        <h2 className="text-sm font-semibold">Proje Yönetimi & Revizyon Geçmişi</h2>
        {err && <p className="text-amber-400">⚠ {err}</p>}
        {msg && <p className="text-emerald-400">✔ {msg}</p>}

        <label className="block">Proje Adı<input className="inp" value={meta.projectName} onChange={e => setMeta({ projectName: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label>Müşteri<input className="inp" value={meta.customer} onChange={e => setMeta({ customer: e.target.value })} /></label>
          <label>Konum<input className="inp" value={meta.location} onChange={e => setMeta({ location: e.target.value })} /></label>
          <label>Kategori<input className="inp" value={meta.category} onChange={e => setMeta({ category: e.target.value })} /></label>
          <label>Tarih<input className="inp" type="date" value={meta.date} onChange={e => setMeta({ date: e.target.value })} /></label>
        </div>
        <label className="block">Açıklama<textarea className="inp h-14" value={meta.description} onChange={e => setMeta({ description: e.target.value })} /></label>
        <label className="block">Revizyon Notu<input className="inp" value={revNote} onChange={e => setRevNote(e.target.value)} placeholder="Örn: Lens modeli ve elektrik linyesi güncellendi" /></label>

        <div className="flex flex-wrap gap-2 pt-1">
          <button className="px-3 py-1.5 bg-sky-700 rounded font-semibold text-white" onClick={createNew}>Yeni Proje Olarak Kaydet</button>
          {currentProjectId && (
            <button className="px-3 py-1.5 bg-emerald-700 rounded font-semibold text-white" onClick={saveNewRevision}>
              Yeni Revizyon Ekle (Önerilen)
            </button>
          )}
        </div>

        {currentProjectId && (
          <div className="p-2 rounded border border-amber-700/60 bg-amber-950/20 space-y-1">
            <label className="flex items-center gap-2 text-amber-300">
              <input type="checkbox" checked={confirmOverwrite} onChange={e => setConfirmOverwrite(e.target.checked)} />
              <span>Mevcut Rev {meta.revision} üzerine yazmayı onaylıyorum</span>
            </label>
            <button className="px-2 py-1 bg-amber-800 rounded disabled:opacity-40" disabled={!confirmOverwrite} onClick={overwriteCurrent}>
              Rev {meta.revision} Üzerine Yaz
            </button>
          </div>
        )}

        <div className="border-t border-slate-700 pt-2 flex gap-2">
          <button className="px-2 py-1 bg-slate-700 rounded" onClick={() => download(`${meta.projectName || 'proje'}.json`, JSON.stringify(serializeAll(), null, 2), 'application/json')}>
            JSON Proje Dışa Aktar
          </button>
          <label className="px-2 py-1 bg-slate-700 rounded cursor-pointer">
            JSON Proje İçe Aktar
            <input type="file" accept=".json" hidden onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                hydrateAll(JSON.parse(await f.text()));
                setMsg('JSON proje dosyası çalışma alanına yüklendi.');
              } catch (ex) { setErr((ex as Error).message); }
            }} />
          </label>
        </div>
      </div>

      <div className="space-y-3 min-w-0">
        <div className="flex justify-between items-center">
          <b className="text-sm">Kayıtlı Projeler</b>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            <span>Arşivlenenleri göster</span>
          </label>
        </div>

        <table className="w-full border border-slate-700">
          <thead className="bg-slate-900 text-slate-400"><tr><th className="text-left p-2">ID / Proje</th><th className="text-left">Müşteri</th><th>Konum</th><th>Aktif Rev</th><th>İşlemler</th></tr></thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.id} className={`border-t border-slate-800 ${p.id === currentProjectId ? 'bg-sky-950/30' : ''}`}>
                <td className="p-2 font-semibold">#{p.id} {p.name} {p.archived && <span className="text-amber-400">(Arşiv)</span>}</td>
                <td>{p.customer ?? '—'}</td>
                <td className="text-center">{p.location ?? '—'}</td>
                <td className="text-center">Rev {p.current_revision}</td>
                <td className="text-right p-2 space-x-2">
                  <button className="text-sky-400" onClick={() => openRevision(p.id)}>Aç</button>
                  <button onClick={() => projectApi.duplicate(p.id).then(reload)}>Çoğalt</button>
                  <button className="text-amber-400" onClick={() => projectApi.archive(p.id, !p.archived).then(reload)}>{p.archived ? 'Arşivden Çıkar' : 'Arşivle'}</button>
                </td>
              </tr>
            ))}
            {projects.length === 0 && <tr><td colSpan={5} className="p-3 text-slate-500">Henüz veritabanında kayıtlı proje yok.</td></tr>}
          </tbody>
        </table>

        {activeProj && (
          <div className="p-3 rounded border border-slate-700 bg-slate-900 space-y-2">
            <b>Proje #{activeProj.id} ({activeProj.name}) — Revizyon Geçmişi</b>
            <div className="space-y-1">
              {activeProj.revisions.map(r => (
                <div key={r.revision_no} className="flex justify-between items-center p-1.5 rounded bg-slate-950 border border-slate-800">
                  <span><b>Rev {r.revision_no}</b> — {r.note || 'Not yok'} <span className="text-slate-500">({new Date(r.created_at).toLocaleString('tr-TR')})</span></span>
                  <button className="px-2 py-0.5 bg-slate-800 rounded text-sky-300" onClick={() => openRevision(activeProj.id, r.revision_no)}>Bu Revizyonu Yükle</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
