// Algorithm Zoo — schema-driven exhibit renderer.
//
// This file is the whole contract: give it any config that passes validate.js
// and it produces a correct, animated exhibit. It knows nothing about
// quicksort or Dijkstra — only nodes, edges, and the step vocabulary.
// If you are adding an algorithm, you should never need to edit this file.

import * as THREE from "three";

const COLOR = {
  body: new THREE.Color(0x2a2f3a),
  bodyEdge: new THREE.Color(0x3a4150),
  amber: new THREE.Color(0xffac38),
  red: new THREE.Color(0xff4632),
  label: "#ece7db",
  labelDim: "rgba(236,231,219,0.25)",
};

// Per-action animation duration (ms) at 1× speed.
const DURATION = {
  visit: 420, highlight: 620, compare: 620, swap: 760, move: 760,
  set: 420, traverse: 520, relax: 640, insert: 560, remove: 480,
  link: 480, unlink: 380, mark: 460, dim: 320, clear: 380,
};
const GAP = 240; // pause between steps at 1× speed

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function makeLabelSprite(text, { dim = false, scale = 1 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.font = "600 92px Archivo, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = dim ? COLOR.labelDim : COLOR.label;
  ctx.fillText(text, 256, 84);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.9 * scale, 0.6 * scale, 1);
  return sprite;
}

function redrawLabel(sprite, text, dim) {
  const canvas = sprite.material.map.image;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "600 92px Archivo, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = dim ? COLOR.labelDim : COLOR.label;
  ctx.fillText(text, 256, 84);
  sprite.material.map.needsUpdate = true;
}

export class Exhibit {
  /**
   * @param {object} config  — exhibit JSON (already validated)
   * @param {object} opts    — { wingColor: THREE.Color, origin: THREE.Vector3 }
   */
  constructor(config, opts) {
    this.config = config;
    this.wingColor = opts.wingColor.clone();
    this.group = new THREE.Group();
    this.group.position.copy(opts.origin);

    this.nodes = new Map();   // id -> record
    this.edges = new Map();   // key -> record
    this.tweens = [];
    this.pulses = [];
    this.playing = false;
    this.speed = 1;
    this.stepIndex = 0;       // next step to apply
    this.stepTimer = 0;
    this.onCaption = () => {};
    this.onProgress = () => {};
    this.onFinished = () => {};

    this.#build();
  }

  // ---------- scene construction ----------

  #build() {
    const isArray = this.config.layout === "array";
    for (const n of this.config.nodes) {
      const g = new THREE.Group();
      const pos = new THREE.Vector3(...n.position);
      g.position.copy(pos);

      let mesh;
      if (isArray) {
        const h = 0.5 + (typeof n.value === "number" ? n.value * 0.26 : 0.6);
        const geo = new THREE.BoxGeometry(0.92, h, 0.92);
        geo.translate(0, h / 2, 0);
        mesh = new THREE.Mesh(geo, this.#nodeMaterial());
        mesh.userData.height = h;
      } else {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 24), this.#nodeMaterial());
      }
      mesh.castShadow = true;
      g.add(mesh);

      const labelText = n.label ?? n.id;
      const label = makeLabelSprite(labelText);
      label.position.y = isArray ? (mesh.userData.height + 0.55) : 0.85;
      g.add(label);

      if (n.hidden) g.visible = false;

      this.group.add(g);
      this.nodes.set(n.id, {
        id: n.id, group: g, mesh, label,
        labelText, pos, hidden: !!n.hidden,
        state: "base", // base | visited | marked | dimmed
      });
    }

