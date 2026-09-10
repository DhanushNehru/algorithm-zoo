#!/usr/bin/env node
/**
 * Algorithm Zoo — exhibit validator.
 *
 * Usage:
 *   node validate.js exhibits/graph-traversal/dijkstra.json   # one file
 *   node validate.js                                          # every exhibit + manifest
 *
 * Zero dependencies. Exits 1 on any problem and says exactly what is wrong,
 * so contributors (and CI) never have to guess.
 */

const fs = require("fs");
const path = require("path");

const WINGS = [
  "sorting", "searching", "graph-traversal", "trees", "hashing",
  "dynamic-programming", "distributed-systems", "string-algorithms", "compression",
];

const ACTIONS = {
  //            needs
  visit:     { target: true },
  highlight: { target: true },
  mark:      { target: true },
  dim:       { target: true },
  remove:    { target: true },
  insert:    { target: true },
  set:       { target: true, value: true },
  move:      { target: true, position: true },
  compare:   { targets: true },
  swap:      { targets: true },
  traverse:  { edge: true },
  relax:     { edge: true },
  link:      { edge: true },
  unlink:    { edge: true },
  clear:     {},
};

const errors = [];
const fail = (file, msg) => errors.push(`  ${file}\n    ✗ ${msg}`);

function isVec3(v) {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && isFinite(n));
}

function validateExhibit(file, raw) {
  let ex;
  try {
    ex = JSON.parse(raw);
  } catch (e) {
    return fail(file, `not valid JSON — ${e.message}`);
  }

  const req = (key, type) => {
    if (!(key in ex)) return fail(file, `missing required field "${key}"`), false;
    if (type && typeof ex[key] !== type) return fail(file, `"${key}" must be a ${type}`), false;
    return true;
  };

  if (req("id", "string")) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(ex.id)) fail(file, `"id" must be kebab-case (got "${ex.id}")`);
    const stem = path.basename(file, ".json");
    if (stem !== ex.id) fail(file, `"id" ("${ex.id}") must match the filename ("${stem}.json")`);
  }

  if (req("wing", "string") && !WINGS.includes(ex.wing)) {
    fail(file, `"wing" must be one of: ${WINGS.join(", ")} (got "${ex.wing}")`);
  }

  req("title", "string");
  req("description", "string");

  if (req("complexity", "object")) {
    if (typeof ex.complexity.time !== "string") fail(file, `"complexity.time" must be a string`);
    if (typeof ex.complexity.space !== "string") fail(file, `"complexity.space" must be a string`);
  }

  if ("layout" in ex && !["graph", "array", "tree"].includes(ex.layout)) {
    fail(file, `"layout" must be "graph", "array" or "tree" (got "${ex.layout}")`);
  }

  // --- nodes ---
  const nodeIds = new Set();
  if (!Array.isArray(ex.nodes) || ex.nodes.length === 0) {
    fail(file, `"nodes" must be a non-empty array`);
  } else {
    ex.nodes.forEach((n, i) => {
      if (typeof n.id !== "string" || !n.id) return fail(file, `nodes[${i}] is missing a string "id"`);
      if (nodeIds.has(n.id)) fail(file, `duplicate node id "${n.id}"`);
      nodeIds.add(n.id);
      if (!isVec3(n.position)) fail(file, `node "${n.id}": "position" must be [x, y, z] numbers`);
      if ("value" in n && typeof n.value !== "number") fail(file, `node "${n.id}": "value" must be a number`);
      if ("label" in n && typeof n.label !== "string") fail(file, `node "${n.id}": "label" must be a string`);
    });
  }

  const nodeRef = (id, where) => {
    if (!nodeIds.has(id)) fail(file, `${where} references unknown node "${id}"`);
  };

  // --- edges ---
  const edgeKeys = new Set();
  (ex.edges || []).forEach((e, i) => {
    if (typeof e.from !== "string" || typeof e.to !== "string") {
      return fail(file, `edges[${i}]: "from" and "to" must be node id strings`);
    }
    nodeRef(e.from, `edges[${i}].from`);
    nodeRef(e.to, `edges[${i}].to`);
    edgeKeys.add(`${e.from}\u0000${e.to}`);
    if (!e.directed) edgeKeys.add(`${e.to}\u0000${e.from}`);
    if ("weight" in e && typeof e.weight !== "number") fail(file, `edges[${i}]: "weight" must be a number`);
  });

  // --- steps ---
  if (!Array.isArray(ex.steps) || ex.steps.length === 0) {
    fail(file, `"steps" must be a non-empty array — an exhibit with no steps has nothing to animate`);
  } else {
    ex.steps.forEach((s, i) => {
      const spec = ACTIONS[s.action];
      if (!spec) return fail(file, `steps[${i}]: unknown action "${s.action}" (valid: ${Object.keys(ACTIONS).join(", ")})`);
      if (typeof s.note !== "string" || !s.note) fail(file, `steps[${i}] (${s.action}): every step needs a "note" — it is the caption shown to visitors`);

      if (spec.target) {
        if (typeof s.target !== "string") fail(file, `steps[${i}]: action "${s.action}" needs a "target" node id`);
        else nodeRef(s.target, `steps[${i}].target`);
      }
      if (spec.targets) {
        if (!Array.isArray(s.targets) || s.targets.length !== 2) {
          fail(file, `steps[${i}]: action "${s.action}" needs "targets": [idA, idB]`);
        } else s.targets.forEach((t) => nodeRef(t, `steps[${i}].targets`));
      }
      if (spec.edge) {
        if (!Array.isArray(s.edge) || s.edge.length !== 2) {
          fail(file, `steps[${i}]: action "${s.action}" needs "edge": [from, to]`);
        } else {
          s.edge.forEach((t) => nodeRef(t, `steps[${i}].edge`));
          const known = edgeKeys.has(`${s.edge[0]}\u0000${s.edge[1]}`);
          if (!known && s.action !== "link") {
            fail(file, `steps[${i}]: ${s.action} on edge [${s.edge[0]}, ${s.edge[1]}], but no such edge is declared in "edges"`);
          }
        }
      }
      if (spec.value && !("value" in s)) fail(file, `steps[${i}]: action "set" needs a "value"`);
      if (spec.position && !isVec3(s.position)) fail(file, `steps[${i}]: action "move" needs "position": [x, y, z]`);
    });
  }

  return ex;
}

