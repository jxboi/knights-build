# Verification

> Agent handoff: use [../HANDOFF.md](../HANDOFF.md) for the current takeover checklist. This file records the broader browser and visual QA baseline; it does not replace running the checks after a change.

## Functional checks

- `npm test`: 173 passing tests for land/footprint/scenery/resource validation, nearest-clear guided placement, tutorial villager focus progression, direct worker-click tutorial persistence, worker-footprint placement protection, scenery-aware worker routing, saved-building footprint and duplicate-town-hall validation, sparse-restore milestone detection, town-hall progress sanitization, zero-capacity population recovery, reachable-job assignment fallback, live rerouting around newly blocked worker paths, no-detour worker cleanup, clean worker assignment handoffs, malformed-feast protection, bounded camera-view persistence, obstacle-aware path painting, road-aware routing around occupied buildings, construction completion and worker arrival, unique activity-history retention, crediting production on delivery, blocked-delivery retry behavior, windmill input requirements, live building worker-status reporting, worker task/carry snapshots, save-number, population, road-count, autosave-cycle, and cross-tab conflict sanitization including pre-write fingerprint checks for saves, destructive clears, and backup imports plus rename rollback, delivery-history persistence, safe-save clearing, stale-tab inspector/feast/tutorial mutation guards, embedded health-sample save isolation, selection-ring and focused-worker-marker cleanup, placement-preview (including line material and validity-change repainting), inspector and scene-resource cleanup, bounded keyboard camera panning, village-name sanitization, per-resource storage-safe refunds, scoped Inn meal reservations, graphics-preset shadow-map scaling, cleared scenery persistence, per-frame worker vector reuse, expired-avoidance recovery, cached road-speed lookup, per-search route caching, advisor resource context preservation, single-pass job-point ranking, cached assignment distances, allocation-free storage-capacity counters, shared storage-capacity calculation, shared build-boundary calculation, coalesced pointer movement, cached carrier source ranking, shared HUD storage projection, single-worker construction assignments, pooled deadlock recovery vectors, Inn pantry reconciliation, food-spending pantry reconciliation, building-priority toggles, grain-visual update throttling, partial farmhouse harvest retention, cadence-limited atmosphere lighting, paused-render cadence, render-loop effect gating, late-load model-resource disposal, ambient-audio teardown, ended-action-sound cleanup, malformed-resource spending protection, storage-independent village export, normalized saved counters, and grain-field worker cleanup.
- `npm run build`: production bundle generated successfully.
- Codex in-app browser: the earlier pass was tested at 1536×1024 and 390×844; the latest native IAB pass used the live 640×765 viewport for focus, overlay, tutorial-marker, and inspector checks.
- Actual UI construction: selected a cottage, rejected an obstructed tree site, placed a cottage, observed scaffolding, completed construction, and saw population increase from 8/16 to 10/20.
- Actual UI farm construction: rejected an out-of-bounds river-side site, placed a valid farm, observed construction, and confirmed all three settlement goals completed.
- Wood, stone, and food increased through worker deliveries. Tested pause, speed controls, save, reload, and help dialog.
- After manual save and reload: the added cottage/farm, completed goals, resource stock, population 10/20, and advancing day persisted.
- Browser error log was empty on the inspected run.
- Latest polish pass: Playwright fallback verified the updated render at 1280×720 and 390×844, including the period-aware header, paused/resumed simulation controls, advisor focus behavior, modal focus behavior, building placement preview, inspector open/close behavior, responsive containment, and a clean console.
- Health-check runtime cards now distinguish startup readiness from the five-second FPS and long-task sampling phase.
- Thumbnail framing keeps its 160×130 display resolution while using a half-resolution edge probe, reducing startup readback work without changing the visible palette cards.
- Placement hover keeps the preview moving but only repaints its meshes when validity changes, reducing work while searching for a site.
- Grain-field stage checks run at a bounded visual cadence while explicit planting, harvesting, and restore paths still force immediate swaps, reducing repeated simulation work without delaying a visible transition materially.
- Terrain and river-water vertex colors now reuse color scratch objects and typed buffers during world creation, reducing startup garbage without changing the generated palette.
- Help placement guidance now clearly tells players that buildings are fixed once placed, making the no-relocation rule discoverable before committing a site.
- Storage capacity and Inn pantry counts use direct counters in the simulation hot path, avoiding temporary filtered arrays while worker jobs check available room.
- Resource affordability, spending, delivery writes, and timber milestones normalize missing or non-finite runtime totals, so malformed state cannot create free actions or propagate `NaN` through the save.
- Partial farmhouse stock now keeps excess harvested wheat in the farmer's carry state until a carrier clears room, preventing production loss when a harvest arrives during a nearly full worksite store.
- Build-boundary checks share one direct watchtower counter across placement, previews, and save restoration, avoiding repeated temporary arrays and keeping the expansion rule consistent.
- Embedded health-check villages use a fresh in-memory save and ignore player storage events, so diagnostics cannot pause or overwrite an open game tab.
- Manual Save now explains when the village is still loading instead of misreporting a temporary startup state as unavailable browser storage.
- The save indicator and export action use the same loading-state language during startup, so transient initialization cannot look like missing storage or an unsaved village.
- Export serialization is separate from browser persistence, so a playable village can still download an in-memory backup when local storage is blocked or full; cross-tab conflicts continue to block stale exports.
- Backup, restore, and live counter updates are normalized, preventing malformed created/resource/delivery values from poisoning future progress after reload or the next placement.
- Simulation movement pressure is now derived during the existing worker cooldown pass instead of a second per-tick scan.
- Building inspectors now expose accessible Pause/Resume controls for non-townhall structures.
- Building inspectors now expose a pressed-state priority toggle for construction and production sites, so the existing worker-ranking preference is usable without editing a save.
- Worker reassignment clears stale input, stock, and route-retry flags before a new job is chosen.
- Carrier cleanup clears stale route, wait, meal, and deadlock state when a haul ends.
- The performance health-check page is now route-split: the playable village does not request its diagnostic JS/CSS, while `/health-check` still loads independently and reaches Ready.
- Lucide UI icons now use individual modules with React dependency deduplication, reducing the measured health-check payload from 7.2 MB to 6.4 MB without changing the rendered controls.
- The closed village view skips overview-only building, delivery, workforce, and focus-list aggregation; opening the overview computes those values in one memoized pass without changing its dashboard output.
- The build palette is isolated behind a value-aware memoized component, so simulation ticks with unchanged resources do not rebuild all fourteen tool cards or their affordability labels.
- HUD projection reuses the village-wide School training options across completed Schools, avoiding duplicate worker and workplace scans as the settlement grows.
- Build-card labels now use a compact natural-wrap treatment instead of desktop ellipses, keeping longer building and path-tool names readable within the fixed palette rail.
- Day/night colour and directional-light writes are cadence-limited to 30 Hz; the render loop keeps full visual motion while avoiding redundant high-refresh updates.
- Paused villages redraw the world at 30 Hz for camera and ambient responsiveness instead of spending GPU time at the display refresh rate while simulation state is frozen.
- The world canvas now observes its own container as well as window resizes, coalescing camera/backing-buffer updates and ignoring transient zero-size layout states during responsive transitions.
- A village disposed while GLB requests are still settling releases unattached model resources, preventing late-load GPU allocations from surviving an unmount.
- Turning Ambient tone off, or disposing the village, now stops ambient oscillators and disconnects their nodes; disposal also closes the Web Audio context so remounts do not leave background audio running. Short action cues disconnect their oscillator and gain nodes when playback ends.
- Startup model loading no longer requests the unused standalone fence or duplicate base grainfield GLBs; the grain-field palette preview uses the already-loaded ripe-stage asset, while live growth still uses each stage-specific model.
- Grain-field placement and initial field creation now use the loaded sown-stage model, so removing the duplicate base asset does not degrade the in-world preview to a generic fallback.
- Balanced graphics now uses a smaller shadow map and cheaper filtering on phones and desktop; High retains the full-quality shadow map, and changing presets live rebuilds the shadow target safely.
- Underfunded-build pass: a zeroed-material save showed exact wood/stone shortfalls in palette labels, build-cost tooltips, and placement feedback; the shortfall treatment stayed readable at 390×844.
- Short-phone pass: the compact-height breakpoint was verified at 390×480 with the goals card, palette, camera/help controls, and zoom controls contained inside the viewport without horizontal or vertical overflow.
- Goal completion now produces a one-time flourishing toast and a subtle completed-objectives treatment after the cottage, farm, and timber milestones are all met.
- The first-steps introduction now provides direct actions for cottage placement, villager inspection, and path selection; cottage placement searches for a nearby clear site, and both guided and direct worker selection persist tutorial progress.
- Guided placement actions now run through the same validator as ordinary placement, so an invalid tutorial preview explains why it cannot be placed instead of failing silently; a successful guided cottage placement preserves the worker marker for the next step.
- Keyboard Enter placement now clears the React placement state after a successful build, matching the visible Place control instead of leaving a stale ghost prompt on screen.
- Focused villagers now receive a small animated world-space ring and faceted marker that follow them while the inspector is open, improving orientation without competing with building selection rings.
- Responsive polish corrected palette key labels above 09, moved action toasts out of the tutorial surface, and gives the advisor a full-width focus surface on narrow phones through 620px.
- Menu and advisor toggles now expose their open/close state through their accessible names, and disabled controls use an unavailable cursor rather than a busy cursor.
- Long overview and help dialogs now place initial focus on their visible close control instead of an offscreen footer action, keeping keyboard focus visible while the modal content remains scrollable.
- Opening an inspector now moves focus to its close control, including when a worksite is selected from the overview modal.
- After an advisor response or error, focus returns to the advisor input so follow-up questions and retries do not strand the user on the page body.
- The settlement subtitle now evolves from “A humble beginning” to “A home with room to grow” and “A village in bloom” as milestones are completed.
- On narrow phones, the building or villager inspector likewise takes priority over onboarding, keeping its controls readable without losing tutorial progress.
- Palette hover tooltips now yield to inspectors, modals, and the advisor, preventing stale build details from covering actionable controls.
- Choosing a palette item now dismisses an open advisor panel before entering placement mode, keeping the build preview and placement controls unobstructed.
- Opening Help or Village overview now dismisses transient advisor surfaces first, so modal close returns to one coherent interaction mode.
- Palette controls now announce exact wood/stone costs alongside readiness or shortfall state, making build decisions available without hover-only tooltip context.
- Palette labels also announce the 1–9 keyboard shortcut, and Path clarifies that its stone cost applies per tile.
- Settlement status now prioritizes blocked routes and windmill food shortages over generic construction progress, keeping actionable warnings visible.
- Overview graphics presets now stay in one three-option row instead of leaving the High control stranded on a second line.
- Path placement now shows drag-specific guidance and only the cancel action.
- Path removal now labels its detail panel “Recovered” instead of “Build cost”, clarifying that one stone is refunded per removed tile.
- Compact-height tutorial layouts suppress the redundant build-cost tooltip during placement, preventing it from rising into the onboarding card.
- The mobile footer restores the primary “Drag to explore” guidance at widths where it fits, while keeping the narrow-phone footer concise and overflow-free.
- Touch-sized layouts now replace mouse-only footer instructions with “Pinch to zoom” and “Two-finger orbit”; the canvas label and Help copy describe both touch and pointer controls.
- Onboarding now yields when a player starts an unrelated build from the goal card, then returns after placement is cancelled; the tutorial action itself keeps its guidance visible.
- The palette landmark now accurately announces itself as the village building and path tools, including the removal utility.
- The overview workforce summary now includes Carrier staffing, so storehouse and town-hall hauling capacity is visible alongside the production trades.
- Reduced-motion preferences are observed live while the village is open, and the media-query listener is removed during disposal so accessibility changes do not require a reload or leak across remounts.
- Upgrade controls now expose exact resource costs in their accessible names and hover guidance before spending.
- Closing or cancelling from an inspector now clears its world-space selection marker instead of leaving a stale ring behind.
- Backup import now explains that a stale tab must reload before replacing the current village, matching the other cross-tab protection messages.
- The overview feast control now explains when it is unavailable, and announces the active countdown to assistive technology.
- Cottage completion now reports the number of new villagers who actually arrive, alongside the population update.
- Malformed local saves are sanitized at load time: invalid building types, footprints, river/boundary placements, and roads are ignored, road records cannot enter the GLB building loader, numeric defaults are preserved, and the world still renders.
- Restored villagers are also capped by completed cottage capacity, preventing malformed saves from creating impossible population totals.
- Restored path totals are derived from player-laid roads that survive boundary, river, and footprint validation; immutable starter paths stay out of the overview count.
- Partially corrupted saves preserve recoverable resources, time, and activity data while rebuilding the complete starter village when no valid town hall remains; duplicate halls are ignored.
- Player milestones now recognize completed player-built cottages and farms even after a sparse save restore, while the default starter structures remain excluded from the first-build goals.
- Town halls restored from malformed records are forced to completed state, preventing impossible construction jobs from entering the simulator.
- Loaded saves seed the autosave cycle marker at their current elapsed time, preventing an immediate stale write at a 15-second boundary.
- Saved camera position, orbit target, and zoom are restored after reload; malformed view coordinates are bounded or ignored.
- Cross-tab storage changes now freeze a stale tab and make it read-only until reload; storage fingerprints are rechecked immediately before writes or destructive clears, preventing autosave, pagehide, placement, path painting, renaming, reset, or simulation changes from overwriting, deleting, or diverging from a newer village; the save indicator becomes an accessible one-click reload action.
- Housing pressure is surfaced in both the population resource indicator and the live settlement status when villagers meet or exceed capacity.
- Number keys 1–9 mirror the first nine numbered build cards for faster keyboard play; the remaining building, path, and removal tools stay directly available in the palette.
- Arrow keys now pan the orthographic camera without requiring a pointer drag.
- `?` now opens the help dialog from the keyboard, with the dialog focus trap and return-focus behavior preserved.
- The settlement name can be edited from the village menu and persists with the local save.
- The village menu closes on outside interaction or Escape, uses menu semantics, and restores keyboard focus to its trigger.
- The village menu supports wrapped ArrowUp/ArrowDown navigation plus Home/End without triggering camera panning.
- Keyboard focus on a build card reveals the same building description and cost tooltip as pointer hover.
- The bottom save indicator reflects the actual local-save state, including a storage-unavailable warning path.
- Starting a new village now clears local storage through the world persistence layer and reports a recoverable warning when the browser refuses the operation.
- Help, reset, and rename dialogs now trap Tab focus, choose a useful initial control, and restore focus when dismissed.
- Village overview reports villagers, structures, active jobs, deliveries, built paths, milestone progress, and the four newest village updates; its cards and activity trail remain contained at 390px wide.
- Repeated delivery updates are de-duplicated and moved to the front of the activity trail so the overview remains useful during fast simulation speeds.
- Placement preview materials and owned geometries are disposed when changing build tools; shared GLB geometry remains intact.
- Completed scaffolding and site rings now release their owned GPU resources, including de-duplicated shared scaffold materials.
- Escape closes the active menu or dialog before canceling a build preview, and works from the rename input without losing the selected building.
- Building delivery totals are stored with saves and restored for the overview and building inspector after reload.
- Restored Inn pantry stock is reconciled across all Inns so the per-Inn bread totals never exceed the village-wide food total.
- Feast, grain-field planting, and food-input production now reconcile stored Inn bread after spending from the village-wide food pool, so pantry stock cannot become inaccessible or exceed the remaining food total.
- Speed selection, building-grid state, and the collapsible objectives panel expose their current state through pressed/expanded accessibility attributes.
- Persisted paths are revalidated against the village boundary, river, and building footprints before being recreated.
- Building placement also rejects any existing path tile inside the proposed footprint, keeping roads readable and traversable.
- Building placement also keeps active villagers clear of the proposed footprint and explains the blockage through the live placement hint.
- Windmill input starvation announces once when food runs out and again when production can resume.
- If an Inn meal reservation becomes unavailable before arrival, the villager is released cleanly instead of remaining flagged indoors.
- The building inspector shows a live estimated time remaining while construction is underway.
- Completed buildings stay fixed after construction; inspectors expose only the controls relevant to pause, upgrade, construction cancellation, or clearing a field.
- Clearing a grain field now clears the farmer's route, wait, material, and deadlock state along with the assignment, so the worker returns to a clean idle state.
- When a worker loses a blocked route with no detour, the fallback now clears transient route, work, wait, material, and deadlock state before returning the worker to idle.
- New job assignment clears stale navigation and work metadata before choosing the next destination, while preserving any goods already in the worker's hands.
- Worker and production-building inspectors now show the current production-cycle progress and estimated time to the next delivery while a villager is working.
- Build cards expose resource readiness in their labels/titles and mark unaffordable choices without disabling placement feedback.
- Placement validity and obstacle reasons are exposed through a polite atomic live region so keyboard and screen-reader users receive the same placement feedback as pointer users.
- The React shell defers the Three.js world module until mount; production output keeps the UI, world logic, React runtime, and Three.js in separate chunks while preserving the loading-to-play transition.
- Loading and failure overlays now announce their state to assistive technology, while the HTML shell includes a styled no-JavaScript fallback.
- Mobile renderer QA at 393px with a 3× emulated device pixel ratio confirmed the canvas is capped at roughly 1.35× backing resolution; desktop remains capped at 2×.
- Mobile chrome now opts into safe-area insets for notched devices without changing the 390px layout bounds.
- The narrow-phone breakpoint now truncates long palette labels cleanly at 320px while retaining full accessible button names.
- At the same extreme breakpoint, the nonessential persistent status line yields its space to the help control; live state remains available through the goals, speed control, toast, and overview.
- Placement previews now update React state only when the snapped grid cell or validity changes, avoiding redundant full-shell renders during pointer movement.
- Paths can now be laid as a connected drag segment; path painting consumes one stone per new tile and stops safely at obstacles, the river, the boundary, or resource exhaustion.
- Diagonal path drags now choose the clearer of the two Manhattan turns, so an obstacle on one leg does not discard a reachable route around it.
- Path placement captures the active pointer and cleans up on cancellation, keeping long mouse or touch drags reliable even when they leave the canvas.
- Placement mode releases one-finger camera panning on touch devices, so path dragging works without changing the normal camera gesture outside placement mode.
- Production workers now route to the reachable edge of the actual town hall before delivery, keeping worker movement, delivery bursts, and the activity message aligned.
- Unreachable delivery routes now keep goods in transit and retry instead of crediting resources remotely.
- Worker and building inspectors distinguish a blocked delivery as “Waiting for route” instead of reporting a misleading active delivery.
- The settlement status line also surfaces blocked deliveries and windmill food shortages when no transient activity message is active.
- Pausing at 2× or 4× now preserves the last selected speed when the simulation resumes, including the Space shortcut.
- While paused, villagers and their work effects now hold their last rendered pose, avoiding per-frame actor animation work while the camera remains usable.
- The render loop skips inactive villager work-effect checks and buildings with no transient effects, reducing per-frame bookkeeping in quiet villages.
- Worker routing now uses a weighted search that prefers connected paths while retaining obstacle, river, and boundary avoidance.
- Job assignment now balances worker load first and uses the closest job point as the tie-breaker, reducing unnecessary cross-village walks.
- If the preferred work site cannot be reached, workers now try the next valid construction or production site instead of idling while reachable work remains.
- Workers retain their route goal and recompute a path when a newly placed structure blocks their next step, preserving construction and delivery behavior during active play.
- Worker routes now avoid the same tree and rock obstacles used by placement validation, so villagers no longer visibly walk through scenery on their way to work.
- Model assets now load in parallel during startup, while selection rings are explicitly disposed when cleared so repeated inspection does not accumulate GPU geometry or materials.
- Construction, work-cycle, and production progress bars expose their current values through accessible progressbar semantics.
- The settlement status line now prioritizes the explicit paused state over stale transient activity messages.
- Reduced-motion detection and building IDs now have safe fallbacks for browser contexts without the optional platform APIs.
- Global camera/build shortcuts now yield to focused buttons and other interactive controls, preserving expected keyboard activation behavior.
- At widths up to 480px, the tool palette now uses readable fixed-width cards in a horizontal scroller with an explicit swipe cue instead of compressing every action into an unusable sliver.
- The smallest header breakpoint keeps the Hearth & Hamlet brand on one line while preserving space for the day and menu controls.
- The programmatic backup-file input is removed from the tab order so keyboard navigation does not land on an invisible 1px control; import remains available through the labeled village menu action.
- Responsive and transient surfaces that are visually hidden are removed from sequential focus as well, preventing tutorial-suppressed goals and overlay content from stealing keyboard focus.
- Tutorial supporting copy and the skip-introduction action now use a readable secondary contrast level against the parchment surface instead of relying on low-contrast washed-out text.
- Advisor responses now render safe inline bold emphasis instead of exposing model Markdown markers as literal asterisks.
- At 640px-wide placement mode, the build detail card now lifts clear of the placement hint and its rotate/place/cancel controls instead of overlapping their hit area.
- Overview worksite shortcuts now announce their target and current status explicitly, including the villager's current task.
- Settlement goal “Plan it” actions move focus into the visible placement controls so keyboard users can continue directly into confirmation or cancellation.
- On 320px-tall compact layouts, advisor spacing keeps the conversation and input above the build palette instead of overlapping its controls.
- The 761–900px tablet header compresses its resource, day, and brand groups enough to keep the menu inside the viewport.
- Compact landscape tablets now use a scrollable goals panel and compressed lower controls so 768×568 layouts avoid goal, palette, and compass collisions.
- In 390–640px short-landscape layouts, the advisor trigger moves into a clear lane beside the settlement panel instead of sitting beneath the zoom rail.
- At 901–1024px widths with a 600px-tall viewport, goals become a bounded scroll region instead of sliding behind the lower controls.
- Short desktop goals now expose a stable scrollbar track and contain wheel overscroll, making clipped progress rows discoverable without moving the whole page.
- Short desktop layouts through 1280×720 now reserve a vertical gap above the palette for the goals card and compass/help stack.
- During placement, Enter confirms from the selected palette tool as well as the visible Place control, while Escape still returns to the originating tool.
- Escape from a goal-driven “Plan it” placement now returns focus to that goal action instead of falling through to the village menu trigger.
- Direct palette selection now moves focus to the placement confirmation control after the card renders, preserving the same keyboard sequence as “Plan it.”
- Cancelling direct palette placement now returns focus to the originating tool card, keeping the tool-to-preview-to-cancel loop intact.
- Icon-only advisor and zoom controls expose matching native hover titles on compact layouts, improving mouse discoverability without changing their accessible names.
- Menu and advisor triggers now expose `aria-controls` only while their target surface exists, removing dangling references from the closed-state accessibility tree.
- The village menu now has an explicit accessible name.
- The village menu now dismisses when keyboard focus tabs outside it, keeping the overlay and focus order aligned for keyboard users.
- Clicking the open village-menu trigger now closes the menu reliably instead of reopening it during the blur/click sequence.
- Escape now closes the village menu through the same focus-restoring path, keeping the trigger state and keyboard focus synchronized.
- Compact overview and help dialogs remain inside the 320×568 viewport with internal scrolling, keeping their full action sets reachable without page-level overflow.
- Building and worker inspectors now expose non-modal dialog semantics linked to the inspected subject, so their context is announced when focus enters the panel.
- Closing an inspector now returns focus to its originating control when available, with the village menu as a stable fallback for world-canvas selections.
- The inspector’s close-button path now follows the same return-focus behavior as Escape, keeping pointer and keyboard dismissal consistent.
- Replaying the introduction now hands focus directly to the next tutorial action after Help closes, so the guided flow resumes without a focus detour.
- Large resource and overview counters now use thousands separators, keeping late-game economy values scannable in both the HUD and settlement overview.
- The narrowest 320px HUD keeps grouped storage values fully visible without introducing horizontal page overflow.

