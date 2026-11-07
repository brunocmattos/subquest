// The bosses: 32x32, facing the party, always crowned. The wave size picks the boss (warlord for
// 1-3 agents, dark knight for 4+); the seed picks one of 4 places (palette + name).
import type { Cast } from '../characters'
import type { Boss } from '../game'
import { BOSS_NAME } from '../i18n'
import { animate, fromMap, mirrorHalf, outline, stack } from './pixel'

// A 32x32 layer from the rows that have something; the rest is transparent.
const L = (rows: Record<number, string>): string[] => Array.from({ length: 32 }, (_, y) => (rows[y] ?? '').padEnd(32, '.'))
// Left halves (16 wide) mirrored into the 32-wide body.
const M = (half: readonly string[]): string[] => mirrorHalf(half.map(r => r.padEnd(16, '.')))

// b/s/h = skin or armor (base/shade/highlight), e = eye glow, c/k = crown gold/shade, r = gem,
// m/n/M = steel base/shade/highlight, l/L = leather/dark leather, w = bone, p/P = cape.
const WARLORD = stack(
  // The cleaver, held low on the side facing the party: blade up, edge toward the heroes.
  L({
    1: '...n',
    2: '..nmn',
    3: '.Mmmmn',
    4: 'MMmmmnn',
    5: 'MMmmmmnl',
    6: 'MMmmmmnl',
    7: 'MMmmmmnl',
    8: 'MMmmmmnl',
    9: 'MMmmmmnl',
    10: 'MMmmmmnl',
    11: 'MMmmmnnl',
    12: '.Mmmnn.l',
    13: '..nn...l',
    25: '.......l',
    26: '.......l',
    27: '.......L',
  }),
  M([
    '',
    '......w',
    '......w...c..c.c',
    '......ww..cc.ccc',
    '.......ww.cccccc',
    '.......wwwkkkkkr',
    '........whhhhhhh',
    '........hbbbbbbb',
    '........hbbbbbbb',
    '........hbooobbb',
    '........bboeeobb',
    '........hbbbbsbb',
    '........sbwooooo',
    '....n...sbwwbwbo',
    '...nmn..ssbbbbbb',
    '..nmMmnnlssssbbb',
    '.nmMmmmnlhbbbbbb',
    '.nmmmmmnlhbbsbbb',
    '..nmmmnhhbbbsbbb',
    '...nnnhbbbbbsbbb',
    '....hbbbbbbsbbbb',
    '....hbbs.bbbsbbb',
    '....bbs..bbbbsbb',
    '...hbbs..LlllllL',
    '...bbss..lllMlll',
    '...sssb..lLLlLLl',
    '..........bbbs.L',
    '.........hbbbs..',
    '.........bbbbs..',
    '.........bbss...',
    '........LLLLL...',
    '.......LLLLLL...',
  ]),
)

const DARK_KNIGHT = stack(
  M([
    '',
    '.....h....c..c.c',
    '.....hh...cc.ccc',
    '......hh..cccccc',
    '.......hh.kkkkkr',
    '.......shhhhhhhh',
    '........hbbbbbbb',
    '........hbbbbbbb',
    '........hbbbbbbb',
    '........bboooooo',
    '........bboeeeee',
    '........bbbbbbbb',
    '........sbobobbb',
    '.........sbbbbbb',
    '...h......ssssss',
    '..hbh..h.hbbbbbb',
    '.hbbbhhbhbbbbbbb',
    'hbbbbbbbsbbbbbbb',
    'bbbbbbbbsbbbbsbb',
    'sbbbbbbssbbbbsbb',
    'psssssshbbbbbsbb',
    'pPhbbbsbbbbbbsbb',
    'pPPhbbbbsbbbbsbb',
    'pPP.hbbbbbbhhhhs',
    'pPP...sssshhhhss',
    '.pP......hbbsbb.',
    '.pP......hbbsb..',
    '.pPP.....hbbs...',
    '..pP.....hbbs...',
    '..p.p....bbbs...',
    '........sssss...',
    '.......ssssss...',
  ]),
  // The greatsword, point down between the feet, both hands on the hilt.
  L({
    20: '...............kc',
    21: '...............Ll',
    22: '...............Ll',
    23: '...............Ll',
    24: '..........kccccccccck',
    25: '...............Mm',
    26: '...............Mm',
    27: '...............Mm',
    28: '...............Mm',
    29: '...............Mm',
    30: '...............Mm',
    31: '................m',
  }),
)

type Place = { en: string; pt: string; tones: [string, string, string]; eye: string }
const PLACES: Record<Boss, Place[]> = {
  warlord: [
    { en: 'Crimson', pt: 'Carmesim', tones: ['#9a3a2a', '#62221a', '#c4604a'], eye: '#ffd23f' },
    { en: 'Bog', pt: 'do Brejo', tones: ['#5f7a34', '#3a4c1e', '#86a252'], eye: '#ff4136' },
    { en: 'Ashen', pt: 'das Cinzas', tones: ['#6e6862', '#45403c', '#958e86'], eye: '#ff7a1a' },
    { en: 'Frost', pt: 'do Gelo', tones: ['#5d7f9a', '#3a5268', '#86a8c2'], eye: '#9fe8ff' },
  ],
  darkKnight: [
    { en: 'Frost', pt: 'do Gelo', tones: ['#2e3a4c', '#1a2230', '#4e6680'], eye: '#9fe8ff' },
    { en: 'Blood', pt: 'de Sangue', tones: ['#3a2228', '#221216', '#64343e'], eye: '#ff3b3b' },
    { en: 'Void', pt: 'do Vazio', tones: ['#2c2440', '#181226', '#4c3e6e'], eye: '#d86bff' },
    { en: 'Plague', pt: 'da Peste', tones: ['#2e3828', '#1a2016', '#4c5c40'], eye: '#9cff3b' },
  ],
}

const LEGEND = { o: 0, b: 1, s: 2, h: 3, e: 4, c: 5, k: 6, r: 7, m: 8, n: 9, M: 10, l: 11, L: 12, w: 13, p: 14, P: 15 }
const GRID: Record<Boss, string[]> = { warlord: WARLORD, darkKnight: DARK_KNIGHT }

export function bossCharacter(b: Boss, s: number): Cast {
  const place = PLACES[b][s % 4] as Place
  const palette = ['#14141a', ...place.tones, place.eye, '#e0b040', '#a9791f', '#d0453f', '#8e96a3', '#555c68', '#d6dce4', '#6b4423', '#3e2714', '#e9e4d4', '#6a1a24', '#40101a']
  return {
    character: animate(outline(fromMap(GRID[b], LEGEND), 0), palette, { facing: 'left', seed: s, px: 3 }),
    name: { en: `${place.en} ${BOSS_NAME.en[b]}`, 'pt-BR': `${BOSS_NAME['pt-BR'][b]} ${place.pt}` },
  }
}
