import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CATALOG,
  TOWNHALL_STORAGE,
  isEvenBuildingType,
  snapPlacementCoordinate,
  snapPlacement,
} from "./catalog.js";
import { chapterGoalState } from "./progression.js";
export {
  CATALOG,
  TOWNHALL_STORAGE,
  isEvenBuildingType,
  snapPlacementCoordinate,
  snapPlacement,
} from "./catalog.js";
export const STARTER_BUILDINGS = Object.freeze([
  ["townhall", 3, -3],
  ["house", -9, 3],
  ["well", 2, 3],
  ["farm", 6, 4],
  ["lumberyard", -9, -11],
  ["mine", 3, -11],
  ["windmill", 11, -3],
  ["watchtower", 10, -10],
  ["storehouse", -4, -13],
  ["school", 6, 14],
]);
export const STARTER_ROADS = Object.freeze([
  ...Array.from({ length: 30 }, (_, index) => {
    const x = index - 16;
    return [{ x, z: 0 }, { x, z: 1 }];
  }).flat(),
  ...Array.from({ length: 30 }, (_, index) => {
    const z = index - 15;
    return [{ x: 0, z }, { x: -1, z }];
  }).flat(),
  ...Array.from({ length: 18 }, (_, index) => ({ x: -6, z: index - 10 })),
  ...Array.from({ length: 21 }, (_, index) => ({ x: index - 10, z: -8 })),
  ...Array.from({ length: 17 }, (_, index) => ({ x: index - 7, z: 10 })),
]);
const WORLD_SEED = 654321;
const createRandom = (initial) => {
  let value = initial >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
};
// Runtime randomness (lantern flicker, road tints, worker spawn jitter). It is
// deliberately NOT used for world generation: the number of calls made before
// generation depends on how much of a village was restored.
const rand = createRandom(WORLD_SEED);
const riverX = (z) => 16 + Math.sin(z * 0.13) * 1.6;
// Scenery has to land on the same coordinates for every reload of a village,
// because saved tree state is keyed by position. Each candidate therefore draws
// a fixed-size block whether or not it is ultimately placed: a restored village
// rejects more candidates than an empty one, and a variable-length draw would
// slide every later tree onto fresh coordinates and orphan its saved state.
export const SCENERY_COUNT = 210;
export const SCENERY_DRAWS = 8;
export const GRASS_COUNT = 350;
export const GRASS_DRAWS = 9;
export const GRASS_UPDATE_INTERVAL = 1 / 30;
export const BUILDING_EFFECT_UPDATE_INTERVAL = 1 / 30;
// Day/night lighting changes slowly enough that 30 updates per second are
// visually indistinguishable from per-frame writes, while avoiding repeated
// colour and shadow-light property updates on high-refresh displays.
export const ATMOSPHERE_UPDATE_INTERVAL = 1 / 30;
// A paused village still needs occasional frames for camera damping and
// ambient motion, but a full-refresh redraw wastes GPU time while simulation
// state is frozen.
export const PAUSED_RENDER_INTERVAL = 1 / 30;
// Keep the starter settlement's common area open enough for the buildings and
// paths to read as one place. This only affects trees; rocks can still add a
// little visual texture without blocking the central space.
export const STARTER_SETTLEMENT_CLEAR_RADIUS = 12;
export const isInStarterSettlementClearing = (x, z, type = "tree") =>
  type !== "tree" || Math.hypot(Number(x), Number(z)) >= STARTER_SETTLEMENT_CLEAR_RADIUS;
const drawBlock = (next, size) => {
  const block = new Array(size);
  for (let i = 0; i < size; i++) block[i] = next();
  return block;
};
const buildBoundaryFor = (buildings = []) => {
  let boundary = 18;
  for (const building of buildings)
    if (building?.type === "watchtower" && building.progress === 1)
      boundary += 3;
  return boundary;
};
export const sceneryCandidates = (count = SCENERY_COUNT, seedValue = WORLD_SEED) => {
  const next = createRandom(seedValue);
  return Array.from({ length: count }, () => {
    const draw = drawBlock(next, SCENERY_DRAWS);
    const type = draw[2] > 0.16 ? "tree" : "rock";
    return {
      x: draw[0] * 65 - 32,
      z: draw[1] * 60 - 30,
      type,
      scale: type === "tree" ? 0.65 + draw[3] * 0.7 : 0.35 + draw[3] * 0.65,
      rotationY: draw[4] * 6,
      phase: draw[5] * Math.PI * 2,
      speed: 0.55 + draw[6] * 0.3,
      amount: 0.012 + draw[7] * 0.015,
    };
  });
};
const sceneryKey = (x, z) => `${Number(x).toFixed(3)},${Number(z).toFixed(3)}`;
export const grassCandidates = (count = GRASS_COUNT, seedValue = WORLD_SEED + 1) => {
  const next = createRandom(seedValue);
  return Array.from({ length: count }, () => {
    const draw = drawBlock(next, GRASS_DRAWS);
    return {
      x: draw[0] * 49 - 25,
      z: draw[1] * 47 - 24,
      color: draw[2] > 0.88 ? "#f4d587" : "#728844",
      radius: 0.06 + draw[3] * 0.05,
      height: 0.2 + draw[4] * 0.18,
      rotationZ: (draw[5] - 0.5) * 0.5,
      phase: draw[6] * Math.PI * 2,
      speed: 0.8 + draw[7] * 0.5,
      amount: 0.04 + draw[8] * 0.04,
    };
  });
};
export const isRiverBridgeClearance = (x, z) =>
  Number(x) > 14 && Number(x) < 19 && Number(z) > 6 && Number(z) < 10;
export const BANK_ROCK_SEED = WORLD_SEED + 2;
export const bankRockCandidates = (seedValue = BANK_ROCK_SEED) => {
  const next = createRandom(seedValue);
  const rocks = [];
  for (let z = -28; z < 28; z += 2.4) {
    const x = riverX(z) - 0.3;
    const scale = 0.3 + next() * 0.6;
    if (isRiverBridgeClearance(x, z)) continue;
    rocks.push({ x, z, scale });
  }
  return rocks;
};
// Paths read as one continuous cobbled surface rather than a grid of stamped
// squares. Every tile samples a single shared texture through world-space UVs,
// so the stones run straight across tile joins no matter how a path is drawn.
const ROAD_PATTERN_TILES = 4;
// Still used for the build-palette thumbnail, which renders a single lone tile.
const applyRoadUvs = (geometry, x, z) => {
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++)
    uv.setXY(
      i,
      (x + position.getX(i)) / ROAD_PATTERN_TILES,
      (z + position.getZ(i)) / ROAD_PATTERN_TILES,
    );
  uv.needsUpdate = true;
  return geometry;
};
export const ROAD_TILE = Object.freeze({ size: 1.02, height: 0.04, y: 0.002 });
export const ROAD_TINTS = Object.freeze(["#f4f2ea", "#ebe8de", "#f7f5ed"]);
let roadTileTemplate = null;
const roadTemplate = () => {
  if (!roadTileTemplate) {
    const geometry = new THREE.BoxGeometry(
      ROAD_TILE.size,
      ROAD_TILE.height,
      ROAD_TILE.size,
    );
    roadTileTemplate = {
      position: Float32Array.from(geometry.attributes.position.array),
      normal: Float32Array.from(geometry.attributes.normal.array),
      index: Uint16Array.from(geometry.index.array),
      vertexCount: geometry.attributes.position.count,
    };
    geometry.dispose();
  }
  return roadTileTemplate;
};
// Paths used to be one mesh, one geometry and one material per tile, so every
// tile a player laid cost another draw call for the rest of the session. They
// are merged into a single surface instead. UVs were already world-space, so
// baking them per vertex keeps the cobbles running unbroken across tile joins,
// and the per-tile tint moves from the material into a vertex-color attribute.
export const buildRoadSurfaceGeometry = (tiles = []) => {
  const geometry = new THREE.BufferGeometry();
  if (!tiles.length) return geometry;
  const template = roadTemplate();
  const verts = template.vertexCount;
  const stride = template.index.length;
  const positions = new Float32Array(tiles.length * verts * 3);
  const normals = new Float32Array(tiles.length * verts * 3);
  const uvs = new Float32Array(tiles.length * verts * 2);
  const colors = new Float32Array(tiles.length * verts * 3);
  const indices = new Uint32Array(tiles.length * stride);
  const tint = new THREE.Color();
  tiles.forEach((tile, t) => {
    const vertexBase = t * verts;
    tint.set(tile.tint || ROAD_TINTS[0]);
    for (let i = 0; i < verts; i++) {
      const from = i * 3;
      const to = (vertexBase + i) * 3;
      const localX = template.position[from];
      const localZ = template.position[from + 2];
      positions[to] = localX + tile.x;
      positions[to + 1] = template.position[from + 1] + ROAD_TILE.y;
      positions[to + 2] = localZ + tile.z;
      normals[to] = template.normal[from];
      normals[to + 1] = template.normal[from + 1];
      normals[to + 2] = template.normal[from + 2];
      colors[to] = tint.r;
      colors[to + 1] = tint.g;
      colors[to + 2] = tint.b;
      const uvAt = (vertexBase + i) * 2;
      uvs[uvAt] = (tile.x + localX) / ROAD_PATTERN_TILES;
      uvs[uvAt + 1] = (tile.z + localZ) / ROAD_PATTERN_TILES;
    }
    const indexBase = t * stride;
    for (let i = 0; i < stride; i++)
      indices[indexBase + i] = template.index[i] + vertexBase;
  });
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};
// Workers are small on screen, but giving them a little extra room keeps their
// hitboxes and carried goods from visually merging at a shared waypoint.
export const WORKER_CLEARANCE = 0.78;
const WORKER_CLEARANCE_SQUARED = WORKER_CLEARANCE * WORKER_CLEARANCE;
const WORKER_CONGESTION_RADIUS = 2.4;
const WORKER_CONGESTION_RADIUS_SQUARED =
  WORKER_CONGESTION_RADIUS * WORKER_CONGESTION_RADIUS;
const WORKER_NEXT_TARGET_RADIUS_SQUARED = 0.8 * 0.8;
// A stone path is the made road: villagers keep their full pace on it. Open
// ground is rough going and slows them to 0.7x, so paving a route is worth it.
export const ROAD_SPEED = 1.5;
export const OFF_ROAD_SPEED = 0.7;
export const travelSpeed = (onRoad) => (onRoad ? ROAD_SPEED : OFF_ROAD_SPEED);
// Routing is solved in travel time rather than tiles, so a tile costs the
// inverse of the speed a villager crosses it at. Keeping both derived from the
// same numbers stops A* from choosing a short route that is slower to walk.
export const travelStepCost = (onRoad) => 1 / travelSpeed(onRoad);
export const shouldRenderWorldFrame = (
  speed,
  time,
  lastPausedRender,
  interval = PAUSED_RENDER_INTERVAL,
) => speed > 0 || time - lastPausedRender >= interval;
const ROUTE_DIRECTIONS = Object.freeze([
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
]);
// Most placement checks do not need temporary grain-field connectivity state.
// Reuse one read-only-by-convention empty set on that pointer-move hot path;
// drag planting still supplies its own mutable virtual-field set.
const EMPTY_GRAIN_FIELDS = new Set();
const ROUTE_KEY_WIDTH = 128;
const ROUTE_KEY_OFFSET = 64;
const routeKey = (x, z) =>
  (x + ROUTE_KEY_OFFSET) * ROUTE_KEY_WIDTH + z + ROUTE_KEY_OFFSET;
const WORKER_REPATH_SECONDS = 1.1;
const WORKER_PASS_SECONDS = 1;
const WORKER_DEADLOCK_SECONDS = 1.8;
const WORKER_DEADLOCK_YIELD_SECONDS = 2.4;
const WORKER_DEADLOCK_RADIUS = 1.65;
const DEADLOCK_RADII = Object.freeze([1.15, 1.55, 2]);
const DEADLOCK_TURNS = Object.freeze([
  0,
  Math.PI / 4,
  -Math.PI / 4,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI,
]);
const DEADLOCK_AXIS = new THREE.Vector3(0, 1, 0);
const WORK_EFFECT_BUILDINGS = new Set(["farm", "bakery"]);
const PASSING_SIDES = Object.freeze([1, -1]);
function pushPriority(heap, item) {
  let index = heap.length;
  heap.push(item);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent][0] <= item[0]) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = item;
}
function popPriority(heap) {
  const first = heap[0];
  const last = heap.pop();
  if (heap.length && last) {
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= heap.length) break;
      const right = left + 1;
      const child =
        right < heap.length && heap[right][0] < heap[left][0] ? right : left;
      if (heap[child][0] >= last[0]) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return first;
}
export const DEFAULT_VILLAGE_NAME = "Willowbrook";
export const MAX_POPULATION = 24;
export const SAVE_VERSION = 7;
export const GRAIN_GROW_SECONDS = 30;
export const GRAIN_VISUAL_UPDATE_INTERVAL = 1 / 30;
export const TREE_REGROW_SECONDS = 90;
export const TREE_VISUAL_UPDATE_INTERVAL = 1 / 30;
export const TREE_LOG_AMOUNT = 8;
export const LUMBERYARD_PROCESS_SECONDS = 5;
export const HUNGER_SECONDS = 75;
export const HUNGRY_THRESHOLD = 0.82;
export const EAT_SECONDS = 8;
export const INN_SEATS = 3;
// How much one carrier shoulders per trip, matching a builder's material load.
export const CARRIER_LOAD = 10;
// Phases where a villager is already holding goods. They finish the trip
// rather than being pulled off it by a pause, a reroute or a blocked path.
export const CARRYING_PHASES = Object.freeze([
  "lumber_delivery",
  "material_delivery",
  "stock_delivery",
  "haul_pickup",
  "haul_deliver",
  "storehouse_exit",
]);
export const MEAL_SATIETY = 0.12;
// Every lantern-lit building used to own two real PointLights, so a village at
// the population cap put 30+ of them in the scene. Three.js compiles the light
// count into every material, and past roughly sixteen lights the frame cost
// runs far past the 16.7ms budget. Lanterns now share a small fixed pool that
// follows the camera; the per-lamp glow sprites still light every window.
export const LANTERN_LIGHT_BUDGET = Object.freeze({ low: 0, balanced: 6, high: 10 });
export const lanternLightBudget = (preset) =>
  LANTERN_LIGHT_BUDGET[preset] ?? LANTERN_LIGHT_BUDGET.balanced;
// Shadow maps dominate the renderer's largest depth allocation. Keep the
// balanced preset light enough for phones while leaving the high preset as the
// full-quality option.
export const shadowMapSizeForPreset = (preset, viewportWidth = 1280) => {
  if (preset === "low") return 512;
  if (preset === "high") return viewportWidth <= 720 ? 1536 : 2048;
  return viewportWidth <= 720 ? 1024 : 1536;
};
// Reassigning which lamps are lit is a sort over every lantern, and swapping a
// light's position is free while the *count* stays fixed (a changed count
// recompiles every material). Re-aim a few times a second, never per frame.
export const LANTERN_REAIM_SECONDS = 0.35;
export const grainGrowthProgress = (plantedAt, elapsed) =>
  Math.max(
    0,
    Math.min(
      1,
      (finiteNumber(elapsed, 0) - finiteNumber(plantedAt, 0)) /
        GRAIN_GROW_SECONDS,
    ),
  );
