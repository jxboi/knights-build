# Hearth & Hamlet

A playable, local-first medieval village builder made with **Blender + Three.js**, React, and Vite. All visible buildings, trees, rocks, fences, crops, and villagers are original Blender-exported geometry. The scene is interactive 3D, not an image background.

![Hearth & Hamlet desktop view](docs/game-desktop.png)

The game runs entirely in the browser. The core simulation does not require an account or a backend; the optional Village Advisor uses a small server-side OpenRouter proxy.

## Requirements

- Node.js 18 or newer
- A modern browser with WebGL enabled
- Blender only if you want to regenerate the source assets

## Run

```sh
npm install
npm run dev
```

Open the localhost URL printed by the server. If port 5173 is busy, the server selects the next available port automatically.

To run the built app locally:

```sh
npm run build
npm run preview
```

`npm run dev`, `npm run preview`, and `npm start` use `server.js`, which serves the app and the `/api/advisor` route.

The Village Advisor uses OpenRouter through a server-side route. Locally, `server.js` handles the route; on Vercel, `api/advisor.js` runs it as a Vercel Function. Copy `.env.example` to `.env.local`, add your `OPENROUTER_API_KEY`, then restart the dev server. The key is only read server-side and is never bundled into the browser.

```sh
cp .env.example .env.local
```

The advisor is optional: the village remains playable without a key, but advisor requests will show a configuration message. `OPENROUTER_MODEL` selects the OpenRouter model, and `OPENROUTER_SITE_URL` is optional attribution metadata.

```sh
npm test          # simulation and placement checks
```

## Build palette

The numbered cards match the keyboard shortcuts:

| Key | Building | Cost | Effect |
| --- | --- | --- | --- |
| 1 | Cottage | 30 wood · 10 stone | +4 housing capacity; welcomes up to 2 villagers when complete |
| 2 | Well | 15 wood · 25 stone | Village gathering place |
| 3 | Farm | 25 wood · 5 stone | +8 food per harvest |
| 4 | Lumberyard | 20 wood · 10 stone | +8 wood per delivery |
| 5 | Stone mine | 35 wood · 15 stone | +6 stone per delivery |
| 6 | Windmill | 50 wood · 35 stone | Converts 2 food into 8 food per cycle |
| 7 | Watchtower | 45 wood · 20 stone | Expands the buildable boundary by 3 tiles |
| 8 | Path | 1 stone per tile | Villagers move 50% faster on paths |

The starter village includes a town hall and several completed structures. Player-built cottages, farms, and delivered timber count toward the three starter milestones. Completing all three produces a one-time flourishing acknowledgement.

## Deploy to Vercel

From the project root, link or create the Vercel project and add the production environment variables without committing them:

```sh
vercel link
vercel env add OPENROUTER_API_KEY production
vercel env add OPENROUTER_MODEL production
vercel env add OPENROUTER_SITE_URL production
vercel --prod
```

Use the deployed Vercel URL for `OPENROUTER_SITE_URL`. The Vercel deployment serves the Vite build from `dist/` and the advisor at `/api/advisor`. `OPENROUTER_API_KEY` is required only if the deployed advisor should be available.

## The requested sequence

1. **World:** grassy terrain with subtle color variation → toggleable 1-unit grid → orthographic pan/zoom/orbit camera → warm sunlight and shadows → a readable morning-to-night light cycle with dusk lanterns → animated foliage, water highlights, ambient motes, distant birds, and paths with faster movement → curved river, ripples, rocks, reeds, and a wooden landing.
2. **Assets:** pine trees → faceted rocks → timber fences → cottages → masonry well → wheat farm → lumberyard → rocky mine → rotating windmill → watchtower. Includes a central village hall and workers.
3. **Simulation:** workers → balanced job assignment → obstacle-aware grid routing → automatic work and construction jobs → wood/stone/food storage → timed production with visible carried goods, delivery bursts, and activity feedback at the town hall. Windmills require food input. Cottages add housing and welcome two workers, up to 24 simulated villagers. Completing the three starter goals gets a one-time flourishing acknowledgement.
4. **Building:** choose a building → translucent grid-snapped preview → validate land, obstacles, resources, and footprint → place and pay → a worker travels to the site → scaffolding and rising geometry show construction → the finished building joins the village simulation.

