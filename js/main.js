// Algorithm Zoo — site shell: zoo layout, camera, UI. Exhibit rendering
// lives entirely in renderer.js; this file never inspects algorithm data
// beyond metadata (title, wing, description).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Exhibit } from "./renderer.js";

// ---------------------------------------------------------------- wings

export const WINGS = [
  { id: "sorting",             name: "Sorting",             color: 0xffac38 },
  { id: "searching",           name: "Searching",           color: 0x3fd8c7 },
  { id: "graph-traversal",     name: "Graph Traversal",     color: 0xff4632 },
  { id: "trees",               name: "Trees",               color: 0x74d47f },
  { id: "hashing",             name: "Hashing",             color: 0xa98bff },
  { id: "dynamic-programming", name: "Dynamic Programming", color: 0xffd166 },
  { id: "distributed-systems", name: "Distributed Systems", color: 0x4dc3ff },
  { id: "string-algorithms",   name: "String Algorithms",   color: 0xff6fb5 },
  { id: "compression",         name: "Compression",         color: 0xff8a3d },
];

const RING_RADIUS = 30;
const wingCenter = (i) => {
  const a = (i / WINGS.length) * Math.PI * 2 - Math.PI / 2;
  return new THREE.Vector3(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS);
};

// ---------------------------------------------------------------- scene

const canvas = document.getElementById("zoo");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d13);
scene.fog = new THREE.Fog(0x0a0d13, 45, 120);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
const OVERVIEW_POS = new THREE.Vector3(0, 38, 52);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);
camera.position.copy(OVERVIEW_POS);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(OVERVIEW_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 4;
controls.maxDistance = 90;

scene.add(new THREE.AmbientLight(0x9aa4bd, 0.5));
const keyLight = new THREE.DirectionalLight(0xfff2df, 1.1);
keyLight.position.set(18, 30, 12);
scene.add(keyLight);

// floor: one vast dark disc + a faint radial ring per wing
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(90, 96).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x0d1017, roughness: 0.95, metalness: 0 })
);
floor.position.y = -0.25;
scene.add(floor);

// wing platforms
const platformById = new Map();
WINGS.forEach((wing, i) => {
  const center = wingCenter(i);
  const g = new THREE.Group();
  g.position.copy(center);

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(7.5, 7.9, 0.35, 64),
    new THREE.MeshStandardMaterial({ color: 0x151a24, roughness: 0.85 })
  );
  disc.position.y = -0.05;
  g.add(disc);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(7.5, 0.05, 10, 96).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: wing.color, emissive: wing.color, emissiveIntensity: 0.5, roughness: 0.4 })
  );
  rim.position.y = 0.14;
  g.add(rim);

  const lamp = new THREE.PointLight(wing.color, 60, 26, 1.9);
  lamp.position.y = 7.5;
  g.add(lamp);

  // wing name — canvas sprite, faces camera
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 192;
  const ctx = c.getContext("2d");
  ctx.font = "500 84px Newsreader, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e9e4d8";
  ctx.fillText(wing.name, 512, 96);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sign.scale.set(9, 1.7, 1);
  sign.position.y = 6.2;
  g.add(sign);

  scene.add(g);
  platformById.set(wing.id, { wing, center, group: g, rim, lamp, sign });
});

// ---------------------------------------------------------------- camera glide

let glide = null; // { fromPos, toPos, fromTarget, toTarget, t, dur }
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function glideTo(pos, target, dur = 1700) {
  glide = {
    fromPos: camera.position.clone(), toPos: pos.clone(),
    fromTarget: controls.target.clone(), toTarget: target.clone(),
    t: 0, dur,
  };
  controls.enabled = false;
}

// ---------------------------------------------------------------- exhibit lifecycle

let manifest = [];
let active = null;      // { exhibit, config, wing }
let dimOthers = 0;      // 0..1, dims non-active platforms while viewing

async function loadManifest() {
  const res = await fetch("exhibits/manifest.json");
  const { exhibits } = await res.json();
  const configs = await Promise.all(
    exhibits.map(async (rel) => (await fetch(`exhibits/${rel}`)).json())
  );
  manifest = configs;
  buildSidebar(configs);
  updateEmptyWingSigns(configs);
}

function updateEmptyWingSigns(configs) {
  const populated = new Set(configs.map((c) => c.wing));
  for (const [id, p] of platformById) {
    if (!populated.has(id)) {
      p.rim.material.emissiveIntensity = 0.12;
      p.lamp.intensity = 14;
      p.sign.material.opacity = 0.35;
    }
  }
}

function openExhibit(config) {
  closeExhibit();
  const wingIdx = WINGS.findIndex((w) => w.id === config.wing);
  const wing = WINGS[wingIdx];
  const center = wingCenter(wingIdx);
  const origin = center.clone().add(new THREE.Vector3(0, 0.6, 0));

  const exhibit = new Exhibit(config, { wingColor: new THREE.Color(wing.color), origin });
  scene.add(exhibit.group);
  active = { exhibit, config, wing };

  // camera: stand back proportionally to exhibit size, slightly outside the ring
  const r = exhibit.boundingRadius();
  const outward = center.clone().normalize();
  const camPos = center.clone()
    .addScaledVector(outward, r * 1.5 + 5.5)
    .add(new THREE.Vector3(0, r * 0.9 + 3.4, 0));
  glideTo(camPos, origin.clone().add(new THREE.Vector3(0, 1.0, 0)));

  // UI
  exhibit.onCaption = (t) => (ui.caption.textContent = t);
  exhibit.onProgress = (i, n) => {
    ui.progressFill.style.width = `${(i / n) * 100}%`;
    ui.progressText.textContent = `${i} / ${n}`;
  };
  exhibit.onFinished = () => setPlayIcon(false);
  ui.placard.hidden = false;
  ui.playbar.hidden = false;
  ui.title.textContent = config.title;
  ui.wingTag.textContent = wing.name;
  ui.wingTag.style.color = `#${wing.color.toString(16).padStart(6, "0")}`;
  ui.time.textContent = config.complexity.time;
  ui.space.textContent = config.complexity.space;
  ui.desc.textContent = config.description;
  setPlayIcon(false);
  document.querySelectorAll(".exhibit-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.id === config.id)
  );
}

