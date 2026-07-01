import * as THREE from "./lib/three.module.js";

const canvas = document.getElementById("game");

const unitCountEl = document.getElementById("unitCount");
const waveCountEl = document.getElementById("waveCount");
const scoreCountEl = document.getElementById("scoreCount");
const comboCountEl = document.getElementById("comboCount");

const startOverlay = document.getElementById("startOverlay");
const endOverlay = document.getElementById("endOverlay");
const endTitle = document.getElementById("endTitle");
const endSummary = document.getElementById("endSummary");

const laneXs = [-6.5, 6.5];
const roadHalfWidth = 11;
const playerZ = 20;
const chosenLevel = Math.max(1, Math.min(100, Number(new URLSearchParams(window.location.search).get("level")) || 1));

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#1c2f47");
scene.fog = new THREE.Fog("#1a2433", 52, 180);

const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 300);
camera.position.set(0, 38, 30);
camera.lookAt(0, 0, 2);

const hemiLight = new THREE.HemisphereLight("#c8ecff", "#30405a", 2.2);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight("#fff0d7", 2.6);
sun.position.set(16, 28, 8);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
scene.add(sun);

const fill = new THREE.PointLight("#6bb8ff", 16, 130, 2);
fill.position.set(0, 10, 34);
scene.add(fill);

const sceneObjects = {
  laneMarkers: [],
  sidewalks: [],
  buildings: [],
  props: [],
  scrollers: [],
  bullets: [],
  enemies: [],
  pickups: [],
  upgradeTargets: [],
  countBubbles: [],
  muzzleFlashes: [],
  particles: [],
  gates: [],
  playerUnits: [],
};

const state = {
  running: false,
  ended: false,
  won: false,
  level: chosenLevel,
  score: 0,
  combo: 0,
  comboTimer: 0,
  units: 1,
  maxUnits: 1,
  fireRate: 3.2,
  weaponTier: 0,
  shotCount: 1,
  targetX: laneXs[0],
  playerX: laneXs[0],
  roadScroll: 0,
  walkTime: 0,
  clusterTimer: 0,
  fireTimer: 0,
  segment: "combat",
  combatTimer: 0,
  encounter: 1,
  encountersPerLevel: 2,
  clusterCount: 0,
  clustersPerEncounter: 4,
  gateResolved: false,
  gateTimer: 0,
  boss: null,
  bossAttackTimer: 0,
  bossMinionCursor: 0,
};

function getLevelProfile(level) {
  const danger = Math.min(1, (level - 1) / 99);
  return {
    danger,
    startingUnits: 1,
    startingFireRate: 2 + danger * 0.9,
    encountersPerLevel: 4 + Math.floor(danger * 2),
    combatDuration: Math.max(12, 14 - danger * 1.5),
    clusterInterval: Math.max(2.4, 4.3 - danger * 0.9),
    clustersPerEncounter: 3 + Math.floor(danger * 2),
    roadSpeed: 4 + danger * 3.2,
    enemySpeed: 2.3 + danger * 5,
    enemyHp: Math.max(1, Math.round(1 + level * 0.02 + danger * 4)),
    enemyDamage: Math.max(1, Math.round(1 + danger * 5)),
    bossHp: Math.round(14 + level * 2.5 + danger * 110),
    bossSpeed: 1.8 + danger * 3.4,
    bossAttackInterval: Math.max(0.7, 2.4 - danger * 1.05),
    upgradeTargetHp: Math.round(3 + level * 0.12 + danger * 5),
    bonusBubbleChance: 0.7,
    upgradeTargetChance: 1,
  };
}

let profile = getLevelProfile(state.level);
let levelScript = null;

const AUTHORED_WAVE_FAMILIES = {
  easy: [
    { enemyLane: 0, enemyCount: 10, rowSpacing: 1.35, baseZ: -12, upgradeLane: 1, upgradeKind: "rate", upgradeValue: 0.22, bubbleCap: 4, gapAfter: 3.8 },
    { enemyLane: 1, enemyCount: 11, rowSpacing: 1.3, baseZ: -12, upgradeLane: 0, upgradeKind: "shots", upgradeValue: 1, bubbleCap: 5, gapAfter: 4.2 },
    { enemyLane: 0, enemyCount: 12, rowSpacing: 1.25, baseZ: -13, upgradeLane: 1, upgradeKind: "rate", upgradeValue: 0.26, bubbleCap: 6, gapAfter: 4.4 },
    { enemyLane: 1, enemyCount: 13, rowSpacing: 1.22, baseZ: -13, upgradeLane: 0, upgradeKind: "shots", upgradeValue: 1, bubbleCap: 7, gapAfter: 4.6 },
  ],
  medium: [
    { enemyLane: 0, enemyCount: 12, rowSpacing: 1.18, baseZ: -13, upgradeLane: 1, upgradeKind: "rate", upgradeValue: 0.24, bubbleCap: 6, gapAfter: 3.6 },
    { enemyLane: 1, enemyCount: 13, rowSpacing: 1.14, baseZ: -13, upgradeLane: 0, upgradeKind: "shots", upgradeValue: 1, bubbleCap: 7, gapAfter: 3.8 },
    { enemyLane: 0, enemyCount: 14, rowSpacing: 1.1, baseZ: -14, upgradeLane: 1, upgradeKind: "both", upgradeValue: 1, bubbleCap: 8, gapAfter: 4.0 },
    { enemyLane: 1, enemyCount: 15, rowSpacing: 1.06, baseZ: -14, upgradeLane: 0, upgradeKind: "rate", upgradeValue: 0.28, bubbleCap: 8, gapAfter: 4.2 },
  ],
  hard: [
    { enemyLane: 0, enemyCount: 14, rowSpacing: 1.04, baseZ: -14, upgradeLane: 1, upgradeKind: "rate", upgradeValue: 0.24, bubbleCap: 8, gapAfter: 3.2 },
    { enemyLane: 1, enemyCount: 15, rowSpacing: 1.0, baseZ: -14, upgradeLane: 0, upgradeKind: "shots", upgradeValue: 1, bubbleCap: 9, gapAfter: 3.4 },
    { enemyLane: 0, enemyCount: 15, rowSpacing: 0.98, baseZ: -15, upgradeLane: 1, upgradeKind: "both", upgradeValue: 1, bubbleCap: 10, gapAfter: 3.6 },
    { enemyLane: 1, enemyCount: 16, rowSpacing: 0.95, baseZ: -15, upgradeLane: 0, upgradeKind: "rate", upgradeValue: 0.32, bubbleCap: 10, gapAfter: 3.8 },
  ],
};

