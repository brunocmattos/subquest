import { expect, test } from 'claude-code/testing'

import { cast } from './characters'
import { FIGHT0, classOf, hit } from './game'
import { PHASE_H, ROW_H, fmtK, fmtTime, modelLine, historySvg, historyText, phaseSvg, phaseText, rhythm, rowSvg, rowText } from './scene'

const roster = cast([])
const base = {
  id: 'a1',
  title: 'Fix login',
  model: 'claude-opus-5-5',
  modelText: 'Opus 5.5',
  status: 'running' as const,
  fight: hit(FIGHT0, 'Edit'),
  stats: '142k ~$0.61 3m05s',
}
const clean = (s: string) => {
  expect(s.length).toBeLessThan(131072)
  expect(s).not.toMatch(/NaN|undefined|\[object|Infinity/)
}

// an id that attacks (turn 0) or is attacked (turn 1) at `now`, with no rest beat
const idAt = (now: number, turn: number) => Array.from({ length: 50 }, (_, i) => `t${i}`).find(id => rhythm(id, now).turn === turn && !rhythm(id, now).rest) ?? 'a1'

for (const turn of [0, 1]) {
  test(`a fighting row fits the ceiling and leaks no junk (turn ${turn})`, async () => {
    const s = rowSvg({ ...base, id: idAt(2000, turn) }, 356, 2000, roster, 'en')
    clean(s)
    expect(s).toMatch(/vs [^·<]+ · wave 1/)
    expect(s).toContain(turn === 0 ? 'mknock' : 'matk')
  })
}

test('a hero with no tool yet stands still, with no monster', async () => {
  const s = rowSvg({ ...base, fight: FIGHT0 }, 356, 0, roster, 'en')
  clean(s)
  expect(s).not.toContain(' vs ')
  expect(s).toContain('getting ready')
})

test('a monster swap in the last second plays the death of the previous one', async () => {
  const fight = hit(hit(FIGHT0, 'Read'), 'Edit')
  const s = rowSvg({ ...base, fight, fell: { family: 'read', at: 500 } }, 356, 1000, roster, 'en')
  clean(s)
  expect(s).toContain('smoke')
  expect(rowSvg({ ...base, fight, fell: { family: 'read', at: 500 } }, 356, 3000, roster, 'en')).not.toContain('smoke')
})

test('a finished hero cheers and shows how many it beat', async () => {
  const s = rowSvg({ ...base, status: 'done', fight: { wave: 2, hits: 1, won: 2 } }, 356, 0, roster, 'en')
  clean(s)
  expect(s).toContain('beat 2 monsters')
  expect(s).toContain('bob')
})

test('the still drawing has no turn animation', async () => {
  const s = rowSvg(base, 356, 0, roster, 'en', true)
  clean(s)
  expect(s).not.toContain('mknock')
})

test('terminal text', async () => {
  expect(rowText(base, roster, 'en')).toMatch(/^⚔ .+ lv3 vs [^·]+ · wave 1$/)
  expect(rowText({ ...base, status: 'failed' }, roster, 'pt-BR')).toContain('caiu em combate')
})

test('a phase of 5 brings the Dark Knight; of 2, the Warlord', async () => {
  const rows = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ ...base, id, status: i < 2 ? ('done' as const) : ('running' as const) }))
  for (const now of [0, 1000]) {
    const d = phaseSvg({ number: 3, ids: rows.map(a => a.id) }, rows, 356, now, roster, 'en')
    clean(d)
    expect(d).toContain('Dark Knight')
    expect(d).toContain('hp 60%')
  }
  expect(phaseSvg({ number: 4, ids: ['a', 'b'] }, rows.slice(0, 2), 356, 0, roster, 'en')).toContain('Warlord')
})

test('the phase is named after its lair; the task goes on the line below', async () => {
  const d = phaseSvg({ number: 2, ids: ['a'], title: 'Build the subquest mod' }, [{ ...base, id: 'a' }], 520, 0, roster, 'en')
  clean(d)
  expect(d).toContain('Phase 2 · Lair of the ')
  expect(d).toContain('Build the subquest mod · 0 at the boss · 1 fighting')
  expect(phaseText({ number: 2, ids: ['a'], title: 'Build the subquest mod' }, [{ ...base, id: 'a' }], roster, 'en')[0]).toContain('Build the subquest mod')
})

