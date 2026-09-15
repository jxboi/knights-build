# Hearth & Hamlet Design System

This document describes the visual language implemented in `src/style.css` and `src/main.jsx`. It is the design reference for extending the village UI without drifting into a generic dashboard or a modern game HUD.

For an AI continuation, read [HANDOFF.md](HANDOFF.md) first, then use this file as the visual contract. It is especially important for changes to responsive layout, keyboard focus, or the build palette.

The interface should feel like a small illustrated storybook laid over a living low-poly landscape: warm parchment, quiet typography, natural colors, compact controls, and feedback that feels useful rather than noisy.

## Design personality

- Warm, pastoral, handcrafted, and quietly playful.
- Storybook/editorial in headings; practical and legible in controls.
- Low-poly 3D world with a restrained parchment UI layer.
- Dense enough to keep the game visible, but never visually louder than the village itself.
- Atmospheric rather than glossy: use texture, translucency, and soft shadow instead of gradients, glassmorphism, or neon effects.

The design is intentionally not pixel-identical to the generated concept art. The Blender-rendered village and the implemented interface are the source of truth; `docs/game-desktop.png` and `docs/game-mobile.png` are reference captures for composition and responsive behavior.

## Core tokens

The current implementation uses these CSS values as its primary visual vocabulary:

```json
{
  "meta": {
    "name": "Hearth & Hamlet",
    "version": "1.0.0",
    "personality": "A warm storybook village interface with low-poly geometry, quiet editorial typography, and practical parchment controls."
  },
  "colors": {
    "world-background": "#9eae70",
    "paper": "#f6f0e2",
    "paper-warm": "#f6f0e5",
    "paper-light": "#fffaf0",
    "ink": "#40382c",
    "body-text": "#413b2e",
    "muted": "#8b8270",
    "line": "#ddd3bd",
    "accent-wood": "#a46843",
    "accent-wood-hover": "#805d3d",
    "village-green": "#5f7650",
    "success": "#7b8f61",
    "warning": "#b16d4e",
    "error": "#a35f49",
    "night-blue": "#71889a",
    "food-gold": "#b18b43",
    "stone-gray": "#7c8076"
  },
  "typography": {
    "display": "Lora, Georgia, serif",
    "body": "DM Sans, sans-serif",
    "display-weights": [400, 500, 600],
    "body-weights": [400, 450, 500, 550, 600, 650, 700]
  },
  "shape": {
    "panel-radius": "7px",
    "control-radius": "4px",
    "card-radius": "5px",
    "checkbox-radius": "3px",
    "pill-radius": "9999px",
    "focus-outline": "2px solid #8d613f"
  },
  "layout": {
    "desktop-topbar": "78px",
    "wide-topbar": "86px",
    "mobile-topbar": "99px plus safe-area inset",
    "desktop-gutter": "27px",
    "wide-gutter": "38px",
    "mobile-gutter": "16px"
  }
}
```

When adding a new token, prefer a named CSS custom property in `src/style.css` if it is reused. Keep the existing semantic names (`--paper`, `--ink`, `--muted`, `--line`, `--accent`, `--green`) stable.

## Color system

| Role | Value | Swatch | Use |
| --- | --- | --- | --- |
| World background | `#9eae70` | <span style="color:#9eae70">████</span> | Base terrain/world tone and fallback background. |
| Paper | `#f6f0e2` | <span style="color:#f6f0e2">████</span> | General parchment panels and light surfaces. |
| Paper warm | `#f6f0e5` | <span style="color:#f6f0e5">████</span> | Topbar surface. |
| Paper light | `#fffaf0` | <span style="color:#fffaf0">████</span> | Text inputs and high-contrast form surfaces. |
| Ink | `#40382c` | <span style="color:#40382c">████</span> | Primary text and readable headings. |
| Muted | `#8b8270` | <span style="color:#8b8270">████</span> | Captions, labels, secondary metadata. |
| Line | `#ddd3bd` | <span style="color:#ddd3bd">████</span> | Borders, dividers, progress tracks. |
| Wood accent | `#a46843` | <span style="color:#a46843">████</span> | Primary actions, selected build cards, warm emphasis. |
| Green | `#5f7650` | <span style="color:#5f7650">████</span> | Positive state, completed goals, valid placement. |
| Terracotta warning | `#b16d4e` | <span style="color:#b16d4e">████</span> | Capacity pressure, insufficient resources, waiting states. |
| Night blue | `#71889a` | <span style="color:#71889a">████</span> | Night-time icon state and cool atmospheric accents. |

