import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { AgentRun, Phase, PhaseRecord } from '../types'

// The test runtime has it; the engine's types (no DOM, no Node) do not declare it.
declare const setTimeout: (fn: (v?: unknown) => void, ms: number) => unknown

test('subagent tools become hits and waves; the end closes the fight, the phase and its record', async ($, on) => {
  on('agent.list', () => ({ value: [] }) as never)
  // What the mod writes to its state, read on the way to the kit's bottom.
  const saved: Record<string, unknown> = {}
  on('state.set', (_$, e, next) => {
    const v = e.value as { shape?: string; value?: unknown } | undefined
    saved[e.key] = v && typeof v === 'object' && 'shape' in v ? v.value : v
    return next(e)
  })
  const agents = () => (saved.agents as AgentRun[] | undefined) ?? []
  const phase = () => saved.phase as Phase | null | undefined
  const clock = mock.clock(on, { now: 1000 })
  let opened = 0
  on('ui.open', () => {
    opened++
    return { value: { isPlaced: true } }
  })
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `a${++n}` }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))

  await $.agent.spawn({ prompt: 'x', description: 'Map callers', subagentType: 'general-purpose' } as never)
  await $.agent.spawn({ prompt: 'y', description: 'Fix login', subagentType: 'general-purpose' } as never)
  expect(phase()).toEqual({ number: 1, ids: ['a1', 'a2'], title: 'Map callers' })
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/x', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  // A tool of the main session moves nobody.
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)

  expect(agents().find(a => a.id === 'a1')?.fight).toEqual({ family: 'edit', wave: 2, hits: 1, won: 1 })
  expect(agents().find(a => a.id === 'a2')?.fight).toEqual({ wave: 0, hits: 0, won: 0 })

  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok' } as never)
  await clock.advance(1000)
  expect(agents().find(a => a.id === 'a1')?.fight.won).toBe(2)
  expect(phase()?.end).toBeUndefined()

  await $.turn.complete({ agentId: 'a2', reason: 'error', answer: '' } as never)
  expect(phase()?.end).toBe('defeat')
  const records = (saved.history as PhaseRecord[] | undefined) ?? []
  expect(records.map(r => [r.number, r.end])).toEqual([[1, 'defeat']])

  // Nobody running: the next subagent opens phase 2, named after its own task.
  await $.agent.spawn({ prompt: 'z', description: 'Write tests', subagentType: 'general-purpose' } as never)
  expect(phase()).toEqual({ number: 2, ids: ['a3'], title: 'Write tests' })
  expect(opened).toBe(2)
})

test('/subquest lang pt-BR stores the language and says so', async ($, on) => {
  const stored: Record<string, unknown> = {}
  // The store beneath the plugin: it keeps what it is given.
  on('store.set', (_$, e) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  const r = await $.command.run({ command: 'subquest', args: 'lang pt-BR' } as never)
  expect(stored.lang).toBe('pt-BR')
  expect(r.text).toContain('pt-BR')
  const bad = await $.command.run({ command: 'subquest', args: 'lang fr' } as never)
  expect(bad.text).toContain('/subquest lang')
})

const PANE = {
  plugin: 'subquest',
  component: 'Pane',
  requestId: 'subquest',
  props: { title: 'Subquest', isFocused: false, bodyColumns: 64, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('the pane draws the current phase on every surface, and the tabs switch', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  on('agent.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))

  const empty = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await empty.find({ type: 'Text', text: /No subagents/ }))?.text).toBeDefined()
  await empty.unmount()

  await $.agent.spawn({ prompt: 'x', description: 'Map callers', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'a1' } as never)

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /Phase 1 · Lair of the / }))?.text).toContain('Map callers')
  await term.unmount()

  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  await desk.press({ key: 'tab-history' })
  expect(await desk.find({ type: 'Svg' })).toBeUndefined()
  expect(await desk.find({ type: 'Text', text: /No phase finished yet/ })).toBeDefined()
  await desk.unmount()

  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok' } as never)
  await clock.advance(1000)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Session: 1 phase · 1 victory/ }))?.text).toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    else expect((await ui.find({ type: 'Text', text: /^✓ Phase 1/ }))?.text).toContain('Map callers')
    await ui.unmount()
  }
})

