import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useLoader, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Aabb, Projector3D, Surface, V3, cornerDirs, frame, rayHit } from '../engine/room3d';
import { ImportedModel, useRoom } from '../roomStore';

const COLORS = ['#38bdf8', '#f472b6', '#4ade80', '#fbbf24', '#a78bfa'];

function basis(yaw: number, pitch: number): THREE.Matrix4 {
  const f = frame(yaw, pitch);
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.r), new THREE.Vector3(...f.u), new THREE.Vector3(...f.f));
}

/** Seçili nesneyi sürüklenebilir yapar (yalnızca öteleme). */
function Draggable({ selected, pos, onMove, children }: { selected: boolean; pos: V3; onMove: (p: V3) => void; children: React.ReactNode }) {
  if (!selected) return <group position={pos}>{children}</group>;
  return (
    <TransformControls mode="translate" position={pos} onObjectChange={(e: any) => onMove(e.target.object.position.toArray() as V3)}>
      <group>{children}</group>
    </TransformControls>);
}

function ProjectorObj({ p, i, surfaces }: { p: Projector3D; i: number; surfaces: Surface[] }) {
  const { sel, setSel, upsertProjector } = useRoom();
  const selected = sel?.type === 'projector' && sel.id === p.id;
  const col = COLORS[i % COLORS.length];
  const m = useMemo(() => basis(p.yawDeg, p.pitchDeg), [p.yawDeg, p.pitchDeg]);
  const hits = useMemo(() => cornerDirs(p).map(d => {
    let best: { t: number; p: V3 } | null = null;
    for (const s of surfaces) { const h = rayHit(p.pos, d, s); if (h && (!best || h.t < best.t)) best = h; }
    const pt: V3 = best ? best.p : [p.pos[0] + d[0] * 15, p.pos[1] + d[1] * 15, p.pos[2] + d[2] * 15];
    return { pt, hit: !!best };
  }), [p, surfaces]);

  const beam = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const v: number[] = [], a = p.pos;
    for (let k = 0; k < 4; k++) { const b = hits[k].pt, c = hits[(k + 1) % 4].pt; v.push(...a, ...b, ...c); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return g;
  }, [hits, p.pos]);
  const edges = useMemo(() => {
    const v: number[] = [];
    for (let k = 0; k < 4; k++) v.push(...p.pos, ...hits[k].pt);
    for (let k = 0; k < 4; k++) v.push(...hits[k].pt, ...hits[(k + 1) % 4].pt);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return g;
  }, [hits, p.pos]);

  return (
    <>
      {/* Işın dünya koordinatlarında; sürüklenen gövde ile birlikte güncellenir */}
      <mesh geometry={beam}><meshBasicMaterial color={col} transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <lineSegments geometry={edges}><lineBasicMaterial color={col} /></lineSegments>
      <Draggable selected={selected} pos={p.pos} onMove={pos => upsertProjector({ ...p, pos })}>
        <group matrixAutoUpdate={false} matrix={m} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); setSel({ type: 'projector', id: p.id }); }}>
          <mesh><boxGeometry args={[0.45, 0.16, 0.5]} /><meshStandardMaterial color={selected ? '#facc15' : '#64748b'} /></mesh>
          <mesh position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.06, 0.06, 0.1, 16]} /><meshStandardMaterial color={col} /></mesh>
        </group>
      </Draggable>
    </>);
}

