import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GlobePoints } from './GlobePoints';
import { ErrorBoundary } from './ErrorBoundary';
import { WebGLFallback } from './WebGLFallback';

function CameraRig({ radius }: { radius: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const fov = 45;
    const half = radius * 1.25;
    const vDist = half / Math.tan((fov * Math.PI) / 360);
    const hDist = vDist / aspect;
    const dist = Math.max(vDist, hDist);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, radius]);
  return null;
}

export type DottedGlobeProps = {
  dotCount?: number;
  radius?: number;
  rotationSpeed?: number;
  repelRadius?: number;
  repelStrength?: number;
  dotSize?: number;
  className?: string;
};

function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export function DottedGlobe({
  dotCount = 4500,
  radius = 1.6,
  rotationSpeed = 0.22,
  repelRadius = 0.45,
  repelStrength = 0.55,
  dotSize = 0.05,
  className,
}: DottedGlobeProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [color, setColor] = useState(() => new THREE.Color('#d4ff4a'));
  const [supportsWebGL] = useState(detectWebGL);

  useEffect(() => {
    if (!wrapRef.current) return;
    const cssColor = getComputedStyle(wrapRef.current).getPropertyValue('--globe-dot').trim();
    if (cssColor) setColor(new THREE.Color(cssColor));
  }, []);

  const props = useMemo(
    () => ({ dotCount, radius, rotationSpeed, repelRadius, repelStrength, dotSize, color }),
    [dotCount, radius, rotationSpeed, repelRadius, repelStrength, dotSize, color],
  );

  return (
    <div ref={wrapRef} className={className} style={{ width: '100%', height: '100%', position: 'relative', cursor: supportsWebGL ? 'grab' : 'default' }}>
      {supportsWebGL ? (
        <ErrorBoundary fallback={<WebGLFallback />}>
          <Canvas
            camera={{ position: [0, 0, 5.5], fov: 45 }}
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
            dpr={[1, 2]}
          >
            <CameraRig radius={radius} />
            <GlobePoints {...props} />
          </Canvas>
        </ErrorBoundary>
      ) : (
        <WebGLFallback />
      )}
    </div>
  );
}

export default DottedGlobe;
