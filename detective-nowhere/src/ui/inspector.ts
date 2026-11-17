import * as THREE from 'three';
import { CONTENT } from '../content';
import { box, mat } from '../render/props';
import { esc } from './nav';
import type { Game } from '../game';

const root = () => document.getElementById('inspector')!;

/**
 * Close-up evidence inspection (camera mode 3). Rotate the object to bring a hidden hotspot
 * to face you, then examine it. Footage/testimony items show a dossier instead of a model.
 */
export class Inspector {
  open = false;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  private obj: THREE.Group | null = null;
  private hotNormal = new THREE.Vector3(0, 0, 1);
  private hotMarker: THREE.Mesh | null = null;
  private rotX = 0.4; private rotY = 0.6; private dist = 2.4;
  private evId = '';
  private aligned = false;
  private drag = false;
  private onClose: (() => void) | null = null;
  private t = 0;

  constructor(private g: Game) {
    this.scene.add(new THREE.HemisphereLight('#bfe8ff', '#1a2030', 1.6));
    const d = new THREE.DirectionalLight('#ffffff', 1.6); d.position.set(2, 3, 2); this.scene.add(d);
  }

  show(evId: string, onClose?: () => void) {
    this.evId = evId; this.onClose = onClose ?? null;
    const ev = CONTENT.evidence[evId];
    this.open = true;
    const r = root();
    r.classList.remove('hidden');
    r.innerHTML = `<div class="box"><div class="view"><canvas></canvas></div><div class="side"></div></div>`;
    const canvas = r.querySelector('canvas')!;
    if (!this.renderer) this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    const rend = this.renderer;
    canvas.replaceWith(rend.domElement);
    rend.domElement.style.width = '100%'; rend.domElement.style.height = '440px';
    rend.domElement.addEventListener('mousedown', (e) => { this.drag = true; if (this.aligned) this.examine(); e.preventDefault(); });
    window.addEventListener('mouseup', () => (this.drag = false));
    rend.domElement.addEventListener('mousemove', (e) => { if (this.drag) { this.rotY += e.movementX * 0.01; this.rotX += e.movementY * 0.01; } });
    rend.domElement.addEventListener('wheel', (e) => { this.dist = THREE.MathUtils.clamp(this.dist + Math.sign(e.deltaY) * 0.2, 1.2, 4); });
    if (this.obj) this.scene.remove(this.obj);
    this.obj = ev.model ? this.build(ev.model) : this.buildDossier(evId);
    this.scene.add(this.obj);
    this.rotX = 0.3; this.rotY = 0.5; this.dist = 2.4;
    requestAnimationFrame(() => this.resize());
    this.renderSide();
  }

  private resize() {
    if (!this.renderer) return;
    const c = this.renderer.domElement;
    const w = c.clientWidth || 600, h = c.clientHeight || 440;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }

