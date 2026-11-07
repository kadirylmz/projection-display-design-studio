import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { download } from '../util';
import type { CalculatedSurface } from './ContentPlanner';

interface PlannerRoom3DProps {
  surfaces: CalculatedSurface[];
  selectedId: string;
  onSelect: (id: string) => void;
}

const PROJ_COLORS = ['#38bdf8', '#facc15', '#4ade80', '#f472b6', '#a78bfa', '#fb923c'];

/**
 * Gerçekçi 3B İnsan (İzleyici) Modeli (1.75m boy: Ayakkabı, Bacaklar, Gövde, Omuz, Kollar, Boyun, Baş, Göz Hizası)
 */
function RealisticHuman3D({
  position,
  rotationY = 0,
  label,
}: {
  position: [number, number, number];
  rotationY?: number;
  label?: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Zemindeki Duruş Halkası */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.34, 32]} />
        <meshBasicMaterial color="#10b981" side={THREE.DoubleSide} transparent opacity={0.7} />
      </mesh>

      {/* Sol & Sağ Ayakkabı */}
      <mesh position={[-0.1, 0.05, 0.04]}>
        <boxGeometry args={[0.11, 0.09, 0.24]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} />
      </mesh>
      <mesh position={[0.1, 0.05, 0.04]}>
        <boxGeometry args={[0.11, 0.09, 0.24]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} />
      </mesh>

      {/* Sol & Sağ Bacak (Pantolon) */}
      <mesh position={[-0.1, 0.48, 0]}>
        <cylinderGeometry args={[0.075, 0.06, 0.78, 16]} />
        <meshStandardMaterial color="#1e3a8a" roughness={0.7} />
      </mesh>
      <mesh position={[0.1, 0.48, 0]}>
        <cylinderGeometry args={[0.075, 0.06, 0.78, 16]} />
        <meshStandardMaterial color="#1e3a8a" roughness={0.7} />
      </mesh>

      {/* Kalça / Kemer */}
      <mesh position={[0, 0.89, 0]}>
        <boxGeometry args={[0.34, 0.12, 0.2]} />
        <meshStandardMaterial color="#172554" roughness={0.7} />
      </mesh>

      {/* Gövde / Ceket (Torso) */}
      <mesh position={[0, 1.19, 0]}>
        <boxGeometry args={[0.38, 0.5, 0.22]} />
        <meshStandardMaterial color="#0284c7" roughness={0.5} />
      </mesh>

      {/* Omuzlar */}
      <mesh position={[0, 1.42, 0]}>
        <boxGeometry args={[0.46, 0.09, 0.23]} />
        <meshStandardMaterial color="#0369a1" roughness={0.5} />
      </mesh>

      {/* Sol & Sağ Kol */}
      <mesh position={[-0.25, 1.15, 0]} rotation={[0, 0, 0.08]}>
        <cylinderGeometry args={[0.052, 0.044, 0.54, 14]} />
        <meshStandardMaterial color="#0284c7" roughness={0.5} />
      </mesh>
      <mesh position={[0.25, 1.15, 0]} rotation={[0, 0, -0.08]}>
        <cylinderGeometry args={[0.052, 0.044, 0.54, 14]} />
        <meshStandardMaterial color="#0284c7" roughness={0.5} />
      </mesh>

      {/* Sol & Sağ El */}
      <mesh position={[-0.27, 0.86, 0]}>
        <sphereGeometry args={[0.048, 12, 12]} />
        <meshStandardMaterial color="#fdba74" roughness={0.6} />
      </mesh>
      <mesh position={[0.27, 0.86, 0]}>
        <sphereGeometry args={[0.048, 12, 12]} />
        <meshStandardMaterial color="#fdba74" roughness={0.6} />
      </mesh>

      {/* Boyun */}
      <mesh position={[0, 1.49, 0]}>
        <cylinderGeometry args={[0.055, 0.06, 0.1, 14]} />
        <meshStandardMaterial color="#fdba74" roughness={0.6} />
      </mesh>

      {/* Baş (Kafa) */}
      <mesh position={[0, 1.63, 0]}>
        <sphereGeometry args={[0.115, 20, 20]} />
        <meshStandardMaterial color="#fed7aa" roughness={0.5} />
      </mesh>

      {/* Saç / Üst Kafa */}
      <mesh position={[0, 1.66, -0.015]}>
        <sphereGeometry args={[0.118, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>

      {/* Gözler (Bakış yönü +Z) */}
      <mesh position={[-0.04, 1.64, 0.105]}>
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0.04, 1.64, 0.105]}>
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>

      {/* Baş Üstü Etiket */}
      {label && (
        <Text
          position={[0, 1.92, 0]}
          fontSize={0.23}
          color="#4ade80"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.025}
          outlineColor="#020617"
        >
          {label}
        </Text>
      )}
    </group>
  );
}

