import * as THREE from "three";
import "./style.css";

/* ================================================================
   Interactive 3D background — drive a low-poly Nissan GT-R around
   a track, smash cones, barrels and crates, follow the minimap.
   Desktop: WASD / arrow keys. Mobile: virtual joystick.
   The page content fades out while driving so the world is visible.
   ================================================================ */

const canvas = document.querySelector("#webgl");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070f, 0.017); // thinner: the circuit is long

const camera = new THREE.PerspectiveCamera(60, sizes.width / sizes.height, 0.1, 300);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const rand = (min, max) => min + Math.random() * (max - min);

/* ---------------- lights ---------------- */
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

const sun = new THREE.DirectionalLight(0xdfe9ff, 1.6);
sun.position.set(6, 12, 5);
scene.add(sun);

const tealLight = new THREE.PointLight(0x4fd1c5, 55, 60);
tealLight.position.set(6, 6, 6);
scene.add(tealLight);

const amberLight = new THREE.PointLight(0xf6ad55, 35, 60);
amberLight.position.set(-6, 2, 4);
scene.add(amberLight);

/* ---------------- ground ---------------- */
const GROUND_Y = -3.6;
const WORLD_RADIUS = 72; // the circuit reaches ~50 out, so leave room around it

const grid = new THREE.GridHelper(320, 160, 0x2a5a5f, 0x11202e);
grid.position.y = GROUND_Y;
scene.add(grid);

// Opaque floor just under the grid so stars don't show below the horizon.
// Lit material (not Basic) so headlights and street lamps show on the ground.
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700),
  new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = GROUND_Y - 0.03;
scene.add(floor);

/* ---------------- race track ---------------- */
// A closed circuit rather than a plain ring: long straights, fast sweepers, a
// pinched "waist" that cuts back toward the middle, and a wide hairpin.
// Everything that sits on or beside the track (gate, lamps, ramps, cones) is
// positioned through placeOnTrack(t, offset), so reshaping the waypoints below
// moves the whole layout with it.
const TRACK_HALF_WIDTH = 3.6;
const TRACK_WAYPOINTS = [
  [38, 8],
  [38, -12],
  [32, -28],
  [18, -38],
  [0, -40],
  [-16, -34],
  [-24, -20],
  [-20, -6],
  [-30, 6],
  [-40, 18],
  [-32, 32],
  [-14, 38],
  [6, 36],
  [22, 28],
  [32, 20],
];
const trackCurve = new THREE.CatmullRomCurve3(
  TRACK_WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  true,
  "catmullrom",
  0.5
);

// Evenly spaced samples of the centerline, reused for the ribbons and for
// distance queries when scattering scenery.
const TRACK_SAMPLES = 420;
const trackPoints = [];
const trackTangents = [];
for (let i = 0; i < TRACK_SAMPLES; i += 1) {
  const t = i / TRACK_SAMPLES;
  trackPoints.push(trackCurve.getPointAt(t));
  trackTangents.push(trackCurve.getTangentAt(t));
}

// Position + facing at a point on the circuit. `offset` steps sideways from
// the centerline along the normal (-tangent.z, tangent.x).
function placeOnTrack(t, offset = 0) {
  const tt = THREE.MathUtils.euclideanModulo(t, 1);
  const p = trackCurve.getPointAt(tt);
  const tan = trackCurve.getTangentAt(tt);
  return {
    x: p.x - tan.z * offset,
    z: p.z + tan.x * offset,
    heading: Math.atan2(tan.x, tan.z),
  };
}

function distanceToTrack(x, z) {
  let min = Infinity;
  for (let i = 0; i < TRACK_SAMPLES; i += 1) {
    const d = Math.hypot(x - trackPoints[i].x, z - trackPoints[i].z);
    if (d < min) min = d;
  }
  return min;
}

// Flat ribbon following the circuit between two lateral offsets. `stripe`
// ([colorA, colorB, runLength]) alternates vertex colors, which is how the
// red/white curbs are drawn without a texture.
function trackRibbon(offA, offB, y, material, stripe) {
  const positions = [];
  const colors = [];
  const indices = [];
  const colorA = stripe && new THREE.Color(stripe[0]);
  const colorB = stripe && new THREE.Color(stripe[1]);
  for (let i = 0; i < TRACK_SAMPLES; i += 1) {
    const p = trackPoints[i];
    const tan = trackTangents[i];
    positions.push(p.x - tan.z * offA, y, p.z + tan.x * offA);
    positions.push(p.x - tan.z * offB, y, p.z + tan.x * offB);
    if (stripe) {
      const c = Math.floor(i / stripe[2]) % 2 === 0 ? colorA : colorB;
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < TRACK_SAMPLES; i += 1) {
    const j = (i + 1) % TRACK_SAMPLES; // wrap: the circuit is closed
    indices.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (stripe) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

// Asphalt surface — lit material so headlights and street lamps pool on it
trackRibbon(
  -TRACK_HALF_WIDTH,
  TRACK_HALF_WIDTH,
  GROUND_Y + 0.02,
  new THREE.MeshStandardMaterial({
    color: 0x0e1a28,
    roughness: 0.9,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  })
);

// Red/white racing curbs down both edges
const curbMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.6,
  side: THREE.DoubleSide,
});
trackRibbon(TRACK_HALF_WIDTH, TRACK_HALF_WIDTH + 0.75, GROUND_Y + 0.035, curbMaterial, [
  0xe6edf7, 0xc53030, 6,
]);
trackRibbon(-TRACK_HALF_WIDTH - 0.75, -TRACK_HALF_WIDTH, GROUND_Y + 0.035, curbMaterial, [
  0xc53030, 0xe6edf7, 6,
]);

// Dashed centerline
const dashGeometry = new THREE.PlaneGeometry(0.3, 2.0).rotateX(-Math.PI / 2);
const dashMaterial = new THREE.MeshBasicMaterial({ color: 0x2c5a74 });
const DASH_COUNT = 96;
for (let i = 0; i < DASH_COUNT; i += 1) {
  const spot = placeOnTrack(i / DASH_COUNT);
  const dash = new THREE.Mesh(dashGeometry, dashMaterial);
  dash.position.set(spot.x, GROUND_Y + 0.03, spot.z);
  dash.rotation.y = spot.heading;
  scene.add(dash);
}

// Checkered start/finish line, at t = 0 on the circuit
const checkerCanvas = document.createElement("canvas");
checkerCanvas.width = 64;
checkerCanvas.height = 16;
const checkerCtx = checkerCanvas.getContext("2d");
for (let x = 0; x < 8; x += 1) {
  for (let y = 0; y < 2; y += 1) {
    checkerCtx.fillStyle = (x + y) % 2 === 0 ? "#e6edf7" : "#10131a";
    checkerCtx.fillRect(x * 8, y * 8, 8, 8);
  }
}
const checkerTexture = new THREE.CanvasTexture(checkerCanvas);
checkerTexture.magFilter = THREE.NearestFilter;
const START = placeOnTrack(0);
const startLine = new THREE.Mesh(
  new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2 - 0.2, 1.0).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: checkerTexture })
);
startLine.position.set(START.x, GROUND_Y + 0.04, START.z);
startLine.rotation.y = START.heading;
scene.add(startLine);

