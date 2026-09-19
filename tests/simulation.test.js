import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CATALOG, TOWNHALL_STORAGE } from "../src/catalog.js";
import {
  finiteNumber,
  housingCapacity,
  normalizedBuildingProgress,
  reconcileRoadCount,
  saveCycleMarker,
  sanitizeCameraView,
  savedBuildingFits,
  safePopulation,
  STARTING_POPULATION,
  restoredPopulation,
  sanitizeVillageName,
  parseVillageImport,
  summarizeVillageSave,
  normalizedConstructionMaterials,
  constructionMaterialsReady,
  constructionMaterialProgress,
  GRAIN_GROW_SECONDS,
  GRAIN_VISUAL_UPDATE_INTERVAL,
  grainGrowthProgress,
  grainGrowthStage,
  TREE_REGROW_SECONDS,
  TREE_VISUAL_UPDATE_INTERVAL,
  TREE_LOG_AMOUNT,
  LUMBERYARD_PROCESS_SECONDS,
  HUNGRY_THRESHOLD,
  EAT_SECONDS,
  MEAL_SATIETY,
  treeRegrowthProgress,
  treeGrowthStage,
  WORKER_CLEARANCE,
  ROAD_SPEED,
  OFF_ROAD_SPEED,
  travelSpeed,
  travelStepCost,
  WORKER_TYPES,
  AXE_CARRY_ANGLE,
  TRAINABLE_WORKER_TYPES,
  TRAINING_SECONDS,
  jobCapacityForWorkerType,
  outputCapForBuilding,
  savedStockLimit,
  CARRIER_LOAD,
  storageForBuilding,
  isStoreBuilding,
  pendingTrainingCount,
  trainingOptions,
  workerTypeForBuilding,
  workerCapacityForBuilding,
  sceneryCandidates,
  grassCandidates,
  SCENERY_COUNT,
  GRASS_COUNT,
  GRASS_UPDATE_INTERVAL,
  ATMOSPHERE_UPDATE_INTERVAL,
  PAUSED_RENDER_INTERVAL,
  shouldRenderWorldFrame,
  lanternLightBudget,
  LANTERN_LIGHT_BUDGET,
  shadowMapSizeForPreset,
  buildRoadSurfaceGeometry,
  ROAD_TILE,
  ROAD_TINTS,
  STARTER_BUILDINGS,
  STARTER_ROADS,
  STARTER_SETTLEMENT_CLEAR_RADIUS,
  isInStarterSettlementClearing,
  Village,
  snapPlacementCoordinate,
  snapPlacement,
  isEvenBuildingType,
} from "../src/world.js";
import {
  CHAPTER_GOALS,
  chapterGoalState,
  completedPlayerMilestone,
} from "../src/progression.js";
function village() {
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    resources: { wood: 100, stone: 100, food: 100, wheat: 0, wine: 0 },
    delivered: { wood: 0, stone: 0, food: 0, wheat: 0, wine: 0 },
    buildings: [],
    workers: [],
    decor: [],
    clearedScenery: new Set(),
    roads: new Set(),
    elapsed: 0,
    gathered: 0,
    created: {},
    activityLog: [],
    nextActivityId: 0,
    scene: { remove() {} },
    notify() {},
    save() {},
  });
  return v;
}
test("placement rejects occupied sites, river, scenery, and insufficient resources", () => {
  const v = village();
  assert.equal(v.valid(0, 0, "house").ok, true);
  v.buildings.push({ type: "house", x: 0, z: 0 });
  assert.equal(v.valid(1, 1, "house").ok, false);
  assert.equal(v.valid(18, 0, "house").ok, false);
  v.decor = [{ x: 6, z: 6, r: 0.5 }];
  assert.equal(v.valid(6, 6, "farm").ok, false);
  v.decor = [];
  const worker = { m: new THREE.Object3D() };
  worker.m.position.set(6, 0, 6);
  v.workers = [worker];
  assert.match(v.valid(6, 6, "farm").reason, /villager is working/);
  v.roads.add("6,0");
  assert.match(v.valid(6, 0, "house").reason, /path crosses/);
  v.resources.wood = 0;
  v.resources.stone = 0;
  // Regular buildings may be sited short on resources: the fence goes up
  // immediately and workers haul in whatever is missing before construction.
  assert.equal(v.valid(-8, -8, "house").ok, true);
  v.resources.stone = 0;
  assert.match(v.valid(-8, -8, "road").reason, /Need 1 stone/);
});

test("malformed resource values cannot satisfy costs or create NaN totals", () => {
  const v = village();
  v.resources.stone = Number.NaN;
  assert.equal(v.valid(-8, -8, "road").ok, false);
  assert.match(v.valid(-8, -8, "road").reason, /1 stone/);
  v.resources.wood = Number.NaN;
  assert.equal(v.spendResource("wood", 5), 0);
  assert.equal(v.resources.wood, 0);

  v.roads = new Set();
  v.roadTiles = new Map();
  v.created = { road: "corrupt" };
  v.addRoad(2, 2);
  assert.equal(v.created.road, 1);

  v.resources.wood = 12;
  assert.equal(v.spendResource("wood", 5), 5);
  assert.equal(v.resources.wood, 7);

  v.buildings = [{ type: "townhall", progress: 1 }];
  v.resources.wood = -4;
  v.delivered.wood = "corrupt";
  v.gathered = Number.NaN;
  assert.equal(v.storeResource(v.buildings[0], "wood", 5), 5);
  assert.equal(v.resources.wood, 5);
  assert.equal(v.delivered.wood, 5);
  assert.equal(v.gathered, 5);
});

test("malformed food cannot start a free feast", () => {
  const v = village();
  let notice = "";
  Object.assign(v, {
    storageConflict: false,
    feast: null,
    notify(message) {
      notice = message;
    },
    announce() {},
    save() {},
    emit() {},
  });

  v.resources.food = Number.NaN;
  assert.equal(v.startFeast(), false);
  assert.equal(v.feast, null);
  assert.match(notice, /30 food/);

  v.resources.food = "29";
  assert.equal(v.startFeast(), false);
  assert.equal(v.feast, null);
});

test("starter village buildings never overlap starter paths", () => {
  assert.equal(
    STARTER_BUILDINGS.filter(([type]) => type === "house").length,
    1,
    "starter village has one cottage",
  );
  for (const [type, x, z] of STARTER_BUILDINGS) {
    const halfSize = (CATALOG[type]?.size || 4) / 2;
    const pathCrossesSite = STARTER_ROADS.some(
      (road) =>
        Math.abs(x - road.x) < halfSize + 0.5 &&
        Math.abs(z - road.z) < halfSize + 0.5,
    );
    assert.equal(pathCrossesSite, false, `${type} at ${x},${z} overlaps a starter path`);
  }
});
test("starter settlement clears trees from the central common area", () => {
  assert.equal(
    isInStarterSettlementClearing(0, 0, "tree"),
    false,
  );
  assert.equal(
    isInStarterSettlementClearing(STARTER_SETTLEMENT_CLEAR_RADIUS, 0, "tree"),
    true,
  );
  assert.equal(
    isInStarterSettlementClearing(0, 0, "rock"),
    true,
    "rocks remain available for texture in the clearing",
  );
});
test("cleared resource nodes stop blocking placement until they are removed", () => {
  const v = village();
  const tree = {
    type: "tree",
    state: "regrowing",
    claimedBy: null,
    regrowAt: TREE_REGROW_SECONDS,
    m: new THREE.Object3D(),
    x: 0,
    z: 0,
    r: 0.5,
    sceneryKey: "0.000,0.000",
  };
  v.decor = [tree];
  assert.equal(v.valid(0, 0, "house").ok, true);
  assert.equal(v.routeBlocked(0, 0), false);

  tree.state = "chopping";
  assert.match(v.valid(0, 0, "house").reason, /Trees or rocks are in the way/);

  tree.state = "regrowing";
  tree.m.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  assert.equal(v.clearClearedDecorInFootprint(0, 0, 1.5), 1);
  assert.equal(v.decor.length, 0);
  assert.equal(v.clearedScenery.has("0.000,0.000"), true);
});
test("clearing shared scenery removes the instance without disposing its template resources", () => {
  const v = village();
  let disposed = 0;
  v.disposeOwnedObject = () => {
    disposed += 1;
  };
  const tree = {
    type: "tree",
    state: "regrowing",
    x: 0,
    z: 0,
    r: 0.5,
    m: new THREE.Object3D(),
  };
  v.decor = [tree];
  assert.equal(v.clearClearedDecorInFootprint(0, 0, 1.5), 1);
  assert.equal(disposed, 0);
  assert.equal(v.decor.length, 0);
});
test("mined or depleted stone nodes stop blocking roads and buildings", () => {
  const v = village();
  v.decor = [{
    type: "rock",
    state: "mined",
    x: 0,
    z: 0,
    r: 0.6,
    m: new THREE.Object3D(),
  }];
  assert.equal(v.valid(0, 0, "road").ok, true);
  v.decor[0].state = "depleted";
  assert.equal(v.valid(0, 0, "house").ok, true);
});
test("guided placement searches for the nearest clear site", () => {
  const v = village();
  v.buildings.push({ type: "house", x: 0, z: 3 });
  v.decor = [{ x: 1, z: 3, r: 0.8 }];
  const site = v.findOpenPlacement("house", { x: 0, z: 3 });
  assert.equal(v.valid(site.x, site.z, "house").ok, true);
  assert.notDeepEqual(site, { x: 0, z: 3 });
});
test("guided placement coordinates snap to grid-aligned parity coordinates", () => {
  const v = village();
  const farmSite = v.findOpenPlacement("farm", { x: 0.2, z: 3.8 });
  // Even footprints (farm: size 4) snap to half-integers so edges land on half-integer grid boundaries
  assert.equal(Math.abs(farmSite.x % 1), 0.5);
  assert.equal(Math.abs(farmSite.z % 1), 0.5);
  const farmEdgesX = [farmSite.x - 2, farmSite.x + 2];
  const farmEdgesZ = [farmSite.z - 2, farmSite.z + 2];
  assert.equal(Math.abs(farmEdgesX[0] % 1), 0.5);
  assert.equal(Math.abs(farmEdgesX[1] % 1), 0.5);
  assert.equal(Math.abs(farmEdgesZ[0] % 1), 0.5);
  assert.equal(Math.abs(farmEdgesZ[1] % 1), 0.5);

  const houseSite = v.findOpenPlacement("house", { x: 0.2, z: 3.8 });
  // Odd footprints (house: size 3) snap to integers so edges land on half-integer grid boundaries
  assert.equal(Number.isInteger(houseSite.x), true);
  assert.equal(Number.isInteger(houseSite.z), true);
  const houseEdgesX = [houseSite.x - 1.5, houseSite.x + 1.5];
  const houseEdgesZ = [houseSite.z - 1.5, houseSite.z + 1.5];
  assert.equal(Math.abs(houseEdgesX[0] % 1), 0.5);
  assert.equal(Math.abs(houseEdgesX[1] % 1), 0.5);
  assert.equal(Math.abs(houseEdgesZ[0] % 1), 0.5);
  assert.equal(Math.abs(houseEdgesZ[1] % 1), 0.5);
});
test("placement snapping aligns footprint edges with cell boundary grid lines for even and odd sizes", () => {
  // Odd size (size 1: road/grainfield, size 3: cottage/bakery)
  assert.equal(isEvenBuildingType("road"), false);
  assert.equal(isEvenBuildingType("house"), false);
  assert.equal(snapPlacementCoordinate(1.2, "road"), 1);
  assert.equal(snapPlacementCoordinate(2.7, "house"), 3);

  // Even size (size 2: well, size 4: farm/inn/storehouse)
  assert.equal(isEvenBuildingType("well"), true);
  assert.equal(isEvenBuildingType("farm"), true);
  assert.equal(snapPlacementCoordinate(1.2, "well"), 1.5);
  assert.equal(snapPlacementCoordinate(2.1, "farm"), 2.5);
  assert.equal(snapPlacementCoordinate(2.9, "farm"), 2.5);

  const farmPlacement = snapPlacement(2.1, 4.8, "farm");
  assert.deepEqual(farmPlacement, { x: 2.5, z: 4.5 });
  // Size 4 extents: [2.5 - 2, 2.5 + 2] = [0.5, 4.5] (all land on half-integer grid lines)
  assert.equal(Math.abs((farmPlacement.x - 2) % 1), 0.5);
  assert.equal(Math.abs((farmPlacement.x + 2) % 1), 0.5);
  assert.equal(Math.abs((farmPlacement.z - 2) % 1), 0.5);
  assert.equal(Math.abs((farmPlacement.z + 2) % 1), 0.5);

  const housePlacement = snapPlacement(2.1, 4.8, "house");
  assert.deepEqual(housePlacement, { x: 2, z: 5 });
  // Size 3 extents: [2 - 1.5, 2 + 1.5] = [0.5, 3.5] (all land on half-integer grid lines)
  assert.equal(Math.abs((housePlacement.x - 1.5) % 1), 0.5);
  assert.equal(Math.abs((housePlacement.x + 1.5) % 1), 0.5);
  assert.equal(Math.abs((housePlacement.z - 1.5) % 1), 0.5);
  assert.equal(Math.abs((housePlacement.z + 1.5) % 1), 0.5);
});
test("keyboard movement moves placement by unit increments while preserving parity", () => {
  const v = village();
  v.selected = "farm";
  v.rotation = 0;
  v.ghost = new THREE.Object3D();
  v.footprint = { visible: false, position: { set: () => {} }, material: { color: { set: () => {} } } };
  v.previewOutline = { visible: false, position: { set: () => {} }, rotation: { y: 0 }, material: { color: { set: () => {} } } };
  v.emit = () => {};

  // Initialize placement at (0.5, 0.5)
  v.updatePlacement(0.5, 0.5);
  assert.deepEqual({ x: v.placement.x, z: v.placement.z }, { x: 0.5, z: 0.5 });

  // Move by (+1, 0)
  v.movePlacement(1, 0);
  assert.deepEqual({ x: v.placement.x, z: v.placement.z }, { x: 1.5, z: 0.5 });

  // Move by (0, -1)
  v.movePlacement(0, -1);
  assert.deepEqual({ x: v.placement.x, z: v.placement.z }, { x: 1.5, z: -0.5 });

  // Odd footprint (house)
  v.selected = "house";
  v.placement = null;
  v.movePlacement(1, -1);
  assert.deepEqual({ x: v.placement.x, z: v.placement.z }, { x: 1, z: -1 });
});
test("road overlap checks use the numeric tile index and retain a save-set fallback", () => {
  const v = village();
  v.roads = new Set(["99,99"]);
  v.roadTiles = new Map([["2,-3", { x: 2, z: -3 }]]);
  assert.equal(v.overlapsRoad(2, -3, 1), true);
  assert.equal(v.overlapsRoad(10, 10, 1), false);

  v.roadTiles.clear();
  assert.equal(v.overlapsRoad(99, 99, 1), true);
});
test("successful building placement clears the active placement tool", () => {
  const selections = [];
  let placementComplete = 0;
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    ready: true,
    selected: "house",
    placement: { x: 0, z: 0, ok: true },
    storageConflict: false,
    resources: { wood: 100, stone: 100 },
    buildings: [],
    workers: [],
    created: {},
    decor: [{
      type: "tree",
      state: "regrowing",
      x: 0,
      z: 0,
      r: 0.5,
      m: new THREE.Object3D(),
    }],
    ensureAudio() {},
    playSound() {},
    addBuilding() {},
    announce() {},
    notify() {},
    save() {},
    emit() {},
    select(type) {
      selections.push(type);
      this.selected = type;
      this.placement = null;
    },
    onPlacementComplete() {
      placementComplete++;
    },
  });
  assert.equal(v.confirmPlacement(), true);
  assert.deepEqual(selections, [null]);
  assert.equal(placementComplete, 1);
  assert.equal(v.selected, null);
  assert.equal(v.placement, null);
  assert.equal(v.decor.length, 0);
});
test("focusing a villager frames them, selects them, and advances the introduction", () => {
  const worker = { id: "worker-1", m: new THREE.Object3D(), building: null };
  worker.m.position.set(4, 0, -2);
  let selected = null;
  let highlighted = null;
  let saved = 0;
  let emitted = 0;
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    workers: [worker],
    tutorialStep: 1,
    controls: { target: new THREE.Vector3(), update() {} },
    camera: { position: new THREE.Vector3() },
    onSelect(value) {
      selected = value;
    },
    highlightWorker(value) {
      highlighted = value;
    },
    save() {
      saved++;
    },
    emit() {
      emitted++;
    },
  });
  assert.equal(v.focusWorker(worker.id), true);
  assert.equal(v.controls.target.x, 4);
  assert.equal(v.controls.target.z, -2);
  assert.equal(v.camera.position.x, 22);
  assert.equal(v.camera.position.z, 20);
  assert.equal(selected.workerId, worker.id);
  assert.equal(highlighted, worker);
  assert.equal(v.tutorialStep, 2);
  assert.equal(saved, 1);
  assert.equal(emitted, 1);
});
test("direct worker clicks persist the villager tutorial step", () => {
  const worker = { id: "worker-1", m: new THREE.Object3D(), building: null };
  worker.m.userData.worker = worker;
  let saved = 0;
  let emitted = 0;
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    ready: true,
    selected: null,
    workers: [worker],
    buildings: [],
    tutorialStep: 1,
    pointerMove() {},
    raycaster: { intersectObjects() { return [{ object: worker.m }]; } },
    onSelect() {},
    highlightWorker() {},
    save() {
      saved++;
    },
    emit() {
      emitted++;
    },
  });
  v.click({ button: 0 });
  assert.equal(v.tutorialStep, 2);
  assert.equal(saved, 1);
  assert.equal(emitted, 1);
});
test("saved building footprints reject overlap, river, and invalid types", () => {
  const existing = [{ type: "house", x: 0, z: 0, progress: 1 }];
  assert.equal(savedBuildingFits({ type: "farm", x: 6, z: 6 }, existing), true);
  assert.equal(savedBuildingFits({ type: "house", x: 1, z: 1 }, existing), false);
  assert.equal(savedBuildingFits({ type: "house", x: 18, z: 0 }, existing), false);
  assert.equal(savedBuildingFits({ type: "road", x: 4, z: 4 }, existing), false);
  assert.equal(savedBuildingFits({ type: "unknown", x: 4, z: 4 }, existing), false);
  assert.equal(
    savedBuildingFits({ type: "townhall", x: -3, z: -3 }, [
      { type: "townhall", x: -3, z: -3 },
    ]),
    false,
  );
});

test("watchtowers expand the shared build boundary", () => {
  const v = village();
  assert.equal(v.buildBoundary(), 18);
  v.buildings.push({ type: "watchtower", progress: 1 });
  assert.equal(v.buildBoundary(), 21);
  v.buildings.push({ type: "watchtower", progress: 0.5 });
  assert.equal(v.buildBoundary(), 21);
});

