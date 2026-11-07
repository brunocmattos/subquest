// Converts PNG sprite sheets into Subquest character packs (one JSON per character).
// Usage: node scripts/convert.mjs <map.json> [outDir]
// The map says where the sheets are and which file is each animation of each character:
// {
//   "source": "C:/path/to/sheets",   // folder searched recursively for the file names
//   "frame": 100,                    // frame width in px (frames side by side in one row)
//   "skip": ["with shadows"],        // folder names to skip (optional, case-insensitive substring)
//   "characters": [
//     { "key": "knight", "kind": "hero", "style": "melee", "name": { "en": "Knight", "pt-BR": "Cavaleiro" },
//       "files": { "idle": "Knight_Idle.png", "attack": ["Knight_Attack01.png", "Knight_Attack.png"], "hurt": "...", "death": "..." } },
//     { "key": "slime", "kind": "monster", "family": "command", "mirror": true, "name": "Slime", "files": { ... } },
//     { "key": "brute", "kind": "boss", "size": "small", "mirror": true, "name": "Brute", "files": { ... } }
//   ]
// }
// Writes one JSON per character to outDir (default ~/.claude/subquest/packs).
// Reads only RGBA 8-bit non-interlaced PNG, with Node's zlib.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ANIMS = ['idle', 'attack', 'hurt', 'death']
const MAX_COLORS = 24

export function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let off = 8
  let w = 0
  let h = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error(`PNG is not RGBA 8-bit non-interlaced (${data[8]}/${data[9]}/${data[12]})`)
      }
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = 4
  const stride = w * bpp
  const px = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0
      const b = y > 0 ? px[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0
      let v = line[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[y * stride + x] = v & 255
    }
  }
  return { w, h, px }
}

const visible = (img, x, y) => img.px[(y * img.w + x) * 4 + 3] >= 128

// The box covering the visible pixels of all frames, so the animation does not jitter.
export function crop(frames) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -1
  let y1 = -1
  for (const f of frames) {
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (!visible(f, x, y)) continue
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

export const framesOf = (img, frameWidth) =>
  Array.from({ length: Math.floor(img.w / frameWidth) }, (_, i) => {
    const f = { w: frameWidth, h: img.h, px: Buffer.alloc(frameWidth * img.h * 4) }
    for (let y = 0; y < img.h; y++) img.px.copy(f.px, y * frameWidth * 4, (y * img.w + i * frameWidth) * 4, (y * img.w + (i + 1) * frameWidth) * 4)
    return f
  })

const hex = (img, x, y) => '#' + [0, 1, 2].map(k => img.px[(y * img.w + x) * 4 + k].toString(16).padStart(2, '0')).join('')

// Short palette: the `max` most used colors; the others map to the nearest of them.
// Transition tones of effects would break every row into many short runs and bloat the output.
export function shortPalette(counts, max) {
  const strong = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([c]) => c)
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  const nearest = new Map()
  for (const c of counts.keys()) {
    if (strong.includes(c)) {
      nearest.set(c, c)
      continue
    }
    const [r, g, b] = rgb(c)
    let best = strong[0]
    let dist = Infinity
    for (const s of strong) {
      const [R, G, B] = rgb(s)
      const d = (r - R) ** 2 * 0.3 + (g - G) ** 2 * 0.59 + (b - B) ** 2 * 0.11
      if (d < dist) {
        dist = d
        best = s
      }
    }
    nearest.set(c, best)
  }
  return nearest
}

// Frame = runs "x.y.length.color" joined by ";", color = index into the character's palette.
export function encode(frame, box, palette, mirror, colorMap = c => c) {
  const runs = []
  const sx = x => (mirror ? box.x + box.w - 1 - x : box.x + x)
  for (let y = 0; y < box.h; y++) {
    let x = 0
    while (x < box.w) {
      if (!visible(frame, sx(x), box.y + y)) {
        x++
        continue
      }
      const c = colorMap(hex(frame, sx(x), box.y + y))
      let e = x + 1
      while (e < box.w && visible(frame, sx(e), box.y + y) && colorMap(hex(frame, sx(e), box.y + y)) === c) e++
      if (!palette.includes(c)) palette.push(c)
      runs.push(`${x}.${y}.${e - x}.${palette.indexOf(c)}`)
      x = e
    }
  }
  return runs.join(';')
}

