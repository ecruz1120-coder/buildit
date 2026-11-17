import { CONTENT, type DlgNode, type DlgOption } from '../content';
import { Nav, el, esc } from './nav';
import type { Game } from '../game';

const box = () => document.getElementById('dialogue')!;

/** Branching dialogue with requirement gating, Quantum Art options and one-shot effects. */
export class DialogueUI {
  nav = new Nav(box);
  open = false;
  private node: DlgNode | null = null;
  private nodeId = '';
  private onEnd: (() => void) | null = null;

  constructor(private g: Game) {}

  start(nodeId: string, onEnd?: () => void) {
    this.open = true;
    this.onEnd = onEnd ?? null;
    box().classList.remove('hidden');
    this.goto(nodeId);
  }

  private resolve(id: string): string {
    if (id === '@pim_roll') return this.g.roll('pim_witness_or_letter') < 0.5 ? 'p_witness' : 'p_letter';
    return id;
  }

  goto(rawId: string) {
    const id = this.resolve(rawId);
    const node = CONTENT.dialogues[id];
    if (!node) { this.close(); return; }
    this.node = node; this.nodeId = id;
    if (node.effects) this.g.applyEffects(node.effects, `node:${id}`);
    this.render();
  }

  private optionState(o: DlgOption): { ok: boolean; reason?: string } {
    const r = o.requires;
    const s = this.g.state;
    if (r?.trustAtLeast) for (const [k, v] of Object.entries(r.trustAtLeast)) if ((s.trust[k] ?? 0) < v) return { ok: false, reason: o.lockedLabel ?? `[Trust ${v}]` };
    if (r?.flags) for (const [k, v] of Object.entries(r.flags)) if (s.flags[k] !== v) return { ok: false, reason: o.lockedLabel ?? '[Locked]' };
    if (r?.evidence) for (const e of r.evidence) if (!s.evidence.includes(e)) return { ok: false, reason: o.lockedLabel ?? '[Needs evidence]' };
    if (o.art) { const a = this.g.artCheck(o.art); if (!a.ok) return { ok: false, reason: a.reason }; }
    return { ok: true };
  }

  private render() {
    const n = this.node!;
    const npc = CONTENT.npcs[n.speaker];
    const b = box();
    b.innerHTML = '';
    const portrait = el('div', 'portrait');
    const look = npc?.look;
    if (look) portrait.innerHTML = `<div style="position:absolute;left:17px;top:14px;width:40px;height:44px;background:${look.skin}"></div>
      <div style="position:absolute;left:15px;top:8px;width:44px;height:12px;background:${look.hair}"></div>
      <div style="position:absolute;left:25px;top:30px;width:6px;height:5px;background:#f0f0e0"></div><div style="position:absolute;left:43px;top:30px;width:6px;height:5px;background:#f0f0e0"></div>
      ${look.mask ? '<div style="position:absolute;left:17px;top:40px;width:40px;height:12px;background:#2a2d33"></div>' : ''}
      <div style="position:absolute;left:8px;top:60px;width:58px;height:40px;background:${look.coat}"></div>`;
    const right = el('div');
    right.append(el('div', 'who', esc(npc?.name ?? (n.speaker === 'notice' ? 'Kaelis Row Sim — Fixture' : n.speaker))), el('div', 'role', esc(npc?.role ?? '')), el('div', 'text', esc(n.text)));
    const opts = el('div', 'opts');
    n.options.forEach((o) => {
      const st = this.optionState(o);
      let label = esc(o.text);
      if (o.art) label = `<span class="art">[QUANTUM ART · ${o.art.toUpperCase()} · ${this.g.artCost(o.art)} CST]</span> ${label}`;
      if (!st.ok) label = `<span class="req">${esc(st.reason ?? '[Locked]')}</span> ${label}`;
      const btn = el('button', `nav ${st.ok ? '' : 'disabled'}`, label);
      btn.addEventListener('click', () => { if (st.ok) this.choose(o); });
      opts.append(btn);
    });
    right.append(opts);
    b.append(portrait, right);
    this.nav.reset();
    this.nav.bindHover();
  }

  private choose(o: DlgOption) {
    const idx = this.node!.options.indexOf(o);
    if (o.art) this.g.useArt(o.art);
    if (o.effects) this.g.applyEffects(o.effects, `opt:${this.nodeId}:${idx}`);
    this.g.markDirective('talk');
    if (o.action) this.g.pendingAction = o.action;
    if (o.end || !o.next) this.close();
    else this.goto(o.next);
  }

  close() {
    this.open = false;
    box().classList.add('hidden');
    const cb = this.onEnd; this.onEnd = null;
    cb?.();
    this.g.onDialogueClosed();
  }

  update() {
    if (!this.open) return;
    this.nav.update(this.g.input);
  }
}
