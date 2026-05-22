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
