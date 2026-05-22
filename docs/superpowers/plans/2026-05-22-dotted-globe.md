# Dotted Globe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive 3D dotted globe React component — auto-rotating, cursor-driven repel deformation, latitude-ring arrangement — plus a demo page that matches the reference image.

**Architecture:** Vite + React + TypeScript app. Globe is a self-contained `<DottedGlobe />` component using `@react-three/fiber`. Particles rendered as a single `THREE.Points` with a custom `ShaderMaterial`. Vertex shader handles auto-rotation and cursor repel on the GPU; CPU only raycasts the cursor once per frame and writes one uniform.

**Tech Stack:** Vite 5, React 18, TypeScript 5, three, @react-three/fiber, @react-three/drei, @react-three/test-renderer, vitest.

**Spec reference:** [`docs/superpowers/specs/2026-05-22-dotted-globe-design.md`](../specs/2026-05-22-dotted-globe-design.md)

---

## File Map

| Path | Responsibility |
|------|----------------|
| `package.json` | Dependencies, scripts |
| `vite.config.ts` | Vite config (React plugin + GLSL `?raw` import) |
| `tsconfig.json` / `tsconfig.node.json` | TypeScript config |
| `vitest.config.ts` | Vitest config |
| `index.html` | HTML entry, font preload, CSS variable defaults |
| `src/main.tsx` | React root mount |
| `src/App.tsx` | Demo page: dark bg + Get In Touch button + `<DottedGlobe />` |
| `src/App.css` | Page styles, ambient glow gradient |
| `src/components/DottedGlobe/index.tsx` | Public `<DottedGlobe />` component |
| `src/components/DottedGlobe/GlobePoints.tsx` | Inner R3F mesh w/ ShaderMaterial |
| `src/components/DottedGlobe/globe.vert.glsl` | Vertex shader |
| `src/components/DottedGlobe/globe.frag.glsl` | Fragment shader |
| `src/components/DottedGlobe/createRingPositions.ts` | Pure: lat/lng dot positions + normals |
| `src/components/DottedGlobe/usePointerNDC.ts` | Hook: cursor → NDC |
| `src/components/DottedGlobe/ErrorBoundary.tsx` | Tiny class-based boundary |
| `src/components/DottedGlobe/WebGLFallback.tsx` | Static SVG fallback |
| `src/components/DottedGlobe/__tests__/createRingPositions.test.ts` | Unit tests |
| `src/components/DottedGlobe/__tests__/DottedGlobe.test.tsx` | Render test |
| `src/vite-env.d.ts` | Type declarations for `?raw` imports |

---

## Task 1: Scaffold Vite + React + TypeScript project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.css`, `src/vite-env.d.ts`, `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "3d-globe-animation",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.166.1",
    "@react-three/fiber": "^8.17.10",
    "@react-three/drei": "^9.114.0"
  },
  "devDependencies": {
    "@react-three/test-renderer": "^8.3.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@types/three": "^0.166.0",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4",
    "jsdom": "^25.0.1"
  }
}
```

- [ ] **Step 2: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 6: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

declare module '*.glsl?raw' {
  const src: string;
  export default src;
}
```

- [ ] **Step 7: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>3D Dotted Globe</title>
    <style>
      :root {
        --globe-dot: #d4ff4a;
        --globe-glow: #aaff3a;
        --globe-bg: #000000;
      }
      html, body, #root { height: 100%; margin: 0; padding: 0; background: var(--globe-bg); }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #fff; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Create placeholder `src/App.tsx` and `src/App.css`** (filled in later tasks)

`src/App.tsx`:
```tsx
export default function App() {
  return <div>Globe coming…</div>;
}
```

`src/App.css`:
```css
/* Filled in Task 7 */
```

- [ ] **Step 10: Create `.gitignore`**

```
node_modules
dist
.DS_Store
.vite
coverage
.superpowers/
```

- [ ] **Step 11: Install dependencies**

Run: `npm install`
Expected: clean install, no errors.

- [ ] **Step 12: Verify dev server boots**

Run: `npm run dev`
Expected: Vite reports a local URL (e.g. `http://localhost:5173/`) and no errors. Stop with Ctrl-C.

