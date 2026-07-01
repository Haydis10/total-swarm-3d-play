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

const laneXs = [-8.5, 0, 8.5];
const roadHalfWidth = 11;
const playerZ = 24;
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

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
camera.position.set(0, 28, 34);
camera.lookAt(0, 0, 4);

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
  targetX: laneXs[1],
  playerX: laneXs[1],
  roadScroll: 0,
  walkTime: 0,
  spawnTimer: 0,
  fireTimer: 0,
  segment: "combat",
  combatTimer: 0,
  encounter: 1,
  encountersPerLevel: 2,
  gateResolved: false,
  gateTimer: 0,
  boss: null,
  bossAttackTimer: 0,
};

function getLevelProfile(level) {
  const danger = Math.min(1, (level - 1) / 99);
  return {
    danger,
    startingUnits: Math.round(4 + (1 - danger) * 3),
    startingFireRate: 3.1 + (1 - danger) * 0.6,
    encountersPerLevel: 2 + Math.floor(danger * 4),
    combatDuration: Math.max(3.4, 8.2 - danger * 4.3),
    spawnInterval: Math.max(0.42, 1.65 - danger * 1.05),
    enemySpeed: 9 + danger * 14,
    enemyHp: Math.round(2 + level * 0.12 + danger * 10),
    enemyDamage: Math.max(1, Math.round(1 + danger * 6)),
    bossHp: Math.round(28 + level * 4 + danger * 160),
    bossSpeed: 4 + danger * 6,
    bossAttackInterval: Math.max(0.5, 1.8 - danger),
    addUnitsGate: Math.round(2 + (1 - danger) * 4 + level * 0.12),
    weaponGate: Math.max(1, Math.round(1 + danger * 2)),
    boostChance: 0.22,
    goldChance: 0.1,
  };
}

let profile = getLevelProfile(state.level);

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

function clearGroupEntries(entries) {
  for (const item of entries) {
    scene.remove(item.mesh || item.group || item);
  }
  entries.length = 0;
}

function resetState(level = chosenLevel) {
  profile = getLevelProfile(level);
  state.level = level;
  state.score = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.units = profile.startingUnits;
  state.maxUnits = state.units;
  state.fireRate = profile.startingFireRate;
  state.weaponTier = 0;
  state.targetX = laneXs[1];
  state.playerX = laneXs[1];
  state.roadScroll = 0;
  state.walkTime = 0;
  state.spawnTimer = 0.3;
  state.fireTimer = 0.15;
  state.segment = "combat";
  state.combatTimer = 0;
  state.encounter = 1;
  state.encountersPerLevel = profile.encountersPerLevel;
  state.gateResolved = false;
  state.gateTimer = 0;
  state.boss = null;
  state.bossAttackTimer = 0;
  state.ended = false;
  state.won = false;

  clearGroupEntries(sceneObjects.bullets);
  clearGroupEntries(sceneObjects.enemies);
  clearGroupEntries(sceneObjects.pickups);
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
    speed: kind === "boss" ? profile.bossSpeed : profile.enemySpeed * (0.9 + Math.random() * 0.3),
    hp,
    maxHp: hp,
    kind,
    damage: kind === "boss" ? 0 : profile.enemyDamage,
    runOffset: Math.random() * Math.PI * 2,
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

function spawnCombatObject() {
  const roll = Math.random();
  if (roll < profile.goldChance) {
    const pickup = createPickup("gold");
    addObjectToLane(pickup);
    sceneObjects.pickups.push(pickup);
    return;
  }
  if (roll < profile.goldChance + profile.boostChance) {
    const pickup = createPickup("boost");
    addObjectToLane(pickup);
    sceneObjects.pickups.push(pickup);
    return;
  }
  if (roll < profile.goldChance + profile.boostChance + 0.24) {
    const pickup = createPickup("bonus");
    addObjectToLane(pickup);
    sceneObjects.pickups.push(pickup);
    return;
  }

  const enemy = createEnemy("trooper", profile.enemyHp);
  addObjectToLane(enemy);
  sceneObjects.enemies.push(enemy);
}

function addObjectToLane(object) {
  object.lane = Math.floor(Math.random() * laneXs.length);
  object.mesh.position.set(laneXs[object.lane], 0, object.z);
  scene.add(object.mesh);
}

function createGateLabel(option, color) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 512;
  canvasEl.height = 256;
  const ctx = canvasEl.getContext("2d");

  ctx.fillStyle = "rgba(7, 16, 28, 0.86)";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, canvasEl.width - 24, canvasEl.height - 24);

  ctx.textAlign = "center";
  ctx.fillStyle = "#eef7ff";
  ctx.font = "700 54px 'Space Grotesk', sans-serif";
  ctx.fillText(option.type === "units" ? "MORE GUNNERS" : "WEAPON UP", canvasEl.width / 2, 92);

  ctx.fillStyle = color;
  ctx.font = "700 96px 'Space Grotesk', sans-serif";
  const prefix = option.type === "units" ? "+" : "T";
  ctx.fillText(`${prefix}${option.value}`, canvasEl.width / 2, 188);

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.4), material);
  sign.position.set(0, 3.15, -0.29);
  return sign;
}

