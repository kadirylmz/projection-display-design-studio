import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  useOpticalDeviceStore,
  OpticalStudioReportSnapshot,
} from '../opticalDeviceStore';
import {
  ProjectorDeviceProfile,
  CameraDeviceProfile,
  ParameterSourceType,
  OffsetReferenceConvention,
  ComplianceStatus,
  ProjectorCalculationMethod,
  LengthUnit,
  SAMPLE_WXGA_4000_DLP_PROJECTOR,
  calculateProjectorLensOptics,
  calculateCameraOpticsFov,
  evaluateOpticalPhysicalCompliance,
  formatLengthWithUnit,
  SharedRoomPlacementInput,
} from '../engine/opticalDeviceEngine';
import { CATALOG_PROJECTORS, CATALOG_LENSES } from '../data/projectorCatalog';
import { deviceProfileApi } from '../api';

type StudioTab = 'LIBRARY' | 'PROJECTOR_OPTICS' | 'CAMERA_OPTICS' | 'SHARED_3D_COMPLIANCE';

const SOURCE_LABELS: Record<ParameterSourceType, { label: string; badgeBg: string; badgeText: string }> = {
  MANUFACTURER_SPEC: { label: 'Manufacturer Spec (Üretici Katalog)', badgeBg: '#064e3b', badgeText: '#6ee7b7' },
  USER_ENTERED: { label: 'User Entered (Kullanıcı Girişi)', badgeBg: '#1e3a8a', badgeText: '#93c5fd' },
  FIELD_MEASURED: { label: 'Field Measured (Saha Ölçümü)', badgeBg: '#4c1d95', badgeText: '#c4b5fd' },
  ESTIMATED: { label: 'Estimated (Mühendislik Tahmini)', badgeBg: '#78350f', badgeText: '#fcd34d' },
  UNKNOWN: { label: 'Unknown (Bilinmiyor / Null)', badgeBg: '#334155', badgeText: '#cbd5e1' },
};

const STATUS_BADGE: Record<ComplianceStatus, { bg: string; border: string; text: string; label: string }> = {
  PASS: { bg: '#064e3b', border: '#10b981', text: '#6ee7b7', label: 'PASS (UYGUN)' },
  WARNING: { bg: '#78350f', border: '#f59e0b', text: '#fcd34d', label: 'WARNING (UYARI)' },
  FAIL: { bg: '#7f1d1d', border: '#ef4444', text: '#fca5a5', label: 'FAIL (UYGUNSUZ)' },
  UNKNOWN: { bg: '#1e293b', border: '#64748b', text: '#cbd5e1', label: 'UNKNOWN (VERİ EKSİK)' },
};

function parseNullableNumber(val: string): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function fmtVal(val: number | null | undefined, digits = 3, suffix = ''): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'UNKNOWN';
  return `${val.toFixed(digits)}${suffix ? ` ${suffix}` : ''}`;
}

// ============================================================================
// 3D ORTAK MEKAN, PROJEKTÖR VE KAMERA FRUSTUM SAHNESİ
// ============================================================================
interface Shared3DSceneProps {
  input: SharedRoomPlacementInput;
  projImageW: number;
  projImageH: number;
  projImageBottomY: number;
  camCoverageW: number;
  camCoverageH: number;
  onDragDevice?: (which: 'PROJECTOR' | 'CAMERA' | 'OBSTACLE', newPos: [number, number, number]) => void;
}

