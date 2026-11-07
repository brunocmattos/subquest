// One shape for every character, built-in or custom, and the cast the scene draws from.
import type { Family } from '../types'
import { STYLE, classOf, monsterSeed, seed } from './game'
import type { Boss, HeroClass, Level, Style } from './game'
import { CLASS_NAME } from './i18n'
import type { Lang } from './i18n'
import { bossCharacter } from './art/bosses'
import { heroCharacter } from './art/heroes'
import { monsterCharacter } from './art/monsters'

export type Anim = 'idle' | 'attack' | 'hurt' | 'death'
/** Frames are runs "x.y.length.color;..." with color = index in `palette`. `px` = fixed pixel scale (built-in art). */
export type Character = { w: number; h: number; palette: string[]; anim: Record<Anim, string[]>; px?: number }
export type Name = Record<Lang, string>
export type Cast = { character: Character; name: Name; style?: Style }

export type Pack =
  | { kind: 'hero'; name: Name; style: Style; character: Character }
  | { kind: 'monster'; family: Family; name: Name; character: Character }
  | { kind: 'boss'; size: 'small' | 'big'; name: Name; character: Character }

const FAMILIES: readonly Family[] = ['read', 'edit', 'command', 'web', 'other']
const ANIMS: readonly Anim[] = ['idle', 'attack', 'hurt', 'death']
const RUN = /^(\d+\.\d+\.\d+\.\d+)(;\d+\.\d+\.\d+\.\d+)*$|^$/

const nameOf = (n: unknown): Name | undefined =>
  typeof n === 'string' && n ? { en: n, 'pt-BR': n } : n && typeof n === 'object' && typeof (n as Name).en === 'string' ? { en: (n as Name).en, 'pt-BR': (n as Name)['pt-BR'] || (n as Name).en } : undefined

export function parsePack(text: string): { ok: true; pack: Pack } | { ok: false; reason: string } {
  let d: Record<string, unknown>
  try {
    d = JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'not JSON' }
  }
  const name = nameOf(d.name)
  if (!name) return { ok: false, reason: 'missing name' }
  const { w, h, palette, anim } = d as { w: unknown; h: unknown; palette: unknown; anim: Record<string, unknown> | undefined }
  if (typeof w !== 'number' || typeof h !== 'number' || w < 1 || h < 1 || w > 128 || h > 128) return { ok: false, reason: 'w/h must be 1..128' }
  if (!Array.isArray(palette) || !palette.length || !palette.every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) return { ok: false, reason: 'palette must be #rrggbb colors' }
  for (const a of ANIMS) {
    const frames = anim?.[a]
    if (!Array.isArray(frames) || !frames.length || !frames.every(f => typeof f === 'string' && RUN.test(f))) return { ok: false, reason: `animation ${a} missing or malformed` }
  }
  const character: Character = { w, h, palette: palette as string[], anim: anim as Record<Anim, string[]> }
  if (d.kind === 'hero') return { ok: true, pack: { kind: 'hero', name, style: d.style === 'magic' || d.style === 'arrow' ? d.style : 'melee', character } }
  if (d.kind === 'monster') {
    if (!FAMILIES.includes(d.family as Family)) return { ok: false, reason: 'monster needs family read|edit|command|web|other' }
    return { ok: true, pack: { kind: 'monster', family: d.family as Family, name, character } }
  }
  if (d.kind === 'boss') return { ok: true, pack: { kind: 'boss', size: d.size === 'big' ? 'big' : 'small', name, character } }
  return { ok: false, reason: 'kind must be hero|monster|boss' }
}

export type Roster = {
  hero: (id: string, level: Level) => Cast & { style: Style; heroClass?: HeroClass }
  monster: (family: Family, id: string, wave: number) => Cast
  boss: (boss: Boss, s: number) => Cast
}

// Custom characters replace the built-in ones of their slot only: custom heroes replace all heroes,
// custom monsters replace their family, custom bosses their size (the seed picks among several).
export function cast(packs: readonly Pack[]): Roster {
  const heroes = packs.filter((p): p is Extract<Pack, { kind: 'hero' }> => p.kind === 'hero')
  const monsters = (f: Family) => packs.filter((p): p is Extract<Pack, { kind: 'monster' }> => p.kind === 'monster' && p.family === f)
  const bosses = (size: 'small' | 'big') => packs.filter((p): p is Extract<Pack, { kind: 'boss' }> => p.kind === 'boss' && p.size === size)
  return {
    hero: (id, level) => {
      if (heroes.length) {
        const h = heroes[seed(id) % heroes.length] as Extract<Pack, { kind: 'hero' }>
        return { character: h.character, name: h.name, style: h.style }
      }
      const c = classOf(id)
      return { character: heroCharacter(c, level, seed(id)), name: { en: CLASS_NAME.en[c], 'pt-BR': CLASS_NAME['pt-BR'][c] }, style: STYLE[c], heroClass: c }
    },
    monster: (family, id, wave) => {
      const list = monsters(family)
      const s = monsterSeed(id, wave)
      if (list.length) {
        const m = list[s % list.length] as Extract<Pack, { kind: 'monster' }>
        return { character: m.character, name: m.name }
      }
      return monsterCharacter(family, s)
    },
    boss: (b, s) => {
      const list = bosses(b === 'darkKnight' ? 'big' : 'small')
      if (list.length) {
        const custom = list[s % list.length] as Extract<Pack, { kind: 'boss' }>
        return { character: custom.character, name: custom.name }
      }
      return bossCharacter(b, s)
    },
  }
}
