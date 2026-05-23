# Architecture

This document explains how the dotted globe is built, why it's built that way, and which trade-offs each layer makes. For prop documentation and quick start, see [`README.md`](README.md). For agent-driven contributions, see [`CLAUDE.md`](CLAUDE.md).

## High-level

```
┌─────────────────────────────────────────────────────────────────────┐
│  React component tree                                               │
│                                                                     │
│  <DottedGlobe>             (props: dotCount, radius, …, theme color)│
│    └── <Canvas>            (R3F, sets up scene + camera + renderer) │
│         ├── <CameraRig>    (responsive camera distance)             │
│         └── <GlobePoints>  (the actual points cloud)                │
└─────────────────────────────────────────────────────────────────────┘
        ▲                              │
        │ uniforms each frame          │ pointer events
        │                              ▼
┌─────────────────────────┐   ┌─────────────────────────────────────┐
│  useFrame loop          │   │  usePointerInteraction (hook)       │
│  — raycast cursor       │◀──│  — NDC tracking                     │
│  — smooth velocity      │   │  — drag yaw/pitch accumulation       │
│  — smooth drag yaw/pitch│   │  — instantaneous velocity capture    │
│  — write uniforms       │   └─────────────────────────────────────┘
└─────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GPU vertex shader (globe.vert.glsl)                                │
│                                                                     │
│  per dot:                                                           │
│    1. compose rotation (auto-spin + accumulated drag yaw + pitch)   │
│    2. compute distance from dot to cursor RAY (not point)           │
│    3. apply velocity-elongated falloff envelope                     │
│    4. push outward by falloff × strength + wake along velocity      │
│    5. project to clip space, compute perspective-scaled point size  │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GPU fragment shader (globe.frag.glsl)                              │
│  — soft round dot via smoothstep on gl_PointCoord radius            │
│  — additive blending → cursor-distance edge brighten                │
└─────────────────────────────────────────────────────────────────────┘
```

Everything per-dot (rotation, repel, velocity physics, lighting) lives in the vertex shader. The CPU only does what *one* thing can't be parallelized: raycasting the cursor and exponentially smoothing scalar state.

## Pipeline, layer by layer

### 1. Static geometry — `createRingPositions(dotCount, radius)`

A pure function. Lays dots out on visible latitude rings (not Fibonacci) because the ring structure is the look we want.

- Ring count: `clamp(round(√(2·dotCount/π)), 24, 64)` — for the default 4,500 dots this is ~53 rings.
- Latitudes are evenly spaced from −85° to +85°. Caps are omitted to avoid degenerate ring sizes.
- Dots per ring scale with ring circumference so spacing stays roughly even.
- Returns `{ positions: Float32Array, normals: Float32Array, count }`. Normals are `position / radius`.

This is the only CPU work that scales with dot count — done once, on mount.

### 2. R3F mount — `<DottedGlobe />` and `<CameraRig />`

`<DottedGlobe />` is the public surface. It:

- Sets up an R3F `<Canvas>` (perspective camera, fov 45°, transparent, AA, hi-perf, dpr [1, 2]).
- Reads `--globe-dot` from CSS on the wrapping div via `getComputedStyle`, converts to a `THREE.Color`, passes to `<GlobePoints>`.
- Detects WebGL availability synchronously; if unsupported, renders `<WebGLFallback />` instead.
- Wraps the `<Canvas>` in a tiny class-based `<ErrorBoundary />` that falls back to `<WebGLFallback />` if Three.js throws at runtime.

`<CameraRig />` listens for viewport size changes and computes a camera distance that fits the globe regardless of aspect ratio:

```ts
const half = radius * 1.25;                       // padding factor
const vDist = half / Math.tan((fov * Math.PI) / 360);
const hDist = vDist / (width / height);
camera.position.z = Math.max(vDist, hDist);       // fit-to-larger
```

This is why a portrait phone, a landscape desktop, and a square card all show a properly framed globe without any media queries.

### 3. Pointer hook — `usePointerInteraction`

A single hook on `gl.domElement` (the canvas). State lives in a `useRef` so it doesn't trigger re-renders:

```ts
{
  ndcX, ndcY,           // current cursor in normalized device coords
  active,               // cursor on canvas?
  dragging,             // pointer pressed down on canvas?
  dragYaw, dragPitch,   // accumulated drag rotation in radians
  velX, velY,           // instantaneous velocity in NDC units/sec
  lastMoveTime          // performance.now() at last pointermove
}
```

Key behaviors:

- **NDC conversion** uses the canvas's `getBoundingClientRect()` each move so it stays accurate after resize.
- **Drag** uses `setPointerCapture` so dragging continues even when the cursor leaves the canvas. Cursor swaps `grab` → `grabbing`.
- **Velocity** is computed per `pointermove` as `(ΔNDC) / Δt`, with sanity bounds on `Δt` (`0.001 < dt < 0.2` seconds) to avoid divide-by-zero spikes after long idles.
- **No imperative state for the renderer** — the hook just publishes a ref; the shader reads via the per-frame loop in `<GlobePoints>`.

