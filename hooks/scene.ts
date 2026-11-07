// The Subquest scene: the SVG of each row (hero × the monster of its task) and of the field (all × boss).
// The pane redraws every second while an agent runs, which restarts the CSS; so each drawing is a
// 1 s turn picked per agent (see `rhythm`): the hero attacks, or the monster strikes back, or both rest.
// It animates by default on purpose (the animation is the point of the mod); `/subquest motion off` asks for the still drawings.
import type { AgentStatus, Family, Fight, Phase, PhaseRecord } from '../types'
import { FINALE_MS, bossHp, bossOf, colorOf, counter, damage, levelOf, monsterHp, seed } from './game'
import type { Level, Style } from './game'
import type { Anim, Character, Roster } from './characters'
import { STRINGS } from './i18n'
import type { Lang } from './i18n'
import { feet, frameSvg } from './sprite'

export type RowData = {
  id: string
  title: string
  model: string
  modelText?: string
  status: AgentStatus
  fight: Fight
  stats: string
  /** When and from which family the previous monster fell (its death plays for 1 s). */
  fell?: { family: Family; at: number }
  /** When the agent finished: on victory the last one takes the front of the line at the boss. */
  endedAt?: number
}

const FONT = "system-ui,-apple-system,'Segoe UI',sans-serif"
const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// Approximate UI text width in px, to cut with an ellipsis.
const charEm = (ch: string): number => (/[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-Z@%mw]/.test(ch) ? 0.72 : 0.56)
const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

