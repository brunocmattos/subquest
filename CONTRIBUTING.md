# Contributing to Subquest

Thanks for joining the party. Here's the short version.

## Requirements

- Claude Code with plugin support
- Node 24

## Check your work

```
claude plugin validate .
claude plugin test .
node --test scripts/*.test.mjs
```

The first checks the manifests and the hooks module, the second runs the mod's tests (`hooks/**/*.test.ts*`), the third runs the converter's tests.

## Art

- Regenerate the README images: `npm install && npm run assets`
- Look at every built-in character, animated: `node --experimental-strip-types scripts/gallery.mts`, then open `docs/gallery.html`

Art must be original (drawn by code, like the built-in heroes, monsters and bosses) or properly licensed for redistribution. Don't commit third-party sprites you can't share.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat: necromancer summons a skeleton`, `fix: slime stops jiggling after death`, `docs: ...`.

One change per pull request, with tests for new logic.