### Color rules

- Use dark ink on parchment for primary content; do not use light gray text on pale panels.
- Use wood accent for one clear primary action or selected state, not for every interactive element.
- Use green to indicate completed/valid state and terracotta to indicate a condition requiring attention; never rely on color alone.
- Keep the world palette natural: olive grass, blue water/roofs, terracotta roofs, timber, stone gray, and wheat gold.
- Avoid pure black, pure white, saturated purple, electric blue, or high-chroma gradients unless they are part of a new world asset or a clearly documented state.
- Translucent surfaces should remain readable over the world. The existing parchment treatment combines a warm gradient, a faint paper texture, a thin border, and a soft shadow.

## Typography

### Font pairing

- `Lora` is the display face for the brand, village name, modal headings, building titles, and time/day labels. It gives the interface its storybook and editorial character.
- `DM Sans` is the utility face for resources, buttons, body copy, controls, status labels, and dense metadata. It keeps small UI text compact and legible.
- Always include `Georgia, serif` and `sans-serif` fallbacks. The application is expected to remain usable offline if the web fonts are unavailable.

### Type hierarchy

| Level | Current range | Typical use |
| --- | --- | --- |
| Display | `33px`, Lora, 500 | Village title and loading title. |
| Brand | `25px` desktop / `20px` mobile, Lora, 500 | Hearth & Hamlet wordmark. |
| Section | `27px`, Lora, 500 | Modal headings. |
| Panel title | `20–22px`, Lora, 500 | Advisor, inspector, and building title. |
| Body | `10–11px`, DM Sans | Descriptions, help copy, activity, inspector text. |
| Control | `9–11px`, DM Sans | Buttons, costs, menu items, build names. |
| Kicker | `6–9px`, uppercase, letter-spaced | Resource labels, section labels, status captions. |

### Type rules

- Use sentence case for explanatory copy and uppercase only for compact labels/kickers.
- Use letter spacing to create a quiet label, not to compensate for an overly small body size.
- Use tabular numerals for resources and goal counts so values do not shift the layout as they change.
- Keep line height generous in explanatory copy (`1.45–1.8`) and compact in labels.
- Do not introduce a third display font or use a generic all-caps game font.

## Layout and spacing

The game is a full-viewport composition. The Three.js world occupies the background while UI chrome is positioned above it as focused overlays.

### Spatial structure

```text
┌─────────────────────────────────────────────────────────────┐
│ topbar: brand · resources · day · menu                      │
├─────────────────────────────────────────────────────────────┤
│ left objectives                         right controls      │
│                                                             │
│                         living 3D village                  │
│                                                             │
│ compass/help                         zoom / inspector      │
│              build title + palette + status                 │
└─────────────────────────────────────────────────────────────┘
```

- Keep the world visible underneath the chrome; do not add opaque full-screen panels for ordinary interaction.
- Desktop UI anchors use approximately `27px` side gutters, expanding to `38px` on very wide displays.
- The topbar is `78px` tall by default and `86px` on wide displays. It separates from the world with a fine bottom border and low shadow.
- The objective stack is left-aligned; time controls, advisor, inspector, and menu are right-aligned.
- The build palette is centered at the bottom and acts as the primary action rail.
- Use a 4px foundation with the practical working rhythm clustered around `4, 8, 12, 16, 20, 24, 27, 34` pixels. The larger 27/38px values are composition gutters, not component padding.
- Panels normally use `13–20px` internal padding. Modals use more breathing room (`27–34px`).

