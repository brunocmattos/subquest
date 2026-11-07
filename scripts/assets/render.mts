// Renders the README assets in docs/assets from the mod's real drawing code, in headless Chromium.
// Usage: npm run assets [-- icon hero bestiary questlog social custom] [-- --frames]
// --frames also dumps a few GIF frames as PNG to docs/assets/_frames (git-ignored) for checking.
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import gifenc from 'gifenc'
import { chromium } from 'playwright'
import type { Page } from 'playwright'

// The mod imports without extensions ('./sprite'), as the engine expects; this hook resolves them to .ts.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !path.extname(spec) && ctx.parentURL?.includes('/hooks/')) return next(spec + '.ts', ctx)
    return next(spec, ctx)
  },
})

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(root, 'docs', 'assets')
const FRAMES = path.join(OUT, '_frames')
const hooks = (f: string) => pathToFileURL(path.join(root, 'hooks', f)).href
const { frameSvg } = await import(hooks('sprite.ts'))
const { CLASSES, FINALE_MS, endPhase, spawnPhase, titleOf } = await import(hooks('game.ts'))
const { STRINGS, CLASS_NAME } = await import(hooks('i18n.ts'))
const { cast, parsePack } = await import(hooks('characters.ts'))
const { heroCharacter } = await import(hooks('art/heroes.ts'))
const { monsterCharacter } = await import(hooks('art/monsters.ts'))
const { bossCharacter } = await import(hooks('art/bosses.ts'))
const { iconCharacter } = await import(hooks('art/icon.ts'))
const { fmtK, fmtTime, historySvg, modelLine, phaseSvg, rowSvg } = await import(hooks('scene.ts'))
const { completed, spawned, toolUsed } = await import(hooks('tracker.ts'))
const { GIFEncoder, quantize, applyPalette, snapColorsToPalette } = gifenc

type Lang = 'en' | 'pt-BR'
type Char = { w: number; h: number; px?: number; palette: string[]; anim: Record<string, string[]> }
type Roster = ReturnType<typeof cast>

const args = process.argv.slice(2)
const dumpFrames = args.includes('--frames')
const only = args.filter(a => !a.startsWith('--'))
const want = (name: string) => !only.length || only.includes(name)
const kb = (f: string) => `${Math.round(fs.statSync(f).size / 1024)} KB`

// --- PNG decoding (Chromium screenshots: 8-bit RGB/RGBA, not interlaced), to feed the GIF encoder.
function decodePng(buf: Buffer): { w: number; h: number; data: Uint8Array } {
  let pos = 8
  let w = 0
  let h = 0
  let ct = 0
  const idat: Buffer[] = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const d = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = d.readUInt32BE(0)
      h = d.readUInt32BE(4)
      ct = d[9] ?? 0
      if (d[8] !== 8 || (ct !== 2 && ct !== 6) || d[12]) throw new Error('unsupported PNG')
    } else if (type === 'IDAT') idat.push(d)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const bpp = ct === 6 ? 4 : 3
  const stride = w * bpp
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const out = new Uint8Array(w * h * 4)
  let prev = new Uint8Array(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? (cur[i - bpp] as number) : 0
      const b = prev[i] as number
      const c = i >= bpp ? (prev[i - bpp] as number) : 0
      const x = line[i] as number
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      cur[i] = (f === 0 ? x : f === 1 ? x + a : f === 2 ? x + b : f === 3 ? x + ((a + b) >> 1) : x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
    }
    for (let x = 0; x < w; x++) {
      out.set(cur.subarray(x * bpp, x * bpp + 3), (y * w + x) * 4)
      out[(y * w + x) * 4 + 3] = bpp === 4 ? (cur[x * bpp + 3] as number) : 255
    }
    prev = cur
  }
  return { w, h, data: out }
}

