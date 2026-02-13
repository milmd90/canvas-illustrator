# Designs

Each design lives in its own folder and exposes the same interface:

- **MakePoster()** – builds the design data (called once after init)
- **Render()** – draws the design (called on each frame / camera update)

To switch designs, change the script tag in `src/index.html` to load the desired design’s `index.js`:

- `javascript/design1/index.js` – L-system arcs on a grid background
- `javascript/design2/index.js` – random lines and arcs on a grey panel
- `javascript/design3/index.js` – directory tree from `design3/directory_map.json`

Designs rely on globals from `main.js` and `index.js` (e.g. `CanvasWidth`, `Camera`, `BackContextHandle`, `UpdateRender`).
