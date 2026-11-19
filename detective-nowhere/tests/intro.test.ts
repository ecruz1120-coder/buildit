import { describe, it, expect } from 'vitest';
import { CAPTIONS, LENGTH } from '../src/modes/intro';

describe('opening cinematic script', () => {
  it('runs about a minute and a half', () => { expect(LENGTH).toBeGreaterThanOrEqual(85); expect(LENGTH).toBeLessThanOrEqual(95); });
  it('captions sit inside the runtime and never overlap within a track', () => {
    for (const c of CAPTIONS) { expect(c.a).toBeGreaterThanOrEqual(0); expect(c.b).toBeLessThanOrEqual(LENGTH + 1); expect(c.b).toBeGreaterThan(c.a); }
    for (const kind of ['narr', 'tag', 'place', 'title']) {
      const cs = CAPTIONS.filter((c) => c.kind === kind).sort((x, y) => x.a - y.a);
      for (let i = 1; i < cs.length; i++) expect(cs[i].a, cs[i].text).toBeGreaterThanOrEqual(cs[i - 1].b);
    }
  });
  it('covers the brief and avoids act-level spoilers', () => {
    const all = CAPTIONS.map((c) => c.text).join(' ');
    for (const must of ['surgeon', 'government official', 'blame', 'family', 'the Coin', 'Elias Venn', 'Zixel', 'RYZEN-5']) expect(all).toContain(must);
    for (const banned of ['Kestrel', 'Chimera', 'Crosshair', 'rogue', 'implant', 'tracker']) expect(all).not.toContain(banned);
  });
});
