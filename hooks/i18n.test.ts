import { expect, test } from 'claude-code/testing'

import { STRINGS, pickLang } from './i18n'

test('first candidate that names a language wins', async () => {
  expect(pickLang(undefined, 'pt-BR')).toBe('pt-BR')
  expect(pickLang('portuguese')).toBe('pt-BR')
  expect(pickLang('pt_PT', 'en')).toBe('pt-BR')
  expect(pickLang('en-US', 'pt-BR')).toBe('en')
  expect(pickLang('fr-FR', 'english')).toBe('en')
  expect(pickLang(undefined, '')).toBe('en')
})

test('both languages carry every string', async () => {
  expect(Object.keys(STRINGS['pt-BR']).sort()).toEqual(Object.keys(STRINGS.en).sort())
  expect(STRINGS.en.wave(3)).toBe('wave 3')
  expect(STRINGS['pt-BR'].wave(3)).toBe('onda 3')
})

test('the pack toast is translated around the technical reason', async () => {
  expect(STRINGS.en.packSkipped('a.json', 'bad json')).toBe('Subquest: a.json skipped (bad json)')
  expect(STRINGS['pt-BR'].packSkipped('a.json', 'bad json')).toBe('Subquest: a.json ignorado (bad json)')
})

test('counts use the singular at 1 and the plural otherwise, in both languages', async () => {
  const en = STRINGS.en
  const pt = STRINGS['pt-BR']
  expect([en.agents(1), en.agents(2)]).toEqual(['1 agent', '2 agents'])
  expect([en.wonMonsters(1), en.wonMonsters(2)]).toEqual(['beat 1 monster', 'beat 2 monsters'])
  expect([en.monstersBeaten(1), en.monstersBeaten(2)]).toEqual(['1 monster', '2 monsters'])
  expect([en.sessionTotal(1, 1), en.sessionTotal(2, 2)]).toEqual(['Session: 1 phase · 1 victory', 'Session: 2 phases · 2 victories'])
  expect([pt.agents(1), pt.agents(2)]).toEqual(['1 agente', '2 agentes'])
  expect([pt.wonMonsters(1), pt.wonMonsters(2)]).toEqual(['venceu 1 monstro', 'venceu 2 monstros'])
  expect([pt.monstersBeaten(1), pt.monstersBeaten(2)]).toEqual(['1 monstro', '2 monstros'])
  expect([pt.sessionTotal(1, 1), pt.sessionTotal(2, 2)]).toEqual(['Sessão: 1 fase · 1 vitória', 'Sessão: 2 fases · 2 vitórias'])
})
