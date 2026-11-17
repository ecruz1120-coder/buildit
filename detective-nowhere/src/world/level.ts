import * as THREE from 'three';
import { FLOORS, FLOOR_HEIGHT, W, H, tile } from './maps';
import { tileTex, pavingTex, grassTex, wallTex } from '../render/textures';
import { box, makeProp, mat, type PropKind } from '../render/props';

export interface PropDef { kind: PropKind; floor: number; x: number; z: number; rot?: number; size?: [number, number]; opts?: any; id?: string; }

/** Static set dressing. size = blocking footprint in metres (omit = non-blocking). */
export const PROPS: PropDef[] = [
  // Apt 1A — Tamsin
  { kind: 'couch', floor: 0, x: 2.2, z: 1.6, size: [1.8, 0.8] },
  { kind: 'tv', floor: 0, x: 2.2, z: 4.6, rot: Math.PI, size: [1.1, 0.4] },
  { kind: 'rug', floor: 0, x: 2.6, z: 3.1, opts: { w: 2.4, d: 1.4, color: '#6e4a68' } },
  { kind: 'table', floor: 0, x: 4.7, z: 1.6, size: [0.9, 0.9] },
  { kind: 'plant', floor: 0, x: 5.4, z: 5.4, size: [0.4, 0.4] },
  { kind: 'kitchen', floor: 0, x: 1.4, z: 4.0, rot: Math.PI / 2, size: [0.6, 1.6], opts: { w: 1.6 } },
  // Stairwells
  { kind: 'stairs', floor: 0, x: 8.5, z: 3.0, rot: Math.PI },
  { kind: 'stairs', floor: 1, x: 8.5, z: 2.6, rot: 0 },
  // Apt 1B — Pim (moving out)
  { kind: 'boxes', floor: 0, x: 12.2, z: 1.6, size: [1.2, 0.7] },
  { kind: 'boxes', floor: 0, x: 12.0, z: 4.7, size: [1.2, 0.7] },
  { kind: 'bed', floor: 0, x: 17.9, z: 2.3, size: [1.1, 2.0], opts: { color: '#5a6a80' } },
  { kind: 'boxes', floor: 0, x: 15.6, z: 1.5, size: [1.2, 0.7] },
  { kind: 'plant', floor: 0, x: 18.5, z: 5.4, size: [0.4, 0.4] },
  // Lobby
  { kind: 'mailboxes', floor: 0, x: 2.6, z: 7.18, size: [1.6, 0.3] },
  { kind: 'noticeboard', floor: 0, x: 5.6, z: 7.05 },
  { kind: 'counter', floor: 0, x: 15.5, z: 10.4, size: [3.0, 0.7], opts: { w: 3 } },
  { kind: 'terminal', floor: 0, x: 16.4, z: 10.45, rot: Math.PI },
  { kind: 'bench', floor: 0, x: 5.5, z: 12.4, rot: Math.PI, size: [1.6, 0.45] },
  { kind: 'plant', floor: 0, x: 1.5, z: 12.4, size: [0.4, 0.4] },
  { kind: 'plant', floor: 0, x: 18.4, z: 7.6, size: [0.4, 0.4] },
  { kind: 'rug', floor: 0, x: 9.6, z: 10.0, opts: { w: 3.2, d: 2.6, color: '#34466a' } },
  { kind: 'cctv', floor: 0, x: 18.7, z: 12.7 },
  // Courtyard
  { kind: 'fireescape', floor: 0, x: 3.5, z: 14.0 },
  { kind: 'lamppost', floor: 0, x: 7.5, z: 14.5, size: [0.3, 0.3] },
  { kind: 'lamppost', floor: 0, x: 1.5, z: 22.5, size: [0.3, 0.3] },
  { kind: 'lamppost', floor: 0, x: 16.5, z: 15.3, size: [0.3, 0.3] },
  { kind: 'lamppost', floor: 0, x: 13.3, z: 21.2, size: [0.3, 0.3] },
  { kind: 'tree', floor: 0, x: 3.0, z: 15.5, size: [0.4, 0.4] },
  { kind: 'tree', floor: 0, x: 4.6, z: 19.6, size: [0.4, 0.4] },
  { kind: 'tree', floor: 0, x: 16.6, z: 15.6, size: [0.4, 0.4] },
  { kind: 'bench', floor: 0, x: 7.6, z: 19.0, rot: -Math.PI / 2, size: [0.45, 1.6] },
  { kind: 'bench', floor: 0, x: 4.0, z: 24.4, rot: Math.PI, size: [1.6, 0.45] },
  { kind: 'crate', floor: 0, x: 18.4, z: 18.6, size: [0.9, 0.9] },
  { kind: 'crate', floor: 0, x: 17.5, z: 18.6, size: [0.9, 0.9] },
  { kind: 'drum', floor: 0, x: 11.6, z: 24.4, size: [0.6, 0.6] },
  { kind: 'drum', floor: 0, x: 14.4, z: 24.4, size: [0.6, 0.6] },
  { kind: 'sign', floor: 0, x: 15.1, z: 17.5 },
  // Shed interior
  { kind: 'shelf', floor: 0, x: 16.7, z: 21.25, size: [1.2, 0.4] },
  { kind: 'drum', floor: 0, x: 16.4, z: 23.5, size: [0.6, 0.6] },
  // Floor 2 hallway
  { kind: 'locker', floor: 1, x: 18.55, z: 6.35, size: [0.8, 0.55] },
  { kind: 'plant', floor: 1, x: 1.4, z: 6.4, size: [0.4, 0.4] },
  { kind: 'cctv', floor: 1, x: 18.7, z: 7.7 },
  // Apt 2B — Corin
  { kind: 'bed', floor: 1, x: 1.7, z: 10.3, size: [1.1, 2.0], opts: { color: '#a04a68' } },
  { kind: 'desk', floor: 1, x: 6.3, z: 9.45, size: [1.5, 0.75] },
  { kind: 'terminal', floor: 1, x: 6.3, z: 9.45 },
  { kind: 'chair', floor: 1, x: 6.3, z: 10.35 },
  { kind: 'wardrobe', floor: 1, x: 7.45, z: 11.9, rot: -Math.PI / 2, size: [0.6, 1.0] },
  { kind: 'rug', floor: 1, x: 4.2, z: 11.0, opts: { w: 2.0, d: 1.4, color: '#7a5470' } },
  { kind: 'shelf', floor: 1, x: 3.7, z: 9.22, size: [1.2, 0.4] },
  // Apt 2A / 2C dressing
  { kind: 'boxes', floor: 1, x: 2.5, z: 2.0 },
  { kind: 'crate', floor: 1, x: 12.0, z: 10.5 },
  { kind: 'crate', floor: 1, x: 16.0, z: 11.0 },
  { kind: 'boxes', floor: 1, x: 14.0, z: 2.5 },
];

