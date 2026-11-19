import * as THREE from 'three';
import { box, mat, makeHumanoid, makeProp, animateLimbs, type Humanoid, type Look } from '../render/props';
import { makeCedric, type Rig } from '../world/actors';
import { scheduleScore, INTRO_LENGTH } from '../audio/score';
import type { Overworld } from './overworld';
import { NODE, ATLAS_W, ATLAS_H, greatCirclePx } from '../world/planet';

/**
 * OPENING CINEMATIC — "Detective Nowhere: The Coin Conspiracy" (≈90 s).
 * Graduation → surgeon years → the patient he couldn't lose → blamed → family lost →
 * a year hunting the Coin → gameplay teaser montage → arrival on Ryzen-5, Zixel, to meet Elias Venn.
 * Every shot is a pure function of time t, so the in-game playback and the MP4 export are identical.
 * Script & shot list: docs/OPENING_SCRIPT.md
 */
export const LENGTH = INTRO_LENGTH;

type Cap = { a: number; b: number; text: string; kind: 'narr' | 'tag' | 'place' | 'title' };
export const CAPTIONS: Cap[] = [
  { a: 0.4, b: 4.7, text: 'They told me my hands were a gift.', kind: 'narr' },
  { a: 5.6, b: 9.3, text: 'Top of my class. Doctor Cedric Farsight, surgeon.', kind: 'narr' },
  { a: 9.7, b: 13.6, text: 'I swore an oath: no life lost that could be saved.', kind: 'narr' },
  { a: 14.4, b: 18.1, text: 'For years, I kept it.', kind: 'narr' },
  { a: 18.8, b: 22.7, text: 'The powerful came to me. Governments trusted me with their own.', kind: 'narr' },
  { a: 23.4, b: 26.7, text: 'I never lost one.', kind: 'narr' },
  { a: 27.6, b: 31.6, text: 'Until the one patient I could not lose.', kind: 'narr' },
  { a: 32.0, b: 35.6, text: 'A government official. Every reading was right. Every cut was clean.', kind: 'narr' },
  { a: 36.6, b: 39.7, text: 'He died on my table.', kind: 'narr' },
  { a: 40.4, b: 44.2, text: 'They needed someone to blame.', kind: 'narr' },
  { a: 44.6, b: 48.6, text: 'They chose the man holding the scalpel.', kind: 'narr' },
  { a: 49.6, b: 52.8, text: 'My family stood by me through all of it.', kind: 'narr' },
  { a: 53.5, b: 55.4, text: 'Weeks later, someone came for them.', kind: 'narr' },
  { a: 55.8, b: 57.8, text: 'They left one thing behind.', kind: 'narr' },
  { a: 58.6, b: 62.4, text: 'I put down the scalpel. I picked up the trail.', kind: 'narr' },
  { a: 62.8, b: 67.6, text: 'One year hunting a name that only exists in whispers: the Coin.', kind: 'narr' },
  { a: 68.3, b: 70.7, text: 'Then, at last, the trail gave me a place.', kind: 'narr' },
  { a: 71.4, b: 75.2, text: 'My best lead in a year points to one world.', kind: 'narr' },
  { a: 71.5, b: 75.2, text: 'RYZEN-5', kind: 'place' },
  { a: 76.0, b: 79.9, text: 'Zixel. A contact named Elias Venn.', kind: 'narr' },
  { a: 76.1, b: 79.9, text: 'ZIXEL · VEYRA DISTRICT', kind: 'place' },
  { a: 80.35, b: 81.55, text: 'MOVE UNSEEN', kind: 'tag' },
  { a: 81.725, b: 82.925, text: 'WEAR ANY FACE', kind: 'tag' },
  { a: 83.1, b: 84.3, text: 'SURVIVE THE AMBUSH', kind: 'tag' },
  { a: 84.475, b: 85.675, text: 'STRIKE FROM THE SHADOWS', kind: 'tag' },
  { a: 85.85, b: 87.05, text: 'QUESTION EVERYONE', kind: 'tag' },
  { a: 87.225, b: 88.425, text: 'CROSS A WORLD THAT KEEPS ITS SECRETS', kind: 'tag' },
  { a: 88.9, b: 91.7, text: 'Whoever they are — I am coming.', kind: 'narr' },
  { a: 88.6, b: 92.6, text: 'DETECTIVE NOWHERE', kind: 'title' },
];

// ── helpers ──────────────────────────────────────────────────────────────
const ss = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function rnd(i: number) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function dolly(cam: THREE.PerspectiveCamera, k: number, from: THREE.Vector3, to: THREE.Vector3, lookA: THREE.Vector3, lookB: THREE.Vector3) {
  const e = ss(k);
  cam.position.lerpVectors(from, to, e);
  cam.lookAt(new THREE.Vector3().lerpVectors(lookA, lookB, e));
}

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
function plane(w: number, h: number, tex: THREE.Texture, emissive = true) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), emissive ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ map: tex }));
}

/** ECG monitor whose trace is redrawn from time: steady → faltering → flat. */
class Monitor {
  readonly mesh: THREE.Group;
  private c = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  constructor() {
    this.c.width = 160; this.c.height = 100;
    this.tex = new THREE.CanvasTexture(this.c); this.tex.magFilter = THREE.NearestFilter; this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Group();
    this.mesh.add(box(0.9, 0.6, 0.08, '#1a1d22', 0, -0.3, -0.05));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.52), new THREE.MeshBasicMaterial({ map: this.tex }));
    scr.position.z = 0.0; this.mesh.add(scr);
  }
  /** mode: 0 steady, 1 faltering, 2 flat; red tint when alarm. */
  draw(t: number, mode: 0 | 1 | 2, alarm = false) {
    const x = this.c.getContext('2d')!;
    x.fillStyle = alarm ? '#2a0608' : '#04161a'; x.fillRect(0, 0, 160, 100);
    x.strokeStyle = alarm ? '#ff5a5a' : '#5af0a0'; x.lineWidth = 2; x.beginPath();
    for (let i = 0; i < 160; i++) {
      const tt = t - (160 - i) * 0.012;
      const period = mode === 1 ? 0.55 + Math.sin(tt * 3) * 0.25 : 0.8;
      const ph = ((tt % period) + period) % period / period;
      let y = 55;
      if (mode !== 2) { if (ph < 0.05) y -= 6 * Math.sin(ph / 0.05 * Math.PI); else if (ph < 0.12) y += 4; else if (ph < 0.16) y -= 34 * (mode === 1 ? 0.6 + 0.4 * Math.sin(tt * 7) : 1); else if (ph < 0.2) y += 10; }
      if (i) x.lineTo(i, y); else x.moveTo(i, y);
    }
    x.stroke();
    x.fillStyle = alarm ? '#ff8a8a' : '#9ff4ff'; x.font = '12px monospace';
    x.fillText(mode === 2 ? 'HR ---' : `HR ${mode === 1 ? 40 + Math.floor((Math.sin(t * 5) + 1) * 30) : 72}`, 6, 14);
    this.tex.needsUpdate = true;
  }
}

/** Cedric's own model (A02 V2) re-dressed for each era of his life. */
function cedric(outfit: 'coat' | 'scrubs' | 'robe' | 'suit'): Rig {
  const r = makeCedric(1.85);
  const pal: Record<string, [string, string]> = { coat: ['', ''], scrubs: ['#3f8f8a', '#d8dcdc'], robe: ['#191820', '#c9a34a'], suit: ['#2a3550', '#20232a'] };
  const [cloth, trim] = pal[outfit];
  if (cloth) r.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const isCloth = /(Coat|Sleeve|Lapel|Vest|Trouser|Collar|Skirt|Hem|Cuff|Pouch|Clasp|Belt|Buckle|Fold|Button|Wear|Seam)/.test(m.name);
    const isTrim = /(Piping|Embroid|Chain|Pendant)/.test(m.name);
    const isBoot = /(Boot|Sole|Strap|Latch|Toe)/.test(m.name);
    if (!isCloth && !isTrim && !isBoot) return;
    const nm = (m.material as THREE.MeshStandardMaterial).clone();
    nm.color = new THREE.Color(isTrim ? trim : isBoot ? (outfit === 'scrubs' ? '#cfd4d6' : '#15161a') : cloth);
    m.material = nm;
  });
  if (outfit === 'robe') {
    const cap = new THREE.Group();
    cap.add(box(0.5, 0.05, 0.5, '#15141a', 0, 1.93, 0), box(0.24, 0.1, 0.24, '#15141a', 0, 1.84, 0), box(0.03, 0.22, 0.03, '#c9a34a', 0.22, 1.74, 0.1));
    r.body.add(cap);
  }
  return r;
}
function person(look: Look): Humanoid { const h = makeHumanoid(look); h.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; }); return h; }
const OP: Look = { skin: '#6f6f78', coat: '#4d5560', hair: '#222222', height: 1.04, mask: true };

