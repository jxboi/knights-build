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
import HelpCircle from "lucide-react/dist/esm/icons/circle-help.js";
import Save from "lucide-react/dist/esm/icons/save.js";
import X from "lucide-react/dist/esm/icons/x.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right.js";
import ArrowDown from "lucide-react/dist/esm/icons/arrow-down.js";
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
import Sparkles from "lucide-react/dist/esm/icons/sparkles.js";
import Bookmark from "lucide-react/dist/esm/icons/bookmark.js";
import Copy from "lucide-react/dist/esm/icons/copy.js";
import Volume2 from "lucide-react/dist/esm/icons/volume-2.js";
import ArrowDownRight from "lucide-react/dist/esm/icons/arrow-down-right.js";
import Axe from "lucide-react/dist/esm/icons/axe.js";
import Pickaxe from "lucide-react/dist/esm/icons/pickaxe.js";
import Sprout from "lucide-react/dist/esm/icons/sprout.js";
import Package from "lucide-react/dist/esm/icons/package.js";
import Compass from "lucide-react/dist/esm/icons/compass.js";
import History from "lucide-react/dist/esm/icons/history.js";
import Bell from "lucide-react/dist/esm/icons/bell.js";
import { CATALOG } from "./catalog.js";
import { completedPlayerMilestone } from "./progression.js";
import "./style.css";
const HealthCheck = lazy(() => import("./health-check.jsx"));
const resourceIcons = { wood: Trees, stone: Mountain, food: Croissant, wheat: Wheat, wine: Wine };
const workerTypeIcons = {
  Builder: Hammer,
  Woodcutter: Axe,
  Miner: Pickaxe,
  Farmer: Sprout,
  Baker: Croissant,
  Carrier: Package,
};
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
const ADVISOR_RESOURCE_KEYS = ["wood", "stone", "food", "wheat", "wine"];
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function advisorResourceRunway(resources = {}, trends = {}) {
  return Object.fromEntries(
    ADVISOR_RESOURCE_KEYS.map((resource) => {
      const held = Math.max(0, Number(resources[resource]) || 0);
      const trend = Number(trends[resource]) || 0;
      return [
        resource,
        trend < -0.1 && held > 0
          ? Math.max(0, Math.min(999, Math.round((held / Math.abs(trend)) * 10) / 10))
          : null,
      ];
    }),
  );
}
function formatAdvisorRunway(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return "an unknown amount of time";
  if (value < 1) return "less than a minute";
  if (value < 2) return "about 1 minute";
  return `about ${Math.round(value)} minutes`;
}
function advisorHasNegativeAction(text, name, verbs) {
  const escapedName = escapeRegExp(name);
  const verbPattern = new RegExp(`\\b(?:${verbs})\\b`, "i");
  const namePattern = new RegExp(`\\b${escapedName}\\b`, "i");
  return String(text || "")
    .split(/[.!?;,\n]+/)
    .some(
      (clause) =>
        /\b(?:not|do not|don't|dont|never|avoid|skip|would not|wouldn't|cannot|can't|cant|unable to|not enough|no need to|not currently)\b/i.test(clause) &&
        verbPattern.test(clause) &&
        namePattern.test(clause),
    );
}
function inferAdvisorBuildAction(content) {
  const text = String(content || "").replace(/\*+/g, "");
  for (const { type, catalog } of CATALOG_ENTRIES) {
    if (type === "road") continue;
    const name = escapeRegExp(catalog.name);
    if (advisorHasNegativeAction(text, catalog.name, "build|place|choose|recommend")) continue;
    const patterns = [
      new RegExp(`\\b(?:build|place|choose|recommend)\\s+(?:a|an|the)\\s+${name}\\b`, "i"),
      new RegExp(`\\b(?:best move|best build|next build|recommended build)\\s*[:\\-]?\\s*(?:a|an|the)?\\s*${name}\\b`, "i"),
    ];
    if (patterns.some((pattern) => pattern.test(text))) return type;
  }
  return null;
}
function inferAdvisorPreviewAction(content) {
  const text = String(content || "").replace(/\*+/g, "");
  if (!/\b(?:preview|simulate|model|what if|tradeoff|worth)\b/i.test(text)) return null;
  for (const { type, catalog } of CATALOG_ENTRIES) {
    if (type === "road") continue;
    if (advisorHasNegativeAction(text, catalog.name, "preview|simulate|model")) continue;
    const name = escapeRegExp(catalog.name);
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) return type;
  }
  return null;
}
function inferAdvisorUpgradeAction(content) {
  const text = String(content || "").replace(/\*+/g, "");
  for (const { type, catalog } of CATALOG_ENTRIES) {
    if (!catalog.upgrade) continue;
    const name = escapeRegExp(catalog.name);
    if (advisorHasNegativeAction(text, catalog.name, "upgrade|improve|enhance")) continue;
    const patterns = [
      new RegExp(`\\b(?:upgrade|improve|enhance)\\s+(?:(?:a|an|the)\\s+)?${name}\\b`, "i"),
      new RegExp(`\\b(?:upgrade|choose)\\s+(?:the\\s+)?${name}\\s+(?:with\\s+)?${escapeRegExp(catalog.upgrade.name)}\\b`, "i"),
    ];
    if (patterns.some((pattern) => pattern.test(text))) return type;
  }
  return null;
}
function inferAdvisorFeastAction(content) {
  const text = String(content || "").replace(/\*+/g, "");
  if (/\b(?:do not|don't|not|never|avoid|skip|cannot|can't|unable to)\b[^.?!]{0,40}\b(?:start|hold|begin)\s+(?:a\s+)?(?:village\s+)?feast\b/i.test(text)) {
    return null;
  }
  return /\b(?:start|hold|begin)\s+(?:a\s+)?(?:village\s+)?feast\b/i.test(text)
    ? true
    : null;
}
function inferAdvisorFocusAction(content) {
  const text = String(content || "").replace(/\*+/g, "");
  for (const { type, catalog } of CATALOG_ENTRIES) {
    if (type === "road" || type === "townhall") continue;
    const name = escapeRegExp(catalog.name);
    if (advisorHasNegativeAction(text, catalog.name, "inspect|check|visit|focus")) continue;
    const patterns = [
      new RegExp(`\\b(?:inspect|check|visit|look\\s+at|focus\\s+on)\\s+(?:(?:a|an|the)\\s+)?${name}\\b`, "i"),
    ];
    if (patterns.some((pattern) => pattern.test(text))) return type;
  }
  return null;
}
function inferAdvisorWorkerFocusAction(content) {
  const text = String(content || "").replace(/\*+/g, "");
  for (const workerType of workerTypeOrder) {
    const name = escapeRegExp(workerType);
    if (advisorHasNegativeAction(text, workerType, "inspect|check|visit|focus")) continue;
    const pattern = new RegExp(
      `\\b(?:inspect|check|visit|look\\s+at|focus\\s+on)\\s+(?:(?:a|an|the|my)\\s+)?${name}\\b`,
      "i",
    );
    if (pattern.test(text)) return workerType;
  }
  return null;
}
function inferAdvisorTrainingAction(content) {
  const text = String(content || "").replace(/\*+/g, "");
  if (!/\b(?:train|training|apprentice|school)\b/i.test(text)) return null;
  for (const workerType of workerTypeOrder) {
    const name = escapeRegExp(workerType);
    if (advisorHasNegativeAction(text, workerType, "train|training|apprentice")) continue;
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) return workerType;
  }
  return null;
}
function missingAdvisorBuildCosts(type, resources = {}) {
  const catalog = CATALOG[type];
  if (!catalog || type === "road") return [];
  return Object.entries(catalog.cost)
    .filter(([resource, amount]) => Number(resources[resource] || 0) < amount)
    .map(([resource, amount]) => [
      resource,
      Math.max(0, amount - Math.floor(Number(resources[resource] || 0))),
    ]);
}
function missingAdvisorUpgradeCosts(type, resources = {}) {
  const upgrade = CATALOG[type]?.upgrade;
  if (!upgrade) return [];
  return Object.entries(upgrade.cost)
    .filter(([resource, amount]) => Number(resources[resource] || 0) < amount)
    .map(([resource, amount]) => [
      resource,
      Math.max(0, amount - Math.floor(Number(resources[resource] || 0))),
    ]);
}
function buildAdvisorScenario(type, resources = {}, storage = {}) {
  const catalog = CATALOG[type];
  if (!catalog || type === "road") return null;
  const cost = Object.entries(catalog.cost || {}).filter(([, amount]) => Number(amount) > 0);
  const missing = cost
    .filter(([resource, amount]) => Number(resources[resource] || 0) < Number(amount))
    .map(([resource, amount]) => [resource, Math.max(0, Number(amount) - Number(resources[resource] || 0))]);
  const remaining = Object.fromEntries(
    ADVISOR_RESOURCE_KEYS.map((resource) => [
      resource,
      Math.max(0, Math.floor(Number(resources[resource] || 0) - Number(catalog.cost?.[resource] || 0))),
    ]),
  );
  const capacityChange = catalog.storage ? `+${catalog.storage} storage for every resource` :
    catalog.name === "Cottage" ? "+2 housing capacity" :
      catalog.resource ? `starts a ${catalog.resource} production chain` : "a new village function";
  return {
    name: catalog.name,
    cost,
    missing,
    remaining,
    capacityChange,
    effect: catalog.effect,
    footprint: catalog.size,
    storage: Math.floor(Number(storage[catalog.resource] || 0)),
  };
}
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
  const parts = String(content || "").split(/(\*\*[^*]+\*\*|(?:Best move|Why|Watch for|Start here|Compare|Preview|Upgrade|Inspect|Train|Training|Impact|Timing|Hold|Workforce|Resource|Forecast|Start a feast|Skip the feast|Dispatch|Pulse|Chronicle|Three-step plan|Quartermaster|Builder|Chronicler):)/gi);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : /^(?:Best move|Why|Watch for|Start here|Compare|Preview|Upgrade|Inspect|Train|Training|Impact|Timing|Hold|Workforce|Resource|Forecast|Start a feast|Skip the feast|Dispatch|Pulse|Chronicle|Three-step plan|Quartermaster|Builder|Chronicler):$/i.test(part) ? (
      <strong className="advisor-label" key={index}>{part}</strong>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );
}
function buildAdvisorGrounding(content, context = {}) {
  const text = String(content || "").toLowerCase();
  const signals = [];
  if (/(?:wood|stone|food|wheat|wine|resource|cost|afford|storage|trend|runway|shortage)/.test(text)) {
    signals.push("Resources");
  }
  if (/(?:build|building|worksite|production|delivery|route|bottleneck|blocked|upgrade|inspect)/.test(text)) {
    signals.push("Worksites");
  }
  if (/(?:worker|villager|carrier|school|train|apprentice|housing|population|people)/.test(text)) {
    signals.push("People");
  }
  if (/(?:goal|chapter|reward|milestone|next chapter)/.test(text)) {
    signals.push("Goals");
  }
  if (/(?:since|pulse|chronicle|recent|activity|what changed)/.test(text)) {
    signals.push("History");
  }
  if (!signals.length && context && (context.day || context.period)) {
    signals.push("Live village state");
  }
  return [...new Set(signals)].slice(0, 4);
}
const DEFAULT_ADVISOR_MESSAGE = {
  role: "assistant",
  content:
    "Welcome. I can read the state of your settlement and suggest what to do next.",
};
const ADVISOR_STORAGE_PREFIX = "hearth-advisor-v1:";
const ADVISOR_COMMANDS = Object.freeze({
  dispatch:
    "Write a lively daily dispatch for my village. Name the biggest opportunity, the biggest risk, and one small action I can take in the next minute. Use exact current state and keep the tone like a village chronicle.",
  plan:
    "Create a grounded three-step plan for my next chapter. Include one best build from buildOptions, one workforce or resource move, and one thing to watch. Explain the order and use exact current costs and counts.",
  compare:
    "Compare the two strongest currently affordable building choices for this village. For each, give the exact cost, the immediate benefit, the main risk, and who should build or staff it. End with one recommendation.",
  council:
    "Convene a tiny village council. Give three short viewpoints labeled Quartermaster, Builder, and Chronicler, then end with one shared recommendation. Keep every viewpoint grounded in the current state.",
});
const ADVISOR_LENSES = Object.freeze({
  steward: {
    label: "Guide",
    icon: Compass,
    instruction:
      "Answer as a calm village steward. Put the most useful next action first, explain the tradeoff, and keep the advice practical.",
  },
  quartermaster: {
    label: "Resources",
    icon: Gauge,
    instruction:
      "Answer as a sharp quartermaster. Think in bottlenecks, exact resources, storage, worker time, and opportunity cost. Be concise and decisive.",
  },
  chronicler: {
    label: "Story",
    icon: Sparkles,
    instruction:
      "Answer as a playful village chronicler. Keep the advice actionable, but add a little story, character, or memorable phrase grounded in the current village.",
  },
});
function buildAdvisorFollowups(latestMessage, latestUserMessage) {
  if (!latestMessage || latestMessage.role !== "assistant" || !latestUserMessage) return [];
  const originalQuestion = advisorReplayPrompt(latestUserMessage);
  const forecast = /forecast|runway|last|trend|running out|shortage/.test(
    String(latestMessage.content || "").toLowerCase(),
  );
  const recommendedBuild = String(latestMessage.content || "")
    .match(/\bBest move:\s*build the ([^,.\n]+)(?:,|\.)/i)?.[1]
    ?.trim();
  const recommendedTraining = String(latestMessage.content || "")
    .match(/\bTrain\s+([A-Z][A-Za-z]+)(?::|,|;|\.)/i)?.[1]
    ?.trim();
  const trainingImpactFollowup = recommendedTraining &&
    /\b(?:unlock|change|benefit|help|happen|do)\b/i.test(originalQuestion);
  const bottleneckFollowup = /hold the next build|ask which worksite is blocked|inspect the flagged worksites/i.test(String(latestMessage.content || ""));
  return [
    {
      title: "Explain the tradeoff",
      question: `Explain the main tradeoff behind your answer to: ${originalQuestion}`,
    },
    {
      title: forecast
        ? "What changes the forecast?"
        : trainingImpactFollowup
          ? "How will I know it worked?"
        : bottleneckFollowup
          ? "Find the bottleneck"
        : recommendedTraining
          ? "What will it unlock?"
        : recommendedBuild
          ? "When can I afford it?"
          : "What should I watch?",
      question: forecast
        ? `What change in my village would make that resource forecast better or worse? Use the current snapshot.`
        : trainingImpactFollowup
          ? `How will I know the trained ${recommendedTraining} is helping? Use the current School session, open post, and worker statuses.`
        : bottleneckFollowup
          ? "Which worksite is blocked, and how do I get it producing again? Use the current building statuses, worker routes, and storage signals."
        : recommendedTraining
          ? `What will training the ${recommendedTraining} change in my village? Use the current School options and open posts.`
        : recommendedBuild
          ? `When can I afford the ${recommendedBuild}? Use current resources and trends.`
          : `What should I watch over the next minute to know whether your recommendation is working? Use the current snapshot.`,
    },
  ];
}
function advisorReplayPrompt(message) {
  if (!message) return "";
  if (typeof message.prompt === "string" && message.prompt.trim()) return message.prompt;
  const question = String(message.question || "").trim();
  const impactRole = String(message.content || "").match(/\b(?:training a|Train)\s+([A-Z][A-Za-z]+)\b/i)?.[1];
  if (impactRole && /\b(?:unlock|impact|change)\b/i.test(question)) {
    return `What will training the ${impactRole} change in my village? Use the current School options and open posts.`;
  }
  return question || String(message.content || "");
}
function buildAdvisorRoute(content) {
  const text = String(content || "").replace(/\*+/g, "").replace(/\s+/g, " ").trim();
  const match = text.match(/Three-step plan:\s*1\.\s*(.*?)\s+2\.\s*(.*?)\s+3\.\s*(.*?)(?:\s+Best move:|$)/i);
  if (!match) return null;
  const steps = [match[1], match[2], match[3]]
    .map((step) => step.replace(/\s+/g, " ").trim().replace(/[.]+$/, ""))
    .filter(Boolean)
    .slice(0, 3);
  if (steps.length !== 3) return null;
  return {
    content: text.slice(0, 4000),
    steps: steps.map((step) => ({
      text: step,
      done: false,
      buildAction: inferAdvisorBuildAction(step),
      focusAction: inferAdvisorFocusAction(step),
      workerFocusAction: inferAdvisorWorkerFocusAction(step),
      trainingAction: inferAdvisorTrainingAction(step),
    })),
  };
}
function advisorRouteStorageKey(villageName) {
  return `${advisorStorageKey(villageName)}:route`;
}
function readAdvisorRoute(villageName) {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(advisorRouteStorageKey(villageName)) || "null");
    if (!saved || typeof saved !== "object" || !Array.isArray(saved.steps) || saved.steps.length !== 3) return null;
    return {
      content: String(saved.content || "").slice(0, 4000),
      day: Math.max(1, Math.floor(Number(saved.day) || 1)),
      steps: saved.steps.map((step) => ({
        text: String(step?.text || "").slice(0, 500),
        done: Boolean(step?.done),
        buildAction: typeof step?.buildAction === "string" ? step.buildAction : null,
        focusAction: typeof step?.focusAction === "string" ? step.focusAction : null,
        workerFocusAction: typeof step?.workerFocusAction === "string" ? step.workerFocusAction : null,
        trainingAction: typeof step?.trainingAction === "string" ? step.trainingAction : null,
      })),
    };
  } catch {
    return null;
  }
}
function writeAdvisorRoute(villageName, route, day) {
  if (typeof window === "undefined" || !route) return;
  try {
    window.localStorage.setItem(
      advisorRouteStorageKey(villageName),
      JSON.stringify({ ...route, day: Math.max(1, Math.floor(Number(day) || 1)) }),
    );
  } catch {
    // A pinned route is a convenience; the village save remains authoritative.
  }
}
function advisorStorageKey(villageName) {
  const safeName = String(villageName || "Willowbrook")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .slice(0, 48) || "Willowbrook";
  return `${ADVISOR_STORAGE_PREFIX}${safeName}`;
}
function advisorPulseStorageKey(villageName) {
  return `${advisorStorageKey(villageName)}:pulse`;
}
function advisorPulseFromSnapshot(snapshot) {
  return {
    day: Math.max(1, Math.floor(Number(snapshot?.day) || 1)),
    period: String(snapshot?.period || "Morning").slice(0, 24),
    population: Math.max(0, Math.floor(Number(snapshot?.population) || 0)),
    capacity: Math.max(0, Math.floor(Number(snapshot?.capacity) || 0)),
    resources: Object.fromEntries(
      ADVISOR_RESOURCE_KEYS.map((resource) => [
        resource,
        Math.max(0, Math.floor(Number(snapshot?.resources?.[resource]) || 0)),
      ]),
    ),
    buildings: (snapshot?.buildings || [])
      .map((building) => String(building.name || building.type || "").trim())
      .filter(Boolean)
      .slice(0, 32),
    chapter: (snapshot?.goals?.chapter || []).slice(0, 6).map((goal) => ({
      title: String(goal.title || "").slice(0, 80),
      progress: Math.max(0, Math.floor(Number(goal.progress) || 0)),
      target: Math.max(0, Math.floor(Number(goal.target) || 0)),
    })),
  };
}
function readAdvisorPulse(villageName) {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(advisorPulseStorageKey(villageName)) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}
function writeAdvisorPulse(villageName, snapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      advisorPulseStorageKey(villageName),
      JSON.stringify(advisorPulseFromSnapshot(snapshot)),
    );
  } catch {
    // The pulse is a convenience; the village save remains authoritative.
  }
}
function buildLocalAdvisorPulseReply(snapshot) {
  const previous = snapshot?.previousPulse;
  if (!previous || typeof previous !== "object") {
    return "Pulse: this is the advisor's first check-in for this village. Ask again later and I will tell you what changed.";
  }
  const changes = [];
  const previousResources = previous.resources || {};
  for (const resource of ADVISOR_RESOURCE_KEYS) {
    const current = Math.floor(Number(snapshot.resources?.[resource]) || 0);
    const before = Math.floor(Number(previousResources[resource]) || 0);
    const delta = current - before;
    if (delta) changes.push(`${resource} ${delta > 0 ? "+" : ""}${delta}`);
  }
  const populationDelta = Math.floor(Number(snapshot.population) || 0) - Math.floor(Number(previous.population) || 0);
  if (populationDelta) changes.push(`population ${populationDelta > 0 ? "+" : ""}${populationDelta}`);
  const beforeBuildings = new Set((previous.buildings || []).map((name) => String(name)));
  const newBuildings = (snapshot.buildings || [])
    .map((building) => String(building.name || building.type || "").trim())
    .filter((name) => name && !beforeBuildings.has(name));
  if (newBuildings.length) changes.push(`new ${newBuildings.slice(0, 2).join(" and ")}`);
  const previousChapter = new Map((previous.chapter || []).map((goal) => [goal.title, goal]));
  const chapterMoves = (snapshot.goals?.chapter || [])
    .map((goal) => {
      const before = previousChapter.get(goal.title);
      const delta = Math.floor(Number(goal.progress) || 0) - Math.floor(Number(before?.progress) || 0);
      return delta > 0 ? `${goal.title} +${delta}` : null;
    })
    .filter(Boolean);
  if (chapterMoves.length) changes.push(`chapter progress: ${chapterMoves[0]}`);
  const since = `since Day ${Math.max(1, Math.floor(Number(previous.day) || 1))} ${String(previous.period || "Morning")}`;
  if (!changes.length) {
    return `Pulse: ${since}, the village is holding steady. No tracked resources, people, buildings, or chapter goals changed in the last check.`;
  }
  return `Pulse: ${since}, ${changes.join(", ")}. Keep an eye on the newest bottleneck before making another commitment.`;
}
function readAdvisorLens(villageName) {
  if (typeof window === "undefined") return "steward";
  try {
    const saved = window.localStorage.getItem(`${advisorStorageKey(villageName)}:lens`);
    return Object.prototype.hasOwnProperty.call(ADVISOR_LENSES, saved)
      ? saved
      : "steward";
  } catch {
    return "steward";
  }
}
function advisorWatchStorageKey(villageName) {
  return `${advisorStorageKey(villageName)}:watch`;
}
function readAdvisorWatch(villageName) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(advisorWatchStorageKey(villageName)) === "on";
  } catch {
    return false;
  }
}
function advisorWatchEventsStorageKey(villageName) {
  return `${advisorStorageKey(villageName)}:watch-events`;
}
function readAdvisorWatchEvents(villageName) {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(advisorWatchEventsStorageKey(villageName)) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((event) => event && typeof event === "object" && String(event.title || "").trim())
      .slice(0, 4)
      .map((event) => ({
        day: Math.max(1, Math.floor(Number(event.day) || 1)),
        period: String(event.period || "Morning").slice(0, 24),
        title: String(event.title).slice(0, 100),
        detail: String(event.detail || "").slice(0, 180),
      }));
  } catch {
    return [];
  }
}
function writeAdvisorWatchEvents(villageName, events) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      advisorWatchEventsStorageKey(villageName),
      JSON.stringify((Array.isArray(events) ? events : []).slice(0, 4)),
    );
  } catch {
    // The watch log is a convenience; the village save remains authoritative.
  }
}
function readAdvisorMessages(villageName) {
  if (typeof window === "undefined") return [DEFAULT_ADVISOR_MESSAGE];
  try {
    const saved = JSON.parse(window.localStorage.getItem(advisorStorageKey(villageName)) || "null");
    if (!Array.isArray(saved)) return [DEFAULT_ADVISOR_MESSAGE];
    const messages = saved
      .filter(
        (message) =>
          message &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim(),
      )
      .slice(-12)
      .map((message) => {
        const action = message.role === "assistant"
          ? inferAdvisorBuildAction(message.content)
          : null;
        const previewAction = message.role === "assistant"
          ? inferAdvisorPreviewAction(message.content) || action
          : null;
        const upgradeAction = message.role === "assistant"
          ? inferAdvisorUpgradeAction(message.content)
          : null;
        const feastAction = message.role === "assistant"
          ? inferAdvisorFeastAction(message.content)
          : null;
        const focusAction = message.role === "assistant"
          ? inferAdvisorFocusAction(message.content)
          : null;
        const workerFocusAction = message.role === "assistant"
          ? inferAdvisorWorkerFocusAction(message.content)
          : null;
        const trainingAction = message.role === "assistant"
          ? inferAdvisorTrainingAction(message.content)
          : null;
        const snapshot = message.snapshot && typeof message.snapshot === "object"
          ? {
              day: Math.max(1, Math.floor(Number(message.snapshot.day) || 1)),
              period: typeof message.snapshot.period === "string"
                ? message.snapshot.period.trim().slice(0, 24)
                : "Morning",
            }
          : null;
        const grounding = Array.isArray(message.grounding)
          ? message.grounding
              .filter((signal) => typeof signal === "string" && signal.trim())
              .map((signal) => signal.trim().slice(0, 32))
              .slice(0, 4)
          : [];
        return {
          role: message.role,
          content: message.content.trim().slice(0, 4000),
          ...(typeof message.question === "string" ? { question: message.question.trim().slice(0, 240) } : {}),
          ...(typeof message.prompt === "string" ? { prompt: message.prompt.slice(0, 4000) } : {}),
          ...(action ? { action } : {}),
          ...(previewAction ? { previewAction } : {}),
          ...(upgradeAction ? { upgradeAction } : {}),
          ...(feastAction ? { feastAction: true } : {}),
          ...(focusAction ? { focusAction } : {}),
          ...(workerFocusAction ? { workerFocusAction } : {}),
          ...(trainingAction ? { trainingAction } : {}),
          ...(snapshot ? { snapshot } : {}),
          ...(grounding.length ? { grounding } : {}),
          ...(message.helpful ? { helpful: true } : {}),
          ...(message.local ? { local: true } : {}),
        };
      });
    return messages.length ? messages : [DEFAULT_ADVISOR_MESSAGE];
  } catch {
    return [DEFAULT_ADVISOR_MESSAGE];
  }
}
const advisorPromptFallbacks = Object.freeze([
  {
    title: "Plan the next move",
    detail: "Choose the most useful building for this chapter.",
    question: "What should I build next, and why is it the best choice right now?",
    icon: Compass,
  },
  {
    title: "Read the workforce",
    detail: "Find out what is slowing your villagers down.",
    question: "Why are my workers waiting, and what can I do about it?",
    icon: Users,
  },
  {
    title: "Balance the pantry",
    detail: "Keep food, wheat, and storage moving together.",
    question: "How can I improve my food supply with the buildings I have?",
    icon: Croissant,
  },
]);
function buildAdvisorBrief(snapshot, nextGoal) {
  const resources = snapshot.resources || {};
  const storage = snapshot.storage || {};
  const items = [];
  const attention = [];
  const pushAttention = (item) => {
    attention.push(item);
    items.push(item);
  };
  const waitingWorkers = (snapshot.workers || []).filter(
    (worker) =>
      worker.waitingForInput ||
      worker.waitingForSpace ||
      worker.waitingForInn ||
      worker.deliveryRetry ||
      worker.hungry,
  ).length;
  const rescueSignal = waitingWorkers > 0 || Number(snapshot.blockedSites) > 0;
  if (waitingWorkers) {
    pushAttention({
      title: `${waitingWorkers} villager${waitingWorkers === 1 ? " is" : "s are"} waiting`,
      detail: "A missing ingredient, route, bed, or bit of storage may be the culprit.",
      question: "Why are my workers waiting, and what can I do about it?",
      icon: Users,
      tone: "attention",
    });
  }
  if (snapshot.blockedSites > 0) {
    pushAttention({
      title: `${snapshot.blockedSites} worksite${snapshot.blockedSites === 1 ? " needs" : "s need"} attention`,
      detail: "Check for a full output store, a blocked route, or an unassigned worker.",
      question: "Which worksite is blocked, and how do I get it producing again?",
      icon: Package,
      tone: "attention",
    });
  }
  const foodCapacity = Number(storage.food) || 0;
  const food = Number(resources.food) || 0;
  if (foodCapacity > 0 && food <= Math.max(12, foodCapacity * 0.3)) {
    pushAttention({
      title: "The pantry is getting light",
      detail: `${Math.floor(food)} food remains in ${Math.floor(foodCapacity)} storage.`,
      question: "How can I improve my food supply with the buildings I have?",
      icon: Croissant,
      tone: "attention",
    });
  }
  const foodTrend = Number(snapshot.trends?.food) || 0;
  if (foodTrend < -1 && food > Math.max(12, foodCapacity * 0.3)) {
    pushAttention({
      title: "Food is trending down",
      detail: `The pantry is losing about ${Math.abs(Math.floor(foodTrend))} food per minute. Check production before it becomes a shortage.`,
      question: "Why is my food supply declining, and what should I fix first?",
      icon: ArrowDownRight,
      tone: "attention",
    });
  }
  const decliningInput = ADVISOR_RESOURCE_KEYS
    .filter((resource) => resource !== "food")
    .map((resource) => ({
      resource,
      held: Number(resources[resource]) || 0,
      capacity: Number(storage[resource]) || 0,
      trend: Number(snapshot.trends?.[resource]) || 0,
    }))
    .find(({ held, capacity, trend }) =>
      trend < -1 && held > Math.max(5, capacity * 0.1),
    );
  if (decliningInput) {
    const resourceName = decliningInput.resource[0].toUpperCase() + decliningInput.resource.slice(1);
    pushAttention({
      title: `${resourceName} is trending down`,
      detail: `The store is losing about ${Math.abs(Math.floor(decliningInput.trend))} ${decliningInput.resource} per minute. Check its input chain before the stockpile becomes a stop.`,
      question: `Why is my ${decliningInput.resource} supply declining, and what should I fix first?`,
      icon: ArrowDownRight,
      tone: "attention",
    });
  }
  const runway = advisorResourceRunway(snapshot.resources, snapshot.trends);
  const criticalRunway = ADVISOR_RESOURCE_KEYS
    .map((resource) => ({ resource, minutes: runway[resource], held: Number(resources[resource]) || 0 }))
    .find(({ minutes, held }) => minutes != null && minutes <= 2 && held > 0);
  if (criticalRunway && !attention.some((item) => item.title.toLowerCase().includes(criticalRunway.resource))) {
    const runwayItem = {
      title: `${criticalRunway.resource[0].toUpperCase()}${criticalRunway.resource.slice(1)} has a short runway`,
      detail: `At the current pace, the village has ${formatAdvisorRunway(criticalRunway.minutes)} left.`,
      question: `How long will my ${criticalRunway.resource} last, and what should I fix first?`,
      icon: ArrowDownRight,
      tone: "attention",
    };
    attention.push(runwayItem);
    items.splice(Math.min(1, items.length), 0, runwayItem);
  }
  const fullStorage = ["wood", "stone", "food", "wheat", "wine"].find(
    (resource) =>
      Number(storage[resource]) > 0 &&
      Number(resources[resource]) >= Number(storage[resource]),
  );
  if (fullStorage) {
    pushAttention({
      title: `${fullStorage[0].toUpperCase()}${fullStorage.slice(1)} storage is full`,
      detail: "A Storehouse or a pause in production can turn a bottleneck into room to grow.",
      question: `How should I handle my full ${fullStorage} storage?`,
      icon: Package,
      tone: "attention",
    });
  }
  const readyUpgrade = (snapshot.buildings || []).find((building) => {
    const upgrade = CATALOG[building.type]?.upgrade;
    return (
      Number(building.progress) >= 1 &&
      upgrade &&
      !building.upgrade &&
      Object.entries(upgrade.cost).every(
        ([resource, amount]) => Number(resources[resource] || 0) >= Number(amount),
      )
    );
  });
  if (readyUpgrade) {
    const upgrade = CATALOG[readyUpgrade.type].upgrade;
    const name = CATALOG[readyUpgrade.type].name;
    items.splice(Math.min(2, items.length), 0, {
      title: `${name} can improve`,
      detail: `${upgrade.name} is affordable and will make this worksite more capable.`,
      question: `Should I upgrade the ${name}?`,
      icon: Sparkles,
      tone: "goal",
    });
  }
  const feastReady =
    !snapshot.feast &&
    food >= 30 &&
    food > Math.max(30, foodCapacity * 0.35) &&
    (snapshot.buildings || []).some((building) => Number(building.progress) < 1);
  if (feastReady && !readyUpgrade) {
    items.splice(Math.min(2, items.length), 0, {
      title: "A feast would help the builders",
      detail: "There is enough food for 45 seconds of 25% faster construction.",
      question: "Should I hold a feast now?",
      icon: Sparkles,
      tone: "goal",
    });
  }
  const openApprenticeship = (snapshot.buildings || [])
    .filter((building) => building.type === "school" && Number(building.progress) >= 1 && !building.trainingSession)
    .flatMap((building) => (Array.isArray(building.training) ? building.training : []))
    .find((option) => option.canTrain);
  const activeApprenticeship = (snapshot.buildings || []).find(
    (building) => building.type === "school" && Number(building.progress) >= 1 && building.trainingSession,
  )?.trainingSession;
  if (activeApprenticeship && !readyUpgrade && !feastReady) {
    items.splice(Math.min(2, items.length), 0, {
      title: `A ${String(activeApprenticeship.label || "villager").toLowerCase()} apprentice is training`,
      detail: activeApprenticeship.waiting
        ? "The School is waiting for housing before the apprentice can graduate."
        : `The current session has about ${Math.ceil(Number(activeApprenticeship.remaining) || 0)} seconds left.`,
      question: "When will the School finish training, and what should I prepare?",
      icon: GraduationCap,
      tone: "calm",
    });
  } else if (openApprenticeship && !readyUpgrade && !feastReady) {
    items.splice(Math.min(2, items.length), 0, {
      title: `A ${openApprenticeship.label.toLowerCase()} apprenticeship is open`,
      detail: "The School has a live post and can train this role without guessing about capacity.",
      question: "What should I train at the School, and why is that the best opening?",
      icon: GraduationCap,
      tone: "goal",
    });
  }
  const openChapterGoal = (snapshot.chapterGoals || []).find((goal) => !goal.completed);
  if (openChapterGoal && !readyUpgrade && !feastReady && items.length < 3) {
    items.push({
      title: "A chapter challenge awaits",
      detail: `${openChapterGoal.title} · ${openChapterGoal.progress}/${openChapterGoal.target} · ${openChapterGoal.reward}`,
      question: "What is my next chapter challenge, and how do I earn its reward?",
      icon: Sparkles,
      tone: "goal",
    });
  }
  if (nextGoal) {
    const missing = Object.entries(CATALOG[nextGoal.type]?.cost || {})
      .filter(([resource, amount]) => Number(resources[resource]) < Number(amount))
      .map(([resource, amount]) => `${Math.max(0, Math.ceil(amount - Number(resources[resource] || 0)))} ${resource}`);
    items.push({
      title: nextGoal.label,
      detail:
        nextGoal.action === "focus"
          ? "Keep the existing lumberyard moving until the milestone fills."
          : missing.length
            ? `Gather ${missing.join(" and ")} before placing it.`
            : "The materials are ready. Find a clear patch and make it the next chapter.",
      question: "How close am I to my next chapter, and what should I do first?",
      icon: Sparkles,
      tone: "goal",
    });
  } else if (!items.length) {
    items.push({
      title: "The hamlet is steady",
      detail: "Workers are moving and nothing is asking for urgent rescue.",
      question: "What would make my village stronger over the next few minutes?",
      icon: Leaf,
      tone: "calm",
    });
  }
  const uniqueItems = items.filter(
    (item, index, list) => list.findIndex((candidate) => candidate.title === item.title) === index,
  );
  return {
    items: uniqueItems.slice(0, 3),
    attentionCount: attention.length,
    label: attention.length ? `${attention.length} to watch` : "All is calm",
  };
}
function buildLocalAdvisorReply(question, snapshot, brief) {
  const lowerQuestion = String(question || "").toLowerCase();
  const resources = snapshot.resources || {};
  const namedResource = ADVISOR_RESOURCE_KEYS.find((resource) => lowerQuestion.includes(resource));
  const forecastQuestion = /forecast|make(?:s|\s+it)?\s+(?:better|worse)|better or worse/.test(lowerQuestion);
  const forecastResource = namedResource || ADVISOR_RESOURCE_KEYS.find(
    (resource) => Number(snapshot.trends?.[resource]) < -0.1 && Number(resources[resource]) > 0,
  ) || ADVISOR_RESOURCE_KEYS.find((resource) => snapshot.runway?.[resource] != null);
  const resourceQuestion = Boolean(
    namedResource &&
    /\b(?:supply|stock|storage|how much|how is|watch)\b/.test(lowerQuestion) &&
    !/\b(?:build(?:ing|ings)?|improve|spend|upgrade|train|priorit(?:y|ize|ise)|focus)\b/.test(lowerQuestion),
  );
  const choices = (snapshot.buildOptions || []).filter(
    (option) => option.type !== "road" && option.affordable,
  );
  const freshChoices = choices.filter(
    (option) => option.built === 0 && option.underConstruction === 0,
  );
  const recommendationPool = freshChoices.length ? freshChoices : choices;
  const goalType = snapshot.goals?.next?.type;
  const goalChoice = choices.find((option) => option.type === goalType);
  const requestedOption = (snapshot.buildOptions || []).find(
    (option) => option.name && lowerQuestion.includes(option.name.toLowerCase()),
  );
  const foodChoice = recommendationPool.find(
    (option) => /food|wheat|bread/i.test(`${option.name} ${option.effect}`),
  );
  const requestedChoice = choices.find(
    (option) => option.name && lowerQuestion.includes(option.name.toLowerCase()),
  );
  const negativeBuildQuestion = /\b(?:avoid|skip|don't|do not|never|not|cannot|can't)\b[^.?!]{0,55}\b(?:build|place|choose|recommend)\b/.test(lowerQuestion);
  const avoidedChoice = negativeBuildQuestion ? requestedChoice : null;
  const choice = avoidedChoice ? null : requestedChoice || goalChoice || (lowerQuestion.includes("food") ? foodChoice : null) || recommendationPool[0];
  const chroniclerVoice = /playful village chronicler/.test(lowerQuestion);
  const quartermasterVoice = /sharp (?:village )?quartermaster/.test(lowerQuestion);
  const cost = choice
    ? Object.entries(choice.cost || {})
        .filter(([, amount]) => Number(amount) > 0)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" and ")
    : "the materials already in storage";
  const remainingAfterChoice = choice
    ? Object.entries(choice.cost || {})
        .filter(([, amount]) => Number(amount) > 0)
        .map(([resource, amount]) => `${Math.max(0, Math.floor(Number(resources[resource]) || 0) - Number(amount))} ${resource}`)
        .join(" and ")
    : "";
  const voiceNote = chroniclerVoice
    ? " A small chapter, but a good one."
    : quartermasterVoice && remainingAfterChoice
      ? ` Margin: about ${remainingAfterChoice} remain after paying.`
      : "";
  const attention = brief?.items?.find((item) => item.tone === "attention");
  const waitingWorkers = (snapshot.workers || []).filter(
    (worker) =>
      worker.waitingForInput ||
      worker.waitingForSpace ||
      worker.waitingForInn ||
      worker.deliveryRetry ||
      worker.hungry,
  ).length;
  const focusQuestion = /inspect|look\s+at|show\s+me|where\s+is/.test(lowerQuestion);
  const namedFocusTarget = (snapshot.buildings || []).find(
    (building) =>
      building.name &&
      lowerQuestion.includes(building.name.toLowerCase()),
  );
  const namedFocusWorker = (snapshot.workers || []).find(
    (worker) => worker.type && lowerQuestion.includes(worker.type.toLowerCase()),
  );
  const trainingQuestion = !focusQuestion && (
    /\b(?:train|training|trained|graduate|graduates|apprentice|which villager|which worker)\b/.test(lowerQuestion) ||
    (/\bschool\b/.test(lowerQuestion) && /\b(?:what|who|should|available|slot|opening)\b/.test(lowerQuestion))
  );
  const trainingImpactQuestion = trainingQuestion && /\b(?:unlock|change|benefit|help|happen|do)\b/.test(lowerQuestion);
  const trainingOutcomeQuestion = trainingQuestion && /\b(?:know|watch|notice|tell|measure|confirm|worked|working|helping)\b/.test(lowerQuestion);
  const school = (snapshot.buildings || []).find(
    (building) => building.type === "school" && Number(building.progress) >= 1,
  );
  const trainingOptions = Array.isArray(school?.training) ? school.training : [];
  const requestedTrainingType = workerTypeOrder.find((workerType) =>
    lowerQuestion.includes(workerType.toLowerCase()),
  );
  const requestedTraining = trainingOptions.find(
    (option) => option.label === requestedTrainingType,
  );
  const trainingChoice = requestedTraining?.canTrain
    ? requestedTraining
    : trainingOptions.find((option) => option.canTrain && option.posts != null) ||
      trainingOptions.find((option) => option.canTrain);
  const workforceQuestion = /\b(?:how many|count|who|workforce|workers?)\b/.test(lowerQuestion) &&
    !trainingQuestion &&
    !/\b(?:worksite|bottleneck|blocked)\b/.test(lowerQuestion);
  const namedWorkerRole = workerTypeOrder.find((workerType) =>
    lowerQuestion.includes(workerType.toLowerCase()),
  );
  const roleWorkers = namedWorkerRole
    ? (snapshot.workers || []).filter((worker) => worker.type === namedWorkerRole)
    : [];
  const upgradeQuestion = /upgrade|improve|enhance/.test(lowerQuestion);
  const namedUpgradeBuilding = (snapshot.buildings || []).find(
    (building) => building.name && lowerQuestion.includes(building.name.toLowerCase()),
  );
  const namedUpgradeTarget = (snapshot.buildings || []).find(
    (building) =>
      building.name &&
      lowerQuestion.includes(building.name.toLowerCase()) &&
      Number(building.progress) >= 1 &&
      building.upgradeName &&
      !building.upgrade,
  );
  const affordableUpgradeTarget = (snapshot.buildings || []).find(
    (building) =>
      Number(building.progress) >= 1 &&
      building.upgradeName &&
      !building.upgrade &&
      Object.entries(building.upgradeCost || {}).every(
        ([resource, amount]) => Number(resources[resource] || 0) >= Number(amount),
      ),
  );
  const upgradeTarget = namedUpgradeTarget || (!namedUpgradeBuilding ? affordableUpgradeTarget : null);
  const feastQuestion = /feast|celebration|construction boost/.test(lowerQuestion);
  const planningQuestion = /plan|three-step/.test(lowerQuestion);
  const chapterQuestion = /chapter|challenge|reward|side goal|milestone/.test(lowerQuestion) && !planningQuestion;
  const openChapterGoal = (snapshot.goals?.chapter || []).find((goal) => !goal.completed);
  const negativeFeastQuestion = /\b(?:avoid|skip|not|don't|do not|never|cannot|can't|unable to)\b[^.?!]{0,40}\bfeast\b/.test(lowerQuestion);
  const blockedWorksite = (snapshot.buildings || []).find(
    (building) =>
      (Number(building.progress) < 1 || Number(building.workers) > 0) &&
      /waiting|blocked|route|input|space|full|missing|delivery|ingredient/i.test(building.status || ""),
  );
  const watchFor = attention?.detail || "keep carriers moving so production can reach the village store.";
  const recentChronicle = (snapshot.activity || []).filter(Boolean).slice(0, 2).join(" ") || "The hamlet is waiting for its next small turn.";
  const bestMove = choice
    ? `Best move: build the ${choice.name}. Why: it costs ${cost || "the available materials"} and ${choice.effect}.${voiceNote}`
    : "Best move: keep the village moving for a minute. Why: no affordable new build is available in the current snapshot.";
  const nextBuild = choice
    ? `Build the ${choice.name} (${cost || "materials ready"}).`
    : "Let resources accumulate until a useful build is affordable.";
  const workforceMove = waitingWorkers
      ? "Inspect the waiting work and clear its missing input, route, or storage."
      : trainingChoice
        ? `Train ${trainingChoice.label}, then watch the new ${trainingChoice.label.toLowerCase()} reach an open post.`
      : "Keep carriers moving and let the current production cycle finish.";

  if (avoidedChoice) {
    const avoidedCost = Object.entries(avoidedChoice.cost || {})
      .filter(([, amount]) => Number(amount) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" and ");
    const alternative = recommendationPool.find((option) => option.type !== avoidedChoice.type);
    return `Hold ${avoidedChoice.name} for now: you asked not to commit it. It would use ${avoidedCost || "the available materials"} for ${avoidedChoice.effect}. ${alternative ? `Keep the materials in reserve, or compare them with ${alternative.name}.` : "Keep those materials in reserve while the village reveals its next bottleneck."}`;
  }
  const explicitBuildQuestion = /\b(?:build|place|choose|recommend)\b/.test(lowerQuestion);
  const timingOrPreviewQuestion = /\b(?:when|how soon|how long|afford|preview|simulate|model|what if|tradeoff|worth)\b/.test(lowerQuestion);
  if (requestedOption && !requestedOption.affordable && explicitBuildQuestion && !timingOrPreviewQuestion) {
    const missing = Object.entries(requestedOption.cost || {})
      .filter(([resource, amount]) => Number(resources[resource] || 0) < Number(amount))
      .map(([resource, amount]) => `${Math.max(0, Number(amount) - Math.floor(Number(resources[resource] || 0)))} ${resource}`)
      .join(" and ");
    return `Hold ${requestedOption.name}: it is not affordable yet. Gather ${missing || "the missing materials"} before committing to it, then ask again when the resource trend is moving in the right direction.`;
  }
  const negativeUpgradeQuestion = /\b(?:avoid|skip|don't|do not|never|not|cannot|can't)\b[^.?!]{0,55}\b(?:upgrade|improve|enhance)\b/.test(lowerQuestion);
  const negativeTrainingQuestion = /\b(?:avoid|skip|don't|do not|never|not|cannot|can't)\b[^.?!]{0,55}\b(?:train|training|apprentice)\b/.test(lowerQuestion);
  const negativeFocusQuestion = /\b(?:avoid|skip|don't|do not|never|not|cannot|can't)\b[^.?!]{0,55}\b(?:inspect|check|visit|focus)\b/.test(lowerQuestion);
  if (negativeTrainingQuestion && trainingQuestion) {
    return `Hold training for now: you asked not to commit the School to another apprentice. Keep the current opening available until the village's next need is clearer.`;
  }
  if (negativeFocusQuestion && focusQuestion && namedFocusTarget) {
    return `Leave ${namedFocusTarget.name} alone for now: you asked not to inspect or focus it. Watch its status from the village view instead.`;
  }
  if (negativeUpgradeQuestion && upgradeQuestion && namedUpgradeBuilding) {
    return `Hold ${namedUpgradeBuilding.name} at its current improvement: you asked not to upgrade it. Keep its materials available for another bottleneck.`;
  }
  if (resourceQuestion) {
    const held = Math.floor(Number(resources[namedResource]) || 0);
    const capacity = Math.floor(Number(snapshot.storage?.[namedResource]) || 0);
    const trend = Math.round((Number(snapshot.trends?.[namedResource]) || 0) * 10) / 10;
    const runway = advisorResourceRunway(snapshot.resources, snapshot.trends)[namedResource];
    const storageLabel = capacity ? `${held} of ${capacity} storage` : `${held} held`;
    if (trend < -0.1) {
      return `Resource: ${namedResource} is at ${storageLabel}, falling about ${Math.abs(trend)} per minute${runway != null ? `, with roughly ${formatAdvisorRunway(runway)} left at this pace` : ""}. Best move: stabilize ${namedResource} before making a new commitment. Watch for a producer missing input, a full output store, or a hungry household.`;
    }
    if (trend > 0.1) {
      return `Resource: ${namedResource} is at ${storageLabel}, climbing about ${trend} per minute. Let the supply build unless a current worksite is waiting on it; the next useful checkpoint is a full delivery cycle.`;
    }
    return `Resource: ${namedResource} is at ${storageLabel} and steady. No reliable runway or shortage is visible in this snapshot; keep an eye on the next delivery before spending it on a major commitment.`;
  }

  if (forecastQuestion && !forecastResource) {
    return "Forecast: no single resource is moving in a meaningful direction in this snapshot, so there is no reliable better-or-worse call yet. Recheck after the next delivery cycle; a producer waiting for input, a full store, or a change in household demand will move the forecast first.";
  }

  if (forecastQuestion && forecastResource) {
    const held = Math.floor(Number(resources[forecastResource]) || 0);
    const trend = Math.round((Number(snapshot.trends?.[forecastResource]) || 0) * 10) / 10;
    const runway = snapshot.runway?.[forecastResource] != null
      ? Number(snapshot.runway[forecastResource])
      : null;
    const direction = trend < -0.1
      ? `It is currently falling about ${Math.abs(trend)} per minute${runway != null ? `, with roughly ${formatAdvisorRunway(runway)} left at this pace` : ""}.`
      : trend > 0.1
        ? `It is currently climbing about ${trend} per minute.`
        : "Its current trend is steady, so there is no reliable directional forecast yet.";
    return `Forecast: ${forecastResource} is at ${held} held. ${direction} The forecast improves if its producer has input, workers have clear routes, and storage can receive the output; it worsens if a worksite waits, a store fills, or household demand rises. Check the ${forecastResource} trend again after the next delivery cycle.`;
  }

  if (/since|last check|last visit|what changed|what's new|catch me up|different/.test(lowerQuestion)) {
    return buildLocalAdvisorPulseReply(snapshot);
  }

  if (trainingQuestion) {
    if (!school) {
      return "Training: the village has no completed School yet. Build one first, then I can match an apprentice to its available post.";
    }
    if (school.trainingSession) {
      return `Training: the School is already training a ${school.trainingSession.label.toLowerCase()}${school.trainingSession.waiting ? " and waiting for housing" : ` for about ${Math.ceil(school.trainingSession.remaining)} more seconds`}. Let that apprentice finish before choosing another.`;
    }
    if (requestedTraining && !requestedTraining.canTrain) {
      return `Training: a ${requestedTraining.label.toLowerCase()} is not available yet. ${requestedTraining.reason || "The School has no open post for that role."}`;
    }
    if (trainingChoice) {
      const workplace = trainingChoice.posts == null
        ? "a flexible pair of hands for construction"
        : `${Math.max(1, Number(trainingChoice.posts) - Number(trainingChoice.trained || 0) - Number(trainingChoice.pending || 0))} open ${trainingChoice.label.toLowerCase()} post${Number(trainingChoice.posts) - Number(trainingChoice.trained || 0) - Number(trainingChoice.pending || 0) === 1 ? "" : "s"}`;
      if (trainingOutcomeQuestion) {
        return `Watch for: after you click Train ${trainingChoice.label}, the School should show an active session, then the graduate should arrive and fill one of the ${workplace}. Check that the post stops reporting an empty slot before choosing another apprentice.`;
      }
      if (trainingImpactQuestion) {
        return `Impact: training a ${trainingChoice.label} would fill ${workplace}, turning the School's next cycle into a working hand for the village instead of another unassigned villager. The change begins only after you click Train ${trainingChoice.label}; watch that post for its first useful cycle.`;
      }
      return `Train ${trainingChoice.label}: the School can prepare ${trainingChoice.label.toLowerCase()}s for ${workplace}. This is the clearest training slot in the current snapshot; start it only if you want to commit the School for the next cycle.`;
    }
    return "Training: every School option is occupied or blocked. Check housing and completed work posts before training another villager.";
  }

  if (workforceQuestion && namedWorkerRole) {
    const waiting = roleWorkers.filter(
      (worker) => worker.waitingForInput || worker.waitingForSpace || worker.waitingForInn || worker.deliveryRetry || worker.hungry,
    ).length;
    const roles = roleWorkers.length === 1 ? "villager is" : "villagers are";
    return `Workforce: ${roleWorkers.length} ${namedWorkerRole.toLowerCase()} ${roles} in the current snapshot${waiting ? `; ${waiting} ${waiting === 1 ? "is" : "are"} waiting` : " and none report a blocked state"}.`;
  }
  if (workforceQuestion && /waiting|idle|stuck|blocked/.test(lowerQuestion)) {
    const waitingList = (snapshot.workers || [])
      .filter((worker) => worker.waitingForInput || worker.waitingForSpace || worker.waitingForInn || worker.deliveryRetry || worker.hungry)
      .slice(0, 4);
    return waitingList.length
      ? `Workforce: ${waitingList.map((worker) => `${worker.type} (${worker.status || "waiting"})`).join(", ")}. Inspect the first bottleneck before adding another job.`
      : "Workforce: no villager currently reports a waiting, hungry, or blocked state.";
  }

  if (upgradeQuestion && namedUpgradeBuilding && !namedUpgradeTarget && namedUpgradeBuilding.upgrade) {
    return `${namedUpgradeBuilding.name} is already improved with ${namedUpgradeBuilding.upgrade}. Keep it working unless another bottleneck needs the resources.`;
  }
  if (upgradeQuestion && upgradeTarget) {
    const upgradeCost = Object.entries(upgradeTarget.upgradeCost || {})
      .filter(([, amount]) => Number(amount) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" and ");
    return `Upgrade ${upgradeTarget.name}: ${upgradeTarget.upgradeName} would ${CATALOG[upgradeTarget.type]?.upgrade?.effect || "improve this worksite"}. It costs ${upgradeCost || "the available materials"}.`;
  }
  if (feastQuestion) {
    if (negativeFeastQuestion) {
      return "Skip the feast for now: keep 30 food in reserve until a large construction cycle or a fuller pantry makes the boost worthwhile.";
    }
    if (snapshot.feast?.remaining > 0) {
      return `The village feast is already underway for about ${Math.ceil(snapshot.feast.remaining)} more seconds. Let builders enjoy the faster rhythm.`;
    }
    const food = Math.floor(Number(resources.food) || 0);
    if (food < 30) {
      return `Hold the feast: the village needs ${30 - food} more food. A feast spends 30 food for 45 seconds of 25% faster construction.`;
    }
    return "Start a feast: spend 30 food for 45 seconds of 25% faster construction. It is worth using while a large build is receiving materials.";
  }
  if (chapterQuestion) {
    if (!openChapterGoal) {
      return "The chapter board is clear. Keep building the village you want, and let the next story emerge from your choices.";
    }
    return `Next chapter: ${openChapterGoal.title} is at ${openChapterGoal.progress}/${openChapterGoal.target}. Why it matters: ${openChapterGoal.description} Reward: ${openChapterGoal.reward}.`;
  }
  if (/\b(?:what happened|what just|recent|news|history|activity|log)\b/.test(lowerQuestion)) {
    const activity = (snapshot.activity || []).filter(Boolean).slice(0, 3);
    return activity.length
      ? `Chronicle: ${activity.join(" ")} Watch for: ${watchFor}`
      : "Chronicle: the village has no recent entries to report yet. Let one work cycle or delivery complete, then ask again.";
  }
  const decliningResource = Object.entries(snapshot.trends || {}).find(
    ([, value]) => Number(value) < -1,
  );
  if (
    decliningResource &&
    !/when can|how soon|how long until|when will.*afford|can i afford/.test(lowerQuestion) &&
    /trend|declin|running out|shortage|losing/.test(lowerQuestion)
  ) {
    const [resource, trend] = decliningResource;
    return `Best move: stabilize ${resource}. Why: the current village trend is losing about ${Math.abs(Math.floor(Number(trend)))} ${resource} per minute. Watch for a producer that needs input, a full output store, or a hungry household.`;
  }
  const runwayQuestion = /how long|last|run out|runout|survive|runway|empty/.test(lowerQuestion);
  const namedRunwayResource = ADVISOR_RESOURCE_KEYS.find((resource) => lowerQuestion.includes(resource));
  const runwayResource = namedRunwayResource || Object.entries(snapshot.runway || {})
    .find(([, minutes]) => Number.isFinite(Number(minutes)) && Number(minutes) <= 5)?.[0];
  if (runwayQuestion && runwayResource) {
    const minutes = snapshot.runway?.[runwayResource];
    if (minutes != null && Number.isFinite(Number(minutes))) {
      return `Runway: ${runwayResource} should last ${formatAdvisorRunway(minutes)} at the current pace. Best move: stabilize ${runwayResource} before spending it on another project, then watch the ${runwayResource} trend for a minute.`;
    }
    return `Runway: the village is not currently losing ${runwayResource}, so there is no reliable depletion timer. Watch its trend before committing the stockpile.`;
  }
  const deliveryQuestion = /delivery|deliver|arrive|finish|complete/.test(lowerQuestion)
    || /when|how soon|how long/.test(lowerQuestion);
  const namedDeliveryTarget = (snapshot.buildings || []).find(
    (building) => building.name && lowerQuestion.includes(building.name.toLowerCase()) && Number(building.nextDelivery) > 0,
  );
  const nextDeliveryTarget = namedDeliveryTarget || (snapshot.buildings || [])
    .filter((building) => Number(building.nextDelivery) > 0)
    .sort((a, b) => Number(a.nextDelivery) - Number(b.nextDelivery))[0];
  if (deliveryQuestion && nextDeliveryTarget) {
    const seconds = Math.max(1, Math.ceil(Number(nextDeliveryTarget.nextDelivery)));
    return `Timing: ${nextDeliveryTarget.name}'s next delivery or work cycle is expected in about ${seconds} seconds. Watch whether the output reaches storage before committing to another project.`;
  }
  const previewQuestion = /\b(?:preview|simulate|model|what if|tradeoff|worth)\b/.test(lowerQuestion);
  const namedScenarioOption = snapshot.buildOptions.find(
    (option) => option.name && lowerQuestion.includes(option.name.toLowerCase()),
  );
  if (previewQuestion && namedScenarioOption) {
    const scenarioCost = Object.entries(namedScenarioOption.cost || {})
      .filter(([, amount]) => Number(amount) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" and ");
    const affordability = namedScenarioOption.affordable
      ? "It is affordable in this snapshot."
      : "It is not affordable yet, so this stays a plan rather than a commitment.";
    return `Preview: ${namedScenarioOption.name}. Cost: ${scenarioCost || "materials ready"}. Result: ${namedScenarioOption.effect} ${affordability}`;
  }
  const timingQuestion = /when can|how soon|how long until|when will.*afford|can i afford/.test(lowerQuestion);
  const namedBuildOption = snapshot.buildOptions.find(
    (option) => option.name && lowerQuestion.includes(option.name.toLowerCase()),
  );
  if (timingQuestion && namedBuildOption) {
    const missing = Object.entries(namedBuildOption.cost || {})
      .filter(([resource, amount]) => Number(resources[resource] || 0) < Number(amount))
      .map(([resource, amount]) => [
        resource,
        Math.max(0, Number(amount) - Number(resources[resource] || 0)),
      ]);
    if (!missing.length) {
      return `Timing: the ${namedBuildOption.name} is affordable now. Best move: build the ${namedBuildOption.name}, then watch its first delivery or work cycle.`;
    }
    const waitTimes = missing.map(([resource, amount]) => {
      const trend = Number(snapshot.trends?.[resource]) || 0;
      return trend > 0.1 ? amount / trend : null;
    });
    const missingLabel = missing.map(([resource, amount]) => `${Math.ceil(amount)} ${resource}`).join(" and ");
    if (waitTimes.some((minutes) => minutes == null)) {
      return `Timing: the ${namedBuildOption.name} is missing ${missingLabel}, but there is no reliable ETA while one of those resources is not growing. Stabilize the inputs, then ask again.`;
    }
    return `Timing: the ${namedBuildOption.name} is missing ${missingLabel}. At the current pace it should be affordable in ${formatAdvisorRunway(Math.max(...waitTimes))}. Trends can change as workers and storage shift.`;
  }

  if (focusQuestion && namedFocusTarget) {
    const upgradeHint = namedFocusTarget.upgradeName && !namedFocusTarget.upgrade
      ? ` An available improvement is ${namedFocusTarget.upgradeName}.`
      : "";
    return `Inspect ${namedFocusTarget.name}: it is already in the village and its current status is ${namedFocusTarget.status || "available"}. ${namedFocusTarget.workers ? `${namedFocusTarget.workers} worker${namedFocusTarget.workers === 1 ? " is" : "s are"} assigned.` : "No worker is assigned right now."}${upgradeHint}`;
  }
  if (focusQuestion && namedFocusWorker) {
    return `Inspect ${namedFocusWorker.type}: this villager is currently ${namedFocusWorker.status || "working in the village"}. Focus ${namedFocusWorker.type} to keep an eye on the next route or work cycle.`;
  }

  if (/\b(?:what now|what should i do|what should i build|what do i build|next move|next build|help me)\b/.test(lowerQuestion) && rescueSignal) {
    return `Hold the next build for a moment: ${Number(snapshot.blockedSites) || waitingWorkers} live bottleneck${(Number(snapshot.blockedSites) || waitingWorkers) === 1 ? " is" : "s are"} visible, but no single worksite is safe to name from this snapshot. Ask which worksite is blocked, then clear its route, input, or storage first.`;
  }

  if (blockedWorksite && /\b(?:blocked|stuck|waiting|bottleneck|slow|attention|which worksite)\b/.test(lowerQuestion)) {
    return `Inspect ${blockedWorksite.name}: it reports ${blockedWorksite.status || "a blocked work state"}. Check its missing input, route, or storage before adding another task.`;
  }

  if (lowerQuestion.includes("wait") || lowerQuestion.includes("stuck") || lowerQuestion.includes("blocked")) {
    return `Best move: inspect the ${attention?.title?.toLowerCase() || "waiting work"}. Why: ${waitingWorkers || snapshot.blockedSites ? `${waitingWorkers || snapshot.blockedSites} live bottleneck${(waitingWorkers || snapshot.blockedSites) === 1 ? " is" : "s are"} visible in the village snapshot.` : "the workers do not currently report a blocked input or route."} Watch for: a missing ingredient, a full output store, or a route that needs help.`;
  }
  if (lowerQuestion.includes("dispatch")) {
    return `Dispatch: ${recentChronicle} Opportunity: ${nextBuild} Risk: ${watchFor} Next minute: ${waitingWorkers ? "inspect the waiting worksite and clear its bottleneck" : "place the next build, then watch the first delivery arrive"}. ${bestMove}`;
  }
  if (lowerQuestion.includes("council")) {
    return `Quartermaster: ${choice ? `${choice.name} is affordable at ${cost || "the current materials"}.` : "Hold resources until a useful option opens."} Builder: ${waitingWorkers ? "Clear the waiting work before adding another job." : "Give carriers a clear route to storage."} Chronicler: ${watchFor} Shared call: ${choice ? `build the ${choice.name} and watch its first cycle.` : "keep the village moving and watch the stores."} ${choice ? bestMove : ""}`.trim();
  }
  if (lowerQuestion.includes("compare") || lowerQuestion.includes("options")) {
    const alternatives = choices.slice(0, 2);
    if (alternatives.length > 1) {
      const comparison = alternatives
        .map((option) => {
          const optionCost = Object.entries(option.cost || {})
            .filter(([, amount]) => Number(amount) > 0)
            .map(([resource, amount]) => `${amount} ${resource}`)
            .join(" and ");
          return `${option.name}: ${optionCost || "materials ready"}, ${option.effect}`;
        })
        .join(" Compare ");
      return `Compare: ${comparison}. ${bestMove} Watch for: ${watchFor}`;
    }
  }
  if (planningQuestion || lowerQuestion.includes("next chapter")) {
    return `Three-step plan: 1. ${nextBuild} 2. ${workforceMove} 3. Watch for: ${watchFor} ${bestMove}`;
  }
  if (choice) {
    return `${bestMove} Watch for: ${watchFor}`;
  }
  return `${bestMove} Watch for: ${attention?.detail || `resources are ${Object.entries(resources).map(([resource, amount]) => `${amount} ${resource}`).slice(0, 3).join(", ")}.`}`;
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
        {trendValue !== 0 ? (
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
const STARTER_TOOL_TYPES = ["house", "farm", "grainfield", "lumberyard", "mine", "road"];
const goalsDismissedStorageKey = (villageName) =>
  `hearth-ui-goals-dismissed-v1:${String(villageName || "Willowbrook")}`;
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
  const [showAll, setShowAll] = useState(false);
  const visibleEntries = showAll
    ? CATALOG_ENTRIES
    : CATALOG_ENTRIES.filter(({ type }) => STARTER_TOOL_TYPES.includes(type) || type === selected);
  return (
    <nav
      id="building-palette"
      className={`build-palette parchment ${paletteOpen ? "is-open" : "is-collapsed"}`}
      aria-hidden={!paletteOpen}
      inert={!paletteOpen}
      aria-label="Village building and path tools"
    >
      {visibleEntries.map(({ type, catalog: c, costs, costSummary }) => {
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
        className="build-more"
        aria-expanded={showAll}
        aria-controls="building-palette"
        aria-label={showAll ? "Show starter building tools" : "Show more building tools"}
        onClick={() => setShowAll((open) => !open)}
        disabled={!loaded || !!error}
      >
        <span className="build-more-icon">{showAll ? "−" : "+"}</span>
        <span>{showAll ? "Starter tools" : "More buildings"}</span>
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
    advisorSpeechRef = useRef(),
    importFileRef = useRef(),
    advisorAbortRef = useRef(),
    goalsTabRef = useRef(),
    paletteOpenRef = useRef(true),
    paletteBeforeDetailRef = useRef(true),
    paletteBeforePlacementRef = useRef(
      typeof window !== "undefined" && !window.matchMedia("(max-width: 760px)").matches,
    ),
    detailOpenRef = useRef(false);
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
    [goals, setGoals] = useState(true),
    [grid, setGrid] = useState(false),
    [paletteOpen, setPaletteOpen] = useState(() => {
      if (typeof window === "undefined") return true;
      return !window.matchMedia("(max-width: 760px)").matches;
    }),
    [touchLayout, setTouchLayout] = useState(() => {
      if (typeof window === "undefined" || !window.matchMedia) return false;
      return window.matchMedia("(max-width: 760px)").matches;
    }),
    [menu, setMenu] = useState(false),
    [overview, setOverview] = useState(false),
    [reset, setReset] = useState(false),
    [rename, setRename] = useState(false),
    [nameDraft, setNameDraft] = useState("Willowbrook"),
    [advisorOpen, setAdvisorOpen] = useState(false),
    [advisorInput, setAdvisorInput] = useState(""),
    [advisorMessages, setAdvisorMessages] = useState(() => readAdvisorMessages("Willowbrook")),
    [advisorLens, setAdvisorLens] = useState(() => readAdvisorLens("Willowbrook")),
    [advisorPreview, setAdvisorPreview] = useState(null),
    [advisorRoute, setAdvisorRoute] = useState(() => readAdvisorRoute("Willowbrook")),
    [advisorWatch, setAdvisorWatch] = useState(() => readAdvisorWatch("Willowbrook")),
    [advisorWatchEvents, setAdvisorWatchEvents] = useState(() => readAdvisorWatchEvents("Willowbrook")),
    [advisorWatchLogOpen, setAdvisorWatchLogOpen] = useState(false),
    [advisorSavedOpen, setAdvisorSavedOpen] = useState(false),
    [advisorToolsOpen, setAdvisorToolsOpen] = useState(false),
    [advisorCopied, setAdvisorCopied] = useState(false),
    [advisorSpeaking, setAdvisorSpeaking] = useState(false),
    [advisorLoading, setAdvisorLoading] = useState(false),
    [advisorError, setAdvisorError] = useState(null),
    [advisorAtLatest, setAdvisorAtLatest] = useState(true);
  const [importOpen, setImportOpen] = useState(false),
    [importPreview, setImportPreview] = useState(null);
  paletteOpenRef.current = paletteOpen;
  detailOpenRef.current = Boolean(detail);
  const toastTimer = useRef();
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const onChange = (e) => setTouchLayout(Boolean(e.matches));
    setTouchLayout(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", onChange);
    } else {
      mediaQuery.addListener?.(onChange);
    }
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", onChange);
      } else {
        mediaQuery.removeListener?.(onChange);
      }
    };
  }, []);
  const goalSnapshot = useRef({
    ready: false,
    complete: false,
    builtHouse: false,
    builtFarm: false,
    gatheredTimber: false,
  });
  const modalReturnRef = useRef();
  const placementFocusReturn = useRef(null);
  const inspectorFocusReturn = useRef(null);
  const advisorHistoryKeyRef = useRef(null);
  const advisorWatchSignatureRef = useRef("");
  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);
  const openModal = (setter, returnTarget) => {
    modalReturnRef.current = returnTarget || document.activeElement;
    setAdvisorOpen(false);
    setAdvisorToolsOpen(false);
    setter(true);
  };
  const closeMenu = (restoreFocus = false) => {
    menuStateRef.current = false;
    setMenu(false);
    if (restoreFocus)
      requestAnimationFrame(() => menuButtonRef.current?.focus());
  };
  const openGoals = () => {
    setGoals(true);
    try {
      window.localStorage.removeItem(goalsDismissedStorageKey(state.name));
    } catch {
      // The menu can always reopen the goals card without storage.
    }
  };
  const showGoals = () => {
    openGoals();
    closeMenu();
    requestAnimationFrame(() => goalsButtonRef.current?.focus());
  };
  useEffect(() => {
    if (!loaded) return;
    try {
      setGoals(window.localStorage.getItem(goalsDismissedStorageKey(state.name)) !== "1");
    } catch {
      setGoals(true);
    }
  }, [loaded, state.name]);
  const closeDetail = (restoreFocus = false) => {
    const returnTarget = inspectorFocusReturn.current;
    inspectorFocusReturn.current = null;
    const reopenPalette = paletteBeforeDetailRef.current;
    paletteBeforeDetailRef.current = true;
    detailOpenRef.current = false;
    game.current?.clearHighlight();
    setDetail(null);
    setPaletteOpen(reopenPalette);
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
      // The inspector panel sits over the same bottom-left corner as the
      // carousel, so tuck it away while a building or worker is inspected,
      // then restore the player's previous drawer choice when it closes.
      if (!detailOpenRef.current) paletteBeforeDetailRef.current = paletteOpenRef.current;
      detailOpenRef.current = true;
      setPaletteOpen(false);
    } else {
      inspectorFocusReturn.current = null;
      if (detailOpenRef.current) {
        setPaletteOpen(paletteBeforeDetailRef.current);
        paletteBeforeDetailRef.current = true;
      }
      detailOpenRef.current = false;
    }
    setDetail(nextDetail);
  };
  const syncPlacementComplete = () => {
    setSelected(null);
    setBuildDetailsOpen(false);
    setHover(null);
    setGrid(false);
    setPaletteOpen(paletteBeforePlacementRef.current);
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
            setThumbs({ ...images });
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
      if (!selected) paletteBeforePlacementRef.current = paletteOpenRef.current;
      // Hide the carousel once placement starts so it doesn't cover the
      // ground the player is trying to place on; it reopens when placement
      // ends (see endPlacement).
      setPaletteOpen(false);
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
      setPaletteOpen(paletteBeforePlacementRef.current);
    }
    setSelected(next);
    setBuildDetailsOpen(false);
    setHover(null);
    setDetail(null);
    setAdvisorOpen(false);
    setAdvisorToolsOpen(false);
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
    setPaletteOpen(paletteBeforePlacementRef.current);
  };
  const cancel = (restoreFocus = false) => {
    const returnTarget = placementFocusReturn.current;
    placementFocusReturn.current = null;
    endPlacement();
    if (restoreFocus) requestAnimationFrame(() => returnTarget?.focus());
  };
  const speed = (s) => {
    if (!game.current) return;
    if (s <= 0) return;
    if (game.current.storageConflict) {
      notify("Reload this tab before continuing the simulation.");
      return;
    }
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
          setAdvisorToolsOpen(false);
          setImportOpen(false);
          setImportPreview(null);
          return;
        }
        if (menu) {
          closeMenu(true);
          return;
        }
        if (detail || document.querySelector(".inspector")) {
          closeDetail(true);
          return;
        }
        if (goals) {
          setGoals(false);
          window.setTimeout(() => document.querySelector(".menu-button")?.focus(), 0);
          return;
        }
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
      const placementConfirmFocused =
        e.target instanceof HTMLElement && e.target.closest?.(".placement-confirm");
      if (placementConfirmFocused && e.key === "Enter") return;
      if (
        !placementConfirmFocused &&
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
  const displayedPlacementHint = touchLayout
    ? placementHint
        .replace(/^Click/, "Tap")
        .replace(/ · R to rotate/g, "")
        .replace(/ · Esc to cancel/g, "")
    : placementHint;
  const activeEffect =
    activeType === "house"
      ? "+2 room in the village · makes space for new villagers"
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
            action: "focus",
          }
        : null
      : {
          type: "farm",
          label: "Build a new farmhouse",
          detail: "A steady food supply keeps every new home thriving.",
        }
    : {
        type: "house",
        label: "Build a new cottage",
        detail: "Make room for two more workers at the edge of town.",
      };
  const nextGoalBuilding =
    nextGoal?.action === "focus"
      ? state.buildings.find(
          (building) => building.type === nextGoal.type && Number(building.progress) >= 1,
        )
      : null;
  const chooseNextGoal = (event) => {
    if (
      nextGoal?.action === "focus" &&
      nextGoalBuilding &&
      game.current?.focusBuilding(nextGoalBuilding.id)
    ) {
      notify(`Showing ${CATALOG[nextGoal.type]?.name || "the worksite"}.`);
      return;
    }
    if (nextGoal) choose(nextGoal.type, event.currentTarget);
  };
  const advisorBrief = useMemo(
    () => buildAdvisorBrief(state, nextGoal),
    [state, nextGoal],
  );
  const advisorPrompts = [
    {
      title: "Catch me up",
      detail: "See what changed since your last advisor check.",
      question: "What changed since my last advisor check?",
      icon: History,
    },
    ...(advisorBrief.items.length ? advisorBrief.items : advisorPromptFallbacks),
  ].slice(0, 3);
  const latestUserMessage = [...advisorMessages]
    .reverse()
    .find((message) => message.role === "user");
  const latestAssistantIndex = advisorMessages.reduce(
    (latest, message, index) => (message.role === "assistant" ? index : latest),
    -1,
  );
  const advisorFollowups = buildAdvisorFollowups(
    latestAssistantIndex >= 0 ? advisorMessages[latestAssistantIndex] : null,
    latestUserMessage,
  );
  const savedAdvisorMessages = advisorMessages.filter(
    (message) => message.role === "assistant" && message.helpful,
  );
  const tryAnotherAdvisorAngle = () => {
    if (!latestUserMessage || advisorLoading) return;
    askAdvisor(
      `Take a genuinely different angle on this question. Keep the answer grounded in the current village state and do not repeat the previous framing. Original question: ${latestUserMessage.prompt || latestUserMessage.content}`,
      "Try another angle.",
    );
  };
  const refreshLatestAdvisor = () => {
    if (!latestUserMessage || advisorLoading) return;
    askAdvisor(latestUserMessage.prompt || latestUserMessage.content, latestUserMessage.content);
  };
  const scrollAdvisorToLatest = useCallback((behavior = "smooth") => {
    const container = advisorMessagesRef.current;
    if (!container) return;
    const messages = container.querySelectorAll(".advisor-message");
    const latestMessage = messages[messages.length - 1];
    const messageTop = latestMessage
      ? latestMessage.offsetTop - container.offsetTop - 5
      : 0;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    container.scrollTo({
      top: Math.max(0, messageTop),
      behavior: behavior === "smooth" && reducedMotion ? "auto" : behavior,
    });
    setAdvisorAtLatest(true);
  }, []);
  const pinAdvisorRoute = (content) => {
    const route = buildAdvisorRoute(content);
    if (!route) {
      notify("That advisor note does not contain a three-step route yet.");
      return;
    }
    const pinnedRoute = {
      ...route,
      day: Math.max(1, Math.floor(Number(state.day) || 1)),
    };
    setAdvisorRoute(pinnedRoute);
    writeAdvisorRoute(state.name, pinnedRoute, state.day);
    notify("Three-step route pinned beside the village advice.");
  };
  const clearAdvisorRoute = () => {
    setAdvisorRoute(null);
    try {
      window.localStorage.removeItem(advisorRouteStorageKey(state.name));
    } catch {
      // A pinned route is a convenience; the village save remains authoritative.
    }
    notify("Pinned route cleared.");
  };
  const toggleAdvisorRouteStep = (stepIndex) => {
    if (!advisorRoute) return;
    const nextRoute = {
      ...advisorRoute,
      steps: advisorRoute.steps.map((step, index) =>
        index === stepIndex ? { ...step, done: !step.done } : step,
      ),
    };
    setAdvisorRoute(nextRoute);
    writeAdvisorRoute(state.name, nextRoute, state.day);
  };
  const copyAdvisorAnswer = async (content) => {
    const text = String(content || "").trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setAdvisorCopied(true);
      notify("Advisor note copied to your clipboard.");
      window.setTimeout(() => setAdvisorCopied(false), 1800);
    } catch {
      notify("The browser did not allow copying this advice.");
    }
  };
  const speakAdvisorAnswer = (content) => {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      notify("This browser does not offer spoken advisor notes.");
      return;
    }
    if (advisorSpeaking) {
      window.speechSynthesis.cancel();
      advisorSpeechRef.current = null;
      setAdvisorSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(
      String(content || "")
        .replace(/\*\*/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    );
    utterance.rate = 0.96;
    utterance.pitch = 1.02;
    utterance.onend = () => {
      if (advisorSpeechRef.current === utterance) {
        advisorSpeechRef.current = null;
        setAdvisorSpeaking(false);
      }
    };
    utterance.onerror = utterance.onend;
    advisorSpeechRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setAdvisorSpeaking(true);
  };
  useEffect(() => {
    const syncHiddenSurfaces = () => {
      document
        .querySelectorAll(
          ".game-shell .objectives, .game-shell .goals-tab, .game-shell .advisor-panel, .game-shell .inspector, .game-shell .build-tooltip",
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
  }, [advisorOpen, buildDetailsOpen, detail, menu, modalOpen, paletteOpen, selected]);
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
  const showWheat =
    (state.resources.wheat || 0) > 0 ||
    (state.trends.wheat || 0) !== 0 ||
    state.buildings.some((building) => {
      const catalog = CATALOG[building.type];
      return catalog?.resource === "wheat" || catalog?.inputResource === "wheat";
    });
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
    return {
      completedBuildings,
      activeJobs,
      deliveries,
      workerTypeCounts,
      activeWorksites,
    };
  }, [overview, state.buildings, state.workers]);
  const completedBuildings = overviewStats?.completedBuildings || 0;
  const activeJobs = overviewStats?.activeJobs || 0;
  const deliveries = overviewStats?.deliveries || 0;
  const workerTypeCounts = overviewStats?.workerTypeCounts || {};
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
    paused: state.speed === 0,
    speed: state.speed,
    population: state.population,
    capacity: state.capacity,
    gathered: Math.floor(state.gathered || 0),
    inTransit: Math.floor(state.inTransit || 0),
    blockedSites: Math.floor(state.blockedSites || 0),
    resources: {
      wood: Math.floor(state.resources.wood || 0),
      stone: Math.floor(state.resources.stone || 0),
      food: Math.floor(state.resources.food || 0),
      wheat: Math.floor(state.resources.wheat || 0),
      wine: Math.floor(state.resources.wine || 0),
    },
    storage: {
      wood: Math.floor(state.storage.wood || 0),
      stone: Math.floor(state.storage.stone || 0),
      food: Math.floor(state.storage.food || 0),
      wheat: Math.floor(state.storage.wheat || 0),
      wine: Math.floor(state.storage.wine || 0),
    },
    trends: {
      wood: Number(state.trends.wood || 0),
      stone: Number(state.trends.stone || 0),
      food: Number(state.trends.food || 0),
      wheat: Number(state.trends.wheat || 0),
      wine: Number(state.trends.wine || 0),
    },
    runway: advisorResourceRunway(state.resources, state.trends),
    feast: state.feast ? { remaining: Math.max(0, Number(state.feast.remaining) || 0) } : null,
    buildings: state.buildings.map((building) => ({
      id: building.id,
      name: CATALOG[building.type]?.name || building.type,
      type: building.type,
      status: building.status || (building.progress < 1 ? "Building" : "Complete"),
      progress: building.progress,
      workers: building.workers || 0,
      cycles: building.cycles || 0,
      stock: building.stock || 0,
      stockCap: building.stockCap || 0,
      nextDelivery: building.nextDelivery,
      upgrade: building.upgrade || null,
      upgradeName: CATALOG[building.type]?.upgrade?.name || null,
      upgradeCost: CATALOG[building.type]?.upgrade?.cost || null,
      ...(building.type === "school" && building.progress >= 1
        ? {
            training: Array.isArray(building.training)
              ? building.training.map((option) => ({
                  type: option.type,
                  label: option.label,
                  canTrain: Boolean(option.canTrain),
                  reason: option.reason || null,
                  posts: option.posts,
                  trained: option.trained,
                  pending: option.pending,
                }))
              : [],
            trainingSession: building.trainingSession || null,
          }
        : {}),
    })),
    workers: state.workers.map((worker) => ({
      id: worker.id,
      type: worker.workerTypeLabel || "Builder",
      building: worker.buildingType ? CATALOG[worker.buildingType]?.name || worker.buildingType : "Unassigned",
      status: workerStatus(worker),
      waitingForInput: Boolean(worker.waitingForInput),
      waitingForSpace: Boolean(worker.waitingForSpace),
      waitingForInn: Boolean(worker.waitingForInn),
      deliveryRetry: Boolean(worker.deliveryRetry),
      hungry: Boolean(worker.hungry),
    })),
    goals: {
      cottage: builtHouse,
      farm: builtFarm,
      timber: state.gathered >= 100,
      next: nextGoal
        ? { type: nextGoal.type, label: nextGoal.label, detail: nextGoal.detail }
        : null,
      chapter: (state.chapterGoals || []).slice(0, 6).map((goal) => ({
        title: goal.title,
        description: goal.description,
        progress: Math.max(0, Math.floor(Number(goal.progress) || 0)),
        target: Math.max(0, Math.floor(Number(goal.target) || 0)),
        reward: goal.reward,
        completed: Boolean(goal.completed),
      })),
    },
    insights: advisorBrief.items.map(({ title, detail }) => `${title}: ${detail}`),
      buildOptions: CATALOG_ENTRIES.map(({ type, catalog }) => {
      const matchingBuildings = state.buildings.filter((building) => building.type === type);
      return {
        type,
        name: catalog.name,
        cost: catalog.cost,
        effect: catalog.effect,
        affordable: Object.entries(catalog.cost).every(
          ([resource, amount]) => (state.resources[resource] || 0) >= amount,
        ),
        built: matchingBuildings.filter((building) => building.progress === 1).length,
        underConstruction: matchingBuildings.filter((building) => building.progress < 1).length,
      };
      }),
    focus: detail?.type === "worker"
      ? {
          type: "worker",
          name: inspectedWorker?.workerTypeLabel || "Villager",
          status: inspectedWorkerStatus,
        }
      : inspected
        ? { type: inspected.type, name: CATALOG[inspected.type]?.name || inspected.type, status: inspected.status }
        : null,
    activity: recentActivity,
  });
  useEffect(() => {
    if (!loaded) return;
    const key = advisorStorageKey(state.name);
    if (advisorHistoryKeyRef.current === key) return;
    advisorHistoryKeyRef.current = key;
    setAdvisorMessages(readAdvisorMessages(state.name));
    setAdvisorPreview(null);
    setAdvisorError(null);
  }, [loaded, state.name]);
  useEffect(() => {
    if (!loaded) return;
    setAdvisorLens(readAdvisorLens(state.name));
    setAdvisorRoute(readAdvisorRoute(state.name));
    setAdvisorWatch(readAdvisorWatch(state.name));
    setAdvisorWatchEvents(readAdvisorWatchEvents(state.name));
    setAdvisorWatchLogOpen(false);
    advisorWatchSignatureRef.current = "";
  }, [loaded, state.name]);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(`${advisorStorageKey(state.name)}:lens`, advisorLens);
    } catch {
      // A private browsing session may refuse this preference; the chat still works.
    }
  }, [advisorLens, loaded, state.name]);
  useEffect(() => {
    if (!loaded || !advisorHistoryKeyRef.current) return;
    try {
      window.localStorage.setItem(
        advisorHistoryKeyRef.current,
        JSON.stringify(advisorMessages.slice(-12)),
      );
    } catch {
      // Advisor memory is a convenience; the village save remains authoritative.
    }
  }, [advisorMessages, loaded]);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(advisorWatchStorageKey(state.name), advisorWatch ? "on" : "off");
    } catch {
      // The watch preference is optional; village signals still work without storage.
    }
  }, [advisorWatch, loaded, state.name]);
  useEffect(() => {
    if (!loaded) return;
    writeAdvisorWatchEvents(state.name, advisorWatchEvents);
  }, [advisorWatchEvents, loaded, state.name]);
  useEffect(() => {
    if (!loaded || !advisorWatch) return;
    const signature = advisorBrief.items
      .filter((item) => item.tone === "attention")
      .map((item) => item.title)
      .join("|");
    const previous = advisorWatchSignatureRef.current;
    advisorWatchSignatureRef.current = signature;
    if (!previous || !signature || previous === signature) return;
    const newest = advisorBrief.items.find(
      (item) => item.tone === "attention" && !previous.includes(item.title),
    );
    if (!newest) return;
    setAdvisorWatchEvents((current) => [
      {
        day: state.day,
        period,
        title: newest.title,
        detail: newest.detail,
      },
      ...current.filter((event) => event.title !== newest.title),
    ].slice(0, 4));
    notify(`Advisor watch: ${newest.title}.`);
  }, [advisorBrief, advisorWatch, loaded, notify, period, state.day]);
  useEffect(() => {
    if (!loaded || !advisorRoute) return;
    const routeStepComplete = (step) => {
      if (step.buildAction) {
        return state.buildings.some(
          (building) => building.type === step.buildAction && Number(building.progress) >= 1,
        );
      }
      if (step.trainingAction) {
        return state.buildings.some(
          (building) =>
            building.type === "school" &&
            building.trainingSession?.label === step.trainingAction,
        );
      }
      return false;
    };
    let changed = false;
    const nextSteps = advisorRoute.steps.map((step) => {
      if (step.done || !routeStepComplete(step)) return step;
      changed = true;
      return { ...step, done: true };
    });
    if (!changed) return;
    const nextRoute = { ...advisorRoute, steps: nextSteps };
    setAdvisorRoute(nextRoute);
    writeAdvisorRoute(state.name, nextRoute, state.day);
    if (nextSteps.every((step) => step.done)) {
      notify("Pinned route complete. The village has carried out the advisor's plan.");
    }
  }, [advisorRoute, loaded, notify, state.buildings, state.day, state.name]);
  useEffect(
    () => () => {
      advisorAbortRef.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );
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
    const previous = goalSnapshot.current;
    if (previous.ready && allGoals && !previous.complete) {
      notify(`${state.name} is flourishing. All three goals are complete!`);
    } else if (previous.ready && builtHouse && !previous.builtHouse) {
      notify("Cottage complete — your village has more room to grow.");
    } else if (previous.ready && builtFarm && !previous.builtFarm) {
      notify("Farmhouse complete — a steadier food supply is on its way.");
    } else if (previous.ready && state.gathered >= 100 && !previous.gatheredTimber) {
      notify("100 timber gathered — the village is ready for its next build.");
    }
    goalSnapshot.current = {
      ready: true,
      complete: allGoals,
      builtHouse,
      builtFarm,
      gatheredTimber: state.gathered >= 100,
    };
  }, [allGoals, builtFarm, builtHouse, loaded, state.gathered, state.name]);
  const saveName = (event) => {
    event.preventDefault();
    const next = nameDraft.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!next) {
      notify("Give your village a name.");
      return;
    }
    let goalsWereDismissed = false;
    try {
      goalsWereDismissed =
        window.localStorage.getItem(goalsDismissedStorageKey(state.name)) === "1";
    } catch {
      // The village name can still change when browser storage is unavailable.
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
    try {
      const nextGoalsKey = goalsDismissedStorageKey(savedName);
      if (goalsWereDismissed) window.localStorage.setItem(nextGoalsKey, "1");
      else window.localStorage.removeItem(nextGoalsKey);
    } catch {
      // The goals card remains usable when its convenience preference cannot persist.
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
      notify("Reload this tab before restoring the village backup.");
      return;
    }
    if (!importPreview || !game.current?.importVillage(importPreview.raw)) {
      notify(
        game.current?.storageConflict
          ? "This tab is out of date. Reload to restore the village backup."
          : "This village could not be restored.",
      );
      return;
    }
    window.location.reload();
  };
  const askAdvisor = async (question, displayQuestion = question) => {
    const prompt = question.trim().slice(0, 1200);
    const content = displayQuestion.trim().slice(0, 240);
    if (!prompt || !content || advisorLoading) return;
    const lens = ADVISOR_LENSES[advisorLens] || ADVISOR_LENSES.steward;
    const guidedPrompt = `${lens.instruction}\n\nUser request:\n${prompt}`.slice(0, 1800);
    const nextMessages = [
      ...advisorMessages,
      { role: "user", content, ...(guidedPrompt !== content ? { prompt: guidedPrompt } : {}) },
    ].slice(-12);
    setAdvisorMessages(nextMessages);
    setAdvisorPreview(null);
    setAdvisorInput("");
    setAdvisorError(null);
    setAdvisorLoading(true);
    const advisorContext = {
      ...createAdvisorContext(),
      previousPulse: readAdvisorPulse(state.name),
    };
    writeAdvisorPulse(state.name, advisorContext);
    const controller = new AbortController();
    advisorAbortRef.current = controller;
    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: messageContent, prompt: hiddenPrompt }) => ({
            role,
            content: hiddenPrompt || messageContent,
            ...(role === "user" ? { displayContent: messageContent } : {}),
          })),
          context: advisorContext,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (advisorAbortRef.current !== controller) return;
      if (!response.ok) {
        throw new Error(data.error || "The advisor is unavailable right now.");
      }
      if (!data.message) throw new Error("The advisor returned an empty answer.");
      const action = inferAdvisorBuildAction(data.message);
      const previewAction = inferAdvisorPreviewAction(data.message) || action;
      const upgradeAction = inferAdvisorUpgradeAction(data.message);
      const feastAction = inferAdvisorFeastAction(data.message);
      const focusAction = inferAdvisorFocusAction(data.message);
      const workerFocusAction = inferAdvisorWorkerFocusAction(data.message);
      const trainingAction = inferAdvisorTrainingAction(data.message);
      const local = Boolean(data.local);
      setAdvisorMessages((current) =>
        [
          ...current,
          {
            role: "assistant",
            content: data.message,
            question: content,
            snapshot: { day: state.day, period },
            grounding: buildAdvisorGrounding(data.message, advisorContext),
            ...(local ? { local: true } : {}),
            ...(guidedPrompt !== content ? { prompt: guidedPrompt } : {}),
            ...(action ? { action } : {}),
            ...(previewAction ? { previewAction } : {}),
            ...(upgradeAction ? { upgradeAction } : {}),
            ...(feastAction ? { feastAction: true } : {}),
            ...(focusAction ? { focusAction } : {}),
            ...(workerFocusAction ? { workerFocusAction } : {}),
            ...(trainingAction ? { trainingAction } : {}),
          },
        ].slice(-12),
      );
      if (local) {
        setAdvisorError(
          data.notice ||
            "The advisor service is optional. Showing a local field note from your current village state.",
        );
      }
    } catch (requestError) {
      if (requestError?.name === "AbortError") return;
      if (advisorAbortRef.current !== controller) return;
      const fallback = buildLocalAdvisorReply(prompt, advisorContext, advisorBrief);
      const action = inferAdvisorBuildAction(fallback);
      const previewAction = inferAdvisorPreviewAction(fallback) || action;
      const upgradeAction = inferAdvisorUpgradeAction(fallback);
      const feastAction = inferAdvisorFeastAction(fallback);
      const focusAction = inferAdvisorFocusAction(fallback);
      const workerFocusAction = inferAdvisorWorkerFocusAction(fallback);
      const trainingAction = inferAdvisorTrainingAction(fallback);
      setAdvisorMessages((current) =>
        [
          ...current,
          {
            role: "assistant",
            content: fallback,
            question: content,
            local: true,
            snapshot: { day: state.day, period },
            grounding: buildAdvisorGrounding(fallback, advisorContext),
            ...(guidedPrompt !== content ? { prompt: guidedPrompt } : {}),
            ...(action ? { action } : {}),
            ...(previewAction ? { previewAction } : {}),
            ...(upgradeAction ? { upgradeAction } : {}),
            ...(feastAction ? { feastAction: true } : {}),
            ...(focusAction ? { focusAction } : {}),
            ...(workerFocusAction ? { workerFocusAction } : {}),
            ...(trainingAction ? { trainingAction } : {}),
          },
        ].slice(-12),
      );
      setAdvisorInput("");
      setAdvisorError("The advisor service is optional. Showing a local field note from your current village state.");
    } finally {
      if (advisorAbortRef.current === controller) {
        advisorAbortRef.current = null;
        setAdvisorLoading(false);
        requestAnimationFrame(() => advisorInputRef.current?.focus());
      }
    }
  };
  const prepareAdvisorBuild = (type) => {
    const entry = CATALOG_ENTRIES.find((candidate) => candidate.type === type);
    if (!entry || type === "road") return;
    const missing = missingAdvisorBuildCosts(type, state.resources)
      .map(([resource, amount]) => `${amount} ${resource}`);
    if (missing.length) {
      notify(`The advisor suggested ${entry.catalog.name}, but you still need ${missing.join(" and ")}.`);
      return;
    }
    choose(type);
    notify(`${entry.catalog.name} is ready. Choose a clear patch to begin placement.`);
  };
  const showAdvisorPreview = (type) => {
    const scenario = buildAdvisorScenario(type, state.resources, state.storage);
    if (!scenario) return;
    setAdvisorPreview({ type, ...scenario });
  };
  const prepareAdvisorUpgrade = (type) => {
    const target = state.buildings.find(
      (building) =>
        building.type === type &&
        Number(building.progress) >= 1 &&
        CATALOG[type]?.upgrade &&
        !building.upgrade,
    );
    const name = CATALOG[type]?.name || type;
    const upgrade = CATALOG[type]?.upgrade;
    if (!target || !upgrade) {
      notify(`${name} has no available upgrade right now.`);
      return;
    }
    const missing = missingAdvisorUpgradeCosts(type, state.resources)
      .map(([resource, amount]) => `${amount} ${resource}`);
    if (missing.length) {
      notify(`${upgrade.name} needs ${missing.join(" and ")} before it can improve ${name}.`);
      return;
    }
    if (game.current?.upgradeBuilding(target.id)) {
      notify(`${name} upgraded: ${upgrade.name}.`);
    }
  };
  const prepareAdvisorFeast = () => {
    const food = Math.floor(Number(state.resources.food) || 0);
    if (state.feast?.remaining > 0) {
      notify("The village is already enjoying a feast.");
      return;
    }
    if (food < 30) {
      notify(`The feast needs ${30 - food} more food before it can begin.`);
      return;
    }
    if (game.current?.startFeast()) {
      notify("Village feast started: construction is 25% faster for 45 seconds.");
    }
  };
  const focusAdvisorBuilding = (type) => {
    const target = state.buildings.find((building) => building.type === type);
    const name = CATALOG[type]?.name || type;
    if (!target || !game.current?.focusBuilding(target.id)) {
      notify(`${name} is not in the village yet.`);
      return;
    }
    setAdvisorOpen(false);
    setAdvisorToolsOpen(false);
    notify(`Showing ${name}.`);
  };
  const focusAdvisorWorker = (workerType) => {
    const target = state.workers.find((worker) => worker.workerTypeLabel === workerType);
    if (!target || !game.current?.focusWorker(target.id)) {
      notify(`There is no ${workerType.toLowerCase()} in the village right now.`);
      return;
    }
    setAdvisorOpen(false);
    setAdvisorToolsOpen(false);
    notify(`Showing your ${workerType.toLowerCase()}.`);
  };
  const prepareAdvisorTraining = (workerTypeLabel) => {
    const school = state.buildings.find(
      (building) => building.type === "school" && Number(building.progress) >= 1,
    );
    const option = school?.training?.find((candidate) => candidate.label === workerTypeLabel);
    if (!school || !option) {
      notify("The village has no completed School training slot for that role.");
      return;
    }
    if (school.trainingSession) {
      notify("The School is already training an apprentice.");
      return;
    }
    if (!option.canTrain) {
      notify(option.reason || `${workerTypeLabel} training is not available yet.`);
      return;
    }
    if (game.current?.trainWorker(school.id, option.type)) {
      notify(`${workerTypeLabel} training started at the School.`);
    }
  };
  const cancelAdvisorRequest = () => {
    const controller = advisorAbortRef.current;
    if (!controller) return;
    controller.abort();
    advisorAbortRef.current = null;
    setAdvisorLoading(false);
    setAdvisorInput(latestUserMessage?.content || "");
    setAdvisorError("Request stopped. Edit the question or send it again when you are ready.");
    requestAnimationFrame(() => advisorInputRef.current?.focus({ preventScroll: true }));
  };
  const askAdvisorAboutFocus = () => {
    const subject = detail?.type === "worker"
      ? `${inspectedWorker?.workerTypeLabel || "villager"} currently ${inspectedWorkerStatus.toLowerCase()}`
      : inspected
        ? `${CATALOG[inspected.type]?.name || inspected.type} currently ${inspected.status || "complete"}`
        : "this part of my village";
    const question = detail?.type === "worker"
      ? `Inspect this ${subject}. Explain what this villager needs next, then give me one helpful action and one thing to watch.`
      : `Inspect this ${subject}. Explain its role, then tell me whether I should support, upgrade, or leave it alone right now.`;
    setAdvisorOpen(true);
    closeMenu();
    askAdvisor(question, `Tell me about ${subject}.`);
    closeDetail();
  };
  const startFreshAdvisor = () => {
    advisorAbortRef.current?.abort();
    advisorAbortRef.current = null;
    setAdvisorMessages([DEFAULT_ADVISOR_MESSAGE]);
    setAdvisorPreview(null);
    setAdvisorInput("");
    setAdvisorError(null);
    setAdvisorLoading(false);
    setAdvisorSavedOpen(false);
    try {
      if (advisorHistoryKeyRef.current)
        window.localStorage.removeItem(advisorHistoryKeyRef.current);
    } catch {
      // A private browsing session may refuse local storage; the chat still resets.
    }
    requestAnimationFrame(() => advisorInputRef.current?.focus());
  };
  const toggleAdvisorWatch = () => {
    const next = !advisorWatch;
    setAdvisorWatch(next);
    if (!next) advisorWatchSignatureRef.current = "";
      notify(next ? "Advisor watch is on." : "Advisor watch is quiet.");
  };
  const clearAdvisorWatchEvents = () => {
    setAdvisorWatchLogOpen(false);
    setAdvisorWatchEvents([]);
    writeAdvisorWatchEvents(state.name, []);
    notify("Advisor watch log cleared.");
  };
  const toggleAdvisorWatchLog = () => {
    const next = !advisorWatchLogOpen;
    setAdvisorWatchLogOpen(next);
    requestAnimationFrame(() => {
      const panel = document.querySelector(".advisor-panel");
      if (!panel) return;
      const maxScroll = Math.max(0, panel.scrollHeight - panel.clientHeight);
      panel.scrollTo({
        top: next ? Math.min(30, maxScroll) : 0,
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
      });
    });
  };
  const dismissAdvisorWatchEvent = (eventIndex) => {
    setAdvisorWatchLogOpen(false);
    setAdvisorWatchEvents((current) => current.filter((_, index) => index !== eventIndex));
    notify("Watch entry dismissed.");
  };
  const closeAdvisor = () => {
    setAdvisorOpen(false);
    setAdvisorToolsOpen(false);
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
    requestAnimationFrame(() => advisorInputRef.current?.focus({ preventScroll: true }));
  }, [advisorOpen]);
  useEffect(() => {
    if (!advisorOpen || !advisorMessagesRef.current) return;
    scrollAdvisorToLatest();
    const resizeObserver = window.ResizeObserver
      ? new ResizeObserver(() => scrollAdvisorToLatest("auto"))
      : null;
    resizeObserver?.observe(advisorMessagesRef.current);
    const handleResize = () => scrollAdvisorToLatest("auto");
    const handleScroll = (event) => {
      const container = event.currentTarget;
      const messages = container.querySelectorAll(".advisor-message");
      const latestMessage = messages[messages.length - 1];
      const latestTop = latestMessage
        ? latestMessage.offsetTop - container.offsetTop - 5
        : Math.max(0, container.scrollHeight - container.clientHeight);
      setAdvisorAtLatest(Math.abs(container.scrollTop - latestTop) < 24);
    };
    advisorMessagesRef.current.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      resizeObserver?.disconnect();
      advisorMessagesRef.current?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [advisorMessages, advisorLoading, advisorOpen, advisorPreview, scrollAdvisorToLatest]);
  useEffect(() => {
    if (!advisorOpen || !advisorPreview) return;
    requestAnimationFrame(() => {
      document.querySelector(".advisor-scenario")?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
      });
    });
  }, [advisorOpen, advisorPreview]);
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
        <div className="resource-strip" aria-label="Village resources">
          <Resource type="wood" value={state.resources.wood} trend={state.trends.wood} storage={state.storage.wood} />
          <Resource type="stone" value={state.resources.stone} trend={state.trends.stone} storage={state.storage.stone} />
          <Resource type="food" value={state.resources.food} trend={state.trends.food} storage={state.storage.food} />
          {showWheat && (
            <Resource type="wheat" value={state.resources.wheat} trend={state.trends.wheat} storage={state.storage.wheat} />
          )}
          {showWine && (
            <Resource type="wine" value={state.resources.wine} trend={state.trends.wine} storage={state.storage.wine} />
          )}
          <div
            className={`resource population ${state.population >= state.capacity ? "at-capacity" : ""}`}
          title={`${formatCount(state.population)} of ${formatCount(state.capacity)} villagers${state.population >= state.capacity ? ". Build a new cottage for more room." : ""}`}
          >
            <span className="resource-icon"><Users size={23} strokeWidth={1.7} /></span>
            <div>
              <small>villagers</small>
              <strong className="resource-value">{formatCount(state.population)}<em> / {formatCount(state.capacity)}</em></strong>
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
          <span className="menu-button-label">Menu</span>
          <ChevronDown size={19} />
        </button>
      </header>
      <section className="left-stack">
        <div className="village-heading">
          <span>YOUR SETTLEMENT</span>
          <h2>{state.name}</h2>
          <p>
            {allGoals
              ? "Your village is ready to grow."
              : goals
                ? "Start with the next step below."
                : "Your village is growing. Choose a build below."}
          </p>
        </div>
        {goals && (
          <div className={`objectives parchment ${allGoals ? "complete" : ""}`}>
            <button
              type="button"
              ref={goalsButtonRef}
              className="objective-heading"
              aria-controls="settlement-goals"
              aria-expanded={goals}
              onClick={(event) => {
                const next = !goals;
                setGoals(next);
                if (!next) {
                  try {
                    window.localStorage.setItem(goalsDismissedStorageKey(state.name), "1");
                  } catch {
                    // The goals card is still dismissible when storage is unavailable.
                  }
                  if (event.detail === 0) {
                    window.setTimeout(() => goalsTabRef.current?.focus(), 0);
                  }
                }
              }}
            >
              <span>
                <Leaf size={17} /> Getting started
              </span>
              <ChevronDown size={16} className={goals ? "" : "collapsed"} />
            </button>
            <div id="settlement-goals">
              <p>
                {allGoals
                  ? "All three starter goals are complete."
                  : "One small step at a time."}
              </p>
              {nextGoal && (
                <div className="goal-next">
                  <span className="goal-next-kicker">YOUR NEXT STEP</span>
                  <strong>{nextGoal.label}</strong>
                  <span>{nextGoal.detail}</span>
                  <button
                    type="button"
                    aria-label={
                      nextGoal.action === "focus" && nextGoalBuilding
                        ? `Show ${CATALOG[nextGoal.type]?.name || "the worksite"}`
                        : `Choose a spot for ${CATALOG[nextGoal.type]?.name || "the next build"}`
                    }
                    onClick={chooseNextGoal}
                  >
                    {nextGoal.action === "focus" && nextGoalBuilding
                      ? "Check the lumberyard"
                      : "Choose a spot"}{" "}
                    {nextGoal.action === "focus" && nextGoalBuilding ? (
                      <Compass size={12} />
                    ) : (
                      <ArrowUpRight size={12} />
                    )}
                  </button>
                </div>
              )}
              <details className="goal-details">
                <summary>
                  <span>Milestones</span>
                  <strong>{completedGoals} / 3</strong>
                  <ChevronDown size={14} aria-hidden="true" />
                </summary>
                <div className="goal-details-body">
                  <div className={`goal ${builtHouse ? "done" : ""}`}>
                    <span className="checkbox">
                      {builtHouse && <Check size={12} />}
                    </span>
                    <span>Build a new cottage</span>
                    <span className="goal-count">{builtHouse ? "1" : "0"}/1</span>
                  </div>
                  <div className={`goal ${builtFarm ? "done" : ""}`}>
                    <span className="checkbox">
                      {builtFarm && <Check size={12} />}
                    </span>
                    <span>Build a new farmhouse</span>
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
                    <i style={{ width: `${goalProgressPercent}%` }} />
                  </div>
                </div>
              </details>
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
        {!goals && (
          <button
            type="button"
            ref={goalsTabRef}
            className="goals-tab parchment"
            aria-expanded="false"
            onClick={() => {
              openGoals();
              requestAnimationFrame(() => goalsButtonRef.current?.focus());
            }}
          >
            <Leaf size={14} aria-hidden="true" />
            <span>Goals</span>
            <strong>{nextGoal ? nextGoal.label : "All goals complete"}</strong>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        )}
        {state.activity && (
          <div className="settlement-status activity" role="status" aria-live="polite">
            <span className="live-dot" />
            <span>{state.activity}</span>
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
          aria-controls={advisorOpen ? "village-advisor" : undefined}
          aria-expanded={advisorOpen}
          title={
            advisorOpen
              ? "Close village advisor"
              : advisorBrief.attentionCount
                ? `${advisorBrief.attentionCount} advisor note${advisorBrief.attentionCount === 1 ? "" : "s"} need attention`
                : "Open village advisor"
          }
          onClick={toggleAdvisor}
        >
          <MessageCircle size={15} />
          <span>Village advisor</span>
          {!advisorOpen && advisorBrief.attentionCount > 0 && (
            <i className="advisor-alert" aria-hidden="true" />
          )}
        </button>
      </div>
      {advisorOpen && (
        <aside
          id="village-advisor"
          className={`advisor-panel parchment ${advisorMessages.length > 1 ? "has-history" : ""} ${advisorPreview ? "has-preview" : ""}`}
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
          <div className="advisor-toolbar" aria-label="Advisor tools">
            {advisorLoading && (
              <button
                type="button"
                className="advisor-cancel"
                onClick={cancelAdvisorRequest}
                aria-label="Stop advisor request"
              >
                <X size={12} aria-hidden="true" /> Stop
              </button>
            )}
            <button
              type="button"
              onClick={() => askAdvisor(ADVISOR_COMMANDS.dispatch, "Read today's village dispatch.")}
              disabled={advisorLoading}
              title="Ask the advisor for a lively read of the current village state."
            >
              <Sparkles size={12} aria-hidden="true" /> Daily note
            </button>
            <button
              type="button"
              onClick={() => askAdvisor(ADVISOR_COMMANDS.plan, "Make me a three-step plan.")}
              disabled={advisorLoading}
              title="Ask the advisor for a grounded three-step plan."
            >
              <Route size={12} aria-hidden="true" /> Make a plan
            </button>
            <button
              type="button"
              onClick={() => askAdvisor(ADVISOR_COMMANDS.compare, "Compare my best options.")}
              disabled={advisorLoading}
              title="Ask the advisor to compare the strongest affordable choices."
            >
              <BarChart3 size={12} aria-hidden="true" /> Compare
            </button>
            {advisorWatch && (
              <button
                type="button"
                className="active advisor-watch"
                onClick={toggleAdvisorWatch}
                aria-pressed="true"
                title="Quiet the advisor's watch when a new bottleneck appears"
              >
                <Bell size={12} aria-hidden="true" /> Watching
              </button>
            )}
            {advisorToolsOpen && (
              <>
                <button
                  type="button"
                  onClick={() => askAdvisor(ADVISOR_COMMANDS.council, "Convene the village council.")}
                  disabled={advisorLoading}
                  title="Ask three village voices for a shared recommendation."
                >
                  <Users size={12} aria-hidden="true" /> Council
                </button>
                {!advisorWatch && (
                  <button
                    type="button"
                    className="advisor-watch"
                    onClick={toggleAdvisorWatch}
                    aria-pressed="false"
                    title="Ask the advisor to watch for new bottlenecks"
                  >
                    <Bell size={12} aria-hidden="true" /> Watch
                  </button>
                )}
                <button
                  type="button"
                  className={advisorSavedOpen ? "active" : ""}
                  onClick={() => setAdvisorSavedOpen((open) => !open)}
                  aria-pressed={advisorSavedOpen}
                  title="Show advice you saved for later"
                >
                  <Bookmark size={12} aria-hidden="true" /> Saved {savedAdvisorMessages.length}
                </button>
                <button
                  type="button"
                  className="advisor-new"
                  onClick={startFreshAdvisor}
                  title="Start a new advisor conversation"
                  aria-label="Start a new advisor conversation"
                >
                  <RotateCw size={12} aria-hidden="true" />
                </button>
              </>
            )}
            <button
              type="button"
              className={`advisor-toolbar-more ${advisorToolsOpen ? "active" : ""}`}
              onClick={() => setAdvisorToolsOpen((open) => !open)}
              aria-expanded={advisorToolsOpen}
              aria-label={advisorToolsOpen ? "Hide more advisor tools" : "Show more advisor tools"}
            >
              <ChevronDown size={12} aria-hidden="true" />
              {advisorToolsOpen ? "Less" : "More"}
            </button>
          </div>
          <p className="advisor-intro">
            Ask about the village, or ask for a plan based on what is happening now.
          </p>
          {advisorRoute && (
            <section className="advisor-route" aria-label="Pinned advisor route">
              <div className="advisor-route-heading">
                <span><Route size={11} aria-hidden="true" /> PINNED ROUTE <em>{advisorRoute.steps.filter((step) => step.done).length}/3 DONE{advisorRoute.steps.every((step) => step.done) ? " · COMPLETE" : ` · DAY ${advisorRoute.day}`}</em></span>
                <button type="button" onClick={clearAdvisorRoute} aria-label="Clear pinned route" title="Clear pinned route">
                  <X size={11} aria-hidden="true" />
                </button>
              </div>
              <ol id="advisor-watch-events">
                {advisorRoute.steps.map((step, stepIndex) => {
                  const build = step.buildAction && CATALOG[step.buildAction];
                  const focus = step.focusAction && CATALOG[step.focusAction];
                  const worker = step.workerFocusAction;
                  const trainee = step.trainingAction;
                  const buildComplete = Boolean(
                    build && state.buildings.some(
                      (building) => building.type === step.buildAction && Number(building.progress) >= 1,
                    ),
                  );
                  const trainingActive = Boolean(
                    trainee && state.buildings.some(
                      (building) => building.type === "school" && building.trainingSession?.label === trainee,
                    ),
                  );
                  return (
                    <li className={step.done ? "done" : ""} key={`${step.text}-${stepIndex}`}>
                      <button
                        type="button"
                        className="advisor-route-check"
                        aria-label={step.done ? `Mark route step ${stepIndex + 1} incomplete` : `Mark route step ${stepIndex + 1} complete`}
                        aria-pressed={step.done}
                        onClick={() => toggleAdvisorRouteStep(stepIndex)}
                        title={step.done ? "Mark this route step incomplete" : "Mark this route step complete"}
                      >
                        {step.done && <Check size={9} aria-hidden="true" />}
                      </button>
                      <span>{step.text}</span>
                      {build && (
                        <button
                          type="button"
                          onClick={() => prepareAdvisorBuild(step.buildAction)}
                          disabled={step.done || buildComplete}
                          title={step.done || buildComplete ? `${build.name} is already complete.` : `Prepare ${build.name} for placement.`}
                        >
                          <Hammer size={10} aria-hidden="true" /> {step.done || buildComplete ? `${build.name} complete` : `Prepare ${build.name}`}
                        </button>
                      )}
                      {focus && (
                        <button type="button" onClick={() => focusAdvisorBuilding(step.focusAction)} disabled={step.done}>
                          <Compass size={10} aria-hidden="true" /> Focus {focus.name}
                        </button>
                      )}
                      {worker && (
                        <button type="button" onClick={() => focusAdvisorWorker(worker)} disabled={step.done}>
                          <Compass size={10} aria-hidden="true" /> Focus {worker}
                        </button>
                      )}
                      {trainee && (
                        <button
                          type="button"
                          onClick={() => prepareAdvisorTraining(trainee)}
                          disabled={step.done || trainingActive}
                          title={step.done || trainingActive ? "The School is already training this apprentice." : `Train ${trainee}.`}
                        >
                          <GraduationCap size={10} aria-hidden="true" /> {step.done || trainingActive ? "School already training" : `Train ${trainee}`}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          {advisorToolsOpen && (
            <div className="advisor-lenses" role="group" aria-label="Advisor voice">
              <span>ADVICE STYLE</span>
              {Object.entries(ADVISOR_LENSES).map(([key, lens]) => {
                const LensIcon = lens.icon;
                return (
                  <button
                    type="button"
                    key={key}
                    className={advisorLens === key ? "active" : ""}
                    aria-pressed={advisorLens === key}
                    onClick={() => setAdvisorLens(key)}
                    disabled={advisorLoading}
                    title={`Use the ${lens.label.toLowerCase()} voice`}
                  >
                    <LensIcon size={11} aria-hidden="true" /> {lens.label}
                  </button>
                );
              })}
            </div>
          )}
          {advisorWatch && advisorWatchEvents.length > 0 && (
            <section
              className={`advisor-watch-log ${advisorWatchLogOpen ? "is-expanded" : "is-collapsed"}`}
              aria-label="Advisor watch log"
              aria-live="polite"
            >
              <div className="advisor-watch-log-heading">
                <span><Bell size={11} aria-hidden="true" /> WATCH LOG</span>
                <div className="advisor-watch-log-actions">
                  <button
                    type="button"
                    className="advisor-watch-toggle"
                    onClick={toggleAdvisorWatchLog}
                    aria-expanded={advisorWatchLogOpen}
                    aria-controls="advisor-watch-events"
                    aria-label={advisorWatchLogOpen ? "Collapse advisor watch log" : "Expand advisor watch log"}
                    title={advisorWatchLogOpen ? "Collapse advisor watch log" : "Expand advisor watch log"}
                  >
                    <ChevronDown size={11} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={clearAdvisorWatchEvents}
                    aria-label="Clear advisor watch log"
                    title="Clear advisor watch log"
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <ol>
                {advisorWatchEvents.map((event, index) => (
                  <li key={`${event.title}-${event.day}-${index}`}>
                    <button
                      type="button"
                      className="advisor-watch-event"
                      onClick={() =>
                        askAdvisor(
                          `What should I do about ${event.title}? Use the current village state and explain the safest next step.`,
                          `Follow up: ${event.title}`,
                        )
                      }
                      disabled={advisorLoading}
                      title="Ask the advisor about this missed signal using the current village state"
                    >
                      <span><strong>{event.title}</strong><em>{event.detail}</em></span>
                      <small>Day {event.day} · {event.period}</small>
                    </button>
                    <button
                      type="button"
                      className="advisor-watch-dismiss"
                      onClick={() => dismissAdvisorWatchEvent(index)}
                      aria-label={`Dismiss watch entry: ${event.title}`}
                      title="Dismiss this watch entry"
                    >
                      <X size={10} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {advisorSavedOpen && (
            <section className="advisor-saved" aria-label="Saved advisor advice">
              <div className="advisor-saved-heading">
                <span><Bookmark size={12} /> SAVED ADVICE</span>
                <button
                  type="button"
                  onClick={() => setAdvisorSavedOpen(false)}
                  aria-label="Close saved advice"
                  title="Close saved advice"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
              {savedAdvisorMessages.length ? (
                <div className="advisor-saved-list">
                  {[...savedAdvisorMessages].reverse().map((message, index) => (
                    <div className="advisor-saved-item" key={`${message.content}-${index}`}>
                      <div>
                        {message.question && <small>Asked: {message.question}</small>}
                        <p><AdvisorContent content={message.content} /></p>
                      </div>
                      <button
                        type="button"
                        className="advisor-saved-reask"
                        onClick={() => {
                          const replayPrompt = advisorReplayPrompt(message);
                          const visibleQuestion = message.question || "Ask the advisor again";
                          const groundedReplay = replayPrompt === visibleQuestion && message.content
                            ? `${replayPrompt}\n\nSaved advisor context: ${message.content}`
                            : replayPrompt;
                          askAdvisor(groundedReplay, visibleQuestion);
                        }}
                        disabled={advisorLoading}
                        aria-label="Ask this saved advice again"
                        title="Ask this question again using the current village state"
                      >
                        <RotateCw size={11} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAdvisorMessages((current) =>
                            current.map((item) =>
                              item === message ? { ...item, helpful: false } : item,
                            ),
                          )
                        }
                        aria-label="Remove saved advice"
                        title="Remove saved advice"
                      >
                        <X size={11} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="advisor-saved-empty">Save an advisor answer to keep it close.</p>
              )}
            </section>
          )}
          <section className="advisor-brief" aria-label="Things worth a look">
            <div className="advisor-brief-heading">
              <span><Sparkles size={12} /> WORTH A LOOK</span>
              <em className={advisorBrief.attentionCount ? "attention" : "calm"}>
                {advisorBrief.label}
              </em>
            </div>
            <div className="advisor-brief-list">
              {advisorBrief.items.map((item) => {
                const NoteIcon = item.icon || Info;
                return (
                  <button
                    type="button"
                    className={`advisor-brief-item ${item.tone || "calm"}`}
                    key={item.title}
                    onClick={() => askAdvisor(item.question)}
                    disabled={advisorLoading}
                  >
                    <NoteIcon size={14} aria-hidden="true" />
                    <span>
                      <strong>{item.title}</strong>
                      <em>{item.detail}</em>
                    </span>
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>
          <div
            className="advisor-conversation-heading"
            aria-live="polite"
          >
            <span>CONVERSATION</span>
            {advisorMessages.length > 1 && !advisorAtLatest && (
              <button
                type="button"
                onClick={() => scrollAdvisorToLatest()}
                aria-label="Jump to the newest advisor answer"
                title="Jump to the newest advisor answer"
              >
                <ArrowDown size={11} aria-hidden="true" /> Latest
              </button>
            )}
          </div>
          <div
            ref={advisorMessagesRef}
            className="advisor-messages"
            aria-live="polite"
            aria-label="Advisor conversation"
          >
            {advisorMessages.map((message, index) => (
              <React.Fragment key={`${message.role}-${index}`}>
                <div className={`advisor-message ${message.role}`}>
                  <div className="advisor-message-head">
                    <span>{message.role === "assistant" ? (message.local ? "LOCAL FIELD NOTE" : "ADVISOR") : "YOU"}</span>
                    {message.role === "assistant" && message.snapshot && (
                      <em
                        className={
                          message.snapshot.day !== state.day || message.snapshot.period !== period
                            ? "stale"
                            : ""
                        }
                        title={
                          message.snapshot.day !== state.day || message.snapshot.period !== period
                            ? "The village has moved on since this answer was grounded. Ask again for a fresh recommendation."
                            : "The village snapshot used to ground this answer"
                        }
                      >
                        {message.snapshot.day !== state.day || message.snapshot.period !== period
                          ? "STALE"
                          : message.local
                            ? "LOCAL"
                            : "LIVE"} · DAY {message.snapshot.day} · {message.snapshot.period}
                      </em>
                    )}
                  </div>
                  <p><AdvisorContent content={message.content} /></p>
                  {message.role === "assistant" &&
                    index === latestAssistantIndex &&
                    message.grounding?.length > 0 && (
                    <div className="advisor-grounding" aria-label="Signals used for this answer">
                      <span>GROUNDED IN</span>
                      {message.grounding.map((signal) => (
                        <em key={signal}>{signal}</em>
                      ))}
                    </div>
                  )}
                </div>
                {message.role === "assistant" &&
                  index === latestAssistantIndex &&
                  message.action && (
                    (() => {
                      const missing = missingAdvisorBuildCosts(message.action, state.resources);
                      const missingLabel = missing.map(([resource, amount]) => `${amount} ${resource}`).join(" · ");
                      return (
                        <button
                          type="button"
                          className={`advisor-build-action ${missing.length ? "needs-materials" : ""}`}
                          onClick={() => prepareAdvisorBuild(message.action)}
                          disabled={advisorLoading || missing.length > 0}
                          title={missing.length ? `Gather ${missingLabel} before placing this.` : undefined}
                        >
                          {missing.length ? <Package size={12} aria-hidden="true" /> : <Hammer size={12} aria-hidden="true" />}
                          {missing.length ? `Need ${missingLabel}` : `Prepare ${CATALOG[message.action]?.name || message.action}`}
                        </button>
                      );
                    })()
                  )}
                {message.role === "assistant" &&
                  index === latestAssistantIndex &&
                  message.previewAction && (
                    <>
                      <button
                        type="button"
                        className="advisor-preview-action"
                        onClick={() => showAdvisorPreview(message.previewAction)}
                        disabled={advisorLoading}
                        title="Preview the cost and outcome without changing the village."
                      >
                        <BarChart3 size={12} aria-hidden="true" />
                        {advisorPreview?.type === message.previewAction ? "Hide preview" : `Preview ${CATALOG[message.previewAction]?.name || message.previewAction}`}
                      </button>
                      {advisorPreview?.type === message.previewAction && (
                        <div className="advisor-scenario" aria-label={`What-if preview for ${advisorPreview.name}`}>
                          <div className="advisor-scenario-head">
                            <span><BarChart3 size={11} aria-hidden="true" /> WHAT-IF PREVIEW</span>
                            <button type="button" onClick={() => setAdvisorPreview(null)} aria-label="Close preview" title="Close preview">
                              <X size={11} aria-hidden="true" />
                            </button>
                          </div>
                          <strong>{advisorPreview.name}</strong>
                          <div className="advisor-scenario-grid">
                            <span><em>Cost</em><b>{advisorPreview.cost.length ? advisorPreview.cost.map(([resource, amount]) => `${amount} ${resource}`).join(" · ") : "Materials ready"}</b></span>
                            <span><em>After paying</em><b>{advisorPreview.cost.length ? advisorPreview.cost.map(([resource]) => `${Math.floor(advisorPreview.remaining[resource])} ${resource}`).join(" · ") : "No stock changes"}</b></span>
                            <span><em>Footprint</em><b>{advisorPreview.footprint} tiles</b></span>
                            <span><em>Capacity signal</em><b>{advisorPreview.capacityChange}</b></span>
                          </div>
                          <p>{advisorPreview.effect}</p>
                          <small>
                            {advisorPreview.missing.length
                              ? `Still needed: ${advisorPreview.missing.map(([resource, amount]) => `${amount} ${resource}`).join(" · ")}. `
                              : "Ready in this snapshot. "}
                            This is only a preview; the village is unchanged.
                          </small>
                        </div>
                      )}
                    </>
                  )}
                {message.role === "assistant" &&
                  index === latestAssistantIndex &&
                  message.upgradeAction && (
                    (() => {
                      const target = state.buildings.find(
                        (building) =>
                          building.type === message.upgradeAction &&
                          Number(building.progress) >= 1 &&
                          CATALOG[message.upgradeAction]?.upgrade &&
                          !building.upgrade,
                      );
                      const name = CATALOG[message.upgradeAction]?.name || message.upgradeAction;
                      const upgrade = CATALOG[message.upgradeAction]?.upgrade;
                      const missing = missingAdvisorUpgradeCosts(message.upgradeAction, state.resources);
                      const missingLabel = missing.map(([resource, amount]) => `${amount} ${resource}`).join(" · ");
                      return (
                        <button
                          type="button"
                          className={`advisor-upgrade-action ${!target || missing.length ? "unavailable" : ""}`}
                          onClick={() => prepareAdvisorUpgrade(message.upgradeAction)}
                          disabled={advisorLoading || !target || missing.length > 0}
                          title={
                            !target
                              ? `${name} is already upgraded or not complete.`
                              : missing.length
                                ? `Gather ${missingLabel} before upgrading ${name}.`
                                : `Apply ${upgrade?.name || "the available upgrade"} to ${name}.`
                          }
                        >
                          <Sparkles size={12} aria-hidden="true" />
                          {!target
                            ? `${name} already improved`
                            : missing.length
                              ? `Need ${missingLabel}`
                              : `Upgrade ${name}`}
                        </button>
                      );
                    })()
                  )}
                {message.role === "assistant" &&
                  index === latestAssistantIndex &&
                  message.feastAction && (
                    (() => {
                      const active = state.feast?.remaining > 0;
                      const food = Math.floor(Number(state.resources.food) || 0);
                      const missing = Math.max(0, 30 - food);
                      return (
                        <button
                          type="button"
                          className={`advisor-feast-action ${active || missing ? "unavailable" : ""}`}
                          onClick={prepareAdvisorFeast}
                          disabled={advisorLoading || active || missing > 0}
                          title={
                            active
                              ? "A village feast is already underway."
                              : missing
                                ? `Gather ${missing} more food before starting a feast.`
                                : "Spend 30 food for 45 seconds of 25% faster construction."
                          }
                        >
                          <Sparkles size={12} aria-hidden="true" />
                          {active ? "Feast underway" : missing ? `Need ${missing} food` : "Start feast"}
                        </button>
                      );
                    })()
                  )}
                {message.role === "assistant" &&
                  index === latestAssistantIndex &&
                  message.focusAction && (
                    (() => {
                      const target = state.buildings.find((building) => building.type === message.focusAction);
                      const name = CATALOG[message.focusAction]?.name || message.focusAction;
                      return (
                        <button
                          type="button"
                          className={`advisor-focus-action ${!target ? "unavailable" : ""}`}
                          onClick={() => focusAdvisorBuilding(message.focusAction)}
                          disabled={advisorLoading || !target}
                          title={target ? `Frame ${name} in the village.` : `${name} is not in the village yet.`}
                        >
                          <Compass size={12} aria-hidden="true" />
                          {target ? `Focus ${name}` : `${name} not built`}
                        </button>
                      );
                    })()
                  )}
                {message.role === "assistant" &&
                  index === latestAssistantIndex &&
                  message.workerFocusAction && (
                    (() => {
                      const target = state.workers.find(
                        (worker) => worker.workerTypeLabel === message.workerFocusAction,
                      );
                      const name = message.workerFocusAction;
                      return (
                        <button
                          type="button"
                          className={`advisor-focus-action ${!target ? "unavailable" : ""}`}
                          onClick={() => focusAdvisorWorker(name)}
                          disabled={advisorLoading || !target}
                          title={target ? `Frame your ${name.toLowerCase()} in the village.` : `There is no ${name.toLowerCase()} in the village yet.`}
                        >
                          <Compass size={12} aria-hidden="true" />
                          {target ? `Focus ${name}` : `${name} not present`}
                        </button>
                      );
                    })()
                  )}
                {message.role === "assistant" &&
                  index === latestAssistantIndex &&
                  message.trainingAction && (
                    (() => {
                      const school = state.buildings.find(
                        (building) => building.type === "school" && Number(building.progress) >= 1,
                      );
                      const option = school?.training?.find(
                        (candidate) => candidate.label === message.trainingAction,
                      );
                      const active = Boolean(school?.trainingSession);
                      const unavailable = !school || !option || active || !option.canTrain;
                      return (
                        <button
                          type="button"
                          className={`advisor-training-action ${unavailable ? "unavailable" : ""}`}
                          onClick={() => prepareAdvisorTraining(message.trainingAction)}
                          disabled={advisorLoading || unavailable}
                          title={
                            !school
                              ? "Build a School before training a villager."
                              : active
                                ? "The School is already training an apprentice."
                                : option?.canTrain
                                  ? `Start ${message.trainingAction.toLowerCase()} training without changing any other village job.`
                                  : option?.reason || `${message.trainingAction} training is not available yet.`
                          }
                        >
                          <GraduationCap size={12} aria-hidden="true" />
                          {!school
                            ? "School not built"
                            : active
                              ? "School already training"
                              : option?.canTrain
                                ? `Train ${message.trainingAction}`
                                : option?.reason || `${message.trainingAction} unavailable`}
                        </button>
                      );
                    })()
                  )}
                {message.role === "assistant" && index === latestAssistantIndex && !advisorLoading && advisorMessages.length > 1 && (
                  <div className="advisor-message-actions">
                    {message.snapshot &&
                      (message.snapshot.day !== state.day || message.snapshot.period !== period) &&
                      latestUserMessage && (
                        <button
                          type="button"
                          className="advisor-refresh-action"
                          onClick={refreshLatestAdvisor}
                          title="Ask the advisor again using the village's current state"
                        >
                          <RotateCw size={11} aria-hidden="true" /> Refresh advice
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => copyAdvisorAnswer(message.content)}
                      title="Copy this advisor answer"
                    >
                      <Copy size={11} aria-hidden="true" /> {advisorCopied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => speakAdvisorAnswer(message.content)}
                      title={advisorSpeaking ? "Stop reading this advisor answer" : "Read this advisor answer aloud"}
                    >
                      <Volume2 size={11} aria-hidden="true" /> {advisorSpeaking ? "Stop" : "Read"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAdvisorMessages((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, helpful: !item.helpful } : item,
                          ),
                        )
                      }
                    >
                      <Bookmark size={11} aria-hidden="true" /> {message.helpful ? "Saved" : "Save"}
                    </button>
                    {buildAdvisorRoute(message.content) && (
                      <button
                        type="button"
                        onClick={() => pinAdvisorRoute(message.content)}
                        title="Keep this three-step route visible while you play"
                      >
                        <Route size={11} aria-hidden="true" /> {advisorRoute?.content === buildAdvisorRoute(message.content)?.content ? "Pinned" : "Pin route"}
                      </button>
                    )}
                    <button type="button" onClick={tryAnotherAdvisorAngle}>
                      <RotateCw size={11} aria-hidden="true" /> Try another angle
                    </button>
                  </div>
                )}
                {message.role === "assistant" && index === latestAssistantIndex && !advisorLoading && advisorFollowups.length > 0 && (
                  <div className="advisor-followups" aria-label="Follow-up questions">
                    <span>FOLLOW UP</span>
                    {advisorFollowups.map((followup) => (
                      <button
                        type="button"
                        key={followup.title}
                        onClick={() => askAdvisor(followup.question, followup.title)}
                      >
                        {followup.title}
                      </button>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}
            {advisorLoading && (
              <div className="advisor-message assistant advisor-thinking">
                <span>ADVISOR</span>
                <p><i /><i /><i /> Reading the village…</p>
              </div>
            )}
          </div>
          {advisorError && (
            <div
              className={`advisor-error ${advisorMessages[latestAssistantIndex]?.local ? "local" : ""}`}
              role={advisorMessages[latestAssistantIndex]?.local ? "status" : "alert"}
              title={advisorError}
            >
              {advisorMessages[latestAssistantIndex]?.local
                ? "Local field note shown · the advisor service is optional."
                : advisorError}
            </div>
          )}
          {!advisorLoading && (
            <div className="advisor-prompts" aria-label="Quick questions">
              <span className="advisor-prompts-label">QUICK QUESTIONS</span>
              <div>
                {advisorPrompts.slice(0, 3).map((prompt) => {
                  const PromptIcon = prompt.icon || MessageCircle;
                  return (
                    <button
                      type="button"
                      key={prompt.question}
                      onClick={() => askAdvisor(prompt.question)}
                    >
                      <PromptIcon size={12} aria-hidden="true" />
                      {prompt.title}
                    </button>
                  );
                })}
              </div>
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
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || advisorLoading) return;
                event.preventDefault();
                if (advisorInput.trim()) askAdvisor(advisorInput);
              }}
            />
            <button
              className="advisor-send"
              type="submit"
              disabled={advisorLoading || !advisorInput.trim()}
              aria-label="Send question"
              title="Send question (Enter)"
            >
              <Send size={16} />
            </button>
          </form>
          <div className="advisor-note">Local guidance always available · richer advisor optional</div>
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
          {detail.type !== "worker" || inspectedWorker ? (
            <button
              type="button"
              className="inspector-advisor-action"
              onClick={askAdvisorAboutFocus}
              title="Ask the advisor for advice about this building or villager."
            >
              <Sparkles size={14} aria-hidden="true" /> Ask the advisor about this
            </button>
          ) : null}
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
              inspected?.usesWorkers && (
                <span>
                  Assigned workers<strong>{inspected?.workers || 0}</strong>
                </span>
              )
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
          {detail.type !== "worker" && inspected?.stored && (
            <div className="storage-panel" aria-label="Village storage">
              <div className="storage-breakdown">
                <Resource type="wood" value={inspected.stored.wood} storage={inspected.storedCaps?.wood} />
                <Resource type="stone" value={inspected.stored.stone} storage={inspected.storedCaps?.stone} />
                {showWheat && (
                  <Resource type="wheat" value={inspected.stored.wheat} storage={inspected.storedCaps?.wheat} />
                )}
                <Resource type="food" value={inspected.stored.food} storage={inspected.storedCaps?.food} />
                {showWine && (
                  <Resource type="wine" value={inspected.stored.wine} storage={inspected.storedCaps?.wine} />
                )}
              </div>
            </div>
          )}
          {detail.type === "school" && inspected?.training && (
            <div className="training-panel" aria-label="School training">
              <span className="inspector-action-label">
                <GraduationCap size={13} aria-hidden="true" /> Train a villager
              </span>
              <p className="training-housing">
                {state.population}/{state.capacity} villagers housed
                {state.capacity - state.population > 0
                  ? ` · room for ${state.capacity - state.population} more`
                  : " · build a new cottage for more room"}
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
                  const RoleIcon = workerTypeIcons[option.label];
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
                      <span className="training-role">
                        {RoleIcon && <RoleIcon size={13} aria-hidden="true" />}
                        {option.label}
                      </span>
                      <em className="training-count">{counts}</em>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {detail.type !== "worker" && inspected && (
            <div className="inspector-actions" aria-label="Building controls">
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
        <div className="palette-launcher">
          <button
            type="button"
            className="palette-toggle"
            aria-expanded={paletteOpen}
            aria-controls="building-palette"
            aria-label={paletteOpen ? "Collapse building menu" : "Expand building menu"}
            title={paletteOpen ? "Collapse building menu" : "Expand building menu"}
            onClick={() => setPaletteOpen((open) => !open)}
          >
            <Hammer size={22} strokeWidth={1.5} />
          </button>
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
        </div>
      </div>
      <div className="build-area">
        {active && (
          <div
            id="build-details"
            className={`build-tooltip parchment ${buildDetailsOpen ? "is-open" : ""}`}
          >
            <div>
              <span className="tooltip-category">
                {pathRemoval
                  ? "TIDY UP YOUR VILLAGE"
                  : selected
                    ? "PLACE SOMETHING NEW"
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
              <span>YOU'LL GET BACK</span>
              <strong className="recovery-note">1 stone per path tile</strong>
              <small>
                {touchLayout
                  ? "Tap a player-laid path to clear it."
                  : "Click a player-laid path to clear it."}
              </small>
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
        {selected && (
          <div
            className={`placement-hint ${state.placement?.ok === false ? "invalid" : ""}`}
            aria-live="polite"
            aria-atomic="true"
          >
            <MousePointer2 size={14} />
            <span>{displayedPlacementHint}</span>
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
                title={touchLayout ? "Rotate building" : "Rotate building (R)"}
              >
                <RotateCw size={14} />
                {!touchLayout && <kbd>R</kbd>}
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
                <Check size={14} /> <span>Place</span> {!touchLayout && <kbd>ENTER</kbd>}
              </button>
            )}
            <button
              type="button"
              aria-label={tileMode ? "Cancel tile tool" : "Cancel building placement"}
              onClick={cancel}
            >
              <X size={14} />
              {!touchLayout && <kbd>ESC</kbd>}
            </button>
          </div>
        )}
        <div className="bottom-caption">
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
      {(selected || grid) && (
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
        </div>
      )}
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
            Download a backup
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
            Restore a backup
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
          {!goals && (
            <button type="button" role="menuitem" onClick={showGoals}>
              <Leaf size={16} />
              Show goals
            </button>
          )}
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
                ? "Restore a backup"
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
                <h2>{state.name} overview</h2>
                <p>
                  A quick look at your people, work, and progress.
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
                    <span>Buildings</span>
                  </div>
                  <div className="overview-stat">
                    <Hammer size={18} />
                    <strong>{formatCount(activeJobs)}</strong>
                    <span>Work underway</span>
                  </div>
                  <div className="overview-stat">
                    <Wheat size={18} />
                    <strong>{formatCount(deliveries)}</strong>
                    <span>Goods delivered</span>
                  </div>
                </div>
                <div className="economy-strip" aria-label="Resource trends">
                  <div><span>Wood / min</span><strong className={state.trends.wood < 0 ? "negative" : ""}>{state.trends.wood > 0 ? "+" : ""}{state.trends.wood || 0}</strong></div>
                  <div><span>Stone / min</span><strong className={state.trends.stone < 0 ? "negative" : ""}>{state.trends.stone > 0 ? "+" : ""}{state.trends.stone || 0}</strong></div>
                  <div><span>Food / min</span><strong className={state.trends.food < 0 ? "negative" : ""}>{state.trends.food > 0 ? "+" : ""}{state.trends.food || 0}</strong></div>
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
                <details className="overview-details">
                  <summary>
                    <span>More village details</span>
                    <small>Workers, feast, focus &amp; settings</small>
                    <ChevronDown size={14} aria-hidden="true" />
                  </summary>
                  <div className="overview-details-body">
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
                  <div className="overview-activity-heading"><span>Visit a building</span><small>QUICK FOCUS</small></div>
                  <div className="focus-list">
                    {activeWorksites.map((building) => (
                      <button
                        type="button"
                        key={building.id}
                        aria-label={"Focus " + (CATALOG[building.type]?.name || building.type) + " building. Status: " + (building.status || "Complete")}
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
                  </div>
                </details>
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
                <h2>How your village works</h2>
                <p>
                  Build a few things, then let your villagers handle the work.
                </p>
                <div className="help-row">
                  <MousePointer2 />
                  <div>
                    <strong>Explore</strong>
                    <span>
                      Drag to look around. Scroll or pinch to zoom. Click or tap
                      a building or villager when you want to know more.
                    </span>
                  </div>
                </div>
                <div className="help-row">
                  <Hammer />
                  <div>
                    <strong>Build something</strong>
                    <span>
                      Choose one of the starter tools below, then click or tap a
                      clear patch of land. A green preview means it fits. Use
                      the cancel control any time to change your mind.
                    </span>
                  </div>
                </div>
                <div className="help-row">
                  <Users />
                  <div>
                    <strong>Villagers do the work</strong>
                    <span>
                      Workers find jobs, build, gather, and deliver on their
                      own. Build cottages to give the village room to grow.
                    </span>
                  </div>
                </div>
                <div className="help-note">
                  Your village saves automatically, and use More buildings whenever
                  you want to try additional tools.
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
