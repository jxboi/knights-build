# Hearth & Hamlet — AI Handoff

This is the canonical project handoff for any continuation agent, including Antigravity and Claude. Read this file first, then use the linked documents for depth.

## Project at a glance

Hearth & Hamlet is a local-first, low-poly medieval village builder. The frontend is React 19 + Vite; the playable world and simulation are Three.js. Village state is saved in browser `localStorage`, not a database. An optional Village Advisor calls OpenRouter through a server-side endpoint.

The existing game is functional and feature-rich. Treat a request to "continue" as a request to make a targeted improvement, not to rebuild the app or replace the scene with a static mockup.

## Read in this order

1. [AGENTS.md](AGENTS.md) — operating constraints and fast-start commands.
2. This handoff — current baseline and change map.
3. [ARCHITECTURAL.md](ARCHITECTURAL.md) — authoritative boundaries, simulation, persistence, and deployment.
4. [DESIGN.md](DESIGN.md) — visual, responsive, motion, and accessibility contract.
5. [docs/verification.md](docs/verification.md) — browser QA evidence and manual checks.

## Captured repository state

- Branch: `main`
- Most recent commit at capture: `0778077` — `Open bakery interior to show baker at work`
- The worktree already contained intentional, uncommitted bakery asset work before this handoff documentation was added:
  - `blender/create_assets.py`
  - `public/models/bakery.glb`
- The generator change reshapes the bakery into an open-front, readable work area and updates the generated bakery model. Preserve those two changes unless the user explicitly asks to discard or replace the bakery direction.
- No specific unfinished product feature or approved backlog is recorded. Ask for the next desired outcome rather than inventing one.

Always inspect `git status --short` and `git diff` before editing. Do not reset, checkout, or overwrite the existing bakery work. Do not commit unless the user asks for a commit.

## Fast start

```sh
npm install
npm test
npm run build
npm run dev
```

The development server prints a local URL (normally `http://localhost:5173`). It serves both the Vite app and the local `/api/advisor` endpoint. Use `npm run preview` after a build to exercise the production-style Node server.

Copy `.env.example` to `.env.local` only when testing the optional advisor. Never place `OPENROUTER_API_KEY` in client code, tracked files, screenshots, logs, or handoff notes. The rest of the game works without it.

## Where changes belong

| If the task concerns… | Start here | Keep in mind |
| --- | --- | --- |
| HUD, menus, modals, inspector, tutorials, accessibility, advisor UI | `src/main.jsx`, `src/style.css` | React consumes a serializable projection from `Village`; it must not derive game rules from Three.js objects. |
| Terrain, camera, placement, routing, workers, economy, persistence, renderer | `src/world.js` | `Village` owns mutable runtime state, WebGL objects, event listeners, and save/restore behavior. |
| Building costs, footprints, construction or production settings | `src/catalog.js` | Keep general building rules here; update tests when a rule changes. |
| Starter goals and restore-safe milestone logic | `src/progression.js` | Player-built milestones deliberately differ from starter structures. |
| Tests for game rules | `tests/simulation.test.js` | Tests import pure exports and `Village.prototype` methods without booting a browser. |
| Blender models and model exports | `blender/create_assets.py`, `blender/village-assets.blend`, `public/models/*.glb` | The Python script is the source of repeatable asset generation; GLBs are runtime artifacts. |
| Advisor safety/provider behavior | `advisor-service.js`, then `server.js` / `api/advisor.js` | Keep provider logic in the service; both adapters must stay aligned. |
| Performance sample page | `src/health-check.jsx`, `src/health-check.css` | Visit `/health-check`; it embeds a real game instance. |

## Invariants to preserve

