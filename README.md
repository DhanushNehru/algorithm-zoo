# Algorithm Zoo

**Every algorithm here is a JSON file. Add yours.**

An interactive 3D zoo of classic algorithms and data structures, built with Three.js. Each exhibit shows an algorithm actually running, step by step — quicksort physically partitioning blocks, Dijkstra's frontier lighting up a graph, a BST growing insert by insert — with a museum placard explaining what you're watching.

The renderer is fully schema-driven: it knows nothing about any particular algorithm. It reads a JSON file describing nodes, edges, and a sequence of steps, and animates it. That means contributing a new algorithm is writing **one JSON file** — no Three.js, no JavaScript. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Run it

```
git clone <this repo>
cd algorithm-zoo
npx serve            # or: python3 -m http.server 8000
```

Open the printed URL. Pick an exhibit from the index, press play. Space toggles play/pause, ←/→ step, Esc returns to the overview.

No build step, no dependencies to install — Three.js loads from a CDN via an import map.

## What's in the zoo at launch

Ten exhibits across five wings:

| Wing | Exhibits |
|---|---|
| Sorting | Bubble Sort, Insertion Sort, Quick Sort |
| Searching | Binary Search |
| Graph Traversal | BFS, Dijkstra's Algorithm |
| Trees | BST Insertion |
| Hashing | Separate Chaining |
| Distributed Systems | Gossip Protocol, Ring Leader Election |

Four more wings — Dynamic Programming, String Algorithms, Compression, and the rest of every wing above — are standing empty with the lights dimmed. That's the invitation.

## Repo map

```
index.html                  the site
css/style.css
js/main.js                  zoo layout, camera, UI — never touches algorithm data
js/renderer.js              the schema-driven renderer (the actual product)
exhibits/
  manifest.json             list of exhibit files the site loads
  <wing>/<id>.json          one file per exhibit
schema/exhibit.schema.json  JSON Schema for editor autocomplete/validation
validate.js                 zero-dep validator — run before every PR (CI runs it too)
scripts/generate-seeds.js   how the seed exhibits were generated (run the real
                            algorithm, record its trace) — crib from this
```

## Design rules that keep this maintainable

1. **The renderer never learns about algorithms.** If an exhibit needs special-case code in `renderer.js`, the exhibit is wrong or the step vocabulary needs a (carefully reviewed) new verb.
2. **Steps are generated, not hand-traced**, wherever possible. `scripts/generate-seeds.js` runs each algorithm for real and records the trace, so the animation can't lie.
3. **The validator is the gate.** If `node validate.js` passes, the site can render your file. CI runs it on every PR.

## License

MIT — see [LICENSE](LICENSE).