export const fmtK = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`)
export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

const BASE = `.tx{fill:#22231f}.mut{fill:#6a6b64}.dim{fill:#9b9c95}.trk{fill:#e9e8e2}.sep{stroke:#e2e1db}.fld{fill:#e8ecdf}.dot{fill:#cfd6c4}
@media (prefers-color-scheme: dark){.tx{fill:#ebebe6}.mut{fill:#a6a7a0}.dim{fill:#767770}.trk{fill:#2e2f2b}.sep{stroke:#34352f}.fld{fill:#252c26}.dot{fill:#353f37}}
.bob{animation:bob .5s steps(2) infinite;transform-box:fill-box}@keyframes bob{50%{transform:translateY(-3px)}}
path{fill:none}
.a{animation-duration:calc(1s - var(--dl,0s));animation-iteration-count:infinite;animation-timing-function:steps(1);animation-delay:var(--dl,0s);animation-fill-mode:backwards;transform-box:fill-box}
.f{animation-duration:calc(1s - var(--dl,0s));animation-iteration-count:infinite;animation-timing-function:steps(1);animation-delay:var(--dl,0s);animation-fill-mode:backwards}`

// Hero's turn: runs (or aims) and lands at 40%; the monster flashes, steps back and shows the damage.
const HERO_TURN = `.hdash{animation-name:hdash}
@keyframes hdash{0%,14%{transform:translateX(0)}18%{transform:translateX(calc(var(--d)*.35))}22%{transform:translateX(calc(var(--d)*.7))}26%,56%{transform:translateX(var(--d))}60%{transform:translateX(calc(var(--d)*.45))}64%,100%{transform:translateX(0)}}
.shot{animation-name:shot;opacity:0}
@keyframes shot{0%,30%{opacity:0;transform:translateX(0)}31%{opacity:1;transform:translateX(0)}34%{transform:translateX(calc(var(--s)*.33))}37%{transform:translateX(calc(var(--s)*.66))}39%{opacity:1;transform:translateX(var(--s))}40%,100%{opacity:0;transform:translateX(var(--s))}}
.mknock{animation-name:mknock}
@keyframes mknock{0%,39%{transform:translateX(0)}40%,50%{transform:translateX(3px)}51%,60%{transform:translateX(1px)}61%,100%{transform:translateX(0)}}
.mflash{animation-name:mflash;opacity:0}
@keyframes mflash{0%,39%{opacity:0}40%,46%{opacity:.85}47%,100%{opacity:0}}
.spkm{animation-name:spkm;opacity:0}@keyframes spkm{0%,39%{opacity:0}40%,45%{opacity:1}46%,100%{opacity:0}}
.dmgm{animation-name:dmgm;opacity:0;animation-timing-function:linear}
@keyframes dmgm{0%,39%{opacity:0;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}85%{opacity:0;transform:translateY(-14px)}100%{opacity:0}}`

// Monster's turn: steps in and hits the hero at 50%, who flashes and steps back.
const MONSTER_TURN = `.matk{animation-name:matk}
@keyframes matk{0%,9%{transform:translateX(0)}10%,25%{transform:translateX(3px)}35%,60%{transform:translateX(calc(var(--md)*-1))}70%,100%{transform:translateX(0)}}
.hhurt{animation-name:hhurt}
@keyframes hhurt{0%,49%{transform:translateX(0)}50%,58%{transform:translateX(-3px)}59%,65%{transform:translateX(-1px)}66%,100%{transform:translateX(0)}}
.hflash{animation-name:hflash;opacity:0}
@keyframes hflash{0%,49%{opacity:0}50%,56%{opacity:.85}57%,100%{opacity:0}}
.spkh{animation-name:spkh;opacity:0}@keyframes spkh{0%,49%{opacity:0}50%,55%{opacity:1}56%,100%{opacity:0}}
.dmgh{animation-name:dmgh;opacity:0;animation-timing-function:linear}
@keyframes dmgh{0%,49%{opacity:0;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}90%{opacity:0;transform:translateY(-14px)}100%{opacity:0}}`

// The previous monster's death, once: it falls, smoke, and the new one drops in.
const DEATH = `.smoke{opacity:0;animation:smoke 1s ease-out 1 forwards;transform-box:fill-box;transform-origin:50% 50%}
@keyframes smoke{0%,44%{opacity:0;transform:scale(.4)}50%{opacity:.85;transform:scale(1)}80%,100%{opacity:0;transform:scale(1.7)}}
.drop{opacity:0;animation:drop 1s steps(1) 1 forwards}
@keyframes drop{0%,69%{opacity:0;transform:translateY(-8px)}70%{opacity:1;transform:translateY(-8px)}76%{transform:translateY(-3px)}82%{transform:translateY(0)}88%{transform:translateY(-1px)}94%,100%{opacity:1;transform:translateY(0)}}`

const FLEE = `.flee{animation:flee 1s steps(4) 1 forwards}@keyframes flee{100%{transform:translateX(70px);opacity:0}}`

// Collects only the rules the drawing used.
class Css {
  private rules = new Set<string>()
  add(r: string): void {
    this.rules.add(r)
  }
  toString(): string {
    return [...this.rules].join('\n')
  }
}
const pct = (x: number) => `${(x * 100).toFixed(2)}%`
// Frames i of n shown one at a time within the window [a, b) of the second.
function frameWindow(css: Css, a: number, b: number, n: number, times = 'infinite'): string[] {
  const once = times !== 'infinite'
  return Array.from({ length: n }, (_, i) => {
    const name = `w${Math.round(a * 100)}_${Math.round(b * 100)}_${n}_${i}${once ? 'o' : ''}`
    // the delay (--dl) comes from the figure; the shorter duration makes the swing end with the 1 s window
    css.add(
      `.${name}{opacity:0;${once ? `animation:${name} 1s steps(1) ${times}` : `animation-name:${name}`}}@keyframes ${name}{0%{opacity:0}${pct(a + ((b - a) * i) / n)}{opacity:1}${pct(a + ((b - a) * (i + 1)) / n)}{opacity:0}100%{opacity:0}}`,
    )
    return name
  })
}

// An animation's frames playing within [a, b); `still` = the 1st frame only. At most 4 frames per
// animation (spaced out): the app refuses the whole pane when the SVGs add up past ~256 KB.
const MAX_FRAMES = 4
function strip(css: Css, p: Character, anim: Anim, a: number, b: number, times?: string, still = false, max = MAX_FRAMES): string {
  const total = p.anim[anim].length
  const n = still ? 1 : Math.min(total, max)
  const which = (i: number) => (n === total ? i : Math.floor((i * total) / n))
  if (n === 1 && a === 0 && b === 1) return frameSvg(p, anim, 0)
  return frameWindow(css, a, b, n, times)
    .map((cls, i) => `<g class="${times ? '' : 'f '}${cls}">${frameSvg(p, anim, which(i))}</g>`)
    .join('')
}

// Where to draw a character so the middle of its body is at `cx` and its feet on `floor`.
function place(p: Character, cx: number, floor: number, s: number) {
  const q = feet(p)
  return { x: cx - q.x * s, y: floor - (q.y + 1) * s }
}
// Built-in art has a fixed integer scale; a custom pack is fit so its body (head to feet) is `tall` px, at most `max`.
const scaleFor = (p: Character, tall: number, max: number): number => {
  if (p.px) return p.px
  const q = feet(p)
  return Math.min(max, tall / Math.max(1, q.y - q.top + 1))
}

type Mode = 'hurt' | 'attack' | 'idle' | 'die' | 'arrive' | 'cheer' | 'down'

// A character in one role of the turn. Heroes attack over `dist` (melee runs to the target).
// `light`: at most 2 frames per animation (the field's heroes, several in the same SVG).
function figure(css: Css, p: Character, cx: number, floor: number, s: number, mode: Mode, o: { dist?: number; md?: number; dl?: number; still?: boolean; light?: boolean } = {}): string {
  const { x, y } = place(p, cx, floor, s)
  let body = ''
  let wrap = ''
  if (mode === 'attack') {
    css.add(HERO_TURN)
    body = strip(css, p, 'idle', 0, 0.26, undefined, true) + strip(css, p, 'attack', 0.26, 0.56, undefined, false, o.light ? 2 : MAX_FRAMES) + strip(css, p, 'idle', 0.56, 1, undefined, true)
    wrap = o.dist ? 'a hdash' : ''
  } else if (mode === 'hurt') {
    // the hero's target (monster/boss) or the hero on the monster's turn: damage at 40% or 50%
    const hero = (o.md ?? 0) < 0
    css.add(hero ? MONSTER_TURN : HERO_TURN)
    const t = hero ? 0.5 : 0.4
    body =
      strip(css, p, 'idle', 0, t, undefined, true) +
      strip(css, p, 'hurt', t, t + 0.35, undefined, false, o.light ? 1 : MAX_FRAMES) +
      strip(css, p, 'idle', t + 0.35, 1, undefined, true) +
      `<g class="a ${hero ? 'hflash' : 'mflash'}">${frameSvg(p, 'hurt', 0, '#ffffff')}</g>`
    wrap = hero ? 'a hhurt' : 'a mknock'
  } else if (mode === 'die') {
    body = strip(css, p, 'death', 0, 0.6, '1 forwards')
  } else if (mode === 'arrive') {
    css.add(DEATH)
    body = frameSvg(p, 'idle', 0)
    wrap = 'drop'
  } else if (mode === 'down') {
    body = frameSvg(p, 'death', p.anim.death.length - 1)
  } else {
    body = strip(css, p, 'idle', 0, 1, undefined, o.still)
    wrap = mode === 'cheer' ? 'bob' : ''
  }
  const style = `--d:${((o.dist ?? 0) / s).toFixed(1)}px;--md:${((o.md ?? 0) / s).toFixed(1)}px;--dl:${(o.dl ?? 0).toFixed(2)}s`
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(3)})" shape-rendering="crispEdges"${mode === 'down' ? ' opacity=".55"' : ''}><g class="${wrap}" style="${style}">${body}</g></g>`
}

// The monster on its turn: attacks with its own animation and steps in a little.
function strikeBack(css: Css, p: Character, cx: number, floor: number, s: number, md: number, dl = 0): string {
  css.add(MONSTER_TURN)
  const { x, y } = place(p, cx, floor, s)
  const body = strip(css, p, 'attack', 0, 0.8) + strip(css, p, 'idle', 0.8, 1, undefined, true)
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(3)})" shape-rendering="crispEdges"><g class="a matk" style="--md:${(md / s).toFixed(1)}px;--dl:${dl.toFixed(2)}s">${body}</g></g>`
}