const palette = {
  squad: new THREE.Color("#9fe7ff"),
  leader: new THREE.Color("#f7fbff"),
  gun: ["#c7d0d8", "#8fe9ff", "#ffd166", "#ffb36b", "#ff6a6a"],
  enemy: new THREE.Color("#ef4545"),
  enemyDark: new THREE.Color("#7c121b"),
  bonus: new THREE.Color("#6cf0c2"),
  boost: new THREE.Color("#67c6ff"),
  gold: new THREE.Color("#ffd166"),
};

function makeMaterial(color, emissive = "#000000", roughness = 0.5, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    roughness,
    metalness,
  });
}

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLevelScript(level, currentProfile) {
  const family =
    level <= 15 ? AUTHORED_WAVE_FAMILIES.easy :
    level <= 60 ? AUTHORED_WAVE_FAMILIES.medium :
    AUTHORED_WAVE_FAMILIES.hard;
  const encounters = [];

  for (let encounterIndex = 0; encounterIndex < currentProfile.encountersPerLevel; encounterIndex += 1) {
    const clusters = [];
    for (let clusterIndex = 0; clusterIndex < currentProfile.clustersPerEncounter; clusterIndex += 1) {
      const template = family[(encounterIndex * currentProfile.clustersPerEncounter + clusterIndex) % family.length];
      const scale = level <= 15 ? 0 : level <= 60 ? 1 : 2;
      clusters.push({
        clusterSize: template.enemyCount + scale,
        baseZ: template.baseZ - scale * 0.4,
        side: template.enemyLane === 0 ? "left" : "right",
        enemyLanes: [template.enemyLane],
        rowSpacing: Math.max(0.88, template.rowSpacing - scale * 0.04),
        delay: Math.max(1.9, template.gapAfter - currentProfile.danger * 0.5),
        includeUpgrade: true,
        upgradeLane: template.upgradeLane,
        upgradeOffset: 1.5,
        upgradeKind: template.upgradeKind,
        upgradeValue: template.upgradeValue,
        includeBubble: true,
        bubbleLane: template.upgradeLane,
        bubbleOffset: 3.4,
        bubbleCap: template.bubbleCap + scale,
      });
    }

    encounters.push({ clusters });
  }

  const bossMinionLanes = Array.from({ length: 24 }, (_, index) => index % laneXs.length);

  return { encounters, bossMinionLanes };
}

function clearGroupEntries(entries) {
  for (const item of entries) {
    scene.remove(item.mesh || item.group || item);
  }
  entries.length = 0;
}

