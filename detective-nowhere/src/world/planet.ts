import raw from '../../content/world.json';

/**
 * Ryzen-5 planetary model.
 * The atlas (public/world/ryzen5_atlas.jpg) is treated as an equirectangular projection: its scale bar
 * (1000 km = 166 px) times its height (1024 px) equals the pole-to-pole distance of a 3,912 km-diameter
 * sphere, and its width equals 270° of longitude. Distances are great-circle distances on that sphere.
 */
export type Px = [number, number];
export type Mode = 'road' | 'sea' | 'air';
export interface WNode {
  id: string; name: string; kind: 'city' | 'outpost' | 'hive' | 'junction' | 'landing' | 'port' | 'pass';
  px: Px; map_no?: number | null; type?: string; pop?: number; area_km2?: number;
  gameplay?: 'confirmed' | 'candidate' | 'available'; roles?: string[]; notes?: string; unresolved?: string; hostile?: boolean;
}
export interface WRoute { id: string; a: string; b: string; mode: Mode; confidence: 'traced' | 'inferred' | 'proposed'; px: Px[]; }
export interface Corridor { id: string; name: string; status: string; path: string[]; suggested_goods: string[]; note?: string; }
export interface World {
  planet: { name: string; circumference_km: number; diameter_km: number; gravity_g: number; surface_water_pct_stated: number; population: number; farthest_points_km: number; hours_per_sol: number; [k: string]: unknown };
  projection: { atlas_px: [number, number]; lon_span_deg: number; lat_span_deg: number; prime_meridian_px: number; km_per_px_at_equator: number; rationale: string };
  travel_modes: Record<Mode, { name: string; kmh: number; source: string }>;
  nodes: WNode[]; routes: WRoute[]; trade_corridors: Corridor[];
  regions: { name: string; sub?: string; px: Px; gameplay?: string }[];
  waters: { name: string; kind: string; px: Px; note?: string; gameplay?: string }[];
  open_questions: string[];
}

export const WORLD = raw as unknown as World;
export const ATLAS_W = WORLD.projection.atlas_px[0];
export const ATLAS_H = WORLD.projection.atlas_px[1];
export const RADIUS_KM = WORLD.planet.diameter_km / 2;
export const NODE = new Map(WORLD.nodes.map((n) => [n.id, n]));

export function pxToLatLon([x, y]: Px): { lat: number; lon: number } {
  const p = WORLD.projection;
  return { lat: 90 - (y / ATLAS_H) * p.lat_span_deg, lon: ((x - p.prime_meridian_px) / ATLAS_W) * p.lon_span_deg };
}
export function latLonToPx(lat: number, lon: number): Px {
  const p = WORLD.projection;
  return [p.prime_meridian_px + (lon / p.lon_span_deg) * ATLAS_W, ((90 - lat) / p.lat_span_deg) * ATLAS_H];
}

const rad = (d: number) => (d * Math.PI) / 180;
export function greatCircleKm(a: Px, b: Px): number {
  const A = pxToLatLon(a), B = pxToLatLon(b);
  const dLat = rad(B.lat - A.lat), dLon = rad(B.lon - A.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(A.lat)) * Math.cos(rad(B.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Points along the great circle a→b, in atlas pixels (air routes are curved on an equirectangular map). */
export function greatCirclePx(a: Px, b: Px, steps = 24): Px[] {
  const A = pxToLatLon(a), B = pxToLatLon(b);
  const v = (lat: number, lon: number) => [Math.cos(rad(lat)) * Math.cos(rad(lon)), Math.cos(rad(lat)) * Math.sin(rad(lon)), Math.sin(rad(lat))];
  const p = v(A.lat, A.lon), q = v(B.lat, B.lon);
  const dot = Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
  const om = Math.acos(dot);
  if (om < 1e-6) return [a, b];
  const out: Px[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, s1 = Math.sin((1 - t) * om) / Math.sin(om), s2 = Math.sin(t * om) / Math.sin(om);
    const x = s1 * p[0] + s2 * q[0], y = s1 * p[1] + s2 * q[1], z = s1 * p[2] + s2 * q[2];
    out.push(latLonToPx((Math.asin(z) * 180) / Math.PI, (Math.atan2(y, x) * 180) / Math.PI));
  }
  return out;
}

/** Drawn geometry of a route (air routes are generated as great circles). */
export function routeGeometry(r: WRoute): Px[] {
  if (r.mode === 'air' || !r.px.length) return greatCirclePx(NODE.get(r.a)!.px, NODE.get(r.b)!.px);
  return r.px;
}

export function routeKm(r: WRoute): number {
  const g = routeGeometry(r);
  let km = 0;
  for (let i = 1; i < g.length; i++) km += greatCircleKm(g[i - 1], g[i]);
  return km;
}

/** Boarding / transfer overhead (hours) when a leg uses a scheduled service. Proposed tuning. */
export const BOARDING_H: Record<Mode, number> = { road: 0, sea: 2, air: 1.5 };

export function legHours(r: WRoute): number {
  return routeKm(r) / WORLD.travel_modes[r.mode].kmh + BOARDING_H[r.mode];
}

export interface Leg { route: WRoute; from: string; to: string; km: number; hours: number; }
export interface Trip { legs: Leg[]; km: number; hours: number; sols: number; }

/** Fastest trip between two places using only the allowed modes (Dijkstra on travel time). */
export function planTrip(from: string, to: string, modes: Mode[] = ['road', 'sea', 'air']): Trip | null {
  if (from === to) return { legs: [], km: 0, hours: 0, sols: 0 };
  const allowed = new Set(modes);
  const adj = new Map<string, { r: WRoute; next: string }[]>();
  for (const r of WORLD.routes) {
    if (!allowed.has(r.mode)) continue;
    (adj.get(r.a) ?? adj.set(r.a, []).get(r.a)!).push({ r, next: r.b });
    (adj.get(r.b) ?? adj.set(r.b, []).get(r.b)!).push({ r, next: r.a });
  }
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; r: WRoute }>();
  const open = new Set<string>([from]);
  while (open.size) {
    let cur = '', best = Infinity;
    for (const n of open) { const d = dist.get(n)!; if (d < best) { best = d; cur = n; } }
    open.delete(cur);
    if (cur === to) break;
    for (const { r, next } of adj.get(cur) ?? []) {
      const nd = best + legHours(r);
      if (nd < (dist.get(next) ?? Infinity)) { dist.set(next, nd); prev.set(next, { node: cur, r }); open.add(next); }
    }
  }
  if (!dist.has(to)) return null;
  const legs: Leg[] = [];
  for (let n = to; n !== from; ) {
    const p = prev.get(n)!;
    legs.unshift({ route: p.r, from: p.node, to: n, km: routeKm(p.r), hours: legHours(p.r) });
    n = p.node;
  }
  const km = legs.reduce((s, l) => s + l.km, 0), hours = legs.reduce((s, l) => s + l.hours, 0);
  return { legs, km, hours, sols: hours / WORLD.planet.hours_per_sol };
}

export function fmtHours(h: number): string {
  const sols = Math.floor(h / WORLD.planet.hours_per_sol);
  const rest = h - sols * WORLD.planet.hours_per_sol;
  return sols ? `${sols} sol ${rest.toFixed(1)} h` : `${h.toFixed(1)} h`;
}