// --- GIF: one global palette, unchanged pixels transparent (frames only carry what moved), loop forever.
function encodeGif(pngs: Buffer[], delayMs: number, file: string): void {
  const samples = pngs.filter((_, i) => i % 6 === 0).map(p => decodePng(p).data)
  const counts = new Map<number, number>()
  for (const data of samples)
    for (let p = 0; p < data.length; p += 4) {
      const k = ((data[p] as number) << 16) | ((data[p + 1] as number) << 8) | (data[p + 2] as number)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  let palette: number[][]
  if (counts.size <= 255) palette = [...counts.keys()].map(k => [k >> 16, (k >> 8) & 255, k & 255])
  else {
    // Quantize over the sampled frames together (weighted by how much each color covers), so every frame shares it;
    // then snap the palette onto the exact colors that cover the most (sky, panel, sprites stay true).
    const all = new Uint8Array(samples.reduce((n, d) => n + d.length, 0))
    let o = 0
    for (const d of samples) all.set(d, (o += d.length) - d.length)
    palette = quantize(all, 255)
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 120).map(([k]) => [k >> 16, (k >> 8) & 255, k & 255])
    snapColorsToPalette(palette, top, 10)
  }
  console.log(`  ${counts.size} colors sampled -> ${palette.length} in the palette`)
  const T = palette.length // the transparent slot
  palette.push([255, 0, 255])
  const gif = GIFEncoder()
  let prev: Uint8Array | undefined
  for (const png of pngs) {
    const { w, h, data } = decodePng(png)
    const index = applyPalette(data, palette.slice(0, T)) as Uint8Array
    const frame = Uint8Array.from(index)
    if (prev) for (let p = 0; p < frame.length; p++) if (index[p] === prev[p]) frame[p] = T
    gif.writeFrame(frame, w, h, { palette, delay: delayMs, transparent: !!prev, transparentIndex: T, dispose: 1 })
    prev = index
  }
  gif.finish()
  fs.writeFileSync(file, gif.bytes())
}

// --- the page every asset is drawn on: pixel fonts, the region map canvas and the battle frame.
const FONTS = 'https://fonts.googleapis.com/css2?family=Jersey+10&family=Tiny5&family=Silkscreen:wght@400;700&display=block'
const MAP = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'map.js'), 'utf8')
const CSS = `*{box-sizing:border-box}html,body{margin:0;background:#2b1e16;overflow:hidden}
#map{position:absolute;left:0;top:0;image-rendering:pixelated}
#stage{position:absolute;inset:0}
canvas{image-rendering:pixelated;display:block}
svg{shape-rendering:crispEdges;image-rendering:pixelated;display:block}
svg path{fill:none}
.tiny{font-family:'Tiny5',monospace;-webkit-font-smoothing:none;text-transform:uppercase}
.silk{font-family:'Silkscreen',monospace;-webkit-font-smoothing:none}
.frame{position:relative;padding:15px;background:repeating-linear-gradient(180deg,#774c2c 0 9px,#6c4426 9px 12px);box-shadow:inset 0 3px 0 #a3723f,inset 3px 0 0 #8e6036,inset 0 -3px 0 #46291a,inset -3px 0 0 #553521,0 0 0 3px #2b1a10,12px 12px 0 3px rgba(61,43,31,.38)}
.frame>i{position:absolute;width:9px;height:9px;background:#f2c14e;box-shadow:inset -3px -3px 0 #a87a1e}
.plate{position:absolute;left:0;right:0;top:-21px;display:flex;justify-content:center}
.plate b{font:400 24px/24px 'Tiny5',monospace;-webkit-font-smoothing:none;text-transform:uppercase;color:#3d2b1f;background:#e0ad4c;padding:6px 15px 3px;border:3px solid #2b1a10;box-shadow:inset 0 3px 0 #f6d27a,inset 0 -3px 0 #a87a1e}
.pane{background:#1f1e1c;box-shadow:0 0 0 3px #2b1a10;padding:14px 14px 10px}
.tabs{display:flex;gap:8px;margin-bottom:8px}
.tabs b{font:600 12px system-ui,'Segoe UI',sans-serif;color:#cfcec7;padding:5px 12px;border-radius:7px;border:1px solid #45433e}
.tabs b.on{background:#D97757;border-color:#D97757;color:#1b1310}
.note{font:12px system-ui,'Segoe UI',sans-serif;color:#8f8e87;margin:0 0 6px}`
// The pane in a wooden battle frame: gold rivets, a brass title plate; `width` is the pane's own width.
const FRAME_PAD = 30
const frame = (plate: string, inner: string, width: number) =>
  `<div class="frame" style="width:${width + FRAME_PAD}px">${['left:3px;top:3px', 'right:3px;top:3px', 'left:3px;bottom:3px', 'right:3px;bottom:3px'].map(s => `<i style="${s}"></i>`).join('')}<div class="plate"><b>${plate}</b></div><div class="pane">${inner}</div></div>`
const tabs = (lang: Lang, on: 'battle' | 'history') =>
  `<div class="tabs"><b class="${on === 'battle' ? 'on' : ''}">${STRINGS[lang].tabBattle}</b><b class="${on === 'history' ? 'on' : ''}">${STRINGS[lang].tabHistory}</b></div>`