function resetState(level = chosenLevel) {
  profile = getLevelProfile(level);
  levelScript = buildLevelScript(level, profile);
  state.level = level;
  state.score = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.units = profile.startingUnits;
  state.maxUnits = state.units;
  state.fireRate = profile.startingFireRate;
  state.weaponTier = 0;
  state.shotCount = 1;
  state.targetX = laneXs[0];
  state.playerX = laneXs[0];
  state.roadScroll = 0;
  state.walkTime = 0;
  state.clusterTimer = 0.05;
  state.fireTimer = 0.15;
  state.segment = "combat";
  state.combatTimer = 0;
  state.encounter = 1;
  state.encountersPerLevel = profile.encountersPerLevel;
  state.clusterCount = 0;
  state.clustersPerEncounter = profile.clustersPerEncounter;
  state.gateResolved = false;
  state.gateTimer = 0;
  state.boss = null;
  state.bossAttackTimer = 0;
  state.bossMinionCursor = 0;
  state.ended = false;
  state.won = false;

  clearGroupEntries(sceneObjects.bullets);
  clearGroupEntries(sceneObjects.enemies);
  clearGroupEntries(sceneObjects.pickups);
  clearGroupEntries(sceneObjects.upgradeTargets);
  clearGroupEntries(sceneObjects.countBubbles);
  clearGroupEntries(sceneObjects.muzzleFlashes);
  clearGroupEntries(sceneObjects.particles);
  clearGroupEntries(sceneObjects.gates);

  rebuildPlayerFormation();
  syncHud();
  endOverlay.classList.add("hidden");
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = canvas;
  if (!clientWidth || !clientHeight) {
    return;
  }
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

function createStreet() {
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 220),
    new THREE.MeshStandardMaterial({ color: "#1b2028", roughness: 0.93, metalness: 0.02 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.z = -34;
  road.receiveShadow = true;
  scene.add(road);

  const laneGeometry = new THREE.BoxGeometry(0.8, 0.03, 8);
  const laneMaterial = new THREE.MeshStandardMaterial({ color: "#f9dfa0", emissive: "#6f5c20" });
  for (let i = 0; i < 14; i += 1) {
    const marker = new THREE.Mesh(laneGeometry, laneMaterial);
    marker.position.set(0, 0.06, 28 - i * 16);
    marker.receiveShadow = true;
    scene.add(marker);
    sceneObjects.laneMarkers.push(marker);
    sceneObjects.scrollers.push({
      mesh: marker,
      speed: 24,
      resetSpan: 224,
      resetThreshold: 36,
    });
  }

  const sideMaterial = new THREE.MeshStandardMaterial({ color: "#526171", roughness: 0.95 });
  const sidewalkGeometry = new THREE.BoxGeometry(8, 0.7, 24);
  for (const x of [-19, 19]) {
    for (let i = 0; i < 10; i += 1) {
      const sidewalk = new THREE.Mesh(sidewalkGeometry, sideMaterial);
      sidewalk.position.set(x, 0.35, 28 - i * 24);
      sidewalk.receiveShadow = true;
      scene.add(sidewalk);
      sceneObjects.sidewalks.push(sidewalk);
      sceneObjects.scrollers.push({
        mesh: sidewalk,
        speed: 24,
        resetSpan: 240,
        resetThreshold: 40,
      });
    }
  }

  for (let i = 0; i < 16; i += 1) {
    const height = 10 + (i % 4) * 4;
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(10 + (i % 3), height, 12 + (i % 2) * 4),
      new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? "#314055" : "#3f5066",
        emissive: i % 2 === 0 ? "#0a1424" : "#13263d",
        roughness: 0.88,
      })
    );
    const side = i % 2 === 0 ? -1 : 1;
    building.position.set(side * (27 + (i % 3) * 2), height / 2, 24 - i * 14);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
    sceneObjects.buildings.push(building);
    sceneObjects.scrollers.push({
      mesh: building,
      speed: 22,
      resetSpan: 224,
      resetThreshold: 46,
    });
  }

  const lampPole = new THREE.CylinderGeometry(0.18, 0.18, 8);
  const lampHead = new THREE.BoxGeometry(1.2, 0.35, 0.5);
  for (let i = 0; i < 8; i += 1) {
    const pole = new THREE.Mesh(lampPole, makeMaterial("#94a5b7"));
    pole.position.set(i % 2 === 0 ? -14.5 : 14.5, 4, 18 - i * 22);
    pole.castShadow = true;
    scene.add(pole);

    const head = new THREE.Mesh(lampHead, makeMaterial("#e6d59e", "#7d6a2c"));
    head.position.set(0, 3.9, 0.2);
    pole.add(head);

    const glow = new THREE.PointLight("#ffd889", 4, 22, 2);
    glow.position.set(0, 3.5, 0);
    pole.add(glow);
    scene.add(pole);
    sceneObjects.props.push(pole);
    sceneObjects.scrollers.push({
      mesh: pole,
      speed: 24,
      resetSpan: 176,
      resetThreshold: 42,
    });
  }
}

function createHumanoidBody(primaryColor, accentColor, scale = 1) {
  const group = new THREE.Group();

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(1.25 * scale, 1.8 * scale, 0.9 * scale),
    makeMaterial(primaryColor)
  );
  torso.castShadow = true;
  torso.position.y = 2.2 * scale;
  group.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.45 * scale, 18, 18),
    makeMaterial("#f0c6a8")
  );
  head.castShadow = true;
  head.position.y = 3.55 * scale;
  group.add(head);

  const backpack = new THREE.Mesh(
    new THREE.BoxGeometry(0.8 * scale, 1.1 * scale, 0.45 * scale),
    makeMaterial(accentColor)
  );
  backpack.position.set(0, 2.2 * scale, -0.65 * scale);
  backpack.castShadow = true;
  group.add(backpack);

  return { group, torso };
}

function applyWeaponMesh(targetGroup, tier, scale = 1) {
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry((1.2 + tier * 0.38) * scale, 0.18 * scale, 0.18 * scale),
    makeMaterial(palette.gun[Math.min(tier, palette.gun.length - 1)])
  );
  gun.castShadow = true;
  gun.position.set(0.82 * scale, 2.45 * scale, 0.08 * scale);
  gun.rotation.z = -0.22;
  targetGroup.add(gun);

  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 0.34 * scale, 8),
    makeMaterial("#dbe6ef")
  );
  muzzle.rotation.z = Math.PI / 2;
  muzzle.position.set((1.45 + tier * 0.38) * scale, 2.45 * scale, 0.08 * scale);
  targetGroup.add(muzzle);
}

function createPlayerUnit(index) {
  const leader = index === 0;
  const color = leader ? "#d6f4ff" : "#7bcfff";
  const accent = leader ? "#2e4157" : "#244056";
  const { group } = createHumanoidBody(color, accent, leader ? 1 : 0.92);
  applyWeaponMesh(group, state.weaponTier, leader ? 1 : 0.92);

  if (leader) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.12, 12, 28),
      new THREE.MeshBasicMaterial({ color: "#9fe7ff", transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);
  }

  return group;
}

function rebuildPlayerFormation() {
  for (const unit of sceneObjects.playerUnits) {
    scene.remove(unit);
  }
  sceneObjects.playerUnits.length = 0;

  const count = Math.min(8, state.units);
  for (let i = 0; i < count; i += 1) {
    const unit = createPlayerUnit(i);
    const row = Math.floor(i / 3);
    const col = i % 3;
    unit.position.set((col - 1) * 1.6 + (row % 2) * 0.75, 0, playerZ + row * 1.7);
    scene.add(unit);
    sceneObjects.playerUnits.push(unit);
  }
}

