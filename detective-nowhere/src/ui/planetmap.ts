import * as THREE from 'three';
import { WORLD, NODE, ATLAS_W, ATLAS_H, routeGeometry, planTrip, pxToLatLon, fmtHours, type Mode, type Px, type WNode, type Trip } from '../world/planet';
import { esc } from './nav';
import type { Game } from '../game';

type Layer = 'roads' | 'sea' | 'air' | 'trade' | 'outposts' | 'labels' | 'atlas' | 'grid';
const LAYER_NAMES: Record<Layer, string> = { roads: 'ROADS', sea: 'SEA LANES', air: 'AIRSHIP', trade: 'TRADE', outposts: 'OUTPOSTS', labels: 'LABELS', atlas: 'ATLAS ART', grid: 'LAT/LON' };
const BASE = import.meta.env.BASE_URL;

let landImg: HTMLImageElement | null = null;
let atlasImg: HTMLImageElement | null = null;
let landTinted: HTMLCanvasElement | null = null;
let loading: Promise<void> | null = null;
function loadImages(onReady: () => void) {
  if (!loading) {
    const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    loading = Promise.all([load(`${BASE}world/ryzen5_landmask.png`), load(`${BASE}world/ryzen5_atlas.jpg`)]).then(([l, a]) => { landImg = l; atlasImg = a; });
  }
  loading.then(onReady);
}

/** Land mask → HoloBand-style land fill with a glowing coastline (built once). */
function tintedLand(): HTMLCanvasElement {
  if (landTinted) return landTinted;
  const w = landImg!.naturalWidth, h = landImg!.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.drawImage(landImg!, 0, 0);
  const d = x.getImageData(0, 0, w, h);
  const land = (i: number) => d.data[i * 4] > 127;
  const out = x.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const i = y * w + xx;
    if (!land(i)) continue;
    const edge = xx === 0 || y === 0 || xx === w - 1 || y === h - 1 || !land(i - 1) || !land(i + 1) || !land(i - w) || !land(i + w);
    const o = i * 4;
    if (edge) { out.data[o] = 111; out.data[o + 1] = 211; out.data[o + 2] = 224; out.data[o + 3] = 255; }
    else { out.data[o] = 18; out.data[o + 1] = 58; out.data[o + 2] = 70; out.data[o + 3] = 255; }
  }
  x.putImageData(out, 0, 0);
  landTinted = c;
  return c;
}

/**
 * PLANET scale of the HoloBand map: Ryzen-5 to scale (equirectangular atlas), travel network,
 * trade corridors, connection points, route planner and a 3D globe.
 */