interface Shot { a: number; b: number; scene: THREE.Scene; cam: THREE.PerspectiveCamera; update: (t: number, k: number) => void; scan?: (t: number) => number; hardCut?: boolean }

function stage(bg: string, hemi = 0.6, fog?: [number, number], key = '#ffffff') {
  const s = new THREE.Scene();
  s.background = new THREE.Color(bg);
  if (fog) s.fog = new THREE.Fog(bg, fog[0], fog[1]);
  s.add(new THREE.HemisphereLight('#cfdcff', '#2a2430', 0.9 + hemi * 2.2));
  s.add(new THREE.AmbientLight('#505868', 0.9));
  const k = new THREE.DirectionalLight(key, 0.6 + hemi * 1.6); k.position.set(3, 6, 6); s.add(k);
  return s;
}
const cam = (fov = 40) => new THREE.PerspectiveCamera(fov, 16 / 9, 0.05, 400);

export class IntroCinematic {
  shots: Shot[] = [];
  built = false;
  playing = false;
  private audio: AudioContext | null = null;
  private startedAt = 0;
  private clockStart = 0;
  private onDone: (() => void) | null = null;
  current: { scene: THREE.Scene; cam: THREE.PerspectiveCamera; scan: number } | null = null;
  private el = () => document.getElementById('intro')!;
  /** The overworld (Ryzen-5 terrain) for the planet-travel cut; set by Game. */
  world: Overworld | null = null;
  private evidence: { scene: THREE.Scene } | null = null;
  private travelShip: THREE.Object3D | null = null;

  build() {
    if (this.built) return;
    this.built = true;
    this.shots.push(this.coldOpen(), this.graduation(), ...this.career(), ...this.operation(), this.fall(), ...this.family(), ...this.detective(), ...this.arrival(), ...this.montage());
    this.shots.sort((x, y) => x.a - y.a);
  }

  // ── 0–5  cold open ──
  private coldOpen(): Shot {
    const s = stage('#000000', 0.2), c = cam(30);
    const mon = new Monitor(); mon.mesh.scale.setScalar(3.2); s.add(mon.mesh);
    return { a: 0, b: 5, scene: s, cam: c, update: (t, k) => { mon.draw(t, 0); dolly(c, k, V(0, 0, 4.4), V(0, 0, 3.2), V(0, 0, 0), V(0, 0, 0)); } };
  }