function createEnemy(kind = "trooper", hp = profile.enemyHp) {
  const scale = kind === "boss" ? 2.8 : 1.05;
  const { group } = createHumanoidBody("#df4040", "#61101b", scale);
  applyWeaponMesh(group, kind === "boss" ? 4 : 1, scale);

  if (kind === "boss") {
    const armor = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 1.2, 1.7),
      makeMaterial("#891920", "#290608", 0.42, 0.1)
    );
    armor.position.set(0, 2.75, 0);
    armor.castShadow = true;
    group.add(armor);
  }

  return {
    mesh: group,
    lane: 1,
    z: -120,
    speed: kind === "boss" ? profile.bossSpeed : profile.enemySpeed,
    hp,
    maxHp: hp,
    kind,
    damage: kind === "boss" ? 0 : profile.enemyDamage,
    runOffset: 0,
  };
}

function createPickup(kind) {
  const colorMap = {
    bonus: "#6cf0c2",
    boost: "#67c6ff",
    gold: "#ffd166",
  };
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 2.1, 2.1),
    makeMaterial(colorMap[kind], colorMap[kind] === "#ffd166" ? "#5d4f16" : "#153444", 0.3, 0.1)
  );
  mesh.castShadow = true;
  return {
    mesh,
    lane: Math.floor(Math.random() * laneXs.length),
    z: -120,
    kind,
    speed: profile.enemySpeed * 0.82,
    value: kind === "bonus" ? Math.max(1, Math.round(2 + (1 - profile.danger) * 3)) : 1,
    spin: Math.random() * Math.PI * 2,
  };
}

function addObjectToLane(object) {
  object.lane = Math.floor(Math.random() * laneXs.length);
  object.mesh.position.set(laneXs[object.lane], 0, object.z);
  scene.add(object.mesh);
}

function createTextBillboard(lines, tint, width = 4.8, height = 2.2) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 512;
  canvasEl.height = 256;
  const ctx = canvasEl.getContext("2d");

  ctx.fillStyle = "rgba(7, 16, 28, 0.88)";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.strokeStyle = tint;
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, canvasEl.width - 24, canvasEl.height - 24);
  ctx.textAlign = "center";

  for (const line of lines) {
    ctx.fillStyle = line.color;
    ctx.font = line.font;
    ctx.fillText(line.text, canvasEl.width / 2, line.y);
  }

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  sign.userData.texture = texture;
  sign.userData.ctx = ctx;
  sign.userData.canvas = canvasEl;
  return sign;
}

function updateBillboardText(sign, lines, tint) {
  const { ctx, canvas, texture } = sign.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(7, 16, 28, 0.88)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = tint;
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  ctx.textAlign = "center";

  for (const line of lines) {
    ctx.fillStyle = line.color;
    ctx.font = line.font;
    ctx.fillText(line.text, canvas.width / 2, line.y);
  }

  texture.needsUpdate = true;
}

function createBonusBubble() {
  const bubble = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 20, 20),
    new THREE.MeshStandardMaterial({
      color: "#91ffe0",
      emissive: "#1d6b5b",
      transparent: true,
      opacity: 0.86,
      roughness: 0.18,
      metalness: 0.06,
    })
  );
  sphere.castShadow = true;
  bubble.add(sphere);

  const label = createTextBillboard([
    { text: "+1", font: "700 112px 'Space Grotesk', sans-serif", color: "#ffffff", y: 148 },
  ], "#6cf0c2", 2.4, 1.3);
  label.position.set(0, 0, 1.38);
  bubble.add(label);

  return {
    mesh: bubble,
    sphere,
    kind: "bonus",
    lane: 1,
    z: -34,
    speed: profile.enemySpeed * 0.94,
    spin: Math.random() * Math.PI * 2,
    value: 1,
  };
}

function createCountBubble(cap = 5) {
  const bubble = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 22, 22),
    new THREE.MeshStandardMaterial({
      color: "#b6f7ff",
      emissive: "#1d4d69",
      transparent: true,
      opacity: 0.84,
      roughness: 0.14,
      metalness: 0.05,
    })
  );
  sphere.castShadow = true;
  bubble.add(sphere);

  const label = createTextBillboard([
    { text: "+0", font: "700 96px 'Space Grotesk', sans-serif", color: "#ffffff", y: 122 },
    { text: `CAP ${cap}`, font: "700 42px 'Space Grotesk', sans-serif", color: "#6cf0c2", y: 204 },
  ], "#9aefff", 2.8, 1.6);
  label.position.set(0, 0, 1.55);
  bubble.add(label);

  return {
    mesh: bubble,
    sphere,
    label,
    kind: "counter",
    lane: 1,
    z: -30,
    speed: profile.enemySpeed * 0.76,
    spin: 0,
    value: 0,
    cap,
  };
}

function createUpgradeTarget(kind = "rate", upgradeValue = 0.25) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.4, 1.8, 8),
    makeMaterial("#67c6ff", "#123049", 0.38, 0.08)
  );
  base.castShadow = true;
  base.position.y = 1.2;
  group.add(base);

  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 2.8),
    makeMaterial("#d6e7f5", "#1a3650", 0.28, 0.12)
  );
  barrel.castShadow = true;
  barrel.position.set(0, 2.25, 0);
  group.add(barrel);

  const hp = profile.upgradeTargetHp;
  const title =
    kind === "shots" ? "MORE SHOTS" :
    kind === "both" ? "FIRE UP" :
    "FIRE RATE";
  const label = createTextBillboard([
    { text: title, font: "700 50px 'Space Grotesk', sans-serif", color: "#eef7ff", y: 84 },
    { text: `${hp} HITS`, font: "700 84px 'Space Grotesk', sans-serif", color: "#67c6ff", y: 182 },
  ], "#67c6ff");
  label.position.set(0, 5.8, 0.2);
  group.add(label);

  return {
    mesh: group,
    label,
    lane: 1,
    z: -42,
    speed: profile.enemySpeed * 0.82,
    hp,
    maxHp: hp,
    bob: Math.random() * Math.PI * 2,
    upgradeKind: kind,
    upgradeValue,
    title,
  };
}