- [ ] **Step 13: Verify type-check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git init
git add -A
git commit -m "chore(scaffold): vite + react + ts + r3f starter"
```

---

## Task 2: `createRingPositions` (pure function, TDD)

**Files:**
- Create: `src/components/DottedGlobe/createRingPositions.ts`
- Create: `src/components/DottedGlobe/__tests__/createRingPositions.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/components/DottedGlobe/__tests__/createRingPositions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createRingPositions } from '../createRingPositions';

describe('createRingPositions', () => {
  it('returns positions and normals of equal length', () => {
    const { positions, normals, count } = createRingPositions(4500, 1.6);
    expect(positions.length).toBe(count * 3);
    expect(normals.length).toBe(count * 3);
  });

  it('returns approximately the requested count of dots (within 15%)', () => {
    const target = 4500;
    const { count } = createRingPositions(target, 1.6);
    const ratio = count / target;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.15);
  });

  it('every position lies on the sphere of given radius', () => {
    const r = 1.6;
    const { positions, count } = createRingPositions(2000, r);
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const mag = Math.sqrt(x * x + y * y + z * z);
      expect(Math.abs(mag - r)).toBeLessThan(0.001);
    }
  });

  it('normals are unit length and equal to position / radius', () => {
    const r = 1.6;
    const { positions, normals, count } = createRingPositions(1000, r);
    for (let i = 0; i < count; i++) {
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];
      const nmag = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(Math.abs(nmag - 1)).toBeLessThan(0.001);

      expect(Math.abs(nx - positions[i * 3] / r)).toBeLessThan(0.001);
      expect(Math.abs(ny - positions[i * 3 + 1] / r)).toBeLessThan(0.001);
      expect(Math.abs(nz - positions[i * 3 + 2] / r)).toBeLessThan(0.001);
    }
  });

  it('different inputs produce different position arrays (no caching bug)', () => {
    const a = createRingPositions(1000, 1.0);
    const b = createRingPositions(2000, 1.0);
    expect(a.count).not.toBe(b.count);
  });

  it('positions are arranged on visible latitude rings (not random)', () => {
    const { positions, count } = createRingPositions(2000, 1.6);
    const uniqueYs = new Set<number>();
    for (let i = 0; i < count; i++) {
      uniqueYs.add(Math.round(positions[i * 3 + 1] * 1000));
    }
    expect(uniqueYs.size).toBeGreaterThan(20);
    expect(uniqueYs.size).toBeLessThan(80);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- createRingPositions`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

`src/components/DottedGlobe/createRingPositions.ts`:
```ts
export type RingPositions = {
  positions: Float32Array;
  normals: Float32Array;
  count: number;
};

export function createRingPositions(dotCount: number, radius: number): RingPositions {
  const ringCount = Math.min(64, Math.max(24, Math.round(Math.sqrt((2 * dotCount) / Math.PI))));

  const latMin = (-85 * Math.PI) / 180;
  const latMax = (85 * Math.PI) / 180;
  const latStep = (latMax - latMin) / (ringCount - 1);

  let totalCircumference = 0;
  const ringRadii: number[] = [];
  for (let i = 0; i < ringCount; i++) {
    const phi = latMin + i * latStep;
    const r = radius * Math.cos(phi);
    ringRadii.push(r);
    totalCircumference += 2 * Math.PI * r;
  }

  const positions: number[] = [];
  const normals: number[] = [];

  for (let i = 0; i < ringCount; i++) {
    const phi = latMin + i * latStep;
    const ringRadius = ringRadii[i];
    const y = radius * Math.sin(phi);

    const share = (2 * Math.PI * ringRadius) / totalCircumference;
    const dotsOnRing = Math.max(6, Math.round(dotCount * share));

    for (let j = 0; j < dotsOnRing; j++) {
      const theta = (j / dotsOnRing) * Math.PI * 2;
      const x = ringRadius * Math.cos(theta);
      const z = ringRadius * Math.sin(theta);
      positions.push(x, y, z);
      normals.push(x / radius, y / radius, z / radius);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    count: positions.length / 3,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- createRingPositions`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/DottedGlobe/createRingPositions.ts \
        src/components/DottedGlobe/__tests__/createRingPositions.test.ts
git commit -m "feat(globe): pure function for lat/lng ring positions"
```

---

## Task 3: Shader files

**Files:**
- Create: `src/components/DottedGlobe/globe.vert.glsl`
- Create: `src/components/DottedGlobe/globe.frag.glsl`

No tests — shaders are validated by the integration check in Task 4.

- [ ] **Step 1: Create `globe.vert.glsl`**

```glsl
uniform float uTime;
uniform vec3  uPointer;
uniform float uPointerActive;
uniform float uDotSize;
uniform float uRepelRadius;
uniform float uRepelStrength;
uniform float uRotationSpeed;

attribute vec3 aNormal;

varying float vEdgeBoost;

mat3 rotY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, -s,
              0.0, 1.0, 0.0,
              s, 0.0, c);
}

void main() {
  mat3 R = rotY(uTime * uRotationSpeed);
  vec3 rotatedPos    = R * position;
  vec3 rotatedNormal = R * aNormal;

  float d = distance(rotatedPos, uPointer);
  float falloff = 1.0 - smoothstep(0.0, uRepelRadius, d);
  vec3 displaced = rotatedPos + rotatedNormal * (falloff * uRepelStrength * uPointerActive);

  vEdgeBoost = falloff * uPointerActive;

  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uDotSize * (300.0 / -mv.z);
}
```

- [ ] **Step 2: Create `globe.frag.glsl`**

```glsl
precision mediump float;

uniform vec3 uColor;
varying float vEdgeBoost;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float alpha = smoothstep(1.0, 0.0, r);
  if (alpha < 0.02) discard;

  vec3 color = uColor * (1.0 + vEdgeBoost * 0.7);
  gl_FragColor = vec4(color, alpha);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/DottedGlobe/globe.vert.glsl src/components/DottedGlobe/globe.frag.glsl
git commit -m "feat(globe): vertex + fragment shaders for repel & soft dots"
```

---

## Task 4: `<GlobePoints>` component

**Files:**
- Create: `src/components/DottedGlobe/GlobePoints.tsx`
- Create: `src/components/DottedGlobe/usePointerNDC.ts`

- [ ] **Step 1: Create `usePointerNDC.ts`**

```ts
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

export type PointerState = { x: number; y: number; active: boolean };

export function usePointerNDC() {
  const gl = useThree((s) => s.gl);
  const ref = useRef<PointerState>({ x: 0, y: 0, active: false });

  useEffect(() => {
    const el = gl.domElement;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ref.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ref.current.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      ref.current.active = true;
    };
    const onLeave = () => {
      ref.current.active = false;
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerout', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerout', onLeave);
    };
  }, [gl]);

  return ref;
}
```

- [ ] **Step 2: Create `GlobePoints.tsx`**

```tsx
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/DottedGlobe/GlobePoints.tsx src/components/DottedGlobe/usePointerNDC.ts
git commit -m "feat(globe): r3f points component with shader uniforms and cursor raycast"
```

---

## Task 5: Public `<DottedGlobe>` + ErrorBoundary + WebGLFallback

**Files:**
- Create: `src/components/DottedGlobe/index.tsx`
- Create: `src/components/DottedGlobe/ErrorBoundary.tsx`
- Create: `src/components/DottedGlobe/WebGLFallback.tsx`

- [ ] **Step 1: Create `WebGLFallback.tsx`**

```tsx
export function WebGLFallback() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        color: 'var(--globe-dot)',
        fontSize: 14,
        opacity: 0.8,
      }}
    >
      <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r="70" fill="none" stroke="var(--globe-dot)" strokeOpacity="0.2" />
        {Array.from({ length: 30 }, (_, i) => {
          const a = (i / 30) * Math.PI * 2;
          return <circle key={i} cx={80 + Math.cos(a) * 60} cy={80 + Math.sin(a) * 60} r="1.5" fill="var(--globe-dot)" />;
        })}
      </svg>
      <span>Your browser doesn't support WebGL.</span>
    </div>
  );
}
```

- [ ] **Step 2: Create `ErrorBoundary.tsx`**

```tsx
import { Component, type ReactNode } from 'react';

type Props = { fallback: ReactNode; children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[DottedGlobe] render error:', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
```

- [ ] **Step 3: Create `index.tsx`**

```tsx
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GlobePoints } from './GlobePoints';
import { ErrorBoundary } from './ErrorBoundary';
import { WebGLFallback } from './WebGLFallback';

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
  rotationSpeed = 0.5,
  repelRadius = 0.7,
  repelStrength = 0.25,
  dotSize = 7.5,
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
    <div ref={wrapRef} className={className} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {supportsWebGL ? (
        <ErrorBoundary fallback={<WebGLFallback />}>
          <Canvas
            camera={{ position: [0, 0, 4], fov: 45 }}
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
            dpr={[1, 2]}
          >
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
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/DottedGlobe/index.tsx src/components/DottedGlobe/ErrorBoundary.tsx src/components/DottedGlobe/WebGLFallback.tsx
git commit -m "feat(globe): public DottedGlobe component with WebGL fallback"
```

---

## Task 6: Render test for `<DottedGlobe>`

**Files:**
- Create: `src/components/DottedGlobe/__tests__/DottedGlobe.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { GlobePoints } from '../GlobePoints';
import * as THREE from 'three';

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
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- DottedGlobe`
Expected: PASS.

(If `@react-three/test-renderer` complains about ESM/CJS interop, add `"resolve": { "conditions": ["browser"] }` to `vitest.config.ts`'s `test` block. Re-run.)

- [ ] **Step 3: Commit**

```bash
git add src/components/DottedGlobe/__tests__/DottedGlobe.test.tsx
git commit -m "test(globe): render test verifying scene + geometry attributes"
```

---

## Task 7: Demo page (App + button + ambient glow)

**Files:**
- Modify: `src/App.tsx`, `src/App.css`

- [ ] **Step 1: Replace `src/App.css`**

```css
.app {
  position: relative;
  width: 100%;
  height: 100vh;
  background: var(--globe-bg);
  overflow: hidden;
}

.app::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 12% 55%, rgba(170, 255, 58, 0.22), transparent 35%),
    radial-gradient(circle at 90% 10%, rgba(170, 255, 58, 0.10), transparent 40%);
  pointer-events: none;
  z-index: 1;
}

.app__top {
  position: absolute;
  top: 24px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 3;
}

.app__cta {
  background: var(--globe-dot);
  color: #051000;
  border: none;
  font-weight: 600;
  font-size: 15px;
  padding: 12px 22px;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 8px 32px rgba(212, 255, 74, 0.25);
}

.app__cta:hover { filter: brightness(1.05); }

.app__globe {
  position: absolute;
  inset: 0;
  z-index: 2;
}
```

- [ ] **Step 2: Replace `src/App.tsx`**

```tsx
import { DottedGlobe } from './components/DottedGlobe';

export default function App() {
  return (
    <div className="app">
      <header className="app__top">
        <button className="app__cta" type="button">Get In Touch</button>
      </header>
      <div className="app__globe">
        <DottedGlobe />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + tests + manual run**

```bash
npx tsc -b --noEmit
npm test
npm run dev
```

Expected:
- type-check: pass
- tests: pass
- dev server: opens at `http://localhost:5173/`, you see the globe.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "feat(app): demo page with Get In Touch CTA and ambient glow"
```

---

## Task 8: Final verification + dev server hand-off

- [ ] **Step 1: Full type-check**

Run: `npx tsc -b --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Full test run**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Build verification**

Run: `npm run build`
Expected: build completes, `dist/` folder is created with bundled assets.

- [ ] **Step 4: Start dev server in background**

Run: `npm run dev` (background)
Wait until Vite reports the URL.

- [ ] **Step 5: Report to user**

Tell user:
- Dev server URL
- Test results
- File summary
- Ask them to verify visually in browser

---

## Self-Review

- ✅ **Spec coverage:** Every spec section maps to a task:
  - Tech stack & deps → Task 1
  - `createRingPositions` → Task 2
  - Shaders → Task 3
  - `<GlobePoints>`, `usePointerNDC` → Task 4
  - `<DottedGlobe>`, ErrorBoundary, WebGLFallback → Task 5
  - Tests → Tasks 2, 6
  - Demo page + ambient glow → Task 7
  - Final verification → Task 8
- ✅ **Placeholder scan:** No TBDs, all code shown inline.
- ✅ **Type consistency:** `createRingPositions` return type, `GlobePoints` props, shader attribute name `aNormal` all match across tasks.
- ✅ **CSS variables:** `--globe-dot` consumed in both `WebGLFallback` and `index.tsx`.
- ✅ **Acceptance criteria from spec covered:** dev server (Task 1, 7, 8), visual match (Tasks 3, 5, 7), cursor dent (Tasks 3, 4), auto-rotation (Tasks 3, 4), tests (Tasks 2, 6), browser support (Task 5 fallback).
