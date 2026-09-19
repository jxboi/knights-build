# Hearth & Hamlet Architecture

This document describes the architecture currently implemented in the repository. It is intended to help contributors find the right boundary for a change and understand which state is authoritative at runtime.

For an agent takeover, begin with [HANDOFF.md](HANDOFF.md). This document is the detailed implementation reference, while the handoff records the captured worktree state and verification sequence.

## System shape

```mermaid
flowchart LR
  subgraph Browser[Browser]
    UI[React UI\nsrc/main.jsx]
    Runtime[Village runtime\nsrc/world.js]
    Catalog[Game rules\nsrc/catalog.js + src/progression.js]
    Models[GLB models\npublic/models]
    Save[(localStorage\nhearth-v1)]
  end

  UI -->|commands and projected state| Runtime
  Runtime -->|reads rules| Catalog
  Runtime -->|loads and clones| Models
  Runtime <-->|load, autosave, conflict checks| Save

  UI -->|POST /api/advisor| AdvisorRoute[/api/advisor]
  AdvisorRoute --> AdvisorLogic[Advisor service\nadvisor-service.js]
  AdvisorLogic -->|server-side request| OpenRouter[(OpenRouter)]

  Blender[Blender source\nblender/create_assets.py + .blend] -->|exports| Models
```

The application is local-first. The browser owns the playable village and its save data; the only remote interaction is the optional Village Advisor request.

## Component boundaries

| Component | Responsibility | Key boundary |
| --- | --- | --- |
| `src/main.jsx` | React shell, HUD, menus, dialogs, keyboard/touch-facing controls, and advisor chat | Treats `Village.emit()` output as a UI projection and sends user commands back through the `Village` instance. |
| `src/world.js` | Three.js scene, camera, model loading, placement, routing, workers, economy, atmosphere, animation, and persistence | Owns simulation state and WebGL resources. It should not depend on React rendering details. |
| `src/catalog.js` | Building definitions, costs, footprints, effects, production inputs/outputs, and construction times | Shared domain configuration for placement, simulation, inspectors, and save validation. |
| `src/progression.js` | Small progression/milestone predicates | Keeps starter-goal rules independent from rendering and UI layout. |
| `advisor-service.js` | Validates advisor input, sanitizes village context, builds the system prompt, calls OpenRouter, and normalizes errors | Contains provider access without exposing the API key to the browser. |
| `server.js` | Local development server, Vite middleware, production static serving, and `/api/advisor` routing | Node adapter used by `npm run dev`, `npm start`, and `npm run preview`. |
| `api/advisor.js` | Vercel Function adapter for the same advisor service | Keeps the production serverless entry point behavior aligned with the local route. |
| `blender/create_assets.py` | Deterministically builds the low-poly asset library and exports runtime GLBs | Blender is the editable source; `public/models/*.glb` are runtime artifacts. |
| `tests/simulation.test.js` | Node tests for placement, routing, simulation, persistence sanitization, and resource lifecycle behavior | Exercises the simulation boundary without requiring a browser renderer. |

## Application lifecycle

### Boot

1. `src/main.jsx` renders the shell and dynamically imports `src/world.js` after mount.
2. `new Village(...)` creates the Three.js scene, orthographic camera, controls, renderer, event handlers, and animation loop.
3. The runtime reads `localStorage['hearth-v1']` if available and keeps its raw value as a save fingerprint.
4. All runtime GLBs are loaded in parallel from `/models/*.glb`.
5. The save is sanitized and restored. If it has no valid town hall, the complete starter village is rebuilt.
6. Decorative scenery and workers are created, then `onLoaded` and `emit` hand control back to the React shell.

The UI remains usable during loading through the loading overlay. A model-loading failure is reported through the same shell error state rather than silently creating a partially initialized game.

### Frame loop

`Village.animate()` is the single browser animation loop:

1. Cap the frame delta at `0.1` seconds.
2. Advance the simulation when the speed is non-zero.
3. Update camera controls, time-of-day lighting, foliage, water, motes, birds, construction effects, and delivery bursts.
4. Render the Three.js scene.
5. Emit a React state projection at a bounded UI cadence.
6. Attempt an autosave at the simulation's 15-second boundary.

Simulation time is scaled by the selected speed (`0`, `1`, `2`, or `4`), while decorative motion separately respects `prefers-reduced-motion`.

### Shutdown

`pagehide` and `Village.dispose()` attempt a final save, stop the animation frame, remove DOM/window listeners, dispose controls and owned scene resources, dispose the renderer, and clear the canvas container.

## Simulation model

`Village` is the authoritative aggregate for the current settlement. Its important state is:

- `resources`: wood, stone, food, wheat, and wine stock.
- `buildings`: placed structures with `type`, grid position, rotation, construction `progress`, completed production `cycles`, capped worksite stock, and delivery state.
- `workers`: villagers with a phase, assigned building, route, carried goods, and work/delivery status.
- `roads` and `baseRoads`: player-built paths versus immutable starter paths.
- `created`, `gathered`, `elapsed`, `activityLog`, and the current settlement name.
- camera view state, selection/placement state, storage availability, and cross-tab conflict state.

The normal worker flows are:

```text
idle -> travel -> construct -> idle
   \-> travel -> work -> worksite stock
                         \-> waiting for input / full stock
   \-> haul pickup -> haul delivery -> idle
   \-> eat travel -> eat -> idle
```

Construction workers travel to a site, advance its progress, and return to idle when the building completes. Production workers route to a reachable work point and place each completed batch in that building's capped stock. Carrier workers collect finished goods and deliver them to the nearest valid Inn, Storehouse, or town hall; the village resource total and delivery history are credited only when the destination accepts the load. Farms return wheat to their farmhouse store, while windmills additionally require food input.

Routing uses a weighted grid search. It avoids building footprints, scenery, river/boundary constraints, and blocked road tiles while preferring connected player paths. A worker retains its route target and can reroute when a newly placed structure blocks the next step.

## Placement and world rules

Placement is validated before payment or mutation. The candidate must satisfy:

- a known catalog type and valid footprint;
- the buildable boundary, including watchtower expansion;
- the river-side boundary;
- no overlap with existing building footprints, paths, scenery, or active villagers;
- sufficient resources.

Roads are a separate placement mode. A drag is converted into a connected Manhattan segment, chooses the clearer turn for diagonal drags, and stops at obstacles, the river, the boundary, or resource exhaustion. Roads improve worker walking speed and are persisted independently from GLB-backed buildings.

The starter settlement is defined in `src/world.js`, while building-specific values belong in `CATALOG`. This keeps rules such as size, cost, production, and construction time out of the renderer/UI markup.

## React and Three.js coordination

The React shell holds transient presentation state such as the selected tool, open dialogs, inspector state, advisor messages, loading/error state, and the latest simulation projection. The `Village` instance is held in a ref so high-frequency simulation updates do not require recreating the world.

The runtime calls `emit()` to publish a serializable snapshot containing resource totals, population/capacity, building and worker summaries, activity, placement feedback, save availability, and conflict status. React uses that snapshot for labels and accessible status text; it does not reach into Three.js objects to derive game rules.

Three.js owns mutable scene objects and GPU resources. GLB scenes are cloned for placed buildings, scenery, and villagers. Runtime-created geometry/materials are explicitly disposed when previews, selection rings, scaffolding, delivery effects, or the entire scene are removed.

## Persistence and recovery

### Save contract

The browser save key is `hearth-v1`. A save contains:

- settlement name;
- resources, population, elapsed time, gathered total, delivered totals, and created counters;
- chapter rewards, feast/tutorial state, graphics/audio preferences, and bounded worker needs/trades;
- the four newest activity messages;
- camera position, orbit target, and bounded zoom;
- player roads, non-available tree state, and cleared scenery keys;
- building records: type, position, rotation, pause/upgrade state, construction materials, progress, production cycles, worksite stock, grain planting time, Inn bread stock, and School training state.