function spawnEnemyCluster() {
  const encounterScript = levelScript?.encounters[state.encounter - 1];
  const clusterScript = encounterScript?.clusters[state.clusterCount];
  if (!clusterScript) {
    state.clusterCount = state.clustersPerEncounter;
    return;
  }

  const laneOrder = clusterScript.enemyLanes;

  for (let i = 0; i < clusterScript.clusterSize; i += 1) {
    const enemy = createEnemy("trooper", profile.enemyHp);
    enemy.lane = laneOrder[i % laneOrder.length];
    enemy.z = clusterScript.baseZ - Math.floor(i / laneOrder.length) * clusterScript.rowSpacing;
    enemy.speed = profile.enemySpeed;
    enemy.runOffset = i * 0.35;
    enemy.mesh.position.set(laneXs[enemy.lane], 0, enemy.z);
    scene.add(enemy.mesh);
    sceneObjects.enemies.push(enemy);
  }

  if (clusterScript.includeUpgrade) {
    const target = createUpgradeTarget(clusterScript.upgradeKind, clusterScript.upgradeValue);
    target.lane = clusterScript.upgradeLane;
    target.z = clusterScript.baseZ - clusterScript.upgradeOffset;
    target.mesh.position.set(laneXs[target.lane], 0, target.z);
    scene.add(target.mesh);
    sceneObjects.upgradeTargets.push(target);
  }

  if (clusterScript.includeBubble) {
    const bubble = createCountBubble(clusterScript.bubbleCap);
    bubble.lane = clusterScript.bubbleLane;
    bubble.z = clusterScript.baseZ + clusterScript.bubbleOffset;
    bubble.mesh.position.set(laneXs[bubble.lane], 2.3, bubble.z);
    scene.add(bubble.mesh);
    sceneObjects.countBubbles.push(bubble);
  }

  state.clusterCount += 1;
}

function createGateLabel(option, color) {
  const prefix = option.type === "units" ? "+" : "T";
  const sign = createTextBillboard([
    { text: option.type === "units" ? "MORE GUNNERS" : "WEAPON UP", font: "700 54px 'Space Grotesk', sans-serif", color: "#eef7ff", y: 92 },
    { text: `${prefix}${option.value}`, font: "700 96px 'Space Grotesk', sans-serif", color, y: 188 },
  ], color, 4.8, 2.4);
  sign.position.set(0, 3.15, -0.29);
  return sign;
}

function spawnGate() {
  clearGroupEntries(sceneObjects.gates);
  const leftType = (state.level + state.encounter) % 2 === 0 ? "units" : "weapon";
  const rightType = leftType === "units" ? "weapon" : "units";
  const options = [
    { type: leftType, value: leftType === "units" ? profile.addUnitsGate : profile.weaponGate, x: -10 },
    { type: rightType, value: rightType === "units" ? profile.addUnitsGate : profile.weaponGate, x: 10 },
  ];

  for (const option of options) {
    const frame = new THREE.Group();
    const color = option.type === "units" ? "#6cf0c2" : "#67c6ff";
    const postMaterial = makeMaterial(color, color === "#6cf0c2" ? "#12342c" : "#12283a", 0.28, 0.06);

    const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), postMaterial);
    leftPost.position.set(-2.8, 3, 0);
    const rightPost = leftPost.clone();
    rightPost.position.x = 2.8;
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.5, 0.5), postMaterial);
    topBar.position.set(0, 5.7, 0);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 3.4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.26 })
    );
    panel.position.set(0, 3.1, -0.26);
    const label = createGateLabel(option, color);

    frame.add(leftPost, rightPost, topBar, panel, label);
    frame.position.set(option.x, 0, -46);
    frame.userData = option;
    scene.add(frame);
    sceneObjects.gates.push(frame);
  }

  state.segment = "gate";
  state.gateResolved = false;
}

function spawnBoss() {
  const boss = createEnemy("boss", profile.bossHp);
  boss.lane = 1;
  boss.z = -58;
  boss.mesh.position.set(0, 0, boss.z);
  boss.speed = profile.bossSpeed;
  scene.add(boss.mesh);
  state.boss = boss;
  state.bossAttackTimer = 1;
  state.segment = "boss";
}

function addMuzzleFlash(x, y, z, color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 10, 10),
    new THREE.MeshBasicMaterial({ color })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  sceneObjects.muzzleFlashes.push({ mesh, life: 0.08 });
}

function fireVolley() {
  const squadShots = Math.max(1, Math.min(12, 1 + Math.floor(state.units / 2)));
  const shots = squadShots * state.shotCount;
  for (let i = 0; i < shots; i += 1) {
    const spread = (i - (shots - 1) / 2) * 0.34;
    const bullet = new THREE.Mesh(
      new THREE.SphereGeometry(0.11 + state.weaponTier * 0.02, 10, 10),
      new THREE.MeshBasicMaterial({ color: palette.gun[Math.min(state.weaponTier + 1, palette.gun.length - 1)] })
    );
    bullet.position.set(state.playerX + spread, 2.55 + Math.random() * 0.4, playerZ - 0.8);
    scene.add(bullet);
    sceneObjects.bullets.push({
      mesh: bullet,
      velocity: 42 + state.weaponTier * 7,
      damage: 1 + Math.floor(state.weaponTier / 2),
    });
  }
  addMuzzleFlash(state.playerX, 2.5, playerZ - 0.9, palette.gun[Math.min(state.weaponTier + 1, palette.gun.length - 1)]);
}