test("path painting lays a segment and stops before an occupied tile", () => {
  const v = village();
  v.addRoad = (x, z) => v.roads.add(`${x},${z}`);
  v.emit = () => {};
  v.buildings.push({ type: "house", x: 4, z: 0 });
  v.paintRoad({ x: 0, z: 0 }, { x: 5, z: 0 });
  assert.deepEqual([...v.roads], ["0,0", "1,0", "2,0"]);
  assert.equal(v.resources.stone, 97);
  assert.match(v.activity, /3 path tiles laid/);
  const limited = village();
  limited.addRoad = (x, z) => limited.roads.add(`${x},${z}`);
  limited.emit = () => {};
  limited.resources.stone = 2;
  limited.paintRoad({ x: 0, z: 0 }, { x: 5, z: 0 });
  assert.deepEqual([...limited.roads], ["0,0", "1,0"]);
  assert.equal(limited.resources.stone, 0);
});
test("path painting chooses the clear Manhattan turn around an obstacle", () => {
  const v = village();
  v.addRoad = (x, z) => v.roads.add(`${x},${z}`);
  v.emit = () => {};
  v.buildings.push({ type: "house", x: 2, z: 0 });
  v.paintRoad({ x: 0, z: 0 }, { x: 3, z: 3 });
  assert.deepEqual([...v.roads], [
    "0,0",
    "0,1",
    "0,2",
    "0,3",
    "1,3",
    "2,3",
    "3,3",
  ]);
  assert.equal(v.resources.stone, 93);
});
test("worker path routes around building footprints", () => {
  const v = village();
  v.buildings.push({ type: "house", x: 0, z: 0 });
  const w = { m: new THREE.Object3D() };
  w.m.position.set(-4, 0, 0);
  assert.equal(v.route(w, 4, 0), true);
  assert.ok(w.path.length > 8);
  assert.ok(w.path.every((p) => !v.blocked(p.x, p.z, 0.1)));
  assert.equal(w.path.at(-1).x, 4);
});

test("worker path routes around scenery obstacles", () => {
  const v = village();
  v.decor = [{ x: 1, z: 0, r: 0.55 }];
  const w = { m: new THREE.Object3D() };
  w.m.position.set(0, 0, 0);
  assert.equal(v.route(w, 4, 0), true);
  assert.ok(w.path.every((point) => !v.routeBlocked(point.x, point.z)));
  assert.ok(w.path.some((point) => point.z !== 0));
});
test("villagers keep full pace on a stone path and cross open ground at 0.7x", () => {
  assert.equal(travelSpeed(true), ROAD_SPEED);
  assert.equal(travelSpeed(false), OFF_ROAD_SPEED);
  assert.equal(OFF_ROAD_SPEED, 0.7);
  assert.equal(
    Number((travelSpeed(false) / travelSpeed(true)).toFixed(4)),
    Number((0.7 / 1.5).toFixed(4)),
  );
});
test("worker road-speed caching follows path edits and tile changes", () => {
  const v = village();
  v.baseRoads = new Set();
  v.emit = () => {};
  const worker = { m: new THREE.Object3D() };
  worker.m.position.set(0, 0, 0);
  assert.equal(v.workerOnRoad(worker), false);
  v.addRoad(0, 0);
  assert.equal(v.workerOnRoad(worker), true);
  worker.m.position.x = 1;
  assert.equal(v.workerOnRoad(worker), false);
  v.addRoad(1, 0);
  assert.equal(v.workerOnRoad(worker), true);
  assert.equal(v.removeRoad(1, 0), true);
  assert.equal(v.workerOnRoad(worker), false);
});
test("routing costs a tile by travel time, so open ground costs more than paving", () => {
  assert.ok(travelStepCost(false) > travelStepCost(true));
  // Cost is the inverse of speed, so the cost ratio mirrors the speed ratio.
  assert.equal(
    Number((travelStepCost(false) / travelStepCost(true)).toFixed(4)),
    Number((ROAD_SPEED / OFF_ROAD_SPEED).toFixed(4)),
  );
});
test("worker routing prefers a longer connected road", () => {
  const v = village();
  v.buildings.push({ type: "house", x: 2, z: 0 });
  [
    [0, -1],
    [0, -2],
    [1, -2],
    [2, -2],
    [3, -2],
    [4, -2],
    [4, -1],
  ].forEach(([x, z]) => v.roads.add(`${x},${z}`));
  const w = { m: new THREE.Object3D() };
  w.m.position.set(0, 0, 0);
  assert.equal(v.route(w, 4, 0), true);
  assert.ok(w.path.some((point) => point.z === -2));
});
test("worker routing caches static and congestion checks per tile", () => {
  const v = village();
  const worker = { m: new THREE.Object3D(), path: [] };
  worker.m.position.set(0, 0, 0);
  const blockedTiles = new Set();
  const congestionTiles = new Set();
  let blockedCalls = 0;
  let congestionCalls = 0;
  v.routeBlocked = (x, z) => {
    blockedCalls++;
    blockedTiles.add(`${x},${z}`);
    return false;
  };
  v.workerCongestion = (x, z) => {
    congestionCalls++;
    congestionTiles.add(`${x},${z}`);
    return 0;
  };
  assert.equal(v.route(worker, 6, 0), true);
  assert.equal(blockedCalls, blockedTiles.size);
  assert.equal(congestionCalls, congestionTiles.size);
});
test("worker movement reuses its temporary vectors across frames", () => {
  const v = village();
  v.routeTargetBlocked = () => false;
  v.workerMoveBlocker = () => null;
  const worker = {
    m: new THREE.Object3D(),
    path: [new THREE.Vector3(2, 0, 0)],
    phase: "travel",
    deadlockYieldTime: 0,
  };
  v.workers = [worker];
  v.moveWorker(worker, 0.05);
  const vectors = worker.motionVectors;
  assert.ok(vectors);
  worker.path = [new THREE.Vector3(2, 0, 0)];
  v.moveWorker(worker, 0.05);
  assert.equal(worker.motionVectors, vectors);
});
test("deadlock escape reuses its candidate vectors without sharing targets", () => {
  const v = village();
  const worker = { m: new THREE.Object3D(), movementPriority: 0 };
  v.workers = [worker];
  v.workerCanStepTo = () => true;
  const center = new THREE.Vector3();
  const first = v.deadlockEscapeTarget(worker, center);
  const vectors = worker.deadlockMotionVectors;
  const second = v.deadlockEscapeTarget(worker, center);

  assert.ok(vectors);
  assert.equal(worker.deadlockMotionVectors, vectors);
  assert.notEqual(first, second);
  assert.deepEqual(first.toArray(), second.toArray());
});
test("expired avoidance resumes the worker's original path direction", () => {
  const v = village();
  v.routeTargetBlocked = () => false;
  v.workerMoveBlocker = () => null;
  const worker = {
    m: new THREE.Object3D(),
    path: [new THREE.Vector3(2, 0, 0)],
    phase: "travel",
    deadlockYieldTime: 0,
    avoidanceTarget: new THREE.Vector3(0.01, 0, 0),
    avoidanceTime: 0,
  };
  v.workers = [worker];
  v.moveWorker(worker, 0.05);
  assert.ok(worker.m.position.x > 0.05);
});
test("worker assignment prefers the closest equally staffed work site", () => {
  const v = village();
  const near = {
    type: "lumberyard",
    progress: 1,
    x: 2,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  const far = {
    type: "mine",
    progress: 1,
    x: 10,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  const w = {
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    building: null,
  };
  w.m.position.set(0, 0, 0);
  v.buildings = [far, near];
  v.workers = [w];
  v.route = () => true;
  v.simulate(0.1);
  assert.equal(w.building, near);
  assert.equal(w.phase, "travel");
});
test("job point ranking keeps the first lowest-cost approach", () => {
  const v = village();
  const worker = { m: new THREE.Object3D() };
  worker.m.position.set(0, 0, 0);
  const building = { type: "well", x: 0, z: 0 };
  v.routeBlocked = () => false;
  v.workerPositionBlocked = () => false;
  v.workerTargetBlocked = () => false;
  v.workerCongestion = (x, z) => (x === 2 && z === 0 ? 0 : 10);
  assert.deepEqual(v.jobPoint(building, worker), [2, 0]);
});
test("worker assignment reuses each site's ranked distance", () => {
  const v = village();
  const near = {
    type: "lumberyard",
    progress: 1,
    x: 2,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  const far = {
    type: "mine",
    progress: 1,
    x: 10,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  const worker = {
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    building: null,
  };
  v.buildings = [far, near];
  v.workers = [worker];
  v.route = () => true;
  let jobPointCalls = 0;
  v.jobPoint = (building) => {
    jobPointCalls++;
    return [building.x, building.z];
  };
  v.simulate(0.1);
  assert.equal(worker.building, near);
  assert.equal(jobPointCalls, 3, "two ranking distances plus the selected route");
});
test("production buildings enforce worker roles and employment caps", () => {
  assert.equal(workerTypeForBuilding("lumberyard"), WORKER_TYPES.WOODCUTTER);
  assert.equal(workerTypeForBuilding("mine"), WORKER_TYPES.MINER);
  assert.equal(workerTypeForBuilding("farm"), WORKER_TYPES.FARMER);
  assert.equal(workerTypeForBuilding("bakery"), WORKER_TYPES.BAKER);
  assert.equal(workerCapacityForBuilding("lumberyard"), 2);
  assert.equal(workerCapacityForBuilding("farm"), 1);
  assert.equal(workerCapacityForBuilding("mine"), 1);
  assert.equal(workerCapacityForBuilding("bakery"), 1);
});
test("a lumberyard employs two woodcutters and leaves the next worker a builder", () => {
  const v = village();
  const lumberyard = {
    type: "lumberyard",
    progress: 1,
    x: 0,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  v.buildings = [lumberyard];
  v.route = () => true;
  v.jobPoint = () => [0, 0];
  const workers = Array.from({ length: 3 }, (_, index) => ({
    id: `worker-${index}`,
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    building: null,
  }));
  workers.forEach((worker) => {
    worker.m.position.set(0, 0, 0);
    v.workers.push(worker);
    v.assign(worker);
  });
  assert.equal(workers[0].workerType, WORKER_TYPES.WOODCUTTER);
  assert.equal(workers[1].workerType, WORKER_TYPES.WOODCUTTER);
  assert.equal(workers[2].workerType, WORKER_TYPES.BUILDER);
  assert.equal(workers.filter((worker) => worker.building === lumberyard).length, 2);
});
test("lumberyard workers chop trees, saw planks, and wait for regrowth", () => {
  const v = village();
  const lumberyard = {
    type: "lumberyard",
    progress: 1,
    x: 0,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  const hall = {
    type: "townhall",
    progress: 1,
    x: -3,
    z: -3,
    m: new THREE.Object3D(),
  };
  const tree = {
    type: "tree",
    state: "available",
    claimedBy: null,
    regrowAt: null,
    baseScale: 1,
    m: new THREE.Object3D(),
    x: 2,
    z: 0,
    r: 0.5,
  };
  const worker = {
    id: "worker-lumber",
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    building: null,
    carry: null,
  };
  v.decor = [tree];
  v.buildings = [hall, lumberyard];
  v.workers = [worker];
  v.route = () => true;
  v.jobPoint = () => [0, 0];
  v.showCarry = () => {};
  v.clearCarry = () => {};
  v.deliveryBurst = () => {};

  v.simulate(0.1);
  assert.equal(worker.building, lumberyard);
  assert.equal(worker.tree, tree);
  assert.equal(worker.phase, "travel");
  v.simulate(0.1);
  assert.equal(worker.phase, "chop");
  assert.equal(tree.state, "chopping");
  v.simulate(4.5);
  assert.equal(worker.phase, "lumber_delivery");
  assert.deepEqual(worker.carry, {
    resource: "wood",
    amount: TREE_LOG_AMOUNT,
    product: "logs",
  });
  assert.equal(tree.state, "regrowing");
  assert.equal(tree.regrowAt, v.elapsed + TREE_REGROW_SECONDS);
  v.simulate(0.1);
  assert.equal(worker.phase, "process");
  assert.equal(worker.timer, LUMBERYARD_PROCESS_SECONDS);
  v.simulate(LUMBERYARD_PROCESS_SECONDS);
  // Planks stack in the yard's own store; only a carrier moves them on.
  assert.equal(worker.phase, "idle");
  assert.equal(worker.carry, null);
  assert.equal(lumberyard.stock, TREE_LOG_AMOUNT);
  assert.equal(v.resources.wood, 100);
  assert.equal(lumberyard.cycles, 1);
  assert.ok(treeRegrowthProgress(tree.regrowAt, v.elapsed) > 0);
  assert.ok(treeRegrowthProgress(tree.regrowAt, v.elapsed) < 1);
  v.simulate(TREE_REGROW_SECONDS - 0.1);
  assert.equal(tree.state, "available");
  assert.equal(treeRegrowthProgress(tree.regrowAt, v.elapsed), 1);
});

test("tree selection skips unavailable nodes without reordering the forest", () => {
  const v = village();
  const lumberyard = { type: "lumberyard", x: 0, z: 0 };
  const worker = { m: new THREE.Object3D() };
  worker.m.position.set(0, 0, 0);
  const claimed = {
    type: "tree",
    state: "available",
    claimedBy: "other-worker",
    x: 1,
    z: 0,
  };
  const regrowing = {
    type: "tree",
    state: "regrowing",
    claimedBy: null,
    x: 0,
    z: 1,
  };
  const nearest = {
    type: "tree",
    state: "available",
    claimedBy: null,
    x: 0,
    z: 1.5,
  };
  const tieByYard = {
    type: "tree",
    state: "available",
    claimedBy: null,
    x: 2,
    z: 0,
  };
  v.decor = [claimed, regrowing, nearest, tieByYard];
  assert.equal(v.availableTreeFor(lumberyard, worker), nearest);
  nearest.claimedBy = "worker-lumber";
  assert.equal(v.availableTreeFor(lumberyard, worker), tieByYard);
});

test("grain fields grow through readable stages and cap at ripe", () => {
  assert.equal(grainGrowthStage(10, 10), "sown");
  assert.equal(grainGrowthStage(10, 10 + GRAIN_GROW_SECONDS * 0.3), "sprout");
  assert.equal(grainGrowthStage(10, 10 + GRAIN_GROW_SECONDS * 0.7), "growing");
  assert.equal(grainGrowthStage(10, 10 + GRAIN_GROW_SECONDS), "ripe");
  assert.equal(grainGrowthProgress(10, 1000), 1);
});

test("grain visual stage checks are throttled between updates", () => {
  const v = village();
  const field = { type: "grainfield", plantedAt: 0, fieldStage: "sown" };
  let checks = 0;
  v.buildings = [field];
  v.updateGrainFieldVisual = (candidate) => {
    checks++;
    candidate.fieldStage = grainGrowthStage(candidate.plantedAt, v.elapsed);
  };

  assert.equal(v.updateGrainFields(), false);
  assert.equal(checks, 1);
  v.elapsed = GRAIN_VISUAL_UPDATE_INTERVAL * 0.5;
  assert.equal(v.updateGrainFields(), false);
  assert.equal(checks, 1);
  v.elapsed = GRAIN_VISUAL_UPDATE_INTERVAL;
  assert.equal(v.updateGrainFields(), false);
  assert.equal(checks, 2);
  v.elapsed = GRAIN_GROW_SECONDS * 0.3;
  assert.equal(v.updateGrainFields(), true);
  assert.equal(field.fieldStage, "sprout");
  assert.equal(checks, 3);
});

test("tree regrowth uses stump, sapling, and full stages", () => {
  assert.equal(treeGrowthStage(0), "stump");
  assert.equal(treeGrowthStage(0.3), "sapling");
  assert.equal(treeGrowthStage(1), "full");
});

test("tree visuals hide the canopy at the stump and restore it while growing", () => {
  const v = village();
  const m = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  trunk.name = "Trunk";
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1));
  canopy.name = "Pine";
  m.add(trunk, canopy);
  const tree = {
    type: "tree",
    state: "regrowing",
    regrowAt: TREE_REGROW_SECONDS,
    baseScale: 1,
    m,
    trunkMeshes: [trunk],
    canopyMeshes: [canopy],
  };

  v.updateTreeVisual(tree);
  assert.equal(tree.m.userData.growthStage, "stump");
  assert.equal(trunk.visible, true);
  assert.equal(canopy.visible, false);
  assert.equal(tree.m.scale.y, 0.24);

  v.elapsed = TREE_VISUAL_UPDATE_INTERVAL * 0.5;
  assert.equal(v.updateTreeVisual(tree), false, "unchanged tree visuals are throttled");
  assert.equal(tree.m.scale.y, 0.24);

  v.elapsed = TREE_REGROW_SECONDS * 0.3;
  assert.equal(v.updateTreeVisual(tree), true);
  assert.equal(tree.m.userData.growthStage, "sapling");
  assert.equal(canopy.visible, true);
  assert.ok(tree.m.scale.y > 0.24 && tree.m.scale.y < 1);

  v.elapsed = TREE_REGROW_SECONDS;
  v.updateTreeVisual(tree);
  assert.equal(tree.m.userData.growthStage, "full");
  assert.equal(canopy.visible, true);
  assert.equal(tree.m.scale.y, 1);
});

test("building pick roots follow grain-field model swaps", () => {
  const v = village();
  v.scene = { remove() {} };
  v.buildingPickTargets = [];
  v.pickTargets = [];
  v.model = () => new THREE.Group();
  const field = {
    type: "grainfield",
    x: 2,
    z: 3,
    plantedAt: 0,
    rotation: 0,
  };

  v.updateGrainFieldVisual(field, true);
  const first = field.m;
  assert.deepEqual(v.buildingPickTargets, [first]);
  assert.deepEqual(v.pickTargets, [first]);

  v.elapsed = GRAIN_GROW_SECONDS;
  v.updateGrainFieldVisual(field);
  assert.notEqual(field.m, first);
  assert.deepEqual(v.buildingPickTargets, [field.m]);
  assert.deepEqual(v.pickTargets, [field.m]);
});

test("windmills do not show bakery work effects", () => {
  const v = village();
  v.scene = { add() {}, remove() {} };
  const worker = {
    insideBuilding: true,
    building: { type: "windmill" },
    phase: "work",
    workEffect: null,
  };

  v.updateWorkerWorkEffect(worker, 1, 1);
  assert.equal(worker.workEffect, null);
});

test("leaving an open worksite hides its transient work effect", () => {
  const v = village();
  const worker = {
    m: new THREE.Object3D(),
    building: { type: "bakery" },
    workEffect: { visible: true },
  };
  v.setWorkerInside(worker, false);
  assert.equal(worker.insideBuilding, false);
  assert.equal(worker.workEffect.visible, false);
});

test("reduced motion leaves work effects in a static pose", () => {
  const v = village();
  const worker = {
    building: { type: "bakery" },
    insideBuilding: true,
    phase: "work",
    workEffect: {
      visible: false,
      position: new THREE.Vector3(),
      userData: {
        type: "bakery",
        action: { rotation: { z: 1 } },
        flour: { position: { y: 2 }, rotation: { y: 3 } },
      },
    },
  };
  v.updateWorkerWorkEffect(worker, 10, 0);
  assert.equal(worker.workEffect.visible, true);
  assert.equal(worker.workEffect.userData.action.rotation.z, 0);
  assert.equal(worker.workEffect.userData.flour.position.y, 0);
});

test("windmills cache their sail pivot when added", () => {
  const v = village();
  const model = new THREE.Group();
  const sails = new THREE.Group();
  sails.name = "Sails";
  model.add(sails);
  v.model = () => model;

  const windmill = v.addBuilding("windmill", 4, 5);
  assert.equal(windmill.sails, sails);
});

test("grain plots must connect to a completed farmhouse and can extend as a chain", () => {
  const v = village();
  v.buildings = [{ type: "farm", progress: 1, x: 6, z: 6 }];
  assert.equal(v.valid(9, 6, "grainfield").ok, true);
  assert.match(v.valid(12, 6, "grainfield").reason, /beside a completed farmhouse/);
  v.buildings.push({ type: "grainfield", progress: 1, x: 9, z: 6 });
  assert.equal(v.valid(10, 6, "grainfield").ok, true);
  v.buildings[0].progress = 0.5;
  v.buildings.splice(1);
  assert.equal(v.valid(9, 6, "grainfield").ok, false);
});

test("farm field lookup follows only four-way connected plots", () => {
  const v = village();
  const farm = { type: "farm", progress: 1, x: 0, z: 0 };
  const first = { type: "grainfield", progress: 1, x: 3, z: 0 };
  const second = { type: "grainfield", progress: 1, x: 4, z: 0 };
  const diagonal = { type: "grainfield", progress: 1, x: 4, z: 1 };
  v.buildings = [farm, first, second, diagonal];
  assert.deepEqual(v.grainFieldsForFarm(farm), [first, second, diagonal]);
  v.buildings = [farm, first, diagonal];
  assert.deepEqual(v.grainFieldsForFarm(farm), [first]);
});

test("a farmer harvests only ripe connected grain and stocks it at the farmhouse", () => {
  const v = village();
  const hall = { type: "townhall", progress: 1, x: 0, z: 0 };
  const farm = { type: "farm", progress: 1, x: 6, z: 6, cycles: 0 };
  const field = {
    type: "grainfield",
    progress: 1,
    x: 9,
    z: 6,
    plantedAt: 0,
    claimedBy: null,
    cycles: 0,
  };
  const worker = {
    id: "worker-farmer",
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    workDuration: 0,
    building: null,
  };
  worker.m.position.set(4, 0, 6);
  v.buildings = [hall, farm, field];
  v.workers = [worker];
  v.elapsed = GRAIN_GROW_SECONDS;
  v.route = (candidate, x, z) => {
    candidate.routeTarget = { x, z };
    return true;
  };
  v.updateGrainFieldVisual = () => {};
  v.showCarry = () => {};
  v.clearCarry = () => {};
  v.deliveryBurst = () => {};
  v.assign(worker);
  assert.equal(worker.building, farm);
  assert.equal(worker.field, field);
  assert.equal(worker.workInside, false);
  assert.deepEqual(worker.routeTarget, { x: field.x, z: field.z });
  assert.equal(field.claimedBy, worker.id);
  worker.path = [];
  v.simulate(0.1);
  assert.equal(worker.phase, "harvest");
  assert.equal(worker.insideBuilding, false);
  assert.equal(worker.m.visible, true);
  v.simulate(4);
  // The harvest is carried back to the farmhouse store, not to the hall.
  assert.equal(worker.phase, "stock_delivery");
  assert.equal(worker.insideBuilding, false);
  assert.equal(worker.m.visible, true);
  assert.deepEqual(worker.carry, { resource: "wheat", amount: 8, toStock: true });
  const [farmX, farmZ] = v.jobPoint(farm, worker);
  assert.deepEqual(worker.routeTarget, { x: farmX, z: farmZ });
  assert.equal(field.claimedBy, null);
  assert.equal(field.cycles, 1);
  assert.equal(grainGrowthStage(field.plantedAt, v.elapsed), "sown");
  v.simulate(0.1);
  assert.equal(farm.stock, 8);
  assert.equal(v.resources.wheat, 0);
  assert.equal(worker.carry, null);
});

test("a farmer keeps a partial harvest until the farmhouse has room", () => {
  const v = village();
  const farm = {
    type: "farm",
    progress: 1,
    x: 6,
    z: 6,
    cycles: 0,
    stock: outputCapForBuilding("farm") - 2,
  };
  const worker = {
    id: "worker-farmer",
    m: new THREE.Object3D(),
    path: [],
    phase: "stock_delivery",
    timer: 0,
    workDuration: 0,
    building: farm,
    carry: { resource: "wheat", amount: 8, toStock: true },
    waitingForStock: false,
  };
  v.buildings = [farm];
  v.workers = [worker];
  v.clearCarry = () => {};
  v.deliveryBurst = () => {};

  v.simulate(0.1);
  assert.equal(farm.stock, outputCapForBuilding("farm"));
  assert.deepEqual(worker.carry, { resource: "wheat", amount: 6, toStock: true });
  assert.equal(worker.phase, "stock_delivery");
  assert.equal(worker.waitingForStock, true);

  farm.stock -= 8;
  worker.deliveryRetry = 0;
  v.simulate(0.1);
  assert.equal(farm.stock, 14);
  assert.equal(worker.carry, null);
  assert.equal(worker.phase, "idle");
  assert.equal(worker.waitingForStock, false);
});

test("a baker enters the bakery before starting a production cycle", () => {
  const v = village();
  const bakery = { type: "bakery", progress: 1, x: 6, z: 6, cycles: 0 };
  const inn = { id: "inn-1", type: "inn", progress: 1, x: 10, z: 6, cycles: 0, breadStock: 0 };
  const worker = {
    id: "worker-baker",
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    workDuration: 0,
    building: null,
    workerType: WORKER_TYPES.BAKER,
  };
  const routeCalls = [];
  v.buildings = [bakery, inn];
  v.workers = [worker];
  v.route = (_worker, x, z, ignoredBuilding) => {
    routeCalls.push({ x, z, ignoredBuilding });
    return true;
  };
  v.assign(worker);
  assert.deepEqual(routeCalls[0], { x: bakery.x, z: bakery.z, ignoredBuilding: bakery });
  assert.equal(worker.workInside, true);
  worker.path = [];
  v.simulate(0.1);
  assert.equal(worker.phase, "work");
  assert.equal(worker.insideBuilding, true);
  assert.equal(worker.m.visible, true);
});

function trainingVillage(buildings, workers) {
  const v = village();
  v.buildings = buildings;
  v.workers = workers;
  v.emit = () => {};
  v.playSound = () => {};
  // addWorker needs the renderer; the rules under test do not.
  v.addWorker = () => {
    const worker = { id: `worker-${v.workers.length}`, phase: "idle" };
    v.workers.push(worker);
    return worker;
  };
  v.setWorkerType = (worker, type) => {
    worker.workerType = type;
    return type;
  };
  return v;
}

test("job posts, not just housing, cap what the School can train", () => {
  const buildings = [
    { type: "bakery", progress: 1 },
    { type: "windmill", progress: 1 },
    { type: "lumberyard", progress: 1 },
    { type: "mine", progress: 0.4 },
  ];
  // A bakery and a windmill both employ bakers; a lumberyard takes two.
  assert.equal(jobCapacityForWorkerType(buildings, WORKER_TYPES.BAKER), 2);
  assert.equal(jobCapacityForWorkerType(buildings, WORKER_TYPES.WOODCUTTER), 2);
  // The mine is still under construction, so it offers no post yet.
  assert.equal(jobCapacityForWorkerType(buildings, WORKER_TYPES.MINER), 0);
  const options = trainingOptions(buildings, []);
  assert.deepEqual(
    options.map((option) => option.type),
    TRAINABLE_WORKER_TYPES.slice(),
  );
  const miner = options.find((option) => option.type === WORKER_TYPES.MINER);
  assert.equal(miner.canTrain, false);
  assert.match(miner.reason, /Stone mine/);
});

test("the School runs a countdown, then the villager arrives", () => {
  const school = { id: "school-1", type: "school", progress: 1, cycles: 0 };
  const buildings = [
    school,
    { type: "bakery", progress: 1 },
    { type: "house", progress: 1 },
    { type: "house", progress: 1 },
  ];
  const v = trainingVillage(buildings, [{ id: "w0" }, { id: "w1" }]);
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.BAKER), true);
  // Nobody arrives yet: the School holds an apprentice for the full term.
  assert.equal(v.workers.length, 2);
  assert.equal(school.training.type, WORKER_TYPES.BAKER);
  assert.equal(school.training.remaining, TRAINING_SECONDS);
  assert.equal(pendingTrainingCount(v.buildings, WORKER_TYPES.BAKER), 1);
  // The reserved post is not offered twice.
  const pendingOption = trainingOptions(v.buildings, v.workers).find(
    (option) => option.type === WORKER_TYPES.BAKER,
  );
  assert.equal(pendingOption.canTrain, false);
  assert.match(pendingOption.reason, /already in training/);
  v.updateTraining(TRAINING_SECONDS / 2);
  assert.equal(v.workers.length, 2);
  assert.ok(school.training.remaining > 0);
  v.updateTraining(TRAINING_SECONDS / 2 + 0.1);
  assert.equal(v.workers.length, 3);
  assert.equal(v.workers[2].trainedType, WORKER_TYPES.BAKER);
  assert.equal(v.workers[2].workerType, WORKER_TYPES.BAKER);
  assert.equal(school.training, null);
  assert.equal(school.cycles, 1);
  // The single bakery post is now filled for good.
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.BAKER), false);
});

