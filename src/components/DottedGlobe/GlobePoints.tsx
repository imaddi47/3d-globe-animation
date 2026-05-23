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

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;
    material.uniforms.uDragYaw.value = pointer.current.dragYaw;
    material.uniforms.uDragPitch.value = pointer.current.dragPitch;

    const p = pointer.current;
    let targetActive = 0;
    if (p.active) {
      ndcVec.current.set(p.ndcX, p.ndcY);
      raycaster.current.setFromCamera(ndcVec.current, camera);

      // We test against an enlarged sphere so the dent stays anchored even
      // when the cursor drifts slightly past the visible silhouette.
      const ray = raycaster.current.ray;
      const hit = ray.intersectSphere(sphere, hitPoint.current);
      if (hit) {
        material.uniforms.uRayOrigin.value.copy(ray.origin);
        material.uniforms.uRayDir.value.copy(ray.direction).normalize();
        targetActive = 1;
      }
    }

    const cur = material.uniforms.uPointerActive.value as number;
    material.uniforms.uPointerActive.value = THREE.MathUtils.damp(cur, targetActive, 8, delta);
  });

  return <points geometry={geometry} material={material} />;
}