function awardCombo() {
  state.combo += 1;
  state.comboTimer = 1.35;
  if (state.combo > 1) {
    state.score += state.combo;
  }
}

function applyPickup(pickup) {
  if (pickup.kind === "bonus") {
    state.units += pickup.value;
    state.maxUnits = Math.max(state.maxUnits, state.units);
  } else if (pickup.kind === "counter") {
    state.units += pickup.value;
    state.maxUnits = Math.max(state.maxUnits, state.units);
  } else {
    state.score += 40 + state.level * 8;
  }
  rebuildPlayerFormation();
}

function applyGateChoice(option) {
  if (option.type === "units") {
    state.units += option.value;
    state.maxUnits = Math.max(state.maxUnits, state.units);
  } else {
    state.weaponTier = Math.min(4, state.weaponTier + option.value);
    state.fireRate = Math.min(8.8, state.fireRate + 0.35 * option.value);
  }
  rebuildPlayerFormation();
  state.score += 30 + state.level * 8;
}

function failRun() {
  state.running = false;
  state.ended = true;
  endTitle.textContent = `Level ${state.level} failed.`;
  endSummary.textContent = `Score ${state.score}, encounter ${Math.min(state.encounter, state.encountersPerLevel)}/${state.encountersPerLevel}, peak squad ${state.maxUnits}.`;
  endOverlay.classList.remove("hidden");
}

function winRun() {
  state.running = false;
  state.ended = true;
  state.won = true;
  endTitle.textContent = `Level ${state.level} cleared.`;
  endSummary.textContent = `Boss defeated with ${state.units} shooters left. Score ${state.score}.`;
  endOverlay.classList.remove("hidden");
}

function syncHud() {
  unitCountEl.textContent = state.units;
  waveCountEl.textContent = state.level;
  scoreCountEl.textContent = state.score;
  comboCountEl.textContent = `${state.combo}x`;
}

function updateRoad(dt) {
  state.roadScroll += dt * profile.roadSpeed;
  for (const scroller of sceneObjects.scrollers) {
    scroller.mesh.position.z += dt * (profile.roadSpeed + scroller.speed * 0.18);
    if (scroller.mesh.position.z > scroller.resetThreshold) {
      scroller.mesh.position.z -= scroller.resetSpan;
    }
  }
}

function animatePlayer(dt) {
  state.walkTime += dt * (3.5 + profile.danger * 1.6);
  state.playerX += (state.targetX - state.playerX) * Math.min(1, dt * 14);

  for (let i = 0; i < sceneObjects.playerUnits.length; i += 1) {
    const unit = sceneObjects.playerUnits[i];
    const row = Math.floor(i / 3);
    const col = i % 3;
    const offsetX = (col - 1) * 1.6 + (row % 2) * 0.75;
    const offsetZ = row * 1.7;
    unit.position.x += ((state.playerX + offsetX) - unit.position.x) * Math.min(1, dt * 10);
    unit.position.z = playerZ + offsetZ;
    unit.position.y = Math.abs(Math.sin(state.walkTime + i * 0.8)) * 0.18;
    unit.rotation.y = (state.playerX / roadHalfWidth) * 0.22;
  }
}

function updateCombat(dt) {
  state.combatTimer += dt;
  state.clusterTimer -= dt;
  state.fireTimer -= dt;
  state.comboTimer -= dt;

  if (state.comboTimer <= 0) {
    state.combo = 0;
  }

  if (state.clusterTimer <= 0 && state.clusterCount < state.clustersPerEncounter) {
    spawnEnemyCluster();
    const encounterScript = levelScript?.encounters[state.encounter - 1];
    const nextCluster = encounterScript?.clusters[state.clusterCount];
    state.clusterTimer = nextCluster?.delay ?? profile.clusterInterval;
  }

  if (state.fireTimer <= 0) {
    fireVolley();
    state.fireTimer = 1 / state.fireRate;
  }

  const clearedEncounter =
    state.clusterCount >= state.clustersPerEncounter &&
    sceneObjects.enemies.length === 0 &&
    sceneObjects.upgradeTargets.length === 0 &&
    sceneObjects.pickups.length === 0 &&
    sceneObjects.countBubbles.length === 0;

  if (state.combatTimer >= profile.combatDuration || clearedEncounter) {
    clearGroupEntries(sceneObjects.pickups);
    sceneObjects.pickups.length = 0;
    clearGroupEntries(sceneObjects.countBubbles);
    sceneObjects.countBubbles.length = 0;
    clearGroupEntries(sceneObjects.upgradeTargets);
    sceneObjects.upgradeTargets.length = 0;
    clearGroupEntries(sceneObjects.enemies);
    sceneObjects.enemies.length = 0;
    state.combatTimer = 0;
    state.clusterCount = 0;
    state.clusterTimer = 0.8;
    state.encounter += 1;
    if (state.encounter > state.encountersPerLevel) {
      spawnBoss();
    }
  }
}

function updateGates(dt) {
  state.fireTimer -= dt;
  if (state.fireTimer <= 0) {
    fireVolley();
    state.fireTimer = 1 / state.fireRate;
  }

  let chosen = null;
  for (const gate of sceneObjects.gates) {
    gate.position.z += dt * (20 + profile.danger * 10);
    if (!state.gateResolved && gate.position.z > playerZ - 1 && gate.position.z < playerZ + 2) {
      const targetSide = state.playerX < 0 ? -1 : 1;
      if (Math.sign(gate.position.x) === targetSide) {
        chosen = gate.userData;
        state.gateResolved = true;
      }
    }
  }

  if (chosen) {
    applyGateChoice(chosen);
  }

  if (sceneObjects.gates.length && sceneObjects.gates[0].position.z > 42) {
    clearGroupEntries(sceneObjects.gates);
    sceneObjects.gates.length = 0;
    state.encounter += 1;
    if (state.encounter > state.encountersPerLevel) {
      spawnBoss();
    } else {
      state.segment = "combat";
      state.clusterTimer = 0.25;
    }
  }
}

