import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { animateLimbs, makeHumanoid, type Humanoid, type Look } from '../render/props';
import type { NpcStatus } from '../core/state';

let cedricTemplate: THREE.Object3D | null = null;

/** Loads Cedric Farsight V2 (from the A02 three-view pack). Falls back to a stand-in if loading fails. */
export async function loadCedric(url: string): Promise<boolean> {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    cedricTemplate = gltf.scene;
    return true;
  } catch (e) {
    console.warn('Cedric GLB failed to load; using stand-in', e);
    return false;
  }
}

export interface Rig { root: THREE.Group; legL: THREE.Object3D; legR: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D; body: THREE.Object3D; }

/** Build an animatable Cedric: the GLB is static, so we insert hip/shoulder pivots at runtime. */
export function makeCedric(targetHeight = 1.85): Rig {
  const root = new THREE.Group();
  if (!cedricTemplate) {
    const h = makeHumanoid({ skin: '#c27a7a', coat: '#2f3440', hair: '#d08080', height: 1.05 });
    root.add(h.root);
    return { root, legL: h.legL, legR: h.legR, armL: h.armL, armR: h.armR, body: h.body };
  }
  const model = cedricTemplate.clone(true);
  const body = new THREE.Group();
  body.add(model);
  root.add(body);
  model.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(model);
  const s = targetHeight / (bb.max.y - bb.min.y);
  model.scale.setScalar(s);
  model.position.y = -bb.min.y * s;
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  root.updateMatrixWorld(true);

  const collect = (re: RegExp) => { const out: THREE.Object3D[] = []; model.traverse((o) => { if (re.test(o.name)) out.push(o); }); return out; };
  const makePivot = (objs: THREE.Object3D[], at?: THREE.Vector3): THREE.Group => {
    const p = new THREE.Group();
    if (!objs.length) { body.add(p); return p; }
    const b = new THREE.Box3();
    objs.forEach((o) => b.expandByObject(o));
    const c = at ?? new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
    body.worldToLocal(c);
    p.position.copy(c);
    body.add(p);
    p.updateMatrixWorld(true);
    objs.forEach((o) => p.attach(o));
    return p;
  };
  const legL = makePivot(collect(/^CF2_L(Trouser|Boot|Sole|ToeSeam|BootStrap|BootLatch)/));
  const legR = makePivot(collect(/^CF2_R(Trouser|Boot|Sole|ToeSeam|BootStrap|BootLatch)/));
  const armLObj = collect(/^CF2_L_ShoulderPivot$/);
  const armRObj = collect(/^CF2_R_ShoulderPivot$/);
  const wp = (o?: THREE.Object3D) => (o ? o.getWorldPosition(new THREE.Vector3()) : undefined);
  const armL = makePivot(armLObj, wp(armLObj[0]));
  const armR = makePivot(armRObj, wp(armRObj[0]));
  return { root, legL, legR, armL, armR, body };
}

export class PlayerActor {
  readonly root = new THREE.Group();
  rig: Rig;
  disguise: Humanoid | null = null;
  pos = { x: 0, z: 0 };
  floor = 0;
  facing = 0;
  crouch = false;
  hidden = false;
  dodgeT = 0;
  dodgeDir = { x: 0, z: 0 };
  phase = 0;
  moving = 0;
  hurtT = 0;
  constructor() {
    this.rig = makeCedric();
    this.root.add(this.rig.root);
  }
  setDisguise(look: Look | null) {
    if (this.disguise) { this.root.remove(this.disguise.root); this.disguise = null; }
    this.rig.root.visible = !look;
    if (look) { this.disguise = makeHumanoid(look); this.root.add(this.disguise.root); }
  }
  update(dt: number, y: number) {
    this.phase += dt * 9 * (this.crouch ? 0.6 : 1);
    const h = this.disguise ?? this.rig;
    animateLimbs(h, this.phase, this.moving);
    const body = this.disguise ? this.disguise.body : this.rig.body;
    const bob = Math.abs(Math.sin(this.phase)) * 0.04 * this.moving;
    body.position.y = bob - (this.crouch ? 0.25 : 0);
    body.rotation.x = this.crouch ? 0.25 : 0;
    if (this.dodgeT > 0) body.rotation.x = (1 - this.dodgeT / 0.4) * Math.PI * 2;
    this.root.visible = !this.hidden;
    this.root.position.set(this.pos.x, y, this.pos.z);
    this.root.rotation.y = this.facing;
  }
}