function closeExhibit() {
  if (!active) return;
  active.exhibit.dispose();
  active = null;
  ui.placard.hidden = true;
  ui.playbar.hidden = true;
  document.querySelectorAll(".exhibit-btn").forEach((b) => b.classList.remove("active"));
}

function backToOverview() {
  closeExhibit();
  glideTo(OVERVIEW_POS, OVERVIEW_TARGET);
}

// ---------------------------------------------------------------- UI

const ui = {
  sidebar: document.getElementById("index-list"),
  placard: document.getElementById("placard"),
  playbar: document.getElementById("playbar"),
  title: document.getElementById("ex-title"),
  wingTag: document.getElementById("ex-wing"),
  time: document.getElementById("ex-time"),
  space: document.getElementById("ex-space"),
  desc: document.getElementById("ex-desc"),
  caption: document.getElementById("ex-caption"),
  progressFill: document.getElementById("progress-fill"),
  progressText: document.getElementById("progress-text"),
  playBtn: document.getElementById("btn-play"),
};

function buildSidebar(configs) {
  ui.sidebar.innerHTML = "";
  for (const wing of WINGS) {
    const inWing = configs.filter((c) => c.wing === wing.id);
    const section = document.createElement("section");
    section.className = "wing-section";
    const head = document.createElement("h2");
    head.innerHTML = `<span class="dot" style="background:#${wing.color.toString(16).padStart(6, "0")}"></span>${wing.name}`;
    if (inWing.length === 0) {
      head.classList.add("empty");
      const note = document.createElement("span");
      note.className = "count";
      note.textContent = "opening soon";
      head.appendChild(note);
      section.appendChild(head);
    } else {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = inWing.length;
      head.appendChild(count);
      section.appendChild(head);
      for (const c of inWing) {
        const btn = document.createElement("button");
        btn.className = "exhibit-btn";
        btn.dataset.id = c.id;
        btn.textContent = c.title;
        btn.addEventListener("click", () => openExhibit(c));
        section.appendChild(btn);
      }
    }
    ui.sidebar.appendChild(section);
  }
}

function setPlayIcon(playing) {
  ui.playBtn.textContent = playing ? "⏸" : "▶";
  ui.playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
}

document.getElementById("btn-play").addEventListener("click", () => {
  if (!active) return;
  if (active.exhibit.playing) { active.exhibit.pause(); setPlayIcon(false); }
  else { active.exhibit.play(); setPlayIcon(true); }
});
document.getElementById("btn-step-fwd").addEventListener("click", () => { active?.exhibit.stepForward(); setPlayIcon(false); });
document.getElementById("btn-step-back").addEventListener("click", () => { active?.exhibit.stepBack(); setPlayIcon(false); });
document.getElementById("btn-reset").addEventListener("click", () => { active?.exhibit.reset(); setPlayIcon(false); });
document.getElementById("speed").addEventListener("change", (e) => active?.exhibit.setSpeed(parseFloat(e.target.value)));
document.getElementById("btn-overview").addEventListener("click", backToOverview);

addEventListener("keydown", (e) => {
  if (!active || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.code === "Space") { e.preventDefault(); document.getElementById("btn-play").click(); }
  if (e.code === "ArrowRight") document.getElementById("btn-step-fwd").click();
  if (e.code === "ArrowLeft") document.getElementById("btn-step-back").click();
  if (e.code === "Escape") backToOverview();
});

// ---------------------------------------------------------------- resize + loop

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  resize();
  const dt = Math.min(clock.getDelta(), 0.05) * 1000;

  if (glide) {
    glide.t += reducedMotion ? glide.dur : dt;
    const k = easeInOut(Math.min(glide.t / glide.dur, 1));
    camera.position.lerpVectors(glide.fromPos, glide.toPos, k);
    controls.target.lerpVectors(glide.fromTarget, glide.toTarget, k);
    if (glide.t >= glide.dur) { glide = null; controls.enabled = true; }
  }

  // dim non-active wings while an exhibit is open
  const targetDim = active ? 1 : 0;
  dimOthers += (targetDim - dimOthers) * Math.min(dt / 300, 1);
  for (const [id, p] of platformById) {
    const isActive = active && active.config.wing === id;
    const base = p.sign.material.opacity <= 0.36 && !isActive ? 14 : 60; // keep empty wings dim
    p.lamp.intensity = isActive ? 80 : base * (1 - dimOthers * 0.65);
  }

  active?.exhibit.update(reducedMotion ? 1e6 : dt);
  controls.update();
  renderer.render(scene, camera);
}

loadManifest().then(tick).catch((err) => {
  document.getElementById("load-error").hidden = false;
  document.getElementById("load-error").textContent =
    `Could not load exhibits — ${err.message}. Run a local server (npx serve or python3 -m http.server) rather than opening index.html directly.`;
});