// Solid obstacles can't be knocked away, so they need to be *seen* in the dark.
// A slightly enlarged back-face shell rendered additively reads as a glowing
// rim/outline around the silhouette; fog is off so even distant ones show.
const rimGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0x4fd1c5,
  side: THREE.BackSide,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
});
function addRimGlow(mesh, scale = 1.14) {
  const shell = new THREE.Mesh(mesh.geometry, rimGlowMaterial);
  shell.scale.setScalar(scale);
  mesh.add(shell);
  return shell;
}

// Start gate: two posts + banner
const postMaterial = new THREE.MeshStandardMaterial({
  color: 0xf6ad55,
  flatShading: true,
  roughness: 0.5,
});
const bannerMaterial = new THREE.MeshStandardMaterial({
  color: 0x16324a,
  emissive: 0x4fd1c5,
  emissiveIntensity: 0.35,
  flatShading: true,
});
const postGeometry = new THREE.BoxGeometry(0.32, 2.4, 0.32);
// Straddling the start line; reused below as solid obstacles.
const GATE_POSTS = [TRACK_HALF_WIDTH - 0.1, -(TRACK_HALF_WIDTH - 0.1)].map((offset) =>
  placeOnTrack(0, offset)
);
GATE_POSTS.forEach((spot) => {
  const post = new THREE.Mesh(postGeometry, postMaterial);
  post.position.set(spot.x, GROUND_Y + 1.2, spot.z);
  addRimGlow(post, 1.1);
  scene.add(post);
});
const banner = new THREE.Mesh(
  new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2, 0.5, 0.24),
  bannerMaterial
);
banner.position.set(START.x, GROUND_Y + 2.55, START.z);
banner.rotation.y = START.heading;
scene.add(banner);

/* ---------------- jump ramps ---------------- */
// Wedges sitting on the racing line: drive up the slope and the car launches
// off the lip (the airborne handling lives in updateCar).
const ramps = [];
const rampMaterial = new THREE.MeshStandardMaterial({
  color: 0x1b2635,
  roughness: 0.75,
  flatShading: true,
});
const rampLipMaterial = new THREE.MeshStandardMaterial({
  color: 0xf6ad55,
  emissive: 0xf6ad55,
  emissiveIntensity: 0.9,
  roughness: 0.5,
});

function addRamp(t, { length = 6.5, width = 6.4, height = 1.7 } = {}) {
  const spot = placeOnTrack(t);
  // Right-triangle profile extruded sideways: flat at the back, full height at
  // the lip, so the take-off edge is a clean drop.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length, 0);
  shape.lineTo(length, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geometry.rotateY(-Math.PI / 2); // run along +z (forward), width along x
  geometry.translate(width / 2, 0, -length / 2); // center on the placement point
  const mesh = new THREE.Mesh(geometry, rampMaterial);
  mesh.position.set(spot.x, GROUND_Y + 0.02, spot.z);
  mesh.rotation.y = spot.heading;
  // glowing lip so the take-off edge reads in the dark
  const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, 0.36), rampLipMaterial);
  lip.position.set(0, height, length / 2 - 0.18);
  mesh.add(lip);
  scene.add(mesh);
  ramps.push({
    x: spot.x,
    z: spot.z,
    heading: spot.heading,
    halfLen: length / 2,
    halfWidth: width / 2,
    height,
  });
}
[0.13, 0.45, 0.78].forEach((t) => addRamp(t));

// Height of the driving surface at a world point (0 = ground level).
function surfaceHeightAt(x, z) {
  for (let i = 0; i < ramps.length; i += 1) {
    const r = ramps[i];
    const dx = x - r.x;
    const dz = z - r.z;
    // rotate world offset into the ramp's local frame
    const lx = dx * Math.cos(r.heading) - dz * Math.sin(r.heading);
    const lz = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
    if (Math.abs(lx) <= r.halfWidth && Math.abs(lz) <= r.halfLen) {
      return (r.height * (lz + r.halfLen)) / (2 * r.halfLen);
    }
  }
  return 0;
}

function nearRamp(x, z, pad = 2.5) {
  return ramps.some(
    (r) => Math.hypot(x - r.x, z - r.z) < Math.max(r.halfLen, r.halfWidth) + pad
  );
}

/* ================================================================
   Obstacles
   - solid: rocks, gate posts, tire stacks (car bounces off)
   - knockable: cones, barrels, crates (go flying when hit)
   ================================================================ */
const CAR_RADIUS = 1.15;

const solidObstacles = [];
const knockables = [];

function addKnockable(mesh, { r, restY, kick, spin, type }) {
  scene.add(mesh);
  knockables.push({
    mesh,
    r,
    restY,
    kick,
    spin,
    type,
    state: "upright", // upright | flying | down
    vel: new THREE.Vector3(),
    angVel: new THREE.Vector3(),
  });
}

// --- solid rocks: a few in the infield, most outside the track
const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0x13273a,
  emissive: 0x4fd1c5,
  emissiveIntensity: 0.22,
  flatShading: true,
  roughness: 0.8,
});

function addRock(x, z, s) {
  const rock = new THREE.Mesh(rockGeometry, rockMaterial);
  rock.position.set(x, GROUND_Y + s * 0.55, z);
  rock.scale.setScalar(s);
  rock.rotation.set(rand(0, Math.PI), rand(0, Math.PI), 0);
  addRimGlow(rock);
  scene.add(rock);
  solidObstacles.push({ x, z, r: s * 0.95, type: "rock" });
}
// Scattered anywhere that is clear of the circuit — the track now weaves all
// over the world, so positions are rejection-sampled against it.
{
  let placed = 0;
  let guard = 0;
  while (placed < 18 && guard < 900) {
    guard += 1;
    const angle = rand(0, Math.PI * 2);
    const radius = rand(7, WORLD_RADIUS - 6);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (distanceToTrack(x, z) < TRACK_HALF_WIDTH + 3.5) continue;
    addRock(x, z, rand(0.5, 1.7));
    placed += 1;
  }
}

// --- gate posts are solid too
GATE_POSTS.forEach((spot) => {
  solidObstacles.push({ x: spot.x, z: spot.z, r: 0.45, type: "post" });
});

// --- solid tire stacks guarding the corners
const tireGeometry = new THREE.TorusGeometry(0.46, 0.17, 8, 18);
const tireMaterial = new THREE.MeshStandardMaterial({
  color: 0x1a212c,
  emissive: 0x4fd1c5,
  emissiveIntensity: 0.12,
  roughness: 0.95,
  flatShading: true,
});
function addTireStack(x, z) {
  const stack = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
    tire.rotation.x = Math.PI / 2;
    tire.rotation.z = rand(0, Math.PI);
    tire.position.y = 0.17 + i * 0.34;
    addRimGlow(tire, 1.18);
    stack.add(tire);
  }
  stack.position.set(x, GROUND_Y, z);
  scene.add(stack);
  solidObstacles.push({ x, z, r: 0.75, type: "tire" });
}
[0.05, 0.28, 0.53, 0.67, 0.88].forEach((t, i) => {
  const spot = placeOnTrack(t, (i % 2 === 0 ? 1 : -1) * (TRACK_HALF_WIDTH + 1.6));
  addTireStack(spot.x, spot.z);
});