## Controls

- Drag: pan. Right-drag: orbit. Scroll or +/-: zoom. Compass: reset camera.
- Click a completed building: inspect its role, current worker status, assignments, and deliveries. Click a villager to inspect their current task, work-cycle progress, next delivery estimate, and carried goods. Connected paths influence worker routing as well as movement speed.
- When housing is full, the population indicator and settlement status call out that another cottage is needed.
- Choose a palette item, then click valid terrain to build. Drag while Path is selected to lay a connected segment; diagonal drags choose the clearer Manhattan turn around obstacles. Green preview = valid; red = blocked.
- **R:** rotate preview. **Esc:** cancel. **B:** cottage. **G:** grid.
- **1–9:** choose a building from the palette; use the palette directly for the remaining decorative actions.
- **Arrow keys:** pan the camera.
- **?:** open the help dialog.
- **Village advisor:** ask for context-aware advice about resources, workers, goals, and the next building to place.
- **Space:** pause/resume. Use 1×, 2×, and 4× to control simulation speed.
- Touch: drag to pan and pinch to zoom; tap the palette and terrain to place. When Path is selected, drag across terrain to lay a segment.
- Saves automatically in this browser, plus a manual Save village action in the top-right menu. Sparse or partially repaired saves retain recoverable progress while keeping first-build milestones tied to completed player-built structures.
- Village overview summarizes population, structures, active jobs, deliveries, built paths, settlement milestones, and recent village activity.
- Rename the settlement from the top-right village menu; the name is saved with the village.
- Respects `prefers-reduced-motion` by keeping the simulation usable while pausing decorative world motion.

## Blender source and exports

`blender/village-assets.blend` contains the editable asset collection, arranged as a gallery. `public/models/*.glb` are the runtime models. `blender/create_assets.py` deterministically regenerates both from scratch; static meshes are combined by material to reduce draw calls.

With Blender on PATH:

```sh
npm run assets
```

On this Mac:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python blender/create_assets.py
```

Runtime UI thumbnails are rendered directly from the same GLB models. The generated design concept is documentation only and is never used as the game background.

## Persistence and project layout

Village state is saved to browser `localStorage` under `hearth-v1`. It includes the settlement name, resources, villagers, buildings, construction progress, deliveries, paths, milestones, activity history, and camera framing. Autosave runs during simulation, and the village menu provides manual save, rename, overview, help, and reset actions. A tab that detects a newer save freezes simulation and offers a reload action so it cannot overwrite the newer village.

Key files:

- `src/main.jsx` — React UI, controls, modals, advisor panel, and accessibility behavior
- `src/world.js` — Three.js scene, simulation, routing, building validation, persistence, and rendering
- `src/catalog.js` — building definitions, costs, effects, and production timings
- `src/progression.js` — milestone detection and restore-safe progression rules
- `blender/create_assets.py` — deterministic Blender asset generation
- `server.js` and `api/advisor.js` — local and Vercel advisor endpoints
- `tests/simulation.test.js` — simulation, validation, persistence, and interaction tests

## Scope

This is a complete small sandbox for the requested four stages. Jobs are assigned automatically; the economy has renewable production, with no combat, seasons affecting gameplay, resource-node depletion, or survival failure. The day indicator advances every two simulation minutes and shows the current period while the world lighting shifts from morning through night. Saves persist buildings, construction progress, delivery history, resources, population, day, goals, and camera framing; workers receive fresh routes after reload. The advisor endpoint runs through the local server in development or a Vercel Function in production; there is no account or cloud save. Display fonts fall back to system fonts offline.

See `docs/verification.md` for browser checks and visual comparison notes.