### 4. Per-frame loop — `<GlobePoints>` `useFrame`

This is the only CPU work per frame. It does four things:

#### a. Time

```ts
material.uniforms.uTime.value += delta;
```

`uTime * uRotationSpeed` is the auto-rotation angle. It runs at uniform speed always — this is deliberate. Easing this term would make the globe pulse.

#### b. Drag rotation (eased)

```ts
renderedYaw   = damp(renderedYaw,   pointer.dragYaw,   DRAG_TRACK_RATE, delta);
renderedPitch = damp(renderedPitch, pointer.dragPitch, DRAG_TRACK_RATE, delta);
```

The hook accumulates raw drag deltas instantly. The shader sees an exponentially-damped version, which gives drag a slight weighted lag — pleasant on quick flicks, invisible on slow drags.

#### c. Repel target

```ts
ndcVec.set(pointer.ndcX, pointer.ndcY);
raycaster.setFromCamera(ndcVec, camera);
const hit = raycaster.ray.intersectSphere(boundingSphere, out);
if (hit) {
  uRayOrigin = ray.origin;
  uRayDir    = ray.direction;
  targetActive = 1;
}
```

The bounding sphere is intentionally enlarged (`radius × 1.4`) so the dent stays anchored when the cursor drifts just past the visible silhouette.

Note we send the **ray** to the shader, not the hit point. The shader uses ray distance, so the hollow goes through both walls.

`uPointerActive` is double-eased:

```ts
activeRaw = damp(activeRaw, targetActive, ACTIVE_TRACK_RATE, delta);
uPointerActive = smoothstep(activeRaw);  // cubic ease-in-out on top
```

This produces an S-curve ramp-in / ramp-out — softer than the bare exponential.

#### d. Velocity smoothing

```ts
const idleSec  = (now - pointer.lastMoveTime) / 1000;
const decay    = Math.exp(-idleSec * VEL_IDLE_DECAY);
const rawMag   = Math.hypot(pointer.velX, pointer.velY) * decay;
const rawDir   = { x: pointer.velX * decay / rawMag, y: pointer.velY * decay / rawMag };

uVelMag = damp(uVelMag, rawMag, VEL_TRACK_RATE, delta);
uVelDir = damp(uVelDir, rawDir, VEL_TRACK_RATE, delta);
```

Two-stage smoothing: the *raw* reading decays toward zero exponentially based on how long the cursor has been idle, and the *shader-visible* value damps toward the raw reading. The combination is what produces the drift: a fast cursor stop leaves elevated velocity for ~250–400 ms before it falls back to zero, so the dent stays "boosted" briefly after motion stops.

### 5. Vertex shader — `globe.vert.glsl`

For each dot, in this order:

```glsl
// 1. Combined rotation: auto-spin around Y + accumulated drag (Y then X)
mat3 R = rotY(uTime * uRotationSpeed + uDragYaw) * rotX(uDragPitch);
vec3 rotatedPos = R * position;

// 2. Distance from this dot to the cursor RAY (perpendicular component)
vec3 toDot = rotatedPos - uRayOrigin;
vec3 perp  = toDot - dot(toDot, uRayDir) * uRayDir;
float dRay = length(perp);

// 3. Velocity-elongated metric (when moving): ellipsoid stretched along uVelDir
float dMetric = dRay;
if (vNorm > 0.05) {
  float alongVel  = dot(perp, uVelDir);
  vec3  perpToVel = perp - uVelDir * alongVel;
  float stretch   = 1.0 + vNorm * 0.6;
  dMetric = sqrt(dot(perpToVel, perpToVel) + (alongVel/stretch) * (alongVel/stretch));
}

// 4. Falloff envelope (velocity-inflated radius + strength)
float effRadius   = uRepelRadius   * (1.0 + vNorm * 0.35);
float effStrength = uRepelStrength * (1.0 + vNorm * 0.45);
float falloff    = 1.0 - smoothstep(0.0, effRadius, dMetric);

// 5. Displacement: outward from ray + small wake along velocity
vec3 awayDir   = perp / max(dRay, 0.0001);
vec3 displaced = rotatedPos
  + awayDir * (falloff * effStrength * uPointerActive)
  + uVelDir * (falloff * vNorm * 0.08 * uPointerActive);

// 6. Project + perspective-scale point size
vec4 mv      = modelViewMatrix * vec4(displaced, 1.0);
gl_Position  = projectionMatrix * mv;
gl_PointSize = uDotSize * (300.0 / -mv.z);
```

Where `vNorm = clamp(uVelMag / 6.0, 0.0, 1.0)` is the speed normalized so that "very fast" is 1. The multipliers (0.35, 0.45, 0.6, 0.08) are conservative on purpose — earlier iterations with values around 1.0 shredded the globe at high cursor speeds.

