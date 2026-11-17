import { describe, it, expect } from 'vitest';
import { FLOORS, W, H, AREAS } from '../src/world/maps';
describe('maps', () => {
  it('every row is exactly W wide and H tall', () => {
    for (const f of FLOORS) { expect(f.length).toBe(H); for (const r of f) expect(r.length).toBe(W); }
  });
  it('areas are in bounds', () => { for (const a of AREAS) { expect(a.x1).toBeLessThanOrEqual(W); expect(a.z1).toBeLessThanOrEqual(H); } });
});
