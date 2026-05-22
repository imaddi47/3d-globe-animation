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
