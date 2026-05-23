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

/** Rate at which the repel "active" value chases the cursor target. Lower = softer ease. */
const ACTIVE_TRACK_RATE = 5;
/** Rate at which the rendered drag angle catches up to the raw mouse delta. Lower = more lag. */
const DRAG_TRACK_RATE = 7;
/** How quickly the smoothed-velocity reading catches up to the live reading. */
const VEL_TRACK_RATE = 8;
/** How quickly the raw velocity decays toward zero once the cursor stops moving. */
const VEL_IDLE_DECAY = 4;

/** Cubic ease in/out — gives S-curve shape to a 0..1 value. */
function smoothEase(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

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

  // Smoothed values for eased animations.
  const activeRaw = useRef(0);          // exponentially damped 0..1
  const smoothedVelMag = useRef(0);
  const smoothedVelDir = useRef(new THREE.Vector3());
  const renderedYaw = useRef(0);        // eased drag yaw
  const renderedPitch = useRef(0);      // eased drag pitch

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;

    const p = pointer.current;

    // ── Drag rotation (eased toward raw target) ──────────────────────────
    renderedYaw.current = THREE.MathUtils.damp(renderedYaw.current, p.dragYaw, DRAG_TRACK_RATE, delta);
    renderedPitch.current = THREE.MathUtils.damp(renderedPitch.current, p.dragPitch, DRAG_TRACK_RATE, delta);
    material.uniforms.uDragYaw.value = renderedYaw.current;
    material.uniforms.uDragPitch.value = renderedPitch.current;

    // ── Repel target ray ─────────────────────────────────────────────────
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

    // Two-stage ease: exponential damp + cubic smoothstep on top → S-curve
    // ramp-in and ramp-out instead of the snappy exponential default.
    activeRaw.current = THREE.MathUtils.damp(activeRaw.current, targetActive, ACTIVE_TRACK_RATE, delta);
    material.uniforms.uPointerActive.value = smoothEase(activeRaw.current);

    // ── Cursor velocity smoothing ────────────────────────────────────────
    const now = performance.now();
    const idleSec = p.lastMoveTime > 0 ? Math.min(0.5, (now - p.lastMoveTime) / 1000) : 0.5;
    const idleDecay = Math.exp(-idleSec * VEL_IDLE_DECAY);
    const rawVelX = p.velX * idleDecay;
    const rawVelY = p.velY * idleDecay;
    const rawMag = Math.hypot(rawVelX, rawVelY);

    smoothedVelMag.current = THREE.MathUtils.damp(smoothedVelMag.current, rawMag, VEL_TRACK_RATE, delta);

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
