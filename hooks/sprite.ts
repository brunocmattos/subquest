// Pack frames as SVG: runs "x.y.n.color" become one <path> per color, one run per line,
// which keeps each SVG well under the panel's 131,072 character cap.
import type { Anim, Character } from './characters'

// Where the character stands, from the 1st idle frame: its middle in x, the feet (lowest row) and
// the head (highest row). The box is bigger than the body (strike and spell effects), so this is
// what positions and scales it.
export function feet(p: Character): { x: number; y: number; top: number } {
  let sum = 0
  let n = 0
  let low = -1
  let high = Infinity
  for (const r of (p.anim.idle[0] ?? '').split(';')) {
    if (!r) continue
    const [x = 0, y = 0, len = 0] = r.split('.').map(Number)
    sum += x * len + (len * (len - 1)) / 2
    n += len
    low = Math.max(low, y)
    high = Math.min(high, y)
  }
  return n ? { x: sum / n, y: low, top: high } : { x: p.w / 2, y: p.h - 1, top: 0 }
}

// One frame (runs "x.y.n.color") as one <path> per color; `fill` paints everything one color (strike silhouette).
// Each run is a 1 px stroke through the middle of the row, moving relative to the previous one ("m3 1h4"):
// the same drawing as a rect per run with almost half the text (the app refuses the panel when the
// SVGs add up to more than ~256 KB).
export function frameSvg(p: Character, anim: Anim, i: number, fill?: string): string {
  const by = new Map<string, { d: string; x: number; y: number }>()
  for (const r of (p.anim[anim][i] ?? '').split(';')) {
    if (!r) continue
    const [x = 0, y = 0, n = 0, ci = 0] = r.split('.').map(Number)
    const c = fill ?? p.palette[ci] ?? '#000000'
    const t = by.get(c)
    if (!t) by.set(c, { d: `M${x} ${y + 0.5}h${n}`, x: x + n, y })
    else {
      t.d += `m${x - t.x} ${y - t.y}h${n}`
      t.x = x + n
      t.y = y
    }
  }
  return [...by].map(([c, t]) => `<path stroke="${c}" d="${t.d}"/>`).join('')
}
