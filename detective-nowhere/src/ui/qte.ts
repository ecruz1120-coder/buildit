import type { Game } from '../game';
import { glyph } from '../input/input';

const root = () => document.getElementById('qte')!;

/** Dodge QTE (P012 rule): react in time or reload the checkpoint. */
export class Qte {
  open = false;
  private t = 0; private dur = 0.9;
  private cb: ((ok: boolean) => void) | null = null;
  private grace = 0.12;
  constructor(private g: Game) {}
  start(label: string, cb: (ok: boolean) => void) {
    this.open = true; this.cb = cb; this.t = 0; this.grace = 0.12;
    this.dur = this.g.state.progress.skills.includes('quick_reflex') ? 1.35 : 0.9;
    const r = root();
    r.classList.remove('hidden');
    r.innerHTML = `<div class="ring"><div class="shrink"></div>${label}<span class="k">${glyph('dodge', this.g.input.device)}</span></div>`;
  }
  update(dt: number) {
    if (!this.open) return;
    this.t += dt;
    this.grace -= dt;
    const s = root().querySelector('.shrink') as HTMLElement;
    const f = Math.max(0, 1 - this.t / this.dur);
    if (s) s.style.inset = `${-60 * f}px`;
    if (this.grace <= 0 && this.g.input.pressed('dodge')) return this.end(true);
    if (this.grace <= 0 && (this.g.input.pressed('interact') || this.g.input.pressed('melee') || this.g.input.pressed('fire'))) return this.end(false);
    if (this.t >= this.dur) this.end(false);
  }
  private end(ok: boolean) {
    this.open = false;
    root().classList.add('hidden');
    const cb = this.cb; this.cb = null; cb?.(ok);
  }
}
