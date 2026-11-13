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

test('Haiku 5.5 past 100k of prompt pays its long tier, for the whole request', async () => {
  const short = { input_tokens: 60_000, output_tokens: 1_000_000, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 0 }
  expect(Math.abs(costOf(short, 'claude-haiku-5-5') - (0.006 + 0.5 + 0.0004)) < 1e-6).toBe(true)
  const long = { ...short, cache_read_input_tokens: 40_001 }
  expect(Math.abs(costOf(long, 'claude-haiku-5-5') - (0.03 + 2.5 + 0.0020000500)) < 1e-6).toBe(true)
})

test('Opus 4 and 4.1 keep their old price; 4.5 and later do not', async () => {
  for (const id of ['claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-opus-4-0', 'anthropic.claude-opus-4-1-20250805-v1:0']) expect(priceOf(id)?.input).toBe(15)
  expect(priceOf('claude-opus-4-5-20251101')?.input).toBe(5)
  expect(priceOf('claude-opus-4-8')?.input).toBe(5)
})

test('unknown model costs 0 (shown as no estimate)', async () => {
  expect(priceOf('gpt-x')).toBeUndefined()
  expect(costOf(u, 'gpt-x')).toBe(0)
})

test('context and tokens', async () => {
  expect(contextOf({ ...u, output_tokens: 5 })).toBe(3_000_000)
  // New work only: a cache read is the same context again, so it is not counted at every step.
  expect(tokensOf(u)).toBe(3_000_000)
})
