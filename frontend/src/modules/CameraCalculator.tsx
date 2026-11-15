import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, Line, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { focalForFraming, framing, visibleSize } from '../engine/camera';
import {
  computeCameraFov,
  computeFovShadowAnalysis,
  computeFovSurfaceProjection,
  computeProjectorFov,
  computeSurfaceFov,
  computeViewerFov,
  FovShadowResult,
  OpticalDeviceKind,
  SCANNER_3D_PRESETS,
  VR_SYSTEM_PRESETS,
} from '../engine/fovProjection';
import { LengthUnit, fromMeters, toMeters, round } from '../engine/units';

const SENSORS: Record<string, [number, number]> = {
  '35 mm tam kare (36×24)': [36, 24],
  'Süper 35 (24.89×18.66)': [24.89, 18.66],
  'APS-C (23.5×15.6)': [23.5, 15.6],
  '1" (13.2×8.8)': [13.2, 8.8],
  'Özel': [0, 0],
};

const ASPECT_PRESETS: Record<string, number> = {
  '16:9': 16 / 9,
  '16:10': 16 / 10,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
};

function FovFrustum3DScene({
  pos,
  surfW,
  surfH,
  corners3D,
  activeCorners3D,
  hasDigitalKeystone,
  centerHit2D,
  isFullCovered,
  deviceKind,
  yawDeg,
  pitchDeg,
  rollDeg,
  isPortrait,
  showPerson,
  showLabels = true,
  shadow,
}: {
  pos: [number, number, number];
  surfW: number;
  surfH: number;
  corners3D: [number, number, number][];
  activeCorners3D: [number, number, number][];
  hasDigitalKeystone: boolean;
  centerHit2D: [number, number] | null;
  isFullCovered: boolean;
  deviceKind: OpticalDeviceKind;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  isPortrait: boolean;
  showPerson: boolean;
  showLabels?: boolean;
  shadow: FovShadowResult;
}) {
  const deviceQuat = useMemo(() => {
    const euler = new THREE.Euler(
      (pitchDeg * Math.PI) / 180,
      (-yawDeg * Math.PI) / 180,
      ((rollDeg + (isPortrait ? 90 : 0)) * Math.PI) / 180,
      'YXZ'
    );
    return new THREE.Quaternion().setFromEuler(euler);
  }, [yawDeg, pitchDeg, rollDeg, isPortrait]);

  const { coneGeo, footprintGeo, edgeLoop, activeEdgeLoop, rayLines } = useMemo(() => {
    const p = new THREE.Vector3(...pos);
    const pts = corners3D.map(c => new THREE.Vector3(c[0], c[1], c[2] + 0.015));
    const aPts = activeCorners3D.map(c => new THREE.Vector3(c[0], c[1], c[2] + 0.02));
    const coneVerts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      coneVerts.push(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.Float32BufferAttribute(coneVerts, 3));
    cGeo.computeVertexNormals();

    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          aPts[0].x, aPts[0].y, aPts[0].z,
          aPts[1].x, aPts[1].y, aPts[1].z,
          aPts[2].x, aPts[2].y, aPts[2].z,
          aPts[0].x, aPts[0].y, aPts[0].z,
          aPts[2].x, aPts[2].y, aPts[2].z,
          aPts[3].x, aPts[3].y, aPts[3].z,
        ],
        3
      )
    );
    fGeo.computeVertexNormals();

    const loop: [number, number, number][] = [
      [pts[0].x, pts[0].y, pts[0].z + 0.005],
      [pts[1].x, pts[1].y, pts[1].z + 0.005],
      [pts[2].x, pts[2].y, pts[2].z + 0.005],
      [pts[3].x, pts[3].y, pts[3].z + 0.005],
      [pts[0].x, pts[0].y, pts[0].z + 0.005],
    ];
    const activeLoop: [number, number, number][] = [
      [aPts[0].x, aPts[0].y, aPts[0].z + 0.006],
      [aPts[1].x, aPts[1].y, aPts[1].z + 0.006],
      [aPts[2].x, aPts[2].y, aPts[2].z + 0.006],
      [aPts[3].x, aPts[3].y, aPts[3].z + 0.006],
      [aPts[0].x, aPts[0].y, aPts[0].z + 0.006],
    ];
    const rays: [[number, number, number], [number, number, number]][] = pts.map(pt => [
      pos,
      [pt.x, pt.y, pt.z],
    ]);

    return { coneGeo: cGeo, footprintGeo: fGeo, edgeLoop: loop, activeEdgeLoop: activeLoop, rayLines: rays };
  }, [pos, corners3D, activeCorners3D]);

  const accent = isFullCovered ? '#22c55e' : '#f59e0b';
  const deviceColor =
    deviceKind === 'projector'
      ? '#38bdf8'
      : deviceKind === 'camera'
      ? '#f472b6'
      : deviceKind === 'scanner3d'
      ? '#a855f7'
      : '#10b981';

  const deviceTitle =
    deviceKind === 'projector'
      ? `📽️ Projektör${isPortrait ? ' (Dikey)' : ''}`
      : deviceKind === 'camera'
      ? '📷 Kamera'
      : deviceKind === 'scanner3d'
      ? '📡 3D Tarayıcı'
      : '🥽 VR Sistemi';

  const zCrit = Math.max(0, Math.min(pos[2], shadow.shadowEntryDistFromScreenM));
  const safeSpanZ = Math.max(0, pos[2] - zCrit);

  // Perde üzerindeki gerçekçi insan gölgesi (THREE.ShapeGeometry) ve dış kontur çizgisi
  const { humanShadowShapeGeo, humanShadowLoop, floorShadowShapeGeo } = useMemo(() => {
    let wallGeo: THREE.ShapeGeometry | null = null;
    let wallLoop: [number, number, number][] = [];
    if (shadow.isCastingShadow && shadow.shadowPolygonScene2D && shadow.shadowPolygonScene2D.length >= 3) {
      const shape = new THREE.Shape();
      shadow.shadowPolygonScene2D.forEach(([x, y], idx) => {
        if (idx === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      shape.closePath();
      wallGeo = new THREE.ShapeGeometry(shape);
      wallLoop = [
        ...shadow.shadowPolygonScene2D.map(([x, y]) => [x, y, 0.029] as [number, number, number]),
        [shadow.shadowPolygonScene2D[0][0], shadow.shadowPolygonScene2D[0][1], 0.029],
      ];
    }

    // Zeminde insandan perdeye doğru uzanan gerçekçi insan gölgesi formu
    let flGeo: THREE.ShapeGeometry | null = null;
    if (shadow.isCastingShadow && shadow.personDistFromScreenM > 0.08) {
      const w0 = shadow.personWidthM;
      const w1 = Math.max(w0 * 1.1, Math.min(surfW, shadow.shadowWidthM || w0 * 1.25));
      const len = shadow.personDistFromScreenM;
      const flShape = new THREE.Shape();
      // Ayaklardan (y=0) perdeye (y=len) uzanan omuz/baş daralmalı insan gölge izdüşümü
      flShape.moveTo(-w0 * 0.22, 0);
      flShape.lineTo(-w0 * 0.42, len * 0.45);
      flShape.lineTo(-w1 * 0.48, len * 0.82);
      flShape.lineTo(-w1 * 0.22, len);
      flShape.lineTo(w1 * 0.22, len);
      flShape.lineTo(w1 * 0.48, len * 0.82);
      flShape.lineTo(w0 * 0.42, len * 0.45);
      flShape.lineTo(w0 * 0.22, 0);
      flShape.closePath();
      flGeo = new THREE.ShapeGeometry(flShape);
    }

    return { humanShadowShapeGeo: wallGeo, humanShadowLoop: wallLoop, floorShadowShapeGeo: flGeo };
  }, [shadow.isCastingShadow, shadow.shadowPolygonScene2D, shadow.personDistFromScreenM, shadow.personWidthM, shadow.shadowWidthM, surfW]);

  const pH = shadow.personHeightM;
  const pW = shadow.personWidthM;
  const jacketColor = shadow.isCastingShadow ? '#e11d48' : '#059669';
  const jacketEmissive = shadow.isCastingShadow ? '#be123c' : '#047857';

  return (
    <>
      <ambientLight intensity={0.78} />
      <directionalLight position={[6, 10, 8]} intensity={0.9} />
      <Grid
        args={[26, 26]}
        position={[0, shadow.floorSceneY, 0]}
        cellSize={0.5}
        cellColor="#1e293b"
        sectionSize={2}
        sectionColor="#334155"
      />

      {/* Perde Yerden Yüksekteyse: Perde Altı Duvar / Sahne Eteği ve Yükseklik Ölçüsü */}
      {shadow.screenBottomHeightM > 0.01 && (
        <group>
          <mesh position={[0, -surfH / 2 - shadow.screenBottomHeightM / 2, -0.008]}>
            <planeGeometry args={[surfW, shadow.screenBottomHeightM]} />
            <meshStandardMaterial color="#0f172a" roughness={0.9} transparent opacity={0.78} side={THREE.DoubleSide} />
          </mesh>
          <Line
            points={[
              [-surfW / 2, shadow.floorSceneY, 0.005],
              [surfW / 2, shadow.floorSceneY, 0.005],
              [surfW / 2, -surfH / 2, 0.005],
              [-surfW / 2, -surfH / 2, 0.005],
              [-surfW / 2, shadow.floorSceneY, 0.005],
            ]}
            color="#64748b"
            lineWidth={1.5}
            dashed
            dashSize={0.14}
            gapSize={0.1}
          />
          {/* Sol kenarda Perde Yerden Başlangıç Yüksekliği ölçü dikmesi */}
          <Line
            points={[
              [-surfW / 2 - 0.28, shadow.floorSceneY, 0.01],
              [-surfW / 2 - 0.28, -surfH / 2, 0.01],
            ]}
            color="#38bdf8"
            lineWidth={2}
          />
          <Line
            points={[
              [-surfW / 2 - 0.36, shadow.floorSceneY, 0.01],
              [-surfW / 2 - 0.2, shadow.floorSceneY, 0.01],
            ]}
            color="#38bdf8"
            lineWidth={2}
          />
          <Line
            points={[
              [-surfW / 2 - 0.36, -surfH / 2, 0.01],
              [-surfW / 2 - 0.2, -surfH / 2, 0.01],
            ]}
            color="#38bdf8"
            lineWidth={2}
          />
          {showLabels && (
            <Text
              position={[-surfW / 2 - 0.38, -surfH / 2 - shadow.screenBottomHeightM / 2, 0.02]}
              fontSize={0.135}
              color="#7dd3fc"
              anchorX="right"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#020617"
            >
              {`↕ Perde Yerden Yüksekliği\n+${shadow.screenBottomHeightM.toFixed(2)}m (Üst: ${(shadow.screenBottomHeightM + surfH).toFixed(2)}m)`}
            </Text>
          )}
        </group>
      )}

      {/* Hedef Yüzey Düzlemi */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[surfW, surfH]} />
        <meshStandardMaterial color="#1e293b" side={THREE.DoubleSide} />
      </mesh>
      <Line
        points={[
          [-surfW / 2, surfH / 2, 0.01],
          [surfW / 2, surfH / 2, 0.01],
          [surfW / 2, -surfH / 2, 0.01],
          [-surfW / 2, -surfH / 2, 0.01],
          [-surfW / 2, surfH / 2, 0.01],
        ]}
        color="#f8fafc"
        lineWidth={2.2}
      />
      {showLabels && (
        <>
          <Line
            points={[
              [0, surfH / 2, 0.02],
              [0, surfH / 2 + 0.28, 0.02],
            ]}
            color="#94a3b8"
            lineWidth={1.2}
          />
          <Text
            position={[0, surfH / 2 + 0.34, 0.02]}
            fontSize={0.19}
            color="#f8fafc"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.024}
            outlineColor="#020617"
          >
            {`① HEDEF PERDE / YÜZEY (${surfW.toFixed(2)}m × ${surfH.toFixed(2)}m · Yerden: +${shadow.screenBottomHeightM.toFixed(2)}m)`}
          </Text>
        </>
      )}

      {/* Yarı Saydam 3B Görüş Konisi (FOV Frustum) */}
      <mesh geometry={coneGeo}>
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Köşe Işınları */}
      {rayLines.map((pts, i) => (
        <Line key={i} points={pts} color={accent} lineWidth={1.2} transparent opacity={0.75} />
      ))}

      {/* Merkez Optik Eksen Işını */}
      {centerHit2D && (
        <Line
          points={[pos, [centerHit2D[0], centerHit2D[1], 0.02]]}
          color="#38bdf8"
          lineWidth={1.6}
          dashed
          dashSize={0.18}
          gapSize={0.12}
        />
      )}

      {/* Yüzey Üzerindeki Gerçek Eğik İzdüşüm (Yamuk / Trapezoid + Keystone Aktif Alan) */}
      <mesh geometry={footprintGeo}>
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {hasDigitalKeystone ? (
        <>
          <Line points={edgeLoop} color="#94a3b8" lineWidth={1.3} dashed dashSize={0.14} gapSize={0.1} />
          <Line points={activeEdgeLoop} color={accent} lineWidth={2.4} />
        </>
      ) : (
        <Line points={edgeLoop} color={accent} lineWidth={2.2} />
      )}

      {/* Cihaz Gövdesi + Zemin Dikmesi */}
      <group position={pos} quaternion={deviceQuat}>
        <mesh>
          <boxGeometry args={[0.34, 0.16, 0.38]} />
          <meshStandardMaterial color={deviceColor} emissive={deviceColor} emissiveIntensity={0.28} />
        </mesh>
        <mesh position={[0, 0, -0.21]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.065, 0.08, 16]} />
          <meshStandardMaterial color="#0f172a" emissive={deviceColor} emissiveIntensity={0.5} />
        </mesh>
      </group>
      <Line
        points={[
          [pos[0], shadow.floorSceneY, pos[2]],
          [pos[0], pos[1], pos[2]],
        ]}
        color="#475569"
        lineWidth={1.2}
        dashed
        dashSize={0.16}
        gapSize={0.12}
      />
      {showLabels && (
        <Text
          position={[pos[0], pos[1] + 0.28, pos[2]]}
          fontSize={0.17}
          color={deviceColor}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.022}
          outlineColor="#020617"
        >
          {`④ ${deviceTitle} (Perdeye Z:${pos[2].toFixed(2)}m · Yerden Y:${shadow.deviceHeightFromFloorM.toFixed(2)}m)`}
        </Text>
      )}

      {/* İnsan Modeli, Zemin Bölgeleri, Kritik Gölge Sınır Bayrağı ve Perde Üzerindeki Gölge İzdüşümü */}
      {showPerson && (
        <>
          {/* Zeminde Renkli Bölge Halıları (Gölgeli Risk Bölgesi vs Gölgesiz Güvenli Bölge) */}
          {!shadow.neverCastsShadow && zCrit > 0.05 && (
            <group>
              {/* Kırmızı: Gölgeli Risk Bölgesi (0 -> zCrit) */}
              <mesh
                position={[0, shadow.floorSceneY + 0.006, zCrit / 2]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[surfW, zCrit]} />
                <meshBasicMaterial color="#ef4444" transparent opacity={0.13} side={THREE.DoubleSide} />
              </mesh>
              {showLabels && zCrit >= 0.6 && (
                <Text
                  position={[-surfW / 2 - 0.15, shadow.floorSceneY + 0.08, zCrit / 2]}
                  fontSize={0.13}
                  color="#fca5a5"
                  anchorX="right"
                  anchorY="middle"
                  outlineWidth={0.02}
                  outlineColor="#020617"
                >
                  {`🔴 GÖLGELİ RİSK BÖLGESİ\n(Perdeden 0 – ${zCrit.toFixed(2)}m)`}
                </Text>
              )}

              {/* Yeşil: Gölgesiz Güvenli Bölge (zCrit -> Cihaz) */}
              {safeSpanZ > 0.15 && (
                <>
                  <mesh
                    position={[0, shadow.floorSceneY + 0.006, zCrit + safeSpanZ / 2]}
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    <planeGeometry args={[surfW, safeSpanZ]} />
                    <meshBasicMaterial color="#10b981" transparent opacity={0.1} side={THREE.DoubleSide} />
                  </mesh>
                  {showLabels && safeSpanZ >= 0.6 && (
                    <Text
                      position={[-surfW / 2 - 0.15, shadow.floorSceneY + 0.08, zCrit + safeSpanZ / 2]}
                      fontSize={0.13}
                      color="#6ee7b7"
                      anchorX="right"
                      anchorY="middle"
                      outlineWidth={0.02}
                      outlineColor="#020617"
                    >
                      {`🟢 GÖLGESİZ GÜVENLİ BÖLGE\n(${zCrit.toFixed(2)} – ${pos[2].toFixed(2)}m)`}
                    </Text>
                  )}
                </>
              )}

              {/* Zeminde Kritik Gölge Başlangıç Çizgisi ve Sağ Kenar Dikmeli Bilgi Bayrağı */}
              <Line
                points={[
                  [-surfW / 2 - 0.45, shadow.floorSceneY + 0.015, zCrit],
                  [surfW / 2 + 0.55, shadow.floorSceneY + 0.015, zCrit],
                ]}
                color="#f59e0b"
                lineWidth={2.4}
                dashed
                dashSize={0.18}
                gapSize={0.1}
              />
              {showLabels && (
                <>
                  {/* Sağ kenarda dikme direği — diğer yazılarla çakışmayı önler */}
                  <Line
                    points={[
                      [surfW / 2 + 0.55, shadow.floorSceneY + 0.015, zCrit],
                      [surfW / 2 + 0.55, shadow.floorSceneY + 0.55, zCrit],
                    ]}
                    color="#f59e0b"
                    lineWidth={1.6}
                  />
                  <Text
                    position={[surfW / 2 + 0.62, shadow.floorSceneY + 0.55, zCrit]}
                    fontSize={0.145}
                    color="#fde047"
                    anchorX="left"
                    anchorY="middle"
                    outlineWidth={0.022}
                    outlineColor="#020617"
                  >
                    {`② KRİTİK GÖLGE BAŞLANGIÇ SINIRI\nPerdeden: ${shadow.shadowEntryDistFromScreenM.toFixed(2)}m | Cihazdan: ${shadow.shadowEntryDistFromDeviceM.toFixed(2)}m`}
                  </Text>
                </>
              )}
            </group>
          )}

          {/* Gerçekçi 3B Anatomik İnsan Modeli (Ayakkabı, Bacak, Kalça, Gövde, Omuz, Kollar/Eller, Boyun, Baş/Saç) */}
          <group position={[shadow.personXM, shadow.floorSceneY, shadow.personDistFromScreenM]}>
            {/* Zemindeki Dairesel Temas Halkası */}
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[Math.max(0.24, pW * 0.56), 28]} />
              <meshBasicMaterial color="#020617" transparent opacity={0.68} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[Math.max(0.22, pW * 0.52), Math.max(0.26, pW * 0.6), 32]} />
              <meshBasicMaterial color={shadow.isCastingShadow ? '#ef4444' : '#10b981'} side={THREE.DoubleSide} />
            </mesh>

            {/* Zeminde İnsandan Perdeye Uzanan İnsan Formlu Gölge */}
            {shadow.isCastingShadow && floorShadowShapeGeo && (
              <mesh
                position={[0, 0.009, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                geometry={floorShadowShapeGeo}
              >
                <meshBasicMaterial color="#020617" transparent opacity={0.62} side={THREE.DoubleSide} />
              </mesh>
            )}

            {/* Sol & Sağ Ayakkabı (Perdeye -Z yönüne doğru) */}
            <mesh position={[-pW * 0.19, pH * 0.026, -pW * 0.06]} rotation={[Math.PI / 2, 0, 0]}>
              <capsuleGeometry args={[pW * 0.085, pW * 0.22, 8, 14]} />
              <meshStandardMaterial color="#0f172a" roughness={0.5} />
            </mesh>
            <mesh position={[pW * 0.19, pH * 0.026, -pW * 0.06]} rotation={[Math.PI / 2, 0, 0]}>
              <capsuleGeometry args={[pW * 0.085, pW * 0.22, 8, 14]} />
              <meshStandardMaterial color="#0f172a" roughness={0.5} />
            </mesh>

            {/* Sol & Sağ Alt Bacak (Baldır) ve Üst Bacak (Uyluk) */}
            <mesh position={[-pW * 0.19, pH * 0.26, 0]}>
              <capsuleGeometry args={[pW * 0.115, Math.max(0.18, pH * 0.38), 10, 18]} />
              <meshStandardMaterial color="#1e293b" roughness={0.6} />
            </mesh>
            <mesh position={[pW * 0.19, pH * 0.26, 0]}>
              <capsuleGeometry args={[pW * 0.115, Math.max(0.18, pH * 0.38), 10, 18]} />
              <meshStandardMaterial color="#1e293b" roughness={0.6} />
            </mesh>

            {/* Kalça / Pelvis Kemeri */}
            <mesh position={[0, pH * 0.49, 0]} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[pH * 0.055, pW * 0.26, 10, 18]} />
              <meshStandardMaterial color="#1e293b" roughness={0.55} />
            </mesh>

            {/* Gövde / Ceket (Bel -> Göğüs) */}
            <mesh position={[0, pH * 0.66, 0]}>
              <capsuleGeometry args={[pW * 0.27, Math.max(0.16, pH * 0.2), 12, 22]} />
              <meshStandardMaterial
                color={jacketColor}
                emissive={jacketEmissive}
                emissiveIntensity={0.28}
                roughness={0.42}
              />
            </mesh>

            {/* Yaka / Göğüs Detayı (Perdeye -Z yönüne bakan ön yüz) */}
            <mesh position={[0, pH * 0.75, -pW * 0.16]}>
              <sphereGeometry args={[pW * 0.13, 14, 14]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.4} />
            </mesh>

            {/* Yuvarlak Omuz Köprüsü */}
            <mesh position={[0, pH * 0.79, 0]} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[pH * 0.042, pW * 0.62, 10, 20]} />
              <meshStandardMaterial
                color={jacketColor}
                emissive={jacketEmissive}
                emissiveIntensity={0.25}
                roughness={0.42}
              />
            </mesh>

            {/* Sol & Sağ Kollar (Omuzdan Bel Hizasına Sarkan Anatomik Kollar) */}
            <mesh position={[-pW * 0.43, pH * 0.64, 0]} rotation={[0, 0, 0.08]}>
              <capsuleGeometry args={[pW * 0.082, Math.max(0.16, pH * 0.24), 10, 18]} />
              <meshStandardMaterial color={jacketColor} roughness={0.45} />
            </mesh>
            <mesh position={[pW * 0.43, pH * 0.64, 0]} rotation={[0, 0, -0.08]}>
              <capsuleGeometry args={[pW * 0.082, Math.max(0.16, pH * 0.24), 10, 18]} />
              <meshStandardMaterial color={jacketColor} roughness={0.45} />
            </mesh>

            {/* Sol & Sağ Eller */}
            <mesh position={[-pW * 0.46, pH * 0.485, 0]}>
              <sphereGeometry args={[pW * 0.082, 14, 14]} />
              <meshStandardMaterial color="#f1c27d" roughness={0.5} />
            </mesh>
            <mesh position={[pW * 0.46, pH * 0.485, 0]}>
              <sphereGeometry args={[pW * 0.082, 14, 14]} />
              <meshStandardMaterial color="#f1c27d" roughness={0.5} />
            </mesh>

            {/* Boyun */}
            <mesh position={[0, pH * 0.855, 0]}>
              <cylinderGeometry args={[pW * 0.095, pW * 0.11, pH * 0.06, 16]} />
              <meshStandardMaterial color="#f1c27d" roughness={0.48} />
            </mesh>

            {/* Baş ve Saç */}
            <mesh position={[0, pH * 0.932, 0]}>
              <sphereGeometry args={[pH * 0.068, 24, 24]} />
              <meshStandardMaterial color="#f1c27d" roughness={0.45} />
            </mesh>
            <mesh position={[0, pH * 0.946, pH * 0.008]} rotation={[-0.18, 0, 0]}>
              <sphereGeometry args={[pH * 0.071, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
              <meshStandardMaterial color="#0f172a" roughness={0.75} />
            </mesh>

            {/* Baş Üstü İşaret Dikmesi ve Açıklayıcı Etiket */}
            {showLabels && (
              <>
                <Line
                  points={[
                    [0, pH + 0.02, 0],
                    [0, pH + 0.34, 0],
                  ]}
                  color={shadow.isCastingShadow ? '#f87171' : '#34d399'}
                  lineWidth={1.6}
                />
                <Text
                  position={[0, pH + 0.38, 0]}
                  fontSize={0.145}
                  color={shadow.isCastingShadow ? '#fecaca' : '#a7f3d0'}
                  anchorX="center"
                  anchorY="bottom"
                  outlineWidth={0.022}
                  outlineColor="#020617"
                >
                  {`③ İZLEYİCİ KONUMU (Boy: ${pH.toFixed(2)}m · Omuz: ${pW.toFixed(2)}m)\nPerdeye: ${shadow.personDistFromScreenM.toFixed(2)}m · Cihaza: ${shadow.personDistFromDeviceM.toFixed(2)}m · ${
                    shadow.isCastingShadow
                      ? `Işığa ${shadow.intrusionHeightM.toFixed(2)}m Giriyor`
                      : `Baş Üstü +${Math.max(0, shadow.headClearanceM).toFixed(2)}m Boşluk`
                  }`}
                </Text>
              </>
            )}
          </group>

          {/* Perde Üzerindeki Gerçekçi İnsan Gölgesi Silüeti, Ölçü Çerçevesi ve Gölge Işınları */}
          {shadow.isCastingShadow && shadow.shadowRect2D && (
            <>
              {/* Gerçekçi İnsan Gölgesi Silüeti (Baş, Boyun, Omuzlar, Kollar, Gövde ve Bacaklar) */}
              {humanShadowShapeGeo ? (
                <mesh position={[0, 0, 0.027]} geometry={humanShadowShapeGeo}>
                  <meshBasicMaterial color="#020617" transparent opacity={0.93} side={THREE.DoubleSide} />
                </mesh>
              ) : (
                <mesh
                  position={[
                    (shadow.shadowRect2D[0] + shadow.shadowRect2D[2]) / 2,
                    (shadow.shadowRect2D[1] + shadow.shadowRect2D[3]) / 2,
                    0.027,
                  ]}
                >
                  <planeGeometry args={[shadow.shadowWidthM, shadow.shadowHeightM]} />
                  <meshBasicMaterial color="#020617" transparent opacity={0.9} side={THREE.DoubleSide} />
                </mesh>
              )}

              {/* İnsan Gölgesi Kontur Çizgisi */}
              {humanShadowLoop.length >= 4 && (
                <Line
                  points={humanShadowLoop}
                  color="#ef4444"
                  lineWidth={2.2}
                />
              )}

              {/* Mühendislik Ölçü Sınır Çerçevesi (Kesikli Kırmızı Bounding Box: W × H m) */}
              <Line
                points={[
                  [shadow.shadowRect2D[0], shadow.shadowRect2D[1], 0.029],
                  [shadow.shadowRect2D[2], shadow.shadowRect2D[1], 0.029],
                  [shadow.shadowRect2D[2], shadow.shadowRect2D[3], 0.029],
                  [shadow.shadowRect2D[0], shadow.shadowRect2D[3], 0.029],
                  [shadow.shadowRect2D[0], shadow.shadowRect2D[1], 0.029],
                ]}
                color="#f87171"
                lineWidth={1.3}
                dashed
                dashSize={0.1}
                gapSize={0.08}
              />

              {/* Cihazdan insan başına ve perdedeki gölge üst kenarına gölge sınır ışını */}
              <Line
                points={[
                  pos,
                  [shadow.personXM, shadow.floorSceneY + shadow.personHeightM, shadow.personDistFromScreenM],
                  [(shadow.shadowRect2D[0] + shadow.shadowRect2D[2]) / 2, shadow.shadowRect2D[3], 0.029],
                ]}
                color="#ef4444"
                lineWidth={1.6}
                dashed
                dashSize={0.14}
                gapSize={0.08}
              />
              {showLabels && (
                <Text
                  position={[
                    (shadow.shadowRect2D[0] + shadow.shadowRect2D[2]) / 2,
                    shadow.shadowRect2D[3] + 0.08,
                    0.035,
                  ]}
                  fontSize={Math.max(0.115, Math.min(0.155, shadow.shadowWidthM * 0.15))}
                  color="#fecaca"
                  anchorX="center"
                  anchorY="bottom"
                  outlineWidth={0.024}
                  outlineColor="#020617"
                >
                  {`⬛ İNSAN GÖLGESİ (${shadow.shadowWidthM}m × ${shadow.shadowHeightM}m · %${shadow.shadowCoveragePct})`}
                </Text>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

export default function CameraCalculator({ unit }: { unit: LengthUnit }) {
  const [deviceKind, setDeviceKind] = useState<OpticalDeviceKind>('projector');

  // Projektör parametreleri
  const [throwRatio, setThrowRatio] = useState<number>(1.0);
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [aspectKey, setAspectKey] = useState<string>('16:9');
  const [orient, setOrient] = useState<'landscape' | 'portrait'>('landscape');
  const [hShift, setHShift] = useState<number>(0);
  const [vShift, setVShift] = useState<number>(0);
  const [keystoneV, setKeystoneV] = useState<number>(0);
  const [keystoneH, setKeystoneH] = useState<number>(0);

  // Kamera parametreleri
  const [sensor, setSensor] = useState('35 mm tam kare (36×24)');
  const [sw, setSw] = useState(36);
  const [sh, setSh] = useState(24);
  const [focal, setFocal] = useState(35);

  // 3D Tarayıcı & VR parametreleri
  const [scannerPresetId, setScannerPresetId] = useState(SCANNER_3D_PRESETS[0].id);
  const [vrPresetId, setVrPresetId] = useState(VR_SYSTEM_PRESETS[0].id);
  const [customHfov, setCustomHfov] = useState<number>(110);
  const [customVfov, setCustomVfov] = useState<number>(75);

  // 3B Konum & Açılar + Hedef Yüzey Ölçüleri
  const [yRefMode, setYRefMode] = useState<'floor' | 'center'>('floor');
  const [posX, setPosX] = useState<number>(0);
  const [posY, setPosY] = useState<number>(1.13);
  const [dist, setDist] = useState<number>(4.5);
  const [yaw, setYaw] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);
  const [roll, setRoll] = useState<number>(0);
  const [subW, setSubW] = useState<number>(4);
  const [subH, setSubH] = useState<number>(2.25);

  // İzleyici (Viewer FOV) & Yüzey Eğimi / Kavisi (Surface FOV)
  const [viewerDistM, setViewerDistM] = useState<number>(3.5);
  const [viewerX, setViewerX] = useState<number>(0);
  const [viewerY, setViewerY] = useState<number>(0);
  const [surfaceTiltDeg, setSurfaceTiltDeg] = useState<number>(0);
  const [surfaceCurvatureDeg, setSurfaceCurvatureDeg] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [showSceneLabels, setShowSceneLabels] = useState<boolean>(true);
  const [is3DFullscreen, setIs3DFullscreen] = useState<boolean>(false);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);

  // Rapora eklenen çoklu açı görünümleri ve pafta seçimleri
  const [capturedViews, setCapturedViews] = useState<
    Array<{ id: string; angle: 'iso' | 'top' | 'bottom' | 'side' | 'left' | 'front' | 'custom'; label: string; dataUrl: string }>
  >(() => {
    try {
      const raw = localStorage.getItem('agy_fov_shadow_report_v1');
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.capturedViews)) return p.capturedViews;
      }
    } catch {
      /* ignore */
    }
    return [];
  });

  const [enabledPaftas, setEnabledPaftas] = useState<{
    iso3d: boolean;
    topPlan: boolean;
    bottomPlan: boolean;
    sideSection: boolean;
    frontElevation: boolean;
  }>(() => {
    try {
      const raw = localStorage.getItem('agy_fov_shadow_report_v1');
      if (raw) {
        const p = JSON.parse(raw);
        if (p.enabledPaftas) return p.enabledPaftas;
      }
    } catch {
      /* ignore */
    }
    return { iso3d: true, topPlan: true, bottomPlan: true, sideSection: true, frontElevation: true };
  });

  // İnsan & Gölge Analizi (Shadow Analysis) parametreleri
  const [showPerson, setShowPerson] = useState<boolean>(true);
  const [personHeight, setPersonHeight] = useState<number>(1.75);
  const [personWidth, setPersonWidth] = useState<number>(0.5);
  const [personDist, setPersonDist] = useState<number>(1.8);
  const [personX, setPersonX] = useState<number>(0);
  const [screenBottomH, setScreenBottomH] = useState<number>(0);
  const [reportSavedToast, setReportSavedToast] = useState<boolean>(false);

  const pickSensor = (k: string) => {
    setSensor(k);
    const s = SENSORS[k];
    if (s[0]) {
      setSw(s[0]);
      setSh(s[1]);
    }
  };

  const applyKindPreset = (kind: OpticalDeviceKind) => {
    setDeviceKind(kind);
    if (kind === 'scanner3d') {
      const p = SCANNER_3D_PRESETS.find(x => x.id === scannerPresetId) || SCANNER_3D_PRESETS[0];
      setCustomHfov(p.hfovDeg);
      setCustomVfov(p.vfovDeg);
    } else if (kind === 'vr') {
      const p = VR_SYSTEM_PRESETS.find(x => x.id === vrPresetId) || VR_SYSTEM_PRESETS[0];
      setCustomHfov(p.hfovDeg);
      setCustomVfov(p.vfovDeg);
    }
  };

  const updateScreenBottomH = (rawNext: number) => {
    const next = Math.max(0, round(rawNext, 2));
    if (yRefMode === 'floor') {
      const prevCenterFromFloor = screenBottomH + subH / 2;
      if (Math.abs(posY - prevCenterFromFloor) < 0.06) {
        setPosY(round(next + subH / 2, 2));
      }
    }
    setScreenBottomH(next);
  };

  const r = useMemo(() => {
    try {
      const surfW = Math.max(0.1, toMeters(subW, unit));
      const surfH = Math.max(0.1, toMeters(subH, unit));
      const screenBotM = Math.max(0, toMeters(screenBottomH, unit));
      const xM = toMeters(posX, unit);
      const rawYM = toMeters(posY, unit);
      const yM = yRefMode === 'floor' ? rawYM - surfH / 2 - screenBotM : rawYM;
      const zM = Math.max(0.2, toMeters(dist, unit));

      let hfovDeg = 53.1;
      let vfovDeg = 31.4;
      let camMeta: { visible: { width: number; height: number }; fillW: number; fillH: number; fits: boolean; needF: number } | null = null;

      if (deviceKind === 'projector') {
        const effectiveTR = Math.max(0.15, throwRatio / Math.max(0.3, zoomFactor));
        const baseAspect = ASPECT_PRESETS[aspectKey] ?? 16 / 9;
        const effAspect = orient === 'portrait' ? 1 / baseAspect : baseAspect;
        const pf = computeProjectorFov(effectiveTR, effAspect);
        hfovDeg = pf.hfovDeg;
        vfovDeg = pf.vfovDeg;
      } else if (deviceKind === 'camera') {
        const effectiveFocal = focal * Math.max(0.3, zoomFactor);
        const cf = computeCameraFov(sw, sh, effectiveFocal);
        hfovDeg = cf.hfovDeg;
        vfovDeg = cf.vfovDeg;
        const cam = { sensorW: sw, sensorH: sh, focal: effectiveFocal };
        const v = visibleSize(cam, zM);
        const fr = framing(cam, zM, surfW, surfH);
        const needF = focalForFraming(sw, zM, surfW);
        camMeta = { visible: v, fillW: fr.fillW, fillH: fr.fillH, fits: fr.fits, needF };
      } else {
        const zf = Math.max(0.3, zoomFactor);
        hfovDeg = +(2 * Math.atan(Math.tan((customHfov * Math.PI) / 360) / zf) * (180 / Math.PI)).toFixed(1);
        vfovDeg = +(2 * Math.atan(Math.tan((customVfov * Math.PI) / 360) / zf) * (180 / Math.PI)).toFixed(1);
      }

      const proj = computeFovSurfaceProjection({
        hfovDeg,
        vfovDeg,
        posX: xM,
        posY: yM,
        posZ: zM,
        yawDeg: yaw,
        pitchDeg: pitch,
        rollDeg: roll,
        hShift: deviceKind === 'projector' ? hShift : 0,
        vShift: deviceKind === 'projector' ? vShift : 0,
        keystoneHDeg: deviceKind === 'projector' ? keystoneH : 0,
        keystoneVDeg: deviceKind === 'projector' ? keystoneV : 0,
        surfaceWidthM: surfW,
        surfaceHeightM: surfH,
      });

      const viewerFov = computeViewerFov({
        surfaceWidthM: surfW,
        surfaceHeightM: surfH,
        viewerDistM: Math.max(0.3, toMeters(viewerDistM, unit)),
        viewerOffsetXM: toMeters(viewerX, unit),
        viewerOffsetYM: toMeters(viewerY, unit),
        surfaceTiltDeg,
        surfaceCurvatureDeg,
      });

      const surfaceFov = computeSurfaceFov({
        devicePos: [xM, yM, zM],
        activeCorners3D: proj.activeCorners3D,
        projectorHfovDeg: proj.hfovDeg,
        projectorVfovDeg: proj.vfovDeg,
        surfaceTiltDeg,
        surfaceCurvatureDeg,
      });

      const shadow = computeFovShadowAnalysis({
        devicePos: [xM, yM, zM],
        surfaceWidthM: surfW,
        surfaceHeightM: surfH,
        screenBottomHeightM: Math.max(0, toMeters(screenBottomH, unit)),
        activeCorners2D: proj.activeCorners2D,
        personHeightM: Math.max(0.4, toMeters(personHeight, unit)),
        personWidthM: Math.max(0.2, toMeters(personWidth, unit)),
        personDistFromScreenM: Math.max(0.05, toMeters(personDist, unit)),
        personXM: toMeters(personX, unit),
      });

      return { proj, viewerFov, surfaceFov, shadow, camMeta, surfW, surfH, posM: [xM, yM, zM] as [number, number, number], err: null as string | null };
    } catch (e) {
      return { err: (e as Error).message } as any;
    }
  }, [
    deviceKind,
    throwRatio,
    zoomFactor,
    aspectKey,
    orient,
    hShift,
    vShift,
    keystoneH,
    keystoneV,
    sw,
    sh,
    focal,
    customHfov,
    customVfov,
    yRefMode,
    posX,
    posY,
    dist,
    yaw,
    pitch,
    roll,
    subW,
    subH,
    viewerDistM,
    viewerX,
    viewerY,
    surfaceTiltDeg,
    surfaceCurvatureDeg,
    personHeight,
    personWidth,
    personDist,
    personX,
    screenBottomH,
    unit,
  ]);

  // 3B Sahne Bounding Box, Merkez Noktası ve Dinamik Ekrana Sığdırma (Fit-to-View)
  const sceneFraming = useMemo(() => {
    const sW = r && !r.err ? r.surfW : Math.max(0.5, toMeters(subW, unit));
    const sH = r && !r.err ? r.surfH : Math.max(0.5, toMeters(subH, unit));
    const scrBotM = Math.max(0, toMeters(screenBottomH, unit));
    const devPos =
      r && !r.err && r.posM
        ? r.posM
        : ([toMeters(posX, unit), toMeters(posY, unit), Math.max(0.5, toMeters(dist, unit))] as [
            number,
            number,
            number,
          ]);
    const pDist = Math.max(0.1, toMeters(personDist, unit));

    const floorY = -sH / 2 - scrBotM;
    const topY = Math.max(sH / 2, devPos[1]);
    const minX = Math.min(-sW / 2, devPos[0]) - 0.4;
    const maxX = Math.max(sW / 2, devPos[0]) + 0.4;
    const maxZ = Math.max(devPos[2], pDist) + 0.4;

    const targetX = (minX + maxX) / 2;
    const targetY = (floorY + topY) / 2;
    const targetZ = maxZ / 2;

    const spanX = maxX - minX;
    const spanY = topY - floorY;
    const spanZ = maxZ;

    const radius = Math.sqrt((spanX / 2) ** 2 + (spanY / 2) ** 2 + (spanZ / 2) ** 2);
    const fovDeg = 36;
    const fovRad = (fovDeg * Math.PI) / 180;
    // Bounding radius nesneleri ekrana tam oturur (~84% alan doluluğu, boş siyah alan bırakmaz)
    const camDist = Math.max(2.8, (radius / Math.sin(fovRad / 2)) * 0.92);

    const cos24 = Math.cos((24 * Math.PI) / 180);
    const sin24 = Math.sin((24 * Math.PI) / 180);
    const cos38 = Math.cos((38 * Math.PI) / 180);
    const sin38 = Math.sin((38 * Math.PI) / 180);

    const isoPos: [number, number, number] = [
      targetX + camDist * cos24 * sin38,
      targetY + camDist * sin24,
      targetZ + camDist * cos24 * cos38,
    ];

    return {
      target: [targetX, targetY, targetZ] as [number, number, number],
      camPos: isoPos,
      camDist,
      fovDeg,
      radius,
      floorY,
      topY,
      maxZ,
    };
  }, [r, subW, subH, screenBottomH, posX, posY, dist, personDist, unit]);

  const set3DCameraPreset = (preset: 'iso' | 'side' | 'left' | 'front' | 'top' | 'bottom' | 'fit') => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam) return;
    const { target, camDist, fovDeg } = sceneFraming;

    cam.fov = fovDeg;
    if (preset === 'iso' || preset === 'fit') {
      const cos24 = Math.cos((24 * Math.PI) / 180);
      const sin24 = Math.sin((24 * Math.PI) / 180);
      const cos38 = Math.cos((38 * Math.PI) / 180);
      const sin38 = Math.sin((38 * Math.PI) / 180);
      cam.position.set(
        target[0] + camDist * cos24 * sin38,
        target[1] + camDist * sin24,
        target[2] + camDist * cos24 * cos38
      );
    } else if (preset === 'side') {
      cam.position.set(target[0] + camDist * 1.05, target[1], target[2]);
    } else if (preset === 'left') {
      cam.position.set(target[0] - camDist * 1.05, target[1], target[2]);
    } else if (preset === 'front') {
      cam.position.set(target[0], target[1] + 0.05, -camDist * 0.95);
    } else if (preset === 'top') {
      cam.position.set(target[0], target[1] + camDist * 1.2, target[2] + 0.001);
    } else if (preset === 'bottom') {
      cam.position.set(target[0], target[1] - camDist * 1.2, target[2] + 0.001);
    }
    cam.updateProjectionMatrix();

    if (ctrl) {
      if (preset === 'front') {
        ctrl.target.set(target[0], target[1], 0);
      } else {
        ctrl.target.set(...target);
      }
      ctrl.update();
    }
  };

  const captureCurrentAngleSnapshot = (): string | undefined => {
    try {
      if (glRef.current && sceneRef.current && cameraRef.current) {
        glRef.current.setClearColor(new THREE.Color('#070b14'), 1);
        glRef.current.render(sceneRef.current, cameraRef.current);
        return glRef.current.domElement.toDataURL('image/png');
      }
    } catch {
      /* ignore */
    }
    return undefined;
  };

  const syncShadowReportToStorage = (
    nextViews: typeof capturedViews = capturedViews,
    nextPaftas: typeof enabledPaftas = enabledPaftas
  ) => {
    if (!r || r.err || !r.shadow) return;
    const snap = nextViews[0]?.dataUrl || captureCurrentAngleSnapshot();
    const payload = {
      updatedAt: new Date().toISOString(),
      deviceKind,
      surfaceWidthM: r.surfW,
      surfaceHeightM: r.surfH,
      devicePosM: r.posM,
      hfovDeg: r.proj.hfovDeg,
      vfovDeg: r.proj.vfovDeg,
      dfovDeg: r.proj.dfovDeg,
      incidenceAngleDeg: r.proj.incidenceAngleDeg,
      coveragePct: r.proj.coveragePct,
      snapshot3dDataUrl: snap,
      capturedViews: nextViews,
      enabledPaftas: nextPaftas,
      shadow: r.shadow,
    };
    try {
      localStorage.setItem('agy_fov_shadow_report_v1', JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('agy:fov-shadow-updated', { detail: payload }));
      setReportSavedToast(true);
      setTimeout(() => setReportSavedToast(false), 2600);
    } catch {
      /* ignore */
    }
  };

  const addSpecificViewToReport = (
    angle: 'iso' | 'top' | 'bottom' | 'side' | 'left' | 'front',
    label: string
  ) => {
    set3DCameraPreset(angle);
    setTimeout(() => {
      const snap = captureCurrentAngleSnapshot();
      if (!snap) return;
      const next = [
        ...capturedViews.filter(v => v.angle !== angle),
        { id: `view-${angle}-${Date.now()}`, angle, label, dataUrl: snap },
      ];
      setCapturedViews(next);
      syncShadowReportToStorage(next, enabledPaftas);
    }, 120);
  };

  const removeViewFromReport = (id: string) => {
    const next = capturedViews.filter(v => v.id !== id);
    setCapturedViews(next);
    syncShadowReportToStorage(next, enabledPaftas);
  };

  const togglePafta = (k: keyof typeof enabledPaftas) => {
    const next = { ...enabledPaftas, [k]: !enabledPaftas[k] };
    setEnabledPaftas(next);
    syncShadowReportToStorage(capturedViews, next);
  };

  const addAllAnglesToReport = () => {
    const sequence: Array<{ angle: 'top' | 'bottom' | 'side' | 'left' | 'front' | 'iso'; label: string }> = [
      { angle: 'iso', label: '3B İzometrik Perspektif' },
      { angle: 'top', label: 'Üstten Bakış Açısı' },
      { angle: 'bottom', label: 'Alttan Bakış Açısı' },
      { angle: 'side', label: 'Yandan Sağ Kesit' },
      { angle: 'left', label: 'Yandan Sol Kesit' },
      { angle: 'front', label: 'Perde Önü / Karşıdan' },
    ];
    let i = 0;
    const accumulated = [...capturedViews];
    const runNext = () => {
      if (i >= sequence.length) {
        setCapturedViews(accumulated);
        syncShadowReportToStorage(accumulated, enabledPaftas);
        set3DCameraPreset('iso');
        return;
      }
      const item = sequence[i];
      set3DCameraPreset(item.angle);
      setTimeout(() => {
        const snap = captureCurrentAngleSnapshot();
        if (snap) {
          const idx = accumulated.findIndex(v => v.angle === item.angle);
          const entry = { id: `view-${item.angle}-${Date.now()}`, angle: item.angle, label: item.label, dataUrl: snap };
          if (idx >= 0) accumulated[idx] = entry;
          else accumulated.push(entry);
        }
        i++;
        runNext();
      }, 140);
    };
    runNext();
  };

  const sendShadowReportToPdf = () => {
    syncShadowReportToStorage(capturedViews, enabledPaftas);
  };

  const u = (m: number) => `${round(fromMeters(m, unit), 2)} ${unit}`;
  const N = (l: string, v: number, s: (x: number) => void, step = 'any') => (
    <label className="block text-[11px] text-slate-300">
      {l}
      <input
        className="inp mt-0.5"
        type="number"
        step={step}
        value={v}
        onChange={e => s(parseFloat(e.target.value) || 0)}
      />
    </label>
  );

  return (
    <div className="grid lg:grid-cols-[350px_1fr] gap-4 h-full">
      {/* SOL PANEL: CİHAZ MODU, KONUM, YÜZEY VE EĞİK AÇI KONTROLLERİ */}
      <div className="space-y-3 p-3 rounded-lg border border-slate-700 bg-slate-900 text-sm overflow-y-auto">
        <div>
          <h2 className="font-bold text-slate-100">Optik FOV, 3B Konisi &amp; İzdüşüm</h2>
          <p className="text-[11px] text-slate-400">
            Projektör, kamera, 3D tarayıcı ve VR sistemleri için HFOV/VFOV ve eğik yüzey izdüşümü
          </p>
        </div>

        {/* 4 Sistem Sekmesi */}
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          {[
            { id: 'projector', label: '📽️ Projektör' },
            { id: 'camera', label: '📷 Kamera' },
            { id: 'scanner3d', label: '📡 3D Tarayıcı' },
            { id: 'vr', label: '🥽 VR Sistemi' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => applyKindPreset(tab.id as OpticalDeviceKind)}
              className={`px-2 py-1.5 rounded border font-semibold transition ${
                deviceKind === tab.id
                  ? 'bg-sky-600 border-sky-400 text-white'
                  : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Cihaza Özel Optik Parametreler */}
        {deviceKind === 'projector' && (
          <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              {N('Throw Ratio (TR)', throwRatio, v => setThrowRatio(Math.max(0.15, v)), '0.05')}
              <label className="block text-[11px] text-slate-300">
                En-Boy Oranı
                <select className="inp mt-0.5" value={aspectKey} onChange={e => setAspectKey(e.target.value)}>
                  {Object.keys(ASPECT_PRESETS).map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Yatay / Dikey (Portrait) Yönelim */}
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setOrient('landscape')}
                className={`py-1 rounded border font-semibold transition ${
                  orient === 'landscape'
                    ? 'bg-emerald-600/80 border-emerald-400 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                ↔ Yatay (Landscape)
              </button>
              <button
                type="button"
                onClick={() => setOrient('portrait')}
                className={`py-1 rounded border font-semibold transition ${
                  orient === 'portrait'
                    ? 'bg-emerald-600/80 border-emerald-400 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                ↕ Dikey (Portrait 90°)
              </button>
            </div>

            {/* Optik Zoom */}
            <div className="pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Optik Zoom: <b className="text-sky-300 font-mono">{zoomFactor.toFixed(2)}×</b></span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Efektif TR: {Math.max(0.15, throwRatio / Math.max(0.3, zoomFactor)).toFixed(2)}:1
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.2}
                step={0.05}
                value={zoomFactor}
                onChange={e => setZoomFactor(+e.target.value)}
                className="w-full accent-sky-500 h-1.5 mt-1 cursor-pointer"
              />
            </div>

            {/* Lens Shift (Yatay / Dikey) */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
              <label className="block text-[11px] text-slate-300">
                Yatay Shift ({Math.round(hShift * 100)}%)
                <input
                  type="range"
                  min={-0.6}
                  max={0.6}
                  step={0.02}
                  value={hShift}
                  onChange={e => setHShift(+e.target.value)}
                  className="w-full accent-emerald-500 h-1.5 mt-1 cursor-pointer"
                />
              </label>
              <label className="block text-[11px] text-slate-300">
                Dikey Shift ({Math.round(vShift * 100)}%)
                <input
                  type="range"
                  min={-0.6}
                  max={0.6}
                  step={0.02}
                  value={vShift}
                  onChange={e => setVShift(+e.target.value)}
                  className="w-full accent-emerald-500 h-1.5 mt-1 cursor-pointer"
                />
              </label>
            </div>

            {/* Dijital Keystone (V / H) */}
            <div className="pt-1 border-t border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-300">Dijital Keystone (V / H)</span>
                {(keystoneV !== 0 || keystoneH !== 0 || hShift !== 0 || vShift !== 0 || zoomFactor !== 1) && (
                  <button
                    type="button"
                    onClick={() => {
                      setZoomFactor(1);
                      setHShift(0);
                      setVShift(0);
                      setKeystoneV(0);
                      setKeystoneH(0);
                    }}
                    className="text-[9.5px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600"
                  >
                    Optiği Sıfırla
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] text-slate-300">
                  Dikey V ({keystoneV > 0 ? `+${keystoneV}` : keystoneV}°)
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    step={1}
                    value={keystoneV}
                    onChange={e => setKeystoneV(+e.target.value)}
                    className="w-full accent-amber-500 h-1.5 mt-1 cursor-pointer"
                  />
                </label>
                <label className="block text-[11px] text-slate-300">
                  Yatay H ({keystoneH > 0 ? `+${keystoneH}` : keystoneH}°)
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    step={1}
                    value={keystoneH}
                    onChange={e => setKeystoneH(+e.target.value)}
                    className="w-full accent-amber-500 h-1.5 mt-1 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {deviceKind === 'camera' && (
          <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <label className="block text-[11px] text-slate-300">
              Sensör
              <select className="inp mt-0.5" value={sensor} onChange={e => pickSensor(e.target.value)}>
                {Object.keys(SENSORS).map(k => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {N('Sensör W (mm)', sw, x => { setSw(Math.max(1, x)); setSensor('Özel'); })}
              {N('Sensör H (mm)', sh, x => { setSh(Math.max(1, x)); setSensor('Özel'); })}
              {N('Odak (mm)', focal, x => setFocal(Math.max(1, x)))}
            </div>
          </div>
        )}

        {deviceKind === 'scanner3d' && (
          <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <label className="block text-[11px] text-slate-300">
              3D Tarayıcı / Derinlik Sensörü
              <select
                className="inp mt-0.5"
                value={scannerPresetId}
                onChange={e => {
                  const id = e.target.value;
                  setScannerPresetId(id);
                  const found = SCANNER_3D_PRESETS.find(x => x.id === id);
                  if (found) {
                    setCustomHfov(found.hfovDeg);
                    setCustomVfov(found.vfovDeg);
                  }
                }}
              >
                {SCANNER_3D_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {N('HFOV (°)', customHfov, v => setCustomHfov(Math.max(2, Math.min(170, v))))}
              {N('VFOV (°)', customVfov, v => setCustomVfov(Math.max(2, Math.min(170, v))))}
            </div>
          </div>
        )}

        {deviceKind === 'vr' && (
          <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <label className="block text-[11px] text-slate-300">
              VR / XR Sistemi
              <select
                className="inp mt-0.5"
                value={vrPresetId}
                onChange={e => {
                  const id = e.target.value;
                  setVrPresetId(id);
                  const found = VR_SYSTEM_PRESETS.find(x => x.id === id);
                  if (found) {
                    setCustomHfov(found.hfovDeg);
                    setCustomVfov(found.vfovDeg);
                  }
                }}
              >
                {VR_SYSTEM_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {N('HFOV (°)', customHfov, v => setCustomHfov(Math.max(2, Math.min(170, v))))}
              {N('VFOV (°)', customVfov, v => setCustomVfov(Math.max(2, Math.min(170, v))))}
            </div>
          </div>
        )}

        {/* Hedef Yüzey Ölçüleri & Yerden Başlangıç Yüksekliği */}
        <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-300">Hedef Yüzey (Perde) &amp; Yerden Yükseklik</span>
            <span className="text-[10px] font-mono text-sky-300 bg-sky-950/70 px-1.5 py-0.5 rounded border border-sky-800/70">
              Alt: {screenBottomH.toFixed(2)}{unit} → Üst: {round(screenBottomH + subH, 2)}{unit}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {N(`Genişlik (${unit})`, subW, v => setSubW(Math.max(0.1, v)), '0.1')}
            {N(`Yükseklik (${unit})`, subH, v => setSubH(Math.max(0.1, v)), '0.1')}
            {N(`Yerden Başlangıç (${unit})`, screenBottomH, v => updateScreenBottomH(v), '0.1')}
          </div>
          <div className="space-y-1 pt-0.5 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-[10.5px] text-slate-300">
              <span>↕ Perde Yerden Başlangıç Yüksekliği:</span>
              <span className="font-mono font-bold text-amber-300">+{screenBottomH.toFixed(2)} {unit}</span>
            </div>
            <input
              type="range"
              min={0}
              max={3.0}
              step={0.05}
              value={Math.min(3.0, screenBottomH)}
              onChange={e => updateScreenBottomH(+e.target.value)}
              className="w-full accent-amber-500 h-1.5 cursor-pointer"
            />
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {[
                { label: '0m Zemin', val: 0 },
                { label: '0.5m Sahne', val: 0.5 },
                { label: '0.8m Masa', val: 0.8 },
                { label: '1.2m Duvar', val: 1.2 },
                { label: '1.6m Yüksek', val: 1.6 },
              ].map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => updateScreenBottomH(fromMeters(p.val, unit))}
                  className={`text-[9.5px] px-1.5 py-0.5 rounded border transition ${
                    Math.abs(toMeters(screenBottomH, unit) - p.val) < 0.03
                      ? 'bg-amber-600/80 border-amber-400 text-white font-semibold'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3B Cihaz Konumu ve Eğim Açıları */}
        <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-sky-300">Cihaz 3B Konumu &amp; Eğik Açılar</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = yRefMode === 'floor' ? 'center' : 'floor';
                  const curM = toMeters(posY, unit);
                  const surfHM = Math.max(0.1, toMeters(subH, unit));
                  const botM = Math.max(0, toMeters(screenBottomH, unit));
                  const convertedM = next === 'floor' ? curM + surfHM / 2 + botM : curM - surfHM / 2 - botM;
                  setPosY(round(fromMeters(convertedM, unit), 2));
                  setYRefMode(next);
                }}
                className="text-[9.5px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 hover:bg-sky-900"
                title="Yükseklik referansını Zeminden (0m) veya Perde Merkezinden (±) olarak değiştirir"
              >
                {yRefMode === 'floor' ? 'Ref: Zemin (0m)' : 'Ref: Merkez (±)'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPosX(0);
                  setPosY(yRefMode === 'floor' ? round(screenBottomH + subH / 2, 2) : 0);
                  setYaw(0);
                  setPitch(0);
                  setRoll(0);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Sıfırla
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {N(`X Yanal (${unit})`, posX, setPosX, '0.1')}
            {N(yRefMode === 'floor' ? `Yerden Y (${unit})` : `Y Merkez (${unit})`, posY, setPosY, '0.1')}
            {N(`Z Mesafe (${unit})`, dist, v => setDist(Math.max(0.2, v)), '0.1')}
          </div>
          {yRefMode === 'floor' && !r.err && (
            <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 font-mono">
              <span>
                Perde: {round(screenBottomH, 2)}–{round(screenBottomH + subH, 2)} {unit} · Merkeze göre: {r.posM[1] >= 0 ? '+' : ''}{round(fromMeters(r.posM[1], unit), 2)} {unit}
              </span>
              {Math.abs(r.posM[1]) > 0.02 && (
                <button
                  type="button"
                  onClick={() => setPosY(round(screenBottomH + subH / 2, 2))}
                  className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/70 hover:bg-emerald-900 shrink-0"
                  title="Cihaz yüksekliğini perde merkezine hizalar"
                >
                  🎯 Merkeze Hizala
                </button>
              )}
            </div>
          )}
          <div className="space-y-1.5 pt-1">
            <label className="block text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>Yatay Dönme (Yaw)</span>
                <span className="font-mono text-amber-300">{yaw}°</span>
              </div>
              <input type="range" min={-60} max={60} step={1} value={yaw} onChange={e => setYaw(+e.target.value)} className="w-full accent-sky-500" />
            </label>
            <label className="block text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>Dikey Eğim (Pitch)</span>
                <span className="font-mono text-amber-300">{pitch}°</span>
              </div>
              <input type="range" min={-45} max={45} step={1} value={pitch} onChange={e => setPitch(+e.target.value)} className="w-full accent-sky-500" />
            </label>
            <label className="block text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>Eksen Dönmesi (Roll)</span>
                <span className="font-mono text-amber-300">{roll}°</span>
              </div>
              <input type="range" min={-30} max={30} step={1} value={roll} onChange={e => setRoll(+e.target.value)} className="w-full accent-sky-500" />
            </label>
          </div>
        </div>

        {/* İzleyici (Viewer FOV) & Yüzey Eğimi / Kavisi */}
        <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-300">İzleyici Konumu &amp; Yüzey Eğimi</span>
            <button
              type="button"
              onClick={() => {
                setViewerDistM(3.5);
                setViewerX(0);
                setViewerY(0);
                setSurfaceTiltDeg(0);
                setSurfaceCurvatureDeg(0);
              }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Sıfırla
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {N(`İzleyici Z (${unit})`, viewerDistM, v => setViewerDistM(Math.max(0.3, v)), '0.1')}
            {N(`İzleyici X (${unit})`, viewerX, setViewerX, '0.1')}
            {N(`İzleyici Y (${unit})`, viewerY, setViewerY, '0.1')}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="block text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>Yüzey Eğimi</span>
                <span className="font-mono text-purple-300">{surfaceTiltDeg}°</span>
              </div>
              <input type="range" min={-45} max={45} step={1} value={surfaceTiltDeg} onChange={e => setSurfaceTiltDeg(+e.target.value)} className="w-full accent-purple-500" />
            </label>
            <label className="block text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>Yüzey Kavisi</span>
                <span className="font-mono text-purple-300">{surfaceCurvatureDeg}°</span>
              </div>
              <input type="range" min={0} max={180} step={5} value={surfaceCurvatureDeg} onChange={e => setSurfaceCurvatureDeg(+e.target.value)} className="w-full accent-purple-500" />
            </label>
          </div>
        </div>

        {/* İnsan & Gölge Analizi (Shadow Analysis) Kontrolleri */}
        <div className="space-y-2 p-2.5 rounded bg-slate-950/70 border border-rose-800/60">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-rose-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showPerson}
                onChange={e => setShowPerson(e.target.checked)}
                className="accent-rose-500"
              />
              <span>🚶 İnsan &amp; Gölge Analizi</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setPersonHeight(1.75);
                setPersonWidth(0.5);
                setPersonDist(1.8);
                setPersonX(0);
                updateScreenBottomH(0);
              }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Sıfırla
            </button>
          </div>

          {showPerson && (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {N(`Boy (${unit})`, personHeight, v => setPersonHeight(Math.max(0.5, v)), '0.05')}
                {N(`Omuz (${unit})`, personWidth, v => setPersonWidth(Math.max(0.2, v)), '0.05')}
                {N(`Perde AltY (${unit})`, screenBottomH, v => updateScreenBottomH(v), '0.1')}
              </div>
              <label className="block text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span>Perdeye Uzaklık (Z)</span>
                  <span className="font-mono text-rose-300">{personDist.toFixed(2)} {unit}</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={Math.max(0.5, round(dist - 0.1, 2))}
                  step={0.05}
                  value={Math.min(personDist, Math.max(0.5, dist - 0.1))}
                  onChange={e => setPersonDist(+e.target.value)}
                  className="w-full accent-rose-500 h-1.5 mt-1 cursor-pointer"
                />
              </label>
              <label className="block text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span>Yanal Konum (X)</span>
                  <span className="font-mono text-rose-300">{personX >= 0 ? `+${personX.toFixed(2)}` : personX.toFixed(2)} {unit}</span>
                </div>
                <input
                  type="range"
                  min={-round(subW / 2, 2)}
                  max={round(subW / 2, 2)}
                  step={0.05}
                  value={personX}
                  onChange={e => setPersonX(+e.target.value)}
                  className="w-full accent-rose-500 h-1.5 mt-1 cursor-pointer"
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* SAĞ PANEL: FOV, EĞİK İZDÜŞÜM, KAPSAMA KONTROLÜ + 3D / 2D GÖRÜNTÜ */}
      <div className="space-y-3 min-w-0 flex flex-col">
        {r.err ? (
          <p className="p-3 rounded bg-red-950/60 border border-red-800 text-red-300">⚠ {r.err}</p>
        ) : (
          <>
            {/* Tam Kapsama Durum Bandı */}
            <div
              className={`px-3 py-2 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ${
                r.proj.isFullSurfaceCovered
                  ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200'
                  : 'bg-amber-950/50 border-amber-700 text-amber-200'
              }`}
            >
              <div className="font-semibold">
                {r.proj.isFullSurfaceCovered
                  ? `✅ Yüzeyin Tamamı Kapsanıyor (%${r.proj.coveragePct} Kapsama)`
                  : `⚠️ Yüzey Tam Kapsanmıyor (%${r.proj.coveragePct} Kapsama — Açıkta Kalan: ${r.proj.uncoveredSides.join(', ') || 'Kısmi'})`}
              </div>
              <div className="font-mono text-[11px]">
                Geliş Açısı: ∠{r.proj.incidenceAngleDeg}° · Keystone Bozulma: %{r.proj.keystoneDistortionPct}
                {r.proj.hasDigitalKeystone ? ` · Dijital Kayıp: -%${r.proj.keystonePixelLossPct}` : ''} · Taşma: %{r.proj.overflowPct}
              </div>
            </div>

            {/* 3 Ayrı FOV Paneli: Viewer FOV | Projector FOV | Surface FOV */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded bg-purple-950/30 border border-purple-700/60">
                <div className="text-[10.5px] font-bold text-purple-300 uppercase tracking-wider">1. Viewer FOV (İzleyici)</div>
                <div className="font-mono font-bold text-white text-sm mt-0.5">
                  {r.viewerFov.hfovDeg}° × {r.viewerFov.vfovDeg}° <span className="text-purple-300 text-xs">(D: {r.viewerFov.dfovDeg}°)</span>
                </div>
                <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                  Uzaklık: {u(r.viewerFov.viewerDistanceToCenterM)} · Merkez Açısı: ∠{r.viewerFov.viewerCenterAngleDeg}°
                </div>
                <div className="text-[10px] text-purple-200/80 font-mono">
                  Perspektif Sıkışması: %{r.viewerFov.perspectiveCompressionPct}
                </div>
              </div>

              <div className="p-2.5 rounded bg-sky-950/30 border border-sky-700/60">
                <div className="text-[10.5px] font-bold text-sky-300 uppercase tracking-wider">2. Projector / Optik FOV</div>
                <div className="font-mono font-bold text-white text-sm mt-0.5">
                  {r.proj.hfovDeg}° × {r.proj.vfovDeg}° <span className="text-sky-300 text-xs">(D: {r.proj.dfovDeg}°)</span>
                </div>
                <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                  Görüntü: {u(r.surfW)} × {u(r.surfH)} · Cihaz: {u(r.proj.distanceToCenterM)}
                </div>
                <div className="text-[10px] text-sky-200/80 font-mono">
                  Geliş Açısı: ∠{r.proj.incidenceAngleDeg}°
                </div>
              </div>

              <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-700/60">
                <div className="text-[10.5px] font-bold text-emerald-300 uppercase tracking-wider">3. Surface FOV (Yüzey)</div>
                <div className="font-mono font-bold text-white text-sm mt-0.5">
                  {r.surfaceFov.hfovDeg}° × {r.surfaceFov.vfovDeg}° <span className="text-emerald-300 text-xs">(D: {r.surfaceFov.dfovDeg}°)</span>
                </div>
                <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                  Eğim: {r.surfaceFov.surfaceTiltDeg}° · Kavis: {r.surfaceFov.surfaceCurvatureDeg}°
                </div>
                <div className="text-[10px] text-emerald-200/80 font-mono">
                  Perspektif Değişimi: %{r.surfaceFov.perspectiveChangePct}
                </div>
              </div>
            </div>

            {/* Metrik Kartları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded bg-slate-900 border border-slate-700">
                <div className="text-[10.5px] text-slate-400">Optik Görüş Açısı (FOV)</div>
                <div className="font-mono font-bold text-sky-300 text-sm">
                  {r.proj.hfovDeg}° × {r.proj.vfovDeg}°
                </div>
                <div className="text-[10px] text-slate-400 font-mono">Diagonal: {r.proj.dfovDeg}°</div>
              </div>

              <div className="p-2.5 rounded bg-slate-900 border border-slate-700">
                <div className="text-[10.5px] text-slate-400">Gerçek Eğik İzdüşüm Alanı</div>
                <div className="font-mono font-bold text-emerald-300 text-sm">
                  {r.proj.projectedAreaM2} m²
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Hedef: {round(r.surfW * r.surfH, 2)} m²
                </div>
              </div>

              <div className="p-2.5 rounded bg-slate-900 border border-slate-700">
                <div className="text-[10.5px] text-slate-400">Yamuk Kenar Ölçüleri (Üst/Alt)</div>
                <div className="font-mono font-bold text-amber-300 text-sm">
                  {u(r.proj.topEdgeM)} / {u(r.proj.bottomEdgeM)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Sol/Sağ: {u(r.proj.leftEdgeM)} / {u(r.proj.rightEdgeM)}
                </div>
              </div>

              <div className="p-2.5 rounded bg-slate-900 border border-slate-700">
                <div className="text-[10.5px] text-slate-400">
                  {r.camMeta ? 'Kadraj İçin Gereken Odak' : 'Cihaz → Merkez Mesafesi'}
                </div>
                <div className="font-mono font-bold text-indigo-300 text-sm">
                  {r.camMeta ? `${round(r.camMeta.needF, 1)} mm` : u(r.proj.distanceToCenterM)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {r.camMeta
                    ? `Dik Görünür: ${u(r.camMeta.visible.width)}×${u(r.camMeta.visible.height)}`
                    : `Keystone: %${r.proj.keystoneDistortionPct}`}
                </div>
              </div>
            </div>

            {/* İnsan & Gölge Analizi Rapor Kartı */}
            {showPerson && r.shadow && (
              <div
                className={`p-3 rounded-lg border text-xs space-y-2 ${
                  r.shadow.isCastingShadow
                    ? 'bg-rose-950/40 border-rose-700/80 text-rose-100'
                    : 'bg-emerald-950/35 border-emerald-700/70 text-emerald-100'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-sm flex items-center gap-2">
                    <span>🕴️ İnsan &amp; Gölge Analizi Raporu</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-950/70 border border-slate-700 font-mono">
                      {r.shadow.zoneStatusLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={sendShadowReportToPdf}
                    className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] shadow transition"
                  >
                    {reportSavedToast ? '✅ PDF Raporuna Eklendi!' : '📋 Gölge Raporunu PDF Raporuna Ekle'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                  <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Gölge Başlangıç Sınırı (Perdeden)</div>
                    <div className="text-amber-300 font-bold text-xs mt-0.5">
                      {r.shadow.neverCastsShadow ? 'Gölge Yok (0 m)' : `0 – ${u(r.shadow.shadowEntryDistFromScreenM)}`}
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      Cihazdan: {u(r.shadow.shadowEntryDistFromDeviceM)}
                    </div>
                  </div>

                  <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Mevcut İnsan Konumu</div>
                    <div className="text-white font-bold text-xs mt-0.5">
                      Perdeye {u(r.shadow.personDistFromScreenM)}
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      Cihaza: {u(r.shadow.personDistFromDeviceM)} · Boy: {u(r.shadow.personHeightM)}
                    </div>
                  </div>

                  <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Konumdaki Işık Alt Sınırı</div>
                    <div className="text-sky-300 font-bold text-xs mt-0.5">
                      Yerden {u(r.shadow.beamBottomAtPersonM)}
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      {r.shadow.headClearanceM >= 0
                        ? `Baş Üstü Boşluk: +${u(r.shadow.headClearanceM)}`
                        : `Işığa Giriş: ${u(r.shadow.intrusionHeightM)}`}
                    </div>
                  </div>

                  <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Perdedeki Gölge Ebadı</div>
                    <div className={`font-bold text-xs mt-0.5 ${r.shadow.isCastingShadow ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {r.shadow.isCastingShadow
                        ? `${u(r.shadow.shadowWidthM)} × ${u(r.shadow.shadowHeightM)}`
                        : '0 m × 0 m (Temiz)'}
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      {r.shadow.isCastingShadow
                        ? `Alan: ${r.shadow.shadowAreaM2} m² (%${r.shadow.shadowCoveragePct})`
                        : 'Perdeye gölge düşmüyor'}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-200 bg-slate-950/60 px-2.5 py-1.5 rounded border border-slate-800">
                  <b>Mühendislik Özeti:</b> {r.shadow.reportSummaryTr}
                </div>
              </div>
            )}

            {/* 3D / 2D Görünüm Geçişi + Kamera Açıları & Etiket Kontrolü */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded overflow-hidden border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('3d')}
                    className={`px-3 py-1 font-semibold ${viewMode === '3d' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                  >
                    🧊 3D Görüş Konisi &amp; Gölge Simülasyonu
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('2d')}
                    className={`px-3 py-1 font-semibold ${viewMode === '2d' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                  >
                    📐 2B Perde İzdüşüm &amp; Gölge Planı
                  </button>
                </div>

                {viewMode === '3d' && (
                  <div className="flex flex-wrap items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-[10.5px]">
                    <span className="text-slate-400">3B Bakış:</span>
                    <button type="button" onClick={() => set3DCameraPreset('fit')} className="px-1.5 py-0.5 rounded bg-sky-950 border border-sky-600 text-sky-200 font-bold hover:bg-sky-900" title="Sahneyi ve frustumu ekrana tam sığdır">
                      🎯 Ekrana Tam Oturt
                    </button>
                    <button type="button" onClick={() => set3DCameraPreset('iso')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200">
                      Perspektif
                    </button>
                    <button type="button" onClick={() => set3DCameraPreset('top')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300">
                      Üstten
                    </button>
                    <button type="button" onClick={() => set3DCameraPreset('bottom')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-purple-300">
                      Alttan
                    </button>
                    <button type="button" onClick={() => set3DCameraPreset('side')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300">
                      Yandan (Sağ)
                    </button>
                    <button type="button" onClick={() => set3DCameraPreset('left')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-200">
                      Yandan (Sol)
                    </button>
                    <button type="button" onClick={() => set3DCameraPreset('front')} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300">
                      Perde Önü
                    </button>
                    <button
                      type="button"
                      onClick={() => setIs3DFullscreen(v => !v)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold"
                    >
                      {is3DFullscreen ? '🗗 Küçült' : '⛶ Tam Ekran'}
                    </button>
                  </div>
                )}

                <label className="flex items-center gap-1.5 text-[11px] text-amber-300 cursor-pointer bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                  <input
                    type="checkbox"
                    checked={showSceneLabels}
                    onChange={e => setShowSceneLabels(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span>🏷️ Sahne Etiketleri</span>
                </label>
              </div>
              <span className="text-[11px] text-slate-400">
                ① Perde · ② Kritik Gölge Sınırı · ③ İzleyici Konumu · ④ Cihaz
              </span>
            </div>

            {/* RAPORA AÇILARI AYRI AYRI EKLEME & SİLME ARAÇ ÇUBUĞU */}
            <div className="p-2 rounded bg-slate-900/90 border border-slate-700 space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-sky-300">
                  <span>📸 3B Görünümleri Rapora Ayrı Ayrı Ekle / Sil:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => addSpecificViewToReport('top', 'Üstten Plan Görünümü')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 font-semibold text-[11px]"
                  >
                    + ⬆️ Üstten Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => addSpecificViewToReport('bottom', 'Alttan Tavan Görünümü')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700 font-semibold text-[11px]"
                  >
                    + ⬇️ Alttan Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => addSpecificViewToReport('side', 'Yandan Sağ Kesit')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold text-[11px]"
                  >
                    + ➡️ Yandan Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => addSpecificViewToReport('front', 'Perde Önü / Karşı')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-semibold text-[11px]"
                  >
                    + 🖥️ Önden Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => addSpecificViewToReport('iso', '3B İzometrik Perspektif')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-semibold text-[11px]"
                  >
                    + 🧊 3B Perspektif Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const snap = captureCurrentAngleSnapshot();
                      if (snap) {
                        const next = [...capturedViews, { id: `view-custom-${Date.now()}`, angle: 'custom' as const, label: `Kamera Açısı #${capturedViews.length + 1}`, dataUrl: snap }];
                        setCapturedViews(next);
                        syncShadowReportToStorage(next, enabledPaftas);
                      }
                    }}
                    className="px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white font-semibold text-[11px] shadow"
                  >
                    + 📸 Aktif Açıyı Ekle
                  </button>
                  <button
                    type="button"
                    onClick={addAllAnglesToReport}
                    className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] shadow"
                  >
                    ⚡ Tüm Açıları Ekle
                  </button>
                </div>
              </div>

              {/* Eklenen Görünümler Şeridi & Silme Butonları */}
              {capturedViews.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-800">
                  <span className="text-[10.5px] text-slate-400 font-medium">Rapordaki 3B Görünümler:</span>
                  {capturedViews.map(v => (
                    <div
                      key={v.id}
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-[10.5px]"
                    >
                      <span className="text-slate-200 font-medium">{v.label}</span>
                      <button
                        type="button"
                        onClick={() => removeViewFromReport(v.id)}
                        className="text-rose-400 hover:text-rose-300 font-bold px-1 hover:bg-rose-950/60 rounded"
                        title="Rapordan Sil"
                      >
                        ✕ Sil
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setCapturedViews([]);
                      syncShadowReportToStorage([], enabledPaftas);
                    }}
                    className="text-[10px] text-rose-400 underline hover:text-rose-300 ml-auto"
                  >
                    Tümünü Temizle
                  </button>
                </div>
              )}

              {/* Vektörel Paftaların Raporda Gösterimi / Silinmesi */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800 text-[10.5px]">
                <span className="text-slate-400">Rapordaki 2B Paftalar:</span>
                {[
                  { k: 'sideSection' as const, label: 'Yandan Kesit Paftası' },
                  { k: 'frontElevation' as const, label: 'Perde Ön Paftası' },
                  { k: 'iso3d' as const, label: '🧊 3B İzometrik (Pafta 1)' },
                  { k: 'sideSection' as const, label: '📐 Yan Kesit (Pafta 2)' },
                  { k: 'frontElevation' as const, label: '🖼️ Perde Önü (Pafta 3)' },
                  { k: 'topPlan' as const, label: '⬆️ Üstten Plan (Pafta 4)' },
                ].map(p => (
                  <label key={p.k} className="flex items-center gap-1 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={enabledPaftas[p.k]}
                      onChange={() => togglePafta(p.k)}
                      className="accent-emerald-500"
                    />
                    <span className={enabledPaftas[p.k] ? 'text-emerald-300 font-medium' : 'text-slate-500 line-through'}>
                      {p.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {viewMode === '3d' ? (
              <div
                className={`rounded-lg border border-slate-700 bg-slate-950 overflow-hidden relative transition-all ${
                  is3DFullscreen
                    ? 'fixed inset-4 z-50 flex flex-col shadow-2xl'
                    : 'flex-1 min-h-[540px] h-[64vh]'
                }`}
              >
                {is3DFullscreen && (
                  <div className="p-2 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-xs">
                    <span className="font-bold text-sky-400">Tam Ekran 3B Görünüm</span>
                    <button
                      type="button"
                      onClick={() => setIs3DFullscreen(false)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      ✕ Kapat
                    </button>
                  </div>
                )}
                <Canvas
                  camera={{ position: sceneFraming.camPos, fov: sceneFraming.fovDeg }}
                  gl={{ preserveDrawingBuffer: true, antialias: true }}
                  onCreated={({ gl, scene, camera }) => {
                    glRef.current = gl;
                    sceneRef.current = scene;
                    cameraRef.current = camera as THREE.PerspectiveCamera;
                    gl.setClearColor(new THREE.Color('#070b14'), 1);
                  }}
                >
                  <Suspense fallback={null}>
                    <FovFrustum3DScene
                      pos={r.posM}
                      surfW={r.surfW}
                      surfH={r.surfH}
                      corners3D={r.proj.corners3D}
                      activeCorners3D={r.proj.activeCorners3D}
                      hasDigitalKeystone={r.proj.hasDigitalKeystone}
                      centerHit2D={r.proj.centerHit2D}
                      isFullCovered={r.proj.isFullSurfaceCovered}
                      deviceKind={deviceKind}
                      yawDeg={yaw}
                      pitchDeg={pitch}
                      rollDeg={roll}
                      isPortrait={deviceKind === 'projector' && orient === 'portrait'}
                      showPerson={showPerson}
                      showLabels={showSceneLabels}
                      shadow={r.shadow}
                    />
                    <OrbitControls
                      ref={controlsRef}
                      target={sceneFraming.target}
                      makeDefault
                    />
                  </Suspense>
                </Canvas>
              </div>
            ) : (
              <SurfaceFootprint2D
                surfW={r.surfW}
                surfH={r.surfH}
                corners2D={r.proj.corners2D}
                activeCorners2D={r.proj.activeCorners2D}
                hasDigitalKeystone={r.proj.hasDigitalKeystone}
                centerHit2D={r.proj.centerHit2D}
                isFullCovered={r.proj.isFullSurfaceCovered}
                showPerson={showPerson}
                showLabels={showSceneLabels}
                shadow={r.shadow}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SurfaceFootprint2D({
  surfW,
  surfH,
  corners2D,
  activeCorners2D,
  hasDigitalKeystone,
  centerHit2D,
  isFullCovered,
  showPerson,
  showLabels = true,
  shadow,
}: {
  surfW: number;
  surfH: number;
  corners2D: [number, number][];
  activeCorners2D: [number, number][];
  hasDigitalKeystone: boolean;
  centerHit2D: [number, number] | null;
  isFullCovered: boolean;
  showPerson: boolean;
  showLabels?: boolean;
  shadow: FovShadowResult;
}) {
  const xs = [-surfW / 2, surfW / 2, ...corners2D.map(c => c[0]), ...activeCorners2D.map(c => c[0])];
  const ys = [
    -surfH / 2,
    surfH / 2,
    ...(shadow.screenBottomHeightM > 0.01 ? [shadow.floorSceneY] : []),
    ...corners2D.map(c => c[1]),
    ...activeCorners2D.map(c => c[1]),
  ];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = span * 0.16;
  const vbX = minX - pad;
  const vbY = -maxY - pad;
  const vbW = maxX - minX + 2 * pad;
  const vbH = maxY - minY + 2 * pad;

  const rawPolyPoints = corners2D.map(([x, y]) => `${x},${-y}`).join(' ');
  const activePolyPoints = activeCorners2D.map(([x, y]) => `${x},${-y}`).join(' ');
  const shadowPolySvgPoints = (shadow.shadowPolygonScene2D || []).map(([x, y]) => `${x},${-y}`).join(' ');
  const accent = isFullCovered ? '#22c55e' : '#f59e0b';
  const fs = span * 0.032;

  return (
    <div className="flex-1 min-h-[420px] rounded-lg border border-slate-700 bg-slate-950 p-2 flex flex-col">
      <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="w-full flex-1 max-h-[55vh]">
        {/* Perde Yerden Yüksekteyse: Perde Altı Duvar / Boşluk ve Zemin Çizgisi */}
        {shadow.screenBottomHeightM > 0.01 && (
          <g>
            <rect
              x={-surfW / 2}
              y={surfH / 2}
              width={surfW}
              height={shadow.screenBottomHeightM}
              fill="#0f172a"
              fillOpacity={0.85}
              stroke="#475569"
              strokeDasharray={`${span / 70} ${span / 90}`}
              strokeWidth={span / 200}
            />
            <line
              x1={-surfW / 2 - span * 0.12}
              y1={-shadow.floorSceneY}
              x2={surfW / 2 + span * 0.12}
              y2={-shadow.floorSceneY}
              stroke="#64748b"
              strokeWidth={span / 140}
            />
            {showLabels && (
              <>
                <text
                  x={0}
                  y={surfH / 2 + shadow.screenBottomHeightM / 2 + fs * 0.32}
                  fill="#7dd3fc"
                  fontSize={fs * 0.85}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {`↕ Perde Yerden Başlangıç Yüksekliği: +${shadow.screenBottomHeightM.toFixed(2)}m (Üst Kenar: ${(shadow.screenBottomHeightM + surfH).toFixed(2)}m)`}
                </text>
                <text
                  x={surfW / 2 + span * 0.02}
                  y={-shadow.floorSceneY - fs * 0.2}
                  fill="#94a3b8"
                  fontSize={fs * 0.75}
                  textAnchor="start"
                >
                  Zemin (0.00m)
                </text>
              </>
            )}
          </g>
        )}
        <rect
          x={-surfW / 2}
          y={-surfH / 2}
          width={surfW}
          height={surfH}
          fill="#1e293b"
          stroke="#f8fafc"
          strokeWidth={span / 160}
        />
        {hasDigitalKeystone && (
          <polygon
            points={rawPolyPoints}
            fill="none"
            stroke="#94a3b8"
            strokeDasharray={`${span / 60} ${span / 80}`}
            strokeWidth={span / 160}
          />
        )}
        <polygon
          points={activePolyPoints}
          fill={accent}
          fillOpacity={0.28}
          stroke={accent}
          strokeWidth={span / 120}
        />
        {centerHit2D && (
          <circle cx={centerHit2D[0]} cy={-centerHit2D[1]} r={span / 90} fill="#38bdf8" />
        )}
        {showLabels && (
          <text
            x={0}
            y={-surfH / 2 - span * 0.03}
            fill="#f8fafc"
            fontSize={fs}
            fontWeight="bold"
            textAnchor="middle"
          >
            {`① Hedef Perde / Yüzey (${surfW.toFixed(2)}m × ${surfH.toFixed(2)}m · Yerden: +${shadow.screenBottomHeightM.toFixed(2)}m)`}
          </text>
        )}
        {showPerson && shadow.isCastingShadow && shadow.shadowRect2D && (
          <g>
            {/* Mühendislik Ölçü Sınır Kutusu (Kesik Çizgi) */}
            <rect
              x={shadow.shadowRect2D[0]}
              y={-shadow.shadowRect2D[3]}
              width={shadow.shadowWidthM}
              height={shadow.shadowHeightM}
              fill="none"
              stroke="#f87171"
              strokeDasharray={`${span / 80} ${span / 100}`}
              strokeWidth={span / 180}
            />
            {/* Gerçekçi İnsan Gölgesi Silüeti */}
            {shadowPolySvgPoints ? (
              <polygon
                points={shadowPolySvgPoints}
                fill="#020617"
                fillOpacity={0.92}
                stroke="#ef4444"
                strokeWidth={span / 140}
              />
            ) : (
              <rect
                x={shadow.shadowRect2D[0]}
                y={-shadow.shadowRect2D[3]}
                width={shadow.shadowWidthM}
                height={shadow.shadowHeightM}
                fill="#020617"
                fillOpacity={0.9}
                stroke="#ef4444"
                strokeWidth={span / 130}
              />
            )}
            {showLabels && (
              <>
                <text
                  x={(shadow.shadowRect2D[0] + shadow.shadowRect2D[2]) / 2}
                  y={-shadow.shadowRect2D[3] - fs * 0.35}
                  fill="#fecaca"
                  fontSize={fs * 0.85}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {`⬛ İNSAN GÖLGESİ (${shadow.shadowWidthM}m × ${shadow.shadowHeightM}m · %${shadow.shadowCoveragePct})`}
                </text>
              </>
            )}
          </g>
        )}
      </svg>
      <p className="text-[11px] text-slate-400 px-2 pt-1">
        Beyaz dikdörtgen: Hedef perde ({surfW.toFixed(2)}m × {surfH.toFixed(2)}m · Yerden +{shadow.screenBottomHeightM.toFixed(2)}m) · Renkli dörtgen: Aktif optik görüntü izdüşümü{hasDigitalKeystone ? ' (Kesik gri çerçeve: Ham optik ışık konisi)' : ''} · Siyah insan silüeti: İzleyicinin perdede oluşturduğu gerçek gölge izdüşümü.
      </p>
    </div>
  );
}
