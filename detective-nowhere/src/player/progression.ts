/**
 * Progression — Design Bible §7.
 * XP split 70% primary node / 30% secondary node. GP = 3 per 10 XP, computed
 * cumulatively from total XP so rounding never loses points.
 * NOTE: node thresholds, rank curve and skill costs are TUNING PLACEHOLDERS
 * pending the handbook numbers (Bible §15 OPEN: economy balancing).
 */
export type NodeName = 'Mind' | 'Heart' | 'Core' | 'Root';
export const NODES: NodeName[] = ['Mind', 'Heart', 'Core', 'Root'];
export const NODE_CAP = 10;
export const RANK_CAP = 20;
/** Cumulative XP needed for node level n (index = level). Placeholder curve. */
export const NODE_THRESHOLDS = [0, 20, 60, 120, 200, 300, 420, 560, 720, 900, 1100];

export interface ProgressState {
  totalXP: number;
  nodeXP: Record<NodeName, number>;
  gpSpent: number;
  skills: string[];
}

export function newProgress(): ProgressState {
  return { totalXP: 0, nodeXP: { Mind: 20, Heart: 20, Core: 20, Root: 20 }, gpSpent: 0, skills: [] };
}

export function awardXP(p: ProgressState, amount: number, primary: NodeName, secondary: NodeName): ProgressState {
  const nodeXP = { ...p.nodeXP };
  nodeXP[primary] += amount * 0.7;
  nodeXP[secondary] += amount * 0.3;
  return { ...p, totalXP: p.totalXP + amount, nodeXP };
}

export function nodeLevel(xp: number): number {
  let lvl = 0;
  for (let i = 0; i < NODE_THRESHOLDS.length; i++) if (xp + 1e-9 >= NODE_THRESHOLDS[i]) lvl = i;
  return Math.min(lvl, NODE_CAP);
}

/** Cumulative GP: floor(totalXP * 3 / 10). */
export function gpEarned(p: ProgressState): number { return Math.floor((p.totalXP * 3) / 10 + 1e-9); }
export function gpAvailable(p: ProgressState): number { return gpEarned(p) - p.gpSpent; }

export function rank(p: ProgressState): number {
  return Math.min(RANK_CAP, 1 + Math.floor(Math.sqrt(p.totalXP / 30)));
}

export interface SkillDef { id: string; tree: string; name: string; cost: number; desc: string; requires?: string; }

export const SKILLS: SkillDef[] = [
  { id: 'keen_eye', tree: 'Investigator', name: 'Keen Eye', cost: 9, desc: 'HoloBand scan range doubled; evidence hotspots pulse in the inspector.' },
  { id: 'cross_ref', tree: 'Investigator', name: 'Cross-Reference', cost: 15, desc: 'Case Report marks which of your evidence is relevant.', requires: 'keen_eye' },
  { id: 'soft_step', tree: 'Infiltrator', name: 'Soft Step', cost: 9, desc: 'Detection builds 40% slower.' },
  { id: 'quick_hands', tree: 'Infiltrator', name: 'Quick Hands', cost: 15, desc: 'Deep searches cost 8s of sweep clock instead of 15s.', requires: 'soft_step' },
  { id: 'quick_reflex', tree: 'Combatant', name: 'Quick Reflex', cost: 9, desc: 'Dodge prompts give you 50% more time.' },
  { id: 'steady_aim', tree: 'Combatant', name: 'Steady Aim', cost: 15, desc: 'Pistol damage +50%.', requires: 'quick_reflex' },
  { id: 'focused_will', tree: 'Quantum Adept', name: 'Focused Will', cost: 9, desc: '+3 maximum CST.' },
  { id: 'signal_sense', tree: 'Quantum Adept', name: 'Signal Sense', cost: 15, desc: 'Terminal intrusion window 40% wider.', requires: 'focused_will' },
];

export function canBuy(p: ProgressState, id: string): { ok: boolean; reason?: string } {
  const s = SKILLS.find((k) => k.id === id);
  if (!s) return { ok: false, reason: 'Unknown skill' };
  if (p.skills.includes(id)) return { ok: false, reason: 'Owned' };
  if (s.requires && !p.skills.includes(s.requires)) return { ok: false, reason: 'Requires previous skill' };
  if (gpAvailable(p) < s.cost) return { ok: false, reason: `Needs ${s.cost} GP` };
  return { ok: true };
}

export function buySkill(p: ProgressState, id: string): ProgressState {
  const s = SKILLS.find((k) => k.id === id)!;
  if (!canBuy(p, id).ok) return p;
  return { ...p, gpSpent: p.gpSpent + s.cost, skills: [...p.skills, id] };
}
