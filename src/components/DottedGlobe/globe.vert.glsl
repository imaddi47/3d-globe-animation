uniform float uTime;
uniform vec3  uRayOrigin;
uniform vec3  uRayDir;
uniform vec3  uVelDir;       // World-space direction of cursor motion (length 1 when velocity is non-zero)
uniform float uVelMag;       // Smoothed cursor speed (NDC/sec)
uniform float uPointerActive;
uniform float uDotSize;
uniform float uRepelRadius;
uniform float uRepelStrength;
uniform float uRotationSpeed;
uniform float uDragYaw;
uniform float uDragPitch;

attribute vec3 aNormal;

varying float vEdgeBoost;

mat3 rotY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, -s,
              0.0, 1.0, 0.0,
              s, 0.0, c);
}

mat3 rotX(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(1.0, 0.0, 0.0,
              0.0, c, s,
              0.0, -s, c);
}

void main() {
  // Combined rotation: uniform auto-spin (Y) + accumulated drag (Y then X).
  mat3 R = rotY(uTime * uRotationSpeed + uDragYaw) * rotX(uDragPitch);
  vec3 rotatedPos = R * position;

  // Velocity-boosted falloff envelope.
  // Faster cursor → modestly larger radius and slightly stronger push, with
  // a small wake along the motion direction. Tuned to stay within the globe
  // even at very high cursor speeds.
  // uVelMag is in NDC/sec (≈0 idle, ≈2-4 brisk, ≈10+ flick).
  float vNorm = clamp(uVelMag / 6.0, 0.0, 1.0);
  float effRadius   = uRepelRadius   * (1.0 + vNorm * 0.35);
  float effStrength = uRepelStrength * (1.0 + vNorm * 0.45);

  // Distance from dot to cursor RAY — cuts through both walls of the sphere.
  vec3 toDot = rotatedPos - uRayOrigin;
  vec3 perp = toDot - dot(toDot, uRayDir) * uRayDir;
  float dRay = length(perp);
  vec3 awayDir = dRay > 0.0001 ? perp / dRay : vec3(0.0);

  // Elongate the falloff along the velocity direction so the affected zone
  // smears into a soft trail when the cursor flicks. Mild stretch only.
  float dMetric = dRay;
  if (vNorm > 0.05) {
    float alongVel = dot(perp, uVelDir);
    vec3 perpToVel = perp - uVelDir * alongVel;
    float stretch = 1.0 + vNorm * 0.6;        // 1.0 to 1.6
    dMetric = sqrt(dot(perpToVel, perpToVel) + (alongVel / stretch) * (alongVel / stretch));
  }

  float falloff = 1.0 - smoothstep(0.0, effRadius, dMetric);

  // Radial-from-ray push + a small wake push along motion (capped by vNorm).
  vec3 displaced = rotatedPos
    + awayDir * (falloff * effStrength * uPointerActive)
    + uVelDir * (falloff * vNorm * 0.08 * uPointerActive);

  vEdgeBoost = falloff * uPointerActive;

  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uDotSize * (300.0 / -mv.z);
}
