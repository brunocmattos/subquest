import { expect, test } from 'claude-code/testing'

import { contextOf, costOf, priceOf, tokensOf } from './cost'

const u = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 }

test('cost = input + output + read multiplier x input + 2x input for writes', async () => {
  expect(Math.abs(costOf(u, 'claude-sonnet-4-6') - (3 + 15 + 0.3 + 6)) < 1e-6).toBe(true)
  expect(Math.abs(costOf(u, 'claude-sonnet-5-5') - (2 + 10 + 0.1 + 4)) < 1e-6).toBe(true)
  expect(Math.abs(costOf(u, 'claude-opus-5-5') - (4 + 20 + 0.2 + 8)) < 1e-6).toBe(true)
  expect(Math.abs(costOf(u, 'claude-fable-5-1') - (10 + 50 + 0.25 + 20)) < 1e-6).toBe(true)
})

test('a specific release wins over its family', async () => {
  expect(priceOf('claude-opus-5-5')?.input).toBe(4)
  expect(priceOf('claude-opus-5')?.input).toBe(5)
  expect(priceOf('claude-haiku-5-5')?.input).toBe(0.1)
  expect(priceOf('claude-haiku-4-5')?.input).toBe(1)
  expect(priceOf('claude-sonnet-5')?.input).toBe(2)
})

test('unknown model costs 0 (shown as no estimate)', async () => {
  expect(priceOf('gpt-x')).toBeUndefined()
  expect(costOf(u, 'gpt-x')).toBe(0)
})

test('context and tokens', async () => {
  expect(contextOf({ ...u, output_tokens: 5 })).toBe(3_000_000)
  expect(tokensOf(u)).toBe(4_000_000)
})