export type AiState = 'idle' | 'patrol' | 'walk' | 'search' | 'combat' | 'down' | 'flee' | 'tied';

export class NpcActor {
  readonly h: Humanoid;
  pos: { x: number; z: number };
  floor: number;
  facing: number;
  status: NpcStatus = 'idle';
  ai: AiState = 'idle';
  path: [number, number][] = [];
  patrol: [number, number][] | null = null;
  patrolIdx = 0;
  wait = 0;
  speed = 1.6;
  detect = 0;
  hp = 60;
  fireCd = 1.5;
  searchT = 0;
  phase = Math.random() * 6;
  watcher = false;
  cone: THREE.Mesh | null = null;
  coneRange = 6;
  coneAngle = 1.25;
  firefight = false;
  label: HTMLDivElement | null = null;
  constructor(public id: string, public name: string, look: Look, floor: number, x: number, z: number, facing: number) {
    this.h = makeHumanoid(look);
    this.h.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.floor = floor;
    this.pos = { x, z };
    this.facing = facing;
  }
  private coneSeg = 22;
  enableCone(range: number, angle: number) {
    this.watcher = true;
    this.coneRange = range;
    this.coneAngle = angle;
    const n = this.coneSeg;
    const pos = new Float32Array((n + 2) * 3);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(0, i + 2, i + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    this.cone.renderOrder = 2;
    this.cone.frustumCulled = false;
    this.h.root.add(this.cone);
    this.cone.position.y = 0.04;
  }
  /** Rebuild the cone as a fan of sight rays clipped by walls, so what you see is what they see. */
  updateCone(ray: (dx: number, dz: number, max: number) => number, rangeMul = 1) {
    if (!this.cone) return;
    const n = this.coneSeg;
    const arr = (this.cone.geometry.getAttribute('position') as THREE.BufferAttribute);
    for (let i = 0; i <= n; i++) {
      const la = -this.coneAngle / 2 + (this.coneAngle * i) / n;
      const wa = this.facing + la;
      const d = ray(Math.sin(wa), Math.cos(wa), this.coneRange * rangeMul);
      arr.setXYZ(i + 1, Math.sin(la) * d, 0, Math.cos(la) * d);
    }
    arr.needsUpdate = true;
  }
  facingVec() { return { x: Math.sin(this.facing), z: Math.cos(this.facing) }; }
  /** Can this NPC see point p (cone + range only; LOS is checked by the caller). */
  inCone(px: number, pz: number, rangeMul = 1): boolean {
    const dx = px - this.pos.x, dz = pz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > this.coneRange * rangeMul) return false;
    if (d < 0.6) return true;
    const f = this.facingVec();
    const cos = (dx * f.x + dz * f.z) / d;
    return cos > Math.cos(this.coneAngle / 2);
  }
  faceTo(x: number, z: number, dt: number, rate = 8) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    let d = target - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * rate);
  }
  update(dt: number, y: number, moving: number) {
    this.phase += dt * 8;
    const down = this.status === 'captured' || this.status === 'ko' || this.status === 'dead' || this.ai === 'tied';
    if (down) {
      this.h.body.rotation.x = 0;
      this.h.body.position.y = -0.55;
      this.h.legL.rotation.x = this.h.legR.rotation.x = -1.4;
      this.h.armL.rotation.x = this.h.armR.rotation.x = 0.4;
      if (this.status === 'dead' || this.status === 'ko') { this.h.body.rotation.z = Math.PI / 2; this.h.body.position.y = 0.15; }
    } else {
      this.h.body.rotation.z = 0;
      this.h.body.position.y = Math.abs(Math.sin(this.phase)) * 0.03 * moving;
      animateLimbs(this.h, this.phase, moving);
      if (!moving) this.h.head.rotation.y = Math.sin(this.phase * 0.15) * 0.3;
    }
    if (this.cone) {
      this.cone.visible = this.watcher && !down && this.status !== 'hostile' && this.status === 'idle';
      const m = this.cone.material as THREE.MeshBasicMaterial;
      m.color.setRGB(1, 0.82 - this.detect * 0.7, 0.3 - this.detect * 0.3);
      m.opacity = 0.14 + this.detect * 0.22;
    }
    this.h.root.visible = this.status !== 'gone' && this.status !== 'hidden' && this.status !== 'fled';
    this.h.root.position.set(this.pos.x, y, this.pos.z);
    this.h.root.rotation.y = this.facing;
  }
}
