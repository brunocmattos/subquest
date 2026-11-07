// The heroes: Clawd (the Claude Code crab) on a 16x16 grid, facing right, dressed by class.
// Level 1 = hat, 2 = + weapon, 3 = + extra (shield, cape, quiver, aura...). The seed picks the accent color.
import type { Character } from '../characters'
import type { HeroClass, Level } from '../game'
import { animate, fromMap, outline, stack } from './pixel'

// A 16x16 layer from the rows that have something; the rest is transparent.
const L = (rows: Record<number, string>): string[] => Array.from({ length: 16 }, (_, y) => (rows[y] ?? '').padEnd(16, '.'))

const BASE = L({
  7: '..hhhhhhhhhh',
  8: '..hbbbbbbbbs',
  9: '..hbbbbkbbks',
  10: '..hbbbbkbbks',
  11: '..hbbbbbbbbs',
  12: '..ssssssssss',
  13: '...ss....ss',
  14: '...ss....ss',
})
const ARM_DOWN = L({ 9: '............bb', 10: '............ss' })
const ARM_UP = L({ 8: '............bb', 9: '............ss' })

type Look = { hat: string[]; weapon: string[]; extra: string[]; back?: string[]; armUp?: boolean }

const LOOKS: Record<HeroClass, Look> = {
  // Great helm with a plume; sword; kite shield.
  knight: {
    hat: L({
      1: '......ad',
      2: '.....aad',
      3: '....mmmmm',
      4: '...mMMMmmn',
      5: '..mMmmmmmmn',
      6: '..mmmmmmmmnn',
      7: '..nnnnnnnnnn',
      8: '..n',
      9: '..n',
    }),
    weapon: L({ 0: '.............M', 1: '.............M', 2: '.............m', 3: '.............m', 4: '.............m', 5: '.............m', 6: '.............n', 7: '............yyy', 10: '.............Y' }),
    extra: L({ 8: '.aAaa', 9: '.ayyy', 10: '.aaya', 11: '.daya', 12: '..dy', 13: '..d' }),
    armUp: true,
  },
  // Horned helm; big axe; fur mantle and war paint.
  barbarian: {
    hat: L({
      1: '.e.........e',
      2: '.e.........e',
      3: '.Ee.......eE',
      4: '..EemmmmmeE',
      5: '..mMMMmmmmn',
      6: '..nnnnnnnnnn',
    }),
    weapon: L({ 0: '.............M', 1: '............wmM', 2: '............wmM', 3: '............wnm', 4: '............w', 5: '............w', 6: '............w', 7: '............w', 10: '............W', 11: '............W' }),
    extra: L({ 7: '.WwwWwwWww', 8: '.wWw', 11: '.......o..o' }),
    armUp: true,
  },
  // Pointed hood and a mask over the mouth; dagger; second dagger and cloak.
  rogue: {
    hat: L({
      2: '...d',
      3: '...dd',
      4: '..ddaaaaa',
      5: '..daaaaaaaa',
      6: '..daAAAAAAad',
      7: '..daaaaaaaad',
      8: '..d........d',
      9: '..d',
      10: '..d',
      11: '..dDDDDDDDDD',
    }),
    weapon: L({ 4: '.............M', 5: '.............M', 6: '.............m', 7: '............nnn' }),
    extra: L({ 8: '.M', 9: '.m', 10: '.n', 11: '.dd', 12: '.dd', 13: '.d' }),
    back: L({ 9: '.d', 10: '.d', 11: '.d', 12: '.d', 13: '.d' }),
    armUp: true,
  },
  // Kabuto with a gold crest and a flared neck guard; katana; glowing blade and shoulder plate.
  samurai: {
    hat: L({
      1: '...y.....y',
      2: '...yy...yy',
      3: '....yyyyy',
      4: '...aaaaaaaa',
      5: '..aAAAaaaaad',
      6: '.ddddddddddd',
      7: '.d.dddddddd.d',
      8: '.d',
    }),
    weapon: L({ 0: '............M', 1: '............M', 2: '.............M', 3: '.............m', 4: '.............m', 5: '.............m', 6: '.............m', 7: '.............y', 10: '.............D', 11: '.............D' }),
    extra: L({ 0: '............g', 1: '............g', 2: '.............g', 3: '.............g', 4: '.............g', 5: '.............g', 6: '.............g', 9: '.ad', 10: '.dd', 11: '.ad' }),
    armUp: true,
  },
  // Feathered cap; bow; quiver of arrows.
  archer: {
    hat: L({
      2: '.e',
      3: '..e',
      4: '...eaaaaa',
      5: '..aaAAAaaa',
      6: '..aaaaaaaaad',
      7: '..dddddddddd',
    }),
    weapon: L({ 3: '............w', 4: '...........ew', 5: '...........e.w', 6: '...........e.w', 7: '...........e.w', 8: '...........e.w', 9: '...........e.w', 10: '...........e.w', 11: '...........e.w', 12: '...........ew', 13: '............w' }),
    extra: L({ 4: '.n.n', 5: '.MeM', 6: '.ww', 7: '.wW', 8: '.wW', 9: '.wW', 10: '.WW' }),
    back: L({}),
  },
  // Tall pointed hat with a gold band; staff with a glowing orb; floating sparks.
  mage: {
    hat: L({
      0: '..ad',
      1: '...ad',
      2: '...aad',
      3: '....aad',
      4: '....aAad',
      5: '...aaAaad',
      6: '.aaaaaaaaaad',
      7: '..yyyyyyyyyy',
    }),
    weapon: L({ 0: '.............g', 1: '............gMg', 2: '.............g', 3: '.............w', 4: '.............w', 5: '.............w', 6: '.............w', 7: '.............w', 10: '.............W', 11: '.............W', 12: '.............W', 13: '.............W' }),
    extra: L({ 1: '.g', 4: '..........g', 9: '.g', 12: '..............', 14: '..g' }),
    armUp: true,
  },
  // White mitre with a gold cross; mace; halo of light.
  cleric: {
    hat: L({
      2: '.....eee',
      3: '....eeyee',
      4: '....eyyye',
      5: '...eeeyeeE',
      6: '...eeeyeeE',
      7: '..yyyyyyyyyy',
    }),
    weapon: L({ 1: '............nmn', 2: '............mMm', 3: '............nmn', 4: '.............w', 5: '.............w', 6: '.............w', 7: '.............w', 10: '.............W' }),
    extra: L({ 0: '....yyyyy', 1: '...y.....y' }),
    armUp: true,
  },
  // Deep hood with a bone clasp; scythe; green soul fire in the eyes and around.
  necromancer: {
    hat: L({
      3: '....DDDD',
      4: '...DDDDDDD',
      5: '..DDaaaaaaD',
      6: '..DaDDDDDDaD',
      7: '..Da......aD',
      8: '..D',
      9: '..D',
      10: '..D',
      11: '..DDDDeDDDDD',
    }),
    weapon: L({ 0: '.........MMMM', 1: '..........nnnw', 2: '.............w', 3: '.............w', 4: '.............w', 5: '.............w', 6: '.............w', 7: '.............w', 10: '.............W', 11: '.............W', 12: '.............W', 13: '.............W' }),
    extra: L({ 9: '.......v..v', 10: '.......v..v', 2: '.v', 5: '..........', 13: '.v' }),
    armUp: true,
  },
}