export class PlanetMap {
  layers: Record<Layer, boolean> = { roads: true, sea: true, air: false, trade: false, outposts: true, labels: true, atlas: false, grid: true };
  modes: Record<Mode, boolean> = { road: true, sea: true, air: true };
  from = 'zixel'; to = 'kessar_bay';
  hover: WNode | null = null;
  globe = false;
  private canvas!: HTMLCanvasElement;
  private info!: HTMLElement;
  private trip: Trip | null = null;
  private pickNext: 'from' | 'to' = 'from';
  private gl: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; mesh: THREE.Mesh; tex: THREE.CanvasTexture; rotY: number; rotX: number; drag: boolean } | null = null;
  private ready = false;

  constructor(private g: Game) {}

  /** Places the player can pick in the planner (everything except bare junctions). */
  private places(): WNode[] {
    return WORLD.nodes.filter((n) => n.kind !== 'junction' && (this.layers.outposts || n.kind !== 'outpost'));
  }

  html(): string {
    const btn = (k: string, on: boolean, label: string) => `<button class="nav ${on ? 'on' : ''}" data-pl="${k}">${on ? '■' : '□'} ${label}</button>`;
    const P = WORLD.planet;
    return `<div class="planet">
      <div class="pm-left">
        <div class="pm-view">${this.globe ? '' : '<canvas class="pmap"></canvas>'}</div>
        <div class="scales" style="margin-top:6px">${(Object.keys(LAYER_NAMES) as Layer[]).map((l) => btn(`layer:${l}`, this.layers[l], LAYER_NAMES[l])).join('')}
          <button class="nav ${this.globe ? 'on' : ''}" data-pl="globe">${this.globe ? '◉' : '○'} GLOBE</button></div>
      </div>
      <div class="pm-side">
        <div class="card"><div class="kind">${esc(P.name.toUpperCase())}</div>
          Ø ${P.diameter_km.toLocaleString()} km · circ. ${P.circumference_km.toLocaleString()} km · ${P.gravity_g} g · pop ${(P.population / 1e6).toFixed(0)}M · ${P.hours_per_sol} h/sol</div>
        <h5>ROUTE PLANNER</h5>
        <div class="list">
          <button class="nav" data-pl="from">FROM ▸ <b>${esc(NODE.get(this.from)!.name)}</b></button>
          <button class="nav" data-pl="to">TO ▸ <b>${esc(NODE.get(this.to)!.name)}</b></button>
          <button class="nav" data-pl="swap">⇅ SWAP</button>
          ${this.g.inWorld ? '<button class="nav" data-pl="course">▶ SET COURSE TO DESTINATION</button>' : '<button class="nav" data-pl="overworld">▶ OPEN THE OVERWORLD (start at Zixel)</button>'}
          <div class="scales">${(['road', 'sea', 'air'] as Mode[]).map((m) => btn(`mode:${m}`, this.modes[m], m.toUpperCase())).join('')}</div>
        </div>
        <div class="pm-trip"></div>
        <div class="pm-info card" style="margin-top:8px;font-size:12px"></div>
        <p class="muted" style="font-size:11px">Click the map to set FROM, then TO. Air lanes are drawn as true great circles. Speeds: road ${WORLD.travel_modes.road.kmh}, sea ${WORLD.travel_modes.sea.kmh}, airship ${WORLD.travel_modes.air.kmh} km/h (proposed tuning).</p>
      </div></div>`;
  }

  mount(body: HTMLElement) {
    this.info = body.querySelector('.pm-info') as HTMLElement;
    body.querySelectorAll<HTMLElement>('[data-pl]').forEach((b) => b.addEventListener('click', () => this.command(b.dataset.pl!)));
    if (!this.globe) {
      this.canvas = body.querySelector('canvas.pmap') as HTMLCanvasElement;
      const wrap = body.querySelector('.pm-view') as HTMLElement;
      const w = Math.max(320, wrap.clientWidth || 640);
      this.canvas.width = w; this.canvas.height = Math.round((w * ATLAS_H) / ATLAS_W);
      this.canvas.addEventListener('mousemove', (e) => { this.hover = this.pick(e); this.draw(); this.showInfo(this.hover); });
      this.canvas.addEventListener('mouseleave', () => { this.hover = null; this.draw(); this.showInfo(null); });
      this.canvas.addEventListener('click', (e) => {
        const n = this.pick(e);
        if (!n) return;
        if (this.pickNext === 'from') { this.from = n.id; this.pickNext = 'to'; } else { this.to = n.id; this.pickNext = 'from'; }
        this.g.holo.render();
      });
    }
    this.plan();
    loadImages(() => {
      this.ready = true;
      if (this.globe) this.mountGlobe(body.querySelector('.pm-view') as HTMLElement);
      else this.draw();
    });
    this.showInfo(null);
  }

  unmount() {
    if (this.gl) { this.gl.r.dispose(); this.gl.tex.dispose(); this.gl = null; }
  }

  private command(c: string) {
    if (c.startsWith('layer:')) { const l = c.slice(6) as Layer; this.layers[l] = !this.layers[l]; }
    else if (c.startsWith('mode:')) { const m = c.slice(5) as Mode; this.modes[m] = !this.modes[m]; }
    else if (c === 'globe') { this.globe = !this.globe; }
    else if (c === 'swap') { [this.from, this.to] = [this.to, this.from]; }
    else if (c === 'overworld') { this.g.enterWorld('zixel'); return; }
    else if (c === 'course') {
      const modes = (Object.keys(this.modes) as Mode[]).filter((m) => this.modes[m]);
      if (this.g.world.setCourse(this.to, modes)) { this.g.closeHoloBand(); return; }
    }
    else if (c === 'from' || c === 'to') {
      const list = this.places();
      const cur = c === 'from' ? this.from : this.to;
      const next = list[(list.findIndex((n) => n.id === cur) + 1) % list.length].id;
      if (c === 'from') this.from = next; else this.to = next;
    }
    this.g.holo.render();
  }

  private plan() {
    const modes = (Object.keys(this.modes) as Mode[]).filter((m) => this.modes[m]);
    this.trip = planTrip(this.from, this.to, modes);
    const el = document.querySelector('#holoband .pm-trip');
    if (!el) return;
    if (!this.trip) { el.innerHTML = `<div class="card bad">No route with the selected modes.${this.to === 'wayfarers_rest' || NODE.get(this.to)!.px[1] > 740 ? ' Southreach needs SEA or AIR.' : ''}</div>`; return; }
    const t = this.trip;
    el.innerHTML = `<div class="card"><b>${t.km.toFixed(0)} km</b> · <b>${fmtHours(t.hours)}</b> <span class="muted">(${t.sols.toFixed(2)} sols)</span>
      <div style="font-size:12px;margin-top:6px;max-height:150px;overflow:auto">${t.legs.map((l) => `<div>${l.route.mode === 'road' ? '▬' : l.route.mode === 'sea' ? '≈' : '✈'} ${esc(NODE.get(l.from)!.name)} → ${esc(NODE.get(l.to)!.name)} <span class="muted">${l.km.toFixed(0)} km · ${fmtHours(l.hours)}${l.route.confidence !== 'traced' ? ' · ' + l.route.confidence : ''}</span></div>`).join('')}</div></div>`;
  }

  private showInfo(n: WNode | null) {
    if (!this.info) return;
    if (!n) { this.info.innerHTML = '<span class="muted">Hover a place for details.</span>'; return; }
    const ll = pxToLatLon(n.px);
    const st = n.gameplay === 'confirmed' ? '<span class="ok">GAMEPLAY · CONFIRMED</span>' : n.gameplay === 'candidate' ? '<span class="amber">GAMEPLAY · CANDIDATE</span>' : '<span class="muted">not yet in gameplay</span>';
    this.info.innerHTML = `<b>${esc(n.name)}</b> <span class="muted">· ${esc(n.type ?? n.kind)}</span><br/>
      ${Math.abs(ll.lat).toFixed(1)}°${ll.lat >= 0 ? 'N' : 'S'} ${Math.abs(ll.lon).toFixed(1)}°${ll.lon >= 0 ? 'E' : 'W'}${n.pop ? ` · pop ${n.pop.toLocaleString()}` : ''}${n.area_km2 ? ` · ${n.area_km2} km²` : ''}<br/>${st}
      ${n.notes ? `<br/>${esc(n.notes)}` : ''}${n.unresolved ? `<br/><span class="amber">⚠ ${esc(n.unresolved)}</span>` : ''}`;
  }

  private pick(e: MouseEvent): WNode | null {
    const r = this.canvas.getBoundingClientRect();
    const s = this.canvas.width / ATLAS_W;
    const mx = ((e.clientX - r.left) / r.width) * this.canvas.width / s, my = ((e.clientY - r.top) / r.height) * this.canvas.height / s;
    let best: WNode | null = null, bd = 14 / s;
    for (const n of this.places()) { const d = Math.hypot(n.px[0] - mx, n.px[1] - my); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  /** Draw the map at atlas resolution scaled to `ctx` (also used to build the globe texture). */
  paint(x: CanvasRenderingContext2D, s: number, ox = 0) {
    const P = (p: Px): [number, number] => [ox + p[0] * s, p[1] * s];
    x.save();
    x.fillStyle = '#07131c'; x.fillRect(ox, 0, ATLAS_W * s, ATLAS_H * s);
    if (this.layers.atlas && atlasImg) { x.globalAlpha = 0.9; x.drawImage(atlasImg, ox, 0, ATLAS_W * s, ATLAS_H * s); x.globalAlpha = 1; }
    else if (landImg) { x.imageSmoothingEnabled = false; x.drawImage(tintedLand(), ox, 0, ATLAS_W * s, ATLAS_H * s); }
    if (this.layers.grid) {
      x.strokeStyle = 'rgba(111,211,224,0.13)'; x.lineWidth = 1;
      for (let lat = -60; lat <= 60; lat += 30) { const y = ((90 - lat) / 180) * ATLAS_H * s; x.beginPath(); x.moveTo(ox, y); x.lineTo(ox + ATLAS_W * s, y); x.stroke(); }
      for (let lon = -120; lon <= 120; lon += 30) { const px = ox + (WORLD.projection.prime_meridian_px + (lon / 270) * ATLAS_W) * s; if (px < ox || px > ox + ATLAS_W * s) continue; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, ATLAS_H * s); x.stroke(); }
      x.fillStyle = 'rgba(111,211,224,0.45)'; x.font = `${Math.max(9, 10 * s * 1.4)}px monospace`;
      x.fillText('EQUATOR', ox + 6, (ATLAS_H / 2) * s - 3);
    }
    const line = (pts: Px[], color: string, w: number, dash: number[] = []) => {
      x.strokeStyle = color; x.lineWidth = w; x.setLineDash(dash); x.beginPath();
      pts.forEach((p, i) => { const [a, b] = P(p); if (i) x.lineTo(a, b); else x.moveTo(a, b); }); x.stroke(); x.setLineDash([]);
    };
    if (this.layers.trade) for (const c of WORLD.trade_corridors) {
      for (let i = 1; i < c.path.length; i++) {
        const r = WORLD.routes.find((r) => (r.a === c.path[i - 1] && r.b === c.path[i]) || (r.b === c.path[i - 1] && r.a === c.path[i]));
        if (r) line(routeGeometry(r), c.status === 'proposed' ? 'rgba(111,224,138,0.25)' : 'rgba(111,224,138,0.45)', 7 * Math.max(0.6, s));
      }
    }
    for (const r of WORLD.routes) {
      if (r.mode === 'road' && this.layers.roads) line(routeGeometry(r), r.confidence === 'traced' ? '#f0b44a' : 'rgba(240,180,74,0.6)', 1.6 * Math.max(0.8, s), r.confidence === 'traced' ? [] : [4, 3]);
      if (r.mode === 'sea' && this.layers.sea) line(routeGeometry(r), 'rgba(120,170,255,0.8)', 1.4, [6, 4]);
      if (r.mode === 'air' && this.layers.air) line(routeGeometry(r), 'rgba(232,226,208,0.7)', 1.2, [2, 4]);
    }
    if (this.trip) for (const l of this.trip.legs) line(routeGeometry(l.route), '#ffffff', 3.2 * Math.max(0.8, s));
    const me = this.g.state.world;
    if (me) { const [a, b] = P([me.x, me.y]); x.strokeStyle = '#6fd3e0'; x.lineWidth = 2; x.beginPath(); x.moveTo(a - 7, b); x.lineTo(a + 7, b); x.moveTo(a, b - 7); x.lineTo(a, b + 7); x.stroke(); x.fillStyle = '#6fd3e0'; x.fillText('CEDRIC', a + 8, b - 6); }
    const fs = Math.max(9, 11 * s * 1.3);
    x.font = `${fs}px 'Share Tech Mono', monospace`;
    if (this.layers.labels) {
      x.fillStyle = 'rgba(232,226,208,0.35)'; x.textAlign = 'center';
      for (const r of WORLD.regions) { const [a, b] = P(r.px); x.fillText(r.name.toUpperCase(), a, b); }
      x.fillStyle = 'rgba(111,170,224,0.55)';
      for (const w of WORLD.waters) { const [a, b] = P(w.px); x.fillText(w.name, a, b); }
      x.textAlign = 'left';
    }
    for (const n of WORLD.nodes) {
      if (n.kind === 'junction') continue;
      if (n.kind === 'outpost' && !this.layers.outposts) continue;
      const [a, b] = P(n.px);
      const sel = n.id === this.from || n.id === this.to;
      const r = n.kind === 'city' ? 3 + Math.log10(n.pop ?? 1e4) * 0.9 * Math.max(0.7, s) : 3.2;
      x.lineWidth = 1.5;
      if (n.kind === 'city') { x.fillStyle = n.map_no ? '#d04a3a' : '#8a5a50'; x.beginPath(); x.arc(a, b, r, 0, Math.PI * 2); x.fill(); }
      else if (n.kind === 'outpost') { x.fillStyle = n.map_no ? '#c06aa0' : '#7a5a70'; x.beginPath(); x.moveTo(a, b - r - 1); x.lineTo(a + r, b + r - 1); x.lineTo(a - r, b + r - 1); x.closePath(); x.fill(); }
      else if (n.kind === 'hive') { x.fillStyle = '#ff40c0'; x.fillRect(a - 3, b - 3, 6, 6); }
      else { x.strokeStyle = '#6fd3e0'; x.strokeRect(a - 2.5, b - 2.5, 5, 5); }
      if (n.gameplay === 'confirmed' || n.gameplay === 'candidate') { x.strokeStyle = n.gameplay === 'confirmed' ? '#6fd3e0' : '#f0b44a'; x.beginPath(); x.arc(a, b, r + 3, 0, Math.PI * 2); x.stroke(); }
      if (sel || n === this.hover) { x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.beginPath(); x.arc(a, b, r + 6, 0, Math.PI * 2); x.stroke(); }
      if (this.layers.labels && (n.kind === 'city' || n.kind === 'hive' || n.gameplay === 'confirmed' || sel || n === this.hover || (n.kind === 'outpost' && s > 0.6))) {
        x.fillStyle = n.gameplay === 'confirmed' ? '#e8f8ff' : n.kind === 'city' ? '#e8e2d0' : 'rgba(232,226,208,0.7)';
        x.fillText(n.kind === 'outpost' && n.map_no ? `${n.name}` : n.name, a + r + 4, b + 4);
      }
    }
    // scale bar (true at the equator)
    const km = WORLD.projection.km_per_px_at_equator, bar = (1000 / km) * s, bx = ox + 14, by = ATLAS_H * s - 18;
    x.fillStyle = '#e8e2d0'; x.fillRect(bx, by, bar, 3); x.font = `${Math.max(9, 10 * s * 1.3)}px monospace`;
    x.fillText('1000 km (true at equator)', bx, by - 5);
    x.restore();
  }

  draw() {
    if (!this.canvas || !this.ready) return;
    const x = this.canvas.getContext('2d')!;
    this.paint(x, this.canvas.width / ATLAS_W);
  }

  // ── 3D globe: the atlas covers 270° of longitude; the remaining 90° is shown as unsurveyed ocean ──
  private mountGlobe(host: HTMLElement) {
    const tc = document.createElement('canvas');
    tc.width = 2048; tc.height = 1024;
    const x = tc.getContext('2d')!;
    x.fillStyle = '#05101a'; x.fillRect(0, 0, 2048, 1024);
    const lonLeft = (-WORLD.projection.prime_meridian_px / ATLAS_W) * WORLD.projection.lon_span_deg; // lon at atlas x=0
    const ox = ((lonLeft + 180) / 360) * 2048;
    this.paint(x, (2048 * (WORLD.projection.lon_span_deg / 360)) / ATLAS_W, ox);
    // wrap-around: anything past +180 lon
    x.fillStyle = 'rgba(111,211,224,0.25)'; x.font = '22px monospace';
    x.fillText('UNSURVEYED', ((ox + ATLAS_W * 1.0) % 2048) + 40, 520);
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const w = host.clientWidth || 640, h = Math.round((w * 2) / 3);
    r.setSize(w, h);
    host.innerHTML = '';
    host.append(r.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 50); cam.position.set(0, 0, 4.2);
    const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshBasicMaterial({ map: tex }));
    scene.add(mesh);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.03, 64, 32), new THREE.MeshBasicMaterial({ color: '#6fd3e0', transparent: true, opacity: 0.08, side: THREE.BackSide }));
    scene.add(atmo);
    this.gl = { r, scene, cam, mesh, tex, rotY: -Math.PI / 2, rotX: 0.15, drag: false };
    const gl = this.gl;
    r.domElement.addEventListener('mousedown', () => (gl.drag = true));
    window.addEventListener('mouseup', () => (gl.drag = false));
    r.domElement.addEventListener('mousemove', (e) => { if (gl.drag) { gl.rotY += e.movementX * 0.008; gl.rotX = THREE.MathUtils.clamp(gl.rotX + e.movementY * 0.008, -1.4, 1.4); } });
    const label = document.createElement('div');
    label.className = 'muted'; label.style.fontSize = '11px';
    label.textContent = 'Drag / right stick to rotate. Prime meridian through Zixel; the atlas spans 270° of longitude.';
    host.append(label);
  }

  update(dt: number) {
    if (!this.gl) return;
    const gl = this.gl, inp = this.g.input;
    if (!gl.drag) gl.rotY += dt * 0.12;
    gl.rotY += inp.look.x * dt * 2; gl.rotX = THREE.MathUtils.clamp(gl.rotX + inp.look.y * dt * 2, -1.4, 1.4);
    gl.mesh.rotation.set(gl.rotX, gl.rotY, 0);
    gl.r.render(gl.scene, gl.cam);
  }
}
