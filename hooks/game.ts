// Pure game rules: nothing here touches the engine, so all of it is tested without a session.
import type { AgentStatus, Family, Fight, Phase } from '../types'

export type { Family, Fight, Phase }

export const CLASSES = ['knight', 'barbarian', 'rogue', 'samurai', 'archer', 'mage', 'cleric', 'necromancer'] as const
export type HeroClass = (typeof CLASSES)[number]
export type Style = 'melee' | 'magic' | 'arrow'
export const STYLE: Record<HeroClass, Style> = {
  knight: 'melee',
  barbarian: 'melee',
  rogue: 'melee',
  samurai: 'melee',
  archer: 'arrow',
  mage: 'magic',
  cleric: 'magic',
  necromancer: 'magic',
}
// The color of the hero's name in the pane.
export const COLORS = ['#C8323C', '#3E4FB0', '#2E8B57', '#D9822B', '#7A3FA0', '#2A9D9D', '#B8860B', '#C2417A'] as const
export type Level = 1 | 2 | 3
export type Boss = 'warlord' | 'darkKnight'

// 32-bit FNV-1a: the same id gives the same number on any machine.
export const seed = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
export const classOf = (id: string): HeroClass => CLASSES[seed(id) % CLASSES.length] ?? 'knight'
export const colorOf = (id: string): string => COLORS[Math.floor(seed(id) / CLASSES.length) % COLORS.length] ?? COLORS[0]
export const levelOf = (model: string): Level => (/haiku/i.test(model) ? 1 : /opus/i.test(model) ? 3 : 2)
// The seed of the monster this agent fights in this wave (stable while the wave lasts).
export const monsterSeed = (id: string, wave: number): number => seed(`${id}~${wave}`)

export const familyOf = (tool: string): Family =>
  /^(Read|Grep|Glob)$/.test(tool)
    ? 'read'
    : /^(Edit|Write|NotebookEdit|MultiEdit)$/.test(tool)
      ? 'edit'
      : /^(Bash|PowerShell)$/.test(tool)
        ? 'command'
        : /^(WebSearch|WebFetch)$/.test(tool)
          ? 'web'
          : 'other'

export const FIGHT0: Fight = { wave: 0, hits: 0, won: 0 }
export function hit(f: Fight, tool: string): Fight {
  const family = familyOf(tool)
  if (f.family === family) return { ...f, hits: f.hits + 1 }
  return { family, wave: f.wave + 1, hits: 1, won: f.family ? f.won + 1 : f.won }
}
// The agent finished well: the current monster takes the final blow.
export const finish = (f: Fight): Fight => (f.family ? { wave: f.wave, hits: f.hits, won: f.won + 1 } : f)
export const monsterHp = (hits: number): number => 1 / (1 + hits / 6)

const RANGE: Record<Level, [number, number]> = { 1: [2, 5], 2: [5, 10], 3: [9, 18] }
export function damage(id: string, n: number, level: Level): { value: number; critical: boolean } {
  const s = seed(`${id}#${n}`)
  const [a, b] = RANGE[level]
  const value = a + ((s >>> 4) % (b - a + 1))
  const critical = s % 10 === 0
  return { value: critical ? value * 2 : value, critical }
}
export const counter = (id: string, n: number): number => 1 + (seed(`${id}!${n}`) % 4)

// `running` = how many agents ran before this one was born; `title` = the task of the wave's first agent.
// `last` = highest phase number already in history, so numbering never restarts after a reload.
export function spawnPhase(p: Phase | null, id: string, running: number, title?: string, last = 0): Phase {
  if (p?.ids.includes(id)) return p // a resume fires agent.spawn again with the same id
  if (!p || p.end || running === 0) return { number: Math.max(p?.number ?? 0, last) + 1, ids: [id], ...(title ? { title } : {}) }
  return { ...p, ids: [...p.ids, id] }
}
// A phase's name from a task description: first line with text, spaces joined, up to 60 characters.
export function titleOf(text: string): string | undefined {
  const line = text
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .find(Boolean)
  if (!line) return undefined
  return line.length > 60 ? line.slice(0, 59) + '…' : line
}
// How long the last hero's showdown with the boss lasts before the victory banner.
export const FINALE_MS = 2500
export function endPhase(p: Phase, status: (id: string) => AgentStatus | undefined, now: number): Phase {
  if (p.end) return p
  const st = p.ids.map(status)
  if (st.some(s => s === 'running')) return { number: p.number, ids: p.ids, ...(p.title ? { title: p.title } : {}) }
  return { ...p, end: st.some(s => s === 'failed') ? 'defeat' : 'victory', endedAt: now }
}
export const bossHp = (p: Phase, status: (id: string) => AgentStatus | undefined): number =>
  p.ids.length ? p.ids.filter(id => status(id) === 'running').length / p.ids.length : 0
export const bossOf = (total: number): Boss => (total >= 4 ? 'darkKnight' : 'warlord')
