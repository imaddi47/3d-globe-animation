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
