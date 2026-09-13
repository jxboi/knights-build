import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const CATALOG = {
  house: {
    name: "Cottage",
    size: 3,
    cost: { wood: 30, stone: 10 },
    description: "A warm hearth and room for four more villagers.",
    effect: "+4 population capacity",
    seconds: 12,
  },
  well: {
    name: "Well",
    size: 2,
    cost: { wood: 15, stone: 25 },
    description: "Fresh water at the heart of your growing settlement.",
    effect: "A gathering place for your village",
    seconds: 10,
  },
  farm: {
    name: "Farm",
    size: 4,
    cost: { wood: 25, stone: 5 },
    description: "Golden fields that keep your villagers well fed.",
    effect: "+8 food per harvest",
    resource: "food",
    amount: 8,
    seconds: 14,
  },
  lumberyard: {
    name: "Lumberyard",
    size: 3,
    cost: { wood: 20, stone: 10 },
    description: "Turns the surrounding forest into building timber.",
    effect: "+8 wood per delivery",
    resource: "wood",
    amount: 8,
    seconds: 12,
  },
  mine: {
    name: "Stone mine",
    size: 4,
    cost: { wood: 35, stone: 15 },
    description: "A steady source of stone from beneath the hills.",
    effect: "+6 stone per delivery",
    resource: "stone",
    amount: 6,
    seconds: 18,
  },
  windmill: {
    name: "Windmill",
    size: 4,
    cost: { wood: 50, stone: 35 },
    description: "Grinds the harvest into flour. Requires food to work.",
    effect: "2 food → 8 food per cycle",
    resource: "food",
    amount: 8,
    input: 2,
    seconds: 20,
  },
  watchtower: {
    name: "Watchtower",
    size: 3,
    cost: { wood: 45, stone: 20 },
    description: "A lookout above the trees. Expands your building boundary.",
    effect: "+3 tiles of buildable land",
    seconds: 16,
  },
  road: {
    name: "Path",
    size: 1,
    cost: { stone: 1 },
    description: "Connect your hamlet. Villagers move faster on paths.",
    effect: "+50% walking speed",
    seconds: 0,
  },
};
const initial = [
  ["townhall", -3, -3],
  ["house", -9, 2],
  ["house", -9, -5],
  ["house", -4, 8],
  ["well", 1, 2],
  ["farm", 6, 6],
  ["lumberyard", -8, -11],
  ["mine", 2, -11],
  ["windmill", 11, -1],
  ["watchtower", 10, -10],
];
let seed = 654321;
const rand = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
};
const riverX = (z) => 16 + Math.sin(z * 0.13) * 1.6;
export class Village {
  constructor(container, onUpdate, onNotify, onSelect, onLoaded) {
    this.container = container;
    this.onUpdate = onUpdate;
    this.notify = onNotify;
    this.onSelect = onSelect;
    this.onLoaded = onLoaded;
    this.buildings = [];
    this.workers = [];
    this.decor = [];
    this.roads = new Set();
    this.resources = { wood: 140, stone: 95, food: 80 };
    this.elapsed = 0;
    this.speed = 1;
    this.selected = null;
    this.rotation = 0;
    this.lastUI = 0;
    this.gathered = 0;
    this.created = {};
    this.dead = false;
    this.models = {};
    this.thumbnails = {};
    try {
      this.saved = JSON.parse(localStorage.getItem("hearth-v1"));
    } catch {}
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#a7b673");
    this.scene.fog = new THREE.Fog("#a7b673", 65, 120);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      const view = 30;
      this.camera.left = (-view * w) / h / 2;
      this.camera.right = (view * w) / h / 2;
      this.camera.top = view / 2;
      this.camera.bottom = -view / 2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    this.resize();
    window.addEventListener("resize", this.resize);
    this.move = (e) => this.pointerMove(e);
    this.down = (e) => {
      this.startPointer = [e.clientX, e.clientY];
    };
    this.up = (e) => {
      if (
        e.button === 0 &&
        this.startPointer &&
        Math.hypot(
          e.clientX - this.startPointer[0],
          e.clientY - this.startPointer[1],
        ) < 6
      )
        this.click(e);
    };
    container.addEventListener("pointermove", this.move);
    container.addEventListener("pointerdown", this.down);
    container.addEventListener("pointerup", this.up);
    container.addEventListener(
      "contextmenu",
      (this.context = (e) => e.preventDefault()),
    );
    this.beforeUnload = () => this.save();
    window.addEventListener("pagehide", this.beforeUnload);
    this.clock = new THREE.Clock();
    this.animate();
    this.load();
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
    this.scene.add(new THREE.HemisphereLight("#fff5df", "#6a7842", 1.65));
    const sun = new THREE.DirectionalLight("#fff0cd", 2.7);
    sun.position.set(-18, 35, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -36,
      right: 36,
      top: 36,
      bottom: -36,
      near: 1,
      far: 90,
    });
    sun.shadow.normalBias = 0.04;
    sun.shadow.bias = -0.0002;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    const geo = new THREE.PlaneGeometry(150, 150, 65, 65);
    geo.rotateX(-Math.PI / 2);
    const cols = [];
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const c = new THREE.Color().setHSL(
        0.215 + rand() * 0.017,
        0.39 + rand() * 0.035,
        0.45 + rand() * 0.016,
      );
      c.convertSRGBToLinear();
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const land = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    land.position.y = -0.045;
    land.receiveShadow = true;
    this.scene.add(land);
    this.grid = new THREE.GridHelper(42, 42, "#eee4b3", "#dde1b6");
    this.grid.position.set(0, 0.025, 0);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.24;
    this.grid.visible = false;
    this.scene.add(this.grid);
    const waterVerts = [],
      waterColors = [];
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
        waterVerts.push(v[0], 0.018, v[1]);
        const c = new THREE.Color().setHSL(
          0.535 + rand() * 0.016,
          0.47,
          0.46 + rand() * 0.07,
        );
        c.convertSRGBToLinear();
        waterColors.push(c.r, c.g, c.b);
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
    // Sandy river banks follow the water's curve.
    for (let z = -65; z < 65; z += 0.6) {
      for (const side of [0, 8]) {
        this.mesh(
          new THREE.CircleGeometry(0.69, 7),
          "#b8b47c",
          riverX(z) + side,
          0.001,
          z,
        ).rotation.x = -Math.PI / 2;
      }
    }
    for (let x = -16; x <= 13; x++)
      for (let z of [0, 1]) this.addRoad(x, z, false);
    for (let z = -15; z <= 14; z++)
      for (let x of [0, -1]) this.addRoad(x, z, false);
    for (let z = -10; z < 8; z++) this.addRoad(-6, z, false);
    for (let x = -10; x <= 10; x++) this.addRoad(x, -8, false);
    for (let x = -7; x < 10; x++) this.addRoad(x, 10, false);
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
      this.ripples.push(m);
    }
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
  }
  addRoad(x, z, custom = true) {
    const key = `${x},${z}`;
    if (this.roads.has(key)) return;
    this.roads.add(key);
    const m = this.mesh(
      new THREE.BoxGeometry(1.02, 0.025, 1.02),
      ["#c5ad78", "#c8af79", "#c9b07b"][Math.floor(rand() * 3)],
      x,
      0.002,
      z,
    );
    m.userData.road = true;
    if (custom) {
      this.created.road = (this.created.road || 0) + 1;
    }
  }
  async load() {
    try {
      const loader = new GLTFLoader();
      for (const key of [
        "tree",
        "rock",
        "fence",
        "house",
        "well",
        "farm",
        "lumberyard",
        "mine",
        "windmill",
        "watchtower",
        "townhall",
        "worker",
      ]) {
        const gltf = await loader.loadAsync(`/models/${key}.glb`);
        this.models[key] = gltf.scene;
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
      }
      if (this.dead) return;
      this.makeThumbnails();
      if (this.saved?.buildings) {
        this.resources = this.saved.resources;
        this.elapsed = this.saved.elapsed || 0;
        this.gathered = this.saved.gathered || 0;
        this.created = this.saved.created || {};
        for (const b of this.saved.buildings)
          this.addBuilding(b.type, b.x, b.z, b.rotation, b.progress);
        for (const key of this.saved.roads || []) {
          const [x, z] = key.split(",").map(Number);
          this.addRoad(x, z, false);
        }
      } else {
        initial.forEach(([t, x, z]) => this.addBuilding(t, x, z, 0, 1));
      }
      for (let i = 0; i < 210; i++) {
        const x = rand() * 65 - 32,
          z = rand() * 60 - 30;
        if (
          (x > riverX(z) - 1 && x < riverX(z) + 9) ||
          (x > 14 && x < 19 && z > 6 && z < 10)
        )
          continue;
        if (
          this.buildings.some(
            (b) =>
              Math.hypot(x - b.x, z - b.z) <
              (CATALOG[b.type]?.size || 4) / 2 + 2.2,
          ) ||
          this.roads.has(`${Math.round(x)},${Math.round(z)}`) ||
          Math.hypot(x, z) < 4
        )
          continue;
        const type = rand() > 0.16 ? "tree" : "rock";
        const m = this.model(type, x, z);
        const s = type === "tree" ? 0.65 + rand() * 0.7 : 0.35 + rand() * 0.65;
        m.scale.setScalar(s);
        m.rotation.y = rand() * 6;
        this.decor.push({ m, x, z, r: type === "tree" ? 0.5 * s : 0.6 * s });
      }
      for (let i = 0; i < 350; i++) {
        const x = rand() * 49 - 25,
          z = rand() * 47 - 24;
        if (x > riverX(z) - 0.5) continue;
        if (
          this.blocked(x, z, 0) ||
          this.roads.has(`${Math.round(x)},${Math.round(z)}`)
        )
          continue;
        const color = rand() > 0.88 ? "#f4d587" : "#728844";
        const m = this.mesh(
          new THREE.ConeGeometry(0.06 + rand() * 0.05, 0.2 + rand() * 0.18, 3),
          color,
          x,
          0.12,
          z,
        );
        m.rotation.z = (rand() - 0.5) * 0.5;
      }
      for (let z = -28; z < 28; z += 2.4) {
        const m = this.model("rock", riverX(z) - 0.3, z);
        m.scale.setScalar(0.3 + rand() * 0.6);
      }
      for (let i = 0; i < Math.min(24, this.saved?.population || 8); i++)
        this.addWorker();
      this.ready = true;
      this.onLoaded(this.thumbnails);
      this.emit();
    } catch (e) {
      console.error(e);
      this.notify("Could not load the village. Please refresh to try again.");
      this.onLoaded({}, String(e));
    }
  }
  model(type, x = 0, z = 0) {
    const m = this.models[type].clone(true);
    m.position.set(x, 0, z);
    this.scene.add(m);
    return m;
  }
  makeThumbnails() {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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
    c.position.set(5, 5, 7);
    c.lookAt(0, 1.25, 0);
    for (const key of Object.keys(CATALOG)) {
      const m =
        key === "road"
          ? new THREE.Mesh(
              new THREE.BoxGeometry(3, 0.12, 1.5),
              new THREE.MeshStandardMaterial({ color: "#bca46c" }),
            )
          : this.models[key].clone(true);
      s.add(m);
      r.render(s, c);
      this.thumbnails[key] = r.domElement.toDataURL();
      s.remove(m);
    }
    r.dispose();
  }
  addBuilding(type, x, z, rotation = 0, progress = 1) {
    const m = this.model(type, x, z);
    m.rotation.y = rotation;
    const b = {
      id: crypto.randomUUID(),
      type,
      x,
      z,
      rotation,
      progress,
      m,
      cycles: 0,
    };
    m.userData.building = b;
    this.buildings.push(b);
    if (progress < 1) {
      m.scale.y = 0.1;
      this.scaffold(b);
    }
    return b;
  }
  scaffold(b) {
    b.scaffolding = new THREE.Group();
    const n = (CATALOG[b.type]?.size || 3) / 2;
    const mat = new THREE.MeshStandardMaterial({ color: "#a77945" });
    for (let x of [-n, n])
      for (let z of [-n, n]) {
        const o = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), mat);
        o.position.set(x, 1.25, z);
        b.scaffolding.add(o);
      }
    for (let z of [-n, n])
      for (let y of [0.65, 1.8]) {
        const o = new THREE.Mesh(new THREE.BoxGeometry(n * 2, 0.08, 0.1), mat);
        o.position.set(0, y, z);
        b.scaffolding.add(o);
      }
    b.scaffolding.position.set(b.x, 0, b.z);
    this.scene.add(b.scaffolding);
  }
  blocked(x, z, padding = 0.2, ignore = null) {
    return this.buildings.some(
      (b) =>
        b !== ignore &&
        Math.abs(x - b.x) < (CATALOG[b.type]?.size || 4) / 2 + padding &&
        Math.abs(z - b.z) < (CATALOG[b.type]?.size || 4) / 2 + padding,
    );
  }
  valid(x, z, type) {
    const n = CATALOG[type].size / 2;
    const boundary =
      18 +
      this.buildings.filter((b) => b.type === "watchtower" && b.progress === 1)
        .length *
        3;
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
    if (type === "road" && this.roads.has(`${x},${z}`))
      return { ok: false, reason: "There is already a path here." };
    if (
      this.decor.some(
        (d) => Math.abs(x - d.x) < n + d.r && Math.abs(z - d.z) < n + d.r,
      )
    )
      return { ok: false, reason: "Trees or rocks are in the way." };
    if (
      Object.entries(CATALOG[type].cost).some(([r, v]) => this.resources[r] < v)
    )
      return {
        ok: false,
        reason: "Not enough resources. Let your workers gather more.",
      };
    return { ok: true, reason: "Click to place · R to rotate · Esc to cancel" };
  }
  select(type) {
    this.clearGhost();
    this.selected = type;
    this.grid.visible = !!type;
    this.controls.mouseButtons.LEFT = type ? null : THREE.MOUSE.PAN;
    if (type) {
      this.ghost =
        type === "road"
          ? new THREE.Mesh(
              new THREE.BoxGeometry(1, 0.1, 1),
              new THREE.MeshStandardMaterial({ color: "#a8d580" }),
            )
          : this.models[type].clone(true);
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
        new THREE.PlaneGeometry(CATALOG[type].size, CATALOG[type].size),
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
    }
  }
  clearGhost() {
    for (const m of [this.ghost, this.footprint])
      if (m) {
        this.scene.remove(m);
        m.traverse((o) => {
          if (o.isMesh) o.material.dispose();
        });
      }
    this.ghost = null;
    this.footprint = null;
  }
  rotate() {
    this.rotation += Math.PI / 2;
    if (this.ghost) this.ghost.rotation.y = this.rotation;
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
      const x = Math.round(this.point.x),
        z = Math.round(this.point.z);
      this.placement = { x, z, ...this.valid(x, z, this.selected) };
      this.ghost.visible = true;
      this.ghost.position.set(x, 0.06, z);
      this.ghost.rotation.y = this.rotation;
      this.footprint.visible = true;
      this.footprint.position.set(x, 0.045, z);
      this.footprint.material.color.set(
        this.placement.ok ? "#8fbf68" : "#d9644d",
      );
      this.ghost.traverse((o) => {
        if (o.isMesh)
          o.material.color.set(this.placement.ok ? "#99cc88" : "#d97568");
      });
      this.emit();
    }
  }
  click(e) {
    if (!this.ready) return;
    this.pointerMove(e);
    if (this.selected) {
      const p = this.placement;
      if (!p?.ok) {
        this.notify(p?.reason || "Move over the terrain to choose a site.");
        return;
      }
      const type = this.selected;
      for (const [r, v] of Object.entries(CATALOG[type].cost))
        this.resources[r] -= v;
      if (type === "road") {
        this.addRoad(p.x, p.z);
        this.notify("A new path for wandering feet.");
      } else {
        this.addBuilding(type, p.x, p.z, this.rotation, 0);
        this.created[type] = (this.created[type] || 0) + 1;
        this.notify(`${CATALOG[type].name} planned. A builder is on the way.`);
      }
      this.save();
      this.emit();
      return;
    }
    const hits = this.raycaster.intersectObjects(
      this.buildings.map((b) => b.m),
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
          description:
            CATALOG[b.type]?.description ||
            "The heart of Hearth & Hamlet. Workers deliver their goods here.",
          effect: CATALOG[b.type]?.effect || "Your village begins here",
          id: b.id,
        });
        this.highlight(b);
      }
    } else {
      this.onSelect(null);
      if (this.ring) {
        this.scene.remove(this.ring);
        this.ring = null;
      }
    }
  }
  highlight(b) {
    if (this.ring) this.scene.remove(this.ring);
    const n = (CATALOG[b.type]?.size || 4) / 2 + 0.3;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(n, n + 0.075, 48),
      new THREE.MeshBasicMaterial({ color: "#f4e7b3", side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(b.x, 0.05, b.z);
    this.scene.add(this.ring);
  }
  addWorker() {
    const m = this.model("worker", rand() * 2 - 1, rand() * 2);
    const w = {
      m,
      phase: "idle",
      path: [],
      timer: 0,
      building: null,
      carry: null,
    };
    this.workers.push(w);
  }
  route(w, x, z, ignore = null) {
    const sx = Math.round(w.m.position.x),
      sz = Math.round(w.m.position.z),
      tx = Math.round(x),
      tz = Math.round(z);
    const start = `${sx},${sz}`,
      goal = `${tx},${tz}`;
    const queue = [[sx, sz]],
      visited = new Map([[start, null]]);
    let found = false;
    for (let q = 0; q < queue.length && q < 4200; q++) {
      const [cx, cz] = queue[q];
      if (cx === tx && cz === tz) {
        found = true;
        break;
      }
      for (const [dx, dz] of [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ]) {
        const nx = cx + dx,
          nz = cz + dz,
          k = `${nx},${nz}`;
        if (
          visited.has(k) ||
          nx < -30 ||
          nz < -30 ||
          nz > 30 ||
          nx > riverX(nz) - 0.6 ||
          this.blocked(nx, nz, 0.1, ignore)
        )
          continue;
        visited.set(k, `${cx},${cz}`);
        queue.push([nx, nz]);
      }
    }
    w.path = [];
    if (found) {
      let k = goal;
      while (k !== start) {
        const [px, pz] = k.split(",").map(Number);
        w.path.unshift(new THREE.Vector3(px, 0, pz));
        k = visited.get(k);
      }
    }
    return found;
  }
  jobPoint(b) {
    const n = Math.ceil((CATALOG[b.type]?.size || 4) / 2 + 0.5);
    const pts = [
      [b.x, b.z + n],
      [b.x - n, b.z],
      [b.x + n, b.z],
      [b.x, b.z - n],
    ];
    return (
      pts.find(([x, z]) => !this.blocked(x, z, 0.1) && x < riverX(z) - 0.5) ||
      pts[0]
    );
  }
  assign(w) {
    const construction = this.buildings.find(
      (b) =>
        b.progress < 1 &&
        !this.workers.some((v) => v !== w && v.building === b),
    );
    const sites = this.buildings.filter(
      (b) => b.progress === 1 && CATALOG[b.type]?.resource,
    );
    const b =
      construction ||
      sites.sort(
        (a, b) =>
          this.workers.filter((v) => v.building === a).length -
          this.workers.filter((v) => v.building === b).length,
      )[0];
    if (!b) return;
    w.building = b;
    w.phase = "travel";
    const [x, z] = this.jobPoint(b);
    if (!this.route(w, x, z)) {
      w.phase = "idle";
      w.building = null;
      w.timer = 2;
    }
  }
  simulate(dt) {
    this.elapsed += dt;
    for (const w of this.workers) {
      if (w.path.length) {
        const target = w.path[0],
          delta = target.clone().sub(w.m.position);
        delta.y = 0;
        const fast = this.roads.has(
          `${Math.round(w.m.position.x)},${Math.round(w.m.position.z)}`,
        )
          ? 1.5
          : 1;
        const step = dt * 1.5 * fast;
        if (delta.length() <= step) {
          w.m.position.copy(target);
          w.path.shift();
        } else {
          w.m.position.addScaledVector(delta.normalize(), step);
          w.m.rotation.y = Math.atan2(delta.x, delta.z);
          w.m.position.y =
            Math.abs(Math.sin(this.elapsed * 11 + w.m.id)) * 0.04;
        }
        continue;
      }
      w.m.position.y = 0;
      if (w.phase === "idle") {
        w.timer -= dt;
        if (w.timer <= 0) this.assign(w);
      } else if (w.phase === "travel") {
        w.phase = w.building.progress < 1 ? "construct" : "work";
        w.timer = 5 + rand() * 3;
      } else if (w.phase === "construct") {
        const b = w.building;
        b.progress = Math.min(1, b.progress + dt / CATALOG[b.type].seconds);
        b.m.scale.y = 0.1 + b.progress * 0.9;
        if (b.progress >= 1) {
          this.scene.remove(b.scaffolding);
          b.scaffolding = null;
          this.notify(`${CATALOG[b.type].name} is ready!`);
          w.phase = "idle";
          w.building = null;
          if (b.type === "house")
            for (let i = 0; i < 2 && this.workers.length < 24; i++)
              this.addWorker();
          this.save();
        }
      } else if (w.phase === "work") {
        w.timer -= dt;
        if (w.timer <= 0) {
          const c = CATALOG[w.building.type];
          if (c.input && this.resources.food < c.input) {
            w.timer = 4;
            continue;
          }
          if (c.input) this.resources.food -= c.input;
          w.carry = { resource: c.resource, amount: c.amount };
          w.phase = "deliver";
          this.route(w, 0, 0);
        }
      } else if (w.phase === "deliver") {
        if (w.carry) {
          this.resources[w.carry.resource] += w.carry.amount;
          if (w.carry.resource === "wood") this.gathered += w.carry.amount;
          w.building.cycles++;
          w.carry = null;
        }
        w.phase = "idle";
        w.building = null;
      }
    }
    for (const b of this.buildings)
      if (b.type === "windmill" && b.progress === 1) {
        const sails = b.m.getObjectByName("Sails");
        if (sails) sails.rotation.z += dt * 0.45;
      }
  }
  emit() {
    this.onUpdate({
      resources: { ...this.resources },
      population: this.workers.length,
      capacity:
        4 +
        this.buildings.filter((b) => b.type === "house" && b.progress === 1)
          .length *
          4,
      day: Math.floor(this.elapsed / 120) + 1,
      time: this.elapsed % 120,
      speed: this.speed,
      buildings: this.buildings.map((b) => ({
        id: b.id,
        type: b.type,
        progress: b.progress,
        workers: this.workers.filter((w) => w.building === b).length,
        cycles: b.cycles,
      })),
      gathered: this.gathered,
      created: { ...this.created },
      placement: this.placement,
    });
  }
  save() {
    if (!this.ready) return;
    try {
      localStorage.setItem(
        "hearth-v1",
        JSON.stringify({
          resources: this.resources,
          population: this.workers.length,
          elapsed: this.elapsed,
          created: this.created,
          gathered: this.gathered,
          roads: [...this.roads],
          buildings: this.buildings.map(
            ({ type, x, z, rotation, progress }) => ({
              type,
              x,
              z,
              rotation,
              progress,
            }),
          ),
        }),
      );
      return true;
    } catch {
      this.notify(
        "Browser storage is unavailable. This village cannot be saved.",
      );
      return false;
    }
  }
  zoom(d) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom + d, 0.65, 2.4);
    this.camera.updateProjectionMatrix();
  }
  home() {
    this.camera.position.set(30, 37, 42);
    this.controls.target.set(0, 0, -1);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
  }
  animate = () => {
    if (this.dead) return;
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.ready && this.speed) this.simulate(dt * this.speed);
    this.controls.update();
    for (const m of this.ripples)
      m.position.x +=
        Math.sin(this.clock.elapsedTime * 0.8 + m.id) * dt * 0.015;
    this.renderer.render(this.scene, this.camera);
    this.lastUI += dt;
    if (this.lastUI > 0.4) {
      this.lastUI = 0;
      if (this.ready) this.emit();
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
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pagehide", this.beforeUnload);
    this.container.removeEventListener("pointermove", this.move);
    this.container.removeEventListener("pointerdown", this.down);
    this.container.removeEventListener("pointerup", this.up);
    this.container.removeEventListener("contextmenu", this.context);
    this.controls.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }
}
