import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Wheat from "lucide-react/dist/esm/icons/wheat.js";
import Wine from "lucide-react/dist/esm/icons/wine.js";
import GraduationCap from "lucide-react/dist/esm/icons/graduation-cap.js";
import Croissant from "lucide-react/dist/esm/icons/croissant.js";
import Trees from "lucide-react/dist/esm/icons/trees.js";
import Mountain from "lucide-react/dist/esm/icons/mountain.js";
import Users from "lucide-react/dist/esm/icons/users.js";
import Sun from "lucide-react/dist/esm/icons/sun.js";
import Moon from "lucide-react/dist/esm/icons/moon.js";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import Minus from "lucide-react/dist/esm/icons/minus.js";
import Compass from "lucide-react/dist/esm/icons/compass.js";
import HelpCircle from "lucide-react/dist/esm/icons/circle-help.js";
import Save from "lucide-react/dist/esm/icons/save.js";
import X from "lucide-react/dist/esm/icons/x.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right.js";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up.js";
import RotateCw from "lucide-react/dist/esm/icons/rotate-cw.js";
import MousePointer2 from "lucide-react/dist/esm/icons/mouse-pointer-2.js";
import Grid2X2 from "lucide-react/dist/esm/icons/grid-2x2.js";
import Leaf from "lucide-react/dist/esm/icons/leaf.js";
import Info from "lucide-react/dist/esm/icons/info.js";
import House from "lucide-react/dist/esm/icons/house.js";
import Hammer from "lucide-react/dist/esm/icons/hammer.js";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3.js";
import Gauge from "lucide-react/dist/esm/icons/gauge.js";
import Route from "lucide-react/dist/esm/icons/route.js";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle.js";
import Send from "lucide-react/dist/esm/icons/send.js";
import FileDown from "lucide-react/dist/esm/icons/file-down.js";
import FileUp from "lucide-react/dist/esm/icons/file-up.js";
import Eraser from "lucide-react/dist/esm/icons/eraser.js";
import Sparkles from "lucide-react/dist/esm/icons/sparkles.js";
import ArrowDownRight from "lucide-react/dist/esm/icons/arrow-down-right.js";
import Pause from "lucide-react/dist/esm/icons/pause.js";
import Play from "lucide-react/dist/esm/icons/play.js";
import { CATALOG } from "./catalog.js";
import { completedPlayerMilestone } from "./progression.js";
import "./style.css";
const HealthCheck = lazy(() => import("./health-check.jsx"));
const resourceIcons = { wood: Trees, stone: Mountain, food: Croissant, wheat: Wheat, wine: Wine };
// The palette is rendered again whenever the simulation emits a snapshot. Keep
// its immutable catalog work outside App so those frequent renders only check
// live resource affordability.
const CATALOG_ENTRIES = Object.entries(CATALOG).map(([type, catalog]) => {
  const costs = Object.entries(catalog.cost);
  return {
    type,
    catalog,
    costs,
    costSummary:
      costs.map(([resource, amount]) => `${amount} ${resource}`).join(" · ") +
      (catalog.tileTool || type === "road" ? " per tile" : ""),
  };
});
const CATALOG_TYPES = CATALOG_ENTRIES.map(({ type }) => type);
const insideBuildingStatus = {
  farm: "Cutting grain in the field",
  bakery: "Processing wheat inside Bakery",
  windmill: "Processing food inside Windmill",
  vineyard: "Pressing grapes at Vineyard",
};
const workerPhaseStatus = {
  travel: "On the way",
  chop: "Chopping a tree",
  lumber_delivery: "Taking logs to Lumberyard",
  process: "Sawing wooden planks",
  material_pickup: "Collecting materials",
  material_delivery: "Delivering materials",
  construct: "Building",
  work: "Working",
  harvest: "Cutting grain in the field",
  deliver: "Delivering",
  visit: "At the well",
};
const formatCount = (value) =>
  Math.floor(Number(value) || 0).toLocaleString("en-US");
