import * as THREE from "three";
import "./style.css";

/* ================================================================
   Interactive 3D background — a drivable low-poly car on a grid,
   under a floating "service network" (nodes = services).
   Desktop: WASD / arrow keys. Mobile: virtual joystick.
   ================================================================ */

const canvas = document.querySelector("#webgl");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070f, 0.026);

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

const grid = new THREE.GridHelper(320, 160, 0x2a5a5f, 0x11202e);
grid.position.y = GROUND_Y;
scene.add(grid);

// Opaque floor just under the grid so stars don't show below the horizon
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700),
  new THREE.MeshBasicMaterial({ color: 0x05070f })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = GROUND_Y - 0.03;
scene.add(floor);

// A few landmark "rocks" scattered on the ground to drive around
const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0x13273a,
  emissive: 0x4fd1c5,
  emissiveIntensity: 0.08,
  flatShading: true,
  roughness: 0.8,
});
for (let i = 0; i < 14; i += 1) {
  const rock = new THREE.Mesh(rockGeometry, rockMaterial);
  const angle = rand(0, Math.PI * 2);
  const radius = rand(12, 55);
  const s = rand(0.4, 1.6);
  rock.position.set(Math.cos(angle) * radius, GROUND_Y + s * 0.55, Math.sin(angle) * radius);
  rock.scale.setScalar(s);
  rock.rotation.set(rand(0, Math.PI), rand(0, Math.PI), 0);
  scene.add(rock);
}

/* ---------------- node network (floating above) ---------------- */
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
   The car — low-poly, built from primitives, Bruno-Simon style
   ================================================================ */
const car = new THREE.Group();
car.position.set(0, GROUND_Y, 4);
car.rotation.y = Math.PI; // face away from the camera
scene.add(car);

const bodyMaterial = new THREE.MeshStandardMaterial({
  color: 0xf6ad55,
  metalness: 0.25,
  roughness: 0.5,
  flatShading: true,
});
const cabinMaterial = new THREE.MeshStandardMaterial({
  color: 0x16324a,
  emissive: 0x4fd1c5,
  emissiveIntensity: 0.15,
  metalness: 0.3,
  roughness: 0.4,
  flatShading: true,
});
const wheelMaterial = new THREE.MeshStandardMaterial({
  color: 0x11151d,
  roughness: 0.9,
  flatShading: true,
});

const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 2.4), bodyMaterial);
body.position.y = 0.62;
car.add(body);

const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.4, 1.15), cabinMaterial);
cabin.position.set(0, 1.0, -0.2);
car.add(cabin);

const lightGeometry = new THREE.BoxGeometry(0.18, 0.12, 0.08);
const headlightMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff4cc,
  emissive: 0xfff4cc,
  emissiveIntensity: 1.4,
});
const taillightMaterial = new THREE.MeshStandardMaterial({
  color: 0xff5544,
  emissive: 0xff3322,
  emissiveIntensity: 1.2,
});
[-0.42, 0.42].forEach((x) => {
  const head = new THREE.Mesh(lightGeometry, headlightMaterial);
  head.position.set(x, 0.62, 1.21);
  car.add(head);
  const tail = new THREE.Mesh(lightGeometry, taillightMaterial);
  tail.position.set(x, 0.62, -1.21);
  car.add(tail);
});

// Wheels — axle baked along X so rotation.x rolls them
const WHEEL_RADIUS = 0.34;
const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 14);
wheelGeometry.rotateZ(Math.PI / 2);

const wheels = [];
const frontPivots = [];
[
  { x: -0.72, z: 0.82, front: true },
  { x: 0.72, z: 0.82, front: true },
  { x: -0.72, z: -0.82, front: false },
  { x: 0.72, z: -0.82, front: false },
].forEach(({ x, z, front }) => {
  const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
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

// Virtual joystick (touch devices) — MMORPG style
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
const MAX_SPEED = 16;
const MAX_REVERSE = 7;
const ACCELERATION = 24;
const STEER_RATE = 2.1;
const WORLD_RADIUS = 65;

let speed = 0;
let heading = Math.PI;
let steerVisual = 0;
let wheelSpin = 0;

function driveInputs() {
  let throttle = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  let steer = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  if (throttle === 0 && Math.abs(joystick.y) > 0.18) throttle = -joystick.y;
  if (steer === 0 && Math.abs(joystick.x) > 0.18) steer = -joystick.x;
  return { throttle, steer };
}

function updateCar(dt) {
  const { throttle, steer } = driveInputs();

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
  body.rotation.z = -steerVisual * speedFactor * 0.12;
  cabin.rotation.z = body.rotation.z;
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

/* ---------------- camera follow ---------------- */
const CAMERA_OFFSET = new THREE.Vector3(0, 6.4, 11.5);
const cameraGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const lookCurrent = new THREE.Vector3(car.position.x, GROUND_Y + 2.6, car.position.z);

camera.position.copy(car.position).add(CAMERA_OFFSET);
camera.lookAt(lookCurrent);

function updateCamera(dt) {
  cameraGoal.copy(car.position).add(CAMERA_OFFSET);
  cameraGoal.x += pointer.x * 1.1;
  cameraGoal.y += -pointer.y * 0.7;

  lookGoal.set(car.position.x, GROUND_Y + 2.6, car.position.z);

  const damp = 1 - Math.exp(-3.2 * dt);
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
    updateCar(dt);
    updateCamera(dt);
  }

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
