/**
 * Unified input: keyboard/mouse + Xbox controller (standard Gamepad mapping).
 * Actions are polled per frame; `pressed` is edge-triggered, `held` is level.
 */
export type Action =
  | 'interact' | 'cancel' | 'melee' | 'fire' | 'dodge' | 'crouch' | 'mimic' | 'scan' | 'holoband'
  | 'pause' | 'quicksave' | 'quickload' | 'up' | 'down' | 'left' | 'right' | 'tabPrev' | 'tabNext' | 'directives' | 'jump';

const KEYMAP: Record<string, Action[]> = {
  KeyE: ['interact'], Enter: ['interact'], Escape: ['cancel', 'pause'], Backspace: ['cancel'],
  KeyF: ['melee'], KeyR: ['fire'], Space: ['dodge', 'jump'], KeyC: ['crouch'], ControlLeft: ['crouch'],
  KeyM: ['mimic'], KeyQ: ['scan', 'tabPrev'], Tab: ['holoband'], KeyH: ['directives'],
  F5: ['quicksave'], F9: ['quickload'],
  ArrowUp: ['up'], ArrowDown: ['down'], ArrowLeft: ['left', 'tabPrev'], ArrowRight: ['right', 'tabNext'],
  BracketLeft: ['tabPrev'], BracketRight: ['tabNext'], KeyW: ['up'], KeyS: ['down'], KeyA: ['left'], KeyD: ['right'],
};
// Standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Menu, 12-15 D-pad
const PADMAP: Record<number, Action[]> = {
  0: ['interact', 'jump'], 1: ['cancel', 'dodge'], 2: ['melee'], 3: ['scan'], 4: ['crouch', 'tabPrev'], 5: ['mimic', 'tabNext'],
  7: ['fire'], 8: ['holoband'], 9: ['pause'], 12: ['up'], 13: ['down'], 14: ['left'], 15: ['right'], 11: ['directives'],
};

export class Input {
  private held = new Set<Action>();
  private prev = new Set<Action>();
  private now = new Set<Action>();
  private keys = new Set<string>();
  /** Keys pressed since the last frame — latched so taps between slow frames are never lost. */
  private tapped = new Set<string>();
  device: 'kbm' | 'pad' = 'kbm';
  move = { x: 0, y: 0 };
  private mouseTap = false;
  look = { x: 0, y: 0 };
  mouse = { x: 0, y: 0, down: false, wheel: 0, dx: 0, dy: 0, inside: false };
  triggers = { lt: 0, rt: 0 };
  private padPrevAxes = { x: 0, y: 0 };
  private lastStickNav = 0;
  onDevice?: (d: 'kbm' | 'pad') => void;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'F5', 'F9', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.tapped.add(e.code);
      this.keys.add(e.code); this.setDevice('kbm');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
      this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.mouse.inside = true;
    });
    el.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouse.down = true; this.mouseTap = true; this.setDevice('kbm'); } });
    window.addEventListener('mouseup', () => (this.mouse.down = false));
    el.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private setDevice(d: 'kbm' | 'pad') { if (this.device !== d) { this.device = d; this.onDevice?.(d); } }

  update() {
    this.prev = this.now;
    this.now = new Set();
    for (const k of this.keys) KEYMAP[k]?.forEach((a) => this.now.add(a));
    for (const k of this.tapped) KEYMAP[k]?.forEach((a) => { this.now.add(a); if (this.prev.has(a) && !this.keys.has(k)) this.prev.delete(a); });
    this.tapped.clear();
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.mouse.down || this.mouseTap) this.now.add('fire');
    this.mouseTap = false;
    this.look.x = 0; this.look.y = 0; this.triggers.lt = 0; this.triggers.rt = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      p.buttons.forEach((b, i) => { if (b.pressed) { PADMAP[i]?.forEach((a) => this.now.add(a)); this.setDevice('pad'); } });
      const dz = (v: number) => (Math.abs(v) < 0.2 ? 0 : v);
      const ax = dz(p.axes[0] ?? 0), ay = dz(p.axes[1] ?? 0);
      if (ax || ay) { mx = ax; my = -ay; this.setDevice('pad'); }
      this.look.x = dz(p.axes[2] ?? 0); this.look.y = dz(p.axes[3] ?? 0);
      this.triggers.lt = p.buttons[6]?.value ?? 0; this.triggers.rt = p.buttons[7]?.value ?? 0;
      // Left stick also drives menu navigation (edge-triggered, with repeat)
      const t = performance.now();
      if ((Math.abs(ax) > 0.6 || Math.abs(ay) > 0.6) && (t - this.lastStickNav > 220 || (Math.abs(this.padPrevAxes.x) < 0.6 && Math.abs(this.padPrevAxes.y) < 0.6))) {
        this.lastStickNav = t;
        if (ay < -0.6) this.now.add('up'); else if (ay > 0.6) this.now.add('down');
        else if (ax < -0.6) this.now.add('left'); else if (ax > 0.6) this.now.add('right');
        this.stickNav = true;
      } else this.stickNav = false;
      this.padPrevAxes = { x: ax, y: ay };
      break;
    }
    const len = Math.hypot(mx, my);
    this.move = len > 1 ? { x: mx / len, y: my / len } : { x: mx, y: my };
    this.held = this.now;
  }
  private stickNav = false;

  /** Edge-triggered press. Stick-driven nav events count as presses even while held. */
  pressed(a: Action) {
    if (this.stickNav && (a === 'up' || a === 'down' || a === 'left' || a === 'right')) return this.now.has(a);
    return this.now.has(a) && !this.prev.has(a);
  }
  isHeld(a: Action) { return this.held.has(a); }
  consumeMouseDelta() { const d = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel }; this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0; return d; }
}

/** Glyph text for prompts, switching with the last-used device. */
export function glyph(action: string, device: 'kbm' | 'pad'): string {
  const k: Record<string, [string, string]> = {
    interact: ['E', 'A'], cancel: ['Esc', 'B'], melee: ['F', 'X'], fire: ['R / LMB', 'RT'], dodge: ['Space', 'B'], jump: ['Space', 'A'],
    crouch: ['C', 'LB'], mimic: ['M', 'RB'], scan: ['Q', 'Y'], holoband: ['Tab', 'View'], move: ['WASD', 'L-Stick'], aim: ['Mouse', 'R-Stick'],
    save: ['F5', '—'], load: ['F9', '—'], directives: ['H', 'R3'], tabs: ['← / →', 'LB / RB'], rotate: ['Drag', 'R-Stick'], zoom: ['Wheel', 'LT / RT'],
  };
  const v = k[action];
  return v ? (device === 'pad' ? v[1] : v[0]) : action;
}
