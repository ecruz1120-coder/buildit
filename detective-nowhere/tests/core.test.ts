import { describe, it, expect } from 'vitest';
import { advanceClock, hm, MINUTES_PER_SOL } from '../src/core/clock';
import { seededRoll } from '../src/core/rng';
import { awardXP, gpAvailable, gpEarned, newProgress, nodeLevel, buySkill, canBuy, rank } from '../src/player/progression';
import raw from '../content/tutorial.json';
import type { Content } from '../src/content';

const C = raw as unknown as Content;

describe('world clock (30-hour sol)', () => {
  it('rolls over at 30:00, not 24:00', () => {
    const c = advanceClock({ year: 430, sol: 125, minute: 23 * 60 }, 120);
    expect(c.sol).toBe(125);
    expect(hm(c)).toBe('25:00');
    const d = advanceClock({ year: 430, sol: 125, minute: MINUTES_PER_SOL - 1 }, 2);
    expect(d.sol).toBe(126);
  });
});

describe('progression (Bible §7)', () => {
  it('splits XP 70/30 between primary and secondary node', () => {
    const p = awardXP(newProgress(), 100, 'Mind', 'Heart');
    expect(p.nodeXP.Mind - 20).toBeCloseTo(70);
    expect(p.nodeXP.Heart - 20).toBeCloseTo(30);
  });
  it('GP is 3 per 10 XP, cumulative (no rounding loss)', () => {
    let p = newProgress();
    for (let i = 0; i < 10; i++) p = awardXP(p, 5, 'Core', 'Root'); // ten awards of 5 XP
    expect(p.totalXP).toBe(50);
    expect(gpEarned(p)).toBe(15); // per-award rounding would give 10
  });
  it('skills cost GP and respect prerequisites', () => {
    let p = awardXP(newProgress(), 100, 'Mind', 'Root');
    expect(canBuy(p, 'cross_ref').ok).toBe(false);
    p = buySkill(p, 'keen_eye');
    expect(p.skills).toContain('keen_eye');
    expect(gpAvailable(p)).toBe(30 - 9);
  });
  it('node level and rank caps', () => {
    expect(nodeLevel(1e9)).toBe(10);
    expect(rank(awardXP(newProgress(), 1e7, 'Mind', 'Heart'))).toBe(20);
  });
});

describe('seeded RNG', () => {
  it('is stable per seed+label (Pim 50/50 never changes on reload)', () => {
    expect(seededRoll(1234, 'pim_witness_or_letter')).toBe(seededRoll(1234, 'pim_witness_or_letter'));
    const outcomes = new Set(Array.from({ length: 200 }, (_, i) => seededRoll(i, 'pim_witness_or_letter') < 0.5));
    expect(outcomes.size).toBe(2);
  });
});

describe('content integrity', () => {
  const nodes = C.dialogues;
  it('every dialogue link resolves', () => {
    for (const [id, n] of Object.entries(nodes)) for (const o of n.options) {
      if (o.next && !o.next.startsWith('@')) expect(nodes[o.next], `${id} -> ${o.next}`).toBeDefined();
      if (o.effects?.evidence) expect(C.evidence[o.effects.evidence]).toBeDefined();
    }
    for (const n of Object.values(nodes)) if (n.effects?.evidence) expect(C.evidence[n.effects.evidence]).toBeDefined();
  });
  it('every NPC start dialogue exists', () => { for (const n of Object.values(C.npcs)) if (n.dialogue) expect(nodes[n.dialogue]).toBeDefined(); });
  it('deduction support ids are real evidence and every question is solvable', () => {
    for (const q of C.deduction) { expect(q.support.length).toBeGreaterThan(0); for (const e of q.support) expect(C.evidence[e], e).toBeDefined(); }
  });
  it('six tutorial pivots mirror the Phase 3 schema', () => {
    expect(C.pivots.map((p) => p.id)).toEqual(['T01', 'T02', 'T03', 'T04', 'T05', 'T06']);
    for (const p of C.pivots) { expect(p.mirrors).toBeTruthy(); expect(p.choices.length).toBeGreaterThan(0); }
  });
  it('no softlock: the shed location is learnable from 4+ independent sources', () => {
    const sources = Object.entries(C.evidence).filter(([, e]) => e.flags?.includes('know_shed') || e.detail?.flags.includes('know_shed')).map(([k]) => k);
    const dialogueSources = Object.values(nodes).filter((n) => n.effects?.flag?.know_shed).length;
    expect(sources.length + dialogueSources).toBeGreaterThanOrEqual(4);
  });
});