  private hot(pos: THREE.Vector3, normal: THREE.Vector3, g: THREE.Group) {
    this.hotNormal = normal.clone().normalize();
    const m = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 16), new THREE.MeshBasicMaterial({ color: '#f0b44a', transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false }));
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    m.renderOrder = 5;
    g.add(m);
    this.hotMarker = m;
  }

  private build(model: string): THREE.Group {
    const g = new THREE.Group();
    this.hotMarker = null;
    if (model === 'boot') {
      g.add(box(0.36, 0.16, 0.95, '#2a2620', 0, -0.2, 0));
      g.add(box(0.34, 0.5, 0.4, '#3a342c', 0, -0.05, -0.25));
      const sole = box(0.38, 0.05, 0.98, '#1a1714', 0, -0.25, 0); g.add(sole);
      for (let i = 0; i < 7; i++) g.add(box(0.3, 0.03, 0.05, '#b8562a', 0, -0.275, -0.38 + i * 0.12));
      this.hot(new THREE.Vector3(0, -0.29, 0.05), new THREE.Vector3(0, -1, 0), g); // underside: flip it over
    } else if (model === 'glove') {
      g.add(box(0.5, 0.12, 0.55, '#5a5f66', 0, -0.06, 0.05));
      for (let i = 0; i < 4; i++) g.add(box(0.09, 0.1, 0.4, '#5a5f66', -0.18 + i * 0.12, -0.05, 0.45));
      g.add(box(0.1, 0.1, 0.25, '#5a5f66', 0.3, -0.05, 0.12));
      const cuff = box(0.54, 0.16, 0.25, '#3a3f46', 0, -0.08, -0.32); g.add(cuff);
      g.add(box(0.2, 0.06, 0.02, '#c9a34a', 0, -0.02, -0.445));
      this.hot(new THREE.Vector3(0, 0, -0.45), new THREE.Vector3(0, 0, -1), g); // inside of the cuff: turn it around
    } else if (model === 'card') {
      g.add(box(0.86, 0.02, 0.54, '#d9d2c4', 0, -0.01, 0));
      g.add(box(0.3, 0.021, 0.2, '#c9a34a', -0.2, -0.01, -0.05));
      g.add(box(0.86, 0.022, 0.1, '#1a1a1a', 0, -0.012, 0.15)); // stripe on the back face
      this.hot(new THREE.Vector3(0, -0.015, 0.15), new THREE.Vector3(0, -1, 0), g);
    } else if (model === 'note') {
      const paper = box(0.7, 0.01, 0.95, '#e8e2d0', 0, 0, 0); g.add(paper);
      for (let i = 0; i < 6; i++) g.add(box(0.5 - (i % 2) * 0.12, 0.012, 0.02, '#3a3550', -0.03, 0.001, -0.35 + i * 0.1));
      g.add(box(0.12, 0.013, 0.06, '#8a8070', 0.27, 0.001, 0.4));
      this.hot(new THREE.Vector3(0.27, 0.02, 0.4), new THREE.Vector3(0, 1, 0.0), g);
      this.hotNormal = new THREE.Vector3(0.6, 0.8, 0.5).normalize(); // need to tilt to raking light
    }
    return g;
  }

  private buildDossier(evId: string): THREE.Group {
    const g = new THREE.Group();
    const ev = CONTENT.evidence[evId];
    const c = document.createElement('canvas'); c.width = 160; c.height = 100;
    const x = c.getContext('2d')!;
    x.fillStyle = '#0b1a22'; x.fillRect(0, 0, 160, 100);
    if (ev.kind === 'Footage') {
      x.fillStyle = '#26323e'; x.fillRect(0, 60, 160, 40);
      x.fillStyle = '#3a4656'; for (let i = 0; i < 6; i++) x.fillRect(100 + i * 8, 20 + i * 7, 8, 40 - i * 7);
      const fig = (fx: number, col: string) => { x.fillStyle = col; x.fillRect(fx, 38, 8, 22); x.fillRect(fx + 1, 30, 6, 7); };
      if (evId === 'ev_lobbycam') { fig(48, '#5a5f66'); fig(60, '#8fb88a'); fig(72, '#5a5f66'); } else { fig(110, '#5a5f66'); fig(122, '#5a5f66'); }
      x.fillStyle = '#ff4040'; x.fillRect(6, 6, 4, 4);
      x.fillStyle = '#9ff4ff'; x.font = '8px monospace'; x.fillText(evId === 'ev_lobbycam' ? 'LOBBY 13:22:07' : 'STAIR 13:10:44', 14, 11);
    } else {
      x.fillStyle = '#9ff4ff'; x.font = '9px monospace';
      x.fillText(ev.kind.toUpperCase(), 8, 14);
      x.fillStyle = '#4fd6e0'; for (let i = 0; i < 7; i++) x.fillRect(8, 24 + i * 10, 60 + ((i * 37) % 80), 3);
    }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: t }));
    g.add(plane);
    g.add(box(1.7, 1.1, 0.04, mat('#1d2633'), 0, -0.55, -0.03));
    return g;
  }

  private renderSide() {
    const ev = CONTENT.evidence[this.evId];
    const found = ev.detail && this.g.state.details.includes(ev.detail.id);
    const s = root().querySelector('.side')!;
    const k = (a: string) => this.g.hud.k(a);
    s.innerHTML = `<div class="kind" style="color:var(--cyan);letter-spacing:2px;font-size:11px">${esc(ev.kind.toUpperCase())}</div>
      <h3 style="font-family:var(--head);margin:4px 0 8px;color:var(--cream)">${esc(ev.name)}</h3>
      <p>${esc(ev.desc)}</p>
      ${ev.detail ? (found ? `<p class="found">■ ${esc(ev.detail.label)}: ${esc(ev.detail.text)}</p>` : `<p class="hot">${this.aligned ? '◆ Something catches the light — EXAMINE ' + k('interact') : '◇ There may be more here. Rotate it and look closely.'}</p>`) : '<p class="muted">No physical hotspot. Record only.</p>'}
      <p class="muted" style="font-size:11px;margin-top:18px">${k('rotate')}rotate &nbsp;${k('zoom')}zoom &nbsp;${k('interact')}examine &nbsp;${k('cancel')}close</p>`;
  }

  examine() {
    const ev = CONTENT.evidence[this.evId];
    if (!ev.detail || !this.aligned) return;
    this.g.discoverDetail(this.evId);
    this.aligned = false;
    this.renderSide();
  }

  close() {
    this.open = false;
    root().classList.add('hidden');
    const cb = this.onClose; this.onClose = null; cb?.();
  }

  update(dt: number) {
    if (!this.open || !this.renderer || !this.obj) return;
    const inp = this.g.input;
    this.t += dt;
    this.rotY += inp.look.x * dt * 2.5 + (inp.isHeld('right') ? dt * 2 : 0) - (inp.isHeld('left') ? dt * 2 : 0);
    this.rotX += inp.look.y * dt * 2.5 + (inp.isHeld('down') ? dt * 2 : 0) - (inp.isHeld('up') ? dt * 2 : 0);
    this.dist = THREE.MathUtils.clamp(this.dist + (inp.triggers.lt - inp.triggers.rt) * dt * 2, 1.2, 4);
    this.obj.rotation.set(this.rotX, this.rotY, 0);
    this.cam.position.set(0, 0, this.dist);
    this.cam.lookAt(0, 0, 0);
    const ev = CONTENT.evidence[this.evId];
    if (ev.detail && this.hotMarker && !this.g.state.details.includes(ev.detail.id)) {
      const n = this.hotNormal.clone().applyEuler(this.obj.rotation);
      const was = this.aligned;
      this.aligned = n.z > 0.8;
      const keen = this.g.state.progress.skills.includes('keen_eye');
      (this.hotMarker.material as THREE.MeshBasicMaterial).opacity = this.aligned ? 0.6 + Math.sin(this.t * 8) * 0.4 : keen ? 0.25 + Math.sin(this.t * 4) * 0.2 : 0;
      if (was !== this.aligned) this.renderSide();
      if (this.aligned && inp.pressed('interact')) this.examine();
    } else if (this.hotMarker) (this.hotMarker.material as THREE.MeshBasicMaterial).opacity = 0;
    if (inp.pressed('cancel')) { this.close(); return; }
    this.renderer.render(this.scene, this.cam);
  }
}