// The regions, one per monster family, plus the Boss Lair and the Guild where heroes start.
const REGION: Record<Lang, Record<string, string>> = {
  en: { read: 'Skeleton\nCrypt', edit: 'Goblin\nForge', command: 'Slime\nSwamp', web: 'Bat\nPeaks', other: 'Beast\nWilds', lair: 'Boss\nLair', guild: 'Guild' },
  'pt-BR': { read: 'Cripta dos\nEsqueletos', edit: 'Forja dos\nGoblins', command: 'Pântano\ndos Lodos', web: 'Picos dos\nMorcegos', other: 'Terras\nSelvagens', lair: 'Covil\ndo Chefe', guild: 'Guilda' },
}
const oneLine = (s: string) => s.replace('\n', ' ')
const TAGLINE: Record<Lang, string> = { en: 'Your subagents are out on side quests. Watch them fight.', 'pt-BR': 'Seus subagentes saíram em missão. Assista à luta.' }
const PAPER = '#f4e8c8'

type Region = { kind: string; x: number; y: number; label?: string; r?: number; bow?: number }
type MapOpts = {
  u?: number
  seed?: number
  regions?: Region[]
  keep?: number[][] // rects [x, y, w, h] kept clear of map symbols
  sea?: 'top' | 'bottom' | 'left' | 'right'
  seaDepth?: number
  compass?: { x: number; y: number }
  ribbon?: { text: string; x: number; y: number; w: number; h: number; size: number; dy?: number }
  texts?: { text: string; x: number; y: number; [k: string]: unknown }[]
  shadows?: number[][]
  trails?: (string | number)[][] // [from kind, to kind, bow?]; default: the Guild to every place
  symbols?: number
  active?: string[]
  t?: number
}
async function setPage(page: Page, w: number, h: number, map: MapOpts, stage: string): Promise<void> {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${CSS}</style></head>` +
      `<body><canvas id="map"></canvas><div id="stage">${stage}</div><script>${MAP}</script></body></html>`,
    { waitUntil: 'networkidle' },
  )
  const faces = ["16px 'Jersey 10'", "8px 'Tiny5'", "16px 'Silkscreen'"]
  await page.evaluate(async faces => {
    await Promise.all(faces.map(f => document.fonts.load(f)))
    await document.fonts.ready
  }, faces)
  if (!(await page.evaluate(faces => faces.every(f => document.fonts.check(f)), faces))) throw new Error('pixel fonts did not load (offline?)')
  // the landmarks inside the stage (bestiary cards)
  await page.evaluate(() =>
    document.querySelectorAll('canvas[data-kind]').forEach(c => (window as unknown as { landmark: (c: Element, k: string, u: number) => void }).landmark(c, (c as HTMLElement).dataset.kind as string, 3)),
  )
  await drawMap(page, w, h, map)
}
const drawMap = (page: Page, w: number, h: number, map: MapOpts) =>
  page.evaluate(({ w, h, map }) => (window as unknown as { map: (c: unknown, o: unknown) => void }).map(document.getElementById('map'), { w, h, ...map }), { w, h, map })

// A sprite as an SVG at an integer pixel scale.
const sprite = (c: Char, scale: number, anim = 'idle', i = 0) =>
  `<svg width="${c.w * scale}" height="${c.h * scale}" viewBox="0 0 ${c.w} ${c.h}">${frameSvg(c, anim, i)}</svg>`

// --- 1. the icon
async function renderIcon(page: Page): Promise<void> {
  const c = iconCharacter() as Char
  await page.setViewportSize({ width: 512, height: 512 })
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;shape-rendering:crispEdges}svg path{fill:none}</style></head><body>${sprite(c, 16)}</body></html>`)
  const file = path.join(OUT, 'icon.png')
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } })
  console.log(`icon.png 512x512 ${kb(file)}`)
}