const spark = (x: number, y: number, cls: string, dl = 0) =>
  `<g class="a ${cls}" style="--dl:${dl.toFixed(2)}s"><path d="M${x} ${y - 6}v12M${x - 6} ${y}h12M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#FFF3B0" stroke-width="2"/><rect x="${x - 2}" y="${y - 2}" width="4" height="4" fill="#fff"/></g>`
const damageNumber = (x: number, y: number, txt: string, cls: string, color: string, dl = 0, size = 12) =>
  `<text class="a ${cls}" style="--dl:${dl.toFixed(2)}s" x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${FONT}" font-size="${size}" font-weight="800" text-anchor="middle" fill="${color}" stroke="#00000055" stroke-width="2.5" paint-order="stroke">${xml(txt)}</text>`
function projectile(css: Css, style: Exclude<Style, 'melee'>, x: number, y: number, dist: number, dl = 0): string {
  css.add(HERO_TURN)
  const art =
    style === 'magic'
      ? `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="#4FC6EC"/><rect x="${x - 1}" y="${y - 1}" width="3" height="3" fill="#E8FBFF"/><rect x="${x - 6}" y="${y - 1}" width="3" height="2" fill="#4FC6EC" opacity=".6"/>`
      : `<rect x="${x - 8}" y="${y}" width="10" height="1" fill="#8A5A30"/><rect x="${x + 2}" y="${y - 1}" width="2" height="3" fill="#D9DDE3"/><rect x="${x - 9}" y="${y - 1}" width="2" height="3" fill="#E04848"/>`
  return `<g class="a shot" style="--s:${dist.toFixed(1)}px;--dl:${dl.toFixed(2)}s" shape-rendering="crispEdges">${art}</g>`
}
const smoke = (x: number, y: number) =>
  [[-10, -4, 9], [8, -10, 11], [4, 6, 8]].map(([dx = 0, dy = 0, r = 0]) => `<circle class="smoke" cx="${x + dx}" cy="${y + dy}" r="${r}" fill="#C9C6BE"/>`).join('')

