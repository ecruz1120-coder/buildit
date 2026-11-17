import * as THREE from 'three';
import { screenTex, woodTex } from './textures';

/** Modular low-poly props (Bible §13: modular geometry, practical lighting). */
const matCache = new Map<string, THREE.Material>();
export function mat(color: string, emissive?: string): THREE.Material {
  const key = color + (emissive ?? '');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive: emissive ?? '#000000' });
    matCache.set(key, m);
  }
  return m;
}

export function box(w: number, h: number, d: number, color: string | THREE.Material, x = 0, y = 0, z = 0, emissive?: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color, emissive) : color);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(r: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
}

export type PropKind =
  | 'bed' | 'desk' | 'chair' | 'terminal' | 'wardrobe' | 'couch' | 'table' | 'plant' | 'crate' | 'boxes'
  | 'bench' | 'lamppost' | 'counter' | 'shelf' | 'rug' | 'mailboxes' | 'noticeboard' | 'fireescape'
  | 'tree' | 'locker' | 'fridge' | 'stairs' | 'kitchen' | 'tv' | 'cctv' | 'drum' | 'sign';

export function makeProp(kind: PropKind, opts: { color?: string; w?: number; d?: number } = {}): THREE.Group {
  switch (kind) {
    case 'bed': {
      const frame = box(1.1, 0.32, 2.0, '#3a3f4a');
      const mattress = box(1.0, 0.16, 1.9, '#d9d2c4', 0, 0.32, 0);
      const blanket = box(1.04, 0.1, 1.25, opts.color ?? '#a04a68', 0, 0.44, 0.3);
      const pillow = box(0.7, 0.12, 0.35, '#efe8da', 0, 0.48, -0.7);
      const head = box(1.1, 0.7, 0.08, '#c27a3e', 0, 0, -1.0);
      return group(frame, mattress, blanket, pillow, head);
    }
    case 'desk': {
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.75), new THREE.MeshLambertMaterial({ map: woodTex() }));
      top.position.y = 0.76; top.castShadow = top.receiveShadow = true;
      const legs = [[-0.68, -0.32], [0.68, -0.32], [-0.68, 0.32], [0.68, 0.32]].map(([x, z]) => box(0.06, 0.76, 0.06, '#2a2d33', x, 0, z));
      const drawer = box(0.5, 0.3, 0.7, '#5e4130', 0.45, 0.42, 0);
      return group(top, drawer, ...legs);
    }
    case 'chair': return group(box(0.45, 0.06, 0.45, '#5a5a6e', 0, 0.45, 0), box(0.45, 0.5, 0.06, '#5a5a6e', 0, 0.5, 0.2), ...[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([x, z]) => box(0.05, 0.45, 0.05, '#2a2d33', x, 0, z)));
    case 'terminal': {
      const stand = box(0.1, 0.2, 0.1, '#1d2026', 0, 0.82, -0.05);
      const mon = box(0.7, 0.45, 0.06, '#15181d', 0, 1.0, -0.08);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.38), new THREE.MeshBasicMaterial({ map: screenTex(4) }));
      scr.position.set(0, 1.225, -0.045);
      const kb = box(0.5, 0.03, 0.16, '#2a2d33', 0, 0.79, 0.18);
      const lampBase = box(0.16, 0.04, 0.16, '#2a2d33', -0.55, 0.79, -0.1);
      const lampShade = cyl(0.12, 0.12, '#e08a5a', -0.55, 1.1, -0.1);
      const lampArm = box(0.03, 0.28, 0.03, '#2a2d33', -0.55, 0.83, -0.1);
      return group(stand, mon, scr, kb, lampBase, lampArm, lampShade);
    }
    case 'wardrobe': return group(box(1.0, 2.0, 0.6, '#3b4250'), box(0.02, 1.9, 0.02, '#c9a34a', 0, 0.05, 0.31), box(0.06, 0.2, 0.03, '#c9a34a', 0.08, 1.0, 0.31), box(0.06, 0.2, 0.03, '#c9a34a', -0.08, 1.0, 0.31));
    case 'locker': return group(box(0.8, 2.0, 0.55, '#4a5a66'), ...[0.4, 0.9, 1.4].map((y) => box(0.5, 0.03, 0.02, '#2c363e', 0, y, 0.28)));
    case 'couch': return group(box(1.8, 0.4, 0.8, opts.color ?? '#5a3f5e'), box(1.8, 0.45, 0.2, opts.color ?? '#5a3f5e', 0, 0.4, -0.3), box(0.2, 0.25, 0.8, '#4a3350', -0.8, 0.4, 0), box(0.2, 0.25, 0.8, '#4a3350', 0.8, 0.4, 0));
    case 'table': return group(box(0.9, 0.05, 0.9, '#7a5a42', 0, 0.7, 0), box(0.1, 0.7, 0.1, '#2a2d33'));
    case 'plant': return group(cyl(0.18, 0.35, '#8a5a3e'), new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), mat('#3f8a5e')).translateY(0.65));
    case 'crate': return group(box(0.9, 0.9, 0.9, '#7a6240'), box(0.92, 0.08, 0.92, '#5a4730', 0, 0.42, 0));
    case 'boxes': return group(box(0.6, 0.5, 0.6, '#b09068', 0, 0, 0), box(0.5, 0.4, 0.5, '#a0805a', 0.1, 0.5, 0.05), box(0.5, 0.45, 0.5, '#b09068', 0.65, 0, 0.1));
    case 'bench': return group(box(1.6, 0.08, 0.45, '#6b4a36', 0, 0.42, 0), box(1.6, 0.4, 0.06, '#6b4a36', 0, 0.5, -0.2), box(0.08, 0.42, 0.4, '#2a2d33', -0.7, 0, 0), box(0.08, 0.42, 0.4, '#2a2d33', 0.7, 0, 0));
    case 'lamppost': {
      const g = group(cyl(0.06, 3.0, '#2a2d33'), box(0.4, 0.12, 0.25, '#2a2d33', 0.12, 3.0, 0));
      const bulb = box(0.3, 0.05, 0.18, '#fff3c4', 0.12, 2.96, 0, '#ffe7a0');
      g.add(bulb);
      const l = new THREE.PointLight('#ffd9a0', 6, 7, 1.6);
      l.position.set(0.12, 2.8, 0);
      g.add(l);
      return g;
    }
    case 'counter': return group(box(opts.w ?? 3, 1.05, 0.7, '#3d4a5e'), box((opts.w ?? 3) + 0.1, 0.06, 0.8, '#7cc9d6', 0, 1.05, 0, '#1a4a52'));
    case 'shelf': return group(box(1.2, 1.8, 0.4, '#4a3f36'), ...[0.4, 0.9, 1.4].map((y) => box(1.1, 0.03, 0.38, '#2a2420', 0, y, 0.01)), box(0.3, 0.25, 0.25, '#7a8aa0', -0.3, 0.93, 0), box(0.25, 0.3, 0.25, '#a07a5a', 0.3, 1.43, 0));
    case 'rug': { const m = new THREE.Mesh(new THREE.BoxGeometry(opts.w ?? 1.8, 0.02, opts.d ?? 1.3), mat(opts.color ?? '#7a5470')); m.position.y = 0.011; m.receiveShadow = true; return group(m); }
    case 'mailboxes': return group(box(1.6, 1.2, 0.3, '#5a6270', 0, 0.6, 0), ...Array.from({ length: 8 }, (_, i) => box(0.32, 0.22, 0.02, '#8a93a0', -0.6 + (i % 4) * 0.4, 0.85 + Math.floor(i / 4) * 0.4, 0.16)));
    case 'noticeboard': return group(box(1.4, 0.9, 0.05, '#6b4a36', 0, 1.0, 0), box(0.3, 0.4, 0.02, '#e8e2d0', -0.35, 1.2, 0.03), box(0.35, 0.3, 0.02, '#f0d070', 0.2, 1.3, 0.03), box(0.3, 0.25, 0.02, '#a0d8e0', 0.3, 1.05, 0.03));
    case 'fireescape': {
      const g = group(box(1.4, 0.06, 1.0, '#3a3f4a', 0, 3.1, 0));
      for (let i = 0; i < 10; i++) g.add(box(0.9, 0.04, 0.12, '#4a505c', 0, 0.3 + i * 0.3, -0.4 + i * 0.07));
      g.add(box(0.05, 3.2, 0.05, '#2a2d33', -0.5, 0, 0.45), box(0.05, 3.2, 0.05, '#2a2d33', 0.5, 0, 0.45));
      return g;
    }
    case 'tree': return group(cyl(0.12, 1.4, '#5a3f2e'), new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), mat('#2f6a4e')).translateY(2.0), new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), mat('#3f8060')).translateY(2.6).translateX(0.2));
    case 'fridge': return group(box(0.7, 1.8, 0.65, '#c8ccd2'), box(0.04, 0.5, 0.04, '#5a5f66', 0.25, 1.1, 0.33));
    case 'kitchen': return group(box(opts.w ?? 2, 0.9, 0.6, '#5a6270'), box((opts.w ?? 2) + 0.04, 0.05, 0.64, '#c8c2b4', 0, 0.9, 0));
    case 'tv': return group(box(1.0, 0.5, 0.4, '#3a3f4a'), box(1.1, 0.6, 0.06, '#15181d', 0, 0.5, 0), new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ color: '#2a5a70' })).translateY(0.8).translateZ(0.035));
    case 'cctv': return group(box(0.3, 0.2, 0.15, '#2a2d33', 0, 0, 0), box(0.06, 0.06, 0.02, '#ff4040', 0, 0.07, 0.08, '#ff2020'));
    case 'drum': return group(cyl(0.3, 0.85, '#9a4a2e', 0, 0, 0, 10), cyl(0.31, 0.05, '#7a3a20', 0, 0.4, 0, 10));
    case 'sign': return group(box(0.05, 1.0, 0.05, '#2a2d33'), box(0.6, 0.4, 0.04, '#e0a040', 0, 1.0, 0, '#3a2000'));
    case 'stairs': {
      const g = new THREE.Group();
      for (let i = 0; i < 8; i++) g.add(box(1.0, 0.2 + i * 0.2, 0.36, '#5c6370', 0, 0, -1.3 + i * 0.36));
      return g;
    }
  }
}

