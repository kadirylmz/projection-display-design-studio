import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { download } from '../util';
import type { CalculatedSurface, PhysicalRoomConfig } from './ContentPlanner';

interface PlannerRoom3DProps {
  surfaces: CalculatedSurface[];
  selectedId: string;
  onSelect: (id: string) => void;
  physicalRoom: PhysicalRoomConfig;
  onUpdatePhysicalRoom: (updater: (prev: PhysicalRoomConfig) => PhysicalRoomConfig) => void;
}

const PROJ_COLORS = ['#38bdf8', '#facc15', '#4ade80', '#f472b6', '#a78bfa', '#fb923c'];

export type HumanVariant = 'male_casual' | 'female_dress' | 'curator_suit' | 'child_visitor' | 'seated_bench';

export interface HumanActor {
  id: string;
  name: string;
  variant: HumanVariant;
  x: number;
  z: number;
  rotY: number;
}

export const HUMAN_VARIANT_CATALOG: Record<
  HumanVariant,
  {
    label: string;
    heightM: number;
    eyeHeightM: number;
    bodyWidthM: number;
    jacketColor: string;
    innerColor: string;
    pantsColor: string;
    skinColor: string;
    hairColor: string;
    accentColor: string;
  }
> = {
  male_casual: {
    label: '👨 Erkek Ziyaretçi (1.78m)',
    heightM: 1.78,
    eyeHeightM: 1.66,
    bodyWidthM: 0.46,
    jacketColor: '#0284c7',
    innerColor: '#e2e8f0',
    pantsColor: '#1e3a8a',
    skinColor: '#fed7aa',
    hairColor: '#1e293b',
    accentColor: '#38bdf8',
  },
  female_dress: {
    label: '👩 Kadın Ziyaretçi (1.68m)',
    heightM: 1.68,
    eyeHeightM: 1.56,
    bodyWidthM: 0.42,
    jacketColor: '#db2777',
    innerColor: '#fbcfe8',
    pantsColor: '#9d174d',
    skinColor: '#ffedd5',
    hairColor: '#451a03',
    accentColor: '#f472b6',
  },
  curator_suit: {
    label: '🧔 Müze Küratörü / Mimar (1.82m)',
    heightM: 1.82,
    eyeHeightM: 1.7,
    bodyWidthM: 0.48,
    jacketColor: '#334155',
    innerColor: '#38bdf8',
    pantsColor: '#0f172a',
    skinColor: '#fdba74',
    hairColor: '#0f172a',
    accentColor: '#facc15',
  },
  child_visitor: {
    label: '🧒 Çocuk Ziyaretçi (1.32m)',
    heightM: 1.32,
    eyeHeightM: 1.21,
    bodyWidthM: 0.34,
    jacketColor: '#f59e0b',
    innerColor: '#fef08a',
    pantsColor: '#1d4ed8',
    skinColor: '#ffedd5',
    hairColor: '#78350f',
    accentColor: '#4ade80',
  },
  seated_bench: {
    label: '🪑 Bankta Oturan İzleyici (1.26m)',
    heightM: 1.26,
    eyeHeightM: 1.15,
    bodyWidthM: 0.46,
    jacketColor: '#059669',
    innerColor: '#d1fae5',
    pantsColor: '#1e293b',
    skinColor: '#fed7aa',
    hairColor: '#27272a',
    accentColor: '#34d399',
  },
};

/**
 * Estetik, Yumuşak Hatlı (Capsule / Cylinder / Sphere), Seçilebilir 5 Farklı 3B İnsan Karakter Modeli
 * Mouse ile tıklanıp zeminde (y=0) sürüklenebilir!
 */
function StylizedHuman3D({
  actor,
  isSelected,
  isDragging,
  onSelectActor,
  onStartDrag,
}: {
  actor: HumanActor;
  isSelected: boolean;
  isDragging: boolean;
  onSelectActor: (id: string) => void;
  onStartDrag: (id: string, e: any) => void;
}) {
  const cfg = HUMAN_VARIANT_CATALOG[actor.variant] || HUMAN_VARIANT_CATALOG.male_casual;
  const scale = actor.variant === 'child_visitor' ? 0.74 : actor.variant === 'female_dress' ? 0.94 : 1.0;
  const isSeated = actor.variant === 'seated_bench';

  return (
    <group
      position={[actor.x, 0, actor.z]}
      rotation={[0, actor.rotY, 0]}
      onPointerDown={e => {
        e.stopPropagation();
        onSelectActor(actor.id);
        onStartDrag(actor.id, e);
      }}
    >
      {/* Zemindeki Sürükleme & Seçim Halkası (Her zaman y=0.01'de) */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, isSelected ? 0.44 : 0.36, 36]} />
        <meshBasicMaterial
          color={isDragging ? '#facc15' : isSelected ? '#38bdf8' : '#10b981'}
          side={THREE.DoubleSide}
          transparent
          opacity={isSelected ? 0.95 : 0.65}
        />
      </mesh>

      {/* Sürükleme Yön Okları (Seçiliyse zeminde görünür) */}
      {isSelected && (
        <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.28, 32]} />
          <meshBasicMaterial color="#0284c7" transparent opacity={0.25} side={THREE.DoubleSide} />
        </mesh>
      )}

      {isSeated ? (
        /* OTURAN İZLEYİCİ + MÜZE BANKI MODELİ */
        <group>
          {/* Müze Oturma Bankı (Ahşap/Metal) */}
          <mesh position={[0, 0.42, -0.05]}>
            <boxGeometry args={[0.75, 0.06, 0.42]} />
            <meshStandardMaterial color="#78350f" roughness={0.6} />
          </mesh>
          <mesh position={[-0.3, 0.21, -0.05]}>
            <boxGeometry args={[0.06, 0.42, 0.38]} />
            <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0.3, 0.21, -0.05]}>
            <boxGeometry args={[0.06, 0.42, 0.38]} />
            <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.3} />
          </mesh>

          {/* Ayakkabılar */}
          <mesh position={[-0.11, 0.05, 0.22]}>
            <capsuleGeometry args={[0.048, 0.12, 8, 16]} />
            <meshStandardMaterial color="#0f172a" roughness={0.5} />
          </mesh>
          <mesh position={[0.11, 0.05, 0.22]}>
            <capsuleGeometry args={[0.048, 0.12, 8, 16]} />
            <meshStandardMaterial color="#0f172a" roughness={0.5} />
          </mesh>

          {/* Alt Bacaklar (Dikey) */}
          <mesh position={[-0.11, 0.24, 0.18]}>
            <capsuleGeometry args={[0.055, 0.28, 8, 16]} />
            <meshStandardMaterial color={cfg.pantsColor} roughness={0.6} />
          </mesh>
          <mesh position={[0.11, 0.24, 0.18]}>
            <capsuleGeometry args={[0.055, 0.28, 8, 16]} />
            <meshStandardMaterial color={cfg.pantsColor} roughness={0.6} />
          </mesh>

          {/* Üst Bacaklar (Yatay Oturur vaziyette) */}
          <mesh position={[-0.11, 0.47, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.062, 0.24, 8, 16]} />
            <meshStandardMaterial color={cfg.pantsColor} roughness={0.6} />
          </mesh>
          <mesh position={[0.11, 0.47, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.062, 0.24, 8, 16]} />
            <meshStandardMaterial color={cfg.pantsColor} roughness={0.6} />
          </mesh>

          {/* Gövde */}
          <mesh position={[0, 0.76, -0.04]}>
            <capsuleGeometry args={[0.15, 0.34, 12, 24]} />
            <meshStandardMaterial color={cfg.jacketColor} roughness={0.45} />
          </mesh>

          {/* Kollar */}
          <mesh position={[-0.2, 0.72, 0.02]} rotation={[0.35, 0, 0.1]}>
            <capsuleGeometry args={[0.042, 0.32, 8, 16]} />
            <meshStandardMaterial color={cfg.jacketColor} roughness={0.45} />
          </mesh>
          <mesh position={[0.2, 0.72, 0.02]} rotation={[0.35, 0, -0.1]}>
            <capsuleGeometry args={[0.042, 0.32, 8, 16]} />
            <meshStandardMaterial color={cfg.jacketColor} roughness={0.45} />
          </mesh>

          {/* Baş & Saç */}
          <mesh position={[0, 1.14, -0.02]}>
            <sphereGeometry args={[0.115, 24, 24]} />
            <meshStandardMaterial color={cfg.skinColor} roughness={0.45} />
          </mesh>
          <mesh position={[0, 1.17, -0.035]}>
            <sphereGeometry args={[0.12, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
            <meshStandardMaterial color={cfg.hairColor} roughness={0.7} />
          </mesh>

          {/* Gözler (+Z Bakış Yönü) */}
          <mesh position={[-0.04, 1.15, 0.088]}>
            <sphereGeometry args={[0.015, 10, 10]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0.04, 1.15, 0.088]}>
            <sphereGeometry args={[0.015, 10, 10]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
        </group>
      ) : (
        /* AYAKTA DURAN STİLİZE / MİMARİ İNSAN MODELLERİ */
        <group scale={[scale, scale, scale]}>
          {/* Sol & Sağ Ayakkabı (Yumuşak Kapsül Taban) */}
          <mesh position={[-0.1, 0.05, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.05, 0.13, 8, 16]} />
            <meshStandardMaterial color="#0f172a" roughness={0.5} />
          </mesh>
          <mesh position={[0.1, 0.05, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.05, 0.13, 8, 16]} />
            <meshStandardMaterial color="#0f172a" roughness={0.5} />
          </mesh>

          {/* Bacaklar */}
          <mesh position={[-0.1, 0.47, 0]}>
            <capsuleGeometry args={[0.064, 0.68, 10, 20]} />
            <meshStandardMaterial color={cfg.pantsColor} roughness={0.6} />
          </mesh>
          <mesh position={[0.1, 0.47, 0]}>
            <capsuleGeometry args={[0.064, 0.68, 10, 20]} />
            <meshStandardMaterial color={cfg.pantsColor} roughness={0.6} />
          </mesh>

          {/* Kadın Ziyaretçi İçin Elbise / Etek Konisi */}
          {actor.variant === 'female_dress' && (
            <mesh position={[0, 0.72, 0]}>
              <cylinderGeometry args={[0.14, 0.26, 0.52, 24]} />
              <meshStandardMaterial color={cfg.jacketColor} roughness={0.45} />
            </mesh>
          )}

          {/* Kalça / Bel Geçişi */}
          <mesh position={[0, 0.88, 0]}>
            <capsuleGeometry args={[0.135, 0.12, 10, 20]} />
            <meshStandardMaterial color={cfg.pantsColor} roughness={0.6} />
          </mesh>

          {/* Ana Gövde (Torso - Yuvarlatılmış Kapsül + Omuz) */}
          <mesh position={[0, 1.19, 0]}>
            <capsuleGeometry args={[0.155, 0.36, 12, 24]} />
            <meshStandardMaterial color={cfg.jacketColor} roughness={0.42} />
          </mesh>

          {/* İç Yaka / Gömlek / Fular Detayı */}
          <mesh position={[0, 1.34, 0.095]}>
            <sphereGeometry args={[0.075, 16, 16]} />
            <meshStandardMaterial color={cfg.innerColor} roughness={0.4} />
          </mesh>

          {/* Küratör / Mimar İçin Elinde Tablet / Dosya Detayı */}
          {actor.variant === 'curator_suit' && (
            <mesh position={[0.22, 1.02, 0.16]} rotation={[0.4, -0.2, 0]}>
              <boxGeometry args={[0.18, 0.24, 0.015]} />
              <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.4} />
            </mesh>
          )}

          {/* Omuz Köprüsü */}
          <mesh position={[0, 1.4, 0]} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.065, 0.34, 10, 20]} />
            <meshStandardMaterial color={cfg.jacketColor} roughness={0.42} />
          </mesh>

          {/* Sol & Sağ Kol (Yumuşak Kapsül) */}
          <mesh position={[-0.23, 1.14, 0]} rotation={[0, 0, 0.09]}>
            <capsuleGeometry args={[0.046, 0.44, 10, 20]} />
            <meshStandardMaterial color={cfg.jacketColor} roughness={0.45} />
          </mesh>
          <mesh
            position={[0.23, 1.14, actor.variant === 'curator_suit' ? 0.06 : 0]}
            rotation={[actor.variant === 'curator_suit' ? -0.45 : 0, 0, -0.09]}
          >
            <capsuleGeometry args={[0.046, 0.44, 10, 20]} />
            <meshStandardMaterial color={cfg.jacketColor} roughness={0.45} />
          </mesh>

          {/* Eller */}
          <mesh position={[-0.25, 0.87, 0]}>
            <sphereGeometry args={[0.046, 14, 14]} />
            <meshStandardMaterial color={cfg.skinColor} roughness={0.5} />
          </mesh>
          <mesh
            position={[
              0.25,
              actor.variant === 'curator_suit' ? 0.98 : 0.87,
              actor.variant === 'curator_suit' ? 0.15 : 0,
            ]}
          >
            <sphereGeometry args={[0.046, 14, 14]} />
            <meshStandardMaterial color={cfg.skinColor} roughness={0.5} />
          </mesh>

          {/* Boyun */}
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.052, 0.058, 0.1, 16]} />
            <meshStandardMaterial color={cfg.skinColor} roughness={0.5} />
          </mesh>

          {/* Baş (Kafa) */}
          <mesh position={[0, 1.64, 0]}>
            <sphereGeometry args={[0.118, 24, 24]} />
            <meshStandardMaterial color={cfg.skinColor} roughness={0.45} />
          </mesh>

          {/* Saç Stili */}
          <mesh position={[0, 1.67, -0.015]}>
            <sphereGeometry args={[0.123, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
            <meshStandardMaterial color={cfg.hairColor} roughness={0.75} />
          </mesh>
          {actor.variant === 'female_dress' && (
            /* Uzun Saç / Topuz Detayı */
            <mesh position={[0, 1.58, -0.11]}>
              <capsuleGeometry args={[0.055, 0.14, 8, 16]} />
              <meshStandardMaterial color={cfg.hairColor} roughness={0.75} />
            </mesh>
          )}

          {/* Gözler & Bakış Yönü (+Z) */}
          <mesh position={[-0.042, 1.65, 0.108]}>
            <sphereGeometry args={[0.016, 10, 10]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0.042, 1.65, 0.108]}>
            <sphereGeometry args={[0.016, 10, 10]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
        </group>
      )}

      {/* Baş Üstü Bilgi Etiketi */}
      <Text
        position={[0, cfg.heightM + 0.18, 0]}
        fontSize={0.21}
        color={isSelected ? '#facc15' : '#4ade80'}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.025}
        outlineColor="#020617"
      >
        {`${actor.name} (${cfg.heightM}m)`}
      </Text>
    </group>
  );
}