// A kit session with the mod's state recorded and the engine calls it makes answered.
const world = (on: Parameters<TestBody>[1], slow = false) => {
  const saved: Record<string, unknown> = {}
  const writes: string[] = []
  on('state.set', async (_$, e, next) => {
    const v = e.value as { shape?: string; value?: unknown } | undefined
    saved[e.key] = v && typeof v === 'object' && 'shape' in v ? v.value : v
    writes.push(e.key)
    if (slow) await new Promise(r => setTimeout(r, 2)) // a write that takes time lets overlapping handlers interleave
    return next(e)
  })
  const clock = mock.clock(on, { now: 1000 })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let n = 0
  const ids: { next?: string } = {}
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: ids.next ?? `a${++n}` }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  const list = { value: [] as { id: string; status: string }[] } // what the engine lists; empty = nobody is running
  on('agent.list', () => ({ value: list.value }) as never)
  return { ids, saved, writes, clock, list, agents: () => (saved.agents as AgentRun[] | undefined) ?? [], phase: () => saved.phase as Phase | null | undefined }
}
const spawn = ($: Parameters<TestBody>[0], d: string) => $.agent.spawn({ prompt: 'x', description: d, subagentType: 'general-purpose' } as never)

test('a resumed agent goes on with its fight and its phase; a second finish changes nothing', async ($, on) => {
  const w = world(on)
  await spawn($, 'Map callers')
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'a1' } as never)
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok' } as never)
  await w.clock.advance(1000)
  const done = w.agents()[0]
  expect(done?.status).toBe('done')
  const records = (w.saved.history as PhaseRecord[]).length
  await $.turn.complete({ agentId: 'a1', reason: 'error', answer: '' } as never)
  expect(w.agents()[0]).toEqual(done)
  expect((w.saved.history as PhaseRecord[]).length).toBe(records)

  w.ids.next = 'a1'
  await spawn($, 'Map callers again')
  expect(w.agents().length).toBe(1)
  expect(w.agents()[0]?.status).toBe('running')
  expect(w.agents()[0]?.fight.won).toBe(1)
  expect(w.phase()?.ids).toEqual(['a1'])
})

test('spawns and finishes that overlap leave one consistent phase', async ($, on) => {
  const w = world(on, true)
  await Promise.all([spawn($, 'one'), spawn($, 'two'), spawn($, 'three')])
  expect(w.phase()?.ids.slice().sort()).toEqual(['a1', 'a2', 'a3'])
  expect(w.agents().length).toBe(3)
  await Promise.all(['a1', 'a2', 'a3'].map(id => $.turn.complete({ agentId: id, reason: 'answer', answer: 'ok' } as never)))
  await w.clock.advance(1000)
  expect(w.phase()?.end).toBe('victory')
  expect((w.saved.history as PhaseRecord[]).length).toBe(1)
})

test('events of an agent nobody tracks write nothing', async ($, on) => {
  const w = world(on)
  await spawn($, 'one')
  const before = w.writes.length
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'fork-1' } as never)
  await $.turn.complete({ agentId: 'fork-1', reason: 'answer', answer: 'ok' } as never)
  expect(w.writes.length).toBe(before)
})

test('the 1 s clock closes agents the engine no longer runs, at most every 5 s', async ($, on) => {
  const w = world(on)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: '/' }))
  mock.store(on)
  mock.env(on, {})
  on('settings.read', () => ({ value: {} }) as never)
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  await spawn($, 'one')
  await spawn($, 'two')
  w.list.value = [
    { id: 'a1', status: 'running' },
    { id: 'a2', status: 'running' },
  ]
  await w.clock.advance(6000)
  expect(w.agents().map(a => a.status)).toEqual(['running', 'running'])
  w.list.value = [
    { id: 'a1', status: 'completed' },
    { id: 'a2', status: 'killed' },
  ]
  await w.clock.advance(6000)
  expect(w.agents().map(a => a.status)).toEqual(['done', 'failed'])
  expect(w.phase()?.end).toBe('defeat')
  expect((w.saved.history as PhaseRecord[]).length).toBe(1)
})

