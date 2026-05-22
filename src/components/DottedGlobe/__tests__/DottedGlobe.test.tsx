import { describe, expect, it } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { GlobePoints } from '../GlobePoints';

describe('GlobePoints', () => {
  it('mounts and produces a Points object with position + aNormal attributes', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <GlobePoints
        dotCount={500}
        radius={1.6}
        rotationSpeed={0.5}
        repelRadius={0.7}
        repelStrength={0.25}
        dotSize={7.5}
        color={new THREE.Color('#d4ff4a')}
      />,
    );

    const points = renderer.scene.findByType('Points');
    expect(points).toBeTruthy();

    const geom = (points.instance as THREE.Points).geometry as THREE.BufferGeometry;
    expect(geom.getAttribute('position')).toBeTruthy();
    expect(geom.getAttribute('aNormal')).toBeTruthy();

    const positionAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    expect(positionAttr.itemSize).toBe(3);
    expect(positionAttr.count).toBeGreaterThan(400);
  });
});