/**
 * Fiziksel Oda Kabuğu (Duvar Projeksiyon Ölçülerinden Bağımsız Mimari Oda Çerçevesi, Tavan Yüksekliği, Köşe Kolonları)
 */
function PhysicalRoomShell3D({ room }: { room: PhysicalRoomConfig }) {
  if (!room.enabled) return null;

  const w = room.widthM;
  const l = room.lengthM;
  const h = room.heightM;
  const hw = w / 2;
  const hl = l / 2;

  const bottomLoop: [number, number, number][] = [
    [-hw, 0.005, -hl],
    [hw, 0.005, -hl],
    [hw, 0.005, hl],
    [-hw, 0.005, hl],
    [-hw, 0.005, -hl],
  ];

  const topLoop: [number, number, number][] = [
    [-hw, h, -hl],
    [hw, h, -hl],
    [hw, h, hl],
    [-hw, h, hl],
    [-hw, h, -hl],
  ];

  return (
    <group>
      {/* Fiziksel Oda Zemini */}
      <mesh position={[0, -0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, l]} />
        <meshStandardMaterial color="#090d16" roughness={0.9} transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>

      {/* Fiziksel Oda Yarı Saydam Cam/Mimari Yan Yüzeyleri (Duvarların arkasında oda yüksekliğini belli eder) */}
      {/* Sol Fiziksel Duvar */}
      <mesh position={[-hw - 0.03, h / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[l, h]} />
        <meshBasicMaterial color="#1e293b" transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Sağ Fiziksel Duvar */}
      <mesh position={[hw + 0.03, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[l, h]} />
        <meshBasicMaterial color="#1e293b" transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Ön Fiziksel Duvar */}
      <mesh position={[0, h / 2, -hl - 0.03]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#1e293b" transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Alt Zemin Çerçevesi */}
      <Line points={bottomLoop} color="#6366f1" lineWidth={2} />

      {/* Üst Tavan Çerçevesi (Oda Tavan Yüksekliği) */}
      <Line points={topLoop} color="#818cf8" lineWidth={2.5} dashed dashSize={0.35} gapSize={0.18} />

      {/* 4 Köşe Dikey Mimari Kolon Çizgisi */}
      {[
        [-hw, -hl],
        [hw, -hl],
        [hw, hl],
        [-hw, hl],
      ].map(([cx, cz], idx) => (
        <Line
          key={`col-${idx}`}
          points={[
            [cx, 0, cz],
            [cx, h, cz],
          ]}
          color="#6366f1"
          lineWidth={2}
        />
      ))}

      {/* Oda Tavan Yüksekliği ve Fiziksel Ebat Etiketi */}
      <Text
        position={[0, h + 0.35, -hl]}
        fontSize={0.32}
        color="#a5b4fc"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.025}
        outlineColor="#020617"
      >
        {`🏛️ FİZİKSEL ODA KABUĞU: ${w}m (En) × ${l}m (Boy) × Tavan Yüksekliği: ${h}m`}
      </Text>
    </group>
  );
}

/**
 * Tek bir projektör cihazı + 3B Işık Konisi (Frustum) + Duvarda Aydınlanan Gerçek Görüntü Yüzeyi (Quad)
 * + Sahnedeki TÜM İzleyiciler İçin Gerçek Zamanlı Gölge (Shadow Occlusion) Simülasyonu!
 */
