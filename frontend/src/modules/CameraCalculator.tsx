import { useMemo, useState } from 'react';
import { fov, focalForFraming, framing, visibleSize } from '../engine/camera';
import { LengthUnit, fromMeters, toMeters, round } from '../engine/units';

const SENSORS: Record<string, [number, number]> = { '35 mm tam kare (36×24)': [36, 24], 'Süper 35 (24.89×18.66)': [24.89, 18.66], 'APS-C (23.5×15.6)': [23.5, 15.6], '1" (13.2×8.8)': [13.2, 8.8], 'Özel': [0, 0] };

export default function CameraCalculator({ unit }: { unit: LengthUnit }) {
  const [sensor, setSensor] = useState('35 mm tam kare (36×24)');
  const [sw, setSw] = useState(36), [sh, setSh] = useState(24), [focal, setFocal] = useState(50);
  const [dist, setDist] = useState(10), [yaw, setYaw] = useState(0);
  const [subW, setSubW] = useState(4), [subH, setSubH] = useState(2.25);
  const [camX, setCamX] = useState(0);
  const pick = (k: string) => { setSensor(k); const s = SENSORS[k]; if (s[0]) { setSw(s[0]); setSh(s[1]); } };

  const r = useMemo(() => {
    try {
      const cam = { sensorW: sw, sensorH: sh, focal }, d = toMeters(dist, unit);
      const f = fov(cam), v = visibleSize(cam, d), fr = framing(cam, d, toMeters(subW, unit), toMeters(subH, unit));
      const needF = focalForFraming(sw, d, toMeters(subW, unit));
      return { f, v, fr, needF, err: null as string | null, d };
    } catch (e) { return { err: (e as Error).message } as any; }
  }, [sw, sh, focal, dist, subW, subH, unit]);

  const u = (m: number) => `${round(fromMeters(m, unit), 3)} ${unit}`;
  const N = (l: string, v: number, s: (x: number) => void) => (
    <label className="block text-xs">{l}<input className="inp" type="number" step="any" value={v} onChange={e => s(+e.target.value)} /></label>);

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4 h-full">
      <div className="space-y-2 p-3 rounded border border-slate-700 bg-slate-900 text-sm">
        <h2 className="font-semibold">Kamera & Görüş Alanı</h2>
        <label className="block text-xs">Sensör<select className="inp" value={sensor} onChange={e => pick(e.target.value)}>{Object.keys(SENSORS).map(k => <option key={k}>{k}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2">{N('Sensör genişliği (mm)', sw, x => { setSw(x); setSensor('Özel'); })}{N('Sensör yüksekliği (mm)', sh, x => { setSh(x); setSensor('Özel'); })}</div>
        {N('Odak uzaklığı (mm)', focal, setFocal)}
        {N(`Kamera–konu mesafesi (${unit})`, dist, setDist)}
        {N('Kamera yatay açısı / yaw (°)', yaw, setYaw)}
        {N(`Kamera yanal konumu x (${unit})`, camX, setCamX)}
        <div className="grid grid-cols-2 gap-2">{N(`Konu genişliği (${unit})`, subW, setSubW)}{N(`Konu yüksekliği (${unit})`, subH, setSubH)}</div>
        <p className="text-[11px] text-slate-500">Model: rektilineer mercek, distorsiyon ve odak nefes alması (breathing) yok. Yakın mesafede etkin odak uzaklığı değişebilir.</p>
      </div>
      <div className="space-y-3 min-w-0">
        {r.err ? <p className="text-red-400">⚠ {r.err}</p> : <>
          <div className="grid sm:grid-cols-3 gap-2 text-sm">
            {([['Yatay FOV', `${round(r.f.hDeg, 2)}°`], ['Dikey FOV', `${round(r.f.vDeg, 2)}°`], ['Diagonal FOV', `${round(r.f.dDeg, 2)}°`],
              ['Görünür genişlik', u(r.v.width)], ['Görünür yükseklik', u(r.v.height)],
              ['Kapsama (konu/kadraj)', `${round(r.fr.fillW * 100, 1)} % × ${round(r.fr.fillH * 100, 1)} %`],
              ['Konu sığıyor mu', r.fr.fits ? 'Evet' : 'Hayır — kadraj dışına taşıyor'],
              ['Konu genişliğini doldurmak için odak', `${round(r.needF, 1)} mm`]] as [string, string][]).map(([k, v]) =>
              <div key={k} className="p-2 rounded bg-slate-900 border border-slate-700"><div className="text-xs text-slate-400">{k}</div>{v}</div>)}
          </div>
          <TopView hDeg={r.f.hDeg} dist={r.d} subW={toMeters(subW, unit)} yaw={yaw} camX={toMeters(camX, unit)} unit={unit} />
        </>}
      </div>
    </div>
  );
}

function TopView({ hDeg, dist, subW, yaw, camX, unit }: { hDeg: number; dist: number; subW: number; yaw: number; camX: number; unit: LengthUnit }) {
  const half = hDeg * Math.PI / 360, y = yaw * Math.PI / 180;
  // kamera (camX, 0); konu düzlemi z=dist; sol/sağ sınır ışınları
  const ray = (a: number): [number, number] => { const t = dist / Math.cos(y + a); return [camX + Math.sin(y + a) * t, Math.cos(y + a) * t]; };
  const L = ray(-half), R = ray(half);
  const xs = [camX, L[0], R[0], -subW / 2, subW / 2], span = Math.max(...xs) - Math.min(...xs) || 1, pad = span * 0.1;
  const minX = Math.min(...xs) - pad, W = span + 2 * pad, H = Math.max(dist, L[1], R[1]) * 1.1;
  return (
    <div>
      <svg viewBox={`${minX} ${-H * 0.05} ${W} ${H}`} className="w-full max-h-[50vh] bg-slate-950 border border-slate-700 rounded">
        <polygon points={`${camX},0 ${L[0]},${L[1]} ${R[0]},${R[1]}`} fill="#38bdf8" opacity=".15" stroke="#38bdf8" strokeWidth={W / 500} />
        <line x1={-subW / 2} y1={dist} x2={subW / 2} y2={dist} stroke="#f472b6" strokeWidth={W / 120} />
        <circle cx={camX} cy={0} r={W / 60} fill="#f59e0b" />
        <text x={camX} y={-H * 0.01} fill="#94a3b8" fontSize={W / 40} textAnchor="middle">kamera</text>
        <text x={0} y={dist - W / 60} fill="#f472b6" fontSize={W / 40} textAnchor="middle">konu {round(fromMeters(subW, unit), 2)} {unit}</text>
      </svg>
      <p className="text-xs text-slate-500">Üstten görünüş: kadraj (mavi) ve konu (pembe). Konu düzlemi z = mesafe'de ve eksenlere dik alınmıştır; kamera yaw ≠ 0 ise kadraj bu düzlemde kesilir (konu boyutu yaklaşıktır).</p>
    </div>);
}