test("a School already training refuses a second apprentice", () => {
  const school = { id: "school-1", type: "school", progress: 1, cycles: 0 };
  const buildings = [
    school,
    { type: "lumberyard", progress: 1 },
    { type: "house", progress: 1 },
    { type: "house", progress: 1 },
  ];
  const v = trainingVillage(buildings, [{}, {}]);
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.WOODCUTTER), true);
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.BUILDER), false);
  assert.equal(v.workers.length, 2);
  v.updateTraining(TRAINING_SECONDS + 0.1);
  assert.equal(v.workers.length, 3);
});

test("the simulation ticks School training", () => {
  const v = village();
  v.buildings = [];
  v.workers = [];
  let ticked = 0;
  v.updateTraining = (dt) => {
    ticked += dt;
  };
  v.simulate(0.5);
  assert.equal(ticked, 0.5);
});

test("builders can be trained too, limited only by housing", () => {
  const school = { id: "school-1", type: "school", progress: 1, cycles: 0 };
  // No workplaces at all, so only the builder is on offer.
  const buildings = [school, { type: "house", progress: 1 }];
  const v = trainingVillage(buildings, [{}, {}, {}, {}, {}]);
  const options = trainingOptions(v.buildings, v.workers);
  const builder = options.find((option) => option.type === WORKER_TYPES.BUILDER);
  assert.equal(builder.posts, null);
  assert.equal(builder.canTrain, true);
  assert.ok(
    options
      .filter((option) => option.type !== WORKER_TYPES.BUILDER)
      .every((option) => !option.canTrain),
  );
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.BUILDER), true);
  v.updateTraining(TRAINING_SECONDS + 0.1);
  assert.equal(v.workers.length, 6);
  assert.equal(v.workers[5].trainedType, WORKER_TYPES.BUILDER);
  // Housing is now full: 4 base + one cottage = 6 beds.
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.BUILDER), false);
});

test("a graduate waits at the School until a bed is free", () => {
  const school = { id: "school-1", type: "school", progress: 1, cycles: 0 };
  const cottage = { type: "house", progress: 1 };
  const buildings = [school, cottage];
  const v = trainingVillage(buildings, [{}, {}, {}, {}, {}]);
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.BUILDER), true);
  // A cottage loses its completed housing mid-course.
  cottage.progress = 0.3;
  v.updateTraining(TRAINING_SECONDS + 0.1);
  assert.equal(v.workers.length, 5);
  assert.equal(school.training.waiting, true);
  cottage.progress = 1;
  v.updateTraining(0.1);
  assert.equal(v.workers.length, 6);
  assert.equal(school.training, null);
});

test("training stops when the village runs out of housing", () => {
  const school = { id: "school-1", type: "school", progress: 1, cycles: 0 };
  const buildings = [school, { type: "lumberyard", progress: 1 }];
  // No cottages: base housing is 4 and four villagers already live here.
  const v = trainingVillage(buildings, [{}, {}, {}, {}]);
  const option = trainingOptions(v.buildings, v.workers).find(
    (candidate) => candidate.type === WORKER_TYPES.WOODCUTTER,
  );
  assert.equal(option.posts, 2);
  assert.equal(option.canTrain, false);
  assert.match(option.reason, /housing/i);
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.WOODCUTTER), false);
  assert.equal(v.workers.length, 4);
});

test("training at the School adds a real villager wearing the trade's gear", () => {
  const v = village();
  // The full path this time: no stubbed addWorker, so the villager is built
  // with the same rig the game uses.
  v.models = {};
  v.scene = new THREE.Scene();
  v.emit = () => {};
  v.playSound = () => {};
  const school = { id: "school-1", type: "school", progress: 1, cycles: 0 };
  v.buildings = [
    school,
    { type: "bakery", progress: 1 },
    { type: "house", progress: 1 },
  ];
  v.workers = [];
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.BAKER), true);
  assert.equal(v.workers.length, 0);
  v.updateTraining(TRAINING_SECONDS + 0.1);
  const trained = v.workers[v.workers.length - 1];
  assert.equal(trained.trainedType, WORKER_TYPES.BAKER);
  assert.equal(trained.workerType, WORKER_TYPES.BAKER);
  assert.equal(trained.rig.bakerGear.visible, true);
  assert.equal(trained.rig.breadTray.visible, true);
  assert.equal(trained.rig.roleHeadgear[WORKER_TYPES.BAKER].visible, true);
});

test("a trained villager keeps their trade between jobs", () => {
  const v = village();
  const worker = {
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    building: null,
    workerType: WORKER_TYPES.BUILDER,
    trainedType: WORKER_TYPES.BAKER,
    waitingForInput: true,
    waitingForStock: true,
    deliveryRetry: 1.5,
  };
  v.buildings = [];
  v.workers = [worker];
  v.route = () => true;
  v.assign(worker);
  // With no work to take they fall idle, but stay a baker so the next
  // assignment pass gives them first claim on the bakery.
  assert.equal(worker.phase, "idle");
  assert.equal(worker.workerType, WORKER_TYPES.BAKER);
  assert.equal(worker.waitingForInput, false);
  assert.equal(worker.waitingForStock, false);
  assert.equal(worker.deliveryRetry, 0);
  const untrained = { ...worker, trainedType: null, m: new THREE.Object3D(), path: [] };
  v.workers = [untrained];
  v.assign(untrained);
  assert.equal(untrained.workerType, WORKER_TYPES.BUILDER);
});

test("only a completed, working School trains anyone", () => {
  const site = { id: "school-1", type: "school", progress: 0.5 };
  const buildings = [site, { type: "lumberyard", progress: 1 }, { type: "house", progress: 1 }];
  const v = trainingVillage(buildings, [{}]);
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.WOODCUTTER), false);
  site.progress = 1;
  assert.equal(v.trainWorker("school-1", WORKER_TYPES.WOODCUTTER), true);
  assert.equal(v.trainWorker("bakery-1", WORKER_TYPES.WOODCUTTER), false);
});

test("worker rigs remove hidden source meshes after extracting their palette", () => {
  const v = Object.create(Village.prototype);
  const source = new THREE.Group();
  const sourceMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshStandardMaterial({ color: "#4167a2" }),
  );
  sourceMesh.name = "head";
  source.add(sourceMesh);
  const rig = v.createWorkerRig(source);
  assert.equal(source.getObjectByName("head"), undefined);
  assert.deepEqual(source.children, [rig.rig]);
  assert.equal(sourceMesh.parent, null);
});

test("worker contact shadows share one instanced field and hide indoors", () => {
  const v = Object.create(Village.prototype);
  v.scene = { add() {} };
  v.workerShadowField = v.createWorkerShadowField();
  assert.equal(v.workerShadowField.mesh.count, 0);
  assert.equal(v.workerShadowField.mesh.frustumCulled, false);
  v.workerShadowField.mesh.count = 1;
  const worker = {
    shadowIndex: 0,
    shadowVisible: true,
    m: new THREE.Object3D(),
  };
  worker.m.position.set(3, 0, -4);
  assert.equal(v.updateWorkerShadow(worker, 0.9), true);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  v.workerShadowField.mesh.getMatrixAt(0, matrix);
  matrix.decompose(position, new THREE.Quaternion(), scale);
  assert.ok(Math.abs(position.x - 3) < 1e-6);
  assert.ok(Math.abs(position.y - 0.006) < 1e-6);
  assert.ok(Math.abs(position.z + 4) < 1e-6);
  assert.ok(Math.abs(scale.x - 0.9) < 1e-6);
  assert.ok(Math.abs(scale.y - 0.522) < 1e-6);
  assert.ok(Math.abs(scale.z - 1) < 1e-6);
  worker.shadowVisible = false;
  v.updateWorkerShadow(worker);
  v.workerShadowField.mesh.getMatrixAt(0, matrix);
  matrix.decompose(position, new THREE.Quaternion(), scale);
  assert.equal(scale.x, 0);
  assert.equal(scale.y, 0);
});

test("the woodcutter wears the straw hat, scarf and satchel and shoulders the axe", () => {
  const v = Object.create(Village.prototype);
  const rig = v.createWorkerRig(new THREE.Object3D());
  const worker = { rig };
  v.setWorkerType(worker, WORKER_TYPES.WOODCUTTER);
  assert.equal(rig.roleHeadgear[WORKER_TYPES.WOODCUTTER].visible, true);
  assert.equal(rig.woodcutterGear.visible, true);
  assert.equal(rig.axe.visible, true);
  assert.equal(rig.axe.rotation.z, AXE_CARRY_ANGLE);
  // A mid-swing axe returns to the shoulder when the role changes.
  rig.axe.rotation.z = 1.2;
  v.setWorkerType(worker, WORKER_TYPES.WOODCUTTER);
  assert.equal(rig.axe.rotation.z, AXE_CARRY_ANGLE);
  v.setWorkerType(worker, WORKER_TYPES.BAKER);
  assert.equal(rig.woodcutterGear.visible, false);
  assert.equal(rig.axe.visible, false);
  assert.equal(rig.roleHeadgear[WORKER_TYPES.BAKER].visible, true);
});