function SharedOpticalRoom3DScene({
  input,
  projImageW,
  projImageH,
  projImageBottomY,
  camCoverageW,
  camCoverageH,
  onDragDevice,
}: Shared3DSceneProps) {
  const {
    roomWidthM,
    roomLengthM,
    roomHeightM,
    surfaceWidthM,
    surfaceHeightM,
    surfaceBottomFromFloorM,
    projectorProfile,
    projectorPosM,
    projectorYawDeg,
    cameraProfile,
    cameraPosM,
    cameraYawDeg,
    cameraPitchDeg,
    obstacle,
  } = input;

  const [dragging, setDragging] = useState<'PROJECTOR' | 'CAMERA' | 'OBSTACLE' | null>(null);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const pjChassisW = (projectorProfile.mechanical.widthMm ?? 380) / 1000;
  const pjChassisH = (projectorProfile.mechanical.heightMm ?? 160) / 1000;
  const pjChassisD = (projectorProfile.mechanical.depthMm ?? 320) / 1000;

  const camChassisW = (cameraProfile.mechanical.widthMm ?? 150) / 1000;
  const camChassisH = (cameraProfile.mechanical.heightMm ?? 140) / 1000;
  const camChassisD = (cameraProfile.mechanical.depthMm ?? 160) / 1000;

  const surfTopY = surfaceBottomFromFloorM + surfaceHeightM;

  // Projektör görüntü köşeleri (Z = 0.012 m)
  const pjCenterX = projectorPosM[0] + Math.tan((projectorYawDeg * Math.PI) / 180) * projectorPosM[2];
  const pjLeftX = pjCenterX - projImageW / 2;
  const pjRightX = pjCenterX + projImageW / 2;
  const pjBotY = projImageBottomY;
  const pjTopY = projImageBottomY + projImageH;

  const pjCorners: [number, number, number][] = [
    [pjLeftX, pjBotY, 0.012],
    [pjRightX, pjBotY, 0.012],
    [pjRightX, pjTopY, 0.012],
    [pjLeftX, pjTopY, 0.012],
  ];

  // Kamera FOV hedef düzlem köşeleri (Z = 0.018 m)
  const camCenterX = cameraPosM[0] + Math.tan((cameraYawDeg * Math.PI) / 180) * cameraPosM[2];
  const camCenterY = cameraPosM[1] + Math.tan((cameraPitchDeg * Math.PI) / 180) * cameraPosM[2];
  const camLeftX = camCenterX - camCoverageW / 2;
  const camRightX = camCenterX + camCoverageW / 2;
  const camBotY = camCenterY - camCoverageH / 2;
  const camTopY = camCenterY + camCoverageH / 2;

  const camCorners: [number, number, number][] = [
    [camLeftX, camBotY, 0.018],
    [camRightX, camBotY, 0.018],
    [camRightX, camTopY, 0.018],
    [camLeftX, camTopY, 0.018],
  ];

  const pjExceedsWall =
    Math.abs(pjLeftX) > roomWidthM / 2 ||
    Math.abs(pjRightX) > roomWidthM / 2 ||
    pjBotY < 0 ||
    pjTopY > roomHeightM;

  const handleFloorMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging || !onDragDevice) return;
    e.stopPropagation();
    const pt = new THREE.Vector3();
    if (e.ray.intersectPlane(floorPlane, pt)) {
      const clampedX = Math.max(-roomWidthM / 2 + 0.25, Math.min(roomWidthM / 2 - 0.25, Number(pt.x.toFixed(2))));
      const clampedZ = Math.max(0.5, Math.min(roomLengthM - 0.25, Number(pt.z.toFixed(2))));
      if (dragging === 'PROJECTOR') {
        onDragDevice('PROJECTOR', [clampedX, projectorPosM[1], clampedZ]);
      } else if (dragging === 'CAMERA') {
        onDragDevice('CAMERA', [clampedX, cameraPosM[1], clampedZ]);
      } else if (dragging === 'OBSTACLE' && obstacle) {
        onDragDevice('OBSTACLE', [clampedX, 0, clampedZ]);
      }
    }
  };

  return (
    <group onPointerMove={handleFloorMove} onPointerUp={() => setDragging(null)}>
      <ambientLight intensity={0.65} />
      <directionalLight position={[4, 8, 6]} intensity={0.9} />

      {/* Zemin ve Grid */}
      <mesh position={[0, 0, roomLengthM / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomWidthM, roomLengthM]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
      <gridHelper
        args={[Math.max(roomWidthM, roomLengthM), Math.round(Math.max(roomWidthM, roomLengthM) * 2), '#1e293b', '#1e293b']}
        position={[0, 0.002, roomLengthM / 2]}
      />

      {/* Karşı Projeksiyon Duvarı (Z = 0) */}
      <mesh position={[0, roomHeightM / 2, 0]}>
        <planeGeometry args={[roomWidthM, roomHeightM]} />
        <meshStandardMaterial color="#1e293b" side={THREE.DoubleSide} transparent opacity={0.82} />
      </mesh>

      {/* Oda Yan ve Üst Sınır Çizgileri */}
      <Line
        points={[
          [-roomWidthM / 2, 0, 0],
          [roomWidthM / 2, 0, 0],
          [roomWidthM / 2, roomHeightM, 0],
          [-roomWidthM / 2, roomHeightM, 0],
          [-roomWidthM / 2, 0, 0],
        ]}
        color="#475569"
        lineWidth={1.5}
      />

      {/* Hedef Projeksiyon Perdesi / Yüzeyi */}
      <mesh position={[0, surfaceBottomFromFloorM + surfaceHeightM / 2, 0.006]}>
        <planeGeometry args={[surfaceWidthM, surfaceHeightM]} />
        <meshStandardMaterial color="#0f172a" emissive="#1e293b" emissiveIntensity={0.4} />
      </mesh>
      <Line
        points={[
          [-surfaceWidthM / 2, surfaceBottomFromFloorM, 0.009],
          [surfaceWidthM / 2, surfaceBottomFromFloorM, 0.009],
          [surfaceWidthM / 2, surfTopY, 0.009],
          [-surfaceWidthM / 2, surfTopY, 0.009],
          [-surfaceWidthM / 2, surfaceBottomFromFloorM, 0.009],
        ]}
        color="#94a3b8"
        lineWidth={2}
      />

      {/* Projektör Aktif Görüntü İzi (Footprint) */}
      <mesh position={[pjCenterX, (pjBotY + pjTopY) / 2, 0.012]}>
        <planeGeometry args={[Math.max(0.1, projImageW), Math.max(0.1, projImageH)]} />
        <meshBasicMaterial
          color={pjExceedsWall ? '#ef4444' : '#38bdf8'}
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Line points={[...pjCorners, pjCorners[0]]} color={pjExceedsWall ? '#ef4444' : '#38bdf8'} lineWidth={2.5} />

      {/* Kamera FOV Görüş Alanı İzi */}
      <Line points={[...camCorners, camCorners[0]]} color="#10b981" lineWidth={2} />

      {/* PROJEKTÖR CİHAZI */}
      <group position={projectorPosM}>
        <Line points={[[0, 0, 0], [0, Math.max(0.05, roomHeightM - projectorPosM[1]), 0]]} color="#64748b" lineWidth={2} />
        <mesh
          onPointerDown={e => {
            e.stopPropagation();
            setDragging('PROJECTOR');
          }}
        >
          <boxGeometry args={[pjChassisW, pjChassisH, pjChassisD]} />
          <meshStandardMaterial color="#0284c7" metalness={0.4} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, -pjChassisD / 2 - 0.02]}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
        <Html position={[0, pjChassisH / 2 + 0.16, 0]} center>
          <div
            style={{
              background: 'rgba(2,132,199,0.92)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            📽️ PJ ({projectorPosM[0].toFixed(2)}, {projectorPosM[1].toFixed(2)}, {projectorPosM[2].toFixed(2)}m)
          </div>
        </Html>
      </group>

      {pjCorners.map((c, idx) => (
        <Line key={`pj-ray-${idx}`} points={[projectorPosM, c]} color="#38bdf8" lineWidth={1.3} transparent opacity={0.65} />
      ))}
      <Line points={[projectorPosM, [pjCenterX, projectorPosM[1], 0.012]]} color="#fbbf24" lineWidth={1.5} />

      {/* KAMERA CİHAZI */}
      <group position={cameraPosM}>
        <mesh
          onPointerDown={e => {
            e.stopPropagation();
            setDragging('CAMERA');
          }}
        >
          <boxGeometry args={[camChassisW, camChassisH, camChassisD]} />
          <meshStandardMaterial color="#059669" metalness={0.4} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, -camChassisD / 2 - 0.02]}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshBasicMaterial color="#34d399" />
        </mesh>
        <Html position={[0, camChassisH / 2 + 0.16, 0]} center>
          <div
            style={{
              background: 'rgba(5,150,105,0.92)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            📷 CAM ({cameraPosM[0].toFixed(2)}, {cameraPosM[1].toFixed(2)}, {cameraPosM[2].toFixed(2)}m)
          </div>
        </Html>
      </group>

      {camCorners.map((c, idx) => (
        <Line key={`cam-ray-${idx}`} points={[cameraPosM, c]} color="#10b981" lineWidth={1.2} transparent opacity={0.65} />
      ))}
      <Line points={[cameraPosM, [camCenterX, camCenterY, 0.018]]} color="#34d399" lineWidth={1.5} />

      {/* ODADAKİ ENGEL / İNSAN */}
      {obstacle && obstacle.enabled && (
        <group
          position={[obstacle.xM, 0, obstacle.zFromWallM]}
          onPointerDown={e => {
            e.stopPropagation();
            setDragging('OBSTACLE');
          }}
        >
          <mesh position={[0, obstacle.heightM * 0.42, 0]}>
            <cylinderGeometry args={[obstacle.widthM * 0.34, obstacle.widthM * 0.28, obstacle.heightM * 0.84, 16]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.5} />
          </mesh>
          <mesh position={[0, obstacle.heightM * 0.91, 0]}>
            <sphereGeometry args={[obstacle.heightM * 0.09, 16, 16]} />
            <meshStandardMaterial color="#fbbf24" />
          </mesh>
          <Html position={[0, obstacle.heightM + 0.15, 0]} center>
            <div
              style={{
                background: 'rgba(245,158,11,0.92)',
                color: '#0f172a',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              🧍 {obstacle.name} (Z={obstacle.zFromWallM.toFixed(2)}m)
            </div>
          </Html>
        </group>
      )}

      <OrbitControls
        target={[0, roomHeightM * 0.42, Math.max(1.5, Math.max(projectorPosM[2], cameraPosM[2]) * 0.48)]}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enabled={!dragging}
      />
    </group>
  );
}

// ============================================================================
// ANA MODÜL: OPTICAL DEVICE STUDIO
// ============================================================================
export function OpticalDeviceStudio() {
  const {
    projectors,
    cameras,
    activeProjectorId,
    activeCameraId,
    setActiveProjectorId,
    setActiveCameraId,
    upsertProjectorProfile,
    upsertCameraProfile,
    duplicateProjectorProfile,
    duplicateCameraProfile,
    deleteProjectorProfile,
    deleteCameraProfile,
    importFromCatalog,
    exportLibraryJson,
    importLibraryJson,
    setLatestStudioReport,
  } = useOpticalDeviceStore();

  const [activeTab, setActiveTab] = useState<StudioTab>('PROJECTOR_OPTICS');
  const [librarySubTab, setLibrarySubTab] = useState<'PROJECTOR' | 'CAMERA'>('PROJECTOR');
  const [unit, setUnit] = useState<LengthUnit>('m');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [selectedCatalogProjId, setSelectedCatalogProjId] = useState<string>(CATALOG_PROJECTORS[0]?.id ?? '');
  const [selectedCatalogLensId, setSelectedCatalogLensId] = useState<string>('');

  const activeProjector: ProjectorDeviceProfile = useMemo(
    () => projectors.find(p => p.id === activeProjectorId) ?? projectors[0] ?? SAMPLE_WXGA_4000_DLP_PROJECTOR,
    [projectors, activeProjectorId]
  );

  const activeCamera: CameraDeviceProfile = useMemo(
    () => cameras.find(c => c.id === activeCameraId) ?? cameras[0],
    [cameras, activeCameraId]
  );

  // ---------------- Projektör Hesaplama Motoru Girdileri ----------------
  const [projCalcMethod, setProjCalcMethod] = useState<ProjectorCalculationMethod>('DIST_TO_SIZE');
  const [throwDistM, setThrowDistM] = useState<number>(5.0);
  const [targetWidthM, setTargetWidthM] = useState<number>(3.0);
  const [targetHeightM, setTargetHeightM] = useState<number>(1.875);
  const [selectedTR, setSelectedTR] = useState<number | null>(null);
  const [reqVShiftPct, setReqVShiftPct] = useState<number>(0);
  const [reqHShiftPct, setReqHShiftPct] = useState<number>(0);
  const [reqVKeystoneDeg, setReqVKeystoneDeg] = useState<number>(0);
  const [reqHKeystoneDeg, setReqHKeystoneDeg] = useState<number>(0);

  // ---------------- Kamera FOV Hesaplama Motoru Girdileri ----------------
  const [camTargetDistM, setCamTargetDistM] = useState<number>(5.0);
  const [selectedFocalMm, setSelectedFocalMm] = useState<number | null>(null);
  const [digitalZoomFactor, setDigitalZoomFactor] = useState<number>(1.0);

  // ---------------- Ortak 3B/2B Mekan ve Fiziksel Uygunluk Girdileri ----------------
  const [roomWidthM, setRoomWidthM] = useState<number>(8.0);
  const [roomLengthM, setRoomLengthM] = useState<number>(9.0);
  const [roomHeightM, setRoomHeightM] = useState<number>(3.6);

  const [surfWidthM, setSurfWidthM] = useState<number>(3.2);
  const [surfHeightM, setSurfHeightM] = useState<number>(2.0);
  const [surfBottomM, setSurfBottomM] = useState<number>(0.85);

  const [pjPos, setPjPos] = useState<[number, number, number]>([0, 0.85, 5.0]);
  const [pjYawDeg, setPjYawDeg] = useState<number>(0);
  const [pjPitchDeg, setPjPitchDeg] = useState<number>(0);

  const [camPos, setCamPos] = useState<[number, number, number]>([0.6, 1.85, 5.0]);
  const [camYawDeg, setCamYawDeg] = useState<number>(-6);
  const [camPitchDeg, setCamPitchDeg] = useState<number>(0);

  const [obsEnabled, setObsEnabled] = useState<boolean>(true);
  const [obsName, setObsName] = useState<string>('İzleyici / Konuşmacı');
  const [obsPosX, setObsPosX] = useState<number>(1.4);
  const [obsPosZ, setObsPosZ] = useState<number>(2.8);
  const [obsWidthM, setObsWidthM] = useState<number>(0.55);
  const [obsHeightM, setObsHeightM] = useState<number>(1.75);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const studioGlRef = useRef<THREE.WebGLRenderer | null>(null);
  const studioSceneRef = useRef<THREE.Scene | null>(null);
  const studioCameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Rapora eklenen çoklu açı görünümleri ve pafta seçimleri
  const [studioCapturedViews, setStudioCapturedViews] = useState<
    Array<{ id: string; angle: 'iso' | 'top' | 'bottom' | 'side' | 'left' | 'front' | 'custom'; label: string; dataUrl: string; capturedAt: string }>
  >(() => {
    try {
      const raw = localStorage.getItem('agy_optical_studio_report_v1');
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.capturedViews)) return p.capturedViews;
      }
    } catch {
      /* ignore */
    }
    return [];
  });

  const [studioEnabledPaftas, setStudioEnabledPaftas] = useState<{
    iso3d: boolean;
    topPlan: boolean;
    bottomPlan: boolean;
    sideSection: boolean;
    frontElevation: boolean;
  }>({ iso3d: true, topPlan: true, bottomPlan: true, sideSection: true, frontElevation: true });

  const captureStudioSnapshot = (): string | undefined => {
    try {
      if (studioGlRef.current && studioSceneRef.current && studioCameraRef.current) {
        studioGlRef.current.render(studioSceneRef.current, studioCameraRef.current);
        return studioGlRef.current.domElement.toDataURL('image/png');
      }
    } catch {
      /* ignore */
    }
    return undefined;
  };

  const setStudioCameraPreset = (preset: 'iso' | 'top' | 'bottom' | 'side' | 'left' | 'front' | 'fit') => {
    const cam = studioCameraRef.current;
    if (!cam) return;
    const zMid = Math.max(1.5, Math.max(pjPos[2], camPos[2]) * 0.48);
    const targetY = roomHeightM * 0.42;
    cam.fov = 36;
    if (preset === 'iso' || preset === 'fit') {
      cam.position.set(Math.max(3.6, roomWidthM * 0.55), Math.max(2.8, roomHeightM * 0.85), Math.max(5.5, zMid * 2.1));
    } else if (preset === 'side') {
      cam.position.set(Math.max(5.2, roomWidthM * 0.85), targetY, zMid);
    } else if (preset === 'left') {
      cam.position.set(-Math.max(5.2, roomWidthM * 0.85), targetY, zMid);
    } else if (preset === 'front') {
      cam.position.set(0, targetY, Math.max(4.5, zMid * 1.8));
    } else if (preset === 'top') {
      cam.position.set(0, Math.max(7.2, roomLengthM * 1.05), zMid);
    } else if (preset === 'bottom') {
      cam.position.set(0, -Math.max(5.5, roomLengthM * 0.8), zMid);
    }
    cam.lookAt(0, targetY, zMid);
    cam.updateProjectionMatrix();
  };

  const addStudioViewToReport = (angle: 'iso' | 'top' | 'bottom' | 'side' | 'left' | 'front', label: string) => {
    setStudioCameraPreset(angle);
    setTimeout(() => {
      const snap = captureStudioSnapshot();
      if (!snap) return;
      const next = [
        ...studioCapturedViews.filter(v => v.angle !== angle),
        { id: `opt-view-${angle}-${Date.now()}`, angle, label, dataUrl: snap, capturedAt: new Date().toISOString() },
      ];
      setStudioCapturedViews(next);
      showToast(`"${label}" başarıyla rapora eklendi.`);
    }, 130);
  };

  const removeStudioView = (id: string) => {
    setStudioCapturedViews(prev => prev.filter(v => v.id !== id));
    showToast('Görünüm rapordan kaldırıldı.');
  };

  // ---------------- Merkezi Hesaplama Sonuçları (Single Source of Truth) ----------------
  const projectorResult = useMemo(
    () =>
      calculateProjectorLensOptics({
        profile: activeProjector,
        method: projCalcMethod,
        throwDistanceM: throwDistM,
        targetImageWidthM: targetWidthM,
        targetImageHeightM: targetHeightM,
        selectedThrowRatio: selectedTR,
        projectorPositionM: pjPos,
        requestedVerticalShiftPct: reqVShiftPct,
        requestedHorizontalShiftPct: reqHShiftPct,
        requestedVerticalKeystoneDeg: reqVKeystoneDeg,
        requestedHorizontalKeystoneDeg: reqHKeystoneDeg,
      }),
    [
      activeProjector,
      projCalcMethod,
      throwDistM,
      targetWidthM,
      targetHeightM,
      selectedTR,
      pjPos,
      reqVShiftPct,
      reqHShiftPct,
      reqVKeystoneDeg,
      reqHKeystoneDeg,
    ]
  );

  const cameraResult = useMemo(
    () =>
      calculateCameraOpticsFov({
        profile: activeCamera,
        targetDistanceM: camTargetDistM,
        activeFocalLengthMm: selectedFocalMm,
        digitalZoomOverride: digitalZoomFactor,
      }),
    [activeCamera, camTargetDistM, selectedFocalMm, digitalZoomFactor]
  );

  const complianceInput: SharedRoomPlacementInput = useMemo(
    () => ({
      roomWidthM,
      roomLengthM,
      roomHeightM,
      surfaceWidthM: surfWidthM,
      surfaceHeightM: surfHeightM,
      surfaceBottomFromFloorM: surfBottomM,
      projectorProfile: activeProjector,
      projectorPosM: pjPos,
      projectorYawDeg: pjYawDeg,
      projectorPitchDeg: pjPitchDeg,
      projectorCalc: projectorResult,
      cameraProfile: activeCamera,
      cameraPosM: camPos,
      cameraYawDeg: camYawDeg,
      cameraPitchDeg: camPitchDeg,
      cameraCalc: cameraResult,
      obstacle: {
        enabled: obsEnabled,
        name: obsName,
        xM: obsPosX,
        zFromWallM: obsPosZ,
        widthM: obsWidthM,
        heightM: obsHeightM,
      },
    }),
    [
      roomWidthM,
      roomLengthM,
      roomHeightM,
      surfWidthM,
      surfHeightM,
      surfBottomM,
      activeProjector,
      pjPos,
      pjYawDeg,
      pjPitchDeg,
      projectorResult,
      activeCamera,
      camPos,
      camYawDeg,
      camPitchDeg,
      cameraResult,
      obsEnabled,
      obsName,
      obsPosX,
      obsPosZ,
      obsWidthM,
      obsHeightM,
    ]
  );

  const complianceReport = useMemo(
    () => evaluateOpticalPhysicalCompliance(complianceInput),
    [complianceInput]
  );

  // Her hesaplama güncellendiğinde merkezi rapor store'unu da senkron tut
  useEffect(() => {
    const snapshot: OpticalStudioReportSnapshot = {
      updatedAt: new Date().toISOString(),
      projectorProfile: activeProjector,
      cameraProfile: activeCamera,
      projectorCalc: projectorResult,
      cameraCalc: cameraResult,
      compliance: complianceReport,
      room: {
        widthM: roomWidthM,
        lengthM: roomLengthM,
        heightM: roomHeightM,
        surfaceWidthM: surfWidthM,
        surfaceHeightM: surfHeightM,
        surfaceBottomFromFloorM: surfBottomM,
      },
      projectorPosM: pjPos,
      projectorAnglesDeg: [pjPitchDeg, pjYawDeg, 0],
      cameraPosM: camPos,
      cameraAnglesDeg: [camPitchDeg, camYawDeg, 0],
      snapshot3dDataUrl: studioCapturedViews[0]?.dataUrl || captureStudioSnapshot(),
      capturedViews: studioCapturedViews,
      enabledPaftas: studioEnabledPaftas,
    };
    setLatestStudioReport(snapshot);
  }, [
    activeProjector,
    activeCamera,
    projectorResult,
    cameraResult,
    complianceReport,
    roomWidthM,
    roomLengthM,
    roomHeightM,
    surfWidthM,
    surfHeightM,
    surfBottomM,
    pjPos,
    pjPitchDeg,
    pjYawDeg,
    camPos,
    camPitchDeg,
    camYawDeg,
    studioCapturedViews,
    studioEnabledPaftas,
    setLatestStudioReport,
  ]);

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Katalogdan profil oluşturma
  const handleImportFromCatalog = () => {
    if (!selectedCatalogProjId) {
      showToast('Lütfen önce katalog listesinden bir projektör seçin.');
      return;
    }
    const created = importFromCatalog(selectedCatalogProjId, selectedCatalogLensId || undefined);
    if (created) {
      showToast(`"${created.brand} ${created.model}" katalogdan optik cihaz kütüphanesine aktarıldı.`);
    }
  };

  // Yeni manuel projektör oluşturma
  const handleCreateManualProjector = () => {
    const uid = `pj-manual-${Date.now()}`;
    const newProfile: ProjectorDeviceProfile = {
      ...structuredClone(SAMPLE_WXGA_4000_DLP_PROJECTOR),
      id: uid,
      brand: 'Yeni Marka',
      model: 'Manuel Projektör Modeli',
      manufacturer: 'Kullanıcı Tanımlı',
      dataSource: 'USER_ENTERED',
      catalogUrl: null,
      entryDate: new Date().toISOString().slice(0, 10),
      verificationStatus: 'USER_DEFINED',
      notes: 'Kullanıcı tarafından manuel oluşturulan projektör profili.',
    };
    upsertProjectorProfile(newProfile);
    showToast('Yeni manuel projektör profili oluşturuldu.');
  };

  // Yeni manuel kamera oluşturma
  const handleCreateManualCamera = () => {
    const uid = `cam-manual-${Date.now()}`;
    const newCam: CameraDeviceProfile = {
      ...structuredClone(activeCamera),
      id: uid,
      brand: 'Yeni Kamera Markası',
      model: 'Manuel Kamera Modeli',
      manufacturer: 'Kullanıcı Tanımlı',
      dataSource: 'USER_ENTERED',
      catalogUrl: null,
      entryDate: new Date().toISOString().slice(0, 10),
      verificationStatus: 'USER_DEFINED',
      notes: 'Kullanıcı tarafından manuel oluşturulan kamera profili.',
    };
    upsertCameraProfile(newCam);
    showToast('Yeni manuel kamera profili oluşturuldu.');
  };

  // Backend DB'ye kaydetme
  const handleSaveProfileToBackend = async () => {
    try {
      if (librarySubTab === 'PROJECTOR') {
        await deviceProfileApi.upsert({
          profile_uid: activeProjector.id,
          category: 'PROJECTOR',
          brand: activeProjector.brand,
          model: activeProjector.model,
          manufacturer: activeProjector.manufacturer,
          data_source: activeProjector.dataSource,
          catalog_url: activeProjector.catalogUrl,
          entry_date: activeProjector.entryDate,
          verification_status: activeProjector.verificationStatus,
          profile_data: activeProjector as unknown as Record<string, unknown>,
          provenance: activeProjector.fieldSources as unknown as Record<string, unknown>,
        });
        showToast(`"${activeProjector.brand} ${activeProjector.model}" veritabanına kaydedildi.`);
      } else {
        await deviceProfileApi.upsert({
          profile_uid: activeCamera.id,
          category: 'CAMERA',
          brand: activeCamera.brand,
          model: activeCamera.model,
          manufacturer: activeCamera.manufacturer,
          data_source: activeCamera.dataSource,
          catalog_url: activeCamera.catalogUrl,
          entry_date: activeCamera.entryDate,
          verification_status: activeCamera.verificationStatus,
          profile_data: activeCamera as unknown as Record<string, unknown>,
          provenance: activeCamera.fieldSources as unknown as Record<string, unknown>,
        });
        showToast(`"${activeCamera.brand} ${activeCamera.model}" veritabanına kaydedildi.`);
      }
    } catch {
      showToast('Profil yerel cihaz kütüphanesine kaydedildi (Çevrimdışı mod).');
    }
  };

  // JSON Dışa Aktar
  const handleExportJson = () => {
    const jsonStr = exportLibraryJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optik-cihaz-kutuphanesi-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Cihaz kütüphanesi JSON olarak dışa aktarıldı.');
  };

  // JSON İçe Aktar
  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const res = importLibraryJson(String(reader.result || ''));
        showToast(`${res.addedProjectors} projektör ve ${res.addedCameras} kamera başarıyla içe aktarıldı.`);
      } catch (err) {
        showToast(`JSON Hatası: ${(err as Error).message}`);
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  };

  // 3B Sahnede görüntü boyutları
  const proj3DImageW = projectorResult.nominalImageWidthM ?? targetWidthM;
  const proj3DImageH = projectorResult.nominalImageHeightM ?? targetHeightM;
  const proj3DBottomY =
    projectorResult.offsetAnalysis.projectedBottomFromFloorM ??
    Math.max(0, pjPos[1] - proj3DImageH / 2);
  const cam3DCovW = cameraResult.horizontalCoverageM ?? 4.0;
  const cam3DCovH = cameraResult.verticalCoverageM ?? 2.25;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ÜST BAŞLIK, AKTİF CİHAZ SEÇİMİ VE HIZLI EYLEM ÇUBUĞU */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          border: '1px solid #334155',
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>🔬</span>
              <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc' }}>
                Profesyonel Optik Cihaz Profili, FOV Kamera & Projeksiyon Lens Motoru
              </h2>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
              Gerçek optik/geometrik formüller · Veri kaynağı & güven seviyesi takibi (Null/UNKNOWN korumalı) · Offset / Lens Shift / Keystone ayrımı · 9-Maddeli Fiziksel Uygunluk Denetimi
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="secondary"
              style={{ fontSize: 12, borderColor: '#38bdf8', color: '#38bdf8' }}
              onClick={() => {
                setActiveProjectorId(SAMPLE_WXGA_4000_DLP_PROJECTOR.id);
                setThrowDistM(5.0);
                setTargetWidthM(3.0);
                setTargetHeightM(1.875);
                setPjPos([0, 0.85, 5.0]);
                showToast('Bölüm 8 Örnek WXGA 4000lm DLP Projektör Profili (TR 1.54–1.72, Offset %112±%5) yüklendi.');
              }}
            >
              ⚡ Örnek Cihaz Yükle: 4000lm WXGA DLP (TR 1.54–1.72)
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0f172a', padding: '4px 8px', borderRadius: 6, border: '1px solid #334155' }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Birim:</span>
              {(['m', 'cm', 'mm', 'ft', 'in'] as LengthUnit[]).map(u => (
                <button
                  key={u}
                  className={unit === u ? '' : 'secondary'}
                  style={{ padding: '2px 7px', fontSize: 11 }}
                  onClick={() => setUnit(u)}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Aktif Projektör & Kamera Seçici Satırı */}
        <div className="grid-2" style={{ marginTop: 14, gap: 12 }}>
          <div style={{ background: '#0b1120', padding: 10, borderRadius: 8, border: '1px solid #1e3a8a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8' }}>
                🅰️ AKTİF PROJEKSİYON CİHAZI PROFİLİ
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: SOURCE_LABELS[activeProjector.dataSource].badgeBg,
                  color: SOURCE_LABELS[activeProjector.dataSource].badgeText,
                }}
              >
                {activeProjector.verificationStatus} · {activeProjector.dataSource}
              </span>
            </div>
            <select
              value={activeProjector.id}
              onChange={e => setActiveProjectorId(e.target.value)}
              style={{ width: '100%', fontSize: 13 }}
            >
              {projectors.map(p => (
                <option key={p.id} value={p.id}>
                  {p.brand} — {p.model} (TR {p.optics.throwRatioMin ?? 'UNKNOWN'}–{p.optics.throwRatioMax ?? 'UNKNOWN'} | {p.general.brightnessAnsiLumens ?? 'UNKNOWN'} lm | {p.general.nativeAspectRatio ?? 'UNKNOWN'})
                </option>
              ))}
            </select>
          </div>

          <div style={{ background: '#0b1120', padding: 10, borderRadius: 8, border: '1px solid #065f46' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#34d399' }}>
                🅱️ AKTİF KAMERA & GÖRÜNTÜLEME CİHAZI PROFİLİ
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: SOURCE_LABELS[activeCamera.dataSource].badgeBg,
                  color: SOURCE_LABELS[activeCamera.dataSource].badgeText,
                }}
              >
                {activeCamera.verificationStatus} · {activeCamera.dataSource}
              </span>
            </div>
            <select
              value={activeCamera.id}
              onChange={e => setActiveCameraId(e.target.value)}
              style={{ width: '100%', fontSize: 13 }}
            >
              {cameras.map(c => (
                <option key={c.id} value={c.id}>
                  {c.brand} — {c.model} (Sensör: {c.sensor.sensorWidthMm ?? 'UNKNOWN'}×{c.sensor.sensorHeightMm ?? 'UNKNOWN'} mm | f={c.lens.focalLengthMinMm ?? c.lens.focalLengthMm ?? 'UNKNOWN'}–{c.lens.focalLengthMaxMm ?? 'UNKNOWN'} mm)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Alt Sekme Seçicileri */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className={activeTab === 'LIBRARY' ? '' : 'secondary'} onClick={() => setActiveTab('LIBRARY')}>
            1. Cihaz Profili & Kütüphane Yönetimi
          </button>
          <button className={activeTab === 'PROJECTOR_OPTICS' ? '' : 'secondary'} onClick={() => setActiveTab('PROJECTOR_OPTICS')}>
            2. Projektör Lens, Zoom, Offset & Shift Motoru
          </button>
          <button className={activeTab === 'CAMERA_OPTICS' ? '' : 'secondary'} onClick={() => setActiveTab('CAMERA_OPTICS')}>
            3. Kamera FOV, Zoom & Distorsiyon Motoru
          </button>
          <button className={activeTab === 'SHARED_3D_COMPLIANCE' ? '' : 'secondary'} onClick={() => setActiveTab('SHARED_3D_COMPLIANCE')}>
            4. Ortak 3B/2B Sahne & 9-Maddeli Fiziksel Uygunluk ({complianceReport.overallStatus})
          </button>
        </div>

        {statusMessage && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              borderRadius: 6,
              background: '#064e3b',
              border: '1px solid #10b981',
              color: '#a7f3d0',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ✅ {statusMessage}
          </div>
        )}
      </div>

      {/* ==========================================================================
          SEKME 1: CİHAZ PROFİLİ VE KÜTÜPHANE YÖNETİMİ (BÖLÜM 1, 2, 4)
         ========================================================================== */}
      {activeTab === 'LIBRARY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={librarySubTab === 'PROJECTOR' ? '' : 'secondary'} onClick={() => setLibrarySubTab('PROJECTOR')}>
                🅰️ Projeksiyon Cihazları ({projectors.length})
              </button>
              <button className={librarySubTab === 'CAMERA' ? '' : 'secondary'} onClick={() => setLibrarySubTab('CAMERA')}>
                🅱️ Kamera ve Görüntüleme Cihazları ({cameras.length})
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {librarySubTab === 'PROJECTOR' ? (
                <>
                  <button onClick={handleCreateManualProjector}>+ Yeni Manuel Projektör</button>
                  <button
                    className="secondary"
                    onClick={() => {
                      const copy = duplicateProjectorProfile(activeProjector.id);
                      if (copy) showToast(`"${copy.model}" kopyalandı.`);
                    }}
                  >
                    📋 Profili Kopyala
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (projectors.length <= 1) {
                        showToast('En az 1 projektör profili kalmalıdır.');
                        return;
                      }
                      deleteProjectorProfile(activeProjector.id);
                      showToast('Projektör profili silindi.');
                    }}
                  >
                    🗑️ Sil
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleCreateManualCamera}>+ Yeni Manuel Kamera</button>
                  <button
                    className="secondary"
                    onClick={() => {
                      const copy = duplicateCameraProfile(activeCamera.id);
                      if (copy) showToast(`"${copy.model}" kopyalandı.`);
                    }}
                  >
                    📋 Profili Kopyala
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (cameras.length <= 1) {
                        showToast('En az 1 kamera profili kalmalıdır.');
                        return;
                      }
                      deleteCameraProfile(activeCamera.id);
                      showToast('Kamera profili silindi.');
                    }}
                  >
                    🗑️ Sil
                  </button>
                </>
              )}

              <button className="secondary" onClick={handleSaveProfileToBackend}>
                💾 Cihaz Kütüphanesine Kaydet
              </button>
              <button className="secondary" onClick={handleExportJson}>
                ⬇️ JSON Dışa Aktar
              </button>
              <button className="secondary" onClick={() => fileInputRef.current?.click()}>
                ⬆️ JSON İçe Aktar
              </button>
              <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJsonFile} />
            </div>
          </div>

          {/* Katalogdan Hızlı Aktarım Kutusu */}
          {librarySubTab === 'PROJECTOR' && (
            <div className="card" style={{ background: '#0b1120', border: '1px solid #1e293b' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#38bdf8' }}>
                📚 Hazır Veritabanı Kataloğundan Cihaz + Lens Profili Oluştur
              </h4>
              <div className="grid-3" style={{ gap: 10, alignItems: 'end' }}>
                <label>
                  Katalog Projektörü
                  <select value={selectedCatalogProjId} onChange={e => setSelectedCatalogProjId(e.target.value)}>
                    {CATALOG_PROJECTORS.map(cp => (
                      <option key={cp.id} value={cp.id}>
                        {cp.manufacturer} {cp.model} ({cp.ansiLumens} lm, {cp.nativeW}×{cp.nativeH})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Katalog Lensi (Opsiyonel)
                  <select value={selectedCatalogLensId} onChange={e => setSelectedCatalogLensId(e.target.value)}>
                    <option value="">— Varsayılan / Uyumlu Lens —</option>
                    {CATALOG_LENSES.map(cl => (
                      <option key={cl.id} value={cl.id}>
                        {cl.manufacturer} {cl.model} (TR {cl.throwMin}–{cl.throwMax}:1)
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={handleImportFromCatalog}>📥 Katalogdan Cihaz Profiline Aktar</button>
              </div>
            </div>
          )}

          {/* PROJEKTÖR DETAYLI TEKNİK FORMU (BÖLÜM 2) */}
          {librarySubTab === 'PROJECTOR' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card">
                <h3 style={{ marginTop: 0, fontSize: 15, color: '#38bdf8' }}>
                  1. Cihaz Kimliği, Veri Kaynağı ve Doğrulama Durumu (Bölüm 1)
                </h3>
                <div className="grid-4" style={{ gap: 10 }}>
                  <label>
                    Marka (Brand)
                    <input value={activeProjector.brand} onChange={e => upsertProjectorProfile({ ...activeProjector, brand: e.target.value })} />
                  </label>
                  <label>
                    Model
                    <input value={activeProjector.model} onChange={e => upsertProjectorProfile({ ...activeProjector, model: e.target.value })} />
                  </label>
                  <label>
                    Üretici / Chipset
                    <input value={activeProjector.manufacturer} onChange={e => upsertProjectorProfile({ ...activeProjector, manufacturer: e.target.value })} />
                  </label>
                  <label>
                    Veri Kaynağı & Güven Seviyesi
                    <select
                      value={activeProjector.dataSource}
                      onChange={e => upsertProjectorProfile({ ...activeProjector, dataSource: e.target.value as ParameterSourceType })}
                    >
                      <option value="MANUFACTURER_SPEC">Manufacturer Specification</option>
                      <option value="USER_ENTERED">User Entered</option>
                      <option value="FIELD_MEASURED">Field Measured</option>
                      <option value="ESTIMATED">Estimated</option>
                      <option value="UNKNOWN">Unknown</option>
                    </select>
                  </label>
                  <label>
                    Doğrulama Durumu
                    <select
                      value={activeProjector.verificationStatus}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          verificationStatus: e.target.value as ProjectorDeviceProfile['verificationStatus'],
                        })
                      }
                    >
                      <option value="MANUFACTURER_VERIFIED">MANUFACTURER_VERIFIED (Katalog Onaylı)</option>
                      <option value="USER_DEFINED">USER_DEFINED (Kullanıcı Tanımlı / Doğrulanmamış)</option>
                      <option value="FIELD_VERIFIED">FIELD_VERIFIED (Saha Doğrulamalı)</option>
                      <option value="UNVERIFIED">UNVERIFIED (Doğrulanmamış)</option>
                    </select>
                  </label>
                  <label>
                    Katalog / Datasheet URL
                    <input
                      placeholder="https://..."
                      value={activeProjector.catalogUrl ?? ''}
                      onChange={e => upsertProjectorProfile({ ...activeProjector, catalogUrl: e.target.value || null })}
                    />
                  </label>
                  <label>
                    Veri Giriş Tarihi
                    <input
                      type="date"
                      value={activeProjector.entryDate}
                      onChange={e => upsertProjectorProfile({ ...activeProjector, entryDate: e.target.value })}
                    />
                  </label>
                  <label>
                    Cihaz ID
                    <input value={activeProjector.id} disabled />
                  </label>
                </div>
              </div>

              {/* 2. GENEL ÖZELLİKLER */}
              <div className="card">
                <h3 style={{ marginTop: 0, fontSize: 15, color: '#38bdf8' }}>
                  2. Genel & Fotometrik Özellikler (Bilinmeyen alanları boş bırakın → UNKNOWN)
                </h3>
                <div className="grid-4" style={{ gap: 10 }}>
                  <label>
                    Görüntü Teknolojisi
                    <select
                      value={activeProjector.general.displayTechnology ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: {
                            ...activeProjector.general,
                            displayTechnology: (e.target.value || null) as ProjectorDeviceProfile['general']['displayTechnology'],
                          },
                        })
                      }
                    >
                      <option value="">UNKNOWN</option>
                      <option value="DLP">DLP</option>
                      <option value="3LCD">3LCD</option>
                      <option value="LCoS">LCoS</option>
                      <option value="SXRD">SXRD</option>
                      <option value="Other">Diğer</option>
                    </select>
                  </label>
                  <label>
                    Chip Configuration
                    <input
                      value={activeProjector.general.chipConfiguration ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: { ...activeProjector.general, chipConfiguration: e.target.value || null },
                        })
                      }
                    />
                  </label>
                  <label>
                    Işık Kaynağı
                    <select
                      value={activeProjector.general.lightSource ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: {
                            ...activeProjector.general,
                            lightSource: (e.target.value || null) as ProjectorDeviceProfile['general']['lightSource'],
                          },
                        })
                      }
                    >
                      <option value="">UNKNOWN</option>
                      <option value="Laser Phosphor">Laser Phosphor</option>
                      <option value="Laser">Laser</option>
                      <option value="RGB Laser">RGB Laser</option>
                      <option value="LED">LED</option>
                      <option value="Lamp">Lamp</option>
                    </select>
                  </label>
                  <label>
                    Parlaklık (ANSI Lumens)
                    <input
                      type="number"
                      placeholder="Boş = UNKNOWN"
                      value={activeProjector.general.brightnessAnsiLumens ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: { ...activeProjector.general, brightnessAnsiLumens: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Dinamik Parlaklık (Lm)
                    <input
                      type="number"
                      placeholder="Boş = UNKNOWN"
                      value={activeProjector.general.dynamicBrightnessLumens ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: { ...activeProjector.general, dynamicBrightnessLumens: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Doğal Çözünürlük Genişlik (px)
                    <input
                      type="number"
                      value={activeProjector.general.nativeResolutionW ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: { ...activeProjector.general, nativeResolutionW: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Doğal Çözünürlük Yükseklik (px)
                    <input
                      type="number"
                      value={activeProjector.general.nativeResolutionH ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: { ...activeProjector.general, nativeResolutionH: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Doğal En-Boy Oranı (Native Aspect)
                    <input
                      placeholder="16:10, 16:9, 4:3"
                      value={activeProjector.general.nativeAspectRatio ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: { ...activeProjector.general, nativeAspectRatio: e.target.value || null },
                        })
                      }
                    />
                  </label>
                  <label>
                    Maks. Desteklenen Çözünürlük
                    <input
                      value={activeProjector.general.maxResolutionLabel ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: { ...activeProjector.general, maxResolutionLabel: e.target.value || null },
                        })
                      }
                    />
                  </label>
                  <label>
                    Native Kontrast (N:1 — Boş = UNKNOWN)
                    <input
                      type="number"
                      placeholder="Boş = UNKNOWN"
                      value={activeProjector.general.nativeContrastRatio ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: { ...activeProjector.general, nativeContrastRatio: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Dynamic Kontrast (N:1 — Ayrı!)
                    <input
                      type="number"
                      placeholder="Örn: 3000000"
                      value={activeProjector.general.dynamicContrastRatio ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          general: { ...activeProjector.general, dynamicContrastRatio: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                </div>
              </div>

              {/* 3. OPTİK ÖZELLİKLER */}
              <div className="card">
                <h3 style={{ marginTop: 0, fontSize: 15, color: '#38bdf8' }}>
                  3. Optik & Lens Parametreleri (TR, F-Number, Odak, Zoom, Offset, Shift)
                </h3>
                <div className="grid-4" style={{ gap: 10 }}>
                  <label>
                    Throw Ratio Min (Geniş Uç)
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Boş = UNKNOWN"
                      value={activeProjector.optics.throwRatioMin ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, throwRatioMin: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Throw Ratio Max (Tele Uç)
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Boş = UNKNOWN"
                      value={activeProjector.optics.throwRatioMax ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, throwRatioMax: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Optik Zoom Oranı (x)
                    <input
                      type="number"
                      step="0.05"
                      value={activeProjector.optics.opticalZoomRatio ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, opticalZoomRatio: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Sabit / Değiştirilebilir Lens
                    <select
                      value={
                        activeProjector.optics.isInterchangeableLens === null
                          ? 'UNKNOWN'
                          : activeProjector.optics.isInterchangeableLens
                          ? 'INTERCHANGEABLE'
                          : 'FIXED'
                      }
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: {
                            ...activeProjector.optics,
                            isInterchangeableLens:
                              e.target.value === 'UNKNOWN' ? null : e.target.value === 'INTERCHANGEABLE',
                          },
                        })
                      }
                    >
                      <option value="FIXED">Sabit Lens (Fixed Built-in)</option>
                      <option value="INTERCHANGEABLE">Değiştirilebilir Lens (Interchangeable)</option>
                      <option value="UNKNOWN">UNKNOWN</option>
                    </select>
                  </label>

                  <label>
                    F-Number Min
                    <input
                      type="number"
                      step="0.01"
                      value={activeProjector.optics.fNumberMin ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, fNumberMin: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    F-Number Max
                    <input
                      type="number"
                      step="0.01"
                      value={activeProjector.optics.fNumberMax ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, fNumberMax: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Focal Length Min (mm)
                    <input
                      type="number"
                      step="0.05"
                      value={activeProjector.optics.focalLengthMinMm ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, focalLengthMinMm: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Focal Length Max (mm)
                    <input
                      type="number"
                      step="0.05"
                      value={activeProjector.optics.focalLengthMaxMm ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, focalLengthMaxMm: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>

                  <label>
                    Optik Lens Offset (%)
                    <input
                      type="number"
                      step="1"
                      value={activeProjector.optics.lensOffsetPct ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, lensOffsetPct: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Offset Toleransı (±%)
                    <input
                      type="number"
                      step="0.5"
                      value={activeProjector.optics.lensOffsetTolerancePct ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, lensOffsetTolerancePct: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label style={{ gridColumn: 'span 2' }}>
                    Offset Ölçüm Konvansiyonu (Bölüm 6 Zorunlu Referans)
                    <select
                      value={activeProjector.optics.offsetMeasurementConvention ?? 'UNSPECIFIED'}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: {
                            ...activeProjector.optics,
                            offsetMeasurementConvention: e.target.value as OffsetReferenceConvention,
                          },
                        })
                      }
                    >
                      <option value="FULL_HEIGHT_FROM_BOTTOM">FULL_HEIGHT_FROM_BOTTOM (%100 = Alt kenar lens ekseninde, %112 = +0.12H yukarıda)</option>
                      <option value="HALF_HEIGHT_FROM_CENTER">HALF_HEIGHT_FROM_CENTER (%0 = Merkez lens ekseninde)</option>
                      <option value="LENS_TO_BOTTOM_PCT">LENS_TO_BOTTOM_PCT (Doğrudan lens-alt kenar oranı)</option>
                      <option value="UNSPECIFIED">UNSPECIFIED (Belirtilmemiş → Kesin dikey yerleşim UNKNOWN döner)</option>
                    </select>
                  </label>

                  <label>
                    Dikey Lens Shift Min (-%)
                    <input
                      type="number"
                      placeholder="Boş = UNKNOWN"
                      value={activeProjector.optics.lensShiftVerticalMinPct ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, lensShiftVerticalMinPct: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Dikey Lens Shift Max (+%)
                    <input
                      type="number"
                      placeholder="Boş = UNKNOWN"
                      value={activeProjector.optics.lensShiftVerticalMaxPct ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, lensShiftVerticalMaxPct: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Yatay Lens Shift Min (-%)
                    <input
                      type="number"
                      placeholder="Boş = UNKNOWN"
                      value={activeProjector.optics.lensShiftHorizontalMinPct ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, lensShiftHorizontalMinPct: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Yatay Lens Shift Max (+%)
                    <input
                      type="number"
                      placeholder="Boş = UNKNOWN"
                      value={activeProjector.optics.lensShiftHorizontalMaxPct ?? ''}
                      onChange={e =>
                        upsertProjectorProfile({
                          ...activeProjector,
                          optics: { ...activeProjector.optics, lensShiftHorizontalMaxPct: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                </div>
              </div>

              {/* 4. GEOMETRİ, ELEKTRİK VE MEKANİK ÖZELLİKLER */}
              <div className="grid-3" style={{ gap: 14 }}>
                <div className="card">
                  <h3 style={{ marginTop: 0, fontSize: 14, color: '#38bdf8' }}>4. Geometri & Keystone</h3>
                  <div className="grid-2" style={{ gap: 8 }}>
                    <label>
                      Dikey Keystone (±°)
                      <input
                        type="number"
                        value={activeProjector.geometry.keystoneVerticalDeg ?? ''}
                        onChange={e =>
                          upsertProjectorProfile({
                            ...activeProjector,
                            geometry: { ...activeProjector.geometry, keystoneVerticalDeg: parseNullableNumber(e.target.value) },
                          })
                        }
                      />
                    </label>
                    <label>
                      Yatay Keystone (±°)
                      <input
                        type="number"
                        value={activeProjector.geometry.keystoneHorizontalDeg ?? ''}
                        onChange={e =>
                          upsertProjectorProfile({
                            ...activeProjector,
                            geometry: { ...activeProjector.geometry, keystoneHorizontalDeg: parseNullableNumber(e.target.value) },
                          })
                        }
                      />
                    </label>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                    Projeksiyon Modları: {activeProjector.geometry.supportedProjectionModes.join(', ')}
                  </div>
                </div>

                <div className="card">
                  <h3 style={{ marginTop: 0, fontSize: 14, color: '#38bdf8' }}>5. Elektrik Yükleri</h3>
                  <div className="grid-2" style={{ gap: 8 }}>
                    <label>
                      Güç Tüketimi (W)
                      <input
                        type="number"
                        value={activeProjector.electrical.powerConsumptionW ?? ''}
                        onChange={e =>
                          upsertProjectorProfile({
                            ...activeProjector,
                            electrical: { ...activeProjector.electrical, powerConsumptionW: parseNullableNumber(e.target.value) },
                          })
                        }
                      />
                    </label>
                    <label>
                      Standby Güç (W)
                      <input
                        type="number"
                        step="0.1"
                        value={activeProjector.electrical.standbyPowerW ?? ''}
                        onChange={e =>
                          upsertProjectorProfile({
                            ...activeProjector,
                            electrical: { ...activeProjector.electrical, standbyPowerW: parseNullableNumber(e.target.value) },
                          })
                        }
                      />
                    </label>
                    <label>
                      Min Voltaj (V)
                      <input
                        type="number"
                        value={activeProjector.electrical.voltageMinV ?? ''}
                        onChange={e =>
                          upsertProjectorProfile({
                            ...activeProjector,
                            electrical: { ...activeProjector.electrical, voltageMinV: parseNullableNumber(e.target.value) },
                          })
                        }
                      />
                    </label>
                    <label>
                      Max Voltaj (V)
                      <input
                        type="number"
                        value={activeProjector.electrical.voltageMaxV ?? ''}
                        onChange={e =>
                          upsertProjectorProfile({
                            ...activeProjector,
                            electrical: { ...activeProjector.electrical, voltageMaxV: parseNullableNumber(e.target.value) },
                          })
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="card">
                  <h3 style={{ marginTop: 0, fontSize: 14, color: '#38bdf8' }}>6. Mekanik & Soğutma Boşluğu</h3>
                  <div className="grid-2" style={{ gap: 8 }}>
                    <label>
                      Genişlik W (mm)
                      <input
                        type="number"
                        step="0.5"
                        value={activeProjector.mechanical.widthMm ?? ''}
                        onChange={e =>
                          upsertProjectorProfile({
                            ...activeProjector,
                            mechanical: { ...activeProjector.mechanical, widthMm: parseNullableNumber(e.target.value) },
                          })
                        }
                      />
                    </label>
                    <label>
                      Derinlik D (mm)
                      <input
                        type="number"
                        step="0.5"
                        value={activeProjector.mechanical.depthMm ?? ''}
                        onChange={e =>
                          upsertProjectorProfile({
                            ...activeProjector,
                            mechanical: { ...activeProjector.mechanical, depthMm: parseNullableNumber(e.target.value) },
                          })
                        }
                      />
                    </label>
                    <label>
                      Yükseklik H (mm)
                      <input
                        type="number"
                        step="0.5"
                        value={activeProjector.mechanical.heightMm ?? ''}
                        onChange={e =>
                          upsertProjectorProfile({
                            ...activeProjector,
                            mechanical: { ...activeProjector.mechanical, heightMm: parseNullableNumber(e.target.value) },
                          })
                        }
                      />
                    </label>
                    <label>
                      Ağırlık (kg)
                      <input
                        type="number"
                        step="0.1"
                        value={activeProjector.mechanical.weightKg ?? ''}
                        onChange={e =>
                          upsertProjectorProfile({
                            ...activeProjector,
                            mechanical: { ...activeProjector.mechanical, weightKg: parseNullableNumber(e.target.value) },
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* KAMERA DETAYLI TEKNİK FORMU (BÖLÜM 4) */}
          {librarySubTab === 'CAMERA' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card">
                <h3 style={{ marginTop: 0, fontSize: 15, color: '#34d399' }}>
                  1. Kamera Kimliği, Sensör ve Lens Parametreleri (Bilinmeyen sensör boyutları ASLA tahmin edilmez → UNKNOWN)
                </h3>
                <div className="grid-4" style={{ gap: 10 }}>
                  <label>
                    Marka (Brand)
                    <input value={activeCamera.brand} onChange={e => upsertCameraProfile({ ...activeCamera, brand: e.target.value })} />
                  </label>
                  <label>
                    Model
                    <input value={activeCamera.model} onChange={e => upsertCameraProfile({ ...activeCamera, model: e.target.value })} />
                  </label>
                  <label>
                    Sensör Tipi
                    <input
                      value={activeCamera.sensor.sensorType ?? ''}
                      onChange={e =>
                        upsertCameraProfile({
                          ...activeCamera,
                          sensor: { ...activeCamera.sensor, sensorType: e.target.value || null },
                        })
                      }
                    />
                  </label>
                  <label>
                    Veri Kaynağı
                    <select
                      value={activeCamera.dataSource}
                      onChange={e => upsertCameraProfile({ ...activeCamera, dataSource: e.target.value as ParameterSourceType })}
                    >
                      <option value="MANUFACTURER_SPEC">Manufacturer Specification</option>
                      <option value="USER_ENTERED">User Entered</option>
                      <option value="FIELD_MEASURED">Field Measured</option>
                      <option value="ESTIMATED">Estimated</option>
                      <option value="UNKNOWN">Unknown</option>
                    </select>
                  </label>

                  <label>
                    Sensör Genişliği Sw (mm)
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Boş = UNKNOWN"
                      value={activeCamera.sensor.sensorWidthMm ?? ''}
                      onChange={e =>
                        upsertCameraProfile({
                          ...activeCamera,
                          sensor: { ...activeCamera.sensor, sensorWidthMm: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Sensör Yüksekliği Sh (mm)
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Boş = UNKNOWN"
                      value={activeCamera.sensor.sensorHeightMm ?? ''}
                      onChange={e =>
                        upsertCameraProfile({
                          ...activeCamera,
                          sensor: { ...activeCamera.sensor, sensorHeightMm: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Doğal Çözünürlük Genişlik (px)
                    <input
                      type="number"
                      value={activeCamera.sensor.nativeResolutionW ?? ''}
                      onChange={e =>
                        upsertCameraProfile({
                          ...activeCamera,
                          sensor: { ...activeCamera.sensor, nativeResolutionW: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Doğal Çözünürlük Yükseklik (px)
                    <input
                      type="number"
                      value={activeCamera.sensor.nativeResolutionH ?? ''}
                      onChange={e =>
                        upsertCameraProfile({
                          ...activeCamera,
                          sensor: { ...activeCamera.sensor, nativeResolutionH: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>

                  <label>
                    Lens Odak Min f_min (mm)
                    <input
                      type="number"
                      step="0.1"
                      value={activeCamera.lens.focalLengthMinMm ?? ''}
                      onChange={e =>
                        upsertCameraProfile({
                          ...activeCamera,
                          lens: { ...activeCamera.lens, focalLengthMinMm: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Lens Odak Max f_max (mm)
                    <input
                      type="number"
                      step="0.1"
                      value={activeCamera.lens.focalLengthMaxMm ?? ''}
                      onChange={e =>
                        upsertCameraProfile({
                          ...activeCamera,
                          lens: { ...activeCamera.lens, focalLengthMaxMm: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Lens Distorsiyonu (%)
                    <input
                      type="number"
                      step="0.5"
                      value={activeCamera.lens.lensDistortionPct ?? ''}
                      onChange={e =>
                        upsertCameraProfile({
                          ...activeCamera,
                          lens: { ...activeCamera.lens, lensDistortionPct: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Min Netleme Mesafesi (m)
                    <input
                      type="number"
                      step="0.05"
                      value={activeCamera.lens.minFocusDistanceM ?? ''}
                      onChange={e =>
                        upsertCameraProfile({
                          ...activeCamera,
                          lens: { ...activeCamera.lens, minFocusDistanceM: parseNullableNumber(e.target.value) },
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================================================
          SEKME 2: PROJEKTÖR LENS, ZOOM, OFFSET VE SHIFT HESAPLAMA MOTORU (BÖLÜM 3, 6, 8)
         ========================================================================== */}
      {activeTab === 'PROJECTOR_OPTICS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: '#38bdf8' }}>
                Projektör Lens Hesaplama Motoru — 4 Mühendislik Çalışma Modu (Bölüm 3)
              </h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(
                  [
                    { id: 'DIST_TO_SIZE', label: '1. Mesafeden → Görüntü Boyutu' },
                    { id: 'SIZE_TO_DIST', label: '2. Hedef Boyuttan → Mesafe' },
                    { id: 'SIZE_TO_LENS_RANGE', label: '3. Hedef Boyut + Mesafeden → TR Uyumu' },
                    { id: 'POSITION_TO_FOOTPRINT', label: '4. 3B Konumdan → Duvar İzi' },
                  ] as { id: ProjectorCalculationMethod; label: string }[]
                ).map(m => (
                  <button
                    key={m.id}
                    className={projCalcMethod === m.id ? '' : 'secondary'}
                    style={{ fontSize: 12 }}
                    onClick={() => setProjCalcMethod(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid-4" style={{ gap: 12 }}>
              <label>
                Atım Mesafesi D (m)
                <input
                  type="number"
                  step="0.1"
                  value={throwDistM}
                  onChange={e => setThrowDistM(Math.max(0.2, Number(e.target.value) || 0))}
                />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Seçili birim: {formatLengthWithUnit(throwDistM, unit, 2)}
                </span>
              </label>

              <label>
                Hedef Görüntü Genişliği W (m)
                <input
                  type="number"
                  step="0.1"
                  value={targetWidthM}
                  onChange={e => setTargetWidthM(Math.max(0.2, Number(e.target.value) || 0))}
                />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Seçili birim: {formatLengthWithUnit(targetWidthM, unit, 2)}
                </span>
              </label>

              <label>
                Hedef Yüzey Yüksekliği H (m)
                <input
                  type="number"
                  step="0.05"
                  value={targetHeightM}
                  onChange={e => setTargetHeightM(Math.max(0.2, Number(e.target.value) || 0))}
                />
              </label>

              <label>
                Seçilen Lens Throw Ratio ({selectedTR ?? projectorResult.nominalThrowRatio ?? 'Orta'})
                <input
                  type="range"
                  min={activeProjector.optics.throwRatioMin ?? 1.0}
                  max={activeProjector.optics.throwRatioMax ?? 2.0}
                  step="0.01"
                  value={
                    selectedTR ??
                    (activeProjector.optics.throwRatioMin && activeProjector.optics.throwRatioMax
                      ? (activeProjector.optics.throwRatioMin + activeProjector.optics.throwRatioMax) / 2
                      : 1.6)
                  }
                  onChange={e => setSelectedTR(Number(e.target.value))}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                  <span>Min (Geniş): {activeProjector.optics.throwRatioMin ?? 'UNKNOWN'}</span>
                  <button className="secondary" style={{ padding: '0 6px', fontSize: 10 }} onClick={() => setSelectedTR(null)}>
                    Merkez TR
                  </button>
                  <span>Max (Tele): {activeProjector.optics.throwRatioMax ?? 'UNKNOWN'}</span>
                </div>
              </label>
            </div>
          </div>

          {/* Nominal / Min / Max Sonuç Kartları */}
          <div className="grid-4" style={{ gap: 12 }}>
            <div className="card" style={{ borderLeft: '4px solid #38bdf8' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>
                {projectorResult.minImageWidthM !== null &&
                projectorResult.maxImageWidthM !== null &&
                projectorResult.minImageWidthM !== projectorResult.maxImageWidthM
                  ? 'GÖRÜNTÜ GENİŞLİĞİ ARALIĞI (W = D / TR)'
                  : 'GÖRÜNTÜ GENİŞLİĞİ (W)'}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', margin: '4px 0' }}>
                {formatLengthWithUnit(projectorResult.nominalImageWidthM, unit, 3)}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                {projectorResult.minImageWidthM !== null &&
                projectorResult.maxImageWidthM !== null &&
                projectorResult.minImageWidthM !== projectorResult.maxImageWidthM ? (
                  <>
                    Min (TR={projectorResult.maxThrowRatio ?? '?'}): <b>{formatLengthWithUnit(projectorResult.minImageWidthM, unit, 3)}</b>
                    <br />
                    Max (TR={projectorResult.minThrowRatio ?? '?'}): <b>{formatLengthWithUnit(projectorResult.maxImageWidthM, unit, 3)}</b>
                  </>
                ) : (
                  <span>Genişlik: <b>{formatLengthWithUnit(projectorResult.nominalImageWidthM, unit, 3)} (Sabit Giriş)</b></span>
                )}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #a855f7' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>
                GÖRÜNTÜ YÜKSEKLİĞİ (H = W / {projectorResult.aspectRatioLabel})
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', margin: '4px 0' }}>
                {formatLengthWithUnit(projectorResult.nominalImageHeightM, unit, 3)}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                {projectorResult.minImageHeightM !== null &&
                projectorResult.maxImageHeightM !== null &&
                projectorResult.minImageHeightM !== projectorResult.maxImageHeightM ? (
                  <>
                    Min Yükseklik: <b>{formatLengthWithUnit(projectorResult.minImageHeightM, unit, 3)}</b>
                    <br />
                    Max Yükseklik: <b>{formatLengthWithUnit(projectorResult.maxImageHeightM, unit, 3)}</b>
                  </>
                ) : (
                  <span>Yükseklik: <b>{formatLengthWithUnit(projectorResult.nominalImageHeightM, unit, 3)} (Sabit)</b></span>
                )}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>DİYAGONAL (√(W² + H²))</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', margin: '4px 0' }}>
                {fmtVal(projectorResult.nominalDiagonalInch, 1, 'inç')} ({fmtVal(projectorResult.nominalDiagonalM, 3, 'm')})
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                {projectorResult.minDiagonalM !== null &&
                projectorResult.maxDiagonalM !== null &&
                projectorResult.minDiagonalM !== projectorResult.maxDiagonalM ? (
                  <>Diyagonal (m): <b>{fmtVal(projectorResult.minDiagonalM, 3, 'm')} – {fmtVal(projectorResult.maxDiagonalM, 3, 'm')}</b></>
                ) : (
                  <>Diyagonal (m): <b>{fmtVal(projectorResult.nominalDiagonalM, 3, 'm')} (Sabit)</b></>
                )}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>
                {projectorResult.minDistanceM !== null &&
                projectorResult.maxDistanceM !== null &&
                projectorResult.minDistanceM !== projectorResult.maxDistanceM
                  ? 'ATIM MESAFESİ PENCERESİ (D = W × TR)'
                  : 'ATIM MESAFESİ (D)'}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', margin: '4px 0' }}>
                {projectorResult.minDistanceM !== null && projectorResult.maxDistanceM !== null
                  ? projectorResult.minDistanceM === projectorResult.maxDistanceM
                    ? `${formatLengthWithUnit(projectorResult.nominalDistanceM, unit, 3)}`
                    : `${formatLengthWithUnit(projectorResult.minDistanceM, unit, 3)} – ${formatLengthWithUnit(projectorResult.maxDistanceM, unit, 3)}`
                  : 'UNKNOWN'}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                {projectorResult.minDistanceM === projectorResult.maxDistanceM ? (
                  <span>Durum: <b>Sabit Giriş Mesafesi</b></span>
                ) : (
                  <span>Nominal Mesafe: <b>{formatLengthWithUnit(projectorResult.nominalDistanceM, unit, 3)}</b></span>
                )}
                <br />
                Lens Tipi:{' '}
                <b>
                  {projectorResult.isFixedLens === null
                    ? 'UNKNOWN'
                    : projectorResult.isFixedLens
                    ? 'Sabit (Fixed)'
                    : 'Optik Zoom'}
                </b>
                {projectorResult.method === 'DIST_TO_SIZE' && !projectorResult.isFixedLens && (
                  <span style={{ display: 'block', fontSize: 11, color: '#38bdf8', marginTop: 4 }}>
                    💡 Mesafe {formatLengthWithUnit(projectorResult.nominalDistanceM, unit, 2)} sabit tutulduğunda optik zoom, duvardaki görüntü genişliğini ({formatLengthWithUnit(projectorResult.minImageWidthM, unit, 2)} – {formatLengthWithUnit(projectorResult.maxImageWidthM, unit, 2)}) ayarlar.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* BÖLÜM 8 ZORUNLU TEST VE REFERANS MATRİSİ (5m, 7m, 3m Hedef Genişlik) */}
          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: 14, color: '#fbbf24' }}>
              📐 Bölüm 8 Doğrulama Matrisi (5 m / 7 m Atım Mesafesi & 3 m Hedef Genişlik Tablosu)
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Senaryo</th>
                  <th>Min Görüntü Genişliği (TR_max = {projectorResult.maxThrowRatio ?? 'UNKNOWN'})</th>
                  <th>Max Görüntü Genişliği (TR_min = {projectorResult.minThrowRatio ?? 'UNKNOWN'})</th>
                  <th>16:10 / Native Yükseklik Aralığı</th>
                  <th>Gereken Atım Mesafesi Aralığı (D_min – D_max)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>5.00 m Atım Mesafesinde Görüntü Boyutu</b></td>
                  <td>{fmtVal(projectorResult.referenceMatrix.at5mDistance.minWidthM, 3, 'm')}</td>
                  <td>{fmtVal(projectorResult.referenceMatrix.at5mDistance.maxWidthM, 3, 'm')}</td>
                  <td>
                    {fmtVal(projectorResult.referenceMatrix.at5mDistance.minHeightM, 3, 'm')} –{' '}
                    {fmtVal(projectorResult.referenceMatrix.at5mDistance.maxHeightM, 3, 'm')}
                  </td>
                  <td>5.000 m (Sabit)</td>
                </tr>
                <tr>
                  <td><b>7.00 m Atım Mesafesinde Görüntü Boyutu</b></td>
                  <td>{fmtVal(projectorResult.referenceMatrix.at7mDistance.minWidthM, 3, 'm')}</td>
                  <td>{fmtVal(projectorResult.referenceMatrix.at7mDistance.maxWidthM, 3, 'm')}</td>
                  <td>
                    {fmtVal(projectorResult.referenceMatrix.at7mDistance.minHeightM, 3, 'm')} –{' '}
                    {fmtVal(projectorResult.referenceMatrix.at7mDistance.maxHeightM, 3, 'm')}
                  </td>
                  <td>7.000 m (Sabit)</td>
                </tr>
                <tr>
                  <td><b>3.00 m Hedef Görüntü Genişliği İçin Mesafe</b></td>
                  <td>3.000 m</td>
                  <td>3.000 m</td>
                  <td>{fmtVal(projectorResult.referenceMatrix.for3mWidth.imageHeightM, 3, 'm')}</td>
                  <td>
                    <b>
                      {fmtVal(projectorResult.referenceMatrix.for3mWidth.minDistanceM, 3, 'm')} –{' '}
                      {fmtVal(projectorResult.referenceMatrix.for3mWidth.maxDistanceM, 3, 'm')}
                    </b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* BÖLÜM 6: OPTİK OFFSET, LENS SHIFT VE KEYSTONE AYRIM ANALİZİ */}
          <div className="grid-3" style={{ gap: 14 }}>
            <div className="card" style={{ borderTop: `3px solid ${STATUS_BADGE[projectorResult.offsetAnalysis.status].border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h4 style={{ margin: 0, fontSize: 13, color: '#38bdf8' }}>6.1 Optik Offset Analizi</h4>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: STATUS_BADGE[projectorResult.offsetAnalysis.status].bg,
                    color: STATUS_BADGE[projectorResult.offsetAnalysis.status].text,
                  }}
                >
                  {projectorResult.offsetAnalysis.status}
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#cbd5e1', margin: '6px 0' }}>{projectorResult.offsetAnalysis.summaryTr}</p>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                <div>Konvansiyon: <b>{projectorResult.offsetAnalysis.convention ?? 'UNSPECIFIED'}</b></div>
                <div>Lens Ekseni → Alt Kenar: <b>{fmtVal(projectorResult.offsetAnalysis.imageBottomOffsetFromLensAxisM, 3, 'm')}</b></div>
                <div>Lens Ekseni → Üst Kenar: <b>{fmtVal(projectorResult.offsetAnalysis.imageTopOffsetFromLensAxisM, 3, 'm')}</b></div>
                <div>Zeminden Görüntü Alt/Üst: <b>{fmtVal(projectorResult.offsetAnalysis.projectedBottomFromFloorM, 3, 'm')} / {fmtVal(projectorResult.offsetAnalysis.projectedTopFromFloorM, 3, 'm')}</b></div>
              </div>
            </div>

            <div className="card" style={{ borderTop: `3px solid ${STATUS_BADGE[projectorResult.lensShiftAnalysis.status].border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h4 style={{ margin: 0, fontSize: 13, color: '#a855f7' }}>6.2 Optik Lens Shift (Geometrik Kaydırma)</h4>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: STATUS_BADGE[projectorResult.lensShiftAnalysis.status].bg,
                    color: STATUS_BADGE[projectorResult.lensShiftAnalysis.status].text,
                  }}
                >
                  {projectorResult.lensShiftAnalysis.status}
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#cbd5e1', margin: '6px 0' }}>{projectorResult.lensShiftAnalysis.summaryTr}</p>
              <div className="grid-2" style={{ gap: 8, marginTop: 8 }}>
                <label style={{ fontSize: 11 }}>
                  İstenen Dikey Shift (%)
                  <input type="number" step="1" value={reqVShiftPct} onChange={e => setReqVShiftPct(Number(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: 11 }}>
                  İstenen Yatay Shift (%)
                  <input type="number" step="1" value={reqHShiftPct} onChange={e => setReqHShiftPct(Number(e.target.value) || 0)} />
                </label>
              </div>
            </div>

            <div className="card" style={{ borderTop: `3px solid ${STATUS_BADGE[projectorResult.keystoneAnalysis.status].border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h4 style={{ margin: 0, fontSize: 13, color: '#f59e0b' }}>6.3 Dijital Keystone (Çözünürlük Kaybı)</h4>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: STATUS_BADGE[projectorResult.keystoneAnalysis.status].bg,
                    color: STATUS_BADGE[projectorResult.keystoneAnalysis.status].text,
                  }}
                >
                  {projectorResult.keystoneAnalysis.status}
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#cbd5e1', margin: '6px 0' }}>{projectorResult.keystoneAnalysis.summaryTr}</p>
              <div className="grid-2" style={{ gap: 8, marginTop: 8 }}>
                <label style={{ fontSize: 11 }}>
                  Uygulanan Dikey Keystone (°)
                  <input type="number" step="1" value={reqVKeystoneDeg} onChange={e => setReqVKeystoneDeg(Number(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Uygulanan Yatay Keystone (°)
                  <input type="number" step="1" value={reqHKeystoneDeg} onChange={e => setReqHKeystoneDeg(Number(e.target.value) || 0)} />
                </label>
              </div>
              <div style={{ fontSize: 11, color: '#fcd34d', marginTop: 6 }}>
                Korunan Efektif Piksel Oranı: <b>%{projectorResult.keystoneAnalysis.estimatedEffectivePixelKeepPct}</b>
              </div>
            </div>
          </div>

          {/* Zoom Tutarlılığı & Kullanılan Formüller */}
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="card">
              <h4 style={{ marginTop: 0, fontSize: 13, color: '#38bdf8' }}>
                🔍 Zoom Oranı ve Odak Uzaklığı Tutarlılık Analizi
              </h4>
              <p style={{ fontSize: 12, color: '#cbd5e1' }}>{projectorResult.zoomConsistency.summaryTr}</p>
              <div style={{ fontSize: 12, color: '#94a3b8', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>TR_max / TR_min: <b>{fmtVal(projectorResult.zoomConsistency.trZoomRatio, 4, 'x')}</b></div>
                <div>f_max / f_min: <b>{fmtVal(projectorResult.zoomConsistency.focalZoomRatio, 4, 'x')}</b></div>
                <div>Belirtilen Zoom: <b>{fmtVal(projectorResult.zoomConsistency.statedZoomRatio, 2, 'x')}</b></div>
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginTop: 0, fontSize: 13, color: '#38bdf8' }}>
                🧮 Kullanılan Matematiksel Formüller & Yerine Koyma
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {projectorResult.formulasUsed.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, background: '#0b1120', padding: '6px 10px', borderRadius: 6 }}>
                    <b style={{ color: '#e2e8f0' }}>{f.name}:</b>{' '}
                    <code style={{ color: '#38bdf8' }}>{f.expression}</code> →{' '}
                    <span style={{ color: '#a7f3d0' }}>{f.substitution}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
          SEKME 3: KAMERA FOV, OPTİK/DİJİTAL ZOOM VE DİSTORSİYON MOTORU (BÖLÜM 4)
         ========================================================================== */}
      {activeTab === 'CAMERA_OPTICS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: 15, color: '#34d399' }}>
              FOV Kamera Optik Hesaplama Motoru (HFOV / VFOV / DFOV, Optik vs Dijital Zoom, Distorsiyon Ayrımı)
            </h3>
            <div className="grid-3" style={{ gap: 12 }}>
              <label>
                Hedef Nesne / Sahne Mesafesi D (m)
                <input
                  type="number"
                  step="0.2"
                  value={camTargetDistM}
                  onChange={e => setCamTargetDistM(Math.max(0.2, Number(e.target.value) || 0.2))}
                />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Seçili birim: {formatLengthWithUnit(camTargetDistM, unit, 2)}
                </span>
              </label>

              <label>
                Optik Odak Uzaklığı f (mm): {selectedFocalMm ?? activeCamera.lens.focalLengthMm ?? activeCamera.lens.focalLengthMinMm ?? 'UNKNOWN'} mm
                <input
                  type="range"
                  min={activeCamera.lens.focalLengthMinMm ?? 2.8}
                  max={activeCamera.lens.focalLengthMaxMm ?? 50}
                  step="0.2"
                  value={
                    selectedFocalMm ??
                    activeCamera.lens.focalLengthMm ??
                    activeCamera.lens.focalLengthMinMm ??
                    24
                  }
                  onChange={e => setSelectedFocalMm(Number(e.target.value))}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                  <span>Wide (f_min): {activeCamera.lens.focalLengthMinMm ?? 'UNKNOWN'} mm</span>
                  <span>Tele (f_max): {activeCamera.lens.focalLengthMaxMm ?? 'UNKNOWN'} mm</span>
                </div>
              </label>

              <label>
                Dijital Zoom Çarpanı (Optik Zoomdan Ayrı!): {digitalZoomFactor.toFixed(2)}x
                <input
                  type="range"
                  min={1.0}
                  max={4.0}
                  step={0.1}
                  value={digitalZoomFactor}
                  onChange={e => setDigitalZoomFactor(Number(e.target.value))}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                  <span>1.0x (Kayıpsız Optik)</span>
                  <button className="secondary" style={{ padding: '0 6px', fontSize: 10 }} onClick={() => setDigitalZoomFactor(1.0)}>
                    Sıfırla (1.0x)
                  </button>
                  <span>4.0x (Dijital Kırpma)</span>
                </div>
              </label>
            </div>
          </div>

          {/* Kamera FOV Sonuç Kartları */}
          <div className="grid-4" style={{ gap: 12 }}>
            <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>İDEAL REKTİLİNEER FOV AÇILARI</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', margin: '4px 0' }}>
                HFOV: {fmtVal(cameraResult.rectilinearHfovDeg, 2, '°')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                VFOV: <b>{fmtVal(cameraResult.rectilinearVfovDeg, 2, '°')}</b> · DFOV: <b>{fmtVal(cameraResult.rectilinearDfovDeg, 2, '°')}</b>
                <br />
                Sensör: <b>{fmtVal(cameraResult.effectiveSensorWidthMm, 2, 'mm')} × {fmtVal(cameraResult.effectiveSensorHeightMm, 2, 'mm')}</b>
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #38bdf8' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>
                SAHNE KAPSAMA GENİŞLİĞİ (D = {camTargetDistM} m)
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', margin: '4px 0' }}>
                W: {formatLengthWithUnit(cameraResult.horizontalCoverageM, unit, 3)}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                Dikey Kapsama (H): <b>{formatLengthWithUnit(cameraResult.verticalCoverageM, unit, 3)}</b>
                <br />
                Diyagonal Kapsama: <b>{formatLengthWithUnit(cameraResult.diagonalCoverageM, unit, 3)}</b>
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>DİSTORSİYON KALİBRELİ GERÇEK FOV</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', margin: '4px 0' }}>
                HFOV_dist: {fmtVal(cameraResult.calibratedHfovDeg, 2, '°')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                VFOV_dist: <b>{fmtVal(cameraResult.calibratedVfovDeg, 2, '°')}</b>
                <br />
                Distorsiyon: <b>%{cameraResult.distortionPct ?? 0}</b>
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #a855f7' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>OPTİK VS DİJİTAL ZOOM & ÇÖZÜNÜRLÜK</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', margin: '4px 0' }}>
                {cameraResult.effectiveResolutionAfterDigitalZoom
                  ? `${cameraResult.effectiveResolutionAfterDigitalZoom.w} × ${cameraResult.effectiveResolutionAfterDigitalZoom.h} px`
                  : 'UNKNOWN'}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                Dijital Zoom HFOV: <b>{fmtVal(cameraResult.digitalCroppedHfovDeg, 2, '°')}</b>
                <br />
                Dijital Zoom Çarpanı: <b>{cameraResult.digitalZoomFactor.toFixed(2)}x</b>
              </div>
            </div>
          </div>

          {/* Mesafeye Göre Görüş Alanı Tablosu */}
          <div className="card">
            <h4 style={{ marginTop: 0, fontSize: 14, color: '#34d399' }}>
              📊 Mesafeye Göre Kamera Görüş Alanı (Coverage) ve Piksel Yoğunluğu (PPM) Tablosu
            </h4>
            <table>
              <thead>
                <tr>
                  <th>Mesafe (D)</th>
                  <th>Yatay Görüş Genişliği (2·D·tan(HFOV/2))</th>
                  <th>Dikey Görüş Yüksekliği (2·D·tan(VFOV/2))</th>
                  <th>Diyagonal Kapsama</th>
                  <th>Yatay Piksel Yoğunluğu (px/m - PPM)</th>
                </tr>
              </thead>
              <tbody>
                {cameraResult.distanceTable.map((r, i) => (
                  <tr key={i}>
                    <td><b>{formatLengthWithUnit(r.distanceM, unit, 2)}</b></td>
                    <td>{formatLengthWithUnit(r.horizontalCoverageM, unit, 3)}</td>
                    <td>{formatLengthWithUnit(r.verticalCoverageM, unit, 3)}</td>
                    <td>{formatLengthWithUnit(r.diagonalCoverageM, unit, 3)}</td>
                    <td>{fmtVal(r.pixelsPerMeterH, 1, 'px/m')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==========================================================================
          SEKME 4: ORTAK 3B & 2B MEKAN YERLEŞİMİ VE 9-MADDELİ FİZİKSEL UYGUNLUK (BÖLÜM 5 & 7)
         ========================================================================== */}
      {activeTab === 'SHARED_3D_COMPLIANCE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="grid-3" style={{ gap: 12 }}>
            <div className="card">
              <h4 style={{ marginTop: 0, fontSize: 13, color: '#94a3b8' }}>🏛️ Mekan & Hedef Yüzey (Duvar/Perde)</h4>
              <div className="grid-3" style={{ gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  Oda Genişlik (m)
                  <input type="number" step="0.2" value={roomWidthM} onChange={e => setRoomWidthM(Number(e.target.value) || 4)} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Oda Derinlik (m)
                  <input type="number" step="0.2" value={roomLengthM} onChange={e => setRoomLengthM(Number(e.target.value) || 4)} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Tavan Yüks. (m)
                  <input type="number" step="0.1" value={roomHeightM} onChange={e => setRoomHeightM(Number(e.target.value) || 2.5)} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Perde Genişlik (m)
                  <input type="number" step="0.1" value={surfWidthM} onChange={e => setSurfWidthM(Number(e.target.value) || 2)} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Perde Yükseklik (m)
                  <input type="number" step="0.1" value={surfHeightM} onChange={e => setSurfHeightM(Number(e.target.value) || 1.5)} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Perde Alt Kot (m)
                  <input type="number" step="0.05" value={surfBottomM} onChange={e => setSurfBottomM(Number(e.target.value) || 0)} />
                </label>
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginTop: 0, fontSize: 13, color: '#38bdf8' }}>📽️ Projektör 3B Konumu & Açı</h4>
              <div className="grid-3" style={{ gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  X (Yatay m)
                  <input type="number" step="0.1" value={pjPos[0]} onChange={e => setPjPos([Number(e.target.value) || 0, pjPos[1], pjPos[2]])} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Y (Yükseklik m)
                  <input type="number" step="0.05" value={pjPos[1]} onChange={e => setPjPos([pjPos[0], Number(e.target.value) || 0, pjPos[2]])} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Z (Mesafe m)
                  <input
                    type="number"
                    step="0.1"
                    value={pjPos[2]}
                    onChange={e => {
                      const z = Math.max(0.5, Number(e.target.value) || 1);
                      setPjPos([pjPos[0], pjPos[1], z]);
                      setThrowDistM(z);
                    }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  Yaw (°)
                  <input type="number" step="1" value={pjYawDeg} onChange={e => setPjYawDeg(Number(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Pitch (°)
                  <input type="number" step="1" value={pjPitchDeg} onChange={e => setPjPitchDeg(Number(e.target.value) || 0)} />
                </label>
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginTop: 0, fontSize: 13, color: '#34d399' }}>📷 Kamera 3B Konumu & Engel</h4>
              <div className="grid-3" style={{ gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  Kamera X (m)
                  <input type="number" step="0.1" value={camPos[0]} onChange={e => setCamPos([Number(e.target.value) || 0, camPos[1], camPos[2]])} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Kamera Y (m)
                  <input type="number" step="0.05" value={camPos[1]} onChange={e => setCamPos([camPos[0], Number(e.target.value) || 0, camPos[2]])} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Kamera Z (m)
                  <input
                    type="number"
                    step="0.1"
                    value={camPos[2]}
                    onChange={e => {
                      const z = Math.max(0.5, Number(e.target.value) || 1);
                      setCamPos([camPos[0], camPos[1], z]);
                      setCamTargetDistM(z);
                    }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  Kamera Yaw (°)
                  <input type="number" step="1" value={camYawDeg} onChange={e => setCamYawDeg(Number(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Engel X (m)
                  <input type="number" step="0.1" value={obsPosX} onChange={e => setObsPosX(Number(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Engel Z (m)
                  <input type="number" step="0.1" value={obsPosZ} onChange={e => setObsPosZ(Number(e.target.value) || 1)} />
                </label>
              </div>
            </div>
          </div>

          {/* 3B Sahne + 2B Üstten Plan / Yandan Kesit */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                  🌐 Ortak 3B Mekan &amp; Optik Simülasyon
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Projektör Konisi (Mavi) · Kamera FOV (Yeşil) · Cihazları fare ile sürükleyebilirsiniz
                </span>
              </div>

              {/* 3B Kamera Açı Butonları & Tam Oturt */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setStudioCameraPreset('fit')}
                  style={{ fontSize: 11, padding: '3px 8px', background: '#0284c7', color: '#fff', fontWeight: 'bold' }}
                >
                  🎯 Ekrana Tam Oturt
                </button>
                <button type="button" className="secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setStudioCameraPreset('iso')}>
                  Perspektif
                </button>
                <button type="button" className="secondary" style={{ fontSize: 11, padding: '3px 8px', color: '#34d399' }} onClick={() => setStudioCameraPreset('top')}>
                  Üstten
                </button>
                <button type="button" className="secondary" style={{ fontSize: 11, padding: '3px 8px', color: '#c084fc' }} onClick={() => setStudioCameraPreset('bottom')}>
                  Alttan
                </button>
                <button type="button" className="secondary" style={{ fontSize: 11, padding: '3px 8px', color: '#f59e0b' }} onClick={() => setStudioCameraPreset('side')}>
                  Yandan (Sağ)
                </button>
                <button type="button" className="secondary" style={{ fontSize: 11, padding: '3px 8px', color: '#fcd34d' }} onClick={() => setStudioCameraPreset('left')}>
                  Yandan (Sol)
                </button>
                <button type="button" className="secondary" style={{ fontSize: 11, padding: '3px 8px', color: '#38bdf8' }} onClick={() => setStudioCameraPreset('front')}>
                  Perde Önü
                </button>
              </div>
            </div>

            {/* RAPORA AÇILARI AYRI AYRI EKLEME / SİLME ÇUBUĞU */}
            <div style={{ background: '#070b14', border: '1px solid #1e293b', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8' }}>
                  📸 Rapora Açıyı Ayrı Ayrı Ekle / Sil:
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="secondary" style={{ fontSize: 11, padding: '2px 7px', color: '#34d399' }} onClick={() => addStudioViewToReport('top', 'Üstten Plan Görünümü')}>
                    + ⬆️ Üstten Ekle
                  </button>
                  <button type="button" className="secondary" style={{ fontSize: 11, padding: '2px 7px', color: '#c084fc' }} onClick={() => addStudioViewToReport('bottom', 'Alttan Tavan Görünümü')}>
                    + ⬇️ Alttan Ekle
                  </button>
                  <button type="button" className="secondary" style={{ fontSize: 11, padding: '2px 7px', color: '#f59e0b' }} onClick={() => addStudioViewToReport('side', 'Yandan Sağ Kesit')}>
                    + ➡️ Yandan Ekle
                  </button>
                  <button type="button" className="secondary" style={{ fontSize: 11, padding: '2px 7px', color: '#38bdf8' }} onClick={() => addStudioViewToReport('front', 'Perde Önü Görünüm')}>
                    + 🖥️ Önden Ekle
                  </button>
                  <button type="button" className="secondary" style={{ fontSize: 11, padding: '2px 7px', color: '#fff' }} onClick={() => addStudioViewToReport('iso', '3B İzometrik Perspektif')}>
                    + 🧊 3B Perspektif Ekle
                  </button>
                </div>
              </div>

              {studioCapturedViews.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTop: '1px solid #1e293b' }}>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>Eklenen Görünümler:</span>
                  {studioCapturedViews.map(v => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 10 }}>
                      <span style={{ color: '#e2e8f0' }}>{v.label}</span>
                      <button
                        type="button"
                        onClick={() => removeStudioView(v.id)}
                        style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}
                        title="Rapordan Sil"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setStudioCapturedViews([]);
                      showToast('Tüm açılar rapordan temizlendi.');
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 10, textDecoration: 'underline', cursor: 'pointer', marginLeft: 'auto' }}
                  >
                    Tümünü Temizle
                  </button>
                </div>
              )}
            </div>

            {/* 3B Viewport: Tam Ekran Genişliği ve Yüksekliği ile ekrana tam oturur */}
            <div style={{ height: 520, background: '#020617', borderRadius: 8, overflow: 'hidden', border: '1px solid #1e293b' }}>
              <Canvas
                camera={{
                  position: [Math.max(3.6, roomWidthM * 0.55), Math.max(2.8, roomHeightM * 0.85), Math.max(5.5, Math.max(pjPos[2], camPos[2]) * 1.05)],
                  fov: 36,
                }}
                gl={{ preserveDrawingBuffer: true, antialias: true }}
                onCreated={({ gl, scene, camera }) => {
                  studioGlRef.current = gl;
                  studioSceneRef.current = scene;
                  studioCameraRef.current = camera as THREE.PerspectiveCamera;
                }}
              >
                <SharedOpticalRoom3DScene
                  input={complianceInput}
                  projImageW={proj3DImageW}
                  projImageH={proj3DImageH}
                  projImageBottomY={proj3DBottomY}
                  camCoverageW={cam3DCovW}
                  camCoverageH={cam3DCovH}
                  onDragDevice={(which, pos) => {
                    if (which === 'PROJECTOR') {
                      setPjPos(pos);
                      setThrowDistM(pos[2]);
                    } else if (which === 'CAMERA') {
                      setCamPos(pos);
                      setCamTargetDistM(pos[2]);
                    } else if (which === 'OBSTACLE') {
                      setObsPosX(pos[0]);
                      setObsPosZ(pos[2]);
                    }
                  }}
                />
              </Canvas>
            </div>
          </div>

          {/* 2B Plan ve Kesit Görünümleri */}
          <div className="grid-2" style={{ gap: 14 }}>
              <div className="card" style={{ padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
                  📐 2B Üstten Plan Görünümü (Top View — Projektör Işık & Kamera FOV Kesişimi)
                </div>
                <svg viewBox="0 0 460 175" style={{ width: '100%', height: 170, background: '#090d16', borderRadius: 6 }}>
                  {(() => {
                    const pad = 22;
                    const wPx = 460 - pad * 2;
                    const hPx = 175 - pad * 2;
                    const sx = (z: number) => pad + (z / Math.max(1, roomLengthM)) * wPx;
                    const sy = (x: number) => pad + ((x + roomWidthM / 2) / Math.max(1, roomWidthM)) * hPx;

                    const pjX = sx(pjPos[2]);
                    const pjY = sy(pjPos[0]);
                    const camX = sx(camPos[2]);
                    const camY = sy(camPos[0]);

                    const pjHalfW = proj3DImageW / 2;
                    const camHalfW = cam3DCovW / 2;

                    return (
                      <>
                        <rect x={pad} y={pad} width={wPx} height={hPx} fill="#0f172a" stroke="#334155" strokeWidth={1.5} />
                        <line x1={pad} y1={sy(-surfWidthM / 2)} x2={pad} y2={sy(surfWidthM / 2)} stroke="#f8fafc" strokeWidth={4} />
                        <polygon
                          points={`${pjX},${pjY} ${pad},${sy(pjPos[0] - pjHalfW)} ${pad},${sy(pjPos[0] + pjHalfW)}`}
                          fill="rgba(56,189,248,0.22)"
                          stroke="#38bdf8"
                          strokeWidth={1.5}
                        />
                        <polygon
                          points={`${camX},${camY} ${pad},${sy(camPos[0] - camHalfW)} ${pad},${sy(camPos[0] + camHalfW)}`}
                          fill="rgba(16,185,129,0.18)"
                          stroke="#10b981"
                          strokeWidth={1.5}
                          strokeDasharray="4 2"
                        />
                        {obsEnabled && <circle cx={sx(obsPosZ)} cy={sy(obsPosX)} r={7} fill="#f59e0b" stroke="#fff" strokeWidth={1} />}
                        <rect x={pjX - 6} y={pjY - 5} width={12} height={10} fill="#0284c7" stroke="#fff" />
                        <text x={pjX + 8} y={pjY + 3} fill="#38bdf8" fontSize={9} fontWeight="bold">
                          PJ ({pjPos[2].toFixed(1)}m)
                        </text>
                        <circle cx={camX} cy={camY} r={5} fill="#059669" stroke="#fff" />
                        <text x={camX + 8} y={camY + 3} fill="#34d399" fontSize={9} fontWeight="bold">
                          CAM ({camPos[2].toFixed(1)}m)
                        </text>
                      </>
                    );
                  })()}
                </svg>
              </div>

              <div className="card" style={{ padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#a855f7', marginBottom: 4 }}>
                  📏 2B Yandan Kesit Görünümü (Side Section — Optik Offset, Tavan & Zemin Sınırları)
                </div>
                <svg viewBox="0 0 460 175" style={{ width: '100%', height: 170, background: '#090d16', borderRadius: 6 }}>
                  {(() => {
                    const pad = 24;
                    const wPx = 460 - pad * 2;
                    const hPx = 175 - pad * 2;
                    const sx = (z: number) => pad + (z / Math.max(1, roomLengthM)) * wPx;
                    const sy = (y: number) => pad + hPx - (y / Math.max(1, roomHeightM)) * hPx;

                    const pjX = sx(pjPos[2]);
                    const pjY = sy(pjPos[1]);
                    const camX = sx(camPos[2]);
                    const camY = sy(camPos[1]);

                    const imgBotY = sy(proj3DBottomY);
                    const imgTopY = sy(proj3DBottomY + proj3DImageH);

                    return (
                      <>
                        <rect x={pad} y={pad} width={wPx} height={hPx} fill="#0f172a" stroke="#334155" strokeWidth={1.5} />
                        <line x1={pad} y1={sy(surfBottomM)} x2={pad} y2={sy(surfBottomM + surfHeightM)} stroke="#f8fafc" strokeWidth={4} />
                        <polygon
                          points={`${pjX},${pjY} ${pad},${imgBotY} ${pad},${imgTopY}`}
                          fill="rgba(56,189,248,0.24)"
                          stroke="#38bdf8"
                          strokeWidth={1.5}
                        />
                        <line x1={pjX} y1={pjY} x2={pad} y2={pjY} stroke="#fbbf24" strokeWidth={1.2} strokeDasharray="3 3" />
                        <polygon
                          points={`${camX},${camY} ${pad},${sy(camPos[1] - cam3DCovH / 2)} ${pad},${sy(camPos[1] + cam3DCovH / 2)}`}
                          fill="rgba(16,185,129,0.16)"
                          stroke="#10b981"
                          strokeWidth={1.2}
                          strokeDasharray="4 2"
                        />
                        {obsEnabled && (
                          <rect x={sx(obsPosZ) - 4} y={sy(obsHeightM)} width={8} height={sy(0) - sy(obsHeightM)} fill="#f59e0b" />
                        )}
                        <rect x={pjX - 6} y={pjY - 4} width={12} height={8} fill="#0284c7" stroke="#fff" />
                        <text x={pjX + 8} y={pjY + 3} fill="#fbbf24" fontSize={9}>
                          Lens Y={pjPos[1].toFixed(2)}m
                        </text>
                        <circle cx={camX} cy={camY} r={4.5} fill="#059669" stroke="#fff" />
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>

          {/* BÖLÜM 7: 9-MADDELİ FİZİKSEL UYGUNLUK KONTROL TABLOSU */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: '#f8fafc' }}>
                🛡️ Bölüm 7: Fiziksel Yerleşim ve Optik Uygunluk Denetimi (9 Zorunlu Mühendislik Kontrolü)
              </h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#6ee7b7' }}>PASS: {complianceReport.counts.pass}</span>
                <span style={{ fontSize: 12, color: '#fcd34d' }}>WARNING: {complianceReport.counts.warning}</span>
                <span style={{ fontSize: 12, color: '#fca5a5' }}>FAIL: {complianceReport.counts.fail}</span>
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>UNKNOWN: {complianceReport.counts.unknown}</span>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 800,
                    background: STATUS_BADGE[complianceReport.overallStatus].bg,
                    border: `1px solid ${STATUS_BADGE[complianceReport.overallStatus].border}`,
                    color: STATUS_BADGE[complianceReport.overallStatus].text,
                  }}
                >
                  GENEL DURUM: {STATUS_BADGE[complianceReport.overallStatus].label}
                </span>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Kontrol Kalemi</th>
                  <th>Durum</th>
                  <th>Hesaplanan / Ölçülen</th>
                  <th>Sınır / Kriter</th>
                  <th>Mühendislik Açıklaması</th>
                </tr>
              </thead>
              <tbody>
                {complianceReport.checks.map(chk => {
                  const st = STATUS_BADGE[chk.status];
                  return (
                    <tr key={chk.id}>
                      <td><code>{chk.id}</code></td>
                      <td><b>{chk.titleTr}</b></td>
                      <td>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background: st.bg,
                            border: `1px solid ${st.border}`,
                            color: st.text,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {chk.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{chk.measuredOrCalculatedValue}</td>
                      <td style={{ fontSize: 12 }}>{chk.limitOrRequirement}</td>
                      <td style={{ fontSize: 12, color: '#cbd5e1' }}>{chk.detailTr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