function validateManifest(exhibits) {
  const file = "exhibits/manifest.json";
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) return fail(file, "manifest.json is missing");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return fail(file, `not valid JSON — ${e.message}`);
  }
  if (!Array.isArray(manifest.exhibits)) return fail(file, `must have an "exhibits" array of file paths`);

  const listed = new Set(manifest.exhibits);
  for (const rel of listed) {
    if (!fs.existsSync(path.join(__dirname, "exhibits", rel))) {
      fail(file, `lists "${rel}" but exhibits/${rel} does not exist`);
    }
  }
  for (const rel of exhibits) {
    if (!listed.has(rel)) fail(file, `exhibits/${rel} exists but is not listed — add it to manifest.json so the site loads it`);
  }
}

// --- run ---
const args = process.argv.slice(2);
const seenIds = new Map();

if (args.length > 0) {
  for (const f of args) {
    if (!fs.existsSync(f)) { fail(f, "file not found"); continue; }
    validateExhibit(f, fs.readFileSync(f, "utf8"));
  }
} else {
  const root = path.join(__dirname, "exhibits");
  const rels = [];
  for (const wing of fs.readdirSync(root)) {
    const dir = path.join(root, wing);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const rel = `${wing}/${f}`;
      rels.push(rel);
      const ex = validateExhibit(`exhibits/${rel}`, fs.readFileSync(path.join(dir, f), "utf8"));
      if (ex && ex.id) {
        if (seenIds.has(ex.id)) fail(`exhibits/${rel}`, `id "${ex.id}" already used by ${seenIds.get(ex.id)}`);
        seenIds.set(ex.id, `exhibits/${rel}`);
      }
      if (ex && ex.wing && ex.wing !== wing) {
        fail(`exhibits/${rel}`, `file lives in exhibits/${wing}/ but declares wing "${ex.wing}" — move it or fix the field`);
      }
    }
  }
  validateManifest(rels);
}

if (errors.length) {
  console.error(`\nAlgorithm Zoo validator — ${errors.length} problem${errors.length > 1 ? "s" : ""}:\n`);
  console.error(errors.join("\n\n") + "\n");
  process.exit(1);
} else {
  console.log("✓ All exhibits valid. The zoo is open.");
}
