# Interactive 3D Dotted Globe — Design Spec

**Date:** 2026-05-22
**Status:** Approved — ready for implementation

## Goal

Build a reusable React component that renders a 3D globe made of glowing dots arranged in latitude rings. The globe slowly auto-rotates. When the cursor moves over it, nearby dots are pushed outward along the sphere's surface normal, creating a soft "dent" that follows the cursor. Matches the reference images (yellow-green dots on a dark background with soft ambient glow).

## Non-Goals

- No world-map data (no continents). Uniform latitude rings only.
- No drag-to-rotate. Cursor only causes the repel/dent effect.
- No zoom controls.
- No mobile touch support beyond what `pointermove` provides natively (touch will trigger the repel while a finger is on the canvas — that's fine; we don't need to design more).

## User-Visible Behavior

1. On page load, a globe of glowing dots appears, centered in the viewport on a dark background.
2. The globe auto-rotates slowly around the vertical (Y) axis — one rotation every ~12 seconds.
3. As the user moves the cursor over the globe area, dots within a defined radius of the cursor's projected position push outward along their surface normal, creating a soft circular depression. The dent moves with the cursor.
4. When the cursor leaves the canvas, the dent smoothly relaxes back to zero displacement over ~300ms.
5. Dots near the cursor are also slightly brighter (additive in fragment shader).
6. A "Get In Touch" pill button is rendered at the top of the demo page for layout parity with the reference image.

## Tech Stack

- **Build:** Vite 5 + React 18 + TypeScript
- **3D:** `three` (latest stable), `@react-three/fiber`, `@react-three/drei`
- **Testing:** `vitest` + `@react-three/test-renderer` (no real WebGL needed)
- **Browser support:** WebGL 1 (Chrome, Firefox, Safari, Edge — desktop and mobile). Graceful fallback message if unavailable.

## Architecture

### File layout

```
3d-globe-animation/
├── index.html                    # Vite entry; sets dark background + CSS vars
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
└── src/
    ├── main.tsx                  # React.createRoot mount
    ├── App.tsx                   # Demo page: button + <DottedGlobe />
    ├── App.css                   # Page styles + CSS variables for theme
    ├── components/
    │   └── DottedGlobe/
    │       ├── index.tsx                # <DottedGlobe> public component (Canvas + Scene)
    │       ├── GlobePoints.tsx          # <points> mesh with ShaderMaterial + per-frame logic
    │       ├── globe.vert.glsl          # Vertex shader (auto-rotate + repel)
    │       ├── globe.frag.glsl          # Fragment shader (soft round dots + edge glow)
    │       ├── createRingPositions.ts   # Pure: lat/lng dot positions
    │       ├── usePointerNDC.ts         # Cursor → normalized device coords
    │       └── WebGLFallback.tsx        # Static SVG shown if WebGL unavailable
    └── __tests__/
        ├── createRingPositions.test.ts
        └── DottedGlobe.smoke.test.tsx
```

### Public component API

```tsx
type DottedGlobeProps = {
  dotCount?: number;        // default 4500
  radius?: number;          // default 1.6 (Three.js world units)
  rotationSpeed?: number;   // radians/sec; default 0.5 (~12s/rotation)
  repelRadius?: number;     // default 0.7 (world units)
  repelStrength?: number;   // default 0.25 (max outward displacement in world units)
  dotSize?: number;         // default 7.5 (pixel-scaled coefficient — see shader)
  className?: string;       // applied to wrapping div
};
```

Color is read from CSS variables on the wrapping div:

```css
:root {
  --globe-dot: #d4ff4a;     /* Main dot color */
  --globe-glow: #aaff3a;    /* Edge-of-globe ambient glow */
  --globe-bg: #000000;
}
```

Consumers override by setting the variables on a parent element or via `style` prop on a parent.

### Components

**`<DottedGlobe>` (`components/DottedGlobe/index.tsx`)**