// --- 2. the scripted demo: a phase of 4 agents, from spawn to PHASE CLEARED, with fabricated tool calls
type Agent = {
  id: string
  type: string
  model: string
  label: string
  task: Record<Lang, string>
  calls: Record<number, string[]> // second -> tool calls
  end: number // second it finishes
  rate: { ctx: number; tok: number; usd: number } // per second of the demo
}
// The ids are picked so the party mixes classes and exactly one critical hit lands (demoCrits checks it).
const AGENTS: Agent[] = [
  { id: 'af1bbcd880004f58', type: 'Explore', model: 'claude-haiku', label: 'Haiku', task: { en: 'Map the auth flow', 'pt-BR': 'Mapear o fluxo de login' }, calls: { 0: ['Read'], 1: ['Grep', 'Read'], 2: ['Read'], 3: ['Glob'] }, end: 4, rate: { ctx: 7400, tok: 9800, usd: 0.006 } },
  { id: 'a736ae249000f773', type: 'general-purpose', model: 'claude-sonnet', label: 'Sonnet', task: { en: 'Fix flaky login test', 'pt-BR': 'Corrigir teste de login instável' }, calls: { 0: ['Read'], 1: ['Read'], 2: ['Edit'], 3: ['Edit'], 4: ['Bash'], 5: ['Bash'], 6: ['Bash'] }, end: 7, rate: { ctx: 6100, tok: 8200, usd: 0.021 } },
  { id: 'a5a40a6db002e5de', type: 'general-purpose', model: 'claude-sonnet', label: 'Sonnet', task: { en: 'Search the docs for rate limits', 'pt-BR': 'Buscar limites de taxa na documentação' }, calls: { 1: ['WebSearch'], 2: ['WebFetch'], 3: ['WebFetch'], 4: ['WebFetch'] }, end: 5, rate: { ctx: 8800, tok: 11400, usd: 0.027 } },
  { id: 'aea33ee140033edd', type: 'general-purpose', model: 'claude-opus', label: 'Opus', task: { en: 'Refactor the cache layer', 'pt-BR': 'Refatorar a camada de cache' }, calls: { 0: ['Read'], 1: ['Grep'], 2: ['Read'], 3: ['Edit'], 4: ['Edit'], 5: ['Edit'], 6: ['Bash'], 7: ['WebFetch'], 8: ['Edit'] }, end: 9, rate: { ctx: 9600, tok: 12600, usd: 0.068 } },
]
const DEMO_S = 13 // seconds: 9 of fight, the 2.5 s boss finale, then the victory banner
const PHASE_BEFORE = { number: 4, ids: ['x'], end: 'victory' as const } // so this one is Phase 5

type Run = { id: string; status: string; fight: { family?: string; wave: number; hits: number; won: number }; fell?: { family: string; at: number }; endedAt?: number }
function demoAt(sec: number, lang: Lang) {
  let list: Run[] = []
  let ph: { number: number; ids: string[]; end?: string; title?: string } | null = PHASE_BEFORE
  const base = { type: '', description: '', model: '', startedAt: 0, contextTokens: 0, tokens: 0, costUsd: 0, steps: 0 }
  for (const a of AGENTS) {
    const before = list.filter(r => r.status === 'running').length
    list = spawned(list, { ...base, id: a.id, status: 'running', fight: { wave: 0, hits: 0, won: 0 } })
    ph = spawnPhase(ph, a.id, before, titleOf(a.task[lang]))
  }
  for (let s = 0; s <= sec; s++)
    for (const a of AGENTS) {
      for (const tool of a.calls[s] ?? []) list = toolUsed(list, a.id, tool, s * 1000)
      if (s === a.end) {
        list = completed(list, a.id, 'answer', s * 1000)
        ph = endPhase(ph, (id: string) => list.find(r => r.id === id)?.status, s * 1000)
      }
    }
  const rows = AGENTS.map(a => {
    const r = list.find(x => x.id === a.id) as Run
    const t = Math.min(sec, a.end) + 0.6
    const cost = a.rate.usd * (t + 1)
    return {
      id: a.id,
      title: a.task[lang],
      model: a.model,
      modelText: modelLine(a.type, a.label),
      status: r.status,
      fight: r.fight,
      // the demo runs ~8x faster than a real agent: time and tokens are scaled to look like one
      stats: `ctx ${fmtK(14000 + a.rate.ctx * t)} · ${fmtK(a.rate.tok * t * 2.4)} tok · ~$${cost.toFixed(2)} · ${fmtTime(t * 8000)}`,
      ...(r.fell ? { fell: r.fell } : {}),
    }
  })
  return { phase: ph, rows }
}

// The demo must land a critical hit on screen: some row's drawing shows the CRIT label.
function demoCrits(roster: Roster): string[] {
  const out: string[] = []
  for (let sec = 0; sec < DEMO_S; sec++)
    for (const r of demoAt(sec, 'en').rows) if (rowSvg(r, PANE_W, sec * 1000, roster, 'en').includes(`${STRINGS.en.critical} -`)) out.push(`${sec}s ${r.title}`)
  return out
}
// When the pane redraws (restarting its CSS): every second, and every 500 ms through the boss finale.
const FINALE_AT = Math.max(...AGENTS.map(a => a.end)) * 1000
const redrawAt = (t: number): number => (t >= FINALE_AT && t < FINALE_AT + FINALE_MS + 500 ? FINALE_AT + Math.floor((t - FINALE_AT) / 500) * 500 : Math.floor(t / 1000) * 1000)