    for (const e of this.config.edges || []) {
      const key = this.#edgeKey(e.from, e.to);
      if (this.edges.has(key)) continue;
      const mat = new THREE.MeshStandardMaterial({
        color: COLOR.bodyEdge, emissive: 0x000000, roughness: 0.6, metalness: 0.1,
        transparent: true, opacity: 0.9,
      });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 10, 1, true), mat);
      const rec = { from: e.from, to: e.to, directed: !!e.directed, mesh, hidden: !!e.hidden, state: "base", arrow: null, weightSprite: null };
      if (e.directed) {
        rec.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 12), mat);
        this.group.add(rec.arrow);
      }
      if (typeof e.weight === "number") {
        rec.weightSprite = makeLabelSprite(String(e.weight), { dim: true, scale: 0.7 });
        this.group.add(rec.weightSprite);
      }
      mesh.visible = !rec.hidden;
      if (rec.arrow) rec.arrow.visible = !rec.hidden;
      if (rec.weightSprite) rec.weightSprite.visible = !rec.hidden;
      this.group.add(mesh);
      this.edges.set(key, rec);
    }
    this.#layoutEdges();
    this.onProgress(0, this.config.steps.length);
    this.onCaption(`${this.config.title} — press play`);
  }

  #nodeMaterial() {
    return new THREE.MeshStandardMaterial({
      color: COLOR.body.clone(), emissive: 0x000000, emissiveIntensity: 1,
      roughness: 0.45, metalness: 0.15, transparent: true, opacity: 1,
    });
  }

  #edgeKey(a, b) {
    const e = (this.config.edges || []).find(
      (x) => (x.from === a && x.to === b) || (!x.directed && x.from === b && x.to === a)
    );
    if (e) return `${e.from}→${e.to}`;
    return `${a}→${b}`;
  }

  #layoutEdges() {
    const up = new THREE.Vector3(0, 1, 0);
    for (const rec of this.edges.values()) {
      const a = this.nodes.get(rec.from).group.position;
      const b = this.nodes.get(rec.to).group.position;
      const aY = a.clone(); const bY = b.clone();
      // for array blocks anchor edge midway up; for spheres node centers already fine
      const dir = new THREE.Vector3().subVectors(bY, aY);
      const len = dir.length();
      rec.mesh.position.copy(aY).addScaledVector(dir, 0.5);
      rec.mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      rec.mesh.scale.set(1, Math.max(len - 0.6, 0.05), 1);
      if (rec.arrow) {
        rec.arrow.position.copy(bY).addScaledVector(dir.clone().normalize(), -0.5);
        rec.arrow.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      }
      if (rec.weightSprite) {
        rec.weightSprite.position.copy(aY).addScaledVector(dir, 0.5).add(new THREE.Vector3(0, 0.35, 0));
      }
    }
  }

  // ---------- playback API ----------

  play() {
    if (this.stepIndex >= this.config.steps.length) this.reset();
    this.playing = true;
    if (this.stepTimer <= 0) this.stepTimer = 0.01;
  }
  pause() { this.playing = false; }
  setSpeed(x) { this.speed = x; }

  stepForward() {
    this.playing = false;
    this.#finishTweens();
    if (this.stepIndex < this.config.steps.length) {
      this.#applyStep(this.config.steps[this.stepIndex], true);
      this.stepIndex++;
      this.onProgress(this.stepIndex, this.config.steps.length);
    }
  }

  stepBack() {
    this.playing = false;
    const target = Math.max(0, this.stepIndex - 1);
    this.#resetVisuals();
    for (let i = 0; i < target; i++) this.#applyStep(this.config.steps[i], false);
    this.#layoutEdges();
    this.stepIndex = target;
    this.onProgress(this.stepIndex, this.config.steps.length);
    this.onCaption(target > 0 ? this.config.steps[target - 1].note : `${this.config.title} — press play`);
  }

  reset() {
    this.playing = false;
    this.#resetVisuals();
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.onProgress(0, this.config.steps.length);
    this.onCaption(`${this.config.title} — press play`);
  }

  #resetVisuals() {
    this.tweens = [];
    this.pulses = [];
    for (const [i, n] of this.config.nodes.entries()) {
      const rec = this.nodes.get(n.id);
      rec.pos = new THREE.Vector3(...n.position);
      rec.group.position.copy(rec.pos);
      rec.group.scale.setScalar(1);
      rec.group.visible = !n.hidden;
      rec.hidden = !!n.hidden;
      rec.state = "base";
      rec.mesh.material.emissive.set(0x000000);
      rec.mesh.material.opacity = 1;
      if (rec.labelText !== (n.label ?? n.id)) {
        rec.labelText = n.label ?? n.id;
        redrawLabel(rec.label, rec.labelText, false);
      } else {
        redrawLabel(rec.label, rec.labelText, false);
      }
    }
    for (const e of this.config.edges || []) {
      const rec = this.edges.get(this.#edgeKey(e.from, e.to));
      rec.hidden = !!e.hidden;
      rec.state = "base";
      rec.mesh.visible = !rec.hidden;
      rec.mesh.material.emissive.set(0x000000);
      rec.mesh.material.opacity = 0.9;
      if (rec.arrow) rec.arrow.visible = !rec.hidden;
      if (rec.weightSprite) rec.weightSprite.visible = !rec.hidden;
    }
    this.#layoutEdges();
  }

  // ---------- step engine ----------

  #applyStep(step, animate) {
    this.onCaption(step.note);
    const S = this.speed;
    const node = (id) => this.nodes.get(id);
    const edge = (pair) => this.edges.get(this.#edgeKey(pair[0], pair[1]));

    switch (step.action) {
      case "visit": {
        const r = node(step.target);
        r.state = r.state === "marked" ? "marked" : "visited";
        this.#setNodeState(r, animate);
        if (animate) this.#pulse(r.mesh, COLOR.amber, DURATION.visit / S);
        break;
      }
      case "highlight": {
        const r = node(step.target);
        if (animate) this.#pulse(r.mesh, COLOR.red, DURATION.highlight / S);
        break;
      }
      case "compare": {
        for (const id of step.targets) {
          const r = node(id);
          if (animate) this.#pulse(r.mesh, COLOR.red, DURATION.compare / S);
        }
        break;
      }
      case "swap": {
        const a = node(step.targets[0]);
        const b = node(step.targets[1]);
        const pa = a.pos.clone(); const pb = b.pos.clone();
        a.pos.copy(pb); b.pos.copy(pa);
        if (animate) {
          this.#tweenPos(a.group, pb, DURATION.swap / S, 0.7);
          this.#tweenPos(b.group, pa, DURATION.swap / S, -0.7);
          this.#pulse(a.mesh, COLOR.amber, DURATION.swap / S);
          this.#pulse(b.mesh, COLOR.amber, DURATION.swap / S);
        } else {
          a.group.position.copy(pb); b.group.position.copy(pa);
        }
        break;
      }
      case "move": {
        const r = node(step.target);
        const dest = new THREE.Vector3(...step.position);
        r.pos.copy(dest);
        if (animate) this.#tweenPos(r.group, dest, DURATION.move / S, 0.4);
        else r.group.position.copy(dest);
        break;
      }
      case "set": {
        const r = node(step.target);
        r.labelText = String(step.value);
        redrawLabel(r.label, r.labelText, r.state === "dimmed");
        if (animate) this.#pulse(r.mesh, COLOR.amber, DURATION.set / S);
        break;
      }
      case "traverse": {
        const r = edge(step.edge);
        r.state = "lit";
        r.mesh.material.emissive.copy(COLOR.amber);
        r.mesh.material.emissiveIntensity = 0.55;
        if (animate) this.#pulse(r.mesh, COLOR.amber, DURATION.traverse / S, 1.1);
        break;
      }
      case "relax": {
        const r = edge(step.edge);
        if (animate) this.#pulse(r.mesh, COLOR.red, DURATION.relax / S, 1.1);
        break;
      }
      case "insert": {
        const r = node(step.target);
        r.hidden = false;
        r.group.visible = true;
        r.state = "visited";
        this.#setNodeState(r, animate);
        if (animate) {
          r.group.scale.setScalar(0.01);
          this.#tweenScale(r.group, 1, DURATION.insert / S);
          this.#pulse(r.mesh, COLOR.amber, DURATION.insert / S);
        } else {
          r.group.scale.setScalar(1);
        }
        break;
      }
      case "remove": {
        const r = node(step.target);
        r.hidden = true;
        if (animate) this.#tweenScale(r.group, 0.01, DURATION.remove / S, () => (r.group.visible = false));
        else r.group.visible = false;
        break;
      }
      case "link": {
        let r = edge(step.edge);
        if (!r) break;
        r.hidden = false;
        r.mesh.visible = true;
        if (r.arrow) r.arrow.visible = true;
        if (r.weightSprite) r.weightSprite.visible = true;
        if (animate) this.#pulse(r.mesh, COLOR.amber, DURATION.link / S, 1.1);
        break;
      }
      case "unlink": {
        const r = edge(step.edge);
        r.hidden = true;
        r.mesh.visible = false;
        if (r.arrow) r.arrow.visible = false;
        if (r.weightSprite) r.weightSprite.visible = false;
        break;
      }
      case "mark": {
        const r = node(step.target);
        r.state = "marked";
        this.#setNodeState(r, animate);
        if (animate) this.#pulse(r.mesh, this.wingColor, DURATION.mark / S);
        break;
      }
      case "dim": {
        const r = node(step.target);
        r.state = "dimmed";
        this.#setNodeState(r, animate);
        break;
      }
      case "clear": {
        for (const r of this.nodes.values()) {
          if (r.state !== "marked") { r.state = "base"; this.#setNodeState(r, false); }
        }
        break;
      }
    }
  }

  #setNodeState(r) {
    const m = r.mesh.material;
    switch (r.state) {
      case "base":
        m.emissive.set(0x000000); m.opacity = 1;
        redrawLabel(r.label, r.labelText, false);
        break;
      case "visited":
        m.emissive.copy(COLOR.amber); m.emissiveIntensity = 0.38; m.opacity = 1;
        redrawLabel(r.label, r.labelText, false);
        break;
      case "marked":
        m.emissive.copy(this.wingColor); m.emissiveIntensity = 0.6; m.opacity = 1;
        redrawLabel(r.label, r.labelText, false);
        break;
      case "dimmed":
        m.emissive.set(0x000000); m.opacity = 0.14;
        redrawLabel(r.label, r.labelText, true);
        break;
    }
  }

  // ---------- animation primitives ----------

  #tweenPos(obj, dest, ms, arcZ = 0) {
    this.tweens.push({
      kind: "pos", obj, from: obj.position.clone(), to: dest.clone(),
      arcZ, t: 0, dur: ms,
    });
  }
  #tweenScale(obj, target, ms, onDone) {
    this.tweens.push({ kind: "scale", obj, from: obj.scale.x, to: target, t: 0, dur: ms, onDone });
  }
  #pulse(mesh, color, ms, peak = 0.95) {
    this.pulses.push({ mesh, color: color.clone(), t: 0, dur: ms, peak, baseEmissive: mesh.material.emissive.clone(), baseIntensity: mesh.material.emissiveIntensity });
  }
  #finishTweens() {
    for (const tw of this.tweens) {
      if (tw.kind === "pos") tw.obj.position.copy(tw.to);
      else tw.obj.scale.setScalar(tw.to);
      tw.onDone && tw.onDone();
    }
    this.tweens = [];
    this.pulses = [];
    this.#layoutEdges();
  }

  // ---------- per-frame update ----------

  update(dtMs) {
    // playback scheduler
    if (this.playing) {
      this.stepTimer -= dtMs;
      if (this.stepTimer <= 0) {
        if (this.stepIndex < this.config.steps.length) {
          const step = this.config.steps[this.stepIndex];
          this.#applyStep(step, true);
          this.stepIndex++;
          this.onProgress(this.stepIndex, this.config.steps.length);
          this.stepTimer = (DURATION[step.action] + GAP) / this.speed;
        } else {
          this.playing = false;
          this.onFinished();
        }
      }
    }

    // tweens
    let moved = false;
    this.tweens = this.tweens.filter((tw) => {
      tw.t += dtMs;
      const k = easeInOut(Math.min(tw.t / tw.dur, 1));
      if (tw.kind === "pos") {
        tw.obj.position.lerpVectors(tw.from, tw.to, k);
        if (tw.arcZ) tw.obj.position.z += Math.sin(k * Math.PI) * tw.arcZ;
        moved = true;
      } else {
        const s = tw.from + (tw.to - tw.from) * k;
        tw.obj.scale.setScalar(s);
      }
      if (tw.t >= tw.dur) { tw.onDone && tw.onDone(); return false; }
      return true;
    });
    if (moved) this.#layoutEdges();

    // pulses
    this.pulses = this.pulses.filter((p) => {
      p.t += dtMs;
      const k = Math.min(p.t / p.dur, 1);
      const glow = Math.sin(k * Math.PI) * p.peak;
      p.mesh.material.emissive.copy(p.baseEmissive).lerp(p.color, Math.min(glow, 1));
      p.mesh.material.emissiveIntensity = Math.max(p.baseIntensity, glow);
      if (k >= 1) {
        p.mesh.material.emissive.copy(p.baseEmissive);
        p.mesh.material.emissiveIntensity = p.baseIntensity;
        return false;
      }
      return true;
    });
  }

  // ---------- teardown ----------

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    this.group.removeFromParent();
  }

  /** Rough radius so the camera knows how far back to stand. */
  boundingRadius() {
    let r = 2;
    for (const n of this.config.nodes) {
      r = Math.max(r, Math.hypot(n.position[0], n.position[2]) + 1.5, Math.abs(n.position[1]) + 1.5);
    }
    return r;
  }
}
