import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import vertexShader from './globe.vert.glsl?raw';
import fragmentShader from './globe.frag.glsl?raw';
import { createRingPositions } from './createRingPositions';
import { usePointerInteraction } from './usePointerNDC';

type Props = {
  dotCount: number;
  radius: number;
  rotationSpeed: number;
  repelRadius: number;
  repelStrength: number;
  dotSize: number;
  color: THREE.Color;
};

/** How quickly the smoothed-velocity reading catches up to the live reading. */
const VEL_TRACK_RATE = 14;
/** How quickly the raw velocity decays toward zero once the cursor stops moving. */
const VEL_IDLE_DECAY = 6;

export function GlobePoints({
  dotCount,
  radius,
  rotationSpeed,
  repelRadius,
  repelStrength,
  dotSize,
  color,
}: Props) {
  const camera = useThree((s) => s.camera);
  const pointer = usePointerInteraction();

  const { geometry, material, sphere } = useMemo(() => {
    const ringData = createRingPositions(dotCount, radius);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(ringData.positions, 3));
    geom.setAttribute('aNormal', new THREE.BufferAttribute(ringData.normals, 3));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:           { value: 0 },
        uRayOrigin:      { value: new THREE.Vector3(0, 0, 999) },
        uRayDir:         { value: new THREE.Vector3(0, 0, -1) },
        uVelDir:         { value: new THREE.Vector3(0, 0, 0) },
        uVelMag:         { value: 0 },
        uPointerActive:  { value: 0 },
        uColor:          { value: color.clone() },
        uDotSize:        { value: dotSize },
        uRepelRadius:    { value: repelRadius },
        uRepelStrength:  { value: repelStrength },
        uRotationSpeed:  { value: rotationSpeed },
        uDragYaw:        { value: 0 },
        uDragPitch:      { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return {
      geometry: geom,
      material: mat,
      sphere: new THREE.Sphere(new THREE.Vector3(0, 0, 0), radius * 1.4),
    };
  }, [dotCount, radius, rotationSpeed, repelRadius, repelStrength, dotSize, color]);

  const raycaster = useRef(new THREE.Raycaster());
  const ndcVec = useRef(new THREE.Vector2());
  const hitPoint = useRef(new THREE.Vector3());
  // Smoothed cursor velocity — tracks the raw reading but with damping so a
  // single fast frame doesn't snap the visuals.
  const smoothedVelMag = useRef(0);
  const smoothedVelDir = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;
    material.uniforms.uDragYaw.value = pointer.current.dragYaw;
    material.uniforms.uDragPitch.value = pointer.current.dragPitch;

    const p = pointer.current;

    // ── Repel target (ray from camera through cursor) ────────────────────
    let targetActive = 0;
    if (p.active) {
      ndcVec.current.set(p.ndcX, p.ndcY);
      raycaster.current.setFromCamera(ndcVec.current, camera);
      const ray = raycaster.current.ray;
      const hit = ray.intersectSphere(sphere, hitPoint.current);
      if (hit) {
        material.uniforms.uRayOrigin.value.copy(ray.origin);
        material.uniforms.uRayDir.value.copy(ray.direction).normalize();
        targetActive = 1;
      }
    }
    const curActive = material.uniforms.uPointerActive.value as number;
    material.uniforms.uPointerActive.value = THREE.MathUtils.damp(curActive, targetActive, 8, delta);

    // ── Cursor velocity smoothing ────────────────────────────────────────
    // Time since last pointermove (capped); used to decay the raw velocity
    // reading toward zero when the cursor is idle.
    const now = performance.now();
    const idleSec = p.lastMoveTime > 0 ? Math.min(0.5, (now - p.lastMoveTime) / 1000) : 0.5;
    const idleDecay = Math.exp(-idleSec * VEL_IDLE_DECAY);
    const rawVelX = p.velX * idleDecay;
    const rawVelY = p.velY * idleDecay;
    const rawMag = Math.hypot(rawVelX, rawVelY);

    smoothedVelMag.current = THREE.MathUtils.damp(smoothedVelMag.current, rawMag, VEL_TRACK_RATE, delta);

    // For direction we damp the vector rather than re-normalize each frame —
    // produces a smoother, more natural-looking trail when cursor changes
    // direction quickly.
    const targetDir = rawMag > 0.001
      ? { x: rawVelX / rawMag, y: rawVelY / rawMag }
      : { x: 0, y: 0 };
    smoothedVelDir.current.x = THREE.MathUtils.damp(smoothedVelDir.current.x, targetDir.x, VEL_TRACK_RATE, delta);
    smoothedVelDir.current.y = THREE.MathUtils.damp(smoothedVelDir.current.y, targetDir.y, VEL_TRACK_RATE, delta);
    smoothedVelDir.current.z = 0;

    material.uniforms.uVelMag.value = smoothedVelMag.current;
    material.uniforms.uVelDir.value.copy(smoothedVelDir.current);
  });

  return <points geometry={geometry} material={material} />;
}
