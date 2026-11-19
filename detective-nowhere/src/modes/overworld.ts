import * as THREE from 'three';
import { WORLD, NODE, ATLAS_W, ATLAS_H, routeGeometry, pxToLatLon, pxDeltaKm, fmtHours, routeKm, legHours, OVERLAND_KMH, planTrip, type Px, type WNode, type WRoute, type Mode } from '../world/planet';
import { makeCedric, type Rig } from '../world/actors';
import { animateLimbs } from '../render/props';
import { advanceClock, formatClock } from '../core/clock';
import { Nav, esc } from '../ui/nav';
import type { Game } from '../game';

/**
 * The travelable Ryzen-5 overworld.
 * World units = atlas pixels (1 unit ≈ 6 km at the equator). X = east, Z = south, Y = up.
 * Movement converts pixels to true great-circle km at the current latitude and advances the
 * world clock by km ÷ speed; roads, open country and mountains have different speeds.
 */
const BASE = import.meta.env.BASE_URL;
const MW = 768, MH = 512; // land-mask resolution (2 atlas px per cell)
const GW = 384, GH = 256; // terrain grid segments
const REAL_PX_PER_KMH = 0.36; // on-screen speed: 55 km/h road ≈ 20 atlas px per real second
const PANELS: [number, number, number, number][] = [[0, 0, 270, 240], [0, 245, 205, 830], [0, 835, 465, 1024], [465, 945, 665, 1024], [1065, 880, 1290, 1024], [1285, 875, 1536, 1024], [1295, 305, 1536, 845], [1265, 0, 1536, 300]];

