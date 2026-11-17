import { CONTENT } from '../content';
import { glyph } from '../input/input';
import { formatClock } from '../core/clock';
import { rank, gpAvailable } from '../player/progression';
import { areaAt } from '../world/maps';
import { el, esc } from './nav';
import type { Game } from '../game';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  collapsed = false;
  constructor(private g: Game) {}
  show(on: boolean) { $('hud').classList.toggle('hidden', !on); }

  toast(msg: string, kind: '' | 'warn' | 'lock' | 'xp' = '', sub = '') {
    const t = el('div', `toast ${kind}`, esc(msg) + (sub ? `<small>${esc(sub)}</small>` : ''));
    const box = $('toasts');
    box.prepend(t);
    while (box.children.length > 6) box.lastChild!.remove();
    setTimeout(() => t.remove(), kind === 'lock' ? 7000 : 4200);
  }

  prompt(html: string) { const p = $('prompt'); if (p.innerHTML !== html) p.innerHTML = html; }
  k(action: string) { return `<span class="k">${glyph(action, this.g.input.device)}</span>`; }

  progress(frac: number | null, label = '') {
    const p = $('progressbar');
    p.classList.toggle('hidden', frac === null);
    if (frac !== null) { (p.querySelector('.fill') as HTMLElement).style.width = `${frac * 100}%`; p.querySelector('span')!.textContent = label; }
  }

  update() {
    const s = this.g.state;
    const a = areaAt(this.g.player.floor, this.g.player.pos.x, this.g.player.pos.z);
    $('loc').textContent = `${a ? a.name : 'Kaelis Row Sim'} · ${this.g.player.floor === 0 ? 'Ground' : 'Floor 2'}`;
    $('clock').textContent = formatClock(s.clock);
    const sw = $('sweep');
    const armed = s.sweep.phase === 'armed';
    sw.classList.toggle('hidden', !armed && s.sweep.phase !== 'active');
    if (armed) {
      const r = Math.max(0, s.sweep.remaining);
      sw.textContent = `SWEEP CLOCK ${Math.floor(r / 60)}:${String(Math.floor(r % 60)).padStart(2, '0')}`;
      sw.classList.toggle('calm', r > 60);
    } else if (s.sweep.phase === 'active') { sw.textContent = 'SWEEP CREW ON FLOOR 2'; sw.classList.remove('calm'); }

    // Directives checklist
    const done = new Set(s.directives);
    const dirs = $('directives');
    const pending = CONTENT.directives.filter((d) => !done.has(d.id));
    const shown = this.collapsed ? CONTENT.directives : pending.slice(0, 5);
    const list = shown.map((d) => `<div class="d ${done.has(d.id) ? 'done' : ''}">${esc(d.label)}</div>`).join('') + (!this.collapsed && pending.length > 5 ? `<div class="muted">+${pending.length - 5} more · ${this.k('directives')}show all</div>` : '');
    const html = `<h4><span>TRAINING DIRECTIVES</span><span>${done.size}/${CONTENT.directives.length} ${this.k('directives')}</span></h4><div class="list">${list}</div>`;
    if (dirs.innerHTML !== html) dirs.innerHTML = html;
    

    // Status
    const p = this.g.player;
    const cstMax = this.g.cstMax();
    const pips = Array.from({ length: cstMax }, (_, i) => `<span class="pip ${i < Math.floor(s.player.cst) ? 'on' : ''}"></span>`).join('');
    const st = `
      <div class="row"><span>HP</span><div class="bar hp"><i style="transform:scaleX(${s.player.hp / 100})"></i></div><span>${Math.ceil(s.player.hp)}</span></div>
      <div class="row"><span>CST</span><span>${pips}</span></div>
      <div class="row"><span>RANK ${rank(s.progress)}</span><span class="muted">GP ${gpAvailable(s.progress)}</span>${s.inventory.includes('pistol') ? `<span class="muted">· AMMO ${s.player.ammo}</span>` : ''}</div>
      <div class="row">${s.player.disguise ? `<span class="tag">MIMIC: ${esc(CONTENT.npcs[s.player.disguise]?.name ?? s.player.disguise)}</span>` : '<span class="muted">MIMIC: none</span>'}${p.crouch ? '<span class="tag">· SNEAKING</span>' : ''}${p.hidden ? '<span class="tag">· HIDDEN</span>' : ''}</div>`;
    if ($('status').innerHTML !== st) $('status').innerHTML = st;

    const hints = [
      `${this.k('move')}move`, `${this.k('interact')}interact`, `${this.k('crouch')}sneak`, `${this.k('scan')}scan`, `${this.k('holoband')}HoloBand`,
      `${this.k('melee')}scalpel`, `${this.k('fire')}fire`, `${this.k('dodge')}dodge`, `${this.k('mimic')}mimic`,
      this.g.input.device === 'kbm' ? `${this.k('save')}save ${this.k('load')}load` : '',
    ].filter(Boolean).join('<br/>');
    if ($('hints').innerHTML !== hints) $('hints').innerHTML = hints;
  }
}
