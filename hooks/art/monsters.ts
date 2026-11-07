// The monsters: one hand-drawn 16x16 mold per tool family, facing the hero, varied by the seed:
// place (3 body tones + name), eye style, optional horn/ear, spike/crest and teeth, and a squat variant.
import type { Family } from '../../types'
import type { Cast } from '../characters'
import { animate, fromMap, mirrorHalf, outline } from './pixel'

// 8-wide rows are left halves (mirrored), 16-wide rows are drawn whole, facing left.
// b/s/h = body base/shade/highlight, o = ink, w = bone, l = leather, m/M = steel,
// E/F = eye (outer/inner, styled by the seed), A/B/C = optional horn-ear / spike-crest / tooth.
// A trailing '*' marks the row the squat variant drops.
const MOLD: Record<Family, string[]> = {
  // Skeleton: big skull with hollow sockets, rib cage, rusty sword raised toward the hero.
  read: [
    '................',
    '.......hhhh.....',
    '.....hhbbbbbA...',
    '....hbbbbbbbbA..',
    '....booobbbbbs..',
    '....oEFobbbbbs..',
    '....bsoobbbbss..',
    '..M..wCwCbbss...',
    '..M...sssbss....*',
    '..M.....bs......',
    '..M..hhhhhbs....',
    '..m.h.ooooos....',
    '.lmlh.hhhhbs....',
    '..l...ohhbs.....',
    '......b...s.....',
    '.....hh..ss.....',
  ],
  // Goblin brute: long ears, spiky crest, underbite with tusks, heavy shoulders, loincloth.
  edit: [
    '.....B.B',
    '....BhBh',
    'A..hbbbb',
    'AA.hbbbb',
    '.Ahbobbb',
    '..bbEEFo',
    '..bbbbbs',
    '...sooCo',
    '...sCwws',
    '.hhbsss.*',
    'hbbbbbbb',
    'bbsbhbbb*',
    'bs.sllll',
    'bb..llwl',
    '....bb..',
    '...ss...',
  ],
  // Slime: a horned blob with a fanged maw, dripping.
  command: [
    '........',
    '.....B..',
    '..A.BhhB',
    '..Ahhhbb',
    '...hbbbb',
    '..hbbbbb',
    '..bEEFbb*',
    '.hbbEFbb',
    '.bbbbbbb',
    '.bbowooo',
    'hbbowoow',
    'bbbsooCo',
    'bbbbssss*',
    'sbsbbsbb',
    '.s.s.s.s',
    '.s.....s',
  ],
  // Bat: torn wings, big ears, fangs.
  web: [
    '........',
    '....A...',
    '....AA..',
    '.s..hbbb',
    'sbs.bbbb',
    'bhbsbEFb',
    'bbhbbbbb*',
    'bbbhsoCo',
    'bbbbbsws',
    'bsbbbbsb',
    'b.sbbbbb*',
    's..sbbbs',
    '...ssbs.',
    '.....s.s',
    '........',
    '........',
  ],
  // Beast: side view, horned head with an open fanged maw, spiked back, clawed legs.
  other: [
    '................',
    '...AA...........',
    '....AA..B.B.B...',
    '...hhbh.hBhBhB..',
    '..hbbbbhbbbbbbs.',
    '.hEFbbbbbbbbbbbs',
    '.bbobbbbbbbbbbbs',
    'hhhbbbsbbbbbbbss*',
    'bbbbbbsbbbbbbss.',
    'oCoCobsbsssbss..',
    '.wbwbbsbs.sbbs..',
    '..ssbbs.bs.sbs..',
    '.....bs..bs.bs..',
    '....bbs.bbs.bs..',
    '....ww..ww..ww..',
    '................',
  ],
}

