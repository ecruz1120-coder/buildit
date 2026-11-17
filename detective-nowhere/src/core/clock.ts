/** Ryzen-5 world clock: 30 hours per sol, 500 sols per year (Design Bible §1). */
export const HOURS_PER_SOL = 30;
export const MINUTES_PER_SOL = HOURS_PER_SOL * 60;
export const SOLS_PER_YEAR = 500;

export interface ClockState { year: number; sol: number; minute: number; }

export function advanceClock(c: ClockState, minutes: number): ClockState {
  let minute = c.minute + minutes;
  let sol = c.sol;
  let year = c.year;
  while (minute >= MINUTES_PER_SOL) { minute -= MINUTES_PER_SOL; sol++; }
  while (sol > SOLS_PER_YEAR) { sol -= SOLS_PER_YEAR; year++; }
  return { year, sol, minute };
}

/** Absolute minutes since sol 0 of the year — for comparisons. */
export function clockAbs(c: ClockState): number { return c.sol * MINUTES_PER_SOL + c.minute; }

export function hm(c: ClockState): string {
  const m = Math.floor(c.minute);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatClock(c: ClockState): string {
  return `${c.year} AGC · SOL ${c.sol} · ${hm(c)}`;
}

/** Parse "HH:MM" on the given sol into a ClockState. */
export function at(c: ClockState, hhmm: string): ClockState {
  const [h, m] = hhmm.split(':').map(Number);
  return { year: c.year, sol: c.sol, minute: h * 60 + m };
}