function ProjectorFrustum3D({
  pos,
  targetCenter,
  upVec,
  rightVec,
  imgW,
  imgH,
  humans,
  throwDist,
  color,
  label,
  detailText,
  showLabels,
  showSurfaceFill = true,
  isCurvedSurface = false,
}: {
  pos: [number, number, number];
  targetCenter: [number, number, number];
  upVec: [number, number, number];
  rightVec: [number, number, number];
  imgW: number;
  imgH: number;
  humans: HumanActor[];
  throwDist: number;
  color: string;
  label: string;
  detailText: string;
  showLabels: boolean;
  showSurfaceFill?: boolean;
  isCurvedSurface?: boolean;
}) {
  const {
    beamGeo,
    corners,
    lookQuat,
    litPlaneMatrix,
    shadows,
  } = useMemo(() => {
    const p = new THREE.Vector3(...pos);
    const c = new THREE.Vector3(...targetCenter);
    const u = new THREE.Vector3(...upVec).normalize();
    const r = new THREE.Vector3(...rightVec).normalize();
    const normal = new THREE.Vector3().crossVectors(r, u).normalize();

    const halfW = imgW / 2;
    const halfH = imgH / 2;

    // 4 Köşe (Sol-Üst, Sağ-Üst, Sağ-Alt, Sol-Alt)
    const c0 = c.clone().addScaledVector(r, -halfW).addScaledVector(u, halfH);
    const c1 = c.clone().addScaledVector(r, halfW).addScaledVector(u, halfH);
    const c2 = c.clone().addScaledVector(r, halfW).addScaledVector(u, -halfH);
    const c3 = c.clone().addScaledVector(r, -halfW).addScaledVector(u, -halfH);

    const pts = [c0, c1, c2, c3];

    // Piramit (Frustum) yan yüzey üçgenleri
    const verts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      verts.push(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();

    // Projektör gövdesi yönelimi
    const mLook = new THREE.Matrix4().lookAt(p, c, u);
    const q = new THREE.Quaternion().setFromRotationMatrix(mLook);

    // Duvardaki aydınlanan yüzey (Quad) dönüşüm matrisi
    const litCenter = c.clone().addScaledVector(normal, 0.018);
    const mPlane = new THREE.Matrix4().makeBasis(r, u, normal).setPosition(litCenter);

    // SAHNEDEKİ TÜM İNSANLAR İÇİN GÖLGE (SHADOW OCCLUSION) HESABI:
    const shadowList: {
      actorId: string;
      actorName: string;
      matrix: THREE.Matrix4;
      shadowW: number;
      shadowH: number;
      rayStart: [number, number, number];
      rayEnd: [number, number, number];
    }[] = [];

    const planeD = normal.dot(c);

    for (const actor of humans) {
      const cfg = HUMAN_VARIANT_CATALOG[actor.variant] || HUMAN_VARIANT_CATALOG.male_casual;
      const hCenter = new THREE.Vector3(actor.x, cfg.heightM * 0.52, actor.z);
      const hHead = new THREE.Vector3(actor.x, cfg.heightM, actor.z);

      const dirCenter = hCenter.clone().sub(p);
      const denom = normal.dot(dirCenter);

      // Eğer ışın duvara doğru gidiyorsa
      if (denom < -0.001) {
        const tHit = (planeD - normal.dot(p)) / denom;
        // tHit > 1.0 ise insan projektör ile duvar arasındadır
        if (tHit > 1.01 && tHit < 10.0) {
          const hitPt = p.clone().addScaledVector(dirCenter, tHit);
          const rel = hitPt.clone().sub(c);
          const localX = rel.dot(r);
          const localY = rel.dot(u);

          // Gölge bu projektörün duvardaki görüntü alanı içine düşüyor mu?
          if (Math.abs(localX) <= halfW + 0.35 && localY >= -halfH - 0.8 && localY <= halfH + 0.8) {
            const mag = Math.min(3.8, Math.max(1.02, tHit));
            const sW = cfg.bodyWidthM * mag;

            const dirHead = hHead.clone().sub(p);
            const tHead = (planeD - normal.dot(p)) / normal.dot(dirHead);
            const headHit = p.clone().addScaledVector(dirHead, tHead);
            const headLocalY = Math.min(halfH, headHit.clone().sub(c).dot(u));
            const bottomLocalY = -halfH;

            const sH = Math.max(0.25, headLocalY - bottomLocalY);
            if (sH > 0.25 && headLocalY > -halfH + 0.15) {
              const shadowCenterY = (headLocalY + bottomLocalY) / 2;
              const shadowWorldPos = c
                .clone()
                .addScaledVector(r, localX)
                .addScaledVector(u, shadowCenterY)
                .addScaledVector(normal, 0.032);

              const sMat = new THREE.Matrix4().makeBasis(r, u, normal).setPosition(shadowWorldPos);
              shadowList.push({
                actorId: actor.id,
                actorName: actor.name,
                matrix: sMat,
                shadowW: sW,
                shadowH: sH,
                rayStart: [hHead.x, hHead.y, hHead.z],
                rayEnd: [
                  c.x + r.x * localX + u.x * headLocalY,
                  c.y + r.y * localX + u.y * headLocalY,
                  c.z + r.z * localX + u.z * headLocalY,
                ],
              });
            }
          }
        }
      }
    }

    return {
      beamGeo: g,
      corners: pts.map(v => [v.x, v.y, v.z] as [number, number, number]),
      lookQuat: q,
      litPlaneMatrix: mPlane,
      shadows: shadowList,
    };
  }, [pos, targetCenter, upVec, rightVec, imgW, imgH, humans]);

  const midBeamPos: [number, number, number] = [
    (pos[0] + targetCenter[0]) / 2,
    (pos[1] + targetCenter[1]) / 2 + 0.18,
    (pos[2] + targetCenter[2]) / 2,
  ];

  return (
    <group>
      {/* Projektör Cihaz Gövdesi + Tavan Askı Aparatı */}
      <group position={pos} quaternion={lookQuat}>
        <mesh>
          <boxGeometry args={[0.42, 0.16, 0.48]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Lens */}
        <mesh position={[0, 0, -0.26]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.07, 0.08, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
        </mesh>
      </group>

      {/* Projektör Yüksekliği İzdüşüm Çizgisi (Zeminden Projektöre) */}
      <Line
        points={[
          [pos[0], 0, pos[2]],
          [pos[0], pos[1], pos[2]],
        ]}
        color="#475569"
        lineWidth={1}
        dashed
        dashSize={0.2}
        gapSize={0.2}
      />

      {/* Yarı Saydam Işık Konisi (Frustum) */}
      <mesh geometry={beamGeo}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* DUVARDA / YÜZEYDE PROJEKTÖRÜN AYDINLATTIĞI GERÇEK GÖRÜNTÜ DOLGUSU */}
      {showSurfaceFill && !isCurvedSurface && (
        <group matrixAutoUpdate={false} matrix={litPlaneMatrix}>
          <mesh>
            <planeGeometry args={[imgW, imgH]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.34}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <Line
            points={[
              [-imgW / 2, 0, 0.002],
              [imgW / 2, 0, 0.002],
            ]}
            color="#ffffff"
            lineWidth={1}
            transparent
            opacity={0.35}
          />
          <Line
            points={[
              [0, -imgH / 2, 0.002],
              [0, imgH / 2, 0.002],
            ]}
            color="#ffffff"
            lineWidth={1}
            transparent
            opacity={0.35}
          />
        </group>
      )}

      {/* EĞER İZLEYİCİLER IŞIĞIN ÖNÜNDEYSE DUVARDA OLUŞAN GÖLGELER */}
      {shadows.map(sh => (
        <group key={`sh-${sh.actorId}`}>
          <group matrixAutoUpdate={false} matrix={sh.matrix}>
            <mesh position={[0, -sh.shadowH * 0.08, 0]}>
              <planeGeometry args={[sh.shadowW, sh.shadowH * 0.82]} />
              <meshBasicMaterial color="#020617" transparent opacity={0.88} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, sh.shadowH * 0.38, 0.002]}>
              <circleGeometry args={[sh.shadowW * 0.32, 20]} />
              <meshBasicMaterial color="#020617" transparent opacity={0.92} side={THREE.DoubleSide} />
            </mesh>
            <Line
              points={[
                [-sh.shadowW / 2, -sh.shadowH / 2, 0.005],
                [sh.shadowW / 2, -sh.shadowH / 2, 0.005],
                [sh.shadowW / 2, sh.shadowH / 2, 0.005],
                [-sh.shadowW / 2, sh.shadowH / 2, 0.005],
                [-sh.shadowW / 2, -sh.shadowH / 2, 0.005],
              ]}
              color="#ef4444"
              lineWidth={2}
            />
            <Text
              position={[0, 0, 0.01]}
              fontSize={0.17}
              color="#f87171"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#020617"
            >
              {`⚠ GÖLGE (${sh.shadowH.toFixed(1)}m)`}
            </Text>
          </group>

          <Line
            points={[sh.rayStart, sh.rayEnd]}
            color="#ef4444"
            lineWidth={1.8}
            dashed
            dashSize={0.2}
            gapSize={0.15}
          />
        </group>
      ))}

      {/* Köşe Işın Çizgileri */}
      {corners.map((corner, idx) => (
        <Line
          key={`ray-${idx}`}
          points={[pos, corner]}
          color={color}
          lineWidth={1.4}
          transparent
          opacity={0.65}
        />
      ))}

      {/* Duvardaki / Yüzeydeki Açılan Görüntü Çerçevesi */}
      <Line
        points={[corners[0], corners[1], corners[2], corners[3], corners[0]]}
        color={color}
        lineWidth={2.5}
      />

      {/* Projektör Üstü ve Duvardaki Ölçü Etiketleri */}
      {showLabels && (
        <>
          <Text
            position={[pos[0], pos[1] + 0.28, pos[2]]}
            fontSize={0.21}
            color="#f8fafc"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.025}
            outlineColor="#020617"
          >
            {`${label} (D=${throwDist}m · H=${pos[1].toFixed(2)}m)`}
          </Text>

          <Text
            position={midBeamPos}
            fontSize={0.18}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#020617"
          >
            {detailText}
          </Text>
        </>
      )}
    </group>
  );
}