function SurfaceObj({ s }: { s: Surface }) {
  const { sel, setSel } = useRoom();
  const selected = sel?.type === 'surface' && sel.id === s.id;
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); setSel({ type: 'surface', id: s.id }); };
  const mat = <meshStandardMaterial color={selected ? '#facc15' : '#94a3b8'} transparent opacity={0.45} side={THREE.DoubleSide} />;
  if (s.kind === 'plane')
    return <group position={s.center} matrixAutoUpdate={false} matrix={basis(s.yawDeg, s.pitchDeg).setPosition(...s.center)} onClick={click}>
      <mesh><planeGeometry args={[s.width, s.height]} />{mat}</mesh></group>;
  if (s.kind === 'cylinder')
    return <mesh position={[s.center[0], s.center[1] + s.height / 2, s.center[2]]} onClick={click}>
      <cylinderGeometry args={[s.radius, s.radius, s.height, 64, 1, true, THREE.MathUtils.degToRad(s.startDeg), THREE.MathUtils.degToRad(s.endDeg - s.startDeg)]} />{mat}</mesh>;
  return <mesh position={s.center} onClick={click}><sphereGeometry args={[s.radius, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />{mat}</mesh>;
}

function ObstacleObj({ o }: { o: Aabb }) {
  const { sel, setSel, upsertObstacle } = useRoom();
  const selected = sel?.type === 'obstacle' && sel.id === o.id;
  const size: V3 = [o.max[0] - o.min[0], o.max[1] - o.min[1], o.max[2] - o.min[2]];
  const c: V3 = [o.min[0] + size[0] / 2, o.min[1] + size[1] / 2, o.min[2] + size[2] / 2];
  return (
    <Draggable selected={selected} pos={c} onMove={p => upsertObstacle({ ...o, min: [p[0] - size[0] / 2, p[1] - size[1] / 2, p[2] - size[2] / 2], max: [p[0] + size[0] / 2, p[1] + size[1] / 2, p[2] + size[2] / 2] })}>
      <mesh onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); setSel({ type: 'obstacle', id: o.id }); }}>
        <boxGeometry args={size} /><meshStandardMaterial color={selected ? '#facc15' : '#b45309'} /></mesh>
    </Draggable>);
}

function ModelObj({ m }: { m: ImportedModel }) {
  const loader = m.ext === 'obj' ? OBJLoader : m.ext === 'fbx' ? FBXLoader : GLTFLoader;
  const res: any = useLoader(loader as any, m.url);
  const obj: THREE.Object3D = useMemo(() => (res.scene ?? res).clone(), [res]);
  return <primitive object={obj} position={m.pos} scale={m.scale} />;
}

function Human() {
  return (
    <group position={[1.8, 0, 2]}>
      <mesh position={[0, 0.85, 0]}><capsuleGeometry args={[0.2, 1.3, 4, 12]} /><meshStandardMaterial color="#f87171" /></mesh>
      <mesh position={[0, 1.65, 0]}><sphereGeometry args={[0.11, 16, 12]} /><meshStandardMaterial color="#fca5a5" /></mesh>
    </group>);
}

export default function Scene3D({ onReady }: { onReady: (gl: THREE.WebGLRenderer) => void }) {
  const { room, surfaces, obstacles, projectors, models, human, setSel } = useRoom();
  const edge = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(room.w, room.h, room.l)), [room]);
  const ref = useRef<THREE.Group>(null);
  return (
    <Canvas camera={{ position: [-9, 7, -4], fov: 50, near: 0.05, far: 500 }} gl={{ preserveDrawingBuffer: true }}
      onCreated={({ gl }) => onReady(gl)} onPointerMissed={() => setSel(null)}>
      <color attach="background" args={['#0b1220']} />
      <ambientLight intensity={0.7} /><directionalLight position={[5, 10, -5]} intensity={0.8} />
      <Grid args={[40, 40]} position={[0, 0.001, room.l / 2]} cellColor="#334155" sectionColor="#475569" infiniteGrid fadeDistance={40} />
      <lineSegments geometry={edge} position={[0, room.h / 2, room.l / 2]}><lineBasicMaterial color="#64748b" /></lineSegments>
      <group ref={ref}>
        {surfaces.map(s => <SurfaceObj key={s.id} s={s} />)}
        {obstacles.map(o => <ObstacleObj key={o.id} o={o} />)}
        {projectors.map((p, i) => <ProjectorObj key={p.id} p={p} i={i} surfaces={surfaces} />)}
        {models.map(m => <Suspense key={m.id} fallback={null}><ModelObj m={m} /></Suspense>)}
        {human && <Human />}
      </group>
      <OrbitControls makeDefault target={[0, room.h / 2, room.l / 2]} />
    </Canvas>);
}
