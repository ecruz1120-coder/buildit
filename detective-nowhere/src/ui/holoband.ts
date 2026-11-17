import { CONTENT } from '../content';
import { NODES, NODE_THRESHOLDS, SKILLS, canBuy, gpAvailable, gpEarned, nodeLevel, rank } from '../player/progression';
import { AREAS, FLOORS, W, H } from '../world/maps';
import { Nav, esc } from './nav';
import { PlanetMap } from './planetmap';
import type { Game } from '../game';

const root = () => document.getElementById('holoband')!;
const TABS = ['CASE', 'EVIDENCE', 'MAP', 'ITEMS', 'CONTACTS', 'NODES', 'SKILLS', 'REPORT', 'SYSTEM'] as const;
type Tab = (typeof TABS)[number];
const SCALES = ['INTERIOR', '300 M', '1 KM', 'CITY', 'PLANET'];

/** HoloBand wrist menu (Bible §13 screens 08–15). Opening pauses the world. */
export class HoloBand {
  open = false;
  tab: Tab = 'CASE';
  nav = new Nav(() => root().querySelector('.body') as HTMLElement);
  scale = 0;
  private selEvidence = '';
  private answers: Record<string, { a: number; e: string }> = {};
  private lastTab = '';

  readonly planet: PlanetMap;
  constructor(private g: Game) { this.planet = new PlanetMap(g); }

  show(tab?: Tab) {
    this.open = true;
    if (tab) this.tab = tab;
    root().classList.remove('hidden');
    this.g.markDirective('holoband');
    this.render();
  }
  showPlanet() { this.tab = 'MAP'; this.scale = 4; this.show('MAP'); }
  close() { this.open = false; this.lastTab = ''; this.planet.unmount(); root().classList.add('hidden'); root().innerHTML = ''; }

  private setTab(t: Tab) { this.tab = t; if (t === 'MAP') this.g.markDirective('map'); this.render(); }

  render() {
    const r = root();
    const k = (a: string) => this.g.hud.k(a);
    if (!r.querySelector('.frame')) {
      r.innerHTML = `<div class="frame"><div class="tabs">${TABS.map((t) => `<div data-t="${t}">${t}</div>`).join('')}</div><div class="body"></div><div class="foot"></div></div>`;
      r.querySelectorAll<HTMLElement>('.tabs div').forEach((d) => d.addEventListener('click', () => this.setTab(d.dataset.t as Tab)));
    }
    r.querySelectorAll<HTMLElement>('.tabs div').forEach((d) => d.classList.toggle('on', d.dataset.t === this.tab));
    (r.querySelector('.foot') as HTMLElement).innerHTML = `<span>HOLOBAND · ${esc(CONTENT.case_id)} · CEDRIC FARSIGHT</span><span>${k('tabs')}tabs &nbsp; ${k('move')}select &nbsp; ${k('interact')}confirm &nbsp; ${k('cancel')}close</span>`;
    const old = r.querySelector('.body') as HTMLElement;
    const body = old.cloneNode(false) as HTMLElement; // fresh node: drops old listeners
    if (this.lastTab === this.tab) body.style.animation = 'none'; else body.style.animation = '';
    old.replaceWith(body);
    this.lastTab = this.tab;
    body.innerHTML = this.renderTab();
    this.wire(body);
    this.nav.reset();
    this.nav.bindHover();
  }