test("the baker wears the toque and carries bread until the oven needs a pin", () => {
  const v = Object.create(Village.prototype);
  const rig = v.createWorkerRig(new THREE.Object3D());
  const worker = { rig };
  v.setWorkerType(worker, WORKER_TYPES.BAKER);
  assert.equal(rig.roleHeadgear[WORKER_TYPES.BAKER].visible, true);
  assert.equal(rig.bakerGear.visible, true);
  // The tray is the travelling pose; the rolling pin only comes out at work.
  assert.equal(rig.breadTray.visible, true);
  assert.equal(rig.rollingPin.visible, false);
  v.setWorkerType(worker, WORKER_TYPES.MINER);
  assert.equal(rig.bakerGear.visible, false);
  assert.equal(rig.breadTray.visible, false);
});

test("the miner wears the helm and ore pouch and shoulders the pick", () => {
  const v = Object.create(Village.prototype);
  const rig = v.createWorkerRig(new THREE.Object3D());
  const worker = { rig };
  v.setWorkerType(worker, WORKER_TYPES.MINER);
  assert.equal(rig.roleHeadgear[WORKER_TYPES.MINER].visible, true);
  assert.equal(rig.minerGear.visible, true);
  assert.equal(rig.pickaxe.visible, true);
  assert.equal(rig.pickaxe.rotation.z, AXE_CARRY_ANGLE);
  rig.pickaxe.rotation.z = 0.9;
  v.setWorkerType(worker, WORKER_TYPES.MINER);
  assert.equal(rig.pickaxe.rotation.z, AXE_CARRY_ANGLE);
  v.setWorkerType(worker, WORKER_TYPES.BUILDER);
  assert.equal(rig.minerGear.visible, false);
  assert.equal(rig.pickaxe.visible, false);
});

test("every worker role has its own headgear", () => {
  const v = Object.create(Village.prototype);
  const rig = v.createWorkerRig(new THREE.Object3D());
  const worker = { rig };
  for (const type of Object.values(WORKER_TYPES)) {
    v.setWorkerType(worker, type);
    assert.equal(rig.roleHeadgear[type].visible, true, `${type} headgear`);
    const others = Object.entries(rig.roleHeadgear).filter(([key]) => key !== type);
    assert.ok(others.every(([, headgear]) => !headgear.visible));
  }
});

test("a vintner treads grapes in the open bay and delivers wine to the hall", () => {
  const v = village();
  const vineyard = {
    type: "vineyard",
    progress: 1,
    x: 6,
    z: 6,
    rotation: 0,
    cycles: 0,
  };
  const hall = { type: "townhall", progress: 1, x: 0, z: 0, cycles: 0 };
  const worker = {
    id: "worker-vintner",
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    workDuration: 0,
    building: null,
    workerType: WORKER_TYPES.FARMER,
  };
  v.buildings = [vineyard, hall];
  v.workers = [worker];
  v.route = () => true;
  v.assign(worker);
  assert.equal(worker.building, vineyard);
  assert.equal(worker.workInside, true);
  worker.path = [];
  v.simulate(0.1);
  assert.equal(worker.phase, "work");
  // The bay is open, so the vintner stays visible beside the vat.
  assert.equal(worker.m.visible, true);
  assert.deepEqual(
    [worker.m.position.x, worker.m.position.z],
    v.vineyardTreadingPoint(vineyard),
  );
  worker.timer = 0;
  v.simulate(0.1);
  // The vintner stays at the vat; the wine waits here for a carrier.
  assert.equal(worker.phase, "work");
  assert.equal(worker.carry, undefined);
  assert.equal(vineyard.stock, CATALOG.vineyard.amount);
  assert.equal(v.resources.wine, 0);
  assert.equal(vineyard.cycles, 1);
});

test("the vineyard treading spot follows the building rotation", () => {
  const v = village();
  const [x, z] = v.vineyardTreadingPoint({ x: 6, z: 6, rotation: Math.PI / 2 });
  assert.ok(Math.abs(x - 7) < 1e-6);
  assert.ok(Math.abs(z - 7.36) < 1e-6);
});