/** Lockable tiles: id -> location. Closed = solid. */
export const DOORS: Record<string, { floor: number; x: number; z: number; axis: 'x' | 'z' }> = {
  door_2a: { floor: 1, x: 3, z: 5, axis: 'x' },
  door_2d: { floor: 1, x: 15, z: 5, axis: 'x' },
  door_2c: { floor: 1, x: 12, z: 8, axis: 'x' },
  door_shed: { floor: 0, x: 16, z: 20, axis: 'x' },
  gate: { floor: 0, x: 14, z: 17, axis: 'x' },
};

const SOLID = new Set(['#', 'W', 'f', 'S', 'E', ' ']);

export class Level {
  readonly floorGroups: THREE.Group[] = [];
  private cutWalls: THREE.Object3D[] = [];
  private fullWalls: THREE.Object3D[] = [];
  private propBlock: Uint8Array[] = [];
  private doorOpen: Record<string, boolean> = {};
  private doorMeshes: Record<string, THREE.Object3D> = {};
  private extraBlock = new Set<string>();

  constructor(scene: THREE.Scene) {
    for (let f = 0; f < FLOORS.length; f++) {
      const g = new THREE.Group();
      g.position.y = f * FLOOR_HEIGHT;
      scene.add(g);
      this.floorGroups.push(g);
      this.propBlock.push(new Uint8Array(W * H));
      this.buildFloor(f, g);
    }
    for (const p of PROPS) this.placeProp(p);
    for (const [id, d] of Object.entries(DOORS)) this.buildDoor(id, d);
  }

