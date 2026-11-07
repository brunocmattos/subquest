import { expect, test } from 'claude-code/testing'

import { cast, parsePack } from './characters'

const tiny = { w: 2, h: 1, palette: ['#ff0000'], anim: { idle: ['0.0.2.0'], attack: ['0.0.1.0'], hurt: ['0.0.1.0'], death: ['0.0.1.0'] } }

test('a valid pack file becomes a custom character', async () => {
  const c = parsePack(JSON.stringify({ kind: 'monster', family: 'read', name: { en: 'Bone', 'pt-BR': 'Osso' }, ...tiny }))
  expect(c.ok).toBe(true)
})

test('bad packs are refused with a reason', async () => {
  expect(parsePack('not json').ok).toBe(false)
  expect(parsePack(JSON.stringify({ ...tiny, kind: 'monster' })).ok).toBe(false)
  expect(parsePack(JSON.stringify({ kind: 'hero', name: 'X', ...tiny, anim: { idle: [] } })).ok).toBe(false)
  expect(parsePack(JSON.stringify({ kind: 'hero', name: 'X', ...tiny, palette: [] })).ok).toBe(false)
})

test('cast: built-in by default, custom roster when present', async () => {
  const builtIn = cast([])
  expect(builtIn.hero('a1', 2).character.w).toBe(16)
  expect(builtIn.monster('read', 'a1', 1).character.w).toBe(16)
  expect(builtIn.boss('warlord', 1).character.w).toBe(32)
  const p = parsePack(JSON.stringify({ kind: 'monster', family: 'read', name: 'Bone', ...tiny }))
  if (!p.ok) throw new Error(p.reason)
  const custom = cast([p.pack])
  expect(custom.monster('read', 'a1', 1).name.en).toBe('Bone')
  expect(custom.monster('edit', 'a1', 1).character.w).toBe(16)
})

test('cast: several custom bosses of one size, picked by the seed', async () => {
  const boss = (name: string) => {
    const p = parsePack(JSON.stringify({ kind: 'boss', size: 'small', name, ...tiny }))
    if (!p.ok) throw new Error(p.reason)
    return p.pack
  }
  const two = cast([boss('Ogre'), boss('Troll')])
  expect([two.boss('warlord', 0).name.en, two.boss('warlord', 1).name.en]).toEqual(['Ogre', 'Troll'])
  expect(two.boss('darkKnight', 0).character.w).toBe(32)
})