export default function PlannerRoom3D({
  surfaces,
  selectedId,
  onSelect,
  physicalRoom,
  onUpdatePhysicalRoom,
}: PlannerRoom3DProps) {
  const [showBeams, setShowBeams] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showHuman, setShowHuman] = useState(true);
  const [viewFilter, setViewFilter] = useState<'all' | 'selected'>('all');
  const [includeHudOnExport, setIncludeHudOnExport] = useState(true);

  // Çoklu İnsan (İzleyici) Listesi & Seçili İnsan Modeli
  const [humans, setHumans] = useState<HumanActor[]>([
    {
      id: 'h-1',
      name: 'İzleyici 1',
      variant: 'male_casual',
      x: 0,
      z: 0,
      rotY: -Math.PI / 2,
    },
  ]);
  const [selectedHumanId, setSelectedHumanId] = useState<string>('h-1');
  const [draggingHumanId, setDraggingHumanId] = useState<string | null>(null);
  const [newVariant, setNewVariant] = useState<HumanVariant>('female_dress');

  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);

  const activeSurf = surfaces.find(s => s.id === selectedId) || surfaces[0];
  const selectedHuman = humans.find(h => h.id === selectedHumanId) || humans[0];

  // Oda / Sahne 3B Geometri ve Fiziksel Oda Ölçülerini Hesapla
  const sceneData = useMemo(() => {
    const walls = surfaces.filter(s => s.type === 'wall');
    const floor = surfaces.find(s => s.type === 'floor');
    const ceiling = surfaces.find(s => s.type === 'ceiling');

    const specialSurf = surfaces.find(
      s => s.geometry === 'cylinder_360' || s.geometry === 'sphere' || s.geometry === 'dome' || s.geometry === 'concave_arc'
    );

    // Eğer fiziksel oda aktifse duvarların yerleşim genişliğini fiziksel odaya veya duvar genişliklerine göre belirle
    const roomLengthZ = physicalRoom.enabled
      ? physicalRoom.lengthM
      : walls[0]?.effectiveWidthM || floor?.effectiveWidthM || 20;
    const roomWidthX = physicalRoom.enabled
      ? physicalRoom.widthM
      : walls[1]?.effectiveWidthM || floor?.effectiveHeightM || 7;
    const roomHeightY = physicalRoom.enabled
      ? physicalRoom.heightM
      : walls[0]?.effectiveHeightM || 4.3;

    return {
      walls,
      floor,
      ceiling,
      specialSurf,
      roomLengthZ,
      roomWidthX,
      roomHeightY,
    };
  }, [surfaces, physicalRoom]);

  // Seçili Yüzey İçin Doluluk (Coverage) & Gölge Analizi
  const coverageStats = useMemo(() => {
    if (!activeSurf) return null;
    const covPctW = Math.round((activeSurf.totalOpticalWidthM / Math.max(0.1, activeSurf.effectiveWidthM)) * 100);
    const covPctH = Math.round(
      ((activeSurf.rows * activeSurf.singleProjHeightM) / Math.max(0.1, activeSurf.effectiveHeightM)) * 100
    );
    const diffW = +(activeSurf.totalOpticalWidthM - activeSurf.effectiveWidthM).toFixed(2);
    const diffH = +(activeSurf.rows * activeSurf.singleProjHeightM - activeSurf.effectiveHeightM).toFixed(2);

    const projHeight =
      activeSurf.projMountHeightM && activeSurf.projMountHeightM > 0
        ? activeSurf.projMountHeightM
        : Math.max(2.2, activeSurf.effectiveHeightM - 0.15);
    const humanH = selectedHuman ? HUMAN_VARIANT_CATALOG[selectedHuman.variant].heightM : 1.75;
    let hasShadowRisk = false;
    let shadowHeightOnWall = 0;

    if (activeSurf.type === 'wall' && activeSurf.viewDistM < activeSurf.throwDistM) {
      const distFromProjToHuman = activeSurf.throwDistM - activeSurf.viewDistM;
      const tHit = activeSurf.throwDistM / Math.max(0.1, distFromProjToHuman);
      const shadowTopY = projHeight + (humanH - projHeight) * tHit;
      if (shadowTopY > 0.1) {
        hasShadowRisk = true;
        shadowHeightOnWall = +Math.min(activeSurf.effectiveHeightM, shadowTopY).toFixed(2);
      }
    }

    return {
      covPctW,
      covPctH,
      diffW,
      diffH,
      projHeight,
      hasShadowRisk,
      shadowHeightOnWall,
    };
  }, [activeSurf, selectedHuman]);

  // Yeni İnsan (İzleyici) Ekle
  const addHumanActor = () => {
    const idx = humans.length + 1;
    const id = `h-${Date.now().toString().slice(-4)}`;
    // Odanın ortasına hafif kaydırarak yerleştir (y=0)
    const offsetX = ((idx % 3) - 1) * 1.2;
    const offsetZ = ((Math.floor(idx / 3) % 3) - 1) * 1.4;
    const newActor: HumanActor = {
      id,
      name: `İzleyici ${idx}`,
      variant: newVariant,
      x: +offsetX.toFixed(2),
      z: +offsetZ.toFixed(2),
      rotY: 0,
    };
    setHumans(prev => [...prev, newActor]);
    setSelectedHumanId(id);
    setShowHuman(true);
  };

  // Seçili İnsanın Modelini Değiştir
  const changeSelectedHumanVariant = (variant: HumanVariant) => {
    if (!selectedHuman) return;
    setHumans(prev => prev.map(h => (h.id === selectedHuman.id ? { ...h, variant } : h)));
  };

  // Seçili İnsanı 45° Döndür
  const rotateSelectedHuman = () => {
    if (!selectedHuman) return;
    setHumans(prev =>
      prev.map(h => (h.id === selectedHuman.id ? { ...h, rotY: h.rotY + Math.PI / 4 } : h))
    );
  };

  // Seçili İnsanı Seçili Duvarın İzleyici Mesafesine (viewDistM) Hizala
  const snapSelectedHumanToWallViewDist = () => {
    if (!selectedHuman || !activeSurf) return;
    const walls = surfaces.filter(s => s.type === 'wall');
    const wIdx = walls.findIndex(w => w.id === activeSurf.id);
    const hw = sceneData.roomWidthX / 2;
    const hl = sceneData.roomLengthZ / 2;

    let nx = 0;
    let nz = 0;
    let rotY = 0;
    if (wIdx === 0) {
      nx = -hw + activeSurf.viewDistM;
      nz = 0;
      rotY = -Math.PI / 2;
    } else if (wIdx === 1) {
      nx = 0;
      nz = -hl + activeSurf.viewDistM;
      rotY = Math.PI;
    } else if (wIdx === 2) {
      nx = hw - activeSurf.viewDistM;
      nz = 0;
      rotY = Math.PI / 2;
    } else {
      nx = 0;
      nz = hl - activeSurf.viewDistM;
      rotY = 0;
    }

    setHumans(prev =>
      prev.map(h =>
        h.id === selectedHuman.id
          ? { ...h, x: +nx.toFixed(2), z: +nz.toFixed(2), rotY }
          : h
      )
    );
  };

  // Seçili İnsanı Sil (En az 1 insan kalsın)
  const removeSelectedHuman = () => {
    if (humans.length <= 1 || !selectedHuman) return;
    const remaining = humans.filter(h => h.id !== selectedHuman.id);
    setHumans(remaining);
    setSelectedHumanId(remaining[0].id);
  };

  // Mouse ile İnsan Sürükleme Başlat / Bitir (Zeminden Aşağı Gitmez, y=0 Düzleminde Kalır)
  const handleStartDragHuman = (id: string) => {
    setDraggingHumanId(id);
    if (controlsRef.current) {
      controlsRef.current.enabled = false;
    }
  };

  const handleStopDragHuman = () => {
    if (draggingHumanId) {
      setDraggingHumanId(null);
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
    }
  };

  // Hazır Kamera Bakış Açılarına Geçiş
  const setCameraPreset = (preset: 'iso' | 'top' | 'front' | 'left' | 'right' | 'inside') => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;

    const maxDim = Math.max(sceneData.roomLengthZ, sceneData.roomWidthX, 12);
    if (preset === 'iso') {
      cam.position.set(maxDim * 0.85, maxDim * 0.65, maxDim * 0.95);
      ctrl.target.set(0, sceneData.roomHeightY * 0.4, 0);
    } else if (preset === 'top') {
      cam.position.set(0, maxDim * 1.45, 0.01);
      ctrl.target.set(0, 0, 0);
    } else if (preset === 'front') {
      cam.position.set(0, sceneData.roomHeightY * 0.8, maxDim * 1.15);
      ctrl.target.set(0, sceneData.roomHeightY * 0.5, 0);
    } else if (preset === 'left') {
      cam.position.set(-maxDim * 1.15, sceneData.roomHeightY * 0.8, 0);
      ctrl.target.set(0, sceneData.roomHeightY * 0.5, 0);
    } else if (preset === 'right') {
      cam.position.set(maxDim * 1.15, sceneData.roomHeightY * 0.8, 0);
      ctrl.target.set(0, sceneData.roomHeightY * 0.5, 0);
    } else if (preset === 'inside') {
      const h = selectedHuman || humans[0];
      const eyeH = h ? HUMAN_VARIANT_CATALOG[h.variant].eyeHeightM : 1.66;
      cam.position.set(h ? h.x : 0, eyeH, h ? h.z : sceneData.roomLengthZ * 0.25);
      ctrl.target.set(-sceneData.roomWidthX / 2, sceneData.roomHeightY * 0.45, 0);
    }
    cam.updateProjectionMatrix();
    ctrl.update();
  };

  // Mevcut 3B Bakış Açısını Yüksek Çözünürlüklü PNG Olarak İndir
  const exportCurrent3DViewPng = () => {
    const gl = glRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!gl || !scene || !camera) return;

    gl.render(scene, camera);
    const srcCanvas = gl.domElement;

    const outCanvas = document.createElement('canvas');
    const bannerH = includeHudOnExport ? 115 : 0;
    outCanvas.width = srcCanvas.width;
    outCanvas.height = srcCanvas.height + bannerH;

    const ctx = outCanvas.getContext('2d')!;
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

    ctx.drawImage(srcCanvas, 0, 0);

    if (includeHudOnExport && activeSurf && coverageStats) {
      const y0 = srcCanvas.height;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, y0, outCanvas.width, bannerH);

      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(outCanvas.width, y0);
      ctx.stroke();

      const fsTitle = Math.max(15, Math.round(outCanvas.width / 72));
      const fsSub = Math.max(12, Math.round(outCanvas.width / 94));

      ctx.fillStyle = '#38bdf8';
      ctx.font = `bold ${fsTitle}px sans-serif`;
      ctx.fillText(
        `3B ODA, DOLULUK & GÖLGE SİMÜLASYONU — ${activeSurf.name.toUpperCase()} (${activeSurf.effectiveWidthM}m × ${activeSurf.effectiveHeightM}m)`,
        24,
        y0 + 32
      );

      ctx.fillStyle = '#4ade80';
      ctx.font = `bold ${fsSub}px monospace`;
      ctx.fillText(
        `İçerik: ${activeSurf.netW}×${activeSurf.netH} px  |  Piksel: ${activeSurf.avgMmPerPx} mm/px (${activeSurf.ppi} PPI)  |  Yüzey Doluluk: Yatay %${coverageStats.covPctW} (${activeSurf.totalOpticalWidthM}m / ${activeSurf.effectiveWidthM}m) · Dikey %${coverageStats.covPctH}`,
        24,
        y0 + 62
      );

      ctx.fillStyle = coverageStats.hasShadowRisk ? '#f87171' : '#facc15';
      ctx.font = `${fsSub}px monospace`;
      ctx.fillText(
        `PJ Uzaklık: D=${activeSurf.throwDistM}m · PJ Yükseklik: H=${coverageStats.projHeight.toFixed(2)}m (1 PJ: ${activeSurf.singleProjWidthM}m×${activeSurf.singleProjHeightM}m)  |  Oda Tavan: ${physicalRoom.heightM}m`,
        24,
        y0 + 92
      );
    }

    outCanvas.toBlob(blob => {
      if (blob) {
        const safeName = (activeSurf?.name || 'oda').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        download(`3d-simulasyon-${safeName}-${Date.now().toString().slice(-4)}.png`, blob);
      }
    }, 'image/png');
  };

  return (
    <div className="flex flex-col h-full w-full space-y-2">
      {/* 1. ÜST 3B SİMÜLASYON KONTROL, KAMERA AÇILARI VE PNG ÇIKIŞ BARI */}
      <div className="flex flex-wrap justify-between items-center gap-2 bg-slate-900/90 p-2 rounded border border-slate-800 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-amber-400">🎥 3B Simülasyon:</span>
          <div className="flex rounded overflow-hidden border border-slate-700 bg-slate-950 p-0.5">
            <button
              onClick={() => setViewFilter('all')}
              className={`px-2 py-0.5 rounded font-semibold ${
                viewFilter === 'all' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tüm Oda Projektörleri
            </button>
            <button
              onClick={() => setViewFilter('selected')}
              className={`px-2 py-0.5 rounded font-semibold ${
                viewFilter === 'selected' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sadece Seçili Yüzey ({activeSurf?.name})
            </button>
          </div>

          {/* Hazır Kamera Bakış Açıları */}
          <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
            <span className="text-slate-400 text-[10px]">Bakış:</span>
            <button onClick={() => setCameraPreset('iso')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">
              Perspektif
            </button>
            <button onClick={() => setCameraPreset('top')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">
              Üstten (Plan)
            </button>
            <button onClick={() => setCameraPreset('front')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">
              Ön
            </button>
            <button onClick={() => setCameraPreset('left')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">
              Sol
            </button>
            <button onClick={() => setCameraPreset('right')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]">
              Sağ
            </button>
            <button onClick={() => setCameraPreset('inside')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[10px]">
              İzleyici Gözü
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-1 cursor-pointer text-indigo-300 font-semibold">
            <input
              type="checkbox"
              checked={physicalRoom.enabled}
              onChange={e => onUpdatePhysicalRoom(prev => ({ ...prev, enabled: e.target.checked }))}
            />
            <span>🏛️ Fiziksel Oda ({physicalRoom.widthM}×{physicalRoom.lengthM}×{physicalRoom.heightM}m)</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-slate-300">
            <input type="checkbox" checked={showBeams} onChange={e => setShowBeams(e.target.checked)} />
            <span>Işık Konileri</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-slate-300">
            <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
            <span>Ölçü Etiketleri</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-sky-300" title="İndirilen 3B PNG altına teknik özet barı ekler">
            <input type="checkbox" checked={includeHudOnExport} onChange={e => setIncludeHudOnExport(e.target.checked)} />
            <span>PNG Antet</span>
          </label>
          <button
            onClick={exportCurrent3DViewPng}
            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow flex items-center gap-1"
          >
            <span>📸 3B PNG İndir</span>
          </button>
        </div>
      </div>

      {/* 2. İNTERAKTİF İNSAN (İZLEYİCİ) MODELİ SEÇİMİ, EKLEME VE MOUSE SÜRÜKLEME BARI */}
      <div className="flex flex-wrap justify-between items-center gap-2 bg-slate-900/85 px-2.5 py-1.5 rounded border border-emerald-900/70 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 cursor-pointer font-bold text-emerald-400">
            <input type="checkbox" checked={showHuman} onChange={e => setShowHuman(e.target.checked)} />
            <span>🚶 3B İzleyiciler ({humans.length} Kişi):</span>
          </label>

          {/* Sahnedeki İnsanlar Listesi */}
          <div className="flex flex-wrap items-center gap-1">
            {humans.map(h => (
              <button
                key={h.id}
                onClick={() => setSelectedHumanId(h.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                  h.id === selectedHuman?.id
                    ? 'bg-emerald-700 text-white border-emerald-400 shadow'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                }`}
              >
                {h.name} ({h.x}m, {h.z}m)
              </button>
            ))}
          </div>

          {/* Seçili İnsanın Karakter Modelini Değiştir */}
          {selectedHuman && (
            <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
              <span className="text-slate-400 text-[10px]">Model:</span>
              <select
                value={selectedHuman.variant}
                onChange={e => {
                  const v = e.target.value as HumanVariant;
                  setNewVariant(v);
                  changeSelectedHumanVariant(v);
                }}
                className="bg-slate-900 text-emerald-300 font-semibold text-[10.5px] rounded px-1 py-0.5 border border-slate-700"
              >
                {(Object.keys(HUMAN_VARIANT_CATALOG) as HumanVariant[]).map(vKey => (
                  <option key={vKey} value={vKey}>
                    {HUMAN_VARIANT_CATALOG[vKey].label}
                  </option>
                ))}
              </select>

              <button
                onClick={rotateSelectedHuman}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-[10px]"
                title="Seçili insanın bakış yönünü 45° döndür"
              >
                ↻ Yön Çevir
              </button>

              <button
                onClick={snapSelectedHumanToWallViewDist}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold text-[10px]"
                title="Seçili insanı aktif duvarın izleyici mesafesine (viewDistM) hizala"
              >
                🎯 Duvara Hizala ({activeSurf?.viewDistM}m)
              </button>

              {humans.length > 1 && (
                <button
                  onClick={removeSelectedHuman}
                  className="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-800 text-rose-300 text-[10px]"
                  title="Seçili insanı sahneden kaldır"
                >
                  Sil
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-amber-300/90 hidden xl:inline">
            💡 İpucu: İnsanları mouse ile tutup zeminde istediğiniz yere sürükleyebilirsiniz (zeminden aşağı inmez).
          </span>
          <button
            onClick={addHumanActor}
            className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold shadow text-[10.5px]"
          >
            + İnsan Ekle
          </button>
        </div>
      </div>

      {/* 3. SEÇİLİ YÜZEYİN YÜZEY DOLULUK (COVERAGE), PROJEKTÖR YÜKSEKLİĞİ & GÖLGE ANALİZ ŞERİDİ */}
      {activeSurf && coverageStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/80 p-2 rounded border border-sky-900/60 font-mono text-[11px]">
          <div>
            <span className="text-slate-400 block text-[10px]">1. PJ Atım & Montaj Yüksekliği:</span>
            <b className="text-amber-300">
              {activeSurf.singleProjWidthM}m×{activeSurf.singleProjHeightM}m (@D={activeSurf.throwDistM}m · H={coverageStats.projHeight.toFixed(2)}m)
            </b>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px]">2. Yatay Yüzey Doluluk Oranı:</span>
            <b
              className={
                coverageStats.covPctW >= 98 && coverageStats.covPctW <= 108
                  ? 'text-emerald-400'
                  : coverageStats.covPctW < 98
                  ? 'text-rose-400'
                  : 'text-amber-300'
              }
            >
              %{coverageStats.covPctW} ({activeSurf.totalOpticalWidthM}m / {activeSurf.effectiveWidthM}m){' '}
              {coverageStats.diffW < -0.05
                ? `⚠ ${Math.abs(coverageStats.diffW)}m Boşluk!`
                : coverageStats.diffW > 0.25
                ? `⚠ +${coverageStats.diffW}m Taşıyor`
                : '✓ Tam Dolu'}
            </b>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px]">3. Dikey Yükseklik & Kaydırma:</span>
            <b
              className={
                coverageStats.covPctH >= 98 && coverageStats.covPctH <= 108
                  ? 'text-emerald-400'
                  : coverageStats.covPctH < 98
                  ? 'text-rose-400'
                  : 'text-amber-300'
              }
            >
              %{coverageStats.covPctH} | Shift X:{activeSurf.projShiftXM || 0}m · Y:{activeSurf.projShiftYM || 0}m
            </b>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px]">4. Oda Tavanı & Gölge Durumu:</span>
            <b className={coverageStats.hasShadowRisk ? 'text-rose-400' : 'text-indigo-300'}>
              Tavan: {physicalRoom.heightM}m (Duvar: {activeSurf.effectiveHeightM}m){' '}
              {coverageStats.hasShadowRisk ? `| ⚠ ${coverageStats.shadowHeightOnWall}m Gölge!` : '| ✓ Gölge Yok'}
            </b>
          </div>
        </div>
      )}

      {/* 4. 3B WEBGL SAHNESİ */}
      <div
        className={`flex-1 min-h-[480px] w-full rounded border border-slate-800 bg-slate-950 relative overflow-hidden ${
          draggingHumanId ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerUp={handleStopDragHuman}
        onPointerLeave={handleStopDragHuman}
      >
        <Canvas
          camera={{ position: [18, 14, 22], fov: 48, near: 0.1, far: 500 }}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          dpr={[1, 2]}
          onCreated={({ gl, scene, camera }) => {
            glRef.current = gl;
            sceneRef.current = scene;
            cameraRef.current = camera as THREE.PerspectiveCamera;
          }}
        >
          <color attach="background" args={['#070b14']} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[12, 22, 12]} intensity={0.95} />
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2 - 0.01} // Kameranın zeminin altına (y < 0) inmesini engeller!
          />

          <Grid
            args={[70, 70]}
            position={[0, -0.02, 0]}
            cellColor="#1e293b"
            sectionColor="#334155"
            infiniteGrid
            fadeDistance={60}
          />

          {/* MOUSE İLE İNSAN SÜRÜKLEME ZEMİN DÜZLEMİ (y = 0, Zeminden Aşağı İnmez) */}
          {draggingHumanId && (
            <mesh
              position={[0, 0, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              onPointerMove={e => {
                e.stopPropagation();
                const maxX = Math.max(25, sceneData.roomWidthX * 1.2);
                const maxZ = Math.max(25, sceneData.roomLengthZ * 1.2);
                const clampedX = Math.max(-maxX, Math.min(maxX, +e.point.x.toFixed(2)));
                const clampedZ = Math.max(-maxZ, Math.min(maxZ, +e.point.z.toFixed(2)));
                setHumans(prev =>
                  prev.map(h =>
                    h.id === draggingHumanId ? { ...h, x: clampedX, z: clampedZ } : h
                  )
                );
              }}
              onPointerUp={e => {
                e.stopPropagation();
                handleStopDragHuman();
              }}
            >
              <planeGeometry args={[200, 200]} />
              <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
            </mesh>
          )}

          <Suspense fallback={null}>
            {/* FİZİKSEL ODA KABUĞU (Açılıp Kapatılabilir, Duvar Ölçüsünden Bağımsız) */}
            <PhysicalRoomShell3D room={physicalRoom} />

            {sceneData.specialSurf ? (
              <SpecialGeometryScene
                surf={sceneData.specialSurf}
                floorSurf={sceneData.floor}
                humans={showHuman ? humans : []}
                showBeams={showBeams}
                showLabels={showLabels}
                onSelect={onSelect}
              />
            ) : (
              <RoomBoxScene
                surfaces={surfaces}
                selectedId={selectedId}
                viewFilter={viewFilter}
                roomWidthX={sceneData.roomWidthX}
                roomLengthZ={sceneData.roomLengthZ}
                roomHeightY={sceneData.roomHeightY}
                humans={showHuman ? humans : []}
                showBeams={showBeams}
                showLabels={showLabels}
                onSelect={onSelect}
              />
            )}

            {/* SAHNEDEKİ TÜM SÜRÜKLENEBİLİR 3B İNSAN (İZLEYİCİ) MODELLERİ */}
            {showHuman &&
              humans.map(actor => (
                <StylizedHuman3D
                  key={actor.id}
                  actor={actor}
                  isSelected={actor.id === selectedHuman?.id}
                  isDragging={actor.id === draggingHumanId}
                  onSelectActor={setSelectedHumanId}
                  onStartDrag={handleStartDragHuman}
                />
              ))}
          </Suspense>
        </Canvas>

        {/* Sol Alt Renk, Doluluk ve Sürükleme Açıklaması */}
        <div className="absolute bottom-2 left-2 bg-slate-950/90 border border-slate-800 px-2.5 py-1.5 rounded text-[10px] text-slate-300 pointer-events-none flex flex-wrap items-center gap-3">
          <span>🏛️ <b>Mor Çerçeve:</b> Fiziksel Oda Kabuğu</span>
          <span>🟥 <b>Kırmızı Alan:</b> Boş Kalan Duvar</span>
          <span>🟦🟨 <b>Parlak Alan:</b> Projektör Görüntüsü</span>
          <span>🚶 <b>İnsanlar:</b> Mouse ile Tutup Zeminde Sürükleyin</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Standart Kutu / U-Oda (1. Sol Duvar, 2. Ön Duvar, 3. Sağ Duvar, 4. Arka Duvar ve Zemin) 3B Yerleşimi
 */
function RoomBoxScene({
  surfaces,
  selectedId,
  viewFilter,
  roomWidthX,
  roomLengthZ,
  roomHeightY: _roomHeightY,
  humans,
  showBeams,
  showLabels,
  onSelect,
}: {
  surfaces: CalculatedSurface[];
  selectedId: string;
  viewFilter: 'all' | 'selected';
  roomWidthX: number;
  roomLengthZ: number;
  roomHeightY: number;
  humans: HumanActor[];
  showBeams: boolean;
  showLabels: boolean;
  onSelect: (id: string) => void;
}) {
  const walls = surfaces.filter(s => s.type === 'wall');
  const floor = surfaces.find(s => s.type === 'floor');

  const wallPlacements = useMemo(() => {
    return walls.map((w, idx) => {
      const h = w.effectiveHeightM;

      // idx 0: Sol Uzun Duvar (x = -roomWidthX/2, normal +X)
      if (idx === 0) {
        return {
          surf: w,
          center: [-roomWidthX / 2, h / 2, 0] as [number, number, number],
          rot: [0, Math.PI / 2, 0] as [number, number, number],
          normal: [1, 0, 0] as [number, number, number],
          rightDir: [0, 0, -1] as [number, number, number],
          upDir: [0, 1, 0] as [number, number, number],
        };
      }
      // idx 1: Ön Kısa Duvar (z = -roomLengthZ/2, normal +Z)
      if (idx === 1) {
        return {
          surf: w,
          center: [0, h / 2, -roomLengthZ / 2] as [number, number, number],
          rot: [0, 0, 0] as [number, number, number],
          normal: [0, 0, 1] as [number, number, number],
          rightDir: [1, 0, 0] as [number, number, number],
          upDir: [0, 1, 0] as [number, number, number],
        };
      }
      // idx 2: Sağ Uzun Duvar (x = +roomWidthX/2, normal -X)
      if (idx === 2) {
        return {
          surf: w,
          center: [roomWidthX / 2, h / 2, 0] as [number, number, number],
          rot: [0, -Math.PI / 2, 0] as [number, number, number],
          normal: [-1, 0, 0] as [number, number, number],
          rightDir: [0, 0, 1] as [number, number, number],
          upDir: [0, 1, 0] as [number, number, number],
        };
      }
      // idx 3+: Arka Kısa Duvar (z = +roomLengthZ/2, normal -Z)
      return {
        surf: w,
        center: [0, h / 2, roomLengthZ / 2] as [number, number, number],
        rot: [0, Math.PI, 0] as [number, number, number],
        normal: [0, 0, -1] as [number, number, number],
        rightDir: [-1, 0, 0] as [number, number, number],
        upDir: [0, 1, 0] as [number, number, number],
      };
    });
  }, [walls, roomWidthX, roomLengthZ]);

  return (
    <group>
      {/* 1. DUVAR YÜZEYLERİ, DOLULUK KONTROLÜ VE PROJEKTÖRLERİ */}
      {wallPlacements.map((wp, wIdx) => {
        const { surf, center, rot, normal, rightDir, upDir } = wp;
        const isSel = surf.id === selectedId;
        const showThisProjectors = showBeams && (viewFilter === 'all' || isSel);
        const col = PROJ_COLORS[wIdx % PROJ_COLORS.length];

        const singleW = surf.singleProjWidthM;
        const singleH = surf.singleProjHeightM;
        const ovRatioX = surf.projW > 0 ? surf.ovPxX / surf.projW : 0.15;
        const stepW = singleW * (1 - ovRatioX);
        const totalOptW = surf.cols === 1 ? singleW : singleW + (surf.cols - 1) * stepW;
        const totalOptH = surf.rows * singleH;

        const isUnderfilledW = totalOptW < surf.effectiveWidthM - 0.08;
        const isOverfilledW = totalOptW > surf.effectiveWidthM + 0.15;
        const covPctW = Math.round((totalOptW / Math.max(0.1, surf.effectiveWidthM)) * 100);

        const shiftX = surf.projShiftXM || 0;
        const shiftY = surf.projShiftYM || 0;
        const mountHeight =
          surf.projMountHeightM && surf.projMountHeightM > 0
            ? surf.projMountHeightM
            : Math.max(2.2, surf.effectiveHeightM - 0.15);

        const projItems: {
          pos: [number, number, number];
          target: [number, number, number];
          label: string;
        }[] = [];

        if (showThisProjectors) {
          for (let r = 0; r < surf.rows; r++) {
            for (let c = 0; c < surf.cols; c++) {
              const offsetRight =
                (surf.cols === 1 ? 0 : -totalOptW / 2 + singleW / 2 + c * stepW) + shiftX;
              const offsetUp =
                (surf.rows === 1 ? 0 : ((surf.rows - 1) / 2 - r) * (singleH * 0.85)) + shiftY;

              const tx = center[0] + rightDir[0] * offsetRight + upDir[0] * offsetUp;
              const ty = center[1] + rightDir[1] * offsetRight + upDir[1] * offsetUp;
              const tz = center[2] + rightDir[2] * offsetRight + upDir[2] * offsetUp;

              const px = tx + normal[0] * surf.throwDistM;
              const py = Math.max(0.2, mountHeight + (surf.rows > 1 ? offsetUp * 0.3 : 0));
              const pz = tz + normal[2] * surf.throwDistM;

              projItems.push({
                pos: [px, py, pz],
                target: [tx, ty, tz],
                label: `PJ ${c + 1}${surf.rows > 1 ? `.${r + 1}` : ''}`,
              });
            }
          }
        }

        return (
          <group key={surf.id}>
            {/* Duvar Ham Fiziksel Projeksiyon Yüzeyi */}
            <group
              position={center}
              rotation={rot}
              onClick={e => {
                e.stopPropagation();
                onSelect(surf.id);
              }}
            >
              <mesh>
                <planeGeometry args={[surf.effectiveWidthM, surf.effectiveHeightM]} />
                <meshStandardMaterial
                  color={isUnderfilledW ? '#450a0a' : '#0f172a'}
                  transparent
                  opacity={0.78}
                  side={THREE.DoubleSide}
                />
              </mesh>

              {/* Sol ve Sağda Boş Kalan (Karanlık) Duvar Bölgeleri Vurgusu */}
              {isUnderfilledW && (
                <>
                  <mesh position={[-(totalOptW + (surf.effectiveWidthM - totalOptW) / 2) / 2, 0, 0.01]}>
                    <planeGeometry args={[(surf.effectiveWidthM - totalOptW) / 2, surf.effectiveHeightM]} />
                    <meshBasicMaterial color="#dc2626" transparent opacity={0.35} side={THREE.DoubleSide} />
                  </mesh>
                  <mesh position={[(totalOptW + (surf.effectiveWidthM - totalOptW) / 2) / 2, 0, 0.01]}>
                    <planeGeometry args={[(surf.effectiveWidthM - totalOptW) / 2, surf.effectiveHeightM]} />
                    <meshBasicMaterial color="#dc2626" transparent opacity={0.35} side={THREE.DoubleSide} />
                  </mesh>
                  <Text
                    position={[0, -surf.effectiveHeightM / 2 + 0.35, 0.04]}
                    fontSize={0.28}
                    color="#f87171"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.025}
                    outlineColor="#020617"
                  >
                    {`⚠ YÜZEY TAM DOLMUYOR: Projektörler ${totalOptW.toFixed(2)}m açıyor (${(surf.effectiveWidthM - totalOptW).toFixed(2)}m Boşluk Var!)`}
                  </Text>
                </>
              )}

              {/* Eğer Görüntü Duvardan Dışarı Taşıyorsa Uyarı */}
              {isOverfilledW && (
                <Text
                  position={[0, -surf.effectiveHeightM / 2 + 0.35, 0.04]}
                  fontSize={0.26}
                  color="#fbbf24"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.025}
                  outlineColor="#020617"
                >
                  {`⚠ GÖRÜNTÜ DUVARDAN TAŞIYOR: Toplam ${totalOptW.toFixed(2)}m (+${(totalOptW - surf.effectiveWidthM).toFixed(2)}m Fazla)`}
                </Text>
              )}

              {/* Tam Doluyorsa Onay Yazısı */}
              {!isUnderfilledW && !isOverfilledW && (
                <Text
                  position={[0, -surf.effectiveHeightM / 2 + 0.32, 0.04]}
                  fontSize={0.25}
                  color="#4ade80"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.025}
                  outlineColor="#020617"
                >
                  {`✓ YÜZEY TAM DOLU (%${covPctW} Kapsama: ${totalOptW.toFixed(2)}m × ${totalOptH.toFixed(2)}m)`}
                </Text>
              )}

              {/* Duvar Projeksiyon Alanı Sınır Çerçevesi */}
              <Line
                points={[
                  [-surf.effectiveWidthM / 2, -surf.effectiveHeightM / 2, 0.02],
                  [surf.effectiveWidthM / 2, -surf.effectiveHeightM / 2, 0.02],
                  [surf.effectiveWidthM / 2, surf.effectiveHeightM / 2, 0.02],
                  [-surf.effectiveWidthM / 2, surf.effectiveHeightM / 2, 0.02],
                  [-surf.effectiveWidthM / 2, -surf.effectiveHeightM / 2, 0.02],
                ]}
                color={isSel ? '#facc15' : '#94a3b8'}
                lineWidth={isSel ? 3.2 : 1.8}
              />

              {/* Duvar Üstü Bilgi Yazısı */}
              <Text
                position={[0, surf.effectiveHeightM / 2 + 0.42, 0.05]}
                fontSize={0.32}
                color={isSel ? '#facc15' : '#f8fafc'}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.03}
                outlineColor="#020617"
              >
                {`${surf.name} (${surf.effectiveWidthM}m × ${surf.effectiveHeightM}m → ${surf.netW}×${surf.netH}px | Doluluk: %${covPctW})`}
              </Text>
            </group>

            {/* Bu Duvara Ait Projektörler, Duvardaki Parlak Görüntü Dolgusu ve İnsan Gölgeleri */}
            {projItems.map((item, pIdx) => (
              <ProjectorFrustum3D
                key={`proj-${surf.id}-${pIdx}`}
                pos={item.pos}
                targetCenter={item.target}
                upVec={upDir}
                rightVec={rightDir}
                imgW={surf.singleProjWidthM}
                imgH={surf.singleProjHeightM}
                humans={humans}
                throwDist={surf.throwDistM}
                color={col}
                label={item.label}
                detailText={`${surf.singleProjWidthM}m×${surf.singleProjHeightM}m (${surf.distMmPerPx}mm/px)`}
                showLabels={showLabels}
                showSurfaceFill={true}
              />
            ))}
          </group>
        );
      })}

      {/* 2. ZEMİN (FLOOR) YÜZEYİ VE TAVAN PROJEKTÖRLERİ */}
      {floor && (
        <group>
          <mesh
            position={[0, 0.01, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={e => {
              e.stopPropagation();
              onSelect(floor.id);
            }}
          >
            <planeGeometry args={[floor.effectiveHeightM, floor.effectiveWidthM]} />
            <meshStandardMaterial
              color="#0f172a"
              transparent
              opacity={0.8}
              side={THREE.DoubleSide}
            />
          </mesh>

          <Text
            position={[0, 0.08, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.38}
            color="#fde047"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.03}
            outlineColor="#020617"
          >
            {`${floor.name}: ${floor.effectiveWidthM}m × ${floor.effectiveHeightM}m (${floor.netW}×${floor.netH}px · ${floor.avgMmPerPx} mm/px)`}
          </Text>

          {showBeams && (viewFilter === 'all' || floor.id === selectedId) && (() => {
            const items: JSX.Element[] = [];
            const singleW = floor.singleProjWidthM;
            const singleH = floor.singleProjHeightM;
            const stepZ = floor.cols > 1 ? (floor.effectiveWidthM - singleW) / (floor.cols - 1) : 0;
            const stepX = floor.rows > 1 ? (floor.effectiveHeightM - singleH) / (floor.rows - 1) : 0;
            const shiftX = floor.projShiftXM || 0;
            const shiftY = floor.projShiftYM || 0;

            for (let r = 0; r < floor.rows; r++) {
              for (let c = 0; c < floor.cols; c++) {
                const tz = (floor.cols === 1 ? 0 : -floor.effectiveWidthM / 2 + singleW / 2 + c * stepZ) + shiftX;
                const tx = (floor.rows === 1 ? 0 : -floor.effectiveHeightM / 2 + singleH / 2 + r * stepX) + shiftY;

                items.push(
                  <ProjectorFrustum3D
                    key={`floor-pj-${r}-${c}`}
                    pos={[tx, floor.throwDistM, tz]}
                    targetCenter={[tx, 0.02, tz]}
                    upVec={[1, 0, 0]}
                    rightVec={[0, 0, 1]}
                    imgW={singleW}
                    imgH={singleH}
                    humans={[]}
                    throwDist={floor.throwDistM}
                    color="#facc15"
                    label={`Zemin PJ ${c + 1}.${r + 1}`}
                    detailText={`${singleW}m×${singleH}m`}
                    showLabels={showLabels}
                    showSurfaceFill={true}
                  />
                );
              }
            }
            return items;
          })()}
        </group>
      )}
    </group>
  );
}

/**
 * Özel Mimari Geometriler İçin 3B Sahne (360° Silindir, İçbükey Kavis, Kubbe, Küre)
 */
function SpecialGeometryScene({
  surf,
  floorSurf,
  humans,
  showBeams,
  showLabels,
  onSelect,
}: {
  surf: CalculatedSurface;
  floorSurf?: CalculatedSurface;
  humans: HumanActor[];
  showBeams: boolean;
  showLabels: boolean;
  onSelect: (id: string) => void;
}) {
  const r = surf.radiusM;
  const h = surf.heightM;
  const arcAngleRad =
    surf.geometry === 'concave_arc' ? THREE.MathUtils.degToRad(surf.angleDeg) : Math.PI * 2;

  const covPctW = Math.round((surf.totalOpticalWidthM / Math.max(0.1, surf.effectiveWidthM)) * 100);
  const coveredAngleRad = Math.min(
    arcAngleRad,
    arcAngleRad * (surf.totalOpticalWidthM / Math.max(0.1, surf.effectiveWidthM))
  );

  const mountHeight =
    surf.projMountHeightM && surf.projMountHeightM > 0
      ? surf.projMountHeightM
      : Math.max(1.8, h - 0.2);

  return (
    <group>
      {/* 1. KAVİSLİ DUVAR VEYA 360° SİLİNDİR */}
      {(surf.geometry === 'cylinder_360' || surf.geometry === 'concave_arc') && (
        <group>
          <mesh
            position={[0, h / 2, 0]}
            onClick={e => {
              e.stopPropagation();
              onSelect(surf.id);
            }}
          >
            <cylinderGeometry
              args={[
                r,
                r,
                h,
                64,
                1,
                true,
                surf.geometry === 'concave_arc' ? -arcAngleRad / 2 + Math.PI : 0,
                arcAngleRad,
              ]}
            />
            <meshStandardMaterial
              color={covPctW < 98 ? '#7f1d1d' : '#0f172a'}
              transparent
              opacity={0.65}
              side={THREE.DoubleSide}
            />
          </mesh>

          {showBeams && (
            <mesh position={[0, h / 2 + (surf.projShiftYM || 0), 0]}>
              <cylinderGeometry
                args={[
                  r * 0.996,
                  r * 0.996,
                  Math.min(h, surf.rows * surf.singleProjHeightM),
                  64,
                  1,
                  true,
                  surf.geometry === 'concave_arc' ? -coveredAngleRad / 2 + Math.PI : 0,
                  coveredAngleRad,
                ]}
              />
              <meshBasicMaterial
                color={surf.color}
                transparent
                opacity={0.38}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}

          <Text
            position={[0, h + 0.65, 0]}
            fontSize={0.4}
            color="#38bdf8"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.03}
            outlineColor="#020617"
          >
            {`${surf.name} | R=${r}m (Açınım: ${surf.effectiveWidthM}m × ${h}m → Yüzey Doluluk: %${covPctW})`}
          </Text>

          {showBeams && (() => {
            const items: JSX.Element[] = [];
            const startAng = surf.geometry === 'concave_arc' ? -arcAngleRad / 2 + Math.PI : 0;
            const step =
              surf.geometry === 'concave_arc'
                ? arcAngleRad / Math.max(1, surf.cols)
                : (Math.PI * 2) / Math.max(1, surf.cols);

            for (let row = 0; row < surf.rows; row++) {
              const offsetUp =
                (surf.rows === 1 ? 0 : ((surf.rows - 1) / 2 - row) * (surf.singleProjHeightM * 0.85)) +
                (surf.projShiftYM || 0);

              for (let idx = 0; idx < surf.cols; idx++) {
                const theta = startAng + (idx + 0.5) * step + (surf.projShiftXM || 0) / Math.max(1, r);
                const pIdx = row * surf.cols + idx;

                const tx = Math.sin(theta) * r;
                const ty = h / 2 + offsetUp;
                const tz = Math.cos(theta) * r;

                const nx = -Math.sin(theta);
                const nz = -Math.cos(theta);

                const px = tx + nx * surf.throwDistM;
                const py = Math.max(0.5, mountHeight + (surf.rows > 1 ? offsetUp * 0.4 : 0));
                const pz = tz + nz * surf.throwDistM;

                const rx = Math.cos(theta);
                const rz = -Math.sin(theta);

                items.push(
                  <ProjectorFrustum3D
                    key={`cyl-pj-${row}-${idx}`}
                    pos={[px, py, pz]}
                    targetCenter={[tx, ty, tz]}
                    upVec={[0, 1, 0]}
                    rightVec={[rx, 0, rz]}
                    imgW={surf.singleProjWidthM}
                    imgH={surf.singleProjHeightM}
                    humans={humans}
                    throwDist={surf.throwDistM}
                    color={PROJ_COLORS[pIdx % PROJ_COLORS.length]}
                    label={`PJ #${idx + 1}${surf.rows > 1 ? `.${row + 1}` : ''}`}
                    detailText={`${surf.singleProjWidthM}m×${surf.singleProjHeightM}m (${surf.distMmPerPx}mm/px)`}
                    showLabels={showLabels}
                    showSurfaceFill={true}
                  />
                );
              }
            }
            return items;
          })()}
        </group>
      )}

      {/* 2. KUBBE (DOME) VEYA TAM KÜRE (SPHERE) */}
      {(surf.geometry === 'dome' || surf.geometry === 'sphere') && (
        <group>
          <group position={[0, surf.geometry === 'sphere' ? r : 0, 0]}>
            <mesh
              onClick={e => {
                e.stopPropagation();
                onSelect(surf.id);
              }}
            >
              <sphereGeometry
                args={[
                  r,
                  48,
                  32,
                  0,
                  Math.PI * 2,
                  0,
                  surf.geometry === 'dome' ? Math.PI / 2 : Math.PI,
                ]}
              />
              <meshStandardMaterial
                color={covPctW < 95 ? '#7f1d1d' : surf.color}
                transparent
                opacity={0.28}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh>
              <sphereGeometry
                args={[
                  r * 1.002,
                  24,
                  16,
                  0,
                  Math.PI * 2,
                  0,
                  surf.geometry === 'dome' ? Math.PI / 2 : Math.PI,
                ]}
              />
              <meshBasicMaterial color={surf.color} wireframe transparent opacity={0.25} />
            </mesh>

            <Text
              position={[0, r + 0.8, 0]}
              fontSize={0.44}
              color="#c084fc"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.03}
              outlineColor="#020617"
            >
              {`${surf.name} | Çap=${r * 2}m (${surf.netW}×${surf.netH}px · Doluluk: %${covPctW})`}
            </Text>
          </group>

          {showBeams && (() => {
            const items: JSX.Element[] = [];
            const centerY = surf.geometry === 'sphere' ? r : 0;

            for (let row = 0; row < surf.rows; row++) {
              const elevDeg =
                surf.geometry === 'dome'
                  ? surf.rows === 1
                    ? 42
                    : 22 + (row / Math.max(1, surf.rows - 1)) * 45
                  : surf.rows === 1
                  ? 0
                  : -35 + (row / Math.max(1, surf.rows - 1)) * 70;
              const elevRad = THREE.MathUtils.degToRad(elevDeg);

              for (let col = 0; col < surf.cols; col++) {
                const azimRad = (col / Math.max(1, surf.cols)) * Math.PI * 2;
                const pIdx = row * surf.cols + col;

                const dirX = Math.cos(elevRad) * Math.sin(azimRad);
                const dirY = Math.sin(elevRad);
                const dirZ = Math.cos(elevRad) * Math.cos(azimRad);

                const tx = dirX * r;
                const ty = centerY + dirY * r + (surf.projShiftYM || 0);
                const tz = dirZ * r;

                const px = tx - dirX * surf.throwDistM;
                const py =
                  surf.projMountHeightM && surf.projMountHeightM > 0
                    ? surf.projMountHeightM
                    : Math.max(0.6, ty - dirY * surf.throwDistM);
                const pz = tz - dirZ * surf.throwDistM;

                const rx = Math.cos(azimRad);
                const rz = -Math.sin(azimRad);
                const ux = -Math.sin(elevRad) * Math.sin(azimRad);
                const uy = Math.cos(elevRad);
                const uz = -Math.sin(elevRad) * Math.cos(azimRad);

                items.push(
                  <ProjectorFrustum3D
                    key={`dome-sphere-pj-${row}-${col}`}
                    pos={[px, py, pz]}
                    targetCenter={[tx, ty, tz]}
                    upVec={[ux, uy, uz]}
                    rightVec={[rx, 0, rz]}
                    imgW={surf.singleProjWidthM}
                    imgH={surf.singleProjHeightM}
                    humans={humans}
                    throwDist={surf.throwDistM}
                    color={PROJ_COLORS[pIdx % PROJ_COLORS.length]}
                    label={`PJ ${col + 1}${surf.rows > 1 ? `.${row + 1}` : ''}`}
                    detailText={`${surf.singleProjWidthM}m×${surf.singleProjHeightM}m (${surf.distMmPerPx}mm/px)`}
                    showLabels={showLabels}
                    showSurfaceFill={true}
                  />
                );
              }
            }
            return items;
          })()}
        </group>
      )}

      {/* DAİRESEL ZEMİN VARSA */}
      {floorSurf && (
        <group>
          <mesh
            position={[0, 0.02, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={e => {
              e.stopPropagation();
              onSelect(floorSurf.id);
            }}
          >
            <circleGeometry args={[floorSurf.radiusM, 64]} />
            <meshStandardMaterial color="#0f172a" transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>

          <Text
            position={[0, 0.12, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.4}
            color="#fde047"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.03}
            outlineColor="#020617"
          >
            {`${floorSurf.name} (Çap=${floorSurf.radiusM * 2}m → ${floorSurf.netW}×${floorSurf.netH}px)`}
          </Text>

          {showBeams && (() => {
            const items: JSX.Element[] = [];
            const singleW = floorSurf.singleProjWidthM;
            const singleH = floorSurf.singleProjHeightM;
            const diam = floorSurf.radiusM * 2;
            const stepZ = floorSurf.cols > 1 ? (diam - singleW) / (floorSurf.cols - 1) : 0;
            const stepX = floorSurf.rows > 1 ? (diam - singleH) / (floorSurf.rows - 1) : 0;

            for (let rIdx = 0; rIdx < floorSurf.rows; rIdx++) {
              for (let cIdx = 0; cIdx < floorSurf.cols; cIdx++) {
                const tz = floorSurf.cols === 1 ? 0 : -diam / 2 + singleW / 2 + cIdx * stepZ;
                const tx = floorSurf.rows === 1 ? 0 : -diam / 2 + singleH / 2 + rIdx * stepX;

                items.push(
                  <ProjectorFrustum3D
                    key={`circle-floor-pj-${rIdx}-${cIdx}`}
                    pos={[tx, floorSurf.throwDistM, tz]}
                    targetCenter={[tx, 0.03, tz]}
                    upVec={[1, 0, 0]}
                    rightVec={[0, 0, 1]}
                    imgW={singleW}
                    imgH={singleH}
                    humans={[]}
                    throwDist={floorSurf.throwDistM}
                    color="#facc15"
                    label={`Zemin PJ ${cIdx + 1}.${rIdx + 1}`}
                    detailText={`${singleW}m×${singleH}m`}
                    showLabels={showLabels}
                    showSurfaceFill={true}
                  />
                );
              }
            }
            return items;
          })()}
        </group>
      )}
    </group>
  );
}