## Visual comparison

The user's supplied low-poly village is the primary art reference. `concept.png` is a generated direction for the surrounding interface; it is not an approved pixel-exact screenshot specification. The concept added much denser scenery than the user's reference. The implementation intentionally follows the user's simpler Blender-style polygon art.

The concept and `game-desktop.png` were both opened with `view_image` in the same verification pass. `game-mobile.png` records the responsive viewport.

| Point inspected | Result / intentional difference |
| --- | --- |
| Layout | Retained full-screen isometric world, top resource strip, left goals, bottom full build-and-path palette, compass, and zoom controls. |
| Palette | Parchment UI, olive grass, timber, terracotta cottages, blue roofs, and turquoise water. Fixed initially washed-out lighting using correct color conversion and adjusted ambient light. |
| Typography | Serif brand/headings with compact sans-serif UI. Reduced concept title size to leave room for labeled live resource counts. |
| Asset treatment | Actual editable Blender geometry and Three.js rendering, intentionally replacing generated raster art. Refined tower height, sail widths, cottage fences, and visible lumber stacks after browser review. |
| Spacing and controls | The full palette remains accessible through the mobile horizontal rail. Header resources wrap to a second row. Inspector hides underlying objectives on narrow screens. |
| Copy | Intentional changes: House → Cottage, Mine → Stone mine, Road → Path, Gather 100 wood → Gather timber with a 100-unit counter. Added settlement name, concise instructions, and state feedback. No unrelated marketing sections. |
| Motion | Villagers travel to jobs, structures grow during construction, and windmill sails rotate. Pause stops simulation. |
| Atmosphere and feedback | Added a restrained time-of-day cycle with matching sun/moon header state, dusk lanterns, daytime birds, worker carry props, town-hall delivery bursts, readable delivery/build activity feedback, clickable villager task inspection with forgiving hit targets, resource value motion, construction/selection pulses, and reduced-motion support for decorative animation. |

This is a faithful functional interpretation of the supplied low-poly reference, with the intentional geometry/detail and UI differences above. It is not a pixel-identical recreation of the more elaborate generated concept.
