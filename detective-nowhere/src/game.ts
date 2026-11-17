import * as THREE from 'three';
import { CONTENT, type Effects } from './content';
import { PixelRenderer } from './render/pixel';
import { Input } from './input/input';
import { Level, DOORS } from './world/level';
import { FLOOR_HEIGHT, areaAt } from './world/maps';
import { PlayerActor, NpcActor } from './world/actors';
import { advanceClock, at, clockAbs } from './core/clock';
import { seededRoll } from './core/rng';
import { newGame, cloneState, saveGame, loadGame, saveCheckpoint, loadCheckpoint, type GameState, type NpcState } from './core/state';
import { awardXP, buySkill as buy, canBuy, nodeLevel, rank, SKILLS, type NodeName } from './player/progression';
import { Hud } from './ui/hud';
import { DialogueUI } from './ui/dialogue';
import { HoloBand } from './ui/holoband';
import { Inspector } from './ui/inspector';
import { Terminal } from './ui/terminal';
import { Qte } from './ui/qte';
import { ChaseMode } from './modes/chase';
import { Nav, esc } from './ui/nav';
import { box } from './render/props';

type Mode = 'title' | 'play' | 'dialogue' | 'menu' | 'inspect' | 'hack' | 'qte' | 'chase' | 'transition' | 'over';

interface Interactable { id: string; floor: number; x: number; z: number; r?: number; clue?: boolean; label: () => string | null; act: () => void; }
interface Bullet { mesh: THREE.Mesh; x: number; z: number; vx: number; vz: number; floor: number; from: 'player' | 'npc'; life: number; }

const ISO_DIR = new THREE.Vector3(1, 0.95, 1).normalize();
const TOP_DIR = new THREE.Vector3(0.0, 1, 0.02).normalize();
const ISO_UP = new THREE.Vector3(-1, 1.4, -1).normalize();
const TOP_UP = new THREE.Vector3(0, 0, -1);
const OPS = ['op_b1', 'op_b2'];
const OP_PATHS: Record<string, [number, number][]> = {
  op_b1: [[9.5, 5.5], [9.5, 6.6], [4.5, 6.6], [4.5, 8.5], [4.5, 9.7], [3.2, 11.9]],
  op_b2: [[9.5, 4.5], [9.5, 5.5], [9.5, 6.9], [5.2, 6.9], [4.5, 8.5], [5.0, 9.9], [5.4, 11.3]],
};
const OP_LOOK: Record<string, number[]> = { op_b1: [-Math.PI / 2, Math.PI, 0.3], op_b2: [Math.PI, -Math.PI / 2, Math.PI / 2] };