const NOUN: Record<Family, { en: string; pt: string }> = {
  read: { en: 'Skeleton', pt: 'Esqueleto' },
  edit: { en: 'Goblin', pt: 'Goblin' },
  command: { en: 'Slime', pt: 'Lodo' },
  web: { en: 'Bat', pt: 'Morcego' },
  other: { en: 'Beast', pt: 'Fera' },
}
// 4 places per family: name and body tones [base, shade, highlight]. pt forms work for any gender.
type Place = { en: string; pt: string; tones: [string, string, string] }
const PLACES: Record<Family, Place[]> = {
  read: [
    { en: 'Crypt', pt: 'da Cripta', tones: ['#cfc7b0', '#8f8670', '#efe9d6'] },
    { en: 'Mossy', pt: 'do Musgo', tones: ['#a9b58a', '#6c7a50', '#d2dbb4'] },
    { en: 'Ashen', pt: 'das Cinzas', tones: ['#8f8a86', '#58534f', '#bdb7b1'] },
    { en: 'Frost', pt: 'da Geada', tones: ['#a8c4d6', '#62819a', '#d9ecf7'] },
  ],
  edit: [
    { en: 'Bog', pt: 'do Brejo', tones: ['#6f8f3a', '#455c22', '#97b85a'] },
    { en: 'Ember', pt: 'da Brasa', tones: ['#b5502e', '#7a2e18', '#de7a4c'] },
    { en: 'Cave', pt: 'da Caverna', tones: ['#7d7a6a', '#4f4c40', '#a6a290'] },
    { en: 'Swamp', pt: 'do Pântano', tones: ['#3f8a78', '#25584c', '#62b29e'] },
  ],
  command: [
    { en: 'Toxic', pt: 'Tóxico', tones: ['#7fbf2a', '#4c7a12', '#b4e65a'] },
    { en: 'Crimson', pt: 'Carmesim', tones: ['#b0283a', '#6e1422', '#e0505e'] },
    { en: 'Lava', pt: 'de Lava', tones: ['#e0702a', '#9a3a10', '#ffb04a'] },
    { en: 'Abyss', pt: 'do Abismo', tones: ['#4a3a8c', '#2a1f58', '#7564c0'] },
  ],
  web: [
    { en: 'Night', pt: 'da Noite', tones: ['#4a4560', '#2a2738', '#716b8c'] },
    { en: 'Blood', pt: 'de Sangue', tones: ['#8a2232', '#55121c', '#b8424e'] },
    { en: 'Storm', pt: 'da Tempestade', tones: ['#3f6680', '#243e52', '#6a94ae'] },
    { en: 'Dusk', pt: 'do Crepúsculo', tones: ['#7a4a6e', '#4c2a44', '#a6709a'] },
  ],
  other: [
    { en: 'Wild', pt: 'Selvagem', tones: ['#8a6038', '#5a3c1e', '#b4885a'] },
    { en: 'Shadow', pt: 'das Sombras', tones: ['#3c3c4c', '#22222e', '#5e5e72'] },
    { en: 'Snow', pt: 'da Neve', tones: ['#c8ccd4', '#8a90a0', '#eef0f4'] },
    { en: 'Hell', pt: 'do Inferno', tones: ['#9a2a1a', '#5e140c', '#cc4a2c'] },
  ],
}

const INK = '#1b1b22'
const EYE = '#f2f2f2'
const BONE = '#e9e4d4'
const LEATHER = '#5a3a22'
const METAL = '#8e96a3'
const METAL_HI = '#c9cfd8'
const GLOWS = ['#ff4136', '#ffd23f'] as const
const LEGEND = { o: 0, b: 1, s: 2, h: 3, e: 4, w: 5, r: 6, l: 7, m: 8, M: 9 }
// What an optional slot becomes when the seed turns it on, per mold (A horn/ear, B spike/crest).
const SLOT: Record<Family, { A: string; B: string }> = {
  read: { A: 'w', B: 'o' },
  edit: { A: 'b', B: 'o' },
  command: { A: 'w', B: 'h' },
  web: { A: 'b', B: 'o' },
  other: { A: 'w', B: 'o' },
}
// Eye styles: [outer, inner] -> glowing, white with a pupil, dark socket with a glowing pupil.
const EYES = [
  ['r', 'r'],
  ['e', 'o'],
  ['o', 'r'],
] as const

// Integer finalizer: nearby seeds (0, 1, 2...) still land far apart.
function mix(s: number): number {
  let h = s >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

export function monsterCharacter(family: Family, s: number): Cast {
  const v = mix(s)
  const place = PLACES[family][s % 4] as Place
  const [E, F] = EYES[(v >>> 2) % EYES.length] ?? EYES[0]
  const on = (bit: number) => ((v >>> bit) & 1) === 1
  const squat = (v >>> 8) % 3 === 0
  let mold = MOLD[family].map(r =>
    r
      .replace(/A/g, on(5) || family === 'other' ? SLOT[family].A : '.')
      .replace(/B/g, on(6) ? SLOT[family].B : '.')
      .replace(/C/g, on(7) ? 'w' : 'o')
      .replace(/E/g, E)
      .replace(/F/g, F),
  )
  if (squat) {
    const i = mold.findIndex(r => r.endsWith('*'))
    if (i >= 0) mold = ['', ...mold.slice(0, i), ...mold.slice(i + 1)]
  }
  // 8-wide rows are left halves (mirrored), 16-wide rows are drawn whole.
  const rows = mold.map(r => r.replace('*', '')).map(r => (r.length === 16 ? r : mirrorHalf([r.padEnd(8, '.')])[0] as string))
  const grid = outline(fromMap(rows, LEGEND), 0)
  const palette = [INK, ...place.tones, EYE, BONE, GLOWS[(v >>> 9) & 1] as string, LEATHER, METAL, METAL_HI]
  return {
    character: animate(grid, palette, { facing: 'left', seed: s, px: 3 }),
    name: { en: `${place.en} ${NOUN[family].en}`, 'pt-BR': `${NOUN[family].pt} ${place.pt}` },
  }
}