test("worker assignment falls back when the preferred site is unreachable", () => {
  const v = village();
  const near = {
    type: "farm",
    progress: 1,
    x: 2,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  const far = {
    type: "mine",
    progress: 1,
    x: 10,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  const w = {
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    building: null,
  };
  w.m.position.set(0, 0, 0);
  v.buildings = [near, far];
  v.workers = [w];
  v.route = (_worker, x) => x !== 2;
  v.assign(w);
  assert.equal(w.building, far);
  assert.equal(w.phase, "travel");
});

test("workers reroute when a new building blocks their next step", () => {
  const v = village();
  const site = {
    type: "farm",
    progress: 1,
    x: 6,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  const w = {
    m: new THREE.Object3D(),
    path: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0)],
    phase: "travel",
    timer: 0,
    building: site,
    routeTarget: { x: 6, z: 0 },
  };
  w.m.position.set(0, 0, 0);
  v.buildings = [
    site,
    { type: "house", progress: 0, x: 1, z: 0, m: new THREE.Object3D() },
  ];
  let reroutes = 0;
  v.route = () => {
    reroutes++;
    w.path = [new THREE.Vector3(0, 0, 1)];
    return true;
  };
  v.workers = [w];
  v.simulate(0.1);
  assert.equal(reroutes, 1);
  assert.equal(w.path[0].z, 1);
  assert.equal(w.phase, "travel");
});

test("workers reset transient state when a blocked route has no detour", () => {
  const v = village();
  const site = { type: "farm", progress: 1, x: 6, z: 0 };
  const w = {
    m: new THREE.Object3D(),
    path: [new THREE.Vector3(1, 0, 0)],
    phase: "travel",
    timer: 0,
    workDuration: 4,
    building: site,
    routeTarget: { x: 6, z: 0 },
    waitingForInput: true,
    waitingForStock: true,
    waitingForInn: true,
    deliveryRetry: 1.5,
    materialResource: "wood",
    waitingForSpace: true,
    waitingFor: "worker-2",
    spaceWait: 2,
    forcedYield: "worker-2",
    avoidanceTarget: new THREE.Vector3(2, 0, 2),
    avoidanceTime: 1,
    deadlockLeaderTime: 1,
    deadlockYieldTime: 0,
    deadlockYieldTo: "worker-2",
  };
  Object.assign(v, {
    buildings: [site],
    workers: [w],
    routeTargetBlocked() { return true; },
    route() { return false; },
    setWorkerInside() {},
  });

  assert.equal(v.moveWorker(w, 0.1), false);
  assert.equal(w.phase, "idle");
  assert.equal(w.building, null);
  assert.equal(w.workDuration, 0);
  assert.equal(w.routeTarget, null);
  assert.equal(w.waitingForInput, false);
  assert.equal(w.waitingForStock, false);
  assert.equal(w.waitingForInn, false);
  assert.equal(w.deliveryRetry, 0);
  assert.equal(w.materialResource, null);
  assert.equal(w.waitingForSpace, false);
  assert.equal(w.waitingFor, null);
  assert.equal(w.spaceWait, 0);
  assert.equal(w.forcedYield, null);
  assert.equal(w.avoidanceTarget, null);
  assert.equal(w.avoidanceTime, 0);
  assert.equal(w.deadlockLeaderTime, 0);
  assert.equal(w.deadlockYieldTime, 0);
  assert.equal(w.deadlockYieldTo, null);
});

test("worker assignment clears stale navigation and job metadata", () => {
  const v = village();
  const w = {
    workerType: "builder",
    trainedType: "builder",
    phase: "idle",
    timer: 0,
    path: [new THREE.Vector3(1, 0, 1)],
    routeTarget: { x: 4, z: 4 },
    repathCooldown: 0.75,
    workDuration: 8,
    materialResource: "stone",
    announcedFullStores: true,
    workInside: false,
    hunger: 0,
    m: new THREE.Object3D(),
  };
  Object.assign(v, {
    workers: [w],
    buildings: [],
    setWorkerInside() {},
    setWorkerType() {},
    tryAssignHaul() { return false; },
  });

  v.assign(w);
  assert.deepEqual(w.path, []);
  assert.equal(w.routeTarget, null);
  assert.equal(w.repathCooldown, 0);
  assert.equal(w.workDuration, 0);
  assert.equal(w.materialResource, null);
  assert.equal(w.announcedFullStores, false);
  assert.equal(w.phase, "idle");
});

test("workers pass a head-on collision without overlapping or deadlocking", () => {
  const v = village();
  const first = {
    id: "worker-0",
    movementPriority: 0,
    m: new THREE.Object3D(),
    path: [new THREE.Vector3(1, 0, 0)],
    routeTarget: { x: 1, z: 0 },
    phase: "travel",
    field: null,
    spaceWait: 0,
    repathCooldown: 0,
    forcedYield: null,
  };
  const second = {
    id: "worker-1",
    movementPriority: 1,
    m: new THREE.Object3D(),
    path: [new THREE.Vector3(0, 0, 0)],
    routeTarget: { x: 0, z: 0 },
    phase: "travel",
    field: null,
    spaceWait: 0,
    repathCooldown: 0,
    forcedYield: null,
  };
  first.m.position.set(0, 0, 0);
  second.m.position.set(1, 0, 0);
  v.workers = [first, second];

  let closest = Infinity;
  let avoidanceStarts = 0;
  let wasAvoiding = false;
  for (let tick = 0; tick < 100; tick++) {
    for (const worker of v.workers)
      worker.repathCooldown = Math.max(0, worker.repathCooldown - 0.05);
    const movementOrder = [...v.workers].sort(
      (a, b) =>
        (b.spaceWait || 0) - (a.spaceWait || 0) ||
        v.workerPriority(a) - v.workerPriority(b),
    );
    for (const worker of movementOrder) v.moveWorker(worker, 0.05);
    const isAvoiding = Boolean(second.avoidanceTarget);
    if (isAvoiding && !wasAvoiding) avoidanceStarts++;
    wasAvoiding = isAvoiding;
    closest = Math.min(
      closest,
      first.m.position.distanceTo(second.m.position),
    );
  }

  assert.ok(closest >= WORKER_CLEARANCE);
  assert.equal(first.path.length, 0);
  assert.equal(second.path.length, 0);
  assert.ok(avoidanceStarts <= 2);
  assert.equal(first.m.position.x, 1);
  assert.equal(second.m.position.x, 0);
});

test("a crowded crossing clears without workers overlapping", () => {
  const v = village();
  for (let index = 0; index < 8; index++) {
    const angle = (index * Math.PI) / 4;
    const x = Math.cos(angle) * 5;
    const z = Math.sin(angle) * 5;
    const worker = {
      id: `worker-${index}`,
      movementPriority: index,
      m: new THREE.Object3D(),
      path: [new THREE.Vector3(-x, 0, -z)],
      routeTarget: { x: -x, z: -z },
      phase: "travel",
      field: null,
      spaceWait: 0,
      repathCooldown: 0,
      forcedYield: null,
    };
    worker.m.position.set(x, 0, z);
    v.workers.push(worker);
  }

  let closest = Infinity;
  for (let tick = 0; tick < 600; tick++) {
    for (const worker of v.workers)
      worker.repathCooldown = Math.max(0, worker.repathCooldown - 0.05);
    const movementOrder = [...v.workers].sort(
      (a, b) =>
        (b.spaceWait || 0) - (a.spaceWait || 0) ||
        v.workerPriority(a) - v.workerPriority(b),
    );
    for (const worker of movementOrder) v.moveWorker(worker, 0.05);
    for (let a = 0; a < v.workers.length; a++)
      for (let b = a + 1; b < v.workers.length; b++)
        closest = Math.min(
          closest,
          v.workers[a].m.position.distanceTo(v.workers[b].m.position),
        );
  }

  assert.ok(closest >= WORKER_CLEARANCE);
  assert.ok(v.workers.every((worker) => worker.path.length === 0));
});

test("a cramped worker group elects one escape leader and clears", () => {
  const v = village();
  for (let index = 0; index < 5; index++) {
    const angle = (index * Math.PI * 2) / 5;
    const x = Math.cos(angle) * 1.15;
    const z = Math.sin(angle) * 1.15;
    const worker = {
      id: `worker-${index}`,
      movementPriority: index,
      m: new THREE.Object3D(),
      path: [new THREE.Vector3(-x * 3, 0, -z * 3)],
      routeTarget: { x: -x * 3, z: -z * 3 },
      phase: "travel",
      field: null,
      spaceWait: 2,
      repathCooldown: 0,
      forcedYield: null,
    };
    worker.m.position.set(x, 0, z);
    v.workers.push(worker);
  }

  let usedCoordinator = false;
  let closest = Infinity;
  for (let tick = 0; tick < 700; tick++) {
    for (const worker of v.workers) {
      worker.repathCooldown = Math.max(0, worker.repathCooldown - 0.05);
      worker.deadlockLeaderTime = Math.max(0, (worker.deadlockLeaderTime || 0) - 0.05);
      worker.deadlockYieldTime = Math.max(0, (worker.deadlockYieldTime || 0) - 0.05);
      if (!worker.deadlockYieldTime) worker.deadlockYieldTo = null;
    }
    v.resolveWorkerDeadlocks();
    const leaders = v.workers.filter((worker) => worker.deadlockLeaderTime > 0);
    const yielding = v.workers.filter((worker) => worker.deadlockYieldTime > 0);
    if (leaders.length) {
      usedCoordinator = true;
      assert.equal(leaders.length, 1);
      assert.ok(yielding.length >= 1);
    }
    const movementOrder = [...v.workers].sort(
      (a, b) =>
        Number(Boolean(b.deadlockLeaderTime)) - Number(Boolean(a.deadlockLeaderTime)) ||
        (b.spaceWait || 0) - (a.spaceWait || 0) ||
        v.workerPriority(a) - v.workerPriority(b),
    );
    for (const worker of movementOrder) v.moveWorker(worker, 0.05);
    for (let a = 0; a < v.workers.length; a++)
      for (let b = a + 1; b < v.workers.length; b++)
        closest = Math.min(
          closest,
          v.workers[a].m.position.distanceTo(v.workers[b].m.position),
        );
  }

  assert.equal(usedCoordinator, true);
  assert.ok(closest >= WORKER_CLEARANCE);
  assert.ok(v.workers.every((worker) => worker.path.length === 0));
});

test("temporary worker occupancy does not make a destination unreachable", () => {
  const v = village();
  const mover = { m: new THREE.Object3D(), path: [] };
  const occupant = { m: new THREE.Object3D(), path: [] };
  mover.m.position.set(0, 0, 0);
  occupant.m.position.set(4, 0, 0);
  v.workers = [mover, occupant];

  assert.equal(v.route(mover, 4, 0), true);
  assert.deepEqual(mover.path.at(-1).toArray(), [4, 0, 0]);
});
test("a finished cottage adds beds, but no villagers of its own", () => {
  const v = village(),
    m = new THREE.Object3D();
  const b = { type: "house", progress: 0, m, scaffolding: {} };
  const w = {
    m: new THREE.Object3D(),
    path: [],
    phase: "construct",
    building: b,
  };
  v.buildings = [b];
  v.workers = [w];
  let welcomed = 0;
  v.addWorker = () => welcomed++;
  v.simulate(12);
  assert.equal(b.progress, 1);
  assert.equal(m.scale.y, 1);
  assert.equal(w.phase, "idle");
  // Villagers now come from the School, so the cottage only opens up housing.
  assert.equal(welcomed, 0);
  assert.equal(housingCapacity(v.buildings), 6);
  assert.match(v.activity, /^Cottage is ready\./);
  assert.match(v.activity, /School/);
  assert.equal(v.activityLog[0].message, v.activity);
});

test("construction waits for workers to deliver the full material cost", () => {
  const v = village();
  const b = {
    type: "house",
    progress: 0,
    materials: { wood: 25, stone: 10 },
    m: new THREE.Object3D(),
    x: 6,
    z: 6,
  };
  b.m.visible = false;
  const w = {
    m: new THREE.Object3D(),
    path: [],
    phase: "material_pickup",
    materialResource: "wood",
    building: b,
  };
  v.buildings = [b];
  v.workers = [w];
  v.route = () => true;
  v.showCarry = () => {};
  v.clearCarry = () => {};
  v.deliveryBurst = () => {};
  v.updateSiteMaterials = () => {};
  v.simulate(0.1);
  assert.deepEqual(w.carry, {
    resource: "wood",
    amount: 5,
    construction: true,
  });
  assert.equal(w.phase, "material_delivery");
  assert.equal(b.progress, 0);
  assert.equal(b.m.visible, false);
  v.simulate(0.1);
  assert.deepEqual(b.materials, { wood: 30, stone: 10 });
  assert.equal(constructionMaterialsReady(b), true);
  assert.equal(b.m.visible, true);
  assert.equal(w.phase, "construct");
  assert.equal(b.progress, 0);
  assert.match(v.activity, /all materials.*Construction begins/);
});

test("construction assignments collect each material from its producer", () => {
  const v = village();
  const site = {
    type: "house",
    progress: 0,
    materials: { wood: 0, stone: 0 },
    x: 8,
    z: 8,
  };
  const lumberyard = {
    type: "lumberyard",
    progress: 1,
    x: -8,
    z: -11,
  };
  const w = { m: new THREE.Object3D(), path: [], phase: "idle", timer: 0 };
  v.buildings = [site, lumberyard];
  v.workers = [w];
  let destination;
  v.route = (_worker, x, z) => {
    destination = [x, z];
    return true;
  };
  v.assign(w);
  assert.equal(w.building, site);
  assert.equal(w.phase, "material_pickup");
  assert.equal(w.materialResource, "wood");
  assert.deepEqual(destination, v.jobPoint(lumberyard, w));
});
test("construction sites stay single-worker assignments", () => {
  const v = village();
  const site = {
    type: "house",
    progress: 0,
    materials: { wood: 0, stone: 0 },
    x: 8,
    z: 8,
  };
  const assigned = {
    m: new THREE.Object3D(),
    building: site,
    phase: "material_delivery",
  };
  const waiting = {
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    building: null,
  };
  v.buildings = [site];
  v.workers = [assigned, waiting];
  v.assign(waiting);
  assert.equal(waiting.building, null);
  assert.equal(waiting.phase, "idle");
});

test("construction material state is bounded and reports delivery progress", () => {
  const materials = normalizedConstructionMaterials(
    "house",
    { wood: 18, stone: 99 },
    0,
  );
  const site = { type: "house", materials };
  assert.deepEqual(materials, { wood: 18, stone: 10 });
  assert.equal(constructionMaterialsReady(site), false);
  assert.equal(constructionMaterialProgress(site), 0.7);
  assert.deepEqual(normalizedConstructionMaterials("house", null, 0.5), {
    wood: 30,
    stone: 10,
  });
});

test("construction snapshots distinguish material delivery from building", () => {
  const v = village();
  let state;
  const site = {
    id: "house-site",
    type: "house",
    progress: 0,
    materials: { wood: 20, stone: 0 },
    cycles: 0,
  };
  v.onUpdate = (next) => (state = next);
  v.buildings = [site];
  v.workers = [{
    id: "worker-1",
    phase: "material_delivery",
    building: site,
    carry: { resource: "wood", amount: 10, construction: true },
  }];
  v.emit();
  assert.equal(state.buildings[0].status, "Delivering materials");
  assert.equal(state.buildings[0].materialProgress, 0.5);
  assert.equal(state.buildings[0].materialsReady, false);
});

test("activity history keeps the four newest village updates", () => {
  const v = village();
  ["One", "Two", "Three", "Four", "Five"].forEach((message) =>
    v.announce(message),
  );
  assert.deepEqual(
    v.activityLog.map(({ message }) => message),
    ["Five", "Four", "Three", "Two"],
  );
});

test("activity history moves repeated updates to the front without duplicates", () => {
  const v = village();
  v.announce("Wood +8 delivered to the hall.");
  v.announce("Stone +6 delivered to the hall.");
  v.announce("Wood +8 delivered to the hall.");
  assert.deepEqual(
    v.activityLog.map(({ message }) => message),
    ["Wood +8 delivered to the hall.", "Stone +6 delivered to the hall."],
  );
});

test("production fills the building's own store, never the village pool", () => {
  const v = village();
  const mine = {
    type: "mine",
    progress: 1,
    m: new THREE.Object3D(),
    x: 5,
    z: 5,
    cycles: 0,
    stock: 0,
  };
  const hall = {
    type: "townhall",
    progress: 1,
    x: -3,
    z: -3,
    m: new THREE.Object3D(),
  };
  const w = {
    m: new THREE.Object3D(),
    path: [],
    phase: "work",
    timer: 0,
    building: mine,
  };
  v.buildings = [hall, mine];
  v.workers = [w];
  v.simulate(0.1);
  assert.equal(v.resources.stone, 100);
  assert.equal(mine.stock, CATALOG.mine.amount);
  assert.equal(mine.cycles, 1);
  // The miner keeps their post; hauling is a carrier's job now.
  assert.equal(w.phase, "work");
  assert.equal(w.carry, undefined);
});

test("a producer stops once its own store is full", () => {
  const v = village();
  const bakery = {
    type: "bakery",
    progress: 1,
    m: new THREE.Object3D(),
    x: 5,
    z: 5,
    cycles: 0,
    stock: CATALOG.bakery.outputCap,
  };
  v.resources.wheat = 50;
  const w = {
    m: new THREE.Object3D(),
    path: [],
    phase: "work",
    timer: 0,
    building: bakery,
  };
  v.buildings = [bakery];
  v.workers = [w];
  v.simulate(0.1);
  assert.equal(w.waitingForStock, true);
  // The baker steps away from a full oven so they can haul or take other work.
  assert.equal(w.phase, "idle");
  assert.equal(w.building, null);
  // No wheat is burned and no bread appears while the oven is backed up.
  assert.equal(v.resources.wheat, 50);
  assert.equal(bakery.stock, CATALOG.bakery.outputCap);
  assert.equal(bakery.cycles, 0);
  assert.equal(
    v.activity,
    "The Bakery store is full. A carrier must collect the goods.",
  );
});

test("a carrier collects a full building and credits the pool on arrival", () => {
  const v = village();
  const bakery = {
    type: "bakery",
    progress: 1,
    m: new THREE.Object3D(),
    x: 6,
    z: 0,
    cycles: 0,
    stock: 5,
  };
  const hall = {
    type: "townhall",
    progress: 1,
    x: 0,
    z: 0,
    m: new THREE.Object3D(),
  };
  const carrier = {
    id: "carrier-1",
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    building: null,
    workerType: WORKER_TYPES.CARRIER,
  };
  v.buildings = [hall, bakery];
  v.workers = [carrier];
  v.route = () => true;
  v.showCarry = () => {};
  v.clearCarry = () => {};
  v.deliveryBurst = () => {};
  v.resources.food = 0;

  v.simulate(0.1);
  assert.equal(carrier.phase, "haul_pickup");
  assert.equal(carrier.haulSource, bakery);

  carrier.path = [];
  v.simulate(0.1);
  // Picking up empties the bakery so its baker can start again.
  assert.equal(bakery.stock, 0);
  assert.equal(carrier.phase, "haul_deliver");
  assert.equal(carrier.carry.amount, 5);
  assert.equal(carrier.carry.resource, "food");
  assert.equal(carrier.haulTarget, hall);
  assert.equal(v.resources.food, 0);

  carrier.path = [];
  v.simulate(0.1);
  assert.equal(v.resources.food, 5);
  assert.equal(v.delivered.food, 5);
  assert.equal(carrier.carry, null);
  assert.equal(carrier.phase, "idle");
});

test("carrier source ranking reuses each source's stored amount and distance", () => {
  const v = village();
  const worker = { m: new THREE.Object3D(), phase: "idle" };
  worker.m.position.set(0, 0, 0);
  const hall = {
    type: "townhall",
    progress: 1,
    x: 8,
    z: 0,
    m: new THREE.Object3D(),
  };
  const bakery = {
    type: "bakery",
    progress: 1,
    x: 2,
    z: 0,
    stock: 5,
    m: new THREE.Object3D(),
  };
  const vineyard = {
    type: "vineyard",
    progress: 1,
    x: 4,
    z: 0,
    stock: 3,
    m: new THREE.Object3D(),
  };
  v.buildings = [hall, bakery, vineyard];
  v.workers = [worker];
  v.haulDestination = () => hall;
  v.route = () => true;
  v.jobPoint = (building) => [building.x, building.z];
  v.setWorkerType = () => {};
  const originalStoredAt = v.storedAt;
  const reads = new Map();
  v.storedAt = (building) => {
    reads.set(building, (reads.get(building) || 0) + 1);
    return originalStoredAt.call(v, building);
  };

  assert.equal(v.tryAssignHaul(worker), true);
  assert.equal(worker.haulSource, bakery);
  assert.equal(reads.get(bakery), 1);
  assert.equal(reads.get(vineyard), 1);
});

test("bread fills the canteen first and only then spills into a store", () => {
  const v = village();
  const inn = {
    id: "inn-1",
    type: "inn",
    progress: 1,
    x: 2,
    z: 0,
    m: new THREE.Object3D(),
    breadStock: CATALOG.inn.breadCap - 2,
  };
  const hall = {
    type: "townhall",
    progress: 1,
    x: 8,
    z: 0,
    m: new THREE.Object3D(),
  };
  const bakery = {
    type: "bakery",
    progress: 1,
    x: 0,
    z: 0,
    m: new THREE.Object3D(),
    cycles: 0,
    stock: 5,
  };
  v.buildings = [hall, inn, bakery];
  v.workers = [];
  v.resources.food = 0;
  const worker = { m: new THREE.Object3D() };

  // Two seats left in the pantry, so the Inn is still the nearest valid target.
  assert.equal(v.haulDestination(worker, "food"), inn);
  assert.equal(v.storeResource(inn, "food", 5), 2);
  assert.equal(inn.breadStock, CATALOG.inn.breadCap);
  assert.equal(v.resources.food, 2);

  // Full canteen: the rest of the load goes to a store instead.
  assert.equal(v.haulDestination(worker, "food"), hall);
  assert.equal(v.storeResource(hall, "food", 3), 3);
  assert.equal(v.resources.food, 5);
});

test("a blocked carrier waits instead of crediting resources remotely", () => {
  const v = village();
  const yard = {
    type: "lumberyard",
    progress: 1,
    m: new THREE.Object3D(),
    x: 5,
    z: 5,
    cycles: 0,
    stock: 8,
  };
  const hall = {
    type: "townhall",
    progress: 1,
    x: -3,
    z: -3,
    m: new THREE.Object3D(),
  };
  const carrier = {
    m: new THREE.Object3D(),
    path: [],
    phase: "haul_deliver",
    timer: 0,
    building: null,
    haulSource: yard,
    haulTarget: hall,
    deliveryRetry: 1.5,
    carry: { resource: "wood", amount: 8, haul: true },
    workerType: WORKER_TYPES.CARRIER,
  };
  v.buildings = [hall, yard];
  v.workers = [carrier];
  v.route = () => false;
  v.showCarry = () => {};
  v.clearCarry = () => {};
  v.deliveryBurst = () => {};
  v.simulate(6);
  assert.equal(v.resources.wood, 100);
  assert.equal(carrier.phase, "haul_deliver");
  assert.deepEqual(carrier.carry, { resource: "wood", amount: 8, haul: true });
});

test("a full village hands the load back rather than destroying it", () => {
  const v = village();
  const hall = {
    type: "townhall",
    progress: 1,
    x: 0,
    z: 0,
    m: new THREE.Object3D(),
  };
  const mine = {
    type: "mine",
    progress: 1,
    x: 4,
    z: 0,
    m: new THREE.Object3D(),
    cycles: 0,
    stock: 0,
  };
  v.buildings = [hall, mine];
  v.resources.stone = TOWNHALL_STORAGE;
  const carrier = {
    m: new THREE.Object3D(),
    path: [],
    phase: "haul_deliver",
    timer: 0,
    building: null,
    haulSource: mine,
    haulTarget: hall,
    deliveryRetry: 0,
    carry: { resource: "stone", amount: 6, haul: true },
    workerType: WORKER_TYPES.CARRIER,
    waitingForSpace: true,
    waitingFor: "worker-2",
    spaceWait: 2,
    forcedYield: "worker-2",
    avoidanceTarget: new THREE.Vector3(2, 0, 2),
    avoidanceTime: 1,
    deadlockLeaderTime: 1,
    deadlockYieldTime: 1,
    deadlockYieldTo: "worker-2",
    waitingForInput: true,
    waitingForStock: true,
    waitingForInn: true,
    mealSeat: 1,
    routeTarget: { x: 4, z: 0 },
  };
  v.workers = [carrier];
  v.route = () => true;
  v.showCarry = () => {};
  v.clearCarry = () => {};
  v.deliveryBurst = () => {};
  assert.equal(v.storageSpace("stone"), 0);
  v.simulate(0.1);
  assert.equal(v.resources.stone, TOWNHALL_STORAGE);
  assert.equal(mine.stock, 6);
  assert.equal(carrier.carry, null);
  assert.equal(carrier.phase, "idle");
  assert.equal(carrier.routeTarget, null);
  assert.equal(carrier.waitingForSpace, false);
  assert.equal(carrier.waitingFor, null);
  assert.equal(carrier.spaceWait, 0);
  assert.equal(carrier.forcedYield, null);
  assert.equal(carrier.avoidanceTarget, null);
  assert.equal(carrier.avoidanceTime, 0);
  assert.equal(carrier.deadlockLeaderTime, 0);
  assert.equal(carrier.deadlockYieldTime, 0);
  assert.equal(carrier.deadlockYieldTo, null);
  assert.equal(carrier.waitingForInput, false);
  assert.equal(carrier.waitingForStock, false);
  assert.equal(carrier.waitingForInn, false);
  assert.equal(carrier.mealSeat, null);
});

test("a Storehouse raises the ceiling every resource is measured against", () => {
  const v = village();
  const hall = { type: "townhall", progress: 1, x: 0, z: 0 };
  const store = { type: "storehouse", progress: 1, x: 6, z: 0 };
  v.buildings = [hall];
  assert.equal(v.storageCapacity(), TOWNHALL_STORAGE);
  v.buildings = [hall, store];
  assert.equal(
    v.storageCapacity(),
    TOWNHALL_STORAGE + CATALOG.storehouse.storage,
  );
  // An unfinished Storehouse holds nothing yet.
  store.progress = 0.5;
  assert.equal(v.storageCapacity(), TOWNHALL_STORAGE);
});
test("storage capacity calculates Inn pantry space only for food", () => {
  const v = village();
  const hall = { type: "townhall", progress: 1, x: 0, z: 0 };
  const inn = { type: "inn", progress: 1, x: 6, z: 0 };
  v.buildings = [hall, inn];
  const capacities = v.storageCapacities();
  assert.equal(capacities.wood, TOWNHALL_STORAGE);
  assert.equal(capacities.wheat, TOWNHALL_STORAGE);
  assert.equal(
    capacities.food,
    TOWNHALL_STORAGE + CATALOG.inn.breadCap,
  );
});

test("storage capacity counters match the completed building set", () => {
  const v = village();
  v.buildings = [
    { type: "townhall", progress: 1 },
    { type: "storehouse", progress: 1 },
    { type: "inn", progress: 1 },
    { type: "storehouse", progress: 0 },
  ];
  assert.equal(
    v.storageCapacity(),
    TOWNHALL_STORAGE + CATALOG.storehouse.storage,
  );
  assert.equal(v.completedInnCount(), 1);
  assert.equal(
    v.capacityFor("food"),
    TOWNHALL_STORAGE + CATALOG.storehouse.storage + CATALOG.inn.breadCap,
  );
});

test("building snapshots reuse storage capacities across store cards", () => {
  const v = village();
  let state;
  const townhall = { id: "hall-1", type: "townhall", progress: 1, cycles: 0 };
  const storehouse = { id: "store-1", type: "storehouse", progress: 1, cycles: 0 };
  v.buildings = [townhall, storehouse];
  v.onUpdate = (next) => (state = next);
  let capacityReads = 0;
  let capacitiesReads = 0;
  v.storageCapacity = () => {
    capacityReads += 1;
    return 180;
  };
  v.storageCapacities = () => {
    capacitiesReads += 1;
    return { wood: 180, stone: 180, food: 240, wheat: 180, wine: 180 };
  };

  v.emit();
  assert.equal(state.buildings.length, 2);
  assert.equal(capacityReads, 0);
  assert.equal(capacitiesReads, 1);
  assert.equal(state.buildings[0].villageStorage, 180);
  assert.equal(state.buildings[1].storedCaps.food, 240);
});
test("atmosphere lighting updates are cadence-limited", () => {
  let lightWrites = 0;
  const trackedColor = () => ({
    copy() {
      lightWrites++;
      return this;
    },
    lerp() {
      lightWrites++;
      return this;
    },
  });
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    elapsed: 0,
    lastAtmosphereUpdate: -Infinity,
    sun: {
      position: { set() { lightWrites++; } },
      color: trackedColor(),
      intensity: 0,
    },
    hemi: { intensity: 0 },
    scene: {
      background: trackedColor(),
      fog: { color: trackedColor() },
    },
    atmosphere: {
      lastElapsed: -Infinity,
      day: new THREE.Color("#a7b673"),
      dusk: new THREE.Color("#c98d6a"),
      night: new THREE.Color("#516878"),
      fog: new THREE.Color(),
      sky: new THREE.Color(),
      sunDay: new THREE.Color("#fff0cd"),
      sunWarm: new THREE.Color("#ffc083"),
      sun: new THREE.Color(),
    },
  });

  v.updateAtmosphere();
  const firstUpdateWrites = lightWrites;
  assert.ok(firstUpdateWrites > 0);

  v.elapsed = ATMOSPHERE_UPDATE_INTERVAL / 2;
  v.updateAtmosphere();
  assert.equal(lightWrites, firstUpdateWrites);

  v.elapsed = ATMOSPHERE_UPDATE_INTERVAL + Number.EPSILON;
  v.updateAtmosphere();
  assert.ok(lightWrites > firstUpdateWrites);
});
test("paused world frames are cadence-limited without slowing active simulation", () => {
  assert.equal(shouldRenderWorldFrame(1, 0, 0), true);
  assert.equal(shouldRenderWorldFrame(0, 0, 0), false);
  assert.equal(
    shouldRenderWorldFrame(0, PAUSED_RENDER_INTERVAL / 2, 0),
    false,
  );
  assert.equal(
    shouldRenderWorldFrame(0, PAUSED_RENDER_INTERVAL, 0),
    true,
  );
});
test("pointer movement keeps only the latest event per frame", () => {
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  let callback = null;
  let nextFrame = 0;
  const cancelled = [];
  globalThis.requestAnimationFrame = (next) => {
    callback = next;
    return ++nextFrame;
  };
  globalThis.cancelAnimationFrame = (frame) => cancelled.push(frame);
  try {
    const v = Object.create(Village.prototype);
    const handled = [];
    Object.assign(v, { dead: false, pointerFrame: null, pendingPointerEvent: null });
    v.pointerMove = (event) => handled.push(event);

    v.schedulePointerMove("first");
    v.schedulePointerMove("latest");
    assert.deepEqual(handled, []);
    assert.equal(v.pendingPointerEvent, "latest");
    callback();
    assert.deepEqual(handled, ["latest"]);

    v.schedulePointerMove("cancelled");
    v.cancelPointerMove();
    assert.deepEqual(cancelled, [2]);
    assert.equal(v.pendingPointerEvent, null);
  } finally {
    if (previousRequest === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRequest;
    if (previousCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previousCancel;
  }
});

test("placement hover only repaints the preview when validity changes", () => {
  const colorWrites = [];
  let traversals = 0;
  let validity = { ok: true, reason: "clear" };
  const color = { set(value) { colorWrites.push(value); } };
  const mesh = { isMesh: true, material: { color } };
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    selected: "house",
    rotation: 0,
    ghost: {
      visible: false,
      position: { set() {} },
      rotation: {},
      traverse(callback) {
        traversals++;
        callback(mesh);
      },
    },
    footprint: { visible: false, position: { set() {} }, material: { color } },
    previewOutline: {
      visible: false,
      position: { set() {} },
      rotation: {},
      material: { color },
    },
    valid() {
      return validity;
    },
    emit() {},
  });

  v.updatePlacement(0, 0);
  v.updatePlacement(1, 0);
  assert.equal(traversals, 1);
  assert.equal(
    colorWrites.length,
    3,
    "initial placement paints the footprint, outline, and ghost",
  );

  validity = { ok: false, reason: "occupied" };
  v.updatePlacement(2, 0);
  assert.equal(traversals, 2);
  assert.equal(
    colorWrites.length,
    6,
    "a validity flip repaints all preview surfaces",
  );
});

test("restoring a village trims resources to the storage it actually has", () => {
  const v = village();
  v.buildings = [{ type: "townhall", progress: 1, x: 0, z: 0 }];
  v.resources = {
    wood: TOWNHALL_STORAGE + 60,
    stone: 10,
    food: 5,
    wheat: 0,
    wine: 0,
  };
  const spilled = v.clampResourcesToStorage();
  assert.equal(spilled, 60);
  assert.equal(v.resources.wood, TOWNHALL_STORAGE);
  assert.equal(v.resources.stone, 10);
});

test("restoring a village keeps Inn bread within the global food total", () => {
  const v = village();
  v.buildings = [
    { type: "townhall", progress: 1, x: 0, z: 0 },
    { type: "inn", progress: 1, x: 4, z: 0, breadStock: 9 },
    { type: "inn", progress: 1, x: 8, z: 0, breadStock: 7 },
  ];
  v.resources.food = 5;

  v.clampResourcesToStorage();

  assert.equal(v.buildings[1].breadStock, 5);
  assert.equal(v.buildings[2].breadStock, 0);
  assert.equal(
    v.buildings
      .filter((building) => building.type === "inn")
      .reduce((total, inn) => total + inn.breadStock, 0),
    v.resources.food,
  );
});

