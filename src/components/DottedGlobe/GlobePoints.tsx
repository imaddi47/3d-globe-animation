import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import vertexShader from './globe.vert.glsl?raw';
import fragmentShader from './globe.frag.glsl?raw';
import { createRingPositions } from './createRingPositions';
import { usePointerNDC } from './usePointerNDC';

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
  const pointer = usePointerNDC();

  const { geometry, material, sphere } = useMemo(() => {
    const ringData = createRingPositions(dotCount, radius);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(ringData.positions, 3));
    geom.setAttribute('aNormal', new THREE.BufferAttribute(ringData.normals, 3));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:           { value: 0 },
        uPointer:        { value: new THREE.Vector3(999, 999, 999) },
        uPointerActive:  { value: 0 },
        uColor:          { value: color.clone() },
        uDotSize:        { value: dotSize },
        uRepelRadius:    { value: repelRadius },
        uRepelStrength:  { value: repelStrength },
        uRotationSpeed:  { value: rotationSpeed },
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
      sphere: new THREE.Sphere(new THREE.Vector3(0, 0, 0), radius),
    };
  }, [dotCount, radius, rotationSpeed, repelRadius, repelStrength, dotSize, color]);

  const raycaster = useRef(new THREE.Raycaster());
  const ndcVec = useRef(new THREE.Vector2());
  const hitPoint = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;

    const p = pointer.current;
    let targetActive = 0;
    if (p.active) {
      ndcVec.current.set(p.x, p.y);
      raycaster.current.setFromCamera(ndcVec.current, camera);
      const hit = raycaster.current.ray.intersectSphere(sphere, hitPoint.current);
      if (hit) {
        material.uniforms.uPointer.value.copy(hit);
        targetActive = 1;
      }
    }

    const cur = material.uniforms.uPointerActive.value as number;
    material.uniforms.uPointerActive.value = THREE.MathUtils.damp(cur, targetActive, 8, delta);
  });

  return <points geometry={geometry} material={material} />;
}
