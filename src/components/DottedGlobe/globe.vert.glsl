uniform float uTime;
uniform vec3  uRayOrigin;
uniform vec3  uRayDir;
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

  // Distance from this dot to the cursor RAY (not just a point), so the
  // repel carves a tube straight through the sphere — both near and far
  // walls clear.
  vec3 toDot = rotatedPos - uRayOrigin;
  vec3 perp = toDot - dot(toDot, uRayDir) * uRayDir;
  float dRay = length(perp);
  vec3 awayDir = dRay > 0.0001 ? perp / dRay : vec3(0.0);
  float falloff = 1.0 - smoothstep(0.0, uRepelRadius, dRay);
  vec3 displaced = rotatedPos + awayDir * (falloff * uRepelStrength * uPointerActive);

  vEdgeBoost = falloff * uPointerActive;

  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uDotSize * (300.0 / -mv.z);
}
