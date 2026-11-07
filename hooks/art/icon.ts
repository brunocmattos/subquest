// The brand icon: Clawd in a steel helmet raising a sword, on a dark rounded square (32x32, app-icon style).
import type { Character } from '../characters'
import { encode, fromMap, outline, stack } from './pixel'
import type { Grid } from './pixel'

const S = 32
// A 32x32 layer from the rows that have something, one row down (headroom over the blade); the rest is transparent.
const L = (rows: Record<number, string>): string[] => Array.from({ length: S }, (_, y) => (rows[y - 1] ?? '').padEnd(S, '.'))

// o = ink, b/s/h = Clawd base/shade/highlight, k = eyes, m/n/M = steel, y/Y = gold, w = grip, r/q/R = plume.
const CLAWD = stack(
  L({
    16: '.......hhhhhhhhhhhhhhhs',
    17: '.......hbbbbbbbbbbbbbbs',
    18: '.......hbbbkkkbbbbkkkbs',
    19: '....bbbhbbbkkkbbbbkkkbs',
    20: '....sssbbbbkkkbbbbkkkbs',
    21: '.......hbbbbbbbbbbbbbbs',
    22: '.......hbbbbbbbbbbbbbbs',
    23: '.......ssssssssssssssss',
    24: '........ss.ss....ss.ss',
    25: '........ss.ss....ss.ss',
  }),
  // The helmet sits on the head: dome, center ridge, brim; a red plume sweeps back.
  L({
    2: '.......rr',
    3: '........rqqrr',
    4: '.........rqqqrr',
    5: '...........rqqrr',
    6: '.............yyy',
    7: '...........mmMMmmm',
    8: '.........mmMmMMmmmmn',
    9: '........mMMmmMMmmmmnn',
    10: '.......mMMmmmMMmmmmmnn',
    11: '.......mMmmmmMMmmmmmmn',
    12: '.......mmmmmmMMmmmmmmn',
    13: '.......nnnnnnnnnnnnnnn',
    14: '.....MMMMmmmmmmmmmmmmmmn',
    15: '.....nnnnnnnnnnnnnnnnnnn',
  }),
  // The sword arm, raised: blade up, gold guard, fist on the grip.
  L({
    1: '..........................M',
    2: '.........................MmM',
    3: '.........................Mmn',
    4: '.........................Mmn',
    5: '.........................Mmn',
    6: '.........................Mmn',
    7: '.........................Mmn',
    8: '.........................Mmn',
    9: '.........................Mmn',
    10: '.........................Mmn',
    11: '.........................Mmn',
    12: '.......................yyyyyyY',
    13: '..........................w',
    14: '.........................hbb',
    15: '........................bbbbs',
    16: '.......................hbbbs',
    17: '......................hbbs',
    18: '......................bs',
  }),
)

// Background: a rounded square in night bands, a few stars, a shadow under the feet.
const BANDS = ['#2b2742', '#25213a', '#201c32', '#1b182a'] as const
const STARS: readonly [number, number, number][] = [[4, 4, 1], [20, 3, 0], [29, 8, 0], [3, 12, 0], [28, 21, 0], [6, 27, 0], [15, 1, 0]]
const R = 5.5 // corner radius
function inside(x: number, y: number): boolean {
  const cx = Math.min(Math.max(x + 0.5, R), S - R)
  const cy = Math.min(Math.max(y + 0.5, R), S - R)
  return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= R * R
}

// Palette: 0 ink, Clawd 1-4, steel 5-7, gold 8-9, grip 10, plume 11-13, background 14-17, rim 18, star 19-20, shadow 21.
const PALETTE = ['#111014', '#D97757', '#B4573A', '#F0A07E', '#111014', '#C9CFD8', '#7d8693', '#EEF2F6', '#E0B040', '#A9791F', '#8A5A30', '#C8323C', '#E85A62', '#8a1f27', ...BANDS, '#3d3760', '#f6e9b8', '#8f86b3', '#141220']
const LEGEND = { o: 0, b: 1, s: 2, h: 3, k: 4, m: 5, n: 6, M: 7, y: 8, Y: 9, w: 10, r: 11, q: 12, R: 13 }

export function iconGrid(): Grid {
  const hero = outline(fromMap(CLAWD, LEGEND), 0)
  return hero.map((row, y) =>
    row.map((c, x) => {
      if (!inside(x, y)) return -1
      if (c >= 0) return c
      // 1 px ink edge, a lighter rim on the top, then the bands
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) return 0
      if (y === 1 || (y < 6 && !inside(x, y - 2))) return 18
      if (y >= 27 && y <= 28 && x >= 6 && x <= 24) return 21
      const star = STARS.find(([sx, sy]) => sx === x && sy === y)
      if (star) return star[2] ? 19 : 20
      return 14 + Math.min(3, Math.floor((y / S) * 4))
    }),
  )
}

/** The icon as a still character (every animation is the same frame), drawn with `frameSvg`. */
export function iconCharacter(): Character {
  const f = encode(iconGrid())
  return { w: S, h: S, palette: PALETTE, anim: { idle: [f], attack: [f], hurt: [f], death: [f] }, px: 8 }
}