  // ── 5–14  graduation ──
  private graduation(): Shot {
    const s = stage('#120e10', 0.45, [14, 40]), c = cam(38);
    s.add(box(30, 0.1, 30, '#2b2228', 0, -0.1, 0));
    s.add(box(12, 0.8, 4.5, '#4a2f24', 0, 0, -3)); // stage
    s.add(box(12, 6, 0.3, '#2a1c22', 0, 0, -5.4)); // back wall
    const emblem = canvasTex(128, 256, (x) => {
      x.fillStyle = '#5a1420'; x.fillRect(0, 0, 128, 256); x.fillStyle = '#c9a34a';
      x.fillRect(60, 40, 8, 160); x.beginPath(); x.arc(64, 60, 22, 0, Math.PI * 2); x.lineWidth = 6; x.strokeStyle = '#c9a34a'; x.stroke();
      for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(64, 90 + i * 22, 14, i % 2 ? 0 : Math.PI, i % 2 ? Math.PI : Math.PI * 2); x.stroke(); }
      x.fillRect(0, 230, 128, 6);
    });
    for (const bx of [-4, 0, 4]) { const p = plane(1.6, 3.2, emblem, false); p.position.set(bx, 3.2, -5.2); s.add(p); }
    const pod = box(0.8, 1.2, 0.6, '#3a2a20', 1.2, 0.8, -2.6); s.add(pod);
    const dean = person({ skin: '#9a8f7a', coat: '#6a1424', hair: '#d0d0d0', height: 1.05 }); dean.root.position.set(0.6, 0.8, -2.8); s.add(dean.root);
    const ced = cedric('robe'); ced.root.position.set(-4, 0.8, -2.6); s.add(ced.root);
    const dip = box(0.08, 0.08, 0.38, '#efe8d8'); dip.rotation.z = Math.PI / 2; s.add(dip);
    // audience (backs to camera)
    const crowd: Humanoid[] = [];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
      const h = person({ skin: ['#c49a7a', '#7aa6c9', '#8fb88a', '#c98a7a'][(row + i) % 4], coat: ['#2b2b3a', '#3a2b2b', '#2b3a33'][(i + row) % 3], hair: ['#2a2a2a', '#7a4a2a', '#c0c0c0'][i % 3], height: 0.95 + rnd(i + row * 9) * 0.12 });
      h.root.position.set(-5 + i * 1.25 + (row % 2) * 0.5, 0, 1 + row * 1.4); h.root.rotation.y = Math.PI; s.add(h.root); crowd.push(h);
    }
    const spot = new THREE.SpotLight('#ffd9a0', 160, 24, 0.55, 0.6, 1.2); spot.position.set(0, 9, 2); spot.target.position.set(0, 0.8, -2.7); s.add(spot, spot.target);
    const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.05), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false, color: '#ffffff' }), 160);
    const cols = ['#c9a34a', '#e8e2d0', '#6fd3e0', '#c04a5a'].map((x) => new THREE.Color(x));
    for (let i = 0; i < 160; i++) conf.setColorAt(i, cols[i % 4]);
    s.add(conf);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    return {
      a: 5, b: 14, scene: s, cam: c, update: (t) => {
        const lt = t - 5;
        const walk = ss((lt - 0.3) / 4.2);
        ced.root.position.x = lerp(-4, -0.2, walk);
        ced.root.rotation.y = lt < 4.8 ? Math.PI / 2 : lt < 6.3 ? Math.PI / 2 - ss((lt - 4.8) / 0.6) * Math.PI / 2 : ss((lt - 6.3) / 0.5) * 0;
        animateLimbs(ced, lt * 8, walk > 0 && walk < 1 ? 1 : 0);
        // diploma handover then raised
        if (lt < 5) { dip.position.set(0.25, 1.95, -2.55); dean.armL.rotation.x = -1.0 * ss((lt - 3.6) / 0.6); }
        else { dean.armL.rotation.x = -1.0 * (1 - ss((lt - 5.6) / 0.6)); const up = ss((lt - 6.4) / 0.7); ced.armR.rotation.x = -lerp(1.0, 2.9, up); dip.position.set(ced.root.position.x + 0.32, 2.0 + up * 0.75, -2.35); }
        if (lt >= 4.6 && lt < 6.4) ced.armR.rotation.x = -1.0 * ss((lt - 4.6) / 0.5);
        crowd.forEach((h, i) => { const clap = lt > 6.2 ? Math.abs(Math.sin(lt * 14 + i)) : 0; h.armL.rotation.x = -0.8 - clap * 0.3; h.armR.rotation.x = -0.8 - clap * 0.3; });
        for (let i = 0; i < 160; i++) {
          const ft = lt - 6.2 - rnd(i) * 0.6;
          const y = ft < 0 ? 20 : 7.5 - ft * (0.9 + rnd(i + 7) * 0.6);
          m4.compose(V(-6 + rnd(i + 3) * 12 + Math.sin(ft * 2 + i) * 0.3, y, -3 + rnd(i + 5) * 6), q.setFromEuler(new THREE.Euler(ft * 4 + i, ft * 3, i)), V(1, 1, 1));
          conf.setMatrixAt(i, m4);
        }
        conf.instanceMatrix.needsUpdate = true;
        const k = lt / 9;
        dolly(c, k, V(-0.5, 2.6, 6.2), V(-0.4, 2.3, 2.4), V(-1.4, 1.9, -2.6), V(-0.2, 2.4, -2.6));
      },
    };
  }

  // ── shared operating theatre ──
  private orRoom(red: boolean) {
    const s = stage(red ? '#0a0608' : '#081214', red ? 0.35 : 0.55, [10, 30]);
    s.add(box(16, 0.1, 16, '#1c2a2c', 0, -0.1, 0));
    s.add(box(16, 5, 0.3, '#2a3c3e', 0, 0, -4));
    s.add(box(0.3, 5, 16, '#26383a', -5, 0, 0));
    const table = new THREE.Group(); table.add(box(0.9, 0.9, 2.2, '#5a6470'), box(1.0, 0.08, 2.3, '#9aa4ae', 0, 0.9, 0)); s.add(table);
    const lamp = new THREE.Group();
    lamp.add(box(0.06, 1.6, 0.06, '#3a3f46', 0, 2.8, -0.3));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 24), new THREE.MeshLambertMaterial({ color: '#cfd8dc', emissive: '#a0b0b8' })); disc.position.set(0, 2.75, 0); lamp.add(disc);
    s.add(lamp);
    const spot = new THREE.SpotLight('#eaf6ff', 22, 10, 0.6, 0.5, 1.2); spot.position.set(0, 2.7, 0); spot.target.position.set(0, 0.9, 0); s.add(spot, spot.target);
    const mon = new Monitor(); mon.mesh.position.set(1.4, 1.9, -1.0); mon.mesh.rotation.y = -0.5; s.add(mon.mesh);
    s.add(box(0.1, 1.5, 0.1, '#3a3f46', 1.4, 0, -1.0));
    const patient = person({ skin: red ? '#b8a07a' : '#c9a27a', coat: '#d8dcdc', hair: '#3a2a20', height: 1.0 });
    patient.root.rotation.x = -Math.PI / 2; patient.root.position.set(0, 1.08, 0.85); s.add(patient.root);
    const sheet = box(0.95, 0.12, 1.6, '#2f6a66', 0, 0.98, 0.1); s.add(sheet);
    const ced = cedric('scrubs'); ced.root.position.set(-0.95, 0, 0.1); ced.root.rotation.y = Math.PI / 2; s.add(ced.root);
    const asst = [person({ skin: '#8fb88a', coat: '#3f8f8a', hair: '#2a2a2a', height: 0.98 }), person({ skin: '#7aa6c9', coat: '#3f8f8a', hair: '#e0d0b0', height: 0.96 })];
    asst[0].root.position.set(0.95, 0, 0.5); asst[0].root.rotation.y = -Math.PI / 2; asst[1].root.position.set(0.9, 0, -0.5); asst[1].root.rotation.y = -Math.PI / 2;
    asst.forEach((h) => { h.armL.rotation.x = h.armR.rotation.x = -1.1; s.add(h.root); });
    const alarm = new THREE.PointLight('#ff2020', 0, 14, 1.2); alarm.position.set(0, 3.5, 1); s.add(alarm);
    return { s, ced, mon, spot, alarm, patient, sheet };
  }

  // ── 14–27  surgeon years (three cuts) ──
  private career(): Shot[] {
    const or1 = this.orRoom(false);
    const c1 = cam(36);
    const a: Shot = { a: 14, b: 18.5, scene: or1.s, cam: c1, update: (t) => {
      const lt = t - 14; or1.mon.draw(t, 0);
      or1.ced.armL.rotation.x = -1.25 + Math.sin(lt * 3) * 0.06; or1.ced.armR.rotation.x = -1.3 + Math.sin(lt * 2.4 + 1) * 0.08;
      const ang = 0.55 + lt * 0.08;
      c1.position.set(Math.cos(ang) * 3.6, 2.4, Math.sin(ang) * 3.6); c1.lookAt(-0.6, 1.4, 0);
    } };
    // office: the powerful
    const s = stage('#0a0c14', 0.55, [10, 40]), c2 = cam(38);
    s.add(box(14, 0.1, 14, '#2a2026', 0, -0.1, 0));
    const sky = canvasTex(512, 256, (x) => {
      const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#0a1430'); g.addColorStop(1, '#3a2a40'); x.fillStyle = g; x.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 40; i++) { const w = 10 + rnd(i) * 26, h = 60 + rnd(i + 9) * 170, xx = i * 13 % 512; x.fillStyle = '#121a2c'; x.fillRect(xx, 256 - h, w, h); for (let k = 0; k < 18; k++) if (rnd(i * 31 + k) > 0.55) { x.fillStyle = '#f0c060'; x.fillRect(xx + 2 + (k % 3) * 7, 256 - h + 6 + Math.floor(k / 3) * 14, 3, 4); } }
    });
    const win = plane(9, 4.5, sky); win.position.set(0, 2.5, -4); s.add(win);
    s.add(box(9.4, 0.25, 0.3, '#1a1416', 0, 4.7, -3.95), box(0.25, 4.7, 0.3, '#1a1416', -4.6, 0, -3.95), box(0.25, 4.7, 0.3, '#1a1416', 4.6, 0, -3.95));
    const desk = makeProp('desk'); desk.position.set(1.8, 0, -2.2); desk.scale.setScalar(1.3); s.add(desk);
    const plaques = [box(0.5, 0.36, 0.05, '#c9a34a', -3.5, 2.0, -3.8, '#3a2a10'), box(0.5, 0.36, 0.05, '#c9a34a', -2.8, 2.6, -3.8, '#3a2a10')];
    s.add(...plaques);
    const ced = cedric('suit'); ced.root.position.set(-0.6, 0, -0.3); ced.root.rotation.y = Math.PI / 2 - 0.3; s.add(ced.root);
    const vip = person({ skin: '#b06a5a', coat: '#4a2a5a', hair: '#e8e2d0', height: 1.06 });
    vip.root.position.set(0.6, 0, -0.3); vip.root.rotation.y = -Math.PI / 2 + 0.3;
    vip.body.add(box(0.52, 0.1, 0.32, '#c9a34a', 0, 1.0, 0)); s.add(vip.root);
    const guard = person({ skin: '#6f6f78', coat: '#2c3b55', hair: '#111', height: 1.1 }); guard.root.position.set(2.8, 0, 0.8); guard.root.rotation.y = -2.4; s.add(guard.root);
    const l = new THREE.PointLight('#ffd9a0', 20, 10, 1.4); l.position.set(0, 3, 2); s.add(l);
    const b: Shot = { a: 18.5, b: 23, scene: s, cam: c2, update: (t, k) => {
      const shake = ss((t - 19.6) / 0.6);
      ced.armR.rotation.x = -1.1 * shake + Math.sin(t * 9) * 0.05 * shake; vip.armR.rotation.x = -1.1 * shake + Math.sin(t * 9) * 0.05 * shake;
      dolly(c2, k, V(-1.5, 1.9, 4.8), V(-0.4, 1.7, 2.6), V(0, 1.4, -0.3), V(0, 1.45, -0.4));
    } };
    const or2 = this.orRoom(false);
    const c3 = cam(30);
    const cc: Shot = { a: 23, b: 27, scene: or2.s, cam: c3, update: (t, k) => {
      or2.mon.draw(t, 0);
      or2.ced.armL.rotation.x = -1.2 + Math.sin(t * 5) * 0.1; or2.ced.armR.rotation.x = -1.35 + Math.sin(t * 5 + 2) * 0.12;
      dolly(c3, k, V(1.6, 1.8, 1.6), V(1.1, 1.75, 0.9), V(-0.9, 1.55, 0.1), V(-0.9, 1.6, 0.1));
    } };
    return [a, b, cc];
  }

  // ── 27–40  the operation ──
  private operation(): Shot[] {
    const or = this.orRoom(true);
    // gallery: officials behind glass
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.4), new THREE.MeshLambertMaterial({ color: '#7ab8d0', transparent: true, opacity: 0.18 }));
    glass.position.set(0, 3.6, -3.2); or.s.add(glass);
    or.s.add(box(7, 0.25, 1.6, '#1a1e22', 0, 2.3, -3.9));
    const watchers: Humanoid[] = [];
    [['#2c3b55', '#c9a34a'], ['#3a3a44', '#c9a34a'], ['#2c3b55', '#c9a34a'], ['#22252c', '#222'], ['#22252c', '#222']].forEach(([coat], i) => {
      const h = person({ skin: ['#9a8f7a', '#7aa6c9', '#c49a7a', '#6f6f78', '#6f6f78'][i], coat, hair: '#222', height: 1.04 });
      h.root.position.set(-2.4 + i * 1.2, 2.55, -3.7); s(h); watchers.push(h);
    });
    function s(h: Humanoid) { or.s.add(h.root); }
    or.patient.body.add(box(0.12, 0.6, 0.33, '#c9a34a', 0.12, 0.62, 0.0)); // official's sash
    const camA = cam(34), camB = cam(28), camC = cam(30);
    const shotA: Shot = { a: 27, b: 33.5, scene: or.s, cam: camA, update: (t, k) => {
      or.mon.draw(t, t < 31 ? 0 : 1);
      or.ced.armL.rotation.x = -1.25 + Math.sin(t * 4) * 0.07; or.ced.armR.rotation.x = -1.3 + Math.sin(t * 3.4) * 0.09;
      dolly(camA, k, V(0.6, 3.6, -2.6), V(0.9, 2.6, -1.2), V(-0.4, 1.3, 0.3), V(-0.8, 1.5, 0.1));
    } };
    const shotB: Shot = { a: 33.5, b: 36, scene: or.s, cam: camB, update: (t, k) => {
      or.mon.draw(t, 1, t > 35.2);
      or.alarm.intensity = t > 35.2 ? 30 * (Math.sin(t * 12) > 0 ? 1 : 0.2) : 0;
      dolly(camB, k, V(1.0, 1.95, 0.1), V(1.15, 1.92, -0.45), V(1.4, 1.9, -1.0), V(1.4, 1.9, -1.0));
    } };
    const shotC: Shot = { a: 36, b: 40, scene: or.s, cam: camC, update: (t, k) => {
      const lt = t - 36;
      or.mon.draw(t, 2, true);
      or.alarm.intensity = 30 * (Math.sin(t * 10) > 0 ? 1 : 0.25);
      or.spot.intensity = 22 * (1 - ss(lt / 1.5)) + 4;
      const back = ss((lt - 1.2) / 1.2);
      or.ced.root.position.x = -0.95 - back * 0.7;
      or.ced.armL.rotation.x = lt < 1.2 ? -1.25 : lerp(-1.25, -1.8, ss((lt - 2) / 1));
      or.ced.armR.rotation.x = lt < 1.2 ? -1.3 : lerp(-1.3, -1.8, ss((lt - 2) / 1));
      watchers.forEach((h, i) => { h.root.rotation.y = Math.sin(t * 2 + i) * 0.15; });
      dolly(camC, k, V(1.2, 1.75, 1.4), V(0.6, 1.7, 0.8), V(-1.0, 1.6, 0.1), V(-1.6, 1.65, 0.1));
    } };
    return [shotA, shotB, shotC];
  }

  // ── 40–49  the fall ──
  private fall(): Shot {
    const s = stage('#05060a', 0.35, [8, 26]), c = cam(38);
    s.add(box(30, 0.1, 30, '#121418', 0, -0.1, 0));
    const ced = cedric('coat'); s.add(ced.root);
    const heads = ['SURGEON BLAMED IN OFFICIAL\'S DEATH', 'INQUIRY: "GROSS NEGLIGENCE"', 'MEDICAL LICENSE REVOKED', 'FARSIGHT DISGRACED', 'THE HANDS THAT FAILED', 'NO CHARGES — NO CAREER'];
    const panels = heads.map((h, i) => {
      const t = canvasTex(320, 120, (x) => {
        x.fillStyle = 'rgba(10,20,30,0.85)'; x.fillRect(0, 0, 320, 120); x.strokeStyle = i === 2 ? '#ff5a5a' : '#6fd3e0'; x.lineWidth = 4; x.strokeRect(2, 2, 316, 116);
        x.fillStyle = i === 2 ? '#ff5a5a' : '#6fd3e0'; x.font = 'bold 13px monospace'; x.fillText('HOLONEWS · BREAKING', 14, 24);
        x.fillStyle = '#e8e2d0'; x.font = 'bold 19px monospace';
        const words = h.split(' '); let line = '', y = 58;
        for (const w of words) { if ((line + w).length > 22) { x.fillText(line, 14, y); line = ''; y += 24; } line += w + ' '; }
        x.fillText(line, 14, y);
      });
      const p = plane(2.4, 0.9, t); s.add(p); return p;
    });
    const crowd: Humanoid[] = [];
    for (let i = 0; i < 14; i++) { const h = person({ skin: '#111', coat: '#0c0c10', hair: '#000', height: 0.95 + rnd(i) * 0.15 }); const a = (i / 14) * Math.PI * 2; h.root.position.set(Math.cos(a) * 5, 0, Math.sin(a) * 5); s.add(h.root); crowd.push(h); }
    const flash = new THREE.PointLight('#ffffff', 0, 12, 1.2); flash.position.set(0, 2.5, 2); s.add(flash);
    const key = new THREE.SpotLight('#9fb8ff', 25, 12, 0.5, 0.7, 1.3); key.position.set(0, 7, 1); key.target.position.set(0, 1, 0); s.add(key, key.target);
    return { a: 40, b: 49, scene: s, cam: c, update: (t, k) => {
      const lt = t - 40;
      panels.forEach((p, i) => {
        const appear = ss((lt - 0.4 - i * 1.1) / 0.4);
        const ang = i * 1.05 + lt * 0.08;
        p.position.set(Math.cos(ang) * 2.4, 1.2 + (i % 3) * 0.75 + Math.sin(lt + i) * 0.05, Math.sin(ang) * 2.4);
        p.lookAt(c.position.x, p.position.y, c.position.z);
        p.scale.setScalar(appear * (i === 2 ? 1.25 : 1));
        (p.material as THREE.MeshBasicMaterial).opacity = appear;
      });
      crowd.forEach((h, i) => { const turn = ss((lt - 3 - i * 0.25) / 0.6); h.root.rotation.y = Math.atan2(-h.root.position.x, -h.root.position.z) + Math.PI * turn; });
      flash.intensity = (Math.floor(lt * 7) % 5 === 0 && lt < 6) ? 60 : 0;
      ced.root.rotation.y = 0.2;
      ced.body.rotation.x = 0.12 * ss(lt / 4);
      dolly(c, k, V(0.6, 2.0, 3.4), V(0.3, 3.8, 7.2), V(0, 1.4, 0), V(0, 1.0, 0));
    } };
  }

  // ── 49–58  family ──
  private family(): Shot[] {
    const room = (night: boolean) => {
      const s = stage(night ? '#03050c' : '#120c08', night ? 0.25 : 0.5, [8, 22]);
      s.add(box(14, 0.1, 14, night ? '#14161c' : '#3a2a20', 0, -0.1, 0));
      s.add(box(14, 4, 0.3, night ? '#1a1c26' : '#4a3a30', 0, 0, -3), box(0.3, 4, 14, night ? '#181a22' : '#43342b', -4, 0, 0));
      const t = makeProp('table'); t.scale.set(2, 1, 1.4); t.position.set(0, 0, -0.6); s.add(t);
      const win = plane(1.6, 1.4, canvasTex(32, 32, (x) => { x.fillStyle = night ? '#1a3a6a' : '#e0a060'; x.fillRect(0, 0, 32, 32); x.fillStyle = '#000'; x.fillRect(15, 0, 2, 32); x.fillRect(0, 15, 32, 2); }));
      win.position.set(2.2, 2.0, -2.84); s.add(win);
      return s;
    };
    const day = room(false), c1 = cam(36);
    const lamp = new THREE.PointLight('#ffb070', 16, 8, 1.3); lamp.position.set(0, 2.3, -0.6); day.add(lamp);
    const fam = [{ x: -0.9, z: -1.3, h: 1.0 }, { x: 0.9, z: -1.3, h: 0.98 }, { x: 0.0, z: 0.4, h: 0.72 }].map((f, i) => {
      const h = person({ skin: '#2a1a14', coat: ['#3a2a2a', '#2a2a3a', '#3a3a2a'][i], hair: '#0a0a0a', height: f.h });
      h.root.position.set(f.x, 0, f.z); h.root.lookAt(0, 0, -0.6); day.add(h.root); return h;
    });
    const ced = cedric('coat'); ced.root.position.set(2.2, 0, -2.0); ced.root.rotation.y = Math.PI; day.add(ced.root);
    const a: Shot = { a: 49, b: 53, scene: day, cam: c1, update: (t, k) => {
      fam.forEach((h, i) => { h.head.rotation.y = Math.sin(t * 0.8 + i) * 0.2; });
      dolly(c1, k, V(-3.0, 2.2, 3.6), V(-2.2, 2.0, 2.6), V(0.4, 1.0, -0.8), V(0.8, 1.2, -1.2));
    } };
    const night = room(true), c2 = cam(34);
    const moon = new THREE.DirectionalLight('#6a8aff', 0.8); moon.position.set(3, 4, -2); night.add(moon);
    night.add(box(1.2, 2.4, 0.1, '#0a0a10', -2.6, 0, -2.84));
    const door = plane(1.0, 2.2, canvasTex(8, 8, (x) => { x.fillStyle = '#c8d0ff'; x.fillRect(0, 0, 8, 8); }));
    door.position.set(-2.6, 1.1, -2.78); night.add(door);
    const doorLight = new THREE.PointLight('#c8d0ff', 18, 7, 1.3); doorLight.position.set(-2.6, 1.4, -2.2); night.add(doorLight);
    const shadows = [person({ skin: '#000', coat: '#000', hair: '#000', height: 1.08, mask: true }), person({ skin: '#000', coat: '#000', hair: '#000', height: 1.02, mask: true })];
    shadows.forEach((h, i) => { h.root.position.set(-2.8 + i * 0.5, 0, -2.4); night.add(h.root); });
    const chair = makeProp('chair'); chair.position.set(0.8, 0.22, 0.3); chair.rotation.set(0, 0.6, Math.PI / 2); night.add(chair);
    const b: Shot = { a: 53, b: 55, scene: night, cam: c2, update: (t, k) => {
      shadows.forEach((h, i) => { h.root.position.z = -2.4 + ss((t - 53.4) / 1.2) * (0.6 + i * 0.3); animateLimbs(h, t * 6, 0.6); });
      dolly(c2, k, V(-0.6, 1.5, 3.2), V(-1.0, 1.5, 2.4), V(-2.6, 1.2, -2.6), V(-2.6, 1.3, -2.6));
    } };
    // the coin
    const coinScene = room(true), c3 = cam(30);
    const l = new THREE.SpotLight('#ffe8c0', 90, 8, 0.4, 0.6, 1.1); l.position.set(0.5, 4, 1.2); l.target.position.set(0, 0, 0.5); coinScene.add(l, l.target);
    const chair2 = makeProp('chair'); chair2.position.set(-1.6, 0.22, -0.9); chair2.rotation.set(0, 0.6, Math.PI / 2); coinScene.add(chair2);
    const coinFace = canvasTex(64, 64, (x) => { x.fillStyle = '#b8862e'; x.beginPath(); x.arc(32, 32, 31, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#6a4a12'; x.lineWidth = 3; x.beginPath(); x.arc(32, 32, 24, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.moveTo(32, 14); x.lineTo(32, 50); x.moveTo(18, 32); x.lineTo(46, 32); x.stroke(); x.beginPath(); x.arc(32, 32, 8, 0, Math.PI * 2); x.stroke(); });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 32), [new THREE.MeshLambertMaterial({ color: '#8a6a22', emissive: '#2a1a04' }), new THREE.MeshLambertMaterial({ map: coinFace, emissive: '#1a1004' }), new THREE.MeshLambertMaterial({ map: coinFace, emissive: '#1a1004' })]);
    coinScene.add(coin);
    const cc: Shot = { a: 55, b: 58, scene: coinScene, cam: c3, update: (t, k) => {
      const lt = t - 55;
      const decay = Math.max(0, 1 - lt / 2.6);
      coin.position.set(0, 0.16 * decay + 0.014, 0.5);
      coin.rotation.set(Math.PI / 2 * decay + (1 - decay) * 0, lt * 14 * decay, Math.sin(lt * 30) * 0.15 * decay);
      dolly(c3, k, V(0.8, 0.9, 2.0), V(0.3, 0.55, 1.2), V(0, 0.1, 0.5), V(0, 0.05, 0.5));
    } };
    return [a, b, cc];
  }

  // ── 58–68  the detective ──
  private detective(): Shot[] {
    const s = stage('#05070c', 0.35, [10, 34]), c = cam(38);
    s.add(box(40, 0.1, 10, '#0e1218', 0, -0.1, 0));
    for (let i = 0; i < 14; i++) {
      const h = 5 + rnd(i) * 8, side = i % 2 ? 1 : -1;
      s.add(box(3.4, h, 3, ['#141a26', '#1a1426', '#121822'][i % 3], side * 4.6, 0, -20 + i * 2.8));
      if (rnd(i + 4) > 0.4) s.add(box(0.1, 0.5, 1.4, i % 3 ? '#ff3a9a' : '#3ad8ff', side * 2.85, 2.5 + rnd(i) * 2, -20 + i * 2.8, i % 3 ? '#a01060' : '#108090'));
    }
    for (let i = 0; i < 6; i++) { const lp = makeProp('lamppost'); lp.position.set(i % 2 ? 2.6 : -2.6, 0, -18 + i * 5); s.add(lp); }
    const ced = cedric('coat'); s.add(ced.root);
    const rainN = 450;
    const rim = new THREE.PointLight('#3ad8ff', 30, 12, 1.2); s.add(rim);
    const keyL = new THREE.PointLight('#ffd0a0', 22, 8, 1.3); s.add(keyL);
    const rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.01, 0.4, 0.01), new THREE.MeshBasicMaterial({ color: '#8fb0d0', transparent: true, opacity: 0.28 }), rainN);
    s.add(rain);
    const m4 = new THREE.Matrix4();
    const a: Shot = { a: 58, b: 63, scene: s, cam: c, update: (t, k) => {
      const lt = t - 58;
      ced.root.position.set(0, 0, -10 + lt * 1.3); ced.root.rotation.y = 0;
      animateLimbs(ced, lt * 7.5, 1);
      ced.body.position.y = Math.abs(Math.sin(lt * 7.5)) * 0.03;
      for (let i = 0; i < rainN; i++) {
        const fall = (rnd(i) * 9 - lt * 14) % 9; const y = fall < 0 ? fall + 9 : fall;
        m4.makeTranslation(-4 + rnd(i + 1) * 8, y, ced.root.position.z - 6 + rnd(i + 2) * 12); rain.setMatrixAt(i, m4);
      }
      rain.instanceMatrix.needsUpdate = true;
      const z = ced.root.position.z;
      rim.position.set(-1.5, 3, z - 2.5); keyL.position.set(1.2, 2.2, z + 2);
      c.position.set(0.6, 1.6, z + 3.4 - k * 0.6); c.lookAt(0, 1.3 + k * 0.2, z);
    } };
    // evidence wall
    const s2 = stage('#06070a', 0.35, [6, 20]), c2 = cam(36);
    s2.add(box(14, 0.1, 10, '#141210', 0, -0.1, 0));
    const board = canvasTex(1024, 512, (x) => {
      x.fillStyle = '#3a2e22'; x.fillRect(0, 0, 1024, 512);
      const pins: [number, number][] = [];
      const card = (cx: number, cy: number, w: number, h: number, txt: string, col = '#e8e2d0') => {
        x.save(); x.translate(cx, cy); x.rotate((rnd(cx) - 0.5) * 0.12); x.fillStyle = col; x.fillRect(-w / 2, -h / 2, w, h);
        x.fillStyle = '#2a2a2a'; x.font = 'bold 15px monospace'; txt.split('\n').forEach((ln, i) => x.fillText(ln, -w / 2 + 8, -h / 2 + 22 + i * 18)); x.restore(); pins.push([cx, cy - h / 2 + 6]);
      };
      card(150, 110, 200, 120, 'OFFICIAL\'S DEATH\nINQUIRY — SEALED');
      card(170, 330, 180, 130, 'FARSIGHT RESIDENCE\nNIGHT OF —\nNO WITNESSES');
      card(860, 120, 210, 110, 'SHIPPING LEDGERS\n"C." TRANSFERS');
      card(870, 360, 210, 120, 'NAME HEARD TWICE:\nTHE COIN');
      card(520, 440, 230, 90, 'RYZEN-5?\nCONTACT: E. VENN', '#d8e8f0');
      for (let i = 0; i < 8; i++) { x.fillStyle = '#c8c0b0'; x.fillRect(300 + rnd(i) * 420, 40 + rnd(i + 3) * 120, 70, 50); pins.push([335 + rnd(i) * 420, 45 + rnd(i + 3) * 120]); }
      x.strokeStyle = '#c02020'; x.lineWidth = 3;
      for (const p of pins) { x.beginPath(); x.moveTo(512, 250); x.lineTo(p[0], p[1]); x.stroke(); }
      x.fillStyle = '#b8862e'; x.beginPath(); x.arc(512, 250, 46, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#6a4a12'; x.lineWidth = 5; x.beginPath(); x.arc(512, 250, 34, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.moveTo(512, 222); x.lineTo(512, 278); x.moveTo(484, 250); x.lineTo(540, 250); x.stroke();
      x.strokeStyle = '#ff3030'; x.lineWidth = 4; x.beginPath(); x.ellipse(512, 250, 70, 62, 0, 0, Math.PI * 2); x.stroke();
      for (const p of pins) { x.fillStyle = '#d03030'; x.beginPath(); x.arc(p[0], p[1], 5, 0, Math.PI * 2); x.fill(); }
    });
    const wall = plane(6, 3, board, false); wall.position.set(0, 2.0, -2); s2.add(wall);
    const desk = makeProp('desk'); desk.position.set(1.4, 0, 0.2); s2.add(desk);
    const lamp = new THREE.SpotLight('#ffd9a0', 30, 9, 0.6, 0.6, 1.3); lamp.position.set(0, 4.5, 1.5); lamp.target.position.set(0, 2, -2); s2.add(lamp, lamp.target);
    const ced2 = cedric('coat'); ced2.root.position.set(-0.8, 0, 0.6); ced2.root.rotation.y = Math.PI; s2.add(ced2.root);
    const b: Shot = { a: 63, b: 68, scene: s2, cam: c2, update: (t, k) => {
      dolly(c2, k, V(-2.6, 1.9, 4.6), V(0.0, 2.05, 0.4), V(0, 1.9, -2), V(0, 2.0, -2));
    } };
    this.evidence = { scene: s2 };
    return [a, b, this.transitionShot()];
  }

  // ── 68–71  match-cut: the lead on the evidence wall becomes the planet ──
  private transitionShot(): Shot {
    const ev = this.evidence!;
    const c = cam(36);
    return { a: 68, b: 71, scene: ev.scene, cam: c, hardCut: true, update: (t, k) => {
      // push from the coin to the RYZEN-5 card (board-space 0.05, 0.92) until it fills the frame
      dolly(c, k, V(0.0, 2.05, 0.4), V(-0.3, 1.0, -1.42), V(0, 2.0, -2), V(-0.3, 1.0, -2));
    } };
  }

  // ── transport ship used for the approach, the landing and planet travel ──
  private transport() {
    const g = new THREE.Group();
    const hullM = new THREE.MeshLambertMaterial({ color: '#7a8496' });
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), hullM); hull.scale.set(1.3, 0.7, 3.2); g.add(hull);
    g.add(box(4.6, 0.12, 1.2, '#5a6478', 0, -0.05, 0.6), box(0.12, 1.1, 1.0, '#5a6478', 0, 0.4, 2.4));
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), new THREE.MeshLambertMaterial({ color: '#6fd3e0', emissive: '#1a5a66' })); cockpit.scale.set(1, 0.6, 1.4); cockpit.position.set(0, 0.35, -2.2); g.add(cockpit);
    const glowM = new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.9 });
    const engines = [-0.8, 0.8].map((x) => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.5, 12), glowM); e.rotation.x = Math.PI / 2; e.position.set(x, -0.1, 3.2); g.add(e); return e; });
    const nav = [box(0.18, 0.18, 0.18, '#ff4040', -2.3, -0.1, 0.6, '#ff2020'), box(0.18, 0.18, 0.18, '#40ff80', 2.3, -0.1, 0.6, '#20ff60')]; g.add(...nav);
    const ramp = new THREE.Group(); ramp.position.set(0, -0.55, -0.2); ramp.add(box(1.1, 0.08, 1.8, '#4a5262', 0, 0, 0.9)); g.add(ramp);
    const thrust = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.35, depthWrite: false })); thrust.rotation.x = Math.PI; thrust.position.set(0, -1.6, 0); g.add(thrust);
    const heat = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: '#ff9a40', transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide })); heat.scale.set(2.2, 1.6, 4.4); g.add(heat);
    return { g, ramp, thrust, heat, nav, engines };
  }

  /** Night skyline of Zixel around a landing pad at the origin. */
  private zixelCity() {
    const z = stage('#070b18', 0.4, [70, 240]);
    z.add(box(260, 0.1, 260, '#0c1018', 0, -0.1, 0));
    const winTex = canvasTex(32, 64, (x) => { x.fillStyle = '#10141e'; x.fillRect(0, 0, 32, 64); for (let i = 0; i < 40; i++) if (rnd(i) > 0.5) { x.fillStyle = rnd(i + 1) > 0.7 ? '#6fd3e0' : '#f0c060'; x.fillRect((i % 4) * 8 + 2, Math.floor(i / 4) * 6 + 2, 4, 3); } });
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.magFilter = THREE.NearestFilter;
    for (let i = 0; i < 170; i++) {
      const h = 6 + rnd(i) ** 2 * 46, w = 3 + rnd(i + 7) * 5;
      const ang = rnd(i + 3) * Math.PI * 2, r = 24 + rnd(i + 5) * 80;
      const geo = new THREE.BoxGeometry(w, h, w);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute; for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * w / 1.2, uv.getY(j) * h / 2.4);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: winTex, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.75 }));
      m.position.set(Math.cos(ang) * r, h / 2, Math.sin(ang) * r - 20); z.add(m);
    }
    // landing pad
    z.add(box(12, 0.5, 12, '#2a3038', 0, 0, 0));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; z.add(box(0.5, 0.12, 0.5, '#6fd3e0', Math.cos(a) * 5.2, 0.5, Math.sin(a) * 5.2, '#2a8a99')); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.7, 40), new THREE.MeshBasicMaterial({ color: '#f0b44a', side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.52; z.add(ring);
    const padL = new THREE.PointLight('#cfe6ff', 40, 18, 1.2); padL.position.set(0, 6, 6); z.add(padL);
    return z;
  }

  // ── 71–75.5 space approach & atmospheric entry · 75.5–80.25 landing ──
  private arrival(): Shot[] {
    const s = stage('#000004', 0.25), c = cam(40);
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 2400 }, (_, i) => (rnd(i) - 0.5) * 300), 3)), new THREE.PointsMaterial({ color: '#ffffff', size: 0.3 }));
    s.add(stars);
    const tc = document.createElement('canvas'); tc.width = 2048; tc.height = 1024;
    const tx = tc.getContext('2d')!; tx.fillStyle = '#16384a'; tx.fillRect(0, 0, 2048, 1024);
    const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace;
    const img = new Image(); img.onload = () => { tx.drawImage(img, 307, 0, 1536, 1024); tex.needsUpdate = true; }; img.src = `${import.meta.env.BASE_URL}world/ryzen5_terrain.jpg`;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(10, 128, 64), new THREE.MeshLambertMaterial({ map: tex })); s.add(planet);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(10.5, 64, 32), new THREE.MeshBasicMaterial({ color: '#6fd3e0', transparent: true, opacity: 0.14, side: THREE.BackSide })); s.add(atmo);
    const sun = new THREE.DirectionalLight('#fff4e0', 3.2); sun.position.set(-20, 12, 40); s.add(sun);
    const ship = this.transport(); ship.g.scale.setScalar(0.12); s.add(ship.g);
    const space: Shot = { a: 71, b: 75.5, scene: s, cam: c, hardCut: true, update: (t, k) => {
      const lt = t - 71;
      planet.rotation.set(0.12, -Math.PI / 2 - 0.25 + lt * 0.03, 0);
      const e = ss(k);
      ship.g.position.set(lerp(1.4, 0.2, e), lerp(1.2, 1.6, e), lerp(34, 11.4, e));
      ship.g.rotation.set(0.05, Math.PI, 0);
      const heat = ss((lt - 3.2) / 1.1); (ship.heat.material as THREE.MeshBasicMaterial).opacity = heat * 0.75; ship.thrust.visible = false;
      ship.engines.forEach((en) => en.scale.setScalar(1 + Math.sin(t * 40) * 0.1));
      // camera rides just behind and above the ship, planet growing ahead
      const back = lerp(2.6, 1.2, e);
      c.position.set(ship.g.position.x - 0.5, ship.g.position.y + 0.35, ship.g.position.z + back);
      c.lookAt(lerp(0, 0.1, e), lerp(0.6, 1.4, e), 0);
    } };
    // landing in Zixel
    const z = this.zixelCity(), c2 = cam(42);
    const lander = this.transport(); z.add(lander.g);
    const ced = cedric('coat'); z.add(ced.root);
    const landing: Shot = { a: 75.5, b: 80.25, scene: z, cam: c2, hardCut: true, update: (t) => {
      const lt = t - 75.5;
      const d = ss(lt / 3.1);
      lander.g.position.set(lerp(-14, 0, d), lerp(34, 1.25, d), lerp(-30, 0, d)); lander.g.rotation.set(0, lerp(0.8, 0.0, d) + Math.PI, 0);
      (lander.heat.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - lt * 0.6);
      lander.thrust.visible = lt < 3.3; lander.thrust.scale.y = 1 + Math.sin(t * 50) * 0.15;
      lander.nav.forEach((n, i) => (n.visible = Math.floor(t * 2 + i) % 2 === 0));
      lander.ramp.rotation.x = -ss((lt - 3.2) / 0.5) * 0.55;
      // Cedric steps off the ramp toward camera
      const w = ss((lt - 3.5) / 1.25);
      ced.root.visible = lt > 3.45;
      ced.root.position.set(0, lerp(0.95, 0.5, w), lerp(0.6, 3.6, w)); ced.root.rotation.y = 0;
      animateLimbs(ced, lt * 7, w > 0 && w < 1 ? 1 : 0);
      if (lt < 3.0) { c2.position.set(lerp(-22, -9, ss(lt / 3)), lerp(10, 5, ss(lt / 3)), lerp(30, 16, ss(lt / 3))); c2.lookAt(lander.g.position); }
      else { const e = ss((lt - 3.0) / 1.75); c2.position.set(lerp(-9, 0.8, e), lerp(5, 2.15, e), lerp(16, 6.6, e)); c2.lookAt(lerp(0, 0, e), lerp(1.25, 1.95, e), lerp(0, 3.4, e)); }
    } };
    // title: Cedric at the pad edge, the city ahead
    const c3 = cam(40);
    const ced2 = cedric('coat'); z.add(ced2.root);
    const title: Shot = { a: 88.5, b: LENGTH + 0.6, scene: z, cam: c3, update: (t, k) => {
      ced.root.visible = false; ced2.root.visible = true;
      lander.g.position.set(0, 1.25, 0); lander.ramp.rotation.x = -0.55; lander.thrust.visible = false;
      ced2.root.position.set(2.0, 0.5, 4.4); ced2.root.rotation.y = Math.PI;
      dolly(c3, k, V(2.4, 2.4, 9.0), V(2.0, 4.2, 6.5), V(0.2, 3.0, -12), V(0, 14, -70));
    } };
    landing.update = ((orig) => (t: number, k: number) => { ced2.root.visible = false; orig(t, k); })(landing.update);
    return [space, landing, title];
  }

  // ── 80.25–88.5  what you'll do: six hard cuts ──
  private montage(): Shot[] {
    const T0 = 80.25, D = 1.375;
    const shots: Shot[] = [];
    const facility = () => {
      const s = stage('#060a10', 0.55, [14, 40]);
      s.add(box(30, 0.1, 30, '#2a3038', 0, -0.1, 0));
      for (let i = -3; i <= 3; i++) s.add(box(0.3, 2.8, 0.3, '#3a404a', i * 3, 0, -4), box(2.7, 0.2, 0.3, '#3a404a', i * 3 + 1.5, 2.6, -4));
      s.add(box(30, 2.8, 0.3, '#262c34', 0, 0, -4.4));
      for (const [x, z] of [[-4, -1], [3.5, 1.5], [-1.5, 2.5], [5, -2]]) s.add(makeProp('crate').translateX(x).translateZ(z));
      const l = new THREE.PointLight('#cfe6ff', 45, 14, 1.2); l.position.set(0, 3.2, 1); s.add(l);
      return s;
    };
    const cone = (range: number, angle: number, color = '#ffd24a') => {
      const n = 20, pos: number[] = [0, 0.05, 0];
      for (let i = 0; i <= n; i++) { const a = -angle / 2 + (angle * i) / n; pos.push(Math.sin(a) * range, 0.05, Math.cos(a) * range); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const idx: number[] = []; for (let i = 0; i < n; i++) idx.push(0, i + 1, i + 2); g.setIndex(idx);
      return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    };
    const at = (i: number) => T0 + i * D;
    // 1 — sneak past a guard's vision cone
    {
      const s = facility(), c = cam(32);
      const guard = person(OP); s.add(guard.root);
      guard.root.add(cone(5, 1.2));
      const ced = cedric('coat'); s.add(ced.root);
      shots.push({ a: at(0), b: at(1), scene: s, cam: c, hardCut: true, update: (t) => {
        const lt = t - at(0);
        guard.root.rotation.y = 0.6 + Math.sin(lt * 1.4) * 0.4;
        ced.root.position.set(-2.4 + lt * 1.7, 0, -1.6); ced.root.rotation.y = Math.PI / 2;
        ced.body.position.y = -0.25; ced.body.rotation.x = 0.25; animateLimbs(ced, lt * 6, 0.7);
        c.position.set(5.5, 5.5, 6); c.lookAt(-0.8 + lt * 0.4, 0.6, -0.8);
      } });
    }
    // 2 — the Mimic Device
    {
      const s = facility(), c = cam(30);
      const ced = cedric('coat'); s.add(ced.root);
      const op = person(OP); s.add(op.root);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 48), new THREE.MeshBasicMaterial({ color: '#6fd3e0' })); ring.rotation.x = Math.PI / 2; s.add(ring);
      shots.push({ a: at(1), b: at(2), scene: s, cam: c, hardCut: true, update: (t) => {
        const lt = t - at(1);
        const flick = lt > 0.45 && lt < 0.8 ? Math.floor(lt * 30) % 2 === 0 : lt >= 0.8;
        ced.root.visible = !flick; op.root.visible = flick;
        ring.position.y = 0.1 + (lt * 2.2) % 1.9; ring.scale.setScalar(0.55); ring.visible = lt > 0.2 && lt < 1.1;
        c.position.set(0.4, 1.6, 4.2 - lt * 0.4); c.lookAt(0, 1.45, 0);
      } });
    }
    // 3 — shooting: return fire, dodge roll
    {
      const s = facility(), c = cam(36);
      const ced = cedric('coat'); s.add(ced.root);
      const gun = box(0.06, 0.1, 0.3, '#22252a'); s.add(gun);
      const ops = [person(OP), person(OP)]; ops[0].root.position.set(3.5, 0, -1.4); ops[1].root.position.set(4.2, 0, 0.8);
      ops.forEach((o) => { o.root.rotation.y = -Math.PI / 2; o.armR.rotation.x = -1.5; s.add(o.root); });
      const flashes = ops.map(() => { const f = box(0.25, 0.25, 0.25, '#fff2a0', 0, 0, 0, '#ffd040'); s.add(f); return f; });
      const myFlash = box(0.3, 0.3, 0.3, '#bff8ff', 0, 0, 0, '#6fd3e0'); s.add(myFlash);
      const tracers = Array.from({ length: 6 }, () => { const b = box(0.6, 0.04, 0.04, '#ffb060', 0, 0, 0, '#ff8030'); s.add(b); return b; });
      const mine = Array.from({ length: 3 }, () => { const b = box(0.6, 0.05, 0.05, '#9ff4ff', 0, 0, 0, '#3fd0e0'); s.add(b); return b; });
      shots.push({ a: at(2), b: at(3), scene: s, cam: c, hardCut: true, update: (t) => {
        const lt = t - at(2);
        const roll = ss((lt - 0.2) / 0.45);
        const rolling = roll > 0 && roll < 1;
        ced.root.position.set(-0.6 + roll * 0.2, 0, -0.2 + roll * 1.5); ced.root.rotation.y = Math.PI / 2 - 0.25;
        ced.body.rotation.x = rolling ? roll * Math.PI * 2 : 0; ced.body.position.y = rolling ? -0.4 * Math.sin(roll * Math.PI) : 0;
        ced.armR.rotation.x = rolling ? 0 : -1.45;
        const hand = ced.root.position.clone().add(V(0.55, 1.32, 0.05));
        gun.position.copy(hand); gun.rotation.y = Math.PI / 2 - 0.25; gun.visible = !rolling;
        const firing = lt > 0.75;
        myFlash.position.copy(hand).add(V(0.3, 0, 0)); myFlash.visible = firing && Math.floor(lt * 14) % 3 === 0;
        mine.forEach((m, i) => { const p = ((lt - 0.75) * 4 + i / 3) % 1; m.visible = firing; m.position.set(lerp(hand.x + 0.3, 3.6, p), 1.32, lerp(hand.z, -1.4 + i * 0.1, p)); });
        const hitK = ss((lt - 1.05) / 0.3); ops[0].root.rotation.z = hitK * 1.3; ops[0].root.position.y = hitK * 0.1;
        flashes.forEach((f, i) => { const o = ops[i].root.position; f.position.set(o.x - 0.6, 1.35, o.z); f.visible = lt < 0.9 && Math.floor(lt * 12 + i * 3) % 4 === 0; });
        tracers.forEach((tr, i) => { const p = ((lt * 3 + i / 6) % 1); const o = ops[i % 2].root.position; tr.visible = lt < 0.9; tr.position.set(lerp(o.x - 0.6, -2.5, p), 1.35, lerp(o.z, -0.2 + (i - 3) * 0.3, p)); });
        c.position.set(-2.8, 1.4, 3.6); c.lookAt(0.6, 1.0, 0);
      } });
    }
    // 4 — scalpel assassination from behind
    {
      const s = facility(), c = cam(34);
      const guard = person(OP); guard.root.rotation.y = Math.PI; s.add(guard.root);
      const ced = cedric('coat'); ced.root.position.set(0, 0, 0.95); ced.root.rotation.y = Math.PI; s.add(ced.root);
      const blade = box(0.02, 0.02, 0.24, '#e8f6ff', 0, 0, 0, '#9fd8ff'); s.add(blade);
      shots.push({ a: at(3), b: at(4), scene: s, cam: c, hardCut: true, update: (t) => {
        const lt = t - at(3);
        const strike = ss((lt - 0.25) / 0.22);
        ced.armR.rotation.x = -0.4 - strike * 1.4;
        blade.position.set(-0.2, 1.1 + strike * 0.3, 0.6 - strike * 0.3); blade.visible = lt < 0.8;
        const fallK = ss((lt - 0.6) / 0.55);
        guard.root.rotation.x = -fallK * 1.45; guard.root.position.y = fallK * 0.15;
        c.position.set(1.6, 1.65, 2.4); c.lookAt(0, 1.25, 0.45);
      } });
    }
    // 5 — a conversation with a stranger (dialogue UI overlay)
    {
      const s = stage('#0a0a14', 0.55, [12, 40]), c = cam(34);
      s.add(box(30, 0.1, 30, '#1a1c24', 0, -0.1, 0));
      for (let i = 0; i < 3; i++) { const st = new THREE.Group(); st.add(box(1.8, 0.9, 0.8, '#5a3f2a'), box(2.1, 0.08, 1.1, ['#c04a5a', '#3f8a8a', '#c9a34a'][i], 0, 2.0, 0), box(0.06, 2.0, 0.06, '#2a2d33', -0.95, 0, 0.45), box(0.06, 2.0, 0.06, '#2a2d33', 0.95, 0, 0.45)); st.position.set(-3 + i * 3, 0, -2.6); s.add(st); }
      const lp = makeProp('lamppost'); lp.position.set(2.2, 0, 0.8); s.add(lp);
      const ced = cedric('coat'); ced.root.position.set(-0.6, 0, 0.5); ced.root.rotation.y = Math.PI / 2 + 0.25; s.add(ced.root);
      const stranger = person({ skin: '#8fb88a', coat: '#5a3f2a', hair: '#2a2a2a', height: 0.96 }); stranger.root.position.set(0.7, 0, 0.2); stranger.root.rotation.y = -Math.PI / 2 - 0.25; s.add(stranger.root);
      const warm = new THREE.PointLight('#ffb070', 20, 8, 1.3); warm.position.set(0, 2.6, 1.5); s.add(warm);
      shots.push({ a: at(4), b: at(5), scene: s, cam: c, hardCut: true, update: (t) => {
        const lt = t - at(4);
        stranger.armR.rotation.x = -0.6 - Math.sin(lt * 6) * 0.25; stranger.head.rotation.y = Math.sin(lt * 3) * 0.15;
        c.position.set(-2.4 + lt * 0.3, 2.0, 3.3); c.lookAt(0.3, 1.35, 0.2);
      } });
    }
    // 6 — traveling the planet (the real overworld terrain)
    {
      const w = this.world;
      if (w && w.ready) {
        const c = cam(40);
        const ship = this.transport(); ship.g.scale.setScalar(1.6); ship.g.visible = false; w.scene.add(ship.g);
        this.travelShip = ship.g;
        const path = greatCirclePx(NODE.get('zixel')!.px, NODE.get('kitsah')!.px, 40);
        const P = (u: number) => { const f = u * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f)), r = f - i; return [lerp(path[i][0], path[i + 1][0], r), lerp(path[i][1], path[i + 1][1], r)] as [number, number]; };
        shots.push({ a: at(5), b: at(6), scene: w.scene, cam: c, hardCut: true, update: (t) => {
          const lt = t - at(5); const u = 0.15 + lt * 0.18;
          const p = P(u), q = P(u + 0.02);
          ship.g.visible = true; w.setTokenVisible(false);
          const y = Math.max(0, w.heightAt(p)) + 16;
          ship.g.position.set(p[0] - ATLAS_W / 2, y, p[1] - ATLAS_H / 2);
          ship.g.lookAt(q[0] - ATLAS_W / 2, y, q[1] - ATLAS_H / 2); ship.g.rotateY(Math.PI);
          c.position.set(ship.g.position.x - 26, y + 22, ship.g.position.z + 38); c.lookAt(ship.g.position.x + 8, y - 6, ship.g.position.z - 10);
        } });
      } else shots.push({ ...this.arrival()[0], a: at(5), b: at(6), hardCut: true });
    }
    return shots;
  }

  // ── playback ──
  /** Pick the active shot for time t, advance it, and update the caption/letterbox overlay. */
  renderAt(t: number) {
    if (!this.built) this.build();
    const shot = this.shots.find((s) => t >= s.a && t < s.b) ?? this.shots[this.shots.length - 1];
    const k = Math.max(0, Math.min(1, (t - shot.a) / (shot.b - shot.a)));
    shot.cam.aspect = window.innerWidth / window.innerHeight; shot.cam.updateProjectionMatrix();
    shot.update(t, k);
    this.current = { scene: shot.scene, cam: shot.cam, scan: shot.scan ? shot.scan(t) : 0 };
    this.overlay(t, shot);
    return this.current;
  }

  private overlay(t: number, shot: Shot) {
    const el = this.el();
    const fade = el.querySelector('.ifade') as HTMLElement;
    let black = 0;
    if (!shot.hardCut) black = Math.max(1 - (t - shot.a) / 0.35, 1 - (shot.b - t) / 0.35, 0);
    if (t < 0.6) black = Math.max(black, 1 - t / 0.6);
    if (t > LENGTH - 0.6) black = Math.max(black, (t - (LENGTH - 0.6)) / 0.6);
    fade.style.opacity = String(Math.min(1, Math.max(0, black)));
    const flash = el.querySelector('.iflash') as HTMLElement;
    const bloom = (c: number, w: number) => Math.max(0, 1 - Math.abs(t - c) / w);
    const cyan = bloom(71, 0.7), heat = bloom(75.5, 0.55);
    if (cyan > 0) { flash.style.background = '#bff6ff'; flash.style.opacity = String(cyan); }
    else if (heat > 0) { flash.style.background = '#ffb070'; flash.style.opacity = String(heat * 0.95); }
    else { flash.style.background = '#ffffff'; flash.style.opacity = shot.hardCut && t >= 80.2 && t - shot.a < 0.08 ? '0.7' : '0'; }
    const dodge = el.querySelector('.idodge') as HTMLElement;
    const dl = t - (80.25 + 2 * 1.375);
    dodge.style.opacity = dl > 0.1 && dl < 0.6 ? '1' : '0';
    const dlg = el.querySelector('.idlg') as HTMLElement;
    const cv = t - (80.25 + 4 * 1.375);
    dlg.style.opacity = cv > 0.15 && cv < 1.3 ? '1' : '0';
    for (const kind of ['narr', 'tag', 'place', 'title'] as const) {
      const c = CAPTIONS.find((x) => x.kind === kind && t >= x.a && t < x.b);
      const node = el.querySelector(`.i${kind}`) as HTMLElement;
      if (!c) { node.style.opacity = '0'; continue; }
      const o = Math.min(1, (t - c.a) / 0.35, (c.b - t) / 0.35);
      node.style.opacity = String(Math.max(0, o));
      const html = kind === 'title' ? `DETECTIVE NOWHERE<small>THE COIN CONSPIRACY</small>` : c.text;
      if (node.innerHTML !== html) node.innerHTML = html;
    }
  }

  /** Live playback, synced to the audio clock. */
  async start(onDone: () => void) {
    this.build();
    this.onDone = onDone;
    this.playing = true;
    const el = this.el();
    el.classList.remove('hidden');
    try {
      this.audio = new AudioContext();
      await this.audio.resume();
      scheduleScore(this.audio, this.audio.destination, this.audio.currentTime + 0.05);
      this.clockStart = this.audio.currentTime + 0.05;
    } catch { this.audio = null; }
    this.startedAt = performance.now();
  }

  /** Frame-exact scrubbing for the MP4 export: when set, playback time is fixed. */
  fixedTime: number | null = null;
  time(): number {
    if (this.fixedTime !== null) return this.fixedTime;
    if (this.audio && this.audio.state === 'running') return this.audio.currentTime - this.clockStart;
    return (performance.now() - this.startedAt) / 1000;
  }

  update() {
    if (!this.playing) return null;
    const t = this.time();
    if (t >= LENGTH && this.fixedTime === null) { this.finish(); return null; }
    return this.renderAt(Math.max(0, t));
  }

  finish() {
    if (!this.playing) return;
    this.playing = false;
    this.el().classList.add('hidden');
    if (this.audio) { const a = this.audio; this.audio = null; a.close().catch(() => {}); }
    if (this.travelShip) this.travelShip.visible = false;
    this.world?.setTokenVisible(true);
    const cb = this.onDone; this.onDone = null; cb?.();
  }
}
