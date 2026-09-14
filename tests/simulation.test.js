import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  finiteNumber,
  housingCapacity,
  normalizedBuildingProgress,
  reconcileRoadCount,
  saveCycleMarker,
  sanitizeCameraView,
  savedBuildingFits,
  safePopulation,
  restoredPopulation,
  sanitizeVillageName,
  parseVillageImport,
  summarizeVillageSave,
  Village,
} from "../src/world.js";
import {
  CHAPTER_GOALS,
  chapterGoalState,
  completedPlayerMilestone,
} from "../src/progression.js";
function village() {
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    resources: { wood: 100, stone: 100, food: 100 },
    buildings: [],
    workers: [],
    decor: [],
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
  assert.match(v.valid(-8, -8, "house").reason, /resources/);
  assert.match(v.valid(-8, -8, "house").reason, /Need 30 wood \+ 10 stone/);
});
test("guided placement searches for the nearest clear site", () => {
  const v = village();
  v.buildings.push({ type: "house", x: 0, z: 3 });
  v.decor = [{ x: 1, z: 3, r: 0.8 }];
  const site = v.findOpenPlacement("house", { x: 0, z: 3 });
  assert.equal(v.valid(site.x, site.z, "house").ok, true);
  assert.notDeepEqual(site, { x: 0, z: 3 });
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
test("worker assignment prefers the closest equally staffed work site", () => {
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
  v.buildings = [far, near];
  v.workers = [w];
  v.route = () => true;
  v.simulate(0.1);
  assert.equal(w.building, near);
  assert.equal(w.phase, "travel");
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
test("builder completes structure and welcomes two workers", () => {
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
  assert.equal(welcomed, 2);
  assert.equal(v.activity, "Cottage is ready. 2 new villagers have arrived.");
  assert.equal(v.activityLog[0].message, v.activity);
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

test("resources are credited only on delivery, not at the job site", () => {
  const v = village();
  const b = {
    type: "lumberyard",
    progress: 1,
    m: new THREE.Object3D(),
    x: 5,
    z: 5,
    cycles: 0,
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
    building: b,
  };
  v.buildings = [hall, b];
  v.workers = [w];
  let routeTarget;
  v.route = (_worker, x, z) => {
    routeTarget = [x, z];
    return true;
  };
  v.simulate(0.1);
  assert.equal(v.resources.wood, 100);
  assert.deepEqual(w.carry, { resource: "wood", amount: 8 });
  assert.equal(w.phase, "deliver");
  assert.deepEqual(routeTarget, v.jobPoint(hall));
  v.simulate(0.1);
  assert.equal(v.resources.wood, 108);
  assert.equal(v.gathered, 8);
  assert.equal(b.cycles, 1);
  assert.equal(v.activity, "Wood +8 delivered to the hall.");
});
test("blocked deliveries wait instead of crediting resources remotely", () => {
  const v = village();
  const b = {
    type: "lumberyard",
    progress: 1,
    m: new THREE.Object3D(),
    x: 5,
    z: 5,
    cycles: 0,
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
    building: b,
  };
  v.buildings = [hall, b];
  v.workers = [w];
  v.route = () => false;
  v.simulate(0.1);
  assert.equal(w.phase, "deliver");
  assert.deepEqual(w.carry, { resource: "wood", amount: 8 });
  v.simulate(6);
  assert.equal(v.resources.wood, 100);
  assert.equal(b.cycles, 0);
  assert.deepEqual(w.carry, { resource: "wood", amount: 8 });
});
test("windmill waits for input rather than producing free food", () => {
  const v = village();
  v.resources.food = 1;
  const w = {
    m: new THREE.Object3D(),
    path: [],
    phase: "work",
    timer: 0,
    building: { type: "windmill" },
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
  assert.equal(w.carry.amount, 8);
  assert.equal(v.activity, "Windmill has food again.");
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
  v.workers = [{ building: b, phase: "deliver" }];
  v.emit();
  assert.equal(state.buildings[0].workers, 1);
  assert.equal(state.buildings[0].status, "Delivering");
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
      buildingType: "stone",
      carry: { resource: "stone", amount: 6 },
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

test("save keeps delivery history as safe whole-number building totals", () => {
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
      resources: { wood: 100, stone: 100, food: 100 },
      workers: [],
      elapsed: 12,
      created: {},
      gathered: 8,
      activityLog: [{ message: "Wood +8 delivered to the hall." }],
      roads: new Set(["0,0", "2,2"]),
      baseRoads: new Set(["0,0"]),
      buildings: [
        { type: "mine", x: 1, z: 1, rotation: 0, progress: 1, cycles: 7.8 },
        { type: "farm", x: 4, z: 4, rotation: 0, progress: 1, cycles: -3 },
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
      [7, 0],
    );
    assert.deepEqual(saved.activityLog, ["Wood +8 delivered to the hall."]);
    assert.deepEqual(saved.roads, ["2,2"]);
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
  assert.equal(housingCapacity(buildings), 8);
  assert.equal(safePopulation(24, housingCapacity(buildings)), 8);
  assert.equal(safePopulation("not-a-number", 8), 8);
  assert.equal(restoredPopulation(0, 8), 1);
  assert.equal(restoredPopulation(24, 8), 8);
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
    resources: { wood: 100, stone: 100, food: 100 },
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

test("stale tabs refuse inspector, feast, and story mutations", () => {
  let notice = "";
  const v = Object.create(Village.prototype);
  Object.assign(v, {
    storageConflict: true,
    notify(message) {
      notice = message;
    },
  });
  assert.equal(v.removeBuilding("building-1"), false);
  assert.equal(v.beginMove("building-1"), false);
  assert.equal(v.setPriority("building-1", "priority"), false);
  assert.equal(v.setPaused("building-1", true), false);
  assert.equal(v.upgradeBuilding("building-1"), false);
  assert.equal(v.startFeast(), false);
  assert.equal(v.resolveEvent(0), false);
  assert.equal(v.dismissTutorial(), false);
  assert.match(notice, /changed in another tab/);
});

test("move selection resolves the building type for relocation previews", () => {
  const v = Object.create(Village.prototype);
  v.buildings = [{ id: "house-1", type: "house" }];

  assert.equal(v.placementType("move:house-1"), "house");
  assert.equal(v.placementType("move:missing"), "");
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
      { type: "house", progress: 1 },
      { type: "house", progress: 1 },
      { type: "well", progress: 1 },
    ],
  });
  assert.equal(goals.length, CHAPTER_GOALS.length);
  assert.equal(goals[0].progress, 8);
  assert.equal(goals[1].progress, 18);
  assert.equal(goals[2].completed, true);
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

test("feasts spend food and pause controls release current workers", () => {
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
  const building = { id: "farm-1", type: "farm", progress: 1, paused: false };
  const worker = { building, phase: "work", path: [], timer: 2 };
  v.buildings = [building];
  v.workers = [worker];
  assert.equal(v.setPaused("farm-1", true), true);
  assert.equal(worker.building, null);
  assert.equal(building.paused, true);
});