test("sparse restore adds starter storage before clamping resources", () => {
  const v = village();
  v.buildings = [];
  v.addBuilding = (type, x, z) =>
    v.buildings.push({ type, x, z, progress: 1 });
  v.resources = {
    wood: TOWNHALL_STORAGE + 160,
    stone: 12,
    food: 8,
    wheat: 0,
    wine: 0,
  };

  assert.equal(v.ensureStarterVillage(), true);
  v.clampResourcesToStorage();
  assert.equal(v.buildings.some((building) => building.type === "townhall"), true);
  assert.equal(v.resources.wood, TOWNHALL_STORAGE + 150);
  assert.equal(v.resources.stone, 12);
  assert.equal(v.resources.food, 8);
  assert.equal(v.ensureStarterVillage(), false);
});

test("windmill waits for input rather than producing free food", () => {
  const v = village();
  v.resources.food = 1;
  const windmill = { type: "windmill", cycles: 0, stock: 0 };
  const w = {
    m: new THREE.Object3D(),
    path: [],
    phase: "work",
    timer: 0,
    building: windmill,
  };
  v.workers = [w];
  v.simulate(1);
  assert.equal(w.phase, "work");
  assert.equal(w.waitingForInput, true);
  assert.equal(v.resources.food, 1);
  assert.equal(v.activity, "Windmill is waiting for food.");
  v.resources.food = 2;
  w.timer = 0;
  v.route = () => true;
  v.simulate(0.1);
  assert.equal(v.resources.food, 0);
  assert.equal(windmill.stock, 8);
  assert.equal(v.activity, "Food +8 is ready at the Windmill.");
});

test("building inspector reports the worker's current phase", () => {
  const v = village();
  let state;
  v.onUpdate = (next) => (state = next);
  const b = {
    id: "mine-1",
    type: "mine",
    progress: 1,
    cycles: 2,
  };
  v.buildings = [b];
  v.workers = [
    { building: b, phase: "work", timer: 4, workDuration: 8 },
    { haulSource: b, phase: "haul_pickup" },
  ];
  v.emit();
  assert.equal(state.buildings[0].workers, 1);
  assert.equal(state.buildings[0].status, "A carrier is collecting");
});

test("building snapshots expose live production-cycle progress", () => {
  const v = village();
  let state;
  const b = { id: "farm-1", type: "farm", progress: 1, cycles: 3 };
  v.onUpdate = (next) => (state = next);
  v.buildings = [b];
  v.workers = [{ building: b, phase: "work", timer: 3, workDuration: 9 }];
  v.emit();
  assert.ok(Math.abs(state.buildings[0].cycleProgress - 2 / 3) < 1e-9);
  assert.equal(state.buildings[0].nextDelivery, 3);
});

test("worker snapshots expose their task and carried goods", () => {
  const v = village();
  let state;
  const b = { type: "stone", progress: 1, cycles: 0 };
  v.onUpdate = (next) => (state = next);
  v.buildings = [b];
  v.workers = [
    {
      id: "worker-7",
      phase: "deliver",
      deliveryRetry: 1,
      building: b,
      carry: { resource: "stone", amount: 6 },
    },
  ];
  v.emit();
  assert.equal(state.buildings[0].status, "Waiting for route");
  assert.deepEqual(state.workers, [
    {
      id: "worker-7",
      phase: "deliver",
      waitingForInput: false,
      deliveryRetry: true,
      workerType: "builder",
      workerTypeLabel: "Builder",
      buildingType: "stone",
      carry: { resource: "stone", amount: 6 },
      hunger: 0,
      hungry: false,
      workProgress: null,
      workRemaining: null,
    },
  ]);
});

test("worker snapshots expose live work-cycle progress", () => {
  const v = village();
  let state;
  const b = { type: "farm", progress: 1, cycles: 0 };
  v.onUpdate = (next) => (state = next);
  v.buildings = [b];
  v.workers = [
    {
      id: "worker-8",
      phase: "work",
      timer: 2,
      workDuration: 8,
      building: b,
      carry: null,
    },
  ];
  v.emit();
  assert.equal(state.workers[0].workProgress, 0.75);
  assert.equal(state.workers[0].workRemaining, 2);
});

test("save numeric fields reject missing values without erasing defaults", () => {
  assert.equal(finiteNumber(null, 80), 80);
  assert.equal(finiteNumber("", 95), 95);
  assert.equal(finiteNumber("12", 0), 12);
  assert.equal(finiteNumber("not-a-number", 7), 7);
});

test("save keeps delivery history, Inn stock, and worker hunger safely bounded", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = {
    value: "",
    setItem(_key, value) {
      this.value = value;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    const v = Object.create(Village.prototype);
    Object.assign(v, {
      ready: true,
      name: "Willowbrook",
      resources: { wood: 100, stone: 100, food: 100, wheat: 0, wine: 0 },
      workers: [{ hunger: 0.73 }],
      elapsed: 12,
      created: {},
      gathered: 8,
      activityLog: [{ message: "Wood +8 delivered to the hall." }],
      roads: new Set(["0,0", "2,2"]),
      baseRoads: new Set(["0,0"]),
      clearedScenery: new Set(["1.234,5.678"]),
      buildings: [
        { type: "mine", x: 1, z: 1, rotation: 0, progress: 1, cycles: 7.8 },
        { type: "farm", x: 4, z: 4, rotation: 0, progress: 1, cycles: -3 },
        { type: "inn", x: 8, z: 4, rotation: 0, progress: 1, cycles: 4, breadStock: 12.9 },
      ],
      notify() {},
      storageAvailable: true,
      lastSavedAt: 0,
      camera: {
        position: new THREE.Vector3(30, 37, 42),
        zoom: 1,
      },
      controls: { target: new THREE.Vector3(0, 0, -1) },
    });
    assert.equal(v.save(), true);
    const saved = JSON.parse(storage.value);
    assert.deepEqual(
      saved.buildings.map((building) => building.cycles),
      [7, 0, 4],
    );
    assert.equal(saved.buildings[2].breadStock, 12);
    assert.deepEqual(saved.workerNeeds, [{ hunger: 0.73 }]);
    assert.deepEqual(saved.activityLog, ["Wood +8 delivered to the hall."]);
    assert.deepEqual(saved.roads, ["2,2"]);
    assert.deepEqual(saved.clearedScenery, ["1.234,5.678"]);
    assert.deepEqual(saved.view, {
      position: [30, 37, 42],
      target: [0, 0, -1],
      zoom: 1,
    });
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("export still returns an in-memory backup when browser storage is unavailable", () => {
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    ready: true,
    healthCheck: false,
    storageConflict: false,
    storageAvailable: false,
    name: "Willowbrook",
    resources: { wood: "corrupt", stone: 18, food: 7, wheat: 3, wine: 0 },
    workers: [],
    elapsed: 9,
    created: { house: "2.8" },
    gathered: Number.NaN,
    delivered: { wood: "corrupt", stone: 0, food: 0, wheat: 0, wine: 0 },
    feast: null,
    activityLog: [],
    roads: new Set(),
    baseRoads: new Set(),
    clearedScenery: new Set(),
    buildings: [],
    camera: {
      position: new THREE.Vector3(30, 37, 42),
      zoom: 1,
    },
    controls: { target: new THREE.Vector3(0, 0, -1) },
  });

  const serialized = v.exportSave();
  assert.equal(typeof serialized, "string");
  const saved = JSON.parse(serialized);
  assert.equal(saved.resources.wood, 0);
  assert.equal(saved.resources.food, 7);
  assert.equal(saved.created.house, 2);
  assert.equal(saved.gathered, 0);
  assert.equal(saved.delivered.wood, 0);
});

test("clearSave removes the local village and resets save state", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = {
    value: "saved-village",
    removeItem() {
      this.value = "";
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    const v = Object.create(Village.prototype);
    Object.assign(v, {
      lastSavedAt: 123,
      storageAvailable: true,
    });
    assert.equal(v.clearSave(), true);
    assert.equal(storage.value, "");
    assert.equal(v.lastSavedAt, 0);
    assert.equal(v.storageAvailable, true);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("clearHighlight removes and disposes a building selection ring", () => {
  let removed = 0;
  let geometryDisposed = 0;
  let materialDisposed = 0;
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    scene: {
      remove() {
        removed++;
      },
    },
    ring: {
      geometry: {
        dispose() {
          geometryDisposed++;
        },
      },
      material: {
        dispose() {
          materialDisposed++;
        },
      },
    },
  });
  v.clearHighlight();
  assert.equal(removed, 1);
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
  assert.equal(v.ring, null);
});
test("clearHighlight also disposes the focused worker marker", () => {
  let removed = 0;
  let disposed = 0;
  const v = Object.create(Village.prototype);
  const resource = () => ({ dispose() { disposed++; } });
  Object.assign(v, {
    scene: { remove() { removed++; } },
    ring: null,
    guideMarker: { geometry: resource(), material: resource() },
  });
  v.clearHighlight();
  assert.equal(removed, 1);
  assert.equal(disposed, 2);
  assert.equal(v.guideMarker, null);
});

test("clearGhost disposes preview geometry without touching shared model geometry", () => {
  let removed = 0;
  let disposed = 0;
  let materialDisposed = 0;
  const mesh = (owned, line = false) => ({
    geometry: {
      dispose() {
        if (owned) disposed++;
      },
    },
    traverse(callback) {
      callback({
        isMesh: !line,
        isLine: line,
        material: { dispose() { materialDisposed++; } },
      });
    },
  });
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    scene: { remove() { removed++; } },
    ghost: mesh(false),
    ghostGeometryOwned: false,
    footprint: mesh(true),
    previewOutline: mesh(true, true),
  });
  v.clearGhost();
  assert.equal(removed, 3);
  assert.equal(disposed, 2);
  assert.equal(materialDisposed, 3);
  assert.equal(v.ghost, null);
  assert.equal(v.ghostGeometryOwned, false);
});

test("fallback model templates are cached for repeated previews", () => {
  let created = 0;
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    models: {},
    makeDecorationModel() {
      created++;
      return { created };
    },
  });
  const first = v.modelTemplate("missing-model");
  const second = v.modelTemplate("missing-model");
  assert.equal(first, second);
  assert.equal(created, 1);
});

test("placed building roots are registered for raycasts and can be removed", () => {
  const v = village();
  v.model = () => new THREE.Group();
  v.buildingPickTargets = [];
  v.pickTargets = [];
  const building = v.addBuilding("school", 2, 3);

  assert.deepEqual(v.buildingPickTargets, [building.m]);
  assert.deepEqual(v.pickTargets, [building.m]);
  v.removePickTarget(building.m);
  assert.deepEqual(v.buildingPickTargets, []);
  assert.deepEqual(v.pickTargets, []);
});

test("disposeOwnedObject releases shared scaffold resources once", () => {
  let removed = 0;
  let geometryDisposed = 0;
  let materialDisposed = 0;
  const sharedMaterial = { dispose() { materialDisposed++; } };
  const object = {
    traverse(callback) {
      callback({
        isMesh: true,
        geometry: { dispose() { geometryDisposed++; } },
        material: sharedMaterial,
      });
      callback({
        isMesh: true,
        geometry: { dispose() { geometryDisposed++; } },
        material: sharedMaterial,
      });
    },
  };
  const v = Object.create(Village.prototype);
  v.scene = { remove() { removed++; } };
  v.disposeOwnedObject(object);
  assert.equal(removed, 1);
  assert.equal(geometryDisposed, 2);
  assert.equal(materialDisposed, 1);
});

test("disposeSceneResources releases shared scene allocations once", () => {
  let geometryDisposed = 0;
  let materialDisposed = 0;
  let textureDisposed = 0;
  let cleared = 0;
  const geometry = { dispose() { geometryDisposed++; } };
  const texture = { isTexture: true, dispose() { textureDisposed++; } };
  const material = { map: texture, dispose() { materialDisposed++; } };
  const v = Object.create(Village.prototype);
  v.scene = {
    traverse(callback) {
      callback({ isMesh: true, geometry, material });
      callback({ isMesh: true, geometry, material });
    },
    clear() {
      cleared++;
    },
  };
  v.disposeSceneResources();
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
  assert.equal(textureDisposed, 1);
  assert.equal(cleared, 1);
});
test("late model loads release resources after the village is disposed", () => {
  let geometryDisposed = 0;
  let materialDisposed = 0;
  let textureDisposed = 0;
  const geometry = { dispose() { geometryDisposed++; } };
  const texture = { isTexture: true, dispose() { textureDisposed++; } };
  const material = {
    map: texture,
    dispose() { materialDisposed++; },
  };
  const root = {
    traverse(callback) {
      callback({ isMesh: true, geometry, material });
      callback({ isMesh: true, geometry, material });
    },
  };
  const v = Object.create(Village.prototype);
  v.models = { house: root, well: root };
  v.disposeLoadedModelResources();
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
  assert.equal(textureDisposed, 1);
  assert.deepEqual(v.models, {});
});

test("disposing a village stops ambient audio and closes its context", () => {
  let stopped = 0;
  let oscillatorDisconnected = 0;
  let gainDisconnected = 0;
  let closed = 0;
  const v = Object.create(Village.prototype);
  v.ambientOscillator = {
    oscillator: {
      stop() {
        stopped++;
      },
      disconnect() {
        oscillatorDisconnected++;
      },
    },
    gain: {
      disconnect() {
        gainDisconnected++;
      },
    },
  };
  v.audioContext = {
    close() {
      closed++;
      return Promise.resolve();
    },
  };

  v.stopAmbientAudio();

  assert.equal(stopped, 1);
  assert.equal(oscillatorDisconnected, 1);
  assert.equal(gainDisconnected, 1);
  assert.equal(v.ambientOscillator, null);

  v.disposeAudio();
  assert.equal(closed, 1);
  assert.equal(v.audioContext, null);
});

test("action sounds disconnect their nodes after ending", () => {
  let oscillator;
  let oscillatorDisconnected = 0;
  let gainDisconnected = 0;
  const gain = {
    gain: {
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    },
    connect() {
      return this;
    },
    disconnect() {
      gainDisconnected++;
    },
  };
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    audioSettings: { effects: true },
    audioContext: {
      currentTime: 0,
      destination: {},
      createGain: () => gain,
      createOscillator: () => {
        oscillator = {
          frequency: {},
          connect: () => gain,
          disconnect() {
            oscillatorDisconnected++;
          },
          start() {},
          stop() {},
        };
        return oscillator;
      },
    },
  });

  v.playSound("notice");
  assert.equal(typeof oscillator.onended, "function");
  oscillator.onended();
  oscillator.onended();
  assert.equal(oscillatorDisconnected, 1);
  assert.equal(gainDisconnected, 1);
});

test("keyboard camera panning stays inside the playable world", () => {
  const v = Object.create(Village.prototype);
  v.camera = { position: new THREE.Vector3(30, 37, 42) };
  v.controls = { target: new THREE.Vector3(0, 0, -1) };
  for (let i = 0; i < 100; i++) v.pan(1, 1);
  assert.equal(v.controls.target.x, 18);
  assert.equal(v.controls.target.z, 24);
  v.pan(-100, -100);
  assert.equal(v.controls.target.x, -20);
  assert.equal(v.controls.target.z, -24);
});

test("village names are trimmed, compacted, and safely bounded", () => {
  assert.equal(sanitizeVillageName("  Willow   Reach  "), "Willow Reach");
  assert.equal(sanitizeVillageName(""), "Willowbrook");
  assert.equal(sanitizeVillageName(null), "Willowbrook");
  assert.equal(sanitizeVillageName("a".repeat(40)).length, 24);
});

test("saved population cannot exceed completed cottage housing", () => {
  const buildings = [
    { type: "house", progress: 1 },
    { type: "house", progress: 0.6 },
    { type: "townhall", progress: 1 },
  ];
  assert.equal(housingCapacity(buildings), 6);
  assert.equal(safePopulation(24, housingCapacity(buildings)), 6);
  // A village with no readable population opens with the starting crew.
  assert.equal(safePopulation("not-a-number", 6), STARTING_POPULATION);
  assert.equal(restoredPopulation(0, 6), 1);
  assert.equal(restoredPopulation(24, 6), 6);
  assert.equal(restoredPopulation(0, 0), 0);
});

test("saved town halls always restore as completed structures", () => {
  assert.equal(normalizedBuildingProgress("townhall", 0), 1);
  assert.equal(normalizedBuildingProgress("townhall", "invalid"), 1);
  assert.equal(normalizedBuildingProgress("house", 0), 0);
  assert.equal(normalizedBuildingProgress("house", 1.4), 1);
});

test("settlement milestones recognize completed player buildings after sparse restores", () => {
  const starter = [
    { type: "house", progress: 1 },
    { type: "house", progress: 1 },
    { type: "house", progress: 1 },
    { type: "farm", progress: 1 },
  ];
  assert.equal(completedPlayerMilestone(starter, {}, "house", 3), false);
  assert.equal(completedPlayerMilestone(starter, {}, "farm", 1), false);
  assert.equal(
    completedPlayerMilestone(
      [{ type: "house", progress: 0.8 }],
      { house: 1 },
      "house",
      3,
    ),
    false,
  );
  assert.equal(
    completedPlayerMilestone(
      [{ type: "house", progress: 1 }],
      { house: 1 },
      "house",
      3,
    ),
    true,
  );
  assert.equal(
    completedPlayerMilestone(
      [...starter, { type: "farm", progress: 1 }],
      {},
      "farm",
      1,
    ),
    true,
  );
});

test("saved camera views are bounded and reject malformed coordinates", () => {
  assert.deepEqual(
    sanitizeCameraView({
      position: [400, -4, -400],
      target: [40, 8, -40],
      zoom: 99,
    }),
    {
      position: [80, 1, -80],
      target: [18, 4, -24],
      zoom: 2.4,
    },
  );
  assert.equal(
    sanitizeCameraView({ position: [0, Number.NaN, 1], target: [0, 0, 0] }),
    null,
  );
});

test("saved path totals reflect validated roads instead of forged counters", () => {
  const created = reconcileRoadCount(
    { road: 999, house: 1 },
    new Set(["0,0", "1,0"]),
  );
  assert.deepEqual(created, { road: 2, house: 1 });
  assert.equal(reconcileRoadCount({ road: 4 }, []).road, 0);
});

test("loaded elapsed time seeds the autosave cycle marker", () => {
  assert.equal(saveCycleMarker(15.99), 15);
  assert.equal(saveCycleMarker("30"), 30);
  assert.equal(saveCycleMarker("invalid"), 0);
});