test('a lost phase and a won phase', async () => {
  const d = phaseSvg({ number: 1, ids: ['a'], end: 'defeat' }, [{ ...base, id: 'a', status: 'failed' }], 356, 0, roster, 'en')
  clean(d)
  expect(d).toContain('partial defeat')
  const v = phaseSvg({ number: 1, ids: ['a'], end: 'victory' }, [{ ...base, id: 'a', status: 'done' }], 356, 0, roster, 'en')
  clean(v)
  expect(v).toContain('PHASE CLEARED')
})

test('formatters', async () => {
  expect(fmtK(950)).toBe('950')
  expect(fmtK(12_400)).toBe('12k')
  expect(fmtTime(45_000)).toBe('45s')
  expect(fmtTime(130_000)).toBe('2m10s')
})

const row = (i: number) => ({
  id: `agent-${i}`, title: `Task ${i}`, model: 'claude-opus-5-5', status: 'running' as const,
  fight: { family: (['read', 'edit', 'command', 'web', 'other'] as const)[i % 5], wave: 2, hits: 3, won: 1 }, stats: '12k · $0.04 · 1m',
})

test('phase + 4 rows fit the 180k budget', async () => {
  const rows = Array.from({ length: 4 }, (_, i) => row(i))
  const total = phaseSvg({ number: 1, ids: rows.map(r => r.id), title: 'Map callers' }, rows, 520, 0, roster, 'en').length + rows.reduce((s, r) => s + rowSvg(r, 520, 0, roster, 'en').length, 0)
  expect(total).toBeLessThan(180_000)
  expect(ROW_H).toBeGreaterThan(0)
  expect(PHASE_H).toBeGreaterThan(0)
})

test('texts follow the language; the phase is the lair plus the task', async () => {
  expect(rowSvg(row(0), 520, 0, roster, 'pt-BR')).toContain('onda 2')
  expect(rowSvg(row(0), 520, 0, roster, 'en')).toContain('wave 2')
  const p = phaseSvg({ number: 4, ids: ['agent-0', 'agent-1'], title: 'Map callers' }, [row(0), row(1)], 520, 0, roster, 'pt-BR')
  expect(p).toContain('Fase 4 · Covil do ')
  expect(p).toContain('Map callers +1')
})

test('a history row: the lair, the task, the time; a lost one is crossed out', async () => {
  const r = { number: 2, title: 'Fix login', boss: 'darkKnight' as const, end: 'victory' as const, agents: 4, won: 9, durationMs: 130_000, tokens: 45_000, costUsd: 0.12 }
  const s = historySvg(r, 520, roster, 'pt-BR')
  clean(s)
  expect(s).toContain('Fase 2 · Covil do ')
  expect(s).toContain('Fix login')
  expect(s).toContain('2m10s')
  expect(s.length).toBeLessThan(20_000)
  expect(s).not.toContain('opacity=".45"')
  expect(historySvg({ ...r, end: 'defeat' }, 520, roster, 'en')).toContain('opacity=".45"')
  expect(historyText(r, roster, 'pt-BR')).toMatch(/^✓ Fase 2 · Covil do .+ · Fix login · vitória · 4 agentes · 9 monstros · 2m10s · 45k tok · ~\$0\.12$/)
  expect(historyText({ ...r, end: 'defeat', costUsd: 0 }, roster, 'en')).toMatch(/^✗ Phase 2 · Lair of the .+ · Fix login · defeat · 4 agents · 9 monsters · 2m10s · 45k tok$/)
})