const doc = (W: number, H: number, css: Css | string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${BASE}\n${css}</style>${body}</svg>`
// The engine's ceiling is 131,072 characters per Svg; past this, draw it still.
const CEILING = 120_000

type Hero = { p: Character; s: number; style: Style; name: string; color: string; level: Level }
function heroOf(a: RowData, roster: Roster, lang: Lang, tall: number, max: number): Hero {
  const level = levelOf(a.model)
  const c = roster.hero(a.id, level)
  return { p: c.character, s: scaleFor(c.character, tall, max), style: c.style, name: c.name[lang], color: colorOf(a.id), level }
}
const phaseBoss = (p: { number: number; ids: string[] }, roster: Roster) => roster.boss(bossOf(p.ids.length), seed(`phase-${p.number}`))

// Each agent has its own rhythm, a pure function of its id and the second: which parity attacks,
// a 0-0.35 s offset inside the second, and a rest beat (about 1 in 4) where nobody attacks.
export function rhythm(id: string, now: number): { turn: number; dl: number; rest: boolean } {
  const sec = Math.floor(now / 1000)
  // Own hash, high bits: FNV's low bits are a linear function of the id's, the same ones that pick the
  // hero class (seed(id) % 8), so any low-bit use would sync every agent of a class.
  const h = seed(`${id}:rhythm`) >>> 16
  return { turn: (sec + (h & 1)) % 2, dl: ((h >>> 1) % 36) / 100, rest: seed(`${id}@${sec}`) % 4 === 0 }
}

// --- one row of the pane

export const ROW_H = 84
const HX = 34 // middle of the hero
const MX = 118 // middle of the monster
export function rowSvg(a: RowData, W: number, now: number, roster: Roster, lang: Lang, still = false): string {
  const t = STRINGS[lang]
  const css = new Css()
  const floor = 80
  const tx = 164
  const h = heroOf(a, roster, lang, 44, 2)
  const { turn, dl, rest } = rhythm(a.id, now)
  const fam = a.fight.family
  const recent = a.fell !== undefined && now - a.fell.at < 1000 && now >= a.fell.at
  const ms = (p: Character) => scaleFor(p, 44, 2)
  const monster = fam ? roster.monster(fam, a.id, a.fight.wave) : undefined
  let stage = ''
  if (a.status === 'running' && monster) {
    const m = monster.character
    if (still) {
      stage = figure(css, h.p, HX, floor, h.s, 'idle', { still: true }) + figure(css, m, MX, floor, ms(m), 'idle', { still: true })
    } else if (recent && a.fell) {
      const old = roster.monster(a.fell.family, a.id, a.fight.wave - 1).character
      stage = figure(css, h.p, HX, floor, h.s, 'idle') + figure(css, old, MX, floor, ms(old), 'die') + smoke(MX, floor - 18) + figure(css, m, MX, floor, ms(m), 'arrive')
    } else if (rest) {
      stage = figure(css, h.p, HX, floor, h.s, 'idle') + figure(css, m, MX, floor, ms(m), 'idle')
    } else if (turn === 0) {
      const d = damage(a.id, a.fight.hits, h.level)
      stage = figure(css, h.p, HX, floor, h.s, 'attack', { dist: h.style === 'melee' ? MX - HX - 34 : 0, dl })
      if (h.style !== 'melee') stage += projectile(css, h.style, HX + 14, floor - 22, MX - HX - 26, dl)
      stage += figure(css, m, MX, floor, ms(m), 'hurt', { dl }) + spark(MX - 6, floor - 22, 'spkm', dl)
      stage += damageNumber(MX, floor - 52, d.critical ? `${t.critical} -${d.value}` : `-${d.value}`, 'dmgm', d.critical ? '#F5A623' : '#E0402A', dl)
    } else {
      stage = figure(css, h.p, HX, floor, h.s, 'hurt', { md: -1, dl }) + strikeBack(css, m, MX, floor, ms(m), 14, dl)
      stage += spark(HX + 8, floor - 22, 'spkh', dl) + damageNumber(HX, floor - 52, `-${counter(a.id, a.fight.hits)}`, 'dmgh', '#F08A24', dl)
    }
  } else if (a.status === 'running') {
    stage = figure(css, h.p, HX, floor, h.s, 'idle')
  } else if (a.status === 'done') {
    stage = figure(css, h.p, HX + 14, floor, h.s, still ? 'idle' : 'cheer', { still: true })
    if (recent && a.fell && !still) {
      const old = roster.monster(a.fell.family, a.id, a.fight.wave).character
      stage += figure(css, old, MX, floor, ms(old), 'die') + smoke(MX, floor - 18)
    }
  } else {
    stage = figure(css, h.p, HX + 14, floor, h.s, 'down')
  }

  const textW = Math.max(60, W - tx)
  const hp = a.status === 'running' && fam ? monsterHp(a.fight.hits) : 1
  const won = a.fight.won ? ` · ${t.won(a.fight.won)}` : ''
  const line3 =
    a.status === 'running'
      ? monster
        ? `${t.vs(monster.name[lang])} · ${t.wave(a.fight.wave)}${won}`
        : t.preparing
      : a.status === 'done'
        ? t.wonMonsters(a.fight.won)
        : `${t.fell} · ${t.won(a.fight.won)}`
  const bar = a.status === 'running' ? '#D0453F' : a.status === 'done' ? '#3B9C5F' : '#9b9c95'
  const label = a.status === 'running' && fam ? t.monsterEstimated(Math.round(hp * 100)) : a.status === 'done' ? t.done : a.status === 'failed' ? t.error : ''
  const text = `<text class="tx" x="${tx}" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(a.title, 13, textW))}</text>