test("save refuses to overwrite a newer external tab save", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = {
    value: "newer-save",
    setItem() {
      throw new Error("stale save should not write");
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    const v = Object.create(Village.prototype);
    Object.assign(v, { ready: true, storageConflict: true });
    assert.equal(v.save(), false);
    assert.equal(storage.value, "newer-save");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("save detects a newer storage record before the storage event arrives", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let notice = "";
  const storage = {
    value: "newer-save",
    getItem() {
      return this.value;
    },
    setItem() {
      throw new Error("fingerprint guard should prevent this write");
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    const v = Object.create(Village.prototype);
    Object.assign(v, {
      ready: true,
      storageConflict: false,
      saveFingerprint: "older-save",
      lastSavedAt: 1,
      notify(message) {
        notice = message;
      },
      emit() {},
    });
    assert.equal(v.save(), false);
    assert.equal(v.storageConflict, true);
    assert.equal(v.speed, 0);
    assert.match(notice, /another tab/);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("stale tabs refuse rename and path mutations", () => {
  let notice = "";
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    storageConflict: true,
    name: "Willowbrook",
    roads: new Set(),
    resources: { wood: 100, stone: 100, food: 100, wheat: 0, wine: 0 },
    notify(message) {
      notice = message;
    },
  });
  assert.equal(v.setName("New Willow"), null);
  assert.equal(v.name, "Willowbrook");
  v.paintRoad({ x: 0, z: 0 }, { x: 2, z: 0 });
  assert.deepEqual([...v.roads], []);
  assert.equal(v.resources.stone, 100);
  assert.match(notice, /changed in another tab/);
});

test("stale tabs refuse inspector and feast mutations", () => {
  let notice = "";
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    storageConflict: true,
    notify(message) {
      notice = message;
    },
  });
  assert.equal(v.removeBuilding("building-1"), false);
  assert.equal(v.upgradeBuilding("building-1"), false);
  assert.equal(v.startFeast(), false);
  assert.equal(v.dismissTutorial(), false);
  assert.match(notice, /changed in another tab/);
});

test("embedded health samples cannot mutate the player's save", () => {
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    healthCheck: true,
    ready: true,
    storageConflict: false,
  });
  assert.equal(v.save(), false);
  assert.equal(v.importVillage({ buildings: [] }), false);
  assert.equal(v.clearSave(), false);
});

test("rename rolls back when a storage conflict appears during save", () => {
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    name: "Willowbrook",
    storageConflict: false,
    save() {
      this.storageConflict = true;
      return false;
    },
    emit() {},
  });
  assert.equal(v.setName("New Willow"), null);
  assert.equal(v.name, "Willowbrook");
});