// --- street lamps on the outer edge, arms reaching over the track.
// Poles are solid; each lamp is a real PointLight (lights the car driving
// under it) plus a faint additive disc so the pool reads on dark asphalt.
const lampPoleMaterial = new THREE.MeshStandardMaterial({
  color: 0x2a3442,
  roughness: 0.6,
  flatShading: true,
});
const lampHeadMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd9a0,
  emissive: 0xffc37a,
  emissiveIntensity: 1.6,
  flatShading: true,
});
const lampPoolMaterial = new THREE.MeshBasicMaterial({
  color: 0xffc37a,
  transparent: true,
  opacity: 0.08,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const LAMP_HEIGHT = 4.6;
const lampPoleGeometry = new THREE.CylinderGeometry(0.09, 0.13, LAMP_HEIGHT, 6);
const lampArmGeometry = new THREE.BoxGeometry(2.2, 0.09, 0.09);
const lampHeadGeometry = new THREE.BoxGeometry(0.55, 0.12, 0.26);
const lampPoolGeometry = new THREE.CircleGeometry(3.4, 24);

// `side` is +1 to stand the pole on the left of the racing line, -1 on the
// right; the arm always reaches back over the asphalt.
function addStreetLamp(t, side) {
  const lamp = new THREE.Group();

  const pole = new THREE.Mesh(lampPoleGeometry, lampPoleMaterial);
  pole.position.y = LAMP_HEIGHT / 2;
  lamp.add(pole);

  const arm = new THREE.Mesh(lampArmGeometry, lampPoleMaterial);
  arm.position.set(-1.1, LAMP_HEIGHT, 0);
  lamp.add(arm);

  const head = new THREE.Mesh(lampHeadGeometry, lampHeadMaterial);
  head.position.set(-2.0, LAMP_HEIGHT - 0.04, 0);
  lamp.add(head);

  const glow = new THREE.PointLight(0xffc37a, 60, 18, 2);
  glow.position.set(-2.0, LAMP_HEIGHT - 0.3, 0);
  lamp.add(glow);

  const pool = new THREE.Mesh(lampPoolGeometry, lampPoolMaterial);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(-2.0, 0.06, 0);
  lamp.add(pool);

  const spot = placeOnTrack(t, side * (TRACK_HALF_WIDTH + 1.3));
  lamp.position.set(spot.x, GROUND_Y, spot.z);
  // local -x is the arm; turn it back toward the asphalt
  lamp.rotation.y = side > 0 ? spot.heading + Math.PI : spot.heading;
  scene.add(lamp);
  solidObstacles.push({ x: spot.x, z: spot.z, r: 0.5, type: "lamp" });
}
[
  [0.02, 1],
  [0.2, -1],
  [0.36, 1],
  [0.58, -1],
  [0.72, 1],
  [0.93, -1],
].forEach(([t, side]) => addStreetLamp(t, side));

// --- knockable traffic cones along the track edges
const coneGeometry = new THREE.ConeGeometry(0.34, 0.8, 10);
const coneMaterial = new THREE.MeshStandardMaterial({
  color: 0xe8833a,
  emissive: 0xe8833a,
  emissiveIntensity: 0.12,
  flatShading: true,
  roughness: 0.6,
});
const CONE_COUNT = 26;
for (let i = 0; i < CONE_COUNT; i += 1) {
  const t = (i + 0.5) / CONE_COUNT;
  if (t < 0.02 || t > 0.98) continue; // keep the start gate clear
  const spot = placeOnTrack(t, (i % 2 === 0 ? 1 : -1) * (TRACK_HALF_WIDTH - 0.9));
  if (nearRamp(spot.x, spot.z)) continue; // don't litter the take-off zones
  const mesh = new THREE.Mesh(coneGeometry, coneMaterial);
  mesh.position.set(spot.x, GROUND_Y + 0.4, spot.z);
  addKnockable(mesh, { r: 0.34, restY: GROUND_Y + 0.3, kick: 1, spin: 8, type: "cone" });
}

// --- knockable striped barrels, in clusters
const barrelBodyGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.85, 12);
const barrelBandGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.2, 12);
const barrelMaterial = new THREE.MeshStandardMaterial({
  color: 0xc53030,
  flatShading: true,
  roughness: 0.55,
});
const bandMaterial = new THREE.MeshStandardMaterial({
  color: 0xe6edf7,
  flatShading: true,
  roughness: 0.5,
});
function addBarrel(x, z) {
  const barrel = new THREE.Group();
  barrel.add(new THREE.Mesh(barrelBodyGeometry, barrelMaterial));
  const band = new THREE.Mesh(barrelBandGeometry, bandMaterial);
  band.position.y = 0.1;
  barrel.add(band);
  barrel.position.set(x, GROUND_Y + 0.43, z);
  barrel.rotation.y = rand(0, Math.PI);
  addKnockable(barrel, { r: 0.5, restY: GROUND_Y + 0.43, kick: 0.55, spin: 5, type: "barrel" });
}
function addBarrelCluster(t, offset) {
  const spot = placeOnTrack(t, offset);
  addBarrel(spot.x, spot.z);
  addBarrel(spot.x + 0.95, spot.z + 0.2);
  addBarrel(spot.x + 0.45, spot.z + 1.0);
}
addBarrelCluster(0.24, TRACK_HALF_WIDTH + 1.9);
addBarrelCluster(0.62, -(TRACK_HALF_WIDTH + 2.1));
addBarrelCluster(0.86, TRACK_HALF_WIDTH + 2.0);

// --- knockable wooden crates: a pyramid right on the track + strays
const crateGeometry = new THREE.BoxGeometry(0.72, 0.72, 0.72);
const crateMaterial = new THREE.MeshStandardMaterial({
  color: 0x9c6b35,
  flatShading: true,
  roughness: 0.75,
});
function addCrate(x, z, y = GROUND_Y + 0.36) {
  const crate = new THREE.Mesh(crateGeometry, crateMaterial);
  crate.position.set(x, y, z);
  crate.rotation.y = rand(0, Math.PI / 2);
  addKnockable(crate, { r: 0.5, restY: GROUND_Y + 0.36, kick: 0.8, spin: 6, type: "crate" });
}
{
  // pyramid sitting right on the racing line, half a lap out
  const spot = placeOnTrack(0.52);
  const tx = Math.sin(spot.heading); // along the direction of travel
  const tz = Math.cos(spot.heading);
  addCrate(spot.x + tx * 0.4, spot.z + tz * 0.4);
  addCrate(spot.x - tx * 0.4, spot.z - tz * 0.4);
  addCrate(spot.x, spot.z, GROUND_Y + 1.08);
}
addCrate(Math.cos(2.3) * 9, Math.sin(2.3) * 9);
addCrate(Math.cos(5.7) * 12, Math.sin(5.7) * 12);

/* ---------------- node network (floating above the infield) ---------------- */
const network = new THREE.Group();
network.position.y = 2.4;
scene.add(network);

const NODE_COUNT = 30;
const SPREAD = 6.5;
const CONNECT_DIST = 3.4;

const nodeGeometry = new THREE.IcosahedronGeometry(1, 0);
const nodeMaterialTeal = new THREE.MeshStandardMaterial({
  color: 0x0e1a2b,
  emissive: 0x4fd1c5,
  emissiveIntensity: 0.25,
  metalness: 0.4,
  roughness: 0.35,
  flatShading: true,
});
const nodeMaterialAmber = nodeMaterialTeal.clone();
nodeMaterialAmber.emissive = new THREE.Color(0xf6ad55);

