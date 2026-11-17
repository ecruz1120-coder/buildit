import type { Game } from '../game';

const root = () => document.getElementById('terminal')!;

/**
 * First-person terminal intrusion (P003-A analogue).
 * Stop the sweeping cursor inside the signal window three times. Two misses = lockout.
 */
export class Terminal {
  open = false;
  private hits = 0; private misses = 0; private pos = 0; private dir = 1; private speed = 0.7;
  private zone = { a: 0.4, w: 0.18 };
  private done = false;
  private log: string[] = [];
  private onDone: ((ok: boolean | null) => void) | null = null;
  private wait = 0;

  constructor(private g: Game) {}

  start(onDone: (ok: boolean | null) => void) {
    this.open = true; this.onDone = onDone; this.done = false;
    this.hits = 0; this.misses = 0; this.pos = 0; this.dir = 1; this.speed = 0.65; this.wait = 0.3;
    this.log = ['ASHE//TERMINAL  v3.12  ·  SESSION LOCKED', 'Bypassing auth handshake... sync the carrier to the signal window.', ''];
    this.newZone();
    root().classList.remove('hidden');
    this.render();
  }

  private newZone() {
    const wide = this.g.state.progress.skills.includes('signal_sense') ? 1.4 : 1;
    const w = (0.2 - this.hits * 0.035) * wide;
    this.zone = { a: 0.1 + this.g.roll(`hackzone${this.hits}${this.misses}`) * (0.8 - w), w };
  }

  private render() {
    const r = root();
    r.innerHTML = `<div class="scr">${this.log.join('\n')}</div>
      <div class="meter"><div class="zone" style="left:${this.zone.a * 100}%;width:${this.zone.w * 100}%"></div><div class="cursor" style="left:${this.pos * 100}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>SYNC ${'■'.repeat(this.hits)}${'□'.repeat(3 - this.hits)}</span><span>FAULTS ${'✕'.repeat(this.misses)}${'·'.repeat(2 - this.misses)}</span><span>${this.g.hud.k('interact')}SYNC &nbsp; ${this.g.hud.k('cancel')}ABORT</span></div>`;
  }

  update(dt: number) {
    if (!this.open) return;
    if (this.done) { this.wait -= dt; if (this.wait <= 0) this.finish(); return; }
    this.wait -= dt;
    this.pos += this.dir * this.speed * dt;
    if (this.pos > 1) { this.pos = 1; this.dir = -1; }
    if (this.pos < 0) { this.pos = 0; this.dir = 1; }
    const c = root().querySelector('.cursor') as HTMLElement | null;
    if (c) c.style.left = `${this.pos * 100}%`;
    const inp = this.g.input;
    if (this.wait <= 0 && (inp.pressed('interact') || inp.pressed('jump'))) {
      const inZone = this.pos >= this.zone.a && this.pos <= this.zone.a + this.zone.w;
      if (inZone) { this.hits++; this.log.push(`> carrier sync ${this.hits}/3 ... OK`); this.speed += 0.22; }
      else { this.misses++; this.log.push(`> carrier fault ${this.misses}/2 ... intrusion countermeasures rising`); }
      if (this.hits >= 3) { this.log.push('', 'ACCESS GRANTED. Tracker log found: ANON BEACON — hourly pings.', 'Last three pings: COURTYARD SECTOR S-4.'); this.done = true; this.wait = 2.2; }
      else if (this.misses >= 2) { this.log.push('', 'INTRUSION DETECTED — TERMINAL LOCKED.', 'Remote alert raised. (Sweep clock halved.)'); this.done = true; this.wait = 2.2; }
      else this.newZone();
      this.render();
    } else if (inp.pressed('cancel')) {
      this.open = false; root().classList.add('hidden'); this.onDone?.(null);
    }
  }

  private finish() {
    this.open = false;
    root().classList.add('hidden');
    this.onDone?.(this.hits >= 3);
  }
}