  private renderTab(): string {
    const s = this.g.state;
    switch (this.tab) {
      case 'CASE': {
        const piv = CONTENT.pivots.map((p) => {
          const taken = s.choices[p.id] ?? [];
          return `<div class="pivot ${taken.length ? 'visited' : ''}"><b>${p.id} · ${esc(p.title)}</b> <span class="muted">— ${esc(p.location)} · mirrors ${esc(p.mirrors)}</span>
            ${p.choices.map((c) => `<div class="ch ${taken.includes(c.key) ? 'taken' : ''}">${taken.includes(c.key) ? '■' : '□'} ${c.key} — ${esc(c.description)}</div>`).join('')}
            <div class="ch amber" style="font-size:11px">${esc(p.mandatory_rule)}</div></div>`;
        }).join('');
        return `<div class="cols"><div><h3>CASE ${esc(CONTENT.case_id)}</h3>
          <div class="card"><div class="kind">BRIEFING</div>${CONTENT.briefing.map(esc).join('<br/>')}</div>
          <h5>JOURNAL</h5><div class="card" style="max-height:200px;overflow:auto">${s.journal.slice().reverse().map((j) => `· ${esc(j)}`).join('<br/>')}</div>
          <h5>PERMANENT LOCKS</h5><div class="card">${s.locks.length ? s.locks.map((l) => `<div class="amber">⊘ ${esc(l)}</div>`).join('') : '<span class="muted">None yet. Some choices close doors for good.</span>'}</div></div>
          <div><h3>MISSION GRAPH</h3>${piv}</div></div>`;
      }
      case 'EVIDENCE': {
        if (!s.evidence.length) return '<h3>EVIDENCE</h3><p class="muted">No evidence collected. Talk to witnesses, search rooms, inspect objects.</p>';
        if (!this.selEvidence || !s.evidence.includes(this.selEvidence)) this.selEvidence = s.evidence[0];
        const ev = CONTENT.evidence[this.selEvidence];
        const det = ev.detail && s.details.includes(ev.detail.id);
        return `<div class="cols"><div class="list">${s.evidence.map((id) => `<button class="nav" data-ev="${id}">${id === this.selEvidence ? '▸ ' : ''}${esc(CONTENT.evidence[id].name)} <span class="muted">· ${CONTENT.evidence[id].kind}</span></button>`).join('')}</div>
          <div><div class="card"><div class="kind">${esc(ev.kind.toUpperCase())}</div><h3 style="margin-top:4px">${esc(ev.name)}</h3><p>${esc(ev.desc)}</p>
          ${ev.detail ? (det ? `<p class="ok">■ ${esc(ev.detail.label)}: ${esc(ev.detail.text)}</p>` : '<p class="amber">◇ Unexamined detail — open the inspector.</p>') : ''}</div>
          <p><button class="nav" data-inspect="${this.selEvidence}">INSPECT CLOSE-UP</button></p></div></div>`;
      }
      case 'MAP': {
        return `<h3>MAP</h3><div class="scales">${SCALES.map((n, i) => `<button class="nav ${i === this.scale ? 'on' : ''}" data-scale="${i}">${n}</button>`).join('')}</div>
          ${this.scale === 4 ? this.planet.html() : `<div id="mapwrap">${this.scale <= 1 ? '<canvas class="map" width="560" height="440"></canvas>' : `<div class="card" style="max-width:560px"><div class="kind">KNOWLEDGE GATED</div><p>No survey data for the ${SCALES[this.scale]} scale in this simulation.</p><p class="muted">In the full game, scales unlock by learning the city: terminals, transit maps, conversations (P001-B). The map never shows what Cedric hasn't learned.</p></div>`}</div>
          <p class="muted" style="font-size:12px">Rooms appear once visited or described to you. ◆ marks locations you have a lead on.</p>`}`;
      }
      case 'ITEMS':
        return `<h3>INVENTORY</h3><div class="list">${s.inventory.map((i) => `<div class="card"><b>${esc(CONTENT.items[i]?.name ?? i)}</b>${i === 'pistol' ? ` <span class="muted">· ${s.player.ammo} rounds</span>` : ''}<br/><span class="muted">${esc(CONTENT.items[i]?.desc ?? '')}</span></div>`).join('')}</div>
          <h5>MIMIC PROFILES</h5><div class="card">${s.mimicProfiles.length ? s.mimicProfiles.map((p) => esc(CONTENT.npcs[p]?.name ?? p)).join(', ') : '<span class="muted">None. Subdue a target (not in an open firefight) and scan them with the Mimic Device.</span>'}</div>`;
      case 'CONTACTS':
        return `<h3>CONTACTS</h3>${s.contacts.length ? s.contacts.map((c) => { const n = CONTENT.npcs[c]; return `<div class="card" style="margin-bottom:6px"><b>${esc(n.name)}</b> <span class="muted">· ${esc(n.role)}</span>${c === 'tamsin' ? `<br/>Trust: ${'■'.repeat(Math.max(0, s.trust.tamsin))}${'□'.repeat(Math.max(0, 3 - s.trust.tamsin))}` : ''}</div>`; }).join('') : '<p class="muted">No contacts yet.</p>'}`;
      case 'NODES': {
        const p = s.progress;
        return `<h3>QUANTUM NODES</h3><p class="muted">XP splits 70% primary / 30% secondary node. GP = 3 per 10 XP (cumulative). Node cap ${10}. Values are tuning placeholders pending handbook numbers.</p>
          ${NODES.map((n) => { const xp = p.nodeXP[n]; const lv = nodeLevel(xp); const a = NODE_THRESHOLDS[lv], b = NODE_THRESHOLDS[Math.min(10, lv + 1)]; const f = lv >= 10 ? 1 : (xp - a) / (b - a);
            return `<div class="node"><b>${n}</b><div class="bar"><i style="width:${f * 100}%"></i></div><span>LV ${lv} <span class="muted">${Math.floor(xp)}</span></span></div>`; }).join('')}
          <div class="card" style="margin-top:14px">RANK <b>${rank(p)}</b> / 20 &nbsp;·&nbsp; TOTAL XP ${p.totalXP} &nbsp;·&nbsp; GP earned ${gpEarned(p)} / spent ${p.gpSpent} / available <b>${gpAvailable(p)}</b> &nbsp;·&nbsp; CST ${Math.floor(s.player.cst)}/${this.g.cstMax()}</div>
          <h5>XP LOG</h5><div class="card" style="max-height:160px;overflow:auto;font-size:12px">${s.stats.xpLog.slice().reverse().map((x) => `+${x.amount} ${esc(x.label)}`).join('<br/>') || '<span class="muted">—</span>'}</div>`;
      }
      case 'SKILLS': {
        const p = s.progress;
        const trees = ['Investigator', 'Infiltrator', 'Combatant', 'Quantum Adept'];
        return `<h3>SKILL TREES</h3><p class="muted">GP available: <b class="ok">${gpAvailable(p)}</b>. No classes — any tree, any order.</p><div class="trees">${trees.map((t) => `<div class="tree"><h5>${t}</h5>${SKILLS.filter((k) => k.tree === t).map((k) => {
          const own = p.skills.includes(k.id); const c = canBuy(p, k.id);
          return `<button class="nav ${own ? 'own' : ''} ${!own && !c.ok ? 'disabled' : ''}" data-skill="${k.id}"><b>${esc(k.name)}</b> · ${own ? 'OWNED' : `${k.cost} GP`}<br/><span class="muted">${esc(k.desc)}</span>${!own && !c.ok ? `<br/><span class="amber">${esc(c.reason ?? '')}</span>` : ''}</button>`;
        }).join('')}</div>`).join('')}</div>`;
      }
      case 'REPORT': {
        if (s.flags.report_done) return '<h3>CASE REPORT</h3><p class="ok">Submitted. See results.</p><button class="nav" data-results="1">VIEW RESULTS</button>';
        const xref = s.progress.skills.includes('cross_ref');
        return `<h3>CASE REPORT — DEDUCTION</h3><p class="muted">Answer each question and attach the evidence that proves it. A right answer with no admissible evidence is only a hunch.${!s.flags.corin_rescued ? ' <span class="amber">Corin has not been found — you may submit early, but the case will be graded as-is.</span>' : ''}</p>
          ${CONTENT.deduction.map((q) => { const cur = this.answers[q.id] ?? { a: -1, e: '' };
            return `<div class="q card"><b>${esc(q.question)}</b>
            <div class="list" style="margin-top:6px">${q.answers.map((a, i) => `<button class="nav" data-q="${q.id}" data-a="${i}">${cur.a === i ? '◉' : '○'} ${esc(a)}</button>`).join('')}</div>
            <div style="margin-top:6px" class="muted">Evidence: ${s.evidence.length ? '' : 'none collected'}</div>
            <div class="list">${s.evidence.map((e) => `<button class="nav" data-q="${q.id}" data-e="${e}">${cur.e === e ? '◉' : '○'} ${esc(CONTENT.evidence[e].name)}${xref && q.support.includes(e) ? ' <span class="ok">· relevant</span>' : ''}</button>`).join('')}</div></div>`; }).join('')}
          <button class="nav" data-submit="1">SUBMIT CASE REPORT</button>`;
      }
      case 'SYSTEM':
        return `<h3>SYSTEM</h3><div class="list" style="max-width:420px">
          <button class="nav" data-sys="save">QUICK SAVE (F5)</button>
          <button class="nav" data-sys="load">QUICK LOAD (F9)</button>
          <button class="nav" data-sys="checkpoint">RELOAD LAST CHECKPOINT</button>
          <button class="nav" data-sys="pixel">PIXEL SCALE: ${this.g.pixel.pixelScale}x (toggle)</button>
          <button class="nav" data-sys="restart">RESTART SIMULATION (NEW SEED)</button>
          <button class="nav" data-sys="title">QUIT TO TITLE</button></div>
          <h5>RUN</h5><div class="card">Seed <b>${s.seed}</b> · Pim roll: <b>${this.g.roll('pim_witness_or_letter') < 0.5 ? 'witness statement' : "Corin's note"}</b> (seeded 50/50, stable per seed)</div>
          <h5>CONTROLS</h5><div class="card" style="font-size:12px;line-height:1.8">
          Move WASD / L-Stick · Interact E / A · Sneak C / LB · Scalpel F / X · Fire R or LMB / RT (aim mouse / R-Stick) · Dodge Space / B<br/>
          Scan Q / Y · HoloBand Tab / View · Mimic M / RB · Directives H / R3 · Save F5 · Load F9 · Back Esc / B</div>`;
    }
  }

