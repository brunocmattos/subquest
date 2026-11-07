// The agents' state from engine events, as pure functions: list in, new list out.
import type { AgentRun, Phase, PhaseRecord } from '../types'
import { contextOf, costOf, tokensOf } from './cost'
import type { Usage } from './cost'
import { bossOf, finish, hit } from './game'

const at = (list: readonly AgentRun[], id: string, fn: (a: AgentRun) => AgentRun): AgentRun[] => {
  const i = list.findIndex(a => a.id === id)
  if (i < 0) return list as AgentRun[]
  const out = [...list]
  out[i] = fn(list[i] as AgentRun)
  return out
}

export const running = (list: readonly AgentRun[]): number => list.filter(a => a.status === 'running').length

// Keeps the last 50 agents: the pane shows the current wave and a few before it.
export const spawned = (list: readonly AgentRun[], run: AgentRun): AgentRun[] => {
  // A resume spawns the same id again: the same fight goes on.
  if (list.some(a => a.id === run.id)) return at(list, run.id, ({ endedAt: _end, ...a }) => ({ ...a, status: 'running' }))
  return [...list, run].slice(-50)
}

export const toolUsed = (list: readonly AgentRun[], id: string, tool: string, now: number): AgentRun[] =>
  at(list, id, a => {
    const fight = hit(a.fight, tool)
    const fell = a.fight.family && fight.family !== a.fight.family ? { family: a.fight.family, at: now } : a.fell
    return { ...a, fight, steps: a.steps + 1, ...(fell ? { fell } : {}) }
  })

const addUsage = (a: AgentRun, u: Usage, model: string): AgentRun => ({
  ...a,
  model,
  contextTokens: contextOf(u),
  tokens: a.tokens + tokensOf(u),
  costUsd: a.costUsd + costOf(u, model),
})

export const stepped = (list: readonly AgentRun[], id: string, u: Usage, model: string): AgentRun[] => at(list, id, a => addUsage(a, u, model))

export type EndReason = 'answer' | 'aborted' | 'refusal' | 'error'
export const completed = (list: readonly AgentRun[], id: string, reason: EndReason, now: number, usage?: Usage & { model?: string }): AgentRun[] =>
  at(list, id, a => {
    if (a.status !== 'running') return a
    const counted = a.tokens === 0 && usage ? addUsage(a, usage, usage.model ?? a.model) : a
    if (reason !== 'answer') return { ...counted, status: 'failed', endedAt: now }
    const fell = a.fight.family ? { family: a.fight.family, at: now } : a.fell
    return { ...counted, status: 'done', endedAt: now, fight: finish(a.fight), ...(fell ? { fell } : {}) }
  })

// Our running agents the engine no longer runs: closed by how it ended (anything but `completed` is an error).
export const staleRuns = (list: readonly AgentRun[], info: readonly { id: string; status: string }[]): { id: string; reason: EndReason }[] =>
  list.flatMap(a => {
    if (a.status !== 'running') return []
    const s = info.find(i => i.id === a.id)?.status
    return !s || s === 'completed' || s === 'failed' || s === 'killed' ? [{ id: a.id, reason: (s === 'completed' ? 'answer' : 'error') as EndReason }] : []
  })

// A finished phase as the history tab keeps it; undefined while it still runs.
export function phaseRecord(p: Phase, list: readonly AgentRun[]): PhaseRecord | undefined {
  if (!p.end) return undefined
  const runs = list.filter(a => p.ids.includes(a.id))
  const start = Math.min(...runs.map(a => a.startedAt))
  const end = Math.max(...runs.map(a => a.endedAt ?? a.startedAt))
  return {
    number: p.number,
    ...(p.title ? { title: p.title } : {}),
    boss: bossOf(p.ids.length),
    end: p.end,
    agents: p.ids.length,
    won: runs.reduce((n, a) => n + a.fight.won, 0),
    durationMs: runs.length ? end - start : 0,
    tokens: runs.reduce((n, a) => n + a.tokens, 0),
    costUsd: runs.reduce((n, a) => n + a.costUsd, 0),
  }
}
