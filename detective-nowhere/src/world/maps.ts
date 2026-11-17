/**
 * ASCII floor plans, 1 tile = 1 m. x = column (east), z = row (south). Camera looks from +x,+z.
 *  #  wall            .  interior floor      ,  outdoor paving     "  grass
 *  D  open doorway    L  locked door (entity) W  window (wall)       S  stairs
 *  f  low fence       g  fence gap (crouch only)                     G  yard gate (entity)
 *  E  shed rear exit (chase trigger)          (space) void
 */
export const W = 20;
export const H = 26;

export const GROUND: string[] = [
  '####################',
  '#.....#...#........#',
  '#.....#.S.#........#',
  '#.....#.S.#........#',
  '#.....#.S.#........#',
  '#.....#...#........#',
  '###D#####D#####D####',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#########DD#########',
  'f,,,,,,,,,,,,,,,,,,f',
  'f,"""",,,,,,,,,""",f',
  'f,"""",,,,,,,,,""",f',
  'f,,,,,,,,,ffffGfffff',
  'f,,,,,,,,,f,,,,,,,,f',
  'f,"""",,,,f,,,,,,,,f',
  'f,"""",,,,f,,,,#L###',
  'f,,,,,,,,,f,,,,#...#',
  'f,,,,,,,,,g,,,,#...E',
  'f,,,,,,,,,f,,,,#...#',
  'f,,,,,,,,,f,,,,#####',
  'ffffffffffffffffffff',
];

const VOID = ' '.repeat(W);
export const UPPER: string[] = [
  '####################',
  '#.....#...#........#',
  '#.....#.S.#........#',
  '#.....#.S.#........#',
  '#.....#...#........#',
  '###L#####D#####L####',
  '#..................#',
  '#..................#',
  '####D#######L#######',
  '#.......#..........#',
  '#.......#..........#',
  '#.......#..........#',
  '#.......#..........#',
  '###W################',
  ...Array(12).fill(VOID),
];

export const FLOORS = [GROUND, UPPER];
export const FLOOR_HEIGHT = 3.2;

export interface Area { id: string; name: string; floor: number; x0: number; z0: number; x1: number; z1: number; }
/** Named areas — drive location label, map knowledge gating and event logic. */
export const AREAS: Area[] = [
  { id: 'apt1a', name: 'Apt 1A — Tamsin', floor: 0, x0: 1, z0: 1, x1: 6, z1: 6 },
  { id: 'stair0', name: 'Stairwell', floor: 0, x0: 7, z0: 1, x1: 10, z1: 6 },
  { id: 'apt1b', name: 'Apt 1B — Hollis', floor: 0, x0: 11, z0: 1, x1: 19, z1: 6 },
  { id: 'lobby', name: 'Lobby', floor: 0, x0: 1, z0: 7, x1: 19, z1: 13 },
  { id: 'yard', name: 'Courtyard', floor: 0, x0: 0, z0: 14, x1: 10, z1: 26 },
  { id: 'yard_n', name: 'Courtyard', floor: 0, x0: 10, z0: 14, x1: 20, z1: 17 },
  { id: 'shedyard', name: 'Shed Yard (S-4)', floor: 0, x0: 11, z0: 18, x1: 15, z1: 25 },
  { id: 'shedyard2', name: 'Shed Yard (S-4)', floor: 0, x0: 15, z0: 18, x1: 20, z1: 20 },
  { id: 'shed', name: 'Utility Shed', floor: 0, x0: 16, z0: 21, x1: 19, z1: 24 },
  { id: 'apt2a', name: 'Apt 2A (vacant)', floor: 1, x0: 1, z0: 1, x1: 6, z1: 5 },
  { id: 'stair1', name: 'Stairwell — Floor 2', floor: 1, x0: 7, z0: 1, x1: 10, z1: 5 },
  { id: 'hall2', name: 'Floor 2 Hallway', floor: 1, x0: 1, z0: 6, x1: 19, z1: 8 },
  { id: 'apt2b', name: 'Apt 2B — Corin Ashe', floor: 1, x0: 1, z0: 9, x1: 8, z1: 13 },
  { id: 'apt2c', name: 'Apt 2C (storage)', floor: 1, x0: 9, z0: 9, x1: 19, z1: 13 },
];

export function areaAt(floor: number, x: number, z: number): Area | undefined {
  return AREAS.find((a) => a.floor === floor && x >= a.x0 && x < a.x1 && z >= a.z0 && z < a.z1);
}

export function tile(floor: number, x: number, z: number): string {
  const row = FLOORS[floor]?.[Math.floor(z)];
  if (!row) return ' ';
  return row[Math.floor(x)] ?? ' ';
}