const nodes = [];
for (let i = 0; i < NODE_COUNT; i += 1) {
  const position = new THREE.Vector3(
    rand(-SPREAD, SPREAD) * 1.4,
    rand(-SPREAD, SPREAD) * 0.5,
    rand(-SPREAD, SPREAD) * 0.8
  );
  const scale = rand(0.1, 0.34);
  const mesh = new THREE.Mesh(
    nodeGeometry,
    Math.random() < 0.82 ? nodeMaterialTeal : nodeMaterialAmber
  );
  mesh.position.copy(position);
  mesh.scale.setScalar(scale);
  mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), 0);
  network.add(mesh);
  nodes.push({
    mesh,
    base: position.clone(),
    baseScale: scale,
    phase: rand(0, Math.PI * 2),
    speed: rand(0.4, 0.9),
    spin: rand(-0.3, 0.3),
  });
}

const edges = [];
for (let i = 0; i < NODE_COUNT; i += 1) {
  for (let j = i + 1; j < NODE_COUNT; j += 1) {
    if (nodes[i].base.distanceTo(nodes[j].base) < CONNECT_DIST) {
      edges.push([i, j]);
    }
  }
}

const edgePositions = new Float32Array(edges.length * 2 * 3);
const edgeGeometry = new THREE.BufferGeometry();
edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
const edgeMaterial = new THREE.LineBasicMaterial({
  color: 0x4fd1c5,
  transparent: true,
  opacity: 0.14,
});
const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
network.add(edgeLines);

function updateEdges() {
  edges.forEach(([a, b], k) => {
    const pa = nodes[a].mesh.position;
    const pb = nodes[b].mesh.position;
    edgePositions.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], k * 6);
  });
  edgeGeometry.attributes.position.needsUpdate = true;
}

/* ---------------- starfield ---------------- */
const STAR_COUNT = 900;
const starPositions = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i += 1) {
  starPositions[i * 3] = rand(-60, 60);
  starPositions[i * 3 + 1] = rand(-2, 50);
  starPositions[i * 3 + 2] = rand(-60, 60);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({
  color: 0x93a1b8,
  size: 0.06,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.7,
});
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

/* ================================================================
   The car — a low-poly Nissan GT-R Nismo
   ================================================================ */
// Parked just behind the start line, pointing down the circuit
const CAR_START = placeOnTrack(-0.012);
const car = new THREE.Group();
car.position.set(CAR_START.x, GROUND_Y, CAR_START.z);
car.rotation.y = CAR_START.heading;
scene.add(car);

// Everything except the wheels, so the body can lean into turns
const carBody = new THREE.Group();
car.add(carBody);

// GT-R Nismo livery: matte gunmetal paint, carbon-black trim, Nismo-red accents
const paintMaterial = new THREE.MeshStandardMaterial({
  color: 0x6c727a, // matte gunmetal grey
  metalness: 0.55,
  roughness: 0.5,
  flatShading: true,
});
const trimMaterial = new THREE.MeshStandardMaterial({
  color: 0x0b0f16, // carbon black
  metalness: 0.3,
  roughness: 0.7,
  flatShading: true,
});
const accentMaterial = new THREE.MeshStandardMaterial({
  color: 0xd11f28, // Nismo red
  metalness: 0.2,
  roughness: 0.45,
  flatShading: true,
});
const glassMaterial = new THREE.MeshStandardMaterial({
  color: 0x090d14, // dark tinted glass
  metalness: 0.7,
  roughness: 0.22,
  flatShading: true,
});

// Wide low body — painted upper, black lower rocker line to sit it low
const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.34, 3.8), paintMaterial);
chassis.position.y = 0.66;
carBody.add(chassis);
const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.24, 3.68), trimMaterial);
lowerBody.position.y = 0.44;
carBody.add(lowerBody);

// Sculpted shoulders: a slightly narrower painted upper deck
const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 3.1), paintMaterial);
shoulders.position.set(0, 0.9, -0.15);
carBody.add(shoulders);

// Hood: power dome + twin vents
const hood = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.1, 1.55), paintMaterial);
hood.position.set(0, 0.85, 1.12);
carBody.add(hood);
const dome = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.95), paintMaterial);
dome.position.set(0, 0.92, 1.15);
carBody.add(dome);
[-0.24, 0.24].forEach((x) => {
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.36), trimMaterial);
  vent.position.set(x, 0.965, 1.12);
  carBody.add(vent);
});

// Fastback greenhouse: tinted glass prism + body-colored roof panel
const cabinGeometry = new THREE.CylinderGeometry(0.6, 0.96, 0.46, 4, 1);
cabinGeometry.rotateY(Math.PI / 4);
const cabin = new THREE.Mesh(cabinGeometry, glassMaterial);
cabin.scale.set(1.18, 1, 2.05);
cabin.position.set(0, 1.04, -0.3);
carBody.add(cabin);
const roof = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 1.28), paintMaterial);
roof.position.set(0, 1.22, -0.42);
carBody.add(roof);

// Rear wing — big GT-R swan-neck spec with endplates + red trailing edge
const wingPostGeometry = new THREE.BoxGeometry(0.07, 0.32, 0.12);
[-0.62, 0.62].forEach((x) => {
  const wingPost = new THREE.Mesh(wingPostGeometry, trimMaterial);
  wingPost.position.set(x, 1.0, -1.68);
  carBody.add(wingPost);
});
const wing = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.06, 0.46), paintMaterial);
wing.position.set(0, 1.17, -1.82);
carBody.add(wing);
const wingLip = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.035, 0.08), accentMaterial);
wingLip.position.set(0, 1.15, -2.03);
carBody.add(wingLip);
[-0.87, 0.87].forEach((x) => {
  const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.46), trimMaterial);
  endplate.position.set(x, 1.17, -1.82);
  carBody.add(endplate);
});

// Front fascia: black bumper, mesh grille, red GT-R badge + Nismo-red lower lip
const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.32, 0.34), trimMaterial);
bumper.position.set(0, 0.52, 1.83);
carBody.add(bumper);
const grille = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.22, 0.06), trimMaterial);
grille.position.set(0, 0.66, 1.99);
carBody.add(grille);
const badge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.05), accentMaterial);
badge.position.set(0, 0.66, 2.01);
carBody.add(badge);
const frontLip = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.06, 0.42), accentMaterial);
frontLip.position.set(0, 0.35, 1.82);
carBody.add(frontLip);
[-0.88, 0.88].forEach((x) => {
  const canard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.2), accentMaterial);
  canard.position.set(x, 0.52, 1.72);
  carBody.add(canard);
});

// Side skirts with a Nismo-red pinstripe
[-0.9, 0.9].forEach((x) => {
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 2.3), trimMaterial);
  skirt.position.set(x, 0.42, -0.05);
  carBody.add(skirt);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 2.3), accentMaterial);
  stripe.position.set(x, 0.49, -0.05);
  carBody.add(stripe);
});