function updateBoss(dt) {
  if (!state.boss) {
    return;
  }

  state.fireTimer -= dt;
  state.comboTimer -= dt;
  if (state.comboTimer <= 0) {
    state.combo = 0;
  }

  if (state.fireTimer <= 0) {
    fireVolley();
    state.fireTimer = 1 / state.fireRate;
  }

  const boss = state.boss;
  const desiredX = state.targetX * 0.6;
  boss.mesh.position.x += (desiredX - boss.mesh.position.x) * Math.min(1, dt * 1.8);
  boss.z += boss.speed * dt;
  boss.mesh.position.z = boss.z;
  boss.mesh.position.y = Math.sin(state.walkTime * 0.8) * 0.25;

  state.bossAttackTimer -= dt;
  if (state.bossAttackTimer <= 0) {
    const minion = createEnemy("trooper", Math.max(3, Math.round(profile.enemyHp * 0.8)));
    minion.lane = levelScript?.bossMinionLanes[state.bossMinionCursor % levelScript.bossMinionLanes.length] ?? 1;
    state.bossMinionCursor += 1;
    minion.z = boss.z + 4;
    minion.mesh.position.set(laneXs[minion.lane], 0, minion.z);
    minion.speed = profile.enemySpeed * 1.18;
    minion.damage = profile.enemyDamage + 1;
    scene.add(minion.mesh);
    sceneObjects.enemies.push(minion);
    state.bossAttackTimer = profile.bossAttackInterval;
  }

  if (boss.z >= playerZ - 5) {
    state.units = Math.max(0, state.units - 3);
    syncHud();
    failRun();
  }
}

function updateMovingObjects(dt) {
  for (let i = sceneObjects.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = sceneObjects.bullets[i];
    bullet.mesh.position.z -= bullet.velocity * dt;
    if (bullet.mesh.position.z < -170) {
      scene.remove(bullet.mesh);
      sceneObjects.bullets.splice(i, 1);
    }
  }

  for (let i = sceneObjects.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = sceneObjects.pickups[i];
    pickup.z += pickup.speed * dt;
    pickup.spin += dt * 2.6;
    pickup.mesh.position.set(laneXs[pickup.lane], 2 + Math.sin(pickup.spin) * 0.3, pickup.z);
    pickup.sphere.rotation.y += dt * 0.8;
    pickup.sphere.rotation.x = Math.sin(pickup.spin * 0.7) * 0.18;

    if (Math.abs(pickup.z - playerZ) < 1.8 && Math.abs(laneXs[pickup.lane] - state.playerX) < 3.1) {
      applyPickup(pickup);
      scene.remove(pickup.mesh);
      sceneObjects.pickups.splice(i, 1);
      syncHud();
      continue;
    }

    if (pickup.z > 44) {
      scene.remove(pickup.mesh);
      sceneObjects.pickups.splice(i, 1);
    }
  }

  for (let i = sceneObjects.countBubbles.length - 1; i >= 0; i -= 1) {
    const bubble = sceneObjects.countBubbles[i];
    bubble.z += bubble.speed * dt;
    bubble.spin += dt * 2.2;
    bubble.mesh.position.set(laneXs[bubble.lane], 2.2 + Math.sin(bubble.spin) * 0.28, bubble.z);
    bubble.sphere.rotation.y += dt * 0.7;
    bubble.sphere.rotation.x = Math.sin(bubble.spin * 0.7) * 0.16;
    bubble.label.lookAt(camera.position);
    updateBillboardText(bubble.label, [
      { text: `+${bubble.value}`, font: "700 96px 'Space Grotesk', sans-serif", color: "#ffffff", y: 122 },
      { text: `CAP ${bubble.cap}`, font: "700 42px 'Space Grotesk', sans-serif", color: "#6cf0c2", y: 204 },
    ], "#9aefff");

    if (Math.abs(bubble.z - playerZ) < 1.9 && Math.abs(laneXs[bubble.lane] - state.playerX) < 2.8) {
      applyPickup(bubble);
      scene.remove(bubble.mesh);
      sceneObjects.countBubbles.splice(i, 1);
      syncHud();
      continue;
    }

    if (bubble.z > 44) {
      scene.remove(bubble.mesh);
      sceneObjects.countBubbles.splice(i, 1);
    }
  }

  for (let i = sceneObjects.upgradeTargets.length - 1; i >= 0; i -= 1) {
    const target = sceneObjects.upgradeTargets[i];
    target.z += target.speed * dt;
    target.bob += dt * 2.1;
    target.mesh.position.set(laneXs[target.lane], Math.sin(target.bob) * 0.16, target.z);
    target.label.lookAt(camera.position);

    updateBillboardText(target.label, [
      { text: target.title, font: "700 50px 'Space Grotesk', sans-serif", color: "#eef7ff", y: 84 },
      { text: `${target.hp} HITS`, font: "700 84px 'Space Grotesk', sans-serif", color: "#67c6ff", y: 182 },
    ], "#67c6ff");

    if (target.z > 42) {
      scene.remove(target.mesh);
      sceneObjects.upgradeTargets.splice(i, 1);
    }
  }

  for (let i = sceneObjects.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = sceneObjects.enemies[i];
    enemy.z += enemy.speed * dt;
    enemy.mesh.position.set(laneXs[enemy.lane], 0, enemy.z);
    enemy.mesh.position.y = Math.abs(Math.sin(state.walkTime * 1.8 + enemy.runOffset)) * 0.18;
    enemy.mesh.rotation.y = Math.sin(state.walkTime * 2 + enemy.runOffset) * 0.08;

    if (enemy.z > playerZ - 1.5) {
      state.units -= enemy.damage;
      state.combo = 0;
      scene.remove(enemy.mesh);
      sceneObjects.enemies.splice(i, 1);
      rebuildPlayerFormation();
      syncHud();
      if (state.units <= 0) {
        failRun();
      }
    }
  }

  for (let i = sceneObjects.muzzleFlashes.length - 1; i >= 0; i -= 1) {
    const flash = sceneObjects.muzzleFlashes[i];
    flash.life -= dt;
    flash.mesh.scale.setScalar(Math.max(0.2, flash.life * 8));
    if (flash.life <= 0) {
      scene.remove(flash.mesh);
      sceneObjects.muzzleFlashes.splice(i, 1);
    }
  }
}

