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
scene.fog = new THREE.FogExp2(0x05070f, 0.024);

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
const WORLD_RADIUS = 65;

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
const TRACK_RADIUS = 22;
const TRACK_INNER = 18.5;
const TRACK_OUTER = 25.5;

const flatRing = (inner, outer, color, y, opacity = 1, thetaStart = 0, thetaLength = Math.PI * 2) => {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 96, 1, thetaStart, thetaLength),
    new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  scene.add(mesh);
  return mesh;
};

// Asphalt surface — lit material so headlights and street lamps pool on it
const asphalt = new THREE.Mesh(
  new THREE.RingGeometry(TRACK_INNER, TRACK_OUTER, 96),
  new THREE.MeshStandardMaterial({
    color: 0x0e1a28,
    roughness: 0.9,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  })
);
asphalt.rotation.x = -Math.PI / 2;
asphalt.position.y = GROUND_Y + 0.02;
scene.add(asphalt);

// Edge lines
flatRing(TRACK_INNER - 0.2, TRACK_INNER + 0.1, 0x3f8f8f, GROUND_Y + 0.03);
flatRing(TRACK_OUTER - 0.1, TRACK_OUTER + 0.2, 0x3f8f8f, GROUND_Y + 0.03);

// Dashed centerline
const DASH_COUNT = 24;
for (let i = 0; i < DASH_COUNT; i += 1) {
  const theta = (i / DASH_COUNT) * Math.PI * 2;
  flatRing(TRACK_RADIUS - 0.16, TRACK_RADIUS + 0.16, 0x2c5a74, GROUND_Y + 0.03, 1, theta, 0.1);
}

// Checkered start/finish line (at angle 0 → world position x = TRACK_RADIUS, z = 0)
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
const startLine = new THREE.Mesh(
  new THREE.PlaneGeometry(TRACK_OUTER - TRACK_INNER - 0.2, 1.0),
  new THREE.MeshBasicMaterial({ map: checkerTexture })
);
startLine.rotation.x = -Math.PI / 2;
startLine.position.set(TRACK_RADIUS, GROUND_Y + 0.04, 0);
scene.add(startLine);

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
[TRACK_INNER + 0.2, TRACK_OUTER - 0.2].forEach((x) => {
  const post = new THREE.Mesh(postGeometry, postMaterial);
  post.position.set(x, GROUND_Y + 1.2, 0);
  scene.add(post);
});
const banner = new THREE.Mesh(
  new THREE.BoxGeometry(TRACK_OUTER - TRACK_INNER - 0.1, 0.5, 0.24),
  bannerMaterial
);
banner.position.set(TRACK_RADIUS, GROUND_Y + 2.55, 0);
scene.add(banner);

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
  emissiveIntensity: 0.08,
  flatShading: true,
  roughness: 0.8,
});

function addRock(radius, angle, s) {
  const rock = new THREE.Mesh(rockGeometry, rockMaterial);
  rock.position.set(Math.cos(angle) * radius, GROUND_Y + s * 0.55, Math.sin(angle) * radius);
  rock.scale.setScalar(s);
  rock.rotation.set(rand(0, Math.PI), rand(0, Math.PI), 0);
  scene.add(rock);
  solidObstacles.push({ x: rock.position.x, z: rock.position.z, r: s * 0.95, type: "rock" });
}
for (let i = 0; i < 4; i += 1) addRock(rand(6, 13), rand(0, Math.PI * 2), rand(0.5, 1.1));
for (let i = 0; i < 10; i += 1) addRock(rand(31, 55), rand(0, Math.PI * 2), rand(0.5, 1.7));

// --- gate posts are solid too
solidObstacles.push({ x: TRACK_INNER + 0.2, z: 0, r: 0.45, type: "post" });
solidObstacles.push({ x: TRACK_OUTER - 0.2, z: 0, r: 0.45, type: "post" });