/** Mountain ranges as ridge lines (atlas px) — heights are an interpretation of the painted ranges. */
const RIDGES: { name: string; amp: number; sigma: number; pts: Px[] }[] = [
  { name: 'Titanspine Mountains', amp: 10, sigma: 15, pts: [[628, 300], [700, 370], [760, 432], [812, 492]] },
  { name: 'Razorback Ranges', amp: 8, sigma: 13, pts: [[604, 404], [562, 470], [526, 538], [504, 584]] },
  { name: 'Red Fang Peaks', amp: 11, sigma: 18, pts: [[925, 118], [990, 104], [1050, 138]] },
  { name: 'Northern Massif', amp: 7, sigma: 15, pts: [[832, 262], [866, 300], [902, 336]] },
  { name: 'Meridian Highlands', amp: 6, sigma: 14, pts: [[760, 560], [786, 618], [800, 676]] },
  { name: 'Stormbreaker Range', amp: 8, sigma: 13, pts: [[760, 758], [880, 770], [995, 742], [1060, 752]] },
  { name: 'Shattered Expanse', amp: 3.5, sigma: 22, pts: [[480, 120], [600, 150], [720, 128]] },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function hash(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function segDist(p: Px, a: Px, b: Px) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

interface AutoLeg { pts: Px[]; mode: Mode | 'offroad'; hours: number; km: number; label: string; to?: string; }

export class Overworld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.5, 4000);
  ready = false;
  private mask = new Uint8Array(MW * MH);
  private heights = new Float32Array((GW + 1) * (GH + 1));
  private ridgeGrid = new Float32Array((GW + 1) * (GH + 1));
  private roadSegs: [Px, Px][] = [];
  private token = new THREE.Group();
  private rig!: Rig;
  private boat!: THREE.Mesh;
  private ring!: THREE.Mesh;
  private phase = 0;
  private moving = 0;
  private dist = 130;
  private camPos = new THREE.Vector3();
  private auto: { legs: AutoLeg[]; i: number; s: number } | null = null;
  private panelNode: WNode | null = null;
  private panelNav = new Nav(() => document.getElementById('worldpanel'));
  private labels = new Map<string, HTMLDivElement>();
  private discoverT = 0;
  private terrain = 'road';
  private facing = 0;

  constructor(private g: Game) {}

  get pos(): Px { const w = this.g.state.world!; return [w.x, w.y]; }
  set pos(p: Px) { const w = this.g.state.world!; w.x = p[0]; w.y = p[1]; }

  async init() {
    const [landImg, atlasImg] = await Promise.all([loadImage(`${BASE}world/ryzen5_landmask.png`), loadImage(`${BASE}world/ryzen5_terrain.jpg`)]);
    // land mask
    const mc = document.createElement('canvas'); mc.width = MW; mc.height = MH;
    const mx = mc.getContext('2d')!; mx.drawImage(landImg, 0, 0, MW, MH);
    const md = mx.getImageData(0, 0, MW, MH).data;
    for (let i = 0; i < MW * MH; i++) this.mask[i] = md[i * 4] > 127 ? 1 : 0;
    // distance to coast (cells), multi-source BFS from water
    const dist = new Int16Array(MW * MH).fill(-1);
    const q = new Int32Array(MW * MH); let qh = 0, qt = 0;
    for (let i = 0; i < MW * MH; i++) if (!this.mask[i]) { dist[i] = 0; q[qt++] = i; }
    while (qh < qt) {
      const i = q[qh++], x = i % MW, y = (i / MW) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const j = ny * MW + nx; if (dist[j] < 0) { dist[j] = dist[i] + 1; q[qt++] = j; }
      }
    }
    // heights
    for (let gy = 0; gy <= GH; gy++) for (let gx = 0; gx <= GW; gx++) {
      const ax = (gx / GW) * ATLAS_W, ay = (gy / GH) * ATLAS_H;
      const mi = Math.min(MH - 1, (ay / 2) | 0) * MW + Math.min(MW - 1, (ax / 2) | 0);
      let ridge = 0;
      for (const r of RIDGES) {
        let d = 1e9;
        for (let k = 1; k < r.pts.length; k++) d = Math.min(d, segDist([ax, ay], r.pts[k - 1], r.pts[k]));
        ridge += r.amp * Math.exp(-((d / r.sigma) ** 2));
      }
      const n = vnoise(ax / 18, ay / 18) * 0.9 + vnoise(ax / 6, ay / 6) * 0.35;
      const vi = gy * (GW + 1) + gx;
      this.ridgeGrid[vi] = ridge;
      this.heights[vi] = this.mask[mi] ? 0.5 + Math.min(dist[mi], 14) * 0.1 + ridge * (0.75 + n * 0.5) + n * 0.6 : -1.6;
    }
    // terrain mesh textured with the atlas (legend panels painted over as sea)
    const tc = document.createElement('canvas'); tc.width = ATLAS_W; tc.height = ATLAS_H;
    const tx = tc.getContext('2d')!; tx.drawImage(atlasImg, 0, 0);
    tx.fillStyle = '#2d5d74';
    for (const [x0, y0, x1, y1] of PANELS) tx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(ATLAS_W, ATLAS_H, GW, GH); geo.rotateX(-Math.PI / 2);
    const pa = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) pa.setY(i, this.heights[i]);
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    this.scene.add(terrain);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(ATLAS_W * 3, ATLAS_H * 3), new THREE.MeshLambertMaterial({ color: '#1f5a78', transparent: true, opacity: 0.42 }));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.2;
    this.scene.add(water);
    this.scene.background = new THREE.Color('#081420');
    this.scene.fog = new THREE.Fog('#081420', 400, 1600);
    this.scene.add(new THREE.HemisphereLight('#dfe9ff', '#2a2638', 1.9));
    const sun = new THREE.DirectionalLight('#fff0d8', 1.6); sun.position.set(-300, 400, 200); this.scene.add(sun);
    this.buildRoutes();
    this.buildNodes();
    // Cedric token
    this.rig = makeCedric(1.85);
    this.rig.root.scale.setScalar(2.6);
    this.token.add(this.rig.root);
    this.boat = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 7), new THREE.MeshLambertMaterial({ color: '#8a6a4a' }));
    this.boat.position.y = -0.3; this.boat.visible = false; this.token.add(this.boat);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3, 32), new THREE.MeshBasicMaterial({ color: '#6fd3e0', transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.2; this.token.add(this.ring);
    this.scene.add(this.token);
    this.ready = true;
  }

  /** Hide Cedric's token (used when the opening cinematic borrows this scene). */
  setTokenVisible(v: boolean) { this.token.visible = v; }

  // ── geometry helpers ──
  isLand(p: Px) {
    const x = Math.floor(p[0] / 2), y = Math.floor(p[1] / 2);
    if (x < 0 || y < 0 || x >= MW || y >= MH) return false;
    return this.mask[y * MW + x] === 1;
  }
  private grid(arr: Float32Array, p: Px) {
    const gx = Math.max(0, Math.min(GW - 1e-3, (p[0] / ATLAS_W) * GW)), gy = Math.max(0, Math.min(GH - 1e-3, (p[1] / ATLAS_H) * GH));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, W1 = GW + 1;
    const a = arr[y0 * W1 + x0], b = arr[y0 * W1 + x0 + 1], c = arr[(y0 + 1) * W1 + x0], d = arr[(y0 + 1) * W1 + x0 + 1];
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }
  heightAt(p: Px) { return this.grid(this.heights, p); }
  private v3(p: Px, lift = 0.4) { return new THREE.Vector3(p[0] - ATLAS_W / 2, Math.max(0, this.heightAt(p)) + lift, p[1] - ATLAS_H / 2); }
  private densify(pts: Px[], step = 2): Px[] {
    const out: Px[] = [];
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  /** Terrain under a point: on a road, open country, or rough (mountains). */
  classify(p: Px): 'road' | 'offroad' | 'rough' {
    for (const [a, b] of this.roadSegs) if (segDist(p, a, b) < 2.4) return 'road';
    return this.grid(this.ridgeGrid, p) > 3.2 ? 'rough' : 'offroad';
  }

  private buildRoutes() {
    for (const r of WORLD.routes) {
      const g = routeGeometry(r);
      if (r.mode === 'road') {
        for (let i = 1; i < g.length; i++) this.roadSegs.push([g[i - 1], g[i]]);
        const pts = this.densify(g).map((p) => this.v3(p, 0.5));
        this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: r.confidence === 'traced' ? '#ffcf6a' : '#c9a05a' })));
      } else if (r.mode === 'sea') {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.densify(g).map((p) => new THREE.Vector3(p[0] - ATLAS_W / 2, 0.3, p[1] - ATLAS_H / 2))), new THREE.LineDashedMaterial({ color: '#9fd0ff', dashSize: 4, gapSize: 3 }));
        line.computeLineDistances(); this.scene.add(line);
      } else {
        const n = g.length - 1;
        const pts = g.map((p, i) => { const v = this.v3(p, 0); v.y = 10 + Math.sin((i / n) * Math.PI) * 28; return v; });
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#e8e2d0', dashSize: 3, gapSize: 4, transparent: true, opacity: 0.6 }));
        line.computeLineDistances(); this.scene.add(line);
      }
    }
  }

  private buildNodes() {
    const box = (w: number, h: number, d: number, c: string, e = '#000000') => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c, emissive: e }));
    for (const n of WORLD.nodes) {
      if (n.kind === 'junction') continue;
      const g = new THREE.Group();
      const base = this.v3(n.px, 0);
      g.position.copy(base);
      if (n.kind === 'city') {
        const scale = 1.4 + Math.log10((n.pop ?? 1e4) / 1e4) * 1.1;
        const count = Math.max(3, Math.round(3 + Math.log10((n.pop ?? 1e4) / 1e4) * 4));
        for (let i = 0; i < count; i++) {
          const a = hash(i, n.px[0]) * Math.PI * 2, r = hash(n.px[1], i) * scale * 1.8;
          const h = (1.5 + hash(i * 3, n.px[1]) * 3.5) * scale;
          const b = box(1.4 * scale * 0.6, h, 1.4 * scale * 0.6, i % 3 ? '#5a6478' : '#7a6a5a', i % 4 === 0 ? '#3a2a10' : '#000000');
          b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r); g.add(b);
        }
      } else if (n.kind === 'outpost') {
        const t = box(1.1, 4.5, 1.1, '#6a5a6a'); t.position.y = 2.25; g.add(t);
        const l = box(1.6, 0.6, 1.6, '#f0b44a', '#a06010'); l.position.y = 4.8; g.add(l);
      } else if (n.kind === 'hive') {
        for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6 + i, 5), new THREE.MeshLambertMaterial({ color: '#c040a0', emissive: '#400030' })); c.position.set(Math.cos(i) * 2.5, 3, Math.sin(i) * 2.5); g.add(c); }
      } else {
        const p = box(2.4, 0.4, 2.4, '#6fd3e0', '#1a5560'); p.position.y = 0.3; g.add(p);
      }
      if (n.gameplay === 'confirmed' || n.gameplay === 'candidate') {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 40, 6, 1, true), new THREE.MeshBasicMaterial({ color: n.gameplay === 'confirmed' ? '#6fd3e0' : '#f0b44a', transparent: true, opacity: 0.22, depthWrite: false }));
        beam.position.y = 20; g.add(beam);
      }
      this.scene.add(g);
    }
  }

  // ── lifecycle ──
  enter() {
    this.camPos.set(0, 0, 0);
    document.getElementById('worldhud')!.classList.remove('hidden');
    document.getElementById('hud')!.classList.add('world');
    this.discover(true);
  }
  exit() {
    this.auto = null; this.closePanel();
    document.getElementById('worldhud')!.classList.add('hidden');
    document.getElementById('hud')!.classList.remove('world');
    this.labels.forEach((l) => l.remove()); this.labels.clear();
  }

  nearestNode(maxPx = 9, p = this.pos): WNode | null {
    let best: WNode | null = null, bd = maxPx;
    for (const n of WORLD.nodes) {
      if (n.kind === 'junction' || !this.known(n)) continue;
      const d = Math.hypot(n.px[0] - p[0], n.px[1] - p[1]);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  known(n: WNode) { return n.kind === 'city' || this.g.state.world!.discovered.includes(n.id); }

  private discover(silent = false) {
    const w = this.g.state.world!;
    for (const n of WORLD.nodes) {
      if (n.kind === 'junction' || n.kind === 'city' || w.discovered.includes(n.id)) continue;
      if (Math.hypot(n.px[0] - w.x, n.px[1] - w.y) < (n.kind === 'hive' ? 45 : 28)) {
        w.discovered.push(n.id);
        if (!silent) this.g.hud.toast(`DISCOVERED · ${n.name}`, n.kind === 'hive' ? 'warn' : 'xp', n.kind === 'hive' ? 'Hostile hive — keep your distance.' : n.type ?? n.kind);
      }
    }
  }

  // ── autopilot (set course, ferries, airships) ──
  setCourse(to: string, modes: Mode[]) {
    const here = this.nearestNode(40) ?? this.nearestNode(9999)!;
    const trip = planTrip(here.id, to, modes);
    if (!trip) { this.g.hud.toast('No route with those travel modes.', 'warn'); return false; }
    const legs: AutoLeg[] = [];
    const d = Math.hypot(here.px[0] - this.pos[0], here.px[1] - this.pos[1]);
    if (d > 1.5) { const km = pxDeltaKm(this.pos, here.px[0] - this.pos[0], here.px[1] - this.pos[1]); legs.push({ pts: [this.pos, here.px], mode: 'offroad', km, hours: km / OVERLAND_KMH.offroad, label: `to ${here.name}`, to: here.id }); }
    for (const l of trip.legs) legs.push(this.legFor(l.route, l.from, l.to));
    this.auto = { legs, i: 0, s: 0 };
    this.g.hud.toast(`COURSE SET · ${NODE.get(to)!.name}`, '', `${trip.km.toFixed(0)} km · ${fmtHours(trip.hours + (legs[0].mode === 'offroad' ? legs[0].hours : 0))}`);
    return true;
  }
  private legFor(r: WRoute, from: string, to: string): AutoLeg {
    let pts = routeGeometry(r).slice();
    if (r.a !== from) pts.reverse();
    if (r.mode === 'road') pts = this.densify(pts, 1);
    return { pts, mode: r.mode, km: routeKm(r), hours: legHours(r), label: NODE.get(to)!.name, to };
  }

  private stepAuto(dt: number) {
    const a = this.auto!;
    const leg = a.legs[a.i];
    const speed = (leg.mode === 'air' ? 70 : leg.mode === 'sea' ? 30 : leg.mode === 'road' ? 34 : 14);
    // total pixel length
    let len = 0; for (let k = 1; k < leg.pts.length; k++) len += Math.hypot(leg.pts[k][0] - leg.pts[k - 1][0], leg.pts[k][1] - leg.pts[k - 1][1]);
    const ds = Math.min(len - a.s, speed * dt);
    a.s += ds;
    const hoursNow = (ds / Math.max(len, 1e-6)) * leg.hours;
    this.advance(hoursNow, leg.mode === 'offroad' ? 0 : (ds / Math.max(len, 1e-6)) * leg.km, leg.mode === 'offroad' ? (ds / Math.max(len, 1e-6)) * leg.km : 0);
    // position along polyline
    let s = a.s;
    for (let k = 1; k < leg.pts.length; k++) {
      const p0 = leg.pts[k - 1], p1 = leg.pts[k], sl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (s <= sl || k === leg.pts.length - 1) {
        const t = sl ? Math.min(1, s / sl) : 1;
        const np: Px = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
        this.facing = Math.atan2(np[0] - this.pos[0], np[1] - this.pos[1]) || this.facing;
        this.pos = np; break;
      }
      s -= sl;
    }
    this.terrain = leg.mode === 'offroad' ? 'offroad' : leg.mode;
    this.moving = leg.mode === 'air' || leg.mode === 'sea' ? 0 : 1;
    if (a.s >= len - 1e-6) {
      a.i++; a.s = 0;
      if (a.i >= a.legs.length) { this.auto = null; this.g.hud.toast(`ARRIVED · ${leg.label}`, 'xp'); }
      else if (a.legs[a.i].mode === 'sea' || a.legs[a.i].mode === 'air') this.g.hud.toast(a.legs[a.i].mode === 'air' ? `Boarding airship → ${a.legs[a.i].label}` : `Boarding ferry → ${a.legs[a.i].label}`);
    }
  }

  /** Advance world time for travel and log distance. */
  private advance(hours: number, kmRoad: number, kmOff: number) {
    const s = this.g.state;
    s.clock = advanceClock(s.clock, hours * 60);
    s.world!.odometer += kmRoad + kmOff;
  }

  // ── location panel ──
  openPanel(n: WNode) {
    this.panelNode = n;
    const el = document.getElementById('worldpanel')!;
    const ll = pxToLatLon(n.px);
    const links = WORLD.routes.filter((r) => (r.a === n.id || r.b === n.id) && r.mode !== 'road');
    const st = n.gameplay === 'confirmed' ? '<span class="ok">GAMEPLAY LOCATION</span>' : n.gameplay === 'candidate' ? '<span class="amber">GAMEPLAY CANDIDATE</span>' : '<span class="muted">Not yet a gameplay location</span>';
    const buttons: string[] = [];
    if (n.id === 'zixel') buttons.push('<button class="nav" data-w="enter">ENTER ZIXEL · Kaelis Row (training block)</button>');
    else if (n.kind === 'city' || n.kind === 'outpost') buttons.push(`<button class="nav disabled">ENTER ${esc(n.name.toUpperCase())} · location scene not built yet</button>`);
    for (const r of links) {
      const other = r.a === n.id ? r.b : r.a;
      buttons.push(`<button class="nav" data-w="go|${WORLD.routes.indexOf(r)}|${other}">${r.mode === 'air' ? '✈ AIRSHIP' : '≈ FERRY'} → ${esc(NODE.get(other)!.name)} <span class="muted">· ${routeKm(r).toFixed(0)} km · ${fmtHours(legHours(r))}</span></button>`);
    }
    buttons.push('<button class="nav" data-w="rest">REST 8 h <span class="muted">(safe-zone downtime)</span></button>');
    buttons.push('<button class="nav" data-w="plan">PLAN A ROUTE FROM HERE (HoloBand)</button>');
    buttons.push('<button class="nav" data-w="close">CLOSE</button>');
    el.innerHTML = `<div class="kind">${esc((n.type ?? n.kind).toUpperCase())}</div><h3>${esc(n.name)}</h3>
      <p>${Math.abs(ll.lat).toFixed(1)}°${ll.lat >= 0 ? 'N' : 'S'} ${Math.abs(ll.lon).toFixed(1)}°${ll.lon >= 0 ? 'E' : 'W'}${n.pop ? ` · pop ${n.pop.toLocaleString()}` : ''}${n.area_km2 ? ` · ${n.area_km2} km²` : ''}<br/>${st}</p>
      ${n.notes ? `<p class="muted">${esc(n.notes)}</p>` : ''}${n.unresolved ? `<p class="amber" style="font-size:12px">⚠ ${esc(n.unresolved)}</p>` : ''}
      <div class="list">${buttons.join('')}</div>`;
    el.classList.remove('hidden');
    el.querySelectorAll<HTMLElement>('[data-w]').forEach((b) => b.addEventListener('click', () => this.panelAction(b.dataset.w!)));
    this.panelNav.reset(); this.panelNav.bindHover();
  }
  closePanel() { this.panelNode = null; document.getElementById('worldpanel')?.classList.add('hidden'); }

  private panelAction(a: string) {
    const n = this.panelNode!;
    if (a === 'close') return this.closePanel();
    if (a === 'enter') { this.closePanel(); this.g.leaveWorld(); return; }
    if (a === 'rest') { this.advance(8, 0, 0); this.g.state.player.hp = 100; this.g.state.player.cst = this.g.cstMax(); this.g.hud.toast('Rested 8 hours.', '', formatClock(this.g.state.clock)); return this.openPanel(n); }
    if (a === 'plan') { this.closePanel(); this.g.openHoloPlanet(); this.g.holo.planet.from = n.id; this.g.holo.render(); return; }
    if (a.startsWith('go|')) {
      const [, ri, other] = a.split('|');
      const r = WORLD.routes[Number(ri)];
      this.closePanel();
      this.pos = n.px;
      this.auto = { legs: [this.legFor(r, n.id, other)], i: 0, s: 0 };
      this.g.hud.toast(r.mode === 'air' ? `Boarding airship → ${NODE.get(other)!.name}` : `Boarding ferry → ${NODE.get(other)!.name}`);
    }
  }

  // ── per-frame ──
  update(dt: number, interactive = true) {
    if (!this.ready) return;
    const inp = this.g.input;
    if (!interactive) { /* menu open over the overworld: just draw */ }
    else if (this.panelNode) {
      if (inp.pressed('cancel')) this.closePanel(); else this.panelNav.update(inp);
    } else if (this.auto) {
      const leg = this.auto.legs[this.auto.i];
      const canStop = leg.mode === 'road' || leg.mode === 'offroad';
      if (canStop && (Math.abs(inp.move.x) > 0.3 || Math.abs(inp.move.y) > 0.3 || inp.pressed('cancel'))) { this.auto = null; this.g.hud.toast('Course cancelled.'); }
      else this.stepAuto(dt);
    } else {
      if (inp.pressed('holoband')) { this.g.openHoloPlanet(); return; }
      if (inp.pressed('pause')) { this.g.mode = 'menu'; this.g.holo.show('SYSTEM'); return; }
      const mx = inp.move.x, my = inp.move.y;
      const here = this.pos;
      this.terrain = this.classify(here);
      const kmh = OVERLAND_KMH[this.terrain as keyof typeof OVERLAND_KMH];
      if (Math.hypot(mx, my) > 0.05) {
        const step = kmh * REAL_PX_PER_KMH * dt;
        const dx = mx * step, dy = -my * step;
        let np: Px = [here[0] + dx, here[1] + dy];
        if (!this.isLand(np)) { np = this.isLand([here[0] + dx, here[1]]) ? [here[0] + dx, here[1]] : this.isLand([here[0], here[1] + dy]) ? [here[0], here[1] + dy] : here; }
        if (np !== here) {
          const km = pxDeltaKm(here, np[0] - here[0], np[1] - here[1]);
          this.advance(km / kmh, this.terrain === 'road' ? km : 0, this.terrain === 'road' ? 0 : km);
          this.facing = Math.atan2(np[0] - here[0], np[1] - here[1]);
          this.pos = np;
        } else this.g.hud.prompt('');
        this.moving = 1;
      } else this.moving = 0;
      const near = this.nearestNode();
      if (near && inp.pressed('interact')) this.openPanel(near);
    }
    // zoom
    const wheel = interactive ? inp.consumeMouseDelta().wheel : 0;
    if (interactive) this.dist = THREE.MathUtils.clamp(this.dist * (1 + wheel * 0.12) * (1 + (inp.triggers.lt - inp.triggers.rt) * dt * 1.5), 30, 700);
    if (interactive) {
    // discovery
    this.discoverT -= dt;
    if (this.discoverT <= 0) { this.discoverT = 0.3; this.discover(); }
    }
    // token
    const p = this.pos;
    const leg = this.auto?.legs[this.auto.i];
    const flying = leg?.mode === 'air', sailing = leg?.mode === 'sea';
    const ground = Math.max(0, this.heightAt(p));
    const y = flying ? ground + 18 + Math.sin(performance.now() / 300) * 0.6 : sailing ? 0.2 : ground;
    this.token.position.set(p[0] - ATLAS_W / 2, y, p[1] - ATLAS_H / 2);
    this.token.rotation.y = this.facing;
    this.token.scale.setScalar(Math.max(1, this.dist / 110)); // stay readable when zoomed out
    this.boat.visible = !!sailing;
    this.phase += dt * 9 * this.moving;
    animateLimbs(this.rig, this.phase, this.moving);
    // camera
    const target = this.token.position.clone();
    const desired = target.clone().add(new THREE.Vector3(0, this.dist * 0.95, this.dist * 0.62));
    if (this.camPos.lengthSq() === 0) this.camPos.copy(desired); else this.camPos.lerp(desired, Math.min(1, dt * 4));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(target);
    this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix();
    (this.scene.fog as THREE.Fog).near = this.dist * 2.5; (this.scene.fog as THREE.Fog).far = this.dist * 8 + 400;
    this.hud();
    this.updateLabels();
  }

  private hud() {
    const s = this.g.state, w = s.world!, p = this.pos;
    const ll = pxToLatLon(p);
    let region = '', rd = 160;
    for (const r of [...WORLD.regions, ...WORLD.waters.filter((x) => x.kind !== 'river')]) { const d = Math.hypot(r.px[0] - p[0], r.px[1] - p[1]); if (d < rd) { rd = d; region = r.name; } }
    const near = this.nearestNode(60);
    const nearKm = near ? pxDeltaKm(p, near.px[0] - p[0], near.px[1] - p[1]) : 0;
    const leg = this.auto?.legs[this.auto.i];
    const modeTxt = leg ? (leg.mode === 'air' ? `AIRSHIP → ${leg.label}` : leg.mode === 'sea' ? `FERRY → ${leg.label}` : `EN ROUTE → ${leg.label}`) :
      this.terrain === 'road' ? `ON ROAD · ${OVERLAND_KMH.road} km/h` : this.terrain === 'rough' ? `MOUNTAINS · ${OVERLAND_KMH.rough} km/h` : `OPEN COUNTRY · ${OVERLAND_KMH.offroad} km/h`;
    const k = (a: string) => this.g.hud.k(a);
    const html = `<div class="wtop"><span class="c">RYZEN-5${region ? ' · ' + esc(region.toUpperCase()) : ''}</span>
      <span>${Math.abs(ll.lat).toFixed(1)}°${ll.lat >= 0 ? 'N' : 'S'} ${Math.abs(ll.lon).toFixed(1)}°${ll.lon >= 0 ? 'E' : 'W'}</span>
      <span>${formatClock(s.clock)}</span><span class="amber">${esc(modeTxt)}</span><span>ODO ${w.odometer.toFixed(0)} km</span></div>
      <div class="wprompt">${!this.auto && !this.panelNode ? (this.nearestNode() ? `${k('interact')}${esc(this.nearestNode()!.name)}` : near ? `<span class="muted">${esc(near.name)} · ${nearKm.toFixed(0)} km</span>` : '') : this.auto && (leg!.mode === 'road' || leg!.mode === 'offroad') ? `<span class="muted">Move to cancel the course</span>` : ''}</div>
      <div class="whints">${k('move')}travel &nbsp;${k('interact')}location &nbsp;${k('holoband')}HoloBand map / set course &nbsp;${k('zoom')}zoom &nbsp;${k('save')}save</div>`;
    const el = document.getElementById('worldhud')!;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  private updateLabels() {
    const host = document.getElementById('wlabels')!;
    const want = new Set<string>();
    const W = window.innerWidth, H = window.innerHeight;
    const p = this.pos;
    for (const n of WORLD.nodes) {
      if (n.kind === 'junction' || !this.known(n)) continue;
      const d = Math.hypot(n.px[0] - p[0], n.px[1] - p[1]);
      const show = n.kind === 'city' ? true : d < this.dist * 1.2;
      if (!show) continue;
      const v = this.v3(n.px, n.kind === 'city' ? 9 : 6).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      want.add(n.id);
      let el = this.labels.get(n.id);
      if (!el) { el = document.createElement('div'); host.append(el); this.labels.set(n.id, el); }
      const cls = n.gameplay === 'confirmed' ? 'name conf' : 'name';
      const html = `<div class="${cls}">${esc(n.name)}</div>`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.style.left = `${((v.x + 1) / 2) * W}px`; el.style.top = `${((1 - v.y) / 2) * H}px`;
    }
    for (const [k, el] of this.labels) if (!want.has(k)) { el.remove(); this.labels.delete(k); }
  }
}