  private wire(body: HTMLElement) {
    body.querySelectorAll<HTMLElement>('[data-ev]').forEach((b) => b.addEventListener('click', () => { this.selEvidence = b.dataset.ev!; this.render(); }));
    body.querySelectorAll<HTMLElement>('[data-inspect]').forEach((b) => b.addEventListener('click', () => this.g.openInspector(b.dataset.inspect!, true)));
    body.querySelectorAll<HTMLElement>('[data-scale]').forEach((b) => b.addEventListener('click', () => { this.scale = Number(b.dataset.scale); this.render(); }));
    body.querySelectorAll<HTMLElement>('[data-skill]').forEach((b) => b.addEventListener('click', () => { this.g.buySkill(b.dataset.skill!); this.render(); }));
    body.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => b.addEventListener('click', () => { const q = b.dataset.q!; this.answers[q] = { ...(this.answers[q] ?? { e: '' }), a: Number(b.dataset.a) }; this.keepFocus(() => this.render()); }));
    body.querySelectorAll<HTMLElement>('[data-e]').forEach((b) => b.addEventListener('click', () => { const q = b.dataset.q!; this.answers[q] = { ...(this.answers[q] ?? { a: -1 }), e: b.dataset.e! }; this.keepFocus(() => this.render()); }));
    body.querySelector<HTMLElement>('[data-submit]')?.addEventListener('click', () => this.g.submitReport(this.answers));
    body.querySelector<HTMLElement>('[data-results]')?.addEventListener('click', () => this.g.showResults());
    body.querySelectorAll<HTMLElement>('[data-sys]').forEach((b) => b.addEventListener('click', () => this.g.system(b.dataset.sys!)));
    this.planet.unmount();
    if (this.tab === 'MAP' && this.scale === 4) this.planet.mount(body);
    const c = body.querySelector('canvas.map') as HTMLCanvasElement | null;
    if (c) this.drawMap(c);
  }

  private keepFocus(fn: () => void) {
    const i = this.nav.idx; const top = (root().querySelector('.body') as HTMLElement).scrollTop;
    fn();
    this.nav.idx = i; this.nav.paint();
    (root().querySelector('.body') as HTMLElement).scrollTop = top;
  }

  private drawMap(c: HTMLCanvasElement) {
    const x = c.getContext('2d')!;
    const s = this.g.state;
    const floor = this.scale === 0 ? this.g.player.floor : 0;
    const map = FLOORS[floor];
    const cell = this.scale === 0 ? 20 : 16;
    const rows = this.scale === 0 && floor === 1 ? 14 : this.scale === 0 && this.g.player.pos.z < 13.5 ? 14 : H;
    const z0 = this.scale === 0 && this.g.player.pos.z >= 13.5 && floor === 0 ? 13 : 0;
    x.fillStyle = '#07131c'; x.fillRect(0, 0, c.width, c.height);
    const ox = (c.width - W * cell) / 2, oz = 10;
    const known = (tx: number, tz: number) => AREAS.some((a) => a.floor === floor && s.knownAreas.includes(a.id) && tx >= a.x0 - 1 && tx <= a.x1 && tz >= a.z0 - 1 && tz <= a.z1);
    for (let z = z0; z < Math.min(H, z0 + (this.scale === 0 ? rows : H)); z++) for (let tx = 0; tx < W; tx++) {
      const ch = map[z][tx];
      if (ch === ' ') continue;
      const px = ox + tx * cell, pz = oz + (z - z0) * cell;
      const k = this.scale === 1 ? true : known(tx, z);
      if (!k) { x.fillStyle = '#0c1a24'; x.fillRect(px, pz, cell - 1, cell - 1); continue; }
      x.fillStyle = ch === '#' || ch === 'W' || ch === 'E' ? '#2a8a99' : ch === 'f' || ch === 'g' ? '#1f5a66' : ch === 'L' || ch === 'G' ? '#f0b44a' : ch === 'S' ? '#4a6a7a' : ch === '"' ? '#123a30' : '#10303a';
      x.fillRect(px, pz, cell - 1, cell - 1);
    }
    const mark = (wx: number, wz: number, col: string, label: string) => {
      const px = ox + wx * cell, pz = oz + (wz - z0) * cell;
      x.fillStyle = col; x.beginPath(); x.arc(px, pz, cell * 0.32, 0, Math.PI * 2); x.fill();
      x.font = '11px monospace'; x.fillText(label, px + 8, pz - 6);
    };
    if (this.scale === 1 || floor === this.g.player.floor) mark(this.g.player.pos.x, this.g.player.pos.z, '#e8e2d0', 'CEDRIC');
    if (s.flags.know_shed && floor === 0) { x.fillStyle = '#6fd3e0'; x.font = '18px monospace'; x.fillText('◆', ox + 17.2 * cell, oz + (22 - z0) * cell); x.font = '11px monospace'; x.fillText('S-4 SHED', ox + 15 * cell, oz + (25 - z0) * cell + 4); }
    for (const id of s.contacts) {
      const n = this.g.npcs.get(id);
      if (n && n.floor === floor && n.h.root.visible) mark(n.pos.x, n.pos.z, '#6fe08a', CONTENT.npcs[id].name.split(' ').slice(-1)[0].toUpperCase());
    }
    x.fillStyle = '#6fd3e0'; x.font = '12px monospace';
    x.fillText(this.scale === 0 ? `INTERIOR · ${floor === 0 ? 'GROUND' : 'FLOOR 2'}` : '300 M · KAELIS ROW SIM BLOCK', 10, c.height - 10);
  }

  update(dt = 0) {
    if (this.tab === 'MAP' && this.scale === 4) this.planet.update(dt);
    if (!this.open) return;
    const inp = this.g.input;
    if (inp.pressed('tabPrev') || inp.pressed('tabNext')) {
      const i = TABS.indexOf(this.tab);
      this.setTab(TABS[(i + (inp.pressed('tabNext') ? 1 : TABS.length - 1)) % TABS.length]);
      return;
    }
    if (inp.pressed('cancel') || inp.pressed('holoband')) { this.g.closeHoloBand(); return; }
    this.nav.update(inp);
  }
}
