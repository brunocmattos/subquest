# Changelog

## 1.1.2 — 2026-11-13

- Tokens are counted as new work only (input, cache writes and output). Every step of an agent re-reads its whole context from the cache, and counting those reads each time showed about three times the real total, more the longer the agent ran.
- An agent that answers while the engine says it waits on its own background work (a long test run, say) stays in the fight. Its phase no longer closes as a victory and reopens at every wake-up: it ends when the engine lists it `completed`.
- An agent the engine no longer lists counts as finished, not as an error. A failure, an interruption or a kill still ends it, and its phase, as a defeat.

## 1.1.1 — 2026-11-09

- With large custom characters and many agents, the last row of the Battle tab no longer turns into a line of text: past the pane's size budget the last rows are drawn still instead.

## 1.1.0 — 2026-11-07

- `/subquest motion off` draws still pictures instead of the fight, and remembers it across sessions; `/subquest motion on` brings it back.
- On victory, the last hero to finish takes the front of the line for the final blow (it could be left out past the sixth).
- Cost estimates follow the current price list: Haiku 5.5 prompts over 100k tokens pay its long tier, and Opus 4 and 4.1 their own price.
- The 1 s clock is cancelled the right way when the session starts again.
- CI runs the manifest check and every test on each push and pull request.
- The sprite maker is tracked in [#1](https://github.com/brunocmattos/subquest/issues/1).

## 1.0.0 — 2026-11-07

First release.

- Every subagent is a hero: Clawd in one of 8 classes, picked by the agent id, leveled by model (Haiku 1, Sonnet 2, Opus 3).
- The tool in use summons the monster: Skeleton (read), Goblin (edit), Slime (command), Bat (web), Beast (anything else), with seeded looks and names.
- Waves of agents are phases against a crowned boss (Warlord for 1 to 3 agents, Dark Knight for 4 or more) with real HP, a per-phase variant and a *Lair of the &lt;boss&gt;* title.
- Per-agent context, tokens, estimated cost and time.
- Battle and History tabs, with a session total.
- The pane opens once per phase; `/subquest` toggles it.
- English and Brazilian Portuguese, automatic or with `/subquest lang en|pt-BR`.
- Text version for terminal surfaces.
- Custom characters from `~/.claude/subquest/packs/*.json`, and `scripts/convert.mjs` to turn PNG sprite sheets into packs.
- Zero tokens: only engine events.