test('an agent that answers while the engine says it waits on its own background work stays in the fight', async ($, on) => {
  const w = world(on)
  w.list.value = [{ id: 'a1', status: 'running' }]
  await spawn($, 'Run the suite')
  await $.tool.call({ tool: 'PowerShell', command: 'sleep', agentId: 'a1' } as never)
  w.list.value = [{ id: 'a1', status: 'waiting' }]
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'waiting for the run' } as never)
  await w.clock.advance(1000)
  expect(w.agents()[0]?.status).toBe('running')
  expect(w.phase()?.end).toBeUndefined()

  // The engine wakes it (the same id spawns again) and this time it is over.
  w.ids.next = 'a1'
  await spawn($, 'Run the suite again')
  w.list.value = [{ id: 'a1', status: 'completed' }]
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'done' } as never)
  await w.clock.advance(1000)
  expect(w.agents()[0]?.status).toBe('done')
  expect(w.phase()?.end).toBe('victory')
  expect((w.saved.history as PhaseRecord[]).length).toBe(1)
})

test('a failure ends the agent at once, whatever the list says', async ($, on) => {
  const w = world(on)
  w.list.value = [{ id: 'a1', status: 'waiting' }]
  await spawn($, 'one')
  await $.turn.complete({ agentId: 'a1', reason: 'aborted', answer: '' } as never)
  expect(w.agents()[0]?.status).toBe('failed')
  expect(w.phase()?.end).toBe('defeat')
})

test('ending a phase stamps endedAt and keeps redrawing through the finale', async ($, on) => {
  const w = world(on)
  await spawn($, 'one')
  const before = w.writes.filter(k => k === 'now').length
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok' } as never)
  await w.clock.advance(1000)
  expect(w.phase()?.end).toBe('victory')
  expect(w.phase()?.endedAt).toBe(1700)
  const atEnd = w.writes.filter(k => k === 'now').length
  expect(atEnd).toBeGreaterThan(before)
  await w.clock.advance(3000)
  // 500 ms steps through the 2.5 s finale (plus the 1.2 s tick and the last one)
  expect(w.writes.filter(k => k === 'now').length - atEnd).toBeGreaterThanOrEqual(6)
  expect(w.phase()?.endedAt).toBe(1700)
})

test('past the budget, the last rows are drawn still instead of falling back to text', async ($, on) => {
  world(on)
  // Enough fighters that all of them animated would pass the budget, but all still would not.
  const n = 20
  for (let i = 1; i <= n; i++) {
    await spawn($, `task ${i}`)
    await $.tool.call({ tool: 'Read', file_path: '/x', agentId: `a${i}` } as never)
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svgs = await ui.findAll({ type: 'Svg' })
  const texts = await ui.findAll({ type: 'Text', text: /^⚔/ })
  await ui.unmount()
  expect(texts.length).toBe(0)
  expect(svgs.length).toBe(n + 1)
  expect(svgs.reduce((t, s) => t + String(s.props.source).length, 0)).toBeLessThanOrEqual(180_000)
  // the first ones still fight
  expect(svgs.some(s => /@keyframes (?!bob)/.test(String(s.props.source)))).toBe(true)
})

test('/subquest motion off draws the still pane and remembers it; on brings the fight back', async ($, on) => {
  world(on)
  const stored: Record<string, unknown> = {}
  on('store.set', (_$, e) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  await spawn($, 'one')
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'a1' } as never)
  // Whether any drawing animates (the `bob` keyframes are always in the style, used or not).
  const moving = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svgs = await ui.findAll({ type: 'Svg' })
    await ui.unmount()
    expect(svgs.length).toBeGreaterThan(0)
    return svgs.some(s => /@keyframes (?!bob)/.test(String(s.props.source)))
  }
  expect(await moving()).toBe(true)
  const off = await $.command.run({ command: 'subquest', args: 'motion off' } as never)
  expect(stored.motion).toBe('off')
  expect(off.text).toContain('off')
  expect(await moving()).toBe(false)
  await $.command.run({ command: 'subquest', args: 'motion on' } as never)
  expect(stored.motion).toBe('on')
  expect(await moving()).toBe(true)
  expect((await $.command.run({ command: 'subquest', args: 'motion maybe' } as never)).text).toContain('/subquest motion')
})
