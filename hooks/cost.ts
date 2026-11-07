// Token counts -> an estimated cost. The engine reports tokens, not money.
export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}
// USD per million tokens; `read` = cache read as a fraction of input (0.1 when absent).
type Price = { input: number; output: number; read?: number }

// From https://platform.claude.com/docs/en/about-claude/pricing (read 2026-11-07). First match wins.
// shortcut: Haiku 5.5's over-100k-prompt tier and 5-minute cache writes are not modeled; revisit if estimates drift from the bill.
const PRICES: readonly [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, { input: 10, output: 50, read: 0.025 }],
  [/fable|mythos/, { input: 10, output: 50 }],
  [/opus-5-5/, { input: 4, output: 20, read: 0.05 }],
  [/opus/, { input: 5, output: 25 }],
  [/sonnet-5-5/, { input: 2, output: 10, read: 0.05 }],
  [/sonnet-5/, { input: 2, output: 10 }],
  [/sonnet/, { input: 3, output: 15 }],
  [/haiku-5-5/, { input: 0.1, output: 0.5 }],
  [/haiku/, { input: 1, output: 5 }],
]
const CACHE_READ = 0.1
const CACHE_WRITE = 2 // 1-hour writes

export const priceOf = (model: string): Price | undefined => PRICES.find(([re]) => re.test(model))?.[1]
export function costOf(u: Usage, model: string): number {
  const p = priceOf(model)
  if (!p) return 0
  const read = p.read ?? CACHE_READ
  return (u.input_tokens * p.input + u.output_tokens * p.output + u.cache_read_input_tokens * p.input * read + u.cache_creation_input_tokens * p.input * CACHE_WRITE) / 1_000_000
}
export const contextOf = (u: Usage): number => u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
export const tokensOf = (u: Usage): number => contextOf(u) + u.output_tokens
