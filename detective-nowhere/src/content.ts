import raw from '../content/tutorial.json';
import type { Look } from './render/props';
import type { NodeName } from './player/progression';

export interface Effects {
  trust?: Record<string, number>; xp?: [number, NodeName, NodeName]; evidence?: string; flag?: Record<string, any>;
  lock?: string; contact?: string; time?: number; choice?: [string, string]; directive?: string;
}
export interface Requires { trustAtLeast?: Record<string, number>; flags?: Record<string, any>; evidence?: string[]; }
export interface DlgOption { text: string; next?: string; end?: boolean; action?: string; art?: string; requires?: Requires; lockedLabel?: string; effects?: Effects; }
export interface DlgNode { speaker: string; text: string; options: DlgOption[]; effects?: Effects; }
export interface NpcDef { name: string; role: string; floor: number; x: number; z: number; facing: number; look: Look; dialogue?: string; leaves_at?: string; patrol?: [number, number][]; }
export interface EvidenceDef { name: string; kind: string; desc: string; model?: string; flags?: string[]; detail?: { id: string; label: string; text: string; flags: string[] }; }
export interface PivotDef { id: string; title: string; mirrors: string; location: string; choices: { key: string; description: string }[]; mandatory_rule: string; }
export interface DeductionQ { id: string; question: string; answers: string[]; correct: number; support: string[]; }

export interface Content {
  case_id: string; title: string; briefing: string[]; canon_note: string;
  npcs: Record<string, NpcDef>; evidence: Record<string, EvidenceDef>; items: Record<string, { name: string; desc: string }>;
  dialogues: Record<string, DlgNode>; pivots: PivotDef[]; deduction: DeductionQ[]; directives: { id: string; label: string }[];
}
export const CONTENT = raw as unknown as Content;