<text x="${tx}" y="34" font-family="${FONT}" font-size="11"><tspan fill="${h.color}" font-weight="700">${xml(`${h.name} ${t.level} ${h.level}`)}</tspan><tspan class="mut">  ·  ${xml(a.modelText ?? a.model)}</tspan></text>
<text class="mut" x="${tx}" y="50" font-family="${FONT}" font-size="11">${xml(fitText(line3, 11, textW))}</text>
<rect class="trk" x="${tx}" y="57" width="${textW}" height="5" rx="2.5"/><rect x="${tx}" y="57" width="${Math.round(textW * hp)}" height="5" rx="2.5" fill="${bar}"/>
<text class="dim" x="${tx}" y="75" font-family="${FONT}" font-size="10">${xml(label)}</text>
<text class="dim" x="${W}" y="75" text-anchor="end" font-family="${FONT}" font-size="10">${xml(a.stats)}</text>
<line class="sep" x1="0" y1="${ROW_H - 0.5}" x2="${W}" y2="${ROW_H - 0.5}"/>`
  const s = doc(W, ROW_H, css, stage + text)
  return s.length > CEILING && !still ? rowSvg(a, W, now, roster, lang, true) : s
}

// The agent type adds nothing when it is Claude Code's default one.
export const modelLine = (type: string, model: string): string =>
  type.toLowerCase() === 'general-purpose' ? model : `${type} · ${model}`
export function rowText(a: RowData, roster: Roster, lang: Lang): string {
  const t = STRINGS[lang]
  const level = levelOf(a.model)
  const who = `${roster.hero(a.id, level).name[lang]} ${t.level}${level}`
  const fam = a.fight.family
  if (a.status === 'running') {
    return fam
      ? `⚔ ${who} ${t.vs(roster.monster(fam, a.id, a.fight.wave).name[lang])} · ${t.wave(a.fight.wave)}${a.fight.won ? ` · ${t.won(a.fight.won)}` : ''}`
      : `… ${who} ${t.preparing}`
  }
  return a.status === 'done' ? `✓ ${who} · ${t.wonMonsters(a.fight.won)}` : `✗ ${who} ${t.fell}`
}

// --- the phase's field (top of the pane)

// Who stands at the boss, nearest first: spawn order, but on victory the last to finish takes the front
// (the final blow is theirs, and the line shows only six).
export function lineup(p: Phase, rows: readonly RowData[]): string[] {
  const row = (id: string) => rows.find(a => a.id === id)
  const finished = p.ids.filter(id => row(id)?.status !== 'running')
  const last = finished.reduce<string | undefined>((b, id) => (b === undefined || (row(id)?.endedAt ?? 0) > (row(b)?.endedAt ?? 0) ? id : b), undefined)
  return p.end === 'victory' && last !== undefined ? [last, ...finished.filter(id => id !== last)] : finished
}

const subtitle = (p: Phase): string => (p.title ? `${p.title}${p.ids.length > 1 ? ` +${p.ids.length - 1}` : ''}` : '')

export const PHASE_H = 300
export function phaseSvg(p: Phase, rows: RowData[], W: number, now: number, roster: Roster, lang: Lang, still = false): string {
  const t = STRINGS[lang]
  const css = new Css()
  const H = PHASE_H
  const top = 56
  const floor = 196
  const turn = Math.floor(now / 1000) % 2
  const boss = phaseBoss(p, roster)
  const bp = boss.character
  const bs = scaleFor(bp, 120, 3)
  const rowOf = (id: string) => rows.find(a => a.id === id)
  const status = (id: string) => rowOf(id)?.status
  // The finale: the last hero joins the rest and all strike together (until FINAL_HIT), then the boss dies.
  const ft = p.end === 'victory' && p.endedAt !== undefined && !still ? now - p.endedAt : -1
  const fin = ft >= 0 && ft < FINALE_MS
  const FINAL_HIT = 1500
  const drain = fin ? Math.min(1, Math.max(0, (ft - 400) / 900)) : 1
  const hp = fin ? (1 - drain) / Math.max(1, p.ids.length) : p.end ? 0 : bossHp(p, status)
  const fighting = p.ids.filter(id => status(id) === 'running')
  const finished = p.ids.filter(id => status(id) !== 'running')
  const hpText = t.hpReal(Math.round(hp * 100))
  const subW = Math.max(40, W - textWidth(hpText, 11) - 12)
  const counts = `${t.atBoss(finished.length)} · ${t.fighting(fighting.length)}`
  const head = subtitle(p)
  let sub = head ? fitText(head, 11, subW) : fitText(`${t.agents(p.ids.length)} · ${counts}`, 11, subW)
  if (head && textWidth(`${sub} · ${counts}`, 11) <= subW) sub += ` · ${counts}`
  let b = `<text class="tx" x="0" y="16" font-family="${FONT}" font-size="14" font-weight="600">${xml(fitText(`${t.phase(p.number)} · ${t.lair(boss.name[lang])}`, 14, W))}</text>
