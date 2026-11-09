// Engine events -> Subquest state, and the state -> the pane.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Phase, PhaseRecord } from '../types'
import { cast, parsePack } from './characters'
import type { Pack, Roster } from './characters'
import type { Usage } from './cost'
import { FINALE_MS, endPhase, spawnPhase, titleOf } from './game'
import { STRINGS, pickLang } from './i18n'
import type { Lang } from './i18n'
import { fmtK, fmtTime, modelLine, historySvg, historyText, phaseSvg, phaseText, rowSvg, rowText } from './scene'
import type { RowData } from './scene'
import { completed, phaseRecord, running, spawned, staleRuns, stepped, toolUsed } from './tracker'
import type { EndReason } from './tracker'

const PANE = 'subquest'
const BUDGET = 180_000 // all the pane's SVGs together: past ~256 KB the app refuses the pane
// shortcut: a remote surface reports cells of its code font, about 8 CSS px wide; revisit once seen live.
const CELL_PX = 8

const agents = atom({ plugin: 'subquest', key: 'agents' } as const, [] as AgentRun[], { shape: 'agents-v1' })
const phase = atom({ plugin: 'subquest', key: 'phase' } as const, null as Phase | null, { shape: 'phase-v2' })
const history = atom({ plugin: 'subquest', key: 'history' } as const, [] as PhaseRecord[], { shape: 'history-v1' })
const view = atom({ plugin: 'subquest', key: 'view' } as const, 'battle' as 'battle' | 'history')
const now = atom({ plugin: 'subquest', key: 'now' } as const, 0)
const openedFor = atom({ plugin: 'subquest', key: 'openedFor' } as const, '')

// Module state: a hot reload runs session.start again and rebuilds both.
let lang: Lang = 'en'
let motion = true // `/subquest motion off` draws the still drawings, kept across sessions
let roster: Roster = cast([])
let timer: { cancel: () => void } | undefined
let lastSync = 0

// Every state-changing handler runs here, one after another: each read-modify-write ends before the next starts.
// `next(e)` stays outside it, so the queue never waits on the engine.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(f: () => Promise<T>): Promise<T> {
  const p = queue.then(f)
  queue = p.catch(() => undefined)
  return p
}

async function chooseLang($: EngineInterface): Promise<Lang> {
  const stored = await $.store.get('lang')
  const setting = await $.settings.read({ key: 'language' })
  let locale: string | undefined
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    locale = undefined // the runtime may have no Intl
  }
  return pickLang(typeof stored === 'string' ? stored : undefined, typeof setting === 'string' ? setting : undefined, locale)
}

async function loadPacks($: EngineInterface): Promise<Pack[]> {
  try {
    return await readPacks($)
  } catch (err) {
    // Packs are optional: nothing here may abort session.start, but the person should know why their art is missing.
    $.ui.toast(STRINGS[lang].packsFailed(err instanceof Error ? err.message : String(err)))
    return []
  }
}

async function readPacks($: EngineInterface): Promise<Pack[]> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return []
  const dir = `${home}/.claude/subquest/packs`
  if (!(await $.fs.exists(dir))) return []
  const packs: Pack[] = []
  for (const f of await $.fs.list(dir)) {
    if (f.kind !== 'file' || !/\.json$/i.test(f.name)) continue
    let r: ReturnType<typeof parsePack>
    try {
      r = parsePack(await $.fs.read(`${dir}/${f.name}`))
    } catch (err) {
      r = { ok: false, reason: err instanceof Error ? err.message : 'unreadable' }
    }
    if (r.ok) packs.push(r.pack)
    else $.ui.toast(STRINGS[lang].packSkipped(f.name, r.reason))
  }
  return packs
}

async function tick($: EngineInterface): Promise<number> {
  const t = await $.clock.now()
  await update($, now, () => t)
  return t
}
// The 1 s clock: redraw while someone runs and, every 5 s, close the agents the engine no longer runs.
async function tickWhileRunning($: EngineInterface): Promise<void> {
  const list = await read($, agents)
  if (!running(list)) return
  const t = await tick($)
  if (t - lastSync < 5000) return
  lastSync = t
  let info: Awaited<ReturnType<EngineInterface['agent']['list']>>
  try {
    info = await $.agent.list()
  } catch {
    return // try again in 5 s
  }
  for (const s of staleRuns(list, info)) await finish($, s.id, s.reason)
}

async function tracked($: EngineInterface, id: string): Promise<boolean> {
  return (await read($, agents)).some(a => a.id === id)
}