### Responsive behavior

- At `max-width: 1100px`, reduce gutters and palette dimensions while keeping the eleven-action build rail intact.
- At `max-width: 760px`, the topbar becomes a two-row grid: brand/day/menu above, resources below. Preserve `env(safe-area-inset-*)` insets.
- Mobile keeps the world full-screen and compresses the palette, controls, objectives, and inspector rather than introducing a separate mobile page.
- At very narrow widths (`max-width: 360px`), truncate long build labels and remove nonessential persistent status text while preserving accessible names and live state elsewhere.
- At short mobile heights, move auxiliary controls away from the palette and reduce card/image heights so the primary build rail remains contained.
- Do not change the information architecture between desktop and mobile; change density and placement.

## Surface and elevation language

### Parchment surface

Use the `.parchment` pattern for overlays that need separation from the world:

- warm translucent cream gradient;
- subtle repeating paper grain;
- `1px` warm border;
- soft low shadow;
- small `7px` radius;
- optional `backdrop-filter: blur(3px)` where supported.

This surface is used for objectives, time controls, advisor, inspector, build palette, menu, and modal cards. Do not give every small button its own floating shadow.

### Elevation tiers

| Tier | Treatment | Examples |
| --- | --- | --- |
| World | No UI shadow; rely on Three.js lighting, fog, and geometry. | Terrain, buildings, paths. |
| Overlay | `0 3–16px` soft shadow, thin border. | Objectives, controls, palette. |
| Raised panel | `0 7–34px` shadow, translucent parchment. | Advisor, tooltip, inspector. |
| Modal | Backdrop tint plus blur and centered parchment card. | Help, overview, rename, reset. |

Avoid hard black shadows, large rounded cards, and excessive stacked elevation.

## Component patterns

### Topbar and resource strip

The topbar is a light parchment band with the brand on the left, evenly spaced resources in the center, and day/period plus the menu on the right.

- Brand: Lora wordmark, small leaf mark, compact uppercase subtitle.
- Resources: icon, uppercase label, tabular value. Use domain colors: wood olive/gold, stone gray, food wheat gold, villagers muted brown.
- Capacity pressure: population value and icon turn terracotta when at capacity.
- Day/period: Lora for the day number, small muted season/period metadata, warm sun/dusk or cool night icon.
- On mobile, retain the same hierarchy but move resources to a second row.

### Objective card

The left objective card explains the early-game path and reports progress.

- Use a parchment card with a compact Lora title and small descriptive copy.
- Goals use a 14px desktop checkbox, count aligned right, and a thin green progress bar.
- Completed goals use green text/check fill and a restrained completed-card border treatment.
- The card can collapse; preserve the heading and expand/collapse affordance.

### Build palette and build card

The centered bottom palette is the primary navigation for building actions.

- Keep the palette as a single readable rail with eleven equal action cards on desktop and mobile; the last three decorative actions remain palette-only.
- Show the actual model thumbnail from the GLB asset; do not replace it with a generic icon.
- Use a transparent/default card, warm hover tint, and wood-colored selected state.
- Selected cards use cream text and a darker wood border. Add a small animated selection pip only as a subtle confirmation.
- Low-resource cards remain selectable so placement feedback can explain the shortfall; do not silently disable them.
- Warnings use a small terracotta circular marker, not a large alert banner.

### Inspector and tooltip

Inspectors and build tooltips are focused, contextual panels.

- Lead with a small kicker, model portrait/thumbnail, Lora title, then concise description.
- Separate cost or stat columns with a thin vertical divider.
- Use compact progress bars with a green-to-wood gradient for construction/work progress.
- Use status colors consistently: green for active work, muted brown for idle/complete, terracotta for waiting-for-food or blocked conditions.
- Keep the inspector clear of the persistent zoom rail and hide competing objectives on narrow screens.