// Rear diffuser (black) + red accent lip
const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.14, 0.3), trimMaterial);
diffuser.position.set(0, 0.39, -1.82);
carBody.add(diffuser);
const diffuserLip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.12), accentMaterial);
diffuserLip.position.set(0, 0.33, -1.94);
carBody.add(diffuserLip);

// Slim headlights
const headlightGeometry = new THREE.BoxGeometry(0.4, 0.09, 0.06);
const headlightMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff4cc,
  emissive: 0xfff4cc,
  emissiveIntensity: 2.2,
});
[-0.55, 0.55].forEach((x) => {
  const head = new THREE.Mesh(headlightGeometry, headlightMaterial);
  head.position.set(x, 0.74, 1.91);
  carBody.add(head);
});

// Headlamp beam — one shared spotlight (cheaper than two) lighting the road
const headlamp = new THREE.SpotLight(0xffeecb, 120, 34, Math.PI / 7, 0.55, 1.7);
headlamp.position.set(0, 0.74, 1.85);
const headlampTarget = new THREE.Object3D();
headlampTarget.position.set(0, -0.6, 11);
carBody.add(headlamp, headlampTarget);
headlamp.target = headlampTarget;

// Visible volumetric headlight cones (Bruno-Simon style): a translucent,
// additive-blended shell per headlight that reads as a shaft of light — the
// SpotLight above only pools on the road, this is the beam you actually see.
function makeHeadlightBeam() {
  const H = 13; // beam length
  const R = 2.2; // spread at the far end
  const geo = new THREE.ConeGeometry(R, H, 28, 1, true); // open-ended shell
  geo.translate(0, -H / 2, 0); // move apex (tip) to the local origin
  geo.rotateX(-Math.PI / 2); // aim the cone down +z (the car's forward axis)
  // Fade the beam from bright at the headlight to nothing at the far end.
  const pos = geo.attributes.position;
  const colors = [];
  const tint = new THREE.Color(0xfff2cf);
  for (let i = 0; i < pos.count; i += 1) {
    const t = THREE.MathUtils.clamp(pos.getZ(i) / H, 0, 1);
    const k = Math.pow(1 - t, 1.6);
    colors.push(tint.r * k, tint.g * k, tint.b * k);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  return new THREE.Mesh(geo, mat);
}
[-0.55, 0.55].forEach((x) => {
  const beam = makeHeadlightBeam();
  beam.position.set(x, 0.72, 1.95); // at the headlight, pointing forward
  beam.rotation.x = 0.06; // dip slightly toward the road
  carBody.add(beam);
});

// Quad round taillights — unmistakably GT-R
const taillightGeometry = new THREE.CylinderGeometry(0.085, 0.085, 0.06, 12);
taillightGeometry.rotateX(Math.PI / 2);
const taillightMaterial = new THREE.MeshStandardMaterial({
  color: 0xff5544,
  emissive: 0xff2211,
  emissiveIntensity: 1.5,
});
[-0.62, -0.38, 0.38, 0.62].forEach((x) => {
  const tail = new THREE.Mesh(taillightGeometry, taillightMaterial);
  tail.position.set(x, 0.72, -1.91);
  carBody.add(tail);
});

// Quad exhaust tips
const exhaustGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.14, 10);
exhaustGeometry.rotateX(Math.PI / 2);
const exhaustMaterial = new THREE.MeshStandardMaterial({
  color: 0x8f98a3,
  metalness: 0.9,
  roughness: 0.3,
});
[-0.56, -0.42, 0.42, 0.56].forEach((x) => {
  const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
  exhaust.position.set(x, 0.38, -1.9);
  carBody.add(exhaust);
});

// Wheels — black multi-spoke rims with red brake calipers. Axle baked along X
// so rotation.x rolls them.
const WHEEL_RADIUS = 0.4;
const WHEEL_WIDTH = 0.32;
const wheelTireGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 22);
wheelTireGeometry.rotateZ(Math.PI / 2);
const rimFaceGeometry = new THREE.CylinderGeometry(
  WHEEL_RADIUS * 0.74,
  WHEEL_RADIUS * 0.74,
  WHEEL_WIDTH * 0.55,
  20
);
rimFaceGeometry.rotateZ(Math.PI / 2);
const spokeGeometry = new THREE.BoxGeometry(0.028, WHEEL_RADIUS * 1.44, 0.05);
const capGeometry = new THREE.CylinderGeometry(0.1, 0.1, WHEEL_WIDTH * 0.62, 10);
capGeometry.rotateZ(Math.PI / 2);
const caliperGeometry = new THREE.BoxGeometry(0.05, 0.2, 0.13);

const wheelTireMaterial = new THREE.MeshStandardMaterial({
  color: 0x0a0c10,
  roughness: 0.95,
  flatShading: true,
});
const rimMaterial = new THREE.MeshStandardMaterial({
  color: 0x15181f,
  metalness: 0.7,
  roughness: 0.4,
  flatShading: true,
});
const spokeMaterial = new THREE.MeshStandardMaterial({
  color: 0x2a2e36,
  metalness: 0.8,
  roughness: 0.45,
  flatShading: true,
});
const capMaterial = new THREE.MeshStandardMaterial({
  color: 0x8a929c,
  metalness: 0.9,
  roughness: 0.3,
});
const caliperMaterial = new THREE.MeshStandardMaterial({
  color: 0xd11f28,
  emissive: 0xd11f28,
  emissiveIntensity: 0.18,
  roughness: 0.5,
});

function makeWheel() {
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(wheelTireGeometry, wheelTireMaterial));
  wheel.add(new THREE.Mesh(rimFaceGeometry, rimMaterial));
  // spokes on the outer face (5 bars → a 10-spoke star)
  const faceX = WHEEL_WIDTH * 0.5;
  for (let i = 0; i < 5; i += 1) {
    const spoke = new THREE.Mesh(spokeGeometry, spokeMaterial);
    spoke.position.x = faceX;
    spoke.rotation.x = (i / 5) * Math.PI; // 5 bars, 36° apart
    wheel.add(spoke);
  }
  wheel.add(new THREE.Mesh(capGeometry, capMaterial));
  return wheel;
}

const wheels = [];
const frontPivots = [];
[
  { x: -0.84, z: 1.22, front: true },
  { x: 0.84, z: 1.22, front: true },
  { x: -0.84, z: -1.22, front: false },
  { x: 0.84, z: -1.22, front: false },
].forEach(({ x, z, front }) => {
  const wheel = makeWheel();
  const pivot = new THREE.Group();
  pivot.position.set(x, WHEEL_RADIUS, z);
  pivot.add(wheel);
  // red brake caliper — fixed to the hub (on the pivot, so it doesn't spin)
  const caliper = new THREE.Mesh(caliperGeometry, caliperMaterial);
  caliper.position.set(0, WHEEL_RADIUS * 0.55, 0);
  pivot.add(caliper);
  car.add(pivot);
  wheels.push(wheel);
  if (front) frontPivots.push(pivot);
});

/* ---------------- driving input ---------------- */
const keys = { forward: false, back: false, left: false, right: false };
const KEYMAP = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

window.addEventListener("keydown", (event) => {
  const action = KEYMAP[event.code];
  if (!action) return;
  if (event.code.startsWith("Arrow")) event.preventDefault();
  keys[action] = true;
});
window.addEventListener("keyup", (event) => {
  const action = KEYMAP[event.code];
  if (action) keys[action] = false;
});