- The browser is authoritative for village state. The save key is `hearth-v1`; saves must remain backward-tolerant and sanitized on restore.
- Three.js owns mutable scene resources. Dispose geometry, materials, listeners, effects, and controls that a new feature creates.
- React receives state through `Village.emit()` and sends commands to the `Village` instance. Do not create a second simulation state in React.
- Validate placement before subtracting resources or mutating the scene. Routing must avoid building footprints, river/boundary limits, active blocking scenery, and invalid paths.
- Production is credited when a carrier delivers to a store, never at the worksite. A finished good first sits in the producing building's own stock (`building.stock`, capped by `CATALOG[type].outputCap`); a carrier then walks it to an Inn or a store. Workers retry an unreachable delivery instead of teleporting resources.
- The village pool is bounded by storage. `capacityFor(resource)` sums `TOWNHALL_STORAGE` plus every completed Storehouse, and Inn pantries on top for food. When every store is full, hauling stops, producers fill their own stock and stall. A load that nothing can accept goes back to the building that made it rather than being destroyed.
- Preserve `prefers-reduced-motion`, keyboard focus return paths, accessible names/live feedback, and narrow/mobile layouts. See `DESIGN.md` for the established patterns.
- The build palette uses real GLB model thumbnails. Do not substitute generic icon cards or a raster background for the interactive 3D scene.
- The advisor API key remains server-only. The advisor is optional and failures must leave the village playable.

## Asset workflow

`blender/create_assets.py` regenerates the editable `.blend` file and runtime GLBs. With Blender available:

```sh
npm run assets
```

On this macOS environment, the explicit command is:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python blender/create_assets.py
```

Regeneration can update multiple binary assets. Inspect the resulting diff, retain only intended exports, and browser-check changed models. Do not hand-edit a `.glb` when its source should instead be changed in the generator.

The current uncommitted bakery export corresponds to the generator edit described above. Regenerate it only if you intend to refresh that change and can review all generated output.

## Verification by change type

Run these after every code change:

```sh
npm test
npm run build
git diff --check
```

Then use the smallest relevant browser pass:

- **Simulation/placement/routing/persistence:** start a fresh village, place the affected structure, let workers complete and deliver a cycle, reload, and confirm state recovers. Add or adjust a Node test.
- **Asset/rendering:** visually inspect the desktop game after models load; verify the changed model, construction state, selection, worker interaction, and no obvious clipping.
- **Responsive/UI/accessibility:** inspect a desktop viewport and a narrow phone viewport; keyboard-tab through the changed flow, confirm visible focus and sensible return focus, then test reduced motion if animation changed.
- **Advisor:** test with no key first (a safe configuration message), then with local environment variables only if provider access is required.
- **Performance-sensitive change:** load `/health-check` after a hard reload and check model payload, startup, frame rate, and long tasks.

`docs/verification.md` contains the larger visual/QA history. Do not claim a browser check was run unless it was actually performed in the current continuation.

## Useful product behavior

- Workers are automatically assigned. Builders construct; lumberyards use woodcutters, farms use farmers, mines use miners, bakeries use bakers, and windmills use a baker slot. Carriers haul finished goods between buildings; the town hall and each Storehouse post them, and builders fall back to hauling when nothing needs building.
- Cottages add housing; the simulation caps population at 24. Player-built cottages, farms, and delivered timber drive the three starter milestones.
- Grain fields grow through stages before harvest. Trees regrow; lumberyards process logs; bakeries turn wheat into bread (5 loaves per cycle, and the oven holds only 5); windmills require food input. A producer whose stock is full releases its worker so they can haul the backlog away.
- Paths are a special drag-placement mode and improve walking speed. They are persisted separately from buildings.
- The game supports save/import/export/reset, settings for graphics/audio, a short tutorial, time controls, and a health-check route.

For exact values, names, footprints, and timings, read `src/catalog.js` and the constants near the top of `src/world.js` instead of copying numbers from prose.

## Suggested continuation prompt

```text
Read HANDOFF.md, AGENTS.md, ARCHITECTURAL.md, DESIGN.md, and the relevant source files before editing. Preserve the existing uncommitted bakery changes. Implement only the requested outcome, update focused tests when game rules change, run npm test and npm run build, inspect git diff --check, and report exactly what you verified.
```
