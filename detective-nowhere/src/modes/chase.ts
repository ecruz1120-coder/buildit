import * as THREE from 'three';
import { box, makeHumanoid, animateLimbs, type Humanoid } from '../render/props';
import { makeCedric, type Rig } from '../world/actors';
import { CONTENT } from '../content';
import type { Game } from '../game';

type Obs = { x: number; kind: 'crate' | 'pipe' | 'fence' };

/**
 * Selective 2.5D side-view sequence (Bible §1 camera modes): the runner bolts from the shed's
 * rear door down the service alley. Auto-run; JUMP crates/fences, SLIDE under pipes. Catch him before the end.
 */
export class ChaseMode {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private player: Rig;
  private runner: Humanoid;
  private obs: Obs[] = [];
  private px = 0; private py = 0; private vy = 0; private slide = 0; private stumble = 0; private phase = 0;
  private rx = 7; private ry = 0; private rvy = 0; private rphase = 0; private rslide = 0;
  private readonly END = 140;
  private result: 'caught' | 'escaped' | null = null;
  private endT = 0;
  private started = 0;
  private cb: ((r: 'caught' | 'escaped') => void) | null = null;
  private hits = 0;

  constructor(private g: Game) {
    this.camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 200);
    this.scene.background = new THREE.Color('#1c2c44');
    this.scene.fog = new THREE.Fog('#1c2c44', 50, 120);
    this.scene.add(new THREE.HemisphereLight('#bcd8f0', '#303848', 2.6));
    this.scene.add(new THREE.AmbientLight('#506080', 0.8));
    const sun = new THREE.DirectionalLight('#ffd9b0', 2.6); sun.position.set(-4, 10, 8); this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#ffffff', 2.4); fill.position.set(0, 3, 20); this.scene.add(fill, fill.target);
    const rim = new THREE.DirectionalLight('#6fd3e0', 1.4); rim.position.set(6, 4, -6); this.scene.add(rim);
    // Ground + layered backdrop (parallax by depth)
    this.scene.add(box(this.END + 40, 1, 4, '#6a7284', this.END / 2, -1, 0));
    this.scene.add(box(this.END + 40, 0.05, 0.1, '#6fd3e0', this.END / 2, 0, 1.6, '#1a5a66'));
    for (let i = 0; i < 40; i++) {
      const x = i * 4.3 - 6, h = 4 + ((i * 7) % 5) * 1.3;
      this.scene.add(box(3.8, h, 2, i % 2 ? '#4a5a78' : '#5a4e70', x, 0, -4));
      for (let w = 1; w < h - 1; w += 1.4) this.scene.add(box(0.5, 0.5, 0.05, (i + w) % 3 < 1 ? '#f0c060' : '#3a4a60', x - 0.8, w, -2.95, (i + w) % 3 < 1 ? '#604010' : undefined));
      if (i % 3 === 0) { this.scene.add(box(0.12, 3, 0.12, '#2a2d33', x + 1.2, 0, -1.6)); this.scene.add(box(0.5, 0.1, 0.3, '#fff3c4', x + 1.4, 3, -1.6, '#ffe7a0')); }
    }
    for (let i = 0; i < 30; i++) this.scene.add(box(6, 9 + (i % 4) * 2, 2, '#2c3a52', i * 6.5, 0, -12));
    const xs: Obs[] = [
      { x: 12, kind: 'crate' }, { x: 20, kind: 'pipe' }, { x: 28, kind: 'crate' }, { x: 36, kind: 'fence' }, { x: 44, kind: 'pipe' },
      { x: 53, kind: 'crate' }, { x: 60, kind: 'pipe' }, { x: 68, kind: 'fence' }, { x: 76, kind: 'crate' }, { x: 84, kind: 'pipe' },
      { x: 92, kind: 'crate' }, { x: 100, kind: 'fence' }, { x: 108, kind: 'pipe' }, { x: 116, kind: 'crate' }, { x: 124, kind: 'pipe' }, { x: 131, kind: 'fence' },
    ];
    this.obs = xs;
    for (const o of xs) {
      if (o.kind === 'crate') this.scene.add(box(0.9, 0.9, 1.2, '#b08a54', o.x, 0, 0));
      if (o.kind === 'fence') { this.scene.add(box(0.12, 1.0, 1.6, '#c9a34a', o.x, 0, 0)); this.scene.add(box(0.15, 0.06, 1.6, '#c9a34a', o.x, 0.95, 0)); }
      if (o.kind === 'pipe') { this.scene.add(box(0.3, 0.3, 3, '#7a8aa0', o.x, 1.1, 0)); this.scene.add(box(0.15, 1.4, 0.15, '#4a505c', o.x, 0, -1.4)); this.scene.add(box(0.12, 0.15, 3, '#ff5a5a', o.x, 1.4, 0, '#601010')); }
    }
    this.scene.add(box(1, 4, 3, '#b0582e', this.END + 1, 0, 0)); // alley exit
    this.player = makeCedric();
    this.player.root.rotation.y = Math.PI / 2;
    this.scene.add(this.player.root);
    const d = CONTENT.npcs.dax;
    this.runner = makeHumanoid(d.look);
    this.runner.root.rotation.y = Math.PI / 2;
    this.scene.add(this.runner.root);
  }

  start(cb: (r: 'caught' | 'escaped') => void) {
    this.cb = cb; this.result = null; this.endT = 0;
    this.px = 0; this.py = 0; this.vy = 0; this.slide = 0; this.stumble = 0; this.hits = 0;
    this.rx = 7; this.ry = 0; this.rvy = 0;
    this.started = 1.2; // brief "GO" pause
    this.player.root.rotation.set(0, Math.PI / 2, 0);
    document.getElementById('chasehud')!.classList.remove('hidden');
  }

  private obstacleAt(x0: number, x1: number) { return this.obs.find((o) => o.x > x0 && o.x <= x1); }

  update(dt: number) {
    const inp = this.g.input;
    const hud = document.getElementById('chasehud')!;
    if (this.result) {
      this.endT += dt;
      if (this.result === 'caught') { this.player.root.rotation.z = -1.2; this.runner.root.rotation.z = -1.4; this.runner.root.position.y = 0.2; }
      if (this.endT > 1.8) { hud.classList.add('hidden'); const cb = this.cb; this.cb = null; cb?.(this.result); }
    } else if (this.started > 0) {
      this.started -= dt;
    } else {
      // Player
      const speed = this.stumble > 0 ? 1.6 : 6.5;
      this.stumble = Math.max(0, this.stumble - dt);
      const onGround = this.py <= 0.001;
      if (onGround && inp.pressed('jump') && this.stumble <= 0) { this.vy = 7.6; this.slide = 0; }
      if (onGround && (inp.pressed('crouch') || inp.pressed('down')) && this.stumble <= 0) this.slide = 0.6;
      this.slide = Math.max(0, this.slide - dt);
      this.vy -= 22 * dt; this.py = Math.max(0, this.py + this.vy * dt); if (this.py === 0) this.vy = Math.max(0, this.vy);
      const nx = this.px + speed * dt;
      const o = this.obstacleAt(this.px + 0.3, nx + 0.3);
      if (o && this.stumble <= 0) {
        const cleared = (o.kind === 'pipe' && this.slide > 0) || (o.kind !== 'pipe' && this.py > (o.kind === 'fence' ? 0.95 : 0.85));
        if (!cleared) { this.stumble = 0.7; this.hits++; this.g.hud.toast(o.kind === 'pipe' ? 'Clipped the pipe — slide under!' : 'Stumbled — jump it!', 'warn'); }
      }
      this.px = nx;
      // Runner: scripted perfect-ish runner
      const rs = 5.8;
      const rnx = this.rx + rs * dt;
      const ro = this.obstacleAt(this.rx + 1.4, rnx + 1.4);
      if (ro && this.ry <= 0.001) { if (ro.kind === 'pipe') this.rslide = 0.6; else this.rvy = 7.6; }
      this.rslide = Math.max(0, this.rslide - dt);
      this.rvy -= 22 * dt; this.ry = Math.max(0, this.ry + this.rvy * dt); if (this.ry === 0) this.rvy = Math.max(0, this.rvy);
      this.rx = rnx;
      if (this.rx - this.px < 0.9) { this.result = 'caught'; }
      else if (this.rx >= this.END) { this.result = 'escaped'; }
    }
    // Animate
    this.phase += dt * (this.stumble > 0 ? 6 : 14);
    this.rphase += dt * 13;
    animateLimbs(this.player, this.phase, this.py > 0 ? 0.3 : 1);
    this.player.root.position.set(this.px, this.py, 0);
    if (!this.result) this.player.root.rotation.z = this.slide > 0 ? -1.1 : this.stumble > 0 ? -0.35 : -0.12;
    animateLimbs(this.runner, this.rphase, this.ry > 0 ? 0.3 : 1);
    this.runner.root.position.set(this.rx, this.ry + (this.rslide > 0 ? -0.35 : 0), 0);
    if (!this.result) this.runner.root.rotation.z = this.rslide > 0 ? -1.1 : -0.12;
    // Camera
    const aspect = window.innerWidth / window.innerHeight;
    const vh = 6.2;
    this.camera.left = -vh * aspect; this.camera.right = vh * aspect; this.camera.top = vh; this.camera.bottom = -vh;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(this.px + 4, 3.2, 30);
    this.camera.lookAt(this.px + 4, 2.4, 0);
    // HUD
    const gap = Math.max(0, this.rx - this.px);
    const k = (a: string) => this.g.hud.k(a);
    hud.innerHTML = `<div style="font-family:var(--head);letter-spacing:3px;color:var(--cyan)">${this.started > 0 ? 'HE BOLTS — GO!' : this.result === 'caught' ? 'GOT HIM.' : this.result === 'escaped' ? 'HE\'S GONE.' : 'CATCH THE RUNNER'}</div>
      <div class="track"><i style="left:${(this.px / this.END) * 100}%;background:var(--cyan)"></i><i style="left:${(Math.min(this.rx, this.END) / this.END) * 100}%;background:var(--red)"></i></div>
      <div>GAP ${gap.toFixed(1)} m &nbsp;·&nbsp; ${k('jump')}jump crates / fences &nbsp; ${k('crouch')}slide under pipes</div>`;
  }
  get stumbles() { return this.hits; }
}