async function onSpawn($: EngineInterface, id: string, type: string, description: string, model: string): Promise<void> {
  const startedAt = await $.clock.now()
  const run: AgentRun = { id, type, description, model, status: 'running', startedAt, contextTokens: 0, tokens: 0, costUsd: 0, steps: 0, fight: { wave: 0, hits: 0, won: 0 } }
  let before = 0
  await update($, agents, list => {
    before = running(list)
    return spawned(list, run)
  })
  const last = Math.max(0, ...(await read($, history)).map(r => r.number))
  const p = await update($, phase, ph => spawnPhase(ph, id, before, titleOf(description), last))
  await tick($)
  const key = `phase-${p?.number ?? 0}`
  if ((await read($, openedFor)) === key) return
  await update($, openedFor, () => key)
  await update($, view, () => 'battle')
  await $.ui.open({ id: PANE, title: STRINGS[lang].paneTitle })
}

async function onTool($: EngineInterface, id: string, tool: string): Promise<void> {
  if (!(await tracked($, id))) return // an engine fork (compaction...) nobody tracks
  const t = await $.clock.now()
  await update($, agents, list => toolUsed(list, id, tool, t))
}

async function onStep($: EngineInterface, id: string, usage: Usage, model: string): Promise<void> {
  if (!(await tracked($, id))) return
  await update($, agents, list => stepped(list, id, usage, model))
}

async function finish($: EngineInterface, id: string, reason: EndReason, usage?: Usage & { model?: string }): Promise<void> {
  if (!(await tracked($, id))) return
  const t = await $.clock.now()
  const list = await update($, agents, l => completed(l, id, reason, t, usage))
  let ended: Phase | undefined
  await update($, phase, ph => {
    ended = undefined
    if (!ph || !ph.ids.includes(id)) return ph
    const next = endPhase(ph, x => list.find(a => a.id === x)?.status, t)
    if (next.end && !ph.end) ended = next
    return next
  })
  const record = ended && phaseRecord(ended, list)
  if (record) await update($, history, h => [record, ...h].slice(0, 100))
  await tick($)
  // One more tick after the dying monster's second, so a redraw does not replay its death.
  $.clock.after(1200, () => void serial(() => tick($)))
  // The finale animates by redraws (the clock stops once nobody runs): tick through it and once after.
  if (ended?.end === 'victory') for (let ms = 500; ms <= FINALE_MS; ms += 500) $.clock.after(ms, () => void serial(() => tick($)))
  if (ended?.end === 'victory') $.clock.after(FINALE_MS + 300, () => void serial(() => tick($)))
}

async function runCommand($: EngineInterface, args: string): Promise<{ text: string }> {
  const t = STRINGS[lang]
  const words = args.trim().split(/\s+/).filter(Boolean)
  if (!words.length) {
    if ((await $.ui.panes()).some(p => p.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: t.closed }
    }
    await $.ui.open({ id: PANE, title: t.paneTitle })
    return { text: t.opened }
  }
  const [what, value] = words.length === 2 ? words.map(w => w.toLowerCase()) : []
  if (what === 'motion' && (value === 'on' || value === 'off')) {
    await $.store.set('motion', value)
    motion = value === 'on'
    $.ui.invalidate('ui.render')
    return { text: t.motionSet(motion) }
  }
  const want: Lang | undefined = what !== 'lang' ? undefined : value === 'en' ? 'en' : value === 'pt-br' ? 'pt-BR' : undefined
  if (!want) return { text: t.usage }
  await $.store.set('lang', want)
  lang = want
  $.ui.invalidate('ui.render')
  return { text: STRINGS[want].langSet(want) }
}