// Virtual joystick (touch devices) — direction-based: the stick points
// where the car should go on screen, regardless of the car's heading.
const joystick = { x: 0, y: 0 };
const joystickEl = document.getElementById("joystick");
const thumbEl = document.getElementById("joystick-thumb");
const JOY_RANGE = 40;

function setJoystick(clientX, clientY) {
  const rect = joystickEl.getBoundingClientRect();
  let dx = clientX - (rect.left + rect.width / 2);
  let dy = clientY - (rect.top + rect.height / 2);
  const len = Math.hypot(dx, dy);
  if (len > JOY_RANGE) {
    dx = (dx / len) * JOY_RANGE;
    dy = (dy / len) * JOY_RANGE;
  }
  thumbEl.style.transform = `translate(${dx}px, ${dy}px)`;
  joystick.x = dx / JOY_RANGE;
  joystick.y = dy / JOY_RANGE;
}

function resetJoystick() {
  joystick.x = 0;
  joystick.y = 0;
  thumbEl.style.transform = "translate(0px, 0px)";
}

let joyPointerId = null;
joystickEl.addEventListener("pointerdown", (event) => {
  joyPointerId = event.pointerId;
  joystickEl.setPointerCapture(event.pointerId);
  setJoystick(event.clientX, event.clientY);
  event.preventDefault();
});
joystickEl.addEventListener("pointermove", (event) => {
  if (event.pointerId === joyPointerId) setJoystick(event.clientX, event.clientY);
});
["pointerup", "pointercancel"].forEach((type) => {
  joystickEl.addEventListener(type, (event) => {
    if (event.pointerId === joyPointerId) {
      joyPointerId = null;
      resetJoystick();
    }
  });
});

/* ---------------- car physics (simple kinematic model) ---------------- */
const MAX_SPEED = 18;
const MAX_REVERSE = 7;
const ACCELERATION = 26;
const STEER_RATE = 2.1;
const GRAVITY = 20;
const LAUNCH_BOOST = 1.3; // arcade kick so ramps actually throw the car

let speed = 0;
let heading = CAR_START.heading;
let steerVisual = 0;
let wheelSpin = 0;
let driveActiveUntil = -1;

// Vertical state, driven entirely by the ramps
let carY = 0; // height above the ground plane
let carVY = 0;
let airborne = false;
let carClimb = 0; // vertical speed while climbing a ramp
let prevSurfaceY = 0;
let carPitch = 0;

function wrapAngle(a) {
  return THREE.MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;
}

// The follow camera never rotates, so screen directions map to fixed world
// directions: stick up = -z, stick right = +x. The car steers toward the
// stick direction; pushing roughly behind the nose backs the car up
// (hysteresis between the two thresholds stops it flip-flopping).
const JOY_DEADZONE = 0.18;
let joyReverse = false;

function joystickInputs() {
  const mag = Math.hypot(joystick.x, joystick.y);
  if (mag < JOY_DEADZONE) {
    joyReverse = false; // each fresh push starts in forward mode
    return null;
  }
  const desired = Math.atan2(joystick.x, joystick.y);
  const diff = wrapAngle(desired - heading);
  if (joyReverse) {
    if (Math.abs(diff) < Math.PI * 0.5) joyReverse = false;
  } else if (Math.abs(diff) > Math.PI * 0.58) {
    joyReverse = true;
  }
  if (!joyReverse) {
    return { throttle: mag, steer: THREE.MathUtils.clamp(diff / 0.5, -1, 1) };
  }
  const back = wrapAngle(diff - Math.PI);
  return { throttle: -mag, steer: -THREE.MathUtils.clamp(back / 0.5, -1, 1) };
}

function driveInputs() {
  const throttle = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const steer = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  if (throttle === 0 && steer === 0) {
    const joy = joystickInputs();
    if (joy) return joy;
  }
  return { throttle, steer };
}

function updateCar(dt, elapsed) {
  const { throttle, steer } = driveInputs();

  if (throttle !== 0 || steer !== 0 || Math.abs(speed) > 2) {
    driveActiveUntil = elapsed + 1.6;
  }

  if (throttle !== 0) {
    speed += throttle * ACCELERATION * dt;
  } else {
    speed *= Math.exp(-2.2 * dt); // coast to a stop
    if (Math.abs(speed) < 0.02) speed = 0;
  }
  speed = THREE.MathUtils.clamp(speed, -MAX_REVERSE, MAX_SPEED);

  // Steering scales with speed (no turning in place), flips in reverse
  const speedFactor = THREE.MathUtils.clamp(speed / 8, -1, 1);
  heading += steer * STEER_RATE * speedFactor * dt;

  car.position.x += Math.sin(heading) * speed * dt;
  car.position.z += Math.cos(heading) * speed * dt;
  car.rotation.y = heading;

  // Keep the car inside the world
  const dist = Math.hypot(car.position.x, car.position.z);
  if (dist > WORLD_RADIUS) {
    car.position.x *= WORLD_RADIUS / dist;
    car.position.z *= WORLD_RADIUS / dist;
    speed *= 0.4;
  }

  // Ramps & jumping. On the ground the car simply sits on the ramp surface;
  // when that surface falls away under it (the lip) it takes off carrying the
  // vertical speed it built up on the slope, then arcs back down under gravity.
  const surfaceY = surfaceHeightAt(car.position.x, car.position.z);
  if (airborne) {
    carVY -= GRAVITY * dt;
    carY += carVY * dt;
    if (carY <= surfaceY) {
      carY = surfaceY;
      carVY = 0;
      airborne = false;
      carClimb = 0;
      speed *= 0.94; // scrub a little speed on touchdown
    }
  } else {
    const rise = surfaceY - prevSurfaceY;
    if (rise < -0.12 && carClimb > 0.5 && Math.abs(speed) > 3) {
      airborne = true;
      carVY = carClimb * LAUNCH_BOOST;
      carY = prevSurfaceY;
    } else {
      carY = surfaceY;
      carClimb = rise > 0 ? rise / dt : 0;
    }
  }
  prevSurfaceY = surfaceY;
  car.position.y = GROUND_Y + carY;

  // Solid obstacles: push the car out and bounce off — but a big enough jump
  // clears them entirely.
  if (carY < 1.2) {
    solidObstacles.forEach((ob) => {
      const dx = car.position.x - ob.x;
      const dz = car.position.z - ob.z;
      const d = Math.hypot(dx, dz);
      const minDist = ob.r + CAR_RADIUS;
      if (d < minDist && d > 0.0001) {
        const push = minDist - d;
        car.position.x += (dx / d) * push;
        car.position.z += (dz / d) * push;
        speed *= -0.3;
      }
    });
  }

  // Knockables: send them flying (also missed when flying over the top)
  if (carY < 1.0) {
    knockables.forEach((item) => {
      if (item.state !== "upright") return;
      const dx = item.mesh.position.x - car.position.x;
      const dz = item.mesh.position.z - car.position.z;
      const d = Math.hypot(dx, dz);
      if (d < CAR_RADIUS + item.r && Math.abs(speed) > 0.5) {
        item.state = "flying";
        const kick = (2 + Math.abs(speed) * 0.55) * item.kick;
        item.vel.set((dx / d) * kick, (2.2 + Math.abs(speed) * 0.14) * item.kick, (dz / d) * kick);
        item.angVel.set(rand(-item.spin, item.spin), 0, rand(-item.spin, item.spin));
        speed *= 0.94;
      }
    });
  }

  // Wheels: roll + steer visual
  wheelSpin += (speed * dt) / WHEEL_RADIUS;
  wheels.forEach((wheel) => {
    wheel.rotation.x = wheelSpin;
  });
  steerVisual += (steer * 0.42 - steerVisual) * Math.min(1, 10 * dt);
  frontPivots.forEach((pivot) => {
    pivot.rotation.y = steerVisual;
  });

  // Subtle body lean into turns
  carBody.rotation.z = -steerVisual * speedFactor * 0.12;

  // Nose up the ramp and through the jump (positive rotation.x points down)
  const pitchTarget = THREE.MathUtils.clamp(
    -Math.atan2(airborne ? carVY : carClimb, Math.max(5, Math.abs(speed))),
    -0.45,
    0.45
  );
  carPitch += (pitchTarget - carPitch) * Math.min(1, 9 * dt);
  carBody.rotation.x = carPitch;
}