- Wraps an R3F `<Canvas>` in a div with the canvas filling 100% width/height of that div.
- Reads CSS variables on mount via `getComputedStyle` and passes the dot color to `<GlobePoints>`.
- Wraps `<GlobePoints>` in a `<Suspense>` and `<ErrorBoundary>`; the boundary renders `<WebGLFallback />` on error.
- Sets camera: `PerspectiveCamera`, fov 45, position `[0, 0, 4]`, looking at origin.
- Renders a transparent canvas (background comes from the parent div / CSS var).
- Wrapping div has a CSS radial gradient producing the soft off-center green ambient glow seen in the reference. No Three.js lights — the `ShaderMaterial` does its own coloring.
- Includes a small inline `ErrorBoundary` (React class component) since React has no built-in boundary.

**`<GlobePoints>` (`components/DottedGlobe/GlobePoints.tsx`)**

- Creates the `BufferGeometry` once with `createRingPositions(dotCount, radius)`.
- Creates the `ShaderMaterial` with uniforms:
  - `uTime: float` — incremented each frame
  - `uPointer: vec3` — cursor projected onto the sphere in world space
  - `uPointerActive: float` — 0 to 1, smoothly ramps with cursor enter/leave
  - `uColor: vec3` — from CSS variable
  - `uDotSize: float`
  - `uRepelRadius: float`
  - `uRepelStrength: float`
  - `uRotationSpeed: float`
  - `uRadius: float`
- Uses `useFrame((state, delta) => …)`:
  1. Advance `uTime += delta`.
  2. Compute pointer world position: build a `THREE.Raycaster`, call `setFromCamera(ndc, camera)`, then `ray.intersectSphere(new THREE.Sphere(origin, radius), outVec)`. If hit, write `outVec` to `uPointer` and ramp `uPointerActive` toward 1 with `MathUtils.damp(current, 1, 8, delta)` (~300ms settling). If miss or cursor off-canvas, ramp toward 0 the same way.
  3. Set material `transparent = true`, `depthWrite = false`, `blending = AdditiveBlending` for the soft glow.
- Renders a single `<points>` with `<bufferGeometry>` and the material.

**`usePointerNDC()` (`components/DottedGlobe/usePointerNDC.ts`)**

- Returns `useRef<{ x: number; y: number; active: boolean }>`.
- Attaches `pointermove`, `pointerleave`, `pointerenter` to the R3F `gl.domElement` via `useThree`.
- Converts client coords to NDC: `((clientX - rect.left) / rect.width) * 2 - 1`, `-(((clientY - rect.top) / rect.height) * 2 - 1)`.
- Cleans up on unmount.

**`createRingPositions(dotCount, radius)` (`components/DottedGlobe/createRingPositions.ts`)**

- Pure function. Returns `{ positions: Float32Array, normals: Float32Array, count: number }` where both arrays have length `count * 3`. Normals are bound to the geometry as the `aNormal` attribute.
- Algorithm:
  1. Decide ring count: `Math.round(Math.sqrt(2 * dotCount / Math.PI))`, clamped to [24, 64]. Latitudes evenly spaced from −85° to +85°. For dotCount=4500 this lands near 53 rings.
  2. For each ring at latitude φ: ring radius `r = radius * cos(φ)`, ring y `y = radius * sin(φ)`. Dot count for that ring proportional to `r` so spacing stays even.
  3. For each dot at longitude θ: write position `(r*cosθ, y, r*sinθ)` and normal `(cosφ*cosθ, sinφ, cosφ*sinθ)` (i.e. position / radius, since dot is on the surface).
  4. Total dots will land near `dotCount` but exact count depends on rounding — return the actual count for the buffer attribute.

**`WebGLFallback.tsx`**

- Renders a static SVG of dots in a circle plus a "Your browser doesn't support WebGL" message in subdued styling. Same color scheme as the live globe.

### Shaders

Imported as strings via Vite's `?raw` suffix:

```ts
import vertexShader   from './globe.vert.glsl?raw';
import fragmentShader from './globe.frag.glsl?raw';
```

No extra Vite plugin needed.

**`globe.vert.glsl`**

