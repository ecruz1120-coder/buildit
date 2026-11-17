import type { Input } from '../input/input';

/**
 * Generic controller/keyboard focus navigation over `.nav` elements inside a container.
 * D-pad / stick / arrows move focus, A / E / Enter clicks. Mouse hover syncs focus.
 */
export class Nav {
  idx = 0;
  constructor(private root: () => HTMLElement | null) {}
  items(): HTMLElement[] {
    const r = this.root();
    if (!r) return [];
    return Array.from(r.querySelectorAll<HTMLElement>('.nav')).filter((e) => e.offsetParent !== null && !e.classList.contains('disabled'));
  }
  reset() { this.idx = 0; this.paint(false); }
  paint(scroll = true) {
    const it = this.items();
    if (this.idx >= it.length) this.idx = Math.max(0, it.length - 1);
    const r = this.root();
    r?.querySelectorAll('.nav.focus').forEach((e) => e.classList.remove('focus'));
    const el = it[this.idx];
    if (el) { el.classList.add('focus'); if (scroll) el.scrollIntoView({ block: 'nearest' }); }
  }
  bindHover() {
    const it = this.items();
    it.forEach((el, i) => el.addEventListener('mouseenter', () => { this.idx = i; this.paint(); }));
  }
  /** Returns true if it consumed a click. */
  update(input: Input, opts: { horizontal?: boolean } = {}): boolean {
    const it = this.items();
    if (!it.length) return false;
    const prevK = opts.horizontal ? 'left' : 'up';
    const nextK = opts.horizontal ? 'right' : 'down';
    if (input.pressed(prevK) || (!opts.horizontal && input.pressed('left') && false)) { this.idx = (this.idx - 1 + it.length) % it.length; this.paint(); }
    if (input.pressed(nextK)) { this.idx = (this.idx + 1) % it.length; this.paint(); }
    if (input.pressed('interact')) { this.paint(); it[this.idx]?.click(); return true; }
    return false;
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function esc(s: string) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)); }