const workerTypeOrder = [
  "Builder",
  "Woodcutter",
  "Miner",
  "Farmer",
  "Baker",
  "Carrier",
];
function timeOfDay(seconds = 0) {
  const cycle = ((seconds % 120) / 120 + 0.22) % 1;
  if (cycle < 0.18) return "Dawn";
  if (cycle < 0.44) return "Morning";
  if (cycle < 0.69) return "Afternoon";
  if (cycle < 0.86) return "Dusk";
  return "Night";
}
function workerStatus(worker) {
  if (!worker) return "Idle";
  if (worker.phase === "eat") return "Eating bread at the Inn";
  if (worker.phase === "eat_travel") return "Heading to the Inn";
  if (worker.waitingForInn) return "Waiting for an Inn";
  if (worker.waitingForInput) return "Waiting for ingredients";
  if (worker.waitingForSpace) return "Waiting for space";
  if (worker.deliveryRetry) return "Waiting for route";
  if (worker.insideBuilding) {
    return insideBuildingStatus[worker.buildingType] || "Working inside building";
  }
  return workerPhaseStatus[worker.phase] ||
    (worker.hungry ? "Hungry — waiting for bread" : "Idle");
}
function AdvisorContent({ content }) {
  const parts = String(content || "").split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );
}
const Resource = React.memo(function Resource({ type, value, trend = 0, storage = 0 }) {
  const Icon = resourceIcons[type];
  const trendValue = Math.round(Number(trend || 0) * 10) / 10;
  const TrendIcon = trendValue > 0 ? ArrowUpRight : ArrowDownRight;
  const held = Math.floor(Number(value) || 0);
  const capacity = Math.floor(Number(storage) || 0);
  const full = capacity > 0 && held >= capacity;
  // The ceiling only earns HUD space once it is close enough to bite.
  const tight = capacity > 0 && held >= capacity * 0.8;
  return (
    <div
      className={`resource ${type} ${full ? "at-capacity" : ""}`}
      title={
        capacity > 0
          ? `${type[0].toUpperCase() + type.slice(1)}: ${held} of ${capacity} storage.${full ? " Storage is full — build a Storehouse." : ""}`
          : `${type[0].toUpperCase() + type.slice(1)} in storage`
      }
    >
      <span className="resource-icon">
        <Icon size={23} strokeWidth={1.7} />
      </span>
      <div>
        <small>{type}</small>
        <strong className="resource-value" key={held}>
          {formatCount(value)}
          {tight && <em className="resource-cap"> / {capacity}</em>}
        </strong>
        {full ? (
          <span className="resource-trend negative" title={`${type} storage is full`}>
            · storage full
          </span>
        ) : trendValue !== 0 ? (
          <span
            className={`resource-trend ${trendValue > 0 ? "positive" : "negative"}`}
            title={`${type} change over the last simulation window`}
          >
            <TrendIcon size={10} /> {trendValue > 0 ? "+" : ""}{trendValue}/m
          </span>
        ) : null}
      </div>
    </div>
  );
});
const paletteResourceKeys = ["wood", "stone", "food", "wheat", "wine"];
const BuildPalette = React.memo(function BuildPalette({
  resources,
  thumbs,
  selected,
  paletteOpen,
  loaded,
  error,
  onChoose,
  onHover,
}) {
  return (
    <nav
      id="building-palette"
      className={`build-palette parchment ${paletteOpen ? "is-open" : "is-collapsed"}`}
      aria-hidden={!paletteOpen}
      inert={!paletteOpen}
      aria-label="Village building and path tools. On small screens, scroll horizontally to see every tool."
    >
      <span className="palette-scroll-hint" aria-hidden="true">
        Swipe for more <ArrowDownRight size={10} />
      </span>
      {CATALOG_ENTRIES.map(({ type, catalog: c, costs, costSummary }) => {
        const missing = costs
          .filter(([resource, amount]) => (resources[resource] || 0) < amount)
          .map(
            ([resource, amount]) =>
              `${amount - Math.floor(resources[resource] || 0)} ${resource}`,
          )
          .join(", ");
        const affordable = !missing;
        const availability = affordable ? "Resources ready" : `Needs ${missing}`;
        return (
          <button
            type="button"
            key={type}
            data-build-type={type}
            aria-label={`Build ${c.name}. Costs ${costSummary}. ${availability}`}
            aria-pressed={selected === type}
            title={`${c.name}: ${costSummary}. ${availability}`}
            className={`build-card ${selected === type ? "selected" : ""} ${affordable ? "" : "low-resources"}`}
            onClick={(event) => onChoose(type, event.currentTarget)}
            onMouseDown={(event) => {
              event.preventDefault();
              event.currentTarget.focus();
            }}
            onMouseEnter={() => onHover(type)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(type)}
            onBlur={() => onHover(null)}
            disabled={!loaded || !!error}
          >
            {!affordable && (
              <span className="build-card-warning" aria-hidden="true">
                !
              </span>
            )}
            {thumbs[type] ? <img src={thumbs[type]} alt="" /> : <House size={28} />}
            <span className="building-name">{c.name}</span>
            {selected === type && <i />}
          </button>
        );
      })}
      <button
        type="button"
        className={`build-card utility-card ${selected === "road-remove" ? "selected" : ""}`}
        data-build-type="road-remove"
        aria-label="Remove player-laid paths. Returns one stone per tile."
        aria-pressed={selected === "road-remove"}
        title="Remove paths: 1 stone returned per tile"
        onClick={(event) => onChoose("road-remove", event.currentTarget)}
        onMouseDown={(event) => {
          event.preventDefault();
          event.currentTarget.focus();
        }}
        onMouseEnter={() => onHover("road-remove")}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover("road-remove")}
        onBlur={() => onHover(null)}
        disabled={!loaded || !!error}
      >
        <Eraser size={27} />
        <span className="building-name">Remove paths</span>
        {selected === "road-remove" && <i />}
      </button>
    </nav>
  );
}, (previous, next) =>
  previous.thumbs === next.thumbs &&
  previous.selected === next.selected &&
  previous.paletteOpen === next.paletteOpen &&
  previous.loaded === next.loaded &&
  previous.error === next.error &&
  previous.onChoose === next.onChoose &&
  previous.onHover === next.onHover &&
  paletteResourceKeys.every(
    (key) => previous.resources?.[key] === next.resources?.[key],
  )
);
function App() {
  const worldRef = useRef(),
    game = useRef(),
    menuRef = useRef(),
    menuButtonRef = useRef(),
    menuStateRef = useRef(false),
    advisorButtonRef = useRef(),
    inspectorCloseRef = useRef(),
    goalsButtonRef = useRef(),
    modalRef = useRef(),
    advisorInputRef = useRef(),
    advisorMessagesRef = useRef(),
    importFileRef = useRef(),
    previousSpeed = useRef(1);
  const [state, setState] = useState({
    name: "Willowbrook",
    resources: { wood: 140, stone: 95, food: 80, wheat: 0, wine: 0 },
    storage: { wood: 200, stone: 200, food: 200, wheat: 200, wine: 200 },
    population: 8,
    capacity: 10,
    day: 1,
    speed: 1,
    time: 0,
    buildings: [],
    workers: [],
    created: {},
    gathered: 0,
    activity: "",
    activityLog: [],
    saveAvailable: true,
    hasSaved: false,
    saveConflict: false,
    healthCheck: false,
    delivered: { wood: 0, stone: 0, food: 0, wheat: 0, wine: 0 },
    trends: { wood: 0, stone: 0, food: 0, wheat: 0, wine: 0 },
    inTransit: 0,
    blockedSites: 0,
    chapterGoals: [],
    feast: null,
    tutorialStep: 0,
    tutorialDismissed: false,
    placement: null,
    graphicsPreset: "balanced",
    audioSettings: { effects: true, ambience: false },
  });
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(null),
    [thumbs, setThumbs] = useState({}),
    [selected, setSelected] = useState(null),
    [hover, setHover] = useState(null),
    [buildDetailsOpen, setBuildDetailsOpen] = useState(false),
    [detail, setDetail] = useState(null),
    [toast, setToast] = useState(null),
    [help, setHelp] = useState(false),
    [goals, setGoals] = useState(false),
    [grid, setGrid] = useState(false),
    [paletteOpen, setPaletteOpen] = useState(() => {
      if (typeof window === "undefined") return true;
      return !window.matchMedia("(max-width: 760px)").matches;
    }),
    [menu, setMenu] = useState(false),
    [overview, setOverview] = useState(false),
    [reset, setReset] = useState(false),
    [rename, setRename] = useState(false),
    [nameDraft, setNameDraft] = useState("Willowbrook"),
    [advisorOpen, setAdvisorOpen] = useState(false),
    [advisorInput, setAdvisorInput] = useState(""),
    [advisorMessages, setAdvisorMessages] = useState([
      {
        role: "assistant",
        content:
          "Welcome, steward. I can read the state of your settlement and suggest what to do next.",
      },
    ]),
    [advisorLoading, setAdvisorLoading] = useState(false),
    [advisorError, setAdvisorError] = useState(null);
  const [importOpen, setImportOpen] = useState(false),
    [importPreview, setImportPreview] = useState(null);
  const toastTimer = useRef();
  const goalSnapshot = useRef({ ready: false, complete: false });
  const goalsOpenRef = useRef(false);
  const modalReturnRef = useRef();
  const placementFocusReturn = useRef(null);
  const inspectorFocusReturn = useRef(null);
  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);
  const openModal = (setter, returnTarget) => {
    modalReturnRef.current = returnTarget || document.activeElement;
    setAdvisorOpen(false);
    setter(true);
  };
  const closeMenu = (restoreFocus = false) => {
    menuStateRef.current = false;
    setMenu(false);
    if (restoreFocus)
      requestAnimationFrame(() => menuButtonRef.current?.focus());
  };
  const showGoals = () => {
    setGoals(true);
    closeMenu();
    requestAnimationFrame(() => goalsButtonRef.current?.focus());
  };
  useEffect(() => {
    if (!goals && goalsOpenRef.current)
      window.setTimeout(() => document.querySelector(".menu-button")?.focus(), 0);
    goalsOpenRef.current = goals;
  }, [goals]);
  const closeDetail = (restoreFocus = false) => {
    const returnTarget = inspectorFocusReturn.current;
    inspectorFocusReturn.current = null;
    game.current?.clearHighlight();
    setDetail(null);
    if (restoreFocus) {
      requestAnimationFrame(() => {
        const target =
          returnTarget && document.contains(returnTarget)
            ? returnTarget
            : menuButtonRef.current;
        target?.focus();
      });
    }
  };
  const selectDetail = (nextDetail) => {
    if (nextDetail) {
      const active = document.activeElement;
      inspectorFocusReturn.current =
        active instanceof HTMLElement &&
        active !== document.body &&
        !active.closest(".inspector") &&
        active.matches("button, input, textarea, select, a, [tabindex]")
          ? active
          : null;
    } else {
      inspectorFocusReturn.current = null;
    }
    setDetail(nextDetail);
  };
  const syncPlacementComplete = () => {
    setSelected(null);
    setBuildDetailsOpen(false);
    setHover(null);
    setGrid(false);
  };
  useEffect(() => {
    const healthCheck = new URLSearchParams(window.location.search).has("healthcheck");
    if (!healthCheck || window.parent === window) return;
    window.performance.setResourceTimingBufferSize?.(1000);
    const startedAt = performance.now();
    const longTasks = [];
    let frames = 0;
    let raf;
    let observer;
    const sample = (now) => {
      frames += 1;
      if (now - startedAt < 5000) {
        raf = requestAnimationFrame(sample);
        return;
      }
      window.parent.postMessage(
        {
          type: "hearth-hamlet-health-runtime",
          fps: frames / ((now - startedAt) / 1000),
          longTasks: longTasks.length,
          longestTask: longTasks.reduce((longest, task) => Math.max(longest, task.duration), 0),
          sampleMs: now - startedAt,
        },
        window.location.origin,
      );
    };
    if ("PerformanceObserver" in window) {
      try {
        observer = new PerformanceObserver((list) => {
          longTasks.push(...list.getEntries());
        });
        observer.observe({ type: "longtask", buffered: true });
      } catch {}
    }
    raf = requestAnimationFrame(sample);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    import("./world")
      .then(({ Village }) => {
        if (cancelled) return;
        game.current = new Village(
          worldRef.current,
          setState,
          notify,
          selectDetail,
          (images, err, phase = "interactive") => {
            setThumbs(images);
            setError(err);
            setLoaded(true);
            if (window.parent !== window && new URLSearchParams(window.location.search).has("healthcheck")) {
              window.parent.postMessage(
                {
                  type: err ? "hearth-hamlet-health-error" : "hearth-hamlet-health-phase",
                  phase,
                  at: performance.now(),
                  message: err ? String(err) : undefined,
                },
                window.location.origin,
              );
            }
          },
          syncPlacementComplete,
        );
      })
      .catch((loadError) => {
        if (cancelled) return;
        console.error(loadError);
        setError(String(loadError));
        setLoaded(true);
        if (window.parent !== window && new URLSearchParams(window.location.search).has("healthcheck")) {
          window.parent.postMessage(
            { type: "hearth-hamlet-health-error", message: String(loadError) },
            window.location.origin,
          );
        }
      });
    return () => {
      cancelled = true;
      game.current?.dispose();
      clearTimeout(toastTimer.current);
    };
  }, []);
  const choose = useCallback((type, focusReturn = null) => {
    if (!loaded || error) return;
    if (game.current?.storageConflict) {
      notify("This village changed in another tab. Reload to continue.");
      return;
    }
    const next = type === selected ? null : type;
    if (next) {
      setPaletteOpen(true);
      const active = document.activeElement;
      placementFocusReturn.current =
        focusReturn ||
        (active instanceof HTMLElement &&
        active !== document.body &&
        active.matches("button, input, textarea, select, a, [tabindex]")
          ? active
          : null);
    } else {
      placementFocusReturn.current = null;
    }
    setSelected(next);
    setBuildDetailsOpen(false);
    setHover(null);
    setDetail(null);
    setAdvisorOpen(false);
    game.current.clearHighlight();
    game.current.select(next);
    game.current.emit();
    setGrid(!!next);
  }, [error, loaded, notify, selected]);
  useEffect(() => {
    if (!selected) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector(".placement-confirm")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);
  useEffect(() => {
    if (!selected || !paletteOpen) return;
    const frame = requestAnimationFrame(() => {
      const card = [...document.querySelectorAll("[data-build-type]")].find(
        (element) => element.dataset.buildType === selected,
      );
      card?.scrollIntoView({ block: "nearest", inline: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, paletteOpen]);
  const endPlacement = (preserveHighlight = false) => {
    setSelected(null);
    setBuildDetailsOpen(false);
    if (!preserveHighlight) game.current?.clearHighlight();
    game.current?.select(null);
    setGrid(false);
  };
  const cancel = (restoreFocus = false) => {
    const returnTarget = placementFocusReturn.current;
    placementFocusReturn.current = null;
    endPlacement();
    if (restoreFocus) requestAnimationFrame(() => returnTarget?.focus());
  };
  const speed = (s) => {
    if (!game.current) return;
    if (game.current.storageConflict) {
      if (s > 0) notify("Reload this tab before continuing the simulation.");
      return;
    }
    if (s > 0) previousSpeed.current = s;
    game.current.speed = s;
    game.current.emit();
  };
  useEffect(() => {
    const key = (e) => {
      if (e.code === "Escape") {
        if (selected) {
          const returnTarget =
            placementFocusReturn.current ||
            document.querySelector(".goal-next button");
          cancel();
          requestAnimationFrame(() => returnTarget?.focus());
          return;
        }
        if (help || reset || rename || overview || advisorOpen || importOpen) {
          if (advisorOpen) {
            requestAnimationFrame(() => advisorButtonRef.current?.focus());
          }
          setHelp(false);
          setReset(false);
          setRename(false);
          setOverview(false);
          setAdvisorOpen(false);
          setImportOpen(false);
          setImportPreview(null);
          return;
        }
        if (menu) {
          closeMenu(true);
          return;
        }
        if (goals) {
          setGoals(false);
          window.setTimeout(() => document.querySelector(".menu-button")?.focus(), 0);
          return;
        }
        if (document.querySelector(".inspector")) closeDetail(true);
        return;
      }
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (menu) return;
      if (help || reset || rename || overview || advisorOpen || importOpen) return;
      if (
        e.key === "Enter" &&
        selected &&
        e.target instanceof HTMLElement &&
        e.target.matches(".build-card[aria-pressed=\"true\"]")
      ) {
        e.preventDefault();
        if (game.current.confirmPlacement()) cancel();
        return;
      }
      if (
        e.target.closest?.(
          'button, a, select, [contenteditable="true"], [role="button"]',
        )
      )
        return;
      if (e.key === "?" || (e.shiftKey && e.code === "Slash")) {
        e.preventDefault();
        openModal(setHelp, document.activeElement);
        return;
      }
      if (!game.current) return;
      if (e.code === "Space") {
        e.preventDefault();
        speed(game.current.speed ? 0 : previousSpeed.current);
      }
      if (e.code === "KeyR") game.current.rotate();
      if (e.code === "KeyG") {
        game.current.grid.visible = !game.current.grid.visible;
        setGrid(game.current.grid.visible);
      }
      if (e.code === "KeyB") choose("house");
      if (e.key === "Enter" && selected) {
        e.preventDefault();
        if (game.current.confirmPlacement()) cancel();
      }
      const buildNumber = Number(e.key);
      if (
        Number.isInteger(buildNumber) &&
        buildNumber >= 1 &&
        buildNumber <= CATALOG_TYPES.length
      )
        choose(CATALOG_TYPES[buildNumber - 1]);
      const panKeys = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      }[e.code] || {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      }[e.key];
      if (panKeys) {
        e.preventDefault();
        if (selected) game.current.movePlacement(...panKeys);
        else game.current.pan(...panKeys);
      }
      if (e.key === "+" || e.key === "=") game.current.zoom(0.15);
      if (e.key === "-") game.current.zoom(-0.15);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, loaded, detail, help, reset, rename, overview, menu, goals, advisorOpen, importOpen]);
  const menuKeyDown = (event) => {
    const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
    if (!items?.length) return;
    const current = [...items].indexOf(document.activeElement);
    let next = current;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    if (event.key === "ArrowUp")
      next = (current - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next === current) return;
    event.preventDefault();
    items[next]?.focus();
  };
  useEffect(() => {
    if (!menu) return;
    requestAnimationFrame(() => menuRef.current?.querySelector("button")?.focus());
    const dismiss = (event) => {
      const target = event.target;
      const path = event.composedPath?.() || [];
      if (
        menuRef.current?.contains(target) ||
        menuButtonRef.current?.contains(target) ||
        (target instanceof Element && target.closest(".menu-button")) ||
        path.includes(menuButtonRef.current)
      )
        return;
      closeMenu();
    };
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, [menu]);
  useEffect(() => {
    menuStateRef.current = menu;
  }, [menu]);
  const modalOpen = help || reset || rename || overview || importOpen;
  useEffect(() => {
    if (!modalOpen) return;
    const previous = modalReturnRef.current || document.activeElement;
    modalReturnRef.current = null;
    const focusables = () =>
      [...
        (modalRef.current?.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) || [])
      ];
    requestAnimationFrame(() => {
      const first =
        modalRef.current?.querySelector("[data-modal-autofocus]") ||
        modalRef.current?.querySelector(".modal-close");
      first?.focus({ preventScroll: true });
    });
    const trap = (event) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (previous instanceof HTMLElement && document.contains(previous))
        requestAnimationFrame(() => previous.focus());
    };
  }, [modalOpen]);
  const inspected = detail && state.buildings.find((b) => b.id === detail.id);
  const inspectedWorker =
    detail?.type === "worker" &&
    state.workers.find((w) => w.id === detail.workerId);
  const inspectedWorkerStatus = workerStatus(inspectedWorker);
  const inspectedRemaining =
    detail?.type !== "worker" &&
    inspected?.progress < 1 &&
    inspected?.materialsReady &&
    CATALOG[detail?.type]?.seconds
      ? Math.max(
          1,
          Math.ceil(
            (1 - inspected.progress) * CATALOG[detail.type].seconds,
          ),
        )
      : null;
  const inspectedCycleProgress =
    detail?.type !== "worker" ? inspected?.cycleProgress : null;
  const inspectedMaterialProgress =
    detail?.type !== "worker" && inspected?.progress < 1
      ? inspected?.materialProgress
      : null;
  const inspectedNextDelivery =
    detail?.type !== "worker" ? inspected?.nextDelivery : null;
  const activeType = selected || hover;
  const active =
    activeType === "road-remove"
      ? {
          name: "Remove paths",
          effect: "1 stone returned per path tile",
          cost: {},
          seconds: 0,
        }
      : CATALOG[activeType];
  const pathPlacement = selected === "road";
  const grainPlacement = selected === "grainfield";
  const pathRemoval = selected === "road-remove" || activeType === "road-remove";
  const tileMode = pathPlacement || grainPlacement || pathRemoval;
  const placementHint =
    state.placement?.reason ||
    (pathPlacement
      ? "Click or drag to lay a path · Esc to cancel"
      : grainPlacement
        ? "Click or drag beside a farmhouse to plant grain · Esc to cancel"
      : pathRemoval
        ? "Choose one of your path tiles to remove · Esc to cancel"
        : "Choose a clear patch of land to build");
  const activeEffect =
    activeType === "house"
      ? `+2 housing capacity · houses ${Math.min(2, Math.max(0, 24 - state.population))} workers (simulation limit 24)`
      : active?.effect;
  const builtHouse = completedPlayerMilestone(
    state.buildings,
    state.created,
    "house",
    3,
  );
  const builtFarm = completedPlayerMilestone(
    state.buildings,
    state.created,
    "farm",
    1,
  );
  const allGoals = builtHouse && builtFarm && state.gathered >= 100;
  const nextGoal = builtHouse
    ? builtFarm
      ? state.gathered < 100
        ? {
            type: "lumberyard",
            label: "Gather 100 timber",
            detail: "Keep a lumberyard moving so the village can expand.",
          }
        : null
      : {
          type: "farm",
          label: "Establish a farm",
          detail: "A steady food supply keeps every new home thriving.",
        }
    : {
        type: "house",
        label: "Build a cottage",
        detail: "Make room for two more workers at the edge of town.",
      };
  useEffect(() => {
    const syncHiddenSurfaces = () => {
      document
        .querySelectorAll(
          ".game-shell .objectives, .game-shell .advisor-panel, .game-shell .inspector, .game-shell .build-tooltip",
        )
        .forEach((element) => {
          const styles = window.getComputedStyle(element);
          const hidden = styles.visibility === "hidden" || styles.display === "none";
          const focusableSelector =
            'button, input, textarea, select, a, [tabindex]';
          const focusables = [
            ...(element.matches(focusableSelector) ? [element] : []),
            ...element.querySelectorAll(focusableSelector),
          ];
          if (hidden) {
            element.setAttribute("aria-hidden", "true");
            focusables.forEach((focusable) => {
              if (!focusable.hasAttribute("data-previous-tabindex")) {
                focusable.setAttribute(
                  "data-previous-tabindex",
                  focusable.getAttribute("tabindex") ?? "__default__",
                );
              }
              focusable.setAttribute("tabindex", "-1");
            });
          } else {
            element.removeAttribute("aria-hidden");
            focusables.forEach((focusable) => {
              const previous = focusable.getAttribute("data-previous-tabindex");
              if (previous == null) return;
              if (previous === "__default__") focusable.removeAttribute("tabindex");
              else focusable.setAttribute("tabindex", previous);
              focusable.removeAttribute("data-previous-tabindex");
            });
          }
        });
    };
    syncHiddenSurfaces();
    window.addEventListener("resize", syncHiddenSurfaces);
    const shell = document.querySelector(".game-shell");
    const observer = window.ResizeObserver && shell
      ? new ResizeObserver(syncHiddenSurfaces)
      : null;
    observer?.observe(shell);
    return () => {
      window.removeEventListener("resize", syncHiddenSurfaces);
      observer?.disconnect();
    };
  }, [advisorOpen, buildDetailsOpen, detail, menu, modalOpen, selected]);
  const housingFull = state.population >= state.capacity;
  const availableFood = Math.max(
    0,
    Number.isFinite(Number(state.resources.food))
      ? Number(state.resources.food)
      : 0,
  );
  // Wine only earns a header slot once the village presses some, so villages
  // without a vineyard keep the original four-resource layout.
  const showWine =
    (state.resources.wine || 0) > 0 ||
    state.buildings.some((building) => building.type === "vineyard");
  const overviewStats = useMemo(() => {
    if (!overview) return null;
    let completedBuildings = 0;
    let activeJobs = 0;
    let deliveries = 0;
    const activeWorksites = [];
    for (const building of state.buildings) {
      if (building.progress === 1 && building.type !== "grainfield")
        completedBuildings += 1;
      if (building.progress < 1 || building.workers > 0) activeJobs += 1;
      deliveries += building.cycles || 0;
      if (
        activeWorksites.length < 6 &&
        (building.progress < 1 || CATALOG[building.type]?.resource)
      )
        activeWorksites.push(building);
    }
    const workerTypeCounts = state.workers.reduce((counts, worker) => {
      const label = worker.workerTypeLabel || "Builder";
      counts[label] = (counts[label] || 0) + 1;
      return counts;
    }, {});
    const savedPathCount = Number(state.created?.road);
    const pathCount = Number.isFinite(savedPathCount)
      ? Math.max(0, Math.floor(savedPathCount))
      : 0;
    return {
      completedBuildings,
      activeJobs,
      deliveries,
      workerTypeCounts,
      pathCount,
      activeWorksites,
    };
  }, [overview, state.buildings, state.created, state.workers]);
  const completedBuildings = overviewStats?.completedBuildings || 0;
  const activeJobs = overviewStats?.activeJobs || 0;
  const deliveries = overviewStats?.deliveries || 0;
  const workerTypeCounts = overviewStats?.workerTypeCounts || {};
  const pathCount = overviewStats?.pathCount || 0;
  const activeWorksites = overviewStats?.activeWorksites || [];
  const recentActivity = Array.isArray(state.activityLog)
    ? state.activityLog.slice(0, 4)
    : [];
  const period = timeOfDay(state.time);
  // The advisor is optional and closed most of the time. Build its complete
  // snapshot only when a question is submitted instead of mapping every
  // building during each simulation-driven React render.
  const createAdvisorContext = () => ({
    village: state.name,
    day: state.day,
    period,
    population: state.population,
    capacity: state.capacity,
    resources: {
      wood: Math.floor(state.resources.wood || 0),
      stone: Math.floor(state.resources.stone || 0),
      food: Math.floor(state.resources.food || 0),
      wheat: Math.floor(state.resources.wheat || 0),
      wine: Math.floor(state.resources.wine || 0),
    },
    buildings: state.buildings.map((building) => ({
      name: CATALOG[building.type]?.name || building.type,
      type: building.type,
      status: building.status || (building.progress < 1 ? "Building" : "Complete"),
      progress: building.progress,
      workers: building.workers || 0,
      cycles: building.cycles || 0,
    })),
    goals: {
      cottage: builtHouse,
      farm: builtFarm,
      timber: state.gathered >= 100,
    },
    activity: recentActivity,
  });
  const completedGoals = [builtHouse, builtFarm, state.gathered >= 100].filter(
    Boolean,
  ).length;
  const goalProgressPercent = Math.round(
    ((Number(builtHouse) +
      Number(builtFarm) +
      Math.min(state.gathered / 100, 1)) /
      3) *
      100,
  );
  const saveLabel = state.healthCheck
    ? "Performance sample"
    : !loaded
    ? "Loading village"
    : state.saveConflict
    ? "Reload to sync"
    : !state.saveAvailable
    ? "Save unavailable"
    : state.hasSaved
      ? "Saved locally"
      : "Autosave ready";
  const saveTitle = state.healthCheck
    ? "This embedded performance sample uses an in-memory village and never changes your saved village."
    : !loaded
    ? "The village is still loading; save and export actions will be available in a moment."
    : state.saveConflict
    ? "Another browser tab changed this village. Reload to use the latest save."
    : state.saveAvailable
    ? "This village saves automatically in this browser."
    : "Browser storage is unavailable; changes may not persist.";
  useEffect(() => {
    if (!loaded) return;
    if (goalSnapshot.current.ready && allGoals && !goalSnapshot.current.complete) {
      notify(`${state.name} is flourishing. All three goals are complete!`);
    }
    goalSnapshot.current = { ready: true, complete: allGoals };
  }, [allGoals, loaded, state.name]);
  const saveName = (event) => {
    event.preventDefault();
    const next = nameDraft.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!next) {
      notify("Give your village a name.");
      return;
    }
    if (game.current?.storageConflict) {
      setRename(false);
      notify("Reload this tab before changing the village name.");
      return;
    }
    const savedName = game.current?.setName(next);
    if (!savedName) {
      setRename(false);
      notify("Reload this tab before changing the village name.");
      return;
    }
    setRename(false);
    notify(`${savedName} is ready for a new chapter.`);
  };
  const saveVillage = () => {
    if (!loaded || !game.current) {
      notify("The village is still loading. Try saving again in a moment.");
      closeMenu(true);
      return;
    }
    const saved = game.current?.save();
    if (saved) notify("Your village has been saved.");
    else if (game.current?.storageConflict || state.saveConflict)
      notify("This tab is out of date. Reload to use the latest village save.");
    else notify("Browser storage is unavailable. This village cannot be saved.");
    closeMenu(true);
  };
  const downloadVillage = () => {
    if (!loaded || !game.current) {
      notify("The village is still loading. Try exporting again in a moment.");
      closeMenu(true);
      return;
    }
    const serialized = game.current?.exportSave();
    if (!serialized) {
      if (game.current?.storageConflict || state.saveConflict)
        notify("This tab is out of date. Reload to use the latest village save.");
      else if (!state.saveAvailable)
        notify("Browser storage is unavailable. This village cannot be exported.");
      else notify("Save the village before exporting it.");
      closeMenu(true);
      return;
    }
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "village"}-save.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("Village backup downloaded.");
    closeMenu(true);
  };
  const readVillageImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.buildings))
        throw new Error("not a village save");
      setImportPreview({
        raw: parsed,
        summary: {
          name: typeof parsed.name === "string" ? parsed.name : "Unnamed village",
          population: Math.max(0, Math.floor(Number(parsed.population) || 0)),
          buildings: parsed.buildings.filter(
            (building) =>
              building?.type !== "road" && building?.type !== "grainfield",
          ).length,
          paths: Array.isArray(parsed.roads) ? parsed.roads.length : 0,
        },
      });
      setImportOpen(true);
    } catch {
      notify("That file is not a valid village backup.");
    }
  };
  const applyVillageImport = () => {
    if (game.current?.storageConflict) {
      notify("Reload this tab before importing a village backup.");
      return;
    }
    if (!importPreview || !game.current?.importVillage(importPreview.raw)) {
      notify(
        game.current?.storageConflict
          ? "This tab is out of date. Reload to import the village backup."
          : "This village could not be imported.",
      );
      return;
    }
    window.location.reload();
  };
  const askAdvisor = async (question) => {
    const content = question.trim().slice(0, 500);
    if (!content || advisorLoading) return;
    const nextMessages = [
      ...advisorMessages,
      { role: "user", content },
    ].slice(-12);
    setAdvisorMessages(nextMessages);
    setAdvisorInput("");
    setAdvisorError(null);
    setAdvisorLoading(true);
    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, context: createAdvisorContext() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "The advisor is unavailable right now.");
      }
      if (!data.message) throw new Error("The advisor returned an empty answer.");
      setAdvisorMessages((current) =>
        [...current, { role: "assistant", content: data.message }].slice(-12),
      );
    } catch (requestError) {
      // Keep an unavailable advisor easy to retry without making the player
      // reconstruct the question they just submitted.
      setAdvisorInput(content);
      setAdvisorError(requestError.message || "The advisor is unavailable right now.");
    } finally {
      setAdvisorLoading(false);
      requestAnimationFrame(() => advisorInputRef.current?.focus());
    }
  };
  const closeAdvisor = () => {
    setAdvisorOpen(false);
    requestAnimationFrame(() => advisorButtonRef.current?.focus());
  };
  const toggleAdvisor = () => {
    if (advisorOpen) {
      closeAdvisor();
      return;
    }
    setAdvisorOpen(true);
    closeDetail();
    closeMenu();
  };
  useEffect(() => {
    if (!detail || selected) return;
    requestAnimationFrame(() => inspectorCloseRef.current?.focus());
  }, [detail, selected]);
  useEffect(() => {
    if (!advisorOpen) return;
    requestAnimationFrame(() => advisorInputRef.current?.focus());
  }, [advisorOpen]);
  useEffect(() => {
    if (!advisorOpen || !advisorMessagesRef.current) return;
    advisorMessagesRef.current.scrollTo({
      top: advisorMessagesRef.current.scrollHeight,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
        ? "auto"
        : "smooth",
    });
  }, [advisorMessages, advisorLoading, advisorOpen]);
  const DayIcon = period === "Night" ? Moon : Sun;
  return (
    <main
      className={`game-shell ${goals ? "goals-open" : ""}`}
      aria-busy={!loaded && !error}
    >
      <div
        ref={worldRef}
        className={`world ${selected ? "is-building" : ""}`}
        aria-label="Interactive 3D village. Drag to pan, scroll or pinch to zoom, and use right-drag or two fingers to orbit."
      />
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Leaf size={30} strokeWidth={1.35} />
          </div>
          <div>
            <h1>
              Hearth <span>&</span> Hamlet
            </h1>
            <p>A LITTLE WORLD OF YOUR OWN</p>
          </div>
        </div>
        <div className="resources">
          <Resource type="wood" value={state.resources.wood} trend={state.trends.wood} storage={state.storage?.wood} />
          <Resource type="stone" value={state.resources.stone} trend={state.trends.stone} storage={state.storage?.stone} />
          <Resource type="wheat" value={state.resources.wheat} trend={state.trends.wheat} storage={state.storage?.wheat} />
          <Resource type="food" value={state.resources.food} trend={state.trends.food} storage={state.storage?.food} />
          {showWine && (
            <Resource type="wine" value={state.resources.wine} trend={state.trends.wine} storage={state.storage?.wine} />
          )}
          <div
            className={`resource population ${housingFull ? "at-capacity" : ""}`}
            title={`Villagers / housing capacity. Simulation limit: 24 villagers. ${Math.max(0, state.capacity - state.population)} housing spaces available.`}
            aria-label={`${state.population} villagers, ${state.capacity} housing capacity, simulation limit 24`}
          >
            <span className="resource-icon">
              <Users size={23} strokeWidth={1.7} />
            </span>
            <div>
              <small>villagers</small>
              <strong>
                <span className="resource-value" key={state.population}>
                  {formatCount(state.population)}
                </span>
                <em> / {formatCount(state.capacity)}</em>
              </strong>
            </div>
          </div>
        </div>
        <div className="day">
          <DayIcon
            className={`day-icon ${period.toLowerCase()}`}
            size={27}
            strokeWidth={1.5}
          />
          <div>
            <strong>Day {state.day}</strong>
            <small>
              <span className="day-period">{period}</span>
            </small>
          </div>
        </div>
        <button
          type="button"
          ref={menuButtonRef}
          className={`icon-button menu-button ${menu ? "open" : ""}`}
          aria-label={menu ? "Close village menu" : "Open village menu"}
          aria-controls={menu ? "village-menu" : undefined}
          aria-expanded={menu}
          aria-haspopup="menu"
          onClick={() => {
            if (menuStateRef.current) {
              closeMenu(true);
            } else {
              menuStateRef.current = true;
              setMenu(true);
            }
          }}
        >
          <ChevronDown size={19} />
        </button>
      </header>
      <section className="left-stack">
        <div className="village-label">
          <span className="live-dot" /> {state.name.toUpperCase()}{" "}
          <span className="label-line" />
        </div>
        {goals && (
          <div className={`objectives parchment ${allGoals ? "complete" : ""}`}>
            <button
              type="button"
              ref={goalsButtonRef}
              className="objective-heading"
              aria-controls="settlement-goals"
              aria-expanded={goals}
              onClick={() => setGoals(!goals)}
            >
              <span>
                <Leaf size={17} /> A place to call home
              </span>
              <ChevronDown size={16} className={goals ? "" : "collapsed"} />
            </button>
            <div id="settlement-goals">
              <p>
                {allGoals
                  ? "Your little hamlet is flourishing. All three goals are complete."
                  : "Every great village starts with a few small things."}
              </p>
              {nextGoal && (
                <div className="goal-next">
                  <span className="goal-next-kicker">NEXT CHAPTER</span>
                  <strong>{nextGoal.label}</strong>
                  <span>{nextGoal.detail}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      choose(nextGoal.type, event.currentTarget);
                    }}
                  >
                    Plan it <ArrowUpRight size={12} />
                  </button>
                </div>
              )}
              <div className={`goal ${builtHouse ? "done" : ""}`}>
                <span className="checkbox">
                  {builtHouse && <Check size={12} />}
                </span>
                <span>Build a cottage</span>
                <span className="goal-count">{builtHouse ? "1" : "0"}/1</span>
              </div>
              <div className={`goal ${builtFarm ? "done" : ""}`}>
                <span className="checkbox">
                  {builtFarm && <Check size={12} />}
                </span>
                <span>Establish a farm</span>
                <span className="goal-count">{builtFarm ? "1" : "0"}/1</span>
              </div>
              <div className={`goal ${state.gathered >= 100 ? "done" : ""}`}>
                <span className="checkbox">
                  {state.gathered >= 100 && <Check size={12} />}
                </span>
                <span>Gather timber</span>
                <span className="goal-count">
                  {formatCount(Math.min(state.gathered, 100))}/100
                </span>
              </div>
              <div
                className="goal-progress"
                role="progressbar"
                aria-label="Settlement goal progress"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={goalProgressPercent}
                aria-valuetext={`${goalProgressPercent}% complete`}
              >
                <i
                  style={{ width: `${goalProgressPercent}%` }}
                />
              </div>
              <div className="objective-footer">
                <span>GROW AT YOUR OWN PACE</span>
                <Wheat size={15} />
              </div>
              {allGoals && state.chapterGoals.length > 0 && (
                <div className="chapter-mini">
                  <strong>Next chapters unlocked</strong>
                  {state.chapterGoals.map((goal) => (
                    <span className={goal.completed ? "done" : ""} key={goal.id}>
                      {goal.completed ? <Check size={11} /> : <i />}{goal.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
      <div className="top-right">
        <div
          className="time-controls parchment"
          role="group"
          aria-label="Simulation speed controls"
        >
          <button
            type="button"
            className={`pause-button ${state.speed === 0 ? "active" : ""}`}
            aria-label={state.speed === 0 ? "Resume simulation" : "Pause simulation"}
            aria-keyshortcuts="Space"
            aria-pressed={state.speed === 0}
            title={state.speed === 0 ? "Resume simulation" : "Pause simulation"}
            onClick={() => speed(state.speed === 0 ? previousSpeed.current : 0)}
            onKeyDown={(event) => {
              if (event.code !== "Space") return;
              event.preventDefault();
              speed(state.speed === 0 ? previousSpeed.current : 0);
            }}
          >
            {state.speed === 0 ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            type="button"
            className={state.speed === 1 ? "active" : ""}
            aria-label="Set simulation speed to 1x"
            aria-pressed={state.speed === 1}
            title="Set simulation speed to 1×"
            onClick={() => speed(1)}
          >
            1×
          </button>
          <button
            type="button"
            className={state.speed === 2 ? "active" : ""}
            aria-label="Set simulation speed to 2x"
            aria-pressed={state.speed === 2}
            title="Set simulation speed to 2×"
            onClick={() => speed(2)}
          >
            2×
          </button>
          <button
            type="button"
            className={state.speed === 4 ? "active" : ""}
            aria-label="Set simulation speed to 4x"
            aria-pressed={state.speed === 4}
            title="Set simulation speed to 4×"
            onClick={() => speed(4)}
          >
            4×
          </button>
        </div>
        <div className="season-caption">
          <span className="live-dot" />{" "}
          {state.speed === 0 ? "PAUSED" : "VILLAGE LIFE"}
        </div>
        {state.feast && (
          <div className="feast-pill parchment" role="status">
            <Sparkles size={14} /> Feast · {Math.ceil(state.feast.remaining)}s
          </div>
        )}
        <button
          type="button"
          ref={advisorButtonRef}
          className={`advisor-launch parchment ${advisorOpen ? "active" : ""}`}
          aria-label={advisorOpen ? "Close village advisor" : "Open village advisor"}
          title={advisorOpen ? "Close village advisor" : "Open village advisor"}
          aria-controls={advisorOpen ? "village-advisor" : undefined}
          aria-expanded={advisorOpen}
          onClick={toggleAdvisor}
        >
          <MessageCircle size={15} />
          <span>Village advisor</span>
        </button>
      </div>
      {advisorOpen && (
        <aside
          id="village-advisor"
          className="advisor-panel parchment"
          role="dialog"
          aria-modal="false"
          aria-label="Village advisor"
        >
          <div className="advisor-heading">
            <div>
              <span className="advisor-kicker">
                <MessageCircle size={13} /> VILLAGE ADVISOR
              </span>
              <h2>A second pair of eyes.</h2>
            </div>
            <button
              type="button"
              className="bare"
              onClick={closeAdvisor}
              aria-label="Close village advisor"
            >
              <X size={17} />
            </button>
          </div>
          <p className="advisor-intro">
            Ask about your resources, workers, goals, or what to build next.
          </p>
          <div
            ref={advisorMessagesRef}
            className="advisor-messages"
            aria-live="polite"
            aria-label="Advisor conversation"
          >
            {advisorMessages.map((message, index) => (
              <div
                className={`advisor-message ${message.role}`}
                key={`${message.role}-${index}`}
              >
                <span>{message.role === "assistant" ? "KEEPER" : "YOU"}</span>
                <p><AdvisorContent content={message.content} /></p>
              </div>
            ))}
            {advisorLoading && (
              <div className="advisor-message assistant advisor-thinking">
                <span>KEEPER</span>
                <p><i /><i /><i /> Reading the village…</p>
              </div>
            )}
          </div>
          {advisorError && (
            <div className="advisor-error" role="alert">
              {advisorError}
            </div>
          )}
          {advisorMessages.length === 1 && !advisorLoading && (
            <div className="advisor-prompts" aria-label="Suggested questions">
              <button type="button" onClick={() => askAdvisor("What should I build next?")}>
                What should I build next?
              </button>
              <button type="button" onClick={() => askAdvisor("Why are my workers waiting?")}>
                Why are workers waiting?
              </button>
            </div>
          )}
          <form
            className="advisor-form"
            onSubmit={(event) => {
              event.preventDefault();
              askAdvisor(advisorInput);
            }}
          >
            <textarea
              ref={advisorInputRef}
              value={advisorInput}
              rows={2}
              maxLength={500}
              placeholder="Ask your question…"
              aria-label="Ask the village advisor"
              disabled={advisorLoading}
              onChange={(event) => setAdvisorInput(event.target.value)}
            />
            <button
              className="advisor-send"
              type="submit"
              disabled={advisorLoading || !advisorInput.trim()}
              aria-label="Send question"
            >
              <Send size={16} />
            </button>
          </form>
          <div className="advisor-note">Powered by OpenRouter · village state stays in this browser</div>
        </aside>
      )}
      {detail && !selected && (
        <aside
          className="inspector parchment"
          role="dialog"
          aria-modal="false"
          aria-labelledby="inspector-title"
        >
          <div className="inspector-top">
            <span>IN YOUR VILLAGE</span>
            <button
              type="button"
              ref={inspectorCloseRef}
              className="bare"
              onClick={() => closeDetail(true)}
              aria-label="Close building details"
            >
              <X size={17} />
            </button>
          </div>
          {detail.type === "worker" ? (
            <div className="worker-portrait" aria-hidden="true">
              <Users size={42} strokeWidth={1.15} />
              <span>AT WORK IN {state.name.toUpperCase()}</span>
            </div>
          ) : (
            thumbs[detail.type] && <img src={thumbs[detail.type]} alt="" />
          )}
          <h3 id="inspector-title">
            {detail.type === "worker"
              ? inspectedWorker?.workerTypeLabel || detail.name
              : detail.name}
          </h3>
          {detail.type === "worker" && (
            <p>
              {inspectedWorker
                ? inspectedWorker.buildingType
                  ? `${inspectedWorkerStatus} at ${CATALOG[inspectedWorker.buildingType]?.name || "the village"}.`
                  : `${inspectedWorker.workerTypeLabel || "Builder"} is ready for the next structure.`
                : "This villager is no longer in the settlement."}
            </p>
          )}
          <div className="effect">
            <Leaf size={15} />
            {detail.type === "worker"
              ? inspectedWorker?.carry
                ? `Carrying ${inspectedWorker.carry.amount} ${inspectedWorker.carry.product || inspectedWorker.carry.resource}`
                : inspectedWorker?.buildingType
                  ? `Assigned to ${CATALOG[inspectedWorker.buildingType]?.name || "the village"}`
                  : "Automatically assigned as a builder"
              : detail.effect}
          </div>
          {detail.type !== "worker" &&
            inspected?.progress < 1 &&
            !inspected?.materialsReady && (
            <div
              className="inspector-progress"
              role="progressbar"
              aria-label="Material delivery progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.floor((inspectedMaterialProgress || 0) * 100)}
              aria-valuetext={`${Math.floor((inspectedMaterialProgress || 0) * 100)}% of materials delivered`}
              title="Materials delivered to this construction site"
            >
              <span style={{ width: `${Math.floor((inspectedMaterialProgress || 0) * 100)}%` }} />
            </div>
          )}
          {detail.type !== "worker" &&
            inspected?.progress < 1 &&
            inspected?.materialsReady && (
            <div
              className="inspector-progress"
              role="progressbar"
              aria-label="Construction progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.floor(inspected.progress * 100)}
              aria-valuetext={`${Math.floor(inspected.progress * 100)}% built`}
            >
              <span style={{ width: `${Math.floor(inspected.progress * 100)}%` }} />
            </div>
          )}
          {detail.type === "worker" && inspectedWorker?.workProgress != null && (
            <div
              className="inspector-progress"
              role="progressbar"
              aria-label="Work cycle progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(inspectedWorker.workProgress * 100)}
              aria-valuetext={`${Math.round(inspectedWorker.workProgress * 100)}% of current work cycle`}
            >
              <span
                style={{ width: `${Math.round(inspectedWorker.workProgress * 100)}%` }}
              />
            </div>
          )}
          {detail.type === "worker" && inspectedWorker && (
            <div
              className="inspector-progress hunger-progress"
              role="progressbar"
              aria-label="Hunger level"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round((inspectedWorker.hunger || 0) * 100)}
              aria-valuetext={`${Math.round((inspectedWorker.hunger || 0) * 100)}% hungry`}
            >
              <span
                style={{ width: `${Math.round((inspectedWorker.hunger || 0) * 100)}%` }}
              />
            </div>
          )}
          {detail.type !== "worker" && inspectedCycleProgress != null && (
            <div
              className="inspector-progress"
              role="progressbar"
              aria-label={detail.type === "grainfield" ? "Grain growth progress" : "Production cycle progress"}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(inspectedCycleProgress * 100)}
              aria-valuetext={`${Math.round(inspectedCycleProgress * 100)}% of ${detail.type === "grainfield" ? "grain growth" : "current production cycle"}`}
            >
              <span
                style={{ width: `${Math.round(inspectedCycleProgress * 100)}%` }}
              />
            </div>
          )}
          <div className="detail-stats">
            <span
              className={`inspector-state ${(detail.type === "worker" ? inspectedWorkerStatus : inspected?.status || "complete").toLowerCase().replaceAll(" ", "-")}`}
            >
              Status
              <strong>
                {detail.type === "worker"
                  ? inspectedWorkerStatus
                  : inspected?.status || "Complete"}
              </strong>
            </span>
            {detail.type === "worker" ? (
              <>
                <span>
                  Worker type
                  <strong>{inspectedWorker?.workerTypeLabel || "Builder"}</strong>
                </span>
                <span>
                  Current task
                <strong>
                  {inspectedWorker?.buildingType
                    ? CATALOG[inspectedWorker.buildingType]?.name || "Village work"
                    : inspectedWorker?.workerTypeLabel === "Builder"
                      ? "Construction pool"
                      : "Unassigned"}
                </strong>
                </span>
                <span>
                  Hunger
                  <strong>{Math.round((inspectedWorker?.hunger || 0) * 100)}%</strong>
                </span>
              </>
            ) : (
              <span>
                Assigned workers<strong>{inspected?.workers || 0}</strong>
              </span>
            )}
            {detail.type !== "worker" &&
              inspected?.progress < 1 &&
              !inspected?.materialsReady && (
                <span>
                  Site materials
                  <strong>
                    {Object.entries(CATALOG[detail.type]?.cost || {})
                      .map(([resource, required]) =>
                        `${Math.floor(inspected?.materials?.[resource] || 0)}/${required} ${resource}`,
                      )
                      .join(" · ")}
                  </strong>
                </span>
              )}
            {detail.type === "worker" && inspectedWorker?.workRemaining != null && (
              <span>
                Next delivery<strong>~{inspectedWorker.workRemaining}s</strong>
              </span>
            )}
            {detail.type !== "worker" && inspectedNextDelivery != null && (
              <span>
                {detail.type === "grainfield" ? "Fully grown" : "Next delivery"}
                <strong>{inspectedNextDelivery > 0 ? `~${inspectedNextDelivery}s` : "Ready"}</strong>
              </span>
            )}
            {inspectedRemaining && (
              <span>
                Estimated time<strong>~{inspectedRemaining}s</strong>
              </span>
            )}
            {detail.type !== "worker" && CATALOG[detail.type]?.resource && (
              <span>
                Deliveries<strong>{inspected?.cycles || 0}</strong>
              </span>
            )}
            {detail.type !== "worker" && inspected?.stockCap > 0 && (
              <span
                title="Finished goods waiting here. Production stops when this is full until a carrier collects them."
              >
                Waiting for a carrier
                <strong>
                  {inspected.stock || 0} / {inspected.stockCap}
                </strong>
              </span>
            )}
            {detail.type !== "worker" && inspected?.villageStorage > 0 && (
              <span title="Storage this building adds to the village total.">
                Storage<strong>+{inspected.storage}</strong>
              </span>
            )}
            {detail.type !== "worker" && detail.type === "inn" && (
              <>
                <span>
                  Bread in pantry
                  <strong>
                    {inspected?.breadStock || 0}
                    {inspected?.breadCap ? ` / ${inspected.breadCap}` : ""}
                  </strong>
                </span>
                <span>
                  Meals served<strong>{inspected?.cycles || 0}</strong>
                </span>
              </>
            )}
          </div>
          {detail.type === "school" && inspected?.training && (
            <div className="training-panel" aria-label="School training">
              <span className="inspector-action-label">
                <GraduationCap size={13} aria-hidden="true" /> Train a villager
              </span>
              <p className="training-housing">
                {state.population}/{state.capacity} villagers housed
                {state.capacity - state.population > 0
                  ? ` · room for ${state.capacity - state.population} more`
                  : " · build a cottage for more room"}
              </p>
              {inspected.trainingSession && (
                <div className="training-session" role="status" aria-live="polite">
                  <div className="training-session-line">
                    <span>
                      {inspected.trainingSession.waiting
                        ? `${inspected.trainingSession.label} needs housing`
                        : `Training a ${inspected.trainingSession.label.toLowerCase()}`}
                    </span>
                    <strong>
                      {inspected.trainingSession.waiting
                        ? "On hold"
                        : `~${inspected.trainingSession.remaining}s`}
                    </strong>
                  </div>
                  <div className="training-bar" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.round(inspected.trainingSession.progress * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="training-options">
                {inspected.training.map((option) => {
                  const busy = Boolean(inspected.trainingSession);
                  const counts =
                    option.posts === null
                      ? "any"
                      : `${option.trained + option.pending}/${option.posts}`;
                  const blocked = busy
                    ? "The School is already training someone"
                    : option.reason;
                  return (
                    <button
                      type="button"
                      key={option.type}
                      className="training-option"
                      disabled={busy || !option.canTrain}
                      title={
                        blocked ||
                        `Train a ${option.label.toLowerCase()} · ${counts} posts filled`
                      }
                      aria-label={
                        blocked
                          ? `Cannot train a ${option.label.toLowerCase()}. ${blocked}.`
                          : `Train a ${option.label.toLowerCase()}. ${counts} posts filled. Takes ${CATALOG.school.trainSeconds} seconds.`
                      }
                      onClick={() => game.current?.trainWorker(inspected.id, option.type)}
                    >
                      <span className="training-role">{option.label}</span>
                      <em className="training-count">{counts}</em>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {detail.type !== "worker" && inspected && (
            <div className="inspector-actions" aria-label="Building controls">
              {detail.type !== "townhall" &&
                detail.type !== "grainfield" &&
                (inspected.progress < 1 || CATALOG[detail.type]?.resource) && (
                  <button
                    type="button"
                    className={`inspector-control priority ${
                      inspected.priority === "priority" ? "active" : ""
                    }`}
                    aria-pressed={inspected.priority === "priority"}
                    aria-label={
                      inspected.priority === "priority"
                        ? `Use normal priority for ${CATALOG[detail.type]?.name || "building"}`
                        : `Prioritize ${CATALOG[detail.type]?.name || "building"}`
                    }
                    title={
                      inspected.priority === "priority"
                        ? "Return this building to normal worker priority."
                        : "Give this building priority when workers choose their next job."
                    }
                    onClick={() =>
                      game.current?.setPriority(
                        inspected.id,
                        inspected.priority === "priority" ? "normal" : "priority",
                      )
                    }
                  >
                    <ArrowUp size={14} />
                    {inspected.priority === "priority"
                      ? "Use normal priority"
                      : "Prioritize building"}
                  </button>
                )}
              {detail.type !== "townhall" && detail.type !== "grainfield" && (
                <button
                  type="button"
                  className="inspector-control"
                  onClick={() => game.current?.setPaused(inspected.id, !inspected.paused)}
                  aria-label={`${inspected.paused ? "Resume" : "Pause"} ${CATALOG[detail.type]?.name || "building"}`}
                >
                  {inspected.paused ? <Play size={14} /> : <Pause size={14} />}
                  {inspected.paused ? "Resume building" : "Pause building"}
                </button>
              )}
              {inspected.progress < 1 && (
                <button
                  type="button"
                  className="inspector-control danger"
                  onClick={() => {
                    if (game.current?.removeBuilding(inspected.id)) closeDetail();
                  }}
                >
                  <X size={14} /> Cancel construction
                </button>
              )}
              {detail.type === "grainfield" && (
                <button
                  type="button"
                  className="inspector-control danger"
                  onClick={() => {
                    if (game.current?.removeBuilding(inspected.id)) closeDetail();
                  }}
                >
                  <X size={14} /> Clear grain field
                </button>
              )}
              {inspected.progress === 1 && CATALOG[detail.type]?.upgrade && !inspected.upgrade && (
                <button
                  type="button"
                  className="inspector-control upgrade"
                  title={`Upgrade ${CATALOG[detail.type].name} with ${CATALOG[detail.type].upgrade.name}. Costs ${Object.entries(CATALOG[detail.type].upgrade.cost).map(([resource, amount]) => `${amount} ${resource}`).join(" · ")}.`}
                  aria-label={`Upgrade ${CATALOG[detail.type].name} with ${CATALOG[detail.type].upgrade.name}. Costs ${Object.entries(CATALOG[detail.type].upgrade.cost).map(([resource, amount]) => `${amount} ${resource}`).join(" and ")}`}
                  onClick={() => game.current?.upgradeBuilding(inspected.id)}
                >
                  <Sparkles size={14} /> Upgrade · {CATALOG[detail.type].upgrade.name}
                </button>
              )}
              {inspected.upgrade && <span className="upgrade-note"><Sparkles size={13} /> {inspected.upgrade}</span>}
            </div>
          )}
        </aside>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      <div className="bottom-left">
        <button
          type="button"
          className="compass"
          onClick={() => game.current?.home()}
          title="Return to village center"
          aria-label="Center camera"
        >
          <span>N</span>
          <Compass size={38} strokeWidth={1} />
        </button>
      </div>
      <div className={`build-area ${paletteOpen ? "palette-open" : "palette-collapsed"}`}>
        {active && (
          <div
            id="build-details"
            className={`build-tooltip parchment ${buildDetailsOpen ? "is-open" : ""}`}
          >
            <div>
              <span className="tooltip-category">
                {pathRemoval
                  ? "REVISE YOUR LAYOUT"
                  : selected
                    ? "PLAN YOUR NEXT BUILDING"
                    : "GROW YOUR VILLAGE"}
              </span>
              <h3>{active.name}</h3>
              <span className="effect">
                <Leaf size={14} />
                {activeEffect}
              </span>
            </div>
            <div className="tooltip-cost">
              {pathRemoval ? (
                <>
                  <span>RECOVERED</span>
                  <strong className="recovery-note">1 stone per path tile</strong>
                  <small>Click a player-laid path to clear it.</small>
                </>
              ) : (
                <>
                  <span>BUILD COST</span>
                  {Object.entries(active.cost).map(([r, n]) => {
                    const Icon = resourceIcons[r];
                    const owned = Math.floor(state.resources[r] || 0);
                    const shortfall = Math.max(0, n - owned);
                    return (
                      <div
                        key={r}
                        className={shortfall ? "unaffordable" : ""}
                        title={
                          shortfall
                            ? `Need ${shortfall} more ${r}`
                            : `${n} ${r} ready`
                        }
                      >
                        <Icon size={16} />
                        <strong>{n}</strong>
                        <span>{r}</span>
                        {shortfall > 0 && (
                          <small className="cost-gap">need {shortfall} more</small>
                        )}
                      </div>
                    );
                  })}
                  <small>
                    {active.seconds
                      ? `${active.seconds}s construction`
                      : "Placed instantly"}
                  </small>
                </>
              )}
            </div>
          </div>
        )}
        {selected ? (
          <div
            className={`placement-hint ${state.placement?.ok === false ? "invalid" : ""}`}
            aria-live="polite"
            aria-atomic="true"
          >
            <MousePointer2 size={14} />
            <span>{placementHint}</span>
            <button
              className="placement-details-toggle"
              type="button"
              aria-expanded={buildDetailsOpen}
              aria-controls="build-details"
              onClick={() => setBuildDetailsOpen((open) => !open)}
            >
              <Info size={13} />
              <span>{buildDetailsOpen ? "Hide details" : "Details"}</span>
            </button>
            {!tileMode && (
            <button
              type="button"
              aria-label="Rotate building"
                onClick={() => game.current?.rotate()}
                title="Rotate building (R)"
              >
                <RotateCw size={14} />
                <kbd>R</kbd>
              </button>
            )}
            {!tileMode && (
              <button
                type="button"
                className="placement-confirm"
                aria-label="Confirm placement"
                onClick={() => {
                  if (game.current?.confirmPlacement()) {
                    cancel();
                  }
                }}
              >
                <Check size={14} /> <span>Place</span> <kbd>ENTER</kbd>
              </button>
            )}
            <button
              type="button"
              aria-label={tileMode ? "Cancel tile tool" : "Cancel building placement"}
              onClick={cancel}
            >
              <X size={14} />
              <kbd>ESC</kbd>
            </button>
          </div>
        ) : (
          <div className="build-title">
            <span />
            <Hammer size={14} />
            <button
              type="button"
              className="palette-toggle"
              aria-expanded={paletteOpen}
              aria-controls="building-palette"
              aria-label={paletteOpen ? "Collapse building menu" : "Expand building menu"}
              title={paletteOpen ? "Collapse building menu" : "Expand building menu"}
              onClick={() => setPaletteOpen((open) => !open)}
            >
              <span>MAKE YOURSELF AT HOME</span>
              <ChevronDown size={13} aria-hidden="true" />
            </button>
            <span />
          </div>
        )}
        <BuildPalette
          resources={state.resources}
          thumbs={thumbs}
          selected={selected}
          paletteOpen={paletteOpen}
          loaded={loaded}
          error={error}
          onChoose={choose}
          onHover={setHover}
        />
        <div className="bottom-caption">
          <span>
            <MousePointer2 size={11} /> Drag to explore
          </span>
          <i>·</i>
          <span>
            <span className="mouse-hint">Scroll to zoom</span>
            <span className="touch-hint">Pinch to zoom</span>
          </span>
          <i>·</i>
          <span>
            <span className="mouse-hint">Right-drag to orbit</span>
            <span className="touch-hint">Two-finger orbit</span>
          </span>
          {state.saveConflict ? (
            <button
              type="button"
              className="autosave unavailable conflict"
              title={saveTitle}
              aria-label="Reload to sync the latest village save"
              onClick={() => window.location.reload()}
            >
              <span className="live-dot" /> {saveLabel}
            </button>
          ) : (
            <span
              className={`autosave ${state.saveAvailable || state.healthCheck ? "" : "unavailable"}`}
              title={saveTitle}
            >
              <span className="live-dot" /> {saveLabel}
            </span>
          )}
        </div>
      </div>
      <div className="bottom-right">
        <button
          type="button"
          className={`icon-button parchment ${grid ? "active" : ""}`}
          aria-keyshortcuts="G"
          aria-pressed={grid}
          onClick={() => {
            if (!game.current) return;
            game.current.grid.visible = !game.current.grid.visible;
            setGrid(game.current.grid.visible);
          }}
          title="Toggle grid (G)"
          aria-label="Toggle building grid"
        >
          <Grid2X2 size={19} />
        </button>
        <div className="zoom-controls parchment">
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => game.current?.zoom(0.15)}
          >
            <Plus size={20} />
          </button>
          <span />
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => game.current?.zoom(-0.15)}
          >
            <Minus size={20} />
          </button>
        </div>
      </div>
      {menu && (
        <div
          ref={menuRef}
          id="village-menu"
          className="menu parchment"
          role="menu"
          aria-label="Village menu"
          onKeyDown={menuKeyDown}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget;
            if (
              nextTarget &&
              !menuRef.current?.contains(nextTarget) &&
              !menuButtonRef.current?.contains(nextTarget)
            ) {
              closeMenu();
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={saveVillage}
          >
            <Save size={16} />
            Save village
          </button>
          <button type="button" role="menuitem" onClick={downloadVillage}>
            <FileDown size={16} />
            Export village backup
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              importFileRef.current?.click();
              closeMenu();
            }}
          >
            <FileUp size={16} />
            Import village backup
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openModal(setOverview, menuButtonRef.current);
              closeMenu();
            }}
          >
            <BarChart3 size={16} />
            Village overview
          </button>
          <a role="menuitem" href="/health-check" target="_blank" rel="noreferrer">
            <Gauge size={16} />
            Performance health check
          </a>
          <button type="button" role="menuitem" onClick={showGoals}>
            <Leaf size={16} />
            A place to call home
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setNameDraft(state.name);
              openModal(setRename, menuButtonRef.current);
              closeMenu();
            }}
          >
            <House size={16} />
            Name your village
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openModal(setHelp, menuButtonRef.current);
              closeMenu();
            }}
          >
            <HelpCircle size={16} />
            How to play
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openModal(setReset, menuButtonRef.current);
              closeMenu();
            }}
          >
            <RotateCw size={16} />
            Start a new village
          </button>
        </div>
      )}
      <input
        ref={importFileRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        tabIndex={-1}
        onChange={readVillageImport}
        aria-label="Choose a village backup file"
      />
      {modalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setHelp(false);
            setReset(false);
            setRename(false);
            setOverview(false);
            setImportOpen(false);
            setImportPreview(null);
          }}
        >
          <section
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              importOpen
                ? "Import village"
                : rename
                ? "Name your village"
                : overview
                  ? "Village overview"
                  : reset
                    ? "Start a new village"
                    : "How to play"
            }
            className="modal parchment"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close bare"
              data-modal-autofocus={overview || help ? true : undefined}
              aria-label="Close dialog"
              onClick={() => {
                setHelp(false);
                setReset(false);
                setRename(false);
                setOverview(false);
                setImportOpen(false);
                setImportPreview(null);
              }}
            >
              <X size={20} />
            </button>
            <Leaf size={30} className="modal-leaf" />
            {importOpen ? (
              <>
                <span className="overview-kicker">BACKUP RESTORE</span>
                <h2>Bring a village home.</h2>
                <p>
                  Review this backup before replacing the current village. A copy of
                  your current save will be kept in this browser first.
                </p>
                {importPreview ? (
                  <div className="import-preview">
                    <div><span>Village</span><strong>{importPreview.summary.name}</strong></div>
                    <div><span>Villagers</span><strong>{importPreview.summary.population} · {importPreview.summary.buildings} buildings</strong></div>
                    <div><span>Paths</span><strong>{importPreview.summary.paths}</strong></div>
                  </div>
                ) : (
                  <p className="help-note">Choose a .json village backup to continue.</p>
                )}
                <div className="modal-actions">
                  <button type="button" data-modal-autofocus onClick={() => { setImportOpen(false); setImportPreview(null); }}>Keep current</button>
                  <button type="button" className="primary" disabled={!importPreview} onClick={applyVillageImport}>
                    <FileUp size={15} /> Replace with backup
                  </button>
                </div>
              </>
            ) : overview ? (
              <>
                <span className="overview-kicker">AT A GLANCE</span>
                <h2>{state.name}, in motion.</h2>
                <p>
                  A quick read on the people, work, and milestones shaping your
                  settlement right now.
                </p>
                <div className="overview-grid">
                  <div className="overview-stat">
                    <Users size={18} />
                    <strong>
                      {formatCount(state.population)}<small> / {formatCount(state.capacity)}</small>
                    </strong>
                    <span>Villagers</span>
                  </div>
                  <div className="overview-stat">
                    <House size={18} />
                    <strong>{formatCount(completedBuildings)}</strong>
                    <span>Structures</span>
                  </div>
                  <div className="overview-stat">
                    <Hammer size={18} />
                    <strong>{formatCount(activeJobs)}</strong>
                    <span>Active jobs</span>
                  </div>
                  <div className="overview-stat">
                    <Wheat size={18} />
                    <strong>{formatCount(deliveries)}</strong>
                    <span>Deliveries</span>
                  </div>
                  <div className="overview-stat">
                    <Route size={18} />
                    <strong>{formatCount(pathCount)}</strong>
                    <span>Built paths</span>
                  </div>
                </div>
                <div className="economy-strip" aria-label="Resource trends">
                  <div><span>Wood / min</span><strong className={state.trends.wood < 0 ? "negative" : ""}>{state.trends.wood > 0 ? "+" : ""}{state.trends.wood || 0}</strong></div>
                  <div><span>Stone / min</span><strong className={state.trends.stone < 0 ? "negative" : ""}>{state.trends.stone > 0 ? "+" : ""}{state.trends.stone || 0}</strong></div>
                  <div><span>Food / min</span><strong className={state.trends.food < 0 ? "negative" : ""}>{state.trends.food > 0 ? "+" : ""}{state.trends.food || 0}</strong></div>
                  <div><span>In transit</span><strong>{formatCount(state.inTransit)}</strong></div>
                  <div><span>Blocked sites</span><strong className={state.blockedSites ? "negative" : ""}>{formatCount(state.blockedSites)}</strong></div>
                </div>
                <div className="workforce-strip" aria-label="Worker types">
                  <span className="workforce-heading">Workforce</span>
                  {workerTypeOrder.map((type) => (
                    <span key={type} className={`workforce-type ${type.toLowerCase()}`}>
                      <i /> {type} <strong>{workerTypeCounts[type] || 0}</strong>
                    </span>
                  ))}
                </div>
                <div className="feast-panel">
                  <div>
                    <span className="overview-kicker"><Sparkles size={13} /> OPTIONAL SPENDING</span>
                    <strong>Village feast</strong>
                    <p>Spend 30 food for 45 seconds of 25% faster construction.</p>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    disabled={Boolean(state.feast) || availableFood < 30}
                    title={state.feast ? "A village feast is already underway." : availableFood < 30 ? "Need 30 food to start a feast." : "Start a 45-second construction feast."}
                    aria-label={state.feast ? `Village feast active, ${Math.ceil(state.feast.remaining)} seconds left` : availableFood < 30 ? "Village feast unavailable: need 30 food" : "Start village feast for 30 food"}
                    onClick={() => game.current?.startFeast()}
                  >
                    {state.feast ? `${Math.ceil(state.feast.remaining)}s left` : "Start · 30 food"}
                  </button>
                </div>
                {allGoals && state.chapterGoals.length > 0 && (
                  <div className="chapter-goals" aria-label="Chapter goals">
                    <div className="overview-activity-heading"><span>What comes next</span><small>REWARDS</small></div>
                    {state.chapterGoals.map((goal) => (
                      <div className={`chapter-goal ${goal.completed ? "done" : ""}`} key={goal.id}>
                        <div><strong>{goal.title}</strong><span>{goal.description}</span></div>
                        <em>{goal.progress}/{goal.target} · {goal.reward}</em>
                      </div>
                    ))}
                  </div>
                )}
                <div className="overview-sites" aria-label="Focus a building or villager">
                  <div className="overview-activity-heading"><span>Focus a worksite</span><small>KEYBOARD READY</small></div>
                  <div className="focus-list">
                    {activeWorksites.map((building) => (
                      <button
                        type="button"
                        key={building.id}
                        aria-label={"Focus " + (CATALOG[building.type]?.name || building.type) + " worksite. Status: " + (building.status || "Complete")}
                        onClick={() => { setOverview(false); game.current?.focusBuilding(building.id); }}
                      >
                        <span>{CATALOG[building.type]?.name || building.type}</span><em>{building.status}</em>
                      </button>
                    ))}
                  </div>
                  <div className="focus-list workers-list">
                    {state.workers.slice(0, 4).map((worker, index) => (
                      <button
                        type="button"
                        key={worker.id}
                        aria-label={"Focus " + (worker.workerTypeLabel || "Builder") + " " + (index + 1) + ". Current task: " + (worker.buildingType ? CATALOG[worker.buildingType]?.name || worker.buildingType : "Builder")}
                        onClick={() => { setOverview(false); game.current?.focusWorker(worker.id); }}
                      >
                        <span>{worker.workerTypeLabel || "Builder"} {index + 1}</span><em>{worker.buildingType ? CATALOG[worker.buildingType]?.name : "Builder"}</em>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="graphics-panel">
                  <div><span className="overview-activity-heading">Graphics</span><small>Lower detail improves battery and frame rate.</small></div>
                  <div className="segmented-actions">
                    {["low", "balanced", "high"].map((preset) => (
                      <button type="button" key={preset} className={state.graphicsPreset === preset ? "active" : ""} aria-pressed={state.graphicsPreset === preset} onClick={() => game.current?.setGraphicsPreset(preset)}>{preset}</button>
                    ))}
                  </div>
                </div>
                <div className="audio-panel">
                  <div><span className="overview-activity-heading">Atmosphere</span><small>Soft sounds begin after your first action.</small></div>
                  <label><input type="checkbox" checked={state.audioSettings.effects} onChange={(event) => game.current?.setAudioSetting("effects", event.target.checked)} /> Action cues</label>
                  <label><input type="checkbox" checked={state.audioSettings.ambience} onChange={(event) => game.current?.setAudioSetting("ambience", event.target.checked)} /> Ambient tone</label>
                </div>
                <div className="overview-progress">
                  <div>
                    <span>Settlement milestones</span>
                    <strong>{completedGoals} / 3</strong>
                  </div>
                  <i
                    role="progressbar"
                    aria-label="Settlement milestones"
                    aria-valuemin="0"
                    aria-valuemax="3"
                    aria-valuenow={completedGoals}
                    aria-valuetext={`${completedGoals} of 3 milestones complete`}
                  >
                    <b style={{ width: `${(completedGoals / 3) * 100}%` }} />
                  </i>
                </div>
                <div
                  className="overview-activity"
                  aria-label="Recent village activity"
                >
                  <div className="overview-activity-heading">
                    <span>Recent village life</span>
                    <small>{recentActivity.length ? "LIVE" : "WAITING"}</small>
                  </div>
                  {recentActivity.length ? (
                    <ul>
                      {recentActivity.map((message, index) => (
                        <li key={`${message}-${index}`} title={message}>
                          <i />
                          <span>{message}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Your villagers are settling in. New work will appear here.</p>
                  )}
                </div>
                <button
                  type="button"
                  className="primary full"
                  onClick={() => setOverview(false)}
                >
                  Back to {state.name} <ArrowUpRight size={16} />
                </button>
              </>
            ) : rename ? (
              <>
                <h2>Give it a name.</h2>
                <p>
                  Choose a name for the little settlement you are growing. It
                  will be saved with this village.
                </p>
                <form className="rename-form" onSubmit={saveName}>
                  <label htmlFor="village-name">Village name</label>
                  <input
                    id="village-name"
                    value={nameDraft}
                    maxLength={24}
                    autoFocus
                    data-modal-autofocus
                    onChange={(event) => setNameDraft(event.target.value)}
                  />
                  <div className="modal-actions">
                    <button type="button" onClick={() => setRename(false)}>
                      Keep current
                    </button>
                    <button className="primary" type="submit">
                      Save name
                    </button>
                  </div>
                </form>
              </>
            ) : reset ? (
              <>
                <h2>A fresh beginning?</h2>
                <p>
                  This replaces your saved village with the original settlement.
                </p>
                <div className="modal-actions">
                  <button type="button" data-modal-autofocus onClick={() => setReset(false)}>
                    Keep my village
                  </button>
                <button
                  type="button"
                  className="primary"
                    onClick={() => {
                      if (game.current?.storageConflict) {
                        setReset(false);
                        notify("Reload this tab before starting a new village.");
                        return;
                      }
                      if (game.current) game.current.ready = false;
                      if (!game.current?.clearSave()) {
                        if (game.current) game.current.ready = true;
                        notify(
                          game.current?.storageConflict
                            ? "This tab is out of date. Reload to use the latest village save."
                            : "This browser would not clear the saved village.",
                        );
                        setReset(false);
                        return;
                      }
                      window.location.reload();
                    }}
                  >
                    Start fresh
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>A little world, in your hands.</h2>
                <p>
                  Build slowly. Watch your people work. Make {state.name} a place
                  to call home.
                </p>
                <div className="help-row">
                  <MousePointer2 />
                  <div>
                    <strong>Explore your village</strong>
                    <span>
                      Drag to pan, scroll or pinch to zoom, and use right-drag
                      or two fingers to orbit. The compass brings you home.
                    </span>
                  </div>
                </div>
                <div className="help-row">
                  <Hammer />
                  <div>
                    <strong>Make room for something new</strong>
                    <span>
                      Choose a building below. A green preview means it fits.
                      Click or press Enter to place, drag to lay paths, R to
                      rotate, and Esc to cancel. Buildings are fixed once
                      placed, so choose their site carefully. Arrow keys move
                      the placement cursor.
                    </span>
                  </div>
                </div>
                <div className="help-row">
                  <Users />
                  <div>
                    <strong>Let your villagers take care of it</strong>
                    <span>
                      Workers travel to jobs, build new structures, and deliver
                      wood, stone, and food. You start with two builders:
                      cottages add room, and a School trains everyone else.
                    </span>
                  </div>
                </div>
                <div className="help-row">
                  <Wheat />
                  <div>
                    <strong>Grow a thriving settlement</strong>
                    <span>
                      Vineyards press grapes into wine. Farms produce wheat,
                      bakeries turn 3 wheat into 5 bread, lumberyards supply
                      wood, and mines gather stone. Windmills turn 2 food into
                      8 food per cycle. Paths speed up travel.
                    </span>
                  </div>
                </div>
                <div className="help-note">
                  Arrow keys pan · 1–9 choose a building · Space to pause · G
                  for grid · Enter to place · ? for help · Your village saves
                  automatically. Use the menu for backup export/import.
                </div>
                <button
                  type="button"
                  className="primary full"
                  onClick={() => setHelp(false)}
                >
                  Back to {state.name} <ArrowUpRight size={16} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {!loaded && (
        <div
          className="loading-screen"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Leaf size={40} strokeWidth={1} />
          <h2>A new beginning.</h2>
          <p>Planting trees. Raising rooftops. Waking the village.</p>
          <span className="loading-line" />
        </div>
      )}
      {error && (
        <div className="loading-screen" role="alert" aria-atomic="true">
          <h2>The village couldn’t load.</h2>
          <p>Please reload to try loading the 3D models again.</p>
          <button type="button" className="primary" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      )}
    </main>
  );
}
const isHealthCheck = window.location.pathname.replace(/\/$/, "") === "/health-check";
if (isHealthCheck) document.title = "Performance health check — Hearth & Hamlet";
createRoot(document.getElementById("root")).render(
  isHealthCheck ? (
    <Suspense fallback={<div role="status">Loading performance health check…</div>}>
      <HealthCheck />
    </Suspense>
  ) : (
    <App />
  ),
);
