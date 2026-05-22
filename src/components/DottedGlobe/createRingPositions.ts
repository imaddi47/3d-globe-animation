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
