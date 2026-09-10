# Contributing an exhibit

You do not need to know Three.js. You do not need to write any JavaScript. **An exhibit is one JSON file.** The renderer reads it and builds the 3D animation for you.

This guide walks you from zero to an open PR.

## The 5-minute version

1. Fork and clone the repo.
2. Copy an existing exhibit that looks like yours (a sorting one if yours is array-based, `bfs.json` if it's graph-based, `bst-insert.json` if it's a tree).
3. Edit the copy: your nodes, your edges, your steps.
4. `node validate.js exhibits/<wing>/<your-file>.json` — fix anything it complains about.
5. Add your file to `exhibits/manifest.json`.
6. `npx serve` (or `python3 -m http.server`), open the site, click your exhibit, watch it run.
7. Open a PR.

## Anatomy of an exhibit

Every exhibit file has the same shape:

```json
{
  "id": "dijkstra",
  "wing": "graph-traversal",
  "title": "Dijkstra's Algorithm",
  "complexity": { "time": "O((V+E) log V)", "space": "O(V)" },
  "description": "Finds shortest paths from a source node using a priority queue.",
  "layout": "graph",
  "nodes": [
    { "id": "A", "position": [0, 0, 0], "label": "A" },
    { "id": "B", "position": [2, 0, 1], "label": "B" }
  ],
  "edges": [
    { "from": "A", "to": "B", "weight": 4 }
  ],
  "steps": [
    { "action": "visit", "target": "A", "note": "Start node, distance 0" },
    { "action": "relax", "edge": ["A", "B"], "note": "Distance to B updated to 4" }
  ]
}
```

Field by field:

| Field | What it is |
|---|---|
| `id` | Kebab-case, unique, **must match the filename** (`dijkstra.json` → `"dijkstra"`). |
| `wing` | Which zone of the zoo it lives in. One of: `sorting`, `searching`, `graph-traversal`, `trees`, `hashing`, `dynamic-programming`, `distributed-systems`, `string-algorithms`, `compression`. Put the file in the matching folder: `exhibits/<wing>/<id>.json`. |
| `title` | Shown on the placard. |
| `complexity` | `time` and `space`, both strings — write whatever notation is honest (`"O(n log n) average, O(n²) worst"` is fine). |
| `description` | One or two sentences. What does a visitor learn watching this? Max 400 characters. |
| `layout` | Rendering hint. `"array"` draws nodes as blocks whose **height comes from `value`** — right for sorting/searching. `"graph"` (default) and `"tree"` draw labeled spheres. |
| `nodes` | The things on stage. Each needs an `id` and a `position` of `[x, y, z]`. |
| `edges` | Lines between nodes. Optional `weight` (rendered as a floating label), `directed: true` (adds an arrowhead), `hidden: true` (starts invisible — reveal it later with `link`). |
| `steps` | The animation, in order. **Every step needs a `note`** — it's the caption visitors read while the step plays. |

### Positions

Units are roughly "one node-width apart ≈ 1.2–1.5". Keep everything within about 6 units of the origin `[0, 0, 0]` — the camera frames the exhibit automatically, but tight layouts read better on video. Y is up. For arrays, put everything at `y = 0` and space along X. For trees, root at the top (positive Y), children below.

### The step vocabulary

These are all the actions the renderer understands. If your algorithm can be told with these verbs, it can live in the zoo.

| Action | Fields | What visitors see |
|---|---|---|
| `visit` | `target` | Node lights up amber and stays lit. Use for "the algorithm is here / has seen this". |
| `highlight` | `target` | One red pulse, then fades. Use for "pay attention to this" without changing its state. |
| `compare` | `targets: [a, b]` | Both nodes pulse red together. |
| `swap` | `targets: [a, b]` | The two nodes physically trade places along an arc. |
| `move` | `target`, `position` | Node glides to a new position. |
| `set` | `target`, `value` | Node's label changes (e.g. updating a distance from `∞` to `4`). |
| `traverse` | `edge: [from, to]` | Edge lights up amber and stays lit. Use for "this edge is now part of the answer / the frontier". |
| `relax` | `edge: [from, to]` | Edge pulses red once. Use for "we considered this edge". |
| `insert` | `target` | A node that was declared with `hidden: true` scales into existence. |
| `remove` | `target` | Node shrinks away and disappears. |
| `link` | `edge: [from, to]` | An edge declared with `hidden: true` appears. |
| `unlink` | `edge: [from, to]` | Edge disappears. |
| `mark` | `target` | Node turns the wing's color, permanently. Use for "settled / final / done". |
| `dim` | `target` | Node fades to near-invisible. Use for "eliminated from consideration" (binary search discarding half the array). |
| `clear` | — | Resets every node except `mark`ed ones back to base. Good as a closing beat. |

Two conventions that make exhibits read well:

- **Amber means progress, red means attention, wing-color means done.** `visit` as you go, `compare`/`relax` when weighing options, `mark` when something is final.
- **Notes narrate, they don't label.** `"6 > 4 — swap"` beats `"swap step"`. Include the actual values; the note is doing the teaching.

### Generating steps instead of hand-writing them

For anything beyond ~20 steps, write a tiny script that *runs the real algorithm* and prints the steps — that way the trace is provably correct. Every seed exhibit in this repo was made that way: see `scripts/generate-seeds.js` for ten worked examples you can crib from. Hand-tracing quicksort is how bugs get into educational material.

## Validate before you PR

```
node validate.js exhibits/graph-traversal/dijkstra.json   # just yours
node validate.js                                          # the whole zoo + manifest
```

The validator is strict on purpose and its errors say exactly what to fix — a typo'd node id in a step, a step referencing an undeclared edge, a file not listed in the manifest. CI runs the same script, so if it passes locally it passes in the PR.

## Test it visually

The site loads exhibit files with `fetch`, so it needs a local server (opening `index.html` from disk won't work):

```
npx serve          # or: python3 -m http.server 8000
```

Open the printed URL, find your exhibit in the index on the left, and watch it end to end at 1× speed. Check:

- Does every step's caption make sense on its own?
- Does the final state look finished (final elements `mark`ed)?
- Nothing overlapping or flying off-screen?

## PR checklist

- [ ] File is at `exhibits/<wing>/<id>.json` and `id` matches the filename
- [ ] Listed in `exhibits/manifest.json`
- [ ] `node validate.js` passes with no errors
- [ ] Watched it play end to end locally
- [ ] Description says what the algorithm *does*, notes say what each step *means*

One exhibit per PR keeps review fast.

## What makes a good exhibit

Small inputs. Six to ten elements is almost always enough to show the idea — 50 bars of bubble sort is a screensaver, 8 bars is a lesson. Prefer inputs that exercise the interesting cases (a collision for hashing, a re-relaxed edge for Dijkstra, an unbalanced insert order for a BST).

## Adding a capability instead of an exhibit

If your algorithm genuinely can't be expressed in the step vocabulary (say, you need a 2D grid for dynamic programming tables), open an issue proposing the new action or layout *first*. Renderer changes affect every exhibit, so they get more scrutiny than JSON — but the vocabulary is meant to grow.