### Buttons and controls

- Primary action: wood background `#96704b`, cream text, `4px` radius, `12px 16px` padding; hover darkens to `#805d3d`.
- Secondary/quiet action: parchment or transparent background with muted brown text and a thin warm border where needed.
- Icon button: approximately 31–38px square, centered icon, `6px` radius, warm hover tint.
- Active segmented control: slightly darker parchment fill and darker text; keep the control rail quiet.
- Focus: use the existing visible `2px` outline with `3px` offset. Never remove the focus indicator.
- Do not use pill-shaped buttons except for genuinely status-like or progress elements.

### Advisor

The advisor is a utility panel, not a competing chat product.

- Launch from the top-right overlay; on mobile it reduces to the icon button.
- Keep the panel narrow (`330px` desktop, up to `340px` mobile), with a Lora title and muted intro.
- User messages align right with a warmer parchment; assistant messages align left with a cooler translucent surface.
- Use compact message typography and a thin scrollbar; keep the latest interaction visible.
- The send control uses the primary wood accent. Error messages use a soft terracotta surface and border.
- Keep the “powered by” note quiet and secondary.

### Modal and toast

- Modal backdrop: dark olive translucent overlay with light blur.
- Modal card: parchment, centered, `27–34px` padding, Lora heading, clear action row.
- Toast: compact centered feedback with a warm surface, small shadow, and one semantic icon. Keep it out of the inspector and topbar.
- Use toasts for transient world feedback; use persistent status text or live regions for conditions the player must not miss.

## Motion and atmosphere

Motion should make the village feel alive without competing with construction decisions.

- Use short UI transitions (`150–250ms`) for hover, selection, and panel entry.
- Use soft easing for resource bumps, progress changes, and panel appearance.
- World motion includes foliage sway, water ripples, birds, smoke, lanterns, construction growth, and delivery bursts.
- Pause stops simulation while preserving the last selected speed for resume.
- Honor `prefers-reduced-motion: reduce` by disabling decorative animation and transition effects while keeping the simulation and controls understandable.
- Avoid perpetual motion on every UI element; reserve animation for state change or atmosphere.

## Accessibility and content rules

- Preserve visible focus for keyboard users.
- Keep controls at usable touch sizes even when visual icons are small.
- Expose pressed/expanded state for speed controls, build-grid state, and the collapsible objectives card.
- Announce loading, failures, placement validity, and other important state changes through the existing live-region patterns.
- Keep full accessible names when visual labels are truncated on very narrow screens.
- Write compact, direct copy. Prefer “Waiting for route” or “Waiting for food” over vague status language.
- Maintain the current product vocabulary: `Cottage`, `Well`, `Farm`, `Lumberyard`, `Stone mine`, `Windmill`, `Watchtower`, and `Path`.

## AI implementation instructions

When generating or changing Hearth & Hamlet UI:

1. Start with the living village and treat UI as a parchment overlay, not as a dashboard background.
2. Use `Lora` for display hierarchy and `DM Sans` for utility text.
3. Use the existing olive, cream, timber, terracotta, stone, water, and wheat palette before inventing new colors.
4. Prefer small-radius parchment cards, thin warm borders, and soft shadows.
5. Keep the centered bottom build rail, left objectives, top resource strip, and right contextual controls coherent across widths.
6. Preserve the eleven-action build palette and model thumbnails; do not substitute a generic card grid.
7. Make state visible through text, icon, and color together. Never rely on color alone.
8. Add motion only for feedback or atmosphere and preserve the reduced-motion behavior.
9. Reuse existing component classes and CSS variables before adding one-off styles.
10. Verify desktop and narrow mobile compositions, safe-area insets, focus behavior, and no overflow before handoff.
