# Hearth & Hamlet

A playable, local-first medieval village builder made with **Blender + Three.js**, React, and Vite. All visible buildings, trees, rocks, fences, crops, and villagers are original Blender-exported geometry. The scene is interactive 3D, not an image background.

## Run

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. This session uses **http://localhost:5174** because another project occupies port 5173.

```sh
npm run build     # production files in dist/
npm test          # simulation and placement checks
```

## The requested sequence

1. **World:** grassy terrain with subtle color variation → toggleable 1-unit grid → orthographic pan/zoom/orbit camera → warm sunlight and shadows → paths with faster movement → curved river, ripples, rocks, and a wooden landing.
2. **Assets:** pine trees → faceted rocks → timber fences → cottages → masonry well → wheat farm → lumberyard → rocky mine → rotating windmill → watchtower. Includes a central village hall and workers.
3. **Simulation:** workers → obstacle-aware grid routing → automatic work and construction jobs → wood/stone/food storage → timed production with delivery. Windmills require food input. Cottages add housing and welcome two workers, up to 24 simulated villagers.
4. **Building:** choose a building → translucent grid-snapped preview → validate land, obstacles, resources, and footprint → place and pay → a worker travels to the site → scaffolding and rising geometry show construction → the finished building joins the village simulation.

## Controls

- Drag: pan. Right-drag: orbit. Scroll or +/-: zoom. Compass: reset camera.
- Click a completed building: inspect its role, worker assignments, and deliveries.
- Choose a palette item, then click valid terrain to build. Green preview = valid; red = blocked.
- **R:** rotate preview. **Esc:** cancel. **B:** cottage. **G:** grid.
- **Space:** pause/resume. Use 1×, 2×, and 4× to control simulation speed.
- Touch: drag to pan and pinch to zoom; tap the palette and terrain to place.
- Saves automatically in this browser, plus a manual Save village action in the top-right menu.

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

## Scope

This is a complete small sandbox for the requested four stages. Jobs are assigned automatically; the economy has renewable production, with no combat, seasons affecting gameplay, resource-node depletion, or survival failure. The day indicator advances every two simulation minutes. Saves persist buildings, construction progress, resources, population, day, and goals; workers receive fresh routes after reload. There is no backend, account, or cloud save. Display fonts fall back to system fonts offline.

See `docs/verification.md` for browser checks and visual comparison notes.