// Index every PNG under `root` by file name (first path wins), skipping folders matching `skip`.
function indexSheets(root, skip) {
  if (!root || !fs.existsSync(root)) throw new Error(`source folder not found: ${root}`)
  const lower = skip.map(s => s.toLowerCase())
  const sheets = new Map()
  ;(function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n)
      if (fs.statSync(p).isDirectory()) {
        if (!lower.some(s => n.toLowerCase().includes(s))) walk(p)
      } else if (n.endsWith('.png') && !sheets.has(n)) sheets.set(n, p)
    }
  })(root)
  return sheets
}

function convertOne(ch, sheets, frameWidth) {
  const found = {}
  for (const a of ANIMS) {
    const names = [ch.files?.[a]].flat().filter(Boolean)
    const file = names.find(n => sheets.has(n))
    if (!file) throw new Error(`${ch.key}: missing ${a} (tried ${names.join(', ')})`)
    found[a] = framesOf(readPng(fs.readFileSync(sheets.get(file))), frameWidth)
  }
  const all = Object.values(found).flat()
  const box = crop(all)
  if (box.w < 1) throw new Error(`${ch.key}: no visible pixels`)
  const counts = new Map()
  for (const f of all) for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (visible(f, x, y)) counts.set(hex(f, x, y), (counts.get(hex(f, x, y)) ?? 0) + 1)
  const nearest = shortPalette(counts, MAX_COLORS)
  const palette = []
  const anim = Object.fromEntries(ANIMS.map(a => [a, found[a].map(f => encode(f, box, palette, !!ch.mirror, c => nearest.get(c) ?? c))]))
  const out = { kind: ch.kind, name: ch.name, w: box.w, h: box.h, palette, anim }
  if (ch.family) out.family = ch.family
  if (ch.size) out.size = ch.size
  if (ch.style) out.style = ch.style
  return out
}

// Returns one entry per character: { key, ok: true, pack } or { key, ok: false, error }.
export function convert(map, outDir) {
  const sheets = indexSheets(map.source, map.skip ?? [])
  const frameWidth = map.frame
  if (!Number.isInteger(frameWidth) || frameWidth < 1) throw new Error('map.frame must be a positive integer')
  fs.mkdirSync(outDir, { recursive: true })
  return (map.characters ?? []).map(ch => {
    try {
      if (!ch.key || !/^[\w-]+$/.test(ch.key)) throw new Error(`invalid key: ${ch.key}`)
      const pack = convertOne(ch, sheets, frameWidth)
      fs.writeFileSync(path.join(outDir, `${ch.key}.json`), JSON.stringify(pack))
      return { key: ch.key, ok: true, pack }
    } catch (e) {
      return { key: ch.key, ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

export function main(argv) {
  const [mapFile, outArg] = argv
  if (!mapFile) {
    console.error('Usage: node scripts/convert.mjs <map.json> [outDir]')
    return 1
  }
  const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'))
  const outDir = outArg ?? path.join(os.homedir(), '.claude', 'subquest', 'packs')
  const results = convert(map, outDir)
  for (const r of results) {
    if (r.ok) console.log(`${r.key} ${r.pack.w}x${r.pack.h} ${r.pack.palette.length}c (${ANIMS.map(a => `${a}:${r.pack.anim[a].length}`).join(' ')})`)
    else console.error(r.error.startsWith(r.key) ? r.error : `${r.key}: ${r.error}`)
  }
  return results.some(r => !r.ok) ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  }
}
