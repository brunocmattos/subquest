import { expect, test } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { completed, phaseRecord, running, spawned, staleRuns, stepped, toolUsed } from './tracker'

const base = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: 'a1', type: 'Explore', description: 'Map callers', model: 'claude-haiku-5-5', status: 'running',
  startedAt: 0, contextTokens: 0, tokens: 0, costUsd: 0, steps: 0, fight: { wave: 0, hits: 0, won: 0 }, ...over,
})
const deepFreeze = <T extends object>(o: T): T => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v)
  return Object.freeze(o)
}
const use = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50 }

test('spawn adds a running agent', async () => {
  const l = spawned([], base())
  expect(l.length).toBe(1)
  expect(running(l)).toBe(1)
})

test('a resumed agent keeps its fight, tokens and start, runs again and loses its end', async () => {
  const done = base({ status: 'done', endedAt: 50, startedAt: 7, tokens: 300, costUsd: 0.5, steps: 4, fight: { family: 'edit', wave: 2, hits: 3, won: 2 } })
  const l = spawned([done, base({ id: 'a2' })], base({ startedAt: 999, description: 'again' }))
  expect(l.length).toBe(2)
  const a = l.find(x => x.id === 'a1')
  expect(a).toEqual({ ...done, status: 'running', endedAt: undefined })
  expect(a && 'endedAt' in a).toBe(false)
  expect(a?.startedAt).toBe(7)
})

test('a second finish leaves a finished agent alone', async () => {
  const ok = completed([toolUsed([base()], 'a1', 'Read', 1)[0] as AgentRun], 'a1', 'answer', 10)
  expect(completed(ok, 'a1', 'error', 20)).toEqual(ok)
  const bad = completed([base()], 'a1', 'error', 10)
  expect(completed(bad, 'a1', 'answer', 20)).toEqual(bad)
})

test('staleRuns: running agents the engine forgot or ended are closed, by how they ended', async () => {
  const ours = [...['a1', 'a2', 'a3', 'a4', 'a5', 'a7'].map(id => base({ id })), base({ id: 'a6', status: 'done' })]
  const info = [
    { id: 'a1', status: 'running' },
    { id: 'a2', status: 'completed' },
    { id: 'a3', status: 'failed' },
    { id: 'a4', status: 'killed' },
    { id: 'a5', status: 'idle' },
    { id: 'a6', status: 'completed' },
  ] as const
  expect(staleRuns(ours, info)).toEqual([
    { id: 'a2', reason: 'answer' },
    { id: 'a3', reason: 'error' },
    { id: 'a4', reason: 'error' },
    { id: 'a7', reason: 'answer' }, // gone from the list: a failure would have come through turn.complete
  ])
})

test('tool use hits; a new family marks the fallen monster', async () => {
  let l = toolUsed([base()], 'a1', 'Read', 10)
  expect(l[0]?.fight).toEqual({ family: 'read', wave: 1, hits: 1, won: 0 })
  expect(l[0]?.fell).toBeUndefined()
  l = toolUsed(l, 'a1', 'Edit', 20)
  expect(l[0]?.fight.won).toBe(1)
  expect(l[0]?.fell).toEqual({ family: 'read', at: 20 })
  expect(l[0]?.steps).toBe(2)
  expect(toolUsed(l, 'zz', 'Read', 30)).toBe(l)
})

test('each request adds its new tokens and its cost; context is the last request', async () => {
  let l = stepped([base()], 'a1', use, 'claude-haiku-5-5')
  l = stepped(l, 'a1', { ...use, cache_read_input_tokens: 2000 }, 'claude-haiku-5-5')
  expect(l[0]?.contextTokens).toBe(2150)
  expect(l[0]?.tokens).toBe(170 + 170)
  expect(l[0]?.model).toBe('claude-haiku-5-5')
})

test('a long run is not counted again at every step: the total stays near the final context', async () => {
  // The three requests of a real Haiku subagent: the cache holds the context, each step re-reads it.
  const reqs = [
    { input_tokens: 2, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 86275 },
    { input_tokens: 2, output_tokens: 195, cache_read_input_tokens: 86275, cache_creation_input_tokens: 12809 },
    { input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 99084, cache_creation_input_tokens: 208 },
  ]
  const l = reqs.reduce((acc, r) => stepped(acc, 'a1', r, 'claude-haiku-5-5'), [base()])
  expect(l[0]?.contextTokens).toBe(99294)
  expect(l[0]?.tokens).toBe(99797) // the engine reports 99314 for this agent; counting the re-reads gave 285156
})

test('complete: answer is done with the final blow; error and abort fail', async () => {
  const fighting = toolUsed([base()], 'a1', 'Read', 1)
  const ok = completed(fighting, 'a1', 'answer', 99)
  expect(ok[0]?.status).toBe('done')
  expect(ok[0]?.endedAt).toBe(99)
  expect(ok[0]?.fight.won).toBe(1)
  expect(ok[0]?.fell).toEqual({ family: 'read', at: 99 })
  expect(completed(fighting, 'a1', 'error', 99)[0]?.status).toBe('failed')
  expect(completed(fighting, 'a1', 'aborted', 99)[0]?.status).toBe('failed')
})

test('complete uses the turn usage only when no request was seen', async () => {
  const l = completed([base()], 'a1', 'answer', 5, use)
  expect(l[0]?.tokens).toBe(170)
  const seen = stepped([base()], 'a1', use, 'claude-haiku-5-5')
  expect(completed(seen, 'a1', 'answer', 5, use)[0]?.tokens).toBe(170)
})

test('does not mutate frozen engine values', async () => {
  const a = base()
  const l = deepFreeze([a])
  toolUsed(l, 'a1', 'Read', 1)
  stepped(l, 'a1', use, 'claude-haiku-5-5')
  completed(l, 'a1', 'answer', 2)
  spawned(l, base({ id: 'a2' }))
  expect(a.steps).toBe(0)
  expect(a.fight).toEqual({ wave: 0, hits: 0, won: 0 })
})

test('a finished phase becomes a history record; a running one does not', async () => {
  const runs = [
    base({ id: 'a1', status: 'done', startedAt: 1000, endedAt: 5000, tokens: 300, costUsd: 0.01, fight: { wave: 2, hits: 1, won: 2 } }),
    base({ id: 'a2', status: 'done', startedAt: 2000, endedAt: 9000, tokens: 700, costUsd: 0.02, fight: { wave: 1, hits: 1, won: 1 } }),
  ]
  const r = phaseRecord({ number: 3, ids: ['a1', 'a2'], title: 'Map callers', end: 'victory' }, runs)
  const { costUsd = 0, ...rest } = r ?? {}
  expect(rest).toEqual({ number: 3, title: 'Map callers', boss: 'warlord', end: 'victory', agents: 2, won: 3, durationMs: 8000, tokens: 1000 })
  expect(Math.abs(costUsd - 0.03) < 1e-9).toBe(true)
  expect(phaseRecord({ number: 4, ids: ['a1'] }, runs)).toBeUndefined()
})