Worker routes, assignments, generated scenery meshes, Three.js objects, and transient visual effects are reconstructed rather than serialized; persisted worker needs and trades are reapplied after the population is rebuilt.

### Sanitization

Restore logic rejects unknown/road building records, invalid coordinates, duplicate town halls, out-of-bound or overlapping footprints, invalid roads, and malformed camera values. Town halls are forced complete, roads are revalidated against current geometry, population is capped by completed cottage capacity, and the starter village is restored when no valid town hall remains. This allows partially corrupted saves to retain recoverable resources/time/activity without admitting impossible world state.

### Save timing and conflicts

Saves happen on the 15-second simulation boundary, on page hide/disposal, and through the manual Save action. Before writing or clearing, the runtime compares the current `hearth-v1` value with its fingerprint. A `storage` event or fingerprint mismatch freezes the stale tab, pauses the simulation, and exposes a reload action instead of overwriting another tab's newer village.

If browser storage is unavailable, the simulation remains playable but reports that changes may not persist. There is no account-backed save or cloud village service.

## Village Advisor request path

1. React builds a bounded context from the current UI projection and posts the latest advisor conversation plus context to `/api/advisor`.
2. The local Node server routes the request to `createAdvisorReply`; Vercel routes it through `api/advisor.js` to the same function.
3. `advisor-service.js` accepts only user/assistant messages, keeps the latest 12 messages, bounds context fields and lists, and rejects an empty user question.
4. The service sends a concise system prompt and sanitized context to OpenRouter with a server-side API key and a 45-second timeout.
5. The response is reduced to `{ message }`, while configuration, timeout, upstream, and empty-response errors become JSON error responses for the UI.

The browser never receives `OPENROUTER_API_KEY`. The advisor receives village context and conversation content only when the user submits a question; normal game state remains in the browser.

## Asset pipeline

`blender/create_assets.py` is the deterministic asset generator. It builds the editable gallery in `blender/village-assets.blend`, joins static meshes by material to reduce draw calls, and exports the runtime models to `public/models/*.glb`.

The runtime loads these models with `GLTFLoader`. Some named nodes carry runtime meaning: for example, the windmill's `Sails` pivot is animated after loading. Thumbnails shown by the React palette are rendered from the same loaded models, so the UI does not maintain a second image asset set.

To regenerate assets:

```sh
npm run assets
```

## Build and deployment topology

### Development

`npm run dev` starts `server.js` in Vite middleware mode. Vite serves the SPA and HMR assets, while the Node server handles `/api/advisor` and loads environment variables for the development mode.

### Production

`npm run build` creates the Vite output in `dist/`. The Vercel configuration publishes that directory and exposes `api/advisor.js` as a serverless function. The standalone Node server can also serve the built SPA with `npm start` or `npm run preview`.

Vite keeps the UI, React runtime, and Three.js in separate chunks. The world module is also lazy-loaded after the initial React shell mount. Required production environment variables are `OPENROUTER_API_KEY`, with optional `OPENROUTER_MODEL` and `OPENROUTER_SITE_URL`.

## Verification expectations

The baseline checks are:

```sh
npm test
npm run build
```

Simulation tests should be extended when changing placement, routing, production, persistence, sanitization, or lifecycle behavior. Browser checks remain important for changes involving the renderer, responsive layout, input gestures, accessibility, model loading, or advisor interaction; the existing evidence and manual checks are documented in [`docs/verification.md`](docs/verification.md).

## Extension guidance

- Add a new building by updating `src/catalog.js`, adding/exporting its GLB through the Blender asset pipeline if needed, and extending simulation/UI behavior only where the new rule requires it.
- Keep persistence additions backward-tolerant: missing fields should receive safe defaults and malformed records should be discarded or repaired.
- Keep provider-specific advisor logic in `advisor-service.js`; adapters should remain thin.
- Prefer emitting a new serializable projection field over exposing Three.js objects to React.
- When adding a mutable scene object, define its ownership and disposal path at the same time.
