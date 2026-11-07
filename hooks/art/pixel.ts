// Pixel grids for the built-in art: a grid of palette indices (-1 = empty) becomes runs, and the
// animations are transforms of the base pose, so every generated character moves the same way.
import type { Character } from '../characters'
import { seed as hash } from '../game'

export type Grid = number[][]

export function encode(g: Grid): string {
  const runs: string[] = []
  g.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x] ?? -1
      if (c < 0) {
        x++
        continue
      }
      let e = x + 1
      while (e < row.length && row[e] === c) e++
      runs.push(`${x}.${y}.${e - x}.${c}`)
      x = e
    }
  })
  return runs.join(';')
}

export const fromMap = (rows: readonly string[], legend: Record<string, number>): Grid => rows.map(r => [...r].map(ch => legend[ch] ?? -1))

// A left half drawn by hand, mirrored into a symmetric sprite twice as wide.
export const mirrorHalf = (rows: readonly string[]): string[] => rows.map(r => r + [...r].reverse().join(''))

const blank = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<number>(w).fill(-1))
function shift(g: Grid, dx: number, dy: number): Grid {
  const h = g.length
  const w = g[0]?.length ?? 0
  const out = blank(w, h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = g[y]?.[x] ?? -1
      const nx = x + dx
      const ny = y + dy
      if (c >= 0 && nx >= 0 && ny >= 0 && nx < w && ny < h) (out[ny] as number[])[nx] = c
    }
  return out
}
// Squash: the top row goes one pixel down, the feet stay (breathing).
function squash(g: Grid): Grid {
  const h = g.length
  const top = g.findIndex(r => r.some(c => c >= 0))
  if (top < 0 || top >= h - 2) return g
  return g.map((r, y) => (y < top || y >= h - 1 ? r : y === top ? r.map(() => -1) : (g[y - 1] as number[]).map((c, x) => (c >= 0 ? c : (r[x] ?? -1)))))
}
// Death: pixels vanish in a seeded order and what is left sinks.
function dissolve(g: Grid, keep: number, s: number): Grid {
  return shift(g.map((r, y) => r.map((c, x) => (c >= 0 && (hash(`${s}:${x}:${y}`) % 100) / 100 < keep ? c : -1))), 0, Math.round((1 - keep) * 3))
}

// facing: where the character looks; the attack leans that way.
export function animate(base: Grid, palette: string[], o: { facing: 'left' | 'right'; seed: number; px?: number }): Character {
  const d = o.facing === 'right' ? 1 : -1
  return {
    w: base[0]?.length ?? 0,
    h: base.length,
    palette,
    ...(o.px ? { px: o.px } : {}),
    anim: {
      idle: [encode(base), encode(squash(base))],
      attack: [encode(shift(base, -d, 0)), encode(base), encode(shift(base, d * 2, 0))],
      hurt: [encode(shift(base, -d, 0))],
      death: [0.85, 0.6, 0.35, 0.12].map(k => encode(dissolve(base, k, o.seed))),
    },
  }
}

// Layers of same-size maps, later ones on top; '.' is transparent.
export const stack = (...layers: (readonly string[])[]): string[] =>
  (layers[0] ?? []).map((_, y) => [...(layers[0]?.[y] ?? '')].map((_, x) => layers.reduce((ch, l) => (l[y]?.[x] ?? '.') !== '.' ? (l[y]?.[x] as string) : ch, '.')).join(''))

// The dark outline: every empty pixel touching the body (up, down, left, right) becomes `ink`.
export function outline(g: Grid, ink: number): Grid {
  const at = (x: number, y: number) => (g[y]?.[x] ?? -1) >= 0
  return g.map((r, y) => r.map((c, x) => (c >= 0 ? c : at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) ? ink : -1)))
}
