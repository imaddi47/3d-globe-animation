# 3D Dotted Globe — Claude Guide

Project-specific guidance for Claude sessions working on this codebase.

## What this project is

An interactive 3D dotted globe React component built with React Three Fiber.
The globe auto-rotates uniformly, the cursor pokes a hollow tunnel straight
through both walls of the sphere, click-and-drag rotates the globe manually,
and cursor velocity drives a physics-flavored response (faster motion →
larger and elongated repel zone, with a lingering drift after motion stops).

The component is reusable (`<DottedGlobe />`) and ships with a demo page
that mirrors the reference design (lime-green dots on black, "Get In Touch"
pill CTA, soft ambient glow).

## Tech stack

- **Vite 5** + **React 18** + **TypeScript 5**
- **three** `^0.166`
- **@react-three/fiber** `^8.17` — React renderer for Three.js
- **@react-three/drei** `^9.114` — helpers (currently unused at runtime; can be removed if not needed)
- **vitest** + **@react-three/test-renderer** for tests (no real WebGL required in CI)
- **jsdom** as the test environment

Required Node ≥ 18. Default dev port is `5190` (locked via `vite.config.ts`).

## Common commands

```bash
npm install        # one-time
npm run dev        # vite dev server on http://localhost:5190 (strictPort)
npm run build      # tsc --noEmit then vite build
npm test           # vitest run (CI mode)
npm run test:watch # vitest watch mode
```

## Important file map

```
src/
├── main.tsx                       # React root
├── App.tsx                        # Demo page
├── App.css                        # Page-level theme + ambient glow
└── components/DottedGlobe/
    ├── index.tsx                  # <DottedGlobe /> public component + <CameraRig />
    ├── GlobePoints.tsx            # R3F <points> with ShaderMaterial + per-frame logic
    ├── globe.vert.glsl            # Vertex shader: rotation, repel, velocity physics
    ├── globe.frag.glsl            # Fragment shader: soft round dots, edge brightening
    ├── createRingPositions.ts     # Pure function: lat/lng ring positions + normals
    ├── usePointerNDC.ts           # Pointer hook: NDC + drag + velocity tracking
    ├── ErrorBoundary.tsx          # Renders <WebGLFallback /> on render errors
    └── WebGLFallback.tsx          # Static SVG shown if WebGL is unavailable
```

The design spec is at `docs/superpowers/specs/2026-05-22-dotted-globe-design.md`.
The original implementation plan is at `docs/superpowers/plans/2026-05-22-dotted-globe.md`.

## Architectural choices worth knowing

### All the heavy lifting is on the GPU
Per-dot rotation, cursor repel, velocity-elongated falloff, and the wake
push all live in `globe.vert.glsl`. The CPU only:
1. Raycasts the cursor against an enlarged bounding sphere (one raycast per frame).
2. Smooths cursor velocity into a damped magnitude + direction.
3. Pushes scalar/vector uniforms into the shader.

That means dot count (~4500 default) is GPU-bound and scales well.

### Latitude-ring distribution, not Fibonacci
`createRingPositions` lays dots out on visible latitude rings (ring count
≈ `√(2·dotCount/π)`, clamped to [24,64]) so the ring structure is visible
from the side — that's the look the reference design wants. Don't replace
with a Fibonacci sphere unless that look is explicitly requested.

### Why a custom shader attribute named `aNormal` (not `normal`)
`ShaderMaterial` prepends Three.js boilerplate that may auto-inject a
`normal` attribute for some material types. We use `aNormal` to avoid any
collision.

### Camera is responsive via `<CameraRig />`
The camera distance is recomputed on every viewport resize so the globe
always fits, regardless of aspect ratio (portrait or landscape). Don't
hard-code a `position={[0,0,4]}` — the rig overwrites it.

### CSS variables drive the theme
`--globe-dot`, `--globe-glow`, `--globe-bg` in `index.html`. The component
reads `--globe-dot` on mount via `getComputedStyle` and pipes it into the
shader's `uColor` uniform. To re-skin, override CSS variables on a parent
element.

### `preserveDrawingBuffer: true` is intentional
It lets screenshot/test tools capture WebGL frames. The performance cost is
small at our dot count. Remove only if you need every last frame.

## Shader uniforms (vertex)