const PANE_W = 500
async function renderHero(page: Page, lang: Lang, roster: Roster): Promise<void> {
  const W = 912
  const H = 930
  const fw = PANE_W + 28 + FRAME_PAD
  const fx = (W - fw) / 2
  const fy = 162
  const R = REGION[lang]
  const map: MapOpts = {
    u: 3,
    seed: 11,
    ribbon: { text: 'SUBQUEST', x: W / 2, y: 18, w: 330, h: 60, size: 20 },
    texts: [{ text: TAGLINE[lang], x: W / 2, y: 111, halo: PAPER }],
    compass: { x: 78, y: 87 },
    regions: [
      { kind: 'guild', x: 99, y: 806, label: R.guild },
      { kind: 'read', x: 99, y: 306, label: R.read },
      { kind: 'edit', x: 99, y: 552, label: R.edit },
      { kind: 'web', x: W - 99, y: 306, label: R.web },
      { kind: 'command', x: W - 99, y: 552, label: R.command },
      { kind: 'other', x: W - 99, y: 792, label: R.other },
      { kind: 'lair', x: W / 2, y: 560 },
    ],
    trails: [['guild', 'edit', 0.1], ['edit', 'read', -0.12], ['guild', 'other', 0.08], ['other', 'command', 0.12], ['command', 'web', -0.12], ['guild', 'lair'], ['edit', 'lair'], ['command', 'lair']],
    keep: [[fx, fy - 30, fw, H], [150, 0, W - 300, 145]],
  }
  const stage = `<div style="position:absolute;left:${fx}px;top:${fy}px">${frame(STRINGS[lang].tabBattle, `${tabs(lang, 'battle')}<div id="pane"></div>`, PANE_W + 28)}</div>`
  await setPage(page, W, H, map, stage)
  const FPS_MS = 80
  const n = Math.round((DEMO_S * 1000) / FPS_MS)
  const pngs: Buffer[] = []
  let shown = -1
  let active: string[] = []
  for (let f = 0; f < n; f++) {
    const t = f * FPS_MS
    const at = redrawAt(t)
    if (at !== shown) {
      const { phase, rows } = demoAt(Math.floor(at / 1000), lang)
      const html = phaseSvg(phase, rows, PANE_W, at, roster, lang) + rows.map(r => rowSvg(r, PANE_W, at, roster, lang)).join('')
      await page.evaluate(h => {
        ;(document.getElementById('pane') as HTMLElement).innerHTML = h
      }, html)
      shown = at
      // the regions whose monsters are being fought right now get a battle marker on the map
      active = [...new Set(rows.filter(r => r.status === 'running' && r.fight.family).map(r => r.fight.family as string))]
    }
    await page.evaluate(ms => document.getAnimations().forEach(a => (a.pause(), (a.currentTime = ms))), t - at)
    await drawMap(page, W, H, { ...map, t: t / 1000, active })
    const png = await page.screenshot({ type: 'png' })
    pngs.push(png)
    if (dumpFrames && f % 5 === 3) fs.writeFileSync(path.join(FRAMES, `hero-${lang}-${String(f).padStart(3, '0')}.png`), png)
  }
  const file = path.join(OUT, lang === 'en' ? 'hero.gif' : 'hero.pt-BR.gif')
  encodeGif(pngs, FPS_MS, file)
  const size = fs.statSync(file).size
  console.log(`${path.basename(file)} ${W}x${H} ${n} frames ${kb(file)}${size > 3 * 1024 * 1024 ? '  OVER 3 MB' : ''}`)
}

// Grows the page to its content (+ `pad` below it) and redraws the map at that size.
async function fitHeight(page: Page, w: number, pad: number, map: (h: number) => MapOpts): Promise<number> {
  const h = Math.ceil(await page.evaluate(() => (document.getElementById('content') as HTMLElement).getBoundingClientRect().bottom)) + pad
  await page.setViewportSize({ width: w, height: h })
  await drawMap(page, w, h, map(h))
  return h
}
async function still(page: Page, file: string): Promise<void> {
  await page.screenshot({ path: path.join(OUT, file) })
  const vp = page.viewportSize()
  console.log(`${file} ${vp?.width}x${vp?.height} ${kb(path.join(OUT, file))}`)
}

