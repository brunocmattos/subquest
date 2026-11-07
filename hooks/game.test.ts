import { expect, test } from 'claude-code/testing'

import { CLASSES, COLORS, FIGHT0, bossHp, bossOf, classOf, colorOf, counter, damage, endPhase, familyOf, finish, hit, levelOf, monsterHp, seed, spawnPhase, titleOf } from './game'

test('same id, same class and color; different ids vary', async () => {
  expect(classOf('a1')).toBe(classOf('a1'))
  expect(colorOf('a1')).toBe(colorOf('a1'))
  const seen = new Set(Array.from({ length: 200 }, (_, i) => classOf(`agent-${i}`)))
  expect(seen.size).toBe(CLASSES.length)
})

test('level by model', async () => {
  expect(levelOf('claude-haiku-5-5')).toBe(1)
  expect(levelOf('claude-sonnet-5-5')).toBe(2)
  expect(levelOf('claude-opus-5-5')).toBe(3)
  expect(levelOf('anything')).toBe(2)
})

test('family by tool', async () => {
  expect(familyOf('Grep')).toBe('read')
  expect(familyOf('Write')).toBe('edit')
  expect(familyOf('PowerShell')).toBe('command')
  expect(familyOf('WebFetch')).toBe('web')
  expect(familyOf('mcp__x__y')).toBe('other')
})

test('waves: same family hits, a new family beats the monster', async () => {
  let f = hit(FIGHT0, 'Read')
  expect(f).toEqual({ family: 'read', wave: 1, hits: 1, won: 0 })
  f = hit(f, 'Grep')
  expect(f).toEqual({ family: 'read', wave: 1, hits: 2, won: 0 })
  f = hit(f, 'Edit')
  expect(f).toEqual({ family: 'edit', wave: 2, hits: 1, won: 1 })
  expect(finish(f)).toEqual({ wave: 2, hits: 1, won: 2 })
  expect(finish(FIGHT0)).toEqual(FIGHT0)
})

test('monster hp falls and never reaches zero', async () => {
  expect(monsterHp(0)).toBe(1)
  expect(monsterHp(6)).toBe(0.5)
  expect(monsterHp(600)).toBeGreaterThan(0)
})

test('damage is stable per id and hit, and grows with level', async () => {
  expect(damage('a', 3, 2)).toEqual(damage('a', 3, 2))
  const avg = (lv: 1 | 2 | 3) => Array.from({ length: 300 }, (_, i) => damage(`x${i}`, i, lv).value).reduce((a, b) => a + b) / 300
  expect(avg(3)).toBeGreaterThan(avg(1))
})

test('phases: a wave opens with the first task as title, joins while someone runs, ends', async () => {
  let p = spawnPhase(null, 'a1', 0, 'Map the login')
  expect(p).toEqual({ number: 1, ids: ['a1'], title: 'Map the login' })
  p = spawnPhase(p, 'a2', 1, 'ignored')
  expect(p).toEqual({ number: 1, ids: ['a1', 'a2'], title: 'Map the login' })
  const st: Record<string, 'running' | 'done' | 'failed'> = { a1: 'done', a2: 'running' }
  expect(endPhase(p, id => st[id], 5).end).toBeUndefined()
  expect(bossHp(p, id => st[id])).toBe(0.5)
  st.a2 = 'failed'
  expect(endPhase(p, id => st[id], 5).end).toBe('defeat')
  st.a2 = 'done'
  expect(endPhase(p, id => st[id], 5).end).toBe('victory')
  expect(spawnPhase(p, 'a3', 0, 'Next').number).toBe(2)
})

test('boss by wave size; title is the first non-empty line, cut at 60', async () => {
  expect(bossOf(3)).toBe('warlord')
  expect(bossOf(4)).toBe('darkKnight')
  expect(titleOf('\n  Map   the login \nmore')).toBe('Map the login')
  expect(titleOf('   ')).toBeUndefined()
  expect(titleOf('x'.repeat(80))?.length).toBe(60)
})

test('seed is FNV-1a', async () => {
  expect(seed('abc')).toBe(seed('abc'))
  expect(seed('')).toBe(0x811c9dc5)
})

test('damage stays in range; critical doubles; counter is 1..4', async () => {
  const ranges = { 1: [2, 5], 2: [5, 10], 3: [9, 18] } as const
  let crits = 0
  for (let i = 0; i < 300; i++)
    for (const lv of [1, 2, 3] as const) {
      const { value, critical } = damage(`x${i}`, i, lv)
      const [a, b] = ranges[lv]
      if (critical) crits++
      expect(critical ? value >= 2 * a && value <= 2 * b && value % 2 === 0 : value >= a && value <= b).toBe(true)
    }
  expect(crits).toBeGreaterThan(0)
  for (let i = 0; i < 300; i++) {
    const c = counter(`x${i}`, i)
    expect(c >= 1 && c <= 4).toBe(true)
  }
  expect(COLORS.includes(colorOf('a1') as never)).toBe(true)
})

test('a resumed id does not join the phase twice', async () => {
  const p = spawnPhase(spawnPhase(null, 'a1', 0, 'T'), 'a2', 1)
  expect(spawnPhase(p, 'a2', 1)).toBe(p)
  expect(spawnPhase(p, 'a1', 0)).toBe(p)
})

test('a phase that ended is never joined, even with someone still running', async () => {
  const p = { number: 1, ids: ['a1'], end: 'victory' as const }
  expect(spawnPhase(p, 'a2', 1, 'Next')).toEqual({ number: 2, ids: ['a2'], title: 'Next' })
})

test('endPhase never removes an end', async () => {
  const p = { number: 1, ids: ['a1'], end: 'victory' as const }
  expect(endPhase(p, () => 'running', 9)).toBe(p)
  expect(endPhase(p, () => 'failed', 9)).toBe(p)
})

test('endPhase stamps endedAt once', async () => {
  const p = endPhase({ number: 1, ids: ['a1'] }, () => 'done', 42)
  expect(p.endedAt).toBe(42)
  expect(endPhase(p, () => 'done', 99).endedAt).toBe(42)
})

test('a new phase continues after the highest number in history', async () => {
  expect(spawnPhase(null, 'a1', 0, 'T', 2).number).toBe(3)
  expect(spawnPhase({ number: 5, ids: ['a1'], end: 'victory' }, 'a2', 0, 'T', 2).number).toBe(6)
})