function updateKnockables(dt) {
  knockables.forEach((item) => {
    if (item.state !== "flying") return;
    item.vel.y -= 14 * dt;
    item.mesh.position.addScaledVector(item.vel, dt);
    item.mesh.rotation.x += item.angVel.x * dt;
    item.mesh.rotation.z += item.angVel.z * dt;
    if (item.mesh.position.y < item.restY) {
      item.mesh.position.y = item.restY;
      if (Math.abs(item.vel.y) < 1.5) {
        item.state = "down";
        item.vel.set(0, 0, 0);
      } else {
        item.vel.y *= -0.4;
        item.vel.x *= 0.6;
        item.vel.z *= 0.6;
        item.angVel.multiplyScalar(0.6);
      }
    }
  });
}

/* ---------------- minimap ---------------- */
const minimapEl = document.getElementById("minimap");
const mapCtx = minimapEl.getContext("2d");
const MAP_LOGICAL = 132;
{
  const dpr = Math.min(window.devicePixelRatio, 2);
  minimapEl.width = MAP_LOGICAL * dpr;
  minimapEl.height = MAP_LOGICAL * dpr;
  mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const MAP_C = MAP_LOGICAL / 2;
const MAP_SCALE = (MAP_C - 6) / WORLD_RADIUS;

const KNOCKABLE_MAP_COLORS = {
  cone: "rgba(232, 131, 58, 0.85)",
  barrel: "rgba(197, 48, 48, 0.9)",
  crate: "rgba(156, 107, 53, 0.9)",
};

function mapArc(radius, strokeStyle, lineWidth) {
  mapCtx.strokeStyle = strokeStyle;
  mapCtx.lineWidth = lineWidth;
  mapCtx.beginPath();
  mapCtx.arc(MAP_C, MAP_C, radius * MAP_SCALE, 0, Math.PI * 2);
  mapCtx.stroke();
}

// The circuit never moves, so bake its outline into a Path2D once
const MAP_TRACK = new Path2D();
trackPoints.forEach((p, i) => {
  const px = MAP_C + p.x * MAP_SCALE;
  const pz = MAP_C + p.z * MAP_SCALE;
  if (i === 0) MAP_TRACK.moveTo(px, pz);
  else MAP_TRACK.lineTo(px, pz);
});
MAP_TRACK.closePath();
const MAP_START_LINE = [
  placeOnTrack(0, -TRACK_HALF_WIDTH),
  placeOnTrack(0, TRACK_HALF_WIDTH),
];

function drawMinimap() {
  mapCtx.clearRect(0, 0, MAP_LOGICAL, MAP_LOGICAL);

  // World boundary
  mapArc(WORLD_RADIUS, "rgba(148, 163, 184, 0.3)", 1);

  // Track band + centerline
  mapCtx.lineJoin = "round";
  mapCtx.strokeStyle = "rgba(79, 209, 197, 0.16)";
  mapCtx.lineWidth = TRACK_HALF_WIDTH * 2 * MAP_SCALE;
  mapCtx.stroke(MAP_TRACK);
  mapCtx.strokeStyle = "rgba(79, 209, 197, 0.45)";
  mapCtx.lineWidth = 1;
  mapCtx.stroke(MAP_TRACK);

  // Start/finish line
  mapCtx.strokeStyle = "rgba(230, 237, 247, 0.9)";
  mapCtx.lineWidth = 2;
  mapCtx.beginPath();
  mapCtx.moveTo(MAP_C + MAP_START_LINE[0].x * MAP_SCALE, MAP_C + MAP_START_LINE[0].z * MAP_SCALE);
  mapCtx.lineTo(MAP_C + MAP_START_LINE[1].x * MAP_SCALE, MAP_C + MAP_START_LINE[1].z * MAP_SCALE);
  mapCtx.stroke();

  // Jump ramps
  mapCtx.fillStyle = "rgba(246, 173, 85, 0.95)";
  ramps.forEach((r) => {
    mapCtx.beginPath();
    mapCtx.arc(MAP_C + r.x * MAP_SCALE, MAP_C + r.z * MAP_SCALE, 2.4, 0, Math.PI * 2);
    mapCtx.fill();
  });

  // Network hub at the center
  mapCtx.fillStyle = "rgba(79, 209, 197, 0.9)";
  mapCtx.beginPath();
  mapCtx.arc(MAP_C, MAP_C, 3, 0, Math.PI * 2);
  mapCtx.fill();

  // Solid obstacles: rocks as dots, tire stacks as rings
  solidObstacles.forEach((ob) => {
    if (ob.type === "rock") {
      mapCtx.fillStyle = "rgba(148, 163, 184, 0.6)";
      mapCtx.beginPath();
      mapCtx.arc(MAP_C + ob.x * MAP_SCALE, MAP_C + ob.z * MAP_SCALE, Math.max(1.4, ob.r * MAP_SCALE), 0, Math.PI * 2);
      mapCtx.fill();
    } else if (ob.type === "tire") {
      mapCtx.strokeStyle = "rgba(148, 163, 184, 0.8)";
      mapCtx.lineWidth = 1.2;
      mapCtx.beginPath();
      mapCtx.arc(MAP_C + ob.x * MAP_SCALE, MAP_C + ob.z * MAP_SCALE, 2, 0, Math.PI * 2);
      mapCtx.stroke();
    } else if (ob.type === "lamp") {
      mapCtx.fillStyle = "rgba(246, 173, 85, 0.9)";
      mapCtx.beginPath();
      mapCtx.arc(MAP_C + ob.x * MAP_SCALE, MAP_C + ob.z * MAP_SCALE, 1.6, 0, Math.PI * 2);
      mapCtx.fill();
    }
  });

  // Knockables, colored by type
  knockables.forEach((item) => {
    mapCtx.fillStyle = KNOCKABLE_MAP_COLORS[item.type];
    mapCtx.beginPath();
    mapCtx.arc(
      MAP_C + item.mesh.position.x * MAP_SCALE,
      MAP_C + item.mesh.position.z * MAP_SCALE,
      1.4,
      0,
      Math.PI * 2
    );
    mapCtx.fill();
  });

  // The car — triangle pointing along its heading
  mapCtx.save();
  mapCtx.translate(MAP_C + car.position.x * MAP_SCALE, MAP_C + car.position.z * MAP_SCALE);
  mapCtx.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)));
  mapCtx.fillStyle = "#4fd1c5";
  mapCtx.strokeStyle = "rgba(230, 237, 247, 0.9)";
  mapCtx.lineWidth = 1;
  mapCtx.beginPath();
  mapCtx.moveTo(0, -5);
  mapCtx.lineTo(3.4, 3.8);
  mapCtx.lineTo(-3.4, 3.8);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.stroke();
  mapCtx.restore();
}