test("stale tabs cannot clear a newer saved village", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let removed = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      removeItem() {
        removed = true;
      },
    },
  });
  try {
    const v = Object.create(Village.prototype);
    Object.assign(v, { storageConflict: true });
    assert.equal(v.clearSave(), false);
    assert.equal(removed, false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("clearSave detects a newer storage record before removing it", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let removed = false;
  let notice = "";
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() {
        return "newer-save";
      },
      removeItem() {
        removed = true;
      },
    },
  });
  try {
    const v = Object.create(Village.prototype);
    Object.assign(v, {
      storageConflict: false,
      saveFingerprint: "older-save",
      lastSavedAt: 123,
      notify(message) {
        notice = message;
      },
      emit() {},
    });
    assert.equal(v.clearSave(), false);
    assert.equal(removed, false);
    assert.equal(v.storageConflict, true);
    assert.equal(v.speed, 0);
    assert.match(notice, /another tab/);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("import refuses to replace a newer saved village", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let writes = 0;
  let notice = "";
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() {
        return "newer-save";
      },
      setItem() {
        writes += 1;
      },
    },
  });
  try {
    const v = Object.create(Village.prototype);
    Object.assign(v, {
      storageConflict: false,
      saveFingerprint: "older-save",
      lastSavedAt: 123,
      notify(message) {
        notice = message;
      },
      emit() {},
    });
    assert.equal(v.importVillage({ buildings: [{ type: "house" }] }), false);
    assert.equal(writes, 0);
    assert.equal(v.storageConflict, true);
    assert.match(notice, /another tab/);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("chapter goals track persistent progress and rewards", () => {
  const goals = chapterGoalState({}, {
    created: { road: 8 },
    delivered: { food: 18 },
    buildings: [
      { type: "house", progress: 1 },
      { type: "house", progress: 1 },
      { type: "well", progress: 1 },
    ],
  });
  assert.equal(goals.length, CHAPTER_GOALS.length);
  assert.equal(goals[0].progress, 8);
  assert.equal(goals[1].progress, 18);
  assert.equal(goals[1].description, "Deliver 32 food through bakeries and windmills.");
  assert.equal(goals[2].completed, true);
});

test("beautiful home needs one additional completed cottage and a well", () => {
  const withOneCottage = chapterGoalState({}, {
    buildings: [
      { type: "house", progress: 1 },
      { type: "well", progress: 1 },
    ],
  })[2];
  assert.equal(withOneCottage.completed, false);

  const withTwoCottages = chapterGoalState({}, {
    buildings: [
      { type: "house", progress: 1 },
      { type: "house", progress: 1 },
      { type: "well", progress: 1 },
    ],
  })[2];
  assert.equal(withTwoCottages.completed, true);
});

test("village backups are parseable and summarize safely", () => {
  const parsed = parseVillageImport({
    name: "  Fern  Hollow ",
    population: 24,
    buildings: [{ type: "house" }, { type: "farm" }],
    roads: ["0,0", "1,0"],
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.summary, {
    name: "Fern Hollow",
    population: 24,
    buildings: 2,
    paths: 2,
  });
  assert.equal(parseVillageImport("not json").ok, false);
  assert.deepEqual(summarizeVillageSave({}), {
    name: "Willowbrook",
    population: 0,
    buildings: 0,
    paths: 0,
  });
});

test("feasts spend food", () => {
  const v = village();
  Object.assign(v, {
    ready: true,
    storageConflict: false,
    feast: null,
    notify() {},
    save() { return true; },
    emit() {},
  });
  assert.equal(v.startFeast(), true);
  assert.equal(v.resources.food, 70);
  assert.equal(v.feast.remaining, 45);
});

test("clearing a grain field releases stale farmer work state", () => {
  const v = village();
  const field = {
    id: "field-1",
    type: "grainfield",
    progress: 1,
    x: 2,
    z: 2,
    claimedBy: "farmer-1",
    m: new THREE.Object3D(),
  };
  const worker = {
    id: "farmer-1",
    field,
    building: field,
    phase: "harvest",
    timer: 2,
    workDuration: 8,
    path: [new THREE.Vector3(1, 0, 1)],
    routeTarget: { x: 2, z: 2 },
    waitingForInput: true,
    waitingForStock: true,
    waitingForInn: true,
    mealSeat: 1,
    deliveryRetry: 1.5,
    waitingForSpace: true,
    waitingFor: "worker-2",
    spaceWait: 2,
    forcedYield: "worker-2",
    avoidanceTarget: new THREE.Vector3(3, 0, 3),
    avoidanceTime: 1,
    deadlockLeaderTime: 1,
    deadlockYieldTime: 1,
    deadlockYieldTo: "worker-2",
    materialResource: "wheat",
    m: new THREE.Object3D(),
  };
  Object.assign(v, {
    buildings: [field],
    workers: [worker],
    created: { grainfield: 1 },
    removePickTarget() {},
    refundResource() { return 0; },
    announce() {},
    notify() {},
    save() {},
    emit() {},
  });

  assert.equal(v.removeBuilding(field.id), true);
  assert.equal(v.buildings.length, 0);
  assert.equal(worker.field, null);
  assert.equal(worker.building, null);
  assert.equal(worker.phase, "idle");
  assert.equal(worker.workDuration, 0);
  assert.deepEqual(worker.path, []);
  assert.equal(worker.routeTarget, null);
  assert.equal(worker.waitingForInput, false);
  assert.equal(worker.waitingForStock, false);
  assert.equal(worker.waitingForInn, false);
  assert.equal(worker.mealSeat, null);
  assert.equal(worker.deliveryRetry, 0);
  assert.equal(worker.waitingForSpace, false);
  assert.equal(worker.waitingFor, null);
  assert.equal(worker.spaceWait, 0);
  assert.equal(worker.forcedYield, null);
  assert.equal(worker.avoidanceTarget, null);
  assert.equal(worker.avoidanceTime, 0);
  assert.equal(worker.deadlockLeaderTime, 0);
  assert.equal(worker.deadlockYieldTime, 0);
  assert.equal(worker.deadlockYieldTo, null);
  assert.equal(worker.materialResource, null);
});

test("food spending keeps Inn pantry stock within the village food total", () => {
  const v = village();
  const hall = { type: "townhall", progress: 1 };
  const inn = { type: "inn", progress: 1, breadStock: 8 };
  v.buildings = [hall, inn];
  v.resources.food = 31;
  v.emit = () => {};

  assert.equal(v.startFeast(), true);
  assert.equal(v.resources.food, 1);
  assert.equal(inn.breadStock, 1);
  assert.ok(v.resources.food >= inn.breadStock);
});


test("a bakery waits for wheat, then stacks loaves up to its own limit", () => {
  const v = village();
  const bakery = { type: "bakery", progress: 1, x: 6, z: 6, cycles: 0, stock: 0 };
  const inn = {
    id: "inn-1",
    type: "inn",
    progress: 1,
    x: 10,
    z: 6,
    cycles: 0,
    breadStock: 0,
  };
  const worker = {
    m: new THREE.Object3D(),
    path: [],
    phase: "work",
    timer: 0,
    building: bakery,
  };
  v.buildings = [bakery, inn];
  v.workers = [worker];
  v.route = () => true;
  v.showCarry = () => {};
  v.clearCarry = () => {};
  v.deliveryBurst = () => {};
  v.resources.wheat = 0;
  v.simulate(1);
  assert.equal(worker.waitingForInput, true);
  assert.equal(bakery.stock, 0);

  v.resources.wheat = 8;
  v.simulate(4);
  assert.equal(worker.waitingForInput, false);
  assert.equal(v.resources.wheat, 8 - CATALOG.bakery.input);
  // Loaves land in the bakery, not in the village pool or the Inn.
  assert.equal(bakery.stock, CATALOG.bakery.outputCap);
  assert.equal(v.resources.food, 100);
  assert.equal(inn.breadStock, 0);
  assert.equal(bakery.cycles, 1);

  // The oven is now full, so the next cycle refuses to burn more wheat.
  const wheatLeft = v.resources.wheat;
  worker.timer = 0;
  worker.phase = "work";
  worker.building = bakery;
  v.simulate(0.1);
  assert.equal(worker.waitingForStock, true);
  assert.equal(v.resources.wheat, wheatLeft);
  assert.equal(bakery.stock, CATALOG.bakery.outputCap);
  assert.equal(bakery.cycles, 1);
});

test("a bakery bakes without an Inn, because a store can take the bread", () => {
  const v = village();
  const bakery = { type: "bakery", progress: 1, x: 6, z: 6, cycles: 0, stock: 0 };
  const hall = { type: "townhall", progress: 1, x: 0, z: 0 };
  const worker = {
    m: new THREE.Object3D(),
    path: [],
    phase: "work",
    timer: 0,
    building: bakery,
  };
  v.resources.wheat = 8;
  v.buildings = [bakery, hall];
  v.workers = [worker];
  v.simulate(1);
  assert.equal(worker.waitingForStock, false);
  assert.equal(bakery.stock, CATALOG.bakery.outputCap);
  assert.equal(v.resources.wheat, 8 - CATALOG.bakery.input);
});

test("hungry workers reserve an Inn seat, eat one bread, and return satisfied", () => {
  const v = village();
  const inn = {
    id: "inn-1",
    type: "inn",
    progress: 1,
    x: 6,
    z: 6,
    rotation: 0,
    cycles: 0,
    breadStock: 3,
  };
  const worker = {
    id: "worker-hungry",
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    building: null,
    hunger: HUNGRY_THRESHOLD,
  };
  v.buildings = [inn];
  v.workers = [worker];
  v.route = () => true;
  v.assign(worker);
  assert.equal(worker.phase, "eat_travel");
  assert.equal(worker.building, inn);
  assert.equal(worker.mealSeat, 0);
  v.simulate(0.1);
  assert.equal(worker.phase, "eat");
  assert.equal(inn.breadStock, 2);
  assert.equal(v.resources.food, 99);
  v.simulate(EAT_SECONDS);
  assert.equal(worker.phase, "idle");
  assert.equal(worker.hunger, MEAL_SATIETY);
  assert.equal(inn.cycles, 1);
});

test("a lost meal reservation releases the worker from the Inn", () => {
  const v = village();
  const inn = {
    type: "inn",
    progress: 1,
    x: 6,
    z: 6,
    breadStock: 0,
  };
  const worker = {
    id: "worker-lost-meal",
    m: new THREE.Object3D(),
    path: [],
    phase: "eat_travel",
    timer: 0,
    building: inn,
    workInside: true,
    insideBuilding: true,
    waitingForInn: true,
    mealSeat: 1,
    routeTarget: { x: inn.x, z: inn.z },
  };
  v.buildings = [inn];
  v.workers = [worker];
  v.simulate(0.1);
  assert.equal(worker.phase, "idle");
  assert.equal(worker.building, null);
  assert.equal(worker.workInside, false);
  assert.equal(worker.insideBuilding, false);
  assert.equal(worker.m.visible, true);
  assert.equal(worker.waitingForInn, false);
  assert.equal(worker.mealSeat, null);
  assert.equal(worker.routeTarget, null);
});

test("bread already served to a seated diner does not reserve the remaining pantry stock", () => {
  const v = village();
  const inn = {
    id: "inn-1",
    type: "inn",
    progress: 1,
    x: 6,
    z: 6,
    rotation: 0,
    breadStock: 1,
  };
  const seated = {
    m: new THREE.Object3D(),
    phase: "eat",
    building: inn,
    mealSeat: 0,
  };
  const hungry = {
    m: new THREE.Object3D(),
    phase: "idle",
    building: null,
    hunger: HUNGRY_THRESHOLD,
  };
  v.buildings = [inn];
  v.workers = [seated, hungry];
  v.resources.food = 0;
  assert.equal(v.availableInnFor(hungry), undefined);
  v.resources.food = 1;
  const meal = v.availableInnFor(hungry);
  assert.equal(meal.inn, inn);
  assert.equal(meal.seat, 1);
  assert.equal(meal.availableBread, 1);
});

test("an incoming meal at one Inn does not block another Inn", () => {
  const v = village();
  const stockedInn = {
    id: "inn-stocked",
    type: "inn",
    progress: 1,
    x: 6,
    z: 6,
    breadStock: 1,
  };
  const otherInn = {
    id: "inn-other",
    type: "inn",
    progress: 1,
    x: -6,
    z: -6,
    breadStock: 0,
  };
  const incoming = {
    id: "worker-incoming",
    m: new THREE.Object3D(),
    phase: "eat_travel",
    building: otherInn,
    mealSeat: 0,
  };
  const hungry = {
    id: "worker-hungry",
    m: new THREE.Object3D(),
    phase: "idle",
    building: null,
    hunger: HUNGRY_THRESHOLD,
  };
  v.buildings = [stockedInn, otherInn];
  v.workers = [incoming, hungry];
  v.resources.food = 1;

  const meal = v.availableInnFor(hungry);
  assert.equal(meal.inn, stockedInn);
  assert.equal(meal.availableBread, 1);
});

test("the real route loop carries Bakery bread to the Inn and serves a meal", () => {
  const v = village();
  const bakery = {
    id: "bakery-1",
    type: "bakery",
    progress: 1,
    x: 4,
    z: 4,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  const inn = {
    id: "inn-1",
    type: "inn",
    progress: 1,
    x: 10,
    z: 4,
    rotation: 0,
    cycles: 0,
    breadStock: 0,
    m: new THREE.Object3D(),
  };
  const worker = {
    id: "worker-route",
    movementPriority: 0,
    workerType: WORKER_TYPES.BUILDER,
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    workDuration: 0,
    building: null,
    carry: null,
    hunger: 0.95,
  };
  const hall = {
    id: "hall-1",
    type: "townhall",
    progress: 1,
    x: 0,
    z: 4,
    cycles: 0,
    m: new THREE.Object3D(),
  };
  v.resources.wheat = 40;
  v.resources.food = 0;
  v.buildings = [bakery, inn, hall];
  v.workers = [worker];
  v.showCarry = () => {};
  v.clearCarry = () => {};
  v.deliveryBurst = () => {};
  for (let step = 0; step < 1800; step++) v.simulate(0.1);
  assert.ok(bakery.cycles >= 1);
  // The one villager bakes, then carries the loaves out, then eats one.
  assert.ok(bakery.stock < CATALOG.bakery.outputCap || v.delivered.food > 0);
  assert.ok(v.delivered.food >= CATALOG.bakery.amount);
  assert.ok(inn.cycles >= 1);
});

test("path totals discount the starter village's own roads", () => {
  const base = new Set(["0,0", "1,0", "2,0"]);
  const all = new Set([...base, "5,5", "6,5"]);
  assert.equal(reconcileRoadCount({}, all, base).road, 2);
  assert.equal(reconcileRoadCount({}, base, base).road, 0);
  assert.deepEqual(reconcileRoadCount({ house: 3 }, all, base), {
    house: 3,
    road: 2,
  });
  // Callers that already hold a player-only set keep working unchanged.
  assert.equal(reconcileRoadCount({}, new Set(["5,5", "6,5"])).road, 2);
});

test("removing a path does not inflate progress with starter roads", () => {
  const v = village();
  v.baseRoads = new Set();
  for (let x = 0; x < 40; x++) {
    v.roads.add(`${x},-9`);
    v.baseRoads.add(`${x},-9`);
  }
  v.roads.add("4,4");
  v.roads.add("5,4");
  v.created.road = 2;
  v.scene = { remove() {}, children: [] };
  v.disposeOwnedObject = () => {};
  v.announce = () => {};
  v.emit = () => {};

  assert.equal(v.removeRoad(99, 99), false, "a tile with no path on it is rejected");
  assert.equal(v.removeRoad(4, 4), true);
  assert.equal(v.created.road, 1, "only the player's remaining tile counts");

  const goal = chapterGoalState({}, { created: v.created, delivered: {}, buildings: [] })[0];
  assert.equal(goal.metric, "paths");
  assert.equal(goal.progress, 1);
  assert.equal(goal.completed, false, "removing a path must not complete the paths goal");

  // Starter roads stay protected and uncounted.
  assert.equal(v.removeRoad(0, -9), false);
  assert.equal(v.created.road, 1);
});

test("removing a path never exceeds stone storage", () => {
  const v = village();
  v.baseRoads = new Set();
  v.roads = new Set(["4,4", "5,4"]);
  v.buildings = [{ type: "townhall", progress: 1 }];
  v.created.road = 2;
  v.scene = { remove() {}, children: [] };
  v.disposeOwnedObject = () => {};
  v.announce = () => {};
  v.emit = () => {};

  v.resources.stone = TOWNHALL_STORAGE;
  assert.equal(v.removeRoad(4, 4), true);
  assert.equal(v.resources.stone, TOWNHALL_STORAGE);

  v.roads.add("4,4");
  v.resources.stone = TOWNHALL_STORAGE - 1;
  assert.equal(v.removeRoad(4, 4), true);
  assert.equal(v.resources.stone, TOWNHALL_STORAGE);
});

test("building refunds stay within each resource storage limit", () => {
  const v = village();
  const hall = { id: "hall", type: "townhall", progress: 1, x: 0, z: 0 };
  const field = {
    id: "field",
    type: "grainfield",
    progress: 1,
    x: 3,
    z: 0,
    m: new THREE.Object3D(),
  };
  const house = {
    id: "house",
    type: "house",
    progress: 0.5,
    x: -3,
    z: 0,
    m: new THREE.Object3D(),
    scaffolding: new THREE.Object3D(),
    siteRing: new THREE.Object3D(),
  };
  v.buildings = [hall, field, house];
  v.resources.food = TOWNHALL_STORAGE;
  v.resources.wood = TOWNHALL_STORAGE;
  v.resources.stone = TOWNHALL_STORAGE;
  v.disposeOwnedObject = () => {};
  v.removePickTarget = () => {};
  v.setWorkerInside = () => {};
  v.announce = () => {};
  v.emit = () => {};

  assert.equal(v.removeBuilding("field"), true);
  assert.equal(v.resources.food, TOWNHALL_STORAGE);
  assert.equal(v.removeBuilding("house"), true);
  assert.equal(v.resources.wood, TOWNHALL_STORAGE);
  assert.equal(v.resources.stone, TOWNHALL_STORAGE);
});

test("scenery lands on the same coordinates whatever the village contains", () => {
  const first = sceneryCandidates();
  const second = sceneryCandidates();
  assert.equal(first.length, SCENERY_COUNT);
  assert.deepEqual(first, second);

  // The runtime generator is shared by roads, lanterns and worker spawns, so a
  // restored village drains it by an amount that depends on the save. Scenery
  // must not move because of that.
  const v = village();
  for (let i = 0; i < 500; i++) v.workerSpawnPosition(0, 0);
  assert.deepEqual(sceneryCandidates(), first);

  // Rejecting a candidate must not shift the ones after it.
  const placeable = (candidate, buildings) =>
    !buildings.some(
      (b) =>
        Math.hypot(candidate.x - b.x, candidate.z - b.z) <
        (CATALOG[b.type]?.size || 4) / 2 + 2.2,
    );
  const dense = Array.from({ length: 12 }, (_, i) => ({
    type: "house",
    x: -20 + i * 4,
    z: i % 2 ? 6 : -6,
  }));
  const empty = first.filter((c) => placeable(c, []));
  const crowded = first.filter((c) => placeable(c, dense));
  assert.ok(crowded.length < empty.length, "the dense village rejects more candidates");
  const emptyKeys = new Set(empty.map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`));
  for (const c of crowded)
    assert.ok(
      emptyKeys.has(`${c.x.toFixed(3)},${c.z.toFixed(3)}`),
      "a surviving tree keeps the coordinates its saved state is keyed to",
    );
});

test("grass scatter is deterministic and distinct from the scenery stream", () => {
  const first = grassCandidates();
  assert.equal(first.length, GRASS_COUNT);
  assert.deepEqual(grassCandidates(), first);
  assert.notDeepEqual(
    first.map((blade) => blade.x),
    sceneryCandidates(GRASS_COUNT).map((c) => c.x),
  );
  for (const blade of first) {
    assert.ok(blade.radius > 0 && blade.height > 0);
    assert.ok(["#f4d587", "#728844"].includes(blade.color));
  }
});

function lanternVillage(preset = "balanced") {
  const v = Object.create(Village.prototype);
  const scene = new THREE.Scene();
  Object.assign(v, {
    scene,
    buildings: [],
    graphicsPreset: preset,
    lanternLights: [],
    lanternReaim: 0,
    controls: { target: new THREE.Vector3(0, 0, 0) },
    atmosphere: { nightAmount: 1 },
  });
  return v;
}

function addLanternBuilding(v, type, x, z) {
  const m = new THREE.Object3D();
  m.position.set(x, 0, z);
  // The building has to live in the scene, or a traversal looking for stray
  // lights inside its group would never reach them.
  v.scene.add(m);
  const b = { type, x, z, m, progress: 1 };
  v.buildings.push(b);
  v.addLanterns(b);
  return b;
}

test("lantern lights stay within a fixed budget however many cottages are built", () => {
  const v = lanternVillage("balanced");
  const budget = lanternLightBudget("balanced");

  for (let i = 0; i < 20; i++) addLanternBuilding(v, "house", i * 3 - 30, 0);

  assert.equal(v.lanternLamps().length, 40, "every cottage still has two lamps");
  assert.equal(v.lanternLights.length, budget);

  let sceneLights = 0;
  v.scene.traverse((o) => {
    if (o.isPointLight) sceneLights++;
  });
  assert.equal(sceneLights, budget, "no stray lights hide inside building groups");

  // Building more must not change the light count: a changed count recompiles
  // every material in the scene, which is the stall this budget exists to stop.
  const before = v.lanternLights.length;
  for (let i = 0; i < 10; i++) addLanternBuilding(v, "house", i * 3 - 30, 12);
  assert.equal(v.lanternLights.length, before);
});

test("a small village lights every lamp it has, and low graphics lights none", () => {
  const v = lanternVillage("balanced");
  addLanternBuilding(v, "well", 0, 0);
  assert.equal(v.lanternLamps().length, 2);
  assert.equal(v.lanternLights.length, 2, "below budget, every lamp gets a light");

  v.renderer = { shadowMap: {} };
  v.resize = () => {};
  v.emit = () => {};
  assert.equal(v.setGraphicsPreset("low"), true);
  assert.equal(v.lanternLights.length, 0, "the low preset drops lantern lights entirely");

  assert.equal(v.setGraphicsPreset("high"), true);
  assert.equal(v.lanternLights.length, 2);
  assert.equal(lanternLightBudget("nonsense"), LANTERN_LIGHT_BUDGET.balanced);
});

test("low graphics drops optional atmospheric animation", () => {
  const v = Object.create(Village.prototype);
  const grass = { visible: true };
  const motes = { visible: true };
  const ripple = { visible: true };
  const bird = { group: { visible: true } };
  Object.assign(v, {
    graphicsPreset: "balanced",
    renderer: { shadowMap: {} },
    grassField: { mesh: grass },
    motes,
    ripples: [ripple],
    birds: [bird],
    resize: () => {},
    emit: () => {},
    syncLanternLightPool: () => {},
  });

  assert.equal(v.setGraphicsPreset("low"), true);
  assert.equal(grass.visible, false);
  assert.equal(motes.visible, false);
  assert.equal(ripple.visible, false);
  assert.equal(bird.group.visible, false);

  assert.equal(v.setGraphicsPreset("balanced"), true);
  assert.equal(grass.visible, true);
  assert.equal(motes.visible, true);
  assert.equal(ripple.visible, true);
  assert.equal(bird.group.visible, true);

  v.reduceMotion = true;
  assert.equal(v.setGraphicsPreset("low"), true);
  assert.equal(v.setGraphicsPreset("balanced"), true);
  assert.equal(bird.group.visible, false, "reduced motion keeps birds hidden after a toggle");
});

test("graphics presets scale shadow-map cost with the viewport", () => {
  assert.equal(shadowMapSizeForPreset("low", 390), 512);
  assert.equal(shadowMapSizeForPreset("balanced", 390), 1024);
  assert.equal(shadowMapSizeForPreset("balanced", 1280), 1536);
  assert.equal(shadowMapSizeForPreset("high", 390), 1536);
  assert.equal(shadowMapSizeForPreset("high", 1280), 2048);
  assert.equal(shadowMapSizeForPreset("unknown", 1280), 1536);
});

test("lantern lights follow the lamps nearest the camera", () => {
  const v = lanternVillage("balanced");
  const budget = lanternLightBudget("balanced");
  for (let i = 0; i < 12; i++) addLanternBuilding(v, "house", i * 5, 0);
  v.scene.updateMatrixWorld(true);

  v.controls.target.set(0, 0, 0);
  const near = v.aimLanternLights();
  assert.equal(near.length, budget);
  const nearX = v.lanternLights.map((l) => l.position.x).sort((a, b) => a - b);
  assert.ok(nearX[nearX.length - 1] < 20, "lights cluster around the near cottages");

  v.controls.target.set(55, 0, 0);
  v.aimLanternLights();
  const farX = v.lanternLights.map((l) => l.position.x).sort((a, b) => a - b);
  assert.ok(farX[0] > 20, "lights follow the camera to the far cottages");
  assert.notDeepEqual(nearX, farX);
  const anchor = v.lanternAnchor;
  v.aimLanternLights();
  assert.equal(v.lanternAnchor, anchor, "lantern ranking reuses its scratch point");
});

test("lantern flicker drives the pooled lights and brightens with nightfall", () => {
  const v = lanternVillage("balanced");
  addLanternBuilding(v, "house", 0, 0);
  v.scene.updateMatrixWorld(true);

  v.atmosphere.nightAmount = 0;
  v.updateLanternLights(0, 1, 1);
  const day = v.lanternLights.map((l) => l.intensity);

  v.atmosphere.nightAmount = 1;
  v.updateLanternLights(0, 1, 1);
  const night = v.lanternLights.map((l) => l.intensity);

  assert.equal(day.length, 2);
  night.forEach((value, i) => assert.ok(value > day[i], "lanterns brighten at night"));

  // Reduced motion removes the flicker but keeps the lamps lit.
  v.updateLanternLights(1.234, 0, 1);
  const still = v.lanternLights.map((l) => l.intensity);
  v.updateLanternLights(9.876, 0, 1);
  assert.deepEqual(v.lanternLights.map((l) => l.intensity), still);
});

test("atmosphere projection skips unchanged simulation time", () => {
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    elapsed: 0,
    sun: {
      position: new THREE.Vector3(),
      color: new THREE.Color(),
      intensity: 0,
    },
    hemi: { intensity: 0 },
    scene: {
      background: new THREE.Color(),
      fog: { color: new THREE.Color() },
    },
    atmosphere: {
      day: new THREE.Color("#a7b673"),
      dusk: new THREE.Color("#c98d6a"),
      night: new THREE.Color("#516878"),
      fog: new THREE.Color(),
      sky: new THREE.Color(),
      sunDay: new THREE.Color("#fff0cd"),
      sunWarm: new THREE.Color("#ffc083"),
      sun: new THREE.Color(),
    },
  });

  v.updateAtmosphere();
  v.sun.intensity = -1;
  v.updateAtmosphere();
  assert.equal(v.sun.intensity, -1, "paused time avoids repeating light writes");

  v.elapsed = 1;
  v.updateAtmosphere();
  assert.notEqual(v.sun.intensity, -1, "a new simulation time refreshes lighting");
});

test("path tiles merge into one surface instead of one mesh each", () => {
  const tiles = [
    { x: 0, z: 0, tint: ROAD_TINTS[0] },
    { x: 1, z: 0, tint: ROAD_TINTS[1] },
    { x: 1, z: 1, tint: ROAD_TINTS[2] },
  ];
  const geometry = buildRoadSurfaceGeometry(tiles);
  const perTile = geometry.attributes.position.count / tiles.length;
  assert.equal(perTile, 24, "one box worth of vertices per tile");
  assert.equal(geometry.index.count, tiles.length * 36);
  assert.ok(geometry.attributes.color, "tint moved into a vertex attribute");
  assert.equal(geometry.attributes.color.count, geometry.attributes.position.count);

  // Tiles must land at their own world position, lifted to the road height.
  const position = geometry.attributes.position;
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (let i = 0; i < position.count; i++) {
    minX = Math.min(minX, position.getX(i));
    maxX = Math.max(maxX, position.getX(i));
    minY = Math.min(minY, position.getY(i));
  }
  assert.ok(Math.abs(minX - (0 - ROAD_TILE.size / 2)) < 1e-6);
  assert.ok(Math.abs(maxX - (1 + ROAD_TILE.size / 2)) < 1e-6);
  assert.ok(Math.abs(minY - (ROAD_TILE.y - ROAD_TILE.height / 2)) < 1e-6);

  // Continuity across joins holds precisely when UV is a pure function of world
  // position: two tiles meeting at the same world point then sample the same
  // texel, whichever tile the vertex belongs to.
  const uv = geometry.attributes.uv;
  const scale = position.getX(0) / uv.getX(0);
  assert.ok(Number.isFinite(scale) && scale !== 0);
  for (let i = 0; i < position.count; i++) {
    assert.ok(
      Math.abs(uv.getX(i) * scale - position.getX(i)) < 1e-5,
      `vertex ${i} u must map to its world x`,
    );
    assert.ok(
      Math.abs(uv.getY(i) * scale - position.getZ(i)) < 1e-5,
      `vertex ${i} v must map to its world z`,
    );
  }

  assert.equal(buildRoadSurfaceGeometry([]).attributes.position, undefined);
});

test("laying and lifting paths rebuilds the surface without adding meshes", () => {
  const v = village();
  v.baseRoads = new Set();
  v.roadTiles = new Map();
  v.created = {};
  let added = 0;
  v.scene = { add() { added++; }, remove() {} };
  v.announce = () => {};
  v.emit = () => {};
  v.notify = () => {};
  v.roadSurfaceTexture = () => null;

  for (let i = 0; i < 25; i++) v.addRoad(i, 0);
  assert.equal(v.roadTiles.size, 25);
  assert.equal(v.created.road, 25);
  assert.equal(v.roadsDirty, true, "painting marks the surface dirty once");

  assert.equal(v.rebuildRoadSurface(), true);
  assert.equal(v.roadsDirty, false);
  assert.equal(added, 1, "25 tiles cost exactly one scene object");
  assert.equal(v.roadSurfaceMesh.geometry.index.count, 25 * 36);

  assert.equal(v.removeRoad(5, 0), true);
  assert.equal(v.roadTiles.size, 24);
  assert.equal(v.roadsDirty, true);
  v.rebuildRoadSurface();
  assert.equal(added, 1, "removing a tile does not create another object");
  assert.equal(v.roadSurfaceMesh.geometry.index.count, 24 * 36);
});

test("grass blades share one instanced draw and sway together", () => {
  const v = village();
  const scene = new THREE.Scene();
  v.scene = scene;
  const blades = grassCandidates(40).map((blade) => blade);
  const mesh = v.buildGrassField(blades);
  assert.ok(mesh, "a grass field is built");
  assert.equal(mesh.isInstancedMesh, true);
  assert.equal(mesh.count, blades.length);

  let meshCount = 0;
  scene.traverse((o) => {
    if (o.isMesh) meshCount++;
  });
  assert.equal(meshCount, 1, "40 blades occupy a single scene mesh");

  // Each blade carries its own size in the instance scale.
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  mesh.getMatrixAt(3, matrix);
  matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  assert.ok(Math.abs(scale.y - blades[3].height) < 1e-5);
  assert.ok(Math.abs(scale.x - blades[3].radius) < 1e-5);

  // Sway moves the blades; reduced motion settles them and stops the upload.
  const poseAt = (index) => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(index, m);
    return m.elements.join(",");
  };
  v.updateGrassField(0, 1);
  const calm = poseAt(0);
  assert.equal(
    v.updateGrassField(GRASS_UPDATE_INTERVAL * 0.5, 1),
    false,
    "atmospheric sway skips a sub-frame update",
  );
  v.updateGrassField(1.7, 1);
  assert.notEqual(poseAt(0), calm, "blades sway over time");

  v.updateGrassField(2.5, 0);
  const settled = poseAt(0);
  assert.equal(v.updateGrassField(9.9, 0), false, "no work while motion is off");
  assert.equal(poseAt(0), settled);
});

test("an empty grass field and a scene-less village stay harmless", () => {
  const v = village();
  v.scene = new THREE.Scene();
  assert.equal(v.buildGrassField([]), null);
  assert.equal(v.updateGrassField(0, 1), false);

  const headless = village();
  headless.scene = { remove() {} };
  assert.equal(headless.ensureRoadSurface(), null);
  assert.equal(headless.rebuildRoadSurface(), false);
});

test("a Storehouse is a carrier's post, so the School can train more of them", () => {
  assert.equal(workerTypeForBuilding("storehouse"), WORKER_TYPES.CARRIER);
  assert.equal(workerTypeForBuilding("townhall"), WORKER_TYPES.CARRIER);
  // The town hall alone posts carriers, so a new village can move goods
  // before it can afford its first Storehouse.
  const hall = { type: "townhall", progress: 1 };
  const store = { type: "storehouse", progress: 1 };
  assert.equal(
    jobCapacityForWorkerType([hall], WORKER_TYPES.CARRIER),
    workerCapacityForBuilding("townhall"),
  );
  assert.equal(
    jobCapacityForWorkerType([hall, store], WORKER_TYPES.CARRIER),
    workerCapacityForBuilding("townhall") + workerCapacityForBuilding("storehouse"),
  );
  const option = trainingOptions(
    [hall, store, { type: "house", progress: 1 }],
    [],
  ).find((entry) => entry.type === WORKER_TYPES.CARRIER);
  assert.ok(option, "carriers appear in the School's training list");
  assert.equal(option.label, "Carrier");
});

test("stores hold goods and producers hold a capped backlog", () => {
  assert.equal(storageForBuilding("townhall"), TOWNHALL_STORAGE);
  assert.equal(storageForBuilding("storehouse"), CATALOG.storehouse.storage);
  assert.equal(storageForBuilding("bakery"), 0);
  assert.equal(isStoreBuilding("storehouse"), true);
  assert.equal(isStoreBuilding("bakery"), false);
  assert.equal(outputCapForBuilding("bakery"), 5);
  assert.equal(outputCapForBuilding("storehouse"), 0);
});

test("a building with a full store is passed over when work is handed out", () => {
  const v = village();
  const full = {
    type: "mine",
    progress: 1,
    x: 2,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
    stock: CATALOG.mine.outputCap,
  };
  const open = {
    type: "lumberyard",
    progress: 1,
    x: 10,
    z: 0,
    cycles: 0,
    m: new THREE.Object3D(),
    stock: 0,
  };
  const w = {
    m: new THREE.Object3D(),
    path: [],
    phase: "idle",
    timer: 0,
    building: null,
  };
  w.m.position.set(0, 0, 0);
  v.buildings = [full, open];
  v.workers = [w];
  v.route = () => true;
  v.showCarry = () => {};
  v.clearCarry = () => {};
  // The nearer mine is skipped because nobody can collect from it; the
  // villager walks past it to the yard that still has room.
  v.assign(w);
  assert.notEqual(w.building, full);
});

test("a saved producer keeps the goods still waiting for a carrier", () => {
  const stock = 3;
  const saved = {
    type: "bakery",
    stock,
    cycles: 1,
  };
  // The save shape only carries a stock figure for buildings that buffer.
  assert.ok(outputCapForBuilding(saved.type) > 0);
  const clamped = Math.max(
    0,
    Math.min(outputCapForBuilding(saved.type), Math.floor(saved.stock)),
  );
  assert.equal(clamped, stock);
  // A forged figure is still bounded, with one carrier load of headroom for a
  // load a full village handed back.
  assert.equal(
    Math.max(0, Math.min(savedStockLimit("bakery"), Math.floor(9999))),
    CATALOG.bakery.outputCap + CARRIER_LOAD,
  );
  assert.equal(savedStockLimit("storehouse"), 0);
});