export class Game {
  readonly pixel: PixelRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 300);
  readonly fpCam = new THREE.PerspectiveCamera(55, 1, 0.05, 100);
  readonly input: Input;
  readonly hud: Hud;
  readonly dialogue: DialogueUI;
  readonly holo: HoloBand;
  readonly inspector: Inspector;
  readonly terminal: Terminal;
  readonly qte: Qte;
  chase!: ChaseMode;
  level!: Level;
  player!: PlayerActor;
  npcs = new Map<string, NpcActor>();
  state: GameState = newGame(1);
  mode: Mode = 'title';
  pendingAction: string | null = null;
  private scanOn = false; private scanT = 0;
  private camTarget = new THREE.Vector3();
  private zoom = 1;
  private bullets: Bullet[] = [];
  private labels = new Map<string, HTMLDivElement>();
  private interactables: Interactable[] = [];
  private hackT = 0; private hackActive = false;
  private cstT = 0; private stealthT = 0; private fireCd = 0; private meleeCd = 0;
  private mimic: { id: string; t: number } | null = null;
  private dialogueSpeaker = '';
  private overlayNav = new Nav(() => document.getElementById('overlay'));
  private lastArea = '';
  private warned1630 = false;
  private sun!: THREE.DirectionalLight;
  private damageT = 0;
  private time = 0;
  private aimPoint = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.pixel = new PixelRenderer(canvas);
    this.input = new Input(canvas);
    this.input.onDevice = () => { if (this.holo?.open) this.holo.render(); };
    this.hud = new Hud(this);
    this.dialogue = new DialogueUI(this);
    this.holo = new HoloBand(this);
    this.inspector = new Inspector(this);
    this.terminal = new Terminal(this);
    this.qte = new Qte(this);
    this.scene.background = new THREE.Color('#0a101a');
    this.scene.add(new THREE.HemisphereLight('#c8dcff', '#3a3048', 2.3));
    this.scene.add(new THREE.AmbientLight('#404860', 0.8));
    this.sun = new THREE.DirectionalLight('#ffe2c0', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80;
    this.scene.add(this.sun, this.sun.target);
    window.addEventListener('resize', () => this.resize());
  }

  /** Called after the Cedric model is loaded. */
  initWorld() {
    this.level = new Level(this.scene);
    this.player = new PlayerActor();
    this.scene.add(this.player.root);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 24), new THREE.MeshBasicMaterial({ color: '#6fd3e0', transparent: true, opacity: 0.55, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.renderOrder = 3;
    this.player.root.add(ring);
    this.chase = new ChaseMode(this);
    // Interior point lights (practical lighting, Bible §1)
    const lights: [number, number, number, string][] = [[3, 0, 3, '#ffcf9a'], [15, 0, 3, '#ffcf9a'], [9.5, 0, 10, '#cfe6ff'], [4, 1, 10.8, '#ffb48a'], [9.5, 1, 6.6, '#cfe6ff'], [17, 0, 22, '#ff9a6a']];
    for (const [x, f, z, c] of lights) { const l = new THREE.PointLight(c, 14, 10, 1.4); l.position.set(x, 2.4, z); this.level.floorGroups[f].add(l); }
    this.buildInteractables();
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.pixel.setSize(w, h);
    this.fpCam.aspect = w / h; this.fpCam.updateProjectionMatrix();
  }

  roll(label: string) { return seededRoll(this.state.seed, label); }

  // ───────────────────────────── run lifecycle ─────────────────────────────
  newRun(seed?: number) {
    const s = newGame(seed);
    this.loadState(s);
    saveCheckpoint(this.snapshot());
    this.showBriefing();
  }

  loadState(s: GameState) {
    this.state = cloneState(s);
    for (const n of this.npcs.values()) { this.scene.remove(n.h.root); n.label?.remove(); }
    this.npcs.clear();
    this.labels.forEach((l) => l.remove()); this.labels.clear();
    this.bullets.forEach((b) => this.scene.remove(b.mesh)); this.bullets = [];
    for (const [id, d] of Object.entries(CONTENT.npcs)) {
      const st: NpcState | undefined = this.state.npcs[id];
      const n = new NpcActor(id, d.name, d.look, st?.floor ?? d.floor, st?.x ?? d.x, st?.z ?? d.z, st?.facing ?? d.facing);
      n.status = st?.status ?? (OPS.includes(id) ? 'hidden' : 'idle');
      n.firefight = !!st?.firefight;
      const extra = (st as any)?.extra ?? {};
      n.ai = extra.ai ?? (id === 'corin' && !this.state.flags.corin_rescued ? 'tied' : d.patrol ? 'patrol' : 'idle');
      n.path = extra.path ?? [];
      n.searchT = extra.searchT ?? 0;
      n.hp = extra.hp ?? 60;
      if (d.patrol) n.patrol = d.patrol;
      if (id === 'warden') n.enableCone(this.state.flags.warden_alerted ? 7.5 : 6, 1.3);
      if (OPS.includes(id)) n.enableCone(5.5, 1.25);
      if (n.status === 'hostile') n.ai = 'combat';
      this.scene.add(n.h.root);
      this.npcs.set(id, n);
    }
    const p = this.state.player;
    this.player.pos = { x: p.x, z: p.z }; this.player.floor = p.floor; this.player.facing = p.facing;
    this.player.hidden = false; this.player.crouch = false; this.player.dodgeT = 0;
    this.player.setDisguise(p.disguise ? CONTENT.npcs[p.disguise].look : null);
    for (const id of Object.keys(DOORS)) this.level.setDoor(id, false);
    if (this.state.flags.gate_open) this.level.setDoor('gate', true);
    if (this.state.flags.shed_open) this.level.setDoor('door_shed', true);
    this.level.setExtraBlock(0, 3, 6, !!this.state.flags.tamsin_shut);
    this.scanOn = false; this.mimic = null; this.pendingAction = null;
    this.lastArea = '';
    this.mode = 'play';
    this.hideOverlay();
    this.hud.show(true);
    this.snapCamera();
  }

  snapshot(): GameState {
    const s = this.state;
    s.player.x = this.player.pos.x; s.player.z = this.player.pos.z; s.player.floor = this.player.floor; s.player.facing = this.player.facing;
    for (const [id, n] of this.npcs) {
      s.npcs[id] = { status: n.status, floor: n.floor, x: n.pos.x, z: n.pos.z, facing: n.facing, firefight: n.firefight, extra: { ai: n.ai, path: n.path, searchT: n.searchT, hp: n.hp } } as NpcState;
    }
    return cloneState(s);
  }

  checkpoint(label: string) { saveCheckpoint(this.snapshot()); this.hud.toast(`CHECKPOINT · ${label}`); }

  // ───────────────────────────── shared rules ─────────────────────────────
  markDirective(id: string) {
    if (this.state.directives.includes(id)) return;
    this.state.directives.push(id);
    const d = CONTENT.directives.find((x) => x.id === id);
    if (d) this.hud.toast(`DIRECTIVE COMPLETE`, 'xp', d.label);
  }

  xp(amount: number, primary: NodeName, secondary: NodeName, label: string) {
    const before = rank(this.state.progress);
    const lv = nodeLevel(this.state.progress.nodeXP[primary]);
    this.state.progress = awardXP(this.state.progress, amount, primary, secondary);
    this.state.stats.xpLog.push({ label: `${label} (${primary}/${secondary})`, amount });
    this.hud.toast(`+${amount} XP · ${label}`, 'xp', `${primary} 70% · ${secondary} 30%`);
    if (rank(this.state.progress) > before) this.hud.toast(`RANK UP → ${rank(this.state.progress)}`, 'xp', 'New GP available in SKILLS');
    if (nodeLevel(this.state.progress.nodeXP[primary]) > lv) this.hud.toast(`${primary} NODE → LV ${nodeLevel(this.state.progress.nodeXP[primary])}`, 'xp');
  }

  addLock(text: string) {
    if (this.state.locks.includes(text)) return;
    this.state.locks.push(text);
    this.hud.toast('PERMANENT LOCK', 'lock', text);
    this.state.journal.push(`LOCKED: ${text}`);
    this.markDirective('lock');
  }

  recordChoice(pivot: string, key: string) {
    const c = (this.state.choices[pivot] ??= []);
    if (!c.includes(key)) c.push(key);
  }

  addEvidence(id: string) {
    const s = this.state;
    if (s.evidence.includes(id)) return;
    const ev = CONTENT.evidence[id];
    s.evidence.push(id);
    s.journal.push(`Evidence: ${ev.name}`);
    this.hud.toast(`EVIDENCE · ${ev.name}`, '', ev.kind);
    ev.flags?.forEach((f) => (s.flags[f] = true));
    if (id === 'ev_doorcam') this.markDirective('trust');
    if (id === 'ev_pim_statement' || id === 'ev_corin_letter') this.markDirective('timed');
    this.knowledgeUpdate();
    // Combinations — only independent sources together prove the link (P002-D)
    if (s.evidence.includes('ev_doorcam') && s.evidence.includes('ev_lobbycam') && !s.evidence.includes('ev_footage_link')) {
      this.recordChoice('T01', 'D');
      this.addEvidence('ev_footage_link');
      this.xp(20, 'Mind', 'Heart', 'Footage correlated');
    }
    if (s.evidence.includes('ev_shed_paint') && s.flags.grit_found && !s.evidence.includes('ev_grit_match')) {
      this.addEvidence('ev_grit_match');
      this.xp(20, 'Mind', 'Root', 'Forensic match');
    }
  }

  discoverDetail(evId: string) {
    const ev = CONTENT.evidence[evId];
    if (!ev.detail || this.state.details.includes(ev.detail.id)) return;
    this.state.details.push(ev.detail.id);
    ev.detail.flags.forEach((f) => (this.state.flags[f] = true));
    this.hud.toast(`DETAIL FOUND · ${ev.detail.label}`, 'xp', ev.detail.text);
    this.state.journal.push(`${ev.name}: ${ev.detail.text}`);
    this.xp(10, 'Mind', 'Root', 'Close inspection');
    this.markDirective('inspect');
    this.knowledgeUpdate();
    if (this.state.evidence.includes('ev_shed_paint') && this.state.flags.grit_found && !this.state.evidence.includes('ev_grit_match')) {
      this.addEvidence('ev_grit_match'); this.xp(20, 'Mind', 'Root', 'Forensic match');
    }
  }

  private knowledgeUpdate() {
    if (this.state.flags.know_shed) for (const a of ['shed', 'shedyard', 'shedyard2', 'yard', 'yard_n']) if (!this.state.knownAreas.includes(a)) this.state.knownAreas.push(a);
  }

  applyEffects(e: Effects, key: string) {
    const s = this.state;
    const fx = `fx:${key}`;
    if (s.flags[fx]) return;
    s.flags[fx] = true;
    if (e.trust) for (const [k, v] of Object.entries(e.trust)) s.trust[k] = (s.trust[k] ?? 0) + v;
    if (e.flag) for (const [k, v] of Object.entries(e.flag)) s.flags[k] = v;
    if (e.evidence) this.addEvidence(e.evidence);
    if (e.contact && !s.contacts.includes(e.contact)) s.contacts.push(e.contact);
    if (e.time) s.clock = advanceClock(s.clock, e.time);
    if (e.choice) this.recordChoice(e.choice[0], e.choice[1]);
    if (e.lock) this.addLock(e.lock);
    if (e.directive) this.markDirective(e.directive);
    if (e.xp) this.xp(e.xp[0], e.xp[1], e.xp[2], 'Conversation');
    if (s.flags.tamsin_shut) this.level.setExtraBlock(0, 3, 6, true);
    this.knowledgeUpdate();
  }

  cstMax() { return 6 + (this.state.progress.skills.includes('focused_will') ? 3 : 0); }
  artCost(_a: string) { return 3; }
  artCheck(a: string): { ok: boolean; reason?: string } {
    if (a !== 'suggestion') return { ok: false, reason: '[Unknown Art]' };
    if (nodeLevel(this.state.progress.nodeXP.Mind) < 1) return { ok: false, reason: '[Mind LV 1 required]' };
    if (this.state.player.cst < this.artCost(a)) return { ok: false, reason: `[Needs ${this.artCost(a)} CST]` };
    return { ok: true };
  }
  useArt(a: string) {
    this.state.player.cst -= this.artCost(a);
    this.markDirective('art');
    this.hud.toast('QUANTUM ART · SUGGESTION', '', `-${this.artCost(a)} CST`);
  }

  buySkill(id: string) {
    if (!canBuy(this.state.progress, id).ok) return;
    this.state.progress = buy(this.state.progress, id);
    this.markDirective('skill');
    this.hud.toast(`SKILL LEARNED · ${SKILLS.find((k) => k.id === id)!.name}`, 'xp');
  }

  // ───────────────────────────── interactables ─────────────────────────────
  private npcInteract(id: string, start: () => string | null) {
    return {
      id: `npc_${id}`, floor: CONTENT.npcs[id].floor, x: 0, z: 0, r: id === 'brun' ? 2.1 : 1.5,
      label: () => {
        const n = this.npcs.get(id)!;
        if (n.status !== 'idle' || n.ai === 'combat') return null;
        if (id === 'corin' && !this.state.flags.chase_done) return null;
        return `${this.hud.k('interact')}Talk — ${CONTENT.npcs[id].name}`;
      },
      act: () => { const node = start(); if (node) this.talk(id, node); },
    } as Interactable;
  }

  private buildInteractables() {
    const s = () => this.state;
    const K = (a: string) => this.hud.k(a);
    const list: Interactable[] = [
      this.npcInteract('tamsin', () => (s().evidence.includes('ev_tamsin_testimony') ? 't_again' : 't_start')),
      this.npcInteract('pim', () => (s().evidence.includes('ev_pim_statement') || s().evidence.includes('ev_corin_letter') ? 'p_done' : 'p_start')),
      this.npcInteract('brun', () => (s().evidence.includes('ev_lobbycam') ? 'b_done' : 'b_start')),
      this.npcInteract('corin', () => (s().flags.corin_rescued ? 'c_done' : 'c_start')),
      { id: 'notice', floor: 0, x: 5.6, z: 7.7, label: () => `${K('interact')}Read the notice board`, act: () => this.talk('', 'notice') },
      { id: 'mail', floor: 0, x: 2.6, z: 7.9, label: () => `${K('interact')}Check mailbox 2B`, act: () => this.talk('', 'mailbox') },
      { id: 'door1a', floor: 0, x: 3.5, z: 6.9, r: 0.9, label: () => (s().flags.tamsin_shut ? `${K('interact')}Knock — Apt 1A` : null), act: () => this.hud.toast("Apt 1A stays shut. Mrs. Tamsin won't answer again.", 'warn') },
      { id: 'stairs_up', floor: 0, x: 8.5, z: 5.4, r: 1.1, label: () => `${K('interact')}Climb stairs to Floor 2`, act: () => this.changeFloor(1, 8.5, 4.5, Math.PI * 0) },
      { id: 'stairs_down', floor: 1, x: 8.5, z: 4.4, r: 1.1, label: () => `${K('interact')}Go down to Ground floor`, act: () => this.leaveFloor2(() => this.changeFloor(0, 8.5, 5.6, 0)) },
      { id: 'fire_up', floor: 0, x: 3.5, z: 14.8, r: 1.1, label: () => `${K('interact')}Climb the fire escape to 2B's window`, act: () => this.changeFloor(1, 3.5, 12.3, Math.PI) },
      { id: 'window', floor: 1, x: 3.5, z: 12.35, r: 1.0, label: () => `${K('interact')}Climb out the window (fire escape)`, act: () => this.leaveFloor2(() => this.changeFloor(0, 3.5, 14.9, 0)) },
      { id: 'locked_2a', floor: 1, x: 3.5, z: 6.2, r: 0.8, label: () => `${K('interact')}Apt 2A`, act: () => this.hud.toast('Apt 2A — vacant, locked. Nothing to find here.') },
      { id: 'locked_2d', floor: 1, x: 15.5, z: 6.2, r: 0.8, label: () => `${K('interact')}Apt 2D`, act: () => this.hud.toast('Apt 2D — locked. A radio murmurs inside.') },
      { id: 'locked_2c', floor: 1, x: 12.5, z: 7.6, r: 0.8, label: () => `${K('interact')}Apt 2C (storage)`, act: () => this.hud.toast('Storage 2C — padlocked from the inside of the building trust. Not part of this case.') },
      // Apartment 2B — P003 analogue
      { id: 'terminal', floor: 1, x: 6.3, z: 10.4, r: 1.0, clue: true, label: () => (s().flags.hacked ? null : s().flags.terminal_locked ? `${K('interact')}Terminal (LOCKED)` : `${K('interact')}Hack Corin's terminal`), act: () => (s().flags.terminal_locked ? this.hud.toast('Terminal locked out after the failed intrusion — permanently.', 'warn') : this.startHack()) },
      { id: 'search_bed', floor: 1, x: 2.55, z: 10.4, r: 0.95, clue: true, label: () => (s().flags.searched_bed ? null : `${K('interact')}Deep search: under the bed ${this.searchCostLabel()}`), act: () => this.deepSearch('bed') },
      { id: 'search_desk', floor: 1, x: 5.25, z: 10.0, r: 0.8, clue: true, label: () => (s().flags.searched_desk ? null : `${K('interact')}Deep search: desk drawer ${this.searchCostLabel()}`), act: () => this.deepSearch('desk') },
      { id: 'search_floor', floor: 1, x: 4.6, z: 11.1, r: 0.8, clue: true, label: () => (s().flags.searched_floor ? null : `${K('interact')}Deep search: scuffs on the floor ${this.searchCostLabel()}`), act: () => this.deepSearch('floor') },
      { id: 'search_latch', floor: 1, x: 2.3, z: 12.4, r: 0.8, clue: true, label: () => (s().flags.searched_latch ? null : `${K('interact')}Deep search: window latch ${this.searchCostLabel()}`), act: () => this.deepSearch('latch') },
      { id: 'hide_wardrobe', floor: 1, x: 6.75, z: 11.9, r: 0.8, label: () => (this.player.hidden ? null : `${K('interact')}Hide in the wardrobe`), act: () => this.hide(true) },
      { id: 'hide_locker', floor: 1, x: 18.5, z: 7.2, r: 0.9, label: () => (this.player.hidden ? null : `${K('interact')}Hide in the locker`), act: () => this.hide(true) },
      // Courtyard
      { id: 'gate_out', floor: 0, x: 14.5, z: 16.4, r: 1.1, label: () => (this.level.isDoorOpen('gate') ? null : `${K('interact')}Call the warden to the gate`), act: () => this.callWarden() },
      { id: 'gate_in', floor: 0, x: 14.5, z: 17.6, r: 0.9, label: () => (this.level.isDoorOpen('gate') ? null : `${K('interact')}Unlatch the gate from inside`), act: () => { this.openGate(); } },
      { id: 'shed_door', floor: 0, x: 16.5, z: 19.5, r: 1.0, label: () => (this.level.isDoorOpen('door_shed') ? null : s().inventory.includes('key_shed') ? `${K('interact')}Unlock the shed (keycard)` : `${K('interact')}Force the shed lock (LOUD)`), act: () => this.openShed() },
      { id: 'shed_paint', floor: 0, x: 18.0, z: 19.5, r: 0.9, clue: true, label: () => (s().evidence.includes('ev_shed_paint') ? null : `${K('interact')}Examine the scraped shed paint`), act: () => { this.addEvidence('ev_shed_paint'); this.xp(10, 'Mind', 'Root', 'Scene observation'); } },
    ];
    this.interactables = list;
  }

  private searchCostLabel() {
    if (this.state.sweep.phase !== 'armed') return '';
    return `<span class="muted">(−${this.state.progress.skills.includes('quick_hands') ? 8 : 15}s clock)</span>`;
  }

  // ───────────────────────────── actions ─────────────────────────────
  talk(npcId: string, node: string) {
    this.dialogueSpeaker = npcId;
    const n = this.npcs.get(npcId);
    if (n) n.facing = Math.atan2(this.player.pos.x - n.pos.x, this.player.pos.z - n.pos.z);
    this.mode = 'dialogue';
    this.dialogue.start(node);
  }

  onDialogueClosed() {
    if (this.mode === 'dialogue') this.mode = 'play';
    const a = this.pendingAction; this.pendingAction = null;
    if (a === 'start_combat') this.startCombat(OPS.includes(this.dialogueSpeaker) ? 'ops' : 'yard');
    if (a === 'window_escape') {
      this.state.flags.talk_escaped = true;
      this.state.sweep.phase = 'resolved';
      this.state.journal.push('Talked past the sweep crew and slipped out the window.');
      for (const id of OPS) { const n = this.npcs.get(id)!; n.ai = 'search'; n.detect = 0; }
      this.changeFloor(0, 3.5, 14.9, 0);
    }
    if (a === 'open_gate') { this.openGate(); this.state.flags.warden_cleared = true; }
    if (a === 'open_gate_and_shed') { this.openGate(); this.state.flags.warden_cleared = true; this.state.flags.shed_open = true; this.level.setDoor('door_shed', true); this.markDirective('mimic'); }
  }

  private fade(fn: () => void, ms = 200) {
    const f = document.getElementById('fade')!;
    const prev = this.mode;
    this.mode = 'transition';
    f.classList.add('on');
    setTimeout(() => { fn(); this.snapCamera(); setTimeout(() => { f.classList.remove('on'); if (this.mode === 'transition') this.mode = prev === 'transition' ? 'play' : prev; }, 60); }, ms);
  }

  changeFloor(floor: number, x: number, z: number, facing: number) {
    this.fade(() => { this.player.floor = floor; this.player.pos = { x, z }; this.player.facing = facing; this.player.hidden = false; });
  }

  /** P003-C: leaving 2B while the sweep clock runs permanently closes sweep impersonation. */
  private leaveFloor2(go: () => void) {
    if (this.state.sweep.phase !== 'armed') return go();
    this.confirm('LEAVE BEFORE THE CREW ARRIVES?', 'The sweep clock is still running. Leaving Floor 2 now means the sweep crew arrives to an empty apartment — you will never get close enough to copy their identity. This is permanent (P003-C).', 'Leave anyway', () => {
      this.recordChoice('T02', 'C');
      this.addLock('Left 2B before the sweep crew arrived — sweep impersonation permanently closed (P003-C).');
      this.missSweep();
      go();
    });
  }

  private missSweep() {
    this.state.sweep.phase = 'missed';
    this.state.flags.warden_alerted = true;
    const w = this.npcs.get('warden')!;
    if (w.cone) { w.coneRange = 7.5; w.cone.scale.setScalar(7.5); }
    this.state.journal.push('The sweep crew swept an empty 2B and radioed the yard. The warden is on alert (wider, sharper vision).');
    this.hud.toast('The crew radioed the yard — the warden is now on alert.', 'warn');
  }

  private hide(on: boolean) {
    this.player.hidden = on;
    if (on) {
      if (this.state.sweep.phase === 'armed' || this.state.sweep.phase === 'active') this.recordChoice('T02', 'D');
      this.hud.toast('Hidden. Detection impossible while hidden.', '', `${this.hud.k('interact').replace(/<[^>]+>/g, '')} to step out`);
    }
  }

  private deepSearch(spot: 'bed' | 'desk' | 'floor' | 'latch') {
    const s = this.state;
    s.flags[`searched_${spot}`] = true;
    this.recordChoice('T02', 'B');
    this.markDirective('search');
    s.clock = advanceClock(s.clock, 5);
    if (s.sweep.phase === 'armed') { s.sweep.remaining -= s.progress.skills.includes('quick_hands') ? 8 : 15; this.hud.toast('Searching takes time…', 'warn', 'Sweep clock reduced'); }
    if (spot === 'bed') { this.addEvidence('ev_keycard'); s.inventory.push('key_shed'); this.xp(15, 'Mind', 'Root', 'Forensic find'); }
    if (spot === 'desk') { s.inventory.push('pistol'); s.player.ammo = 12; this.hud.toast('ITEM · Service Pistol (12 rounds)', '', 'R / LMB / RT to fire'); this.xp(5, 'Core', 'Root', 'Armed'); }
    if (spot === 'floor') { this.addEvidence('ev_bootprint'); this.xp(15, 'Mind', 'Root', 'Forensic find'); }
    if (spot === 'latch') { this.addEvidence('ev_glove'); this.xp(15, 'Mind', 'Root', 'Forensic find'); }
    if (spot !== 'desk') this.hud.toast(`Open the HoloBand → EVIDENCE → Inspect to examine it closely.`);
  }

  private startHack() {
    this.recordChoice('T02', 'A');
    this.markDirective('hack');
    this.mode = 'hack';
    this.hackT = 0; this.hackActive = false;
    this.terminal.start((ok) => {
      if (ok === null) { this.hud.toast('Intrusion aborted. You can try again.'); }
      else if (ok) {
        this.state.flags.hacked = true;
        this.addEvidence('ev_tracker_pings');
        this.xp(25, 'Mind', 'Core', 'Terminal intrusion');
      } else {
        this.state.flags.terminal_locked = true;
        this.addLock('Terminal intrusion failed — Corin\'s terminal is locked forever (P003-A).');
        if (this.state.sweep.phase === 'armed') { this.state.sweep.remaining /= 2; this.hud.toast('SWEEP CLOCK HALVED', 'warn'); }
      }
      this.hackT = 0; this.hackActive = false; this.mode = 'play';
    });
  }

  private callWarden() {
    const w = this.npcs.get('warden')!;
    if (w.status !== 'idle' || w.ai === 'combat') { this.hud.toast('No one answers. The gate is latched from the inside.', 'warn'); return; }
    w.pos = { x: 14.5, z: 18.2 }; w.ai = 'idle'; w.wait = 4;
    const d = this.state.player.disguise;
    if (d && OPS.includes(d) && !this.state.flags.warden_doubt) this.talk('warden', this.state.flags.warden_asked ? 'w_start' : 'w_disguised');
    else this.talk('warden', 'w_start');
    if (d && OPS.includes(d)) this.state.flags.warden_asked = true;
  }

  private openGate() {
    this.state.flags.gate_open = true;
    this.level.setDoor('gate', true);
    this.hud.toast('Yard gate open.');
  }

  private openShed() {
    const s = this.state;
    if (s.inventory.includes('key_shed')) { this.hud.toast('Keycard accepted. The shed lock clunks open.'); this.xp(10, 'Root', 'Mind', 'Access'); }
    else {
      this.recordChoice('T04', 'D');
      this.hud.toast('You wrench the lock. It is LOUD.', 'warn');
      const w = this.npcs.get('warden')!;
      if (w.status === 'idle' && !s.flags.warden_cleared) { w.detect = 1; this.onSpotted(w); }
    }
    s.flags.shed_open = true;
    this.level.setDoor('door_shed', true);
  }

  // ───────────────────────────── sweep event (P003/P004 analogue) ─────────────────────────────
  private sweepExpired() {
    if (this.player.floor === 1) {
      this.state.sweep.phase = 'active';
      for (const id of OPS) {
        const n = this.npcs.get(id)!;
        const start = id === 'op_b1' ? [9.5, 4.5] : [9.5, 3.6];
        n.status = 'idle'; n.floor = 1; n.pos = { x: start[0], z: start[1] }; n.facing = 0; n.ai = 'walk'; n.path = OP_PATHS[id].map((p) => [...p] as [number, number]); n.detect = 0; n.hp = 60;
      }
      this.state.journal.push('Sweep clock expired: the drill crew is on Floor 2.');
      this.checkpoint('Sweep crew arrives');
      this.hud.toast('SWEEP CREW INBOUND', 'warn', 'Hide (wardrobe/locker) & ambush, talk your way out, or fight.');
    } else {
      this.addLock('You weren\'t on Floor 2 when the crew came — sweep impersonation permanently closed.');
      this.missSweep();
    }
  }

  startCombat(group: 'ops' | 'yard') {
    if (group === 'ops') {
      const targets = OPS.map((id) => this.npcs.get(id)!).filter((n) => n.status === 'idle');
      if (!this.state.flags.qte_passed) {
        this.mode = 'qte';
        const b1 = targets[0];
        if (b1) b1.faceTo(this.player.pos.x, this.player.pos.z, 1, 100);
        this.qte.start('DODGE!', (ok) => {
          if (!ok) { this.die('The operative drew first. You missed the dodge.'); return; }
          this.state.flags.qte_passed = true;
          this.markDirective('qte');
          this.xp(15, 'Core', 'Root', 'Reflex');
          this.player.dodgeT = 0.4;
          this.mode = 'play';
          this.startCombat('ops');
        });
        return;
      }
      this.recordChoice('T02', 'E'); this.recordChoice('T03', 'D');
      targets.forEach((n) => { n.status = 'hostile'; n.ai = 'combat'; n.firefight = true; n.fireCd = 0.8 + Math.random(); });
      this.addLock('Open firefight with the sweep crew — their identities can never be Mimic-copied (P003-E).');
      this.state.sweep.phase = 'resolved';
    } else {
      this.recordChoice('T04', 'D');
      for (const id of ['warden']) { const n = this.npcs.get(id)!; if (n.status === 'idle') { n.status = 'hostile'; n.ai = 'combat'; n.firefight = true; n.fireCd = 1.0; } }
    }
    this.hud.toast('COMBAT', 'warn', `${this.hud.k('melee').replace(/<[^>]+>/g, '')} scalpel · ${this.hud.k('fire').replace(/<[^>]+>/g, '')} pistol · ${this.hud.k('dodge').replace(/<[^>]+>/g, '')} dodge`);
  }

  private onSpotted(n: NpcActor) {
    const s = this.state;
    if (OPS.includes(n.id)) {
      if (!s.flags.confronted && !s.flags.talk_escaped) {
        s.flags.confronted = true;
        for (const id of OPS) { const o = this.npcs.get(id)!; if (o.status === 'idle') { o.ai = 'idle'; o.faceTo(this.player.pos.x, this.player.pos.z, 1, 100); } }
        this.hud.toast('SPOTTED', 'warn');
        this.talk(n.id, 's_start');
      } else this.startCombat('ops');
    } else if (n.id === 'warden') {
      this.hud.toast('WARDEN: "Intruder in the yard!"', 'warn');
      this.startCombat('yard');
    }
  }

  die(reason: string) {
    this.mode = 'over';
    this.hud.show(false);
    this.overlay(`<div class="screen"><h1 style="color:var(--red)">CHECKPOINT</h1><h2>${esc(reason)}</h2>
      <p>Failure reloads the last checkpoint. Everything you learned before it is kept exactly as it was — nothing is conjured, nothing is lost that you didn't lose.</p>
      <div class="menu"><button class="nav" data-act="cp">RELOAD CHECKPOINT</button></div></div>`, { cp: () => this.reloadCheckpoint() });
  }

  reloadCheckpoint() {
    const cp = loadCheckpoint();
    if (cp) { this.loadState(cp); this.hud.toast('Checkpoint reloaded'); }
  }

  // ───────────────────────────── chase ─────────────────────────────
  private beginChase() {
    this.checkpoint('Before the runner');
    this.hud.toast('The runner bolts out the back door!', 'warn');
    this.fade(() => {
      this.mode = 'chase';
      this.hud.show(false);
      this.chase.start((r) => this.fade(() => this.endChase(r), 200));
    }, 300);
  }

  private endChase(r: 'caught' | 'escaped') {
    const s = this.state;
    const dax = this.npcs.get('dax')!;
    s.flags.chase_done = true;
    this.markDirective('chase');
    if (r === 'caught') {
      this.recordChoice('T05', 'A');
      dax.status = 'captured'; dax.ai = 'tied'; dax.pos = { x: 18.4, z: 21.4 };
      this.addEvidence('ev_runner_ledger');
      this.xp(30, 'Core', 'Root', 'Runner caught');
    } else {
      this.recordChoice('T05', 'B');
      dax.status = 'fled';
      this.addEvidence('ev_ledger_scrap');
      this.addLock('Dax Morrow escaped down the alley — the full ledger is gone; only a torn scrap remains.');
    }
    this.player.floor = 0; this.player.pos = { x: 17.3, z: 22.0 }; this.player.facing = Math.PI / 2;
    this.mode = 'play';
    this.hud.show(true);
    this.hud.toast('Corin Ashe is tied up in the shed. Free him.', '', 'Then open the HoloBand → REPORT');
  }

  // ───────────────────────────── reports & results ─────────────────────────────
  submitReport(ans: Record<string, { a: number; e: string }>) {
    const s = this.state;
    let pts = 0;
    const rows: string[] = [];
    for (const q of CONTENT.deduction) {
      const a = ans[q.id];
      const right = a?.a === q.correct;
      const backed = right && !!a?.e && q.support.includes(a.e);
      pts += right ? (backed ? 2 : 1) : 0;
      rows.push(`<tr><td>${esc(q.question)}</td><td class="${right ? 'ok' : 'bad'}">${a && a.a >= 0 ? esc(q.answers[a.a]) : '—'}</td><td class="${backed ? 'ok' : right ? 'amber' : 'muted'}">${backed ? 'PROVEN · ' + esc(CONTENT.evidence[a.e].name) : right ? 'HUNCH (no admissible evidence)' : '—'}</td></tr>`);
    }
    s.flags.report_done = true;
    s.flags.report_pts = pts;
    s.flags.report_rows = rows.join('');
    this.recordChoice('T06', 'A');
    this.markDirective('report');
    this.xp(pts * 10, 'Mind', 'Heart', 'Case report');
    this.holo.close();
    this.showResults();
  }

  showResults() {
    const s = this.state;
    const pts = Number(s.flags.report_pts ?? 0) + (s.flags.corin_rescued ? 1 : 0);
    const grade = pts >= 7 ? 'S' : pts >= 6 ? 'A' : pts >= 4 ? 'B' : pts >= 2 ? 'C' : 'D';
    const dirs = CONTENT.directives.map((d) => `<span class="${s.directives.includes(d.id) ? 'ok' : 'muted'}">${s.directives.includes(d.id) ? '■' : '□'} ${esc(d.label)}</span>`).join('<br/>');
    const path = CONTENT.pivots.map((p) => `<tr><td>${p.id} ${esc(p.title)}</td><td>${(s.choices[p.id] ?? []).join(', ') || '<span class="muted">—</span>'}</td></tr>`).join('');
    this.mode = 'over';
    this.hud.show(false);
    this.holo.close();
    this.overlay(`<div class="screen"><h2>SIMULATION ${esc(CONTENT.case_id)} — CASE REPORT</h2>
      <div style="display:flex;gap:24px;align-items:center"><div class="grade">${grade}</div><div><p style="margin:0">${s.flags.corin_rescued ? '<span class="ok">Corin Ashe recovered alive.</span>' : '<span class="amber">Corin Ashe not recovered.</span>'}<br/>Deduction ${s.flags.report_pts}/6 · Rank ${rank(s.progress)} · ${s.progress.totalXP} XP · ${s.evidence.length} evidence · ${s.locks.length} permanent locks</p></div></div>
      <table>${s.flags.report_rows ?? ''}</table>
      <h2 style="margin-top:18px">YOUR PATH</h2><table>${path}</table>
      <h2 style="margin-top:18px">PERMANENT LOCKS</h2><p>${s.locks.map((l) => `⊘ ${esc(l)}`).join('<br/>') || '<span class="muted">None</span>'}</p>
      <h2>MECHANICS EXERCISED · ${s.directives.length}/${CONTENT.directives.length}</h2><p style="columns:2;font-size:12.5px">${dirs}</p>
      <div class="menu"><button class="nav" data-act="free">KEEP EXPLORING THIS RUN</button><button class="nav" data-act="restart">RESTART (NEW SEED)</button><button class="nav" data-act="title">TITLE</button></div></div>`,
      { free: () => { this.hideOverlay(); this.hud.show(true); this.mode = 'play'; }, restart: () => this.newRun(), title: () => this.showTitle() });
  }

  system(cmd: string) {
    if (cmd === 'save') { saveGame(this.snapshot()); this.markDirective('save'); this.hud.toast('Game saved'); }
    if (cmd === 'load') { const g = loadGame(); if (g) { this.holo.close(); this.loadState(g); this.markDirective('save'); this.hud.toast('Game loaded'); } else this.hud.toast('No save found', 'warn'); }
    if (cmd === 'checkpoint') { this.holo.close(); this.reloadCheckpoint(); }
    if (cmd === 'pixel') { this.pixel.pixelScale = this.pixel.pixelScale >= 4 ? 1 : this.pixel.pixelScale + 1; this.resize(); this.holo.render(); }
    if (cmd === 'restart') { this.holo.close(); this.newRun(); }
    if (cmd === 'title') { this.holo.close(); this.showTitle(); }
  }

  openInspector(evId: string, fromMenu: boolean) {
    if (fromMenu) this.holo.close();
    this.mode = 'inspect';
    this.inspector.show(evId, () => { if (fromMenu) { this.mode = 'menu'; this.holo.show('EVIDENCE'); } else this.mode = 'play'; });
  }
  closeHoloBand() { this.holo.close(); this.mode = 'play'; }

  // ───────────────────────────── overlays ─────────────────────────────
  overlay(html: string, actions: Record<string, () => void>) {
    const o = document.getElementById('overlay')!;
    o.innerHTML = html;
    o.classList.remove('hidden');
    o.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act!]?.()));
    this.overlayNav.reset(); this.overlayNav.bindHover();
  }
  hideOverlay() { document.getElementById('overlay')!.classList.add('hidden'); }

  confirm(title: string, text: string, yes: string, onYes: () => void) {
    const prev = this.mode;
    this.mode = 'over';
    this.overlay(`<div class="screen" style="width:min(560px,92vw)"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="menu"><button class="nav" data-act="no">Stay</button><button class="nav" data-act="yes">${esc(yes)}</button></div></div>`,
      { no: () => { this.hideOverlay(); this.mode = prev; }, yes: () => { this.hideOverlay(); this.mode = prev; onYes(); } });
  }

  showTitle() {
    this.mode = 'title';
    this.hud.show(false);
    const has = !!loadGame();
    this.overlay(`<div class="screen"><h1>DETECTIVE NOWHERE</h1><h2>OPENING BUILD TUTORIAL · HOLOBAND TRAINING SIMULATION ${esc(CONTENT.case_id)}</h2>
      <p>${CONTENT.briefing.map(esc).join('<br/>')}</p>
      <p class="muted" style="font-size:12px">${esc(CONTENT.canon_note)}</p>
      <div class="menu"><button class="nav" data-act="new">BEGIN SIMULATION</button>${has ? '<button class="nav" data-act="cont">CONTINUE (QUICK SAVE)</button>' : ''}<button class="nav" data-act="seed">BEGIN WITH SEED 1234 (reproducible)</button></div>
      <p class="muted" style="font-size:12px;margin-top:16px">Keyboard + mouse or Xbox controller. Press any controller button to switch prompts.</p></div>`,
      { new: () => this.newRun(), cont: () => { const g = loadGame(); if (g) this.loadState(g); }, seed: () => this.newRun(1234) });
  }

  private showBriefing() {
    this.mode = 'over';
    this.hud.show(false);
    this.overlay(`<div class="screen" style="width:min(640px,92vw)"><h2>BRIEFING · ${esc(CONTENT.title)}</h2>
      <p>Corin Ashe, Apt 2B, hasn't been seen since 13:00. Witnesses on the ground floor saw <i>something</i>. Pim Hollis in 1B leaves for good at <b>17:00</b>.</p>
      <p>Entering Apartment 2B starts a <b>5:00 sweep clock</b>. When it runs out, a drill crew arrives — and that's this sim's one live event.</p>
      <p>The <b>Training Directives</b> panel (left) tracks every mechanic. Try different approaches on different runs; every choice is logged in the HoloBand mission graph.</p>
      <div class="menu"><button class="nav" data-act="go">ENTER THE LOBBY</button></div></div>`, { go: () => { this.hideOverlay(); this.hud.show(true); this.mode = 'play'; } });
  }

  // ───────────────────────────── per-frame ─────────────────────────────
  private snapCamera() {
    if (!this.player) return;
    this.camTarget.set(this.player.pos.x, this.player.floor * FLOOR_HEIGHT + 0.8, this.player.pos.z);
  }

  frame(dt: number) {
    this.time += dt;
    this.input.update();
    const inp = this.input;
    if (this.mode !== 'title' && this.mode !== 'chase' && this.mode !== 'over') {
      if (inp.pressed('quicksave')) this.system('save');
      if (inp.pressed('quickload')) this.system('load');
    }
    if (inp.pressed('directives')) this.hud.collapsed = !this.hud.collapsed;
    switch (this.mode) {
      case 'play': this.updatePlay(dt); break;
      case 'dialogue': this.dialogue.update(); this.updateWorld(dt * 0); break;
      case 'menu': this.holo.update(); break;
      case 'inspect': this.inspector.update(dt); break;
      case 'hack': this.updateHack(dt); break;
      case 'qte': this.qte.update(dt); this.updateWorld(dt * 0.08); break;
      case 'chase': this.chase.update(dt); break;
      case 'title': case 'over': this.overlayNav.update(inp); break;
    }
    this.render(dt);
  }

  private updateHack(dt: number) {
    this.hackT = Math.min(1, this.hackT + dt / 0.6);
    if (this.hackT >= 1) this.terminal.update(dt);
  }

  private updatePlay(dt: number) {
    const s = this.state;
    const inp = this.input;
    const p = this.player;
    // World clock: 1 game-minute per real second
    s.clock = advanceClock(s.clock, dt);
    this.cstT += dt;
    if (this.cstT > 30) { this.cstT = 0; s.player.cst = Math.min(this.cstMax(), s.player.cst + 1); }
    // Timed witness (P002-B): Pim leaves at 17:00
    const pim = this.npcs.get('pim')!;
    if (!this.warned1630 && clockAbs(s.clock) >= clockAbs(at(s.clock, '16:30')) && pim.status === 'idle') { this.warned1630 = true; this.hud.toast("Pim Hollis's transport arrives at 17:00.", 'warn'); }
    if (pim.status === 'idle' && clockAbs(s.clock) >= clockAbs(at(s.clock, '17:00'))) {
      pim.status = 'gone';
      if (!s.evidence.includes('ev_pim_statement') && !s.evidence.includes('ev_corin_letter')) this.addLock('Pim Hollis left at 17:00 before you spoke to him — his lead is gone for good.');
      else s.journal.push('Pim Hollis has left the building.');
    }
    // Sweep clock
    if (s.sweep.phase === 'armed') { s.sweep.remaining -= dt; if (s.sweep.remaining <= 0) this.sweepExpired(); }

    // Menus
    if (inp.pressed('holoband') || inp.pressed('pause')) { this.mode = 'menu'; this.holo.show(inp.pressed('pause') ? 'SYSTEM' : undefined); return; }
    if (inp.pressed('scan')) { this.scanOn = !this.scanOn; if (this.scanOn) this.markDirective('scan'); }

    // Hidden: can only step out
    if (p.hidden) {
      this.hud.prompt(`${this.hud.k('interact')}Step out of hiding`);
      if (inp.pressed('interact')) { p.hidden = false; }
      this.updateWorld(dt);
      return;
    }

    // Movement in camera space
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0); right.y = 0; right.normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1); up.y = 0; up.normalize();
    if (inp.pressed('crouch')) p.crouch = !p.crouch;
    let mx = right.x * inp.move.x + up.x * inp.move.y;
    let mz = right.z * inp.move.x + up.z * inp.move.y;
    const mlen = Math.hypot(mx, mz);
    if (mlen > 0.01) this.markDirective('move');
    if (inp.pressed('dodge') && p.dodgeT <= 0) {
      p.dodgeT = 0.4;
      p.dodgeDir = mlen > 0.01 ? { x: mx / mlen, z: mz / mlen } : { x: Math.sin(p.facing), z: Math.cos(p.facing) };
    }
    let speed = (p.crouch ? 1.7 : 3.3) * (this.scanOn ? 0.6 : 1);
    if (p.dodgeT > 0) { p.dodgeT -= dt; mx = p.dodgeDir.x; mz = p.dodgeDir.z; speed = 6.5; }
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      this.level.move(p.floor, p.pos, (mx / Math.max(1, len)) * speed * dt, (mz / Math.max(1, len)) * speed * dt, 0.28, p.crouch);
      if (p.dodgeT <= 0) p.facing = Math.atan2(mx, mz);
    }
    p.moving = THREE.MathUtils.lerp(p.moving, len > 0.01 ? Math.min(1, len) : 0, Math.min(1, dt * 10));

    // Aim
    const aiming = this.computeAim();
    // Combat input
    this.fireCd -= dt; this.meleeCd -= dt;
    const take = this.takedownTarget();
    if (inp.pressed('fire') || (this.input.device === 'pad' && this.input.triggers.rt > 0.6 && this.fireCd <= 0 && inp.isHeld('fire'))) this.fire(aiming);
    if (inp.pressed('melee')) { if (take) this.takedown(take, 'kill'); else this.melee(); }

    // Mimic
    this.updateMimic(dt);

    // Interact prompt
    const near = this.nearestInteractable();
    let prompt = '';
    if (take) prompt = `${this.hud.k('interact')}Capture alive &nbsp; ${this.hud.k('melee')}Scalpel takedown — ${esc(take.name)}`;
    else if (near) prompt = near.label() ?? '';
    const mimicT = this.mimicCandidate();
    if (!prompt && mimicT) prompt = `${this.hud.k('mimic')}${mimicT.firefight ? 'Mimic scan (corrupted — firefight target)' : 'Mimic: copy appearance'} — ${esc(mimicT.name)}`;
    this.hud.prompt(prompt);
    if (inp.pressed('interact')) { if (take) this.takedown(take, 'capture'); else if (near) { this.markDirective('interact'); near.act(); } }

    this.updateWorld(dt);
    this.updateTriggers();
  }

  private computeAim(): { x: number; z: number } {
    const p = this.player;
    if (this.input.device === 'pad' && (Math.abs(this.input.look.x) > 0.3 || Math.abs(this.input.look.y) > 0.3)) {
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0); right.y = 0; right.normalize();
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1); up.y = 0; up.normalize();
      const x = right.x * this.input.look.x - up.x * this.input.look.y, z = right.z * this.input.look.x - up.z * this.input.look.y;
      const l = Math.hypot(x, z); p.facing = Math.atan2(x, z);
      return { x: x / l, z: z / l };
    }
    if (this.input.device === 'kbm' && this.input.mouse.inside) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(p.floor * FLOOR_HEIGHT + 1));
      if (ray.ray.intersectPlane(plane, this.aimPoint)) {
        const dx = this.aimPoint.x - p.pos.x, dz = this.aimPoint.z - p.pos.z; const l = Math.hypot(dx, dz) || 1;
        return { x: dx / l, z: dz / l };
      }
    }
    return { x: Math.sin(p.facing), z: Math.cos(p.facing) };
  }

  private fire(dir: { x: number; z: number }) {
    const s = this.state;
    if (!s.inventory.includes('pistol')) { if (this.input.pressed('fire')) this.hud.toast('No firearm. (Deep-search 2B\'s desk drawer.)', 'warn'); return; }
    if (this.fireCd > 0) return;
    if (s.player.ammo <= 0) { this.hud.toast('Out of ammo', 'warn'); this.fireCd = 0.4; return; }
    s.player.ammo--; this.fireCd = 0.35;
    this.player.facing = Math.atan2(dir.x, dir.z);
    this.spawnBullet(this.player.pos.x + dir.x * 0.5, this.player.pos.z + dir.z * 0.5, dir.x * 16, dir.z * 16, this.player.floor, 'player');
    // Gunfire is loud: any idle watcher on the floor turns hostile
    for (const n of this.npcs.values()) if (n.watcher && n.status === 'idle' && n.floor === this.player.floor && Math.hypot(n.pos.x - this.player.pos.x, n.pos.z - this.player.pos.z) < 12) this.provoke(n);
  }

  private provoke(n: NpcActor) {
    if (OPS.includes(n.id)) { if (this.state.flags.qte_passed) this.startCombat('ops'); else { this.state.flags.qte_passed = true; this.startCombat('ops'); } }
    else if (n.id === 'warden') this.startCombat('yard');
  }

  private melee() {
    if (this.meleeCd > 0) return;
    this.meleeCd = 0.45;
    const p = this.player;
    const f = { x: Math.sin(p.facing), z: Math.cos(p.facing) };
    this.player.rig.armR.rotation.x = -2;
    for (const n of this.npcs.values()) {
      if (n.floor !== p.floor || !['idle', 'hostile'].includes(n.status)) continue;
      const dx = n.pos.x - p.pos.x, dz = n.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.5 && (dx * f.x + dz * f.z) / (d || 1) > 0.4) {
        if (!n.watcher && n.status !== 'hostile') { this.hud.toast('Cedric stays his hand — not a threat.', 'warn'); continue; }
        if (n.status === 'idle') this.provoke(n);
        this.damageNpc(n, 50);
      }
    }
  }

  private damageNpc(n: NpcActor, dmg: number) {
    n.hp -= dmg;
    this.markDirective('combat');
    if (n.hp <= 0 && n.status === 'hostile') {
      n.status = 'ko'; n.ai = 'down';
      this.xp(15, 'Core', 'Root', 'Combat');
      this.checkEventResolved();
    }
  }

  private takedownTarget(): NpcActor | null {
    const p = this.player;
    for (const n of this.npcs.values()) {
      if (!n.watcher || n.status !== 'idle' || n.floor !== p.floor || n.ai === 'combat') continue;
      const dx = p.pos.x - n.pos.x, dz = p.pos.z - n.pos.z, d = Math.hypot(dx, dz);
      if (d > 1.35) continue;
      const f = n.facingVec();
      if ((dx * f.x + dz * f.z) / (d || 1) < -0.2 && n.detect < 0.9) return n;
    }
    return null;
  }

  private takedown(n: NpcActor, how: 'capture' | 'kill') {
    n.status = how === 'capture' ? 'captured' : 'dead';
    n.ai = 'down'; n.detect = 0;
    this.markDirective('takedown');
    this.markDirective('stealth');
    const isOp = OPS.includes(n.id);
    if (how === 'capture') { this.recordChoice(isOp ? 'T03' : 'T04', isOp ? 'A' : 'B'); this.xp(20, 'Root', 'Core', 'Silent capture'); this.hud.toast(`${n.name} restrained.`, '', `${this.hud.k('mimic').replace(/<[^>]+>/g, '')}: Mimic-copy their appearance`); }
    else {
      this.recordChoice(isOp ? 'T03' : 'T04', isOp ? 'B' : 'D');
      this.xp(20, 'Core', 'Root', 'Scalpel takedown');
      this.addLock(`${n.name} is dead — they can never testify.`);
    }
    if (n.id === 'warden') this.state.flags.warden_cleared = true;
    this.checkEventResolved();
  }

  private checkEventResolved() {
    if (this.state.sweep.phase !== 'active' && !this.state.flags.qte_passed) return;
    const left = OPS.map((id) => this.npcs.get(id)!).filter((n) => n.status === 'idle' || n.status === 'hostile');
    if (left.length === 0 && this.npcs.get('op_b1')!.status !== 'hidden' && !this.state.flags.sweep_cleared) {
      this.state.flags.sweep_cleared = true;
      this.state.sweep.phase = 'resolved';
      this.state.journal.push('Sweep crew neutralised.');
      this.hud.toast('SWEEP CREW NEUTRALISED', 'xp', 'The yard shed is next.');
    }
  }

  private mimicCandidate(): NpcActor | null {
    const p = this.player;
    for (const n of this.npcs.values()) {
      if (!n.watcher || n.floor !== p.floor) continue;
      if (!['captured', 'dead', 'ko'].includes(n.status)) continue;
      if (this.state.mimicProfiles.includes(n.id)) continue;
      if (Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 1.6) return n;
    }
    return null;
  }

  private updateMimic(dt: number) {
    const inp = this.input;
    const s = this.state;
    if (this.mimic) {
      const n = this.npcs.get(this.mimic.id)!;
      if (Math.hypot(n.pos.x - this.player.pos.x, n.pos.z - this.player.pos.z) > 1.8) { this.mimic = null; this.hud.progress(null); this.hud.toast('Mimic scan interrupted', 'warn'); return; }
      this.mimic.t += dt;
      this.hud.progress(this.mimic.t / 1.5, `MIMIC SCAN · ${n.name}`);
      if (this.mimic.t >= 1.5) {
        s.mimicProfiles.push(n.id);
        this.mimic = null; this.hud.progress(null);
        this.markDirective('mimic');
        this.xp(15, 'Root', 'Mind', 'Mimic profile');
        this.hud.toast(`MIMIC PROFILE · ${n.name}`, 'xp', 'Appearance only — not their knowledge or codes. Press again to wear it.');
      }
      return;
    }
    if (!inp.pressed('mimic')) return;
    const c = this.mimicCandidate();
    if (c) {
      if (c.firefight) { this.hud.toast('Identity scan corrupted — open-firefight target (rule P003-E).', 'warn'); return; }
      this.mimic = { id: c.id, t: 0 };
      return;
    }
    if (!s.mimicProfiles.length) { this.hud.toast('No Mimic profiles. Subdue someone quietly, then scan them.', 'warn'); return; }
    const order = [null, ...s.mimicProfiles];
    const i = order.indexOf(s.player.disguise);
    s.player.disguise = order[(i + 1) % order.length] as string | null;
    this.player.setDisguise(s.player.disguise ? CONTENT.npcs[s.player.disguise].look : null);
    this.hud.toast(s.player.disguise ? `Mimic active: ${CONTENT.npcs[s.player.disguise].name}` : 'Mimic off');
    if (s.player.disguise && OPS.includes(s.player.disguise)) this.recordChoice('T04', 'A');
  }

  private nearestInteractable(): Interactable | null {
    const p = this.player;
    let best: Interactable | null = null, bd = 99;
    for (const it of this.interactables) {
      let x = it.x, z = it.z, floor = it.floor;
      if (it.id.startsWith('npc_')) { const n = this.npcs.get(it.id.slice(4))!; x = n.pos.x; z = n.pos.z; floor = n.floor; }
      if (floor !== p.floor) continue;
      const d = Math.hypot(x - p.pos.x, z - p.pos.z);
      if (d <= (it.r ?? 1.2) && d < bd && it.label()) { best = it; bd = d; }
    }
    return best;
  }

  private spawnBullet(x: number, z: number, vx: number, vz: number, floor: number, from: 'player' | 'npc') {
    const mesh = box(0.12, 0.08, 0.12, from === 'player' ? '#9ff4ff' : '#ff7a5a', 0, 0, 0, from === 'player' ? '#3fd0e0' : '#ff3010');
    mesh.position.set(x, floor * FLOOR_HEIGHT + 1.1, z);
    this.scene.add(mesh);
    this.bullets.push({ mesh, x, z, vx, vz, floor, from, life: 1.4 });
  }

  /** NPC AI, detection, bullets. */
  private updateWorld(dt: number) {
    const p = this.player;
    const s = this.state;
    let stealthy = false;
    for (const n of this.npcs.values()) {
      let moving = 0;
      if (n.status === 'idle' && dt > 0) {
        if (n.ai === 'walk' && n.path.length) {
          const [tx, tz] = n.path[0];
          const dx = tx - n.pos.x, dz = tz - n.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.1) n.path.shift();
          else { const st = Math.min(d, n.speed * dt); n.pos.x += (dx / d) * st; n.pos.z += (dz / d) * st; n.faceTo(tx, tz, dt); moving = 1; }
          if (!n.path.length) { n.ai = 'search'; n.searchT = 0; }
        } else if (n.ai === 'search') {
          n.searchT += dt;
          const looks = OP_LOOK[n.id] ?? [0];
          const target = looks[Math.floor(n.searchT / 3.2) % looks.length];
          const tx = n.pos.x + Math.sin(target), tz = n.pos.z + Math.cos(target);
          n.faceTo(tx, tz, dt, 3);
        } else if (n.ai === 'patrol' && n.patrol) {
          if (n.wait > 0) { n.wait -= dt; }
          else {
            const [tx, tz] = n.patrol[n.patrolIdx];
            const dx = tx - n.pos.x, dz = tz - n.pos.z, d = Math.hypot(dx, dz);
            if (d < 0.1) { n.patrolIdx = (n.patrolIdx + 1) % n.patrol.length; n.wait = 1.6; }
            else { const st = Math.min(d, 1.3 * dt); n.pos.x += (dx / d) * st; n.pos.z += (dz / d) * st; n.faceTo(tx, tz, dt, 5); moving = 1; }
          }
        } else if (n.ai === 'idle' && n.patrol) {
          if (n.wait > 0) n.wait -= dt; else n.ai = 'patrol';
        } else if (n.ai === 'idle' && !n.watcher && n.floor === p.floor && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 2.6) {
          n.faceTo(p.pos.x, p.pos.z, dt, 4);
        }
        // Detection
        if (n.watcher && n.floor === p.floor && dt > 0 && this.mode === 'play') this.detect(n, dt, () => (stealthy = true));
      } else if (n.status === 'hostile' && dt > 0) moving = this.combatAi(n, dt);
      if (n.watcher && n.cone && n.floor === p.floor) n.updateCone((dx, dz, max) => this.level.rayDist(n.floor, n.pos.x, n.pos.z, dx, dz, max), p.crouch ? 0.65 : 1);
      n.update(dt, n.floor * FLOOR_HEIGHT, moving);
      n.h.root.visible = n.h.root.visible && (n.floor === 0 || p.floor === 1);
    }
    if (stealthy && p.crouch) { this.stealthT += dt; if (this.stealthT > 2.5) this.markDirective('stealth'); }
    // Bullets
    for (const b of this.bullets) {
      b.life -= dt;
      const steps = 3;
      for (let i = 0; i < steps && b.life > 0; i++) {
        b.x += (b.vx * dt) / steps; b.z += (b.vz * dt) / steps;
        const px = b.x - (b.vx * dt) / steps, pz = b.z - (b.vz * dt) / steps;
        if (!this.level.los(b.floor, px, pz, b.x, b.z) || b.x < 0 || b.z < 0 || b.x > 20 || b.z > 26) { b.life = 0; break; }
        if (b.from === 'player') {
          for (const n of this.npcs.values()) {
            if (n.floor !== b.floor || !['idle', 'hostile'].includes(n.status) || !n.h.root.visible) continue;
            if (Math.hypot(n.pos.x - b.x, n.pos.z - b.z) < 0.45) {
              if (n.status === 'idle') { if (!n.watcher) { b.life = 0; break; } this.provoke(n); }
              this.damageNpc(n, s.progress.skills.includes('steady_aim') ? 45 : 30); b.life = 0; break;
            }
          }
        } else if (b.floor === p.floor && !p.hidden && Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 0.4) {
          b.life = 0;
          if (p.dodgeT > 0) break;
          s.player.hp -= 12; this.damageT = 0.35;
          if (s.player.hp <= 0) { s.player.hp = 0; this.die('Cedric went down in the firefight.'); }
        }
      }
      b.mesh.position.set(b.x, b.floor * FLOOR_HEIGHT + 1.1, b.z);
    }
    this.bullets = this.bullets.filter((b) => { if (b.life <= 0) this.scene.remove(b.mesh); return b.life > 0; });
    // Player regen out of combat
    const inCombat = [...this.npcs.values()].some((n) => n.status === 'hostile');
    if (!inCombat && s.player.hp < 100) s.player.hp = Math.min(100, s.player.hp + dt * 4);
  }

  private detect(n: NpcActor, dt: number, onStealthy: () => void) {
    const p = this.player;
    const s = this.state;
    if (n.id === 'warden' && s.flags.warden_cleared) { n.detect = 0; return; }
    if (p.hidden) { n.detect = Math.max(0, n.detect - dt * 0.5); return; }
    const d = Math.hypot(p.pos.x - n.pos.x, p.pos.z - n.pos.z);
    const rangeMul = p.crouch ? 0.65 : 1;
    const seen = n.inCone(p.pos.x, p.pos.z, rangeMul) && this.level.los(n.floor, n.pos.x, n.pos.z, p.pos.x, p.pos.z);
    // Mimic: the warden accepts the drill uniform — until he asks for the code
    if (seen && n.id === 'warden' && s.player.disguise && OPS.includes(s.player.disguise) && !s.flags.warden_doubt) {
      n.detect = 0;
      if (!s.flags.warden_asked && d < 5) { s.flags.warden_asked = true; this.talk('warden', 'w_disguised'); }
      return;
    }
    if (seen) {
      const rate = (p.crouch ? 0.55 : 1.1) * (s.progress.skills.includes('soft_step') ? 0.6 : 1) * (s.flags.warden_alerted && n.id === 'warden' ? 1.5 : 1) * (1.5 - d / (n.coneRange * rangeMul));
      n.detect = Math.min(1, n.detect + rate * dt);
      if (n.detect >= 1) { n.detect = 0.99; this.onSpotted(n); }
    } else {
      n.detect = Math.max(0, n.detect - dt * 0.35);
      if (d < n.coneRange * 1.3 && this.level.los(n.floor, n.pos.x, n.pos.z, p.pos.x, p.pos.z)) onStealthy();
    }
  }

  private combatAi(n: NpcActor, dt: number): number {
    const p = this.player;
    if (n.floor !== p.floor) return 0;
    const dx = p.pos.x - n.pos.x, dz = p.pos.z - n.pos.z, d = Math.hypot(dx, dz);
    n.faceTo(p.pos.x, p.pos.z, dt, 10);
    const los = this.level.los(n.floor, n.pos.x, n.pos.z, p.pos.x, p.pos.z);
    let moving = 0;
    if (d > 3.5 || !los) { this.level.move(n.floor, n.pos, (dx / d) * 2.0 * dt, (dz / d) * 2.0 * dt, 0.28, false); moving = 1; }
    else if (d < 1.4) { this.level.move(n.floor, n.pos, (-dx / d) * 1.2 * dt, (-dz / d) * 1.2 * dt, 0.28, false); moving = 1; }
    n.fireCd -= dt;
    if (los && n.fireCd <= 0 && !p.hidden) {
      n.fireCd = 1.25 + Math.random() * 0.4;
      const spread = (Math.random() - 0.5) * 0.12;
      const a = Math.atan2(dx, dz) + spread;
      this.spawnBullet(n.pos.x + Math.sin(a) * 0.5, n.pos.z + Math.cos(a) * 0.5, Math.sin(a) * 12, Math.cos(a) * 12, n.floor, 'npc');
    }
    return moving;
  }

  private updateTriggers() {
    const p = this.player;
    const s = this.state;
    const a = areaAt(p.floor, p.pos.x, p.pos.z);
    if (!a) return;
    if (!s.knownAreas.includes(a.id)) s.knownAreas.push(a.id);
    if (a.id === this.lastArea) return;
    const prev = this.lastArea;
    this.lastArea = a.id;
    if (a.id === 'apt2b' && s.sweep.phase === 'pending') {
      s.sweep.phase = 'armed'; s.sweep.remaining = 300;
      s.journal.push('Entered Apartment 2B. Five-minute sweep clock started.');
      this.hud.toast('SWEEP CLOCK STARTED · 5:00', 'warn', 'Hack, search, hide, or leave — the crew is coming.');
      this.checkpoint('Apartment 2B');
    }
    if ((a.id === 'yard' || a.id === 'yard_n') && !s.flags.cp_yard && prev) { s.flags.cp_yard = true; this.checkpoint('Courtyard'); }
    if ((a.id === 'shedyard' || a.id === 'shedyard2') && !s.flags.entered_yard) {
      s.flags.entered_yard = true;
      if (!s.flags.gate_open) { this.recordChoice('T04', 'B'); this.xp(15, 'Root', 'Core', 'Slipped into the yard'); }
    }
    if (a.id === 'shed' && this.npcs.get('dax')!.status === 'idle' && !s.flags.chase_done) this.beginChase();
  }

  // ───────────────────────────── render ─────────────────────────────
  private render(dt: number) {
    if (!this.level) return;
    const u = this.pixel.uniforms;
    u.uTime.value = this.time;
    this.damageT = Math.max(0, this.damageT - dt);
    u.uDamage.value = this.damageT * 1.6;
    if (this.mode === 'chase') {
      u.uScan.value = 0;
      this.pixel.render(this.chase.scene, this.chase.camera);
      return;
    }
    const p = this.player;
    this.level.showFloor(p.floor);
    p.update(dt, p.floor * FLOOR_HEIGHT);
    if (this.mode === 'dialogue' || this.mode === 'over' || this.mode === 'menu') { /* frozen */ }
    // Camera follow + scan blend
    this.scanT = THREE.MathUtils.clamp(this.scanT + (this.scanOn && this.mode === 'play' ? dt : -dt) / 0.18, 0, 1);
    const e = this.scanT * this.scanT * (3 - 2 * this.scanT);
    u.uScan.value = e;
    document.getElementById('scanframe')!.classList.toggle('hidden', e < 0.5);
    const goal = new THREE.Vector3(p.pos.x, p.floor * FLOOR_HEIGHT + 0.8, p.pos.z);
    this.camTarget.lerp(goal, Math.min(1, dt * 6));
    const wheel = this.input.consumeMouseDelta().wheel;
    if (this.mode === 'play') this.zoom = THREE.MathUtils.clamp(this.zoom - wheel * 0.08, 0.7, 1.5);
    const dir = ISO_DIR.clone().lerp(TOP_DIR, e).normalize();
    const camUp = ISO_UP.clone().lerp(TOP_UP, e).normalize();
    const aspect = window.innerWidth / window.innerHeight;
    const half = (7.2 / this.zoom) * (1 + e * 0.25);
    this.camera.left = -half * aspect; this.camera.right = half * aspect; this.camera.top = half; this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.camTarget).addScaledVector(dir, 60);
    this.camera.up.copy(camUp);
    this.camera.lookAt(this.camTarget);
    this.sun.position.set(this.camTarget.x - 8, this.camTarget.y + 18, this.camTarget.z + 4);
    this.sun.target.position.copy(this.camTarget);
    let cam: THREE.Camera = this.camera;
    if (this.mode === 'hack') {
      const eye = new THREE.Vector3(6.3, FLOOR_HEIGHT + 1.45, 10.35);
      const look = new THREE.Vector3(6.3, FLOOR_HEIGHT + 1.15, 9.35);
      const k = this.hackT * this.hackT * (3 - 2 * this.hackT);
      this.fpCam.position.copy(this.camera.position).lerp(eye, Math.min(1, 0.85 + k * 0.15)).lerp(eye, k);
      this.fpCam.lookAt(look);
      this.fpCam.fov = 55; this.fpCam.updateProjectionMatrix();
      cam = this.fpCam;
      this.player.root.visible = false;
    }
    this.pixel.render(this.scene, cam);
    if (this.mode === 'hack') this.player.root.visible = true;
    this.updateLabels(cam);
    if (this.mode !== 'play') this.hud.prompt('');
    if (this.mode !== 'title') this.hud.update();
  }

  private updateLabels(cam: THREE.Camera) {
    const show = this.mode === 'play' || this.mode === 'qte';
    const want = new Set<string>();
    const w = window.innerWidth, h = window.innerHeight;
    const put = (key: string, x: number, y: number, z: number, html: string) => {
      const v = new THREE.Vector3(x, y, z).project(cam);
      if (v.z > 1) return;
      want.add(key);
      let el = this.labels.get(key);
      if (!el) { el = document.createElement('div'); document.getElementById('labels')!.append(el); this.labels.set(key, el); }
      if (el.innerHTML !== html) el.innerHTML = html;
      el.style.left = `${((v.x + 1) / 2) * w}px`; el.style.top = `${((1 - v.y) / 2) * h}px`;
    };
    if (show && this.mode !== 'qte') {
      const p = this.player;
      for (const n of this.npcs.values()) {
        if (!n.h.root.visible || n.floor !== p.floor) continue;
        const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
        const y = n.floor * FLOOR_HEIGHT + 2.25;
        if (n.status === 'hostile') put(n.id, n.pos.x, y, n.pos.z, `<div class="alert">!</div><div class="meter"><i style="width:${Math.max(0, n.hp) / 60 * 100}%;background:var(--red)"></i></div>`);
        else if (n.watcher && n.detect > 0.02 && n.status === 'idle') put(n.id, n.pos.x, y, n.pos.z, `<div class="name">${esc(n.name)}</div><div class="meter"><i style="width:${n.detect * 100}%"></i></div>`);
        else if ((d < 4.5 || this.scanOn) && n.status !== 'gone') put(n.id, n.pos.x, y, n.pos.z, `<div class="name">${esc(n.name)}${['captured', 'ko', 'dead'].includes(n.status) ? ` · ${n.status.toUpperCase()}` : ''}</div>`);
      }
      if (this.scanOn) {
        const range = this.state.progress.skills.includes('keen_eye') ? 16 : 8;
        for (const it of this.interactables) {
          if (!it.clue || it.floor !== p.floor || !it.label()) continue;
          if (Math.hypot(it.x - p.pos.x, it.z - p.pos.z) > range) continue;
          put(`clue_${it.id}`, it.x, it.floor * FLOOR_HEIGHT + 0.6, it.z, '<div class="marker">◆</div>');
        }
        if (this.state.flags.know_shed && p.floor === 0) put('shedmark', 17.5, 2.8, 22, '<div class="marker">◆ S-4</div>');
      }
    }
    for (const [k, el] of this.labels) if (!want.has(k)) { el.remove(); this.labels.delete(k); }
  }
}