/* ---------------- interaction state ---------------- */
const pointer = { x: 0, y: 0 };
let scrollRatio = 0;

window.addEventListener("pointermove", (event) => {
  pointer.x = (event.clientX / sizes.width - 0.5) * 2;
  pointer.y = (event.clientY / sizes.height - 0.5) * 2;
});

function readScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  scrollRatio = max > 0 ? window.scrollY / max : 0;
}
window.addEventListener("scroll", readScroll, { passive: true });
readScroll();

window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (reducedMotion) renderScene(0, 0);
});

// Fade page content while driving so the world is visible
let drivingUi = false;
function setDrivingUi(active) {
  if (active === drivingUi) return;
  drivingUi = active;
  document.body.classList.toggle("driving", active);
}

/* ---------------- camera follow ---------------- */
const CAMERA_OFFSET = new THREE.Vector3(0, 6.4, 11.5);
const cameraGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const lookCurrent = new THREE.Vector3(car.position.x, car.position.y + 2.6, car.position.z);

// "Click to start" gate: the scene sits behind a dark spotlight overlay until
// the user clicks. `started` unlocks driving. Reduced motion skips the gate.
let started = reducedMotion;

camera.position.copy(car.position).add(CAMERA_OFFSET);
camera.lookAt(lookCurrent);

const CAMERA_DAMP = 3.2;

function updateCamera(dt) {
  // Feed the car's velocity forward: an exponential lerp chasing a moving
  // target trails it by velocity/damp, which pushed the car off-center at
  // speed (worst when driving across the screen). Aiming that far ahead
  // cancels the steady-state lag while keeping the smoothing.
  const leadX = (Math.sin(heading) * speed) / CAMERA_DAMP;
  const leadZ = (Math.cos(heading) * speed) / CAMERA_DAMP;

  cameraGoal.copy(car.position).add(CAMERA_OFFSET);
  cameraGoal.x += leadX + pointer.x * 1.1;
  cameraGoal.y += -pointer.y * 0.7;
  cameraGoal.z += leadZ;

  lookGoal.set(car.position.x + leadX, car.position.y + 2.6, car.position.z + leadZ);

  const damp = 1 - Math.exp(-CAMERA_DAMP * dt);
  camera.position.lerp(cameraGoal, damp);
  lookCurrent.lerp(lookGoal, damp);
  camera.lookAt(lookCurrent);
}

/* ---------------- render loop ---------------- */
const clock = new THREE.Clock();

let frameCount = 0;
if (import.meta.env.DEV) {
  window.__debug = {
    car,
    keys,
    joystick,
    knockables,
    reducedMotion,
    get speed() {
      return speed;
    },
    get frames() {
      return frameCount;
    },
    step(dt) {
      renderScene(clock.elapsedTime, dt);
    },
  };
}

function renderScene(elapsed, dt) {
  frameCount += 1;
  // Gentle bobbing + pulsing of network nodes
  nodes.forEach((node) => {
    const t = elapsed * node.speed + node.phase;
    node.mesh.position.y = node.base.y + Math.sin(t) * 0.35;
    node.mesh.position.x = node.base.x + Math.cos(t * 0.8) * 0.18;
    node.mesh.rotation.y += node.spin * 0.01;
    node.mesh.scale.setScalar(node.baseScale * (1 + 0.12 * Math.sin(t * 2)));
  });
  updateEdges();

  network.rotation.y = elapsed * 0.045 + scrollRatio * Math.PI * 0.6;
  network.position.y = 2.4 - scrollRatio * 1.1;

  stars.rotation.y = elapsed * 0.008;

  if (dt > 0) {
    // Driving is locked until the user clicks to start; the camera still
    // smooths so the idle framing stays centered on the car.
    if (started) {
      updateCar(dt, elapsed);
      updateKnockables(dt);
      setDrivingUi(elapsed < driveActiveUntil);
    }
    updateCamera(dt);
  }

  drawMinimap();
  renderer.render(scene, camera);
}

if (reducedMotion) {
  updateEdges();
  renderScene(0, 0);
} else {
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    renderScene(clock.elapsedTime, dt);
  });
}

/* ================================================================
   Page behaviour
   ================================================================ */

// "Click to start" opening (Bruno-Simon style): the scene sits dark behind a
// spotlight circle on the car; clicking (or any key / tap) opens the circle
// out from the car to reveal everything and unlocks driving. Runs once.
const introEl = document.getElementById("intro");

// Center the spotlight circle on the car's on-screen position.
function positionSpotlight() {
  if (!introEl) return;
  camera.updateMatrixWorld(true); // also refreshes matrixWorldInverse
  const p = car.position.clone();
  p.y += 0.6; // aim at the car body
  p.project(camera);
  let x = (p.x * 0.5 + 0.5) * 100;
  let y = (-p.y * 0.5 + 0.5) * 100;
  if (!Number.isFinite(x)) x = 50;
  if (!Number.isFinite(y)) y = 58;
  x = Math.min(72, Math.max(28, x));
  y = Math.min(70, Math.max(38, y));
  introEl.style.setProperty("--cx", `${x.toFixed(2)}%`);
  introEl.style.setProperty("--cy", `${y.toFixed(2)}%`);
}

const INTRO_DELAY_MS = 1100; // short loading phase before "Click to start" appears
let ready = reducedMotion;
let revealed = false;

function markReady() {
  if (ready) return;
  ready = true;
  if (introEl) introEl.classList.add("intro-ready"); // swap loader -> hint
}
function startReveal() {
  if (revealed || !ready) return; // can't start until the loading delay passes
  revealed = true;
  started = true; // unlock driving
  if (introEl) introEl.classList.add("intro-started");
  window.removeEventListener("keydown", onIntroKey, true);
}
function onIntroKey(event) {
  if (event.key === "Tab") return; // keep keyboard nav working before start
  startReveal();
}

if (reducedMotion) {
  started = true; // no gate; CSS hides #intro so the scene shows immediately
} else {
  positionSpotlight();
  window.addEventListener("resize", positionSpotlight);
  setTimeout(markReady, INTRO_DELAY_MS);
  if (introEl) introEl.addEventListener("click", startReveal);
  window.addEventListener("keydown", onIntroKey, true);
  window.addEventListener("touchstart", startReveal, { passive: true });
}

// Reveal-on-scroll
const revealables = document.querySelectorAll(".reveal");
if (reducedMotion || !("IntersectionObserver" in window)) {
  revealables.forEach((el) => el.classList.add("visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealables.forEach((el) => observer.observe(el));
}

// Footer year
document.getElementById("year").textContent = new Date().getFullYear();
