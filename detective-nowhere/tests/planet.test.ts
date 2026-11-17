import { describe, it, expect } from 'vitest';
import { WORLD, NODE, greatCircleKm, planTrip, pxToLatLon, routeKm, pxDeltaKm, type Px } from '../src/world/planet';

const CITIES = WORLD.nodes.filter((n) => n.kind === 'city' && n.map_no).map((n) => n.id);

describe('Ryzen-5 projection & scale', () => {
  it('reproduces the atlas scale bar: 166 px at the equator ≈ 1,000 km', () => {
    const km = greatCircleKm([600, 512], [766, 512]);
    expect(km).toBeGreaterThan(985); expect(km).toBeLessThan(1015);
  });
  it('atlas height spans pole to pole (half the 12,289 km circumference)', () => {
    expect(greatCircleKm([717, 0], [717, 1024])).toBeCloseTo(WORLD.planet.circumference_km / 2, -1);
  });
  it('no two mapped places are farther apart than the stated 6,145 km', () => {
    for (const a of WORLD.nodes) for (const b of WORLD.nodes) expect(greatCircleKm(a.px, b.px)).toBeLessThanOrEqual(6145);
  });
  it('overland movement converts pixels to km with latitude', () => {
    expect(pxDeltaKm([700, 512], 166, 0)).toBeCloseTo(1000, -1);
    expect(pxDeltaKm([700, 171], 166, 0)).toBeCloseTo(500, -1); // 60°N
  });
  it('prime meridian runs through Zixel', () => { expect(pxToLatLon(NODE.get('zixel')!.px).lon).toBeCloseTo(0); });
});

describe('route network', () => {
  it('every route references real nodes and has positive length', () => {
    for (const r of WORLD.routes) { expect(NODE.get(r.a), r.id).toBeDefined(); expect(NODE.get(r.b), r.id).toBeDefined(); expect(routeKm(r)).toBeGreaterThan(0); }
  });
  it('road distances are never shorter than straight-line distances', () => {
    for (const r of WORLD.routes.filter((x) => x.mode === 'road')) expect(routeKm(r) + 1e-6).toBeGreaterThanOrEqual(greatCircleKm(NODE.get(r.a)!.px as Px, NODE.get(r.b)!.px as Px));
  });
  it('every confirmed gameplay place is reachable from Zixel', () => {
    for (const n of WORLD.nodes.filter((x) => x.gameplay === 'confirmed')) expect(planTrip('zixel', n.id), n.id).not.toBeNull();
  });
  it("Wayfarer's Rest (Southreach) cannot be reached by road alone", () => {
    expect(planTrip('zixel', 'wayfarers_rest', ['road'])).toBeNull();
    expect(planTrip('zixel', 'wayfarers_rest', ['road', 'sea'])).not.toBeNull();
  });
  it('travel note: most journeys between major cities take under 3 sols', () => {
    let under = 0, total = 0;
    for (const a of CITIES) for (const b of CITIES) if (a < b) { total++; if (planTrip(a, b)!.sols < 3) under++; }
    expect(under / total).toBeGreaterThan(0.5);
  });
  it('trade corridors follow connected places', () => {
    for (const c of WORLD.trade_corridors) for (const id of c.path) expect(NODE.get(id), `${c.id}:${id}`).toBeDefined();
  });
});

describe('atlas corrections (user, Nov 2026)', () => {
  it('Kitsah is the "2" closest to Zixel; Soledad is city 9', () => {
    const z = NODE.get('zixel')!.px;
    expect(greatCircleKm(z, NODE.get('kitsah')!.px)).toBeLessThan(greatCircleKm(z, NODE.get('soledad')!.px));
    expect(NODE.get('soledad')!.map_no).toBe(9);
    expect(NODE.get('soledad')!.pop).toBe(350000);
    expect(NODE.get('soledad')!.area_km2).toBe(38);
  });
  it('no duplicate numbers among cities or among outposts', () => {
    for (const kind of ['city', 'outpost']) {
      const nums = WORLD.nodes.filter((n) => n.kind === kind && n.map_no).map((n) => n.map_no);
      expect(new Set(nums).size, kind).toBe(nums.length);
    }
  });
});