test('the finale: final blow first, the cleared banner after; never on defeat', async () => {
  const p = { number: 1, ids: ['a', 'b'], end: 'victory' as const, endedAt: 10_000 }
  const rows = [{ ...base, id: 'a', status: 'done' as const }, { ...base, id: 'b', status: 'done' as const }]
  const mid = phaseSvg(p, rows, 356, 10_500, roster, 'en')
  clean(mid)
  expect(mid).toContain('FINAL BLOW!')
  expect(mid).not.toContain('PHASE CLEARED')
  expect(phaseSvg(p, rows, 356, 10_500, roster, 'pt-BR')).toContain('GOLPE FINAL')
  const dying = phaseSvg(p, rows, 356, 11_700, roster, 'en')
  clean(dying)
  expect(dying).not.toContain('FINAL BLOW!')
  expect(dying).not.toContain('PHASE CLEARED')
  const after = phaseSvg(p, rows, 356, 15_000, roster, 'en')
  expect(after).toContain('PHASE CLEARED')
  expect(after).not.toContain('FINAL BLOW!')
  const lost = phaseSvg({ number: 1, ids: ['a'], end: 'defeat', endedAt: 10_000 }, [{ ...base, id: 'a', status: 'failed' }], 356, 10_500, roster, 'en')
  expect(lost).not.toContain('FINAL BLOW!')
})

test('the default agent type is hidden from the row; specific ones stay', () => {
  expect(modelLine('general-purpose', 'Opus 5.5')).toBe('Opus 5.5')
  expect(modelLine('General-Purpose', 'Opus 5.5')).not.toContain('eneral')
  expect(modelLine('Explore', 'Opus 5.5')).toContain('Explore')
})

test('fights are desynchronized per agent, deterministically, with rest beats', async () => {
  const ids = Array.from({ length: 20 }, (_, i) => `agent-${i}`)
  const kind = (s: string) => (s.includes('mknock') ? 'hero' : s.includes('matk') ? 'monster' : 'rest')
  const at = (now: number) => ids.map(id => kind(rowSvg({ ...base, id }, 356, now, roster, 'en')))
  const kinds = new Set([...at(2000), ...at(3000)])
  expect(at(2000)).toContain('hero')
  expect(at(2000)).toContain('monster')
  expect(rowSvg(base, 356, 5000, roster, 'en')).toBe(rowSvg(base, 356, 5000, roster, 'en'))
  // a rest beat exists within 40 seconds for some id, and nothing is shown on it
  const rested = ids.some(id => Array.from({ length: 40 }, (_, s) => rowSvg({ ...base, id }, 356, s * 1000, roster, 'en')).some(x => kind(x) === 'rest' && !x.includes('dmg')))
  expect(rested).toBe(true)
  expect(kinds.has('rest')).toBe(true)
  // the offset stays within 0.35 s
  const dls = ids.flatMap(id => [...rowSvg({ ...base, id }, 356, 2000, roster, 'en').matchAll(/--dl:([\d.]+)s/g)].map(m => Number(m[1])))
  expect(Math.max(...dls)).toBeLessThanOrEqual(0.35)
  expect(Math.max(...dls)).toBeGreaterThan(0)
})

test('agents of the same class do not share a beat', async () => {
  const ids = Array.from({ length: 400 }, (_, i) => `agent-${i}`).filter(id => classOf(id) === 'knight')
  expect(ids.length).toBeGreaterThan(10)
  expect(new Set(ids.map(id => rhythm(id, 0).turn)).size).toBe(2)
  expect(new Set(ids.map(id => rhythm(id, 0).dl)).size).toBeGreaterThan(3)
})

test('a wide custom boss stays inside the field', async () => {
  const wide = { w: 120, h: 120, palette: ['#ff0000'], anim: { idle: ['10.0.100.0;10.39.100.0'], attack: [], hurt: [], death: [] } }
  const custom = cast([{ kind: 'boss', size: 'small', name: { en: 'Big', 'pt-BR': 'Grande' }, character: wide }])
  const W = 520
  const d = phaseSvg({ number: 1, ids: ['a', 'b'] }, [{ ...base, id: 'a' }, { ...base, id: 'b' }], W, 0, custom, 'en')
  const m = [...d.matchAll(/translate\(([-\d.]+),[-\d.]+\) scale\(([\d.]+)\)/g)].map(r => ({ x: Number(r[1]), s: Number(r[2]) }))
  const boss = m.find(r => Math.abs(r.s - 3) < 0.01)
  expect(boss).toBeDefined()
  expect((boss?.x ?? 0) + 120 * (boss?.s ?? 0)).toBeLessThanOrEqual(W)
})
