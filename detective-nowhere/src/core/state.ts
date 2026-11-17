import type { ClockState } from './clock';
import { newProgress, type ProgressState } from '../player/progression';

export type NpcStatus = 'idle' | 'gone' | 'hidden' | 'captured' | 'ko' | 'dead' | 'hostile' | 'fled';
export interface NpcState { status: NpcStatus; floor: number; x: number; z: number; facing: number; firefight?: boolean; extra?: any; }

export type EventPhase = 'pending' | 'armed' | 'active' | 'resolved' | 'missed';

export interface GameState {
  version: number;
  seed: number;
  clock: ClockState;
  player: { floor: number; x: number; z: number; facing: number; hp: number; cst: number; ammo: number; disguise: string | null; };
  flags: Record<string, boolean | number | string>;
  trust: Record<string, number>;
  evidence: string[];
  details: string[]; // inspector details discovered
  inventory: string[];
  contacts: string[];
  mimicProfiles: string[];
  knownAreas: string[];
  locks: string[]; // permanent lock log (human readable)
  choices: Record<string, string[]>; // pivot id -> choice keys taken
  progress: ProgressState;
  directives: string[];
  npcs: Record<string, NpcState>;
  sweep: { phase: EventPhase; remaining: number };
  journal: string[];
  stats: { xpLog: { label: string; amount: number }[] };
  /** Overworld travel state (atlas pixel position on Ryzen-5). */
  world?: { active: boolean; x: number; y: number; discovered: string[]; odometer: number };
}

export function newGame(seed = (Date.now() & 0xffffff) ^ 0x5eed): GameState {
  return {
    version: 1,
    seed,
    clock: { year: 430, sol: 125, minute: 14 * 60 },
    player: { floor: 0, x: 9.5, z: 12.2, facing: Math.PI, hp: 100, cst: 6, ammo: 0, disguise: null },
    flags: {},
    trust: { tamsin: 0 },
    evidence: [],
    details: [],
    inventory: ['holoband', 'scalpel', 'mimic'],
    contacts: [],
    mimicProfiles: [],
    knownAreas: ['lobby'],
    locks: [],
    choices: {},
    progress: newProgress(),
    directives: [],
    npcs: {},
    sweep: { phase: 'pending', remaining: 300 },
    journal: ['Training sim KR-00 loaded. Tenant Corin Ashe (Apt 2B) has not been seen since early afternoon.'],
    stats: { xpLog: [] },
  };
}

export function cloneState(s: GameState): GameState { return JSON.parse(JSON.stringify(s)); }

const SAVE_KEY = 'dn_kr00_save';
const CHECKPOINT_KEY = 'dn_kr00_checkpoint';

function store(key: string, s: GameState): boolean {
  try { localStorage.setItem(key, JSON.stringify(s)); return true; } catch { return false; }
}
function load(key: string): GameState | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as GameState) : null; } catch { return null; }
}
export const saveGame = (s: GameState) => store(SAVE_KEY, s);
export const loadGame = () => load(SAVE_KEY);
export const saveCheckpoint = (s: GameState) => store(CHECKPOINT_KEY, s);
export const loadCheckpoint = () => load(CHECKPOINT_KEY);