const INK = '#1b1b22'
// Accent (cape, hood, hat) in 3 tones; picked by the seed, in the order of the name colors where they match.
const ACCENTS = [
  ['#C8323C', '#8a1f27', '#E85A62'],
  ['#3E4FB0', '#283480', '#6474D6'],
  ['#2E8B57', '#1d5c39', '#4FB37A'],
  ['#7A3FA0', '#522a6c', '#A065C8'],
] as const
const LEGEND = { o: 0, b: 1, s: 2, h: 3, k: 4, a: 5, d: 6, A: 7, m: 8, n: 9, M: 10, w: 11, W: 12, y: 13, Y: 14, e: 15, E: 16, g: 17, v: 18, D: 19 }

export function heroCharacter(c: HeroClass, level: Level, s: number): Character {
  const look = LOOKS[c]
  const [a, d, A] = ACCENTS[(s >>> 3) % ACCENTS.length] ?? ACCENTS[0]
  const palette = [INK, '#D97757', '#B4573A', '#F0A07E', '#111014', a, d, A, '#C9CFD8', '#7d8693', '#EEF2F6', '#8A5A30', '#5E3B1C', '#E0B040', '#A9791F', '#EDEBE4', '#B9B3A2', '#9fe8ff', '#7CFF6B', '#34343f']
  const armed = level >= 2
  const layers = [
    ...(level >= 3 && look.back ? [look.back] : []),
    BASE,
    armed && look.armUp ? ARM_UP : ARM_DOWN,
    look.hat,
    ...(armed ? [look.weapon] : []),
    ...(level >= 3 ? [look.extra] : []),
  ]
  return animate(outline(fromMap(stack(...layers), LEGEND), 0), palette, { facing: 'right', seed: s, px: 3 })
}