  private buildFloor(f: number, g: THREE.Group) {
    const map = FLOORS[f];
    const tileTypes: Record<string, { tex: THREE.Texture; list: [number, number][] }> = {
      in: { tex: f === 0 ? tileTex('#5d6475', '#474d5c') : tileTex('#6a6170', '#4f4858'), list: [] },
      out: { tex: pavingTex(), list: [] },
      grass: { tex: grassTex(), list: [] },
    };
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const c = map[z][x];
      if (c === ' ') continue;
      if (c === ',' || c === 'f' || c === 'g' || c === 'G') tileTypes.out.list.push([x, z]);
      else if (c === '"') tileTypes.grass.list.push([x, z]);
      else tileTypes.in.list.push([x, z]);
    }
    const slabH = f === 0 ? 0.1 : 0.42;
    for (const t of Object.values(tileTypes)) {
      if (!t.list.length) continue;
      const geo = new THREE.BoxGeometry(1, slabH, 1);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: t.tex }), t.list.length);
      const m4 = new THREE.Matrix4();
      t.list.forEach(([x, z], i) => { m4.makeTranslation(x + 0.5, -slabH / 2, z + 0.5); im.setMatrixAt(i, m4); });
      im.receiveShadow = true;
      g.add(im);
    }
    // Walls — cutaway rule: a wall tile with walkable space behind it (toward -x/-z, away from the camera)
    // is drawn low so it never hides the player. Ground floor also keeps a full-height set for when you're upstairs.
    const isOpen = (x: number, z: number) => { const c = map[z]?.[x]; return c !== undefined && c !== '#' && c !== ' ' && c !== 'W' && c !== 'E'; };
    const tall: [number, number, string][] = [];
    const short: [number, number, string][] = [];
    const fences: [number, number, string][] = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const c = map[z][x];
      if (c === '#' || c === 'W' || c === 'E') {
        const cut = isOpen(x - 1, z) || isOpen(x, z - 1) || isOpen(x - 1, z - 1);
        (cut ? short : tall).push([x, z, c]);
      } else if (c === 'f' || c === 'g') fences.push([x, z, c]);
    }
    const wallCol = f === 0 ? '#717a8c' : '#7e7488';
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex(wallCol) });
    const capMat = mat('#2b2f38');
    const mk = (list: [number, number, string][], h: number, parent: THREE.Object3D[]) => {
      for (const [x, z, c] of list) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(1, h, 1), wallMat);
        w.position.set(x + 0.5, h / 2, z + 0.5);
        w.castShadow = w.receiveShadow = true;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 1.0), capMat);
        cap.position.set(x + 0.5, h + 0.03, z + 0.5);
        g.add(w, cap);
        parent.push(w, cap);
        if (c === 'W') {
          const glass = box(0.8, Math.min(h, 1.0), 1.02, '#4fb8d0', x + 0.5, Math.min(h - 0.1, 1.0) * 0.4, z + 0.5, '#0e4a58');
          g.add(glass); parent.push(glass);
        }
        if (c === 'E') {
          const door = box(0.08, Math.min(h, 2.1), 0.85, '#9a4a2e', x + 0.02, 0, z + 0.5);
          g.add(door); parent.push(door);
        }
      }
    };
    mk(tall, 2.8, []);
    if (f === 0) {
      mk(short, 0.55, this.cutWalls);
      mk(short, 2.8, this.fullWalls);
      this.fullWalls.forEach((o) => (o.visible = false));
    } else mk(short, 0.55, []);
    // Fences: posts + rails, low, see-through for line of sight
    for (const [x, z, c] of fences) {
      g.add(box(0.08, 0.95, 0.08, '#2a2d33', x + 0.5, 0, z + 0.5));
      const horiz = map[z][x - 1] === 'f' || map[z][x + 1] === 'f' || map[z][x - 1] === 'G' || map[z][x + 1] === 'G';
      const rail = (y: number) => horiz ? box(1, 0.06, 0.06, '#3a3f4a', x + 0.5, y, z + 0.5) : box(0.06, 0.06, 1, '#3a3f4a', x + 0.5, y, z + 0.5);
      if (c === 'f') g.add(rail(0.45), rail(0.9));
      else { const r = rail(0.9); r.material = mat('#7a4a3a'); g.add(r); }
    }
  }

  private placeProp(p: PropDef) {
    const obj = makeProp(p.kind, p.opts);
    obj.position.set(p.x, 0, p.z);
    obj.rotation.y = p.rot ?? 0;
    this.floorGroups[p.floor].add(obj);
    if (p.size) {
      const [w, d] = p.size;
      for (let z = Math.floor(p.z - d / 2 + 0.05); z <= Math.floor(p.z + d / 2 - 0.05); z++)
        for (let x = Math.floor(p.x - w / 2 + 0.05); x <= Math.floor(p.x + w / 2 - 0.05); x++)
          if (x >= 0 && z >= 0 && x < W && z < H) this.propBlock[p.floor][z * W + x] = 1;
    }
  }

  private buildDoor(id: string, d: { floor: number; x: number; z: number }) {
    this.doorOpen[id] = false;
    const g = new THREE.Group();
    if (id === 'gate') {
      for (let i = 0; i < 6; i++) g.add(box(0.05, 1.15, 0.05, '#c9a34a', d.x + 0.1 + i * 0.16, 0, d.z + 0.5));
      g.add(box(1, 0.08, 0.08, '#c9a34a', d.x + 0.5, 1.1, d.z + 0.5));
    } else {
      const color = id === 'door_shed' ? '#b0582e' : '#4a3f5a';
      g.add(box(0.92, 2.1, 0.12, color, d.x + 0.5, 0, d.z + 0.5));
      g.add(box(0.1, 0.1, 0.04, id === 'door_shed' ? '#ff5050' : '#ffb040', d.x + 0.82, 1.1, d.z + 0.58, '#802010'));
    }
    this.floorGroups[d.floor].add(g);
    this.doorMeshes[id] = g;
  }

  setDoor(id: string, open: boolean) {
    this.doorOpen[id] = open;
    const m = this.doorMeshes[id];
    if (m) m.visible = !open;
  }
  isDoorOpen(id: string) { return !!this.doorOpen[id]; }

  /** Upper floor visible only when the player is upstairs; ground-floor facades go full-height then. */
  showFloor(current: number) {
    this.floorGroups[1].visible = current >= 1;
    this.cutWalls.forEach((o) => (o.visible = current === 0));
    this.fullWalls.forEach((o) => (o.visible = current !== 0));
  }

  setExtraBlock(floor: number, x: number, z: number, on: boolean) {
    const k = `${floor}:${x}:${z}`;
    if (on) this.extraBlock.add(k); else this.extraBlock.delete(k);
  }

  walkable(floor: number, x: number, z: number, crouched: boolean): boolean {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (tx < 0 || tz < 0 || tx >= W || tz >= H) return false;
    const c = tile(floor, tx, tz);
    if (SOLID.has(c)) return false;
    if (c === '#') return false;
    if (c === 'g' && !crouched) return false;
    if (c === 'L' || c === 'G') {
      const id = Object.entries(DOORS).find(([, d]) => d.floor === floor && d.x === tx && d.z === tz)?.[0];
      if (!id || !this.doorOpen[id]) return false;
    }
    if (this.propBlock[floor][tz * W + tx]) return false;
    if (this.extraBlock.has(`${floor}:${tx}:${tz}`)) return false;
    return true;
  }

  /** Circle-vs-tile movement with axis separation (slides along walls). */
  move(floor: number, pos: { x: number; z: number }, dx: number, dz: number, r: number, crouched: boolean) {
    const ok = (x: number, z: number) =>
      this.walkable(floor, x - r, z - r, crouched) && this.walkable(floor, x + r, z - r, crouched) &&
      this.walkable(floor, x - r, z + r, crouched) && this.walkable(floor, x + r, z + r, crouched);
    if (ok(pos.x + dx, pos.z)) pos.x += dx;
    if (ok(pos.x, pos.z + dz)) pos.z += dz;
  }

  /** Distance a sight ray travels before a wall / closed door (for wall-clipped vision cones). */
  rayDist(floor: number, x: number, z: number, dx: number, dz: number, max: number): number {
    for (let d = 0.25; d <= max; d += 0.25) {
      const c = tile(floor, x + dx * d, z + dz * d);
      if (c === '#' || c === 'W' || c === 'E' || c === ' ' || c === 'S') return d - 0.1;
      if (c === 'L' || c === 'G') {
        const tx = Math.floor(x + dx * d), tz = Math.floor(z + dz * d);
        const id = Object.entries(DOORS).find(([, o]) => o.floor === floor && o.x === tx && o.z === tz)?.[0];
        if (c === 'L' && (!id || !this.doorOpen[id])) return d - 0.1;
      }
    }
    return max;
  }

  /** Line of sight blocked by walls / closed doors (fences and props are see-through). */
  los(floor: number, ax: number, az: number, bx: number, bz: number): boolean {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist / 0.2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const c = tile(floor, x, z);
      if (c === '#' || c === 'W' || c === 'E' || c === ' ') return false;
      if (c === 'L') {
        const id = Object.entries(DOORS).find(([, d]) => d.floor === floor && d.x === Math.floor(x) && d.z === Math.floor(z))?.[0];
        if (!id || !this.doorOpen[id]) return false;
      }
    }
    return true;
  }
}
