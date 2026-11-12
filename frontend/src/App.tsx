import { Suspense, lazy, useState, useEffect } from 'react';
import ProjectorCalculator from './modules/ProjectorCalculator';
import LuxCalculator from './modules/LuxCalculator';
import GeometrySimulator from './modules/GeometrySimulator';
import PixelMappingStudio from './modules/PixelMappingStudio';
import ContentPlanner from './modules/ContentPlanner';
import LedCalculator from './modules/LedCalculator';
import LcdCalculator from './modules/LcdCalculator';
import EquipmentDatabase from './modules/EquipmentDatabase';
import CameraCalculator from './modules/CameraCalculator';
import ReportGenerator from './modules/ReportGenerator';
import ProjectManager from './modules/ProjectManager';
import ElectricalDrawingStudio from './modules/ElectricalDrawingStudio';
import { LengthUnit } from './engine/units';

const RoomDesigner = lazy(() => import('./modules/RoomDesigner'));

interface Mod { id: string; name: string; ready: boolean; phase: number }
const MODULES: Mod[] = [
  { id: 'projector', name: 'Ekran, Projektör & Lens', ready: true, phase: 1 },
  { id: 'lux', name: 'Lux & Parlaklık', ready: true, phase: 2 },
  { id: 'geometry', name: 'Projeksiyon Geometrisi', ready: true, phase: 2 },
  { id: 'content', name: 'İçerik Çözünürlüğü Planlayıcı', ready: true, phase: 3 },
  { id: 'pixel', name: 'Çoklu Projektör & Piksel Haritalama', ready: true, phase: 3 },
  { id: 'led', name: 'LED Duvar', ready: true, phase: 4 },
  { id: 'lcd', name: 'LCD Video Duvarı', ready: true, phase: 4 },
  { id: 'equipment', name: 'Ekipman Veritabanı', ready: true, phase: 4 },
  { id: 'room', name: '3D Oda Tasarımı', ready: true, phase: 5 },
  { id: 'camera', name: 'Kamera & FOV', ready: true, phase: 5 },
  { id: 'report', name: 'Rapor & Çizim (PDF)', ready: true, phase: 6 },
  { id: 'projects', name: 'Projeler & Revizyonlar', ready: true, phase: 6 },
  { id: 'electrical', name: 'CAD (DXF/DWG) & Elektrik Şeması', ready: true, phase: 7 },
];

export default function App() {
  const [active, setActive] = useState('projector');

  useEffect(() => {
    const handleNav = (e: any) => {
      const target = e.detail === 'screen' ? 'projector' : e.detail === 'multi' ? 'pixel' : e.detail;
      if (target && MODULES.some(m => m.id === target)) {
        setActive(target);
      }
    };
    window.addEventListener('navigate-module' as any, handleNav);
    return () => window.removeEventListener('navigate-module' as any, handleNav);
  }, []);
  const [unit, setUnit] = useState<LengthUnit>('m');
  const [dark, setDark] = useState(true);

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="flex h-screen bg-slate-950 text-slate-200">
        <aside className="w-64 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col">
          <div className="p-4 text-sm font-bold tracking-wide text-sky-400">
            PROJEKSİYON &amp; EKRAN<br />TASARIM STÜDYOSU
          </div>
          <nav className="flex-1 overflow-auto">
            {MODULES.map(m => (
              <button
                key={m.id}
                onClick={() => setActive(m.id)}
                className={`w-full text-left px-4 py-2 text-sm flex justify-between hover:bg-slate-800 ${active === m.id ? 'bg-slate-800 text-sky-300 font-medium' : ''}`}
              >
                <span>{m.name}</span>
                {!m.ready && <span className="text-[10px] text-amber-400">Faz {m.phase}</span>}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-slate-800 flex gap-2 text-sm">
            <select
              className="bg-slate-800 rounded px-2 py-1"
              value={unit}
              onChange={e => setUnit(e.target.value as LengthUnit)}
              title="Görüntüleme birimi"
            >
              {(['m', 'cm', 'mm', 'ft', 'in'] as LengthUnit[]).map(u => <option key={u}>{u}</option>)}
            </select>
            <button className="bg-slate-800 rounded px-2 py-1" onClick={() => setDark(!dark)}>
              {dark ? 'Açık' : 'Koyu'}
            </button>
          </div>
        </aside>
        <main className="flex-1 p-4 overflow-auto">
          {active === 'lux' ? <LuxCalculator unit={unit} />
            : active === 'geometry' ? <GeometrySimulator unit={unit} />
            : active === 'content' ? <ContentPlanner unit={unit} />
            : active === 'pixel' ? <PixelMappingStudio />
            : active === 'led' ? <LedCalculator unit={unit} />
            : active === 'lcd' ? <LcdCalculator unit={unit} />
            : active === 'equipment' ? <EquipmentDatabase />
            : active === 'room' ? <Suspense fallback={<div className="text-slate-400">3B sahne yükleniyor…</div>}><RoomDesigner /></Suspense>
            : active === 'camera' ? <CameraCalculator unit={unit} />
            : active === 'report' ? <ReportGenerator />
            : active === 'projects' ? <ProjectManager />
            : active === 'electrical' ? <ElectricalDrawingStudio />
            : <ProjectorCalculator unit={unit} />}
        </main>
      </div>
    </div>
  );
}
