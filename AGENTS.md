# Agent Guide — Hearth & Hamlet

Read [HANDOFF.md](HANDOFF.md) before making changes. It is the canonical current-state brief; [ARCHITECTURAL.md](ARCHITECTURAL.md) and [DESIGN.md](DESIGN.md) are the detailed contracts.

## Commands

```sh
npm test
npm run build
npm run dev
npm run preview
npm run assets
```

`npm run dev` runs `server.js` with Vite middleware and serves `/api/advisor`. `npm run assets` requires Blender and can regenerate several binary artifacts.

## Working rules

- Inspect `git status --short` and `git diff` first. The bakery generator and `public/models/bakery.glb` already have uncommitted work; preserve it.
- Do not use destructive Git commands or overwrite unrelated work. Do not commit unless asked.
- Keep `OPENROUTER_API_KEY` server-side. `.env.local` is untracked; the advisor remains optional.
- Put domain rules in `src/catalog.js`; put runtime simulation/rendering/persistence in `src/world.js`; keep React presentation in `src/main.jsx` and `src/style.css`.
- Preserve local-first saves (`hearth-v1`), validated placement, delivery-based production credit, resource disposal, reduced-motion support, and keyboard/focus behavior.
- Change the Blender generator rather than manually editing generated GLBs whenever an asset needs a durable change.
- For simulation/rule changes, update `tests/simulation.test.js`. For UI or 3D changes, perform focused browser QA as described in `HANDOFF.md`.
- Before handoff, run `npm test`, `npm run build`, and `git diff --check`, then report any browser checks separately and truthfully.
