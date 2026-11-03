import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { Aabb, Projector3D, Surface, V3, centerDir, coverage, rayHit } from '../engine/room3d';
import { ImportedModel, newId, useRoom } from '../roomStore';
import { round } from '../engine/units';
import { download } from '../util';
import { Box3, Object3D } from 'three';

const Scene3D = lazy(() => import('./Scene3D'));

const num = (v: number, set: (n: number) => void, step: number | string = 'any') =>
  <input className="inp !mt-0" type="number" step={step} value={Number.isFinite(v) ? round(v, 4) : 0} onChange={e => set(+e.target.value)} />;
const Row = ({ l, children }: { l: string; children: React.ReactNode }) => <label className="text-[11px] text-slate-400">{l}{children}</label>;

export default function RoomDesigner() {
  const st = useRoom();
  const { room, surfaces, obstacles, projectors, models, sel } = st;
  const gl = useRef<THREE.WebGLRenderer | null>(null);
  const [msg, setMsg] = useState('');

  const cov = useMemo(() => projectors.flatMap(p => surfaces.map(s => ({ p, s, c: coverage(p, s, obstacles, 90, 55) }))), [projectors, surfaces, obstacles]);
  const axis = (p: Projector3D) => {
    let best: { t: number; id: string } | null = null;
    const d = centerDir(p), L = Math.hypot(...d);
    for (const s of surfaces) { const h = rayHit(p.pos, d, s); if (h && (!best || h.t < best.t)) best = { t: h.t * L, id: s.id }; }
    return best;
  };

  const addWall = (k: string) => {
    const { w, l, h } = room;
    const defs: Record<string, Omit<Extract<Surface, { kind: 'plane' }>, 'id' | 'kind'>> = {
      'Ön duvar': { label: 'Ön duvar', center: [0, h / 2, l], yawDeg: 180, pitchDeg: 0, width: w, height: h },
      'Arka duvar': { label: 'Arka duvar', center: [0, h / 2, 0], yawDeg: 0, pitchDeg: 0, width: w, height: h },
      'Sol duvar': { label: 'Sol duvar', center: [-w / 2, h / 2, l / 2], yawDeg: 90, pitchDeg: 0, width: l, height: h },
      'Sağ duvar': { label: 'Sağ duvar', center: [w / 2, h / 2, l / 2], yawDeg: -90, pitchDeg: 0, width: l, height: h },
      'Zemin': { label: 'Zemin', center: [0, 0, l / 2], yawDeg: 0, pitchDeg: 90, width: w, height: l },
      'Tavan': { label: 'Tavan', center: [0, h, l / 2], yawDeg: 0, pitchDeg: -90, width: w, height: l },
    };
    const id = newId('S'); st.upsertSurface({ kind: 'plane', id, ...defs[k] }); st.setSel({ type: 'surface', id });
  };
  const addCyl = () => { const id = newId('S'); st.upsertSurface({ kind: 'cylinder', id, label: 'Silindirik yüzey', center: [0, 0, room.l / 2], radius: Math.min(room.w, room.l) / 2 - 0.2, height: room.h, startDeg: -90, endDeg: 90 }); st.setSel({ type: 'surface', id }); };
  const addDome = () => { const id = newId('S'); st.upsertSurface({ kind: 'dome', id, label: 'Kubbe', center: [0, 0, room.l / 2], radius: Math.min(room.w, room.l) / 2 }); st.setSel({ type: 'surface', id }); };
  const addProj = () => { const id = newId('P'); st.upsertProjector({ id, label: `Projektör ${projectors.length + 1}`, pos: [0, 2.5, 4], yawDeg: 0, pitchDeg: 0, throwRatio: 1.5, aspect: 16 / 9 }); st.setSel({ type: 'projector', id }); };
  const addObs = (label: string, size: V3) => { const id = newId('O'); st.upsertObstacle({ id, label, min: [-size[0] / 2, 0, room.l / 3], max: [size[0] / 2, size[1], room.l / 3 + size[2]] }); st.setSel({ type: 'obstacle', id }); };

  const importModel = (f: File) => {
    const ext = f.name.split('.').pop()!.toLowerCase();
    if (!['glb', 'gltf', 'obj', 'fbx'].includes(ext)) { setMsg('Desteklenen biçimler: GLB, GLTF, OBJ, FBX'); return; }
    if (ext === 'gltf') setMsg('Not: harici doku/bin dosyası gerektiren .gltf yüklenemeyebilir; GLB önerilir.');
    else setMsg('');
    const id = newId('M');
    st.upsertModel({ id, name: f.name, ext: ext as ImportedModel['ext'], url: URL.createObjectURL(f), pos: [0, 0, room.l / 2], scale: 1 });
    st.setSel({ type: 'model', id });
  };

  const modelAsObstacle = async (m: ImportedModel) => {
    // Sınırlayıcı kutuyu engel olarak ekler (model geometrisi doluluk hesabına doğrudan girmez).
    try {
      const THREE = await import('three');
      let obj: Object3D;
      if (m.ext === 'obj') obj = new (await import('three/examples/jsm/loaders/OBJLoader.js')).OBJLoader().parse(await (await fetch(m.url)).text());
      else if (m.ext === 'fbx') obj = new (await import('three/examples/jsm/loaders/FBXLoader.js')).FBXLoader().parse(await (await fetch(m.url)).arrayBuffer(), '');
      else obj = (await new (await import('three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader().parseAsync(await (await fetch(m.url)).arrayBuffer(), '')).scene;
      obj.scale.setScalar(m.scale); obj.position.set(...m.pos); obj.updateMatrixWorld(true);
      const b = new Box3().setFromObject(obj);
      const id = newId('O');
      st.upsertObstacle({ id, label: `${m.name} (sınırlayıcı kutu)`, min: b.min.toArray() as V3, max: b.max.toArray() as V3 });
      void THREE;
      setMsg('Sınırlayıcı kutu engel olarak eklendi (kaba yaklaşım).');
    } catch (e) { setMsg(`Model okunamadı: ${(e as Error).message}`); }
  };

  const selP = sel?.type === 'projector' ? projectors.find(p => p.id === sel.id) : null;
  const selS = sel?.type === 'surface' ? surfaces.find(s => s.id === sel.id) : null;
  const selO = sel?.type === 'obstacle' ? obstacles.find(o => o.id === sel.id) : null;
  const selM = sel?.type === 'model' ? models.find(o => o.id === sel.id) : null;
  const v3 = (v: V3, set: (n: V3) => void) => (
    <div className="grid grid-cols-3 gap-1">{[0, 1, 2].map(i => <div key={i}>{num(v[i], x => { const n = [...v] as V3; n[i] = x; set(n); })}</div>)}</div>);

  return (
    <div className="grid lg:grid-cols-[330px_1fr] gap-3 h-full">
      <div className="space-y-2 p-3 rounded border border-slate-700 bg-slate-900 overflow-auto text-sm" style={{ maxHeight: '88vh' }}>
        <h2 className="font-semibold">3B Oda Tasarımcısı</h2>
        <div className="grid grid-cols-3 gap-1">
          <Row l="Genişlik (m)">{num(room.w, x => st.setRoom({ ...room, w: x }))}</Row>
          <Row l="Uzunluk (m)">{num(room.l, x => st.setRoom({ ...room, l: x }))}</Row>
          <Row l="Yükseklik (m)">{num(room.h, x => st.setRoom({ ...room, h: x }))}</Row></div>
        <div className="text-[11px] text-slate-500">Koordinat: X sağ, Y yukarı, Z ileri; oda x∈[−w/2,w/2], z∈[0,l].</div>
        <div className="flex flex-wrap gap-1 text-xs">
          <button className="px-2 py-1 bg-sky-700 rounded" onClick={addProj}>+ Projektör</button>
          {['Ön duvar', 'Arka duvar', 'Sol duvar', 'Sağ duvar', 'Zemin', 'Tavan'].map(k => <button key={k} className="px-2 py-1 bg-slate-700 rounded" onClick={() => addWall(k)}>+ {k}</button>)}
          <button className="px-2 py-1 bg-slate-700 rounded" onClick={addCyl}>+ Silindir</button>
          <button className="px-2 py-1 bg-slate-700 rounded" onClick={addDome}>+ Kubbe</button>
          <button className="px-2 py-1 bg-amber-800 rounded" onClick={() => addObs('Kolon', [0.5, room.h, 0.5])}>+ Kolon</button>
          <button className="px-2 py-1 bg-amber-800 rounded" onClick={() => addObs('Engel', [1, 1, 1])}>+ Engel</button>
          <label className="px-2 py-1 bg-slate-700 rounded cursor-pointer">Model içe aktar<input hidden type="file" accept=".glb,.gltf,.obj,.fbx" onChange={e => e.target.files?.[0] && importModel(e.target.files[0])} /></label>
        </div>
        <label className="text-xs block"><input type="checkbox" checked={st.human} onChange={e => st.setHuman(e.target.checked)} /> İnsan ölçek referansı (1.75 m)</label>
        {msg && <p className="text-xs text-amber-400">{msg}</p>}
        <p className="text-[11px] text-slate-500">Sürükleme: nesneyi seçin (tıklayın), ok/halka ile taşıyın. Yüzey eğimi ve diğer parametreler aşağıdaki alanlardan girilir.</p>

        {selP && <Panel title={`Projektör: ${selP.label}`} onDelete={() => st.remove('projector', selP.id)}>
          <Row l="Konum (x, y, z)">{v3(selP.pos, pos => st.upsertProjector({ ...selP, pos }))}</Row>
          <div className="grid grid-cols-2 gap-1">
            <Row l="Yaw (°)">{num(selP.yawDeg, x => st.upsertProjector({ ...selP, yawDeg: x }))}</Row>
            <Row l="Pitch (°)">{num(selP.pitchDeg, x => st.upsertProjector({ ...selP, pitchDeg: x }))}</Row>
            <Row l="Throw ratio">{num(selP.throwRatio, x => st.upsertProjector({ ...selP, throwRatio: x > 0 ? x : selP.throwRatio }))}</Row>
            <Row l="En/boy (w/h)">{num(selP.aspect, x => st.upsertProjector({ ...selP, aspect: x > 0 ? x : selP.aspect }))}</Row>
            <Row l="Yatay shift (oran)">{num(selP.hShift ?? 0, x => st.upsertProjector({ ...selP, hShift: x }))}</Row>
            <Row l="Dikey shift (oran)">{num(selP.vShift ?? 0, x => st.upsertProjector({ ...selP, vShift: x }))}</Row></div>
          <p className="text-[11px] text-slate-500">Shift: görüntü boyutuna oran (tam-boyut referansı); üreticinin yüzde konvansiyonunu buna çevirin.</p>
        </Panel>}
        {selS && <Panel title={`Yüzey: ${selS.label}`} onDelete={() => st.remove('surface', selS.id)}>
          <Row l="Merkez / taban merkezi (x, y, z)">{v3(selS.center, center => st.upsertSurface({ ...selS, center }))}</Row>
          {selS.kind === 'plane' && <div className="grid grid-cols-2 gap-1">
            <Row l="Normal yaw (°)">{num(selS.yawDeg, x => st.upsertSurface({ ...selS, yawDeg: x }))}</Row>
            <Row l="Eğim / pitch (°)">{num(selS.pitchDeg, x => st.upsertSurface({ ...selS, pitchDeg: x }))}</Row>
            <Row l="Genişlik (m)">{num(selS.width, x => st.upsertSurface({ ...selS, width: Math.max(0.01, x) }))}</Row>
            <Row l="Yükseklik (m)">{num(selS.height, x => st.upsertSurface({ ...selS, height: Math.max(0.01, x) }))}</Row></div>}
          {selS.kind === 'cylinder' && <div className="grid grid-cols-2 gap-1">
            <Row l="Yarıçap (m)">{num(selS.radius, x => st.upsertSurface({ ...selS, radius: Math.max(0.01, x) }))}</Row>
            <Row l="Yükseklik (m)">{num(selS.height, x => st.upsertSurface({ ...selS, height: Math.max(0.01, x) }))}</Row>
            <Row l="Başlangıç açı (°)">{num(selS.startDeg, x => st.upsertSurface({ ...selS, startDeg: x }))}</Row>
            <Row l="Bitiş açı (°)">{num(selS.endDeg, x => st.upsertSurface({ ...selS, endDeg: Math.max(selS.startDeg + 1, x) }))}</Row></div>}
          {selS.kind === 'dome' && <Row l="Yarıçap (m)">{num(selS.radius, x => st.upsertSurface({ ...selS, radius: Math.max(0.01, x) }))}</Row>}
        </Panel>}
        {selO && <Panel title={`Engel: ${selO.label}`} onDelete={() => st.remove('obstacle', selO.id)}>
          <Row l="Min (x, y, z)">{v3(selO.min, min => st.upsertObstacle({ ...selO, min }))}</Row>
          <Row l="Maks (x, y, z)">{v3(selO.max, max => st.upsertObstacle({ ...selO, max }))}</Row></Panel>}
        {selM && <Panel title={`Model: ${selM.name}`} onDelete={() => st.remove('model', selM.id)}>
          <Row l="Konum">{v3(selM.pos, pos => st.upsertModel({ ...selM, pos }))}</Row>
          <Row l="Ölçek">{num(selM.scale, x => st.upsertModel({ ...selM, scale: x > 0 ? x : 1 }))}</Row>
          <button className="px-2 py-1 bg-amber-800 rounded text-xs" onClick={() => modelAsObstacle(selM)}>Sınırlayıcı kutuyu engel olarak ekle</button>
          <p className="text-[11px] text-slate-500">İçe aktarılan model yalnızca görseldir; doluluk hesabına ancak sınırlayıcı kutu olarak girer.</p></Panel>}
      </div>

      <div className="space-y-2 min-w-0">
        <div className="relative rounded border border-slate-700 overflow-hidden" style={{ height: '58vh' }}>
          <Suspense fallback={<div className="p-4 text-slate-400">3B motor yükleniyor…</div>}>
            <Scene3D onReady={g => { gl.current = g; }} />
          </Suspense>
          <button className="absolute top-2 right-2 px-2 py-1 bg-slate-800/90 rounded text-xs" onClick={() => {
            const g = gl.current; if (!g) return; g.domElement.toBlob(b => b && download('sahne.png', b));
          }}>Ekran görüntüsü (PNG)</button>
        </div>
        <table className="w-full text-xs border border-slate-700">
          <thead className="text-slate-400"><tr><th className="text-left p-1">Projektör</th><th>Yüzey</th><th>Kapsama</th><th>Aydınlanan alan</th><th>Ort. cos θ</th><th>Gölge</th><th>Uyarı</th></tr></thead>
          <tbody>{cov.map(({ p, s, c }) => (
            <tr key={p.id + s.id} className="border-t border-slate-800 text-center">
              <td className="text-left p-1">{p.label}</td><td>{s.label}</td>
              <td>{round(c.coverage * 100, 1)} %</td><td>{round(c.litAreaM2, 2)} / {round(c.surfaceAreaM2, 2)} m²</td>
              <td>{c.lit ? round(c.avgIncidenceCos, 3) : '—'}</td><td>{round(100 * c.occluded / c.samples, 1)} %</td>
              <td className="text-left text-amber-400">{c.warnings.join(' ')}</td></tr>))}
            {cov.length === 0 && <tr><td colSpan={7} className="p-2 text-slate-500">Projektör ve yüzey ekleyin.</td></tr>}
          </tbody></table>
        <div className="text-xs text-slate-400">
          {projectors.map(p => { const a = axis(p); return <span key={p.id} className="mr-4">{p.label}: optik eksen {a ? `${round(a.t, 3)} m → ${surfaces.find(s => s.id === a.id)?.label}` : 'yüzeye ulaşmıyor'}</span>; })}
        </div>
        <p className="text-[11px] text-slate-500">Kapsama yüzey örneklemesiyle (düzenli ızgara) hesaplanır; pinhole projektör ve yalnızca kutu engelleri varsayılır. Yüzeyler birbirini perdelemez, mesh modeller doğrudan hesaba girmez. Faz 7'de hassasiyet artırılacaktır.</p>
      </div>
    </div>
  );
}

function Panel({ title, onDelete, children }: { title: string; onDelete: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-slate-700 rounded p-2 space-y-2">
      <div className="flex justify-between"><b className="text-xs">{title}</b><button className="text-red-400 text-xs" onClick={onDelete}>Sil</button></div>
      {children}
    </div>);
}