const prettyModel = (model: string): string => {
  const m = /(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d+))?/i.exec(model)
  return m ? `${(m[1] ?? '').charAt(0).toUpperCase()}${(m[1] ?? '').slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : model
}
function rowOf(a: AgentRun, t: number): RowData {
  const cost = a.costUsd > 0 ? ` · ~$${a.costUsd.toFixed(2)}` : ''
  return {
    id: a.id,
    title: a.description || a.type,
    model: a.model,
    modelText: modelLine(a.type, prettyModel(a.model)),
    status: a.status,
    fight: a.fight,
    stats: `ctx ${fmtK(a.contextTokens)} · ${fmtK(a.tokens)} tok${cost} · ${fmtTime((a.endedAt ?? t) - a.startedAt)}`,
    ...(a.fell ? { fell: a.fell } : {}),
    ...(a.endedAt !== undefined ? { endedAt: a.endedAt } : {}),
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'subquest', description: STRINGS.en.commandDescription, argumentHint: '[lang en|pt-BR | motion on|off]' })
    timer?.cancel() // a hot reload drops the old timer with its environment; a plain second start must not stack one
    timer = $.clock.every(1000, () => void serial(() => tickWhileRunning($)))
    lang = await chooseLang($)
    motion = (await $.store.get('motion')) !== 'off'
    roster = cast(await loadPacks($))
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const id = r.agentId
    if (id) await serial(() => onSpawn($, id, e.subagentType, e.description, r.model))
    return r
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id) await serial(() => onTool($, id, String(e.tool)))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const id = e.agentId
    const u = r.usage
    if (id && u) await serial(() => onStep($, id, u, u.model))
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id) await serial(() => finish($, id, e.reason, e.usage))
    return next(e)
  })

  on('command.run', { command: 'subquest' }, async ($, e) => runCommand($, e.args))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // The terminal's table answers Svg with an empty box: it draws text there.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
    const t = STRINGS[lang]
    const tab = await read($, view)
    const tabs = (
      <Box flexDirection="row" gap={1}>
        <Button key="tab-battle" variant={tab === 'battle' ? 'primary' : 'secondary'} onPress={() => update($, view, () => 'battle')}>
          {t.tabBattle}
        </Button>
        <Button key="tab-history" variant={tab === 'history' ? 'primary' : 'secondary'} onPress={() => update($, view, () => 'history')}>
          {t.tabHistory}
        </Button>
      </Box>
    )
    const cols = e.props.bodyColumns
    const W = cols > 0 ? Math.max(320, Math.min(900, Math.round(cols * CELL_PX))) : 520
    let used = 0
    if (tab === 'history') {
      const records = await read($, history)
      if (!records.length) {
        return (
          <Box flexDirection="column">
            {tabs}
            <Text dimColor>{t.historyEmpty}</Text>
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          {tabs}
          <Text dimColor>{t.sessionTotal(records.length, records.filter(r => r.end === 'victory').length)}</Text>
          {records.map(r => {
            const line = historyText(r, roster, lang)
            const s = Svg ? historySvg(r, W, roster, lang) : ''
            if (!Svg || used + s.length > BUDGET) return <Text>{line}</Text>
            used += s.length
            return <Svg source={s} alt={line} />
          })}
        </Box>
      )
    }

    const list = await read($, agents)
    const ph = await read($, phase)
    const clock = await read($, now)
    const rows = (ph?.ids ?? []).map(id => list.find(a => a.id === id)).filter((a): a is AgentRun => !!a).map(a => rowOf(a, clock))
    if (!ph || !rows.length) {
      return (
        <Box flexDirection="column">
          {tabs}
          <Text dimColor>{t.empty}</Text>
        </Box>
      )
    }
    if (!Svg) {
      return (
        <Box flexDirection="column">
          {tabs}
          {phaseText(ph, rows, roster, lang).map(line => (
            <Text>{line}</Text>
          ))}
        </Box>
      )
    }
    // The field, then each row: animated only if the still drawings of those after it still fit, so the last
    // rows go still before any goes to text; undefined (text) only when even its still one would pass the budget.
    const draws = [
      (still: boolean) => phaseSvg(ph, rows, W, clock, roster, lang, still),
      ...rows.map(r => (still: boolean) => rowSvg(r, W, clock, roster, lang, still)),
    ]
    const stills = draws.map(d => d(true))
    let reserve = stills.reduce((n, s) => n + s.length, 0)
    const svgs = draws.map((draw, i) => {
      const still = stills[i] ?? ''
      reserve -= still.length
      let s = motion ? draw(false) : still
      if (used + s.length + reserve > BUDGET) s = still
      if (used + s.length > BUDGET) return undefined
      used += s.length
      return s
    })
    const lines = phaseText(ph, rows, roster, lang)
    return (
      <Box flexDirection="column">
        {tabs}
        {svgs[0] ? <Svg source={svgs[0]} alt={lines[0] ?? ''} /> : <Text>{lines[0] ?? ''}</Text>}
        {rows.map((r, i) => {
          const s = svgs[i + 1]
          const line = lines[i + 1] ?? rowText(r, roster, lang)
          return s ? <Svg source={s} alt={line} /> : <Text>{line}</Text>
        })}
      </Box>
    )
  })
}