// --- solid tire stacks guarding the corners
const tireGeometry = new THREE.TorusGeometry(0.46, 0.17, 8, 18);
const tireMaterial = new THREE.MeshStandardMaterial({
  color: 0x1a212c,
  roughness: 0.95,
  flatShading: true,
});
function addTireStack(radius, theta) {
  const stack = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
    tire.rotation.x = Math.PI / 2;
    tire.rotation.z = rand(0, Math.PI);
    tire.position.y = 0.17 + i * 0.34;
    stack.add(tire);
  }
  stack.position.set(Math.cos(theta) * radius, GROUND_Y, Math.sin(theta) * radius);
  scene.add(stack);
  solidObstacles.push({ x: stack.position.x, z: stack.position.z, r: 0.75, type: "tire" });
}
addTireStack(27.2, 0.85);
addTireStack(27.4, 2.7);
addTireStack(16.6, 4.0);
addTireStack(27.0, 5.4);

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

function addStreetLamp(radius, theta) {
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

  lamp.position.set(Math.cos(theta) * radius, GROUND_Y, Math.sin(theta) * radius);
  lamp.rotation.y = -theta; // local -x points at the track center
  scene.add(lamp);
  solidObstacles.push({ x: lamp.position.x, z: lamp.position.z, r: 0.5, type: "lamp" });
}
[0.3, 1.75, 3.3, 4.7].forEach((theta) => addStreetLamp(27.3, theta));

// --- knockable traffic cones along the track edges
const coneGeometry = new THREE.ConeGeometry(0.34, 0.8, 10);
const coneMaterial = new THREE.MeshStandardMaterial({
  color: 0xe8833a,
  emissive: 0xe8833a,
  emissiveIntensity: 0.12,
  flatShading: true,
  roughness: 0.6,
});
const CONE_COUNT = 12;
for (let i = 0; i < CONE_COUNT; i += 1) {
  const theta = (i / CONE_COUNT) * Math.PI * 2;
  if (theta < 0.26 || theta > Math.PI * 2 - 0.26) continue; // keep the start gate clear
  const radius = i % 2 === 0 ? TRACK_INNER + 1.1 : TRACK_OUTER - 1.1;
  const mesh = new THREE.Mesh(coneGeometry, coneMaterial);
  mesh.position.set(Math.cos(theta) * radius, GROUND_Y + 0.4, Math.sin(theta) * radius);
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
function addBarrelCluster(radius, theta) {
  const cx = Math.cos(theta) * radius;
  const cz = Math.sin(theta) * radius;
  addBarrel(cx, cz);
  addBarrel(cx + 0.95, cz + 0.2);
  addBarrel(cx + 0.45, cz + 1.0);
}
addBarrelCluster(27.4, 1.85);
addBarrelCluster(16.2, 4.5);

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
  // pyramid across the far side of the track (theta ≈ π)
  const theta = Math.PI + 0.15;
  const cx = Math.cos(theta) * TRACK_RADIUS;
  const cz = Math.sin(theta) * TRACK_RADIUS;
  const tx = -Math.sin(theta); // tangent direction
  const tz = Math.cos(theta);
  addCrate(cx + tx * 0.4, cz + tz * 0.4);
  addCrate(cx - tx * 0.4, cz - tz * 0.4);
  addCrate(cx, cz, GROUND_Y + 1.08);
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
   The car — a low-poly Nissan GT-R in Bayside Blue
   ================================================================ */
const car = new THREE.Group();
car.position.set(TRACK_RADIUS, GROUND_Y, 2.5); // parked at the start line
car.rotation.y = Math.PI;
scene.add(car);

// Everything except the wheels, so the body can lean into turns
const carBody = new THREE.Group();
car.add(carBody);

const paintMaterial = new THREE.MeshStandardMaterial({
  color: 0x2b50d4, // Bayside Blue
  metalness: 0.6,
  roughness: 0.35,
  flatShading: true,
});
const trimMaterial = new THREE.MeshStandardMaterial({
  color: 0x0b0f16,
  roughness: 0.7,
  flatShading: true,
});
const glassMaterial = new THREE.MeshStandardMaterial({
  color: 0x0a1420,
  metalness: 0.6,
  roughness: 0.3,
  emissive: 0x4fd1c5,
  emissiveIntensity: 0.04,
  flatShading: true,
});

// Wide low body
const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.42, 3.8), paintMaterial);
chassis.position.y = 0.6;
carBody.add(chassis);

// Hood bulge (GT-R power dome)
const hood = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 1.0), paintMaterial);
hood.position.set(0, 0.84, 1.15);
carBody.add(hood);