// --- 3. the bestiary: the Guild's heroes, each region's monsters, the bosses of the Lair
const FAMILY = [
  ['read', 'Skeletons', 'Read · Grep · Glob'],
  ['edit', 'Goblins', 'Edit · Write'],
  ['command', 'Slimes', 'Bash · PowerShell'],
  ['web', 'Bats', 'WebSearch · WebFetch'],
  ['other', 'Beasts', 'any other tool'],
] as const
const STATIC_CSS = `<style>
#content{position:absolute;left:0;right:0;top:0;padding:40px 48px 0;display:flex;flex-direction:column;align-items:center;gap:30px}
.card{background:#f8efd8;border:3px solid #3d2b1f;box-shadow:inset 0 0 0 3px #e8d6ac,9px 9px 0 0 rgba(61,43,31,.32);padding:18px 24px 22px;width:100%;display:flex;gap:24px;align-items:center}
.side{width:216px;flex:none;align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:10px 8px 14px;background:var(--tint);box-shadow:inset 0 0 0 3px var(--rim)}
.card.wide{flex-direction:column;align-items:stretch}.card.wide .side{width:auto;flex-direction:row;justify-content:flex-start;gap:20px;text-align:left;padding:6px 18px}
.side h2{margin:0;font:400 24px/24px 'Tiny5',monospace;text-transform:uppercase;color:#3d2b1f}
.side p{margin:4px 0 0;font:16px/20px 'Silkscreen',monospace;color:#7a5a3e}
.cell{display:flex;flex-direction:column;align-items:center;gap:8px;font:16px 'Silkscreen',monospace;color:#3d2b1f;text-align:center}
.tile{display:flex;align-items:center;justify-content:center;background:#ecdcb4;box-shadow:inset 0 0 0 3px #d9c08e}
.lab{font:16px 'Silkscreen',monospace;color:#3d2b1f;text-align:left}.lab small{display:block;color:#7a5a3e;font-size:16px}
</style>`
// each card's side panel wears its region's ground colours (the same as the map patch)
const TINT: Record<string, [string, string]> = { read: ['#e3ddcc', '#b9b2a0'], edit: ['#e8cfa8', '#bf9f74'], command: ['#d3d8ab', '#a3ad76'], web: ['#e8dabb', '#bfaa82'], other: ['#d2dca6', '#9eae6e'], lair: ['#cfc3c6', '#97858d'], guild: ['#ecdeb3', '#c4ad78'] }
const side = (kind: string, name: string, note: string) =>
  `<div class="side" style="--tint:${TINT[kind]?.[0]};--rim:${TINT[kind]?.[1]}"><canvas data-kind="${kind}"></canvas><div><h2>${name}</h2><p>${note}</p></div></div>`
async function renderBestiary(page: Page): Promise<void> {
  const W = 1200
  const R = REGION.en
  const levels = ['Haiku', 'Sonnet', 'Opus']
  const heroes = `<div style="flex:1;display:grid;grid-template-columns:110px repeat(8,1fr);row-gap:12px;justify-items:center;align-items:center">
<div></div>${CLASSES.map((c: string) => `<div class="cell">${CLASS_NAME.en[c]}</div>`).join('')}
${[1, 2, 3].map(lv => `<div class="lab">Level ${lv}<small>${levels[lv - 1]}</small></div>${CLASSES.map((c: string, i: number) => `<div class="cell"><div class="tile" style="width:84px;height:84px">${sprite(heroCharacter(c, lv, i * 8), 4)}</div></div>`).join('')}`).join('')}</div>`
  const monsters = FAMILY.map(
    ([f, name, tools]) =>
      `<section class="card">${side(f, oneLine(R[f] as string), `${name}<br>${tools}`)}<div style="flex:1;display:grid;grid-template-columns:repeat(4,1fr);align-items:end">${[1, 2, 3, 4]
        .map(s => {
          const m = monsterCharacter(f, s)
          return `<div class="cell"><div class="tile" style="width:96px;height:96px">${sprite(m.character, 4)}</div>${m.name.en}</div>`
        })
        .join('')}</div></section>`,
  ).join('')
  const bosses = `<div style="flex:1;display:grid;grid-template-columns:repeat(4,1fr);row-gap:18px;align-items:end">${(['warlord', 'darkKnight'] as const)
    .map(b =>
      [0, 1, 2, 3]
        .map(s => {
          const x = bossCharacter(b, s)
          return `<div class="cell"><div class="tile" style="width:120px;height:120px">${sprite(x.character, 3)}</div>${x.name.en}</div>`
        })
        .join(''),
    )
    .join('')}</div>`
  const stage = `${STATIC_CSS}<div id="content" style="padding-top:150px">
<section class="card wide">${side('guild', 'The Guild', 'Heroes: 8 classes, one per agent. The model sets the level.')}${heroes}</section>
${monsters}
<section class="card">${side('lair', 'Boss Lair', 'Warlord: waves of 1-3 agents. Dark Knight: 4 or more.')}${bosses}</section>
</div>`
  const map = (h: number): MapOpts => ({
    u: 3,
    seed: 23,
    ribbon: { text: 'BESTIARY', x: W / 2, y: 18, w: 330, h: 60, size: 20 },
    texts: [{ text: 'Every character is drawn by code, pixel by pixel.', x: W / 2, y: 111, halo: PAPER }],
    compass: { x: 90, y: 84 },
    keep: [[0, 140, W, h]],
  })
  await setPage(page, W, 2400, map(2400), stage)
  await fitHeight(page, W, 70, map)
  await still(page, 'bestiary.png')
}

