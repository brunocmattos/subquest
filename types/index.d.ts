export type AgentStatus = 'running' | 'done' | 'failed'

/** The family of the tool a subagent is using: it picks the monster. */
export type Family = 'read' | 'edit' | 'command' | 'web' | 'other'

/** One agent's fight: the current monster (family), the wave, hits in it and monsters beaten. */
export type Fight = { family?: Family; wave: number; hits: number; won: number }

/** A wave of agents born together, facing one boss; `end` once the last one finishes; `title` = the first agent's task. */
export type Phase = { number: number; ids: string[]; end?: 'victory' | 'defeat'; endedAt?: number; title?: string }

export type AgentRun = {
  id: string
  type: string
  description: string
  model: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  /** Live context of the last request (input + cache read + cache write). */
  contextTokens: number
  /** Every token of every request, summed. */
  tokens: number
  costUsd: number
  steps: number
  fight: Fight
  /** When and from which family the previous monster fell: the scene plays its death for 1 s. */
  fell?: { family: Family; at: number }
}

/** A finished phase, for the battle history tab. */
export type PhaseRecord = {
  number: number
  title?: string
  boss: 'warlord' | 'darkKnight'
  end: 'victory' | 'defeat'
  agents: number
  won: number
  durationMs: number
  tokens: number
  costUsd: number
}

declare module 'claude-code' {
  interface PluginState {
    subquest: {
      agents: Shaped<AgentRun[]>
      phase: Shaped<Phase | null>
      /** Finished phases of this session, newest first. */
      history: Shaped<PhaseRecord[]>
      /** Which tab the pane shows. */
      view: 'battle' | 'history'
      now: number
      /** The phase key the pane already opened itself for (opens once per phase). */
      openedFor: string
    }
  }
}