/** Animated low-poly humanoid used for every NPC and for Mimic disguises. */
export interface Humanoid {
  root: THREE.Group; body: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group; head: THREE.Group;
}

export interface Look { skin: string; coat: string; hair: string; height?: number; mask?: boolean; }

export function makeHumanoid(look: Look): Humanoid {
  const s = look.height ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.scale.setScalar(s);
  const pivot = (x: number, y: number, z = 0) => { const p = new THREE.Group(); p.position.set(x, y, z); body.add(p); return p; };
  const legL = pivot(-0.12, 0.85), legR = pivot(0.12, 0.85);
  for (const leg of [legL, legR]) {
    leg.add(box(0.17, 0.8, 0.2, '#262a32', 0, -0.82, 0));
    leg.add(box(0.2, 0.14, 0.3, '#15171c', 0, -0.88, 0.04));
  }
  body.add(box(0.5, 0.62, 0.3, look.coat, 0, 0.82, 0));
  body.add(box(0.54, 0.34, 0.32, look.coat, 0, 0.62, 0)); // coat skirt
  body.add(box(0.2, 0.32, 0.02, shade(look.coat, -0.25), 0, 0.98, 0.155));
  const armL = pivot(-0.31, 1.4), armR = pivot(0.31, 1.4);
  for (const arm of [armL, armR]) {
    arm.add(box(0.14, 0.6, 0.16, look.coat, 0, -0.6, 0));
    arm.add(box(0.11, 0.12, 0.12, look.skin, 0, -0.72, 0));
  }
  const head = pivot(0, 1.46);
  head.add(box(0.12, 0.1, 0.12, look.skin, 0, 0, 0));
  head.add(box(0.32, 0.34, 0.3, look.skin, 0, 0.08, 0));
  head.add(box(0.34, 0.1, 0.32, look.hair, 0, 0.38, -0.01));
  head.add(box(0.06, 0.05, 0.02, '#f0f0e0', -0.08, 0.28, 0.155), box(0.06, 0.05, 0.02, '#f0f0e0', 0.08, 0.28, 0.155));
  if (look.mask) head.add(box(0.34, 0.16, 0.08, '#2a2d33', 0, 0.1, 0.14), box(0.08, 0.08, 0.06, '#5ad0d8', 0.1, 0.12, 0.19, '#2a8a90'));
  return { root, body, legL, legR, armL, armR, head };
}

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}

/** Procedural walk/idle animation shared by humanoids and Cedric's rig. */
export function animateLimbs(h: { legL: THREE.Object3D; legR: THREE.Object3D; armL?: THREE.Object3D; armR?: THREE.Object3D }, phase: number, amount: number) {
  const sw = Math.sin(phase) * 0.6 * amount;
  h.legL.rotation.x = sw;
  h.legR.rotation.x = -sw;
  if (h.armL) h.armL.rotation.x = -sw * 0.8;
  if (h.armR) h.armR.rotation.x = sw * 0.8;
}