<text class="mut" x="0" y="34" font-family="${FONT}" font-size="11">${xml(sub)}</text>
<text class="mut" x="${W}" y="34" text-anchor="end" font-family="${FONT}" font-size="11">${xml(hpText)}</text>
<rect class="trk" x="0" y="40" width="${W}" height="8" rx="4"/><rect x="0" y="40" width="${Math.round(W * hp)}" height="8" rx="4" fill="#D0453F"/>
<rect class="fld" x="0" y="${top}" width="${W}" height="${H - top}" rx="10"/>`
  b += `<defs><pattern id="dots" x="2" y="${top + 4}" width="16" height="16" patternUnits="userSpaceOnUse"><circle class="dot" cx="8" cy="8" r="1"/></pattern></defs><rect x="0" y="${top}" width="${W}" height="${H - top}" rx="10" fill="url(#dots)"/>`
  b += `<rect x="0" y="${floor + 4}" width="${W}" height="1.5" fill="#9DBB84" opacity=".8"/>`

  // Each hero at the boss has its own parity and offset; the boss strikes back (once) only if someone isn't attacking.
  const shown = lineup(p, rows).slice(0, 6)
  const live = shown.filter(id => status(id) !== 'failed')
  const attacks = (id: string) => fin || rhythm(id, now).turn === 0
  const atk = live.filter(attacks)
  const strike = turn === 1 && live.length > atk.length
  const impact = atk.length ? Math.min(...atk.map(id => (fin ? 0 : rhythm(id, now).dl))) : 0

  // The boss, on the right.
  // 64 px from the edge, or further in when a wide (custom) sprite would be clipped
  const bq = feet(bp)
  const bcx = Math.min(W - 64, W - 4 - (bp.w - bq.x) * bs)
  if (fin) {
    if (ft < FINAL_HIT) b += figure(css, bp, bcx, floor, bs, 'hurt')
    else if (ft < 2000) b += figure(css, bp, bcx, floor, bs, 'die') + smoke(bcx, floor - 30)
    else b += figure(css, bp, bcx, floor, bs, 'down')
  } else if (p.end === 'victory' || still) {
    b += `<g opacity="${p.end === 'victory' ? 0.3 : 1}">${figure(css, bp, bcx, floor, bs, 'idle', { still })}</g>`
  } else if (p.end === 'defeat') {
    css.add(FLEE)
    b += `<g class="flee">${figure(css, bp, bcx, floor, bs, 'idle')}</g>`
  } else if (strike) {
    b += strikeBack(css, bp, bcx, floor, bs, 20)
  } else {
    b += figure(css, bp, bcx, floor, bs, atk.length ? 'hurt' : 'idle', { dl: impact })
  }

  // Those who finished: around the boss, each on its own beat.
  let total = 0
  shown.forEach((id, i) => {
    const a = rowOf(id)
    if (!a) return
    const h = heroOf(a, roster, lang, 34, 1.6)
    // one line before the boss, alternating depth so one doesn't cover the other
    const cx = bcx - 84 - i * 32
    const foot = floor - (i % 2) * 12
    const dl = fin ? -i * 0.08 : rhythm(id, now).dl
    if (a.status === 'failed') b += figure(css, h.p, cx, floor, h.s, 'down')
    else if ((p.end === 'victory' || still) && !(fin && ft < FINAL_HIT)) b += figure(css, h.p, cx, foot, h.s, p.end === 'victory' && !still ? 'cheer' : 'idle', { still })
    else if (attacks(id)) {
      b += figure(css, h.p, cx, foot, h.s, 'attack', { dist: h.style === 'melee' ? bcx - cx - 40 : 0, dl, light: true })
      if (h.style !== 'melee') b += projectile(css, h.style, cx + 12, foot - 18, bcx - cx - 30, dl)
      total += damage(a.id, i, h.level).value
    } else b += figure(css, h.p, cx, foot, h.s, strike ? 'hurt' : 'idle', { md: -1, dl, light: true })
  })
  if (finished.length > shown.length) b += `<text class="mut" x="8" y="${floor - 50}" font-family="${FONT}" font-size="11">${xml(t.moreAtBoss(finished.length - shown.length))}</text>`
  if (!p.end && !still && shown.length) {
    if (atk.length && !strike) b += spark(bcx - 14, floor - 40, 'spkm', impact) + damageNumber(bcx, floor - 110, `-${total}`, 'dmgm', '#E0402A', impact)
    else if (strike) b += damageNumber(bcx - 110, floor - 64, `-${counter(p.ids.join(), p.number)}`, 'dmgh', '#F08A24')
  }

  if (fin && ft < FINAL_HIT && shown.length) b += spark(bcx - 14, floor - 40, 'spkm') + damageNumber(bcx - 10, floor - 118, t.finalBlow, 'dmgm', '#F5A623', 0, 20)

  // Those still working: at the edge of the field, with their monster.
  b += `<text class="mut" x="10" y="${floor + 20}" font-family="${FONT}" font-size="10.5">${fighting.length ? xml(t.edge) : ''}</text>`
  const mini = (c: Character) => (c.px ? 2 : scaleFor(c, 26, 1.2))
  fighting.slice(0, 3).forEach((id, i) => {
    const a = rowOf(id)
    if (!a) return
    const hero = roster.hero(a.id, levelOf(a.model)).character
    const sx = 6 + i * 118
    b += figure(css, hero, sx + 22, H - 12, mini(hero), 'idle', { still: true })
    const fam = a.fight.family
    if (fam) {
      const m = roster.monster(fam, a.id, a.fight.wave).character
      b += figure(css, m, sx + 74, H - 12, mini(m), 'idle', { still: true })
    }
    b += `<rect class="trk" x="${sx}" y="${H - 8}" width="104" height="3" rx="1.5"/><rect x="${sx}" y="${H - 8}" width="${Math.round(104 * (fam ? monsterHp(a.fight.hits) : 1))}" height="3" rx="1.5" fill="#D0453F"/>`
  })
  if (fighting.length > 3) b += `<text class="mut" x="${W - 6}" y="${floor + 20}" text-anchor="end" font-family="${FONT}" font-size="10.5">+${fighting.length - 3}</text>`

  if (p.end && !fin) {
    const win = p.end === 'victory'
    b += `<rect x="${W / 2 - 96}" y="${top + 16}" width="192" height="34" rx="8" fill="${win ? '#3B9C5F' : '#8E2B22'}"/>
