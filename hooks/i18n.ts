// Every text the pane shows, in English and Brazilian Portuguese.
import type { Boss, HeroClass } from './game'

export type Lang = 'en' | 'pt-BR'

export function pickLang(...candidates: (string | undefined)[]): Lang {
  for (const c of candidates) {
    if (!c) continue
    if (/^pt|portug/i.test(c)) return 'pt-BR'
    if (/^en|english/i.test(c)) return 'en'
  }
  return 'en'
}

const en = {
  paneTitle: 'Subquest',
  commandDescription: 'Show or hide the Subquest pane (subagents as an RPG party)',
  opened: 'Subquest pane opened.',
  closed: 'Subquest pane closed.',
  langSet: (l: string) => `Subquest language: ${l}.`,
  langUsage: 'Use /subquest lang en or /subquest lang pt-BR.',
  empty: 'No subagents yet. When Claude starts one, it shows up here.',
  phase: (n: number) => `Phase ${n}`,
  lair: (b: string) => `Lair of the ${b}`,
  agents: (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'}`,
  atBoss: (n: number) => `${n} at the boss`,
  fighting: (n: number) => `${n} fighting`,
  hpReal: (pct: number) => `hp ${pct}% (real)`,
  monsterEstimated: (pct: number) => `monster ≈${pct}% (estimated)`,
  vs: (name: string) => `vs ${name}`,
  wave: (n: number) => `wave ${n}`,
  won: (n: number) => `beat ${n}`,
  wonMonsters: (n: number) => `beat ${n} ${n === 1 ? 'monster' : 'monsters'}`,
  preparing: 'getting ready…',
  fell: 'fell in battle',
  done: 'done',
  error: 'error',
  phaseCleared: 'PHASE CLEARED',
  finalBlow: 'FINAL BLOW!',
  partialDefeat: 'partial defeat',
  edge: 'still fighting at the edge of the field',
  moreAtBoss: (n: number) => `+${n} at the boss`,
  critical: 'CRIT',
  level: 'lv',
  costEstimated: 'estimated',
  tabBattle: 'Battle',
  tabHistory: 'History',
  historyEmpty: 'No phase finished yet. Beaten bosses show up here.',
  victory: 'victory',
  defeat: 'defeat',
  monstersBeaten: (n: number) => `${n} ${n === 1 ? 'monster' : 'monsters'}`,
  packSkipped: (file: string, reason: string) => `Subquest: ${file} skipped (${reason})`,
  packsFailed: (reason: string) => `Subquest: could not read your custom characters (${reason}); using the built-in art.`,
  sessionTotal: (phases: number, wins: number) => `Session: ${phases} ${phases === 1 ? 'phase' : 'phases'} · ${wins} ${wins === 1 ? 'victory' : 'victories'}`,
}
type Strings = typeof en

const ptBR: Strings = {
  paneTitle: 'Subquest',
  commandDescription: 'Mostra ou esconde o painel do Subquest (subagentes como grupo de RPG)',
  opened: 'Painel do Subquest aberto.',
  closed: 'Painel do Subquest fechado.',
  langSet: (l: string) => `Idioma do Subquest: ${l}.`,
  langUsage: 'Use /subquest lang en ou /subquest lang pt-BR.',
  empty: 'Nenhum subagente ainda. Quando o Claude abrir um, ele aparece aqui.',
  phase: (n: number) => `Fase ${n}`,
  // shortcut: "do" assumes a masculine boss name; revisit if a custom pack brings a feminine one
  lair: (b: string) => `Covil do ${b}`,
  agents: (n: number) => `${n} ${n === 1 ? 'agente' : 'agentes'}`,
  atBoss: (n: number) => `${n} no chefe`,
  fighting: (n: number) => `${n} lutando`,
  hpReal: (pct: number) => `vida ${pct}% (real)`,
  monsterEstimated: (pct: number) => `monstro ≈${pct}% (estimado)`,
  vs: (name: string) => `vs ${name}`,
  wave: (n: number) => `onda ${n}`,
  won: (n: number) => `venceu ${n}`,
  wonMonsters: (n: number) => `venceu ${n} ${n === 1 ? 'monstro' : 'monstros'}`,
  preparing: 'se preparando…',
  fell: 'caiu em combate',
  done: 'concluído',
  error: 'erro',
  phaseCleared: 'FASE CONCLUÍDA',
  finalBlow: 'GOLPE FINAL!',
  partialDefeat: 'derrota parcial',
  edge: 'na beira do campo, ainda lutando',
  moreAtBoss: (n: number) => `+${n} no chefe`,
  critical: 'CRÍTICO',
  level: 'nv',
  costEstimated: 'estimado',
  tabBattle: 'Batalha',
  tabHistory: 'Histórico',
  historyEmpty: 'Nenhuma fase terminou ainda. Os chefes vencidos aparecem aqui.',
  victory: 'vitória',
  defeat: 'derrota',
  monstersBeaten: (n: number) => `${n} ${n === 1 ? 'monstro' : 'monstros'}`,
  packSkipped: (file: string, reason: string) => `Subquest: ${file} ignorado (${reason})`,
  packsFailed: (reason: string) => `Subquest: não deu pra ler seus personagens personalizados (${reason}); usando a arte embutida.`,
  sessionTotal: (phases: number, wins: number) => `Sessão: ${phases} ${phases === 1 ? 'fase' : 'fases'} · ${wins} ${wins === 1 ? 'vitória' : 'vitórias'}`,
}

export const STRINGS: Record<Lang, Strings> = { en, 'pt-BR': ptBR }

export const CLASS_NAME: Record<Lang, Record<HeroClass, string>> = {
  en: { knight: 'Knight', barbarian: 'Barbarian', rogue: 'Rogue', samurai: 'Samurai', archer: 'Archer', mage: 'Mage', cleric: 'Cleric', necromancer: 'Necromancer' },
  'pt-BR': { knight: 'Cavaleiro', barbarian: 'Bárbaro', rogue: 'Ladino', samurai: 'Samurai', archer: 'Arqueiro', mage: 'Mago', cleric: 'Clérigo', necromancer: 'Necromante' },
}
export const BOSS_NAME: Record<Lang, Record<Boss, string>> = {
  en: { warlord: 'Warlord', darkKnight: 'Dark Knight' },
  'pt-BR': { warlord: 'Senhor da Guerra', darkKnight: 'Cavaleiro Sombrio' },
}
