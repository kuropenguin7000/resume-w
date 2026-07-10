import * as THREE from "three";
import "./style.css";

/* ================================================================
   Interactive 3D background — a floating "service network".
   Nodes = services, lines = connections. Reacts to mouse & scroll.
   ================================================================ */

const canvas = document.querySelector("#webgl");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070f, 0.045);

const camera = new THREE.PerspectiveCamera(60, sizes.width / sizes.height, 0.1, 100);
camera.position.set(0, 0, 11);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

/* ---------------- lights ---------------- */
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const tealLight = new THREE.PointLight(0x4fd1c5, 55, 60);
tealLight.position.set(6, 4, 6);
scene.add(tealLight);

const amberLight = new THREE.PointLight(0xf6ad55, 35, 60);
amberLight.position.set(-6, -3, 4);
scene.add(amberLight);

/* ---------------- node network ---------------- */
const network = new THREE.Group();
scene.add(network);

const NODE_COUNT = 30;
const SPREAD = 6.5;
const CONNECT_DIST = 3.4;

const rand = (min, max) => min + Math.random() * (max - min);

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
  // Random position in a flattened ellipsoid so it frames the content nicely
  const position = new THREE.Vector3(
    rand(-SPREAD, SPREAD) * 1.4,
    rand(-SPREAD, SPREAD) * 0.75,
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

// Edges: connect nodes closer than CONNECT_DIST
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
  starPositions[i * 3] = rand(-40, 40);
  starPositions[i * 3 + 1] = rand(-40, 40);
  starPositions[i * 3 + 2] = rand(-30, 5);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({
  color: 0x93a1b8,
  size: 0.055,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.7,
});
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

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
  if (reducedMotion) renderScene(0);
});

/* ---------------- render loop ---------------- */
const clock = new THREE.Clock();

function renderScene(elapsed) {
  // Gentle bobbing + pulsing of nodes
  nodes.forEach((node) => {
    const t = elapsed * node.speed + node.phase;
    node.mesh.position.y = node.base.y + Math.sin(t) * 0.35;
    node.mesh.position.x = node.base.x + Math.cos(t * 0.8) * 0.18;
    node.mesh.rotation.y += node.spin * 0.01;
    node.mesh.scale.setScalar(node.baseScale * (1 + 0.12 * Math.sin(t * 2)));
  });
  updateEdges();

  // Whole network drifts and slowly turns with scroll
  network.rotation.y = elapsed * 0.045 + scrollRatio * Math.PI * 0.6;
  network.rotation.x = scrollRatio * 0.35;
  network.position.y = scrollRatio * -1.5;

  stars.rotation.y = elapsed * 0.008;

  // Mouse parallax (eased)
  const targetX = pointer.x * 0.9;
  const targetY = -pointer.y * 0.6;
  camera.position.x += (targetX - camera.position.x) * 0.04;
  camera.position.y += (targetY - camera.position.y) * 0.04;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
}

if (reducedMotion) {
  updateEdges();
  renderScene(0);
} else {
  renderer.setAnimationLoop(() => renderScene(clock.getElapsedTime()));
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