// --- 4. the quest log: the History tab after a few phases
const RECORDS = [
  { number: 5, title: 'Map the auth flow', boss: 'darkKnight', end: 'victory', agents: 4, won: 10, durationMs: 84000, tokens: 512000, costUsd: 1.28 },
  { number: 4, title: 'Upgrade the build to Node 24', boss: 'warlord', end: 'defeat', agents: 2, won: 3, durationMs: 131000, tokens: 268000, costUsd: 0.74 },
  { number: 3, title: 'Find where sessions expire', boss: 'warlord', end: 'victory', agents: 2, won: 4, durationMs: 38000, tokens: 61000, costUsd: 0.05 },
  { number: 2, title: 'Audit the API error handling', boss: 'darkKnight', end: 'victory', agents: 5, won: 14, durationMs: 246000, tokens: 1184000, costUsd: 3.12 },
  { number: 1, title: 'Write tests for the billing module', boss: 'warlord', end: 'victory', agents: 3, won: 7, durationMs: 172000, tokens: 433000, costUsd: 0.96 },
]
async function renderQuestLog(page: Page, roster: Roster): Promise<void> {
  const W = 900
  const t = STRINGS.en
  const R = REGION.en
  const inner = `${tabs('en', 'history')}<p class="note">${t.sessionTotal(RECORDS.length, RECORDS.filter(r => r.end === 'victory').length)}</p>${RECORDS.map(r => historySvg(r, PANE_W, roster, 'en')).join('')}`
  const stage = `${STATIC_CSS}<div id="content" style="padding-top:60px">${frame('Quest log', inner, PANE_W + 28)}</div>`
  const fx = (W - PANE_W - 28 - FRAME_PAD) / 2
  const map = (h: number): MapOpts => ({
    u: 3,
    seed: 5,
    regions: [
      { kind: 'guild', x: 96, y: h - 150, label: R.guild },
      { kind: 'read', x: 99, y: 140, label: R.read },
      { kind: 'lair', x: 798, y: 150, label: oneLine(R.lair as string), r: 20 },
      { kind: 'web', x: 801, y: h - 150, label: oneLine(R.web as string) },
    ],
    trails: [['guild', 'read', 0.15], ['guild', 'lair'], ['lair', 'web', -0.2]],
    keep: [[fx, 30, W - 2 * fx, h]],
  })
  await setPage(page, W, 1200, map(1200), stage)
  await fitHeight(page, W, 96, map)
  await still(page, 'quest-log.png')
}

// --- 5. the social preview (1280x640): the title banner, the map, the party marching on the Lair and its boss
async function renderSocial(page: Page): Promise<void> {
  const W = 1280
  const H = 640
  const R = REGION.en
  const ground = 524
  const party = (['knight', 'mage', 'archer', 'samurai'] as const).map((c, i) => heroCharacter(c, 3, [0, 16, 8, 24][i]))
  const boss = bossCharacter('warlord', 0).character
  const scale = 6
  const feet = (i: number) => ground - (i % 2) * 16
  const xs = [176, 296, 416, 536]
  // sprites are tokens on the map: their lowest row stands on a little shadow
  const at = (c: Char, s: number, x: number, y: number) => `<div style="position:absolute;left:${x}px;top:${y - c.h * s + s}px">${sprite(c, s)}</div>`
  const bx = 872
  const map: MapOpts = {
    u: 4,
    seed: 3,
    ribbon: { text: 'SUBQUEST', x: W / 2, y: 12, w: 480, h: 96, size: 30 },
    texts: [{ text: TAGLINE.en, x: W / 2, y: 140, halo: PAPER }],
    compass: { x: 96, y: 100 },
    regions: [
      { kind: 'guild', x: 84, y: 508, label: R.guild },
      { kind: 'read', x: 196, y: 264, label: R.read },
      { kind: 'edit', x: 404, y: 276, label: R.edit },
      { kind: 'command', x: 608, y: 264, label: R.command },
      { kind: 'web', x: 804, y: 268, label: R.web },
      { kind: 'other', x: 1092, y: 236, label: oneLine(R.other as string) },
      { kind: 'lair', x: 1172, y: 476, label: oneLine(R.lair as string) },
    ],
    trails: [['guild', 'lair', 0], ['guild', 'read', 0.1], ['read', 'edit', -0.12], ['edit', 'command', 0.12], ['command', 'web', -0.12], ['web', 'other', 0.12], ['other', 'lair', 0.1]],
    shadows: [...party.map((c, i) => [(xs[i] as number) + (c.w * scale) / 2, feet(i), c.w * scale * 0.7]), [bx + (boss.w * 6) / 2, ground + 4, boss.w * 6 * 0.7]],
    keep: [[180, 0, 920, 190], [140, 380, 900, 260]],
  }
  const stage = `${party.map((c, i) => at(c, scale, xs[i] as number, feet(i))).join('')}
${at(boss, 6, bx, ground + 4)}
<div class="tiny" style="position:absolute;left:676px;top:${ground - 120}px;font-size:32px;color:#c0392b;text-shadow:3px 3px 0 #f4e8c8">Crit -36</div>`
  await setPage(page, W, H, map, stage)
  await still(page, 'social-preview.png')
}

