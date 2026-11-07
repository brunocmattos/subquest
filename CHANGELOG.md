# Changelog

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