function processHits() {
  for (let i = sceneObjects.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = sceneObjects.bullets[i];
    let hit = false;

    if (state.boss && bullet.mesh.position.distanceTo(state.boss.mesh.position.clone().setY(2.6)) < 3.6) {
      state.boss.hp -= bullet.damage;
      hit = true;
      if (state.boss.hp <= 0) {
        state.score += 220 + state.level * 20;
        scene.remove(state.boss.mesh);
        state.boss = null;
        winRun();
      }
    }

    if (!hit) {
      for (let j = sceneObjects.countBubbles.length - 1; j >= 0; j -= 1) {
        const bubble = sceneObjects.countBubbles[j];
        if (bullet.mesh.position.distanceTo(bubble.mesh.position.clone().setY(2.2)) < 2.05) {
          bubble.value = Math.min(bubble.cap, bubble.value + 1);
          hit = true;
          break;
        }
      }
    }

    if (!hit) {
      for (let j = sceneObjects.upgradeTargets.length - 1; j >= 0; j -= 1) {
        const target = sceneObjects.upgradeTargets[j];
        if (bullet.mesh.position.distanceTo(target.mesh.position.clone().setY(2.4)) < 2.35) {
          target.hp -= bullet.damage;
          hit = true;
          if (target.hp <= 0) {
            if (target.upgradeKind === "shots") {
              state.shotCount = Math.min(5, state.shotCount + target.upgradeValue);
            } else if (target.upgradeKind === "both") {
              state.shotCount = Math.min(5, state.shotCount + target.upgradeValue);
              state.fireRate = Math.min(8.2, state.fireRate + 0.24);
              state.weaponTier = Math.min(4, state.weaponTier + 1);
            } else {
              state.fireRate = Math.min(8.2, state.fireRate + target.upgradeValue);
              state.weaponTier = Math.min(4, state.weaponTier + 1);
            }
            state.score += 65 + state.level * 10;
            rebuildPlayerFormation();
            scene.remove(target.mesh);
            sceneObjects.upgradeTargets.splice(j, 1);
          }
          break;
        }
      }
    }

    if (!hit) {
      for (let j = sceneObjects.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = sceneObjects.enemies[j];
        if (bullet.mesh.position.distanceTo(enemy.mesh.position.clone().setY(2.2)) < 1.5) {
          enemy.hp -= bullet.damage;
          hit = true;
          if (enemy.hp <= 0) {
            awardCombo();
            state.score += 12 + state.combo * 2;
            scene.remove(enemy.mesh);
            sceneObjects.enemies.splice(j, 1);
          }
          break;
        }
      }
    }

    if (hit) {
      scene.remove(bullet.mesh);
      sceneObjects.bullets.splice(i, 1);
    }
  }
}

function update(dt) {
  if (!state.running || state.ended) {
    return;
  }

  updateRoad(dt);
  animatePlayer(dt);

  if (state.segment === "combat") {
    updateCombat(dt);
  } else if (state.segment === "gate") {
    updateGates(dt);
  } else {
    updateBoss(dt);
  }

  updateMovingObjects(dt);
  processHits();
  syncHud();
}

function render() {
  renderer.render(scene, camera);
}

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function setTargetXFromClientX(clientX) {
  const rect = canvas.getBoundingClientRect();
  const relativeX = clientX - rect.left;
  state.targetX = relativeX < rect.width / 2 ? laneXs[0] : laneXs[1];
}

let activePointerId = null;

canvas.addEventListener("pointerdown", (event) => {
  if (!state.running) {
    return;
  }
  activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
  setTargetXFromClientX(event.clientX);
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.running) {
    return;
  }
  if (event.pointerId !== activePointerId) {
    return;
  }
  if (event.pointerType === "mouse" && (event.buttons & 1) === 0) {
    return;
  }
  event.preventDefault();
  setTargetXFromClientX(event.clientX);
});

canvas.addEventListener("pointerup", (event) => {
  if (event.pointerId === activePointerId) {
    activePointerId = null;
  }
});

canvas.addEventListener("pointercancel", (event) => {
  if (event.pointerId === activePointerId) {
    activePointerId = null;
  }
});

document.getElementById("startButton").addEventListener("click", () => {
  resetState(chosenLevel);
  state.running = true;
  startOverlay.classList.add("hidden");
});

document.getElementById("restartButton").addEventListener("click", () => {
  resetState(chosenLevel);
  state.running = true;
});

window.addEventListener("resize", resizeRenderer);

createStreet();
resetState(chosenLevel);
resizeRenderer();
render();
requestAnimationFrame(frame);