A custom attribute name `aNormal` (instead of `normal`) avoids any collision with Three.js's automatic per-vertex attributes that `ShaderMaterial` may inject.

### 6. Fragment shader — `globe.frag.glsl`

Trivial by comparison:

```glsl
vec2 c = gl_PointCoord - 0.5;
float r = length(c) * 2.0;
float alpha = smoothstep(1.0, 0.0, r);  // soft round dot
if (alpha < 0.02) discard;
vec3 color = uColor * (1.0 + vEdgeBoost * 0.7);  // brighten dots near cursor
gl_FragColor = vec4(color, alpha);
```

`vEdgeBoost` is passed from the vertex shader (`falloff × uPointerActive`) so dots in the affected zone are visibly brighter, sharpening the edge of the hole.

Additive blending (`THREE.AdditiveBlending`, `depthWrite: false`) gives the globe its soft glow — overlapping dots brighten naturally instead of stacking as opaque pixels.

## Tunables, by where they live

The further out you tune, the bigger the visual change:

| Location | Constant | Default | What changes |
|---|---|---|---|
| `<DottedGlobe />` props | `dotCount`, `radius`, `rotationSpeed`, `repelRadius`, `repelStrength`, `dotSize` | see README | Shape and intensity defaults |
| `GlobePoints.tsx` (top) | `ACTIVE_TRACK_RATE` | 5 | Repel ramp-in/out speed |
| `GlobePoints.tsx` (top) | `DRAG_TRACK_RATE` | 7 | Drag rotation lag |
| `GlobePoints.tsx` (top) | `VEL_TRACK_RATE` | 8 | How fast velocity reading updates |
| `GlobePoints.tsx` (top) | `VEL_IDLE_DECAY` | 4 | How quickly drift fades after motion stops |
| `globe.vert.glsl` | velocity coefficients | 0.35, 0.45, 0.6, 0.08 | Velocity-physics intensity |
| `globe.vert.glsl` | `(300.0 / -mv.z)` | — | Perspective scaling of point size |

When tuning feel, change the React-side constants first — they're safe and don't risk introducing visual artifacts. Touch shader coefficients only when you need to change *what* the physics is doing, not just *how much*.

## Trade-offs

- **Latitude rings vs Fibonacci:** rings give a visible "globe" structure from the side that matches the reference design. Fibonacci is more uniform but loses the latitude lines. Rings have a small density seam near the poles, which we hide by clipping at ±85° latitude.
- **Custom shader vs Three.js's built-in `PointsMaterial`:** built-in would be ~10 lines simpler but can't do per-dot velocity-aware deformation. The shader is the project.
- **`preserveDrawingBuffer: true`:** small performance cost, but enables screenshot tools (and the GIF script) to capture WebGL frames cleanly.
- **Drag uses raw mouse deltas, not pixel-to-radians-of-arc math:** correct math would feel jittery on touchpads. `DRAG_SENSITIVITY = 0.006 rad/px` is calibrated to feel natural with mouse, trackpad, and touch.
- **No `<OrbitControls>`:** drei's ships with momentum, damping, polar limits, etc. but it captures every pointer event before we can see them. Implementing drag-rotate manually lets the repel and drag coexist seamlessly.
- **WebGL 1, not WebGL 2:** WebGL 1 is 98%+ compatible. None of the shader features need WebGL 2.

## Performance

At default settings (4,500 dots, two triangles per dot, no depth writes, one draw call):

- One BufferGeometry, one ShaderMaterial, one draw call per frame.
- One CPU raycast per frame (cursor → bounding sphere).
- ~20 lines of CPU work per frame in `useFrame`. The rest is GPU.
- Targets 60 FPS on a 2020 MacBook Air (M1, integrated GPU) and modern smartphones; tested under iOS Safari and Android Chrome.

To scale up further, increase `dotCount` (GPU-bound, scales linearly until pixel fill rate hits — usually around 15–20k dots before noticeable slowdown).

## Testing

- `createRingPositions` is fully covered by unit tests (`vitest`): count, on-sphere distance, normal correctness, determinism, visible-rings structure.
- `<GlobePoints>` has a render-tree test via `@react-three/test-renderer` — no real WebGL needed, so it runs in CI under Node + jsdom.
- Visual verification is manual against `docs/media/globe-demo.gif` and the original reference images.

There is no per-pixel visual regression test; with a custom shader the standard approaches (snapshot-pixel-buffers) are flaky across GPU drivers. Manual review of the GIF is the verification.

## Future work — not yet implemented

- Touch-pinch zoom (currently disabled; touch falls through to native scrolling).
- Theme transition animation (currently CSS variable changes are instant).
- Configurable repel shape (currently always a sphere-tunnel; could be a ring, spiral, etc.).
- WebGPU backend (Three.js r166 has experimental support; would unlock compute-shader physics with per-dot state).