// Fastback greenhouse: tapered 4-sided prism → raked windshield & rear glass
const cabinGeometry = new THREE.CylinderGeometry(0.62, 0.98, 0.44, 4, 1);
cabinGeometry.rotateY(Math.PI / 4);
const cabin = new THREE.Mesh(cabinGeometry, glassMaterial);
cabin.scale.set(1.15, 1, 2.0);
cabin.position.set(0, 1.01, -0.3);
carBody.add(cabin);

// Rear wing — the GT-R signature
const wingPostGeometry = new THREE.BoxGeometry(0.08, 0.26, 0.1);
[-0.55, 0.55].forEach((x) => {
  const wingPost = new THREE.Mesh(wingPostGeometry, trimMaterial);
  wingPost.position.set(x, 0.92, -1.76);
  carBody.add(wingPost);
});
const wing = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.07, 0.44), trimMaterial);
wing.position.set(0, 1.07, -1.8);
carBody.add(wing);

// Front splitter & rear diffuser
const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.1, 0.3), trimMaterial);
splitter.position.set(0, 0.34, 1.8);
carBody.add(splitter);
const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.12, 0.24), trimMaterial);
diffuser.position.set(0, 0.35, -1.82);
carBody.add(diffuser);

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

// Wheels — axle baked along X so rotation.x rolls them; silver hubs
const WHEEL_RADIUS = 0.37;
const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 16);
wheelGeometry.rotateZ(Math.PI / 2);
const hubGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.36, 8);
hubGeometry.rotateZ(Math.PI / 2);
const wheelMaterial = new THREE.MeshStandardMaterial({
  color: 0x11151d,
  roughness: 0.9,
  flatShading: true,
});
const hubMaterial = new THREE.MeshStandardMaterial({
  color: 0x9aa5b1,
  metalness: 0.8,
  roughness: 0.35,
  flatShading: true,
});

const wheels = [];
const frontPivots = [];
[
  { x: -0.82, z: 1.22, front: true },
  { x: 0.82, z: 1.22, front: true },
  { x: -0.82, z: -1.22, front: false },
  { x: 0.82, z: -1.22, front: false },
].forEach(({ x, z, front }) => {
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(wheelGeometry, wheelMaterial));
  wheel.add(new THREE.Mesh(hubGeometry, hubMaterial));
  const pivot = new THREE.Group();
  pivot.position.set(x, WHEEL_RADIUS, z);
  pivot.add(wheel);
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

let speed = 0;
let heading = Math.PI;
let steerVisual = 0;
let wheelSpin = 0;
let driveActiveUntil = -1;

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

  // Solid obstacles: push the car out and bounce off
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

  // Knockables: send them flying
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

function drawMinimap() {
  mapCtx.clearRect(0, 0, MAP_LOGICAL, MAP_LOGICAL);

  // World boundary
  mapArc(WORLD_RADIUS, "rgba(148, 163, 184, 0.3)", 1);

  // Track band + edges
  mapArc(TRACK_RADIUS, "rgba(79, 209, 197, 0.16)", (TRACK_OUTER - TRACK_INNER) * MAP_SCALE);
  mapArc(TRACK_INNER, "rgba(79, 209, 197, 0.5)", 1);
  mapArc(TRACK_OUTER, "rgba(79, 209, 197, 0.5)", 1);

  // Start/finish line (angle 0 → +x on the map)
  mapCtx.strokeStyle = "rgba(230, 237, 247, 0.9)";
  mapCtx.lineWidth = 2;
  mapCtx.beginPath();
  mapCtx.moveTo(MAP_C + TRACK_INNER * MAP_SCALE, MAP_C);
  mapCtx.lineTo(MAP_C + TRACK_OUTER * MAP_SCALE, MAP_C);
  mapCtx.stroke();

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
const lookCurrent = new THREE.Vector3(car.position.x, GROUND_Y + 2.6, car.position.z);

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

  lookGoal.set(car.position.x + leadX, GROUND_Y + 2.6, car.position.z + leadZ);

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
    updateCar(dt, elapsed);
    updateKnockables(dt);
    updateCamera(dt);
    setDrivingUi(elapsed < driveActiveUntil);
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

// Fade out loader once everything is ready
window.addEventListener("load", () => {
  document.getElementById("loader").classList.add("done");
});
// Fallback in case load already fired or hangs on slow assets
setTimeout(() => document.getElementById("loader").classList.add("done"), 2500);

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