| Uniform | Type | Meaning |
|---|---|---|
| `uTime` | float | Accumulated seconds since mount — drives auto-rotation |
| `uRotationSpeed` | float | rad/sec for auto-rotation |
| `uDragYaw`, `uDragPitch` | float | Accumulated rotation from drag, eased on CPU |
| `uRayOrigin`, `uRayDir` | vec3 | Cursor ray from camera; defines the hollow axis |
| `uPointerActive` | float | 0–1 ramp; smoothstep-eased S-curve |
| `uVelMag` | float | Smoothed cursor speed (NDC units / sec) |
| `uVelDir` | vec3 | Smoothed cursor direction in world-space-on-camera-plane |
| `uRepelRadius` | float | Base radius of cursor effect (default 0.45) |
| `uRepelStrength` | float | Base displacement magnitude (default 0.55) |
| `uDotSize` | float | Coefficient applied to perspective-scaled gl_PointSize |
| `uColor` (frag) | vec3 | Dot color read from CSS variable |

## Public props (`<DottedGlobe />`)

| Prop | Default | Notes |
|---|---|---|
| `dotCount` | 4500 | Actual count rounds to nearest ring-friendly value |
| `radius` | 1.6 | World units; `<CameraRig />` fits the globe to viewport |
| `rotationSpeed` | 0.22 | rad/sec — slowed from earlier 0.5 for ease |
| `repelRadius` | 0.45 | World units |
| `repelStrength` | 0.55 | World units of outward displacement |
| `dotSize` | 0.05 | Multiplier for perspective-scaled `gl_PointSize` |
| `className` | — | Applied to the wrapping div |

## Tunables inside `GlobePoints.tsx` (top of file)

| Constant | Default | What it controls |
|---|---|---|
| `ACTIVE_TRACK_RATE` | 5 | Higher = snappier repel ramp-in/out |
| `DRAG_TRACK_RATE` | 7 | Higher = drag rotation tracks mouse more tightly |
| `VEL_TRACK_RATE` | 8 | Higher = velocity readings update faster |
| `VEL_IDLE_DECAY` | 4 | Higher = velocity drops to zero faster after idle |

These should be the **first place you tune** before touching the shader,
since they preserve the physics shape and only change feel.

## Conventions

- Pure-function-first: anything not React or Three.js side-effects should be
  a pure function (`createRingPositions` is the example).
- Tests live in `src/components/DottedGlobe/__tests__/`. Unit tests for
  pure logic, render tests via `@react-three/test-renderer` for the scene
  tree (no real WebGL).
- TDD when adding pure logic. Visual changes are validated against the
  reference image manually + via Claude Preview screenshots.
- Always create a feature branch — `feat/...`, `fix/...`, `docs/...`, etc.
  Never commit to `main` directly.
- Conventional Commits: `type(scope): description`. One logical change per
  commit.
- Coding style: prefer `const`, named exports, async/await, early returns.

## Things that have already bitten us — read before reverting

1. **`dotSize` is NOT in world units** — it's a coefficient on the
   perspective-scaled `gl_PointSize` formula `uDotSize * 300 / -mv.z`.
   Setting it to `7.5` (a leftover from a wrong interpretation) makes
   every dot ~500 px wide and the entire canvas saturates to white.
2. **Auto-rotation must stay uniform.** The shader uses `uTime *
   uRotationSpeed` directly. Don't add easing to this term or the spin
   will pulse weirdly. Easing belongs on `uPointerActive` and drag.
3. **Repel uses distance to the cursor RAY, not the cursor POINT.** This
   is what makes the hollow go through both walls of the sphere. Don't
   simplify it back to point distance.
4. **Drag rotation is accumulated, not reset.** Releasing the pointer
   does not zero `dragYaw`/`dragPitch`. Auto-rotation continues from
   wherever the user left it.
5. **Velocity multipliers are intentionally conservative.** Earlier
   versions used `velBoost * 1.4` and shredded the globe at high speeds.
   The current `vNorm = clamp(uVelMag/6, 0, 1)` with 0.35/0.45/0.6/0.08
   coefficients is the tuned-for-feel result. Resist large bumps.

## Reference visuals

The user originally provided two reference screenshots: an idle dotted
globe and one with a clear hollow region near the cursor. The visual goal
is to match those — small contained hole, latitude rings visible, gentle
ambient green glow off-center, true-black background.
