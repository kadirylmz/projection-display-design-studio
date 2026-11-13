import { useState, useEffect, Component, ReactNode, ErrorInfo } from 'react';
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

class ModuleErrorBoundary extends Component<{ name: string; children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { name: string; children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Bilinmeyen hata' };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] Modül hatası:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-200 space-y-3">
          <div className="font-semibold text-base">"{this.props.name}" modülü yüklenirken bir hata oluştu</div>
          <div className="text-xs font-mono text-rose-300/90 bg-black/30 p-2 rounded">{this.state.message}</div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium"
          >
            Yeniden Dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
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
          {visited.has('projector') && <div className={active === 'projector' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="Ekran, Projektör & Lens"><ProjectorCalculator unit={unit} /></ModuleErrorBoundary></div>}
          {visited.has('lux') && <div className={active === 'lux' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="Lux & Parlaklık"><LuxCalculator unit={unit} /></ModuleErrorBoundary></div>}
          {visited.has('content') && <div className={active === 'content' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="İçerik Çözünürlüğü Planlayıcı"><ContentPlanner unit={unit} /></ModuleErrorBoundary></div>}
          {visited.has('pixel') && <div className={active === 'pixel' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="Çoklu Projektör & Piksel Haritalama"><PixelMappingStudio /></ModuleErrorBoundary></div>}
          {visited.has('led') && <div className={active === 'led' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="LED Duvar"><LedCalculator unit={unit} /></ModuleErrorBoundary></div>}
          {visited.has('lcd') && <div className={active === 'lcd' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="LCD Video Duvarı"><LcdCalculator unit={unit} /></ModuleErrorBoundary></div>}
          {visited.has('equipment') && <div className={active === 'equipment' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="Ekipman Veritabanı"><EquipmentDatabase /></ModuleErrorBoundary></div>}
          {visited.has('camera') && <div className={active === 'camera' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="Kamera & FOV"><CameraCalculator unit={unit} /></ModuleErrorBoundary></div>}
          {visited.has('report') && <div className={active === 'report' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="Rapor & Çizim (PDF)"><ReportGenerator /></ModuleErrorBoundary></div>}
          {visited.has('projects') && <div className={active === 'projects' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="Projeler & Revizyonlar"><ProjectManager /></ModuleErrorBoundary></div>}
          {visited.has('electrical') && <div className={active === 'electrical' ? 'h-full' : 'hidden'}><ModuleErrorBoundary name="CAD & Elektrik Şeması"><ElectricalDrawingStudio /></ModuleErrorBoundary></div>}
        </main>
      </div>
    </div>
  );
}
