import { useState, useEffect } from 'react';
import ProjectorCalculator from './modules/ProjectorCalculator';
import LuxCalculator from './modules/LuxCalculator';
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

interface Mod { id: string; name: string; ready: boolean; phase: number }
const MODULES: Mod[] = [
  { id: 'projector', name: 'Ekran, Projektör & Lens', ready: true, phase: 1 },
  { id: 'lux', name: 'Lux & Parlaklık', ready: true, phase: 2 },
  { id: 'content', name: 'İçerik Çözünürlüğü Planlayıcı', ready: true, phase: 3 },
  { id: 'pixel', name: 'Çoklu Projektör & Piksel Haritalama', ready: true, phase: 3 },
  { id: 'led', name: 'LED Duvar', ready: true, phase: 4 },
  { id: 'lcd', name: 'LCD Video Duvarı', ready: true, phase: 4 },
  { id: 'equipment', name: 'Ekipman Veritabanı', ready: true, phase: 4 },
  { id: 'camera', name: 'Kamera & FOV', ready: true, phase: 5 },
  { id: 'report', name: 'Rapor & Çizim (PDF)', ready: true, phase: 6 },
  { id: 'projects', name: 'Projeler & Revizyonlar', ready: true, phase: 6 },
  { id: 'electrical', name: 'CAD (DXF/DWG) & Elektrik Şeması', ready: true, phase: 7 },
];

export default function App() {
  const [active, setActive] = useState('projector');
  const [visited, setVisited] = useState<Set<string>>(() => new Set(['projector']));

  const selectTab = (id: string) => {
    setActive(id);
    setVisited(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const handleNav = (e: any) => {
      const target = (e.detail === 'screen' || e.detail === 'geometry') ? 'projector' : e.detail === 'multi' ? 'pixel' : e.detail;
      if (target && MODULES.some(m => m.id === target)) {
        selectTab(target);
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
                onClick={() => selectTab(m.id)}
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
          {visited.has('projector') && <div className={active === 'projector' ? 'h-full' : 'hidden'}><ProjectorCalculator unit={unit} /></div>}
          {visited.has('lux') && <div className={active === 'lux' ? 'h-full' : 'hidden'}><LuxCalculator unit={unit} /></div>}
          {visited.has('content') && <div className={active === 'content' ? 'h-full' : 'hidden'}><ContentPlanner unit={unit} /></div>}
          {visited.has('pixel') && <div className={active === 'pixel' ? 'h-full' : 'hidden'}><PixelMappingStudio /></div>}
          {visited.has('led') && <div className={active === 'led' ? 'h-full' : 'hidden'}><LedCalculator unit={unit} /></div>}
          {visited.has('lcd') && <div className={active === 'lcd' ? 'h-full' : 'hidden'}><LcdCalculator unit={unit} /></div>}
          {visited.has('equipment') && <div className={active === 'equipment' ? 'h-full' : 'hidden'}><EquipmentDatabase /></div>}
          {visited.has('camera') && <div className={active === 'camera' ? 'h-full' : 'hidden'}><CameraCalculator unit={unit} /></div>}
          {visited.has('report') && <div className={active === 'report' ? 'h-full' : 'hidden'}><ReportGenerator /></div>}
          {visited.has('projects') && <div className={active === 'projects' ? 'h-full' : 'hidden'}><ProjectManager /></div>}
          {visited.has('electrical') && <div className={active === 'electrical' ? 'h-full' : 'hidden'}><ElectricalDrawingStudio /></div>}
        </main>
      </div>
    </div>
  );
}