<text x="${W / 2}" y="${top + 38}" font-family="${FONT}" font-size="14" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="1">${xml(win ? t.phaseCleared : t.partialDefeat)}</text>`
  }
  const s = doc(W, H, css, b)
  return s.length > CEILING && !still ? phaseSvg(p, rows, W, now, roster, lang, true) : s
}

export function phaseText(p: Phase, rows: RowData[], roster: Roster, lang: Lang): string[] {
  const t = STRINGS[lang]
  const status = (id: string) => rows.find(a => a.id === id)?.status
  const hp = p.end ? 0 : bossHp(p, status)
  const end = p.end === 'victory' ? ` · ${t.phaseCleared}` : p.end === 'defeat' ? ` · ${t.partialDefeat}` : ''
  const head = subtitle(p)
  return [
    `${t.phase(p.number)} · ${t.lair(phaseBoss(p, roster).name[lang])}${head ? ` · ${head}` : ''} · ${t.hpReal(Math.round(hp * 100))}${end}`,
    ...p.ids
      .map(id => rows.find(a => a.id === id))
      .filter((a): a is RowData => !!a)
      .map(a => rowText(a, roster, lang)),
  ]
}

// --- one finished phase in the history tab

export const HISTORY_H = 44
const recordStats = (r: PhaseRecord): string => `${fmtTime(r.durationMs)} · ${fmtK(r.tokens)} tok${r.costUsd > 0 ? ` · ~$${r.costUsd.toFixed(2)}` : ''}`

export function historySvg(r: PhaseRecord, W: number, roster: Roster, lang: Lang): string {
  const t = STRINGS[lang]
  const boss = roster.boss(r.boss, seed(`phase-${r.number}`))
  const p = boss.character
  const s = p.px ? 1 : scaleFor(p, 32, 2)
  const { x, y } = place(p, 22, 40, s)
  const lost = r.end === 'defeat'
  let b = `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(3)})" shape-rendering="crispEdges"${lost ? ' opacity=".45"' : ''}>${frameSvg(p, 'idle', 0)}</g>`
  if (lost) b += `<path d="M10 12l24 24M34 12l-24 24" stroke="#D0453F" stroke-width="3" stroke-linecap="round"/>`
  const tx = 52
  const stats = recordStats(r)
  const statsW = textWidth(stats, 10) + 8
  const detail = [r.title, r.end === 'victory' ? t.victory : t.defeat, t.agents(r.agents), t.monstersBeaten(r.won)].filter(Boolean).join(' · ')
  b += `<text class="tx" x="${tx}" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(`${t.phase(r.number)} · ${t.lair(boss.name[lang])}`, 13, Math.max(40, W - tx - statsW)))}</text>
<text class="dim" x="${W}" y="18" text-anchor="end" font-family="${FONT}" font-size="10">${xml(stats)}</text>
<text class="mut" x="${tx}" y="35" font-family="${FONT}" font-size="11">${xml(fitText(detail, 11, Math.max(40, W - tx)))}</text>
<line class="sep" x1="0" y1="${HISTORY_H - 0.5}" x2="${W}" y2="${HISTORY_H - 0.5}"/>`
  return doc(W, HISTORY_H, '', b)
}

export function historyText(r: PhaseRecord, roster: Roster, lang: Lang): string {
  const t = STRINGS[lang]
  const lair = t.lair(roster.boss(r.boss, seed(`phase-${r.number}`)).name[lang])
  const head = `${r.end === 'victory' ? '✓' : '✗'} ${t.phase(r.number)}`
  return [head, lair, r.title, r.end === 'victory' ? t.victory : t.defeat, t.agents(r.agents), t.monstersBeaten(r.won), recordStats(r)].filter(Boolean).join(' · ')
}
