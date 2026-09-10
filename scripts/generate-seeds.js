#!/usr/bin/env node
/**
 * Generates the seed exhibits by actually running each algorithm and
 * recording its trace as schema steps. Re-run any time: node scripts/generate-seeds.js
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "exhibits");
const write = (wing, id, data) => {
  fs.writeFileSync(path.join(OUT, wing, `${id}.json`), JSON.stringify(data, null, 2) + "\n");
  console.log(`  wrote exhibits/${wing}/${id}.json (${data.steps.length} steps)`);
};

// ---------- shared helpers ----------
const arrayNodes = (values, gap = 1.5) =>
  values.map((v, i) => ({
    id: `n${i}`,
    position: [(i - (values.length - 1) / 2) * gap, 0, 0],
    value: v,
    label: String(v),
  }));

// ---------- SORTING ----------
function bubbleSort() {
  const values = [7, 3, 9, 1, 6, 4, 8, 2];
  const nodes = arrayNodes(values);
  const a = values.slice();
  const pos = values.map((_, i) => i); // pos[slot] = node index occupying slot
  const steps = [];
  for (let end = a.length - 1; end > 0; end--) {
    let swapped = false;
    for (let i = 0; i < end; i++) {
      steps.push({ action: "compare", targets: [`n${pos[i]}`, `n${pos[i + 1]}`], note: `Compare ${a[i]} and ${a[i + 1]}` });
      if (a[i] > a[i + 1]) {
        steps.push({ action: "swap", targets: [`n${pos[i]}`, `n${pos[i + 1]}`], note: `${a[i]} > ${a[i + 1]} — swap` });
        [a[i], a[i + 1]] = [a[i + 1], a[i]];
        [pos[i], pos[i + 1]] = [pos[i + 1], pos[i]];
        swapped = true;
      }
    }
    steps.push({ action: "mark", target: `n${pos[end]}`, note: `${a[end]} is in its final place` });
    if (!swapped) {
      for (let i = 0; i < end; i++) steps.push({ action: "mark", target: `n${pos[i]}`, note: `No swaps this pass — everything left of ${a[end]} is already sorted` });
      break;
    }
  }
  steps.push({ action: "mark", target: `n${pos[0]}`, note: "Sorted — largest values bubbled to the right each pass" });
  return {
    id: "bubble-sort", wing: "sorting", title: "Bubble Sort",
    complexity: { time: "O(n²)", space: "O(1)" },
    description: "Repeatedly steps through the list, swapping adjacent elements that are out of order. Large values bubble toward the end on every pass.",
    layout: "array", nodes, steps,
  };
}

function insertionSort() {
  const values = [5, 2, 9, 1, 7, 3];
  const nodes = arrayNodes(values);
  const a = values.slice();
  const pos = values.map((_, i) => i);
  const steps = [];
  steps.push({ action: "mark", target: `n${pos[0]}`, note: `${a[0]} alone is a sorted prefix of length 1` });
  for (let i = 1; i < a.length; i++) {
    const keyNode = pos[i];
    steps.push({ action: "highlight", target: `n${keyNode}`, note: `Take ${a[i]} — insert it into the sorted prefix` });
    let j = i;
    while (j > 0 && a[j - 1] > a[j]) {
      steps.push({ action: "compare", targets: [`n${pos[j - 1]}`, `n${pos[j]}`], note: `${a[j - 1]} > ${a[j]} — shift it right` });
      steps.push({ action: "swap", targets: [`n${pos[j - 1]}`, `n${pos[j]}`], note: `Move ${a[j]} one slot left` });
      [a[j - 1], a[j]] = [a[j], a[j - 1]];
      [pos[j - 1], pos[j]] = [pos[j], pos[j - 1]];
      j--;
    }
    if (j > 0) steps.push({ action: "compare", targets: [`n${pos[j - 1]}`, `n${pos[j]}`], note: `${a[j - 1]} ≤ ${a[j]} — found its slot` });
    steps.push({ action: "mark", target: `n${keyNode}`, note: `${a[j]} inserted — sorted prefix now length ${i + 1}` });
  }
  return {
    id: "insertion-sort", wing: "sorting", title: "Insertion Sort",
    complexity: { time: "O(n²)", space: "O(1)" },
    description: "Grows a sorted prefix one element at a time, shifting larger elements right until the new element finds its slot — how most people sort a hand of cards.",
    layout: "array", nodes, steps,
  };
}

function quickSort() {
  const values = [6, 2, 8, 4, 9, 1, 5];
  const nodes = arrayNodes(values);
  const a = values.slice();
  const pos = values.map((_, i) => i);
  const steps = [];
  const swap = (i, j, note) => {
    if (i === j) return;
    steps.push({ action: "swap", targets: [`n${pos[i]}`, `n${pos[j]}`], note });
    [a[i], a[j]] = [a[j], a[i]];
    [pos[i], pos[j]] = [pos[j], pos[i]];
  };
  function qs(lo, hi) {
    if (lo >= hi) {
      if (lo === hi) steps.push({ action: "mark", target: `n${pos[lo]}`, note: `${a[lo]} — single element, already sorted` });
      return;
    }
    const pivot = a[hi];
    steps.push({ action: "highlight", target: `n${pos[hi]}`, note: `Pivot: ${pivot} (last element of this range)` });
    let i = lo - 1;
    for (let j = lo; j < hi; j++) {
      steps.push({ action: "compare", targets: [`n${pos[j]}`, `n${pos[hi]}`], note: `Is ${a[j]} < pivot ${pivot}?` });
      if (a[j] < pivot) { i++; swap(i, j, `${a[j]} < ${pivot} — move it into the left partition`); }
    }
    swap(i + 1, hi, `Place pivot ${pivot} between the partitions`);
    steps.push({ action: "mark", target: `n${pos[i + 1]}`, note: `${pivot} is in its final position` });
    qs(lo, i);
    qs(i + 2, hi);
  }
  qs(0, a.length - 1);
  return {
    id: "quick-sort", wing: "sorting", title: "Quick Sort",
    complexity: { time: "O(n log n) average, O(n²) worst", space: "O(log n)" },
    description: "Picks a pivot, partitions the array into smaller-than and larger-than halves, then recursively sorts each half. Each pivot lands in its final position immediately.",
    layout: "array", nodes, steps,
  };
}

// ---------- SEARCHING ----------
function binarySearch() {
  const values = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
  const target = 23;
  const nodes = arrayNodes(values, 1.4);
  const steps = [];
  let lo = 0, hi = values.length - 1;
  steps.push({ action: "highlight", target: `n${values.indexOf(target)}`, note: `Searching for ${target} in a sorted array` });
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    steps.push({ action: "compare", targets: [`n${lo}`, `n${hi}`], note: `Search window: index ${lo}–${hi}` });
    steps.push({ action: "visit", target: `n${mid}`, note: `Check the middle: ${values[mid]}` });
    if (values[mid] === target) {
      steps.push({ action: "mark", target: `n${mid}`, note: `${values[mid]} = ${target} — found in ${steps.filter(s => s.action === "visit").length} probes` });
      break;
    } else if (values[mid] < target) {
      for (let k = lo; k <= mid; k++) steps.push({ action: "dim", target: `n${k}`, note: `${values[mid]} < ${target} — discard the left half` });
      lo = mid + 1;
    } else {
      for (let k = mid; k <= hi; k++) steps.push({ action: "dim", target: `n${k}`, note: `${values[mid]} > ${target} — discard the right half` });
      hi = mid - 1;
    }
  }
  return {
    id: "binary-search", wing: "searching", title: "Binary Search",
    complexity: { time: "O(log n)", space: "O(1)" },
    description: "Halves a sorted search window on every probe. Ten elements need at most four probes; a billion need only thirty.",
    layout: "array", nodes, steps,
  };
}

// ---------- GRAPH TRAVERSAL ----------
const GRAPH = {
  nodes: {
    A: [0, 0, 0], B: [-2.4, 0, -2.2], C: [2.4, 0, -2.2],
    D: [-3.6, 0, 1.4], E: [0, 0, 2.8], F: [3.6, 0, 1.4], G: [0, 0, -4.4],
  },
  edges: [
    ["A", "B", 4], ["A", "C", 2], ["A", "E", 7], ["B", "D", 3],
    ["B", "G", 6], ["C", "F", 3], ["C", "G", 5], ["D", "E", 2], ["E", "F", 4],
  ],
};
const graphNodes = (labels = {}) =>
  Object.entries(GRAPH.nodes).map(([id, position]) => ({ id, position, label: labels[id] ?? id }));
const graphEdges = (withWeights) =>
  GRAPH.edges.map(([from, to, weight]) => (withWeights ? { from, to, weight } : { from, to }));

function bfs() {
  const steps = [];
  const adj = {};
  for (const [u, v] of GRAPH.edges) { (adj[u] ??= []).push(v); (adj[v] ??= []).push(u); }
  for (const k of Object.keys(adj)) adj[k].sort();
  const visited = new Set(["A"]);
  const queue = ["A"];
  steps.push({ action: "visit", target: "A", note: "Start at A — enqueue it. Queue: [A]" });
  while (queue.length) {
    const u = queue.shift();
    steps.push({ action: "highlight", target: u, note: `Dequeue ${u} — explore its neighbors` });
    for (const v of adj[u]) {
      if (!visited.has(v)) {
        visited.add(v);
        queue.push(v);
        steps.push({ action: "traverse", edge: [u, v], note: `${u} → ${v}: unvisited — enqueue. Queue: [${queue.join(", ")}]` });
        steps.push({ action: "visit", target: v, note: `${v} discovered at distance from A via ${u}` });
      }
    }
    steps.push({ action: "mark", target: u, note: `${u} fully explored` });
  }
  return {
    id: "bfs", wing: "graph-traversal", title: "Breadth-First Search",
    complexity: { time: "O(V + E)", space: "O(V)" },
    description: "Explores the graph in rings: all nodes one hop away, then two hops, then three. A queue guarantees the frontier expands evenly — which is why BFS finds shortest paths in unweighted graphs.",
    nodes: graphNodes(), edges: graphEdges(false), steps,
  };
}

function dijkstra() {
  const steps = [];
  const adj = {};
  for (const [u, v, w] of GRAPH.edges) { (adj[u] ??= []).push([v, w]); (adj[v] ??= []).push([u, w]); }
  const dist = { A: 0 };
  const done = new Set();
  steps.push({ action: "set", target: "A", value: "A:0", note: "Source A gets distance 0; everything else is ∞" });
  while (true) {
    let u = null;
    for (const k of Object.keys(dist)) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
    if (u === null) break;
    done.add(u);
    steps.push({ action: "visit", target: u, note: `Pop ${u} (distance ${dist[u]}) — the closest unsettled node` });
    for (const [v, w] of adj[u].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (done.has(v)) continue;
      const nd = dist[u] + w;
      steps.push({ action: "relax", edge: [u, v], note: `Relax ${u}→${v}: ${dist[u]} + ${w} = ${nd} vs ${v in dist ? dist[v] : "∞"}` });
      if (!(v in dist) || nd < dist[v]) {
        dist[v] = nd;
        steps.push({ action: "set", target: v, value: `${v}:${nd}`, note: `Shorter path found — distance to ${v} is now ${nd}` });
      }
    }
    steps.push({ action: "mark", target: u, note: `${u} settled at distance ${dist[u]} — it will never improve` });
  }
  return {
    id: "dijkstra", wing: "graph-traversal", title: "Dijkstra's Algorithm",
    complexity: { time: "O((V + E) log V)", space: "O(V)" },
    description: "Finds shortest paths from a source by always settling the closest unsettled node, then relaxing its edges. Greedy, and provably correct when weights are non-negative.",
    nodes: graphNodes({ A: "A:0", B: "B:∞", C: "C:∞", D: "D:∞", E: "E:∞", F: "F:∞", G: "G:∞" }),
    edges: graphEdges(true), steps,
  };
}

// ---------- TREES ----------
function bstInsert() {
  const seq = [50, 30, 70, 20, 40, 60, 80, 35];
  // Precompute final positions with a classic level-based layout.
  const nodesMap = new Map();
  const edges = [];
  const steps = [];
  const place = (val, depth, x) => {
    const id = `v${val}`;
    nodesMap.set(id, { id, position: [x, 3.6 - depth * 1.5, 0], label: String(val), value: val, hidden: val !== seq[0] });
    return id;
  };
  // Build tree structure first to know positions
  const root = { val: seq[0], left: null, right: null };
  for (const v of seq.slice(1)) {
    let cur = root;
    while (true) {
      if (v < cur.val) { if (!cur.left) { cur.left = { val: v, left: null, right: null }; break; } cur = cur.left; }
      else { if (!cur.right) { cur.right = { val: v, left: null, right: null }; break; } cur = cur.right; }
    }
  }
  (function layout(node, depth, x, spread) {
    if (!node) return;
    place(node.val, depth, x);
    layout(node.left, depth + 1, x - spread, spread / 2);
    layout(node.right, depth + 1, x + spread, spread / 2);
  })(root, 0, 0, 3.2);

  steps.push({ action: "visit", target: `v${seq[0]}`, note: `${seq[0]} is the first insert — it becomes the root` });
  steps.push({ action: "mark", target: `v${seq[0]}`, note: `Root placed` });
  for (const v of seq.slice(1)) {
    let cur = root;
    while (true) {
      steps.push({ action: "compare", targets: [`v${v}`, `v${cur.val}`], note: `Insert ${v}: compare with ${cur.val} — go ${v < cur.val ? "left" : "right"}` });
      const next = v < cur.val ? cur.left : cur.right;
      if (next.val === v) {
        edges.push({ from: `v${cur.val}`, to: `v${v}`, hidden: true });
        steps.push({ action: "insert", target: `v${v}`, note: `Empty ${v < cur.val ? "left" : "right"} child — insert ${v} here` });
        steps.push({ action: "link", edge: [`v${cur.val}`, `v${v}`], note: `${v} attached under ${cur.val}` });
        steps.push({ action: "mark", target: `v${v}`, note: `${v} placed at depth ${nodePath(root, v)}` });
        break;
      }
      cur = next;
    }
  }
  function nodePath(node, v, d = 0) {
    if (node.val === v) return d;
    return nodePath(v < node.val ? node.left : node.right, v, d + 1);
  }
  return {
    id: "bst-insert", wing: "trees", title: "Binary Search Tree — Insertion",
    complexity: { time: "O(h), O(log n) if balanced", space: "O(h)" },
    description: "Each insert walks from the root — left if smaller, right if larger — until it finds an empty slot. The tree's shape depends entirely on insertion order.",
    layout: "tree", nodes: [...nodesMap.values()], edges, steps,
  };
}

// ---------- HASHING ----------
function separateChaining() {
  const B = 5;
  const keys = [12, 7, 22, 3, 17, 9, 27];
  const nodes = [];
  const edges = [];
  const steps = [];
  for (let b = 0; b < B; b++) {
    nodes.push({ id: `b${b}`, position: [(b - (B - 1) / 2) * 2.2, 2.2, 0], label: `[${b}]`, value: 2 });
  }
  const chains = Array.from({ length: B }, () => []);
  for (const k of keys) {
    const h = k % B;
    const id = `k${k}`;
    const depth = chains[h].length;
    nodes.push({ id, position: [(h - (B - 1) / 2) * 2.2, 0.8 - depth * 1.3, 0], label: String(k), hidden: true });
    steps.push({ action: "highlight", target: `b${h}`, note: `hash(${k}) = ${k} mod ${B} = ${h}` });
    const parent = depth === 0 ? `b${h}` : `k${chains[h][depth - 1]}`;
    edges.push({ from: parent, to: id, hidden: true, directed: true });
    steps.push({ action: "insert", target: id, note: depth === 0 ? `Bucket ${h} is empty — ${k} starts the chain` : `Collision! Bucket ${h} already holds ${chains[h].join(" → ")} — append ${k}` });
    steps.push({ action: "link", edge: [parent, id], note: `${k} linked into bucket ${h}'s chain (length ${depth + 1})` });
    chains[h].push(k);
  }
  const longest = Math.max(...chains.map((c) => c.length));
  steps.push({ action: "clear", note: `All ${keys.length} keys stored. Longest chain: ${longest} — lookups cost O(chain length), which stays O(1) on average if the table is resized` });
  return {
    id: "separate-chaining", wing: "hashing", title: "Hash Table — Separate Chaining",
    complexity: { time: "O(1) average, O(n) worst", space: "O(n)" },
    description: "Each bucket holds a linked list. Colliding keys simply chain below one another — simple, and it never runs out of room, at the cost of pointer-chasing on hot buckets.",
    nodes, edges, steps,
  };
}

// ---------- DISTRIBUTED SYSTEMS ----------
function gossip() {
  const N = 8;
  const nodes = [];
  const edges = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    nodes.push({ id: `p${i}`, position: [Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4], label: `P${i}` });
  }
  // fully-informed edges get added as gossip happens; declare the pairs used
  const rounds = [
    [[0, 3]],
    [[0, 5], [3, 1]],
    [[0, 2], [5, 7], [3, 6], [1, 4]],
  ];
  const seen = new Set();
  for (const round of rounds) for (const [u, v] of round) {
    const key = u < v ? `${u}-${v}` : `${v}-${u}`;
    if (!seen.has(key)) { seen.add(key); edges.push({ from: `p${u}`, to: `p${v}` }); }
  }
  const steps = [];
  steps.push({ action: "visit", target: "p0", note: "P0 learns a new value — it alone holds the rumor" });
  rounds.forEach((round, r) => {
    for (const [u, v] of round) {
      steps.push({ action: "traverse", edge: [`p${u}`, `p${v}`], note: `Round ${r + 1}: P${u} gossips to a random peer, P${v}` });
      steps.push({ action: "visit", target: `p${v}`, note: `P${v} is now infected — informed nodes roughly double each round` });
    }
  });
  for (let i = 0; i < N; i++) steps.push({ action: "mark", target: `p${i}`, note: `All ${N} nodes converged in ${rounds.length} rounds ≈ log₂(${N})` });
  return {
    id: "gossip-protocol", wing: "distributed-systems", title: "Gossip Protocol",
    complexity: { time: "O(log n) rounds", space: "O(1) per node" },
    description: "Every round, each informed node tells one random peer. Information spreads like an epidemic — the informed set doubles per round, so the whole cluster converges in about log n rounds with no coordinator.",
    nodes, edges, steps,
  };
}

function leaderElection() {
  // Ring-based (Chang–Roberts style, simplified): highest id wins.
  const ids = [3, 7, 1, 5, 9, 2]; // process ids around the ring
  const N = ids.length;
  const nodes = ids.map((pid, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    return { id: `p${pid}`, position: [Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2], label: `id ${pid}` };
  });
  const edges = ids.map((pid, i) => ({ from: `p${pid}`, to: `p${ids[(i + 1) % N]}`, directed: true }));
  const steps = [];
  steps.push({ action: "highlight", target: "p3", note: "The old leader is gone — process 3 notices and starts an election, passing its id around the ring" });
  let token = 3;
  const i = 0; // index of initiator
  for (let hop = 1; hop <= 2 * N; hop++) {
    const from = ids[(i + hop - 1) % N];
    const to = ids[(i + hop) % N];
    steps.push({ action: "traverse", edge: [`p${from}`, `p${to}`], note: `Token ⟨${token}⟩ travels ${from} → ${to}` });
    if (to === token) break; // the max id sees its own id return — full lap survived
    if (to > token) {
      const prev = token;
      token = to;
      steps.push({ action: "visit", target: `p${to}`, note: `${to} > ${prev} — ${to} replaces the token with its own id` });
    } else {
      steps.push({ action: "compare", targets: [`p${to}`, `p${token}`], note: `${to} < ${token} — ${to} forwards the token unchanged` });
    }
  }
  // token has circled back to the max
  steps.push({ action: "mark", target: `p9`, note: "Id 9 receives its own id back — it has beaten every process on the ring" });
  steps.push({ action: "set", target: "p9", value: "LEADER 9", note: "Process 9 declares itself leader and announces it around the ring" });
  return {
    id: "leader-election", wing: "distributed-systems", title: "Ring Leader Election",
    complexity: { time: "O(n²) messages worst case", space: "O(1) per node" },
    description: "Processes pass candidate ids around a ring; each node forwards the larger of its own id and the incoming one. When an id survives a full lap, that process becomes leader — no central coordinator needed.",
    nodes, edges, steps,
  };
}

// ---------- write everything ----------
console.log("Generating seed exhibits:");
write("sorting", "bubble-sort", bubbleSort());
write("sorting", "insertion-sort", insertionSort());
write("sorting", "quick-sort", quickSort());
write("searching", "binary-search", binarySearch());
write("graph-traversal", "bfs", bfs());
write("graph-traversal", "dijkstra", dijkstra());
write("trees", "bst-insert", bstInsert());
write("hashing", "separate-chaining", separateChaining());
write("distributed-systems", "gossip-protocol", gossip());
write("distributed-systems", "leader-election", leaderElection());

// manifest
const manifest = { exhibits: [] };
for (const wing of fs.readdirSync(OUT).sort()) {
  const dir = path.join(OUT, wing);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    manifest.exhibits.push(`${wing}/${f}`);
  }
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`  wrote exhibits/manifest.json (${manifest.exhibits.length} exhibits)`);
