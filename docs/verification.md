# Verification

## Functional checks

- `npm test`: five passing tests for land/footprint/scenery/resource validation, routing around occupied buildings, construction completion and worker arrival, crediting production on delivery, and windmill input requirements.
- `npm run build`: production bundle generated successfully.
- Codex in-app browser: tested at 1536×1024 (the concept's native dimensions) and 390×844, plus the embedded browser's default size. No Playwright fallback was needed.
- Actual UI construction: selected a cottage, rejected an obstructed tree site, placed a cottage, observed scaffolding, completed construction, and saw population increase from 8/16 to 10/20.
- Actual UI farm construction: rejected an out-of-bounds river-side site, placed a valid farm, observed construction, and confirmed all three settlement goals completed.
- Wood, stone, and food increased through worker deliveries. Tested pause, speed controls, save, reload, and help dialog.
- After manual save and reload: the added cottage/farm, completed goals, resource stock, population 10/20, and advancing day persisted.
- Browser error log was empty on the inspected run.

## Visual comparison

The user's supplied low-poly village is the primary art reference. `concept.png` is a generated direction for the surrounding interface; it is not an approved pixel-exact screenshot specification. The concept added much denser scenery than the user's reference. The implementation intentionally follows the user's simpler Blender-style polygon art.

The concept and `game-desktop.png` were both opened with `view_image` in the same verification pass. `game-mobile.png` records the responsive viewport.

| Point inspected | Result / intentional difference |
| --- | --- |
| Layout | Retained full-screen isometric world, top resource strip, left goals, bottom eight-item palette, compass, and zoom controls. |
| Palette | Parchment UI, olive grass, timber, terracotta cottages, blue roofs, and turquoise water. Fixed initially washed-out lighting using correct color conversion and adjusted ambient light. |
| Typography | Serif brand/headings with compact sans-serif UI. Reduced concept title size to leave room for labeled live resource counts. |
| Asset treatment | Actual editable Blender geometry and Three.js rendering, intentionally replacing generated raster art. Refined tower height, sail widths, cottage fences, and visible lumber stacks after browser review. |
| Spacing and controls | Eight building cards remain accessible on the mobile viewport. Header resources wrap to a second row. Inspector hides underlying objectives on narrow screens. |
| Copy | Intentional changes: House → Cottage, Mine → Stone mine, Road → Path, Gather 100 wood → Gather timber with a 100-unit counter. Added settlement name, concise instructions, and state feedback. No unrelated marketing sections. |
| Motion | Villagers travel to jobs, structures grow during construction, and windmill sails rotate. Pause stops simulation. |

This is a faithful functional interpretation of the supplied low-poly reference, with the intentional geometry/detail and UI differences above. It is not a pixel-identical recreation of the more elaborate generated concept.
