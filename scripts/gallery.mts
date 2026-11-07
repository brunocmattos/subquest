// Builds docs/gallery.html with every built-in character, animated, to check the art in a browser.
// Usage: node --experimental-strip-types scripts/gallery.mts
// The mod imports without extensions ('./sprite'), as the engine expects; this hook resolves them to .ts.
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !path.extname(spec) && ctx.parentURL?.includes('/hooks/')) return next(spec + '.ts', ctx)
    return next(spec, ctx)
  },
})

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const hooks = (f: string) => pathToFileURL(path.join(root, 'hooks', f)).href
const { frameSvg } = await import(hooks('sprite.ts'))
const { CLASSES } = await import(hooks('game.ts'))
const { CLASS_NAME } = await import(hooks('i18n.ts'))
const { heroCharacter } = await import(hooks('art/heroes.ts'))
const { monsterCharacter } = await import(hooks('art/monsters.ts'))
const { bossCharacter } = await import(hooks('art/bosses.ts'))

type Char = { w: number; h: number; px?: number; palette: string[]; anim: Record<string, string[]> }
const ANIMS = ['idle', 'attack', 'hurt', 'death'] as const
const DUR: Record<string, number> = { idle: 1, attack: 0.75, hurt: 0.5, death: 1.6 }

// Frame i of n is visible in slice i/n of a `dur` s cycle.
const css: string[] = []
let next = 0
const cycle = (frames: string[], dur: number) => {
  const id = `a${next++}`
  const n = frames.length
  css.push(...frames.map((_, i) => `.${id}-${i}{opacity:0;animation:${id}-${i} ${dur}s steps(1) infinite}@keyframes ${id}-${i}{0%{opacity:0}${((100 * i) / n).toFixed(2)}%{opacity:1}${((100 * (i + 1)) / n).toFixed(2)}%{opacity:0}}`))
  return frames.map((f, i) => `<g class="${id}-${i}">${f}</g>`).join('')
}
const svg = (c: Char, body: string) => {
  const s = c.px ?? 3
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w * s}" height="${c.h * s}" viewBox="0 0 ${c.w} ${c.h}" shape-rendering="crispEdges">${body}</svg>`
}
const anim = (c: Char, a: string) => svg(c, cycle(c.anim[a].map((_, i) => frameSvg(c, a, i)), DUR[a] ?? 1))
// One character: idle on light and dark, then attack / hurt / death.
const card = (c: Char, title: string, sub = '') =>
  `<figure><div class="pair"><span class="light">${anim(c, 'idle')}</span><span class="dark">${anim(c, 'idle')}</span></div>` +
  `<div class="strip">${ANIMS.slice(1).map(a => `<span class="dark" title="${a}">${anim(c, a)}</span>`).join('')}</div>` +
  `<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</figure>`

const LEVEL = { 1: 'Haiku · hat', 2: 'Sonnet · + weapon', 3: 'Opus · + extra' } as const
const heroes = CLASSES.map(
  (c: string, i: number) => `<h3>${CLASS_NAME.en[c]} · ${CLASS_NAME['pt-BR'][c]}</h3><div class="gal">${([1, 2, 3] as const).map(lv => card(heroCharacter(c, lv, i * 8), `Level ${lv}`, LEVEL[lv])).join('')}</div>`,
).join('')
const FAMILY = { read: 'read · Read, Grep, Glob', edit: 'edit · Edit, Write', command: 'command · Bash, PowerShell', web: 'web · WebSearch, WebFetch', other: 'other tools' } as const
const monsters = (Object.keys(FAMILY) as (keyof typeof FAMILY)[])
  .map(f => `<h3>${FAMILY[f]}</h3><div class="gal">${[1, 2, 3, 4].map(s => { const m = monsterCharacter(f, s); return card(m.character, m.name.en, `${m.name['pt-BR']} · seed ${s}`) }).join('')}</div>`)
  .join('')
const bosses = (['warlord', 'darkKnight'] as const)
  .map(b => `<h3>${b === 'warlord' ? 'Warlord · waves of 1–3' : 'Dark Knight · waves of 4+'}</h3><div class="gal">${[0, 1, 2, 3].map(s => { const x = bossCharacter(b, s); return card(x.character, x.name.en, `${x.name['pt-BR']} · seed ${s}`) }).join('')}</div>`)
  .join('')

// Overview: every character idle, side by side, on both backgrounds.
const row = (cs: { c: Char; t: string }[]) => `<div class="gal">${cs.map(({ c, t }) => `<figure class="mini"><span class="light">${anim(c, 'idle')}</span><span class="dark">${anim(c, 'idle')}</span><small>${t}</small></figure>`).join('')}</div>`
const overview = [
  ...([1, 2, 3] as const).map(lv => row(CLASSES.map((c: string, i: number) => ({ c: heroCharacter(c, lv, i * 8), t: `${CLASS_NAME.en[c]} ${lv}` })))),
  ...(Object.keys(FAMILY) as (keyof typeof FAMILY)[]).map(f => row([1, 2, 3, 4].map(s => { const m = monsterCharacter(f, s); return { c: m.character, t: m.name.en } }))),
  row((['warlord', 'darkKnight'] as const).flatMap(b => [0, 1, 2, 3].map(s => { const x = bossCharacter(b, s); return { c: x.character, t: x.name.en } }))),
].join('')

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Subquest gallery</title>
<style>
:root{--bg:#1e1c1c;--fg:#ececec;--mute:#9a9a96}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,'Segoe UI',sans-serif;padding:24px 16px 60px}
h1{font-size:20px;margin:0 0 6px}h2{font-size:16px;margin:30px 0 8px}h3{font-size:13px;margin:16px 0 6px;color:#c9c6be;font-weight:600}
p{color:var(--mute);max-width:760px;margin:0 0 12px}
.gal{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}
figure{margin:0;font-size:12px;color:var(--mute)}figure b{display:block;color:var(--fg);font-weight:600;margin-top:4px}small{display:block}
.pair,.strip{display:flex;gap:4px;align-items:flex-end}.strip{margin-top:4px}
.light,.dark{display:inline-flex;padding:6px;border-radius:4px}.light{background:#f3efe6}.dark{background:#2c2a2a}
.strip .dark{padding:3px}
.over .gal{gap:8px;margin-bottom:8px}.mini{display:flex;flex-direction:column;align-items:center;gap:2px}.mini .light,.mini .dark{padding:3px}.mini small{font-size:10px}
svg path{fill:none}
${css.join('\n')}
</style></head><body>
<h1>Subquest gallery</h1>
<p>Built from <code>hooks/art</code> by <code>scripts/gallery.mts</code>. Each card: idle on a light and a dark background, then attack, hurt and death. Built-in art is drawn at a fixed 3× pixel scale.</p>
<h2>Overview (idle)</h2><div class="over">${overview}</div>
<h2>Heroes (Clawd, by class and model level)</h2>${heroes}
<h2>Monsters (by tool family, seeds 1–4)</h2>${monsters}
<h2>Bosses (by wave size, seeds 0–3)</h2>${bosses}
</body></html>`
const out = path.join(root, 'docs', 'gallery.html')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, html)
console.log(`${out}: ${Math.round(html.length / 1024)} KB`)