/**
 * Tek bir projektör cihazı + 3B Işık Konisi (Frustum) + Duvarda Aydınlanan Gerçek Görüntü Yüzeyi (Quad)
 * + İzleyici Işığın Önündeyse Duvarda Oluşan İnsan Gölgesi (Shadow Occlusion) Simülasyonu!
 */
function ProjectorFrustum3D({
  pos,
  targetCenter,
  upVec,
  rightVec,
  imgW,
  imgH,
  surfW,
  surfH,
  wallCenter,
  humanPos,
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
  surfW?: number;
  surfH?: number;
  wallCenter?: [number, number, number];
  humanPos?: [number, number, number] | null;
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
    shadowData,
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

    // Duvardaki aydınlanan yüzey (Quad) dönüşüm matrisi (Z-fighting önlemek için 0.015m öne)
    const litCenter = c.clone().addScaledVector(normal, 0.018);
    const mPlane = new THREE.Matrix4().makeBasis(r, u, normal).setPosition(litCenter);

    // İZLEYİCİ GÖLGE (SHADOW OCCLUSION) HESABI:
    // İzleyici projektör ile duvar arasında mı ve ışın konisinin içinden geçiyor mu?
    let shadow: {
      matrix: THREE.Matrix4;
      shadowW: number;
      shadowH: number;
      rayStart: [number, number, number];
      rayEnd: [number, number, number];
    } | null = null;

    if (humanPos) {
      const hBase = new THREE.Vector3(humanPos[0], 0, humanPos[2]);
      const hCenter = new THREE.Vector3(humanPos[0], 0.9, humanPos[2]);
      const hHead = new THREE.Vector3(humanPos[0], 1.75, humanPos[2]);

      // Projektörden izleyici başına ve merkezine giden vektörün duvar düzlemiyle kesişimi
      const planeD = normal.dot(c);
      const dirCenter = hCenter.clone().sub(p);
      const denom = normal.dot(dirCenter);

      // Eğer ışın duvara doğru gidiyorsa (denom < -0.01)
      if (denom < -0.001) {
        const tHit = (planeD - normal.dot(p)) / denom;
        // tHit > 1.0 ise izleyici projektör ile duvar arasındadır!
        if (tHit > 1.01 && tHit < 8.0) {
          const hitPt = p.clone().addScaledVector(dirCenter, tHit);
          const rel = hitPt.clone().sub(c);
          const localX = rel.dot(r);
          const localY = rel.dot(u);

          // Gölge bu projektörün duvardaki görüntü alanı içine düşüyor mu?
          if (Math.abs(localX) <= halfW + 0.35 && localY >= -halfH - 0.5 && localY <= halfH + 0.5) {
            // Büyütme faktörü (Magnification = tHit)
            const mag = Math.min(3.5, Math.max(1.05, tHit));
            const sW = 0.46 * mag;

            // Baş ve ayak izdüşümü
            const dirHead = hHead.clone().sub(p);
            const tHead = (planeD - normal.dot(p)) / normal.dot(dirHead);
            const headHit = p.clone().addScaledVector(dirHead, tHead);
            const headLocalY = Math.min(halfH, headHit.clone().sub(c).dot(u));
            const bottomLocalY = -halfH; // Gölge duvarın altından başlar

            const sH = Math.max(0.35, headLocalY - bottomLocalY);
            if (sH > 0.35 && headLocalY > -halfH + 0.2) {
              const shadowCenterY = (headLocalY + bottomLocalY) / 2;
              const shadowWorldPos = c
                .clone()
                .addScaledVector(r, localX)
                .addScaledVector(u, shadowCenterY)
                .addScaledVector(normal, 0.032);

              const sMat = new THREE.Matrix4().makeBasis(r, u, normal).setPosition(shadowWorldPos);
              shadow = {
                matrix: sMat,
                shadowW: sW,
                shadowH: sH,
                rayStart: [hHead.x, hHead.y, hHead.z],
                rayEnd: [
                  c.x + r.x * localX + u.x * headLocalY,
                  c.y + r.y * localX + u.y * headLocalY,
                  c.z + r.z * localX + u.z * headLocalY,
                ],
              };
            }
          }
        }
      }
      void hBase;
    }

    return {
      beamGeo: g,
      corners: pts.map(v => [v.x, v.y, v.z] as [number, number, number]),
      lookQuat: q,
      litPlaneMatrix: mPlane,
      shadowData: shadow,
    };
  }, [pos, targetCenter, upVec, rightVec, imgW, imgH, surfW, surfH, wallCenter, humanPos]);

  const midBeamPos: [number, number, number] = [
    (pos[0] + targetCenter[0]) / 2,
    (pos[1] + targetCenter[1]) / 2 + 0.18,
    (pos[2] + targetCenter[2]) / 2,
  ];

  return (
    <group>
      {/* Projektör Cihaz Gövdesi */}
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

      {/* DUVARDA / YÜZEYDE PROJEKTÖRÜN AYDINLATTIĞI GERÇEK GÖRÜNTÜ DOLGUSU (YÜZEYİ DOLDURUP DOLDURMADIĞINI GÖSTERİR) */}
      {showSurfaceFill && !isCurvedSurface && (
        <group matrixAutoUpdate={false} matrix={litPlaneMatrix}>
          {/* Parlak projeksiyon görüntü yüzeyi */}
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
          {/* İç ızgara (Test Pattern Grid) */}
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

      {/* EĞER İZLEYİCİ IŞIĞIN ÖNÜNDEYSE DUVARDA OLUŞAN GÖLGE (SHADOW OCCLUSION) */}
      {shadowData && (
        <group>
          <group matrixAutoUpdate={false} matrix={shadowData.matrix}>
            {/* Gölge Gövdesi */}
            <mesh position={[0, -shadowData.shadowH * 0.08, 0]}>
              <planeGeometry args={[shadowData.shadowW, shadowData.shadowH * 0.82]} />
              <meshBasicMaterial color="#020617" transparent opacity={0.88} side={THREE.DoubleSide} />
            </mesh>
            {/* Gölge Kafası */}
            <mesh position={[0, shadowData.shadowH * 0.38, 0.002]}>
              <circleGeometry args={[shadowData.shadowW * 0.32, 20]} />
              <meshBasicMaterial color="#020617" transparent opacity={0.92} side={THREE.DoubleSide} />
            </mesh>
            {/* Kırmızı Gölge Uyarı Çerçevesi */}
            <Line
              points={[
                [-shadowData.shadowW / 2, -shadowData.shadowH / 2, 0.005],
                [shadowData.shadowW / 2, -shadowData.shadowH / 2, 0.005],
                [shadowData.shadowW / 2, shadowData.shadowH / 2, 0.005],
                [-shadowData.shadowW / 2, shadowData.shadowH / 2, 0.005],
                [-shadowData.shadowW / 2, -shadowData.shadowH / 2, 0.005],
              ]}
              color="#ef4444"
              lineWidth={2}
            />
            <Text
              position={[0, 0, 0.01]}
              fontSize={0.18}
              color="#f87171"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#020617"
            >
              {`⚠ GÖLGE (${shadowData.shadowH.toFixed(1)}m)`}
            </Text>
          </group>

          {/* İnsanın Başından Duvara Giden Gölge Işını */}
          <Line
            points={[shadowData.rayStart, shadowData.rayEnd]}
            color="#ef4444"
            lineWidth={1.8}
            dashed
            dashSize={0.2}
            gapSize={0.15}
          />
        </group>
      )}

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
            fontSize={0.22}
            color="#f8fafc"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.025}
            outlineColor="#020617"
          >
            {`${label} (D=${throwDist}m)`}
          </Text>

          <Text
            position={midBeamPos}
            fontSize={0.19}
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

export default function PlannerRoom3D({ surfaces, selectedId, onSelect }: PlannerRoom3DProps) {
  const [showBeams, setShowBeams] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showHuman, setShowHuman] = useState(true);
  const [viewFilter, setViewFilter] = useState<'all' | 'selected'>('all');
  const [includeHudOnExport, setIncludeHudOnExport] = useState(true);

  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);

  const activeSurf = surfaces.find(s => s.id === selectedId) || surfaces[0];

  // Seçili Yüzey İçin Doluluk (Coverage) & Gölge Analizi
  const coverageStats = useMemo(() => {
    if (!activeSurf) return null;
    const covPctW = Math.round((activeSurf.totalOpticalWidthM / Math.max(0.1, activeSurf.effectiveWidthM)) * 100);
    const covPctH = Math.round(
      ((activeSurf.rows * activeSurf.singleProjHeightM) / Math.max(0.1, activeSurf.effectiveHeightM)) * 100
    );
    const diffW = +(activeSurf.totalOpticalWidthM - activeSurf.effectiveWidthM).toFixed(2);
    const diffH = +(activeSurf.rows * activeSurf.singleProjHeightM - activeSurf.effectiveHeightM).toFixed(2);

    // Gölge kontrolü: İzleyici duvara projektörden daha yakınsa (viewDistM < throwDistM) ışığın önündedir
    const projHeight = Math.max(2.2, activeSurf.effectiveHeightM - 0.15);
    const humanH = 1.75;
    let hasShadowRisk = false;
    let shadowHeightOnWall = 0;

    if (activeSurf.type === 'wall' && activeSurf.viewDistM < activeSurf.throwDistM) {
      // Projektör yüksekliği (projHeight) üzerinden (throwDistM - viewDistM) mesafede 1.75m insan ışını keser mi?
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
      hasShadowRisk,
      shadowHeightOnWall,
    };
  }, [activeSurf]);

  // Oda / Sahne 3B Geometri ve Projektör Konumlarını Hesapla
  const sceneData = useMemo(() => {
    const walls = surfaces.filter(s => s.type === 'wall');
    const floor = surfaces.find(s => s.type === 'floor');
    const ceiling = surfaces.find(s => s.type === 'ceiling');

    const specialSurf = surfaces.find(
      s => s.geometry === 'cylinder_360' || s.geometry === 'sphere' || s.geometry === 'dome' || s.geometry === 'concave_arc'
    );

    const roomLengthZ = walls[0]?.effectiveWidthM || floor?.effectiveWidthM || 20;
    const roomWidthX = walls[1]?.effectiveWidthM || floor?.effectiveHeightM || 7;
    const roomHeightY = walls[0]?.effectiveHeightM || 4.3;

    return {
      walls,
      floor,
      ceiling,
      specialSurf,
      roomLengthZ,
      roomWidthX,
      roomHeightY,
    };
  }, [surfaces]);

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
      cam.position.set(0, 1.7, sceneData.roomLengthZ * 0.25);
      ctrl.target.set(0, 2.0, -sceneData.roomLengthZ * 0.4);
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
        `PJ Uzaklık: D=${activeSurf.throwDistM}m (TR ${activeSurf.throwRatio}:1 → 1 PJ: ${activeSurf.singleProjWidthM}m×${activeSurf.singleProjHeightM}m)  |  İzleyici: ${activeSurf.viewDistM}m ${
          coverageStats.hasShadowRisk
            ? `⚠ DUVARDA İNSAN GÖLGESİ OLUŞUYOR (${coverageStats.shadowHeightOnWall}m Yükseklik)`
            : '✓ Gölge Yok'
        }`,
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
      {/* ÜST 3B SİMÜLASYON KONTROL, KAMERA AÇILARI VE PNG ÇIKIŞ BARI */}
      <div className="flex flex-wrap justify-between items-center gap-2 bg-slate-900/90 p-2 rounded border border-slate-800 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-amber-400">🎥 3B Projeksiyon Simülasyonu:</span>
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
            <span className="text-slate-400 text-[10px]">Bakış Açısı:</span>
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
          <label className="flex items-center gap-1 cursor-pointer text-slate-300">
            <input type="checkbox" checked={showBeams} onChange={e => setShowBeams(e.target.checked)} />
            <span>Işık Konileri & Doluluk</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-slate-300">
            <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
            <span>Ölçü Etiketleri</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-slate-300">
            <input type="checkbox" checked={showHuman} onChange={e => setShowHuman(e.target.checked)} />
            <span>İnsan & Gölge ({activeSurf?.viewDistM}m)</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-sky-300" title="İndirilen 3B PNG altına teknik özet barı ekler">
            <input type="checkbox" checked={includeHudOnExport} onChange={e => setIncludeHudOnExport(e.target.checked)} />
            <span>PNG Teknik Antet</span>
          </label>
          <button
            onClick={exportCurrent3DViewPng}
            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow flex items-center gap-1"
          >
            <span>📸 Bu 3B Bakış Açısını PNG İndir</span>
          </button>
        </div>
      </div>

      {/* SEÇİLİ YÜZEYİN YÜZEY DOLULUK (COVERAGE) & GÖLGE ANALİZ ŞERİDİ */}
      {activeSurf && coverageStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/80 p-2 rounded border border-sky-900/60 font-mono text-[11px]">
          <div>
            <span className="text-slate-400 block text-[10px]">1. Tek Projektörün Açtığı Alan:</span>
            <b className="text-amber-300">
              {activeSurf.singleProjWidthM}m × {activeSurf.singleProjHeightM}m (@D={activeSurf.throwDistM}m)
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
                ? `⚠ ${Math.abs(coverageStats.diffW)}m Boşluk Var!`
                : coverageStats.diffW > 0.25
                ? `⚠ +${coverageStats.diffW}m Dışarı Taşıyor`
                : '✓ Tam Dolduruyor'}
            </b>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px]">3. Dikey Yükseklik Doluluk Oranı:</span>
            <b
              className={
                coverageStats.covPctH >= 98 && coverageStats.covPctH <= 108
                  ? 'text-emerald-400'
                  : coverageStats.covPctH < 98
                  ? 'text-rose-400'
                  : 'text-amber-300'
              }
            >
              %{coverageStats.covPctH} ({(activeSurf.rows * activeSurf.singleProjHeightM).toFixed(2)}m / {activeSurf.effectiveHeightM}m){' '}
              {coverageStats.diffH < -0.05
                ? `⚠ ${Math.abs(coverageStats.diffH)}m Eksik`
                : coverageStats.diffH > 0.2
                ? `⚠ +${coverageStats.diffH}m Taşıyor`
                : '✓ Tam Dolduruyor'}
            </b>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px]">4. İzleyici Gölge (Occlusion) Durumu:</span>
            <b className={coverageStats.hasShadowRisk ? 'text-rose-400' : 'text-emerald-400'}>
              {coverageStats.hasShadowRisk
                ? `⚠ Duvarda ${coverageStats.shadowHeightOnWall}m İnsan Gölgesi Oluşuyor!`
                : `✓ Gölge Yok (İzleyici ${activeSurf.viewDistM}m'de)`}
            </b>
          </div>
        </div>
      )}

      {/* 3B WEBGL SAHNESİ */}
      <div className="flex-1 min-h-[480px] w-full rounded border border-slate-800 bg-slate-950 relative overflow-hidden">
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
          <ambientLight intensity={0.75} />
          <directionalLight position={[12, 20, 10]} intensity={0.9} />
          <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} />

          <Grid
            args={[60, 60]}
            position={[0, -0.02, 0]}
            cellColor="#1e293b"
            sectionColor="#334155"
            infiniteGrid
            fadeDistance={55}
          />

          <Suspense fallback={null}>
            {sceneData.specialSurf ? (
              <SpecialGeometryScene
                surf={sceneData.specialSurf}
                floorSurf={sceneData.floor}
                showBeams={showBeams}
                showLabels={showLabels}
                showHuman={showHuman}
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
                showBeams={showBeams}
                showLabels={showLabels}
                showHuman={showHuman}
                onSelect={onSelect}
              />
            )}
          </Suspense>
        </Canvas>

        {/* Sol Alt Renk ve Doluluk Açıklaması (Legend) */}
        <div className="absolute bottom-2 left-2 bg-slate-950/90 border border-slate-800 px-2.5 py-1.5 rounded text-[10px] text-slate-300 pointer-events-none flex flex-wrap items-center gap-3">
          <span>🟥 <b>Koyu Kırmızı Alan:</b> Projektörün Dolduramadığı Boş Duvar</span>
          <span>🟦🟨 <b>Parlak Renkli Alan:</b> Projektörlerin Aydınlattığı Görüntü</span>
          <span>⬛🟥 <b>Siyah Silüet:</b> Duvardaki İnsan Gölgesi</span>
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
  showBeams,
  showLabels,
  showHuman,
  onSelect,
}: {
  surfaces: CalculatedSurface[];
  selectedId: string;
  viewFilter: 'all' | 'selected';
  roomWidthX: number;
  roomLengthZ: number;
  roomHeightY: number;
  showBeams: boolean;
  showLabels: boolean;
  showHuman: boolean;
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
          humanRotY: -Math.PI / 2,
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
          humanRotY: Math.PI,
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
          humanRotY: Math.PI / 2,
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
        humanRotY: 0,
      };
    });
  }, [walls, roomWidthX, roomLengthZ]);

  const activePlacement = wallPlacements.find(wp => wp.surf.id === selectedId) || wallPlacements[0];

  // İzleyicinin 3B konumu (Seçili duvardan viewDistM içeride)
  const activeHumanPos: [number, number, number] | null = useMemo(() => {
    if (!showHuman || !activePlacement) return null;
    const { surf, center, normal } = activePlacement;
    return [
      center[0] + normal[0] * surf.viewDistM,
      0,
      center[2] + normal[2] * surf.viewDistM,
    ];
  }, [showHuman, activePlacement]);

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

        const projItems: {
          pos: [number, number, number];
          target: [number, number, number];
          label: string;
        }[] = [];

        if (showThisProjectors) {
          for (let r = 0; r < surf.rows; r++) {
            for (let c = 0; c < surf.cols; c++) {
              const offsetRight =
                surf.cols === 1
                  ? 0
                  : -totalOptW / 2 + singleW / 2 + c * stepW;
              const offsetUp =
                surf.rows === 1
                  ? 0
                  : ((surf.rows - 1) / 2 - r) * (singleH * 0.85);

              const tx = center[0] + rightDir[0] * offsetRight + upDir[0] * offsetUp;
              const ty = center[1] + rightDir[1] * offsetRight + upDir[1] * offsetUp;
              const tz = center[2] + rightDir[2] * offsetRight + upDir[2] * offsetUp;

              const px = tx + normal[0] * surf.throwDistM;
              const py = Math.max(2.2, surf.effectiveHeightM - 0.15) + offsetUp * 0.3;
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
            {/* Duvar Ham Fiziksel Yüzeyi (Eğer projektör doldurmuyorsa koyu kırmızı/bordo görünür) */}
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
                  {/* Sol Boşluk */}
                  <mesh position={[-(totalOptW + (surf.effectiveWidthM - totalOptW) / 2) / 2, 0, 0.01]}>
                    <planeGeometry args={[(surf.effectiveWidthM - totalOptW) / 2, surf.effectiveHeightM]} />
                    <meshBasicMaterial color="#dc2626" transparent opacity={0.35} side={THREE.DoubleSide} />
                  </mesh>
                  {/* Sağ Boşluk */}
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

              {/* Duvar Fiziksel Sınır Çerçevesi */}
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
                position={[0, surf.effectiveHeightM / 2 + 0.48, 0.05]}
                fontSize={0.34}
                color={isSel ? '#facc15' : '#f8fafc'}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.03}
                outlineColor="#020617"
              >
                {`${surf.name} (${surf.effectiveWidthM}m × ${surf.effectiveHeightM}m → ${surf.netW}×${surf.netH}px | Doluluk: %${covPctW})`}
              </Text>
            </group>

            {/* Bu Duvara Ait Projektörler, Duvardaki Parlak Görüntü Dolgusu ve İnsan Gölgesi */}
            {projItems.map((item, pIdx) => (
              <ProjectorFrustum3D
                key={`proj-${surf.id}-${pIdx}`}
                pos={item.pos}
                targetCenter={item.target}
                upVec={upDir}
                rightVec={rightDir}
                imgW={surf.singleProjWidthM}
                imgH={surf.singleProjHeightM}
                surfW={surf.effectiveWidthM}
                surfH={surf.effectiveHeightM}
                wallCenter={center}
                humanPos={isSel ? activeHumanPos : null}
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
            fontSize={0.4}
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

            for (let r = 0; r < floor.rows; r++) {
              for (let c = 0; c < floor.cols; c++) {
                const tz = floor.cols === 1 ? 0 : -floor.effectiveWidthM / 2 + singleW / 2 + c * stepZ;
                const tx = floor.rows === 1 ? 0 : -floor.effectiveHeightM / 2 + singleH / 2 + r * stepX;

                items.push(
                  <ProjectorFrustum3D
                    key={`floor-pj-${r}-${c}`}
                    pos={[tx, floor.throwDistM, tz]}
                    targetCenter={[tx, 0.02, tz]}
                    upVec={[1, 0, 0]}
                    rightVec={[0, 0, 1]}
                    imgW={singleW}
                    imgH={singleH}
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

      {/* 3. GERÇEKÇİ 3B İZLEYİCİ (İNSAN MODELİ) VE GÖZ HİZASI BAKIŞ MESAFESİ ÇİZGİSİ */}
      {showHuman && activePlacement && activeHumanPos && (() => {
        const { surf, center, humanRotY } = activePlacement;
        const wallPt: [number, number, number] = [center[0], 1.64, center[2]];
        const eyePt: [number, number, number] = [activeHumanPos[0], 1.64, activeHumanPos[2]];

        return (
          <group>
            <RealisticHuman3D
              position={activeHumanPos}
              rotationY={humanRotY}
              label={`İzleyici (${surf.viewDistM}m → İdeal ≤${surf.idealMuseumMmPerPx}mm)`}
            />

            {/* Göz Hizasından Duvara Bakış Mesafesi Çizgisi */}
            <Line
              points={[eyePt, wallPt]}
              color="#10b981"
              lineWidth={2.2}
              dashed
              dashSize={0.25}
              gapSize={0.15}
            />
          </group>
        );
      })()}
    </group>
  );
}

/**
 * Özel Mimari Geometriler İçin 3B Sahne (360° Silindir, İçbükey Kavis, Kubbe, Küre)
 */
function SpecialGeometryScene({
  surf,
  floorSurf,
  showBeams,
  showLabels,
  showHuman,
  onSelect,
}: {
  surf: CalculatedSurface;
  floorSurf?: CalculatedSurface;
  showBeams: boolean;
  showLabels: boolean;
  showHuman: boolean;
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

  // Özel geometrilerde izleyici konumu (duvardan viewDistM içeride)
  const humanPos: [number, number, number] = [0, 0, Math.max(0, r - surf.viewDistM)];

  return (
    <group>
      {/* 1. KAVİSLİ DUVAR VEYA 360° SİLİNDİR */}
      {(surf.geometry === 'cylinder_360' || surf.geometry === 'concave_arc') && (
        <group>
          {/* Ham Silindir / Kavis Yüzeyi (Boş kalan kısımlar koyu kırmızı/gri) */}
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

          {/* Projektörlerin Aydınlattığı Kavisli Yüzey Dolgusu */}
          {showBeams && (
            <mesh position={[0, h / 2, 0]}>
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

          {/* Çevresel Projektörler (Yatay cols × Dikey rows) */}
          {showBeams && (() => {
            const items: JSX.Element[] = [];
            const startAng = surf.geometry === 'concave_arc' ? -arcAngleRad / 2 + Math.PI : 0;
            const step =
              surf.geometry === 'concave_arc'
                ? arcAngleRad / Math.max(1, surf.cols)
                : (Math.PI * 2) / Math.max(1, surf.cols);

            for (let row = 0; row < surf.rows; row++) {
              const offsetUp =
                surf.rows === 1
                  ? 0
                  : ((surf.rows - 1) / 2 - row) * (surf.singleProjHeightM * 0.85);

              for (let idx = 0; idx < surf.cols; idx++) {
                const theta = startAng + (idx + 0.5) * step;
                const pIdx = row * surf.cols + idx;

                const tx = Math.sin(theta) * r;
                const ty = h / 2 + offsetUp;
                const tz = Math.cos(theta) * r;

                const nx = -Math.sin(theta);
                const nz = -Math.cos(theta);

                const px = tx + nx * surf.throwDistM;
                const py = Math.max(1.8, h - 0.2 + offsetUp * 0.4);
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
                    humanPos={showHuman && idx === 0 ? humanPos : null}
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

          {/* KUBBE VE KÜRE ÇEVRESEL & MERİDYEN PROJEKTÖRLERİ */}
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
                const ty = centerY + dirY * r;
                const tz = dirZ * r;

                const px = tx - dirX * surf.throwDistM;
                const py = Math.max(0.6, ty - dirY * surf.throwDistM);
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

      {/* GERÇEKÇİ 3B İZLEYİCİ (İNSAN MODELİ) */}
      {showHuman && (
        <RealisticHuman3D
          position={humanPos}
          rotationY={0}
          label={`İzleyici (${surf.viewDistM}m → İdeal ≤${surf.idealMuseumMmPerPx}mm)`}
        />
      )}
    </group>
  );
}