// --- 6. built-in art vs. the owner's own characters (only where ~/.claude/subquest/packs exists)
async function renderCustom(page: Page, builtIn: Roster): Promise<void> {
  const dir = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.claude', 'subquest', 'packs')
  if (!fs.existsSync(dir)) {
    console.log('custom-before-after.png skipped: no ~/.claude/subquest/packs')
    return
  }
  const packs = fs
    .readdirSync(dir)
    .filter(f => /\.json$/i.test(f))
    .map(f => parsePack(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter(r => r.ok)
    .map(r => r.pack)
  const custom = cast(packs)
  const W = 1100
  const PW = PANE_W - 60
  const sec = 5
  const R = REGION.en
  const pane = (roster: Roster) => {
    const { phase, rows } = demoAt(sec, 'en')
    return `${tabs('en', 'battle')}${phaseSvg(phase, rows, PW, sec * 1000, roster, 'en')}${rows.map(r => rowSvg(r, PW, sec * 1000, roster, 'en')).join('')}`
  }
  const stage = `${STATIC_CSS}<div id="content" style="padding-top:66px"><div style="display:flex;gap:44px;align-items:flex-start">${frame('Built-in', pane(builtIn), PW + 28)}${frame('Your own characters', pane(custom), PW + 28)}</div></div>`
  await setPage(page, W, 1300, {}, stage)
  // one moment of the fight: the heroes' swing lands
  await page.evaluate(() => document.getAnimations().forEach(a => (a.pause(), (a.currentTime = 300))))
  const top = Math.ceil(await page.evaluate(() => (document.getElementById('content') as HTMLElement).getBoundingClientRect().bottom))
  const kinds = ['guild', 'read', 'edit', 'command', 'web', 'other']
  await fitHeight(page, W, 300, h => ({
    u: 3,
    seed: 9,
    texts: [
      { text: 'Right: Tiny RPG Character Asset Pack by Zerie (paid, not included),', x: W / 2, y: top + 30, halo: PAPER },
      { text: 'converted with scripts/convert.mjs.', x: W / 2, y: top + 60, halo: PAPER },
    ],
    regions: kinds.map((kind, i) => ({ kind, x: 111 + i * 175, y: h - 138, label: R[kind] })),
    trails: kinds.slice(1).map((k, i) => [kinds[i] as string, k, i % 2 ? 0.25 : -0.25]),
    keep: [[0, 0, W, top + 70]],
  }))
  await still(page, 'custom-before-after.png')
}

// Checks the PNG decoder against a known screenshot before trusting it with the GIFs.
async function selfCheck(page: Page): Promise<void> {
  await page.setViewportSize({ width: 7, height: 3 })
  await page.setContent('<html><body style="margin:0;background:#123456"><div style="width:3px;height:3px;background:#fe8001"></div></body></html>')
  const { w, h, data } = decodePng(await page.screenshot())
  const at = (x: number, y: number) => [...data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)].join()
  if (w !== 7 || h !== 3 || at(1, 1) !== '254,128,1,255' || at(5, 2) !== '18,52,86,255') throw new Error('PNG decoder self-check failed')
}

fs.mkdirSync(OUT, { recursive: true })
if (dumpFrames) fs.mkdirSync(FRAMES, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1, colorScheme: 'dark' })
try {
  await selfCheck(page)
  const builtIn = cast([])
  if (want('icon')) await renderIcon(page)
  if (want('hero')) {
    const crits = demoCrits(builtIn)
    if (!crits.length) throw new Error('the demo shows no critical hit: pick other agent ids')
    console.log(`critical hits at: ${crits.join(', ')}`)
    await renderHero(page, 'en', builtIn)
    await renderHero(page, 'pt-BR', builtIn)
  }
  if (want('bestiary')) await renderBestiary(page)
  if (want('questlog')) await renderQuestLog(page, builtIn)
  if (want('social')) await renderSocial(page)
  if (want('custom')) await renderCustom(page, builtIn)
} finally {
  await browser.close()
}