```glsl
uniform float uTime;
uniform vec3  uPointer;
uniform float uPointerActive;
uniform float uDotSize;
uniform float uRepelRadius;
uniform float uRepelStrength;
uniform float uRotationSpeed;
uniform float uRadius;

attribute vec3 aNormal;  // per-dot surface normal in object space (avoid Three.js built-in `normal`)

varying float vDistFromPointer;
varying float vNormalizedDist;

mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

void main() {
  mat3 R = rotY(uTime * uRotationSpeed);
  vec3 rotatedPos    = R * position;
  vec3 rotatedNormal = R * aNormal;

  float d = distance(rotatedPos, uPointer);
  float falloff = 1.0 - smoothstep(0.0, uRepelRadius, d);
  vec3 displaced = rotatedPos + rotatedNormal * (falloff * uRepelStrength * uPointerActive);

  vDistFromPointer = d;
  vNormalizedDist  = falloff;

  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uDotSize * (300.0 / -mv.z);  // perspective-scaled
}
```

**`globe.frag.glsl`**

```glsl
uniform vec3 uColor;
varying float vNormalizedDist;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float alpha = smoothstep(1.0, 0.0, r);
  if (alpha < 0.02) discard;

  vec3 color = uColor * (1.0 + vNormalizedDist * 0.6);  // brighter near cursor
  gl_FragColor = vec4(color, alpha);
}
```

## Data Flow

```
pointermove event
  ↓ (usePointerNDC)
useRef<{x, y, active}>  (normalized device coords on canvas)
  ↓ (useFrame in GlobePoints)
raycaster.setFromCamera(NDC, camera)
  ↓
raycaster.intersectSphere(boundingSphere)
  ↓
THREE.Vector3 worldPos  →  material.uniforms.uPointer.value
                          (uPointerActive lerped toward 1 or 0)
  ↓
GPU vertex shader: per-dot rotation + repel along normal
GPU fragment shader: soft round dot + cursor-distance brightening
  ↓
Browser frame
```

## Page Layout (Demo)

- `<body>` and `#root` fill viewport.
- `App.tsx` renders:
  - A full-viewport flex column on a dark background.
  - Top: centered "Get In Touch" pill button (~16px padding, lime fill, rounded-full).
  - Below: `<DottedGlobe />` filling remaining space, with a subtle CSS radial-gradient behind the canvas to produce the off-center green ambient glow seen in the reference.

## Error Handling

- WebGL detection on mount in `<DottedGlobe>` using `document.createElement('canvas').getContext('webgl')`. If null → render `<WebGLFallback />` instead of `<Canvas>`.
- Error boundary around `<Canvas>` catches Three.js initialization errors → renders `<WebGLFallback />`.
- Out-of-canvas pointer events safely treated as "no repel" — `uPointerActive` ramps to 0.

## Testing

- **Unit tests (vitest):**
  - `createRingPositions(n, r)`:
    - Returns a Float32Array of length ≈ `n * 3` (within ±10%).
    - Every position vector has magnitude ≈ `r` (within 0.001).
    - Normals match positions normalized (within 0.001).
    - Different inputs produce different outputs (no caching bug).
- **Render test (vitest + `@react-three/test-renderer`):**
  - `<DottedGlobe />` produces a scene with a `Points` object.
  - The points geometry has both `position` and `aNormal` attributes.
  - `@react-three/test-renderer` does not require a real WebGL context, so this runs cleanly under Node/jsdom.
- **Manual visual verification:** Open `npm run dev`, confirm:
  1. Globe is visible, dots glow yellow-green.
  2. Latitude rings are visible.
  3. Globe rotates slowly.
  4. Moving cursor over globe creates a dent that follows it.
  5. Leaving canvas relaxes the dent.

## Performance Targets

- 60 FPS at 4500 dots on a mid-tier laptop (M1 / Intel Iris).
- Single draw call per frame for the globe (all dots in one BufferGeometry).
- Single raycast per frame, single uniform write — everything else GPU.

## CSS Variables (Defaults)

```css
:root {
  --globe-dot:  #d4ff4a;
  --globe-glow: #aaff3a;
  --globe-bg:   #000000;
}
```

## Acceptance Criteria

1. `npm install && npm run dev` opens a working page.
2. Visual match to reference image (latitude-ring sphere, yellow-green dots, dark bg, soft glow).
3. Cursor-over-canvas creates a smoothly following dent.
4. Auto-rotation is continuous and smooth.
5. `npm run test` passes all unit + smoke tests.
6. Works in current Chrome, Firefox, Safari, Edge.