function spawnGate() {
  clearGroupEntries(sceneObjects.gates);
  const leftType = Math.random() > 0.5 ? "units" : "weapon";
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
    frame.position.set(option.x, 0, -92);
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
  boss.z = -132;
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
  const shots = Math.max(1, Math.min(12, 1 + Math.floor(state.units / 2)));
  for (let i = 0; i < shots; i += 1) {
    const spread = (i - (shots - 1) / 2) * 0.42;
    const bullet = new THREE.Mesh(
      new THREE.SphereGeometry(0.16 + state.weaponTier * 0.02, 10, 10),
      new THREE.MeshBasicMaterial({ color: palette.gun[Math.min(state.weaponTier + 1, palette.gun.length - 1)] })
    );
    bullet.position.set(state.playerX + spread, 2.55 + Math.random() * 0.4, playerZ - 0.8);
    scene.add(bullet);
    sceneObjects.bullets.push({
      mesh: bullet,
      velocity: 55 + state.weaponTier * 8,
      damage: 1 + state.weaponTier + Math.floor(state.level / 20),
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
  } else if (pickup.kind === "boost") {
    state.fireRate = Math.min(8.6, state.fireRate + 0.45);
    state.weaponTier = Math.min(4, state.weaponTier + 1);
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
  state.roadScroll += dt * (8 + profile.danger * 7);
  for (const scroller of sceneObjects.scrollers) {
    scroller.mesh.position.z += dt * (scroller.speed + profile.danger * 16);
    if (scroller.mesh.position.z > scroller.resetThreshold) {
      scroller.mesh.position.z -= scroller.resetSpan;
    }
  }
}

function animatePlayer(dt) {
  state.walkTime += dt * (5.4 + profile.danger * 3);
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
  state.spawnTimer -= dt;
  state.fireTimer -= dt;
  state.comboTimer -= dt;

  if (state.comboTimer <= 0) {
    state.combo = 0;
  }

  if (state.spawnTimer <= 0) {
    spawnCombatObject();
    state.spawnTimer = profile.spawnInterval * (0.8 + Math.random() * 0.4);
  }

  if (state.fireTimer <= 0) {
    fireVolley();
    state.fireTimer = 1 / state.fireRate;
  }

  if (state.combatTimer >= profile.combatDuration) {
    clearGroupEntries(sceneObjects.pickups);
    sceneObjects.pickups.length = 0;
    clearGroupEntries(sceneObjects.enemies);
    sceneObjects.enemies.length = 0;
    spawnGate();
    state.combatTimer = 0;
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
      state.spawnTimer = 0.25;
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
    minion.lane = Math.floor(Math.random() * laneXs.length);
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
    pickup.mesh.position.set(laneXs[pickup.lane], 1.45 + Math.sin(pickup.spin) * 0.2, pickup.z);
    pickup.mesh.rotation.x += dt * 1.2;
    pickup.mesh.rotation.y += dt * 1.8;

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
  const normalized = Math.max(0, Math.min(1, relativeX / rect.width));
  state.targetX = THREE.MathUtils.lerp(-roadHalfWidth, roadHalfWidth, normalized);
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