export const grainGrowthStage = (plantedAt, elapsed) => {
  const progress = grainGrowthProgress(plantedAt, elapsed);
  if (progress >= 1) return "ripe";
  if (progress >= 0.58) return "growing";
  if (progress >= 0.24) return "sprout";
  return "sown";
};
export const treeRegrowthProgress = (regrowAt, elapsed) => {
  const remaining = Math.max(0, finiteNumber(regrowAt, 0) - finiteNumber(elapsed, 0));
  return Math.max(0, Math.min(1, 1 - remaining / TREE_REGROW_SECONDS));
};
export const treeGrowthStage = (progress) => {
  const value = Math.max(0, Math.min(1, finiteNumber(progress, 0)));
  if (value < 0.18) return "stump";
  if (value < 0.58) return "sapling";
  return "full";
};
export const sanitizeVillageName = (value, fallback = DEFAULT_VILLAGE_NAME) => {
  if (typeof value !== "string") return fallback;
  const name = value.trim().replace(/\s+/g, " ").slice(0, 24);
  return name || fallback;
};
export const finiteNumber = (value, fallback) => {
  if (value === null || value === "" || typeof value === "boolean")
    return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const normalizedAmountRecord = (record) =>
  Object.fromEntries(
    Object.entries(record && typeof record === "object" ? record : {}).map(
      ([key, value]) => [key, Math.max(0, finiteNumber(value, 0))],
    ),
  );
const normalizedCountRecord = (record) =>
  Object.fromEntries(
    Object.entries(record && typeof record === "object" ? record : {}).map(
      ([key, value]) => [key, Math.max(0, Math.floor(finiteNumber(value, 0)))],
    ),
  );
export const sanitizeCameraView = (view) => {
  if (!view || typeof view !== "object") return null;
  const position = Array.isArray(view.position) ? view.position.map(Number) : null;
  const target = Array.isArray(view.target) ? view.target.map(Number) : null;
  if (
    !position ||
    !target ||
    position.length !== 3 ||
    target.length !== 3 ||
    [...position, ...target].some((value) => !Number.isFinite(value))
  )
    return null;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  return {
    position: [
      clamp(position[0], -80, 80),
      clamp(position[1], 1, 100),
      clamp(position[2], -80, 80),
    ],
    target: [
      clamp(target[0], -20, 18),
      clamp(target[1], -4, 4),
      clamp(target[2], -24, 24),
    ],
    zoom: clamp(finiteNumber(view.zoom, 1), 0.65, 2.4),
  };
};
// The woodcutter shoulders the axe and the miner his pick between swings; the
// swing animations and the rest poses both work from this angle.
export const AXE_CARRY_ANGLE = -0.25;
export const WORKER_TYPES = Object.freeze({
  BUILDER: "builder",
  WOODCUTTER: "woodcutter",
  MINER: "miner",
  FARMER: "farmer",
  BAKER: "baker",
  CARRIER: "carrier",
});
export const WORKER_TYPE_LABELS = Object.freeze({
  [WORKER_TYPES.BUILDER]: "Builder",
  [WORKER_TYPES.WOODCUTTER]: "Woodcutter",
  [WORKER_TYPES.MINER]: "Miner",
  [WORKER_TYPES.FARMER]: "Farmer",
  [WORKER_TYPES.BAKER]: "Baker",
  [WORKER_TYPES.CARRIER]: "Carrier",
});
export const workerTypeForBuilding = (type) =>
  ({
    lumberyard: WORKER_TYPES.WOODCUTTER,
    mine: WORKER_TYPES.MINER,
    farm: WORKER_TYPES.FARMER,
    bakery: WORKER_TYPES.BAKER,
    // Keep the existing windmill production loop useful while sharing the
    // baker appearance and role with the village's food-processing buildings.
    windmill: WORKER_TYPES.BAKER,
    // A vintner tends vines and treads the harvest, so the vineyard shares
    // the farmer role rather than introducing a second field worker type.
    vineyard: WORKER_TYPES.FARMER,
    // Stores are the carrier's post. The town hall counts too, so a village
    // can move goods before it can afford its first Storehouse.
    townhall: WORKER_TYPES.CARRIER,
    storehouse: WORKER_TYPES.CARRIER,
  })[type] || null;
// How many finished goods a producer can pile up before its worker stops.
export const outputCapForBuilding = (type) =>
  Math.max(0, Math.floor(finiteNumber(CATALOG[type]?.outputCap, 0)));
// How much of each resource a finished store can hold.
export const storageForBuilding = (type) =>
  type === "townhall"
    ? TOWNHALL_STORAGE
    : Math.max(0, Math.floor(finiteNumber(CATALOG[type]?.storage, 0)));
export const isStoreBuilding = (type) => storageForBuilding(type) > 0;
// A load a full village handed back can briefly push a producer over its cap,
// so saves keep one carrier load of headroom while still rejecting forged
// figures. The building stays stalled until a carrier drains it either way.
export const savedStockLimit = (type) =>
  outputCapForBuilding(type) ? outputCapForBuilding(type) + CARRIER_LOAD : 0;
export const workerCapacityForBuilding = (type) =>
  ({
    lumberyard: 2,
    farm: 1,
    mine: 1,
    bakery: 1,
    windmill: 1,
    vineyard: 1,
    townhall: 2,
    storehouse: 3,
  })[type] || 0;
// The School trains the general builder plus each trade. A trade is capped by
// the posts the village has actually built; builders answer only to housing.
export const TRAINABLE_WORKER_TYPES = Object.freeze([
  WORKER_TYPES.BUILDER,
  WORKER_TYPES.WOODCUTTER,
  WORKER_TYPES.MINER,
  WORKER_TYPES.FARMER,
  WORKER_TYPES.BAKER,
  WORKER_TYPES.CARRIER,
]);
export const TRAINING_SECONDS = Math.max(
  1,
  finiteNumber(CATALOG.school?.trainSeconds, 18),
);
export const normalizedTrainingSession = (buildingType, session) => {
  if (buildingType !== "school" || !session) return null;
  if (!TRAINABLE_WORKER_TYPES.includes(session.type)) return null;
  return {
    type: session.type,
    remaining: Math.min(
      TRAINING_SECONDS,
      Math.max(0, finiteNumber(session.remaining, TRAINING_SECONDS)),
    ),
    waiting: Boolean(session.waiting),
  };
};
export const pendingTrainingCount = (buildings = [], workerType) =>
  (Array.isArray(buildings) ? buildings : []).filter(
    (building) =>
      building?.type === "school" && building.training?.type === workerType,
  ).length;
export const workplaceNamesForWorkerType = (workerType) =>
  Object.keys(CATALOG)
    .filter((type) => workerTypeForBuilding(type) === workerType)
    .map((type) => CATALOG[type].name);
export const jobCapacityForWorkerType = (buildings = [], workerType) =>
  (Array.isArray(buildings) ? buildings : []).reduce(
    (total, building) =>
      building?.progress === 1 &&
      workerTypeForBuilding(building.type) === workerType
        ? total + workerCapacityForBuilding(building.type)
        : total,
    0,
  );
export const trainedWorkerCount = (workers = [], workerType) =>
  (Array.isArray(workers) ? workers : []).filter(
    (worker) => worker?.trainedType === workerType,
  ).length;
export const trainingOptions = (buildings = [], workers = []) => {
  const list = Array.isArray(buildings) ? buildings : [];
  const housed = (Array.isArray(workers) ? workers : []).length;
  const capacity = Math.min(MAX_POPULATION, housingCapacity(list));
  // Villagers already in training have a bed and a post reserved for them.
  const inTraining = list.filter(
    (building) => building?.type === "school" && building.training,
  ).length;
  const housingRoom = capacity - housed - inTraining;
  const noRoom = housingRoom <= 0 ? "No housing space for another villager" : null;
  return TRAINABLE_WORKER_TYPES.map((type) => {
    const label = WORKER_TYPE_LABELS[type];
    const pending = pendingTrainingCount(list, type);
    const trained = trainedWorkerCount(workers, type);
    // Builders take any job that needs hands, so housing is their only limit.
    const posts =
      type === WORKER_TYPES.BUILDER ? null : jobCapacityForWorkerType(list, type);
    const filled = trained + pending;
    const reason =
      posts === null
        ? noRoom
        : posts === 0
          ? `Needs a completed ${workplaceNamesForWorkerType(type).join(" or ")}`
          : filled >= posts
            ? pending > 0
              ? `A ${label.toLowerCase()} is already in training`
              : `Every ${label.toLowerCase()} post is already filled`
            : noRoom;
    return {
      type,
      label,
      trained,
      pending,
      posts,
      canTrain: !reason,
      reason,
    };
  });
};
export const housingCapacity = (buildings = []) =>
  4 +
  buildings.filter(
    (building) => building?.type === "house" && building.progress === 1,
  ).length *
    2;
export const STARTING_POPULATION = 2;
export const safePopulation = (value, capacity, fallback = STARTING_POPULATION) =>
  Math.min(
    MAX_POPULATION,
    Math.max(0, Math.floor(finiteNumber(value, fallback))),
    Math.max(0, Math.floor(finiteNumber(capacity, 0))),
  );
export const restoredPopulation = (value, capacity) => {
  const safeCapacity = Math.max(0, Math.floor(finiteNumber(capacity, 0)));
  const population = safePopulation(value, safeCapacity);
  return safeCapacity > 0 ? Math.max(1, population) : 0;
};
export const normalizedBuildingProgress = (type, value) =>
  type === "townhall"
    ? 1
    : Math.min(1, Math.max(0, finiteNumber(value, 1)));
export const normalizedConstructionMaterials = (
  type,
  materials,
  progress = 0,
) => {
  const cost = CATALOG[type]?.cost || {};
  const restored = materials && typeof materials === "object";
  return Object.fromEntries(
    Object.entries(cost).map(([resource, required]) => [
      resource,
      Math.min(
        required,
        Math.max(
          0,
          finiteNumber(
            restored ? materials[resource] : undefined,
            progress > 0 ? required : 0,
          ),
        ),
      ),
    ]),
  );
};
export const constructionMaterialsReady = (building) =>
  Object.entries(CATALOG[building?.type]?.cost || {}).every(
    ([resource, required]) =>
      finiteNumber(building?.materials?.[resource], 0) >= required,
  );
export const constructionMaterialProgress = (building) => {
  const cost = CATALOG[building?.type]?.cost || {};
  const required = Object.values(cost).reduce((total, amount) => total + amount, 0);
  if (!required) return 1;
  const delivered = Object.entries(cost).reduce(
    (total, [resource, amount]) =>
      total + Math.min(amount, finiteNumber(building?.materials?.[resource], 0)),
    0,
  );
  return Math.max(0, Math.min(1, delivered / required));
};
// Only tiles the player laid count toward path progress. The starter village
// ships with base roads already on the ground, so callers that hold the full
// road set must hand over `baseRoads` to have them discounted.
export const reconcileRoadCount = (created = {}, roads = new Set(), baseRoads = new Set()) => {
  if (!(roads instanceof Set)) return { ...created, road: 0 };
  const base = baseRoads instanceof Set ? baseRoads : new Set();
  let road = 0;
  for (const key of roads) if (!base.has(key)) road++;
  return { ...created, road };
};
export const saveCycleMarker = (elapsed) =>
  Math.floor(Math.max(0, finiteNumber(elapsed, 0)));

export const summarizeVillageSave = (record = {}) => {
  const buildings = Array.isArray(record.buildings) ? record.buildings : [];
  return {
    name: sanitizeVillageName(record.name),
    population: Math.min(
      MAX_POPULATION,
      Math.max(0, Math.floor(finiteNumber(record.population, 0))),
    ),
    buildings: buildings.filter(
      (building) =>
        building?.type !== "road" && building?.type !== "grainfield",
    ).length,
    paths: Array.isArray(record.roads) ? record.roads.length : 0,
  };
};

export const parseVillageImport = (value) => {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.buildings))
      return { ok: false, reason: "This file is not a Hearth & Hamlet village save." };
    const summary = summarizeVillageSave(parsed);
    return { ok: true, value: parsed, summary };
  } catch {
    return { ok: false, reason: "That village file could not be read." };
  }
};
export const savedBuildingFits = (building, existing = []) => {
  if (!building || building.type === "road") return false;
  if (building.type !== "townhall" && !CATALOG[building.type]) return false;
  if (
    building.type === "townhall" &&
    existing.some((candidate) => candidate.type === "townhall")
  )
    return false;
  const x = Number(building.x);
  const z = Number(building.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const size = (CATALOG[building.type]?.size || 4) / 2;
  const boundary = buildBoundaryFor(existing);
  if (
    x - size < -boundary ||
    z - size < -boundary ||
    z + size > boundary ||
    x + size > riverX(z) - 0.7
  )
    return false;
  return !existing.some(
    (candidate) =>
      Math.abs(x - candidate.x) <
        (CATALOG[candidate.type]?.size || 4) / 2 + size - 0.1 &&
      Math.abs(z - candidate.z) <
        (CATALOG[candidate.type]?.size || 4) / 2 + size - 0.1,
  );
};
export class Village {
  constructor(container, onUpdate, onNotify, onSelect, onLoaded, onPlacementComplete) {
    this.container = container;
    this.onUpdate = onUpdate;
    this.notify = onNotify;
    this.onSelect = onSelect;
    this.onLoaded = onLoaded;
    this.onPlacementComplete = onPlacementComplete;
    this.buildings = [];
    this.workers = [];
    // Keep raycast roots stable. Pointer hover can fire many times per frame,
    // so rebuilding these arrays from the simulation collections is needless
    // allocation on an interaction hot path.
    this.pickTargets = [];
    this.workerPickTargets = [];
    this.buildingPickTargets = [];
    this.nextWorkerId = 0;
    this.nextBuildingId = 0;
    this.decor = [];
    this.clearedScenery = new Set();
    this.swayers = [];
    this.motes = null;
    this.moteSeeds = [];
    this.deliveryBursts = [];
    this.birds = [];
    this.birdsVisible = null;
    this.workerShadowField = null;
    this.lanternLights = [];
    this.lanternReaim = 0;
    this.roads = new Set();
    this.roadTiles = new Map();
    this.roadRevision = 0;
    this.roadSurfaceMesh = null;
    this.roadsDirty = false;
    this.grassField = null;
    this.baseRoads = new Set();
    this.resources = { wood: 140, stone: 95, food: 80, wheat: 0, wine: 0 };
    this.name = DEFAULT_VILLAGE_NAME;
    this.elapsed = 0;
    this.speed = 1;
    this.selected = null;
    this.rotation = 0;
    this.pathStart = null;
    this.ghostGeometryOwned = false;
    this.lastUI = 0;
    this.lastGrainFieldUpdate = -Infinity;
    this.lastBuildingEffectUpdate = -Infinity;
    this.lastAtmosphereUpdate = -Infinity;
    this.lastPausedRender = -Infinity;
    this.lastSave = -1;
    this.lastSavedAt = 0;
    this.saveFingerprint = null;
    this.storageConflict = false;
    this.gathered = 0;
    this.delivered = { wood: 0, stone: 0, food: 0, wheat: 0, wine: 0 };
    this.chapterRewards = {};
    this.tutorialStep = 0;
    // Tutorial fields remain save-compatible, but the introduction is no
    // longer surfaced or advanced in the playable village.
    this.tutorialDismissed = true;
    this.feast = null;
    this.trendSample = { elapsed: 0, resources: { ...this.resources } };
    this.trends = { wood: 0, stone: 0, food: 0, wheat: 0, wine: 0 };
    this.activity = "";
    this.activityTime = 0;
    this.activityLog = [];
    this.nextActivityId = 0;
    this.created = {};
    this.dead = false;
    this.healthCheck = Boolean(
      typeof window !== "undefined" &&
        window.parent !== window &&
        new URLSearchParams(window.location.search).has("healthcheck"),
    );
    // The embedded performance sample must never compete with the playable
    // tab for the player's local save or mark it stale.
    this.storageAvailable = !this.healthCheck;
    this.motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
    this.reduceMotion = Boolean(this.motionQuery?.matches);
    this.motionChange = (event) => {
      this.reduceMotion = Boolean(event.matches);
    };
    if (this.motionQuery?.addEventListener) {
      this.motionQuery.addEventListener("change", this.motionChange);
    } else {
      this.motionQuery?.addListener?.(this.motionChange);
    }
    this.graphicsPreset = "balanced";
    this.audioSettings = { effects: true, ambience: false };
    try {
      const settings = JSON.parse(localStorage.getItem("hearth-settings") || "{}");
      if (["low", "balanced", "high"].includes(settings.graphicsPreset))
        this.graphicsPreset = settings.graphicsPreset;
      this.audioSettings = {
        effects: settings.effects !== false,
        ambience: settings.ambience === true,
      };
    } catch {}
    this.audioContext = null;
    this.ambientOscillator = null;
    this.models = {};
    this.thumbnails = {};
    this.thumbnailRenderer = null;
    this.thumbnailTask = null;
    this.thumbnailTaskKind = null;
    this.thumbnailWaitResolve = null;
    this.saved = null;
    if (!this.healthCheck) {
      try {
        const rawSave = localStorage.getItem("hearth-v1");
        try {
          this.saved = rawSave ? JSON.parse(rawSave) : null;
          if (this.saved && typeof this.saved === "object") {
            this.lastSavedAt = Date.now();
            this.saveFingerprint = rawSave;
          }
        } catch {
          this.saved = null;
        }
      } catch {
        this.storageAvailable = false;
      }
    }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#a7b673");
    this.scene.fog = new THREE.Fog("#a7b673", 65, 120);
    this.atmosphere = {
      day: new THREE.Color("#a7b673"),
      dusk: new THREE.Color("#c98d6a"),
      night: new THREE.Color("#516878"),
      fog: new THREE.Color(),
      sky: new THREE.Color(),
      sunDay: new THREE.Color("#fff0cd"),
      sunWarm: new THREE.Color("#ffc083"),
      sun: new THREE.Color(),
    };
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.graphicsPreset !== "low",
      alpha: false,
    });
    this.pixelRatio = () =>
      Math.min(
        devicePixelRatio,
        this.graphicsPreset === "low"
          ? 1
          : window.innerWidth <= 720
            ? this.graphicsPreset === "high"
              ? 1.65
              : 1.35
            : this.graphicsPreset === "high"
              ? 2.2
              : 2,
      );
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.shadowMap.enabled = this.graphicsPreset !== "low";
    this.renderer.shadowMap.type =
      this.graphicsPreset === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-25, 25, 18, -18, 0.1, 180);
    this.camera.position.set(30, 37, 42);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, -1);
    this.controls.enableDamping = true;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 2.4;
    this.controls.maxPolarAngle = Math.PI * 0.43;
    this.controls.minPolarAngle = Math.PI * 0.16;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.point = new THREE.Vector3();
    this.makeWorld();
    this.resizeFrame = null;
    this.resize = () => {
      if (this.resizeFrame != null) return;
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = null;
        if (this.dead) return;
        const w = container.clientWidth,
          h = container.clientHeight;
        // A hidden or transitioning shell can briefly report no height. Wait
        // for the next observer/window notification instead of poisoning the
        // orthographic projection with Infinity or asking WebGL for a 0x0
        // drawing buffer.
        if (w <= 0 || h <= 0) return;
        const view = 30;
        this.camera.left = (-view * w) / h / 2;
        this.camera.right = (view * w) / h / 2;
        this.camera.top = view / 2;
        this.camera.bottom = -view / 2;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(this.pixelRatio());
        this.renderer.setSize(w, h);
      });
    };
    this.resize();
    this.resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    this.restoreView();
    window.addEventListener("resize", this.resize);
    this.pointerFrame = null;
    this.pendingPointerEvent = null;
    this.move = (e) => this.schedulePointerMove(e);
    this.down = (e) => {
      this.startPointer = [e.clientX, e.clientY];
      this.pathStart = null;
      if (
        e.button === 0 &&
        (this.selected === "road" || this.selected === "grainfield")
      ) {
        this.flushPointerMove(e);
        if (this.placement)
          this.pathStart = { x: this.placement.x, z: this.placement.z };
      }
    };
    this.up = (e) => {
      if (e.button !== 0 || !this.startPointer) return;
      const distance = Math.hypot(
        e.clientX - this.startPointer[0],
        e.clientY - this.startPointer[1],
      );
      if (
        (this.selected === "road" || this.selected === "grainfield") &&
        this.pathStart &&
        distance >= 6
      ) {
        this.flushPointerMove(e);
        if (this.selected === "road") this.paintRoad(this.pathStart, this.placement);
        else this.paintGrainField(this.pathStart, this.placement);
      } else if (distance < 6) {
        this.cancelPointerMove();
        this.click(e);
      }
      this.pathStart = null;
      this.startPointer = null;
    };
    this.cancelPointer = (e) => {
      this.cancelPointerMove();
      this.pathStart = null;
      this.startPointer = null;
    };
    container.addEventListener("pointermove", this.move);
    container.addEventListener("pointerdown", this.down);
    container.addEventListener("pointerup", this.up);
    container.addEventListener("pointercancel", this.cancelPointer);
    container.addEventListener(
      "contextmenu",
      (this.context = (e) => e.preventDefault()),
    );
    this.beforeUnload = () => {
      if (!this.healthCheck) this.save();
    };
    this.visibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        !this.dead &&
        this.frame == null
      ) {
        // Discard the hidden interval so resuming never creates a simulation
        // jump or an oversized first animation delta.
        this.clock?.getDelta();
        this.frame = requestAnimationFrame(this.animate);
      }
    };
    this.storageChange = (event) => {
      if (event.key !== "hearth-v1" && event.key !== null) return;
      if (this.storageConflict) return;
      this.storageConflict = true;
      this.speed = 0;
      if (this.ready) {
        this.notify(
          "This village changed in another tab. Reload to continue from the latest save.",
        );
        this.emit();
      }
    };
    if (!this.healthCheck) {
      window.addEventListener("pagehide", this.beforeUnload);
      window.addEventListener("storage", this.storageChange);
    }
    document.addEventListener("visibilitychange", this.visibilityChange);
    this.clock = new THREE.Clock();
    this.animate();
    this.load();
  }
  schedulePointerMove(event) {
    this.pendingPointerEvent = event;
    if (this.pointerFrame != null) return;
    this.pointerFrame = requestAnimationFrame(() => {
      this.pointerFrame = null;
      const pending = this.pendingPointerEvent;
      this.pendingPointerEvent = null;
      if (!this.dead && pending) this.pointerMove(pending);
    });
  }
  cancelPointerMove() {
    if (this.pointerFrame != null) cancelAnimationFrame(this.pointerFrame);
    this.pointerFrame = null;
    this.pendingPointerEvent = null;
  }
  flushPointerMove(event) {
    this.cancelPointerMove();
    this.pointerMove(event);
  }
  mesh(geometry, color, x, y, z) {
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        flatShading: true,
      }),
    );
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
  makeWorld() {
    this.hemi = new THREE.HemisphereLight("#fff5df", "#6a7842", 1.65);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff0cd", 2.7);
    this.sun.position.set(-18, 35, 15);
    this.sun.castShadow = true;
    const shadowMapSize = shadowMapSizeForPreset(
      this.graphicsPreset,
      window.innerWidth,
    );
    this.shadowMapSize = shadowMapSize;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    Object.assign(this.sun.shadow.camera, {
      left: -36,
      right: 36,
      top: 36,
      bottom: -36,
      near: 1,
      far: 90,
    });
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    const geo = new THREE.PlaneGeometry(150, 150, 65, 65);
    geo.rotateX(-Math.PI / 2);
    const cols = new Float32Array(geo.attributes.position.count * 3);
    const p = geo.attributes.position;
    const color = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      color.setHSL(
        0.215 + rand() * 0.017,
        0.39 + rand() * 0.035,
        0.45 + rand() * 0.016,
      );
      color.convertSRGBToLinear();
      const offset = i * 3;
      cols[offset] = color.r;
      cols[offset + 1] = color.g;
      cols[offset + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const land = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    land.position.y = -0.045;
    land.receiveShadow = true;
    this.scene.add(land);
    this.groundPatches = [];
    for (let i = 0; i < 34; i++) {
      const x = rand() * 58 - 29;
      const z = rand() * 53 - 27;
      if (x > riverX(z) - 1.4 || Math.hypot(x, z) < 3.5) continue;
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(0.7 + rand() * 1.4, 7),
        new THREE.MeshBasicMaterial({
          color: rand() > 0.5 ? "#d0d680" : "#829d50",
          transparent: true,
          opacity: 0.08 + rand() * 0.06,
          depthWrite: false,
        }),
      );
      patch.position.set(x, 0.002, z);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = rand() * Math.PI;
      this.scene.add(patch);
      this.groundPatches.push(patch);
    }
    this.grid = new THREE.GridHelper(42, 42, "#eee4b3", "#dde1b6");
    // Roads and placement coordinates are tile centers at integer x/z values.
    // GridHelper puts its lines on integer values by default, which would
    // draw the grid through the middle of each tile. Offset by half a tile
    // to align the visual guide with the half-integer boundaries of each cell.
    this.grid.position.set(0.5, 0.025, 0.5);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.24;
    this.grid.visible = false;
    this.scene.add(this.grid);
    const waterVertexCount = Math.ceil((75 - -75) / 2) * 6;
    const waterVerts = new Float32Array(waterVertexCount * 3);
    const waterColors = new Float32Array(waterVertexCount * 3);
    let waterVertex = 0;
    const waterColor = new THREE.Color();
    for (let z = -75; z < 75; z += 2) {
      const l = riverX(z),
        l2 = riverX(z + 2);
      for (const v of [
        [l, z],
        [l2, z + 2],
        [l + 8, z],
        [l + 8, z],
        [l2, z + 2],
        [l2 + 8, z + 2],
      ]) {
        const vertexOffset = waterVertex++ * 3;
        waterVerts[vertexOffset] = v[0];
        waterVerts[vertexOffset + 1] = 0.018;
        waterVerts[vertexOffset + 2] = v[1];
        waterColor.setHSL(
          0.535 + rand() * 0.016,
          0.47,
          0.46 + rand() * 0.07,
        );
        waterColor.convertSRGBToLinear();
        waterColors[vertexOffset] = waterColor.r;
        waterColors[vertexOffset + 1] = waterColor.g;
        waterColors[vertexOffset + 2] = waterColor.b;
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(waterVerts, 3),
    );
    wg.setAttribute("color", new THREE.Float32BufferAttribute(waterColors, 3));
    wg.computeVertexNormals();
    this.water = new THREE.Mesh(
      wg,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.4,
        metalness: 0.12,
        side: THREE.DoubleSide,
      }),
    );
    this.scene.add(this.water);
    // Sandy river banks follow the water's curve. Every disc is the same opaque
    // circle in the same colour and none of them ever move, so they ride in a
    // single instanced draw rather than ~430 meshes with ~430 materials.
    const bank = [];
    for (let z = -65; z < 65; z += 0.6)
      for (const side of [0, 8]) bank.push([riverX(z) + side, z]);
    this.riverBank = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.69, 7),
      new THREE.MeshStandardMaterial({
        color: "#b8b47c",
        roughness: 1,
        flatShading: true,
      }),
      bank.length,
    );
    this.riverBank.receiveShadow = true;
    const bankPose = new THREE.Object3D();
    bankPose.rotation.x = -Math.PI / 2;
    bank.forEach(([x, z], index) => {
      bankPose.position.set(x, 0.001, z);
      bankPose.updateMatrix();
      this.riverBank.setMatrixAt(index, bankPose.matrix);
    });
    this.riverBank.instanceMatrix.needsUpdate = true;
    this.scene.add(this.riverBank);
    for (const { x, z } of STARTER_ROADS) this.addRoad(x, z, false, true);
    this.ripples = [];
    for (let i = 0; i < 45; i++) {
      const z = rand() * 70 - 35;
      const m = this.mesh(
        new THREE.PlaneGeometry(0.35 + rand() * 0.8, 0.024),
        "#9ed5c7",
        riverX(z) + 1 + rand() * 6,
        0.04,
        z,
      );
      m.rotation.x = -Math.PI / 2;
      m.material.transparent = true;
      m.material.opacity = 0.28 + rand() * 0.17;
      m.material.depthWrite = false;
      m.userData.baseX = m.position.x;
      m.userData.phase = rand() * Math.PI * 2;
      m.userData.speed = 0.45 + rand() * 0.4;
      this.ripples.push(m);
    }
    this.reeds = [];
    for (let z = -58; z < 58; z += 1.9 + rand() * 1.4) {
      for (const side of [0, 8]) {
        if (rand() < 0.35) continue;
        const m = this.mesh(
          new THREE.ConeGeometry(0.045, 0.45 + rand() * 0.3, 3),
          rand() > 0.45 ? "#82984e" : "#9caa59",
          riverX(z) + side + (rand() - 0.5) * 0.35,
          0.22,
          z + (rand() - 0.5) * 0.45,
        );
        m.rotation.z = (rand() - 0.5) * 0.55;
        m.userData.baseZ = m.rotation.z;
        m.userData.phase = rand() * Math.PI * 2;
        m.userData.speed = 1.1 + rand() * 0.6;
        m.userData.amount = 0.12 + rand() * 0.08;
        this.reeds.push(m);
        this.swayers.push(m);
      }
    }
    const motePositions = [];
    for (let i = 0; i < 28; i++) {
      const x = rand() * 32 - 16;
      const z = rand() * 32 - 16;
      const y = 0.7 + rand() * 2.2;
      motePositions.push(x, y, z);
      this.moteSeeds.push({ x, y, z, phase: rand() * Math.PI * 2, speed: 0.35 + rand() * 0.4 });
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.Float32BufferAttribute(motePositions, 3));
    this.motes = new THREE.Points(
      moteGeometry,
      new THREE.PointsMaterial({
        color: "#f4dfa0",
        size: 0.1,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this.motes);
    this.addBirds();
    // Small wooden landing on the riverbank.
    for (let i = 0; i < 10; i++)
      this.mesh(
        new THREE.BoxGeometry(0.38, 0.18, 2.1),
        i % 2 ? "#ac7945" : "#b8874e",
        14.8 + i * 0.39,
        0.22,
        8,
      );
    for (let x of [14.7, 18.4])
      for (let z of [7, 9]) {
        const m = this.mesh(
          new THREE.BoxGeometry(0.18, 1, 0.18),
          "#72502c",
          x,
          0.28,
          z,
        );
        m.castShadow = true;
      }
    this.syncGraphicsDetail();
  }
  roadSurfaceTexture() {
    if (this.roadSurface !== undefined) return this.roadSurface;
    this.roadSurface = null;
    if (typeof document === "undefined") return null;
    const size = 320;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // A private generator keeps the cobble layout from shifting the shared
    // world sequence that places trees, rocks and decor.
    let cobbleSeed = 1276509;
    const next = () => {
      cobbleSeed = (1664525 * cobbleSeed + 1013904223) >>> 0;
      return cobbleSeed / 4294967296;
    };
    // Everything is drawn nine times so the patch wraps seamlessly and no
    // stone is cut in half at the repeat boundary.
    const wrapped = (x, y, reach, draw) => {
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const px = x + dx * size;
          const py = y + dy * size;
          if (px < -reach || px > size + reach) continue;
          if (py < -reach || py > size + reach) continue;
          draw(px, py);
        }
    };
    ctx.fillStyle = "#5b5341";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 80; i++) {
      const fill = ["#514a3a", "#655d49", "#4a4537"][Math.floor(next() * 3)];
      const radius = 6 + next() * 18;
      wrapped(next() * size, next() * size, radius, (px, py) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    const faces = ["#a8a79b", "#93948b", "#b4b2a5", "#83847c", "#bcbaac", "#9b9285", "#78796f"];
    const columns = 15;
    const cell = size / columns;
    for (let row = 0; row < columns; row++)
      for (let column = 0; column < columns; column++) {
        const cx = (column + 0.5 + (next() - 0.5) * 0.34) * cell;
        const cy = (row + 0.5 + (next() - 0.5) * 0.34) * cell;
        const wide = next() > 0.86 ? 1.32 : 1;
        const rx = cell * (0.4 + next() * 0.1) * wide;
        const ry = cell * (0.36 + next() * 0.11);
        const turn = next() * Math.PI;
        const fill = faces[Math.floor(next() * faces.length)];
        wrapped(cx, cy, cell * 1.4, (px, py) => {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(turn);
          ctx.fillStyle = "#48432f";
          ctx.beginPath();
          ctx.ellipse(1, 1.4, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.ellipse(0, 0, rx * 0.87, ry * 0.87, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }
    // Broad, faint washes stop the repeat from reading as a regular weave.
    ctx.globalAlpha = 0.13;
    for (let i = 0; i < 16; i++) {
      const fill = next() > 0.5 ? "#dcd8c8" : "#4d4839";
      const radius = 24 + next() * 54;
      wrapped(next() * size, next() * size, radius, (px, py) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.roadSurface = texture;
    return texture;
  }
  addRoad(x, z, custom = true, base = false) {
    const key = `${x},${z}`;
    if (this.roads.has(key)) return;
    this.roads.add(key);
    if (base) this.baseRoads.add(key);
    this.roadTiles ||= new Map();
    this.roadTiles.set(key, {
      x,
      z,
      tint: ROAD_TINTS[Math.floor(rand() * ROAD_TINTS.length)],
    });
    this.roadRevision = (this.roadRevision || 0) + 1;
    // Painting a path calls this once per tile; the surface is rebuilt once on
    // the next frame instead of once per tile.
    this.roadsDirty = true;
    if (custom) {
      this.created.road =
        Math.max(0, Math.floor(finiteNumber(this.created.road, 0))) + 1;
    }
  }
  // Grass was ~350 meshes with ~350 unique materials, none of which ever moved
  // apart from a shared sway. One instanced draw replaces all of them; the per
  // blade size lives in the instance scale and the two tints in instance color.
  buildGrassField(blades = []) {
    if (!blades.length || typeof this.scene?.add !== "function") return null;
    const mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 3),
      new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
      blades.length,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.receiveShadow = true;
    const tint = new THREE.Color();
    blades.forEach((blade, index) => {
      tint.set(blade.color);
      mesh.setColorAt(index, tint);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
    this.grassField = {
      mesh,
      blades,
      dummy: new THREE.Object3D(),
      settled: false,
      lastUpdate: -Infinity,
    };
    mesh.visible = this.graphicsPreset !== "low";
    this.updateGrassField(0, 0);
    return mesh;
  }
  updateGrassField(time = 0, motion = 1) {
    const field = this.grassField;
    if (!field) return false;
    if (this.graphicsPreset === "low") return false;
    // With reduced motion the blades never move, so they are posed once and the
    // per-frame matrix upload is skipped entirely.
    if (!motion && field.settled) return false;
    // Grass is atmospheric detail; updating its instance buffer at 30 Hz keeps
    // the sway alive while avoiding 350 matrix writes on every 60 Hz frame.
    if (motion && time - field.lastUpdate < GRASS_UPDATE_INTERVAL) return false;
    const { mesh, blades, dummy } = field;
    for (let i = 0; i < blades.length; i++) {
      const blade = blades[i];
      dummy.position.set(blade.x, 0.12, blade.z);
      dummy.rotation.set(
        0,
        0,
        blade.rotationZ +
          Math.sin(time * blade.speed + blade.phase) * blade.amount * motion,
      );
      dummy.scale.set(blade.radius, blade.height, blade.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    field.lastUpdate = time;
    field.settled = !motion;
    return true;
  }
  syncGraphicsDetail() {
    const low = this.graphicsPreset === "low";
    if (this.grassField?.mesh) this.grassField.mesh.visible = !low;
    if (this.motes) this.motes.visible = !low;
    for (const ripple of this.ripples || []) ripple.visible = !low;
    const birdsVisible =
      !low &&
      !this.reduceMotion &&
      (this.atmosphere?.sunHeight ?? 1) > 0.16;
    if (this.birdsVisible !== birdsVisible) {
      this.birdsVisible = birdsVisible;
      for (const bird of this.birds || []) bird.group.visible = birdsVisible;
    }
  }
  ensureRoadSurface() {
    if (typeof this.scene?.add !== "function") return null;
    if (!this.roadSurfaceMesh) {
      const material = new THREE.MeshStandardMaterial({
        roughness: 1,
        flatShading: true,
        vertexColors: true,
      });
      const surface = this.roadSurfaceTexture();
      if (surface) material.map = surface;
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      mesh.receiveShadow = true;
      mesh.userData.road = true;
      this.scene.add(mesh);
      this.roadSurfaceMesh = mesh;
    }
    return this.roadSurfaceMesh;
  }
  rebuildRoadSurface() {
    this.roadsDirty = false;
    const mesh = this.ensureRoadSurface();
    if (!mesh) return false;
    const tiles = [...(this.roadTiles?.values() || [])];
    const next = buildRoadSurfaceGeometry(tiles);
    mesh.geometry.dispose();
    mesh.geometry = next;
    mesh.visible = tiles.length > 0;
    return true;
  }
  async load() {
    try {
      const loader = new GLTFLoader();
      const modelKeys = [
        "tree",
        "rock",
        "house",
        "well",
        "farm",
        "bakery",
        "inn",
        "storehouse",
        "grainfield_sown",
        "grainfield_sprout",
        "grainfield_growing",
        "grainfield_ripe",
        "lumberyard",
        "mine",
        "windmill",
        "watchtower",
        "school",
        "vineyard",
        "townhall",
        "worker",
      ];
      const loadedModels = await Promise.all(
        modelKeys.map(async (key) => {
          try {
            return [key, await loader.loadAsync(`/models/${key}.glb`)];
          } catch (error) {
            // Keep one missing optional asset from blanking the entire village.
            // modelTemplate() supplies a lightweight placeholder when this key
            // is requested by the scene or palette.
            console.warn(`Could not load ${key} model; using a fallback.`, error);
            return [key, null];
          }
        }),
      );
      for (const [key, gltf] of loadedModels) {
        if (!gltf) continue;
        this.models[key] = gltf.scene;
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
      }
      if (this.dead) {
        // A component can unmount while the parallel GLB requests are still
        // in flight. These roots never reached the scene, so the normal scene
        // disposal pass cannot see their shared GPU resources.
        this.disposeLoadedModelResources();
        return;
      }
      this.name = sanitizeVillageName(this.saved?.name);
      const savedActivity = Array.isArray(this.saved?.activityLog)
        ? this.saved.activityLog
            .filter((message) => typeof message === "string")
            .slice(0, 4)
        : [];
      this.activityLog = savedActivity.map((message) => ({
        id: this.nextActivityId++,
        message: message.slice(0, 140),
      }));
      const savedBuildingRecords = Array.isArray(this.saved?.buildings)
        ? this.saved.buildings.filter(
            (b) =>
              b &&
              (b.type === "townhall" ||
                (CATALOG[b.type] && b.type !== "road")) &&
              Number.isFinite(Number(b.x)) &&
              Number.isFinite(Number(b.z)),
          )
        : [];
      const hasStoredVillage = Array.isArray(this.saved?.buildings);
      if (hasStoredVillage) {
        const savedResources = this.saved.resources;
        if (savedResources && typeof savedResources === "object")
          for (const key of Object.keys(this.resources))
            this.resources[key] = Math.max(
              0,
              finiteNumber(savedResources[key], this.resources[key]),
            );
        this.elapsed = Math.max(0, finiteNumber(this.saved.elapsed, 0));
        this.gathered = Math.max(0, finiteNumber(this.saved.gathered, 0));
        if (this.saved.delivered && typeof this.saved.delivered === "object")
          for (const key of Object.keys(this.delivered))
            this.delivered[key] = Math.max(0, finiteNumber(this.saved.delivered[key], 0));
        this.chapterRewards =
          this.saved.chapterRewards && typeof this.saved.chapterRewards === "object"
            ? { ...this.saved.chapterRewards }
            : {};
        this.tutorialStep = Math.max(0, Math.floor(finiteNumber(this.saved.tutorialStep, 0)));
        this.tutorialDismissed = true;
        this.feast =
          this.saved.feast && finiteNumber(this.saved.feast.remaining, 0) > 0
            ? { remaining: finiteNumber(this.saved.feast.remaining, 0) }
            : null;
        this.created = normalizedCountRecord(this.saved.created);
        const savedTownhall = savedBuildingRecords.find(
              (building) =>
                building.type === "townhall" && savedBuildingFits(building),
        );
        const restoreRecords = savedTownhall
          ? [
              savedTownhall,
              ...savedBuildingRecords.filter(
                (building) =>
                  building !== savedTownhall && building.type !== "grainfield",
              ),
              ...savedBuildingRecords.filter(
                (building) => building.type === "grainfield",
              ),
            ]
          : [];
        for (const b of restoreRecords) {
          const rotation = finiteNumber(b.rotation, 0);
          const progress = normalizedBuildingProgress(b.type, b.progress);
          const cycles = Math.max(0, Math.floor(finiteNumber(b.cycles, 0)));
          if (!savedBuildingFits(b, this.buildings)) continue;
          if (
            b.type === "grainfield" &&
            !this.grainFieldConnected(Number(b.x), Number(b.z))
          )
            continue;
          this.addBuilding(
            b.type,
            Number(b.x),
            Number(b.z),
            rotation,
            progress,
            cycles,
            b.upgrade,
            b.materials,
            b.plantedAt,
            b.breadStock,
            b.training,
            b.stock,
          );
        }
        this.ensureStarterVillage();
        this.clampResourcesToStorage();
        const savedRoads = Array.isArray(this.saved.roads)
          ? this.saved.roads
          : [];
        const roadBoundary = buildBoundaryFor(this.buildings);
        const restoredRoads = new Set();
        for (const key of savedRoads) {
          if (typeof key !== "string") continue;
          const [x, z] = key.split(",").map(Number);
          if (!Number.isInteger(x) || !Number.isInteger(z)) continue;
          if (this.baseRoads.has(key)) continue;
          if (
            x - 0.5 < -roadBoundary ||
            z - 0.5 < -roadBoundary ||
            z + 0.5 > roadBoundary ||
            x + 0.5 > riverX(z) - 0.7 ||
            this.blocked(x, z, 0.4)
          )
            continue;
          this.addRoad(x, z, false);
          restoredRoads.add(key);
        }
        this.created = reconcileRoadCount(this.created, restoredRoads, this.baseRoads);
      } else {
        this.ensureStarterVillage();
      }
      const savedTrees = new Map(
        (Array.isArray(this.saved?.trees) ? this.saved.trees : [])
          .filter((tree) => tree && Number.isFinite(Number(tree.x)) && Number.isFinite(Number(tree.z)))
          .map((tree) => [sceneryKey(tree.x, tree.z), tree]),
      );
      this.clearedScenery = new Set(
        (Array.isArray(this.saved?.clearedScenery) ? this.saved.clearedScenery : [])
          .filter((key) => typeof key === "string")
          .map((key) => {
            const [x, z] = key.split(",").map(Number);
            return Number.isFinite(x) && Number.isFinite(z) ? sceneryKey(x, z) : null;
          })
          .filter(Boolean),
      );
      for (const candidate of sceneryCandidates()) {
        const { x, z, type } = candidate;
        const candidateKey = sceneryKey(x, z);
        if (this.clearedScenery.has(candidateKey)) continue;
        if (
          (x > riverX(z) - 1 && x < riverX(z) + 9) ||
          isRiverBridgeClearance(x, z)
        )
          continue;
        if (
          this.buildings.some(
            (b) =>
              Math.hypot(x - b.x, z - b.z) <
              (CATALOG[b.type]?.size || 4) / 2 + 2.2,
          ) ||
          this.roads.has(`${Math.round(x)},${Math.round(z)}`) ||
          !isInStarterSettlementClearing(x, z, type)
        )
          continue;
        const m = this.model(type, x, z);
        const s = candidate.scale;
        m.scale.setScalar(s);
        m.rotation.y = candidate.rotationY;
        const tree = type === "tree";
        const treeMeshes = [];
        if (tree) {
          m.traverse((part) => {
            if (part.isMesh) treeMeshes.push(part);
          });
          m.userData.baseZ = 0;
          m.userData.phase = candidate.phase;
          m.userData.speed = candidate.speed;
          m.userData.amount = candidate.amount;
          this.swayers.push(m);
        }
        const savedTree = tree
          ? savedTrees.get(candidateKey)
          : null;
        this.decor.push({
          m,
          x,
          z,
          r: tree ? 0.5 * s : 0.6 * s,
          type,
          sceneryKey: candidateKey,
          state: tree ? savedTree?.state || "available" : null,
          claimedBy: null,
          regrowAt: tree ? finiteNumber(savedTree?.regrowAt, null) : null,
          baseScale: s,
          baseRotation: m.rotation.z,
          trunkMeshes: tree
            ? treeMeshes.filter((part) => /trunk|stump|wood/i.test(part.name))
            : [],
          canopyMeshes: tree
            ? treeMeshes.filter((part) => /pine|leaf|canopy|foliage|crown/i.test(part.name))
            : [],
        });
        const placedTree = this.decor[this.decor.length - 1];
        if (tree && !placedTree.trunkMeshes.length && treeMeshes.length) {
          placedTree.trunkMeshes = [treeMeshes[0]];
        }
        if (tree && !placedTree.canopyMeshes.length && treeMeshes.length > 1) {
          placedTree.canopyMeshes = treeMeshes.slice(1);
        }
        if (tree) this.updateTreeVisual(this.decor[this.decor.length - 1]);
      }
      const grass = [];
      for (const blade of grassCandidates()) {
        const { x, z } = blade;
        if (x > riverX(z) - 0.5) continue;
        if (
          this.blocked(x, z, 0) ||
          this.roads.has(`${Math.round(x)},${Math.round(z)}`)
        )
          continue;
        grass.push(blade);
      }
      this.buildGrassField(grass);
      for (const rock of bankRockCandidates()) {
        const m = this.model("rock", rock.x, rock.z);
        m.scale.setScalar(rock.scale);
      }
      const population = restoredPopulation(
        this.saved?.population,
        housingCapacity(this.buildings),
      );
      for (let i = 0; i < population; i++)
        this.addWorker();
      const savedWorkerNeeds = Array.isArray(this.saved?.workerNeeds)
        ? this.saved.workerNeeds
        : [];
      this.workers.forEach((worker, index) => {
        worker.hunger = Math.max(
          0,
          Math.min(1, finiteNumber(savedWorkerNeeds[index]?.hunger, worker.hunger)),
        );
        const trained = savedWorkerNeeds[index]?.trained;
        if (TRAINABLE_WORKER_TYPES.includes(trained)) {
          worker.trainedType = trained;
          this.setWorkerType(worker, trained);
        }
      });
      this.lastSave = saveCycleMarker(this.elapsed);
      this.trendSample = { elapsed: this.elapsed, resources: { ...this.resources } };
      this.ready = true;
      this.onLoaded(this.thumbnails, undefined, "interactive");
      this.emit();
      const startThumbnails = () => {
        this.thumbnailTask = null;
        this.thumbnailTaskKind = null;
        this.makeThumbnails()
          .then((completed) => {
            if (!completed || this.dead) return;
            this.onLoaded(this.thumbnails, undefined, "thumbnails");
            this.emit();
          })
          .catch((error) => {
            this.thumbnailRenderer?.dispose();
            this.thumbnailRenderer = null;
            if (!this.dead) console.error("Could not finish village thumbnails.", error);
          });
      };
      if (window.requestIdleCallback) {
        this.thumbnailTaskKind = "idle";
        this.thumbnailTask = window.requestIdleCallback(startThumbnails, { timeout: 1800 });
      } else {
        this.thumbnailTaskKind = "timeout";
        this.thumbnailTask = window.setTimeout(startThumbnails, 100);
      }
    } catch (e) {
      if (this.dead) return;
      console.error(e);
      this.notify("Could not load the village. Please refresh to try again.");
      this.onLoaded({}, String(e));
    }
  }
  disposeLoadedModelResources() {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    for (const model of Object.values(this.models || {})) {
      model?.traverse?.((object) => {
        if (!(object.isMesh || object.isLine || object.isPoints)) return;
        if (object.geometry) geometries.add(object.geometry);
        const list = Array.isArray(object.material)
          ? object.material
          : [object.material];
        list.filter(Boolean).forEach((material) => {
          materials.add(material);
          Object.values(material).forEach((value) => {
            if (value?.isTexture) textures.add(value);
          });
        });
      });
    }
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    this.models = {};
  }
  modelTemplate(type) {
    if (!this.models[type]) this.models[type] = this.makeDecorationModel(type);
    return this.models[type];
  }
  model(type, x = 0, z = 0) {
    const templateType = type === "grainfield" ? "grainfield_sown" : type;
    const m = this.modelTemplate(templateType).clone(true);
    m.position.set(x, 0, z);
    this.scene.add(m);
    return m;
  }
  makeDecorationModel(type) {
    const group = new THREE.Group();
    const part = (geometry, color, x, y, z) => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true }),
      );
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    // Keep a simple placeholder for any type without a loaded GLB.
    part(new THREE.BoxGeometry(0.1, 0.9, 0.1), "#76502e", 0, 0.45, 0);
    part(new THREE.BoxGeometry(0.72, 0.42, 0.08), "#b47d49", 0, 0.78, 0);
    return group;
  }
  restoreView() {
    const view = sanitizeCameraView(this.saved?.view);
    if (!view) return;
    this.camera.position.fromArray(view.position);
    this.controls.target.fromArray(view.target);
    this.camera.zoom = view.zoom;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  viewRecord() {
    if (!this.camera?.position || !this.controls?.target) return undefined;
    return sanitizeCameraView({
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      zoom: this.camera.zoom,
    });
  }
  waitForThumbnailSlice() {
    return new Promise((resolve) => {
      if (this.dead) {
        resolve(false);
        return;
      }
      this.thumbnailWaitResolve = resolve;
      const resume = () => {
        this.thumbnailWaitResolve = null;
        this.thumbnailTask = null;
        this.thumbnailTaskKind = null;
        resolve(!this.dead);
      };
      if (window.requestIdleCallback) {
        this.thumbnailTaskKind = "idle";
        this.thumbnailTask = window.requestIdleCallback(resume, { timeout: 1800 });
      } else {
        this.thumbnailTaskKind = "timeout";
        this.thumbnailTask = window.setTimeout(resume, 16);
      }
    });
  }
  async makeThumbnails() {
    const r = new THREE.WebGLRenderer({
      antialias: this.graphicsPreset !== "low",
      alpha: true,
    });
    this.thumbnailRenderer = r;
    r.setSize(160, 130);
    r.setPixelRatio(1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.3;
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight("#fff4de", "#67794d", 1.4));
    const l = new THREE.DirectionalLight("#fff2d1", 2.3);
    l.position.set(-4, 7, 5);
    s.add(l);
    const c = new THREE.OrthographicCamera(-3, 3, 2.45, -2.45, 0.1, 50);
    // The probe only decides whether a model touches the frame edge. Keep the
    // displayed thumbnail at 160×130, but inspect a half-resolution buffer so
    // framing never monopolizes the main thread during the idle thumbnail pass.
    const probeWidth = 80;
    const probeHeight = 65;
    const thumbnailProbe = document.createElement("canvas");
    thumbnailProbe.width = probeWidth;
    thumbnailProbe.height = probeHeight;
    // Thumbnail framing samples rendered pixels several times per model while
    // it finds a scale that fits. Tell the browser this canvas is readback
    // heavy so repeated getImageData calls stay on the fast path.
    const probeContext = thumbnailProbe.getContext("2d", {
      willReadFrequently: true,
    });
    const thumbnailTouchesEdge = (source) => {
      if (!probeContext) return false;
      probeContext.clearRect(0, 0, probeWidth, probeHeight);
      probeContext.drawImage(source, 0, 0, probeWidth, probeHeight);
      const pixels = probeContext.getImageData(0, 0, probeWidth, probeHeight).data;
      const opaque = (x, y) => pixels[(y * probeWidth + x) * 4 + 3] > 8;
      for (let x = 0; x < probeWidth; x++) {
        if (opaque(x, 0) || opaque(x, 1)) return true;
        if (opaque(x, probeHeight - 2) || opaque(x, probeHeight - 1)) return true;
      }
      for (let y = 2; y < probeHeight - 2; y++) {
        if (opaque(0, y) || opaque(1, y)) return true;
        if (opaque(probeWidth - 2, y) || opaque(probeWidth - 1, y)) return true;
      }
      return false;
    };
    const renderThumbnail = (model) => {
      model.updateMatrixWorld(true);
      c.position.set(5, 5, 7);
      c.lookAt(0, 1.25, 0);
      c.updateMatrixWorld(true);
      let scale = 1;
      for (let attempt = 0; attempt < 6; attempt++) {
        c.left = -3 * scale;
        c.right = 3 * scale;
        c.top = 2.45 * scale;
        c.bottom = -2.45 * scale;
        c.updateProjectionMatrix();
        r.render(s, c);
        if (!thumbnailTouchesEdge(r.domElement)) break;
        scale *= 1.14;
      }
    };
    const keys = Object.keys(CATALOG);
    for (const [index, key] of keys.entries()) {
      if (this.dead) {
        r.dispose();
        this.thumbnailRenderer = null;
        return false;
      }
      const m =
        key === "road"
          ? new THREE.Mesh(
              applyRoadUvs(new THREE.BoxGeometry(3, 0.12, 1.5), 0, 0),
              new THREE.MeshStandardMaterial({
                color: "#f4f2ea",
                roughness: 1,
                map: this.roadSurfaceTexture() || null,
              }),
            )
          : this.modelTemplate(
              key === "grainfield" ? "grainfield_ripe" : key,
            ).clone(true);
      s.add(m);
      try {
        renderThumbnail(m);
        this.thumbnails[key] = r.domElement.toDataURL();
        this.onLoaded({ ...this.thumbnails }, undefined, "thumbnails");
        this.emit();
      } finally {
        s.remove(m);
        // The road preview is the only thumbnail mesh created from fresh GPU
        // resources. GLB previews share their model resources with the village,
        // so only release this temporary geometry and material here.
        if (key === "road") {
          m.geometry.dispose();
          m.material.dispose();
        }
      }
      if (index < keys.length - 1 && !(await this.waitForThumbnailSlice())) {
        r.dispose();
        this.thumbnailRenderer = null;
        return false;
      }
    }
    r.dispose();
    this.thumbnailRenderer = null;
    return true;
  }
  addBuilding(
    type,
    x,
    z,
    rotation = 0,
    progress = 1,
    cycles = 0,
    upgrade = null,
    materials = null,
    plantedAt = null,
    breadStock = 0,
    training = null,
    stock = 0,
  ) {
    const m = this.model(type, x, z);
    m.rotation.y = rotation;
    const b = {
      id:
        globalThis.crypto?.randomUUID?.() ||
        `building-${this.nextBuildingId++}`,
      type,
      x,
      z,
      rotation,
      progress,
      m,
      sails: type === "windmill" ? m.getObjectByName?.("Sails") || null : null,
      cycles: Math.max(0, Math.floor(finiteNumber(cycles, 0))),
      upgrade: upgrade ? String(upgrade) : null,
      materials: normalizedConstructionMaterials(type, materials, progress),
      plantedAt:
        type === "grainfield"
          ? Math.min(
              this.elapsed,
              Math.max(0, finiteNumber(plantedAt, this.elapsed)),
            )
          : null,
      fieldStage: type === "grainfield" ? "sown" : null,
      claimedBy: null,
      breadStock:
        type === "inn"
          ? Math.max(0, Math.floor(finiteNumber(breadStock, 0)))
          : 0,
      // Finished goods wait in the building that made them until a carrier
      // hauls them to a store. Production stalls once this reaches outputCap.
      stock: Math.max(0, Math.min(savedStockLimit(type), Math.floor(finiteNumber(stock, 0)))),
      training: normalizedTrainingSession(type, training),
      pop: 0,
    };
    m.userData.building = b;
    this.buildings.push(b);
    if (type === "grainfield") {
      this.updateGrainFieldVisual(b, true);
      return b;
    }
    this.buildingPickTargets ||= [];
    this.pickTargets ||= [];
    this.buildingPickTargets.push(m);
    this.pickTargets.push(m);
    if (progress < 1) {
      const ready = constructionMaterialsReady(b);
      m.visible = ready;
      m.scale.set(1, ready ? 0.1 + progress * 0.9 : 0.1, 1);
      this.scaffold(b);
    } else {
      if (type === "house" || type === "townhall") this.addSmoke(b);
      if (type === "house" || type === "townhall" || type === "well")
        this.addLanterns(b);
    }
    return b;
  }
  farmTouchesGrainField(farm, x, z) {
    if (!farm || farm.type !== "farm" || farm.progress < 1) return false;
    const farmSize = CATALOG.farm?.size || 4;
    const half = farmSize / 2;
    const isHalfInt = Math.abs(farm.x % 1) === 0.5 || Math.abs(farm.z % 1) === 0.5;
    if (isHalfInt) {
      const edge = half + 0.5;
      const dx = Math.abs(Number(x) - farm.x);
      const dz = Math.abs(Number(z) - farm.z);
      return (
        (Math.abs(dx - edge) < 0.01 && dz <= half) ||
        (Math.abs(dz - edge) < 0.01 && dx <= half)
      );
    }
    const edge = Math.ceil(half) + 1;
    const dx = Math.abs(Math.round(x) - Math.round(farm.x));
    const dz = Math.abs(Math.round(z) - Math.round(farm.z));
    return (dx === edge && dz <= Math.ceil(half)) || (dz === edge && dx <= Math.ceil(half));
  }
  grainFieldConnected(x, z, extraFields = EMPTY_GRAIN_FIELDS) {
    if (
      this.buildings.some((building) =>
        this.farmTouchesGrainField(building, x, z),
      )
    )
      return true;
    const adjacent = [
      `${x + 1},${z}`,
      `${x - 1},${z}`,
      `${x},${z + 1}`,
      `${x},${z - 1}`,
    ];
    return adjacent.some(
      (key) =>
        extraFields.has(key) ||
        this.buildings.some(
          (building) =>
            building.type === "grainfield" &&
            `${building.x},${building.z}` === key,
        ),
    );
  }
  grainFieldsForFarm(farm) {
    if (!farm || farm.type !== "farm" || farm.progress < 1) return [];
    const fields = [];
    const fieldByKey = new Map();
    for (const building of this.buildings) {
      if (building.type !== "grainfield") continue;
      fields.push(building);
      fieldByKey.set(`${building.x},${building.z}`, building);
    }
    const connected = [];
    const visited = new Set();
    const queue = fields.filter((field) =>
      this.farmTouchesGrainField(farm, field.x, field.z),
    );
    for (let index = 0; index < queue.length; index++) {
      const field = queue[index];
      const key = `${field.x},${field.z}`;
      if (visited.has(key)) continue;
      visited.add(key);
      connected.push(field);
      for (const [dx, dz] of ROUTE_DIRECTIONS) {
        const candidate = fieldByKey.get(`${field.x + dx},${field.z + dz}`);
        if (candidate && !visited.has(`${candidate.x},${candidate.z}`))
          queue.push(candidate);
      }
    }
    return connected;
  }
  readyGrainFields(farm) {
    return this.grainFieldsForFarm(farm).filter(
      (field) =>
        grainGrowthStage(field.plantedAt, this.elapsed) === "ripe" &&
        !field.claimedBy,
    );
  }
  updateGrainFieldVisual(field, force = false) {
    if (!field || field.type !== "grainfield") return;
    const stage = grainGrowthStage(field.plantedAt, this.elapsed);
    if (!force && field.fieldStage === stage) return;
    const previous = field.m;
    const next = this.model(`grainfield_${stage}`, field.x, field.z);
    next.rotation.y = field.rotation || 0;
    next.userData.building = field;
    field.m = next;
    field.fieldStage = stage;
    if (previous) this.scene.remove(previous);
    this.removePickTarget(previous);
    this.buildingPickTargets ||= [];
    this.pickTargets ||= [];
    this.buildingPickTargets.push(next);
    this.pickTargets.push(next);
  }
  updateGrainFields() {
    const elapsed = finiteNumber(this.elapsed, 0);
    const lastUpdate = this.lastGrainFieldUpdate;
    if (
      Number.isFinite(lastUpdate) &&
      elapsed >= lastUpdate &&
      elapsed - lastUpdate < GRAIN_VISUAL_UPDATE_INTERVAL
    )
      return false;
    this.lastGrainFieldUpdate = elapsed;
    let updated = false;
    for (const field of this.buildings) {
      if (field.type !== "grainfield") continue;
      const previousStage = field.fieldStage;
      this.updateGrainFieldVisual(field);
      updated ||= previousStage !== field.fieldStage;
    }
    return updated;
  }
  treeGrowthProgress(tree) {
    if (!tree || tree.type !== "tree") return 1;
    if (tree.state === "available") return 1;
    if (tree.state === "chopping")
      return Math.max(0.15, 1 - (tree.chopProgress || 0) * 0.08);
    return treeRegrowthProgress(tree.regrowAt, this.elapsed);
  }
  updateTreeVisual(tree) {
    if (!tree?.m || tree.type !== "tree") return;
    const elapsed = finiteNumber(this.elapsed, 0);
    const stateChanged = tree.visualState !== tree.state;
    if (!stateChanged && tree.state === "available") return false;
    if (
      !stateChanged &&
      tree.visualElapsed != null &&
      elapsed - tree.visualElapsed < TREE_VISUAL_UPDATE_INTERVAL
    )
      return false;
    const progress = this.treeGrowthProgress(tree);
    const isIntact = tree.state === "available" || tree.state === "chopping";
    const stage = isIntact ? "full" : treeGrowthStage(progress);
    const height = isIntact ? 1 : stage === "stump" ? 0.24 : 0.24 + progress * 0.76;
    for (const part of tree.trunkMeshes || []) part.visible = true;
    for (const part of tree.canopyMeshes || []) part.visible = stage !== "stump";
    tree.m.visible = true;
    tree.m.scale.set(
      tree.baseScale || 1,
      (tree.baseScale || 1) * height,
      tree.baseScale || 1,
    );
    tree.m.position.y = 0;
    tree.m.userData.growthStage = stage;
    tree.visualState = tree.state;
    tree.visualElapsed = elapsed;
    return true;
  }
  updateTrees() {
    for (const tree of this.decor || []) {
      if (tree.type !== "tree") continue;
      // An available tree is visually stable. Only revisit it once if a
      // headless/legacy record has not yet received its initial visual state.
      if (tree.state === "available" && tree.visualState === tree.state) continue;
      if (tree.state === "regrowing" && this.elapsed >= tree.regrowAt) {
        tree.state = "available";
        tree.regrowAt = null;
        tree.chopProgress = 0;
        tree.claimedBy = null;
        this.announce("A felled tree has grown back in the forest.");
      }
      this.updateTreeVisual(tree);
    }
  }
  availableTreeFor(lumberyard, worker) {
    if (!lumberyard || !worker?.m?.position) return null;
    let best = null;
    let bestWorkerDistance = Infinity;
    let bestLumberyardDistance = Infinity;
    for (const tree of this.decor || []) {
      if (tree.type !== "tree" || tree.state !== "available" || tree.claimedBy)
        continue;
      const workerDistance = Math.hypot(
        worker.m.position.x - tree.x,
        worker.m.position.z - tree.z,
      );
      const lumberyardDistance = Math.hypot(
        lumberyard.x - tree.x,
        lumberyard.z - tree.z,
      );
      if (
        workerDistance < bestWorkerDistance ||
        (workerDistance === bestWorkerDistance &&
          lumberyardDistance < bestLumberyardDistance)
      ) {
        best = tree;
        bestWorkerDistance = workerDistance;
        bestLumberyardDistance = lumberyardDistance;
      }
    }
    return best;
  }
  finishChopping(tree) {
    if (!tree || tree.type !== "tree") return;
    tree.state = "regrowing";
    tree.claimedBy = null;
    tree.chopProgress = 0;
    tree.regrowAt = this.elapsed + TREE_REGROW_SECONDS;
    this.updateTreeVisual(tree);
  }
  releaseTree(tree) {
    if (!tree || tree.type !== "tree") return;
    tree.state = "available";
    tree.claimedBy = null;
    tree.chopProgress = 0;
    tree.regrowAt = null;
    this.updateTreeVisual(tree);
  }
  addSmoke(b) {
    if (b.smoke || !this.scene?.add) return;
    const group = new THREE.Group();
    const particles = [];
    const chimneyHeight = b.type === "townhall" ? 3.25 : 2.65;
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 + i * 0.025, 6, 5),
        new THREE.MeshBasicMaterial({
          color: "#f4eddc",
          transparent: true,
          opacity: 0.17,
          depthWrite: false,
        }),
      );
      p.position.set(0.13, chimneyHeight + i * 0.22, 0.04);
      group.add(p);
      particles.push(p);
    }
    group.position.set(b.x, 0, b.z);
    this.scene.add(group);
    b.smoke = { group, particles, phase: rand() * Math.PI * 2 };
  }
  addLanterns(b) {
    if (b.lanterns || !b.m?.add) return;
    const positions =
      b.type === "well"
        ? [
            [0, 1.18, -0.74],
            [0, 1.18, 0.74],
          ]
        : b.type === "townhall"
          ? [
              [0.75, 1.42, -1.68],
              [-0.75, 1.42, 1.68],
            ]
          : [
              [0.32, 0.95, -1.34],
              [-0.32, 0.95, 1.34],
            ];
    const group = new THREE.Group();
    // No PointLight here: the shared pool in `syncLanternLights` lights whichever
    // lamps are nearest the camera, so adding a cottage can never add a light.
    const lamps = positions.map(([x, y, z]) => {
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 8, 6),
        new THREE.MeshBasicMaterial({
          color: "#ffd07b",
          transparent: true,
          opacity: 0.04,
          depthWrite: false,
        }),
      );
      glow.position.set(x, y, z);
      group.add(glow);
      return { glow, phase: rand() * Math.PI * 2 };
    });
    b.m.add(group);
    b.lanterns = { group, lamps };
    this.syncLanternLightPool();
  }
  lanternLamps() {
    const lamps = [];
    for (const building of this.buildings)
      if (building.lanterns) lamps.push(...building.lanterns.lamps);
    return lamps;
  }
  // Keeps the pool at exactly `min(budget, lamps)` lights. Growing or shrinking
  // it recompiles materials, so it only ever runs when a village gains its first
  // few lanterns or the player changes the graphics preset.
  syncLanternLightPool() {
    if (typeof this.scene?.add !== "function") return 0;
    this.lanternLights ||= [];
    const target = Math.min(
      lanternLightBudget(this.graphicsPreset),
      this.lanternLamps().length,
    );
    while (this.lanternLights.length > target) {
      const light = this.lanternLights.pop();
      this.scene.remove(light);
      light.dispose?.();
    }
    while (this.lanternLights.length < target) {
      const light = new THREE.PointLight("#ffc56e", 0, 4.5, 2);
      this.scene.add(light);
      this.lanternLights.push(light);
    }
    return this.lanternLights.length;
  }
  updateLanternLights(time, motion = 1, dt = 0) {
    const lights = this.lanternLights || [];
    if (!lights.length) return;
    this.lanternReaim = (this.lanternReaim || 0) - dt;
    if (this.lanternReaim <= 0) {
      this.aimLanternLights();
      this.lanternReaim = LANTERN_REAIM_SECONDS;
    }
    const glow = this.atmosphere?.nightAmount || 0;
    for (const light of lights) {
      const phase = light.userData.lamp?.phase || 0;
      const flicker = 0.98 + motion * Math.sin(time * 5.5 + phase) * 0.08;
      light.intensity = (0.025 + glow * 1.35) * flicker;
    }
  }
  // Aims the pool at the lamps closest to whatever the camera is looking at, and
  // returns the chosen lamps so the caller can drive their flicker.
  aimLanternLights(lamps = this.lanternLamps()) {
    const lights = this.lanternLights || [];
    if (!lights.length) return [];
    const focus = this.controls?.target || this.camera?.position;
    // Re-aiming is deliberately infrequent, but it still runs throughout a
    // long session. Reuse the scratch point so each pass does not add another
    // short-lived allocation to the renderer's garbage-collection workload.
    const anchor = (this.lanternAnchor ||= new THREE.Vector3());
    const ranked = lamps
      .map((lamp) => {
        lamp.glow.getWorldPosition(anchor);
        return {
          lamp,
          x: anchor.x,
          y: anchor.y,
          z: anchor.z,
          distance: focus
            ? Math.hypot(anchor.x - focus.x, anchor.z - focus.z)
            : 0,
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, lights.length);
    ranked.forEach((entry, index) => {
      lights[index].position.set(entry.x, entry.y, entry.z);
      lights[index].userData.lamp = entry.lamp;
    });
    return ranked.map((entry) => entry.lamp);
  }
  addBirds() {
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const makeWing = () =>
        new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.025, 0.07),
          new THREE.MeshBasicMaterial({
            color: "#4c5b45",
            transparent: true,
            opacity: 0.68,
            depthWrite: false,
          }),
        );
      const left = makeWing();
      const right = makeWing();
      left.position.x = -0.16;
      right.position.x = 0.16;
      group.add(left, right);
      const centerX = -12 + i * 8;
      const centerZ = -7 + (i % 2) * 10;
      group.position.set(centerX, 4.6 + rand() * 1.4, centerZ);
      this.scene.add(group);
      this.birds.push({
        group,
        left,
        right,
        centerX,
        centerZ,
        baseY: group.position.y,
        phase: rand() * Math.PI * 2,
        speed: 0.16 + rand() * 0.08,
      });
    }
  }
  scaffold(b) {
    b.scaffolding = new THREE.Group();
    const n = (CATALOG[b.type]?.size || 3) / 2;
    const mat = new THREE.MeshStandardMaterial({
      color: "#a77945",
      transparent: true,
      opacity: 0.82,
      roughness: 0.9,
    });
    for (const [x, z] of [
      [-n, -n], [0, -n], [n, -n],
      [-n, n], [0, n], [n, n],
      [-n, 0], [n, 0],
    ]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.9, 0.13), mat);
      post.position.set(x, 0.45, z);
      b.scaffolding.add(post);
    }
    for (const edge of [-n, n]) {
      for (const y of [0.3, 0.67]) {
        const horizontal = new THREE.Mesh(
          new THREE.BoxGeometry(n * 2, 0.1, 0.12),
          mat,
        );
        horizontal.position.set(0, y, edge);
        b.scaffolding.add(horizontal);
        const vertical = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.1, n * 2),
          mat,
        );
        vertical.position.set(edge, y, 0);
        b.scaffolding.add(vertical);
      }
    }
    b.materialPiles = new THREE.Group();
    const pileSlots = Math.max(4, Math.min(8, Math.ceil(n * 2)));
    for (let i = 0; i < pileSlots; i++) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.72, 8),
        new THREE.MeshStandardMaterial({
          color: this.carryColor("wood"),
          roughness: 0.88,
          flatShading: true,
        }),
      );
      log.rotation.z = Math.PI / 2;
      log.position.set(
        -n * 0.36,
        0.14 + Math.floor(i / 3) * 0.18,
        -0.42 + (i % 3) * 0.3,
      );
      log.userData.materialResource = "wood";
      log.userData.materialIndex = i;
      b.materialPiles.add(log);
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.16, 0),
        new THREE.MeshStandardMaterial({
          color: this.carryColor("stone"),
          roughness: 0.9,
          flatShading: true,
        }),
      );
      stone.position.set(
        n * 0.34 + (i % 2) * 0.2,
        0.13 + Math.floor(i / 4) * 0.2,
        -0.35 + (i % 4) * 0.23,
      );
      stone.rotation.y = i * 0.7;
      stone.userData.materialResource = "stone";
      stone.userData.materialIndex = i;
      b.materialPiles.add(stone);
    }
    b.scaffolding.add(b.materialPiles);
    this.updateSiteMaterials(b);
    b.scaffolding.position.set(b.x, 0, b.z);
    this.scene.add(b.scaffolding);
    b.siteRing = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.45, n - 0.14), n - 0.03, 32),
      new THREE.MeshBasicMaterial({
        color: "#f1d78b",
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    b.siteRing.rotation.x = -Math.PI / 2;
    b.siteRing.position.set(b.x, 0.035, b.z);
    b.siteRing.userData.phase = rand() * Math.PI * 2;
    this.scene.add(b.siteRing);
  }
  updateSiteMaterials(b) {
    if (!b?.materialPiles) return;
    const cost = CATALOG[b.type]?.cost || {};
    const totals = {};
    for (const resource of ["wood", "stone"]) {
      const required = cost[resource] || 0;
      const delivered = Math.min(
        required,
        finiteNumber(b.materials?.[resource], 0),
      );
      totals[resource] = required ? delivered / required : 0;
    }
    const slots = {};
    b.materialPiles.children.forEach((item) => {
      const resource = item.userData.materialResource;
      slots[resource] = Math.max(
        slots[resource] || 0,
        item.userData.materialIndex + 1,
      );
    });
    b.materialPiles.children.forEach((item) => {
      const resource = item.userData.materialResource;
      item.visible =
        item.userData.materialIndex <
        Math.ceil((slots[resource] || 0) * totals[resource]);
    });
  }
  blocked(x, z, padding = 0.2) {
    return this.buildings.some(
      (b) =>
        Math.abs(x - b.x) < (CATALOG[b.type]?.size || 4) / 2 + padding &&
        Math.abs(z - b.z) < (CATALOG[b.type]?.size || 4) / 2 + padding,
    );
  }
  routeBlocked(x, z, ignore = null, ignoreDecor = null) {
    if (
      this.buildings.some(
        (building) =>
          building !== ignore &&
          building.type !== "grainfield" &&
          Math.abs(x - building.x) <
            (CATALOG[building.type]?.size || 4) / 2 + 0.1 &&
          Math.abs(z - building.z) <
            (CATALOG[building.type]?.size || 4) / 2 + 0.1,
      )
    )
      return true;
    return Boolean(
      this.decor?.some(
        (decor) =>
          decor !== ignoreDecor &&
          this.decorBlocksMovement(decor) &&
          Math.abs(x - decor.x) < 0.45 + decor.r &&
          Math.abs(z - decor.z) < 0.45 + decor.r,
      ),
    );
  }
  decorBlocksMovement(decor) {
    return !this.clearedResourceNode(decor);
  }
  buildBoundary() {
    return buildBoundaryFor(this.buildings);
  }
  clearedResourceNode(decor) {
    if (!decor || !decor.type) return false;
    if (decor.type === "tree") return decor.state === "regrowing";
    if (decor.type === "rock")
      return ["mined", "depleted", "cleared", "regrowing"].includes(
        decor.state,
      );
    return false;
  }
  clearClearedDecorInFootprint(x, z, halfSize) {
    const cleared = this.decor?.filter(
      (decor) =>
        this.clearedResourceNode(decor) &&
        Math.abs(x - decor.x) < halfSize + decor.r &&
        Math.abs(z - decor.z) < halfSize + decor.r,
    ) || [];
    for (const decor of cleared) {
      if (decor.sceneryKey) {
        this.clearedScenery ||= new Set();
        this.clearedScenery.add(decor.sceneryKey);
      }
      // Scenery instances clone cached GLB templates and therefore share their
      // geometry/material resources. Remove the instance now; the shared
      // template resources are released once by disposeSceneResources().
      this.scene?.remove(decor.m);
      const index = this.decor.indexOf(decor);
      if (index >= 0) this.decor.splice(index, 1);
    }
    if (cleared.length) this.swayers = (this.swayers || []).filter((mesh) =>
      cleared.every((decor) => decor.m !== mesh),
    );
    return cleared.length;
  }
  workerPriority(worker) {
    const index = this.workers.indexOf(worker);
    return Number.isFinite(worker?.movementPriority)
      ? worker.movementPriority
      : index < 0
        ? Number.MAX_SAFE_INTEGER
        : index;
  }
  workerPositionBlocked(x, z, ignore = null) {
    return this.workers.some(
      (worker) =>
        worker !== ignore &&
        worker.m?.position &&
        (x - worker.m.position.x) ** 2 +
          (z - worker.m.position.z) ** 2 <
          WORKER_CLEARANCE_SQUARED,
    );
  }
  workerTargetBlocked(x, z, ignore = null) {
    return this.workers.some(
      (worker) =>
        worker !== ignore &&
        worker.path?.length &&
        worker.routeTarget &&
        (x - worker.routeTarget.x) ** 2 +
          (z - worker.routeTarget.z) ** 2 <
          WORKER_CLEARANCE_SQUARED,
    );
  }
  workerCongestion(x, z, ignore = null) {
    let congestion = 0;
    for (const worker of this.workers) {
      if (worker === ignore || !worker.m?.position) continue;
      const dx = x - worker.m.position.x;
      const dz = z - worker.m.position.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared < WORKER_CONGESTION_RADIUS_SQUARED)
        congestion +=
          (WORKER_CONGESTION_RADIUS - Math.sqrt(distanceSquared)) * 0.45;
      const next = worker.path?.[0];
      if (
        next &&
        (x - next.x) ** 2 + (z - next.z) ** 2 < WORKER_NEXT_TARGET_RADIUS_SQUARED
      )
        congestion += 0.55;
    }
    return congestion;
  }
  workerSpawnPosition(preferredX, preferredZ) {
    const candidates = [[preferredX, preferredZ]];
    for (let radius = 1; radius <= 8; radius++) {
      for (let x = -radius; x <= radius; x++) {
        candidates.push([preferredX + x, preferredZ - radius]);
        candidates.push([preferredX + x, preferredZ + radius]);
      }
      for (let z = -radius + 1; z < radius; z++) {
        candidates.push([preferredX - radius, preferredZ + z]);
        candidates.push([preferredX + radius, preferredZ + z]);
      }
    }
    return (
      candidates.find(
        ([x, z]) =>
          !this.routeBlocked(x, z) &&
          !this.workerPositionBlocked(x, z) &&
          x < riverX(z) - 0.5,
      ) || [preferredX, preferredZ]
    );
  }
  overlapsRoad(x, z, halfSize) {
    const tiles = this.roadTiles;
    if (tiles?.size) {
      for (const tile of tiles.values()) {
        if (
          Math.abs(x - tile.x) < halfSize + 0.5 &&
          Math.abs(z - tile.z) < halfSize + 0.5
        )
          return true;
      }
      return false;
    }
    // Keep the fallback for older/headless fixtures that only provide the
    // persisted string set and have not built the runtime tile index yet.
    for (const key of this.roads || []) {
      const separator = key.indexOf(",");
      const roadX = Number(key.slice(0, separator));
      const roadZ = Number(key.slice(separator + 1));
      if (
        Number.isFinite(roadX) &&
        Number.isFinite(roadZ) &&
        Math.abs(x - roadX) < halfSize + 0.5 &&
        Math.abs(z - roadZ) < halfSize + 0.5
      )
        return true;
    }
    return false;
  }
  valid(
    x,
    z,
    type,
    extraGrainFields = EMPTY_GRAIN_FIELDS,
  ) {
    if (type === "road-remove") {
      return this.roads.has(`${x},${z}`) && !this.baseRoads.has(`${x},${z}`)
        ? { ok: true, reason: "Remove this path · 1 stone returned" }
        : { ok: false, reason: "Choose one of your path tiles to remove." };
    }
    const buildingType = type;
    const catalog = CATALOG[buildingType];
    if (!catalog) return { ok: false, reason: "Choose a building tool." };
    const n = catalog.size / 2;
    const boundary = this.buildBoundary();
    if (
      x - n < -boundary ||
      z - n < -boundary ||
      z + n > boundary ||
      x + n > riverX(z) - 0.7
    )
      return {
        ok: false,
        reason: "Choose dry land inside your village boundary.",
      };
    if (this.blocked(x, z, n - 0.1))
      return {
        ok: false,
        reason: "This space is occupied. Find a clear patch of land.",
      };
    if (buildingType !== "road" && this.overlapsRoad(x, z, n))
      return {
        ok: false,
        reason: "A path crosses this site. Choose a clear patch of land.",
      };
    if (
      type !== "road" &&
      this.workers?.some(
        (worker) =>
          worker.m?.position &&
          Math.abs(x - worker.m.position.x) < n + 0.45 &&
          Math.abs(z - worker.m.position.z) < n + 0.45,
      )
    )
      return {
        ok: false,
        reason: "A villager is working here. Choose another clear patch.",
      };
    if (buildingType === "road" && this.roads.has(`${x},${z}`))
      return { ok: false, reason: "There is already a path here." };
    if (
      this.decor.some(
        (d) =>
          this.decorBlocksMovement(d) &&
          Math.abs(x - d.x) < n + d.r &&
          Math.abs(z - d.z) < n + d.r,
      )
    )
      return { ok: false, reason: "Trees or rocks are in the way." };
    if (
      buildingType === "grainfield" &&
      !this.grainFieldConnected(x, z, extraGrainFields)
    )
      return {
        ok: false,
        reason: "Plant beside a completed farmhouse or connected grain field.",
      };
    // Instant items (paths, planted grain) are paid in full up front since
    // they have no construction site to gather materials at. Real buildings
    // may be placed short on resources: the site goes up immediately and
    // workers haul in whatever is missing before construction begins.
    if (
      (catalog.decoration || buildingType === "road") &&
      Object.entries(catalog.cost).some(([r, v]) => this.resourceAmount(r) < v)
    )
      return {
        ok: false,
        reason: `Not enough resources. Need ${Object.entries(catalog.cost)
          .filter(([resource, amount]) => this.resourceAmount(resource) < amount)
          .map(
            ([resource, amount]) =>
              `${Math.max(1, Math.ceil(amount - this.resourceAmount(resource)))} ${resource}`,
          )
          .join(" + ")} before building.`,
      };
    return {
      ok: true,
      reason:
        buildingType === "road"
          ? "Click or drag to lay a path · Esc to cancel"
          : buildingType === "grainfield"
            ? "Click or drag to plant grain · Esc to cancel"
          : "Click to place · R to rotate · Esc to cancel",
    };
  }
  select(type) {
    this.clearGhost();
    this.selected = type;
    this.placement = null;
    this.renderer.domElement.style.cursor = type ? "crosshair" : "";
    this.grid.visible = !!type;
    this.controls.mouseButtons.LEFT = type ? null : THREE.MOUSE.PAN;
    this.controls.touches.ONE = type ? null : THREE.TOUCH.PAN;
    if (type) {
      const buildingType = type;
      const ghostType = buildingType === "grainfield" ? "grainfield_sown" : buildingType;
      this.ghost =
        buildingType === "road" || type === "road-remove"
          ? new THREE.Mesh(
              new THREE.BoxGeometry(1, 0.1, 1),
              new THREE.MeshStandardMaterial({ color: "#a8d580" }),
            )
          : this.modelTemplate(ghostType).clone(true);
      this.ghostGeometryOwned = buildingType === "road" || type === "road-remove";
      this.ghost.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.48;
          o.material.depthWrite = false;
          o.castShadow = false;
        }
      });
      this.scene.add(this.ghost);
      this.ghost.visible = false;
      this.footprint = new THREE.Mesh(
        new THREE.PlaneGeometry(
          buildingType === "road" || type === "road-remove"
            ? 1
            : CATALOG[buildingType].size,
          buildingType === "road" || type === "road-remove"
            ? 1
            : CATALOG[buildingType].size,
        ),
        new THREE.MeshBasicMaterial({
          color: "#8acb7e",
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
        }),
      );
      this.footprint.rotation.x = -Math.PI / 2;
      this.scene.add(this.footprint);
      this.footprint.visible = false;
      this.previewOutline = new THREE.LineSegments(
        new THREE.EdgesGeometry(
          new THREE.BoxGeometry(
            buildingType === "road" || type === "road-remove"
              ? 1
              : CATALOG[buildingType].size,
            0.035,
            buildingType === "road" || type === "road-remove"
              ? 1
              : CATALOG[buildingType].size,
          ),
        ),
        new THREE.LineBasicMaterial({
          color: "#bce18c",
          transparent: true,
          opacity: 0.9,
        }),
      );
      this.previewOutline.position.y = 0.06;
      this.scene.add(this.previewOutline);
      this.previewOutline.visible = false;
      if (buildingType === "watchtower") {
        const currentBoundary = this.buildBoundary();
        this.boundaryPreview = new THREE.Mesh(
          new THREE.RingGeometry(currentBoundary + 2.94, currentBoundary + 3, 64),
          new THREE.MeshBasicMaterial({
            color: "#e9d38f",
            transparent: true,
            opacity: 0.42,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        this.boundaryPreview.rotation.x = -Math.PI / 2;
        this.boundaryPreview.position.y = 0.04;
        this.scene.add(this.boundaryPreview);
      }
      const start = this.findOpenPlacement(type, { x: 0, z: 3 });
      this.updatePlacement(start.x, start.z);
    }
  }
  clearGhost() {
    const ghost = this.ghost;
    for (const m of [ghost, this.footprint, this.previewOutline, this.boundaryPreview])
      if (m) {
        this.scene.remove(m);
        m.traverse((o) => {
          if (!(o.isMesh || o.isLine || o.isPoints) || !o.material) return;
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          materials.filter(Boolean).forEach((material) => material.dispose());
        });
        if (m !== ghost || this.ghostGeometryOwned) m.geometry?.dispose();
      }
    this.ghost = null;
    this.footprint = null;
    this.previewOutline = null;
    this.boundaryPreview = null;
    this.ghostGeometryOwned = false;
  }
  disposeOwnedObject(object) {
    if (!object) return;
    this.scene?.remove(object);
    const geometries = new Set();
    const materials = new Set();
    object.traverse?.((child) => {
      if (!child.isMesh) return;
      if (child.geometry) geometries.add(child.geometry);
      const list = Array.isArray(child.material)
        ? child.material
        : [child.material];
      list.filter(Boolean).forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
  rotate() {
    this.rotation += Math.PI / 2;
    if (this.ghost) this.ghost.rotation.y = this.rotation;
    if (this.placement) this.updatePlacement(this.placement.x, this.placement.z);
  }
  updatePlacement(x, z) {
    if (!this.selected || !this.ghost) return null;
    const previous = this.placement;
    this.placement = { x, z, ...this.valid(x, z, this.selected) };
    this.ghost.visible = true;
    this.ghost.position.set(x, 0.06, z);
    this.ghost.rotation.y = this.rotation;
    this.footprint.visible = true;
    this.footprint.position.set(x, 0.045, z);
    this.previewOutline.visible = true;
    this.previewOutline.position.set(x, 0.06, z);
    this.previewOutline.rotation.y = this.rotation;
    // Pointer updates can arrive every frame while the player searches for a
    // site. Moving the preview is cheap; walking every mesh to recolor it is
    // not. Keep the last validity state and only repaint when the status flips.
    const validityChanged = !previous || previous.ok !== this.placement.ok;
    if (validityChanged) {
      this.footprint.material.color.set(
        this.placement.ok
          ? this.selected === "road-remove"
            ? "#e8c681"
            : "#8fbf68"
          : "#d9644d",
      );
      this.previewOutline.material.color.set(
        this.placement.ok ? "#d7eca5" : "#f0a08a",
      );
      this.ghost.traverse((o) => {
        if (o.isMesh)
          o.material.color.set(
            this.placement.ok
              ? this.selected === "road-remove"
                ? "#d6a060"
                : "#99cc88"
              : "#d97568",
          );
      });
    }
    if (
      !previous ||
      previous.x !== this.placement.x ||
      previous.z !== this.placement.z ||
      previous.ok !== this.placement.ok ||
      previous.reason !== this.placement.reason
    )
      this.emit();
    return this.placement;
  }
  movePlacement(dx, dz) {
    const current = this.placement || {
      x: snapPlacementCoordinate(0, this.selected),
      z: snapPlacementCoordinate(0, this.selected),
    };
    this.updatePlacement(current.x + dx, current.z + dz);
  }
  removePickTarget(mesh) {
    for (const list of [
      this.pickTargets,
      this.workerPickTargets,
      this.buildingPickTargets,
    ]) {
      const index = list?.indexOf(mesh) ?? -1;
      if (index >= 0) list.splice(index, 1);
    }
  }
  findOpenPlacement(type, origin = { x: 0, z: 3 }) {
    const startX = snapPlacementCoordinate(Number(origin.x) || 0, type);
    const startZ = snapPlacementCoordinate(Number(origin.z) || 0, type);
    for (let radius = 0; radius <= 18; radius += 1) {
      const candidates = [];
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          candidates.push({ x: startX + dx, z: startZ + dz });
        }
      }
      candidates.sort(
        (a, b) =>
          Math.abs(a.x - startX) + Math.abs(a.z - startZ) -
          (Math.abs(b.x - startX) + Math.abs(b.z - startZ)),
      );
      for (const candidate of candidates) {
        if (this.valid(candidate.x, candidate.z, type).ok) return candidate;
      }
    }
    return { x: startX, z: startZ };
  }
  confirmPlacement() {
    if (!this.ready || !this.selected) return false;
    return this.commitPlacement();
  }
  pointerMove(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (
      this.selected &&
      this.ghost &&
      this.raycaster.ray.intersectPlane(this.groundPlane, this.point)
    ) {
      const x = snapPlacementCoordinate(this.point.x, this.selected),
        z = snapPlacementCoordinate(this.point.z, this.selected);
      this.updatePlacement(x, z);
    } else {
      const hits = this.raycaster.intersectObjects(
        this.pickTargets || [
          ...this.workers.map((w) => w.m),
          ...this.buildings.map((b) => b.m),
        ],
        true,
      );
      this.renderer.domElement.style.cursor = hits.length ? "pointer" : "";
    }
  }
  commitPlacement() {
    if (this.storageConflict) {
      this.notify("This village changed in another tab. Reload to continue.");
      return false;
    }
    const p = this.placement;
    if (!p?.ok) {
      this.notify(p?.reason || "Move over the terrain to choose a site.");
      return false;
    }
    const selected = this.selected;
    this.ensureAudio();
    this.playSound("place");
    if (selected === "road-remove") {
      return this.removeRoad(p.x, p.z);
    }
    const type = selected;
    if (type === "road" || CATALOG[type].decoration) {
      for (const [r, v] of Object.entries(CATALOG[type].cost)) {
        this.spendResource(r, v);
      }
    }
    if (type === "road") {
      this.addRoad(p.x, p.z);
      this.clearClearedDecorInFootprint(p.x, p.z, CATALOG[type].size / 2);
      const pathMessage = "A new path for wandering feet.";
      this.announce(pathMessage);
      this.notify(pathMessage);
      if (!this.tutorialDismissed && (this.tutorialStep || 0) === 2)
        this.tutorialStep = 3;
    } else {
      this.addBuilding(
        type,
        p.x,
        p.z,
        this.rotation,
        CATALOG[type].decoration ? 1 : 0,
      );
      this.clearClearedDecorInFootprint(p.x, p.z, CATALOG[type].size / 2);
      this.created[type] =
        Math.max(0, Math.floor(finiteNumber(this.created[type], 0))) + 1;
      const plannedMessage = type === "grainfield"
        ? "Grain planted. The first shoots will appear soon."
        : CATALOG[type].decoration
          ? `${CATALOG[type].name} placed.`
        : `${CATALOG[type].name} planned. Workers will deliver materials before construction.`;
      this.announce(plannedMessage);
      this.notify(plannedMessage);
      if (!this.tutorialDismissed && type === "house" && (this.tutorialStep || 0) === 0) {
        this.tutorialStep = 1;
        const guideWorker = this.workers.find((worker) => worker.m?.position);
        if (guideWorker) this.highlightWorker(guideWorker);
      }
    }
    if (type !== "road" && !CATALOG[type].tileTool) {
      this.select(null);
      this.onPlacementComplete?.();
    }
    this.save();
    this.emit();
    return true;
  }
  click(e) {
    if (!this.ready) return;
    this.pointerMove(e);
    if (this.selected) {
      this.commitPlacement();
      return;
    }
    const workerHits = this.raycaster.intersectObjects(
      this.workerPickTargets || this.workers.map((w) => w.m),
      true,
    );
    if (workerHits.length) {
      let o = workerHits[0].object;
      while (o && !o.userData.worker) o = o.parent;
      const w = o?.userData.worker;
      if (w) {
        this.onSelect({
          type: "worker",
          name: WORKER_TYPE_LABELS[w.workerType] || "Builder",
          description: `${WORKER_TYPE_LABELS[w.workerType] || "Builder"} helping ${this.name} grow.`,
          effect: w.building
            ? `Assigned to ${CATALOG[w.building.type]?.name || "the village"}`
            : "Ready to build the next structure",
          workerId: w.id,
        });
        this.highlightWorker(w);
        if (!this.tutorialDismissed && (this.tutorialStep || 0) === 1) {
          this.tutorialStep = 2;
          this.save();
          this.emit();
        }
        return;
      }
    }
    const hits = this.raycaster.intersectObjects(
      this.buildingPickTargets || this.buildings.map((b) => b.m),
      true,
    );
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.building) o = o.parent;
      const b = o?.userData.building;
      if (b) {
        this.onSelect({
          type: b.type,
          name: CATALOG[b.type]?.name || "Village hall",
          effect: CATALOG[b.type]?.effect || "Your village begins here",
          id: b.id,
        });
        this.highlight(b);
      }
    } else {
      this.onSelect(null);
      this.clearHighlight();
    }
  }
  paintRoad(start, end) {
    if (!start || !end) return;
    if (this.storageConflict) {
      this.notify("This village changed in another tab. Reload to continue.");
      return;
    }
    const makePoints = (horizontalFirst) => {
      const points = [[start.x, start.z]];
      let x = start.x;
      let z = start.z;
      const moveX = () => {
        while (x !== end.x) {
          x += Math.sign(end.x - x);
          points.push([x, z]);
        }
      };
      const moveZ = () => {
        while (z !== end.z) {
          z += Math.sign(end.z - z);
          points.push([x, z]);
        }
      };
      if (horizontalFirst) {
        moveX();
        moveZ();
      } else {
        moveZ();
        moveX();
      }
      return points;
    };
    const traces = [true, false].map((horizontalFirst) => {
      const points = makePoints(horizontalFirst);
      let reachable = -1;
      let blockedReason = "";
      const usable = [];
      for (const [px, pz] of points) {
        if (this.roads.has(`${px},${pz}`)) {
          reachable++;
          continue;
        }
        const spot = this.valid(px, pz, "road");
        if (!spot.ok) {
          blockedReason = spot.reason;
          break;
        }
        reachable++;
        usable.push([px, pz]);
      }
      return { reachable, usable, blockedReason };
    });
    const best = traces.sort(
      (a, b) => b.reachable - a.reachable || b.usable.length - a.usable.length,
    )[0];
    if (!best.usable.length) {
      if (best.blockedReason) this.notify(best.blockedReason);
      return;
    }
    let placed = 0;
    for (const [px, pz] of best.usable) {
      if (this.roads.has(`${px},${pz}`)) continue;
      const spot = this.valid(px, pz, "road");
      if (!spot.ok) {
        if (!placed) this.notify(spot.reason || best.blockedReason);
        break;
      }
      for (const [resource, amount] of Object.entries(CATALOG.road.cost))
        this.spendResource(resource, amount);
      this.addRoad(px, pz);
      placed++;
    }
    if (!placed) return;
    const message = `${placed} path tile${placed === 1 ? "" : "s"} laid.`;
    this.announce(message);
    this.notify(message);
    this.save();
    this.emit();
  }
  paintGrainField(start, end) {
    if (!start || !end) return;
    if (this.storageConflict) {
      this.notify("This village changed in another tab. Reload to continue.");
      return;
    }
    const makePoints = (horizontalFirst) => {
      const points = [[start.x, start.z]];
      let x = start.x;
      let z = start.z;
      const moveX = () => {
        while (x !== end.x) {
          x += Math.sign(end.x - x);
          points.push([x, z]);
        }
      };
      const moveZ = () => {
        while (z !== end.z) {
          z += Math.sign(end.z - z);
          points.push([x, z]);
        }
      };
      if (horizontalFirst) {
        moveX();
        moveZ();
      } else {
        moveZ();
        moveX();
      }
      return points;
    };
    const traces = [true, false].map((horizontalFirst) => {
      const usable = [];
      const virtualFields = new Set();
      let blockedReason = "";
      for (const [x, z] of makePoints(horizontalFirst)) {
        if (
          this.buildings.some(
            (building) =>
              building.type === "grainfield" &&
              building.x === x &&
              building.z === z,
          )
        )
          continue;
        const spot = this.valid(x, z, "grainfield", virtualFields);
        if (!spot.ok) {
          blockedReason = spot.reason;
          break;
        }
        virtualFields.add(`${x},${z}`);
        usable.push([x, z]);
      }
      return { usable, blockedReason };
    });
    const best = traces.sort((a, b) => b.usable.length - a.usable.length)[0];
    if (!best.usable.length) {
      if (best.blockedReason) this.notify(best.blockedReason);
      return;
    }
    let planted = 0;
    for (const [x, z] of best.usable) {
      const spot = this.valid(x, z, "grainfield");
      if (!spot.ok) {
        if (!planted) this.notify(spot.reason || best.blockedReason);
        break;
      }
      for (const [resource, amount] of Object.entries(CATALOG.grainfield.cost))
        this.spendResource(resource, amount);
      this.addBuilding("grainfield", x, z, 0, 1);
      this.created.grainfield =
        Math.max(0, Math.floor(finiteNumber(this.created.grainfield, 0))) + 1;
      planted++;
    }
    if (!planted) return;
    const message = `${planted} grain plot${planted === 1 ? "" : "s"} planted.`;
    this.announce(message);
    this.notify(message);
    this.save();
    this.emit();
  }
  removeRoad(x, z) {
    const key = `${x},${z}`;
    if (!this.roads.has(key) || this.baseRoads.has(key)) {
      this.notify("Choose one of your path tiles to remove.");
      return false;
    }
    this.roads.delete(key);
    this.roadTiles?.delete(key);
    this.roadRevision = (this.roadRevision || 0) + 1;
    this.roadsDirty = true;
    this.created = reconcileRoadCount(this.created, this.roads, this.baseRoads);
    const returnedStone = this.refundResource(
      "stone",
      CATALOG.road.cost.stone,
    );
    const message = returnedStone
      ? `Path removed. ${returnedStone} stone returned.`
      : "Path removed. Stone storage is full, so no stone was returned.";
    this.announce(message);
    this.notify(message);
    this.save();
    this.emit();
    return true;
  }
  removeBuilding(id) {
    if (this.blockedByStorageConflict()) return false;
    const building = this.buildings.find((candidate) => candidate.id === id);
    if (building?.type === "grainfield") {
      for (const worker of this.workers) {
        if (worker.field !== building) continue;
        worker.field = null;
        worker.building = null;
        worker.workInside = false;
        this.setWorkerInside(worker, false);
        worker.phase = "idle";
        worker.timer = 0;
        worker.workDuration = 0;
        worker.path = [];
        worker.routeTarget = null;
        worker.waitingForInput = false;
        worker.waitingForStock = false;
        worker.waitingForInn = false;
        worker.mealSeat = null;
        worker.deliveryRetry = 0;
        worker.waitingForSpace = false;
        worker.waitingFor = null;
        worker.spaceWait = 0;
        worker.forcedYield = null;
        worker.avoidanceTarget = null;
        worker.avoidanceTime = 0;
        worker.deadlockLeaderTime = 0;
        worker.deadlockYieldTime = 0;
        worker.deadlockYieldTo = null;
        worker.materialResource = null;
      }
      this.scene.remove(building.m);
      this.removePickTarget(building.m);
      this.buildings = this.buildings.filter(
        (candidate) => candidate !== building,
      );
      this.created.grainfield = Math.max(
        0,
        Math.max(0, Math.floor(finiteNumber(this.created.grainfield, 0))) - 1,
      );
      const returnedFood = this.refundResource(
        "food",
        CATALOG.grainfield.cost.food,
      );
      const message = returnedFood
        ? `Grain field cleared. ${returnedFood} food returned.`
        : "Grain field cleared. Food storage is full, so no food was returned.";
      this.announce(message);
      this.notify(message);
      this.save();
      this.emit();
      return true;
    }
    if (!building || building.progress >= 1 || building.type === "townhall") return false;
    // Only materials actually hauled to the site were ever taken from the
    // stockpile, so refund those (scaled down once construction has started
    // consuming them) rather than the building's full cost.
    const refundRate = Math.max(0, Math.min(1, 1 - building.progress));
    const materials = building.materials || {};
    const refunded = Object.entries(CATALOG[building.type]?.cost || {})
      .map(([resource, cost]) => {
        const delivered = Math.min(cost, finiteNumber(materials[resource], 0));
        return [
          resource,
          this.refundResource(resource, Math.floor(delivered * refundRate)),
        ];
      })
      .filter(([, amount]) => amount > 0);
    for (const worker of this.workers) {
      if (worker.haulSource === building || worker.haulTarget === building)
        this.releaseHaul(worker);
      if (worker.building !== building) continue;
      // A worker mid-haul is carrying material already pulled from the
      // stockpile; hand it back rather than letting it vanish with the site.
      if (worker.carry?.construction)
        this.refundResource(worker.carry.resource, worker.carry.amount);
      this.clearCarry(worker);
      worker.carry = null;
      worker.building = null;
      worker.workInside = false;
      this.setWorkerInside(worker, false);
      worker.materialSourceBuilding = null;
      worker.pickupSource = null;
      worker.doorBuilding = null;
      if (!worker.m.visible) {
        worker.m.visible = true;
        worker.shadowVisible = true;
        this.updateWorkerShadow(worker);
      }
      worker.phase = "idle";
      worker.waitingForInput = false;
      worker.waitingForStock = false;
      worker.waitingForInn = false;
      worker.mealSeat = null;
      worker.deliveryRetry = 0;
      worker.timer = 0;
      worker.workDuration = 0;
      worker.path = [];
      worker.routeTarget = null;
      worker.waitingForSpace = false;
      worker.waitingFor = null;
      worker.spaceWait = 0;
      worker.forcedYield = null;
      worker.avoidanceTarget = null;
      worker.avoidanceTime = 0;
      worker.deadlockLeaderTime = 0;
      worker.deadlockYieldTime = 0;
      worker.deadlockYieldTo = null;
      worker.materialResource = null;
    }
    this.disposeOwnedObject(building.scaffolding);
    this.disposeOwnedObject(building.siteRing);
    this.scene.remove(building.m);
    this.removePickTarget(building.m);
    this.buildings = this.buildings.filter((candidate) => candidate !== building);
    this.created[building.type] = Math.max(
      0,
      Math.max(0, Math.floor(finiteNumber(this.created[building.type], 0))) - 1,
    );
    const refundMessage = refunded.length
      ? `${refunded.map(([resource, amount]) => `${amount} ${resource}`).join(", ")} returned.`
      : "Storage is full, so no materials were returned.";
    const message = `${CATALOG[building.type].name} cancelled. ${refundMessage}`;
    this.announce(message);
    this.notify(message);
    this.save();
    this.emit();
    return true;
  }
  upgradeBuilding(id) {
    if (this.blockedByStorageConflict()) return false;
    const building = this.buildings.find((candidate) => candidate.id === id);
    const upgrade = CATALOG[building?.type]?.upgrade;
    if (!building || building.progress < 1 || building.upgrade || !upgrade) return false;
    if (Object.entries(upgrade.cost).some(([resource, amount]) => this.resourceAmount(resource) < amount)) {
      this.notify("Not enough resources for this upgrade.");
      return false;
    }
    Object.entries(upgrade.cost).forEach(([resource, amount]) => {
      this.spendResource(resource, amount);
    });
    building.upgrade = upgrade.name;
    this.announce(`${CATALOG[building.type].name} upgraded: ${upgrade.name}.`);
    this.notify(`${CATALOG[building.type].name} upgraded.`);
    this.save();
    this.emit();
    return true;
  }
  trainWorker(id, workerType) {
    if (this.blockedByStorageConflict()) return false;
    const school = this.buildings.find((candidate) => candidate.id === id);
    if (!school || school.type !== "school" || school.progress < 1) return false;
    if (school.training) {
      this.notify("The School is already training someone.");
      return false;
    }
    const option = trainingOptions(this.buildings, this.workers).find(
      (candidate) => candidate.type === workerType,
    );
    if (!option) return false;
    if (!option.canTrain) {
      this.notify(option.reason);
      return false;
    }
    school.training = { type: workerType, remaining: TRAINING_SECONDS, waiting: false };
    this.announce(`The School has taken on a ${option.label.toLowerCase()} apprentice.`);
    this.notify(
      `${option.label} training started · ${Math.round(TRAINING_SECONDS)} seconds.`,
    );
    this.playSound("notice");
    this.save();
    this.emit();
    return true;
  }
  updateTraining(dt) {
    for (const school of this.buildings) {
      if (school.type !== "school" || !school.training) continue;
      if (school.progress < 1) continue;
      const session = school.training;
      session.remaining = Math.max(0, finiteNumber(session.remaining, 0) - dt);
      if (session.remaining > 0) continue;
      // A graduate needs somewhere to sleep; hold them at the School until a
      // cottage has room rather than dropping the training.
      const capacity = Math.min(MAX_POPULATION, housingCapacity(this.buildings));
      if (this.workers.length >= capacity) {
        if (!session.waiting) {
          session.waiting = true;
          this.announce("A new apprentice is waiting for somewhere to live.");
          this.emit();
        }
        continue;
      }
      const worker = this.addWorker();
      if (!worker) continue;
      worker.trainedType = session.type;
      this.setWorkerType(worker, session.type);
      school.training = null;
      school.cycles = Math.max(0, Math.floor(finiteNumber(school.cycles, 0))) + 1;
      const label = WORKER_TYPE_LABELS[session.type] || "Villager";
      this.announce(`${label} finished training at the School.`);
      this.notify(`A new ${label.toLowerCase()} has finished training.`);
      this.playSound("complete");
      this.save();
      this.emit();
    }
  }
  startFeast() {
    if (this.blockedByStorageConflict()) return false;
    if (this.feast?.remaining > 0) {
      this.notify("The village is already enjoying a feast.");
      return false;
    }
    if (this.resourceAmount("food") < 30) {
      this.notify("A feast needs 30 food. Keep the farms working.");
      return false;
    }
    this.consumeFood(30);
    this.ensureAudio();
    this.feast = { remaining: 45 };
    this.announce("The village feast begins. Builders feel the extra warmth.");
    this.notify("Village feast started: construction is 25% faster for 45 seconds.");
    this.save();
    this.emit();
    return true;
  }
  highlight(b) {
    this.clearHighlight();
    const n = (CATALOG[b.type]?.size || 4) / 2 + 0.3;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(n, n + 0.075, 48),
      new THREE.MeshBasicMaterial({ color: "#f4e7b3", side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(b.x, 0.05, b.z);
    this.ring.material.transparent = true;
    this.ring.material.opacity = 0.6;
    this.ring.userData.worker = null;
    this.scene.add(this.ring);
  }
  highlightWorker(worker) {
    this.clearHighlight();
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.51, 32),
      new THREE.MeshBasicMaterial({ color: "#f4e7b3", side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.material.transparent = true;
    this.ring.material.opacity = 0.72;
    this.ring.userData.worker = worker;
    this.scene.add(this.ring);
    this.ring.position.set(worker.m.position.x, 0.055, worker.m.position.z);
    this.guideMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({
        color: "#f4e7b3",
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.guideMarker.userData.worker = worker;
    this.scene.add(this.guideMarker);
    this.guideMarker.position.set(worker.m.position.x, 0.58, worker.m.position.z);
  }
  clearHighlight() {
    if (this.ring) {
      this.scene.remove(this.ring);
      this.ring.geometry.dispose();
      this.ring.material.dispose();
      this.ring = null;
    }
    if (this.guideMarker) {
      this.scene.remove(this.guideMarker);
      this.guideMarker.geometry.dispose();
      this.guideMarker.material.dispose();
      this.guideMarker = null;
    }
  }
  disposeSceneResources() {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    this.scene?.traverse((object) => {
      if (!(object.isMesh || object.isLine || object.isPoints)) return;
      if (object.geometry) geometries.add(object.geometry);
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material];
      list.filter(Boolean).forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
      });
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    this.scene?.clear();
  }
  createWorkerRig(m) {
    const sourceMeshes = [];
    m.traverse((object) => {
      if (object.isMesh) {
        sourceMeshes.push(object);
        object.visible = false;
      }
    });
    const sourceMaterial = (name, fallback) => {
      const source = sourceMeshes.find((object) =>
        object.name.toLowerCase().startsWith(name.toLowerCase()),
      );
      return (
        source?.material?.clone() ||
        new THREE.MeshStandardMaterial({
          color: fallback,
          roughness: 0.9,
          flatShading: true,
        })
      );
    };
    const materials = {
      tunic: sourceMaterial("tunic", "#123f91"),
      skin: sourceMaterial("head", "#a35c35"),
      cream: sourceMaterial("arm", "#e1c386"),
      dark: sourceMaterial("leg", "#201d19"),
      wood: sourceMaterial("shoe", "#70452b"),
      accent: new THREE.MeshStandardMaterial({
        color: "#f0b94b",
        roughness: 0.9,
        flatShading: true,
      }),
      light: new THREE.MeshStandardMaterial({
        color: "#fff1bd",
        roughness: 0.86,
        flatShading: true,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: "#7b858c",
        roughness: 0.8,
        flatShading: true,
      }),
      // Role props with colours of their own, rather than palette entries every
      // worker would carry: the woodcutter's hat and satchel, the baker's loaves.
      straw: new THREE.MeshStandardMaterial({
        color: "#e3b551",
        roughness: 0.92,
        flatShading: true,
      }),
      moss: new THREE.MeshStandardMaterial({
        color: "#5f7a3e",
        roughness: 0.92,
        flatShading: true,
      }),
      bread: new THREE.MeshStandardMaterial({
        color: "#c98c43",
        roughness: 0.9,
        flatShading: true,
      }),
    };
    // The loaded worker GLB is only a material palette for the animated rig.
    // Remove its hidden source subtree after extracting those materials so
    // every worker does not carry an extra set of scene and raycast nodes.
    m.clear();
    const part = (geometry, material) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const rig = new THREE.Group();
    const tunic = part(new THREE.BoxGeometry(0.23, 0.3, 0.16), materials.tunic);
    tunic.position.y = 0.51;
    rig.add(tunic);
    const head = part(new THREE.IcosahedronGeometry(0.115, 1), materials.skin);
    head.position.y = 0.79;
    head.scale.set(1, 0.9, 1.1);
    rig.add(head);
    const cap = part(new THREE.CylinderGeometry(0.13, 0.11, 0.12, 6), materials.cream);
    cap.position.y = 0.9;
    cap.visible = false;
    rig.add(cap);
    const roleHeadgear = {};
    const addHeadgear = (type, meshes) => {
      const group = new THREE.Group();
      meshes.forEach((mesh) => group.add(mesh));
      group.visible = false;
      rig.add(group);
      roleHeadgear[type] = group;
      return group;
    };
    const builderHelmet = addHeadgear(WORKER_TYPES.BUILDER, [
      part(new THREE.CylinderGeometry(0.145, 0.13, 0.095, 8), materials.accent),
      part(new THREE.BoxGeometry(0.19, 0.035, 0.19), materials.accent),
    ]);
    builderHelmet.children[0].position.y = 0.9;
    builderHelmet.children[1].position.set(0, 0.865, -0.01);
    const woodcutterHat = addHeadgear(WORKER_TYPES.WOODCUTTER, [
      part(new THREE.CylinderGeometry(0.172, 0.172, 0.026, 10), materials.straw),
      part(new THREE.ConeGeometry(0.142, 0.185, 8), materials.straw),
      part(new THREE.TorusGeometry(0.128, 0.014, 6, 10), materials.dark),
    ]);
    woodcutterHat.children[0].position.y = 0.874;
    woodcutterHat.children[1].position.y = 0.965;
    woodcutterHat.children[2].position.y = 0.886;
    woodcutterHat.children[2].rotation.x = Math.PI / 2;
    const minerHelmet = addHeadgear(WORKER_TYPES.MINER, [
      part(
        new THREE.SphereGeometry(0.128, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        materials.metal,
      ),
      part(new THREE.CylinderGeometry(0.152, 0.152, 0.026, 10), materials.metal),
      part(new THREE.BoxGeometry(0.055, 0.05, 0.05), materials.dark),
      part(new THREE.SphereGeometry(0.048, 8, 6), materials.light),
    ]);
    minerHelmet.children[0].position.y = 0.868;
    minerHelmet.children[0].scale.set(1, 0.92, 1.05);
    minerHelmet.children[1].position.y = 0.874;
    minerHelmet.children[2].position.set(0, 0.9, 0.118);
    minerHelmet.children[3].position.set(0, 0.896, 0.152);
    const carrierHood = addHeadgear(WORKER_TYPES.CARRIER, [
      part(new THREE.SphereGeometry(0.132, 10, 7), materials.accent),
      part(new THREE.TorusGeometry(0.136, 0.026, 6, 10), materials.dark),
      part(new THREE.BoxGeometry(0.16, 0.085, 0.045), materials.accent),
    ]);
    carrierHood.children[0].position.y = 0.875;
    carrierHood.children[0].scale.set(1, 0.86, 1.02);
    carrierHood.children[1].position.y = 0.812;
    carrierHood.children[1].rotation.x = Math.PI / 2;
    carrierHood.children[2].position.set(0, 0.79, -0.1);
    const farmerHat = addHeadgear(WORKER_TYPES.FARMER, [
      part(new THREE.ConeGeometry(0.115, 0.11, 8), materials.cream),
      part(new THREE.CylinderGeometry(0.22, 0.22, 0.035, 10), materials.accent),
      part(new THREE.TorusGeometry(0.135, 0.018, 5, 8), materials.dark),
    ]);
    farmerHat.children[0].position.y = 0.95;
    farmerHat.children[1].position.y = 0.895;
    farmerHat.children[2].position.set(0, 0.94, 0);
    farmerHat.children[2].rotation.x = Math.PI / 2;
    const bakerToque = addHeadgear(WORKER_TYPES.BAKER, [
      part(new THREE.CylinderGeometry(0.138, 0.138, 0.05, 10), materials.light),
      part(new THREE.CylinderGeometry(0.152, 0.126, 0.19, 10), materials.light),
      part(new THREE.SphereGeometry(0.138, 10, 7), materials.light),
    ]);
    bakerToque.children[0].position.y = 0.888;
    bakerToque.children[1].position.y = 1.0;
    bakerToque.children[2].position.y = 1.1;
    bakerToque.children[2].scale.set(1, 0.78, 1);
    const makeArm = (x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.62, 0);
      const arm = part(new THREE.BoxGeometry(0.07, 0.28, 0.07), materials.cream);
      arm.position.y = -0.13;
      pivot.add(arm);
      const hand = part(new THREE.IcosahedronGeometry(0.055, 1), materials.skin);
      hand.position.set(0, -0.29, -0.02);
      hand.scale.set(1, 1, 0.9);
      pivot.add(hand);
      rig.add(pivot);
      return pivot;
    };
    const makeLeg = (x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.38, 0);
      const leg = part(new THREE.BoxGeometry(0.08, 0.28, 0.08), materials.dark);
      leg.position.y = -0.14;
      pivot.add(leg);
      const shoe = part(new THREE.BoxGeometry(0.09, 0.09, 0.17), materials.wood);
      shoe.position.set(0, -0.3, 0.035);
      pivot.add(shoe);
      rig.add(pivot);
      return pivot;
    };
    const leftArm = makeArm(-0.16);
    const rightArm = makeArm(0.16);
    const axe = new THREE.Group();
    const axeHaft = part(new THREE.BoxGeometry(0.036, 0.44, 0.036), materials.wood);
    axeHaft.position.y = 0.22;
    const axeCheek = part(new THREE.BoxGeometry(0.06, 0.11, 0.05), materials.dark);
    axeCheek.position.set(0.022, 0.395, 0);
    const axeBlade = part(new THREE.BoxGeometry(0.09, 0.15, 0.05), materials.metal);
    axeBlade.position.set(0.072, 0.4, 0);
    const axeBit = part(new THREE.BoxGeometry(0.035, 0.075, 0.055), materials.metal);
    axeBit.position.set(0.125, 0.4, 0);
    const axeButt = part(new THREE.BoxGeometry(0.035, 0.05, 0.04), materials.dark);
    axeButt.position.set(-0.01, 0.03, 0);
    axe.add(axeHaft, axeCheek, axeBlade, axeBit, axeButt);
    axe.position.set(0.015, -0.3, 0.03);
    axe.rotation.z = AXE_CARRY_ANGLE;
    axe.visible = false;
    rightArm.add(axe);
    const makeTool = (headWidth, headHeight) => {
      const tool = new THREE.Group();
      const handle = part(
        new THREE.BoxGeometry(0.035, 0.34, 0.035),
        materials.wood,
      );
      handle.position.y = -0.17;
      tool.add(handle);
      const head = part(
        new THREE.BoxGeometry(headWidth, headHeight, 0.035),
        materials.dark,
      );
      head.position.set(0.035, -0.02, 0);
      tool.add(head);
      tool.position.set(0, -0.31, -0.05);
      tool.rotation.z = -0.6;
      tool.visible = false;
      return tool;
    };
    const hammer = makeTool(0.14, 0.08);
    leftArm.add(hammer);
    const pickaxe = new THREE.Group();
    const pickHaft = part(new THREE.BoxGeometry(0.034, 0.40, 0.034), materials.wood);
    pickHaft.position.y = 0.2;
    const pickHead = part(new THREE.BoxGeometry(0.22, 0.048, 0.042), materials.metal);
    pickHead.position.y = 0.375;
    const pickCollar = part(new THREE.BoxGeometry(0.05, 0.075, 0.05), materials.dark);
    pickCollar.position.y = 0.365;
    pickaxe.add(pickHaft, pickHead, pickCollar);
    for (const side of [-1, 1]) {
      const tip = part(new THREE.BoxGeometry(0.042, 0.03, 0.03), materials.dark);
      tip.position.set(side * 0.125, 0.375, 0);
      pickaxe.add(tip);
    }
    pickaxe.position.set(0.015, -0.3, 0.03);
    pickaxe.rotation.z = AXE_CARRY_ANGLE;
    pickaxe.visible = false;
    rightArm.add(pickaxe);
    const sickle = new THREE.Group();
    const sickleHandle = part(
      new THREE.BoxGeometry(0.03, 0.2, 0.03),
      materials.wood,
    );
    sickleHandle.position.y = -0.1;
    const sickleBlade = part(
      new THREE.TorusGeometry(0.075, 0.014, 5, 10, Math.PI * 0.82),
      materials.metal,
    );
    sickleBlade.position.set(0.035, 0.02, 0);
    sickleBlade.rotation.z = -0.45;
    sickle.add(sickleHandle, sickleBlade);
    sickle.position.set(0, -0.29, -0.06);
    sickle.rotation.z = -0.5;
    sickle.visible = false;
    leftArm.add(sickle);
    const rollingPin = part(
      new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8),
      materials.wood,
    );
    rollingPin.rotation.z = Math.PI / 2;
    rollingPin.position.set(0, -0.3, 0.07);
    rollingPin.visible = false;
    rightArm.add(rollingPin);
    const farmerBrim = part(
      new THREE.CylinderGeometry(0.18, 0.18, 0.035, 8),
      materials.cream,
    );
    farmerBrim.position.y = 0.9;
    farmerBrim.visible = false;
    rig.add(farmerBrim);
    const bakerGear = new THREE.Group();
    const bakerCollar = part(
      new THREE.TorusGeometry(0.092, 0.024, 6, 10),
      materials.light,
    );
    bakerCollar.position.y = 0.68;
    bakerCollar.rotation.x = Math.PI / 2;
    const bakerBelly = part(new THREE.SphereGeometry(0.118, 10, 7), materials.tunic);
    bakerBelly.position.set(0, 0.5, 0.05);
    bakerBelly.scale.set(1.06, 0.94, 0.86);
    const bakerSkirt = part(new THREE.BoxGeometry(0.215, 0.15, 0.155), materials.light);
    bakerSkirt.position.set(0, 0.405, 0.015);
    bakerGear.add(bakerCollar, bakerBelly, bakerSkirt);
    for (const side of [-1, 1]) {
      const button = part(new THREE.BoxGeometry(0.028, 0.028, 0.02), materials.dark);
      button.position.set(side * 0.05, 0.58, 0.13);
      bakerGear.add(button);
    }
    bakerGear.visible = false;
    rig.add(bakerGear);
    // A board of fresh loaves carried in front, swapped for the rolling pin
    // once the baker is at the oven.
    const breadTray = new THREE.Group();
    const trayBoard = part(new THREE.BoxGeometry(0.28, 0.028, 0.135), materials.wood);
    const trayLip = part(new THREE.BoxGeometry(0.28, 0.045, 0.022), materials.dark);
    trayLip.position.set(0, 0.02, 0.068);
    breadTray.add(trayBoard, trayLip);
    for (const offset of [-0.09, 0, 0.09]) {
      const loaf = part(new THREE.SphereGeometry(0.045, 8, 6), materials.bread);
      loaf.position.set(offset, 0.035, 0);
      loaf.scale.set(1, 0.72, 0.82);
      breadTray.add(loaf);
    }
    breadTray.position.set(0, 0.495, 0.175);
    breadTray.visible = false;
    rig.add(breadTray);
    const builderBelt = part(
      new THREE.BoxGeometry(0.255, 0.055, 0.19),
      materials.accent,
    );
    builderBelt.position.set(0, 0.45, 0);
    builderBelt.visible = false;
    rig.add(builderBelt);
    const woodcutterGear = new THREE.Group();
    const scarfBand = part(
      new THREE.TorusGeometry(0.088, 0.022, 6, 10),
      materials.accent,
    );
    scarfBand.position.y = 0.715;
    scarfBand.rotation.x = Math.PI / 2;
    const scarfKnot = part(new THREE.ConeGeometry(0.075, 0.13, 4), materials.accent);
    scarfKnot.position.set(0, 0.655, 0.075);
    scarfKnot.rotation.x = Math.PI;
    const toolBelt = part(new THREE.BoxGeometry(0.245, 0.05, 0.175), materials.dark);
    toolBelt.position.y = 0.44;
    const satchel = part(new THREE.BoxGeometry(0.115, 0.12, 0.075), materials.moss);
    satchel.position.set(-0.105, 0.435, -0.085);
    const satchelFlap = part(new THREE.BoxGeometry(0.12, 0.045, 0.08), materials.dark);
    satchelFlap.position.set(-0.105, 0.495, -0.085);
    const satchelStrap = part(new THREE.BoxGeometry(0.05, 0.32, 0.03), materials.dark);
    satchelStrap.position.set(0.055, 0.53, 0.09);
    satchelStrap.rotation.z = 0.42;
    const shoulderPad = part(new THREE.BoxGeometry(0.115, 0.05, 0.16), materials.moss);
    shoulderPad.position.set(-0.105, 0.655, 0);
    woodcutterGear.add(
      scarfBand,
      scarfKnot,
      toolBelt,
      satchel,
      satchelFlap,
      satchelStrap,
      shoulderPad,
    );
    woodcutterGear.visible = false;
    rig.add(woodcutterGear);
    const minerGear = new THREE.Group();
    const minerBelt = part(new THREE.BoxGeometry(0.25, 0.05, 0.18), materials.dark);
    minerBelt.position.y = 0.44;
    const orePouch = part(new THREE.BoxGeometry(0.11, 0.11, 0.075), materials.accent);
    orePouch.position.set(-0.115, 0.415, 0.07);
    const pouchFlap = part(new THREE.BoxGeometry(0.115, 0.042, 0.08), materials.dark);
    pouchFlap.position.set(-0.115, 0.472, 0.07);
    const minerStrap = part(new THREE.BoxGeometry(0.05, 0.3, 0.03), materials.dark);
    minerStrap.position.set(-0.05, 0.53, 0.09);
    minerStrap.rotation.z = -0.4;
    minerGear.add(minerBelt, orePouch, pouchFlap, minerStrap);
    minerGear.visible = false;
    rig.add(minerGear);
    const farmerOveralls = part(
      new THREE.BoxGeometry(0.19, 0.18, 0.03),
      materials.accent,
    );
    farmerOveralls.position.set(0, 0.54, -0.095);
    farmerOveralls.visible = false;
    rig.add(farmerOveralls);
    const carrierGear = new THREE.Group();
    for (const side of [-1, 1]) {
      const strap = part(new THREE.BoxGeometry(0.036, 0.26, 0.03), materials.wood);
      strap.position.set(side * 0.055, 0.55, 0.075);
      strap.rotation.z = side * 0.22;
      carrierGear.add(strap);
    }
    const carrierBelt = part(new THREE.BoxGeometry(0.245, 0.055, 0.175), materials.wood);
    carrierBelt.position.set(0, 0.425, 0);
    const backCrate = part(new THREE.BoxGeometry(0.2, 0.185, 0.095), materials.accent);
    backCrate.position.set(0, 0.56, -0.13);
    const crateBand = part(new THREE.BoxGeometry(0.215, 0.032, 0.105), materials.dark);
    crateBand.position.set(0, 0.56, -0.13);
    carrierGear.add(carrierBelt, backCrate, crateBand);
    carrierGear.visible = false;
    rig.add(carrierGear);
    const leftLeg = makeLeg(-0.075);
    const rightLeg = makeLeg(0.075);
    // Keep the role silhouettes readable at the game's normal isometric zoom.
    rig.scale.setScalar(1.16);
    m.add(rig);
    return {
      rig,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      axe,
      hammer,
      pickaxe,
      sickle,
      rollingPin,
      breadTray,
      farmerBrim,
      bakerGear,
      roleHeadgear,
      builderBelt,
      woodcutterGear,
      minerGear,
      farmerOveralls,
      carrierGear,
      cap,
      materials,
    };
  }
  setWorkerType(worker, type = WORKER_TYPES.BUILDER) {
    const workerType = WORKER_TYPE_LABELS[type]
      ? type
      : WORKER_TYPES.BUILDER;
    if (!worker) return workerType;
    if (!worker.rig) {
      worker.workerType = workerType;
      return workerType;
    }
    const palette = {
      [WORKER_TYPES.BUILDER]: {
        tunic: "#4167a2",
        cap: "#e1c386",
        dark: "#201d19",
        shoe: "#70452b",
        accent: "#f0b94b",
      },
      [WORKER_TYPES.WOODCUTTER]: {
        tunic: "#6f4a2c",
        cap: "#d9a95c",
        dark: "#2a2420",
        shoe: "#5a3a22",
        accent: "#c4402f",
      },
      [WORKER_TYPES.MINER]: {
        tunic: "#d8a72f",
        cap: "#e6c96d",
        dark: "#33302b",
        shoe: "#4d4a46",
        accent: "#b23a2e",
      },
      [WORKER_TYPES.FARMER]: {
        tunic: "#6e8651",
        cap: "#d6b04e",
        dark: "#3e3a25",
        shoe: "#67482b",
        accent: "#e2bf54",
      },
      [WORKER_TYPES.BAKER]: {
        tunic: "#f0e4cd",
        cap: "#c0483c",
        dark: "#43302c",
        shoe: "#6b4425",
        accent: "#c0483c",
      },
      [WORKER_TYPES.CARRIER]: {
        tunic: "#8d6a3f",
        cap: "#d9c08a",
        dark: "#3a2f26",
        shoe: "#5b4029",
        accent: "#9d7a43",
      },
    }[workerType];
    const materials = worker.rig.materials;
    materials.tunic.color.set(palette.tunic);
    materials.cream.color.set(palette.cap);
    materials.dark.color.set(palette.dark);
    materials.wood.color.set(palette.shoe);
    materials.accent.color.set(palette.accent);
    materials.light.color.set(
      workerType === WORKER_TYPES.BAKER ? "#fff7df" : "#fff1bd",
    );
    materials.metal.color.set(
      workerType === WORKER_TYPES.MINER
        ? "#98a3a8"
        : workerType === WORKER_TYPES.WOODCUTTER
          ? "#9098a0"
          : "#7b858c",
    );
    worker.rig.cap.scale.set(
      workerType === WORKER_TYPES.MINER ? 1.12 : 1,
      workerType === WORKER_TYPES.FARMER ? 0.86 : 1,
      workerType === WORKER_TYPES.MINER ? 1.12 : 1,
    );
    worker.rig.axe.visible = false;
    worker.rig.hammer.visible = workerType === WORKER_TYPES.BUILDER;
    worker.rig.pickaxe.visible = workerType === WORKER_TYPES.MINER;
    worker.rig.sickle.visible = workerType === WORKER_TYPES.FARMER;
    worker.rig.rollingPin.visible = false;
    worker.rig.breadTray.visible = workerType === WORKER_TYPES.BAKER;
    worker.rig.pickaxe.rotation.z = AXE_CARRY_ANGLE;
    Object.values(worker.rig.roleHeadgear).forEach((headgear) => {
      headgear.visible = false;
    });
    worker.rig.roleHeadgear[workerType].visible = true;
    worker.rig.farmerBrim.visible = false;
    worker.rig.bakerGear.visible = workerType === WORKER_TYPES.BAKER;
    worker.rig.builderBelt.visible = workerType === WORKER_TYPES.BUILDER;
    worker.rig.woodcutterGear.visible = workerType === WORKER_TYPES.WOODCUTTER;
    worker.rig.minerGear.visible = workerType === WORKER_TYPES.MINER;
    worker.rig.farmerOveralls.visible = workerType === WORKER_TYPES.FARMER;
    worker.rig.carrierGear.visible = workerType === WORKER_TYPES.CARRIER;
    worker.rig.axe.visible = workerType === WORKER_TYPES.WOODCUTTER;
    worker.rig.axe.rotation.z = AXE_CARRY_ANGLE;
    worker.rig.pickaxe.visible = workerType === WORKER_TYPES.MINER;
    worker.workerType = workerType;
    return workerType;
  }
  addWorker() {
    const preferredX = rand() * 2 - 1;
    const preferredZ = rand() * 2;
    const [spawnX, spawnZ] = this.workerSpawnPosition(preferredX, preferredZ);
    const m = this.model("worker", spawnX, spawnZ);
    const rig = this.createWorkerRig(m);
    this.workerShadowField ||= this.createWorkerShadowField();
    const shadowIndex = this.workers.length;
    if (this.workerShadowField?.mesh) {
      this.workerShadowField.mesh.count = Math.max(
        this.workerShadowField.mesh.count,
        shadowIndex + 1,
      );
    }
    const w = {
      m,
      shadowIndex,
      shadowVisible: true,
      phase: "idle",
      path: [],
      id: `worker-${this.nextWorkerId++}`,
      movementPriority: this.nextWorkerId - 1,
      timer: 0,
      workDuration: 0,
      building: null,
      workInside: false,
      insideBuilding: false,
      workEffect: null,
      carry: null,
      tree: null,
      waitingForInput: false,
      waitingForInn: false,
      hunger: 0.18 + rand() * 0.45,
      mealSeat: null,
      walkPhase: rand() * Math.PI * 2,
      idlePhase: rand() * Math.PI * 2,
      walkBlend: 0,
      waitingForSpace: false,
      spaceWait: 0,
      repathCooldown: 0,
      forcedYield: null,
      avoidanceTarget: null,
      avoidanceTime: 0,
      deadlockLeaderTime: 0,
      deadlockYieldTime: 0,
      deadlockYieldTo: null,
      rig,
      workerType: WORKER_TYPES.BUILDER,
    };
    this.setWorkerType(w, WORKER_TYPES.BUILDER);
    m.userData.worker = w;
    const hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 8, 6),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    hitbox.name = "WorkerHitbox";
    hitbox.position.y = 0.42;
    hitbox.userData.worker = w;
    m.add(hitbox);
    this.workers.push(w);
    this.workerPickTargets ||= [];
    this.pickTargets ||= [];
    this.workerPickTargets.push(m);
    this.pickTargets.push(m);
    return w;
  }
  carryColor(resource) {
    return {
      wood: "#b97943",
      stone: "#9ca8a3",
      food: "#c98a43",
      wheat: "#e1b74e",
      wine: "#6e2450",
    }[resource] || "#d6bd7c";
  }
  showCarry(w, resource, variant = null) {
    if (w.carryMesh || !w.m?.add) return;
    const geometry =
      resource === "stone"
        ? new THREE.DodecahedronGeometry(0.13, 0)
        : resource === "food"
          ? new THREE.ConeGeometry(0.11, 0.23, 5)
        : resource === "wine"
          ? new THREE.CylinderGeometry(0.11, 0.11, 0.24, 10)
          : variant === "logs"
            ? new THREE.CylinderGeometry(0.08, 0.08, 0.28, 8)
            : new THREE.BoxGeometry(0.24, 0.13, 0.13);
    w.carryMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: this.carryColor(resource),
        roughness: 0.85,
        flatShading: true,
      }),
    );
    w.carryMesh.position.set(0, 0.63, -0.17);
    if (variant === "logs") w.carryMesh.rotation.z = Math.PI / 2;
    w.carryMesh.rotation.y = rand() * Math.PI;
    w.carryMesh.castShadow = true;
    w.m.add(w.carryMesh);
  }
  clearCarry(w) {
    if (!w.carryMesh) return;
    w.m.remove(w.carryMesh);
    w.carryMesh.geometry.dispose();
    w.carryMesh.material.dispose();
    w.carryMesh = null;
  }
  deliveryBurst(b, resource, amount) {
    if (!this.scene?.add || !b) return;
    if (this.reduceMotion) return;
    const color = this.carryColor(resource);
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.28, 18),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    const sparks = [];
    for (let i = 0; i < 5; i++) {
      const spark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.07, 0),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
      );
      const angle = (i / 5) * Math.PI * 2;
      spark.position.set(Math.cos(angle) * 0.22, 0.08, Math.sin(angle) * 0.22);
      group.add(spark);
      sparks.push(spark);
    }
    group.position.set(b.x, 0.08, b.z);
    this.scene.add(group);
    this.deliveryBursts.push({ group, ring, sparks, amount, life: 0.95 });
  }
  announce(message, duration = 8.5) {
    this.activity = message;
    this.activityTime = duration;
    if (!Array.isArray(this.activityLog)) this.activityLog = [];
    if (!Number.isInteger(this.nextActivityId)) this.nextActivityId = 0;
    const text = String(message).slice(0, 140);
    const duplicate = this.activityLog.findIndex(
      ({ message: previous }) => previous === text,
    );
    if (duplicate >= 0) this.activityLog.splice(duplicate, 1);
    this.activityLog.unshift({
      id: this.nextActivityId++,
      message: text,
    });
    this.activityLog = this.activityLog.slice(0, 4);
    if (/ready|delivered|feast|path|planned|removed/i.test(text)) this.playSound("notice");
  }
  ensureAudio() {
    if (typeof AudioContext === "undefined") return null;
    if (!this.audioContext) this.audioContext = new AudioContext();
    if (this.audioContext.state === "suspended") this.audioContext.resume();
    return this.audioContext;
  }
  playSound(kind = "notice") {
    if (!this.audioSettings?.effects) return;
    const context = this.audioContext;
    if (!context) return;
    const frequencies = { place: 440, notice: 660, complete: 880 };
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequencies[kind] || frequencies.notice;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
    oscillator.connect(gain).connect(context.destination);
    let cleaned = false;
    oscillator.onended = () => {
      if (cleaned) return;
      cleaned = true;
      oscillator.disconnect?.();
      gain.disconnect?.();
    };
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
  }
  setAudioSetting(key, enabled) {
    if (!(key in this.audioSettings)) return false;
    this.audioSettings[key] = Boolean(enabled);
    if (this.audioSettings[key]) this.ensureAudio();
    if (key === "ambience") {
      if (this.audioSettings.ambience && !this.ambientOscillator && this.audioContext) {
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 110;
        gain.gain.value = 0.006;
        oscillator.connect(gain).connect(this.audioContext.destination);
        oscillator.start();
        this.ambientOscillator = { oscillator, gain };
      } else if (!this.audioSettings.ambience && this.ambientOscillator) {
        this.stopAmbientAudio();
      }
    }
    try {
      localStorage.setItem("hearth-settings", JSON.stringify({ graphicsPreset: this.graphicsPreset, ...this.audioSettings }));
    } catch {}
    this.emit?.();
    return true;
  }
  stopAmbientAudio() {
    const ambient = this.ambientOscillator;
    this.ambientOscillator = null;
    if (ambient) {
      try {
        ambient.oscillator?.stop();
      } catch {
        // An oscillator may already have stopped while the page was hidden.
      }
      try {
        ambient.oscillator?.disconnect?.();
        ambient.gain?.disconnect?.();
      } catch {
        // Some browser audio implementations reject a repeated disconnect.
      }
    }
  }
  disposeAudio() {
    this.stopAmbientAudio();
    const context = this.audioContext;
    this.audioContext = null;
    try {
      const closing = context?.close?.();
      closing?.catch?.(() => {});
    } catch {
      // Audio teardown is best-effort; it must never block world disposal.
    }
  }
  updateAtmosphere() {
    if (!this.sun || !this.hemi) return;
    // The projection is driven only by simulation time. While paused, the
    // camera and renderer remain live but repeating these colour/light writes
    // every frame has no visual effect.
    if (
      this.atmosphere.lastElapsed === this.elapsed ||
      this.elapsed - this.lastAtmosphereUpdate < ATMOSPHERE_UPDATE_INTERVAL
    )
      return;
    this.lastAtmosphereUpdate = this.elapsed;
    this.atmosphere.lastElapsed = this.elapsed;
    const cycle = ((this.elapsed % 120) / 120 + 0.22) % 1;
    const sunHeight = Math.max(0, Math.sin(cycle * Math.PI));
    const dusk = Math.pow(1 - sunHeight, 2.4);
    const night = THREE.MathUtils.clamp((0.36 - sunHeight) / 0.36, 0, 1);
    this.atmosphere.sunHeight = sunHeight;
    this.atmosphere.nightAmount = Math.max(
      night,
      Math.pow(1 - sunHeight, 4) * 0.35,
    );
    this.atmosphere.sky
      .copy(this.atmosphere.day)
      .lerp(this.atmosphere.dusk, Math.min(1, dusk * 0.72))
      .lerp(this.atmosphere.night, night * 0.72);
    this.atmosphere.fog
      .copy(this.atmosphere.sky)
      .lerp(this.atmosphere.night, night * 0.2);
    this.atmosphere.sun
      .copy(this.atmosphere.sunDay)
      .lerp(this.atmosphere.sunWarm, Math.min(1, dusk * 0.7));
    this.scene.background.copy(this.atmosphere.sky);
    this.scene.fog.color.copy(this.atmosphere.fog);
    const angle = cycle * Math.PI * 2 - Math.PI * 0.42;
    this.sun.position.set(
      Math.cos(angle) * 32,
      9 + sunHeight * 39,
      Math.sin(angle) * 32,
    );
    this.sun.color.copy(this.atmosphere.sun);
    this.sun.intensity = 0.62 + sunHeight * 2.12;
    this.hemi.intensity = 0.82 + sunHeight * 0.82;
  }
  route(w, x, z, ignore = null, ignoreDecor = null) {
    const sx = Math.round(w.m.position.x),
      sz = Math.round(w.m.position.z),
      tx = Math.round(x),
      tz = Math.round(z);
    w.routeTarget = { x: tx, z: tz };
    const start = routeKey(sx, sz),
      goal = routeKey(tx, tz);
    const blockedCache = new Map();
    const congestionCache = new Map();
    const travelCostCache = new Map();
    const routeBlockedAt = (x, z) => {
      const key = routeKey(x, z);
      if (!blockedCache.has(key))
        blockedCache.set(key, this.routeBlocked(x, z, ignore, ignoreDecor));
      return blockedCache.get(key);
    };
    const congestionAt = (x, z) => {
      const key = routeKey(x, z);
      if (!congestionCache.has(key))
        congestionCache.set(key, this.workerCongestion(x, z, w));
      return congestionCache.get(key);
    };
    const travelCostAt = (x, z) => {
      const key = routeKey(x, z);
      if (!travelCostCache.has(key))
        travelCostCache.set(
          key,
          travelStepCost(this.roads.has(`${x},${z}`)),
        );
      return travelCostCache.get(key);
    };
    const queue = [],
      costs = new Map([[start, 0]]),
      parents = new Map([[start, null]]);
    pushPriority(queue, [0, sx, sz]);
    let found = false;
    for (let q = 0; queue.length && q < 4200; q++) {
      const [cost, cx, cz] = popPriority(queue);
      const current = routeKey(cx, cz);
      if (cost > (costs.get(current) ?? Infinity)) continue;
      if (cx === tx && cz === tz) {
        found = true;
        break;
      }
      for (const [dx, dz] of ROUTE_DIRECTIONS) {
        const nx = cx + dx,
          nz = cz + dz,
          k = routeKey(nx, nz);
        if (
          nx < -30 ||
          nz < -30 ||
          nz > 30 ||
          nx > riverX(nz) - 0.6 ||
          routeBlockedAt(nx, nz)
        )
          continue;
        // Other workers are temporary congestion, not walls. The route remains
        // valid through a crowd, but A* prefers an open lane when one exists.
        const stepCost = travelCostAt(nx, nz) + congestionAt(nx, nz);
        const nextCost = cost + stepCost;
        if (nextCost >= (costs.get(k) ?? Infinity)) continue;
        costs.set(k, nextCost);
        parents.set(k, current);
        pushPriority(queue, [nextCost, nx, nz]);
      }
    }
    w.path = [];
    if (found) {
      const path = [];
      let k = goal;
      while (k !== start) {
        const px = Math.floor(k / ROUTE_KEY_WIDTH) - ROUTE_KEY_OFFSET;
        const pz = (k % ROUTE_KEY_WIDTH) - ROUTE_KEY_OFFSET;
        path.push(new THREE.Vector3(px, 0, pz));
        k = parents.get(k);
      }
      w.path = path.reverse();
    }
    return found;
  }
  jobPoint(b, worker = null) {
    const n = Math.ceil((CATALOG[b.type]?.size || 4) / 2 + 0.5);
    let fallback = null;
    let best = null;
    let bestScore = Infinity;
    const score = (x, z) =>
      (this.workerPositionBlocked(x, z, worker) ? 100 : 0) +
      (this.workerTargetBlocked(x, z, worker) ? 25 : 0) +
      this.workerCongestion(x, z, worker) * 4 +
      (worker?.m?.position
        ? Math.hypot(x - worker.m.position.x, z - worker.m.position.z) * 0.02
        : 0);
    const consider = (x, z) => {
      if (!fallback) fallback = [x, z];
      if (this.routeBlocked(x, z) || x >= riverX(z) - 0.5) return;
      const candidateScore = score(x, z);
      // Strictly less preserves the old stable-sort tie order.
      if (candidateScore < bestScore) {
        best = [x, z];
        bestScore = candidateScore;
      }
    };
    consider(b.x, b.z + n);
    consider(b.x - n, b.z);
    consider(b.x + n, b.z);
    consider(b.x, b.z - n);
    for (let offset = 1; offset < n; offset++) {
      consider(b.x - offset, b.z + n);
      consider(b.x - n, b.z + offset);
      consider(b.x + n, b.z - offset);
      consider(b.x + offset, b.z - n);
    }
    return best || fallback;
  }
  workerRouteIgnore(worker) {
    // A worker fetching goods from a Storehouse steps into its footprint
    // while `building` still points at the construction site they are
    // hauling for, so that takes priority over the usual workInside check.
    if (worker?.doorBuilding) return worker.doorBuilding;
    return worker?.workInside ? worker.building || null : worker?.field || null;
  }
  setWorkerInside(worker, inside) {
    if (!worker) return;
    worker.insideBuilding = Boolean(inside);
    if (!inside && worker.workEffect?.visible) worker.workEffect.visible = false;
    const openBuilding =
      inside && ["bakery", "inn", "vineyard"].includes(worker.building?.type);
    if (worker.m) {
      worker.m.visible = !inside || openBuilding;
      if (inside && worker.building?.type === "bakery") {
        // Keep the baker in the open prep area instead of hiding them at the
        // building origin behind the roof and shell.
        worker.m.position.set(worker.building.x + 0.25, 0, worker.building.z - 0.42);
      }
      if (inside && worker.building?.type === "vineyard") {
        // Stand the vintner beside the treading vat in the open bay so the
        // wine cycle stays visible from the street.
        const [x, z] = this.vineyardTreadingPoint(worker.building);
        worker.m.position.set(x, 0, z);
        worker.m.rotation.y =
          (worker.building.rotation || 0) + Math.atan2(0.62, -0.4);
      }
    }
    worker.shadowVisible = !inside || openBuilding;
    this.updateWorkerShadow(worker);
  }
  createWorkerShadowField() {
    if (!this.scene?.add) return null;
    const mesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.3, 16),
      new THREE.MeshBasicMaterial({
        color: "#43552e",
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
      MAX_POPULATION,
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 1;
    // Instances move with villagers, so a static bounding sphere can cull the
    // field after the first frame. There are only 24 possible instances; the
    // explicit no-cull path is cheaper and safer than recomputing that sphere.
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    dummy.scale.set(0, 0, 0);
    this.scene.add(mesh);
    return { mesh, dummy, dirty: false };
  }
  updateWorkerShadow(worker, squash = 1) {
    const field = this.workerShadowField;
    if (
      field?.mesh &&
      worker?.m?.position &&
      Number.isInteger(worker.shadowIndex)
    ) {
      const visible = worker.shadowVisible !== false;
      field.dummy.position.set(
        worker.m.position.x,
        visible ? 0.006 : -0.01,
        worker.m.position.z,
      );
      field.dummy.scale.set(
        visible ? squash : 0,
        visible ? 0.58 * squash : 0,
        visible ? 1 : 0,
      );
      field.dummy.updateMatrix();
      field.mesh.setMatrixAt(worker.shadowIndex, field.dummy.matrix);
      field.dirty = true;
      return true;
    }
    if (worker?.contactShadow) {
      worker.contactShadow.visible = worker.shadowVisible !== false;
      worker.contactShadow.position.set(worker.m.position.x, 0.006, worker.m.position.z);
      worker.contactShadow.scale.set(squash, 0.58 * squash, 1);
      return true;
    }
    return false;
  }
  createWorkEffect(type) {
    const group = new THREE.Group();
    group.renderOrder = 8;
    const part = (geometry, color) => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.86,
          flatShading: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      mesh.renderOrder = 8;
      group.add(mesh);
      return mesh;
    };
    if (type === "farm") {
      const action = new THREE.Group();
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.34, 0.035),
        new THREE.MeshStandardMaterial({ color: "#70452b", roughness: 0.9, flatShading: true, depthTest: false, depthWrite: false }),
      );
      const blade = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.018, 5, 12, Math.PI * 0.82),
        new THREE.MeshStandardMaterial({ color: "#d7d4bd", roughness: 0.76, flatShading: true, depthTest: false, depthWrite: false }),
      );
      handle.position.y = -0.15;
      blade.position.set(0.055, 0.02, 0);
      blade.rotation.z = -0.45;
      action.add(handle, blade);
      action.position.set(0.15, 1.48, -0.05);
      group.add(action);
      const grain = new THREE.Group();
      for (const x of [-0.18, 0, 0.18]) {
        const stalk = part(new THREE.BoxGeometry(0.025, 0.28, 0.025), "#e2bf54");
        stalk.position.set(x, 1.05 + Math.abs(x) * 0.25, 0.02);
        stalk.rotation.z = x * 0.8;
        grain.add(stalk);
      }
      group.add(grain);
      group.userData = { type, action, grain };
    } else {
      const action = new THREE.Group();
      const pin = part(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8), "#d9a66d");
      pin.rotation.z = Math.PI / 2;
      pin.position.set(0, 1.28, -0.05);
      action.add(pin);
      const bread = part(new THREE.SphereGeometry(0.11, 8, 5), "#d7924b");
      bread.scale.set(1.25, 0.55, 0.8);
      bread.position.set(0.08, 1.56, -0.05);
      action.add(bread);
      const flour = new THREE.Group();
      for (const [x, y, z] of [[-0.12, 1.72, 0], [0, 1.84, -0.03], [0.12, 1.7, 0.02]]) {
        const puff = part(new THREE.SphereGeometry(0.055, 7, 5), "#fff1bd");
        puff.position.set(x, y, z);
        flour.add(puff);
      }
      group.add(action, flour);
      group.userData = { type: "bakery", action, flour };
    }
    group.visible = false;
    this.scene.add(group);
    return group;
  }
  updateWorkerWorkEffect(worker, time, motion = 1) {
    const active =
      worker?.insideBuilding &&
      worker.building &&
      (worker.phase === "harvest" || worker.phase === "work") &&
      WORK_EFFECT_BUILDINGS.has(worker.building.type);
    if (!active) {
      if (worker?.workEffect?.visible) worker.workEffect.visible = false;
      return;
    }
    const effectType = worker.building.type === "farm" ? "farm" : "bakery";
    const effectMatches =
      worker.workEffect?.userData.type === effectType;
    if (!effectMatches) {
      this.disposeOwnedObject(worker.workEffect);
      worker.workEffect = this.createWorkEffect(worker.building.type === "farm" ? "farm" : "bakery");
    }
    const effect = worker.workEffect;
    // Keep the bakery work vignette on the prep table so it remains readable
    // through the open side instead of floating behind the roof.
    effect.position.set(
      worker.building.x + (effect.userData.type === "bakery" ? 0.25 : 0),
      effect.userData.type === "bakery" ? 0.12 : 1.1,
      worker.building.z + (effect.userData.type === "bakery" ? -0.52 : 0),
    );
    effect.visible = true;
    if (!motion) {
      if (effect.userData.type === "farm") {
        effect.userData.action.rotation.z = -0.42;
        effect.userData.grain.rotation.z = 0;
      } else {
        effect.userData.action.rotation.z = 0;
        effect.userData.flour.position.y = 0;
        effect.userData.flour.rotation.y = 0;
      }
      return;
    }
    if (effect.userData.type === "farm") {
      const swing = Math.sin(time * 6.5 + (worker.walkPhase || 0));
      effect.userData.action.rotation.z = -0.42 + swing * 0.62;
      effect.userData.grain.rotation.z = swing * 0.08;
    } else {
      const roll = Math.sin(time * 5.5 + (worker.walkPhase || 0));
      effect.userData.action.rotation.z = roll * 0.28;
      effect.userData.flour.position.y = Math.max(0, roll) * 0.08;
      if (motion) effect.userData.flour.rotation.y = time * 0.7;
    }
  }
  nextConstructionMaterial(building) {
    return Object.entries(CATALOG[building?.type]?.cost || {}).find(
      ([resource, required]) =>
        finiteNumber(building?.materials?.[resource], 0) < required,
    )?.[0] || null;
  }
  materialSource(resource) {
    const sourceType = {
      wood: "lumberyard",
      stone: "mine",
      food: "farm",
    }[resource];
    // A finished Storehouse is where the village keeps its goods, so a
    // builder fetches materials there when one exists rather than walking
    // straight to the producer.
    return (
      this.buildings.find(
        (building) => building.type === "storehouse" && building.progress === 1,
      ) ||
      this.buildings.find(
        (building) =>
          building.type === sourceType && building.progress === 1,
      ) ||
      this.buildings.find(
        (building) => building.type === "townhall" && building.progress === 1,
      )
    );
  }
  // Blender's negative-Y frontage becomes positive Z in the exported GLB;
  // the Storehouse's archway sits just inside that face.
  storehouseDoorPoint(building) {
    const local = new THREE.Vector3(0, 0, 0.78);
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), building?.rotation || 0);
    return [(building?.x || 0) + local.x, (building?.z || 0) + local.z];
  }
  completedInns() {
    return this.buildings.filter(
      (building) =>
        building.type === "inn" && building.progress === 1,
    );
  }
  completedInnCount() {
    let count = 0;
    for (const building of this.buildings)
      if (building.type === "inn" && building.progress === 1)
        count++;
    return count;
  }
  innSeatPoint(inn, seat = 0) {
    // Blender's negative-Y frontage becomes positive Z in the exported GLB.
    const local = new THREE.Vector3([-1.05, 0, 1.05][seat] || 0, 0, 1.98);
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), inn.rotation || 0);
    return [inn.x + local.x, inn.z + local.z];
  }
  vineyardTreadingPoint(vineyard) {
    // Blender's negative-Y frontage becomes positive Z in the exported GLB,
    // so the open bay beside the vat sits at local (-1.36, +1.0).
    const local = new THREE.Vector3(-1.36, 0, 1);
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), vineyard?.rotation || 0);
    return [(vineyard?.x || 0) + local.x, (vineyard?.z || 0) + local.z];
  }
  availableInnFor(worker) {
    const origin = worker?.m?.position;
    if (!origin) return undefined;
    let best = null;
    let bestDistance = Infinity;
    for (const inn of this.buildings) {
      if (inn.type !== "inn" || inn.progress !== 1) continue;
      let reservedSeats = 0;
      let incomingDiners = 0;
      for (const candidate of this.workers) {
        if (
          candidate === worker ||
          candidate.building !== inn ||
          (candidate.phase !== "eat_travel" && candidate.phase !== "eat")
        )
          continue;
        const seat = candidate.mealSeat;
        if (Number.isInteger(seat) && seat >= 0 && seat < INN_SEATS)
          reservedSeats |= 1 << seat;
        if (candidate.phase === "eat_travel") incomingDiners += 1;
      }
      let seat = null;
      for (let index = 0; index < INN_SEATS; index++) {
        if (!(reservedSeats & (1 << index))) {
          seat = index;
          break;
        }
      }
      if (seat == null) continue;
      // Only reservations headed to this Inn consume its available bread.
      // Counting every incoming diner globally made a well-stocked Inn look
      // empty whenever another Inn had a meal on the way.
      const availableBread = Math.min(
        Math.max(0, finiteNumber(inn.breadStock, 0)) - incomingDiners,
        Math.max(0, finiteNumber(this.resources.food, 0)) - incomingDiners,
      );
      if (availableBread <= 0) continue;
      const distance = Math.hypot(origin.x - inn.x, origin.z - inn.z);
      if (distance < bestDistance) {
        best = { inn, seat, availableBread };
        bestDistance = distance;
      }
    }
    return best || undefined;
  }
  // ---- building stores -------------------------------------------------
  storedAt(building) {
    return Math.max(0, Math.floor(finiteNumber(building?.stock, 0)));
  }
  stockSpace(building) {
    const cap = outputCapForBuilding(building?.type);
    if (!cap) return Infinity;
    return Math.max(0, cap - this.storedAt(building));
  }
  depositStock(building, amount) {
    const wanted = Math.max(0, Math.floor(finiteNumber(amount, 0)));
    const accepted = Math.min(wanted, this.stockSpace(building));
    if (!Number.isFinite(accepted) || accepted <= 0) return 0;
    building.stock = this.storedAt(building) + accepted;
    return accepted;
  }
  // ---- village stores --------------------------------------------------
  stores() {
    return this.buildings.filter(
      (building) => building.progress === 1 && isStoreBuilding(building.type),
    );
  }
  storageCapacity() {
    let capacity = 0;
    for (const building of this.buildings)
      if (building.progress === 1 && isStoreBuilding(building.type))
        capacity += storageForBuilding(building.type);
    return capacity;
  }
  // An Inn's pantry is real food storage, so it counts toward the food
  // ceiling on top of the stores. Everything else is stores only.
  capacityFor(resource) {
    const base = this.storageCapacity();
    if (resource !== "food") return base;
    const pantry = Math.max(0, finiteNumber(CATALOG.inn?.breadCap, 0));
    return base + this.completedInnCount() * pantry;
  }
  storageCapacities() {
    const base = this.storageCapacity();
    const pantry = Math.max(0, finiteNumber(CATALOG.inn?.breadCap, 0));
    const food = base + this.completedInnCount() * pantry;
    return Object.keys(this.resources).reduce((map, resource) => {
      map[resource] = resource === "food" ? food : base;
      return map;
    }, {});
  }
  resourceAmount(resource) {
    return Math.max(0, finiteNumber(this.resources?.[resource], 0));
  }
  spendResource(resource, amount) {
    const wanted = Math.max(0, Math.floor(finiteNumber(amount, 0)));
    if (!wanted) return 0;
    this.resources ||= {};
    const available = this.resourceAmount(resource);
    const spent = Math.min(wanted, available);
    this.resources[resource] = available - spent;
    return spent;
  }
  storageSpace(resource) {
    if (!resource) return 0;
    return Math.max(
      0,
      this.capacityFor(resource) -
        this.resourceAmount(resource),
    );
  }
  ensureStarterVillage() {
    if (this.buildings.some((building) => building.type === "townhall")) return false;
    STARTER_BUILDINGS.forEach(([type, x, z]) => this.addBuilding(type, x, z, 0, 1));
    return true;
  }
  refundResource(resource, amount) {
    const wanted = Math.max(0, Math.floor(finiteNumber(amount, 0)));
    if (!wanted) return 0;
    const current = Math.max(0, finiteNumber(this.resources[resource], 0));
    const accepted = Math.min(wanted, this.storageSpace(resource));
    this.resources[resource] = current + accepted;
    return accepted;
  }
  // Storage can shrink when a store is demolished or a save is restored with
  // fewer stores than it was written with, so the pool is trimmed to fit.
  clampResourcesToStorage() {
    let spilled = 0;
    for (const key of Object.keys(this.resources)) {
      const capacity = this.capacityFor(key);
      const held = Math.max(0, finiteNumber(this.resources[key], 0));
      if (held <= capacity) {
        this.resources[key] = held;
        continue;
      }
      spilled += held - capacity;
      this.resources[key] = capacity;
    }
    this.clampFoodPantries();
    return spilled;
  }
  clampFoodPantries() {
    let remainingFood = Math.max(0, finiteNumber(this.resources.food, 0));
    const breadCap = Math.max(0, finiteNumber(CATALOG.inn?.breadCap, 0));
    for (const inn of this.buildings) {
      if (inn.type !== "inn") continue;
      inn.breadStock = Math.min(
        Math.max(0, finiteNumber(inn.breadStock, 0)),
        breadCap,
        remainingFood,
      );
      remainingFood -= inn.breadStock;
    }
  }
  consumeFood(amount) {
    const wanted = Math.max(0, Math.floor(finiteNumber(amount, 0)));
    const spent = this.spendResource("food", wanted);
    if (spent > 0) this.clampFoodPantries();
    return spent;
  }
  innBreadSpace(inn) {
    const cap = Math.max(0, finiteNumber(CATALOG.inn?.breadCap, 0));
    return Math.max(0, cap - Math.max(0, finiteNumber(inn?.breadStock, 0)));
  }
  validHaulTarget(target, resource) {
    if (!target || target.progress !== 1 || !this.buildings.includes(target))
      return null;
    if (this.storageSpace(resource) <= 0) return null;
    if (target.type === "inn")
      return resource === "food" && this.innBreadSpace(target) > 0 ? target : null;
    return isStoreBuilding(target.type) ? target : null;
  }
  // Bread feeds the canteen first; the overflow goes into a store.
  haulDestination(worker, resource) {
    if (!resource || this.storageSpace(resource) <= 0) return null;
    const origin = worker?.m?.position || { x: 0, z: 0 };
    if (resource === "food") {
      let inn = null;
      let innDistance = Infinity;
      for (const candidate of this.buildings) {
        if (
          candidate.type !== "inn" ||
          candidate.progress !== 1 ||
          this.innBreadSpace(candidate) <= 0
        )
          continue;
        const distance = Math.hypot(
          origin.x - candidate.x,
          origin.z - candidate.z,
        );
        if (distance < innDistance) {
          inn = candidate;
          innDistance = distance;
        }
      }
      if (inn) return inn;
    }
    let store = null;
    let storeDistance = Infinity;
    for (const candidate of this.buildings) {
      if (candidate.progress !== 1 || !isStoreBuilding(candidate.type)) continue;
      const distance = Math.hypot(
        origin.x - candidate.x,
        origin.z - candidate.z,
      );
      if (distance < storeDistance) {
        store = candidate;
        storeDistance = distance;
      }
    }
    return store;
  }
  storeResource(target, resource, amount) {
    const wanted = Math.max(0, Math.floor(finiteNumber(amount, 0)));
    let accepted = Math.min(wanted, this.storageSpace(resource));
    if (target?.type === "inn")
      accepted = Math.min(accepted, this.innBreadSpace(target));
    if (accepted <= 0) return 0;
    if (target?.type === "inn")
      target.breadStock = Math.max(0, finiteNumber(target.breadStock, 0)) + accepted;
    this.resources[resource] = this.resourceAmount(resource) + accepted;
    this.delivered ||= {};
    this.delivered[resource] =
      Math.max(0, finiteNumber(this.delivered[resource], 0)) + accepted;
    if (resource === "wood")
      this.gathered = Math.max(0, finiteNumber(this.gathered, 0)) + accepted;
    return accepted;
  }
  releaseHaul(worker) {
    this.clearCarry(worker);
    worker.carry = null;
    worker.haulSource = null;
    worker.haulTarget = null;
    worker.routeTarget = null;
    worker.deliveryRetry = 0;
    worker.workDuration = 0;
    worker.workInside = false;
    this.setWorkerInside(worker, false);
    worker.building = null;
    worker.phase = "idle";
    worker.timer = 0;
    worker.waitingForSpace = false;
    worker.waitingFor = null;
    worker.spaceWait = 0;
    worker.forcedYield = null;
    worker.avoidanceTarget = null;
    worker.avoidanceTime = 0;
    worker.deadlockLeaderTime = 0;
    worker.deadlockYieldTime = 0;
    worker.deadlockYieldTo = null;
    worker.waitingForInput = false;
    worker.waitingForStock = false;
    worker.waitingForInn = false;
    worker.mealSeat = null;
  }
  // A haul job is a building with goods waiting and a store that can take
  // them. Fullest building first, then nearest, so nothing stays blocked.
  tryAssignHaul(worker) {
    const claimed = new Set();
    for (const candidate of this.workers) {
      if (candidate !== worker && candidate.haulSource)
        claimed.add(candidate.haulSource);
    }
    const destinationCache = new Map();
    const destinationFor = (resource) => {
      if (!destinationCache.has(resource))
        destinationCache.set(resource, this.haulDestination(worker, resource));
      return destinationCache.get(resource);
    };
    const sourceMetrics = new Map();
    const metricsFor = (building) => {
      let metrics = sourceMetrics.get(building);
      if (!metrics) {
        const stored = this.storedAt(building);
        metrics = {
          stored,
          fullness: stored / Math.max(1, outputCapForBuilding(building.type)),
          distance: Math.hypot(
            worker.m.position.x - building.x,
            worker.m.position.z - building.z,
          ),
        };
        sourceMetrics.set(building, metrics);
      }
      return metrics;
    };
    const sources = this.buildings
      .filter(
        (building) => {
          if (building.progress !== 1 || claimed.has(building)) return false;
          const metrics = metricsFor(building);
          return metrics.stored > 0 &&
            destinationFor(CATALOG[building.type]?.resource);
        },
      )
      .sort(
        (a, b) => {
          const first = metricsFor(a);
          const second = metricsFor(b);
          return second.fullness - first.fullness || first.distance - second.distance;
        },
      );
    for (const source of sources) {
      const [sx, sz] = this.jobPoint(source, worker);
      if (!this.route(worker, sx, sz, source)) {
        source.lastRouteBlocked = true;
        continue;
      }
      source.lastRouteBlocked = false;
      worker.haulSource = source;
      worker.haulTarget = null;
      worker.announcedFullStores = false;
      worker.deliveryRetry = 0;
      worker.phase = "haul_pickup";
      worker.waitingForSpace = false;
      this.setWorkerType(worker, WORKER_TYPES.CARRIER);
      return true;
    }
    return false;
  }
  assign(w) {
    if (!WORKER_TYPE_LABELS[w.workerType])
      this.setWorkerType(w, WORKER_TYPES.BUILDER);
    // Assignment is the boundary between jobs. A worker may arrive here from
    // a failed route or a completed cycle with stale navigation metadata;
    // clear it before choosing the next destination so the old job cannot
    // influence the new one.
    w.path = [];
    w.routeTarget = null;
    w.repathCooldown = 0;
    w.workDuration = 0;
    w.materialResource = null;
    w.materialSourceBuilding = null;
    w.pickupSource = null;
    w.doorBuilding = null;
    w.announcedFullStores = false;
    w.workInside = false;
    this.setWorkerInside(w, false);
    if (!w.m.visible) {
      w.m.visible = true;
      w.shadowVisible = true;
      this.updateWorkerShadow(w);
    }
    w.waitingForSpace = false;
    w.waitingFor = null;
    w.spaceWait = 0;
    w.forcedYield = null;
    w.avoidanceTarget = null;
    w.avoidanceTime = 0;
    w.mealSeat = null;
    w.waitingForInn = false;
    w.waitingForInput = false;
    w.waitingForStock = false;
    w.deliveryRetry = 0;
    const hunger = Math.max(0, Math.min(1, finiteNumber(w.hunger, 0)));
    if (hunger >= HUNGRY_THRESHOLD) {
      const meal = this.availableInnFor(w);
      if (meal) {
        const [x, z] = this.innSeatPoint(meal.inn, meal.seat);
        w.workInside = true;
        if (this.route(w, x, z, meal.inn)) {
          w.building = meal.inn;
          w.mealSeat = meal.seat;
          w.phase = "eat_travel";
          w.timer = 0;
          return;
        }
        w.workInside = false;
        meal.inn.lastRouteBlocked = true;
      }
    }
    // Assignment compares the same worksite many times while sorting. Count
    // current occupants once so a larger village does not repeatedly scan all
    // workers for every candidate building.
    const workerLoads = new Map();
    const occupiedBuildings = new Set();
    for (const worker of this.workers) {
      if (worker === w) continue;
      if (worker.building) {
        occupiedBuildings.add(worker.building);
        workerLoads.set(
          worker.building,
          (workerLoads.get(worker.building) || 0) + 1,
        );
      }
      if (worker.field && worker.field !== worker.building) {
        workerLoads.set(
          worker.field,
          (workerLoads.get(worker.field) || 0) + 1,
        );
      }
    }
    const workerLoad = (building) => workerLoads.get(building) || 0;
    // Farm connectivity is a small graph walk and job ranking asks for the
    // same ripe plots again during selection. Cache it for this assignment;
    // claims are only mutated after a job is chosen.
    const readyFieldsCache = new Map();
    const readyFieldsFor = (building) => {
      if (building?.type !== "farm") return [];
      if (!readyFieldsCache.has(building))
        readyFieldsCache.set(building, this.readyGrainFields(building));
      return readyFieldsCache.get(building);
    };
    const nearestFieldCache = new Map();
    const nearestReadyField = (building) => {
      if (nearestFieldCache.has(building)) return nearestFieldCache.get(building);
      let nearest = null;
      let nearestDistance = Infinity;
      for (const field of readyFieldsFor(building)) {
        const distance = Math.hypot(
          w.m.position.x - field.x,
          w.m.position.z - field.z,
        );
        if (distance < nearestDistance) {
          nearest = field;
          nearestDistance = distance;
        }
      }
      nearestFieldCache.set(building, nearest);
      return nearest;
    };
    const distanceCache = new Map();
    const distanceToJob = (building) => {
      if (distanceCache.has(building)) return distanceCache.get(building);
      const ripeField = building.type === "farm" ? nearestReadyField(building) : null;
      const [x, z] = ripeField
        ? [ripeField.x, ripeField.z]
        : this.jobPoint(building, w);
      const distance = Math.hypot(w.m.position.x - x, w.m.position.z - z);
      distanceCache.set(building, distance);
      return distance;
    };
    const compareJobs = (a, b) =>
      workerLoad(a) - workerLoad(b) ||
      distanceToJob(a) - distanceToJob(b);
    const construction = this.buildings
      .filter(
        (b) =>
          b.progress < 1 &&
          !occupiedBuildings.has(b),
      )
      .sort(compareJobs);
    const sites = this.buildings.filter(
      (b) =>
        b.progress === 1 &&
        CATALOG[b.type]?.resource &&
        workerTypeForBuilding(b.type) &&
        workerLoad(b) < workerCapacityForBuilding(b.type) &&
        // A building whose own store is full stops taking workers until a
        // carrier has cleared it.
        this.stockSpace(b) > 0 &&
        (b.type !== "farm" || readyFieldsFor(b).length > 0),
    );
    const employedSites = sites
      .filter((building) => workerTypeForBuilding(building.type) === w.workerType)
      .sort(compareJobs);
    const forestTrees = (this.decor || []).filter((decor) => decor.type === "tree");
    const tryJobs = (list) => {
      for (const b of list) {
        const productionType = workerTypeForBuilding(b.type);
        if (
          b.progress === 1 &&
          (!productionType ||
            workerLoad(b) >= workerCapacityForBuilding(b.type) ||
            (w.workerType !== WORKER_TYPES.BUILDER && productionType !== w.workerType))
        )
          continue;
        const material = b.progress < 1 ? this.nextConstructionMaterial(b) : null;
        // Nothing to haul yet: leave the site waiting rather than sending a
        // worker to fetch a resource the village hasn't gathered.
        if (material && this.resourceAmount(material) <= 0) {
          b.lastRouteBlocked = true;
          continue;
        }
        const tree = !material && b.type === "lumberyard" && forestTrees.length
          ? this.availableTreeFor(b, w)
          : null;
        const destination = material ? this.materialSource(material) : b;
        if (!material && b.type === "lumberyard" && forestTrees.length && !tree) {
          b.lastRouteBlocked = false;
          continue;
        }
        if (!destination) {
          b.lastRouteBlocked = true;
          continue;
        }
        const field = !material && b.type === "farm" ? nearestReadyField(b) : null;
        // Farmers work at the actual grain plot so the player can see them
        // cutting the crop. Processing buildings keep their indoor work loop.
        const workInside =
          !material && ["bakery", "windmill", "vineyard"].includes(b.type);
        w.workInside = workInside;
        const [x, z] = tree
          ? [tree.x, tree.z]
          : workInside
            ? [b.x, b.z]
            : field
            ? [field.x, field.z]
            : this.jobPoint(destination, w);
        if (!this.route(w, x, z, workInside ? b : field, tree)) {
          w.workInside = false;
          b.lastRouteBlocked = true;
          continue;
        }
        b.lastRouteBlocked = false;
        w.building = b;
        w.field = field || null;
        w.tree = tree || null;
        if (field) field.claimedBy = w.id;
        if (tree) tree.claimedBy = w.id;
        w.materialResource = material;
        w.materialSourceBuilding =
          material && destination?.type === "storehouse" ? destination : null;
        this.setWorkerType(
          w,
          material || b.progress < 1
            ? WORKER_TYPES.BUILDER
            : productionType || WORKER_TYPES.BUILDER,
        );
        w.phase = material ? "material_pickup" : "travel";
        w.waitingForSpace = false;
        return true;
      }
      return false;
    };
    // Carriers look for a haul first. Builders build, then haul, then fall
    // back to production; a trade works its own post before anything else.
    const isCarrier = w.workerType === WORKER_TYPES.CARRIER;
    if (isCarrier && this.tryAssignHaul(w)) return;
    if (w.workerType === WORKER_TYPES.BUILDER) {
      if (tryJobs(construction)) return;
      if (this.tryAssignHaul(w)) return;
      if (tryJobs(sites.sort(compareJobs))) return;
    } else {
      if (tryJobs(employedSites)) return;
      if (tryJobs(construction)) return;
      if (!isCarrier && this.tryAssignHaul(w)) return;
    }
    const candidates = isCarrier ? construction : [...employedSites, ...construction];
    const well = this.buildings.find(
      (building) => building.type === "well" && building.progress === 1,
    );
    const wellVisitors = this.workers.filter(
      (worker) =>
        worker !== w &&
        worker.building === well &&
        (worker.phase === "visit" || worker.phase === "travel"),
    ).length;
    if (well && wellVisitors < 4 && this.route(w, ...this.jobPoint(well, w))) {
      w.building = well;
      w.phase = "visit";
      w.timer = 3.5;
      w.waitingForSpace = false;
      return;
    }
    w.phase = "idle";
    w.building = null;
    w.workInside = false;
    this.setWorkerInside(w, false);
    // A villager trained at the School keeps their trade between jobs, which
    // also gives them first claim on that work in the next assignment pass.
    this.setWorkerType(w, w.trainedType || WORKER_TYPES.BUILDER);
    w.waitingForSpace = false;
    w.timer = candidates.length ? 2 : 0;
  }
  workerHasRightOfWay(worker, blocker) {
    const workerWait = worker.spaceWait || 0;
    const blockerWait = blocker.spaceWait || 0;
    if (Math.abs(workerWait - blockerWait) > 0.35)
      return workerWait > blockerWait;
    return this.workerPriority(worker) < this.workerPriority(blocker);
  }
  workerMoveBlocker(worker, candidate) {
    return this.workers.find(
      (other) =>
        other !== worker &&
        other.m?.position &&
        candidate.distanceToSquared(other.m.position) < WORKER_CLEARANCE_SQUARED,
    );
  }
  workerMotionVectors(worker) {
    return (worker.motionVectors ||= {
      delta: new THREE.Vector3(),
      avoidanceDelta: new THREE.Vector3(),
      candidate: new THREE.Vector3(),
      lane: new THREE.Vector3(),
      probe: new THREE.Vector3(),
    });
  }
  deadlockMotionVectors(worker) {
    return (worker.deadlockMotionVectors ||= {
      away: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      probe: new THREE.Vector3(),
      targets: Array.from({ length: DEADLOCK_RADII.length * DEADLOCK_TURNS.length }, () => new THREE.Vector3()),
      candidateSlots: Array.from(
        { length: DEADLOCK_RADII.length * DEADLOCK_TURNS.length },
        () => ({ target: null, score: 0 }),
      ),
      candidates: [],
    });
  }
  workerOnRoad(worker) {
    const position = worker?.m?.position;
    if (!position) return false;
    const x = Math.round(position.x);
    const z = Math.round(position.z);
    const revision = this.roadRevision || 0;
    if (
      worker.roadRevision !== revision ||
      worker.roadTileX !== x ||
      worker.roadTileZ !== z
    ) {
      worker.roadRevision = revision;
      worker.roadTileX = x;
      worker.roadTileZ = z;
      worker.onRoad = Boolean(this.roads?.has(`${x},${z}`));
    }
    return worker.onRoad === true;
  }
  workerCanStepTo(worker, candidate) {
    return (
      candidate.x >= -30 &&
      candidate.z >= -30 &&
      candidate.z <= 30 &&
      candidate.x <= riverX(candidate.z) - 0.6 &&
      !this.routeBlocked(
        candidate.x,
        candidate.z,
        this.workerRouteIgnore(worker),
        worker.tree || null,
      ) &&
      !this.workerMoveBlocker(worker, candidate)
    );
  }
  deadlockEscapeTarget(worker, clusterCenter) {
    const vectors = this.deadlockMotionVectors(worker);
    const away = vectors.away.copy(worker.m.position).sub(clusterCenter);
    away.y = 0;
    if (away.lengthSq() < 0.01) {
      const angle = (this.workerPriority(worker) * 2.399963229728653) % (Math.PI * 2);
      away.set(Math.cos(angle), 0, Math.sin(angle));
    } else away.normalize();
    const candidates = vectors.candidates;
    candidates.length = 0;
    let candidateIndex = 0;
    for (const radius of DEADLOCK_RADII) {
      for (const turn of DEADLOCK_TURNS) {
        const direction = vectors.direction.copy(away).applyAxisAngle(DEADLOCK_AXIS, turn);
        const target = vectors.targets[candidateIndex];
        target.copy(worker.m.position).addScaledVector(direction, radius);
        let clear = true;
        const samples = Math.ceil(radius / (WORKER_CLEARANCE * 0.35));
        for (let sample = 1; sample <= samples; sample++) {
          const probe = vectors.probe
            .copy(worker.m.position)
            .addScaledVector(direction, (radius * sample) / samples);
          if (!this.workerCanStepTo(worker, probe)) {
            clear = false;
            break;
          }
        }
        const slot = vectors.candidateSlots[candidateIndex++];
        if (!clear) continue;
        const congestion = this.workers.reduce(
          (score, other) =>
            other === worker
              ? score
              : score + Math.max(0, 2.5 - target.distanceTo(other.m.position)),
          0,
        );
        slot.target = target;
        slot.score = congestion + Math.abs(turn) * 0.2 - radius * 0.1;
        candidates.push(slot);
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0]?.target?.clone() || null;
  }
  resolveWorkerDeadlocks() {
    let stuck = null;
    for (const worker of this.workers) {
      if (
        worker.path?.length &&
        (worker.spaceWait || 0) >= WORKER_DEADLOCK_SECONDS &&
        !worker.deadlockYieldTime &&
        !worker.deadlockLeaderTime
      ) {
        (stuck ||= []).push(worker);
      }
    }
    if (!stuck || stuck.length < 2) return;
    const remaining = new Set(stuck);
    while (remaining.size) {
      const first = remaining.values().next().value;
      const cluster = [first];
      remaining.delete(first);
      for (let index = 0; index < cluster.length; index++) {
        const current = cluster[index];
        for (const candidate of [...remaining]) {
          if (current.m.position.distanceTo(candidate.m.position) <= WORKER_DEADLOCK_RADIUS) {
            cluster.push(candidate);
            remaining.delete(candidate);
          }
        }
      }
      if (cluster.length < 2) continue;
      const nearby = this.workers.filter((worker) =>
        cluster.some(
          (member) => member.m.position.distanceTo(worker.m.position) <= WORKER_DEADLOCK_RADIUS,
        ),
      );
      if (nearby.some((worker) => worker.deadlockLeaderTime > 0)) continue;
      const center = cluster
        .reduce((sum, worker) => sum.add(worker.m.position), new THREE.Vector3())
        .multiplyScalar(1 / cluster.length);
      const options = cluster
        .map((worker) => ({ worker, target: this.deadlockEscapeTarget(worker, center) }))
        .filter(({ target }) => target)
        .sort(
          (a, b) =>
            (b.worker.spaceWait || 0) - (a.worker.spaceWait || 0) ||
            this.workerPriority(a.worker) - this.workerPriority(b.worker),
        );
      if (!options.length) continue;
      const { worker: leader, target } = options[0];
      leader.avoidanceTarget ||= new THREE.Vector3();
      leader.avoidanceTarget.copy(target);
      leader.avoidanceTime = WORKER_DEADLOCK_YIELD_SECONDS;
      leader.deadlockLeaderTime = WORKER_DEADLOCK_YIELD_SECONDS;
      leader.deadlockYieldTime = 0;
      leader.deadlockYieldTo = null;
      leader.forcedYield = null;
      for (const worker of nearby) {
        if (worker === leader) continue;
        worker.deadlockYieldTime = WORKER_DEADLOCK_YIELD_SECONDS;
        worker.deadlockYieldTo = leader.id;
        worker.avoidanceTarget = null;
        worker.avoidanceTime = 0;
      }
    }
  }
  startAvoidance(worker, direction) {
    // Everyone prefers the same passing side, so a dense crossing circulates
    // instead of forming an alternating ring of workers yielding into one
    // another. The opposite side remains a fallback near walls and scenery.
    const { candidate, lane, probe } = this.workerMotionVectors(worker);
    for (const passingSide of PASSING_SIDES) {
      candidate.copy(worker.m.position);
      // Commit to a lateral lane before resuming the original route. Adding a
      // forward component here points the worker back into a head-on blocker
      // and recreates the frame-by-frame shiver this maneuver is meant to stop.
      candidate.x -= direction.z * passingSide * 1.05;
      candidate.z += direction.x * passingSide * 1.05;
      lane.copy(candidate).sub(worker.m.position).normalize();
      probe.copy(worker.m.position).addScaledVector(lane, 0.15);
      if (
        !this.workerCanStepTo(worker, probe) ||
        !this.workerCanStepTo(worker, candidate)
      )
        continue;
      worker.avoidanceTarget ||= new THREE.Vector3();
      worker.avoidanceTarget.copy(candidate);
      worker.avoidanceTime = WORKER_PASS_SECONDS;
      worker.forcedYield = null;
      return true;
    }
    return false;
  }
  followAvoidance(worker, step, dt) {
    if (!worker.avoidanceTarget) return false;
    worker.avoidanceTime = Math.max(0, (worker.avoidanceTime || 0) - dt);
    const { avoidanceDelta: delta, candidate } = this.workerMotionVectors(worker);
    delta.copy(worker.avoidanceTarget).sub(worker.m.position);
    delta.y = 0;
    const distance = delta.length();
    if (distance <= 0.04 || worker.avoidanceTime === 0) {
      worker.avoidanceTarget = null;
      worker.avoidanceTime = 0;
      return false;
    }
    const direction = delta.multiplyScalar(1 / distance);
    candidate.copy(worker.m.position).addScaledVector(direction, Math.min(distance, step));
    if (!this.workerCanStepTo(worker, candidate)) {
      worker.waitingForSpace = true;
      return true;
    }
    worker.m.position.copy(candidate);
    worker.m.rotation.y = Math.atan2(direction.x, direction.z);
    worker.waitingForSpace = false;
    worker.waitingFor = null;
    if (distance <= step) {
      worker.avoidanceTarget = null;
      worker.avoidanceTime = 0;
    }
    return true;
  }
  repathWorker(worker) {
    if (
      !worker.routeTarget ||
      worker.repathCooldown > 0 ||
      (worker.spaceWait || 0) < WORKER_REPATH_SECONDS
    )
      return false;
    const target = { ...worker.routeTarget };
    const previousPath = worker.path;
    const routed = this.route(
      worker,
      target.x,
      target.z,
      this.workerRouteIgnore(worker),
      worker.tree || null,
    );
    if (!routed) worker.path = previousPath;
    worker.routeTarget = target;
    worker.repathCooldown = 0.75;
    return routed;
  }
  moveWorker(w, dt) {
    if (!w.path?.length) return false;
    if ((w.deadlockYieldTime || 0) > 0) {
      w.waitingForSpace = true;
      w.waitingFor = w.deadlockYieldTo || null;
      return false;
    }
    const next = w.path[0];
    if (
      this.routeTargetBlocked(next, w) &&
      w.routeTarget &&
      !this.route(
        w,
        w.routeTarget.x,
        w.routeTarget.z,
        this.workerRouteIgnore(w),
        w.tree || null,
      )
    ) {
      w.path = [];
      if (
        CARRYING_PHASES.includes(w.phase)
      )
        w.deliveryRetry = 1.5;
      else {
        if (w.field) w.field.claimedBy = null;
        if (w.tree) this.releaseTree(w.tree);
        w.field = null;
        w.tree = null;
        w.phase = "idle";
        w.building = null;
        w.workInside = false;
        w.mealSeat = null;
        this.setWorkerInside(w, false);
        w.timer = 2;
        w.workDuration = 0;
        w.routeTarget = null;
        w.waitingForInput = false;
        w.waitingForStock = false;
        w.waitingForInn = false;
        w.deliveryRetry = 0;
        w.materialResource = null;
        w.materialSourceBuilding = null;
        w.pickupSource = null;
        w.doorBuilding = null;
        w.waitingForSpace = false;
        w.waitingFor = null;
        w.spaceWait = 0;
        w.forcedYield = null;
        w.avoidanceTarget = null;
        w.avoidanceTime = 0;
        w.deadlockLeaderTime = 0;
        w.deadlockYieldTime = 0;
        w.deadlockYieldTo = null;
      }
      return false;
    }
    const { delta, candidate } = this.workerMotionVectors(w);
    delta.set(
      next.x - w.m.position.x,
      0,
      next.z - w.m.position.z,
    );
    delta.y = 0;
    const distance = delta.length();
    if (!distance) {
      w.path.shift();
      w.waitingForSpace = false;
      return true;
    }
    const pace = travelSpeed(this.workerOnRoad(w));
    // The cap keeps a large simulation tick from jumping through a neighbour.
    const step = Math.min(dt * 1.5 * pace, WORKER_CLEARANCE * 0.62);
    if (this.followAvoidance(w, step, dt)) return true;
    const direction = delta.multiplyScalar(1 / distance);
    candidate.copy(w.m.position).addScaledVector(direction, Math.min(distance, step));
    const blocker = this.workerMoveBlocker(w, candidate);
    if (blocker) {
      w.spaceWait = (w.spaceWait || 0) + dt;
      w.waitingForSpace = true;
      w.waitingFor = blocker.id || null;
      const hasRightOfWay = this.workerHasRightOfWay(w, blocker);
      if (hasRightOfWay && blocker.path?.length) blocker.forcedYield = w.id;
      if (
        (!hasRightOfWay ||
          w.forcedYield ||
          !blocker.path?.length ||
          w.spaceWait >= WORKER_REPATH_SECONDS) &&
        this.startAvoidance(w, direction)
      ) {
        this.followAvoidance(w, step, dt);
        return true;
      }
      this.repathWorker(w);
      return false;
    }
    w.waitingForSpace = false;
    w.waitingFor = null;
    w.forcedYield = null;
    w.spaceWait = 0;
    if (distance <= step) {
      w.m.position.copy(next);
      w.path.shift();
    } else {
      w.m.position.copy(candidate);
      w.m.rotation.y = Math.atan2(delta.x, delta.z);
    }
    return true;
  }
  simulate(dt) {
    if (!this.delivered)
      this.delivered = { wood: 0, stone: 0, food: 0, wheat: 0, wine: 0 };
    if (!this.trends)
      this.trends = { wood: 0, stone: 0, food: 0, wheat: 0, wine: 0 };
    this.elapsed += dt;
    this.updateGrainFields();
    this.updateTrees();
    this.updateTraining(dt);
    if (this.activityTime > 0) {
      this.activityTime = Math.max(0, this.activityTime - dt);
      if (this.activityTime === 0) this.activity = "";
    }
    let shouldResolveDeadlocks = false;
    let hasMovementPressure = false;
    for (const w of this.workers) {
      w.hunger = Math.max(
        0,
        Math.min(
          1,
          finiteNumber(w.hunger, 0) + (w.phase === "eat" ? 0 : dt / HUNGER_SECONDS),
        ),
      );
      w.repathCooldown = Math.max(0, (w.repathCooldown || 0) - dt);
      w.deadlockLeaderTime = Math.max(0, (w.deadlockLeaderTime || 0) - dt);
      w.deadlockYieldTime = Math.max(0, (w.deadlockYieldTime || 0) - dt);
      if (!w.deadlockYieldTime) w.deadlockYieldTo = null;
      const spaceWait = w.spaceWait || 0;
      const deadlockLeaderTime = w.deadlockLeaderTime || 0;
      const deadlockYieldTime = w.deadlockYieldTime || 0;
      if (
        w.path?.length &&
        spaceWait >= WORKER_DEADLOCK_SECONDS &&
        !deadlockYieldTime &&
        !deadlockLeaderTime
      )
        shouldResolveDeadlocks = true;
      if (spaceWait > 0 || deadlockLeaderTime > 0 || deadlockYieldTime > 0)
        hasMovementPressure = true;
    }
    if (shouldResolveDeadlocks) this.resolveWorkerDeadlocks();
    // With no congestion, the stable worker array already matches the final
    // comparator tie-breaker. Avoid allocating and sorting a copy every frame.
    const movementOrder = hasMovementPressure
      ? [...this.workers].sort(
          (a, b) =>
            Number(Boolean(b.deadlockLeaderTime)) - Number(Boolean(a.deadlockLeaderTime)) ||
            (b.spaceWait || 0) - (a.spaceWait || 0) ||
            this.workerPriority(a) - this.workerPriority(b),
        )
      : this.workers;
    for (const w of movementOrder) {
      if (w.path.length) {
        this.moveWorker(w, dt);
        continue;
      }
      if (w.phase === "idle") {
        w.timer -= dt;
        if (w.timer <= 0) this.assign(w);
      } else if (w.phase === "material_pickup") {
        const storehouse = w.materialSourceBuilding;
        if (storehouse) {
          // The goods are kept behind the Storehouse door; walk up to it
          // before hauling anything out.
          w.materialSourceBuilding = null;
          w.pickupSource = storehouse;
          // Set before routing (not just on arrival) so a mid-walk repath via
          // workerRouteIgnore still treats the Storehouse footprint as open.
          w.doorBuilding = storehouse;
          w.phase = "storehouse_enter";
          const [doorX, doorZ] = this.storehouseDoorPoint(storehouse);
          w.deliveryRetry = this.route(w, doorX, doorZ, storehouse) ? 0 : 1.5;
          continue;
        }
        const b = w.building;
        const resource = w.materialResource || this.nextConstructionMaterial(b);
        const required = CATALOG[b?.type]?.cost?.[resource] || 0;
        const delivered = finiteNumber(b?.materials?.[resource], 0);
        const wanted = Math.min(10, Math.max(0, required - delivered));
        // Only take what the village actually has in stock; a partial load
        // still ships out so the site keeps inching toward ready.
        const amount = Math.min(wanted, this.resourceAmount(resource));
        if (!b || !resource || amount <= 0) {
          this.setWorkerInside(w, false);
          w.workInside = false;
          w.phase = "idle";
          w.building = null;
          w.materialResource = null;
          w.timer = 0.35;
          continue;
        }
        this.spendResource(resource, amount);
        w.carry = { resource, amount, construction: true };
        this.showCarry(w, resource);
        w.phase = "material_delivery";
        const [siteX, siteZ] = this.jobPoint(b, w);
        w.deliveryRetry = this.route(w, siteX, siteZ) ? 0 : 1.5;
      } else if (w.phase === "storehouse_enter") {
        const storehouse = w.pickupSource;
        if (!storehouse) {
          w.phase = "idle";
          w.building = null;
          w.materialResource = null;
          continue;
        }
        if (w.deliveryRetry > 0) {
          w.deliveryRetry -= dt;
          if (w.deliveryRetry <= 0) {
            const [doorX, doorZ] = this.storehouseDoorPoint(storehouse);
            w.deliveryRetry = this.route(w, doorX, doorZ, storehouse) ? 0 : 1.5;
          }
          continue;
        }
        // At the doorway. Step inside out of sight to gather the goods.
        w.doorBuilding = storehouse;
        w.m.visible = false;
        w.shadowVisible = false;
        this.updateWorkerShadow(w);
        w.phase = "storehouse_inside";
        w.workDuration = 0.6;
      } else if (w.phase === "storehouse_inside") {
        w.workDuration -= dt;
        if (w.workDuration > 0) continue;
        const storehouse = w.pickupSource;
        const b = w.building;
        const resource = w.materialResource || this.nextConstructionMaterial(b);
        const required = CATALOG[b?.type]?.cost?.[resource] || 0;
        const delivered = finiteNumber(b?.materials?.[resource], 0);
        const wanted = Math.min(10, Math.max(0, required - delivered));
        const amount = Math.min(wanted, this.resourceAmount(resource));
        w.m.visible = true;
        w.shadowVisible = true;
        this.updateWorkerShadow(w);
        if (!b || !resource || amount <= 0 || !storehouse) {
          w.doorBuilding = null;
          w.pickupSource = null;
          w.phase = "idle";
          w.building = null;
          w.materialResource = null;
          w.timer = 0.35;
          continue;
        }
        this.spendResource(resource, amount);
        w.carry = { resource, amount, construction: true };
        this.showCarry(w, resource);
        w.phase = "storehouse_exit";
        const [outX, outZ] = this.jobPoint(storehouse, w);
        w.deliveryRetry = this.route(w, outX, outZ, storehouse) ? 0 : 1.5;
      } else if (w.phase === "storehouse_exit") {
        const storehouse = w.pickupSource;
        if (w.deliveryRetry > 0) {
          w.deliveryRetry -= dt;
          if (w.deliveryRetry <= 0) {
            const [outX, outZ] = storehouse
              ? this.jobPoint(storehouse, w)
              : this.jobPoint(w.building, w);
            w.deliveryRetry = this.route(w, outX, outZ, storehouse) ? 0 : 1.5;
          }
          continue;
        }
        // Back outside with the goods; carry on to the site like a normal
        // material pickup.
        w.doorBuilding = null;
        w.pickupSource = null;
        const b = w.building;
        if (!b || !w.carry) {
          this.clearCarry(w);
          w.carry = null;
          w.phase = "idle";
          continue;
        }
        w.phase = "material_delivery";
        const [siteX, siteZ] = this.jobPoint(b, w);
        w.deliveryRetry = this.route(w, siteX, siteZ) ? 0 : 1.5;
      } else if (w.phase === "material_delivery") {
        const b = w.building;
        if (!b) {
          this.clearCarry(w);
          w.carry = null;
          this.setWorkerInside(w, false);
          w.workInside = false;
          w.phase = "idle";
          continue;
        }
        if (w.deliveryRetry > 0) {
          w.deliveryRetry -= dt;
          if (w.deliveryRetry <= 0) {
            const [siteX, siteZ] = this.jobPoint(b, w);
            w.deliveryRetry = this.route(w, siteX, siteZ) ? 0 : 1.5;
          }
          continue;
        }
        if (w.carry) {
          const { resource, amount } = w.carry;
          b.materials ||= normalizedConstructionMaterials(b.type, {}, 0);
          const required = CATALOG[b.type]?.cost?.[resource] || 0;
          b.materials[resource] = Math.min(
            required,
            finiteNumber(b.materials[resource], 0) + amount,
          );
          this.deliveryBurst(b, resource, amount);
          this.clearCarry(w);
          w.carry = null;
          w.deliveryRetry = 0;
          this.updateSiteMaterials(b);
        }
        if (constructionMaterialsReady(b)) {
          b.m.visible = true;
          b.m.scale.set(1, 0.1 + b.progress * 0.9, 1);
          w.phase = "construct";
          w.workDuration = 0;
          w.materialResource = null;
          this.announce(`${CATALOG[b.type].name} has all materials. Construction begins.`);
          this.save();
        } else {
          this.setWorkerInside(w, false);
          w.workInside = false;
          w.phase = "idle";
          w.building = null;
          w.materialResource = null;
          w.timer = 0.35;
        }
      } else if (w.phase === "travel") {
        if (w.tree) {
          w.tree.state = "chopping";
          w.tree.chopProgress = 0;
          this.updateTreeVisual(w.tree);
          w.phase = "chop";
          w.workDuration = 4.5;
          w.timer = w.workDuration;
          this.announce("A worker is chopping down a tree for the lumberyard.");
        } else if (w.field) {
          this.setWorkerInside(w, false);
          w.phase = "harvest";
          w.workDuration = 3.5;
          w.timer = w.workDuration;
        } else if (w.building.progress < 1) {
          this.setWorkerInside(w, false);
          w.phase = "construct";
          w.workDuration = 0;
          w.timer = 5 + rand() * 3;
        } else {
          if (w.workInside) this.setWorkerInside(w, true);
          w.phase = "work";
          w.workDuration =
            (5 + rand() * 3) / (w.building.upgrade === "Faster sails" ? 1.25 : 1);
          w.timer = w.workDuration;
        }
      } else if (w.phase === "eat_travel") {
        const inn = w.building;
        if (
          !inn ||
          inn.type !== "inn" ||
          finiteNumber(inn.breadStock, 0) <= 0 ||
          finiteNumber(this.resources.food, 0) <= 0
        ) {
          this.setWorkerInside(w, false);
          w.phase = "idle";
          w.building = null;
          w.workInside = false;
          w.waitingForInn = false;
          w.mealSeat = null;
          w.routeTarget = null;
          w.timer = 1;
          continue;
        }
        inn.breadStock = Math.max(0, Math.floor(inn.breadStock) - 1);
        this.resources.food = Math.max(0, (this.resources.food || 0) - 1);
        this.setWorkerInside(w, true);
        w.m.rotation.y = (inn.rotation || 0) + Math.PI;
        w.phase = "eat";
        w.workDuration = EAT_SECONDS;
        w.timer = w.workDuration;
        this.announce("A hungry villager has taken a seat for fresh bread at the Inn.");
      } else if (w.phase === "eat") {
        w.timer -= dt;
        if (w.timer <= 0) {
          if (w.building?.type === "inn")
            w.building.cycles =
              Math.max(0, Math.floor(finiteNumber(w.building.cycles, 0))) + 1;
          w.hunger = MEAL_SATIETY;
          w.phase = "idle";
          w.workDuration = 0;
          w.workInside = false;
          w.mealSeat = null;
          this.setWorkerInside(w, false);
          w.building = null;
          w.timer = 0.75;
        }
      } else if (w.phase === "visit") {
        w.timer -= dt;
        if (w.timer <= 0) {
          this.setWorkerInside(w, false);
          w.workInside = false;
          w.phase = "idle";
          w.building = null;
          w.timer = 1.5;
        }
      } else if (w.phase === "construct") {
        const b = w.building;
        b.progress = Math.min(
          1,
          b.progress +
            (dt * (this.feast?.remaining > 0 ? 1.25 : 1)) /
              CATALOG[b.type].seconds,
        );
        b.m.scale.y = 0.1 + b.progress * 0.9;
        if (b.progress >= 1) {
          this.disposeOwnedObject(b.scaffolding);
          b.scaffolding = null;
          this.disposeOwnedObject(b.siteRing);
          b.siteRing = null;
          if (b.type === "house" || b.type === "townhall") this.addSmoke(b);
          if (b.type === "house" || b.type === "townhall" || b.type === "well")
            this.addLanterns(b);
          b.pop = 1;
          w.phase = "idle";
          w.workDuration = 0;
          w.building = null;
          const readyMessage = `${CATALOG[b.type].name} is ready.${
            b.type === "house"
              ? " There is room for two more villagers, ready to be trained at a School."
              : ""
          }`;
          this.announce(readyMessage);
          this.playSound("complete");
          this.notify(readyMessage);
          this.save();
        }
      } else if (w.phase === "chop") {
        w.timer -= dt;
        if (w.tree) {
          w.tree.chopProgress = Math.max(
            0,
            Math.min(1, 1 - w.timer / Math.max(0.01, w.workDuration)),
          );
          this.updateTreeVisual(w.tree);
        }
        if (w.timer <= 0) {
          const tree = w.tree;
          const lumberyard = w.building;
          if (!tree || !lumberyard) {
            w.phase = "idle";
            w.tree = null;
            w.building = null;
            continue;
          }
          this.finishChopping(tree);
          w.tree = null;
          w.workDuration = 0;
          w.carry = {
            resource: "wood",
            amount: TREE_LOG_AMOUNT,
            product: "logs",
          };
          this.showCarry(w, "wood", "logs");
          this.setWorkerInside(w, false);
          w.phase = "lumber_delivery";
          const [yardX, yardZ] = this.jobPoint(lumberyard, w);
          w.deliveryRetry = this.route(w, yardX, yardZ) ? 0 : 1.5;
          this.announce("The tree is down. Logs are heading to the lumberyard.");
        }
      } else if (w.phase === "lumber_delivery") {
        const lumberyard = w.building;
        if (!lumberyard) {
          this.clearCarry(w);
          w.carry = null;
          w.phase = "idle";
          continue;
        }
        if (w.deliveryRetry > 0) {
          w.deliveryRetry -= dt;
          if (w.deliveryRetry <= 0) {
            const [yardX, yardZ] = this.jobPoint(lumberyard, w);
            w.deliveryRetry = this.route(w, yardX, yardZ) ? 0 : 1.5;
          }
          continue;
        }
        this.clearCarry(w);
        w.carry = null;
        w.phase = "process";
        w.workDuration = LUMBERYARD_PROCESS_SECONDS;
        w.timer = w.workDuration;
        this.announce("The lumberyard is sawing logs into wooden planks.");
      } else if (w.phase === "process") {
        w.timer -= dt;
        if (w.timer <= 0) {
          const lumberyard = w.building;
          if (!lumberyard) {
            w.phase = "idle";
            continue;
          }
          const stored = this.depositStock(lumberyard, TREE_LOG_AMOUNT);
          w.workDuration = 0;
          lumberyard.cycles =
            Math.max(0, Math.floor(finiteNumber(lumberyard.cycles, 0))) + 1;
          this.announce(
            this.stockSpace(lumberyard) > 0
              ? `Wooden planks +${stored} are stacked at the Lumberyard.`
              : "The Lumberyard is full. A carrier is needed.",
          );
          w.phase = "idle";
          w.building = null;
        }
      } else if (w.phase === "harvest") {
        w.timer -= dt;
        if (w.timer <= 0) {
          const field = w.field;
          const farm = w.building;
          if (!field || !farm) {
            w.phase = "idle";
            w.building = null;
            w.field = null;
            continue;
          }
          field.plantedAt = this.elapsed;
          field.claimedBy = null;
          field.cycles = Math.max(0, Math.floor(finiteNumber(field.cycles, 0))) + 1;
          this.updateGrainFieldVisual(field, true);
          const amount =
            CATALOG.farm.amount + (farm.upgrade === "Rich soil" ? 4 : 0);
          w.carry = { resource: "wheat", amount, toStock: true };
          w.field = null;
          w.workDuration = 0;
          this.showCarry(w, "wheat");
          this.setWorkerInside(w, false);
          // The sheaves are carried back to the farmhouse store, not straight
          // to the hall: only a carrier moves goods between buildings now.
          w.phase = "stock_delivery";
          const [farmX, farmZ] = this.jobPoint(farm, w);
          w.deliveryRetry = this.route(w, farmX, farmZ) ? 0 : 1.5;
          this.announce("A farmer has gathered a ripe grain field.");
        }
      } else if (w.phase === "work") {
        w.timer -= dt;
        if (w.timer <= 0) {
          const site = w.building;
          const c = CATALOG[site.type];
          const inputResource = c.inputResource || "food";
          // A full building stops its worker until a carrier clears the store.
          if (this.stockSpace(site) <= 0) {
            if (!w.waitingForStock)
              this.announce(`The ${c.name} store is full. A carrier must collect the goods.`);
            w.waitingForStock = true;
            w.workDuration = 0;
            // Standing at a full bench helps nobody. The post is released so
            // this villager can haul the backlog away or find other work, and
            // a full building is skipped when jobs are handed out.
            w.workInside = false;
            this.setWorkerInside(w, false);
            if (w.m) {
              const [outX, outZ] = this.jobPoint(site, w);
              w.m.position.set(outX, 0, outZ);
            }
            w.building = null;
            w.phase = "idle";
            w.timer = 0;
            continue;
          }
          w.waitingForStock = false;
          if (c.input && this.resourceAmount(inputResource) < c.input) {
            if (!w.waitingForInput)
              this.announce(`${c.name} is waiting for ${inputResource}.`);
            w.waitingForInput = true;
            w.workDuration = 0;
            w.timer = 4;
            continue;
          }
          const resumedFromWaiting = w.waitingForInput;
          w.waitingForInput = false;
          if (resumedFromWaiting) this.announce(`${c.name} has ${inputResource} again.`);
          if (c.input) this.spendResource(inputResource, c.input);
          const batch = c.amount + (site.upgrade === "Rich soil" ? 4 : 0);
          const stored = this.depositStock(site, batch);
          site.cycles = Math.max(0, Math.floor(finiteNumber(site.cycles, 0))) + 1;
          w.workDuration = 0;
          const label = site.type === "bakery" ? "Bread" : c.resource;
          this.announce(
            `${label[0].toUpperCase() + label.slice(1)} +${stored} is ready at the ${c.name}.`,
          );
          // The worker keeps their post and starts the next cycle; hauling is
          // a carrier's job now.
          w.workDuration = c.seconds;
          w.timer = w.workDuration;
        }
      } else if (w.phase === "stock_delivery") {
        // A producer bringing its own output home, e.g. a farmer walking
        // sheaves back from the field to the farmhouse store.
        const site = w.building;
        if (!site || !w.carry) {
          this.clearCarry(w);
          w.carry = null;
          w.phase = "idle";
          w.building = null;
          w.workDuration = 0;
          continue;
        }
        if (w.deliveryRetry > 0) {
          w.deliveryRetry -= dt;
          if (w.deliveryRetry <= 0) {
            const [siteX, siteZ] = this.jobPoint(site, w);
            w.deliveryRetry = this.route(w, siteX, siteZ) ? 0 : 1.5;
          }
          continue;
        }
        const wasWaitingForStock = Boolean(w.waitingForStock);
        const carried = Math.max(0, Math.floor(finiteNumber(w.carry.amount, 0)));
        const stored = this.depositStock(site, carried);
        if (stored > 0) this.deliveryBurst(site, w.carry.resource, stored);
        const remaining = carried - stored;
        if (remaining > 0) {
          // A carrier may have drained only part of the farmhouse while this
          // farmer was returning. Keep the undelivered sheaves in hand rather
          // than silently destroying them; the carrier can now see the stock
          // that still needs to leave before this farmer finishes unloading.
          w.carry.amount = remaining;
          w.waitingForStock = true;
          w.deliveryRetry = 1.5;
          if (!wasWaitingForStock)
            this.announce("The Farmhouse is full. A carrier must collect the wheat.");
          continue;
        }
        w.waitingForStock = false;
        this.clearCarry(w);
        w.carry = null;
        w.phase = "idle";
        w.workDuration = 0;
        w.workInside = false;
        this.setWorkerInside(w, false);
        w.field = null;
        w.tree = null;
        w.building = null;
      } else if (w.phase === "haul_pickup") {
        const source = w.haulSource;
        if (!source || source.progress < 1 || this.storedAt(source) <= 0) {
          this.releaseHaul(w);
          continue;
        }
        if (w.deliveryRetry > 0) {
          w.deliveryRetry -= dt;
          if (w.deliveryRetry <= 0) {
            const [sx, sz] = this.jobPoint(source, w);
            w.deliveryRetry = this.route(w, sx, sz, source) ? 0 : 1.5;
          }
          continue;
        }
        const resource = CATALOG[source.type]?.resource;
        const load = Math.min(
          CARRIER_LOAD,
          this.storedAt(source),
          Math.max(0, this.storageSpace(resource)),
        );
        if (load <= 0) {
          this.releaseHaul(w);
          continue;
        }
        source.stock = Math.max(0, finiteNumber(source.stock, 0)) - load;
        w.carry = {
          resource,
          amount: load,
          haul: true,
          ...(source.type === "bakery" ? { product: "bread" } : {}),
        };
        this.showCarry(w, resource, source.type === "lumberyard" ? "plank" : undefined);
        const target = this.haulDestination(w, resource, load);
        if (!target) {
          w.deliveryRetry = 1.5;
          w.phase = "haul_deliver";
          continue;
        }
        w.haulTarget = target;
        const [tx, tz] = this.jobPoint(target, w);
        w.phase = "haul_deliver";
        w.deliveryRetry = this.route(w, tx, tz) ? 0 : 1.5;
      } else if (w.phase === "haul_deliver") {
        if (!w.carry) {
          this.releaseHaul(w);
          continue;
        }
        const target =
          this.validHaulTarget(w.haulTarget, w.carry.resource) ||
          this.haulDestination(w, w.carry.resource);
        if (!target) {
          // Nowhere in the village can take this load. It goes back to the
          // building that made it rather than evaporating, which leaves that
          // producer stalled until the player makes room.
          if (w.haulSource)
            w.haulSource.stock =
              this.storedAt(w.haulSource) + Math.max(0, w.carry.amount);
          if (!w.announcedFullStores) {
            w.announcedFullStores = true;
            this.announce("Every store is full. Build a Storehouse to make room.");
          }
          this.clearCarry(w);
          w.carry = null;
          this.releaseHaul(w);
          continue;
        }
        if (target !== w.haulTarget) {
          w.haulTarget = target;
          const [tx, tz] = this.jobPoint(target, w);
          w.deliveryRetry = this.route(w, tx, tz) ? 0 : 1.5;
          continue;
        }
        if (w.deliveryRetry > 0) {
          w.deliveryRetry -= dt;
          if (w.deliveryRetry <= 0) {
            const [tx, tz] = this.jobPoint(target, w);
            w.deliveryRetry = this.route(w, tx, tz) ? 0 : 1.5;
          }
          continue;
        }
        const accepted = this.storeResource(
          target,
          w.carry.resource,
          w.carry.amount,
        );
        // Anything the store could not take goes back to the building it came
        // from, so a full village never silently destroys goods.
        const returned = w.carry.amount - accepted;
        if (returned > 0 && w.haulSource)
          w.haulSource.stock = this.storedAt(w.haulSource) + returned;
        if (accepted > 0) {
          this.deliveryBurst(target, w.carry.resource, accepted);
          const label = w.carry.product || w.carry.resource;
          const targetName =
            target.type === "townhall"
              ? "the hall"
              : `the ${CATALOG[target.type]?.name || target.type}`;
          this.announce(
            `${label[0].toUpperCase() + label.slice(1)} +${accepted} carried to ${targetName}.`,
          );
        }
        this.clearCarry(w);
        w.carry = null;
        this.releaseHaul(w);
      }
    }
    for (const b of this.buildings)
      if (b.type === "windmill" && b.progress === 1) {
        const sails = b.sails;
        if (sails && !this.reduceMotion) sails.rotation.z += dt * 0.45;
      }
    if (this.feast?.remaining > 0) {
      this.feast.remaining = Math.max(0, this.feast.remaining - dt);
      if (this.feast.remaining === 0) {
        this.feast = null;
        this.announce("The feast is over. The village returns to its gentle rhythm.");
        this.save();
      }
    }
    if (!this.trendSample || this.elapsed - this.trendSample.elapsed >= 20) {
      const sample = this.trendSample || {
        elapsed: this.elapsed,
        resources: { ...this.resources },
      };
      const minutes = Math.max(1 / 60, (this.elapsed - sample.elapsed) / 60);
      for (const resource of Object.keys(this.resources))
        this.trends[resource] = Math.round(
          ((this.resources[resource] - (sample.resources[resource] || 0)) /
            minutes) *
            10,
        ) / 10;
      this.trendSample = {
        elapsed: this.elapsed,
        resources: { ...this.resources },
      };
    }
  }
  routeTargetBlocked(point, worker = null) {
    if (!point) return false;
    return this.routeBlocked(
      point.x,
      point.z,
      this.workerRouteIgnore(worker),
      worker?.tree || null,
    );
  }
  workSnapshot(w) {
    if (
      !w ||
      !["work", "harvest", "chop", "process"].includes(w.phase) ||
      !(w.workDuration > 0)
    )
      return { progress: null, remaining: null };
    return {
      progress: Math.max(0, Math.min(1, 1 - w.timer / w.workDuration)),
      remaining: Math.max(0, Math.ceil(w.timer)),
    };
  }
  emit() {
    if (!this.chapterRewards) this.chapterRewards = {};
    const assignedByBuilding = new Map();
    const collectorsByBuilding = new Map();
    const incomingByBuilding = new Map();
    const addWorker = (map, building, worker) => {
      if (!building) return;
      const workers = map.get(building);
      if (workers) workers.push(worker);
      else map.set(building, [worker]);
    };
    for (const worker of this.workers) {
      addWorker(assignedByBuilding, worker.building, worker);
      if (worker.field && worker.field !== worker.building)
        addWorker(assignedByBuilding, worker.field, worker);
      if (worker.haulSource && worker.phase === "haul_pickup")
        addWorker(collectorsByBuilding, worker.haulSource, worker);
      if (worker.haulTarget && worker.phase === "haul_deliver")
        addWorker(incomingByBuilding, worker.haulTarget, worker);
    }
    const forestTrees = this.decor?.filter((tree) => tree.type === "tree") || [];
    const availableTrees = forestTrees.some(
      (tree) => tree.state === "available" && !tree.claimedBy,
    );
    // Farm connectivity is a small graph walk, and the same farm can be
    // queried several times while projecting one HUD snapshot. Cache it for
    // this emit; simulation mutations invalidate it naturally on the next
    // projection.
    const farmFieldsCache = new Map();
    const readyFieldsCache = new Map();
    const farmFieldsFor = (building) => {
      if (building?.type !== "farm") return [];
      if (!farmFieldsCache.has(building))
        farmFieldsCache.set(building, this.grainFieldsForFarm(building));
      return farmFieldsCache.get(building);
    };
    const readyFieldsFor = (building) => {
      if (building?.type !== "farm") return [];
      if (!readyFieldsCache.has(building))
        readyFieldsCache.set(
          building,
          farmFieldsFor(building).filter(
            (field) =>
              grainGrowthStage(field.plantedAt, this.elapsed) === "ripe" &&
              !field.claimedBy,
          ),
        );
      return readyFieldsCache.get(building);
    };
    const chapterGoals = chapterGoalState(this.chapterRewards, {
      buildings: this.buildings,
      created: this.created,
      delivered: this.delivered,
    });
    for (const goal of chapterGoals)
      if (goal.completed && !goal.claimed) this.chapterRewards[goal.id] = true;
    const inTransit = this.workers.reduce(
      (total, worker) => total + (worker.carry?.amount || 0),
      0,
    );
    const blockedSites = this.buildings.filter(
      (building) =>
        building.progress === 1 &&
        CATALOG[building.type]?.resource &&
        (building.type !== "farm" || readyFieldsFor(building).length > 0) &&
        (this.stockSpace(building) <= 0 ||
          building.lastRouteBlocked ||
          !assignedByBuilding.has(building)),
    ).length;
    const storageCaps = this.storageCapacities();
    const villageStorage = storageCaps.wood ?? this.storageCapacity();
    // Every completed School sees the same village-wide training availability.
    // Compute it once per HUD snapshot instead of repeating the worker/building
    // scans for every School in the settlement.
    let schoolTrainingOptions = null;
    const trainingOptionsForSnapshot = () =>
      schoolTrainingOptions ||
      (schoolTrainingOptions = trainingOptions(this.buildings, this.workers));
    this.onUpdate({
      resources: { ...this.resources },
      storage: storageCaps,
      population: this.workers.length,
      capacity: housingCapacity(this.buildings),
      day: Math.floor(this.elapsed / 120) + 1,
      time: this.elapsed % 120,
      speed: this.speed,
      name: this.name,
      buildings: this.buildings.map((b) => {
        const assigned = assignedByBuilding.get(b) || [];
        const collectors = collectorsByBuilding.get(b) || [];
        const incoming = incomingByBuilding.get(b) || [];
        const stockCap = outputCapForBuilding(b.type);
        const stored = this.storedAt(b);
        const materialsReady = constructionMaterialsReady(b);
        const work = this.workSnapshot(
          assigned.find(
            (w) =>
              ["work", "harvest", "chop", "process"].includes(w.phase) &&
              w.workDuration > 0,
          ),
        );
        const fieldProgress =
          b.type === "grainfield"
            ? grainGrowthProgress(b.plantedAt, this.elapsed)
            : null;
        const fieldStage =
          b.type === "grainfield"
            ? grainGrowthStage(b.plantedAt, this.elapsed)
            : null;
        const farmFields = farmFieldsFor(b);
        const readyFarmFields = readyFieldsFor(b);
        let nextFarmGrowth = null;
        if (farmFields.length) {
          nextFarmGrowth = 0;
          for (const field of farmFields)
            nextFarmGrowth = Math.max(
              nextFarmGrowth,
              grainGrowthProgress(field.plantedAt, this.elapsed),
            );
        }
        const innDiners =
          b.type === "inn"
            ? assigned.filter((worker) => ["eat_travel", "eat"].includes(worker.phase))
                .length
            : 0;
        const status =
          b.type === "grainfield"
            ? b.claimedBy
              ? "Harvesting"
              : {
                  sown: "Freshly planted",
                  sprout: "Sprouting",
                  growing: "Growing",
                  ripe: "Ripe",
                }[fieldStage]
            : b.progress < 1 &&
                !materialsReady &&
                assigned.some((w) => w.phase === "material_pickup")
              ? "Collecting materials"
            : b.progress < 1 &&
                !materialsReady &&
                assigned.some((w) => w.phase === "material_delivery")
              ? "Delivering materials"
            : b.progress < 1 && !materialsReady
              ? "Awaiting materials"
            : b.progress < 1
            ? "Building"
            : stockCap && stored >= stockCap
              ? "Full — waiting for a carrier"
            : b.type === "school" && b.training?.waiting
              ? "Apprentice needs housing"
            : b.type === "school" && b.training
              ? `Training a ${(WORKER_TYPE_LABELS[b.training.type] || "villager").toLowerCase()}`
            : b.type === "inn" && innDiners > 0
              ? `Serving ${innDiners} meal${innDiners === 1 ? "" : "s"}`
            : b.type === "inn" && finiteNumber(b.breadStock, 0) > 0
              ? `${Math.floor(b.breadStock)} bread ready`
            : b.type === "inn"
              ? "Waiting for bread"
            : b.lastRouteBlocked
              ? "Waiting for route"
            : assigned.some((w) => w.waitingForSpace)
              ? "Waiting for space"
            : assigned.some((w) => w.deliveryRetry > 0)
              ? "Waiting for route"
            : b.type === "lumberyard" && forestTrees.length && !availableTrees && !assigned.length
              ? "Waiting for trees"
              : assigned.some((w) => w.phase === "chop")
                ? "Chopping trees"
              : assigned.some((w) => w.phase === "lumber_delivery")
                ? "Taking logs to Lumberyard"
              : assigned.some((w) => w.phase === "process")
                ? "Sawing wooden planks"
              : assigned.some((w) => w.phase === "stock_delivery")
                ? "Carrying the harvest in"
              : incoming.length
                ? b.type === "inn"
                  ? "Bread on the way"
                  : "Goods on the way"
              : collectors.length
                ? "A carrier is collecting"
              : assigned.some((w) => w.phase === "travel")
                ? "On the way"
                : assigned.some((w) => w.phase === "harvest")
                  ? "Harvesting"
                : assigned.some((w) => w.waitingForInput)
                  ? `Waiting for ${CATALOG[b.type]?.inputResource || "food"}`
                : assigned.some((w) => w.phase === "work")
                  ? b.type === "vineyard"
                    ? "Pressing grapes"
                    : "Working"
                  : b.type === "farm" && !farmFields.length
                    ? "Needs grain fields"
                  : b.type === "farm" && !readyFarmFields.length
                    ? "Waiting for grain"
                  : assigned.length
                    ? "Assigned"
                    : "Idle";
        return {
          id: b.id,
          type: b.type,
          progress: b.progress,
          materials: { ...b.materials },
          materialProgress: constructionMaterialProgress(b),
          materialsReady,
          workers: assigned.length,
          usesWorkers: Boolean(workerTypeForBuilding(b.type)),
          cycles: b.cycles,
          cycleProgress:
            b.type === "grainfield"
              ? fieldProgress
              : b.type === "farm" && work.progress == null
                ? nextFarmGrowth
                : work.progress,
          nextDelivery:
            b.type === "grainfield"
              ? fieldProgress >= 1
                ? work.remaining
                : Math.ceil((1 - fieldProgress) * GRAIN_GROW_SECONDS)
              : b.type === "farm" && work.remaining == null && nextFarmGrowth != null
                ? Math.ceil((1 - nextFarmGrowth) * GRAIN_GROW_SECONDS)
                : work.remaining,
          status,
          upgrade: b.upgrade,
          fieldStage,
          ...(b.type === "inn"
            ? {
                breadStock: Math.max(0, Math.floor(finiteNumber(b.breadStock, 0))),
                breadCap: Math.max(0, finiteNumber(CATALOG.inn?.breadCap, 0)),
              }
            : {}),
          ...(stockCap ? { stock: stored, stockCap } : {}),
          ...(isStoreBuilding(b.type) && b.progress === 1
            ? {
                storage: storageForBuilding(b.type),
                villageStorage,
                storedCaps: storageCaps,
                stored: { ...this.resources },
              }
            : {}),
          ...(b.type === "school" && b.progress === 1
            ? {
                training: trainingOptionsForSnapshot(),
                trainingSession: b.training
                  ? {
                      type: b.training.type,
                      label: WORKER_TYPE_LABELS[b.training.type] || "Villager",
                      remaining: Math.max(0, Math.ceil(b.training.remaining)),
                      progress: Math.min(
                        1,
                        Math.max(
                          0,
                          1 - b.training.remaining / TRAINING_SECONDS,
                        ),
                      ),
                      waiting: Boolean(b.training.waiting),
                    }
                  : null,
              }
            : {}),
        };
      }),
      workers: this.workers.map((w, index) => {
        const work = this.workSnapshot(w);
        return {
          id: w.id || `worker-${index}`,
          phase: w.phase,
          waitingForInput: !!w.waitingForInput,
          ...(w.waitingForInn ? { waitingForInn: true } : {}),
          ...(w.waitingForSpace ? { waitingForSpace: true } : {}),
          deliveryRetry: w.deliveryRetry > 0,
          workerType: w.workerType || WORKER_TYPES.BUILDER,
          workerTypeLabel: WORKER_TYPE_LABELS[w.workerType] || "Builder",
          ...(w.trainedType ? { trainedType: w.trainedType } : {}),
          buildingType: w.building?.type || null,
          ...(w.insideBuilding ? { insideBuilding: true } : {}),
          carry: w.carry ? { ...w.carry } : null,
          hunger: Math.max(0, Math.min(1, finiteNumber(w.hunger, 0))),
          hungry: finiteNumber(w.hunger, 0) >= HUNGRY_THRESHOLD,
          workProgress: work.progress,
          workRemaining: work.remaining,
        };
      }),
      gathered: this.gathered,
      created: { ...this.created },
      delivered: { ...this.delivered },
      trends: { ...this.trends },
      inTransit,
      blockedSites,
      chapterGoals: chapterGoals.map((goal) => ({
        ...goal,
        claimed: goal.completed || goal.claimed || Boolean(this.chapterRewards[goal.id]),
      })),
      feast: this.feast ? { ...this.feast } : null,
      tutorialStep: this.tutorialStep,
      tutorialDismissed: this.tutorialDismissed,
      graphicsPreset: this.graphicsPreset,
      audioSettings: { ...this.audioSettings },
      placement: this.placement,
      activity: this.activity,
      activityLog: this.activityLog.map(({ message }) => message),
      healthCheck: this.healthCheck,
      saveAvailable: this.storageAvailable !== false && !this.storageConflict,
      saveConflict: this.storageConflict,
      hasSaved: this.lastSavedAt > 0,
    });
  }
  saveRecord() {
    return {
      version: SAVE_VERSION,
      name: this.name,
      resources: normalizedAmountRecord(this.resources),
      population: this.workers.length,
      elapsed: this.elapsed,
      created: normalizedCountRecord(this.created),
      gathered: Math.max(0, finiteNumber(this.gathered, 0)),
      delivered: normalizedAmountRecord(this.delivered),
      chapterRewards: this.chapterRewards,
      feast: this.feast,
      tutorialStep: this.tutorialStep,
      tutorialDismissed: this.tutorialDismissed,
      workerNeeds: this.workers.map((worker) => ({
        hunger: Math.max(0, Math.min(1, finiteNumber(worker.hunger, 0))),
        ...(worker.trainedType ? { trained: worker.trainedType } : {}),
      })),
      activityLog: (Array.isArray(this.activityLog) ? this.activityLog : [])
        .slice(0, 4)
        .map(({ message }) => String(message).slice(0, 140)),
      view: this.viewRecord(),
      roads: [...this.roads].filter((key) => !this.baseRoads?.has(key)),
      trees: (this.decor || [])
        .filter((tree) => tree.type === "tree" && tree.state !== "available")
        .map((tree) => ({
          x: tree.x,
          z: tree.z,
          state: tree.state === "regrowing" ? "regrowing" : "available",
          regrowAt: tree.regrowAt,
        })),
      clearedScenery: [...(this.clearedScenery || [])],
      buildings: this.buildings.map(
        ({ type, x, z, rotation, progress, cycles, upgrade, materials, plantedAt, breadStock, training, stock }) => ({
          type,
          x,
          z,
          rotation,
          progress,
          cycles: Math.max(0, Math.floor(finiteNumber(cycles, 0))),
          upgrade: upgrade ? String(upgrade) : null,
          materials: { ...materials },
          ...(type === "grainfield"
            ? { plantedAt: Math.max(0, finiteNumber(plantedAt, this.elapsed)) }
            : {}),
          ...(type === "inn"
            ? { breadStock: Math.max(0, Math.floor(finiteNumber(breadStock, 0))) }
            : {}),
          ...(type === "school" && training
            ? { training: normalizedTrainingSession(type, training) }
            : {}),
          ...(outputCapForBuilding(type)
            ? {
                stock: Math.max(
                  0,
                  Math.min(savedStockLimit(type), Math.floor(finiteNumber(stock, 0))),
                ),
              }
            : {}),
        }),
      ),
    };
  }
  save() {
    if (this.healthCheck || !this.ready || this.storageConflict) return false;
    try {
      if (this.storageChanged()) {
        this.markStorageConflict();
        return false;
      }
      const serialized = JSON.stringify(this.saveRecord());
      localStorage.setItem("hearth-v1", serialized);
      this.saveFingerprint = serialized;
      this.lastSavedAt = Date.now();
      this.storageAvailable = true;
      return true;
    } catch {
      this.storageAvailable = false;
      this.notify(
        "Browser storage is unavailable. This village cannot be saved.",
      );
      return false;
    }
  }
  exportSave() {
    if (this.healthCheck || !this.ready || this.storageConflict) return null;
    let serialized;
    try {
      serialized = JSON.stringify(this.saveRecord());
    } catch {
      return null;
    }
    if (this.storageAvailable !== false) {
      try {
        if (this.storageChanged()) {
          this.markStorageConflict();
          return null;
        }
      } catch {
        this.storageAvailable = false;
        return serialized;
      }
      try {
        localStorage.setItem("hearth-v1", serialized);
        this.saveFingerprint = serialized;
        this.lastSavedAt = Date.now();
        this.storageAvailable = true;
      } catch {
        // The in-memory record is still a valid backup when browser storage is
        // blocked or full. Keep export useful even when autosave is not.
        this.storageAvailable = false;
      }
    }
    return serialized;
  }
  importVillage(value) {
    if (this.healthCheck || this.storageConflict) return false;
    if (this.storageChanged()) {
      this.markStorageConflict();
      return false;
    }
    const parsed = parseVillageImport(value);
    if (!parsed.ok) return false;
    try {
      const current = localStorage.getItem("hearth-v1");
      if (current) localStorage.setItem("hearth-v1-backup", current);
      localStorage.setItem("hearth-v1", JSON.stringify(parsed.value));
      return true;
    } catch {
      this.storageAvailable = false;
      return false;
    }
  }
  dismissTutorial() {
    if (this.blockedByStorageConflict()) return false;
    this.tutorialDismissed = true;
    this.clearHighlight();
    this.save();
    this.emit();
    return true;
  }
  clearSave() {
    if (this.healthCheck || this.storageConflict) return false;
    try {
      if (this.storageChanged()) {
        this.markStorageConflict();
        return false;
      }
      localStorage.removeItem("hearth-v1");
      this.lastSavedAt = 0;
      this.saveFingerprint = null;
      this.storageAvailable = true;
      this.storageConflict = false;
      return true;
    } catch {
      this.storageAvailable = false;
      return false;
    }
  }
  storageChanged() {
    return Boolean(
      !this.healthCheck &&
      this.lastSavedAt > 0 &&
        this.saveFingerprint != null &&
        typeof localStorage.getItem === "function" &&
        localStorage.getItem("hearth-v1") !== this.saveFingerprint,
    );
  }
  markStorageConflict() {
    this.storageConflict = true;
    this.speed = 0;
    this.notify?.(
      "This village changed in another tab. Reload to continue from the latest save.",
    );
    this.emit?.();
  }
  blockedByStorageConflict() {
    if (!this.storageConflict) return false;
    this.notify?.(
      "This village changed in another tab. Reload to continue from the latest save.",
    );
    return true;
  }
  setGraphicsPreset(preset) {
    if (!["low", "balanced", "high"].includes(preset)) return false;
    this.graphicsPreset = preset;
    this.renderer.shadowMap.enabled = preset !== "low";
    this.renderer.shadowMap.type =
      preset === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const viewportWidth =
      typeof window === "undefined" ? 1280 : window.innerWidth;
    const shadowMapSize = shadowMapSizeForPreset(preset, viewportWidth);
    if (this.sun?.shadow && this.shadowMapSize !== shadowMapSize) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      this.shadowMapSize = shadowMapSize;
    }
    this.syncGraphicsDetail();
    this.syncLanternLightPool();
    try {
      localStorage.setItem(
        "hearth-settings",
        JSON.stringify({ graphicsPreset: preset, ...this.audioSettings }),
      );
    } catch {}
    this.resize?.();
    this.emit?.();
    return true;
  }
  zoom(d) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom + d, 0.65, 2.4);
    this.camera.updateProjectionMatrix();
  }
  pan(dx, dz) {
    const target = this.controls.target;
    const nextX = THREE.MathUtils.clamp(target.x + dx, -20, 18);
    const nextZ = THREE.MathUtils.clamp(target.z + dz, -24, 24);
    const offset = new THREE.Vector3(nextX - target.x, 0, nextZ - target.z);
    this.camera.position.add(offset);
    this.controls.target.add(offset);
  }
  setName(name) {
    if (this.storageConflict) return null;
    const previous = this.name;
    this.name = sanitizeVillageName(name, this.name);
    if (!this.save() && this.storageConflict) {
      this.name = previous;
      this.emit?.();
      return null;
    }
    this.emit();
    return this.name;
  }
  home() {
    this.camera.position.set(30, 37, 42);
    this.controls.target.set(0, 0, -1);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
  }
  focusBuilding(id) {
    const building = this.buildings.find((candidate) => candidate.id === id);
    if (!building) return false;
    const offset = new THREE.Vector3(25, 31, 29);
    this.controls.target.set(building.x, 0, building.z);
    this.camera.position.set(building.x + offset.x, offset.y, building.z + offset.z);
    this.controls.update();
    this.onSelect?.({
      type: building.type,
      name: CATALOG[building.type]?.name || "Village hall",
      effect: CATALOG[building.type]?.effect || "",
      id: building.id,
    });
    this.highlight(building);
    return true;
  }
  focusWorker(id) {
    const worker = this.workers.find((candidate) => candidate.id === id);
    if (!worker) return false;
    this.controls.target.set(worker.m.position.x, 0, worker.m.position.z);
    this.camera.position.set(worker.m.position.x + 18, 24, worker.m.position.z + 22);
    this.controls.update();
    this.onSelect?.({
      type: "worker",
      name: WORKER_TYPE_LABELS[worker.workerType] || "Builder",
      description: `${WORKER_TYPE_LABELS[worker.workerType] || "Builder"} helping ${this.name} grow.`,
      effect: worker.building
        ? `Assigned to ${CATALOG[worker.building.type]?.name || "the village"}`
        : "Ready to build the next structure",
      workerId: worker.id,
    });
    this.highlightWorker(worker);
    if (!this.tutorialDismissed && (this.tutorialStep || 0) === 1) {
      this.tutorialStep = 2;
      this.save();
      this.emit();
    }
    return true;
  }
  animate = () => {
    if (this.dead) return;
    if (document.visibilityState === "hidden") {
      this.frame = null;
      this.clock.getDelta();
      return;
    }
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    const motion = this.reduceMotion ? 0 : 1;
    // Event feedback belongs to the simulation timeline. Keep it visible but
    // frozen while paused, while ambient effects can continue rendering.
    const simulationMotion = this.speed > 0 ? 1 : 0;
    // Keep the world renderable while paused, but freeze simulation actors so
    // villagers do not walk in place or continue working against a stopped
    // simulation clock.
    const actorMotion = motion * (this.speed > 0 ? 1 : 0);
    if (this.ready && this.speed) this.simulate(dt * this.speed);
    this.controls.update();
    this.updateAtmosphere();
    if (!shouldRenderWorldFrame(this.speed, t, this.lastPausedRender)) return;
    if (!this.speed) this.lastPausedRender = t;
    if (this.speed > 0) {
      for (const w of this.workers) {
        if (!w.m?.position) continue;
        const walking = actorMotion > 0 && w.path.length > 0;
      const cycle = actorMotion && walking
        ? t * 9.5 + (w.walkPhase || 0)
        : actorMotion
          ? t * 2.2 + (w.idlePhase || 0)
          : 0;
      const targetBlend = walking ? 1 : 0;
      w.walkBlend += (targetBlend - (w.walkBlend || 0)) * Math.min(1, dt * 10);
      const stride = walking ? Math.sin(cycle) : 0;
      const idleStride = actorMotion ? Math.sin(cycle) * 0.08 : 0;
      const gait = stride * w.walkBlend + idleStride * (1 - w.walkBlend);
      const lift = walking ? Math.abs(stride) * 0.012 : 0;
      const eating = w.phase === "eat";
      // The worker rig's hip sits at y=.38, so this places it on the .45-high
      // outdoor bench while the bent legs remain in front of the seat.
      const baseY = eating ? 0.08 : 0.004;
      w.m.position.y = baseY + lift;
      w.m.rotation.z = 0;
      w.m.rotation.x = 0;
      const stretch = walking ? Math.abs(stride) * 0.012 : 0;
      w.m.scale.y += ((eating ? 0.88 : 1) + stretch - w.m.scale.y) * 0.24;
      if (w.rig) {
        w.rig.rig.rotation.z = gait * 0.025;
        w.rig.leftLeg.rotation.x +=
          ((eating ? -1.15 : gait * 0.42) - w.rig.leftLeg.rotation.x) * 0.35;
        w.rig.rightLeg.rotation.x +=
          ((eating ? -1.15 : -gait * 0.42) - w.rig.rightLeg.rotation.x) * 0.35;
        const chopping = w.phase === "chop";
        const harvesting =
          w.workerType === WORKER_TYPES.FARMER && w.phase === "harvest";
        const baking =
          w.workerType === WORKER_TYPES.BAKER &&
          w.phase === "work" &&
          w.insideBuilding;
        const mining =
          w.workerType === WORKER_TYPES.MINER && w.phase === "work";
        const workBeat =
          actorMotion * Math.sin(t * (baking ? 5.5 : 7) + (w.walkPhase || 0));
        w.rig.leftArm.rotation.x +=
          ((chopping || mining
            ? -0.72
            : harvesting
              ? -0.92 + Math.max(0, workBeat) * 0.85
              : eating
                ? -0.9 + actorMotion * Math.sin(t * 4.2) * 0.16
              : baking
                ? -0.48 + workBeat * 0.42
                : -gait * 0.3) -
            w.rig.leftArm.rotation.x) *
          0.35;
        w.rig.rightArm.rotation.x +=
          ((chopping || mining
            ? -0.72
            : harvesting
              ? -0.5 - workBeat * 0.4
              : eating
                ? -0.72 - actorMotion * Math.sin(t * 4.2) * 0.16
              : baking
                ? -0.58 - workBeat * 0.4
                : gait * 0.3) -
            w.rig.rightArm.rotation.x) *
          0.35;
        if (w.rig.sickle) {
          w.rig.sickle.rotation.z = harvesting ? -0.9 + workBeat * 1.2 : -0.5;
        }
        if (w.rig.rollingPin && w.rig.breadTray) {
          const isBaker = w.workerType === WORKER_TYPES.BAKER;
          w.rig.rollingPin.visible = isBaker && baking;
          w.rig.breadTray.visible = isBaker && !baking;
          w.rig.rollingPin.rotation.y = baking ? workBeat * 0.75 : 0;
        }
        if (w.rig.pickaxe) {
          if (mining) {
            const swing = actorMotion * Math.max(0, Math.sin(t * 6.5 + w.walkPhase));
            w.rig.pickaxe.rotation.z = AXE_CARRY_ANGLE + swing * 1.2;
          } else {
            w.rig.pickaxe.rotation.z +=
              (AXE_CARRY_ANGLE - w.rig.pickaxe.rotation.z) * 0.18;
          }
        }
        if (w.rig.axe) {
          w.rig.axe.visible = w.workerType === WORKER_TYPES.WOODCUTTER;
          if (chopping) {
            const swing = actorMotion * Math.max(0, Math.sin(t * 7.5 + w.walkPhase));
            w.rig.axe.rotation.z = AXE_CARRY_ANGLE + swing * 1.35;
          } else {
            w.rig.axe.rotation.z +=
              (AXE_CARRY_ANGLE - w.rig.axe.rotation.z) * 0.18;
          }
        }
      }
      if (w.shadowIndex != null || w.contactShadow) {
        const squash = walking ? 1 - Math.abs(stride) * 0.12 : 1;
        this.updateWorkerShadow(w, squash);
      }
        const hasActiveWorkEffect =
          w.insideBuilding &&
          w.building &&
          (w.phase === "harvest" || w.phase === "work") &&
          WORK_EFFECT_BUILDINGS.has(w.building.type);
        if (hasActiveWorkEffect || w.workEffect?.visible)
          this.updateWorkerWorkEffect(w, t, actorMotion);
      }
      if (this.workerShadowField?.dirty) {
        this.workerShadowField.mesh.instanceMatrix.needsUpdate = true;
        this.workerShadowField.dirty = false;
      }
    }
    if (this.graphicsPreset !== "low" && motion) {
      for (const m of this.ripples) {
        const phase = m.userData.phase || 0;
        const speed = m.userData.speed || 0.5;
        const wave = motion * Math.sin(t * speed + phase);
        m.position.x = (m.userData.baseX || m.position.x) + wave * 0.1;
        m.scale.x = 0.9 + (wave + 1) * 0.12;
        m.material.opacity = 0.25 + (wave + 1) * 0.1;
      }
      for (const m of this.swayers) {
        if (!m.parent) continue;
        const phase = m.userData.phase || 0;
        const speed = m.userData.speed || 0.7;
        const amount = motion * (m.userData.amount || 0.02);
        m.rotation.z = (m.userData.baseZ || 0) + Math.sin(t * speed + phase) * amount;
      }
    }
    this.updateGrassField(t, motion);
    if (this.roadsDirty) this.rebuildRoadSurface();
    for (const tree of this.decor || []) {
      if (
        !actorMotion ||
        tree.type !== "tree" ||
        tree.state !== "chopping" ||
        !tree.m?.visible
      )
        continue;
      const chopWave = Math.max(0, Math.sin(t * 10 + (tree.chopProgress || 0)));
      tree.m.rotation.x = chopWave * 0.14;
      tree.m.rotation.z = (tree.baseRotation || 0) + chopWave * 0.035;
    }
    if (this.motes && this.graphicsPreset !== "low" && motion) {
      const positions = this.motes.geometry.attributes.position.array;
      for (let i = 0; i < this.moteSeeds.length; i++) {
        const seed = this.moteSeeds[i];
        const wave = motion * (t * seed.speed + seed.phase);
        positions[i * 3] = seed.x + Math.sin(wave) * 0.18;
        positions[i * 3 + 1] = seed.y + Math.sin(wave * 1.23) * 0.12;
        positions[i * 3 + 2] = seed.z + Math.cos(wave * 0.7) * 0.12;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
      this.motes.material.opacity =
        0.38 + motion * Math.sin(t * 1.4) * 0.08;
    }
    if (this.ring) {
      const worker = this.ring.userData.worker;
      if (worker?.m) {
        this.ring.position.set(worker.m.position.x, 0.055, worker.m.position.z);
      }
      const pulse = motion * (Math.sin(t * 3.2) + 1) * 0.5;
      this.ring.scale.setScalar(1 + pulse * 0.035);
      this.ring.material.opacity = 0.4 + pulse * 0.24;
    }
    if (this.guideMarker) {
      const worker = this.guideMarker.userData.worker;
      if (worker?.m) {
        this.guideMarker.position.set(
          worker.m.position.x,
          0.54 + motion * (Math.sin(t * 2.4) + 1) * 0.06,
          worker.m.position.z,
        );
      }
      if (motion) this.guideMarker.rotation.y = t * 0.8;
    }
    const updateBuildingEffects =
      t - this.lastBuildingEffectUpdate >= BUILDING_EFFECT_UPDATE_INTERVAL;
    if (updateBuildingEffects) this.lastBuildingEffectUpdate = t;
    for (const b of this.buildings) {
      if (
        !b.siteRing &&
        !(b.pop > 0 && b.progress === 1) &&
        !b.smoke &&
        !b.lanterns
      )
        continue;
      if (b.siteRing) {
        const pulse =
          motion *
          (Math.sin(t * 3.7 + (b.siteRing.userData.phase || 0)) + 1) *
          0.5;
        b.siteRing.scale.setScalar(0.94 + pulse * 0.09);
        b.siteRing.material.opacity = 0.27 + pulse * 0.25;
      }
      if (b.pop > 0 && b.progress === 1) {
        // Completion feedback belongs to simulation time. Do not let the
        // ambient render clock keep a finished building pulsing while paused.
        const amount =
          motion * simulationMotion * Math.sin(b.pop * Math.PI) * 0.09;
        b.m.scale.x = 1 + amount;
        b.m.scale.y = 1 + amount;
        b.m.scale.z = 1 + amount;
        b.pop = Math.max(0, b.pop - dt * 2.4 * simulationMotion);
        if (b.pop === 0) b.m.scale.set(1, 1, 1);
      }
      if (b.smoke && updateBuildingEffects && motion) {
        const smokeWave = motion * (t * 0.65 + b.smoke.phase);
        for (let i = 0; i < b.smoke.particles.length; i++) {
          const p = b.smoke.particles[i];
          const cycle = motion * ((t * 0.46 + i * 0.55 + b.smoke.phase) % 2.6);
          const rise = cycle / 2.6;
          p.position.x = 0.13 + Math.sin(smokeWave + i * 0.9) * 0.11 * rise;
          p.position.y = (b.type === "townhall" ? 3.25 : 2.65) + cycle;
          p.position.z = 0.04 + Math.cos(smokeWave * 0.7 + i) * 0.06 * rise;
          p.scale.setScalar(0.7 + rise * 1.5);
          p.material.opacity = (1 - rise) * 0.17;
        }
      }
      if (b.lanterns && updateBuildingEffects) {
        const glow = this.atmosphere.nightAmount || 0;
        for (const lamp of b.lanterns.lamps) {
          lamp.glow.material.opacity = 0.025 + glow * 0.86;
          lamp.glow.scale.setScalar(0.8 + glow * 0.45);
        }
      }
    }
    this.updateLanternLights(t, motion, dt);
    const daylight = this.atmosphere.sunHeight ?? 1;
    const birdsVisible =
      daylight > 0.16 && !this.reduceMotion && this.graphicsPreset !== "low";
    if (this.birdsVisible !== birdsVisible) {
      this.birdsVisible = birdsVisible;
      for (const bird of this.birds) bird.group.visible = birdsVisible;
    }
    if (birdsVisible)
      for (const bird of this.birds) {
        const wave = t * bird.speed + bird.phase;
        bird.group.position.x = bird.centerX + Math.sin(wave) * 4.2;
        bird.group.position.z = bird.centerZ + Math.cos(wave * 0.72) * 3.2;
        bird.group.position.y = bird.baseY + Math.sin(wave * 1.25) * 0.3;
        bird.group.rotation.y = wave * 0.75;
        const flap = Math.sin(t * 7 + bird.phase) * 0.18;
        bird.left.rotation.y = -0.3 - flap;
        bird.right.rotation.y = 0.3 + flap;
      }
    for (let i = this.deliveryBursts.length - 1; i >= 0; i--) {
      const burst = this.deliveryBursts[i];
      burst.life -= dt * simulationMotion;
      const progress = 1 - Math.max(0, burst.life / 0.95);
      burst.group.position.y = 0.08 + progress * 0.55;
      burst.group.scale.setScalar(1 + progress * 0.65);
      burst.ring.material.opacity = burst.life * 0.76;
      for (let index = 0; index < burst.sparks.length; index++) {
        const spark = burst.sparks[index];
        const angle = (index / burst.sparks.length) * Math.PI * 2;
        spark.position.x = Math.cos(angle) * (0.22 + progress * 0.36);
        spark.position.z = Math.sin(angle) * (0.22 + progress * 0.36);
        spark.rotation.y += motion * simulationMotion * dt * 4;
        spark.material.opacity = burst.life * 0.9;
      }
      if (burst.life <= 0) {
        this.scene.remove(burst.group);
        burst.group.traverse((object) => {
          if (object.isMesh) {
            object.geometry.dispose();
            object.material.dispose();
          }
        });
        this.deliveryBursts.splice(i, 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
    // A paused village still renders so the camera and ambient scene remain
    // usable, but its simulation projection cannot change. Avoid rebuilding
    // the React HUD until time starts moving again; explicit actions still
    // call emit() immediately when they change state.
    if (this.speed) {
      this.lastUI += dt;
      if (this.lastUI > 0.4) {
        this.lastUI = 0;
        if (this.ready) this.emit();
      }
    }
    if (
      this.ready &&
      Math.floor(this.elapsed) % 15 === 0 &&
      this.lastSave !== Math.floor(this.elapsed)
    ) {
      this.lastSave = Math.floor(this.elapsed);
      this.save();
    }
  };
  dispose() {
    this.save();
    this.dead = true;
    this.disposeAudio();
    if (this.thumbnailTaskKind === "idle") window.cancelIdleCallback?.(this.thumbnailTask);
    if (this.thumbnailTaskKind === "timeout") window.clearTimeout(this.thumbnailTask);
    this.thumbnailTask = null;
    this.thumbnailTaskKind = null;
    this.thumbnailWaitResolve?.(false);
    this.thumbnailWaitResolve = null;
    this.thumbnailRenderer?.dispose();
    this.thumbnailRenderer = null;
    cancelAnimationFrame(this.frame);
    if (this.resizeFrame != null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.cancelPointerMove();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pagehide", this.beforeUnload);
    document.removeEventListener("visibilitychange", this.visibilityChange);
    if (this.motionQuery?.removeEventListener) {
      this.motionQuery.removeEventListener("change", this.motionChange);
    } else {
      this.motionQuery?.removeListener?.(this.motionChange);
    }
    this.container.removeEventListener("pointermove", this.move);
    this.container.removeEventListener("pointerdown", this.down);
    this.container.removeEventListener("pointerup", this.up);
    this.container.removeEventListener("pointercancel", this.cancelPointer);
    this.container.removeEventListener("contextmenu", this.context);
    window.removeEventListener("storage", this.storageChange);
    this.controls.dispose();
    this.clearHighlight();
    this.clearGhost();
    for (const light of this.lanternLights || []) {
      this.scene?.remove(light);
      light.dispose?.();
    }
    this.lanternLights = [];
    this.disposeSceneResources();
    this.renderer.renderLists.dispose?.();
    this.renderer.dispose();
    this.container.replaceChildren();
  }
}
