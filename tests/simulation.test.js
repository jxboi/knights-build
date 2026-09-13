import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Village } from "../src/world.js";
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
  v.resources.wood = 0;
  assert.match(v.valid(-8, -8, "house").reason, /resources/);
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
});
test("resources are credited only on delivery, not at the job site", () => {
  const v = village();
  const b = {
    type: "lumberyard",
    progress: 1,
    m: new THREE.Object3D(),
    cycles: 0,
  };
  const w = {
    m: new THREE.Object3D(),
    path: [],
    phase: "work",
    timer: 0,
    building: b,
  };
  v.buildings = [b];
  v.workers = [w];
  v.route = () => true;
  v.simulate(0.1);
  assert.equal(v.resources.wood, 100);
  assert.deepEqual(w.carry, { resource: "wood", amount: 8 });
  assert.equal(w.phase, "deliver");
  v.simulate(0.1);
  assert.equal(v.resources.wood, 108);
  assert.equal(v.gathered, 8);
  assert.equal(b.cycles, 1);
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
  assert.equal(v.resources.food, 1);
  v.resources.food = 2;
  w.timer = 0;
  v.route = () => true;
  v.simulate(0.1);
  assert.equal(v.resources.food, 0);
  assert.equal(w.carry.amount, 8);
});
